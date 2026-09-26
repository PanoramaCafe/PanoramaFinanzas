/* Panorama Finanzas — state integrity gate. Pure validation; no writes. */
(function(){'use strict';
const ARRAY_FIELDS=['moves','providers','providerPayments','commitments','commitmentPayments','payrollEmployees','payrollPeriods','fixedPayments','cuts','reconciliations','posCloses','adjustments','loyverseSummaries','loyverseTreasuryExpenses'];
function finitePositive(v){return Number.isFinite(Number(v))&&Number(v)>0}
function finiteNumber(v){return Number.isFinite(Number(v))}
function validate(state,options={}){
 const scopeAccounts=Array.isArray(options.accountIds)?new Set(options.accountIds.map(String)):null;
 const errors=[];
 if(!state||typeof state!=='object'||Array.isArray(state))return {ok:false,errors:['El estado financiero no es un objeto.']};
 if(!Array.isArray(state.accounts))errors.push('accounts debe ser un arreglo.');
 if(!state.categories||typeof state.categories!=='object')errors.push('Falta categories.');
 for(const k of ['entrada','salida','compromiso'])if(!Array.isArray(state.categories?.[k]))errors.push('Falta categories.'+k+'.');
 for(const k of ARRAY_FIELDS)if(!Array.isArray(state[k]))errors.push(k+' debe ser un arreglo.');
 const ids=new Set();
 for(const a of state.accounts||[]){const id=String(a?.id||'');if(!id)errors.push('Cuenta sin id.');else if(ids.has(id))errors.push('ID de cuenta duplicado: '+id+'.');else ids.add(id);if((!scopeAccounts||scopeAccounts.has(id))&&(!finiteNumber(a?.balance)||Number(a.balance)<0))errors.push('Saldo inválido en cuenta '+(id||'(sin id)')+'.');}
 const accountId=id=>ids.has(String(id||''));
 const checkUnique=(arr,name)=>{const seen=new Set();for(const x of arr||[]){const id=String(x?.id||'');if(!id)errors.push(name+': registro sin id.');else if(seen.has(id))errors.push(name+': ID duplicado '+id+'.');else seen.add(id)}};
 for(const k of ARRAY_FIELDS)checkUnique(state[k],k);
 const externalSeen=new Set();
 for(const m of state.moves||[]){const type=String(m?.type||'');if(!finitePositive(m?.amount))errors.push('Movimiento '+(m?.id||'?')+' tiene importe inválido.');if(!['entrada','salida','transferencia','compra_credito'].includes(type))errors.push('Movimiento '+(m?.id||'?')+' tiene tipo inválido: '+type+'.');if(type==='transferencia'){if(!accountId(m.from)||!accountId(m.to))errors.push('Transferencia '+(m?.id||'?')+' con cuenta origen/destino inválida.');if(String(m.from)===String(m.to))errors.push('Transferencia '+(m?.id||'?')+' usa la misma cuenta.')}else if(m.account||m.from){if(!accountId(m.account||m.from))errors.push('Movimiento '+(m?.id||'?')+' referencia una cuenta inexistente.')}if(m.to&&!accountId(m.to))errors.push('Movimiento '+(m?.id||'?')+' referencia destino inexistente.');const ext=String(m?.externalId||'').trim(),source=String(m?.origin||m?.source||'');if(ext&&source){const key=source+'::'+ext;if(externalSeen.has(key))errors.push('Referencia externa duplicada: '+key+'.');externalSeen.add(key)}}
 const providerIds=new Set((state.providers||[]).map(x=>String(x.id)));
 for(const p of state.providers||[])if(!finiteNumber(p?.creditBalance)||Number(p.creditBalance)<0)errors.push('Deuda inválida del proveedor '+(p?.id||'?')+'.');
 for(const p of state.providerPayments||[]){if(!providerIds.has(String(p?.providerId||'')))errors.push('Pago de proveedor '+(p?.id||'?')+' sin proveedor.');if(!finitePositive(p?.amount))errors.push('Pago de proveedor '+(p?.id||'?')+' con importe inválido.');if(p.accountId&&!accountId(p.accountId))errors.push('Pago de proveedor '+(p?.id||'?')+' con cuenta inexistente.')}
 const commitmentIds=new Set((state.commitments||[]).map(x=>String(x.id)));
 for(const c of state.commitments||[]){const total=Number(c?.total),paid=Number(c?.paid||0);if(!finitePositive(total)||!finiteNumber(paid)||paid<0||paid>total)errors.push('Compromiso '+(c?.id||'?')+' tiene total/pagado incoherente.')}
 for(const p of state.commitmentPayments||[]){if(!commitmentIds.has(String(p?.commitmentId||'')))errors.push('Pago de compromiso '+(p?.id||'?')+' sin compromiso.');if(!finitePositive(p?.amount))errors.push('Pago de compromiso '+(p?.id||'?')+' con importe inválido.');if(p.accountId&&!accountId(p.accountId))errors.push('Pago de compromiso '+(p?.id||'?')+' con cuenta inexistente.')}
 for(const p of state.payrollPeriods||[]){const id=String(p?.id||'?');if(!finitePositive(p?.amount))errors.push('Pago de nómina '+id+' con importe inválido.');if(!accountId(p?.accountId))errors.push('Pago de nómina '+id+' con cuenta inexistente.');if(p.origin==='external'&&!String(p.externalId||'').trim())errors.push('Pago de nómina externo '+id+' sin referencia externa.')}
 const payrollExt=new Set();for(const p of state.payrollPeriods||[]){const ext=String(p?.externalId||'').trim();if(ext){if(payrollExt.has(ext))errors.push('Referencia externa de nómina duplicada: '+ext+'.');payrollExt.add(ext)}}
 for(const f of state.fixedPayments||[]){if(!finitePositive(f?.amount))errors.push('Pago fijo '+(f?.id||'?')+' con importe inválido.');if(!['pendiente','pagado'].includes(String(f?.status||'')))errors.push('Estado inválido en pago fijo '+(f?.id||'?')+'.');if(f.status==='pagado'&&!accountId(f.accountId))errors.push('Pago fijo pagado '+(f?.id||'?')+' sin cuenta válida.')}
 for(const x of state.loyverseTreasuryExpenses||[]){if(!finitePositive(x?.amount))errors.push('Salida Loyverse '+(x?.id||'?')+' con importe inválido.');if(!String(x?.externalId||'').trim())errors.push('Salida Loyverse '+(x?.id||'?')+' sin referencia externa.');if(!accountId(x?.accountId))errors.push('Salida Loyverse '+(x?.id||'?')+' sin cuenta válida.')}
 const result={ok:errors.length===0,errors};if(!result.ok&&!options.silent)console.warn('Panorama Finanzas: estado rechazado',errors);return result;
}
window.PanoramaFinanceIntegrity={validate};
})();