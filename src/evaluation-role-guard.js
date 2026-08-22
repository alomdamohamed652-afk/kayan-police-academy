const nativeFetch = window.fetch.bind(window);
let cachedMe = null;
const norm = v => String(v ?? '').trim().toLowerCase().replace(/[\u064B-\u065F\u0670\u0640\s_\-#]+/g, '');
const traineeRanks = ['مستجد','جندي','جنديأول','طالب','متدرب'].map(norm);
const trainerRanks = ['رقيب','رقيبأول','مساعد','مساعدأول','ملازم','ملازماول','ملازمثاني','نقيب','رائد','مقدم','عقيد','عميد','لواء','فريق','رئيسالأكاديمية','نائبرئيسالأكاديمية','مساعدنائبرئيسالأكاديمية','قائدالشرطة','رئيسالشرطة','نائبرئيسالشرطة','مساعدقائدالشرطة'].map(norm);
const roleOf = police => {
  const r = norm(police?.rank), responsibility = norm(police?.responsibility);
  if (traineeRanks.some(x => r === x || r.includes(x)) || responsibility.includes('متدرب')) return 'trainee';
  if (trainerRanks.some(x => r === x || r.includes(x))) return 'trainer';
  return 'none';
};
async function me(){
  if (cachedMe) return cachedMe;
  try { cachedMe = await nativeFetch('/api/me').then(r => r.json()); } catch { cachedMe = null; }
  return cachedMe;
}
const textOf = el => String(el?.textContent || '').replace(/\s+/g,' ').trim();
const trainerText = t => /تقييم\s*(المدرب|المدربين)/.test(t);
const traineeText = t => /تقييم\s*(المتدرب|المتدربين)/.test(t);
async function apply(){
  if(location.pathname !== '/academy/evaluations') return;
  const u = await me(), role = roleOf(u?.police);
  if(role === 'none') return;
  const tabs = [...document.querySelectorAll('.tabs button,[role="tab"]')];
  if(!tabs.length) return;
  tabs.forEach(tab => {
    const t = textOf(tab);
    const wrong = role === 'trainer' ? trainerText(t) : traineeText(t);
    if(wrong){ tab.dataset.kayanWrongEvaluation='1'; tab.style.display='none'; }
    else { tab.removeAttribute('data-kayan-wrong-evaluation'); tab.style.removeProperty('display'); }
  });
  const active = document.querySelector('.tabs button.active,[role="tab"][aria-selected="true"]');
  if(active?.dataset.kayanWrongEvaluation === '1'){
    const allowed = tabs.find(tab => !tab.dataset.kayanWrongEvaluation && (role === 'trainer' ? traineeText(textOf(tab)) : trainerText(textOf(tab))));
    if(allowed) allowed.click();
  }
}
const observer = new MutationObserver(() => { if(location.pathname === '/academy/evaluations') apply(); });
observer.observe(document.body,{childList:true,subtree:true});
window.addEventListener('popstate',()=>{cachedMe=null;setTimeout(apply,100)});
setTimeout(apply,250);
setInterval(()=>{if(location.pathname === '/academy/evaluations') apply()},1000);
