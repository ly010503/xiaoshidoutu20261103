import { getPatternPosition } from '../pattern/mirror.js';
import { drawTiledWatermark } from './tiledWatermark.js';

const number = new Intl.NumberFormat('zh-CN');
export const GUIDE_STEP = 5;
export const CREATOR_WATERMARK = '@小石豆图';
export const COPYRIGHT_NOTICE = '原创作品 · 禁止盗用';
export const MIRROR_BADGE_TEXT = '镜像图';
export const HIGHLIGHT_MUTED_OVERLAY = 'rgba(250, 248, 252, .38)';
export const HIGHLIGHT_OUTLINE = '#4F2FC4';

export function isHighlightedPatternCell(pattern, palette, position, highlightedCode) {
  if (!highlightedCode || pattern.backgroundMask?.[position]) return false;
  const color = palette[pattern.indices[position]];
  return Boolean(color && !color.excludeFromStatistics && color.code === highlightedCode);
}

export function getCoordinateValues(length, step = GUIDE_STEP) {
  const values = [1];
  for (let value = step; value <= length; value += step) {
    if (value !== 1) values.push(value);
  }
  return values;
}

export function colorLuminance(rgb) {
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

export function getCellCodeFontSize(cell, enhanced = false) {
  return enhanced
    ? Math.max(7, Math.floor(cell * 0.52))
    : Math.max(6, Math.floor(cell * 0.4));
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r); ctx.closePath();
}

