import test from 'node:test';
import assert from 'node:assert/strict';

let messages = [];
globalThis.self = { postMessage: (message) => messages.push(message) };
await import('../src/workers/pattern.worker.js');
const palette = [
  { code: 'H2', rgb: [255, 255, 255] }, { code: 'H7', rgb: [0, 0, 0] },
  { code: 'F5', rgb: [230, 10, 20] }, { code: 'C1', rgb: [0, 100, 200] }, { code: 'A1', rgb: [250, 220, 10] },
];

function run(overrides = {}) {
  messages = [];
  const pixels = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 256; i++) pixels.set([...palette[i % palette.length].rgb, 255], i * 4);
  self.onmessage({ data: { type: 'generate', id: 1, width: 16, height: 16, pixels: pixels.buffer,
    palette, maxColors: 2, reduceIsolated: true, mergeColors: true,
    allowedPaletteIndices: [0, 2, 3, 4], limitAllowedColors: true,
    ...overrides,
  } });
  return messages.find((message) => message.type === 'result' || message.type === 'error');
}

test('受限色板与颜色数量上限同时生效，保护轮廓不会偷偷加入H7', () => {
  for (const orderedColorCleanup of [false, true]) {
    const result = run({ orderedColorCleanup, subjectMask: new Uint8Array(256).fill(1).buffer });
    assert.equal(result.type, 'result');
    const used = new Set(new Uint8Array(result.indices));
    assert.ok(used.size <= 2);
    assert.ok([...used].every((index) => [0, 2, 3, 4].includes(index)));
  }
});

test('仅有一种颜色、主体全空和空色板都有明确结果', () => {
  const result = run({ allowedPaletteIndices: [2], subjectMask: new Uint8Array(256).buffer });
  assert.deepEqual([...new Set(new Uint8Array(result.indices))], [2]);
  assert.equal(run({ allowedPaletteIndices: [] }).type, 'error');
});
