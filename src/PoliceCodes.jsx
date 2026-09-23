import React,{useEffect,useMemo,useState}from'react';
import{BookOpen,Search,Copy,Check,Shield,Car,Radio,MapPin,AlertTriangle,Settings,UserRound}from'lucide-react';

const fallback=[
{id:'movement',title:'أكواد الحركة والاستجابة',icon:'car',tone:'blue',items:[
['1','توجه عادي (بدون أنوار أو صوت)'],['2','توجه سريع (أنوار فقط)'],['3','استجابة طارئة (أنوار + سيرين)'],['4','الوضع آمن (لا يوجد دعم مطلوب)'],['5','تحتاج دعم'],['6','تمشيط / بحث في المنطقة']]},
{id:'status',title:'حالة الضابط',icon:'user',tone:'green',items:[['7','خارج الخدمة'],['8','داخل الخدمة'],['9','إعادة البلاغ']]},
{id:'location',title:'البلاغ والموقع',icon:'radio',tone:'orange',items:[['20','تحديد الموقع'],['21','وصلت للموقع'],['22','إلغاء البلاغ'],['23','تم استلام البلاغ']]},
{id:'wanted',title:'المطلوب والمرور',icon:'alert',tone:'red',items:[['30','شخص مشتبه به'],['31','شخص مطلوب'],['32','مركبة مشتبه بها'],['33','مركبة مطلوبة'],['38','استيقاف مروري']]},
{id:'danger',title:'الحالات الخطرة',icon:'alert',tone:'purple',items:[['80','مطاردة'],['81','مطاردة سيرًا على الأقدام'],['82','مطاردة مركبة'],['90','حالة طارئة - دعم جميع الوحدات'],['95','تم القبض / انتهاء الحالة']]},
{id:'services',title:'خدمات عامة',icon:'settings',tone:'slate',items:[['41','توقف دورية'],['42','تغيير القطاع'],['43','تحديث الموقع'],['44','تجهيز مركبة'],['45','صيانة / عطل'],['46','طلب إمدادات']]}];

const icons={car:Car,user:UserRound,radio:Radio,alert:AlertTriangle,settings:Settings};
export function PoliceCodes(){
 const[data,setData]=useState(null),[q,setQ]=useState(''),[copied,setCopied]=useState('');
 useEffect(()=>{fetch('/api/police-codes').then(r=>r.ok?r.json():Promise.reject()).then(d=>setData(d.items||[])).catch(()=>setData(fallback))},[]);
 const groups=data||fallback;
 const visible=useMemo(()=>groups.map(g=>({...g,items:(g.items||[]).filter(x=>!q.trim()||String(x.code??x[0]).includes(q.trim())||String(x.description??x[1]).toLowerCase().includes(q.trim().toLowerCase()))})).filter(g=>g.items.length),[groups,q]);
 const copy=async code=>{try{await navigator.clipboard.writeText('Code '+code);setCopied(String(code));setTimeout(()=>setCopied(''),1200)}catch{}};
 return <div className="codesPage"><section className="codesHero"><div className="eyebrow">KAYAN POLICE TRAINING</div><h1>دليل الأكواد الشرطية</h1><p>مرجع تدريبي موحّد لفهم واستخدام رموز العمليات والاتصالات داخل شرطة كيان.</p><div className="codesHeroMeta"><span><BookOpen size={16}/> مرجع تدريبي</span><span><Shield size={16}/> مستقل عن Dispatch</span><span><MapPin size={16}/> للاستخدام الميداني</span></div></section><div className="codesToolbar"><div className="codesSearch"><Search size={17}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="ابحث بالكود أو الوصف..."/></div><span>{visible.reduce((n,g)=>n+g.items.length,0)} كود</span></div><div className="codesGrid">{visible.map(g=>{const I=icons[g.icon]||Shield;return <section className={'codeGroup '+g.tone} key={g.id}><header><div className="codeGroupIcon"><I size={21}/></div><div><h2>{g.title}</h2><small>مرجع تدريبي</small></div></header><div className="codeItems">{g.items.map(x=>{const code=String(x.code??x[0]),desc=String(x.description??x[1]);return <div className="codeItem" key={code}><b>Code {code}</b><span>{desc}</span><button type="button" title="نسخ الكود" onClick={()=>copy(code)}>{copied===code?<Check size={15}/>:<Copy size={15}/>}</button></div>})}</div></section>})}</div>{!visible.length&&<div className="codesEmpty">لا يوجد كود مطابق للبحث.</div>}</div>
}