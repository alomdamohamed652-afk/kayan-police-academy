import 'dotenv/config';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { google } from 'googleapis';

const app = globalThis.__kayanApp;
const data = globalThis.__kayanData;
if (!app || !data) throw new Error('KAYAN_HOTFIX_INIT_FAILED');

const id = v => String(v ?? '').replace(/\D/g, '');
const norm = v => String(v ?? '').trim().toLowerCase().replace(/[\u064B-\u065F\u0670\u0640\s_\-#]+/g, '');
const envAdmins = new Set(String(process.env.ACADEMY_ADMIN_IDS || '').split(',').map(id).filter(Boolean));
const DATA_SHEET_ID = process.env.ACADEMY_GOOGLE_SHEET_ID || process.env.GOOGLE_ACADEMY_DATA_SHEET_ID || '1s_VqyiWsFMQaLwemqhyqdzN8zB6lQa81NtF1-XvfuAk';
const DATA_SHEET = process.env.ACADEMY_GOOGLE_SHEET_NAME || process.env.GOOGLE_ACADEMY_DATA_SHEET_NAME || 'DATA';
const POLICE_SHEET_ID = process.env.GOOGLE_SHEET_ID || process.env.POLICE_SHEET_ID || '1J1cWiWn_yOhy3G7coTOwq6AoS9OZvW8rul1_gzZ8uRc';
const POLICE_RANGE = process.env.GOOGLE_SHEET_RANGE || process.env.POLICE_SHEET_RANGE || 'officers!B4:H';
const SERVICE_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '/etc/secrets/google-service-account.json';
let credentials;
let sheets;
let policeCache = { at: 0, rows: [] };

const session = req => {
  try { return jwt.verify(req.cookies?.kayan_session, String(process.env.SESSION_SECRET || '')); } catch { return null; }
};
const uid = req => id(session(req)?.id);
const adminRecord = userId => data.admins?.find(a => id(a.discordId) === id(userId));
const isAdmin = userId => envAdmins.has(id(userId)) || Boolean(adminRecord(userId)?.enabled);

async function service(){
  if(sheets) return sheets;
  const raw=String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'').trim() || await fs.readFile(SERVICE_FILE,'utf8');
  credentials=JSON.parse(raw);
  const auth=new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets']});
  return sheets=google.sheets({version:'v4',auth});
}
async function saveData(){
  const s=await service();
  await s.spreadsheets.values.update({spreadsheetId:DATA_SHEET_ID,range:`${DATA_SHEET}!A1`,valueInputOption:'RAW',requestBody:{values:[[JSON.stringify(data)]]}});
}
function register(method, route, handler){
  app[method](route, handler);
  const stack=app._router?.stack||[];
  const routeIndex=stack.findIndex(layer=>layer.route?.path===route);
  const fallbackIndex=globalThis.__kayanFallback ? stack.findIndex(layer=>layer.handle===globalThis.__kayanFallback) : -1;
  if(routeIndex>=0 && fallbackIndex>=0 && routeIndex>fallbackIndex){const [layer]=stack.splice(routeIndex,1);stack.splice(fallbackIndex,0,layer);}
}
function headerIndex(headers,names,fallback){
  const h=headers.map(norm);
  for(const name of names){const n=norm(name);const i=h.findIndex(x=>x===n||x.includes(n)||n.includes(x));if(i>=0)return i;}
  return fallback;
}
async function policeRows(){
  if(policeCache.rows.length && Date.now()-policeCache.at<30000) return policeCache.rows;
  const s=await service();
  const r=await s.spreadsheets.values.get({spreadsheetId:POLICE_SHEET_ID,range:POLICE_RANGE});
  const values=r.data.values||[], headers=values[0]||[];
  const b=headerIndex(headers,['Badge #','Badge','البادج','الكود'],0);
  const n=headerIndex(headers,['الاسم','name'],1);
  const k=headerIndex(headers,['الرتبة','الرتبه','rank'],3);
  const q=headerIndex(headers,['المسؤولية','المسؤوليه','responsibility'],5);
  const d=headerIndex(headers,['ديسكورد','discord','discord id','discordid','discord_id'],6);
  const rows=values.slice(1).map(row=>({badge:String(row[b]??'').trim(),name:String(row[n]??'').trim(),rank:String(row[k]??'').trim(),responsibility:String(row[q]??'').trim(),discordId:id(row[d])})).filter(x=>x.discordId||x.name);
  policeCache={at:Date.now(),rows};
  return rows;
}
const trainee = r => new Set(['مستجد','جندي','جندي أول','جنديأول'].map(norm)).has(norm(r?.rank));
const trainer = r => {
  const t=norm(r?.rank);
  return ['رقيب','رقيب أول','مساعد','مساعد أول','ملازم','ملازم أول','ملازم ثاني','نقيب','رائد','مقدم','عقيد','عميد','لواء','فريق','رئيس الأكاديمية','نائب رئيس الأكاديمية','مساعد نائب رئيس الأكاديمية','قائد الشرطة','رئيس الشرطة','نائب رئيس الشرطة','مساعد قائد الشرطة'].map(norm).some(x=>t===x||t.includes(x)) || String(r?.responsibility||'').includes('مدرب');
};
const evaluationBatch = () => {
  const selected=String(data.settings?.evaluationBatchId||'');
  if(selected) return (data.batches||[]).find(b=>String(b.id)===selected)||null;
  return null;
};

register('get','/api/evaluation-people',async(req,res)=>{
  const actor=uid(req); if(!actor)return res.status(401).json({error:'UNAUTHENTICATED'});
  try{
    const rows=await policeRows();
    const me=rows.find(r=>id(r.discordId)===actor);
    if(!me)return res.status(403).json({error:'OFFICER_ONLY'});
    res.json({trainers:rows.filter(trainer).map(r=>({name:r.name,rank:r.rank,discordId:r.discordId})),trainees:rows.filter(trainee).map(r=>({name:r.name,rank:r.rank,discordId:r.discordId}))});
  }catch(e){console.error('KAYAN_EVALUATION_PEOPLE_FAILED',e);res.status(503).json({error:'POLICE_SHEET_UNAVAILABLE'});}
});

register('post','/api/kayan/evaluations',async(req,res)=>{
  const actor=uid(req); if(!actor)return res.status(401).json({error:'UNAUTHENTICATED'});
  try{
    const rows=await policeRows();
    const me=rows.find(r=>id(r.discordId)===actor);
    if(!me)return res.status(403).json({error:'OFFICER_ONLY'});
    const role=trainer(me)?'trainer':trainee(me)?'trainee':'none';
    if(role==='none')return res.status(403).json({error:'EVALUATION_ROLE_UNDEFINED'});
    const batch=evaluationBatch();
    if(!batch)return res.status(409).json({error:'NO_ACTIVE_EVALUATION_BATCH'});
    const body=req.body||{};
    const tr=role==='trainer'?me:rows.find(r=>id(r.discordId)===id(body.trainerId));
    const te=role==='trainee'?me:rows.find(r=>id(r.discordId)===id(body.traineeId));
    if(!tr||!trainer(tr))return res.status(400).json({error:'INVALID_TRAINER'});
    if(!te||!trainee(te))return res.status(400).json({error:'INVALID_TRAINEE'});
    const type=role==='trainer'?'trainer_to_trainee':'trainee_to_trainer';
    const required=type==='trainer_to_trainee'?['trainingHours','notes']:['trainingHours','cases','trainerView','clarity','trainingNotes','trainerNotes','sameTrainer'];
    for(const key of required)if(String(body[key]??'').trim()==='')return res.status(400).json({error:'REQUIRED_FIELD_MISSING',field:key});
    const ratings=type==='trainer_to_trainee'?['leadershipRating','citizensRating','devicesRating','reportsRating','weaponsRating','rating']:['rating'];
    for(const key of ratings){const value=Number(body[key]);if(!Number.isInteger(value)||value<1||value>10)return res.status(400).json({error:'INVALID_RATING',field:key});}
    const ev={id:`eval-${Date.now()}`,batchId:batch.id,batchName:batch.name,type,fromUserId:actor,fromName:me.name,fromRank:me.rank,toUserId:type==='trainer_to_trainee'?te.discordId:tr.discordId,trainerId:tr.discordId,trainerName:tr.name,trainerRank:tr.rank,traineeId:te.discordId,traineeName:te.name,traineeRank:te.rank,trainingHours:String(body.trainingHours||''),leadershipRating:String(body.leadershipRating||''),citizensRating:String(body.citizensRating||''),devicesRating:String(body.devicesRating||''),reportsRating:String(body.reportsRating||''),weaponsRating:String(body.weaponsRating||''),cases:String(body.cases||''),trainerView:String(body.trainerView||''),clarity:String(body.clarity||''),trainingNotes:String(body.trainingNotes||''),trainerNotes:String(body.trainerNotes||''),sameTrainer:String(body.sameTrainer||''),notes:String(body.notes||''),rating:Number(body.rating),reviewStatus:'pending',createdAt:new Date().toISOString()};
    data.evaluations ||= []; data.evaluations.unshift(ev); await saveData(); res.json({ok:true,evaluation:ev});
  }catch(e){console.error('KAYAN_EVALUATION_SAVE_FAILED',e);res.status(503).json({error:'STORAGE_ERROR'});}
});

register('patch','/api/admin/member-image-link',async(req,res)=>{
  const actor=uid(req); if(!actor)return res.status(401).json({error:'UNAUTHENTICATED'});
  const target=id(req.body?.discordId||actor); if(!target)return res.status(400).json({error:'INVALID_DISCORD_ID'});
  if(target!==actor&&!isAdmin(actor))return res.status(403).json({error:'FORBIDDEN'});
  const image=String(req.body?.image||'');
  if(image&&!/^data:image\/(png|jpe?g|webp);base64,/i.test(image))return res.status(400).json({error:'INVALID_IMAGE'});
  if(image.length>700000)return res.status(413).json({error:'IMAGE_TOO_LARGE'});
  data.memberImages ||= {}; if(image)data.memberImages[target]=image;else delete data.memberImages[target];
  try{await saveData();res.json({ok:true,image:data.memberImages[target]||''});}catch(e){console.error('KAYAN_MEMBER_IMAGE_SAVE_FAILED',e);res.status(503).json({error:'STORAGE_ERROR'});}
});

register('patch','/api/member-image',async(req,res)=>{
  const actor=uid(req); if(!actor)return res.status(401).json({error:'UNAUTHENTICATED'});
  const image=String(req.body?.image||''); if(image&&!/^data:image\/(png|jpe?g|webp);base64,/i.test(image))return res.status(400).json({error:'INVALID_IMAGE'}); if(image.length>700000)return res.status(413).json({error:'IMAGE_TOO_LARGE'});
  data.memberImages ||= {}; if(image)data.memberImages[actor]=image;else delete data.memberImages[actor];
  try{await saveData();res.json({ok:true,image:data.memberImages[actor]||''});}catch(e){console.error('KAYAN_SELF_IMAGE_SAVE_FAILED',e);res.status(503).json({error:'STORAGE_ERROR'});}
});

console.log('Kayan hotfix routes initialized');
