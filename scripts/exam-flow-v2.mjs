import fs from 'node:fs/promises';
const replace=(s,a,b,l)=>{if(!s.includes(a)){if(s.includes(b))return s;throw new Error('EXAM_FLOW_TARGET_NOT_FOUND:'+l)}return s.replace(a,b)};
let s=await fs.readFile('src/main.jsx','utf8');
s=replace(s,"const submit=async(auto=false)=>{","const submit=async(auto=false,reason='')=>{",'submit-signature');
s=replace(s,"const d=await api('/api/exams/'+currentActive.id+'/submit',{method:'POST',body:JSON.stringify({answers:currentAnswers,accessToken:inviteToken||undefined})});","const d=await api('/api/exams/'+currentActive.id+'/submit',{method:'POST',body:JSON.stringify({answers:currentAnswers,accessToken:inviteToken||undefined,earlyExit:reason==='rule'})});",'submit-body');
s=replace(s,"setSuccess(auto?'انتهى الوقت وتم تسليم الاختبار تلقائيًا للمراجعة.':'تم تسليم الاختبار بنجاح، والنتيجة الآن قيد المراجعة من الإدارة.');","setSuccess(auto?'انتهى الوقت وتم تسليم الاختبار تلقائيًا للمراجعة.':'تم إنهاء الاختبار وحفظ إجاباتك بنجاح.');",'submit-message');
s=replace(s,"if(auto&&String(e?.message||'').includes('EXAM_TIME_EXPIRED'))","if(auto&&String(e?.message||'').includes('EXAM_TIME_EXPIRED'))",'auto-error');
const a=s.indexOf("if(active&&attempt)return <Page title={active.title}"),b=s.indexOf("const visible=exams.filter",a);
if(a<0||b<0)throw new Error('EXAM_FLOW_ACTIVE_RENDER_TARGET_NOT_FOUND');
s=s.slice(0,a)+"if(active&&attempt)return <ExamFlow active={active} attempt={attempt} answers={answers} setAnswers={setAnswers} submit={submit} submitting={submitting} error={error}/>;"+s.slice(b);
const anchor="function Exams({user}){";
const component=`function ExamFlow({active,attempt,answers,setAnswers,submit,submitting,error}){
 const sections=Array.isArray(active.sections)&&active.sections.length?active.sections:[{id:'__all__',title:'الاختبار',description:'',gateQuestionId:'',allowedAnswers:[],failMessage:'',nextSectionId:''}];
 const [index,setIndex]=useState(0);
 const current=sections[Math.min(index,sections.length-1)]||sections[0];
 const questions=useMemo(()=>{const all=Array.isArray(active.questions)?active.questions:[];return current.id==='__all__'?all:all.filter(q=>String(q.sectionId||'')===String(current.id))},[active.questions,current.id]);
 const last=index>=sections.length-1;
 const nextId=current.nextSectionId;
 const nextIndex=nextId?sections.findIndex(x=>String(x.id)===String(nextId)):index+1;
 const next=nextIndex>=0&&nextIndex<sections.length?nextIndex:-1;
 const nextSection=next>=0?sections[next]:null;
 const nextGateId=String(nextSection?.gateQuestionId||'');
 const nextGateAnswer=String(answers[nextGateId]??'').trim();
 const nextGateAllowed=!nextSection||!nextGateId||!Array.isArray(nextSection.allowedAnswers)||!nextSection.allowedAnswers.length||nextSection.allowedAnswers.map(String).includes(nextGateAnswer);
 const answered=questions.filter(q=>String(answers[q.id]??'').trim()!=='').length;
 const requiredMissing=questions.some(q=>q.required!==false&&String(answers[q.id]??'').trim()==='');
 const goNext=()=>{if(requiredMissing)return;if(!nextGateAllowed){submit(false,'rule',current.id);return}if(last){submit(false,'',current.id);return}if(next>=0)setIndex(next)};
 return <Page title={active.title} sub={active.description||'اختبار أكاديمي'}>
  {active.bannerUrl&&<img className="examStudentBanner" src={active.bannerUrl} alt="" loading="lazy"/>}
  <div className="examSectionStepper">{sections.map((x,i)=><div className={i===index?'active':i<index?'done':''} key={x.id}><span>{i+1}</span><b>{x.title}</b></div>)}</div>
  <div className="examTimerHero"><div><span>الوقت المتبقي</span><strong>{timeLabelLocal(Math.max(0,new Date(attempt.expiresAt).getTime()-Date.now()))}</strong></div><div className="examTimerMeta"><b>{answered}/{questions.length}</b> تمت الإجابة · <span className="autosaveTiny saved">الحفظ يعمل تلقائيًا</span></div></div>
  <div className="panel examForm">
   <div className="examSectionHero"><span>القسم {index+1} من {sections.length}</span><h2>{current.title}</h2>{current.description&&<p>{current.description}</p>}</div>
   {questions.length?questions.map((q,i)=><div className="examQuestionNumbered" key={q.id}><span className="questionNumber">السؤال {i+1}</span><Question q={q} value={answers[q.id]} setValue={v=>setAnswers(a=>({...a,[q.id]:v}))}/></div>):<div className="examSectionEmpty">لا توجد أسئلة مضافة إلى هذا القسم حاليًا.</div>}
   {requiredMissing&&<div className="statusNote">أكمل الأسئلة المطلوبة في هذا القسم للانتقال.</div>}
   <div className="examFlowActions">{index>0&&<Btn onClick={()=>setIndex(index-1)}>السابق</Btn>}<Btn className="primary" disabled={submitting||requiredMissing} onClick={goNext}>{last?'تسليم الاختبار':'القسم التالي'} <ArrowLeft size={17}/></Btn></div>
   {error&&<div className="errorBox">{error}</div>}
  </div>
 </Page>
}
const timeLabelLocal=ms=>{const sec=Math.max(0,Math.floor(ms/1000)),h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return(h?String(h).padStart(2,'0')+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')};
`;
s=replace(s,anchor,component+anchor,'flow-component');
await fs.writeFile('src/main.jsx',s,'utf8');

