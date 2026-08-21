/* Panorama Finanzas <-> Panorama Café Core
   Integración entre aplicaciones.
   Finanzas conserva su propio estado y solo consume/publica datos compartidos.
*/
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key){
    console.warn('Panorama Finanzas: falta configuración Supabase');
    return;
  }

  await (window.PanoramaAuth?.ready||Promise.resolve());

  const API=cfg.url+'/rest/v1/';
  const authHeaders=()=>({
    apikey:cfg.key,
    Authorization:'Bearer '+cfg.key,
    'Content-Type':'application/json'
  });

  async function request(path,options={}){
    const response=await fetch(API+path,{
      ...options,
      headers:{...authHeaders(),...(options.headers||{})}
    });
    const text=await response.text();
    if(!response.ok) throw new Error(text||response.statusText);
    return text?JSON.parse(text):null;
  }

  window.PanoramaCoreFinance={
    employees(){
      return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');
    },
    pending(){
      return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');
    },
    paymentHistory(){
      return request('personal_payment_records?select=*&order=created_at.desc');
    },
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(!requestRow||requestRow.status!=='PENDING_PAYMENT'){
        throw new Error('La solicitud ya no está pendiente.');
      }
      return request('rpc/confirm_payroll_payment',{
        method:'POST',
        body:JSON.stringify({
          p_payment_request_id:requestRow.id,
          p_financial_movement_id:String(movementId),
          p_financial_account_id:String(accountId),
          p_amount:Number(requestRow.amount),
          p_notes:notes
        })
      });
    }
  };

  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();