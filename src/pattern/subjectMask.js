function rgbDistance(pixels, offset, backgroundRgb) {
  return Math.hypot(
    pixels[offset] - backgroundRgb[0],
    pixels[offset + 1] - backgroundRgb[1],
    pixels[offset + 2] - backgroundRgb[2],
  );
}

function median(values) {
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 255;
}

function estimateBorderBackground(pixels, width, height) {
  const channels = [[], [], []];
  const collect = (position) => {
    const offset = position * 4;
    if (pixels[offset + 3] < 24) return;
    channels[0].push(pixels[offset]);
    channels[1].push(pixels[offset + 1]);
    channels[2].push(pixels[offset + 2]);
  };
  for (let x = 0; x < width; x += 1) {
    collect(x);
    if (height > 1) collect((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    collect(y * width);
    if (width > 1) collect(y * width + width - 1);
  }
  return channels.map(median);
}

function dilate(mask, width, height) {
  const result = new Uint8Array(mask);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const position = y * width + x;
      if (!mask[position]) continue;
      for (let oy = -1; oy <= 1; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) result[ny * width + nx] = 1;
        }
      }
    }
  }
  return result;
}

function erode(mask, width, height) {
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const position = y * width + x;
      if (!mask[position]) continue;
      let filled = true;
      for (let oy = -1; oy <= 1 && filled; oy += 1) {
        for (let ox = -1; ox <= 1; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || !mask[ny * width + nx]) {
            filled = false;
            break;
          }
        }
      }
      if (filled) result[position] = 1;
    }
  }
  return result;
}

function createExteriorMask(barrier, width, height) {
  const exterior = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let head = 0;
  let tail = 0;
  const enqueue = (position) => {
    if (barrier[position] || exterior[position]) return;
    exterior[position] = 1;
    queue[tail] = position;
    tail += 1;
  };
  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }
  while (head < tail) {
    const position = queue[head];
    head += 1;
    const x = position % width;
    const y = Math.floor(position / width);
    if (x > 0) enqueue(position - 1);
    if (x + 1 < width) enqueue(position + 1);
    if (y > 0) enqueue(position - width);
    if (y + 1 < height) enqueue(position + width);
  }
  return exterior;
}

function removeTinyForegroundComponents(mask, width, height) {
  const result = new Uint8Array(mask);
  const visited = new Uint8Array(mask.length);
  const components = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const stack = [start];
    const component = [];
    visited[start] = 1;
    while (stack.length) {
      const position = stack.pop();
      component.push(position);
      const x = position % width;
      const y = Math.floor(position / width);
      const neighbors = [];
      if (x > 0) neighbors.push(position - 1);
      if (x + 1 < width) neighbors.push(position + 1);
      if (y > 0) neighbors.push(position - width);
      if (y + 1 < height) neighbors.push(position + width);
      for (const neighbor of neighbors) {
        if (mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  const largest = components.reduce((size, component) => Math.max(size, component.length), 0);
  const minimumSize = Math.max(3, Math.ceil(largest * 0.006));
  for (const component of components) {
    if (component.length < minimumSize) component.forEach((position) => { result[position] = 0; });
  }
  return result;
}

function stabilizeGridMask(mask, foregroundCoverage, interiorCoverage, width, height) {
  const result = new Uint8Array(mask);
  const cardinalCount = (position) => {
    const x = position % width;
    const y = Math.floor(position / width);
    let count = 0;
    if (x > 0) count += result[position - 1];
    if (x + 1 < width) count += result[position + 1];
    if (y > 0) count += result[position - width];
    if (y + 1 < height) count += result[position + width];
    return count;
  };
  const surroundingCount = (position) => {
    const x = position % width;
    const y = Math.floor(position / width);
    let count = 0;
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (!ox && !oy) continue;
        const nx = x + ox, ny = y + oy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) count += result[ny * width + nx];
      }
    }
    return count;
  };

  const removals = [];
  for (let position = 0; position < result.length; position += 1) {
    if (!result[position] || interiorCoverage[position] >= 0.55) continue;
    if (foregroundCoverage[position] < 0.32
      && cardinalCount(position) <= 1
      && surroundingCount(position) <= 2) removals.push(position);
  }
  removals.forEach((position) => { result[position] = 0; });

  const additions = [];
  for (let position = 0; position < result.length; position += 1) {
    // 只补接近半格覆盖的阶梯拐角，否则外轮廓会在斜边上重新胖出一格。
    if (result[position] || foregroundCoverage[position] < 0.45) continue;
    if (cardinalCount(position) >= 2 && surroundingCount(position) >= 3) additions.push(position);
  }
  additions.forEach((position) => { result[position] = 1; });
  return result;
}

