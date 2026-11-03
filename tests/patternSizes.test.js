import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PATTERN_SIZES,
  COLOR_OPTIONS,
  BEAD_DIAMETER_MM,
  physicalSizeCm,
} from '../src/state/config.js';

test('预设尺寸的总豆数正确', () => {
  const totals = Object.fromEntries(PATTERN_SIZES.map((size) => [`${size.width}x${size.height}`, size.width * size.height]));
  assert.deepEqual(totals, {
    '50x50': 2500,
    '64x64': 4096,
    '70x70': 4900,
    '90x90': 8100,
    '104x104': 10816,
    '70x104': 7280,
  });
});

test('颜色上限包含15色档位', () => {
  assert.deepEqual(COLOR_OPTIONS.map((option) => option.value), [15, 24, 48, 96, 221]);
});

test('成品尺寸按每颗豆子直径2.6毫米计算', () => {
  assert.equal(BEAD_DIAMETER_MM, 2.6);
  assert.equal(physicalSizeCm(70), 18.2);
  assert.equal(physicalSizeCm(104).toFixed(2), '27.04');
});
