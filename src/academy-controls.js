const api = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let data = {};
  try { data = await response.json(); } catch {}
  if (!response.ok) throw new Error(data.error || `HTTP_${response.status}`);
  return data;
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const msg = error => ({
  UNAUTHENTICATED: 'يجب تسجيل الدخول عبر Discord.',
  OFFICER_ONLY: 'هذه الميزة متاحة لأفراد الشرطة فقط.',
  POLICE_SHEET_UNAVAILABLE: 'تعذر تحميل بيانات الضباط. حاول مرة أخرى.',
  NO_ACTIVE_EVALUATION_BATCH: 'لا توجد دفعة تقييم مفتوحة حاليًا. افتح دفعة التقييم من مركز الإدارة.',
  INVALID_TRAINER: 'المدرب المختار غير صالح.',
  INVALID_TRAINEE: 'المتدرب المختار غير صالح.',
  EVALUATION_ALREADY_SUBMITTED: 'تم إرسال هذا التقييم من قبل لهذه الدفعة.',
  REQUIRED_FIELD_MISSING: 'أكمل جميع الحقول المطلوبة.',
  INVALID_RATING: 'كل التقييمات يجب أن تكون من 1 إلى 10.',
  SUPER_ADMIN_PROTECTED: 'لا يمكن حذف أو تعطيل السوبر أدمن.',
  INSUFFICIENT_PERMISSION: 'ليست لديك الصلاحية المطلوبة.',
  STORAGE_ERROR: 'تعذر حفظ البيانات حاليًا.',
  IMAGE_TOO_LARGE: 'الصورة كبيرة. اختر صورة أوضح بحجم أصغر.',
  INVALID_IMAGE_DATA: 'صيغة الصورة غير صالحة.'
}[error?.message] || error?.message || 'حدث خطأ غير متوقع.');

const style = document.createElement('style');
style.textContent = `
.kayanFixPanel{background:#081321;border:1px solid #29415c;border-radius:20px;padding:22px;margin:18px 0;color:#eef3f7;box-shadow:0 18px 55px rgba(0,0,0,.18);direction:rtl}.kayanFixHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.kayanFixHead h2{margin:3px 0;font-size:25px}.kayanFixHead p{margin:6px 0;color:#8d9daf}.kayanFixEyebrow{color:#d6b35e;font-size:10px;font-weight:900;letter-spacing:2px}.kayanFixGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.kayanFixField{display:grid;gap:7px}.kayanFixField.full{grid-column:1/-1}.kayanFixField label{font-size:12px;color:#aebaca;font-weight:800}.kayanFixField input,.kayanFixField select,.kayanFixField textarea{width:100%;box-sizing:border-box;background:#07111e;border:1px solid #29415c;border-radius:11px;color:#fff;padding:11px;outline:none;font:inherit}.kayanFixField textarea{min-height:95px;resize:vertical}.kayanRating{display:flex;gap:6px;flex-wrap:wrap}.kayanRating button{width:38px;height:38px;border-radius:10px;border:1px solid #29415c;background:#0b1726;color:#dce5ee;cursor:pointer}.kayanRating button.active{background:#d6b35e;color:#101925;border-color:#d6b35e;font-weight:900}.kayanFixActions{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.kayanFixButton{border:1px solid #29415c;background:#0b1726;color:#eef3f7;border-radius:11px;padding:10px 15px;font-weight:800;cursor:pointer}.kayanFixButton.primary{background:#d6b35e;color:#101925;border-color:#d6b35e}.kayanFixButton.danger{background:#4a1820;border-color:#74313c}.kayanFixNotice{margin-top:13px;border-radius:11px;padding:10px 12px;background:#0d1c2d;border:1px solid #29415c;color:#cbd5df}.kayanImageTools{margin-top:10px;display:flex;gap:7px;flex-wrap:wrap;align-items:center}.kayanImageTools input[type=file]{max-width:190px;color:#9ba9b8;font-size:11px}.kayanAdminBar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 15px}.kayanModalBack{position:fixed;inset:0;background:rgba(0,0,0,.76);z-index:1000000;display:grid;place-items:center;padding:18px;direction:rtl}.kayanModalBox{width:min(1050px,96vw);max-height:92vh;overflow:auto;background:#081321;border:1px solid #29415c;border-radius:20px;padding:20px;color:#eef3f7;box-shadow:0 35px 120px rgba(0,0,0,.55)}.kayanModalTop{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #1d3045;padding-bottom:13px;margin-bottom:15px}.kayanModalTop h2{margin:0}.kayanAdminAdd{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;margin-bottom:14px}.kayanAdminCard{border:1px solid #22384f;background:#0a1726;border-radius:14px;padding:14px;margin:9px 0}.kayanAdminTop{display:flex;justify-content:space-between;gap:12px;align-items:center}.kayanPermGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}.kayanPerm{display:flex;gap:7px;align-items:center;background:#07111e;border:1px solid #1e3349;border-radius:9px;padding:8px;font-size:11px}.kayanBatchBox{background:#07111e;border:1px solid #29415c;border-radius:14px;padding:14px;margin-bottom:16px}.kayanBatchBox select{width:100%;box-sizing:border-box;background:#0b1726;color:#fff;border:1px solid #29415c;border-radius:10px;padding:10px}.kayanProtected{color:#d6b35e;font-size:10px;font-weight:900}.kayanSmall{color:#8d9daf;font-size:10px}.kayanHiddenLegacy{display:none!important}@media(max-width:700px){.kayanFixGrid{grid-template-columns:1fr}.kayanFixField.full{grid-column:auto}.kayanPermGrid{grid-template-columns:1fr}.kayanAdminAdd{grid-template-columns:1fr}.kayanFixHead{display:block}}
`;
document.head.appendChild(style);

