(function(){
'use strict';

const STORAGE='panorama_finanzas_pf_v1_010';
const DEFAULT={
 accounts:[
  {id:'pos',name:'Caja POS',type:'Caja',balance:0,active:true},
  {id:'principal',name:'Caja Principal',type:'Caja',balance:0,active:true},
  {id:'mp',name:'Mercado Pago',type:'Cuenta digital',balance:0,active:true},
  {id:'revolut',name:'Revolut',type:'Cuenta digital',balance:0,active:true}
 ],
 categories:{
  entrada:[
   ['ventas','Ventas'],['aportacion','Aportación'],['recuperacion','Recuperación de dinero'],['otros_ingresos','Otros ingresos']
  ].map(x=>({id:x[0],name:x[1],active:true})),
  salida:[
   ['insumos','Insumos'],['inventario','Inventario'],['proveedores','Proveedores'],['mantenimiento','Mantenimiento'],
   ['servicios','Servicios'],['limpieza','Limpieza'],['transporte','Transporte'],['comisiones','Comisiones'],
   ['nomina','Nómina'],['administrativos','Gastos administrativos'],['papeleria','Papelería'],['tecnologia','Tecnología'],
   ['marketing','Publicidad / Marketing'],['deudas','Deudas'],['tanda','Tanda'],['creditos','Créditos'],
   ['apoyo_familiar','Apoyo familiar'],['infraestructura','Infraestructura'],['vehiculo','Vehículo'],['otros','Otros']
  ].map(x=>({id:x[0],name:x[1],active:true})),
  compromiso:[
   ['tanda','Tanda'],['credito','Crédito'],['deuda','Deuda'],['pago_pendiente','Pago pendiente'],
   ['nomina','Nómina'],['impuesto','Impuesto'],['servicio','Servicio'],['otro_compromiso','Otro compromiso']
  ].map(x=>({id:x[0],name:x[1],active:true}))
 },
 moves:[],providers:[],commitments:[],cuts:[],providerPayments:[],commitmentPayments:[],payrollEmployees:[],payrollPeriods:[],fixedPayments:[],reconciliations:[],posCloses:[],adjustments:[],loyverseSummaries:[],loyverseTreasuryExpenses:[]
};

let db=load();

function clone(o){return JSON.parse(JSON.stringify(o))}
function load(){
 try{
  const saved=JSON.parse(localStorage.getItem(STORAGE));
  if(!saved) return clone(DEFAULT);
  const d=saved;
  d.accounts=d.accounts||clone(DEFAULT.accounts);
  d.categories=d.categories||clone(DEFAULT.categories);
  d.categories.entrada=d.categories.entrada||[];
  d.categories.salida=d.categories.salida||[];
  d.categories.compromiso=d.categories.compromiso||[];
  d.moves=d.moves||[]; d.providers=d.providers||[]; d.commitments=d.commitments||[]; d.cuts=d.cuts||[];
  d.providerPayments=d.providerPayments||[]; d.commitmentPayments=d.commitmentPayments||[]; d.payrollEmployees=d.payrollEmployees||[]; d.payrollPeriods=d.payrollPeriods||[]; d.fixedPayments=d.fixedPayments||[]; d.reconciliations=d.reconciliations||[]; d.loyverseTreasuryExpenses=d.loyverseTreasuryExpenses||[]; d.posCloses=d.posCloses||[]; d.adjustments=d.adjustments||[]; d.loyverseSummaries=d.loyverseSummaries||[];
  return d;
 }catch(e){return clone(DEFAULT)}
}
function save(){
  localStorage.setItem(STORAGE,JSON.stringify(db));
  window.PanoramaCoreFinance?.syncState(db);
  renderAll();
}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8)}
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]})}
function money(n){return new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(n)||0)}
function today(){return new Date().toISOString().slice(0,10)}
function getAccount(i){return db.accounts.find(a=>a.id===i)}
function getCategory(type,i){return (db.categories[type]||[]).find(c=>c.id===i)}
function categoryName(type,i){const c=getCategory(type,i);return c?c.name:(i||'')}
function accountOptions(exclude){
 return db.accounts.filter(a=>a.active&&a.id!==exclude).map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('');
}
function categoryOptions(type){
 return '<option value="">Seleccionar...</option>'+db.categories[type].filter(c=>c.active).map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
}
function openModal(content){document.getElementById('dialog').innerHTML=content;document.getElementById('modal').classList.add('open')}
function closeModal(){document.getElementById('modal').classList.remove('open')}
document.getElementById('modal').addEventListener('click',function(e){if(e.target===this)closeModal()});

const titles={dashboard:'Posición financiera',movimientos:'Movimientos',cuentas:'Cuentas y dinero',proveedores:'Proveedores',payroll:'Nómina',pagosfijos:'Pagos fijos',resultado:'Resultado financiero',compromisos:'Compromisos y deudas',cortes:'Cortes financieros',conciliacion:'Conciliación de cajas',cierrepos:'Cierre de Caja POS',catalogos:'Catálogos',datos:'Datos y respaldo'};
document.querySelectorAll('.nav button').forEach(function(btn){
 btn.addEventListener('click',function(){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  const target=document.getElementById(btn.dataset.view);
  if(target) target.classList.add('active');
  document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('title').textContent=titles[btn.dataset.view]||'Panorama Finanzas';
  window.scrollTo(0,0);
 });
});

function renderAll(){renderDashboard();renderMoves();renderAccounts();renderProviders();renderCommitments();renderCuts();renderCategories();renderPayments();renderReconciliations();renderPOSCloses();renderDataStatus();renderResult();renderPayroll();renderFixedPayments();renderCorePayrollRequests()}

function accountKind(a){
 const n=(a?.name||'').toLowerCase();
 if(a?.type==='Caja'||n.includes('caja')||n.includes('efectivo')) return 'Efectivo';
 return 'Digital';
}
function accountKindIcon(a){ return accountKind(a)==='Efectivo'?'💵':'🏦'; }

function renderDashboard(){
 const total=db.accounts.reduce((s,a)=>s+Number(a.balance||0),0);
 const committed=db.providers.reduce((s,p)=>s+Math.max(0,Number(p.total||0)-Number(p.paid||0)),0)+
                  db.commitments.reduce((s,c)=>s+Math.max(0,Number(c.total||0)-Number(c.paid||0)),0);
 document.getElementById('totalMoney').textContent=money(total);
 document.getElementById('totalCommitted').textContent=money(committed);
 document.getElementById('freeMoney').textContent=money(total-committed);
 document.getElementById('moveCount').textContent=db.moves.length;
 document.getElementById('dashboardAccounts').innerHTML=db.accounts.filter(a=>a.active!==false).map(a=>'<div class="row"><div><b>'+accountKindIcon(a)+' '+esc(a.name)+'</b><div class="muted">'+esc(accountKind(a))+'</div></div><strong>'+money(a.balance)+'</strong></div>').join('')||'<div class="empty">Sin cuentas.</div>';
 const r=db.moves.slice().sort(function(a,b){return b.created-a.created}).slice(0,6);
 document.getElementById('dashboardMoves').innerHTML=r.map(function(m){
  const acc=getAccount(m.from||m.account);
  const sign=m.type==='salida'?'−':m.type==='entrada'?'+':'';
  return '<div class="row"><div><span class="pill '+(m.type==='entrada'?'in':m.type==='salida'?'out':'tr')+'">'+esc(m.type)+'</span> <b>'+esc(m.concept)+'</b><div class="muted">'+m.date+' · '+esc(acc?acc.name:'')+'</div></div><strong>'+sign+money(m.amount)+'</strong></div>';
 }).join('')||'<div class="empty">Sin movimientos.</div>';
}

function movementOriginLabel(m){
 const o=m.origin||m.source||'manual';
 const labels={
  proveedores:'Proveedores',
  nomina:'Nómina',
  pagos_fijos:'Pagos fijos',
  compromisos:'Compromisos',
  loyverse:'Loyverse',
  manual:'Manual',
  ajuste:'Ajuste de saldo'
 };
 return labels[o]||o;
}

function renderMoves(){
 const body=document.getElementById('movesBody');if(!body)return;
 const search=(document.getElementById('searchMoves')?.value||'').trim().toLowerCase();
 const filter=document.getElementById('filterMoves')?.value||'';
 const from=document.getElementById('movesFrom')?.value||'';
 const to=document.getElementById('movesTo')?.value||'';
 const rows=(db.moves||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.created||0)-(a.created||0))
 .filter(function(m){
   const type=(m.type||'').toLowerCase();
   const normalized=type==='compra_credito'?'salida':type;
   const matchesType=!filter||normalized===filter;
   const matchesFrom=!from||(m.date||'')>=from;
   const matchesTo=!to||(m.date||'')<=to;
   const hay=(String(m.concept||'')+' '+String(m.note||'')+' '+String(movementOriginLabel(m)||'')+' '+String(m.category||'')).toLowerCase();
   return matchesType&&matchesFrom&&matchesTo&&(!search||hay.includes(search));
 });
 body.innerHTML=rows.map(function(m){
   const acc=getAccount(m.account||m.from),amount=Number(m.amount||0);
   const isTransfer=m.type==='transferencia',isEntry=m.type==='entrada';
   const sign=isEntry?'+':isTransfer?'↔':'−',color=isEntry?'green':isTransfer?'':'red';
   const displayType=isTransfer?'Transferencia':isEntry?'Entrada':'Salida';
   return '<tr><td>'+esc(m.date||'')+'</td><td>'+esc(displayType)+'</td><td><b>'+esc(m.concept||'Movimiento')+'</b><div class="muted">'+esc(m.note||'')+'</div></td><td>'+esc(m.category||'—')+'</td><td>'+esc(acc?.name||'—')+'</td><td class="'+color+'"><strong>'+sign+money(amount)+'</strong></td><td><button class="btn" data-view-movement="'+m.id+'">Ver</button></td></tr>';
 }).join('')||'<tr><td colspan="7"><div class="empty">No hay movimientos que coincidan con los filtros.</div></td></tr>';
 document.querySelectorAll('[data-view-movement]').forEach(b=>b.addEventListener('click',function(){openMovementDetail(b.dataset.viewMovement)}));
}


function openMovementDetail(id){
 const m=(db.moves||[]).find(x=>x.id===id);if(!m)return;
 const acc=getAccount(m.account||m.from),dest=getAccount(m.to);
 const origin=movementOriginLabel(m);
 const linked=m.linkedType?('<br><span class="muted">Origen vinculado: '+esc(m.linkedType)+'</span>'):'';
 openModal('<h2>Detalle del movimiento</h2>'+
 '<div class="notice"><b>'+esc(m.concept||'Movimiento')+'</b><br>'+esc(m.date||'')+' · '+esc(m.category||'—')+'<br>Importe: <strong>'+money(m.amount)+'</strong><br>Cuenta: '+esc(acc?.name||'—')+(dest?' → '+esc(dest.name):'')+'<br>Origen: '+esc(origin)+linked+'</div>'+
 '<div class="modalActions"><button type="button" class="btn" id="editMovementBtn">Editar</button><button type="button" class="btn danger" id="deleteMovementBtn">Eliminar</button><button type="button" class="btn" id="closeMovementBtn">Cerrar</button></div>');
 document.getElementById('closeMovementBtn').addEventListener('click',closeModal);
 document.getElementById('editMovementBtn').addEventListener('click',function(){editMovement(id)});
 document.getElementById('deleteMovementBtn').addEventListener('click',function(){deleteMovement(id)});
}
function editMovement(id){
 const m=(db.moves||[]).find(x=>x.id===id);if(!m)return;
 // Imported/linked records must be edited from their source module to avoid breaking reconciliation.
 if(m.linkedType==='providerPurchase'){editProviderPurchase(m.linkedId);return}
 if(m.linkedType==='provider'){editPayment('provider',m.paymentId||m.linkedId);return}
 if(m.linkedType==='commitment'){editPayment('commitment',m.paymentId||m.linkedId);return}
 if(m.linkedType==='loyverseTreasury'){alert('Este movimiento proviene de Loyverse. Debe modificarse desde Loyverse o desde el registro de Salidas de tesorería Loyverse.');return}
 if(m.linkedType){alert('Este movimiento está vinculado a otro módulo. Modifícalo desde su registro de origen para evitar duplicidades.');return}
 openModal('<h2>Editar movimiento</h2><form id="editMovementForm"><div class="formGrid">'+
 '<div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+esc(m.date||today())+'" required></div>'+
 '<div class="field"><label>Tipo</label><select class="select" name="type"><option value="entrada">Entrada</option><option value="salida">Salida</option><option value="transferencia">Transferencia</option></select></div>'+
 '<div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" value="'+Number(m.amount||0)+'" required></div>'+
 '<div class="field"><label>Cuenta</label><select class="select" name="account">'+accountOptions()+'</select></div>'+
 '<div class="field"><label>Categoría</label><select class="select" name="category">'+categoryOptions(m.category||'')+'</select></div>'+
 '<div class="field full"><label>Concepto</label><input class="input" name="concept" value="'+esc(m.concept||'')+'" required></div>'+
 '<div class="field full"><label>Nota</label><input class="input" name="note" value="'+esc(m.note||'')+'"></div></div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelEditMovement">Cancelar</button><button class="btn primary">Guardar cambios</button></div></form>');
 const f=document.getElementById('editMovementForm');
 f.querySelector('[name="type"]').value=m.type==='compra_credito'?'salida':(m.type||'salida');
 f.querySelector('[name="account"]').value=m.account||m.from||'';
 document.getElementById('cancelEditMovement').addEventListener('click',closeModal);
 f.addEventListener('submit',function(e){
  e.preventDefault();
  const d=new FormData(f),amount=Number(d.get('amount')),newType=String(d.get('type')),newAcc=getAccount(d.get('account')),oldAcc=getAccount(m.account||m.from);
  if(!Number.isFinite(amount)||amount<=0){alert('El importe no es válido.');return}
  if(!newAcc){alert('Selecciona una cuenta válida.');return}
  // Revert old balance, then validate/apply the new balance.
  if(m.type==='entrada'){if(oldAcc)oldAcc.balance-=Number(m.amount||0)}
  else if(m.type==='salida'||m.type==='compra_credito'){if(oldAcc)oldAcc.balance+=Number(m.amount||0)}
  if(newType==='entrada'){
   newAcc.balance+=amount;
  }else if(newType==='salida'){
   if(newAcc.id!==oldAcc?.id && Number(newAcc.balance)<amount){
    if(m.type==='entrada'){if(oldAcc)oldAcc.balance+=Number(m.amount||0)}else if(oldAcc)oldAcc.balance-=Number(m.amount||0);
    alert('La cuenta no tiene saldo suficiente.');return;
   }
   if(newAcc.id===oldAcc?.id && Number(newAcc.balance)<amount){ // balance currently includes old amount
    alert('La cuenta no tiene saldo suficiente.');if(m.type==='entrada')oldAcc.balance+=Number(m.amount||0);else oldAcc.balance-=Number(m.amount||0);return;
   }
   newAcc.balance-=amount;
  }
  m.date=String(d.get('date'));m.type=newType;m.amount=amount;m.account=newAcc.id;m.from=newAcc.id;m.category=String(d.get('category'));m.concept=String(d.get('concept'));m.note=String(d.get('note')||'');
  save();renderMoves();closeModal();
 });
}
function deleteMovement(id){
 const m=(db.moves||[]).find(x=>x.id===id);if(!m)return;
 if(m.linkedType==='providerPurchase'){deleteProviderPurchase(m.linkedId);return}
 if(m.linkedType==='provider'){alert('Este pago debe eliminarse desde Proveedores para revertir también la deuda.');return}
 if(m.linkedType==='commitment'){alert('Este pago debe eliminarse desde Compromisos para mantener el saldo correcto.');return}
 if(m.linkedType==='loyverseTreasury'){alert('Esta salida proviene de Loyverse. Elimínala desde Salidas de tesorería Loyverse para revertir correctamente la cuenta.');return}
 if(m.linkedType){alert('Este movimiento está vinculado a otro módulo. Elimínalo desde su registro de origen.');return}
 if(!confirm('¿Eliminar este movimiento? Se revertirá su efecto sobre la cuenta.'))return;
 const acc=getAccount(m.account||m.from);
 if(m.type==='entrada'){if(acc)acc.balance-=Number(m.amount||0)}
 else if(m.type==='salida'||m.type==='compra_credito'){if(acc)acc.balance+=Number(m.amount||0)}
 db.moves=db.moves.filter(x=>x.id!==id);
 save();renderMoves();
}


