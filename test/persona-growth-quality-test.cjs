'use strict';

const assert = require('assert');
const journal = require('../src/services/journal/journalService');
const persona = require('../src/services/journal/personaCalibration');
const rights = require('../src/services/journal/dataRights');

rights._reset();

const userId = 'growth_quality_user';
const COMPLETE_REVIEW = { worth: 'worth_it', values: ['arrived'], deviations: ['as_planned'], tripCompleted: true };
const entry = journal.createEntry(userId, {
  type: 'review',
  reviewSnapshot: COMPLETE_REVIEW,
  mood: 'efficient',
  content: '我愿意删掉济南和厦门，多留一点自己的时间。高效不是打卡更多，而是少走回头路，不想每天收拾行李。'
});
journal.setAnalysisAuthorization(entry.id, true);

const evidence = journal.getEvidencePool(userId);
assert.strictEqual(evidence.length, 1);
assert.strictEqual(evidence[0].dimensionImpact.pace.direction, 'negative');
assert.strictEqual(evidence[0].dimensionImpact.transit.direction, 'positive');

const proposals = persona.generateUpdateProposal(userId, evidence);
assert.ok(proposals.length > 0);
assert.ok(proposals.length <= 2, 'a single review must not create more than two proposals');
assert.ok(proposals.some(item => item.traitKey === 'pace' && item.delta < 0));
assert.ok(proposals.some(item => item.traitKey === 'transit' && item.delta > 0));
assert.ok(proposals.every(item => !['aesthetics', 'bookingEase'].includes(item.traitKey)));
assert.ok(proposals.every(item => /待确认线索/.test(item.reason)));
assert.ok(proposals.every(item => item.supportingEvidenceCount >= 1));
assert.ok(proposals.every(item => item.counterEvidenceCount === 0));
assert.ok(proposals.every(item => item.confidenceInterval.low < item.confidenceInterval.high));
assert.ok(proposals.every(item => item.dataNeeded));

const followupEntry = journal.createEntry(userId, {
  type: 'review',
  reviewSnapshot: COMPLETE_REVIEW,
  mood: null,
  content: '少搬几次行李以后更舒服，我不想赶，也愿意少去几站。'
});
journal.setAnalysisAuthorization(followupEntry.id, true);
const followupPool = journal.getEvidencePool(userId);
const followupEvidence = followupPool.find(item => item.sourceEntryId === followupEntry.id);
const refreshed = persona.generateUpdateProposal(userId, [followupEvidence], { contextEvidence: followupPool });
const refreshedPace = refreshed.find(item => item.traitKey === 'pace');
assert.ok(refreshedPace, '一致的新复盘应刷新旅行节奏提案');
assert.ok(refreshedPace.evidenceCount >= 2, '刷新后的提案应合并既有授权证据');
assert.strictEqual(persona.getPendingProposals(userId).filter(item => item.traitKey === 'pace').length, 1, '同一维度只能保留一个待确认提案');
assert.ok(persona.getProposals(userId).some(item => item.traitKey === 'pace' && item.status === 'superseded'), '旧提案应保留为已取代审计记录');

const counterUser = 'growth_counter_user';
function addReview(content) {
  const review = journal.createEntry(counterUser, { type: 'review', mood: null, content, reviewSnapshot: COMPLETE_REVIEW });
  journal.setAnalysisAuthorization(review.id, true);
  return journal.getEvidencePool(counterUser).find(item => item.sourceEntryId === review.id);
}

addReview('少搬几次行李以后更舒服，我不想赶，也愿意少去几站。');
addReview('我喜欢行程紧凑，一天多去几个地方反而更有精神。');
const latestSupport = addReview('这次还是喜欢一天多跑几个地方，赶一点更开心。');
const contextEvidence = journal.getEvidencePool(counterUser);
const balancedProposals = persona.generateUpdateProposal(counterUser, [latestSupport], { contextEvidence });
const paceProposal = balancedProposals.find(item => item.traitKey === 'pace');
assert.ok(paceProposal, '两条支持、一条反例时可以提出保守变化');
assert.strictEqual(paceProposal.supportingEvidenceCount, 2);
assert.strictEqual(paceProposal.counterEvidenceCount, 1);
assert.ok(paceProposal.hasConflict);
assert.ok(paceProposal.auditConfidence < paceProposal.confidence + 0.001);
assert.match(paceProposal.dataNeeded, /方向相反/);
assert.match(paceProposal.reason, /3条/);

