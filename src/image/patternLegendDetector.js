import { findNearestPaletteColor } from '../color/colorMatcher.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function median(values) {
  if (!values.length) return 255;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}

function rgbDistance(first, second) {
  return Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
}

function pixelRgb(imageData, x, y) {
  const offset = (y * imageData.width + x) * 4;
  return [imageData.data[offset], imageData.data[offset + 1], imageData.data[offset + 2]];
}

function regionBackground(imageData, region) {
  const channels = [[], [], []];
  const stepX = Math.max(1, Math.floor(region.width / 80));
  const stepY = Math.max(1, Math.floor(region.height / 80));
  const collect = (x, y) => {
    const color = pixelRgb(imageData, x, y);
    for (let channel = 0; channel < 3; channel += 1) channels[channel].push(color[channel]);
  };
  for (let x = region.left; x < region.right; x += stepX) {
    collect(x, region.top);
    collect(x, region.bottom - 1);
  }
  for (let y = region.top; y < region.bottom; y += stepY) {
    collect(region.left, y);
    collect(region.right - 1, y);
  }
  return channels.map(median);
}

function connectedComponents(imageData, region, background, minimumUnit) {
  const width = region.width;
  const height = region.height;
  const active = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = pixelRgb(imageData, region.left + x, region.top + y);
      if (rgbDistance(color, background) >= 18) active[y * width + x] = 1;
    }
  }

  const visited = new Uint8Array(active.length);
  const queue = new Uint32Array(active.length);
  const components = [];
  for (let start = 0; start < active.length; start += 1) {
    if (!active[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    visited[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const position = queue[head++];
      const x = position % width;
      const y = Math.floor(position / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (let oy = -1; oy <= 1; oy += 1) for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nextX = x + ox;
        const nextY = y + oy;
        if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
        const next = nextY * width + nextX;
        if (!active[next] || visited[next]) continue;
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const aspect = componentWidth / componentHeight;
    const density = tail / (componentWidth * componentHeight);
    if (componentWidth < minimumUnit * 0.65 || componentHeight < minimumUnit * 0.65) continue;
    if (componentWidth > minimumUnit * 4.5 || componentHeight > minimumUnit * 4.5) continue;
    if (aspect < 0.5 || aspect > 1.8 || density < 0.07) continue;
    components.push({
      left: region.left + minX,
      right: region.left + maxX + 1,
      top: region.top + minY,
      bottom: region.top + maxY + 1,
      width: componentWidth,
      height: componentHeight,
      area: tail,
      centerX: region.left + (minX + maxX + 1) / 2,
      centerY: region.top + (minY + maxY + 1) / 2,
    });
  }
  return components;
}

function alignedGroup(components, orientation) {
  let best = [];
  for (const anchor of components) {
    const size = orientation === 'horizontal' ? anchor.height : anchor.width;
    const group = components.filter((component) => {
      const crossDistance = orientation === 'horizontal'
        ? Math.abs(component.centerY - anchor.centerY)
        : Math.abs(component.centerX - anchor.centerX);
      const componentSize = orientation === 'horizontal' ? component.height : component.width;
      return crossDistance <= Math.max(3, size * 0.35)
        && componentSize >= size * 0.62
        && componentSize <= size * 1.6;
    });
    if (group.length > best.length) best = group;
  }
  return best.sort((first, second) => (
    orientation === 'horizontal'
      ? first.centerX - second.centerX
      : first.centerY - second.centerY
  ));
}

function parallelAlignedGroups(components, orientation) {
  const crossCenter = (component) => (
    orientation === 'horizontal' ? component.centerY : component.centerX
  );
  const crossSize = (component) => (
    orientation === 'horizontal' ? component.height : component.width
  );
  const sorted = [...components].sort((first, second) => crossCenter(first) - crossCenter(second));
  const clusters = [];
  for (const component of sorted) {
    const cluster = clusters[clusters.length - 1];
    const center = cluster ? median(cluster.map(crossCenter)) : 0;
    const size = cluster ? median(cluster.map(crossSize)) : crossSize(component);
    if (cluster && Math.abs(crossCenter(component) - center) <= Math.max(4, size * 0.58)) {
      cluster.push(component);
    } else {
      clusters.push([component]);
    }
  }
  return clusters.map((cluster) => alignedGroup(cluster, orientation));
}

function groupRegularity(group, orientation) {
  if (group.length < 4) return 0;
  const gaps = [];
  for (let index = 1; index < group.length; index += 1) {
    const gap = orientation === 'horizontal'
      ? group[index].centerX - group[index - 1].centerX
      : group[index].centerY - group[index - 1].centerY;
    if (gap > 1) gaps.push(gap);
  }
  if (gaps.length < 3) return 0;
  const typical = median(gaps);
  const inliers = gaps.filter((gap) => {
    const multiple = Math.max(1, Math.round(gap / typical));
    return Math.abs(gap - typical * multiple) <= Math.max(2, typical * 0.24);
  }).length;
  return inliers / gaps.length;
}

function groupPitch(group, orientation) {
  const gaps = [];
  for (let index = 1; index < group.length; index += 1) {
    const gap = orientation === 'horizontal'
      ? group[index].centerX - group[index - 1].centerX
      : group[index].centerY - group[index - 1].centerY;
    if (gap > 2) gaps.push(gap);
  }
  gaps.sort((first, second) => first - second);
  return median(gaps.slice(0, Math.max(1, Math.ceil(gaps.length * 0.6))));
}

function componentAt(center, width, height) {
  return {
    left: Math.round(center.x - width / 2),
    right: Math.round(center.x + width / 2),
    top: Math.round(center.y - height / 2),
    bottom: Math.round(center.y + height / 2),
    width,
    height,
    centerX: center.x,
    centerY: center.y,
    inferred: true,
  };
}

function inferredComponentEvidence(imageData, component, background) {
  const left = clamp(component.left, 0, imageData.width - 1);
  const right = clamp(component.right - 1, left, imageData.width - 1);
  const top = clamp(component.top, 0, imageData.height - 1);
  const bottom = clamp(component.bottom - 1, top, imageData.height - 1);
  let changed = 0;
  let total = 0;
  for (let x = left; x <= right; x += 1) {
    if (rgbDistance(pixelRgb(imageData, x, top), background) >= 10) changed += 1;
    if (bottom !== top && rgbDistance(pixelRgb(imageData, x, bottom), background) >= 10) changed += 1;
    total += bottom === top ? 1 : 2;
  }
  for (let y = top + 1; y < bottom; y += 1) {
    if (rgbDistance(pixelRgb(imageData, left, y), background) >= 10) changed += 1;
    if (right !== left && rgbDistance(pixelRgb(imageData, right, y), background) >= 10) changed += 1;
    total += right === left ? 1 : 2;
  }
  const fill = sampleComponentColor(imageData, component);
  return Math.max(changed / Math.max(1, total), Math.min(1, rgbDistance(fill, background) / 45));
}

function completeGroup(imageData, region, group, background) {
  if (group.length < 4) return group;
  const pitch = groupPitch(group, region.orientation);
  if (!Number.isFinite(pitch) || pitch < 4) return group;
  const width = Math.round(median(group.map((component) => component.width)));
  const height = Math.round(median(group.map((component) => component.height)));
  const crossCenter = median(group.map((component) => (
    region.orientation === 'horizontal' ? component.centerY : component.centerX
  )));
  const firstAxis = region.orientation === 'horizontal' ? group[0].centerX : group[0].centerY;
  const lastAxis = region.orientation === 'horizontal'
    ? group[group.length - 1].centerX
    : group[group.length - 1].centerY;
  let startAxis = firstAxis;
  let endAxis = lastAxis;
  const make = (axis) => componentAt(
    region.orientation === 'horizontal' ? { x: axis, y: crossCenter } : { x: crossCenter, y: axis },
    width,
    height,
  );
  for (let extension = 0; extension < 4; extension += 1) {
    const candidate = make(startAxis - pitch);
    const within = region.orientation === 'horizontal'
      ? candidate.left >= region.left
      : candidate.top >= region.top;
    if (!within || inferredComponentEvidence(imageData, candidate, background) < 0.22) break;
    startAxis -= pitch;
  }
  for (let extension = 0; extension < 4; extension += 1) {
    const candidate = make(endAxis + pitch);
    const within = region.orientation === 'horizontal'
      ? candidate.right <= region.right
      : candidate.bottom <= region.bottom;
    if (!within || inferredComponentEvidence(imageData, candidate, background) < 0.22) break;
    endAxis += pitch;
  }
  const count = Math.round((endAxis - startAxis) / pitch) + 1;
  if (count < group.length || count > 64) return group;
  return Array.from({ length: count }, (_, index) => {
    const axis = startAxis + index * pitch;
    const nearest = group.find((component) => Math.abs(
      (region.orientation === 'horizontal' ? component.centerX : component.centerY) - axis,
    ) <= pitch * 0.32);
    return nearest || make(axis);
  });
}

function sampleComponentColor(imageData, component) {
  const insetX = Math.max(2, Math.round(component.width * 0.22));
  const insetY = Math.max(2, Math.round(component.height * 0.22));
  const left = clamp(component.left + insetX, 0, imageData.width - 1);
  const right = clamp(component.right - insetX, left + 1, imageData.width);
  const top = clamp(component.top + insetY, 0, imageData.height - 1);
  const bottom = clamp(component.bottom - insetY, top + 1, imageData.height);
  const channels = [[], [], []];
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const color = pixelRgb(imageData, x, y);
      for (let channel = 0; channel < 3; channel += 1) channels[channel].push(color[channel]);
    }
  }
  return channels.map(median);
}

function candidateRegions(imageData, detection) {
  const padding = Math.max(1, Math.round(Math.min(detection.cellWidth, detection.cellHeight) * 0.2));
  const raw = detection.rawBounds || detection.bounds;
  const regions = [];
  const add = (side, left, top, right, bottom, orientation) => {
    left = clamp(Math.floor(left), 0, imageData.width - 1);
    top = clamp(Math.floor(top), 0, imageData.height - 1);
    right = clamp(Math.ceil(right), left + 1, imageData.width);
    bottom = clamp(Math.ceil(bottom), top + 1, imageData.height);
    const width = right - left;
    const height = bottom - top;
    const minimumThickness = Math.max(18, Math.min(detection.cellWidth, detection.cellHeight) * 1.25);
    if ((orientation === 'horizontal' ? height : width) < minimumThickness) return;
    regions.push({ side, left, top, right, bottom, width, height, orientation });
  };
  add('top', 0, 0, imageData.width, raw.top - padding, 'horizontal');
  add('bottom', 0, raw.bottom + padding, imageData.width, imageData.height, 'horizontal');
  add('left', 0, 0, raw.left - padding, imageData.height, 'vertical');
  add('right', raw.right + padding, 0, imageData.width, imageData.height, 'vertical');
  return regions;
}

export function detectPatternLegend(imageData, detection, palette, options = {}) {
  if (!imageData?.data || !detection || !Array.isArray(palette) || !palette.length) return null;
  const minimumSwatches = options.minimumSwatches || 4;
  const minimumUnit = Math.max(5, Math.min(detection.cellWidth, detection.cellHeight));
  let best = null;
  for (const region of candidateRegions(imageData, detection)) {
    const background = regionBackground(imageData, region);
    const components = connectedComponents(imageData, region, background, minimumUnit);
    const swatchComponents = components.filter((component) => (
      component.width >= minimumUnit * 1.6
      && component.height >= minimumUnit * 1.6
    ));
    const regularGroups = parallelAlignedGroups(swatchComponents, region.orientation)
      .map((rawGroup) => ({ rawGroup, regularity: groupRegularity(rawGroup, region.orientation) }))
      .filter(({ rawGroup, regularity }) => rawGroup.length >= minimumSwatches && regularity >= 0.68)
      .map(({ rawGroup, regularity }) => ({
        group: completeGroup(imageData, region, rawGroup, background),
        regularity,
      }));
    if (!regularGroups.length) continue;
    const referencePitch = groupPitch(regularGroups[0].group, region.orientation);
    const compatibleGroups = regularGroups.filter(({ group }) => {
      const pitch = groupPitch(group, region.orientation);
      return Number.isFinite(referencePitch)
        && Number.isFinite(pitch)
        && Math.abs(pitch - referencePitch) <= Math.max(3, referencePitch * 0.22);
    });
    const group = compatibleGroups.flatMap((item) => item.group);
    const regularity = compatibleGroups.reduce((sum, item) => sum + item.regularity, 0)
      / Math.max(1, compatibleGroups.length);
    const matches = group.map((component) => {
      const rgb = sampleComponentColor(imageData, component);
      const color = findNearestPaletteColor(rgb, palette);
      return { component, rgb, color };
    });
    const uniqueIndices = [...new Set(matches.map((match) => match.color.index))];
    if (uniqueIndices.length < Math.min(3, minimumSwatches)) continue;
    const coverage = Math.min(1, group.length / 12);
    const uniqueness = uniqueIndices.length / group.length;
    // 正常图例中每个色块代表一个不同色号。大量色块被压成少数几个近似色时，
    // 通常是把图例文字、数量或页面装饰误识别成了色块，不能据此强制限色。
    if (uniqueness < (options.minimumUniqueness || 0.5)) continue;
    const confidence = Math.min(0.99, 0.42 + regularity * 0.28 + coverage * 0.2 + uniqueness * 0.1);
    const result = {
      detected: confidence >= (options.minimumConfidence || 0.72),
      confidence,
      side: region.side,
      orientation: region.orientation,
      swatchCount: group.length,
      paletteIndices: uniqueIndices,
      paletteCodes: uniqueIndices.map((index) => palette[index].code),
      swatches: matches.map((match) => ({
        code: match.color.code,
        rgb: match.rgb,
        bounds: match.component,
      })),
    };
    if (result.detected && (!best || result.confidence > best.confidence || result.swatchCount > best.swatchCount)) best = result;
  }
  return best;
}
