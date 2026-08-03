import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasSupabaseConfiguration, isSupabaseMedia } from '../src/supabase-database.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Supabase is selected only when both the project URL and a server secret exist', () => {
  assert.equal(hasSupabaseConfiguration({}), false);
  assert.equal(hasSupabaseConfiguration({ SUPABASE_URL: 'https://example.supabase.co' }), false);
  assert.equal(hasSupabaseConfiguration({ SUPABASE_SECRET_KEY: 'sb_secret_test' }), false);
  assert.equal(hasSupabaseConfiguration({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SECRET_KEY: 'sb_secret_test'
  }), true);
  assert.equal(hasSupabaseConfiguration({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-role'
  }), true);
});

test('only explicit Supabase Storage pointers are treated as remote project media', () => {
  assert.equal(isSupabaseMedia('supabase://moin-media/uploads/example.webp'), true);
  assert.equal(isSupabaseMedia('/assets/example.webp'), false);
  assert.equal(isSupabaseMedia('https://example.supabase.co/storage/example.webp'), false);
});

test('the production migration creates private storage and a server-only SQL bridge', () => {
  const migration = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '202607310001_moin_initial.sql'), 'utf8');
  assert.match(migration, /insert into storage\.buckets/i);
  assert.match(migration, /'moin-media'.*false/s);
  assert.match(migration, /create or replace function public\.moin_sql/i);
  assert.match(migration, /revoke all on function public\.moin_sql.*anon, authenticated/is);
  assert.match(migration, /grant execute on function public\.moin_sql.*service_role/is);
});
