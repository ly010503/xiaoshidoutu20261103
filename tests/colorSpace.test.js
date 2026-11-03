import test from 'node:test';
import assert from 'node:assert/strict';
import { deltaE76, deltaE2000, rgbToLab, rgbToXyz, xyzToLab } from '../src/color/colorSpace.js';

test('RGB/XYZ/Lab 转换得到有限数值', () => {
  const xyz=rgbToXyz(229,162,111),lab=xyzToLab(xyz.x,xyz.y,xyz.z),direct=rgbToLab(229,162,111);
  assert.ok(Number.isFinite(lab.l)&&Number.isFinite(lab.a)&&Number.isFinite(lab.b));assert.ok(Math.abs(lab.l-direct.l)<1e-9);
});
test('颜色与自身的色差为零',()=>{const lab=rgbToLab(12,34,56);assert.equal(deltaE76(lab,lab),0);assert.equal(deltaE2000(lab,lab),0)});
