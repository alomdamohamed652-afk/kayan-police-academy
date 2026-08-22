import 'dotenv/config';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { google } from 'googleapis';

const app = globalThis.__kayanApp;
if (!app) throw new Error('Kayan Express app was not captured.');
const id = v => String(v ?? '').replace(/\D/g, '');
const getData = () => globalThis.__kayanData;
const envAdmins = new Set(String(process.env.ACADEMY_ADMIN_IDS || '').split(',').map(id).filter(Boolean));
let sheets;
let credentials;
const saveData = async () => {
  const d=getData(); if(!d)throw Error('DATA_UNAVAILABLE');
  const sheetId=process.env.ACADEMY_GOOGLE_SHEET_ID||process.env.GOOGLE_ACADEMY_DATA_SHEET_ID||'1s_VqyiWsFMQaLwemqhyqdzN8zB6lQa81NtF1-XvfuAk';
  const sheetName=process.env.ACADEMY_GOOGLE_SHEET_NAME||process.env.GOOGLE_ACADEMY_DATA_SHEET_NAME||'DATA';
  if(!credentials){const raw=String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'').trim()||await fs.readFile(process.env.GOOGLE_SERVICE_ACCOUNT_FILE||'/etc/secrets/google-service-account.json','utf8');credentials=JSON.parse(raw)}
  if(!sheets){const auth=new google.auth.GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets']});sheets=google.sheets({version:'v4',auth})}
  await sheets.spreadsheets.values.update({spreadsheetId:sheetId,range:`${sheetName}!A1`,valueInputOption:'RAW',requestBody:{values:[[JSON.stringify(d)]]}});
};
const session=req=>{try{return jwt.verify(req.cookies?.kayan_session,String(process.env.SESSION_SECRET||''))}catch{return null}};
const currentUserId=req=>id(session(req)?.id);
const isAdmin=req=>{const uid=currentUserId(req),d=getData();return Boolean(uid&&(envAdmins.has(uid)||d?.admins?.some(a=>id(a.discordId)===uid&&a.enabled)))};
const evaluationBatch=()=>{const d=getData();if(!d)return null;const selected=d.settings?.evaluationBatchId?d.batches?.find(b=>b.id===d.settings.evaluationBatchId):null;if(selected)return selected;return [...(d.batches||[])].filter(b=>b.status==='closed').sort((a,b)=>new Date(b.endAt||b.createdAt||0)-new Date(a.endAt||a.createdAt||0))[0]||null};
app.get('/api/public/evaluation-batch',(_req,res)=>{const b=evaluationBatch();res.json({batch:b?{id:b.id,name:b.name,startAt:b.startAt,endAt:b.endAt}:null})});
app.get('/api/admin/evaluation-batch',(req,res)=>{if(!isAdmin(req))return res.status(403).json({error:'FORBIDDEN'});res.json({batch:evaluationBatch(),selectedBatchId:getData()?.settings?.evaluationBatchId||''})});
app.patch('/api/admin/evaluation-batch',async(req,res)=>{if(!isAdmin(req))return res.status(403).json({error:'FORBIDDEN'});const d=getData(),batchId=String(req.body?.batchId||'');if(batchId&&!d?.batches?.some(b=>b.id===batchId))return res.status(404).json({error:'BATCH_NOT_FOUND'});d.settings.evaluationBatchId=batchId;await saveData();res.json({ok:true,batch:evaluationBatch()})});
app.get('/api/admin/exam-results/:id',async(req,res)=>{if(!isAdmin(req))return res.status(403).json({error:'FORBIDDEN'});const d=getData(),r=d?.examResults?.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'EXAM_RESULT_NOT_FOUND'});const exam=d.exams?.find(x=>x.id===r.examId);res.json({result:r,exam:exam||null,person:{name:r.name||r.userId,discordId:r.userId,badge:'',rank:'',responsibility:''}})});
app.patch('/api/admin/member-image-link',async(req,res)=>{if(!isAdmin(req))return res.status(403).json({error:'FORBIDDEN'});const d=getData(),uid=id(req.body?.discordId),image=String(req.body?.image||'').trim();if(!uid)return res.status(400).json({error:'INVALID_DISCORD_ID'});if(image&&!/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(image))return res.status(400).json({error:'INVALID_IMAGE_URL'});if(image)d.memberImages[uid]=image;else delete d.memberImages[uid];await saveData();res.json({ok:true,image:d.memberImages[uid]||''})});
app.patch('/api/member-image',async(req,res)=>{const uid=currentUserId(req);if(!uid)return res.status(401).json({error:'UNAUTHENTICATED'});const d=getData(),image=String(req.body?.image||'').trim();if(image&&!/^https:\/\/(?:cdn\.discordapp\.com|media\.discordapp\.net)\//i.test(image))return res.status(400).json({error:'INVALID_IMAGE_URL'});if(image)d.memberImages[uid]=image;else delete d.memberImages[uid];await saveData();res.json({ok:true,image:d.memberImages[uid]||''})});
app.patch('/api/evaluations/:id',async(req,res)=>{const uid=currentUserId(req);if(!uid)return res.status(401).json({error:'UNAUTHENTICATED'});const d=getData(),e=d?.evaluations?.find(x=>x.id===req.params.id);if(!e)return res.status(404).json({error:'EVALUATION_NOT_FOUND'});if(e.fromUserId!==uid)return res.status(403).json({error:'FORBIDDEN'});if((e.reviewStatus||'pending')!=='pending')return res.status(409).json({error:'EVALUATION_LOCKED'});for(const key of ['trainingHours','leadershipRating','citizensRating','devicesRating','reportsRating','weaponsRating','cases','trainerView','clarity','trainingNotes','trainerNotes','sameTrainer','notes','rating'])if(req.body?.[key]!==undefined)e[key]=String(req.body[key]??'');await saveData();res.json({ok:true,evaluation:e})});

if(globalThis.__kayanFallback){globalThis.__allowKayanFallback=true;app.use(globalThis.__kayanFallback);delete globalThis.__allowKayanFallback;}
