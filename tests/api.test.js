import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createMoinServer } from '../src/server.js';
import { closeDatabase, openDatabase } from '../src/database.js';
import { createSessionToken, hashToken } from '../src/security.js';

const testRoot = path.resolve('data', `test-${process.pid}-${Date.now()}`);
const dbPath = path.join(testRoot, 'moin.sqlite');
const onePixelPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlS8AAAAASUVORK5CYII=';
let server;
let baseUrl;
let cookie = '';
let failNextAnalysis = false;
let quotaNextAnalysis = false;

const immediateAi = {
  async analyze({ objectMaterial, mask, targetObject, targetMaterials } = {}) {
    if (quotaNextAnalysis) {
      quotaNextAnalysis = false;
      const error = new Error('Gemini 이미지 생성 할당량이 부족합니다. Google AI Studio에서 결제와 할당량을 확인한 뒤 다시 시도해주세요.');
      error.status = 429;
      error.code = 'GEMINI_QUOTA_EXCEEDED';
      throw error;
    }
    if (failNextAnalysis) {
      failNextAnalysis = false;
      throw new Error('deliberate provider failure');
    }
    const targetMaterialMode = Array.isArray(targetMaterials) && targetMaterials.length > 0;
    const objectMode = Boolean(objectMaterial || mask || targetObject);
    return {
      provider: 'test',
      previewOnly: true,
      afterSource: 'current',
      summary: '테스트 분석',
      style: '내추럴',
      palette: ['화이트', '오크', '세이지'],
      recommendedSlugs: ['premium-wallpaper'],
      estimate: { total: 2520000, savingsRate: 92 },
      ...(targetMaterialMode ? {
        prompt: {
          version: 'moin-target-material-transfer-v1',
          inputMode: 'target-materials-space',
          targetMaterials: targetMaterials.map(({ target, mask: targetMask }) => ({ target, mask: Boolean(targetMask) })),
          structuralLock: true
        },
        transformation: {
          mode: 'target-materials-appearance-transfer',
          geometryLocked: true,
          maskLocked: targetMaterials.every(({ mask: targetMask }) => Boolean(targetMask)),
          appearanceApplied: true
        }
      } : objectMode ? {
        prompt: {
          version: 'moin-object-aware-inpainting-v1',
          inputMode: 'object-mask-material',
          targetObject,
          structuralLock: true
        },
        transformation: {
          mode: 'object-mask-source-preview',
          geometryLocked: true,
          maskLocked: true,
          appearanceApplied: false
        }
      } : {})
    };
  }
};

async function request(pathname, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (auth && cookie) headers.cookie = cookie;
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'manual'
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* static and image responses */ }
  return { response, text, json };
}

before(async () => {
  fs.mkdirSync(testRoot, { recursive: true });
  server = createMoinServer({ dbPath, dataDir: testRoot, aiProvider: immediateAi });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(testRoot, { recursive: true, force: true });
});

test('health and SPA shell are served with security headers', async () => {
  const health = await request('/api/health', { auth: false });
  assert.equal(health.response.status, 200);
  assert.equal(health.json.data.database, 'sqlite');
  assert.equal(health.json.data.ai, 'Object');

  const page = await request('/market', { auth: false });
  assert.equal(page.response.status, 200);
  assert.match(page.text, /id="app"/);
  assert.match(page.response.headers.get('content-security-policy'), /default-src 'self'/);
});

test('protected APIs reject anonymous requests', async () => {
  const result = await request('/api/v1/projects', { auth: false });
  assert.equal(result.response.status, 401);
  assert.equal(result.json.error.code, 'AUTH_REQUIRED');

  const objectGenerate = await request('/api/v1/generate/object-material', {
    method: 'POST',
    auth: false,
    body: { sourceImage: onePixelPng, materialImage: onePixelPng, maskImage: onePixelPng, targetObject: 'sofa' }
  });
  assert.equal(objectGenerate.response.status, 401);
});

