import test from 'node:test';
import assert from 'node:assert/strict';
import { createImagePdf } from '../src/export/pdfWriter.js';
import { planPrintPages } from '../src/export/printLayout.js';

const decoder = new TextDecoder('latin1');

test('PDF 结构完整：页数、交叉引用表偏移都指向对应对象', () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = createImagePdf([
    { jpeg, imageWidth: 2, imageHeight: 3, pageWidth: 595.28, pageHeight: 841.89 },
    { jpeg, imageWidth: 3, imageHeight: 2, pageWidth: 841.89, pageHeight: 595.28 },
  ]);
  const text = decoder.decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.match(text, /\/Count 2/);
  assert.match(text, /\/MediaBox \[0 0 841\.89 595\.28\]/);
  const xrefAt = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(xrefAt).startsWith('xref'));
  const offsets = [...text.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((match) => Number(match[1]));
  assert.equal(offsets.length, 8);
  offsets.forEach((offset, index) => assert.ok(text.slice(offset).startsWith(`${index + 1} 0 obj`)));
});

test('70×104 图纸用 2.6mm 迷你豆 1:1 打印需要 2 页纵向 A4', () => {
  const plan = planPrintPages({ width: 70, height: 104 }, 2.6);
  assert.equal(plan.landscape, false);
  assert.equal(plan.columnsPerPage >= 70, true, '一页宽度放得下 70 列');
  assert.equal(plan.pages.length, 2);
  assert.deepEqual(plan.pages.at(-1), { startX: 0, startY: plan.rowsPerPage, endX: 70, endY: 104 });
});

test('分页覆盖每一格且互不重叠，横宽图纸自动改用横向', () => {
  const plan = planPrintPages({ width: 120, height: 60 }, 5);
  assert.equal(plan.landscape, true);
  const covered = new Uint8Array(120 * 60);
  for (const page of plan.pages) {
    for (let y = page.startY; y < page.endY; y += 1) for (let x = page.startX; x < page.endX; x += 1) covered[y * 120 + x] += 1;
  }
  assert.ok(covered.every((count) => count === 1));
});
