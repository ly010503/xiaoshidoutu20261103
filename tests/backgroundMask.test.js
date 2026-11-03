import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhiteBackgroundMask } from '../src/pattern/backgroundMask.js';

const palette = [
  { code: 'H2', rgb: [254, 255, 255] },
  { code: 'H7', rgb: [0, 0, 0] },
];

test('只隐藏四周背景白色，保留轮廓内主体白色', () => {
  const width = 7, height = 7;
  const indices = new Uint8Array(width * height);
  for (let y = 1; y <= 5; y += 1) {
    for (let x = 1; x <= 5; x += 1) {
      if (x === 1 || x === 5 || y === 1 || y === 5) indices[y * width + x] = 1;
    }
  }
  const mask = createWhiteBackgroundMask({ width, height, indices }, palette);
  assert.equal(mask[0], 1, '图纸角落背景应隐藏编号');
  assert.equal(mask[3 * width + 3], 0, '主体内部白色应保留编号');
  assert.equal(mask[width + 1], 0, '主体轮廓也不能视为白色背景');
});

test('图纸四周不是白色时不创建背景遮罩', () => {
  const indices = new Uint8Array(25).fill(1);
  const mask = createWhiteBackgroundMask({ width: 5, height: 5, indices }, palette);
  assert.equal(mask.some(Boolean), false);
});

test('主体白色与背景通过开口相连时仍保留主体色号', () => {
  const width = 9, height = 9;
  const indices = new Uint8Array(width * height);

  // 黑色轮廓顶部留出一个开口，使内部白色与四周背景直接连通。
  for (let y = 2; y <= 7; y += 1) {
    indices[y * width + 2] = 1;
    indices[y * width + 6] = 1;
  }
  for (let x = 2; x <= 6; x += 1) indices[7 * width + x] = 1;
  indices[2 * width + 2] = 1;
  indices[2 * width + 6] = 1;

  const mask = createWhiteBackgroundMask({ width, height, indices }, palette);
  assert.equal(mask[0], 1, '四周白色背景应隐藏编号');
  assert.equal(mask[4 * width + 4], 0, '主体内部白色即使连到背景也应保留编号');
  assert.equal(mask[1 * width + 4], 1, '主体上方的白色背景仍应隐藏编号');
});

test('最终都映射为白色时按原图采样区分背景与主体浅色', () => {
  const width = 7, height = 7;
  const indices = new Uint8Array(width * height);
  const sourcePixels = new Uint8ClampedArray(width * height * 4);

  for (let position = 0; position < width * height; position += 1) {
    const offset = position * 4;
    sourcePixels.set([255, 255, 255, 255], offset);
  }
  for (let y = 2; y <= 5; y += 1) {
    for (let x = 2; x <= 4; x += 1) {
      const offset = (y * width + x) * 4;
      sourcePixels.set([244, 237, 220, 255], offset);
    }
  }
  // 主体中间保留一格纯白高光，依靠周围主体轮廓识别。
  sourcePixels.set([255, 255, 255, 255], (3 * width + 3) * 4);

  const mask = createWhiteBackgroundMask({ width, height, indices }, palette, sourcePixels);
  assert.equal(mask[0], 1, '原图中的纯白背景应隐藏编号');
  assert.equal(mask[4 * width + 3], 0, '映射为白色的主体浅色应显示编号');
  assert.equal(mask[3 * width + 3], 0, '主体内部纯白高光也应显示编号');
});

test('现成图纸的空白底色即使映射为近白色号也会排除统计', () => {
  const recoveryPalette = [
    { code: 'H17', rgb: [241, 237, 237] },
    { code: 'H7', rgb: [0, 0, 0] },
  ];
  const width = 8, height = 8;
  const indices = new Uint8Array(width * height);
  const sourcePixels = new Uint8ClampedArray(width * height * 4);
  for (let position = 0; position < width * height; position += 1) {
    sourcePixels.set([247, 247, 247, 255], position * 4);
  }
  for (let y = 2; y <= 5; y += 1) for (let x = 2; x <= 5; x += 1) {
    indices[y * width + x] = 1;
    sourcePixels.set([5, 5, 5, 255], (y * width + x) * 4);
  }
  const mask = createWhiteBackgroundMask({ width, height, indices }, recoveryPalette, sourcePixels);
  assert.equal(mask.reduce((sum, value) => sum + value, 0), 48);
  assert.equal(mask[3 * width + 3], 0);
});
