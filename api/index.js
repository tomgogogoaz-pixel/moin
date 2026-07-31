// Keep the conventional /api entrypoint while sharing the same lazy handler
// that Vercel may trace to src/server.js during bundling.
export { default } from '../src/server.js';
