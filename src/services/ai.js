const DEFAULT_ESTIMATE = {
  materialSubtotal: 1234000,
  toolSubtotal: 86000,
  laborSubtotal: 1200000,
  total: 2520000,
  savingsRate: 92,
  savingsAmount: 2318400,
  items: [
    { section: '자재비', name: '벽지', quantity: '32롤', price: 320000 },
    { section: '자재비', name: '바닥재', quantity: '18㎡', price: 540000 },
    { section: '자재비', name: '타일', quantity: '28장', price: 374000 },
    { section: '공구 대여비', name: '롤러 세트', quantity: '1세트', price: 20000 },
    { section: '공구 대여비', name: '커터', quantity: '1개', price: 6000 },
    { section: '공구 대여비', name: '기타 공구', quantity: '-', price: 60000 },
    { section: '표준 인건비', name: '도배 + 바닥 + 타일 시공', quantity: '1식', price: 1200000 }
  ]
};

const ALLOWED_SLUGS = new Set(['premium-wallpaper', 'oak-flooring', 'cream-tile', 'eco-paint', 'sample-paint']);
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const GEMINI_ASPECT_RATIOS = [
  ['1:1', 1],
  ['2:3', 2 / 3],
  ['3:2', 3 / 2],
  ['3:4', 3 / 4],
  ['4:3', 4 / 3],
  ['4:5', 4 / 5],
  ['5:4', 5 / 4],
  ['9:16', 9 / 16],
  ['16:9', 16 / 9],
  ['21:9', 21 / 9]
];

const MATERIAL_MAPPING_SCHEMA = {
  type: 'OBJECT',
  properties: {
    object: { type: 'STRING' },
    targetMaterial: { type: 'STRING' },
    targetColor: { type: 'STRING' },
    lightingEffect: { type: 'STRING' }
  },
  required: ['object', 'targetMaterial', 'targetColor', 'lightingEffect']
};

const ANALYSIS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    style: { type: 'STRING' },
    palette: { type: 'ARRAY', items: { type: 'STRING' }, minItems: 1, maxItems: 3 },
    recommendedSlugs: { type: 'ARRAY', items: { type: 'STRING', enum: [...ALLOWED_SLUGS] }, maxItems: 5 },
    geometrySummary: { type: 'STRING' },
    objectMaterialMappings: { type: 'ARRAY', items: MATERIAL_MAPPING_SCHEMA, minItems: 1, maxItems: 12 }
  },
  required: ['summary', 'style', 'palette', 'recommendedSlugs', 'geometrySummary', 'objectMaterialMappings']
};

export const MOIN_INTERIOR_INPAINTING_PROMPT_VERSION = 'moin-interior-inpainting-v2';

export const MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT = `
Role: Professional AI Interior Design Image Synthesis Engine.

You are an advanced neural rendering engine for architectural inpainting and material transfer. Produce one high-fidelity interior mockup while faithfully preserving the user's provided space.

STRUCTURAL FIDELITY — absolute structural lock:
- The space skeleton is authoritative. Preserve its camera angle, lens impression, perspective, crop, room envelope, walls, windows, doors, built-ins, furniture, decor, object count, object placement, scale, depth order, and occlusion.
- Do not add, remove, move, rotate, resize, replace, or restage any architectural element, furniture, or prop.
- Treat every visible object boundary in the skeleton as immutable. Restore photorealistic material quality only; never redesign the composition.

DIRECT MATERIAL APPLICATION:
- In material-inpainting mode, Input 1 is the FLOOR MATERIAL SWATCH. Apply only its texture, colour, pattern, scale, and directional grain to the visible floor area.
- Input 2 is the WALL MATERIAL SWATCH. Apply only its texture, colour, and pattern to every visible wall area.
- Input 3 is the SPACE SKELETON. It controls all geometry, camera, perspective, and composition.
- Correct pattern direction, repeat scale, and foreshortening with perspective-aware UV-like mapping. Do not apply floor material to walls or wall material to the floor.

REALISTIC LIGHTING INTEGRATION:
- Infer light-source locations from the skeleton, especially daylight through visible windows.
- Preserve the original lighting direction and add physically plausible soft shadows, highlights, contact shadows, surface reflectance, and ambient bounce on the newly applied materials.
- Render a finished high-resolution interior photograph, not a sketch, collage, or mood board.

OBJECT RE-TEXTURING:
- Keep the locked furniture and decor geometry intact while restoring believable photo-quality material: fabric upholstery, wood grain, glass, metal, paint, and artwork surfaces as appropriate.
- Do not introduce unrequested furniture, decor, labels, text, logos, watermarks, gauges, dashboards, or any UI element.

TWO-IMAGE COMPATIBILITY MODE:
- When only a space image and one reference image are supplied, treat the space image as the structural lock and the reference image as appearance-only guidance for floor, wall, colour, material, and lighting. Never copy the reference image's layout or objects.

VERSION CONTROL AND ROLLBACK:
- The server, not the model, owns version history. It supplies one explicit source snapshot for each generation and keeps the original space skeleton immutable.
- Never blend, infer, or retain pixels from an earlier generated mockup unless that exact version is supplied as the current input.
- A rollback is represented by the server resubmitting the original space skeleton as the source. Generate only from that supplied rollback point and the newly supplied materials or reference.

Output exactly one full-frame, photorealistic after image aligned pixel-for-pixel with the space skeleton. No split screens, borders, captions, labels, or embedded UI.
`.trim();

