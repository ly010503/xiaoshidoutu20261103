import 'cropperjs/dist/cropper.css';
import './styles/app.css';
import './styles/workspace.css';
import './styles/paint-tools.css';
import './styles/navigation.css';
import './styles/editor-layout.css';
import paletteJson from './data/palettes/mard-221.json';
import {
  PATTERN_SIZES,
  COLOR_OPTIONS,
  MAX_FILE_BYTES,
  SUPPORTED_TYPES,
  physicalSizeCm,
} from './state/config.js';
import { store } from './state/store.js';
import { preparePalette } from './color/colorMatcher.js';
import {
  MANUAL_BLANK_COLOR,
  getColorDisplayCode,
  getColorDisplayLabel,
} from './color/manualBlankColor.js';
import { sortPaletteByRecent, updateRecentColorCodes } from './color/recentPalette.js';
import { createAdjustedCanvas, getGridPixels, getOrderedGridData } from './image/imageProcessor.js';
import { analyzePatternGrid, detectPatternOccupiedCells, samplePatternGrid } from './image/patternGridDetector.js';
import { detectPatternLegend } from './image/patternLegendDetector.js';
import { downloadLinkedImage, resolveSharedLink } from './link/linkImporter.js';
import {
  getColorStyleAdjustments,
  shouldOmitWhiteBackground,
  shouldProtectDarkOutline,
  shouldUseOrderedColorCleanup,
} from './image/colorStyle.js';
import { CropperController } from './image/cropperController.js';
import { analyzeImageForMode, recommendGenerationMode } from './image/modeRecommendation.js';
import { detectPixelArtGrid } from './image/pixelArtDetector.js';
import { generatePattern } from './pattern/patternGenerator.js';
import { calculateStatistics, countPatternBeans, statisticsTotal } from './pattern/statistics.js';
import { createWhiteBackgroundMask } from './pattern/backgroundMask.js';
import { createBackgroundMaskFromSubject, createSubjectMaskFromSampledPixels } from './pattern/subjectMask.js';
import {
  getPatternTapIntent,
  getRectangularSelectionPositions,
} from './pattern/cellSelection.js';
import { getPatternResizeAdjustments, resizePattern } from './pattern/patternCrop.js';
import {
  createPatternStateSnapshot,
  findChangedPositions,
  pushPatternSnapshot,
  transferPatternSnapshot,
  restorePatternSnapshot,
} from './pattern/undoHistory.js';
import { applyColorMerges, planMinorColorMerge } from './pattern/colorMerge.js';
import { planPrintPages } from './export/printLayout.js';
import { exportPrintPdf } from './export/printPdfExporter.js';
import { ResultCanvasRenderer } from './canvas/resultCanvasRenderer.js';
import {
  DEFAULT_TILED_WATERMARK,
  normalizeWatermarkText,
} from './canvas/tiledWatermark.js';
import {
  exportAllHighlightedColorsZip,
  exportEffectPng,
  exportHighlightedColorPng,
  exportPatternPng,
} from './export/pngExporter.js';
import {
  createProjectDocument,
  getProjectDownloadFileName,
  normalizeProjectName,
  parseProjectDocument,
  serializeProjectDocument,
} from './project/projectFile.js';
import { notify } from './ui/notifications.js';
import { drawPatternSheet } from './canvas/patternPainter.js';
import { createAutoDraft } from './project/autoDraft.js';
import { createDraftId, deleteDraft, listDrafts, readDraft, writeDraft } from './project/draftStore.js';
import { linePositions, floodRegion, paintPositions } from './pattern/paintTools.js';
import { resolveAllowedPaletteIndices } from './color/ownedPalette.js';
import { createOwnedPaletteController } from './ui/ownedPaletteController.js';
import { createTextPatternController } from './ui/textPatternController.js';
import { createAppNavigation } from './ui/appNavigation.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const number = new Intl.NumberFormat('zh-CN');
const RECENT_COLORS_KEY = 'perler-recent-replacement-colors';
const VIEW_OPTIONS_KEY = 'perler-view-options';
const PATTERN_UNDO_LIMIT = 50;
const STROKE_LABELS = { brush: '画笔', eraser: '橡皮擦', fill: '区域填色', box: '框选删除' };
const MAX_PROJECT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PROJECT_TEXT_LENGTH = 70 * 1024 * 1024;
const state = store.get();
state.palette = preparePalette([...paletteJson, MANUAL_BLANK_COLOR]);

let generationVersion = 0;
let showAllColors = false;
let exportingAllColors = false;
let replacementSourceIndex = null;
let replacementTargetIndex = null;
let replacementCell = null;
let replacementCells = null;
let pendingGridRecovery = null;
let currentLinkedPost = null;
let recentReplacementCodes = loadRecentReplacementCodes();
let draftSummaries = [];
let modeRecommendation = null;
let activeStroke = null;
let paintFrame = null;
// 有图纸时缩略图画图纸本身，还没生成时画原图。
function createDraftThumbnail() {
  const thumbnail = document.createElement('canvas');
  thumbnail.width = 120; thumbnail.height = 150;
  const context = thumbnail.getContext('2d');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, 120, 150);
  const pattern = state.currentPattern;
  let source = state.image;
  let sourceWidth = state.image.naturalWidth;
  let sourceHeight = state.image.naturalHeight;
  if (pattern) {
    source = document.createElement('canvas');
    source.width = pattern.width; source.height = pattern.height;
    const cells = source.getContext('2d');
    for (let position = 0; position < pattern.indices.length; position += 1) {
      cells.fillStyle = pattern.backgroundMask?.[position] ? '#FFFFFF' : state.palette[pattern.indices[position]].hex;
      cells.fillRect(position % pattern.width, Math.floor(position / pattern.width), 1, 1);
    }
    sourceWidth = pattern.width; sourceHeight = pattern.height;
    context.imageSmoothingEnabled = false;
  }
  const scale = Math.min(120 / sourceWidth, 150 / sourceHeight);
  context.drawImage(source, (120 - sourceWidth * scale) / 2, (150 - sourceHeight * scale) / 2, sourceWidth * scale, sourceHeight * scale);
  return thumbnail.toDataURL('image/png');
}

const autoDraft = createAutoDraft({
  capture: async () => {
    const project = await captureProjectDocument(state.projectName);
    if (!project) return null;
    state.draftId ??= createDraftId();
    return { id: state.draftId, project, name: project.name, updatedAt: project.savedAt, thumbnail: createDraftThumbnail() };
  },
  write: async (draft) => {
    await writeDraft(draft.id, draft);
    refreshDraftList();
  },
  onStatus: (status, value) => {
    const label = $('#draftStatus');
    label.dataset.status = status;
    label.textContent = status === 'saved' ? '已保存到我的图纸'
      : status === 'error' ? '草稿保存失败，请保存工程'
        : status === 'saving' ? '正在保存本机草稿…' : '草稿有新修改…';
    label.title = status === 'error' ? String(value?.message || '浏览器存储不可用')
      : status === 'saved' ? `仅当前浏览器 · ${new Date(value).toLocaleString('zh-CN')}` : '本机草稿仅保存在当前浏览器';
    $('#retryDraft').hidden = status !== 'error';
  },
});
const renderer = new ResultCanvasRenderer(
  $('#resultCanvas'),
  $('#resultStage'),
  () => state,
  (cell, modifiers) => handlePatternCellTap(cell, modifiers),
  { start: startPainting, move: continuePainting, end: finishPainting },
);
const ownedPalette = createOwnedPaletteController({
  palette: state.palette, state, notify,
  onChange: () => { syncPaintTools(); markDirty(); },
});
let textController;
const navigation = createAppNavigation({
  getState: () => state,
  onLeave: () => { finishPainting(); autoDraft.flush(); },
  onText: () => textController.refresh(),
  onLibrary: refreshDraftList,
  onEditor: () => requestAnimationFrame(() => { renderer.resize(); renderer.fit(); drawSourcePreview(); }),
});

function availableColors() {
  const codes = new Set(state.ownedColorCodes);
  return state.palette.filter((color) => color.manualOnly || !state.useOwnedPalette || codes.has(color.code));
}

function syncPaintTools() {
  const colors = availableColors();
  let color = colors.find((item) => item.code === state.brushColorCode);
  if (!color) {
    color = colors.find((item) => !item.manualOnly) || colors[0];
    state.brushColorCode = color.code;
  }
  $('#brushColorSwatch').style.backgroundColor = color.hex;
  $('#brushColorLabel').textContent = `画笔色 ${getColorDisplayCode(color)}`;
  $('#resultStage').dataset.tool = state.editTool;
  $$('[data-edit-tool]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.editTool === state.editTool));
    button.disabled = state.generating;
  });
  $('#chooseBrushColor').disabled = state.generating;
  const hints = {
    select: '制作图中点击单格换色；Ctrl 多选、Shift 框选，拖动平移。',
    move: '拖动平移，滚轮或双指缩放；选择画笔开始精修。',
    brush: '按住划过连续上色，一笔可整体撤销；双指缩放会取消当前一笔。',
    eraser: '按住划过清除豆子，留白不计用量；一笔可整体撤销。',
    fill: '点击填充上下左右相连的同色区域；斜角和不同色号分开处理。',
    pick: '点一下图纸上的豆子，把它的颜色设为画笔色，随后自动切回画笔。',
    box: '按住拖出选框，松手后框内的豆子全部变成留白；整框可一次撤销。',
  };
  $('#paintToolHint').textContent = hints[state.editTool];
}

function setEditTool(tool) {
  renderer.clearPendingTap();
  finishPainting();
  if (state.generating) return;
  if (!['select', 'move', 'brush', 'eraser', 'fill', 'pick', 'box'].includes(tool)) return;
  if (tool !== 'move' && state.previewMode !== 'pattern') setMode('pattern');
  state.editTool = tool;
  state.highlightedCode = null;
  clearSelectedCells({ redraw: false });
  syncPaintTools(); renderColorList(); renderer.rebuild();
  if (['brush', 'eraser', 'fill'].includes(tool) && state.viewport.zoom < 2) {
    const rect = $('#resultStage').getBoundingClientRect();
    renderer.zoomAt(2 / state.viewport.zoom, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
}

function pickBrushColor(cell) {
  const pattern = state.currentPattern;
  const color = pattern.backgroundMask?.[cell.position]
    ? state.palette.find((item) => item.manualOnly)
    : state.palette[cell.colorIndex];
  if (!color || !availableColors().some((item) => item.code === color.code)) {
    return notify(`${color ? getColorDisplayCode(color) : '这个颜色'}不在已有色号中，不能设为画笔色`, 'error');
  }
  state.brushColorCode = color.code;
  if (!color.manualOnly) rememberReplacementColor(color.code);
  setEditTool('brush');
  notify(`画笔色已换成 ${getColorDisplayLabel(color)}`, 'success');
}

function startPainting(cell) {
  finishPainting();
  if (!cell || state.generating || !state.currentPattern) return;
  if (state.editTool === 'pick') return pickBrushColor(cell);
  const blank = state.palette.find((color) => color.manualOnly);
  const color = ['eraser', 'box'].includes(state.editTool) ? blank : availableColors().find((item) => item.code === state.brushColorCode);
  if (!color) return;
  state.highlightedCode = null; clearSelectedCells({ redraw: false });
  activeStroke = {
    snapshot: createPatternStateSnapshot(state.currentPattern),
    target: color.index, blank: blank.index, previous: null, changed: 0, tool: state.editTool,
    anchor: cell.position, current: cell.position,
  };
  continuePainting(cell);
}

function boxPositions(stroke) {
  const { width, height } = state.currentPattern;
  return getRectangularSelectionPositions(width, height, stroke.anchor, stroke.current);
}

function continuePainting(cell) {
  if (!activeStroke) return;
  if (!cell) { activeStroke.previous = null; return; }
  const stroke = activeStroke;
  if (stroke.tool === 'box') {
    // 拖动时只预览选框，松手再一次性改成留白。
    stroke.current = cell.position;
    state.selectedCellPositions = new Set(boxPositions(stroke));
    if (paintFrame === null) paintFrame = requestAnimationFrame(() => { paintFrame = null; renderer.rebuild(); });
    return;
  }
  if (stroke.tool === 'fill' && stroke.filled) return;
  const positions = stroke.tool === 'fill'
    ? floodRegion(state.currentPattern, cell.position, stroke.blank)
    : linePositions(state.currentPattern.width, stroke.previous ?? cell.position, cell.position);
  stroke.previous = cell.position;
  stroke.filled = stroke.tool === 'fill';
  stroke.changed += paintPositions(state.currentPattern, positions, stroke.target, stroke.blank);
  if (paintFrame === null) paintFrame = requestAnimationFrame(() => { paintFrame = null; renderer.rebuild(); });
}

function finishPainting(cancelled = false) {
  if (!activeStroke) return;
  const stroke = activeStroke; activeStroke = null;
  if (paintFrame !== null) { cancelAnimationFrame(paintFrame); paintFrame = null; }
  if (stroke.tool === 'box') {
    state.selectedCellPositions.clear();
    if (!cancelled) stroke.changed = paintPositions(state.currentPattern, boxPositions(stroke), stroke.blank, stroke.blank);
  }
  if (cancelled) restorePatternSnapshot([stroke.snapshot], state.currentPattern);
  else if (stroke.changed) recordPatternEdit(stroke.snapshot, STROKE_LABELS[stroke.tool]);
  recalculatePatternStatistics({ preserveBackgroundMask: true });
  renderStatistics(); renderer.rebuild();
  if (!cancelled && stroke.changed) $('#paintToolHint').textContent = `本次已修改 ${number.format(stroke.changed)} 格，可点“撤销”整体恢复。`;
}

function renderBrushPalette() {
  const query = $('#brushColorSearch').value.trim().toUpperCase();
  const fragment = document.createDocumentFragment();
  for (const color of availableColors().filter((item) => `${item.code} ${item.name}`.toUpperCase().includes(query))) {
    const button = makeButton('palette-swatch', { type: 'button', role: 'radio', 'aria-checked': String(state.brushColorCode === color.code), 'aria-label': getColorDisplayLabel(color) });
    button.dataset.code = color.code;
    const swatch = document.createElement('i'); swatch.style.backgroundColor = color.hex;
    const code = document.createElement('strong'); code.textContent = getColorDisplayCode(color);
    const name = document.createElement('small'); name.textContent = color.name;
    button.append(swatch, code, name); fragment.append(button);
  }
  $('#brushPalette').replaceChildren(fragment);
  $('#brushPaletteHint').textContent = state.useOwnedPalette ? `只显示已有的 ${state.ownedColorCodes.length} 个色号及留白` : '完整 MARD 色板；橡皮擦和留白均不计入用豆数量';
}

function formatBytes(bytes) {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function loadRecentReplacementCodes() {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_COLORS_KEY) || '[]');
    return Array.isArray(value) ? value.filter((code) => typeof code === 'string').slice(0, 12) : [];
  } catch {
    return [];
  }
}

