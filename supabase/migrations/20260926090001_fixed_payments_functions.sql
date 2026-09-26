create or replace function private.upsert_finance_fixed_payment(p_payment_id text,p_concept text,p_amount numeric,p_occurred_on date,p_status text,p_account_id text default null,p_note text default '')
returns private.finance_fixed_payments language plpgsql security definer set search_path='' as $$
declare v private.finance_fixed_payments;
begin
 if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 if trim(coalesce(p_concept,''))='' or p_amount<=0 then raise exception 'Pago fijo inválido'; end if;
 if p_status<>'pendiente' then raise exception 'El alta de un pago fijo debe comenzar como pendiente'; end if;
 insert into private.finance_fixed_payments(id,concept,amount,occurred_on,status,account_id,note)
 values(p_payment_id,trim(p_concept),p_amount,p_occurred_on,'pendiente',null,coalesce(p_note,''))
 on conflict(id) do update set concept=excluded.concept,amount=excluded.amount,occurred_on=excluded.occurred_on,note=excluded.note,updated_at=now()
 returning * into v; return v;
end $$;
create or replace function public.upsert_finance_fixed_payment(p_payment_id text,p_concept text,p_amount numeric,p_occurred_on date,p_status text,p_account_id text default null,p_note text default '')
returns private.finance_fixed_payments language sql security invoker set search_path='' as $$ select * from private.upsert_finance_fixed_payment($1,$2,$3,$4,$5,$6,$7); $$;

create or replace function private.pay_finance_fixed_payment(p_payment_id text)
returns private.finance_fixed_payments language plpgsql security definer set search_path='' as $$
declare v private.finance_fixed_payments; a private.finance_accounts; l private.finance_ledger_entries;
begin
 if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select * into v from private.finance_fixed_payments where id=p_payment_id for update;
 if not found then raise exception 'Pago fijo no encontrado'; end if;
 if v.status='pagado' then return v; end if;
 if v.status='reversed' then raise exception 'El pago fijo está revertido'; end if;
 select * into a from private.finance_accounts where id= v.account_id for update;
 if not found or not a.active or a.current_balance<v.amount then raise exception 'Saldo insuficiente o cuenta inválida'; end if;
 select * into l from private.post_finance_entry(v.id,v.occurred_on,'salida',v.amount,v.account_id,v.concept,'pagos_fijos','fixed_payment',null,jsonb_build_object('fixedPaymentId',v.id));
 update private.finance_fixed_payments set status='pagado',ledger_entry_id=l.id,updated_at=now() where id=v.id returning * into v; return v;
end $$;
create or replace function public.pay_finance_fixed_payment(p_payment_id text)
returns private.finance_fixed_payments language sql security invoker set search_path='' as $$ select * from private.pay_finance_fixed_payment($1); $$;

create or replace function private.reverse_finance_fixed_payment(p_payment_id text,p_reversal_id text,p_reason text default 'Reversión de pago fijo')
returns private.finance_fixed_payments language plpgsql security definer set search_path='' as $$
declare v private.finance_fixed_payments;
begin
 if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select * into v from private.finance_fixed_payments where id=p_payment_id for update;
 if not found then raise exception 'Pago fijo no encontrado'; end if;
 if v.status='reversed' then return v; end if;
 if v.status<>'pagado' or v.ledger_entry_id is null then raise exception 'El pago fijo no está pagado'; end if;
 perform private.reverse_finance_entry(v.ledger_entry_id,p_reversal_id,current_date,p_reason);
 update private.finance_fixed_payments set status='reversed',updated_at=now() where id=v.id returning * into v; return v;
end $$;
create or replace function public.reverse_finance_fixed_payment(p_payment_id text,p_reversal_id text,p_reason text default 'Reversión de pago fijo')
returns private.finance_fixed_payments language sql security invoker set search_path='' as $$ select * from private.reverse_finance_fixed_payment($1,$2,$3); $$;
revoke all on function private.upsert_finance_fixed_payment(text,text,numeric,date,text,text,text),private.pay_finance_fixed_payment(text),private.reverse_finance_fixed_payment(text,text,text) from public,anon,authenticated;
revoke execute on function public.upsert_finance_fixed_payment(text,text,numeric,date,text,text,text),public.pay_finance_fixed_payment(text),public.reverse_finance_fixed_payment(text,text,text) from public,anon;
grant execute on function public.upsert_finance_fixed_payment(text,text,numeric,date,text,text,text),public.pay_finance_fixed_payment(text),public.reverse_finance_fixed_payment(text,text,text) to authenticated;