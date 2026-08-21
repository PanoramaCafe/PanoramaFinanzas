/* Panorama Finanzas <-> Panorama Café Core
   Dos responsabilidades separadas:
   1) Estado propio de Finanzas: sincronización entre dispositivos.
   2) Datos compartidos: integración Personal <-> Finanzas.
*/
(function(){
  const cfg=window.PANORAMA_SUPABASE;
  const STORE='panorama_finanzas_pf_v1_010';
  const ROW_ID='finanzas-main';
  if(!cfg?.url||!cfg?.key){console.warn('Panorama Finanzas: falta configuración Supabase');return;}

  const headers={'apikey':cfg.key,'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json'};
  let pushing=false, applyingRemote=false, lastRemoteUpdatedAt=null, pushTimer=null;

  function readLocal(){
    try{return JSON.parse(localStorage.getItem(STORE)||'null');}
    catch(e){console.warn('Panorama Finanzas: estado local inválido',e);return null;}
  }
  function writeLocal(data){
    applyingRemote=true;
    try{localStorage.setItem(STORE,JSON.stringify(data));}
    finally{setTimeout(()=>applyingRemote=false,0);}
  }

  async function ensureRemote(){
    const r=await fetch(cfg.url+'/rest/v1/panorama_finanzas_state?id=eq.'+encodeURIComponent(ROW_ID)+'&select=id,data,updated_at',{headers});
    if(!r.ok)throw new Error(await r.text());
    const rows=await r.json();
    if(rows?.[0])return rows[0];
    const local=readLocal();
    if(!local)return null;
    const create=await fetch(cfg.url+'/rest/v1/panorama_finanzas_state',{method:'POST',headers:{...headers,'Prefer':'return=representation'},body:JSON.stringify({id:ROW_ID,data:local})});
    if(!create.ok)throw new Error(await create.text());
    return (await create.json())?.[0]||null;
  }

  async function push(){
    if(pushing||applyingRemote)return;
    const data=readLocal();
    if(!data||typeof data!=='object')return;
    pushing=true;
    try{
      const r=await fetch(cfg.url+'/rest/v1/panorama_finanzas_state?id=eq.'+encodeURIComponent(ROW_ID),{
        method:'PATCH',headers:{...headers,'Prefer':'return=representation'},body:JSON.stringify({data})
      });
      if(!r.ok)throw new Error(await r.text());
      const rows=await r.json();
      lastRemoteUpdatedAt=rows?.[0]?.updated_at||lastRemoteUpdatedAt;
      window.dispatchEvent(new CustomEvent('panorama-finanzas-synced'));
    }catch(e){console.warn('Panorama Finanzas: no se pudo sincronizar',e);}
    finally{pushing=false;}
  }

  async function pull(initial=false){
    if(pushing)return;
    try{
      const row=await ensureRemote();
      if(!row?.data||typeof row.data!=='object')return;
      if(initial){
        const local=readLocal();
        if(!local||Object.keys(local).length===0){
          lastRemoteUpdatedAt=row.updated_at||null;
          writeLocal(row.data);
          location.reload();
          return;
        }
        lastRemoteUpdatedAt=row.updated_at||null;
        return;
      }
      if(lastRemoteUpdatedAt&&row.updated_at===lastRemoteUpdatedAt)return;
      lastRemoteUpdatedAt=row.updated_at||lastRemoteUpdatedAt;
      const local=readLocal();
      if(JSON.stringify(local)!==JSON.stringify(row.data)){
        writeLocal(row.data);
        location.reload();
      }
    }catch(e){console.warn('Panorama Finanzas: no se pudo leer estado remoto',e);}
  }

  const originalSetItem=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){
    const out=originalSetItem.apply(this,arguments);
    if(this===localStorage&&key===STORE&&!applyingRemote){
      clearTimeout(pushTimer);
      pushTimer=setTimeout(push,250);
    }
    return out;
  };

  async function request(path,options={}){
    const response=await fetch(cfg.url+'/rest/v1/'+path,{...options,headers:{...headers,...(options.headers||{})}});
    const text=await response.text();
    if(!response.ok)throw new Error(text||response.statusText);
    return text?JSON.parse(text):null;
  }

  window.PanoramaCoreFinance={
    employees(){return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
    paymentHistory(){return request('personal_payment_records?select=*&order=created_at.desc');},
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(!requestRow||requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    }
  };

  window.addEventListener('load',async()=>{
    await pull(true);
    await push();
    setInterval(()=>pull(false),5000);
    window.dispatchEvent(new Event('panorama-core-finance-ready'));
  });
})();