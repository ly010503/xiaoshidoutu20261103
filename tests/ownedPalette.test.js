import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOwnedCodes, parseOwnedCodes, resolveAllowedPaletteIndices } from '../src/color/ownedPalette.js';

const palette = [
  { code: 'H2', index: 0 }, { code: 'H7', index: 1 }, { code: 'F5', index: 2 },
  { code: '__BLANK__', index: 3, manualOnly: true },
];
const codes = palette.map((color) => color.code);

test('个人色号录入去重，识别中英文分隔符，并报告未知色号', () => {
  assert.deepEqual(parseOwnedCodes('h2，H7\nF5 H2,不存在', codes), { codes: ['H2', 'H7', 'F5'], unknown: ['不存在'] });
  assert.deepEqual(normalizeOwnedCodes(['H2', '__BLANK__', 'unknown', 'H2'], codes), ['H2']);
});

test('完整图例可用时保留原色，缺色时从所有已有颜色中挑近似色', () => {
  assert.deepEqual(resolveAllowedPaletteIndices(palette, true, ['H2', 'F5'], [0]), [0]);
  assert.deepEqual(resolveAllowedPaletteIndices(palette, true, ['H2', 'F5'], [1, 2]), [0, 2]);
  assert.deepEqual(resolveAllowedPaletteIndices(palette, true, ['H2'], [1]), [0]);
  assert.deepEqual(resolveAllowedPaletteIndices(palette, false, [], [1]), [1]);
  assert.throws(() => resolveAllowedPaletteIndices(palette, true, []), /至少/);
});
