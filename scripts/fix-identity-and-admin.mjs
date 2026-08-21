import fs from 'node:fs/promises';

const serverPath = 'server/index-production.mjs';
let s = await fs.readFile(serverPath, 'utf8');

// Replace the brittle fixed-range police reader with header detection across A:Z.
// This keeps the existing row() mapper but no longer assumes the headers start at B4.
const policeRe = /async function police\(force=false\)\{[\s\S]*?\nasync function ensureData\(s\)/;
const policeReplacement = String.raw`async function police(force=false){
  if(!force&&cache.rows.length&&now()-cache.at<TTL)return cache.rows;
  let last=null;
  const sheetName=POLICE_RANGE.includes('!')?POLICE_RANGE.split('!')[0]:'officers';
  const ranges=[`${sheetName}!A:Z`,POLICE_RANGE];
  for(const range of [...new Set(ranges)]){
    try{
      const svc=await service();
      const r=await svc.spreadsheets.values.get({spreadsheetId:POLICE_SHEET_ID,range,timeout:10000});
      const v=r.data.values||[];
      let headerIndex=0;
      let headers=v[0]||[];
      const looksHeader=a=>{const x=a.map(norm);return x.some(k=>['ديسكورد','discord','discordid','discord_id'].includes(k)||k.includes('discord'))&&x.some(k=>k==='name'||k.includes('الاسم')||k==='rank'||k.includes('الرتبه')||k.includes('الرتبة'))};
      const limit=Math.min(v.length,12);
      for(let i=0;i<limit;i++){if(looksHeader(v[i])){headerIndex=i;headers=v[i];break}}
      const rows=v.slice(headerIndex+1).map(x=>row(headers,x)).filter(x=>x.discordId||x.name);
      if(rows.length){cache={at:now(),rows};return rows}
    }catch(e){last=e}
  }
  if(cache.rows.length)return cache.rows;
  if(API_KEY){
    try{
      const range=ranges[0];
      const u=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${POLICE_SHEET_ID}/values/${encodeURIComponent(range)}`);
      u.searchParams.set('key',API_KEY);
      const r=await fetch(u,{signal:AbortSignal.timeout(10000)});
      if(r.ok){
        const v=(await r.json()).values||[];
        let hi=0,headers=v[0]||[];
        for(let i=0;i<Math.min(v.length,12);i++){const x=v[i].map(norm);if(x.some(k=>k.includes('discord'))&&x.some(k=>k==='name'||k.includes('الاسم')||k.includes('rank')||k.includes('الرتبة')||k.includes('الرتبه'))){hi=i;headers=v[i];break}}
        const rows=v.slice(hi+1).map(x=>row(headers,x)).filter(x=>x.discordId||x.name);
        if(rows.length){cache={at:now(),rows};return rows}
      }
    }catch(e){last=e}
  }
  throw last||new Error('POLICE_SHEET_EMPTY')
}
async function ensureData(s)`;
if(!policeRe.test(s))throw new Error('POLICE_REPLACEMENT_TARGET_NOT_FOUND');
s=s.replace(policeRe,policeReplacement);

// Admin access must not depend on a successful officer-row lookup. A configured
// super-admin can still reach Settings/Admin while the police sheet is being repaired.
const currentRe = /async function current\(req\)\{[\s\S]*?\nasync function requireAdmin/;
const currentReplacement = String.raw`async function current(req){
  const x=sess(req);
  if(!x)return{x:null,police:null,role:'citizen',admin:false,permissions:[],sheet:false};
  const a=admin(x.id);
  const isAdmin=ADMINS.has(id(x.id))||Boolean(a?.enabled);
  try{
    const rows=await police(true);
    const needle=id(x.id);
    const p=rows.find(r=>id(r.discordId)===needle)||null;
    return{x,police:p,role:role(p),admin:isAdmin,permissions:perms(x.id),sheet:true};
  }catch(e){
    return{x,police:null,role:'unknown',admin:isAdmin,permissions:perms(x.id),sheet:false,error:e.message};
  }
}
async function requireAdmin`;
if(!currentRe.test(s))throw new Error('CURRENT_REPLACEMENT_TARGET_NOT_FOUND');
s=s.replace(currentRe,currentReplacement);

const requireAdminRe = /async function requireAdmin\(req,res,p='view_dashboard'\)\{[\s\S]*?\nfunction audit/;
const requireAdminReplacement = String.raw`async function requireAdmin(req,res,p='view_dashboard'){
  const c=await current(req);
  if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});
  if(!c.admin)return res.status(403).json({error:'FORBIDDEN'});
  if(!storageReady)return res.status(503).json({error:'ACADEMY_STORAGE_UNAVAILABLE',retryable:true});
  if(p&&!c.permissions.includes(p))return res.status(403).json({error:'INSUFFICIENT_PERMISSION',permission:p});
  return c;
}
function audit`;
if(!requireAdminRe.test(s))throw new Error('REQUIRE_ADMIN_REPLACEMENT_TARGET_NOT_FOUND');
s=s.replace(requireAdminRe,requireAdminReplacement);

// Keep /api/me honest: if the sheet is temporarily unavailable, do not label the
// user as a citizen. Return identityPending and retain admin permissions.
const meRe = /app\.get\('\/api\/me',async\(req,res\)=>\{[\s\S]*?\napp\.get\('\/api\/public\/hierarchy'/;
const meReplacement = String.raw`app.get('/api/me',async(req,res)=>{
  const c=await current(req);
  if(!c.x)return res.json({authenticated:false,role:'citizen',permissions:{isCitizen:true,isOfficer:false,isAdmin:false,adminPermissions:[]}});
  if(!c.sheet)return res.json({authenticated:true,identityPending:true,discord:c.x,police:null,role:'unknown',permissions:{isCitizen:false,isOfficer:false,isAdmin:c.admin,adminPermissions:c.permissions,canViewEvaluations:c.permissions.includes('view_evaluations')||c.permissions.includes('manage_evaluations')}});
  const officer=Boolean(c.police);
  res.json({authenticated:true,identityPending:false,discord:c.x,police:c.police?{name:c.police.name,rank:c.police.rank,code:c.police.code,badge:c.police.badge,status:c.police.status,responsibility:c.police.responsibility,leave:c.police.leave,discordId:c.police.discordId}:null,role:officer?c.role:'citizen',permissions:{isCitizen:!officer,isOfficer:officer,isAdmin:c.admin,adminPermissions:c.permissions,canViewEvaluations:c.permissions.includes('view_evaluations')||c.permissions.includes('manage_evaluations')||['trainer','academy_president','academy_vice_president','academy_assistant_vice','police_commander','affairs'].includes(c.role)}})});
app.get('/api/public/hierarchy'`;
if(!meRe.test(s))throw new Error('ME_REPLACEMENT_TARGET_NOT_FOUND');
s=s.replace(meRe,meReplacement);

await fs.writeFile(serverPath,s,'utf8');
console.log('Identity/admin resilience patch applied.');
