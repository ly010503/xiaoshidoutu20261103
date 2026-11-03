import test from 'node:test';
import assert from 'node:assert/strict';
import { hitTestPatternCell } from '../src/canvas/hitTest.js';

test('制作图点击位置能准确映射到格子', () => {
  const pattern = { width: 4, height: 3, indices: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) };
  const layout = { gridX: 20, gridY: 30 };

  assert.deepEqual(hitTestPatternCell(45, 55, pattern, layout, 10), {
    x: 2,
    y: 2,
    position: 10,
    colorIndex: 10,
  });
  assert.equal(hitTestPatternCell(19, 55, pattern, layout, 10), null);
  assert.equal(hitTestPatternCell(60, 55, pattern, layout, 10), null);
});

test('镜像查看时点击位置换算回图纸数据的列', () => {
  const pattern = { width: 4, height: 2, indices: Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]) };
  const layout = { gridX: 0, gridY: 0 };
  const cell = hitTestPatternCell(5, 15, pattern, layout, 10, true);
  assert.equal(cell.x, 3, '屏幕最左一列对应数据最右一列');
  assert.equal(cell.position, 7);
  assert.equal(cell.colorIndex, 7);
});
