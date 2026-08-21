/* Panorama Finanzas <-> Panorama Café Core
   Sincronización propia entre dispositivos + datos compartidos con Personal.
*/
(function(){
  const cfg=window.PANORAMA_SUPABASE;
  const STORE='panorama_finanzas_pf_v1_010';
  const ROW_ID='finanzas-main';
  if(!cfg?.url||!cfg?.key)return;

  const base=cfg.url+'/rest/v1/';
  const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
  let lastRaw='', lastRemoteAt='', busy=false;

  function raw(){return localStorage.getItem(STORE)||'';}
  function data(){try{return JSON.parse(raw()||'null');}catch{return null;}}
  function valid(value){return value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0;}

  async function remote(){
    const r=await fetch(base+'panorama_finanzas_state?id=eq.'+ROW_ID+'&select=data,updated_at',{headers});
    if(!r.ok)throw new Error(await r.text());
    return (await r.json())[0]||null;
  }

  async function push(force=false){
    if(busy)return false;
    const current=raw(), state=data();
    if(!valid(state)||(!force&&current===lastRaw))return false;
    busy=true;
    try{
      const r=await fetch(base+'panorama_finanzas_state?on_conflict=id',{
        method:'POST',
        headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({id:ROW_ID,data:state})
      });
      if(!r.ok)throw new Error(await r.text());
      const row=(await r.json())[0];
      lastRaw=current;
      lastRemoteAt=row?.updated_at||lastRemoteAt;
      window.dispatchEvent(new CustomEvent('panorama-finanzas-synced'));
      return true;
    }catch(e){console.warn('Panorama Finanzas: sincronización pendiente',e);return false;}
    finally{busy=false;}
  }

  async function pull(){
    if(busy)return false;
    try{
      const row=await remote();
      if(!row||!valid(row.data))return false;
      if(row.updated_at===lastRemoteAt)return false;
      const current=raw();
      if(!lastRaw){lastRaw=current;lastRemoteAt=row.updated_at;return false;}
      lastRemoteAt=row.updated_at;
      if(JSON.stringify(data())===JSON.stringify(row.data))return false;
      localStorage.setItem(STORE,JSON.stringify(row.data));
      lastRaw=raw();
      location.reload();
      return true;
    }catch(e){console.warn('Panorama Finanzas: lectura remota pendiente',e);return false;}
  }

  async function syncCycle(){
    const changed=raw()!==lastRaw;
    if(changed) await push();
    await pull();
  }

  async function request(path,options={}){
    const r=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})}});
    const text=await r.text();
    if(!r.ok)throw new Error(text||r.statusText);
    return text?JSON.parse(text):null;
  }

  window.PanoramaCoreFinance={
    syncNow:()=>push(true),
    employees:()=>request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc'),
    pending:()=>request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc'),
    paymentHistory:()=>request('personal_payment_records?select=*&order=created_at.desc'),
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(!requestRow||requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    }
  };

  window.addEventListener('load',async()=>{
    lastRaw=raw();
    try{await push(true);await pull();}catch(e){console.warn('Panorama Finanzas: sincronización inicial pendiente',e);}
    setInterval(syncCycle,1500);
    window.addEventListener('online',()=>push(true));
    window.dispatchEvent(new Event('panorama-core-finance-ready'));
  });
})();