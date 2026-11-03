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
