import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openDatabase, closeDatabase, publicUser } from './database.js';
import { createAiProvider, imageDimensions } from './services/ai.js';
import {
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeEmail,
  parseCookies,
  verifyPassword
} from './security.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const ENV = globalThis.process?.env || {};
const SESSION_COOKIE = 'moin_session';
const SESSION_DAYS = 14;
const TERMS_VERSION = '2026-07-15-v1';
// Three 8 MiB images expand to roughly 32 MiB when represented as Base64 JSON.
const MAX_BODY_BYTES = 36 * 1024 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

function loadLocalEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match || match[2] === '') continue;
    if (!(match[1] in ENV)) ENV[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}

function securityHeaders() {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
  };
}

function sendJson(res, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    ...securityHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    ...headers
  });
  res.end(body);
}

function sendError(res, status, code, message, fieldErrors) {
  sendJson(res, status, { error: { code, message, ...(fieldErrors ? { fieldErrors } : {}) } });
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let total = 0;
    let tooLarge = false;
    const chunks = [];
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!tooLarge) chunks.push(chunk);
    });
    req.on('end', () => {
      if (tooLarge) return reject(Object.assign(new Error('요청 본문은 24MB 이하여야 합니다.'), { status: 413 }));
      if (!chunks.length) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          return reject(Object.assign(new Error('JSON 객체 형식으로 요청해주세요.'), { status: 400 }));
        }
        resolve(parsed);
      }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function sessionCookie(rawToken, maxAgeSeconds) {
  const secure = ENV.NODE_ENV === 'production' ? '; Secure' : '';
  const maxAge = Number.isFinite(maxAgeSeconds) ? `; Max-Age=${maxAgeSeconds}` : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(rawToken)}; HttpOnly; Path=/; SameSite=Lax${maxAge}${secure}`;
}

function getUser(db, req) {
  const rawToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!rawToken) return null;
  const now = new Date().toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  const tokenHash = hashToken(rawToken);
  const user = db.prepare(`
    SELECT u.id, u.email, u.name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(tokenHash, now) || null;
  if (user?.email === 'demo@moin.local' && ENV.NODE_ENV === 'production' && ENV.ENABLE_DEMO_AUTH !== 'true') {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  return user;
}

function requireUser(db, req, res) {
  const user = getUser(db, req);
  if (!user) sendError(res, 401, 'AUTH_REQUIRED', '로그인이 필요합니다.');
  return user;
}

function startSession(db, userId, persistent = false) {
  const rawToken = createSessionToken();
  const now = new Date();
  const lifetimeDays = persistent ? SESSION_DAYS : 1;
  const expires = new Date(now.getTime() + lifetimeDays * 86400000);
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(rawToken), userId, expires.toISOString(), now.toISOString());
  return { rawToken, maxAge: persistent ? SESSION_DAYS * 86400 : null };
}

function materialView(row) {
  return {
    id: row.id,
    slug: row.slug,
    category: row.category,
    name: row.name,
    description: row.description,
    unit: row.unit,
    price: row.price,
    imageUrl: row.image_url,
    stock: row.stock
  };
}

function cartRows(db, userId) {
  return db.prepare(`
    SELECT ci.id AS cart_id, ci.quantity, ci.selected,
           m.id, m.slug, m.category, m.name, m.description, m.unit, m.price, m.image_url, m.stock
    FROM cart_items ci JOIN materials m ON m.id = ci.material_id
    WHERE ci.user_id = ? ORDER BY ci.created_at DESC
  `).all(userId).map((row) => ({
    cartId: row.cart_id,
    quantity: row.quantity,
    selected: Boolean(row.selected),
    material: materialView(row),
    lineTotal: row.quantity * row.price
  }));
}

function decodeImage(dataUrl) {
  const match = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) throw Object.assign(new Error('PNG, JPEG 또는 WebP 이미지만 업로드할 수 있습니다.'), { status: 400 });
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) {
    throw Object.assign(new Error('이미지는 장당 8MB 이하여야 합니다.'), { status: 400 });
  }
  const detected = buffer.length >= 12 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    ? 'image/png'
    : buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
      ? 'image/jpeg'
      : buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP'
        ? 'image/webp'
        : null;
  if (detected !== match[1]) {
    throw Object.assign(new Error('파일 내용과 이미지 형식이 일치하지 않습니다.'), { status: 400 });
  }
  return { mimeType: match[1], base64: match[2].replace(/\s/g, ''), buffer };
}

function writeImage(directory, image) {
  fs.mkdirSync(directory, { recursive: true });
  const extension = image.mimeType === 'image/png' ? '.png' : image.mimeType === 'image/webp' ? '.webp' : '.jpg';
  const filename = `${crypto.randomUUID()}${extension}`;
  const destination = path.join(directory, filename);
  fs.writeFileSync(destination, image.buffer);
  return destination;
}

function readStoredImage(filename) {
  if (!filename || filename.startsWith('/assets/') || !fs.existsSync(filename)) {
    throw Object.assign(new Error('원본 스케치 파일을 찾을 수 없습니다.'), { status: 409 });
  }
  const mimeType = MIME[path.extname(filename).toLowerCase()];
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    throw Object.assign(new Error('원본 스케치 파일 형식이 지원되지 않습니다.'), { status: 409 });
  }
  const buffer = fs.readFileSync(filename);
  return decodeImage(`data:${mimeType};base64,${buffer.toString('base64')}`);
}

function consumeHourlyLimit(usage, key, maximum) {
  const cutoff = Date.now() - 60 * 60 * 1000;
  const recent = (usage.get(key) || []).filter((timestamp) => timestamp > cutoff);
  if (recent.length >= maximum) {
    usage.set(key, recent);
    return false;
  }
  recent.push(Date.now());
  usage.set(key, recent);
  return true;
}

