// Render compatibility entrypoint.
// The production server lives in index-production.mjs.
//
// System Data recovery: if the System Data cell contains stale/concatenated JSON,
// the production loader must start from a clean default dataset instead of leaving
// storage permanently unavailable. Credentials are still parsed strictly.
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
