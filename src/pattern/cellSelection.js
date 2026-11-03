export function getRectangularSelectionPositions(width, height, startPosition, endPosition) {
  if (!Number.isInteger(width)
    || !Number.isInteger(height)
    || width <= 0
    || height <= 0
    || !Number.isInteger(startPosition)
    || !Number.isInteger(endPosition)
    || startPosition < 0
    || endPosition < 0
    || startPosition >= width * height
    || endPosition >= width * height) {
    return [];
  }

  const startX = startPosition % width;
  const startY = Math.floor(startPosition / width);
  const endX = endPosition % width;
  const endY = Math.floor(endPosition / width);
  const minX = Math.min(startX, endX);
  const maxX = Math.max(startX, endX);
  const minY = Math.min(startY, endY);
  const maxY = Math.max(startY, endY);
  const positions = [];

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) positions.push(y * width + x);
  }
  return positions;
}

export function getPatternTapIntent(selectedCount, isSelectedCell, {
  shiftKey = false,
  ctrlKey = false,
  metaKey = false,
} = {}) {
  if (shiftKey) return 'range-select';
  if (ctrlKey || metaKey) return 'toggle-select';
  if (selectedCount > 0 && isSelectedCell) return 'replace-selection';
  return 'replace-cell';
}
