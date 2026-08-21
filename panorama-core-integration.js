/* Panorama Finanzas <-> Panorama Café Core
   Puente mínimo de sincronización.
   Fuente única: la misma clave que index.html persiste.
*/
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key)return;
  await (window.PanoramaAuth?.ready||Promise.resolve());

  const API=cfg.url+'/rest/v1/';
  const STATE_ID='finanzas-main';
  const STORAGE='panorama_finanzas_pf_v1_010';
  let syncing=null;
  let lastRaw='';

  function headers(extra={}){
    const auth=window.PanoramaAuth?.headers?.()||{};
    return {apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',...auth,...extra};
  }

  async function syncRaw(raw){
    if(!raw||raw===lastRaw)return false;
    let state;
    try{state=JSON.parse(raw);}catch{return false;}
    if(!state||typeof state!=='object'||Array.isArray(state)||Object.keys(state).length===0)return false;
    if(syncing)return syncing;
    const snapshot=JSON.parse(JSON.stringify(state));
    syncing=(async()=>{
      try{
        const response=await fetch(API+'panorama_finanzas_state?on_conflict=id',{
          method:'POST',
          headers:headers({Prefer:'resolution=merge-duplicates,return=minimal'}),
          body:JSON.stringify({id:STATE_ID,data:snapshot})
        });
        if(!response.ok)throw new Error(await response.text());
        lastRaw=raw;
        window.dispatchEvent(new CustomEvent('panorama-core-finance-synced'));
        return true;
      }catch(error){
        console.warn('Panorama Finanzas: sincronización fallida',error);
        return false;
      }finally{syncing=null;}
    })();
    return syncing;
  }

  function syncPersistedState(){
    return syncRaw(localStorage.getItem(STORAGE));
  }

  window.PanoramaCoreFinance={
    employees(){return fetch(API+'employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc',{headers:headers()}).then(r=>r.json());},
    pending(){return fetch(API+'payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc',{headers:headers()}).then(r=>r.json());},
    paymentHistory(){return fetch(API+'personal_payment_records?select=*&order=created_at.desc',{headers:headers()}).then(r=>r.json());},
    syncState(state){return syncRaw(JSON.stringify(state));},
    syncPersistedState
  };

  /* Un único intento al cargar y reintentos breves solo durante el arranque. */
  async function bootstrap(){
    if(await syncPersistedState())return;
    let attempts=0;
    const timer=setInterval(async()=>{
      attempts++;
      const ok=await syncPersistedState();
      if(ok||attempts>=5)clearInterval(timer);
    },1000);
  }

  if(document.readyState==='complete')bootstrap();
  else window.addEventListener('load',bootstrap,{once:true});
  window.addEventListener('pageshow',syncPersistedState);
  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();