let currentMe = null;
let evaluationMounted = false;
let adminMounted = false;

async function getMe(){
  if (currentMe) return currentMe;
  try { currentMe = await api('/api/me'); } catch { currentMe = null; }
  return currentMe;
}

function ratingButtons(name, value = 0){
  return `<div class="kayanRating" data-rating="${name}">${Array.from({length:10},(_,i)=>{const n=i+1;return `<button type="button" data-value="${n}" class="${Number(value)===n?'active':''}">${n}</button>`}).join('')}</div>`;
}

function field(label, html, full = false){
  return `<div class="kayanFixField${full?' full':''}"><label>${label}</label>${html}</div>`;
}

async function mountEvaluation(){
  if (location.pathname !== '/academy/evaluations') { evaluationMounted = false; return; }
  const existing = document.getElementById('kayan-evaluation-clean');
  if (existing) return;
  const oldPanels = [...document.querySelectorAll('.panel.form')];
  oldPanels.forEach(x => x.classList.add('kayanHiddenLegacy'));
  const oldTabs = document.querySelector('.tabs');
  if (oldTabs) oldTabs.classList.add('kayanHiddenLegacy');
  try {
    const context = await api('/api/kayan/evaluation-context');
    const host = oldTabs?.parentElement || document.querySelector('main') || document.body;
    const panel = document.createElement('section');
    panel.id = 'kayan-evaluation-clean';
    panel.className = 'kayanFixPanel';
    const active = Boolean(context.batch);
    const role = context.role;
    if (!active) {
      panel.innerHTML = `<div class="kayanFixHead"><div><span class="kayanFixEyebrow">KAYAN POLICE ACADEMY</span><h2>التقييمات</h2><p>التقييمات مستقلة عن فتح أو إغلاق التقديمات.</p></div></div><div class="kayanFixNotice">لا توجد دفعة تقييم نشطة حاليًا. يمكن للأدمن فتح دفعة تقييم مستقلة من مركز الإدارة.</div>`;
    } else if (role === 'none') {
      panel.innerHTML = `<div class="kayanFixNotice">رتبتك الحالية ليست ضمن رتب المدربين أو المتدربين المعتمدة للتقييم.</div>`;
    } else {
      const isTrainerRole = role === 'trainer';
      const people = isTrainerRole ? context.trainees : context.trainers;
      const selectLabel = isTrainerRole ? 'اسم المتدرب *' : 'اسم المدرب *';
      const selectName = isTrainerRole ? 'traineeId' : 'trainerId';
      const options = people.map(p => `<option value="${esc(p.discordId)}">${esc(p.name)} — ${esc(p.rank)}</option>`).join('');
      const formFields = isTrainerRole ? [
        field('اسم المدرب', `<input value="${esc(context.me.name)} — ${esc(context.me.rank)}" disabled>`),
        field(selectLabel, `<select name="${selectName}"><option value="">اختر المتدرب</option>${options}</select>`),
        field('عدد ساعات التدريب *', '<input name="trainingHours" type="number" min="1" max="999" step="0.5" placeholder="مثال: 12">'),
        field('مهارة القيادة — 1 إلى 10 *', ratingButtons('leadershipRating')),
        field('التعامل مع المواطنين والزملاء — 1 إلى 10 *', ratingButtons('citizensRating')),
        field('التعامل مع أجهزة الشرطة — 1 إلى 10 *', ratingButtons('devicesRating')),
        field('التعامل مع البلاغات — 1 إلى 10 *', ratingButtons('reportsRating')),
        field('التعامل مع الأسلحة — 1 إلى 10 *', ratingButtons('weaponsRating')),
        field('ملاحظات *', '<textarea name="notes" placeholder="اكتب ملاحظاتك عن المتدرب"></textarea>', true),
        field('التقييم النهائي للمتدرب — 1 إلى 10 *', ratingButtons('rating'))
      ] : [
        field('اسم المتدرب', `<input value="${esc(context.me.name)} — ${esc(context.me.rank)}" disabled>`),
        field(selectLabel, `<select name="${selectName}"><option value="">اختر المدرب</option>${options}</select>`),
        field('عدد ساعات التدريب *', '<input name="trainingHours" type="number" min="1" max="999" step="0.5" placeholder="مثال: 12">'),
        field('ما هي الحالات التي باشرت فيها؟ *', '<textarea name="cases" placeholder="اكتب الحالات التي باشرتها"></textarea>', true),
        field('كيف ترى المدرب من وجهة نظرك؟ *', '<textarea name="trainerView"></textarea>', true),
        field('هل كان المدرب واضحاً في التدريب؟ *', '<textarea name="clarity"></textarea>', true),
        field('هل لديك أي ملاحظات في التدريب؟ *', '<textarea name="trainingNotes"></textarea>', true),
        field('هل لديك أي ملاحظات على المدرب؟ *', '<textarea name="trainerNotes"></textarea>', true),
        field('تحب تطلع مع نفس المدرب تاني؟ *', '<select name="sameTrainer"><option value="">اختر</option><option value="نعم">نعم</option><option value="لا">لا</option></select>'),
        field('قيّم المدرب — 1 إلى 10 *', ratingButtons('rating'))
      ];
      panel.innerHTML = `<div class="kayanFixHead"><div><span class="kayanFixEyebrow">${isTrainerRole?'TRAINER REVIEW':'TRAINEE REVIEW'}</span><h2>${isTrainerRole?'تقييم المتدرب':'تقييم المدرب'}</h2><p>دفعة التقييم: <b>${esc(context.batch.name)}</b> — النموذج سري ولا يرتبط بحالة التقديم.</p></div></div><form id="kayanEvaluationForm"><div class="kayanFixGrid">${formFields.join('')}</div><div class="kayanFixActions"><button class="kayanFixButton primary" type="submit">حفظ التقييم</button></div><div class="kayanFixNotice" id="kayanEvaluationNotice" hidden></div></form>`;
      panel.querySelectorAll('[data-rating]').forEach(group => {
        group.addEventListener('click', event => {
          const button = event.target.closest('button[data-value]');
          if (!button) return;
          group.dataset.value = button.dataset.value;
          group.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
        });
      });
      panel.querySelector('#kayanEvaluationForm').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const notice = panel.querySelector('#kayanEvaluationNotice');
        const submit = form.querySelector('button[type=submit]');
        const body = Object.fromEntries(new FormData(form).entries());
        panel.querySelectorAll('[data-rating]').forEach(group => { body[group.dataset.rating] = group.dataset.value || ''; });
        submit.disabled = true;
        try {
          await api('/api/kayan/evaluations', { method:'POST', body:JSON.stringify(body) });
          notice.hidden = false; notice.textContent = 'تم حفظ التقييم بسرية بنجاح.'; notice.dataset.ok = '1';
          form.reset(); panel.querySelectorAll('[data-rating]').forEach(g => { g.dataset.value=''; g.querySelectorAll('button').forEach(b=>b.classList.remove('active')); });
        } catch (e) {
          notice.hidden = false; notice.textContent = msg(e); notice.dataset.ok = '0';
        } finally { submit.disabled = false; }
      });
    }
    host.appendChild(panel);
    evaluationMounted = true;
  } catch (e) {
    const host = document.querySelector('main') || document.body;
    const panel = document.createElement('section'); panel.id='kayan-evaluation-clean'; panel.className='kayanFixPanel'; panel.innerHTML=`<div class="kayanFixNotice">${esc(msg(e))}</div>`; host.appendChild(panel); evaluationMounted=true;
  }
}

