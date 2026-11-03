import { deltaE76 } from '../color/colorSpace.js';

/**
 * 合并零散色号：用量占比低于 ratio 的颜色并入保留颜色中色差最小的一个。
 * statistics 为 calculateStatistics 的结果（已排除留白），palette 需带 lab。
 * 返回 [{ from, to, count }]，from/to 为色板下标；没有可合并的颜色时返回空数组。
 */
export function planMinorColorMerge(statistics, palette, ratio) {
  const total = statistics.reduce((sum, item) => sum + item.count, 0);
  if (!total || !(ratio > 0)) return [];
  const minor = statistics.filter((item) => item.count / total < ratio);
  const kept = statistics.filter((item) => item.count / total >= ratio);
  if (!minor.length || !kept.length) return [];
  return minor.map((item) => {
    let target = kept[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of kept) {
      const distance = deltaE76(palette[item.index].lab, palette[candidate.index].lab);
      if (distance < bestDistance) {
        target = candidate;
        bestDistance = distance;
      }
    }
    return { from: item.index, to: target.index, count: item.count };
  });
}

export function applyColorMerges(pattern, merges) {
  const replacement = new Map(merges.map(({ from, to }) => [from, to]));
  const positions = [];
  for (let position = 0; position < pattern.indices.length; position += 1) {
    if (pattern.backgroundMask?.[position]) continue;
    const target = replacement.get(pattern.indices[position]);
    if (target === undefined) continue;
    pattern.indices[position] = target;
    positions.push(position);
  }
  return positions;
}
