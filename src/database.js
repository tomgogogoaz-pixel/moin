import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './security.js';

export const MATERIALS = [
  ['premium-wallpaper', 'wallpaper', '프리미엄 벽지', '32롤 세트 - 실크 마감', '롤', 320000, '/assets/materials/wallpaper.webp', 32],
  ['oak-flooring', 'flooring', '원목 바닥재', '18㎡ 세트 - 내추럴 오크', '㎡', 540000, '/assets/materials/flooring.webp', 18],
  ['ceramic-tile', 'tile', '포세린 타일', '28장 세트 - 무광 크림', '장', 374000, '/assets/materials/tile.webp', 28],
  ['eco-paint', 'paint', '친환경 페인트', '20L 세트 - 세이지 그린', '통', 1720000, '/assets/materials/paint.webp', 24],
  ['soft-wallpaper', 'wallpaper', '내추럴 패브릭 벽지', '16롤 세트 - 웜 화이트', '롤', 184000, '/assets/materials/wallpaper.webp', 16],
  ['wide-oak-flooring', 'flooring', '와이드 원목 바닥재', '12㎡ 세트 - 라이트 오크', '㎡', 340000, '/assets/materials/flooring.webp', 12],
  ['cream-tile', 'tile', '크림 세라믹 타일', '16장 세트 - 소프트 무광', '장', 86000, '/assets/materials/tile.webp', 16],
  ['sample-paint', 'tools', '도구', '롤러·커터·보호구 12종 세트', '세트', 600000, '/assets/materials/tools.webp', 12]
];

export function openDatabase(filename, { seedDemo = true } = {}) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL COLLATE NOCASE UNIQUE,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      auth_provider TEXT NOT NULL DEFAULT 'local',
      terms_accepted_at TEXT,
      terms_version TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      current_image_path TEXT,
      reference_image_path TEXT,
      floor_material_image_path TEXT,
      wall_material_image_path TEXT,
      object_material_image_path TEXT,
      object_mask_image_path TEXT,
      result_after_path TEXT,
      analysis_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS project_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL CHECK (version_number >= 0),
      kind TEXT NOT NULL CHECK (kind IN ('baseline', 'generation', 'rollback')),
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
      parent_version_id TEXT,
      before_image_path TEXT,
      reference_image_path TEXT,
      floor_material_image_path TEXT,
      wall_material_image_path TEXT,
      object_material_image_path TEXT,
      object_mask_image_path TEXT,
      result_after_path TEXT,
      analysis_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      UNIQUE(project_id, version_number)
    );
    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      unit TEXT NOT NULL,
      price INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cart_items (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      material_id TEXT NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 99),
      selected INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, material_id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      material_id TEXT NOT NULL REFERENCES materials(id),
      name_snapshot TEXT NOT NULL,
      price_snapshot INTEGER NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 99)
    );
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_project_versions_project ON project_versions(project_id, version_number DESC);
    CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category, price);
    CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
  `);

  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  if (!userColumns.has('terms_accepted_at')) db.exec('ALTER TABLE users ADD COLUMN terms_accepted_at TEXT');
  if (!userColumns.has('terms_version')) db.exec('ALTER TABLE users ADD COLUMN terms_version TEXT');
  const projectColumns = new Set(db.prepare('PRAGMA table_info(projects)').all().map((column) => column.name));
  if (!projectColumns.has('floor_material_image_path')) db.exec('ALTER TABLE projects ADD COLUMN floor_material_image_path TEXT');
  if (!projectColumns.has('wall_material_image_path')) db.exec('ALTER TABLE projects ADD COLUMN wall_material_image_path TEXT');
  if (!projectColumns.has('object_material_image_path')) db.exec('ALTER TABLE projects ADD COLUMN object_material_image_path TEXT');
  if (!projectColumns.has('object_mask_image_path')) db.exec('ALTER TABLE projects ADD COLUMN object_mask_image_path TEXT');

  const now = new Date().toISOString();
  if (seedDemo && !db.prepare('SELECT id FROM users WHERE email = ?').get('demo@moin.local')) {
    db.prepare('INSERT INTO users (id, email, name, password_hash, auth_provider, terms_accepted_at, terms_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), 'demo@moin.local', 'Moin', hashPassword('moin1234!'), 'local', now, 'demo', now);
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
  for (const material of MATERIALS) {
    insertMaterial.run(crypto.randomUUID(), ...material, now);
  }
  return db;
}

export function closeDatabase(db) {
  try { db.close(); } catch { /* already closed */ }
}

export function publicUser(row) {
  return row ? { id: row.id, email: row.email, name: row.name } : null;
}
