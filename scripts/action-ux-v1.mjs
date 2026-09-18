import fs from 'node:fs/promises';

const file='src/admin-center.jsx';
let s=await fs.readFile(file,'utf8');

const replaceRange=(startToken,endToken,replacement,label)=>{
  const a=s.indexOf(startToken);
  const b=s.indexOf(endToken,a);
  if(a<0||b<0) throw new Error('ACTION_UX_TARGET_NOT_FOUND:'+label);
  s=s.slice(0,a)+replacement+s.slice(b);
};

const oldBtn="const Btn=({children,onClick,className='secondary',disabled=false,type='button'})=><button type={type} className={className} disabled={disabled} onClick={onClick}>{children}</button>;";
const newBtn="const Btn=({children,onClick,className='secondary',disabled=false,type='button'})=>{const[pending,setPending]=useState(false);const run=async e=>{if(disabled||pending)return;setPending(true);try{return await onClick?.(e)}finally{setPending(false)}};return <button type={type} className={className+(pending?' actionPending':'')} disabled={disabled||pending} aria-busy={pending} onClick={run}>{children}</button>};";
if(s.includes(oldBtn)) s=s.replace(oldBtn,newBtn);
else if(!s.includes("const Btn=({children,onClick,className='secondary',disabled=false,type='button'})=>{")) throw new Error('ACTION_UX_BTN_TARGET_NOT_FOUND');

replaceRange(
  "const toggle=b=>",
  "const removeBatch=",
  "const toggle=b=>withBusy(async()=>{const optimistic={...b,status:b.status==='open'?'closed':'open'};optimistic.state=batchUiState(optimistic);setState(v=>({...v,batches:(v.batches||[]).map(x=>String(x.id)===String(b.id)?optimistic:x)}));if(selectedBatch&&String(selectedBatch.id)===String(b.id))setSelectedBatch(optimistic);try{const d=await api('/api/admin/batches/'+b.id,{method:'PATCH',body:JSON.stringify({status:optimistic.status})});if(d?.batch){const confirmed={...d.batch,state:batchUiState(d.batch)};setState(v=>({...v,batches:(v.batches||[]).map(x=>String(x.id)===String(confirmed.id)?confirmed:x)}));if(selectedBatch&&String(selectedBatch.id)===String(confirmed.id))setSelectedBatch(confirmed)}setMsg('تم تحديث حالة الدفعة.')}catch(e){await refreshSection('applications');setMsg('تعذر تنفيذ تغيير الحالة؛ تمت استعادة الحالة الصحيحة من الخادم.')}});",
  "toggle"
);

replaceRange(
  "const removeBatch=",
  "const saveQuestions=",
  "const removeBatch=b=>{if(busy||!confirm('حذف الدفعة «'+b.name+'»؟ سيتم حذف طلباتها أيضًا.'))return;return withBusy(async()=>{setState(v=>({...v,batches:(v.batches||[]).filter(x=>String(x.id)!==String(b.id)),applications:(v.applications||[]).filter(a=>String(a.batchId)!==String(b.id))}));setSelectedBatch(null);setMsg('تم حذف الدفعة من الواجهة.');try{await api('/api/admin/batches/'+b.id,{method:'DELETE'});setMsg('تم حذف الدفعة وطلباتها.')}catch(e){await refreshSection('applications');setMsg('تعذر حذف الدفعة؛ تمت استعادة البيانات من الخادم.')}})};",
  "removeBatch"
);

replaceRange(
  "const confirmReview=",
  "const remove=async a=>",
  "const confirmReview=()=>withBusy(async()=>{const m=reviewModal;if(!m)return;const optimistic={...m.a,status:m.status};setState(v=>({...v,applications:(v.applications||[]).map(x=>String(x.id)===String(m.a.id)?optimistic:x)}));setReviewModal(null);setMsg(m.status==='accepted'?'تم قبول المتقدم وتحديث الواجهة.':m.status==='rejected'?'تم رفض المتقدم وتحديث الواجهة.':'تم تحديث حالة الطلب والواجهة.');try{const d=await api('/api/admin/applications/'+m.a.id,{method:'PATCH',body:JSON.stringify({status:m.status,note:m.note||''})});if(d?.application)setState(v=>({...v,applications:(v.applications||[]).map(x=>String(x.id)===String(m.a.id)?d.application:x)}));await refreshSection('applications')}catch(e){await refreshSection('applications');setMsg('تعذر تنفيذ القرار؛ تمت استعادة حالة الطلب الصحيحة من الخادم.')}});",
  "confirmReview"
);

replaceRange(
  "const remove=async a=>",
  "const addQ=",
  "const remove=async a=>{if(busy||!confirm('حذف الطلب نهائيًا؟'))return;return withBusy(async()=>{setState(v=>({...v,applications:(v.applications||[]).filter(x=>String(x.id)!==String(a.id))}));setSelectedApp(null);setMsg('تم حذف الطلب من الواجهة.');try{await api('/api/admin/applications/'+a.id,{method:'DELETE'});setMsg('تم حذف الطلب.')}catch(e){await refreshSection('applications');setMsg('تعذر حذف الطلب؛ تمت استعادة القائمة من الخادم.')}})};",
  "remove"
);

const cssFile='src/styles.css';
let css=await fs.readFile(cssFile,'utf8');
const cssMarker='/* === APPLICATIONS ADMIN — IMMEDIATE ACTION UX + RESPONSIVE FIX === */';
if(!css.includes(cssMarker)){
  css += '\n'+cssMarker+'\n'
    +'.adminSection .applicationRow{display:grid!important;grid-template-columns:minmax(220px,1fr) auto auto;align-items:center;column-gap:14px;row-gap:10px;width:100%;min-width:0}\n'
    +'.adminSection .applicationRow>div:first-child{min-width:0!important;width:100%;overflow-wrap:anywhere;word-break:break-word}\n'
    +'.adminSection .applicationRow>.rowActions{min-width:0;max-width:100%;display:flex;flex-wrap:wrap;align-items:center;justify-content:flex-start}\n'
    +'.adminSection .applicationRow>span{min-width:max-content}\n'
    +'.adminSection .applicationRow .rowActions button{flex:0 0 auto;white-space:nowrap}\n'
    +'.actionPending{position:relative;transform:scale(.98);box-shadow:0 0 0 2px rgba(213,180,94,.16),0 7px 20px rgba(0,0,0,.18)!important}\n'
    +'.actionPending:after{content:"";width:7px;height:7px;margin-right:3px;border:1.5px solid currentColor;border-left-color:transparent;border-radius:50%;display:inline-block;vertical-align:middle;animation:actionSpin .65s linear infinite}\n'
    +'@keyframes actionSpin{to{transform:rotate(360deg)}}\n'
    +'@media(max-width:900px){.adminSection .applicationRow{grid-template-columns:1fr!important;align-items:stretch!important}.adminSection .applicationRow>span{justify-self:start}.adminSection .applicationRow>.rowActions{width:100%;display:flex;flex-wrap:wrap}}\n'
    +'@media(max-width:560px){.adminSection .applicationRow{padding:14px 10px!important}.adminSection .applicationRow>div:first-child strong{font-size:16px!important}.adminSection .applicationRow>div:first-child small{font-size:11px!important}.adminSection .applicationRow>.rowActions button{flex:1 1 120px}}\n';
  await fs.writeFile(cssFile,css,'utf8');
}

await fs.writeFile(file,s,'utf8');
console.log('Immediate action UX + applications responsive fix applied.');
