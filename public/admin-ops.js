(()=>{
  if(window.__KAYAN_ADMIN_OPS__)return;
  window.__KAYAN_ADMIN_OPS__=true;
  const nativeFetch=window.fetch.bind(window);
  let adminState=null,health=null,dock=null,modal=null,lastStateAt=0,lastHealthAt=0;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isAdminRoute=()=>location.pathname==='/admin'||location.pathname.startsWith('/admin/');
  const j=async url=>{const r=await nativeFetch(url,{headers:{Accept:'application/json'}});if(!r.ok)throw Error('HTTP_'+r.status);return r.json()};
  const go=section=>{const p=section==='dashboard'?'/admin':'/admin/'+section;if(location.pathname!==p)history.pushState({},'',p);dispatchEvent(new PopStateEvent('popstate'));closeModal()};
  const counts=()=>{const s=adminState||{},now=Date.now(),apps=s.applications||[],attempts=s.examAttempts||[],evals=s.evaluations||[],exams=s.exams||[];return{pendingApps:apps.filter(x=>x.status==='pending').length,waitlist:apps.filter(x=>x.status==='waitlist').length,activeAttempts:attempts.filter(x=>!x.submittedAt&&(!x.expiresAt||new Date(x.expiresAt).getTime()>now)).length,pendingEvals:evals.filter(x=>x.status==='pending').length,complaints:evals.filter(x=>x.hasComplaint||String(x.complaint||'').trim()).length,upcomingExams:exams.filter(x=>x.active!==false&&x.startAt&&new Date(x.startAt).getTime()>now&&new Date(x.startAt).getTime()-now<86400000).length}};
  const alertTotal=()=>{const c=counts();return c.pendingApps+c.pendingEvals+c.complaints+c.upcomingExams};
  const healthOk=()=>health?.ok&&health?.persistentAcademyConfigured&&health?.storageMode!=='unavailable';
  const renderDock=()=>{
    if(!isAdminRoute()){dock?.remove();dock=null;return}
    if(!dock){dock=document.createElement('div');dock.className='kayanOpsDock';dock.innerHTML='<span class="kayanOpsStatus"><i></i><span>فحص النظام</span></span><button type="button" data-kayan-action="search">⌕ بحث شامل <kbd>Ctrl Q</kbd></button><button type="button" data-kayan-action="alerts">تنبيهات <span class="kayanOpsCount">0</span></button>';document.body.appendChild(dock);dock.addEventListener('click',e=>{const b=e.target.closest('button[data-kayan-action]');if(!b)return;openModal(b.dataset.kayanAction)})}
    const st=dock.querySelector('.kayanOpsStatus'),ct=dock.querySelector('.kayanOpsCount');
    st.classList.toggle('ok',Boolean(healthOk()));st.classList.toggle('warn',Boolean(health&&!healthOk()));st.querySelector('span').textContent=healthOk()?'النظام مستقر':health?'راجع حالة التخزين':'فحص النظام';ct.textContent=String(alertTotal());
  };
  const refresh=async(force=false)=>{
    if(!isAdminRoute())return;
    const now=Date.now();
    const jobs=[];
    if(force||now-lastStateAt>30000)jobs.push(j('/api/admin/state').then(x=>{adminState=x;lastStateAt=Date.now()}));
    if(force||now-lastHealthAt>60000)jobs.push(j('/api/health').then(x=>{health=x;lastHealthAt=Date.now()}));
    try{await Promise.all(jobs)}catch(_e){}finally{renderDock();if(modal)renderModal(modal.dataset.mode||'search')}
  };
  const summaryHtml=()=>{const c=counts();return `<div class="kayanOpsSummary"><div class="kayanOpsCard"><b>${c.pendingApps}</b><span>طلبات للمراجعة</span></div><div class="kayanOpsCard"><b>${c.activeAttempts}</b><span>اختبارات جارية</span></div><div class="kayanOpsCard"><b>${c.pendingEvals}</b><span>تقييمات معلقة</span></div><div class="kayanOpsCard"><b>${c.complaints}</b><span>شكاوى/توضيحات</span></div></div>`};
  const alertItems=()=>{const c=counts(),a=[];if(c.pendingApps)a.push(['التقديمات',`${c.pendingApps} طلب ينتظر المراجعة`,'applications']);if(c.waitlist)a.push(['قائمة الانتظار',`${c.waitlist} متقدم في قائمة الانتظار`,'applications']);if(c.pendingEvals)a.push(['التقييمات',`${c.pendingEvals} تقييم ينتظر قرار الإدارة`,'evaluations']);if(c.complaints)a.push(['شكاوى داخل التقييمات',`${c.complaints} تقرير يحتوي شكوى أو توضيحًا`,'evaluations']);if(c.upcomingExams)a.push(['اختبارات قريبة',`${c.upcomingExams} اختبار يبدأ خلال 24 ساعة`,'exams']);if(health&&!healthOk())a.unshift(['حالة النظام',`التخزين: ${health.storageMode||'غير متاح'}${health.storageError?' · '+health.storageError:''}`,'dashboard']);return a};
  const searchItems=q=>{if(!adminState||!q.trim())return[];const n=q.trim().toLowerCase(),out=[],push=(type,title,sub,section)=>{if((title+' '+sub).toLowerCase().includes(n))out.push({type,title,sub,section})};for(const x of adminState.members||[])push('فرد',x.name||x.discordId,`${x.rank||''} · Badge ${x.badge||'—'} · ${x.discordId||''}`,'members');for(const x of adminState.applications||[])push('طلب تقديم',x.name||x.discordId,`${x.status||''} · ${x.discordId||''} · ${x.id||''}`,'applications');for(const x of adminState.exams||[])push('اختبار',x.title||x.id,`${x.stage||''} · ${x.id||''}`,'exams');for(const x of adminState.batches||[])push('دفعة',x.name||x.id,`${x.status||''} · ${x.id||''}`,'applications');for(const x of adminState.evaluations||[])push('تقييم',x.targetName||x.targetDiscordId||x.id,`${x.status||''} · ${x.evaluatorName||x.evaluatorDiscordId||''}`,'evaluations');return out.slice(0,40)};
  const renderResults=(items,empty='لا توجد نتائج مطابقة.')=>items.length?`<div class="kayanOpsList">${items.map(x=>`<div class="kayanOpsItem"><div class="kayanOpsItemMain"><strong>${esc(x.type?x.type+' · ':'')}${esc(x.title||x[0])}</strong><small>${esc(x.sub||x[1])}</small></div><button type="button" data-section="${esc(x.section||x[2])}">فتح القسم</button></div>`).join('')}</div>`:`<div class="kayanOpsEmpty">${esc(empty)}</div>`;
  const renderModal=mode=>{
    if(!modal)return;modal.dataset.mode=mode;const body=modal.querySelector('.kayanOpsBody'),input=modal.querySelector('input');
    modal.querySelector('h2').textContent=mode==='alerts'?'مركز التنبيهات':'البحث الشامل';modal.querySelector('.kayanOpsHead small').textContent=mode==='alerts'?'الأشياء التي تحتاج متابعة الآن':'ابحث في الأفراد والتقديمات والاختبارات والتقييمات';
    modal.querySelector('.kayanOpsSearch').style.display=mode==='alerts'?'none':'block';
    if(mode==='alerts'){const items=alertItems().map(x=>({title:x[0],sub:x[1],section:x[2]}));body.innerHTML=summaryHtml()+`<div class="kayanOpsSection"><h3>تحتاج متابعة</h3>${renderResults(items,'لا توجد تنبيهات حالية. النظام هادئ 👌')}</div>`+(health?`<div class="kayanOpsHint">التخزين الأساسي: ${esc(health.storageMode||'—')} · آخر مزامنة Google: ${esc(health.googleMirrorLastSync||'—')}</div>`:'');}
    else{const items=searchItems(input.value);body.innerHTML=summaryHtml()+`<div class="kayanOpsSection"><h3>نتائج البحث</h3>${input.value.trim()?renderResults(items):'<div class="kayanOpsEmpty">اكتب اسمًا، Badge، Discord ID، اسم اختبار أو رقم طلب.</div>'}</div>`;}
  };
  const openModal=mode=>{if(modal)return renderModal(mode);modal=document.createElement('div');modal.className='kayanOpsBackdrop';modal.dataset.mode=mode;modal.innerHTML='<div class="kayanOpsModal" role="dialog" aria-modal="true"><div class="kayanOpsHead"><div><h2></h2><small></small></div><button class="kayanOpsClose" type="button" aria-label="إغلاق">×</button></div><div class="kayanOpsSearch"><input type="search" autocomplete="off" placeholder="ابحث في النظام كله..." /></div><div class="kayanOpsBody"></div></div>';document.body.appendChild(modal);modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('.kayanOpsClose'))return closeModal();const b=e.target.closest('button[data-section]');if(b)go(b.dataset.section)});modal.querySelector('input').addEventListener('input',()=>renderModal('search'));renderModal(mode);if(mode==='search')setTimeout(()=>modal?.querySelector('input')?.focus(),30);refresh(true)};
  const closeModal=()=>{modal?.remove();modal=null};
  addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();if(isAdminRoute())openModal('search')}if(e.key==='Escape'&&modal)closeModal()});
  addEventListener('popstate',()=>{setTimeout(()=>{renderDock();refresh(false)},50)});
  const originalPush=history.pushState.bind(history);history.pushState=(...args)=>{const r=originalPush(...args);setTimeout(()=>{renderDock();refresh(false)},50);return r};
  addEventListener('DOMContentLoaded',()=>{renderDock();refresh(true);setInterval(()=>refresh(false),30000)},{once:true});
  addEventListener('kayan:online',()=>refresh(true));
})();