const nativeFetch = window.fetch.bind(window);

let cachedMe = null;
const norm = v => String(v ?? '').trim().replace(/\s+/g, '');
const traineeRanks = new Set(['مستجد','جندي','جنديأول'].map(norm));
const trainerRanks = new Set(['رقيب','رقيبأول','مساعد','مساعدأول','ملازم','ملازماول','ملازمتاني','نقيب','رائد','مقدم','عقيد','عميد','لواء','فريق'].map(norm));
const roleOf = rank => {
  const r = norm(rank);
  if (traineeRanks.has(r)) return 'trainee';
  if (trainerRanks.has(r)) return 'trainer';
  return 'none';
};

async function me(){
  if (cachedMe) return cachedMe;
  try { cachedMe = await nativeFetch('/api/me').then(r => r.json()); } catch { cachedMe = null; }
  return cachedMe;
}

function textOf(el){ return String(el?.textContent || '').replace(/\s+/g,' ').trim(); }
function isTrainerEvaluationText(t){ return /تقييم\s*(المدرب|المدربين)/.test(t); }
function isTraineeEvaluationText(t){ return /تقييم\s*(المتدرب|المتدربين)/.test(t); }

async function applyEvaluationGuard(){
  if (location.pathname !== '/academy/evaluations') return;
  const u = await me();
  const role = roleOf(u?.police?.rank);
  if (role === 'none') return;

  const nodes = [...document.querySelectorAll('button,a,[role="button"],h2,h3,h4,label')];
  for (const el of nodes) {
    const t = textOf(el);
    if (!t) continue;
    const wrong = role === 'trainer' ? isTrainerEvaluationText(t) : isTraineeEvaluationText(t);
    if (!wrong) continue;

    // Never hide the whole page. Hide only the nearest tab/button/card control.
    const target = el.closest('button,[role="button"],a') || (el.tagName.match(/^H[2-4]$/) ? el.parentElement : el);
    if (target) target.dataset.kayanWrongEvaluation = '1';
  }

  document.querySelectorAll('[data-kayan-wrong-evaluation]').forEach(el => {
    el.style.display = 'none';
  });

  // If a hidden/wrong tab was active, click the allowed direction instead.
  const allowed = [...document.querySelectorAll('button,a,[role="button"]')].find(el => {
    const t = textOf(el);
    return role === 'trainer' ? isTraineeEvaluationText(t) : isTrainerEvaluationText(t);
  });
  if (allowed && allowed.dataset.kayanWrongEvaluation !== '1') {
    const active = document.querySelector('.tabs button.active,[role="tab"][aria-selected="true"]');
    if (!active || active.dataset.kayanWrongEvaluation === '1') allowed.click();
  }
}

const observer = new MutationObserver(() => {
  if (location.pathname === '/academy/evaluations') applyEvaluationGuard();
});
observer.observe(document.body, { childList:true, subtree:true });
window.addEventListener('popstate', () => { cachedMe = null; setTimeout(applyEvaluationGuard, 100); });
setTimeout(applyEvaluationGuard, 250);
setInterval(() => { if (location.pathname === '/academy/evaluations') applyEvaluationGuard(); }, 1000);