test('signup validates, creates an account, and login starts an HttpOnly session', async () => {
  const anonymousStart = await request('/api/v1/landing/start', { auth: false });
  assert.equal(anonymousStart.response.status, 200);
  assert.equal(anonymousStart.json.data.authenticated, false);
  assert.equal(anonymousStart.json.data.next, '/login');

  const primitive = await request('/api/v1/auth/signup', { method: 'POST', auth: false, body: null });
  assert.equal(primitive.response.status, 400);

  const invalid = await request('/api/v1/auth/signup', {
    method: 'POST', auth: false, body: { name: 'A', email: 'bad', password: 'short', terms: false }
  });
  assert.equal(invalid.response.status, 400);
  assert.ok(invalid.json.error.fieldErrors.email);

  const signup = await request('/api/v1/auth/signup', {
    method: 'POST', auth: false, body: { name: '테스터', email: 'test@moin.local', password: 'password123!', terms: true }
  });
  assert.equal(signup.response.status, 201);
  assert.equal(signup.json.data.next, '/login');

  const wrong = await request('/api/v1/auth/login', {
    method: 'POST', auth: false, body: { email: 'test@moin.local', password: 'wrong' }
  });
  assert.equal(wrong.response.status, 401);

  const login = await request('/api/v1/auth/login', {
    method: 'POST', auth: false, body: { email: 'TEST@moin.local', password: 'password123!' }
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.json.data.next, '/dashboard');
  const setCookie = login.response.headers.get('set-cookie');
  assert.match(setCookie, /moin_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(setCookie, /Max-Age/i);
  cookie = setCookie.split(';')[0];

  const me = await request('/api/v1/auth/me');
  assert.equal(me.json.data.user.name, '테스터');

  const authenticatedStart = await request('/api/v1/landing/start');
  assert.equal(authenticatedStart.response.status, 200);
  assert.equal(authenticatedStart.json.data.authenticated, true);
  assert.equal(authenticatedStart.json.data.next, '/dashboard');
});

test('malformed cookies are ignored instead of causing a server error', async () => {
  const response = await fetch(`${baseUrl}/api/v1/auth/me`, { headers: { cookie: 'moin_session=%' } });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data.user, null);
});

test('catalog filtering and persisted cart work', async () => {
  const catalog = await request('/api/v1/materials?category=wallpaper&maxPrice=500000');
  assert.equal(catalog.response.status, 200);
  assert.ok(catalog.json.data.materials.length >= 2);
  assert.ok(catalog.json.data.materials.every((item) => item.category === 'wallpaper'));
  assert.ok(catalog.json.data.materials.every((item) => item.imageUrl.endsWith('.webp')));

  const materialId = catalog.json.data.materials[0].id;
  const add = await request('/api/v1/cart', { method: 'POST', body: { materialId } });
  assert.equal(add.response.status, 200);
  assert.equal(add.json.data.items.length, 1);

  const cart = await request('/api/v1/cart');
  assert.equal(cart.json.data.items[0].material.id, materialId);
  assert.ok(cart.json.data.total > 0);
});

test('cart quantities are bounded and PATCH preserves omitted fields', async () => {
  const cart = await request('/api/v1/cart');
  const item = cart.json.data.items[0];
  const invalid = await request('/api/v1/cart', { method: 'POST', body: { materialId: item.material.id, quantity: 1000000000 } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.json.error.code, 'INVALID_QUANTITY');

  const deselected = await request(`/api/v1/cart/items/${item.cartId}`, { method: 'PATCH', body: { selected: false } });
  assert.equal(deselected.json.data.items[0].quantity, item.quantity);
  assert.equal(deselected.json.data.items[0].selected, false);

  const resized = await request(`/api/v1/cart/items/${item.cartId}`, { method: 'PATCH', body: { quantity: 2 } });
  assert.equal(resized.json.data.items[0].quantity, 2);
  assert.equal(resized.json.data.items[0].selected, false);
  await request(`/api/v1/cart/items/${item.cartId}`, { method: 'PATCH', body: { selected: true } });
});

test('two-image AI analysis persists a project and protects uploaded media', async () => {
  const analyze = await request('/api/v1/projects/analyze', {
    method: 'POST', body: { currentImage: onePixelPng, referenceImage: onePixelPng }
  });
  assert.equal(analyze.response.status, 201);
  assert.equal(analyze.json.data.project.status, 'completed');
  assert.equal(analyze.json.data.project.analysis.provider, 'test');
  const projectId = analyze.json.data.project.id;

  const project = await request(`/api/v1/projects/${projectId}`);
  assert.equal(project.response.status, 200);
  assert.match(project.json.data.project.beforeUrl, /media\/current$/);
  assert.match(project.json.data.project.afterUrl, /media\/after$/);

  const media = await request(`/api/v1/projects/${projectId}/media/current`);
  assert.equal(media.response.status, 200);
  assert.equal(media.response.headers.get('content-type'), 'image/png');

  const anonymousMedia = await request(`/api/v1/projects/${projectId}/media/current`, { auth: false });
  assert.equal(anonymousMedia.response.status, 401);

  const saved = await request(`/api/v1/projects/${projectId}/save`, { method: 'POST', body: {} });
  assert.equal(saved.json.data.project.status, 'saved');
  const projects = await request('/api/v1/projects');
  assert.equal(projects.json.data.projects.length, 1);
});

test('project version history rolls back to the immutable source and regenerates a child version', async () => {
  const created = await request('/api/v1/projects/analyze', {
    method: 'POST',
    body: { currentImage: onePixelPng, referenceImage: onePixelPng }
  });
  assert.equal(created.response.status, 201);
  const projectId = created.json.data.project.id;
  const original = server.moin.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  assert.ok(original.current_image_path);

  const history = await request(`/api/v1/projects/${projectId}/versions`);
  assert.equal(history.response.status, 200);
  assert.equal(history.json.data.versions.length, 2);
  const baseline = history.json.data.versions.find((version) => version.kind === 'baseline');
  const initialGeneration = history.json.data.versions.find((version) => version.kind === 'generation');
  assert.ok(baseline);
  assert.ok(initialGeneration);
  assert.equal(baseline.versionNumber, 0);
  assert.equal(initialGeneration.isActive, true);

  const rollback = await request(`/api/v1/projects/${projectId}/rollback`, {
    method: 'POST',
    body: { versionId: baseline.id }
  });
  assert.equal(rollback.response.status, 200);
  assert.equal(rollback.json.data.version.kind, 'rollback');
  assert.equal(rollback.json.data.project.analysis.provider, 'version-control');
  const rolledBack = server.moin.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  assert.equal(rolledBack.current_image_path, original.current_image_path);
  assert.equal(rolledBack.result_after_path, original.current_image_path);

  const reanalyzed = await request(`/api/v1/projects/${projectId}/versions/analyze`, {
    method: 'POST',
    body: { referenceImage: onePixelPng }
  });
  assert.equal(reanalyzed.response.status, 201);
  assert.equal(reanalyzed.json.data.project.id, projectId);
  assert.equal(reanalyzed.json.data.version.kind, 'generation');
  const regenerated = server.moin.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  assert.equal(regenerated.current_image_path, original.current_image_path);

  const updatedHistory = await request(`/api/v1/projects/${projectId}/versions`);
  assert.equal(updatedHistory.response.status, 200);
  assert.equal(updatedHistory.json.data.versions.length, 4);
  assert.equal(updatedHistory.json.data.versions.at(-1).isActive, true);

  const versionFiles = server.moin.db.prepare(`
    SELECT before_image_path, reference_image_path, floor_material_image_path, wall_material_image_path,
           object_material_image_path, object_mask_image_path, result_after_path
    FROM project_versions WHERE project_id = ?
  `).all(projectId).flatMap((version) => Object.values(version).filter(Boolean));
  const managedFiles = [...new Set(versionFiles.filter((filename) => !filename.startsWith('/assets/')))];
  assert.ok(managedFiles.every((filename) => fs.existsSync(filename)));
  const deleted = await request(`/api/v1/projects/${projectId}`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  assert.equal(server.moin.db.prepare('SELECT COUNT(*) AS count FROM project_versions WHERE project_id = ?').get(projectId).count, 0);
  assert.ok(managedFiles.every((filename) => !fs.existsSync(filename)));
});

test('three-image inpainting generation persists floor, wall, and space inputs', async () => {
  const generated = await request('/api/v1/generate', {
    method: 'POST',
    body: {
      floorMaterialImage: onePixelPng,
      wallMaterialImage: onePixelPng,
      spaceImage: onePixelPng
    }
  });
  assert.equal(generated.response.status, 201);
  assert.equal(generated.json.data.project.status, 'completed');
  const projectId = generated.json.data.project.id;
  assert.match(generated.json.data.project.floorMaterialUrl, /media\/floor$/);
  assert.match(generated.json.data.project.wallMaterialUrl, /media\/wall$/);

  const stored = server.moin.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  assert.ok(stored.floor_material_image_path);
  assert.ok(stored.wall_material_image_path);
  assert.equal(stored.reference_image_path, null);
  assert.equal(fs.existsSync(stored.floor_material_image_path), true);
  assert.equal(fs.existsSync(stored.wall_material_image_path), true);

  const floor = await request('/api/v1/projects/' + projectId + '/media/floor');
  const wall = await request('/api/v1/projects/' + projectId + '/media/wall');
  assert.equal(floor.response.status, 200);
  assert.equal(wall.response.status, 200);
  assert.equal(floor.response.headers.get('content-type'), 'image/png');
  assert.equal(wall.response.headers.get('content-type'), 'image/png');

  const incomplete = await request('/api/v1/generate', {
    method: 'POST',
    body: { spaceImage: onePixelPng }
  });
  assert.equal(incomplete.response.status, 400);
});

test('object material generation persists a same-size binary mask and target metadata', async () => {
  const generated = await request('/api/v1/generate/object-material', {
    method: 'POST',
    body: {
      sourceImage: onePixelPng,
      materialImage: onePixelPng,
      maskImage: onePixelPng,
      targetObject: 'sofa'
    }
  });
  assert.equal(generated.response.status, 201);
  assert.equal(generated.json.data.project.status, 'completed');
  assert.match(generated.json.data.project.objectMaterialUrl, /media\/object-material$/);
  assert.match(generated.json.data.project.objectMaskUrl, /media\/mask$/);
  assert.equal(generated.json.data.project.analysis.prompt.inputMode, 'object-mask-material');
  assert.equal(generated.json.data.project.analysis.prompt.targetObject, 'sofa');

  const projectId = generated.json.data.project.id;
  const stored = server.moin.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  assert.ok(stored.object_material_image_path);
  assert.ok(stored.object_mask_image_path);
  assert.equal(fs.existsSync(stored.object_material_image_path), true);
  assert.equal(fs.existsSync(stored.object_mask_image_path), true);

  const material = await request(`/api/v1/projects/${projectId}/media/object-material`);
  const mask = await request(`/api/v1/projects/${projectId}/media/mask`);
  assert.equal(material.response.status, 200);
  assert.equal(mask.response.status, 200);
  assert.equal(mask.response.headers.get('content-type'), 'image/png');

  const mismatchedPng = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(mismatchedPng);
  mismatchedPng.writeUInt32BE(2, 16);
  mismatchedPng.writeUInt32BE(1, 20);
  const wrongSize = await request('/api/v1/generate/object-material', {
    method: 'POST',
    body: {
      sourceImage: onePixelPng,
      materialImage: onePixelPng,
      maskImage: `data:image/png;base64,${mismatchedPng.toString('base64')}`,
      targetObject: 'sofa'
    }
  });
  assert.equal(wrongSize.response.status, 400);

  const incomplete = await request('/api/v1/generate/object-material', {
    method: 'POST',
    body: { sourceImage: onePixelPng, materialImage: onePixelPng, targetObject: 'sofa' }
  });
  assert.equal(incomplete.response.status, 400);

  const noTarget = await request('/api/v1/generate/object-material', {
    method: 'POST',
    body: { sourceImage: onePixelPng, materialImage: onePixelPng, maskImage: onePixelPng }
  });
  assert.equal(noTarget.response.status, 400);

  const deleted = await request(`/api/v1/projects/${projectId}`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  assert.equal(fs.existsSync(stored.object_material_image_path), false);
  assert.equal(fs.existsSync(stored.object_mask_image_path), false);
});

test('GET analyze endpoint is not mistaken for a project id', async () => {
  const result = await request('/api/v1/projects/analyze');
  assert.equal(result.response.status, 405);
  assert.equal(result.json.error.code, 'METHOD_NOT_ALLOWED');
});

test('target material generation persists one mask per selected target', async () => {
  const generated = await request('/api/v1/projects/analyze', {
    method: 'POST',
    body: {
      currentImage: onePixelPng,
      materialAssignments: [
        { target: 'ceiling', image: onePixelPng, mask: onePixelPng, selection: { x: 0, y: 0, width: 1, height: 0.2, unit: 'normalized' } },
        { target: 'floor', image: onePixelPng, mask: onePixelPng, selection: { x: 0, y: 0.8, width: 1, height: 0.2, unit: 'normalized' } }
      ]
    }
  });
  assert.equal(generated.response.status, 201);
  const project = generated.json.data.project;
  assert.equal(project.analysis.prompt.inputMode, 'target-materials-space');
  assert.deepEqual(project.analysis.prompt.targetMaterials, [
    { target: 'ceiling', mask: true },
    { target: 'floor', mask: true }
  ]);
  assert.equal(project.analysis.transformation.maskLocked, true);
  const stored = server.moin.db.prepare('SELECT analysis_json FROM projects WHERE id = ?').get(project.id);
  const analysis = JSON.parse(stored.analysis_json);
  assert.equal(analysis.materialInputPaths.length, 4);
  assert.ok(analysis.materialInputPaths.every((filename) => fs.existsSync(filename)));

  const composited = await request(`/api/v1/projects/${project.id}/after`, {
    method: 'POST',
    body: { afterImage: onePixelPng }
  });
  assert.equal(composited.response.status, 200);
  assert.equal(composited.json.data.project.analysis.transformation.clientComposite, true);

  const deleted = await request(`/api/v1/projects/${project.id}`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  assert.ok(analysis.materialInputPaths.every((filename) => !fs.existsSync(filename)));
});

test('target material generation accepts a partial material swatch mask', async () => {
  const generated = await request('/api/v1/projects/analyze', {
    method: 'POST',
    body: {
      currentImage: onePixelPng,
      materialAssignments: [
        {
          target: 'floor',
          image: onePixelPng,
          mask: onePixelPng,
          materialMask: onePixelPng,
          selection: { x: 0, y: 0.8, width: 1, height: 0.2, mode: 'magic-wand', unit: 'normalized' }
        }
      ]
    }
  });
  assert.equal(generated.response.status, 201);
  const project = generated.json.data.project;
  assert.equal(project.analysis.targetMaterials[0].maskApplied, true);
  assert.equal(project.analysis.targetMaterials[0].materialMaskApplied, true);
  const stored = server.moin.db.prepare('SELECT analysis_json FROM projects WHERE id = ?').get(project.id);
  const analysis = JSON.parse(stored.analysis_json);
  assert.equal(analysis.materialInputPaths.length, 3);
  assert.ok(analysis.materialInputPaths.every((filename) => fs.existsSync(filename)));
});

test('deleting an owned project removes its record and managed uploaded media', async () => {
  const analyze = await request('/api/v1/projects/analyze', {
    method: 'POST', body: { currentImage: onePixelPng, referenceImage: onePixelPng }
  });
  assert.equal(analyze.response.status, 201);
  const projectId = analyze.json.data.project.id;
  const stored = server.moin.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
  assert.ok(stored);

  const mediaPaths = [...new Set([
    stored.current_image_path,
    stored.reference_image_path,
    stored.result_after_path
  ].filter(Boolean))];
  assert.ok(mediaPaths.length >= 2);
  for (const mediaPath of mediaPaths) assert.equal(fs.existsSync(mediaPath), true);

  const anonymousDelete = await request(`/api/v1/projects/${projectId}`, { method: 'DELETE', auth: false });
  assert.equal(anonymousDelete.response.status, 401);
  for (const mediaPath of mediaPaths) assert.equal(fs.existsSync(mediaPath), true);

  const deleted = await request(`/api/v1/projects/${projectId}`, { method: 'DELETE' });
  assert.equal(deleted.response.status, 200);
  assert.equal(deleted.json.data.id, projectId);
  assert.equal(deleted.json.data.deleted, true);
  assert.equal(server.moin.db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId), undefined);
  for (const mediaPath of mediaPaths) assert.equal(fs.existsSync(mediaPath), false);

  const missingProject = await request(`/api/v1/projects/${projectId}`);
  assert.equal(missingProject.response.status, 404);
  const missingMedia = await request(`/api/v1/projects/${projectId}/media/current`);
  assert.equal(missingMedia.response.status, 404);
});

test('failed AI analysis preserves both uploads and exposes no after image', async () => {
  failNextAnalysis = true;
  const result = await request('/api/v1/projects/analyze', {
    method: 'POST', body: { currentImage: onePixelPng, referenceImage: onePixelPng }
  });
  assert.equal(result.response.status, 500);

  const failed = server.moin.db.prepare("SELECT * FROM projects WHERE status = 'failed' ORDER BY created_at DESC LIMIT 1").get();
  assert.ok(failed);
  assert.ok(failed.current_image_path);
  assert.ok(failed.reference_image_path);
  assert.equal(failed.result_after_path, null);
  assert.equal(fs.existsSync(failed.current_image_path), true);
  assert.equal(fs.existsSync(failed.reference_image_path), true);

  const project = await request(`/api/v1/projects/${failed.id}`);
  assert.match(project.json.data.project.beforeUrl, /media\/current$/);
  assert.equal(project.json.data.project.afterUrl, null);
  const reference = await request(`/api/v1/projects/${failed.id}/media/reference`);
  assert.equal(reference.response.status, 200);
});

test('Gemini image quota errors return an actionable API response', async () => {
  quotaNextAnalysis = true;
  const result = await request('/api/v1/projects/analyze', {
    method: 'POST', body: { currentImage: onePixelPng, referenceImage: onePixelPng }
  });
  assert.equal(result.response.status, 429);
  assert.equal(result.json.error.code, 'GEMINI_QUOTA_EXCEEDED');
  assert.match(result.json.error.message, /할당량/);
  assert.match(result.json.error.message, /결제/);
});

test('two maximum-sized images fit the Base64 JSON request allowance', async () => {
  const original = Buffer.from(onePixelPng.split(',')[1], 'base64');
  const padded = Buffer.concat([original, Buffer.alloc(8 * 1024 * 1024 - original.length)]).toString('base64');
  const dataUrl = `data:image/png;base64,${padded}`;
  const result = await request('/api/v1/projects/analyze', {
    method: 'POST', body: { currentImage: dataUrl, referenceImage: dataUrl }
  });
  assert.equal(result.response.status, 201);
});

test('three maximum-sized inpainting images fit the Base64 JSON request allowance', async () => {
  const original = Buffer.from(onePixelPng.split(',')[1], 'base64');
  const padded = Buffer.concat([original, Buffer.alloc(8 * 1024 * 1024 - original.length)]).toString('base64');
  const dataUrl = 'data:image/png;base64,' + padded;
  const result = await request('/api/v1/generate', {
    method: 'POST',
    body: {
      floorMaterialImage: dataUrl,
      wallMaterialImage: dataUrl,
      spaceImage: dataUrl
    }
  });
  assert.equal(result.response.status, 201);
});

test('oversized JSON receives a structured 413 response', async () => {
  const response = await fetch(`${baseUrl}/api/v1/projects/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ padding: 'x'.repeat(37 * 1024 * 1024) })
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).error.code, 'BAD_REQUEST');
});

test('demo checkout creates an order and clears selected cart items', async () => {
  const order = await request('/api/v1/orders', { method: 'POST', body: {} });
  assert.equal(order.response.status, 201);
  assert.equal(order.json.data.order.status, 'demo_completed');
  assert.ok(order.json.data.order.total > 0);
  const cart = await request('/api/v1/cart');
  assert.equal(cart.json.data.items.length, 0);
});

test('logout invalidates the session', async () => {
  const logout = await request('/api/v1/auth/logout', { method: 'POST', body: {} });
  assert.equal(logout.response.status, 200);
  const projects = await request('/api/v1/projects');
  assert.equal(projects.response.status, 401);
});

test('production blocks both demo endpoint and known demo credentials', async () => {
  const prodRoot = path.resolve('data', `prod-test-${process.pid}-${Date.now()}`);
  const prodDbPath = path.join(prodRoot, 'moin.sqlite');
  fs.mkdirSync(prodRoot, { recursive: true });
  const seeded = openDatabase(prodDbPath, { seedDemo: true });
  const demoUser = seeded.prepare('SELECT id FROM users WHERE email = ?').get('demo@moin.local');
  const oldSessionToken = createSessionToken();
  const now = new Date();
  seeded.prepare('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(hashToken(oldSessionToken), demoUser.id, new Date(now.getTime() + 86400000).toISOString(), now.toISOString());
  closeDatabase(seeded);
  const previousNodeEnv = process.env.NODE_ENV;
  const previousDemoAuth = process.env.ENABLE_DEMO_AUTH;
  process.env.NODE_ENV = 'production';
  process.env.ENABLE_DEMO_AUTH = 'false';
  const prodServer = createMoinServer({ dbPath: prodDbPath, dataDir: prodRoot, aiProvider: immediateAi });
  await new Promise((resolve) => prodServer.listen(0, '127.0.0.1', resolve));
  const prodBase = `http://127.0.0.1:${prodServer.address().port}`;
  try {
    const shortcut = await fetch(`${prodBase}/api/v1/auth/demo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(shortcut.status, 403);
    const credentials = await fetch(`${prodBase}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'demo@moin.local', password: 'moin1234!' })
    });
    assert.equal(credentials.status, 403);
    const existingSession = await fetch(`${prodBase}/api/v1/auth/me`, { headers: { cookie: `moin_session=${oldSessionToken}` } });
    assert.equal(existingSession.status, 200);
    assert.equal((await existingSession.json()).data.user, null);
  } finally {
    await new Promise((resolve) => prodServer.close(resolve));
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
    if (previousDemoAuth === undefined) delete process.env.ENABLE_DEMO_AUTH; else process.env.ENABLE_DEMO_AUTH = previousDemoAuth;
    fs.rmSync(prodRoot, { recursive: true, force: true });
  }
});
