const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * ratio)];
}

function createLuma(imageData) {
  const { data, width, height } = imageData;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i += 1) {
    const offset = i * 4;
    luma[i] = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
  }
  return luma;
}

function smooth(values, radius = 2) {
  const result = new Float32Array(values.length);
  const prefix = new Float64Array(values.length + 1);
  for (let i = 0; i < values.length; i += 1) prefix[i + 1] = prefix[i] + values[i];
  for (let i = 0; i < values.length; i += 1) {
    const start = Math.max(0, i - radius);
    const end = Math.min(values.length - 1, i + radius);
    result[i] = (prefix[end + 1] - prefix[start]) / (end - start + 1);
  }
  return result;
}

function textureProfiles(luma, width, height) {
  const rows = new Float32Array(height);
  const columns = new Float32Array(width);
  for (let y = 1; y < height; y += 1) {
    let rowTotal = 0;
    for (let x = 1; x < width; x += 1) {
      const position = y * width + x;
      const vertical = Math.abs(luma[position] - luma[position - 1]);
      const horizontal = Math.abs(luma[position] - luma[position - width]);
      const texture = vertical + horizontal;
      rowTotal += texture;
      columns[x] += texture;
    }
    rows[y] = rowTotal / Math.max(1, width - 1);
  }
  for (let x = 0; x < width; x += 1) columns[x] /= Math.max(1, height - 1);
  return { rows: smooth(rows), columns: smooth(columns) };
}

function bridgeSmallGaps(active, maximumGap) {
  const result = [...active];
  let index = 0;
  while (index < result.length) {
    if (result[index]) { index += 1; continue; }
    const start = index;
    while (index < result.length && !result[index]) index += 1;
    if (start > 0 && index < result.length && index - start <= maximumGap) {
      for (let i = start; i < index; i += 1) result[i] = true;
    }
  }
  return result;
}

function findActiveSpan(values, minimumLength) {
  const low = percentile(values, 0.08);
  const high = percentile(values, 0.88);
  if (high - low < 1.5) return { start: 0, end: values.length - 1, contrast: 0 };
  const threshold = low + (high - low) * 0.28;
  const active = bridgeSmallGaps(values.map((value) => value >= threshold), Math.max(2, Math.round(values.length * 0.006)));
  let best = null;
  let index = 0;
  while (index < active.length) {
    if (!active[index]) { index += 1; continue; }
    const start = index;
    let energy = 0;
    while (index < active.length && active[index]) {
      energy += Math.max(0, values[index] - threshold);
      index += 1;
    }
    const end = index - 1;
    const length = end - start + 1;
    if (length >= minimumLength) {
      const score = length * (1 + energy / Math.max(1, length * (high - low)));
      if (!best || score > best.score) best = { start, end, score };
    }
  }
  return best
    ? { start: best.start, end: best.end, contrast: (high - low) / Math.max(1, high) }
    : { start: 0, end: values.length - 1, contrast: 0 };
}

function edgeProfile(luma, width, height, axis, bounds) {
  if (axis === 'x') {
    const profile = new Float32Array(width);
    const top = clamp(Math.floor(bounds.top), 1, height - 1);
    const bottom = clamp(Math.ceil(bounds.bottom), top + 1, height);
    for (let x = 1; x < width; x += 1) {
      let total = 0;
      for (let y = top; y < bottom; y += 1) {
        const position = y * width + x;
        total += Math.abs(luma[position] - luma[position - 1]);
      }
      profile[x] = total / (bottom - top);
    }
    return profile;
  }
  const profile = new Float32Array(height);
  const left = clamp(Math.floor(bounds.left), 1, width - 1);
  const right = clamp(Math.ceil(bounds.right), left + 1, width);
  for (let y = 1; y < height; y += 1) {
    let total = 0;
    for (let x = left; x < right; x += 1) {
      const position = y * width + x;
      total += Math.abs(luma[position] - luma[position - width]);
    }
    profile[y] = total / (right - left);
  }
  return profile;
}

