import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COPYRIGHT_NOTICE,
  CREATOR_WATERMARK,
  MIRROR_BADGE_TEXT,
} from '../src/canvas/patternPainter.js';

test('导出图使用创作者水印和防盗声明', () => {
  assert.equal(CREATOR_WATERMARK, '@小石豆图');
  assert.equal(COPYRIGHT_NOTICE, '原创作品 · 禁止盗用');
  assert.equal(MIRROR_BADGE_TEXT, '镜像图');
});
