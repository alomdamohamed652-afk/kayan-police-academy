import fs from 'node:fs/promises';

const replaceOnce = async (file, from, to, label) => {
  const source = await fs.readFile(file, 'utf8');
  if (!source.includes(from)) throw new Error(`ADMIN_PATCH_TARGET_NOT_FOUND:${label}`);
  await fs.writeFile(file, source.replace(from, to), 'utf8');
};

await replaceOnce(
  'server/academy-production-original.mjs',
  "import { loadAcademyData, saveAcademyData, saveExamAttempt, saveExamResult } from './supabase-academy-store.mjs';",
  "import { loadAcademyData, saveAcademyData, saveExamAttempt, saveExamResult } from './supabase-academy-store.mjs';\nimport { clearExamAnswerData, clearApplicationBatchData } from './admin-data-actions.mjs';",
  'server-import'
);

await replaceOnce(
  'server/academy-production-original.mjs',
  "function perms(uid){const a=admin(uid);return a?.enabled?(Array.isArray(a.permissions)?a.permissions.filter(x=>ALL.includes(x)):[]):(isBootstrapAdmin(uid)?ALL:[])}",
  "function perms(uid){const normalized=id(uid),a=admin(normalized);if(isBootstrapAdmin(normalized)||a?.source==='environment')return ALL;return a?.enabled?(Array.isArray(a.permissions)?a.permissions.filter(x=>ALL.includes(x)):[]):[]}",
  'super-admin-permissions'
);

const cleanupRoutes = `
app.post('/api/admin/batches/:id/clear-data',async(req,res)=>{try{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const b=data.batches.find(x=>String(x.id)===String(req.params.id));if(!b)return res.status(404).json({error:'BATCH_NOT_FOUND'});const out=await clearApplicationBatchData(b.id);for(const a of data.applications||[])if(String(a.batchId)===String(b.id)){a.answers={};a.answersClearedAt=new Date().toISOString()}audit(c,'CLEAR_BATCH_APPLICATION_DATA',b.id,`clearedApplications=${Number(out.cleared_applications||0)}`);try{await save()}catch(e){console.error('Batch cleanup mirror save failed:',e.message)}res.json({ok:true,batchId:b.id,clearedApplications:Number(out.cleared_applications||0),recordRetained:true})}catch(e){console.error('Batch application cleanup failed:',e);res.status(503).json({error:'DATA_CLEANUP_FAILED',retryable:true})}});
app.post('/api/admin/exams/:id/clear-answers',async(req,res)=>{try{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const e=data.exams.find(x=>String(x.id)===String(req.params.id));if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const out=await clearExamAnswerData(e.id);const clearedAt=new Date().toISOString();for(const a of data.examAttempts||[])if(String(a.examId)===String(e.id)){a.answers={};a.answersClearedAt=clearedAt}for(const r of data.examResults||[])if(String(r.examId)===String(e.id)){r.answers={};r.review=[];r.answersClearedAt=clearedAt}audit(c,'CLEAR_EXAM_ANSWER_DATA',e.id,`removedAttemptAnswers=${Number(out.removed_attempt_answers||0)};clearedAttempts=${Number(out.cleared_attempts||0)};clearedResults=${Number(out.cleared_results||0)}`);try{await save()}catch(err){console.error('Exam cleanup mirror save failed:',err.message)}res.json({ok:true,examId:e.id,removedAttemptAnswers:Number(out.removed_attempt_answers||0),clearedAttempts:Number(out.cleared_attempts||0),clearedResults:Number(out.cleared_results||0),resultsRetained:true})}catch(e){console.error('Exam answer cleanup failed:',e);res.status(503).json({error:'DATA_CLEANUP_FAILED',retryable:true})}});
`;
await replaceOnce(
  'server/academy-production-original.mjs',
  "app.put('/api/admin/question-bank'",
  cleanupRoutes + "app.put('/api/admin/question-bank'",
  'cleanup-routes'
);

const ui = await fs.readFile('src/admin-center.jsx', 'utf8');
let next = ui;

