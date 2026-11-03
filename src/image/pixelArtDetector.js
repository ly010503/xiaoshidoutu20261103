// 像素画网格识别：放大过的像素画里，颜色只在“像素块”的边界上变化，边界间距就是一个像素块的大小。
// 识别成功后每个像素块取一颗豆，原样还原像素画，不再重新缩放取色。

const EDGE_DIFFERENCE = 60;
const MIN_PERIOD = 2;
const MAX_PERIOD = 64;
const PERIOD_STEP = 0.01;
const MIN_ALIGNMENT = 0.9;
const MIN_UNIFORMITY = 0.9;
const MAX_NATIVE_SIDE = 128;
const MAX_NATIVE_COLORS = 64;

function opaque(data, offset) {
  return data[offset + 3] >= 128;
}

function colorDifference(data, a, b) {
  const aOpaque = opaque(data, a);
  if (aOpaque !== opaque(data, b)) return 255 * 3;
  if (!aOpaque) return 0;
  return Math.abs(data[a] - data[b]) + Math.abs(data[a + 1] - data[b + 1]) + Math.abs(data[a + 2] - data[b + 2]);
}

/** 每条纵向（axis = 'x'）或横向边界上，相邻两列/两行颜色突变的行数占比。 */
export function measureEdgeWeights({ data, width, height }, axis) {
  const length = axis === 'x' ? width : height;
  const span = axis === 'x' ? height : width;
  const weights = new Float32Array(length);
  for (let boundary = 1; boundary < length; boundary += 1) {
    let changes = 0;
    for (let along = 0; along < span; along += 1) {
      const a = axis === 'x' ? (along * width + boundary - 1) * 4 : ((boundary - 1) * width + along) * 4;
      const b = axis === 'x' ? a + 4 : a + width * 4;
      if (colorDifference(data, a, b) > EDGE_DIFFERENCE) changes += 1;
    }
    weights[boundary] = changes / span;
  }
  return weights;
}

/**
 * 用边界位置的圆周平均找像素块间距：边界都落在 offset + k·period 上时一致度接近 1。
 * 间距的约数同样一致，所以取一致度达标的最大间距，再在附近找最准的值。
 */
export function estimatePeriod(weights) {
  const edges = [];
  let total = 0;
  for (let position = 1; position < weights.length; position += 1) {
    if (weights[position] < 0.01) continue;
    edges.push([position, weights[position]]);
    total += weights[position];
  }
  // 像素块至少 2 像素宽，边界最多占一半位置；照片几乎处处有突变，直接排除，也省去逐个间距计算。
  if (edges.length < 2 || edges.length > weights.length / 2 + 1) return null;
  const alignment = (period) => {
    let cos = 0, sin = 0;
    for (const [position, weight] of edges) {
      const angle = (2 * Math.PI * position) / period;
      cos += weight * Math.cos(angle);
      sin += weight * Math.sin(angle);
    }
    return { score: Math.hypot(cos, sin) / total, angle: Math.atan2(sin, cos) };
  };
  const maxPeriod = Math.min(MAX_PERIOD, weights.length / 2);
  let largest = null;
  for (let period = maxPeriod; period >= MIN_PERIOD; period -= PERIOD_STEP) {
    if (alignment(period).score >= MIN_ALIGNMENT) { largest = period; break; }
  }
  if (largest === null) return null;
  let best = { period: largest, ...alignment(largest) };
  for (let period = largest * 0.97; period < largest; period += PERIOD_STEP) {
    const candidate = alignment(period);
    if (candidate.score > best.score) best = { period, ...candidate };
  }
  const offset = (((best.angle / (2 * Math.PI)) * best.period) % best.period + best.period) % best.period;
  return { period: best.period, offset, score: best.score };
}

/** 网格起点和格数：开头不足半格的残块并入画面外，超过半格的残块算一格。 */
function gridAxis(offset, period, length) {
  const start = offset > period / 2 ? offset - period : offset;
  return { start, count: Math.max(1, Math.round((length - start) / period)) };
}

