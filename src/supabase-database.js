import crypto from 'node:crypto';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { MATERIALS } from './database.js';
import { hashPassword } from './security.js';

const MEDIA_PREFIX = 'supabase://';
const DEFAULT_BUCKET = 'moin-media';

function databaseError(error, operation) {
  const failure = new Error(`Supabase ${operation} failed: ${error?.message || 'unknown error'}`);
  failure.code = 'SUPABASE_DATABASE_ERROR';
  failure.status = 503;
  failure.cause = error;
  return failure;
}

function mediaPointer(bucket, objectPath) {
  return `${MEDIA_PREFIX}${bucket}/${objectPath}`;
}

function parseMediaPointer(value) {
  if (!String(value || '').startsWith(MEDIA_PREFIX)) return null;
  const resource = String(value).slice(MEDIA_PREFIX.length);
  const separator = resource.indexOf('/');
  if (separator <= 0 || separator === resource.length - 1) return null;
  return { bucket: resource.slice(0, separator), objectPath: resource.slice(separator + 1) };
}

function imageExtension(mimeType) {
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  return '.jpg';
}

async function seedSupabase(db, { seedDemo }) {
  const now = new Date().toISOString();
  if (seedDemo) {
    const existing = await db.prepare('SELECT id FROM users WHERE email = ?').get('demo@moin.local');
    if (!existing) {
      await db.prepare('INSERT INTO users (id, email, name, password_hash, auth_provider, terms_accepted_at, terms_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), 'demo@moin.local', 'Moin', hashPassword('moin1234!'), 'local', now, 'demo', now);
    }
  }

  const insertMaterial = db.prepare(`
    INSERT INTO materials
      (id, slug, category, name, description, unit, price, image_url, stock, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      category = excluded.category,
      name = excluded.name,
      description = excluded.description,
      unit = excluded.unit,
      price = excluded.price,
      image_url = excluded.image_url,
      stock = excluded.stock
  `);
  for (const material of MATERIALS) await insertMaterial.run(crypto.randomUUID(), ...material, now);
}

export function hasSupabaseConfiguration(env = {}) {
  return Boolean(String(env.SUPABASE_URL || '').trim() && String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
}

export function openSupabaseDatabase({ url, secretKey, seedDemo = true, bucket = DEFAULT_BUCKET } = {}) {
  if (!url || !secretKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
  const client = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  const execute = async (statement, params, mode) => {
    const { data, error } = await client.rpc('moin_sql', {
      p_statement: String(statement),
      p_params: params,
      p_mode: mode
    });
    if (error) throw databaseError(error, mode === 'run' ? 'write' : 'query');
    return data;
  };

  const db = {
    provider: 'supabase',
    client,
    prepare(statement) {
      return {
        async all(...params) {
          const data = await execute(statement, params, 'all');
          return Array.isArray(data) ? data : [];
        },
        async get(...params) {
          const data = await execute(statement, params, 'all');
          return Array.isArray(data) ? data[0] : undefined;
        },
        async run(...params) {
          const data = await execute(statement, params, 'run');
          return { changes: Number(data?.changes || 0), lastInsertRowid: null };
        }
      };
    },
    async exec(statement) {
      const command = String(statement || '').trim().toUpperCase();
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(command)) return;
      await execute(statement, [], 'run');
    },
    close() {},
    storage: {
      isManaged(value) { return Boolean(parseMediaPointer(value)); },
      async write(folder, image) {
        const objectPath = `${String(folder || 'uploads').replace(/[^a-z0-9/_-]/gi, '-')}/${crypto.randomUUID()}${imageExtension(image.mimeType)}`;
        const { error } = await client.storage.from(bucket).upload(objectPath, image.buffer, {
          contentType: image.mimeType,
          cacheControl: '31536000',
          upsert: false
        });
        if (error) throw databaseError(error, 'storage upload');
        return mediaPointer(bucket, objectPath);
      },
      async read(value) {
        const pointer = parseMediaPointer(value);
        if (!pointer) return null;
        const { data, error } = await client.storage.from(pointer.bucket).download(pointer.objectPath);
        if (error || !data) throw databaseError(error, 'storage download');
        const buffer = Buffer.from(await data.arrayBuffer());
        const extension = path.extname(pointer.objectPath).toLowerCase();
        const mimeType = extension === '.png' ? 'image/png' : extension === '.webp' ? 'image/webp' : 'image/jpeg';
        return { buffer, mimeType };
      },
      async remove(value) {
        const pointer = parseMediaPointer(value);
        if (!pointer) return false;
        const { error } = await client.storage.from(pointer.bucket).remove([pointer.objectPath]);
        if (error) throw databaseError(error, 'storage delete');
        return true;
      }
    }
  };

  db.ready = (async () => {
    await db.prepare('SELECT 1 AS ok').get();
    await seedSupabase(db, { seedDemo });
  })();
  return db;
}

export function isSupabaseMedia(value) {
  return Boolean(parseMediaPointer(value));
}