function projectView(project) {
  if (!project) return null;
  let analysis = parseJson(project.analysis_json);
  const currentUrl = project.current_image_path
    ? `/api/v1/projects/${project.id}/media/current`
    : null;
  const floorMaterialUrl = project.floor_material_image_path
    ? `/api/v1/projects/${project.id}/media/floor`
    : null;
  const wallMaterialUrl = project.wall_material_image_path
    ? `/api/v1/projects/${project.id}/media/wall`
    : null;
  const objectMaterialUrl = project.object_material_image_path
    ? `/api/v1/projects/${project.id}/media/object-material`
    : null;
  const objectMaskUrl = project.object_mask_image_path
    ? `/api/v1/projects/${project.id}/media/mask`
    : null;
  const legacyStaticMock = analysis.provider === 'mock'
    && project.result_after_path === '/assets/generated/room-after.webp';
  if (legacyStaticMock) {
    analysis = {
      ...analysis,
      previewOnly: true,
      afterSource: 'current',
      summary: '이전 로컬 목업의 고정 예시 이미지를 제거하고, 업로드한 원본의 구조를 보존한 미리보기로 표시합니다.',
      transformation: {
        mode: 'source-preview',
        geometryLocked: true,
        appearanceApplied: false
      }
    };
  }
  let afterUrl = null;
  if (legacyStaticMock) afterUrl = currentUrl;
  else if (project.status !== 'failed' && project.result_after_path) {
    afterUrl = project.result_after_path.startsWith('/assets/')
      ? project.result_after_path
      : `/api/v1/projects/${project.id}/media/after`;
  }
  return {
    id: project.id,
    title: project.title,
    status: project.status,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    analysis,
    beforeUrl: currentUrl,
    afterUrl,
    floorMaterialUrl,
    wallMaterialUrl,
    objectMaterialUrl,
    objectMaskUrl
  };
}

