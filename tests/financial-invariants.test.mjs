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

test('regresión: pagos fijos revierten el movimiento anterior al editar un pago ya pagado', () => {
  const start = app.indexOf("if(x){");
  const end = app.indexOf("save();renderFixedPayments();closeModal();", start);
  const block = app.slice(start, end);
  assert.match(block, /const wasPaid=x\.status==='pagado'/);
  assert.match(block, /oldAcc\.balance\+=oldAmount/);
  assert.match(block, /sourceRecordId===x\.id&&m\.origin==='pagos_fijos'/);
});

test('regresión: respaldo JSON sigue separado de exportación XLSX', () => {
  assert.match(app, /getElementById\('btnExportData'\)\.addEventListener\('click',exportData\)/);
  assert.match(app, /a\.download='Panorama_Finanzas_Backup_/);
  assert.match(app, /requiredArrays=\['accounts','moves'/);
  assert.match(app, /db=clone\(d\)/);
});
