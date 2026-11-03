import {
  TEXT_COLOR_SCHEMES,
  buildTextPattern,
  getTextStyleLayers,
  maskFromCoverage,
  trimMask,
} from '../text/textPattern.js';
import { TEXT_FONTS, getTextFont, getTextFontSpec, renderTextCoverage } from '../text/textRenderer.js';

// 打包字体的 @font-face 声明很长，单独拆成样式分块，选中字体时才加载，不拖慢首页。
const FONT_STYLESHEETS = {
  pixel12: () => import('@fontsource/fusion-pixel-12px-proportional-sc/400.css'),
  pixel8: () => import('@fontsource/fusion-pixel-8px-proportional-sc/400.css'),
  huangyou: () => import('@fontsource/zcool-qingke-huangyou/400.css'),
  kuaile: () => import('@fontsource/zcool-kuaile/400.css'),
  wenkai: () => import('lxgw-wenkai-webfont/lxgwwenkai-bold.css'),
};
// 常见用途的一键模板：文字、字体、字高、样式和配色一次套好，再按需修改。
const TEXT_TEMPLATES = [
  { label: '生日祝福', text: '生日快乐', fontId: 'huangyou', charHeight: 18, style: 'cloud', schemeId: 'romantic-pink' },
  { label: '名字牌', text: '小石豆', fontId: 'pixel12', charHeight: 24, style: 'sticker', schemeId: 'classic-blue' },
  { label: '迷你钥匙扣', text: 'LOVE', fontId: 'pixel8', charHeight: 8, style: 'outline', schemeId: 'hot-red' },
  { label: '彩虹摆件', text: '平安喜乐', fontId: 'huangyou', charHeight: 20, style: 'rainbow', schemeId: 'mono' },
  { label: '空心大字', text: 'HELLO', fontId: 'hei', charHeight: 20, style: 'hollow', schemeId: 'taro' },
];
const STYLE_NOTES = {
  plain: '只拼字本身，用配色里的主色，最省豆。',
  outline: '白字加一圈彩色描边，字内的空洞保留。',
  cloud: '字外三层蓬松描边，整块实心，最受欢迎的摆件字。',
  sticker: '彩色字 + 粗白边 + 细外框，整块实心，像一枚贴纸。',
  hollow: '字面留空，只沿笔画外缘拼一圈；笔画太细时建议调大字高。',
  rainbow: '字外六圈红橙黄绿蓝紫，彩虹颜色固定，配色只决定字的颜色。',
};
const MAX_WIDTH = 200;
const MAX_HEIGHT = 300;
const number = new Intl.NumberFormat('zh-CN');

/**
 * 文字转图纸页面：调整文字、字体、样式和配色时实时预览，确认后交给 onCreate。
 */
