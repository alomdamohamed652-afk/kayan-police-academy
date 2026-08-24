const previousFetch = window.fetch.bind(window);
let hotfixMe = null;
const hfId = v => String(v ?? '').replace(/\D/g, '');
async function hfMe(){
  if(hotfixMe) return hotfixMe;
  try { hotfixMe = await previousFetch('/api/me').then(r => r.json()); } catch { hotfixMe = null; }
  return hotfixMe;
}
const fileData = file => new Promise((resolve,reject)=>{ const r=new FileReader(); r.onload=()=>resolve(String(r.result||'')); r.onerror=reject; r.readAsDataURL(file); });

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input?.url || '');
  const method = String(init.method || 'GET').toUpperCase();

  // The legacy evaluation form is kept visually, but submissions go through the
  // canonical role-aware endpoint. The current user's identity is authoritative.
  if (url.includes('/api/evaluations') && method === 'POST') {
    let body = {}; try { body = JSON.parse(init.body || '{}'); } catch {}
    const me = await hfMe();
    if (me?.discord?.id) {
      const role = me?.role || (['مستجد','جندي','جندي أول','جنديأول'].includes(String(me?.police?.rank || '')) ? 'trainee' : 'trainer');
      if (role === 'trainer') body.trainerId = hfId(me.discord.id);
      if (role === 'trainee') body.traineeId = hfId(me.discord.id);
    }
    return previousFetch('/api/kayan/evaluations', { ...init, body: JSON.stringify(body) });
  }

  // Normalize every member-image upload to the persistent server endpoint.
  if ((url.includes('/api/member-image') || url.includes('/api/admin/member-image')) && (method === 'PATCH' || method === 'PUT')) {
    let body = {}; try { body = JSON.parse(init.body || '{}'); } catch {}
    const me = await hfMe();
    if (!body.discordId && me?.discord?.id) body.discordId = hfId(me.discord.id);
    return previousFetch('/api/admin/member-image-link', { ...init, method: 'PATCH', body: JSON.stringify(body) });
  }
  return previousFetch(input, init);
};

function moveAdminPermissions(){
  if(location.pathname !== '/admin') return;
  const bar = document.querySelector('.kayanAdminBar');
  const tabs = document.querySelector('.adminTabs');
  if(!bar || !tabs) return;
  const btn = [...bar.querySelectorAll('button')].find(x => String(x.textContent || '').includes('إدارة الأدمن والصلاحيات'));
  if(!btn || btn.parentElement === tabs) return;
  btn.classList.add('kayanMovedAdminTab');
  tabs.appendChild(btn);
  [...bar.children].forEach(x => { if(String(x.textContent || '').includes('إدارة الأدمن والصلاحيات')) x.remove(); });
  if(!bar.children.length) bar.remove();
}

async function addSelfImageUpload(){
  if(location.pathname !== '/academy/members') return;
  const me = await hfMe();
  const uid = hfId(me?.discord?.id);
  if(!uid) return;
  const card = [...document.querySelectorAll('.memberCard')].find(c => c.querySelector(`a[href*="/users/${uid}"]`));
  if(!card || card.querySelector('.kayanSelfImageUpload')) return;
  const box = document.createElement('div');
  box.className = 'kayanSelfImageUpload';
  box.innerHTML = '<input type="file" accept="image/png,image/jpeg,image/webp" style="display:none"><button type="button" class="btn secondary">رفع صورتي</button><small></small>';
  const input=box.querySelector('input'), button=box.querySelector('button'), small=box.querySelector('small');
  button.onclick=()=>input.click();
  input.onchange=async()=>{
    const file=input.files?.[0]; if(!file) return;
    if(file.size>300000){small.textContent='الصورة كبيرة؛ الحد 300KB';return;}
    button.disabled=true; small.textContent='جاري الرفع...';
    try{
      const image=await fileData(file);
      const r=await previousFetch('/api/admin/member-image-link',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({discordId:uid,image})});
      const d=await r.json(); if(!r.ok) throw Error(d.error||'UPLOAD_FAILED');
      small.textContent='تم حفظ الصورة';
      const img=card.querySelector('.avatar img'); if(img) img.src=image; else location.reload();
    }catch(e){small.textContent=String(e.message||'فشل رفع الصورة');}
    finally{button.disabled=false;}
  };
  card.querySelector('.memberInfo')?.appendChild(box);
}

const style=document.createElement('style');
style.textContent='.kayanMovedAdminTab{background:#0b1726!important;border:1px solid #29415c!important;color:#dbe5ee!important}.kayanSelfImageUpload{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:9px}.kayanSelfImageUpload small{color:#9aa8b7;font-size:10px}';
document.head.appendChild(style);
const observer=new MutationObserver(()=>{moveAdminPermissions();addSelfImageUpload();});
observer.observe(document.body,{childList:true,subtree:true});
setTimeout(()=>{moveAdminPermissions();addSelfImageUpload();},300);
setInterval(()=>{moveAdminPermissions();addSelfImageUpload();},1200);