function gridLineContinuity(luma, width, height, axis, position, bounds) {
  const coordinate = Math.round(position);
  const crossStart = axis === 'x'
    ? clamp(Math.floor(bounds.top), 1, height - 1)
    : clamp(Math.floor(bounds.left), 1, width - 1);
  const crossEnd = axis === 'x'
    ? clamp(Math.ceil(bounds.bottom), crossStart + 1, height)
    : clamp(Math.ceil(bounds.right), crossStart + 1, width);
  let continuous = 0;
  let total = 0;
  for (let cross = crossStart; cross < crossEnd; cross += 1) {
    let strongest = 0;
    for (let offset = -1; offset <= 1; offset += 1) {
      if (axis === 'x') {
        const x = clamp(coordinate + offset, 1, width - 1);
        const current = cross * width + x;
        strongest = Math.max(strongest, Math.abs(luma[current] - luma[current - 1]));
      } else {
        const y = clamp(coordinate + offset, 1, height - 1);
        const current = y * width + cross;
        strongest = Math.max(strongest, Math.abs(luma[current] - luma[current - width]));
      }
    }
    if (strongest >= 2) continuous += 1;
    total += 1;
  }
  return continuous / Math.max(1, total);
}

/**
 * 坐标数字也会按格距重复，单看平均边缘强度会把数字行误当网格线；
 * 空白边缘的浅色网格线则可能因为平均强度低而被裁掉。
 * 真正的网格线会横跨大部分另一轴，因此再用“线条连续率”收紧边界。
 */
function refineFitUsingContinuousLines(luma, width, height, axis, bounds, fit) {
  const axisLength = axis === 'x' ? width : height;
  const firstIndex = Math.ceil((0 - fit.phase) / fit.pitch);
  const lastIndex = Math.floor((axisLength - 1 - fit.phase) / fit.pitch);
  const lines = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const position = fit.phase + index * fit.pitch;
    lines.push({
      position,
      continuity: gridLineContinuity(luma, width, height, axis, position, bounds),
    });
  }
  if (lines.length < 8) return fit;
  const high = percentile(lines.map((line) => line.continuity), 0.86);
  // 连续网格线在绝大多数截面上都有梯度；坐标数字虽然按格距重复，
  // 但只覆盖每格的一小段。阈值保持较高，低于时直接回退旧边界。
  const threshold = Math.max(0.88, high * 0.88);
  const active = bridgeSmallGaps(lines.map((line) => line.continuity >= threshold), 1);
  let best = null;
  let cursor = 0;
  while (cursor < active.length) {
    if (!active[cursor]) { cursor += 1; continue; }
    const start = cursor;
    let continuity = 0;
    while (cursor < active.length && active[cursor]) {
      continuity += lines[cursor].continuity;
      cursor += 1;
    }
    const end = cursor - 1;
    const count = end - start + 1;
    const score = count + continuity / Math.max(1, count);
    if (!best || score > best.score) best = { start, end, count, score };
  }
  if (!best || best.count < 8) return fit;
  const first = lines[best.start].position;
  const last = lines[best.end].position;
  const cells = Math.max(0, Math.round((last - first) / fit.pitch));
  const overlapsPrevious = last >= fit.first - fit.pitch && first <= fit.last + fit.pitch;
  const plausibleChange = cells >= fit.cells * 0.72 && cells <= fit.cells * 1.28;
  return overlapsPrevious && plausibleChange ? { ...fit, first, last, cells } : fit;
}

function trimSymmetricWeakBoundaryLines(luma, width, height, axis, bounds, fit) {
  if (fit.cells < 12) return fit;
  const first = gridLineContinuity(luma, width, height, axis, fit.first, bounds);
  const second = gridLineContinuity(luma, width, height, axis, fit.first + fit.pitch, bounds);
  const beforeLast = gridLineContinuity(luma, width, height, axis, fit.last - fit.pitch, bounds);
  const last = gridLineContinuity(luma, width, height, axis, fit.last, bounds);
  const weakOutside = first < 0.88 && last < 0.88;
  const strongInside = second >= 0.94 && beforeLast >= 0.94;
  return weakOutside && strongInside
    ? { ...fit, first: fit.first + fit.pitch, last: fit.last - fit.pitch, cells: fit.cells - 2 }
    : fit;
}

