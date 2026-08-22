import fs from 'node:fs/promises';

const path='scripts/apply-final-academy-patch.mjs';
let s=await fs.readFile(path,'utf8');
const bt=String.fromCharCode(96);
const slash=String.fromCharCode(92);
let changed=false;

// Generated JSX components live inside outer template literals. Escape every
// unescaped ${...} expression so the outer patch script never evaluates it.
const expressionPattern=new RegExp('(?<!\\\\)\\$\\{','g');
s=s.replace(expressionPattern,()=>{changed=true;return slash+'${';});

// Escape any nested backtick inside an outer generated-component template.
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
  console.log('Escaped all generated JSX template expressions and nested template literals');
}else{
  console.log('No generated JSX template expressions needed escaping');
}
