// Single production entrypoint. Render runs this file.
import './runtime-hooks.mjs';
await import('./academy-v3.mjs');
await import('./academy-controls.mjs');
