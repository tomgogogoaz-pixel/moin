import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAiProvider,
  GeminiAiProvider,
  MockAiProvider,
  MOIN_INTERIOR_INPAINTING_PROMPT_VERSION,
  MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT,
  MOIN_OBJECT_AWARE_INPAINTING_PROMPT_VERSION,
  MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT,
  MOIN_TARGET_MATERIALS_PROMPT_VERSION,
  MOIN_TARGET_MATERIALS_SYSTEM_PROMPT,
  pickNearestAspectRatio
} from '../src/services/ai.js';

const onePixelBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9WlS8AAAAASUVORK5CYII=';
const finalPixelBase64 = Buffer.concat([Buffer.from(onePixelBase64, 'base64'), Buffer.from([0])]).toString('base64');


test('mock AI remains the explicit local default', () => {
  assert.equal(createAiProvider({}).constructor.name, 'MockAiProvider');
  assert.equal(createAiProvider({ AI_PROVIDER: 'mock' }).constructor.name, 'MockAiProvider');
});

test('interior inpainting system prompt fixes structural, floor, and wall responsibilities', () => {
  assert.match(MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT, /STRUCTURAL FIDELITY/);
  assert.match(MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT, /Input 1 is the FLOOR MATERIAL SWATCH/);
  assert.match(MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT, /Input 2 is the WALL MATERIAL SWATCH/);
  assert.match(MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT, /Input 3 is the SPACE SKELETON/);
  assert.match(MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT, /Do not add, remove, move, rotate, resize, replace, or restage/);
  assert.equal(MOIN_INTERIOR_INPAINTING_PROMPT_VERSION, 'moin-interior-inpainting-v2');
  assert.match(MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT, /VERSION CONTROL AND ROLLBACK/);
  assert.match(MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT, /The server, not the model, owns version history/);
});

test('object-aware inpainting prompt treats the mask as a maximum ROI and preserves occlusion', () => {
  assert.equal(MOIN_OBJECT_AWARE_INPAINTING_PROMPT_VERSION, 'moin-object-aware-inpainting-v2');
  assert.match(MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT, /Input A is the absolute structural skeleton/);
  assert.match(MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT, /maximum editable ROI/);
  assert.match(MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT, /black pixels are immutable background/);
  assert.match(MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT, /objects in front.*source-locked/);
  assert.match(MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT, /visible silhouette/);
  assert.match(MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT, /DIY value gauges/);
});

test('multi-material prompt preserves foreground occluders inside broad surface ROIs', () => {
  assert.equal(MOIN_TARGET_MATERIALS_PROMPT_VERSION, 'moin-target-material-transfer-v2');
  assert.match(MOIN_TARGET_MATERIALS_SYSTEM_PROMPT, /maximum editable ROI/);
  assert.match(MOIN_TARGET_MATERIALS_SYSTEM_PROMPT, /Preserve all foreground occluders/);
  assert.match(MOIN_TARGET_MATERIALS_SYSTEM_PROMPT, /edit only the visible target silhouette/);
});

test('explicit Gemini mode fails fast when server configuration is incomplete', () => {
  assert.throws(
    () => createAiProvider({ AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'key-only' }),
    /GEMINI_TEXT_MODEL, GEMINI_IMAGE_MODEL/
  );
});

test('unknown AI providers fail fast', () => {
  assert.throws(() => createAiProvider({ AI_PROVIDER: 'unexpected' }), /Unsupported AI_PROVIDER/);
});

