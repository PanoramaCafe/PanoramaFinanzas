/* Panorama Finanzas — actualización automática de la interfaz */
(function(){
'use strict';
const KEY='panorama_finanzas_pf_v1_010';
function install(){
 let last=localStorage.getItem(KEY)||'';
 function apply(raw){
  try{
   const next=raw?JSON.parse(raw):null;
   if(!next)return;
   if(typeof window.__PANORAMA_FINANZAS_APPLY_STATE__==='function'){
    window.__PANORAMA_FINANZAS_APPLY_STATE__(next);
    return;
   }
   window.dispatchEvent(new CustomEvent('panorama-finanzas-apply-state',{detail:next}));
  }catch(e){console.warn('Finance UI state apply failed',e)}
 }
 window.addEventListener('panorama-finanzas-reload',()=>{const raw=localStorage.getItem(KEY)||'';if(raw!==last){last=raw;apply(raw)}});
 window.addEventListener('storage',e=>{if(e.key===KEY&&e.newValue!==last){last=e.newValue||'';apply(last)}});
 setInterval(()=>{const raw=localStorage.getItem(KEY)||'';if(raw!==last){last=raw;apply(raw)}},500);
}
install();
})();
