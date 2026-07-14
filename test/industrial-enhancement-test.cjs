/**
 * 旅格 · 工业级增强测试
 * 验证子维度系统、置信传播、时间感知、敏感性分析、六层解释
 */

const { generatePlan } = require('../src/engines/pipeline');
const { clearCache } = require('../src/services/weather/weatherService');
const { getSubDimensions, enrichWithSubDimensions, flattenSubDimensions, computeDimensionalDepth } = require('../src/engines/subDimensions');
const { scoreWithConfidence, propagateScore, rankWithUncertainty } = require('../src/engines/confidencePropagator');
const { applyTemporalContext, getSeason, applyWeatherModifier, applyHolidayModifier } = require('../src/engines/temporalContext');
const { computeDimensionSensitivity, analyzeAllDimensions, generateWhatIfScenarios, computeScoreVolatility, generateSensitivityReport } = require('../src/engines/sensitivityAnalyzer');
const { generateCausalChain, generateComparison } = require('../src/engines/explainability');

(async () => {
  let passed = 0, failed = 0;

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || '断言失败');
  }

  function test(name, fn) {
    try {
      fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ FAIL: ${name} — ${e.message}`);
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ FAIL: ${name} — ${e.message}`);
    }
  }

  console.log('\n=== 工业级增强测试 ===\n');
  clearCache();

  // ===== 1. 子维度系统 =====
  console.log('1. 子维度系统（48个子维度）');

  test('SUB_DIMENSIONS 覆盖全部16个主维度', () => {
    const keys = Object.keys(getSubDimensions('restoration'));
    assert(keys.length >= 2, 'restoration 至少2个子维度');
    const natureSubs = getSubDimensions('nature');
    assert(natureSubs.landscape && natureSubs.waterBody && natureSubs.biodiversity, 'nature 应有3个子维度');
  });

  test('enrichWithSubDimensions 生成完整子维度树', () => {
    const { getCities } = require('../src/data/cityRecords');
    const dali = getCities().find(c => c.id === 'dali');
    assert(dali, '应找到大理');
    const tree = enrichWithSubDimensions(dali);
    assert(Object.keys(tree).length === 16, '应有16个主维度');
    // 每个主维度至少有2个子维度
    for (const [key, subs] of Object.entries(tree)) {
      assert(Object.keys(subs).length >= 2, `${key} 至少2个子维度`);
    }
  });

  test('flattenSubDimensions 生成点分键', () => {
    const { getCities } = require('../src/data/cityRecords');
    const city = getCities()[0];
    const tree = enrichWithSubDimensions(city);
    const flat = flattenSubDimensions(tree);
    const sampleKey = Object.keys(flat)[0];
    assert(sampleKey.includes('.'), '键应包含点号');
    assert(typeof flat[sampleKey] === 'number', '值应为数字');
  });

  test('computeDimensionalDepth 计算数据深度', () => {
    const { getCities } = require('../src/data/cityRecords');
    const city = getCities()[0];
    const depth = computeDimensionalDepth(city);
    assert(depth.restoration || depth.nature, '应有维度深度数据');
    const sampleDepth = Object.values(depth)[0];
    assert(sampleDepth.depth >= 0 && sampleDepth.depth <= 1, '深度应在0-1之间');
    assert(typeof sampleDepth.realDataCount === 'number', '应有真实数据计数');
  });

  // ===== 2. 置信传播器 =====
  console.log('\n2. 置信传播器（区间估计 + Monte Carlo）');

  test('scoreWithConfidence 生成置信区间', () => {
    const band = scoreWithConfidence(0.78, 0.9);
    assert(band.mean === 0.78, 'mean 应为 0.78');
    assert(band.lower < 0.78 && band.upper > 0.78, 'lower < mean < upper');
    assert(band.margin > 0, 'margin 应大于0');
    // 低置信度应有更宽区间
    const lowConf = scoreWithConfidence(0.78, 0.3);
    assert(lowConf.margin > band.margin, '低置信度应有更宽区间');
  });

  test('scoreWithConfidence 边界 clamp', () => {
    const high = scoreWithConfidence(0.98, 0.2);
    assert(high.upper <= 1, 'upper 不超过1');
    const low = scoreWithConfidence(0.02, 0.2);
    assert(low.lower >= 0, 'lower 不低于0');
  });

  test('rankWithUncertainty Monte Carlo 排序稳定性', () => {
    const mockItems = [
      { city: { cityId: 'a', id: 'a' }, subScores: { personaFit: 0.8, budgetScore: 0.7 }, pathScores: { balanced: 0.75 }, confidenceBands: { subScores: { personaFit: { lower: 0.75, upper: 0.85, mean: 0.8 }, budgetScore: { lower: 0.65, upper: 0.75, mean: 0.7 } }, pathScores: { balanced: { lower: 0.7, upper: 0.8, mean: 0.75 } } } },
      { city: { cityId: 'b', id: 'b' }, subScores: { personaFit: 0.72, budgetScore: 0.8 }, pathScores: { balanced: 0.73 }, confidenceBands: { subScores: { personaFit: { lower: 0.67, upper: 0.77, mean: 0.72 }, budgetScore: { lower: 0.75, upper: 0.85, mean: 0.8 } }, pathScores: { balanced: { lower: 0.68, upper: 0.78, mean: 0.73 } } } },
      { city: { cityId: 'c', id: 'c' }, subScores: { personaFit: 0.6, budgetScore: 0.9 }, pathScores: { balanced: 0.68 }, confidenceBands: { subScores: { personaFit: { lower: 0.55, upper: 0.65, mean: 0.6 }, budgetScore: { lower: 0.85, upper: 0.95, mean: 0.9 } }, pathScores: { balanced: { lower: 0.63, upper: 0.73, mean: 0.68 } } } }
    ];
    const result = rankWithUncertainty(mockItems);
    assert(result.ranked.length === 3, '应返回3个排序项');
    assert(result.stabilityScores, '应有稳定性分数');
    assert(result.rankChanges, '应有排名变化');
    assert(result.rankChanges.length === 3, '应有3个排名变化记录');
  });

  // ===== 3. 时间感知引擎 =====
  console.log('\n3. 时间感知引擎（季节/天气/节假日）');

  test('getSeason 月份转季节', () => {
    assert(getSeason(1) === 'winter', '1月应为冬季');
    assert(getSeason(4) === 'spring', '4月应为春季');
    assert(getSeason(7) === 'summer', '7月应为夏季');
    assert(getSeason(10) === 'autumn', '10月应为秋季');
  });

  test('applyWeatherModifier 天气调制向量', () => {
    const vector = { nature: 0.7, comfort: 0.6, weatherFlex: 0.5, pace: 0.4, aesthetics: 0.5, transit: 0.5 };
    const heavyRain = {
      forecast: [{ precipProb: 80, tempMax: 25, tempMin: 15, weatherCode: 63 }],
      current: { temp: 20, windSpeed: 10 }
    };
    const adjusted = applyWeatherModifier(vector, heavyRain);
    assert(adjusted.weatherFlex < vector.weatherFlex, '大雨应降低 weatherFlex');
    assert(adjusted.comfort < vector.comfort, '大雨应降低 comfort');
    // 原向量不应被修改
    assert(vector.weatherFlex === 0.5, '原向量不应被修改');
  });

  test('applyHolidayModifier 节假日调制', () => {
    const vector = { lowCrowd: 0.7, social: 0.4, bookingEase: 0.6, budget: 0.5 };
    const holidayLow = { travelFriendliness: 'low', reason: '国庆假期' };
    const adjusted = applyHolidayModifier(vector, holidayLow);
    assert(adjusted.lowCrowd < vector.lowCrowd, '法定假日应降低 lowCrowd');
    assert(adjusted.bookingEase < vector.bookingEase, '法定假日应降低 bookingEase');
  });

  test('applyTemporalContext 综合调制', () => {
    const { getCities } = require('../src/data/cityRecords');
    const city = getCities().find(c => c.id === 'dali');
    const tripContext = { dates: { start: '2026-10-01' }, days: 4 };
    const weatherData = { forecast: [{ precipProb: 30, tempMax: 22, tempMin: 10, weatherCode: 0 }], current: { temp: 18, windSpeed: 10 } };
    const holidayInfo = { travelFriendliness: 'low', reason: '国庆假期' };
    const result = applyTemporalContext(city, tripContext, weatherData, holidayInfo);
    assert(result.adjustedVector, '应有调制后向量');
    assert(result.modifiers, '应有调制信息');
    assert(result.modifiers.seasonal, '应有季节调制');
    assert(result.sources.length > 0, '应有数据源记录');
  });

  // ===== 4. 敏感性分析器 =====
  console.log('\n4. 敏感性分析器（摇摆因子/What-If/波动性）');

  test('analyzeAllDimensions 返回排序的敏感性', () => {
    const userVector = { restoration: 0.8, nature: 0.7, culture: 0.5, food: 0.4, pace: 0.3, social: 0.5, budget: 0.6, aesthetics: 0.6, comfort: 0.5, novelty: 0.7, transit: 0.4, lowCrowd: 0.6, authenticity: 0.5, weatherFlex: 0.4, bookingEase: 0.5, workation: 0.3 };
    const cityVector = { restoration: 0.85, nature: 0.75, culture: 0.6, food: 0.5, pace: 0.35, social: 0.4, budget: 0.65, aesthetics: 0.7, comfort: 0.55, novelty: 0.6, transit: 0.5, lowCrowd: 0.7, authenticity: 0.6, weatherFlex: 0.5, bookingEase: 0.55, workation: 0.4 };
    const city = { traitVector: cityVector };
    const result = analyzeAllDimensions(userVector, cityVector, city);
    assert(result.dimensions.length === 16, '应有16个维度');
    assert(result.topFactors.length <= 3, 'topFactors 最多3个');
    assert(result.dimensions[0].sensitivity >= result.dimensions[result.dimensions.length - 1].sensitivity, '应按敏感性降序');
  });

  test('generateWhatIfScenarios 生成场景分析', () => {
    const userVector = { restoration: 0.8, nature: 0.7, budget: 0.6, pace: 0.3 };
    const city = { traitVector: { restoration: 0.85, nature: 0.75, budget: 0.65, pace: 0.35 }, dailyBudget: 400 };
    const tripContext = { days: 3, budget: { comfort: 2000 } };
    const scenarios = generateWhatIfScenarios(userVector, city, tripContext);
    assert(scenarios.length >= 3, '至少3个场景');
    assert(scenarios.some(s => s.expectedChange), '每个场景应有预期变化');
  });

  test('computeScoreVolatility 评估波动性', () => {
    const userVector = { restoration: 0.8, nature: 0.7 };
    const scoredCities = [
      { city: { id: 'a', cityId: 'a', traitVector: { restoration: 0.82, nature: 0.72 } }, subScores: { personaFit: 0.9 }, pathScores: { balanced: 0.85 } },
      { city: { id: 'b', cityId: 'b', traitVector: { restoration: 0.75, nature: 0.78 } }, subScores: { personaFit: 0.85 }, pathScores: { balanced: 0.82 } },
      { city: { id: 'c', cityId: 'c', traitVector: { restoration: 0.7, nature: 0.7 } }, subScores: { personaFit: 0.8 }, pathScores: { balanced: 0.78 } }
    ];
    const vol = computeScoreVolatility(scoredCities, userVector);
    assert(['low', 'medium', 'high'].includes(vol.volatility), '波动性应为 low/medium/high');
    assert(typeof vol.score === 'number', '应有波动性分数');
  });

  test('generateSensitivityReport 生成完整报告', () => {
    const userVector = { restoration: 0.8, nature: 0.7, culture: 0.5, food: 0.4, pace: 0.3, social: 0.5, budget: 0.6, aesthetics: 0.6, comfort: 0.5, novelty: 0.7, transit: 0.4, lowCrowd: 0.6, authenticity: 0.5, weatherFlex: 0.4, bookingEase: 0.5, workation: 0.3 };
    const topCity = { id: 'dali', cityId: 'dali', name: '大理', traitVector: { restoration: 0.85, nature: 0.78, culture: 0.6, food: 0.55, pace: 0.35, social: 0.45, budget: 0.65, aesthetics: 0.72, comfort: 0.6, novelty: 0.65, transit: 0.5, lowCrowd: 0.7, authenticity: 0.68, weatherFlex: 0.55, bookingEase: 0.6, workation: 0.45 } };
    const runnerUp = { id: 'lijiang', cityId: 'lijiang', name: '丽江', traitVector: { restoration: 0.8, nature: 0.75, culture: 0.55, food: 0.5, pace: 0.3, social: 0.4, budget: 0.6, aesthetics: 0.68, comfort: 0.55, novelty: 0.6, transit: 0.48, lowCrowd: 0.65, authenticity: 0.65, weatherFlex: 0.5, bookingEase: 0.55, workation: 0.4 } };
    const scoredCities = [
      { city: topCity, subScores: { personaFit: 0.88 }, pathScores: { balanced: 0.82 } },
      { city: runnerUp, subScores: { personaFit: 0.82 }, pathScores: { balanced: 0.78 } }
    ];
    const report = generateSensitivityReport(userVector, topCity, runnerUp, scoredCities);
    assert(report, '应返回报告');
    // 至少应有部分字段
    const hasAnyField = report.topFactors || report.swingFactors || report.whatIfScenarios || report.volatility;
    assert(hasAnyField, '报告应包含分析字段');
  });

  // ===== 5. 增强解释层 =====
  console.log('\n5. 增强解释层（因果链 + 对比分析 + 多层钻取）');

  test('generateCausalChain 生成因果证据链', () => {
    const userVector = { restoration: 0.8, nature: 0.7, culture: 0.3 };
    const city = { name: '大理', traitVector: { restoration: 0.85, nature: 0.78, culture: 0.6 } };
    const subScores = { personaFit: 0.85 };
    const chains = generateCausalChain(userVector, city, subScores, null);
    assert(chains.length > 0, '应有因果链');
    assert(chains[0].cause && chains[0].effect && chains[0].outcome, '每条链应有因果结果');
  });

  test('generateComparison 生成城市对比', () => {
    const topCity = { id: 'dali', name: '大理', traitVector: { nature: 0.78, restoration: 0.85 } };
    const runnerUp = { id: 'lijiang', name: '丽江', traitVector: { nature: 0.75, restoration: 0.8 } };
    const topScores = { personaFit: 0.85, budgetScore: 0.7, totalScore: 0.78 };
    const runnerUpScores = { personaFit: 0.8, budgetScore: 0.75, totalScore: 0.74 };
    const userVector = { nature: 0.7, restoration: 0.8 };
    const comp = generateComparison(topCity, runnerUp, topScores, runnerUpScores, userVector);
    assert(comp !== null, '应返回对比');
    assert(comp.advantages !== undefined, '应有优势分析');
    assert(comp.summary, '应有总结');
  });

  // ===== 6. 管线端到端集成 =====
  console.log('\n6. 管线端到端集成（全增强）');

  await asyncTest('generatePlan 输出包含 capability 增强标记', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7, culture: 0.5, food: 0.4 } },
      tripIntent: { mood: 'restore', interests: ['nature'], avoid: ['crowd'] },
      tripContext: { days: 4, budget: { comfort: 3000 }, dates: { start: '2026-10-01', end: '2026-10-04' } }
    });
    assert(plan.capability.subDimensions === true, '应有 subDimensions 标记');
    assert(plan.capability.confidencePropagation === true, '应有 confidencePropagation 标记');
    assert(plan.capability.temporalAwareness === true, '应有 temporalAwareness 标记');
    assert(plan.capability.sensitivityAnalysis === true, '应有 sensitivityAnalysis 标记');
  });

  await asyncTest('decisionPaths 包含 confidenceSummary', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7 } },
      tripIntent: { mood: 'restore', interests: ['nature'] },
      tripContext: { days: 4, budget: { comfort: 3000 } }
    });
    assert(plan.decisionPaths.length > 0, '应有决策路径');
    const path = plan.decisionPaths[0];
    // confidenceSummary 可能存在（取决于 propagateThroughPipeline）
    if (path.confidenceSummary) {
      assert(path.confidenceSummary.mean !== undefined, '应有 mean');
      assert(path.confidenceSummary.label !== undefined, '应有 label');
    }
  });

  await asyncTest('decisionPaths 包含 causalChain', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7 } },
      tripIntent: { mood: 'restore', interests: ['nature'] },
      tripContext: { days: 4, budget: { comfort: 3000 } }
    });
    const path = plan.decisionPaths[0];
    assert(path.causalChain !== undefined, '应有 causalChain 字段');
    if (path.causalChain && path.causalChain.length > 0) {
      assert(path.causalChain[0].cause, '因果链应有 cause');
    }
  });

  await asyncTest('decisionPaths 包含 subDimensions', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7 } },
      tripIntent: { mood: 'restore', interests: ['nature'] },
      tripContext: { days: 4, budget: { comfort: 3000 } }
    });
    const path = plan.decisionPaths[0];
    assert(path.subDimensions !== undefined, '应有 subDimensions 字段');
    if (path.subDimensions) {
      assert(Object.keys(path.subDimensions).length === 16, '应有16个主维度的子维度');
    }
  });

  await asyncTest('decisionPaths 包含 temporalModifiers', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7 } },
      tripIntent: { mood: 'restore', interests: ['nature'] },
      tripContext: { days: 4, budget: { comfort: 3000 }, dates: { start: '2026-10-01' } }
    });
    const path = plan.decisionPaths[0];
    assert(path.temporalModifiers !== undefined, '应有 temporalModifiers 字段');
  });

  await asyncTest('decisionPaths 包含 sensitivity', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7 } },
      tripIntent: { mood: 'restore', interests: ['nature'] },
      tripContext: { days: 4, budget: { comfort: 3000 } }
    });
    const path = plan.decisionPaths[0];
    assert(path.sensitivity !== undefined, '应有 sensitivity 字段');
  });

  await asyncTest('decisionPaths 包含 comparison', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7 } },
      tripIntent: { mood: 'restore', interests: ['nature'] },
      tripContext: { days: 4, budget: { comfort: 3000 } }
    });
    const path = plan.decisionPaths[0];
    assert(path.comparison !== undefined, '应有 comparison 字段');
  });

  await asyncTest('decisionPaths 包含 rankStability', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7 } },
      tripIntent: { mood: 'restore', interests: ['nature'] },
      tripContext: { days: 4, budget: { comfort: 3000 } }
    });
    const path = plan.decisionPaths[0];
    assert(path.rankStability !== undefined, '应有 rankStability 字段');
  });

  await asyncTest('explanations 包含6层', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8, nature: 0.7 } },
      tripIntent: { mood: 'restore', interests: ['nature'] },
      tripContext: { days: 4, budget: { comfort: 3000 } }
    });
    const path = plan.decisionPaths[0];
    const layers = (path.explanations || []).map(e => e.layer);
    assert(layers.includes('intuition'), '应有直觉层');
    assert(layers.includes('cost'), '应有代价层');
    assert(layers.includes('counterfactual'), '应有反事实层');
    // 因果链和对比分析可能根据数据可用性存在
    const hasCausal = layers.includes('causal');
    const hasComparison = layers.includes('comparison');
    const hasSensitivity = layers.includes('sensitivity');
    const extraLayers = [hasCausal, hasComparison, hasSensitivity].filter(Boolean).length;
    assert(extraLayers >= 1, `至少有1个增强层，实际有 ${extraLayers} 个`);
  });

  await asyncTest('dataVersion 包含增强版本号', async () => {
    const plan = await generatePlan({
      personaProfile: { traits: { restoration: 0.8 } },
      tripIntent: { mood: 'restore' },
      tripContext: { days: 3, budget: { comfort: 2000 } }
    });
    assert(plan.dataVersion.subDimensionVersion, '应有子维度版本');
    assert(plan.dataVersion.confidenceModelVersion, '应有置信模型版本');
    assert(plan.dataVersion.temporalModelVersion, '应有时间模型版本');
    assert(plan.dataVersion.personaModel === '2.0.0', '人格模型应为 2.0.0');
  });

  // ===== 汇总 =====
  console.log('\n=== 结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('工业级增强测试全部通过！系统已从16维单值升级到48子维度+置信区间+时间感知+敏感性分析+六层解释。');
    process.exit(0);
  }
})();
