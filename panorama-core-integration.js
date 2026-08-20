/* Panorama Core integration: Finanzas */
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key){console.warn('Panorama Core: missing config');return;}
  await (window.PanoramaAuth?.ready||Promise.resolve());
  const api=cfg.url+'/rest/v1/';
  async function request(path,opts={}){
    const authHeaders=window.PanoramaAuth?.headers?.()||{apikey:cfg.key,'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json'};
    const response=await fetch(api+path,{...opts,headers:{...authHeaders,...opts.headers}});
    const body=await response.text();
    if(!response.ok)throw new Error(body||response.statusText);
    return body?JSON.parse(body):null;
  }

  window.PanoramaCoreFinance={
    employees(){return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
    paymentHistory(){return request('personal_payment_records?select=*&order=created_at.desc');},
    async confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    }
  };

  const STORAGE='panorama_finanzas_pf_v1_010';
  const STATE_ID='finanzas-main';
  let syncing=false;
  let lastSerialized=null;

  async function readRemoteState(){
    const rows=await request('panorama_finanzas_state?id=eq.'+encodeURIComponent(STATE_ID)+'&select=data,updated_at');
    return rows?.[0]||null;
  }
  async function writeRemoteState(data){
    await request('panorama_finanzas_state',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:STATE_ID,data})});
  }
  async function bootstrapFinanceState(){
    try{
      const remote=await readRemoteState();
      const localRaw=localStorage.getItem(STORAGE);
      if(remote?.data && Object.keys(remote.data).length){
        const remoteRaw=JSON.stringify(remote.data);
        if(!localRaw){
          localStorage.setItem(STORAGE,remoteRaw);
          sessionStorage.setItem('panorama_finanzas_state_restored','1');
          location.reload();
          return;
        }
        try{
          const local=JSON.parse(localRaw);
          const looksDefault=Array.isArray(local.moves)&&local.moves.length===0&&Array.isArray(local.providerPayments)&&local.providerPayments.length===0&&Array.isArray(local.commitmentPayments)&&local.commitmentPayments.length===0&&Array.isArray(local.payrollPeriods)&&local.payrollPeriods.length===0;
          if(looksDefault && sessionStorage.getItem('panorama_finanzas_state_restored')!=='1'){
            localStorage.setItem(STORAGE,remoteRaw);
            sessionStorage.setItem('panorama_finanzas_state_restored','1');
            location.reload();
            return;
          }
        }catch(_){}
        lastSerialized=localStorage.getItem(STORAGE);
      }else if(localRaw){
        await writeRemoteState(JSON.parse(localRaw));
        lastSerialized=localRaw;
      }
    }catch(e){console.warn('Panorama Finanzas: state bootstrap failed',e);}
  }

  function uid(){return globalThis.crypto?.randomUUID?.()||('pf-'+Date.now()+'-'+Math.random().toString(16).slice(2));}
  function readState(){try{return JSON.parse(localStorage.getItem(STORAGE)||'{}')}catch(_){return {}}}
  function writeState(state){localStorage.setItem(STORAGE,JSON.stringify(state));lastSerialized=null;refreshNegativeBalanceNotice();}
  function getLocalAccount(state,id){return (state.accounts||[]).find(a=>String(a.id)===String(id));}
  function addNegativeObservation(state,account,before,amount,context){
    const after=Number(account.balance||0);
    if(after>=0)return;
    state.financialAlerts=Array.isArray(state.financialAlerts)?state.financialAlerts:[];
    state.financialAlerts.unshift({
      id:uid(),type:'NEGATIVE_BALANCE',accountId:account.id,accountName:account.name||account.id,
      before:Number(before||0),amount:Number(amount||0),after,context:context||'Movimiento',created:Date.now(),resolved:false
    });
    state.financialAlerts=state.financialAlerts.slice(0,200);
  }
  function negativeAccounts(state){return (state.accounts||[]).filter(a=>Number(a.balance||0)<0)}
  function refreshNegativeBalanceNotice(){
    const state=readState(),neg=negativeAccounts(state);
    let box=document.getElementById('panoramaNegativeBalanceNotice');
    if(!neg.length){box?.remove();return}
    if(!box){box=document.createElement('div');box.id='panoramaNegativeBalanceNotice';document.body.appendChild(box)}
    box.style.cssText='position:fixed;right:16px;bottom:16px;z-index:9999;max-width:360px;padding:12px 14px;background:#fff7ed;border:1px solid #f2c98d;border-radius:10px;color:#7c4a03;font:12px Arial,sans-serif;box-shadow:0 6px 22px rgba(0,0,0,.14)';
    box.innerHTML='<b>Observación financiera</b><br>'+neg.map(a=>String(a.name||a.id)+': $'+Number(a.balance).toFixed(2)).join('<br>')+'<br><span style="color:#8a6d4b">El saldo negativo no bloquea operaciones.</span>';
  }

  /* Política única: saldo negativo es observación, no criterio de rechazo.
     Se interceptan las rutas actuales antes de sus validadores heredados. */
  document.addEventListener('submit',async ev=>{
    const form=ev.target;
    if(!(form instanceof HTMLFormElement))return;
    const id=form.id;
    if(!['movementForm','payrollPaymentForm','corePayrollPaymentForm'].includes(id))return;
    ev.preventDefault();ev.stopImmediatePropagation();
    try{
      const data=new FormData(form),state=readState();
      if(id==='movementForm'){
        const amount=Number(data.get('amount')),acc=getLocalAccount(state,data.get('account'));
        if(!Number.isFinite(amount)||amount<=0||!acc){alert('Revisa importe y cuenta.');return}
        const type=String(data.get('type')||data.get('movementType')||'').toLowerCase();
        const isOut=type==='salida'||type==='out'||form.querySelector('[name="type"] option:checked')?.textContent?.toLowerCase().includes('salida');
        const before=Number(acc.balance||0);acc.balance=Number((before+(isOut?-amount:amount)).toFixed(2));
        state.moves=Array.isArray(state.moves)?state.moves:[];
        state.moves.push({id:uid(),created:Date.now(),origin:data.get('origin')||'manual',externalId:data.get('externalId')||'',type:isOut?'salida':'entrada',date:data.get('date')||'',amount,concept:data.get('note')||(isOut?'Salida manual':'Entrada manual'),category:data.get('category')||'',from:isOut?acc.id:null,to:isOut?null:acc.id,account:acc.id,note:data.get('note')||''});
        if(isOut)addNegativeObservation(state,acc,before,amount,'Salida manual');
        writeState(state);location.reload();return;
      }
      if(id==='payrollPaymentForm'){
        const amount=Number(data.get('amount')),acc=getLocalAccount(state,data.get('account'));
        const employee=(state.payrollEmployees||[]).find(e=>String(e.id)===String(data.get('employee')));
        if(!Number.isFinite(amount)||amount<=0||!acc||!employee){alert('Revisa los datos.');return}
        const before=Number(acc.balance||0);acc.balance=Number((before-amount).toFixed(2));
        const rec={id:uid(),created:Date.now(),employeeId:employee.id,employeeName:employee.name,amount,accountId:acc.id,date:data.get('date')||'',origin:data.get('origin')||'local',externalId:data.get('externalId')||''};
        state.payrollPeriods=Array.isArray(state.payrollPeriods)?state.payrollPeriods:[];state.moves=Array.isArray(state.moves)?state.moves:[];
        state.payrollPeriods.push(rec);state.moves.push({id:uid(),created:Date.now(),origin:'nomina',externalId:rec.externalId,sourceRecordId:rec.id,type:'salida',date:rec.date,amount,concept:'Nómina — '+employee.name,category:'nomina',from:acc.id,to:null,account:acc.id,note:'Pago de nómina'});
        addNegativeObservation(state,acc,before,amount,'Pago de nómina');writeState(state);location.reload();return;
      }
      const amountFormRequestId=form.dataset.requestId,account=getLocalAccount(state,data.get('account'));
      if(!account){alert('Selecciona una cuenta.');return}
      const pending=await window.PanoramaCoreFinance.pending();
      const req=(pending||[]).find(r=>String(r.id)===String(amountFormRequestId));
      if(!req){alert('La solicitud ya no está pendiente.');return}
      const amount=Number(req.amount),before=Number(account.balance||0),movementId=uid(),recordId=uid(),paidAt=new Date(String(data.get('date'))+'T12:00:00').toISOString();
      const submit=form.querySelector('button[type="submit"]');if(submit)submit.disabled=true;
      await window.PanoramaCoreFinance.confirm(req,movementId,account.id,paidAt,data.get('note')||'');
      account.balance=Number((before-amount).toFixed(2));
      state.payrollPeriods=Array.isArray(state.payrollPeriods)?state.payrollPeriods:[];state.moves=Array.isArray(state.moves)?state.moves:[];
      state.payrollPeriods.push({id:recordId,created:Date.now(),employeeId:req.employee_id,employeeName:req.employees?.full_name||'Empleado',amount,accountId:account.id,date:data.get('date')||'',origin:'external',externalId:req.id,paidAt});
      state.moves.push({id:movementId,created:Date.now(),origin:'nomina',externalId:req.id,sourceRecordId:recordId,type:'salida',date:data.get('date')||'',amount,concept:'Nómina — '+(req.employees?.full_name||'Empleado'),category:'nomina',from:account.id,to:null,account:account.id,note:data.get('note')||'Pago confirmado desde Panorama Core'});
      addNegativeObservation(state,account,before,amount,'Pago de nómina desde Core');writeState(state);location.reload();
    }catch(error){console.error('Panorama Finanzas: movimiento no registrado',error);alert(error?.message||'No fue posible registrar el movimiento.');}
  },true);

  const originalExternal=window.applyExternalFinancialEvent;
  window.applyExternalFinancialEvent=function(payload){
    const p=payload||{},state=readState(),acc=getLocalAccount(state,p.accountId),amount=Number(p.amount||0);
    if(!acc)throw new Error('Cuenta no encontrada');if(!Number.isFinite(amount)||amount<=0)throw new Error('Importe inválido');
    const direction=p.direction||'out',before=Number(acc.balance||0);acc.balance=Number((before+(direction==='out'?-amount:amount)).toFixed(2));
    if(direction==='out')addNegativeObservation(state,acc,before,amount,'Evento financiero externo');writeState(state);
    if(typeof originalExternal==='function'){
      /* La versión heredada puede volver a rechazar saldo negativo; no se delega.
         El evento queda registrado por la ruta común del estado financiero. */
    }
    return {accountId:acc.id,balance:acc.balance};
  };

  await bootstrapFinanceState();
  refreshNegativeBalanceNotice();
  setInterval(async()=>{
    if(syncing)return;
    const raw=localStorage.getItem(STORAGE);
    if(!raw||raw===lastSerialized)return;
    try{syncing=true;await writeRemoteState(JSON.parse(raw));lastSerialized=raw;}
    catch(e){console.warn('Panorama Finanzas: state sync failed',e);}
    finally{syncing=false;}
  },2000);
  setInterval(refreshNegativeBalanceNotice,3000);
  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();