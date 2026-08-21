/* Panorama Finanzas — contrato de integración */
(function(){
  const cfg=window.PANORAMA_SUPABASE,ROW_ID='finanzas-main';
  if(!cfg?.url||!cfg?.key){console.error('Panorama Finanzas: falta la configuración de Supabase.');return;}
  const base=cfg.url+'/rest/v1/',headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
  let busy=false,lastRemoteAt='';
  const valid=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>0;
  async function request(path,options={}){const r=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})}});const text=await r.text();if(!r.ok)throw new Error(text||r.statusText);return text?JSON.parse(text):null;}
  async function syncState(state){if(busy||!valid(state))return {ok:false,skipped:true};busy=true;try{const r=await fetch(base+'panorama_finanzas_state?on_conflict=id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:ROW_ID,data:state})});const raw=await r.text();if(!r.ok)throw new Error(raw||r.statusText);const row=raw?JSON.parse(raw)[0]||null:null;lastRemoteAt=row?.updated_at||lastRemoteAt;return {ok:true,updatedAt:lastRemoteAt};}catch(error){console.warn('Panorama Finanzas: no se pudo sincronizar.',error);return {ok:false,error};}finally{busy=false;}}
  function isPersonalMove(m){return m&&((m.linkedSource==='panorama-personal')||String(m.origin||'')==='panorama-personal'||(m.sourceRecordId&&m.personalPaymentId));}
  async function reconcilePersonalPayments(state){
    const payments=await request('panorama_payroll_payments?select=*&order=paid_date.asc,created_at.asc');
    const activePayments=Array.isArray(payments)?payments:[];
    const activeIds=new Set(activePayments.map(p=>String(p.id)));
    state.moves=Array.isArray(state.moves)?state.moves:[];state.accounts=Array.isArray(state.accounts)?state.accounts:[];
    let changed=false,imported=[],removed=[];
    const surviving=[];
    for(const m of state.moves){
      const sourceId=String(m.sourceRecordId||m.personalPaymentId||'');
      if(isPersonalMove(m)&&sourceId&&!activeIds.has(sourceId)){
        const accountId=m.account||m.from;
        const account=state.accounts.find(a=>a.id===accountId);
        if(account)account.balance=Number(account.balance||0)+Number(m.amount||0);
        changed=true;removed.push(m);continue;
      }
      surviving.push(m);
    }
    state.moves=surviving;
    for(const p of activePayments){
      const existing=state.moves.find(m=>String(m.sourceRecordId||m.personalPaymentId||'')===String(p.id));
      if(existing)continue;
      const accountId=state.accounts.some(a=>a.id===p.account)?p.account:(state.accounts.some(a=>a.id==='principal')?'principal':state.accounts[0]?.id);
      if(!accountId)continue;
      const account=state.accounts.find(a=>a.id===accountId),amount=Number(p.amount||0);if(!Number.isFinite(amount)||amount<0)continue;
      const period=p.period_start&&p.period_end?(p.period_start+' al '+p.period_end):'';
      const move={id:'personal-'+p.id,to:null,from:accountId,date:p.paid_date,type:'salida',amount,origin:'panorama-personal',account:accountId,concept:'Nómina — '+(p.employee_name||'Empleado'),note:[p.note,period].filter(Boolean).join(' · '),category:'nomina',created:Date.now(),externalId:String(p.id),sourceRecordId:String(p.id),personalPaymentId:String(p.id),employeeId:p.employee_id||null,employeeName:p.employee_name||'Empleado',periodStart:p.period_start||null,periodEnd:p.period_end||null,linkedSource:'panorama-personal'};
      state.moves.push(move);account.balance=Number(account.balance||0)-amount;changed=true;imported.push(move);
    }
    if(changed)window.dispatchEvent(new CustomEvent('panorama-personal-payments-reconciled',{detail:{imported,removed,state}}));
    return changed;
  }
  function refreshUiAfterImport(){
    try{if(typeof window.renderAll==='function')window.renderAll();}catch(e){console.warn('Panorama Finanzas: no se pudo actualizar la interfaz tras reconciliar nómina.',e);}
    window.dispatchEvent(new Event('panorama-finanzas-refresh'));
  }
  async function remoteState(){
    const r=await fetch(base+'panorama_finanzas_state?id=eq.'+encodeURIComponent(ROW_ID)+'&select=data,updated_at',{headers});const raw=await r.text();if(!r.ok)throw new Error(raw||r.statusText);const row=raw?JSON.parse(raw)[0]||null:null;if(!row?.data)return row;
    const changed=await reconcilePersonalPayments(row.data);if(changed){const synced=await syncState(row.data);if(synced?.updatedAt)row.updated_at=synced.updatedAt;refreshUiAfterImport();}
    if(row?.updated_at)lastRemoteAt=row.updated_at;return row;
  }
  function receiveEvent(event){if(!event||typeof event!=='object'||!event.type)return {accepted:false,reason:'invalid-event'};window.dispatchEvent(new CustomEvent('panorama-finanzas-event',{detail:event}));return {accepted:true};}
  function publishEvent(event){if(!event||typeof event!=='object'||!event.type)return false;window.dispatchEvent(new CustomEvent('panorama-finanzas-published',{detail:event}));return true;}
  function getSummary(){return {source:'finanzas',ready:true,updatedAt:lastRemoteAt||null,indicators:{},alerts:[]};}
  window.PanoramaCoreFinance={syncState,remoteState,receiveEvent,publishEvent,getSummary,
    employees:()=>request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc'),
    pending:()=>request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc'),
    paymentHistory:()=>request('personal_payment_records?select=*&order=created_at.desc'),
    directPayments:()=>request('panorama_payroll_payments?select=*&order=paid_date.desc,created_at.desc'),
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){if(!requestRow||requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});},
    debugStatus:()=>({busy,lastRemoteAt,rowId:ROW_ID,url:base})
  };window.dispatchEvent(new Event('panorama-core-finance-ready'));
})();