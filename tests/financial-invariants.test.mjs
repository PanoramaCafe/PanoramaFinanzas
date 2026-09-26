import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const core = fs.readFileSync(new URL('../panorama-core-integration.js', import.meta.url), 'utf8');

function move(state, account, type, amount) {
  const a = state.accounts[account];
  if (type === 'entrada') a.balance += amount;
  else if (type === 'salida') a.balance -= amount;
  else if (type === 'transferencia') {
    a.balance -= amount;
    state.accounts.to.balance += amount;
  }
}

test('transferencia conserva el dinero total', () => {
  const state = {accounts:{from:{balance:1000},to:{balance:250}}};
  const before = state.accounts.from.balance + state.accounts.to.balance;
  state.accounts.from.balance -= 125;
  state.accounts.to.balance += 125;
  const after = state.accounts.from.balance + state.accounts.to.balance;
  assert.equal(after, before);
});

test('eliminar una entrada revierte exactamente su efecto', () => {
  const before = 800;
  const amount = 175.50;
  let balance = before + amount;
  balance -= amount;
  assert.equal(balance, before);
});

test('eliminar una transferencia revierte exactamente ambos saldos', () => {
  const state = {from:1000,to:250};
  const amount = 125;
  state.from -= amount;
  state.to += amount;
  state.from += amount;
  state.to -= amount;
  assert.equal(state.from,1000);
  assert.equal(state.to,250);
});

test('eliminar una salida revierte exactamente su efecto', () => {
  const before = 800;
  const amount = 175.50;
  let balance = before - amount;
  balance += amount;
  assert.equal(balance, before);
});

test('pago a proveedor disminuye deuda y saldo de cuenta por el mismo importe', () => {
  const provider = {creditBalance: 900};
  const account = {balance: 1400};
  const amount = 300;
  provider.creditBalance -= amount;
  account.balance -= amount;
  assert.equal(provider.creditBalance, 600);
  assert.equal(account.balance, 1100);
});

test('pago a compromiso incrementa pagado y disminuye saldo de cuenta', () => {
  const commitment = {total:1000, paid:200};
  const account = {balance:1500};
  const amount = 250;
  commitment.paid += amount;
  account.balance -= amount;
  assert.equal(commitment.paid, 450);
  assert.equal(commitment.total - commitment.paid, 550);
  assert.equal(account.balance, 1250);
});

test('respaldo conserva las colecciones financieras principales', () => {
  const data = {
    accounts:[{id:'a',balance:100}],
    moves:[{id:'m',amount:50}],
    providers:[],
    commitments:[],
    categories:{entrada:[],salida:[],compromiso:[]}
  };
  const payload = JSON.parse(JSON.stringify({
    app:'Panorama Finanzas',
    version:'PF-V1-040',
    exportedAt:new Date().toISOString(),
    data
  }));
  assert.equal(payload.data.accounts.length, 1);
  assert.equal(payload.data.moves.length, 1);
  assert.ok(payload.data.categories.salida);
});

test('regresión: los pagos de proveedor usan creditBalance, no entity.paid', () => {
  assert.match(app, /if\(kind==='provider'\)[\s\S]*?entity\.creditBalance/);
  assert.doesNotMatch(app, /entity\.paid\+=amount;\s*p\.amount=amount/);
});

test('regresión: eliminar pago de proveedor restaura creditBalance', () => {
  const start = app.indexOf('function deletePayment');
  const end = app.indexOf('\nfunction openMovement', start);
  const block = app.slice(start, end);
  assert.match(block, /kind==='provider'/);
  assert.match(block, /entity\.creditBalance/);
});

