const nativeFetch=window.fetch.bind(window);
const json=async r=>{try{return await r.clone().json()}catch{return {}}};

window.fetch=async(input,init={})=>{
  const url=typeof input==='string'?input:input?.url||'';
  const method=String(init.method||'GET').toUpperCase();
  if(url.includes('/api/evaluation-people')&&method==='GET'){
    const r=await nativeFetch('/api/evaluation-people-v2');
    return r;
  }
  if(url.endsWith('/api/evaluations')&&method==='POST'){
    return nativeFetch('/api/evaluations-v2',init);
  }
  if(url.match(/\/api\/admin\/batches\/[^/]+$/)&&method==='DELETE'){
    const r=await nativeFetch(input,init);
    if(r.ok){try{await nativeFetch('/api/admin/evaluation-batch',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({batchId:''})})}catch{}}
    return r;
  }
  return nativeFetch(input,init);
};

const css=document.createElement('style');
css.textContent=`
.kayanBatchEval{display:inline-flex;align-items:center;gap:7px!important}
.kayanBatchEval.open{background:#d6b35e!important;color:#101925!important;border-color:#d6b35e!important}
.kayanBatchEval.closed{background:#0b1726!important;color:#eef3f7!important}
.kayanBatchEval:disabled{opacity:.55;cursor:not-allowed}
.kayanBatchSettings{display:inline-flex;align-items:center;gap:7px}
.kayanEvalState{display:inline-flex;align-items:center;border:1px solid #29415c;border-radius:999px;padding:6px 10px;font-size:10px;font-weight:700}
.kayanEvalState.open{color:#e8c76b;border-color:#8b6e24;background:#211b0b}
.kayanEvalState.closed{color:#91a0b1;background:#0b1726}
`;
document.head.appendChild(css);

let selectedEvaluationBatchId='';
let loadingEvaluationState=false;

async function evaluationState(){
  if(loadingEvaluationState)return selectedEvaluationBatchId;
  loadingEvaluationState=true;
  try{
    const r=await nativeFetch('/api/admin/evaluation-batch');
    if(r.ok){const d=await r.json();selectedEvaluationBatchId=String(d.selectedBatchId||d.batch?.id||'');}
  }catch{}
  loadingEvaluationState=false;
  return selectedEvaluationBatchId;
}

async function toggleEvaluation(batchId,open){
  const r=await nativeFetch(`/api/admin/batches/${encodeURIComponent(batchId)}/evaluation`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({open})});
  if(!r.ok){let d={};try{d=await r.json()}catch{};throw Error(d.error||'EVALUATION_TOGGLE_FAILED')}
  const d=await r.json().catch(()=>({}));
  selectedEvaluationBatchId=String(d.batch?.id||'');
}

function clickSettings(){
  const b=document.querySelector('[data-ksettings]');
  if(b)b.click();
}

function mergeSettingsModal(){
  document.querySelectorAll('.kayanModal .kayanCard').forEach(card=>{
    const h=card.querySelector('h3');
    if(!h||!h.textContent.includes('دفعة التقييم'))return;
    card.remove();
  });
  document.querySelectorAll('.kayanModalGrid').forEach(grid=>{
    if(grid.querySelector('.kayanEvalMovedNote'))return;
    if(!grid.querySelector('.kayanCard'))return;
    const note=document.createElement('div');
    note.className='kayanCard kayanEvalMovedNote';
    note.innerHTML='<h3>إدارة التقييمات</h3><p>فتح وإغلاق التقييم أصبح من داخل كل دفعة مباشرة.</p>';
    grid.appendChild(note);
  });
}

async function decorateBatches(){
  if(location.pathname!=='/admin')return;
  const tabs=[...document.querySelectorAll('.adminTabs button')];
  const batchTab=tabs.find(x=>x.textContent.includes('الدفعات والتقديمات'));
  if(!batchTab)return;
  if(!document.querySelector('.adminTabs .kayanBatchSettings')){
    const b=document.createElement('button');
    b.type='button';b.className='kayanBatchSettings';b.textContent='⚙ الإعدادات';
    b.onclick=clickSettings;
    batchTab.parentElement.appendChild(b);
  }
  if(!document.querySelector('.batchPanel'))return;
  await evaluationState();
  document.querySelectorAll('.batchPanel').forEach(panel=>{
    if(panel.querySelector('[data-kayan-eval]'))return;
    const title=panel.querySelector('h2')?.textContent?.trim()||'';
    const candidates=[...panel.querySelectorAll('button')];
    const deleteButton=candidates.find(x=>x.textContent.trim()==='');
    const actionBox=panel.querySelector('.actions');
    if(!actionBox)return;
    const batchId=findBatchId(panel);
    if(!batchId)return;
    const open=selectedEvaluationBatchId===batchId;
    const b=document.createElement('button');
    b.type='button';b.className=`btn ${open?'primary':'secondary'} kayanBatchEval ${open?'open':'closed'}`;b.dataset.kayanEval='1';
    b.textContent=open?'إغلاق التقييم':'فتح التقييم';
    b.title=`${title||'الدفعة'} — ${open?'التقييم مفتوح':'التقييم مغلق'}`;
    b.onclick=async()=>{
      b.disabled=true;
      try{await toggleEvaluation(batchId,!open);location.reload()}
      catch(e){alert(String(e.message||e));b.disabled=false}
    };
    actionBox.insertBefore(b,deleteButton||actionBox.lastElementChild);
    const state=document.createElement('span');
    state.className=`kayanEvalState ${open?'open':'closed'}`;state.textContent=open?'التقييم مفتوح':'التقييم مغلق';
    actionBox.insertBefore(state,b);
  });
}

function findBatchId(panel){
  const del=panel.querySelector('button.btn.danger');
  const handler=del?.getAttribute('onclick');
  if(handler){const m=handler.match(/batches\\/(batch-[^/`\\"]+)/);if(m)return m[1]}
  const key=panel.getAttribute('data-batch-id');
  if(key)return key;
  return null;
}

const observer=new MutationObserver(()=>{
  mergeSettingsModal();
  if(location.pathname==='/admin')decorateBatches();
});
observer.observe(document.body,{childList:true,subtree:true});

setTimeout(()=>{mergeSettingsModal();decorateBatches()},400);
setInterval(()=>{mergeSettingsModal();decorateBatches()},1500);
