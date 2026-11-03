import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPatternSnapshot,
  createPatternStateSnapshot,
  findChangedPositions,
  pushPatternSnapshot,
  restorePatternSnapshot,
  transferPatternSnapshot,
} from '../src/pattern/undoHistory.js';

test('撤销会恢复最近一次修改前的图纸', () => {
  const pattern = { indices: new Uint8Array([1, 2, 3, 4]) };
  const history = [];
  pushPatternSnapshot(history, createPatternSnapshot(pattern));
  pattern.indices[1] = 9;
  pushPatternSnapshot(history, createPatternSnapshot(pattern));
  pattern.indices[2] = 8;

  assert.equal(restorePatternSnapshot(history, pattern), true);
  assert.deepEqual([...pattern.indices], [1, 9, 3, 4]);
  assert.equal(restorePatternSnapshot(history, pattern), true);
  assert.deepEqual([...pattern.indices], [1, 2, 3, 4]);
});

test('撤销和重做尺寸调整后，完整还原像素与留白，快照不会被后续编辑污染', () => {
  const pattern = {
    width: 2, height: 1, indices: new Uint8Array([1, 2]),
    sourcePixels: new Uint8ClampedArray(8).fill(10), backgroundMask: new Uint8Array([0, 1]),
  };
  const undo = [createPatternStateSnapshot(pattern)], redo = [];
  Object.assign(pattern, {
    width: 1, height: 1, indices: new Uint8Array([3]),
    sourcePixels: new Uint8ClampedArray(4).fill(20), backgroundMask: new Uint8Array([0]),
  });
  assert.equal(transferPatternSnapshot(undo, redo, pattern), true);
  assert.deepEqual([...pattern.indices], [1, 2]);
  assert.deepEqual([...pattern.backgroundMask], [0, 1]);
  assert.equal(transferPatternSnapshot(redo, undo, pattern), true);
  assert.equal(pattern.width, 1);
  assert.deepEqual([...pattern.sourcePixels], [20, 20, 20, 20]);
  pattern.indices[0] = 8;
  assert.equal(transferPatternSnapshot(undo, redo, pattern), true);
  assert.deepEqual([...pattern.indices], [1, 2]);
  assert.equal(transferPatternSnapshot(redo, undo, pattern), true);
  assert.deepEqual([...pattern.indices], [8]);
});

test('撤销历史会限制数量并忽略尺寸不匹配的旧图纸', () => {
  const history = [];
  for (let value = 1; value <= 4; value += 1) {
    pushPatternSnapshot(history, new Uint8Array([value]), 2);
  }
  assert.equal(history.length, 2);
  const differentPattern = { indices: new Uint8Array([1, 2]) };
  assert.equal(restorePatternSnapshot(history, differentPattern), false);
});

test('完整快照可以撤销图纸尺寸调整并恢复尺寸和采样数据', () => {
  const pattern = {
    width: 3,
    height: 2,
    indices: new Uint8Array([1, 2, 3, 4, 5, 6]),
    sourcePixels: new Uint8ClampedArray(24).fill(9),
    backgroundMask: new Uint8Array([1, 0, 0, 0, 0, 1]),
  };
  const history = [];
  pushPatternSnapshot(history, createPatternStateSnapshot(pattern));
  Object.assign(pattern, {
    width: 2,
    height: 2,
    indices: new Uint8Array([2, 3, 5, 6]),
    sourcePixels: new Uint8ClampedArray(16).fill(3),
    backgroundMask: new Uint8Array(4),
  });

  assert.equal(restorePatternSnapshot(history, pattern), true);
  assert.equal(pattern.width, 3);
  assert.equal(pattern.height, 2);
  assert.deepEqual([...pattern.indices], [1, 2, 3, 4, 5, 6]);
  assert.equal(pattern.sourcePixels.length, 24);
  assert.deepEqual([...pattern.backgroundMask], [1, 0, 0, 0, 0, 1]);
});

test('编辑记录的名称随快照在撤销和重做之间流转', () => {
  const pattern = { width: 2, height: 1, indices: new Uint8Array([1, 2]) };
  const before = createPatternStateSnapshot(pattern);
  before.meta = { label: '画笔' };
  const undo = [before], redo = [];
  pattern.indices[0] = 5;
  assert.equal(transferPatternSnapshot(undo, redo, pattern), true);
  assert.equal(redo.at(-1).meta.label, '画笔');
  assert.equal(transferPatternSnapshot(redo, undo, pattern), true);
  assert.equal(undo.at(-1).meta.label, '画笔');
});

test('可以列出一次编辑改动过的格子，尺寸变化时返回 null', () => {
  const pattern = { width: 3, height: 1, indices: new Uint8Array([1, 2, 3]), backgroundMask: new Uint8Array(3) };
  const snapshot = createPatternStateSnapshot(pattern);
  pattern.indices[2] = 9;
  pattern.backgroundMask[0] = 1;
  assert.deepEqual(findChangedPositions(snapshot, pattern), [0, 2]);
  assert.equal(findChangedPositions(snapshot, { ...pattern, width: 1, height: 3 }), null);
});