function correlationAt(values, start, end, lag) {
  let meanA = 0;
  let meanB = 0;
  let count = 0;
  for (let i = start; i + lag <= end; i += 1) {
    meanA += values[i];
    meanB += values[i + lag];
    count += 1;
  }
  if (count < 4) return -1;
  meanA /= count;
  meanB /= count;
  let numerator = 0;
  let denominatorA = 0;
  let denominatorB = 0;
  for (let i = start; i + lag <= end; i += 1) {
    const a = values[i] - meanA;
    const b = values[i + lag] - meanB;
    numerator += a * b;
    denominatorA += a * a;
    denominatorB += b * b;
  }
  return numerator / Math.max(1e-6, Math.sqrt(denominatorA * denominatorB));
}

function estimatePitch(profile, start, end, minimumCells) {
  const length = end - start + 1;
  const maximumPitch = Math.min(40, Math.floor(length / minimumCells));
  const correlations = new Map();
  for (let lag = 4; lag <= maximumPitch * 3; lag += 1) {
    correlations.set(lag, correlationAt(profile, start, end, lag));
  }
  const candidates = [];
  for (let lag = 4; lag <= maximumPitch; lag += 1) {
    const score = (correlations.get(lag) || 0)
      + Math.max(0, correlations.get(lag * 2) || 0) * 0.55
      + Math.max(0, correlations.get(lag * 3) || 0) * 0.25;
    candidates.push({ lag, score, correlation: correlations.get(lag) || 0 });
  }
  const bestScore = Math.max(...candidates.map((candidate) => candidate.score));
  const strong = candidates.filter((candidate) => candidate.score >= bestScore * 0.78 && candidate.correlation > 0.08);
  let best = (strong.length ? strong : candidates).sort((a, b) => a.lag - b.lag)[0];
  if (!best || best.score < 0.12) throw new Error('没有检测到足够稳定的网格线');
  // Printed pattern sheets often make every second or third grid line darker.
  // In that case autocorrelation prefers a harmonic (for example 27px) over
  // the real cell pitch (13.5px). Validate smaller divisors over the complete
  // visible axis before accepting the larger period.
  for (const divisor of [3, 2]) {
    if (best.lag / divisor < 4) continue;
    const harmonicCandidates = [Math.floor(best.lag / divisor), Math.ceil(best.lag / divisor)]
      .filter((lag, index, values) => lag >= 4 && values.indexOf(lag) === index)
      .map((lag) => ({ lag, correlation: correlationAt(profile, 0, profile.length - 1, lag) }))
      .sort((a, b) => b.correlation - a.correlation);
    const harmonic = harmonicCandidates[0];
    const fullBestCorrelation = correlationAt(profile, 0, profile.length - 1, best.lag);
    if (harmonic && harmonic.correlation > 0.12 && harmonic.correlation >= fullBestCorrelation * 0.52) {
      best = { lag: harmonic.lag, correlation: harmonic.correlation, score: harmonic.correlation };
      break;
    }
  }
  return best;
}

function interpolate(values, position) {
  const left = clamp(Math.floor(position), 0, values.length - 1);
  const right = clamp(left + 1, 0, values.length - 1);
  const ratio = position - left;
  return values[left] * (1 - ratio) + values[right] * ratio;
}

function fitGrid(profile, start, end, estimatedPitch) {
  let best = null;
  for (let pitch = estimatedPitch - 0.75; pitch <= estimatedPitch + 0.75; pitch += 0.05) {
    if (pitch < 3.5) continue;
    for (let phase = 0; phase < pitch; phase += 0.25) {
      let total = 0;
      let count = 0;
      const firstIndex = Math.ceil((start - phase) / pitch);
      const lastIndex = Math.floor((end - phase) / pitch);
      for (let index = firstIndex; index <= lastIndex; index += 1) {
        const position = phase + index * pitch;
        total += Math.max(
          interpolate(profile, position - 0.7),
          interpolate(profile, position),
          interpolate(profile, position + 0.7),
        );
        count += 1;
      }
      if (count < 6) continue;
      const score = total / count;
      if (!best || score > best.score) best = { pitch, phase, score };
    }
  }
  if (!best) throw new Error('网格线拟合失败');
  const firstIndex = Math.round((start - best.phase) / best.pitch);
  const lastIndex = Math.round((end - best.phase) / best.pitch);
  const first = best.phase + firstIndex * best.pitch;
  const last = best.phase + lastIndex * best.pitch;
  return {
    ...best,
    first,
    last,
    cells: Math.max(0, lastIndex - firstIndex),
  };
}

