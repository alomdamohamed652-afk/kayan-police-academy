-- MANUAL ROLLBACK ONLY. Do not run automatically.
drop function if exists public.dispatch_restore_snapshot(uuid,text);
drop function if exists public.dispatch_swap_members(text,text,text);
drop function if exists public.dispatch_cleanup_audit();
drop table if exists public.dispatch_snapshots;
drop table if exists public.dispatch_audit_logs;
drop table if exists public.dispatch_dispatchers;
drop table if exists public.dispatch_unit_assignments;
drop table if exists public.dispatch_unit_members;
drop table if exists public.dispatch_units;
drop table if exists public.dispatch_vehicles;
drop table if exists public.dispatch_unit_types;
drop table if exists public.dispatch_locations;
drop table if exists public.dispatch_regions;
drop table if exists public.dispatch_settings;
drop table if exists public.dispatch_access;