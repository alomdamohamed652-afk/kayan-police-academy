import { supabase, supabaseConfigured } from './supabase.mjs';

const cleanRows=v=>Array.isArray(v)?v:[];
const str=v=>v==null?'':String(v);
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const json=v=>v&&typeof v==='object'?v:{};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function retryable(error){
  const code=String(error?.code||'');
  const msg=String(error?.message||error?.details||error||'').toLowerCase();
  return code==='PGRST303'||msg.includes('jwt issued at future')||msg.includes('fetch failed')||msg.includes('network')||msg.includes('timeout')||msg.includes('temporarily unavailable');
}
async function withRetry(label,fn){
  let last;
  for(let attempt=0;attempt<5;attempt++){
    try{return await fn()}
    catch(error){last=error;if(!retryable(error)||attempt===4)throw error;const delay=500*Math.pow(2,attempt);console.warn('Supabase '+label+' retry '+(attempt+1)+'/5 after '+delay+'ms:',String(error?.message||error));await sleep(delay);}
  }
  throw last;
}
async function all(table,order=null){return withRetry('read '+table,async()=>{let query=supabase.from(table).select('*');if(order)query=query.order(order,{ascending:true});const {data,error}=await query;if(error)throw error;return data||[]});}
async function upsert(table,rows,onConflict){if(!rows.length)return;if(onConflict==='legacy_id'){const unique=new Map(),withoutLegacy=[];for(const raw of rows){const legacy=raw?.legacy_id?String(raw.legacy_id):'';if(legacy)unique.set(legacy,{...raw,legacy_id:legacy});else withoutLegacy.push(raw)}const values=Array.from(unique.values());if(values.length)await withRetry('upsert '+table,async()=>{const {error}=await supabase.from(table).upsert(values,{onConflict:'legacy_id'});if(error)throw error});if(withoutLegacy.length)await withRetry('insert '+table,async()=>{const {error}=await supabase.from(table).insert(withoutLegacy);if(error)throw error});return}await withRetry('upsert '+table,async()=>{const {error}=await supabase.from(table).upsert(rows,{onConflict});if(error)throw error})}
async function prune(table,legacyIds){const ids=[...new Set(legacyIds.filter(Boolean).map(String))],existing=await all(table),keep=new Set(ids),stale=existing.filter(x=>x.legacy_id&&!keep.has(String(x.legacy_id))).map(x=>x.legacy_id);if(!stale.length)return;for(let i=0;i<stale.length;i+=200){const chunk=stale.slice(i,i+200);await withRetry('prune '+table,async()=>{const {error}=await supabase.from(table).delete().in('legacy_id',chunk);if(error)throw error})}}
const legacyOf=x=>str(x?.id)||str(x?.discordId);
async function pruneExamQuestions(legacyIds){
  const ids=[...new Set(legacyIds.filter(Boolean).map(String))];
  const existing=await all('exam_questions');
  const keep=new Set(ids);
  const stale=existing.filter(x=>x.legacy_id&&!keep.has(String(x.legacy_id)));
  if(!stale.length)return;
  const staleIds=stale.map(x=>x.id).filter(Boolean);
  const referenced=new Set();
  for(let i=0;i<staleIds.length;i+=200){
    const chunk=staleIds.slice(i,i+200);
    await withRetry('find referenced exam questions',async()=>{
      const {data,error}=await supabase.from('attempt_answers').select('question_id').in('question_id',chunk);
      if(error)throw error;
      for(const row of data||[])if(row?.question_id)referenced.add(String(row.question_id));
    });
  }
  const deletable=stale.filter(x=>!referenced.has(String(x.id))).map(x=>x.legacy_id);
  for(let i=0;i<deletable.length;i+=200){
    const chunk=deletable.slice(i,i+200);
    await withRetry('prune exam_questions',async()=>{
      const {error}=await supabase.from('exam_questions').delete().in('legacy_id',chunk);
      if(error)throw error;
    });
  }
}
function settingsRow(s){const x=s||{};return{id:1,academy_name:x.academyName||'أكاديمية شرطة كيان',applications_title:x.applicationsTitle||'التقديم الأولي للشرطة',applications_description:x.applicationsDescription||'نموذج التقديم الرسمي للانضمام إلى شرطة كيان.',passing_score:num(x.passingScore)||60,logo_url:x.logoUrl||null,accepted_message:x.acceptedMessage||null,rejected_message:x.rejectedMessage||null,accepted_discord_url:x.acceptedDiscordUrl||null,evaluation_trainer_ranks:cleanRows(x.evaluationTrainerRanks).map(str),evaluation_trainee_ranks:cleanRows(x.evaluationTraineeRanks).map(str),updated_by:null,legacy_data:{...x,badges:Array.isArray(x?.badges)?x.badges:[],memberBadges:x?.memberBadges&&typeof x.memberBadges==='object'?x.memberBadges:{},devStoreTokens:x?.devStoreTokens&&typeof x.devStoreTokens==='object'?x.devStoreTokens:{}}}}