function parseJson(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const VERSION_MEDIA_FIELDS = Object.freeze([
  'before_image_path',
  'reference_image_path',
  'floor_material_image_path',
  'wall_material_image_path',
  'object_material_image_path',
  'object_mask_image_path',
  'result_after_path'
]);

function versionMediaPaths(version) {
  return VERSION_MEDIA_FIELDS.map((field) => version?.[field]).filter(Boolean);
}

function projectVersionView(version, activeVersionId) {
  const analysis = parseJson(version.analysis_json);
  return {
    id: version.id,
    projectId: version.project_id,
    versionNumber: Number(version.version_number),
    kind: version.kind,
    status: version.status,
    parentVersionId: version.parent_version_id || null,
    createdAt: version.created_at,
    isActive: version.id === activeVersionId,
    inputMode: analysis?.prompt?.inputMode || null,
    targetObject: analysis?.prompt?.targetObject || null,
    summary: typeof analysis.summary === 'string' ? analysis.summary : null
  };
}

function createProjectVersion(db, {
  projectId,
  kind,
  status = 'completed',
  parentVersionId = null,
  beforeImagePath = null,
  referenceImagePath = null,
  floorMaterialImagePath = null,
  wallMaterialImagePath = null,
  objectMaterialImagePath = null,
  objectMaskImagePath = null,
  resultAfterPath = null,
  analysis = {},
  createdAt = new Date().toISOString()
}) {
  const next = db.prepare('SELECT COALESCE(MAX(version_number), -1) + 1 AS value FROM project_versions WHERE project_id = ?').get(projectId);
  const id = crypto.randomUUID();
  db.prepare(`INSERT INTO project_versions
    (id, project_id, version_number, kind, status, parent_version_id, before_image_path, reference_image_path, floor_material_image_path, wall_material_image_path, object_material_image_path, object_mask_image_path, result_after_path, analysis_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, projectId, Number(next?.value || 0), kind, status, parentVersionId, beforeImagePath, referenceImagePath, floorMaterialImagePath, wallMaterialImagePath, objectMaterialImagePath, objectMaskImagePath, resultAfterPath, JSON.stringify(analysis || {}), createdAt);
  return db.prepare('SELECT * FROM project_versions WHERE id = ?').get(id);
}

function ensureBaselineProjectVersion(db, project) {
  let baseline = db.prepare("SELECT * FROM project_versions WHERE project_id = ? AND kind = 'baseline' ORDER BY version_number ASC LIMIT 1").get(project.id);
  if (baseline) return baseline;
  baseline = createProjectVersion(db, {
    projectId: project.id,
    kind: 'baseline',
    beforeImagePath: project.current_image_path,
    resultAfterPath: project.current_image_path,
    analysis: {
      provider: 'version-control',
      previewOnly: true,
      afterSource: 'current',
      summary: '원본 공간 스케치를 롤백 기준점으로 보관했습니다.',
      style: '원본 스케치 기준점',
      prompt: { version: 'moin-version-control-v1', inputMode: 'baseline', structuralLock: true },
      transformation: { mode: 'baseline-snapshot', geometryLocked: true, appearanceApplied: false }
    },
    createdAt: project.created_at
  });
  return baseline;
}

function latestProjectVersion(db, projectId) {
  return db.prepare('SELECT * FROM project_versions WHERE project_id = ? ORDER BY version_number DESC LIMIT 1').get(projectId) || null;
}

function ensureProjectVersionHistory(db, project) {
  const baseline = ensureBaselineProjectVersion(db, project);
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM project_versions WHERE project_id = ?').get(project.id)?.count || 0);
  if (count === 1 && project.status !== 'failed' && (
    project.result_after_path
    || project.reference_image_path
    || project.floor_material_image_path
    || project.wall_material_image_path
    || project.object_material_image_path
  )) {
    createProjectVersion(db, {
      projectId: project.id,
      kind: 'generation',
      parentVersionId: baseline.id,
      beforeImagePath: project.current_image_path,
      referenceImagePath: project.reference_image_path,
      floorMaterialImagePath: project.floor_material_image_path,
      wallMaterialImagePath: project.wall_material_image_path,
      objectMaterialImagePath: project.object_material_image_path,
      objectMaskImagePath: project.object_mask_image_path,
      resultAfterPath: project.result_after_path,
      analysis: parseJson(project.analysis_json),
      createdAt: project.updated_at || project.created_at
    });
  }
  return baseline;
}

function ownedProject(db, projectId, userId) {
  return db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(projectId, userId) || null;
}

function isInsideDirectory(filename, directory) {
  const relative = path.relative(path.resolve(directory), path.resolve(filename));
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isManagedProjectMedia(filename, dataDir) {
  if (!filename || filename.startsWith('/assets/')) return false;
  return ['uploads', 'generated'].some((folder) => isInsideDirectory(filename, path.join(dataDir, folder)));
}

function removeUnreferencedProjectMedia(db, dataDir, filenames) {
  const projectReferences = db.prepare(`
    SELECT COUNT(*) AS count
    FROM projects
    WHERE current_image_path = ?
       OR reference_image_path = ?
       OR floor_material_image_path = ?
       OR wall_material_image_path = ?
       OR object_material_image_path = ?
       OR object_mask_image_path = ?
       OR result_after_path = ?
  `);
  const versionReferences = db.prepare(`
    SELECT COUNT(*) AS count
    FROM project_versions
    WHERE before_image_path = ?
       OR reference_image_path = ?
       OR floor_material_image_path = ?
       OR wall_material_image_path = ?
       OR object_material_image_path = ?
       OR object_mask_image_path = ?
       OR result_after_path = ?
  `);

  for (const filename of new Set(filenames.filter((value) => isManagedProjectMedia(value, dataDir)))) {
    const projectCount = Number(projectReferences.get(filename, filename, filename, filename, filename, filename, filename)?.count || 0);
    const versionCount = Number(versionReferences.get(filename, filename, filename, filename, filename, filename, filename)?.count || 0);
    if (projectCount + versionCount !== 0 || !fs.existsSync(filename)) continue;
    try { fs.unlinkSync(filename); } catch { /* The project row is already removed; stale media can be cleaned up later. */ }
  }
}

async function handleApi({ req, res, url, db, aiProvider, dataDir, analysisUsage }) {
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (method === 'GET' && pathname === '/api/health') {
    sendJson(res, 200, { data: { status: 'ok', database: 'sqlite', ai: aiProvider.constructor.name } });
    return true;
  }

  if (method === 'GET' && pathname === '/api/v1/landing/start') {
    const user = getUser(db, req);
    sendJson(res, 200, { data: { authenticated: Boolean(user), next: user ? '/dashboard' : '/login' } });
    return true;
  }

  if (method === 'GET' && pathname === '/api/v1/auth/me') {
    sendJson(res, 200, { data: { user: publicUser(getUser(db, req)) } });
    return true;
  }

  if (method === 'POST' && pathname === '/api/v1/auth/signup') {
    const body = await readJson(req);
    const email = normalizeEmail(body.email);
    const name = String(body.name || '').trim();
    const password = String(body.password || '');
    const errors = {};
    if (name.length < 2 || name.length > 60) errors.name = '이름은 2자 이상 60자 이하로 입력해주세요.';
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = '올바른 이메일을 입력해주세요.';
    if (password.length < 8 || password.length > 128) errors.password = '비밀번호는 8자 이상 128자 이하여야 합니다.';
    if (!body.terms) errors.terms = '필수 약관에 동의해주세요.';
    if (Object.keys(errors).length) {
      sendError(res, 400, 'VALIDATION_ERROR', '입력 내용을 확인해주세요.', errors);
      return true;
    }
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
      sendError(res, 409, 'EMAIL_EXISTS', '이미 가입된 이메일입니다.');
      return true;
    }
    const id = crypto.randomUUID();
    const acceptedAt = new Date().toISOString();
    db.prepare('INSERT INTO users (id, email, name, password_hash, auth_provider, terms_accepted_at, terms_version, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, email, name, hashPassword(password), 'local', acceptedAt, TERMS_VERSION, acceptedAt);
    sendJson(res, 201, { data: { user: { id, email, name }, next: '/login' } });
    return true;
  }

  if (method === 'POST' && pathname === '/api/v1/auth/login') {
    const body = await readJson(req);
    if (String(body.password || '').length > 128) {
      sendError(res, 400, 'VALIDATION_ERROR', '비밀번호는 128자 이하여야 합니다.');
      return true;
    }
    const email = normalizeEmail(body.email);
    if (email.length > 254) {
      sendError(res, 400, 'VALIDATION_ERROR', '올바른 이메일을 입력해주세요.');
      return true;
    }
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (row?.email === 'demo@moin.local' && ENV.NODE_ENV === 'production' && ENV.ENABLE_DEMO_AUTH !== 'true') {
      sendError(res, 403, 'DEMO_DISABLED', '운영 환경에서는 데모 로그인이 비활성화되어 있습니다.');
      return true;
    }
    if (!row || !verifyPassword(String(body.password || ''), row.password_hash)) {
      sendError(res, 401, 'INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해주세요.');
      return true;
    }
    const session = startSession(db, row.id, body.remember === true);
    sendJson(res, 200, { data: { user: publicUser(row), next: '/dashboard' } }, {
      'set-cookie': sessionCookie(session.rawToken, session.maxAge)
    });
    return true;
  }

  if (method === 'POST' && pathname === '/api/v1/auth/demo') {
    if (ENV.NODE_ENV === 'production' && ENV.ENABLE_DEMO_AUTH !== 'true') {
      sendError(res, 403, 'DEMO_DISABLED', '운영 환경에서는 데모 로그인이 비활성화되어 있습니다.');
      return true;
    }
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get('demo@moin.local');
    const session = startSession(db, row.id, true);
    sendJson(res, 200, { data: { user: publicUser(row), next: '/dashboard' } }, {
      'set-cookie': sessionCookie(session.rawToken, session.maxAge)
    });
    return true;
  }

  if (method === 'POST' && pathname === '/api/v1/auth/logout') {
    const rawToken = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (rawToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(rawToken));
    sendJson(res, 200, { data: { success: true } }, { 'set-cookie': sessionCookie('', 0) });
    return true;
  }

  if (method === 'GET' && pathname === '/api/v1/materials') {
    const category = url.searchParams.get('category');
    const search = url.searchParams.get('q')?.trim();
    const maxPrice = Number(url.searchParams.get('maxPrice') || 0);
    const filters = [];
    const values = [];
    if (category && category !== 'all') { filters.push('category = ?'); values.push(category); }
    if (search) { filters.push('(name LIKE ? OR description LIKE ?)'); values.push(`%${search}%`, `%${search}%`); }
    if (maxPrice > 0) { filters.push('price <= ?'); values.push(maxPrice); }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const rows = db.prepare(`SELECT * FROM materials ${where} ORDER BY created_at, name`).all(...values);
    sendJson(res, 200, { data: { materials: rows.map(materialView) } });
    return true;
  }

  if (pathname === '/api/v1/cart') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    if (method === 'GET') {
      const items = cartRows(db, user.id);
      sendJson(res, 200, { data: { items, total: items.filter((item) => item.selected).reduce((sum, item) => sum + item.lineTotal, 0) } });
      return true;
    }
    if (method === 'POST') {
      const body = await readJson(req);
      const requestedQuantity = body.quantity === undefined ? 1 : Number(body.quantity);
      if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 99) {
        sendError(res, 400, 'INVALID_QUANTITY', '수량은 1부터 99 사이의 정수여야 합니다.');
        return true;
      }
      const material = db.prepare('SELECT id FROM materials WHERE id = ?').get(body.materialId);
      if (!material) { sendError(res, 404, 'MATERIAL_NOT_FOUND', '상품을 찾을 수 없습니다.'); return true; }
      const existing = db.prepare('SELECT id, quantity FROM cart_items WHERE user_id = ? AND material_id = ?').get(user.id, material.id);
      if (existing) db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(Math.min(existing.quantity + requestedQuantity, 99), existing.id);
      else db.prepare('INSERT INTO cart_items (id, user_id, material_id, quantity, selected, created_at) VALUES (?, ?, ?, ?, 1, ?)')
        .run(crypto.randomUUID(), user.id, material.id, requestedQuantity, new Date().toISOString());
      const items = cartRows(db, user.id);
      sendJson(res, 200, { data: { items } });
      return true;
    }
  }

  const cartMatch = pathname.match(/^\/api\/v1\/cart\/items\/([^/]+)$/);
  if (cartMatch) {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const item = db.prepare('SELECT * FROM cart_items WHERE id = ? AND user_id = ?').get(cartMatch[1], user.id);
    if (!item) { sendError(res, 404, 'CART_ITEM_NOT_FOUND', '장바구니 항목을 찾을 수 없습니다.'); return true; }
    if (method === 'PATCH') {
      const body = await readJson(req);
      const hasQuantity = Object.hasOwn(body, 'quantity');
      const hasSelected = Object.hasOwn(body, 'selected');
      const quantity = hasQuantity ? Number(body.quantity) : item.quantity;
      if (hasQuantity && (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99)) {
        sendError(res, 400, 'INVALID_QUANTITY', '수량은 1부터 99 사이의 정수여야 합니다.');
        return true;
      }
      if (hasSelected && typeof body.selected !== 'boolean') {
        sendError(res, 400, 'INVALID_SELECTION', '선택 상태는 true 또는 false여야 합니다.');
        return true;
      }
      db.prepare('UPDATE cart_items SET quantity = ?, selected = ? WHERE id = ?')
        .run(quantity, hasSelected ? Number(body.selected) : item.selected, item.id);
      sendJson(res, 200, { data: { items: cartRows(db, user.id) } });
      return true;
    }
    if (method === 'DELETE') {
      db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
      sendJson(res, 200, { data: { items: cartRows(db, user.id) } });
      return true;
    }
  }

  if (method === 'POST' && pathname === '/api/v1/orders') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const items = cartRows(db, user.id).filter((item) => item.selected);
    if (!items.length) { sendError(res, 400, 'EMPTY_CART', '선택된 상품이 없습니다.'); return true; }
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
    const orderId = crypto.randomUUID();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO orders (id, user_id, total, status, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(orderId, user.id, total, 'demo_completed', new Date().toISOString());
      const insertItem = db.prepare('INSERT INTO order_items (id, order_id, material_id, name_snapshot, price_snapshot, quantity) VALUES (?, ?, ?, ?, ?, ?)');
      for (const item of items) insertItem.run(crypto.randomUUID(), orderId, item.material.id, item.material.name, item.material.price, item.quantity);
      db.prepare('DELETE FROM cart_items WHERE user_id = ? AND selected = 1').run(user.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    sendJson(res, 201, { data: { order: { id: orderId, total, status: 'demo_completed' } } });
    return true;
  }

  if (method === 'GET' && pathname === '/api/v1/projects') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const projects = db.prepare('SELECT * FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(user.id).map(projectView);
    sendJson(res, 200, { data: { projects } });
    return true;
  }

  if (method === 'POST' && (
    pathname === '/api/v1/projects/analyze'
    || pathname === '/api/v1/generate'
    || pathname === '/api/v1/generate/object-material'
  )) {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const maximum = Math.max(1, Number(ENV.AI_ANALYZE_LIMIT_PER_HOUR) || 20);
    if (!consumeHourlyLimit(analysisUsage, user.id, maximum)) {
      sendError(res, 429, 'ANALYSIS_LIMIT', '시간당 AI 분석 횟수를 초과했습니다. 잠시 후 다시 시도해주세요.');
      return true;
    }
    const body = await readJson(req);
    const objectMode = pathname === '/api/v1/generate/object-material';
    const materialMode = !objectMode && (pathname === '/api/v1/generate' || [
      'spaceImage', 'floorMaterialImage', 'wallMaterialImage', 'floorImage', 'wallImage'
    ].some((key) => Object.hasOwn(body, key)));
    let current;
    let reference = null;
    let floorMaterial = null;
    let wallMaterial = null;
    let objectMaterial = null;
    let objectMask = null;
    let targetObject = null;
    let selection = null;
    if (objectMode) {
      const spaceImage = body.spaceImage || body.sourceImage || body.currentImage;
      const materialImage = body.materialImage || body.objectMaterialImage;
      const maskImage = body.maskImage;
      targetObject = String(body.targetObject || body.target?.objectId || '').trim().slice(0, 80);
      selection = body.selection || body.target?.seedPoint || null;
      if (!spaceImage || !materialImage || !maskImage || !targetObject) {
        throw Object.assign(new Error('공간 사진, 대상 자재, 선택 영역 마스크, 대상 객체를 모두 입력해주세요.'), { status: 400 });
      }
      current = decodeImage(spaceImage);
      objectMaterial = decodeImage(materialImage);
      objectMask = decodeImage(maskImage);
      if (objectMask.mimeType !== 'image/png') {
        throw Object.assign(new Error('선택 영역 마스크는 PNG 형식이어야 합니다.'), { status: 400 });
      }
      const sourceDimensions = imageDimensions(current);
      const maskDimensions = imageDimensions(objectMask);
      if (!sourceDimensions?.width || !sourceDimensions?.height || !maskDimensions?.width || !maskDimensions?.height) {
        throw Object.assign(new Error('공간 사진과 선택 영역 마스크의 크기를 확인할 수 없습니다.'), { status: 400 });
      }
      if (sourceDimensions.width !== maskDimensions.width || sourceDimensions.height !== maskDimensions.height) {
        throw Object.assign(new Error('선택 영역 마스크는 공간 사진과 같은 가로·세로 크기여야 합니다.'), { status: 400 });
      }
    } else if (materialMode) {
      const spaceImage = body.spaceImage || body.currentImage;
      const floorImage = body.floorMaterialImage || body.floorImage;
      const wallImage = body.wallMaterialImage || body.wallImage;
      if (!spaceImage || !floorImage || !wallImage) {
        throw Object.assign(new Error('공간 뼈대, 바닥재, 벽지 이미지를 각각 1장씩 업로드해주세요.'), { status: 400 });
      }
      current = decodeImage(spaceImage);
      floorMaterial = decodeImage(floorImage);
      wallMaterial = decodeImage(wallImage);
    } else {
      current = decodeImage(body.currentImage);
      reference = decodeImage(body.referenceImage);
    }
    const uploadsDir = path.join(dataDir, 'uploads');
    const generatedDir = path.join(dataDir, 'generated');
    const currentPath = writeImage(uploadsDir, current);
    const referencePath = reference ? writeImage(uploadsDir, reference) : null;
    const floorMaterialPath = floorMaterial ? writeImage(uploadsDir, floorMaterial) : null;
    const wallMaterialPath = wallMaterial ? writeImage(uploadsDir, wallMaterial) : null;
    const objectMaterialPath = objectMaterial ? writeImage(uploadsDir, objectMaterial) : null;
    const objectMaskPath = objectMask ? writeImage(uploadsDir, objectMask) : null;
    const projectId = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO projects
      (id, user_id, title, status, current_image_path, reference_image_path, floor_material_image_path, wall_material_image_path, object_material_image_path, object_mask_image_path, result_after_path, analysis_json, created_at, updated_at)
      VALUES (?, ?, ?, 'analyzing', ?, ?, ?, ?, ?, ?, NULL, '{}', ?, ?)`)
      .run(projectId, user.id, objectMode ? `${targetObject} 재질 적용 프로젝트` : materialMode ? '자재 인페인팅 프로젝트' : '나의 거실 프로젝트', currentPath, referencePath, floorMaterialPath, wallMaterialPath, objectMaterialPath, objectMaskPath, now, now);
    const baselineVersion = ensureBaselineProjectVersion(db, ownedProject(db, projectId, user.id));
    try {
      const result = await aiProvider.analyze({ current, reference, floorMaterial, wallMaterial, objectMaterial, mask: objectMask, targetObject, selection });
      if (!result || typeof result !== 'object') throw new Error('AI provider returned an invalid result');
      if (result.afterPublicUrl) throw new Error('AI provider returned the deprecated public-image result contract');
      let afterPath = null;
      if (result.afterSource === 'current') {
        if (result.previewOnly !== true) throw new Error('Source previews must be explicitly marked previewOnly');
        afterPath = currentPath;
      } else if (result.afterSource && result.afterSource !== 'generated') {
        throw new Error('AI provider returned an unsupported afterSource');
      }
      if (result.after?.base64) {
        if (afterPath) throw new Error('AI provider returned conflicting after-image sources');
        const afterImage = decodeImage(`data:${result.after.mimeType || 'image/png'};base64,${result.after.base64}`);
        afterPath = writeImage(generatedDir, afterImage);
      }
      if (!afterPath) throw new Error('AI provider did not return an after image or an explicit source preview');
      const safeResult = { ...result };
      delete safeResult.after;
      db.prepare('UPDATE projects SET status = ?, result_after_path = ?, analysis_json = ?, updated_at = ? WHERE id = ?')
        .run('completed', afterPath, JSON.stringify(safeResult), new Date().toISOString(), projectId);
      createProjectVersion(db, {
        projectId,
        kind: 'generation',
        parentVersionId: baselineVersion.id,
        beforeImagePath: currentPath,
        referenceImagePath: referencePath,
        floorMaterialImagePath: floorMaterialPath,
        wallMaterialImagePath: wallMaterialPath,
        objectMaterialImagePath: objectMaterialPath,
        objectMaskImagePath: objectMaskPath,
        resultAfterPath: afterPath,
        analysis: safeResult
      });
      const project = ownedProject(db, projectId, user.id);
      sendJson(res, 201, { data: { project: projectView(project), next: `/reports/${projectId}` } });
    } catch (error) {
      const failedAnalysis = { message: 'AI 분석을 완료하지 못했습니다.' };
      db.prepare('UPDATE projects SET status = ?, result_after_path = NULL, analysis_json = ?, updated_at = ? WHERE id = ?')
        .run('failed', JSON.stringify(failedAnalysis), new Date().toISOString(), projectId);
      createProjectVersion(db, {
        projectId,
        kind: 'generation',
        status: 'failed',
        parentVersionId: latestProjectVersion(db, projectId)?.id || baselineVersion.id,
        beforeImagePath: currentPath,
        referenceImagePath: referencePath,
        floorMaterialImagePath: floorMaterialPath,
        wallMaterialImagePath: wallMaterialPath,
        objectMaterialImagePath: objectMaterialPath,
        objectMaskImagePath: objectMaskPath,
        analysis: failedAnalysis
      });
      throw error;
    }
    return true;
  }

  const projectVersionsMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/versions$/);
  if (projectVersionsMatch && method === 'GET') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const project = ownedProject(db, projectVersionsMatch[1], user.id);
    if (!project) { sendError(res, 404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.'); return true; }
    const baseline = ensureProjectVersionHistory(db, project);
    const versions = db.prepare('SELECT * FROM project_versions WHERE project_id = ? ORDER BY version_number ASC').all(project.id);
    const active = [...versions].reverse().find((version) => version.status === 'completed') || versions.at(-1) || null;
    sendJson(res, 200, {
      data: {
        baselineVersionId: baseline.id,
        activeVersionId: active?.id || null,
        versions: versions.map((version) => projectVersionView(version, active?.id))
      }
    });
    return true;
  }

  const rollbackMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/rollback$/);
  if (rollbackMatch && method === 'POST') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const project = ownedProject(db, rollbackMatch[1], user.id);
    if (!project) { sendError(res, 404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.'); return true; }
    if (project.status === 'analyzing') { sendError(res, 409, 'PROJECT_ANALYZING', '분석이 완료된 뒤 롤백할 수 있습니다.'); return true; }
    const body = await readJson(req);
    const baseline = ensureProjectVersionHistory(db, project);
    const requestedVersionId = typeof body.versionId === 'string' ? body.versionId.trim() : '';
    const target = requestedVersionId
      ? db.prepare('SELECT * FROM project_versions WHERE id = ? AND project_id = ?').get(requestedVersionId, project.id)
      : baseline;
    if (!target) { sendError(res, 404, 'VERSION_NOT_FOUND', '복원할 버전을 찾을 수 없습니다.'); return true; }
    if (target.status !== 'completed') { sendError(res, 409, 'VERSION_NOT_READY', '완료된 버전만 복원할 수 있습니다.'); return true; }
    const restoredAfterPath = target.result_after_path || project.current_image_path;
    if (!restoredAfterPath || (!restoredAfterPath.startsWith('/assets/') && !fs.existsSync(restoredAfterPath))) {
      sendError(res, 409, 'VERSION_MEDIA_MISSING', '복원할 이미지 파일을 찾을 수 없습니다.');
      return true;
    }
    const isBaseline = target.id === baseline.id;
    const rollbackAnalysis = {
      provider: 'version-control',
      previewOnly: true,
      afterSource: isBaseline ? 'current' : 'version-snapshot',
      summary: isBaseline
        ? '원본 공간 스케치 기준점으로 되돌렸습니다. 이 기준에서 새 자재 조합을 다시 시뮬레이션할 수 있습니다.'
        : `버전 ${Number(target.version_number)} 결과로 복원했습니다.`,
      style: isBaseline ? '원본 스케치 복원' : `버전 ${Number(target.version_number)} 복원`,
      prompt: {
        version: 'moin-version-control-v1',
        inputMode: isBaseline ? 'rollback-baseline' : 'rollback-version',
        structuralLock: true,
        rollbackToVersion: Number(target.version_number)
      },
      transformation: {
        mode: 'version-rollback',
        geometryLocked: true,
        appearanceApplied: false,
        rollback: true
      }
    };
    const parentVersion = latestProjectVersion(db, project.id);
    const now = new Date().toISOString();
    db.prepare(`UPDATE projects
      SET status = ?, reference_image_path = ?, floor_material_image_path = ?, wall_material_image_path = ?, object_material_image_path = ?, object_mask_image_path = ?, result_after_path = ?, analysis_json = ?, updated_at = ?
      WHERE id = ?`)
      .run('completed', target.reference_image_path, target.floor_material_image_path, target.wall_material_image_path, target.object_material_image_path, target.object_mask_image_path, restoredAfterPath, JSON.stringify(rollbackAnalysis), now, project.id);
    const version = createProjectVersion(db, {
      projectId: project.id,
      kind: 'rollback',
      parentVersionId: parentVersion?.id || baseline.id,
      beforeImagePath: project.current_image_path,
      referenceImagePath: target.reference_image_path,
      floorMaterialImagePath: target.floor_material_image_path,
      wallMaterialImagePath: target.wall_material_image_path,
      objectMaterialImagePath: target.object_material_image_path,
      objectMaskImagePath: target.object_mask_image_path,
      resultAfterPath: restoredAfterPath,
      analysis: rollbackAnalysis,
      createdAt: now
    });
    const updatedProject = ownedProject(db, project.id, user.id);
    sendJson(res, 200, {
      data: {
        project: projectView(updatedProject),
        version: projectVersionView(version, version.id),
        next: `/reports/${project.id}`
      }
    });
    return true;
  }

  const versionAnalyzeMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/versions\/analyze$/);
  if (versionAnalyzeMatch && method === 'POST') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const project = ownedProject(db, versionAnalyzeMatch[1], user.id);
    if (!project) { sendError(res, 404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.'); return true; }
    if (project.status === 'analyzing') { sendError(res, 409, 'PROJECT_ANALYZING', '분석이 완료된 뒤 새 버전을 만들 수 있습니다.'); return true; }
    const maximum = Math.max(1, Number(ENV.AI_ANALYZE_LIMIT_PER_HOUR) || 20);
    if (!consumeHourlyLimit(analysisUsage, user.id, maximum)) {
      sendError(res, 429, 'ANALYSIS_LIMIT', '시간당 AI 분석 횟수를 초과했습니다. 잠시 뒤 다시 시도해주세요.');
      return true;
    }
    const body = await readJson(req);
    const materialMode = ['floorMaterialImage', 'wallMaterialImage', 'floorImage', 'wallImage'].some((key) => Object.hasOwn(body, key));
    const current = readStoredImage(project.current_image_path);
    let reference = null;
    let floorMaterial = null;
    let wallMaterial = null;
    if (materialMode) {
      const floorImage = body.floorMaterialImage || body.floorImage;
      const wallImage = body.wallMaterialImage || body.wallImage;
      if (!floorImage || !wallImage) {
        throw Object.assign(new Error('바닥재와 벽지 이미지를 각각 입력해주세요.'), { status: 400 });
      }
      floorMaterial = decodeImage(floorImage);
      wallMaterial = decodeImage(wallImage);
    } else {
      if (!body.referenceImage) {
        throw Object.assign(new Error('새 레퍼런스 이미지를 입력해주세요.'), { status: 400 });
      }
      reference = decodeImage(body.referenceImage);
    }
    const uploadsDir = path.join(dataDir, 'uploads');
    const generatedDir = path.join(dataDir, 'generated');
    const referencePath = reference ? writeImage(uploadsDir, reference) : null;
    const floorMaterialPath = floorMaterial ? writeImage(uploadsDir, floorMaterial) : null;
    const wallMaterialPath = wallMaterial ? writeImage(uploadsDir, wallMaterial) : null;
    const baseline = ensureProjectVersionHistory(db, project);
    const parentVersion = latestProjectVersion(db, project.id) || baseline;
    try {
      const result = await aiProvider.analyze({ current, reference, floorMaterial, wallMaterial });
      if (!result || typeof result !== 'object') throw new Error('AI provider returned an invalid result');
      if (result.afterPublicUrl) throw new Error('AI provider returned the deprecated public-image result contract');
      let afterPath = null;
      if (result.afterSource === 'current') {
        if (result.previewOnly !== true) throw new Error('Source previews must be explicitly marked previewOnly');
        afterPath = project.current_image_path;
      } else if (result.afterSource && result.afterSource !== 'generated') {
        throw new Error('AI provider returned an unsupported afterSource');
      }
      if (result.after?.base64) {
        if (afterPath) throw new Error('AI provider returned conflicting after-image sources');
        const afterImage = decodeImage(`data:${result.after.mimeType || 'image/png'};base64,${result.after.base64}`);
        afterPath = writeImage(generatedDir, afterImage);
      }
      if (!afterPath) throw new Error('AI provider did not return an after image or an explicit source preview');
      const safeResult = { ...result };
      delete safeResult.after;
      const now = new Date().toISOString();
      db.prepare(`UPDATE projects
        SET status = ?, reference_image_path = ?, floor_material_image_path = ?, wall_material_image_path = ?, object_material_image_path = NULL, object_mask_image_path = NULL, result_after_path = ?, analysis_json = ?, updated_at = ?
        WHERE id = ?`)
        .run('completed', referencePath, floorMaterialPath, wallMaterialPath, afterPath, JSON.stringify(safeResult), now, project.id);
      const version = createProjectVersion(db, {
        projectId: project.id,
        kind: 'generation',
        parentVersionId: parentVersion.id,
        beforeImagePath: project.current_image_path,
        referenceImagePath: referencePath,
        floorMaterialImagePath: floorMaterialPath,
        wallMaterialImagePath: wallMaterialPath,
        resultAfterPath: afterPath,
        analysis: safeResult,
        createdAt: now
      });
      const updatedProject = ownedProject(db, project.id, user.id);
      sendJson(res, 201, {
        data: {
          project: projectView(updatedProject),
          version: projectVersionView(version, version.id),
          next: `/reports/${project.id}`
        }
      });
    } catch (error) {
      const failedAnalysis = { message: '새 버전 분석을 완료하지 못했습니다.' };
      createProjectVersion(db, {
        projectId: project.id,
        kind: 'generation',
        status: 'failed',
        parentVersionId: parentVersion.id,
        beforeImagePath: project.current_image_path,
        referenceImagePath: referencePath,
        floorMaterialImagePath: floorMaterialPath,
        wallMaterialImagePath: wallMaterialPath,
        analysis: failedAnalysis
      });
      throw error;
    }
    return true;
  }

  const projectMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)$/);
  if (projectMatch && method === 'GET') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const project = ownedProject(db, projectMatch[1], user.id);
    if (!project) { sendError(res, 404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.'); return true; }
    sendJson(res, 200, { data: { project: projectView(project) } });
    return true;
  }

  if (projectMatch && method === 'DELETE') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const project = ownedProject(db, projectMatch[1], user.id);
    if (!project) { sendError(res, 404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.'); return true; }
    if (project.status === 'analyzing') {
      sendError(res, 409, 'PROJECT_ANALYZING', '분석이 완료된 뒤 삭제할 수 있습니다.');
      return true;
    }

    const versionPaths = db.prepare('SELECT before_image_path, reference_image_path, floor_material_image_path, wall_material_image_path, object_material_image_path, object_mask_image_path, result_after_path FROM project_versions WHERE project_id = ?')
      .all(project.id)
      .flatMap(versionMediaPaths);
    const mediaPaths = [
      project.current_image_path,
      project.reference_image_path,
      project.floor_material_image_path,
      project.wall_material_image_path,
      project.object_material_image_path,
      project.object_mask_image_path,
      project.result_after_path,
      ...versionPaths
    ];
    db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(project.id, user.id);
    removeUnreferencedProjectMedia(db, dataDir, mediaPaths);
    sendJson(res, 200, { data: { id: project.id, deleted: true } });
    return true;
  }

  const saveMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/save$/);
  if (saveMatch && method === 'POST') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const project = ownedProject(db, saveMatch[1], user.id);
    if (!project) { sendError(res, 404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.'); return true; }
    db.prepare('UPDATE projects SET status = ?, updated_at = ? WHERE id = ?').run('saved', new Date().toISOString(), project.id);
    sendJson(res, 200, { data: { project: projectView(ownedProject(db, project.id, user.id)) } });
    return true;
  }

  const mediaMatch = pathname.match(/^\/api\/v1\/projects\/([^/]+)\/media\/(current|reference|floor|wall|object-material|mask|after)$/);
  if (mediaMatch && method === 'GET') {
    const user = requireUser(db, req, res);
    if (!user) return true;
    const project = ownedProject(db, mediaMatch[1], user.id);
    if (!project) { sendError(res, 404, 'PROJECT_NOT_FOUND', '프로젝트를 찾을 수 없습니다.'); return true; }
    const key = {
      current: 'current_image_path',
      reference: 'reference_image_path',
      floor: 'floor_material_image_path',
      wall: 'wall_material_image_path',
      'object-material': 'object_material_image_path',
      mask: 'object_mask_image_path',
      after: 'result_after_path'
    }[mediaMatch[2]];
    const filename = project[key];
    if (!filename || filename.startsWith('/assets/') || !fs.existsSync(filename)) {
      sendError(res, 404, 'IMAGE_NOT_FOUND', '이미지를 찾을 수 없습니다.');
      return true;
    }
    const type = MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
    const stat = fs.statSync(filename);
    res.writeHead(200, { ...securityHeaders(), 'content-type': type, 'content-length': stat.size, 'cache-control': 'private, max-age=60' });
    fs.createReadStream(filename).pipe(res);
    return true;
  }

  return false;
}

function serveStatic(req, res, pathname) {
  let requested = pathname === '/' ? '/index.html' : pathname;
  try { requested = decodeURIComponent(requested); } catch { requested = '/index.html'; }
  const candidate = path.resolve(PUBLIC_DIR, `.${requested}`);
  const relative = path.relative(PUBLIC_DIR, candidate);
  let insidePublic = relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  if (insidePublic && fs.existsSync(candidate)) {
    const realPublic = fs.realpathSync(PUBLIC_DIR);
    const realCandidate = fs.realpathSync(candidate);
    const realRelative = path.relative(realPublic, realCandidate);
    insidePublic = realRelative !== '..' && !realRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(realRelative);
  }
  let filename = insidePublic && fs.existsSync(candidate) && fs.statSync(candidate).isFile()
    ? candidate
    : path.join(PUBLIC_DIR, 'index.html');
  if (!insidePublic && requested !== '/index.html') {
    sendError(res, 403, 'FORBIDDEN_PATH', '허용되지 않은 경로입니다.');
    return;
  }
  const stat = fs.statSync(filename);
  const type = MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  const cache = filename.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { ...securityHeaders(), 'content-type': type, 'content-length': stat.size, 'cache-control': cache });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(filename).pipe(res);
}

