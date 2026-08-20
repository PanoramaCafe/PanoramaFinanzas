(function(){
const cfg=window.PANORAMA_SUPABASE;if(!cfg)return;
const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',Prefer:'return=representation'};
const api=async(path,opt={})=>{const r=await fetch(cfg.url+'/rest/v1/'+path,{...opt,headers:{...headers,...(opt.headers||{})}});if(!r.ok)throw new Error(await r.text());const t=await r.text();return t?JSON.parse(t):null};
window.PanoramaCore={
 getPendingPayroll(){return api('payroll_payment_requests?status=eq.PENDING_PAYMENT&order=created_at.asc&select=*,employees(full_name)')},
 async confirmPayrollPayment(request,movementId,accountId,notes=''){await api('financial_payment_confirmations',{method:'POST',body:JSON.stringify({payment_request_id:request.id,financial_movement_id:String(movementId),financial_account_id:String(accountId),amount:Number(request.amount),currency:request.currency||'MXN',notes,created_by_app:'finanzas'})});return api('payroll_payment_requests?id=eq.'+request.id,{method:'PATCH',body:JSON.stringify({status:'PAID',updated_by_app:'finanzas',updated_at:new Date().toISOString()})})},
 getPaidPayroll(){return api('payroll_payment_requests?status=eq.PAID&select=*,employees(full_name),financial_payment_confirmations(*)')}
};
})();