function rememberReplacementColor(code) {
  recentReplacementCodes = updateRecentColorCodes(recentReplacementCodes, code, 12);
  try {
    localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recentReplacementCodes));
  } catch {
    // Safari隐私模式可能禁用本地存储；当前页面内仍保留最近颜色。
  }
}

function makeButton(className, attributes = {}) {
  const button = document.createElement('button');
  button.className = className;
  Object.entries(attributes).forEach(([key, value]) => button.setAttribute(key, value));
  return button;
}

function buildChoices() {
  PATTERN_SIZES.forEach((size) => {
    const button = makeButton('size-card', { role: 'radio', 'aria-checked': String(Boolean(size.recommended)) });
    button.dataset.width = size.width;
    button.dataset.height = size.height;
    button.dataset.id = size.id;
    const header = document.createElement('span');
    const label = document.createElement('strong'); label.textContent = size.label;
    header.append(label);
    if (size.recommended) { const badge = document.createElement('em'); badge.className = 'recommend-tag'; badge.textContent = '推荐'; header.append(badge); }
    const dimensions = document.createElement('b'); dimensions.textContent = `${size.width} × ${size.height}格`;
    const total = document.createElement('span'); total.textContent = `总计 ${number.format(size.width * size.height)}颗`;
    const description = document.createElement('small'); description.textContent = size.description;
    button.append(header, dimensions, total, description);
    button.classList.toggle('active', Boolean(size.recommended));
    $('#sizeCards').append(button);
  });
  const custom = makeButton('size-card custom-card', { role: 'radio', 'aria-checked': 'false' });
  custom.dataset.id = 'custom';
  const customHeader = document.createElement('span');
  const customLabel = document.createElement('strong'); customLabel.textContent = '自定义'; customHeader.append(customLabel);
  const customTitle = document.createElement('b'); customTitle.textContent = '自己填写格数';
  const customText = document.createElement('span'); customText.textContent = '10～200格宽';
  const customHint = document.createElement('small'); customHint.textContent = '适合特别尺寸';
  custom.append(customHeader, customTitle, customText, customHint);
  $('#sizeCards').append(custom);

  COLOR_OPTIONS.forEach((option) => {
    const button = makeButton('color-card', { role: 'radio', 'aria-checked': String(option.value === 24) });
    button.dataset.colors = option.value;
    const top = document.createElement('span');
    const label = document.createElement('strong'); label.textContent = option.label;
    const status = document.createElement('b'); status.className = 'limit-status'; status.textContent = option.recommended ? '推荐上限' : '颜色上限';
    top.append(label, status);
    const description = document.createElement('small'); description.textContent = option.description;
    button.append(top, description);
    button.classList.toggle('active', option.value === 24);
    $('#colorCards').append(button);
  });
}

function setChoiceActive(container, selected) {
  [...container.children].forEach((button) => {
    const active = button === selected;
    button.classList.toggle('active', active);
    button.setAttribute('aria-checked', String(active));
  });
  updateSettingsSummaries();
}

function updateSettingsSummaries() {
  $('#sizeSettingSummary').textContent = `${state.currentSize.width} × ${state.currentSize.height} 格`;
  $('#colorSettingSummary').textContent = `最多 ${state.maxColors} 色 · 自动识别实际用色`;
  $('#styleSettingSummary').textContent = $('#colorStyleCards .active strong')?.textContent || '选择图片类型';
}

function markDirty() {
  generationVersion += 1;
  if (state.currentPattern) {
    state.dirty = true;
    $('#dirtyNotice').hidden = false;
    $('#generateButton').lastChild.textContent = ' 重新生成拼豆图纸';
  }
  scheduleDraftSave();
}

function scheduleDraftSave() {
  if (state.image && state.sourceImage && !state.generating && !activeStroke) autoDraft.schedule();
}

function syncHistoryControls() {
  $('#undoEdit').disabled = state.generating || !state.patternUndoHistory.length;
  $('#redoEdit').disabled = state.generating || !state.patternRedoHistory.length;
  renderEditHistory();
  syncPaintTools();
}

function recordPatternEdit(snapshot, label = '修改图纸') {
  snapshot.meta = {
    label,
    positions: findChangedPositions(snapshot, state.currentPattern),
    time: Date.now(),
  };
  pushPatternSnapshot(state.patternUndoHistory, snapshot, PATTERN_UNDO_LIMIT);
  state.patternRedoHistory.length = 0;
  syncHistoryControls();
}

function resetEditHistory() {
  state.patternUndoHistory.length = 0;
  state.patternRedoHistory.length = 0;
  state.initialPatternSnapshot = state.currentPattern ? createPatternStateSnapshot(state.currentPattern) : null;
}

function renderEditHistory() {
  const list = $('#historyList');
  if (!list) return;
  const entries = state.patternUndoHistory.map((snapshot, step) => ({ snapshot, step })).reverse();
  const fragment = document.createDocumentFragment();
  entries.forEach(({ snapshot, step }, order) => {
    const meta = snapshot.meta || { label: '修改图纸' };
    const row = document.createElement('li');
    row.className = 'history-row';
    const locate = makeButton('history-locate', { type: 'button' });
    locate.dataset.step = step;
    locate.disabled = !meta.positions?.length;
    const title = document.createElement('strong'); title.textContent = meta.label;
    const detail = document.createElement('small');
    const time = meta.time ? new Date(meta.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '';
    detail.textContent = `${meta.positions ? `${number.format(meta.positions.length)} 格` : '尺寸变化'}${time ? ` · ${time}` : ''}`;
    locate.append(title, detail);
    const rewind = makeButton('history-rewind', { type: 'button', title: '撤回这一步及之后的所有修改' });
    rewind.dataset.steps = order + 1;
    rewind.textContent = order ? `撤回到此前` : '撤回';
    rewind.disabled = state.generating;
    row.append(locate, rewind);
    fragment.append(row);
  });
  list.replaceChildren(fragment);
  $('#historyEmpty').hidden = entries.length > 0;
  $('#historyCount').textContent = entries.length ? `${entries.length} 步` : '';
  $('#historyRedoNote').hidden = !state.patternRedoHistory.length;
  $('#historyRedoNote').textContent = `已撤回 ${state.patternRedoHistory.length} 步，可点“重做”恢复`;
  $('#restoreInitialPattern').disabled = state.generating || !state.initialPatternSnapshot || !state.patternUndoHistory.length;
}

function locateHistoryStep(step) {
  const positions = state.patternUndoHistory[step]?.meta?.positions;
  if (!positions?.length) return;
  if (state.previewMode !== 'pattern') setMode('pattern');
  state.highlightedCode = null;
  state.selectedCellPositions = new Set(positions);
  state.selectionAnchorPosition = null;
  renderColorList();
  updateCellSelectionUi();
  renderer.rebuild();
  notify(`已在图纸上框出这一步改动的 ${number.format(positions.length)} 格，可直接批量换色或删除`);
}

function restoreInitialPattern() {
  finishPainting();
  const initial = state.initialPatternSnapshot;
  if (!initial || !state.currentPattern || state.generating) return;
  const snapshot = createPatternStateSnapshot(state.currentPattern);
  restorePatternSnapshot([initial], state.currentPattern);
  // restorePatternSnapshot 会取走数组里的快照，这里保留一份副本以便再次恢复。
  state.initialPatternSnapshot = createPatternStateSnapshot(state.currentPattern);
  recalculatePatternStatistics({ preserveBackgroundMask: true });
  recordPatternEdit(snapshot, '恢复到刚生成');
  state.currentSize = { width: state.currentPattern.width, height: state.currentPattern.height };
  syncRestoredChoices();
  state.highlightedCode = null;
  clearSelectedCells({ redraw: false });
  renderStatistics();
  renderer.rebuild();
  renderer.fit();
  notify('图纸已恢复到刚生成时的样子，可以点“撤销”回到恢复前', 'success', 5000);
}

function setWorkspacePanel(panel) {
  finishPainting();
  $('#resultSection').dataset.panel = panel;
  $$('[data-workspace-panel]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.workspacePanel === panel)));
  if (panel === 'canvas') requestAnimationFrame(() => { renderer.resize(); renderer.fit(); });
  requestAnimationFrame(drawSourcePreview);
}

function syncWorkspace() {
  state.editTool = 'select';
  ownedPalette.sync();
  const active = Boolean(state.currentPattern);
  const enteringEditor = active && $('#settingsArea').parentElement !== $('#workspaceSettings');
  $$('#settingsArea > .settings-section').forEach((section) => {
    if (enteringEditor) section.open = false;
    else if (!active) section.open = true;
  });
  updateSettingsSummaries();
  (active ? $('#workspaceSettings') : $('#setupColumn')).append($('#settingsArea'));
  (active ? $('#workspaceSource') : $('#sourceHome')).append($('#sourceCard'));
  navigation.show('editor');
  if (active) setWorkspacePanel('canvas');
  syncHistoryControls();
}

function drawSourcePreview() {
  if (!state.image) return;
  const source = createAdjustedCanvas(state.image, state.transform, getColorStyleAdjustments(state.adjustments, state.colorStyle), 1000, state.crop);
  const canvas = $('#sourcePreview');
  const frame = canvas.parentElement.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (!frame.width || !frame.height) return;
  const cssWidth = frame.width;
  const cssHeight = frame.height;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#F4F0EA'; ctx.fillRect(0, 0, cssWidth, cssHeight);
  const scale = Math.min(cssWidth / source.width, cssHeight / source.height);
  const width = source.width * scale, height = source.height * scale;
  ctx.drawImage(source, Math.round((cssWidth - width) / 2), Math.round((cssHeight - height) / 2), Math.round(width), Math.round(height));
}

async function decodeImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error('图片解码失败，请更换图片后重试'));
    image.src = url;
  });
  return { image, url };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('原始图片读取失败，请重新上传后再保存工程'));
    reader.readAsDataURL(file);
  });
}

async function createProjectBlob(text) {
  if (typeof CompressionStream === 'function') {
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressed = await new Response(stream).blob();
    return new Blob([compressed], { type: 'application/x-perler-project' });
  }
  return new Blob([text], { type: 'application/json' });
}

async function readProjectText(file) {
  if (file.size > MAX_PROJECT_FILE_BYTES) throw new Error('工程文件超过 64MB，无法打开');
  const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  const compressed = header[0] === 0x1f && header[1] === 0x8b;
  if (compressed && typeof DecompressionStream !== 'function') {
    throw new Error('当前浏览器版本过旧，无法打开压缩工程文件');
  }
  const text = compressed
    ? await new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : await file.text();
  if (text.length > MAX_PROJECT_TEXT_LENGTH) throw new Error('工程文件内容过大，无法打开');
  return text;
}

async function projectImageToFile(image) {
  const response = await fetch(image.dataUrl);
  const blob = await response.blob();
  if (blob.size !== image.size || blob.type !== image.type) throw new Error('工程中的原始图片校验失败');
  return new File([blob], image.name, { type: image.type, lastModified: image.lastModified });
}

function downloadProjectBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function setProjectButtonsDisabled(disabled) {
  $('#saveProjectButton').disabled = disabled;
  $('#saveProjectResultButton').disabled = disabled;
  $('#confirmSaveProject').disabled = disabled;
}

function openSaveProjectDialog() {
  if (!state.image || !state.sourceImage) return notify('请先上传图片或打开一个工程', 'error');
  if (state.generating) return notify('图纸正在生成，请完成后再保存工程');
  const input = $('#projectNameInput');
  input.value = normalizeProjectName(state.projectName, state.sourceImage.name);
  $('#saveProjectDialog').showModal();
  requestAnimationFrame(() => { input.focus(); input.select(); });
}

async function captureProjectDocument(requestedName) {
  if (!state.image || !state.sourceImage) return null;
  const source = state.sourceImage;
  const file = state.file;
  const project = createProjectDocument({
    name: normalizeProjectName(requestedName, source.name),
    image: { ...source },
    settings: {
      crop: state.crop, transform: state.transform, adjustments: state.adjustments,
      colorStyle: state.colorStyle, maxColors: state.maxColors,
      currentSize: state.currentSize, dirty: state.dirty, options: state.options,
      useOwnedPalette: state.useOwnedPalette, ownedColorCodes: state.ownedColorCodes,
    },
    pattern: activeStroke?.snapshot || state.currentPattern,
    preferences: {
      previewMode: state.previewMode, recentColors: recentReplacementCodes,
      watermark: {
        enabled: $('#tiledWatermarkEnabled').checked,
        text: normalizeWatermarkText($('#tiledWatermarkText').value),
      },
    },
    paletteCodes: state.palette.map((color) => color.code),
  });
  if (!project.image.dataUrl) {
    if (!file) throw new Error('原始图片缺失，请重新上传');
    project.image.dataUrl = await fileToDataUrl(file);
    if (state.sourceImage === source) source.dataUrl = project.image.dataUrl;
  }
  return project;
}

