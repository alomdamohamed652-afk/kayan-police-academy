// Render compatibility entrypoint + runtime hardening layer.
// This keeps the production server as the source of truth while applying small,
// deterministic compatibility fixes before importing it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const serverDir=path.dirname(fileURLToPath(import.meta.url));
const source=path.join(serverDir,'index-production.mjs');
const runtime=path.join(serverDir,'index-production.runtime.mjs');

try{
  const serviceAccountPath=process.env.GOOGLE_SERVICE_ACCOUNT_FILE||'/etc/secrets/google-service-account.json';
  const serviceAccountJson=await fs.readFile(serviceAccountPath,'utf8');
  JSON.parse(serviceAccountJson);
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON=serviceAccountJson;
  process.env.GOOGLE_SERVICE_ACCOUNT_FILE=serviceAccountPath;
}catch(error){
  if(!process.env.GOOGLE_SERVICE_ACCOUNT_JSON)console.warn('Google service-account secret file is unavailable:',error.message);
}

process.env.ACADEMY_GOOGLE_SHEET_NAME='DATA';
process.env.GOOGLE_ACADEMY_DATA_SHEET_NAME='DATA';

let src=await fs.readFile(source,'utf8');

// googleapis does not accept `timeout` as a Sheets request field. Network
// timeouts are handled by fetch/AbortSignal where applicable.
src=src.replace(/,?timeout:10000,?/g,'');

