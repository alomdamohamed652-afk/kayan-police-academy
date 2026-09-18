import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';

const execFileAsync=promisify(execFile);

const source=await fs.readFile('src/main.jsx','utf8');
if(!source.includes('function Applications({user}){'))throw new Error('PREPARE_BUILD_APPLICATION_FUNCTION_NOT_FOUND');
if(!source.includes('function ApplicationStatus({app,settings={}}){'))throw new Error('PREPARE_BUILD_APPLICATION_STATUS_NOT_FOUND');

const admin=await fs.readFile('src/admin-center.jsx','utf8');
// Generated admin source is validated by Oxc below; avoid brittle marker matching here.
const server=await fs.readFile('server/academy-production-original.mjs','utf8');
const requiredServerMarkers=[
  'function cleanQuestion(q){',
  'function cleanExam(e){',
  "app.patch('/api/admin/exams/:examId/results/:resultId/grade'",
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
