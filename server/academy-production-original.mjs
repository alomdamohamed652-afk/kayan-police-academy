import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { supabaseConfigured } from './supabase.mjs';
import { loadAcademyData, saveAcademyData } from './supabase-academy-store.mjs';

// Supabase integration is kept behind the existing production server contract.
// The police roster Google Sheet remains read-only and is never migrated.
process.env.TZ=process.env.TZ||'Africa/Cairo';
const root=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const PORT=Number(process.env.PORT||10000); const DIST=path.resolve(root,'../dist');
const POLICE_SHEET_ID=process.env.GOOGLE_SHEET_ID||process.env.POLICE_SHEET_ID||'';
const POLICE_RANGE=process.env.GOOGLE_SHEET_RANGE||process.env.POLICE_SHEET_RANGE||'officers!B4:H';
const DATA_SHEET_ID=process.env.ACADEMY_GOOGLE_SHEET_ID||process.env.GOOGLE_ACADEMY_DATA_SHEET_ID||'';
const DATA_SHEET=process.env.ACADEMY_GOOGLE_SHEET_NAME||process.env.GOOGLE_ACADEMY_DATA_SHEET_NAME||'DATA';
const API_KEY=process.env.GOOGLE_SHEETS_API_KEY||''; const SERVICE_FILE=process.env.GOOGLE_SERVICE_ACCOUNT_FILE||'/etc/secrets/google-service-account.json';
const CLIENT_ID=process.env.DISCORD_CLIENT_ID||''; const CLIENT_SECRET=process.env.DISCORD_CLIENT_SECRET||''; const REDIRECT=process.env.DISCORD_REDIRECT_URI||'http://localhost:3001/auth/discord/callback'; const FRONTEND=process.env.FRONTEND_URL||'/';
const SESSION_SECRET=String(process.env.SESSION_SECRET||'').trim();
if(!SESSION_SECRET||SESSION_SECRET.length<32)throw new Error('SESSION_SECRET is required and must be at least 32 characters.');
const ADMINS=new Set(String(process.env.ACADEMY_ADMIN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/\D/g,'')));
const TTL=Math.max(5000,Number(process.env.SHEET_SYNC_TTL_MS||60000));
const PERMISSIONS={view_dashboard:'لوحة الإدارة',view_activity_logs:'الاطلاع على سجل النشاط وتسجيل الدخول',manage_members:'إدارة الأفراد',manage_roles:'إدارة الرتب',manage_admins:'إدارة الأدمن',manage_applications:'إدارة التقديمات',manage_exams:'إدارة الاختبارات',manage_hierarchy:'إدارة الهيكل',view_evaluations:'الاطلاع على التقييمات',manage_evaluations:'إدارة التقييمات',manage_settings:'الإعدادات'};
const ALL=Object.keys(PERMISSIONS);
const DEFAULT_HIERARCHY=[{id:'president',title:'رئيس الأكاديمية',name:'غير محدد',discordId:'',image:''},{id:'vice',title:'نائب رئيس الأكاديمية',name:'غير محدد',discordId:'',image:''},{id:'assistant',title:'مساعد نائب الرئيس',name:'غير محدد',discordId:'',image:''},{id:'commander',title:'قائد الشرطة',name:'غير محدد',discordId:'',image:''}];
const DEFAULT={version:18,settings:{academyName:'أكاديمية شرطة كيان',applicationsTitle:'التقديم الأولي للشرطة',applicationsDescription:'نموذج التقديم الرسمي للانضمام إلى أكاديمية شرطة كيان.',passingScore:60,logoUrl:'',acceptedMessage:'🎉 مبروك! تم قبولك في «{{batchName}}»\nتم اعتماد طلبك للانضمام إلى أكاديمية شرطة كيان.',rejectedMessage:'تم رفض طلبك في «{{batchName}}»',acceptedDiscordUrl:'https://discord.gg/su8PsTY5gJ',evaluationTrainerRanks:[],evaluationTraineeRanks:[]},applicationQuestions:[],questionBank:[],batches:[],applications:[],exams:[],examResults:[],examAttempts:[],evaluations:[],hierarchy:DEFAULT_HIERARCHY,admins:[],audit:[],loginLogs:[],memberImages:{},memberSettings:{},applicationDrafts:{},roleOverrides:{}};
app.use(express.json({limit:'8mb'})); app.use(cookieParser());
let data=structuredClone(DEFAULT),cache={at:0,rows:[]},sheets=null,credentials=null,storageReady=false,lastStorageError='',supabaseActive=false,supabaseMigrationPending=false;
const id=v=>String(v??'').replace(/\D/g,''); const norm=v=>String(v??'').trim().toLowerCase().replace(/[\s_\-#]+/g,''); const now=()=>Date.now();
function validDate(v){return Boolean(v)&&Number.isFinite(new Date(v).getTime())}
function timeState(startAt,endAt){const t=now(),s=validDate(startAt)?new Date(startAt).getTime():null,e=validDate(endAt)?new Date(endAt).getTime():null;if(s&&t<s)return'upcoming';if(e&&t>=e)return'ended';return'open'}
function batchState(b){if(!b||b.status==='closed')return'closed';return timeState(b.startAt,b.endAt)}
function expireBatches(){const expired=[];for(const b of Array.isArray(data.batches)?data.batches:[]){if(b&&b.status==='open'&&timeState(b.startAt,b.endAt)==='ended'){b.status='closed';b.closedAt=b.closedAt||new Date().toISOString();expired.push(b)}}return expired}
async function creds(){if(credentials)return credentials;const raw=String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'').trim()||await fs.readFile(SERVICE_FILE,'utf8');credentials=JSON.parse(raw);return credentials}
async function service(){if(sheets)return sheets;const auth=new google.auth.GoogleAuth({credentials:await creds(),scopes:['https://www.googleapis.com/auth/spreadsheets']});sheets=google.sheets({version:'v4',auth});return sheets}
function hidx(h,cs,f){const a=h.map(norm);for(const c0 of cs){const c=norm(c0),i=a.findIndex(x=>x===c||x.includes(c)||c.includes(x));if(i>=0)return i}return f}
function row(headers,r){const b=hidx(headers,['Badge #','Badge','البادج','الكود'],0),n=hidx(headers,['الاسم','name'],1),l=hidx(headers,['الإجازة','الاجازة','leave'],2),k=hidx(headers,['الرتبة','الرتبه','rank'],3),s=hidx(headers,['الحالة','status'],4),q=hidx(headers,['المسؤولية','المسؤوليه','responsibility'],5),d=hidx(headers,['ديسكورد','discord','discord id','discordid','discord_id'],6);return{badge:String(r[b]??'').trim(),code:String(r[b]??'').trim(),name:String(r[n]??'').trim(),leave:String(r[l]??'').trim(),rank:String(r[k]??'').trim(),status:String(r[s]??'').trim().toUpperCase(),responsibility:String(r[q]??'').trim(),discordId:id(r[d])}}
async function police(force=false){if(!POLICE_SHEET_ID)throw new Error('POLICE_SHEET_NOT_CONFIGURED');if(!force&&cache.rows.length&&now()-cache.at<TTL)return cache.rows;let last=null;try{const s=await service(),r=await s.spreadsheets.values.get({spreadsheetId:POLICE_SHEET_ID,range:POLICE_RANGE});const v=r.data.values||[],headers=v[0]||[],rows=v.slice(1).map(x=>row(headers,x)).filter(x=>x.discordId||x.name);if(rows.length){cache={at:now(),rows};return rows}last=new Error('POLICE_SHEET_EMPTY')}catch(e){last=e}if(cache.rows.length)return cache.rows;if(API_KEY)try{const u=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${POLICE_SHEET_ID}/values/${encodeURIComponent(POLICE_RANGE)}`);u.searchParams.set('key',API_KEY);const r=await fetch(u,{signal:AbortSignal.timeout(10000)});if(r.ok){const v=(await r.json()).values||[],rows=v.slice(1).map(x=>row(v[0]||[],x)).filter(x=>x.discordId||x.name);if(rows.length){cache={at:now(),rows};return rows}}}catch(e){last=e}throw last||new Error('POLICE_SHEET_UNAVAILABLE')}
async function load(){
 try{
  if(supabaseConfigured){const remote=await loadAcademyData(); if(remote){data={...structuredClone(DEFAULT),...remote,settings:{...DEFAULT.settings,...(remote.settings||{})}};data.memberImages=data.memberImages||{};data.memberSettings=data.memberSettings||{};data.applicationDrafts=data.applicationDrafts||{};supabaseActive=true;storageReady=true;console.log('Supabase academy storage ready');return;} supabaseMigrationPending=Boolean(DATA_SHEET_ID);}
  const s=await service();
  if(DATA_SHEET_ID){const m=await s.spreadsheets.get({spreadsheetId:DATA_SHEET_ID,fields:'sheets.properties'});const have=new Set((m.data.sheets||[]).map(x=>x.properties?.title));if(!have.has(DATA_SHEET))await s.spreadsheets.batchUpdate({spreadsheetId:DATA_SHEET_ID,requestBody:{requests:[{addSheet:{properties:{title:DATA_SHEET}}}]}});const r=await s.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:`${DATA_SHEET}!A1:A1000`});const raw=(r.data.values||[]).map(x=>String(x?.[0]??'')).join('');if(raw){const parsed=JSON.parse(raw);data={...structuredClone(DEFAULT),...parsed,settings:{...DEFAULT.settings,...(parsed.settings||{})}};}}
  for(const uid of ADMINS)if(!data.admins.some(a=>id(a.discordId)===uid))data.admins.push({discordId:uid,name:'Super Admin',permissions:ALL,enabled:true,createdAt:new Date().toISOString(),source:'environment'});
  storageReady=true;lastStorageError='';console.log(`Google DATA storage ready (${DATA_SHEET})`);
  if(supabaseMigrationPending){await saveAcademyData(data);supabaseActive=true;supabaseMigrationPending=false;console.log('Academy data migrated from legacy Google DATA storage to Supabase.');}
 }catch(e){storageReady=false;lastStorageError=e.message;supabaseMigrationPending=false;console.error('Google DATA storage unavailable:',e.message)}
}
let saveQueue=Promise.resolve();
async function save(){if(supabaseActive)return saveAcademyData(data);saveQueue=saveQueue.catch(()=>{}).then(async()=>{if(!DATA_SHEET_ID)throw new Error('ACADEMY_GOOGLE_SHEET_ID_NOT_CONFIGURED');const s=await service();await s.spreadsheets.values.update({spreadsheetId:DATA_SHEET_ID,range:`${DATA_SHEET}!A1`,valueInputOption:'RAW',requestBody:{values:[[JSON.stringify(data)]]}})});return saveQueue;}
function safeJson(res,obj,status=200){if(res.headersSent)return false;res.status(status).json(obj);return true}
async function current(req){return {x:null,police:null,admin:false,permissions:[]}}
async function requireAdmin(req,res,perm){if(res.headersSent)return null;const c=await current(req);if(!c.x){safeJson(res,{error:'UNAUTHENTICATED'},401);return null}if(!c.admin){safeJson(res,{error:'FORBIDDEN'},403);return null}if(perm&&!c.permissions.includes(perm)){safeJson(res,{error:'INSUFFICIENT_PERMISSION'},403);return null}return c}
app.get('/health',(_,res)=>res.json({ok:true,storage:storageReady,supabase:supabaseActive}));
app.use(express.static(DIST));
await load();
app.get('*',(_,res)=>res.sendFile(path.join(DIST,'index.html')));
app.listen(PORT,()=>console.log(`Kayan Academy server listening on ${PORT}`));
