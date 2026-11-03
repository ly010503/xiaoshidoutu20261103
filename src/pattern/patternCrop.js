function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label}必须是正整数`);
  return value;
}

function splitCentered(amount) {
  return {
    leading: Math.ceil(amount / 2),
    trailing: Math.floor(amount / 2),
  };
}

function copyGrid(
  source,
  sourceWidth,
  targetWidth,
  targetHeight,
  copyWidth,
  copyHeight,
  sourceLeft,
  sourceTop,
  targetLeft,
  targetTop,
  channels = 1,
  fillValue = 0,
) {
  const output = new source.constructor(targetWidth * targetHeight * channels);
  output.fill(fillValue);
  for (let row = 0; row < copyHeight; row += 1) {
    const sourceStart = ((sourceTop + row) * sourceWidth + sourceLeft) * channels;
    const sourceEnd = sourceStart + copyWidth * channels;
    const targetStart = ((targetTop + row) * targetWidth + targetLeft) * channels;
    output.set(source.subarray(sourceStart, sourceEnd), targetStart);
  }
  return output;
}

function isByteArray(value) {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray;
}

export function getPatternResizeAdjustments(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  requirePositiveInteger(sourceWidth, '原图纸宽度');
  requirePositiveInteger(sourceHeight, '原图纸高度');
  requirePositiveInteger(targetWidth, '目标宽度');
  requirePositiveInteger(targetHeight, '目标高度');

  const horizontalCrop = splitCentered(Math.max(0, sourceWidth - targetWidth));
  const verticalCrop = splitCentered(Math.max(0, sourceHeight - targetHeight));
  const horizontalExpand = splitCentered(Math.max(0, targetWidth - sourceWidth));
  const verticalExpand = splitCentered(Math.max(0, targetHeight - sourceHeight));
  return {
    cropLeft: horizontalCrop.leading,
    cropRight: horizontalCrop.trailing,
    cropTop: verticalCrop.leading,
    cropBottom: verticalCrop.trailing,
    expandLeft: horizontalExpand.leading,
    expandRight: horizontalExpand.trailing,
    expandTop: verticalExpand.leading,
    expandBottom: verticalExpand.trailing,
  };
}

export function resizePattern(pattern, targetWidth, targetHeight, fillColorIndex) {
  const sourceWidth = requirePositiveInteger(pattern?.width, '原图纸宽度');
  const sourceHeight = requirePositiveInteger(pattern?.height, '原图纸高度');
  requirePositiveInteger(targetWidth, '目标宽度');
  requirePositiveInteger(targetHeight, '目标高度');
  if (!(pattern.indices instanceof Uint8Array) || pattern.indices.length !== sourceWidth * sourceHeight) {
    throw new Error('图纸颜色数据长度不正确');
  }
  if (targetWidth === sourceWidth && targetHeight === sourceHeight) {
    throw new Error('目标尺寸需要与当前图纸不同');
  }

  const adjustments = getPatternResizeAdjustments(sourceWidth, sourceHeight, targetWidth, targetHeight);
  const isExpanding = targetWidth > sourceWidth || targetHeight > sourceHeight;
  if (isExpanding && (!Number.isInteger(fillColorIndex) || fillColorIndex < 0 || fillColorIndex > 255)) {
    throw new Error('扩展图纸需要有效的空白颜色');
  }

  const copyWidth = Math.min(sourceWidth, targetWidth);
  const copyHeight = Math.min(sourceHeight, targetHeight);
  const copyOptions = [
    sourceWidth,
    targetWidth,
    targetHeight,
    copyWidth,
    copyHeight,
    adjustments.cropLeft,
    adjustments.cropTop,
    adjustments.expandLeft,
    adjustments.expandTop,
  ];
  const resized = {
    ...pattern,
    width: targetWidth,
    height: targetHeight,
    indices: copyGrid(
      pattern.indices,
      ...copyOptions,
      1,
      isExpanding ? fillColorIndex : 0,
    ),
  };

  if (pattern.sourcePixels != null) {
    if (!isByteArray(pattern.sourcePixels)
      || pattern.sourcePixels.length !== sourceWidth * sourceHeight * 4) {
      throw new Error('图纸原始采样数据长度不正确');
    }
    resized.sourcePixels = copyGrid(
      pattern.sourcePixels,
      ...copyOptions,
      4,
      isExpanding ? 255 : 0,
    );
  }

  if (pattern.backgroundMask != null) {
    if (!(pattern.backgroundMask instanceof Uint8Array)
      || pattern.backgroundMask.length !== sourceWidth * sourceHeight) {
      throw new Error('图纸背景数据长度不正确');
    }
    resized.backgroundMask = copyGrid(
      pattern.backgroundMask,
      ...copyOptions,
      1,
      isExpanding ? 1 : 0,
    );
  }

  return { pattern: resized, adjustments };
}
