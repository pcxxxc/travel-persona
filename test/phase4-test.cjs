/**
 * 旅格 Travel Persona · Phase 4 测试（手账、旅格轨迹与人格校准）
 *
 * 测试范围：
 * 1. 手账创建和获取
 * 2. 分析授权控制（未授权的不进入分析池）
 * 3. 人格更新提案（单维变化不超过 0.08）
 * 4. 锁定维度不被更新
 * 5. 数据导出和删除
 * 6. 关闭个性化
 *
 * 运行方式：node test/phase4-test.cjs
 */

const assert = require('assert');

// 导入 Phase 4 模块
const journal = require('../src/services/journal/journalService');
const persona = require('../src/services/journal/personaCalibration');
const trace = require('../src/services/journal/travelTrace');
const rights = require('../src/services/journal/dataRights');

// 测试计数器
let passed = 0;
let failed = 0;

/**
 * 同步测试包装器
 */
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

/**
 * 异步测试包装器
 */
async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ FAIL: ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ============================================================
// 主测试流程（async IIFE）
// ============================================================

(async () => {
  console.log('\n=== Phase 4 测试：手账、旅格轨迹与人格校准 ===\n');

  // ==========================================================
  // 1. 手账创建和获取
  // ==========================================================
  console.log('1. 手账创建和获取');
  rights._reset();

  test('createEntry 创建手账条目，默认 analysisAuthorized 为 false', () => {
    const entry = journal.createEntry('user1', {
      tripId: 'trip_001',
      type: 'record',
      content: '今天去了洱海，风很大，心情很平静。',
      mood: 'restore',
      location: { city: 'dali', precision: 'city' }
    });

    assert.ok(entry.id, '应有 id');
    assert.strictEqual(entry.userId, 'user1');
    assert.strictEqual(entry.tripId, 'trip_001');
    assert.strictEqual(entry.type, 'record');
    assert.strictEqual(entry.analysisAuthorized, false, '默认不授权分析');
    assert.strictEqual(entry.contentSensitivity, 'sensitive', 'content 应标记为 sensitive');
    assert.strictEqual(entry.modelTrainingPermission, false, '模型训练权限永远为 false');
    assert.ok(entry.createdAt, '应有 createdAt');
  });

  test('createEntry 默认类型为 record', () => {
    const entry = journal.createEntry('user1', { content: '测试' });
    assert.strictEqual(entry.type, 'record');
  });

  test('createEntry 非法 type 抛出错误', () => {
    assert.throws(
      () => journal.createEntry('user1', { type: 'invalid' }),
      /type 必须是/,
      '应抛出类型校验错误'
    );
  });

  test('getEntries 获取用户手账列表', () => {
    // 使用独立用户避免与前面测试的数据累积
    journal.createEntry('userList', { type: 'record', content: '记录1', tripId: 'trip_001' });
    journal.createEntry('userList', { type: 'review', content: '复盘' });
    journal.createEntry('userList', { type: 'planning', content: '规划' });

    const all = journal.getEntries('userList');
    assert.strictEqual(all.length, 3, '应有3条记录');

    // 按 type 过滤
    const reviews = journal.getEntries('userList', { type: 'review' });
    assert.strictEqual(reviews.length, 1, '应有1条 review');

    // 按 tripId 过滤
    const tripEntries = journal.getEntries('userList', { tripId: 'trip_001' });
    assert.strictEqual(tripEntries.length, 1, '应有1条属于 trip_001');
  });

  test('getEntries 列表按创建时间降序排列', () => {
    const entries = journal.getEntries('userList');
    for (let i = 1; i < entries.length; i++) {
      assert(entries[i - 1].createdAt >= entries[i].createdAt, '应按时间降序');
    }
  });

  test('updateEntry 更新手账内容', () => {
    const entry = journal.createEntry('user2', { content: '原始内容' });
    const updated = journal.updateEntry(entry.id, { content: '更新后的内容', mood: 'inspire' });

    assert.strictEqual(updated.content, '更新后的内容');
    assert.strictEqual(updated.mood, 'inspire');
    assert.ok(updated.updatedAt >= entry.createdAt, 'updatedAt 应更新');
  });

  test('deleteEntry 删除手账', () => {
    const entry = journal.createEntry('user3', { content: '待删除' });
    const result = journal.deleteEntry(entry.id);

    assert.strictEqual(result.deleted, true);
    assert.strictEqual(result.entryId, entry.id);

    const remaining = journal.getEntries('user3');
    assert.strictEqual(remaining.length, 0, '删除后应为空');
  });

  test('sanitizeForShare 分享时移除敏感字段', () => {
    const entry = journal.createEntry('user1', {
      content: '这是私人感受，不想被分享。',
      location: { city: 'dali', precision: 'exact', lat: 25.6, lng: 100.2 }
    });

    const shared = journal.sanitizeForShare(entry);
    assert.strictEqual(shared.content, '[已移除：敏感内容]', 'content 应被脱敏');
    assert.strictEqual(shared.contentRedacted, true, '应有脱敏标记');
    assert.strictEqual(shared.location.precision, 'redacted', '精确位置应被移除');
  });

  // ==========================================================
  // 2. 分析授权控制
  // ==========================================================
  console.log('\n2. 分析授权控制（总纲7.2：不授权分析的记录绝不进入人格引擎）');
  rights._reset();

  test('未授权的手账不进入分析池', () => {
    journal.createEntry('user1', {
      type: 'record',
      content: '未授权记录',
      mood: 'restore'
    });

    const forAnalysis = journal.getEntriesForAnalysis('user1');
    assert.strictEqual(forAnalysis.length, 0, '未授权的条目不应出现在分析池');
  });

  test('授权后进入分析池', () => {
    const entry = journal.createEntry('user1', {
      type: 'review',
      content: '这是一次完整的旅后复盘。',
      mood: 'restore',
      reviewSnapshot: { worth: 'worth_it', values: ['arrived'], deviations: ['as_planned'], tripCompleted: true }
    });

    // 授权前
    assert.strictEqual(journal.getEntriesForAnalysis('user1').length, 0);

    // 授权
    journal.setAnalysisAuthorization(entry.id, true);
    assert.strictEqual(journal.getEntriesForAnalysis('user1').length, 1, '授权后应出现在分析池');

    // 证据池同步
    const evidence = journal.getEvidencePool('user1');
    assert.strictEqual(evidence.length, 1, '证据池应有1条证据');
    assert.strictEqual(evidence[0].reliability, 0.90, 'review 类型可靠度应为 0.90');
  });

  test('取消授权后从分析池移除', () => {
    // 使用独立用户避免数据累积
    const entry = journal.createEntry('userRevoke', {
      type: 'review',
      content: '复盘内容'
    });
    journal.setAnalysisAuthorization(entry.id, true);
    assert.strictEqual(journal.getEntriesForAnalysis('userRevoke').length, 1);

    journal.setAnalysisAuthorization(entry.id, false);
    assert.strictEqual(journal.getEntriesForAnalysis('userRevoke').length, 0, '取消授权后应移除');
    assert.strictEqual(journal.getEvidencePool('userRevoke').length, 0, '证据池也应清空');
  });

  test('restricted 级别即使授权也不进入分析（总纲12.1 L3 严格隔离）', () => {
    const entry = journal.createEntry('userRestricted', {
      type: 'review',
      content: '敏感内容',
      sensitivityLevel: 'restricted'
    });
    journal.setAnalysisAuthorization(entry.id, true);

    assert.strictEqual(entry.analysisAuthorized, false, 'restricted 记录应拒绝进入分析授权状态');
    assert.strictEqual(journal.getEntriesForAnalysis('userRestricted').length, 0, 'restricted 级别不应进入分析');
  });

  test('删除手账时同步从证据池移除', () => {
    const entry = journal.createEntry('userDelEv', {
      type: 'review',
      content: '待删除的复盘'
    });
    journal.setAnalysisAuthorization(entry.id, true);
    assert.strictEqual(journal.getEvidencePool('userDelEv').length, 1);

    const result = journal.deleteEntry(entry.id);
    assert.strictEqual(result.evidenceRemoved, true, '应标记证据已移除');
    assert.strictEqual(journal.getEvidencePool('userDelEv').length, 0, '证据池应为空');
  });

  test('不同类型手账的证据可靠度不同', () => {
    const reviewEntry = journal.createEntry('userA', {
      type: 'review',
      content: '复盘',
      reviewSnapshot: { worth: 'worth_it', values: ['arrived'], deviations: ['as_planned'], tripCompleted: true }
    });
    const planningEntry = journal.createEntry('userA', { type: 'planning', content: '规划' });
    const recordEntry = journal.createEntry('userA', { type: 'record', content: '记录' });

    journal.setAnalysisAuthorization(reviewEntry.id, true);
    journal.setAnalysisAuthorization(planningEntry.id, true);
    journal.setAnalysisAuthorization(recordEntry.id, true);

    const evidence = journal.getEvidencePool('userA');
    const byType = {};
    evidence.forEach(e => { byType[e.type] = e.reliability; });

    assert.strictEqual(byType['tripReview'], 0.90, 'review 可靠度 0.90');
    assert.ok(byType['journalEntry'] !== undefined, '应有 journalEntry 类型证据');
  });

  // ==========================================================
  // 3. 人格更新提案（单维变化不超过 0.08）
  // ==========================================================
  console.log('\n3. 人格更新提案（总纲7.3：单维最大变化 0.08）');
  rights._reset();

  test('从高可靠度证据生成提案', () => {
    // 创建高可靠度证据（review 级别，reliability 0.90）
    const evidence = [{
      id: 'ev_001',
      type: 'tripReview',
      source: 'journal:test',
      reliability: 0.90,
      mood: 'restore',
      dimensionImpact: {
        d1: { traitKey: 'restoration', direction: 'positive', magnitude: 0.15 },
        d2: { traitKey: 'nature', direction: 'positive', magnitude: 0.10 }
      }
    }];

    const proposals = persona.generateUpdateProposal('user1', evidence);
    assert.ok(proposals.length > 0, '应生成提案');

    // 找到 restoration 维度的提案
    const restorationProposal = proposals.find(p => p.traitKey === 'restoration');
    assert.ok(restorationProposal, '应有 restoration 维度提案');
    assert.strictEqual(restorationProposal.status, 'pending', '初始状态应为 pending');
    assert.ok(restorationProposal.evidenceIds.includes('ev_001'), '应包含证据 ID');
  });

  test('单维变化不超过 0.08（总纲7.3 硬约束）', () => {
    // magnitude 0.15 × reliability 0.90 = 0.135，应被裁剪到 0.08
    const evidence = [{
      id: 'ev_002',
      type: 'tripReview',
      source: 'journal:test',
      reliability: 0.90,
      dimensionImpact: {
        d1: { traitKey: 'restoration', direction: 'positive', magnitude: 0.15 }
      }
    }];

    const proposals = persona.generateUpdateProposal('user1', evidence);
    const restorationProposal = proposals.find(p => p.traitKey === 'restoration');

    assert.ok(restorationProposal, '应有 restoration 提案');
    assert.ok(
      Math.abs(restorationProposal.delta) <= 0.08,
      `delta 应不超过 0.08，实际: ${restorationProposal.delta}`
    );
    assert.strictEqual(restorationProposal.delta, 0.08, 'delta 应精确等于 0.08（被裁剪）');
    assert.strictEqual(restorationProposal.deltaCapped, true, '应标记为已被裁剪');
  });

  test('用户明确纠正不受 0.08 上限约束', () => {
    const evidence = [{
      id: 'ev_003',
      type: 'userCorrection',
      source: 'user:explicit',
      reliability: 1.00,
      dimensionImpact: {
        d1: { traitKey: 'culture', direction: 'positive', magnitude: 0.20 }
      }
    }];

    const proposals = persona.generateUpdateProposal('user1', evidence, {
      userExplicitCorrection: true
    });
    const cultureProposal = proposals.find(p => p.traitKey === 'culture');

    assert.ok(cultureProposal, '应有 culture 提案');
    assert.ok(
      Math.abs(cultureProposal.delta) > 0.08,
      `用户明确纠正的 delta 应可超过 0.08，实际: ${cultureProposal.delta}`
    );
    assert.strictEqual(cultureProposal.delta, 0.20, 'delta 应等于原始值 0.20');
  });

  test('单次取消（reliability 0.25）不生成提案（退出门槛）', () => {
    const evidence = [{
      id: 'ev_cancel',
      type: 'cancellation',
      source: 'action:cancel',
      reliability: 0.25,
      dimensionImpact: {
        d1: { traitKey: 'social', direction: 'negative', magnitude: 0.10 }
      }
    }];

    const proposals = persona.generateUpdateProposal('user1', evidence);
    assert.strictEqual(proposals.length, 0, '单次取消不应生成提案');
  });

  test('单次收藏（reliability 0.20）不生成提案（退出门槛）', () => {
    const evidence = [{
      id: 'ev_fav',
      type: 'favorite',
      source: 'action:favorite',
      reliability: 0.20,
      dimensionImpact: {
        d1: { traitKey: 'novelty', direction: 'positive', magnitude: 0.10 }
      }
    }];

    const proposals = persona.generateUpdateProposal('user1', evidence);
    assert.strictEqual(proposals.length, 0, '单次收藏不应生成提案');
  });

  test('多次低可靠度一致证据可生成提案（退出门槛）', () => {
    const evidence = [
      {
        id: 'ev_low1',
        type: 'cancellation',
        source: 'action:cancel',
        reliability: 0.25,
        dimensionImpact: {
          d1: { traitKey: 'social', direction: 'negative', magnitude: 0.10 }
        }
      },
      {
        id: 'ev_low2',
        type: 'cancellation',
        source: 'action:cancel',
        reliability: 0.30,
        dimensionImpact: {
          d1: { traitKey: 'social', direction: 'negative', magnitude: 0.10 }
        }
      }
    ];

    const proposals = persona.generateUpdateProposal('user1', evidence);
    const socialProposal = proposals.find(p => p.traitKey === 'social');
    assert.ok(socialProposal, '多次一致的低可靠度证据应可生成提案');
    assert.ok(socialProposal.delta < 0, 'social 维度应为负方向');
  });

  test('提案包含 reason 说明（总纲8.5：提案必须说明理由）', () => {
    const evidence = [{
      id: 'ev_reason',
      type: 'tripReview',
      source: 'journal:test',
      reliability: 0.90,
      dimensionImpact: {
        d1: { traitKey: 'nature', direction: 'positive', magnitude: 0.08 }
      }
    }];

    const proposals = persona.generateUpdateProposal('user1', evidence);
    const natureProposal = proposals.find(p => p.traitKey === 'nature');
    assert.ok(natureProposal, '应有 nature 提案');
    assert.ok(typeof natureProposal.reason === 'string' && natureProposal.reason.length > 0, '应有 reason 说明');
  });

  // ==========================================================
  // 4. 锁定维度不被更新
  // ==========================================================
  console.log('\n4. 锁定维度不被更新（总纲12.5：用户锁定的维度自动更新不得修改）');
  rights._reset();

  test('lockTrait 锁定维度', () => {
    const profile = persona.getOrCreateProfile('user1');
    assert.strictEqual(profile.traits.restoration.lockedByUser, false, '初始未锁定');

    persona.lockTrait(profile, 'restoration');

    assert.strictEqual(profile.traits.restoration.lockedByUser, true, '应已锁定');
    assert.ok(profile.lockedTraits.includes('restoration'), 'lockedTraits 应包含 restoration');
  });

  test('applyProposal 锁定维度的提案被跳过', () => {
    // 先生成提案（未锁定时）
    const evidence = [{
      id: 'ev_lock_001',
      type: 'tripReview',
      source: 'journal:test',
      reliability: 0.90,
      dimensionImpact: {
        d1: { traitKey: 'restoration', direction: 'positive', magnitude: 0.08 }
      }
    }];

    const profile = persona.getOrCreateProfile('user2');
    const oldValue = profile.traits.restoration.mean;

    const proposals = persona.generateUpdateProposal('user2', evidence);
    const restorationProposal = proposals.find(p => p.traitKey === 'restoration');
    assert.ok(restorationProposal, '未锁定时应生成提案');

    // 锁定维度
    persona.lockTrait(profile, 'restoration');

    // 尝试应用提案
    const result = persona.applyProposal(restorationProposal, profile);
    assert.strictEqual(result.applied, false, '锁定维度不应被应用');
    assert.strictEqual(result.skipped, true, '应标记为跳过');
    assert.strictEqual(profile.traits.restoration.mean, oldValue, '维度值不应变化');
  });

  test('applyProposal 未锁定维度的提案正常应用', () => {
    const evidence = [{
      id: 'ev_apply_001',
      type: 'tripReview',
      source: 'journal:test',
      reliability: 0.90,
      dimensionImpact: {
        d1: { traitKey: 'culture', direction: 'positive', magnitude: 0.06 }
      }
    }];

    const profile = persona.getOrCreateProfile('user3');
    const oldValue = profile.traits.culture.mean;

    const proposals = persona.generateUpdateProposal('user3', evidence);
    const cultureProposal = proposals.find(p => p.traitKey === 'culture');
    assert.ok(cultureProposal, '应生成 culture 提案');

    const result = persona.applyProposal(cultureProposal, profile);
    assert.strictEqual(result.applied, true, '应成功应用');
    assert.ok(result.newValue > oldValue, '新值应大于旧值');
    assert.strictEqual(cultureProposal.status, 'accepted', '提案状态应变为 accepted');
    assert.ok(profile.traits.culture.evidenceCount > 0, 'evidenceCount 应增加');
  });

  test('rejectProposal 拒绝提案', () => {
    const evidence = [{
      id: 'ev_reject_001',
      type: 'tripReview',
      source: 'journal:test',
      reliability: 0.90,
      dimensionImpact: {
        d1: { traitKey: 'food', direction: 'positive', magnitude: 0.05 }
      }
    }];

    const proposals = persona.generateUpdateProposal('user4', evidence);
    const foodProposal = proposals.find(p => p.traitKey === 'food');
    assert.strictEqual(foodProposal.status, 'pending');

    const rejected = persona.rejectProposal(foodProposal.id, '用户认为不准确');
    assert.strictEqual(rejected.status, 'rejected', '状态应变为 rejected');
    assert.strictEqual(rejected.rejectReason, '用户认为不准确');
  });

  test('excludeEvidence 排除证据后不参与提案生成', () => {
    const profile = persona.getOrCreateProfile('user5');

    // 排除证据
    persona.excludeEvidence(profile, 'ev_excluded_001');

    assert.ok(
      profile.excludedEvidenceIds.includes('ev_excluded_001'),
      'excludedEvidenceIds 应包含该证据'
    );

    // 被排除的证据不生成提案
    const evidence = [{
      id: 'ev_excluded_001',
      type: 'tripReview',
      source: 'journal:test',
      reliability: 0.90,
      dimensionImpact: {
        d1: { traitKey: 'nature', direction: 'positive', magnitude: 0.08 }
      }
    }];

    const proposals = persona.generateUpdateProposal('user5', evidence);
    assert.strictEqual(proposals.length, 0, '被排除的证据不应生成提案');
  });

  test('unlockTrait 解锁后可正常更新', () => {
    const profile = persona.getOrCreateProfile('user6');
    persona.lockTrait(profile, 'pace');
    assert.strictEqual(profile.traits.pace.lockedByUser, true);

    persona.unlockTrait(profile, 'pace');
    assert.strictEqual(profile.traits.pace.lockedByUser, false, '解锁后应为 false');
    assert.ok(!profile.lockedTraits.includes('pace'), 'lockedTraits 不应再包含 pace');
  });

  // ==========================================================
  // 5. 数据导出和删除
  // ==========================================================
  console.log('\n5. 数据导出和删除（总纲12.5：导出 / 删除账号与全部关联数据）');
  rights._reset();

  test('exportUserData 导出用户全部数据', () => {
    // 创建手账
    const entry1 = journal.createEntry('user1', {
      tripId: 'trip_001',
      type: 'review',
      content: '复盘内容',
      mood: 'restore'
    });
    journal.setAnalysisAuthorization(entry1.id, true);

    // 创建旅行记录
    trace.recordTrip('user1', {
      cities: ['dali', 'lijiang'],
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      status: 'completed',
      actualEvents: [
        { type: 'city_visited', city: 'dali', actualStay: 2 },
        { type: 'city_visited', city: 'lijiang', actualStay: 3 }
      ]
    });

    // 创建人格档案（自动创建）
    persona.getOrCreateProfile('user1');

    // 导出
    const exported = rights.exportUserData('user1');

    assert.strictEqual(exported.userId, 'user1');
    assert.ok(exported.exportedAt, '应有导出时间');
    assert.ok(exported.journal.entries.length > 0, '应包含手账数据');
    assert.ok(exported.journal.evidenceCount > 0, '应包含证据数据');
    assert.ok(exported.persona.profile, '应包含人格档案');
    assert.ok(exported.travel.trips.length > 0, '应包含旅行记录');
    assert.ok(exported.travel.visitMap, '应包含向往地图');
    assert.ok(exported.travel.stats, '应包含旅行统计');
    assert.ok(exported.privacySettings, '应包含隐私设置');
  });

  test('deleteUserData 删除用户全部数据', () => {
    // 先创建数据
    journal.createEntry('user2', { type: 'review', content: '待删除' });
    trace.recordTrip('user2', { cities: ['beijing'], status: 'planning' });
    persona.getOrCreateProfile('user2');

    // 确认数据存在
    assert.ok(journal.getEntries('user2').length > 0, '删除前应有手账');
    assert.ok(trace.getTravelTrace('user2').length > 0, '删除前应有旅行记录');

    // 删除
    const result = rights.deleteUserData('user2');
    assert.strictEqual(result.deleted, true);
    assert.ok(result.details.entriesDeleted > 0, '应删除手账');
    assert.ok(result.details.tripsDeleted > 0, '应删除旅行记录');
    assert.strictEqual(result.details.profileDeleted, true, '应删除人格档案');

    // 确认数据已清空
    assert.strictEqual(journal.getEntries('user2').length, 0, '删除后手账应为空');
    assert.strictEqual(trace.getTravelTrace('user2').length, 0, '删除后旅行记录应为空');
  });

  test('deleteUserData 创建删除标记（用于备份清理）', () => {
    journal.createEntry('user3', { content: 'test' });
    rights.deleteUserData('user3');

    const marker = rights.getDeletionMarker('user3');
    assert.ok(marker, '应有删除标记');
    assert.ok(marker.marker, '标记应有唯一 ID');
    assert.ok(marker.deletedAt, '应有删除时间');

    assert.strictEqual(rights.isUserDeleted('user3'), true, '应标记为已删除');
  });

  test('exportUserData 包含敏感原文（仅导出给用户本人）', () => {
    journal.createEntry('user4', {
      content: '这是我的私人感受，非常私密。',
      type: 'record'
    });

    const exported = rights.exportUserData('user4');
    const entry = exported.journal.entries[0];
    assert.strictEqual(entry.content, '这是我的私人感受，非常私密。', '导出应包含原文（用户本人可见）');
  });

  // ==========================================================
  // 6. 关闭个性化
  // ==========================================================
  console.log('\n6. 关闭个性化（总纲12.5：关闭个性化推荐并使用非人格模式）');
  rights._reset();

  test('getPrivacySettings 返回默认隐私设置', () => {
    const settings = rights.getPrivacySettings('user1');

    assert.strictEqual(settings.personalizationEnabled, true, '默认开启个性化');
    assert.strictEqual(settings.analysisConsent, false, '默认不授权分析');
    assert.strictEqual(settings.modelTrainingEnabled, false, '模型训练永远为 false');
    assert.strictEqual(settings.locationPrecision, 'city', '默认城市级位置');
  });

  test('disablePersonalization 关闭个性化', () => {
    rights.getPrivacySettings('user1');
    const settings = rights.disablePersonalization('user1');

    assert.strictEqual(settings.personalizationEnabled, false, '应关闭个性化');
    assert.strictEqual(settings.analysisConsent, false, '应同时关闭分析授权');
    assert.strictEqual(settings.longTermMemoryEnabled, false, '应关闭长期记忆');
    assert.strictEqual(rights.isPersonalizationDisabled('user1'), true, '应标记为已关闭');
  });

  test('updatePrivacySettings 更新隐私设置', () => {
    rights.getPrivacySettings('user2');
    const updated = rights.updatePrivacySettings('user2', {
      locationPrecision: 'exact',
      photoAnalysisEnabled: true
    });

    assert.strictEqual(updated.locationPrecision, 'exact', '应更新位置精度');
    assert.strictEqual(updated.photoAnalysisEnabled, true, '应更新照片分析');
  });

  test('modelTrainingEnabled 永远为 false（总纲8.1）', () => {
    rights.getPrivacySettings('user3');

    // 尝试开启模型训练
    const updated = rights.updatePrivacySettings('user3', {
      modelTrainingEnabled: true
    });

    assert.strictEqual(updated.modelTrainingEnabled, false, '模型训练应永远为 false');
  });

  test('关闭个性化后导出的数据反映设置变更', () => {
    journal.createEntry('user5', { content: 'test' });
    rights.disablePersonalization('user5');

    const exported = rights.exportUserData('user5');
    assert.strictEqual(exported.privacySettings.personalizationEnabled, false, '导出应反映个性化已关闭');
  });

  // ==========================================================
  // 旅格轨迹附加测试
  // ==========================================================
  console.log('\n7. 旅格轨迹附加测试');
  rights._reset();

  test('recordTrip 记录旅行', () => {
    const trip = trace.recordTrip('user1', {
      cities: ['dali', 'lijiang'],
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      status: 'completed',
      planSnapshot: { route: ['dali', 'lijiang'] }
    });

    assert.ok(trip.tripId, '应有 tripId');
    assert.strictEqual(trip.userId, 'user1');
    assert.deepStrictEqual(trip.cities, ['dali', 'lijiang']);
    assert.strictEqual(trip.status, 'completed');
    assert.ok(trip.planSnapshot, '应有计划快照');
  });

  test('未来旅行不能提前标记为已完成', () => {
    assert.throws(() => trace.recordTrip('futureUser', {
      cities: ['beijing'],
      startDate: '2099-08-01',
      endDate: '2099-08-05',
      status: 'completed'
    }), /尚未结束/);
  });

  test('getVisitMap 生成向往地图数据', () => {
    trace.recordTrip('user1', {
      cities: ['dali', 'lijiang'],
      startDate: '2026-06-01',
      endDate: '2026-06-05',
      status: 'completed',
      actualEvents: [
        { type: 'city_visited', city: 'dali', actualStay: 2 },
        { type: 'city_visited', city: 'lijiang', actualStay: 3 }
      ]
    });
    trace.recordTrip('user1', {
      cities: ['chengdu', 'xiamen'],
      startDate: '2026-08-01',
      status: 'planning'
    });
    trace.addWish('user1', 'sanya');

    const visitMap = trace.getVisitMap('user1');
    assert.deepStrictEqual(visitMap.visited, ['dali', 'lijiang'], 'visited 只应含用户确认的实际到访城市');
    assert.deepStrictEqual(visitMap.planned, ['chengdu', 'xiamen'], 'planned 应含规划中的城市');
    assert.ok(visitMap.wished.includes('sanya'), 'wished 应含收藏城市');
  });

  test('getTripStats 旅行统计', () => {
    // 使用独立用户避免与 getVisitMap 测试的数据累积
    trace.recordTrip('userStats', {
      cities: ['dali'],
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      status: 'completed',
      actualEvents: [{ type: 'city_visited', city: 'dali', actualStay: 3 }]
    });
    trace.recordTrip('userStats', {
      cities: ['dali', 'lijiang'],
      startDate: '2026-07-01',
      endDate: '2026-07-05',
      status: 'completed',
      actualEvents: [
        { type: 'city_visited', city: 'dali', actualStay: 2 },
        { type: 'city_visited', city: 'lijiang', actualStay: 3 }
      ]
    });
    trace.recordTrip('userStats', {
      cities: ['beijing'],
      status: 'cancelled'
    });

    const stats = trace.getTripStats('userStats');
    assert.strictEqual(stats.completedTrips, 2, '应统计2次完成旅行');
    assert.strictEqual(stats.totalCities, 2, '应有2个不同城市（dali, lijiang）');
    assert.ok(stats.totalDays > 0, '总天数应大于0');
    assert.strictEqual(stats.favoriteCluster, 'dali', '最常到访城市应为 dali');
  });

  // ==========================================================
  // 测试结果汇总
  // ==========================================================
  console.log('\n=== Phase 4 测试结果 ===');
  console.log(`  通过: ${passed}`);
  console.log(`  失败: ${failed}`);
  console.log(`  总计: ${passed + failed}`);

  if (failed > 0) {
    console.log('\n❌ 存在失败的测试用例');
    process.exit(1);
  } else {
    console.log('\n✅ 全部测试通过');
  }

})().catch(err => {
  console.error('\n测试执行出错:', err);
  process.exit(1);
});
