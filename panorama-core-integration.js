/* Panorama Core integration: Finanzas */
(async()=>{
  const cfg=window.PANORAMA_SUPABASE;
  if(!cfg?.url||!cfg?.key){console.warn('Panorama Core: missing config');return;}
  await (window.PanoramaAuth?.ready||Promise.resolve());
  const api=cfg.url+'/rest/v1/';
  async function request(path,opts={}){
    const authHeaders=window.PanoramaAuth?.headers?.()||{apikey:cfg.key,'Authorization':'Bearer '+cfg.key,'Content-Type':'application/json'};
    const response=await fetch(api+path,{...opts,headers:{...authHeaders,...opts.headers}});
    const body=await response.text();
    if(!response.ok)throw new Error(body||response.statusText);
    return body?JSON.parse(body):null;
  }

  window.PanoramaCoreFinance={
    employees(){return request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc');},
    pending(){return request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc');},
    paymentHistory(){return request('personal_payment_records?select=*&order=created_at.desc');},
    async confirm(requestRow,movementId,accountId,_paidAt,notes=''){
      if(requestRow.status!=='PENDING_PAYMENT')throw new Error('La solicitud ya no está pendiente.');
      return request('rpc/confirm_payroll_payment',{method:'POST',body:JSON.stringify({p_payment_request_id:requestRow.id,p_financial_movement_id:String(movementId),p_financial_account_id:String(accountId),p_amount:Number(requestRow.amount),p_notes:notes})});
    }
  };

  // Estado compartido de Finanzas. La aplicación sigue usando su modelo local,
  // pero localStorage deja de ser la única fuente y se replica en Core.
  const STORAGE='panorama_finanzas_pf_v1_010';
  const STATE_ID='finanzas-main';
  let syncing=false;
  let lastSerialized=null;

  async function readRemoteState(){
    const rows=await request('panorama_finanzas_state?id=eq.'+encodeURIComponent(STATE_ID)+'&select=data,updated_at');
    return rows?.[0]||null;
  }
  async function writeRemoteState(data){
    await request('panorama_finanzas_state',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:STATE_ID,data})});
  }
  async function bootstrapFinanceState(){
    try{
      const remote=await readRemoteState();
      const localRaw=localStorage.getItem(STORAGE);
      if(remote?.data && Object.keys(remote.data).length){
        const remoteRaw=JSON.stringify(remote.data);
        if(!localRaw){
          localStorage.setItem(STORAGE,remoteRaw);
          sessionStorage.setItem('panorama_finanzas_state_restored','1');
          location.reload();
          return;
        }
        // En una primera carga de otro dispositivo, el estado por defecto contiene cajas en 0.
        // Se prioriza Core cuando aún no hay movimientos ni cuentas modificadas localmente.
        try{
          const local=JSON.parse(localRaw);
          const looksDefault=Array.isArray(local.moves)&&local.moves.length===0&&Array.isArray(local.providerPayments)&&local.providerPayments.length===0&&Array.isArray(local.commitmentPayments)&&local.commitmentPayments.length===0&&Array.isArray(local.payrollPeriods)&&local.payrollPeriods.length===0;
          if(looksDefault && sessionStorage.getItem('panorama_finanzas_state_restored')!=='1'){
            localStorage.setItem(STORAGE,remoteRaw);
            sessionStorage.setItem('panorama_finanzas_state_restored','1');
            location.reload();
            return;
          }
        }catch(_){}
        lastSerialized=localStorage.getItem(STORAGE);
      }else if(localRaw){
        await writeRemoteState(JSON.parse(localRaw));
        lastSerialized=localRaw;
      }
    }catch(e){console.warn('Panorama Finanzas: state bootstrap failed',e);}
  }

  await bootstrapFinanceState();
  setInterval(async()=>{
    if(syncing)return;
    const raw=localStorage.getItem(STORAGE);
    if(!raw||raw===lastSerialized)return;
    try{
      syncing=true;
      await writeRemoteState(JSON.parse(raw));
      lastSerialized=raw;
    }catch(e){console.warn('Panorama Finanzas: state sync failed',e);}
    finally{syncing=false;}
  },2000);

  window.dispatchEvent(new CustomEvent('panorama-core-finance-ready'));
})();