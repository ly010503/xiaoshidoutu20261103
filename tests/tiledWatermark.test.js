import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_TILED_WATERMARK,
  getTiledWatermarkLayout,
  normalizeWatermarkText,
} from '../src/canvas/tiledWatermark.js';

test('铺满水印使用指定的默认文案并清理用户输入', () => {
  assert.equal(DEFAULT_TILED_WATERMARK, '@小红薯 小石豆图');
  assert.equal(normalizeWatermarkText('  @小红薯   小石豆图  '), '@小红薯 小石豆图');
  assert.equal(normalizeWatermarkText(''), DEFAULT_TILED_WATERMARK);
});

test('铺满水印间距足够稀疏，不遮挡图纸使用', () => {
  const layout = getTiledWatermarkLayout(2100, 3120, 26, 210);
  assert.ok(layout.stepX >= 288);
  assert.ok(layout.stepY >= 117);
  assert.ok(layout.diagonal > 3700);
});