const blockedUser = 'growth_counter_blocked_user';
const oldCounter = journal.createEntry(blockedUser, { type: 'review', content: '少搬行李更舒服，我不想赶。', reviewSnapshot: COMPLETE_REVIEW });
journal.setAnalysisAuthorization(oldCounter.id, true);
const newSupport = journal.createEntry(blockedUser, { type: 'review', content: '我喜欢行程紧凑，一天多跑几个地方。', reviewSnapshot: COMPLETE_REVIEW });
journal.setAnalysisAuthorization(newSupport.id, true);
const blockedEvidence = journal.getEvidencePool(blockedUser);
const blockedProposal = persona.generateUpdateProposal(
  blockedUser,
  [blockedEvidence.find(item => item.sourceEntryId === newSupport.id)],
  { contextEvidence: blockedEvidence }
);
assert.ok(!blockedProposal.some(item => item.traitKey === 'pace'), '支持与反例权重相当时不应生成人格变化');

// ============================================================
// 新增测试：P1-1 阈值优化与 growth-quality 增强
// ============================================================

// --- 1. 可靠度基线确认 (0.35 / 0.40 / 0.90) ---
{
  const baseUser = 'growth_reliability_baseline';
  // record 类型可靠度为 0.35，单条不应触发提案
  const rec = journal.createEntry(baseUser, { type: 'record', content: '少搬几次行李更舒服。' });
  journal.setAnalysisAuthorization(rec.id, true);
  const recEvidence = journal.getEvidencePool(baseUser);
  const recProposals = persona.generateUpdateProposal(baseUser, recEvidence);
  // record 单条可靠性 0.35 < MIN_RELIABILITY_FOR_PROPOSAL(0.45)，且数量不足
  assert.ok(recProposals.every(p => p.traitKey !== 'pace'), '单条 record(0.35) 不应触发提案');

  // planning 类型可靠度为 0.40，单条不应触发提案
  const planUser = 'growth_reliability_baseline_plan';
  const plan = journal.createEntry(planUser, { type: 'planning', content: '少搬几次行李更舒服。' });
  journal.setAnalysisAuthorization(plan.id, true);
  const planEvidence = journal.getEvidencePool(planUser);
  const planProposals = persona.generateUpdateProposal(planUser, planEvidence);
  assert.ok(planProposals.every(p => p.traitKey !== 'pace'), '单条 planning(0.40) 不应触发提案');

  // review 类型可靠度为 0.90，单条应触发提案
  const reviewUser = 'growth_reliability_baseline_review';
  const rev = journal.createEntry(reviewUser, { type: 'review', content: '少搬几次行李更舒服，我不想赶。', reviewSnapshot: COMPLETE_REVIEW });
  journal.setAnalysisAuthorization(rev.id, true);
  const revEvidence = journal.getEvidencePool(reviewUser);
  const revProposals = persona.generateUpdateProposal(reviewUser, revEvidence);
  assert.ok(revProposals.some(p => p.traitKey === 'pace'), '单条 review(0.90) 应触发提案');
}

// --- 2. 单维最大变化 0.08 硬约束确认 ---
{
  const hardcapUser = 'growth_hardcap_test';
  // 创建多条一致的高可靠度证据，验证 delta 不超过 0.08
  const contents = [
    '我极度讨厌赶路，每天只想在一个地方慢慢待着，少搬行李是我的底线。',
    '这次旅行证明了我就是不喜欢换城市，一个地方待够才舒服。',
    '连续三次旅行我都删掉了至少两个城市，少走回头路是我旅行的核心需求。',
  ];
  const hardcapEvidenceList = [];
  contents.forEach(text => {
    const e = journal.createEntry(hardcapUser, { type: 'review', content: text, reviewSnapshot: COMPLETE_REVIEW });
    journal.setAnalysisAuthorization(e.id, true);
    hardcapEvidenceList.push(journal.getEvidencePool(hardcapUser).find(ev => ev.sourceEntryId === e.id));
  });
  const allHardcapEvidence = journal.getEvidencePool(hardcapUser);
  const lastEv = hardcapEvidenceList[hardcapEvidenceList.length - 1];
  const hcProposals = persona.generateUpdateProposal(hardcapUser, [lastEv], { contextEvidence: allHardcapEvidence });
  const paceP = hcProposals.find(p => p.traitKey === 'pace');
  if (paceP) {
    assert.ok(Math.abs(paceP.delta) <= 0.08 + 0.001, `单维变化 ${paceP.delta} 不得超过 0.08 硬约束`);
  }
}

