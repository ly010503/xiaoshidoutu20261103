// 配色方案：[文字, 内描边, 中层描边, 外层云朵]，全部是 MARD 221 色卡中的真实色号。
export const TEXT_COLOR_SCHEMES = [
  { id: 'romantic-pink', name: '浪漫粉', codes: ['H2', 'F24', 'E6', 'E8'] },
  { id: 'hot-red', name: '热烈红', codes: ['H2', 'F13', 'F8', 'E15'] },
  { id: 'classic-blue', name: '经典蓝', codes: ['H2', 'C6', 'C8', 'C13'] },
  { id: 'mint', name: '薄荷绿', codes: ['H2', 'B28', 'B7', 'C1'] },
  { id: 'lemon', name: '柠檬黄', codes: ['H2', 'A8', 'G6', 'A1'] },
  { id: 'taro', name: '香芋紫', codes: ['H2', 'D9', 'D7', 'D23'] },
  { id: 'milk-tea', name: '奶茶棕', codes: ['H19', 'G4', 'G14', 'M4'] },
  { id: 'gold', name: '金色豪华', codes: ['A24', 'A26', 'G10', 'F10'] },
  { id: 'mono', name: '黑白酷', codes: ['H2', 'H5', 'H7', 'H9'] },
  { id: 'peach', name: '蜜桃橙', codes: ['H2', 'A12', 'A10', 'G1'] },
  { id: 'candy-sky', name: '天空糖', codes: ['H2', 'F24', 'C6', 'A1'] },
  { id: 'forest', name: '森林系', codes: ['H19', 'B31', 'B12', 'B27'] },
];

/**
 * 每种样式的描边层宽度（格）。云朵字的最外层随字高加宽，看起来更蓬松。
 */
export function getRingWidths(style, charHeight) {
  if (style === 'outline') return [1];
  if (style === 'cloud') return [1, charHeight >= 24 ? 2 : 1, charHeight >= 24 ? 3 : 2];
  return [];
}

// 彩虹描边固定使用的 MARD 色号：红、橙、黄、绿、蓝、紫，由内到外。
export const RAINBOW_CODES = ['F13', 'A10', 'A8', 'B7', 'C6', 'D7'];

/**
 * 每种样式的图层：ringWidths 是各层描边宽度，codes 依次是文字和各层描边的色号，null 表示留白。
 * scheme 是配色方案的四个色号 [文字, 内描边, 中层描边, 外层云朵]。
 */
export function getTextStyleLayers(style, charHeight, scheme) {
  const [text, inner, middle, outer] = scheme;
  if (style === 'plain') return { ringWidths: [], codes: [middle], fillHoles: false };
  if (style === 'outline') return { ringWidths: getRingWidths('outline', charHeight), codes: [text, inner], fillHoles: false };
  // 贴纸字：彩色字 + 一圈粗白边 + 细外框，整块实心，剪下来就是一枚贴纸。
  if (style === 'sticker') {
    return { ringWidths: [charHeight >= 24 ? 3 : 2, 1], codes: [middle, 'H2', inner], fillHoles: true };
  }
  // 空心字：字面留白，只沿笔画外缘拼一圈，最省豆。
  if (style === 'hollow') return { ringWidths: [1], codes: [null, middle], fillHoles: false };
  if (style === 'rainbow') {
    return { ringWidths: RAINBOW_CODES.map(() => 1), codes: [text, ...RAINBOW_CODES], fillHoles: true };
  }
  return { ringWidths: getRingWidths('cloud', charHeight), codes: [text, inner, middle, outer], fillHoles: true };
}

export function maskFromCoverage(coverage, threshold = 0.5) {
  return Uint8Array.from(coverage, (value) => (value >= threshold ? 1 : 0));
}

export function trimMask(mask, width, height) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (maxX < 0) return { mask: new Uint8Array(0), width: 0, height: 0 };
  const trimmedWidth = maxX - minX + 1;
  const trimmedHeight = maxY - minY + 1;
  const trimmed = new Uint8Array(trimmedWidth * trimmedHeight);
  for (let y = 0; y < trimmedHeight; y += 1) {
    for (let x = 0; x < trimmedWidth; x += 1) trimmed[y * trimmedWidth + x] = mask[(y + minY) * width + x + minX];
  }
  return { mask: trimmed, width: trimmedWidth, height: trimmedHeight };
}

/** 圆形结构元膨胀，半径按格计算，边角是圆润的而不是方块状。 */
export function dilateMask(mask, width, height, radius) {
  if (radius <= 0) return Uint8Array.from(mask);
  const offsets = [];
  const limit = radius * radius + radius * 0.5;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) if (dx * dx + dy * dy <= limit) offsets.push([dx, dy]);
  }
  const result = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue;
      for (const [dx, dy] of offsets) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < width && ny < height) result[ny * width + nx] = 1;
      }
    }
  }
  return result;
}

/** 填上被图形完全包围的空洞（不与画布边缘连通的空白）。 */
export function fillEnclosedHoles(mask, width, height) {
  const outside = new Uint8Array(mask.length);
  const stack = [];
  const visit = (position) => {
    if (mask[position] || outside[position]) return;
    outside[position] = 1;
    stack.push(position);
  };
  for (let x = 0; x < width; x += 1) { visit(x); visit((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { visit(y * width); visit(y * width + width - 1); }
  while (stack.length) {
    const position = stack.pop();
    const x = position % width, y = Math.floor(position / width);
    if (x > 0) visit(position - 1);
    if (x < width - 1) visit(position + 1);
    if (y > 0) visit(position - width);
    if (y < height - 1) visit(position + width);
  }
  return Uint8Array.from(mask, (value, position) => (value || !outside[position] ? 1 : 0));
}

/**
 * 把文字掩码排成带描边层的图纸。colorIndices 依次为文字和各层描边的色板下标，
 * 描边层数不足 colorIndices 时多余的颜色不使用；某层颜色为 null 时该层留白（空心字）。
 * 空白格使用 blankIndex 并标记为留白。
 */
export function buildTextPattern(mask, width, height, {
  ringWidths = [],
  colorIndices,
  blankIndex,
  margin = 1,
  fillHoles = false,
}) {
  const ringTotal = ringWidths.reduce((sum, value) => sum + value, 0);
  const pad = ringTotal + margin;
  const gridWidth = width + pad * 2;
  const gridHeight = height + pad * 2;
  const base = new Uint8Array(gridWidth * gridHeight);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) base[(y + pad) * gridWidth + x + pad] = mask[y * width + x];
  }
  const layers = [base];
  let radius = 0;
  for (const ringWidth of ringWidths) {
    radius += ringWidth;
    layers.push(dilateMask(base, gridWidth, gridHeight, radius));
  }
  // 云朵字整件做成实心一块，字内部的封闭空洞由最外层颜色补满；描边字保留字形内的空洞。
  if (fillHoles) layers[layers.length - 1] = fillEnclosedHoles(layers.at(-1), gridWidth, gridHeight);

  const indices = new Uint8Array(gridWidth * gridHeight).fill(blankIndex);
  const backgroundMask = new Uint8Array(gridWidth * gridHeight).fill(1);
  for (let position = 0; position < indices.length; position += 1) {
    const layer = layers.findIndex((layerMask) => layerMask[position]);
    if (layer < 0 || colorIndices[layer] == null) continue;
    indices[position] = colorIndices[layer];
    backgroundMask[position] = 0;
  }
  return { width: gridWidth, height: gridHeight, indices, backgroundMask };
}
