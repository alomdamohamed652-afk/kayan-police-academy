create or replace function public.dispatch_delete_region(p_region_id uuid,p_actor text) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_locations integer:=0; v_assignments integer:=0;
begin
  perform 1 from public.dispatch_regions where id=p_region_id for update;
  if not found then raise exception 'DISPATCH_REGION_NOT_FOUND'; end if;
  select count(*) into v_locations from public.dispatch_locations where region_id=p_region_id;
  select count(*) into v_assignments from public.dispatch_unit_assignments where region_id=p_region_id;
  delete from public.dispatch_unit_assignments where region_id=p_region_id;
  delete from public.dispatch_locations where region_id=p_region_id;
  delete from public.dispatch_regions where id=p_region_id;
  return jsonb_build_object('ok',true,'regionId',p_region_id,'locationsRemoved',v_locations,'assignmentsRemoved',v_assignments);
end; $$;
revoke execute on function public.dispatch_delete_region(uuid,text) from anon,authenticated;