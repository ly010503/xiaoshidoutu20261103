import test from 'node:test';
import assert from 'node:assert/strict';
import { getPatternPosition } from '../src/pattern/mirror.js';

test('镜像导出只水平反转图案位置', () => {
  assert.equal(getPatternPosition(4, 0, 0, true), 3);
  assert.equal(getPatternPosition(4, 3, 0, true), 0);
  assert.equal(getPatternPosition(4, 1, 1, true), 6);
  assert.equal(getPatternPosition(4, 1, 1, false), 5);
});
