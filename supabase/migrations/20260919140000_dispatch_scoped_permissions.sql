alter table public.dispatch_access add column if not exists permissions jsonb not null default '[]'::jsonb;
update public.dispatch_access set permissions='["view_dispatch"]'::jsonb where permissions='[]'::jsonb and enabled=true;
