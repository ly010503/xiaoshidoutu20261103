export const A4_MM = { width: 210, height: 297 };
export const PRINT_MARGIN_MM = 8;
export const PRINT_AXIS_MM = 5;
export const PRINT_HEADER_MM = 14;
export const PRINT_FOOTER_MM = 10;

function planOrientation(width, height, beadMm, paper) {
  const usableWidth = paper.width - PRINT_MARGIN_MM * 2 - PRINT_AXIS_MM * 2;
  const usableHeight = paper.height - PRINT_MARGIN_MM * 2 - PRINT_HEADER_MM - PRINT_FOOTER_MM - PRINT_AXIS_MM * 2;
  const columnsPerPage = Math.max(1, Math.floor(usableWidth / beadMm));
  const rowsPerPage = Math.max(1, Math.floor(usableHeight / beadMm));
  const pages = [];
  for (let startY = 0; startY < height; startY += rowsPerPage) {
    for (let startX = 0; startX < width; startX += columnsPerPage) {
      pages.push({
        startX,
        startY,
        endX: Math.min(width, startX + columnsPerPage),
        endY: Math.min(height, startY + rowsPerPage),
      });
    }
  }
  return { paper, columnsPerPage, rowsPerPage, pages };
}

/**
 * 按豆子实际直径 1:1 排版，图纸超出一页时按行列切块。
 * 纵向和横向 A4 中取页数更少的一种，页数相同优先纵向。
 */
export function planPrintPages({ width, height }, beadMm) {
  if (!(width > 0 && height > 0 && beadMm > 0)) throw new Error('图纸尺寸或豆子直径无效');
  const portrait = planOrientation(width, height, beadMm, A4_MM);
  const landscape = planOrientation(width, height, beadMm, { width: A4_MM.height, height: A4_MM.width });
  const plan = landscape.pages.length < portrait.pages.length ? landscape : portrait;
  return { ...plan, beadMm, landscape: plan === landscape };
}