const batchButton = `<Btn className="danger" onClick={()=>{if(busy||!confirm('مسح إجابات جميع طلبات هذه الدفعة؟ سيبقى سجل التقديم والاسم وDiscord ID والحالة والتاريخ للرجوع إليه.'))return;withBusy(async()=>{try{const d=await api(\`/api/admin/batches/\${b.id}/clear-data\`,{method:'POST'});setState(prev=>({...prev,applications:(prev.applications||[]).map(a=>String(a.batchId)===String(b.id)?{...a,answers:{},answersClearedAt:new Date().toISOString()}:a)}));setMsg(\`تم مسح بيانات الإجابات من \${d.clearedApplications||0} طلب مع الاحتفاظ بسجل التقديم.\`)}catch(e){setMsg(errText(e))}})}}><Trash2 size={14}/> مسح بيانات الطلبات</Btn>`;
const batchAnchor = `<Btn onClick={()=>toggle(b)}>{b.status==='open'?'إغلاق':'فتح'}</Btn>`;
if (!next.includes(batchAnchor)) throw new Error('ADMIN_PATCH_TARGET_NOT_FOUND:batch-button-anchor');
next = next.replace(batchAnchor, batchAnchor + batchButton);

const examButton = `<Btn className="danger" onClick={()=>{if(busy||!confirm('مسح إجابات جميع المشاركين في هذا الاختبار؟ النتائج والدرجات ستظل محفوظة.'))return;withBusy(async()=>{try{const d=await api(\`/api/admin/exams/\${detail.id}/clear-answers\`,{method:'POST'});const clearedAt=new Date().toISOString();setState(prev=>({...prev,examResults:(prev.examResults||[]).map(r=>String(r.examId)===String(detail.id)?{...r,answers:{},review:[],answersClearedAt:clearedAt}:r),examAttempts:(prev.examAttempts||[]).map(a=>String(a.examId)===String(detail.id)?{...a,answers:{},answersClearedAt:clearedAt}:a)}));setMsg(\`تم مسح إجابات الاختبار؛ النتائج محفوظة (\${d.clearedResults||0} نتيجة).\`)}catch(e){setMsg(errText(e))}})}}><Trash2 size={14}/> مسح الإجابات فقط</Btn>`;
const examAnchor = `<Btn className="primary" onClick={()=>publishResults(detail,true)}>{detail.resultAnswersPublished?'إعادة إشهار النتيجة مع الإجابات':'إشهار النتيجة مع الإجابات'}</Btn>`;
if (!next.includes(examAnchor)) throw new Error('ADMIN_PATCH_TARGET_NOT_FOUND:exam-button-anchor');
next = next.replace(examAnchor, examAnchor + examButton);

const reviewModal = `<div className="reviewModalOverlay" role="dialog" aria-modal="true"><div className="reviewModal"><div className="reviewModalHead"><div><span className={reviewModal.status==='accepted'?'reviewAcceptIcon':'reviewRejectIcon'}>{reviewModal.status==='accepted'?'✓':'!'}</span><h3>{reviewModal.status==='accepted'?'تأكيد قبول المتقدم':'تأكيد رفض المتقدم'}</h3></div><button type="button" onClick={()=>setReviewModal(null)}>×</button></div><p>أنت على وشك {reviewModal.status==='accepted'?'قبول':'رفض'} <b>{reviewModal.a.name||reviewModal.a.discordId}</b>.</p><label>سبب القرار <small>(اختياري)</small></label><textarea value={reviewModal.note} onChange={e=>setReviewModal({...reviewModal,note:e.target.value})} placeholder={reviewModal.status==='accepted'?'مثال: اجتاز التقييم واستوفى الشروط.':'مثال: لم يستوفِ أحد شروط القبول.'} rows={4}/><div className="reviewModalActions"><Btn onClick={()=>setReviewModal(null)}>إلغاء</Btn><Btn className={reviewModal.status==='accepted'?'primary':'reject'} disabled={busy} onClick={confirmReview}>{reviewModal.status==='accepted'?'تأكيد القبول':'تأكيد الرفض'}</Btn></div></div></div>`;
const selectedReturnAnchor = `return <div className="adminSection"><div className="panel"><div className="panelHead"><div><h2>طلبات دفعة: {selectedBatch.name}</h2>`;
if (!next.includes(selectedReturnAnchor)) throw new Error('ADMIN_PATCH_TARGET_NOT_FOUND:review-modal-anchor');
next = next.replace(selectedReturnAnchor, `return <div className="adminSection">${reviewModal ? `{reviewModal&&${reviewModal}}` : ''}<div className="panel"><div className="panelHead"><div><h2>طلبات دفعة: {selectedBatch.name}</h2>`);

if (next === ui) throw new Error('ADMIN_PATCH_NO_UI_CHANGES');
await fs.writeFile('src/admin-center.jsx', next, 'utf8');
console.log('Admin data tools patch applied.');
