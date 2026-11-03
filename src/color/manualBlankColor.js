export const MANUAL_BLANK_CODE = '__BLANK__';

export const MANUAL_BLANK_COLOR = Object.freeze({
  code: MANUAL_BLANK_CODE,
  displayCode: '留白',
  name: '无色号 · 不统计',
  hex: '#FFFFFF',
  rgb: [255, 255, 255],
  manualOnly: true,
  hideCode: true,
  excludeFromStatistics: true,
  searchTerms: '纯白 留白 背景 空白 无色号 不统计',
});

export function getColorDisplayCode(color) {
  return color?.displayCode || color?.code || '';
}

export function getColorDisplayLabel(color) {
  if (!color) return '';
  return color.manualOnly
    ? '纯白留白（无色号 · 不统计）'
    : `${getColorDisplayCode(color)} · ${color.name}`;
}
