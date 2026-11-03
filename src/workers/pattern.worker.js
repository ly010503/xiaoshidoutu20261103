import { deltaE76, rgbToLab } from '../color/colorSpace.js';
import { choosePaletteIndices, shouldProtectAccent } from '../pattern/paletteLimit.js';
import { createOutlineMask, findOutlinePaletteIndex } from '../pattern/outlineProtection.js';
import { createOrderedPattern } from '../pattern/orderedPattern.js';

function postProgress(progress, text) { self.postMessage({ type: 'progress', progress, text }); }

function nearest(lab, palette, allowed = null) {
  let best = allowed ? allowed[0] : 0, distance = Infinity;
  const candidates = allowed || palette.map((_, index) => index);
  for (const index of candidates) {
    const current = deltaE76(lab, palette[index].lab);
    if (current < distance) { distance = current; best = index; }
  }
  return best;
}

function cleanIsolated(indices, width, height, palette, protectedMask = null) {
  const result = new Uint8Array(indices);
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const pos = y * width + x, current = indices[pos], counts = new Map();
    if (protectedMask?.[pos]) continue;
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
      if (ox === 0 && oy === 0) continue;
      const value = indices[(y + oy) * width + (x + ox)];
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (dominant && dominant[1] >= 5 && dominant[0] !== current && (counts.get(current) || 0) <= 1) {
      const currentColor = palette[current], dominantColor = palette[dominant[0]];
      const protectedAccent = shouldProtectAccent(currentColor, dominantColor);
      if (!protectedAccent && deltaE76(currentColor.lab, dominantColor.lab) < 32) result[pos] = dominant[0];
    }
  }
  return result;
}

self.onmessage = ({ data }) => {
  if (data.type !== 'generate') return;
  try {
    const {
      id,
      width,
      height,
      maxColors,
      reduceIsolated,
      mergeColors,
      protectDarkOutline = true,
      orderedColorCleanup = false,
      subjectMask: subjectMaskBuffer = null,
      lineCoverage: lineCoverageBuffer = null,
      linePixels: linePixelsBuffer = null,
      allowedPaletteIndices,
      limitAllowedColors = false,
      pixels: buffer,
    } = data;
    const pixels = new Uint8ClampedArray(buffer);
    const subjectMask = subjectMaskBuffer ? new Uint8Array(subjectMaskBuffer) : null;
    const palette = data.palette.map((color) => ({ ...color, lab: rgbToLab(...color.rgb) }));
    const legendAllowed = Array.isArray(allowedPaletteIndices)
      ? [...new Set(allowedPaletteIndices)].filter((index) => Number.isInteger(index) && index >= 0 && index < palette.length)
      : null;
    const constrainedCandidates = legendAllowed?.length ? legendAllowed : null;
    if (legendAllowed && !legendAllowed.length) throw new Error('可用色板为空');
    const allCandidates = palette.map((_, index) => index);
    const baseCandidates = constrainedCandidates || allCandidates;
    // 轮廓优先用 H7；受限色板改用已有色号中的最深色。
    const outlineCandidate = protectDarkOutline ? findOutlinePaletteIndex(baseCandidates.map((index) => palette[index])) : -1;
    const outlineIndex = outlineCandidate < 0 ? -1 : baseCandidates[outlineCandidate];

    if (orderedColorCleanup) {
      postProgress(40, '正在整理有序色块');
      const indices = createOrderedPattern({
        width,
        height,
        palette,
        pixels,
        lineCoverage: lineCoverageBuffer ? new Uint8Array(lineCoverageBuffer) : null,
        linePixels: linePixelsBuffer ? new Uint8ClampedArray(linePixelsBuffer) : null,
        subjectMask,
        candidates: baseCandidates,
        outlineIndex,
        maxColors: constrainedCandidates && !limitAllowedColors ? baseCandidates.length : maxColors,
      });
      postProgress(94, '正在生成统计');
      self.postMessage({ type: 'result', id, width, height, indices: indices.buffer }, [indices.buffer]);
      return;
    }

    const outlineMask = protectDarkOutline ? createOutlineMask(pixels, width, height, { subjectMask }) : null;
    const raw = new Uint8Array(width * height);
    const counts = new Uint32Array(palette.length);
    let activePixelTotal = 0;
    const hasProtectedOutline = outlineIndex >= 0 && outlineMask?.some(Boolean);
    const matchCache = new Map();
    postProgress(34, '正在分析颜色');
    for (let i = 0; i < raw.length; i += 1) {
      const offset = i * 4;
      const key = `${pixels[offset] >> 3},${pixels[offset + 1] >> 3},${pixels[offset + 2] >> 3}`;
      let index = matchCache.get(key);
      if (index === undefined) {
        index = nearest(rgbToLab(pixels[offset], pixels[offset + 1], pixels[offset + 2]), palette, baseCandidates);
        matchCache.set(key, index);
      }
      raw[i] = index;
      if (!subjectMask || subjectMask[i]) {
        counts[index] += 1;
        activePixelTotal += 1;
      }
      if (i > 0 && i % 12000 === 0) postProgress(34 + Math.round((i / raw.length) * 30), '正在匹配色卡');
    }
    let allowed = constrainedCandidates && !limitAllowedColors
      ? constrainedCandidates.filter((index) => counts[index] > 0)
      : choosePaletteIndices(counts, maxColors, activePixelTotal || raw.length, palette);
    allowed = allowed.filter((index) => baseCandidates.includes(index));
    if (!allowed.length) allowed = [baseCandidates[0]];
    if (mergeColors) {
      const merged = [];
      for (const index of allowed) {
        const similar = merged.some((kept) => deltaE76(palette[index].lab, palette[kept].lab) < 4.5);
        if (!similar) merged.push(index);
      }
      allowed = merged;
    }
    if (hasProtectedOutline && !allowed.includes(outlineIndex)) {
      if (allowed.length >= Math.max(1, maxColors)) allowed[allowed.length - 1] = outlineIndex;
      else allowed.push(outlineIndex);
    }
    postProgress(68, '正在压缩颜色');
    const remap = new Map();
    for (const index of [...counts.keys()]) {
      if (allowed.includes(index)) continue;
      remap.set(index, nearest(palette[index].lab, palette, allowed));
    }
    for (let i = 0; i < raw.length; i += 1) if (remap.has(raw[i])) raw[i] = remap.get(raw[i]);
    postProgress(82, '正在优化图纸');
    const indices = reduceIsolated ? cleanIsolated(raw, width, height, palette, outlineMask) : raw;
    if (hasProtectedOutline) {
      for (let i = 0; i < indices.length; i += 1) {
        if (outlineMask[i]) indices[i] = outlineIndex;
      }
    }
    postProgress(94, '正在生成统计');
    self.postMessage({ type: 'result', id, width, height, indices: indices.buffer }, [indices.buffer]);
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Worker 生成失败' });
  }
};
