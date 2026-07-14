'use strict';

const assert = require('assert');
const { buildRouteExperiment } = require('../src/services/fallbackPlanner');

function buildPlan(days) {
  return buildRouteExperiment({
    routeGoal: 'multiCityValue',
    origin: '茂名',
    destination: '北京',
    days,
    budget: 500,
    totalBudget: days * 500,
    hardMax: days * 610
  });
}

const plan = buildPlan(18);

assert.ok(plan);
assert.strictEqual(plan.variants.length, 3);
assert.strictEqual(plan.selectedVariantId, 'balanced');

const balanced = plan.variants.find(item => item.id === 'balanced');
const steady = plan.variants.find(item => item.id === 'steady');
const explorer = plan.variants.find(item => item.id === 'explorer');

assert.ok(balanced.recommended);
assert.ok(new Set(balanced.nodes.map(item => item.city)).size <= 8);
assert.ok(new Set(explorer.nodes.map(item => item.city)).size <= 10);
assert.ok(steady.bufferDays >= balanced.bufferDays - 0.5);
assert.ok(explorer.moveCount > balanced.moveCount);
assert.strictEqual(explorer.bufferDays, 0);
assert.ok(plan.cutPlan.some(item => item.includes('广州')));
assert.ok(plan.cutPlan.every(item => !item.includes('杭州') && !item.includes('厦门')));
assert.ok(!plan.budgetModel.hotelStrategy.includes('杭州') && !plan.budgetModel.hotelStrategy.includes('厦门'));

for (const variant of plan.variants) {
  assert.strictEqual(variant.totalDays, 18);
  assert.ok(variant.nodes.some(item => item.city === '北京'));
  assert.ok(variant.costRange.min < variant.costRange.max);
  assert.ok(variant.nodes.every(item => !item.city.includes('/')));
  assert.strictEqual(variant.routeAssessment.unknownLegs, 0);
  assert.strictEqual(variant.moveCount, variant.nodes.length - 1);
}

for (const days of [14, 18, 21]) {
  const adaptivePlan = buildPlan(days);
  assert.strictEqual(adaptivePlan.selectedVariantId, 'balanced');
  for (const variant of adaptivePlan.variants) {
    assert.strictEqual(variant.totalDays, days, `${variant.id} 应适配 ${days} 天`);
    assert.strictEqual(variant.routeAssessment.unknownLegs, 0);
    assert.ok(variant.routeAssessment.transportHours.min < variant.routeAssessment.transportHours.max);
  }
}

const shortPlan = buildPlan(14);
assert.ok(shortPlan.variants.find(item => item.id === 'balanced').routeAssessment.oneNightStops <= 2);
assert.ok(shortPlan.variants.find(item => item.id === 'steady').routeAssessment.oneNightStops === 0);
assert.ok(shortPlan.redFlags.some(item => item.includes('14 天内超过 7 个住宿城市')));
assert.ok(shortPlan.redFlags.every(item => !item.includes('18 天内超过 9 个住宿城市')));

console.log('Multi-city route quality tests passed.');
