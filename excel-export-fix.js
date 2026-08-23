/* Exportador XLSX real para Panorama Finanzas */
(function(){
  const KEY='panorama_finanzas_pf_v1_010';
  function loadXLSX(){
    if(window.XLSX)return Promise.resolve(window.XLSX);
    return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('No se cargó XLSX'));s.onerror=()=>reject(new Error('No se pudo cargar la biblioteca de Excel'));document.head.appendChild(s);});
  }
  function flat(v){if(v==null)return '';if(Array.isArray(v))return v.map(flat).join(', ');if(typeof v==='object')return Object.entries(v).map(([k,x])=>k+': '+flat(x)).join(' | ');return v;}
  function rows(items){items=Array.isArray(items)?items:[];return items.map(x=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).map(([k,v])=>[k,flat(v)])):{Valor:flat(x)});}
  function sheet(XLSX,name,items){const data=rows(items);const ws=XLSX.utils.json_to_sheet(data.length?data:[{Estado:'Sin registros'}]);ws['!cols']=Object.keys(data[0]||{Estado:1}).map(k=>({wch:Math.min(Math.max(String(k).length+2,14),28)}));return ws;}
  async function exportXlsx(){let state={};try{state=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){alert('No se pudieron leer los datos financieros.');return;}
    try{const XLSX=await loadXLSX(),wb=XLSX.utils.book_new(),now=new Date(),stamp=now.toISOString().slice(0,10);const summary=[{Generado:now.toLocaleString('es-MX'),Cuentas:(state.accounts||[]).length,Movimientos:(state.moves||[]).length,Proveedores:(state.providers||[]).length,Empleados:(state.payrollEmployees||[]).length,PeriodosNomina:(state.payrollPeriods||[]).length}];const tabs=[['Resumen',summary],['Cuentas',state.accounts],['Movimientos',state.moves],['Proveedores',state.providers],['Pagos proveedores',state.providerPayments],['Compromisos',state.commitments],['Pagos compromisos',state.commitmentPayments],['Empleados nomina',state.payrollEmployees],['Periodos nomina',state.payrollPeriods],['Pagos fijos',state.fixedPayments],['Cortes',state.cuts],['Conciliaciones',state.reconciliations],['Cierres POS',state.posCloses],['Ajustes',state.adjustments],['Loyverse resumen',state.loyverseSummaries],['Loyverse tesoreria',state.loyverseTreasuryExpenses]];tabs.forEach(([name,data])=>XLSX.utils.book_append_sheet(wb,sheet(XLSX,name,data),name.slice(0,31)));XLSX.writeFile(wb,'Panorama_Finanzas_'+stamp+'.xlsx',{bookType:'xlsx',compression:true});}catch(e){console.error(e);alert('No se pudo generar el archivo Excel: '+e.message);}
  }
  function intercept(){document.addEventListener('click',e=>{const b=e.target.closest('#btnExportData,#btnExportExcel');if(!b)return;e.preventDefault();e.stopImmediatePropagation();exportXlsx();},{capture:true});}
  window.PanoramaFinanceExportXLSX=exportXlsx;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',intercept);else intercept();
})();
