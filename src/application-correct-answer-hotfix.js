const nativeFetch = window.fetch.bind(window);
const correctAnswers = new Map();
let questionState = null;
let loadingQuestionState = false;

const escQ = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function loadQuestionState(){
  if(loadingQuestionState) return questionState;
  loadingQuestionState = true;
  try{
    const r = await nativeFetch('/api/admin/state');
    if(!r.ok) throw Error('ADMIN_STATE_FAILED');
    const d = await r.json();
    questionState = Array.isArray(d.applicationQuestions) ? d.applicationQuestions : [];
    for(const q of questionState){
      if(q?.type === 'yesno') correctAnswers.set(String(q.id), String(q.correct || ''));
    }
  }catch{}
  loadingQuestionState = false;
  return questionState;
}

function applicationQuestionsHost(){
  const heading = [...document.querySelectorAll('h2')].find(x => String(x.textContent || '').trim() === 'أسئلة التقديم');
  return heading?.closest('.stack') || null;
}

function decorateApplicationQuestions(){
  if(location.pathname !== '/admin') return;
  const host = applicationQuestionsHost();
  if(!host) return;
  const cards = [...host.querySelectorAll('.qAdmin')];
  if(!cards.length) return;
  const questions = questionState || [];
  cards.forEach((card,index)=>{
    const typeSelect = [...card.querySelectorAll('select')].find(s => ['text','yesno','choice'].includes(s.value));
    if(!typeSelect) return;
    const q = questions[index];
    if(q?.id) card.dataset.kayanQuestionId = String(q.id);
    const isYesNo = typeSelect.value === 'yesno';
    let box = card.querySelector('.kayanCorrectAnswer');
    if(!isYesNo){ if(box) box.remove(); return; }
    if(!box){
      box=document.createElement('div');
      box.className='kayanCorrectAnswer';
      box.innerHTML='<span>الإجابة الصحيحة</span><button type="button" data-correct="نعم">نعم</button><button type="button" data-correct="لا">لا</button>';
      typeSelect.insertAdjacentElement('afterend',box);
      box.querySelectorAll('button[data-correct]').forEach(btn=>btn.addEventListener('click',()=>{
        const id=String(card.dataset.kayanQuestionId || `index:${index}`);
        correctAnswers.set(id,btn.dataset.correct);
        box.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===btn));
      }));
    }
    const id=String(card.dataset.kayanQuestionId || `index:${index}`);
    const current=correctAnswers.get(id) || String(q?.correct || '');
    box.querySelectorAll('button[data-correct]').forEach(btn=>btn.classList.toggle('active',btn.dataset.correct===current));
  });
}

window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : (input?.url || '');
  const method = String(init.method || 'GET').toUpperCase();
  if(url.endsWith('/api/admin/application') && method === 'PUT'){
    let body={};
    try{ body=JSON.parse(init.body || '{}'); }catch{}
    if(Array.isArray(body.questions)){
      body.questions=body.questions.map((q,index)=>{
        if(q?.type !== 'yesno') return q;
        const id=String(q.id || `index:${index}`);
        return {...q,correct:String(correctAnswers.get(id) || q.correct || '')};
      });
      init={...init,body:JSON.stringify(body)};
    }
  }
  return nativeFetch(input,init);
};

const css=document.createElement('style');
css.textContent=`
.kayanCorrectAnswer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0;padding:10px 12px;background:#07111e;border:1px solid #29415c;border-radius:10px;direction:rtl}
.kayanCorrectAnswer span{font-size:12px;font-weight:800;color:#aebaca;margin-left:4px}
.kayanCorrectAnswer button{border:1px solid #29415c;background:#0b1726;color:#dce5ee;border-radius:9px;padding:7px 16px;font-weight:800;cursor:pointer}
.kayanCorrectAnswer button.active{background:#d6b35e;color:#101925;border-color:#d6b35e}
`;
document.head.appendChild(css);

const observer=new MutationObserver(async()=>{
  if(location.pathname!=='/admin') return;
  if(!questionState) await loadQuestionState();
  decorateApplicationQuestions();
});
observer.observe(document.body,{childList:true,subtree:true});
setTimeout(async()=>{await loadQuestionState();decorateApplicationQuestions()},500);
setInterval(()=>{if(location.pathname==='/admin')decorateApplicationQuestions()},1000);
