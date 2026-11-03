import test from 'node:test';
import assert from 'node:assert/strict';
import { ResultCanvasRenderer } from '../src/canvas/resultCanvasRenderer.js';

function setup(tool = 'brush') {
  const listeners = new Map();
  const context = {};
  const canvas = { getContext: () => context };
  globalThis.document = { createElement: () => canvas };
  globalThis.ResizeObserver = class { observe() {} };
  const stage = {
    addEventListener: (type, handler) => listeners.set(type, handler),
    setPointerCapture() {},
  };
  const state = { editTool: tool, previewMode: 'pattern', generating: false, viewport: { zoom: 1, x: 0, y: 0 } };
  const calls = [];
  const renderer = new ResultCanvasRenderer(canvas, stage, () => state, null, {
    start: (cell) => calls.push(['start', cell.position]),
    move: (cell) => calls.push(['move', cell.position]),
    end: (cancelled) => calls.push(['end', cancelled]),
  });
  renderer.draw = () => {};
  renderer.hitTestCell = (x) => ({ position: x });
  renderer.queueTap = () => calls.push(['tap']);
  const fire = (type, id, x, pointerType = 'mouse') => listeners.get(type)({
    pointerId: id, clientX: x, clientY: 10, pointerType, button: 0,
    target: { closest: () => null },
  });
  return { fire, state, calls };
}

test('连续鼠标或触屏一笔只开始和提交一次，绘制时不会平移画布', () => {
  for (const pointerType of ['mouse', 'touch']) {
    const { fire, state, calls } = setup();
    fire('pointerdown', 1, 1, pointerType);
    fire('pointermove', 1, 10, pointerType);
    fire('pointermove', 1, 20, pointerType);
    fire('pointerup', 1, 25, pointerType);
    fire('lostpointercapture', 1, 25, pointerType);
    assert.deepEqual(calls, [['start', 1], ['move', 10], ['move', 20], ['move', 25], ['end', false]]);
    assert.deepEqual(state.viewport, { zoom: 1, x: 0, y: 0 });
  }
});

test('双指接管会取消尚未提交的一笔，抬起后不会误触换色', () => {
  const { fire, calls, state } = setup();
  fire('pointerdown', 1, 5, 'touch');
  fire('pointerdown', 2, 15, 'touch');
  fire('pointerdown', 3, 30, 'touch');
  fire('pointerup', 3, 30, 'touch');
  fire('pointermove', 2, 25, 'touch');
  fire('pointerup', 2, 25, 'touch');
  fire('pointerup', 1, 5, 'touch');
  assert.deepEqual(calls, [['start', 5], ['end', true]]);
  assert.equal(state.viewport.zoom, 2);
});

test('中断绘制会取消整笔；移动工具只平移，不触发单格换色', () => {
  const drawing = setup();
  drawing.fire('pointerdown', 1, 1);
  drawing.fire('pointercancel', 1, 2);
  assert.deepEqual(drawing.calls.at(-1), ['end', true]);
  const moving = setup('move');
  moving.fire('pointerdown', 1, 1);
  moving.fire('pointermove', 1, 20);
  moving.fire('pointerup', 1, 20);
  assert.equal(moving.state.viewport.x, 19);
  assert.deepEqual(moving.calls, []);
});
