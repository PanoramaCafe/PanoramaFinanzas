/* Panorama Finanzas — sincronización estable v4
   Mantiene una fila maestra de estado, pero sincroniza cambios a nivel de registro.
   Un dispositivo nuevo nunca puede publicar un estado vacío sobre el maestro. */
(function(){
'use strict';
const cfg=window.PANORAMA_SUPABASE;
const ROW_ID='finanzas-main',PERSONAL_ROW_ID='personal-main';
const STORAGE_KEY='panorama_finanzas_pf_v1_010',QUEUE_KEY='panorama_finanzas_pending_v4',ACK_KEY='panorama_finanzas_ack_v4',INIT_KEY='panorama_finanzas_initialized_v4';
if(!cfg?.url||!cfg?.key)return;
const base=cfg.url+'/rest/v1/',headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
let busy=false,booting=true,lastRemoteAt='';
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const valid=x=>x&&typeof x==='object'&&!Array.isArray(x);
const arrays=['moves','providers','providerPayments','commitments','commitmentPayments','payrollEmployees','payrollPeriods','fixedPayments','cuts','reconciliations','posCloses','adjustments','loyverseSummaries','loyverseTreasuryExpenses'];
function emptyState(s){return !valid(s)||arrays.every(k=>!Array.isArray(s[k])||s[k].length===0)}
function byId(a){const m=new Map();(Array.isArray(a)?a:[]).forEach(x=>{if(x?.id!=null)m.set(String(x.id),x)});return m}
async function request(path,options={}){const r=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})},cache:'no-store'});const t=await r.text();if(!r.ok)throw new Error(t||r.statusText);return t?JSON.parse(t):null}
async function getRemote(){const rows=await request('panorama_finanzas_state?id=eq.'+encodeURIComponent(ROW_ID)+'&select=data,updated_at');return Array.isArray(rows)?rows[0]||null:null}
async function put(state){return request('panorama_finanzas_state?on_conflict=id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:ROW_ID,data:state,updated_at:new Date().toISOString()})})}
function changedRecords(base,now){const out={upserts:{},deletes:{}};for(const k of arrays){const a=byId(base?.[k]),b=byId(now?.[k]),u=[],d=[];for(const [id,v] of b){if(!a.has(id)||JSON.stringify(a.get(id))!==JSON.stringify(v))u.push(clone(v))}for(const id of a.keys())if(!b.has(id))d.push(id);if(u.length)out.upserts[k]=u;if(d.length)out.deletes[k]=d}return out}
function accountChanges(base,now){const out={delta:{},meta:{}};const a=byId(base?.accounts),b=byId(now?.accounts);for(const [id,v] of b){const old=a.get(id);const d=Number(v.balance||0)-Number(old?.balance||0);if(d)out.delta[id]=d;const m=clone(v);delete m.balance;if(!old||JSON.stringify(m)!==JSON.stringify((()=>{const x=clone(old);if(x)delete x.balance;return x})()))out.meta[id]=m}for(const [id,v] of a)if(!b.has(id))out.delta[id]=-Number(v.balance||0);return out}
function applyChanges(remote,base,local){const out=clone(remote)||{};const c=changedRecords(base,local);for(const k of arrays){const m=byId(out[k]);for(const item of c.upserts[k]||[])m.set(String(item.id),clone(item));for(const id of c.deletes[k]||[])m.delete(String(id));out[k]=[...m.values()]}
const ac=accountChanges(base,local),am=byId(out.accounts);for(const [id,m] of Object.entries(ac.meta)){const old=am.get(id);am.set(id,old?{...old,...clone(m)}:clone(m))}for(const [id,d] of Object.entries(ac.delta)){const a=am.get(id);if(a)a.balance=Number(a.balance||0)+Number(d||0)}out.accounts=[...am.values()];
for(const k of Object.keys(local||{})){if(arrays.includes(k)||k==='accounts')continue;if(JSON.stringify(base?.[k])!==JSON.stringify(local?.[k]))out[k]=clone(local[k])}return out}
function hasLocalChanges(base,local){if(JSON.stringify(base?.accounts)!==JSON.stringify(local?.accounts))return true;return arrays.some(k=>JSON.stringify(base?.[k]||[])!==JSON.stringify(local?.[k]||[]))}
async function sync(){if(booting||busy||!navigator.onLine)return false;busy=true;try{const local=read(STORAGE_KEY);if(!valid(local)){busy=false;return false}const base=read(ACK_KEY);const remote=await getRemote();const remoteData=clone(remote?.data||{});
/* Primera conexión de un dispositivo: sólo descarga el maestro. */
if(!base&&!localStorage.getItem(INIT_KEY)){if(remoteData&&!emptyState(remoteData)){write(STORAGE_KEY,remoteData);write(ACK_KEY,remoteData);localStorage.setItem(INIT_KEY,'1');window.dispatchEvent(new Event('panorama-finanzas-reload'));return true}write(ACK_KEY,clone(local));localStorage.setItem(INIT_KEY,'1');}
const ack=read(ACK_KEY)||remoteData||{};const current=read(STORAGE_KEY)||{};
if(hasLocalChanges(ack,current)){
 const merged=applyChanges(remoteData,ack,current);
 const saved=await put(merged);const final=saved?.data||merged;write(STORAGE_KEY,final);write(ACK_KEY,clone(final));localStorage.removeItem(QUEUE_KEY);
}else if(remoteData){write(STORAGE_KEY,remoteData);write(ACK_KEY,clone(remoteData));localStorage.removeItem(QUEUE_KEY)}
lastRemoteAt=new Date().toISOString();window.dispatchEvent(new CustomEvent('panorama-finanzas-sync',{detail:{status:'synced',updatedAt:lastRemoteAt}}));window.dispatchEvent(new Event('panorama-finanzas-reload'));return true;
}catch(e){console.warn('Panorama Finanzas sync pendiente',e);write(QUEUE_KEY,read(STORAGE_KEY));window.dispatchEvent(new CustomEvent('panorama-finanzas-sync',{detail:{status:'pending',error:e}}));return false}finally{busy=false}}
function syncState(state){if(valid(state))write(STORAGE_KEY,clone(state));if(navigator.onLine)setTimeout(sync,100);else write(QUEUE_KEY,clone(state));return {pending:!navigator.onLine}}
async function remoteState(){return getRemote()}
function getSummary(){return {source:'finanzas',ready:true,updatedAt:lastRemoteAt||null,pending:!!read(QUEUE_KEY),indicators:{},alerts:[]}}
function receiveEvent(e){window.dispatchEvent(new CustomEvent('panorama-finanzas-event',{detail:e}));return {accepted:!!e}}
function publishEvent(e){window.dispatchEvent(new CustomEvent('panorama-finanzas-published',{detail:e}));return true}
function flatten(v){if(v==null)return '';if(Array.isArray(v))return v.map(flatten).join(', ');if(typeof v==='object')return Object.entries(v).map(([k,x])=>k+': '+flatten(x)).join(' | ');return v}
function normalizeRows(rows){return(Array.isArray(rows)?rows:[]).map(r=>r&&typeof r==='object'&&!Array.isArray(r)?Object.fromEntries(Object.entries(r).map(([k,v])=>[k,flatten(v)])):{valor:flatten(r)})}
function exportExcelBackup(){const s=read(STORAGE_KEY)||{};const stamp=new Date().toISOString().slice(0,10),sheets=[['Resumen',[{generado:new Date().toISOString(),movimientos:(s.moves||[]).length,cuentas:(s.accounts||[]).length}]],['Cuentas',s.accounts],['Movimientos',s.moves],['Proveedores',s.providers],['Pagos proveedores',s.providerPayments],['Compromisos',s.commitments],['Pagos compromisos',s.commitmentPayments],['Empleados nómina',s.payrollEmployees],['Periodos nómina',s.payrollPeriods],['Pagos fijos',s.fixedPayments],['Cortes',s.cuts],['Conciliaciones',s.reconciliations],['Cierres POS',s.posCloses],['Ajustes',s.adjustments]];const esc=v=>{const x=String(v??'');return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x};const text='\uFEFF'+sheets.map(([n,r])=>{const a=normalizeRows(r),k=[...new Set(a.flatMap(x=>Object.keys(x)))];return '### '+n+'\n'+(k.length?k.join(',')+'\n'+a.map(x=>k.map(z=>esc(x[z])).join(',')).join('\n'):'Sin registros')}).join('\n\n');const b=new Blob([text],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Panorama_Finanzas_'+stamp+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0)}
window.PanoramaCoreFinance={syncState,remoteState,receiveEvent,publishEvent,getSummary,exportExcelBackup,sync,flush:sync,employees:()=>request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc'),pending:()=>request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc'),paymentHistory:()=>request('personal_payment_records?select=*&order=created_at.desc'),directPayments:()=>request('panorama_payroll_payments?select=*&order=paid_date.desc,created_at.desc'),debugStatus:()=>({busy,online:navigator.onLine,pending:!!read(QUEUE_KEY),initialized:!!localStorage.getItem(INIT_KEY)})};
window.addEventListener('online',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});window.addEventListener('panorama-finanzas-reload',()=>{if(typeof db!=='undefined'&&window.PanoramaCoreFinance){try{const d=read(STORAGE_KEY);if(d){db=d;if(typeof renderAll==='function')renderAll()}}catch(e){}}});
async function boot(){try{const local=read(STORAGE_KEY),remote=await getRemote();if(!local||emptyState(local)){if(remote?.data){write(STORAGE_KEY,clone(remote.data));write(ACK_KEY,clone(remote.data));localStorage.setItem(INIT_KEY,'1');window.dispatchEvent(new Event('panorama-finanzas-reload'))}else if(local){write(ACK_KEY,clone(local));localStorage.setItem(INIT_KEY,'1')}}else if(!localStorage.getItem(INIT_KEY)){if(remote?.data&&!emptyState(remote.data)){write(STORAGE_KEY,clone(remote.data));write(ACK_KEY,clone(remote.data));localStorage.setItem(INIT_KEY,'1');window.dispatchEvent(new Event('panorama-finanzas-reload'))}else{write(ACK_KEY,clone(local));localStorage.setItem(INIT_KEY,'1')}}}catch(e){console.warn(e)}finally{booting=false;await sync()}}
boot();setInterval(sync,5000);
})();