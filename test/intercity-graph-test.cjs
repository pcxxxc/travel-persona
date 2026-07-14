'use strict';

const assert = require('assert');
const { getConnection, assessIntercityRoute } = require('../src/services/route/intercityGraph');

assert.ok(getConnection('广州', '长沙'));
assert.ok(getConnection('北京', '天津'));
assert.ok(getConnection('南京', '扬州'));
assert.ok(getConnection('福州', '泉州'));
assert.ok(getConnection('西宁', '青海湖'));
assert.ok(getConnection('北京', '哈尔滨'));
assert.ok(getConnection('北京', '沈阳'));
assert.ok(getConnection('沈阳', '长春'));
assert.ok(getConnection('长春', '哈尔滨'));
assert.ok(getConnection('南京', '南昌'));
assert.ok(getConnection('南昌', '桂林'));
assert.ok(getConnection('长沙市', '广州市'), '城市别名和反向查询应命中同一条连接');
assert.strictEqual(getConnection('广州', '长沙').fareCny.min, getConnection('长沙', '广州').fareCny.min);

const assessment = assessIntercityRoute([
  { city: '茂名', stay: 0.5 },
  { city: '广州', stay: 1 },
  { city: '长沙', stay: 2 },
  { city: '武汉', stay: 1.5 },
  { city: '洛阳', stay: 2 },
  { city: '北京', stay: 4 },
  { city: '南京', stay: 2 },
  { city: '泉州', stay: 2.5 },
  { city: '茂名', stay: 0.5 }
], { origin: '茂名', totalDays: 18, bufferDays: 2, totalBudget: 9000, hardMax: 11000 });

assert.strictEqual(assessment.moveCount, 8);
assert.strictEqual(assessment.unknownLegs, 0, '正式演示路线不应包含未知交通段');
assert.ok(assessment.transportHours.min > 20 && assessment.transportHours.max < 50);
assert.ok(assessment.transportFare.min < assessment.transportFare.max);
assert.ok(assessment.costRange.min > assessment.transportFare.min, '总价必须包含城市停留成本');
assert.ok(assessment.costRange.min < assessment.costRange.max);
assert.ok(assessment.dataConfidence >= 0.55);
assert.ok(assessment.scores.overall >= 60 && assessment.scores.overall <= 100);

const unknown = assessIntercityRoute([
  { city: '茂名', stay: 0.5 },
  { city: '不存在的城市', stay: 2 }
], { origin: '茂名', totalDays: 3, bufferDays: 0, totalBudget: 1500 });
assert.strictEqual(unknown.unknownLegs, 1);
assert.ok(unknown.dataConfidence < assessment.dataConfidence);

console.log('Intercity graph and route assessment tests passed.');
