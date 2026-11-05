import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzePatternGrid,
  detectPatternOccupiedCells,
  samplePatternGrid,
} from '../src/image/patternGridDetector.js';

function createSyntheticGrid({ columns = 18, rows = 22, cell = 8, headerRows = true } = {}) {
  const marginX = 17;
  const marginY = 29;
  const coordinateRows = headerRows ? 2 : 0;
  const width = marginX * 2 + columns * cell + 1;
  const height = marginY * 2 + (rows + coordinateRows) * cell + 1;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const setPixel = (x, y, color) => {
    const offset = (y * width + x) * 4;
    data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2]; data[offset + 3] = 255;
  };
  const totalRows = rows + coordinateRows;
  for (let row = 0; row < totalRows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const header = headerRows && (row === 0 || row === totalRows - 1);
      const contentRow = row - (headerRows ? 1 : 0);
      const color = header
        ? [118, 142, 210]
        : ((column + Math.max(0, contentRow)) % 5 === 0 ? [42, 74, 125] : [232, 184, 198]);
      for (let y = marginY + row * cell + 1; y < marginY + (row + 1) * cell; y += 1) {
        for (let x = marginX + column * cell + 1; x < marginX + (column + 1) * cell; x += 1) setPixel(x, y, color);
      }
      setPixel(marginX + column * cell + Math.floor(cell / 2), marginY + row * cell + Math.floor(cell / 2), [55, 55, 55]);
    }
  }
  for (let column = 0; column <= columns; column += 1) {
    const x = marginX + column * cell;
    for (let y = marginY; y <= marginY + totalRows * cell; y += 1) setPixel(x, y, [92, 92, 96]);
  }
  for (let row = 0; row <= totalRows; row += 1) {
    const y = marginY + row * cell;
    for (let x = marginX; x <= marginX + columns * cell; x += 1) setPixel(x, y, [92, 92, 96]);
  }
  return { data, width, height };
}

