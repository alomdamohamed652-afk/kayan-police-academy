import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { google } from 'googleapis';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.resolve(__dirname, '../dist');
const app = express();
const PORT = Number(process.env.PORT || 3001);
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1J1cWiWn_yOhy3G7coTOwq6AoS9OZvW8rul1_gzZ8uRc';
const SHEET_RANGE = process.env.GOOGLE_SHEET_RANGE || 'A:Z';
const GOOGLE_SHEETS_API_KEY = process.env.GOOGLE_SHEETS_API_KEY || '';
const ADMIN_SHEET = process.env.GOOGLE_ADMIN_SHEET_NAME || 'ACADEMY_ADMINS';
const SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID || '';
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET || '';
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3001/auth/discord/callback';
const FRONTEND_URL = process.env.FRONTEND_URL || '/';
const SESSION_SECRET = process.env.SESSION_SECRET || 'CHANGE_ME';
const SYNC_TTL_MS = Number(process.env.SHEET_SYNC_TTL_MS || 60000);
const ENV_ADMIN_IDS = new Set(String(process.env.ACADEMY_ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean));

const ALL_PERMISSIONS = [
  'view_dashboard', 'manage_members', 'manage_roles', 'manage_admins',
  'manage_trainers', 'view_evaluations', 'manage_evaluations',
  'manage_hierarchy', 'manage_applications', 'manage_exams',
  'view_audit', 'manage_settings'
];
const DEFAULT_ADMIN_PERMISSIONS = ['view_dashboard','manage_members','manage_roles','manage_trainers','view_evaluations','manage_evaluations','manage_hierarchy','manage_applications','manage_exams','view_audit'];
const PERMISSION_LABELS = {
  view_dashboard:'لوحة التحكم', manage_members:'إدارة الأفراد', manage_roles:'إدارة الرولات',
  manage_admins:'إدارة الأدمن', manage_trainers:'إدارة المدربين', view_evaluations:'الاطلاع على التقييمات',
  manage_evaluations:'إدارة التقييمات', manage_hierarchy:'إدارة هيكل الأكاديمية',
  manage_applications:'إدارة التقديمات', manage_exams:'إدارة الاختبارات', view_audit:'سجل العمليات',
  manage_settings:'إعدادات النظام'
};

app.use(express.json({ limit: '3mb' }));
app.use(cookieParser());
let cache = { at: 0, rows: [] };
let adminCache = { at: 0, rows: [] };
const roleOverrides = new Map();
const hierarchy = [
  { id:'president', title:'رئيس الأكاديمية', name:'يحدد من لوحة الإدارة', discordId:'', image:'' },
  { id:'vice', title:'نائب رئيس الأكاديمية', name:'يحدد من لوحة الإدارة', discordId:'', image:'' },
  { id:'assistant', title:'مساعد نائب الرئيس', name:'يحدد من لوحة الإدارة', discordId:'', image:'' },
  { id:'commander', title:'قائد الشرطة', name:'يحدد من لوحة الإدارة', discordId:'', image:'' }
];

const norm = v => String(v ?? '').trim().toLowerCase().replace(/[\s_\-]+/g,'');
const hi = (hs, cs, fb) => { const n = hs.map(norm); for (const c of cs) { const i = n.findIndex(h => h.includes(norm(c))); if (i >= 0) return i; } return fb; };
function rowToRecord(hs,row){
  const ni=hi(hs,['الاسم','name','اسم'],0), ri=hi(hs,['الرتبة','الرتبه','rank'],1), ci=hi(hs,['الكود','code'],2);
  return {name:String(row[ni]||'').trim(),rank:String(row[ri]||'').trim(),code:String(row[ci]||'').trim(),discordId:String(row[7]||'').trim(),raw:Object.fromEntries(hs.map((h,i)=>[h||`column_${i+1}`,row[i]??'']))};
}
const safe = r => r ? { name:r.name, rank:r.rank, code:r.code, discordId:r.discordId } : null;