async function saveProject(requestedName) {
  if (!state.image || !state.sourceImage) {
    notify('请先上传图片或打开一个工程', 'error');
    return false;
  }
  if (state.generating) {
    notify('图纸正在生成，请完成后再保存工程');
    return false;
  }
  setProjectButtonsDisabled(true);
  try {
    const projectName = normalizeProjectName(requestedName, state.sourceImage.name);
    const document = await captureProjectDocument(projectName);
    const blob = await createProjectBlob(serializeProjectDocument(document));
    downloadProjectBlob(blob, getProjectDownloadFileName(projectName));
    state.projectName = projectName;
    scheduleDraftSave();
    notify(`工程“${projectName}”已保存，可以发到其他电脑继续制作`, 'success', 5000);
    return true;
  } catch (error) {
    notify(error.message || '工程保存失败，请重试', 'error', 5000);
    return false;
  } finally {
    setProjectButtonsDisabled(false);
  }
}

// 生成模式按图片类型命名，内部仍沿用原来的取色方式标识，旧工程与草稿无需迁移。
const STYLE_NAMES = { natural: '照片', vivid: '插画 / 海报', ordered: '卡通 / Q版', direct: '像素画 / Logo' };

function updateModeRecommendation() {
  modeRecommendation = null;
  if (state.image) {
    try {
      const scale = Math.min(1, 200 / Math.max(state.image.naturalWidth, state.image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(state.image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(state.image.naturalHeight * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.fillStyle = '#FFFFFF';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(state.image, 0, 0, canvas.width, canvas.height);
      modeRecommendation = recommendGenerationMode(analyzeImageForMode(context.getImageData(0, 0, canvas.width, canvas.height)));
      const pixelArt = detectPixelArtPattern();
      if (pixelArt) {
        modeRecommendation = {
          style: 'direct',
          maxColors: modeRecommendation.style === 'direct' ? modeRecommendation.maxColors : 24,
          label: '像素画',
          reason: `像素画，约 ${pixelArt.width} × ${pixelArt.height} 格，生成时一格一豆还原`,
        };
      }
    } catch {
      // 分析失败不影响正常生成，只是不显示推荐。
    }
  }
  renderModeRecommendation();
}

function renderModeRecommendation() {
  $('#modeRecommendation').hidden = !modeRecommendation;
  if (!modeRecommendation) return;
  const { style, maxColors, label, reason } = modeRecommendation;
  $('#modeRecommendationText').textContent = `推荐「${STYLE_NAMES[style]}」· 最多 ${maxColors} 色`;
  $('#modeRecommendationReason').textContent = `识别到：${reason}`;
  const applied = state.colorStyle === style && state.maxColors === maxColors;
  $('#applyModeRecommendation').disabled = applied;
  $('#applyModeRecommendation').textContent = applied ? '已套用' : '一键套用';
}

function applyModeRecommendation() {
  if (!modeRecommendation) return;
  state.colorStyle = modeRecommendation.style;
  state.maxColors = modeRecommendation.maxColors;
  syncRestoredChoices();
  markDirty();
  notify(`已套用推荐：「${STYLE_NAMES[state.colorStyle]}」· 最多 ${state.maxColors} 色`, 'success');
}

function syncRestoredChoices() {
  const sizeButton = $$('.size-card').find((button) => (
    button.dataset.id !== 'custom'
    && Number(button.dataset.width) === state.currentSize.width
    && Number(button.dataset.height) === state.currentSize.height
  ));
  const selectedSize = sizeButton || $('[data-id="custom"]');
  if (!sizeButton) {
    $('#customWidth').value = state.currentSize.width;
    $('#customHeight').value = state.currentSize.height;
    selectedSize.querySelector('b').textContent = `${state.currentSize.width} × ${state.currentSize.height}格`;
    selectedSize.querySelectorAll('span')[1].textContent = `总计 ${number.format(state.currentSize.width * state.currentSize.height)}颗`;
  }
  setChoiceActive($('#sizeCards'), selectedSize);
  const colorButton = $(`[data-colors="${state.maxColors}"]`);
  if (colorButton) setChoiceActive($('#colorCards'), colorButton);
  const styleButton = $(`[data-color-style="${state.colorStyle}"]`);
  if (styleButton) setChoiceActive($('#colorStyleCards'), styleButton);
  renderModeRecommendation();
}

function syncWatermarkSetting() {
  const watermarkEnabled = $('#tiledWatermarkEnabled');
  const watermarkText = $('#tiledWatermarkText');
  watermarkText.disabled = !watermarkEnabled.checked;
  $('#exportWatermarkCard').classList.toggle('disabled', !watermarkEnabled.checked);
  scheduleDraftSave();
}

function getPatternBackgroundMask(pattern, sourcePixels, colorStyle = state.colorStyle) {
  return shouldOmitWhiteBackground(colorStyle)
    ? createWhiteBackgroundMask(pattern, state.palette, sourcePixels)
    : null;
}

async function openProject(file, { draft = false, draftId = null } = {}) {
  if (!file) return;
  if (state.generating) return notify('图纸正在生成，请稍后再打开工程');
  let decoded;
  try {
    const text = await readProjectText(file);
    const project = parseProjectDocument(text, {
      paletteCodes: state.palette.map((color) => color.code),
    });
    if (state.image && !draft && !window.confirm('打开工程会替换当前正在制作的内容，确定继续吗？')) return;
    await autoDraft.flush();
    const imageFile = await projectImageToFile(project.image);
    decoded = await decodeImage(imageFile);
    if (decoded.image.naturalWidth !== project.image.width || decoded.image.naturalHeight !== project.image.height) {
      throw new Error('工程中的原始图片尺寸校验失败');
    }
    let statistics = [];
    if (project.pattern) {
      project.pattern.backgroundMask ??= getPatternBackgroundMask(
        project.pattern,
        project.pattern.sourcePixels,
        project.settings.colorStyle,
      );
      statistics = calculateStatistics(project.pattern.indices, state.palette, project.pattern.backgroundMask);
      if (statisticsTotal(statistics) !== countPatternBeans(
        project.pattern.indices,
        state.palette,
        project.pattern.backgroundMask,
      )) throw new Error('工程中的颜色统计校验失败');
    }

    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    generationVersion += 1;
    Object.assign(state, {
      image: decoded.image,
      imageUrl: decoded.url,
      file: imageFile,
      sourceImage: { ...project.image },
      projectName: project.name,
      imageInfo: { width: project.image.width, height: project.image.height, size: project.image.size },
      crop: project.settings.crop,
      transform: project.settings.transform,
      adjustments: project.settings.adjustments,
      colorStyle: project.settings.colorStyle,
      maxColors: project.settings.maxColors,
      useOwnedPalette: project.settings.useOwnedPalette,
      ownedColorCodes: project.settings.ownedColorCodes,
      currentSize: project.settings.currentSize,
      currentPattern: project.pattern,
      previewMode: project.preferences.previewMode,
      viewport: { zoom: 1, x: 0, y: 0 },
      statistics,
      highlightedCode: null,
      selectionAnchorPosition: null,
      dirty: project.settings.dirty,
      options: project.settings.options,
    });
    state.selectedCellPositions.clear();
    resetEditHistory();
    state.draftId = draftId || createDraftId();
    recentReplacementCodes = project.preferences.recentColors;
    try { localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(recentReplacementCodes)); } catch {}

    $('#uploadPrompt').hidden = true;
    $('#uploadedSummary').hidden = false;
    $('#uploadThumbnail').src = decoded.url;
    $('#uploadedName').textContent = project.image.name;
    $('#uploadedMeta').textContent = `${project.image.width} × ${project.image.height} · ${formatBytes(project.image.size)}`;
    $('#settingsArea').hidden = false;
    $('#sourceCard').hidden = false;
    $('#cropBadge').hidden = !state.crop;
    $('#dirtyNotice').hidden = !state.dirty;
    $('#dirtyNotice').textContent = '设置已修改，请重新生成图纸';
    $('#generateButton').lastChild.textContent = state.currentPattern ? ' 重新生成拼豆图纸' : ' 生成我的拼豆图纸';
    $('#resultSection').hidden = !state.currentPattern;
    $('#tiledWatermarkEnabled').checked = project.preferences.watermark.enabled;
    $('#tiledWatermarkText').value = project.preferences.watermark.text || DEFAULT_TILED_WATERMARK;
    syncWatermarkSetting();
    syncRestoredChoices();
    syncWorkspace();
    setProjectButtonsDisabled(false);
    showAllColors = false;
    updateCellSelectionUi();
    $$('.mode-switch button').forEach((button) => {
      const active = button.dataset.mode === state.previewMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    requestAnimationFrame(drawSourcePreview);
    if (state.currentPattern) {
      renderStatistics();
      renderer.rebuild();
      renderer.fit();
      requestAnimationFrame(() => $('#resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
    scheduleDraftSave();
    updateModeRecommendation();
    notify(draft ? '已恢复本机草稿，可以继续制作' : '工程已打开，可以从保存的位置继续制作', 'success', 5000);
    return true;
  } catch (error) {
    if (decoded?.url) URL.revokeObjectURL(decoded.url);
    notify(error.message || '工程文件打开失败，请确认文件完整', 'error', 6000);
    return false;
  }
}

async function loadFile(file, { quiet = false } = {}) {
  if (!file) return false;
  if (!SUPPORTED_TYPES.includes(file.type)) { notify('请选择 JPG、PNG 或 WebP 图片', 'error'); return false; }
  if (file.size > MAX_FILE_BYTES) { notify('图片超过 40MB，请压缩后再试', 'error'); return false; }
  let decoded;
  try {
    await autoDraft.flush();
    decoded = await decodeImage(file);
    const { image, url } = decoded;
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('图片尺寸无效');
    if (image.naturalWidth * image.naturalHeight > 80_000_000) throw new Error('图片像素过大，请先缩小图片');
    if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
    Object.assign(state, {
      image, imageUrl: url, file,
      sourceImage: {
        name: file.name,
        type: file.type,
        size: file.size,
        width: image.naturalWidth,
        height: image.naturalHeight,
        lastModified: file.lastModified,
        dataUrl: null,
      },
      projectName: normalizeProjectName('', file.name),
      imageInfo: { width: image.naturalWidth, height: image.naturalHeight, size: file.size },
      crop: null, transform: { rotation: 0, flipH: false, flipV: false },
      currentPattern: null, statistics: [], highlightedCode: null, dirty: false,
      draftId: createDraftId(),
    });
    resetEditHistory();
    state.selectedCellPositions.clear();
    state.selectionAnchorPosition = null;
    pendingGridRecovery = null;
    $('#patternRecoveryStatus').textContent = '自动数格子，并读取每一格的底色';
    generationVersion += 1;
    $('#uploadPrompt').hidden = true;
    $('#uploadedSummary').hidden = false;
    $('#uploadThumbnail').src = url;
    $('#uploadedName').textContent = file.name;
    $('#uploadedMeta').textContent = `${image.naturalWidth} × ${image.naturalHeight} · ${formatBytes(file.size)}`;
    $('#settingsArea').hidden = false;
    $('#sourceCard').hidden = false;
    $('#cropBadge').hidden = true;
    $('#dirtyNotice').hidden = true;
    $('#resultSection').hidden = true;
    syncWorkspace();
    setProjectButtonsDisabled(false);
    requestAnimationFrame(drawSourcePreview);
    scheduleDraftSave();
    updateModeRecommendation();
    if (!quiet) notify('图片已读取，只会在本地处理', 'success');
    return true;
  } catch (error) {
    if (decoded?.url) URL.revokeObjectURL(decoded.url);
    notify(error.message || '图片读取失败，请重试', 'error', 5000);
    return false;
  }
}

function updateProgress(progress) {
  const label = progress < 34 ? '正在分析图片……'
    : progress < 68 ? '正在挑选合适的颜色……'
      : progress < 94 ? '正在整理拼豆格子……' : '图纸马上完成啦！';
  $('#progressLabel').textContent = label;
  $('#progressFill').style.width = `${Math.max(8, progress)}%`;
}

function createPatternDetectionCanvas() {
  return createAdjustedCanvas(
    state.image,
    state.transform,
    { brightness: 0, contrast: 0, saturation: 0, sharpen: 0, smoothing: 0 },
    1800,
    state.crop,
  );
}

function drawPatternDetectionPreview(source, detection) {
  const canvas = $('#patternGridPreview');
  const context = canvas.getContext('2d');
  canvas.width = 720;
  canvas.height = 360;
  context.fillStyle = '#EEE9F2';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const left = Math.max(0, detection.bounds.left);
  const top = Math.max(0, detection.bounds.top);
  const right = Math.min(source.width, detection.bounds.right);
  const bottom = Math.min(source.height, detection.bounds.bottom);
  const sourceWidth = Math.max(1, right - left);
  const sourceHeight = Math.max(1, bottom - top);
  const scale = Math.min((canvas.width - 20) / sourceWidth, (canvas.height - 20) / sourceHeight);
  const width = sourceWidth * scale;
  const height = sourceHeight * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, left, top, sourceWidth, sourceHeight, x, y, width, height);
  context.strokeStyle = '#7864C3';
  context.lineWidth = 3;
  context.strokeRect(x, y, width, height);
}

async function detectExistingPatternGrid() {
  if (!state.image) return notify('请先上传一张图纸截图', 'error');
  if (state.generating) return;
  const button = $('#detectPatternGrid');
  button.disabled = true;
  button.textContent = '正在识别…';
  $('#patternRecoveryStatus').textContent = '正在寻找规则网格和坐标栏';
  try {
    await new Promise(requestAnimationFrame);
    const canvas = createPatternDetectionCanvas();
    const imageData = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
    const detection = analyzePatternGrid(imageData);
    const recoveryPalette = state.palette.filter((color) => !color.manualOnly);
    const legend = detectPatternLegend(imageData, detection, recoveryPalette);
    pendingGridRecovery = { canvas, imageData, detection, legend };
    $('#detectedGridWidth').value = detection.width;
    $('#detectedGridHeight').value = detection.height;
    const confidence = Math.round(detection.confidence * 100);
    const removedRows = detection.removedCoordinateRows.top + detection.removedCoordinateRows.bottom;
    const removedColumns = detection.removedCoordinateColumns.left + detection.removedCoordinateColumns.right;
    const removed = removedRows + removedColumns;
    const legendSummary = legend
      ? `检测到图例 ${legend.swatchCount} 个色块，将只在图例对应的 ${legend.paletteCodes.length} 个色号中匹配。`
      : '未检测到可靠图例，将继续使用原有的全色卡识别。';
    $('#patternGridSummary').textContent = `检测到 ${detection.width} × ${detection.height} 格，网格可信度 ${confidence}%${removed ? `，已排除 ${removedRows} 行、${removedColumns} 列坐标栏` : ''}。${legendSummary}请核对后再恢复。`;
    $('#patternRecoveryStatus').textContent = `已检测到 ${detection.width} × ${detection.height} 格，等待确认`;
    drawPatternDetectionPreview(canvas, detection);
    $('#patternGridDialog').showModal();
  } catch (error) {
    pendingGridRecovery = null;
    $('#patternRecoveryStatus').textContent = '没有找到稳定网格，可先裁剪到图纸区域再试';
    notify(error.message || '没有识别到规则网格，请先裁剪掉多余界面后重试', 'error', 6000);
  } finally {
    button.disabled = false;
    button.textContent = '识别现成图纸';
  }
}

function setLinkImportHint(message, type = '') {
  const hint = $('#linkImportHint');
  hint.textContent = message;
  hint.classList.toggle('error', type === 'error');
  hint.classList.toggle('success', type === 'success');
}

function renderLinkedImages(result) {
  const grid = $('#linkImageGrid');
  grid.replaceChildren();
  result.images.forEach((image, index) => {
    const button = makeButton('link-image-card', { type: 'button', role: 'listitem', 'aria-label': `导入第 ${index + 1} 张图片` });
    button.dataset.linkImageIndex = index;
    const preview = document.createElement('img');
    preview.src = image.url;
    preview.alt = `作品图片 ${index + 1}`;
    preview.loading = index < 4 ? 'eager' : 'lazy';
    const label = document.createElement('span');
    label.textContent = `导入并识别第 ${index + 1} 张`;
    button.append(preview, label);
    grid.append(button);
  });
  $('#linkImageTitle').textContent = result.title || '选择要恢复的图纸图片';
  const platformName = result.platform === 'xiaohongshu' ? '小红书' : '抖音';
  $('#linkImageMeta').textContent = `${platformName}图文作品 · 共找到 ${result.images.length} 张图片${result.author ? ` · ${result.author}` : ''}`;
}

async function resolveLinkImport(event) {
  event.preventDefault();
  if (state.generating) return;
  const text = $('#linkImportInput').value;
  const button = $('#resolveLinkButton');
  button.disabled = true;
  button.textContent = '正在读取…';
  setLinkImportHint('正在打开分享链接并查找公开图片…');
  try {
    currentLinkedPost = await resolveSharedLink(text);
    renderLinkedImages(currentLinkedPost);
    setLinkImportHint(`已找到 ${currentLinkedPost.images.length} 张图片，请选择要恢复的图纸`, 'success');
    $('#linkImageDialog').showModal();
  } catch (error) {
    currentLinkedPost = null;
    setLinkImportHint(error.message || '链接读取失败，请直接上传截图', 'error');
    notify(error.message || '链接读取失败，请直接上传截图', 'error', 6000);
  } finally {
    button.disabled = false;
    button.textContent = '读取链接图片';
  }
}

async function importLinkedImage(index) {
  const image = currentLinkedPost?.images?.[index];
  if (!image) return notify('图片列表已经失效，请重新读取链接', 'error');
  const buttons = $$('.link-image-card');
  buttons.forEach((button) => { button.disabled = true; });
  const selected = buttons[index];
  const label = selected?.querySelector('span');
  if (label) label.textContent = '正在导入…';
  try {
    const file = await downloadLinkedImage(image, currentLinkedPost.title, index);
    const loaded = await loadFile(file);
    if (!loaded) return;
    $('#linkImageDialog').close();
    setLinkImportHint(`已导入第 ${index + 1} 张图片，正在识别网格`, 'success');
    await detectExistingPatternGrid();
  } catch (error) {
    notify(error.message || '图片导入失败，请选择其他图片', 'error', 6000);
  } finally {
    buttons.forEach((button, buttonIndex) => {
      button.disabled = false;
      const itemLabel = button.querySelector('span');
      if (itemLabel) itemLabel.textContent = `导入并识别第 ${buttonIndex + 1} 张`;
    });
  }
}

function renderColorList() {
  const list = $('#colorList'); list.replaceChildren();
  const visible = showAllColors ? state.statistics : state.statistics.slice(0, 8);
  visible.forEach((item) => {
    const row = makeButton('color-row'); row.dataset.code = item.code;
    row.classList.toggle('active', state.highlightedCode === item.code);
    const dot = document.createElement('i'); dot.className = 'color-dot'; dot.style.backgroundColor = item.hex;
    const code = document.createElement('strong'); code.className = 'color-code'; code.textContent = item.code;
    const name = document.createElement('span'); name.className = 'color-name'; name.textContent = item.name;
    const count = document.createElement('b'); count.className = 'color-count'; count.textContent = `${number.format(item.count)}颗`;
    row.append(dot, code, name, count); list.append(row);
  });
  $('#toggleColors').hidden = state.statistics.length <= 8;
  $('#toggleColors').textContent = showAllColors ? '收起' : `展开全部（${state.statistics.length}色）`;
  const highlighted = state.statistics.find((item) => item.code === state.highlightedCode);
  $('#replaceSelectedColor').disabled = !highlighted;
  $('#replaceSelectedColor').textContent = highlighted
    ? `把 ${highlighted.code}（${number.format(highlighted.count)}颗）全部换成其他色号`
    : '先点一种颜色，再整色替换';
  $('#exportHighlightedColor').disabled = !highlighted || exportingAllColors;
  $('#exportHighlightedColor').textContent = highlighted
    ? `导出 ${highlighted.code} 分色定位图（${number.format(highlighted.count)}颗）`
    : '先选择颜色，再导出定位图';
  $('#exportAllHighlightedColors').disabled = !state.statistics.length || exportingAllColors;
  $('#exportAllHighlightedColors').textContent = exportingAllColors
    ? '正在打包分色图…'
    : `全部分色图 ZIP（${state.statistics.length}色）`;
  $('#exportAllHighlightedColors').title = `导出 ${state.statistics.length} 种颜色的正向与镜像分色定位图，共 ${state.statistics.length * 2} 张`;
}

function renderStatistics() {
  const total = statisticsTotal(state.statistics);
  const actual = state.statistics.length;
  $('#summaryTotal').textContent = `${number.format(total)}颗`;
  $('#summaryColors').textContent = `${actual}种颜色`;
  const physicalWidth = physicalSizeCm(state.currentPattern.width);
  const physicalHeight = physicalSizeCm(state.currentPattern.height);
  $('#summaryPhysical').textContent = `约${physicalWidth.toFixed(1)}cm × ${physicalHeight.toFixed(1)}cm`;
  $('#actualColorBadge').textContent = `实际 ${actual} 色`;
  renderColorList();
  updateMinorMergeHint();
  syncHistoryControls();
  scheduleDraftSave();
}

function updateCellSelectionUi() {
  const count = state.selectedCellPositions.size;
  $('#selectedCellCount').textContent = number.format(count);
  $('#multiSelectBar').hidden = !count || state.previewMode !== 'pattern';
}

function clearSelectedCells({ redraw = true } = {}) {
  if (!state.selectedCellPositions.size && state.selectionAnchorPosition === null) return;
  state.selectedCellPositions.clear();
  state.selectionAnchorPosition = null;
  updateCellSelectionUi();
  if (redraw) renderer.rebuild();
}

function toggleSelectedCell(cell) {
  if (state.selectedCellPositions.has(cell.position)) {
    state.selectedCellPositions.delete(cell.position);
  } else {
    state.selectedCellPositions.add(cell.position);
  }
  state.selectionAnchorPosition = state.selectedCellPositions.size ? cell.position : null;
  state.highlightedCode = null;
  renderColorList();
  updateCellSelectionUi();
  renderer.rebuild();
}

function selectCellRange(cell) {
  const anchor = state.selectionAnchorPosition;
  if (!Number.isInteger(anchor)) {
    state.selectedCellPositions.clear();
    state.selectedCellPositions.add(cell.position);
    state.selectionAnchorPosition = cell.position;
    notify('已设置范围起点，请按住 Shift 点击终点');
  } else {
    const positions = getRectangularSelectionPositions(
      state.currentPattern.width,
      state.currentPattern.height,
      anchor,
      cell.position,
    );
    state.selectedCellPositions.clear();
    positions.forEach((position) => state.selectedCellPositions.add(position));
  }
  state.highlightedCode = null;
  renderColorList();
  updateCellSelectionUi();
  renderer.rebuild();
}

function handlePatternCellTap(cell, { shiftKey = false, ctrlKey = false, metaKey = false } = {}) {
  if (state.generating || state.editTool !== 'select') return;
  const intent = getPatternTapIntent(
    state.selectedCellPositions.size,
    state.selectedCellPositions.has(cell.position),
    { shiftKey, ctrlKey, metaKey },
  );
  if (intent === 'range-select') {
    selectCellRange(cell);
    return;
  }
  if (intent === 'toggle-select') {
    toggleSelectedCell(cell);
    return;
  }
  if (intent === 'replace-selection') {
    openReplaceSelectedCellsDialog();
    return;
  }
  clearSelectedCells();
  openReplaceCellDialog(cell);
}

// 文字图纸与空白画布：把图纸画成每格 8px 的原图，借用现有的读图流程获得新编号与草稿保存，再直接装入图纸。
async function createDirectPatternProject(pattern, name) {
  if (state.generating) { notify('图纸正在生成，请稍后再试'); return false; }
  const scale = 8;
  const canvas = document.createElement('canvas');
  canvas.width = pattern.width * scale;
  canvas.height = pattern.height * scale;
  const context = canvas.getContext('2d');
  context.fillStyle = '#FFFFFF';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const sourcePixels = new Uint8ClampedArray(pattern.indices.length * 4).fill(255);
  for (let position = 0; position < pattern.indices.length; position += 1) {
    if (pattern.backgroundMask[position]) continue;
    const color = state.palette[pattern.indices[position]];
    sourcePixels.set(color.rgb, position * 4);
    context.fillStyle = color.hex;
    context.fillRect((position % pattern.width) * scale, Math.floor(position / pattern.width) * scale, scale, scale);
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) { notify('图纸生成失败，请重试', 'error'); return false; }
  if (!(await loadFile(new File([blob], `${name}.png`, { type: 'image/png' }), { quiet: true }))) return false;
  Object.assign(state, { currentSize: { width: pattern.width, height: pattern.height }, maxColors: 15, colorStyle: 'natural' });
  syncRestoredChoices();
  pattern.sourcePixels = sourcePixels;
  presentPattern(pattern);
  scheduleDraftSave();
  return true;
}

async function createTextPatternProject(pattern, name) {
  if (!(await createDirectPatternProject(pattern, name || '文字图纸'))) return;
  notify(`文字图纸已生成：${pattern.width} × ${pattern.height} 格，可以继续编辑和导出`, 'success', 5000);
}

function readBlankCanvasSize() {
  const width = Number($('#blankCanvasWidth').value);
  const height = Number($('#blankCanvasHeight').value);
  const valid = Number.isInteger(width) && Number.isInteger(height) && width >= 10 && width <= 200 && height >= 10 && height <= 300;
  return valid ? { width, height } : null;
}

function updateBlankCanvasSummary() {
  const size = readBlankCanvasSize();
  $('#blankCanvasSummary').textContent = size
    ? `${size.width} × ${size.height} 格 · 成品约 ${physicalSizeCm(size.width).toFixed(1)}cm × ${physicalSizeCm(size.height).toFixed(1)}cm（2.6mm 豆）`
    : '宽度需为 10～200 格，高度需为 10～300 格';
  $('#blankCanvasSummary').classList.toggle('error', !size);
  $('#confirmBlankCanvas').disabled = !size;
  $$('[data-blank-size]').forEach((button) => button.setAttribute('aria-pressed', String(
    Boolean(size) && button.dataset.blankSize === `${size.width}x${size.height}`,
  )));
}

// 空白画布：全部是留白格，直接进入画笔，从零画一张像素图。
async function createBlankCanvasProject() {
  const size = readBlankCanvasSize();
  if (!size) return;
  if (state.image && !window.confirm('新建空白画布会开始一份新图纸，当前图纸已自动保存在“我的图纸”。继续吗？')) return;
  const blank = state.palette.find((color) => color.manualOnly);
  const pattern = {
    width: size.width,
    height: size.height,
    indices: new Uint8Array(size.width * size.height).fill(blank.index),
    backgroundMask: new Uint8Array(size.width * size.height).fill(1),
  };
  $('#blankCanvasDialog').close();
  if (!(await createDirectPatternProject(pattern, `空白画布 ${size.width}×${size.height}`))) return;
  requestAnimationFrame(() => setEditTool('brush'));
  notify('空白画布已就绪：选好画笔色，按住划过就能上色', 'success', 5000);
}

// 把一张已经算好留白的图纸装进编辑工作区（生成、恢复、文字图纸共用）。
function presentPattern(pattern) {
  const statistics = calculateStatistics(pattern.indices, state.palette, pattern.backgroundMask);
  if (statisticsTotal(statistics) !== countPatternBeans(pattern.indices, state.palette, pattern.backgroundMask)) {
    throw new Error('颜色统计校验失败，请重新生成');
  }
  state.selectedCellPositions.clear();
  state.selectionAnchorPosition = null;
  Object.assign(state, { currentPattern: pattern, statistics, highlightedCode: null, dirty: false, previewMode: 'effect' });
  resetEditHistory();
  syncWorkspace();
  updateCellSelectionUi();
  showAllColors = false;
  $('#dirtyNotice').hidden = true;
  $('#resultSection').hidden = false;
  $$('.mode-switch button').forEach((item) => {
    const active = item.dataset.mode === 'effect'; item.classList.toggle('active', active); item.setAttribute('aria-selected', String(active));
  });
  renderer.rebuild(); renderer.fit(); renderStatistics();
  requestAnimationFrame(() => $('#resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function generatePreparedPattern({
  pixels,
  width,
  height,
  recovery = false,
  allowedPaletteIndices = null,
  subjectMask = null,
  lineCoverage = null,
  linePixels = null,
  blankOutsideSubject = false,
  keepIsolatedCells = false,
}) {
  if (state.generating) return;
  state.generating = true;
  syncHistoryControls();
  const version = ++generationVersion;
  const button = $('#generateButton'); button.disabled = true;
  $('#detectPatternGrid').disabled = true;
  $('#progressSection').hidden = false;
  $('#progressFill').style.width = '8%'; updateProgress(8);
  try {
    await new Promise(requestAnimationFrame);
    const allowed = resolveAllowedPaletteIndices(state.palette, state.useOwnedPalette, state.ownedColorCodes, allowedPaletteIndices);
    const pattern = await generatePattern({
      pixels, width, height,
      palette: state.palette
        .filter((color) => !color.manualOnly)
        .map(({ code, name, hex, rgb }) => ({ code, name, hex, rgb })),
      maxColors: recovery && !state.useOwnedPalette ? Math.max(48, state.maxColors) : state.maxColors,
      reduceIsolated: recovery || keepIsolatedCells ? false : state.options.reduceIsolated,
      mergeColors: !allowedPaletteIndices?.length,
      protectDarkOutline: recovery ? false : shouldProtectDarkOutline(state.colorStyle),
      orderedColorCleanup: recovery ? false : shouldUseOrderedColorCleanup(state.colorStyle),
      subjectMask,
      lineCoverage: recovery ? null : lineCoverage,
      linePixels: recovery ? null : linePixels,
      allowedPaletteIndices: allowed,
      limitAllowedColors: state.useOwnedPalette,
      onProgress: updateProgress,
    });
    if (version !== generationVersion) return;
    pattern.sourcePixels = pixels;
    if (recovery && subjectMask) {
      pattern.backgroundMask = createBackgroundMaskFromSubject(subjectMask);
    } else if (subjectMask && (blankOutsideSubject || shouldUseOrderedColorCleanup(state.colorStyle))) {
      const blank = state.palette.find((color) => color.manualOnly);
      if (!blank) throw new Error('纯白留白加载失败，请刷新页面');
      pattern.backgroundMask = createBackgroundMaskFromSubject(subjectMask);
      for (let position = 0; position < pattern.indices.length; position += 1) {
        if (pattern.backgroundMask[position]) pattern.indices[position] = blank.index;
      }
    } else {
      pattern.backgroundMask = recovery
        ? createWhiteBackgroundMask(pattern, state.palette, pixels)
        : getPatternBackgroundMask(pattern, pixels);
    }
    updateProgress(100);
    presentPattern(pattern);
    notify(recovery ? `已恢复 ${width} × ${height} 格图纸，可以逐格改色` : '图纸生成完成啦', 'success', recovery ? 5000 : 3000);
  } catch (error) {
    notify(error.message || (recovery ? '图纸恢复失败，请核对格数后重试' : '生成失败，请重新生成'), 'error', 5000);
    $('#dirtyNotice').hidden = false;
    $('#dirtyNotice').textContent = recovery ? '恢复失败，可以重新识别或按普通图片生成' : '生成失败，请点击下方按钮重新生成';
  } finally {
    state.generating = false; button.disabled = false;
    syncHistoryControls();
    scheduleDraftSave();
    $('#detectPatternGrid').disabled = false;
    button.lastChild.textContent = state.currentPattern ? ' 重新生成拼豆图纸' : ' 生成我的拼豆图纸';
    setTimeout(() => { if (!state.generating) $('#progressSection').hidden = true; }, 700);
  }
}

// 像素画模式：在原分辨率（不模糊、不锐化）上找像素块网格，找到就一个像素块一颗豆，图纸尺寸跟随原图格数。
function detectPixelArtPattern() {
  const source = createAdjustedCanvas(
    state.image,
    state.transform,
    { ...getColorStyleAdjustments(state.adjustments, 'direct'), sharpen: 0, smoothing: 0 },
    2400,
    state.crop,
  );
  const context = source.getContext('2d', { willReadFrequently: true });
  const grid = detectPixelArtGrid(context.getImageData(0, 0, source.width, source.height));
  if (!grid) return null;
  const opaqueMask = new Uint8Array(grid.width * grid.height);
  for (let position = 0; position < opaqueMask.length; position += 1) {
    const offset = position * 4;
    opaqueMask[position] = grid.pixels[offset + 3] >= 128 ? 1 : 0;
    if (!opaqueMask[position]) grid.pixels.set([255, 255, 255, 255], offset);
  }
  return { ...grid, subjectMask: opaqueMask.includes(0) ? opaqueMask : null };
}

// 按生成模式把图片采样成每格颜色；卡通 / Q版模式额外给出主体范围和线稿，用于轮廓与留白。
function sampleImageForPattern({ image, transform, crop, colorStyle, width, height }) {
  const adjusted = createAdjustedCanvas(image, transform, getColorStyleAdjustments(state.adjustments, colorStyle), 1800, crop);
  if (!shouldUseOrderedColorCleanup(colorStyle)) {
    return { pixels: getGridPixels(adjusted, width, height), subjectMask: null, lineCoverage: null, linePixels: null };
  }
  const orderedGrid = getOrderedGridData(adjusted, width, height);
  const samples = orderedGrid.samples;
  return {
    pixels: orderedGrid.pixels,
    lineCoverage: orderedGrid.lineCoverage,
    linePixels: orderedGrid.linePixels,
    subjectMask: createSubjectMaskFromSampledPixels({
      pixels: samples.data,
      sampleWidth: samples.width,
      sampleHeight: samples.height,
      gridWidth: width,
      gridHeight: height,
    }),
  };
}

async function generate() {
  if (!state.image) return notify('请先上传一张图片', 'error');
  if (state.colorStyle === 'direct') {
    let pixelArt = null;
    try { pixelArt = detectPixelArtPattern(); } catch { /* 识别失败时按普通取色生成 */ }
    if (pixelArt) {
      state.currentSize = { width: pixelArt.width, height: pixelArt.height };
      syncRestoredChoices();
      notify(pixelArt.cellSize > 1
        ? `识别到像素画：每 ${Number(pixelArt.cellSize.toFixed(1))} 像素一格，按 ${pixelArt.width} × ${pixelArt.height} 格一格一豆还原`
        : `识别到原尺寸像素画：按 ${pixelArt.width} × ${pixelArt.height} 格一个像素一颗豆还原`, 'success', 5000);
      await generatePreparedPattern({
        pixels: pixelArt.pixels,
        width: pixelArt.width,
        height: pixelArt.height,
        subjectMask: pixelArt.subjectMask,
        blankOutsideSubject: true,
        keepIsolatedCells: true,
      });
      return;
    }
  }
  try {
    const { width, height } = state.currentSize;
    const sampled = sampleImageForPattern({
      image: state.image, transform: state.transform, crop: state.crop, colorStyle: state.colorStyle, width, height,
    });
    await generatePreparedPattern({ width, height, ...sampled });
  } catch (error) {
    notify(error.message || '图片采样失败，请重新上传后再试', 'error', 5000);
  }
}

async function confirmPatternGridRecovery() {
  if (!pendingGridRecovery) return notify('识别结果已经失效，请重新识别', 'error');
  const width = Number($('#detectedGridWidth').value);
  const height = Number($('#detectedGridHeight').value);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 10 || width > 200 || height < 10 || height > 300) {
    return notify('横向需为10～200格，纵向需为10～300格', 'error');
  }
  const { imageData, detection, legend } = pendingGridRecovery;
  let pixels;
  let occupiedMask;
  try {
    // 现成图纸的每格中央通常印有色号；是否成功识别图例不应影响避字取色。
    pixels = samplePatternGrid(imageData, detection, width, height, { avoidCenterText: true });
    occupiedMask = detectPatternOccupiedCells(imageData, detection, width, height, { pixels });
  } catch (error) {
    return notify(error.message || '逐格取色失败，请重新识别', 'error');
  }
  state.currentSize = { width, height };
  state.colorStyle = 'direct';
  if (state.maxColors < 48) state.maxColors = 48;
  syncRestoredChoices();
  $('#patternGridDialog').close();
  $('#patternRecoveryStatus').textContent = `已按 ${width} × ${height} 格恢复，可在制作图中改单格颜色`;
  await generatePreparedPattern({
    pixels,
    width,
    height,
    recovery: true,
    allowedPaletteIndices: legend?.paletteIndices || null,
    subjectMask: occupiedMask,
  });
}

function changeTransform(action) {
  if (!state.image) return;
  if (action === 'rotateLeft') state.transform.rotation = (state.transform.rotation - 90) % 360;
  if (action === 'rotateRight') state.transform.rotation = (state.transform.rotation + 90) % 360;
  if (action === 'flipH') state.transform.flipH = !state.transform.flipH;
  if (action === 'reset') {
    state.transform = { rotation: 0, flipH: false, flipV: false };
    state.crop = null; $('#cropBadge').hidden = true;
  }
  pendingGridRecovery = null;
  $('#patternRecoveryStatus').textContent = '图片方向已变化，请重新识别网格';
  markDirty(); drawSourcePreview();
}

function setMode(mode) {
  renderer.clearPendingTap();
  finishPainting();
  if (mode === 'effect') state.editTool = 'move';
  if (mode !== 'pattern') clearSelectedCells({ redraw: false });
  state.previewMode = mode;
  state.viewport = { zoom: 1, x: 0, y: 0 };
  $$('.mode-switch button').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active));
  });
  renderer.rebuild(); renderer.fit();
  updateCellSelectionUi();
  syncPaintTools();
  scheduleDraftSave();
  if (mode === 'pattern' && window.matchMedia('(max-width: 760px)').matches) {
    const rect = $('#resultStage').getBoundingClientRect();
    renderer.zoomAt(1.7, rect.left + rect.width / 2, rect.top + rect.height / 2);
  }
}

async function copyList() {
  const text = state.statistics.map((item) => `${item.code} ${item.name}：${item.count}颗`).join('\n');
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    else {
      const area = document.createElement('textarea'); area.value = text; document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
    }
    notify('用豆清单已复制', 'success');
  } catch { notify('复制失败，请检查浏览器权限', 'error'); }
}

function getExportWatermarkText() {
  if (!$('#tiledWatermarkEnabled').checked) return '';
  const text = normalizeWatermarkText($('#tiledWatermarkText').value);
  $('#tiledWatermarkText').value = text;
  return text;
}

function updateReplacementTarget() {
  const target = state.palette[replacementTargetIndex];
  $('#replaceTargetText').textContent = target ? getColorDisplayLabel(target) : '请在下方选择一种颜色';
  const batchReplacement = Boolean(replacementCells?.length);
  $('#confirmReplaceColor').disabled = !target
    || (!batchReplacement && replacementTargetIndex === replacementSourceIndex);
}

function renderReplacementPalette() {
  const container = $('#replacementPalette');
  const query = $('#replacementSearch').value.trim().toLocaleUpperCase('zh-CN');
  $('#replaceColorDialog .replace-search span').textContent = state.useOwnedPalette ? `从已有的 ${state.ownedColorCodes.length} 色与留白中选择` : '从完整221色色卡中选择';
  const fragment = document.createDocumentFragment();
  const matchedColors = availableColors().filter((color) => (
    !query
    || color.code.toLocaleUpperCase('zh-CN').includes(query)
    || color.name.toLocaleUpperCase('zh-CN').includes(query)
    || color.searchTerms?.toLocaleUpperCase('zh-CN').includes(query)
  ));
  const colors = [
    ...matchedColors.filter((color) => color.manualOnly),
    ...sortPaletteByRecent(
      matchedColors.filter((color) => !color.manualOnly),
      recentReplacementCodes,
    ),
  ];

  colors.forEach((color) => {
    const button = makeButton('palette-swatch', {
      type: 'button',
      role: 'radio',
      'aria-checked': String(color.index === replacementTargetIndex),
      'aria-label': `${recentReplacementCodes.includes(color.code) ? '最近使用 ' : ''}${getColorDisplayLabel(color)}`,
    });
    button.dataset.index = color.index;
    button.classList.toggle('active', color.index === replacementTargetIndex);
    button.classList.toggle('current', color.index === replacementSourceIndex);
    button.classList.toggle('recent', recentReplacementCodes.includes(color.code));
    button.classList.toggle('manual-blank', Boolean(color.manualOnly));
    const patch = document.createElement('i'); patch.style.backgroundColor = color.hex;
    const code = document.createElement('strong'); code.textContent = getColorDisplayCode(color);
    const name = document.createElement('small'); name.textContent = color.name;
    button.append(patch, code, name);
    fragment.append(button);
  });

  container.replaceChildren(fragment);
  if (!colors.length) {
    const empty = document.createElement('p');
    empty.className = 'palette-empty';
    empty.textContent = '没有找到这个色号，换个关键词试试';
    container.append(empty);
  }
}

function openReplaceColorDialog() {
  const source = state.statistics.find((item) => item.code === state.highlightedCode);
  if (!source) return notify('请先在用豆清单中选择一种颜色', 'error');

  replacementSourceIndex = source.index;
  replacementTargetIndex = null;
  replacementCell = null;
  replacementCells = null;
  $('#replaceDialogTitle').textContent = '替换整种颜色';
  $('#replaceCurrentLabel').textContent = '当前选中的颜色';
  $('#confirmReplaceColor').textContent = '确认替换全部同色格子';
  $('#replaceCurrentSwatch').style.backgroundColor = source.hex;
  $('#replaceCurrentCode').textContent = getColorDisplayCode(source);
  $('#replaceCurrentMeta').textContent = `${source.name} · 当前共 ${number.format(source.count)}颗`;
  $('#replacementSearch').value = '';
  updateReplacementTarget();
  renderReplacementPalette();
  $('#replacementPalette').scrollTop = 0;
  $('#replaceColorDialog').showModal();
}

function openReplaceCellDialog(cell) {
  if (state.previewMode !== 'pattern' || !state.currentPattern) return;
  const source = state.palette[cell.colorIndex];
  if (!source) return;

  replacementSourceIndex = source.index;
  replacementTargetIndex = null;
  replacementCell = cell;
  replacementCells = null;
  $('#replaceDialogTitle').textContent = '替换这一颗豆';
  $('#replaceCurrentLabel').textContent = `第 ${cell.x + 1} 列 · 第 ${cell.y + 1} 行`;
  $('#confirmReplaceColor').textContent = '确认只替换这一格';
  $('#replaceCurrentSwatch').style.backgroundColor = source.hex;
  $('#replaceCurrentCode').textContent = getColorDisplayCode(source);
  $('#replaceCurrentMeta').textContent = source.manualOnly ? '纯白留白 · 不显示色号、不统计数量' : `${source.name} · 只修改当前小格子`;
  $('#replacementSearch').value = '';
  updateReplacementTarget();
  renderReplacementPalette();
  $('#replacementPalette').scrollTop = 0;
  $('#replaceColorDialog').showModal();
}

function openReplaceSelectedCellsDialog() {
  if (state.previewMode !== 'pattern' || !state.currentPattern) return;
  const positions = [...state.selectedCellPositions].sort((a, b) => a - b);
  if (!positions.length) return notify('请先按住 Ctrl 逐格选择，或用 Shift 框选格子', 'error');

  replacementSourceIndex = null;
  replacementTargetIndex = null;
  replacementCell = null;
  replacementCells = positions;
  $('#replaceDialogTitle').textContent = '批量替换选中格子';
  $('#replaceCurrentLabel').textContent = '当前多选';
  $('#confirmReplaceColor').textContent = `确认替换这 ${number.format(positions.length)} 格`;
  $('#replaceCurrentSwatch').style.backgroundColor = '#8F7BD8';
  $('#replaceCurrentCode').textContent = `${number.format(positions.length)}格`;
  $('#replaceCurrentMeta').textContent = '所选格子可以来自不同颜色，将统一换成目标颜色';
  $('#replacementSearch').value = '';
  updateReplacementTarget();
  renderReplacementPalette();
  $('#replacementPalette').scrollTop = 0;
  $('#replaceColorDialog').showModal();
}

function recalculatePatternStatistics({ preserveBackgroundMask = false } = {}) {
  if (!preserveBackgroundMask) {
    state.currentPattern.backgroundMask = getPatternBackgroundMask(
      state.currentPattern,
      state.currentPattern.sourcePixels,
    );
  }
  state.statistics = calculateStatistics(
    state.currentPattern.indices,
    state.palette,
    state.currentPattern.backgroundMask,
  );
  return statisticsTotal(state.statistics) === countPatternBeans(
    state.currentPattern.indices,
    state.palette,
    state.currentPattern.backgroundMask,
  );
}

function updatePatternCropSummary() {
  const pattern = state.currentPattern;
  const summary = $('#patternCropSummary');
  const confirm = $('#confirmPatternCrop');
  if (!pattern) {
    summary.textContent = '当前还没有可以调整尺寸的图纸。';
    summary.classList.add('error');
    confirm.disabled = true;
    return;
  }

  const width = Number($('#patternCropWidth').value);
  const height = Number($('#patternCropHeight').value);
  const valid = Number.isInteger(width)
    && Number.isInteger(height)
    && width >= 10
    && height >= 10
    && width <= 200
    && height <= 300;
  if (!valid) {
    summary.textContent = '目标宽度需为10～200格，目标高度需为10～300格。';
    summary.classList.add('error');
    confirm.disabled = true;
    return;
  }
  if (width === pattern.width && height === pattern.height) {
    summary.textContent = '请输入不同于当前图纸的目标尺寸。';
    summary.classList.add('error');
    confirm.disabled = true;
    return;
  }

  const adjustments = getPatternResizeAdjustments(pattern.width, pattern.height, width, height);
  const details = [];
  if (adjustments.cropLeft || adjustments.cropRight || adjustments.cropTop || adjustments.cropBottom) {
    details.push(`裁切左${adjustments.cropLeft}、右${adjustments.cropRight}、上${adjustments.cropTop}、下${adjustments.cropBottom}格`);
  }
  if (adjustments.expandLeft || adjustments.expandRight || adjustments.expandTop || adjustments.expandBottom) {
    details.push(`补空白左${adjustments.expandLeft}、右${adjustments.expandRight}、上${adjustments.expandTop}、下${adjustments.expandBottom}格`);
  }
  summary.textContent = `将调整为 ${width} × ${height}格：${details.join('；')}。`;
  summary.classList.remove('error');
  confirm.disabled = false;
}

function openPatternCropDialog() {
  const pattern = state.currentPattern;
  if (!pattern) return notify('请先生成或恢复一张图纸', 'error');
  $('#patternCropCurrent').textContent = `${pattern.width} × ${pattern.height}格`;
  const width = $('#patternCropWidth');
  const height = $('#patternCropHeight');
  width.max = '200';
  height.max = '300';
  width.value = String(pattern.width);
  height.value = String(pattern.height);
  updatePatternCropSummary();
  $('#patternCropDialog').showModal();
}

function applyPatternCrop() {
  const currentPattern = state.currentPattern;
  if (!currentPattern) return notify('当前图纸已经失效，请重新生成', 'error');
  const width = Number($('#patternCropWidth').value);
  const height = Number($('#patternCropHeight').value);
  const blank = state.palette.find((color) => color.manualOnly);
  if (!blank) return notify('纯白留白加载失败，请刷新页面', 'error');
  const snapshot = createPatternStateSnapshot(currentPattern);
  let result;
  try {
    result = resizePattern(currentPattern, width, height, blank.index);
  } catch (error) {
    updatePatternCropSummary();
    return notify(error.message || '图纸尺寸调整失败', 'error');
  }

  state.currentPattern = result.pattern;
  state.currentSize = { width, height };
  if (!recalculatePatternStatistics({ preserveBackgroundMask: true })) {
    state.currentPattern = currentPattern;
    state.currentSize = { width: currentPattern.width, height: currentPattern.height };
    recalculatePatternStatistics({ preserveBackgroundMask: true });
    return notify('调整后的颜色统计校验失败，图纸没有被修改', 'error');
  }

  recordPatternEdit(snapshot, `调整尺寸 ${width}×${height}`);
  state.highlightedCode = null;
  state.viewport = { zoom: 1, x: 0, y: 0 };
  clearSelectedCells({ redraw: false });
  showAllColors = state.statistics.length > 8 && showAllColors;
  syncRestoredChoices();
  renderStatistics();
  renderer.rebuild();
  renderer.fit();
  $('#patternCropDialog').close();
  const { adjustments } = result;
  const changed = [];
  if (adjustments.cropLeft || adjustments.cropRight || adjustments.cropTop || adjustments.cropBottom) changed.push('已居中裁切');
  if (adjustments.expandLeft || adjustments.expandRight || adjustments.expandTop || adjustments.expandBottom) changed.push('已居中补空白');
  notify(`图纸已调整为 ${width} × ${height}格（${changed.join('，')}）`, 'success', 5000);
}

function undoLastPatternEdit(redo = false, steps = 1) {
  finishPainting();
  if (state.generating) return;
  const previousWidth = state.currentPattern?.width;
  const previousHeight = state.currentPattern?.height;
  const from = redo ? state.patternRedoHistory : state.patternUndoHistory;
  const to = redo ? state.patternUndoHistory : state.patternRedoHistory;
  let moved = 0;
  while (moved < steps && state.currentPattern && transferPatternSnapshot(from, to, state.currentPattern, PATTERN_UNDO_LIMIT)) moved += 1;
  if (!moved) {
    notify(redo ? '还没有可重做的图纸修改' : '还没有可撤销的图纸修改');
    return;
  }
  if (!recalculatePatternStatistics({ preserveBackgroundMask: true })) {
    notify('撤销后的颜色统计校验失败，请重新生成图纸', 'error');
    return;
  }
  state.highlightedCode = null;
  clearSelectedCells({ redraw: false });
  const sizeChanged = previousWidth !== state.currentPattern.width || previousHeight !== state.currentPattern.height;
  if (sizeChanged) {
    state.currentSize = { width: state.currentPattern.width, height: state.currentPattern.height };
    syncRestoredChoices();
  }
  showAllColors = state.statistics.length > 8 && showAllColors;
  renderStatistics();
  renderer.rebuild();
  if (sizeChanged) renderer.fit();
  syncHistoryControls();
  notify(redo ? '已重做图纸修改' : moved > 1 ? `已撤回 ${moved} 步修改` : '已撤销上一次图纸修改', 'success');
}

function applyColorReplacement() {
  const target = state.palette[replacementTargetIndex];
  const batchReplacement = Boolean(replacementCells?.length);
  const source = Number.isInteger(replacementSourceIndex) ? state.palette[replacementSourceIndex] : null;
  if (!target || (!batchReplacement && (!source || source.index === target.index))) {
    return notify('请选择一种不同的替换颜色', 'error');
  }

  const cellReplacement = Boolean(replacementCell);
  const selectedCount = replacementCells?.length || 0;
  const snapshot = createPatternStateSnapshot(state.currentPattern);
  if (!availableColors().some((color) => color.index === target.index)) return notify('目标颜色不在已有色号中，请重新选色', 'error');
  const blank = state.palette.find((color) => color.manualOnly);
  const positions = batchReplacement ? replacementCells : cellReplacement ? [replacementCell.position]
    : [...state.currentPattern.indices.keys()].filter((position) => state.currentPattern.indices[position] === source.index && !state.currentPattern.backgroundMask?.[position]);
  const replaced = paintPositions(state.currentPattern, positions, target.index, blank.index);
  if (!replaced) return notify(batchReplacement ? '所选格子已经是这个颜色' : '当前格子的颜色没有发生变化', 'error');

  if (!recalculatePatternStatistics({ preserveBackgroundMask: true })) {
    if (snapshot) state.currentPattern.indices.set(snapshot.indices);
    recalculatePatternStatistics();
    return notify('替换后的颜色统计校验失败，请重新生成图纸', 'error');
  }
  recordPatternEdit(snapshot, batchReplacement
    ? `批量换色 → ${getColorDisplayCode(target)}`
    : cellReplacement
      ? `单格换色 ${getColorDisplayCode(source)} → ${getColorDisplayCode(target)}`
      : `整色替换 ${getColorDisplayCode(source)} → ${getColorDisplayCode(target)}`);
  state.highlightedCode = batchReplacement || cellReplacement || target.excludeFromStatistics ? null : target.code;
  if (!target.manualOnly) rememberReplacementColor(target.code);
  if (batchReplacement) {
    state.selectedCellPositions.clear();
    state.selectionAnchorPosition = null;
    replacementCells = null;
    updateCellSelectionUi();
  }
  showAllColors = state.statistics.length <= 8 ? false : showAllColors;
  renderStatistics();
  renderer.rebuild();
  $('#replaceColorDialog').close();
  notify(
    batchReplacement
      ? `已将选中的 ${number.format(selectedCount)} 格统一换成 ${getColorDisplayLabel(target)}`
      : cellReplacement
      ? `第 ${replacementCell.x + 1} 列、第 ${replacementCell.y + 1} 行已换成 ${getColorDisplayLabel(target)}`
      : `已将 ${getColorDisplayCode(source)} 替换为 ${getColorDisplayLabel(target)}，共 ${number.format(replaced)}格`,
    'success',
  );
}

function deleteSelectedCells() {
  const positions = [...state.selectedCellPositions];
  if (!positions.length || !state.currentPattern) return notify('请先选择要删除的格子', 'error');
  const blank = state.palette.find((color) => color.manualOnly);
  const snapshot = createPatternStateSnapshot(state.currentPattern);
  const changed = paintPositions(state.currentPattern, positions, blank.index, blank.index);
  clearSelectedCells({ redraw: false });
  if (!changed) { renderer.rebuild(); return notify('所选格子已经都是留白'); }
  recalculatePatternStatistics({ preserveBackgroundMask: true });
  recordPatternEdit(snapshot, '删除选中格子');
  state.highlightedCode = null;
  renderStatistics();
  renderer.rebuild();
  notify(`已将 ${number.format(changed)} 格改为留白`, 'success');
}

function readMergeRatio() {
  const value = Number($('#minorMergeRatio').value);
  return Number.isFinite(value) ? Math.min(5, Math.max(0.1, value)) : 0.8;
}

function updateMinorMergeHint() {
  if (!state.currentPattern) return;
  const merges = planMinorColorMerge(state.statistics, state.palette, readMergeRatio() / 100);
  const beans = merges.reduce((sum, item) => sum + item.count, 0);
  $('#minorMergeHint').textContent = merges.length
    ? `将合并 ${merges.length} 种零散颜色，共 ${number.format(beans)} 颗`
    : '没有低于这个占比的颜色';
  $('#applyMinorMerge').disabled = !merges.length;
}

function mergeMinorColors() {
  finishPainting();
  if (!state.currentPattern || state.generating) return;
  const ratio = readMergeRatio();
  const merges = planMinorColorMerge(state.statistics, state.palette, ratio / 100);
  if (!merges.length) return notify(`没有占比低于 ${ratio}% 的颜色`);
  const snapshot = createPatternStateSnapshot(state.currentPattern);
  applyColorMerges(state.currentPattern, merges);
  recalculatePatternStatistics({ preserveBackgroundMask: true });
  recordPatternEdit(snapshot, `合并零散色号（${merges.length} 色）`);
  state.highlightedCode = null;
  clearSelectedCells({ redraw: false });
  renderStatistics();
  renderer.rebuild();
  const detail = merges.slice(0, 4).map(({ from, to }) => `${state.palette[from].code}→${state.palette[to].code}`).join('、');
  notify(`已合并 ${merges.length} 种零散颜色：${detail}${merges.length > 4 ? ' 等' : ''}`, 'success', 5000);
}

function loadViewOptions() {
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_OPTIONS_KEY) || '{}');
    for (const key of Object.keys(state.viewOptions)) {
      if (typeof saved[key] === 'boolean') state.viewOptions[key] = saved[key];
    }
  } catch {
    // 本地存储不可用时使用默认显示方式。
  }
}

