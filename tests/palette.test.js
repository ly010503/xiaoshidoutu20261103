import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('MARD 标准色卡包含 221 个唯一且合法的屏幕近似色', async () => {
  const url=new URL('../src/data/palettes/mard-221.json',import.meta.url);
  const palette=JSON.parse(await readFile(url,'utf8'));
  assert.equal(palette.length,221);
  assert.equal(new Set(palette.map((item)=>item.code)).size,221);
  assert.deepEqual(
    Object.fromEntries(['A','B','C','D','E','F','G','H','M'].map((series) => [
      series,
      palette.filter((item) => item.code.startsWith(series)).length,
    ])),
    { A:26, B:32, C:29, D:26, E:24, F:25, G:21, H:23, M:15 },
  );
  for(const color of palette){
    assert.match(color.hex,/^#[0-9A-F]{6}$/i);
    assert.match(color.code,/^[A-HM]\d+$/);
  }
});
