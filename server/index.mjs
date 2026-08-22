// Single production entrypoint. Render runs this file.
// Load the application first, then register evaluation extensions only after
// academy-v3 has initialized the shared Express app/data globals.
import './runtime-hooks.mjs';
await import('./academy-v3.mjs');
await import('./evaluation-admin.mjs');
await import('./evaluation-details.mjs');