function syncViewOptions() {
  $$('[data-view-option]').forEach((button) => {
    button.setAttribute('aria-pressed', String(state.viewOptions[button.dataset.viewOption]));
  });
}

function toggleViewOption(key) {
  state.viewOptions[key] = !state.viewOptions[key];
  try { localStorage.setItem(VIEW_OPTIONS_KEY, JSON.stringify(state.viewOptions)); } catch {}
  syncViewOptions();
  if (state.previewMode !== 'pattern') setMode('pattern');
  else renderer.rebuild();
}

function selectedPrintBeadSize() {
  return Number($('input[name="printBeadSize"]:checked')?.value) || 2.6;
}

function updatePrintPdfSummary() {
  if (!state.currentPattern) return;
  const beadMm = selectedPrintBeadSize();
  const plan = planPrintPages(state.currentPattern, beadMm);
  const width = (state.currentPattern.width * beadMm / 10).toFixed(1);
  const height = (state.currentPattern.height * beadMm / 10).toFixed(1);
  $('#printPdfSummary').textContent = `成品约 ${width} × ${height} cm，图纸共 ${plan.pages.length} 页 A4（${plan.landscape ? '横向' : '纵向'}），另附色号图例。`;
}

function openPrintPdfDialog() {
  if (!state.currentPattern) return notify('请先生成一张图纸', 'error');
  updatePrintPdfSummary();
  $('#printPdfDialog').showModal();
}

