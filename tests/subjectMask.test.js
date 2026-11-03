import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBackgroundMaskFromSubject,
  createSubjectMaskFromSampledPixels,
  createSubjectOutlineMask,
} from '../src/pattern/subjectMask.js';

function createSample(width, height, rgb = [255, 255, 255]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let position = 0; position < width * height; position += 1) {
    const offset = position * 4;
    pixels[offset] = rgb[0];
    pixels[offset + 1] = rgb[1];
    pixels[offset + 2] = rgb[2];
    pixels[offset + 3] = 255;
  }
  return pixels;
}

function fillGridCell(pixels, sampleWidth, scale, gridX, gridY, rgb) {
  for (let y = gridY * scale; y < (gridY + 1) * scale; y += 1) {
    for (let x = gridX * scale; x < (gridX + 1) * scale; x += 1) {
      const offset = (y * sampleWidth + x) * 4;
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
    }
  }
}

test('独立人物蒙版保留轮廓内部白色并排除四周背景', () => {
  const gridWidth = 7;
  const gridHeight = 7;
  const scale = 4;
  const sampleWidth = gridWidth * scale;
  const sampleHeight = gridHeight * scale;
  const pixels = createSample(sampleWidth, sampleHeight);

  for (let y = 1; y <= 5; y += 1) {
    for (let x = 2; x <= 4; x += 1) fillGridCell(pixels, sampleWidth, scale, x, y, [145, 75, 45]);
  }
  fillGridCell(pixels, sampleWidth, scale, 3, 3, [255, 255, 255]);

  const subject = createSubjectMaskFromSampledPixels({
    pixels,
    sampleWidth,
    sampleHeight,
    gridWidth,
    gridHeight,
  });
  assert.equal(subject[0], 0, '画布角落应为背景');
  assert.equal(subject[3 * gridWidth + 3], 1, '人物内部白色不能被当成背景');
  assert.equal(subject[3 * gridWidth + 1], 0, '人物外侧白色应为背景');
});

test('人物蒙版可以生成连续一格H7外轮廓和反向留白遮罩', () => {
  const width = 5;
  const height = 5;
  const subject = new Uint8Array(width * height);
  for (let y = 1; y <= 3; y += 1) for (let x = 1; x <= 3; x += 1) subject[y * width + x] = 1;
  const outline = createSubjectOutlineMask(subject, width, height);
  const background = createBackgroundMaskFromSubject(subject);

  assert.equal(outline[2 * width + 2], 0, '人物中心不是外轮廓');
  assert.equal(outline[width + 1], 1, '人物边缘应进入H7轮廓');
  assert.equal([...outline].reduce((sum, value) => sum + value, 0), 8, '3×3人物应有一圈8格轮廓');
  assert.equal(background[0], 1, '轮廓外应留白');
  assert.equal(background[2 * width + 2], 0, '人物内部不能留白');
});

test('人物蒙版会去掉孤立的抗锯齿毛刺', () => {
  const gridWidth = 7;
  const gridHeight = 7;
  const scale = 4;
  const sampleWidth = gridWidth * scale;
  const sampleHeight = gridHeight * scale;
  const pixels = createSample(sampleWidth, sampleHeight);
  for (let y = 2; y <= 4; y += 1) {
    for (let x = 2; x <= 4; x += 1) fillGridCell(pixels, sampleWidth, scale, x, y, [145, 75, 45]);
  }
  // 左上角某格只有四个深色子像素，模拟缩放后的阴影/抗锯齿碎点。
  for (let y = scale; y < scale + 2; y += 1) {
    for (let x = scale; x < scale + 2; x += 1) {
      const offset = (y * sampleWidth + x) * 4;
      pixels.set([180, 180, 180, 255], offset);
    }
  }
  const subject = createSubjectMaskFromSampledPixels({
    pixels,
    sampleWidth,
    sampleHeight,
    gridWidth,
    gridHeight,
  });
  assert.equal(subject[gridWidth + 1], 0, '孤立低覆盖率碎点不应生成H7外轮廓');
  assert.equal(subject[3 * gridWidth + 3], 1, '主体本身必须保留');
});
