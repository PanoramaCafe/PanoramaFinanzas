-- Panorama Finanzas: PostgreSQL ledger foundation
-- Applied to Supabase project dtmhffgpwxzdncbuoohb during structural hardening.
-- This migration intentionally does not modify the legacy JSONB state.

create schema if not exists private;

create table if not exists private.finance_accounts (
  id text primary key,
  name text not null,
  account_type text not null,
  kind text,
  active boolean not null default true,
  opening_balance numeric(14,2) not null default 0 check (opening_balance >= 0),
  current_balance numeric(14,2) not null default 0 check (current_balance >= 0),
  source_state_id text not null default 'finanzas-main',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.finance_ledger_entries (
  id text primary key,
  occurred_on date not null,
  entry_type text not null check (entry_type in ('entrada','salida','transferencia','ajuste','legado')),
  direction text not null check (direction in ('in','out','none')),
  amount numeric(14,2) not null check (amount > 0),
  account_id text references private.finance_accounts(id) on delete restrict,
  destination_account_id text references private.finance_accounts(id) on delete restrict,
  transfer_group_id text,
  concept text not null,
  category text,
  source text not null default 'manual',
  external_id text,
  reverses_entry_id text references private.finance_ledger_entries(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint finance_ledger_transfer_accounts_chk check (
    entry_type <> 'transferencia'
    or (account_id is not null and destination_account_id is not null and account_id <> destination_account_id)
  ),
  constraint finance_ledger_direction_chk check (
    (entry_type='entrada' and direction='in') or
    (entry_type='salida' and direction='out') or
    (entry_type='transferencia' and direction='none') or
    (entry_type='ajuste' and direction in ('in','out')) or
    (entry_type='legado' and direction in ('in','out','none'))
  )
);

create unique index if not exists finance_ledger_external_unique
  on private.finance_ledger_entries(source, external_id)
  where external_id is not null;

create index if not exists finance_ledger_account_date_idx
  on private.finance_ledger_entries(account_id, occurred_on desc);

create index if not exists finance_ledger_destination_date_idx
  on private.finance_ledger_entries(destination_account_id, occurred_on desc);

create table if not exists private.finance_integration_events (
  source text not null,
  external_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default now(),
  primary key (source, external_id)
);

create table if not exists private.finance_balance_snapshots (
  snapshot_id uuid primary key default gen_random_uuid(),
  source_state_id text not null,
  captured_at timestamptz not null default now(),
  account_id text not null,
  balance numeric(14,2) not null check (balance >= 0),
  source_record jsonb not null default '{}'::jsonb
);

create table if not exists private.finance_audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_data jsonb,
  after_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function private.finance_touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists finance_accounts_touch_updated_at on private.finance_accounts;
create trigger finance_accounts_touch_updated_at
before update on private.finance_accounts for each row
execute function private.finance_touch_updated_at();

alter table private.finance_accounts enable row level security;
alter table private.finance_ledger_entries enable row level security;
alter table private.finance_integration_events enable row level security;
alter table private.finance_balance_snapshots enable row level security;
alter table private.finance_audit_log enable row level security;

revoke all on private.finance_accounts from anon, authenticated;
revoke all on private.finance_ledger_entries from anon, authenticated;
revoke all on private.finance_integration_events from anon, authenticated;
revoke all on private.finance_balance_snapshots from anon, authenticated;
revoke all on private.finance_audit_log from anon, authenticated;

-- Seed the current JSONB state without changing it.
insert into private.finance_accounts
(id,name,account_type,kind,active,opening_balance,current_balance,source_state_id)
select a->>'id', coalesce(a->>'name',a->>'id'), coalesce(a->>'type','Cuenta'),
       a->>'kind', coalesce((a->>'active')::boolean,true),
       coalesce((a->>'balance')::numeric,0), coalesce((a->>'balance')::numeric,0), 'finanzas-main'
from public.panorama_finanzas_state s
cross join lateral jsonb_array_elements(coalesce(s.data->'accounts','[]'::jsonb)) a
where s.id='finanzas-main'
on conflict (id) do update set
name=excluded.name, account_type=excluded.account_type, kind=excluded.kind,
active=excluded.active, current_balance=excluded.current_balance, updated_at=now();

insert into private.finance_balance_snapshots(source_state_id,account_id,balance,source_record)
select 'finanzas-main',a->>'id',coalesce((a->>'balance')::numeric,0),a
from public.panorama_finanzas_state s
cross join lateral jsonb_array_elements(coalesce(s.data->'accounts','[]'::jsonb)) a
where s.id='finanzas-main'
and not exists (
  select 1 from private.finance_balance_snapshots b
  where b.source_state_id='finanzas-main' and b.account_id=a->>'id'
);

insert into private.finance_ledger_entries
(id,occurred_on,entry_type,direction,amount,concept,category,source,external_id,metadata)
select m->>'id',coalesce((m->>'date')::date,current_date),
       case when m->>'type' in ('entrada','salida','transferencia') then m->>'type' else 'legado' end,
       case when m->>'type'='entrada' then 'in'
            when m->>'type'='salida' then 'out'
            when m->>'type'='transferencia' then 'none' else 'none' end,
       abs(coalesce((m->>'amount')::numeric,0)),
       coalesce(m->>'concept','Movimiento legado'), nullif(m->>'category',''),
       coalesce(m->>'source','legacy'), coalesce(m->>'personalPaymentId',m->>'externalId'), m
from public.panorama_finanzas_state s
cross join lateral jsonb_array_elements(coalesce(s.data->'moves','[]'::jsonb)) m
where s.id='finanzas-main' and coalesce((m->>'amount')::numeric,0)>0
on conflict (id) do nothing;

create or replace function private.post_finance_entry(
  p_entry_id text,p_occurred_on date,p_entry_type text,p_amount numeric,
  p_account_id text,p_concept text,p_category text default null,
  p_source text default 'manual',p_external_id text default null,
  p_metadata jsonb default '{}'::jsonb
) returns private.finance_ledger_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry private.finance_ledger_entries; v_account private.finance_accounts; v_delta numeric;
begin
  if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  if p_entry_id is null or length(trim(p_entry_id))=0 then raise exception 'entry_id requerido'; end if;
  if p_amount is null or p_amount<=0 then raise exception 'amount debe ser mayor que cero'; end if;
  if p_entry_type not in ('entrada','salida','ajuste') then raise exception 'Tipo de movimiento no permitido'; end if;
  if p_account_id is null then raise exception 'account_id requerido'; end if;
  select * into v_account from private.finance_accounts where id=p_account_id for update;
  if not found then raise exception 'Cuenta no encontrada'; end if;
  if not v_account.active then raise exception 'La cuenta está inactiva'; end if;
  if exists(select 1 from private.finance_ledger_entries where id=p_entry_id) then
    select * into v_entry from private.finance_ledger_entries where id=p_entry_id;
    if v_entry.amount<>p_amount or v_entry.account_id<>p_account_id or v_entry.entry_type<>p_entry_type
    then raise exception 'entry_id ya existe con datos diferentes'; end if;
    return v_entry;
  end if;
  if p_external_id is not null and exists(select 1 from private.finance_ledger_entries where source=p_source and external_id=p_external_id)
  then select * into v_entry from private.finance_ledger_entries where source=p_source and external_id=p_external_id; return v_entry; end if;
  v_delta := case when p_entry_type='entrada' then p_amount else -p_amount end;
  if v_account.current_balance+v_delta<0 then raise exception 'Saldo insuficiente'; end if;
  insert into private.finance_ledger_entries
  (id,occurred_on,entry_type,direction,amount,account_id,concept,category,source,external_id,metadata)
  values(p_entry_id,p_occurred_on,p_entry_type,case when p_entry_type='entrada' then 'in' else 'out' end,
         p_amount,p_account_id,p_concept,p_category,p_source,p_external_id,coalesce(p_metadata,'{}'::jsonb))
  returning * into v_entry;
  update private.finance_accounts set current_balance=current_balance+v_delta where id=p_account_id;
  insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'create','ledger_entry',p_entry_id,to_jsonb(v_entry));
  return v_entry;
end; $$;

create or replace function private.post_finance_transfer(
  p_entry_id text,p_occurred_on date,p_amount numeric,p_from_account_id text,
  p_to_account_id text,p_concept text,p_source text default 'manual',
  p_external_id text default null,p_metadata jsonb default '{}'::jsonb
) returns private.finance_ledger_entries
language plpgsql security definer set search_path = '' as $$
declare v_entry private.finance_ledger_entries; v_from private.finance_accounts; v_to private.finance_accounts;
begin
  if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  if p_entry_id is null or p_amount is null or p_amount<=0 then raise exception 'Datos de transferencia inválidos'; end if;
  if p_from_account_id is null or p_to_account_id is null or p_from_account_id=p_to_account_id then raise exception 'Las cuentas deben ser distintas'; end if;
  if exists(select 1 from private.finance_ledger_entries where id=p_entry_id) then select * into v_entry from private.finance_ledger_entries where id=p_entry_id; return v_entry; end if;
  if p_external_id is not null and exists(select 1 from private.finance_ledger_entries where source=p_source and external_id=p_external_id)
  then select * into v_entry from private.finance_ledger_entries where source=p_source and external_id=p_external_id; return v_entry; end if;
  if p_from_account_id<p_to_account_id then
    select * into v_from from private.finance_accounts where id=p_from_account_id for update;
    select * into v_to from private.finance_accounts where id=p_to_account_id for update;
  else
    select * into v_to from private.finance_accounts where id=p_to_account_id for update;
    select * into v_from from private.finance_accounts where id=p_from_account_id for update;
  end if;
  if v_from.id is null or v_to.id is null then raise exception 'Cuenta no encontrada'; end if;
  if not v_from.active or not v_to.active then raise exception 'Cuenta inactiva'; end if;
  if v_from.current_balance<p_amount then raise exception 'Saldo insuficiente'; end if;
  insert into private.finance_ledger_entries
  (id,occurred_on,entry_type,direction,amount,account_id,destination_account_id,transfer_group_id,concept,source,external_id,metadata)
  values(p_entry_id,p_occurred_on,'transferencia','none',p_amount,p_from_account_id,p_to_account_id,p_entry_id,p_concept,p_source,p_external_id,coalesce(p_metadata,'{}'::jsonb))
  returning * into v_entry;
  update private.finance_accounts set current_balance=current_balance-p_amount where id=p_from_account_id;
  update private.finance_accounts set current_balance=current_balance+p_amount where id=p_to_account_id;
  insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,after_data)
  values(auth.uid(),'create','transfer',p_entry_id,to_jsonb(v_entry));
  return v_entry;
