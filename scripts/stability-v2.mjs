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

await patchFile('server/supabase-academy-store.mjs',[
  {
    name:'safe hierarchy upsert through temporary coordinates',
    from:`  const hierarchy=cleanRows(data.hierarchy);
  await upsert('hierarchy',hierarchy.map((x,i)=>({legacy_id:legacyOf(x),level:Math.max(1,Number(x.level||1)),position:Math.max(1,Number(x.position||x.order||i+1)),title:str(x.title)||'غير محدد',discord_id:x.discordId?str(x.discordId):null,name_snapshot:x.name||null,image_url:x.image||x.imageUrl||null,legacy_data:x})),'legacy_id');
  await prune('hierarchy',hierarchy.map(legacyOf));`,
    to:`  const hierarchy=cleanRows(data.hierarchy);
  // Normalize positions inside each level and move current rows to temporary
  // coordinates before the final upsert. This prevents swaps/reorders from
  // violating hierarchy_level_position_unique while old coordinates still exist.
  const levelCounters=new Map();
  const hierarchyRows=hierarchy.map((x,i)=>{
    const level=Math.max(1,Number(x.level||1));
    const next=(levelCounters.get(level)||0)+1;levelCounters.set(level,next);
    return {legacy_id:legacyOf(x),level,position:next,title:str(x.title)||'غير محدد',discord_id:x.discordId?str(x.discordId):null,name_snapshot:x.name||null,image_url:x.image||x.imageUrl||null,legacy_data:{...x,level,position:next}};
  });
  if(hierarchyRows.length){
    const temporary=hierarchyRows.map((x,i)=>({...x,level:x.level+10000,position:i+1}));
    await upsert('hierarchy',temporary,'legacy_id');
  }
  await prune('hierarchy',hierarchy.map(legacyOf));
  await upsert('hierarchy',hierarchyRows,'legacy_id');`
  }
]);

console.log('[stability-v2] production storage hardening complete');