// 模拟网站自己导出的制作图：白纸、浅色细网格线、每 5 格加粗、外框、标题、坐标数字和底部图例，
// 豆子只占中间一部分，四周是大片只有网格线的留白。
function createExportedSheet({ columns, rows, pitch, subject = { left: 0.2, right: 0.8, top: 0.05, bottom: 0.95 } }) {
  const gridWidth = columns * pitch;
  const gridHeight = rows * pitch;
  const padding = Math.round(pitch * 2.85);
  const header = Math.round(pitch * 6.5);
  const legend = Math.round(pitch * 8);
  const width = Math.round(gridWidth + padding * 2);
  const height = Math.round(header + gridHeight + legend);
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const fill = (x0, y0, x1, y1, color) => {
    for (let y = Math.max(0, Math.round(y0)); y < Math.min(height, Math.round(y1)); y += 1) {
      for (let x = Math.max(0, Math.round(x0)); x < Math.min(width, Math.round(x1)); x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2];
      }
    }
  };
  const gridX = padding;
  const gridY = header;
  // 与 patternPainter 一致：加粗线和外框随格子变粗，半宽分别约为格距的 1/14 和 1/12。
  const guide = Math.max(1, Math.round(pitch / 14));
  const frame = Math.max(1, Math.round(pitch / 12));
  const palette = [[20, 20, 22], [244, 214, 170], [250, 205, 180], [120, 128, 124]];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const nx = (column + 0.5) / columns;
      const ny = (row + 0.5) / rows;
      const centerX = (subject.left + subject.right) / 2;
      const radius = (subject.right - subject.left) / 2 * (0.55 + 0.45 * Math.sin(ny * 9) ** 2);
      if (ny < subject.top || ny > subject.bottom || Math.abs(nx - centerX) > radius) continue;
      const x = gridX + column * pitch;
      const y = gridY + row * pitch;
      const color = palette[(column * 3 + row * 5) % palette.length];
      fill(x, y, x + pitch, y + pitch, color);
      const ink = color[0] < 90 ? [255, 255, 255] : [30, 30, 30];
      fill(x + pitch * 0.3, y + pitch * 0.4, x + pitch * 0.7, y + pitch * 0.6, ink);
    }
  }
  for (let column = 0; column <= columns; column += 1) {
    const x = gridX + column * pitch;
    fill(x, gridY, x + 1, gridY + gridHeight, [201, 205, 213]);
    if (column % 5 === 0) fill(x - guide, gridY, x + guide, gridY + gridHeight, [137, 130, 168]);
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = gridY + row * pitch;
    fill(gridX, y, gridX + gridWidth, y + 1, [201, 205, 213]);
    if (row % 5 === 0) fill(gridX, y - guide, gridX + gridWidth, y + guide, [137, 130, 168]);
  }
  fill(gridX - frame, gridY - frame, gridX + gridWidth + frame, gridY + frame, [112, 106, 136]);
  fill(gridX - frame, gridY + gridHeight - frame, gridX + gridWidth + frame, gridY + gridHeight + frame, [112, 106, 136]);
  fill(gridX - frame, gridY - frame, gridX + frame, gridY + gridHeight + frame, [112, 106, 136]);
  fill(gridX + gridWidth - frame, gridY - frame, gridX + gridWidth + frame, gridY + gridHeight + frame, [112, 106, 136]);
  // 坐标数字：每 5 格一个小色块，分布在上下左右的留白里。
  for (let column = 4; column < columns; column += 5) {
    const x = gridX + (column + 0.5) * pitch;
    fill(x - 3, gridY - pitch * 0.8, x + 3, gridY - pitch * 0.3, [90, 90, 96]);
    fill(x - 3, gridY + gridHeight + pitch * 0.3, x + 3, gridY + gridHeight + pitch * 0.8, [90, 90, 96]);
  }
  for (let row = 4; row < rows; row += 5) {
    const y = gridY + (row + 0.5) * pitch;
    fill(gridX - pitch * 0.9, y - 3, gridX - pitch * 0.3, y + 3, [90, 90, 96]);
    fill(gridX + gridWidth + pitch * 0.3, y - 3, gridX + gridWidth + pitch * 0.9, y + 3, [90, 90, 96]);
  }
  // 标题和底部图例色卡。
  fill(pitch, pitch, pitch * 12, pitch * 3, [70, 66, 80]);
  for (let card = 0; card < 8; card += 1) {
    const x = gridX + card * pitch * 4.3;
    fill(x, gridY + gridHeight + pitch * 2, x + pitch * 4, gridY + gridHeight + pitch * 4.2, palette[card % palette.length]);
  }
  return { data, width, height };
}

for (const { columns, rows, pitch, subject } of [
  { columns: 70, rows: 104, pitch: 13.15 },
  { columns: 70, rows: 104, pitch: 14.8 },
  { columns: 70, rows: 104, pitch: 17.3 },
  { columns: 52, rows: 52, pitch: 21.4 },
  { columns: 104, rows: 104, pitch: 16.2 },
  { columns: 29, rows: 29, pitch: 36 },
  { columns: 29, rows: 29, pitch: 41.3 },
  { columns: 40, rows: 60, pitch: 27.5 },
  { columns: 70, rows: 104, pitch: 13.15, subject: { left: 0.3, right: 0.7, top: 0.55, bottom: 0.95 } },
]) {
  test(`导出的 ${columns}×${rows} 制作图（格距 ${pitch}）四周留白时仍框住整张网格`, () => {
    const imageData = createExportedSheet({ columns, rows, pitch, subject });
    const detection = analyzePatternGrid(imageData);
    assert.equal(detection.width, columns);
    assert.equal(detection.height, rows);
    const gridX = Math.round(pitch * 2.85);
    const gridY = Math.round(pitch * 6.5);
    assert.ok(Math.abs(detection.bounds.left - gridX) < pitch * 0.5, `left=${detection.bounds.left}`);
    assert.ok(Math.abs(detection.bounds.top - gridY) < pitch * 0.5, `top=${detection.bounds.top}`);
    assert.ok(Math.abs(detection.bounds.right - (gridX + columns * pitch)) < pitch * 0.5, `right=${detection.bounds.right}`);
    assert.ok(Math.abs(detection.bounds.bottom - (gridY + rows * pitch)) < pitch * 0.5, `bottom=${detection.bounds.bottom}`);
  });
}

