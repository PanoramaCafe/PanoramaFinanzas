(function(){
const cfg=window.PANORAMA_SUPABASE;if(!cfg)return;
const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',Prefer:'return=representation'};
const api=async(path,opt={})=>{const r=await fetch(cfg.url+'/rest/v1/'+path,{...opt,headers:{...headers,...(opt.headers||{})}});if(!r.ok)throw new Error(await r.text());const t=await r.text();return t?JSON.parse(t):null};
window.PanoramaCore={
 getPendingPayroll(){return api('payroll_payment_requests?status=eq.PENDING_PAYMENT&order=created_at.asc&select=*,employees(full_name)')},
 async confirmPayrollPayment(request,movementId,accountId,notes=''){
  if(!request?.id) throw new Error('Falta la solicitud de pago.');
  return api('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:request.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(request.amount),p_notes:notes||null})});
 },
 getPaidPayroll(){return api('payroll_payment_requests?status=eq.PAID&select=*,employees(full_name),financial_payment_confirmations(*)')}
};
})();