test('Gemini quota errors preserve the HTTP status and a recoverable Korean message', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { message: 'quota exhausted' }
  }), { status: 429, headers: { 'content-type': 'application/json' } });
  try {
    const provider = new GeminiAiProvider({ apiKey: 'test', textModel: 'text-model', imageModel: 'image-model' });
    await assert.rejects(
      provider.callModel('image-model', [{ text: 'test' }], { responseModalities: ['IMAGE'] }),
      (error) => error.status === 429
        && error.code === 'GEMINI_QUOTA_EXCEEDED'
        && /Gemini 이미지 생성 할당량/.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini transient 503 errors retry before succeeding', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls < 3) {
      return new Response(JSON.stringify({ error: { message: 'high demand' } }), {
        status: 503,
        headers: { 'content-type': 'application/json', 'retry-after': '0' }
      });
    }
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
  try {
    const provider = new GeminiAiProvider({
      apiKey: 'test',
      textModel: 'text-model',
      imageModel: 'image-model',
      retryAttempts: 3,
      retryBaseMs: 1,
      retryMaxMs: 1
    });
    const result = await provider.callModel('image-model', [{ text: 'test' }], { responseModalities: ['IMAGE'] });
    assert.equal(calls, 3);
    assert.equal(result.candidates[0].content.parts[0].text, 'ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('mock AI returns an explicit source preview and never a static room asset', async () => {
  const result = await new MockAiProvider(0).analyze({
    current: { mimeType: 'image/png', base64: onePixelBase64 }
  });
  assert.equal(result.provider, 'mock');
  assert.equal(result.previewOnly, true);
  assert.equal(result.afterSource, 'current');
  assert.equal(result.transformation.geometryLocked, true);
  assert.equal(result.transformation.appearanceApplied, false);
  assert.equal('afterPublicUrl' in result, false);
});

test('mock AI records object mask mode without pretending to render a result', async () => {
  const image = { mimeType: 'image/png', base64: onePixelBase64 };
  const result = await new MockAiProvider(0).analyze({
    current: image,
    objectMaterial: image,
    mask: image,
    targetObject: 'sofa'
  });
  assert.equal(result.afterSource, 'current');
  assert.equal(result.prompt.inputMode, 'object-mask-material');
  assert.equal(result.prompt.targetObject, 'sofa');
  assert.equal(result.transformation.maskLocked, true);
  assert.equal(result.transformation.appearanceApplied, false);
});

test('nearest Gemini aspect ratio follows the source image geometry', () => {
  const pngHeader = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngHeader);
  pngHeader.writeUInt32BE(1682, 16);
  pngHeader.writeUInt32BE(935, 20);
  assert.equal(pickNearestAspectRatio({ mimeType: 'image/png', buffer: pngHeader }), '16:9');
});

test('Gemini pipeline locks Image A geometry and applies an object mapping with image-only output', async () => {
  const provider = new GeminiAiProvider({ apiKey: 'test', textModel: 'text-model', imageModel: 'gemini-3.1-flash-image' });
  const calls = [];
  provider.callModel = async (model, parts, generationConfig, systemInstruction) => {
    calls.push({ model, parts, generationConfig, systemInstruction });
    if (model === 'text-model') {
      return {
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify({
            summary: '구조 보존 변환',
            style: '웜 내추럴',
            palette: ['아이보리', '라이트 오크', '세이지'],
            recommendedSlugs: ['oak-flooring'],
            geometrySummary: '창가와 소파의 배치를 잠그니다.',
            objectMaterialMappings: [{
              object: '바닥',
              targetMaterial: '라이트 오크',
              targetColor: '따뜻한 베이지',
              lightingEffect: '왼쪽 자연광'
            }]
          }) }] }
        }]
      };
    }
    return {
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [
          { inlineData: { mimeType: 'image/png', data: onePixelBase64 } },
          { inlineData: { mimeType: 'image/png', data: finalPixelBase64 } }
        ] }
      }]
    };
  };
  const sourceBuffer = Buffer.from(onePixelBase64, 'base64');
  const image = { mimeType: 'image/png', base64: onePixelBase64, buffer: sourceBuffer };
  const result = await provider.analyze({ current: image, reference: image });

  assert.equal(result.afterSource, 'generated');
  assert.equal(result.transformation.mode, 'structure-locked-appearance-transfer');
  assert.match(calls[0].parts[0].text, /IMAGE A = SOURCE \/ GEOMETRY LOCK/);
  assert.match(calls[0].parts[0].text, /IMAGE B = APPEARANCE REFERENCE ONLY/);
  assert.match(calls[1].parts[0].text, /Object-by-object appearance plan/);
  assert.match(calls[1].parts[0].text, /라이트 오크/);
  assert.match(calls[0].systemInstruction, /DIRECT MATERIAL APPLICATION/);
  assert.equal(result.prompt.inputMode, 'space-reference');
  assert.deepEqual(calls[1].generationConfig.responseModalities, ['IMAGE']);
  assert.equal(calls[1].generationConfig.responseFormat, undefined);
  assert.equal(result.after.base64, finalPixelBase64);
});