function extendFitAcrossVisibleGrid(profile, fit) {
  const firstIndex = Math.ceil((0 - fit.phase) / fit.pitch);
  const lastIndex = Math.floor((profile.length - 1 - fit.phase) / fit.pitch);
  const lines = [];
  for (let index = firstIndex; index <= lastIndex; index += 1) {
    const position = fit.phase + index * fit.pitch;
    lines.push({
      index,
      position,
      strength: Math.max(
        interpolate(profile, position - 0.7),
        interpolate(profile, position),
        interpolate(profile, position + 0.7),
      ),
    });
  }
  if (lines.length < 4) return fit;
  const strengths = lines.map((line) => line.strength);
  const low = percentile(strengths, 0.12);
  const high = percentile(strengths, 0.82);
  const threshold = low + (high - low) * 0.04;
  const active = bridgeSmallGaps(lines.map((line) => line.strength >= threshold), 1);
  let best = null;
  let cursor = 0;
  while (cursor < active.length) {
    if (!active[cursor]) { cursor += 1; continue; }
    const start = cursor;
    let strength = 0;
    while (cursor < active.length && active[cursor]) {
      strength += lines[cursor].strength;
      cursor += 1;
    }
    const end = cursor - 1;
    const count = end - start + 1;
    const score = count * (1 + strength / Math.max(1, count * high));
    if (!best || score > best.score) best = { start, end, score };
  }
  if (!best || best.end - best.start < 5) return fit;
  let first = lines[best.start].position;
  let last = lines[best.end].position;
  if (first >= fit.pitch * 0.45 && first <= fit.pitch * 1.25 && first - fit.pitch >= 0) first -= fit.pitch;
  if (profile.length - 1 - last >= fit.pitch * 0.45
    && profile.length - 1 - last <= fit.pitch * 1.25
    && last + fit.pitch <= profile.length - 1) last += fit.pitch;
  const lag = Math.max(4, Math.round(fit.pitch));
  const edgeWindow = Math.max(lag * 8, Math.floor(profile.length * 0.18));
  const rightCorrelation = correlationAt(profile, Math.max(0, profile.length - edgeWindow), profile.length - 1, lag);
  const leftCorrelation = correlationAt(profile, 0, Math.min(profile.length - 1, edgeWindow), lag);
  if (first <= fit.pitch * 1.25 && rightCorrelation > 0.12) {
    last = fit.phase + Math.floor((profile.length - 1 - fit.phase) / fit.pitch) * fit.pitch;
  }
  if (profile.length - 1 - last <= fit.pitch * 1.25 && leftCorrelation > 0.12) {
    first = fit.phase + Math.ceil((0 - fit.phase) / fit.pitch) * fit.pitch;
  }
  return {
    ...fit,
    first,
    last,
    cells: Math.max(0, Math.round((last - first) / fit.pitch)),
  };
}

function median(values) {
  if (!values.length) return 255;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function sampleCellColor(imageData, left, top, right, bottom, avoidCenterText = false) {
  const { data, width, height } = imageData;
  if (avoidCenterText) {
    const channels = [[], [], []];
    const fractions = [0.2, 0.3, 0.7, 0.8];
    for (const yFraction of fractions) for (const xFraction of fractions) {
      const x = clamp(Math.round(left + (right - left) * xFraction), 0, width - 1);
      const y = clamp(Math.round(top + (bottom - top) * yFraction), 0, height - 1);
      const offset = (y * width + x) * 4;
      channels[0].push(data[offset]);
      channels[1].push(data[offset + 1]);
      channels[2].push(data[offset + 2]);
    }
    return channels.map(median);
  }
  const insetX = Math.max(1, (right - left) * 0.2);
  const insetY = Math.max(1, (bottom - top) * 0.2);
  const x0 = clamp(Math.ceil(left + insetX), 0, width - 1);
  const x1 = clamp(Math.floor(right - insetX), x0, width - 1);
  const y0 = clamp(Math.ceil(top + insetY), 0, height - 1);
  const y1 = clamp(Math.floor(bottom - insetY), y0, height - 1);
  const channels = [[], [], []];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const offset = (y * width + x) * 4;
      channels[0].push(data[offset]);
      channels[1].push(data[offset + 1]);
      channels[2].push(data[offset + 2]);
    }
  }
  return channels.map(median);
}

