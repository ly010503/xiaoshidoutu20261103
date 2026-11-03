import test from 'node:test';
import assert from 'node:assert/strict';
import { sortPaletteByRecent, updateRecentColorCodes } from '../src/color/recentPalette.js';

test('刚使用的替换颜色会移动到最近列表最前方', () => {
  const recent = updateRecentColorCodes(['H7', 'C20', 'A1'], 'C20');
  assert.deepEqual(recent, ['C20', 'H7', 'A1']);
});

test('最近使用颜色最多保留12种且不会重复', () => {
  const original = Array.from({ length: 12 }, (_, index) => `A${index + 1}`);
  const recent = updateRecentColorCodes(original, 'H7');
  assert.equal(recent.length, 12);
  assert.equal(recent[0], 'H7');
  assert.equal(new Set(recent).size, recent.length);
});

test('221色色卡按最近使用顺序置顶', () => {
  const palette = [
    { code: 'A1', index: 0 },
    { code: 'H7', index: 1 },
    { code: 'C20', index: 2 },
  ];
  assert.deepEqual(
    sortPaletteByRecent(palette, ['C20', 'H7']).map((item) => item.code),
    ['C20', 'H7', 'A1'],
  );
});