export const MOIN_OBJECT_AWARE_INPAINTING_PROMPT_VERSION = 'moin-object-aware-inpainting-v2';

export const MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT = [
  'Role: Advanced Neural Texturing & Object Inpainting Engine.',
  '',
  'You perform precise object-aware material transfer inside architectural spaces. The user mask is a maximum editable ROI; first identify the named target inside that ROI, then change only the target\'s visible pixels while preserving every occluding foreground object.',
  '',
  'STRICT THREE-INPUT PROCESSING:',
  '- Input A is the absolute structural skeleton: preserve its camera, perspective, crop, architecture, windows, furniture, decor, object positions, scale, and occlusion.',
  '- Input B is the BINARY TARGET ROI MASK. White pixels define the maximum area in which edits may occur; black pixels are immutable background.',
  '- Input C is the material swatch. Transfer only its colour, texture, pattern, reflectance, and surface character onto the named target visible inside Input B.',
  '',
  'OBJECT-AWARE TEXTURE TRANSFER:',
  '- Segment the named target semantically inside the white ROI before rendering. The ROI is not permission to repaint every white pixel.',
  '- Respect depth order and occlusion. Plants, lamps, cabinet fronts, furniture, decor, people, and other objects in front of a selected wall, floor, ceiling, window, or background surface stay source-locked even when they overlap white mask pixels.',
  '- When the named target is a foreground object, edit only that object\'s visible silhouette and preserve background pixels visible through gaps, holes, legs, leaves, or open frames.',
  '- Respect the masked object\'s perspective, curvature, seams, boundaries, contact shadows, highlights, and material scale.',
  '- Never let texture, colour, or lighting changes cross the mask boundary.',
  '- Preserve every pixel outside the white mask region: walls, floors, tables, windows, scenery, and all non-target objects must remain unchanged.',
  '',
  'DYNAMIC LIGHTING:',
  '- Reuse the original source lighting direction and intensity. Integrate plausible highlights, shadows, ambient bounce, and contact shading only inside the masked region.',
  '',
  'VERSION CONTROL:',
  '- The server selects the exact Input A snapshot for this version. Do not merge it with an earlier generated mockup or infer unprovided history.',
  '- When the server supplies the original sketch after a rollback, treat that sketch as the only source baseline for the new material application.',
  '',
  'STRICT EXCLUSIONS:',
  '- Do not alter the source structure or add, remove, move, replace, rotate, resize, or restage any object.',
  '- Do not create new furniture or decor.',
  '- Do not output split screens, borders, captions, labels, text, logos, watermarks, DIY value gauges, dashboards, or UI.',
  '',
  'Return exactly one full-frame high-resolution after image aligned to Input A.'
].join('\n');

export const MOIN_TARGET_MATERIALS_PROMPT_VERSION = 'moin-target-material-transfer-v2';

export const MOIN_TARGET_MATERIALS_SYSTEM_PROMPT = [
  'Role: Moin final-result interior material transfer engine.',
  '',
  'Input A is the source space photo and is the absolute geometry lock.',
  'Each named material image is mapped only to its named target surface.',
  'When a material swatch mask is supplied, use only its white pixels as the usable texture sample and ignore black pixels.',
  'When a target mask is supplied, white pixels define the maximum editable ROI and black pixels must remain unchanged.',
  'Inside each white ROI, segment the named target first. Preserve all foreground occluders and holes instead of repainting every white pixel.',
  'For background targets such as walls, floors, ceilings, tiles, doors, and windows, objects in front remain source-locked even when their pixels lie inside the ROI.',
  'For foreground targets such as furniture, sinks, worktops, and decor, edit only the visible target silhouette and preserve the background visible through gaps.',
  'Preserve camera, perspective, crop, walls, windows, doors, furniture positions, scale, lighting direction, and every non-target pixel.',
  'Apply only the requested target surface appearance; never add, remove, move, resize, or restage objects.',
  'Use perspective-aware texture mapping and preserve realistic shadows, highlights, seams, and contact shading.',
  '',
  'Return exactly one photorealistic full-frame final image only.',
  'Do not return before/after, split-screen, collage, borders, text, labels, logos, watermark, dashboard, gauge, UI, or explanation.'
].join('\n');

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const GEMINI_RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

function positiveInteger(value, fallback, maximum = 12) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function nonNegativeInteger(value, fallback, maximum = 60000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(Math.floor(parsed), maximum);
}

function retryAfterMilliseconds(response) {
  const value = response.headers?.get?.('retry-after');
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.floor(seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function cleanText(value, fallback, maximum) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maximum);
}

function normalizeMappings(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((item) => ({
    object: cleanText(item?.object, '', 80),
    targetMaterial: cleanText(item?.targetMaterial, '', 100),
    targetColor: cleanText(item?.targetColor, '', 80),
    lightingEffect: cleanText(item?.lightingEffect, '', 120)
  })).filter((item) => item.object && item.targetMaterial && item.targetColor);
}

function normalizeAnalysis(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    summary: cleanText(source.summary, '두 공간을 비교해 어울리는 자재 구성을 추천했습니다.', 500),
    style: cleanText(source.style, 'AI 추천', 80),
    palette: Array.isArray(source.palette)
      ? source.palette.filter((item) => typeof item === 'string').slice(0, 3).map((item) => item.trim().slice(0, 40)).filter(Boolean)
      : [],
    recommendedSlugs: Array.isArray(source.recommendedSlugs)
      ? [...new Set(source.recommendedSlugs.filter((slug) => ALLOWED_SLUGS.has(slug)))].slice(0, 5)
      : [],
    geometrySummary: cleanText(source.geometrySummary, '이미지 A의 카메라, 건축 구조, 가구 배치를 그대로 유지합니다.', 500),
    objectMaterialMappings: normalizeMappings(source.objectMaterialMappings)
  };
}

