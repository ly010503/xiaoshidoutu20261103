import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expandForegroundBounds,
  findForegroundBounds,
  getContainedDrawRect,
  summarizeGridSamples,
} from '../src/image/imageProcessor.js';

function createPixels(width, height, rgb = [255, 255, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let position = 0; position < width * height; position += 1) {
    pixels.set([...rgb, 255], position * 4);
  }
  return pixels;
}

test('有序模式可以裁掉素材自带的大块纯白边', () => {
  const width = 20, height = 30;
  const pixels = createPixels(width, height);
  for (let y = 8; y <= 24; y += 1) {
    for (let x = 5; x <= 14; x += 1) pixels.set([40, 40, 40, 255], (y * width + x) * 4);
  }
  assert.deepEqual(findForegroundBounds(pixels, width, height), {
    x: 5,
    y: 8,
    width: 10,
    height: 17,
  });
  const expanded = expandForegroundBounds({ x: 5, y: 8, width: 10, height: 17 }, width, height);
  assert.ok(expanded.x < 5 && expanded.y < 8, '主体周围仍需保留安全边距');
});

test('主体放入网格时保持比例并保留两格边距', () => {
  const rect = getContainedDrawRect({ x: 0, y: 0, width: 50, height: 100 }, 280, 416, 8);
  assert.equal(rect.height, 400);
  assert.equal(rect.width, 200);
  assert.equal(rect.y, 8);
});

test('整格平均色会把穿过格子的黑线混入填充色，并单独记录线稿覆盖率', () => {
  const data = createPixels(4, 4, [220, 160, 120]);
  for (let position = 0; position < 4; position += 1) data.set([0, 0, 0, 255], position * 4);
  const result = summarizeGridSamples({ data, width: 4, height: 4 }, 1, 1);
  assert.deepEqual([...result.pixels.slice(0, 3)], [165, 120, 90], '四分之一黑线应把肤色压暗为同色系深色');
  assert.equal(result.lineCoverage[0], 64);
  assert.deepEqual([...result.linePixels.slice(0, 3)], [0, 0, 0]);
});

test('高饱和中等亮度的颜色不会被当成线稿', () => {
  const red = summarizeGridSamples({ data: createPixels(4, 4, [226, 0, 30]), width: 4, height: 4 }, 1, 1);
  assert.equal(red.lineCoverage[0], 0, '红帽子等亮度偏低的纯色不能算作暗线');
  const blue = summarizeGridSamples({ data: createPixels(4, 4, [0, 90, 200]), width: 4, height: 4 }, 1, 1);
  assert.equal(blue.lineCoverage[0], 0);
});

test('有颜色的深线会保留线条本色', () => {
  const data = createPixels(4, 4, [250, 240, 230]);
  for (let position = 0; position < 8; position += 1) data.set([30, 60, 30, 255], position * 4);
  const result = summarizeGridSamples({ data, width: 4, height: 4 }, 1, 1);
  assert.equal(result.lineCoverage[0], 128);
  assert.deepEqual([...result.linePixels.slice(0, 3)], [30, 60, 30], '深绿瞳孔这类彩色深线不能被平均成黑色');
});
