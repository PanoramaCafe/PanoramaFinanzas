/* Panorama Finanzas — PostgreSQL ledger adapter
 * Transitional layer: production writes can move here operation-by-operation
 * without exposing private tables to the browser.
 */
(function(){
  'use strict';
  async function rpc(name,args){
    if(!window.PanoramaAuth?.session) throw new Error('Sesión no autenticada');
    if(!window.supabase?.createClient) throw new Error('Cliente Supabase no disponible');
    const client=window.PanoramaSupabaseClient||(window.PanoramaSupabaseClient=window.supabase.createClient(window.PANORAMA_SUPABASE.url,window.PANORAMA_SUPABASE.key));
    const {data,error}=await client.rpc(name,args);
    if(error) throw error;
    return data;
  }
  async function postEntry({id,date,type,amount,accountId,concept,category=null,source='manual',externalId=null,metadata={}}){
    return rpc('post_finance_entry',{
      p_entry_id:String(id),p_occurred_on:date,p_entry_type:type,p_amount:Number(amount),
      p_account_id:String(accountId),p_concept:String(concept),p_category:category,
      p_source:String(source),p_external_id:externalId,p_metadata:metadata
    });
  }
  async function transfer({id,date,amount,fromAccountId,toAccountId,concept,source='manual',externalId=null,metadata={}}){
    return rpc('post_finance_transfer',{
      p_entry_id:String(id),p_occurred_on:date,p_amount:Number(amount),
      p_from_account_id:String(fromAccountId),p_to_account_id:String(toAccountId),
      p_concept:String(concept),p_source:String(source),p_external_id:externalId,p_metadata:metadata
    });
  }
  window.PanoramaFinanceLedger={postEntry,transfer};
})();
