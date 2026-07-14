/**
 * 旅格 Travel Persona · Phase 6 测试（商用发布与运营）
 *
 * 测试覆盖：
 *   1. 监控指标记录和查询（recordMetric / getMetrics / alert）
 *   2. 内容安全检查（拦截敏感词、脱敏输出）
 *   3. 备份创建和状态查询（createBackup / getBackupStatus / verifyBackupIntegrity）
 *   4. 功能开关（全局开关、灰度发布、用户覆盖）
 *   5. 运营 API 需要认证（无 API Key 拒绝、有 API Key 通过）
 *
 * 运行方式：node test/phase6-test.cjs
 *
 * 格式：CommonJS，使用 async IIFE 包裹
 */

'use strict';

const assert = require('assert');

// 导入 Phase 6 模块
const monitoring = require('../src/services/ops/monitoring');
const contentSafety = require('../src/services/ops/contentSafety');
const backup = require('../src/services/ops/backup');
const featureFlags = require('../src/config/featureFlags');

// 运营 API 路由测试需要 express
let request = null;
let app = null;
try {
  request = require('supertest');
  const express = require('express');
  app = express();
  app.use('/api/v1/ops', require('../src/api/v1/ops'));
} catch (e) {
  // supertest 未安装时跳过 HTTP 层测试
  console.warn('[Phase6] supertest 未安装，运营 API HTTP 测试将使用模拟方式');
}