// 超过一半面积落在人物轮廓以内才算主体格；更低的门槛会让外轮廓整体向外胖一格。
const SUBJECT_INTERIOR_COVERAGE = 0.5;

/**
 * 从缩格前的超采样图建立人物蒙版。四周连通区域始终是背景；
 * 被人物色块或线稿包围的眼白、鞋面等浅色区域会保留在人物内部。
 */
export function createSubjectMaskFromSampledPixels({
  pixels,
  sampleWidth,
  sampleHeight,
  gridWidth,
  gridHeight,
}) {
  if (!pixels?.length || sampleWidth % gridWidth || sampleHeight % gridHeight) {
    return new Uint8Array(gridWidth * gridHeight);
  }
  const scaleX = sampleWidth / gridWidth;
  const scaleY = sampleHeight / gridHeight;
  const backgroundRgb = estimateBorderBackground(pixels, sampleWidth, sampleHeight);
  const foregroundPixels = new Uint8Array(sampleWidth * sampleHeight);
  for (let position = 0; position < foregroundPixels.length; position += 1) {
    const offset = position * 4;
    if (pixels[offset + 3] >= 24 && rgbDistance(pixels, offset, backgroundRgb) > 30) {
      foregroundPixels[position] = 1;
    }
  }

  // 超采样层做一次闭运算，封住抗锯齿造成的微小断口，同时保持主体原有尺寸。
  const sealedBarrier = erode(
    dilate(foregroundPixels, sampleWidth, sampleHeight),
    sampleWidth,
    sampleHeight,
  );
  const exterior = createExteriorMask(sealedBarrier, sampleWidth, sampleHeight);
  const subjectMask = new Uint8Array(gridWidth * gridHeight);
  const foregroundCoverages = new Float32Array(gridWidth * gridHeight);
  const interiorCoverages = new Float32Array(gridWidth * gridHeight);
  const samplesPerCell = scaleX * scaleY;

  for (let gridY = 0; gridY < gridHeight; gridY += 1) {
    for (let gridX = 0; gridX < gridWidth; gridX += 1) {
      let foregroundCount = 0;
      let interiorCount = 0;
      for (let sampleY = gridY * scaleY; sampleY < (gridY + 1) * scaleY; sampleY += 1) {
        for (let sampleX = gridX * scaleX; sampleX < (gridX + 1) * scaleX; sampleX += 1) {
          const position = sampleY * sampleWidth + sampleX;
          foregroundCount += foregroundPixels[position];
          if (!exterior[position]) interiorCount += 1;
        }
      }
      const foregroundCoverage = foregroundCount / samplesPerCell;
      const interiorCoverage = interiorCount / samplesPerCell;
      foregroundCoverages[gridY * gridWidth + gridX] = foregroundCoverage;
      interiorCoverages[gridY * gridWidth + gridX] = interiorCoverage;
      if (interiorCoverage >= SUBJECT_INTERIOR_COVERAGE) {
        subjectMask[gridY * gridWidth + gridX] = 1;
      }
    }
  }
  const stabilized = stabilizeGridMask(
    subjectMask,
    foregroundCoverages,
    interiorCoverages,
    gridWidth,
    gridHeight,
  );
  return removeTinyForegroundComponents(stabilized, gridWidth, gridHeight);
}

export function createSubjectOutlineMask(subjectMask, width, height) {
  const outline = new Uint8Array(width * height);
  if (!subjectMask?.length) return outline;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const position = y * width + x;
      if (!subjectMask[position]) continue;
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1
        || !subjectMask[position - 1]
        || !subjectMask[position + 1]
        || !subjectMask[position - width]
        || !subjectMask[position + width]) {
        outline[position] = 1;
      }
    }
  }
  return outline;
}

export function createBackgroundMaskFromSubject(subjectMask) {
  return Uint8Array.from(subjectMask || [], (value) => (value ? 0 : 1));
}
