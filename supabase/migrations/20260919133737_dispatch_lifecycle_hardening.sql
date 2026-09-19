create or replace function public.dispatch_delete_unit(p_unit_id uuid,p_actor text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_unit public.dispatch_units%rowtype; v_members integer:=0; v_assignments integer:=0;
begin
  select * into v_unit from public.dispatch_units where id=p_unit_id for update;
  if not found then raise exception 'DISPATCH_UNIT_NOT_FOUND'; end if;
  select count(*) into v_members from public.dispatch_unit_members where unit_id=p_unit_id;
  select count(*) into v_assignments from public.dispatch_unit_assignments where unit_id=p_unit_id;
  delete from public.dispatch_unit_members where unit_id=p_unit_id;
  delete from public.dispatch_unit_assignments where unit_id=p_unit_id;
  delete from public.dispatch_units where id=p_unit_id;
  return jsonb_build_object('ok',true,'unitId',p_unit_id,'membersRemoved',v_members,'assignmentsRemoved',v_assignments);
end; $$;

create or replace function public.dispatch_add_member(p_unit_id uuid,p_discord_id text,p_actor text,p_role text default 'member') returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_unit public.dispatch_units%rowtype; v_member public.dispatch_unit_members%rowtype; v_existing public.dispatch_unit_members%rowtype; v_stale uuid[];
begin
  perform pg_advisory_xact_lock(hashtextextended(trim(p_discord_id),0));
  select * into v_unit from public.dispatch_units where id=p_unit_id for update;
  if not found or not v_unit.active then raise exception 'DISPATCH_UNIT_INACTIVE'; end if;
  select array_agg(m.id) into v_stale from public.dispatch_unit_members m left join public.dispatch_units u on u.id=m.unit_id
  where m.discord_id=trim(p_discord_id) and m.active=true and (u.id is null or u.active=false);
  if coalesce(array_length(v_stale,1),0)>0 then update public.dispatch_unit_members set active=false,left_at=now() where id=any(v_stale); end if;
  select * into v_existing from public.dispatch_unit_members where discord_id=trim(p_discord_id) and active=true limit 1 for update;
  if found then
    if v_existing.unit_id=p_unit_id then return to_jsonb(v_existing); end if;
    raise exception 'DISPATCH_PERSONNEL_ALREADY_ASSIGNED';
  end if;
  insert into public.dispatch_unit_members(unit_id,discord_id,role_in_unit,created_by,active)
  values(p_unit_id,trim(p_discord_id),case when p_role in ('member','lead','driver','observer') then p_role else 'member' end,trim(p_actor),true)
  returning * into v_member;
  return to_jsonb(v_member);
end; $$;

create or replace function public.dispatch_delete_location(p_location_id uuid,p_actor text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_count integer:=0;
begin
  perform 1 from public.dispatch_locations where id=p_location_id for update;
  if not found then raise exception 'DISPATCH_LOCATION_NOT_FOUND'; end if;
  select count(*) into v_count from public.dispatch_unit_assignments where location_id=p_location_id;
  delete from public.dispatch_unit_assignments where location_id=p_location_id;
  delete from public.dispatch_locations where id=p_location_id;
  return jsonb_build_object('ok',true,'locationId',p_location_id,'assignmentsRemoved',v_count);
end; $$;

revoke execute on function public.dispatch_delete_unit(uuid,text) from anon,authenticated;
revoke execute on function public.dispatch_add_member(uuid,text,text,text) from anon,authenticated;
revoke execute on function public.dispatch_delete_location(uuid,text) from anon,authenticated;