import fs from 'node:fs/promises';

const target = 'scripts/apply-academy-fixes.mjs';
let source = await fs.readFile(target, 'utf8');

// The generated Exams string contains escaped template literals. Normalize the
// double escaping before Node parses the patch script itself.
source = source.replaceAll('\\\\`', '\\`').replaceAll('\\\\${', '\\${');
await fs.writeFile(target, source, 'utf8');
console.log('Academy patch-script escaping normalized.');
