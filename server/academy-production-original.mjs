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

// Academy schedule inputs are entered in Egypt local time. Render runs in UTC.
// Keep server-side parsing aligned with Cairo so datetime-local values are not shifted by 3 hours.
process.env.TZ=process.env.TZ||'Africa/Cairo';

const root=path.dirname(fileURLToPath(import.meta.url));
const app=express();
const PORT=Number(process.env.PORT||10000);
const DIST=path.resolve(root,'../dist');
const POLICE_SHEET_ID=process.env.GOOGLE_SHEET_ID||process.env.POLICE_SHEET_ID||'';
const POLICE_RANGE=process.env.GOOGLE_SHEET_RANGE||process.env.POLICE_SHEET_RANGE||'officers!B4:I';
const DATA_SHEET_ID=process.env.ACADEMY_GOOGLE_SHEET_ID||process.env.GOOGLE_ACADEMY_DATA_SHEET_ID||'';
const DATA_SHEET=process.env.ACADEMY_GOOGLE_SHEET_NAME||process.env.GOOGLE_ACADEMY_DATA_SHEET_NAME||'DATA';
const EXAMS_SHEET=process.env.ACADEMY_EXAMS_SHEET_NAME||'EXAMS';
const EXAM_RESULTS_SHEET=process.env.ACADEMY_EXAM_RESULTS_SHEET_NAME||'EXAM_RESULTS';
const EXAM_ATTEMPTS_SHEET=process.env.ACADEMY_EXAM_ATTEMPTS_SHEET_NAME||'EXAM_ATTEMPTS';
const API_KEY=process.env.GOOGLE_SHEETS_API_KEY||'';
const SERVICE_FILE=process.env.GOOGLE_SERVICE_ACCOUNT_FILE||'/etc/secrets/google-service-account.json';
const GOOGLE_SERVICE_ACCOUNT_JSON_OR_FILE_CONFIGURED=Boolean(String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'').trim()||String(process.env.GOOGLE_SERVICE_ACCOUNT_FILE||'').trim());
const CLIENT_ID=process.env.DISCORD_CLIENT_ID||'';
const CLIENT_SECRET=process.env.DISCORD_CLIENT_SECRET||'';
const REDIRECT=process.env.DISCORD_REDIRECT_URI||'http://localhost:3001/auth/discord/callback';
const FRONTEND=process.env.FRONTEND_URL||'/';
const SESSION_SECRET=String(process.env.SESSION_SECRET||'').trim();
if(!SESSION_SECRET||SESSION_SECRET.length<32)throw new Error('SESSION_SECRET is required and must be at least 32 characters.');
const ADMINS=new Set(String(process.env.ACADEMY_ADMIN_IDS||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>x.replace(/\D/g,'')));
const TTL=Math.max(5000,Number(process.env.SHEET_SYNC_TTL_MS||60000));
const PERMISSIONS={view_dashboard:'لوحة الإدارة',view_activity_logs:'الاطلاع على سجل النشاط وتسجيل الدخول',manage_members:'إدارة الأفراد',manage_roles:'إدارة الرتب',manage_admins:'إدارة الأدمن',manage_applications:'إدارة التقديمات',manage_exams:'إدارة الاختبارات',manage_hierarchy:'إدارة الهيكل',view_evaluations:'الاطلاع على التقييمات',manage_evaluations:'إدارة التقييمات',manage_settings:'الإعدادات'};
const ALL=Object.keys(PERMISSIONS);
const DEFAULT_HIERARCHY=[{id:'president',title:'رئيس الأكاديمية',name:'غير محدد',discordId:'',image:''},{id:'vice',title:'نائب رئيس الأكاديمية',name:'غير محدد',discordId:'',image:''},{id:'assistant',title:'مساعد نائب الرئيس',name:'غير محدد',discordId:'',image:''},{id:'commander',title:'قائد الشرطة',name:'غير محدد',discordId:'',image:''}];
const DEFAULT={version:18,settings:{academyName:'أكاديمية شرطة كيان',applicationsTitle:'التقديم الأولي للشرطة',applicationsDescription:'نموذج التقديم الرسمي للانضمام إلى شرطة كيان.',passingScore:60,logoUrl:'',acceptedMessage:'🎉 مبروك! تم قبولك في «{{batchName}}»\nتم اعتماد طلبك للانضمام إلى أكاديمية شرطة كيان. الخطوة التالية هي الانضمام إلى سيرفر الأكاديمية على Discord لاستكمال إجراءات القبول والتوجيه.',rejectedMessage:'تم رفض طلبك في «{{batchName}}»\nنعتذر، لم يتم قبول طلبك في هذه الدفعة. يمكنك المحاولة مرة أخرى عند فتح دفعة تقديم جديدة، ونتمنى لك التوفيق.',acceptedDiscordUrl:'https://discord.gg/su8PsTY5gJ',evaluationTrainerRanks:[],evaluationTraineeRanks:[]},applicationQuestions:[],questionBank:[],batches:[],applications:[],exams:[],examResults:[],examAttempts:[],evaluations:[],hierarchy:DEFAULT_HIERARCHY,admins:[],audit:[],loginLogs:[],memberImages:{},memberSettings:{},applicationDrafts:{},roleOverrides:{}};
app.use(express.json({limit:'8mb'}));app.use(cookieParser());
let data=structuredClone(DEFAULT),cache={at:0,rows:[]},sheets=null,credentials=null,storageReady=false,lastStorageError='';
let supabaseActive=false,supabaseMigrationPending=false;
const id=v=>String(v??'').replace(/\D/g,'');
const norm=v=>String(v??'').trim().toLowerCase().replace(/[\s_\-#]+/g,'');
const now=()=>Date.now();
const iso=v=>v?new Date(v).toISOString():'';
function validDate(v){return Boolean(v)&&Number.isFinite(new Date(v).getTime())}
function timeState(startAt,endAt){const t=now(),s=validDate(startAt)?new Date(startAt).getTime():null,e=validDate(endAt)?new Date(endAt).getTime():null;if(s&&t<s)return'upcoming';if(e&&t>=e)return'ended';return'open'}
function batchState(b){if(!b||b.status==='closed')return'closed';return timeState(b.startAt,b.endAt)}
function expireBatches(){const expired=[];for(const b of Array.isArray(data.batches)?data.batches:[]){if(b&&b.status==='open'&&timeState(b.startAt,b.endAt)==='ended'){b.status='closed';b.closedAt=b.closedAt||new Date().toISOString();expired.push(b)}}return expired}
async function creds(){if(credentials)return credentials;const raw=String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'').trim()||await fs.readFile(SERVICE_FILE,'utf8');credentials=JSON.parse(raw);return credentials}
function isGoogleClockSkewError(e){const m=String(e?.message||e?.response?.data?.error?.message||e||'').toLowerCase();return m.includes('jwt issued at future')||m.includes('issued at future')||m.includes('token used too early')||m.includes('invalid_grant')&&m.includes('clock')}
async function resetGoogleAuth(){credentials=null;sheets=null}
let googleClockOffsetMs=0,googleClockOffsetAt=0,googleClockQueue=Promise.resolve();
async function getGoogleClockOffset(){
  const forced=Number(process.env.GOOGLE_CLOCK_SKEW_MS);
  if(Number.isFinite(forced)&&forced!==0)return forced;
  if(now()-googleClockOffsetAt<300000)return googleClockOffsetMs;
  try{
    const r=await fetch('https://www.googleapis.com/',{method:'HEAD',signal:AbortSignal.timeout(5000)});
    const serverDate=Date.parse(r.headers.get('date')||'');
    if(Number.isFinite(serverDate)){googleClockOffsetMs=serverDate-Date.now();googleClockOffsetAt=now();console.warn('Google clock offset detected: '+googleClockOffsetMs+'ms')}
  }catch(e){console.warn('Google clock sync probe failed; using local clock:',e.message)}
  return googleClockOffsetMs;
}
async function withGoogleClock(fn){
  const previous=googleClockQueue;
  let release;
  googleClockQueue=new Promise(r=>{release=r});
  await previous;
  const realNow=Date.now;
  const offset=await getGoogleClockOffset();
  try{Date.now=()=>realNow()+offset;return await fn()}
  finally{Date.now=realNow;release()}
}
async function googleRetry(fn,label='Google API'){
  let last;
  for(let attempt=0;attempt<4;attempt++){
    try{return await withGoogleClock(fn)}
    catch(e){
      last=e;
      if(!isGoogleClockSkewError(e)||attempt===3)throw e;
      console.warn(label+': Google clock-skew auth error; resyncing and retrying in '+(1+attempt*2)+'s (attempt '+(attempt+1)+'/4)');
      googleClockOffsetAt=0;
      await resetGoogleAuth();
      await sleep(1000+attempt*2000);
    }
  }
  throw last;
}
async function service(){if(sheets)return sheets;const auth=new google.auth.GoogleAuth({credentials:await creds(),scopes:['https://www.googleapis.com/auth/spreadsheets']});sheets=google.sheets({version:'v4',auth});return sheets}
function hidx(h,cs,f){const a=h.map(norm);for(const c0 of cs){const c=norm(c0),i=a.findIndex(x=>x===c||x.includes(c)||c.includes(x));if(i>=0)return i}return f}
function row(headers,r){const b=hidx(headers,['Badge #','Badge','البادج','الكود'],0),n=hidx(headers,['الاسم','name'],1),l=hidx(headers,['الإجازة','الاجازة','leave'],2),k=hidx(headers,['الرتبة','الرتبه','rank'],3),s=hidx(headers,['الحالة','status'],4),q=hidx(headers,['المسؤولية','المسؤوليه','responsibility'],5),d=hidx(headers,['ديسكورد','discord','discord id','discordid','discord_id'],6),dep=hidx(headers,['القسم','القسم التابع','القطاع','الإدارة','الادارة','الوحدة','الوحده','department','division','sector','unit'],7);const responsibility=String(r[q]??'').trim();return{badge:String(r[b]??'').trim(),code:String(r[b]??'').trim(),name:String(r[n]??'').trim(),leave:String(r[l]??'').trim(),rank:String(r[k]??'').trim(),status:String(r[s]??'').trim().toUpperCase(),responsibility,department:String(r[dep]??'').trim()||responsibility,discordId:id(r[d])}}
async function police(force=false){if(!POLICE_SHEET_ID)throw new Error('POLICE_SHEET_NOT_CONFIGURED');if(!force&&cache.rows.length&&now()-cache.at<TTL)return cache.rows;let last=null;try{const s=await service(),r=await s.spreadsheets.values.get({spreadsheetId:POLICE_SHEET_ID,range:POLICE_RANGE});const v=r.data.values||[],headers=v[0]||[],rows=v.slice(1).map(x=>row(headers,x)).filter(x=>x.discordId||x.name);if(rows.length){cache={at:now(),rows};return rows}last=new Error('POLICE_SHEET_EMPTY')}catch(e){last=e}if(cache.rows.length)return cache.rows;if(API_KEY)try{const u=new URL(`https://sheets.googleapis.com/v4/spreadsheets/${POLICE_SHEET_ID}/values/${encodeURIComponent(POLICE_RANGE)}`);u.searchParams.set('key',API_KEY);const r=await fetch(u,{signal:AbortSignal.timeout(10000)});if(r.ok){const v=(await r.json()).values||[],rows=v.slice(1).map(x=>row(v[0]||[],x)).filter(x=>x.discordId||x.name);if(rows.length){cache={at:now(),rows};return rows}}}catch(e){last=e}throw last||new Error('POLICE_SHEET_UNAVAILABLE')}
async function ensureSheets(s,names=[DATA_SHEET]){if(!DATA_SHEET_ID)throw new Error('ACADEMY_GOOGLE_SHEET_ID_NOT_CONFIGURED');const m=await s.spreadsheets.get({spreadsheetId:DATA_SHEET_ID,fields:'sheets.properties'});const have=new Set((m.data.sheets||[]).map(x=>x.properties?.title));const requests=names.filter(n=>n&&!have.has(n)).map(n=>({addSheet:{properties:{title:n}}}));if(requests.length)try{await s.spreadsheets.batchUpdate({spreadsheetId:DATA_SHEET_ID,requestBody:{requests}})}catch(e){if(!/already exists|alreadyExists|duplicate/i.test(String(e?.message||e)))throw e}}
async function ensureData(s){return ensureSheets(s,[DATA_SHEET])}
async function recoverMissingLegacyCollections(remote){
  const hasCore=Array.isArray(remote?.exams)&&remote.exams.length>0&&Array.isArray(remote?.hierarchy)&&remote.hierarchy.length>0&&Array.isArray(remote?.questionBank)&&remote.questionBank.length>0;
  if(hasCore)return false;
  if(!DATA_SHEET_ID)return false;
  try{
    const s=await service();
    await ensureData(s);
    const r=await s.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:`${DATA_SHEET}!A1:A10000`});
    const raw=(r.data.values||[]).map(x=>String(x?.[0]??'')).join('');
    if(!raw)return false;
    const legacy=JSON.parse(raw);
    const base=structuredClone(DEFAULT);
    let changed=false;
    const arrayKeys=['applicationQuestions','questionBank','batches','applications','exams','examResults','examAttempts','evaluations','hierarchy','admins','audit','loginLogs'];
    for(const key of arrayKeys){
      if((!Array.isArray(remote[key])||remote[key].length===0)&&Array.isArray(legacy[key])&&legacy[key].length){
        remote[key]=legacy[key];
        changed=true;
      }
    }
    const objectKeys=['memberImages','memberSettings','applicationDrafts','roleOverrides'];
    for(const key of objectKeys){
      if((!remote[key]||typeof remote[key]!=='object'||Array.isArray(remote[key])||Object.keys(remote[key]).length===0)&&legacy[key]&&typeof legacy[key]==='object'&&!Array.isArray(legacy[key])){
        remote[key]=legacy[key];
        changed=true;
      }
    }
    const separate=await loadExamStorage(s);
    if((!Array.isArray(remote.exams)||remote.exams.length===0)&&separate.hasSeparate&&Array.isArray(separate.exams)&&separate.exams.length){
      remote.exams=separate.exams; changed=true;
    }
    if((!Array.isArray(remote.examResults)||remote.examResults.length===0)&&separate.hasSeparate&&Array.isArray(separate.results)&&separate.results.length){
      remote.examResults=separate.results; changed=true;
    }
    if((!Array.isArray(remote.examAttempts)||remote.examAttempts.length===0)&&separate.hasSeparate&&Array.isArray(separate.attempts)&&separate.attempts.length){
      remote.examAttempts=separate.attempts; changed=true;
    }
    return changed;
  }catch(e){
    console.error('Legacy recovery skipped:',e.message);
    return false;
  }
}
async function load(){try{
if(supabaseConfigured){const remote=await loadAcademyData();const base=structuredClone(DEFAULT);if(remote){data={...base,...remote,settings:{...base.settings,...(remote.settings||{})}};data.version=18;}else{data=base;console.log('Supabase academy storage is empty; initializing default academy data.');}data.memberImages=data.memberImages&&typeof data.memberImages==='object'&&!Array.isArray(data.memberImages)?data.memberImages:{};data.memberSettings=data.memberSettings&&typeof data.memberSettings==='object'&&!Array.isArray(data.memberSettings)?data.memberSettings:{};data.applicationDrafts=data.applicationDrafts&&typeof data.applicationDrafts==='object'&&!Array.isArray(data.applicationDrafts)?data.applicationDrafts:{};try{const recovered=await recoverMissingLegacyCollections(data);if(recovered)await saveAcademyData(data);}catch(e){console.error('Legacy recovery unavailable; continuing with Supabase:',e.message)}supabaseActive=true;storageReady=true;lastStorageError='';let changed=false;for(const uid of ADMINS)if(!data.admins.some(a=>id(a.discordId)===uid)){data.admins.push({discordId:uid,name:'Super Admin',permissions:ALL,enabled:true,createdAt:new Date().toISOString(),source:'environment'});changed=true}if(changed)await saveAcademyData(data);console.log(remote?'Supabase academy storage ready.':'Supabase academy storage initialized.');return;}await googleRetry(async()=>{const s=await service();await ensureData(s);return true},'Google DATA initialization');const s=await service();const r=await googleRetry(async()=>{const client=await service();return client.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:`${DATA_SHEET}!A1:A1000`})},'Google DATA read');const raw=(r.data.values||[]).map(row=>String(row?.[0]??'')).join('');if(raw){const parsed=JSON.parse(raw);const base=structuredClone(DEFAULT);data={...base,...parsed,settings:{...base.settings,...(parsed.settings||{})}};for(const k of ['applicationQuestions','questionBank','batches','applications','exams','examResults','examAttempts','evaluations','hierarchy','admins','audit','loginLogs'])if(!Array.isArray(data[k]))data[k]=base[k];
// Migrate legacy hierarchy entries that predate explicit level/position fields into the simple row layout.
if(Array.isArray(data.hierarchy)&&data.hierarchy.length>1&&data.hierarchy.every(x=>x?.level==null&&x?.position==null&&x?.order==null)){
  let level=1,pos=1,count=0;
  data.hierarchy=data.hierarchy.map((x,i)=>{if(count>=level){level++;pos=1;count=0}const out={...x,level,position:pos};pos++;count++;return out});
  try{await save()}catch(e){console.error('Hierarchy migration save failed:',e.message)}

if(Array.isArray(data.hierarchy)&&data.hierarchy.length>1){
  const levels=data.hierarchy.map(x=>Number(x?.level)||1);
  const allSame=levels.every(v=>v===levels[0]);
  if(allSame&&levels[0]===1){
    let cursor=0,level=1,slot=0;
    data.hierarchy=data.hierarchy.map(x=>{
      if(slot>=level){level++;slot=0}
      slot++;
      cursor++;
      return {...x,level,position:slot};
    });
    try{await save()}catch(e){console.error('Hierarchy row migration save failed:',e.message)}
  }
}
}data.memberImages=data.memberImages&&typeof data.memberImages==='object'&&!Array.isArray(data.memberImages)?data.memberImages:{};data.memberSettings=data.memberSettings&&typeof data.memberSettings==='object'&&!Array.isArray(data.memberSettings)?data.memberSettings:{};data.applicationDrafts=data.applicationDrafts&&typeof data.applicationDrafts==='object'&&!Array.isArray(data.applicationDrafts)?data.applicationDrafts:{};delete data.settings.applicationEnabled}const previousVersion=Number(data.version||0);
if(previousVersion<17){
  const shiftLegacy=(v)=>{if(!validDate(v))return v;const d=new Date(v);return new Date(d.getTime()+d.getTimezoneOffset()*60*1000).toISOString()};
  for(const b of data.batches||[]){b.startAt=shiftLegacy(b.startAt);b.endAt=shiftLegacy(b.endAt)}
  for(const e of data.exams||[]){e.startAt=shiftLegacy(e.startAt);e.endAt=shiftLegacy(e.endAt)}
  data.version=17;
  try{await save()}catch(e){console.error('Legacy schedule migration save failed:',e.message)}
}else data.version=17;
// Link legacy exam copies to matching master questions without changing their exam-local IDs.
const bankByFingerprint=new Map((data.questionBank||[]).map(q=>[JSON.stringify([q.text,q.type,q.options||[],q.correct,q.required!==false,Number(q.points||1)]),q]));
for(const exam of data.exams||[]){if(!Array.isArray(exam.questions))continue;exam.questions=exam.questions.map(q=>{if(q?.questionBankId)return q;const master=(data.questionBank||[]).find(b=>String(b.id)===String(q?.id))||bankByFingerprint.get(JSON.stringify([q.text,q.type,q.options||[],q.correct,q.required!==false,Number(q.points||1)]));return master?{...q,questionBankId:String(master.id)}:q})}
const separate=await loadExamStorage(s);if(separate.hasSeparate){if(separate.exams)data.exams=separate.exams;if(separate.results)data.examResults=separate.results;if(separate.attempts)data.examAttempts=separate.attempts}else{await saveExamStorage()}storageReady=true;lastStorageError='';let changed=false;for(const uid of ADMINS)if(!data.admins.some(a=>id(a.discordId)===uid)){data.admins.push({discordId:uid,name:'Super Admin',permissions:ALL,enabled:true,createdAt:new Date().toISOString(),source:'environment'});changed=true}if(changed)await save();console.log(`Google DATA storage ready (${DATA_SHEET})`)}catch(e){storageReady=false;lastStorageError=e.message;supabaseMigrationPending=false;console.error('Google DATA storage unavailable:',e.message)}if(supabaseMigrationPending){await saveAcademyData(data);supabaseActive=true;supabaseMigrationPending=false;storageReady=true;lastStorageError='';console.log('Academy data migrated from legacy Google DATA storage to Supabase.');}}
let saveQueue=Promise.resolve();
let mirrorQueue=Promise.resolve();
let lastMirrorAt=0;
let lastMirrorError='';
let mirrorRunning=false;
const DATA_CHUNK_SIZE=30000;
const MIRROR_INTERVAL_MS=Math.max(300000,Number(process.env.GOOGLE_MIRROR_INTERVAL_MS||900000));
const SHEET_WRITE_RETRIES=3;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function sheetsWrite(fn){
  let last;
  for(let attempt=0;attempt<SHEET_WRITE_RETRIES;attempt++){
    try{return await fn()}catch(e){
      last=e;
      const status=Number(e?.code||e?.response?.status||0);
      if(attempt>=SHEET_WRITE_RETRIES-1||![429,500,502,503,504].includes(status))throw e;
      await sleep(500*(2**attempt));
    }
  }
  throw last;
}
async function readJsonSheet(s,name,fallback){
  await ensureSheets(s,[name]);
  const r=await s.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:name+'!A1:A10000'});
  const raw=(r.data.values||[]).map(x=>String(x?.[0]??'')).join('');
  if(!raw)return fallback;
  try{return JSON.parse(raw)}catch(e){console.error('Invalid JSON in '+name+' sheet:',e.message);return fallback}
}
async function writeJsonSheet(s,name,value){
  await ensureSheets(s,[name]);
  const raw=JSON.stringify(value);
  const chunks=[];for(let i=0;i<raw.length;i+=DATA_CHUNK_SIZE)chunks.push(raw.slice(i,i+DATA_CHUNK_SIZE));
  const old=await s.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:name+'!A1:A10000'});
  const oldCount=(old.data.values||[]).filter(r=>String(r?.[0]??'')!=='').length;
  await sheetsWrite(()=>s.spreadsheets.values.update({spreadsheetId:DATA_SHEET_ID,range:name+'!A1:A'+Math.max(1,chunks.length),valueInputOption:'RAW',requestBody:{values:(chunks.length?chunks:['']).map(x=>[x])}}));
  if(oldCount>chunks.length)await sheetsWrite(()=>s.spreadsheets.values.clear({spreadsheetId:DATA_SHEET_ID,range:name+'!A'+(chunks.length+1)+':A'+oldCount}));
}
const EXAM_STORAGE_V2='KAYAN_EXAM_STORAGE_V2';
async function writeExamCollection(s,name,items){
  await ensureSheets(s,[name]);
  const rows=[[EXAM_STORAGE_V2,'id','chunk','total','data']];
  for(const item of Array.isArray(items)?items:[]){
    const raw=JSON.stringify(item),total=Math.max(1,Math.ceil(raw.length/DATA_CHUNK_SIZE)),itemId=String(item?.id||'');
    for(let i=0;i<total;i++)rows.push([EXAM_STORAGE_V2,itemId,i,total,raw.slice(i*DATA_CHUNK_SIZE,(i+1)*DATA_CHUNK_SIZE)]);
  }
  const old=await s.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:name+'!A1:E10000'});
  const oldRows=old.data.values||[];
  await sheetsWrite(()=>s.spreadsheets.values.update({spreadsheetId:DATA_SHEET_ID,range:name+'!A1:E'+Math.max(1,rows.length),valueInputOption:'RAW',requestBody:{values:rows}}));
  if(oldRows.length>rows.length)await sheetsWrite(()=>s.spreadsheets.values.clear({spreadsheetId:DATA_SHEET_ID,range:name+'!A'+(rows.length+1)+':E'+oldRows.length}));
}
async function readExamCollection(s,name){
  await ensureSheets(s,[name]);
  const r=await s.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:name+'!A1:E10000'});
  const rows=r.data.values||[];
  if(!rows.length)return null;
  if(String(rows[0]?.[0]||'')!==EXAM_STORAGE_V2)return readJsonSheet(s,name,null);
  const grouped=new Map();
  for(const row of rows.slice(1)){
    if(row?.[0]!==EXAM_STORAGE_V2)continue;
    const idv=String(row?.[1]||''),idx=Number(row?.[2]||0);
    if(!grouped.has(idv))grouped.set(idv,[]);
    grouped.get(idv)[idx]=String(row?.[4]||'');
  }
  const out=[];
  for(const parts of grouped.values()){
    const raw=parts.filter(v=>v!==undefined).join('');
    try{out.push(JSON.parse(raw))}catch(e){console.error('Invalid V2 exam storage row:',e.message)}
  }
  return out;
}
async function writeExamItem(s,name,item){
  await ensureSheets(s,[name]);
  const idv=String(item?.id||'');
  const raw=JSON.stringify(item);
  const chunks=[];for(let i=0;i<raw.length;i+=DATA_CHUNK_SIZE)chunks.push(raw.slice(i,i+DATA_CHUNK_SIZE));
  const r=await s.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:name+'!A1:E10000'});
  const rows=r.data.values||[],indexes=[];
  for(let i=1;i<rows.length;i++)if(String(rows[i]?.[0]||'')===EXAM_STORAGE_V2&&String(rows[i]?.[1]||'')===idv)indexes.push(i+1);
  const start=indexes.length?indexes[0]:Math.max(2,rows.length+1);
  const values=(chunks.length?chunks:['']).map((x,i)=>[EXAM_STORAGE_V2,idv,i,chunks.length,x]);
  await sheetsWrite(()=>s.spreadsheets.values.update({spreadsheetId:DATA_SHEET_ID,range:name+'!A'+start+':E'+(start+values.length-1),valueInputOption:'RAW',requestBody:{values}}));
  if(indexes.length>values.length)await sheetsWrite(()=>s.spreadsheets.values.clear({spreadsheetId:DATA_SHEET_ID,range:name+'!A'+(start+values.length)+':E'+(start+indexes.length-1)}));
}
async function saveExamStorage(which=['exams','results','attempts'],source=data){
  const s=await service();
  if(which.includes('exams'))await writeExamCollection(s,EXAMS_SHEET,source.exams||[]);
  if(which.includes('results'))await writeExamCollection(s,EXAM_RESULTS_SHEET,source.examResults||[]);
  if(which.includes('attempts'))await writeExamCollection(s,EXAM_ATTEMPTS_SHEET,source.examAttempts||[]);
  storageReady=true;lastStorageError='';
}
let examSaveQueue=Promise.resolve();
function persistExamStorage(which=['exams','results','attempts']){
  // Keep exam mutations responsive; Google Sheets persistence runs in the background.
  if(supabaseActive)return save();
  const job=examSaveQueue.catch(()=>{}).then(()=>saveExamStorage(which));
  examSaveQueue=job.catch(e=>{console.error('Exam storage queue failed:',e.message);lastStorageError=String(e?.message||e)});
  return Promise.resolve({queued:true});
}
async function loadExamStorage(s){
  const exams=await readExamCollection(s,EXAMS_SHEET);
  const results=await readExamCollection(s,EXAM_RESULTS_SHEET);
  const attempts=await readExamCollection(s,EXAM_ATTEMPTS_SHEET);
  return{hasSeparate:Boolean(exams||results||attempts),exams:Array.isArray(exams)?exams:null,results:Array.isArray(results)?results:null,attempts:Array.isArray(attempts)?attempts:null}
}
async function saveToSheet(source=data){const s=await service();await ensureData(s);const core={...source,exams:[],examResults:[],examAttempts:[]};const raw=JSON.stringify(core);const chunks=[];for(let i=0;i<raw.length;i+=DATA_CHUNK_SIZE)chunks.push(raw.slice(i,i+DATA_CHUNK_SIZE));const old=await s.spreadsheets.values.get({spreadsheetId:DATA_SHEET_ID,range:`${DATA_SHEET}!A1:A1000`});const oldCount=(old.data.values||[]).filter(r=>String(r?.[0]??'')!=='').length;await s.spreadsheets.values.update({spreadsheetId:DATA_SHEET_ID,range:`${DATA_SHEET}!A1:A${Math.max(1,chunks.length)}`,valueInputOption:'RAW',requestBody:{values:(chunks.length?chunks:['']).map(x=>[x])}});if(oldCount>chunks.length)await s.spreadsheets.values.clear({spreadsheetId:DATA_SHEET_ID,range:`${DATA_SHEET}!A${chunks.length+1}:A${oldCount}`});storageReady=true;lastStorageError=''}async function mirrorSupabaseToGoogle(reason='periodic'){
  if(!supabaseActive||!DATA_SHEET_ID||mirrorRunning)return false;
  mirrorRunning=true;
  const snapshot=structuredClone(data);
  try{
    await saveToSheet(snapshot);
    await saveExamStorage(['exams','results','attempts'],snapshot);
    lastMirrorAt=Date.now();
    lastMirrorError='';
    console.log('Google third-party mirror synced:',reason);
    return true;
  }catch(e){
    lastMirrorError=String(e?.message||e);
    console.error('Google third-party mirror failed:',lastMirrorError);
    return false;
  }finally{mirrorRunning=false}
}
function queueGoogleMirror(reason='mutation'){
  if(!supabaseActive||!DATA_SHEET_ID)return;
  mirrorQueue=mirrorQueue.catch(()=>{}).then(()=>mirrorSupabaseToGoogle(reason));
}
function save(){
  // Persistence is intentionally queued and non-blocking for API responses.
  // Mutations update the in-memory state first; the queued writer persists the
  // latest snapshot in the background. This prevents successful POST/PATCH/PUT
  // requests from hanging until every academy collection has been mirrored.
  const job=saveQueue.catch(()=>{}).then(async()=>{
    if(supabaseActive){
      await saveAcademyData(data);
      queueGoogleMirror('data-save');
    }else{
      await saveToSheet();
    }
  });
  saveQueue=job.catch(e=>{
    console.error(supabaseActive?'Supabase academy save failed:':'Google DATA save failed:',e.message);
    lastStorageError=String(e?.message||e);
    // Keep the service usable with the current in-memory state. The next
    // mutation will enqueue another persistence attempt.
  });
  return Promise.resolve({queued:true});
}
if(MIRROR_INTERVAL_MS>0){
  setInterval(()=>queueGoogleMirror('scheduled'),MIRROR_INTERVAL_MS).unref?.();
}
function role(r){if(!r)return'citizen';const t=`${r.rank} ${r.responsibility}`.toLowerCase();if(t.includes('مساعد نائب'))return'academy_assistant_vice';if(t.includes('نائب رئيس الأكاديمية'))return'academy_vice_president';if(t.includes('رئيس الأكاديمية'))return'academy_president';if(t.includes('قائد الشرطة'))return'police_commander';if(t.includes('شؤون'))return'affairs';if(isTrainerRank(r))return'trainer';return'officer'}
function isTrainerRank(r){const t=norm(r?.rank||''),senior=['رقيب','رقيبأول','مساعد','ملازم','ملازماول','ملازمتاني','نقيب','رائد','مقدم','عقيد','عميد','لواء','فريق'];return senior.some(x=>t.includes(norm(x)))||String(r?.responsibility||'').includes('مدرب')}
function sess(req){try{return jwt.verify(req.cookies.kayan_session,SESSION_SECRET)}catch{return null}}
function admin(uid){return data.admins.find(a=>id(a.discordId)===id(uid))}
function perms(uid){return ADMINS.has(id(uid))?ALL:(admin(uid)?.enabled?(admin(uid).permissions||[]):[])}
const withTimeout=(promise,ms)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('POLICE_SHEET_TIMEOUT')),ms))]);
async function current(req){const x=sess(req);if(!x)return{x:null,police:null,role:'citizen',admin:false,permissions:[]};const a=admin(x.id),isAdmin=ADMINS.has(id(x.id))||Boolean(a?.enabled);try{const rows=await withTimeout(police(),4000),p=rows.find(r=>id(r.discordId)===id(x.id))||null;return{x,police:p,role:role(p),admin:isAdmin,permissions:perms(x.id),sheet:true}}catch(e){return{x,police:null,role:'unknown',admin:isAdmin,permissions:perms(x.id),sheet:false,error:e.message}}}
async function requireAdmin(req,res,p='view_dashboard'){const c=await current(req);if(!c.x){res.status(401).json({error:'UNAUTHENTICATED'});return null}if(!c.sheet){res.status(503).json({error:'POLICE_SHEET_UNAVAILABLE',retryable:true});return null}if(!storageReady){res.status(503).json({error:'ACADEMY_STORAGE_UNAVAILABLE',retryable:true});return null}if(!c.admin){res.status(403).json({error:'FORBIDDEN'});return null}if(p&&!c.permissions.includes(p)){res.status(403).json({error:'INSUFFICIENT_PERMISSION',permission:p});return null}return c}
function audit(c,a,t,d=''){data.audit.unshift({id:`audit-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,at:new Date().toISOString(),actorId:String(c.x.id),actorName:c.police?.name||c.x.global_name||c.x.username,actorDepartment:c.police?.department||c.police?.responsibility||'',action:a,target:t,details:d});data.audit=data.audit.slice(0,1000)}
function member(r){return{...r,role:role(r),image:data.memberImages?.[r.discordId]||'',profileButtonVisible:data.memberSettings?.[r.discordId]?.showProfileButton!==false}}
async function saved(fn,req,res){const snapshot=structuredClone(data);try{return await fn()}catch(e){data=snapshot;console.error('API mutation failed:',e);if(res.headersSent)return;return res.status(503).json({error:'STORAGE_ERROR',message:'تعذر حفظ البيانات حاليًا. تم التراجع عن العملية ولم تُحفظ بيانات ناقصة.',retryable:true})}}
function cleanQuestion(q){const type=['choice','yesno','text'].includes(q?.type)?q.type:'text';const options=Array.isArray(q?.options)?q.options.map(v=>String(v).trim()).filter(Boolean):[];let correct=q?.correct==null?'':String(q.correct);if(type==='choice'&&!options.includes(correct))correct='';if(type==='yesno'&&!['نعم','لا'].includes(correct))correct='';if(type==='text')correct='';const questionBankId=q?.questionBankId?String(q.questionBankId).trim():'';return{id:String(q?.id||`q-${Date.now()}-${Math.random().toString(36).slice(2,7)}`),text:String(q?.text||'').trim(),type,options,correct,required:q?.required!==false,points:Math.max(1,Number(q?.points||1)),...(questionBankId?{questionBankId}: {})}}
const EXAM_ACCESS=['all','police','link','specific'];
function cleanExam(e){const questions=Array.isArray(e?.questions)?e.questions.map(cleanQuestion):[],accessType=EXAM_ACCESS.includes(e?.accessType)?e.accessType:'police';const accessToken=accessType==='link'?(String(e?.accessToken||'').trim()||crypto.randomBytes(18).toString('base64url')):'';const allowedDiscordIds=accessType==='specific'?(Array.isArray(e?.allowedDiscordIds)?e.allowedDiscordIds.map(id).filter(Boolean):[]):[];return{id:String(e?.id||`exam-${Date.now()}`),title:String(e?.title||'اختبار جديد'),description:String(e?.description||''),stage:String(e?.stage||'عام'),accessType,accessToken,allowedDiscordIds,passingScore:Math.max(1,Math.min(100,Number(e?.passingScore||60))),durationMinutes:Math.max(1,Number(e?.durationMinutes||30)),attemptsAllowed:Math.max(1,Number(e?.attemptsAllowed||1)),startAt:validDate(e?.startAt)?iso(e.startAt):null,endAt:validDate(e?.endAt)?iso(e.endAt):null,active:e?.active!==false,resultPublished:e?.resultPublished===true,resultAnswersPublished:e?.resultAnswersPublished===true,createdAt:e?.createdAt||new Date().toISOString(),questions}}
function shuffleQuestions(list){const a=[...(Array.isArray(list)?list:[])];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function orderedExam(e,attempt){const ids=Array.isArray(attempt?.questionOrder)?attempt.questionOrder.map(String):[];const by=new Map((e.questions||[]).map(q=>[String(q.id),q]));const ordered=ids.length?ids.map(id=>by.get(id)).filter(Boolean):shuffleQuestions(e.questions||[]);return publicExam({...e,questions:ordered})}
function scoreAttempt(e,answers){let earned=0,total=0;for(const q of e.questions||[]){const p=Number(q.points||1);total+=p;if((q.type==='choice'||q.type==='yesno')&&String(answers?.[q.id]??'')===String(q.correct??''))earned+=p}return total?Math.round(earned/total*100):0}
let expiryJobRunning=false;
async function finalizeExpiredAttempts(){if(expiryJobRunning)return;expiryJobRunning=true;try{const t=now(),changed=[];for(const a of data.examAttempts||[]){if(a?.submittedAt||a?.status==='submitted'||a?.status==='expired')continue;if(!a.expiresAt||t<new Date(a.expiresAt).getTime())continue;const e=data.exams.find(x=>x.id===a.examId);if(!e)continue;const answers=a.answers&&typeof a.answers==='object'?a.answers:{};const submittedAt=new Date(a.expiresAt).toISOString();const score=scoreAttempt(e,answers);const activeBase=Math.max(0,Number(a.activeDurationSeconds||0));const activeStart=a.activeStartedAt?new Date(a.activeStartedAt).getTime():new Date(a.startedAt).getTime();const activeEnd=Math.min(new Date(submittedAt).getTime(),new Date(a.expiresAt).getTime());const activeDurationSeconds=activeBase+Math.max(0,Math.round((activeEnd-activeStart)/1000));a.activeDurationSeconds=activeDurationSeconds;const r={id:'result-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'),examId:e.id,userId:String(a.userId),name:String(a.name||'متقدم'),score,passed:score>=Number(e.passingScore||60),submittedAt,answers,durationSeconds:activeDurationSeconds,autoSubmitted:true};a.submittedAt=submittedAt;a.status='expired';a.expired=true;a.score=score;data.examResults.unshift(r);changed.push(a)}if(changed.length)await persistExamStorage(['results','attempts'])}finally{expiryJobRunning=false}}
function examAllowed(e,c,token=''){if(!c?.x)return false;if(e.accessType==='all')return true;if(e.accessType==='police')return Boolean(c.police);if(e.accessType==='specific')return e.allowedDiscordIds?.includes(id(c.x.id));if(e.accessType==='link')return Boolean(token&&String(token)===String(e.accessToken));return false}
function publicExam(e){const questions=(Array.isArray(e?.questions)?e.questions:[]).map(cleanQuestion).filter(q=>q.text).map(q=>({id:q.id,text:q.text,type:q.type,options:q.options||[],required:q.required!==false,points:q.points}));return{...e,state:timeState(e?.startAt,e?.endAt),accessToken:undefined,allowedDiscordIds:undefined,questions}}
function cloneQuestion(q){return cleanQuestion({...q,id:`q-${Date.now()}-${Math.random().toString(36).slice(2,8)}`})}
app.get('/api/health',async(_q,res)=>{
  let p=false;try{await police();p=true}catch{}
  res.json({
    ok:true,
    sheetConfigured:Boolean(POLICE_SHEET_ID),
    policeSheetConfigured:p,
    discordConfigured:Boolean(CLIENT_ID&&CLIENT_SECRET),
    sessionConfigured:true,
    persistentAcademyConfigured:storageReady,
    storageMode:supabaseActive?'supabase':(storageReady?'google':'unavailable'),
    storageError:storageReady?'':lastStorageError,
    googleMirrorConfigured:Boolean(DATA_SHEET_ID&&GOOGLE_SERVICE_ACCOUNT_JSON_OR_FILE_CONFIGURED),
    googleMirrorLastSync:lastMirrorAt?new Date(lastMirrorAt).toISOString():null,
    googleMirrorError:lastMirrorError||null,
    adminConfigured:ADMINS.size>0||data.admins.some(a=>a.enabled),
    academyDataSheetId:DATA_SHEET_ID,
    academyDataSheetName:DATA_SHEET
  })
});app.get('/api/me',async(req,res)=>{const c=await current(req);if(!c.x)return res.json({authenticated:false,role:'citizen',permissions:{isCitizen:true,isOfficer:false,isAdmin:false,adminPermissions:[],canViewEvaluations:false}});if(!c.sheet)return res.json({authenticated:true,identityPending:true,discord:c.x,police:null,role:'unknown',permissions:{isCitizen:false,isOfficer:false,isAdmin:c.admin,adminPermissions:c.permissions,canViewEvaluations:false}});const officer=Boolean(c.police);res.json({authenticated:true,identityPending:false,discord:c.x,police:c.police?{name:c.police.name,rank:c.police.rank,code:c.police.code,badge:c.police.badge,status:c.police.status,responsibility:c.police.responsibility,department:c.police.department||c.police.responsibility||'',leave:c.police.leave,discordId:c.police.discordId,image:data.memberImages?.[c.police.discordId]||''}:null,role:officer?c.role:'citizen',permissions:{isCitizen:!officer,isOfficer:officer,isAdmin:c.admin,adminPermissions:c.permissions,canViewEvaluations:c.admin&&c.permissions.includes('view_evaluations')}})});
app.get('/api/public/hierarchy',(_q,res)=>res.json({hierarchy:data.hierarchy||DEFAULT_HIERARCHY}));
app.get('/api/public/academy',async(_q,res)=>{const expired=expireBatches();if(expired.length)await save().catch(e=>console.error('Auto-close save failed:',e.message));const batches=Array.isArray(data.batches)?data.batches:[];
// Public applications must always follow the currently open batch, never simply the newest/first batch.
// If no batch is open yet, show the next explicitly opened/scheduled batch (earliest start time).
const eligible=batches.filter(x=>x&&x.status==='open').map(x=>({...x,state:batchState(x)}));
const openBatch=eligible.filter(x=>x.state==='open').sort((a,b)=>new Date(a.startAt||0)-new Date(b.startAt||0))[0];
const upcomingBatch=eligible.filter(x=>x.state==='upcoming').sort((a,b)=>new Date(a.startAt||0)-new Date(b.startAt||0))[0];
const b=openBatch||upcomingBatch||null;
const state=b?.state||null;const questions=(Array.isArray(data.applicationQuestions)?data.applicationQuestions:[]).map(cleanQuestion).filter(q=>q.text).map(q=>({id:q.id,text:q.text,type:q.type,options:q.options||[],required:q.required!==false}));res.json({settings:{...(data.settings||{}),logoUrl:data.settings?.logoUrl||''},application:{enabled:state==='open',title:data.settings?.applicationsTitle||'التقديم الأولي للشرطة',description:data.settings?.applicationsDescription||'نموذج التقديم الرسمي للانضمام إلى شرطة كيان.',passingScore:Number(data.settings?.passingScore||60),questions},batch:b?{id:b.id,name:b.name,startAt:b.startAt,endAt:b.endAt,state}:null})});
app.get('/api/public/exams',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});await finalizeExpiredAttempts();const token=String(req.query.token||''),exams=data.exams.filter(e=>e.active&&examAllowed(e,c,token)).map(publicExam);res.json({exams})});
app.get('/api/academy/members',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});if(!c.sheet)return res.status(503).json({error:'POLICE_SHEET_UNAVAILABLE',retryable:true});res.json({members:(await police()).map(member)})});
app.get('/api/me/member-settings',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});if(!c.sheet||!c.police)return res.status(403).json({error:'OFFICER_ONLY'});const s=data.memberSettings?.[c.police.discordId]||{};res.json({showProfileButton:s.showProfileButton!==false})});
app.put('/api/me/member-settings',(req,res)=>saved(async()=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});if(!c.sheet||!c.police)return res.status(403).json({error:'OFFICER_ONLY'});const showProfileButton=req.body?.showProfileButton!==false;data.memberSettings[c.police.discordId]={...(data.memberSettings[c.police.discordId]||{}),showProfileButton};audit(c,'UPDATE_MEMBER_PROFILE_SETTINGS',c.police.discordId,`showProfileButton=${showProfileButton}`);await save();res.json({ok:true,showProfileButton})},req,res));
app.get('/api/my/applications',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});const applications=data.applications.filter(a=>a.discordId===String(c.x.id)).map(a=>{const b=data.batches.find(x=>x.id===a.batchId);return{...a,batchName:b?.name||'دفعة غير محددة'}});res.json({applications})});
app.get('/api/my/exams',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});await finalizeExpiredAttempts();const uid=String(c.x.id),t=now();const results=data.examResults.filter(r=>r.userId===uid).filter(r=>data.exams.find(e=>e.id===r.examId)?.resultPublished===true).map(r=>{const e=data.exams.find(x=>x.id===r.examId);return{id:r.id,examId:r.examId,examTitle:e?.title||'اختبار',stage:e?.stage||'عام',passingScore:e?.passingScore||60,score:r.score,passed:r.passed,submittedAt:r.submittedAt,durationSeconds:r.durationSeconds||0,autoSubmitted:Boolean(r.autoSubmitted),answers:e?.resultAnswersPublished===true?(r.answers||{}):undefined,review:e?.resultAnswersPublished===true?(e.questions||[]).map(q=>({id:q.id,text:q.text,type:q.type,correct:q.correct||'',answer:String(r.answers?.[q.id]??'')})):undefined}});const submittedExamIds=[...new Set((data.examResults||[]).filter(r=>r.userId===uid).map(r=>String(r.examId)))];const attempts=(data.examAttempts||[]).filter(a=>{if(a.userId!==uid||a.submittedAt)return false;if(submittedExamIds.includes(String(a.examId)))return false;const resumeAt=validDate(a.resumeAt)?new Date(a.resumeAt).getTime():null;const resumeUntil=validDate(a.resumeUntil)?new Date(a.resumeUntil).getTime():null;if(resumeAt&&t<resumeAt)return false;if(resumeUntil&&t>=resumeUntil)return false;return !a.expiresAt||t<new Date(a.expiresAt).getTime()}).map(a=>({id:a.id,examId:a.examId,startedAt:a.startedAt,expiresAt:a.expiresAt,status:a.status,resumeAt:a.resumeAt||null,resumeUntil:a.resumeUntil||null,answers:a.answers||{},questionOrder:a.questionOrder||[]}));res.json({results,attempts,submittedExamIds})});
app.post('/api/me/member-image',(req,res)=>saved(async()=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});if(!c.sheet||!c.police)return res.status(403).json({error:'OFFICER_ONLY'});const image=String(req.body?.image||'');if(!/^data:image\/(png|jpeg|webp);base64,/i.test(image))return res.status(400).json({error:'IMAGE_FORMAT_REQUIRED'});if(image.length>180000)return res.status(413).json({error:'IMAGE_TOO_LARGE'});data.memberImages[c.police.discordId]=image;audit(c,'UPDATE_OWN_MEMBER_IMAGE',c.police.discordId);await save();res.json({ok:true,image})},req,res));
app.post('/api/applications',(req,res)=>saved(async()=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});let applicantPolice=c.police;if(!applicantPolice){try{const rows=await police(true);applicantPolice=rows.find(r=>id(r.discordId)===id(c.x.id))||null}catch(_e){applicantPolice=null}}if(applicantPolice)return res.status(403).json({error:'OFFICERS_CANNOT_APPLY'});const expired=expireBatches();if(expired.length)await save();const b=data.batches.find(x=>x.status==='open');if(!b)return res.status(409).json({error:'APPLICATIONS_CLOSED'});const state=batchState(b);if(state!=='open')return res.status(409).json({error:state==='upcoming'?'APPLICATIONS_NOT_STARTED':'APPLICATIONS_ENDED'});if(data.applications.some(a=>a.batchId===b.id&&a.discordId===String(c.x.id)))return res.status(409).json({error:'ALREADY_SUBMITTED'});const answers=req.body?.answers||{};for(const q of data.applicationQuestions||[])if(q.required&&String(answers[q.id]??'').trim()==='')return res.status(400).json({error:'REQUIRED_QUESTION_MISSING',questionId:q.id});delete data.applicationDrafts[String(c.x.id)];const a={id:`app-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,batchId:b.id,discordId:String(c.x.id),name:c.x.global_name||c.x.username||'متقدم',submittedAt:new Date().toISOString(),status:'pending',answers,history:[]};data.applications.unshift(a);await save();res.json({ok:true,application:a})},req,res));
app.get('/api/applications/draft',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});const uid=String(c.x.id),d=data.applicationDrafts?.[uid];if(!d||now()-new Date(d.updatedAt||d.createdAt||0).getTime()>30*60*1000){if(d){delete data.applicationDrafts[uid];await save().catch(()=>{})}return res.json({draft:null})}res.json({draft:d})});
app.put('/api/applications/draft',(req,res)=>saved(async()=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});const uid=String(c.x.id),answers=req.body?.answers&&typeof req.body.answers==='object'?req.body.answers:{};data.applicationDrafts[uid]={userId:uid,answers,createdAt:data.applicationDrafts?.[uid]?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};res.json({ok:true,updatedAt:data.applicationDrafts[uid].updatedAt})},req,res));
app.post('/api/exams/:id/start',(req,res)=>saved(async()=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});await finalizeExpiredAttempts();const e=data.exams.find(x=>x.id===req.params.id&&x.active);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const token=String(req.body?.accessToken||req.query.token||'');if(!examAllowed(e,c,token))return res.status(403).json({error:'EXAM_ACCESS_DENIED'});const uid=String(c.x.id),allowed=Math.max(1,Number(e.attemptsAllowed||1)),attempts=data.examAttempts.filter(a=>a.examId===e.id&&a.userId===uid);let attempt=attempts.find(a=>!a.submittedAt);if(attempt){const isAdminResume=attempt.status==='paused'&&Boolean(attempt.resumeAt);if(attempt.resumeAt&&now()<new Date(attempt.resumeAt).getTime())return res.status(409).json({error:'EXAM_RESUME_NOT_STARTED'});if(attempt.resumeUntil&&now()>=new Date(attempt.resumeUntil).getTime()){attempt.expiresAt=new Date(attempt.resumeUntil).toISOString();await finalizeExpiredAttempts();return res.status(409).json({error:'EXAM_TIME_EXPIRED'})}if(!isAdminResume){const state=timeState(e.startAt,e.endAt);if(state==='upcoming')return res.status(409).json({error:'EXAM_NOT_STARTED'});if(state==='ended')return res.status(409).json({error:'EXAM_ENDED'})}return res.json({ok:true,attempt,exam:orderedExam(e,attempt)})}const state=timeState(e.startAt,e.endAt);if(state==='upcoming')return res.status(409).json({error:'EXAM_NOT_STARTED'});if(state==='ended')return res.status(409).json({error:'EXAM_ENDED'});if(data.examResults.some(r=>r.examId===e.id&&r.userId===uid))return res.status(409).json({error:'EXAM_ALREADY_SUBMITTED'});if(attempts.length>=allowed)return res.status(409).json({error:'EXAM_ATTEMPTS_EXHAUSTED'});const started=new Date(),duration=Math.max(1,Number(e.durationMinutes||30))*60000,endWindow=validDate(e.endAt)?new Date(e.endAt).getTime():Infinity,expiresAt=new Date(Math.min(started.getTime()+duration,endWindow)).toISOString(),ordered=shuffleQuestions(e.questions||[]);attempt={id:'attempt-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'),examId:e.id,userId:uid,name:c.police?.name||c.x.global_name||c.x.username||'متقدم',startedAt:started.toISOString(),expiresAt,submittedAt:null,status:'active',accessToken:e.accessType==='link'?token:'',answers:{},questionOrder:ordered.map(q=>String(q.id)),examSnapshot:structuredClone(e),activeStartedAt:started.toISOString(),activeDurationSeconds:0,lastSavedAt:started.toISOString()};data.examAttempts.push(attempt);await persistExamStorage(['attempts']);res.json({ok:true,attempt,exam:orderedExam(e,attempt)})},req,res));app.post('/api/exams/:id/submit',(req,res)=>saved(async()=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});const e=data.exams.find(x=>x.id===req.params.id&&x.active);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const uid=String(c.x.id),attempt=data.examAttempts.find(x=>x.examId===e.id&&x.userId===uid&&!x.submittedAt),token=String(req.body?.accessToken||req.query.token||attempt?.accessToken||'');if(!examAllowed(e,c,token))return res.status(403).json({error:'EXAM_ACCESS_DENIED'});if(data.examResults.some(r=>r.examId===e.id&&r.userId===uid))return res.status(409).json({error:'EXAM_ALREADY_SUBMITTED'});if(!attempt)return res.status(409).json({error:'EXAM_NOT_STARTED'});const examForAttempt=attempt.examSnapshot||e;const answers={...(attempt.answers||{}),...(req.body?.answers||{})};for(const q of examForAttempt.questions||[])answers[q.id]=String(answers[q.id]??'').slice(0,5000);const expired=(attempt.expiresAt&&now()>=new Date(attempt.expiresAt).getTime())||(e.endAt&&now()>=new Date(e.endAt).getTime());if(!expired)for(const q of examForAttempt.questions||[])if(String(answers[q.id]??'').trim()==='')return res.status(400).json({error:'REQUIRED_QUESTION_MISSING'});const submittedAt=new Date().toISOString(),score=scoreAttempt(examForAttempt,answers),activeBase=Math.max(0,Number(attempt.activeDurationSeconds||0)),activeStart=attempt.activeStartedAt?new Date(attempt.activeStartedAt).getTime():new Date(attempt.startedAt).getTime(),activeEnd=expired&&attempt.expiresAt?Math.min(new Date(submittedAt).getTime(),new Date(attempt.expiresAt).getTime()):new Date(submittedAt).getTime(),activeDurationSeconds=activeBase+Math.max(0,Math.round((activeEnd-activeStart)/1000));attempt.activeDurationSeconds=activeDurationSeconds;const r={id:'result-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'),examId:e.id,userId:uid,name:attempt.name||c.police?.name||c.x.global_name||c.x.username||'متقدم',score,passed:score>=Number(e.passingScore||60),submittedAt,answers,durationSeconds:activeDurationSeconds,autoSubmitted:Boolean(expired)};attempt.answers=answers;attempt.submittedAt=submittedAt;attempt.status=expired?'expired':'submitted';attempt.expired=expired;attempt.score=score;for(const other of data.examAttempts||[]){if(other!==attempt&&other.examId===e.id&&other.userId===uid&&!other.submittedAt){other.submittedAt=submittedAt;other.status='superseded';other.superseded=true;}}data.examResults.unshift(r);await persistExamStorage(['results','attempts']);res.json({ok:true,result:r,autoSubmitted:expired,submitted:true,reviewPending:!e.resultPublished})},req,res));
app.put('/api/exams/:id/attempt',(req,res)=>saved(async()=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});const e=data.exams.find(x=>x.id===req.params.id&&x.active);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const uid=String(c.x.id),attempt=data.examAttempts.find(x=>x.examId===e.id&&x.userId===uid&&!x.submittedAt);if(!attempt)return res.status(409).json({error:'EXAM_NOT_STARTED'});const examForAttempt=attempt.examSnapshot||e;const token=String(req.body?.accessToken||req.query.token||attempt.accessToken||'');if(!examAllowed(e,c,token))return res.status(403).json({error:'EXAM_ACCESS_DENIED'});if(now()>=new Date(attempt.expiresAt).getTime())return res.status(409).json({error:'EXAM_TIME_EXPIRED'});const answers=req.body?.answers&&typeof req.body.answers==='object'?req.body.answers:{};attempt.answers=Object.fromEntries(Object.entries(answers).map(([k,v])=>[k,String(v??'').slice(0,5000)]));attempt.lastSavedAt=new Date().toISOString();await persistExamStorage(['attempts']);res.json({ok:true,lastSavedAt:attempt.lastSavedAt})},req,res));