async function confirmPrintPdf() {
  const button = $('#confirmPrintPdf');
  button.disabled = true;
  try {
    const result = await exportPrintPdf(state.currentPattern, state.palette, state.statistics, {
      beadMm: selectedPrintBeadSize(),
      mirrorX: $('#printMirror').checked,
      tiledWatermarkText: getExportWatermarkText(),
      onProgress: (page, total) => { button.textContent = `正在生成第 ${page} / ${total} 页…`; },
    });
    $('#printPdfDialog').close();
    notify(`PDF 已下载，共 ${result.pages} 页。打印时请选择“实际大小 / 100%”`, 'success', 6000);
  } catch (error) {
    notify(error.message || 'PDF 生成失败，请重试', 'error', 5000);
  } finally {
    button.disabled = false;
    button.textContent = '生成并下载 PDF';
  }
}

function replaceCellWithBlank(cell) {
  const blank = state.palette.find((color) => color.manualOnly);
  if (!blank) return notify('纯白留白加载失败，请刷新页面', 'error');
  if (cell.colorIndex === blank.index) return notify('这个格子已经是纯白留白');
  const snapshot = createPatternStateSnapshot(state.currentPattern);
  if (!paintPositions(state.currentPattern, [cell.position], blank.index, blank.index)) {
    return notify('当前格子没有发生变化', 'error');
  }

  if (!recalculatePatternStatistics({ preserveBackgroundMask: true })) {
    if (snapshot) state.currentPattern.indices.set(snapshot.indices);
    recalculatePatternStatistics();
    return notify('快捷留白后的颜色统计校验失败，请重新生成图纸', 'error');
  }
  recordPatternEdit(snapshot, '快速留白');

  state.highlightedCode = null;
  renderStatistics();
  renderer.rebuild();
  notify(`第 ${cell.x + 1} 列、第 ${cell.y + 1} 行已快速留白`, 'success');
}

