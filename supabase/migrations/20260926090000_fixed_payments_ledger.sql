create table if not exists private.finance_fixed_payments(
 id text primary key, concept text not null, amount numeric(14,2) not null check(amount>0), occurred_on date not null,
 status text not null default 'pendiente' check(status in('pendiente','pagado','reversed')),
 account_id text references private.finance_accounts(id), ledger_entry_id text references private.finance_ledger_entries(id),
 note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists finance_fixed_payments_status_idx on private.finance_fixed_payments(status,occurred_on);
alter table private.finance_fixed_payments enable row level security;
revoke all on private.finance_fixed_payments from anon,authenticated;
drop policy if exists finance_fixed_payments_access on private.finance_fixed_payments;
create policy finance_fixed_payments_access on private.finance_fixed_payments for all to authenticated using((select private.has_panorama_finanzas_access())) with check((select private.has_panorama_finanzas_access()));