/* Panorama Finanzas <-> Panorama Café Core
   La app conserva su propio estado local. Este archivo no modifica movimientos,
   saldos ni formularios: localiza el estado financiero real y lo refleja en
   una sola fila de Supabase (finanzas-main).
*/
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key){console.warn('Panorama Finanzas: configuración de Supabase no disponible');return;}
  await (window.PanoramaAuth?.ready||Promise.resolve());

  const API=cfg.url+'/rest/v1/';
  const STATE_ID='finanzas-main';
  let syncing=null,last='';

  function headers(extra={}){
    const auth=window.PanoramaAuth?.headers?.()||{};
    return {apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json',...auth,...extra};
  }
  async function request(path,options={}){
    const r=await fetch(API+path,{...options,headers:headers(options.headers||{})});
    const text=await r.text();
    if(!r.ok)throw new Error(text||r.statusText);
    return text?JSON.parse(text):null;
  }
  function score(state){
    if(!state||typeof state!=='object'||Array.isArray(state))return -1;
    let n=Object.keys(state).length;
    for(const k of ['accounts','moves','movements','transactions','categories','payrollPeriods','payrollEmployees']){
      if(Array.isArray(state[k]))n+=100+state[k].length;
    }
    return n;
  }
  function locateState(){
    let best=null,bestScore=-1,bestKey=null;
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i),raw=localStorage.getItem(key);
      if(!raw||raw[0]!=='{')continue;
      try{
        const value=JSON.parse(raw),s=score(value);
        if(s>bestScore){best=value;bestScore=s;bestKey=key;}
      }catch(_){ }
    }
    if(bestScore<=0)return null;
    window.__PANORAMA_FINANZAS_STORE__=bestKey;
    return best;
  }
  function meaningful(state){return score(state)>0;}

  async function publish(state){
    const data=state===undefined?locateState():state;
    if(!meaningful(data))return false;
    const serialized=JSON.stringify(data);
    if(serialized===last)return true;
    if(syncing)return syncing;
    syncing=(async()=>{
      try{
        await request('panorama_finanzas_state?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:STATE_ID,data})});
        last=serialized;
        window.dispatchEvent(new CustomEvent('panorama-core-finance-synced',{detail:{id:STATE_ID,store:window.__PANORAMA_FINANZAS_STORE__}}));
        return true;
      }catch(error){
        console.warn('Panorama Finanzas: sincronización pendiente',error);
        return false;
      }finally{syncing=null;}
    })();
    return syncing;
  }

  // Observa el guardado normal de la app sin interceptar su lógica de negocio.
  const originalSetItem=localStorage.setItem.bind(localStorage);
  localStorage.setItem=function(key,value){
    originalSetItem(key,value);
    if(key===window.__PANORAMA_FINANZAS_STORE__){
      try{publish(JSON.parse(value));}catch(_){publish();}
    }
  };

  window.PanoramaCoreFinance={
    employees(){return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
    paymentHistory(){return request('personal_payment_records?select=*&order=created_at.desc');},
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    },
    sync(){return publish();}
  };

  await publish();
  setInterval(()=>publish(),3000);
  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();