let srv=await fs.readFile('server/academy-production-original.mjs','utf8');
srv=replace(srv,"if(!expired&&!attempt.submittedAt)for(const q of examForAttempt.questions||[])if(String(answers[q.id]??'').trim()==='')return res.status(400).json({error:'REQUIRED_QUESTION_MISSING'});","const earlyExit=Boolean(req.body?.earlyExit); const gateFailed=Array.isArray(examForAttempt.sections)&&examForAttempt.sections.some(sec=>{const gateId=String(sec?.gateQuestionId||'');if(!gateId)return false;const answer=String(answers[gateId]??'').trim();const allowed=Array.isArray(sec?.allowedAnswers)?sec.allowedAnswers.map(String):[];return allowed.length>0&&!allowed.includes(answer)}); if(earlyExit&&!gateFailed&&!expired)return res.status(400).json({error:'EARLY_EXIT_NOT_ALLOWED'}); if(!expired&&!attempt.submittedAt&&!earlyExit)for(const q of examForAttempt.questions||[])if(String(answers[q.id]??'').trim()==='')return res.status(400).json({error:'REQUIRED_QUESTION_MISSING'});",'early-exit-required');
srv=replace(srv,"const result={id:'result-'+String(attempt.id),examId:e.id,userId:uid,name:attempt.name||c.police?.name||c.x.global_name||c.x.username||'متقدم',score,passed:score>=Number(e.passingScore||60),submittedAt,answers,durationSeconds:activeDurationSeconds,autoSubmitted:Boolean(expired),attemptId:attempt.id};","const result={id:'result-'+String(attempt.id),examId:e.id,userId:uid,name:attempt.name||c.police?.name||c.x.global_name||c.x.username||'متقدم',score,passed:score>=Number(e.passingScore||60),submittedAt,answers,durationSeconds:activeDurationSeconds,autoSubmitted:Boolean(expired),terminatedByRule:Boolean(earlyExit),attemptId:attempt.id};",'early-exit-result');
await fs.writeFile('server/academy-production-original.mjs',srv,'utf8');
const cssFile='src/styles.css';let css=await fs.readFile(cssFile,'utf8');const marker='/* === EXAM FLOW V2 === */';if(!css.includes(marker)){css+='\n'+marker+'\n'+'.examStudentBanner{display:block;width:100%;max-height:320px;object-fit:cover;border-radius:18px;margin:0 0 14px;border:1px solid rgba(211,175,90,.2)}\n.examSectionStepper{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:9px;padding:4px 0 12px}.examSectionStepper>div{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;min-height:46px;padding:9px 12px;border:1px solid rgba(92,125,166,.22);border-radius:13px;background:#081523;color:#8192a7;text-align:center;transition:.2s}.examSectionStepper>div.active{border-color:rgba(211,175,90,.6);background:linear-gradient(135deg,#142438,#0b1725);color:#e3c66f;box-shadow:0 7px 20px #0003}.examSectionStepper>div.done{border-color:rgba(111,214,160,.25);color:#9fd9bc}.examSectionStepper span{width:26px;height:26px;flex:0 0 26px;display:grid;place-items:center;border-radius:50%;background:#122235;font-weight:800}.examSectionStepper b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.examSectionHero{padding:16px 4px 14px;margin-bottom:14px;border-bottom:1px solid rgba(92,125,166,.18)}.examSectionHero>span{display:inline-block;font-size:11px;color:#d3af5a;margin-bottom:3px}.examSectionHero h2{margin:2px 0 0;font-size:22px}.examSectionHero p{color:#8ea0b4;margin:6px 0 0;line-height:1.7}.examSectionEmpty{padding:24px;text-align:center;color:#8492a4;border:1px dashed #30445f;border-radius:14px}.examFlowActions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-top:14px;border-top:1px solid rgba(92,125,166,.18)}\n@media(max-width:560px){.examStudentBanner{max-height:200px}.examSectionStepper{grid-template-columns:1fr 1fr}.examSectionStepper>div{min-height:42px;padding:8px}.examSectionHero h2{font-size:19px}.examFlowActions{flex-direction:column}.examFlowActions button{width:100%}}\n'}await fs.writeFile(cssFile,css,'utf8');
console.log('Exam flow V2 applied.');