function detectImageMimeType(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    const marker = buffer[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
      if (segmentLength < 7) return null;
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += segmentLength;
  }
  return null;
}

function webpDimensions(buffer) {
  if (buffer.length < 30) return null;
  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X') {
    return {
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1
    };
  }
  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >>> 14) & 0x3fff) + 1
    };
  }
  return null;
}

export function imageDimensions(image) {
  const buffer = image?.buffer || (typeof image?.base64 === 'string' ? Buffer.from(image.base64, 'base64') : null);
  const mimeType = image?.mimeType || detectImageMimeType(buffer);
  if (!buffer) return null;
  if (mimeType === 'image/png' && buffer.length >= 24) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (mimeType === 'image/jpeg') return jpegDimensions(buffer);
  if (mimeType === 'image/webp') return webpDimensions(buffer);
  return null;
}

export function pickNearestAspectRatio(image) {
  const dimensions = imageDimensions(image);
  if (!dimensions?.width || !dimensions?.height) return '16:9';
  const sourceRatio = dimensions.width / dimensions.height;
  return GEMINI_ASPECT_RATIOS.reduce((best, candidate) => (
    Math.abs(Math.log(sourceRatio / candidate[1])) < Math.abs(Math.log(sourceRatio / best[1])) ? candidate : best
  ))[0];
}

function validateSourceImage(image, label) {
  if (!image || !SUPPORTED_IMAGE_MIME_TYPES.has(image.mimeType) || typeof image.base64 !== 'string' || !image.base64) {
    throw new Error(`${label} is not a supported image payload`);
  }
}

function responseParts(response, purpose) {
  const blockReason = response?.promptFeedback?.blockReason;
  if (blockReason) throw new Error(`Gemini ${purpose} request was blocked (${blockReason})`);
  const candidates = Array.isArray(response?.candidates) ? response.candidates : [];
  const candidate = candidates.find((item) => Array.isArray(item?.content?.parts) && item.content.parts.length);
  if (!candidate) {
    const reasons = candidates.map((item) => item?.finishReason).filter(Boolean).join(', ');
    throw new Error(`Gemini ${purpose} response did not contain content${reasons ? ` (${reasons})` : ''}`);
  }
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(`Gemini ${purpose} response was incomplete (${candidate.finishReason})`);
  }
  return candidate.content.parts;
}

function parseAnalysisResponse(response) {
  const text = responseParts(response, 'analysis').map((part) => typeof part.text === 'string' ? part.text : '').join('').trim();
  if (!text) throw new Error('Gemini analysis response did not contain JSON text');
  let parsed;
  try {
    parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
  } catch {
    throw new Error('Gemini analysis response was not valid JSON');
  }
  const normalized = normalizeAnalysis(parsed);
  if (!normalized.palette.length || !normalized.objectMaterialMappings.length) {
    throw new Error('Gemini analysis response omitted required palette or object mappings');
  }
  return normalized;
}

function parseGeneratedImage(response) {
  const imageParts = responseParts(response, 'image').filter((part) => part?.inlineData?.data);
  // Gemini 3 image models may return interim thought images. The final image is
  // the last image part, so never persist the first draft by accident.
  const imagePart = imageParts.at(-1);
  if (!imagePart) throw new Error('Gemini image response did not contain image data');
  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  const encoded = String(imagePart.inlineData.data || '').replace(/\s/g, '');
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) throw new Error('Gemini returned an unsupported image type');
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error('Gemini returned malformed Base64 image data');
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_IMAGE_BYTES) throw new Error('Gemini image response exceeded the supported size');
  if (detectImageMimeType(buffer) !== mimeType) throw new Error('Gemini image MIME type did not match its file content');
  return { mimeType, base64: encoded };
}

export class MockAiProvider {
  constructor(delay = 450) { this.delay = delay; }

