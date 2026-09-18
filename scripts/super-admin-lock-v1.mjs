import fs from 'node:fs/promises';
const file='server/academy-production-original.mjs';
let s=await fs.readFile(file,'utf8');
s=s.replace(
"if(!hasEnabledAdmins()&&BOOTSTRAP_ADMINS.has(uid))return res.status(400).json({error:'BOOTSTRAP_ADMIN_PROTECTED'});",
"if(BOOTSTRAP_ADMINS.has(uid))return res.status(400).json({error:'ENV_ADMIN_PROTECTED'});"
);
s=s.replace(
"if(!hasEnabledAdmins()&&BOOTSTRAP_ADMINS.has(uid))return res.status(400).json({error:'BOOTSTRAP_ADMIN_CANNOT_BE_DELETED'});",
"if(BOOTSTRAP_ADMINS.has(uid))return res.status(400).json({error:'ENV_ADMIN_PROTECTED'});"
);
await fs.writeFile(file,s,'utf8');
console.log('Super Admin API lock hardened.');