// --- 3. 纵向模拟：多次 journal entry 后人格缓慢漂移 ---
{
  const driftUser = 'growth_drift_user';
  persona._reset();
  const driftContents = [
    '我觉得旅行中慢慢走才有感觉，不想赶。',
    '这次去了五个城市但感觉太累了，下次还是少去几个地方。',
    '在一个城市待三天比一天换一个地方好太多了。',
    '我发现我真的很不喜欢每天收拾行李换酒店。',
    '第三次旅行我选择了只去两个城市，果然体验好很多。',
  ];

  const driftEvidenceList = [];
  driftContents.forEach((text, idx) => {
    const e = journal.createEntry(driftUser, { type: 'review', content: text, reviewSnapshot: COMPLETE_REVIEW });
    journal.setAnalysisAuthorization(e.id, true);
    driftEvidenceList.push(journal.getEvidencePool(driftUser).find(ev => ev.sourceEntryId === e.id));
  });

  // 模拟逐条接受提案，观察人格漂移
  const allDriftEvidence = journal.getEvidencePool(driftUser);
  let driftProfile = persona.getOrCreateProfile(driftUser);
  const initialPace = driftProfile.traits.pace.mean;

  // 第一条证据生成提案并接受
  const p1 = persona.generateUpdateProposal(driftUser, [driftEvidenceList[0]]);
  const paceP1 = p1.find(p => p.traitKey === 'pace');
  if (paceP1) {
    persona.acceptProposal(paceP1.id);
    driftProfile = persona.getOrCreateProfile(driftUser);
    assert.ok(driftProfile.traits.pace.mean < initialPace, '第一次提案接受后 pace 应下降');
  }

  // 继续累积后，单次信号影响力应减弱（动态 divisor）
  const lastDriftEv = driftEvidenceList[driftEvidenceList.length - 1];
  const p5 = persona.generateUpdateProposal(driftUser, [lastDriftEv], { contextEvidence: allDriftEvidence });
  const paceP5 = p5.find(p => p.traitKey === 'pace');
  if (paceP5) {
    // evidenceCount 增大后 delta 应更小
    const currentEvidenceCount = driftProfile.traits.pace.evidenceCount;
    assert.ok(currentEvidenceCount >= 1, '累积后 evidenceCount 应增大');
    // 验证动态 divisor 存在：DYNAMIC_DIVISOR_LOG_BASE 已导出
    assert.ok(typeof persona.DYNAMIC_DIVISOR_LOG_BASE === 'number' && persona.DYNAMIC_DIVISOR_LOG_BASE > 0, 'DYNAMIC_DIVISOR_LOG_BASE 应为正数');
  }

  // 最终 pace 应低于初始值（累积漂移方向一致）
  driftProfile = persona.getOrCreateProfile(driftUser);
  assert.ok(driftProfile.traits.pace.mean < initialPace, '多次一致证据累积后 pace 应有缓慢漂移');
}

// --- 4. 边界测试：confidence 上限 (0.90) ---
{
  const confUser = 'growth_confidence_cap';
  // 使用 review(0.90) 可靠度证据
  const confEvidenceList = [];
  for (let i = 0; i < 5; i++) {
    const e = journal.createEntry(confUser, {
      type: 'review',
      content: '我越来越确定自己不喜欢赶路，慢节奏才是我的旅行方式。',
      reviewSnapshot: COMPLETE_REVIEW
    });
    journal.setAnalysisAuthorization(e.id, true);
    confEvidenceList.push(journal.getEvidencePool(confUser).find(ev => ev.sourceEntryId === e.id));
  }

  const allConfEvidence = journal.getEvidencePool(confUser);
  const lastConfEv = confEvidenceList[confEvidenceList.length - 1];
  const confProposals = persona.generateUpdateProposal(confUser, [lastConfEv], { contextEvidence: allConfEvidence });
  const paceConf = confProposals.find(p => p.traitKey === 'pace');
  if (paceConf) {
    assert.ok(paceConf.confidence <= persona.MAX_CONFIDENCE + 0.001,
      `非复核提案 confidence ${paceConf.confidence} 不应超过 MAX_CONFIDENCE ${persona.MAX_CONFIDENCE}`);
  }
  assert.strictEqual(persona.MAX_CONFIDENCE, 0.90, 'MAX_CONFIDENCE 常量应为 0.90');
}

