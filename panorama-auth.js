/* Panorama Core authentication gate */
(function(){
  const cfg=window.PANORAMA_SUPABASE;
  const storageKey='panorama_core_session_v1';
  let session=null;
  function readSession(){try{return JSON.parse(localStorage.getItem(storageKey)||'null')}catch{return null}}
  function persist(next){session=next;localStorage.setItem(storageKey,JSON.stringify(next))}
  function cleanUrl(){if(location.hash){history.replaceState({},document.title,location.pathname+location.search)}}
  async function authRequest(path,options={}){
    const response=await fetch(cfg.url+'/auth/v1/'+path,{...options,headers:{apikey:cfg.key,'Content-Type':'application/json',...(options.headers||{})}});
    const body=await response.text();
    if(!response.ok)throw new Error(body||response.statusText);
    return body?JSON.parse(body):null;
  }
  function headers(){
    return session?.access_token
      ? {apikey:cfg.key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'}
      : {apikey:cfg.key,'Content-Type':'application/json'};
  }
  async function requestAccess(email){
    return authRequest('otp',{method:'POST',body:JSON.stringify({email,create_user:true,options:{emailRedirectTo:location.href.split('#')[0]}})});
  }
  function signOut(){localStorage.removeItem(storageKey);session=null;location.reload()}
  function renderGate(){
    const existing=document.getElementById('panoramaAuthGate');if(existing)existing.remove();
    if(session?.access_token)return;
    const gate=document.createElement('div');
    gate.id='panoramaAuthGate';
    gate.style.cssText='position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px;background:#17352bf0;color:#fff;font-family:system-ui,-apple-system,Segoe UI,sans-serif';
    gate.innerHTML='<form style="width:min(390px,100%);background:#fff;color:#24322d;border-radius:18px;padding:24px;box-shadow:0 18px 60px #0007"><h1 style="margin:0 0 8px;font-size:22px">Acceso a Panorama Café</h1><p style="margin:0 0 16px;color:#52635b;line-height:1.45">Escribe tu correo para recibir un enlace seguro de acceso.</p><label style="display:block;font-weight:700;font-size:13px;margin-bottom:6px">Correo electrónico</label><input name="email" type="email" required autocomplete="email" style="box-sizing:border-box;width:100%;padding:11px;border:1px solid #c9d2cc;border-radius:10px;font:inherit"><button style="margin-top:14px;width:100%;padding:11px;border:0;border-radius:10px;background:#17352b;color:#fff;font-weight:800;font:inherit;cursor:pointer">Enviar enlace de acceso</button><div data-message style="min-height:20px;margin-top:12px;font-size:13px;color:#52635b"></div></form>';
    document.body.appendChild(gate);
    gate.querySelector('form').addEventListener('submit',async event=>{
      event.preventDefault();
      const form=event.currentTarget,email=String(new FormData(form).get('email')||'').trim().toLowerCase(),message=gate.querySelector('[data-message]'),button=form.querySelector('button');
      button.disabled=true;message.textContent='Enviando enlace…';
      try{await requestAccess(email);message.textContent='Revisa tu correo y abre el enlace en este dispositivo.'}catch(error){console.error('No se pudo solicitar el acceso',error);message.textContent='No se pudo enviar el enlace. Verifica el correo o vuelve a intentarlo.';button.disabled=false}
    });
  }
  const ready=(async()=>{
    session=readSession();
    const params=new URLSearchParams(location.hash.slice(1));
    const accessToken=params.get('access_token'),refreshToken=params.get('refresh_token');
    if(accessToken){persist({access_token:accessToken,refresh_token:refreshToken||null});cleanUrl();}
    window.addEventListener('DOMContentLoaded',renderGate,{once:true});
    if(document.readyState!=='loading')renderGate();
    return session;
  })();
  window.PanoramaAuth={ready,headers,get session(){return session},signOut,requestAccess};
})();