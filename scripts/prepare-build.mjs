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

const source=await fs.readFile('src/main.jsx','utf8');
if(!source.includes('function Applications({user}){'))throw new Error('PREPARE_BUILD_APPLICATION_FUNCTION_NOT_FOUND');
if(!source.includes('function ApplicationStatus({app,settings={}}){'))throw new Error('PREPARE_BUILD_APPLICATION_STATUS_NOT_FOUND');

const admin=await fs.readFile('src/admin-center.jsx','utf8');
const requiredAdminMarkers=[
  'الأقسام ومسار الاختبار',
  'examEditorStickySave',
  'بانر الاختبار — رابط صورة',
  'صورة السؤال — رابط',
  'احتساب صحيحة'
];
for(const marker of requiredAdminMarkers){
  if(!admin.includes(marker))throw new Error('PREPARE_BUILD_ADMIN_UI_MARKER_MISSING:'+marker);
}
console.log('Build preparation validation complete; admin UI markers verified.');