function drawBrand(ctx, x, y, scale = 1) {
  const colors = ['#9C8AE6', '#F3B7C8', '#F3D77A', '#9DD9C2', '#8CC9E8', '#BFA9F2'];
  colors.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + (index % 3) * 10 * scale, y + Math.floor(index / 3) * 10 * scale, 3.8 * scale, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHighlightOutline(ctx, x, y, cell) {
  const outerWidth = Math.max(2.5, cell * 0.22);
  const outerInset = outerWidth / 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, .96)';
  ctx.lineWidth = outerWidth;
  ctx.strokeRect(x + outerInset, y + outerInset, cell - outerWidth, cell - outerWidth);

  const lineWidth = Math.max(1.7, cell * 0.12);
  const inset = Math.max(outerWidth, lineWidth) / 2;
  ctx.strokeStyle = HIGHLIGHT_OUTLINE;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x + inset, y + inset, cell - inset * 2, cell - inset * 2);

  if (cell >= 10) {
    const markerX = x + cell * 0.76;
    const markerY = y + cell * 0.24;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(markerX, markerY, Math.max(2.2, cell * 0.13), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HIGHLIGHT_OUTLINE;
    ctx.beginPath();
    ctx.arc(markerX, markerY, Math.max(1.3, cell * 0.075), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMutedColor(ctx, hex, x, y, width, height = width) {
  ctx.fillStyle = hex;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = HIGHLIGHT_MUTED_OVERLAY;
  ctx.fillRect(x, y, width, height);
}

// 圆豆预览：白底上画一颗带中心孔的圆形豆子，更接近熨烫前的实物观感。
function drawBead(ctx, hex, x, y, cell, muted = false) {
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(x, y, cell, cell);
  ctx.globalAlpha = muted ? 0.45 : 1;
  ctx.fillStyle = hex;
  ctx.beginPath();
  ctx.arc(x + cell / 2, y + cell / 2, cell * 0.46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, .55)';
  ctx.beginPath();
  ctx.arc(x + cell / 2, y + cell / 2, cell * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

export function getHighlightHeaderText(item) {
  return {
    title: `${item.code} · ${item.name}`,
    subtitle: `分色定位图 · 共 ${number.format(item.count)}颗`,
  };
}

export function getSheetLayout(pattern, statistics, cell) {
  const padding = Math.max(28, Math.round(cell * 1.6));
  const coordinate = Math.max(24, Math.round(cell * 1.25));
  const header = Math.max(92, Math.round(cell * 5.2));
  const gridWidth = pattern.width * cell;
  const gridHeight = pattern.height * cell;
  const paperWidth = Math.max(gridWidth + (padding + coordinate) * 2, Math.round(cell * 22));
  const cardGap = Math.max(6, Math.round(cell * 0.3));
  const cardWidth = Math.max(70, Math.round(cell * 4));
  const cardHeight = Math.max(44, Math.round(cell * 2.2));
  const available = paperWidth - padding * 2;
  const columns = Math.max(3, Math.floor((available + cardGap) / (cardWidth + cardGap)));
  const rows = Math.ceil(statistics.length / columns);
  const legendHeight = rows * cardHeight + Math.max(0, rows - 1) * cardGap;
  const gridX = Math.round((paperWidth - gridWidth) / 2);
  const gridY = header + coordinate;
  const legendY = gridY + gridHeight + coordinate + Math.max(22, cell);
  const statsHeight = Math.max(56, Math.round(cell * 2.6));
  const paperHeight = legendY + legendHeight + statsHeight + padding;
  return { padding, coordinate, header, gridWidth, gridHeight, paperWidth, paperHeight, gridX, gridY, legendY, cardGap, cardWidth, cardHeight, columns, statsHeight };
}

export function drawEffect(ctx, pattern, palette, {
  cell = 10,
  highlightedCode = null,
  background = '#FFFDF8',
  showWatermark = false,
  tiledWatermarkText = '',
} = {}) {
  const padding = Math.max(18, cell * 2);
  const footer = showWatermark ? Math.max(80, Math.round(cell * 6)) : 0;
  const width = pattern.width * cell + padding * 2;
  const height = pattern.height * cell + padding * 2 + footer;
  ctx.canvas.width = width; ctx.canvas.height = height;
  ctx.fillStyle = background; ctx.fillRect(0, 0, width, height);
  for (let y = 0; y < pattern.height; y += 1) for (let x = 0; x < pattern.width; x += 1) {
    const position = y * pattern.width + x;
    const color = palette[pattern.indices[position]];
    const px = padding + x * cell;
    const py = padding + y * cell;
    const muted = highlightedCode && !isHighlightedPatternCell(pattern, palette, position, highlightedCode);
    if (muted) drawMutedColor(ctx, color.hex, px, py, cell);
    else { ctx.fillStyle = color.hex; ctx.fillRect(px, py, cell, cell); }
  }
  drawTiledWatermark(ctx, {
    x: padding,
    y: padding,
    width: pattern.width * cell,
    height: pattern.height * cell,
    text: tiledWatermarkText,
    fontSize: Math.max(22, Math.round(cell * 1.05)),
  });
  ctx.strokeStyle = 'rgba(98, 90, 110, .14)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = 0; x <= pattern.width; x += 1) { const px = padding + x * cell + 0.5; ctx.moveTo(px, padding); ctx.lineTo(px, padding + pattern.height * cell); }
  for (let y = 0; y <= pattern.height; y += 1) { const py = padding + y * cell + 0.5; ctx.moveTo(padding, py); ctx.lineTo(padding + pattern.width * cell, py); }
  ctx.stroke();
  if (highlightedCode) {
    for (let y = 0; y < pattern.height; y += 1) for (let x = 0; x < pattern.width; x += 1) {
      const position = y * pattern.width + x;
      if (!isHighlightedPatternCell(pattern, palette, position, highlightedCode)) continue;
      drawHighlightOutline(ctx, padding + x * cell, padding + y * cell, cell);
    }
  }
  if (showWatermark) {
    const footerTop = height - footer;
    ctx.fillStyle = '#4F426F';
    ctx.font = `800 ${Math.max(28, Math.round(cell * 1.4))}px "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(CREATOR_WATERMARK, width / 2, footerTop + footer * 0.38);
    ctx.fillStyle = '#7666B3';
    ctx.font = `750 ${Math.max(19, Math.round(cell * 0.9))}px "PingFang SC", sans-serif`;
    ctx.fillText(COPYRIGHT_NOTICE, width / 2, footerTop + footer * 0.7);
  }
  return { width, height };
}

export function drawPatternSheet(ctx, pattern, palette, statistics, {
  cell = 14,
  highlightedCode = null,
  selectedPositions = null,
  title = COPYRIGHT_NOTICE,
  mirrorX = false,
  tiledWatermarkText = '',
  showGrid = true,
  showCodes = true,
  roundBeads = false,
} = {}) {
  const enhancedLargePattern = Math.max(pattern.width, pattern.height) > 150;
  const layout = getSheetLayout(pattern, statistics, cell);
  const { paperWidth, paperHeight, gridX, gridY, gridWidth, gridHeight } = layout;
  ctx.canvas.width = paperWidth; ctx.canvas.height = paperHeight;
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, paperWidth, paperHeight);

  let brandX = layout.padding;
  if (mirrorX) {
    const badgeWidth = Math.max(88, Math.round(cell * 4.8));
    const badgeHeight = Math.max(38, Math.round(cell * 1.9));
    const badgeY = Math.round(layout.header * 0.45 - badgeHeight / 2);
    ctx.fillStyle = '#7D68C8';
    roundRect(ctx, layout.padding, badgeY, badgeWidth, badgeHeight, Math.max(8, Math.round(cell * 0.4)));
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 ${Math.max(18, Math.round(cell * 0.95))}px "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(MIRROR_BADGE_TEXT, layout.padding + badgeWidth / 2, badgeY + badgeHeight / 2);
    brandX += badgeWidth + Math.max(14, Math.round(cell * 0.7));
  }

  drawBrand(ctx, brandX, Math.max(28, layout.header * 0.38), Math.max(1, cell / 12));
  ctx.fillStyle = '#34313B'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.max(30, Math.round(cell * 1.75))}px "PingFang SC", sans-serif`;
  ctx.fillText(CREATOR_WATERMARK, brandX + Math.max(44, cell * 2.8), layout.header * 0.45);
  const highlightedItem = highlightedCode
    ? statistics.find((item) => item.code === highlightedCode)
    : null;
  if (highlightedItem) {
    const headerText = getHighlightHeaderText(highlightedItem);
    const swatchSize = Math.max(48, Math.round(cell * 2.55));
    const swatchX = paperWidth - layout.padding - swatchSize;
    const swatchY = Math.round(layout.header * 0.45 - swatchSize / 2);
    const textX = swatchX - Math.max(14, Math.round(cell * 0.7));
    ctx.fillStyle = highlightedItem.hex;
    roundRect(ctx, swatchX, swatchY, swatchSize, swatchSize, Math.max(9, Math.round(cell * 0.45)));
    ctx.fill();
    ctx.strokeStyle = HIGHLIGHT_OUTLINE;
    ctx.lineWidth = Math.max(3, Math.round(cell * 0.16));
    ctx.stroke();
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#332A50';
    ctx.font = `850 ${Math.max(28, Math.round(cell * 1.42))}px "PingFang SC", sans-serif`;
    ctx.fillText(headerText.title, textX, layout.header * 0.34);
    ctx.fillStyle = '#7666B3';
    ctx.font = `700 ${Math.max(17, Math.round(cell * 0.78))}px "PingFang SC", sans-serif`;
    ctx.fillText(headerText.subtitle, textX, layout.header * 0.65);
  } else {
    ctx.textAlign = 'right'; ctx.fillStyle = '#7666B3'; ctx.font = `750 ${Math.max(21, Math.round(cell * 1.15))}px "PingFang SC", sans-serif`;
    ctx.fillText(title, paperWidth - layout.padding, layout.header * 0.45);
  }

  for (let y = 0; y < pattern.height; y += 1) for (let x = 0; x < pattern.width; x += 1) {
    const position = getPatternPosition(pattern.width, x, y, mirrorX);
    const color = palette[pattern.indices[position]];
    const px = gridX + x * cell;
    const py = gridY + y * cell;
    const muted = highlightedCode && !isHighlightedPatternCell(pattern, palette, position, highlightedCode);
    if (roundBeads && !color.manualOnly && !pattern.backgroundMask?.[position]) drawBead(ctx, color.hex, px, py, cell, muted);
    else if (muted) drawMutedColor(ctx, color.hex, px, py, cell);
    else { ctx.fillStyle = color.hex; ctx.fillRect(px, py, cell, cell); }
  }
  drawTiledWatermark(ctx, {
    x: gridX,
    y: gridY,
    width: gridWidth,
    height: gridHeight,
    text: tiledWatermarkText,
    fontSize: Math.max(20, Math.round(cell * 0.92)),
    opacity: 0.16,
  });

  if (selectedPositions?.size) {
    ctx.fillStyle = 'rgba(124, 96, 210, .2)';
    ctx.strokeStyle = '#7657D6';
    ctx.lineWidth = Math.max(2, Math.round(cell * 0.12));
    for (const position of selectedPositions) {
      if (!Number.isInteger(position) || position < 0 || position >= pattern.indices.length) continue;
      const sourceX = position % pattern.width;
      const x = mirrorX ? pattern.width - sourceX - 1 : sourceX;
      const y = Math.floor(position / pattern.width);
      const px = gridX + x * cell;
      const py = gridY + y * cell;
      ctx.fillRect(px, py, cell, cell);
      const inset = Math.max(1, Math.round(ctx.lineWidth / 2));
      ctx.strokeRect(px + inset, py + inset, cell - inset * 2, cell - inset * 2);
    }
  }

  if (showGrid) {
    ctx.strokeStyle = '#C9CDD5';
    ctx.lineWidth = enhancedLargePattern ? Math.max(1, Math.round(cell / 24)) : 1;
    ctx.beginPath();
    for (let x = 0; x <= pattern.width; x += 1) { const px = Math.round(gridX + x * cell) + 0.5; ctx.moveTo(px, gridY); ctx.lineTo(px, gridY + gridHeight); }
    for (let y = 0; y <= pattern.height; y += 1) { const py = Math.round(gridY + y * cell) + 0.5; ctx.moveTo(gridX, py); ctx.lineTo(gridX + gridWidth, py); }
    ctx.stroke();

    ctx.strokeStyle = '#8982A8'; ctx.lineWidth = Math.max(2, Math.round(cell / 7)); ctx.beginPath();
    for (let x = GUIDE_STEP; x < pattern.width; x += GUIDE_STEP) { const px = Math.round(gridX + x * cell); ctx.moveTo(px, gridY); ctx.lineTo(px, gridY + gridHeight); }
    for (let y = GUIDE_STEP; y < pattern.height; y += GUIDE_STEP) { const py = Math.round(gridY + y * cell); ctx.moveTo(gridX, py); ctx.lineTo(gridX + gridWidth, py); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#706A88'; ctx.lineWidth = Math.max(2, Math.round(cell / 6));
  ctx.strokeRect(Math.round(gridX), Math.round(gridY), gridWidth, gridHeight);

  ctx.font = `${enhancedLargePattern ? 800 : 700} ${getCellCodeFontSize(cell, enhancedLargePattern)}px "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (showCodes) for (let y = 0; y < pattern.height; y += 1) for (let x = 0; x < pattern.width; x += 1) {
    const position = getPatternPosition(pattern.width, x, y, mirrorX);
    if (pattern.backgroundMask?.[position]) continue;
    const color = palette[pattern.indices[position]];
    if (color.hideCode) continue;
    const muted = highlightedCode && !isHighlightedPatternCell(pattern, palette, position, highlightedCode);
    const dark = colorLuminance(color.rgb) < 0.36;
    const tx = gridX + (x + 0.5) * cell, ty = gridY + (y + 0.52) * cell;
    ctx.lineWidth = enhancedLargePattern
      ? Math.max(0.9, cell * 0.05)
      : Math.max(0.75, cell * 0.045);
    ctx.strokeStyle = dark ? 'rgba(0,0,0,.38)' : 'rgba(255,255,255,.76)';
    ctx.fillStyle = dark ? '#FFFFFF' : '#25232B';
    ctx.globalAlpha = muted ? 0.42 : 1;
    ctx.strokeText(color.code, tx, ty, cell - 2);
    ctx.fillText(color.code, tx, ty, cell - 2);
    ctx.globalAlpha = 1;
  }

  if (highlightedCode) {
    for (let y = 0; y < pattern.height; y += 1) for (let x = 0; x < pattern.width; x += 1) {
      const position = getPatternPosition(pattern.width, x, y, mirrorX);
      if (!isHighlightedPatternCell(pattern, palette, position, highlightedCode)) continue;
      drawHighlightOutline(ctx, gridX + x * cell, gridY + y * cell, cell);
    }
  }

  ctx.fillStyle = '#565A63'; ctx.font = `700 ${Math.max(9, Math.round(cell * 0.5))}px Arial, sans-serif`; ctx.textAlign = 'center';
  const xValues = getCoordinateValues(pattern.width);
  const yValues = getCoordinateValues(pattern.height);
  xValues.forEach((value) => { const px = gridX + (value - 0.5) * cell; ctx.fillText(value, px, gridY - layout.coordinate * 0.5); ctx.fillText(value, px, gridY + gridHeight + layout.coordinate * 0.5); });
  yValues.forEach((value) => { const py = gridY + (value - 0.5) * cell; ctx.textAlign = 'right'; ctx.fillText(value, gridX - 7, py); ctx.textAlign = 'left'; ctx.fillText(value, gridX + gridWidth + 7, py); });

  statistics.forEach((item, index) => {
    const column = index % layout.columns, row = Math.floor(index / layout.columns);
    const usedWidth = layout.columns * layout.cardWidth + (layout.columns - 1) * layout.cardGap;
    const startX = Math.round((paperWidth - usedWidth) / 2);
    const x = startX + column * (layout.cardWidth + layout.cardGap);
    const y = layout.legendY + row * (layout.cardHeight + layout.cardGap);
    const highlighted = !highlightedCode || item.code === highlightedCode;
    ctx.fillStyle = item.hex; roundRect(ctx, x, y, layout.cardWidth, layout.cardHeight, Math.max(5, cell * 0.35)); ctx.fill();
    if (!highlighted) {
      ctx.fillStyle = HIGHLIGHT_MUTED_OVERLAY;
      ctx.fill();
    }
    ctx.strokeStyle = highlightedCode && highlighted ? HIGHLIGHT_OUTLINE : 'rgba(60,58,65,.18)';
    ctx.lineWidth = highlightedCode && highlighted ? Math.max(2, cell * 0.12) : 1;
    ctx.stroke();
    ctx.fillStyle = highlighted && colorLuminance(item.rgb) < 0.36 ? '#FFFFFF' : highlighted ? '#2E2C35' : '#85818A'; ctx.textAlign = 'center';
    ctx.font = `700 ${Math.max(10, Math.round(cell * 0.58))}px Arial, sans-serif`; ctx.fillText(item.code, x + layout.cardWidth / 2, y + layout.cardHeight * 0.36);
    ctx.font = `600 ${Math.max(9, Math.round(cell * 0.47))}px "PingFang SC", sans-serif`; ctx.fillText(`${number.format(item.count)}颗`, x + layout.cardWidth / 2, y + layout.cardHeight * 0.72);
  });

  const total = statistics.reduce((sum, item) => sum + item.count, 0);
  const statsY = paperHeight - layout.padding - layout.statsHeight * 0.46;
  ctx.textAlign = 'right'; ctx.fillStyle = '#7666B3'; ctx.font = `700 ${Math.max(12, Math.round(cell * 0.65))}px "PingFang SC", sans-serif`;
  ctx.fillText(`共${statistics.length}色　总计${number.format(total)}颗`, paperWidth - layout.padding, statsY - 9);
  ctx.fillStyle = '#625E69'; ctx.font = `500 ${Math.max(10, Math.round(cell * 0.52))}px "PingFang SC", sans-serif`;
  ctx.fillText(`图纸尺寸：${pattern.width} × ${pattern.height}格`, paperWidth - layout.padding, statsY + 14);
  ctx.textAlign = 'left'; ctx.fillStyle = '#7666B3'; ctx.font = `750 ${Math.max(17, Math.round(cell * 0.9))}px "PingFang SC", sans-serif`;
  ctx.fillText(`${CREATOR_WATERMARK} · 原创图纸，禁止盗用`, layout.padding, statsY + 14);
  return layout;
}
