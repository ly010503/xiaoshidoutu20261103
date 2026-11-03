export const COLOR_STYLES = {
  natural: { brightness: 0, contrast: 0, saturation: 0 },
  vivid: { brightness: 1, contrast: 10, saturation: 65 },
  ordered: { brightness: 0, contrast: 0, saturation: 0 },
  direct: { brightness: 0, contrast: 0, saturation: 0 },
};

export function getColorStyleAdjustments(baseAdjustments, style = 'vivid') {
  return {
    ...baseAdjustments,
    ...(COLOR_STYLES[style] || COLOR_STYLES.vivid),
  };
}

export function shouldProtectDarkOutline(style = 'vivid') {
  return style !== 'direct';
}

export function shouldOmitWhiteBackground(style = 'vivid') {
  return style !== 'direct';
}

export function shouldUseOrderedColorCleanup(style = 'vivid') {
  return style === 'ordered';
}
