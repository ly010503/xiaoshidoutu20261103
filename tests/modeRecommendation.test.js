import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImageForMode, recommendGenerationMode } from '../src/image/modeRecommendation.js';

function image(width, height, colorAt) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) data.set([...colorAt(x, y), 255], (y * width + x) * 4);
  }
  return { data, width, height };
}

test('白底加黑色线稿的卡通图推荐有序模式', () => {
  const cartoon = image(80, 80, (x, y) => {
    const radius = Math.hypot(x - 40, y - 40);
    if (radius < 25) return [240, 180, 160];
    if (radius < 29) return [10, 10, 10];
    return [255, 255, 255];
  });
  assert.equal(recommendGenerationMode(analyzeImageForMode(cartoon)).style, 'ordered');
});

test('颜色很少、色块平整的 Logo 或像素画推荐原色识别', () => {
  const logo = image(80, 80, (x, y) => {
    if (x < 40 && y < 40) return [230, 40, 50];
    if (x >= 40 && y < 40) return [40, 90, 210];
    if (y >= 40 && x < 40) return [250, 210, 40];
    return [60, 170, 90];
  });
  const result = recommendGenerationMode(analyzeImageForMode(logo));
  assert.equal(result.style, 'direct');
  assert.equal(result.maxColors, 15);
});

test('背景复杂、颜色层次丰富的照片推荐自然模式和较多颜色', () => {
  let seed = 7;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const photo = image(80, 80, (x, y) => [
    Math.round(60 + x * 2 + random() * 40),
    Math.round(80 + y * 1.5 + random() * 40),
    Math.round(120 + random() * 90),
  ]);
  const result = recommendGenerationMode(analyzeImageForMode(photo));
  assert.equal(result.style, 'natural');
  assert.equal(result.maxColors, 48);
});
