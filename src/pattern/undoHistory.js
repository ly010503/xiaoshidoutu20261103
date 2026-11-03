export function createPatternSnapshot(pattern) {
  if (!pattern?.indices?.slice) return null;
  return pattern.indices.slice();
}

export function createPatternStateSnapshot(pattern) {
  if (!Number.isInteger(pattern?.width)
    || !Number.isInteger(pattern?.height)
    || !(pattern.indices instanceof Uint8Array)) return null;
  return {
    width: pattern.width,
    height: pattern.height,
    indices: pattern.indices.slice(),
    sourcePixels: pattern.sourcePixels?.slice?.() ?? null,
    backgroundMask: pattern.backgroundMask?.slice?.() ?? null,
  };
}

function isPatternStateSnapshot(snapshot) {
  return snapshot
    && Number.isInteger(snapshot.width)
    && Number.isInteger(snapshot.height)
    && snapshot.width > 0
    && snapshot.height > 0
    && snapshot.indices instanceof Uint8Array
    && snapshot.indices.length === snapshot.width * snapshot.height;
}

export function pushPatternSnapshot(history, snapshot, limit = 20) {
  if (!Array.isArray(history)
    || (!(snapshot instanceof Uint8Array) && !isPatternStateSnapshot(snapshot))) return false;
  history.push(snapshot);
  while (history.length > Math.max(1, limit)) history.shift();
  return true;
}

export function restorePatternSnapshot(history, pattern) {
  if (!Array.isArray(history) || !pattern?.indices?.set) return false;
  while (history.length) {
    const snapshot = history.pop();
    if (snapshot instanceof Uint8Array && snapshot.length === pattern.indices.length) {
      pattern.indices.set(snapshot);
      return true;
    }
    if (isPatternStateSnapshot(snapshot)) {
      pattern.width = snapshot.width;
      pattern.height = snapshot.height;
      pattern.indices = snapshot.indices.slice();
      pattern.sourcePixels = snapshot.sourcePixels?.slice?.() ?? null;
      pattern.backgroundMask = snapshot.backgroundMask?.slice?.() ?? null;
      return true;
    }
  }
  return false;
}

export function transferPatternSnapshot(from, to, pattern, limit = 20) {
  const current = createPatternStateSnapshot(pattern);
  // 编辑记录的名称、改动格子随快照在撤销/重做栈之间流转。
  const meta = from.at(-1)?.meta;
  if (!current || !restorePatternSnapshot(from, pattern)) return false;
  if (meta) current.meta = meta;
  pushPatternSnapshot(to, current, limit);
  return true;
}

/**
 * 对比编辑前快照与当前图纸，列出颜色或留白发生变化的格子；
 * 尺寸变化时无法逐格对应，返回 null。
 */
export function findChangedPositions(snapshot, pattern) {
  if (!snapshot?.indices || snapshot.width !== pattern.width || snapshot.height !== pattern.height) return null;
  const positions = [];
  for (let position = 0; position < pattern.indices.length; position += 1) {
    if (snapshot.indices[position] !== pattern.indices[position]
      || Boolean(snapshot.backgroundMask?.[position]) !== Boolean(pattern.backgroundMask?.[position])) {
      positions.push(position);
    }
  }
  return positions;
}
