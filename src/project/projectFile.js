export const PROJECT_FORMAT = 'perler-pattern-project';
export const PROJECT_VERSION = 1;

const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_DATA_URL_LENGTH = 64 * 1024 * 1024;

export function normalizeProjectName(value, sourceName = '') {
  const sourceBase = String(sourceName || '')
    .replace(/\.perlerproj$/i, '')
    .replace(/\.[^.]+$/, '');
  const candidate = String(value || '')
    .trim()
    .replace(/\.perlerproj$/i, '')
    .trim() || sourceBase || '拼豆工程';
  const normalized = candidate
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim();
  return normalized || '拼豆工程';
}

export function getProjectDownloadFileName(projectName, sourceName = '') {
  return `${normalizeProjectName(projectName, sourceName)}.perlerproj`;
}

function fail(message) {
  throw new Error(message);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function bytesToBase64(value) {
  const bytes = value instanceof Uint8Array
    ? value
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value, label) {
  if (typeof value !== 'string' || !value.length) fail(`${label}数据缺失`);
  let binary;
  try {
    binary = atob(value);
  } catch {
    fail(`${label}数据损坏`);
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function requireInteger(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) fail(`${label}无效`);
  return value;
}

function requireFinite(value, label) {
  if (!Number.isFinite(value)) fail(`${label}无效`);
  return value;
}

function normalizeCrop(crop) {
  if (crop === null || crop === undefined) return null;
  if (!isObject(crop)) fail('裁剪信息无效');
  const normalized = {
    x: requireFinite(crop.x, '裁剪位置'),
    y: requireFinite(crop.y, '裁剪位置'),
    width: requireFinite(crop.width, '裁剪宽度'),
    height: requireFinite(crop.height, '裁剪高度'),
  };
  if (normalized.x < 0 || normalized.y < 0 || normalized.width <= 0 || normalized.height <= 0) {
    fail('裁剪信息无效');
  }
  return normalized;
}

function normalizeTransform(transform) {
  if (!isObject(transform)) fail('图片变换信息无效');
  const rotation = requireFinite(transform.rotation, '旋转角度');
  if (rotation % 90 !== 0) fail('旋转角度无效');
  return {
    rotation,
    flipH: Boolean(transform.flipH),
    flipV: Boolean(transform.flipV),
  };
}

function normalizeAdjustments(adjustments) {
  if (!isObject(adjustments)) fail('图片调整信息无效');
  return {
    brightness: requireFinite(adjustments.brightness, '亮度'),
    contrast: requireFinite(adjustments.contrast, '对比度'),
    saturation: requireFinite(adjustments.saturation, '饱和度'),
    sharpen: requireFinite(adjustments.sharpen, '锐化'),
    smoothing: requireFinite(adjustments.smoothing, '平滑'),
  };
}

function normalizeImage(image) {
  if (!isObject(image)) fail('工程中缺少原始图片');
  if (typeof image.name !== 'string' || !image.name.trim()) fail('图片名称无效');
  if (!SUPPORTED_IMAGE_TYPES.has(image.type)) fail('工程中的图片格式不受支持');
  if (typeof image.dataUrl !== 'string'
    || image.dataUrl.length > MAX_IMAGE_DATA_URL_LENGTH
    || !image.dataUrl.startsWith(`data:${image.type};base64,`)) {
    fail('工程中的图片数据无效');
  }
  return {
    name: image.name.slice(0, 240),
    type: image.type,
    size: requireInteger(image.size, 1, 40 * 1024 * 1024, '图片大小'),
    width: requireInteger(image.width, 1, 100_000, '图片宽度'),
    height: requireInteger(image.height, 1, 100_000, '图片高度'),
    lastModified: Number.isFinite(image.lastModified) ? image.lastModified : Date.now(),
    dataUrl: image.dataUrl,
  };
}

function normalizeSettings(settings, paletteCodes = []) {
  if (!isObject(settings) || !isObject(settings.currentSize)) fail('工程设置无效');
  const ownedColorCodes = [...new Set(Array.isArray(settings.ownedColorCodes) ? settings.ownedColorCodes : [])]
    .filter((code) => code !== '__BLANK__' && paletteCodes.includes(code));
  if (settings.useOwnedPalette && !ownedColorCodes.length) fail('工程中没有可用的个人色号');
  return {
    useOwnedPalette: Boolean(settings.useOwnedPalette),
    ownedColorCodes,
    crop: normalizeCrop(settings.crop),
    transform: normalizeTransform(settings.transform),
    adjustments: normalizeAdjustments(settings.adjustments),
    colorStyle: ['natural', 'vivid', 'ordered', 'direct'].includes(settings.colorStyle)
      ? settings.colorStyle
      : 'vivid',
    maxColors: requireInteger(settings.maxColors, 1, 221, '颜色上限'),
    currentSize: {
      width: requireInteger(settings.currentSize.width, 10, 200, '图纸宽度'),
      height: requireInteger(settings.currentSize.height, 10, 300, '图纸高度'),
    },
    dirty: Boolean(settings.dirty),
    options: {
      reduceIsolated: settings.options?.reduceIsolated !== false,
      mergeColors: settings.options?.mergeColors !== false,
    },
  };
}

function normalizePattern(pattern, currentPaletteCodes) {
  if (pattern === null || pattern === undefined) return null;
  if (!isObject(pattern) || !Array.isArray(pattern.paletteCodes)) fail('图纸数据无效');
  const width = requireInteger(pattern.width, 1, 200, '图纸宽度');
  const height = requireInteger(pattern.height, 1, 300, '图纸高度');
  const indices = base64ToBytes(pattern.indices, '图纸颜色');
  const sourcePixels = base64ToBytes(pattern.sourcePixels, '图纸原图采样');
  if (indices.length !== width * height || sourcePixels.length !== width * height * 4) {
    fail('图纸数据长度不匹配');
  }
  if (!Array.isArray(currentPaletteCodes) || !currentPaletteCodes.length) fail('当前色卡未加载');
  const currentIndexByCode = new Map(currentPaletteCodes.map((code, index) => [code, index]));
  const savedToCurrent = pattern.paletteCodes.map((code) => currentIndexByCode.get(code));
  const remapped = new Uint8Array(indices.length);
  for (let position = 0; position < indices.length; position += 1) {
    const savedIndex = indices[position];
    const currentIndex = savedToCurrent[savedIndex];
    if (!Number.isInteger(currentIndex) || currentIndex > 255) fail('当前色卡缺少工程使用的颜色');
    remapped[position] = currentIndex;
  }
  const backgroundMask = pattern.backgroundMask == null
    ? null : base64ToBytes(pattern.backgroundMask, '图纸留白');
  if (backgroundMask && (backgroundMask.length !== width * height
    || backgroundMask.some((value) => value !== 0 && value !== 1))) fail('图纸留白数据无效');
  return { width, height, indices: remapped, sourcePixels: new Uint8ClampedArray(sourcePixels), backgroundMask };
}

function normalizePreferences(preferences, hasPattern) {
  const value = isObject(preferences) ? preferences : {};
  const watermark = isObject(value.watermark) ? value.watermark : {};
  return {
    previewMode: hasPattern && value.previewMode === 'pattern' ? 'pattern' : 'effect',
    recentColors: Array.isArray(value.recentColors)
      ? value.recentColors.filter((code) => typeof code === 'string').slice(0, 12)
      : [],
    watermark: {
      enabled: watermark.enabled !== false,
      text: typeof watermark.text === 'string' ? watermark.text.slice(0, 40) : '',
    },
  };
}

export function createProjectDocument({ name, image, settings, pattern, preferences, paletteCodes }) {
  const patternDocument = pattern ? {
    width: pattern.width,
    height: pattern.height,
    paletteCodes: [...paletteCodes],
    indices: bytesToBase64(pattern.indices),
    sourcePixels: bytesToBase64(pattern.sourcePixels),
    backgroundMask: pattern.backgroundMask ? bytesToBase64(pattern.backgroundMask) : null,
  } : null;
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: normalizeProjectName(name, image.name),
    savedAt: new Date().toISOString(),
    image: { ...image },
    settings: {
      ...settings,
      crop: settings.crop ? { ...settings.crop } : null,
      transform: { ...settings.transform },
      adjustments: { ...settings.adjustments },
      currentSize: { ...settings.currentSize },
      options: { ...settings.options },
      ownedColorCodes: [...(settings.ownedColorCodes || [])],
    },
    pattern: patternDocument,
    preferences: {
      ...preferences,
      recentColors: [...(preferences.recentColors || [])],
      watermark: { ...preferences.watermark },
    },
  };
}

export function serializeProjectDocument(document) {
  return JSON.stringify(document);
}

export function parseProjectDocument(text, { paletteCodes } = {}) {
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    fail('工程文件无法读取，可能已经损坏');
  }
  if (!isObject(document) || document.format !== PROJECT_FORMAT) fail('这不是拼豆工程文件');
  if (document.version !== PROJECT_VERSION) fail('工程文件版本暂不支持，请更新网站后再试');
  const image = normalizeImage(document.image);
  const settings = normalizeSettings(document.settings, paletteCodes);
  const pattern = normalizePattern(document.pattern, paletteCodes);
  const preferences = normalizePreferences(document.preferences, Boolean(pattern));
  return {
    name: normalizeProjectName(document.name, image.name),
    savedAt: typeof document.savedAt === 'string' ? document.savedAt : null,
    image,
    settings,
    pattern,
    preferences,
  };
}
