const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class CanvasRenderer {
  constructor(canvas, stage, getState) {
    this.canvas = canvas;
    this.stage = stage;
    this.getState = getState;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dragging = false;
    this.dragStart = null;
    this.geometry = null;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(stage);
    this.bindEvents();
  }

  resize() {
    const rect = this.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.draw();
  }

  fit() {
    const state = this.getState();
    state.viewport.zoom = 1; state.viewport.x = 0; state.viewport.y = 0;
    this.draw();
  }

  actualSize() {
    const state = this.getState();
    if (!state.currentPattern) return;
    const fit = this.getFitCell(state.currentPattern, state.display.coordinates);
    state.viewport.zoom = clamp(10 / fit, 0.15, 12);
    state.viewport.x = 0; state.viewport.y = 0; this.draw();
  }

  zoomAt(factor, x = this.stage.clientWidth / 2, y = this.stage.clientHeight / 2) {
    const viewport = this.getState().viewport;
    const oldZoom = viewport.zoom;
    viewport.zoom = clamp(oldZoom * factor, 0.18, 16);
    const ratio = viewport.zoom / oldZoom;
    const centerX = this.stage.clientWidth / 2;
    const centerY = this.stage.clientHeight / 2;
    viewport.x = (x - centerX) - (x - centerX - viewport.x) * ratio;
    viewport.y = (y - centerY) - (y - centerY - viewport.y) * ratio;
    this.draw();
  }

  getFitCell(pattern, coordinates) {
    const margin = coordinates ? 34 : 8;
    return Math.max(1, Math.min((this.stage.clientWidth - margin * 2) / pattern.width, (this.stage.clientHeight - margin * 2) / pattern.height));
  }

  computeGeometry(pattern, state) {
    const coordinateMargin = state.display.coordinates ? 30 : 5;
    const cell = this.getFitCell(pattern, state.display.coordinates) * state.viewport.zoom;
    const gridW = pattern.width * cell, gridH = pattern.height * cell;
    const originX = (this.stage.clientWidth - gridW) / 2 + state.viewport.x;
    const originY = (this.stage.clientHeight - gridH) / 2 + state.viewport.y;
    return { cell, originX, originY, coordinateMargin, gridW, gridH };
  }

  draw() {
    const state = this.getState();
    const pattern = state.currentPattern;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = this.canvas.width / dpr, height = this.canvas.height / dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--surface-0') || '#11141a';
    this.ctx.fillRect(0, 0, width, height);
    if (!pattern) return;
    const g = this.computeGeometry(pattern, state); this.geometry = g;
    const { cell, originX, originY } = g;
    const palette = state.palette;
    this.ctx.save();
    this.ctx.beginPath(); this.ctx.rect(Math.floor(originX), Math.floor(originY), Math.ceil(g.gridW), Math.ceil(g.gridH)); this.ctx.clip();
    for (let y = 0; y < pattern.height; y += 1) for (let x = 0; x < pattern.width; x += 1) {
      const index = pattern.indices[y * pattern.width + x], color = palette[index];
      if (!color) continue;
      this.ctx.globalAlpha = state.highlightedCode && state.highlightedCode !== color.code ? 0.16 : 1;
      const x1 = Math.floor(originX + x * cell), y1 = Math.floor(originY + y * cell);
      const x2 = Math.ceil(originX + (x + 1) * cell), y2 = Math.ceil(originY + (y + 1) * cell);
      this.ctx.fillStyle = color.hex; this.ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
    this.ctx.globalAlpha = 1; this.ctx.restore();
    const showGrid = state.previewMode !== 'blocks' && state.display.grid;
    if (showGrid && cell >= 2.5) this.drawGrid(pattern, g, state.display.guides);
    const showNumbers = (state.previewMode === 'numbers' || state.display.numbers) && cell >= 10;
    if (showNumbers) this.drawNumbers(pattern, g, palette);
    if (state.display.coordinates) this.drawCoordinates(pattern, g);
    document.getElementById('zoomValue').textContent = `${Math.round(state.viewport.zoom * 100)}%`;
    document.getElementById('canvasHint').textContent = showNumbers ? '编号会随缩放自动调整 · Esc 取消颜色高亮' : '放大后可显示更清晰的颜色编号';
  }

  drawGrid(pattern, g, guides) {
    const { cell, originX, originY, gridW, gridH } = g;
    this.ctx.save(); this.ctx.lineWidth = 1; this.ctx.strokeStyle = 'rgba(45,48,54,.48)'; this.ctx.beginPath();
    for (let x = 0; x <= pattern.width; x += 1) { const px = Math.round(originX + x * cell) + .5; this.ctx.moveTo(px, originY); this.ctx.lineTo(px, originY + gridH); }
    for (let y = 0; y <= pattern.height; y += 1) { const py = Math.round(originY + y * cell) + .5; this.ctx.moveTo(originX, py); this.ctx.lineTo(originX + gridW, py); }
    this.ctx.stroke();
    if (guides) { this.ctx.strokeStyle = 'rgba(211,64,67,.85)'; this.ctx.lineWidth = Math.max(1.2, Math.min(2, cell / 7)); this.ctx.beginPath();
      for (let x = 10; x < pattern.width; x += 10) { const px = Math.round(originX + x * cell); this.ctx.moveTo(px, originY); this.ctx.lineTo(px, originY + gridH); }
      for (let y = 10; y < pattern.height; y += 10) { const py = Math.round(originY + y * cell); this.ctx.moveTo(originX, py); this.ctx.lineTo(originX + gridW, py); }
      this.ctx.stroke(); }
    this.ctx.restore();
  }

  drawNumbers(pattern, g, palette) {
    const { cell, originX, originY } = g;
    const fontSize = Math.max(6, Math.min(12, cell * .42));
    this.ctx.save(); this.ctx.font = `600 ${fontSize}px ${getComputedStyle(document.body).fontFamily}`; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
    for (let y = 0; y < pattern.height; y += 1) for (let x = 0; x < pattern.width; x += 1) {
      const color = palette[pattern.indices[y * pattern.width + x]];
      if (!color || color.hideCode) continue;
      const luminance = color.rgb[0] * .299 + color.rgb[1] * .587 + color.rgb[2] * .114;
      this.ctx.fillStyle = luminance < 135 ? 'rgba(255,255,255,.9)' : 'rgba(12,13,16,.82)';
      this.ctx.fillText(color.code, originX + (x + .5) * cell, originY + (y + .52) * cell);
    }
    this.ctx.restore();
  }

  drawCoordinates(pattern, g) {
    const { cell, originX, originY, gridW, gridH } = g;
    const step = cell >= 18 ? 1 : cell >= 8 ? 5 : 10;
    this.ctx.save(); this.ctx.font = `10px ${getComputedStyle(document.body).fontFamily}`; this.ctx.textAlign = 'center'; this.ctx.textBaseline = 'middle';
    for (let x = 0; x < pattern.width; x += step) { const value = x + 1, px = originX + (x + .5) * cell; this.ctx.fillStyle = value % 10 === 0 ? '#e45a5e' : '#8b929f'; this.ctx.fillText(value, px, originY - 12); this.ctx.fillText(value, px, originY + gridH + 12); }
    this.ctx.textAlign = 'right';
    for (let y = 0; y < pattern.height; y += step) { const value = y + 1, py = originY + (y + .5) * cell; this.ctx.fillStyle = value % 10 === 0 ? '#e45a5e' : '#8b929f'; this.ctx.fillText(value, originX - 7, py); this.ctx.textAlign = 'left'; this.ctx.fillText(value, originX + gridW + 7, py); this.ctx.textAlign = 'right'; }
    this.ctx.restore();
  }

  hitTest(clientX, clientY) {
    const state = this.getState(), pattern = state.currentPattern;
    if (!pattern || !this.geometry) return null;
    const rect = this.stage.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left - this.geometry.originX) / this.geometry.cell);
    const y = Math.floor((clientY - rect.top - this.geometry.originY) / this.geometry.cell);
    if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return null;
    const index = pattern.indices[y * pattern.width + x];
    return { x, y, index, color: state.palette[index] };
  }

  bindEvents() {
    this.stage.addEventListener('wheel', (event) => { event.preventDefault(); const rect = this.stage.getBoundingClientRect(); this.zoomAt(event.deltaY < 0 ? 1.12 : .89, event.clientX - rect.left, event.clientY - rect.top); }, { passive: false });
    this.stage.addEventListener('pointerdown', (event) => { if (!this.getState().currentPattern) return; this.dragging = true; this.stage.setPointerCapture(event.pointerId); this.stage.classList.add('dragging'); const v = this.getState().viewport; this.dragStart = { x: event.clientX, y: event.clientY, vx: v.x, vy: v.y }; });
    this.stage.addEventListener('pointermove', (event) => { if (this.dragging) { const v = this.getState().viewport; v.x = this.dragStart.vx + event.clientX - this.dragStart.x; v.y = this.dragStart.vy + event.clientY - this.dragStart.y; this.draw(); } });
    const end = () => { this.dragging = false; this.stage.classList.remove('dragging'); };
    this.stage.addEventListener('pointerup', end); this.stage.addEventListener('pointercancel', end); this.stage.addEventListener('dblclick', () => this.fit());
  }
}
