import { deltaE76, rgbToLab } from '../color/colorSpace.js';

const CARDINAL_OFFSETS = [
  [-1, 0], [1, 0], [0, -1], [0, 1],
];

// 以下参数用用户手改定稿的图纸逐格对照调出：
// 线条格判定、相近色合并和平滑强度在一个较宽的范围内都稳定，取的是中间值。
const SOLID_LINE_COVERAGE = 0.63;
const RIDGE_LINE_COVERAGE = 0.38;
const DARK_NEUTRAL_LIGHTNESS = 22;
const DARK_NEUTRAL_CHROMA = 12;
const MERGE_DISTANCE = 6;
const SMOOTHING_WEIGHT = 3;
const SMOOTHING_SIGMA = 12;
const SMOOTHING_ITERATIONS = 3;
const ISOLATED_MERGE_DISTANCE = 12;

function createNearestFinder(palette, candidates) {
  const cache = new Map();
  return (lab) => {
    const key = `${lab.l.toFixed(2)},${lab.a.toFixed(2)},${lab.b.toFixed(2)}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let best = candidates[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const index of candidates) {
      const distance = deltaE76(lab, palette[index].lab);
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    }
    cache.set(key, best);
    return best;
  };
}

function isDarkNeutral(color) {
  return color.lab.l < DARK_NEUTRAL_LIGHTNESS
    && Math.hypot(color.lab.a, color.lab.b) < DARK_NEUTRAL_CHROMA;
}

function pixelLab(pixels, position) {
  const offset = position * 4;
  return rgbToLab(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
}

function forEachCardinal(position, width, height, visit) {
  const x = position % width;
  const y = Math.floor(position / width);
  for (const [offsetX, offsetY] of CARDINAL_OFFSETS) {
    const nx = x + offsetX;
    const ny = y + offsetY;
    if (nx >= 0 && nx < width && ny >= 0 && ny < height) visit(ny * width + nx);
  }
}

function createSubjectOutline(subject, width, height) {
  const outline = new Uint8Array(width * height);
  for (let position = 0; position < outline.length; position += 1) {
    if (!subject[position]) continue;
    const x = position % width;
    const y = Math.floor(position / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1
      || !subject[position - 1] || !subject[position + 1]
      || !subject[position - width] || !subject[position + width]) {
      outline[position] = 1;
    }
  }
  return outline;
}

/**
 * 原图线稿穿过格子时，只有“实心暗格”和线条横截面上最暗的一格算作线条格，
 * 这样 0.3～0.7 格宽的线既不会断，也不会被画成两格粗。
 */
function findLineCells(lineCoverage, subject, outline, width, height) {
  const lines = [];
  const coverageAt = (x, y) => (
    x < 0 || y < 0 || x >= width || y >= height ? 0 : lineCoverage[y * width + x] / 255
  );
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const position = y * width + x;
      if (!subject[position] || outline[position]) continue;
      const value = lineCoverage[position] / 255;
      if (value >= SOLID_LINE_COVERAGE) {
        lines.push(position);
        continue;
      }
      if (value < RIDGE_LINE_COVERAGE) continue;
      const left = coverageAt(x - 1, y), right = coverageAt(x + 1, y);
      const top = coverageAt(x, y - 1), bottom = coverageAt(x, y + 1);
      const ridgeX = value >= left && value >= right && (left < value || right < value);
      const ridgeY = value >= top && value >= bottom && (top < value || bottom < value);
      if (ridgeX || ridgeY) lines.push(position);
    }
  }
  return lines;
}

function countColors(indices, subject) {
  const counts = new Map();
  for (let position = 0; position < indices.length; position += 1) {
    if (!subject[position]) continue;
    counts.set(indices[position], (counts.get(indices[position]) || 0) + 1);
  }
  return counts;
}

/**
 * 色差很小的近似色号（如一串近白 H2/H17/H18）并入用量更多的那个，H7 轮廓色不参与。
 */
function mergeSimilarColors(indices, subject, palette, outlineIndex) {
  const ranked = [...countColors(indices, subject).entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([index]) => index);
  const kept = [];
  const replacement = new Map();
  for (const index of ranked) {
    if (index === outlineIndex) continue;
    const target = kept.find((keptIndex) => deltaE76(palette[index].lab, palette[keptIndex].lab) < MERGE_DISTANCE);
    if (target === undefined) kept.push(index);
    else replacement.set(index, target);
  }
  for (let position = 0; position < indices.length; position += 1) {
    const target = replacement.get(indices[position]);
    if (target !== undefined) indices[position] = target;
  }
}

function limitColorCount(indices, subject, palette, outlineIndex, maxColors) {
  const ranked = [...countColors(indices, subject).entries()]
    .sort((first, second) => second[1] - first[1])
    .map(([index]) => index);
  const limit = Math.max(1, Math.floor(maxColors) || 1);
  if (ranked.length <= limit) return;
  const kept = ranked.slice(0, limit);
  // 轮廓一旦出现就必须保留，挤掉用量最少的填充色。
  if (ranked.includes(outlineIndex) && !kept.includes(outlineIndex)) kept[kept.length - 1] = outlineIndex;
  const fills = kept.filter((index) => index !== outlineIndex);
  const findNearest = createNearestFinder(palette, fills.length ? fills : kept);
  const replacement = new Map();
  for (const index of ranked) {
    if (!kept.includes(index)) replacement.set(index, findNearest(palette[index].lab));
  }
  for (let position = 0; position < indices.length; position += 1) {
    const target = replacement.get(indices[position]);
    if (target !== undefined) indices[position] = target;
  }
}

/**
 * 温和的邻域平滑：每格在“贴近原图”和“与原图相近的邻格同色”之间取舍，
 * 只在已有的邻格颜色中选择，线条格和轮廓不参与，阴影线和五官得以保留。
 */
function smoothNeighbors(indices, cellLabs, subject, locked, palette, width, height) {
  for (let iteration = 0; iteration < SMOOTHING_ITERATIONS; iteration += 1) {
    let changes = 0;
    for (let position = 0; position < indices.length; position += 1) {
      if (!subject[position] || locked[position]) continue;
      const neighbors = [];
      forEachCardinal(position, width, height, (neighbor) => {
        if (subject[neighbor] && !locked[neighbor]) neighbors.push(neighbor);
      });
      if (!neighbors.length) continue;
      const cost = (candidate) => {
        let value = deltaE76(cellLabs[position], palette[candidate].lab);
        for (const neighbor of neighbors) {
          if (indices[neighbor] === candidate) continue;
          const sourceDistance = deltaE76(cellLabs[position], cellLabs[neighbor]);
          value += SMOOTHING_WEIGHT * Math.exp(-((sourceDistance / SMOOTHING_SIGMA) ** 2));
        }
        return value;
      };
      const current = indices[position];
      let best = current;
      let bestCost = cost(current);
      for (const candidate of new Set(neighbors.map((neighbor) => indices[neighbor]))) {
        if (candidate === current) continue;
        const candidateCost = cost(candidate);
        if (candidateCost < bestCost - 0.3) {
          best = candidate;
          bestCost = candidateCost;
        }
      }
      if (best !== current) {
        indices[position] = best;
        changes += 1;
      }
    }
    if (!changes) break;
  }
}

function mergeIsolatedCells(indices, subject, locked, palette, width, height) {
  const result = new Uint8Array(indices);
  for (let position = 0; position < indices.length; position += 1) {
    if (!subject[position] || locked[position]) continue;
    const current = indices[position];
    const tally = new Map();
    let hasSameNeighbor = false;
    forEachCardinal(position, width, height, (neighbor) => {
      if (!subject[neighbor]) return;
      if (indices[neighbor] === current) hasSameNeighbor = true;
      else if (!locked[neighbor]) tally.set(indices[neighbor], (tally.get(indices[neighbor]) || 0) + 1);
    });
    if (hasSameNeighbor) continue;
    const [dominant, count] = [...tally.entries()].sort((first, second) => second[1] - first[1])[0] || [-1, 0];
    if (count >= 3 && deltaE76(palette[current].lab, palette[dominant].lab) < ISOLATED_MERGE_DISTANCE) {
      result[position] = dominant;
    }
  }
  return result;
}

/**
 * “有序”颜色效果：
 * 1. 每格用整格平均色匹配色号，线条只占一部分的格子自然得到深一号的同色系颜色；
 * 2. 主体外圈固定一格轮廓色，内部只有实心暗格和线条中脊才成为线条格；
 *    线条本身接近中性黑时用轮廓色（H7），有颜色的深线（深绿瞳孔、深红褶皱）保留本色；
 * 3. 合并近似色、限制颜色数量，再做温和平滑和孤立格整理。
 */
export function createOrderedPattern({
  width,
  height,
  palette,
  pixels,
  lineCoverage = null,
  linePixels = null,
  subjectMask = null,
  candidates,
  outlineIndex = -1,
  maxColors = palette.length,
}) {
  const size = width * height;
  const subject = subjectMask?.length === size ? subjectMask : new Uint8Array(size).fill(1);
  const findNearest = createNearestFinder(palette, candidates);
  const cellLabs = Array.from({ length: size }, (_, position) => pixelLab(pixels, position));
  const indices = new Uint8Array(size);
  for (let position = 0; position < size; position += 1) {
    indices[position] = findNearest(cellLabs[position]);
  }

  const hasOutline = outlineIndex >= 0;
  const outline = hasOutline && subjectMask?.length === size
    ? createSubjectOutline(subject, width, height)
    : new Uint8Array(size);
  const locked = new Uint8Array(size);
  if (hasOutline) {
    for (let position = 0; position < size; position += 1) {
      if (subject[position] && isDarkNeutral(palette[indices[position]])) indices[position] = outlineIndex;
    }
  }
  if (lineCoverage?.length === size) {
    for (const position of findLineCells(lineCoverage, subject, outline, width, height)) {
      const lineIndex = linePixels ? findNearest(pixelLab(linePixels, position)) : outlineIndex;
      indices[position] = hasOutline && (lineIndex < 0 || isDarkNeutral(palette[lineIndex])) ? outlineIndex : lineIndex;
      locked[position] = 1;
    }
  }
  for (let position = 0; position < size; position += 1) {
    if (outline[position]) indices[position] = outlineIndex;
    if (hasOutline && indices[position] === outlineIndex) locked[position] = 1;
  }

  mergeSimilarColors(indices, subject, palette, outlineIndex);
  limitColorCount(indices, subject, palette, outlineIndex, maxColors);
  smoothNeighbors(indices, cellLabs, subject, locked, palette, width, height);
  return mergeIsolatedCells(indices, subject, locked, palette, width, height);
}
