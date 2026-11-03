export function hitTestPatternCell(documentX, documentY, pattern, layout, cell, mirrorX = false) {
  if (!pattern || !layout || !Number.isFinite(documentX) || !Number.isFinite(documentY) || cell <= 0) return null;
  const displayX = Math.floor((documentX - layout.gridX) / cell);
  const y = Math.floor((documentY - layout.gridY) / cell);
  if (displayX < 0 || displayX >= pattern.width || y < 0 || y >= pattern.height) return null;
  // 镜像查看时屏幕上的列与图纸数据的列左右相反，返回的始终是数据坐标。
  const x = mirrorX ? pattern.width - 1 - displayX : displayX;
  const position = y * pattern.width + x;
  return { x, y, position, colorIndex: pattern.indices[position] };
}
