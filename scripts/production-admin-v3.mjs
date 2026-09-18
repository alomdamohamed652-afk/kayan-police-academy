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

/* Server transformations remain in the existing patch source. */
{
  const file='server/academy-production-original.mjs';
  let s=await fs.readFile(file,'utf8');

  s=replace(s,
    "function cleanQuestion(q){const type=['choice','yesno','text'].includes(q?.type)?q.type:",
    "function cleanQuestion(q){const type=['choice','yesno','text'].includes(q?.type)?q.type:",
    "noop");

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
 const allowedDiscordIds=accessType==='specific'?(Array.isArray(e?.allowedDiscordIds)?e.allowedDiscordIds.map(v=>String(v).trim()).filter(Boolean):[]):[];
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
`;
  s=s.slice(0,a)+model+s.slice(b);

  const publicOld="function publicExam(e){const questions=(Array.isArray(e?.questions)?e.questions:[]).map(cleanQuestion).filter(q=>q.text).map(q=>({id:q.id,text:q.text,type:q.type,options:q.options||[],required:q.required!==false,points:q.points}));return{...e,state:timeState(e?.startAt,e?.endAt),accessToken:undefined,allowedDiscordIds:undefined,questions}}";
  const publicFn="function publicExam(e){const questions=(Array.isArray(e?.questions)?e.questions:[]).map(cleanQuestion).filter(q=>q.text).map(q=>({id:q.id,text:q.text,type:q.type,options:q.options||[],required:q.required!==false,points:q.points,imageUrl:q.imageUrl||'',sectionId:q.sectionId||''}));const sections=Array.isArray(e?.sections)?e.sections.map(x=>({id:x.id,title:x.title||'',description:x.description||'',gateQuestionId:x.gateQuestionId||'',allowedAnswers:Array.isArray(x.allowedAnswers)?x.allowedAnswers:[],failMessage:x.failMessage||'',nextSectionId:x.nextSectionId||''})):[];return{...e,state:timeState(e?.startAt,e?.endAt),accessToken:undefined,allowedDiscordIds:undefined,sections,bannerUrl:e?.bannerUrl||'',questions}}";
  if(s.includes(publicOld))s=s.replace(publicOld,publicFn);
  else if(!s.includes(publicFn))throw new Error('PROD_V3_PUBLIC_EXAM_TARGET_NOT_FOUND');

  if(!s.includes("app.patch('/api/admin/exams/:examId/results/:resultId/grade'")){
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
  audit(c,'GRADE_EXAM_ANSWER',r.id,'question='+qid+';correct='+value+';score='+r.score);
  await saveDurable();
  res.json({ok:true,result:r});
 }catch(e){console.error('Manual exam grading failed:',e);res.status(503).json({error:'STORAGE_ERROR',retryable:true})}
});
`;
  s=replace(s,anchor,gradeRoute+anchor,'grade-route');
  }

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
function cleanupRateBuckets(){const cutoff=Date.now()-10*60*1000;for(const [k,v] of rateBuckets){if(!v||v.started<cutoff)rateBuckets.delete(k)}}
setInterval(cleanupRateBuckets,5*60*1000).unref?.();
`;
    s=s.slice(0,pos)+insert+s.slice(pos);
  }
  await fs.writeFile(file,s,'utf8');
}

/* UI transformations. The exam editor is injected once; activity cleanup state is intentionally not touched here. */
{
  const file='src/admin-center.jsx';
  let s=await fs.readFile(file,'utf8');

  const a=s.indexOf("function ExamsAdmin(");
  const b=s.indexOf("function ExamAnswers(",a);
  if(a<0||b<0)throw new Error('PROD_V3_EXAMS_UI_TARGET_NOT_FOUND');

  const enhanced=`function ExamsAdmin({state,setState,setMsg}){const[editing,setEditing]=useState(null),[detail,setDetail]=useState(null),[answerResult,setAnswerResult]=useState(null),[resultSearch,setResultSearch]=useState(''),[resultPage,setResultPage]=useState(1);const save=async()=>{try{const d=await api('/api/admin/exams/'+(editing.id||''),{method:editing.id?'PUT':'POST',body:JSON.stringify(editing)});if(d?.exam)setState(prev=>({...prev,exams:editing.id?(prev.exams||[]).map(x=>String(x.id)===String(d.exam.id)?d.exam:x):[d.exam,...(prev.exams||[])]}));setEditing(null);setMsg('تم حفظ الاختبار.')}catch(e){setMsg(errText(e))}};const toggleActive=async e=>{try{const d=await api('/api/admin/exams/'+e.id+'/active',{method:'PATCH',body:JSON.stringify({active:!e.active})});if(d?.exam)setState(prev=>({...prev,exams:(prev.exams||[]).map(x=>String(x.id)===String(e.id)?d.exam:x)}));setMsg(d?.exam?.active?'تم تفعيل الاختبار.':'تم تعطيل الاختبار.')}catch(x){setMsg(errText(x))}};const openEdit=e=>setEditing({...e,questions:(e.questions||[]).map(normalizeQuestion),sections:Array.isArray(e.sections)?e.sections:[]});const remove=async e=>{if(!confirm('حذف الاختبار؟'))return;try{const d=await api('/api/admin/exams/'+e.id,{method:'DELETE'});setState(d)}catch(x){setMsg(errText(x))}};if(detail){const rows=(state.examResults||[]).filter(r=>String(r.examId)===String(detail.id)&&(!resultSearch||[r.name,r.userId].join(' ').toLowerCase().includes(resultSearch.toLowerCase())));const pages=Math.max(1,Math.ceil(rows.length/20));const pageRows=rows.slice((resultPage-1)*20,resultPage*20);return <div className="adminSection"><div className="panel"><div className="panelHead"><div><h2>مشاركو: {detail.title}</h2><p>{rows.length} نتيجة محفوظة</p></div><Btn onClick={()=>setDetail(null)}>رجوع</Btn></div><div className="activitySearch"><Search size={16}/><input value={resultSearch} onChange={e=>{setResultSearch(e.target.value);setResultPage(1)}} placeholder="بحث بالاسم أو Discord ID"/></div>{pageRows.map(r=><div className="resultRow" key={r.id}><div><strong>{r.name}</strong><small>Discord ID: {r.userId} · {fmt(r.submittedAt)}</small></div><div className="resultScore">{r.score}%</div><Btn onClick={()=>setAnswerResult(r)}><Eye size={14}/> مراجعة</Btn></div>)}<div className="pagination"><Btn disabled={resultPage<=1} onClick={()=>setResultPage(p=>p-1)}>السابق</Btn><span>صفحة {resultPage} من {pages}</span><Btn disabled={resultPage>=pages} onClick={()=>setResultPage(p=>p+1)}>التالي</Btn></div></div>{answerResult&&<ExamAnswers result={answerResult} exam={detail} close={()=>setAnswerResult(null)} onGrade={async(result,questionId,correct)=>{try{const d=await api('/api/admin/exams/'+detail.id+'/results/'+result.id+'/grade',{method:'PATCH',body:JSON.stringify({questionId,correct})});if(d?.result){setState(prev=>({...prev,examResults:(prev.examResults||[]).map(x=>String(x.id)===String(result.id)?d.result:x)}));setAnswerResult(d.result);setMsg(correct?'تم احتساب الإجابة صحيحة وإعادة حساب الدرجة.':'تم احتساب الإجابة خاطئة وإعادة حساب الدرجة.')}}catch(e){setMsg(errText(e))}}}/>}</div>}return <div className="adminSection"><div className="panel"><div className="panelHead"><div><h2>إدارة الاختبارات</h2><p>إنشاء وتعديل الاختبارات والأقسام والأسئلة والنتائج.</p></div><Btn className="primary" onClick={()=>setEditing({id:'',title:'اختبار جديد',description:'',stage:'عام',accessType:'police',accessToken:'',allowedDiscordIds:[],passingScore:60,durationMinutes:30,attemptsAllowed:1,startAt:'',endAt:'',active:true,resultPublished:false,resultAnswersPublished:false,bannerUrl:'',sections:[],questions:[]})}><Plus size={15}/> اختبار جديد</Btn></div>{(state.exams||[]).map(e=><div className="adminListRow" key={e.id}><div><strong>{e.title}</strong><small>{e.stage} · {e.questions?.length||0} سؤال · {e.active?'مفعل':'غير مفعل'}</small></div><div className="rowActions"><Btn onClick={()=>setDetail(e)}><Users size={14}/> المشاركون</Btn><Btn onClick={()=>toggleActive(e)}>{e.active?'تعطيل':'تفعيل'}</Btn><Btn onClick={()=>openEdit(e)}>تعديل</Btn><button className="danger" onClick={()=>remove(e)}><Trash2 size={14}/></button></div></div>)}</div>{editing&&<ExamEditor exam={editing} setExam={setEditing} bank={state.questionBank||[]} save={save} cancel={()=>setEditing(null)}/>}</div>
}
`;
  s=s.slice(0,a)+enhanced+s.slice(b);

  const ea=s.indexOf("function ExamEditor("), eb=s.indexOf("function SpecificUsers(",ea);
  if(ea<0||eb<0)throw new Error('PROD_V3_EXAM_EDITOR_TARGET_NOT_FOUND');
  const editor=`function ExamEditor({exam,setExam,bank,save,cancel}){const patch=p=>setExam({...exam,...p}),used=new Set((exam.questions||[]).map(q=>String(q.questionBankId||''))),available=(bank||[]).filter(q=>!used.has(String(q.id))),[bankOpen,setBankOpen]=useState(false),[collapsed,setCollapsed]=useState({});const addQuestion=q=>patch({questions:[...(exam.questions||[]),normalizeQuestion(cloneQuestion(q))]});const sections=Array.isArray(exam.sections)?exam.sections:[];const addSection=()=>patch({sections:[...sections,{id:'section-'+Date.now(),title:'قسم جديد',description:'',gateQuestionId:'',allowedAnswers:[],failMessage:'',nextSectionId:''}]});const updateSection=(id,p)=>patch({sections:sections.map(x=>String(x.id)===String(id)?{...x,...p}:x)});const removeSection=id=>{const qs=(exam.questions||[]).map(q=>String(q.sectionId)===String(id)?{...q,sectionId:''}:q);patch({sections:sections.filter(x=>String(x.id)!==String(id)),questions:qs})};const saveNow=()=>{save();setExam({...exam})};return <div className="panel examEditor"><div className="examEditorStickySave"><Btn className="primary" onClick={saveNow}><Save size={16}/> حفظ الاختبار الآن</Btn><Btn onClick={cancel}>إلغاء</Btn></div><div className="panelHead"><div><h2>{exam.id?'تعديل الاختبار':'إنشاء اختبار جديد'}</h2><p className="muted">الإعدادات، البانر، الأقسام والأسئلة محفوظة مع نفس الـID.</p></div></div><div className="formGrid"><input value={exam.title||''} onChange={e=>patch({title:e.target.value})} placeholder="عنوان الاختبار"/><input value={exam.description||''} onChange={e=>patch({description:e.target.value})} placeholder="الوصف"/><input value={exam.stage||''} onChange={e=>patch({stage:e.target.value})} placeholder="المرحلة"/><input type="number" min="1" max="100" value={exam.passingScore||60} onChange={e=>patch({passingScore:Number(e.target.value)})} placeholder="درجة النجاح"/><input type="number" min="1" value={exam.durationMinutes||30} onChange={e=>patch({durationMinutes:Number(e.target.value)})} placeholder="المدة بالدقائق"/><input type="number" min="1" value={exam.attemptsAllowed||1} onChange={e=>patch({attemptsAllowed:Number(e.target.value)})} placeholder="المحاولات"/><input type="datetime-local" value={localDateTimeInput(exam.startAt)} onChange={e=>patch({startAt:e.target.value})}/><input type="datetime-local" value={localDateTimeInput(exam.endAt)} onChange={e=>patch({endAt:e.target.value})}/></div><div className="examHeroEditor"><label>بانر الاختبار — رابط صورة<input value={exam.bannerUrl||''} onChange={e=>patch({bannerUrl:e.target.value})} placeholder="https://example.com/banner.webp"/><small>الأفضل: <b>1600×500 px</b> بنسبة 16:5، WebP/JPG، وحجم أقل من 500KB.</small></label>{exam.bannerUrl&&<img className="examAdminBanner" src={exam.bannerUrl} alt="" loading="lazy"/>}</div><div className="panel" style={{marginTop:12}}><h3>من يمكنه دخول الاختبار؟</h3><div className="options">{[['all','الجميع'],['police','الشرطة فقط'],['link','بالرابط فقط'],['specific','أشخاص محددون']].map(([v,l])=><label key={v}><input type="radio" name={\`access-\${exam.id||'new'}\`} checked={exam.accessType===v} onChange={()=>patch({accessType:v,accessToken:v==='link'?(exam.accessToken||''):''})}/><span>{l}</span></label>)}</div>{exam.accessType==='specific'&&<SpecificUsers exam={exam} patch={patch}/>} {exam.accessType==='link'&&<div className="linkBox"><label>رابط الاختبار الخاص</label>{exam.id&&exam.accessToken?<div className="rowActions"><input readOnly value={\`\${location.origin}/academy/exams?exam=\${encodeURIComponent(exam.id)}&token=\${encodeURIComponent(exam.accessToken)}\`}/><Btn onClick={()=>navigator.clipboard?.writeText(\`\${location.origin}/academy/exams?exam=\${encodeURIComponent(exam.id)}&token=\${encodeURIComponent(exam.accessToken)}\`)}><Copy size={14}/> نسخ</Btn></div>:<p className="muted">احفظ الاختبار أولًا؛ سيتم إنشاء الرابط تلقائيًا.</p>}</div>}</div></div><label className="switchLine"><input type="checkbox" checked={exam.active!==false} onChange={e=>patch({active:e.target.checked})}/> الاختبار مفعل</label><div className="examSectionEditor"><div className="sectionEditorHead"><div><h3>الأقسام ومسار الاختبار</h3><small>قسّم الاختبار وحدد سؤال بوابة وشروط الانتقال.</small></div><Btn onClick={addSection}><Plus size={14}/> إضافة قسم</Btn></div>{sections.map((sec,i)=><div className="examSectionEditor" key={sec.id}><div className="sectionEditorHead"><strong>القسم {i+1}</strong><Btn className="danger" onClick={()=>removeSection(sec.id)}>حذف القسم</Btn></div><div className="formGrid"><input value={sec.title||''} onChange={e=>updateSection(sec.id,{title:e.target.value})} placeholder="عنوان القسم"/><input value={sec.description||''} onChange={e=>updateSection(sec.id,{description:e.target.value})} placeholder="وصف القسم"/><select value={sec.gateQuestionId||''} onChange={e=>updateSection(sec.id,{gateQuestionId:e.target.value})}><option value="">بدون سؤال بوابة</option>{(exam.questions||[]).map(q=><option key={q.id} value={q.id}>{q.text||q.id}</option>)}</select><input value={(sec.allowedAnswers||[]).join(', ')} onChange={e=>updateSection(sec.id,{allowedAnswers:e.target.value.split(',').map(x=>x.trim()).filter(Boolean)})} placeholder="الإجابات المسموح بها، افصل بفاصلة"/><input value={sec.failMessage||''} onChange={e=>updateSection(sec.id,{failMessage:e.target.value})} placeholder="رسالة إنهاء الاختبار عند عدم استيفاء الشرط"/><select value={sec.nextSectionId||''} onChange={e=>updateSection(sec.id,{nextSectionId:e.target.value})}><option value="">القسم التالي تلقائيًا</option>{sections.filter(x=>String(x.id)!==String(sec.id)).map(x=><option key={x.id} value={x.id}>{x.title||x.id}</option>)}</select></div></div>)}</div><div className="bankToolbar"><h3>أسئلة الاختبار</h3><Btn onClick={()=>setBankOpen(!bankOpen)}><BookOpen size={15}/> إضافة من فهرس الأسئلة</Btn></div>{bankOpen&&<div className="bankPicker">{available.map(q=><div className="bankPickRow" key={q.id}><div><strong>{q.text}</strong><small>{typeName(q.type)} · الصحيحة: {q.correct||'—'}</small></div><Btn onClick={()=>addQuestion(q)}>إضافة</Btn></div>)}{!available.length&&<div className="emptyMini">لا توجد أسئلة متاحة من الفهرس لهذا الاختبار.</div>}</div>}{(exam.questions||[]).map((q,i)=><div key={q.id} className="examQuestionWrap"><QuestionEditor question={q} sections={sections} onChange={v=>patch({questions:exam.questions.map((x,j)=>j===i?normalizeQuestion(v):x)})} collapsed={collapsed[q.id]===true} onToggleCollapse={()=>setCollapsed(c=>({...c,[q.id]:!c[q.id]}))} onDelete={()=>patch({questions:exam.questions.filter((_,j)=>j!==i)})}/></div>)}<Btn onClick={()=>addQuestion({text:'سؤال جديد',type:'choice',options:['اختيار 1','اختيار 2'],correct:'',required:true,points:1})}><Plus size={15}/> سؤال جديد</Btn><div className="examEditorBottomSave"><Btn className="primary" onClick={saveNow}><Save size={16}/> حفظ الاختبار</Btn></div></div>`;
  s=s.slice(0,ea)+editor+s.slice(eb);
  const qOld="function QuestionEditor({question,onChange,onDelete,collapsed=false,onToggleCollapse})";
  const qNew="function QuestionEditor({question,onChange,onDelete,collapsed=false,onToggleCollapse,sections=[]})";
  s=s.replace(qOld,qNew);
  const qField="</div>{question.type==='choice'&&<div className=\"questionChoices\">";
  const qInject=String.raw`</div><div className="questionImageField"><label>صورة السؤال — رابط<input value={question.imageUrl||''} onChange={e=>onChange({...question,imageUrl:e.target.value})} placeholder="https://example.com/question.webp"/><small>يفضل WebP/JPG، أقل من 2MB، وبعرض قريب من 1200px.</small>{question.imageUrl&&<img className="examQuestionImage admin" src={question.imageUrl} alt="معاينة السؤال" loading="lazy"/>}</label></div>{sections.length>0&&<label className="questionSectionAssign">القسم المرتبط بالسؤال<select value={question.sectionId||''} onChange={e=>onChange({...question,sectionId:e.target.value})}><option value="">بدون قسم</option>{sections.map(sec=><option key={sec.id} value={sec.id}>{sec.title||sec.id}</option>)}</select></label>}{question.type==='choice'&&<div className="questionChoices">`;
  if(!s.includes(qField))throw new Error("question field target missing");
  s=s.replace(qField,qInject);
  const aa=s.indexOf("function ExamAnswers("),ab=s.indexOf("function SpecificUsers(",aa);
  if(aa<0||ab<0)throw new Error('PROD_V3_ANSWER_EDITOR_TARGET_NOT_FOUND');
  const answers=`function ExamAnswers({result,exam,close,onGrade}){const s=examAnswerStats(result,exam);return <div className="modalBackdrop" onClick={close}><div className="modalCard examAnswersModal" onClick={e=>e.stopPropagation()}><div className="panelHead"><div><h2>مراجعة وتصحيح إجابات المتقدم</h2><p>{result.name||result.userId} · Discord ID: {result.userId}</p></div><Btn onClick={close}>إغلاق</Btn></div><div className="examReviewStats"><span>النتيجة <b>{result.score}%</b></span><span>أجاب <b>{s.answered}/{s.total}</b></span><span>صح <b>{s.correct}</b></span><span>غلط <b>{s.wrong}</b></span><span>بدون إجابة <b>{s.unanswered}</b></span></div>{(exam.questions||[]).map((q,i)=>{const answer=String(result.answers?.[q.id]??'').trim(),gradable=q.type==='choice'||q.type==='yesno',autoCorrect=gradable&&answer===String(q.correct??''),manual=result.manualGrades?.[q.id],finalCorrect=manual!==undefined?Boolean(manual):autoCorrect;return <div className={'answerCard '+(finalCorrect?'answerCorrect':answer?'answerWrong':'')} key={q.id}><strong>{i+1}. {q.text}</strong>{q.imageUrl&&<img className="examQuestionImage admin" src={q.imageUrl} alt="" loading="lazy"/>}<span><b>إجابة المتقدم:</b> {answer||'لم تتم الإجابة'}</span>{gradable&&<span><b>الإجابة الصحيحة:</b> {q.correct||'—'}</span>}{q.type==='text'&&<div className="manualGradeBox"><span>الإجابة المقالية تحتاج تصحيحًا يدويًا.</span><div className="rowActions"><Btn className={finalCorrect?'primary':'secondary'} onClick={()=>onGrade?.(result,q.id,true)}>✓ احتساب صحيحة</Btn><Btn className={!finalCorrect&&answer?'danger':'secondary'} onClick={()=>onGrade?.(result,q.id,false)}>✕ احتساب خاطئة</Btn></div></div>}</div>})}</div></div>}
`;
  s=s.slice(0,aa)+answers+s.slice(ab);

  const qa=s.indexOf("function QuestionEditor("),qb=s.indexOf("function QuestionBankAdmin(",qa);
  if(qa<0||qb<0)throw new Error('PROD_V3_QUESTION_EDITOR_TARGET_NOT_FOUND');
  const qedit=`function QuestionEditor({question,onChange,onDelete,collapsed=false,onToggleCollapse}){const patch=p=>onChange({...question,...p});const opts=question.options||[];return <div className={'panel questionAdmin '+(collapsed?'questionCollapsed':'')}><div className="questionAdminHeader"><div className="questionAdminTitle"><span>{question.text||'سؤال بدون نص'}</span><small>{question.type==='choice'?'اختيارات':question.type==='yesno'?'نعم / لا':'إجابة نصية'} · {question.points||1} درجة</small></div>{onToggleCollapse&&<Btn onClick={onToggleCollapse}>{collapsed?'فتح':'طي'} <span aria-hidden="true">{collapsed?'⌄':'⌃'}</span></Btn>}</div>{!collapsed&&<><div className="formGrid"><textarea value={question.text} onChange={e=>patch({text:e.target.value})} placeholder="نص السؤال"/><select value={question.type} onChange={e=>patch({type:e.target.value,options:e.target.value==='choice'?(opts.length?opts:['اختيار 1','اختيار 2']):[],correct:''})}><option value="choice">اختيارات</option><option value="yesno">نعم / لا</option><option value="text">إجابة نصية</option></select><input type="number" min="1" value={question.points||1} onChange={e=>patch({points:Number(e.target.value)})} placeholder="الدرجة"/></div><label className="examImageUrlField">صورة السؤال — رابط<input value={question.imageUrl||''} onChange={e=>patch({imageUrl:e.target.value})} placeholder="https://example.com/question.webp"/><small>الأفضل: <b>1200×675 px</b> بنسبة 16:9، WebP/JPG، أقل من 300KB. الصورة تظهر أسفل نص السؤال.</small></label>{question.imageUrl&&<img className="examQuestionImage" src={question.imageUrl} alt="" loading="lazy"/>}{question.type==='choice'&&<div className="questionChoices">{opts.map((o,i)=><div className="choiceEditor" key={i}><input value={o} onChange={e=>patch({options:opts.map((x,j)=>j===i?e.target.value:x),correct:question.correct===o?e.target.value:question.correct})}/><button type="button" className="danger" onClick={()=>patch({options:opts.filter((_,j)=>j!==i),correct:question.correct===o?'':question.correct})}><Trash2 size={14}/></button></div>)}<Btn onClick={()=>patch({options:[...opts,'اختيار '+(opts.length+1)]})}><Plus size={14}/> اختيار</Btn><select value={question.correct||''} onChange={e=>patch({correct:e.target.value})}><option value="">الإجابة الصحيحة</option>{opts.map((o,i)=><option key={i} value={o}>{o}</option>)}</select></div>}{question.type==='yesno'&&<select value={question.correct||''} onChange={e=>patch({correct:e.target.value})}><option value="">الإجابة الصحيحة</option><option value="نعم">نعم</option><option value="لا">لا</option></select>}<label className="checkItem"><input type="checkbox" checked={question.required!==false} onChange={e=>patch({required:e.target.checked})}/> مطلوب</label>{onDelete&&<div className="questionAdminActions"><button type="button" className="danger" onClick={onDelete}><Trash2 size={14}/> حذف السؤال بالكامل</button></div>}</>}</div>}
`;
  s=s.slice(0,qa)+qedit+s.slice(qb);

  await fs.writeFile(file,s,'utf8');
}

/* CSS */
{
 const file='src/styles.css';
 let s=await fs.readFile(file,'utf8');
 const marker='/* === PRODUCTION ADMIN V3 === */';
 if(!s.includes(marker)){
  s+='\n'+marker+'\n'+'.examEditor{position:relative}.examEditorStickySave{position:sticky;top:8px;z-index:20;display:flex;justify-content:flex-end;gap:8px;padding:10px;margin:-4px -4px 14px;border:1px solid rgba(211,175,90,.25);border-radius:14px;background:rgba(7,17,30,.94);backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.25)}\n'
  +'.examEditorBottomSave{display:flex;justify-content:flex-end;padding-top:16px;margin-top:16px;border-top:1px solid rgba(92,125,166,.18)}\n'
  +'.examHeroEditor,.examSectionEditor{margin:12px 0;padding:14px;border:1px solid rgba(92,125,166,.2);border-radius:16px;background:#081523}.examHeroEditor label,.examImageUrlField{display:block;font-size:12px;color:#9eacbd}.examHeroEditor input,.examImageUrlField input{margin-top:6px}.examHeroEditor small,.examImageUrlField small{display:block;margin-top:6px;color:#71849a;line-height:1.6}.examAdminBanner{display:block;width:100%;max-width:1100px;max-height:320px;object-fit:cover;border-radius:16px;margin:12px auto;border:1px solid rgba(211,175,90,.22)}\n'
  +'.examQuestionImage{display:block;width:100%;max-width:760px;max-height:430px;object-fit:contain;border-radius:14px;margin:10px 0;border:1px solid rgba(92,125,166,.18)}.examQuestionImage.admin{max-width:520px}.questionSectionAssign{margin-bottom:8px}.questionSectionAssign select{max-width:360px}\n'
  +'.examSectionEditor{background:#0a1725}.sectionEditorHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.dashboardNotifications{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;margin-bottom:14px;border:1px solid rgba(211,175,90,.25);border-radius:14px;background:#0b1827}.dashboardNotifications>div{display:flex;gap:10px;align-items:center}.dashboardNotifications span{display:inline-flex;min-width:28px;height:28px;align-items:center;justify-content:center;border-radius:50%;background:#d3af5a;color:#07111e;font-weight:800}.dashboardNotifications small{color:#8294a9}.manualGradeBox{margin-top:10px;padding:10px;border-radius:12px;background:#081523;border:1px dashed rgba(211,175,90,.3)}.pagination{display:flex;justify-content:center;align-items:center;gap:12px;padding:14px}.pagination span{color:#9eacbd;font-size:12px}\n'
  +'@media(max-width:700px){.examEditorStickySave{position:sticky;top:4px;justify-content:stretch}.examEditorStickySave button{flex:1}.examEditorBottomSave{justify-content:stretch}.examEditorBottomSave button{width:100%}.dashboardNotifications{align-items:flex-start;flex-direction:column}.examAdminBanner{max-height:220px}}\n';
  await fs.writeFile(file,s,'utf8');
 }
}
console.log('Production admin V3 applied.');
