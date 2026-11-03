import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePalette } from '../src/color/colorMatcher.js';
import { detectPatternLegend } from '../src/image/patternLegendDetector.js';

const palette = preparePalette([
  { code: 'H7', hex: '#000000' },
  { code: 'C13', hex: '#CDE8FF' },
  { code: 'C29', hex: '#34488E' },
  { code: 'D6', hex: '#AC7BDE' },
  { code: 'F23', hex: '#F67E66' },
  { code: 'M10', hex: '#C5B2BC' },
]);

function createImage(withLegend) {
  const width = 280;
  const height = 210;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  const fill = (left, top, right, bottom, rgb) => {
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = rgb[0]; data[offset + 1] = rgb[1]; data[offset + 2] = rgb[2];
    }
  };
  if (withLegend) {
    palette.forEach((color, index) => fill(24 + index * 32, 169, 48 + index * 32, 193, color.rgb));
  }
  return { width, height, data };
}

function createRepeatedLegendImage() {
  const width = 420;
  const height = 210;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const colors = [palette[0].rgb, palette[1].rgb, palette[2].rgb];
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  for (let index = 0; index < 12; index += 1) {
    const rgb = colors[index % colors.length];
    const left = 18 + index * 32;
    for (let y = 169; y < 193; y += 1) for (let x = left; x < left + 24; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = rgb[0]; data[offset + 1] = rgb[1]; data[offset + 2] = rgb[2];
    }
  }
  return { width, height, data };
}

const detection = {
  cellWidth: 10,
  cellHeight: 10,
  bounds: { left: 20, right: 260, top: 20, bottom: 150 },
  rawBounds: { left: 20, right: 260, top: 20, bottom: 150 },
};

test('检测到规则色块图例时返回受限色号集合', () => {
  const legend = detectPatternLegend(createImage(true), detection, palette);
  assert.ok(legend);
  assert.equal(legend.side, 'bottom');
  assert.equal(legend.swatchCount, 6);
  assert.deepEqual(legend.paletteCodes, ['H7', 'C13', 'C29', 'D6', 'F23', 'M10']);
  assert.ok(legend.confidence >= 0.72);
});

test('没有图例时返回 null 并保持原颜色识别路径', () => {
  assert.equal(detectPatternLegend(createImage(false), detection, palette), null);
});

test('大量色块只映射为少数色号时拒绝用作限色色卡', () => {
  const repeatedDetection = {
    ...detection,
    bounds: { ...detection.bounds, right: 400 },
    rawBounds: { ...detection.rawBounds, right: 400 },
  };
  assert.equal(detectPatternLegend(createRepeatedLegendImage(), repeatedDetection, palette), null);
});

test('会合并同一图例中的多行大色块', () => {
  const multiPalette = preparePalette([
    { code: 'A1', hex: '#FFF2A8' }, { code: 'A2', hex: '#FFB04A' },
    { code: 'B1', hex: '#A8E08C' }, { code: 'C1', hex: '#63CFE8' },
    { code: 'D1', hex: '#A78BDD' }, { code: 'E1', hex: '#F4A6C1' },
    { code: 'F1', hex: '#E85C68' }, { code: 'H7', hex: '#000000' },
  ]);
  const width = 300, height = 250;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let index = 3; index < data.length; index += 4) data[index] = 255;
  multiPalette.forEach((color, index) => {
    const row = Math.floor(index / 4), column = index % 4;
    const left = 30 + column * 54, top = 165 + row * 38;
    for (let y = top; y < top + 28; y += 1) for (let x = left; x < left + 28; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = color.rgb[0]; data[offset + 1] = color.rgb[1]; data[offset + 2] = color.rgb[2];
    }
  });
  const multiDetection = {
    cellWidth: 10,
    cellHeight: 10,
    bounds: { left: 20, right: 280, top: 20, bottom: 145 },
    rawBounds: { left: 20, right: 280, top: 20, bottom: 145 },
  };
  const legend = detectPatternLegend({ width, height, data }, multiDetection, multiPalette);
  assert.ok(legend);
  assert.equal(legend.swatchCount, 8);
  assert.deepEqual(legend.paletteCodes, multiPalette.map((color) => color.code));
});
