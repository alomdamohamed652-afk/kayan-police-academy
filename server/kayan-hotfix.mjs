import 'dotenv/config';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { google } from 'googleapis';

const app = globalThis.__kayanApp;
const data = globalThis.__kayanData;
if (!app || !data) throw new Error('KAYAN_HOTFIX_INIT_FAILED');

const id = v => String(v ?? '').replace(/\D/g, '');
const envAdmins = new Set(String(process.env.ACADEMY_ADMIN_IDS || '').split(',').map(id).filter(Boolean));
const DATA_SHEET_ID = process.env.ACADEMY_GOOGLE_SHEET_ID || process.env.GOOGLE_ACADEMY_DATA_SHEET_ID || '1s_VqyiWsFMQaLwemqhyqdzN8zB6lQa81NtF1-XvfuAk';
const DATA_SHEET = process.env.ACADEMY_GOOGLE_SHEET_NAME || process.env.GOOGLE_ACADEMY_DATA_SHEET_NAME || 'DATA';
const SERVICE_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '/etc/secrets/google-service-account.json';
let credentials;
let sheets;

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

register('patch','/api/admin/member-image-link',async(req,res)=>{
  const actor=uid(req);
  if(!actor) return res.status(401).json({error:'UNAUTHENTICATED'});
  const target=id(req.body?.discordId || actor);
  if(!target) return res.status(400).json({error:'INVALID_DISCORD_ID'});
  if(target!==actor && !isAdmin(actor)) return res.status(403).json({error:'FORBIDDEN'});
  const image=String(req.body?.image||'');
  if(image && !/^data:image\/(png|jpe?g|webp);base64,/i.test(image)) return res.status(400).json({error:'INVALID_IMAGE'});
  if(image.length>700000) return res.status(413).json({error:'IMAGE_TOO_LARGE'});
  data.memberImages ||= {};
  if(image) data.memberImages[target]=image; else delete data.memberImages[target];
  try { await saveData(); res.json({ok:true,image:data.memberImages[target]||''}); }
  catch(e){ console.error('KAYAN_MEMBER_IMAGE_SAVE_FAILED',e); res.status(503).json({error:'STORAGE_ERROR'}); }
});

register('patch','/api/member-image',async(req,res)=>{
  const actor=uid(req);
  if(!actor) return res.status(401).json({error:'UNAUTHENTICATED'});
  const image=String(req.body?.image||'');
  if(image && !/^data:image\/(png|jpe?g|webp);base64,/i.test(image)) return res.status(400).json({error:'INVALID_IMAGE'});
  if(image.length>700000) return res.status(413).json({error:'IMAGE_TOO_LARGE'});
  data.memberImages ||= {};
  if(image) data.memberImages[actor]=image; else delete data.memberImages[actor];
  try { await saveData(); res.json({ok:true,image:data.memberImages[actor]||''}); }
  catch(e){ console.error('KAYAN_SELF_IMAGE_SAVE_FAILED',e); res.status(503).json({error:'STORAGE_ERROR'}); }
});

console.log('Kayan hotfix routes initialized');