function renderAccounts(){
 const body=document.getElementById('accountsBody');
 if(!body)return;
 const accounts=(db.accounts||[]).filter(a=>a.active!==false);
 body.innerHTML=accounts.map(function(a){
   return '<tr>'+
    '<td data-label="Cuenta"><b>'+accountKindIcon(a)+' '+esc(a.name)+'</b><div class="muted">'+esc(accountKind(a))+'</div></td>'+
    '<td data-label="Saldo actual"><strong>'+money(Number(a.balance||0))+'</strong></td>'+
    '<td data-label="Tipo">'+esc(a.type||'')+'</td>'+
    '<td data-label="Acciones"><div class="actions">'+
      '<button class="btn" data-edit-account="'+a.id+'">✏ Editar</button>'+
      '<button class="btn" data-adjust-account="'+a.id+'">⚖ Ajustar saldo</button>'+
      '<button class="btn" data-adjust-history="'+a.id+'">Historial</button>'+
      '<button class="btn danger" data-del-account="'+a.id+'">Eliminar</button>'+
    '</div></td>'+
   '</tr>';
 }).join('')||'<tr><td colspan="4"><div class="empty">No hay cuentas activas.</div></td></tr>';

 document.querySelectorAll('[data-edit-account]').forEach(b=>b.addEventListener('click',function(){
   openAccount(b.dataset.editAccount);
 }));
 document.querySelectorAll('[data-adjust-account]').forEach(b=>b.addEventListener('click',function(){
   openAccountAdjustment(b.dataset.adjustAccount);
 }));
 document.querySelectorAll('[data-adjust-history]').forEach(b=>b.addEventListener('click',function(){
   openAdjustmentHistory(b.dataset.adjustHistory);
 }));
 document.querySelectorAll('[data-del-account]').forEach(b=>b.addEventListener('click',function(){
   deleteAccount(b.dataset.delAccount);
 }));
}

function providerFinancials(pid){
 const purchases=db.moves.filter(m=>m.linkedType==='providerPurchase'&&m.linkedId===pid);
 const payments=db.providerPayments.filter(p=>p.providerId===pid);
 const purchased=purchases.reduce((s,m)=>s+Number(m.amount),0);
 const paid=payments.reduce((s,p)=>s+Number(p.amount),0);
 const p=db.providers.find(x=>x.id===pid);
 return {purchased,paid,pending:Number(p?.creditBalance||0),purchases,payments};
}
function deleteAccount(id){
 const a=getAccount(id);if(!a)return;
 const hasMoves=(db.moves||[]).some(m=>m.account===id||m.from===id||m.to===id);
 const hasClosures=(db.cuts||[]).some(c=>c.accountId===id);
 if(hasMoves||hasClosures){
   if(confirm('Esta cuenta tiene movimientos o cierres. No se eliminará para no romper el historial. ¿Quieres marcarla como inactiva?')){
     a.active=false;save();
   }
   return;
 }
 if(confirm('¿Eliminar definitivamente la cuenta "'+a.name+'"?')){
   db.accounts=db.accounts.filter(x=>x.id!==id);save();
 }
}