async function compressImage(file){
  if (!file?.type?.startsWith('image/')) throw new Error('INVALID_IMAGE_DATA');
  let bitmap;
  try { bitmap = await createImageBitmap(file); } catch {
    bitmap = await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=URL.createObjectURL(file)});
  }
  const canvas = document.createElement('canvas');
  let size = 256;
  for (let attempt=0; attempt<4; attempt++) {
    canvas.width=size; canvas.height=size;
    const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,size,size);
    const scale=Math.min(size/bitmap.width,size/bitmap.height); const w=Math.round(bitmap.width*scale),h=Math.round(bitmap.height*scale); const x=Math.round((size-w)/2),y=Math.round((size-h)/2);
    ctx.drawImage(bitmap,x,y,w,h);
    for(let q=.72;q>=.36;q-=.08){const dataUrl=canvas.toDataURL('image/webp',q);if(dataUrl.length<=38000)return dataUrl;}
    size=Math.round(size*.75);
  }
  throw new Error('IMAGE_TOO_LARGE');
}

async function mountMemberImages(){
  if (location.pathname !== '/academy/members') return;
  const me = await getMe();
  const cards = document.querySelectorAll('.memberCard');
  cards.forEach(card => {
    const link = card.querySelector('a[href*="discord.com/users/"]');
    const match = link?.href?.match(/users\/(\d+)/); const userId = match?.[1];
    if (!userId) return;
    const avatar = card.querySelector('.avatar');
    if (avatar && !avatar.dataset.kayanImage) {
      avatar.dataset.kayanImage='1';
      const image=document.createElement('img'); image.alt=''; image.loading='lazy'; image.src=`/api/kayan/member-image/${userId}?v=1`; image.onerror=()=>image.remove();
      avatar.insertBefore(image,avatar.firstChild);
    }
    if (me?.discord?.id && String(me.discord.id)===String(userId) && !card.querySelector('.kayanImageTools')) {
      const info=card.querySelector('.memberInfo'); if(!info)return;
      const tools=document.createElement('div'); tools.className='kayanImageTools'; tools.innerHTML='<input type="file" accept="image/png,image/jpeg,image/webp"><button type="button" class="kayanFixButton primary">رفع الصورة</button><button type="button" class="kayanFixButton danger">حذف</button>';
      const input=tools.querySelector('input'),upload=tools.querySelector('.primary'),remove=tools.querySelector('.danger');
      upload.onclick=async()=>{try{if(!input.files?.[0])return;upload.disabled=true;upload.textContent='جاري الرفع…';const dataUrl=await compressImage(input.files[0]);await api('/api/kayan/member-image',{method:'PUT',body:JSON.stringify({dataUrl})});location.reload()}catch(e){alert(msg(e))}finally{upload.disabled=false;upload.textContent='رفع الصورة'}};
      remove.onclick=async()=>{if(!confirm('حذف صورتك من ملف الأفراد؟'))return;try{await api('/api/kayan/member-image',{method:'DELETE'});location.reload()}catch(e){alert(msg(e))}};
      info.appendChild(tools);
    }
  });
}

