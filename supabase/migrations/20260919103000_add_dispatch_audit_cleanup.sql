create or replace function public.dispatch_cleanup_audit() returns integer language plpgsql security definer set search_path=public as $$
declare n integer;
begin delete from public.dispatch_audit_logs where expires_at<=now(); get diagnostics n=row_count; return n; end; $$;
revoke execute on function public.dispatch_cleanup_audit() from anon,authenticated;