const ensure=`async function ensureData(s){if(!DATA_SHEET_ID)throw new Error('ACADEMY_GOOGLE_SHEET_ID_NOT_CONFIGURED');const m=await s.spreadsheets.get({spreadsheetId:DATA_SHEET_ID,fields:'sheets.properties'});const sheetsList=m.data.sheets||[];const exists=sheetsList.some(x=>x.properties?.title===DATA_SHEET);if(exists)return;try{await s.spreadsheets.batchUpdate({spreadsheetId:DATA_SHEET_ID,requestBody:{requests:[{addSheet:{properties:{title:DATA_SHEET}}}]}})}catch(e){const msg=String(e?.message||e);if(!/already exists|alreadyExists|duplicate/i.test(msg))throw e}}`;
src=src.replace(/async function ensureData\(s\)\{[\s\S]*?\nasync function load\(\)/,ensure+'\nasync function load()');

const evalBlock=`app.get('/api/evaluations',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});const can=c.permissions.includes('view_evaluations')||c.permissions.includes('manage_evaluations')||['trainer','academy_president','academy_vice_president','academy_assistant_vice','police_commander','affairs'].includes(c.role);const own=data.evaluations.filter(e=>e.fromUserId===String(c.x.id)||e.toUserId===String(c.x.id));res.json({evaluations:can?data.evaluations:own,canViewAll:can})});
app.get('/api/evaluation-people',async(req,res)=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});try{const rows=await police();const clean=v=>String(v||'').replace(/[\\s_-]+/g,'');const traineeRanks=['مستجد','جندي','جنديأول'];const trainerRanks=['رقيب','رقيباول','مساعد','ملازم','ملازماول','ملازمتاني','نقيب','رائد','مقدم','عقيد','عميد','لواء','فريق'];const isTrainee=r=>traineeRanks.some(x=>clean(r.rank).includes(x));const isTrainer=r=>trainerRanks.some(x=>clean(r.rank).includes(x))||String(r.responsibility||'').includes('مدرب');res.json({trainees:rows.filter(isTrainee),trainers:rows.filter(isTrainer)})}catch(e){res.status(503).json({error:'POLICE_SHEET_UNAVAILABLE'})}});
app.post('/api/evaluations',(req,res)=>saved(async()=>{const c=await current(req);if(!c.x)return res.status(401).json({error:'UNAUTHENTICATED'});const b=req.body||{},type=String(b.type||'');if(!['trainee_to_trainer','trainer_to_trainee'].includes(type))return res.status(400).json({error:'INVALID_EVALUATION_TYPE'});const rows=await police();const clean=v=>String(v||'').replace(/[\\s_-]+/g,'');const traineeRanks=['مستجد','جندي','جنديأول'];const trainerRanks=['رقيب','رقيباول','مساعد','ملازم','ملازماول','ملازمتاني','نقيب','رائد','مقدم','عقيد','عميد','لواء','فريق'];const isTrainee=r=>traineeRanks.some(x=>clean(r.rank).includes(x));const isTrainer=r=>trainerRanks.some(x=>clean(r.rank).includes(x))||String(r.responsibility||'').includes('مدرب');const currentOfficer=rows.find(r=>id(r.discordId)===id(c.x.id));const rating=Number(b.rating);if(!Number.isInteger(rating)||rating<1||rating>10)return res.status(400).json({error:'INVALID_RATING'});const required=(keys)=>{for(const k of keys)if(String(b[k]??'').trim()==='')return k;return null};let fromRole='';if(type==='trainer_to_trainee'){if(!c.permissions.includes('manage_evaluations')&&!isTrainer(currentOfficer||{}))return res.status(403).json({error:'TRAINER_ONLY'});const miss=required(['trainerName','traineeName','trainingHours','leadershipRating','citizensRating','devicesRating','reportsRating','weaponsRating','notes','rating']);if(miss)return res.status(400).json({error:'REQUIRED_FIELD_MISSING',field:miss});fromRole='trainer'}else{if(!c.permissions.includes('manage_evaluations')&&!isTrainee(currentOfficer||{}))return res.status(403).json({error:'TRAINEE_ONLY'});const miss=required(['traineeName','trainerName','trainingHours','cases','trainerView','clarity','trainingNotes','trainerNotes','sameTrainer','rating']);if(miss)return res.status(400).json({error:'REQUIRED_FIELD_MISSING',field:miss});if(!['نعم','لا'].includes(String(b.sameTrainer)))return res.status(400).json({error:'INVALID_SAME_TRAINER'});fromRole='trainee'}const trainee=rows.find(r=>String(r.name).trim()===String(b.traineeName).trim());const trainer=rows.find(r=>String(r.name).trim()===String(b.trainerName).trim());if(!trainee||!isTrainee(trainee))return res.status(400).json({error:'INVALID_TRAINEE'});if(!trainer||!isTrainer(trainer))return res.status(400).json({error:'INVALID_TRAINER'});const ev={id:\`eval-\${Date.now()}\`,type,fromRole,fromUserId:String(c.x.id),fromName:c.police?.name||c.x.global_name||c.x.username,toUserId:String(type==='trainer_to_trainee'?trainee.discordId:trainer.discordId),traineeName:trainee.name,trainerName:trainer.name,trainingHours:String(b.trainingHours),leadershipRating:String(b.leadershipRating||''),citizensRating:String(b.citizensRating||''),devicesRating:String(b.devicesRating||''),reportsRating:String(b.reportsRating||''),weaponsRating:String(b.weaponsRating||''),notes:String(b.notes||''),cases:String(b.cases||''),trainerView:String(b.trainerView||''),clarity:String(b.clarity||''),trainingNotes:String(b.trainingNotes||''),trainerNotes:String(b.trainerNotes||''),sameTrainer:String(b.sameTrainer||''),rating,createdAt:new Date().toISOString()};data.evaluations.unshift(ev);audit(c,'CREATE_EVALUATION',ev.id,type);await save();res.json({ok:true,evaluation:ev})},req,res));
app.delete('/api/admin/evaluations/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_evaluations');if(!c)return;const n=data.evaluations.length;data.evaluations=data.evaluations.filter(x=>x.id!==req.params.id);if(n===data.evaluations.length)return res.status(404).json({error:'EVALUATION_NOT_FOUND'});audit(c,'DELETE_EVALUATION',req.params.id);await save();res.json({ok:true})},req,res));
`;
src=src.replace(/app\.get\('\/api\/evaluations'[\s\S]*?app\.get\('\/api\/admin\/state'/,evalBlock+"app.get('/api/admin/state'");

const appDelete=`app.delete('/api/admin/applications/:id',(req,res)=>saved(async()=>{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const n=data.applications.length;data.applications=data.applications.filter(x=>x.id!==req.params.id);if(n===data.applications.length)return res.status(404).json({error:'APPLICATION_NOT_FOUND'});audit(c,'DELETE_APPLICATION',req.params.id);await save();res.json({ok:true})},req,res));
`;
src=src.replace("app.post('/api/admin/exams'",appDelete+"app.post('/api/admin/exams'");

await fs.writeFile(runtime,src,'utf8');
await import(pathToFileURL(runtime).href+`?runtime=${Date.now()}`);
