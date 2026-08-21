/* Panorama Finanzas <-> Panorama Café Core
   Un único estado financiero y una única ruta de sincronización.
   El index.html guarda el estado con save(); aquí nos enganchamos a esa función
   y publicamos la misma clave oficial sin reconstruir movimientos ni saldos.
*/
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key){console.warn('Panorama Finanzas: configuración de Supabase no disponible');return;}
  await (window.PanoramaAuth?.ready||Promise.resolve());

  const API=cfg.url+'/rest/v1/';
  const STATE_ID='finanzas-main';
  const STORAGE='panorama_finanzas_pf_v1_010';
  let syncing=null;

  function headers(extra={}){
    const auth=window.PanoramaAuth?.headers?.()||{};
    return {apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',...auth,...extra};
  }

  async function request(path,options={}){
    const response=await fetch(API+path,{...options,headers:headers(options.headers||{})});
    const text=await response.text();
    if(!response.ok)throw new Error(text||response.statusText);
    return text?JSON.parse(text):null;
  }

  function cloneState(state){
    return typeof structuredClone==='function'
      ? structuredClone(state)
      : JSON.parse(JSON.stringify(state));
  }

  function syncState(state){
    if(!state||typeof state!=='object'||Array.isArray(state))return Promise.resolve(false);
    if(syncing)return syncing;
    const snapshot=cloneState(state);
    syncing=(async()=>{
      try{
        await request('panorama_finanzas_state?on_conflict=id',{
          method:'POST',
          headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
          body:JSON.stringify({id:STATE_ID,data:snapshot})
        });
        window.dispatchEvent(new CustomEvent('panorama-core-finance-synced',{detail:{id:STATE_ID}}));
        return true;
      }catch(error){
        console.warn('Panorama Finanzas: sincronización fallida',error);
        return false;
      }finally{syncing=null;}
    })();
    return syncing;
  }

  function readLocalState(){
    try{
      const raw=localStorage.getItem(STORAGE);
      return raw?JSON.parse(raw):null;
    }catch(error){
      console.warn('Panorama Finanzas: estado local inválido',error);
      return null;
    }
  }

  function connectToSave(){
    if(typeof window.save!=='function')return false;
    if(window.save.__panoramaFinanceSync)return true;
    const originalSave=window.save;
    function syncedSave(...args){
      const result=originalSave.apply(this,args);
      const state=readLocalState();
      if(state)syncState(state);
      return result;
    }
    syncedSave.__panoramaFinanceSync=true;
    window.save=syncedSave;
    return true;
  }

  window.PanoramaCoreFinance={
    employees(){return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
    paymentHistory(){return request('personal_payment_records?select=*&order=created_at.desc');},
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    },
    syncState
  };

  connectToSave();
  const existing=readLocalState();
  if(existing)syncState(existing);
  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();