// 黑体用系统字体；其余是随网站打包的开源字体（OFL），手机和电脑上效果一致，选中后才按需下载用到的字。
// pixelSize：点阵字体的字模格数，字高只能是它的整数倍，每个字模像素正好对应整颗豆。
// minHeight：低于这个字高时笔画会糊在一起。fixedWeight：只有一种字重，不提供加粗开关。
export const TEXT_FONTS = [
  {
    id: 'hei', name: '黑体（系统）', minHeight: 10,
    family: '"PingFang SC", "Microsoft YaHei", "Heiti SC", "Noto Sans CJK SC", "Source Han Sans SC", sans-serif',
    note: '使用手机或电脑自带的黑体，不用下载，不同设备字形略有差别。',
  },
  {
    id: 'pixel12', name: '像素体 12（小字最清楚）', pixelSize: 12, fixedWeight: 400, webFont: true,
    family: '"Fusion Pixel 12px Proportional SC", sans-serif',
    note: '每个字模像素正好是一颗豆，笔画不粘连，适合名字牌、数字牌。字高为 12 的倍数。',
  },
  {
    id: 'pixel8', name: '像素体 8（迷你字）', pixelSize: 8, fixedWeight: 400, webFont: true,
    family: '"Fusion Pixel 8px Proportional SC", sans-serif',
    note: '最小 8 颗豆一个字，适合钥匙扣等小挂件；笔画较简化，生僻字可能看不清。字高为 8 的倍数。',
  },
  {
    id: 'huangyou', name: '黄油体（粗圆可爱）', minHeight: 14, webFont: true,
    family: '"ZCOOL QingKe HuangYou", sans-serif',
    note: '笔画粗、转角圆，配云朵字最好看；字高至少 14 格。',
  },
  {
    id: 'kuaile', name: '快乐体（手写童趣）', minHeight: 16, webFont: true,
    family: '"ZCOOL KuaiLe", sans-serif',
    note: '手写感强，适合祝福语；笔画偏细，字高至少 16 格。',
  },
  {
    id: 'wenkai', name: '文楷（楷书）', minHeight: 20, fixedWeight: 700, webFont: true,
    family: '"LXGW WenKai", serif',
    note: '楷书笔画有粗细变化，字高至少 20 格才清楚，适合大字摆件。',
  },
];

export function getTextFont(fontId) {
  return TEXT_FONTS.find((font) => font.id === fontId) || TEXT_FONTS[0];
}

/** 用于 document.fonts.load / check 的字体描述。 */
export function getTextFontSpec(fontId, bold = true) {
  const font = getTextFont(fontId);
  return `${font.fixedWeight ?? (bold ? 800 : 500)} 100px ${font.family}`;
}

const SUPERSAMPLE = 8;
const CJK = /[㐀-鿿豈-﫿]/;

/**
 * 把文字画到超采样画布上，再按每格的墨迹覆盖率（0～1）缩回豆子网格。
 * charHeight、letterSpacing、lineSpacing 的单位都是“格”。
 */
export function renderTextCoverage({
  text,
  charHeight,
  fontId = 'hei',
  bold = true,
  letterSpacing = 1,
  lineSpacing = 2,
  align = 'center',
}) {
  const lines = text.split('\n').map((line) => line.trimEnd());
  while (lines.length > 1 && !lines.at(-1)) lines.pop();
  const textFont = getTextFont(fontId);
  const { family, pixelSize } = textFont;
  const weight = textFont.fixedWeight ?? (bold ? 800 : 500);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const sample = CJK.test(text) ? '国' : 'H';
  let fontSize;
  // 点阵字体：字模像素放大成整数个格子，字宽和基线都对齐格子边界，转出来没有半格毛边。
  const unit = pixelSize ? Math.max(1, Math.round(charHeight / pixelSize)) * SUPERSAMPLE : 0;
  const snap = (value) => (unit ? Math.round(value / unit) * unit : value);
  if (pixelSize) {
    fontSize = pixelSize * unit;
  } else {
    // 以实际墨迹高度换算字号：中文按“国”、纯英文数字按“H”测量。
    ctx.font = `${weight} 100px ${family}`;
    const probe = ctx.measureText(sample);
    const probeHeight = Math.max(1, probe.actualBoundingBoxAscent + probe.actualBoundingBoxDescent);
    fontSize = (100 * charHeight * SUPERSAMPLE) / probeHeight;
  }
  const font = `${weight} ${fontSize}px ${family}`;
  ctx.font = font;
  const ascent = snap(ctx.measureText(sample).actualBoundingBoxAscent);
  const charWidth = (char) => snap(ctx.measureText(char).width);
  const spacing = letterSpacing * SUPERSAMPLE;
  const lineWidths = lines.map((line) => [...line].reduce((sum, char) => sum + charWidth(char), 0)
    + Math.max(0, [...line].length - 1) * spacing);
  const advance = (charHeight + lineSpacing) * SUPERSAMPLE;
  const padding = 2 * SUPERSAMPLE;
  const contentWidth = Math.max(1, ...lineWidths);
  const roundUp = (value) => Math.ceil(value / SUPERSAMPLE) * SUPERSAMPLE;
  canvas.width = roundUp(contentWidth + padding * 2);
  canvas.height = roundUp(advance * lines.length + charHeight * SUPERSAMPLE * 0.4 + padding * 2);

  ctx.font = font;
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, row) => {
    const offset = align === 'left' ? 0 : align === 'right' ? contentWidth - lineWidths[row] : (contentWidth - lineWidths[row]) / 2;
    let x = padding + (pixelSize ? Math.round(offset / SUPERSAMPLE) * SUPERSAMPLE : offset);
    const y = padding + ascent + row * advance;
    for (const char of line) {
      ctx.fillText(char, x, y);
      x += charWidth(char) + spacing;
    }
  });

  const width = canvas.width / SUPERSAMPLE;
  const height = canvas.height / SUPERSAMPLE;
  const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const coverage = new Float32Array(width * height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      coverage[Math.floor(y / SUPERSAMPLE) * width + Math.floor(x / SUPERSAMPLE)] += alpha[(y * canvas.width + x) * 4 + 3] / 255;
    }
  }
  const cellArea = SUPERSAMPLE * SUPERSAMPLE;
  for (let index = 0; index < coverage.length; index += 1) coverage[index] /= cellArea;
  return { coverage, width, height };
}
