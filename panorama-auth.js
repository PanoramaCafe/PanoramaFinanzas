/* Panorama Finanzas: direct access + authoritative Personal → Finanzas payroll reconciliation.
   No Realtime/WebSockets. Finanzas polls the already-synchronized Personal master row directly.
   Personal is the single source of truth for payroll movements. */
(function(){
'use strict';
const cfg=window.PANORAMA_SUPABASE;
const headers=()=>({apikey:cfg?.key||'',Authorization:cfg?.key?'Bearer '+cfg.key:'','Content-Type':'application/json'});
const ready=Promise.resolve(null);function signOut(){}async function requestAccess(){return {direct_access:true}}
function removeLegacyGate(){document.getElementById('panoramaAuthGate')?.remove()}
window.addEventListener('DOMContentLoaded',removeLegacyGate,{once:true});if(document.readyState!=='loading')removeLegacyGate();
window.PanoramaAuth={ready,headers,get session(){return null},signOut,requestAccess,directAccess:true};
let busy=false,lastSignature='';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
async function getPersonalMaster(){const r=await fetch(cfg.url+'/rest/v1/panorama_personal_state?id=eq.personal-main&select=data',{headers:{...headers(),'Cache-Control':'no-cache'},cache:'no-store'});if(!r.ok)throw new Error(await r.text());return (await r.json())[0]?.data||{}}
function currentPayments(master){const employees=new Map((master?.employees||[]).map(e=>[String(e.id),e]));return (master?.payments||[]).filter(p=>p&&p.id&&p.employeeId&&Number.isFinite(Number(p.amount))).map(p=>({p,e:employees.get(String(p.employeeId))||{}}))}
async function reconcilePersonalPayments(){
 if(busy||!navigator.onLine||!cfg?.url||!cfg?.key||!window.PanoramaCoreFinance)return;
 busy=true;
 try{
  const master=await getPersonalMaster();
  const rows=currentPayments(master);
  const signature=JSON.stringify(rows.map(({p})=>[p.id,p.employeeId,p.amount,p.paidDate||p.date,p.periodStart,p.periodEnd,p.note,p.account]));
  const stateRow=await window.PanoramaCoreFinance.remoteState();
  const state=stateRow?.data;if(!state||!Array.isArray(state.moves))return;
  const wanted=new Set(rows.map(({p})=>String(p.id)));
  const next=state.moves.filter(m=>m.source!=='personal'||!m.personalPaymentId||wanted.has(String(m.personalPaymentId)));
  const ids=new Set(next.map(m=>String(m.id)));
  for(const {p,e} of rows){const id='personal-'+p.id;if(ids.has(id))continue;next.unshift({id,date:p.paidDate||p.date||new Date().toISOString().slice(0,10),type:'salida',concept:'Nómina — '+String(e.name||p.employeeName||'Personal'),category:'nomina',amount:Number(p.amount),source:'personal',personalPaymentId:String(p.id),employeeId:String(p.employeeId),periodStart:p.periodStart||null,periodEnd:p.periodEnd||null,note:p.note||'',account:p.account||null})}
  if(signature===lastSignature&&same(next,state.moves))return;
  lastSignature=signature;
  if(!same(next,state.moves)){
   state.moves=next;
   window.PanoramaCoreFinance.syncState(state);
   await window.PanoramaCoreFinance.sync();
   /* app.js keeps its own in-memory state; refresh automatically only after a bridge change. */
   window.dispatchEvent(new Event('panorama-finanzas-reload'));
   setTimeout(()=>location.reload(),120);
  }
 }catch(e){console.warn('Reconciliación Personal→Finanzas pendiente',e)}finally{busy=false}
}
window.PanoramaFinanceImportPersonal=reconcilePersonalPayments;
setTimeout(reconcilePersonalPayments,150);
setInterval(reconcilePersonalPayments,350);
window.addEventListener('online',reconcilePersonalPayments);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconcilePersonalPayments()});
})();