// Evaluation system: rank-gated trainer/trainee reports, with optional confidential complaint.
app.get('/api/evaluations/config',async(req,res)=>{
  const c=await current(req); if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});
  let members=[]; try{members=(await police()).map(r=>({badge:r.badge,name:r.name,rank:r.rank,discordId:r.discordId,code:r.code,responsibility:r.responsibility}));}catch{}
  const settings=data.settings||{}, me=c.police;
  const trainerRanks=Array.isArray(settings.evaluationTrainerRanks)?settings.evaluationTrainerRanks:[];
  const traineeRanks=Array.isArray(settings.evaluationTraineeRanks)?settings.evaluationTraineeRanks:[];
  const isTrainer=Boolean(me&&trainerRanks.includes(me.rank));
  const isTrainee=Boolean(me&&traineeRanks.includes(me.rank));
  const roles=[]; if(isTrainer)roles.push({value:'trainer',label:'تقييم متدرب'}); if(isTrainee)roles.push({value:'trainee',label:'تقييم مدرب'});
  res.json({enabled:roles.length>0,role:roles.length===1?roles[0].value:null,roles,trainerRanks,traineeRanks,members});
});
app.post('/api/evaluations',async(req,res)=>{
  const c=await current(req); if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});
  if(!c.police)return res.status(403).json({error:'OFFICER_ONLY'});
  const settings=data.settings||{},trainerRanks=Array.isArray(settings.evaluationTrainerRanks)?settings.evaluationTrainerRanks:[],traineeRanks=Array.isArray(settings.evaluationTraineeRanks)?settings.evaluationTraineeRanks:[];
  const fromRank=String(c.police.rank||''),requestedRole=String(req.body?.evaluationRole||'');
  const type=requestedRole==='trainer'?'trainer_to_trainee':requestedRole==='trainee'?'trainee_to_trainer':trainerRanks.includes(fromRank)?'trainer_to_trainee':traineeRanks.includes(fromRank)?'trainee_to_trainer':'';
  if((type==='trainer_to_trainee'&&!trainerRanks.includes(fromRank))||(type==='trainee_to_trainer'&&!traineeRanks.includes(fromRank)))return res.status(403).json({error:'EVALUATION_NOT_ALLOWED'});
  const targetId=id(req.body?.targetDiscordId),targetIdStr=String(targetId),target=targetId?(await police()).find(x=>id(x.discordId)===targetId):null;
  if(!target)return res.status(400).json({error:'EVALUATION_TARGET_REQUIRED'});
  if(type==='trainer_to_trainee'&&!traineeRanks.includes(target.rank))return res.status(400).json({error:'INVALID_TRAINEE_TARGET'});
  if(type==='trainee_to_trainer'&&!trainerRanks.includes(target.rank))return res.status(400).json({error:'INVALID_TRAINER_TARGET'});
  if(targetIdStr===id(c.x.id))return res.status(400).json({error:'EVALUATION_SELF_FORBIDDEN'});
  const ratingKeys=type==='trainer_to_trainee'?['driving','citizens','devices','calls','weapons']:['trainingQuality','explanation','communication','fairness','knowledge','professionalism'];
  const ratings={}; for(const k of ratingKeys){const n=Number(req.body?.ratings?.[k]||0);if(n<1||n>10)return res.status(400).json({error:'EVALUATION_RATINGS_REQUIRED'});ratings[k]=n}
  const overall=type==='trainer_to_trainee'?Number(req.body?.overallRating||0):Math.round(ratingKeys.reduce((a,k)=>a+ratings[k],0)/ratingKeys.length*10)/10;
  if(type==='trainer_to_trainee'&&(overall<1||overall>10))return res.status(400).json({error:'EVALUATION_RATINGS_REQUIRED'});
  const complaint=String(req.body?.complaint||'').trim().slice(0,5000);
  const e={id:'eval-'+Date.now()+'-'+crypto.randomBytes(3).toString('hex'),type,fromDiscordId:String(c.x.id),fromName:c.police.name,fromRank:c.police.rank,targetDiscordId:target.discordId,targetName:target.name,targetRank:target.rank,trainerName:type==='trainer_to_trainee'?c.police.name:target.name,traineeName:type==='trainer_to_trainee'?target.name:c.police.name,ratings,overallRating:overall,rating:overall,hours:type==='trainer_to_trainee'?Math.max(0,Number(req.body?.hours||0)):0,notes:String(req.body?.notes||'').trim().slice(0,5000),sameTrainer:type==='trainee_to_trainer'?Boolean(req.body?.sameTrainer):false,complaint:complaint||'',hasComplaint:Boolean(complaint),status:'pending',createdAt:new Date().toISOString(),review:null};
  data.evaluations.unshift(e);audit(c,'SUBMIT_EVALUATION',e.id,type+(complaint?' · complaint':''));
  try{await save();}catch(err){data.evaluations=data.evaluations.filter(x=>x.id!==e.id);return res.status(503).json({error:'STORAGE_ERROR'})}
  res.json({ok:true,evaluation:e});
});
app.patch('/api/admin/evaluations/:id/review',(req,res)=>saved(async()=>{
  const c=await requireAdmin(req,res,'manage_evaluations'); if(!c)return;
  const e=data.evaluations.find(x=>x.id===req.params.id); if(!e)return res.status(404).json({error:'EVALUATION_NOT_FOUND'});
  const status=String(req.body?.status||''); if(!['pending','approved','rejected','investigation'].includes(status))return res.status(400).json({error:'INVALID_EVALUATION_STATUS'});
  e.status=status;e.review={at:new Date().toISOString(),by:String(c.x.id),byName:c.police?.name||c.x.global_name||c.x.username,note:String(req.body?.note||'').slice(0,5000)};
  const investigationTarget=e.targetDiscordId;
  e.investigationTarget=status==='investigation'?investigationTarget:null;
  audit(c,'REVIEW_EVALUATION',e.id,status+(e.investigationTarget?':'+e.investigationTarget:''));
  await save();res.json({ok:true,evaluation:e});
},req,res));

