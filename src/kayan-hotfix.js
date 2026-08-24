const previousFetch = window.fetch.bind(window);
let hotfixMe = null;
const hfId = v => String(v ?? '').replace(/\D/g, '');
async function hfMe(){
  if(hotfixMe) return hotfixMe;
  try { hotfixMe = await previousFetch('/api/me').then(r => r.json()); } catch { hotfixMe = null; }
  return hotfixMe;
}
const optimizeImage = file => new Promise((resolve,reject)=>{
  const reader=new FileReader(); reader.onerror=reject;
  reader.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{
    const max=512,scale=Math.min(1,max/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    let data=canvas.toDataURL('image/webp',0.72);
    for(const quality of [0.62,0.52,0.44,0.36]){if(data.length<=48000)break;data=canvas.toDataURL('image/webp',quality)}
    if(data.length>48000){const smaller=document.createElement('canvas');smaller.width=384;smaller.height=Math.max(1,Math.round(canvas.height*(384/canvas.width)));smaller.getContext('2d').drawImage(canvas,0,0,smaller.width,smaller.height);data=smaller.toDataURL('image/webp',0.5)}
    if(data.length>48000)reject(Error('IMAGE_TOO_LARGE'));else resolve(data);
  };img.src=String(reader.result||'')};reader.readAsDataURL(file);
});

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input?.url || '');
  const method = String(init.method || 'GET').toUpperCase();
  if (url.includes('/api/evaluations') && method === 'POST') {
    let body={};try{body=JSON.parse(init.body||'{}')}catch{}
    const me=await hfMe();
    if(me?.discord?.id){const role=me?.role||(['مستجد','جندي','جندي أول','جنديأول'].includes(String(me?.police?.rank||''))?'trainee':'trainer');if(role==='trainer')body.trainerId=hfId(me.discord.id);if(role==='trainee')body.traineeId=hfId(me.discord.id)}
    return previousFetch('/api/kayan/evaluations',{...init,body:JSON.stringify(body)});
  }
  if((url.includes('/api/member-image')||url.includes('/api/admin/member-image'))&&(method==='PATCH'||method==='PUT')){
    let body={};try{body=JSON.parse(init.body||'{}')}catch{}
    const me=await hfMe();if(!body.discordId&&me?.discord?.id)body.discordId=hfId(me.discord.id);
    return previousFetch('/api/admin/member-image-link',{...init,method:'PATCH',body:JSON.stringify(body)});
  }
  return previousFetch(input,init);
};

function moveAdminPermissions(){
  if(location.pathname!=='/admin')return;
  const tabs=document.querySelector('.adminTabs');if(!tabs)return;
  const buttons=[...document.querySelectorAll('button')];
  const btn=buttons.find(x=>String(x.textContent||'').replace(/\s+/g,' ').trim().includes('إدارة الأدمن والصلاحيات'));
  if(!btn||btn.parentElement===tabs)return;
  btn.classList.add('kayanMovedAdminTab');tabs.appendChild(btn);
  const bar=btn.closest('.kayanAdminBar');if(bar&&!bar.children.length)bar.remove();
}

async function addSelfImageUpload(){
  if(location.pathname!=='/academy/members')return;
  const me=await hfMe(),uid=hfId(me?.discord?.id);if(!uid)return;
  const card=[...document.querySelectorAll('.memberCard')].find(c=>c.querySelector(`a[href*="/users/${uid}"]`));
  if(!card||card.querySelector('.kayanSelfImageUpload'))return;
  const box=document.createElement('div');box.className='kayanSelfImageUpload';
  box.innerHTML='<input type="file" accept="image/png,image/jpeg,image/webp" style="display:none"><button type="button" class="btn secondary">رفع صورتي</button><small></small>';
  const input=box.querySelector('input'),button=box.querySelector('button'),small=box.querySelector('small');
  button.onclick=()=>input.click();
  input.onchange=async()=>{const file=input.files?.[0];if(!file)return;button.disabled=true;small.textContent='جاري تجهيز الصورة...';try{const image=await optimizeImage(file);small.textContent='جاري الرفع...';const r=await previousFetch('/api/admin/member-image-link',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({discordId:uid,image})});const d=await r.json();if(!r.ok)throw Error(d.error||'UPLOAD_FAILED');small.textContent='تم حفظ الصورة';const img=card.querySelector('.avatar img');if(img)img.src=image;else location.reload()}catch(e){small.textContent=String(e.message||'فشل رفع الصورة')}finally{button.disabled=false}};
  card.querySelector('.memberInfo')?.appendChild(box);
}

const style=document.createElement('style');style.textContent='.kayanMovedAdminTab{background:#0b1726!important;border:1px solid #29415c!important;color:#dbe5ee!important}.kayanSelfImageUpload{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:9px}.kayanSelfImageUpload small{color:#9aa8b7;font-size:10px}';document.head.appendChild(style);
const observer=new MutationObserver(()=>{moveAdminPermissions();addSelfImageUpload()});observer.observe(document.body,{childList:true,subtree:true});setTimeout(()=>{moveAdminPermissions();addSelfImageUpload()},300);setInterval(()=>{moveAdminPermissions();addSelfImageUpload()},1200);
