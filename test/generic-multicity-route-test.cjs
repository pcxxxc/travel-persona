'use strict';

const assert = require('assert');
const { buildGenericRouteExperiment, buildCandidates, selectStops } = require('../src/services/route/genericMultiCityPlanner');
const { getCoordinates } = require('../src/services/route/intercityGraph');
const { generatePlan } = require('../src/engines/pipeline');

const scenarios = [
  { origin: '广州', destination: '西安', days: 16 },
  { origin: '上海', destination: '成都', days: 18 },
  { origin: '北京', destination: '大理', days: 21 },
  { origin: '深圳', destination: '大连', days: 18 },
  { origin: '北京', destination: '西安', days: 16 },
  { origin: '北京', destination: '哈尔滨', days: 16 }
];

function build(input) {
  return buildGenericRouteExperiment({
    ...input,
    totalBudget: input.days * 520,
    hardMax: input.days * 680,
    interests: ['museum', 'food'],
    avoid: ['crowd'],
    mood: 'efficient',
    userVector: { culture: 0.8, food: 0.72, transit: 0.82, novelty: 0.65 }
  });
}

for (const scenario of scenarios) {
  const plan = build(scenario);
  assert.ok(plan, `${scenario.origin} 到 ${scenario.destination} 应生成通用多城路线`);
  assert.strictEqual(plan.routeModel, 'generic-corridor-v2');
  assert.strictEqual(plan.variants.length, 3);
  assert.ok(plan.title.includes(scenario.destination));

  const stopCounts = plan.variants.map(variant => variant.nodes.length - 2);
  assert.ok(stopCounts[0] < stopCounts[1] && stopCounts[1] <= stopCounts[2], '三版应先增加城市，再在顺路城市耗尽时减少留白');
  if (stopCounts[1] === stopCounts[2]) {
    assert.strictEqual(plan.variants[2].name, '少留白版', '无法再增加顺路城市时不得继续伪装成多城版');
  }

  for (const variant of plan.variants) {
    assert.strictEqual(variant.totalDays, scenario.days);
    assert.strictEqual(variant.activeDays + variant.bufferDays, scenario.days, '停留与机动天数必须守恒');
    assert.strictEqual(variant.nodes[0].city, scenario.origin);
    assert.strictEqual(variant.nodes.at(-1).city, scenario.origin);
    assert.strictEqual(variant.nodes.filter(node => node.city === scenario.destination).length, 1);
    assert.ok(variant.nodes.every(node => node.coordinates && Number.isFinite(node.coordinates.lat)));
    const intermediate = variant.nodes.slice(1, -1).map(node => node.city);
    assert.strictEqual(new Set(intermediate).size, intermediate.length, '中途城市不能重复');
    assert.strictEqual(variant.routeAssessment.unknownLegs, 0, '覆盖城市之间不应退回未知交通占位');
    assert.ok(
      variant.routeAssessment.estimatedLegs > 0 || variant.routeAssessment.source === 'static-baseline',
      '通用路线必须来自静态交通基线或显式标记的距离估算段'
    );
    assert.ok(variant.routeAssessment.dataConfidence < 0.75, '未在线核验前不得展示过高置信度');
    assert.ok(variant.routeAssessment.geographicDetourRatio <= 0.45, '通用路线绕行比例必须受控');
    assert.ok(variant.costRange.min > 0 && variant.costRange.max > variant.costRange.min);
  }
}

const guangzhouXian = build(scenarios[0]);
const selectedCities = new Set(guangzhouXian.variants.flatMap(variant => variant.nodes.map(node => node.city)));
assert.ok(!selectedCities.has('深圳') && !selectedCities.has('泉州'), '广州北上西安不应先向南绕行');

const northeastRoute = build({ origin: '北京', destination: '哈尔滨', days: 16 });
const northeastCities = new Set(northeastRoute.variants.flatMap(variant => variant.nodes.map(node => node.city)));
assert.ok(northeastCities.has('沈阳') && northeastCities.has('长春'), '东北长线应使用沈阳和长春走廊节点');

const centralSouthRoute = build({ origin: '南京', destination: '桂林', days: 18 });
const centralSouthCities = new Set(centralSouthRoute.variants.flatMap(variant => variant.nodes.map(node => node.city)));
assert.ok(centralSouthCities.has('南昌'), '南京到桂林长线应使用南昌减少被动留白');

const candidates = buildCandidates(
  { origin: '上海', destination: '成都', interests: ['museum'], avoid: [], userVector: {} },
  getCoordinates('上海'),
  getCoordinates('成都')
);
const selected = selectStops(candidates, Math.min(6, candidates.length));
assert.ok(selected.outbound.every((item, index, list) => index === 0 || list[index - 1].progress <= item.progress));
assert.ok(selected.returning.every((item, index, list) => index === 0 || list[index - 1].progress >= item.progress));
assert.ok(candidates.every(item => item.progress > 0.05 && item.progress < 0.95));

assert.strictEqual(buildGenericRouteExperiment({ origin: '不存在', destination: '北京', days: 16 }), null);
assert.strictEqual(buildGenericRouteExperiment({ origin: '广州', destination: '不存在', days: 16 }), null);

async function runPipelineCheck() {
  const result = await generatePlan({
    personaProfile: null,
    tripIntent: {
      mood: 'efficient',
      interests: ['museum', 'food'],
      avoid: ['crowd'],
      freeText: '',
      destination: '西安'
    },
    tripContext: {
      origin: '广州',
      destination: '西安',
      days: 16,
      budget: { comfort: 8200, hardMax: 10500 },
      season: 'autumn'
    }
  });
  assert.ok(result.multiCityPlan, '推荐管线应为非特例长线启用多城路线');
  assert.strictEqual(result.multiCityPlan.routeModel, 'generic-corridor-v2');
  assert.strictEqual(result.capability.routeOptimization, true);
  assert.ok(result.multiCityPlan.primary.nodes.some(node => node.city === '西安'));
  assert.ok(result.multiCityPlan.primary.nodes.some(node => (node.dayPlans || []).length > 0));
  console.log('Generic multi-city route tests passed.');
}

runPipelineCheck().catch(error => {
  console.error(error);
  process.exit(1);
});
