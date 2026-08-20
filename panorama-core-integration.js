/* Panorama Core financial integration bootstrap */
(async()=>{
 const cfg=window.PANORAMA_SUPABASE;if(!cfg){console.warn('Panorama Core: missing config');return;}
 const api=cfg.url+'/rest/v1/';const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
 async function request(path,opts={}){const r=await fetch(api+path,{...opts,headers:{...headers,...opts.headers}});if(!r.ok)throw new Error(await r.text());return r.status===204?null:r.json();}
 window.PanoramaCoreFinance={
  pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=created_at.asc');},
  async confirm(requestRow,movementId,accountId,notes=''){const p={payment_request_id:requestRow.id,financial_movement_id:String(movementId),financial_account_id:String(accountId),amount:Number(requestRow.amount),currency:requestRow.currency||'MXN',notes,created_by_app:'finanzas'};await request('financial_payment_confirmations',{method:'POST',body:JSON.stringify(p),headers:{Prefer:'return=representation'}});const rows=await request('payroll_payment_requests?id=eq.'+encodeURIComponent(requestRow.id),{method:'PATCH',body:JSON.stringify({status:'PAID',updated_by_app:'finanzas'}),headers:{Prefer:'return=representation'}});return rows[0];},
  confirmed(){return request('financial_payment_confirmations?select=*,payroll_payment_requests(*,employees(full_name))&order=paid_at.desc');}
 };
 window.addEventListener('panorama:financial-payment-confirmed',async e=>{const d=e.detail;await PanoramaCoreFinance.confirm(d.request,d.movementId,d.accountId,d.notes||'');});
})();