function isWhiteLike(color) {
  if (!color?.rgb) return false;
  const [r, g, b] = color.rgb;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  return (r + g + b) / 3 >= 235 && maximum - minimum <= 38;
}

function rgbDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * 只标记从图纸四周连通的白色区域。
 * 被轮廓包围的主体白色即使色号相同，也不会进入背景遮罩。
 */
export function createWhiteBackgroundMask(pattern, palette, sourcePixels = pattern.sourcePixels) {
  const { width, height, indices } = pattern;
  const mask = new Uint8Array(width * height);
  if (!width || !height || !indices?.length) return mask;

  const edgeCounts = new Map();
  const countEdge = (position) => {
    const index = indices[position];
    if (isWhiteLike(palette[index])) edgeCounts.set(index, (edgeCounts.get(index) || 0) + 1);
  };
  for (let x = 0; x < width; x += 1) {
    countEdge(x);
    if (height > 1) countEdge((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    countEdge(y * width);
    if (width > 1) countEdge(y * width + width - 1);
  }

  const dominant = [...edgeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!dominant) return mask;
  const backgroundRgb = palette[dominant[0]].rgb;
  const hasSourcePixels = sourcePixels?.length >= width * height * 4;
  let sourceBackgroundRgb = null;

  if (hasSourcePixels) {
    const channels = [[], [], []];
    const collectSource = (position) => {
      if (!isWhiteLike(palette[indices[position]])) return;
      const offset = position * 4;
      channels[0].push(sourcePixels[offset]);
      channels[1].push(sourcePixels[offset + 1]);
      channels[2].push(sourcePixels[offset + 2]);
    };
    for (let x = 0; x < width; x += 1) {
      collectSource(x);
      if (height > 1) collectSource((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y += 1) {
      collectSource(y * width);
      if (width > 1) collectSource(y * width + width - 1);
    }
    if (channels[0].length) {
      sourceBackgroundRgb = channels.map((values) => {
        values.sort((a, b) => a - b);
        return values[Math.floor(values.length / 2)];
      });
    }
  }

  const sourceLooksLikeBackground = (position) => {
    if (!sourceBackgroundRgb) return true;
    const offset = position * 4;
    const sourceRgb = [sourcePixels[offset], sourcePixels[offset + 1], sourcePixels[offset + 2]];
    return rgbDistance(sourceRgb, sourceBackgroundRgb) <= 14;
  };
  const isBackgroundWhite = (position) => {
    const color = palette[indices[position]];
    return isWhiteLike(color)
      && rgbDistance(color.rgb, backgroundRgb) <= 18
      && sourceLooksLikeBackground(position);
  };

  // 主体中的白色有时会通过很窄的开口与白色背景相连。
  // 仅靠四周洪泛会误删这些色号，因此先判断白色格子是否位于主体轮廓内部：
  // 横向或纵向两侧都有非背景色时，视为主体白色并保留编号。
  const hasLeftForeground = new Uint8Array(width * height);
  const hasRightForeground = new Uint8Array(width * height);
  const hasTopForeground = new Uint8Array(width * height);
  const hasBottomForeground = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    let seen = false;
    for (let x = 0; x < width; x += 1) {
      const position = y * width + x;
      hasLeftForeground[position] = seen ? 1 : 0;
      if (!isBackgroundWhite(position)) seen = true;
    }
    seen = false;
    for (let x = width - 1; x >= 0; x -= 1) {
      const position = y * width + x;
      hasRightForeground[position] = seen ? 1 : 0;
      if (!isBackgroundWhite(position)) seen = true;
    }
  }

  for (let x = 0; x < width; x += 1) {
    let seen = false;
    for (let y = 0; y < height; y += 1) {
      const position = y * width + x;
      hasTopForeground[position] = seen ? 1 : 0;
      if (!isBackgroundWhite(position)) seen = true;
    }
    seen = false;
    for (let y = height - 1; y >= 0; y -= 1) {
      const position = y * width + x;
      hasBottomForeground[position] = seen ? 1 : 0;
      if (!isBackgroundWhite(position)) seen = true;
    }
  }

  const isInsideSubject = (position) => (
    (hasLeftForeground[position] && hasRightForeground[position])
    || (hasTopForeground[position] && hasBottomForeground[position])
  );
  const queue = new Uint32Array(width * height);
  let head = 0, tail = 0;

  const enqueue = (position) => {
    if (mask[position]) return;
    if (!isBackgroundWhite(position) || isInsideSubject(position)) return;
    mask[position] = 1;
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
    const x = position % width, y = Math.floor(position / width);
    if (x > 0) enqueue(position - 1);
    if (x + 1 < width) enqueue(position + 1);
    if (y > 0) enqueue(position - width);
    if (y + 1 < height) enqueue(position + width);
  }
  return mask;
}
