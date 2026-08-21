/* Panorama Finanzas <-> Panorama Café Core
   Sincronización única del estado financiero.
   - localStorage conserva el estado inmediato.
   - Supabase conserva una única fila: finanzas-main.
   - La fila se crea si no existe y después siempre se actualiza.
   - Los movimientos propios de Finanzas se registran una sola vez.
*/
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key){console.warn('Panorama Core: missing config');return;}
  await (window.PanoramaAuth?.ready||Promise.resolve());

  const api=cfg.url+'/rest/v1/';
  const STORAGE='panorama_finanzas_pf_v1_010';
  const STATE_ID='finanzas-main';
  let syncingPromise=null;
  let lastSerialized=null;

  function headers(extra={}){
    const base=window.PanoramaAuth?.headers?.()||{
      apikey:cfg.key,
      Authorization:'Bearer '+cfg.key,
      'Content-Type':'application/json'
    };
    return {...base,...extra};
  }

  function readState(){
    try{return JSON.parse(localStorage.getItem(STORAGE)||'{}');}
    catch(_){return {};}
  }

  function writeState(state){
    localStorage.setItem(STORAGE,JSON.stringify(state));
    lastSerialized=null;
    refreshNegativeBalanceNotice();
  }

  async function request(path,opts={}){
    const r=await fetch(api+path,{...opts,headers:headers(opts.headers||{})});
    const text=await r.text();
    if(!r.ok)throw new Error(text||r.statusText);
    return text?JSON.parse(text):null;
  }

  async function readRemoteState(){
    const rows=await request('panorama_finanzas_state?id=eq.'+encodeURIComponent(STATE_ID)+'&select=data,updated_at');
    return rows?.[0]||null;
  }

  async function ensureRemoteState(data){
    const current=await readRemoteState();
    if(current)return current;
    const rows=await request('panorama_finanzas_state',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({id:STATE_ID,data})});
    return rows?.[0]||null;
  }

  async function publish(state){
    const data=state||readState();
    await ensureRemoteState(data);
    const rows=await request('panorama_finanzas_state?id=eq.'+encodeURIComponent(STATE_ID),{
      method:'PATCH',
      headers:{Prefer:'return=representation'},
      body:JSON.stringify({data})
    });
    return rows?.[0]||null;
  }

  function syncNow(state){
    if(syncingPromise)return syncingPromise;
    const snapshot=state||readState();
    const raw=JSON.stringify(snapshot);
    syncingPromise=(async()=>{
      try{
        await publish(snapshot);
        lastSerialized=raw;
        window.dispatchEvent(new CustomEvent('panorama-core-finance-synced'));
        return true;
      }catch(e){
        console.warn('Panorama Finanzas: state sync failed',e);
        return false;
      }finally{syncingPromise=null;}
    })();
    return syncingPromise;
  }

  window.PanoramaCoreFinance={
    employees(){return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
    paymentHistory(){return request('personal_payment_records?select=*&order=created_at.desc');},
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({
        p_payment_request_id:requestRow.id,
        p_financial_movement_id:String(movementId),
        p_financial_account_id:String(accountId),
        p_amount:Number(requestRow.amount),
        p_notes:notes
      })});
    }
  };

  async function bootstrap(){
    try{
      const local=readState();
      const remote=await readRemoteState();
      if(remote?.data&&Object.keys(remote.data).length){
        if(!Object.keys(local).length){
          localStorage.setItem(STORAGE,JSON.stringify(remote.data));
          lastSerialized=JSON.stringify(remote.data);
          location.reload();
          return;
        }
        lastSerialized=JSON.stringify(local);
        return;
      }
      if(Object.keys(local).length)await syncNow(local);
    }catch(e){console.warn('Panorama Finanzas: state bootstrap failed',e);}
  }

  function uid(){return crypto?.randomUUID?.()||('pf-'+Date.now()+'-'+Math.random().toString(16).slice(2));}
  function getAccount(state,id){return (state.accounts||[]).find(a=>String(a.id)===String(id));}

  function addNegativeObservation(state,account,before,amount,context){
    if(Number(account.balance||0)>=0)return;
    state.financialAlerts=Array.isArray(state.financialAlerts)?state.financialAlerts:[];
    state.financialAlerts.unshift({id:uid(),type:'NEGATIVE_BALANCE',accountId:account.id,accountName:account.name||account.id,before:Number(before||0),amount:Number(amount||0),after:Number(account.balance||0),context,created:Date.now(),resolved:false});
    state.financialAlerts=state.financialAlerts.slice(0,200);
  }

  function refreshNegativeBalanceNotice(){
    const neg=(readState().accounts||[]).filter(a=>Number(a.balance||0)<0);
    let box=document.getElementById('panoramaNegativeBalanceNotice');
    if(!neg.length){box?.remove();return;}
    if(!box){box=document.createElement('div');box.id='panoramaNegativeBalanceNotice';document.body.appendChild(box);}
    box.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;max-width:360px;padding:12px 14px;background:#fff7ed;border:1px solid #f2c98d;border-radius:10px;color:#7c4a03;font:12px Arial,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.14)';
    box.innerHTML='<b>Observación financiera</b><br>'+neg.map(a=>String(a.name||a.id)+': $'+Number(a.balance).toFixed(2)).join('<br>')+'<br><span style="color:#8a6d4b">El saldo negativo no bloquea operaciones.</span>';
  }

  async function closeAndReload(state){
    const ok=await syncNow(state);
    if(!ok){alert('El movimiento quedó guardado localmente, pero no se pudo sincronizar. No se recargará para proteger los datos.');return;}
    document.querySelector('.modal.open')?.classList.remove('open');
    location.reload();
  }

  document.addEventListener('submit',async ev=>{
    const form=ev.target;
    if(!(form instanceof HTMLFormElement)||!['movementForm','payrollPaymentForm','corePayrollPaymentForm'].includes(form.id))return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    try{
      const data=new FormData(form),state=readState();
      if(form.id==='movementForm'){
        const amount=Number(data.get('amount'));
        if(!Number.isFinite(amount)||amount<=0){alert('Revisa el importe.');return;}
        if(data.has('from')&&data.has('to')){
          const from=getAccount(state,data.get('from')),to=getAccount(state,data.get('to'));
          if(!from||!to||from.id===to.id){alert('Revisa origen, destino e importe.');return;}
          const before=Number(from.balance||0);
          from.balance=Number((before-amount).toFixed(2));
          to.balance=Number((Number(to.balance||0)+amount).toFixed(2));
          state.moves=Array.isArray(state.moves)?state.moves:[];
          state.moves.push({id:uid(),created:Date.now(),origin:'manual',type:'transferencia',date:data.get('date')||'',amount,concept:'Transferencia',category:'',from:from.id,to:to.id,account:from.id,note:data.get('note')||''});
          addNegativeObservation(state,from,before,amount,'Transferencia');
          writeState(state);await closeAndReload(state);return;
        }
        const acc=getAccount(state,data.get('account'));
        if(!acc){alert('Revisa la cuenta.');return;}
        const isOut=data.has('category'),before=Number(acc.balance||0);
        acc.balance=Number((before+(isOut?-amount:amount)).toFixed(2));
        state.moves=Array.isArray(state.moves)?state.moves:[];
        state.moves.push({id:uid(),created:Date.now(),origin:data.get('origin')||'manual',externalId:data.get('externalId')||'',type:isOut?'salida':'entrada',date:data.get('date')||'',amount,concept:data.get('note')||(isOut?'Salida manual':'Entrada manual'),category:data.get('category')||'',from:isOut?acc.id:null,to:isOut?null:acc.id,account:acc.id,note:data.get('note')||''});
        if(isOut)addNegativeObservation(state,acc,before,amount,'Salida manual');
        writeState(state);await closeAndReload(state);return;
      }
      if(form.id==='payrollPaymentForm'){
        const amount=Number(data.get('amount')),acc=getAccount(state,data.get('account')),employee=(state.payrollEmployees||[]).find(e=>String(e.id)===String(data.get('employee')));
        if(!Number.isFinite(amount)||amount<=0||!acc||!employee){alert('Revisa los datos.');return;}
        const before=Number(acc.balance||0),rec={id:uid(),created:Date.now(),employeeId:employee.id,employeeName:employee.name,amount,accountId:acc.id,date:data.get('date')||'',origin:data.get('origin')||'local',externalId:data.get('externalId')||''};
        acc.balance=Number((before-amount).toFixed(2));
        state.payrollPeriods=Array.isArray(state.payrollPeriods)?state.payrollPeriods:[];
        state.moves=Array.isArray(state.moves)?state.moves:[];
        state.payrollPeriods.push(rec);
        state.moves.push({id:uid(),created:Date.now(),origin:'nomina',externalId:rec.externalId,sourceRecordId:rec.id,type:'salida',date:rec.date,amount,concept:'Nómina — '+employee.name,category:'nomina',from:acc.id,to:null,account:acc.id,note:'Pago de nómina'});
        addNegativeObservation(state,acc,before,amount,'Pago de nómina');
        writeState(state);await closeAndReload(state);return;
      }
      const account=getAccount(state,data.get('account')),requestId=form.dataset.requestId;
      if(!account){alert('Selecciona una cuenta.');return;}
      const req=(await window.PanoramaCoreFinance.pending()).find(r=>String(r.id)===String(requestId));
      if(!req){alert('La solicitud ya no está pendiente.');return;}
      const amount=Number(req.amount),before=Number(account.balance||0),movementId=uid(),recordId=uid(),paidAt=new Date(String(data.get('date'))+'T12:00:00').toISOString();
      await window.PanoramaCoreFinance.confirm(req,movementId,account.id,paidAt,data.get('note')||'');
      account.balance=Number((before-amount).toFixed(2));
      state.payrollPeriods=Array.isArray(state.payrollPeriods)?state.payrollPeriods:[];
      state.moves=Array.isArray(state.moves)?state.moves:[];
      state.payrollPeriods.push({id:recordId,created:Date.now(),employeeId:req.employee_id,employeeName:req.employees?.full_name||'Empleado',amount,accountId:account.id,date:data.get('date')||'',origin:'external',externalId:req.id,paidAt});
      state.moves.push({id:movementId,created:Date.now(),origin:'nomina',externalId:req.id,sourceRecordId:recordId,type:'salida',date:data.get('date')||'',amount,concept:'Nómina — '+(req.employees?.full_name||'Empleado'),category:'nomina',from:account.id,to:null,account:account.id,note:data.get('note')||'Pago confirmado desde Panorama Core'});
      addNegativeObservation(state,account,before,amount,'Pago de nómina desde Core');
      writeState(state);await closeAndReload(state);
    }catch(error){
      console.error('Panorama Finanzas: movimiento no registrado',error);
      alert(error?.message||'No fue posible registrar el movimiento.');
    }
  },true);

  window.applyExternalFinancialEvent=function(payload){
    const p=payload||{},state=readState(),acc=getAccount(state,p.accountId),amount=Number(p.amount||0);
    if(!acc)throw new Error('Cuenta no encontrada');
    if(!Number.isFinite(amount)||amount<=0)throw new Error('Importe inválido');
    const before=Number(acc.balance||0);
    acc.balance=Number((before+((p.direction||'out')==='out'?-amount:amount)).toFixed(2));
    if((p.direction||'out')==='out')addNegativeObservation(state,acc,before,amount,'Evento financiero externo');
    writeState(state);syncNow(state);
    return {accountId:acc.id,balance:acc.balance};
  };

  await bootstrap();
  refreshNegativeBalanceNotice();
  setInterval(()=>{
    const state=readState(),raw=JSON.stringify(state);
    if(raw!==lastSerialized)syncNow(state);
  },2000);
  setInterval(refreshNegativeBalanceNotice,3000);
  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();