-- Panorama Finanzas: secure public RPC wrappers for browser ledger writes
-- The public RPCs must be SECURITY DEFINER so authenticated users do not
-- need EXECUTE on the private implementation functions.
create or replace function public.post_finance_entry(
  p_entry_id text,p_occurred_on date,p_entry_type text,p_amount numeric,p_account_id text,p_concept text,
  p_category text default null,p_source text default 'manual',p_external_id text default null,p_metadata jsonb default '{}'::jsonb
) returns private.finance_ledger_entries
language sql security definer set search_path = public, private, pg_temp as $$
  select * from private.post_finance_entry($1,$2,$3,$4,$5,$6,$7,$8,$9,$10);
$$;

create or replace function public.post_finance_transfer(
  p_entry_id text,p_occurred_on date,p_amount numeric,p_from_account_id text,p_to_account_id text,p_concept text,
  p_source text default 'manual',p_external_id text default null,p_metadata jsonb default '{}'::jsonb
) returns private.finance_ledger_entries
language sql security definer set search_path = public, private, pg_temp as $$
  select * from private.post_finance_transfer($1,$2,$3,$4,$5,$6,$7,$8,$9);
$$;

revoke execute on function public.post_finance_entry(text,date,text,numeric,text,text,text,text,text,jsonb) from public, anon;
revoke execute on function public.post_finance_transfer(text,date,numeric,text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.post_finance_entry(text,date,text,numeric,text,text,text,text,text,jsonb) to authenticated;
grant execute on function public.post_finance_transfer(text,date,numeric,text,text,text,text,text,jsonb) to authenticated;