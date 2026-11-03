import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePaletteIndices, shouldProtectAccent } from '../src/pattern/paletteLimit.js';

test('颜色数量会自动少于上限', () => {
  const counts = Uint32Array.from([700, 200, 80, 15, 1, 1, 1, 1]);
  const selected = choosePaletteIndices(counts, 8, 999);
  assert.deepEqual(selected, [0, 1, 2, 3]);
});

test('颜色自动识别不会超过用户设置的上限', () => {
  const counts = Uint32Array.from([30, 25, 20, 15, 10, 8, 7, 6]);
  const selected = choosePaletteIndices(counts, 5);
  assert.equal(selected.length, 5);
});

test('小面积蓝色和粉色细节不会被中性色吞掉', () => {
  const counts = Uint32Array.from([7000, 800, 200, 60, 20, 3, 2]);
  const palette = [
    { code: 'H2' },
    { code: 'G16' },
    { code: 'M7' },
    { code: 'H13' },
    { code: 'A23' },
    { code: 'C19' },
    { code: 'E14' },
  ];
  const selected = choosePaletteIndices(counts, 6, 8085, palette);
  assert.equal(selected.length, 6);
  assert.ok(selected.includes(5), '应保留蓝色眼睛');
  assert.ok(selected.includes(6), '应保留粉色鼻子');
});

test('孤立点整理会保护高彩度蓝色和粉色', () => {
  const gray = { code: 'H5', lab: { a: 1, b: 2 } };
  const blue = { code: 'C20', lab: { a: 8, b: -42 } };
  const pink = { code: 'E16', lab: { a: 35, b: 8 } };
  assert.equal(shouldProtectAccent(blue, gray), true);
  assert.equal(shouldProtectAccent(pink, gray), true);
  assert.equal(shouldProtectAccent(gray, blue), false);
});