export function createTextPatternController({ palette, notify, onCreate }) {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const byCode = new Map(palette.map((color) => [color.code, color]));
  const blank = palette.find((color) => color.manualOnly);
  const settings = { align: 'center', style: 'cloud', schemeId: TEXT_COLOR_SCHEMES[0].id };
  let current = null;
  let frame = null;
  const loadingFonts = new Set();
  const failedFonts = new Set();
  const stylesheets = new Map();

  $('#textTemplates').replaceChildren(...TEXT_TEMPLATES.map((template, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.textTemplate = String(index);
    button.textContent = template.label;
    return button;
  }));
  $('#textFont').replaceChildren(...TEXT_FONTS.map((font) => new Option(font.name, font.id)));
  $('#textSchemes').replaceChildren(...TEXT_COLOR_SCHEMES.map((scheme) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'text-scheme';
    button.dataset.scheme = scheme.id;
    button.setAttribute('role', 'radio');
    const swatches = document.createElement('span');
    swatches.className = 'text-scheme-swatches';
    swatches.append(...scheme.codes.map((code) => {
      const swatch = document.createElement('i');
      swatch.style.backgroundColor = byCode.get(code).hex;
      swatch.title = code;
      return swatch;
    }));
    const name = document.createElement('span');
    name.textContent = scheme.name;
    button.append(swatches, name);
    return button;
  }));

  function readOptions() {
    return {
      text: $('#textInput').value,
      fontId: $('#textFont').value,
      bold: $('#textBold').checked,
      charHeight: Number($('#textHeight').value),
      letterSpacing: Number($('#textSpacing').value),
      lineSpacing: Number($('#textLineSpacing').value),
      align: settings.align,
    };
  }

  // 换字体时调整字高滑杆：点阵字只能取字模格数的整数倍，其他字体不低于可读的最小字高。
  function syncFontControls() {
    const font = getTextFont($('#textFont').value);
    const slider = $('#textHeight');
    const previous = Number(slider.value);
    if (font.pixelSize) {
      Object.assign(slider, { min: font.pixelSize, max: font.pixelSize * 5, step: font.pixelSize });
      slider.value = String(Math.min(5, Math.max(1, Math.round(previous / font.pixelSize))) * font.pixelSize);
    } else {
      Object.assign(slider, { min: font.minHeight, max: 60, step: 1 });
      slider.value = String(Math.max(font.minHeight, previous));
    }
    const raised = !font.pixelSize && Number(slider.value) > previous;
    $('#textFontNote').textContent = raised ? `${font.note}已把字高调到 ${slider.value} 格。` : font.note;
    $('#textBold').disabled = Boolean(font.fixedWeight);
  }

  // 打包字体按需下载：只下载当前文字用到的分片，下载完再画预览，避免先用回退字体画出错误的图纸。
  function fontStatus(options) {
    const font = getTextFont(options.fontId);
    if (!font.webFont || !document.fonts) return 'ready';
    // 样式未加载前 document.fonts.check 找不到对应字体，会误报“已就绪”，所以先确认样式到位。
    const stylesheet = stylesheets.get(font.id);
    if (stylesheet === 'failed') return 'failed';
    if (stylesheet !== 'ready') {
      if (!stylesheet) {
        stylesheets.set(font.id, 'loading');
        FONT_STYLESHEETS[font.id]()
          .then(() => stylesheets.set(font.id, 'ready'), () => stylesheets.set(font.id, 'failed'))
          .then(schedule);
      }
      return 'loading';
    }
    const spec = getTextFontSpec(options.fontId, options.bold);
    const key = `${spec}|${options.text}`;
    if (document.fonts.check(spec, options.text)) return 'ready';
    if (failedFonts.has(key)) return 'failed';
    if (!loadingFonts.has(key)) {
      loadingFonts.add(key);
      document.fonts.load(spec, options.text)
        .catch(() => {})
        .then(() => {
          loadingFonts.delete(key);
          if (!document.fonts.check(spec, options.text)) failedFonts.add(key);
          schedule();
        });
    }
    return 'loading';
  }

  function build() {
    const options = readOptions();
    if (!options.text.trim()) return { error: '请输入文字' };
    const status = fontStatus(options);
    if (status === 'loading') return { error: `正在下载「${getTextFont(options.fontId).name.replace(/（.*/, '')}」字体…`, pending: true };
    if (status === 'failed') return { error: '字体下载失败，请检查网络后重试，或先换成黑体' };
    const raster = renderTextCoverage(options);
    const trimmed = trimMask(maskFromCoverage(raster.coverage), raster.width, raster.height);
    if (!trimmed.width) return { error: '没有识别到文字笔画，请换个字体或调大字高' };
    const scheme = TEXT_COLOR_SCHEMES.find((item) => item.id === settings.schemeId);
    const layers = getTextStyleLayers(settings.style, options.charHeight, scheme.codes);
    const pattern = buildTextPattern(trimmed.mask, trimmed.width, trimmed.height, {
      ringWidths: layers.ringWidths,
      colorIndices: layers.codes.map((code) => (code ? byCode.get(code).index : null)),
      blankIndex: blank.index,
      fillHoles: layers.fillHoles,
    });
    if (pattern.width > MAX_WIDTH || pattern.height > MAX_HEIGHT) {
      return { error: `图纸 ${pattern.width} × ${pattern.height} 格超出上限（宽 ${MAX_WIDTH}、高 ${MAX_HEIGHT}），请减少文字或调小字高` };
    }
    return { pattern, name: options.text.replace(/\s+/g, ' ').trim().slice(0, 20) };
  }

  function drawPreview(pattern) {
    const canvas = $('#textPreview');
    const cell = Math.max(3, Math.min(14, Math.floor(600 / Math.max(pattern.width, pattern.height * 0.8))));
    canvas.width = pattern.width * cell;
    canvas.height = pattern.height * cell;
    const ctx = canvas.getContext('2d');
    // 浅灰紫底，白色豆子在预览中也看得见；留白格不画豆子。
    ctx.fillStyle = '#E4DEEC';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let position = 0; position < pattern.indices.length; position += 1) {
      if (pattern.backgroundMask[position]) continue;
      ctx.fillStyle = palette[pattern.indices[position]].hex;
      ctx.beginPath();
      ctx.arc((position % pattern.width + 0.5) * cell, (Math.floor(position / pattern.width) + 0.5) * cell, cell * 0.46, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function refresh() {
    frame = null;
    $('#textCount').textContent = `${[...$('#textInput').value].length}/40`;
    $('#textHeightValue').textContent = `${$('#textHeight').value} 格`;
    $('#textSpacingValue').textContent = `${$('#textSpacing').value} 格`;
    $('#textLineSpacingValue').textContent = `${$('#textLineSpacing').value} 格`;
    $$('[data-text-align]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.textAlign === settings.align)));
    $$('[data-text-style]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.textStyle === settings.style)));
    $('#textStyleNote').textContent = STYLE_NOTES[settings.style];
    $$('[data-scheme]').forEach((button) => button.setAttribute('aria-checked', String(button.dataset.scheme === settings.schemeId)));
    current = build();
    const summary = $('#textSummary');
    summary.classList.toggle('error', Boolean(current.error) && !current.pending);
    $('#createTextPattern').disabled = Boolean(current.error);
    if (current.error) {
      summary.textContent = current.error;
      return;
    }
    drawPreview(current.pattern);
    const beads = current.pattern.backgroundMask.reduce((sum, value) => sum + (value ? 0 : 1), 0);
    const colors = new Set(current.pattern.indices.filter((_, position) => !current.pattern.backgroundMask[position])).size;
    const codes = [...new Set(current.pattern.indices.filter((_, position) => !current.pattern.backgroundMask[position]))]
      .map((index) => palette[index].code).join('、');
    summary.textContent = `${current.pattern.width} × ${current.pattern.height} 格 · ${number.format(beads)} 颗 · ${colors} 色（${codes}）`;
  }

  const schedule = () => { if (frame === null) frame = requestAnimationFrame(refresh); };

  ['#textInput', '#textBold', '#textHeight', '#textSpacing', '#textLineSpacing']
    .forEach((selector) => $(selector).addEventListener('input', schedule));
  $('#textFont').addEventListener('change', () => {
    failedFonts.clear();
    for (const [id, status] of stylesheets) if (status === 'failed') stylesheets.delete(id);
    syncFontControls();
    schedule();
  });
  syncFontControls();
  function applyTemplate(template) {
    $('#textInput').value = template.text;
    $('#textFont').value = template.fontId;
    // 先换成新字体的字高范围，再填模板字高，否则旧字体的范围会把它截断。
    syncFontControls();
    $('#textHeight').value = String(template.charHeight);
    syncFontControls();
    Object.assign(settings, { style: template.style, schemeId: template.schemeId, align: 'center' });
    schedule();
  }

  $('#textPatternDialog').addEventListener('click', (event) => {
    const template = event.target.closest('[data-text-template]');
    const align = event.target.closest('[data-text-align]');
    const style = event.target.closest('[data-text-style]');
    const scheme = event.target.closest('[data-scheme]');
    if (template) applyTemplate(TEXT_TEMPLATES[Number(template.dataset.textTemplate)]);
    else if (align) settings.align = align.dataset.textAlign;
    else if (style) settings.style = style.dataset.textStyle;
    else if (scheme) settings.schemeId = scheme.dataset.scheme;
    else return;
    schedule();
  });
  $('#createTextPattern').addEventListener('click', async () => {
    refresh();
    if (current?.error || !current?.pattern) return notify(current?.error || '请先输入文字', 'error');
    const button = $('#createTextPattern');
    button.disabled = true;
    try {
      await onCreate(current.pattern, current.name);
    } finally {
      button.disabled = false;
    }
  });
  return { refresh };
}
