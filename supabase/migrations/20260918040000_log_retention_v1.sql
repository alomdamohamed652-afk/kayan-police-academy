create or replace function public.purge_old_academy_logs(p_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  cutoff timestamptz;
  audit_count integer := 0;
  login_count integer := 0;
begin
  if p_days < 1 or p_days > 3650 then
    raise exception 'INVALID_RETENTION_DAYS';
  end if;
  cutoff := now() - make_interval(days => p_days);

  delete from public.audit_logs where created_at < cutoff;
  get diagnostics audit_count = row_count;

  delete from public.login_logs where created_at < cutoff;
  get diagnostics login_count = row_count;

  return jsonb_build_object(
    'audit_deleted', audit_count,
    'login_deleted', login_count,
    'cutoff', cutoff
  );
end;
$$;

create or replace function public.purge_academy_logs_keep_recent_days(p_days integer default 3)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  cutoff timestamptz;
  audit_count integer := 0;
  login_count integer := 0;
begin
  if p_days < 1 or p_days > 3650 then
    raise exception 'INVALID_RETENTION_DAYS';
  end if;
  cutoff := now() - make_interval(days => p_days);

  delete from public.audit_logs where created_at < cutoff;
  get diagnostics audit_count = row_count;

  delete from public.login_logs where created_at < cutoff;
  get diagnostics login_count = row_count;

  return jsonb_build_object(
    'audit_deleted', audit_count,
    'login_deleted', login_count,
    'kept_since', cutoff
  );
end;
$$;

revoke all on function public.purge_old_academy_logs(integer) from public, anon, authenticated;
revoke all on function public.purge_academy_logs_keep_recent_days(integer) from public, anon, authenticated;
grant execute on function public.purge_old_academy_logs(integer) to service_role;
grant execute on function public.purge_academy_logs_keep_recent_days(integer) to service_role;
