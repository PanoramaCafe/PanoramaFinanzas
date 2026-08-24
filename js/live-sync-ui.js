/* Panorama Finanzas — bridge de estado remoto a interfaz viva */
(function(){
'use strict';
const KEY='panorama_finanzas_pf_v1_010';
let last='';
function snapshot(){try{return localStorage.getItem(KEY)||''}catch(e){return ''}}
function refresh(){const now=snapshot();if(!now||now===last)return;last=now;window.dispatchEvent(new CustomEvent('panorama-finanzas-ui-state',{detail:{raw:now}}));}
window.addEventListener('panorama-finanzas-reload',refresh);
window.addEventListener('panorama-finanzas-core-ready',refresh);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
setInterval(refresh,500);
})();
