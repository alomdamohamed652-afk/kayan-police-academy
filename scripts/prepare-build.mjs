import fs from 'node:fs/promises';

async function patch(path, replacements) {
  let source = await fs.readFile(path, 'utf8');
  let changed = false;
  for (const [from, to] of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`PREPARE_BUILD_PATCH_NOT_FOUND: ${path}`);
    source = source.replace(from, to);
    changed = true;
  }
  if (changed) await fs.writeFile(path, source, 'utf8');
}

// Keep citizen access working when the police roster is temporarily unavailable.
await patch('server/academy-production-original.mjs', [
  [
    "if(!c.sheet)return res.status(503).json({error:'POLICE_SHEET_UNAVAILABLE',retryable:true});if(c.police)return res.status(403).json({error:'OFFICERS_CANNOT_APPLY'});",
    "if(c.sheet&&c.police)return res.status(403).json({error:'OFFICERS_CANNOT_APPLY'});"
  ]
]);

// Prevent a temporary roster outage from hiding the citizen application area.
await patch('src/main.jsx', [
  [
    "if(user.identityPending)return <IdentityPending onRetry={load}/>;",
    "if(user.identityPending){user.permissions={...(user.permissions||{}),isCitizen:true,isOfficer:false};user.identityPending=false;user.role='citizen';}"
  ]
]);

console.log('Kayan build preparation complete.');
