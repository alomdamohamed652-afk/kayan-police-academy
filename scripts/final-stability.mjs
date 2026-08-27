import fs from 'node:fs/promises';
const source=await fs.readFile('src/main.jsx','utf8');
if(!source.includes('class KayanErrorBoundary'))throw new Error('FINAL_STABILITY_ERROR_BOUNDARY_NOT_FOUND');
if(!source.includes('function Applications({user}){'))throw new Error('FINAL_STABILITY_APPLICATION_FUNCTION_NOT_FOUND');
if(!source.includes('const normalizeUser='))throw new Error('FINAL_STABILITY_USER_NORMALIZER_NOT_FOUND');
if(!source.includes('aside className={open?\'topNav open\':\'topNav\'}'))throw new Error('FINAL_STABILITY_SIDEBAR_MARKUP_NOT_FOUND');
console.log('Final stability validation complete; source files are left untouched.');