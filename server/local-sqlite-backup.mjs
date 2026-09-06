import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const configuredPath=String(process.env.SQLITE_BACKUP_PATH||'').trim();
const renderDisk=String(process.env.RENDER_DISK_PATH||'').trim();
const DB_PATH=configuredPath||path.join(renderDisk||path.resolve(process.cwd(),'data'),'kayan-academy.db');
let db=null,lastError='',lastSyncAt=0;
function open(){
  if(db)return db;
  fs.mkdirSync(path.dirname(DB_PATH),{recursive:true});
  db=new DatabaseSync(DB_PATH);
  db.exec('CREATE TABLE IF NOT EXISTS academy_snapshot (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL, updated_at TEXT NOT NULL, checksum TEXT)');
  return db;
}
export function sqliteStatus(){
  let size=0,updatedAt=null,hasSnapshot=false;
  try{
    const row=open().prepare('SELECT updated_at FROM academy_snapshot WHERE id=1').get();
    hasSnapshot=Boolean(row);updatedAt=row?.updated_at||null;
    try{size=fs.statSync(DB_PATH).size}catch{}
    return {configured:true,available:true,path:DB_PATH,hasSnapshot,updatedAt,lastSyncAt:lastSyncAt||null,size,lastError:''};
  }catch(e){lastError=String(e?.message||e);return {configured:true,available:false,path:DB_PATH,hasSnapshot:false,updatedAt:null,lastSyncAt:lastSyncAt||null,size:0,lastError};}
}
export function saveSqliteSnapshot(data){
  const now=new Date().toISOString(),payload=JSON.stringify(data);
  open().prepare('INSERT INTO academy_snapshot(id,payload,updated_at,checksum) VALUES(1,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at,checksum=excluded.checksum').run(payload,now,String(payload.length));
  lastSyncAt=Date.now();lastError='';return {updatedAt:now,path:DB_PATH};
}
export function loadSqliteSnapshot(){
  const row=open().prepare('SELECT payload,updated_at FROM academy_snapshot WHERE id=1').get();
  if(!row?.payload)return null;return {data:JSON.parse(row.payload),updatedAt:row.updated_at};
}