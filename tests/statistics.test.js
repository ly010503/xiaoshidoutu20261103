import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateStatistics, statisticsTotal } from '../src/pattern/statistics.js';
test('统计总数严格等于网格格子数',()=>{const palette=[{code:'A',name:'甲',hex:'#000',rgb:[0,0,0]},{code:'B',name:'乙',hex:'#fff',rgb:[255,255,255]}];const indices=new Uint8Array(80*120);indices.fill(1,0,1536);const stats=calculateStatistics(indices,palette);assert.equal(statisticsTotal(stats),9600);assert.equal(stats[0].count,8064)});
