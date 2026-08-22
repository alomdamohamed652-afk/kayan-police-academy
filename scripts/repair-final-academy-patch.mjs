import fs from 'node:fs/promises';

const path='scripts/apply-final-academy-patch.mjs';
let s=await fs.readFile(path,'utf8');
const bt=String.fromCharCode(96);
let changed=false;

// The patch file itself is wrapped in template literals. Any inner template
// literal must therefore be converted to ordinary string concatenation.
const repairs=[
  [new RegExp("\\{a\\.reviewerName\\?"+bt+" \\u00b7 المراجع: \\${a\\.reviewerName}"+bt+":''\\}"),'${a.reviewerName}'],
  [new RegExp("\\{id:"+bt+"q-\\$\\{Date\\.now\\(\\)\\}"+bt+"\\}"),'q-id'],
  [new RegExp("\\{id:"+bt+"new-\\$\\{Date\\.now\\(\\)\\}"+bt+"\\}"),'new-id']
];

const replaceLiteral=(re,kind)=>{
  const before=s;
  if(kind==='${a.reviewerName}') s=s.replace(re,"{a.reviewerName?' "+'· المراجع: '+"'+a.reviewerName:''}");
  if(kind==='q-id') s=s.replace(re,"{id:'q-'+Date.now()}");
  if(kind==='new-id') s=s.replace(re,"{id:'new-'+Date.now()}");
  if(s!==before) changed=true;
};

for(const [re,kind] of repairs) replaceLiteral(re,kind);

// Also repair the common form when the source contains an escaped backtick.
s=s.replaceAll('{id:'+String.fromCharCode(92)+bt+'q-${Date.now()}'+String.fromCharCode(92)+bt+'}',"{id:'q-'+Date.now()}");
s=s.replaceAll('{id:'+String.fromCharCode(92)+bt+'new-${Date.now()}'+String.fromCharCode(92)+bt+'}',"{id:'new-'+Date.now()}");

if(changed){
  await fs.writeFile(path,s);
  console.log('Repaired remaining nested template literals in final academy patch');
}else{
  console.log('Final academy patch template-literal repair pass completed');
}
