/* Panorama Core direct access mode — no email login required */
(function(){
  const cfg=window.PANORAMA_SUPABASE;
  const headers=()=>({
    apikey:cfg?.key||'',
    Authorization:cfg?.key?'Bearer '+cfg.key:'',
    'Content-Type':'application/json'
  });
  const ready=Promise.resolve(null);
  function signOut(){ /* Direct-access mode: no session to close. */ }
  async function requestAccess(){ return {direct_access:true}; }
  function removeLegacyGate(){ document.getElementById('panoramaAuthGate')?.remove(); }
  window.addEventListener('DOMContentLoaded',removeLegacyGate,{once:true});
  if(document.readyState!=='loading') removeLegacyGate();
  window.PanoramaAuth={ready,headers,get session(){return null},signOut,requestAccess,directAccess:true};
})();