end; $$;

revoke all on function private.post_finance_entry(text,date,text,numeric,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function private.post_finance_transfer(text,date,numeric,text,text,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.post_finance_entry(
  p_entry_id text,p_occurred_on date,p_entry_type text,p_amount numeric,p_account_id text,p_concept text,
  p_category text default null,p_source text default 'manual',p_external_id text default null,p_metadata jsonb default '{}'::jsonb
) returns private.finance_ledger_entries language sql security invoker set search_path = '' as $$
  select * from private.post_finance_entry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$$;

create or replace function public.post_finance_transfer(
  p_entry_id text,p_occurred_on date,p_amount numeric,p_from_account_id text,p_to_account_id text,p_concept text,
  p_source text default 'manual',p_external_id text default null,p_metadata jsonb default '{}'::jsonb
) returns private.finance_ledger_entries language sql security invoker set search_path = '' as $$
  select * from private.post_finance_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;

revoke execute on function public.post_finance_entry(text,date,text,numeric,text,text,text,text,text,jsonb) from public,anon;
revoke execute on function public.post_finance_transfer(text,date,numeric,text,text,text,text,text,jsonb) from public,anon;
grant execute on function public.post_finance_entry(text,date,text,numeric,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.post_finance_transfer(text,date,numeric,text,text,text,text,text,jsonb) to authenticated;

create index if not exists finance_audit_actor_idx on private.finance_audit_log(actor_user_id);
create index if not exists finance_ledger_reverses_idx on private.finance_ledger_entries(reverses_entry_id);

drop policy if exists finance_accounts_access on private.finance_accounts;
create policy finance_accounts_access on private.finance_accounts
for all to authenticated
using ((select private.has_panorama_finanzas_access()))
with check ((select private.has_panorama_finanzas_access()));

drop policy if exists finance_ledger_entries_access on private.finance_ledger_entries;
create policy finance_ledger_entries_access on private.finance_ledger_entries
for all to authenticated
using ((select private.has_panorama_finanzas_access()))
with check ((select private.has_panorama_finanzas_access()));

drop policy if exists finance_integration_events_access on private.finance_integration_events;
create policy finance_integration_events_access on private.finance_integration_events
for all to authenticated
using ((select private.has_panorama_finanzas_access()))
with check ((select private.has_panorama_finanzas_access()));

drop policy if exists finance_balance_snapshots_access on private.finance_balance_snapshots;
create policy finance_balance_snapshots_access on private.finance_balance_snapshots
for all to authenticated
using ((select private.has_panorama_finanzas_access()))
with check ((select private.has_panorama_finanzas_access()));

drop policy if exists finance_audit_log_access on private.finance_audit_log;
create policy finance_audit_log_access on private.finance_audit_log
for all to authenticated
using ((select private.has_panorama_finanzas_access()))
with check ((select private.has_panorama_finanzas_access()));


create or replace function private.reverse_finance_entry(p_entry_id text,p_reversal_id text,p_occurred_on date,p_reason text default 'Reversión')
returns private.finance_ledger_entries
language plpgsql security definer set search_path=''
as $$
declare v private.finance_ledger_entries; r private.finance_ledger_entries;
begin
  if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
  select * into v from private.finance_ledger_entries where id=p_entry_id for update;
  if not found then raise exception 'Movimiento no encontrado'; end if;
  if exists(select 1 from private.finance_ledger_entries where reverses_entry_id=p_entry_id) then
    raise exception 'El movimiento ya fue revertido';
  end if;
  if v.entry_type='transferencia' then
    perform 1 from private.finance_accounts where id=v.account_id for update;
    perform 1 from private.finance_accounts where id=v.destination_account_id for update;
    if (select current_balance from private.finance_accounts where id=v.destination_account_id) < v.amount
    then raise exception 'Saldo insuficiente para revertir la transferencia'; end if;
    update private.finance_accounts set current_balance=current_balance+v.amount where id=v.account_id;
    update private.finance_accounts set current_balance=current_balance-v.amount where id=v.destination_account_id;
    insert into private.finance_ledger_entries
      (id,occurred_on,entry_type,direction,amount,account_id,destination_account_id,transfer_group_id,concept,source,external_id,reverses_entry_id,metadata)
    values(p_reversal_id,p_occurred_on,'transferencia','none',v.amount,v.destination_account_id,v.account_id,v.transfer_group_id,
      p_reason,'reversal',null,p_entry_id,jsonb_build_object('reversalOf',p_entry_id))
    returning * into r;
  else
    perform 1 from private.finance_accounts where id=v.account_id for update;
    if v.direction='in' then
      if (select current_balance from private.finance_accounts where id=v.account_id) < v.amount
      then raise exception 'Saldo insuficiente para revertir la entrada'; end if;
      update private.finance_accounts set current_balance=current_balance-v.amount where id=v.account_id;
      insert into private.finance_ledger_entries
        (id,occurred_on,entry_type,direction,amount,account_id,concept,category,source,reverses_entry_id,metadata)
      values(p_reversal_id,p_occurred_on,'ajuste','out',v.amount,v.account_id,p_reason,v.category,'reversal',p_entry_id,jsonb_build_object('reversalOf',p_entry_id))
      returning * into r;
    else
      update private.finance_accounts set current_balance=current_balance+v.amount where id=v.account_id;
      insert into private.finance_ledger_entries
        (id,occurred_on,entry_type,direction,amount,account_id,concept,category,source,reverses_entry_id,metadata)
      values(p_reversal_id,p_occurred_on,'ajuste','in',v.amount,v.account_id,p_reason,v.category,'reversal',p_entry_id,jsonb_build_object('reversalOf',p_entry_id))
      returning * into r;
    end if;
  end if;
  insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data)
  values(auth.uid(),'reverse','ledger_entry',p_entry_id,to_jsonb(v),to_jsonb(r));
  return r;
end;
$$;

create or replace function public.reverse_finance_entry(p_entry_id text,p_reversal_id text,p_occurred_on date,p_reason text default 'Reversión')
returns private.finance_ledger_entries
language sql security invoker set search_path=''
as $$ select * from private.reverse_finance_entry($1,$2,$3,$4); $$;

revoke all on function private.reverse_finance_entry(text,text,date,text) from public,anon,authenticated;
revoke execute on function public.reverse_finance_entry(text,text,date,text) from public,anon;
grant execute on function public.reverse_finance_entry(text,text,date,text) to authenticated;