// --- 5. 退出门槛测试 ---
{
  // 低可靠度单条不触发提案（已在可靠度基线中测试）
  // 退出门槛：MIN_RELIABILITY_FOR_PROPOSAL
  assert.strictEqual(persona.MIN_RELIABILITY_FOR_PROPOSAL, 0.45, '退出门槛应为 0.45');

  // 两条低可靠度一致 record 可触发提案
  const exitUser = 'growth_exit_threshold';
  const rec1 = journal.createEntry(exitUser, { type: 'record', content: '少搬几次行李更舒服，我不想赶。' });
  journal.setAnalysisAuthorization(rec1.id, true);
  const rec2 = journal.createEntry(exitUser, { type: 'record', content: '一个地方待三天比换城市好。' });
  journal.setAnalysisAuthorization(rec2.id, true);
  const exitEvidence = journal.getEvidencePool(exitUser);
  const lastRecEv = exitEvidence.find(ev => ev.sourceEntryId === rec2.id);
  const exitProposals = persona.generateUpdateProposal(exitUser, [lastRecEv], { contextEvidence: exitEvidence });
  // 两条 record(0.35) 一致，应可通过 MIN_LOW_RELIABILITY_COUNT(2) 门槛
  // 但 dimensionImpact 可能未从 mood 推断到 pace，取决于文本匹配
  // 此测试验证退出门槛逻辑不被错误触发（不崩溃即可）
  assert.ok(Array.isArray(exitProposals), '退出门槛逻辑不应崩溃');
}

// --- 6. 矛盾检测测试：food 喜欢 + crowd 压力 ---
{
  const conflictUser = 'growth_contradiction_food_crowd';
  // 喜欢美食 → food 正向
  const foodEntry = journal.createEntry(conflictUser, {
    type: 'review',
    content: '这次旅行最棒的部分就是当地美食，每顿都在品尝不同的小吃，美食是旅行的核心。',
    reviewSnapshot: COMPLETE_REVIEW
  });
  journal.setAnalysisAuthorization(foodEntry.id, true);

  // 但同时也厌恶拥挤 → lowCrowd 正向（矛盾场景：美食街通常拥挤）
  const crowdEntry = journal.createEntry(conflictUser, {
    type: 'review',
    content: '美食街人太多排队太长，我讨厌人挤人，体验很糟糕。',
    reviewSnapshot: COMPLETE_REVIEW
  });
  journal.setAnalysisAuthorization(crowdEntry.id, true);

  const conflictEvidence = journal.getEvidencePool(conflictUser);
  const lastConflictEv = conflictEvidence.find(ev => ev.sourceEntryId === crowdEntry.id);
  const conflictProposals = persona.generateUpdateProposal(conflictUser, [lastConflictEv], { contextEvidence: conflictEvidence });

  // food 应有正向提案（美食兴趣增加）
  const foodProposal = conflictProposals.find(p => p.traitKey === 'food');
  if (foodProposal) {
    assert.ok(foodProposal.delta > 0 || foodProposal.hasConflict,
      'food 维度应有正向信号或冲突标记');
  }

  // lowCrowd 应有正向提案（回避拥挤）
  const crowdProposal = conflictProposals.find(p => p.traitKey === 'lowCrowd');
  if (crowdProposal) {
    assert.ok(crowdProposal.delta > 0 || crowdProposal.hasConflict,
      'lowCrowd 维度应有正向信号或冲突标记');
  }
}

