export function calculateStatistics(indices, palette, excludedMask = null) {
  const counts = new Map();
  for (let position = 0; position < indices.length; position += 1) {
    if (excludedMask?.[position]) continue;
    const index = indices[position];
    if (!palette[index] || palette[index].excludeFromStatistics) continue;
    counts.set(index, (counts.get(index) || 0) + 1);
  }
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  return [...counts.entries()].map(([index, count]) => ({
    ...palette[index], index, count, percentage: total ? (count / total) * 100 : 0,
  })).sort((a, b) => b.count - a.count);
}

export function statisticsTotal(statistics) {
  return statistics.reduce((sum, item) => sum + item.count, 0);
}

export function countPatternBeans(indices, palette, excludedMask = null) {
  let count = 0;
  for (let position = 0; position < indices.length; position += 1) {
    if (excludedMask?.[position]) continue;
    const index = indices[position];
    if (palette[index] && !palette[index].excludeFromStatistics) count += 1;
  }
  return count;
}
