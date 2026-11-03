import { colorLuminance, CREATOR_WATERMARK, GUIDE_STEP } from '../canvas/patternPainter.js';
import { drawTiledWatermark } from '../canvas/tiledWatermark.js';
import { getPatternPosition } from '../pattern/mirror.js';
import { createImagePdf } from './pdfWriter.js';
import {
  PRINT_AXIS_MM,
  PRINT_FOOTER_MM,
  PRINT_HEADER_MM,
  PRINT_MARGIN_MM,
  planPrintPages,
} from './printLayout.js';
import { download } from './pngExporter.js';

const DPI = 200;
const PX_PER_MM = DPI / 25.4;
const PT_PER_MM = 72 / 25.4;
const FONT = '"PingFang SC", "Microsoft YaHei", sans-serif';
const number = new Intl.NumberFormat('zh-CN');
const mm = (value) => value * PX_PER_MM;

function createPageCanvas(paper) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(mm(paper.width));
  canvas.height = Math.round(mm(paper.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

async function canvasToPdfPage(canvas, paper) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  if (!blob) throw new Error('打印页生成失败，请缩小图纸后重试');
  return {
    jpeg: new Uint8Array(await blob.arrayBuffer()),
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    pageWidth: paper.width * PT_PER_MM,
    pageHeight: paper.height * PT_PER_MM,
  };
}

function drawHeader(ctx, paper, title, subtitle) {
  const left = mm(PRINT_MARGIN_MM);
  const right = mm(paper.width - PRINT_MARGIN_MM);
  ctx.fillStyle = '#2F2A38';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.font = `800 ${mm(4.2)}px ${FONT}`;
  ctx.fillText(title, left, mm(PRINT_MARGIN_MM + 5));
  ctx.fillStyle = '#6F6680';
  ctx.font = `600 ${mm(2.6)}px ${FONT}`;
  ctx.fillText(subtitle, left, mm(PRINT_MARGIN_MM + 10));
  ctx.textAlign = 'right';
  ctx.fillStyle = '#7864C3';
  ctx.font = `700 ${mm(2.6)}px ${FONT}`;
  ctx.fillText('打印时请选择“实际大小 / 100%”，不要“适合页面”', right, mm(PRINT_MARGIN_MM + 5));
  ctx.fillStyle = '#8A8296';
  ctx.font = `600 ${mm(2.4)}px ${FONT}`;
  ctx.fillText(CREATOR_WATERMARK, right, mm(PRINT_MARGIN_MM + 10));
}

// 5 cm 校准尺：打印后用尺子量一下，就能确认打印机没有缩放。
function drawCalibrationRuler(ctx, paper) {
  const x = mm(PRINT_MARGIN_MM);
  const y = mm(paper.height - PRINT_MARGIN_MM - 3);
  ctx.strokeStyle = '#2F2A38';
  ctx.lineWidth = mm(0.25);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + mm(50), y);
  for (let tick = 0; tick <= 50; tick += 5) {
    const length = tick % 10 === 0 ? 2 : 1.2;
    ctx.moveTo(x + mm(tick), y);
    ctx.lineTo(x + mm(tick), y - mm(length));
  }
  ctx.stroke();
  ctx.fillStyle = '#4F4760';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${mm(2.3)}px ${FONT}`;
  ctx.fillText('校准尺：打印后这段应正好 5 cm', x + mm(53), y - mm(1));
}

function axisLabelValues(start, end) {
  const values = [start + 1];
  for (let value = Math.ceil((start + 1) / GUIDE_STEP) * GUIDE_STEP; value <= end; value += GUIDE_STEP) {
    if (value !== start + 1) values.push(value);
  }
  return values;
}

function drawGridPage(ctx, pattern, palette, plan, page, { mirrorX, watermark }) {
  const cell = mm(plan.beadMm);
  const originX = mm(PRINT_MARGIN_MM + PRINT_AXIS_MM);
  const originY = mm(PRINT_MARGIN_MM + PRINT_HEADER_MM + PRINT_AXIS_MM);
  const columns = page.endX - page.startX;
  const rows = page.endY - page.startY;
  const gridWidth = columns * cell;
  const gridHeight = rows * cell;

  for (let y = page.startY; y < page.endY; y += 1) {
    for (let x = page.startX; x < page.endX; x += 1) {
      const position = getPatternPosition(pattern.width, x, y, mirrorX);
      const color = palette[pattern.indices[position]];
      ctx.fillStyle = pattern.backgroundMask?.[position] ? '#FFFFFF' : color.hex;
      ctx.fillRect(originX + (x - page.startX) * cell, originY + (y - page.startY) * cell, cell + 0.5, cell + 0.5);
    }
  }
  drawTiledWatermark(ctx, {
    x: originX, y: originY, width: gridWidth, height: gridHeight,
    text: watermark, fontSize: mm(4), opacity: 0.12,
  });

  ctx.strokeStyle = '#BFC3CC';
  ctx.lineWidth = mm(0.08);
  ctx.beginPath();
  for (let x = 0; x <= columns; x += 1) { ctx.moveTo(originX + x * cell, originY); ctx.lineTo(originX + x * cell, originY + gridHeight); }
  for (let y = 0; y <= rows; y += 1) { ctx.moveTo(originX, originY + y * cell); ctx.lineTo(originX + gridWidth, originY + y * cell); }
  ctx.stroke();
  ctx.strokeStyle = '#6F6890';
  ctx.lineWidth = mm(0.3);
  ctx.beginPath();
  for (let x = page.startX + 1; x < page.endX; x += 1) {
    if (x % GUIDE_STEP) continue;
    ctx.moveTo(originX + (x - page.startX) * cell, originY);
    ctx.lineTo(originX + (x - page.startX) * cell, originY + gridHeight);
  }
  for (let y = page.startY + 1; y < page.endY; y += 1) {
    if (y % GUIDE_STEP) continue;
    ctx.moveTo(originX, originY + (y - page.startY) * cell);
    ctx.lineTo(originX + gridWidth, originY + (y - page.startY) * cell);
  }
  ctx.stroke();
  ctx.strokeRect(originX, originY, gridWidth, gridHeight);

  // 色号字号随豆子直径变化：2.6mm 豆约 1.1mm 高，5mm 豆约 2mm 高。
  ctx.font = `700 ${cell * 0.42}px "Arial Narrow", Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let y = page.startY; y < page.endY; y += 1) {
    for (let x = page.startX; x < page.endX; x += 1) {
      const position = getPatternPosition(pattern.width, x, y, mirrorX);
      if (pattern.backgroundMask?.[position]) continue;
      const color = palette[pattern.indices[position]];
      if (color.hideCode) continue;
      ctx.fillStyle = colorLuminance(color.rgb) < 0.36 ? '#FFFFFF' : '#25232B';
      ctx.fillText(color.code, originX + (x - page.startX + 0.5) * cell, originY + (y - page.startY + 0.53) * cell, cell * 0.94);
    }
  }

  ctx.fillStyle = '#5E5770';
  ctx.font = `700 ${mm(2.2)}px Arial, sans-serif`;
  for (const value of axisLabelValues(page.startX, page.endX)) {
    const px = originX + (value - page.startX - 0.5) * cell;
    ctx.fillText(String(value), px, originY - mm(PRINT_AXIS_MM / 2));
    ctx.fillText(String(value), px, originY + gridHeight + mm(PRINT_AXIS_MM / 2));
  }
  for (const value of axisLabelValues(page.startY, page.endY)) {
    const py = originY + (value - page.startY - 0.5) * cell;
    ctx.textAlign = 'right';
    ctx.fillText(String(value), originX - mm(0.8), py);
    ctx.textAlign = 'left';
    ctx.fillText(String(value), originX + gridWidth + mm(0.8), py);
  }
}

