import fs from 'node:fs/promises';
const file='src/admin-center.jsx';
let s=await fs.readFile(file,'utf8');

const old="const load=async()=>{setLoading(true);setError('');try{const d=await api('/api/admin/activity-state');setData({audit:Array.isArray(d.audit)?d.audit:[],loginLogs:Array.isArray(d.loginLogs)?d.loginLogs:[],departments:Array.isArray(d.departments)?d.departments:[]})}catch(e){setError(errText(e))}finally{setLoading(false)}};";
const neu=old+"\nconst clearOldLogs=async()=>{if(!confirm('مسح جميع سجلات النشاط وتسجيلات الدخول الأقدم من 3 أيام؟ سيبقى آخر 3 أيام فقط.'))return;try{const d=await api('/api/admin/activity-logs/clear-old',{method:'POST'});setMsg?.('تم مسح '+Number(d.auditDeleted||0)+' سجل إداري و'+Number(d.loginDeleted||0)+' تسجيل دخول، مع الاحتفاظ بآخر 3 أيام.');await load()}catch(e){setError(errText(e))}};";
if(!s.includes("const clearOldLogs=async()=>")){if(!s.includes(old))throw new Error('SECURITY_UI_LOAD_TARGET_NOT_FOUND');s=s.replace(old,neu)}

const toolbar=" <Btn onClick={load}><RefreshCw size={15}/> تحديث</Btn>";
const replacement=" <Btn onClick={clearOldLogs} className='danger'><Trash2 size={15}/> مسح الأقدم من 3 أيام</Btn>"+toolbar;
if(!s.includes("مسح الأقدم من 3 أيام")){if(!s.includes(toolbar))throw new Error('SECURITY_UI_TOOLBAR_TARGET_NOT_FOUND');s=s.replace(toolbar,replacement)}

const cardPattern="a.source==='environment'?'أدمن بيئي محمي':'أدمن قابل للتعديل'";
const cardReplacement="a.source==='environment'?'SUPER ADMIN · محمي بالكامل':'أدمن قابل للتعديل'";
s=s.replace(cardPattern,cardReplacement);

await fs.writeFile(file,s,'utf8');
console.log('Security admin UI patch applied.');
