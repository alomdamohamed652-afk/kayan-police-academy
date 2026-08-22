import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const original=path.join(root,'academy-production-original.mjs');
const runtime=path.join(root,'runtime-enhancements.mjs');
const marker='/* KAYAN_ACADEMY_RUNTIME_ENHANCEMENTS_V2 */';
let source=await fs.readFile(original,'utf8');
if(!source.includes(marker)){await import(runtime);}
else await import('./academy-production-original.mjs');
