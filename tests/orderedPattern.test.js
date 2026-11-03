import test from 'node:test';
import assert from 'node:assert/strict';
import { rgbToLab } from '../src/color/colorSpace.js';
import { createOrderedPattern } from '../src/pattern/orderedPattern.js';

const palette = [
  { code: 'H7', rgb: [0, 0, 0] },
  { code: 'G1', rgb: [255, 226, 206] },
  { code: 'M7', rgb: [182, 164, 152] },
  { code: 'B23', rgb: [44, 58, 38] },
  { code: 'H19', rgb: [246, 239, 226] },
  { code: 'H18', rgb: [255, 253, 240] },
  { code: 'H2', rgb: [255, 255, 255] },
  { code: 'F15', rgb: [224, 0, 30] },
].map((color) => ({ ...color, lab: rgbToLab(...color.rgb) }));
const index = Object.fromEntries(palette.map((color, position) => [color.code, position]));
const allCandidates = palette.map((_, position) => position);

function solidPixels(width, height, rgb) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let position = 0; position < width * height; position += 1) pixels.set([...rgb, 255], position * 4);
  return pixels;
}

function fullSubject(width, height, inset = 0) {
  const mask = new Uint8Array(width * height);
  for (let y = inset; y < height - inset; y += 1) {
    for (let x = inset; x < width - inset; x += 1) mask[y * width + x] = 1;
  }
  return mask;
}

function run(options) {
  return createOrderedPattern({
    candidates: allCandidates,
    outlineIndex: index.H7,
    maxColors: 24,
    ...options,
  });
}

test('主体外圈固定一格H7轮廓，内部保持填充色', () => {
  const width = 7, height = 7;
  const result = run({ width, height, palette, pixels: solidPixels(width, height, [255, 226, 206]), subjectMask: fullSubject(width, height, 1) });
  assert.equal(result[1 * width + 1], index.H7);
  assert.equal(result[1 * width + 3], index.H7);
  assert.equal(result[3 * width + 3], index.G1);
  assert.equal([...result].filter((value) => value === index.H7).length, 16, '5×5主体只有一圈16格轮廓');
});

test('横跨两格的细黑线只在最暗的一格画H7，不会画成两格粗', () => {
  const width = 9, height = 9;
  const lineCoverage = new Uint8Array(width * height);
  const linePixels = new Uint8ClampedArray(width * height * 4);
  for (let x = 1; x < width - 1; x += 1) {
    lineCoverage[3 * width + x] = Math.round(0.44 * 255);
    lineCoverage[4 * width + x] = Math.round(0.38 * 255);
  }
  const result = run({
    width, height, palette, lineCoverage, linePixels,
    pixels: solidPixels(width, height, [255, 226, 206]),
    subjectMask: fullSubject(width, height),
  });
  for (let x = 2; x < width - 2; x += 1) {
    assert.equal(result[3 * width + x], index.H7, '线条中脊应为H7');
    assert.notEqual(result[4 * width + x], index.H7, '线条旁边一格不能再画H7');
  }
});

test('覆盖率不足的浅淡线条不会升级为H7', () => {
  const width = 7, height = 7;
  const lineCoverage = new Uint8Array(width * height);
  lineCoverage[3 * width + 3] = Math.round(0.25 * 255);
  const result = run({
    width, height, palette, lineCoverage, linePixels: new Uint8ClampedArray(width * height * 4),
    pixels: solidPixels(width, height, [255, 226, 206]),
    subjectMask: fullSubject(width, height),
  });
  assert.notEqual(result[3 * width + 3], index.H7);
});

test('深绿瞳孔这类彩色深线保留本色而不是H7', () => {
  const width = 7, height = 7;
  const lineCoverage = new Uint8Array(width * height);
  const linePixels = new Uint8ClampedArray(width * height * 4);
  const pixels = solidPixels(width, height, [255, 226, 206]);
  for (const position of [3 * width + 2, 3 * width + 3, 3 * width + 4]) {
    lineCoverage[position] = 255;
    linePixels.set([44, 58, 38, 255], position * 4);
    pixels.set([44, 58, 38, 255], position * 4);
  }
  const result = run({ width, height, palette, lineCoverage, linePixels, pixels, subjectMask: fullSubject(width, height) });
  assert.equal(result[3 * width + 3], index.B23);
});

test('一串几乎相同的近白色号会并入用量最多的那个', () => {
  const width = 8, height = 8;
  const pixels = solidPixels(width, height, [246, 239, 226]);
  for (const position of [10, 13, 26, 35, 44, 51]) pixels.set([255, 253, 240, 255], position * 4);
  const result = run({ width, height, palette, pixels, subjectMask: fullSubject(width, height) });
  assert.ok(![...result].includes(index.H18), 'H18 与 H19 色差很小，应统一为 H19');
  assert.ok([...result].includes(index.H19));
});

test('高对比的小细节（深色块里的白色高光）不会被平滑掉', () => {
  const width = 7, height = 7;
  const pixels = solidPixels(width, height, [224, 0, 30]);
  pixels.set([255, 255, 255, 255], (3 * width + 3) * 4);
  const result = run({ width, height, palette, pixels, subjectMask: fullSubject(width, height) });
  assert.equal(result[3 * width + 3], index.H2);
});

test('受限色板没有H7时用最深的可用色画轮廓，并遵守颜色上限', () => {
  const width = 7, height = 7;
  const candidates = [index.G1, index.M7, index.F15];
  const pixels = solidPixels(width, height, [255, 226, 206]);
  pixels.set([246, 239, 226, 255], (3 * width + 3) * 4);
  const result = createOrderedPattern({
    width, height, palette, pixels,
    subjectMask: fullSubject(width, height, 1),
    candidates,
    outlineIndex: index.F15,
    maxColors: 2,
  });
  const used = new Set([...result].filter((_, position) => fullSubject(width, height, 1)[position]));
  assert.ok(used.size <= 2);
  assert.ok([...used].every((value) => candidates.includes(value)));
  assert.equal(result[1 * width + 1], index.F15);
});