app.get('/api/evaluations',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});if(!c.admin)return res.status(403).json({error:'FORBIDDEN'});if(!c.permissions.includes('view_evaluations')&&!c.permissions.includes('manage_evaluations'))return res.status(403).json({error:'INSUFFICIENT_PERMISSION'});res.json({evaluations:data.evaluations,canViewAll:true})});
app.get('/api/admin/state',async(req,res)=>{const c=await requireAdmin(req,res);if(!c)return;const expired=expireBatches();if(expired.length)await save().catch(e=>console.error('Auto-close save failed:',e.message));const batches=(data.batches||[]).map(b=>({...b,state:batchState(b)}));res.json({settings:data.settings,applicationQuestions:data.applicationQuestions,questionBank:data.questionBank,batches,applications:data.applications,exams:data.exams,examResults:data.examResults,examAttempts:data.examAttempts,evaluations:data.evaluations,hierarchy:data.hierarchy,admins:data.admins,permissions:PERMISSIONS,members:(await police()).map(member)})});
app.get('/api/admin/person-history',async(req,res)=>{const c=await requireAdmin(req,res,'view_activity_logs');if(!c)return;const q=String(req.query?.q||'').trim().toLowerCase();if(!q)return res.status(400).json({error:'PERSON_QUERY_REQUIRED'});const rows=Array.isArray(await police())?await police():[];const people=rows.map(member);const ids=people.filter(p=>[p.name,p.badge,p.discordId,p.rank,p.code,p.department,p.responsibility].some(v=>String(v??'').toLowerCase().includes(q))).map(p=>id(p.discordId));const has=x=>{const vals=[x.actorId,x.discordId,x.userId,x.fromDiscordId,x.targetDiscordId,x.name,x.actorName,x.fromName,x.targetName,x.badge,x.username,x.details,x.target];return vals.some(v=>{const z=String(v??'').toLowerCase();return z.includes(q)||ids.includes(id(v))})};const examById=new Map((data.exams||[]).map(x=>[String(x.id),x]));const batchById=new Map((data.batches||[]).map(x=>[String(x.id),x]));const timeline=[...(data.loginLogs||[]).filter(has).map(x=>({at:x.at,type:'login',title:'تسجيل دخول عبر Discord',actorName:x.name||'',actorId:x.discordId,details:x.username?'@'+x.username:'',raw:x})),...(data.audit||[]).filter(has).map(x=>({at:x.at,type:'audit',title:x.action||'نشاط إداري',actorName:x.actorName||'',actorId:x.actorId,details:x.details||'',target:x.target,raw:x})),...(data.applications||[]).filter(has).map(x=>({at:x.submittedAt||x.createdAt||x.at,type:'application',title:'تقديم طلب',actorName:x.name||'',actorId:x.discordId,details:`الحالة: ${x.status||'—'}${batchById.get(String(x.batchId))?.name?' · '+batchById.get(String(x.batchId)).name:''}`,raw:x})),...(data.examAttempts||[]).filter(has).map(x=>({at:x.startedAt||x.createdAt,type:'exam_attempt',title:'محاولة اختبار',actorId:x.userId,details:examById.get(String(x.examId))?.title||String(x.examId),raw:x})),...(data.examResults||[]).filter(has).map(x=>({at:x.submittedAt||x.createdAt,type:'exam_result',title:'نتيجة/تسليم اختبار',actorId:x.userId,details:`${examById.get(String(x.examId))?.title||x.examId} · ${x.score??'—'}%`,raw:x})),...(data.evaluations||[]).filter(has).map(x=>({at:x.createdAt,type:'evaluation',title:x.type==='trainer_to_trainee'?'تقييم مدرب لمتدرب':'تقييم متدرب لمدرب',actorName:x.fromName||'',actorId:x.fromDiscordId,details:`الهدف: ${x.targetName||x.targetDiscordId||'—'} · التقييم: ${x.overallRating??x.rating??'—'}/10 · الحالة: ${x.status||'pending'}`,raw:x}))].filter(x=>x.at).sort((a,b)=>new Date(b.at)-new Date(a.at)).slice(0,1000);const matched=people.filter(p=>ids.includes(id(p.discordId))).slice(0,20).map(p=>({discordId:p.discordId,name:p.name,badge:p.badge,rank:p.rank,department:p.department||p.responsibility||'',image:p.image||''}));res.json({people:matched,timeline,total:timeline.length})});
app.get('/api/admin/activity-state',async(req,res)=>{
 const c=await requireAdmin(req,res,'view_activity_logs');if(!c)return;
 const rows=Array.isArray(await police())?await police():[];
 const byId=new Map(rows.map(x=>[id(x.discordId),x]));
 const batchById=new Map((data.batches||[]).map(x=>[String(x.id),x]));
 const examById=new Map((data.exams||[]).map(x=>[String(x.id),x]));
 const appById=new Map((data.applications||[]).map(x=>[String(x.id),x]));
 const evalById=new Map((data.evaluations||[]).map(x=>[String(x.id),x]));
 const targetInfo=(x)=>{
   const raw=String(x.target||'');
   let targetLabel=raw||'النظام',targetId=raw||'',targetDepartment='';
   const action=String(x.action||'');
   if(action.includes('BATCH')){
     const b=batchById.get(raw);if(b){targetLabel=`دفعة «${b.name||raw}»`;targetId=raw}
   }else if(action.includes('EXAM')){
     const examId=raw.split(':')[0],e=examById.get(examId);
     if(e){const uid=raw.split(':')[1];const p=uid?byId.get(id(uid)):null;targetLabel=p?`اختبار «${e.title||examId}» — ${p.name||uid}`:`اختبار «${e.title||examId}»`;targetDepartment=p?.department||p?.responsibility||'';targetId=raw}
   }else if(action.includes('APPLICATION')){
     const a=appById.get(raw);if(a){const b=batchById.get(a.batchId);targetLabel=`طلب «${a.name||a.discordId||raw}»${b?.name?` — ${b.name}`:''}`;targetDepartment=byId.get(id(a.discordId))?.department||byId.get(id(a.discordId))?.responsibility||''}
   }else if(action.includes('EVALUATION')){
     const e=evalById.get(raw);if(e){const uid=e.targetDiscordId||e.targetId||e.traineeDiscordId||e.trainerDiscordId||e.discordId;const p=uid?byId.get(id(uid)):null;targetLabel=p?`تقييم «${p.name||uid}»`:`تقييم «${raw}»`;targetDepartment=p?.department||p?.responsibility||''}
   }else if(action.includes('MEMBER')||action.includes('IMAGE')){
     const p=byId.get(id(raw));if(p){targetLabel=`الفرد «${p.name||raw}»`;targetDepartment=p.department||p.responsibility||''}
   }else if(action==='UPDATE_HIERARCHY')targetLabel='هيكل الأكاديمية';
   else if(action==='UPDATE_QUESTION_BANK')targetLabel='فهرس الأسئلة';
   else if(action==='UPDATE_SETTINGS')targetLabel='إعدادات النظام';
   return {...x,targetLabel,targetId,targetDepartment};
 };
 const audit=(Array.isArray(data.audit)?data.audit:[]).map(targetInfo).sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,1000);
 const loginLogs=(Array.isArray(data.loginLogs)?data.loginLogs:[]).map(x=>{const p=byId.get(id(x.discordId));return {...x,department:p?.department||p?.responsibility||''}}).sort((a,b)=>new Date(b.at||0)-new Date(a.at||0)).slice(0,2000);
 const departments=[...new Set([...audit.map(x=>x.actorDepartment),...audit.map(x=>x.targetDepartment),...loginLogs.map(x=>x.department)].map(x=>String(x||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ar'));
 res.json({audit,loginLogs,departments});
});
app.get('/api/admin/hierarchy-state',async(req,res)=>{const c=await requireAdmin(req,res,'manage_hierarchy');if(!c)return;res.json({hierarchy:Array.isArray(data.hierarchy)?data.hierarchy:[]})});
app.get('/api/admin/applications-state',async(req,res)=>{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const expired=expireBatches();if(expired.length)await save().catch(e=>console.error('Auto-close save failed:',e.message));res.json({batches:(data.batches||[]).map(b=>({...b,state:batchState(b)})),applications:data.applications||[],applicationQuestions:data.applicationQuestions||[]})});
app.get('/api/admin/exams-state',async(req,res)=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;res.json({exams:data.exams||[],examResults:data.examResults||[],examAttempts:data.examAttempts||[]})});
app.put('/api/admin/settings',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_settings');if(!c)return;const logoUrl=String(req.body?.logoUrl??data.settings.logoUrl??'').trim();if(logoUrl&&!/^https?:\/\//i.test(logoUrl)&&!logoUrl.startsWith('/'))return res.status(400).json({error:'INVALID_LOGO_URL'});const acceptedDiscordUrl=String(req.body?.acceptedDiscordUrl??data.settings.acceptedDiscordUrl??'').trim();if(acceptedDiscordUrl&&!/^https:\/\/discord\.gg\//i.test(acceptedDiscordUrl))return res.status(400).json({error:'INVALID_DISCORD_INVITE_URL'});data.settings={...data.settings,academyName:String(req.body?.academyName??data.settings.academyName),applicationsTitle:String(req.body?.applicationsTitle??data.settings.applicationsTitle),applicationsDescription:String(req.body?.applicationsDescription??data.settings.applicationsDescription),passingScore:Math.max(1,Math.min(100,Number(req.body?.passingScore||60))),logoUrl,acceptedMessage:String(req.body?.acceptedMessage??data.settings.acceptedMessage??''),rejectedMessage:String(req.body?.rejectedMessage??data.settings.rejectedMessage??''),acceptedDiscordUrl,evaluationTrainerRanks:Array.isArray(req.body?.evaluationTrainerRanks)?req.body.evaluationTrainerRanks.map(String):Array.isArray(data.settings.evaluationTrainerRanks)?data.settings.evaluationTrainerRanks:[],evaluationTraineeRanks:Array.isArray(req.body?.evaluationTraineeRanks)?req.body.evaluationTraineeRanks.map(String):Array.isArray(data.settings.evaluationTraineeRanks)?data.settings.evaluationTraineeRanks:[]};audit(c,'UPDATE_SETTINGS','academy');await save();res.json({ok:true,settings:data.settings})},req,res));
app.put('/api/admin/application',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;data.applicationQuestions=Array.isArray(req.body?.questions)?req.body.questions.map(cleanQuestion):[];audit(c,'UPDATE_APPLICATION','application');await save();res.json({ok:true,applicationQuestions:data.applicationQuestions})},req,res));
app.post('/api/admin/batches',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const name=String(req.body?.name||'').trim();if(name.length<2)return res.status(400).json({error:'INVALID_BATCH_NAME'});const startAt=validDate(req.body?.startAt)?iso(req.body.startAt):new Date().toISOString(),endAt=validDate(req.body?.endAt)?iso(req.body?.endAt):null;if(endAt&&new Date(endAt)<=new Date(startAt))return res.status(400).json({error:'INVALID_TIME_RANGE'});const b={id:`batch-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,name,startAt,endAt,status:'open',openedAt:new Date().toISOString(),closedAt:null,createdBy:String(c.x.id)};data.batches.unshift(b);audit(c,'CREATE_BATCH',b.id,name);await save();res.json({ok:true,batch:b})},req,res));
app.patch('/api/admin/batches/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const b=data.batches.find(x=>x.id===req.params.id);if(!b)return res.status(404).json({error:'BATCH_NOT_FOUND'});const startAt=req.body?.startAt!==undefined?(validDate(req.body.startAt)?iso(req.body.startAt):null):b.startAt,endAt=req.body?.endAt!==undefined?(validDate(req.body.endAt)?iso(req.body.endAt):null):b.endAt;if(endAt&&startAt&&new Date(endAt)<=new Date(startAt))return res.status(400).json({error:'INVALID_TIME_RANGE'});b.name=String(req.body?.name??b.name);b.startAt=startAt;b.endAt=endAt;b.status=req.body?.status==='closed'?'closed':'open';b.closedAt=b.status==='closed'?new Date().toISOString():null;audit(c,'UPDATE_BATCH',b.id);await save();res.json({ok:true,batch:b})},req,res));
app.delete('/api/admin/batches/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const before=data.batches.length;data.batches=data.batches.filter(x=>x.id!==req.params.id);if(before===data.batches.length)return res.status(404).json({error:'BATCH_NOT_FOUND'});const removed=data.applications.filter(a=>a.batchId===req.params.id).length;data.applications=data.applications.filter(a=>a.batchId!==req.params.id);audit(c,'DELETE_BATCH',req.params.id,`removedApplications=${removed}`);await save();res.json({ok:true,removedApplications:removed})},req,res));
app.patch('/api/admin/applications/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const a=data.applications.find(x=>x.id===req.params.id);if(!a)return res.status(404).json({error:'APPLICATION_NOT_FOUND'});if(!['pending','accepted','rejected','waitlist'].includes(String(req.body?.status)))return res.status(400).json({error:'INVALID_STATUS'});a.status=req.body.status;a.reviewedAt=new Date().toISOString();a.reviewedBy=String(c.x.id);a.reviewNote=String(req.body?.note||'');a.reviewerName=c.police?.name||c.x.global_name||c.x.username;a.history=Array.isArray(a.history)?a.history:[];a.history.unshift({status:a.status,at:a.reviewedAt,reviewerId:a.reviewedBy,reviewerName:a.reviewerName,note:a.reviewNote});audit(c,'REVIEW_APPLICATION',a.id,a.status);await save();res.json({ok:true,application:a})},req,res));
app.delete('/api/admin/applications/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const before=data.applications.length;data.applications=data.applications.filter(a=>a.id!==req.params.id);if(before===data.applications.length)return res.status(404).json({error:'APPLICATION_NOT_FOUND'});audit(c,'DELETE_APPLICATION',req.params.id);await save();res.json({ok:true})},req,res));
function validateExam(e){if(e.startAt&&e.endAt&&new Date(e.endAt)<=new Date(e.startAt))throw new Error('INVALID_TIME_RANGE');if(e.accessType==='specific'&&!e.allowedDiscordIds.length)throw new Error('EXAM_ALLOWED_USERS_REQUIRED');if(e.questions.some(q=>q.type==='choice'&&(!q.options.length||!q.correct)))throw new Error('CHOICE_CORRECT_OPTION_REQUIRED');if(e.questions.some(q=>q.type==='yesno'&&!q.correct))throw new Error('YESNO_CORRECT_ANSWER_REQUIRED')}
app.post('/api/admin/exams',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const e=cleanExam(req.body);validateExam(e);data.exams.unshift(e);audit(c,'CREATE_EXAM',e.id,`${e.title} · ${e.accessType}`);await persistExamStorage(['exams']);res.json({ok:true,exam:e})},req,res));
app.put('/api/admin/exams/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const old=data.exams.find(x=>x.id===req.params.id);if(!old)return res.status(404).json({error:'EXAM_NOT_FOUND'});const e=cleanExam({...old,...req.body,id:old.id,createdAt:old.createdAt,accessToken:req.body?.accessToken??old.accessToken});validateExam(e);Object.assign(old,e);audit(c,'UPDATE_EXAM',old.id);await persistExamStorage(['exams']);res.json({ok:true,exam:old})},req,res));
app.delete('/api/admin/exams/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const before=data.exams.length;data.exams=data.exams.filter(x=>x.id!==req.params.id);if(before===data.exams.length)return res.status(404).json({error:'EXAM_NOT_FOUND'});const results=data.examResults.filter(r=>r.examId===req.params.id).length,attempts=data.examAttempts.filter(a=>a.examId===req.params.id).length;data.examResults=data.examResults.filter(r=>r.examId!==req.params.id);data.examAttempts=data.examAttempts.filter(a=>a.examId!==req.params.id);audit(c,'DELETE_EXAM',req.params.id,`removedResults=${results};removedAttempts=${attempts}`);await persistExamStorage(['exams','results','attempts']);res.json({ok:true,removedResults:results,removedAttempts:attempts})},req,res));
app.patch('/api/admin/exams/:id/results-publication',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const e=data.exams.find(x=>x.id===req.params.id);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const published=req.body?.published===true,withAnswers=req.body?.withAnswers===true;e.resultPublished=published;e.resultAnswersPublished=published&&withAnswers;e.resultPublishedAt=published?new Date().toISOString():null;audit(c,published?(withAnswers?'PUBLISH_EXAM_RESULTS_WITH_ANSWERS':'PUBLISH_EXAM_RESULTS'):'HIDE_EXAM_RESULTS',e.id);await persistExamStorage(['exams']);res.json({ok:true,resultPublished:published,resultAnswersPublished:e.resultAnswersPublished})},req,res));app.patch('/api/admin/exams/:examId/users/:userId/resume',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const e=data.exams.find(x=>x.id===req.params.examId);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const uid=id(req.params.userId),attempt=data.examAttempts.find(a=>a.examId===e.id&&id(a.userId)===uid);if(!attempt)return res.status(404).json({error:'EXAM_ATTEMPT_NOT_FOUND'});const startAt=validDate(req.body?.startAt)?iso(req.body.startAt):new Date().toISOString(),until=validDate(req.body?.endAt)?iso(req.body.endAt):null,durationMinutes=Math.max(1,Number(req.body?.durationMinutes||req.body?.resumeDurationMinutes||10));if(until&&new Date(until)<=new Date(startAt))return res.status(400).json({error:'INVALID_TIME_RANGE'});data.examResults=data.examResults.filter(r=>!(r.examId===e.id&&id(r.userId)===uid));attempt.submittedAt=null;attempt.status='paused';attempt.expired=false;attempt.resumeAt=startAt;attempt.resumeUntil=until;const nowMs=Date.now(),priorBase=Math.max(0,Number(attempt.activeDurationSeconds||0)),priorStart=attempt.activeStartedAt?new Date(attempt.activeStartedAt).getTime():new Date(attempt.startedAt).getTime(),priorEnd=attempt.expiresAt?Math.min(nowMs,new Date(attempt.expiresAt).getTime()):nowMs,priorExtra=attempt.status==='expired'?0:Math.max(0,Math.round((priorEnd-priorStart)/1000));attempt.activeDurationSeconds=priorBase+priorExtra;const resumeStartMs=new Date(startAt).getTime();const resumeEndMs=until?new Date(until).getTime():Infinity;attempt.expiresAt=new Date(Math.min(resumeStartMs+durationMinutes*60000,resumeEndMs)).toISOString();attempt.resumeDurationMinutes=durationMinutes;attempt.resumeStartedAt=startAt;attempt.activeStartedAt=startAt;attempt.lastSavedAt=new Date().toISOString();audit(c,'RESUME_EXAM_ATTEMPT',e.id+':'+uid,startAt+' → '+(until||'auto'));await persistExamStorage(['attempts','results']);res.json({ok:true,attempt})},req,res));
app.delete('/api/admin/exams/:examId/users/:userId',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const uid=id(req.params.userId),beforeR=data.examResults.length,beforeA=data.examAttempts.length;data.examResults=data.examResults.filter(r=>!(r.examId===req.params.examId&&id(r.userId)===uid));data.examAttempts=data.examAttempts.filter(a=>!(a.examId===req.params.examId&&id(a.userId)===uid));if(beforeR===data.examResults.length&&beforeA===data.examAttempts.length)return res.status(404).json({error:'EXAM_USER_NOT_FOUND'});audit(c,'DELETE_EXAM_USER',`${req.params.examId}:${uid}`);await persistExamStorage(['results','attempts']);res.json({ok:true})},req,res));
app.put('/api/admin/question-bank',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const next=Array.isArray(req.body?.questions)?req.body.questions.map(q=>cleanQuestion({...q,id:String(q?.id||`qb-${Date.now()}-${Math.random().toString(36).slice(2,8)}`)})):data.questionBank;const byId=new Map(next.map(q=>[String(q.id),q]));for(const exam of data.exams||[]){if(!Array.isArray(exam.questions))continue;exam.questions=exam.questions.map(q=>{const source=String(q?.questionBankId||'');const master=source?byId.get(source):null;if(!master)return cleanQuestion(q);return cleanQuestion({...q,text:master.text,type:master.type,options:master.options,correct:master.correct,required:master.required,points:master.points,questionBankId:master.id,id:q.id})})}data.questionBank=next.map(q=>{const x={...q};delete x.questionBankId;return x});audit(c,'UPDATE_QUESTION_BANK','question-bank');await persistExamStorage(['exams']);await save();res.json({ok:true,questions:data.questionBank})},req,res));
app.get('/api/admin/question-bank',async(req,res)=>{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;res.json({questions:data.questionBank})});
app.post('/api/admin/exam-results/:id/publish',(_req,res)=>res.status(410).json({error:'RESULT_PUBLISHING_REMOVED'}));
app.delete('/api/admin/evaluations/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_evaluations');if(!c)return;const before=data.evaluations.length;data.evaluations=data.evaluations.filter(x=>x.id!==req.params.id);if(before===data.evaluations.length)return res.status(404).json({error:'EVALUATION_NOT_FOUND'});audit(c,'DELETE_EVALUATION',req.params.id);await save();res.json({ok:true})},req,res));
app.post('/api/admin/hierarchy',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_hierarchy');if(!c)return;const items=Array.isArray(req.body?.items)?req.body.items:[];data.hierarchy=items.slice(0,30).map((x,i)=>({id:String(x.id||`node-${Date.now()}-${i}`),title:String(x.title||'منصب'),name:String(x.name||'غير محدد'),discordId:id(x.discordId),image:String(x.image||''),level:Math.max(1,Number(x.level)||1),position:Math.max(1,Number(x.position||x.order)||i+1)}));audit(c,'UPDATE_HIERARCHY','hierarchy');await save();res.json({ok:true,hierarchy:data.hierarchy})},req,res));
app.post('/api/admin/admins',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_admins');if(!c)return;const uid=id(req.body?.discordId);if(!uid)return res.status(400).json({error:'INVALID_DISCORD_ID'});if(ADMINS.has(uid))return res.status(400).json({error:'ENV_ADMIN_PROTECTED'});let a=admin(uid);const ps=Array.isArray(req.body?.permissions)?req.body.permissions.filter(x=>ALL.includes(x)):['view_dashboard'];if(a)Object.assign(a,{name:String(req.body?.name||a.name),permissions:ps,enabled:req.body?.enabled!==false});else{a={discordId:uid,name:String(req.body?.name||''),permissions:ps,enabled:true,createdAt:new Date().toISOString()};data.admins.push(a)}audit(c,'UPSERT_ADMIN',uid,a.name);await save();res.json({ok:true,admin:a,admins:data.admins})},req,res));
app.patch('/api/admin/admins/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_admins');if(!c)return;const uid=id(req.params.id);if(ADMINS.has(uid))return res.status(400).json({error:'ENV_ADMIN_PROTECTED'});const a=admin(uid);if(!a)return res.status(404).json({error:'ADMIN_NOT_FOUND'});if(req.body?.enabled!==undefined)a.enabled=Boolean(req.body.enabled);if(Array.isArray(req.body?.permissions))a.permissions=req.body.permissions.filter(x=>ALL.includes(x));if(req.body?.name!==undefined)a.name=String(req.body.name);audit(c,'UPDATE_ADMIN',a.discordId);await save();res.json({ok:true,admin:a,admins:data.admins})},req,res));
app.delete('/api/admin/admins/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_admins');if(!c)return;const uid=id(req.params.id);if(ADMINS.has(uid))return res.status(400).json({error:'ENV_ADMIN_CANNOT_BE_DELETED'});const before=data.admins.length;data.admins=data.admins.filter(x=>id(x.discordId)!==uid);if(before===data.admins.length)return res.status(404).json({error:'ADMIN_NOT_FOUND'});audit(c,'DELETE_ADMIN',uid);await save();res.json({ok:true,admins:data.admins})},req,res));
app.post('/api/admin/member-image',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_members');if(!c)return;const uid=id(req.body?.discordId),image=String(req.body?.image||'').trim();const isDataImage=/^data:image\/(png|jpeg|webp);base64,/i.test(image);let isRemoteImage=false;try{const u=new URL(image);isRemoteImage=(u.protocol==='http:'||u.protocol==='https:')}catch{}if(!uid||(!isDataImage&&!isRemoteImage))return res.status(400).json({error:'IMAGE_FORMAT_REQUIRED'});if(isDataImage&&image.length>180000)return res.status(413).json({error:'IMAGE_TOO_LARGE'});data.memberImages[uid]=image;audit(c,isRemoteImage?'UPDATE_MEMBER_IMAGE_URL':'UPDATE_MEMBER_IMAGE',uid);await save();res.json({ok:true,image})},req,res));
app.delete('/api/admin/member-image',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_members');if(!c)return;const uid=id(req.body?.discordId);if(!uid)return res.status(400).json({error:'INVALID_DISCORD_ID'});if(!Object.prototype.hasOwnProperty.call(data.memberImages||{},uid))return res.status(404).json({error:'MEMBER_IMAGE_NOT_FOUND'});delete data.memberImages[uid];audit(c,'DELETE_MEMBER_IMAGE',uid);await save();res.json({ok:true})},req,res));
app.get('/auth/discord',(_q,res)=>{if(!CLIENT_ID||!CLIENT_SECRET)return res.status(503).send('Discord OAuth is not configured yet.');const p=new URLSearchParams({client_id:CLIENT_ID,response_type:'code',redirect_uri:REDIRECT,scope:'identify'});res.redirect(`https://discord.com/oauth2/authorize?${p}`)});
app.get('/auth/discord/callback',async(req,res)=>{try{const code=String(req.query.code||'');if(!code)throw Error('Missing OAuth code');const body=new URLSearchParams({client_id:CLIENT_ID,client_secret:CLIENT_SECRET,grant_type:'authorization_code',code,redirect_uri:REDIRECT});const tr=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body,signal:AbortSignal.timeout(10000)});if(!tr.ok)throw Error('Discord token exchange failed');const tk=await tr.json();const mr=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${tk.access_token}`},signal:AbortSignal.timeout(10000)});if(!mr.ok)throw Error('Discord identity lookup failed');const me=await mr.json();const token=jwt.sign({id:me.id,username:me.username,global_name:me.global_name,avatar:me.avatar},SESSION_SECRET,{expiresIn:'7d'});res.cookie('kayan_session',token,{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:604800000,path:'/'});data.loginLogs.unshift({id:`login-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,at:new Date().toISOString(),discordId:String(me.id),name:me.global_name||me.username||'غير معروف',username:me.username||'',avatar:me.avatar||'',avatarUrl:me.avatar?`https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`:''});data.loginLogs=data.loginLogs.slice(0,2000);try{await save()}catch(e){console.error('login log save failed:',e.message)}res.redirect(FRONTEND||'/')}catch(e){res.status(500).send(`Discord login failed: ${e.message}`)}});
app.post('/api/logout',(_q,res)=>{res.clearCookie('kayan_session',{path:'/'});res.json({ok:true})});
app.listen(PORT,'0.0.0.0',()=>console.log('Kayan Academy server listening on '+PORT));
await load();
if(supabaseActive&&DATA_SHEET_ID)queueGoogleMirror('startup');
const expiredOnBoot=expireBatches();
if(expiredOnBoot.length)await save().catch(e=>console.error('Auto-close on boot save failed:',e.message));
setInterval(()=>{const expired=expireBatches();if(expired.length)save().catch(e=>console.error('Auto-close interval save failed:',e.message))},60000).unref?.();
app.use(express.static(DIST,{index:'index.html',setHeaders:(res,filePath)=>{if(filePath.endsWith('.html')){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0')}else if(filePath.includes(`${path.sep}assets${path.sep}`)){res.setHeader('Cache-Control','public, max-age=31536000, immutable')}}}));
app.use((req,res,next)=>{if(req.method!=='GET'||req.path.startsWith('/api/')||req.path.startsWith('/auth/'))return next();res.sendFile(path.join(DIST,'index.html'))});
setInterval(()=>finalizeExpiredAttempts().catch(e=>console.error('Exam expiry job failed:',e.message)),15000).unref?.();