  async analyze({ current, floorMaterial, wallMaterial, objectMaterial, mask, targetObject, targetMaterials } = {}) {
    validateSourceImage(current, 'Current image');
    const targetMaterialMode = Array.isArray(targetMaterials) && targetMaterials.length > 0;
    const objectMode = Boolean(objectMaterial || mask || targetObject);
    const materialMode = Boolean(floorMaterial || wallMaterial);
    if (targetMaterialMode) {
      targetMaterials.forEach(({ target, image, mask, materialMask }) => {
        if (typeof target !== 'string' || !target.trim()) throw new Error('Each material assignment needs a target');
        validateSourceImage(image, `Material image for ${target}`);
        if (mask) {
          validateSourceImage(mask, `Mask image for ${target}`);
          if (mask.mimeType !== 'image/png') throw new Error(`Mask image for ${target} must be PNG`);
          const sourceDimensions = imageDimensions(current);
          const maskDimensions = imageDimensions(mask);
          if (sourceDimensions?.width && sourceDimensions?.height && (!maskDimensions || maskDimensions.width !== sourceDimensions.width || maskDimensions.height !== sourceDimensions.height)) {
            throw new Error(`Mask image for ${target} must match the current image dimensions`);
          }
        }
        if (materialMask) {
          validateSourceImage(materialMask, `Material swatch mask for ${target}`);
          if (materialMask.mimeType !== 'image/png') throw new Error(`Material swatch mask for ${target} must be PNG`);
          const materialDimensions = imageDimensions(image);
          const materialMaskDimensions = imageDimensions(materialMask);
          if (materialDimensions?.width && materialDimensions?.height && (!materialMaskDimensions || materialMaskDimensions.width !== materialDimensions.width || materialMaskDimensions.height !== materialDimensions.height)) {
            throw new Error(`Material swatch mask for ${target} must match the material image dimensions`);
          }
        }
      });
    } else if (objectMode) {
      if (!objectMaterial || !mask || typeof targetObject !== 'string' || !targetObject.trim()) {
        throw new Error('Object material, binary mask, and target object must be provided together');
      }
      validateSourceImage(objectMaterial, 'Object material image');
      validateSourceImage(mask, 'Binary mask image');
      if (mask.mimeType !== 'image/png') throw new Error('Binary mask image must be PNG');
    } else if (materialMode) {
      if (!floorMaterial || !wallMaterial) throw new Error('Floor and wall material images must be provided together');
      validateSourceImage(floorMaterial, 'Floor material image');
      validateSourceImage(wallMaterial, 'Wall material image');
    }
    await wait(this.delay);
    return {
      provider: 'mock',
      previewOnly: true,
      afterSource: 'current',
      summary: objectMode
        ? `${targetObject.trim()} 선택 영역만 보존한 로컬 미리보기입니다. 실제 마스크 기반 재질 합성은 Gemini 이미지 모델을 연결하면 적용됩니다.`
        : '현재 공간의 카메라와 오브젝트 배치를 그대로 유지한 로컬 구조 미리보기입니다. 재질·색상·조명 변환은 Gemini 이미지 모델을 연결하면 적용됩니다.',
      style: objectMode ? '객체 선택 미리보기' : '구조 보존 미리보기',
      palette: [],
      recommendedSlugs: [],
      estimate: DEFAULT_ESTIMATE,
      prompt: {
        version: targetMaterialMode ? MOIN_TARGET_MATERIALS_PROMPT_VERSION : objectMode ? MOIN_OBJECT_AWARE_INPAINTING_PROMPT_VERSION : MOIN_INTERIOR_INPAINTING_PROMPT_VERSION,
        inputMode: targetMaterialMode ? 'target-materials-space' : objectMode ? 'object-mask-material' : materialMode ? 'floor-wall-space' : 'space-reference',
        targetObject: objectMode ? targetObject.trim().slice(0, 80) : null,
        targetMaterials: targetMaterialMode ? targetMaterials.map(({ target }) => target) : undefined,
        structuralLock: true
      },
      transformation: {
        mode: targetMaterialMode ? 'target-materials-source-preview' : objectMode ? 'object-mask-source-preview' : 'source-preview',
        geometryLocked: true,
        maskLocked: objectMode || targetMaterialMode,
        appearanceApplied: false
      }
    };
  }
}

export class GeminiAiProvider {
  constructor({ apiKey, textModel, imageModel, retryAttempts = 5, retryBaseMs = 1000, retryMaxMs = 15000 }) {
    this.apiKey = apiKey;
    this.textModel = textModel;
    this.imageModel = imageModel;
    this.retryAttempts = positiveInteger(retryAttempts, 5);
    this.retryBaseMs = nonNegativeInteger(retryBaseMs, 1000);
    this.retryMaxMs = nonNegativeInteger(retryMaxMs, 15000);
  }