function bindUpload() {
  const zone = $('#uploadZone'), input = $('#fileInput'), patternInput = $('#patternFileInput');
  const open = () => input.click();
  zone.addEventListener('click', (event) => { if (event.target !== input) open(); });
  zone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
  $('#replaceImage').addEventListener('click', (event) => { event.stopPropagation(); open(); });
  input.addEventListener('change', () => { loadFile(input.files[0]); input.value = ''; });
  ['dragenter', 'dragover'].forEach((type) => zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach((type) => zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.remove('drag-over'); }));
  zone.addEventListener('drop', (event) => loadFile(event.dataTransfer.files[0]));
  $('#uploadPatternImage').addEventListener('click', () => patternInput.click());
  patternInput.addEventListener('change', async () => {
    const file = patternInput.files[0];
    patternInput.value = '';
    if (await loadFile(file)) await detectExistingPatternGrid();
  });
}

function bindLinkImport() {
  $('#linkImportForm').addEventListener('submit', resolveLinkImport);
  $('#cancelLinkImages').addEventListener('click', () => $('#linkImageDialog').close());
  $('#linkImageGrid').addEventListener('click', (event) => {
    const button = event.target.closest('.link-image-card');
    if (!button) return;
    importLinkedImage(Number(button.dataset.linkImageIndex));
  });
}

