export function normalizeOwnedCodes(codes, paletteCodes) {
  const known = new Set(paletteCodes.filter((code) => code !== '__BLANK__'));
  return [...new Set(Array.isArray(codes) ? codes : [])].filter((code) => known.has(code));
}

export function parseOwnedCodes(text, paletteCodes) {
  const tokens = String(text).toUpperCase().split(/[\s,，、;；]+/).filter(Boolean);
  const known = new Set(paletteCodes);
  return { codes: normalizeOwnedCodes(tokens, paletteCodes), unknown: [...new Set(tokens.filter((code) => !known.has(code)))] };
}

export function resolveAllowedPaletteIndices(palette, enabled, ownedCodes, detected = null) {
  if (!enabled) return detected;
  const codes = new Set(ownedCodes);
  const owned = palette.filter((color) => !color.manualOnly && codes.has(color.code)).map((color) => color.index);
  if (!owned.length) throw new Error('请先选择至少一个已有色号');
  if (!detected?.length) return owned;
  // A complete available legend preserves recovery fidelity. If any legend
  // color is missing, all owned colors remain candidates for its replacement.
  return detected.every((index) => owned.includes(index)) ? detected : owned;
}
