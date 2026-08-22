const nativeFetch = window.fetch.bind(window);
const norm = v => String(v ?? '').trim().toLowerCase().replace(/[\s_\-#]+/g, '');
const TRAINEE_RANKS = new Set(['مستجد','جندي','جنديأول'].map(norm));
const TRAINER_RANKS = new Set([
  'رقيب','رقيب أول','مساعد','مساعد أول','ملازم','ملازم أول','ملازم ثاني',
  'نقيب','رائد','مقدم','عقيد','عميد','لواء','فريق',
  'رئيس الأكاديمية','نائب رئيس الأكاديمية','مساعد نائب رئيس الأكاديمية',
  'قائد الشرطة','رئيس الشرطة','نائب رئيس الشرطة','مساعد قائد الشرطة'
].map(norm));
const classify = rank => {
  const r = norm(rank);
  if (TRAINEE_RANKS.has(r)) return 'trainee';
  if (TRAINER_RANKS.has(r)) return 'trainer';
  return 'officer';
};
const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
const permissionLabels = {
  view_dashboard:'لوحة الإدارة', manage_members:'إدارة الأفراد', manage_applications:'إدارة التقديمات',
  manage_exams:'إدارة الاختبارات', manage_hierarchy:'إدارة الهيكل', view_evaluations:'الاطلاع على التقييمات',
  manage_evaluations:'إدارة التقييمات', manage_admins:'إدارة الأدمن', manage_settings:'الإعدادات'
};

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const method = String(init.method || 'GET').toUpperCase();
  if (url.includes('/api/evaluation-people') && method === 'GET') {
    const r = await nativeFetch('/api/academy/members');
    const d = await r.clone().json().catch(() => ({members:[]}));
    if (!r.ok) return r;
    const members = d.members || [];
    const trainers = members.filter(m => classify(m.rank) === 'trainer').map(m => ({name:m.name,rank:m.rank,badge:m.badge,discordId:m.discordId}));
    const trainees = members.filter(m => classify(m.rank) === 'trainee').map(m => ({name:m.name,rank:m.rank,badge:m.badge,discordId:m.discordId}));
    return new Response(JSON.stringify({trainers,trainees,current:members.find(m => String(m.discordId) === String(window.__kayanMe?.discord?.id)) || null}), {status:200,headers:{'Content-Type':'application/json'}});
  }
  if (url.includes('/api/admin/admins') && method === 'POST') {
    let body = {}; try { body = JSON.parse(init.body || '{}'); } catch {}
    body.permissions = Array.isArray(window.__kayanNewAdminPermissions) ? window.__kayanNewAdminPermissions : [];
    return nativeFetch(input, {...init, body:JSON.stringify(body)});
  }
  return nativeFetch(input, init);
};

const style = document.createElement('style');
style.textContent = `
.adminTabs{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;gap:10px!important;padding:6px 4px 12px!important;scroll-behavior:smooth;scroll-snap-type:x proximity;overscroll-behavior-x:contain;scrollbar-width:none;position:relative}.adminTabs::-webkit-scrollbar{display:none}.adminTabs button{flex:0 0 auto!important;min-width:max-content!important;scroll-snap-align:center;font-weight:800!important;letter-spacing:.1px;transition:transform .18s ease,background .18s ease,border-color .18s ease,box-shadow .18s ease}.adminTabs button.active{box-shadow:0 8px 26px rgba(214,179,94,.18);transform:translateY(-1px)}
.adminTabs:after{content:'';position:absolute;inset-inline:0;bottom:2px;height:1px;background:linear-gradient(90deg,transparent,#d6b35e55,transparent);pointer-events:none}
.pageTitle h1,.panel h2,.panel h3,.sectionHeading h2{font-weight:900;letter-spacing:-.25px}.panel,.metric,.memberCard,.hierCard,.batchPanel,.resultAdminRow,.evaluationAdminRow,.adminRow{font-weight:600}.panel small,.adminRow small,.resultAdminRow small,.evaluationAdminRow small{font-weight:600}
.kayanAdminPerms{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.kayanPermPill{display:inline-flex;align-items:center;border:1px solid #29415c;background:#0b1726;color:#cdd7e1;border-radius:999px;padding:6px 9px;font-size:10px;font-weight:800}.kayanPermPill.all{background:#211b0b;border-color:#8b6e24;color:#e8c76b}.kayanPermEditor{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:7px;margin-top:10px;padding-top:10px;border-top:1px solid #1d3045}.kayanPermEditor label{display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid #22384f;background:#07111e;border-radius:10px;font-size:10px;font-weight:700;cursor:pointer}.kayanPermEditor input{accent-color:#d6b35e}.kayanPermSave{margin-top:8px!important}
.kayanAdminPermissionBox{margin-top:12px;padding:12px;border:1px solid #22384f;background:#0a1726;border-radius:14px}.kayanAdminPermissionBox h4{margin:0 0 8px;font-weight:900}.kayanAdminPermissionBox .kayanPermEditor{border-top:0;padding-top:0;margin-top:0}
.kayanInlineDetail{display:inline-flex!important;align-items:center;gap:7px;margin-inline-start:8px!important}.resultAdminRow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 0;border-top:1px solid #1d3045}.resultAdminRow>div:first-child{min-width:0}.kayanExamDetails{margin-top:12px;padding:14px;border:1px solid #22384f;border-radius:14px;background:#07111e}.kayanExamQuestion{padding:10px 0;border-top:1px solid #1d3045}.kayanExamQuestion:first-child{border-top:0}.kayanExamQuestion b{font-weight:900}.kayanExamQuestion p{margin:5px 0;color:#cbd5df}.kayanCorrect{color:#7dd3a7;font-weight:800}
.kayanTopBar{display:none!important}.kayanSettingsGhost{display:none!important}
@media(max-width:760px){.adminTabs{margin-inline:-6px;padding-inline:8px}.resultAdminRow{align-items:flex-start;flex-direction:column}.resultAdminRow .actions{width:100%}.kayanPermEditor{grid-template-columns:1fr}}
`;
document.head.appendChild(style);

async function cacheMe(){try{if(!window.__kayanMe)window.__kayanMe=await nativeFetch('/api/me').then(r=>r.json());return window.__kayanMe}catch{return null}}
function applyEvaluationRoleUI(){if(location.pathname!=='/academy/evaluations')return;const me=window.__kayanMe;const role=classify(me?.police?.rank);const tabs=[...document.querySelectorAll('.tabs button')];const traineeTab=tabs.find(b=>b.textContent.includes('المتدرب → المدرب'));const trainerTab=tabs.find(b=>b.textContent.includes('المدرب → المتدرب'));if(!traineeTab||!trainerTab)return;if(role==='trainee'){traineeTab.style.display='';trainerTab.style.display='none';if(!traineeTab.classList.contains('active'))traineeTab.click()}else if(role==='trainer'){traineeTab.style.display='none';trainerTab.style.display='';if(!trainerTab.classList.contains('active'))trainerTab.click()}else{traineeTab.style.display='none';trainerTab.style.display='none'}}
function removeOldAdminTopBar(){document.querySelectorAll('.kayanTopBar').forEach(x=>x.remove())}
function injectNewAdminPermissionEditor(){if(location.pathname!=='/admin')return;const adminTab=[...document.querySelectorAll('.adminTabs button')].find(b=>b.textContent.includes('الأدمن'));if(!adminTab)return;if(!adminTab.classList.contains('active'))return;const rows=[...document.querySelectorAll('.adminRow')];if(!rows.length)return;nativeFetch('/api/admin/state').then(r=>r.json()).then(s=>{const permissions=s.permissions||{};(s.admins||[]).forEach(a=>{const row=rows.find(x=>x.textContent.includes(String(a.discordId)));if(!row||row.querySelector('.kayanAdminPerms'))return;const wrap=document.createElement('div');wrap.className='kayanAdminPermissionBox';const current=new Set(a.permissions||[]);const all=Object.keys(permissions);wrap.innerHTML=`<h4>الصلاحيات</h4><div class="kayanAdminPerms">${current.size===all.length?'<span class="kayanPermPill all">كامل الصلاحيات</span>':all.filter(k=>current.has(k)).map(k=>`<span class="kayanPermPill">${esc(permissions[k])}</span>`).join('')||'<span class="kayanPermPill">لا توجد صلاحيات</span>'}</div><div class="kayanPermEditor">${all.map(k=>`<label><input type="checkbox" value="${esc(k)}" ${current.has(k)?'checked':''}> ${esc(permissions[k])}</label>`).join('')}</div><button class="kayanTopBtn primary kayanPermSave">حفظ الصلاحيات</button>`;wrap.querySelector('.kayanPermSave').onclick=async()=>{const selected=[...wrap.querySelectorAll('input:checked')].map(x=>x.value);const r=await nativeFetch(`/api/admin/admins/${encodeURIComponent(a.discordId)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({permissions:selected})});if(r.ok){wrap.querySelector('.kayanPermSave').textContent='تم الحفظ';setTimeout(()=>wrap.querySelector('.kayanPermSave').textContent='حفظ الصلاحيات',1200)}else{alert('تعذر حفظ الصلاحيات')}};row.appendChild(wrap)})}).catch(()=>{})}
function injectNewAdminAddPermissions(){if(location.pathname!=='/admin')return;const adminTab=[...document.querySelectorAll('.adminTabs button')].find(b=>b.textContent.includes('الأدمن'));if(!adminTab||!adminTab.classList.contains('active'))return;const panels=[...document.querySelectorAll('.panel')];const form=panels.find(p=>p.querySelector('input[placeholder="Discord ID"]')&&p.querySelector('input[placeholder="الاسم"]'));if(!form||form.querySelector('.kayanAdminPermissionBox'))return;nativeFetch('/api/admin/state').then(r=>r.json()).then(s=>{const permissions=s.permissions||{};const box=document.createElement('div');box.className='kayanAdminPermissionBox';box.innerHTML=`<h4>صلاحيات الأدمن الجديد</h4><div class="kayanPermEditor">${Object.keys(permissions).map(k=>`<label><input type="checkbox" value="${esc(k)}"> ${esc(permissions[k])}</label>`).join('')}</div>`;box.querySelectorAll('input').forEach(i=>i.onchange=()=>{window.__kayanNewAdminPermissions=[...box.querySelectorAll('input:checked')].map(x=>x.value)});form.appendChild(box)}).catch(()=>{})}
function injectResultDetails(){if(location.pathname!=='/admin')return;const examTab=[...document.querySelectorAll('.adminTabs button')].find(b=>b.textContent.includes('الاختبارات'));if(!examTab||!examTab.classList.contains('active'))return;document.querySelectorAll('.resultAdminRow').forEach(row=>{if(row.querySelector('.kayanInlineDetail'))return;const name=row.querySelector('b')?.textContent?.trim()||'';const all=[...document.querySelectorAll('.resultAdminRow')];const idx=all.indexOf(row);const resultId=(window.__kayanAdminState?.examResults||[])[idx]?.id;if(!resultId)return;const button=document.createElement('button');button.type='button';button.className='btn secondary kayanInlineDetail';button.textContent='تفاصيل الأسئلة والإجابات';button.onclick=async()=>{const r=await nativeFetch(`/api/admin/exam-results/${encodeURIComponent(resultId)}`).then(x=>x.json());const q=r.exam?.questions||[];const box=document.createElement('div');box.className='kayanExamDetails';box.innerHTML=`<b>${esc(name)}</b><div class="kayanAdminPerms"><span class="kayanPermPill">Discord ID ${esc(r.result?.userId)}</span></div>${q.map((x,i)=>`<div class="kayanExamQuestion"><b>${i+1}. ${esc(x.text)}</b><p>إجابة المتقدم: ${esc(r.result?.answers?.[x.id]??'—')}</p><small class="kayanCorrect">الإجابة الصحيحة: ${esc(x.options?.find(o=>o.id===x.correct)?.text||x.correct||'—')}</small></div>`).join('')||'<p>لا توجد أسئلة مسجلة.</p>'}`;row.insertAdjacentElement('afterend',box)};row.querySelector('.actions')?.appendChild(button)});}
async function captureAdminState(){if(location.pathname!=='/admin')return;try{window.__kayanAdminState=await nativeFetch('/api/admin/state').then(r=>r.json())}catch{}}
const observer=new MutationObserver(()=>{removeOldAdminTopBar();applyEvaluationRoleUI();injectNewAdminPermissionEditor();injectNewAdminAddPermissions();injectResultDetails()});
observer.observe(document.body,{childList:true,subtree:true});
(async()=>{await cacheMe();await captureAdminState();setTimeout(()=>{removeOldAdminTopBar();applyEvaluationRoleUI();injectNewAdminPermissionEditor();injectNewAdminAddPermissions();injectResultDetails()},350)})();
