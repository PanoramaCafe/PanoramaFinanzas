/* Panorama Finanzas <-> Panorama Café Core
   Una fuente local real: index.html guarda db en panorama_finanzas_pf_v1_010.
   Supabase refleja esa misma fuente en una sola fila: finanzas-main.
*/
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key){console.warn('Panorama Finanzas: configuración de Supabase no disponible');return;}
  await (window.PanoramaAuth?.ready||Promise.resolve());

  const API=cfg.url+'/rest/v1/';
  const STORE='panorama_finanzas_pf_v1_010';
  const STATE_ID='finanzas-main';
  let syncing=null;
  let last='';

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
  function read(){
    const raw=localStorage.getItem(STORE);
    if(!raw)return null;
    try{return JSON.parse(raw);}catch(e){console.warn('Panorama Finanzas: estado local inválido',e);return null;}
  }
  function meaningful(state){return !!state&&typeof state==='object'&&Object.keys(state).length>0;}

  async function publish(raw){
    const state=raw===undefined?read():raw;
    if(!meaningful(state))return false;
    const serialized=JSON.stringify(state);
    if(serialized===last)return true;
    if(syncing)return syncing;
    syncing=(async()=>{
      try{
        await request('panorama_finanzas_state?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:STATE_ID,data:state})});
        last=serialized;
        window.dispatchEvent(new CustomEvent('panorama-core-finance-synced',{detail:{id:STATE_ID}}));
        return true;
      }catch(error){
        console.warn('Panorama Finanzas: sincronización pendiente',error);
        return false;
      }finally{syncing=null;}
    })();
    return syncing;
  }

  // Enganche directo al único punto de persistencia de la app.
  // No intercepta formularios ni vuelve a implementar movimientos, nómina o saldos.
  const originalSetItem=localStorage.setItem.bind(localStorage);
  localStorage.setItem=function(key,value){
    originalSetItem(key,value);
    if(key===STORE){
      try{publish(JSON.parse(value));}catch(_){publish();}
    }
  };

  window.PanoramaCoreFinance={
    employees(){return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
    paymentHistory(){return request('personal_payment_records?select=*&order=created_at.desc');},
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({
        p_payment_request_id:requestRow.id,
        p_financial_movement_id:String(movementId),
        p_financial_account_id:String(accountId),
        p_amount:Number(requestRow.amount),
        p_notes:notes
      })});
    },
    sync(){return publish();}
  };

  // Publicación inicial del estado real ya existente.
  await publish();

  // Respaldo ligero para cambios que provengan de otra capa del mismo origen.
  setInterval(()=>{
    const state=read();
    if(meaningful(state))publish(state);
  },3000);

  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();