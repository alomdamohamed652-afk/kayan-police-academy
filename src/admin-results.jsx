import React, { useEffect, useState } from 'react';
import { Search, Eye, CheckCircle2, XCircle, ClipboardList, Clock3 } from 'lucide-react';

export default function AdminResults(){
  const [rows,setRows]=useState([]),[q,setQ]=useState(''),[selected,setSelected]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=async()=>{try{setLoading(true);const r=await fetch('/api/admin/results');const d=await r.json();if(!r.ok)throw new Error(d.error||'تعذر تحميل النتائج');setRows(d.results||[]);setError('')}catch(e){setError(e.message)}finally{setLoading(false)}};
  useEffect(()=>{load()},[]);
  const filtered=rows.filter(x=>`${x.name||''} ${x.discordId||''} ${x.examTitle||''}`.toLowerCase().includes(q.toLowerCase()));
  return <section className="resultsCenter">
    <div className="resultsToolbar"><div><span className="eyebrow">ACADEMY RESULTS</span><h2>نتائج الاختبارات</h2><p>مراجعة درجات وإجابات جميع المحاولات المسجلة.</p></div><div className="resultStats"><b>{rows.length}</b><span>محاولة</span></div></div>
    <div className="panel table resultsTable">
      <div className="search"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث بالاسم أو Discord ID أو الاختبار"/></div>
      {loading?<div className="empty"><Clock3/><h3>جاري تحميل النتائج...</h3></div>:error?<div className="empty"><XCircle/><h3>{error}</h3></div>:!filtered.length?<div className="empty"><ClipboardList/><h3>لا توجد محاولات مسجلة حتى الآن</h3></div>:filtered.map((r,i)=><div className="row resultRow" key={r.id||i}>
        <div className="avatar">{(r.name||'؟').slice(0,1)}</div><div className="person"><b>{r.name||'غير معروف'}</b><small>{r.examTitle||'اختبار'} · {r.discordId||'—'}</small></div>
        <span className="scorePill">{Number(r.percentage??r.score??0)}%</span><span className={r.passed?'status good':'status bad'}>{r.passed?<><CheckCircle2 size={15}/> ناجح</>:<><XCircle size={15}/> غير مجتاز</>}</span><small>{r.submittedAt?new Date(r.submittedAt).toLocaleString('ar-EG'):''}</small><button className="iconBtn" onClick={()=>setSelected(r)} title="عرض التفاصيل"><Eye size={17}/></button>
      </div>)}
    </div>
    {selected&&<div className="modalBackdrop" onClick={()=>setSelected(null)}><div className="resultModal" onClick={e=>e.stopPropagation()}><button className="modalClose" onClick={()=>setSelected(null)}>×</button><span className="eyebrow">ATTEMPT DETAILS</span><h2>{selected.name||'غير معروف'}</h2><p>{selected.examTitle||'اختبار'}</p><div className="resultHero"><b>{Number(selected.percentage??selected.score??0)}%</b><span>{selected.passed?'ناجح':'غير مجتاز'}</span></div><div className="detailGrid"><div><small>الدرجة</small><b>{selected.score??'—'} / {selected.total??'—'}</b></div><div><small>التاريخ</small><b>{selected.submittedAt?new Date(selected.submittedAt).toLocaleString('ar-EG'):'—'}</b></div><div><small>Discord ID</small><b>{selected.discordId||'—'}</b></div></div><div className="answersReview">{(selected.answers||[]).map((a,j)=><div className="answerCard" key={j}><b>{j+1}. {a.question||'السؤال'}</b><span>إجابة المتقدم: {a.answer||'—'}</span>{a.correctAnswer!=null&&<span>الإجابة الصحيحة: {a.correctAnswer}</span>}<strong className={a.correct?'correct':'wrong'}>{a.correct?'صحيح':'غير صحيح'} · {a.points??0} نقطة</strong></div>)}</div></div></div>}
  </section>
}
