const encoder = new TextEncoder();

/**
 * 生成每页一张整页 JPEG 的 PDF。pages: [{ jpeg, imageWidth, imageHeight, pageWidth, pageHeight }]，
 * jpeg 为 Uint8Array，页面尺寸单位为 pt（1/72 英寸）。图片铺满整页，打印时按页面实际尺寸输出。
 */
export function createImagePdf(pages) {
  if (!pages?.length) throw new Error('PDF 至少需要一页');
  const chunks = [];
  const offsets = [];
  let length = 0;
  const push = (part) => {
    const bytes = typeof part === 'string' ? encoder.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id, parts) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    parts.forEach(push);
    push('\nendobj\n');
  };

  // 对象编号：1 目录，2 页面树，之后每页依次占用 页面/内容/图片 三个编号。
  const pageId = (index) => 3 + index * 3;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Kids [${pages.map((_, index) => `${pageId(index)} 0 R`).join(' ')}] /Count ${pages.length} >>`]);
  pages.forEach((page, index) => {
    const id = pageId(index);
    const width = page.pageWidth.toFixed(2);
    const height = page.pageHeight.toFixed(2);
    const content = `q ${width} 0 0 ${height} 0 0 cm /Im0 Do Q`;
    object(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`]);
    object(id + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    object(id + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${page.imageWidth} /Height ${page.imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      page.jpeg,
      '\nendstream',
    ]);
  });

  const objectCount = 3 + pages.length * 3;
  const xrefOffset = length;
  push(`xref\n0 ${objectCount}\n0000000000 65535 f \n`);
  for (let id = 1; id < objectCount; id += 1) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}
