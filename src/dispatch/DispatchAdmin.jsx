import React,{useEffect,useState}from'react';
import{RefreshCw,Plus,Save,Trash2,Camera,RotateCcw,MapPin,Car,Radio,Shield,Settings2,Search,X,ChevronDown}from'lucide-react';
import{dispatchApi}from'./dispatch-api.js';
import{PersonnelPicker}from'./PersonnelPicker.jsx';
import'./dispatch.css';

const msg=e=>String(e?.message||'تعذر تنفيذ العملية.');

export function DispatchAdmin({user:viewer={}}){
 const[data,setData]=useState(null),[tab,setTab]=useState(()=>new URLSearchParams(location.search).get('tab')||'units'),[error,setError]=useState(''),[form,setForm]=useState({}),[snapshots,setSnapshots]=useState([]),[saving,setSaving]=useState(false),[unitPeople,setUnitPeople]=useState([]);
 const globalAdmin=Boolean(viewer?.permissions?.isSuperAdmin);const dp=new Set(viewer?.permissions?.dispatchPermissions||[]);const can=(p)=>globalAdmin||dp.has(p);const canPanel=globalAdmin||[...dp].some(p=>p.startsWith('manage_dispatch_'));const canManage=can('manage_dispatch_units');const canOperate=Boolean(viewer?.police||viewer?.permissions?.isOfficer||globalAdmin||viewer?.permissions?.dispatchAccessEnabled);const canManageUnits=canOperate;
 const load=async()=>{try{setData(await dispatchApi.state());setError('')}catch(e){setError(msg(e))}};
 const loadSnapshots=async()=>{if(!can('manage_dispatch_snapshots'))return;try{setSnapshots((await dispatchApi.snapshots()).items||[])}catch(e){setError(msg(e))}};
 useEffect(()=>{load();if(can('manage_dispatch_snapshots'))loadSnapshots()},[canPanel]);
 const mutate=async(fn)=>{setSaving(true);try{await fn();await load();if(can('manage_dispatch_snapshots'))await loadSnapshots()}catch(e){setError(msg(e))}finally{setSaving(false)}};
 if(!data)return <div className="dispatchLoading"><RefreshCw className="spin"/> جاري تحميل الإدارة...</div>;
 const units=data.units||[],types=data.unitTypes||[],regions=data.regions||[],locations=data.locations||[],vehicles=data.vehicles||[],dispatchers=data.dispatchers||[],people=data.people||[];
 const typeBy=new Map(types.map(x=>[x.id,x]));
 const createUnit=async()=>{const r=await dispatchApi.createUnit(form);for(const id of unitPeople)await dispatchApi.join(r.item.id,id,'member');setForm({});setUnitPeople([])};
 const tabs=[
  ...((canOperate||can('manage_dispatch_units'))?[['units','الوحدات',Shield]]:[]),
  ...(can('manage_dispatch_regions')?[['regions','المناطق',MapPin]]:[]),
  ...(can('manage_dispatch_locations')?[['locations','النقاط',MapPin]]:[]),
  ...(can('manage_dispatch_types')?[['types','أنواع الوحدات',Settings2]]:[]),
  ...(can('manage_dispatch_vehicles')?[['vehicles','المركبات',Car]]:[]),
  ...((canOperate||can('manage_dispatch_dispatchers'))?[['dispatchers','المناوبون',Radio]]:[]),
  ...(can('manage_dispatch_snapshots')?[['snapshots','النسخ الاحتياطية',Camera]]:[]),
  ...(can('view_dispatch_audit')?[['audit','سجل النشاط',Radio]]:[]),
  ...(globalAdmin?[['permissions','صلاحيات Dispatch',Shield]]:[])
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
     <input disabled={!canManageUnits} placeholder="كود الوحدة · 12" value={form.unit_code||''} onChange={e=>setForm(f=>({...f,unit_code:e.target.value}))}/>
     <select disabled={!canManageUnits} value={form.type_id||''} onChange={e=>setForm(f=>({...f,type_id:e.target.value}))}><option value="">نوع الوحدة</option>{types.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><select disabled={!canManageUnits} value={form.vehicle_id||''} onChange={e=>setForm(f=>({...f,vehicle_id:e.target.value||null}))}><option value="">بدون مركبة</option>{vehicles.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}{x.call_sign?' · '+x.call_sign:''}</option>)}</select>
     <select disabled={!canOperate} value={form.status||'available'} onChange={e=>setForm(f=>({...f,status:e.target.value}))}><option value="available">متاحة</option><option value="active">نشطة</option><option value="busy">مشغولة</option><option value="break">استراحة</option></select>
     <label><input disabled={!canOperate} type="checkbox" checked={Boolean(form.is_shared)} onChange={e=>setForm(f=>({...f,is_shared:e.target.checked}))}/> وحدة مشتركة</label>
    </div>
    <PersonnelPicker people={people} selected={unitPeople} onChange={setUnitPeople} label="أفراد الوحدة"/>
    {canManageUnits&&<button className="primary" disabled={saving||!form.unit_code||!form.type_id} onClick={()=>mutate(createUnit)}><Plus size={16}/> إنشاء الوحدة</button>}
    {}
   </div>
   <div className="panel"><UnitList units={units} typeBy={typeBy} canManageUnits={canManageUnits} mutate={mutate}/></div>
  </section>}

  {tab==='regions'&&<Manager title="المناطق" items={regions} form={form} setForm={setForm} isAdmin={can('manage_dispatch_regions')} onCreate={()=>mutate(()=>dispatchApi.region({...form,code:`REGION-${Date.now()}` }))} onUpdate={(id,b)=>mutate(()=>dispatchApi.updateRegion(id,b))} onArchive={id=>mutate(()=>dispatchApi.archiveRegion(id))} fields={['name','description','color']}/>}
  {tab==='locations'&&<Manager title="النقاط" items={locations} form={form} setForm={setForm} isAdmin={can('manage_dispatch_locations')} onCreate={()=>mutate(()=>dispatchApi.location({...form}))} onUpdate={(id,b)=>mutate(()=>dispatchApi.updateLocation(id,b))} onArchive={id=>mutate(()=>dispatchApi.archiveLocation(id))} fields={['name','description','region_id','type','notes']} regions={regions}/>}
  {tab==='types'&&<Manager title="أنواع الوحدات" items={types} form={form} setForm={setForm} isAdmin={can('manage_dispatch_types')} onCreate={()=>mutate(()=>dispatchApi.type({...form,code:String(form.code||'').toUpperCase()}))} onUpdate={(id,b)=>mutate(()=>dispatchApi.updateType(id,b))} fields={['code','name','category','color','sort_order']} disableOnly/>}
  {tab==='vehicles'&&<Manager title="المركبات" items={vehicles} form={form} setForm={setForm} isAdmin={can('manage_dispatch_vehicles')} onCreate={()=>mutate(()=>dispatchApi.vehicle({...form}))} onUpdate={(id,b)=>mutate(()=>dispatchApi.updateVehicle(id,b))} onArchive={id=>mutate(()=>dispatchApi.archiveVehicle(id))} fields={['name','model','type','image_url','call_sign','plate_code','status','notes']} hardDeleteOnly/>}
  {tab==='dispatchers'&&<DispatcherManager people={people} dispatchers={dispatchers} form={form} setForm={setForm} isAdmin={canOperate} mutate={mutate}/>}
  {tab==='snapshots'&&can('manage_dispatch_snapshots')&&<SnapshotManager snapshots={snapshots} form={form} setForm={setForm} mutate={mutate}/>} 
  {tab==='audit'&&can('view_dispatch_audit')&&<Audit/>}
  {tab==='permissions'&&globalAdmin&&<AccessManager people={people} mutate={mutate}/>} 
 </div>;
}

