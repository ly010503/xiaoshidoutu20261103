export function updateRecentColorCodes(codes, code, limit = 12) {
  if (!code) return [...codes];
  return [code, ...codes.filter((item) => item !== code)].slice(0, Math.max(1, limit));
}

export function sortPaletteByRecent(palette, recentCodes) {
  const rank = new Map(recentCodes.map((code, index) => [code, index]));
  return [...palette].sort((a, b) => {
    const aRank = rank.has(a.code) ? rank.get(a.code) : Number.POSITIVE_INFINITY;
    const bRank = rank.has(b.code) ? rank.get(b.code) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return a.index - b.index;
  });
}
