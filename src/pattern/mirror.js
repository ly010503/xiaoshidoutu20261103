export function getPatternPosition(width, x, y, mirrorX = false) {
  const sourceX = mirrorX ? width - 1 - x : x;
  return y * width + sourceX;
}
