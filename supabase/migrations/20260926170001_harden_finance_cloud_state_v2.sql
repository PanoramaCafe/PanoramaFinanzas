alter table public.panorama_finanzas_state
  add column if not exists revision bigint not null default 1;

update public.panorama_finanzas_state
set revision = 1
where revision is null or revision < 1;

alter table private.finance_state_backups
  add column if not exists source_revision bigint;

alter table private.finance_state_backups
  add column if not exists source_updated_at timestamptz;

alter table private.finance_state_backups
  add column if not exists captured_at timestamptz not null default now();

alter table private.finance_state_backups
  add column if not exists reason text;

update private.finance_state_backups
set source_revision = coalesce(source_revision, 1),
    reason = coalesce(reason, 'legacy_baseline')
where source_revision is null or reason is null;

alter table private.finance_state_backups
  alter column source_revision set not null,
  alter column reason set not null;

alter table private.finance_state_backups enable row level security;
revoke all on private.finance_state_backups from anon, authenticated;

create index if not exists finance_state_backups_state_time_idx
  on private.finance_state_backups(state_id, captured_at desc);

create or replace function private.backup_finance_state_before_update()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  insert into private.finance_state_backups(
    state_id,data,source_revision,source_updated_at,reason
  )
  values(
    old.id, old.data, old.revision, old.updated_at, 'before_state_update'
  );
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_backup_finance_state on public.panorama_finanzas_state;
create trigger trg_backup_finance_state
before update on public.panorama_finanzas_state
for each row
execute function private.backup_finance_state_before_update();

create or replace function private.cleanup_finance_state_backups()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  delete from private.finance_state_backups b
  where b.state_id = new.state_id
    and b.id in (
      select id
      from private.finance_state_backups
      where state_id = new.state_id
      order by captured_at desc, id desc
      offset 500
    );
  return new;
end;
$$;

drop trigger if exists trg_cleanup_finance_state_backups on private.finance_state_backups;
create trigger trg_cleanup_finance_state_backups
after insert on private.finance_state_backups
for each row
execute function private.cleanup_finance_state_backups();

create or replace function public.update_panorama_finanzas_state(
  p_id text,
  p_expected_revision bigint,
  p_data jsonb
)
returns table(data jsonb, updated_at timestamptz, revision bigint)
language plpgsql
security invoker
set search_path = public, private
as $$
begin
  return query
  update public.panorama_finanzas_state s
     set data = p_data
   where s.id = p_id
     and s.revision = p_expected_revision
  returning s.data, s.updated_at, s.revision;
end;
$$;

revoke all on function public.update_panorama_finanzas_state(text,bigint,jsonb) from public;
grant execute on function public.update_panorama_finanzas_state(text,bigint,jsonb) to authenticated;

insert into private.finance_state_backups(
  state_id,data,source_revision,source_updated_at,reason
)
select s.id,s.data,s.revision,s.updated_at,'baseline_before_sync_hardening'
from public.panorama_finanzas_state s
where s.id='finanzas-main'
  and not exists (
    select 1 from private.finance_state_backups b
    where b.state_id='finanzas-main'
  );