/**
 * 旅格 · 推荐管线集成测试（天气 + 节假日）
 * 验证 pipeline.js 中实时数据正确影响推荐结果
 */

const { generatePlan } = require('../src/engines/pipeline');
const { clearCache } = require('../src/services/weather/weatherService');
const assert = require('assert');

(async () => {
  let passed = 0, failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ FAIL: ${name} — ${e.message}`);
    }
  }

  console.log('\n=== 推荐管线集成测试（天气 + 节假日）===\n');

  // 清除天气缓存，确保每次测试都是真实数据
  clearCache();

  const baseInput = {
    personaProfile: {
      traits: { restoration: 0.8, nature: 0.7, culture: 0.5, food: 0.4, pace: 0.3 }
    },
    tripIntent: {
      mood: 'restore',
      interests: ['nature', 'oldtour'],
      avoid: ['crowd']
    },
    tripContext: {
      days: 4,
      budget: { comfort: 3000 },
      dates: { start: '2026-10-01', end: '2026-10-04' }
    }
  };

  await test('generatePlan 返回 realTimeData.weather', async () => {
    const plan = await generatePlan(baseInput);
    assert.ok(plan.realTimeData, '应有 realTimeData');
    assert.notStrictEqual(plan.realTimeData.weather, undefined, '应有 weather 字段');
    console.log(`    → weatherFreshness: ${plan.capability.weatherFreshness}`);
    console.log(`    → weather paths: ${Object.keys(plan.realTimeData.weather).join(', ') || 'none'}`);
  });

  await test('generatePlan 返回 realTimeData.holiday', async () => {
    const plan = await generatePlan(baseInput);
    assert.notStrictEqual(plan.realTimeData.holiday, undefined, '应有 holiday 字段');
    console.log(`    → holiday: ${JSON.stringify(plan.realTimeData.holiday)}`);
  });

  await test('节假日低友好度时 uncertainties 包含出行日期', async () => {
    const plan = await generatePlan(baseInput);
    const hasDateUncertainty = plan.uncertainties.some(u => u.field === '出行日期');
    assert.ok(hasDateUncertainty, '应有出行日期不确定性（国庆为 low 友好度）');
  });

  await test('capability.weatherFreshness 与天气可用性一致', async () => {
    const plan = await generatePlan(baseInput);
    const hasWeather = plan.realTimeData.weather && Object.keys(plan.realTimeData.weather).length > 0;
    if (hasWeather) {
      assert.ok(['live', 'cached'].includes(plan.capability.weatherFreshness), '有天气时 freshness 应为 live 或 cached');
    } else {
      assert.strictEqual(plan.capability.weatherFreshness, 'unavailable', '无天气时 freshness 应为 unavailable');
    }
  });

  await test('无日期时 holiday 为 null', async () => {
    const noDateInput = { ...baseInput, tripContext: { ...baseInput.tripContext, dates: undefined } };
    const plan = await generatePlan(noDateInput);
    assert.strictEqual(plan.realTimeData.holiday, null, '无日期时 holiday 应为 null');
  });

  await test('decisionPaths 中包含解释', async () => {
    const plan = await generatePlan(baseInput);
    assert.ok(plan.decisionPaths.length > 0, '应有决策路径');
    const path = plan.decisionPaths[0];
    assert.ok(path.reason, '应有推荐理由');
    assert.ok(path.watchOut, '应有注意事项');
    console.log(`    → ${path.city.name}: ${path.reason.slice(0, 60)}...`);
  });

  // ===== 汇总 =====
  console.log('\n=== 结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('推荐管线集成测试全部通过！天气和节假日已正确接入。');
    process.exit(0);
  }
})();
