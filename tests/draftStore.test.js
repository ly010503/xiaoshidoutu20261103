import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDraftId,
  selectDraftsToPrune,
  sortDraftSummaries,
  summarizeDraft,
} from '../src/project/draftStore.js';

test('草稿摘要只保留列表需要的字段', () => {
  const summary = summarizeDraft('draft-1', {
    name: '小猫', updatedAt: '2026-10-26T03:00:00.000Z', thumbnail: 'data:image/png;base64,AA',
    project: { image: { dataUrl: 'very-large' }, pattern: { width: 70, height: 104 } },
  });
  assert.deepEqual(summary, {
    id: 'draft-1', name: '小猫', updatedAt: '2026-10-26T03:00:00.000Z',
    thumbnail: 'data:image/png;base64,AA', width: 70, height: 104,
  });
  assert.equal(summarizeDraft('draft-2', { project: {} }).name, '未命名图纸');
});

test('图纸按最近修改排序，超出上限时清理最旧的', () => {
  const summaries = [
    { id: 'a', updatedAt: '2026-10-20T00:00:00Z' },
    { id: 'b', updatedAt: '2026-10-26T00:00:00Z' },
    { id: 'c', updatedAt: '2026-10-23T00:00:00Z' },
  ];
  assert.deepEqual(sortDraftSummaries(summaries).map((item) => item.id), ['b', 'c', 'a']);
  assert.deepEqual(selectDraftsToPrune(summaries, 2), ['a']);
  assert.deepEqual(selectDraftsToPrune(summaries, 5), []);
});

test('每份图纸编号互不相同', () => {
  const ids = new Set(Array.from({ length: 50 }, createDraftId));
  assert.equal(ids.size, 50);
});
