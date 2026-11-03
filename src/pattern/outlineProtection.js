function pixelLuminance(pixels, position) {
  const offset = position * 4;
  return pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
}

/**
 * 检测缩小图中的黑色轮廓。
 * 同时保留纯黑区域，以及被较亮颜色包围的低亮度线条，
 * 避免区域平均采样把黑线稀释成灰色或棕色。
 */
export function createOutlineMask(
  pixels,
  width,
  height,
  { subjectMask = null } = {},
) {
  const mask = new Uint8Array(width * height);
  if (!pixels?.length || !width || !height) return mask;
  const candidates = new Uint8Array(width * height);
  const trueBlack = new Uint8Array(width * height);
  const neighborOffsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1],
  ];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const position = y * width + x;
      const offset = position * 4;
      if (pixels[offset + 3] < 24) continue;
      if (subjectMask && !subjectMask[position]) continue;

      const r = pixels[offset], g = pixels[offset + 1], b = pixels[offset + 2];
      const maximum = Math.max(r, g, b);
      const minimum = Math.min(r, g, b);
      const chroma = maximum - minimum;
      const luminance = pixelLuminance(pixels, position);
      const nearBlackCore = maximum <= 58 && chroma <= 35;
      if (nearBlackCore) {
        candidates[position] = 1;
        if (maximum <= 28 && chroma <= 12) trueBlack[position] = 1;
        continue;
      }

      if (luminance > 125 || chroma > 58) continue;
      let brightNeighbors = 0;
      let neighborTotal = 0;
      let neighborCount = 0;
      let brightest = luminance;
      for (const [offsetX, offsetY] of neighborOffsets) {
        const nx = x + offsetX, ny = y + offsetY;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighborLuminance = pixelLuminance(pixels, ny * width + nx);
        neighborTotal += neighborLuminance;
        neighborCount += 1;
        brightest = Math.max(brightest, neighborLuminance);
        if (neighborLuminance - luminance >= 35) brightNeighbors += 1;
      }
      const neighborAverage = neighborCount ? neighborTotal / neighborCount : luminance;
      if (brightNeighbors >= 2
        && brightest - luminance >= 58
        && neighborAverage - luminance >= 26) {
        candidates[position] = 1;
      }
    }
  }

  // 轮廓通常是细长或环形的连续区域。过滤孤立暗点和实心阴影块，
  // 避免将人物纹理、发丝过渡或深色衣服强制替换成纯黑 H7。
  const visited = new Uint8Array(width * height);
  for (let start = 0; start < candidates.length; start += 1) {
    if (!candidates[start] || visited[start]) continue;
    const stack = [start];
    const component = [];
    let minX = width, minY = height, maxX = 0, maxY = 0;
    visited[start] = 1;

    while (stack.length) {
      const position = stack.pop();
      component.push(position);
      const x = position % width, y = Math.floor(position / width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      for (const [offsetX, offsetY] of neighborOffsets) {
        const nx = x + offsetX, ny = y + offsetY;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const next = ny * width + nx;
        if (candidates[next] && !visited[next]) {
          visited[next] = 1;
          stack.push(next);
        }
      }
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const shortSide = Math.min(componentWidth, componentHeight);
    const density = component.length / (componentWidth * componentHeight);
    const lineLike = component.length >= 3 && (shortSide <= 2 || density <= 0.58);
    if (lineLike) {
      component.forEach((position) => { mask[position] = 1; });
      continue;
    }

    // 实心暗色块只能贡献边缘或细线脊，不能因为其中有一个纯黑格就整块升级为 H7。
    for (const position of component) {
      const x = position % width, y = Math.floor(position / width);
      const luminance = pixelLuminance(pixels, position);
      let candidateNeighbors = 0;
      let cardinalCandidateNeighbors = 0;
      let brighterNeighbors = 0;
      for (const [offsetX, offsetY] of neighborOffsets) {
        const nx = x + offsetX, ny = y + offsetY;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (candidates[neighbor]) {
          candidateNeighbors += 1;
          if (offsetX === 0 || offsetY === 0) cardinalCandidateNeighbors += 1;
        }
        if (pixelLuminance(pixels, neighbor) - luminance >= 34) brighterNeighbors += 1;
      }
      const left = x > 0 ? position - 1 : -1;
      const right = x + 1 < width ? position + 1 : -1;
      const top = y > 0 ? position - width : -1;
      const bottom = y + 1 < height ? position + width : -1;
      const horizontalStroke = component.length >= 2
        && left >= 0 && right >= 0 && !candidates[left] && !candidates[right]
        && ((top >= 0 && candidates[top]) || (bottom >= 0 && candidates[bottom]));
      const verticalStroke = component.length >= 2
        && top >= 0 && bottom >= 0 && !candidates[top] && !candidates[bottom]
        && ((left >= 0 && candidates[left]) || (right >= 0 && candidates[right]));
      const locallyThin = component.length >= 3
        && cardinalCandidateNeighbors >= 1
        && candidateNeighbors <= 4
        && brighterNeighbors >= 2;
      const isolatedBlackDetail = component.length <= 2 && trueBlack[position] && brighterNeighbors >= 3;
      if (horizontalStroke || verticalStroke || locallyThin || isolatedBlackDetail) mask[position] = 1;
    }
  }
  return mask;
}

export function findOutlinePaletteIndex(palette) {
  const preferred = palette.findIndex((color) => color.code === 'H7');
  if (preferred >= 0) return preferred;
  let darkestIndex = -1;
  let darkestValue = Number.POSITIVE_INFINITY;
  palette.forEach((color, index) => {
    if (!color.rgb) return;
    const value = color.rgb[0] + color.rgb[1] + color.rgb[2];
    if (value < darkestValue) {
      darkestValue = value;
      darkestIndex = index;
    }
  });
  return darkestIndex;
}
