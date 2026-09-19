create table if not exists public.dispatch_access (
  discord_id text primary key,
  enabled boolean not null default true,
  granted_by text,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  note text not null default ''
);
alter table public.dispatch_access enable row level security;
revoke all on public.dispatch_access from anon,authenticated;
create index if not exists dispatch_access_enabled_idx on public.dispatch_access(enabled) where enabled;