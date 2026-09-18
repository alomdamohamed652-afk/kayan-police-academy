import fs from 'node:fs/promises';

const replace=(s,from,to,label)=>{
  if(!s.includes(from)) throw new Error('PROD_V3_TARGET_NOT_FOUND:'+label);
  return s.replace(from,to);
};
const replaceFn=(s,start,end,to,label)=>{
  const a=s.indexOf(start),b=s.indexOf(end,a);
  if(a<0||b<0) throw new Error('PROD_V3_FUNCTION_TARGET_NOT_FOUND:'+label);
  return s.slice(0,a)+to+s.slice(b);
};

/* =========================
   SERVER: exam model + grading + rate limits + health
   ========================= */
{
  const file='server/academy-production-original.mjs';
  let s=await fs.readFile(file,'utf8');

  s=replace(s,
    "function cleanQuestion(q){const type=['choice','yesno','text'].includes(q?.type)?q.type:'text';",
    "function cleanQuestion(q){const type=['choice','yesno','text'].includes(q?.type)?q.type:'text';",
    "noop");

  /* Replace complete cleanQuestion/cleanExam/publicExam/scoreAttempt block safely. */
  const a=s.indexOf("function cleanQuestion(q){");
  const b=s.indexOf("function recoverSubmittedExamResults(){",a);
  if(a<0||b<0)throw new Error('PROD_V3_EXAM_MODEL_TARGET_NOT_FOUND');
  const model=`function cleanQuestion(q){
 const type=['choice','yesno','text'].includes(q?.type)?q.type:'text';
 const options=Array.isArray(q?.options)?q.options.map(v=>String(v).trim()).filter(Boolean):[];
 let correct=q?.correct==null?'':String(q.correct);
 if(type==='choice'&&!options.includes(correct))correct='';
 if(type==='yesno'&&!['نعم','لا'].includes(correct))correct='';
 if(type==='text')correct='';
 const questionBankId=q?.questionBankId?String(q.questionBankId).trim():'';
 const imageUrl=String(q?.imageUrl||'').trim().slice(0,1200);
 return{id:String(q?.id||('q-'+Date.now()+'-'+Math.random().toString(36).slice(2,7))),text:String(q?.text||'').trim(),type,options,correct,required:q?.required!==false,points:Math.max(1,Number(q?.points||1)),...(questionBankId?{questionBankId}:{}),...(imageUrl?{imageUrl}:{}),...(q?.sectionId?{sectionId:String(q.sectionId)}:{})};
}
const EXAM_ACCESS=['all','police','link','specific'];
function cleanExam(e){
 const questions=Array.isArray(e?.questions)?e.questions.map(cleanQuestion):[];
 const sections=Array.isArray(e?.sections)?e.sections.map((x,i)=>({id:String(x?.id||('section-'+(i+1))),title:String(x?.title||('القسم '+(i+1))).trim().slice(0,120),description:String(x?.description||'').trim().slice(0,500),gateQuestionId:String(x?.gateQuestionId||'').trim(),allowedAnswers:Array.isArray(x?.allowedAnswers)?x.allowedAnswers.map(v=>String(v).trim()).filter(Boolean).slice(0,50):[],failMessage:String(x?.failMessage||'').trim().slice(0,500),nextSectionId:String(x?.nextSectionId||'').trim()})):[],
 accessType=EXAM_ACCESS.includes(e?.accessType)?e.accessType:'police';
 const accessToken=accessType==='link'?(String(e?.accessToken||'').trim()||crypto.randomBytes(18).toString('base64url')):'';
 const allowedDiscordIds=accessType==='specific'?(Array.isArray(e?.allowedDiscordIds)?e.allowedDiscordIds.map(id).filter(Boolean):[]):[];
 const bannerUrl=String(e?.bannerUrl||'').trim().slice(0,1200);
 return{id:String(e?.id||('exam-'+Date.now())),title:String(e?.title||'اختبار جديد'),description:String(e?.description||''),stage:String(e?.stage||'عام'),accessType,accessToken,allowedDiscordIds,passingScore:Math.max(1,Math.min(100,Number(e?.passingScore||60))),durationMinutes:Math.max(1,Number(e?.durationMinutes||30)),attemptsAllowed:Math.max(1,Number(e?.attemptsAllowed||1)),startAt:validDate(e?.startAt)?iso(e.startAt):null,endAt:validDate(e?.endAt)?iso(e.endAt):null,active:e?.active!==false,resultPublished:e?.resultPublished===true,resultAnswersPublished:e?.resultAnswersPublished===true,bannerUrl,sections,createdAt:e?.createdAt||new Date().toISOString(),questions};
}
function shuffleQuestions(list){const a=[...(Array.isArray(list)?list:[])];for(let i=a.length-1;i>0;i--){const j=crypto.randomInt(i+1);[a[i],a[j]]=[a[j],a[i]]}return a}
function orderedExam(e,attempt){const ids=Array.isArray(attempt?.questionOrder)?attempt.questionOrder.map(String):[];const by=new Map((e.questions||[]).map(q=>[String(q.id),q]));const ordered=ids.length?ids.map(id=>by.get(id)).filter(Boolean):shuffleQuestions(e.questions||[]);return publicExam({...e,questions:ordered})}
function manualCorrect(result,qid){
 const m=result?.manualGrades&&typeof result.manualGrades==='object'?result.manualGrades:{};
 return m[String(qid)];
}
function scoreAttempt(e,answers,manualGrades={}){
 let earned=0,total=0;
 for(const q of e.questions||[]){
   const p=Number(q.points||1);total+=p;
   const override=manualGrades?.[q.id];
   if(override!==undefined){if(Boolean(override))earned+=p;continue}
   if((q.type==='choice'||q.type==='yesno')&&String(answers?.[q.id]??'')===String(q.correct??''))earned+=p;
 }
 return total?Math.round(earned/total*100):0;
}
function publicExam(e){
 const questions=(Array.isArray(e?.questions)?e.questions:[]).map(cleanQuestion).filter(q=>q.text).map(q=>({id:q.id,text:q.text,type:q.type,options:q.options||[],required:q.required!==false,points:q.points,imageUrl:q.imageUrl||'',sectionId:q.sectionId||''}));
 const sections=Array.isArray(e?.sections)?e.sections.map(x=>({id:x.id,title:x.title,description:x.description,gateQuestionId:x.gateQuestionId||'',allowedAnswers:x.allowedAnswers||[],failMessage:x.failMessage||'',nextSectionId:x.nextSectionId||''})):[]; 
 return{...e,state:timeState(e?.startAt,e?.endAt),accessToken:undefined,allowedDiscordIds:undefined,sections,bannerUrl:e?.bannerUrl||'',questions};
}
`;
  s=s.slice(0,a)+model+s.slice(b);

  /* Persist manual grade through a dedicated admin endpoint. */
  const anchor="app.get('/api/admin/state',async(req,res)=>{";
  const gradeRoute=`
app.patch('/api/admin/exams/:examId/results/:resultId/grade',async(req,res)=>{
 try{
  const c=await requireAdmin(req,res,'manage_exams');if(!c)return;
  const e=data.exams.find(x=>String(x.id)===String(req.params.examId));
  const r=data.examResults.find(x=>String(x.id)===String(req.params.resultId)&&String(x.examId)===String(req.params.examId));
  if(!e||!r)return res.status(404).json({error:'EXAM_RESULT_NOT_FOUND'});
  const qid=String(req.body?.questionId||'');if(!qid)return res.status(400).json({error:'QUESTION_ID_REQUIRED'});
  const q=e.questions.find(x=>String(x.id)===qid);if(!q)return res.status(404).json({error:'QUESTION_NOT_FOUND'});
  if(q.type!=='text')return res.status(400).json({error:'ONLY_TEXT_ANSWERS_REQUIRE_MANUAL_GRADING'});
  const value=Boolean(req.body?.correct);
  r.manualGrades={...(r.manualGrades||{}),[qid]:value};
  r.review=(e.questions||[]).map(qx=>({id:qx.id,text:qx.text,type:qx.type,answer:String(r.answers?.[qx.id]??''),correct:qx.correct??'',points:qx.points||1,manualCorrect:r.manualGrades?.[qx.id]}));
  r.score=scoreAttempt(e,r.answers,r.manualGrades);
  r.passed=r.score>=Number(e.passingScore||60);
  r.manuallyGradedAt=new Date().toISOString();
  r.manuallyGradedBy=String(c.x.id);
  audit(c,'GRADE_EXAM_ANSWER',r.id,\`question=\${qid};correct=\${value};score=\${r.score}\`);
  await saveDurable();
  res.json({ok:true,result:r});
 }catch(e){console.error('Manual exam grading failed:',e);res.status(503).json({error:'STORAGE_ERROR',retryable:true})}
});
`;
  s=replace(s,anchor,gradeRoute+anchor,'grade-route');

  /* Rate limit mutation-heavy admin routes and auth callback endpoints. */
  const rlMarker="const rateBuckets=new Map();";
  if(!s.includes(rlMarker)){
    const cookieAnchor="app.use(express.json({limit:'8mb'}));";
    const pos=s.indexOf(cookieAnchor);
    if(pos<0)throw new Error('PROD_V3_RATE_LIMIT_TARGET_NOT_FOUND');
    const insert=`
const rateBuckets=new Map();
function requestIp(req){return String(req.ip||req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim()}
function rateLimit({windowMs=60000,max=60,keyPrefix='api'}={}){
 return (req,res,next)=>{if(['GET','HEAD','OPTIONS'].includes(req.method))return next();const key=keyPrefix+':'+requestIp(req);const t=Date.now(),old=rateBuckets.get(key);if(!old||t-old.started>=windowMs){rateBuckets.set(key,{started:t,count:1});return next()}old.count++;if(old.count>max){res.setHeader('Retry-After',String(Math.ceil((old.started+windowMs-t)/1000)));return res.status(429).json({error:'RATE_LIMITED',retryable:true})}next()};
}
app.use('/api/admin',rateLimit({windowMs:60000,max:120,keyPrefix:'admin'}));
`;
    s=s.slice(0,pos)+insert+s.slice(pos);
  }

  /* Admin state includes a lightweight health object for UI. */
  const stateStart="res.json({settings:data.settings,applicationQuestions:data.applicationQuestions";
  if(s.includes(stateStart)){
    s=s.replace(
      "res.json({settings:data.settings,applicationQuestions:data.applicationQuestions",
      "res.json({systemHealth:{storageMode:supabaseActive?'supabase':(storageReady?'google':'unavailable'),storageReady,mirrorLastSync:lastMirrorAt?new Date(lastMirrorAt).toISOString():null,mirrorError:lastMirrorError||null,storageError:lastStorageError||null},settings:data.settings,applicationQuestions:data.applicationQuestions"
    );
  }
  await fs.writeFile(file,s,'utf8');
}