/** 取每个像素块中间一半区域的平均色，抵消 JPEG 压缩在边界附近的噪点。 */
function sampleCells(image, xAxis, yAxis, period) {
  const { data, width, height } = image;
  const pixels = new Uint8ClampedArray(xAxis.count * yAxis.count * 4);
  for (let row = 0; row < yAxis.count; row += 1) {
    const top = Math.max(0, Math.floor(yAxis.start + (row + 0.25) * period));
    const bottom = Math.min(height - 1, Math.max(top, Math.ceil(yAxis.start + (row + 0.75) * period) - 1));
    for (let column = 0; column < xAxis.count; column += 1) {
      const left = Math.max(0, Math.floor(xAxis.start + (column + 0.25) * period));
      const right = Math.min(width - 1, Math.max(left, Math.ceil(xAxis.start + (column + 0.75) * period) - 1));
      let red = 0, green = 0, blue = 0, count = 0, transparent = 0;
      for (let y = top; y <= bottom; y += 1) {
        for (let x = left; x <= right; x += 1) {
          const offset = (y * width + x) * 4;
          if (!opaque(data, offset)) { transparent += 1; continue; }
          red += data[offset]; green += data[offset + 1]; blue += data[offset + 2]; count += 1;
        }
      }
      const target = (row * xAxis.count + column) * 4;
      if (count > transparent) pixels.set([red / count, green / count, blue / count, 255], target);
      else pixels.set([255, 255, 255, 0], target);
    }
  }
  return pixels;
}

/** 抽查原图像素与所在像素块颜色是否一致，排除照片等边界碰巧整齐的图片。 */
function measureUniformity(image, xAxis, yAxis, period, cells) {
  const { data, width, height } = image;
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / 40000)));
  let matched = 0, checked = 0;
  for (let y = 0; y < height; y += stride) {
    const row = Math.floor((y + 0.5 - yAxis.start) / period);
    if (row < 0 || row >= yAxis.count) continue;
    for (let x = 0; x < width; x += stride) {
      const column = Math.floor((x + 0.5 - xAxis.start) / period);
      if (column < 0 || column >= xAxis.count) continue;
      const offset = (y * width + x) * 4;
      const cell = (row * xAxis.count + column) * 4;
      checked += 1;
      const pixelOpaque = opaque(data, offset);
      if (pixelOpaque !== (cells[cell + 3] >= 128)) continue;
      if (!pixelOpaque || Math.abs(data[offset] - cells[cell]) + Math.abs(data[offset + 1] - cells[cell + 1])
        + Math.abs(data[offset + 2] - cells[cell + 2]) <= EDGE_DIFFERENCE) matched += 1;
    }
  }
  return checked ? matched / checked : 0;
}

function countDistinctColors(image, limit) {
  const colors = new Set();
  for (let offset = 0; offset < image.data.length; offset += 4) {
    colors.add(opaque(image.data, offset)
      ? (image.data[offset] << 16) | (image.data[offset + 1] << 8) | image.data[offset + 2]
      : -1);
    if (colors.size > limit) break;
  }
  return colors.size;
}

/**
 * 识别像素画：返回像素块大小、格数和每格颜色（RGBA，透明格 alpha 为 0）；不像像素画时返回 null。
 * 本身就很小、颜色很少的原尺寸像素画按一个像素一颗豆处理。
 */
export function detectPixelArtGrid(image, { maxWidth = 200, maxHeight = 300, minCells = 4 } = {}) {
  const { data, width, height } = image;
  if (!data?.length || width < 1 || height < 1) return null;
  const upscaled = detectUpscaledGrid(image, { maxWidth, maxHeight, minCells });
  if (upscaled) return upscaled;
  const native = width <= MAX_NATIVE_SIDE && height <= MAX_NATIVE_SIDE && width >= minCells && height >= minCells
    && countDistinctColors(image, MAX_NATIVE_COLORS) <= MAX_NATIVE_COLORS;
  return native ? { cellSize: 1, width, height, pixels: new Uint8ClampedArray(data) } : null;
}

function detectUpscaledGrid(image, { maxWidth, maxHeight, minCells }) {
  const { width, height } = image;
  const horizontal = estimatePeriod(measureEdgeWeights(image, 'x'));
  const vertical = estimatePeriod(measureEdgeWeights(image, 'y'));
  if (!horizontal && !vertical) return null;
  // 像素块是正方形：两个方向的间距必须一致；只有一个方向有边界时沿用它。
  if (horizontal && vertical && Math.abs(horizontal.period - vertical.period) / Math.max(horizontal.period, vertical.period) > 0.08) return null;
  const period = horizontal && vertical ? (horizontal.period + vertical.period) / 2 : (horizontal || vertical).period;
  const xAxis = gridAxis(horizontal?.offset ?? 0, period, width);
  const yAxis = gridAxis(vertical?.offset ?? 0, period, height);
  if (xAxis.count < minCells || yAxis.count < minCells || xAxis.count > maxWidth || yAxis.count > maxHeight) return null;
  const pixels = sampleCells(image, xAxis, yAxis, period);
  if (measureUniformity(image, xAxis, yAxis, period, pixels) < MIN_UNIFORMITY) return null;
  return { cellSize: period, width: xAxis.count, height: yAxis.count, pixels };
}
