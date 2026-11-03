let worker;
let sequence = 0;
const pending = new Map();

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/pattern.worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.type === 'progress') {
      for (const task of pending.values()) task.onProgress?.(data.progress, data.text);
      return;
    }
    if (data.type === 'error') {
      for (const task of pending.values()) task.reject(new Error(data.message));
      pending.clear();
      return;
    }
    const task = pending.get(data.id);
    if (!task) return;
    pending.delete(data.id);
    task.resolve({ width: data.width, height: data.height, indices: new Uint8Array(data.indices) });
  };
  worker.onerror = (event) => {
    for (const task of pending.values()) task.reject(new Error(event.message || '图纸处理线程加载失败'));
    pending.clear();
  };
  return worker;
}

export function generatePattern({ pixels, width, height, palette, maxColors, reduceIsolated, mergeColors, protectDarkOutline = true, orderedColorCleanup = false, subjectMask = null, lineCoverage = null, linePixels = null, allowedPaletteIndices = null, limitAllowedColors = false, onProgress }) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    const transferable = pixels.buffer.slice(pixels.byteOffset, pixels.byteOffset + pixels.byteLength);
    const subjectTransferable = subjectMask
      ? subjectMask.buffer.slice(subjectMask.byteOffset, subjectMask.byteOffset + subjectMask.byteLength)
      : null;
    const lineCoverageTransferable = lineCoverage
      ? lineCoverage.buffer.slice(lineCoverage.byteOffset, lineCoverage.byteOffset + lineCoverage.byteLength)
      : null;
    const linePixelsTransferable = linePixels
      ? linePixels.buffer.slice(linePixels.byteOffset, linePixels.byteOffset + linePixels.byteLength)
      : null;
    const transfers = [transferable];
    if (subjectTransferable) transfers.push(subjectTransferable);
    if (lineCoverageTransferable) transfers.push(lineCoverageTransferable);
    if (linePixelsTransferable) transfers.push(linePixelsTransferable);
    getWorker().postMessage({ type: 'generate', id, pixels: transferable, width, height, palette, maxColors, reduceIsolated, mergeColors, protectDarkOutline, orderedColorCleanup, subjectMask: subjectTransferable, lineCoverage: lineCoverageTransferable, linePixels: linePixelsTransferable, allowedPaletteIndices, limitAllowedColors }, transfers);
  });
}
