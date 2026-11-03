export const PATTERN_SIZES = [
  { id: 'square-50', label: '方形 50', width: 50, height: 50, description: '适合头像和简单图案' },
  { id: 'square-64', label: '方形 64', width: 64, height: 64, description: '常用方形尺寸' },
  { id: 'square-70', label: '方形 70', width: 70, height: 70, description: '方形细节更丰富' },
  { id: 'square-90', label: '方形 90', width: 90, height: 90, description: '适合复杂方形图案' },
  { id: 'square-104', label: '方形 104', width: 104, height: 104, description: '大型精细方形图纸' },
  { id: 'portrait-70-104', label: '竖版 70×104', width: 70, height: 104, description: '适合人物和宠物', recommended: true },
];

export const COLOR_OPTIONS = [
  { value: 15, label: '最多 15 色', description: '用色更少，备豆更轻松' },
  { value: 24, label: '最多 24 色', description: '效果和难度更均衡', recommended: true },
  { value: 48, label: '最多 48 色', description: '适合保留更多细节' },
  { value: 96, label: '最多 96 色', description: '颜色层次更加丰富' },
  { value: 221, label: '最多 221 色', description: '开放完整标准色库' },
];

export const DEFAULT_SIZE = { width: 70, height: 104 };
export const BEAD_DIAMETER_MM = 2.6;
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
export const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const sizeKey = ({ width, height }) => `${width}x${height}`;

export function physicalSizeCm(gridCount) {
  return gridCount * BEAD_DIAMETER_MM / 10;
}
