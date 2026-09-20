export const DISPATCH_ADMIN_PERMISSIONS={view_dispatch:'عرض Dispatch',manage_dispatch_units:'إدارة الوحدات',manage_dispatch_members:'إدارة أفراد الوحدات',manage_dispatch_regions:'إدارة المناطق',manage_dispatch_locations:'إدارة النقاط',manage_dispatch_types:'إدارة أنواع الوحدات',manage_dispatch_vehicles:'إدارة المركبات',view_dispatch_audit:'عرض سجل Dispatch',manage_dispatch_permissions:'إدارة صلاحيات Dispatch',manage_dispatch_dispatchers:'إدارة المناوبين',manage_dispatch_snapshots:'إدارة Snapshots',manage_dispatch_settings:'إدارة إعدادات Dispatch'};
export function adminCan(ctx,p){return Boolean(ctx?.admin&&Array.isArray(ctx.permissions)&&ctx.permissions.includes(p))}
export function dispatchCan(ctx,access,p){return Boolean(ctx?.isSuperAdmin)||Boolean(access?.enabled===true&&Array.isArray(access?.permissions)&&access.permissions.includes(p))}
export function hasDispatchAccess(ctx,access){return Boolean(ctx?.police||dispatchCan(ctx,access,'view_dispatch'))}
export function canOperate(ctx,access){return Boolean(ctx?.police&&hasDispatchAccess(ctx,access))}
export function requireDispatchAccess(ctx,access){if(!ctx?.x)throw new Error('UNAUTHENTICATED');if(!hasDispatchAccess(ctx,access))throw new Error('DISPATCH_ACCESS_DENIED')}
export function requireOperation(ctx,access){requireDispatchAccess(ctx,access);if(!ctx.police)throw new Error('DISPATCH_PERSONNEL_REQUIRED')}
export function requireAdminPermission(ctx,p,access=null){if(dispatchCan(ctx,access,p))return;throw new Error('INSUFFICIENT_PERMISSION')}