function legendLayout(paper) {
  const columns = 3;
  const rowHeight = 9;
  const top = PRINT_MARGIN_MM + PRINT_HEADER_MM + 4;
  const rowsPerPage = Math.floor((paper.height - top - PRINT_MARGIN_MM - PRINT_FOOTER_MM) / rowHeight);
  return { columns, rowHeight, top, perPage: columns * rowsPerPage };
}

function drawLegendPage(ctx, paper, items, startIndex) {
  const { columns, rowHeight, top } = legendLayout(paper);
  const columnWidth = (paper.width - PRINT_MARGIN_MM * 2) / columns;
  items.forEach((item, offset) => {
    const order = startIndex + offset;
    const x = mm(PRINT_MARGIN_MM + (offset % columns) * columnWidth);
    const y = mm(top + Math.floor(offset / columns) * rowHeight);
    ctx.fillStyle = item.hex;
    ctx.fillRect(x, y, mm(7), mm(7));
    ctx.strokeStyle = '#C9C3D3';
    ctx.lineWidth = mm(0.15);
    ctx.strokeRect(x, y, mm(7), mm(7));
    ctx.fillStyle = '#2F2A38';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${mm(3)}px Arial, sans-serif`;
    ctx.fillText(`${order + 1}. ${item.code}`, x + mm(9), y + mm(2.3));
    ctx.fillStyle = '#6F6680';
    ctx.font = `600 ${mm(2.4)}px ${FONT}`;
    ctx.fillText(`${number.format(item.count)} 颗 · ${item.name}`, x + mm(9), y + mm(5.4), mm(columnWidth - 11));
  });
}

/**
 * 1:1 实物尺寸打印 PDF：图纸页按豆子直径排格，最后附色号图例与用量。
 */
export async function exportPrintPdf(pattern, palette, statistics, {
  beadMm = 2.6,
  mirrorX = false,
  tiledWatermarkText = '',
  onProgress = () => {},
} = {}) {
  const plan = planPrintPages(pattern, beadMm);
  const legend = legendLayout(plan.paper);
  const legendPages = Math.max(1, Math.ceil(statistics.length / legend.perPage));
  const totalPages = plan.pages.length + legendPages;
  const pdfPages = [];
  const sizeText = `图纸 ${pattern.width} × ${pattern.height} 格 · 豆子直径 ${beadMm} mm · 成品约 ${(pattern.width * beadMm / 10).toFixed(1)} × ${(pattern.height * beadMm / 10).toFixed(1)} cm${mirrorX ? ' · 镜像图' : ''}`;

  for (const [index, page] of plan.pages.entries()) {
    onProgress(index + 1, totalPages);
    const { canvas, ctx } = createPageCanvas(plan.paper);
    drawHeader(
      ctx,
      plan.paper,
      `拼豆图纸 1:1 打印 · 第 ${index + 1} / ${totalPages} 页`,
      `第 ${page.startX + 1}–${page.endX} 列，第 ${page.startY + 1}–${page.endY} 行 · ${sizeText}`,
    );
    drawGridPage(ctx, pattern, palette, plan, page, { mirrorX, watermark: tiledWatermarkText });
    drawCalibrationRuler(ctx, plan.paper);
    pdfPages.push(await canvasToPdfPage(canvas, plan.paper));
  }

  const legendPaper = { width: 210, height: 297 };
  const total = statistics.reduce((sum, item) => sum + item.count, 0);
  for (let page = 0; page < legendPages; page += 1) {
    const pageNumber = plan.pages.length + page + 1;
    onProgress(pageNumber, totalPages);
    const { canvas, ctx } = createPageCanvas(legendPaper);
    drawHeader(
      ctx,
      legendPaper,
      `色号图例与用量 · 第 ${pageNumber} / ${totalPages} 页`,
      `共 ${statistics.length} 色 · 总计 ${number.format(total)} 颗 · ${sizeText}`,
    );
    const start = page * legend.perPage;
    drawLegendPage(ctx, legendPaper, statistics.slice(start, start + legend.perPage), start);
    pdfPages.push(await canvasToPdfPage(canvas, legendPaper));
  }

  const bytes = createImagePdf(pdfPages);
  download(new Blob([bytes], { type: 'application/pdf' }), `拼豆1比1打印-${pattern.width}x${pattern.height}-${beadMm}mm${mirrorX ? '-镜像' : ''}.pdf`);
  return { pages: totalPages, gridPages: plan.pages.length, landscape: plan.landscape };
}