async function readSheet(){
  if(cache.rows.length && Date.now()-cache.at<SYNC_TTL_MS) return cache.rows;
  if(!GOOGLE_SHEETS_API_KEY) throw Error('GOOGLE_SHEETS_API_KEY is not configured');
  const u=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`);
  u.searchParams.set('key',GOOGLE_SHEETS_API_KEY);
  const r=await fetch(u); if(!r.ok) throw Error(`Google Sheets API returned ${r.status}`);
  const d=await r.json(),v=d.values||[],hs=v[0]||[];
  cache={at:Date.now(),rows:v.slice(1).map(x=>rowToRecord(hs,x)).filter(x=>x.discordId)}; return cache.rows;
}

let sheetsAuth;
function getSheetsAuth(){
  if(!SERVICE_ACCOUNT_JSON) return null;
  if(sheetsAuth) return sheetsAuth;
  let credentials;
  try { credentials=JSON.parse(SERVICE_ACCOUNT_JSON); } catch { throw Error('GOOGLE_SERVICE_ACCOUNT_JSON is invalid JSON'); }
  sheetsAuth=new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets']});
  return sheetsAuth;
}
async function adminSheetApi(){ const auth=getSheetsAuth(); if(!auth) return null; return google.sheets({version:'v4',auth}); }
async function ensureAdminSheet(api){
  const meta=await api.spreadsheets.get({spreadsheetId:SHEET_ID,fields:'sheets.properties'});
  const exists=(meta.data.sheets||[]).some(s=>s.properties?.title===ADMIN_SHEET);
  if(!exists) await api.spreadsheets.batchUpdate({spreadsheetId:SHEET_ID,requestBody:{requests:[{addSheet:{properties:{title:ADMIN_SHEET}}}]}});
  const values=await api.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${ADMIN_SHEET}!A1:F2`});
  if(!values.data.values?.length) await api.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`${ADMIN_SHEET}!A1:F1`,valueInputOption:'RAW',requestBody:{values:[['discordId','name','permissions','active','createdBy','createdAt']]} });
}
async function readAdmins(){
  if(adminCache.rows.length && Date.now()-adminCache.at<SYNC_TTL_MS) return adminCache.rows;
  const api=await adminSheetApi();
  if(!api){ adminCache={at:Date.now(),rows:[]}; return []; }
  await ensureAdminSheet(api);
  const d=await api.spreadsheets.values.get({spreadsheetId:SHEET_ID,range:`${ADMIN_SHEET}!A:F`});
  const v=d.data.values||[];
  adminCache={at:Date.now(),rows:v.slice(1).filter(r=>r[0]).map(r=>({discordId:String(r[0]),name:String(r[1]||''),permissions:String(r[2]||'').split(',').filter(Boolean),active:String(r[3]??'true')!=='false',createdBy:String(r[4]||''),createdAt:String(r[5]||'')}))};
  return adminCache.rows;
}
async function writeAdmins(rows){
  const api=await adminSheetApi();
  if(!api) throw Error('Persistent admin storage is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON.');
  await ensureAdminSheet(api);
  const values=[['discordId','name','permissions','active','createdBy','createdAt'],...rows.map(r=>[r.discordId,r.name||'',r.permissions.join(','),r.active?'true':'false',r.createdBy||'',r.createdAt||''])];
  await api.spreadsheets.values.clear({spreadsheetId:SHEET_ID,range:`${ADMIN_SHEET}!A:F`});
  await api.spreadsheets.values.update({spreadsheetId:SHEET_ID,range:`${ADMIN_SHEET}!A1`,valueInputOption:'RAW',requestBody:{values}});
  adminCache={at:Date.now(),rows};
}

function role(rec){
  if(!rec)return'citizen'; if(roleOverrides.has(rec.discordId))return roleOverrides.get(rec.discordId);
  const t=`${rec.rank} ${Object.values(rec.raw).join(' ')}`.toLowerCase();
  if(t.includes('رئيس الأكاديمية'))return'academy_president'; if(t.includes('نائب رئيس الأكاديمية'))return'academy_vice_president';
  if(t.includes('مساعد نائب'))return'academy_assistant_vice'; if(t.includes('قائد الشرطة'))return'police_commander';
  if(t.includes('شؤون'))return'affairs'; if(t.includes('مدرب'))return'trainer'; return'officer';
}
async function adminRecord(id){ return (await readAdmins()).find(a=>a.discordId===String(id)&&a.active) || null; }
async function adminPermissions(id){
  if(ENV_ADMIN_IDS.has(String(id))) return ALL_PERMISSIONS;
  const a=await adminRecord(id); return a ? a.permissions.filter(p=>ALL_PERMISSIONS.includes(p)) : [];
}
async function isAdmin(id){ return ENV_ADMIN_IDS.has(String(id)) || Boolean(await adminRecord(id)); }
async function hasPermission(id,p){ const perms=await adminPermissions(id); return perms.includes(p); }
function perms(r,admin,adminPerms=[]){
  const lead=['academy_president','academy_vice_president','academy_assistant_vice','police_commander'];
  return {isCitizen:r==='citizen',isOfficer:r!=='citizen',isTrainer:r==='trainer',isLeadership:lead.includes(r),isAffairs:r==='affairs',canApply:r==='citizen',canViewAcademy:r!=='citizen',canViewEvaluations:lead.includes(r)||r==='affairs'||adminPerms.includes('view_evaluations'),isAdmin:admin,isSuperAdmin:adminPerms.length===ALL_PERMISSIONS.length,adminPermissions:adminPerms};
}
function session(req){try{return jwt.verify(req.cookies.kayan_session,SESSION_SECRET)}catch{return null}}
async function current(req){const x=session(req);if(!x)return{x:null,police:null,role:'citizen',admin:false,adminPerms:[]};const rows=await readSheet(),police=rows.find(r=>r.discordId===String(x.id))||null,r=role(police),admin=await isAdmin(x.id),adminPerms=await adminPermissions(x.id);return{x,police,role:r,admin,adminPerms};}
async function requirePerm(req,res,p){const c=await current(req);if(!c.admin||!c.adminPerms.includes(p)){res.status(403).json({error:'FORBIDDEN',permission:p});return null}return c;}