test('检测带上下坐标栏的规则网格并返回内容格数', () => {
  const imageData = createSyntheticGrid();
  const detection = analyzePatternGrid(imageData);
  assert.equal(detection.width, 18);
  assert.equal(detection.height, 22);
  assert.deepEqual(detection.removedCoordinateRows, { top: 1, bottom: 1 });
  assert.ok(detection.confidence > 0.6);
});

test('逐格取色会避开网格线和格内深色小字', () => {
  const imageData = createSyntheticGrid({ columns: 12, rows: 14, headerRows: false });
  const detection = analyzePatternGrid(imageData);
  const pixels = samplePatternGrid(imageData, detection);
  assert.equal(pixels.length, 12 * 14 * 4);
  assert.deepEqual([...pixels.slice(0, 3)], [42, 74, 125]);
  assert.deepEqual([...pixels.slice(4, 7)], [232, 184, 198]);
});

test('恢复现成图纸时会从格角取底色并避开大号色号文字', () => {
  const imageData = createSyntheticGrid({ columns: 12, rows: 14, headerRows: false });
  const detection = analyzePatternGrid(imageData);
  const { data, width } = imageData;
  const marginX = 17, marginY = 29;
  for (let y = marginY + 2; y <= marginY + 5; y += 1) {
    for (let x = marginX + 2; x <= marginX + 5; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 15; data[offset + 1] = 15; data[offset + 2] = 15;
    }
  }
  const pixels = samplePatternGrid(imageData, detection, 12, 14, { avoidCenterText: true });
  assert.deepEqual([...pixels.slice(0, 3)], [42, 74, 125]);
});

test('按纸张底色与格内文字区分空格和白色豆子', () => {
  const width = 32, height = 32, cell = 8;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const imageData = { width, height, data };
  const detection = { width: 4, height: 4, bounds: { left: 0, top: 0, right: width, bottom: height } };
  // 左上空格放一块低对比水印，不能误判为豆子。
  for (let y = 3; y <= 4; y += 1) for (let x = 3; x <= 4; x += 1) {
    const offset = (y * width + x) * 4;
    data[offset] = 220; data[offset + 1] = 220; data[offset + 2] = 220;
  }
  // 中间格同样是白底，但中央的高对比色号文字表示它是一颗白色豆子。
  for (let y = cell + 2; y <= cell + 5; y += 1) for (let x = cell + 2; x <= cell + 5; x += 1) {
    const offset = (y * width + x) * 4;
    data[offset] = 25; data[offset + 1] = 25; data[offset + 2] = 25;
  }
  const pixels = samplePatternGrid(imageData, detection, 4, 4, { avoidCenterText: true });
  const occupied = detectPatternOccupiedCells(imageData, detection, 4, 4, { pixels });
  assert.equal(occupied[0], 0, '低对比水印所在空格应保持留白');
  assert.equal(occupied[5], 1, '带高对比色号文字的白色豆子应保留');
});

test('裁到只剩网格、细线被浅色豆子盖住时仍框住整张网格', () => {
  // 没有留白外边距；中间一段的豆子和网格线亮度相同，细线几乎看不见，只有每 5 格的加粗线清晰。
  const columns = 70, rows = 104, pitch = 17;
  const width = columns * pitch + 1, height = rows * pitch + 1;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const line = [201, 205, 213];
  const set = (x, y, color) => {
    const offset = (y * width + x) * 4;
    data[offset] = color[0]; data[offset + 1] = color[1]; data[offset + 2] = color[2];
  };
  for (let x = 0; x < width; x += 1) {
    const column = Math.floor(x / pitch);
    const onBead = column >= 24 && column < 46;
    for (let y = 0; y < height; y += 1) {
      const row = Math.floor(y / pitch);
      const hidden = onBead && row % 3 !== 0; // 三分之二的行上，这一列的豆子盖住了细线
      if (x % pitch === 0) set(x, y, hidden && x % (pitch * 5) !== 0 ? [204, 204, 204] : line);
      else if (y % pitch === 0) set(x, y, line);
      else if (onBead) set(x, y, [204, 204, 204]);
    }
  }
  const detection = analyzePatternGrid({ data, width, height });
  assert.equal(detection.width, columns);
  assert.equal(detection.height, rows);
});