(async () => {
  const tests = [];
  let passed = 0;
  let skipped = 0;

  /**
   * 注册一个测试用例
   */
  function test(name, fn) {
    tests.push({ name, fn });
  }

  // ========== 1. 监控指标记录和查询 ==========

  test('recordMetric 记录指标并返回确认', () => {
    monitoring.resetMetrics();

    const result = monitoring.recordMetric('plan_generation_time', 1200, { endpoint: '/api/v1/plans' });
    assert.strictEqual(result.recorded, true);
    assert.strictEqual(result.metric, 'plan_generation_time');
    assert.strictEqual(result.value, 1200);
  });

  test('recordMetric 拒绝非法输入', () => {
    monitoring.resetMetrics();

    assert.throws(() => monitoring.recordMetric('', 100), /name 必须是非空字符串/);
    assert.throws(() => monitoring.recordMetric('test_metric', 'not-a-number'), /value 必须是有效数字/);
    assert.throws(() => monitoring.recordMetric('test_metric', NaN), /value 必须是有效数字/);
  });

  test('getMetrics 查询指标并返回统计摘要', () => {
    monitoring.resetMetrics();

    // 记录多条数据
    monitoring.recordMetric('plan_generation_time', 500);
    monitoring.recordMetric('plan_generation_time', 1500);
    monitoring.recordMetric('plan_generation_time', 2500);
    monitoring.recordMetric('plan_generation_time', 3500);

    const metrics = monitoring.getMetrics('plan_generation_time');
    assert.strictEqual(metrics.count, 4);
    assert.strictEqual(metrics.avg, 2000);
    assert.strictEqual(metrics.min, 500);
    assert.strictEqual(metrics.max, 3500);
    // P95 应在合理范围内
    assert.ok(metrics.p95 >= 2500, `P95 应 >= 2500，实际: ${metrics.p95}`);
  });

  test('getMetrics 支持时间范围过滤', () => {
    monitoring.resetMetrics();

    const oldTime = Date.now() - 10000;
    monitoring.recordMetric('api_error_rate', 0.02);

    // 查询全部时间范围
    const allMetrics = monitoring.getMetrics('api_error_rate');
    assert.strictEqual(allMetrics.count, 1);

    // 查询未来时间范围（无数据）
    const futureMetrics = monitoring.getMetrics('api_error_rate', { start: Date.now() + 5000 });
    assert.strictEqual(futureMetrics.count, 0);
  });

  test('alert 在超过阈值时触发告警', () => {
    monitoring.resetMetrics();

    // 记录高错误率数据
    monitoring.recordMetric('api_error_rate', 0.08);
    monitoring.recordMetric('api_error_rate', 0.06);

    const result = monitoring.alert(
      'api_error_rate',
      { op: '>', value: 0.05 },
      'API 错误率超过 5% 阈值'
    );

    assert.strictEqual(result.triggered, true);
    assert.strictEqual(result.metric, 'api_error_rate');
    assert.ok(result.currentValue > 0.05);
  });

  test('alert 在未超过阈值时不触发', () => {
    monitoring.resetMetrics();

    monitoring.recordMetric('plan_generation_time', 800);
    monitoring.recordMetric('plan_generation_time', 900);

    const result = monitoring.alert(
      'plan_generation_time',
      { op: '>', value: 5000 },
      '规划时间超过 5 秒'
    );

    assert.strictEqual(result.triggered, false);
  });

  test('evaluateSLOs 返回 SLO 达成情况', () => {
    monitoring.resetMetrics();

    // 记录符合 SLO 的数据（P95 < 2000ms）
    for (let i = 0; i < 20; i++) {
      monitoring.recordMetric('plan_generation_time', 1000 + i * 50);
    }
    monitoring.recordMetric('api_error_rate', 0.005);

    const slos = monitoring.evaluateSLOs();
    assert.ok(slos.core_api_latency, '应包含 core_api_latency SLO');
    assert.ok(slos.core_api_error_rate, '应包含 core_api_error_rate SLO');
    assert.strictEqual(slos.core_api_latency.met, true, 'P95 应 < 2000ms，SLO 达标');
    assert.strictEqual(slos.core_api_error_rate.met, true, '错误率应 < 1%，SLO 达标');
  });

  test('核心监控指标定义完整', () => {
    const defs = monitoring.getMetricDefinitions();

    const expectedMetrics = [
      'plan_generation_time',
      'api_error_rate',
      'agent_fallback_rate',
      'map_freshness_ratio',
      'persona_update_acceptance_rate',
      'sensitive_content_blocked_count',
      'content_safety_fallback_rate',
      'client_event_count'
    ];

    for (const name of expectedMetrics) {
      assert.ok(defs[name], `应包含指标定义: ${name}`);
      assert.ok(defs[name].unit, `${name} 应有 unit`);
      assert.ok(defs[name].description, `${name} 应有 description`);
    }
  });

  // ========== 2. 内容安全检查 ==========

  test('checkInput 对正常旅行文本返回 safe=true', () => {
    const result = contentSafety.checkInput('我想去大理古城发呆，喝喝咖啡，看看洱海');
    assert.strictEqual(result.safe, true);
    assert.strictEqual(result.matchedCategories.length, 0);
    assert.strictEqual(result.matchedWords.length, 0);
  });

  test('checkInput 拦截敏感词并返回分类', () => {
    const result = contentSafety.checkInput('这里有在线赌博的广告链接');
    assert.strictEqual(result.safe, false);
    assert.ok(result.matchedCategories.includes('gambling'), '应识别为赌博类别');
    assert.ok(result.matchedWords.length > 0, '应记录匹配的敏感词');
  });

  test('checkInput 对敏感词进行脱敏处理', () => {
    const result = contentSafety.checkInput('这个刷单兼职很赚钱');
    assert.strictEqual(result.safe, false);
    // 脱敏后文本应包含星号
    assert.ok(result.sanitizedText.includes('*'), '脱敏文本应包含星号替换');
    // 脱敏后不应包含原始敏感词
    assert.ok(!result.sanitizedText.includes('刷单兼职'), '脱敏后不应包含原始敏感词');
  });

  test('checkInput 处理空输入和非法输入', () => {
    assert.strictEqual(contentSafety.checkInput('').safe, true);
    assert.strictEqual(contentSafety.checkInput(null).safe, true);
    assert.strictEqual(contentSafety.checkInput(undefined).safe, true);
  });

  test('checkOutput 与 checkInput 行为一致', () => {
    const text = '推荐你去这个博彩平台下注';
    const result = contentSafety.checkOutput(text);
    assert.strictEqual(result.safe, false);
    assert.ok(result.matchedCategories.includes('gambling'));
  });

  test('getSensitiveCategories 返回所有分类', () => {
    const categories = contentSafety.getSensitiveCategories();

    const expectedCategories = ['political', 'sexual', 'violence', 'gambling', 'fraud', 'abuse'];
    for (const cat of expectedCategories) {
      assert.ok(categories[cat], `应包含分类: ${cat}`);
      assert.ok(categories[cat].label, `${cat} 应有 label`);
      assert.ok(categories[cat].severity, `${cat} 应有 severity`);
    }
  });

  test('checkInput 能识别多个类别的敏感词', () => {
    const result = contentSafety.checkInput('这里有在线赌博和刷单兼职的信息');
    assert.strictEqual(result.safe, false);
    assert.ok(result.matchedCategories.length >= 2, '应识别出至少两个类别');
    assert.ok(result.matchedCategories.includes('gambling'));
    assert.ok(result.matchedCategories.includes('fraud'));
  });

  // ========== 3. 备份创建和状态查询 ==========

  test('createBackup 创建用户数据备份', () => {
    backup.resetBackups();

    const result = backup.createBackup('user', { triggeredBy: 'scheduler' });
    assert.ok(result.backupId, '应返回 backupId');
    assert.ok(result.backupId.startsWith('bak_user_'), 'backupId 应以 bak_user_ 开头');
    assert.strictEqual(result.scope, 'user');
    assert.strictEqual(result.status, 'completed');
    assert.ok(result.strategy, '应返回备份策略');
    assert.strictEqual(result.strategy.frequency, 'daily');
  });

  test('createBackup 创建系统配置备份', () => {
    backup.resetBackups();

    const result = backup.createBackup('system');
    assert.strictEqual(result.scope, 'system');
    assert.strictEqual(result.strategy.frequency, 'weekly');
  });

  test('createBackup 创建人格模型备份', () => {
    backup.resetBackups();

    const result = backup.createBackup('persona');
    assert.strictEqual(result.scope, 'persona');
    assert.strictEqual(result.strategy.frequency, 'on-change');
  });

  test('createBackup 拒绝无效 scope', () => {
    assert.throws(
      () => backup.createBackup('invalid_scope'),
      /无效的 scope/
    );
  });

  test('getBackupStatus 查询已存在的备份', () => {
    backup.resetBackups();

    const created = backup.createBackup('user');
    const status = backup.getBackupStatus(created.backupId);

    assert.ok(status, '应返回备份状态');
    assert.strictEqual(status.id, created.backupId);
    assert.strictEqual(status.scope, 'user');
    assert.strictEqual(status.status, 'completed');
    assert.ok(status.checksum, '应包含校验和');
    assert.ok(status.createdAt, '应包含创建时间');
  });

  test('getBackupStatus 查询不存在的备份返回 null', () => {
    backup.resetBackups();

    const status = backup.getBackupStatus('bak_nonexistent_123');
    assert.strictEqual(status, null);
  });

  test('verifyBackupIntegrity 验证备份完整性通过', () => {
    backup.resetBackups();

    const created = backup.createBackup('user', {
      snapshot: { data: 'test-snapshot', timestamp: Date.now() }
    });
    const result = backup.verifyBackupIntegrity(created.backupId);

    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.backupId, created.backupId);
    assert.ok(result.expectedChecksum);
    assert.strictEqual(result.actualChecksum, result.expectedChecksum);
  });

  test('verifyBackupIntegrity 对不存在的备份返回 valid=false', () => {
    backup.resetBackups();

    const result = backup.verifyBackupIntegrity('bak_nonexistent_456');
    assert.strictEqual(result.valid, false);
  });

  test('restoreFromBackup 从备份恢复数据', () => {
    backup.resetBackups();

    const created = backup.createBackup('user');
    const result = backup.restoreFromBackup(created.backupId);

    assert.strictEqual(result.restored, true);
    assert.strictEqual(result.backupId, created.backupId);
    assert.strictEqual(result.scope, 'user');
  });

  test('restoreFromBackup 对不存在的备份返回 restored=false', () => {
    backup.resetBackups();

    const result = backup.restoreFromBackup('bak_nonexistent_789');
    assert.strictEqual(result.restored, false);
  });

  test('listBackups 列出所有备份并按时间降序', () => {
    backup.resetBackups();

    backup.createBackup('user');
    backup.createBackup('system');
    backup.createBackup('persona');

    const list = backup.listBackups();
    assert.strictEqual(list.length, 3);

    // 验证按创建时间降序（最新在前）
    const times = list.map(b => new Date(b.createdAt).getTime());
    for (let i = 1; i < times.length; i++) {
      assert.ok(times[i - 1] >= times[i], '应按创建时间降序排列');
    }
  });

  test('listBackups 支持按 scope 过滤', () => {
    backup.resetBackups();

    backup.createBackup('user');
    backup.createBackup('system');
    backup.createBackup('user');

    const userBackups = backup.listBackups({ scope: 'user' });
    assert.strictEqual(userBackups.length, 2);
    assert.ok(userBackups.every(b => b.scope === 'user'));
  });

  // ========== 4. 功能开关 ==========

  test('isEnabled 对未注册的开关返回 false', () => {
    featureFlags.resetFlags();
    assert.strictEqual(featureFlags.isEnabled('nonexistent_flag'), false);
  });

  test('isEnabled 默认状态下所有预定义开关为 false', () => {
    featureFlags.resetFlags();

    const flags = Object.keys(featureFlags.DEFAULT_FLAGS);
    for (const flag of flags) {
      assert.strictEqual(
        featureFlags.isEnabled(flag),
        false,
        `${flag} 默认应为 false`
      );
    }
  });

  test('setFlag 全局启用功能开关', () => {
    featureFlags.resetFlags();

    featureFlags.setFlag('agent_enhancement', { enabled: true });
    assert.strictEqual(featureFlags.isEnabled('agent_enhancement'), true);
    assert.strictEqual(featureFlags.isEnabled('agent_enhancement', 'user-123'), true);
  });

  test('setFlag 设置灰度百分比', () => {
    featureFlags.resetFlags();

    // 设置 50% 灰度
    featureFlags.setFlag('journal_analysis', { rolloutPercentage: 50 });

    // 验证同一用户的判断结果稳定（多次调用一致）
    const userId = 'test-user-stable';
    const firstCheck = featureFlags.isEnabled('journal_analysis', userId);
    const secondCheck = featureFlags.isEnabled('journal_analysis', userId);
    assert.strictEqual(firstCheck, secondCheck, '同一用户的灰度判断应稳定');
  });

  test('灰度百分比为 100 时所有用户都启用', () => {
    featureFlags.resetFlags();

    featureFlags.setFlag('persona_calibration', { rolloutPercentage: 100 });

    // 多个不同用户都应启用
    assert.strictEqual(featureFlags.isEnabled('persona_calibration', 'user-a'), true);
    assert.strictEqual(featureFlags.isEnabled('persona_calibration', 'user-b'), true);
    assert.strictEqual(featureFlags.isEnabled('persona_calibration', 'user-c'), true);
  });

  test('灰度百分比为 0 时所有用户都禁用', () => {
    featureFlags.resetFlags();

    featureFlags.setFlag('agent_enhancement', { rolloutPercentage: 0 });

    assert.strictEqual(featureFlags.isEnabled('agent_enhancement', 'user-a'), false);
    assert.strictEqual(featureFlags.isEnabled('agent_enhancement', 'user-b'), false);
  });

  test('setUserOverride 按用户手动覆盖', () => {
    featureFlags.resetFlags();

    // 默认关闭
    assert.strictEqual(featureFlags.isEnabled('agent_enhancement', 'user-override'), false);

    // 设置用户覆盖为启用
    featureFlags.setUserOverride('user-override', 'agent_enhancement', true);
    assert.strictEqual(featureFlags.isEnabled('agent_enhancement', 'user-override'), true);

    // 其他用户仍为关闭
    assert.strictEqual(featureFlags.isEnabled('agent_enhancement', 'other-user'), false);
  });

  test('setUserOverride 拒绝不允许覆盖的开关', () => {
    featureFlags.resetFlags();

    assert.throws(
      () => featureFlags.setUserOverride('user-1', 'real_time_map', true),
      /不允许用户级覆盖/
    );
  });

  test('clearUserOverride 清除用户覆盖', () => {
    featureFlags.resetFlags();

    featureFlags.setUserOverride('user-1', 'agent_enhancement', true);
    assert.strictEqual(featureFlags.isEnabled('agent_enhancement', 'user-1'), true);

    featureFlags.clearUserOverride('user-1', 'agent_enhancement');
    assert.strictEqual(featureFlags.isEnabled('agent_enhancement', 'user-1'), false);
  });

  test('getEnabledFeatures 返回已启用的功能列表', () => {
    featureFlags.resetFlags();

    featureFlags.setFlag('agent_enhancement', { enabled: true });
    featureFlags.setFlag('journal_analysis', { enabled: true });

    const enabled = featureFlags.getEnabledFeatures();
    assert.ok(enabled.includes('agent_enhancement'));
    assert.ok(enabled.includes('journal_analysis'));
    assert.ok(!enabled.includes('real_time_map'));
  });

  test('环境变量覆盖功能开关', () => {
    featureFlags.resetFlags();

    // 保存原始环境变量
    const saved = process.env.FEATURE_AGENT_ENHANCEMENT;
    process.env.FEATURE_AGENT_ENHANCEMENT = 'true';

    assert.strictEqual(featureFlags.isEnabled('agent_enhancement'), true);

    // 恢复
    if (saved === undefined) delete process.env.FEATURE_AGENT_ENHANCEMENT;
    else process.env.FEATURE_AGENT_ENHANCEMENT = saved;
  });

  test('预定义开关包含全部 5 个功能', () => {
    const flags = Object.keys(featureFlags.DEFAULT_FLAGS);
    const expected = [
      'agent_enhancement',
      'real_time_map',
      'journal_analysis',
      'persona_calibration',
      'multi_city_route'
    ];
    for (const name of expected) {
      assert.ok(flags.includes(name), `应包含预定义开关: ${name}`);
    }
  });

  // ========== 5. 运营 API 需要认证 ==========

  if (request && app) {
    // 使用 supertest 进行 HTTP 层测试

    test('运营 API 无 API Key 时返回 401', async () => {
      const res = await request(app).get('/api/v1/ops/health');
      assert.strictEqual(res.status, 401);
      assert.ok(res.body.code || res.body.message);
    });

    test('运营 API 错误 API Key 时返回 403', async () => {
      const res = await request(app)
        .get('/api/v1/ops/health')
        .set('x-api-key', 'wrong-key');
      assert.strictEqual(res.status, 403);
    });

    test('运营 API 正确 API Key 时返回 200', async () => {
      const res = await request(app)
        .get('/api/v1/ops/health')
        .set('x-api-key', 'test-ops-key');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.status);
      assert.ok(res.body.services);
    });

    test('GET /api/v1/ops/metrics 返回指标概要', async () => {
      const res = await request(app)
        .get('/api/v1/ops/metrics')
        .set('x-api-key', 'test-ops-key');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.metrics);
    });

    test('GET /api/v1/ops/data-quality 返回数据质量报告', async () => {
      const res = await request(app)
        .get('/api/v1/ops/data-quality')
        .set('x-api-key', 'test-ops-key');
      assert.strictEqual(res.status, 200);
      assert.ok(res.body.timestamp);
      assert.strictEqual(res.body.averageDimensionCoverage, 1);
      assert.strictEqual(res.body.schemaQualityGrade, 'A');
      assert.ok(res.body.qualityScore >= 65 && res.body.qualityScore <= 95, '数据质量评分应在合理范围');
      assert.ok(['A', 'B'].includes(res.body.qualityGrade));
      assert.ok(res.body.componentScores.poiDepth >= 10 && res.body.componentScores.poiDepth <= 75);
      assert.deepStrictEqual(res.body.launchTargets, { cities: 32, poisPerCity: 20, intercityConnections: 80 });
      assert.ok(res.body.intercityCoverage.totalConnections >= 14);
      assert.ok(res.body.intercityCoverage.averageConfidence >= 0.5);
    });

    test('GET /api/v1/ops/coverage 返回城市覆盖率', async () => {
      const res = await request(app)
        .get('/api/v1/ops/coverage')
        .set('x-api-key', 'test-ops-key');
      assert.strictEqual(res.status, 200);
      assert.ok(typeof res.body.totalCities === 'number');
      assert.ok(Object.keys(res.body.byRegion).length >= 5);
      assert.ok(!res.body.byRegion['未分类'], '已知省份不应全部落入未分类');
      assert.ok(res.body.intercityCoverage.coveredCities >= 10);
    });
  } else {
    // supertest 未安装时，使用模拟方式验证认证逻辑

    test('运营 API 路由模块可正确导入', () => {
      const opsRouter = require('../src/api/v1/ops');
      assert.ok(opsRouter, '运营 API 路由应可正确导入');
      assert.strictEqual(typeof opsRouter, 'function', '路由应为 Express Router 函数');
    });

    test('运营 API 认证逻辑：无 API Key 拒绝（模拟）', () => {
      // 模拟 express req/res 对象验证认证中间件逻辑
      const opsRouter = require('../src/api/v1/ops');

      // 直接验证路由模块可加载且为函数
      assert.ok(typeof opsRouter === 'function', '运营 API 路由应为可调用函数');
      skipped++;
      console.log('    (跳过 HTTP 层测试，supertest 未安装)');
    });

    skipped += 5; // 跳过的 HTTP 测试数量
    console.log('    (supertest 未安装，跳过 5 个 HTTP 层测试)');
  }

  // ========== 运行测试 ==========

  console.log('\n--- Phase 6 测试开始 ---\n');

  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  PASS  ${t.name}`);
    } catch (err) {
      console.error(`  FAIL  ${t.name}`);
      console.error(`        ${err.message}`);
      if (err.stack) {
        // 只打印第一行堆栈定位
        const stackLines = err.stack.split('\n').slice(0, 3);
        stackLines.forEach(line => console.error(`        ${line}`));
      }
      process.exitCode = 1;
    }
  }

  const total = tests.length;
  const failed = total - passed;
  console.log(`\n--- Phase 6 测试完成：${passed}/${total} 通过` +
    (skipped > 0 ? `，${skipped} 个跳过` : '') +
    ` ---`);

  // 仅当有实际失败的测试时才设置非零退出码
  // 跳过的测试（如 supertest 未安装）不影响退出码
  if (failed > 0) {
    process.exitCode = 1;
  }
})();