function bindProjectFiles() {
  const input = $('#projectFileInput');
  $('#openProjectButton').addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    await openProject(file);
  });
  $('#saveProjectButton').addEventListener('click', openSaveProjectDialog);
  $('#saveProjectResultButton').addEventListener('click', openSaveProjectDialog);
  $('#cancelSaveProject').addEventListener('click', () => $('#saveProjectDialog').close());
  $('#saveProjectForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const saved = await saveProject($('#projectNameInput').value);
    if (saved) $('#saveProjectDialog').close();
  });
}

function bindChoices() {
  $('#sizeCards').addEventListener('click', (event) => {
    const button = event.target.closest('.size-card'); if (!button) return;
    if (button.dataset.id === 'custom') { $('#customSizeDialog').showModal(); return; }
    state.currentSize = { width: Number(button.dataset.width), height: Number(button.dataset.height) };
    setChoiceActive($('#sizeCards'), button); markDirty();
  });
  $('#colorCards').addEventListener('click', (event) => {
    const button = event.target.closest('.color-card'); if (!button) return;
    state.maxColors = Number(button.dataset.colors); setChoiceActive($('#colorCards'), button); markDirty();
    renderModeRecommendation();
  });
  $('#applyModeRecommendation').addEventListener('click', applyModeRecommendation);
  $('#colorStyleCards').addEventListener('click', (event) => {
    const button = event.target.closest('.style-card'); if (!button) return;
    state.colorStyle = button.dataset.colorStyle;
    setChoiceActive($('#colorStyleCards'), button);
    markDirty();
    renderModeRecommendation();
    drawSourcePreview();
  });
}

const cropper = new CropperController({
  dialog: $('#cropDialog'), image: $('#cropImage'), ratioButtons: $$('.crop-ratios button'),
  confirmButton: $('#confirmCrop'), cancelButton: $('#cancelCrop'),
  getPatternRatio: () => state.currentSize.width / state.currentSize.height,
  onConfirm: (crop) => {
    state.crop = crop;
    pendingGridRecovery = null;
    $('#patternRecoveryStatus').textContent = '裁剪已更新，可以开始识别网格';
    $('#cropBadge').hidden = false;
    markDirty();
    drawSourcePreview();
  },
});

function bindDialogs() {
  $('#cropButton').addEventListener('click', () => cropper.open(state.imageUrl, state.crop));
  $('#openPatternCrop').addEventListener('click', openPatternCropDialog);
  $('#cancelPatternCrop').addEventListener('click', () => $('#patternCropDialog').close());
  $('#patternCropWidth').addEventListener('input', updatePatternCropSummary);
  $('#patternCropHeight').addEventListener('input', updatePatternCropSummary);
  $('#confirmPatternCrop').addEventListener('click', applyPatternCrop);
  $('#detectPatternGrid').addEventListener('click', detectExistingPatternGrid);
  $('#cancelPatternGrid').addEventListener('click', () => $('#patternGridDialog').close());
  $('#confirmPatternGrid').addEventListener('click', confirmPatternGridRecovery);
  const width = $('#customWidth'), height = $('#customHeight');
  const updateTotal = () => { $('#customTotal').textContent = `总计 ${number.format((Number(width.value) || 0) * (Number(height.value) || 0))}颗`; };
  width.addEventListener('input', updateTotal); height.addEventListener('input', updateTotal);
  $('#confirmCustomSize').addEventListener('click', () => {
    const w = Number(width.value), h = Number(height.value);
    if (!Number.isInteger(w) || !Number.isInteger(h) || w < 10 || w > 200 || h < 10 || h > 300) return notify('宽度需为10～200格，高度需为10～300格', 'error');
    state.currentSize = { width: w, height: h };
    const custom = $('[data-id="custom"]');
    custom.querySelector('b').textContent = `${w} × ${h}格`;
    custom.querySelectorAll('span')[1].textContent = `总计 ${number.format(w * h)}颗`;
    setChoiceActive($('#sizeCards'), custom); markDirty(); $('#customSizeDialog').close();
  });
  $('[data-close-dialog]').addEventListener('click', () => $('#customSizeDialog').close());
  $('#openBlankCanvas').addEventListener('click', () => { updateBlankCanvasSummary(); $('#blankCanvasDialog').showModal(); });
  $('#closeBlankCanvas').addEventListener('click', () => $('#blankCanvasDialog').close());
  $('#blankCanvasWidth').addEventListener('input', updateBlankCanvasSummary);
  $('#blankCanvasHeight').addEventListener('input', updateBlankCanvasSummary);
  $('.blank-canvas-presets').addEventListener('click', (event) => {
    const preset = event.target.closest('[data-blank-size]');
    if (!preset) return;
    const [presetWidth, presetHeight] = preset.dataset.blankSize.split('x');
    $('#blankCanvasWidth').value = presetWidth;
    $('#blankCanvasHeight').value = presetHeight;
    updateBlankCanvasSummary();
  });
  $('#confirmBlankCanvas').addEventListener('click', createBlankCanvasProject);
}

