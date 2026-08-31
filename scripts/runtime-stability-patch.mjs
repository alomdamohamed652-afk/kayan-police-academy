import fs from 'node:fs/promises';

const replace=async(file,from,to,label)=>{
  const p=await fs.readFile(file,'utf8');
  if(!p.includes(from))throw new Error('PATCH_TARGET_NOT_FOUND:'+label);
  await fs.writeFile(file,p.replace(from,to),'utf8');
};

await replace(
'server/academy-production-original.mjs',
"attempt.submittedAt=null;attempt.status='paused';attempt.expired=false;attempt.resumeAt=startAt;attempt.resumeUntil=until;const nowMs=Date.now(),priorBase=Math.max(0,Number(attempt.activeDurationSeconds||0)),priorStart=attempt.activeStartedAt?new Date(attempt.activeStartedAt).getTime():new Date(attempt.startedAt).getTime(),priorEnd=attempt.expiresAt?Math.min(nowMs,new Date(attempt.expiresAt).getTime()):nowMs,priorExtra=attempt.status==='expired'?0:Math.max(0,Math.round((priorEnd-priorStart)/1000));attempt.activeDurationSeconds=priorBase+priorExtra;",
"const previousStatus=String(attempt.status||'').toLowerCase(),nowMs=Date.now(),priorBase=Math.max(0,Number(attempt.activeDurationSeconds||0)),priorStart=attempt.activeStartedAt?new Date(attempt.activeStartedAt).getTime():new Date(attempt.startedAt).getTime(),priorEnd=attempt.expiresAt?Math.min(nowMs,new Date(attempt.expiresAt).getTime()):nowMs,priorExtra=previousStatus==='active'?Math.max(0,Math.round((priorEnd-priorStart)/1000)):0;attempt.activeDurationSeconds=priorBase+priorExtra;attempt.submittedAt=null;attempt.status='paused';attempt.expired=false;attempt.resumeAt=startAt;attempt.resumeUntil=until;",
'resume-duration');

await replace(
'server/supabase-academy-store.mjs',
"status:x.submittedAt?'submitted':(x.status||'in_progress'),",
"status:x.submittedAt?'submitted':(['submitted','expired','cancelled'].includes(String(x.status||'').toLowerCase())?String(x.status).toLowerCase():'in_progress'),",
'exam-attempt-status');

await replace('server/academy-production-original.mjs',
"function audit(c,a,t,d=''){data.audit.unshift({id:\`audit-\${Date.now()}\`,",
"function audit(c,a,t,d=''){data.audit.unshift({id:\`audit-\${Date.now()}-\${crypto.randomBytes(4).toString('hex')}\`,",
'audit-unique-id');

console.log('Runtime stability patch applied.');
