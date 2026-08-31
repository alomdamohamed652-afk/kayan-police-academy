import fs from 'node:fs/promises';

const replace=async(file,from,to,label)=>{
  const p=await fs.readFile(file,'utf8');
  if(!p.includes(from))throw new Error('PATCH_TARGET_NOT_FOUND:'+label);
  await fs.writeFile(file,p.replace(from,to),'utf8');
};

await replace(
'src/admin-center.jsx',
"const[editing,setEditing]=useState(null),[detail,setDetail]=useState(null),[answerResult,setAnswerResult]=useState(null),[search,setSearch]=useState(''),[resultSearch,setResultSearch]=useState(''),[resumeForm,setResumeForm]=useState(null),[showQuestions,setShowQuestions]=useState(false);",
"const[editing,setEditing]=useState(null),[detail,setDetail]=useState(null),[answerResult,setAnswerResult]=useState(null),[search,setSearch]=useState(''),[resultSearch,setResultSearch]=useState(''),[resumeForm,setResumeForm]=useState(null),[showQuestions,setShowQuestions]=useState(false),[examList,setExamList]=useState(state.exams||[]);useEffect(()=>setExamList(state.exams||[]),[state.exams]);",
'admin-list-state');

await replace(
'src/admin-center.jsx',
"const save=async()=>{try{const isNew=!editing.id,payload={...editing,id:isNew?undefined:editing.id,questions:(editing.questions||[]).map(normalizeQuestion)};await api(isNew?'/api/admin/exams':\`/api/admin/exams/\${editing.id}\`,{method:isNew?'POST':'PUT',body:JSON.stringify(payload)});setEditing(null);setMsg(isNew?'تم إنشاء الاختبار.':'تم تعديل الاختبار نفسه بدون إنشاء نسخة جديدة.');reload()}catch(e){setMsg(errText(e))}};",
"const save=async()=>{try{const isNew=!editing.id,payload={...editing,id:isNew?undefined:editing.id,questions:(editing.questions||[]).map(normalizeQuestion)};const result=await api(isNew?'/api/admin/exams':\`/api/admin/exams/\${editing.id}\`,{method:isNew?'POST':'PUT',body:JSON.stringify(payload)});if(result?.exam)setExamList(prev=>isNew?[result.exam,...prev]:prev.map(x=>String(x.id)===String(result.exam.id)?result.exam:x));setEditing(null);setMsg(isNew?'تم إنشاء الاختبار وحفظه فورًا.':'تم حفظ تعديلات الاختبار وإغلاق المحرر فورًا.');reload().catch(()=>{})}catch(e){setMsg(errText(e))}};",
'exam-save');

await replace(
'src/admin-center.jsx',
"const remove=async e=>{if(!confirm(\`حذف الاختبار «\${e.title}» بكل نتائجه ومحاولاته؟\`))return;try{await api(\`/api/admin/exams/\${e.id}\`,{method:'DELETE'});setDetail(null);setMsg('تم حذف الاختبار وبياناته المرتبطة.');reload()}catch(x){setMsg(errText(x))}};",
"const remove=async e=>{if(!confirm(\`حذف الاختبار «\${e.title}» بكل نتائجه ومحاولاته؟\`))return;try{await api(\`/api/admin/exams/\${e.id}\`,{method:'DELETE'});setExamList(prev=>prev.filter(x=>String(x.id)!==String(e.id)));setDetail(null);setMsg('تم حذف الاختبار وبياناته المرتبطة.');reload().catch(()=>{})}catch(x){setMsg(errText(x))}};",
'exam-delete');

await replace(
'src/admin-center.jsx',
"(state.exams||[]).filter(e=>{const q=search.trim().toLowerCase();if(!q)return true;",
"(examList||[]).filter(e=>{const q=search.trim().toLowerCase();if(!q)return true;",
'exam-render-list');

await replace(
'server/academy-production-original.mjs',
"attempt.submittedAt=null;attempt.status='paused';attempt.expired=false;attempt.resumeAt=startAt;attempt.resumeUntil=until;const nowMs=Date.now(),priorBase=Math.max(0,Number(attempt.activeDurationSeconds||0)),priorStart=attempt.activeStartedAt?new Date(attempt.activeStartedAt).getTime():new Date(attempt.startedAt).getTime(),priorEnd=attempt.expiresAt?Math.min(nowMs,new Date(attempt.expiresAt).getTime()):nowMs,priorExtra=attempt.status==='expired'?0:Math.max(0,Math.round((priorEnd-priorStart)/1000));attempt.activeDurationSeconds=priorBase+priorExtra;",
"const previousStatus=String(attempt.status||'').toLowerCase(),nowMs=Date.now(),priorBase=Math.max(0,Number(attempt.activeDurationSeconds||0)),priorStart=attempt.activeStartedAt?new Date(attempt.activeStartedAt).getTime():new Date(attempt.startedAt).getTime(),priorEnd=attempt.expiresAt?Math.min(nowMs,new Date(attempt.expiresAt).getTime()):nowMs,priorExtra=previousStatus==='active'?Math.max(0,Math.round((priorEnd-priorStart)/1000)):0;attempt.activeDurationSeconds=priorBase+priorExtra;attempt.submittedAt=null;attempt.status='paused';attempt.expired=false;attempt.resumeAt=startAt;attempt.resumeUntil=until;",
'resume-duration');

await replace(
'server/supabase-academy-store.mjs',
"status:x.submittedAt?'submitted':(x.status||'in_progress'),",
"status:x.submittedAt?'submitted':(['submitted','expired','cancelled'].includes(String(x.status||'').toLowerCase())?String(x.status).toLowerCase():'in_progress'),",
'exam-attempt-status');

console.log('Runtime stability patch applied.');
