import fs from 'node:fs/promises';

async function replaceIfPresent(path,from,to,label){
  const source=await fs.readFile(path,'utf8');
  if(!source.includes(from)){
    console.log(`[exam-hardening-v3] skipped/already applied: ${label}`);
    return;
  }
  await fs.writeFile(path,source.replace(from,to),'utf8');
  console.log(`[exam-hardening-v3] applied: ${label}`);
}

await replaceIfPresent(
  'server/academy-production-original.mjs',
  "const e=data.exams.find(x=>x.id===req.params.id&&x.active);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const uid=String(c.x.id),attempt=data.examAttempts.find(x=>x.examId===e.id&&x.userId===uid&&!x.submittedAt);",
  "const e=data.exams.find(x=>x.id===req.params.id);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const uid=String(c.x.id),attempt=data.examAttempts.find(x=>x.examId===e.id&&x.userId===uid&&!x.submittedAt);",
  'autosave-allows-existing-attempt'
);

await replaceIfPresent(
  'server/academy-production-original.mjs',
  "const answers=req.body?.answers&&typeof req.body.answers==='object'?req.body.answers:{};attempt.answers={...(attempt.answers||{}),...Object.fromEntries(Object.entries(answers).map(([k,v])=>[k,String(v??'').slice(0,5000)]))};attempt.lastSavedAt=new Date().toISOString();const persisted=await persistAttemptSafe(attempt);",
  "const answers=req.body?.answers&&typeof req.body.answers==='object'?req.body.answers:{};const incomingRevision=Math.max(0,Number(req.body?.clientRevision||0));const currentRevision=Math.max(0,Number(attempt.clientRevision||0),Number(attempt.answersRevision||0));if(incomingRevision>0&&currentRevision>incomingRevision)return res.status(409).json({error:'STALE_ATTEMPT_REVISION',retryable:true,currentRevision});if(incomingRevision>0&&currentRevision===incomingRevision&&JSON.stringify(answers)===JSON.stringify(attempt.answers||{}))return res.json({ok:true,stale:true,lastSavedAt:attempt.lastSavedAt||attempt.answersUpdatedAt||null});attempt.answers={...(attempt.answers||{}),...Object.fromEntries(Object.entries(answers).map(([k,v])=>[k,String(v??'').slice(0,5000)]))};attempt.answersUpdatedAt=new Date().toISOString();attempt.clientRevision=Math.max(currentRevision+1,incomingRevision);attempt.lastSavedAt=new Date().toISOString();const persisted=await persistAttemptSafe(attempt);",
  'autosave-revision-guard'
);

await replaceIfPresent(
  'server/supabase-academy-store.mjs',
  "examAttempts:attempts.map(x=>x.legacy_data||{id:x.legacy_id,examId:x.exam_id,discordId:x.discord_id,answers:x.answers,startedAt:x.started_at,expiresAt:x.expires_at,submittedAt:x.submitted_at}),",
  "examAttempts:attempts.map(x=>{const legacy=x.legacy_data&&typeof x.legacy_data==='object'?x.legacy_data:{};return{...legacy,id:x.legacy_id,examId:x.exam_id,discordId:x.discord_id,answers:x.answers,startedAt:x.started_at,expiresAt:x.expires_at,submittedAt:x.submitted_at,answersUpdatedAt:x.answers_updated_at||legacy.answersUpdatedAt||null,answersRevision:Number(x.answers_revision||legacy.answersRevision||0),clientRevision:Number(legacy.clientRevision||x.answers_revision||0)};}),",
  'load-answer-version-metadata'
);

console.log('Exam hardening patch applied.');
