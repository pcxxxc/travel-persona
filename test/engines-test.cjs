/**
 * 旅格 Travel Persona · Phase 1 引擎单元测试
 */

const assert = require('assert');
const {
  buildFinalVector,
  extractHardConstraints,
  TRAIT_KEYS
} = require('../src/engines/personaEngine');
const { applyConstraintFilter } = require('../src/engines/constraintFilter');
const { scoreCity, scoreCities, computeTotalScore, PATH_WEIGHTS } = require('../src/engines/multiObjectiveScorer');
const { optimize: paretoOptimize } = require('../src/engines/paretoOptimizer');
const { rerank: mmrRerank } = require('../src/engines/mmrReranker');
const { explainPath } = require('../src/engines/explainability');
const { getCities } = require('../src/data/cityRecords');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ FAIL: ${name}`);
    console.log(`    ${e.message}`);
  }
}

console.log('\n=== Phase 1 引擎单元测试 ===\n');

// --- Persona Engine ---
console.log('1. Persona Engine');

test('buildFinalVector 返回16维向量', () => {
  const result = buildFinalVector(null, { mood: 'restore' }, { days: 5 });
  assert.strictEqual(Object.keys(result.vector).length, 16, '应有16维');
  TRAIT_KEYS.forEach(key => {
    assert(typeof result.vector[key] === 'number', `${key} 应为数字`);
    assert(result.vector[key] >= 0 && result.vector[key] <= 1, `${key} 应在 [0,1] 范围内`);
  });
});

test('buildFinalVector 记录三层来源', () => {
  const result = buildFinalVector(null, { mood: 'social' }, { days: 5 });
  assert(result.sourceMap, '应有 sourceMap');
  assert(result.sourceMap.social.includes('tripIntent'), 'social 应标记为 tripIntent 来源');
});

test('extractHardConstraints 提取目的地约束', () => {
  const constraints = extractHardConstraints({ destination: '北京', days: 5, budget: { hardMax: 3000 } });
  assert(constraints.some(c => c.type === 'mustReach' && c.city === '北京'), '应有 mustReach 约束');
  assert(constraints.some(c => c.type === 'budgetCeiling'), '应有 budgetCeiling 约束');
});

// --- Constraint Filter ---
console.log('\n2. Constraint Filter');

const mockCities = [
  { id: 'c1', name: '测试城1', minDays: 1, maxDays: 10, traitVector: {} },
  { id: 'c2', name: '测试城2', minDays: 5, maxDays: 15, traitVector: {} },
  { id: 'c3', name: '北京', minDays: 3, maxDays: 20, traitVector: {} }
];

test('daysRange 过滤正确', () => {
  const result = applyConstraintFilter(mockCities, [{ type: 'daysRange', max: 3 }]);
  assert.strictEqual(result.passed.length, 2, '2个城市应通过（minDays<=3）');
  assert.strictEqual(result.filtered.length, 1, '1个城市应被过滤');
});

test('mustReach 过滤正确', () => {
  const result = applyConstraintFilter(mockCities, [{ type: 'mustReach', city: '北京' }]);
  assert.strictEqual(result.passed.length, 1, '只有北京应通过');
  assert.strictEqual(result.passed[0].name, '北京');
});

// --- Multi-Objective Scorer ---
console.log('\n3. Multi-Objective Scorer');

const testCity = {
  id: 'dali', name: '大理', province: '云南',
  traitVector: {
    restoration: 0.88, nature: 0.85, culture: 0.72, food: 0.78,
    pace: 0.82, social: 0.45, budget: 0.68, aesthetics: 0.75,
    comfort: 0.70, novelty: 0.65, transit: 0.55, lowCrowd: 0.72,
    authenticity: 0.80, weatherFlex: 0.60, bookingEase: 0.65, workation: 0.50
  },
  dailyBudget: 450, minDays: 3, maxDays: 10,
  riskFlags: [], pois: [], poiDiversity: 0.7,
  intelligence: {
    transportEase: 0.6, costStability: 0.65, poiDepth: 0.7,
    weatherBackup: 0.58, bookingFriction: 0.5, crowdRisk: 0.55,
    routeValue: 0.55, growthSignal: 0.62
  }
};

const testUserVector = {
  restoration: 0.75, nature: 0.80, culture: 0.60, food: 0.55,
  pace: 0.70, social: 0.40, budget: 0.65, aesthetics: 0.70,
  comfort: 0.65, novelty: 0.55, transit: 0.50, lowCrowd: 0.75,
  authenticity: 0.70, weatherFlex: 0.60, bookingEase: 0.55, workation: 0.45
};

test('scoreCity 返回11个子分数', () => {
  const scores = scoreCity(testUserVector, { mood: 'restore' }, { days: 5 }, testCity);
  assert.strictEqual(Object.keys(scores).length, 11, '应有11个子分数');
  assert(typeof scores.personaFit === 'number', 'personaFit 应为数字');
  assert(scores.personaFit >= 0 && scores.personaFit <= 1, 'personaFit 应在 [0,1]');
});

test('三条路径权重总和为1', () => {
  Object.entries(PATH_WEIGHTS).forEach(([path, weights]) => {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    assert(Math.abs(sum - 1.0) < 0.001, `${path} 权重总和应为1，实际为${sum}`);
  });
});

test('computeTotalScore 计算正确', () => {
  const subScores = scoreCity(testUserVector, { mood: 'restore' }, { days: 5 }, testCity);
  const total = computeTotalScore(subScores, 'personaBest');
  assert(typeof total === 'number', '综合分应为数字');
  assert(total > 0 && total < 1, '综合分应在 (0,1)');
});

// --- Pareto Optimizer ---
console.log('\n4. Pareto Optimizer');

const mockScored = [
  { city: testCity, subScores: { personaFit: 0.9, budgetScore: 0.3, resilienceScore: 0.7 }, pathScores: {} },
  { city: testCity, subScores: { personaFit: 0.7, budgetScore: 0.8, resilienceScore: 0.6 }, pathScores: {} },
  { city: testCity, subScores: { personaFit: 0.5, budgetScore: 0.5, resilienceScore: 0.5 }, pathScores: {} },
  { city: testCity, subScores: { personaFit: 0.85, budgetScore: 0.75, resilienceScore: 0.65 }, pathScores: {} }
];

test('paretoOptimize 返回Pareto前沿', () => {
  const result = paretoOptimize(mockScored, ['personaFit', 'budgetScore', 'resilienceScore']);
  assert(result.paretoFront.length > 0, 'Pareto前沿不应为空');
  assert(result.paretoFront.length < mockScored.length, 'Pareto前沿应小于总候选数');
});

// --- MMR Reranker ---
console.log('\n5. MMR Reranker');

const mockCandidates = [
  { city: { ...testCity, id: 'c1', traitVector: testCity.traitVector }, pathScores: { personaBest: 0.9 }, subScores: { personaFit: 0.9 } },
  { city: { ...testCity, id: 'c2', traitVector: { ...testCity.traitVector, nature: 0.3 } }, pathScores: { personaBest: 0.85 }, subScores: { personaFit: 0.85 } },
  { city: { ...testCity, id: 'c3', traitVector: { ...testCity.traitVector, culture: 0.3 } }, pathScores: { personaBest: 0.8 }, subScores: { personaFit: 0.8 } }
];

test('mmrRerank 返回指定数量', () => {
  const result = mmrRerank(mockCandidates, 'personaBest', 2);
  assert.strictEqual(result.length, 2, '应返回2个');
});

// --- Explainability ---
console.log('\n6. Explainability');

test('explainPath 返回完整结构', () => {
  const subScores = scoreCity(testUserVector, { mood: 'restore' }, { days: 5 }, testCity);
  const result = explainPath(testCity, subScores, 'personaBest', testUserVector, { days: 5 });
  assert(result.city, '应有 city');
  assert(result.reason, '应有 reason');
  assert(result.watchOut, '应有 watchOut');
  assert(result.counterfactual, '应有 counterfactual');
  assert(result.breakdown, '应有 breakdown');
  assert(Array.isArray(result.explanations), 'explanations 应为数组');
  assert(Array.isArray(result.uncertainties), 'uncertainties 应为数组');
});

// --- City Records ---
console.log('\n7. City Records');

test('getCities 返回城市列表', () => {
  const cities = getCities();
  assert(cities.length > 0, '应有城市数据');
  assert(cities[0].traitVector, '城市应有 traitVector');
  assert.strictEqual(Object.keys(cities[0].traitVector).length, 16, '应有16维');
});

test('城市数据包含 intelligence', () => {
  const cities = getCities();
  assert(cities[0].intelligence, '城市应有 intelligence');
  assert(typeof cities[0].intelligence.transportEase === 'number', '应有 transportEase');
});

// --- Summary ---
console.log('\n=== 测试结果 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}\n`);

if (failed > 0) {
  process.exit(1);
} else {
  console.log('所有引擎单元测试通过！');
  process.exit(0);
}
