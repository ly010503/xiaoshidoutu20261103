import test from 'node:test';
import assert from 'node:assert/strict';
import { createOutlineMask, findOutlinePaletteIndex } from '../src/pattern/outlineProtection.js';

function makePixels(width, height, rgb) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let position = 0; position < width * height; position += 1) {
    pixels.set([...rgb, 255], position * 4);
  }
  return pixels;
}

test('高对比黑色轮廓在缩小后仍被识别', () => {
  const width = 5, height = 5;
  const pixels = makePixels(width, height, [238, 225, 202]);
  for (let y = 0; y < height; y += 1) {
    pixels.set([112, 96, 82, 255], (y * width + 2) * 4);
  }

  const mask = createOutlineMask(pixels, width, height);
  assert.equal(mask[2 * width + 2], 1, '被肤色稀释的深色轮廓应受保护');
  assert.equal(mask[2 * width], 0, '普通浅色区域不应被改成黑色');
});

test('深蓝色块不会被误判成黑色轮廓', () => {
  const width = 3, height = 3;
  const pixels = makePixels(width, height, [245, 245, 245]);
  pixels.set([20, 70, 160, 255], (width + 1) * 4);

  const mask = createOutlineMask(pixels, width, height);
  assert.equal(mask[width + 1], 0);
});

test('孤立暗点和成片深色阴影不会被强制改成纯黑', () => {
  const width = 7, height = 7;
  const pixels = makePixels(width, height, [238, 225, 202]);
  pixels.set([48, 43, 42, 255], (width + 1) * 4);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) {
      pixels.set([52, 43, 38, 255], (y * width + x) * 4);
    }
  }

  const mask = createOutlineMask(pixels, width, height);
  assert.equal(mask[width + 1], 0, '孤立暗点不应生成黑色豆');
  assert.equal(mask[3 * width + 3], 0, '实心深色阴影不应被当作轮廓');
});

test('真正的纯黑细节仍会保留', () => {
  const width = 3, height = 3;
  const pixels = makePixels(width, height, [245, 245, 245]);
  pixels.set([12, 12, 12, 255], (width + 1) * 4);

  const mask = createOutlineMask(pixels, width, height);
  assert.equal(mask[width + 1], 1);
});

test('大片纯黑填充只提取边缘而不会整块升级为轮廓', () => {
  const width = 11, height = 11;
  const pixels = makePixels(width, height, [238, 225, 202]);
  for (let y = 3; y <= 7; y += 1) {
    for (let x = 3; x <= 7; x += 1) pixels.set([8, 8, 8, 255], (y * width + x) * 4);
  }
  const mask = createOutlineMask(pixels, width, height);
  const protectedCount = [...mask].reduce((sum, value) => sum + value, 0);
  assert.equal(mask[5 * width + 5], 0, '实心暗部中心必须保留为普通填充');
  assert.ok(protectedCount > 0 && protectedCount < 25, '只应保留暗部边缘或细线脊');
});

test('优先使用MARD H7作为轮廓黑色', () => {
  const palette = [
    { code: 'H6', rgb: [47, 43, 47] },
    { code: 'H7', rgb: [0, 0, 0] },
  ];
  assert.equal(findOutlinePaletteIndex(palette), 1);
});
