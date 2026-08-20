import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
const app=express();
const PORT=Number(process.env.PORT||3001);
const SHEET_ID=process.env.GOOGLE_SHEET_ID||'1J1cWiWn_yOhy3G7coTOwq6AoS9OZvW8rul1_gzZ8uRc';
const SHEET_RANGE=process.env.GOOGLE_SHEET_RANGE||'A:Z';
const GOOGLE_SHEETS_API_KEY=process.env.GOOGLE_SHEETS_API_KEY||'';
const DISCORD_CLIENT_ID=process.env.DISCORD_CLIENT_ID||'';
const DISCORD_CLIENT_SECRET=process.env.DISCORD_CLIENT_SECRET||'';
const DISCORD_REDIRECT_URI=process.env.DISCORD_REDIRECT_URI||'http://localhost:3001/auth/discord/callback';
const FRONTEND_URL=process.env.FRONTEND_URL||'http://localhost:5173';
const SESSION_SECRET=process.env.SESSION_SECRET||'CHANGE_ME';
const SYNC_TTL_MS=Number(process.env.SHEET_SYNC_TTL_MS||60000);
app.use(express.json());app.use(cookieParser());let cache={at:0,rows:[]};
const norm=v=>String(v||'').trim().toLowerCase().replace(/[\s_\-]+/g,'');
const hi=(hs,cs,fb)=>{const n=hs.map(norm);for(const c of cs){const i=n.findIndex(h=>h.includes(norm(c)));if(i>=0)return i}return fb};
function rowToRecord(hs,row){const ni=hi(hs,['الاسم','name','اسم'],0),ri=hi(hs,['الرتبة','الرتبه','rank'],1),ci=hi(hs,['الكود','code'],2);return{name:String(row[ni]||'').trim(),rank:String(row[ri]||'').trim(),code:String(row[ci]||'').trim(),discordId:String(row[7]||'').trim(),raw:Object.fromEntries(hs.map((h,i)=>[h||`column_${i+1}`,row[i]??'']))}}
async function readSheet(){if(cache.rows.length&&Date.now()-cache.at<SYNC_TTL_MS)return cache.rows;if(!GOOGLE_SHEETS_API_KEY)throw Error('GOOGLE_SHEETS_API_KEY is not configured');const u=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_RANGE)}`);u.searchParams.set('key',GOOGLE_SHEETS_API_KEY);const r=await fetch(u);if(!r.ok)throw Error(`Google Sheets API returned ${r.status}`);const d=await r.json(),v=d.values||[],hs=v[0]||[];cache={at:Date.now(),rows:v.slice(1).map(x=>rowToRecord(hs,x)).filter(x=>x.discordId)};return cache.rows}
function role(rec){if(!rec)return'citizen';const t=`${rec.rank} ${Object.values(rec.raw).join(' ')}`.toLowerCase();if(t.includes('رئيس الأكاديمية'))return'academy_president';if(t.includes('نائب رئيس الأكاديمية'))return'academy_vice_president';if(t.includes('مساعد نائب'))return'academy_assistant_vice';if(t.includes('قائد الشرطة'))return'police_commander';if(t.includes('مدرب'))return'trainer';return'officer'}
function perms(r){const l=['academy_president','academy_vice_president','academy_assistant_vice','police_commander'];return{isCitizen:r==='citizen',isOfficer:r!=='citizen',isTrainer:r==='trainer',isLeadership:l.includes(r),canApply:r==='citizen',canViewAcademy:r!=='citizen',canManageAcademy:l.includes(r)}}
function session(req){try{return jwt.verify(req.cookies.kayan_session,SESSION_SECRET)}catch{return null}}
app.get('/api/health',(_q,s)=>s.json({ok:true,sheetConfigured:Boolean(GOOGLE_SHEETS_API_KEY),discordConfigured:Boolean(DISCORD_CLIENT_ID&&DISCORD_CLIENT_SECRET)}));
app.get('/api/me',async(q,s)=>{const x=session(q);if(!x)return s.json({authenticated:false});try{const p=(await readSheet()).find(r=>r.discordId===String(x.id))||null,r=role(p);return s.json({authenticated:true,discord:x,police:p,role:r,permissions:perms(r)})}catch(e){return s.status(503).json({authenticated:true,discord:x,syncError:e.message})}});
app.get('/api/academy/members',async(q,s)=>{const x=session(q);if(!x)return s.status(401).json({error:'UNAUTHENTICATED'});const rows=await readSheet(),me=rows.find(r=>r.discordId===String(x.id));if(role(me)==='citizen')return s.status(403).json({error:'OFFICER_ONLY'});s.json({updatedAt:cache.at,members:rows})});
app.get('/auth/discord',(_q,s)=>{if(!DISCORD_CLIENT_ID)return s.status(503).send('Discord OAuth is not configured yet.');const p=new URLSearchParams({client_id:DISCORD_CLIENT_ID,response_type:'code',redirect_uri:DISCORD_REDIRECT_URI,scope:'identify'});s.redirect(`https://discord.com/oauth2/authorize?${p}`)});
app.get('/auth/discord/callback',async(q,s)=>{try{const code=String(q.query.code||'');const body=new URLSearchParams({client_id:DISCORD_CLIENT_ID,client_secret:DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:DISCORD_REDIRECT_URI});const tr=await fetch('https://discord.com/api/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});if(!tr.ok)throw Error('Discord token exchange failed');const tk=await tr.json(),mr=await fetch('https://discord.com/api/users/@me',{headers:{Authorization:`Bearer ${tk.access_token}`}});if(!mr.ok)throw Error('Discord identity lookup failed');const me=await mr.json(),tok=jwt.sign({id:me.id,username:me.username,global_name:me.global_name,avatar:me.avatar},SESSION_SECRET,{expiresIn:'7d'});s.cookie('kayan_session',tok,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:604800000});s.redirect(FRONTEND_URL)}catch(e){s.status(500).send(`Discord login failed: ${e.message}`)}});
app.post('/api/logout',(_q,s)=>{s.clearCookie('kayan_session');s.json({ok:true})});
app.listen(PORT,()=>console.log(`Kayan Academy API: http://localhost:${PORT}`));
