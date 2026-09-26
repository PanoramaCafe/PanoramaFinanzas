-- Transactional provider lifecycle: purchases, debt and payments.
create table if not exists private.finance_providers (
 id text primary key,name text not null,payment_type text not null default 'Contado' check (payment_type in ('Contado','Crédito','Mixto')),
 note text not null default '',credit_balance numeric(14,2) not null default 0 check (credit_balance>=0),active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists private.finance_provider_purchases (
 id text primary key,provider_id text not null references private.finance_providers(id),occurred_on date not null,
 amount numeric(14,2) not null check (amount>0),mode text not null check (mode in ('cash','credit')),account_id text references private.finance_accounts(id),
 ledger_entry_id text references private.finance_ledger_entries(id),note text not null default '',
 status text not null default 'posted' check (status in ('posted','reversed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check ((mode='cash' and account_id is not null) or (mode='credit' and account_id is null))
);
create table if not exists private.finance_provider_payments (
 id text primary key,provider_id text not null references private.finance_providers(id),occurred_on date not null,
 amount numeric(14,2) not null check (amount>0),account_id text not null references private.finance_accounts(id),
 ledger_entry_id text references private.finance_ledger_entries(id),note text not null default '',
 status text not null default 'posted' check (status in ('posted','reversed')),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists finance_provider_purchases_provider_idx on private.finance_provider_purchases(provider_id,occurred_on);
create index if not exists finance_provider_payments_provider_idx on private.finance_provider_payments(provider_id,occurred_on);
alter table private.finance_providers enable row level security;
alter table private.finance_provider_purchases enable row level security;
alter table private.finance_provider_payments enable row level security;
revoke all on private.finance_providers,private.finance_provider_purchases,private.finance_provider_payments from anon,authenticated;
create policy finance_providers_access on private.finance_providers for all to authenticated using ((select private.has_panorama_finanzas_access())) with check ((select private.has_panorama_finanzas_access()));
create policy finance_provider_purchases_access on private.finance_provider_purchases for all to authenticated using ((select private.has_panorama_finanzas_access())) with check ((select private.has_panorama_finanzas_access()));
create policy finance_provider_payments_access on private.finance_provider_payments for all to authenticated using ((select private.has_panorama_finanzas_access())) with check ((select private.has_panorama_finanzas_access()));

create or replace function private.upsert_finance_provider(p_provider_id text,p_name text,p_payment_type text,p_note text default '')
returns private.finance_providers language plpgsql security definer set search_path='' as $$
declare v private.finance_providers;
begin
 if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 insert into private.finance_providers(id,name,payment_type,note) values(p_provider_id,trim(p_name),coalesce(p_payment_type,'Contado'),coalesce(p_note,''))
 on conflict(id) do update set name=excluded.name,payment_type=excluded.payment_type,note=excluded.note,updated_at=now() returning * into v; return v;
end $$;
create or replace function public.upsert_finance_provider(p_provider_id text,p_name text,p_payment_type text,p_note text default '')
returns private.finance_providers language sql security invoker set search_path='' as $$ select * from private.upsert_finance_provider($1,$2,$3,$4); $$;

create or replace function private.post_provider_purchase(p_purchase_id text,p_occurred_on date,p_provider_id text,p_amount numeric,p_mode text,p_account_id text default null,p_note text default '')
returns private.finance_provider_purchases language plpgsql security definer set search_path='' as $$
declare v private.finance_provider_purchases; p private.finance_providers; a private.finance_accounts; l private.finance_ledger_entries;
begin
 if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 if p_amount<=0 or p_mode not in ('cash','credit') then raise exception 'Compra inválida'; end if;
 select * into p from private.finance_providers where id=p_provider_id for update;
 if not found or not p.active then raise exception 'Proveedor no encontrado o inactivo'; end if;
 if exists(select 1 from private.finance_provider_purchases where id=p_purchase_id) then select * into v from private.finance_provider_purchases where id=p_purchase_id; return v; end if;
 if p_mode='cash' then
   select * into a from private.finance_accounts where id=p_account_id for update;
   if not found or not a.active or a.current_balance<p_amount then raise exception 'Saldo insuficiente o cuenta inválida'; end if;
   select * into l from private.post_finance_entry(p_purchase_id,p_occurred_on,'salida',p_amount,p_account_id,'Compra — '||p.name,'proveedores','provider_purchase',null,jsonb_build_object('providerId',p_provider_id));
 end if;
 insert into private.finance_provider_purchases(id,provider_id,occurred_on,amount,mode,account_id,ledger_entry_id,note)
 values(p_purchase_id,p_provider_id,p_occurred_on,p_amount,p_mode,p_account_id,case when p_mode='cash' then p_purchase_id else null end,coalesce(p_note,'')) returning * into v;
 if p_mode='credit' then update private.finance_providers set credit_balance=credit_balance+p_amount,updated_at=now() where id=p_provider_id; end if;
 insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,after_data) values(auth.uid(),'create','provider_purchase',p_purchase_id,to_jsonb(v)); return v;
end $$;
create or replace function public.post_provider_purchase(p_purchase_id text,p_occurred_on date,p_provider_id text,p_amount numeric,p_mode text,p_account_id text default null,p_note text default '')
returns private.finance_provider_purchases language sql security invoker set search_path='' as $$ select * from private.post_provider_purchase($1,$2,$3,$4,$5,$6,$7); $$;

create or replace function private.post_provider_payment(p_payment_id text,p_occurred_on date,p_provider_id text,p_amount numeric,p_account_id text,p_note text default '')
returns private.finance_provider_payments language plpgsql security definer set search_path='' as $$
declare v private.finance_provider_payments; p private.finance_providers; a private.finance_accounts; l private.finance_ledger_entries;
begin
 if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 if p_amount<=0 then raise exception 'Pago inválido'; end if;
 select * into p from private.finance_providers where id=p_provider_id for update;
 if not found or not p.active then raise exception 'Proveedor no encontrado o inactivo'; end if;
 if p.credit_balance<p_amount then raise exception 'El pago supera la deuda del proveedor'; end if;
 select * into a from private.finance_accounts where id=p_account_id for update;
 if not found or not a.active or a.current_balance<p_amount then raise exception 'Saldo insuficiente o cuenta inválida'; end if;
 if exists(select 1 from private.finance_provider_payments where id=p_payment_id) then select * into v from private.finance_provider_payments where id=p_payment_id; return v; end if;
 select * into l from private.post_finance_entry(p_payment_id,p_occurred_on,'salida',p_amount,p_account_id,'Pago — '||p.name,'proveedores','provider_payment',null,jsonb_build_object('providerId',p_provider_id));
 update private.finance_providers set credit_balance=credit_balance-p_amount,updated_at=now() where id=p.id;
 insert into private.finance_provider_payments(id,provider_id,occurred_on,amount,account_id,ledger_entry_id,note)
 values(p_payment_id,p_provider_id,p_occurred_on,p_amount,p_account_id,p_payment_id,coalesce(p_note,'')) returning * into v;
 insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,after_data) values(auth.uid(),'create','provider_payment',p_payment_id,to_jsonb(v)); return v;
end $$;
create or replace function public.post_provider_payment(p_payment_id text,p_occurred_on date,p_provider_id text,p_amount numeric,p_account_id text,p_note text default '')
returns private.finance_provider_payments language sql security invoker set search_path='' as $$ select * from private.post_provider_payment($1,$2,$3,$4,$5,$6); $$;

create or replace function private.reverse_provider_purchase(p_purchase_id text,p_reversal_id text,p_reason text default 'Reversión de compra')
returns private.finance_provider_purchases language plpgsql security definer set search_path='' as $$
declare v private.finance_provider_purchases; p private.finance_providers;
begin
 if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select * into v from private.finance_provider_purchases where id=p_purchase_id for update;
 if not found then raise exception 'Compra no encontrada'; end if;
 if v.status='reversed' then return v; end if;
 select * into p from private.finance_providers where id=v.provider_id for update;
 if v.mode='cash' then perform private.reverse_finance_entry(v.ledger_entry_id,p_reversal_id,current_date,p_reason);
 else if p.credit_balance<v.amount then raise exception 'La deuda del proveedor es menor que la compra a revertir'; end if;
   update private.finance_providers set credit_balance=credit_balance-v.amount,updated_at=now() where id=p.id;
 end if;
 update private.finance_provider_purchases set status='reversed',updated_at=now() where id=v.id returning * into v;
 insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'reverse','provider_purchase',p_purchase_id,jsonb_build_object('status','posted'),to_jsonb(v)); return v;
end $$;
create or replace function public.reverse_provider_purchase(p_purchase_id text,p_reversal_id text,p_reason text default 'Reversión de compra')
returns private.finance_provider_purchases language sql security invoker set search_path='' as $$ select * from private.reverse_provider_purchase($1,$2,$3); $$;

create or replace function private.reverse_provider_payment(p_payment_id text,p_reversal_id text,p_reason text default 'Reversión de pago')
returns private.finance_provider_payments language plpgsql security definer set search_path='' as $$
declare v private.finance_provider_payments; p private.finance_providers;
begin
 if not private.has_panorama_finanzas_access() then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select * into v from private.finance_provider_payments where id=p_payment_id for update;
 if not found then raise exception 'Pago no encontrado'; end if;
 if v.status='reversed' then return v; end if;
 select * into p from private.finance_providers where id=v.provider_id for update;
 perform private.reverse_finance_entry(v.ledger_entry_id,p_reversal_id,current_date,p_reason);
 update private.finance_providers set credit_balance=credit_balance+v.amount,updated_at=now() where id=p.id;
 update private.finance_provider_payments set status='reversed',updated_at=now() where id=v.id returning * into v;
 insert into private.finance_audit_log(actor_user_id,action,entity_type,entity_id,before_data,after_data) values(auth.uid(),'reverse','provider_payment',p_payment_id,jsonb_build_object('status','posted'),to_jsonb(v)); return v;
end $$;
create or replace function public.reverse_provider_payment(p_payment_id text,p_reversal_id text,p_reason text default 'Reversión de pago')
returns private.finance_provider_payments language sql security invoker set search_path='' as $$ select * from private.reverse_provider_payment($1,$2,$3); $$;

revoke all on function private.upsert_finance_provider(text,text,text,text),private.post_provider_purchase(text,date,text,numeric,text,text,text),private.post_provider_payment(text,date,text,numeric,text,text),private.reverse_provider_purchase(text,text,text),private.reverse_provider_payment(text,text,text) from public,anon,authenticated;
revoke execute on function public.upsert_finance_provider(text,text,text,text),public.post_provider_purchase(text,date,text,numeric,text,text,text),public.post_provider_payment(text,date,text,numeric,text,text),public.reverse_provider_purchase(text,text,text),public.reverse_provider_payment(text,text,text) from public,anon;
grant execute on function public.upsert_finance_provider(text,text,text,text),public.post_provider_purchase(text,date,text,numeric,text,text,text),public.post_provider_payment(text,date,text,numeric,text,text),public.reverse_provider_purchase(text,text,text),public.reverse_provider_payment(text,text,text) to authenticated;
