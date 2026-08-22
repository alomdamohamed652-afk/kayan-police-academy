import fs from 'node:fs/promises';

const path='scripts/apply-final-academy-patch.mjs';
let s=await fs.readFile(path,'utf8');
const bt=String.fromCharCode(96);
const slash=String.fromCharCode(92);
let changed=false;

// apply-final-academy-patch.mjs stores JSX blocks inside outer template literals.
// Escape ${...} expressions that belong to the generated JSX, so Node does not
// evaluate them while parsing the patch script itself.
const expressions=[
  '${x.discordId}',
  '${b.id}',
  '${a.id}',
  '${a.reviewerName}',
  '${editing.id}',
  '${e.id}',
  '${Date.now()}'
];

for(const expr of expressions){
  const escaped=slash+expr;
  // Do not double-escape an expression that is already escaped.
  const plainCount=s.split(expr).length-1;
  const escapedCount=s.split(escaped).length-1;
  if(plainCount>escapedCount){
    s=s.split(expr).join(escaped);
    changed=true;
  }
}

if(changed){
  await fs.writeFile(path,s);
  console.log('Escaped generated JSX template expressions in final academy patch');
}else{
  console.log('No generated JSX template expressions needed escaping');
}
