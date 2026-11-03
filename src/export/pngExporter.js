import {
  COPYRIGHT_NOTICE,
  drawEffect,
  drawPatternSheet,
  getSheetLayout,
} from '../canvas/patternPainter.js';
import { Zip, ZipPassThrough } from 'fflate';

const HIGHLIGHTED_EXPORT_VARIANTS = [
  { mirrorX: false, label: '正向' },
  { mirrorX: true, label: '镜像' },
];

export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function preferredCell(pattern, type) {
  const longestSide = Math.max(pattern.width, pattern.height || pattern.width);
  if (type === 'effect') {
    return pattern.width <= 30 ? 48 : pattern.width <= 40 ? 42 : pattern.width <= 60 ? 34 : 30;
  }
  if (longestSide > 150) return 48;
  return pattern.width <= 30 ? 64 : pattern.width <= 40 ? 54 : pattern.width <= 60 ? 44 : 36;
}

export function selectExportCell(pattern, statistics, type, deviceMemory = 4) {
  const preferred = preferredCell(pattern, type);
  const maxPixels = deviceMemory <= 2
    ? 48_000_000
    : deviceMemory <= 4
      ? 96_000_000
      : deviceMemory <= 8
        ? 144_000_000
        : 196_000_000;
  const maxSide = 16_000;
  let cell = preferred;
  while (cell >= 12) {
    if (type === 'effect') {
      const padding = Math.max(18, cell * 2);
      const footer = Math.max(80, Math.round(cell * 6));
      const width = pattern.width * cell + padding * 2;
      const height = pattern.height * cell + padding * 2 + footer;
      if (width <= maxSide && height <= maxSide && width * height <= maxPixels) {
        return { cell, reduced: cell < preferred };
      }
    } else {
      const layout = getSheetLayout(pattern, statistics, cell);
      if (
        layout.paperWidth <= maxSide
        && layout.paperHeight <= maxSide
        && layout.paperWidth * layout.paperHeight <= maxPixels
      ) {
        return { cell, reduced: cell < preferred };
      }
    }
    cell -= 2;
  }
  return { cell: 12, reduced: true };
}

function safeCell(pattern, statistics, type) {
  const memory = typeof navigator === 'undefined' ? 4 : navigator.deviceMemory || 4;
  return selectExportCell(pattern, statistics, type, memory);
}

async function toBlob(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG 生成失败，请尝试较小的图纸尺寸');
  return blob;
}

async function renderWithFallback(draw, selection) {
  let cell = selection.cell;
  let lastError;
  while (cell >= 12) {
    const canvas = document.createElement('canvas');
    try {
      const ctx = canvas.getContext('2d');
      draw(ctx, cell);
      const blob = await toBlob(canvas);
      return { blob, width: canvas.width, height: canvas.height, cell, reduced: selection.reduced || cell < selection.cell };
    } catch (error) {
      lastError = error;
      canvas.width = 1; canvas.height = 1;
      cell -= 4;
    }
  }
  throw lastError || new Error('PNG 生成失败，请尝试较小的图纸尺寸');
}

export async function exportEffectPng(pattern, palette, { tiledWatermarkText = '' } = {}) {
  const selection = safeCell(pattern, [], 'effect');
  const result = await renderWithFallback(
    (ctx, cell) => drawEffect(ctx, pattern, palette, {
      cell,
      background: '#FFFDF8',
      showWatermark: true,
      tiledWatermarkText,
    }),
    selection,
  );
  download(result.blob, `拼豆高清效果图-${pattern.width}x${pattern.height}.png`);
  return result;
}

