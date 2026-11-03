import test from 'node:test';
import assert from 'node:assert/strict';
import { linePositions, floodRegion, paintPositions } from '../src/pattern/paintTools.js';
import { createPatternStateSnapshot, transferPatternSnapshot } from '../src/pattern/undoHistory.js';
import { calculateStatistics, statisticsTotal } from '../src/pattern/statistics.js';

test('快速画笔跨过的水平、反向和斜线格子不会跳格', () => {
  assert.deepEqual(linePositions(5, 0, 4), [0, 1, 2, 3, 4]);
  assert.deepEqual(linePositions(5, 4, 0), [4, 3, 2, 1, 0]);
  assert.deepEqual(linePositions(5, 0, 24), [0, 6, 12, 18, 24]);
  assert.deepEqual(linePositions(5, 10, 14), [10, 11, 12, 13, 14]);
});

test('区域填充只连接上下左右的相同色号，不跨行和斜角', () => {
  const pattern = { width: 3, height: 3, indices: new Uint8Array([1, 2, 1, 2, 1, 2, 1, 2, 1]) };
  assert.deepEqual(floodRegion(pattern, 0, 9), [0]);
  pattern.indices.set([1, 1, 2, 2, 1, 2, 1, 2, 1]);
  assert.deepEqual(new Set(floodRegion(pattern, 0, 9)), new Set([0, 1, 4]));
  assert.deepEqual(floodRegion(pattern, 6, 9), [6]);
});

test('自动留白和手动擦除的空格可以作为同一个区域补豆', () => {
  const pattern = { width: 3, height: 1, indices: new Uint8Array([0, 9, 1]), backgroundMask: new Uint8Array([1, 1, 0]) };
  assert.deepEqual(new Set(floodRegion(pattern, 0, 9)), new Set([0, 1]));
  assert.equal(paintPositions(pattern, [0, 1], 0, 9), 2);
  assert.deepEqual([...pattern.backgroundMask], [0, 0, 0]);
});

test('擦除、补回相同白色豆和整笔撤销重做保持真实统计', () => {
  const pattern = { width: 3, height: 1, indices: new Uint8Array([0, 0, 1]), sourcePixels: new Uint8ClampedArray(12), backgroundMask: new Uint8Array([1, 0, 0]) };
  const palette = [{ code: 'H2' }, { code: 'H7' }, { code: '__BLANK__', excludeFromStatistics: true }];
  const undo = [createPatternStateSnapshot(pattern)], redo = [];
  assert.equal(paintPositions(pattern, [0], 0, 2), 1);
  assert.equal(paintPositions(pattern, [1], 2, 2), 1);
  assert.equal(paintPositions(pattern, [1], 2, 2), 0);
  assert.equal(statisticsTotal(calculateStatistics(pattern.indices, palette, pattern.backgroundMask)), 2);
  transferPatternSnapshot(undo, redo, pattern);
  assert.deepEqual([...pattern.indices], [0, 0, 1]);
  assert.deepEqual([...pattern.backgroundMask], [1, 0, 0]);
  transferPatternSnapshot(redo, undo, pattern);
  assert.deepEqual([...pattern.indices], [0, 2, 1]);
  assert.deepEqual([...pattern.backgroundMask], [0, 1, 0]);
});
