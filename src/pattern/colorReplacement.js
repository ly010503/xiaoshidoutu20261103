export function replacePatternColor(pattern, fromIndex, toIndex) {
  if (!pattern?.indices
    || !Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex < 0
    || toIndex < 0
    || fromIndex > 255
    || toIndex > 255
    || fromIndex === toIndex) {
    return 0;
  }

  let replaced = 0;
  for (let index = 0; index < pattern.indices.length; index += 1) {
    if (pattern.indices[index] === fromIndex) {
      pattern.indices[index] = toIndex;
      replaced += 1;
    }
  }
  return replaced;
}

export function replacePatternCell(pattern, position, toIndex) {
  if (!pattern?.indices
    || !Number.isInteger(position)
    || position < 0
    || position >= pattern.indices.length
    || !Number.isInteger(toIndex)
    || toIndex < 0
    || toIndex > 255
    || pattern.indices[position] === toIndex) {
    return false;
  }
  pattern.indices[position] = toIndex;
  return true;
}

export function replacePatternCells(pattern, positions, toIndex) {
  if (!pattern?.indices
    || !positions?.[Symbol.iterator]
    || !Number.isInteger(toIndex)
    || toIndex < 0
    || toIndex > 255) {
    return 0;
  }

  let replaced = 0;
  const uniquePositions = new Set(positions);
  for (const position of uniquePositions) {
    if (!Number.isInteger(position)
      || position < 0
      || position >= pattern.indices.length
      || pattern.indices[position] === toIndex) {
      continue;
    }
    pattern.indices[position] = toIndex;
    replaced += 1;
  }
  return replaced;
}