test('Gemini material inpainting labels floor, wall, and space inputs separately', async () => {
  const provider = new GeminiAiProvider({ apiKey: 'test', textModel: 'text-model', imageModel: 'image-model' });
  const calls = [];
  provider.callModel = async (model, parts, generationConfig, systemInstruction) => {
    calls.push({ model, parts, generationConfig, systemInstruction });
    if (model === 'text-model') {
      return {
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify({
            summary: '바닥과 벽지를 정밀 매핑했습니다.',
            style: '내추럴',
            palette: ['웜 화이트', '라이트 오크', '세이지'],
            recommendedSlugs: ['oak-flooring', 'premium-wallpaper'],
            geometrySummary: '창문 왼쪽, 소파 중앙, 테이블 전면 배치를 그대로 유지합니다.',
            objectMaterialMappings: [{
              object: '바닥',
              targetMaterial: '오크 원목',
              targetColor: '라이트 오크',
              lightingEffect: '왼쪽 창 자연광'
            }]
          }) }] }
        }]
      };
    }
    return {
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ inlineData: { mimeType: 'image/png', data: finalPixelBase64 } }] }
      }]
    };
  };
  const sourceBuffer = Buffer.from(onePixelBase64, 'base64');
  const image = { mimeType: 'image/png', base64: onePixelBase64, buffer: sourceBuffer };
  const result = await provider.analyze({ current: image, floorMaterial: image, wallMaterial: image });

  assert.equal(result.prompt.inputMode, 'floor-wall-space');
  assert.match(calls[0].parts[1].text, /INPUT 1 — FLOOR_MATERIAL_SWATCH/);
  assert.match(calls[0].parts[3].text, /INPUT 2 — WALL_MATERIAL_SWATCH/);
  assert.match(calls[0].parts[5].text, /INPUT 3 — SPACE_SKELETON_GEOMETRY_LOCK/);
  assert.match(calls[1].parts[0].text, /No split screen, collage, borders, labels, text, logos, watermarks, gauges, dashboards, or UI/);
  assert.match(calls[1].systemInstruction, /OBJECT RE-TEXTURING/);
});

test('Gemini object inpainting sends source, binary mask, and material in strict A/B/C order', async () => {
  const provider = new GeminiAiProvider({ apiKey: 'test', textModel: 'text-model', imageModel: 'image-model' });
  const calls = [];
  provider.callModel = async (model, parts, generationConfig, systemInstruction) => {
    calls.push({ model, parts, generationConfig, systemInstruction });
    if (model === 'text-model') {
      return {
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: JSON.stringify({
            summary: 'Object material mapped to the selected target.',
            style: 'object material transfer',
            palette: ['cream', 'oak', 'sage'],
            recommendedSlugs: ['oak-flooring'],
            geometrySummary: 'The source geometry remains locked around the selected sofa.',
            objectMaterialMappings: [{
              object: 'sofa',
              targetMaterial: 'woven linen',
              targetColor: 'warm beige',
              lightingEffect: 'preserve the original window light'
            }]
          }) }] }
        }]
      };
    }
    return {
      candidates: [{
        finishReason: 'STOP',
        content: { parts: [{ inlineData: { mimeType: 'image/png', data: finalPixelBase64 } }] }
      }]
    };
  };
  const image = { mimeType: 'image/png', base64: onePixelBase64, buffer: Buffer.from(onePixelBase64, 'base64') };
  const result = await provider.analyze({ current: image, objectMaterial: image, mask: image, targetObject: 'sofa' });

  assert.equal(result.prompt.inputMode, 'object-mask-material');
  assert.equal(result.prompt.targetObject, 'sofa');
  assert.equal(result.transformation.mode, 'object-aware-mask-material-transfer');
  assert.equal(result.transformation.maskLocked, true);
  assert.match(calls[0].parts[1].text, /INPUT A/);
  assert.match(calls[0].parts[3].text, /INPUT B/);
  assert.match(calls[0].parts[5].text, /INPUT C/);
  assert.match(calls[0].systemInstruction, /OBJECT-AWARE TEXTURE TRANSFER/);
  assert.match(calls[1].parts[0].text, /Never alter any black-mask pixel/);
  assert.match(calls[1].systemInstruction, /BINARY TARGET ROI MASK/);
});

test('Gemini target-material mode sends the selected material swatch mask', async () => {
  const provider = new GeminiAiProvider({ apiKey: 'test', textModel: 'text-model', imageModel: 'image-model' });
  const calls = [];
  provider.callModel = async (model, parts) => {
    calls.push({ model, parts });
    if (model === 'text-model') {
      return { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
        summary: 'target material plan',
        style: 'warm modern',
        palette: ['oak', 'cream', 'sage'],
        recommendedSlugs: ['oak-flooring'],
        geometrySummary: 'source geometry locked',
        objectMaterialMappings: [{ object: 'floor', targetMaterial: 'oak', targetColor: 'warm oak', lightingEffect: 'preserve source light' }]
      }) }] } }] };
    }
    return { candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'image/png', data: finalPixelBase64 } }] } }] };
  };
  const image = { mimeType: 'image/png', base64: onePixelBase64, buffer: Buffer.from(onePixelBase64, 'base64') };
  const result = await provider.analyze({
    current: image,
    targetMaterials: [{ target: 'floor', image, mask: image, materialMask: image }]
  });
  assert.equal(result.prompt.inputMode, 'target-materials-space');
  assert.ok(calls[0].parts.some((part) => /INPUT MATERIAL MASK 1/.test(part.text || '')));
  assert.ok(calls[1].parts.some((part) => /INPUT MATERIAL MASK 1/.test(part.text || '')));
});
