import fs from 'node:fs/promises';

const path='src/main.jsx';
let source=await fs.readFile(path,'utf8');

const oldSubmit="const submit=async()=>{setMsg('');try{await api('/api/evaluations',{method:'POST',body:JSON.stringify({...form,evaluationRole:role})});setMsg('تم إرسال التقرير بسرية إلى الإدارة للمراجعة.');resetForm(role)}catch(e){setMsg(errorText(e))}};";
const newSubmit="const submit=async()=>{setMsg('');try{await api('/api/evaluations',{method:'POST',body:JSON.stringify({...form,evaluationRole:role})});resetForm(role);setQ('');setMsg('تم إرسال التقرير بسرية إلى الإدارة للمراجعة وتم تفريغ النموذج لتقييم جديد.')}catch(e){setMsg(errorText(e))}};";
if(source.includes(oldSubmit)) source=source.replace(oldSubmit,newSubmit);
else if(source.includes(newSubmit)) console.log('Evaluation form reset patch already applied.');
else throw new Error('EVALUATION_PATCH_TARGET_NOT_FOUND:submit');
await fs.writeFile(path,source,'utf8');
console.log('Evaluation form reset patch applied.');
