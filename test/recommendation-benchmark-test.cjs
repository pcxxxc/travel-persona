'use strict';

const assert = require('assert');
const scenarios = require('./fixtures/youth-travel-scenarios.json');
const { plan, getData } = require('../src/services/fallbackPlanner');

const topCityCounts = new Map();

for (const scenario of scenarios) {
  const result = plan(scenario.profile);
  const repeated = plan(scenario.profile);
  const top = result.cities[0];

  assert.strictEqual(result.persona.name, scenario.expectedPersona, `${scenario.id} 人格原型偏离`);
  assert.ok(scenario.expectedTopCities.includes(top.city.name), `${scenario.id} Top 1 ${top.city.name} 不符合场景`);
  assert.ok(top.matchPercent >= 85, `${scenario.id} Top 1 贴合度过低`);
  assert.ok(top.breakdown.intent >= 0.5, `${scenario.id} 没有覆盖用户明确选择的兴趣`);
  assert.ok(top.reason.includes('明确选择了'), `${scenario.id} 解释没有引用用户主动选择`);
  assert.deepStrictEqual(
    result.cities.map(item => item.city.name),
    repeated.cities.map(item => item.city.name),
    `${scenario.id} 相同输入排序必须稳定`
  );
  assert.ok(!result.insights.join('').includes('必须成长'), `${scenario.id} 不应把旅行包装成成长义务`);

  topCityCounts.set(top.city.name, (topCityCounts.get(top.city.name) || 0) + 1);
}

assert.ok(topCityCounts.size >= 4, '不同青年动机至少应产生 4 个不同 Top 1 城市');
assert.ok(Math.max(...topCityCounts.values()) <= Math.ceil(scenarios.length / 2), '单一城市不应支配一半以上场景');

const matrixTop1 = new Map();
const matrixTop3 = new Map();
const moods = ['restore', 'escape', 'inspire', 'social', 'efficient', 'live'];
const interests = ['nature', 'oldtown', 'art', 'coffee', 'food', 'photo', 'museum', 'hidden'];
const avoidSets = [['crowd'], ['expensive'], ['longTransit']];
const budgets = [280, 450, 700];
const durations = [3, 6, 10];
let matrixTotal = 0;

for (const mood of moods) {
  for (const interest of interests) {
    for (const avoid of avoidSets) {
      for (const budget of budgets) {
        for (const days of durations) {
          const result = plan({ mood, interests: [interest], avoid, budget, days, companion: 'solo' });
          const names = result.cities.map(item => item.city.name);
          matrixTotal++;
          matrixTop1.set(names[0], (matrixTop1.get(names[0]) || 0) + 1);
          names.slice(0, 3).forEach(name => matrixTop3.set(name, (matrixTop3.get(name) || 0) + 1));
        }
      }
    }
  }
}

assert.strictEqual(getData().cities.length, 32, '本地降级链应固定使用 32 城首发记录库');
assert.ok(matrixTop1.size >= 12, '组合压测至少应产生 12 个不同 Top 1 城市');
assert.ok(Math.max(...matrixTop1.values()) <= Math.ceil(matrixTotal * 0.28), '单一城市不应占据 28% 以上组合场景的第一名');
assert.ok(matrixTop3.size >= 17, '组合压测前三名应覆盖至少 17 个城市');
assert.ok(Math.max(...matrixTop3.values()) <= Math.ceil(matrixTotal * 0.70), '单一城市不应进入 70% 以上组合场景的前三名');

console.log(`Youth recommendation benchmark passed: ${scenarios.length} curated scenarios + ${matrixTotal} matrix scenarios, ${matrixTop1.size} distinct Top 1 cities.`);
