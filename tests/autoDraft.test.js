import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoDraft } from '../src/project/autoDraft.js';

test('慢保存期间的新修改会串行保存，最终草稿不会回退', async () => {
  let release;
  let started;
  const entered = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const saved = [];
  let value = 1;
  const controller = createAutoDraft({
    delay: 60_000,
    capture: async () => ({ value }),
    write: async (draft) => {
      if (draft.value === 1) { started(); await gate; }
      saved.push(draft.value);
    },
  });
  controller.schedule();
  const pending = controller.flush();
  await entered;
  value = 2;
  controller.schedule();
  const joined = controller.flush();
  release();
  await Promise.all([pending, joined]);
  assert.deepEqual(saved, [1, 2]);
  assert.equal(controller.pending, false);
});

test('存储失败保留待保存状态，重试后能保存最新内容', async () => {
  let fail = true;
  let saved;
  let status;
  const controller = createAutoDraft({
    delay: 60_000,
    capture: async () => ({ value: 7 }),
    write: async (draft) => { if (fail) throw new Error('quota'); saved = draft; },
    onStatus: (value) => { status = value; },
  });
  controller.schedule();
  await controller.flush();
  assert.equal(status, 'error');
  assert.equal(controller.pending, true);
  fail = false;
  await controller.flush();
  assert.deepEqual(saved, { value: 7 });
  assert.equal(status, 'saved');
  assert.equal(controller.pending, false);
});