export async function exportPatternPng(pattern, palette, statistics, {
  mirrorX = false,
  tiledWatermarkText = '',
} = {}) {
  const selection = safeCell(pattern, statistics, 'pattern');
  const result = await renderWithFallback(
    (ctx, cell) => drawPatternSheet(ctx, pattern, palette, statistics, {
      cell,
      mirrorX,
      tiledWatermarkText,
      title: mirrorX ? `镜像制作图 · ${COPYRIGHT_NOTICE}` : COPYRIGHT_NOTICE,
    }),
    selection,
  );
  const kind = mirrorX ? '拼豆高清镜像制作图' : '拼豆高清制作图';
  download(result.blob, `${kind}-${pattern.width}x${pattern.height}.png`);
  return result;
}

export function highlightedExportFileName(code, pattern, { mirrorX = false } = {}) {
  const safeCode = String(code || '颜色').replace(/[^A-Za-z0-9_-]/g, '-');
  const kind = mirrorX ? '拼豆镜像分色定位图' : '拼豆分色定位图';
  return `${kind}-${safeCode}-${pattern.width}x${pattern.height}.png`;
}

export function highlightedExportZipEntryName(code, pattern, options = {}) {
  const folder = options.mirrorX ? '镜像' : '非镜像';
  return `${folder}/${highlightedExportFileName(code, pattern, options)}`;
}

export function allHighlightedExportFileName(pattern) {
  return `拼豆全部分色定位图-${pattern.width}x${pattern.height}.zip`;
}

async function renderHighlightedColor(pattern, palette, statistics, highlightedCode, {
  mirrorX = false,
  tiledWatermarkText = '',
} = {}) {
  const target = statistics.find((item) => item.code === highlightedCode);
  if (!target) throw new Error('请先从用豆清单中选择一种颜色');
  const targetStatistics = [target];
  const selection = safeCell(pattern, targetStatistics, 'pattern');
  const result = await renderWithFallback(
    (ctx, cell) => drawPatternSheet(ctx, pattern, palette, targetStatistics, {
      cell,
      highlightedCode,
      mirrorX,
      tiledWatermarkText,
    }),
    selection,
  );
  return { ...result, target };
}

export async function exportHighlightedColorPng(pattern, palette, statistics, highlightedCode, {
  tiledWatermarkText = '',
} = {}) {
  const result = await renderHighlightedColor(
    pattern,
    palette,
    statistics,
    highlightedCode,
    { tiledWatermarkText },
  );
  download(result.blob, highlightedExportFileName(result.target.code, pattern));
  return result;
}

export async function exportAllHighlightedColorsZip(pattern, palette, statistics, {
  tiledWatermarkText = '',
  onProgress = null,
} = {}) {
  if (!statistics.length) throw new Error('当前图纸没有可导出的颜色');

  const chunks = [];
  let settle;
  let fail;
  const completed = new Promise((resolve, reject) => { settle = resolve; fail = reject; });
  const zip = new Zip((error, data, final) => {
    if (error) { fail(error); return; }
    chunks.push(data);
    if (final) settle();
  });

  try {
    const total = statistics.length * HIGHLIGHTED_EXPORT_VARIANTS.length;
    let completedCount = 0;
    for (let index = 0; index < statistics.length; index += 1) {
      const target = statistics[index];
      for (const variant of HIGHLIGHTED_EXPORT_VARIANTS) {
        const result = await renderHighlightedColor(
          pattern,
          palette,
          statistics,
          target.code,
          { mirrorX: variant.mirrorX, tiledWatermarkText },
        );
        const entry = new ZipPassThrough(highlightedExportZipEntryName(target.code, pattern, variant));
        zip.add(entry);
        entry.push(new Uint8Array(await result.blob.arrayBuffer()), true);
        completedCount += 1;
        onProgress?.({ completed: completedCount, total, target, variant });
      }
    }
    zip.end();
    await completed;
  } catch (error) {
    zip.terminate?.();
    throw error;
  }

  const blob = new Blob(chunks, { type: 'application/zip' });
  download(blob, allHighlightedExportFileName(pattern));
  return {
    blobSize: blob.size,
    count: statistics.length,
    fileCount: statistics.length * HIGHLIGHTED_EXPORT_VARIANTS.length,
  };
}
