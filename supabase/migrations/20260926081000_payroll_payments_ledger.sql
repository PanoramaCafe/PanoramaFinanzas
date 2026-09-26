create or replace function private.confirm_payroll_payment(
  p_payment_request_id uuid,
  p_financial_movement_id text,
  p_financial_account_id text,
  p_amount numeric,
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.payroll_payment_requests;
begin
  if not private.has_panorama_finanzas_access() then
    raise exception 'Usuario no autorizado para Finanzas';
  end if;
  select * into v_request from public.payroll_payment_requests where id=p_payment_request_id for update;
  if not found then raise exception 'Solicitud de pago no encontrada'; end if;
  if v_request.status <> 'PENDING_PAYMENT' then raise exception 'La solicitud ya no está pendiente de pago'; end if;
  if pg_catalog.round(pg_catalog.coalesce(p_amount,0),2) <> pg_catalog.round(v_request.amount,2) then raise exception 'El importe no coincide con la solicitud'; end if;
  perform private.post_finance_entry(
    p_financial_movement_id,
    pg_catalog.current_date,
    'salida',
    p_amount,
    p_financial_account_id,
    'Nómina',
    'nomina',
    'payroll',
    v_request.id::text,
    pg_catalog.jsonb_build_object('payrollPaymentRequestId',v_request.id,'financialAccountId',p_financial_account_id)
  );
  update public.payroll_payment_requests
  set status='PAID',
      notes=pg_catalog.concat_ws(E'\n',pg_catalog.nullif(v_request.notes,''),pg_catalog.nullif(p_notes,''),'Movimiento financiero: '||p_financial_movement_id,'Cuenta financiera: '||p_financial_account_id),
      updated_by_app='finanzas',updated_at=pg_catalog.now()
  where id=p_payment_request_id;
  return p_payment_request_id;
end;
$function$;