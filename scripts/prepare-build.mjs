import './runtime-stability-patch.mjs';
import './stability-v2.mjs';
import './admin-data-tools-patch-v2.mjs';
import './evaluation-ui-patch.mjs';
import './exam-hardening-v3.mjs';
import './load-stability-patch.mjs';
import './security-admin-hardening-v1.mjs';
import './security-admin-ui-patch-v1.mjs';
import './super-admin-lock-v1.mjs';
import './action-ux-v1.mjs';
import './production-admin-v3.mjs';
import './exam-flow-v2.mjs';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';

const execFileAsync=promisify(execFile);

const source=await fs.readFile('src/main.jsx','utf8');
if(!source.includes('function Applications({user}){'))throw new Error('PREPARE_BUILD_APPLICATION_FUNCTION_NOT_FOUND');
if(!source.includes('function ApplicationStatus({app,settings={}}){'))throw new Error('PREPARE_BUILD_APPLICATION_STATUS_NOT_FOUND');

const admin=await fs.readFile('src/admin-center.jsx','utf8');
const requiredAdminMarkers=[
  'function ExamEditor(',
  'examSectionEditor',
  'examEditorBottomSave',
  'examImageUrlField',
  'function ExamAnswers('
];
for(const marker of requiredAdminMarkers){
  if(!admin.includes(marker))throw new Error('PREPARE_BUILD_ADMIN_UI_MARKER_MISSING:'+marker);
}
const server=await fs.readFile('server/academy-production-original.mjs','utf8');
const requiredServerMarkers=[
  'function cleanQuestion(q){',
  'function cleanExam(e){',
  "app.patch('/api/admin/exams/:examId/results/:resultId/grade'",
  'const rateBuckets=new Map();'
];
for(const marker of requiredServerMarkers){
  if(!server.includes(marker))throw new Error('PREPARE_BUILD_SERVER_MARKER_MISSING:'+marker);
}

await execFileAsync(process.execPath,['--check','server/academy-production-original.mjs'],{stdio:'inherit'});

try{
  const result=await transformWithOxc(admin,'src/admin-center.jsx',{
    lang:'jsx',
    sourceType:'module',
    jsx:{runtime:'automatic'}
  });
  if(!result?.code)throw new Error('EMPTY_JSX_TRANSFORM_RESULT');
}catch(error){
  console.error('Generated src/admin-center.jsx failed JSX parser validation.');
  throw error;
}

console.log('Build preparation validation complete; server syntax + generated JSX + required wiring verified.');
