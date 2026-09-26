/* Panorama Finanzas — Supabase Auth
   Sesión persistente en navegador. El acceso a Finanzas requiere usuario autenticado.
   La clave publishable puede permanecer en el cliente; la autorización real la impone RLS.
*/
(function(){
'use strict';
const cfg=window.PANORAMA_SUPABASE;
let session=null, user=null, readyResolve;
const ready=new Promise(resolve=>{readyResolve=resolve});

function client(){
  if(!cfg?.url||!cfg?.key||!window.supabase?.createClient)return null;
  if(!client.instance) client.instance=window.supabase.createClient(cfg.url,cfg.key,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  return client.instance;
}
function headers(){
  return {
    apikey:cfg?.key||'',
    Authorization:session?.access_token?'Bearer '+session.access_token:'Bearer '+(cfg?.key||''),
    'Content-Type':'application/json'
  };
}
function setSession(next){
  session=next||null;
  user=session?.user||null;
  renderAuth();
  if(session){
    readyResolve(session);
    window.dispatchEvent(new CustomEvent('panorama-auth-ready',{detail:{user}}));
  }
}
function ensureGate(){
  let gate=document.getElementById('panoramaAuthGate');
  if(gate)return gate;
  gate=document.createElement('div');
  gate.id='panoramaAuthGate';
  gate.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(25,22,20,.97);display:flex;align-items:center;justify-content:center;padding:20px;';
  gate.innerHTML='<div style="width:min(420px,100%);background:#fff;border-radius:16px;padding:28px;box-shadow:0 20px 60px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,sans-serif">'+
    '<div style="font-size:12px;font-weight:700;letter-spacing:.12em;color:#777;margin-bottom:8px">PANORAMA CAFÉ</div>'+
    '<h2 style="margin:0 0 8px;color:#2d2926">Finanzas</h2>'+
    '<p style="margin:0 0 20px;color:#666;line-height:1.5">Inicia sesión para acceder a los datos financieros.</p>'+
    '<form id="panoramaAuthForm">'+
    '<label style="display:block;font-size:13px;font-weight:600;margin:12px 0 6px;color:#333">Correo</label><input id="panoramaAuthEmail" type="email" autocomplete="username" required style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #ddd;border-radius:10px">'+
    '<label style="display:block;font-size:13px;font-weight:600;margin:12px 0 6px;color:#333">Contraseña</label><input id="panoramaAuthPassword" type="password" autocomplete="current-password" required style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #ddd;border-radius:10px">'+
    '<div id="panoramaAuthError" style="min-height:20px;margin:10px 0;color:#b42318;font-size:13px"></div>'+
    '<button id="panoramaAuthSubmit" type="submit" style="width:100%;padding:12px;border:0;border-radius:10px;background:#2d2926;color:#fff;font-weight:700;cursor:pointer">Iniciar sesión</button>'+
    '</form></div>';
  document.body.appendChild(gate);
  gate.querySelector('#panoramaAuthForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=gate.querySelector('#panoramaAuthSubmit'),err=gate.querySelector('#panoramaAuthError');
    btn.disabled=true;btn.textContent='Verificando…';err.textContent='';
    try{
      const c=client();if(!c)throw new Error('No se pudo inicializar Supabase Auth.');
      const email=gate.querySelector('#panoramaAuthEmail').value.trim();
      const password=gate.querySelector('#panoramaAuthPassword').value;
      const res=await c.auth.signInWithPassword({email,password});
      if(res.error)throw res.error;
      setSession(res.data.session);
    }catch(ex){err.textContent=ex?.message||'No se pudo iniciar sesión.';}
    finally{btn.disabled=false;btn.textContent='Iniciar sesión';}
  });
  return gate;
}
function renderAuth(){
  const gate=document.getElementById('panoramaAuthGate');
  if(session){if(gate)gate.remove();return;}
  ensureGate();
}
async function init(){
  const c=client();
  if(!c){readyResolve(null);renderAuth();return;}
  try{
    const res=await c.auth.getSession();
    setSession(res.data?.session||null);
    c.auth.onAuthStateChange((event,next)=>{
      if(event==='SIGNED_OUT')setSession(null);
      else if(next)setSession(next);
    });
  }catch(e){console.warn('Panorama Auth no pudo recuperar la sesión',e);readyResolve(null);renderAuth();}
}
window.PanoramaAuth={
  ready,
  headers,
  rpc:async(name,args={})=>{const c=client();if(!c)throw new Error('Supabase Auth no está disponible.');const res=await c.rpc(name,args);if(res.error)throw res.error;return res.data},
  get session(){return session},
  get user(){return user},
  signOut:async()=>{const c=client();if(c)await c.auth.signOut();setSession(null);},
};
async function reconcilePersonalPayments(){
 if(!session||!navigator.onLine||!cfg?.url||!cfg?.key||!window.PanoramaCoreFinance)return;
 try{
   const h=headers();
   const rr=await fetch(cfg.url+'/rest/v1/panorama_personal_state?id=eq.personal-main&select=data',{headers:{...h,'Cache-Control':'no-cache'},cache:'no-store'});
   if(!rr.ok)throw new Error(await rr.text());
   const master=(await rr.json())[0]?.data||{};
   const employees=new Map((master?.employees||[]).map(e=>[String(e.id),e]));
   const rows=(master?.payments||[]).filter(p=>p&&p.id&&p.employeeId&&Number.isFinite(Number(p.amount))).map(p=>({p,e:employees.get(String(p.employeeId))||{}}));
   const stateRow=await window.PanoramaCoreFinance.remoteState();
   const state=stateRow?.data;if(!state||!Array.isArray(state.moves))return;
   const wanted=new Set(rows.map(({p})=>String(p.id)));
   const next=state.moves.filter(m=>m.source!=='personal'||!m.personalPaymentId||wanted.has(String(m.personalPaymentId)));
   const ids=new Set(next.map(m=>String(m.id)));
   for(const {p,e} of rows){
     const id='personal-'+p.id;
     if(ids.has(id))continue;
     next.unshift({id,date:p.paidDate||p.date||new Date().toISOString().slice(0,10),type:'salida',concept:'Nómina — '+String(e.name||p.employeeName||'Personal'),category:'nomina',amount:Number(p.amount),source:'personal',personalPaymentId:String(p.id),employeeId:String(p.employeeId),periodStart:p.periodStart||null,periodEnd:p.periodEnd||null,note:p.note||'',account:p.account||null});
   }
   if(JSON.stringify(next)!==JSON.stringify(state.moves)){
     state.moves=next;
     window.PanoramaCoreFinance.syncState(state);
     await window.PanoramaCoreFinance.sync();
     window.dispatchEvent(new Event('panorama-finanzas-reload'));
   }
 }catch(e){console.warn('Reconciliación Personal→Finanzas pendiente',e)}
}
window.PanoramaFinanceImportPersonal=reconcilePersonalPayments;
window.addEventListener('panorama-auth-ready',()=>reconcilePersonalPayments());
window.addEventListener('online',reconcilePersonalPayments);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)reconcilePersonalPayments()});
setTimeout(()=>reconcilePersonalPayments(),500);
window.addEventListener('DOMContentLoaded',()=>{if(!session)renderAuth()},{once:true});
init();
})();