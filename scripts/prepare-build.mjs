import fs from 'node:fs/promises';
const source=await fs.readFile('src/main.jsx','utf8');
if(!source.includes('function Applications({user}){'))throw new Error('PREPARE_BUILD_APPLICATION_FUNCTION_NOT_FOUND');
if(!source.includes('function ApplicationStatus({app}){'))throw new Error('PREPARE_BUILD_APPLICATION_STATUS_NOT_FOUND');
console.log('Build preparation validation complete; source files are left untouched.');