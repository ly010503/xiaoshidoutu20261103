export function drawThumbnail(canvas, pattern, palette) {
  const maxWidth = 220, maxHeight = 160;
  const scale = Math.max(1, Math.floor(Math.min(maxWidth / pattern.width, maxHeight / pattern.height)));
  canvas.width = pattern.width * scale; canvas.height = pattern.height * scale;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < pattern.height; y += 1) for (let x = 0; x < pattern.width; x += 1) {
    ctx.fillStyle = palette[pattern.indices[y * pattern.width + x]].hex;
    ctx.fillRect(x * scale, y * scale, scale, scale);
  }
}
