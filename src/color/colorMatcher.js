import { deltaE2000, rgbToLab } from './colorSpace.js';

const SERIES_NAMES = {
  A: '黄橙系',
  B: '绿色系',
  C: '蓝色系',
  D: '紫色系',
  E: '粉色系',
  F: '红色系',
  G: '肤棕系',
  H: '黑白灰系',
  M: '莫兰迪系',
};

function hexToRgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

export function preparePalette(palette) {
  return palette.map((color, index) => {
    const rgb = color.rgb || hexToRgb(color.hex);
    const name = color.name || SERIES_NAMES[color.code[0]] || `MARD ${color.code}`;
    return { ...color, name, rgb, index, lab: rgbToLab(...rgb) };
  });
}

export function findNearestPaletteColor(rgb, palette, distance = deltaE2000) {
  const lab = rgbToLab(...rgb);
  let nearest = palette[0], nearestDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const current = distance(lab, color.lab || rgbToLab(...color.rgb));
    if (current < nearestDistance) { nearest = color; nearestDistance = current; }
  }
  return nearest;
}
