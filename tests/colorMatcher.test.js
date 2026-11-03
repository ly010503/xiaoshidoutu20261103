import test from 'node:test';
import assert from 'node:assert/strict';
import { findNearestPaletteColor, preparePalette } from '../src/color/colorMatcher.js';
test('精确 RGB 能匹配自身色卡',()=>{const palette=preparePalette([{code:'A',name:'黑',hex:'#000000',rgb:[0,0,0]},{code:'B',name:'白',hex:'#FFFFFF',rgb:[255,255,255]}]);assert.equal(findNearestPaletteColor([250,250,250],palette).code,'B')});
