import { rgbToLab } from '../color/colorSpace.js';

const BACKGROUND_DISTANCE = 30;
const LINE_LIGHTNESS = 25;
const LINE_CHROMA = 18;

function distance(data, offset, rgb) {
  return Math.hypot(data[offset] - rgb[0], data[offset + 1] - rgb[1], data[offset + 2] - rgb[2]);
}

function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 255;
}

/**
 * 分析一张缩小后的图片（建议长边约 200px）：背景是否纯色、主体里黑色线稿占比、
 * 主色数量，以及相邻像素几乎相同的比例（像素画/Logo 的平涂特征）。
 */
export function analyzeImageForMode({ data, width, height }) {
  const border = [[], [], []];
  const collect = (x, y) => {
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel += 1) border[channel].push(data[offset + channel]);
  };
  for (let x = 0; x < width; x += 1) { collect(x, 0); collect(x, height - 1); }
  for (let y = 1; y < height - 1; y += 1) { collect(0, y); collect(width - 1, y); }
  const background = border.map(median);
  let borderMatches = 0;
  for (let index = 0; index < border[0].length; index += 1) {
    const rgb = [border[0][index], border[1][index], border[2][index]];
    if (Math.hypot(rgb[0] - background[0], rgb[1] - background[1], rgb[2] - background[2]) <= BACKGROUND_DISTANCE) borderMatches += 1;
  }
  const plainBackground = borderMatches / border[0].length >= 0.9;

  let foreground = 0, lineCount = 0, flatPairs = 0, pairs = 0;
  const buckets = new Map();
  const labCache = new Map();
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (x + 1 < width) {
        pairs += 1;
        if (distance(data, offset, [data[offset + 4], data[offset + 5], data[offset + 6]]) < 12) flatPairs += 1;
      }
      if (plainBackground && distance(data, offset, background) <= BACKGROUND_DISTANCE) continue;
      foreground += 1;
      const key = ((data[offset] >> 4) << 8) | ((data[offset + 1] >> 4) << 4) | (data[offset + 2] >> 4);
      buckets.set(key, (buckets.get(key) || 0) + 1);
      let lab = labCache.get(key);
      if (!lab) { lab = rgbToLab(data[offset], data[offset + 1], data[offset + 2]); labCache.set(key, lab); }
      if (lab.l < LINE_LIGHTNESS && Math.hypot(lab.a, lab.b) < LINE_CHROMA) lineCount += 1;
    }
  }
  // 覆盖主体 95% 像素所需的颜色桶数量，衡量“颜色多不多”。
  const sorted = [...buckets.values()].sort((a, b) => b - a);
  let covered = 0, dominantColors = 0;
  for (const count of sorted) {
    if (covered >= foreground * 0.95) break;
    covered += count;
    dominantColors += 1;
  }
  return {
    plainBackground,
    foregroundRatio: foreground / (width * height),
    lineRatio: foreground ? lineCount / foreground : 0,
    dominantColors,
    flatRatio: pairs ? flatPairs / pairs : 0,
  };
}

/**
 * 根据分析结果推荐颜色效果与颜色上限。规则刻意保守，只给出建议，由用户决定是否套用。
 */
export function recommendGenerationMode(analysis) {
  const { plainBackground, lineRatio, dominantColors, flatRatio } = analysis;
  if (plainBackground && lineRatio >= 0.03) {
    return { style: 'ordered', maxColors: 24, label: 'Q版 / 卡通插画', reason: '纯色背景、主体有黑色线稿' };
  }
  if (dominantColors <= 24 && flatRatio >= 0.8) {
    return {
      style: 'direct',
      maxColors: dominantColors <= 12 ? 15 : 24,
      label: '像素画 / Logo',
      reason: `颜色少（约 ${dominantColors} 种）、色块平整`,
    };
  }
  if (!plainBackground && dominantColors > 60) {
    return { style: 'natural', maxColors: 48, label: '照片', reason: '背景复杂、颜色层次丰富' };
  }
  return { style: 'vivid', maxColors: 24, label: '插画 / 海报', reason: '颜色鲜明、适合加强饱和度' };
}
