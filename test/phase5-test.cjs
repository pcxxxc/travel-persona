/**
 * 旅格 Travel Persona · Phase 5 测试（Agent 增强与无感故障切换）
 *
 * 测试覆盖：
 *   1. MockAgentProvider.extractIntent 返回合法 Patch
 *   2. 熔断器连续失败后打开
 *   3. 熔断器恢复（half-open 成功 -> closed；half-open 失败 -> 重新 open）
 *   4. 结构化 Patch 安全验证（拒绝修改人格维度 / 锁定节点 / 硬约束）
 *   5. 事实校验（拒绝未验证 POI）
 *   6. Agent 关闭时所有功能仍可用（无感降级）
 *
 * 运行：node test/phase5-test.cjs
 */

const assert = require('assert');
const {
  MockAgentProvider,
  getAgentProvider,
  runWithAgent,
  CircuitBreaker,
  State,
  resetAllBreakers,
  validatePatch,
  applyPatch,
  factCheck,
  PROTECTED_PATHS
} = require('../src/services/agent');

(async () => {
  const tests = [];
  let passed = 0;

  function test(name, fn) {
    tests.push({ name, fn });
  }

  // ---------- 1. MockAgentProvider.extractIntent ----------

  test('MockAgentProvider.extractIntent 返回合法 Patch', async () => {
    const provider = new MockAgentProvider();
    const patch = await provider.extractIntent('最近太累了，想找个安静的地方发呆');

    assert.ok(patch, '应返回 Patch 对象');
    assert.ok(Array.isArray(patch.operations), 'Patch 应包含 operations 数组');
    assert.ok(patch.operations.length > 0, '至少应有一个操作');

    // 不得触碰任何受保护路径
    const hitProtected = patch.operations.some(op =>
      PROTECTED_PATHS.some(p => op.path === p || op.path.startsWith(p + '/'))
    );
    assert.strictEqual(hitProtected, false, '不得修改受保护路径');

    // 应识别出 pace = slow
    const softPref = patch.operations.find(op => op.path === '/softPreferences');
    assert.ok(softPref, '应包含 /softPreferences 操作');
    assert.strictEqual(softPref.value.pace, 'slow', '应识别慢节奏偏好');

    // 应包含意图摘要
    const summary = patch.operations.find(op => op.path === '/intent/summary');
    assert.ok(summary, '应包含 /intent/summary 操作');
    assert.ok(typeof summary.value === 'string' && summary.value.length > 0);
  });

  test('MockAgentProvider 四项能力均返回可校验 Patch', async () => {
    const provider = new MockAgentProvider();

    const intent = await provider.extractIntent('想和朋友去海边热闹一下');
    assert.ok(Array.isArray(intent.operations));

    const expl = await provider.enhanceExplanation({
      explanations: [{ reason: '大理适合慢下来。' }]
    });
    assert.ok(Array.isArray(expl.operations));
    assert.ok(expl.operations[0].path.startsWith('/explanations'));

    const adj = await provider.adjustInTrip('plan-001', { day: 2, slot: 'afternoon', content: '改为海边发呆' });
    assert.ok(Array.isArray(adj.operations));
    assert.ok(adj.operations[0].path.startsWith('/selectedPlan/days'));

    const sum = await provider.summarizeJournal([{ text: '今天很开心，看到了海。' }]);
    assert.ok(Array.isArray(sum.operations));
    assert.ok(sum.operations.some(op => op.path === '/journalSummary'));
  });

  // ---------- 2. 熔断器连续失败后打开 ----------

  test('熔断器连续 5 次失败后打开', async () => {
    resetAllBreakers();
    const breaker = new CircuitBreaker({ failureThreshold: 5, recoveryTimeout: 30000 });

    // 连续 5 次失败
    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => breaker.execute(async () => { throw new Error(`fail-${i}`); }),
        /fail-/
      );
    }
    assert.strictEqual(breaker.state, State.OPEN, '5 次失败后应处于 OPEN');

    // 第 6 次应被熔断器直接拒绝，且不执行函数
    let called = false;
    await assert.rejects(
      () => breaker.execute(async () => { called = true; return 'should-not-run'; }),
      /熔断器已打开/
    );
    assert.strictEqual(called, false, '熔断后不应执行被保护函数');
  });

  // ---------- 3. 熔断器恢复 ----------

  test('熔断器恢复：half-open 成功 -> closed', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, recoveryTimeout: 50 });

    // 触发熔断
    for (let i = 0; i < 2; i++) {
      await assert.rejects(
        () => breaker.execute(async () => { throw new Error('fail'); }),
        /fail/
      );
    }
    assert.strictEqual(breaker.state, State.OPEN);

    // 等待恢复时间，进入 half-open
    await new Promise(r => setTimeout(r, 80));

    // half-open 放行一次试探，成功后应关闭熔断器
    const result = await breaker.execute(async () => 'recovered');
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(breaker.state, State.CLOSED, 'half-open 成功应恢复为 CLOSED');
  });

  test('熔断器恢复：half-open 失败 -> 重新 open', async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, recoveryTimeout: 30 });

    // 1 次失败即熔断
    await assert.rejects(
      () => breaker.execute(async () => { throw new Error('fail'); }),
      /fail/
    );
    assert.strictEqual(breaker.state, State.OPEN);

    // 等待恢复，进入 half-open
    await new Promise(r => setTimeout(r, 50));

    // half-open 试探再次失败 -> 重新打开
    await assert.rejects(
      () => breaker.execute(async () => { throw new Error('fail-again'); }),
      /fail-again/
    );
    assert.strictEqual(breaker.state, State.OPEN, 'half-open 失败应重新 OPEN');
  });

  // ---------- 4. 结构化 Patch 安全验证 ----------

  test('结构化 Patch 安全验证拒绝修改人格维度', () => {
    const allowed = ['/explanations', '/intent', '/softPreferences', '/selectedPlan/days'];

    // 试图修改长期人格维度 -> 拒绝
    const badTraits = {
      operations: [{ op: 'replace', path: '/personaProfile/traits/freedom', value: 0.9 }]
    };
    const v1 = validatePatch(badTraits, allowed);
    assert.strictEqual(v1.valid, false, '修改 personaProfile.traits 应被拒绝');
    assert.ok(v1.errors.some(e => e.includes('受保护')), '应提示受保护路径');

    // 试图修改锁定维度 -> 拒绝
    const badLocked = {
      operations: [{ op: 'replace', path: '/lockedTraits', value: ['freedom'] }]
    };
    assert.strictEqual(validatePatch(badLocked, allowed).valid, false, '修改 lockedTraits 应被拒绝');

    // 试图修改硬约束 -> 拒绝
    const badConstraints = {
      operations: [{ op: 'add', path: '/hardConstraints/budget', value: 9999 }]
    };
    assert.strictEqual(validatePatch(badConstraints, allowed).valid, false, '修改 hardConstraints 应被拒绝');

    // 试图移动锁定节点 -> 拒绝
    const badNodes = {
      operations: [{ op: 'remove', path: '/lockedNodes/0' }]
    };
    assert.strictEqual(validatePatch(badNodes, allowed).valid, false, '移动 lockedNodes 应被拒绝');

    // 白名单外路径 -> 拒绝
    const outside = {
      operations: [{ op: 'replace', path: '/somethingElse', value: 1 }]
    };
    assert.strictEqual(validatePatch(outside, allowed).valid, false, '白名单外路径应被拒绝');

    // 合法 Patch -> 通过
    const good = {
      operations: [{ op: 'replace', path: '/explanations/0/reason', value: '润色后的理由' }]
    };
    assert.strictEqual(validatePatch(good, allowed).valid, true, '白名单内合法 Patch 应通过');
  });

  test('applyPatch 应用合法 Patch 并拒绝非法 Patch', () => {
    const target = { explanations: [{ reason: '原理由' }], intent: {} };
    const patch = {
      operations: [
        { op: 'replace', path: '/explanations/0/reason', value: '新理由' },
        { op: 'add', path: '/intent/summary', value: '当次意图' }
      ]
    };
    const result = applyPatch(target, patch, ['/explanations', '/intent']);
    assert.strictEqual(result.explanations[0].reason, '新理由');
    assert.strictEqual(result.intent.summary, '当次意图');

    // 非法 Patch 应抛出
    const bad = {
      operations: [{ op: 'replace', path: '/personaProfile/traits/freedom', value: 0.99 }]
    };
    assert.throws(
      () => applyPatch({}, bad, []),
      /受保护|校验失败/
    );
  });

  // ---------- 5. 事实校验 ----------

  test('事实校验拒绝未验证 POI', () => {
    const dataSource = {
      pois: [
        { name: '洱海公园', lat: 25.694, lng: 100.18, type: '自然' },
        { name: '大理古城', lat: 25.694, lng: 100.16, type: '街区' }
      ]
    };

    // Agent 试图新增一个不存在的 POI -> 拒绝
    const badPatch = {
      operations: [
        { op: 'add', path: '/selectedPlan/days/0/pois', value: { name: '不存在的景点', lat: 0, lng: 0, type: '自然' } }
      ]
    };
    const fc1 = factCheck(badPatch, dataSource);
    assert.strictEqual(fc1.valid, false, '未验证 POI 应被拒绝');
    assert.ok(fc1.violations.length > 0, '应记录违规');
    assert.strictEqual(fc1.violations[0].reason, 'unverified_poi');

    // Agent 引用已验证 POI -> 通过
    const goodPatch = {
      operations: [
        { op: 'add', path: '/selectedPlan/days/0/pois', value: { name: '洱海公园', lat: 25.694, lng: 100.18 } }
      ]
    };
    const fc2 = factCheck(goodPatch, dataSource);
    assert.strictEqual(fc2.valid, true, '已验证 POI 应通过');
    assert.ok(fc2.checked > 0, '应至少检查了一个候选 POI');

    // 仅名称匹配也可通过（坐标缺省）
    const nameOnly = {
      operations: [
        { op: 'add', path: '/selectedPlan/days/0/pois', value: { name: '大理古城' } }
      ]
    };
    assert.strictEqual(factCheck(nameOnly, dataSource).valid, true, '名称匹配的 POI 应通过');
  });

  test('Provider 在配置数据源时对未验证 POI 主动丢弃', async () => {
    // Mock 不产 POI，这里用一个会返回未验证 POI 的伪 provider 验证 _safeReturn 路径
    const { AgentProvider, ALLOWED_PATHS } = require('../src/services/agent/agentProvider');
    const dataSource = { pois: [{ name: '洱海公园', lat: 25.694, lng: 100.18 }] };
    const provider = new AgentProvider({ dataSource });

    const badPatch = {
      operations: [
        { op: 'add', path: '/selectedPlan/days/0/pois', value: { name: '幽灵景点', lat: 1, lng: 2 } }
      ]
    };
    // 直接调用基类 _safeReturn，应因事实校验失败而抛出
    assert.throws(
      () => provider._safeReturn(badPatch, ALLOWED_PATHS.adjustInTrip, dataSource),
      /事实校验失败/
    );
  });

  // ---------- 6. Agent 关闭时所有功能仍可用 ----------

  test('Agent 关闭时 getAgentProvider 返回 null', () => {
    const saved = process.env.AGENT_PROVIDER;
    delete process.env.AGENT_PROVIDER;
    const provider = getAgentProvider();
    assert.strictEqual(provider, null, '未设置 AGENT_PROVIDER 时应返回 null');
    if (saved !== undefined) process.env.AGENT_PROVIDER = saved;
  });

  test('Agent 关闭时所有功能仍可用（无感降级）', async () => {
    const saved = process.env.AGENT_PROVIDER;
    delete process.env.AGENT_PROVIDER;
    const provider = getAgentProvider();
    assert.strictEqual(provider, null);

    // 空 Patch 作为降级结果，保证响应合同结构等价
    const emptyPatch = () => ({ operations: [] });

    const intent = await runWithAgent(provider, 'extractIntent', ['想去看海'], emptyPatch);
    assert.ok(intent && Array.isArray(intent.operations), 'extractIntent 降级仍返回 Patch 结构');

    const expl = await runWithAgent(provider, 'enhanceExplanation', [{}], emptyPatch);
    assert.ok(Array.isArray(expl.operations), 'enhanceExplanation 降级仍返回 Patch 结构');

    const adj = await runWithAgent(provider, 'adjustInTrip', ['p1', {}], emptyPatch);
    assert.ok(Array.isArray(adj.operations), 'adjustInTrip 降级仍返回 Patch 结构');

    const sum = await runWithAgent(provider, 'summarizeJournal', [[]], emptyPatch);
    assert.ok(Array.isArray(sum.operations), 'summarizeJournal 降级仍返回 Patch 结构');

    if (saved !== undefined) process.env.AGENT_PROVIDER = saved;
  });

  test('Agent 抛错时 runWithAgent 无感降级', async () => {
    const provider = new MockAgentProvider();
    // 传入非法输入，MockProvider 会抛 ValidationError -> 应被无感降级
    const fallback = { operations: [{ op: 'add', path: '/intent', value: 'fallback' }] };
    const res = await runWithAgent(provider, 'extractIntent', [null], fallback);
    assert.ok(Array.isArray(res.operations), 'Agent 失败应返回降级值');
    assert.strictEqual(res.operations[0].value, 'fallback');
  });

  test('AGENT_PROVIDER=mock 时工厂返回 MockAgentProvider', () => {
    const saved = process.env.AGENT_PROVIDER;
    process.env.AGENT_PROVIDER = 'mock';
    const provider = getAgentProvider();
    assert.ok(provider instanceof MockAgentProvider, 'mock 应返回 MockAgentProvider');
    if (saved !== undefined) process.env.AGENT_PROVIDER = saved;
    else delete process.env.AGENT_PROVIDER;
  });

  // ---------- 运行 ----------
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  PASS  ${t.name}`);
    } catch (err) {
      console.error(`  FAIL  ${t.name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  console.log(`\nPhase 5 测试完成：${passed}/${tests.length} 通过`);
  if (passed !== tests.length) {
    process.exitCode = 1;
  }
})();
