export function linePositions(width, from, to) {
  const positions = [];
  let x = from % width, y = Math.floor(from / width);
  const tx = to % width, ty = Math.floor(to / width);
  const dx = Math.abs(tx - x), dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1, sy = y < ty ? 1 : -1;
  let error = dx + dy;
  while (true) {
    positions.push(y * width + x);
    if (x === tx && y === ty) break;
    const twice = 2 * error;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
  return positions;
}

export function floodRegion(pattern, start, blankIndex) {
  const { width, height, indices, backgroundMask } = pattern;
  if (!Number.isInteger(start) || start < 0 || start >= indices.length) return [];
  const valueAt = (position) => backgroundMask?.[position] ? blankIndex : indices[position];
  const source = valueAt(start), visited = new Uint8Array(indices.length);
  const stack = [start], positions = [];
  visited[start] = 1;
  while (stack.length) {
    const position = stack.pop();
    if (valueAt(position) !== source) continue;
    positions.push(position);
    const x = position % width, y = Math.floor(position / width);
    const neighbors = [];
    if (x > 0) neighbors.push(position - 1);
    if (x < width - 1) neighbors.push(position + 1);
    if (y > 0) neighbors.push(position - width);
    if (y < height - 1) neighbors.push(position + width);
    for (const neighbor of neighbors) {
      if (!visited[neighbor]) { visited[neighbor] = 1; stack.push(neighbor); }
    }
  }
  return positions;
}

export function paintPositions(pattern, positions, targetIndex, blankIndex) {
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > 255) return 0;
  const mask = pattern.backgroundMask ??= new Uint8Array(pattern.indices.length);
  let changed = 0;
  const blank = Number(targetIndex === blankIndex);
  for (const position of positions) {
    if (!Number.isInteger(position) || position < 0 || position >= pattern.indices.length) continue;
    if (pattern.indices[position] === targetIndex && mask[position] === blank) continue;
    pattern.indices[position] = targetIndex;
    mask[position] = blank;
    changed += 1;
  }
  return changed;
}