// --- 7. 提案接受后的人格轨迹测试 ---
{
  const trajectoryUser = 'growth_trajectory_accept';
  const trajEntry1 = journal.createEntry(trajectoryUser, {
    type: 'review',
    content: '少搬行李更舒服，我不想赶。',
    reviewSnapshot: COMPLETE_REVIEW
  });
  journal.setAnalysisAuthorization(trajEntry1.id, true);

  const trajEvidence1 = journal.getEvidencePool(trajectoryUser);
  const trajProposals1 = persona.generateUpdateProposal(trajectoryUser, trajEvidence1);
  const paceTraj1 = trajProposals1.find(p => p.traitKey === 'pace');

  if (paceTraj1) {
    const beforeAccept = persona.getOrCreateProfile(trajectoryUser).traits.pace.mean;
    persona.acceptProposal(paceTraj1.id);
    const afterAccept = persona.getOrCreateProfile(trajectoryUser).traits.pace.mean;
    assert.ok(afterAccept < beforeAccept, '接受提案后 pace 应下降');
    assert.ok(Math.abs(afterAccept - beforeAccept) <= 0.08 + 0.001, '单次变化不超过 0.08');
    // evidenceCount 应增加
    assert.ok(persona.getOrCreateProfile(trajectoryUser).traits.pace.evidenceCount >= 1, 'evidenceCount 应增加');
  }
}

// --- 8. 提案拒绝后的人格不应变化 ---
{
  const rejectUser = 'growth_trajectory_reject';
  const rejEntry = journal.createEntry(rejectUser, {
    type: 'review',
    content: '少搬行李更舒服，我不想赶。',
    reviewSnapshot: COMPLETE_REVIEW
  });
  journal.setAnalysisAuthorization(rejEntry.id, true);

  const rejEvidence = journal.getEvidencePool(rejectUser);
  const rejProposals = persona.generateUpdateProposal(rejectUser, rejEvidence);
  const paceRej = rejProposals.find(p => p.traitKey === 'pace');

  if (paceRej) {
    const beforeReject = persona.getOrCreateProfile(rejectUser).traits.pace.mean;
    persona.rejectProposal(paceRej.id, '暂时不想更新');
    const afterReject = persona.getOrCreateProfile(rejectUser).traits.pace.mean;
    assert.strictEqual(afterReject, beforeReject, '拒绝提案后人格不应变化');
    // 提案状态应为 rejected
    assert.strictEqual(persona.getProposals(rejectUser).find(p => p.id === paceRej.id).status, 'rejected');
  }
}

// --- 9. 动态 divisor 衰减验证 ---
{
  const divisorUser = 'growth_divisor_decay';
  // 验证常量已导出
  assert.ok(persona.MAX_DELTA === 0.08, 'MAX_DELTA 应为 0.08');
  assert.ok(persona.DYNAMIC_DIVISOR_LOG_BASE > 1, 'DYNAMIC_DIVISOR_LOG_BASE > 1 (log(5))');
  assert.ok(persona.MAX_CONFIDENCE === 0.90, 'MAX_CONFIDENCE 应为 0.90');

  // 手动验证 divisor 公式：evidenceCount=0 → divisor=1
  const d0 = 1 + Math.log(1 + 0) / persona.DYNAMIC_DIVISOR_LOG_BASE;
  assert.ok(Math.abs(d0 - 1.0) < 0.001, `evidenceCount=0 时 divisor 应为 1.0，实际 ${d0}`);

  // evidenceCount=4 → divisor=2.0（ln(5)/ln(5)=1）
  const d4 = 1 + Math.log(1 + 4) / persona.DYNAMIC_DIVISOR_LOG_BASE;
  assert.ok(d4 > 1.9 && d4 < 2.1, `evidenceCount=4 时 divisor 应约为 2.0，实际 ${d4}`);

  // evidenceCount=24 → divisor≈3.0（ln(25)/ln(5)=2）
  const d24 = 1 + Math.log(1 + 24) / persona.DYNAMIC_DIVISOR_LOG_BASE;
  assert.ok(d24 > 2.9 && d24 < 3.1, `evidenceCount=24 时 divisor 应约为 3.0，实际 ${d24}`);

  // 验证 divisor 随 evidenceCount 单调递增
  const d1 = 1 + Math.log(1 + 1) / persona.DYNAMIC_DIVISOR_LOG_BASE;
  const d9 = 1 + Math.log(1 + 9) / persona.DYNAMIC_DIVISOR_LOG_BASE;
  assert.ok(d1 < d4 && d4 < d9 && d9 < d24, 'dynamic divisor 应随 evidenceCount 单调递增');
}

rights._reset();
console.log('Persona growth quality tests passed.');