app.get('/api/health',(_q,s)=>s.json({ok:true,sheetConfigured:Boolean(GOOGLE_SHEETS_API_KEY),discordConfigured:Boolean(DISCORD_CLIENT_ID&&DISCORD_CLIENT_SECRET),persistentAdminsConfigured:Boolean(SERVICE_ACCOUNT_JSON),adminConfigured:ENV_ADMIN_IDS.size>0}));
app.get('/api/me',async(q,s)=>{try{const c=await current(q);if(!c.x)return s.json({authenticated:false});return s.json({authenticated:true,discord:c.x,police:safe(c.police),role:c.role,permissions:perms(c.role,c.admin,c.adminPerms)});}catch(e){s.status(503).json({error:e.message})}});
app.get('/api/public/hierarchy',(_q,s)=>s.json({hierarchy}));
app.get('/api/academy/members',async(q,s)=>{try{const c=await current(q);if(!c.x)return s.status(401).json({error:'UNAUTHENTICATED'});if(c.role==='citizen')return s.status(403).json({error:'OFFICER_ONLY'});const rows=await readSheet();s.json({updatedAt:cache.at,members:rows.map(r=>({...safe(r),role:role(r),admin:awaitableAdminFlag(r.discordId)}))});}catch(e){s.status(503).json({error:e.message})}});
function awaitableAdminFlag(id){ return ENV_ADMIN_IDS.has(String(id)) || adminCache.rows.some(a=>a.discordId===String(id)&&a.active); }

