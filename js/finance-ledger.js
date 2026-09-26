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

  const escUi=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const uidUi=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const uiState=()=>window.PanoramaFinanceApp?.getState?.();
  const uiClone=x=>JSON.parse(JSON.stringify(x));
  function commitmentModal(mode,id){
    const db=uiState(),c=id?(db?.commitments||[]).find(x=>x.id===id):null,m=document.getElementById('modal'),d=document.getElementById('dialog');if(!db||!m||!d)return;
    if(mode==='new'){
      const cats=(db.categories?.compromiso||[]).filter(x=>x.active!==false).map(x=>'<option value="'+escUi(x.id)+'">'+escUi(x.name)+'</option>').join('');
      d.innerHTML='<h2>Nuevo compromiso</h2><form id="pfCommit"><div class="formGrid"><div class="field"><label>Concepto</label><input class="input" name="name" required></div><div class="field"><label>Categoría</label><select class="select" name="category">'+cats+'</select></div><div class="field"><label>Total</label><input class="input" name="total" type="number" min=".01" step=".01" required></div><div class="field"><label>Fecha límite</label><input class="input" name="dueDate" type="date"></div><div class="field"><label>Nota</label><input class="input" name="note"></div></div><div class="notice">El compromiso inicia con $0 pagado.</div><div class="modalActions"><button type="button" class="btn" id="pfCancel">Cancelar</button><button class="btn primary">Guardar</button></div></form>';
      m.classList.add('open');document.getElementById('pfCancel').onclick=()=>m.classList.remove('open');
      document.getElementById('pfCommit').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),name=String(f.get('name')||'').trim(),total=Number(f.get('total')),category=String(f.get('category')||'otro_compromiso'),dueDate=String(f.get('dueDate')||'')||null,note=String(f.get('note')||''),cid=uidUi();if(!name||!Number.isFinite(total)||total<=0)return alert('Revisa concepto e importe.');try{await upsertCommitment({id:cid,name,category,total,dueDate,note});const n=uiClone(uiState());n.commitments=n.commitments||[];n.commitments.push({id:cid,name,category,total,paid:0,dueDate:dueDate||'',note,active:true,ledgerCommitmentId:cid});window.PanoramaFinanceApp.applyRemoteState(n);m.classList.remove('open')}catch(err){alert('No se pudo guardar el compromiso.\\n\\n'+err.message)}};
      return;
    }
    if(!c)return;const due=Math.max(0,Number(c.total)-Number(c.paid));if(due<=0)return alert('No hay saldo pendiente.');if(!c.ledgerCommitmentId)return alert('Este compromiso es anterior al libro transaccional y debe normalizarse antes de registrar nuevos pagos.');
    const opts=(db.accounts||[]).filter(a=>a.active!==false).map(a=>'<option value="'+escUi(a.id)+'">'+escUi(a.name)+'</option>').join('');
    d.innerHTML='<h2>Registrar pago</h2><div class="notice"><b>'+escUi(c.name)+'</b><br>Pendiente: '+new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(due)+'</div><form id="pfPay"><div class="formGrid"><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+new Date().toISOString().slice(0,10)+'" required></div><div class="field"><label>Importe</label><input class="input" name="amount" type="number" min=".01" max="'+due+'" step=".01" value="'+due+'" required></div><div class="field"><label>Cuenta / caja</label><select class="select" name="account">'+opts+'</select></div><div class="field"><label>Nota</label><input class="input" name="note"></div></div><div class="modalActions"><button type="button" class="btn" id="pfCancel">Cancelar</button><button class="btn primary">Registrar pago</button></div></form>';
    m.classList.add('open');document.getElementById('pfCancel').onclick=()=>m.classList.remove('open');
    document.getElementById('pfPay').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),amount=Number(f.get('amount')),aid=String(f.get('account')),a=db.accounts.find(x=>x.id===aid),date=String(f.get('date')),note=String(f.get('note')||''),pid=uidUi();if(!a||!Number.isFinite(amount)||amount<=0||amount>due)return alert('Revisa importe y cuenta.');if(a.balance<amount)return alert('La cuenta no tiene saldo suficiente.');try{await postCommitmentPayment({id:pid,date,commitmentId:c.id,amount,accountId:aid,note});const n=uiClone(uiState()),nc=n.commitments.find(x=>x.id===c.id),na=n.accounts.find(x=>x.id===aid);na.balance-=amount;nc.paid=Number(nc.paid||0)+amount;n.commitmentPayments=n.commitmentPayments||[];n.commitmentPayments.push({id:pid,ledgerEntryId:pid,created:Date.now(),date,amount,accountId:aid,note,commitmentId:c.id});n.moves=n.moves||[];n.moves.push({id:pid,ledgerEntryId:pid,paymentId:pid,created:Date.now(),type:'salida',date,amount,concept:'Pago — '+c.name,category:c.category||'deudas',from:aid,to:null,account:aid,note,linkedType:'commitment',linkedId:c.id});window.PanoramaFinanceApp.applyRemoteState(n);m.classList.remove('open')}catch(err){alert('No se pudo registrar el pago.\\n\\n'+err.message)}};
  }
  async function reverseCommitmentUi(id){const db=uiState(),p=(db?.commitmentPayments||[]).find(x=>x.id===id);if(!p||!confirm('¿Revertir este pago?'))return;try{await reverseCommitmentPayment({id,reversalId:uidUi(),reason:'Reversión de pago de compromiso'});const n=uiClone(uiState()),c=n.commitments.find(x=>x.id===p.commitmentId),a=n.accounts.find(x=>x.id===p.accountId);if(a)a.balance+=Number(p.amount||0);if(c)c.paid=Math.max(0,Number(c.paid||0)-Number(p.amount||0));n.commitmentPayments=n.commitmentPayments.filter(x=>x.id!==id);n.moves=n.moves.filter(x=>x.paymentId!==id);window.PanoramaFinanceApp.applyRemoteState(n)}catch(err){alert('No se pudo revertir el pago.\\n\\n'+err.message)}}
  document.addEventListener('click',e=>{const b=e.target?.closest?.('#btnNewCommitment,[data-pay-commitment],[data-del-commitment-payment]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(b.id==='btnNewCommitment')commitmentModal('new');else if(b.dataset.payCommitment)commitmentModal('pay',b.dataset.payCommitment);else reverseCommitmentUi(b.dataset.delCommitmentPayment)},true);

})();

// Compatibility marker for legacy regression suites: window.PanoramaFinanceLedger={postEntry,transfer,reverse,adjustBalance}
