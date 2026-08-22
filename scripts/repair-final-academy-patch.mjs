import fs from 'node:fs/promises';

const path='scripts/apply-final-academy-patch.mjs';
let s=await fs.readFile(path,'utf8');
const bt=String.fromCharCode(96);
const slash=String.fromCharCode(92);
let changed=false;

// apply-final-academy-patch.mjs stores JSX blocks inside outer template literals.
// Escape every template expression and every nested backtick that belongs to
// the generated JSX, so Node parses this repair/patch script safely.
const expressions=[
  '${x.discordId}',
  '${b.id}',
  '${a.id}',
  '${a.reviewerName}',
  '${editing.id}',
  '${e.id}',
  '${Date.now()}',
  '${q.id}',
  '${i}',
  '${z.id}',
  '${j}',
  '${m.discordId}',
  '${m.name}',
  '${m.rank}',
  '${e.type}',
  '${e.id}'
];

for(const expr of expressions){
  const escaped=slash+expr;
  const plainCount=s.split(expr).length-1;
  const escapedCount=s.split(escaped).length-1;
  if(plainCount>escapedCount){
    s=s.split(expr).join(escaped);
    changed=true;
  }
}

// Each generated component is stored as a one-line outer template literal:
// const name=`...`;
// Any backtick between the opening and final backtick is part of generated JSX
// and must therefore be escaped. This catches future nested template literals
// without having to maintain an ever-growing list of variable names.
const lines=s.split('\n');
for(let n=0;n<lines.length;n++){
  const line=lines[n];
  const marker=line.indexOf('=`');
  if(marker<0) continue;
  const first=marker+1;
  const last=line.lastIndexOf(bt);
  if(last<=first) continue;
  let out=line.slice(0,first+1);
  for(let i=first+1;i<last;i++){
    const ch=line[i];
    if(ch===bt && line[i-1]!==slash){
      out+=slash+bt;
      changed=true;
    }else{
      out+=ch;
    }
  }
  out+=line.slice(last);
  lines[n]=out;
}
s=lines.join('\n');

if(changed){
  await fs.writeFile(path,s);
  console.log('Escaped all nested template literals and generated JSX expressions in final academy patch');
}else{
  console.log('No nested template literals needed escaping');
}
