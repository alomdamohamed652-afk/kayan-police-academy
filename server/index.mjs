// Render compatibility entrypoint.
// The production server lives in index-production.mjs.
//
// Google credentials can be supplied either as GOOGLE_SERVICE_ACCOUNT_JSON or
// as Render Secret File GOOGLE_SERVICE_ACCOUNT_FILE. If the environment JSON
// is malformed, prefer the valid secret file instead of preventing the Google
// client from initializing. Do not override JSON.parse globally.
import fs from 'node:fs/promises';

const serviceFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '/etc/secrets/google-service-account.json';
const envJson = String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();

function validCredentials(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && parsed.type === 'service_account' && parsed.client_email && parsed.private_key
      ? parsed
      : null;
  } catch {
    return null;
  }
}

if (envJson) {
  const envCredentials = validCredentials(envJson);
  if (!envCredentials) {
    try {
      const fileJson = (await fs.readFile(serviceFile, 'utf8')).replace(/^\uFEFF/, '').trim();
      const fileCredentials = validCredentials(fileJson);
      if (!fileCredentials) throw new Error('Service account secret file is not valid service-account JSON.');
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON = fileJson;
      console.warn('GOOGLE_SERVICE_ACCOUNT_JSON is malformed; using GOOGLE_SERVICE_ACCOUNT_FILE instead.');
    } catch (error) {
      console.warn(`GOOGLE_SERVICE_ACCOUNT_JSON is malformed and secret file fallback failed: ${error.message}`);
    }
  }
} else {
  try {
    const fileJson = (await fs.readFile(serviceFile, 'utf8')).replace(/^\uFEFF/, '').trim();
    if (!validCredentials(fileJson)) throw new Error('Service account secret file is not valid service-account JSON.');
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON = fileJson;
  } catch {
    // index-production.mjs will report the definitive credential/storage error.
  }
}

await import('./index-production.mjs');
