import fs from 'node:fs/promises';

// Keep the production build preparation limited to transformations that still
// exist in the current source tree. The old citizen/roster hotfixes targeted
// code that was already removed/refactored and caused Render builds to fail
// before Vite could even start.
const main = await fs.readFile('src/main.jsx', 'utf8');
const start = main.indexOf('function Applications({user}){');
const end = main.indexOf('function ApplicationStatus({app}){', start);

if (start < 0 || end < 0) {
  throw new Error('PREPARE_BUILD_APPLICATION_FUNCTION_NOT_FOUND');
}

const applications = `function Applications({user}){const[pub,setPub]=useState(null),[mine,setMine]=useState([]),[answers,setAnswers]=useState({}),[msg,setMsg]=useState(''),[err,setErr]=useState('');const load=async()=>{setErr('');try{const p=await api('/api/public/academy');setPub(p);if(user.permissions?.isCitizen){try{const m=await api('/api/my/applications');setMine(m.applications||[]);const last=(m.applications||[])[0];if(last)setAnswers(last.answers||{})}catch(e){setMine([])}}else{setMine([])}}catch(e){setErr(errorText(e))}};useEffect(load,[user.permissions?.isCitizen]);if(err)return <Page title="التقديمات" sub="التقديم الرسمي للالتحاق بأكاديمية شرطة كيان."><div className="panel empty"><p>{err}</p><Retry onClick={load}/></div></Page>;if(!pub)return <Page title="التقديمات" sub="جاري تحميل التقديمات..."><div className="panel empty">جاري التحميل...</div></Page>;if(!user.permissions?.isCitizen)return <Page title="التقديمات" sub="التقديم الرسمي للالتحاق بأكاديمية شرطة كيان."><div className="panel empty"><FileText size={30}/><h2>التقديم مخصص للمواطنين</h2><p>أفراد الشرطة لا يقدمون على دفعات القبول.</p></div></Page>;const b=pub.batch,state=b?.state,already=b&&mine.some(a=>a.batchId===b.id),submit=async()=>{setMsg('');try{await api('/api/applications',{method:'POST',body:JSON.stringify({answers})});setMsg('تم إرسال طلبك بنجاح.');await load()}catch(e){setMsg(errorText(e))}};return <Page title="التقديمات" sub="التقديم الرسمي للالتحاق بأكاديمية شرطة كيان."><div className="applicationHero panel"><div><span className="eyebrow">APPLICATIONS</span><h2>{pub.application.title}</h2><p className="muted">{pub.application.description}</p></div><span className={state==='open'?'openBadge':'closedBadge'}>{state==='open'?'التقديم مفتوح':state==='upcoming'?'لم يبدأ بعد':'لا توجد دفعة مفتوحة'}</span></div>{b&&<div className="batchBanner">الدفعة الحالية: <strong>{b.name}</strong> · من {fmt(b.startAt)} إلى {fmt(b.endAt)}</div>}{already?<ApplicationStatus app={mine.find(a=>a.batchId===b.id)}/>:state==='open'?<div className="panel formPanel">{pub.application.questions.map(q=><Question key={q.id} q={q} value={answers[q.id]} setValue={v=>setAnswers(a=>({...a,[q.id]:v}))}/>)}<Btn className="primary" onClick={submit}>إرسال الطلب <ArrowLeft size={17}/></Btn>{msg&&<div className={msg.startsWith('تم')?'successBox':'errorBox'}>{msg}</div>}</div>:<div className="panel empty"><FileText/><h2>{state==='upcoming'?'التقديم لم يبدأ بعد':'لا توجد دفعة تقديم مفتوحة حاليًا'}</h2><p>عند فتح دفعة جديدة ستظهر هنا تلقائيًا.</p></div>}<div className="panel"><div className="panelHead"><h2>طلباتي السابقة</h2><span className="ok">{mine.length} طلب</span></div>{mine.map(a=><ApplicationStatus key={a.id} app={a}/>)}</div></Page>}`;

const patchedMain = main.slice(0, start) + applications + main.slice(end);
await fs.writeFile('src/main.jsx', patchedMain, 'utf8');

console.log('Kayan build preparation complete.');
