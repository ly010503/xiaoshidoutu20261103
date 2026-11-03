import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPatternTapIntent,
  getRectangularSelectionPositions,
} from '../src/pattern/cellSelection.js';

test('Shift范围选择返回两个格子之间的完整矩形', () => {
  assert.deepEqual(
    getRectangularSelectionPositions(6, 5, 7, 21),
    [7, 8, 9, 13, 14, 15, 19, 20, 21],
  );
});

test('反向点击起点和终点仍得到相同矩形', () => {
  assert.deepEqual(
    getRectangularSelectionPositions(6, 5, 21, 7),
    [7, 8, 9, 13, 14, 15, 19, 20, 21],
  );
});

test('非法范围不会选中任何格子', () => {
  assert.deepEqual(getRectangularSelectionPositions(6, 5, -1, 8), []);
  assert.deepEqual(getRectangularSelectionPositions(6, 5, 2, 30), []);
});

test('已有多选时普通点击进入批量换色', () => {
  assert.equal(getPatternTapIntent(12, true), 'replace-selection');
  assert.equal(getPatternTapIntent(0, false), 'replace-cell');
});

test('多选后点击选区外格子仍按单格换色', () => {
  assert.equal(getPatternTapIntent(12, false), 'replace-cell');
});

test('Ctrl和Shift操作优先于打开换色弹窗', () => {
  assert.equal(getPatternTapIntent(12, true, { ctrlKey: true }), 'toggle-select');
  assert.equal(getPatternTapIntent(12, true, { metaKey: true }), 'toggle-select');
  assert.equal(getPatternTapIntent(12, true, { shiftKey: true }), 'range-select');
});
