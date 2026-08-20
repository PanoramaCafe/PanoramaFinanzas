/* Panorama Finanzas — política central de saldo negativo
   Este módulo no bloquea movimientos válidos por saldo disponible.
   Integrar allowNegativeBalance() en las rutas de salida, transferencia y pago.
*/
window.PanoramaNegativeBalancePolicy={
  validate({amount}){
    const value=Number(amount);
    if(!Number.isFinite(value)||value<=0) return {ok:false,error:'El importe debe ser mayor que cero'};
    return {ok:true};
  },
  resultingBalance(currentBalance,delta){
    return Number((Number(currentBalance||0)+Number(delta||0)).toFixed(2));
  },
  observation(accountName,balance){
    return Number(balance)<0?{type:'NEGATIVE_BALANCE',message:`Observación financiera: ${accountName||'La cuenta'} presenta un saldo negativo de ${Math.abs(Number(balance)).toFixed(2)}.`}:null;
  }
};
