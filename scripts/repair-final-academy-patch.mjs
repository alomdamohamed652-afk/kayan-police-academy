import fs from 'node:fs/promises';

const path='scripts/apply-final-academy-patch.mjs';
let s=await fs.readFile(path,'utf8');

const repairs=[
  ["{a.reviewerName?` · المراجع: ${a.reviewerName}`:''}","{a.reviewerName?' · المراجع: '+a.reviewerName:''}"],
  ["{id:`q-${Date.now()}`", "{id:'q-'+Date.now()"],
  ["{id:`new-${Date.now()}`", "{id:'new-'+Date.now()"],
  ["{id:\`q-${Date.now()}\`", "{id:'q-'+Date.now()"],
  ["{id:\`new-${Date.now()}\`", "{id:'new-'+Date.now()"],
];

let changed=false;
for(const [bad,good] of repairs){
  if(s.includes(bad)){
    s=s.split(bad).join(good);
    changed=true;
  }
}

if(changed){
  await fs.writeFile(path,s);
  console.log('Repaired nested template literals in final academy patch');
}else{
  console.log('No known nested template literal repairs were needed');
}
