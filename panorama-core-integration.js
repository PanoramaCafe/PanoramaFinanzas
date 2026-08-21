/* Panorama Finanzas — contrato de integración y diagnóstico temporal */
(function(){
  const cfg=window.PANORAMA_SUPABASE;
  const ROW_ID='finanzas-main';
  const debug=(stage,detail={})=>{
    const payload={stage,at:new Date().toISOString(),...detail};
    console.log('[Panorama Finanzas Sync]',payload);
    window.dispatchEvent(new CustomEvent('panorama-finanzas-sync-status',{detail:payload}));
  };
  if(!cfg?.url||!cfg?.key){
    debug('config-missing',{url:!!cfg?.url,key:!!cfg?.key});
    return;
  }

  const base=cfg.url+'/rest/v1/';
  const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
  let busy=false,lastRemoteAt='';
  const valid=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>0;

  async function syncState(state){
    if(busy){debug('sync-skipped',{reason:'busy'});return false;}
    if(!valid(state)){debug('sync-skipped',{reason:'invalid-state'});return false;}
    busy=true;
    debug('sync-start',{keys:Object.keys(state),size:JSON.stringify(state).length,url:base+'panorama_finanzas_state'});
    try{
      const r=await fetch(base+'panorama_finanzas_state?on_conflict=id',{
        method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({id:ROW_ID,data:state})
      });
      const raw=await r.text();
      if(!r.ok){
        debug('sync-http-error',{status:r.status,statusText:r.statusText,body:raw.slice(0,1000)});
        throw new Error(raw||r.statusText);
      }
      const rows=raw?JSON.parse(raw):[];
      const row=rows[0]||null;
      lastRemoteAt=row?.updated_at||lastRemoteAt;
      debug('sync-success',{updatedAt:lastRemoteAt,response:row});
      return {ok:true,updatedAt:lastRemoteAt};
    }catch(e){
      debug('sync-error',{message:e?.message||String(e),name:e?.name||''});
      console.warn('Panorama Finanzas: sincronización pendiente',e);
      return {ok:false,error:e};
    }finally{busy=false;}
  }

  async function remoteState(){
    debug('remote-read-start');
    const r=await fetch(base+'panorama_finanzas_state?id=eq.'+encodeURIComponent(ROW_ID)+'&select=data,updated_at',{headers});
    const raw=await r.text();
    if(!r.ok){debug('remote-read-error',{status:r.status,statusText:r.statusText,body:raw.slice(0,1000)});throw new Error(raw||r.statusText);}
    const row=raw?JSON.parse(raw)[0]||null:null;
    if(row?.updated_at)lastRemoteAt=row.updated_at;
    debug('remote-read-success',{updatedAt:lastRemoteAt,hasData:!!row?.data,keys:row?.data?Object.keys(row.data):[]});
    return row;
  }

  function receiveEvent(event){
    if(!event||typeof event!=='object'||!event.type)return {accepted:false,reason:'invalid-event'};
    window.dispatchEvent(new CustomEvent('panorama-finanzas-event',{detail:event}));
    return {accepted:true};
  }
  function publishEvent(event){
    if(!event||typeof event!=='object'||!event.type)return false;
    window.dispatchEvent(new CustomEvent('panorama-finanzas-published',{detail:event}));
    return true;
  }
  function getSummary(){return {source:'finanzas',ready:true,updatedAt:lastRemoteAt||null,indicators:{},alerts:[]};}

  async function request(path,options={}){
    const r=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})}});
    const text=await r.text();
    if(!r.ok)throw new Error(text||r.statusText);
    return text?JSON.parse(text):null;
  }

  window.PanoramaCoreFinance={syncState,remoteState,receiveEvent,publishEvent,getSummary,
    employees:()=>request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc'),
    pending:()=>request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc'),
    paymentHistory:()=>request('personal_payment_records?select=*&order=created_at.desc'),
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(!requestRow||requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    },
    debugStatus:()=>({busy,lastRemoteAt,rowId:ROW_ID,url:base})
  };
  debug('core-ready',{url:base,rowId:ROW_ID});
  window.dispatchEvent(new Event('panorama-core-finance-ready'));
})();