app.get('/api/admin/state',async(q,s)=>{const c=await requirePerm(q,s,'view_dashboard');if(!c)return;try{const rows=await readSheet(),admins=await readAdmins();s.json({members:rows.map(r=>({...safe(r),role:role(r),admin:ENV_ADMIN_IDS.has(r.discordId)||admins.some(a=>a.discordId===r.discordId&&a.active)})),admins,permissions:PERMISSION_LABELS,hierarchy,me:{permissions:c.adminPerms,isSuperAdmin:c.adminPerms.length===ALL_PERMISSIONS.length}});}catch(e){s.status(503).json({error:e.message})}});
app.post('/api/admin/admins',async(q,s)=>{const c=await requirePerm(q,s,'manage_admins');if(!c)return;try{const discordId=String(q.body?.discordId||'').trim(),name=String(q.body?.name||'').trim(),requested=Array.isArray(q.body?.permissions)?q.body.permissions.filter(p=>ALL_PERMISSIONS.includes(p)):DEFAULT_ADMIN_PERMISSIONS; if(!/^\d{5,25}$/.test(discordId))return s.status(400).json({error:'INVALID_DISCORD_ID'}); if(String(discordId)===String(c.x.id))return s.status(400).json({error:'CANNOT_RECREATE_SELF'}); if(!requested.every(p=>c.adminPerms.includes(p)))return s.status(403).json({error:'CANNOT_GRANT_UNOWNED_PERMISSION'}); const admins=await readAdmins(); const existing=admins.find(a=>a.discordId===discordId); if(existing){existing.name=name||existing.name;existing.permissions=requested;existing.active=true;existing.createdBy=c.x.id;} else admins.push({discordId,name,permissions:requested,active:true,createdBy:c.x.id,createdAt:new Date().toISOString()}); await writeAdmins(admins);s.json({ok:true,admins});}catch(e){s.status(500).json({error:e.message})}});
app.patch('/api/admin/admins/:id',async(q,s)=>{const c=await requirePerm(q,s,'manage_admins');if(!c)return;try{const id=String(q.params.id),admins=await readAdmins(),a=admins.find(x=>x.discordId===id);if(!a)return s.status(404).json({error:'ADMIN_NOT_FOUND'});const requested=Array.isArray(q.body?.permissions)?q.body.permissions.filter(p=>ALL_PERMISSIONS.includes(p)):a.permissions;if(!requested.every(p=>c.adminPerms.includes(p)))return s.status(403).json({error:'CANNOT_GRANT_UNOWNED_PERMISSION'});a.name=String(q.body?.name??a.name);a.permissions=requested;a.active=q.body?.active!==false;await writeAdmins(admins);s.json({ok:true,admins});}catch(e){s.status(500).json({error:e.message})}});
app.delete('/api/admin/admins/:id',async(q,s)=>{const c=await requirePerm(q,s,'manage_admins');if(!c)return;try{const id=String(q.params.id);if(id===String(c.x.id))return s.status(400).json({error:'CANNOT_REMOVE_SELF'});const admins=await readAdmins(),next=admins.filter(a=>a.discordId!==id);if(next.length===admins.length)return s.status(404).json({error:'ADMIN_NOT_FOUND'});await writeAdmins(next);s.json({ok:true,admins:next});}catch(e){s.status(500).json({error:e.message})}});
app.post('/api/admin/role',async(q,s)=>{const c=await requirePerm(q,s,'manage_roles');if(!c)return;const id=String(q.body?.discordId||'').trim(),r=String(q.body?.role||'').trim(),allowed=['officer','trainer','affairs','academy_president','academy_vice_president','academy_assistant_vice','police_commander'];if(!id||!allowed.includes(r))return s.status(400).json({error:'INVALID_ROLE'});roleOverrides.set(id,r);s.json({ok:true})});
app.delete('/api/admin/role/:id',async(q,s)=>{const c=await requirePerm(q,s,'manage_roles');if(!c)return;roleOverrides.delete(String(q.params.id));s.json({ok:true})});
app.post('/api/admin/hierarchy',async(q,s)=>{const c=await requirePerm(q,s,'manage_hierarchy');if(!c)return;const items=Array.isArray(q.body?.items)?q.body.items:[];if(items.length>12)return s.status(400).json({error:'TOO_MANY_ITEMS'});for(const x of items){if(x.image&&!(String(x.image).startsWith('data:image/png')||String(x.image).startsWith('https://')))return s.status(400).json({error:'PNG_OR_HTTPS_ONLY'});if(x.image&&String(x.image).length>2200000)return s.status(400).json({error:'IMAGE_TOO_LARGE'})}hierarchy.splice(0,hierarchy.length,...items.map((x,i)=>({id:String(x.id||`node-${i}`),title:String(x.title||'منصب'),name:String(x.name||'غير محدد'),discordId:String(x.discordId||''),image:String(x.image||'')})));s.json({ok:true,hierarchy})});

app.get('/auth/discord',(_q,s)=>{if(!DISCORD_CLIENT_ID)return s.status(503).send('Discord OAuth is not configured yet.');const p=new URLSearchParams({client_id:DISCORD_CLIENT_ID,response_type:'code',redirect_uri:DISCORD_REDIRECT_URI,scope:'identify'});s.redirect(`https://discord.com/oauth2/authorize?${p}`)});
app.get('/auth/discord/callback',async(q,s)=>{try{const code=String(q.query.code||'');const body=new URLSearchParams({client_id:DISCORD_CLIENT_ID,client_secret:DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:DISCORD_REDIRECT_URI});const tr=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!tr.ok)throw Error('Discord token exchange failed');const tk=await tr.json(),mr=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${tk.access_token}`}});if(!mr.ok)throw Error('Discord identity lookup failed');const me=await mr.json(),tok=jwt.sign({id:me.id,username:me.username,global_name:me.global_name,avatar:me.avatar},SESSION_SECRET,{expiresIn:'7d'});s.cookie('kayan_session',tok,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:604800000});s.redirect(FRONTEND_URL||'/')}catch(e){s.status(500).send(`Discord login failed: ${e.message}`)}});
app.post('/api/logout',(_q,s)=>{s.clearCookie('kayan_session');s.json({ok:true})});
app.use(express.static(DIST_DIR,{index:'index.html'}));
app.use((req,res,next)=>{if(req.method!=='GET'||req.path.startsWith('/api/')||req.path.startsWith('/auth/'))return next();res.sendFile(path.join(DIST_DIR,'index.html'))});
app.listen(PORT,'0.0.0.0',()=>console.log(`Kayan Academy API: http://0.0.0.0:${PORT}`));