async function openAdminModal(){
  let adminData;
  let batchData;
  try { [adminData,batchData] = await Promise.all([api('/api/kayan/admins'),api('/api/kayan/admin-evaluation-batch')]); } catch(e) { alert(msg(e)); return; }
  const modal=document.createElement('div'); modal.className='kayanModalBack';
  const permEntries=Object.entries(adminData.permissions||{});
  const admins=adminData.admins||[];
  modal.innerHTML=`<div class="kayanModalBox"><div class="kayanModalTop"><div><span class="kayanFixEyebrow">ADMINISTRATION</span><h2>إدارة الأدمن والصلاحيات</h2></div><button class="kayanFixButton">إغلاق</button></div><div class="kayanBatchBox"><b>دفعة التقييم المستقلة</b><p class="kayanSmall">هذه الدفعة مستقلة تمامًا عن حالة التقديم.</p><select id="kayanEvalBatch"><option value="">لا توجد دفعة تقييم محددة</option>${(batchData.batches||[]).map(b=>`<option value="${esc(b.id)}" ${batchData.selectedBatchId===b.id?'selected':''}>${esc(b.name)} — ${b.status==='open'?'التقديم مفتوح':'التقديم مغلق'}</option>`).join('')}</select><div class="kayanFixActions"><button id="kayanSaveEvalBatch" class="kayanFixButton primary">حفظ دفعة التقييم</button></div></div><div class="kayanAdminAdd"><input id="kayanNewAdminId" class="kayanFixField" style="padding:10px;background:#07111e;border:1px solid #29415c;border-radius:10px;color:#fff" placeholder="Discord ID"><input id="kayanNewAdminName" style="padding:10px;background:#07111e;border:1px solid #29415c;border-radius:10px;color:#fff" placeholder="اسم الأدمن"><button id="kayanAddAdmin" class="kayanFixButton primary">إضافة أدمن</button></div><div id="kayanAdminList">${admins.map(a=>adminCard(a,permEntries)).join('')}</div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('.kayanModalTop button').onclick=()=>modal.remove();
  modal.onclick=e=>{if(e.target===modal)modal.remove()};
  modal.querySelector('#kayanSaveEvalBatch').onclick=async()=>{try{await api('/api/kayan/admin-evaluation-batch',{method:'PUT',body:JSON.stringify({batchId:modal.querySelector('#kayanEvalBatch').value})});alert('تم حفظ دفعة التقييم المستقلة.');}catch(e){alert(msg(e))}};
  modal.querySelector('#kayanAddAdmin').onclick=async()=>{const idValue=modal.querySelector('#kayanNewAdminId').value.trim();const nameValue=modal.querySelector('#kayanNewAdminName').value.trim();if(!/^\d{5,25}$/.test(idValue))return alert('أدخل Discord ID صحيحًا.');try{await api(`/api/kayan/admins/${idValue}`,{method:'PUT',body:JSON.stringify({name:nameValue||'Admin',permissions:['view_dashboard'],enabled:true})});modal.remove();openAdminModal()}catch(e){alert(msg(e))}};
  modal.querySelectorAll('[data-admin-save]').forEach(button=>button.onclick=async()=>{const card=button.closest('.kayanAdminCard');const target=button.dataset.adminSave;const selected=[...card.querySelectorAll('input[data-perm]:checked')].map(x=>x.dataset.perm);const enabled=card.querySelector('input[data-enabled]')?.checked!==false;const name=card.querySelector('input[data-name]')?.value.trim()||'Admin';try{await api(`/api/kayan/admins/${target}`,{method:'PUT',body:JSON.stringify({name,permissions:selected,enabled})});button.textContent='تم الحفظ';setTimeout(()=>button.textContent='حفظ',900)}catch(e){alert(msg(e))}});
  modal.querySelectorAll('[data-admin-delete]').forEach(button=>button.onclick=async()=>{if(button.dataset.protected==='1')return alert('السوبر أدمن محمي.');if(!confirm('حذف صلاحيات هذا الأدمن؟'))return;try{await api(`/api/kayan/admins/${button.dataset.adminDelete}`,{method:'DELETE'});modal.remove();openAdminModal()}catch(e){alert(msg(e))}});
}
function adminCard(admin, permEntries){
  const protectedClass=admin.protected?'kayanProtected':'';
  return `<div class="kayanAdminCard"><div class="kayanAdminTop"><div><b>${esc(admin.name||'Admin')}</b><div class="kayanSmall">${esc(admin.discordId)}</div>${admin.protected?'<span class="kayanProtected">SUPER ADMIN — محمي</span>':''}</div><div class="kayanFixActions"><label class="kayanSmall"><input type="checkbox" data-enabled ${admin.enabled?'checked':''} ${admin.protected?'disabled':''}> فعال</label><button class="kayanFixButton primary" data-admin-save="${esc(admin.discordId)}">حفظ</button><button class="kayanFixButton danger" data-admin-delete="${esc(admin.discordId)}" data-protected="${admin.protected?'1':'0'}">حذف</button></div></div><input data-name value="${esc(admin.name||'Admin')}" style="margin-top:10px;width:100%;box-sizing:border-box;padding:10px;background:#07111e;border:1px solid #29415c;border-radius:10px;color:#fff"><div class="kayanPermGrid">${permEntries.map(([key,label])=>`<label class="kayanPerm"><input type="checkbox" data-perm="${esc(key)}" ${admin.permissions?.includes(key)||admin.protected?'checked':''} ${admin.protected?'disabled':''}>${esc(label)}</label>`).join('')}</div></div>`;
}

async function mountAdmin(){
  if(location.pathname !== '/admin') { adminMounted=false; return; }
  const tabs=document.querySelector('.adminTabs');
  if(!tabs || document.getElementById('kayan-admin-controls')) return;
  const bar=document.createElement('div'); bar.id='kayan-admin-controls'; bar.className='kayanAdminBar';
  bar.innerHTML='<button class="kayanFixButton primary">إدارة الأدمن والصلاحيات</button>';
  bar.querySelector('button').onclick=openAdminModal;
  tabs.parentElement?.insertBefore(bar,tabs);
  adminMounted=true;
}

const observer=new MutationObserver(()=>{
  if(location.pathname==='/academy/evaluations') mountEvaluation();
  if(location.pathname==='/academy/members') mountMemberImages();
  if(location.pathname==='/admin') mountAdmin();
});
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',()=>{currentMe=null;evaluationMounted=false;adminMounted=false;setTimeout(()=>{mountEvaluation();mountMemberImages();mountAdmin()},120)});
setInterval(()=>{mountEvaluation();mountMemberImages();mountAdmin()},900);
setTimeout(()=>{mountEvaluation();mountMemberImages();mountAdmin()},300);
