-- Ensure the configured Kayan Super Admin has an explicit full Dispatch access row.
-- Backend authorization still treats the Super Admin as implicitly full-access.
insert into public.dispatch_access (discord_id, enabled, granted_by, note, permissions)
values (
  '798195732855128124',
  true,
  '798195732855128124',
  'Kayan Super Admin — full Dispatch access',
  '["view_dispatch","manage_dispatch_units","manage_dispatch_members","manage_dispatch_regions","manage_dispatch_locations","manage_dispatch_types","manage_dispatch_vehicles","view_dispatch_audit","manage_dispatch_permissions","manage_dispatch_dispatchers","manage_dispatch_snapshots","manage_dispatch_settings"]'::jsonb
)
on conflict (discord_id) do update
set enabled = true,
    updated_at = now(),
    note = 'Kayan Super Admin — full Dispatch access',
    permissions = excluded.permissions;