let corePayrollRequests=[],corePayrollLoading=false;
function renderCorePayrollRequests(){
 const box=document.getElementById('corePayrollRequests');if(!box)return;
 if(corePayrollLoading){box.innerHTML='<div class="empty">Cargando solicitudes…</div>';return}
 if(!window.PanoramaCoreFinance){box.innerHTML='<div class="empty">La conexión con Panorama Core no está disponible.</div>';return}
 if(!corePayrollRequests.length){box.innerHTML='<div class="empty">No hay solicitudes de nómina pendientes.</div>';return}
 box.innerHTML='<div class="tableWrap"><table class="table"><thead><tr><th>Periodo</th><th>Empleado</th><th>Importe</th><th></th></tr></thead><tbody>'+corePayrollRequests.map(r=>'<tr><td>'+esc(r.period_start)+' – '+esc(r.period_end)+'</td><td><b>'+esc(r.employees?.full_name||'Empleado')+'</b></td><td>'+money(r.amount)+'</td><td><button class="btn primary" data-pay-core-request="'+esc(r.id)+'">Pagar</button></td></tr>').join('')+'</tbody></table></div>';
 document.querySelectorAll('[data-pay-core-request]').forEach(b=>b.addEventListener('click',()=>openCorePayrollPayment(b.dataset.payCoreRequest)));
}
async function refreshCorePayrollRequests(){
 if(!window.PanoramaCoreFinance?.pending)return;
 corePayrollLoading=true;renderCorePayrollRequests();
 try{corePayrollRequests=await window.PanoramaCoreFinance.pending();}catch(error){console.warn('No se pudieron cargar las solicitudes de nómina',error);corePayrollRequests=[];const box=document.getElementById('corePayrollRequests');if(box)box.innerHTML='<div class="empty">No se pudieron cargar las solicitudes. Verifica el acceso a Panorama Core.</div>';return}
 finally{corePayrollLoading=false;}
 renderCorePayrollRequests();
}
function openCorePayrollPayment(requestId){
 const req=corePayrollRequests.find(r=>r.id===requestId);if(!req)return;
 const name=req.employees?.full_name||'Empleado';
 openModal('<h2>Confirmar pago de nómina</h2><div class="notice"><b>'+esc(name)+'</b><br>'+esc(req.period_start)+' al '+esc(req.period_end)+' · <b>'+money(req.amount)+'</b></div><form id="corePayrollPaymentForm" data-request-id="'+esc(req.id)+'"><div class="formGrid"><div class="field"><label>Cuenta / dinero</label><select class="select" name="account">'+accountOptions()+'</select></div><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+today()+'" required></div><div class="field full"><label>Nota (opcional)</label><input class="input" name="note"></div></div><div class="modalActions"><button type="button" class="btn" id="cancelCorePayroll">Cancelar</button><button class="btn primary">Confirmar pago</button></div></form>');
 document.getElementById('cancelCorePayroll').addEventListener('click',closeModal);
 document.getElementById('corePayrollPaymentForm').addEventListener('submit',async ev=>{
   ev.preventDefault();
   const form=ev.currentTarget,data=new FormData(form),account=getAccount(data.get('account'));
   if(!account||Number(account.balance)<Number(req.amount)){alert('Selecciona una cuenta con saldo suficiente.');return}
   const movementId=uid(),recordId=uid(),paidAt=new Date(String(data.get('date'))+'T12:00:00').toISOString();
   const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
   try{
     await window.PanoramaCoreFinance.confirm(req,movementId,account.id,paidAt,String(data.get('note')||'').trim());
     account.balance-=Number(req.amount);
     db.payrollPeriods.push({id:recordId,created:Date.now(),employeeId:req.employee_id,employeeName:name,amount:Number(req.amount),accountId:account.id,date:data.get('date'),origin:'external',externalId:req.id,coreRequestId:req.id});
     db.moves.push({id:movementId,created:Date.now(),origin:'nomina',externalId:req.id,sourceRecordId:recordId,type:'salida',date:data.get('date'),amount:Number(req.amount),concept:'Nómina — '+name,category:'nomina',from:account.id,to:null,account:account.id,note:String(data.get('note')||'')});
     save();closeModal();await refreshCorePayrollRequests();
   }catch(error){console.error('No se pudo confirmar el pago de nómina',error);alert('No se confirmó el pago. No se descontó ningún saldo local.');submit.disabled=false;}
 });
}
window.addEventListener('panorama-core-finance-ready',()=>refreshCorePayrollRequests());

function renderPayroll(){
 const eb=document.getElementById('payrollEmployeesBody'),pb=document.getElementById('payrollPaymentsBody');
 const active=(db.payrollEmployees||[]).filter(e=>e.active!==false);
 if(eb){
  eb.innerHTML=active.map(e=>'<tr><td><b>'+esc(e.name)+'</b></td><td>'+money(e.defaultPay||0)+'</td><td><span class="statusPill">Activo</span></td><td><button class="btn" data-edit-payroll="'+e.id+'">Editar</button></td></tr>').join('')||'<tr><td colspan="4"><div class="empty">Sin empleados registrados.</div></td></tr>';
  document.querySelectorAll('[data-edit-payroll]').forEach(b=>b.addEventListener('click',()=>openPayrollEmployee(b.dataset.editPayroll)));
 }
 if(pb){
  pb.innerHTML=(db.payrollPeriods||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(x=>'<tr><td>'+esc(x.date)+'</td><td><b>'+esc(x.employeeName)+'</b></td><td>'+money(x.amount)+'</td><td>'+esc(getAccount(x.accountId)?.name||'—')+'</td><td><span class="originPill">'+esc(x.origin==='external'?'App de Nómina':'Local')+'</span></td></tr>').join('')||'<tr><td colspan="5"><div class="empty">Aún no hay pagos de nómina.</div></td></tr>';
 }
 const count=document.getElementById('payrollActiveCount'),total=document.getElementById('payrollPeriodTotal');
 if(count)count.textContent=active.length;
 if(total)total.textContent=money((db.payrollPeriods||[]).reduce((s,x)=>s+Number(x.amount||0),0));
}

function openPayrollEmployee(id){
 const e=id?db.payrollEmployees.find(x=>x.id===id):null;
 openModal('<h2>'+(e?'Editar empleado':'Nuevo empleado')+'</h2><form id="payrollEmployeeForm" data-employee-id="'+esc(e?.id||'')+'"><div class="formGrid"><div class="field"><label>Nombre</label><input class="input" name="name" value="'+esc(e?.name||'')+'" required></div><div class="field"><label>Pago habitual</label><input class="input" name="pay" type="number" min="0" step="0.01" value="'+Number(e?.defaultPay||0)+'" required></div></div><div class="modalActions"><button type="button" class="btn" id="cancelPayrollEmployee">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>');
}

function openPayrollPayment(){const em=db.payrollEmployees;if(!em.length){alert('Primero agrega un empleado.');return}openModal('<h2>Registrar pago de nómina</h2><form id="payrollPaymentForm"><div class="formGrid"><div class="field"><label>Empleado</label><select class="select" name="employee">'+em.map(e=>'<option value="'+e.id+'">'+esc(e.name)+'</option>').join('')+'</select></div><div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Cuenta / dinero</label><select class="select" name="account">'+accountOptions()+'</select></div><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+today()+'" required></div><div class="field"><label>Origen</label><select class="select" name="origin"><option value="local">Local / excepción</option><option value="external">App de Nómina</option></select></div><div class="field"><label>Referencia externa</label><input class="input" name="externalId"></div></div><div class="notice">Cuando exista la integración, el pago podrá llegar desde la app de Nómina sin recapturarlo.</div><div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Pagar</button></div></form>');document.getElementById('cancelModal').addEventListener('click',closeModal);document.getElementById('payrollPaymentForm').addEventListener('submit',ev=>{ev.preventDefault();const f=new FormData(ev.target),e=em.find(x=>x.id===f.get('employee')),amount=Number(f.get('amount')),acc=getAccount(f.get('account'));if(!e||amount<=0||!acc||acc.balance<amount){alert('Revisa los datos y el saldo.');return}acc.balance-=amount;const rec={id:uid(),created:Date.now(),employeeId:e.id,employeeName:e.name,amount,accountId:acc.id,date:f.get('date'),origin:f.get('origin'),externalId:f.get('externalId')||''};db.payrollPeriods.push(rec);db.moves.push({id:uid(),created:Date.now(),origin:'nomina',externalId:rec.externalId,sourceRecordId:rec.id,type:'salida',date:rec.date,amount,concept:'Nómina — '+e.name,category:'nomina',from:acc.id,to:null,account:acc.id,note:'Pago de nómina'});save();closeModal()})}

function renderFixedPayments(){
 const body=document.getElementById('fixedPaymentsBody');if(!body)return;
 const rows=(db.fixedPayments||[]).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
 body.innerHTML=rows.map(x=>'<tr><td><b>'+esc(x.concept)+'</b></td><td>'+money(x.amount)+'</td><td>'+esc(x.date)+'</td><td><span class="'+(x.status==='pagado'?'green':'red')+'">'+(x.status==='pagado'?'Pagado':'Pendiente')+'</span></td><td>'+esc(getAccount(x.accountId)?.name||'—')+'</td><td><button class="btn" data-fixed="'+x.id+'">'+(x.status==='pagado'?'Ver':'Pagar')+'</button></td></tr>').join('')||'<tr><td colspan="6"><div class="empty">No hay pagos fijos registrados.</div></td></tr>';
 document.querySelectorAll('[data-fixed]').forEach(b=>b.addEventListener('click',()=>openFixedPayment(b.dataset.fixed)));
 const pending=document.getElementById('fixedPendingTotal'),paid=document.getElementById('fixedPaidTotal');
 if(pending)pending.textContent=money(rows.filter(x=>x.status!=='pagado').reduce((s,x)=>s+Number(x.amount||0),0));
 if(paid)paid.textContent=money(rows.filter(x=>x.status==='pagado').reduce((s,x)=>s+Number(x.amount||0),0));
}

function openFixedPayment(id){
 const x=id?db.fixedPayments.find(a=>a.id===id):null;
 openModal('<h2>'+(x?'Editar pago fijo':'Nuevo pago fijo')+'</h2><form id="fixedPaymentForm" data-fixed-id="'+esc(x?.id||'')+'"><div class="formGrid"><div class="field"><label>Concepto</label><input class="input" name="concept" value="'+esc(x?.concept||'')+'" placeholder="Ej. Internet" required></div><div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" value="'+Number(x?.amount||0)+'" required></div><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+esc(x?.date||today())+'" required></div><div class="field"><label>Cuenta / dinero</label><select class="select" name="account">'+accountOptions()+'</select></div><div class="field full"><label>Estado</label><select class="select" name="status"><option value="pendiente">Pendiente</option><option value="pagado">Pagado</option></select><div class="fieldHelp">Pendiente: registra la obligación. Pagado: descuenta la cuenta y genera el movimiento.</div></div><div class="field full"><label>Nota <span class="muted">(opcional)</span></label><input class="input" name="note" value="'+esc(x?.note||'')+'" placeholder="Ej. pago mensual"></div></div><div class="modalActions"><button type="button" class="btn" id="cancelFixedPayment">Cancelar</button><button type="submit" class="btn primary">Guardar</button></div></form>');
 const form=document.getElementById('fixedPaymentForm'); if(!form)return;
 if(x){form.querySelector('[name="status"]').value=x.status||'pendiente';form.querySelector('[name="account"]').value=x.accountId||''}
 const sync=()=>{form.querySelector('[name="account"]').disabled=form.querySelector('[name="status"]').value!=='pagado'};form.querySelector('[name="status"]').addEventListener('change',sync);sync();
 document.getElementById('cancelFixedPayment')?.addEventListener('click',closeModal);
}

function providerPurchaseTotal(pid){
 return (db.providerPurchases||[]).filter(x=>x.providerId===pid).reduce((s,x)=>s+Number(x.amount||0),0);
}
function providerPaidTotal(pid){
 const cash=(db.providerPurchases||[]).filter(x=>x.providerId===pid&&x.mode==='cash').reduce((s,x)=>s+Number(x.amount||0),0);
 const payments=(db.providerPayments||[]).filter(x=>x.providerId===pid).reduce((s,x)=>s+Number(x.amount||0),0);
 return cash+payments;
}
function providerPending(pid){return Math.max(0,Number(db.providers.find(x=>x.id===pid)?.creditBalance||0))}

function renderProviders(){
 const body=document.getElementById('providersBody');if(!body)return;
 body.innerHTML=(db.providers||[]).map(p=>'<tr><td><b>'+esc(p.name)+'</b></td><td>'+money(providerPurchaseTotal(p.id))+'</td><td>'+money(providerPaidTotal(p.id))+'</td><td class="'+(providerPending(p.id)?'red':'green')+'"><b>'+money(providerPending(p.id))+'</b></td><td><div class="actions"><button class="btn primary" data-provider-purchase="'+p.id+'">＋ Compra</button><button class="btn" data-provider-payment="'+p.id+'">＋ Abonar</button><button class="btn" data-view-provider="'+p.id+'">Ver</button><button class="btn" data-edit-provider="'+p.id+'">Editar</button><button class="btn danger" data-del-provider="'+p.id+'">Eliminar</button></div></td></tr>').join('')||'<tr><td colspan="5"><div class="empty">No hay proveedores.</div></td></tr>';
 document.querySelectorAll('[data-provider-purchase]').forEach(b=>b.addEventListener('click',()=>openProviderPurchase(b.dataset.providerPurchase)));
 document.querySelectorAll('[data-provider-payment]').forEach(b=>b.addEventListener('click',()=>openProviderPayment(b.dataset.providerPayment)));
 document.querySelectorAll('[data-view-provider]').forEach(b=>b.addEventListener('click',()=>openProviderDashboard(b.dataset.viewProvider)));
 document.querySelectorAll('[data-edit-provider]').forEach(b=>b.addEventListener('click',()=>openProvider(b.dataset.editProvider)));
 document.querySelectorAll('[data-del-provider]').forEach(b=>b.addEventListener('click',()=>deleteProvider(b.dataset.delProvider)));
}

function renderCommitments(){
 document.getElementById('commitmentsBody').innerHTML=db.commitments.map(function(c){
  const due=Math.max(0,Number(c.total)-Number(c.paid));
  return '<tr><td><b>'+esc(c.name)+'</b></td><td>'+esc(categoryName('compromiso',c.category))+'</td><td>'+money(c.total)+'</td><td>'+money(c.paid)+'</td><td class="'+(due?'red':'green')+'"><b>'+money(due)+'</b></td><td>'+esc(c.dueDate||'—')+'</td><td><div class="actions"><button class="btn greenBtn" data-pay-commitment="'+c.id+'">Registrar pago</button><button class="btn" data-del-commitment="'+c.id+'">Eliminar</button></div></td></tr>';
 }).join('')||'<tr><td colspan="7"><div class="empty">Sin compromisos.</div></td></tr>';
 document.querySelectorAll('[data-pay-commitment]').forEach(function(b){b.addEventListener('click',function(){openCommitmentPayment(b.dataset.payCommitment)})});
 document.querySelectorAll('[data-del-commitment]').forEach(function(b){b.addEventListener('click',function(){deleteCommitment(b.dataset.delCommitment)})});
}

function renderCuts(){
 document.getElementById('cutsBody').innerHTML=db.cuts.map(function(c){
  const diff=Number(c.real)-Number(c.expected);
  return '<tr><td>'+esc(c.period)+'</td><td>'+esc(c.type)+'</td><td>'+money(c.expected)+'</td><td>'+money(c.real)+'</td><td class="'+(diff===0?'green':'red')+'"><b>'+money(diff)+'</b></td><td>'+esc(c.note||'')+'</td></tr>';
 }).join('')||'<tr><td colspan="6"><div class="empty">Sin cortes.</div></td></tr>';
}

function renderCategories(){
 ['entrada','salida','compromiso'].forEach(function(type){
  const id='cats'+type.charAt(0).toUpperCase()+type.slice(1);
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=db.categories[type].map(function(c){
   return '<div class="row"><div><b>'+esc(c.name)+'</b><div class="muted">'+(c.active?'Activa':'Inactiva')+'</div></div><div class="actions"><button class="btn" data-edit-cat="'+type+'|'+c.id+'">Editar</button><button class="btn" data-toggle-cat="'+type+'|'+c.id+'">'+(c.active?'Desactivar':'Activar')+'</button></div></div>';
  }).join('')||'<div class="empty">Sin categorías.</div>';
 });
 document.querySelectorAll('[data-edit-cat]').forEach(function(b){b.addEventListener('click',function(){const x=b.dataset.editCat.split('|');openCategory(x[0],x[1])})});
 document.querySelectorAll('[data-toggle-cat]').forEach(function(b){b.addEventListener('click',function(){const x=b.dataset.toggleCat.split('|');toggleCategory(x[0],x[1])})});
}

function renderPayments(){
 const pp=document.getElementById('providerPayments'),cp=document.getElementById('commitmentPayments');
 const purchases=(db.providerPurchases||[]).map(x=>({kind:'purchase',created:x.created||0,date:x.date,amount:x.amount,providerId:x.providerId,accountId:x.accountId||null,mode:x.mode,note:x.note||'',id:x.id}));
 const payments=(db.providerPayments||[]).map(x=>({kind:'payment',created:x.created||0,date:x.date,amount:x.amount,providerId:x.providerId,accountId:x.accountId||null,note:x.note||'',id:x.id}));
 const all=purchases.concat(payments).sort((a,b)=>b.created-a.created);
 pp.innerHTML=all.map(function(x){
  const prov=db.providers.find(p=>p.id===x.providerId),acc=getAccount(x.accountId);
  const title=x.kind==='purchase'?(x.mode==='credit'?'Compra a crédito':'Compra de contado'):'Abono / pago de deuda';
  const sign=x.kind==='purchase'&&x.mode==='credit'?'':'−';
  const cls=x.kind==='purchase'&&x.mode==='credit'?'':'red';
  const accountText=x.mode==='credit'?'Sin salida de dinero':(acc?acc.name:'Cuenta no disponible');
  const actions=x.kind==='purchase'
    ? '<button class="btn" data-edit-provider-purchase="'+x.id+'">Editar</button><button class="btn danger" data-del-provider-purchase="'+x.id+'">Eliminar</button>'
    : '<button class="btn" data-edit-provider-payment="'+x.id+'">Editar</button><button class="btn danger" data-del-provider-payment="'+x.id+'">Eliminar</button>';
  return '<div class="row"><div><b>'+esc(prov?prov.name:'Proveedor eliminado')+'</b><div class="muted">'+esc(title)+' · '+esc(x.date)+' · '+esc(accountText)+(x.note?' · '+esc(x.note):'')+'</div></div><div class="actions"><strong class="'+cls+'">'+sign+money(x.amount)+'</strong>'+actions+'</div></div>';
 }).join('')||'<div class="empty">Sin operaciones de proveedores.</div>';

 cp.innerHTML=db.commitmentPayments.slice().sort((a,b)=>b.created-a.created).map(function(p){
  const c=db.commitments.find(x=>x.id===p.commitmentId),acc=getAccount(p.accountId);
  return '<div class="row"><div><b>'+esc(c?c.name:'Compromiso eliminado')+'</b><div class="muted">'+p.date+' · '+esc(acc?acc.name:'')+' · '+esc(p.note||'')+'</div></div><div class="actions"><strong class="red">−'+money(p.amount)+'</strong><button class="btn" data-edit-commitment-payment="'+p.id+'">Editar</button><button class="btn danger" data-del-commitment-payment="'+p.id+'">Eliminar</button></div></div>';
 }).join('')||'<div class="empty">Sin pagos de compromisos.</div>';

 document.querySelectorAll('[data-edit-provider-purchase]').forEach(function(b){b.addEventListener('click',function(){editProviderPurchase(b.dataset.editProviderPurchase)})});
 document.querySelectorAll('[data-del-provider-purchase]').forEach(function(b){b.addEventListener('click',function(){deleteProviderPurchase(b.dataset.delProviderPurchase)})});
 document.querySelectorAll('[data-edit-provider-payment]').forEach(function(b){b.addEventListener('click',function(){editPayment('provider',b.dataset.editProviderPayment)})});
 document.querySelectorAll('[data-del-provider-payment]').forEach(function(b){b.addEventListener('click',function(){deletePayment('provider',b.dataset.delProviderPayment)})});
 document.querySelectorAll('[data-edit-commitment-payment]').forEach(function(b){b.addEventListener('click',function(){editPayment('commitment',b.dataset.editCommitmentPayment)})});
 document.querySelectorAll('[data-del-commitment-payment]').forEach(function(b){b.addEventListener('click',function(){deletePayment('commitment',b.dataset.delCommitmentPayment)})});
}

function findPayment(kind,pid){
 return (kind==='provider'?db.providerPayments:db.commitmentPayments).find(p=>p.id===pid);
}
function linkedEntity(kind,p){
 return kind==='provider'?db.providers.find(x=>x.id===p.providerId):db.commitments.find(x=>x.id===p.commitmentId);
}
function editPayment(kind,pid){
 const list=kind==='provider'?db.providerPayments:db.commitmentPayments;
 const p=findPayment(kind,pid), entity=linkedEntity(kind,p);
 if(!p||!entity)return;
 const otherPaid=Math.max(0,Number(entity.paid||0)-Number(p.amount||0));
 openModal('<h2>Editar pago</h2><div class="notice"><b>'+esc(entity.name)+'</b><br>Este cambio corregirá también el movimiento financiero.</div>'+
 '<form id="editPaymentForm"><div class="formGrid">'+
 '<div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+esc(p.date)+'" required></div>'+
 '<div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" value="'+Number(p.amount)+'" required></div>'+
 '<div class="field"><label>Cuenta / caja</label><select class="select" name="account">'+accountOptions()+'</select></div>'+
 '<div class="field"><label>Nota</label><input class="input" name="note" value="'+esc(p.note||'')+'"></div>'+
 '</div><div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar cambios</button></div></form>');
 document.querySelector('#editPaymentForm select[name="account"]').value=p.accountId;
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 document.getElementById('editPaymentForm').addEventListener('submit',function(e){
  e.preventDefault();
  const f=new FormData(e.target), amount=Number(f.get('amount')), newAcc=getAccount(f.get('account')), oldAcc=getAccount(p.accountId);
  if(amount<=0||!newAcc||!oldAcc){alert('Revisa importe y cuenta.');return}
  if(amount>otherPaid+amount && false)return;
  // Restore old payment effect first.
  if(oldAcc) oldAcc.balance+=Number(p.amount);
  entity.paid=otherPaid;
  // Then apply new payment effect.
  if(newAcc.id!==oldAcc.id && newAcc.balance<amount){oldAcc.balance-=Number(p.amount);entity.paid+=Number(p.amount);alert('La nueva cuenta no tiene saldo suficiente.');return}
  if(newAcc.balance<amount){oldAcc.balance-=Number(p.amount);entity.paid+=Number(p.amount);alert('La cuenta no tiene saldo suficiente para ese pago.');return}
  newAcc.balance-=amount;
  entity.paid+=amount;
  p.amount=amount;p.accountId=newAcc.id;p.date=f.get('date');p.note=f.get('note');
  const mv=db.moves.find(m=>m.linkedType===kind&&m.linkedId===entity.id&&m.amount===Number(document.querySelector('#editPaymentForm input[name="amount"]').defaultValue));
  // Match the linked movement by payment metadata stored below; fall back to latest matching movement.
  let linked=db.moves.find(m=>m.paymentId===p.id);
  if(!linked) linked=db.moves.slice().reverse().find(m=>m.linkedType===kind&&m.linkedId===entity.id&&m.type==='salida');
  if(linked){linked.amount=amount;linked.account=newAcc.id;linked.from=newAcc.id;linked.date=p.date;linked.note=p.note;linked.concept='Pago — '+entity.name}
  save();closeModal();
 });
}
function deletePayment(kind,pid){
 const list=kind==='provider'?db.providerPayments:db.commitmentPayments;
 const idx=list.findIndex(p=>p.id===pid);if(idx<0)return;
 const p=list[idx], entity=linkedEntity(kind,p), acc=getAccount(p.accountId);
 if(!confirm('¿Eliminar este pago? Se revertirá la salida financiera y el saldo pendiente.'))return;
 if(acc)acc.balance+=Number(p.amount);
 if(entity)entity.paid=Math.max(0,Number(entity.paid)-Number(p.amount));
 db.moves=db.moves.filter(m=>m.paymentId!==pid);
 list.splice(idx,1);
 save();
}

function openMovement(type){
 const isOut=type==='salida',providers=db.providers||[],transfer=type==='transferencia';
 if(transfer){
  openModal('<h2>Nueva transferencia</h2><form id="movementForm"><div class="formGrid"><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+today()+'" required></div><div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Origen</label><select class="select" name="from">'+accountOptions()+'</select></div><div class="field"><label>Destino</label><select class="select" name="to">'+accountOptions()+'</select></div><div class="field full"><label>Nota</label><input class="input" name="note"></div></div><div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar</button></div></form>');
  document.getElementById('cancelModal').addEventListener('click',closeModal);
  document.getElementById('movementForm').addEventListener('submit',function(e){e.preventDefault();const f=new FormData(e.target),amt=Number(f.get('amount')),from=getAccount(f.get('from')),to=getAccount(f.get('to'));if(amt<=0||!from||!to||from.id===to.id){alert('Revisa origen, destino e importe.');return}if(from.balance<amt){alert('La cuenta de origen no tiene saldo suficiente.');return}from.balance-=amt;to.balance+=amt;db.moves.push({id:uid(),created:Date.now(),origin:'manual',type:'transferencia',date:f.get('date'),amount:amt,concept:'Transferencia',category:'',from:from.id,to:to.id,account:from.id,note:f.get('note')});save();closeModal()});return;
 }
 openModal('<h2>'+ (isOut?'Nueva salida':'Nueva entrada') +'</h2><form id="movementForm"><div class="formGrid"><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+today()+'" required></div><div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" required></div>'+
 (isOut?'<div class="field"><label>Categoría</label><select class="select" name="category">'+categoryOptions('salida')+'</select></div>':'')+
 '<div class="field"><label>Cuenta / dinero</label><select class="select" name="account">'+accountOptions()+'</select></div>'+
 '<div class="field"><label>Origen del registro</label><select class="select" name="origin"><option value="manual">Manual / excepción</option><option value="nomina">Nómina externa</option><option value="loyverse">Loyverse</option></select></div>'+
 '<div class="field"><label>Referencia externa (opcional)</label><input class="input" name="externalId" placeholder="ID de nómina, folio, etc."></div>'+
 '<div class="field full"><label>Concepto / Nota</label><input class="input" name="note"></div></div><div class="notice">En el uso normal, los módulos de Proveedores, Nómina, Pagos fijos y Compromisos generarán estos movimientos automáticamente. Este formulario queda para excepciones o registros externos.</div><div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar</button></div></form>');
 const form=document.getElementById('movementForm'),account=form.querySelector('[name="account"]');
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 form.addEventListener('submit',function(e){
  e.preventDefault();
  const f=new FormData(form),amount=Number(f.get('amount')),acc=getAccount(f.get('account'));
  if(amount<=0||!acc){alert('Revisa importe y cuenta.');return}
  if(isOut&&acc.balance<amount){alert('La cuenta no tiene saldo suficiente.');return}
  if(isOut)acc.balance-=amount;else acc.balance+=amount;
  db.moves.push({id:uid(),created:Date.now(),origin:f.get('origin')||'manual',externalId:f.get('externalId')||'',type:isOut?'salida':'entrada',date:f.get('date'),amount,concept:f.get('note')|| (isOut?'Salida manual':'Entrada manual'),category:f.get('category')||'',from:isOut?acc.id:null,to:isOut?null:acc.id,account:acc.id,note:f.get('note')});
  save();closeModal();
 });
}

function registerIntegrationEvent(payload){
 const p=payload||{};
 const event={
  id:p.id||uid(),
  source:p.source||'external',
  type:p.type||'financial_event',
  externalId:p.externalId||'',
  date:p.date||today(),
  amount:Number(p.amount||0),
  accountId:p.accountId||null,
  concept:p.concept||'Movimiento externo',
  metadata:p.metadata||{},
  created:Date.now()
 };
 db.integrationEvents=db.integrationEvents||[];
 db.integrationEvents.push(event);
 return event.id;
}
function applyExternalFinancialEvent(payload){
 const p=payload||{},source=p.source||'external',acc=getAccount(p.accountId);
 if(!acc)throw new Error('Cuenta no encontrada');
 const amount=Number(p.amount||0);
 if(amount<=0)throw new Error('Importe inválido');
 const direction=p.direction||'out';
 if(direction==='out'){
  if(acc.balance<amount)throw new Error('Saldo insuficiente');
  acc.balance-=amount;
 }else{
  acc.balance+=amount;
 }
 const id=registerIntegrationEvent(p);
 db.moves.push({
  id:uid(),created:Date.now(),origin:source,externalId:p.externalId||id,
  type:direction==='out'?'salida':'entrada',date:p.date||today(),
  amount,concept:p.concept||'Movimiento externo',category:p.category||source,
  from:direction==='out'?acc.id:null,to:direction==='out'?null:acc.id,
  account:acc.id,note:p.note||'',integrationEventId:id
 });
 save();
 return id;
}
function openAccount(editId){
 const existing=editId?getAccount(editId):null;
 openModal('<h2>'+ (existing?'Editar cuenta':'Nueva cuenta') +'</h2>'+
 '<form id="accountForm"><div class="formGrid">'+
 '<div class="field"><label>Nombre de la cuenta</label><input class="input" name="name" value="'+esc(existing?.name||'')+'" required></div>'+
 '<div class="field"><label>Tipo de dinero</label><select class="select" name="kind">'+
 '<option value="cash" '+(existing&&accountKind(existing)==='Efectivo'?'selected':'')+'>Efectivo</option>'+
 '<option value="digital" '+(existing&&accountKind(existing)==='Digital'?'selected':'')+'>Digital</option>'+
 '</select></div>'+
 '<div class="field"><label>Saldo actual</label><input class="input" name="balance" type="number" min="0" step="0.01" value="'+Number(existing?.balance||0).toFixed(2)+'" required></div>'+
 '<div class="field"><label>Estado</label><select class="select" name="active"><option value="true" '+(existing?.active!==false?'selected':'')+'>Activa</option><option value="false" '+(existing?.active===false?'selected':'')+'>Inactiva</option></select></div>'+
 '</div>'+
 (existing?'<div class="notice">Cambiar el saldo aquí modifica el saldo de la cuenta. Para una corrección auditada del saldo usa <b>Ajustar saldo</b>.</div>':'')+
 '<div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar</button></div></form>');
 const form=document.getElementById('accountForm');
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 form.addEventListener('submit',function(e){
   e.preventDefault();
   const f=new FormData(form),name=f.get('name').trim(),balance=Number(f.get('balance'));
   if(!name||!Number.isFinite(balance)||balance<0){alert('Revisa nombre y saldo.');return}
   if(existing){
     existing.name=name;
     existing.balance=balance;
     existing.active=f.get('active')!=='false';
     existing.kind=f.get('kind');
     existing.type=f.get('kind')==='cash'?'Efectivo':'Digital';
   }else{
     db.accounts.push({id:uid(),name,balance,active:true,kind:f.get('kind'),type:f.get('kind')==='cash'?'Efectivo':'Digital'});
   }
   save();closeModal();
 });
}
function openAdjustmentHistory(accountId){
 const a=getAccount(accountId);if(!a)return;
 const rows=(db.adjustments||[]).filter(x=>x.accountId===accountId).sort((x,y)=>(y.created||0)-(x.created||0));
 openModal('<h2>Historial de ajustes — '+esc(a.name)+'</h2>'+
 (rows.length?rows.map(x=>'<div class="row"><div><b>'+esc(x.date)+'</b><div class="muted">'+esc(x.reason)+'</div><div class="muted">'+money(x.previousBalance)+' → '+money(x.newBalance)+'</div></div><strong class="'+(x.difference>=0?'green':'red')+'">'+(x.difference>=0?'+':'')+money(x.difference)+'</strong></div>').join(''):'<div class="empty">No hay ajustes registrados.</div>')+
 '<div class="modalActions"><button class="btn" id="cancelModal">Cerrar</button></div>');
 document.getElementById('cancelModal').addEventListener('click',closeModal);
}

function openAccountAdjustment(accountId){
 const a=getAccount(accountId);if(!a)return;
 const current=Number(a.balance||0);
 openModal('<h2>Ajustar saldo</h2>'+
 '<div class="notice">Este ajuste corrige el saldo registrado para que coincida con el saldo real. No se registra como una entrada o salida ficticia.</div>'+
 '<form id="adjustBalanceForm"><div class="formGrid">'+
 '<div class="field"><label>Cuenta</label><input class="input" value="'+esc(a.name)+'" disabled></div>'+
 '<div class="field"><label>Saldo registrado</label><input class="input" value="'+money(current)+'" disabled></div>'+
 '<div class="field"><label>Saldo real</label><input class="input" name="newBalance" type="number" min="0" step="0.01" value="'+current.toFixed(2)+'" required></div>'+
 '<div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+today()+'" required></div>'+
 '<div class="field full"><label>Motivo</label><input class="input" name="reason" placeholder="Ej. Corrección de saldo inicial" required></div>'+
 '</div><div id="adjustDiff" class="notice"></div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar ajuste</button></div></form>');
 const form=document.getElementById('adjustBalanceForm'),bal=form.querySelector('[name="newBalance"]'),diff=document.getElementById('adjustDiff');
 function updateDiff(){
  const n=Number(bal.value||0),d=n-current;
  diff.textContent='Diferencia: '+(d>=0?'+':'')+money(d);
 }
 bal.addEventListener('input',updateDiff);updateDiff();
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 form.addEventListener('submit',function(e){
  e.preventDefault();
  const n=Number(bal.value),reason=form.querySelector('[name="reason"]').value.trim();
  if(!Number.isFinite(n)||n<0||!reason){alert('Revisa el saldo y el motivo.');return}
  const old=Number(a.balance||0),delta=n-old;
  a.balance=n;
  db.adjustments=db.adjustments||[];
  db.adjustments.push({
   id:uid(),created:Date.now(),date:form.querySelector('[name="date"]').value,
   accountId:a.id,accountName:a.name,previousBalance:old,newBalance:n,difference:delta,reason
  });
  save();closeModal();
 });
}

function openProviderDashboard(pid){
 const p=db.providers.find(x=>x.id===pid);if(!p)return;const purchases=db.providerPurchases.filter(x=>x.providerId===pid),payments=db.providerPayments.filter(x=>x.providerId===pid);
 const rows=purchases.map(x=>'<div class="row"><div><b>Compra '+(x.mode==='credit'?'a crédito':'de contado')+'</b><div class="muted">'+esc(x.date)+' · '+esc(x.note||'')+'</div></div><strong>'+money(x.amount)+'</strong></div>').concat(payments.map(x=>'<div class="row"><div><b>Abono</b><div class="muted">'+esc(x.date)+' · '+esc(getAccount(x.accountId)?.name||'')+'</div></div><strong class="red">−'+money(x.amount)+'</strong></div>'));
 openModal('<h2>'+esc(p.name)+'</h2><div class="cards"><div class="card"><div class="label">Comprado</div><div class="number">'+money(providerPurchaseTotal(pid))+'</div></div><div class="card"><div class="label">Pagado</div><div class="number">'+money(providerPaidTotal(pid))+'</div></div><div class="card"><div class="label">Pendiente</div><div class="number '+(providerPending(pid)?'red':'green')+'">'+money(providerPending(pid))+'</div></div></div><div class="panel"><h2>Historial</h2>'+(rows.join('')||'<div class="empty">Sin operaciones.</div>')+'</div><div class="modalActions"><button class="btn" id="cancelModal">Cerrar</button></div>');document.getElementById('cancelModal').addEventListener('click',closeModal);
}

function openProvider(editId){
 const p=editId?db.providers.find(x=>x.id===editId):{name:'',paymentType:'Contado',note:''};
 openModal('<h2>'+(editId?'Editar proveedor':'Nuevo proveedor')+'</h2><form id="providerForm"><div class="formGrid">'+
 '<div class="field full"><label>Proveedor</label><input class="input" name="name" value="'+esc(p.name)+'" required></div>'+
 '<div class="field"><label>Forma habitual de pago</label><select class="select" name="paymentType"><option '+(p.paymentType==='Contado'?'selected':'')+'>Contado</option><option '+(p.paymentType==='Crédito'?'selected':'')+'>Crédito</option><option '+(p.paymentType==='Mixto'?'selected':'')+'>Mixto</option></select></div>'+
 '<div class="field"><label>Nota</label><input class="input" name="note" value="'+esc(p.note||'')+'"></div></div>'+
 '<div class="notice">No captures aquí una deuda. La deuda aparece únicamente al registrar una compra a crédito.</div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar</button></div></form>');
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 document.getElementById('providerForm').addEventListener('submit',function(e){e.preventDefault();const f=new FormData(e.target);if(editId){p.name=f.get('name');p.paymentType=f.get('paymentType');p.note=f.get('note')}else db.providers.push({id:uid(),name:f.get('name'),paymentType:f.get('paymentType'),note:f.get('note'),creditBalance:0});save();closeModal()});
}

function editProviderPurchase(id){
 const x=(db.providerPurchases||[]).find(a=>a.id===id);if(!x)return;
 const p=db.providers.find(a=>a.id===x.providerId);if(!p)return;
 openModal('<h2>Editar compra</h2><div class="notice"><b>'+esc(p.name)+'</b><br>Editar una compra puede modificar el saldo y/o la cuenta afectada.</div>'+
 '<form id="editProviderPurchaseForm"><div class="formGrid"><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+esc(x.date)+'" required></div>'+
 '<div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" value="'+Number(x.amount)+'" required></div>'+
 '<div class="field"><label>Forma</label><select class="select" name="mode"><option value="cash">Contado</option><option value="credit">Crédito</option></select></div>'+
 '<div class="field"><label>Cuenta / caja</label><select class="select" name="account">'+accountOptions()+'</select></div>'+
 '<div class="field full"><label>Nota</label><input class="input" name="note" value="'+esc(x.note||'')+'"></div></div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelEditPurchase">Cancelar</button><button type="submit" class="btn primary">Guardar cambios</button></div></form>');
 const f=document.getElementById('editProviderPurchaseForm');
 f.querySelector('[name="mode"]').value=x.mode||'cash';f.querySelector('[name="account"]').value=x.accountId||'';
 const sync=()=>{f.querySelector('[name="account"]').disabled=f.querySelector('[name="mode"]').value!=='cash'};
 f.querySelector('[name="mode"]').addEventListener('change',sync);sync();
 document.getElementById('cancelEditPurchase').addEventListener('click',closeModal);
 f.addEventListener('submit',function(e){
  e.preventDefault();
  const d=new FormData(f),amount=Number(d.get('amount')),mode=String(d.get('mode')),newAcc=getAccount(d.get('account'));
  if(!Number.isFinite(amount)||amount<=0){alert('El importe no es válido.');return}
  // Revert original financial effect first.
  if(x.mode==='cash'){
    const oldAcc=getAccount(x.accountId);
    if(oldAcc)oldAcc.balance+=Number(x.amount);
  }else{
    p.creditBalance=Math.max(0,Number(p.creditBalance||0)-Number(x.amount));
  }
  // Update the linked movement.
  const mv=db.moves.find(m=>m.linkedType==='providerPurchase'&&m.linkedId===x.id);
  if(mode==='cash'){
    if(!newAcc||Number(newAcc.balance)<amount){
      // restore original effect if validation fails
      if(x.mode==='cash'){const oldAcc=getAccount(x.accountId);if(oldAcc)oldAcc.balance-=Number(x.amount)}
      else p.creditBalance=Number(p.creditBalance||0)+Number(x.amount);
      alert('La cuenta no tiene saldo suficiente.');return;
    }
    newAcc.balance-=amount;
    x.accountId=newAcc.id;x.mode='cash';
    p.creditBalance=Number(p.creditBalance||0);
    if(mv){mv.type='salida';mv.date=d.get('date');mv.amount=amount;mv.account=newAcc.id;mv.from=newAcc.id;mv.concept='Compra — '+p.name;mv.note=d.get('note')||'';mv.credit=false}
  }else{
    x.accountId=null;x.mode='credit';p.creditBalance=Number(p.creditBalance||0)+amount;
    if(mv){mv.type='compra_credito';mv.date=d.get('date');mv.amount=amount;mv.account=null;mv.from=null;mv.to=null;mv.concept='Compra a crédito — '+p.name;mv.note=d.get('note')||'';mv.credit=true}
  }
  x.amount=amount;x.date=d.get('date');x.note=d.get('note')||'';
  save();renderProviders();renderPayments();closeModal();
 });
}
function deleteProviderPurchase(id){
 const x=(db.providerPurchases||[]).find(a=>a.id===id);if(!x)return;
 const p=db.providers.find(a=>a.id===x.providerId);
 if(!confirm('¿Eliminar esta compra? Se revertirá su efecto financiero.'))return;
 if(x.mode==='cash'){
  const acc=getAccount(x.accountId);if(acc)acc.balance+=Number(x.amount||0);
 }else if(p){
  p.creditBalance=Math.max(0,Number(p.creditBalance||0)-Number(x.amount||0));
 }
 db.providerPurchases=db.providerPurchases.filter(a=>a.id!==id);
 db.moves=db.moves.filter(m=>!(m.linkedType==='providerPurchase'&&m.linkedId===id));
 save();renderProviders();renderPayments();
}
function openProviderPurchase(providerId){
 const p=db.providers.find(x=>x.id===providerId);if(!p)return;
 openModal('<h2>Registrar compra</h2><div class="notice"><b>'+esc(p.name)+'</b><br>Sólo se registra el importe financiero; los productos pertenecen al sistema de compras/inventario.</div>'+
 '<form id="purchaseForm"><div class="formGrid">'+
 '<div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+today()+'" required></div>'+
 '<div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" required></div>'+
 '<div class="field"><label>Forma</label><select class="select" name="paymentType"><option value="cash">Contado</option><option value="credit">Crédito</option></select></div>'+
 '<div class="field"><label>Cuenta / caja</label><select class="select" name="account">'+accountOptions()+'</select></div>'+
 '<div class="field full"><label>Nota</label><input class="input" name="note"></div></div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button type="submit" class="btn primary">Guardar compra</button></div></form>');
 const form=document.getElementById('purchaseForm');
 const sync=()=>{form.querySelector('[name="account"]').disabled=form.querySelector('[name="paymentType"]').value!=='cash'};
 form.querySelector('[name="paymentType"]').addEventListener('change',sync);sync();
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 form.addEventListener('submit',function(e){
  e.preventDefault();
  const f=new FormData(e.target),amount=Number(f.get('amount')),type=String(f.get('paymentType')),acc=getAccount(f.get('account'));
  if(!Number.isFinite(amount)||amount<=0){alert('El importe no es válido.');return}
  if(type==='cash'&&(!acc||Number(acc.balance)<amount)){alert('La cuenta no tiene saldo suficiente.');return}
  const purchase={id:uid(),created:Date.now(),providerId:p.id,date:f.get('date'),amount,mode:type,accountId:type==='cash'?acc.id:null,note:f.get('note')||''};
  db.providerPurchases=db.providerPurchases||[];db.providerPurchases.push(purchase);
  if(type==='cash'){
    acc.balance-=amount;
    db.moves.push({id:uid(),created:Date.now(),type:'salida',date:purchase.date,amount,concept:'Compra — '+p.name,category:'proveedores',from:acc.id,to:null,account:acc.id,note:purchase.note,linkedType:'providerPurchase',linkedId:purchase.id});
  }else{
    p.creditBalance=Number(p.creditBalance||0)+amount;
    db.moves.push({id:uid(),created:Date.now(),type:'compra_credito',date:purchase.date,amount,concept:'Compra a crédito — '+p.name,category:'proveedores',from:null,to:null,account:null,note:purchase.note,linkedType:'providerPurchase',linkedId:purchase.id,credit:true});
  }
  save();renderProviders();renderPayments();closeModal();
 });
}

function openCommitment(){
 openModal('<h2>Nuevo compromiso</h2><form id="commitmentForm"><div class="formGrid">'+
  '<div class="field"><label>Concepto</label><input class="input" name="name" placeholder="Ej. Tanda" required></div>'+
  '<div class="field"><label>Categoría</label><select class="select" name="category">'+categoryOptions('compromiso')+'</select></div>'+
  '<div class="field"><label>Total</label><input class="input" name="total" type="number" min="0" step="0.01" required></div>'+
  '<div class="field"><label>Pagado acumulado (informativo)</label><input class="input" name="paid" type="number" min="0" step="0.01" value="0"></div>'+
  '<div class="field"><label>Fecha límite (opcional)</label><input class="input" name="dueDate" type="date"></div>'+
  '<div class="field"><label>Nota</label><input class="input" name="note"></div>'+
  '</div><div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar</button></div></form>');
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 document.getElementById('commitmentForm').addEventListener('submit',function(e){
  e.preventDefault();const f=new FormData(e.target),total=Number(f.get('total')),paid=Number(f.get('paid'));
  if(paid>total){alert('El pagado no puede superar el total.');return}
  db.commitments.push({id:uid(),name:f.get('name'),category:f.get('category'),total:total,paid:paid,dueDate:f.get('dueDate'),note:f.get('note')});save();closeModal();
 });
}

function recordPayment(kind,entityId){
 const list=kind==='provider'?db.providers:db.commitments,entity=list.find(x=>x.id===entityId);if(!entity)return;
 const due=kind==='provider'?Math.max(0,Number(entity.creditBalance||0)):Math.max(0,Number(entity.total||0)-Number(entity.paid||0));
 if(due<=0){alert('No hay saldo pendiente.');return}
 const label=kind==='provider'?'proveedor':'compromiso';
 openModal('<h2>Registrar pago</h2><div class="notice"><b>'+esc(entity.name)+'</b><br>Pendiente: '+money(due)+'</div>'+
 '<form id="paymentForm"><div class="formGrid"><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+today()+'" required></div>'+
 '<div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" max="'+due+'" step="0.01" value="'+due+'" required></div>'+
 '<div class="field"><label>Cuenta / caja</label><select class="select" name="account">'+accountOptions()+'</select></div>'+
 '<div class="field"><label>Nota</label><input class="input" name="note"></div></div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Registrar pago y salida</button></div></form>');
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 document.getElementById('paymentForm').addEventListener('submit',function(e){
  e.preventDefault();const f=new FormData(e.target),amount=Number(f.get('amount')),acc=getAccount(f.get('account'));
  if(!Number.isFinite(amount)||amount<=0||amount>due){alert('El pago no puede superar el saldo pendiente de '+money(due)+'.');return}
  if(!acc||Number(acc.balance)<amount){alert('La cuenta no tiene saldo suficiente.');return}
  acc.balance-=amount;
  const payment={id:uid(),created:Date.now(),date:f.get('date'),amount,accountId:acc.id,note:f.get('note')||''};
  if(kind==='provider'){payment.providerId=entity.id;db.providerPayments.push(payment);entity.creditBalance=Math.max(0,Number(entity.creditBalance||0)-amount)}
  else {payment.commitmentId=entity.id;entity.paid=Number(entity.paid||0)+amount;db.commitmentPayments.push(payment)}
  db.moves.push({id:uid(),paymentId:payment.id,created:Date.now(),type:'salida',date:payment.date,amount,concept:'Pago — '+entity.name,category:kind==='provider'?'proveedores':(entity.category||'deudas'),from:acc.id,to:null,account:acc.id,note:payment.note,linkedType:kind,linkedId:entity.id});
  save();renderProviders();renderPayments();closeModal();
 });
}

function openProviderPayment(i){recordPayment('provider',i)}
function openCommitmentPayment(i){recordPayment('commitment',i)}

function periodDates(type,dateFrom,dateTo){
 const d=new Date(dateFrom+'T12:00:00');
 let from=dateFrom,to=dateTo||dateFrom;
 if(type==='Diario'){from=dateFrom;to=dateFrom}
 if(type==='Semanal'){
  const day=d.getDay(),diff=(day+6)%7;const f=new Date(d);f.setDate(d.getDate()-diff);const t=new Date(f);t.setDate(f.getDate()+6);
  from=f.toISOString().slice(0,10);to=t.toISOString().slice(0,10);
 }
 if(type==='Quincenal'){
  const y=d.getFullYear(),m=d.getMonth(),day=d.getDate();
  if(day<=15){from=new Date(y,m,1).toISOString().slice(0,10);to=new Date(y,m,15).toISOString().slice(0,10)}
  else {from=new Date(y,m,16).toISOString().slice(0,10);to=new Date(y,m+1,0).toISOString().slice(0,10)}
 }
 if(type==='Mensual'){
  const y=d.getFullYear(),m=d.getMonth();from=new Date(y,m,1).toISOString().slice(0,10);to=new Date(y,m+1,0).toISOString().slice(0,10)
 }
 return {from,to};
}
function calculateCut(from,to){
 const moves=db.moves.filter(m=>m.date>=from&&m.date<=to);
 const entradas=moves.filter(m=>m.type==='entrada').reduce((s,m)=>s+Number(m.amount),0);
 const salidas=moves.filter(m=>m.type==='salida').reduce((s,m)=>s+Number(m.amount),0);
 const transfersIn=moves.filter(m=>m.type==='transferencia').reduce((s,m)=>s+Number(m.amount),0);
 return {entradas,salidas,neto:entradas-salidas,transfersIn};
}
function openCut(){
 openModal('<h2>Nuevo corte</h2><form id="cutForm">'+
 '<div class="field"><label>Tipo de corte</label><select class="select" id="cutType" name="type"><option>Diario</option><option>Semanal</option><option>Quincenal</option><option>Mensual</option><option>Personalizado</option></select></div>'+
 '<div class="formGrid"><div class="field"><label>Desde</label><input class="input" id="cutFrom" name="from" type="date" value="'+today()+'" required></div>'+
 '<div class="field" id="toWrap"><label>Hasta</label><input class="input" id="cutTo" name="to" type="date" value="'+today()+'" required></div></div>'+
 '<div class="notice" id="cutPreview">Selecciona las fechas para calcular el movimiento del periodo.</div>'+
 '<div class="field"><label>Dinero real contado al cierre</label><input class="input" name="real" type="number" step="0.01" required></div>'+
 '<div class="field"><label>Nota</label><textarea class="textarea" name="note"></textarea></div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar corte</button></div></form>');
 const typeEl=document.getElementById('cutType'),fromEl=document.getElementById('cutFrom'),toEl=document.getElementById('cutTo'),preview=document.getElementById('cutPreview');
 
 typeEl.addEventListener('change',refresh);fromEl.addEventListener('change',refresh);toEl.addEventListener('change',refresh);
 document.getElementById('cancelModal').addEventListener('click',closeModal);refresh();
 document.getElementById('cutForm').addEventListener('submit',function(e){
  e.preventDefault();const p=periodDates(typeEl.value,fromEl.value,toEl.value),x=calculateCut(p.from,p.to),f=new FormData(e.target),real=Number(f.get('real'));
  db.cuts.push({id:uid(),period:p.from+' → '+p.to,type:typeEl.value,from:p.from,to:p.to,expected:x.neto,real:real,note:f.get('note')});
  save();closeModal();
 });
}

function accountMovementTotals(accountId,from,to){
 const moves=db.moves.filter(m=>m.date>=from&&m.date<=to);
 let entradas=0,salidas=0;
 moves.forEach(m=>{
  if(m.type==='entrada'&&m.account===accountId) entradas+=Number(m.amount);
  if(m.type==='salida'&&(m.account===accountId||m.from===accountId)) salidas+=Number(m.amount);
  if(m.type==='transferencia'){
   if(m.to===accountId) entradas+=Number(m.amount);
   if(m.from===accountId) salidas+=Number(m.amount);
  }
 });
 return {entradas,salidas};
}
function openingBalance(accountId,from){
 // The current account balance minus all movements on/after the period start
 // yields the balance before the selected period, while preserving transfer direction.
 const acc=getAccount(accountId); if(!acc)return 0;
 const later=db.moves.filter(m=>m.date>=from);
 let delta=0;
 later.forEach(m=>{
  if(m.type==='entrada'&&m.account===accountId) delta+=Number(m.amount);
  if(m.type==='salida'&&m.account===accountId) delta-=Number(m.amount);
  if(m.type==='transferencia'){
   if(m.from===accountId) delta-=Number(m.amount);
   if(m.to===accountId) delta+=Number(m.amount);
  }
 });
 return Number(acc.balance)-delta;
}
function renderReconciliations(){
 const el=document.getElementById('reconciliationsBody');if(!el)return;
 el.innerHTML=db.reconciliations.slice().sort((a,b)=>b.created-a.created).map(r=>{
  const diff=Number(r.real)-Number(r.theoretical);
  return '<tr><td>'+esc(r.from)+(r.to&&r.to!==r.from?' → '+esc(r.to):'')+'</td><td>'+esc(getAccount(r.accountId)?.name||'—')+'</td><td>'+money(r.opening)+'</td><td>'+money(r.entries)+'</td><td>'+money(r.exits)+'</td><td>'+money(r.theoretical)+'</td><td>'+money(r.real)+'</td><td class="'+(Math.abs(diff)<0.005?'green':'red')+'"><b>'+money(diff)+'</b></td><td><button class="btn" data-del-reconciliation="'+r.id+'">Eliminar</button></td></tr>';
 }).join('')||'<tr><td colspan="9"><div class="empty">Todavía no hay conciliaciones.</div></td></tr>';
 document.querySelectorAll('[data-del-reconciliation]').forEach(b=>b.addEventListener('click',function(){
  if(confirm('¿Eliminar esta conciliación?')){db.reconciliations=db.reconciliations.filter(x=>x.id!==b.dataset.delReconciliation);save()}
 }));
}
function openReconciliation(){
 const cashAccounts=db.accounts.filter(a=>a.active&&a.type==='Caja');
 if(!cashAccounts.length){alert('No hay ninguna cuenta de tipo Caja para conciliar.');return}
 openModal('<h2>Nueva conciliación de caja</h2><div class="notice">Selecciona una caja y el periodo que quieres revisar. El sistema calculará el saldo inicial, entradas, salidas y efectivo teórico.</div>'+
 '<form id="reconciliationForm"><div class="formGrid"><div class="field"><label>Caja</label><select class="select" name="account">'+cashAccounts.map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')+'</select></div>'+
 '<div class="field"><label>Desde</label><input class="input" name="from" type="date" value="'+today()+'" required></div><div class="field"><label>Hasta</label><input class="input" name="to" type="date" value="'+today()+'" required></div>'+
 '<div class="field"><label>Dinero real contado</label><input class="input" name="real" type="number" step="0.01" min="0" required></div>'+
 '<div class="field full"><label>Nota</label><textarea class="textarea" name="note" rows="3" placeholder="Ej. corte olvidado del 1 al 5 de agosto"></textarea></div></div>'+
 '<div id="reconPreview" class="notice"></div><div class="modalActions"><button type="button" class="btn" id="cancelReconciliation">Cancelar</button><button type="submit" class="btn primary">Guardar conciliación</button></div></form>');
 const form=document.getElementById('reconciliationForm'),preview=document.getElementById('reconPreview');
 function refresh(){
  const accountId=form.querySelector('[name="account"]').value,from=form.querySelector('[name="from"]').value,to=form.querySelector('[name="to"]').value;
  if(!from||!to||to<from){preview.textContent='Selecciona un periodo válido.';return}
  const ob=openingBalance(accountId,from),mt=accountMovementTotals(accountId,from,to),theoretical=ob+mt.entradas-mt.salidas;
  preview.innerHTML='<b>Saldo inicial:</b> '+money(ob)+' · <b>Entradas:</b> '+money(mt.entradas)+' · <b>Salidas:</b> '+money(mt.salidas)+' · <b>Efectivo teórico:</b> '+money(theoretical);
 }
 form.querySelectorAll('input,select').forEach(x=>x.addEventListener('input',refresh));form.querySelectorAll('select,input[type="date"]').forEach(x=>x.addEventListener('change',refresh));
 document.getElementById('cancelReconciliation').addEventListener('click',closeModal);refresh();
 form.addEventListener('submit',function(e){
  e.preventDefault();
  const f=new FormData(form),from=String(f.get('from')),to=String(f.get('to')),accountId=String(f.get('account')),real=Number(f.get('real'));
  if(!accountId||!from||!to||to<from){alert('Revisa la caja y las fechas.');return}
  if(!Number.isFinite(real)||real<0){alert('El efectivo real contado no es válido.');return}
  const ob=openingBalance(accountId,from),mt=accountMovementTotals(accountId,from,to),theoretical=ob+mt.entradas-mt.salidas;
  db.reconciliations.push({id:uid(),created:Date.now(),accountId,from,to,opening:ob,entries:mt.entradas,exits:mt.salidas,theoretical,real,note:String(f.get('note')||'')});
  save();renderReconciliations();closeModal();
  const nav=document.querySelector('.nav button[data-view="conciliacion"]');if(nav)nav.click();
 });
}

function renderPOSCloses(){
 const el=document.getElementById('posClosesBody');if(!el)return;
 el.innerHTML=db.posCloses.slice().sort((a,b)=>b.created-a.created).map(function(c){
  const diff=Number(c.real)-Number(c.expectedCash);
  return '<tr><td>'+esc(c.from)+' → '+esc(c.to)+'</td><td>'+money(c.sales)+'</td><td>'+money(c.expectedCash)+'</td><td>'+money(c.posExpenses)+'</td><td>'+money(c.changeLeft)+'</td><td>'+money(c.real)+'</td><td class="'+(Math.abs(diff)<0.005?'green':'red')+'"><b>'+money(diff)+'</b></td><td>'+money(c.withdrawal)+'</td><td><button class="btn" data-del-pos="'+c.id+'">Eliminar</button></td></tr>';
 }).join('')||'<tr><td colspan="9"><div class="empty">Todavía no hay cierres de Caja POS.</div></td></tr>';
 document.querySelectorAll('[data-del-pos]').forEach(function(b){
  b.addEventListener('click',function(){
   const c=db.posCloses.find(x=>x.id===b.dataset.delPos); if(!c)return;
   if(!confirm('¿Eliminar este cierre?'))return;
   // If an automatic withdrawal was created, reverse it.
   if(c.withdrawal>0 && c.withdrawalMoveId){
    const m=db.moves.find(x=>x.id===c.withdrawalMoveId);
    if(m){
     const from=getAccount(m.from),to=getAccount(m.to);
     if(from)from.balance+=Number(m.amount);
     if(to)to.balance-=Number(m.amount);
     db.moves=db.moves.filter(x=>x.id!==m.id);
    }
   }
   db.posCloses=db.posCloses.filter(x=>x.id!==c.id);save();
  });
 });
}

function openPOSClose(){
 const pos=getAccount('pos'), principal=getAccount('principal');
 openModal('<h2>Nuevo cierre de Caja POS</h2>'+
 '<div class="notice">Introduce los datos consolidados de Loyverse. No necesitas capturar ventas individuales.</div>'+
 '<form id="posCloseForm"><div class="formGrid">'+
 '<div class="field"><label>Desde</label><input class="input" name="from" type="date" value="'+today()+'" required></div>'+
 '<div class="field"><label>Hasta</label><input class="input" name="to" type="date" value="'+today()+'" required></div>'+
 '<div class="field"><label>Ventas brutas / ventas de Loyverse</label><input class="input" name="sales" type="number" min="0" step="0.01" value="0" required></div>'+
 '<div class="field"><label>Efectivo teórico de Loyverse</label><input class="input" name="theoretical" type="number" min="0" step="0.01" value="0" required></div>'+
 '<div class="field"><label>Gastos / salidas de Caja POS</label><input class="input" name="expenses" type="number" min="0" step="0.01" value="0" required></div>'+
 '<div class="field"><label>Cambio que se deja en Caja POS</label><input class="input" name="change" type="number" min="0" step="0.01" value="0" required></div>'+
 '<div class="field"><label>Efectivo real contado</label><input class="input" name="real" type="number" min="0" step="0.01" value="0" required></div>'+
 '<div class="field"><label>Retiro a Caja Principal</label><input class="input" name="withdrawal" type="number" min="0" step="0.01" value="0"></div>'+
 '<div class="field full"><label>Nota</label><textarea class="textarea" name="note" rows="3" placeholder="Ej. cierre del 1 al 5 de agosto"></textarea></div>'+
 '</div><div id="posPreview" class="notice"></div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar cierre</button></div></form>');
 const form=document.getElementById('posCloseForm'),preview=document.getElementById('posPreview');
 function refresh(){
  const f=new FormData(form);
  const sales=Number(f.get('sales')),theoretical=Number(f.get('theoretical')),expenses=Number(f.get('expenses')),change=Number(f.get('change')),real=Number(f.get('real')),withdrawal=Number(f.get('withdrawal'));
  const diff=real-theoretical;
  preview.innerHTML='<b>Resultado:</b> Efectivo teórico '+money(theoretical)+' · Real '+money(real)+' · Diferencia <span class="'+(Math.abs(diff)<0.005?'green':'red')+'"><b>'+money(diff)+'</b></span><br>'+
   '<b>Retiro sugerido según el efectivo contado:</b> '+money(Math.max(0,real-change))+' · <b>Retiro capturado:</b> '+money(withdrawal);
 }
 form.querySelectorAll('input').forEach(function(x){x.addEventListener('input',refresh)});
 document.getElementById('cancelModal').addEventListener('click',closeModal);refresh();
 form.addEventListener('submit',function(e){
  e.preventDefault();const f=new FormData(form),from=f.get('from'),to=f.get('to');
  if(to<from){alert('La fecha final no puede ser anterior a la inicial.');return}
  const sales=Number(f.get('sales')),theoretical=Number(f.get('theoretical')),expenses=Number(f.get('expenses')),change=Number(f.get('change')),real=Number(f.get('real')),withdrawal=Number(f.get('withdrawal'));
  if(real<withdrawal){alert('El retiro no puede ser mayor que el efectivo real contado.');return}
  if(change>real){alert('El cambio dejado no puede ser mayor que el efectivo real contado.');return}
  if(withdrawal>0){
   if(!pos||!principal){alert('No existen Caja POS y Caja Principal.');return}
   if(pos.balance<withdrawal){alert('Caja POS no tiene saldo suficiente para registrar ese retiro.');return}
   pos.balance-=withdrawal;principal.balance+=withdrawal;
  }
  const close={id:uid(),created:Date.now(),from,to,sales,theoreticalCash:theoretical,expectedCash:theoretical,posExpenses:expenses,changeLeft:change,real,withdrawal,note:f.get('note'),withdrawalMoveId:null};
  if(withdrawal>0){
   const move={id:uid(),created:Date.now(),type:'transferencia',date:to,amount:withdrawal,concept:'Retiro Caja POS → Caja Principal',category:'',from:pos.id,to:principal.id,account:pos.id,note:'Cierre POS '+from+' → '+to,linkedType:'posClose',linkedId:close.id};
   close.withdrawalMoveId=move.id;db.moves.push(move);
  }
  db.posCloses.push(close);save();closeModal();
 });
}

function openCategory(type,editId){
 const existing=editId?getCategory(type,editId):{name:'',active:true};
 openModal('<h2>'+(editId?'Editar categoría':'Nueva categoría')+'</h2><form id="categoryForm">'+
 '<div class="field"><label>Tipo</label><select class="select" name="type" '+(editId?'disabled':'')+'><option value="entrada" '+(type==='entrada'?'selected':'')+'>Entrada</option><option value="salida" '+(type==='salida'?'selected':'')+'>Salida</option><option value="compromiso" '+(type==='compromiso'?'selected':'')+'>Compromiso</option></select></div>'+
 '<div class="field"><label>Nombre</label><input class="input" name="name" value="'+esc(existing.name)+'" required></div>'+
 '<div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar</button></div></form>');
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 document.getElementById('categoryForm').addEventListener('submit',function(e){e.preventDefault();const f=new FormData(e.target),name=f.get('name').trim(),t=editId?type:f.get('type');if(!name)return;if(editId)existing.name=name;else db.categories[t].push({id:uid(),name:name,active:true});save();closeModal()});
}
function toggleCategory(type,i){const c=getCategory(type,i);if(c){c.active=!c.active;save()}}
function deleteProvider(i){if(confirm('¿Eliminar proveedor?')){db.providers=db.providers.filter(x=>x.id!==i);save()}}
function deleteCommitment(i){if(confirm('¿Eliminar compromiso?')){db.commitments=db.commitments.filter(x=>x.id!==i);save()}}
function deleteMove(i){
 const m=db.moves.find(x=>x.id===i);if(!m)return;
 if(!confirm('¿Eliminar este movimiento? El saldo será revertido.'))return;
 const from=getAccount(m.from||m.account);
 if(m.type==='entrada'&&from)from.balance-=Number(m.amount);
 if(m.type==='salida'&&from)from.balance+=Number(m.amount);
 if(m.type==='transferencia'){if(from)from.balance+=Number(m.amount);const to=getAccount(m.to);if(to)to.balance-=Number(m.amount)}
 db.moves=db.moves.filter(x=>x.id!==i);save();
}

function resultRange(){
 const t=document.getElementById('resultPeriod')?.value||'month',d=new Date(today()+'T12:00:00');
 let from=document.getElementById('resultFrom')?.value||today(),to=document.getElementById('resultTo')?.value||today();
 if(t==='month'){from=new Date(d.getFullYear(),d.getMonth(),1).toISOString().slice(0,10);to=new Date(d.getFullYear(),d.getMonth()+1,0).toISOString().slice(0,10)}
 if(t==='week'){const n=d.getDay(),diff=(n+6)%7,f=new Date(d);f.setDate(d.getDate()-diff);const z=new Date(f);z.setDate(f.getDate()+6);from=f.toISOString().slice(0,10);to=z.toISOString().slice(0,10)}
 return {from,to};
}

function loyverseTreasuryTotal(start,end){
 return (db.loyverseTreasuryExpenses||[]).filter(x=>(!start||x.date>=start)&&(!end||x.date<=end)).reduce((s,x)=>s+Number(x.amount||0),0);
}
function importLoyverseTreasuryExpense(data){
 const id=String(data.id||data.externalId||''); if(!id)return {ok:false,error:'Falta identificador de Loyverse.'};
 db.loyverseTreasuryExpenses=db.loyverseTreasuryExpenses||[];
 if(db.loyverseTreasuryExpenses.some(x=>String(x.externalId)===id))return {ok:false,duplicate:true};
 const amount=Number(data.amount||0); if(!Number.isFinite(amount)||amount<=0)return {ok:false,error:'Importe inválido.'};
 const acc=getAccount(String(data.accountId||''));
 const rec={id:uid(),externalId:id,source:'loyverse_treasury',date:String(data.date||today()),amount,concept:String(data.concept||data.name||'Salida de tesorería Loyverse'),category:String(data.category||'tesoreria_loyverse'),note:String(data.note||''),accountId:acc?acc.id:null,created:Date.now()};
 db.loyverseTreasuryExpenses.push(rec);
 if(acc){
  acc.balance-=amount;
  db.moves.push({id:uid(),created:Date.now(),type:'salida',date:rec.date,amount,concept:rec.concept,category:'tesoreria_loyverse',from:acc.id,to:null,account:acc.id,note:rec.note,linkedType:'loyverseTreasury',linkedId:rec.id,externalId:id,source:'Loyverse'});
 }
 return {ok:true,record:rec};
}


function removeLoyverseTreasuryExpense(externalId){
 db.loyverseTreasuryExpenses=(db.loyverseTreasuryExpenses||[]).filter(x=>String(x.externalId)!==String(externalId));
}



function openLoyverseTreasuryImportTest(){
 openModal('<h2>Importar salida de tesorería Loyverse</h2><div class="notice">Esta herramienta es de prueba. La conexión automática con la API de Loyverse se añadirá después. Cada registro requiere un ID externo para evitar duplicados.</div><form id="loyverseTreasuryTestForm"><div class="formGrid"><div class="field"><label>ID Loyverse</label><input class="input" name="externalId" placeholder="Ej. cashout_001" required></div><div class="field"><label>Fecha</label><input class="input" name="date" type="date" value="'+today()+'" required></div><div class="field"><label>Importe</label><input class="input" name="amount" type="number" min="0.01" step="0.01" required></div><div class="field"><label>Cuenta / caja</label><select class="select" name="account">'+accountOptions()+'</select></div><div class="field"><label>Concepto</label><input class="input" name="concept" placeholder="Ej. Tomate" required></div><div class="field full"><label>Nota</label><input class="input" name="note"></div></div><div class="modalActions"><button type="button" class="btn" id="cancelLoyverseTreasury">Cancelar</button><button class="btn primary">Importar</button></div></form>');
 document.getElementById('cancelLoyverseTreasury').addEventListener('click',closeModal);
 document.getElementById('loyverseTreasuryTestForm').addEventListener('submit',function(e){
  e.preventDefault();const d=new FormData(e.target),r=importLoyverseTreasuryExpense({id:d.get('externalId'),date:d.get('date'),amount:d.get('amount'),concept:d.get('concept'),note:d.get('note'),accountId:d.get('account')});
  if(r.duplicate){alert('Ese movimiento de Loyverse ya está importado.');return}
  if(!r.ok){alert(r.error||'No se pudo importar.');return}
  save();renderResult();closeModal();
 });
}


function renderLoyverseTreasuryPanel(start,end){
 const el=document.getElementById('loyverseTreasuryPanel');if(!el)return;
 const rows=(db.loyverseTreasuryExpenses||[]).filter(x=>(!start||x.date>=start)&&(!end||x.date<=end)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 el.innerHTML='<div class="toolbar"><div><h2>Salidas de tesorería · Loyverse</h2><div class="muted">Gastos registrados en Gestión de tesorería de Loyverse. Al importarlos, se reflejan como salidas financieras y no deben capturarse nuevamente.</div></div><button class="btn" data-action="import-loyverse-treasury">＋ Importar salida</button></div>'+
 (rows.length?rows.map(x=>'<div class="row"><div><b>'+esc(x.concept)+'</b><div class="muted">'+esc(x.date)+(x.note?' · '+esc(x.note):'')+' · Origen: Loyverse</div></div><div class="actions"><strong class="red">−'+money(x.amount)+'</strong><button class="btn danger" data-del-loy-treasury="'+x.id+'">Eliminar</button></div></div>').join(''):'<div class="empty">Sin salidas de tesorería de Loyverse en el periodo.</div>');
 document.querySelectorAll('[data-del-loy-treasury]').forEach(b=>b.addEventListener('click',function(){
  const x=(db.loyverseTreasuryExpenses||[]).find(a=>a.id===b.dataset.delLoyTreasury);if(!x)return;
  if(!confirm('¿Eliminar esta salida importada de Loyverse? Se revertirá su efecto financiero.'))return;
  const acc=getAccount(x.accountId);if(acc)acc.balance+=Number(x.amount||0);
  db.moves=db.moves.filter(m=>!(m.linkedType==='loyverseTreasury'&&m.linkedId===x.id));
  db.loyverseTreasuryExpenses=db.loyverseTreasuryExpenses.filter(a=>a.id!==x.id);
  save();renderResult();
 }));
}

function renderResult(){
 const resultPeriodRange=resultRange(),start=resultPeriodRange.from,end=resultPeriodRange.to; const loyverseTreasuryExpenses=(db.loyverseTreasuryExpenses||[]).filter(x=>x.date>=start&&x.date<=end).reduce((s,x)=>s+Number(x.amount||0),0);

 const r=resultRange(),from=r.from,to=r.to;
 const loy=db.loyverseSummaries.filter(x=>x.from>=from&&x.to<=to);
 const sales=loy.reduce((s,x)=>s+Number(x.sales||0),0),gross=loy.reduce((s,x)=>s+Number(x.gross||0),0);
 const outs=db.moves.filter(m=>m.type==='salida'&&m.date>=from&&m.date<=to&&m.linkedType!=='posClose').reduce((s,m)=>s+Number(m.amount),0);
 document.getElementById('resSales').textContent=money(sales);document.getElementById('resGross').textContent=money(gross);document.getElementById('resOut').textContent=money(outs);document.getElementById('resNet').textContent=money(gross-outs);
 document.getElementById('loyverseSummary').innerHTML=loy.map(x=>'<div class="row"><div><b>'+esc(x.from)+' → '+esc(x.to)+'</b><div class="muted">Ventas '+money(x.sales)+' · Beneficio bruto '+money(x.gross)+'</div></div><button class="btn" data-del-loy="'+x.id+'">Eliminar</button></div>').join('')||'<div class="empty">Sin resumen de Loyverse.</div>';
 document.querySelectorAll('[data-del-loy]').forEach(b=>b.addEventListener('click',function(){if(confirm('¿Eliminar este resumen?')){db.loyverseSummaries=db.loyverseSummaries.filter(x=>x.id!==b.dataset.delLoy);save()}}));
 const cats={};db.moves.filter(m=>m.type==='salida'&&m.date>=from&&m.date<=to).forEach(m=>{const n=categoryName('salida',m.category)||'Sin categoría';cats[n]=(cats[n]||0)+Number(m.amount)});
 document.getElementById('resultCategories').innerHTML=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(x=>'<div class="row"><span>'+esc(x[0])+'</span><strong>'+money(x[1])+'</strong></div>').join('')||'<div class="empty">Sin salidas.</div>';
 document.getElementById('resultNarrative').innerHTML='<div class="row"><div><b>Periodo</b><div class="muted">'+from+' → '+to+'</div></div><strong>'+money(sales)+'</strong></div><div class="row"><div><b>Beneficio bruto de Loyverse</b></div><strong>'+money(gross)+'</strong></div><div class="row"><div><b>Salidas financieras</b></div><strong class="red">−'+money(outs)+'</strong></div><div class="row"><div><b>Resultado de referencia</b><div class="muted">Beneficio bruto informado por Loyverse menos salidas financieras.</div></div><strong>'+money(gross-outs)+'</strong></div>';

 renderLoyverseTreasuryPanel(start,end);}



function openLoyverseSummary(){
 openModal('<h2>Registrar resumen de Loyverse</h2><div class="notice">No se importan ventas individuales. Sólo el resumen consolidado.</div><form id="loyForm"><div class="formGrid"><div class="field"><label>Desde</label><input class="input" name="from" type="date" value="'+today()+'" required></div><div class="field"><label>Hasta</label><input class="input" name="to" type="date" value="'+today()+'" required></div><div class="field"><label>Ventas netas</label><input class="input" name="sales" type="number" min="0" step="0.01" required></div><div class="field"><label>Beneficio bruto</label><input class="input" name="gross" type="number" min="0" step="0.01" required></div><div class="field full"><label>Nota</label><textarea class="textarea" name="note"></textarea></div></div><div class="modalActions"><button type="button" class="btn" id="cancelModal">Cancelar</button><button class="btn primary">Guardar</button></div></form>');
 document.getElementById('cancelModal').addEventListener('click',closeModal);
 document.getElementById('loyForm').addEventListener('submit',function(e){e.preventDefault();const f=new FormData(e.target);if(f.get('to')<f.get('from')){alert('La fecha final no puede ser anterior.');return}db.loyverseSummaries.push({id:uid(),created:Date.now(),from:f.get('from'),to:f.get('to'),sales:Number(f.get('sales')),gross:Number(f.get('gross')),note:f.get('note')});save();closeModal()});
}

function renderDataStatus(){
 const el=document.getElementById('dataStatus');if(!el)return;
 el.innerHTML='<div class="row"><div><b>Último guardado</b><div class="muted">Los datos están en este navegador.</div></div><strong>'+new Date().toLocaleString('es-MX')+'</strong></div>'+
 '<div class="row"><div><b>Movimientos</b></div><strong>'+db.moves.length+'</strong></div>'+
 '<div class="row"><div><b>Proveedores</b></div><strong>'+db.providers.length+'</strong></div>'+
 '<div class="row"><div><b>Compromisos</b></div><strong>'+db.commitments.length+'</strong></div>'+
 '<div class="row"><div><b>Cierres POS</b></div><strong>'+db.posCloses.length+'</strong></div>';
}
function exportData(){
 const payload={app:'Panorama Finanzas',version:'PF-V1-040',exportedAt:new Date().toISOString(),data:db};
 const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download='Panorama_Finanzas_Backup_'+today()+'.json';a.click();URL.revokeObjectURL(url);
}
function importData(file){
 const reader=new FileReader();
 reader.onload=function(){
  try{
   const payload=JSON.parse(reader.result),d=payload.data||payload;
   if(!d.accounts||!d.moves||!d.categories){throw new Error('El archivo no parece un respaldo válido de Panorama Finanzas.')}
   if(!confirm('Esto reemplazará los datos actuales por el respaldo. ¿Continuar?'))return;
   db=d;
   db.providers=db.providers||[];db.commitments=db.commitments||[];db.cuts=db.cuts||[];db.providerPayments=db.providerPayments||[];db.commitmentPayments=db.commitmentPayments||[];db.reconciliations=db.reconciliations||[];db.posCloses=db.posCloses||[];db.adjustments=db.adjustments||[];db.loyverseSummaries=db.loyverseSummaries||[];
   save();alert('Respaldo importado correctamente.');
  }catch(err){alert('No se pudo importar el respaldo: '+err.message)}
 };
 reader.readAsText(file);
}
function resetTestData(){
 if(!confirm('Esto eliminará los datos actuales de este navegador y restaurará los datos de prueba. Descarga un respaldo antes si quieres conservarlos.'))return;
 localStorage.removeItem(STORAGE);db=load();renderAll();alert('Datos de prueba restaurados.');
}

// Button wiring — explicit listeners, no inline event handlers.
document.getElementById('btnEntrada').addEventListener('click',function(){openMovement('entrada')});
document.getElementById('btnSalida').addEventListener('click',function(){openMovement('salida')});
document.getElementById('btnTransfer').addEventListener('click',function(){openMovement('transferencia')});
document.getElementById('btnNewAccount').addEventListener('click',function(){openAccount()});
document.getElementById('btnNewProvider').addEventListener('click',function(){openProvider()});
document.getElementById('btnNewCommitment').addEventListener('click',function(){openCommitment()});
document.getElementById('btnNewCut').addEventListener('click',function(){openCut()});
document.getElementById('btnNewCategory').addEventListener('click',function(){openCategory('salida')});
document.getElementById('btnNewReconciliation').addEventListener('click',function(){openReconciliation()});
document.getElementById('btnNewPOSClose').addEventListener('click',function(){openPOSClose()});
document.getElementById('btnExportData').addEventListener('click',exportData);
document.getElementById('btnImportData').addEventListener('click',function(){document.getElementById('importFile').click()});
document.getElementById('importFile').addEventListener('change',function(e){if(e.target.files[0])importData(e.target.files[0]);e.target.value=''});
document.getElementById('btnResetData').addEventListener('click',resetTestData);
document.getElementById('btnRefreshResult').addEventListener('click',renderResult);
document.getElementById('refreshCorePayroll')?.addEventListener('click',refreshCorePayrollRequests);
document.getElementById('btnAddLoyverse').addEventListener('click',openLoyverseSummary);
document.getElementById('resultPeriod').addEventListener('change',function(){const c=this.value==='custom';document.getElementById('resultFrom').style.display=c?'block':'none';document.getElementById('resultTo').style.display=c?'block':'none';renderResult()});
document.getElementById('resultFrom').addEventListener('change',renderResult);document.getElementById('resultTo').addEventListener('change',renderResult);
document.getElementById('searchMoves').addEventListener('input',renderMoves);
document.getElementById('filterMoves').addEventListener('change',renderMoves);

document.getElementById('resultFrom').style.display='none';document.getElementById('resultTo').style.display='none';renderAll();


// PF-V1-040 — handlers de Nómina y Pagos fijos dentro del mismo scope
document.addEventListener('click',function(ev){
 const t=ev.target.closest?.('#newPayrollEmployee,#newPayrollEmployee2,#newPayrollPayment,#newFixedPayment');
 if(!t)return;
 if(t.id==='newPayrollEmployee'||t.id==='newPayrollEmployee2'){openPayrollEmployee();return}
 if(t.id==='newPayrollPayment'){openPayrollPayment();return}
 if(t.id==='newFixedPayment'){openFixedPayment();return}
});

document.addEventListener('submit',function(ev){
 const form=ev.target;
 if(form.id==='payrollEmployeeForm'){
  ev.preventDefault();
  const d=new FormData(form),name=String(d.get('name')||'').trim(),pay=Number(d.get('pay'));
  if(!name){alert('Escribe el nombre del empleado.');return}
  if(!Number.isFinite(pay)||pay<0){alert('El pago habitual no es válido.');return}
  db.payrollEmployees=db.payrollEmployees||[];
  const emp=form.dataset.employeeId?db.payrollEmployees.find(x=>x.id===form.dataset.employeeId):null;
  if(emp){emp.name=name;emp.defaultPay=pay;emp.active=true}else db.payrollEmployees.push({id:uid(),name,defaultPay:pay,active:true});
  save();renderPayroll();closeModal();return;
 }
 if(form.id==='fixedPaymentForm'){
  ev.preventDefault();
  const d=new FormData(form),concept=String(d.get('concept')||'').trim(),amount=Number(d.get('amount')),date=String(d.get('date')||''),status=String(d.get('status')||'pendiente'),note=String(d.get('note')||'').trim(),accountId=String(d.get('account')||''),acc=getAccount(accountId);
  if(!concept){alert('Escribe el concepto.');return}
  if(!Number.isFinite(amount)||amount<=0){alert('El importe no es válido.');return}
  if(!date){alert('Selecciona una fecha.');return}
  if(status==='pagado'&&(!acc||Number(acc.balance)<amount)){alert('Selecciona una cuenta con saldo suficiente.');return}
  db.fixedPayments=db.fixedPayments||[];
  const x=form.dataset.fixedId?db.fixedPayments.find(a=>a.id===form.dataset.fixedId):null;
  if(x){
   if(x.status!=='pagado'&&status==='pagado'){acc.balance-=amount;db.moves.push({id:uid(),created:Date.now(),origin:'pagos_fijos',sourceRecordId:x.id,type:'salida',date,amount,concept,category:'pagos_fijos',from:acc.id,to:null,account:acc.id,note})}
   x.concept=concept;x.amount=amount;x.date=date;x.status=status;x.accountId=status==='pagado'?accountId:null;x.note=note;
  }else{
   const r={id:uid(),created:Date.now(),concept,amount,date,status,accountId:status==='pagado'?accountId:null,note};db.fixedPayments.push(r);
   if(status==='pagado'){acc.balance-=amount;db.moves.push({id:uid(),created:Date.now(),origin:'pagos_fijos',sourceRecordId:r.id,type:'salida',date,amount,concept,category:'pagos_fijos',from:acc.id,to:null,account:acc.id,note})}
  }
  save();renderFixedPayments();closeModal();
 }
});

document.addEventListener('click',function(ev){const b=ev.target.closest?.('[data-action="import-loyverse-treasury"]');if(b){openLoyverseTreasuryImportTest()}});

document.getElementById('searchMoves')?.addEventListener('input',renderMoves);document.getElementById('movesFrom')?.addEventListener('change',renderMoves);document.getElementById('movesTo')?.addEventListener('change',renderMoves);document.getElementById('clearMovesFilters')?.addEventListener('click',function(){['searchMoves','movesFrom','movesTo'].forEach(id=>{const x=document.getElementById(id);if(x)x.value=''});const f=document.getElementById('filterMoves');if(f)f.value='';renderMoves()});
document.getElementById('filterMoves')?.addEventListener('change',renderMoves);

const sidebar=document.getElementById('appSidebar');
const sidebarToggle=document.getElementById('sidebarToggle');
const mobileSidebarToggle=document.getElementById('mobileSidebarToggle');
const sidebarOverlay=document.getElementById('sidebarOverlay');
if(sidebar){
  const isMobile=()=>window.matchMedia('(max-width:900px)').matches;

  const applySidebar=(collapsed)=>{
    sidebar.classList.toggle('is-collapsed',!!collapsed);
    document.body.classList.toggle('sidebar-closed',isMobile()&&!!collapsed);
    document.body.classList.toggle('sidebar-open',isMobile()&&!collapsed);

    const label=collapsed?'Abrir barra lateral':'Cerrar barra lateral';
    if(sidebarToggle){
      sidebarToggle.innerHTML='<span class="hamburger">☰</span>';
      sidebarToggle.setAttribute('aria-label',label);
      sidebarToggle.title=label;
    }
    if(mobileSidebarToggle){
      mobileSidebarToggle.innerHTML='<span class="hamburger">☰</span>';
      mobileSidebarToggle.setAttribute('aria-label','Abrir barra lateral');
      mobileSidebarToggle.title='Abrir barra lateral';
    }
    if(sidebarOverlay){
      sidebarOverlay.classList.toggle('show',isMobile()&&!collapsed);
    }
    if(!isMobile()){
      localStorage.setItem('panorama_sidebar_collapsed',collapsed?'1':'0');
    }
  };

  const initialCollapsed=isMobile()
    ? true
    : localStorage.getItem('panorama_sidebar_collapsed')==='1';

  applySidebar(initialCollapsed);

  sidebarToggle?.addEventListener('click',()=>{
    applySidebar(!sidebar.classList.contains('is-collapsed'));
  });

  mobileSidebarToggle?.addEventListener('click',()=>{
    applySidebar(false);
  });

  sidebarOverlay?.addEventListener('click',()=>{
    if(isMobile()) applySidebar(true);
  });

  window.addEventListener('resize',()=>{
    if(isMobile()){
      applySidebar(sidebar.classList.contains('is-collapsed'));
    }else{
      applySidebar(localStorage.getItem('panorama_sidebar_collapsed')==='1');
    }
  });
}


  // Canal de entrada: aplica estado remoto sin volver a disparar save().
  function applyRemoteState(remoteData){
    if(!remoteData || typeof remoteData!=='object' || Array.isArray(remoteData) || !Object.keys(remoteData).length) return false;
    if(JSON.stringify(db)===JSON.stringify(remoteData)) return false;
    db=remoteData;
    localStorage.setItem(STORAGE,JSON.stringify(db));
    renderAll();
    return true;
  }

  let remoteSyncTimer=null;
  async function pullRemoteState(){
    try{
      const remote=await window.PanoramaCoreFinance?.remoteState?.();
      if(remote?.data && Object.keys(remote.data).length) applyRemoteState(remote.data);
      return remote||null;
    }catch(e){
      console.warn('Panorama Finanzas: no se pudo recibir estado remoto',e);
      return null;
    }
  }

  window.addEventListener('panorama-core-finance-ready', async function(){
    const remote=await pullRemoteState();
    if(!remote?.data || !Object.keys(remote.data).length){
      window.PanoramaCoreFinance?.syncState(db);
    }
    if(remoteSyncTimer===null){
      remoteSyncTimer=setInterval(pullRemoteState,5000);
    }
  });

  window.PanoramaFinanceApp={
    applyRemoteState,
    pullRemoteState,
    getState:function(){ return db; }
  };

})();