function bindResults() {
  const exportSettingsDialog = $('#exportSettingsDialog');
  $('#openExportSettings').addEventListener('click', () => {
    exportSettingsDialog.showModal();
    $('#openExportSettings').setAttribute('aria-expanded', 'true');
  });
  ['#closeExportSettings', '#doneExportSettings'].forEach((selector) => {
    $(selector).addEventListener('click', () => exportSettingsDialog.close());
  });
  exportSettingsDialog.addEventListener('close', () => $('#openExportSettings').setAttribute('aria-expanded', 'false'));
  const watermarkEnabled = $('#tiledWatermarkEnabled');
  const watermarkText = $('#tiledWatermarkText');
  watermarkText.value = DEFAULT_TILED_WATERMARK;
  watermarkEnabled.addEventListener('change', syncWatermarkSetting);
  watermarkText.addEventListener('input', scheduleDraftSave);
  syncWatermarkSetting();

  $$('.mode-switch button').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
  $('#toggleColors').addEventListener('click', () => { showAllColors = !showAllColors; renderColorList(); });
  $('#copyColors').addEventListener('click', copyList);
  $('#replaceSelectedColor').addEventListener('click', openReplaceColorDialog);
  $('#exportHighlightedColor').addEventListener('click', async () => {
    const button = $('#exportHighlightedColor');
    const highlighted = state.statistics.find((item) => item.code === state.highlightedCode);
    if (!highlighted) return notify('请先从用豆清单中选择一种颜色', 'error');
    button.disabled = true;
    try {
      const result = await exportHighlightedColorPng(
        state.currentPattern,
        state.palette,
        state.statistics,
        highlighted.code,
        { tiledWatermarkText: getExportWatermarkText() },
      );
      notify(
        result.reduced
          ? `${highlighted.code} 定位图已按设备能力安全导出，共 ${number.format(highlighted.count)}颗`
          : `${highlighted.code} 分色定位图已保存，共 ${number.format(highlighted.count)}颗`,
        'success',
        5000,
      );
    } catch (error) {
      notify(error.message || '分色定位图导出失败，请重试', 'error', 5000);
    } finally {
      renderColorList();
    }
  });
  $('#exportAllHighlightedColors').addEventListener('click', async () => {
    if (!state.statistics.length) return notify('当前图纸没有可导出的颜色', 'error');
    const button = $('#exportAllHighlightedColors');
    exportingAllColors = true;
    renderColorList();
    try {
      const result = await exportAllHighlightedColorsZip(
        state.currentPattern,
        state.palette,
        state.statistics,
        {
          tiledWatermarkText: getExportWatermarkText(),
          onProgress: ({ completed, total, target, variant }) => {
            button.textContent = `正在生成 ${completed}/${total}：${target.code}·${variant.label}`;
          },
        },
      );
      notify(`已导出 ${result.count} 种颜色的正向+镜像分色定位图，共 ${result.fileCount} 张（ZIP）`, 'success', 6000);
    } catch (error) {
      notify(error.message || '全部分色定位图导出失败，请重试', 'error', 6000);
    } finally {
      exportingAllColors = false;
      renderColorList();
    }
  });
  $('#replaceSelectedCells').addEventListener('click', openReplaceSelectedCellsDialog);
  $('#deleteSelectedCells').addEventListener('click', deleteSelectedCells);
  $('#clearSelectedCells').addEventListener('click', () => clearSelectedCells());
  $('#minorMergeRatio').addEventListener('input', updateMinorMergeHint);
  $('#applyMinorMerge').addEventListener('click', mergeMinorColors);
  $('#historyList').addEventListener('click', (event) => {
    const locate = event.target.closest('.history-locate');
    if (locate) return locateHistoryStep(Number(locate.dataset.step));
    const rewind = event.target.closest('.history-rewind');
    if (rewind) undoLastPatternEdit(false, Number(rewind.dataset.steps));
  });
  $('#restoreInitialPattern').addEventListener('click', restoreInitialPattern);
  $('#openPrintPdf').addEventListener('click', openPrintPdfDialog);
  $('#closePrintPdf').addEventListener('click', () => $('#printPdfDialog').close());
  $('#confirmPrintPdf').addEventListener('click', confirmPrintPdf);
  $$('input[name="printBeadSize"]').forEach((input) => input.addEventListener('change', updatePrintPdfSummary));
  $('#closeReplaceColor').addEventListener('click', () => $('#replaceColorDialog').close());
  $('#replacementSearch').addEventListener('input', renderReplacementPalette);
  $('#replacementPalette').addEventListener('click', (event) => {
    const button = event.target.closest('.palette-swatch'); if (!button) return;
    replacementTargetIndex = Number(button.dataset.index);
    updateReplacementTarget();
    renderReplacementPalette();
  });
  $('#resultStage').addEventListener('contextmenu', (event) => {
    if (state.previewMode !== 'pattern' || !state.currentPattern) return;
    if (event.target.closest('button')) return;
    const cell = renderer.hitTestCell(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    replaceCellWithBlank(cell);
  });
  $('#confirmReplaceColor').addEventListener('click', applyColorReplacement);
  $('#colorList').addEventListener('click', (event) => {
    const row = event.target.closest('.color-row'); if (!row) return;
    state.highlightedCode = state.highlightedCode === row.dataset.code ? null : row.dataset.code;
    renderColorList(); renderer.rebuild();
  });
  $('#fullscreenButton').addEventListener('click', async () => {
    try {
      const stage = $('#resultStage');
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (stage.requestFullscreen) await stage.requestFullscreen();
      else if (stage.webkitRequestFullscreen) stage.webkitRequestFullscreen();
    } catch { notify('当前浏览器不支持全屏查看', 'error'); }
  });
  $('#saveEffect').addEventListener('click', async () => {
    try { const result = await exportEffectPng(state.currentPattern, state.palette, { tiledWatermarkText: getExportWatermarkText() }); if (result.reduced) notify(`设备内存有限，已安全导出 ${result.width}×${result.height}px，图纸内容不受影响。`); else notify(`高清效果图已保存（${result.width}×${result.height}px）`, 'success'); }
    catch (error) { notify(error.message || '保存失败，请重试', 'error', 5000); }
  });
  $('#savePattern').addEventListener('click', async () => {
    try { const result = await exportPatternPng(state.currentPattern, state.palette, state.statistics, { tiledWatermarkText: getExportWatermarkText() }); if (result.reduced) notify(`设备内存有限，已安全导出 ${result.width}×${result.height}px，色号和网格不受影响。`); else notify(`高清制作图已保存（${result.width}×${result.height}px）`, 'success'); }
    catch (error) { notify(error.message || '保存失败，请重试', 'error', 5000); }
  });
  $('#saveMirroredPattern').addEventListener('click', async () => {
    try { const result = await exportPatternPng(state.currentPattern, state.palette, state.statistics, { mirrorX: true, tiledWatermarkText: getExportWatermarkText() }); if (result.reduced) notify(`设备内存有限，已安全导出镜像制作图 ${result.width}×${result.height}px，色号和网格不受影响。`); else notify(`高清镜像制作图已保存（${result.width}×${result.height}px）`, 'success'); }
    catch (error) { notify(error.message || '镜像制作图保存失败，请重试', 'error', 5000); }
  });
}

function describeDraft(summary) {
  const date = new Date(summary.updatedAt);
  const when = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const size = summary.width ? `${summary.width} × ${summary.height} 格` : '还没生成图纸';
  return [when, size].filter(Boolean).join(' · ');
}

function safeThumbnail(summary) {
  return summary.thumbnail?.startsWith('data:image/png;base64,') ? summary.thumbnail : '';
}

function renderDraftList() {
  const latest = draftSummaries[0];
  if (latest) {
    $('#draftName').textContent = latest.name;
    $('#draftMeta').textContent = describeDraft(latest);
    const thumbnail = safeThumbnail(latest);
    $('#draftThumbnail').hidden = !thumbnail;
    if (thumbnail) $('#draftThumbnail').src = thumbnail;
    $('#restoreDraft').dataset.draftId = latest.id;
  }
  $('#draftCount').textContent = `我的图纸（${draftSummaries.length}）`;
  if (!latest) delete $('#restoreDraft').dataset.draftId;

  const fragment = document.createDocumentFragment();
  for (const summary of draftSummaries) {
    const current = summary.id === state.draftId && Boolean(state.image);
    const item = document.createElement('li');
    item.className = 'my-pattern-item';
    item.classList.toggle('current', current);
    const thumbnail = safeThumbnail(summary);
    const image = document.createElement(thumbnail ? 'img' : 'span');
    image.className = 'my-pattern-thumb';
    if (thumbnail) { image.src = thumbnail; image.alt = `${summary.name} 缩略图`; }
    const text = document.createElement('div');
    const name = document.createElement('strong'); name.textContent = summary.name;
    const meta = document.createElement('small'); meta.textContent = current ? `正在编辑 · ${describeDraft(summary)}` : describeDraft(summary);
    text.append(name, meta);
    const open = makeButton('soft-button', { type: 'button' });
    open.dataset.openDraft = summary.id;
    open.textContent = current ? '继续编辑' : '打开';
    const remove = makeButton('my-pattern-delete', { type: 'button', 'aria-label': `删除 ${summary.name}` });
    remove.dataset.deleteDraft = summary.id;
    remove.textContent = '删除';
    remove.disabled = current;
    item.append(image, text, open, remove);
    fragment.append(item);
  }
  $('#myPatternList').replaceChildren(fragment);
  $('#myPatternEmpty').hidden = draftSummaries.length > 0;
  navigation.sync();
}

async function refreshDraftList() {
  try {
    draftSummaries = await listDrafts();
    renderDraftList();
  } catch {
    $('#draftStatus').textContent = '草稿存储不可用，请保存工程';
    $('#draftStatus').dataset.status = 'error';
  }
}

async function initializeDraft() {
  await refreshDraftList();
  if (draftSummaries.length && !state.image) $('#draftStatus').textContent = `我的图纸里有 ${draftSummaries.length} 份图纸`;
}

async function openSavedDraft(id) {
  if (state.generating) return notify('图纸正在生成，请稍后再打开');
  finishPainting();
  try {
    await autoDraft.flush();
    const draft = await readDraft(id);
    if (!draft?.project) throw new Error('这份图纸已经不存在，请刷新列表');
    await openProject(new File([serializeProjectDocument(draft.project)], `${draft.name || '我的图纸'}.perlerproj`, { type: 'application/json' }), { draft: true, draftId: id });
    renderDraftList();
  } catch (error) {
    notify(error.message || '图纸打开失败', 'error', 5000);
  }
}

async function removeSavedDraft(id) {
  const summary = draftSummaries.find((item) => item.id === id);
  if (!summary || !window.confirm(`确定删除“${summary.name}”吗？删除后无法恢复。`)) return;
  try {
    await deleteDraft(id);
    await refreshDraftList();
    notify(`已删除“${summary.name}”`, 'success');
  } catch (error) {
    notify(error.message || '删除失败，请重试', 'error');
  }
}

// 首页示例：Q版人物原图，按“卡通 / Q版”模式生成，与点击“试做”得到的图纸一致。
const EXAMPLE = { width: 70, height: 104, maxColors: 24, colorStyle: 'ordered' };

async function initializeExample() {
  try {
    const image = $('#exampleImage');
    await image.decode();
    const { width, height, maxColors, colorStyle } = EXAMPLE;
    const sampled = sampleImageForPattern({
      image, transform: { rotation: 0, flipH: false, flipV: false }, crop: null, colorStyle, width, height,
    });
    const pattern = await generatePattern({
      ...sampled, width, height,
      palette: state.palette
        .filter((color) => !color.manualOnly)
        .map(({ code, name, hex, rgb }) => ({ code, name, hex, rgb })),
      maxColors, reduceIsolated: true, mergeColors: true,
      protectDarkOutline: shouldProtectDarkOutline(colorStyle),
      orderedColorCleanup: shouldUseOrderedColorCleanup(colorStyle),
    });
    const blank = state.palette.find((color) => color.manualOnly);
    pattern.backgroundMask = createBackgroundMaskFromSubject(sampled.subjectMask);
    pattern.backgroundMask.forEach((outside, position) => { if (outside) pattern.indices[position] = blank.index; });
    const statistics = calculateStatistics(pattern.indices, state.palette, pattern.backgroundMask);
    drawPatternSheet($('#examplePattern').getContext('2d'), pattern, state.palette, statistics, { cell: 16 });
    $('#exampleSummary').textContent = `${width} × ${height} 格 · 实际 ${statistics.length} 色 · ${number.format(statisticsTotal(statistics))} 颗豆。点击试做，可继续改色。`;
  } catch {
    $('#exampleSummary').textContent = '点击试做，即可查看这张图生成的图纸。';
    $('#examplePattern').hidden = true;
  }
}

function bindWorkspace() {
  $$('[data-edit-tool]').forEach((button) => button.addEventListener('click', () => setEditTool(button.dataset.editTool)));
  $('#chooseBrushColor').addEventListener('click', () => {
    finishPainting(); $('#brushColorSearch').value = ''; renderBrushPalette(); $('#brushColorDialog').showModal();
  });
  $('#closeBrushColor').addEventListener('click', () => $('#brushColorDialog').close());
  $('#brushColorSearch').addEventListener('input', renderBrushPalette);
  $('#brushPalette').addEventListener('click', (event) => {
    const code = event.target.closest('[data-code]')?.dataset.code;
    if (!availableColors().some((color) => color.code === code)) return;
    state.brushColorCode = code; rememberReplacementColor(code);
    $('#brushColorDialog').close();
    if (!['brush', 'fill'].includes(state.editTool)) setEditTool('brush');
    syncPaintTools();
  });
  syncPaintTools();
  $('#undoEdit').addEventListener('click', () => undoLastPatternEdit());
  $('#redoEdit').addEventListener('click', () => undoLastPatternEdit(true));
  loadViewOptions();
  syncViewOptions();
  $$('[data-view-option]').forEach((button) => button.addEventListener('click', () => toggleViewOption(button.dataset.viewOption)));
  $('#fitCanvas').addEventListener('click', () => renderer.fit());
  for (const [id, factor] of [['zoomIn', 1.3], ['zoomOut', 1 / 1.3]]) {
    $(`#${id}`).addEventListener('click', () => {
      const rect = $('#resultStage').getBoundingClientRect();
      renderer.zoomAt(factor, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }
  $$('[data-workspace-panel]').forEach((button) => button.addEventListener('click', () => setWorkspacePanel(button.dataset.workspacePanel)));
  $('#tryExample').addEventListener('click', async () => {
    const button = $('#tryExample'); button.disabled = true;
    try {
      const response = await fetch($('#exampleImage').src);
      if (!response.ok) throw new Error('示例图片读取失败，请重试');
      const blob = await response.blob();
      const file = new File([blob], 'Q版人物示例.jpg', { type: blob.type || 'image/jpeg' });
      if (await loadFile(file)) {
        state.currentSize = { width: EXAMPLE.width, height: EXAMPLE.height };
        state.maxColors = EXAMPLE.maxColors; state.colorStyle = EXAMPLE.colorStyle;
        syncRestoredChoices();
        await generate();
      }
    } catch (error) { notify(error.message || '示例加载失败', 'error'); }
    finally { button.disabled = false; }
  });
  $('#restoreDraft').addEventListener('click', async () => {
    const id = $('#restoreDraft').dataset.draftId;
    if (!id) return;
    const button = $('#restoreDraft'); button.disabled = true;
    try { await openSavedDraft(id); } finally { button.disabled = false; }
  });
  $('#draftCount').addEventListener('click', () => navigation.show('library', { focus: true }));
  $('#myPatternList').addEventListener('click', (event) => {
    const open = event.target.closest('[data-open-draft]');
    if (open) {
      if (open.dataset.openDraft === state.draftId && state.image) return navigation.show('editor', { focus: true });
      return openSavedDraft(open.dataset.openDraft);
    }
    const remove = event.target.closest('[data-delete-draft]');
    if (remove) removeSavedDraft(remove.dataset.deleteDraft);
  });
  $('#retryDraft').addEventListener('click', () => autoDraft.flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { finishPainting(); autoDraft.flush(); }
  });
  window.addEventListener('pagehide', () => autoDraft.flush());
  window.addEventListener('beforeunload', (event) => {
    if (autoDraft.pending) { event.preventDefault(); event.returnValue = ''; }
  });
}

buildChoices(); bindUpload(); bindLinkImport(); bindProjectFiles(); bindChoices(); bindDialogs(); bindResults();
textController = createTextPatternController({ palette: state.palette, notify, onCreate: createTextPatternProject });
bindWorkspace();
navigation.init();
initializeDraft();
initializeExample();
$$('[data-transform]').forEach((button) => button.addEventListener('click', () => changeTransform(button.dataset.transform)));
$('#generateButton').addEventListener('click', generate);
window.addEventListener('resize', () => { if (state.image) drawSourcePreview(); });
document.addEventListener('keydown', (event) => {
  const target = event.target;
  const editingText = target instanceof HTMLElement
    && (target.matches('input, textarea, [contenteditable="true"]') || target.isContentEditable);
  if (!editingText && !document.querySelector('dialog[open]') && !event.ctrlKey && !event.metaKey && !event.altKey && state.currentPattern) {
    const shortcut = { b: 'brush', e: 'eraser', g: 'fill', v: 'move', s: 'select', i: 'pick', x: 'box' }[event.key.toLowerCase()];
    if (shortcut) { event.preventDefault(); setEditTool(shortcut); return; }
    if (event.key === 'Escape' && activeStroke) { finishPainting(true); return; }
  }
  const undoShortcut = (event.ctrlKey || event.metaKey)
    && !event.shiftKey
    && !event.altKey
    && event.key.toLowerCase() === 'z';
  const redoShortcut = (event.ctrlKey || event.metaKey) && !event.altKey
    && ((event.shiftKey && event.key.toLowerCase() === 'z') || (!event.shiftKey && event.key.toLowerCase() === 'y'));
  if ((undoShortcut || redoShortcut) && !editingText && !document.querySelector('dialog[open]')) {
    event.preventDefault();
    undoLastPatternEdit(redoShortcut);
    return;
  }
  if (event.key === 'Escape' && !$('#replaceColorDialog').open) {
    if (state.selectedCellPositions.size) {
      clearSelectedCells();
    } else if (state.highlightedCode) {
      state.highlightedCode = null; renderColorList(); renderer.rebuild();
    }
  }
});
renderer.resize();

if (state.palette.filter((color) => !color.manualOnly).length !== 221) notify('MARD 221 色卡加载不完整，请刷新页面', 'error');
