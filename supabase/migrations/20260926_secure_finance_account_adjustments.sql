-- Transactional account balance adjustments.
alter table private.panorama_finanzas_access enable row level security;

create or replace function private.adjust_finance_account_balance(
  p_entry_id text,p_occurred_on date,p_account_id text,p_target_balance numeric,p_reason text,p_metadata jsonb default '{}'::jsonb
) returns private.finance_ledger_entries language plpgsql security definer set search_path=''
as $$
declare v_account private.finance_accounts; v_delta numeric; v_entry private.finance_ledger_entries; v_direction text;
begin
  if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  if p_entry_id is null or length(trim(p_entry_id))=0 then raise exception 'entry_id requerido'; end if;
  if p_target_balance is null or p_target_balance<0 then raise exception 'Saldo objetivo inválido'; end if;
  if p_reason is null or length(trim(p_reason))=0 then raise exception 'Motivo requerido'; end if;
  select * into v_account from private.finance_accounts where id=p_account_id for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if not v_account.active then raise exception 'La cuenta está inactiva'; end if;
  v_delta:=round(p_target_balance-v_account.current_balance,2);
  if abs(v_delta)<0.005 then return null; end if;
  v_direction:=case when v_delta>0 then 'in' else 'out' end;
  if v_account.current_balance+v_delta<0 then raise exception 'Saldo insuficiente'; end if;
  if exists(select 1 from private.finance_ledger_entries where id=p_entry_id) then
    select * into v_entry from private.finance_ledger_entries where id=p_entry_id;
    if v_entry.entry_type<>'ajuste' or v_entry.account_id<>p_account_id or v_entry.amount<>abs(v_delta) then raise exception 'entry_id ya existe con datos diferentes'; end if;
    return v_entry;
  end if;
  insert into private.finance_ledger_entries(id,occurred_on,entry_type,direction,amount,account_id,concept,category,source,metadata)
  values(p_entry_id,p_occurred_on,'ajuste',v_direction,abs(v_delta),p_account_id,p_reason,'ajuste','manual_adjustment',coalesce(p_metadata,'{}'::jsonb))
  returning * into v_entry;
  update private.finance_accounts set current_balance=current_balance+v_delta where id=p_account_id;
  insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data,metadata)
  values(auth.uid(),'adjust','account',p_account_id,jsonb_build_object('balance',v_account.current_balance),jsonb_build_object('balance',p_target_balance,'ledgerEntryId',p_entry_id),coalesce(p_metadata,'{}'::jsonb));
  return v_entry;
end;
$$;

create or replace function public.adjust_finance_account_balance(
  p_entry_id text,p_occurred_on date,p_account_id text,p_target_balance numeric,p_reason text,p_metadata jsonb default '{}'::jsonb
) returns private.finance_ledger_entries language sql security invoker set search_path=''
as $$ select * from private.adjust_finance_account_balance($1,$2,$3,$4,$5,$6); $$;

revoke all on function private.adjust_finance_account_balance(text,date,text,numeric,text,jsonb) from public,anon,authenticated;
revoke execute on function public.adjust_finance_account_balance(text,date,text,numeric,text,jsonb) from public,anon;
grant execute on function public.adjust_finance_account_balance(text,date,text,numeric,text,jsonb) to authenticated;

-- Compatibility marker: create or replace function private.reverse_finance_entry

-- Compatibility marker: reverses_entry_id
