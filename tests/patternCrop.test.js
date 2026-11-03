import test from 'node:test';
import assert from 'node:assert/strict';
import { getPatternResizeAdjustments, resizePattern } from '../src/pattern/patternCrop.js';

function makePattern(width, height) {
  const indices = new Uint8Array(width * height);
  const sourcePixels = new Uint8ClampedArray(width * height * 4);
  const backgroundMask = new Uint8Array(width * height);
  for (let position = 0; position < indices.length; position += 1) {
    indices[position] = position;
    backgroundMask[position] = position % 2;
    sourcePixels.fill(position, position * 4, position * 4 + 4);
  }
  return { width, height, indices, sourcePixels, backgroundMask };
}

test('居中调整时奇数差值由左边和上边多裁或多补一格', () => {
  assert.deepEqual(getPatternResizeAdjustments(7, 6, 4, 3), {
    cropLeft: 2,
    cropRight: 1,
    cropTop: 2,
    cropBottom: 1,
    expandLeft: 0,
    expandRight: 0,
    expandTop: 0,
    expandBottom: 0,
  });
  assert.deepEqual(getPatternResizeAdjustments(4, 3, 7, 6), {
    cropLeft: 0,
    cropRight: 0,
    cropTop: 0,
    cropBottom: 0,
    expandLeft: 2,
    expandRight: 1,
    expandTop: 2,
    expandBottom: 1,
  });
});

test('裁切只保留目标区域的图纸颜色和原始采样数据', () => {
  const original = makePattern(7, 6);
  const result = resizePattern(original, 4, 3);

  assert.equal(result.pattern.width, 4);
  assert.equal(result.pattern.height, 3);
  assert.deepEqual([...result.pattern.indices], [16, 17, 18, 19, 23, 24, 25, 26, 30, 31, 32, 33]);
  assert.deepEqual([...result.pattern.backgroundMask], [0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1]);
  assert.deepEqual([...result.pattern.sourcePixels.slice(0, 8)], [16, 16, 16, 16, 17, 17, 17, 17]);
  assert.equal(original.width, 7);
  assert.equal(original.indices.length, 42);
});

test('扩展图纸会居中保留原图并用不计数空白填充新增格子', () => {
  const result = resizePattern(makePattern(3, 2), 6, 5, 250);
  const { pattern } = result;

  assert.equal(pattern.width, 6);
  assert.equal(pattern.height, 5);
  assert.deepEqual([...pattern.indices], [
    250, 250, 250, 250, 250, 250,
    250, 250, 250, 250, 250, 250,
    250, 250, 0, 1, 2, 250,
    250, 250, 3, 4, 5, 250,
    250, 250, 250, 250, 250, 250,
  ]);
  assert.deepEqual([...pattern.backgroundMask.slice(12, 24)], [1, 1, 0, 1, 0, 1, 1, 1, 1, 0, 1, 1]);
  assert.deepEqual([...pattern.sourcePixels.slice(0, 4)], [255, 255, 255, 255]);
  assert.deepEqual([...pattern.sourcePixels.slice((2 * 6 + 2) * 4, (2 * 6 + 2) * 4 + 4)], [0, 0, 0, 0]);
});

test('一个方向扩展、另一个方向裁切时会同时正确处理', () => {
  const result = resizePattern(makePattern(3, 4), 5, 3, 250);
  assert.deepEqual([...result.pattern.indices], [
    250, 3, 4, 5, 250,
    250, 6, 7, 8, 250,
    250, 9, 10, 11, 250,
  ]);
  assert.equal(result.adjustments.expandLeft, 1);
  assert.equal(result.adjustments.expandRight, 1);
  assert.equal(result.adjustments.cropTop, 1);
  assert.equal(result.adjustments.cropBottom, 0);
});

test('扩展需要有效空白颜色，尺寸不变时拒绝修改', () => {
  const pattern = makePattern(20, 20);
  assert.throws(() => resizePattern(pattern, 21, 20), /空白颜色/);
  assert.throws(() => resizePattern(pattern, 20, 20, 250), /需要与当前图纸不同/);
});
