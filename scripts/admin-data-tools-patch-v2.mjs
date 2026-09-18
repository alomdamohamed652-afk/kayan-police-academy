import fs from 'node:fs/promises';

const replaceOnce = async (file, from, to, label) => {
  const source = await fs.readFile(file, 'utf8');
  if (!source.includes(from)) throw new Error(`ADMIN_PATCH_TARGET_NOT_FOUND:${label}`);
  await fs.writeFile(file, source.replace(from, to), 'utf8');
};

{
  const file='server/academy-production-original.mjs';
  let source=await fs.readFile(file,'utf8');

  const cleanupImport="import { clearExamAnswerData, clearApplicationBatchData } from './admin-data-actions.mjs';";
  if(!source.includes(cleanupImport)){
    const importAnchor="import { loadAcademyData, saveAcademyData, saveExamAttempt, saveExamResult } from './supabase-academy-store.mjs';";
    if(!source.includes(importAnchor)) throw new Error('ADMIN_PATCH_TARGET_NOT_FOUND:cleanup-import-anchor');
    source=source.replace(importAnchor,importAnchor+"\n"+cleanupImport);
  }

  const permsOld="function perms(uid){const a=admin(uid);return a?.enabled?(Array.isArray(a.permissions)?a.permissions.filter(x=>ALL.includes(x)):[]):(isBootstrapAdmin(uid)?ALL:[])}";
  const permsNew="function perms(uid){const normalized=id(uid),a=admin(normalized);if(isBootstrapAdmin(normalized)||a?.source==='environment')return ALL;return a?.enabled?(Array.isArray(a.permissions)?a.permissions.filter(x=>ALL.includes(x)):[]):[]}";
  if(source.includes(permsOld)) source=source.replace(permsOld,permsNew);

  const cleanupRoutes = [
    "app.post('/api/admin/batches/:id/clear-data',async(req,res)=>{try{const c=await requireAdmin(req,res,'manage_applications');if(!c)return;const b=data.batches.find(x=>String(x.id)===String(req.params.id));if(!b)return res.status(404).json({error:'BATCH_NOT_FOUND'});const out=await clearApplicationBatchData(b.id);const clearedAt=new Date().toISOString();for(const a of data.applications||[])if(String(a.batchId)===String(b.id)){a.answers={};a.answersClearedAt=clearedAt}audit(c,'CLEAR_BATCH_APPLICATION_DATA',b.id,'clearedApplications='+Number(out.cleared_applications||0));try{await save()}catch(e){console.error('Batch cleanup mirror save failed:',e.message)}res.json({ok:true,batchId:b.id,clearedApplications:Number(out.cleared_applications||0),recordRetained:true})}catch(e){console.error('Batch application cleanup failed:',e);res.status(503).json({error:'DATA_CLEANUP_FAILED',retryable:true})}});",
    "app.post('/api/admin/exams/:id/clear-answers',async(req,res)=>{try{const c=await requireAdmin(req,res,'manage_exams');if(!c)return;const e=data.exams.find(x=>String(x.id)===String(req.params.id));if(!e)return res.status(404).json({error:'EXAM_NOT_FOUND'});const out=await clearExamAnswerData(e.id);const clearedAt=new Date().toISOString();for(const a of data.examAttempts||[])if(String(a.examId)===String(e.id)){a.answers={};a.answersClearedAt=clearedAt}for(const r of data.examResults||[])if(String(r.examId)===String(e.id)){r.answers={};r.review=[];r.answersClearedAt=clearedAt}audit(c,'CLEAR_EXAM_ANSWER_DATA',e.id,'removedAttemptAnswers='+Number(out.removed_attempt_answers||0)+';clearedAttempts='+Number(out.cleared_attempts||0)+';clearedResults='+Number(out.cleared_results||0));try{await save()}catch(err){console.error('Exam cleanup mirror save failed:',err.message)}res.json({ok:true,examId:e.id,removedAttemptAnswers:Number(out.removed_attempt_answers||0),clearedAttempts:Number(out.cleared_attempts||0),clearedResults:Number(out.cleared_results||0),resultsRetained:true})}catch(e){console.error('Exam answer cleanup failed:',e);res.status(503).json({error:'DATA_CLEANUP_FAILED',retryable:true})}});"
  ].join("\n");

  if(!source.includes("app.post('/api/admin/batches/:id/clear-data'")){
    const anchor="app.put('/api/admin/question-bank'";
    if(!source.includes(anchor)) throw new Error('ADMIN_PATCH_TARGET_NOT_FOUND:cleanup-route-anchor');
    source=source.replace(anchor,cleanupRoutes+"\n"+anchor);
  }

  await fs.writeFile(file,source,'utf8');
}

let next=await fs.readFile('src/admin-center.jsx','utf8');
if(!next.includes("createPortal")){
  next=next.replace("import React,{useEffect,useMemo,useState}from'react';","import React,{useEffect,useMemo,useState}from'react';import{createPortal}from'react-dom';");
}
console.log('[admin-data-tools] review UI patch delegated to production-admin-v3; data routes are idempotent.');
await fs.writeFile('src/admin-center.jsx',next,'utf8');
console.log('Admin data tools patch v2 applied.');
