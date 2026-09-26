create table if not exists private.finance_loyverse_treasury_expenses (
  id text primary key,
  external_id text not null unique,
  occurred_on date not null,
  amount numeric not null check (amount > 0),
  concept text not null,
  category text,
  account_id text not null references private.finance_accounts(id),
  ledger_entry_id text references private.finance_ledger_entries(id),
  note text not null default '',
  status text not null default 'posted' check (status in ('posted','reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_loyverse_treasury_date_idx
  on private.finance_loyverse_treasury_expenses (occurred_on, status);

alter table private.finance_loyverse_treasury_expenses enable row level security;
revoke all on private.finance_loyverse_treasury_expenses from anon, authenticated;

drop policy if exists "finance_loyverse_treasury_authenticated_access" on private.finance_loyverse_treasury_expenses;
create policy "finance_loyverse_treasury_authenticated_access"
  on private.finance_loyverse_treasury_expenses
  for all to authenticated
  using ((select private.has_panorama_finanzas_access()))
  with check ((select private.has_panorama_finanzas_access()));

create or replace function private.post_loyverse_treasury_expense(
  p_expense_id text, p_external_id text, p_occurred_on date, p_amount numeric,
  p_account_id text, p_concept text, p_category text default 'tesoreria_loyverse',
  p_note text default ''
) returns private.finance_loyverse_treasury_expenses
language plpgsql security definer set search_path=''
as $function$
declare v_row private.finance_loyverse_treasury_expenses; v_entry private.finance_ledger_entries;
begin
  if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  if p_expense_id is null or length(trim(p_expense_id))=0 then raise exception 'expense_id requerido'; end if;
  if p_external_id is null or length(trim(p_external_id))=0 then raise exception 'external_id requerido'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'amount debe ser mayor que cero'; end if;
  if p_account_id is null then raise exception 'account_id requerido'; end if;
  if exists(select 1 from private.finance_loyverse_treasury_expenses where external_id=p_external_id) then
    select * into v_row from private.finance_loyverse_treasury_expenses where external_id=p_external_id; return v_row;
  end if;
  v_entry:=private.post_finance_entry(
    p_expense_id,p_occurred_on,'salida',p_amount,p_account_id,p_concept,
    coalesce(p_category,'tesoreria_loyverse'),'loyverse_treasury',p_external_id,
    jsonb_build_object('externalId',p_external_id,'source','Loyverse'));
  insert into private.finance_loyverse_treasury_expenses
    (id,external_id,occurred_on,amount,concept,category,account_id,ledger_entry_id,note,status)
  values
    (p_expense_id,p_external_id,p_occurred_on,p_amount,p_concept,coalesce(p_category,'tesoreria_loyverse'),
     p_account_id,v_entry.id,coalesce(p_note,''),'posted')
  returning * into v_row;
  insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,after_data)
    values(auth.uid(),'create','loyverse_treasury_expense',p_expense_id,to_jsonb(v_row));
  return v_row;
end;
$function$;

create or replace function private.reverse_loyverse_treasury_expense(
  p_expense_id text, p_reversal_id text,
  p_reason text default 'Reversión de salida de tesorería Loyverse'
) returns private.finance_loyverse_treasury_expenses
language plpgsql security definer set search_path=''
as $function$
declare v_row private.finance_loyverse_treasury_expenses; v_reversal private.finance_ledger_entries; v_before jsonb;
begin
  if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  select * into v_row from private.finance_loyverse_treasury_expenses where id=p_expense_id for update;
  if not found then raise exception 'Salida de tesorería Loyverse no encontrada'; end if;
  if v_row.status='reversed' then raise exception 'La salida de tesorería Loyverse ya fue revertida'; end if;
  if v_row.ledger_entry_id is null then raise exception 'La salida no tiene movimiento de ledger'; end if;
  if p_reversal_id is null or length(trim(p_reversal_id))=0 then raise exception 'reversal_id requerido'; end if;
  v_before:=to_jsonb(v_row);
  v_reversal:=private.reverse_finance_entry(v_row.ledger_entry_id,p_reversal_id,current_date,coalesce(p_reason,'Reversión'));
  update private.finance_loyverse_treasury_expenses set status='reversed',updated_at=now()
    where id=v_row.id returning * into v_row;
  insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
    values(auth.uid(),'reverse','loyverse_treasury_expense',v_row.id,v_before,to_jsonb(v_row));
  return v_row;
end;
$function$;

create or replace function public.post_loyverse_treasury_expense(
  p_expense_id text,p_external_id text,p_occurred_on date,p_amount numeric,p_account_id text,
  p_concept text,p_category text default 'tesoreria_loyverse',p_note text default ''
) returns private.finance_loyverse_treasury_expenses
language sql security invoker set search_path=''
as $function$ select * from private.post_loyverse_treasury_expense($1,$2,$3,$4,$5,$6,$7,$8); $function$;

create or replace function public.reverse_loyverse_treasury_expense(
  p_expense_id text,p_reversal_id text,p_reason text default 'Reversión de salida de tesorería Loyverse'
) returns private.finance_loyverse_treasury_expenses
language sql security invoker set search_path=''
as $function$ select * from private.reverse_loyverse_treasury_expense($1,$2,$3); $function$;

revoke all on function private.post_loyverse_treasury_expense(text,text,date,numeric,text,text,text,text) from public,anon,authenticated;
revoke all on function private.reverse_loyverse_treasury_expense(text,text,text) from public,anon,authenticated;
revoke all on function public.post_loyverse_treasury_expense(text,text,date,numeric,text,text,text,text) from public,anon;
revoke all on function public.reverse_loyverse_treasury_expense(text,text,text) from public,anon;
grant execute on function public.post_loyverse_treasury_expense(text,text,date,numeric,text,text,text,text) to authenticated;
grant execute on function public.reverse_loyverse_treasury_expense(text,text,text) to authenticated;
