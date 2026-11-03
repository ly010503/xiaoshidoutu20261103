import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePalette } from '../src/color/colorMatcher.js';
import {
  MANUAL_BLANK_COLOR,
  getColorDisplayCode,
} from '../src/color/manualBlankColor.js';
import { replacePatternCell } from '../src/pattern/colorReplacement.js';
import {
  calculateStatistics,
  countPatternBeans,
  statisticsTotal,
} from '../src/pattern/statistics.js';

test('纯白留白只供手动替换且不显示色号', () => {
  const palette = preparePalette([
    { code: 'H2', name: '白色', hex: '#FEFFFF', rgb: [254, 255, 255] },
    MANUAL_BLANK_COLOR,
  ]);
  const blank = palette[1];

  assert.equal(blank.manualOnly, true);
  assert.equal(blank.hideCode, true);
  assert.equal(blank.excludeFromStatistics, true);
  assert.equal(getColorDisplayCode(blank), '留白');
});

test('手动留白不计数，H2只统计图上保留的白色豆', () => {
  const palette = preparePalette([
    { code: 'H2', name: '白色', hex: '#FEFFFF', rgb: [254, 255, 255] },
    MANUAL_BLANK_COLOR,
  ]);
  const pattern = { indices: new Uint8Array([0, 0, 0, 0]) };

  assert.equal(replacePatternCell(pattern, 1, palette[1].index), true);
  assert.equal(replacePatternCell(pattern, 3, palette[1].index), true);

  const statistics = calculateStatistics(pattern.indices, palette);
  assert.equal(statistics.length, 1);
  assert.equal(statistics[0].code, 'H2');
  assert.equal(statistics[0].count, 2);
  assert.equal(statisticsTotal(statistics), 2);
  assert.equal(countPatternBeans(pattern.indices, palette), 2);
});

test('自动隐藏H2色号的纯白背景也不计入H2数量', () => {
  const palette = preparePalette([
    { code: 'H2', name: '白色', hex: '#FEFFFF', rgb: [254, 255, 255] },
    { code: 'H7', name: '黑色', hex: '#000000', rgb: [0, 0, 0] },
    MANUAL_BLANK_COLOR,
  ]);
  const indices = new Uint8Array([0, 0, 1, 0, 2]);
  const backgroundMask = new Uint8Array([1, 0, 0, 1, 0]);

  const statistics = calculateStatistics(indices, palette, backgroundMask);
  const h2 = statistics.find((item) => item.code === 'H2');

  assert.equal(h2.count, 1);
  assert.equal(statistics.some((item) => item.manualOnly), false);
  assert.equal(statisticsTotal(statistics), 2);
  assert.equal(countPatternBeans(indices, palette, backgroundMask), 2);
});
