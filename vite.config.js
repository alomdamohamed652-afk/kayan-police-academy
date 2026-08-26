import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const LOGO_URL='https://raw.githubusercontent.com/alomdamohamed652-afk/kayan-police-academy/main/police-logo.png';
function download(url,target){return new Promise((resolve,reject)=>{const file=fs.createWriteStream(target);https.get(url,res=>{if(res.statusCode>=300&&res.statusCode<400&&res.headers.location)return download(res.headers.location,target).then(resolve,reject);if(res.statusCode!==200)return reject(new Error(`Logo download failed: HTTP ${res.statusCode}`));res.pipe(file);file.on('finish',()=>file.close(resolve));}).on('error',err=>{file.close(()=>fs.unlink(target,()=>{}));reject(err)})})}
function copyOfficialLogo(){return{name:'copy-official-police-logo',async closeBundle(){const source=path.resolve(process.cwd(),'police-logo.png');const target=path.resolve(process.cwd(),'dist','police-logo.png');fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(source)){fs.copyFileSync(source,target);return}try{await download(LOGO_URL,target)}catch(e){console.warn('Official logo unavailable during build:',e.message)}}}}
export default defineConfig({plugins:[react(),copyOfficialLogo()],server:{proxy:{'/api':'http://localhost:3001','/auth':'http://localhost:3001'}}});
