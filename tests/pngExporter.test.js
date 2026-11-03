import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allHighlightedExportFileName,
  highlightedExportFileName,
  highlightedExportZipEntryName,
  preferredCell,
  selectExportCell,
} from '../src/export/pngExporter.js';

test('高清导出的每格像素明显高于预览', () => {
  assert.equal(preferredCell({ width: 30 }, 'pattern'), 64);
  assert.equal(preferredCell({ width: 60 }, 'pattern'), 44);
  assert.equal(preferredCell({ width: 80 }, 'pattern'), 36);
  assert.equal(preferredCell({ width: 80 }, 'effect'), 30);
});

test('全部分色定位图会合并为一个带尺寸的 ZIP', () => {
  assert.equal(
    allHighlightedExportFileName({ width: 70, height: 104 }),
    '拼豆全部分色定位图-70x104.zip',
  );
});

test('150格及以下保持原来的制作图导出规格', () => {
  assert.equal(preferredCell({ width: 70, height: 104 }, 'pattern'), 36);
  assert.equal(preferredCell({ width: 104, height: 104 }, 'pattern'), 36);
  assert.equal(preferredCell({ width: 70, height: 150 }, 'pattern'), 36);
});

test('200×200制作图优先使用超清每格像素', () => {
  const pattern = { width: 200, height: 200 };
  assert.equal(preferredCell(pattern, 'pattern'), 48);
  assert.equal(selectExportCell(pattern, [], 'pattern', 8).cell, 48);
});

test('只有任一边超过150格才启用超清规格', () => {
  assert.equal(preferredCell({ width: 70, height: 150 }, 'pattern'), 36);
  assert.equal(preferredCell({ width: 70, height: 151 }, 'pattern'), 48);
});

test('超大图会在设备预算内降档且不超过浏览器常见边长限制', () => {
  const pattern = { width: 200, height: 300 };
  const selection = selectExportCell(pattern, new Array(60).fill({}), 'pattern', 4);
  assert.ok(selection.cell >= 24);
  assert.ok(selection.cell < preferredCell(pattern, 'pattern'));
});

test('分色定位图文件名包含色号和图纸尺寸', () => {
  assert.equal(
    highlightedExportFileName('C20', { width: 70, height: 104 }),
    '拼豆分色定位图-C20-70x104.png',
  );
});

test('镜像分色定位图使用可区分的文件名', () => {
  assert.equal(
    highlightedExportFileName('C20', { width: 70, height: 104 }, { mirrorX: true }),
    '拼豆镜像分色定位图-C20-70x104.png',
  );
});

test('批量 ZIP 将非镜像和镜像定位图分别放入独立文件夹', () => {
  const pattern = { width: 70, height: 104 };
  assert.equal(
    highlightedExportZipEntryName('C20', pattern),
    '非镜像/拼豆分色定位图-C20-70x104.png',
  );
  assert.equal(
    highlightedExportZipEntryName('C20', pattern, { mirrorX: true }),
    '镜像/拼豆镜像分色定位图-C20-70x104.png',
  );
});
