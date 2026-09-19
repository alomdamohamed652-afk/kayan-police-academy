import React,{useEffect,useState}from'react';
import{RefreshCw,Plus,Save,Trash2,Camera,RotateCcw,MapPin,Car,Radio,Shield,Settings2}from'lucide-react';
import{dispatchApi}from'./dispatch-api.js';
import{PersonnelPicker}from'./PersonnelPicker.jsx';
import'./dispatch.css';

const msg=e=>String(e?.message||'تعذر تنفيذ العملية.');

export function DispatchAdmin({user:viewer={}}){
 const[data,setData]=useState(null),[tab,setTab]=useState(()=>new URLSearchParams(location.search).get('tab')||'units'),[error,setError]=useState(''),[form,setForm]=useState({}),[snapshots,setSnapshots]=useState([]),[saving,setSaving]=useState(false),[unitPeople,setUnitPeople]=useState([]);
 const isAdmin=Boolean(viewer?.permissions?.isAdmin||viewer?.permissions?.adminPermissions?.includes('manage_dispatch_units'));const canManage=isAdmin;const canOperate=Boolean(viewer?.police||isAdmin);
 const load=async()=>{try{setData(await dispatchApi.state());setError('')}catch(e){setError(msg(e))}};
 const loadSnapshots=async()=>{if(!isAdmin)return;try{setSnapshots((await dispatchApi.snapshots()).items||[])}catch(e){setError(msg(e))}};
 useEffect(()=>{load();if(isAdmin)loadSnapshots()},[isAdmin]);
 const mutate=async(fn)=>{setSaving(true);try{await fn();await load();if(isAdmin)await loadSnapshots()}catch(e){setError(msg(e))}finally{setSaving(false)}};
 if(!data)return <div className="dispatchLoading"><RefreshCw className="spin"/> جاري تحميل الإدارة...</div>;
 const units=data.units||[],types=data.unitTypes||[],regions=data.regions||[],locations=data.locations||[],vehicles=data.vehicles||[],dispatchers=data.dispatchers||[],people=data.people||[];
 const typeBy=new Map(types.map(x=>[x.id,x]));
 const createUnit=async()=>{const r=await dispatchApi.createUnit(form);for(const id of unitPeople)await dispatchApi.join(r.item.id,id,'member');setForm({});setUnitPeople([])};
 const tabs=[
  ['units','الوحدات',Shield],
  ['regions','المناطق',MapPin],
  ['locations','النقاط',MapPin],
  ['types','أنواع الوحدات',Settings2],
  ['vehicles','المركبات',Car],
  ['dispatchers','المناوبون',Radio],
  ...(isAdmin?[['snapshots','النسخ الاحتياطية',Camera],['audit','سجل النشاط',Radio]]:[])
 ];
 return <div className="dispatchPage dispatchAdminPage">
  <section className="pageTitle"><span className="eyebrow">DISPATCH COMMAND</span><h1>إدارة منظومة Dispatch</h1><p>الوحدات · الأفراد · المناطق · النقاط · المركبات · المناوبون</p></section>
  {error&&<div className="dispatchNotice">{error}</div>}
  <div className="dispatchAdminTabs">
   {tabs.map(([id,label,I])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setForm({})}}><I size={16}/>{label}</button>)}
   <button onClick={()=>location.href='/dispatch'}><RefreshCw size={16}/> التشغيل</button>
  </div>

  {tab==='units'&&<section className="dispatchAdminGrid">
   <div className="panel">
    <div className="dispatchPanelHead"><div><strong>إضافة وحدة</strong><span>الكود · النوع · الحالة · الأفراد</span></div><div className="rowActions">{canManage&&<><button className="secondary" onClick={()=>setTab('types')}><Plus size={15}/> إضافة نوع وحدة</button><button className="secondary" onClick={()=>setTab('vehicles')}><Car size={15}/> إضافة مركبة</button></>}</div></div>
    <div className="dispatchFormGrid">
     <input disabled={!canManage} placeholder="كود الوحدة · 12" value={form.unit_code||''} onChange={e=>setForm(f=>({...f,unit_code:e.target.value}))}/>
     <select disabled={!canManage} value={form.type_id||''} onChange={e=>setForm(f=>({...f,type_id:e.target.value}))}><option value="">نوع الوحدة</option>{types.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
     <select disabled={!canOperate} value={form.status||'available'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="available">متاحة</option><option value="active">نشطة</option><option value="busy">مشغولة</option><option value="break">استراحة</option></select>
     <label><input disabled={!canOperate} type="checkbox" checked={Boolean(form.is_shared)} onChange={e=>setForm(f=>({...f,is_shared:e.target.checked}))}/> وحدة مشتركة</label>
    </div>
    <PersonnelPicker people={people} selected={unitPeople} onChange={setUnitPeople} label="أفراد الوحدة"/>
    {canManage&&<button className="primary" disabled={saving||!form.unit_code||!form.type_id} onClick={()=>mutate(createUnit)}><Plus size={16}/> إنشاء الوحدة</button>}
    {}
   </div>
   <div className="panel">
    <div className="dispatchPanelHead"><div><strong>UNIT STRUCTURE</strong><span>{units.filter(u=>u.active).length} وحدة نشطة</span></div></div>
    {units.filter(u=>u.active).map(u=><div className="adminEntityRow" key={u.id}>
     <div><strong>#{u.unit_code}</strong><small>{typeBy.get(u.type_id)?.name||'—'} · {u.status}</small></div>
     <div className="rowActions"><button className="textBtn" onClick={()=>mutate(()=>dispatchApi.updateUnit(u.id,{status:u.status==='active'?'available':'active'}))}>{u.status==='active'?'متاحة':'تفعيل'}</button>{canManage&&<button className="danger" onClick={()=>{if(confirm(`حذف الوحدة #${u.unit_code} نهائيًا؟ سيتم حذف أعضائها وتكليفاتها أيضًا.`))mutate(()=>dispatchApi.archiveUnit(u.id))}}><Trash2 size={14}/> حذف</button>}</div>
    </div>)}
    {!units.some(u=>u.active)&&<div className="emptyMini">لا توجد وحدات نشطة حاليًا.</div>}
   </div>
  </section>}

  {tab==='regions'&&<Manager title="المناطق" items={regions} form={form} setForm={setForm} isAdmin={canManage} onCreate={()=>mutate(()=>dispatchApi.region({...form,code:`REGION-${Date.now()}` }))} onUpdate={(id,b)=>mutate(()=>dispatchApi.updateRegion(id,b))} onArchive={id=>mutate(()=>dispatchApi.archiveRegion(id))} fields={['name','description','color']}/>}
  {tab==='locations'&&<Manager title="النقاط" items={locations} form={form} setForm={setForm} isAdmin={canManage} onCreate={()=>mutate(()=>dispatchApi.location({...form}))} onUpdate={(id,b)=>mutate(()=>dispatchApi.updateLocation(id,b))} onArchive={id=>mutate(()=>dispatchApi.archiveLocation(id))} fields={['name','description','region_id','type','notes']} regions={regions}/>}
  {tab==='types'&&<Manager title="أنواع الوحدات" items={types} form={form} setForm={setForm} isAdmin={canManage} onCreate={()=>mutate(()=>dispatchApi.type({...form,code:String(form.code||'').toUpperCase()}))} onUpdate={(id,b)=>mutate(()=>dispatchApi.updateType(id,b))} fields={['code','name','category','color','sort_order']} disableOnly/>}
  {tab==='vehicles'&&<Manager title="المركبات" items={vehicles} form={form} setForm={setForm} isAdmin={canManage} onCreate={()=>mutate(()=>dispatchApi.vehicle({...form}))} onUpdate={(id,b)=>mutate(()=>dispatchApi.updateVehicle(id,b))} onArchive={id=>mutate(()=>dispatchApi.archiveVehicle(id))} fields={['name','model','type','image_url','call_sign','plate_code','status','notes']} hardDeleteOnly/>}
  {tab==='dispatchers'&&<DispatcherManager people={people} dispatchers={dispatchers} form={form} setForm={setForm} isAdmin={canManage} mutate={mutate}/>}
  {tab==='snapshots'&&isAdmin&&<SnapshotManager snapshots={snapshots} form={form} setForm={setForm} mutate={mutate}/>}
  {tab==='audit'&&isAdmin&&<Audit/>}
 </div>;
}

function Manager({title,items,form,setForm,isAdmin,onCreate,onUpdate,onArchive,fields,regions=[],disableOnly=false,hardDeleteOnly=false}){
 const editing=Boolean(form.id);
 const labels={name:'الاسم',model:'الموديل',type:'النوع',image_url:'رابط صورة المركبة',call_sign:'النداء',plate_code:'رقم اللوحة',status:'الحالة',notes:'ملاحظات',description:'الوصف',region_id:'المنطقة',category:'التصنيف',code:'الكود',sort_order:'الترتيب'};
 const save=()=>{if(!isAdmin)return;if(editing){const{id,...body}=form;onUpdate(id,body)}else onCreate()};
 return <section className="dispatchAdminGrid">
  <div className="panel">
   <div className="dispatchPanelHead"><div><strong>{editing?'EDIT':'CREATE'} · {title}</strong><span>{isAdmin?'إدارة كاملة':'عرض فقط'}</span></div></div>
   <div className="dispatchFormGrid">{fields.map(f=>f==='region_id'?<select disabled={!isAdmin} key={f} value={form[f]||''} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))}><option value="">بدون منطقة</option>{regions.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>:f==='color'?<div className="colorField" key={f}><input disabled={!isAdmin} type="color" value={/^#[0-9A-Fa-f]{6}$/.test(form[f]||'')?form[f]:'#2F6F56'} onChange={e=>setForm(x=>({...x,[f]:e.target.value.toUpperCase()}))}/><input disabled={!isAdmin} className="colorCodeInput" placeholder="#2F6F56" value={form[f]||''} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))}/></div>:<input disabled={!isAdmin} key={f} placeholder={labels[f]||f} aria-label={labels[f]||f} value={form[f]??''} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))}/>)}</div>
   <div className="rowActions">{isAdmin&&<button className="primary" onClick={save}><Save size={16}/> {editing?'حفظ التعديل':'إضافة'}</button>}{editing&&isAdmin&&<button className="secondary" onClick={()=>setForm({})}>إلغاء</button>}{!isAdmin&&<span className="readOnlyBadge">عرض فقط</span>}</div>
  </div>
  <div className="panel">
   <div className="dispatchPanelHead"><div><strong>EXISTING</strong><span>{items.length}</span></div></div>
   {items.map(x=><div className="adminEntityRow" key={x.id}><div>{x.image_url&&<img className="adminThumb" src={x.image_url} alt=""/>}<strong>{x.color&&<span className="entityColorDot" style={{backgroundColor:x.color}}/>}{x.name||x.code}</strong><small>{x.code||x.type||x.category||''} · {x.active?'ACTIVE':'DISABLED'}{x.color?' · '+x.color:''}</small></div><div className="rowActions">{isAdmin?<><button className="textBtn" onClick={()=>setForm({...x})}>تعديل</button><button className="textBtn" onClick={()=>onUpdate(x.id,{active:!x.active})}>{x.active?'تعطيل':'تفعيل'}</button>{onArchive&&!disableOnly&&<button className="danger" onClick={()=>onArchive(x.id)}><Trash2 size={14}/> حذف</button>}</>:<span className="readOnlyBadge">عرض فقط</span>}</div></div>)}
  </div>
 </section>;
}

function DispatcherManager({people,dispatchers,form,setForm,isAdmin,mutate}){
 return <section className="dispatchAdminGrid">
  <div className="panel">
   <div className="dispatchPanelHead"><div><strong>إضافة مناوب</strong><span>يمكن تشغيل أكثر من Dispatcher في نفس الوقت</span></div></div>
   <select disabled={!isAdmin} value={form.discordId||''} onChange={e=>setForm(f=>({...f,discordId:e.target.value}))}><option value="">اختر الفرد</option>{people.map(p=><option key={p.discordId} value={p.discordId}>{p.name} · {p.rank}</option>)}</select>
   <input disabled={!isAdmin} placeholder="ملاحظة / الشفت" value={form.note||''} onChange={e=>setForm(f=>({...f,note:e.target.value}))}/>
   {isAdmin&&<button className="primary" onClick={()=>mutate(()=>dispatchApi.dispatcher(form))}><Plus size={16}/> إضافة مناوب</button>}
  </div>
  <div className="panel">
   <div className="dispatchPanelHead"><div><strong>المناوبون</strong><span>{dispatchers.filter(x=>x.status==='active').length} نشط الآن · {dispatchers.length} سجل</span></div></div>
   {dispatchers.map(d=>{const p=people.find(x=>String(x.discordId)===String(d.discord_id));return <div className="adminEntityRow" key={d.id}><div><strong>{p?.name||d.discord_id}</strong><small>{d.status==='active'?'نشط':'غير نشط'} · {d.started_at?new Date(d.started_at).toLocaleString('ar-EG'):'—'}</small></div><div className="rowActions">{isAdmin&&<button className="danger" onClick={()=>{if(confirm('حذف هذا المناوب نهائيًا من Dispatch؟'))mutate(()=>dispatchApi.removeDispatcher(d.id))}}><Trash2 size={14}/> حذف نهائي</button>}</div></div>})}
   {!dispatchers.length&&<div className="emptyMini">لا يوجد مناوبون مسجلون.</div>}
  </div>
 </section>;
}

function SnapshotManager({snapshots,form,setForm,mutate}){
 return <section className="dispatchAdminGrid">
  <div className="panel"><div className="dispatchPanelHead"><div><strong>CREATE SNAPSHOT</strong><span>Dispatch-only state</span></div></div><input placeholder="اسم النسخة" value={form.name||''} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/><textarea placeholder="وصف اختياري" value={form.description||''} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/><button className="primary" onClick={()=>mutate(()=>dispatchApi.snapshot(form))}><Camera size={16}/> إنشاء نسخة</button></div>
  <div className="panel"><div className="dispatchPanelHead"><div><strong>RESTORE SNAPSHOT</strong><span>يستبدل Dispatch الحالي فقط</span></div></div>{snapshots.map(s=><div className="adminEntityRow" key={s.id}><div><strong>{s.name}</strong><small>{new Date(s.created_at).toLocaleString('ar-EG')} · {s.description||'—'}</small></div><button className="secondary" onClick={()=>{if(confirm('سيتم استبدال حالة Dispatch الحالية بهذه النسخة. هل تريد المتابعة؟'))mutate(()=>dispatchApi.restore(s.id))}}><RotateCcw size={14}/> استعادة</button></div>)}</div>
 </section>;
}

function Audit(){
 const[items,setItems]=useState([]),[loading,setLoading]=useState(false);
 const load=async()=>{setLoading(true);try{setItems((await dispatchApi.activity()).items||[])}catch{}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 return <section className="panel"><div className="dispatchPanelHead"><div><strong>DISPATCH ACTIVITY</strong><span>آخر 48 ساعة فقط</span></div><button className="secondary" onClick={load}><RefreshCw size={15}/> تحديث</button></div>{loading&&<div className="emptyMini">جاري التحميل...</div>}{items.map(x=><div className="auditRow" key={x.id}><time>{new Date(x.created_at).toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</time><div><strong>{x.actor_name||x.actor_discord_id}</strong><span>{x.action} · {x.entity_type} · {x.entity_id||'—'}</span></div></div>)}</section>;
}
