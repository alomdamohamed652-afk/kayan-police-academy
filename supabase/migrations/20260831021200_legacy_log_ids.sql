alter table public.audit_logs add column if not exists legacy_id text;
alter table public.login_logs add column if not exists legacy_id text;
create unique index if not exists audit_logs_legacy_id_uq on public.audit_logs(legacy_id) where legacy_id is not null;
create unique index if not exists login_logs_legacy_id_uq on public.login_logs(legacy_id) where legacy_id is not null;