/* Panorama Finanzas <-> Panorama Café Core
   Sincronización del estado real persistido por index.html.
   El estado financiero vive dentro de un IIFE, por lo que save() no es global.
   Este módulo espera a que la aplicación termine de cargar y lee únicamente
   la misma clave oficial que save() persiste.
*/
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key){console.warn('Panorama Finanzas: configuración de Supabase no disponible');return;}
  await (window.PanoramaAuth?.ready||Promise.resolve());

  const API=cfg.url+'/rest/v1/';
  const STATE_ID='finanzas-main';
  const STORAGE='panorama_finanzas_pf_v1_010';
  let syncing=null,lastFingerprint='',bootTimer=null;

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
  function readLocalState(){
    try{
      const raw=localStorage.getItem(STORAGE);
      if(!raw) return null;
      const state=JSON.parse(raw);
      return state&&typeof state==='object'&&!Array.isArray(state)?state:null;
    }catch(error){console.warn('Panorama Finanzas: estado local inválido',error);return null;}
  }
  function isFinancialState(state){
    return !!(state&&Array.isArray(state.accounts)&&Array.isArray(state.moves)&&state.categories&&Object.keys(state).length>1);
  }
  function fingerprint(state){return JSON.stringify(state);}
  function cloneState(state){return typeof structuredClone==='function'?structuredClone(state):JSON.parse(JSON.stringify(state));}

  function syncState(state){
    if(!isFinancialState(state)) return Promise.resolve(false);
    const raw=fingerprint(state);
    if(raw===lastFingerprint) return Promise.resolve(true);
    if(syncing) return syncing;
    const snapshot=cloneState(state);
    syncing=(async()=>{
      try{
        await request('panorama_finanzas_state?on_conflict=id',{
          method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
          body:JSON.stringify({id:STATE_ID,data:snapshot})
        });
        lastFingerprint=raw;
        window.dispatchEvent(new CustomEvent('panorama-core-finance-synced',{detail:{id:STATE_ID}}));
        return true;
      }catch(error){console.warn('Panorama Finanzas: sincronización fallida',error);return false;}
      finally{syncing=null;}
    })();
    return syncing;
  }
  function syncPersistedState(){return syncState(readLocalState());}

  window.PanoramaCoreFinance={
    employees(){return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
    paymentHistory(){return request('personal_payment_records?select=*&order=created_at.desc');},
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    },
    syncState,
    syncPersistedState
  };

  /* index.html termina su propio IIFE antes de cargar este archivo. Esperamos
     explícitamente al ciclo de carga y reintentamos durante el arranque. */
  async function bootstrap(){
    await syncPersistedState();
    let attempts=0;
    bootTimer=setInterval(async()=>{
      attempts++;
      const ok=await syncPersistedState();
      if(ok||attempts>=10){clearInterval(bootTimer);bootTimer=null;}
    },1000);
  }
  if(document.readyState==='complete') bootstrap();
  else window.addEventListener('load',bootstrap,{once:true});
  window.addEventListener('pageshow',()=>syncPersistedState());
  window.addEventListener('storage',event=>{if(event.key===STORAGE)syncPersistedState();});
  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();