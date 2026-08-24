/* Panorama Finanzas — sync v9: central master + safe bidirectional polling */
(function(){
'use strict';
const cfg=window.PANORAMA_SUPABASE, ROW='finanzas-main', STORE='panorama_finanzas_pf_v1_010', ACK='panorama_finanzas_ack_v5', INIT='panorama_finanzas_initialized_v5', QUEUE='panorama_finanzas_pending_v5';
if(!cfg?.url||!cfg?.key)return;
const base=cfg.url+'/rest/v1/', H={apikey:cfg.key,Authorization:'Bearer '+cfg.key,'Content-Type':'application/json'};
const arrays=['moves','providers','providerPayments','commitments','commitmentPayments','payrollEmployees','payrollPeriods','fixedPayments','cuts','reconciliations','posCloses','adjustments','loyverseSummaries','loyverseTreasuryExpenses'];
let busy=false,booting=true,lastRemoteAt='',pollTimer=0;
const clone=x=>x==null?x:JSON.parse(JSON.stringify(x));
const read=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch{return null}};
const write=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
const valid=x=>x&&typeof x==='object'&&!Array.isArray(x);
const empty=s=>!valid(s)||arrays.every(k=>!Array.isArray(s[k])||s[k].length===0);
const map=a=>{const m=new Map();(a||[]).forEach(x=>{if(x?.id!=null)m.set(String(x.id),x)});return m};
async function req(path,opt={}){const r=await fetch(base+path,{...opt,headers:{...H,...(opt.headers||{})},cache:'no-store'});const t=await r.text();if(!r.ok)throw Error(t||r.statusText);return t?JSON.parse(t):null}
async function remote(){const r=await req('panorama_finanzas_state?id=eq.'+encodeURIComponent(ROW)+'&select=data,updated_at');return r?.[0]||null}
async function saveMaster(data){const r=await req('panorama_finanzas_state?on_conflict=id',{method:'POST',headers:{...H,Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({id:ROW,data,updated_at:new Date().toISOString()})});return r?.[0]||null}
function changes(base,local){const u={},d={};for(const k of arrays){const a=map(base?.[k]),b=map(local?.[k]),up=[],del=[];for(const [id,v] of b)if(!a.has(id)||JSON.stringify(a.get(id))!==JSON.stringify(v))up.push(clone(v));for(const id of a.keys())if(!b.has(id))del.push(id);if(up.length)u[k]=up;if(del.length)d[k]=del}return {u,d}}
function accountChanges(base,local){const a=map(base?.accounts),b=map(local?.accounts),delta={},meta={};for(const [id,v] of b){const old=a.get(id),d=Number(v.balance||0)-Number(old?.balance||0);if(d)delta[id]=d;const m=clone(v);delete m.balance;if(!old||JSON.stringify(m)!==JSON.stringify(old&&Object.fromEntries(Object.entries(old).filter(([k])=>k!=='balance'))))meta[id]=m}for(const [id,v] of a)if(!b.has(id))delta[id]=-Number(v.balance||0);return {delta,meta}}
function merge(remoteBase,ack,local){const out=clone(remoteBase)||{},c=changes(ack,local);for(const k of arrays){const m=map(out[k]);(c.u[k]||[]).forEach(x=>m.set(String(x.id),clone(x)));(c.d[k]||[]).forEach(id=>m.delete(String(id)));out[k]=[...m.values()]}const ac=accountChanges(ack,local),am=map(out.accounts);for(const [id,m] of Object.entries(ac.meta)){const old=am.get(id);am.set(id,old?{...old,...m}:m)}for(const [id,d] of Object.entries(ac.delta)){const a=am.get(id);if(a)a.balance=Number(a.balance||0)+Number(d)}out.accounts=[...am.values()];for(const k of Object.keys(local||{}))if(!arrays.includes(k)&&k!=='accounts'&&JSON.stringify(ack?.[k])!==JSON.stringify(local?.[k]))out[k]=clone(local[k]);return out}
function changed(ack,local){return JSON.stringify(ack||{})!==JSON.stringify(local||{})}
function applyRemote(server){write(STORE,server);write(ACK,server);localStorage.removeItem(QUEUE);window.dispatchEvent(new Event('panorama-finanzas-reload'));}
async function sync(){if(booting||busy||!navigator.onLine)return;busy=true;try{const r=await remote(),server=clone(r?.data||{}),local=read(STORE),ack=read(ACK);if(r?.updated_at)lastRemoteAt=r.updated_at;
if(!local){if(r?.data){applyRemote(server);localStorage.setItem(INIT,'1')}return}
if(!ack){if(r?.data){applyRemote(server)}else{write(ACK,clone(local))}localStorage.setItem(INIT,'1');return}
if(changed(ack,local)){const merged=merge(server,ack,local),saved=await saveMaster(merged),final=saved?.data||merged;write(STORE,final);write(ACK,final);if(saved?.updated_at)lastRemoteAt=saved.updated_at;localStorage.removeItem(QUEUE)}else if(r?.updated_at&&r.updated_at!==lastRemoteAt){applyRemote(server)}else if(JSON.stringify(server)!==JSON.stringify(ack)){applyRemote(server)}
window.dispatchEvent(new CustomEvent('panorama-finanzas-sync',{detail:{status:'synced'}}))}catch(e){if(read(STORE))write(QUEUE,read(STORE));window.dispatchEvent(new CustomEvent('panorama-finanzas-sync',{detail:{status:'pending',error:e}}))}finally{busy=false}}
function syncState(state){if(valid(state))write(STORE,clone(state));if(navigator.onLine)sync();else write(QUEUE,clone(state));return {pending:!navigator.onLine}}
function getSummary(){return {source:'finanzas',ready:true,pending:!!read(QUEUE),indicators:{},alerts:[]}}
window.PanoramaCoreFinance={syncState,remoteState:remote,sync,flush:sync,getSummary,receiveEvent:e=>({accepted:!!e}),publishEvent:e=>!!e,employees:()=>req('employees?active=eq.true&select=id,full_name,personal_data&order=full_name.asc'),pending:()=>req('payroll_payment_requests?status=eq.PENDING_PAYMENT&select=*,employees(full_name)&order=full_name.asc'),paymentHistory:()=>req('personal_payment_records?select=*&order=created_at.desc'),directPayments:()=>req('panorama_payroll_payments?select=*&order=paid_date.desc,created_at.desc')};
window.addEventListener('online',sync);document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync()});
async function boot(){try{const local=read(STORE),r=await remote();if(r?.updated_at)lastRemoteAt=r.updated_at;if(!local||empty(local)){if(r?.data){applyRemote(clone(r.data));localStorage.setItem(INIT,'1')}else if(local){write(ACK,clone(local));localStorage.setItem(INIT,'1')}}else if(!read(INIT)){if(r?.data&&!empty(r.data)){applyRemote(clone(r.data))}else write(ACK,clone(local));localStorage.setItem(INIT,'1')}}catch(e){}finally{booting=false;sync()}}
boot();pollTimer=setInterval(sync,1000);
})();
