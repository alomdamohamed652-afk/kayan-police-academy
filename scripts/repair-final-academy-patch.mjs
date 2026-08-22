import fs from 'node:fs/promises';

const path='scripts/apply-final-academy-patch.mjs';
let s=await fs.readFile(path,'utf8');
const bt=String.fromCharCode(96);
let changed=false;

// apply-final-academy-patch.mjs stores JSX blocks inside outer template literals.
// Remove every known nested template literal from those blocks before Node parses it.
const replacements=[
  [bt+'q-'+ '${Date.now()}' +bt, "'q-'+Date.now()"],
  [bt+'new-'+ '${Date.now()}' +bt, "'new-'+Date.now()"],
  [bt+' · المراجع: ${a.reviewerName}'+bt, "' · المراجع: '+a.reviewerName+'"],
];

for(const [bad,good] of replacements){
  if(s.includes(bad)){
    s=s.split(bad).join(good);
    changed=true;
  }
}

// Handle escaped backticks too.
const slash=String.fromCharCode(92);
for(const [bad,good] of [
  [slash+bt+'q-${Date.now()}'+slash+bt, "'q-'+Date.now()"],
  [slash+bt+'new-${Date.now()}'+slash+bt, "'new-'+Date.now()"]
]){
  if(s.includes(bad)){
    s=s.split(bad).join(good);
    changed=true;
  }
}

if(changed){
  await fs.writeFile(path,s);
  console.log('Repaired all known nested template literals in final academy patch');
}else{
  console.log('No nested template literal repairs were needed');
}
