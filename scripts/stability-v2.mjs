import fs from 'node:fs/promises';

async function patchFile(path,patches){
  let source=await fs.readFile(path,'utf8');
  for(const {name,from,to} of patches){
    if(!source.includes(from))throw new Error(`[stability-v2] Patch target not found: ${name} in ${path}`);
    source=source.replace(from,to);
    console.log(`[stability-v2] applied: ${name}`);
  }
  await fs.writeFile(path,source);
}

await patchFile('server/academy-production-original.mjs',[
  {
    name:'debounce Google mirror writes',
    from:`function queueGoogleMirror(reason='mutation'){
  if(!supabaseActive||!DATA_SHEET_ID)return;
  mirrorQueue=mirrorQueue.catch(()=>{}).then(()=>mirrorSupabaseToGoogle(reason));
}`,
    to:`let mirrorTimer=null;
let pendingMirrorReason='';
function runGoogleMirror(reason){
  mirrorQueue=mirrorQueue.catch(()=>{}).then(()=>mirrorSupabaseToGoogle(reason));
}
function queueGoogleMirror(reason='mutation'){
  if(!supabaseActive||!DATA_SHEET_ID)return;
  // Startup/scheduled syncs are intentional. Mutation syncs are coalesced so
  // exam autosave cannot hammer Google Sheets every few seconds.
  if(reason==='startup'||reason==='scheduled'){
    if(mirrorTimer){clearTimeout(mirrorTimer);mirrorTimer=null;pendingMirrorReason=''}
    runGoogleMirror(reason);
    return;
  }
  pendingMirrorReason=reason||pendingMirrorReason||'data-save';
  if(mirrorTimer)return;
  const sinceLast=lastMirrorAt?Date.now()-lastMirrorAt:Infinity;
  const delay=Math.max(5000,60000-Math.min(60000,sinceLast));
  mirrorTimer=setTimeout(()=>{
    mirrorTimer=null;
    const nextReason=pendingMirrorReason||'data-save';
    pendingMirrorReason='';
    runGoogleMirror(nextReason);
  },delay);
  mirrorTimer.unref?.();
}`
  },
  {
    name:'do not mark primary storage unhealthy on mirror-only errors',
    from:`  }catch(e){
    lastMirrorError=String(e?.message||e);
    console.error('Google third-party mirror failed:',lastMirrorError);
    return false;
  }finally{mirrorRunning=false}`,
    to:`  }catch(e){
    lastMirrorError=String(e?.message||e);
    // Google is a secondary mirror while Supabase is active. A mirror outage
    // must never make the academy/admin primary storage appear unavailable.
    if(!supabaseActive)lastStorageError=lastMirrorError;
    console.error('Google third-party mirror failed:',lastMirrorError);
    return false;
  }finally{mirrorRunning=false}`
  }
]);
await patchFile('src/main.jsx',[
  {
    name:'exam autosave cannot get stuck behind an in-flight request',
    from:`// Crash-safe autosave: device storage is immediate, then a debounced server
// write follows quickly. If the network is busy/offline we retry in the
// background without ever clearing the student's answers.
useEffect(()=>{if(!attempt||!active||!pendingSync)return;let cancelled=false,retryTimer=null;
 const sync=async()=>{if(cancelled||syncInFlightRef.current)return;syncInFlightRef.current=true;try{
   setSaving(true);setSyncStatus('syncing');
   await api('/api/exams/'+active.id+'/attempt',{method:'PUT',body:JSON.stringify({answers:answersRef.current,accessToken:inviteToken||undefined})});
   if(!cancelled){setPendingSync(false);setSyncStatus('saved');setLastSavedAt(Date.now())}
 }catch{
   if(!cancelled){setSyncStatus('local');retryTimer=setTimeout(sync,5000)}
 }finally{syncInFlightRef.current=false;if(!cancelled)setSaving(false)}};
 const first=setTimeout(sync,2500);
 return()=>{cancelled=true;clearTimeout(first);if(retryTimer)clearTimeout(retryTimer)}
},[attempt,active,pendingSync,inviteToken]);`,
    to:`// Crash-safe autosave: localStorage is the immediate source of truth on the
// student's device. Server persistence is intentionally throttled so a busy
// exam cannot generate a write storm. A monotonically increasing revision makes
// sure an older in-flight request can never clear a newer pending snapshot.
const autosaveRevisionRef=useRef(0);
useEffect(()=>{if(!attempt||!active||!pendingSync)return;let cancelled=false,retryTimer=null;
 const revision=++autosaveRevisionRef.current;
 const sync=async()=>{
   if(cancelled)return;
   if(syncInFlightRef.current){retryTimer=setTimeout(sync,1000);return}
   syncInFlightRef.current=true;
   try{
     setSaving(true);setSyncStatus('syncing');
     const payload={answers:answersRef.current,accessToken:inviteToken||undefined,clientRevision:revision};
     await api('/api/exams/'+active.id+'/attempt',{method:'PUT',body:JSON.stringify(payload)});
     if(!cancelled&&revision===autosaveRevisionRef.current){setPendingSync(false);setSyncStatus('saved');setLastSavedAt(Date.now())}
   }catch{
     if(!cancelled){setSyncStatus('local');retryTimer=setTimeout(sync,5000)}
   }finally{syncInFlightRef.current=false;if(!cancelled)setSaving(false)}
 };
 const first=setTimeout(sync,8000);
 return()=>{cancelled=true;clearTimeout(first);if(retryTimer)clearTimeout(retryTimer)}
},[attempt,active,pendingSync,inviteToken]);
// When the tab is backgrounded, immediately try one final server sync. The
// local snapshot remains available even if the browser refuses the request.
useEffect(()=>{if(!attempt||!active)return;const flush=()=>{if(document.visibilityState!=='hidden')return;const body=JSON.stringify({answers:answersRef.current,accessToken:inviteToken||undefined,clientRevision:autosaveRevisionRef.current});try{navigator.sendBeacon('/api/exams/'+active.id+'/attempt',new Blob([body],{type:'application/json'}))}catch{}};document.addEventListener('visibilitychange',flush);return()=>document.removeEventListener('visibilitychange',flush)},[attempt,active,inviteToken]);`
  }
]);

console.log('[stability-v2] production storage and exam hardening complete');