export function createMoinServer(options = {}) {
  loadLocalEnv();
  const dataDir = path.resolve(options.dataDir || path.join(ROOT, 'data'));
  const dbPath = path.resolve(options.dbPath || ENV.DB_PATH || path.join(dataDir, 'moin.sqlite'));
  const demoAuthEnabled = ENV.NODE_ENV !== 'production' || ENV.ENABLE_DEMO_AUTH === 'true';
  const db = options.db || openDatabase(dbPath, { seedDemo: demoAuthEnabled });
  const aiProvider = options.aiProvider || createAiProvider(ENV);
  const analysisUsage = new Map();
  const server = http.createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    res.setHeader('x-request-id', requestId);
    try {
      const url = new URL(req.url || '/', 'http://localhost');
      if (url.pathname.startsWith('/api/')) {
        const handled = await handleApi({ req, res, url, db, aiProvider, dataDir, analysisUsage });
        if (!handled) sendError(res, 404, 'NOT_FOUND', '요청한 API를 찾을 수 없습니다.');
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method || 'GET')) {
        sendError(res, 405, 'METHOD_NOT_ALLOWED', '허용되지 않은 요청입니다.');
        return;
      }
      serveStatic(req, res, url.pathname);
    } catch (error) {
      if (!res.headersSent) {
        const status = error.status || 500;
        const message = status >= 500 ? '요청을 처리하는 중 문제가 발생했습니다.' : error.message;
        const code = status >= 500
          ? 'INTERNAL_ERROR'
          : error.code === 'GEMINI_QUOTA_EXCEEDED'
            ? 'GEMINI_QUOTA_EXCEEDED'
            : 'BAD_REQUEST';
        sendError(res, status, code, message);
      } else res.end();
      if ((error.status || 500) >= 500) console.error(`[${requestId}]`, error);
    }
  });
  server.once('close', () => { if (!options.db) closeDatabase(db); });
  server.moin = { db, aiProvider, dataDir };
  return server;
}

const runtimeProcess = globalThis.process;
const isMain = runtimeProcess?.argv?.[1] && path.resolve(runtimeProcess.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = createMoinServer();
  const port = Number(ENV.PORT || 4173);
  const host = ENV.HOST || '127.0.0.1';
  server.listen(port, host, () => {
    console.log(`Moin is ready at http://${host}:${port}`);
    console.log(`SQLite: ${server.moin.db ? 'connected' : 'unavailable'} | AI: ${server.moin.aiProvider.constructor.name}`);
  });
}