/* =========================
   ADMIN UI: exam editor + grading + pagination + notifications + unsaved guard
   ========================= */
{
 const file='src/admin-center.jsx';
 let s=await fs.readFile(file,'utf8');

 /* Blank exam gets the new structure. */
 s=replace(s,
  "const blank={id:'',title:'اختبار جديد',description:'',stage:'عام',passingScore:60,durationMinutes:30,attemptsAllowed:1,startAt:'',endAt:'',active:true,resultPublished:false,accessType:'all',allowedDiscordIds:[],accessToken:'',questions:[]};",
  "const blank={id:'',title:'اختبار جديد',description:'',stage:'عام',passingScore:60,durationMinutes:30,attemptsAllowed:1,startAt:'',endAt:'',active:true,resultPublished:false,accessType:'all',allowedDiscordIds:[],accessToken:'',bannerUrl:'',sections:[],questions:[]};",
  'blank');

 /* Replace ExamsAdmin whole function with enhanced version, retaining existing helper components after it. */
 const a=s.indexOf("function ExamsAdmin({state,reload,refreshSection,setMsg,setState}){");
 const b=s.indexOf("function accessName(",a);
 if(a<0||b<0)throw new Error('PROD_V3_EXAMS_ADMIN_TARGET_NOT_FOUND');
 const enhanced=`function ExamsAdmin({state,reload,refreshSection,setMsg,setState}){
 const blank={id:'',title:'اختبار جديد',description:'',stage:'عام',passingScore:60,durationMinutes:30,attemptsAllowed:1,startAt:'',endAt:'',active:true,resultPublished:false,accessType:'all',allowedDiscordIds:[],accessToken:'',bannerUrl:'',sections:[],questions:[]};
 const[editing,setEditing]=useState(null),[detail,setDetail]=useState(null),[answerResult,setAnswerResult]=useState(null),[search,setSearch]=useState(''),[resultSearch,setResultSearch]=useState(''),[resultPage,setResultPage]=useState(1),[showQuestions,setShowQuestions]=useState(false),[busy,setBusy]=useState(false);
 const withBusy=async(fn)=>{if(busy)return;setBusy(true);try{await fn()}finally{setBusy(false)}};
 const publishResults=(e,withAnswers=false)=>withBusy(async()=>{try{const published=!e.resultPublished||withAnswers;const answersPublished=published&&withAnswers;const d=await api('/api/admin/exams/'+e.id+'/results-publication',{method:'PATCH',body:JSON.stringify({published,withAnswers:answersPublished})});const next={...e,resultPublished:Boolean(d?.resultPublished),resultAnswersPublished:Boolean(d?.resultAnswersPublished)};setDetail(next);setState(prev=>({...prev,exams:(prev.exams||[]).map(x=>String(x.id)===String(e.id)?{...x,...next}:x)}));setMsg(!published?'تم إخفاء النتيجة عن الجميع.':withAnswers?'تم إشهار النتيجة مع الإجابات.':'تم إشهار النتيجة فقط.')}catch(x){setMsg(errText(x))}});
 const toggleActive=e=>withBusy(async()=>{const optimistic={...e,active:!e.active};setState(prev=>({...prev,exams:(prev.exams||[]).map(x=>String(x.id)===String(e.id)?optimistic:x)}));if(detail&&String(detail.id)===String(e.id))setDetail(optimistic);try{const d=await api('/api/admin/exams/'+e.id+'/active',{method:'PATCH',body:JSON.stringify({active:optimistic.active})});const next=d?.exam||optimistic;setState(prev=>({...prev,exams:(prev.exams||[]).map(x=>String(x.id)===String(e.id)?next:x)}));if(detail&&String(detail.id)===String(e.id))setDetail(next);setMsg(next.active?'تم تفعيل الاختبار.':'تم تعطيل الاختبار.')}catch(err){await refreshSection('exams');setMsg('تعذر تغيير الحالة؛ تمت استعادة الحالة الصحيحة.')}});
 const save=()=>withBusy(async()=>{try{const isNew=!editing.id,payload={...editing,id:isNew?'exam-'+Date.now()+'-'+Math.random().toString(36).slice(2,8):editing.id,questions:(editing.questions||[]).map(normalizeQuestion),sections:Array.isArray(editing.sections)?editing.sections:[]};const d=await api(isNew?'/api/admin/exams':'/api/admin/exams/'+editing.id,{method:isNew?'POST':'PUT',body:JSON.stringify(payload)});if(d?.exam)setState(prev=>({...prev,exams:isNew?[d.exam,...(prev.exams||[])]:((prev.exams||[]).map(x=>String(x.id)===String(d.exam.id)?d.exam:x))}));setEditing(null);setMsg(isNew?'تم إنشاء الاختبار.':'تم حفظ الاختبار.')}catch(e){setMsg(errText(e))}});
 const remove=e=>{if(busy||!confirm('حذف الاختبار بكل نتائجه ومحاولاته؟'))return;return withBusy(async()=>{setState(prev=>({...prev,exams:(prev.exams||[]).filter(x=>String(x.id)!==String(e.id)),examResults:(prev.examResults||[]).filter(r=>String(r.examId)!==String(e.id)),examAttempts:(prev.examAttempts||[]).filter(a=>String(a.examId)!==String(e.id))}));setDetail(null);try{await api('/api/admin/exams/'+e.id,{method:'DELETE'});setMsg('تم حذف الاختبار وبياناته المرتبطة.')}catch(x){await refreshSection('exams');setMsg('تعذر الحذف؛ تمت استعادة البيانات.')}})};
 const openEdit=e=>setEditing({...e,questions:(e.questions||[]).map(normalizeQuestion),sections:Array.isArray(e.sections)?e.sections:[],allowedDiscordIds:e.allowedDiscordIds||[],accessType:e.accessType||'all',bannerUrl:e.bannerUrl||''});
 const linkFor=e=>e?.accessType==='link'&&e.accessToken?location.origin+'/academy/exams?exam='+encodeURIComponent(e.id)+'&token='+encodeURIComponent(e.accessToken):'';
 const copy=async text=>{try{await navigator.clipboard.writeText(text);setMsg('تم نسخ الرابط.')}catch{setMsg('تعذر النسخ التلقائي؛ انسخ الرابط من الحقل.')}};
 const grade=async(result,questionId,correct)=>{try{const d=await api('/api/admin/exams/'+detail.id+'/results/'+result.id+'/grade',{method:'PATCH',body:JSON.stringify({questionId,correct})});setState(prev=>({...prev,examResults:(prev.examResults||[]).map(r=>String(r.id)===String(result.id)?d.result:r)}));setAnswerResult(d.result);setMsg(correct?'تم احتساب الإجابة صحيحة وتحديث الدرجة.':'تم احتساب الإجابة خاطئة وتحديث الدرجة.')}catch(e){setMsg(errText(e))}};
 if(detail){
   const results=(state.examResults||[]).filter(r=>r.examId===detail.id);
   const attempts=(state.examAttempts||[]).filter(a=>a.examId===detail.id);
   const users=new Map();for(const r of results)users.set(r.userId,{userId:r.userId,name:r.name,result:r});for(const a of attempts)if(!users.has(a.userId)){const m=(state.members||[]).find(x=>x.discordId===a.userId);users.set(a.userId,{userId:a.userId,name:m?.name||a.userId})}
   const filteredUsers=[...users.values()].filter(u=>!resultSearch.trim()||(String(u.name||'')+' '+String(u.userId||'')).toLowerCase().includes(resultSearch.trim().toLowerCase()));
   const pageSize=25,totalPages=Math.max(1,Math.ceil(filteredUsers.length/pageSize)),safePage=Math.min(resultPage,totalPages),paged=filteredUsers.slice((safePage-1)*pageSize,safePage*pageSize);
   return <div className="adminSection"><div className="panel"><div className="panelHead"><div><h2>{detail.title}</h2><p className="muted">{detail.description||'إدارة كاملة للاختبار والنتائج والتصحيح اليدوي.'}</p></div><div className="rowActions"><Btn onClick={()=>setDetail(null)}><ArrowRight size={15}/> كل الاختبارات</Btn><Btn className={detail.resultPublished?'secondary':'primary'} onClick={()=>publishResults(detail,false)}>{detail.resultPublished?'إخفاء النتيجة':'إشهار النتيجة'}</Btn><button className="danger" onClick={()=>remove(detail)}><Trash2 size={14}/> حذف الاختبار</button></div></div>{detail.bannerUrl&&<img className="examAdminBanner" src={detail.bannerUrl} alt="" loading="lazy"/>}<div className="detailGrid"><p><b>المرحلة:</b> {detail.stage}</p><p><b>النجاح:</b> {detail.passingScore}%</p><p><b>المدة:</b> {detail.durationMinutes} دقيقة</p><p><b>الأقسام:</b> {(detail.sections||[]).length}</p><p><b>الأسئلة:</b> {(detail.questions||[]).length}</p><p><b>الحالة:</b> {detail.active?'مفعل':'معطل'}</p></div><div className="examSummary"><div className="examSummaryHead"><h3>النتائج والمشاركون</h3><span>{filteredUsers.length} شخص</span></div><div className="search adminInlineSearch"><Search size={16}/><input value={resultSearch} onChange={e=>{setResultSearch(e.target.value);setResultPage(1)}} placeholder="ابحث بالاسم أو Discord ID..."/></div>{paged.map(u=>{const r=u.result;return <div className="participantRow" key={u.userId}><div><strong>{u.name||u.userId}</strong><small>Discord ID: {u.userId}</small><small>{r?(String(r.score)+'% · '+(r.passed?'ناجح':'غير ناجح')+' · '+fmt(r.submittedAt)):'دخل الاختبار أو بدأ محاولة'}</small></div><div className="rowActions">{r&&<Btn onClick={()=>setAnswerResult(r)}><Eye size={14}/> فتح وتصحيح الإجابات</Btn>}</div></div>})}{totalPages>1&&<div className="pagination"><Btn disabled={safePage<=1} onClick={()=>setResultPage(p=>Math.max(1,p-1))}>السابق</Btn><span>صفحة {safePage} من {totalPages}</span><Btn disabled={safePage>=totalPages} onClick={()=>setResultPage(p=>Math.min(totalPages,p+1))}>التالي</Btn></div>}</div></div>{answerResult&&<ExamAnswers result={answerResult} exam={detail} close={()=>setAnswerResult(null)} onGrade={grade}/>}</div>
 }
 const filtered=(state.exams||[]).filter(e=>{const q=search.trim().toLowerCase();return !q||(String(e.title||'')+' '+String(e.stage||'')+' '+String(e.id||'')).toLowerCase().includes(q)});
 return <div className="adminSection"><div className="panel"><div className="panelHead"><div><h2>إدارة الاختبارات</h2><p className="muted">الاختبارات مقسمة بصريًا داخل كل اختبار، مع حفظ فوري للحالة وتصحيح يدوي للإجابات المقالية.</p></div><div className="rowActions"><div className="search adminInlineSearch"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ابحث عن اختبار..."/></div><Btn onClick={()=>refreshSection('exams')}><RefreshCw size={15}/> تحديث</Btn><Btn className="primary" onClick={()=>setEditing({...blank})}><Plus size={16}/> إنشاء اختبار</Btn></div></div>{filtered.map(e=><div className="examAdminRow" key={e.id}><div><strong>{e.title}</strong><small>{e.questions?.length||0} سؤال · {(e.sections||[]).length} قسم · {e.durationMinutes} دقيقة</small></div><span className={e.active?'openBadge':'closedBadge'}>{e.active?'مفعل':'معطل'}</span><div className="rowActions"><Btn onClick={()=>{setDetail(e);setResultSearch('');setResultPage(1)}}><Users size={14}/> المشاركون</Btn><Btn onClick={()=>toggleActive(e)}>{e.active?'تعطيل':'تفعيل'}</Btn><Btn onClick={()=>openEdit(e)}>تعديل</Btn><button className="danger" onClick={()=>remove(e)}><Trash2 size={14}/></button></div></div>)}</div>{editing&&<ExamEditor exam={editing} setExam={setEditing} bank={state.questionBank||[]} save={save} cancel={()=>setEditing(null)}/>}</div>
}
`;
 s=s.slice(0,a)+enhanced+s.slice(b);

 /* Replace ExamAnswers + ExamEditor. */
 const aa=s.indexOf("function ExamAnswers("),ab=s.indexOf("function SpecificUsers(",aa);
 if(aa<0||ab<0)throw new Error('PROD_V3_ANSWER_EDITOR_TARGET_NOT_FOUND');
 const answers=`const answers=`function ExamAnswers({result,exam,close,onGrade}){const s=examAnswerStats(result,exam);return <div className="modalBackdrop" onClick={close}><div className="modalCard examAnswersModal" onClick={e=>e.stopPropagation()}><div className="panelHead"><div><h2>مراجعة وتصحيح إجابات المتقدم</h2><p>{result.name||result.userId} · Discord ID: {result.userId}</p></div><Btn onClick={close}>إغلاق</Btn></div><div className="examReviewStats"><span>النتيجة <b>{result.score}%</b></span><span>أجاب <b>{s.answered}/{s.total}</b></span><span>صح <b>{s.correct}</b></span><span>غلط <b>{s.wrong}</b></span><span>بدون إجابة <b>{s.unanswered}</b></span></div>{(exam.questions||[]).map((q,i)=>{const answer=String(result.answers?.[q.id]??'').trim(),gradable=q.type==='choice'||q.type==='yesno',autoCorrect=gradable&&answer===String(q.correct??''),manual=result.manualGrades?.[q.id],finalCorrect=manual!==undefined?Boolean(manual):autoCorrect;return <div className={'answerCard '+(finalCorrect?'answerCorrect':answer?'answerWrong':'')}\`} key={q.id}><strong>{i+1}. {q.text}</strong>{q.imageUrl&&<img className="examQuestionImage admin" src={q.imageUrl} alt="" loading="lazy"/>}<span><b>إجابة المتقدم:</b> {answer||'لم تتم الإجابة'}</span>{gradable&&<span><b>الإجابة الصحيحة:</b> {q.correct||'—'}</span>}{q.type==='text'&&<div className="manualGradeBox"><span>الإجابة المقالية تحتاج تصحيحًا يدويًا.</span><div className="rowActions"><Btn className={finalCorrect?'primary':'secondary'} onClick={()=>onGrade?.(result,q.id,true)}>✓ احتساب صحيحة</Btn><Btn className={!finalCorrect&&answer?'danger':'secondary'} onClick={()=>onGrade?.(result,q.id,false)}>✕ احتساب خاطئة</Btn></div></div>}</div>})}</div></div>}
function ExamEditor({exam,setExam,bank,save,cancel}){const patch=p=>setExam({...exam,...p}),usedBankIds=new Set((exam.questions||[]).map(q=>String(q.questionBankId||''))),availableBank=bank.filter(q=>!usedBankIds.has(String(q.id))),[bankOpen,setBankOpen]=useState(false),[dirty,setDirty]=useState(false);const update=p=>{setDirty(true);patch(p)};useEffect(()=>{const h=e=>{if(dirty){e.preventDefault();e.returnValue=''}};addEventListener('beforeunload',h);return()=>removeEventListener('beforeunload',h)},[dirty]);const addQuestion=q=>update({questions:[...(exam.questions||[]),cloneQuestion(q)]});const addSection=()=>update({sections:[...(exam.sections||[]),{id:'section-'+Date.now(),title:'قسم جديد',description:'',gateQuestionId:'',allowedAnswers:[],failMessage:'',nextSectionId:''}]});const updateSection=(i,p)=>update({sections:(exam.sections||[]).map((x,j)=>j===i?{...x,...p}:x)});const removeSection=i=>update({sections:(exam.sections||[]).filter((_,j)=>j!==i).map((x,j)=>({...x,nextSectionId:String(x.nextSectionId||'')===String((exam.sections||[])[i]?.id)?'':x.nextSectionId}))});const sectionQuestions=id=>(exam.questions||[]).filter(q=>String(q.sectionId||'')===String(id));return <div className="panel examEditor"><div className="examEditorStickySave"><Btn className="primary" onClick={()=>{save();setDirty(false)}}><Save size={16}/> حفظ الاختبار الآن</Btn><Btn onClick={()=>{if(dirty&&!confirm('لديك تعديلات غير محفوظة. هل تريد الخروج؟'))return;cancel()}}>إلغاء</Btn></div><div className="panelHead"><div><h2>{exam.id?'تعديل الاختبار':'إنشاء اختبار جديد'}</h2><p className="muted">احفظ من الأعلى أو من أسفل الصفحة. التعديلات غير المحفوظة ستظهر عند محاولة الخروج.</p></div></div><div className="examHeroEditor"><label>بانر الاختبار — رابط صورة<input value={exam.bannerUrl||''} onChange={e=>update({bannerUrl:e.target.value})} placeholder="https://example.com/exam-banner.webp"/><small>الأفضل: <b>1600×500 px</b> بنسبة 16:5، WebP/JPG، وحجم أقل من 500KB.</small></label>{exam.bannerUrl&&<img className="examAdminBanner" src={exam.bannerUrl} alt="" loading="lazy"/>}</div><div className="formGrid"><input value={exam.title} onChange={e=>update({title:e.target.value})} placeholder="عنوان الاختبار"/><input value={exam.description} onChange={e=>update({description:e.target.value})} placeholder="الوصف"/><input value={exam.stage} onChange={e=>update({stage:e.target.value})} placeholder="المرحلة"/><input type="number" min="1" max="100" value={exam.passingScore} onChange={e=>update({passingScore:Number(e.target.value)})} placeholder="درجة النجاح"/><input type="number" min="1" value={exam.durationMinutes} onChange={e=>update({durationMinutes:Number(e.target.value)})} placeholder="المدة بالدقائق"/><input type="number" min="1" value={exam.attemptsAllowed||1} onChange={e=>update({attemptsAllowed:Number(e.target.value)})} placeholder="المحاولات"/><input type="datetime-local" value={localDateTimeInput(exam.startAt)} onChange={e=>update({startAt:e.target.value})}/><input type="datetime-local" value={localDateTimeInput(exam.endAt)} onChange={e=>update({endAt:e.target.value})}/></div><div className="panel" style={{marginTop:12}}><h3>الأقسام ومسار الاختبار</h3><p className="muted">قسّم الاختبار إلى أسئلة/سيناريوهات/مقالي أو أي أقسام تريد. يمكن لقسم أن يشترط إجابة محددة للانتقال للقسم التالي.</p>{(exam.sections||[]).map((sec,i)=><div className="examSectionEditor" key={sec.id}><div className="sectionEditorHead"><strong>القسم {i+1}</strong><button type="button" className="danger" onClick={()=>removeSection(i)}><Trash2 size={14}/></button></div><div className="formGrid"><input value={sec.title||''} onChange={e=>updateSection(i,{title:e.target.value})} placeholder="عنوان القسم — مثال: السيناريوهات"/><input value={sec.description||''} onChange={e=>updateSection(i,{description:e.target.value})} placeholder="وصف مختصر للقسم"/><select value={sec.gateQuestionId||''} onChange={e=>updateSection(i,{gateQuestionId:e.target.value})}><option value="">بدون شرط انتقال</option>{sectionQuestions(sec.id).map(q=><option key={q.id} value={q.id}>{q.text}</option>)}</select><input value={(sec.allowedAnswers||[]).join('، ')} onChange={e=>updateSection(i,{allowedAnswers:e.target.value.split(/[،,]/).map(x=>x.trim()).filter(Boolean)})} placeholder="الإجابات المسموح بها للانتقال، مثال: رقيب، رقيب أول، ملازم"/><input value={sec.failMessage||''} onChange={e=>updateSection(i,{failMessage:e.target.value})} placeholder="رسالة عند عدم اجتياز شرط القسم"/><select value={sec.nextSectionId||''} onChange={e=>updateSection(i,{nextSectionId:e.target.value})}><option value="">التالي بالترتيب</option>{(exam.sections||[]).filter(x=>x.id!==sec.id).map(x=><option key={x.id} value={x.id}>{x.title}</option>)}</select></div></div>)}<Btn onClick={addSection}><Plus size={15}/> إضافة قسم</Btn></div><div className="panel" style={{marginTop:12}}><h3>من يمكنه دخول الاختبار؟</h3><div className="options">{[['all','الجميع'],['police','الشرطة فقط'],['link','بالرابط فقط'],['specific','أشخاص محددون']].map(([v,l])=><label key={v}><input type="radio" name={\`access-${exam.id||'new'}\`} checked={exam.accessType===v} onChange={()=>update({accessType:v,accessToken:v==='link'?(exam.accessToken||''):''})}/><span>{l}</span></label>)}</div>{exam.accessType==='specific'&&<SpecificUsers exam={exam} patch={update}/>} {exam.accessType==='link'&&<div className="linkBox"><label>رابط الاختبار الخاص</label>{exam.id&&exam.accessToken?<div className="rowActions"><input readOnly value={location.origin+'/academy/exams?exam='+encodeURIComponent(exam.id)+'&token='+encodeURIComponent(exam.accessToken)}/><Btn onClick={()=>navigator.clipboard?.writeText(location.origin+'/academy/exams?exam='+encodeURIComponent(exam.id)+'&token='+encodeURIComponent(exam.accessToken))}><Copy size={14}/> نسخ</Btn></div>:<p className="muted">احفظ الاختبار أولًا؛ سيتم إنشاء الرابط تلقائيًا.</p>}</div>}</div><label className="switchLine"><input type="checkbox" checked={exam.active!==false} onChange={e=>update({active:e.target.checked})}/> الاختبار مفعل</label><div className="bankToolbar"><h3>أسئلة الاختبار</h3><Btn onClick={()=>setBankOpen(!bankOpen)}><BookOpen size={15}/> إضافة من فهرس الأسئلة</Btn></div>{bankOpen&&<div className="bankPicker">{availableBank.map(q=><div className="bankPickRow" key={q.id}><div><strong>{q.text}</strong><small>{typeName(q.type)} · الصحيحة: {q.correct||'—'}</small></div><Btn onClick={()=>addQuestion(q)}>إضافة</Btn></div>)}{!availableBank.length&&<div className="emptyMini">لا توجد أسئلة متاحة من الفهرس لهذا الاختبار.</div>}</div>}{(exam.questions||[]).map((q,i)=><div key={q.id} className="examQuestionWrap"><div className="questionSectionAssign"><select value={q.sectionId||''} onChange={e=>update({questions:exam.questions.map((x,j)=>j===i?{...x,sectionId:e.target.value}:x)})}><option value="">بدون قسم</option>{(exam.sections||[]).map(sec=><option key={sec.id} value={sec.id}>{sec.title}</option>)}</select></div><QuestionEditor question={q} onChange={v=>update({questions:exam.questions.map((x,j)=>j===i?normalizeQuestion(v):x)})}/><Btn className="danger" onClick={()=>update({questions:exam.questions.filter((_,j)=>j!==i)})}><Trash2 size={14}/> حذف من الاختبار</Btn></div>)}<Btn onClick={()=>addQuestion({text:'سؤال جديد',type:'choice',options:['اختيار 1','اختيار 2'],correct:'',required:true,points:1})}><Plus size={15}/> سؤال جديد</Btn><div className="examEditorBottomSave"><Btn className="primary" onClick={()=>{save();setDirty(false)}}><Save size={16}/> حفظ الاختبار</Btn></div></div>}
`;
 s=s.slice(0,aa)+answers+s.slice(ab);
 /* Enhance QuestionEditor with image URL while preserving existing choice behavior. */
 const qa=s.indexOf("function QuestionEditor("),qb=s.indexOf("function QuestionBankAdmin(",qa);
 if(qa<0||qb<0)throw new Error('PROD_V3_QUESTION_EDITOR_TARGET_NOT_FOUND');
 const qedit=`const qedit=`function QuestionEditor({question,onChange,onDelete,collapsed=false,onToggleCollapse}){const patch=p=>onChange({...question,...p});const opts=question.options||[];return <div className={'panel questionAdmin '+(collapsed?'questionCollapsed':'')}\`}><div className="questionAdminHeader"><div className="questionAdminTitle"><span>{question.text||'سؤال بدون نص'}</span><small>{question.type==='choice'?'اختيارات':question.type==='yesno'?'نعم / لا':'إجابة نصية'} · {question.points||1} درجة</small></div>{onToggleCollapse&&<Btn onClick={onToggleCollapse}>{collapsed?'فتح':'طي'} <span aria-hidden="true">{collapsed?'⌄':'⌃'}</span></Btn>}</div>{!collapsed&&<><div className="formGrid"><textarea value={question.text} onChange={e=>patch({text:e.target.value})} placeholder="نص السؤال"/><select value={question.type} onChange={e=>patch({type:e.target.value,options:e.target.value==='choice'?(opts.length?opts:['اختيار 1','اختيار 2']):[],correct:''})}><option value="choice">اختيارات</option><option value="yesno">نعم / لا</option><option value="text">إجابة نصية</option></select><input type="number" min="1" value={question.points||1} onChange={e=>patch({points:Number(e.target.value)})} placeholder="الدرجة"/></div><label className="examImageUrlField">صورة السؤال — رابط<input value={question.imageUrl||''} onChange={e=>patch({imageUrl:e.target.value})} placeholder="https://example.com/question.webp"/><small>الأفضل: <b>1200×675 px</b> بنسبة 16:9، WebP/JPG، أقل من 300KB. الصورة تظهر أسفل نص السؤال.</small></label>{question.imageUrl&&<img className="examQuestionImage" src={question.imageUrl} alt="" loading="lazy"/>}{question.type==='choice'&&<div className="questionChoices">{opts.map((o,i)=><div className="choiceEditor" key={i}><input value={o} onChange={e=>patch({options:opts.map((x,j)=>j===i?e.target.value:x),correct:question.correct===o?e.target.value:question.correct})}/><button type="button" className="danger" onClick={()=>patch({options:opts.filter((_,j)=>j!==i),correct:question.correct===o?'':question.correct})}><Trash2 size={14}/></button></div>)}<Btn onClick={()=>patch({options:[...opts,\`اختيار ${opts.length+1}\`]})}><Plus size={14}/> اختيار</Btn><select value={question.correct||''} onChange={e=>patch({correct:e.target.value})}><option value="">الإجابة الصحيحة</option>{opts.map((o,i)=><option key={i} value={o}>{o}</option>)}</select></div>}{question.type==='yesno'&&<select value={question.correct||''} onChange={e=>patch({correct:e.target.value})}><option value="">الإجابة الصحيحة</option><option value="نعم">نعم</option><option value="لا">لا</option></select>}<label className="checkItem"><input type="checkbox" checked={question.required!==false} onChange={e=>patch({required:e.target.checked})}/> مطلوب</label>{onDelete&&<div className="questionAdminActions"><button type="button" className="danger" onClick={onDelete}><Trash2 size={14}/> حذف السؤال بالكامل</button></div>}</>}</div>}
`;
 s=s.slice(0,qa)+qedit+s.slice(qb);

 /* Notifications + system health on dashboard without changing data contracts. */
 const dashOld="function Dashboard({state,navigateTab}){const apps=state.applications||[],res=state.examResults||[],attempts=state.examAttempts||[],evals=state.evaluations||[];";
 if(s.includes(dashOld)){
   s=s.replace(dashOld,"function Dashboard({state,navigateTab}){const apps=state.applications||[],res=state.examResults||[],attempts=state.examAttempts||[],evals=state.evaluations||[];const pendingCount=apps.filter(x=>x.status==='pending').length+evals.filter(x=>x.status==='pending').length+attempts.filter(x=>!x.submittedAt).length;");
 }
 const dashAnchor='<div className="dashboardCards">';
 if(s.includes(dashAnchor)&&!s.includes('dashboardNotifications')){
   s=s.replace(dashAnchor,'<div className="dashboardNotifications"><div><strong>تنبيهات تحتاج متابعة</strong><span>{pendingCount}</span></div><small>تقديمات وتقييمات ومحاولات اختبار غير مكتملة.</small></div>'+dashAnchor);
 }
 /* Activity log cleanup: local feedback instead of setMsg from parent. */
 s=s.replace("const[mode,setMode]=useState('audit'),[data,setData]=useState({audit:[],loginLogs:[],departments:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),",
 "const[mode,setMode]=useState('audit'),[data,setData]=useState({audit:[],loginLogs:[],departments:[]}),[loading,setLoading]=useState(true),[error,setError]=useState(''),[actionMsg,setActionMsg]=useState(''),");
 s=s.replace("setMsg?.('تم مسح '+Number(d.auditDeleted||0)+' سجل إداري و'+Number(d.loginDeleted||0)+' تسجيل دخول، مع الاحتفاظ بآخر 3 أيام.');await load()",
 "setActionMsg('تم مسح '+Number(d.auditDeleted||0)+' سجل إداري و'+Number(d.loginDeleted||0)+' تسجيل دخول، مع الاحتفاظ بآخر 3 أيام.');await load()");
 const actAnchor='<div className="activityToolbar">';
 if(s.includes(actAnchor)&&!s.includes('{actionMsg&&<div className="adminMessage">{actionMsg}</div>}'))s=s.replace(actAnchor,'{actionMsg&&<div className="adminMessage">{actionMsg}</div>}'+actAnchor);
 await fs.writeFile(file,s,'utf8');
}

/* =========================
   CSS: exam editor / banners / grading / dashboard
   ========================= */
{
 const file='src/styles.css';
 let s=await fs.readFile(file,'utf8');
 const marker='/* === PRODUCTION ADMIN V3 === */';
 if(!s.includes(marker)){
  s+='\n'+marker+'\n'
  +'.examEditor{position:relative}.examEditorStickySave{position:sticky;top:8px;z-index:20;display:flex;justify-content:flex-end;gap:8px;padding:10px;margin:-4px -4px 14px;border:1px solid rgba(211,175,90,.25);border-radius:14px;background:rgba(7,17,30,.94);backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.25)}\n'
  +'.examEditorBottomSave{display:flex;justify-content:flex-end;padding-top:16px;margin-top:16px;border-top:1px solid rgba(92,125,166,.18)}\n'
  +'.examHeroEditor,.examSectionEditor{margin:12px 0;padding:14px;border:1px solid rgba(92,125,166,.2);border-radius:16px;background:#081523}.examHeroEditor label,.examImageUrlField{display:block;font-size:12px;color:#9eacbd}.examHeroEditor input,.examImageUrlField input{margin-top:6px}.examHeroEditor small,.examImageUrlField small{display:block;margin-top:6px;color:#71849a;line-height:1.6}.examAdminBanner{display:block;width:100%;max-width:1100px;max-height:320px;object-fit:cover;border-radius:16px;margin:12px auto;border:1px solid rgba(211,175,90,.22)}\n'
  +'.examQuestionImage{display:block;width:100%;max-width:760px;max-height:430px;object-fit:contain;border-radius:14px;margin:10px 0;border:1px solid rgba(92,125,166,.18)}.examQuestionImage.admin{max-width:520px}.questionSectionAssign{margin-bottom:8px}.questionSectionAssign select{max-width:360px}\n'
  +'.examSectionEditor{background:#0a1725}.sectionEditorHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.dashboardNotifications{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;margin-bottom:14px;border:1px solid rgba(211,175,90,.25);border-radius:14px;background:#0b1827}.dashboardNotifications>div{display:flex;gap:10px;align-items:center}.dashboardNotifications span{display:inline-flex;min-width:28px;height:28px;align-items:center;justify-content:center;border-radius:50%;background:#d3af5a;color:#07111e;font-weight:800}.dashboardNotifications small{color:#8294a9}.manualGradeBox{margin-top:10px;padding:10px;border-radius:12px;background:#081523;border:1px dashed rgba(211,175,90,.3)}.pagination{display:flex;justify-content:center;align-items:center;gap:12px;padding:14px}.pagination span{color:#9eacbd;font-size:12px}\n'
  +'@media(max-width:700px){.examEditorStickySave{position:sticky;top:4px;justify-content:stretch}.examEditorStickySave button{flex:1}.examEditorBottomSave{justify-content:stretch}.examEditorBottomSave button{width:100%}.dashboardNotifications{align-items:flex-start;flex-direction:column}.examAdminBanner{max-height:220px}}\n';
  await fs.writeFile(file,s,'utf8');
 }
}
console.log('Production admin V3 applied.');
