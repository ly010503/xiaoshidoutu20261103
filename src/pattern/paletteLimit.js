/** 避免孤立点整理把小面积高彩度颜色替换成中性色。 */
export function shouldProtectAccent(currentColor, dominantColor) {
  const currentChroma = Math.hypot(currentColor.lab.a, currentColor.lab.b);
  const dominantChroma = Math.hypot(dominantColor.lab.a, dominantColor.lab.b);
  return /^[C-F]/.test(currentColor.code)
    && currentChroma >= 18
    && dominantChroma < currentChroma * 0.85;
}

/**
 * 根据图片实际颜色分布自动选择需要保留的色卡颜色。
 * maxColors 只是硬上限；palette 可选，用于保护小面积蓝、紫、粉、红细节。
 */
export function choosePaletteIndices(counts, maxColors, total = 0, palette = null) {
  const pixelTotal = total || counts.reduce((sum, count) => sum + count, 0);
  const limit = Math.max(1, Math.min(counts.length, Math.floor(maxColors) || 1));
  const sorted = [...counts.keys()]
    .filter((index) => counts[index] > 0)
    .sort((a, b) => counts[b] - counts[a]);

  if (!sorted.length) return [0];

  const selected = [];
  const minimumCount = Math.max(2, Math.ceil(pixelTotal * 0.001));
  let covered = 0;

  for (const index of sorted) {
    if (selected.length >= limit) break;
    if (selected.length >= 4 && counts[index] < minimumCount) break;
    selected.push(index);
    covered += counts[index];
    if (selected.length >= 4 && covered / pixelTotal >= 0.995) break;
  }

  if (palette) {
    const accentMinimum = Math.max(2, Math.ceil(pixelTotal * 0.0002));
    const protectedSeries = ['C', 'D', 'E', 'F'];
    const accentLimit = Math.min(4, Math.max(2, Math.floor(limit / 4)));
    const accents = protectedSeries
      .map((series) => sorted
        .filter((index) => palette[index]?.code?.startsWith(series) && counts[index] >= accentMinimum)
        .sort((a, b) => counts[b] - counts[a])[0])
      .filter((index) => index !== undefined
        && !selected.some((selectedIndex) => palette[selectedIndex]?.code?.[0] === palette[index]?.code?.[0]))
      .sort((a, b) => counts[b] - counts[a])
      .slice(0, accentLimit);

    for (const index of accents) {
      if (selected.length < limit) {
        selected.push(index);
        continue;
      }
      let replaceAt = -1;
      for (let position = selected.length - 1; position >= 0; position -= 1) {
        if (!protectedSeries.includes(palette[selected[position]]?.code?.[0])) {
          replaceAt = position;
          break;
        }
      }
      if (replaceAt >= 0) selected.splice(replaceAt, 1, index);
    }
  }

  return selected;
}
