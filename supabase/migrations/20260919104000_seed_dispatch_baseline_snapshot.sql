insert into public.dispatch_snapshots(name,description,schema_version,snapshot_data,created_by)
select 'Before Dispatch Launch','Initial Dispatch-only baseline captured before operational launch.',1,
jsonb_build_object(
 'regions',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_regions x),'[]'::jsonb),
 'locations',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_locations x),'[]'::jsonb),
 'unit_types',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_unit_types x),'[]'::jsonb),
 'vehicles',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_vehicles x),'[]'::jsonb),
 'units',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_units x),'[]'::jsonb),
 'unit_members',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_unit_members x),'[]'::jsonb),
 'unit_assignments',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_unit_assignments x),'[]'::jsonb),
 'dispatchers',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_dispatchers x),'[]'::jsonb),
 'access',coalesce((select jsonb_agg(to_jsonb(x)) from public.dispatch_access x),'[]'::jsonb),
 'settings',(select to_jsonb(x) from public.dispatch_settings x where x.id='default')
),'baseline-system'
where not exists(select 1 from public.dispatch_snapshots where name='Before Dispatch Launch');