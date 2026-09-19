import { saveAudit,cleanupAudit,listAudit } from './dispatch-store.mjs';
export async function recordAudit(ctx,action,entityType,entityId,before={},after={}){return saveAudit({actor_discord_id:String(ctx?.x?.id||''),actor_name:String(ctx?.police?.name||ctx?.x?.global_name||ctx?.x?.username||''),action:String(action),entity_type:String(entityType),entity_id:entityId?String(entityId):null,before_data:before||{},after_data:after||{}})}
export async function purgeExpiredAudit(){return cleanupAudit()}
export async function readAudit(filters){return listAudit(filters)}