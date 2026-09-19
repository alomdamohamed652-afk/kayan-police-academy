import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';

const execFileAsync=promisify(execFile);
const source=await fs.readFile('src/main.jsx','utf8');
if(!source.includes('function Applications({user}){'))throw new Error('PREPARE_BUILD_APPLICATION_FUNCTION_NOT_FOUND');
if(!source.includes('function ApplicationStatus({app,settings={}}){'))throw new Error('PREPARE_BUILD_APPLICATION_STATUS_NOT_FOUND');
const admin=await fs.readFile('src/admin-center.jsx','utf8');
const server=await fs.readFile('server/academy-production-original.mjs','utf8');
for(const marker of ['function cleanQuestion(q){','function cleanExam(e){',"app.patch('/api/admin/exams/:examId/results/:resultId/grade'"]){
const examRuntimeMarkers=["sectionId:String(q.sectionId||'')","imageUrl:String(q.imageUrl||'').trim()||undefined","bannerUrl:String(e?.bannerUrl||'').trim()"];
for(const marker of examRuntimeMarkers){if(!server.includes(marker))throw new Error('PREPARE_BUILD_EXAM_RUNTIME_MARKER_MISSING:'+marker)}
 if(!server.includes(marker))throw new Error('PREPARE_BUILD_SERVER_MARKER_MISSING:'+marker);
}
await execFileAsync(process.execPath,['--check','server/academy-production-original.mjs'],{stdio:'inherit'});
const result=await transformWithOxc(admin,'src/admin-center.jsx',{lang:'jsx',sourceType:'module',jsx:{runtime:'automatic'}});
if(!result?.code)throw new Error('EMPTY_JSX_TRANSFORM_RESULT');
console.log('Build preparation validation complete; production build is source-first and non-mutating.');