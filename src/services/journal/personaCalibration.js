/**
 * 旅格 Travel Persona · 人格更新提案系统（Phase 4）
 *
 * 职责：
 * 1. 从新证据生成人格更新提案（总纲7.3）
 * 2. 提案状态管理：pending / accepted / rejected / modified
 * 3. 应用已接受的提案到人格档案（检查 lockedTraits）
 * 4. 维度锁定与证据排除
 *
 * 核心硬约束（总纲7.3）：
 * - 每次旅行的单维最大变化为 0.08
 * - 用户明确纠正不受该变化上限约束（reliability = 1.00）
 * - 出现冲突证据时优先提高不确定性，不要强行平均
 *
 * 退出门槛（Phase 4）：
 * - 单次取消（reliability 0.25）或收藏（reliability 0.20）不会改变长期人格
 * - 人格更新的最小高质量单元是一整趟已完成旅行（总纲7.3）
 * - 长期人格只在以下条件全部满足时写入：
 *   旅行已结束 + 有完整复盘或用户主动再调查 + 证据未被标记为敏感隔离
 *   + 用户允许该记录用于分析 + 更新提案通过用户确认
 *
 * 对应总纲：
 * - 7.2 证据等级（可靠度先验）
 * - 7.3 人格更新（贝叶斯更新、单维0.08上限、写入条件）
 * - 8.5 更新提案（不得静默发生，提案卡片必须显示变化维度/幅度/证据/操作）
 * - 12.5 用户权利（修正、删除或排除人格标签与证据）
 */

const crypto = require('crypto');
const { ValidationError } = require('../../utils/errors');
const { TRAIT_KEYS, clamp, round } = require('../../engines/personaEngine');
const { getStore } = require('../storage/sqliteStore');

// ============ 常量定义 ============

/**
 * 单维最大变化（总纲7.3 硬约束）
 */
const MAX_DELTA = 0.08;

/**
 * 置信度上限（人格维度 confidence 不超过此值，除非用户主动复核）
 */
const MAX_CONFIDENCE = 0.90;

/**
 * 动态 divisor 对数底数（用于纵向数据累积后单次信号衰减）
 */
const DYNAMIC_DIVISOR_LOG_BASE = Math.log(5);

/**
 * 提案状态
 * - pending: 等待用户确认
 * - accepted: 用户已接受
 * - rejected: 用户已拒绝
 * - modified: 用户已调整后接受
 */
const PROPOSAL_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  MODIFIED: 'modified',
  SUPERSEDED: 'superseded'
};

/**
 * 退出门槛：最低证据可靠度
 * 低于此值的单独证据不生成提案（总纲7.2：取消0.25、收藏0.20 不改变长期人格）
 */
const MIN_RELIABILITY_FOR_PROPOSAL = 0.45;

/**
 * 退出门槛：低可靠度证据需要至少 N 条一致才生成提案
 */
const MIN_LOW_RELIABILITY_COUNT = 2;
const REASSESSMENT_RESPONSES = new Set(['still_true', 'trip_specific', 'changed']);

/**
 * 心情到维度影响的映射（用于从证据 mood 推断维度变化方向）
 * 与 personaEngine.js 的 MOOD_EFFECTS 保持一致
 */
const MOOD_TRAIT_EFFECTS = {
  restore: { restoration: 0.06, nature: 0.03, social: -0.04, pace: -0.04, comfort: 0.03 },
  escape: { restoration: 0.07, nature: 0.04, social: -0.05, pace: -0.04, novelty: 0.02, lowCrowd: 0.03 },
  inspire: { aesthetics: 0.05, culture: 0.04, novelty: 0.04, authenticity: 0.02 },
  social: { social: 0.06, food: 0.04, pace: 0.02, restoration: -0.02 },
  efficient: { pace: 0.07, comfort: 0.03, aesthetics: 0.02, transit: 0.04, bookingEase: 0.03 },
  live: { restoration: 0.04, comfort: 0.04, pace: -0.05, novelty: 0.02, workation: 0.05 }
};

// ============ 内存存储 ============

/** userId -> PersonaProfile 人格档案 */
const personaProfiles = new Map();

/** proposalId -> 提案 */
const proposals = new Map();

/** userId -> Set<proposalId> 用户提案索引 */
const userProposalIndex = new Map();

const store = getStore();
const PROFILE_NAMESPACE = 'persona.profiles';
const PROPOSAL_NAMESPACE = 'persona.proposals';

for (const { key, value } of store.list(PROFILE_NAMESPACE)) {
  personaProfiles.set(key, value);
}
for (const { key, value } of store.list(PROPOSAL_NAMESPACE)) {
  proposals.set(key, value);
  getUserProposalSet(value.userId).add(key);
}

// Migrate historical data that may contain several pending cards for the same
// trait. Keep the strongest hypothesis active and preserve older ones as an
// audit trail instead of deleting them.
const pendingByUserTrait = new Map();
[...proposals.values()]
  .filter(proposal => proposal.status === PROPOSAL_STATUS.PENDING)
  .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  .forEach(proposal => {
    const key = `${proposal.userId}:${proposal.traitKey}`;
    const existing = pendingByUserTrait.get(key);
    const strength = Number(proposal.supportingEvidenceCount || proposal.evidenceCount || (proposal.evidenceIds || []).length || 0);
    const existingStrength = existing
      ? Number(existing.supportingEvidenceCount || existing.evidenceCount || (existing.evidenceIds || []).length || 0)
      : -1;
    if (!existing || strength >= existingStrength) {
      if (existing) {
        existing.status = PROPOSAL_STATUS.SUPERSEDED;
        existing.supersededAt = proposal.createdAt || new Date().toISOString();
        existing.supersededBy = proposal.id;
        store.set(PROPOSAL_NAMESPACE, existing.id, existing);
      }
      pendingByUserTrait.set(key, proposal);
      return;
    }
    proposal.status = PROPOSAL_STATUS.SUPERSEDED;
    proposal.supersededAt = existing.createdAt || new Date().toISOString();
    proposal.supersededBy = existing.id;
    store.set(PROPOSAL_NAMESPACE, proposal.id, proposal);
  });

