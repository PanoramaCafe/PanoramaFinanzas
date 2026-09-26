-- Prevent identical finance-state writes from creating a new revision/backup.
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
declare
  current_data jsonb;
  current_updated_at timestamptz;
  current_revision bigint;
begin
  select s.data, s.updated_at, s.revision
    into current_data, current_updated_at, current_revision
  from public.panorama_finanzas_state s
  where s.id = p_id
    and s.revision = p_expected_revision
  for update;

  if not found then
    return;
  end if;

  if current_data is not distinct from p_data then
    data := current_data;
    updated_at := current_updated_at;
    revision := current_revision;
    return next;
    return;
  end if;

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
