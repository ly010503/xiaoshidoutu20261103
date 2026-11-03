import test from 'node:test';
import assert from 'node:assert/strict';
import { detectPixelArtGrid, estimatePeriod, measureEdgeWeights } from '../src/image/pixelArtDetector.js';

const COLORS = [[230, 40, 50], [40, 90, 210], [250, 210, 40], [60, 170, 90], [20, 20, 20], [255, 255, 255]];

function sprite(columns, rows) {
  return Array.from({ length: columns * rows }, (_, index) => COLORS[(index * 7 + Math.floor(index / columns) * 3) % COLORS.length]);
}

/** 把 columns×rows 的像素画按 scale 放大成图片，可指定左上角裁掉的像素数。 */
function upscale(cells, columns, rows, scale, { cropX = 0, cropY = 0, transparent = new Set(), noise = 0 } = {}) {
  const width = Math.round(columns * scale) - cropX;
  const height = Math.round(rows * scale) - cropY;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const cell = Math.min(rows - 1, Math.floor((y + cropY) / scale)) * columns + Math.min(columns - 1, Math.floor((x + cropX) / scale));
      const jitter = noise ? ((x * 31 + y * 17) % (noise * 2 + 1)) - noise : 0;
      const alpha = transparent.has(cell) ? 0 : 255;
      data.set([...cells[cell].map((value) => value + jitter), alpha], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}

test('整数倍放大的像素画能识别出原始格数并逐格取回颜色', () => {
  const cells = sprite(20, 16);
  const result = detectPixelArtGrid(upscale(cells, 20, 16, 12));
  assert.equal(result.width, 20);
  assert.equal(result.height, 16);
  assert.ok(Math.abs(result.cellSize - 12) < 0.05);
  for (const index of [0, 37, 150, 319]) {
    assert.deepEqual([...result.pixels.slice(index * 4, index * 4 + 3)], cells[index]);
  }
});

test('非整数倍放大、带压缩噪点的像素画也能识别', () => {
  const cells = sprite(32, 32);
  const result = detectPixelArtGrid(upscale(cells, 32, 32, 15.5, { noise: 6 }));
  assert.equal(result.width, 32);
  assert.equal(result.height, 32);
  const [red, green, blue] = result.pixels.slice(5 * 4, 5 * 4 + 3);
  assert.ok(Math.abs(red - cells[5][0]) <= 3 && Math.abs(green - cells[5][1]) <= 3 && Math.abs(blue - cells[5][2]) <= 3);
});

test('裁剪过、开头带半格残块的像素画按完整格子对齐', () => {
  const cells = sprite(24, 24);
  const result = detectPixelArtGrid(upscale(cells, 24, 24, 10, { cropX: 3, cropY: 7 }));
  assert.equal(result.width, 24);
  assert.equal(result.height, 23);
});

test('透明背景的格子保留为透明，交给调用方设为留白', () => {
  const cells = sprite(16, 16);
  const result = detectPixelArtGrid(upscale(cells, 16, 16, 8, { transparent: new Set([0, 1, 16]) }));
  assert.equal(result.pixels[3], 0);
  assert.equal(result.pixels[16 * 4 + 3], 0);
  assert.equal(result.pixels[2 * 4 + 3], 255);
});

test('本身很小、颜色很少的原尺寸像素画一个像素对应一颗豆', () => {
  const cells = sprite(24, 20);
  const result = detectPixelArtGrid(upscale(cells, 24, 20, 1));
  assert.deepEqual([result.cellSize, result.width, result.height], [1, 24, 20]);
});

test('照片一样处处渐变的图片不识别为像素画', () => {
  const width = 300, height = 240;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.set([(x * 37 + y * 11) % 256, (x * 13 + y * 29) % 256, (x * y) % 256, 255], (y * width + x) * 4);
    }
  }
  assert.equal(detectPixelArtGrid({ data, width, height }), null);
});

test('格数超过图纸上限时不识别，交回普通取色', () => {
  const cells = sprite(220, 10);
  assert.equal(detectPixelArtGrid(upscale(cells, 220, 10, 3)), null);
});

test('边界间距估计返回最准确的间距而不是它的约数', () => {
  const weights = new Float32Array(200);
  for (let position = 9; position < 200; position += 9) weights[position] = 1;
  const result = estimatePeriod(weights);
  assert.ok(Math.abs(result.period - 9) < 0.05);
  assert.ok(measureEdgeWeights(upscale(sprite(4, 4), 4, 4, 5), 'x')[5] > 0.9);
});
