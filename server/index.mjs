// Render compatibility entrypoint.
// The production server lives in index-production.mjs.
//
// System Data recovery: if the System Data cell contains stale/concatenated JSON,
// the production loader must start from a clean default dataset instead of leaving
// storage permanently unavailable. Credentials are still parsed strictly.
import express from 'express';
const nativeJson = express.response.json;
const nativeSend = express.response.send;
express.response.json = function(body) {
  if (this.headersSent) return this;
  return nativeJson.call(this, body);
};
express.response.send = function(body) {
  if (this.headersSent) return this;
  return nativeSend.call(this, body);
};

if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  try {
    JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    console.warn('Invalid GOOGLE_SERVICE_ACCOUNT_JSON; falling back to GOOGLE_SERVICE_ACCOUNT_FILE.', error.message);
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  }
}

const nativeParse = JSON.parse.bind(JSON);
JSON.parse = (input, reviver) => {
  try {
    return nativeParse(input, reviver);
  } catch (error) {
    const text = String(input ?? '').trim();
    const looksLikeAcademyData = text.includes('"version"') &&
      (text.includes('"settings"') || text.includes('"applications"') || text.includes('"exams"'));

    if (looksLikeAcademyData) {
      console.warn('Invalid Google System Data JSON detected; starting with default academy data.', error.message);
      return {};
    }

    throw error;
  }
};

await import('./index-production.mjs');
