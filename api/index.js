import os from 'node:os';
import path from 'node:path';
import { createMoinServer } from '../src/server.js';

// Vercel Functions may only write runtime files under the temporary directory.
// The module is cached for warm invocations, so SQLite and uploaded images stay
// available while the same function instance is alive. Production persistence
// will move to Supabase/Storage as planned.
const dataDir = process.env.MOIN_DATA_DIR || path.join(os.tmpdir(), 'moin');
const server = createMoinServer({ dataDir });

export default function handler(req, res) {
  server.emit('request', req, res);
}
