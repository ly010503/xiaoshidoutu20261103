import { drawEffect, drawPatternSheet, getSheetLayout } from './patternPainter.js';
import { hitTestPatternCell } from './hitTest.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
// 这些工具按下即开始作用（连续涂抹、取色、拉框），不走“轻点换色”的延迟判定。
const POINTER_TOOLS = ['brush', 'eraser', 'fill', 'pick', 'box'];

export class ResultCanvasRenderer {
  constructor(canvas, stage, getState, onCellTap = null, paint = {}) {
    this.canvas = canvas; this.stage = stage; this.getState = getState;
    this.ctx = canvas.getContext('2d'); this.documentCanvas = document.createElement('canvas');
    this.pointers = new Map(); this.dragOrigin = null; this.pinchOrigin = null;
    this.onCellTap = onCellTap; this.tapCandidate = null; this.lastTap = null; this.tapTimer = null;
    this.paint = paint; this.paintPointer = null;
    this.resizeObserver = new ResizeObserver(() => this.resize()); this.resizeObserver.observe(stage);
    this.bind();
  }

  rebuild() {
    const state = this.getState(), pattern = state.currentPattern;
    if (!pattern) return;
    const ctx = this.documentCanvas.getContext('2d');
    if (state.previewMode === 'effect') {
      const cell = Math.max(6, Math.min(13, Math.floor(700 / pattern.width)));
      drawEffect(ctx, pattern, state.palette, { cell, highlightedCode: state.highlightedCode });
    } else {
      const cell = pattern.width <= 30 ? 22 : pattern.width <= 40 ? 20 : pattern.width <= 60 ? 18 : 16;
      const view = state.viewOptions;
      drawPatternSheet(ctx, pattern, state.palette, state.statistics, {
        cell,
        highlightedCode: state.highlightedCode,
        selectedPositions: state.selectedCellPositions,
        mirrorX: view.mirror,
        showGrid: view.grid,
        showCodes: view.codes,
        roundBeads: view.round,
      });
    }
    this.draw();
  }