function colorDistance(first, second) {
  return Math.sqrt(first.reduce((total, value, index) => total + (value - second[index]) ** 2, 0));
}

function bandSignature(imageData, xFit, yFit, row, columnCount) {
  const colors = [];
  for (let column = 0; column < columnCount; column += 1) {
    const color = sampleCellColor(
      imageData,
      xFit.first + column * xFit.pitch,
      yFit.first + row * yFit.pitch,
      xFit.first + (column + 1) * xFit.pitch,
      yFit.first + (row + 1) * yFit.pitch,
    );
    colors.push(color);
  }
  const dominant = [0, 1, 2].map((channel) => median(colors.map((color) => color[channel])));
  const matching = colors.filter((color) => colorDistance(color, dominant) < 52).length;
  const spread = Math.max(...dominant) - Math.min(...dominant);
  return {
    ratio: matching / Math.max(1, columnCount),
    color: dominant,
    colorful: spread > 12 && Math.max(...dominant) < 250,
  };
}

function detectMatchingHeaderRows(imageData, xFit, yFit) {
  if (yFit.cells < 12 || xFit.cells < 10) return { top: 0, bottom: 0 };
  const edgeWindow = Math.min(8, Math.floor(yFit.cells / 3));
  const firstRows = Array.from({ length: edgeWindow }, (_, row) => ({
    row,
    signature: bandSignature(imageData, xFit, yFit, row, xFit.cells),
  }));
  const lastRows = Array.from({ length: edgeWindow }, (_, offset) => {
    const row = yFit.cells - edgeWindow + offset;
    return { row, signature: bandSignature(imageData, xFit, yFit, row, xFit.cells) };
  });
  let best = null;
  for (const first of firstRows) for (const last of lastRows) {
    const matching = first.signature.ratio >= 0.84
      && last.signature.ratio >= 0.84
      && first.signature.colorful
      && last.signature.colorful
      && colorDistance(first.signature.color, last.signature.color) < 60;
    if (!matching) continue;
    const score = first.signature.ratio + last.signature.ratio - first.row * 0.05 + last.row * 0.001;
    if (!best || score > best.score) best = { first: first.row, last: last.row, score };
  }
  return best
    ? { top: best.first + 1, bottom: yFit.cells - best.last }
    : { top: 0, bottom: 0 };
}

function columnSignature(imageData, xFit, yFit, column, rowCount) {
  const colors = [];
  for (let row = 0; row < rowCount; row += 1) {
    colors.push(sampleCellColor(
      imageData,
      xFit.first + column * xFit.pitch,
      yFit.first + row * yFit.pitch,
      xFit.first + (column + 1) * xFit.pitch,
      yFit.first + (row + 1) * yFit.pitch,
    ));
  }
  const dominant = [0, 1, 2].map((channel) => median(colors.map((color) => color[channel])));
  const matching = colors.filter((color) => colorDistance(color, dominant) < 52).length;
  const spread = Math.max(...dominant) - Math.min(...dominant);
  return {
    ratio: matching / Math.max(1, rowCount),
    color: dominant,
    colorful: spread > 12 && Math.max(...dominant) < 250,
  };
}

