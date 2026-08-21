/* Panorama Finanzas <-> Panorama Café Core
   Sincronización entre dispositivos + datos compartidos con Personal.
*/
(function(){
  const cfg=window.PANORAMA_SUPABASE;
  const ROW_ID='finanzas-main';
  if(!cfg?.url||!cfg?.key)return;

  const base=cfg.url+'/rest/v1/';
  const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
  let busy=false,lastRemoteAt='';
  const valid=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>0;

  async function syncState(state){
    if(busy||!valid(state))return false;
    busy=true;
    try{
      const r=await fetch(base+'panorama_finanzas_state?on_conflict=id',{
        method:'POST',
        headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({id:ROW_ID,data:state})
      });
      if(!r.ok)throw new Error(await r.text());
      const row=(await r.json())[0];
      lastRemoteAt=row?.updated_at||lastRemoteAt;
      return true;
    }catch(e){console.warn('Panorama Finanzas: sincronización pendiente',e);return false;}
    finally{busy=false;}
  }

  async function remoteState(){
    const r=await fetch(base+'panorama_finanzas_state?id=eq.'+ROW_ID+'&select=data,updated_at',{headers});
    if(!r.ok)throw new Error(await r.text());
    return (await r.json())[0]||null;
  }

  async function request(path,options={}){
    const r=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})}});
    const text=await r.text();
    if(!r.ok)throw new Error(text||r.statusText);
    return text?JSON.parse(text):null;
  }

  window.PanoramaCoreFinance={
    syncState,
    remoteState,
    employees:()=>request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc'),
    pending:()=>request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc'),
    paymentHistory:()=>request('personal_payment_records?select=*&order=created_at.desc'),
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(!requestRow||requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    }
  };
  window.dispatchEvent(new Event('panorama-core-finance-ready'));
})();