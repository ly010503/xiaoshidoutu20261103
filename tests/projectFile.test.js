import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECT_FORMAT,
  PROJECT_VERSION,
  createProjectDocument,
  getProjectDownloadFileName,
  normalizeProjectName,
  parseProjectDocument,
  serializeProjectDocument,
} from '../src/project/projectFile.js';

const paletteCodes = ['A1', 'B2', '__BLANK__'];

function createExampleDocument() {
  return createProjectDocument({
    image: {
      name: 'example.png',
      type: 'image/png',
      size: 3,
      width: 2,
      height: 1,
      lastModified: 123,
      dataUrl: 'data:image/png;base64,AQID',
    },
    settings: {
      crop: { x: 0, y: 0, width: 2, height: 1 },
      transform: { rotation: 90, flipH: true, flipV: false },
      adjustments: { brightness: 0, contrast: 0, saturation: 0, sharpen: 10, smoothing: 10 },
      colorStyle: 'vivid',
      maxColors: 24,
      currentSize: { width: 10, height: 10 },
      dirty: false,
      options: { reduceIsolated: true, mergeColors: true },
    },
    pattern: {
      width: 2,
      height: 1,
      indices: new Uint8Array([0, 2]),
      sourcePixels: new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]),
    },
    preferences: {
      previewMode: 'pattern',
      recentColors: ['B2'],
      watermark: { enabled: true, text: '@测试水印' },
    },
    paletteCodes,
  });
}

test('工程文件能完整恢复图纸和编辑设置，但不包含撤销历史', () => {
  const text = serializeProjectDocument(createExampleDocument());
  const restored = parseProjectDocument(text, { paletteCodes });

  assert.deepEqual([...restored.pattern.indices], [0, 2]);
  assert.deepEqual([...restored.pattern.sourcePixels], [1, 2, 3, 255, 4, 5, 6, 255]);
  assert.equal(restored.settings.transform.rotation, 90);
  assert.equal(restored.preferences.watermark.text, '@测试水印');
  assert.equal(restored.name, 'example');
  assert.equal('patternUndoHistory' in restored, false);
});

test('个人色板随工程保存，并能兼容未设置个人色板的旧工程', () => {
  const document = createExampleDocument();
  document.settings.useOwnedPalette = true;
  document.settings.ownedColorCodes = ['A1', 'B2'];
  const restored = parseProjectDocument(serializeProjectDocument(document), { paletteCodes });
  assert.equal(restored.settings.useOwnedPalette, true);
  assert.deepEqual(restored.settings.ownedColorCodes, ['A1', 'B2']);
  document.settings.ownedColorCodes = [];
  assert.throws(() => parseProjectDocument(serializeProjectDocument(document), { paletteCodes }), /个人色号/);
  delete document.settings.useOwnedPalette;
  delete document.settings.ownedColorCodes;
  assert.equal(parseProjectDocument(serializeProjectDocument(document), { paletteCodes }).settings.useOwnedPalette, false);
});

test('工程保留原来的留白蒙版，并兼容没有蒙版的旧工程', () => {
  const document = createExampleDocument();
  document.pattern.backgroundMask = btoa(String.fromCharCode(0, 1));
  const restored = parseProjectDocument(serializeProjectDocument(document), { paletteCodes });
  assert.deepEqual([...restored.pattern.backgroundMask], [0, 1]);
  const saved = createProjectDocument({
    ...restored, paletteCodes,
  });
  assert.equal(saved.pattern.backgroundMask, document.pattern.backgroundMask);
  delete document.pattern.backgroundMask;
  assert.equal(parseProjectDocument(serializeProjectDocument(document), { paletteCodes }).pattern.backgroundMask, null);
  document.pattern.backgroundMask = btoa(String.fromCharCode(0, 2));
  assert.throws(() => parseProjectDocument(serializeProjectDocument(document), { paletteCodes }), /留白/);
});

test('工程名称会清理非法文件名字符并自动添加后缀', () => {
  assert.equal(normalizeProjectName(' 小猫:头像?.perlerproj '), '小猫-头像-');
  assert.equal(getProjectDownloadFileName('夏日拼豆'), '夏日拼豆.perlerproj');
});

test('重新打开工程后仍能用工程内原图再次保存', () => {
  const restored = parseProjectDocument(serializeProjectDocument(createExampleDocument()), { paletteCodes });
  const savedAgain = createProjectDocument({
    name: '第二次保存',
    image: restored.image,
    settings: restored.settings,
    pattern: restored.pattern,
    preferences: restored.preferences,
    paletteCodes,
  });
  const reopened = parseProjectDocument(serializeProjectDocument(savedAgain), { paletteCodes });
  assert.equal(reopened.name, '第二次保存');
  assert.equal(reopened.image.dataUrl, 'data:image/png;base64,AQID');
});

test('色卡顺序变化后按色号重新映射图纸', () => {
  const text = serializeProjectDocument(createExampleDocument());
  const restored = parseProjectDocument(text, { paletteCodes: ['__BLANK__', 'B2', 'A1'] });
  assert.deepEqual([...restored.pattern.indices], [2, 0]);
});

test('拒绝未知版本和长度损坏的图纸', () => {
  const unknown = createExampleDocument();
  unknown.version = PROJECT_VERSION + 1;
  assert.throws(
    () => parseProjectDocument(JSON.stringify(unknown), { paletteCodes }),
    /版本暂不支持/,
  );

  const broken = createExampleDocument();
  broken.pattern.indices = 'AA==';
  assert.throws(
    () => parseProjectDocument(JSON.stringify(broken), { paletteCodes }),
    /长度不匹配/,
  );
});

test('工程格式标识保持稳定', () => {
  assert.equal(createExampleDocument().format, PROJECT_FORMAT);
});

test('工程文件会保留原色识别模式', () => {
  const document = createExampleDocument();
  document.settings.colorStyle = 'direct';
  const restored = parseProjectDocument(serializeProjectDocument(document), { paletteCodes });
  assert.equal(restored.settings.colorStyle, 'direct');
});

test('工程文件会保留有序颜色模式', () => {
  const document = createExampleDocument();
  document.settings.colorStyle = 'ordered';
  const restored = parseProjectDocument(serializeProjectDocument(document), { paletteCodes });
  assert.equal(restored.settings.colorStyle, 'ordered');
});