function detectMatchingHeaderColumns(imageData, xFit, yFit) {
  if (xFit.cells < 12 || yFit.cells < 10) return { left: 0, right: 0 };
  const edgeWindow = Math.min(8, Math.floor(xFit.cells / 3));
  const firstColumns = Array.from({ length: edgeWindow }, (_, column) => ({
    column,
    signature: columnSignature(imageData, xFit, yFit, column, yFit.cells),
  }));
  const lastColumns = Array.from({ length: edgeWindow }, (_, offset) => {
    const column = xFit.cells - edgeWindow + offset;
    return { column, signature: columnSignature(imageData, xFit, yFit, column, yFit.cells) };
  });
  let best = null;
  for (const first of firstColumns) for (const last of lastColumns) {
    const matching = first.signature.ratio >= 0.94
      && last.signature.ratio >= 0.94
      && first.signature.colorful
      && last.signature.colorful
      && colorDistance(first.signature.color, last.signature.color) < 60;
    if (!matching) continue;
    const score = first.signature.ratio + last.signature.ratio - first.column * 0.05 + last.column * 0.001;
    if (!best || score > best.score) best = { first: first.column, last: last.column, score };
  }
  return best
    ? { left: best.first + 1, right: xFit.cells - best.last }
    : { left: 0, right: 0 };
}

export function analyzePatternGrid(imageData, options = {}) {
  const { width, height } = imageData;
  if (!width || !height || imageData.data?.length !== width * height * 4) throw new Error('图片像素数据无效');
  const minimumCells = options.minimumCells || 10;
  const luma = createLuma(imageData);
  const texture = textureProfiles(luma, width, height);
  const ySpan = findActiveSpan([...texture.rows], Math.min(height, minimumCells * 4));
  const xSpan = findActiveSpan([...texture.columns], Math.min(width, minimumCells * 4));
  const roughBounds = {
    left: xSpan.start,
    right: xSpan.end,
    top: ySpan.start,
    bottom: ySpan.end,
  };
  const xProfile = edgeProfile(luma, width, height, 'x', roughBounds);
  const yProfile = edgeProfile(luma, width, height, 'y', roughBounds);
  const xPitch = estimatePitch(xProfile, xSpan.start, xSpan.end, minimumCells);
  const yPitch = estimatePitch(yProfile, ySpan.start, ySpan.end, minimumCells);
  const initialXFit = extendFitAcrossVisibleGrid(xProfile, fitGrid(xProfile, xSpan.start, xSpan.end, xPitch.lag));
  const initialYFit = extendFitAcrossVisibleGrid(yProfile, fitGrid(yProfile, ySpan.start, ySpan.end, yPitch.lag));
  const xFit = refineFitUsingContinuousLines(
    luma,
    width,
    height,
    'x',
    { ...roughBounds, top: initialYFit.first, bottom: initialYFit.last },
    initialXFit,
  );
  const refinedYFit = refineFitUsingContinuousLines(
    luma,
    width,
    height,
    'y',
    { ...roughBounds, left: xFit.first, right: xFit.last },
    initialYFit,
  );
  const yFit = trimSymmetricWeakBoundaryLines(
    luma,
    width,
    height,
    'y',
    { ...roughBounds, left: xFit.first, right: xFit.last },
    refinedYFit,
  );
  if (xFit.cells < minimumCells || yFit.cells < minimumCells || xFit.cells > 200 || yFit.cells > 300) {
    throw new Error('检测到的网格尺寸不在支持范围内');
  }
  const headerRows = detectMatchingHeaderRows(imageData, xFit, yFit);
  const headerColumns = detectMatchingHeaderColumns(imageData, xFit, yFit);
  const contentRows = yFit.cells - headerRows.top - headerRows.bottom;
  const contentColumns = xFit.cells - headerColumns.left - headerColumns.right;
  if (contentRows < minimumCells || contentColumns < minimumCells) throw new Error('去除坐标栏后可用格子数量不足');
  const correlationConfidence = clamp((xPitch.correlation + yPitch.correlation) / 1.2, 0, 1);
  const fitBalance = 1 - Math.min(1, Math.abs(xFit.pitch - yFit.pitch) / Math.max(xFit.pitch, yFit.pitch));
  const confidence = clamp(0.35 + correlationConfidence * 0.45 + fitBalance * 0.2, 0, 0.99);
  return {
    width: contentColumns,
    height: contentRows,
    cellWidth: xFit.pitch,
    cellHeight: yFit.pitch,
    confidence,
    removedCoordinateRows: headerRows,
    removedCoordinateColumns: headerColumns,
    bounds: {
      left: xFit.first + headerColumns.left * xFit.pitch,
      right: xFit.last - headerColumns.right * xFit.pitch,
      top: yFit.first + headerRows.top * yFit.pitch,
      bottom: yFit.last - headerRows.bottom * yFit.pitch,
    },
    rawBounds: { left: xFit.first, right: xFit.last, top: yFit.first, bottom: yFit.last },
  };
}