// ============ 工具函数 ============

/**
 * 生成唯一 ID
 */
function generateId(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random.slice(0, 12)}`;
}

/**
 * 获取或创建用户提案索引
 */
function getUserProposalSet(userId) {
  if (!userProposalIndex.has(userId)) {
    userProposalIndex.set(userId, new Set());
  }
  return userProposalIndex.get(userId);
}

/**
 * 创建默认人格档案（16维全部为中性 0.5）
 *
 * @param {string} userId
 * @returns {Object} PersonaProfile
 */
function createDefaultProfile(userId) {
  const now = new Date().toISOString();
  const traits = {};

  TRAIT_KEYS.forEach(key => {
    traits[key] = {
      key,
      mean: 0.5,
      confidence: 0.5,
      evidenceCount: 0,
      lastUpdatedAt: now,
      lockedByUser: false
    };
  });

  return {
    profileId: generateId('profile'),
    userId,
    traits,
    lockedTraits: [],
    excludedEvidenceIds: [],
    createdAt: now,
    updatedAt: now
  };
}

/**
 * 获取或创建用户的人格档案
 *
 * @param {string} userId
 * @returns {Object} PersonaProfile
 */
function getOrCreateProfile(userId) {
  if (!personaProfiles.has(userId)) {
    const profile = createDefaultProfile(userId);
    personaProfiles.set(userId, profile);
    store.set(PROFILE_NAMESPACE, userId, profile);
  }
  return personaProfiles.get(userId);
}

/**
 * Read an existing profile without creating a new long-term record.
 * Planning uses this path so a cold-start request does not manufacture
 * persona history merely by asking for a recommendation.
 */
function getProfile(userId) {
  if (!userId) return null;
  return personaProfiles.get(userId) || null;
}

/**
 * Present evidence provenance without mutating the stored persona. A confirmed
 * trait can remain after its source is withdrawn because the user explicitly
 * accepted it, but it must no longer be described as actively evidenced.
 */
function getAuditedProfile(userId, activeEvidenceIds = []) {
  const profile = getOrCreateProfile(userId);
  const active = new Set(activeEvidenceIds);
  const acceptedByTrait = new Map();
  getProposals(userId, { status: PROPOSAL_STATUS.ACCEPTED }).forEach(proposal => {
    if (!acceptedByTrait.has(proposal.traitKey)) acceptedByTrait.set(proposal.traitKey, []);
    acceptedByTrait.get(proposal.traitKey).push(proposal);
  });

  const traits = Object.fromEntries(Object.entries(profile.traits || {}).map(([traitKey, trait]) => {
    const confirmations = acceptedByTrait.get(traitKey) || [];
    const historicalIds = Array.from(new Set(confirmations.flatMap(item => item.evidenceIds || [])));
    const activeIds = historicalIds.filter(id => active.has(id));
    const userConfirmed = confirmations.length > 0 || Boolean(trait.userAdjusted);
    return [traitKey, {
      ...trait,
      confirmationCount: confirmations.length,
      historicalEvidenceCount: historicalIds.length,
      activeEvidenceCount: activeIds.length,
      evidenceStatus: activeIds.length > 0
        ? 'active'
        : userConfirmed && historicalIds.length > 0 ? 'confirmed-source-withdrawn'
          : userConfirmed ? 'user-confirmed' : 'none'
    }];
  }));

  return { ...profile, traits };
}

/**
 * 从证据中提取维度影响
 *
 * 证据可以携带 dimensionImpact（显式声明），也可以通过 mood 推断
 *
 * @param {Object} evidence - 证据对象
 * @returns {Object} { [traitKey]: magnitude } 维度影响映射
 */
function extractTraitImpact(evidence) {
  const impact = {};

  // 优先使用显式声明的 dimensionImpact（EvidenceRef.json 定义）
  if (evidence.dimensionImpact) {
    Object.values(evidence.dimensionImpact).forEach(item => {
      if (item && item.traitKey && typeof item.magnitude === 'number') {
        // direction 为 negative 时取反
        const sign = item.direction === 'negative' ? -1 : 1;
        impact[item.traitKey] = (impact[item.traitKey] || 0) + item.magnitude * sign;
      }
    });
    return impact;
  }

  // 从 mood 推断维度影响
  if (evidence.mood && MOOD_TRAIT_EFFECTS[evidence.mood]) {
    const effects = MOOD_TRAIT_EFFECTS[evidence.mood];
    Object.entries(effects).forEach(([key, value]) => {
      impact[key] = (impact[key] || 0) + value;
    });
  }

  return impact;
}

function _analyzeEvidenceBalance(traitKey, direction, evidenceList, excludedSet = new Set()) {
  const supporting = [];
  const counter = [];
  for (const evidence of Array.isArray(evidenceList) ? evidenceList : []) {
    if (!evidence || excludedSet.has(evidence.id)) continue;
    const magnitude = extractTraitImpact(evidence)[traitKey];
    if (!magnitude || Math.sign(magnitude) === 0) continue;
    const item = {
      id: evidence.id,
      reliability: evidence.reliability || 0.45,
      signalLabels: Array.isArray(evidence.signalLabels) ? evidence.signalLabels : []
    };
    if (Math.sign(magnitude) === direction) supporting.push(item);
    else counter.push(item);
  }
  const supportWeight = supporting.reduce((sum, item) => sum + item.reliability, 0);
  const counterWeight = counter.reduce((sum, item) => sum + item.reliability, 0);
  const totalWeight = supportWeight + counterWeight;
  return {
    supporting,
    counter,
    supportWeight,
    counterWeight,
    consistency: totalWeight > 0 ? supportWeight / totalWeight : 1
  };
}

function _buildConfidenceInterval(proposedValue, balance) {
  const totalCount = balance.supporting.length + balance.counter.length;
  const totalWeight = balance.supportWeight + balance.counterWeight;
  const counterRatio = totalWeight > 0 ? balance.counterWeight / totalWeight : 0;
  const width = clamp(0.16 - Math.min(totalCount, 5) * 0.018 - Math.min(totalWeight, 3) * 0.012 + counterRatio * 0.08, 0.04, 0.18);
  return {
    low: round(clamp(proposedValue - width, 0.05, 0.95), 3),
    high: round(clamp(proposedValue + width, 0.05, 0.95), 3)
  };
}

function _buildDataNeeded(balance) {
  if (balance.counter.length > 0) {
    return '已经出现方向相反的体验；再记录一次相似场景，判断这是新趋势还是一次例外。';
  }
  if (balance.supporting.length < 2) {
    return '目前主要来自一次体验；至少还需要另一趟旅行中的一致信号。';
  }
  return '现有证据方向较一致；继续记录反例，防止长期人格被单一路线固化。';
}

function enrichProposalAudit(proposal, contextEvidence = [], excludedEvidenceIds = []) {
  if (!proposal) return proposal;
  if (proposal.sourceType === 'userReassessment') {
    return {
      ...proposal,
      supportingEvidenceCount: 1,
      counterEvidenceCount: 0,
      supportingSignalLabels: ['你主动完成了一次旅格复核'],
      counterSignalLabels: [],
      auditConfidence: 1,
      confidenceInterval: proposal.confidenceInterval || {
        low: round(clamp(proposal.proposedValue - 0.03, 0.05, 0.95), 3),
        high: round(clamp(proposal.proposedValue + 0.03, 0.05, 0.95), 3)
      },
      dataNeeded: '这是你的主动复核；确认后会覆盖这一维度的旧判断，之后仍可再次复核。',
      hasConflict: false
    };
  }
  const direction = Math.sign(Number(proposal.delta) || 0) || 1;
  const balance = _analyzeEvidenceBalance(
    proposal.traitKey,
    direction,
    contextEvidence,
    new Set(excludedEvidenceIds)
  );
  const fallbackSupport = Number(proposal.evidenceCount || (proposal.evidenceIds || []).length || 1);
  const supportingEvidenceCount = balance.supporting.length || fallbackSupport;
  const counterEvidenceCount = balance.counter.length;
  const consistency = balance.supporting.length || balance.counter.length ? balance.consistency : 1;
  return {
    ...proposal,
    supportingEvidenceCount,
    counterEvidenceCount,
    supportingSignalLabels: Array.from(new Set(balance.supporting.flatMap(item => item.signalLabels))).slice(0, 3),
    counterSignalLabels: Array.from(new Set(balance.counter.flatMap(item => item.signalLabels))).slice(0, 3),
    auditConfidence: round(clamp((proposal.confidence || 0.5) * consistency, 0, 1), 3),
    confidenceInterval: proposal.confidenceInterval || _buildConfidenceInterval(proposal.proposedValue, balance),
    dataNeeded: proposal.dataNeeded || _buildDataNeeded(balance),
    hasConflict: Boolean(proposal.hasConflict || counterEvidenceCount > 0)
  };
}

// ============ 核心接口 ============

/**
 * 从新证据生成人格更新提案
 *
 * 总纲7.3：人格更新不得静默发生
 * 总纲8.5：提案卡片必须显示建议变化的维度、变化幅度、使用的证据
 *
 * @param {string} userId - 用户 ID
 * @param {Array<Object>} newEvidence - 新证据列表
 * @param {Object} [options]
 * @param {boolean} [options.userExplicitCorrection=false] - 是否为用户明确纠正（不受0.08上限约束）
 * @returns {Array<Object>} 生成的提案列表
 *
 * 每条提案结构：
 * {
 *   id, userId, traitKey, currentValue, proposedValue, delta,
 *   evidenceIds, confidence, status: 'pending',
 *   createdAt, reason
 * }
 */
function generateUpdateProposal(userId, newEvidence = [], options = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'generateUpdateProposal' });
  }

  const { userExplicitCorrection = false, contextEvidence = newEvidence } = options;
  const profile = getOrCreateProfile(userId);

  // 过滤被排除的证据（总纲12.5：用户可排除证据）
  const excludedSet = new Set(profile.excludedEvidenceIds);
  const validEvidence = newEvidence.filter(e => !excludedSet.has(e.id));

  if (validEvidence.length === 0) {
    return [];
  }

  // A new review should refresh the user's current hypothesis for each touched
  // trait, not create another card that ignores earlier authorized evidence.
  const triggeredTraitKeys = new Set();
  validEvidence.forEach(evidence => {
    Object.keys(extractTraitImpact(evidence)).forEach(traitKey => triggeredTraitKeys.add(traitKey));
  });
  const analysisEvidence = Array.from(new Map(
    [...validEvidence, ...(Array.isArray(contextEvidence) ? contextEvidence : [])]
      .filter(evidence => evidence && !excludedSet.has(evidence.id))
      .map(evidence => [evidence.id, evidence])
  ).values()).filter(evidence => {
    return Object.keys(extractTraitImpact(evidence)).some(traitKey => triggeredTraitKeys.has(traitKey));
  });

  // 退出门槛检查：如果所有证据都是低可靠度（取消/收藏级别）且数量不足，不生成提案
  const highReliabilityEvidence = analysisEvidence.filter(e => (e.reliability || 0) >= MIN_RELIABILITY_FOR_PROPOSAL);
  const lowReliabilityEvidence = analysisEvidence.filter(e => (e.reliability || 0) < MIN_RELIABILITY_FOR_PROPOSAL);

  // 单次取消或收藏不会改变长期人格（退出门槛）
  if (highReliabilityEvidence.length === 0 && lowReliabilityEvidence.length < MIN_LOW_RELIABILITY_COUNT) {
    return [];
  }

  // 按维度聚合证据影响
  const traitAggregates = {}; // traitKey -> { evidenceIds, weightedDeltas, reliabilities }

  analysisEvidence.forEach(evidence => {
    const impact = extractTraitImpact(evidence);
    const reliability = evidence.reliability || 0.45;

    Object.entries(impact).forEach(([traitKey, magnitude]) => {
      if (!TRAIT_KEYS.includes(traitKey) || !triggeredTraitKeys.has(traitKey)) return;

      if (!traitAggregates[traitKey]) {
        traitAggregates[traitKey] = {
          evidenceIds: [],
          weightedDeltas: [],
          reliabilities: [],
          signalLabels: []
        };
      }

      // 加权 delta = magnitude × reliability（总纲7.3：posterior = update(prior, observation × sourceReliability)）
      const weightedDelta = magnitude * reliability;
      traitAggregates[traitKey].evidenceIds.push(evidence.id);
      traitAggregates[traitKey].weightedDeltas.push(weightedDelta);
      traitAggregates[traitKey].reliabilities.push(reliability);
      (evidence.signalLabels || []).forEach(label => {
        if (!traitAggregates[traitKey].signalLabels.includes(label)) {
          traitAggregates[traitKey].signalLabels.push(label);
        }
      });
    });
  });

  // 生成提案
  const newProposals = [];
  const now = new Date().toISOString();

  Object.entries(traitAggregates).forEach(([traitKey, agg]) => {
    const trait = profile.traits[traitKey];
    if (!trait) return;

    // 锁定的维度不生成提案（总纲12.5：用户锁定的维度自动更新不得修改）
    if (trait.lockedByUser || profile.lockedTraits.includes(traitKey)) {
      return;
    }

    // 计算聚合 delta
    // 使用加权平均，冲突证据时不确定性提高（总纲7.3：不要强行平均）
    const totalDelta = agg.weightedDeltas.reduce((sum, d) => sum + d, 0);
    const avgDelta = totalDelta / Math.max(agg.weightedDeltas.length, 1);

    // 纵向数据累积动态调整：entryCount 增多时，单次信号影响力减弱
    // divisor = 1 + ln(1 + existingEvidenceCount) / ln(5)
    // evidenceCount=0 → divisor=1, =4 → 2.0, =9 → ~2.43, =24 → 3.0
    const existingCount = Number(trait.evidenceCount || 0);
    const dynamicDivisor = 1 + Math.log(1 + existingCount) / DYNAMIC_DIVISOR_LOG_BASE;
    const adjustedDelta = avgDelta / dynamicDivisor;

    // 检查证据一致性（方向是否一致）
    const directions = agg.weightedDeltas.map(d => Math.sign(d));
    const positiveCount = directions.filter(d => d > 0).length;
    const negativeCount = directions.filter(d => d < 0).length;
    const localConflict = positiveCount > 0 && negativeCount > 0;

    // 应用单维最大变化约束（总纲7.3硬约束：0.08）
    // 用户明确纠正不受此上限约束（总纲7.3）
    let delta;
    if (userExplicitCorrection) {
      delta = round(avgDelta, 3);
    } else {
      delta = round(clamp(adjustedDelta, -MAX_DELTA, MAX_DELTA), 3);
    }

    // 如果 delta 为 0，不生成提案
    if (Math.abs(delta) < 0.001) return;

    // 退出门槛：低可靠度证据需要多次一致
    const maxReliability = Math.max(...agg.reliabilities);
    if (maxReliability < MIN_RELIABILITY_FOR_PROPOSAL && agg.evidenceIds.length < MIN_LOW_RELIABILITY_COUNT) {
      return;
    }

    const currentValue = trait.mean;
    const proposedValue = round(clamp(currentValue + delta, 0.05, 0.95), 3);
    const contextPool = Array.from(new Map(
      [...validEvidence, ...(Array.isArray(contextEvidence) ? contextEvidence : [])]
        .filter(Boolean)
        .map(evidence => [evidence.id, evidence])
    ).values());
    const balance = _analyzeEvidenceBalance(traitKey, Math.sign(delta), contextPool, excludedSet);
    if (!userExplicitCorrection && balance.counter.length > 0 && balance.supportWeight <= balance.counterWeight) {
      return;
    }
    const hasConflict = localConflict || balance.counter.length > 0;

    // 计算置信度（总纲7.3：confidence = f(evidenceCount, consistency, recency, userConfirmation)）
    // 非用户复核场景下，置信度上限为 MAX_CONFIDENCE（0.90）
    const evidenceCount = agg.evidenceIds.length;
    const avgReliability = agg.reliabilities.reduce((s, r) => s + r, 0) / agg.reliabilities.length;
    const consistency = hasConflict ? balance.consistency : 1.0;
    const rawConfidence = avgReliability * (0.5 + 0.3 * Math.min(evidenceCount / 3, 1)) * consistency;
    const confidenceCap = userExplicitCorrection ? 1.0 : MAX_CONFIDENCE;
    const confidence = round(clamp(rawConfidence, 0, confidenceCap), 3);

    const proposalId = generateId('proposal');
    const proposal = {
      id: proposalId,
      userId,
      traitKey,
      currentValue,
      proposedValue,
      delta,
      // 确保单维变化不超过 0.08（总纲7.3 硬约束）
      deltaCapped: !userExplicitCorrection && Math.abs(avgDelta) > MAX_DELTA,
      evidenceIds: [...agg.evidenceIds],
      evidenceCount,
      supportingEvidenceCount: balance.supporting.length || evidenceCount,
      counterEvidenceCount: balance.counter.length,
      supportingSignalLabels: Array.from(new Set(balance.supporting.flatMap(item => item.signalLabels))).slice(0, 3),
      counterSignalLabels: Array.from(new Set(balance.counter.flatMap(item => item.signalLabels))).slice(0, 3),
      confidence,
      auditConfidence: confidence,
      confidenceInterval: _buildConfidenceInterval(proposedValue, balance),
      dataNeeded: _buildDataNeeded(balance),
      hasConflict,
      status: PROPOSAL_STATUS.PENDING,
      createdAt: now,
      // 总纲8.5：提案必须说明为什么这些证据足够或仍不确定
      reason: _buildProposalReason(traitKey, delta, {
        ...agg,
        evidenceIds: Array.from(new Set([
          ...agg.evidenceIds,
          ...balance.supporting.map(item => item.id),
          ...balance.counter.map(item => item.id)
        ]))
      }, hasConflict, userExplicitCorrection)
    };

    newProposals.push(proposal);
  });

  const proposalLimit = userExplicitCorrection || newEvidence.length > 1 ? Infinity : 2;
  const activeManualTraits = new Set(
    getPendingProposals(userId)
      .filter(proposal => proposal.sourceType === 'userReassessment')
      .map(proposal => proposal.traitKey)
  );
  const selectedProposals = newProposals
    .filter(proposal => !activeManualTraits.has(proposal.traitKey))
    .sort((a, b) => (Math.abs(b.delta) * b.confidence) - (Math.abs(a.delta) * a.confidence))
    .slice(0, proposalLimit);

  selectedProposals.forEach(proposal => {
    getPendingProposals(userId)
      .filter(previous => previous.traitKey === proposal.traitKey)
      .forEach(previous => {
        previous.status = PROPOSAL_STATUS.SUPERSEDED;
        previous.supersededAt = now;
        previous.supersededBy = proposal.id;
        store.set(PROPOSAL_NAMESPACE, previous.id, previous);
      });
    proposals.set(proposal.id, proposal);
    getUserProposalSet(userId).add(proposal.id);
    store.set(PROPOSAL_NAMESPACE, proposal.id, proposal);
  });

  return selectedProposals;
}

/**
 * 构建提案理由文案（总纲8.5）
 */
function _buildProposalReason(traitKey, delta, agg, hasConflict, userExplicitCorrection) {
  const direction = delta > 0 ? '提高' : '降低';
  const magnitude = Math.abs(delta).toFixed(3);

  if (userExplicitCorrection) {
    return `用户明确纠正：${traitKey} 维度${direction} ${magnitude}（不受单维0.08上限约束）。`;
  }

  if (hasConflict) {
    return `证据存在方向冲突（${agg.evidenceIds.length}条），${traitKey} 维度${direction} ${magnitude}。冲突证据已提高不确定性，建议谨慎采纳。`;
  }

  if (agg.signalLabels && agg.signalLabels.length > 0) {
    return `这是一条待确认线索：${agg.signalLabels.slice(0, 2).join('；')}。目前只建议${direction} ${magnitude}，接受前不会进入长期人格。`;
  }

  return `基于 ${agg.evidenceIds.length} 条一致证据，${traitKey} 维度${direction} ${magnitude}（单维变化上限0.08）。`;
}

/**
 * 应用已接受的提案到人格档案
 *
 * 总纲7.3：长期人格只在提案通过用户确认后写入
 *
 * @param {Object} proposal - 已接受的提案
 * @param {Object} personaProfile - 人格档案
 * @returns {Object} { profile, applied: true, traitKey, oldValue, newValue }
 */
function applyProposal(proposal, personaProfile) {
  if (!proposal) {
    throw new ValidationError('提案不能为空', { operation: 'applyProposal' });
  }
  if (!personaProfile || !personaProfile.traits) {
    throw new ValidationError('人格档案无效', { operation: 'applyProposal' });
  }

  const trait = personaProfile.traits[proposal.traitKey];
  if (!trait) {
    throw new ValidationError(`维度不存在: ${proposal.traitKey}`, {
      operation: 'applyProposal',
      traitKey: proposal.traitKey
    });
  }

  // 检查 lockedTraits —— 锁定的维度不更新（总纲12.5）
  if (proposal.sourceType !== 'userReassessment'
    && (trait.lockedByUser || (personaProfile.lockedTraits || []).includes(proposal.traitKey))) {
    return {
      profile: personaProfile,
      applied: false,
      skipped: true,
      reason: `维度 ${proposal.traitKey} 已被用户锁定，不更新`,
      traitKey: proposal.traitKey
    };
  }

  const oldValue = trait.mean;
  const newValue = proposal.proposedValue;

  // 更新维度值
  trait.mean = newValue;
  trait.evidenceCount = (trait.evidenceCount || 0) + proposal.evidenceCount;
  trait.lastUpdatedAt = new Date().toISOString();
  if (proposal.sourceType === 'userReassessment') {
    trait.lastReconfirmedAt = trait.lastUpdatedAt;
    trait.userAdjusted = true;
  }
  // 提升置信度（更多证据 → 更高置信度）
  trait.confidence = round(
    clamp((trait.confidence || 0.5) + proposal.confidence * 0.1, 0, 1),
    3
  );

  // 更新档案时间戳
  personaProfile.updatedAt = new Date().toISOString();

  // 更新提案状态
  proposal.status = PROPOSAL_STATUS.ACCEPTED;
  proposal.appliedAt = new Date().toISOString();
  if (proposal.reassessmentId && Array.isArray(personaProfile.reassessmentHistory)) {
    const reassessment = personaProfile.reassessmentHistory.find(item => item.id === proposal.reassessmentId);
    if (reassessment) {
      reassessment.status = 'accepted';
      reassessment.appliedAt = proposal.appliedAt;
    }
  }
  if (personaProfile.userId) {
    personaProfiles.set(personaProfile.userId, personaProfile);
    store.set(PROFILE_NAMESPACE, personaProfile.userId, personaProfile);
  }
  store.set(PROPOSAL_NAMESPACE, proposal.id, proposal);

  return {
    profile: personaProfile,
    applied: true,
    traitKey: proposal.traitKey,
    oldValue,
    newValue
  };
}

function acceptProposal(proposalId, expectedUserId = null) {
  const proposal = proposals.get(proposalId);
  if (!proposal) {
    throw new ValidationError(`提案不存在: ${proposalId}`, {
      operation: 'acceptProposal',
      proposalId
    });
  }
  if (expectedUserId && proposal.userId !== expectedUserId) {
    throw new ValidationError('提案不存在或无权访问', {
      operation: 'acceptProposal',
      proposalId
    });
  }
  return applyProposal(proposal, getOrCreateProfile(proposal.userId));
}

/**
 * 拒绝提案
 *
 * 总纲8.5：用户可选择「暂不更新」
 *
 * @param {string} proposalId - 提案 ID
 * @param {string} [reason=''] - 拒绝原因
 * @returns {Object} 更新后的提案
 */
function rejectProposal(proposalId, reason = '', expectedUserId = null) {
  const proposal = proposals.get(proposalId);
  if (!proposal) {
    throw new ValidationError(`提案不存在: ${proposalId}`, {
      operation: 'rejectProposal',
      proposalId
    });
  }
  if (expectedUserId && proposal.userId !== expectedUserId) {
    throw new ValidationError('提案不存在或无权访问', {
      operation: 'rejectProposal',
      proposalId
    });
  }

  proposal.status = PROPOSAL_STATUS.REJECTED;
  proposal.rejectedAt = new Date().toISOString();
  proposal.rejectReason = reason;
  if (proposal.reassessmentId) {
    const profile = getOrCreateProfile(proposal.userId);
    const reassessment = (profile.reassessmentHistory || []).find(item => item.id === proposal.reassessmentId);
    if (reassessment) {
      reassessment.status = 'rejected';
      reassessment.rejectedAt = proposal.rejectedAt;
      profile.updatedAt = proposal.rejectedAt;
      store.set(PROFILE_NAMESPACE, profile.userId, profile);
    }
  }
  store.set(PROPOSAL_NAMESPACE, proposal.id, proposal);

  return proposal;
}

/**
 * 锁定维度
 *
 * 总纲12.5：用户可锁定人格维度，自动更新不得修改
 * 总纲7.2：用户明确纠正或锁定（reliability 1.00），可立即覆盖对应判断
 *
 * @param {Object} personaProfile - 人格档案
 * @param {string} traitKey - 要锁定的维度 key
 * @returns {Object} 更新后的人格档案
 */
function lockTrait(personaProfile, traitKey) {
  if (!personaProfile || !personaProfile.traits) {
    throw new ValidationError('人格档案无效', { operation: 'lockTrait' });
  }
  if (!TRAIT_KEYS.includes(traitKey)) {
    throw new ValidationError(`无效的维度 key: ${traitKey}`, {
      operation: 'lockTrait',
      traitKey
    });
  }

  const trait = personaProfile.traits[traitKey];
  trait.lockedByUser = true;
  trait.lastUpdatedAt = new Date().toISOString();

  // 同步到 lockedTraits 数组（去重）
  if (!personaProfile.lockedTraits.includes(traitKey)) {
    personaProfile.lockedTraits.push(traitKey);
  }

  personaProfile.updatedAt = new Date().toISOString();
  if (personaProfile.userId) store.set(PROFILE_NAMESPACE, personaProfile.userId, personaProfile);

  return personaProfile;
}

/**
 * 解锁维度
 *
 * @param {Object} personaProfile - 人格档案
 * @param {string} traitKey - 要解锁的维度 key
 * @returns {Object} 更新后的人格档案
 */
function unlockTrait(personaProfile, traitKey) {
  if (!personaProfile || !personaProfile.traits) {
    throw new ValidationError('人格档案无效', { operation: 'unlockTrait' });
  }

  const trait = personaProfile.traits[traitKey];
  if (trait) {
    trait.lockedByUser = false;
    trait.lastUpdatedAt = new Date().toISOString();
  }

  personaProfile.lockedTraits = (personaProfile.lockedTraits || []).filter(k => k !== traitKey);
  personaProfile.updatedAt = new Date().toISOString();
  if (personaProfile.userId) store.set(PROFILE_NAMESPACE, personaProfile.userId, personaProfile);

  return personaProfile;
}

/**
 * 排除证据
 *
 * 总纲12.5：用户必须能够排除人格标签与证据
 * 排除后，该证据不再参与后续的人格更新提案生成
 *
 * @param {Object} personaProfile - 人格档案
 * @param {string} evidenceId - 要排除的证据 ID
 * @returns {Object} 更新后的人格档案
 */
function excludeEvidence(personaProfile, evidenceId) {
  if (!personaProfile) {
    throw new ValidationError('人格档案无效', { operation: 'excludeEvidence' });
  }
  if (!evidenceId) {
    throw new ValidationError('evidenceId 不能为空', { operation: 'excludeEvidence' });
  }

  if (!personaProfile.excludedEvidenceIds) {
    personaProfile.excludedEvidenceIds = [];
  }

  // 去重添加
  if (!personaProfile.excludedEvidenceIds.includes(evidenceId)) {
    personaProfile.excludedEvidenceIds.push(evidenceId);
  }

  personaProfile.updatedAt = new Date().toISOString();
  if (personaProfile.userId) store.set(PROFILE_NAMESPACE, personaProfile.userId, personaProfile);

  return personaProfile;
}

/**
 * 获取用户的所有提案
 *
 * @param {string} userId
 * @param {Object} [filters]
 * @param {string} [filters.status] - 按状态过滤
 * @returns {Array<Object>} 提案列表
 */
function getProposals(userId, filters = {}) {
  const proposalIds = getUserProposalSet(userId);
  const result = [];

  for (const id of proposalIds) {
    const proposal = proposals.get(id);
    if (!proposal) continue;
    if (filters.status && proposal.status !== filters.status) continue;
    result.push(proposal);
  }

  return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * 获取待确认的提案
 *
 * @param {string} userId
 * @returns {Array<Object>} pending 状态的提案
 */
function getPendingProposals(userId) {
  return getProposals(userId, { status: PROPOSAL_STATUS.PENDING });
}

function reassessTrait(userId, traitKey, input = {}) {
  if (!userId) throw new ValidationError('userId 不能为空', { operation: 'reassessTrait' });
  if (!TRAIT_KEYS.includes(traitKey)) {
    throw new ValidationError(`无效的维度 key: ${traitKey}`, { operation: 'reassessTrait', traitKey });
  }
  const response = String(input.response || '');
  if (!REASSESSMENT_RESPONSES.has(response)) {
    throw new ValidationError('无效的旅格复核选项', { operation: 'reassessTrait', response });
  }

  const profile = getOrCreateProfile(userId);
  const trait = profile.traits[traitKey];
  if (!trait || Number(trait.evidenceCount || 0) <= 0) {
    throw new ValidationError('这个维度还没有形成长期人格判断', { operation: 'reassessTrait', traitKey });
  }

  const now = new Date().toISOString();
  const reassessment = {
    id: generateId('reassessment'),
    traitKey,
    response,
    currentValue: Number(trait.mean),
    targetValue: Number(trait.mean),
    status: response === 'still_true' ? 'confirmed' : 'pending',
    createdAt: now
  };
  profile.reassessmentHistory = Array.isArray(profile.reassessmentHistory) ? profile.reassessmentHistory : [];

  if (response === 'still_true') {
    trait.lastReconfirmedAt = now;
    trait.reconfirmationCount = Number(trait.reconfirmationCount || 0) + 1;
    trait.confidence = round(clamp(Number(trait.confidence || 0.5) + 0.02, 0, 1), 3);
    trait.lastUpdatedAt = now;
    profile.reassessmentHistory.push(reassessment);
    profile.reassessmentHistory = profile.reassessmentHistory.slice(-50);
    profile.updatedAt = now;
    store.set(PROFILE_NAMESPACE, userId, profile);
    return { profile, reassessment, proposal: null };
  }

  const targetValue = response === 'trip_specific' ? 0.5 : Number(input.targetValue);
  if (!Number.isFinite(targetValue) || targetValue < 0.1 || targetValue > 0.9) {
    throw new ValidationError('复核后的维度值必须在 0.10 到 0.90 之间', { operation: 'reassessTrait', targetValue });
  }
  if (Math.abs(targetValue - Number(trait.mean)) < 0.01) {
    throw new ValidationError('新的位置需要与当前判断有所不同', { operation: 'reassessTrait', targetValue });
  }

  const proposalId = generateId('proposal');
  reassessment.targetValue = round(targetValue, 3);
  reassessment.proposalId = proposalId;
  const delta = round(targetValue - Number(trait.mean), 3);
  const proposal = {
    id: proposalId,
    userId,
    traitKey,
    currentValue: Number(trait.mean),
    proposedValue: round(targetValue, 3),
    delta,
    deltaCapped: false,
    evidenceIds: [],
    evidenceCount: 0,
    supportingEvidenceCount: 1,
    counterEvidenceCount: 0,
    confidence: 1,
    auditConfidence: 1,
    confidenceInterval: {
      low: round(clamp(targetValue - 0.03, 0.05, 0.95), 3),
      high: round(clamp(targetValue + 0.03, 0.05, 0.95), 3)
    },
    dataNeeded: '这是你的主动复核；确认后会覆盖这一维度的旧判断，之后仍可再次复核。',
    hasConflict: false,
    status: PROPOSAL_STATUS.PENDING,
    sourceType: 'userReassessment',
    reassessmentId: reassessment.id,
    createdAt: now,
    reason: response === 'trip_specific'
      ? '你认为原判断更像那一次旅行的状态，因此建议先回到中性位置。'
      : '你主动重新定位了这个维度；接受前不会改写长期人格。'
  };

  getPendingProposals(userId)
    .filter(previous => previous.traitKey === traitKey)
    .forEach(previous => {
      previous.status = PROPOSAL_STATUS.SUPERSEDED;
      previous.supersededAt = now;
      previous.supersededBy = proposal.id;
      store.set(PROPOSAL_NAMESPACE, previous.id, previous);
    });
  proposals.set(proposal.id, proposal);
  getUserProposalSet(userId).add(proposal.id);
  store.set(PROPOSAL_NAMESPACE, proposal.id, proposal);
  profile.reassessmentHistory.push(reassessment);
  profile.reassessmentHistory = profile.reassessmentHistory.slice(-50);
  profile.updatedAt = now;
  store.set(PROFILE_NAMESPACE, userId, profile);

  return { profile, reassessment, proposal };
}

function reconcilePendingProposals(userId, activeEvidenceIds = []) {
  const active = new Set(activeEvidenceIds);
  const now = new Date().toISOString();
  const invalidated = [];
  getPendingProposals(userId).forEach(proposal => {
    if (proposal.sourceType === 'userReassessment') return;
    const evidenceIds = Array.isArray(proposal.evidenceIds) ? proposal.evidenceIds : [];
    if (evidenceIds.length > 0 && evidenceIds.every(id => active.has(id))) return;
    proposal.status = PROPOSAL_STATUS.SUPERSEDED;
    proposal.supersededAt = now;
    proposal.supersededBy = null;
    proposal.supersededReason = 'evidence-revoked';
    store.set(PROPOSAL_NAMESPACE, proposal.id, proposal);
    invalidated.push(proposal.id);
  });
  return { invalidatedProposalIds: invalidated };
}

function mergeProfiles(sourceProfile, targetProfile, targetUserId) {
  if (!sourceProfile) return targetProfile || null;
  if (!targetProfile) {
    sourceProfile.userId = targetUserId;
    sourceProfile.updatedAt = new Date().toISOString();
    return sourceProfile;
  }

  const now = new Date().toISOString();
  TRAIT_KEYS.forEach(traitKey => {
    const source = sourceProfile.traits?.[traitKey];
    const target = targetProfile.traits?.[traitKey];
    if (!source || !target) return;

    const sourceEvidence = Number(source.evidenceCount || 0);
    const targetEvidence = Number(target.evidenceCount || 0);
    const sourceExplicit = Boolean(source.lockedByUser || source.userAdjusted);
    const targetExplicit = Boolean(target.lockedByUser || target.userAdjusted);

    if (!targetExplicit && sourceExplicit) {
      target.mean = source.mean;
      target.userAdjusted = Boolean(source.userAdjusted);
    } else if (!targetExplicit && sourceEvidence > 0 && targetEvidence === 0) {
      target.mean = source.mean;
      target.userAdjusted = Boolean(source.userAdjusted);
    } else if (!targetExplicit && !sourceExplicit && sourceEvidence > 0) {
      const sourceWeight = Math.max(1, sourceEvidence) * Math.max(0.25, Number(source.confidence || 0.5));
      const targetWeight = Math.max(1, targetEvidence) * Math.max(0.25, Number(target.confidence || 0.5));
      target.mean = round(clamp(
        ((Number(source.mean) * sourceWeight) + (Number(target.mean) * targetWeight)) / (sourceWeight + targetWeight),
        0,
        1
      ), 3);
    }

    target.evidenceCount = sourceEvidence + targetEvidence;
    target.confidence = Math.max(Number(source.confidence || 0.5), Number(target.confidence || 0.5));
    target.lockedByUser = Boolean(source.lockedByUser || target.lockedByUser);
    target.lastUpdatedAt = [source.lastUpdatedAt, target.lastUpdatedAt].filter(Boolean).sort().at(-1) || now;
    if (source.lastReconfirmedAt && (!target.lastReconfirmedAt || source.lastReconfirmedAt > target.lastReconfirmedAt)) {
      target.lastReconfirmedAt = source.lastReconfirmedAt;
    }
  });

  targetProfile.userId = targetUserId;
  targetProfile.lockedTraits = Array.from(new Set([
    ...(targetProfile.lockedTraits || []),
    ...(sourceProfile.lockedTraits || [])
  ]));
  targetProfile.excludedEvidenceIds = Array.from(new Set([
    ...(targetProfile.excludedEvidenceIds || []),
    ...(sourceProfile.excludedEvidenceIds || [])
  ]));
  targetProfile.reassessmentHistory = [
    ...(targetProfile.reassessmentHistory || []),
    ...(sourceProfile.reassessmentHistory || [])
  ].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).slice(-50);
  targetProfile.createdAt = [targetProfile.createdAt, sourceProfile.createdAt].filter(Boolean).sort()[0] || now;
  targetProfile.updatedAt = now;
  return targetProfile;
}

/**
 * Merge a guest persona into an account. Explicit user corrections and locks
 * outrank inferred values; unconfirmed proposals remain an audit trail.
 */
function transferUserData(sourceUserId, targetUserId) {
  if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
    return { profileTransferred: false, proposalsTransferred: 0 };
  }

  const sourceProfile = personaProfiles.get(sourceUserId) || null;
  const targetProfile = personaProfiles.get(targetUserId) || null;
  const mergedProfile = mergeProfiles(sourceProfile, targetProfile, targetUserId);
  if (mergedProfile) {
    personaProfiles.set(targetUserId, mergedProfile);
    store.set(PROFILE_NAMESPACE, targetUserId, mergedProfile);
  }
  personaProfiles.delete(sourceUserId);
  store.delete(PROFILE_NAMESPACE, sourceUserId);

  let proposalsTransferred = 0;
  const targetProposalIds = getUserProposalSet(targetUserId);
  for (const proposalId of [...getUserProposalSet(sourceUserId)]) {
    const proposal = proposals.get(proposalId);
    if (!proposal) continue;
    if (proposal.userId === sourceUserId) {
      proposal.userId = targetUserId;
      store.set(PROPOSAL_NAMESPACE, proposalId, proposal);
      proposalsTransferred++;
    }
    if (proposal.userId === targetUserId) targetProposalIds.add(proposalId);
  }
  userProposalIndex.delete(sourceUserId);

  const now = new Date().toISOString();
  const activeByTrait = new Map();
  getPendingProposals(targetUserId)
    .sort((a, b) => {
      const explicitDifference = Number(b.sourceType === 'userReassessment') - Number(a.sourceType === 'userReassessment');
      if (explicitDifference) return explicitDifference;
      const strengthDifference = Number(b.supportingEvidenceCount || b.evidenceCount || 0)
        - Number(a.supportingEvidenceCount || a.evidenceCount || 0);
      return strengthDifference || String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    })
    .forEach(proposal => {
      const active = activeByTrait.get(proposal.traitKey);
      if (!active) {
        activeByTrait.set(proposal.traitKey, proposal);
        return;
      }
      proposal.status = PROPOSAL_STATUS.SUPERSEDED;
      proposal.supersededAt = now;
      proposal.supersededBy = active.id;
      proposal.supersededReason = 'identity-merge';
      store.set(PROPOSAL_NAMESPACE, proposal.id, proposal);
    });

  return { profileTransferred: Boolean(sourceProfile), proposalsTransferred };
}

function deleteUserData(userId) {
  const proposalIds = [...getUserProposalSet(userId)];
  proposalIds.forEach(proposalId => {
    proposals.delete(proposalId);
    store.delete(PROPOSAL_NAMESPACE, proposalId);
  });
  userProposalIndex.delete(userId);
  const profileDeleted = personaProfiles.delete(userId);
  store.delete(PROFILE_NAMESPACE, userId);
  return { proposalsDeleted: proposalIds.length, profileDeleted };
}

// ============ 测试辅助 ============

/**
 * 重置所有内存存储（仅用于测试）
 */
function _reset() {
  personaProfiles.clear();
  proposals.clear();
  userProposalIndex.clear();
  store.clear(PROFILE_NAMESPACE);
  store.clear(PROPOSAL_NAMESPACE);
}

/**
 * 获取存储统计（调试用）
 */
function _getStats() {
  return {
    totalProfiles: personaProfiles.size,
    totalProposals: proposals.size,
    pendingProposals: [...proposals.values()].filter(p => p.status === PROPOSAL_STATUS.PENDING).length
  };
}

module.exports = {
  // 常量
  MAX_DELTA,
  MAX_CONFIDENCE,
  DYNAMIC_DIVISOR_LOG_BASE,
  PROPOSAL_STATUS,
  MIN_RELIABILITY_FOR_PROPOSAL,
  TRAIT_KEYS,

  // 人格档案管理
  getProfile,
  getAuditedProfile,
  getOrCreateProfile,
  createDefaultProfile,

  // 核心接口
  generateUpdateProposal,
  enrichProposalAudit,
  applyProposal,
  acceptProposal,
  rejectProposal,
  lockTrait,
  unlockTrait,
  excludeEvidence,
  reassessTrait,

  // 查询
  getProposals,
  getPendingProposals,
  reconcilePendingProposals,
  transferUserData,
  deleteUserData,

  // 测试辅助
  _reset,
  _getStats
};
