import fs from 'node:fs/promises';
const file='server/academy-production-original.mjs';
let s=await fs.readFile(file,'utf8');

const importOld="import { clearExamAnswerData, clearApplicationBatchData } from './admin-data-actions.mjs';";
const importNew=importOld+"\nimport { purgeOldLogs, purgeLogsKeepRecent3Days } from './log-retention-actions.mjs';";
if(!s.includes(importNew)){
  if(!s.includes(importOld)) throw new Error('SECURITY_PATCH_IMPORT_TARGET_NOT_FOUND');
  s=s.replace(importOld,importNew);
}

const auditNeed="function audit(c,a,t,d='')";
const auditPos=s.indexOf(auditNeed);
if(auditPos<0) throw new Error('SECURITY_PATCH_AUDIT_TARGET_NOT_FOUND');
const auditEnd=s.indexOf('\n',auditPos);
const retentionFns=[
"function trimMemoryLogsBefore(cutoff){",
"  const t=new Date(cutoff).getTime();",
"  data.audit=Array.isArray(data.audit)?data.audit.filter(x=>new Date(x.at||x.createdAt||0).getTime()>=t):[];",
"  data.loginLogs=Array.isArray(data.loginLogs)?data.loginLogs.filter(x=>new Date(x.at||x.createdAt||0).getTime()>=t):[];",
"}",
"function nextCairoMidnightDelay(){",
"  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());",
"  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));",
"  const wallNow=Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),Number(p.hour),Number(p.minute),Number(p.second));",
"  return Math.max(1000,86400000-(wallNow%86400000))+5000;",
"}",
"async function automaticLogRetention(){",
"  try{",
"    const out=await purgeOldLogs();",
"    const cutoff=out?.cutoff||new Date(Date.now()-7*86400000).toISOString();",
"    trimMemoryLogsBefore(cutoff);",
"    console.log('Automatic 7-day log retention completed:',out);",
"  }catch(e){console.error('Automatic log retention failed:',e.message)}",
"  setTimeout(automaticLogRetention,nextCairoMidnightDelay()).unref?.();",
"}",
"setTimeout(automaticLogRetention,nextCairoMidnightDelay()).unref?.();"
].join('\n');
if(!s.includes("function automaticLogRetention()")) s=s.slice(0,auditEnd+1)+retentionFns+'\n'+s.slice(auditEnd+1);

const stateMarker="app.get('/api/admin/state',async(req,res)=>";
const endpoint="app.post('/api/admin/activity-logs/clear-old',async(req,res)=>{try{const c=await requireAdmin(req,res,'manage_sessions');if(!c)return;const out=await purgeLogsKeepRecent3Days();const cutoff=out?.kept_since||new Date(Date.now()-3*86400000).toISOString();trimMemoryLogsBefore(cutoff);audit(c,'CLEAR_OLD_ACTIVITY_LOGS','activity-logs','manual retention: kept last 3 days');try{await saveAcademyData(data)}catch(e){console.error('Manual log retention mirror save failed:',e.message)}res.json({ok:true,keptSince:cutoff,auditDeleted:Number(out?.audit_deleted||0),loginDeleted:Number(out?.login_deleted||0)})}catch(e){console.error('Manual log retention failed:',e);res.status(503).json({error:'LOG_CLEANUP_FAILED',retryable:true})}});\n";
if(!s.includes("app.post('/api/admin/activity-logs/clear-old'")) s=s.replace(stateMarker,endpoint+stateMarker);

const stateOld="admins:data.admins,permissions:PERMISSIONS,";
const stateNew="admins:(()=>{const list=[...(data.admins||[])];for(const uid of BOOTSTRAP_ADMINS){const a=list.find(x=>id(x.discordId)===uid);if(!a)list.unshift({discordId:uid,name:'Super Admin',permissions:ALL,enabled:true,source:'environment'});else Object.assign(a,{name:'Super Admin',permissions:ALL,enabled:true,source:'environment'})}return list})(),permissions:PERMISSIONS,";
if(!s.includes(stateNew)){
  if(!s.includes(stateOld)) throw new Error('SECURITY_PATCH_STATE_TARGET_NOT_FOUND');
  s=s.replace(stateOld,stateNew);
}
await fs.writeFile(file,s,'utf8');
console.log('Security/admin hardening applied.');