export function samplePatternGrid(imageData, detection, requestedWidth = detection.width, requestedHeight = detection.height, options = {}) {
  const width = Number(requestedWidth);
  const height = Number(requestedHeight);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('格子数量必须是正整数');
  }
  const pixels = new Uint8ClampedArray(width * height * 4);
  const { left, right, top, bottom } = detection.bounds;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = sampleCellColor(
        imageData,
        left + (right - left) * x / width,
        top + (bottom - top) * y / height,
        left + (right - left) * (x + 1) / width,
        top + (bottom - top) * (y + 1) / height,
        Boolean(options.avoidCenterText),
      );
      const offset = (y * width + x) * 4;
      pixels[offset] = color[0];
      pixels[offset + 1] = color[1];
      pixels[offset + 2] = color[2];
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

/**
 * 现成图纸中的空格通常与浅色豆子很接近，不能只按“是否白色”判断。
 * 以网格四周的纸张底色为基准，并用格内高对比色号文字补充识别白色豆子。
 */
export function detectPatternOccupiedCells(
  imageData,
  detection,
  requestedWidth = detection.width,
  requestedHeight = detection.height,
  options = {},
) {
  const width = Number(requestedWidth);
  const height = Number(requestedHeight);
  const pixels = options.pixels || samplePatternGrid(
    imageData,
    detection,
    width,
    height,
    { avoidCenterText: true },
  );
  if (pixels.length !== width * height * 4) throw new Error('格子底色数据无效');
  const edgeChannels = [[], [], []];
  const collectEdge = (position) => {
    const offset = position * 4;
    for (let channel = 0; channel < 3; channel += 1) edgeChannels[channel].push(pixels[offset + channel]);
  };
  for (let x = 0; x < width; x += 1) {
    collectEdge(x);
    if (height > 1) collectEdge((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    collectEdge(y * width);
    if (width > 1) collectEdge(y * width + width - 1);
  }
  const background = edgeChannels.map(median);
  const occupied = new Uint8Array(width * height);
  const minimumFillDistance = options.minimumFillDistance ?? 26;
  const textContrast = options.textContrast ?? 80;
  const minimumTextPixels = options.minimumTextPixels ?? 6;
  const { left, right, top, bottom } = detection.bounds;
  for (let gridY = 0; gridY < height; gridY += 1) {
    for (let gridX = 0; gridX < width; gridX += 1) {
      const position = gridY * width + gridX;
      const offset = position * 4;
      const fill = [pixels[offset], pixels[offset + 1], pixels[offset + 2]];
      if (colorDistance(fill, background) >= minimumFillDistance) {
        occupied[position] = 1;
        continue;
      }
      const cellLeft = left + (right - left) * gridX / width;
      const cellRight = left + (right - left) * (gridX + 1) / width;
      const cellTop = top + (bottom - top) * gridY / height;
      const cellBottom = top + (bottom - top) * (gridY + 1) / height;
      const x0 = clamp(Math.ceil(cellLeft + (cellRight - cellLeft) * 0.2), 0, imageData.width - 1);
      const x1 = clamp(Math.floor(cellRight - (cellRight - cellLeft) * 0.2), x0, imageData.width - 1);
      const y0 = clamp(Math.ceil(cellTop + (cellBottom - cellTop) * 0.25), 0, imageData.height - 1);
      const y1 = clamp(Math.floor(cellBottom - (cellBottom - cellTop) * 0.25), y0, imageData.height - 1);
      let contrastingPixels = 0;
      for (let y = y0; y <= y1 && contrastingPixels < minimumTextPixels; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const sourceOffset = (y * imageData.width + x) * 4;
          if (colorDistance([
            imageData.data[sourceOffset],
            imageData.data[sourceOffset + 1],
            imageData.data[sourceOffset + 2],
          ], fill) >= textContrast) contrastingPixels += 1;
        }
      }
      if (contrastingPixels >= minimumTextPixels) occupied[position] = 1;
    }
  }
  return occupied;
}
