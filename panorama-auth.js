/* Panorama Finanzas — Supabase Auth
   Sesión persistente en navegador. El acceso a Finanzas requiere usuario autenticado.
   La clave publishable puede permanecer en el cliente; la autorización real la impone RLS.
*/
(function(){
'use strict';
const cfg=window.PANORAMA_SUPABASE;
const storageKey='panorama_finanzas_auth_session_v1';
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
  if(session)localStorage.setItem(storageKey,JSON.stringify(session));
  else localStorage.removeItem(storageKey);
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
  get session(){return session},
  get user(){return user},
  signOut:async()=>{const c=client();if(c)await c.auth.signOut();setSession(null);},
  requestAccess:()=>{renderAuth();},
  directAccess:false
};
window.addEventListener('DOMContentLoaded',()=>{if(!session)renderAuth()},{once:true});
init();
})();