function ConfirmDialog({title,message,onCancel,onConfirm}){return <div className="dispatchConfirmOverlay" onMouseDown={e=>e.target===e.currentTarget&&onCancel()}><div className="dispatchConfirm"><div className="dispatchConfirmIcon"><Trash2 size={20}/></div><h3>{title}</h3><p>{message}</p><div className="rowActions"><button className="secondary" onClick={onCancel}>إلغاء</button><button className="danger" onClick={onConfirm}>تأكيد الحذف</button></div></div></div>}

function UnitList({units,typeBy,canManageUnits,mutate}){const[q,setQ]=useState(''),[confirmUnit,setConfirmUnit]=useState(null);const active=units.filter(u=>u.active&&(!q||String(u.unit_code||'').toLowerCase().includes(q.toLowerCase())||String(typeBy.get(u.type_id)?.name||'').toLowerCase().includes(q.toLowerCase())));return <><div className="dispatchPanelHead"><div><strong>UNIT STRUCTURE</strong><span>{active.length} نتيجة · {units.filter(u=>u.active).length} وحدة نشطة</span></div></div><div className="adminSearch"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="بحث برقم الوحدة أو النوع..."/>{q&&<button onClick={()=>setQ('')}><X size={14}/></button>}</div>{active.map(u=><div className="adminEntityRow" key={u.id}><div><strong>#{u.unit_code}</strong><small>{typeBy.get(u.type_id)?.name||'—'} · {u.status}</small></div><div className="rowActions"><button className="textBtn" onClick={()=>mutate(()=>dispatchApi.updateUnit(u.id,{status:u.status==='active'?'available':'active'}))}>{u.status==='active'?'متاحة':'تفعيل'}</button>{canManageUnits&&<button className="danger" onClick={()=>setConfirmUnit(u)}><Trash2 size={14}/> حذف</button>}</div></div>)}{!active.length&&<div className="emptyMini">لا توجد وحدات مطابقة.</div>}{confirmUnit&&<ConfirmDialog title="حذف الوحدة" message={'سيتم حذف الوحدة #'+confirmUnit.unit_code+' نهائيًا مع أعضائها وتكليفاتها المرتبطة بها.'} onCancel={()=>setConfirmUnit(null)} onConfirm={()=>{const u=confirmUnit;setConfirmUnit(null);mutate(()=>dispatchApi.archiveUnit(u.id))}}/>}</>}


function AccessManager({people,mutate}){const[rows,setRows]=useState([]),[selected,setSelected]=useState(''),[perms,setPerms]=useState([]),[note,setNote]=useState(''),[enabled,setEnabled]=useState(true),[loading,setLoading]=useState(true);const defs=[['manage_dispatch_units','إدارة الوحدات'],['manage_dispatch_members','إدارة أفراد الوحدات'],['manage_dispatch_regions','إدارة المناطق'],['manage_dispatch_locations','إدارة النقاط'],['manage_dispatch_types','إدارة أنواع الوحدات'],['manage_dispatch_vehicles','إدارة المركبات'],['manage_dispatch_dispatchers','إدارة المناوبين'],['view_dispatch_audit','عرض سجل النشاط'],['manage_dispatch_snapshots','إدارة النسخ الاحتياطية'],['manage_dispatch_settings','إدارة إعدادات Dispatch']];const load=async()=>{try{setRows((await dispatchApi.accessList()).items||[])}finally{setLoading(false)}};useEffect(()=>{load()},[]);const current=rows.find(x=>String(x.discord_id)===String(selected));useEffect(()=>{setPerms(Array.isArray(current?.permissions)?current.permissions:[]);setNote(current?.note||'');setEnabled(current?.enabled!==false)},[selected,rows]);const save=async()=>{if(!selected)return;await mutate(async()=>{await dispatchApi.access({discordId:selected,enabled,permissions:perms,note})});await load()};const remove=async(id)=>{await mutate(()=>dispatchApi.removeAccess(id));await load()};return <section className="dispatchAdminGrid"><div className="panel"><div className="dispatchPanelHead"><div><strong>صلاحيات Dispatch</strong><span>اختر أفرادًا محددين ومنحهم الصلاحيات المطلوبة فقط</span></div></div><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">اختر فردًا</option>{people.map(p=><option key={p.discordId} value={p.discordId}>{p.name} · {p.rank||p.code||p.discordId}</option>)}</select><div className="dispatchFormGrid">{defs.map(([id,label])=><label key={id}><input type="checkbox" checked={perms.includes(id)} onChange={e=>setPerms(v=>e.target.checked?[...new Set([...v,id])]:v.filter(x=>x!==id))}/>{label}</label>)}</div><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> الحساب مفعل</label><input placeholder="ملاحظة" value={note} onChange={e=>setNote(e.target.value)}/><button className="primary" disabled={!selected||loading} onClick={save}><Save size={15}/> حفظ الصلاحيات</button></div><div className="panel"><div className="dispatchPanelHead"><div><strong>الأشخاص المضافون</strong><span>{rows.length} صلاحية مسجلة</span></div></div>{rows.map(x=><div className="adminEntityRow" key={x.discord_id}><div><strong>{people.find(p=>String(p.discordId)===String(x.discord_id))?.name||x.discord_id}</strong><small>{x.enabled?'مفعل':'معطل'} · {(Array.isArray(x.permissions)?x.permissions:[]).length} صلاحيات</small></div><div className="rowActions"><button className="textBtn" onClick={()=>setSelected(x.discord_id)}>تعديل</button><button className="danger" onClick={()=>remove(x.discord_id)}><Trash2 size={14}/> إزالة</button></div></div>)}</div></section>}

function Manager({title,items,form,setForm,isAdmin,onCreate,onUpdate,onArchive,fields,regions=[],disableOnly=false,hardDeleteOnly=false}){
 const editing=Boolean(form.id),[query,setQuery]=useState(''),[confirmItem,setConfirmItem]=useState(null);
 const filtered=items.filter(x=>{const q=query.trim().toLowerCase();return !q||[x.name,x.code,x.model,x.type,x.category,x.call_sign,x.plate_code,x.description].some(v=>String(v||'').toLowerCase().includes(q))});
 const labels={name:'الاسم',model:'الموديل',type:'النوع',image_url:'رابط صورة المركبة',call_sign:'النداء',plate_code:'رقم اللوحة',status:'الحالة',notes:'ملاحظات',description:'الوصف',region_id:'المنطقة',category:'التصنيف',code:'الكود',sort_order:'الترتيب'};
 const save=()=>{if(!isAdmin)return;if(editing){const{id,...body}=form;onUpdate(id,body)}else onCreate()};
 return <section className="dispatchAdminGrid">
  <div className="panel"><div className="dispatchPanelHead"><div><strong>{editing?'EDIT':'CREATE'} · {title}</strong><span>{isAdmin?'إدارة كاملة':'عرض فقط'}</span></div></div>
   <div className="dispatchFormGrid">{fields.map(f=>f==='region_id'?<select disabled={!isAdmin} key={f} value={form[f]||''} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))}><option value="">بدون منطقة</option>{regions.filter(r=>r.active).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select>:f==='color'?<div className="colorField" key={f}><input disabled={!isAdmin} type="color" value={/^#[0-9A-Fa-f]{6}$/.test(form[f]||'')?form[f]:'#2F6F56'} onChange={e=>setForm(x=>({...x,[f]:e.target.value.toUpperCase()}))}/><input disabled={!isAdmin} className="colorCodeInput" placeholder="#2F6F56" value={form[f]||''} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))}/></div>:<input disabled={!isAdmin} key={f} placeholder={labels[f]||f} aria-label={labels[f]||f} value={form[f]??''} onChange={e=>setForm(x=>({...x,[f]:e.target.value}))}/>)}</div>
   <div className="rowActions">{isAdmin&&<button className="primary" onClick={save}><Save size={16}/> {editing?'حفظ التعديل':'إضافة'}</button>}{editing&&isAdmin&&<button className="secondary" onClick={()=>setForm({})}>إلغاء</button>}{!isAdmin&&<span className="readOnlyBadge">عرض فقط</span>}</div>
  </div>
  <div className="panel"><div className="dispatchPanelHead"><div><strong>EXISTING</strong><span>{filtered.length} / {items.length}</span></div></div>
   <div className="adminSearch"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث بالاسم أو الكود أو النوع..."/>{query&&<button onClick={()=>setQuery('')}><X size={14}/></button>}</div>
   {filtered.map(x=><div className="adminEntityRow" key={x.id}><div>{x.image_url&&<img className="adminThumb" src={x.image_url} alt=""/>}<strong>{x.color&&<span className="entityColorDot" style={{backgroundColor:x.color}}/>}{x.name||x.code}</strong><small>{x.code||x.type||x.category||''} · {x.active?'ACTIVE':'DISABLED'}{x.color?' · '+x.color:''}</small></div><div className="rowActions">{isAdmin?<><button className="textBtn" onClick={()=>setForm({...x})}>تعديل</button>{hardDeleteOnly?<button className="danger" onClick={()=>setConfirmItem(x)}><Trash2 size={14}/> حذف نهائي</button>:<><button className="textBtn" onClick={()=>onUpdate(x.id,{active:!x.active})}>{x.active?'تعطيل':'تفعيل'}</button>{onArchive&&!disableOnly&&<button className="danger" onClick={()=>setConfirmItem(x)}><Trash2 size={14}/> حذف</button>}</>}</>:<span className="readOnlyBadge">عرض فقط</span>}</div></div>)}
   {!filtered.length&&<div className="emptyMini">لا توجد نتائج مطابقة.</div>}
   {confirmItem&&<ConfirmDialog title={hardDeleteOnly?'تأكيد الحذف النهائي':'تأكيد الحذف'} message={'سيتم حذف '+(confirmItem.name||confirmItem.code||'هذا العنصر')+' نهائيًا. هل تريد المتابعة؟'} onCancel={()=>setConfirmItem(null)} onConfirm={()=>{const x=confirmItem;setConfirmItem(null);onArchive&&onArchive(x.id)}}/>}
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
 const[items,setItems]=useState([]),[loading,setLoading]=useState(false),[filters,setFilters]=useState({action:'',entityType:'',actor:'',from:'',to:''});
 const actions={
  UNIT_CREATED:'إنشاء وحدة',UNIT_UPDATED:'تعديل وحدة',UNIT_DELETED:'حذف وحدة',MEMBER_JOINED:'إضافة فرد للوحدة',MEMBER_LEFT:'إخراج فرد من الوحدة',MEMBERS_SWAPPED:'تبديل أفراد',
  UNIT_ASSIGNMENT_REPLACED:'استبدال تكليف',UNIT_ASSIGNMENT_CREATED:'إنشاء تكليف',UNIT_ASSIGNMENT_UPDATED:'تعديل تكليف',UNIT_ASSIGNMENT_REMOVED:'حذف تكليف',
  REGION_CREATED:'إنشاء منطقة',REGION_UPDATED:'تعديل منطقة',REGION_DELETED:'حذف منطقة',REGION_ARCHIVED:'أرشفة منطقة',AUDIT_CLEARED:'مسح سجل النشاط',
  LOCATION_CREATED:'إنشاء نقطة',LOCATION_UPDATED:'تعديل نقطة',LOCATION_DELETED:'حذف نقطة',
  UNIT_TYPE_CREATED:'إنشاء نوع وحدة',UNIT_TYPE_UPDATED:'تعديل نوع وحدة',VEHICLE_CREATED:'إضافة مركبة',VEHICLE_UPDATED:'تعديل مركبة',VEHICLE_DELETED:'حذف مركبة',
  DISPATCHER_ASSIGNED:'إضافة مناوب',DISPATCHER_ACTIVATED:'تفعيل مناوب',DISPATCHER_OFFLINED:'إيقاف مناوب',DISPATCHER_REMOVED:'حذف مناوب',
  DISPATCH_ACCESS_GRANTED:'منح صلاحيات Dispatch',DISPATCH_ACCESS_REVOKED:'تعطيل صلاحيات Dispatch',DISPATCH_ACCESS_REMOVED:'إزالة صلاحيات Dispatch',
  DISPATCH_SETTINGS_UPDATED:'تعديل إعدادات Dispatch'
 };
 const entities={unit:'وحدة',assignment:'تكليف',region:'منطقة',location:'نقطة',unit_type:'نوع وحدة',vehicle:'مركبة',dispatcher:'مناوب',access:'صلاحيات',settings:'إعدادات'};
 const load=async()=>{setLoading(true);try{setItems((await dispatchApi.activity({limit:500,...filters})).items||[])}catch{}finally{setLoading(false)}};
 useEffect(()=>{load()},[]);
 const clear=()=>setFilters({action:'',entityType:'',actor:'',from:'',to:''});
 return <section className="panel">
  <div className="dispatchPanelHead"><div><strong>سجل نشاط Dispatch</strong><span>{items.length} سجل · آخر عملية مسح محفوظة دائمًا</span></div><div className="rowActions"><button className="secondary" onClick={load}><RefreshCw size={15}/> تحديث</button><button className="danger" onClick={async()=>{if(!confirm('مسح سجل النشاط بالكامل؟ سيتم حذف السجلات الحالية والاحتفاظ بسجل واحد يوضح من قام بالمسح وعدد السجلات المحذوفة.'))return;try{await dispatchApi.clearActivity();await load()}catch(e){alert(e?.message||'تعذر مسح السجل')}}}>مسح السجل</button></div></div>
  <div className="auditFilters">
   <select value={filters.entityType} onChange={e=>setFilters(f=>({...f,entityType:e.target.value}))}><option value="">كل الأنواع</option>{Object.entries(entities).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <select value={filters.action} onChange={e=>setFilters(f=>({...f,action:e.target.value}))}><option value="">كل العمليات</option>{Object.entries(actions).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select>
   <input placeholder="اسم المنفذ" value={filters.actor} onChange={e=>setFilters(f=>({...f,actor:e.target.value}))}/>
   <input type="date" value={filters.from} onChange={e=>setFilters(f=>({...f,from:e.target.value}))}/>
   <input type="date" value={filters.to} onChange={e=>setFilters(f=>({...f,to:e.target.value}))}/>
   <div className="rowActions"><button className="primary" onClick={load}>تطبيق الفلاتر</button><button className="secondary" onClick={()=>{clear();setTimeout(load,0)}}>مسح</button></div>
  </div>
  {loading&&<div className="emptyMini">جاري تحميل السجل...</div>}
  {!loading&&!items.length&&<div className="emptyMini">لا توجد سجلات مطابقة للفلاتر.</div>}
  {items.map(x=>{
   const action=actions[x.action]||x.action||'عملية غير معروفة',entity=entities[x.entity_type]||x.entity_type||'—',tone=/DELETED|REMOVED|REVOKED|LEFT|ARCHIVED/.test(String(x.action))?'danger':/CREATED|JOINED|GRANTED|ASSIGNED|ACTIVATED/.test(String(x.action))?'success':/UPDATED|REPLACED|SWAPPED|OFFLINED/.test(String(x.action))?'info':'neutral';
   const at=new Date(x.created_at);
   const before=x.before_data||{},after=x.after_data||{};const named=before.unit_code||before.name||before.code||after.unit_code||after.name||after.code;const details=x.action==='AUDIT_CLEARED'?'تم مسح '+Number(after.deletedCount||before.deletedCount||0)+' سجل. هذا السجل محفوظ لتوثيق عملية المسح.':named?(String(named)+(before.name&&before.unit_code?' · '+String(before.name):'')):x.action==='MEMBERS_SWAPPED'?'تم تبديل الفردين بين الوحدات.':after&&Object.keys(after).length?'تم تنفيذ العملية وتحديث البيانات.':before&&Object.keys(before).length?'تم تنفيذ العملية على السجل.':'عملية تشغيلية.';
   return <div className={`auditRow audit-${tone}`} key={x.id}>
    <time>{at.toLocaleDateString('ar-EG')}<br/>{at.toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</time>
    <div className="auditMain"><div className="auditHeadline"><strong>{action}</strong><b>{entity}</b></div><span className="auditMeta">بواسطة {x.actor_name||x.actor_discord_id||'غير معروف'}{x.entity_id?' · '+String(x.entity_id).slice(0,12):''}</span><small>{details}</small></div>
   </div>
  })}
 </section>;
}