test('regresión: sincronización no usa polling periódico', () => {
  assert.doesNotMatch(core, /setInterval\s*\(/);
});

test('regresión: confirmación de nómina ocurre antes de descontar saldo local', () => {
  const start = app.indexOf('async function openCorePayrollPayment');
  const end = app.indexOf("window.addEventListener('panorama-core-finance-ready'", start);
  const block = app.slice(start, end);
  const confirmPos = block.indexOf('PanoramaCoreFinance.confirm');
  const debitPos = block.indexOf('account.balance-=');
  assert.ok(confirmPos >= 0);
  assert.ok(debitPos > confirmPos);
});

test('regresión: pagos fijos usan exclusivamente el adaptador transaccional',()=>{
  assert.match(ledger,/upsertFixedPayment/);
  assert.match(ledger,/payFixedPayment/);
  assert.doesNotMatch(app,/if\(form\.id==='fixedPaymentForm'\)\{/);
});

test('regresión: eliminar transferencia revierte cuenta origen y destino', () => {
  const start = app.indexOf('function deleteMovement');
  const end = app.indexOf('\n\nfunction renderAccounts', start);
  const block = app.slice(start, end);
  assert.match(block, /m\.type==='transferencia'/);
  assert.match(block, /getAccount\(m\.to\)/);
  assert.match(block, /acc\.balance\+=Number\(m\.amount\|\|0\)/);
  assert.match(block, /to\.balance-=Number\(m\.amount\|\|0\)/);
});

test('regresión: las transferencias no se editan parcialmente', () => {
  const start = app.indexOf('function editMovement');
  const end = app.indexOf('\nfunction deleteMovement', start);
  const block = app.slice(start, end);
  assert.match(block, /m\.type==='transferencia'/);
  assert.match(block, /Las transferencias no se editan directamente/);
});

test('regresión: Loyverse no puede crear una salida con saldo insuficiente', () => {
  const start = app.indexOf('function importLoyverseTreasuryExpense');
  const end = app.indexOf('\nfunction openLoyverseTreasuryImportTest', start);
  const block = app.slice(start, end);
  assert.match(block, /Number\(acc\.balance\)<amount/);
  assert.match(block, /La cuenta seleccionada no tiene saldo suficiente/);
});

test('regresión: pagos externos de nómina requieren referencia y no se duplican', () => {
  assert.match(app, /origin==='external'&&\!externalId/);
  assert.match(app, /db\.payrollPeriods\.some\(x=>String\(x\.externalId\|\|''\)===externalId\)/);
});

test('regresión: rutas financieras legacy eliminadas no quedan alcanzables', () => {
  assert.doesNotMatch(app, /function deleteMove\(/);
  assert.doesNotMatch(app, /function applyExternalFinancialEvent\(/);
  assert.doesNotMatch(app, /function registerIntegrationEvent\(/);
});

test('regresión: respaldo JSON sigue separado de exportación XLSX', () => {
  assert.match(app, /getElementById\('btnExportData'\)\.addEventListener\('click',exportData\)/);
  assert.match(app, /a\.download='Panorama_Finanzas_Backup_/);
  assert.match(app, /requiredArrays=\['accounts','moves'/);
  assert.match(app, /db=clone\(d\)/);
});

const ledger=fs.readFileSync(new URL('../js/finance-ledger.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260926_secure_finance_account_adjustments.sql',import.meta.url),'utf8');
test('regresión: movimientos manuales nuevos usan el ledger transaccional',()=>{
  assert.match(app,/PanoramaFinanceLedger\.postEntry/);
  assert.match(app,/ledgerEntryId:id/);
  assert.match(app,/PanoramaFinanceLedger\.transfer/);
});
test('regresión: movimientos del ledger no se editan directamente',()=>{
  assert.match(app,/if\(m\.ledgerEntryId\)\{alert\('Este movimiento ya pertenece al libro financiero/);
});
test('regresión: movimientos legacy sin ledger no pueden eliminarse directamente',()=>{
  const start=app.indexOf('async function deleteMovement');
  const end=app.indexOf('function renderAccounts',start);
  const block=app.slice(start,end);
  assert.match(block,/!m\.ledgerEntryId/);
  assert.match(block,/anterior al libro transaccional/);
});
test('regresión: eliminación de movimiento ledger usa reversión atómica',()=>{
  assert.match(app,/PanoramaFinanceLedger\.reverse/);
  assert.match(migration,/create or replace function private\.reverse_finance_entry/);
  assert.match(migration,/reverses_entry_id/);
});
test('regresión: adaptador expone reversión',()=>{
  assert.match(ledger,/async function reverse/);
  assert.match(ledger,/window\.PanoramaFinanceLedger=\{postEntry,transfer,reverse,adjustBalance\}/);
});


test('regresión: los ajustes de saldo usan el ledger transaccional',()=>{
  assert.match(app,/PanoramaFinanceLedger\.adjustBalance/);
  assert.match(app,/ledgerEntryId:id/);
  assert.match(ledger,/adjustBalance/);
  assert.match(migration,/adjust_finance_account_balance/);
});

test('regresión: el saldo de una cuenta existente no se edita directamente',()=>{
  assert.match(app,/existing\?'disabled':''/);
  assert.doesNotMatch(app,/existing\.balance=balance/);
});


test('regresión: nómina de Core envía la fecha elegida al ledger',()=>{
  assert.match(core,/p_occurred_on:String\(String\(paidAt\)\.slice\(0,10\)\)/);
});

test('regresión: nómina local usa el ledger transaccional',()=>{
  assert.match(app,/PanoramaFinanceLedger\.postEntry/);
  assert.match(app,/source:'payroll'/);
  assert.match(app,/ledgerEntryId:movementId/);
});
test('regresión: pago de nómina core conserva referencia al ledger',()=>{
  const start=app.indexOf('function openCorePayrollPayment');
  const end=app.indexOf("window.addEventListener('panorama-core-finance-ready'",start);
  assert.match(app.slice(start,end),/ledgerEntryId:movementId/);
});
test('regresión: pagos de proveedor o compromiso ya contabilizados no se editan directamente',()=>{
  const start=app.indexOf('function editPayment');
  const end=app.indexOf('\nasync function deletePayment',start);
  const block=app.slice(start,end);
  assert.match(block,/p\.ledgerEntryId/);
  assert.match(block,/contabilizado en el libro financiero/);
});
test('regresión: proveedores y compromisos con operaciones financieras no se eliminan directamente',()=>{
  assert.match(app,/function deleteProvider\(i\).*hasPurchases/);
  assert.match(app,/function deleteCommitment\(i\).*hasPayments/);
  assert.match(app,/No puede eliminarse directamente/);
});

test('regresión: operaciones de proveedores usan RPC transaccional',()=>{
  assert.match(app,/PanoramaFinanceLedger\.postProviderPurchase/);
  assert.match(app,/PanoramaFinanceLedger\.postProviderPayment/);
  assert.match(app,/PanoramaFinanceLedger\.reverseProviderPurchase/);
  assert.match(app,/PanoramaFinanceLedger\.reverseProviderPayment/);
  assert.match(app,/Las compras de proveedor registradas en el libro financiero son inmutables/);
});
test('regresión: compras de proveedor del ledger no se editan directamente',()=>{
  const start=app.indexOf('function editProviderPurchase');
  const end=app.indexOf('\nasync function deleteProviderPurchase',start);
  const block=app.slice(start,end);
  assert.match(block,/linkedMove\?\.ledgerEntryId/);
  assert.match(block,/reviértela y registra una nueva/);
});

test('regresión: el adaptador expone el ciclo transaccional de proveedores',()=>{
  assert.match(ledger,/postProviderPurchase/);
  assert.match(ledger,/postProviderPayment/);
  assert.match(ledger,/reverseProviderPurchase/);
  assert.match(ledger,/reverseProviderPayment/);
});


test('regresión: pagos fijos usan operaciones transaccionales',()=>{
  assert.match(ledger,/upsertFixedPayment/);
  assert.match(ledger,/payFixedPayment/);
  assert.match(ledger,/reverseFixedPayment/);
});
test('regresión: el submit de pagos fijos confirma PostgreSQL antes de mutar el estado',()=>{
  assert.match(ledger,/await upsertFixedPayment/);
  assert.match(ledger,/if\(status==='pagado'\)await payFixedPayment/);
  assert.match(ledger,/applyRemoteState/);
});


test('regresión: adaptador de pagos fijos expone pago y reversión separados',()=>{
  assert.match(ledger,/payFixedPayment/);
  assert.match(ledger,/reverseFixedPayment/);
});


test('regresión: Loyverse Treasury usa el ledger transaccional',()=>{
  assert.match(ledger,/postLoyverseTreasuryExpense/);
  assert.match(ledger,/reverseLoyverseTreasuryExpense/);
  assert.match(app,/await window\.PanoramaFinanceLedger\.postLoyverseTreasuryExpense/);
  assert.match(app,/await window\.PanoramaFinanceLedger\.reverseLoyverseTreasuryExpense/);
  assert.match(app,/ledgerEntryId:rec\.id/);
});

test('regresión: registros legacy de Loyverse no se eliminan como si fueran ledger',()=>{
  const start=app.indexOf("document.querySelectorAll('[data-del-loy-treasury]')");
  const end=app.indexOf("function renderResult()",start);
  const block=app.slice(start,end);
  assert.match(block,/!x\.ledgerEntryId/);
  assert.match(block,/anterior al libro transaccional/);
});


test('regresión: los retiros de Cierre POS usan transferencia transaccional',()=>{
  assert.match(app,/await window\.PanoramaFinanceLedger\.transfer/);
  assert.match(app,/source:'pos_close'/);
  assert.match(app,/withdrawalLedgerEntryId/);
});

test('regresión: eliminar un Cierre POS revierte el ledger antes de quitar el movimiento local',()=>{
  const start=app.indexOf("document.querySelectorAll('[data-del-pos]')");
  const end=app.indexOf("function openPOSClose",start);
  const block=app.slice(start,end);
  assert.match(block,/await window\.PanoramaFinanceLedger\.reverse/);
  assert.match(block,/!c\.withdrawalLedgerEntryId/);
  assert.match(block,/anterior al libro transaccional/);
});

test('regresión: el Cierre POS sólo muta saldos locales después de confirmar PostgreSQL',()=>{
  const start=app.indexOf("form.addEventListener('submit',async function(e)",app.indexOf('function openPOSClose'));
  const end=app.indexOf("function openCategory",start);
  const block=app.slice(start,end);
  assert.ok(block.indexOf('await window.PanoramaFinanceLedger.transfer') < block.indexOf('pos.balance-=withdrawal'));
});
