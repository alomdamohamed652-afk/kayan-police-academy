create or replace function public.dispatch_restore_snapshot(p_snapshot_id uuid,p_actor text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare s public.dispatch_snapshots%rowtype; x jsonb;
begin
 select * into s from public.dispatch_snapshots where id=p_snapshot_id for update;
 if not found then raise exception 'DISPATCH_SNAPSHOT_NOT_FOUND'; end if; x:=s.snapshot_data;
 delete from public.dispatch_unit_assignments; delete from public.dispatch_unit_members; delete from public.dispatch_dispatchers;
 delete from public.dispatch_units; delete from public.dispatch_locations; delete from public.dispatch_vehicles; delete from public.dispatch_unit_types; delete from public.dispatch_regions;
 insert into public.dispatch_regions(id,code,name,description,active,sort_order,map_geometry,color,icon,created_at,updated_at,created_by,updated_by)
 select id,code,name,description,active,sort_order,map_geometry,color,icon,created_at,updated_at,created_by,updated_by from jsonb_to_recordset(coalesce(x->'regions','[]'::jsonb)) t(id uuid,code text,name text,description text,active boolean,sort_order integer,map_geometry jsonb,color text,icon text,created_at timestamptz,updated_at timestamptz,created_by text,updated_by text);
 insert into public.dispatch_locations(id,name,type,description,region_id,map_position,active,notes,created_at,updated_at,created_by,updated_by)
 select id,name,type,description,region_id,map_position,active,notes,created_at,updated_at,created_by,updated_by from jsonb_to_recordset(coalesce(x->'locations','[]'::jsonb)) t(id uuid,name text,type text,description text,region_id uuid,map_position jsonb,active boolean,notes text,created_at timestamptz,updated_at timestamptz,created_by text,updated_by text);
 insert into public.dispatch_unit_types(id,code,name,category,icon,color,active,sort_order,created_at,updated_at,created_by,updated_by)
 select id,code,name,category,icon,color,active,sort_order,created_at,updated_at,created_by,updated_by from jsonb_to_recordset(coalesce(x->'unit_types','[]'::jsonb)) t(id uuid,code text,name text,category text,icon text,color text,active boolean,sort_order integer,created_at timestamptz,updated_at timestamptz,created_by text,updated_by text);
 insert into public.dispatch_vehicles(id,name,model,type,image_url,call_sign,plate_code,status,notes,active,created_at,updated_at,created_by,updated_by)
 select id,name,model,type,image_url,call_sign,plate_code,status,notes,active,created_at,updated_at,created_by,updated_by from jsonb_to_recordset(coalesce(x->'vehicles','[]'::jsonb)) t(id uuid,name text,model text,type text,image_url text,call_sign text,plate_code text,status text,notes text,active boolean,created_at timestamptz,updated_at timestamptz,created_by text,updated_by text);
 insert into public.dispatch_units(id,unit_code,type_id,status,vehicle_id,is_shared,map_position,notes,active,created_at,updated_at,created_by,updated_by)
 select id,unit_code,type_id,status,vehicle_id,is_shared,map_position,notes,active,created_at,updated_at,created_by,updated_by from jsonb_to_recordset(coalesce(x->'units','[]'::jsonb)) t(id uuid,unit_code text,type_id uuid,status text,vehicle_id uuid,is_shared boolean,map_position jsonb,notes text,active boolean,created_at timestamptz,updated_at timestamptz,created_by text,updated_by text);
 insert into public.dispatch_unit_members(id,unit_id,discord_id,role_in_unit,joined_at,left_at,active,created_at,created_by)
 select id,unit_id,discord_id,role_in_unit,joined_at,left_at,active,created_at,created_by from jsonb_to_recordset(coalesce(x->'unit_members','[]'::jsonb)) t(id uuid,unit_id uuid,discord_id text,role_in_unit text,joined_at timestamptz,left_at timestamptz,active boolean,created_at timestamptz,created_by text);
 insert into public.dispatch_unit_assignments(id,unit_id,region_id,location_id,assignment_type,active,notes,created_at,updated_at,created_by,updated_by)
 select id,unit_id,region_id,location_id,assignment_type,active,notes,created_at,updated_at,created_by,updated_by from jsonb_to_recordset(coalesce(x->'unit_assignments','[]'::jsonb)) t(id uuid,unit_id uuid,region_id uuid,location_id uuid,assignment_type text,active boolean,notes text,created_at timestamptz,updated_at timestamptz,created_by text,updated_by text);
 insert into public.dispatch_dispatchers(id,discord_id,status,started_at,ended_at,assigned_by,note,created_at,updated_at)
 select id,discord_id,status,started_at,ended_at,assigned_by,note,created_at,updated_at from jsonb_to_recordset(coalesce(x->'dispatchers','[]'::jsonb)) t(id uuid,discord_id text,status text,started_at timestamptz,ended_at timestamptz,assigned_by text,note text,created_at timestamptz,updated_at timestamptz);
 update public.dispatch_settings set map_image_url=coalesce(nullif(x->'settings'->>'map_image_url',''),map_image_url),map_width=coalesce((x->'settings'->>'map_width')::numeric,map_width),map_height=coalesce((x->'settings'->>'map_height')::numeric,map_height),poll_interval_ms=coalesce((x->'settings'->>'poll_interval_ms')::integer,poll_interval_ms),updated_at=now(),updated_by=p_actor where id='default';
 update public.dispatch_snapshots set restored_at=now(),restored_by=p_actor where id=p_snapshot_id;
 return jsonb_build_object('ok',true,'snapshotId',p_snapshot_id);
end; $$;
revoke execute on function public.dispatch_restore_snapshot(uuid,text) from anon,authenticated;