test('带色号的图纸里，被水印染色的空格不算豆子', () => {
  const width = 96, height = 96, cell = 8;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const imageData = { width, height, data };
  const detection = { width: 12, height: 12, bounds: { left: 0, top: 0, right: width, bottom: height } };
  const paintCell = (column, row, fill, ink) => {
    for (let y = row * cell; y < (row + 1) * cell; y += 1) for (let x = column * cell; x < (column + 1) * cell; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = fill[0]; data[offset + 1] = fill[1]; data[offset + 2] = fill[2];
    }
    if (!ink) return;
    for (let y = row * cell + 3; y <= row * cell + 4; y += 1) for (let x = column * cell + 2; x <= column * cell + 5; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = ink[0]; data[offset + 1] = ink[1]; data[offset + 2] = ink[2];
    }
  };
  // 中间 3×3 共 9 颗带色号的深色豆，足以判定这是带色号的图纸。
  for (let row = 4; row < 7; row += 1) for (let column = 4; column < 7; column += 1) paintCell(column, row, [40, 40, 44], [255, 255, 255]);
  paintCell(8, 8, [236, 233, 241]); // 水印染色的空格：浅紫、无色号
  paintCell(9, 8, [236, 233, 241], [25, 25, 25]); // 同样的浅色，但印着色号：真正的浅色豆
  const occupied = detectPatternOccupiedCells(imageData, detection, 12, 12);
  assert.equal(occupied[8 * 12 + 8], 0, '水印染色的空格应保持留白');
  assert.equal(occupied[8 * 12 + 9], 1, '印着色号的浅色豆应保留');
  assert.equal(occupied[5 * 12 + 5], 1);
});

test('没有色号的图纸，浅色格仍按底色算作豆子', () => {
  const width = 96, height = 96, cell = 8;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const imageData = { width, height, data };
  const detection = { width: 12, height: 12, bounds: { left: 0, top: 0, right: width, bottom: height } };
  const paintCell = (column, row, fill) => {
    for (let y = row * cell; y < (row + 1) * cell; y += 1) for (let x = column * cell; x < (column + 1) * cell; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = fill[0]; data[offset + 1] = fill[1]; data[offset + 2] = fill[2];
    }
  };
  for (let row = 4; row < 7; row += 1) for (let column = 4; column < 7; column += 1) paintCell(column, row, [40, 40, 44]);
  paintCell(8, 8, [225, 225, 228]);
  const occupied = detectPatternOccupiedCells(imageData, detection, 12, 12);
  assert.equal(occupied[8 * 12 + 8], 1);
});

test('不会把隔行加粗的网格线误认为双倍格子', () => {
  const imageData = createSyntheticGrid({ columns: 32, rows: 36, cell: 7, headerRows: false });
  const { data, width } = imageData;
  const marginX = 17;
  const marginY = 29;
  for (let column = 0; column <= 32; column += 2) {
    const x = marginX + column * 7;
    for (let y = marginY; y <= marginY + 36 * 7; y += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 10; data[offset + 1] = 10; data[offset + 2] = 10;
    }
  }
  for (let row = 0; row <= 36; row += 2) {
    const y = marginY + row * 7;
    for (let x = marginX; x <= marginX + 32 * 7; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = 10; data[offset + 1] = 10; data[offset + 2] = 10;
    }
  }
  const detection = analyzePatternGrid(imageData);
  assert.equal(detection.width, 32);
  assert.equal(detection.height, 36);
});

test('会排除左右两侧成对的彩色坐标栏', () => {
  const imageData = createSyntheticGrid({ columns: 20, rows: 20, cell: 8, headerRows: false });
  const { data, width } = imageData;
  const marginX = 17;
  const marginY = 29;
  for (const column of [0, 19]) {
    for (let y = marginY + 1; y < marginY + 20 * 8; y += 1) {
      for (let x = marginX + column * 8 + 1; x < marginX + (column + 1) * 8; x += 1) {
        const offset = (y * width + x) * 4;
        data[offset] = 118; data[offset + 1] = 142; data[offset + 2] = 210;
      }
    }
  }
  const detection = analyzePatternGrid(imageData);
  assert.equal(detection.width, 18);
  assert.deepEqual(detection.removedCoordinateColumns, { left: 1, right: 1 });
});
