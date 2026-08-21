/* Panorama Finanzas — contrato de integración */
(function(){
  const cfg=window.PANORAMA_SUPABASE;
  const ROW_ID='finanzas-main';
  if(!cfg?.url||!cfg?.key){
    console.error('Panorama Finanzas: falta la configuración de Supabase.');
    return;
  }

  const base=cfg.url+'/rest/v1/';
  const headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
  let busy=false,lastRemoteAt='';
  const valid=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length>0;

  async function syncState(state){
    if(busy||!valid(state)) return {ok:false,skipped:true};
    busy=true;
    try{
      const r=await fetch(base+'panorama_finanzas_state?on_conflict=id',{
        method:'POST',
        headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},
        body:JSON.stringify({id:ROW_ID,data:state})
      });
      const raw=await r.text();
      if(!r.ok) throw new Error(raw||r.statusText);
      const row=raw?JSON.parse(raw)[0]||null:null;
      lastRemoteAt=row?.updated_at||lastRemoteAt;
      return {ok:true,updatedAt:lastRemoteAt};
    }catch(error){
      console.warn('Panorama Finanzas: no se pudo sincronizar.',error);
      return {ok:false,error};
    }finally{busy=false;}
  }

  async function remoteState(){
    const r=await fetch(base+'panorama_finanzas_state?id=eq.'+encodeURIComponent(ROW_ID)+'&select=data,updated_at',{headers});
    const raw=await r.text();
    if(!r.ok) throw new Error(raw||r.statusText);
    const row=raw?JSON.parse(raw)[0]||null:null;
    if(row?.updated_at) lastRemoteAt=row.updated_at;
    return row;
  }

  function receiveEvent(event){
    if(!event||typeof event!=='object'||!event.type) return {accepted:false,reason:'invalid-event'};
    window.dispatchEvent(new CustomEvent('panorama-finanzas-event',{detail:event}));
    return {accepted:true};
  }
  function publishEvent(event){
    if(!event||typeof event!=='object'||!event.type) return false;
    window.dispatchEvent(new CustomEvent('panorama-finanzas-published',{detail:event}));
    return true;
  }
  function getSummary(){return {source:'finanzas',ready:true,updatedAt:lastRemoteAt||null,indicators:{},alerts:[]};}

  async function request(path,options={}){
    const r=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})}});
    const text=await r.text();
    if(!r.ok) throw new Error(text||r.statusText);
    return text?JSON.parse(text):null;
  }

  window.PanoramaCoreFinance={syncState,remoteState,receiveEvent,publishEvent,getSummary,
    employees:()=>request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc'),
    pending:()=>request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc'),
    paymentHistory:()=>request('personal_payment_records?select=*&order=created_at.desc'),
    confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(!requestRow||requestRow.status!=='PENDING_PAYMENT') throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    },
    debugStatus:()=>({busy,lastRemoteAt,rowId:ROW_ID,url:base})
  };
  window.dispatchEvent(new Event('panorama-core-finance-ready'));
})();