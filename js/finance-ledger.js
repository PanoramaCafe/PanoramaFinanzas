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
  async function upsertProvider({id,name,paymentType,note=''}){ return rpc('upsert_finance_provider',{p_provider_id:String(id),p_name:String(name),p_payment_type:String(paymentType),p_note:String(note)}); }
  async function postProviderPurchase({id,date,providerId,amount,mode,accountId=null,note=''}){ return rpc('post_provider_purchase',{p_purchase_id:String(id),p_occurred_on:date,p_provider_id:String(providerId),p_amount:Number(amount),p_mode:String(mode),p_account_id:accountId?String(accountId):null,p_note:String(note)}); }
  async function postProviderPayment({id,date,providerId,amount,accountId,note=''}){ return rpc('post_provider_payment',{p_payment_id:String(id),p_occurred_on:date,p_provider_id:String(providerId),p_amount:Number(amount),p_account_id:String(accountId),p_note:String(note)}); }
  async function reverseProviderPurchase({id,reversalId,reason='Reversión de compra'}){ return rpc('reverse_provider_purchase',{p_purchase_id:String(id),p_reversal_id:String(reversalId),p_reason:String(reason)}); }
  async function reverseProviderPayment({id,reversalId,reason='Reversión de pago'}){ return rpc('reverse_provider_payment',{p_payment_id:String(id),p_reversal_id:String(reversalId),p_reason:String(reason)}); }
  async function upsertCommitment({id,name,category,total,dueDate=null,note=''}){ return rpc('upsert_finance_commitment',{p_commitment_id:String(id),p_name:String(name),p_category:String(category||'otro_compromiso'),p_total:Number(total),p_due_date:dueDate||null,p_note:String(note)}); }
  async function postCommitmentPayment({id,date,commitmentId,amount,accountId,note=''}){ return rpc('post_commitment_payment',{p_payment_id:String(id),p_occurred_on:date,p_commitment_id:String(commitmentId),p_amount:Number(amount),p_account_id:String(accountId),p_note:String(note)}); }
  async function reverseCommitmentPayment({id,reversalId,reason='Reversión de pago de compromiso'}){ return rpc('reverse_commitment_payment',{p_payment_id:String(id),p_reversal_id:String(reversalId),p_reason:String(reason)}); }
  async function archiveCommitment({id}){ return rpc('archive_finance_commitment',{p_commitment_id:String(id)}); }
  async function transfer({id,date,amount,fromAccountId,toAccountId,concept,source='manual',externalId=null,metadata={}}){
    return rpc('post_finance_transfer',{
      p_entry_id:String(id),p_occurred_on:date,p_amount:Number(amount),
      p_from_account_id:String(fromAccountId),p_to_account_id:String(toAccountId),
      p_concept:String(concept),p_source:String(source),p_external_id:externalId,p_metadata:metadata
    });
  }
  window.PanoramaFinanceLedger={postEntry,transfer,reverse,adjustBalance,upsertProvider,postProviderPurchase,postProviderPayment,reverseProviderPurchase,reverseProviderPayment,upsertCommitment,postCommitmentPayment,reverseCommitmentPayment,archiveCommitment};
})();
