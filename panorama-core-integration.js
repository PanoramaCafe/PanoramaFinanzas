/* Panorama Finanzas — sincronización offline segura */
(function(){
'use strict';
const cfg=window.PANORAMA_SUPABASE,ROW_ID='finanzas-main',PERSONAL_ROW_ID='personal-main';
const STORAGE_KEY='panorama_finanzas_pf_v1_010',QUEUE_KEY='panorama_finanzas_pending_v2',INIT_KEY='panorama_finanzas_initialized_v1';
if(!cfg?.url||!cfg?.key)return;
const base=cfg.url+'/rest/v1/',headers={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
let busy=false,lastRemoteAt='',retryTimer=null,booting=true;
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const valid=x=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length>0;
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
function queue(state){if(valid(state))write(QUEUE_KEY,clone(state));}
function pending(){return read(QUEUE_KEY);}
function schedule(){clearTimeout(retryTimer);retryTimer=setTimeout(flush,300);}
async function request(path,options={}){const r=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})},cache:'no-store'});const t=await r.text();if(!r.ok)throw new Error(t||r.statusText);return t?JSON.parse(t):null;}
async function put(state){const r=await fetch(base+'panorama_finanzas_state?on_conflict=id',{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:ROW_ID,data:state,updated_at:new Date().toISOString()})});const t=await r.text();if(!r.ok)throw new Error(t||r.statusText);return t?JSON.parse(t)[0]||null:null;}
async function syncState(state){
 if(!valid(state))return {ok:false,skipped:true};
 queue(state);
 if(!navigator.onLine){schedule();return {ok:false,pending:true,offline:true};}
 return flush();
}
async function flush(){
 if(booting||busy||!navigator.onLine)return {ok:false,pending:!!pending()};
 const state=pending();if(!valid(state))return {ok:true,skipped:true};
 busy=true;
 try{
   const row=await put(state);
   lastRemoteAt=row?.updated_at||new Date().toISOString();
   localStorage.removeItem(QUEUE_KEY);
   if(row?.data)write(STORAGE_KEY,row.data);
   window.dispatchEvent(new CustomEvent('panorama-finanzas-sync',{detail:{status:'synced',updatedAt:lastRemoteAt}}));
   return {ok:true,updatedAt:lastRemoteAt};
 }catch(error){
   console.warn('Panorama Finanzas: sincronización pendiente.',error);
   window.dispatchEvent(new CustomEvent('panorama-finanzas-sync',{detail:{status:'pending',error}}));
   return {ok:false,pending:true,error};
 }finally{busy=false;}
}
async function remoteState(){
 if(valid(pending()))await flush();
 const rows=await request('panorama_finanzas_state?id=eq.'+encodeURIComponent(ROW_ID)+'&select=data,updated_at');
 const row=Array.isArray(rows)?rows[0]||null:null;
 if(row?.updated_at)lastRemoteAt=row.updated_at;
 return row;
}
function isEmptyState(s){
 if(!valid(s))return true;
 const keys=['moves','accounts','providers','providerPayments','commitments','commitmentPayments','payrollEmployees','payrollPeriods','fixedPayments','cuts','reconciliations','posCloses','adjustments'];
 return keys.every(k=>!Array.isArray(s[k])||s[k].length===0);
}
async function initializeSync(){
 const already=localStorage.getItem(INIT_KEY)==='1';
 if(already){booting=false;return;}
 try{
   const queued=pending();
   if(valid(queued)){booting=false;return flush();}
   const remote=await remoteState();
   const local=read(STORAGE_KEY);
   if(remote?.data){
     write(STORAGE_KEY,clone(remote.data));
     localStorage.setItem(INIT_KEY,'1');
     window.dispatchEvent(new CustomEvent('panorama-finanzas-sync',{detail:{status:'initialized',updatedAt:remote.updated_at||null}}));
   }else if(valid(local) && !isEmptyState(local)){
     /* Dispositivo ya tenía datos reales: no los destruye ni publica por sorpresa. */
     localStorage.setItem(INIT_KEY,'1');
   }else{
     localStorage.setItem(INIT_KEY,'1');
   }
 }catch(error){
   console.warn('Panorama Finanzas: no fue posible obtener el estado inicial.',error);
 }finally{booting=false;window.dispatchEvent(new Event('panorama-finanzas-core-ready'));}
}
function isPersonalMove(m){return m&&((m.linkedSource==='panorama-personal')||String(m.origin||'')==='panorama-personal'||(m.sourceRecordId&&m.personalPaymentId));}
async function getPersonalPayments(){const rows=await request('panorama_personal_state?id=eq.'+encodeURIComponent(PERSONAL_ROW_ID)+'&select=data');const d=Array.isArray(rows)?rows[0]?.data:null;const em=new Map((d?.employees||[]).map(e=>[String(e.id),e]));return (d?.payments||[]).filter(p=>p?.id).map(p=>({id:String(p.id),employee_id:p.employeeId!=null?String(p.employeeId):null,employee_name:String(em.get(String(p.employeeId))?.name||p.employeeName||'Empleado'),amount:Number(p.amount||0),paid_date:String(p.paidDate||new Date().toISOString().slice(0,10)).slice(0,10),period_start:p.periodStart||null,period_end:p.periodEnd||null,note:String(p.note||''),account:p.account||null})).filter(p=>p.employee_id&&Number.isFinite(p.amount)&&p.amount>=0);}
function receiveEvent(event){if(!event||typeof event!=='object'||!event.type)return {accepted:false};window.dispatchEvent(new CustomEvent('panorama-finanzas-event',{detail:event}));return {accepted:true};}
function publishEvent(event){if(!event||typeof event!=='object'||!event.type)return false;window.dispatchEvent(new CustomEvent('panorama-finanzas-published',{detail:event}));return true;}
function getSummary(){return {source:'finanzas',ready:true,updatedAt:lastRemoteAt||null,pending:!!pending(),indicators:{},alerts:[]};}
function flatten(v){if(v==null)return '';if(Array.isArray(v))return v.map(flatten).join(', ');if(typeof v==='object')return Object.entries(v).map(([k,x])=>k+': '+flatten(x)).join(' | ');return v;}
function normalizeRows(rows){return (Array.isArray(rows)?rows:[]).map(r=>r&&typeof r==='object'&&!Array.isArray(r)?Object.fromEntries(Object.entries(r).map(([k,v])=>[k,flatten(v)])):{valor:flatten(r)});}
function exportExcelBackup(){let s=read(STORAGE_KEY)||{};const stamp=new Date().toISOString().slice(0,10),sheets=[['Resumen',[{generado:new Date().toISOString(),movimientos:(s.moves||[]).length,cuentas:(s.accounts||[]).length}]],['Cuentas',s.accounts],['Movimientos',s.moves],['Proveedores',s.providers],['Pagos proveedores',s.providerPayments],['Compromisos',s.commitments],['Pagos compromisos',s.commitmentPayments],['Empleados nómina',s.payrollEmployees],['Periodos nómina',s.payrollPeriods],['Pagos fijos',s.fixedPayments],['Cortes',s.cuts],['Conciliaciones',s.reconciliations],['Cierres POS',s.posCloses],['Ajustes',s.adjustments]];const esc=v=>{const x=String(v??'');return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x};const text='\uFEFF'+sheets.map(([n,r])=>{const a=normalizeRows(r),k=[...new Set(a.flatMap(x=>Object.keys(x)))];return '### '+n+'\n'+(k.length?k.join(',')+'\n'+a.map(x=>k.map(z=>esc(x[z])).join(',')).join('\n'):'Sin registros')}).join('\n\n');const b=new Blob([text],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Panorama_Finanzas_'+stamp+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),0);}
function installExcelExport(){const anchor=document.getElementById('btnExportData');if(!anchor||document.getElementById('btnExportExcel'))return;const b=document.createElement('button');b.type='button';b.className='btn';b.id='btnExportExcel';b.textContent='⇩ Exportar datos (Excel)';b.onclick=exportExcelBackup;anchor.insertAdjacentElement('afterend',b);}
window.PanoramaCoreFinance={syncState,remoteState,receiveEvent,publishEvent,getSummary,exportExcelBackup,flush,employees:()=>request('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc'),pending:()=>request('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=requested_at.asc'),paymentHistory:()=>request('personal_payment_records?select=*&order=created_at.desc'),directPayments:()=>request('panorama_payroll_payments?select=*&order=paid_date.desc,created_at.desc'),debugStatus:()=>({busy,lastRemoteAt,pending:!!pending(),online:navigator.onLine,rowId:ROW_ID,initialized:localStorage.getItem(INIT_KEY)==='1',booting})};
window.addEventListener('online',()=>flush());document.addEventListener('visibilitychange',()=>{if(!document.hidden)flush()});setInterval(()=>flush(),4000);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installExcelExport);else installExcelExport();
initializeSync();
})();