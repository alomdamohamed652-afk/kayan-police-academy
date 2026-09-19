create table if not exists public.dispatch_regions (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 description text not null default '', active boolean not null default true, sort_order integer not null default 0,
 map_geometry jsonb not null default '{}'::jsonb, color text, icon text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text
);
create table if not exists public.dispatch_locations (
 id uuid primary key default gen_random_uuid(), name text not null, type text not null default 'point',
 description text not null default '', region_id uuid references public.dispatch_regions(id) on update cascade on delete set null,
 map_position jsonb not null default '{}'::jsonb, active boolean not null default true, notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text
);
create table if not exists public.dispatch_unit_types (
 id uuid primary key default gen_random_uuid(), code text not null unique, name text not null,
 category text not null default 'general', icon text, color text, active boolean not null default true, sort_order integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text
);
create table if not exists public.dispatch_vehicles (
 id uuid primary key default gen_random_uuid(), name text not null, model text not null default '', type text not null default 'police',
 image_url text, call_sign text, plate_code text, status text not null default 'available', notes text not null default '',
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text,
 constraint dispatch_vehicle_status_check check(status in ('available','assigned','maintenance','inactive'))
);
create table if not exists public.dispatch_units (
 id uuid primary key default gen_random_uuid(), unit_code text not null unique,
 type_id uuid not null references public.dispatch_unit_types(id) on update cascade on delete restrict,
 status text not null default 'available',
 vehicle_id uuid references public.dispatch_vehicles(id) on update cascade on delete set null,
 is_shared boolean not null default false, map_position jsonb not null default '{}'::jsonb, notes text not null default '',
 active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text,
 constraint dispatch_unit_status_check check(status in ('active','available','busy','break','offline','suspended'))
);
create table if not exists public.dispatch_unit_members (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.dispatch_units(id) on update cascade on delete cascade,
 discord_id text not null, role_in_unit text not null default 'member', joined_at timestamptz not null default now(), left_at timestamptz,
 active boolean not null default true, created_at timestamptz not null default now(), created_by text,
 constraint dispatch_unit_member_role_check check(role_in_unit in ('member','lead','driver','observer'))
);
create table if not exists public.dispatch_unit_assignments (
 id uuid primary key default gen_random_uuid(), unit_id uuid not null references public.dispatch_units(id) on update cascade on delete cascade,
 region_id uuid references public.dispatch_regions(id) on update cascade on delete restrict,
 location_id uuid references public.dispatch_locations(id) on update cascade on delete restrict,
 assignment_type text not null default 'primary', active boolean not null default true, notes text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by text, updated_by text,
 constraint dispatch_assignment_target_check check(region_id is not null or location_id is not null),
 constraint dispatch_assignment_type_check check(assignment_type in ('primary','secondary','patrol_area'))
);
create table if not exists public.dispatch_dispatchers (
 id uuid primary key default gen_random_uuid(), discord_id text not null, status text not null default 'active',
 started_at timestamptz not null default now(), ended_at timestamptz, assigned_by text, note text not null default '',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint dispatch_dispatcher_status_check check(status in ('active','offline'))
);
create table if not exists public.dispatch_settings (
 id text primary key default 'default',
 map_image_url text not null default 'https://www.gtabase.com/igallery/maps/gta-5-map-los-santos-street-names-1920.png',
 map_width numeric not null default 806, map_height numeric not null default 1000, poll_interval_ms integer not null default 10000,
 updated_at timestamptz not null default now(), updated_by text
);
create table if not exists public.dispatch_audit_logs (
 id bigint generated by default as identity primary key, actor_discord_id text, actor_name text, action text not null,
 entity_type text not null, entity_id text, before_data jsonb not null default '{}'::jsonb, after_data jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(), expires_at timestamptz not null default(now()+interval '48 hours')
);
create table if not exists public.dispatch_snapshots (
 id uuid primary key default gen_random_uuid(), name text not null, description text not null default '', schema_version integer not null default 1,
 snapshot_data jsonb not null, created_at timestamptz not null default now(), created_by text not null, restored_at timestamptz, restored_by text
);
create unique index if not exists dispatch_unit_members_active_unique on public.dispatch_unit_members(discord_id) where active;
create unique index if not exists dispatch_dispatchers_active_unique on public.dispatch_dispatchers(discord_id) where status='active';
create unique index if not exists dispatch_unit_assignments_primary_unique on public.dispatch_unit_assignments(unit_id) where active and assignment_type='primary';
create index if not exists dispatch_units_type_idx on public.dispatch_units(type_id);
create index if not exists dispatch_units_vehicle_idx on public.dispatch_units(vehicle_id);
create index if not exists dispatch_unit_members_unit_idx on public.dispatch_unit_members(unit_id) where active;
create index if not exists dispatch_unit_assignments_region_idx on public.dispatch_unit_assignments(region_id) where active;
create index if not exists dispatch_unit_assignments_location_idx on public.dispatch_unit_assignments(location_id) where active;
create index if not exists dispatch_audit_created_idx on public.dispatch_audit_logs(created_at desc);
create index if not exists dispatch_audit_expires_idx on public.dispatch_audit_logs(expires_at);
create index if not exists dispatch_snapshots_created_idx on public.dispatch_snapshots(created_at desc);
alter table public.dispatch_regions enable row level security;
alter table public.dispatch_locations enable row level security;
alter table public.dispatch_unit_types enable row level security;
alter table public.dispatch_vehicles enable row level security;
alter table public.dispatch_units enable row level security;
alter table public.dispatch_unit_members enable row level security;
alter table public.dispatch_unit_assignments enable row level security;
alter table public.dispatch_dispatchers enable row level security;
alter table public.dispatch_settings enable row level security;
alter table public.dispatch_audit_logs enable row level security;
alter table public.dispatch_snapshots enable row level security;
revoke all on public.dispatch_regions,public.dispatch_locations,public.dispatch_unit_types,public.dispatch_vehicles,public.dispatch_units,public.dispatch_unit_members,public.dispatch_unit_assignments,public.dispatch_dispatchers,public.dispatch_settings,public.dispatch_audit_logs,public.dispatch_snapshots from anon,authenticated;
insert into public.dispatch_settings(id) values('default') on conflict(id) do nothing;
insert into public.dispatch_unit_types(code,name,category,sort_order) values
('PATROL','Patrol','patrol',10),('SPEED','Speed','traffic',20),('MOTOR','Motor','traffic',30),('SWAT','SWAT','special',40),
('AIR','Air','special',50),('K9','K9','special',60),('TRAFFIC','Traffic','traffic',70),('SPECIAL','Special','special',80)
on conflict(code) do nothing;
create or replace function public.dispatch_swap_members(p_member_a text,p_member_b text,p_actor text default null) returns jsonb
language plpgsql security definer set search_path=public as $$
declare a public.dispatch_unit_members%rowtype; b public.dispatch_unit_members%rowtype; ua public.dispatch_units%rowtype; ub public.dispatch_units%rowtype; ts timestamptz:=now();
begin
 select * into a from public.dispatch_unit_members where discord_id=p_member_a and active for update;
 if not found then raise exception 'DISPATCH_MEMBER_A_NOT_ASSIGNED'; end if;
 select * into b from public.dispatch_unit_members where discord_id=p_member_b and active for update;
 if not found then raise exception 'DISPATCH_MEMBER_B_NOT_ASSIGNED'; end if;
 if a.unit_id=b.unit_id then raise exception 'DISPATCH_SAME_UNIT'; end if;
 select * into ua from public.dispatch_units where id=a.unit_id and active for update;
 select * into ub from public.dispatch_units where id=b.unit_id and active for update;
 if ua.id is null or ub.id is null then raise exception 'DISPATCH_UNIT_NOT_ACTIVE'; end if;
 update public.dispatch_unit_members set active=false,left_at=ts where id in(a.id,b.id);
 insert into public.dispatch_unit_members(unit_id,discord_id,role_in_unit,joined_at,active,created_by)
 values(ua.id,b.discord_id,b.role_in_unit,ts,true,p_actor),(ub.id,a.discord_id,a.role_in_unit,ts,true,p_actor);
 return jsonb_build_object('ok',true,'unitA',ua.id,'unitB',ub.id,'memberA',a.discord_id,'memberB',b.discord_id);
end; $$;
revoke execute on function public.dispatch_swap_members(text,text,text) from anon,authenticated;