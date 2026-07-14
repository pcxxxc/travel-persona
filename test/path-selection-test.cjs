'use strict';

const assert = require('assert');
const { chooseInitialPathType, chooseLowestCostVariant } = require('../public-app/pathSelection');

const strongPersona = [
  { type: 'personaBest', personaFit: 0.86, totalScore: 0.78, costEstimate: { totalMax: 2975 } },
  { type: 'balanced', personaFit: 0.68, totalScore: 0.765, costEstimate: { totalMax: 2888 } },
  { type: 'lowCost', personaFit: 0.75, totalScore: 0.787, costEstimate: { totalMax: 2625 } }
];

assert.strictEqual(chooseInitialPathType(strongPersona, { hardMax: 4000 }), 'personaBest');
assert.strictEqual(chooseInitialPathType(strongPersona, { hardMax: 2800 }), 'balanced', '人格本选超出硬上限时应默认现实平衡');
assert.strictEqual(chooseInitialPathType(strongPersona, { hardMax: 4000, routeGoal: 'multiCityValue' }), 'balanced');
assert.strictEqual(chooseInitialPathType([
  { type: 'personaBest', personaFit: 0.74, totalScore: 0.77, costEstimate: { totalMax: 2500 } },
  { type: 'balanced', personaFit: 0.71, totalScore: 0.79, costEstimate: { totalMax: 2400 } }
], { hardMax: 3000 }), 'balanced', '人格差异很小时应默认现实平衡');
assert.strictEqual(chooseInitialPathType([{ type: 'lowCost' }], {}), 'lowCost');

assert.strictEqual(chooseLowestCostVariant([
  { id: 'balanced', moveCount: 6, costRange: { min: 6200, max: 7600 } },
  { id: 'steady', moveCount: 5, costRange: { min: 6500, max: 7200 } },
  { id: 'explorer', moveCount: 9, costRange: { min: 5900, max: 8100 } }
]), 'steady', '最低成本标识应优先比较保守的最高估算，不能只看诱人的最低价');

assert.strictEqual(chooseLowestCostVariant([
  { id: 'more-moves', moveCount: 8, costRange: { min: 5000, max: 7000 } },
  { id: 'fewer-moves', moveCount: 5, costRange: { min: 5000, max: 7000 } }
]), 'fewer-moves', '同价时应优先更少换城的方案');

assert.strictEqual(chooseLowestCostVariant([{ id: 'unknown' }]), null);

console.log('Initial path selection policy tests passed.');
