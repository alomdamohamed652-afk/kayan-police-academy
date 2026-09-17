import fs from 'node:fs/promises';

const replaceOnce = async (file, from, to, label) => {
  const source = await fs.readFile(file, 'utf8');
  if (!source.includes(from)) throw new Error(`EXAM_HARDENING_TARGET_NOT_FOUND:${label}`);
  await fs.writeFile(file, source.replace(from, to), 'utf8');
};

await replaceOnce(
  'server/academy-production-original.mjs',
  "const e=data.exams.find(x=>x.id===req.params.id&&x.active);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const uid=String(c.x.id),attempt=data.examAttempts.find(x=>x.examId===e.id&&x.userId===uid&&!x.submittedAt);",
  "const e=data.exams.find(x=>x.id===req.params.id);if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const uid=String(c.x.id),attempt=data.examAttempts.find(x=>x.examId===e.id&&x.userId===uid&&!x.submittedAt);",
  'autosave-allows-existing-attempt'
);

await replaceOnce(
  'server/academy-production-original.mjs',
  "const answers=req.body?.answers&&typeof req.body.answers==='object'?req.body.answers:{};attempt.answers={...(attempt.answers||{}),...Object.fromEntries(Object.entries(answers).map(([k,v])=>[k,String(v??'').slice(0,5000)]))};attempt.lastSavedAt=new Date().toISOString();const persisted=await persistAttemptSafe(attempt);",
  "const answers=req.body?.answers&&typeof req.body.answers==='object'?req.body.answers:{};const incomingUpdatedAt=validDate(req.body?.clientUpdatedAt)?iso(req.body.clientUpdatedAt):new Date().toISOString();const currentUpdatedAt=validDate(attempt.answersUpdatedAt)?new Date(attempt.answersUpdatedAt).getTime():0;if(currentUpdatedAt&&new Date(incomingUpdatedAt).getTime()<currentUpdatedAt)return res.json({ok:true,stale:true,lastSavedAt:attempt.lastSavedAt||attempt.answersUpdatedAt});attempt.answers={...(attempt.answers||{}),...Object.fromEntries(Object.entries(answers).map(([k,v])=>[k,String(v??'').slice(0,5000)]))};attempt.answersUpdatedAt=incomingUpdatedAt;attempt.lastSavedAt=new Date().toISOString();const persisted=await persistAttemptSafe(attempt);",
  'autosave-monotonic-timestamp'
);

await replaceOnce(
  'src/main.jsx',
  "answersRef=useRef({}),activeRef=useRef(null),attemptRef=useRef(null),submitLockRef=useRef(false),syncInFlightRef=useRef(false);",
  "answersRef=useRef({}),activeRef=useRef(null),attemptRef=useRef(null),submitLockRef=useRef(false),syncInFlightRef=useRef(false),answersUpdatedAtRef=useRef(Date.now());",
  'client-answer-timestamp-ref'
);

await replaceOnce(
  'src/main.jsx',
  "const key='kayan_exam_draft_'+(user?.discord?.id||'me')+'_'+active.id;const snapshot={answers,updatedAt:Date.now(),attemptId:attempt.id,examId:active.id};",
  "const key='kayan_exam_draft_'+(user?.discord?.id||'me')+'_'+active.id;const updatedAt=Date.now();answersUpdatedAtRef.current=updatedAt;const snapshot={answers,updatedAt,attemptId:attempt.id,examId:active.id};",
  'client-answer-timestamp'
);

await replaceOnce(
  'src/main.jsx',
  "body:JSON.stringify({answers:answersRef.current,accessToken:inviteToken||undefined,clientRevision:revision})",
  "body:JSON.stringify({answers:answersRef.current,accessToken:inviteToken||undefined,clientRevision:revision,clientUpdatedAt:new Date(answersUpdatedAtRef.current).toISOString()})",
  'autosave-client-timestamp'
);

await replaceOnce(
  'src/main.jsx',
  "const body=JSON.stringify({answers:answersRef.current,accessToken:inviteToken||undefined,clientRevision:autosaveRevisionRef.current});",
  "const body=JSON.stringify({answers:answersRef.current,accessToken:inviteToken||undefined,clientRevision:autosaveRevisionRef.current,clientUpdatedAt:new Date(answersUpdatedAtRef.current).toISOString()});",
  'beacon-client-timestamp'
);

console.log('Exam hardening patch applied.');
