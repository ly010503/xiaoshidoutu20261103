import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePalette } from '../src/color/colorMatcher.js';
import { calculateStatistics } from '../src/pattern/statistics.js';
import { applyColorMerges, planMinorColorMerge } from '../src/pattern/colorMerge.js';

const palette = preparePalette([
  { code: 'F15', hex: '#E0001E' },
  { code: 'F8', hex: '#D00838' },
  { code: 'C8', hex: '#0A5ACB' },
  { code: 'C29', hex: '#2E4AA0' },
  { code: 'BLANK', hex: '#FFFFFF', excludeFromStatistics: true },
]);

function patternFrom(indices, backgroundMask = null) {
  return { width: indices.length, height: 1, indices: Uint8Array.from(indices), backgroundMask };
}

test('占比低于阈值的颜色并入色差最小的保留颜色', () => {
  const indices = [...Array(60).fill(0), ...Array(38).fill(2), 1, 3];
  const statistics = calculateStatistics(Uint8Array.from(indices), palette);
  const merges = planMinorColorMerge(statistics, palette, 0.02);
  assert.deepEqual(
    merges.map(({ from, to }) => [palette[from].code, palette[to].code]).sort(),
    [['C29', 'C8'], ['F8', 'F15']],
    '零散深红并入红色，零散深蓝并入蓝色',
  );
});

test('没有低于阈值的颜色、或全部都低于阈值时不做合并', () => {
  const statistics = calculateStatistics(Uint8Array.from([0, 0, 2, 2]), palette);
  assert.deepEqual(planMinorColorMerge(statistics, palette, 0.1), []);
  assert.deepEqual(planMinorColorMerge(statistics, palette, 0.9), []);
});

test('应用合并只改动对应颜色的格子，留白格不受影响', () => {
  const pattern = patternFrom([0, 1, 1, 2, 1], Uint8Array.from([0, 0, 1, 0, 0]));
  const positions = applyColorMerges(pattern, [{ from: 1, to: 0 }]);
  assert.deepEqual(positions, [1, 4]);
  assert.deepEqual([...pattern.indices], [0, 0, 1, 2, 0]);
});
