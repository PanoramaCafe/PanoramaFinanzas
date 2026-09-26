create or replace function private.backup_finance_state_before_update()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
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

create or replace function private.cleanup_finance_state_backups()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
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