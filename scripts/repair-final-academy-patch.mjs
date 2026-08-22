import fs from 'node:fs/promises';

const path='scripts/apply-final-academy-patch.mjs';
let s=await fs.readFile(path,'utf8');
const bad="{a.reviewerName?` · المراجع: ${a.reviewerName}`:''}";
const good="{a.reviewerName?' · المراجع: '+a.reviewerName:''}";
if(s.includes(bad)){
  s=s.replace(bad,good);
  await fs.writeFile(path,s);
  console.log('Repaired nested template literal in final academy patch');
}else{
  console.log('Final academy patch already repaired');
}