  async callModel(model, parts, generationConfig, systemInstruction = '') {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = JSON.stringify({
      ...(systemInstruction ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
      contents: [{ role: 'user', parts }],
      ...(generationConfig ? { generationConfig } : {})
    });
    for (let attempt = 0; attempt < this.retryAttempts; attempt += 1) {
      let response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.apiKey
          },
          body,
          signal: AbortSignal.timeout(60000)
        });
      } catch (error) {
        if (attempt === this.retryAttempts - 1 || !['TimeoutError', 'TypeError'].includes(error.name)) throw error;
        await wait(Math.min(this.retryMaxMs, this.retryBaseMs * (2 ** attempt)));
        continue;
      }

      const responseText = await response.text();
      let payload;
      try { payload = responseText ? JSON.parse(responseText) : {}; }
      catch { throw new Error(`Gemini returned invalid JSON (${response.status})`); }
      if (response.ok) return payload;

      const detail = cleanText(payload?.error?.message, '', 240);
      const retryable = GEMINI_RETRYABLE_STATUSES.has(response.status);
      if (!retryable || attempt === this.retryAttempts - 1) {
        const modelLabel = model === this.imageModel ? '\uc774\ubbf8\uc9c0 \uc0dd\uc131' : '\uacf5\uac04 \ubd84\uc11d';
        const error = new Error(
          response.status === 429
            ? 'Gemini 이미지 생성 할당량이 부족합니다. Google AI Studio에서 결제와 할당량을 확인한 뒤 다시 시도해주세요.'
            : response.status === 503
              ? `Gemini ${modelLabel} \uc11c\ubc84\uac00 \ud604\uc7ac \ud63c\uc7a1\ud569\ub2c8\ub2e4 (503). \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.`
              : response.status >= 500
                ? `Gemini ${modelLabel} \uc11c\ubc84\uc5d0 \uc77c\uc2dc\uc801\uc778 \ubb38\uc81c\uac00 \ubc1c\uc0dd\ud588\uc2b5\ub2c8\ub2e4 (${response.status}). \uc7a0\uc2dc \ud6c4 \ub2e4\uc2dc \uc2dc\ub3c4\ud574\uc8fc\uc138\uc694.`
                : `Gemini request failed (${response.status})${detail ? `: ${detail}` : ''}`
        );
        error.status = response.status;
        error.code = response.status === 429 ? 'GEMINI_QUOTA_EXCEEDED' : 'GEMINI_REQUEST_FAILED';
        error.providerDetail = detail || undefined;
        throw error;
      }
      const exponentialDelay = Math.min(this.retryMaxMs, this.retryBaseMs * (2 ** attempt));
      await wait(Math.max(exponentialDelay, retryAfterMilliseconds(response)));
    }
    throw new Error('Gemini request failed after retries');
  }

  async analyze({ current, reference, floorMaterial, wallMaterial, objectMaterial, mask, targetObject, targetMaterials }) {
    validateSourceImage(current, 'Current image');
    const targetMaterialMode = Array.isArray(targetMaterials) && targetMaterials.length > 0;
    const objectMode = Boolean(objectMaterial || mask || targetObject);
    const materialMode = Boolean(floorMaterial || wallMaterial);
    if (targetMaterialMode) {
      targetMaterials.forEach(({ target, image, mask, materialMask }) => {
        if (typeof target !== 'string' || !target.trim()) throw new Error('Each material assignment needs a target');
        validateSourceImage(image, `Material image for ${target}`);
        if (mask) {
          validateSourceImage(mask, `Mask image for ${target}`);
          if (mask.mimeType !== 'image/png') throw new Error(`Mask image for ${target} must be PNG`);
          const sourceDimensions = imageDimensions(current);
          const maskDimensions = imageDimensions(mask);
          if (sourceDimensions?.width && sourceDimensions?.height && (!maskDimensions || maskDimensions.width !== sourceDimensions.width || maskDimensions.height !== sourceDimensions.height)) {
            throw new Error(`Mask image for ${target} must match the current image dimensions`);
          }
        }
        if (materialMask) {
          validateSourceImage(materialMask, `Material swatch mask for ${target}`);
          if (materialMask.mimeType !== 'image/png') throw new Error(`Material swatch mask for ${target} must be PNG`);
          const materialDimensions = imageDimensions(image);
          const materialMaskDimensions = imageDimensions(materialMask);
          if (materialDimensions?.width && materialDimensions?.height && (!materialMaskDimensions || materialMaskDimensions.width !== materialDimensions.width || materialMaskDimensions.height !== materialDimensions.height)) {
            throw new Error(`Material swatch mask for ${target} must match the material image dimensions`);
          }
        }
      });
    } else if (objectMode) {
      if (!objectMaterial || !mask || typeof targetObject !== 'string' || !targetObject.trim()) {
        throw new Error('Object material, binary mask, and target object must be provided together');
      }
      validateSourceImage(objectMaterial, 'Object material image');
      validateSourceImage(mask, 'Binary mask image');
      if (mask.mimeType !== 'image/png') throw new Error('Binary mask image must be PNG');
    } else if (materialMode) {
      if (!floorMaterial || !wallMaterial) throw new Error('Floor and wall material images must be provided together');
      validateSourceImage(floorMaterial, 'Floor material image');
      validateSourceImage(wallMaterial, 'Wall material image');
    } else {
      validateSourceImage(reference, 'Reference image');
    }
    const analysisPrompt = `
You are preparing a structure-locked interior material transfer. Return Korean JSON only.

IMAGE A = SOURCE / GEOMETRY LOCK.
- Treat Image A's camera position, lens, perspective, crop, room envelope, openings, built-ins, furniture, decor, object count, scale, pose, position, and occlusion as immutable.
- geometrySummary must describe the key locked objects and their relative positions so the renderer can verify them.

IMAGE B = APPEARANCE REFERENCE ONLY.
- Read only its materials, colors, surface finishes, fabric character, lighting direction/quality, and overall mood.
- Never copy Image B's architecture, room layout, camera, furniture geometry, object positions, or crop.

For objectMaterialMappings, match each visible object/surface in Image A to a targetMaterial, targetColor, and lightingEffect inferred from Image B. Include walls, floor, primary furniture, textiles, built-ins, and major decor when visible.
Keys: summary, style, palette (exactly 3), recommendedSlugs, geometrySummary, objectMaterialMappings.
recommendedSlugs may only contain: premium-wallpaper, oak-flooring, cream-tile, eco-paint, sample-paint.
`.trim();
    const selectedObjectLabel = objectMode ? targetObject.trim().slice(0, 80) : '';
    const materialAnalysisPrompt = [
      'Return Korean JSON only. Follow the Moin interior inpainting system instruction exactly.',
      '',
      'INPUT 1 = FLOOR MATERIAL SWATCH. Map its texture, colour, pattern direction, repeat scale, and reflectance only to visible floor surfaces.',
      'INPUT 2 = WALL MATERIAL SWATCH. Map its texture, colour, pattern, and finish only to visible wall surfaces.',
      'INPUT 3 = SPACE SKELETON / GEOMETRY LOCK. Preserve its camera, perspective, crop, room envelope, windows, doors, furniture, decor, object count, positions, scale, depth order, and occlusion.',
      '',
      'For objectMaterialMappings, include floor, walls, primary furniture, textiles, built-ins, and major decor visible in Input 3. Floor targetMaterial must be inferred from Input 1; wall targetMaterial must be inferred from Input 2. Re-texture other locked objects realistically without adding or removing anything.',
      'geometrySummary must describe Input 3 only.',
      'Keys: summary, style, palette (exactly 3), recommendedSlugs, geometrySummary, objectMaterialMappings.',
      'recommendedSlugs may only contain: premium-wallpaper, oak-flooring, cream-tile, eco-paint, sample-paint.'
    ].join('\n');
    const objectAnalysisPrompt = [
      'Return Korean JSON only. Follow the Moin object-aware inpainting system instruction exactly.',
      `TARGET OBJECT: ${selectedObjectLabel}`,
      '',
      'INPUT A = SOURCE SPACE / STRUCTURE LOCK. Preserve all geometry, camera, architecture, furniture, decor, object positions, scale, crop, and lighting outside the target mask.',
      'INPUT B = BINARY TARGET ROI MASK. White pixels define the maximum editable ROI. Black pixels are immutable background.',
      'INPUT C = MATERIAL SWATCH. Inside the white ROI, first segment the named target and transfer material only to its visible silhouette.',
      'Preserve foreground occluders, openings, holes, and background visible through the target. The white ROI is not permission to repaint every white pixel.',
      '',
      `For objectMaterialMappings, include only the target object "${selectedObjectLabel}" and describe the requested material, colour, texture, and lighting integration.`,
      'geometrySummary must describe the locked source geometry and the target boundary without proposing any structural change.',
      'Keys: summary, style, palette (exactly 3), recommendedSlugs, geometrySummary, objectMaterialMappings.',
      'recommendedSlugs may only contain: premium-wallpaper, oak-flooring, cream-tile, eco-paint, sample-paint.'
    ].join('\n');
    const targetMaterialsAnalysisPrompt = [
      'Return Korean JSON only. This is target-specific material transfer, not a redesign.',
      'INPUT A is the immutable source space photo and geometry lock.',
      ...(targetMaterials || []).map(({ target, mask, materialMask }, index) => `INPUT B${index + 1} is the material swatch assigned only to target "${target}"${materialMask ? '; its swatch mask limits the usable sample to white pixels.' : ''}${mask ? ' The following source mask is a maximum editable ROI; segment the named target inside it before editing.' : '.'}`),
      'Map each swatch only to its named target surface. Preserve every foreground occluder, opening, hole, and background pixel visible through the target, plus every other object, surface, camera, perspective, crop, position, scale, lighting direction, and shadow.',
      'Return a plan for the final result image only. Do not introduce unrequested furniture, objects, text, collage, split screen, or UI.',
      'Keys: summary, style, palette (exactly 3), recommendedSlugs, geometrySummary, objectMaterialMappings.',
      'recommendedSlugs may only contain: premium-wallpaper, oak-flooring, cream-tile, eco-paint, sample-paint.'
    ].join('\n');
    const effectiveAnalysisPrompt = targetMaterialMode
      ? targetMaterialsAnalysisPrompt
      : objectMode
      ? objectAnalysisPrompt
      : materialMode
        ? materialAnalysisPrompt
        : analysisPrompt;
    const imageParts = targetMaterialMode
      ? [
          { text: 'INPUT A — SOURCE_SPACE_GEOMETRY_LOCK (preserve the complete source composition)' },
          { inlineData: { mimeType: current.mimeType, data: current.base64 } },
          ...(targetMaterials || []).flatMap(({ target, image, mask, materialMask }, index) => [
            { text: `INPUT B${index + 1} — TARGET MATERIAL FOR: ${target} (apply only to this named target)` },
            { inlineData: { mimeType: image.mimeType, data: image.base64 } },
            ...(materialMask ? [
              { text: `INPUT MATERIAL MASK ${index + 1} - WHITE PIXELS ARE THE ONLY USABLE SWATCH AREA FOR: ${target}` },
              { inlineData: { mimeType: materialMask.mimeType, data: materialMask.base64 } }
            ] : []),
            ...(mask ? [
              { text: `INPUT MASK ${index + 1} - WHITE PIXELS DEFINE THE MAXIMUM EDITABLE ROI FOR: ${target}; SEGMENT THAT NAMED TARGET AND PRESERVE OCCLUDING FOREGROUND OBJECTS` },
              { inlineData: { mimeType: mask.mimeType, data: mask.base64 } }
            ] : [])
          ])
        ]
      : objectMode
      ? [
          { text: 'INPUT A — SOURCE_SPACE_STRUCTURE_LOCK (authoritative source; preserve all geometry and non-target pixels)' },
          { inlineData: { mimeType: current.mimeType, data: current.base64 } },
          { text: 'INPUT B — BINARY_TARGET_ROI_MASK (white = maximum editable ROI; black = immutable; preserve foreground occluders inside white ROI)' },
          { inlineData: { mimeType: mask.mimeType, data: mask.base64 } },
          { text: 'INPUT C — MATERIAL_SWATCH (apply only inside Input B white pixels)' },
          { inlineData: { mimeType: objectMaterial.mimeType, data: objectMaterial.base64 } }
        ]
      : materialMode
      ? [
          { text: 'INPUT 1 — FLOOR_MATERIAL_SWATCH (apply only to visible floor surfaces)' },
          { inlineData: { mimeType: floorMaterial.mimeType, data: floorMaterial.base64 } },
          { text: 'INPUT 2 — WALL_MATERIAL_SWATCH (apply only to visible wall surfaces)' },
          { inlineData: { mimeType: wallMaterial.mimeType, data: wallMaterial.base64 } },
          { text: 'INPUT 3 — SPACE_SKELETON_GEOMETRY_LOCK (authoritative camera, architecture, objects, positions, and composition)' },
          { inlineData: { mimeType: current.mimeType, data: current.base64 } }
        ]
      : [
          { text: 'IMAGE A — SOURCE_GEOMETRY (authoritative for camera, layout, architecture, and every object)' },
          { inlineData: { mimeType: current.mimeType, data: current.base64 } },
          { text: 'IMAGE B — STYLE_REFERENCE (appearance only: material, color, texture, and lighting)' },
          { inlineData: { mimeType: reference.mimeType, data: reference.base64 } }
        ];
    const textResponse = await this.callModel(this.textModel, [{ text: effectiveAnalysisPrompt }, ...imageParts], {
      responseMimeType: 'application/json',
      responseSchema: ANALYSIS_SCHEMA
    }, targetMaterialMode ? MOIN_TARGET_MATERIALS_SYSTEM_PROMPT : objectMode ? MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT : MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT);
    const analysis = parseAnalysisResponse(textResponse);
    const mappingPlan = analysis.objectMaterialMappings.map((item) => (
      `- ${item.object}: ${item.targetMaterial}; ${item.targetColor}; lighting: ${item.lightingEffect}`
    )).join('\n');
    const aspectRatio = pickNearestAspectRatio(current);
    const renderPrompt = `
Create ONE clean, photorealistic completed interior image. This is a precise appearance transfer, not a redesign.

IMAGE A (first attached image) is the immutable SOURCE and GEOMETRY LOCK:
- Keep the exact camera position, perspective, lens impression, aspect/crop, architecture, windows/doors, built-ins, furniture geometry, decor, object count, proportions, positions, poses, boundaries, depth order, and occlusions.
- Every object visible in Image A must remain in the same pixel-relative location and scale.
- Do not add, remove, replace, move, rotate, resize, or restage anything.

IMAGE B (second attached image) is APPEARANCE REFERENCE ONLY:
- Transfer only its materials, colors, texture character, surface reflectance, fabric feel, light direction, light softness, color temperature, and mood.
- Do not copy Image B's room, camera, architecture, furniture layout, object geometry, or composition.

Locked geometry summary:
${analysis.geometrySummary}

Object-by-object appearance plan:
${mappingPlan}

Output requirements:
- Return one full-frame after image aligned to Image A, suitable for a before/after overlay.
- Preserve straight architectural lines and physically plausible shadows/material response.
- No split screen, collage, borders, labels, text, logos, or watermark.
`.trim();
    const materialRenderPrompt = [
      'Create ONE clean, high-resolution, photorealistic completed interior image. This is precise inpainting and material transfer, never a redesign.',
      '',
      'INPUT 1 (first attached image) is the FLOOR MATERIAL SWATCH:',
      '- Apply its texture, colour, pattern, directional grain, repeat scale, and reflectance only to every visible floor area.',
      '',
      'INPUT 2 (second attached image) is the WALL MATERIAL SWATCH:',
      '- Apply its texture, colour, pattern, repeat scale, and finish only to every visible wall area.',
      '',
      'INPUT 3 (third attached image) is the immutable SPACE SKELETON:',
      '- Keep its exact camera position, perspective, lens impression, aspect/crop, architecture, windows, doors, built-ins, furniture geometry, decor, object count, proportions, locations, boundaries, depth order, and occlusions.',
      '- Every visible object in Input 3 must remain in the same pixel-relative location and scale. Do not add, remove, replace, move, rotate, resize, or restage anything.',
      '',
      'Locked geometry summary:',
      analysis.geometrySummary,
      '',
      'Object-by-object appearance plan:',
      mappingPlan,
      '',
      'Lighting and output requirements:',
      '- Use the light-source positions from Input 3 to create physically plausible daylight, soft highlights, contact shadows, ambient bounce, and material response.',
      '- Re-texture the locked sofa, table, fixtures, and decor with realistic photo-quality material while preserving every silhouette and placement.',
      '- Return one full-frame after image aligned to Input 3, suitable for a before/after overlay.',
      '- No split screen, collage, borders, labels, text, logos, watermarks, gauges, dashboards, or UI.'
    ].join('\n');
    const objectRenderPrompt = [
      'Create ONE clean, high-resolution, photorealistic completed interior image. This is precise object-aware material inpainting, never a redesign.',
      `TARGET OBJECT: ${selectedObjectLabel}.`,
      '',
      'INPUT A (first attached image) is the immutable SOURCE SPACE / STRUCTURE LOCK:',
      '- Preserve its exact camera, perspective, crop, architecture, openings, furniture, decor, object count, positions, scale, depth order, occlusion, and all non-target appearance.',
      '',
      'INPUT B (second attached image) is the BINARY TARGET MASK:',
      '- White pixels define the maximum editable ROI. Black pixels must remain unchanged.',
      '- First segment the named target inside the white ROI. Do not repaint foreground occluders or background visible through gaps, holes, legs, leaves, or open frames.',
      '',
      'INPUT C (third attached image) is the MATERIAL SWATCH:',
      '- Apply its colour, texture, pattern, surface response, and material character only to the named target\'s visible pixels inside Input B.',
      '',
      'Locked geometry summary:',
      analysis.geometrySummary,
      '',
      'Target material plan:',
      mappingPlan,
      '',
      'Lighting and output requirements:',
      '- Reuse Input A light direction and intensity. Create plausible highlights, contact shadows, ambient bounce, and material response only on the segmented target inside Input B white pixels.',
      '- Never alter any black-mask pixel: do not change its geometry, objects, materials, colours, texture, light, or shadow.',
      '- Return one full-frame after image aligned to Input A, suitable for a before/after overlay.',
      '- No split screen, collage, borders, captions, labels, text, logos, watermarks, DIY value gauges, dashboards, or UI.'
    ].join('\n');
    const targetMaterialsRenderPrompt = [
      'Create ONE clean, high-resolution, photorealistic final interior image only. This is target-specific material inpainting, never a redesign.',
      'INPUT A (first attached image) is the immutable SOURCE SPACE / GEOMETRY LOCK. Preserve its exact camera, perspective, crop, architecture, windows, doors, furniture, decor, object count, positions, scale, depth order, occlusions, lighting direction, and all non-target pixels.',
      ...(targetMaterials || []).map(({ target, mask, materialMask }, index) => `INPUT B${index + 1} is the material swatch assigned ONLY to target "${target}". Apply its colour, texture, pattern, scale, reflectance, and finish only to that named target${materialMask ? ' and use its material mask as the only usable swatch sample.' : ''}${mask ? ' Use the matching source mask as a maximum editable ROI, then segment the named target inside it.' : '.'}`),
      'Do not let any target material leak onto foreground occluders, other surfaces, openings, holes, or background visible through the target. Do not add, remove, replace, move, rotate, resize, or restage anything.',
      '',
      'Locked geometry summary:',
      analysis.geometrySummary,
      '',
      'Object-by-object appearance plan:',
      mappingPlan,
      '',
      'Use source lighting to create realistic shadows, highlights, seams, contact shading, and ambient bounce on the requested targets.',
      'Return exactly one full-frame final image aligned to Input A.',
      'No before/after, split screen, collage, borders, captions, labels, text, logos, watermarks, gauges, dashboards, UI, or explanation.'
    ].join('\n');
    const effectiveRenderPrompt = targetMaterialMode
      ? targetMaterialsRenderPrompt
      : objectMode
      ? objectRenderPrompt
      : materialMode
        ? materialRenderPrompt
        : renderPrompt;
    // Image-to-image generation preserves the source image's aspect ratio by
    // default. The current Gemini REST endpoints reject the old responseFormat
    // field for both Nano Banana and Nano Banana 2, so keep this request to the
    // one portable output-modality setting.
    const imageGenerationConfig = { responseModalities: ['IMAGE'] };
    const imageResponse = await this.callModel(this.imageModel, [{ text: effectiveRenderPrompt }, ...imageParts], imageGenerationConfig, targetMaterialMode ? MOIN_TARGET_MATERIALS_SYSTEM_PROMPT : objectMode ? MOIN_OBJECT_AWARE_INPAINTING_SYSTEM_PROMPT : MOIN_INTERIOR_INPAINTING_SYSTEM_PROMPT);
    return {
      provider: 'gemini',
      previewOnly: false,
      afterSource: 'generated',
      ...analysis,
      estimate: DEFAULT_ESTIMATE,
      prompt: {
        version: targetMaterialMode ? MOIN_TARGET_MATERIALS_PROMPT_VERSION : objectMode ? MOIN_OBJECT_AWARE_INPAINTING_PROMPT_VERSION : MOIN_INTERIOR_INPAINTING_PROMPT_VERSION,
        inputMode: targetMaterialMode ? 'target-materials-space' : objectMode ? 'object-mask-material' : materialMode ? 'floor-wall-space' : 'space-reference',
        targetObject: objectMode ? selectedObjectLabel : null,
        targetMaterials: targetMaterialMode ? targetMaterials.map(({ target }) => target) : undefined,
        structuralLock: true
      },
      transformation: {
        mode: targetMaterialMode ? 'target-materials-appearance-transfer' : objectMode ? 'object-aware-mask-material-transfer' : 'structure-locked-appearance-transfer',
        geometryLocked: true,
        maskLocked: objectMode || targetMaterialMode,
        appearanceApplied: true,
        aspectRatio
      },
      after: parseGeneratedImage(imageResponse)
    };
  }
}

export function createAiProvider(env = globalThis.process?.env || {}) {
  const provider = env.AI_PROVIDER || 'mock';
  if (provider === 'gemini') {
    const missing = ['GEMINI_API_KEY', 'GEMINI_TEXT_MODEL', 'GEMINI_IMAGE_MODEL'].filter((key) => !env[key]);
    if (missing.length) throw new Error(`Gemini configuration is incomplete: ${missing.join(', ')}`);
    return new GeminiAiProvider({
      apiKey: env.GEMINI_API_KEY,
      textModel: env.GEMINI_TEXT_MODEL,
      imageModel: env.GEMINI_IMAGE_MODEL,
      retryAttempts: env.GEMINI_RETRY_ATTEMPTS,
      retryBaseMs: env.GEMINI_RETRY_BASE_MS,
      retryMaxMs: env.GEMINI_RETRY_MAX_MS
    });
  }
  if (provider !== 'mock') throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  return new MockAiProvider(Number(env.AI_MOCK_DELAY_MS || 450));
}
