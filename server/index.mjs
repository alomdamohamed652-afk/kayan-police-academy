// Single production entrypoint. Render runs this file.
import './runtime-hooks.mjs';
const academy = await import('./academy-v3.mjs');
// academy-v3 initializes Express/data first; feature modules consume these references.
globalThis.__kayanApp = academy.app;
globalThis.__kayanData = academy.data;
await import('./academy-controls.mjs');
