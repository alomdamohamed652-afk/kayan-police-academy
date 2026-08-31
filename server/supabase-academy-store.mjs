import { supabase, supabaseConfigured } from './supabase.mjs';

const cleanRows=v=>Array.isArray(v)?v:[];
const str=v=>v==null?'':String(v);
const num=v=>Number.isFinite(Number(v))?Number(v):null;
const json=v=>v&&typeof v==='object'?v:{};

async function all(table,order='created_at'){
  const {data,error}=await supabase.from(table).select('*').order(order,{ascending:true});
  if(error) throw error;
  return data||[];
}
async function upsert(table,rows,onConflict){
  if(!rows.length)return;
  if(onConflict==='legacy_id'){
    const existing=await all(table);
    const byLegacy=new Map(existing.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
    for(const raw of rows){
      const row={...raw};
      const legacy=row.legacy_id?String(row.legacy_id):'';
      if(legacy && byLegacy.has(legacy)){
        const {error}=await supabase.from(table).update(row).eq('id',byLegacy.get(legacy));
        if(error) throw error;
      }else{
        const {error}=await supabase.from(table).insert(row);
        if(error) throw error;
      }
    }
    return;
  }
  const {error}=await supabase.from(table).upsert(rows,{onConflict});
  if(error) throw error;
}
async function prune(table,legacyIds){
  const ids=legacyIds.filter(Boolean);
  const existing=await all(table);
  const keep=new Set(ids.map(String));
  const stale=existing.filter(x=>x.legacy_id&&!keep.has(String(x.legacy_id))).map(x=>x.legacy_id);
  for(const id of stale){
    const {error}=await supabase.from(table).delete().eq('legacy_id',id);
    if(error) throw error;
  }
}
const legacyOf=x=>str(x?.id)||str(x?.discordId);

function settingsRow(s){
  const x=s||{};
  return {id:1,academy_name:x.academyName||'أكاديمية شرطة كيان',applications_title:x.applicationsTitle||'التقديم الأولي للشرطة',
    applications_description:x.applicationsDescription||'نموذج التقديم الرسمي للانضمام إلى شرطة كيان.',passing_score:num(x.passingScore)||60,
    logo_url:x.logoUrl||null,accepted_message:x.acceptedMessage||null,rejected_message:x.rejectedMessage||null,
    accepted_discord_url:x.acceptedDiscordUrl||null,evaluation_trainer_ranks:cleanRows(x.evaluationTrainerRanks).map(str),
    evaluation_trainee_ranks:cleanRows(x.evaluationTraineeRanks).map(str),updated_by:null,legacy_data:x};
}

async function saveAcademyData(data){
  if(!supabaseConfigured) throw new Error('SUPABASE_NOT_CONFIGURED');
  await upsert('academy_settings',[settingsRow(data.settings)],'id');
  const batches=cleanRows(data.batches);
  await upsert('application_batches',batches.map(x=>({legacy_id:legacyOf(x),name:str(x.name)||'دفعة',description:x.description||null,status:x.status||'open',start_at:x.startAt||null,end_at:x.endAt||null,closed_at:x.closedAt||null,created_by:x.createdBy||null,updated_by:x.updatedBy||null,legacy_data:x})),'legacy_id');
  await prune('application_batches',batches.map(legacyOf));
  const batchRows=await all('application_batches');
  const batchMap=new Map(batchRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
  const appQs=cleanRows(data.applicationQuestions);
  await upsert('application_questions',appQs.map((x,i)=>({legacy_id:legacyOf(x),batch_id:x.batchId?batchMap.get(String(x.batchId))||null:null,text:str(x.text),type:['text','choice','yesno'].includes(x.type)?x.type:'text',options:Array.isArray(x.options)?x.options:[],correct:x.correct??null,required:x.required!==false,points:Number(x.points||1),position:i,legacy_data:x})),'legacy_id');
  await prune('application_questions',appQs.map(legacyOf));
  const apps=cleanRows(data.applications);
  await upsert('applications',apps.map(x=>({legacy_id:legacyOf(x),batch_id:batchMap.get(String(x.batchId))||batchMap.get(String(x.batchID))||batchRows.find(b=>b.name===x.batchName)?.id,discord_id:str(x.discordId||x.userId),discord_username:x.username||x.discordUsername||null,applicant_name:x.name||null,submitted_at:x.submittedAt||new Date().toISOString(),status:x.status||'pending',review_note:x.reviewNote||x.note||null,reviewed_at:x.reviewedAt||null,reviewed_by:x.reviewerId||x.reviewedBy||null,answers:json(x.answers),legacy_data:x})),'legacy_id');
  await prune('applications',apps.map(legacyOf));
  const bank=cleanRows(data.questionBank);
  await upsert('question_bank',bank.map(x=>({legacy_id:legacyOf(x),text:str(x.text),type:['text','choice','yesno'].includes(x.type)?x.type:'text',options:Array.isArray(x.options)?x.options:[],correct:x.correct??null,required:x.required!==false,points:Number(x.points||1),tags:Array.isArray(x.tags)?x.tags.map(str):[],active:x.active!==false,legacy_data:x})),'legacy_id');
  await prune('question_bank',bank.map(legacyOf));
  const bankRows=await all('question_bank');
  const bankMap=new Map(bankRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
  const exams=cleanRows(data.exams);
  await upsert('exams',exams.map(x=>({legacy_id:legacyOf(x),title:str(x.title)||'اختبار',description:x.description||null,stage:x.stage||null,status:x.status||((x.active===false)?'closed':'open'),start_at:x.startAt||null,end_at:x.endAt||null,duration_minutes:Number(x.durationMinutes||30),passing_score:Number(x.passingScore||60),attempts_allowed:Number(x.attemptsAllowed||1),access_type:x.accessType==='link'?'invite':(x.accessType||'all'),access_users:Array.isArray(x.allowedDiscordIds)?x.allowedDiscordIds.map(str):Array.isArray(x.accessUsers)?x.accessUsers.map(str):[],invite_token_hash:x.inviteTokenHash||null,publish_results:Boolean(x.resultPublished||x.publishResults),show_answers:Boolean(x.showAnswers),resume_enabled:x.resumeEnabled!==false,resume_minutes:x.resumeMinutes?Number(x.resumeMinutes):null,created_by:x.createdBy||null,updated_by:x.updatedBy||null,legacy_data:x})),'legacy_id');
  await prune('exams',exams.map(legacyOf));
  const examRows=await all('exams');
  const examMap=new Map(examRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
  const eq=[];
  for(const exam of exams)for(const [i,q] of cleanRows(exam.questions).entries())eq.push({legacy_id:legacyOf(q),exam_id:examMap.get(legacyOf(exam)),question_bank_id:q.questionBankId?bankMap.get(String(q.questionBankId))||null:null,text:str(q.text),type:['text','choice','yesno'].includes(q.type)?q.type:'text',options:Array.isArray(q.options)?q.options:[],correct:q.correct??null,required:q.required!==false,points:Number(q.points||1),position:i,legacy_data:q});
  await upsert('exam_questions',eq,'legacy_id');
  await prune('exam_questions',eq.map(x=>x.legacy_id));
  const attempts=cleanRows(data.examAttempts);
  await upsert('exam_attempts',attempts.map(x=>({legacy_id:legacyOf(x),exam_id:examMap.get(String(x.examId)),discord_id:str(x.discordId||x.userId),started_at:x.startedAt||new Date().toISOString(),expires_at:x.expiresAt||new Date().toISOString(),submitted_at:x.submittedAt||null,resume_at:x.resumeAt||null,resume_until:x.resumeUntil||null,resume_duration_minutes:x.resumeDurationMinutes?Number(x.resumeDurationMinutes):null,answers:json(x.answers),question_order:cleanRows(x.questionOrder).map(str).filter(Boolean),status:x.submittedAt?'submitted':(x.status||'in_progress'),auto_submitted:Boolean(x.autoSubmitted),legacy_data:x})),'legacy_id');
  await prune('exam_attempts',attempts.map(legacyOf));
  const attemptRows=await all('exam_attempts');
  const attemptMap=new Map(attemptRows.filter(x=>x.legacy_id).map(x=>[String(x.legacy_id),x.id]));
  const results=cleanRows(data.examResults);
  await upsert('exam_results',results.map(x=>({legacy_id:legacyOf(x),attempt_id:attemptMap.get(String(x.attemptId||x.attemptID)),exam_id:examMap.get(String(x.examId)),discord_id:str(x.discordId||x.userId),score:Number(x.score||0),passed:Boolean(x.passed),duration_seconds:x.durationSeconds==null?null:Number(x.durationSeconds),submitted_at:x.submittedAt||new Date().toISOString(),published_at:x.publishedAt||null,review:Array.isArray(x.review)?x.review:[],legacy_data:x})).filter(x=>x.exam_id&&x.attempt_id),'legacy_id');
  await prune('exam_results',results.map(legacyOf));
  const admins=cleanRows(data.admins);
  await upsert('admins',admins.map(x=>({discord_id:str(x.discordId),name:x.name||null,permissions:cleanRows(x.permissions).map(str),enabled:x.enabled!==false,source:x.source||'manual',created_by:x.createdBy||null,updated_by:x.updatedBy||null,legacy_data:x})),'discord_id');
  const hierarchy=cleanRows(data.hierarchy);
  await upsert('hierarchy',hierarchy.map((x,i)=>({legacy_id:legacyOf(x),level:Math.max(1,Number(x.level||1)),position:Math.max(1,Number(x.position||x.order||i+1)),title:str(x.title)||'غير محدد',discord_id:x.discordId?str(x.discordId):null,name_snapshot:x.name||null,image_url:x.image||x.imageUrl||null,legacy_data:x})),'legacy_id');
  await prune('hierarchy',hierarchy.map(legacyOf));
  const settings=Object.entries(data.memberSettings||{}).map(([discordId,x])=>({discord_id:str(discordId),show_profile_button:x?.showProfileButton!==false,legacy_data:x||{}}));
  await upsert('member_settings',settings,'discord_id');
  const images=Object.entries(data.memberImages||{}).map(([discordId,image])=>({discord_id:str(discordId),image_url:typeof image==='string'?image:null,legacy_data:{image}}));
  await upsert('member_images',images,'discord_id');
  const evaluations=cleanRows(data.evaluations);
  await upsert('evaluations',evaluations.map(x=>({legacy_id:legacyOf(x),evaluator_discord_id:str(x.evaluatorDiscordId||x.userId||x.discordId),evaluator_role:x.evaluationRole==='trainer'?'trainer':'trainee',target_discord_id:str(x.targetDiscordId),target_name_snapshot:x.targetName||x.target?.name||null,target_rank_snapshot:x.targetRank||x.target?.rank||null,hours:x.hours==null?null:Number(x.hours),ratings:json(x.ratings),overall_rating:x.overallRating==null?null:Number(x.overallRating),same_trainer:x.sameTrainer==null?null:Boolean(x.sameTrainer),notes:x.notes||null,complaint:x.complaint||null,reviewed_at:x.reviewedAt||null,reviewed_by:x.reviewedBy||null,review_note:x.reviewNote||null,status:x.status||'pending',legacy_data:x})).filter(x=>x.evaluator_discord_id&&x.target_discord_id&&x.evaluator_discord_id!==x.target_discord_id),'legacy_id');
  await prune('evaluations',evaluations.map(legacyOf));
  const audit=cleanRows(data.audit);
  await upsert('audit_logs',audit.map(x=>({legacy_id:legacyOf(x),actor_discord_id:x.actorId||x.actorDiscordId||null,actor_name:x.actorName||null,action:str(x.action)||'UNKNOWN',entity_type:x.entityType||null,entity_id:x.entityId||null,details:json(x.details||x.target),created_at:x.at||x.createdAt||new Date().toISOString(),legacy_data:x})),'legacy_id');
  const logins=cleanRows(data.loginLogs);
  await upsert('login_logs',logins.map(x=>({legacy_id:legacyOf(x),discord_id:x.discordId||null,username:x.username||null,success:x.success!==false,reason:x.reason||null,ip_hash:x.ipHash||null,user_agent:x.userAgent||null,created_at:x.at||x.createdAt||new Date().toISOString(),legacy_data:x})),'legacy_id');
  const drafts=Object.entries(data.applicationDrafts||{}).map(([discordId,draft])=>({discord_id:str(discordId),draft:json(draft),legacy_data:draft||{}}));
  await upsert('application_drafts',drafts,'discord_id');
  const overrides=Object.entries(data.roleOverrides||{}).map(([discordId,role])=>({discord_id:str(discordId),role:str(role),legacy_data:{role}}));
  await upsert('role_overrides',overrides,'discord_id');
}

async function loadAcademyData(){
  if(!supabaseConfigured) return null;
  const [settings,batches,appQs,apps,bank,exams,eq,attempts,results,admins,hierarchy,memberSettings,memberImages,evaluations,audit,logins,drafts,overrides]=await Promise.all([
    all('academy_settings','id'),all('application_batches'),all('application_questions'),all('applications'),all('question_bank'),
    all('exams'),all('exam_questions','position'),all('exam_attempts'),all('exam_results'),all('admins','discord_id'),all('hierarchy','position'),
    all('member_settings','discord_id'),all('member_images','discord_id'),all('evaluations'),all('audit_logs'),all('login_logs'),
    all('application_drafts','discord_id'),all('role_overrides','discord_id')
  ]);
  const hasData=batches.length||appQs.length||apps.length||bank.length||exams.length||attempts.length||results.length||admins.length||hierarchy.length||evaluations.length||audit.length||logins.length;
  if(!hasData)return null;
  const s=settings[0]||{};
  const data={version:18,settings:{academyName:s.academy_name,applicationsTitle:s.applications_title,applicationsDescription:s.applications_description,passingScore:s.passing_score,logoUrl:s.logo_url||'',acceptedMessage:s.accepted_message||'',rejectedMessage:s.rejected_message||'',acceptedDiscordUrl:s.accepted_discord_url||'',evaluationTrainerRanks:s.evaluation_trainer_ranks||[],evaluationTraineeRanks:s.evaluation_trainee_ranks||[]},applicationQuestions:appQs.map(x=>x.legacy_data||{id:x.legacy_id,text:x.text,type:x.type,options:x.options,correct:x.correct,required:x.required,points:x.points}),questionBank:bank.map(x=>x.legacy_data||{id:x.legacy_id,text:x.text,type:x.type,options:x.options,correct:x.correct,required:x.required,points:x.points}),batches:batches.map(x=>x.legacy_data||{id:x.legacy_id,name:x.name,status:x.status,startAt:x.start_at,endAt:x.end_at,closedAt:x.closed_at}),applications:apps.map(x=>x.legacy_data||{id:x.legacy_id,batchId:x.batch_id,discordId:x.discord_id,name:x.applicant_name,status:x.status,answers:x.answers,submittedAt:x.submitted_at}),exams:exams.map(x=>x.legacy_data||{id:x.legacy_id,title:x.title,questions:[]}),examResults:results.map(x=>x.legacy_data||{id:x.legacy_id,examId:x.exam_id,attemptId:x.attempt_id,discordId:x.discord_id,score:x.score,passed:x.passed,submittedAt:x.submitted_at}),examAttempts:attempts.map(x=>x.legacy_data||{id:x.legacy_id,examId:x.exam_id,discordId:x.discord_id,answers:x.answers,startedAt:x.started_at,expiresAt:x.expires_at,submittedAt:x.submitted_at}),evaluations:evaluations.map(x=>x.legacy_data||{id:x.legacy_id,evaluatorDiscordId:x.evaluator_discord_id,targetDiscordId:x.target_discord_id,ratings:x.ratings,overallRating:x.overall_rating,status:x.status}),hierarchy:hierarchy.map(x=>x.legacy_data||{id:x.legacy_id,title:x.title,name:x.name_snapshot,discordId:x.discord_id,image:x.image_url,level:x.level,position:x.position}),admins:admins.map(x=>x.legacy_data||{discordId:x.discord_id,name:x.name,permissions:x.permissions,enabled:x.enabled}),audit:audit.map(x=>x.legacy_data||{id:x.id,actorId:x.actor_discord_id,actorName:x.actor_name,action:x.action,details:x.details,at:x.created_at}),loginLogs:logins.map(x=>x.legacy_data||{id:x.id,discordId:x.discord_id,username:x.username,success:x.success,at:x.created_at}),memberImages:Object.fromEntries(memberImages.map(x=>[x.discord_id,x.image_url]).filter(([,v])=>v)),memberSettings:Object.fromEntries(memberSettings.map(x=>[x.discord_id,x.legacy_data||{showProfileButton:x.show_profile_button}])),applicationDrafts:Object.fromEntries(drafts.map(x=>[x.discord_id,x.draft])),roleOverrides:Object.fromEntries(overrides.map(x=>[x.discord_id,x.role]))};
  const examById=new Map(data.exams.map(x=>[String(x.id),x]));
  for(const q of eq){const sourceExam=exams.find(e=>e.id===q.exam_id);const exam=examById.get(String(sourceExam?.legacy_id));if(exam)(exam.questions??=[]).push(q.legacy_data||{id:q.legacy_id,text:q.text,type:q.type,options:q.options,correct:q.correct,required:q.required,points:q.points,questionBankId:q.question_bank_id});}
  return data;
}

export { saveAcademyData, loadAcademyData };