  resize() {
    const rect = this.stage.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr)); this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`; this.canvas.style.height = `${rect.height}px`; this.draw();
  }

  fit() { const viewport = this.getState().viewport; viewport.zoom = 1; viewport.x = 0; viewport.y = 0; this.draw(); }

  clearPendingTap() {
    clearTimeout(this.tapTimer);
    this.tapTimer = null; this.lastTap = null; this.tapCandidate = null;
  }

  getFitScale() {
    if (!this.documentCanvas.width) return 1;
    return Math.min((this.stage.clientWidth - 24) / this.documentCanvas.width, (this.stage.clientHeight - 24) / this.documentCanvas.height);
  }

  zoomAt(factor, clientX, clientY) {
    const viewport = this.getState().viewport, old = viewport.zoom;
    viewport.zoom = clamp(old * factor, 0.5, 8);
    const ratio = viewport.zoom / old, rect = this.stage.getBoundingClientRect();
    const x = clientX - rect.left - rect.width / 2, y = clientY - rect.top - rect.height / 2;
    viewport.x = x - (x - viewport.x) * ratio; viewport.y = y - (y - viewport.y) * ratio; this.draw();
  }

  draw() {
    const dpr = Math.min(devicePixelRatio || 1, 2), width = this.canvas.width / dpr, height = this.canvas.height / dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); this.ctx.fillStyle = '#EDE8F5'; this.ctx.fillRect(0, 0, width, height);
    if (!this.documentCanvas.width) return;
    const viewport = this.getState().viewport, scale = this.getFitScale() * viewport.zoom;
    const drawW = this.documentCanvas.width * scale, drawH = this.documentCanvas.height * scale;
    const x = (width - drawW) / 2 + viewport.x, y = (height - drawH) / 2 + viewport.y;
    this.ctx.save(); this.ctx.shadowColor = 'rgba(72, 59, 93, .16)'; this.ctx.shadowBlur = 18; this.ctx.shadowOffsetY = 7;
    this.ctx.drawImage(this.documentCanvas, x, y, drawW, drawH); this.ctx.restore();
  }

  hitTestCell(clientX, clientY) {
    const state = this.getState(), pattern = state.currentPattern;
    if (!pattern || state.previewMode !== 'pattern' || !this.documentCanvas.width) return null;
    const cell = pattern.width <= 30 ? 22 : pattern.width <= 40 ? 20 : pattern.width <= 60 ? 18 : 16;
    const layout = getSheetLayout(pattern, state.statistics, cell);
    const rect = this.stage.getBoundingClientRect();
    const scale = this.getFitScale() * state.viewport.zoom;
    const drawW = this.documentCanvas.width * scale, drawH = this.documentCanvas.height * scale;
    const drawX = (rect.width - drawW) / 2 + state.viewport.x;
    const drawY = (rect.height - drawH) / 2 + state.viewport.y;
    const documentX = (clientX - rect.left - drawX) / scale;
    const documentY = (clientY - rect.top - drawY) / scale;
    return hitTestPatternCell(documentX, documentY, pattern, layout, cell, state.viewOptions.mirror);
  }

  queueTap(clientX, clientY, { shiftKey = false, ctrlKey = false, metaKey = false } = {}) {
    if (shiftKey || ctrlKey || metaKey) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
      this.lastTap = null;
      const cell = this.hitTestCell(clientX, clientY);
      if (cell) this.onCellTap?.(cell, { shiftKey, ctrlKey, metaKey });
      return;
    }
    const now = Date.now();
    if (this.lastTap
      && now - this.lastTap.time < 300
      && Math.hypot(clientX - this.lastTap.x, clientY - this.lastTap.y) < 24) {
      clearTimeout(this.tapTimer);
      this.tapTimer = null;
      this.lastTap = null;
      const viewport = this.getState().viewport;
      if (viewport.zoom > 1.05) this.fit();
      else this.zoomAt(2, clientX, clientY);
      return;
    }
    this.lastTap = { time: now, x: clientX, y: clientY };
    clearTimeout(this.tapTimer);
    this.tapTimer = setTimeout(() => {
      const cell = this.hitTestCell(clientX, clientY);
      this.lastTap = null;
      this.tapTimer = null;
      if (cell) this.onCellTap?.(cell, { shiftKey: false, ctrlKey: false, metaKey: false });
    }, 300);
  }

  bind() {
    this.stage.addEventListener('wheel', (event) => { event.preventDefault(); this.zoomAt(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY); }, { passive: false });
    this.stage.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      this.stage.setPointerCapture(event.pointerId); this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const state = this.getState();
      if (this.pointers.size >= 2) {
        if (this.paintPointer !== null) this.paint.end?.(true);
        this.paintPointer = null;
        clearTimeout(this.tapTimer); this.lastTap = null;
        this.tapCandidate = null;
        if (this.pointers.size === 2) this.startPinch();
        return;
      }
      if (state.previewMode === 'pattern' && !state.generating && POINTER_TOOLS.includes(state.editTool)) {
        clearTimeout(this.tapTimer); this.lastTap = null; this.tapCandidate = null;
        this.paintPointer = event.pointerId;
        this.paint.start?.(this.hitTestCell(event.clientX, event.clientY));
        return;
      }
      const viewport = this.getState().viewport;
      if (this.pointers.size === 1) {
        this.dragOrigin = { x: event.clientX, y: event.clientY, vx: viewport.x, vy: viewport.y };
        this.tapCandidate = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          moved: false,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        };
      }
      if (this.pointers.size === 2) { this.tapCandidate = null; this.startPinch(); }
    });
    this.stage.addEventListener('pointermove', (event) => {
      if (!this.pointers.has(event.pointerId)) return;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.paintPointer === event.pointerId) {
        this.paint.move?.(this.hitTestCell(event.clientX, event.clientY));
        return;
      }
      if (this.tapCandidate?.pointerId === event.pointerId
        && Math.hypot(event.clientX - this.tapCandidate.x, event.clientY - this.tapCandidate.y) > 8) {
        this.tapCandidate.moved = true;
      }
      const viewport = this.getState().viewport;
      if (this.pointers.size === 1 && this.dragOrigin) { viewport.x = this.dragOrigin.vx + event.clientX - this.dragOrigin.x; viewport.y = this.dragOrigin.vy + event.clientY - this.dragOrigin.y; this.draw(); }
      if (this.pointers.size === 2 && this.pinchOrigin) {
        const [a, b] = [...this.pointers.values()], distance = Math.hypot(a.x - b.x, a.y - b.y);
        viewport.zoom = clamp(this.pinchOrigin.zoom * distance / this.pinchOrigin.distance, 0.5, 8); this.draw();
      }
    });
    const end = (event, cancelled = false) => {
      if (this.paintPointer === event.pointerId) {
        this.paint.move?.(this.hitTestCell(event.clientX, event.clientY));
        this.paint.end?.(cancelled);
        this.paintPointer = null;
      }
      const shouldTap = !cancelled
        && this.pointers.size === 1
        && this.tapCandidate?.pointerId === event.pointerId
        && !this.tapCandidate.moved;
      this.pointers.delete(event.pointerId);
      if (shouldTap && this.getState().editTool !== 'move' && !this.getState().generating) this.queueTap(event.clientX, event.clientY, {
        shiftKey: this.tapCandidate.shiftKey || event.shiftKey,
        ctrlKey: this.tapCandidate.ctrlKey || event.ctrlKey,
        metaKey: this.tapCandidate.metaKey || event.metaKey,
      });
      if (this.tapCandidate?.pointerId === event.pointerId) this.tapCandidate = null;
      if (this.pointers.size < 2) this.pinchOrigin = null;
      else if (this.pointers.size === 2) this.startPinch();
      if (this.pointers.size === 1) {
        const point = [...this.pointers.values()][0], v = this.getState().viewport;
        this.dragOrigin = { x: point.x, y: point.y, vx: v.x, vy: v.y };
      }
    };
    this.stage.addEventListener('pointerup', (event) => end(event));
    this.stage.addEventListener('pointercancel', (event) => end(event, true));
    this.stage.addEventListener('lostpointercapture', (event) => {
      if (this.pointers.has(event.pointerId)) end(event, true);
    });
    this.stage.addEventListener('dblclick', (event) => event.preventDefault());
  }

  startPinch() { const [a, b] = [...this.pointers.values()]; this.pinchOrigin = { distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: this.getState().viewport.zoom }; }
}
