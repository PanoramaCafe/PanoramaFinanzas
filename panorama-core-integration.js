/* Panorama Core integration: Finanzas */
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg){console.warn('Panorama Core: missing config');return;}
  const api=cfg.url+'/rest/v1/';
  const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
  async function request(path,opts={}){
    const response=await fetch(api+path,{...opts,headers:{...headers,...opts.headers}});
    const body=await response.text();
    if(!response.ok)throw new Error(body||response.statusText);
    return body?JSON.parse(body):null;
  }
  window.PanoramaCoreFinance={
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=created_at.asc');},
    async confirm(requestRow,movementId,accountId,paidAt,notes=''){
      if(requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      const confirmation={payment_request_id:requestRow.id,financial_movement_id:String(movementId),financial_account_id:String(accountId),amount:Number(requestRow.amount),currency:requestRow.currency||'MXN',paid_at:paidAt,notes,created_by_app:'finanzas'};
      try{
        await request('financial_payment_confirmations',{method:'POST',body:JSON.stringify(confirmation),headers:{Prefer:'return=representation'}});
      }catch(error){
        const duplicate=await request('financial_payment_confirmations?payment_request_id=eq.'+encodeURIComponent(requestRow.id)+'&select=id');
        if(!duplicate?.length)throw error;
      }
      const rows=await request('payroll_payment_requests?id=eq.'+encodeURIComponent(requestRow.id)+'&status=eq.PENDING_PAYMENT',{method:'PATCH',body:JSON.stringify({status:'PAID',updated_by_app:'finanzas'}),headers:{Prefer:'return=representation'}});
      if(!rows?.[0])throw new Error('La solicitud fue actualizada por otra sesión; no se registró un segundo pago local.');
      return rows[0];
    }
  };
  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();