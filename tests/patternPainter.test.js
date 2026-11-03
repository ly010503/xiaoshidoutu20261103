import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GUIDE_STEP,
  getCellCodeFontSize,
  getCoordinateValues,
  getHighlightHeaderText,
  isHighlightedPatternCell,
} from '../src/canvas/patternPainter.js';

test('制作图使用 5×5 分组辅助线', () => {
  assert.equal(GUIDE_STEP, 5);
  assert.deepEqual(getCoordinateValues(30), [1, 5, 10, 15, 20, 25, 30]);
  assert.deepEqual(getCoordinateValues(12), [1, 5, 10]);
});

test('分色定位图标题同时包含色号、名称和数量', () => {
  assert.deepEqual(
    getHighlightHeaderText({ code: 'C20', name: '浅肤色', count: 128 }),
    { title: 'C20 · 浅肤色', subtitle: '分色定位图 · 共 128颗' },
  );
});

test('常用尺寸保持原字号，超过150格才使用大字号', () => {
  assert.equal(getCellCodeFontSize(36), 14);
  assert.equal(getCellCodeFontSize(48), 19);
  assert.equal(getCellCodeFontSize(48, true), 24);
  assert.ok(getCellCodeFontSize(48, true) > getCellCodeFontSize(48));
});

test('分色高亮不会把白色背景误认为主体色块', () => {
  const pattern = {
    indices: new Uint8Array([0, 0, 1]),
    backgroundMask: new Uint8Array([1, 0, 0]),
  };
  const palette = [{ code: 'H2' }, { code: 'C20' }];
  assert.equal(isHighlightedPatternCell(pattern, palette, 0, 'H2'), false);
  assert.equal(isHighlightedPatternCell(pattern, palette, 1, 'H2'), true);
  assert.equal(isHighlightedPatternCell(pattern, palette, 2, 'H2'), false);
});
