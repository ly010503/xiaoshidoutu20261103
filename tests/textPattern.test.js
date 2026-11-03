import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  RAINBOW_CODES,
  TEXT_COLOR_SCHEMES,
  buildTextPattern,
  dilateMask,
  fillEnclosedHoles,
  getRingWidths,
  getTextStyleLayers,
  maskFromCoverage,
  trimMask,
} from '../src/text/textPattern.js';

const mard = new Set(JSON.parse(readFileSync(new URL('../src/data/palettes/mard-221.json', import.meta.url), 'utf8')).map((color) => color.code));

test('所有文字配色都是 MARD 221 色卡里真实存在的色号', () => {
  for (const scheme of TEXT_COLOR_SCHEMES) {
    assert.equal(scheme.codes.length, 4, scheme.name);
    scheme.codes.forEach((code) => assert.ok(mard.has(code), `${scheme.name} 的 ${code} 不在色卡中`));
  }
});

test('覆盖率按半格阈值转成掩码，并裁掉四周空白', () => {
  const mask = maskFromCoverage([0, 0, 0, 0, 0.7, 0.4, 0, 0.5, 0]);
  assert.deepEqual([...mask], [0, 0, 0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual(trimMask(mask, 3, 3), { mask: Uint8Array.from([1, 1]), width: 1, height: 2 });
});

test('圆形膨胀不会把半径 2 的一点扩成方块', () => {
  const size = 7;
  const point = new Uint8Array(size * size); point[3 * size + 3] = 1;
  const dilated = dilateMask(point, size, size, 2);
  assert.equal(dilated[1 * size + 3], 1, '正上方两格在圆内');
  assert.equal(dilated[1 * size + 1], 0, '对角两格在圆外');
});

test('封闭空洞会被补满，与边缘连通的空白保留', () => {
  const ring = Uint8Array.from([
    0, 0, 0, 0, 0,
    0, 1, 1, 1, 0,
    0, 1, 0, 1, 0,
    0, 1, 1, 1, 0,
    0, 0, 0, 0, 0,
  ]);
  const filled = fillEnclosedHoles(ring, 5, 5);
  assert.equal(filled[12], 1);
  assert.equal(filled[0], 0);
});

test('云朵字由内到外依次是文字、三层描边，外面是留白', () => {
  const mask = Uint8Array.from([1, 1, 1]);
  const pattern = buildTextPattern(mask, 3, 1, {
    ringWidths: getRingWidths('cloud', 16),
    colorIndices: [10, 11, 12, 13],
    blankIndex: 99,
    fillHoles: true,
  });
  const center = Math.floor(pattern.height / 2) * pattern.width;
  const row = [...pattern.indices.slice(center, center + pattern.width)];
  assert.deepEqual(row, [99, 13, 13, 12, 11, 10, 10, 10, 11, 12, 13, 13, 99]);
  assert.equal(pattern.backgroundMask[0], 1);
  assert.equal(pattern.backgroundMask[center + 5], 0);
});

test('纯色字没有描边，字内空洞保持留白', () => {
  const mask = Uint8Array.from([1, 1, 1, 1, 0, 1, 1, 1, 1]);
  const pattern = buildTextPattern(mask, 3, 3, { ringWidths: [], colorIndices: [5], blankIndex: 0, margin: 1 });
  assert.equal(pattern.width, 5);
  assert.equal(pattern.indices[2 * 5 + 2], 0);
  assert.equal(pattern.backgroundMask[2 * 5 + 2], 1);
});

test('描边字保留字母内部的空洞，云朵字把空洞补满', () => {
  const ring = Uint8Array.from([
    1, 1, 1, 1, 1,
    1, 0, 0, 0, 1,
    1, 0, 0, 0, 1,
    1, 0, 0, 0, 1,
    1, 1, 1, 1, 1,
  ]);
  const options = { ringWidths: [1], colorIndices: [1, 2], blankIndex: 0 };
  const outline = buildTextPattern(ring, 5, 5, options);
  const cloud = buildTextPattern(ring, 5, 5, { ...options, fillHoles: true });
  const center = Math.floor(outline.height / 2) * outline.width + Math.floor(outline.width / 2);
  assert.equal(outline.backgroundMask[center], 1);
  assert.equal(cloud.indices[center], 2);
});

test('每种文字样式的色号都在色卡中，图层数与描边层数一致', () => {
  for (const style of ['plain', 'outline', 'cloud', 'sticker', 'hollow', 'rainbow']) {
    for (const height of [12, 24]) {
      const layers = getTextStyleLayers(style, height, TEXT_COLOR_SCHEMES[0].codes);
      assert.equal(layers.codes.length, layers.ringWidths.length + 1, style);
      layers.codes.filter(Boolean).forEach((code) => assert.ok(mard.has(code), `${style} 的 ${code} 不在色卡中`));
    }
  }
  assert.equal(RAINBOW_CODES.length, 6);
});

test('空心字的字面留白，只有外缘一圈是豆子', () => {
  const mask = Uint8Array.from([1, 1, 1]);
  const layers = getTextStyleLayers('hollow', 16, ['H2', 'F24', 'E6', 'E8']);
  const pattern = buildTextPattern(mask, 3, 1, {
    ringWidths: layers.ringWidths,
    colorIndices: layers.codes.map((code) => (code ? 7 : null)),
    blankIndex: 0,
    fillHoles: layers.fillHoles,
  });
  const center = 2 * pattern.width + 3;
  assert.equal(pattern.backgroundMask[center], 1);
  assert.equal(pattern.indices[center], 0);
  assert.equal(pattern.backgroundMask[center - pattern.width], 0);
  assert.equal(pattern.indices[center - pattern.width], 7);
});
