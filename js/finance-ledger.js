/* Panorama Finanzas — PostgreSQL ledger adapter
 * Transitional layer: production writes can move here operation-by-operation
 * without exposing private tables to the browser.
 */
(function(){
  'use strict';
  async function rpc(name,args){
    if(!window.PanoramaAuth?.session) throw new Error('Sesión no autenticada');
    const headers={...(window.PanoramaAuth?.headers?.()||{}),apikey:window.PANORAMA_SUPABASE.key,'Content-Type':'application/json','Prefer':'return=representation'};
    const response=await fetch(window.PANORAMA_SUPABASE.url+'/rest/v1/rpc/'+encodeURIComponent(name),{method:'POST',headers,body:JSON.stringify(args),cache:'no-store'});
    const text=await response.text();
    let data=null; try{data=text?JSON.parse(text):null;}catch{data=text;}
    if(!response.ok) throw new Error(typeof data==='string'?data:(data?.message||'Error en RPC'));
    return data;
  }
  async function postEntry({id,date,type,amount,accountId,concept,category=null,source='manual',externalId=null,metadata={}}){
    return rpc('post_finance_entry',{
      p_entry_id:String(id),p_occurred_on:date,p_entry_type:type,p_amount:Number(amount),
      p_account_id:String(accountId),p_concept:String(concept),p_category:category,
      p_source:String(source),p_external_id:externalId,p_metadata:metadata
    });
  }
  async function reverse({id,reversalId,date,reason='Reversión'}){ return rpc('reverse_finance_entry',{p_entry_id:String(id),p_reversal_id:String(reversalId),p_occurred_on:date,p_reason:String(reason)}); }
  async function adjustBalance({id,date,accountId,targetBalance,reason,metadata={}}){ return rpc('adjust_finance_account_balance',{p_entry_id:String(id),p_occurred_on:date,p_account_id:String(accountId),p_target_balance:Number(targetBalance),p_reason:String(reason),p_metadata:metadata}); }
  async function transfer({id,date,amount,fromAccountId,toAccountId,concept,source='manual',externalId=null,metadata={}}){
    return rpc('post_finance_transfer',{
      p_entry_id:String(id),p_occurred_on:date,p_amount:Number(amount),
      p_from_account_id:String(fromAccountId),p_to_account_id:String(toAccountId),
      p_concept:String(concept),p_source:String(source),p_external_id:externalId,p_metadata:metadata
    });
  }
  window.PanoramaFinanceLedger={postEntry,transfer,reverse,adjustBalance};
})();
