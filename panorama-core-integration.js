/* Panorama Finanzas <-> Panorama Café Core
   Puente directo y verificable.
*/
(async()=>{
  const STATUS='__panoramaFinanceSync';
  const report=(stage,detail={})=>window[STATUS]={stage,at:new Date().toISOString(),...detail};
  report('starting');
  try{
    const cfg=window.PANORAMA_SUPABASE;
    if(!cfg?.url||!cfg?.key){report('config-missing');return;}
    report('config-ready');
    await (window.PanoramaAuth?.ready||Promise.resolve());
    report('auth-ready');

    const API=cfg.url+'/rest/v1/';
    const STATE_ID='finanzas-main';
    const STORAGE='panorama_finanzas_pf_v1_010';
    let syncing=null,lastRaw='';
    const headers=()=>({apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',Prefer:'resolution=merge-duplicates,return=minimal'});

    async function publishRaw(raw,source){
      report('reading',{source,hasRaw:!!raw,length:raw?.length||0});
      if(!raw)return false;
      let data;
      try{data=JSON.parse(raw);}catch(error){report('json-invalid',{source,error:String(error)});return false;}
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).length===0){report('state-empty',{source,keys:data&&typeof data==='object'?Object.keys(data):[]});return false;}
      if(raw===lastRaw){report('unchanged',{source,keys:Object.keys(data)});return true;}
      if(syncing)return syncing;
      report('publishing',{source,keys:Object.keys(data)});
      syncing=(async()=>{
        const response=await fetch(API+'panorama_finanzas_state?on_conflict=id',{method:'POST',headers:headers(),body:JSON.stringify({id:STATE_ID,data})});
        const text=await response.text();
        if(!response.ok){report('publish-error',{status:response.status,body:text});throw new Error(text||response.statusText);}
        lastRaw=raw;
        report('published',{status:response.status,keys:Object.keys(data)});
        window.dispatchEvent(new CustomEvent('panorama-core-finance-synced',{detail:{id:STATE_ID,keys:Object.keys(data)}}));
        return true;
      })().catch(error=>{console.error('Panorama Finanzas: sincronización fallida',error);return false;}).finally(()=>{syncing=null;});
      return syncing;
    }

    function syncPersistedState(source='manual'){
      try{return publishRaw(localStorage.getItem(STORAGE),source);}catch(error){report('storage-error',{source,error:String(error)});return Promise.resolve(false);}
    }

    async function api(path){
      const r=await fetch(API+path,{headers:{apikey:cfg.key,Authorization:'Bearer '+cfg.key}});
      if(!r.ok)throw new Error(await r.text());
      return r.json();
    }
    window.PanoramaCoreFinance={
      employees(){return api('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
      pending(){return api('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
      paymentHistory(){return api('personal_payment_records?select=*&order=created_at.desc');},
      syncState(state){return publishRaw(JSON.stringify(state),'direct');},
      syncPersistedState,
      status(){return window[STATUS]||null;}
    };

    report('ready');
    await syncPersistedState('boot');
    window.addEventListener('pageshow',()=>syncPersistedState('pageshow'));
    window.addEventListener('storage',event=>{if(event.key===STORAGE)syncPersistedState('storage-event');});
    window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
  }catch(error){
    report('fatal',{error:String(error),stack:error?.stack||''});
    console.error('Panorama Finanzas: integrador no iniciado',error);
  }
})();