import fs from 'node:fs/promises';

const file='server/academy-production-original.mjs';
let s=await fs.readFile(file,'utf8');

const old=`async function police(force=false){if(!POLICE_SHEET_ID)throw new Error('POLICE_SHEET_NOT_CONFIGURED');if(!force&&cache.rows.length&&now()-cache.at<TTL)return cache.rows;`;
const replacement=`let policeInFlight=null;
async function police(force=false){
  if(!POLICE_SHEET_ID)throw new Error('POLICE_SHEET_NOT_CONFIGURED');
  if(!force&&cache.rows.length&&now()-cache.at<TTL)return cache.rows;
  if(!force&&policeInFlight)return policeInFlight;
  policeInFlight=(async()=>{
`;
if(!s.includes(old)){if(s.includes('let policeInFlight=null;')){console.log('Police sheet request coalescing patch already applied.');}else throw new Error('POLICE_PATCH_TARGET_NOT_FOUND');}
s=s.replace(old,replacement);

const oldTail=`throw last||new Error('POLICE_SHEET_UNAVAILABLE')}\nasync function ensureSheets`;
const replacementTail=`throw last||new Error('POLICE_SHEET_UNAVAILABLE');
  })();
  try{return await policeInFlight}
  finally{policeInFlight=null}
}
async function ensureSheets`;
if(!s.includes(oldTail))throw new Error('POLICE_PATCH_TAIL_NOT_FOUND');
s=s.replace(oldTail,replacementTail);

await fs.writeFile(file,s);
console.log('Police sheet request coalescing patch applied.');
