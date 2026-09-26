import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const integrity=fs.readFileSync(new URL('../js/financial-integrity.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const core=fs.readFileSync(new URL('../panorama-core-integration.js',import.meta.url),'utf8');

function validate(state){
  const sandbox={console:{warn(){},error(){}},window:{}};
  vm.runInNewContext(integrity,sandbox);
  return sandbox.window.PanoramaFinanceIntegrity.validate(state,{silent:true});
}
function base(){
  return {
    accounts:[{id:'principal',name:'Caja Principal',type:'Caja',balance:1000,active:true}],
    categories:{entrada:[],salida:[],compromiso:[]},
    moves:[],providers:[],providerPayments:[],commitments:[],commitmentPayments:[],
    payrollEmployees:[],payrollPeriods:[],fixedPayments:[],cuts:[],reconciliations:[],
    posCloses:[],adjustments:[],loyverseSummaries:[],loyverseTreasuryExpenses:[]
  };
}

test('integridad acepta un estado financiero mínimo válido',()=>{
  const r=validate(base());
  assert.equal(r.ok,true,r.errors.join('\n'));
});

test('integridad rechaza cuentas con saldo negativo',()=>{
  const s=base();s.accounts[0].balance=-1;
  assert.equal(validate(s).ok,false);
});

test('integridad rechaza IDs duplicados',()=>{
  const s=base();s.moves=[{id:'m1',type:'entrada',amount:10,account:'principal'},{id:'m1',type:'salida',amount:5,account:'principal'}];
  assert.equal(validate(s).ok,false);
});

test('integridad rechaza transferencias con origen y destino iguales',()=>{
  const s=base();s.accounts.push({id:'other',balance:0});
  s.moves=[{id:'t1',type:'transferencia',amount:10,from:'principal',to:'principal'}];
  assert.equal(validate(s).ok,false);
});

test('integridad rechaza compromisos pagados por encima del total',()=>{
  const s=base();s.commitments=[{id:'c1',total:100,paid:101}];
  assert.equal(validate(s).ok,false);
});

test('integridad exige cuenta para una salida Loyverse',()=>{
  const s=base();s.loyverseTreasuryExpenses=[{id:'l1',externalId:'cashout-1',amount:10,accountId:null}];
  assert.equal(validate(s).ok,false);
});

test('el guardado pasa por el validador central',()=>{
  assert.match(app,/PanoramaFinanceIntegrity\?\.validate\(candidate/);
  assert.match(app,/db=clone\(lastGoodState\)/);
});

test('la recepción remota del módulo UI no reemplaza directamente el estado',()=>{
  assert.match(app,/window\.PanoramaCoreFinance\?\.sync\?\.\(\)/);
  assert.doesNotMatch(app,/const remote=await window\.PanoramaCoreFinance\?\.remoteState\?\.\(\)/);
});

test('el motor Core valida antes de escribir al estado remoto',()=>{
  assert.match(core,/PanoramaFinanceIntegrity\?\.validate\(data/);
  assert.match(core,/authHeaders\(\),Prefer:'resolution=merge-duplicates/);
  assert.doesNotMatch(core,/headers:\{\.\.\.H,Prefer:/);
});

test('eventos externos registran el evento antes de mutar el saldo',()=>{
  const start=app.indexOf('function applyExternalFinancialEvent');
  const end=app.indexOf('\nfunction openAccount',start);
  const block=app.slice(start,end);
  assert.ok(block.indexOf('const id=registerIntegrationEvent(p)')<block.indexOf('if(direction===\'out\')acc.balance-=amount'));
});

test('merge de cuentas nuevas conserva su saldo',()=>{
  const start=core.indexOf('function accountChanges');
  const end=core.indexOf('function merge',start);
  const block=core.slice(start,end);
  assert.ok(block.includes('if(!old){meta[id]=clone(v);continue}'));
});

test('merge de cuentas eliminadas elimina el registro remoto',()=>{
  assert.ok(core.includes('for(const id of ac.deleted)am.delete(id)'));
});

test('eventos de integración participan en el merge como colección',()=>{
  assert.ok(core.includes("loyverseTreasuryExpenses','integrationEvents"));
});
