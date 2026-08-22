// Render compatibility entrypoint.
// The production server lives in index-production.mjs.
// Prefer the mounted Render Secret File over a stale/malformed JSON environment variable.
// The Academy data worksheet is now named DATA.
import fs from 'node:fs/promises';

try {
  const serviceAccountPath = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || '/etc/secrets/google-service-account.json';
  const serviceAccountJson = await fs.readFile(serviceAccountPath, 'utf8');
  JSON.parse(serviceAccountJson);
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = serviceAccountJson;
  process.env.GOOGLE_SERVICE_ACCOUNT_FILE = serviceAccountPath;
} catch (error) {
  // Fall back to the environment variable when no Render Secret File is mounted.
  // The production server will perform strict JSON validation itself.
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    console.warn('Google service-account secret file is unavailable:', error.message);
  }
}

process.env.ACADEMY_GOOGLE_SHEET_NAME = 'DATA';
process.env.GOOGLE_ACADEMY_DATA_SHEET_NAME = 'DATA';

await import('./index-production.mjs');