async function saveAcademyData(data){
  if(!supabaseConfigured)throw new Error('SUPABASE_NOT_CONFIGURED');
  await upsert('academy_settings',[settingsRow({...data.settings,badges:data.badges,memberBadges:data.memberBadges,devStoreTokens:data.devStoreTokens})],'id');
  const batches=cleanRows(data.batches);await upsert('application_batches',batches.map(x=>({legacy_id:legacyOf(x),name:str(x.name)||'دفعة',description:x.description||null,status:x.status||'open',start_at:x.startAt||null,end_at:x.endAt||null,closed_at:x.closedAt||null,created_by:x.createdBy||null,updated_by:x.updatedBy||null,legacy_data:x})),'legacy_id');await prune('application_batches',batches.map(legacyOf));const batchRows=await all('application_batches');const batchMap=new Map(batchRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
  const appQs=cleanRows(data.applicationQuestions);await upsert('application_questions',appQs.map((x,i)=>({legacy_id:legacyOf(x),batch_id:x.batchId?batchMap.get(String(x.batchId))||null:null,text:str(x.text),type:['text','choice','yesno'].includes(x.type)?x.type:'text',options:Array.isArray(x.options)?x.options:[],correct:x.correct??null,required:x.required!==false,points:Number(x.points||1),position:i,legacy_data:x})),'legacy_id');await prune('application_questions',appQs.map(legacyOf));
  const apps=cleanRows(data.applications);await upsert('applications',apps.map(x=>({legacy_id:legacyOf(x),batch_id:batchMap.get(String(x.batchId))||batchMap.get(String(x.batchID))||batchRows.find(b=>b.name===x.batchName)?.id,discord_id:str(x.discordId||x.userId),discord_username:x.username||x.discordUsername||null,applicant_name:x.name||null,submitted_at:x.submittedAt||new Date().toISOString(),status:x.status||'pending',review_note:x.reviewNote||x.note||null,reviewed_at:x.reviewedAt||null,reviewed_by:x.reviewerId||x.reviewedBy||null,answers:json(x.answers),legacy_data:x})),'legacy_id');await prune('applications',apps.map(legacyOf));
  const bank=cleanRows(data.questionBank);await upsert('question_bank',bank.map(x=>({legacy_id:legacyOf(x),text:str(x.text),type:['text','choice','yesno'].includes(x.type)?x.type:'text',options:Array.isArray(x.options)?x.options:[],correct:x.correct??null,required:x.required!==false,points:Number(x.points||1),tags:Array.isArray(x.tags)?x.tags.map(str):[],active:x.active!==false,legacy_data:x})),'legacy_id');await prune('question_bank',bank.map(legacyOf));const bankRows=await all('question_bank');const bankMap=new Map(bankRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
  const exams=cleanRows(data.exams);await upsert('exams',exams.map(x=>({legacy_id:legacyOf(x),title:str(x.title)||'اختبار',description:x.description||null,stage:x.stage||null,status:x.active===false?'closed':'open',active:x.active!==false,start_at:x.startAt||null,end_at:x.endAt||null,duration_minutes:Number(x.durationMinutes||30),passing_score:Number(x.passingScore||60),attempts_allowed:Number(x.attemptsAllowed||1),access_type:x.accessType==='link'?'invite':(x.accessType||'all'),access_users:Array.isArray(x.allowedDiscordIds)?x.allowedDiscordIds.map(str):Array.isArray(x.accessUsers)?x.accessUsers.map(str):[],invite_token_hash:x.inviteTokenHash||null,publish_results:Boolean(x.resultPublished||x.publishResults),show_answers:Boolean(x.showAnswers),resume_enabled:x.resumeEnabled!==false,resume_minutes:x.resumeMinutes?Number(x.resumeMinutes):null,created_by:x.createdBy||null,updated_by:x.updatedBy||null,legacy_data:x})),'legacy_id');await prune('exams',exams.map(legacyOf));const examRows=await all('exams');const examMap=new Map(examRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
  const eq=[];for(const exam of exams)for(const [i,q] of cleanRows(exam.questions).entries())eq.push({legacy_id:legacyOf(q),exam_id:examMap.get(legacyOf(exam)),question_bank_id:q.questionBankId?bankMap.get(String(q.questionBankId))||null:null,text:str(q.text),type:['text','choice','yesno'].includes(q.type)?q.type:'text',options:Array.isArray(q.options)?q.options:[],correct:q.correct??null,required:q.required!==false,points:Number(q.points||1),position:i,legacy_data:q});await upsert('exam_questions',eq,'legacy_id');await pruneExamQuestions(eq.map(x=>x.legacy_id));
  const attempts=cleanRows(data.examAttempts);const normalizeAttemptStatusForDb=x=>x?.submittedAt?'submitted':(['active','paused'].includes(String(x?.status||''))?'in_progress':(['in_progress','expired','cancelled'].includes(String(x?.status||''))?String(x.status):'in_progress'));await upsert('exam_attempts',attempts.map(x=>({legacy_id:legacyOf(x),exam_id:examMap.get(String(x.examId)),discord_id:str(x.discordId||x.userId),started_at:x.startedAt||new Date().toISOString(),expires_at:x.expiresAt||new Date().toISOString(),submitted_at:x.submittedAt||null,resume_at:x.resumeAt||null,resume_until:x.resumeUntil||null,resume_duration_minutes:x.resumeDurationMinutes?Number(x.resumeDurationMinutes):null,answers:json(x.answers),question_order:cleanRows(x.questionOrder).map(str).filter(Boolean),status:normalizeAttemptStatusForDb(x),auto_submitted:Boolean(x.autoSubmitted),legacy_data:x})).filter(x=>x.exam_id),'legacy_id');
  const attemptRows=await all('exam_attempts');const attemptMap=new Map(attemptRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));const results=cleanRows(data.examResults);await upsert('exam_results',results.map(x=>({legacy_id:legacyOf(x),attempt_id:attemptMap.get(String(x.attemptId||x.attemptID)),exam_id:examMap.get(String(x.examId)),discord_id:str(x.discordId||x.userId),score:Number(x.score||0),passed:Boolean(x.passed),duration_seconds:x.durationSeconds==null?null:Number(x.durationSeconds),submitted_at:x.submittedAt||new Date().toISOString(),published_at:x.publishedAt||null,review:Array.isArray(x.review)?x.review:[],legacy_data:x})).filter(x=>x.exam_id&&x.attempt_id),'legacy_id');
  const admins=cleanRows(data.admins);await upsert('admins',admins.map(x=>({discord_id:str(x.discordId),name:x.name||null,permissions:cleanRows(x.permissions).map(str),enabled:x.enabled!==false,source:x.source||'manual',created_by:x.createdBy||null,updated_by:x.updatedBy||null,legacy_data:x})),'discord_id');const hierarchy=cleanRows(data.hierarchy);const levelCounters=new Map();const hierarchyRows=hierarchy.map((x,i)=>{const level=Math.max(1,Number(x.level||1));const position=(levelCounters.get(level)||0)+1;levelCounters.set(level,position);return{legacy_id:legacyOf(x),level,position,title:str(x.title)||'غير محدد',discord_id:x.discordId?str(x.discordId):null,name_snapshot:x.name||null,image_url:x.image||x.imageUrl||null,legacy_data:{...x,level,position}}});if(hierarchyRows.length){await upsert('hierarchy',hierarchyRows.map((x,i)=>({...x,level:x.level+10000,position:i+1})),'legacy_id')}await prune('hierarchy',hierarchy.map(legacyOf));await upsert('hierarchy',hierarchyRows,'legacy_id');
  const settings=Object.entries(data.memberSettings||{}).map(([discordId,x])=>({discord_id:str(discordId),show_profile_button:x?.showProfileButton!==false,legacy_data:x||{}}));await upsert('member_settings',settings,'discord_id');const images=Object.entries(data.memberImages||{}).map(([discordId,image])=>({discord_id:str(discordId),image_url:typeof image==='string'?image:null,legacy_data:{image}}));await upsert('member_images',images,'discord_id');
  const evaluations=cleanRows(data.evaluations);await upsert('evaluations',evaluations.map(x=>({legacy_id:legacyOf(x),evaluator_discord_id:str(x.evaluatorDiscordId||x.userId||x.discordId),evaluator_role:x.evaluationRole==='trainer'?'trainer':'trainee',target_discord_id:str(x.targetDiscordId),target_name_snapshot:x.targetName||x.target?.name||null,target_rank_snapshot:x.targetRank||x.target?.rank||null,hours:x.hours==null?null:Number(x.hours),ratings:json(x.ratings),overall_rating:x.overallRating==null?null:Number(x.overallRating),same_trainer:x.sameTrainer==null?null:Boolean(x.sameTrainer),notes:x.notes||null,complaint:x.complaint||null,reviewed_at:x.reviewedAt||null,reviewed_by:x.reviewedBy||null,review_note:x.reviewNote||null,status:x.status||'pending',legacy_data:x})).filter(x=>x.evaluator_discord_id&&x.target_discord_id&&x.evaluator_discord_id!==x.target_discord_id),'legacy_id');await prune('evaluations',evaluations.map(legacyOf));
  const audit=cleanRows(data.audit),auditRows=audit.map(x=>({legacy_id:legacyOf(x),actor_discord_id:x.actorId||x.actorDiscordId||null,actor_name:x.actorName||null,action:str(x.action)||'UNKNOWN',entity_type:x.entityType||null,entity_id:x.entityId||null,details:json(x.details||x.target),created_at:x.at||x.createdAt||new Date().toISOString(),legacy_data:x}));if(auditRows.length){const uniqueAudit=Array.from(new Map(auditRows.map(x=>[String(x.legacy_id||''),x])).values()).filter(x=>x.legacy_id);await withRetry('upsert audit_logs',async()=>{const {error}=await supabase.from('audit_logs').upsert(uniqueAudit,{onConflict:'legacy_id',ignoreDuplicates:true});if(error)throw error})}const logins=cleanRows(data.loginLogs);await upsert('login_logs',logins.map(x=>({legacy_id:legacyOf(x),discord_id:x.discordId||null,username:x.username||null,success:x.success!==false,reason:x.reason||null,ip_hash:x.ipHash||null,user_agent:x.userAgent||null,created_at:x.at||x.createdAt||new Date().toISOString(),legacy_data:x})),'legacy_id');const drafts=Object.entries(data.applicationDrafts||{}).map(([discordId,draft])=>({discord_id:str(discordId),draft:json(draft),legacy_data:draft||{}}));await upsert('application_drafts',drafts,'discord_id');const overrides=Object.entries(data.roleOverrides||{}).map(([discordId,role])=>({discord_id:str(discordId),role:str(role),legacy_data:{role}}));await upsert('role_overrides',overrides,'discord_id');
}

async function loadAcademyData(){
  if(!supabaseConfigured)return null;
  const [settings,batches,appQs,apps,bank,exams,eq,attempts,results,admins,hierarchy,memberSettings,memberImages,evaluations,audit,logins,drafts,overrides,examSections]=await Promise.all([all('academy_settings','id'),all('application_batches'),all('application_questions','position'),all('applications'),all('question_bank'),all('exams'),all('exam_questions','position'),all('exam_attempts'),all('exam_results'),all('admins','discord_id'),all('hierarchy','position'),all('member_settings','discord_id'),all('member_images','discord_id'),all('evaluations'),all('audit_logs'),all('login_logs'),all('application_drafts','discord_id'),all('role_overrides','discord_id'),all('exam_sections','position')]);
  const hasData=settings.length||batches.length||appQs.length||apps.length||bank.length||exams.length||attempts.length||results.length||admins.length||hierarchy.length||evaluations.length||audit.length||logins.length||memberSettings.length||memberImages.length||drafts.length||overrides.length;if(!hasData)return null;const s=settings[0]||{},legacySettings=s.legacy_data&&typeof s.legacy_data==='object'?s.legacy_data:{};const sectionsByExam=new Map();
  for(const sec of examSections||[]){
    const key=String(sec.exam_id);
    if(!sectionsByExam.has(key))sectionsByExam.set(key,[]);
    sectionsByExam.get(key).push({id:sec.legacy_id,title:sec.title||'',description:sec.description||'',gateQuestionId:sec.gate_question_id||'',allowedAnswers:Array.isArray(sec.allowed_answers)?sec.allowed_answers:[],failMessage:sec.fail_message||'',nextSectionId:sec.next_section_id||'',_position:Number(sec.position)||0});
  }
  const data={version:18,settings:{academyName:s.academy_name,applicationsTitle:s.applications_title,applicationsDescription:s.applications_description,passingScore:s.passing_score,logoUrl:s.logo_url||'',acceptedMessage:s.accepted_message||'',rejectedMessage:s.rejected_message||'',acceptedDiscordUrl:s.accepted_discord_url||'',evaluationTrainerRanks:s.evaluation_trainer_ranks||[],evaluationTraineeRanks:s.evaluation_trainee_ranks||[],sessionEpoch:Number(legacySettings.sessionEpoch||0)},applicationQuestions:appQs.map(x=>x.legacy_data||{id:x.legacy_id,text:x.text,type:x.type,options:x.options,correct:x.correct,required:x.required,points:x.points}),questionBank:bank.map(x=>x.legacy_data||{id:x.legacy_id,text:x.text,type:x.type,options:x.options,correct:x.correct,required:x.required,points:x.points}),batches:batches.map(x=>x.legacy_data||{id:x.legacy_id,name:x.name,status:x.status,startAt:x.start_at,endAt:x.end_at,closedAt:x.closed_at}),applications:apps.map(x=>x.legacy_data||{id:x.legacy_id,batchId:x.batch_id,discordId:x.discord_id,name:x.applicant_name,status:x.status,answers:x.answers,submittedAt:x.submitted_at}),exams:exams.map(x=>{const legacy=x.legacy_data&&typeof x.legacy_data==='object'?x.legacy_data:{};const sections=(sectionsByExam.get(String(x.id))||[]).sort((a,b)=>a._position-b._position).map(sec=>{const out={...sec};delete out._position;return out});return{id:x.legacy_id,title:x.title,description:x.description||legacy.description||'',stage:x.stage||legacy.stage||'عام',status:x.status||((x.active===false)?'closed':'open'),active:x.active!==false,startAt:x.start_at,endAt:x.end_at,durationMinutes:x.duration_minutes,passingScore:x.passing_score,attemptsAllowed:x.attempts_allowed,accessType:x.access_type==='invite'?'link':(x.access_type||'all'),allowedDiscordIds:Array.isArray(x.access_users)?x.access_users.map(str):[],accessToken:legacy.accessToken||'',resultPublished:Boolean(x.publish_results),resultAnswersPublished:Boolean(x.show_answers),resumeEnabled:x.resume_enabled!==false,resumeMinutes:x.resume_minutes||null,createdAt:x.created_at,createdBy:x.created_by||'',updatedAt:x.updated_at,questions:[],sections}}),examResults:results.map(x=>x.legacy_data||{id:x.legacy_id,examId:x.exam_id,attemptId:x.attempt_id,discordId:x.discord_id,score:x.score,passed:x.passed,submittedAt:x.submitted_at}),examAttempts:attempts.map(x=>x.legacy_data||{id:x.legacy_id,examId:x.exam_id,discordId:x.discord_id,answers:x.answers,startedAt:x.started_at,expiresAt:x.expires_at,submittedAt:x.submitted_at}),evaluations:evaluations.map(x=>x.legacy_data||{id:x.legacy_id,evaluatorDiscordId:x.evaluator_discord_id,targetDiscordId:x.target_discord_id,ratings:x.ratings,overallRating:x.overall_rating,status:x.status}),hierarchy:hierarchy.map(x=>x.legacy_data||{id:x.legacy_id,title:x.title,name:x.name_snapshot,discordId:x.discord_id,image:x.image_url,level:x.level,position:x.position}),admins:admins.map(x=>x.legacy_data||{discordId:x.discord_id,name:x.name,permissions:x.permissions,enabled:x.enabled}),audit:audit.map(x=>x.legacy_data||{id:x.id,actorId:x.actor_discord_id,actorName:x.actor_name,action:x.action,details:x.details,at:x.created_at}),loginLogs:logins.map(x=>x.legacy_data||{id:x.id,discordId:x.discord_id,username:x.username,success:x.success,at:x.created_at}),memberImages:Object.fromEntries(memberImages.map(x=>[x.discord_id,x.image_url]).filter(([,v])=>v)),memberSettings:Object.fromEntries(memberSettings.map(x=>[x.discord_id,x.legacy_data||{showProfileButton:x.show_profile_button}])),applicationDrafts:Object.fromEntries(drafts.map(x=>[x.discord_id,x.draft])),roleOverrides:Object.fromEntries(overrides.map(x=>[x.discord_id,x.role])),badges:Array.isArray(legacySettings.badges)?legacySettings.badges:[],memberBadges:legacySettings.memberBadges&&typeof legacySettings.memberBadges==='object'?legacySettings.memberBadges:{},devStoreTokens:legacySettings.devStoreTokens&&typeof legacySettings.devStoreTokens==='object'?legacySettings.devStoreTokens:{}};const examById=new Map(data.exams.map(x=>[String(x.id),x]));for(const q of eq){const sourceExam=exams.find(e=>e.id===q.exam_id),exam=examById.get(String(sourceExam?.legacy_id));if(!exam)continue;const currentLegacyIds=Array.isArray(sourceExam?.legacy_data?.questions)?new Set(sourceExam.legacy_data.questions.map(x=>String(x?.id||'')).filter(Boolean)):null;if(currentLegacyIds&&currentLegacyIds.size&&!currentLegacyIds.has(String(q.legacy_id)))continue;(exam.questions??=[]).push({...((q.legacy_data&&typeof q.legacy_data==='object')?q.legacy_data:{}),id:q.legacy_id,text:q.text,type:q.type,options:q.options,correct:q.correct,required:q.required,points:q.points,questionBankId:q.question_bank_id||undefined,_position:Number(q.position)||0})}for(const exam of data.exams){
  exam.questions=(exam.questions||[]).sort((a,b)=>Number(a._position||0)-Number(b._position||0)).map(q=>{const out={...q};delete out._position;return out});
  // Backward compatibility: older exams may have saved sectionId on questions
  // before the section metadata itself was persisted. Reconstruct the section
  // shell so the runtime/editor can still render and preserve those assignments.
  const existingSections=Array.isArray(exam.sections)?exam.sections:[];
  const known=new Set(existingSections.map(s=>String(s?.id||'')));
  const inferredIds=[];
  for(const q of exam.questions){const sid=String(q?.sectionId||'').trim();if(sid&&!known.has(sid)&&!inferredIds.includes(sid))inferredIds.push(sid)}
  exam.sections=[...existingSections,...inferredIds.map((id,i)=>({id,title:'القسم '+(existingSections.length+i+1),description:'',gateQuestionId:'',allowedAnswers:[],failMessage:'',nextSectionId:''}))];
}
return data;
}

async function examRowId(legacyId){const {data,error}=await supabase.from('exams').select('id').eq('legacy_id',String(legacyId)).maybeSingle();if(error)throw error;return data?.id||null}
async function attemptRowId(legacyId){const {data,error}=await supabase.from('exam_attempts').select('id').eq('legacy_id',String(legacyId)).maybeSingle();if(error)throw error;return data?.id||null}

export async function deleteExam(legacyId){
  if(!supabaseConfigured)throw new Error('SUPABASE_NOT_CONFIGURED');
  const key=String(legacyId);
  const {data:row,error:findError}=await supabase.from('exams').select('id').eq('legacy_id',key).maybeSingle();
  if(findError)throw findError;
  if(!row?.id)return false;
  await withRetry('delete exam',async()=>{
    const {error}=await supabase.from('exams').delete().eq('id',row.id);
    if(error)throw error;
  });
  return true;
}

export async function saveExam(exam){
  if(!supabaseConfigured)throw new Error('SUPABASE_NOT_CONFIGURED');
  const legacyId=String(exam.id);
  const accessType=exam.accessType==='link'?'invite':(exam.accessType||'all');
  const examRow={
    legacy_id:legacyId,title:str(exam.title)||'اختبار',description:exam.description||null,stage:exam.stage||null,
    status:exam.active===false?'closed':'open',active:exam.active!==false,start_at:exam.startAt||null,end_at:exam.endAt||null,
    duration_minutes:Number(exam.durationMinutes||30),passing_score:Number(exam.passingScore||60),attempts_allowed:Number(exam.attemptsAllowed||1),
    access_type:accessType,access_users:Array.isArray(exam.allowedDiscordIds)?exam.allowedDiscordIds.map(str):[],
    invite_token_hash:exam.inviteTokenHash||null,publish_results:Boolean(exam.resultPublished),
    show_answers:Boolean(exam.resultAnswersPublished),resume_enabled:exam.resumeEnabled!==false,
    resume_minutes:exam.resumeMinutes?Number(exam.resumeMinutes):null,created_by:exam.createdBy||null,updated_by:exam.updatedBy||null,
    legacy_data:exam
  };
  const {data:stored,error:examError}=await withRetry('save exam',async()=>{
    const {data,error}=await supabase.from('exams').upsert(examRow,{onConflict:'legacy_id'}).select('*').single();
    if(error)throw error; return {data,error:null};
  });
  const examDbId=stored?.id;
  if(!examDbId)throw new Error('EXAM_FOREIGN_KEY_NOT_FOUND');
  const sections=cleanRows(exam.sections).map((sec,i)=>({
    legacy_id:String(sec.id||('section-'+i)),
    exam_id:examDbId,
    title:str(sec.title)||('القسم '+(i+1)),
    description:sec.description||null,
    position:i,
    gate_question_id:sec.gateQuestionId||null,
    allowed_answers:Array.isArray(sec.allowedAnswers)?sec.allowedAnswers.map(str):[],
    fail_message:sec.failMessage||null,
    next_section_id:sec.nextSectionId||null
  }));
  if(sections.length)await upsert('exam_sections',sections,'exam_id,legacy_id');
  const bankRows=await all('question_bank');
  const bankMap=new Map(bankRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
  const questions=cleanRows(exam.questions);
  const rows=questions.map((q,i)=>({
    legacy_id:String(q.id),exam_id:examDbId,question_bank_id:q.questionBankId?bankMap.get(String(q.questionBankId))||null:null,
    text:str(q.text),type:['text','choice','yesno'].includes(q.type)?q.type:'text',options:Array.isArray(q.options)?q.options:[],
    correct:q.correct??null,required:q.required!==false,points:Number(q.points||1),position:i,legacy_data:q
  }));
  const keep=new Set(rows.map(x=>x.legacy_id));
  const existing=await all('exam_questions');
  const stale=existing.filter(x=>String(x.exam_id)===String(examDbId)&&x.legacy_id&&!keep.has(String(x.legacy_id)));
  if(stale.length){
    const staleIds=stale.map(x=>x.id).filter(Boolean),referenced=new Set();
    for(let i=0;i<staleIds.length;i+=200){
      const chunk=staleIds.slice(i,i+200);
      const {data,error}=await withRetry('check exam question references',async()=>{
        const {data,error}=await supabase.from('attempt_answers').select('question_id').in('question_id',chunk);
        if(error)throw error; return {data:data||[],error:null};
      });
      for(const x of data||[])if(x?.question_id)referenced.add(String(x.question_id));
    }
    const deletable=stale.filter(x=>!referenced.has(String(x.id))).map(x=>String(x.legacy_id));
    for(let i=0;i<deletable.length;i+=200){const chunk=deletable.slice(i,i+200);await withRetry('delete stale exam questions',async()=>{const {error}=await supabase.from('exam_questions').delete().in('legacy_id',chunk);if(error)throw error})}
  }
  if(rows.length)await upsert('exam_questions',rows,'legacy_id');
  return exam;
}

export async function saveExamAttempt(attempt){
  if(!supabaseConfigured)throw new Error('SUPABASE_NOT_CONFIGURED');
  const legacyId=String(attempt.id);
  const examId=await examRowId(attempt.examId);
  if(!examId)throw new Error('EXAM_FOREIGN_KEY_NOT_FOUND');
  const discordId=str(attempt.discordId||attempt.userId);
  if(!discordId)throw new Error('EXAM_DISCORD_ID_REQUIRED');
  // The answer RPC is intentionally update-only. A newly started attempt must
  // exist in exam_attempts first, otherwise the very first Start click returns
  // EXAM_SAVE_PENDING even though the in-memory attempt was created.
  const qOrder=cleanRows(attempt.questionOrder).map(str).filter(Boolean);
  const {data:qRows,error:qError}=await withRetry('read exam question ids',async()=>{
    const {data,error}=await supabase.from('exam_questions').select('id,legacy_id').eq('exam_id',examId);
    if(error)throw error;
    return {data:data||[],error:null};
  });
  if(qError)throw qError;
  const questionIdByLegacy=new Map((qRows||[]).map(q=>[String(q.legacy_id),String(q.id)]));
  const questionOrder=qOrder.map(id=>questionIdByLegacy.get(id)||id).filter(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));
  const row={
    legacy_id:legacyId,
    exam_id:examId,
    discord_id:discordId,
    started_at:attempt.startedAt||new Date().toISOString(),
    expires_at:attempt.expiresAt||new Date().toISOString(),
    submitted_at:attempt.submittedAt||null,
    resume_at:attempt.resumeAt||null,
    resume_until:attempt.resumeUntil||null,
    resume_duration_minutes:attempt.resumeDurationMinutes==null?null:Number(attempt.resumeDurationMinutes),
    answers:json(attempt.answers),
    question_order:questionOrder,
    status:attempt.submittedAt?'submitted':(String(attempt.status||'in_progress')==='active'?'in_progress':(String(attempt.status||'in_progress')==='paused'?'in_progress':String(attempt.status||'in_progress'))),
    auto_submitted:Boolean(attempt.autoSubmitted),
    answers_updated_at:attempt.answersUpdatedAt||new Date().toISOString(),
    answers_revision:Number(attempt.answersRevision||attempt.clientRevision||0),
    legacy_data:attempt
  };
  let persistedRow;
  try{
    const {data,error}=await withRetry('create exam attempt',async()=>{
      const {data,error}=await supabase.from('exam_attempts').upsert(row,{onConflict:'legacy_id'}).select('*').single();
      if(error)throw error;
      return {data,error:null};
    });
    persistedRow=data;
  }catch(error){
    // Two devices can race to start the same exam. The DB's partial unique
    // index permits only one in-progress attempt; reuse the winner.
    const msg=String(error?.message||error?.details||error||'');
    if(/duplicate key|one_active_exam_attempt_per_user|exam_attempts_exam_id_discord_id/i.test(msg)){
      const {data,error:lookupError}=await withRetry('find active exam attempt',async()=>{
        const {data,error}=await supabase.from('exam_attempts').select('*').eq('exam_id',examId).eq('discord_id',discordId).eq('status','in_progress').maybeSingle();
        if(error)throw error;
        return {data,error:null};
      });
      if(lookupError||!data)throw error;
      persistedRow=data;
    }else throw error;
  }
  const canonicalLegacyId=String(persistedRow?.legacy_id||legacyId);
  const updatedAt=attempt.answersUpdatedAt||new Date().toISOString();
  const {data,error}=await withRetry('save exam answers',async()=>supabase.rpc('save_exam_attempt_answers',{p_legacy_id:canonicalLegacyId,p_answers:json(attempt.answers),p_answers_updated_at:updatedAt,p_status:attempt.submittedAt?'submitted':(String(attempt.status||'in_progress')==='active'?'in_progress':(String(attempt.status||'in_progress')==='paused'?'in_progress':String(attempt.status||'in_progress'))),p_client_revision:Number(attempt.clientRevision||0)}));
  if(error)throw error;
  if(!Array.isArray(data)||!data.length)throw new Error('EXAM_ATTEMPT_NOT_FOUND');
  // Supabase stores the canonical lifecycle value in_progress; the legacy
  // runtime uses active/paused. Do not leak the DB status into the runtime.
  const saved=data[0];
  return {
    ...saved,
    status:attempt.submittedAt?'submitted':(String(attempt.status||'active')==='paused'?'paused':'active'),
    legacy_data:attempt
  };
}
export async function finalizeExamSubmission(examLegacyId,attemptLegacyId,attempt,result){
  if(!supabaseConfigured)throw new Error('SUPABASE_NOT_CONFIGURED');
  const {data,error}=await withRetry('finalize exam submission',async()=>{
    const {data,error}=await supabase.rpc('finalize_exam_submission',{
      p_exam_legacy_id:String(examLegacyId),
      p_attempt_legacy_id:String(attemptLegacyId),
      p_attempt:json(attempt),
      p_result:json(result)
    });
    if(error)throw error;
    return {data,error:null};
  });
  return data;
}
export async function saveEvaluation(e){
  if(!supabaseConfigured)throw new Error('SUPABASE_NOT_CONFIGURED');
  const row={
    legacy_id:String(e.id),
    evaluator_discord_id:str(e.fromDiscordId||e.userId),
    evaluator_role:e.type==='trainer_to_trainee'?'trainer':'trainee',
    target_discord_id:str(e.targetDiscordId),
    target_name_snapshot:e.targetName||e.target?.name||null,
    target_rank_snapshot:e.targetRank||e.target?.rank||null,
    hours:e.hours==null?null:Number(e.hours),
    ratings:json(e.ratings),
    overall_rating:e.overallRating==null?null:Number(e.overallRating),
    same_trainer:e.sameTrainer==null?null:Boolean(e.sameTrainer),
    notes:e.notes||null,
    complaint:e.complaint||null,
    status:['approved','rejected','investigation'].includes(String(e.status))?'reviewed':(String(e.status)==='archived'?'archived':'pending'),
    reviewed_at:e.review?.at||e.reviewedAt||null,
    reviewed_by:e.review?.by||e.reviewedBy||null,
    review_note:e.review?.note||e.reviewNote||null,
    legacy_data:e
  };
  if(!row.evaluator_discord_id||!row.target_discord_id||row.evaluator_discord_id===row.target_discord_id)throw new Error('EVALUATION_INVALID_PARTICIPANTS');
  await withRetry('save evaluation',async()=>{const {error}=await supabase.from('evaluations').upsert(row,{onConflict:'legacy_id'});if(error)throw error});
  return e;
}
export async function saveExamResult(result,attemptLegacyId=null){if(!supabaseConfigured)throw new Error('SUPABASE_NOT_CONFIGURED');const exam_id=await examRowId(result.examId);if(!exam_id)throw new Error('EXAM_FOREIGN_KEY_NOT_FOUND');const attempt_id=await attemptRowId(result.attemptId||attemptLegacyId);if(!attempt_id)throw new Error('ATTEMPT_FOREIGN_KEY_NOT_FOUND');const row={legacy_id:String(result.id),attempt_id,exam_id,discord_id:str(result.discordId||result.userId),score:Number(result.score||0),passed:Boolean(result.passed),duration_seconds:result.durationSeconds==null?null:Number(result.durationSeconds),submitted_at:result.submittedAt||new Date().toISOString(),published_at:result.publishedAt||null,review:Array.isArray(result.review)?result.review:[],legacy_data:{...result,attemptId:result.attemptId||attemptLegacyId||null}};await withRetry('save exam result',async()=>{const {error}=await supabase.from('exam_results').upsert(row,{onConflict:'legacy_id'});if(error)throw error})}

export { saveAcademyData, loadAcademyData };
