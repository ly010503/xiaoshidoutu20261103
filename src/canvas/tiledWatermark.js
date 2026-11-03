export const DEFAULT_TILED_WATERMARK = '@小红薯 小石豆图';

export function normalizeWatermarkText(value) {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  return normalized || DEFAULT_TILED_WATERMARK;
}

export function getTiledWatermarkLayout(width, height, fontSize, textWidth) {
  const diagonal = Math.ceil(Math.hypot(width, height));
  return {
    diagonal,
    stepX: Math.max(Math.round(fontSize * 8), Math.ceil(textWidth + fontSize * 3)),
    stepY: Math.max(Math.round(fontSize * 4.5), 72),
  };
}

export function drawTiledWatermark(ctx, {
  x,
  y,
  width,
  height,
  text,
  fontSize,
  opacity = 0.18,
} = {}) {
  if (!text || width <= 0 || height <= 0) return;
  const label = normalizeWatermarkText(text);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = '#5F468F';
  ctx.font = `750 ${fontSize}px "PingFang SC", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const layout = getTiledWatermarkLayout(width, height, fontSize, ctx.measureText(label).width);
  let row = 0;
  for (let py = -layout.diagonal; py <= layout.diagonal; py += layout.stepY) {
    const offset = row % 2 ? layout.stepX / 2 : 0;
    for (let px = -layout.diagonal - layout.stepX; px <= layout.diagonal + layout.stepX; px += layout.stepX) {
      ctx.fillText(label, px + offset, py);
    }
    row += 1;
  }
  ctx.restore();
}
