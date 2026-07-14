/**
 * 旅格 Travel Persona · 手账系统服务（Phase 4）
 *
 * 职责：
 * 1. 手账条目的增删改查（record / review / planning 三种类型）
 * 2. 分析授权管理 —— 总纲7.2：不授权分析的记录绝不进入人格引擎
 * 3. 敏感字段标记 —— 总纲8.4 / 12.1：content 字段标记为 sensitive，
 *    分享输出时自动移除，不回显敏感原文
 * 4. 证据池维护 —— 已授权分析的手账条目可派生为证据，供人格校准使用
 *
 * 存储说明：
 * - 运行时索引使用 Map，所有长期数据同步写入 SQLite
 * - 手账同时是私人作品和可选算法证据，两者技术隔离（总纲8.1）
 *
 * 对应总纲：
 * - 7.2 证据等级（可靠度先验）
 * - 8.1 手账的双重属性
 * - 8.2 记录模式（只是记下来 / 帮我理解 / 让下一次更懂我）
 * - 12.1 数据分类（L2 私人：手账原文加密，默认不训练）
 */

const crypto = require('crypto');
const { ValidationError } = require('../../utils/errors');
const { getStore } = require('../storage/sqliteStore');

// ============ 常量定义 ============

/**
 * 手账条目类型
 * - record: 旅中记录（轻量，一张照片或一段文字即可保存）
 * - review: 旅后完整复盘（总纲8.4，五类证据）
 * - planning: 行前规划记录
 */
const ENTRY_TYPES = ['record', 'review', 'planning'];

/**
 * 证据可靠度先验（总纲7.2 证据等级表）
 * 手账类型到证据可靠度的映射
 */
const EVIDENCE_RELIABILITY = {
  review: 0.90,    // 完整旅后复盘 —— 可单独提出长期人格更新
  planning: 0.40,  // 行前取舍 —— 单条不足以改变长期人格
  record: 0.35     // 旅中记录 —— 需要多次一致才形成提案
};

/**
 * 敏感字段列表（总纲8.4 / 12.1 L2 私人）
 * 这些字段在分享、通知、推送中不得出现
 */
const SENSITIVE_FIELDS = ['content', 'reviewSnapshot'];

/**
 * 敏感等级（总纲8.1 / 12.1）
 */
const SENSITIVITY_LEVELS = ['normal', 'sensitive', 'restricted'];

const ROUTE_CHANGE_REASONS = new Set(['budget', 'pace', 'interest', 'logistics', 'unexpected', 'other']);
const REVIEW_WORTH = new Set(['worth_it', 'mostly_worth', 'mixed', 'not_worth']);
const REVIEW_VALUES = new Set(['arrived', 'new_experience', 'connection', 'own_time', 'clarity', 'joy']);
const REVIEW_DEVIATIONS = new Set(['fewer_places', 'longer_stays', 'overspent', 'underspent', 'more_tired', 'more_relaxed', 'changed_route', 'as_planned']);

/**
 * 书签类型（收藏语义）
 * - wishlist: 备选 —— 暂存待决定，不代表喜欢
 * - avoid: 避雷 —— 明确不想去
 * - null: 取消书签
 */
const BOOKMARK_TYPES = new Set(['wishlist', 'avoid']);

/**
 * 隐式信号类型
 * - repeatedView: 反复查看某条目
 * - longStay: 停留时长过长（表示兴趣）
 * - cityRemoved: 从行程中删除某城市
 * - pathSwitch: 路径切换
 */
const IMPLICIT_SIGNAL_TYPES = new Set(['repeatedView', 'longStay', 'cityRemoved', 'pathSwitch']);

/**
 * 隐式信号默认权重范围（极低，仅用于推荐排序的轻微先验）
 */
const IMPLICIT_SIGNAL_WEIGHTS = {
  repeatedView: 0.02,
  longStay: 0.03,
  cityRemoved: 0.04,
  pathSwitch: 0.05
};

// ============ 内存存储 ============

/** entryId -> 手账条目 */
const entries = new Map();

/** userId -> Set<entryId> 用户手账索引 */
const userEntryIndex = new Map();

/** evidenceId -> 证据对象（从已授权手账派生） */
const evidencePool = new Map();

/** userId -> Set<evidenceId> 用户证据索引 */
const userEvidenceIndex = new Map();

/** entryId -> { userId, type, createdAt } 书签索引（收藏标记） */
const bookmarks = new Map();

/** userId -> Set<entryId> 用户书签索引 */
const userBookmarkIndex = new Map();

/** signalId -> 隐式信号对象 */
const implicitSignals = new Map();

/** userId -> Set<signalId> 用户隐式信号索引 */
const userImplicitSignalIndex = new Map();

const store = getStore();
const ENTRY_NAMESPACE = 'journal.entries';
const EVIDENCE_NAMESPACE = 'journal.evidence';
const BOOKMARK_NAMESPACE = 'journal.bookmarks';
const IMPLICIT_SIGNAL_NAMESPACE = 'journal.implicit_signals';

for (const { key, value } of store.list(ENTRY_NAMESPACE)) {
  entries.set(key, value);
  getUserEntrySet(value.userId).add(key);
}
for (const { key, value } of store.list(EVIDENCE_NAMESPACE)) {
  evidencePool.set(key, value);
  getUserEvidenceSet(value.userId).add(key);
}
for (const { key, value } of store.list(BOOKMARK_NAMESPACE)) {
  bookmarks.set(key, value);
  getUserBookmarkSet(value.userId).add(key);
}
for (const { key, value } of store.list(IMPLICIT_SIGNAL_NAMESPACE)) {
  implicitSignals.set(key, value);
  getUserImplicitSignalSet(value.userId).add(key);
}

// 旧版本把所有自由文本都当成 0.90 的完整复盘。启动时按结构化完整度
// 重新分级，已由用户确认的人格变化保留，但旧证据不再继续高权重扩散。
for (const [evidenceId, evidence] of evidencePool.entries()) {
  const entry = entries.get(evidence.sourceEntryId);
  if (!entry) continue;
  const completeReview = _isCompleteTripReview(entry);
  const expectedType = completeReview ? 'tripReview' : 'journalEntry';
  const expectedReliability = _resolveEvidenceReliability(entry);
  if (evidence.type !== expectedType || evidence.reliability !== expectedReliability || evidence.reviewCompleteness == null) {
    evidence.type = expectedType;
    evidence.reliability = expectedReliability;
    evidence.reviewCompleteness = completeReview ? 'complete' : 'partial';
    evidence.reviewSnapshot = completeReview ? { ...entry.reviewSnapshot } : null;
    store.set(EVIDENCE_NAMESPACE, evidenceId, evidence);
  }
}

// ============ 工具函数 ============

/**
 * 生成唯一 ID
 * @param {string} prefix - 前缀，如 'entry' / 'evidence'
 * @returns {string}
 */
function generateId(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random.slice(0, 12)}`;
}

/**
 * 获取或创建用户的条目索引
 * @param {string} userId
 * @returns {Set<string>}
 */
function getUserEntrySet(userId) {
  if (!userEntryIndex.has(userId)) {
    userEntryIndex.set(userId, new Set());
  }
  return userEntryIndex.get(userId);
}

/**
 * 获取或创建用户的证据索引
 * @param {string} userId
 * @returns {Set<string>}
 */
function getUserEvidenceSet(userId) {
  if (!userEvidenceIndex.has(userId)) {
    userEvidenceIndex.set(userId, new Set());
  }
  return userEvidenceIndex.get(userId);
}

function getUserBookmarkSet(userId) {
  if (!userBookmarkIndex.has(userId)) {
    userBookmarkIndex.set(userId, new Set());
  }
  return userBookmarkIndex.get(userId);
}

function getUserImplicitSignalSet(userId) {
  if (!userImplicitSignalIndex.has(userId)) {
    userImplicitSignalIndex.set(userId, new Set());
  }
  return userImplicitSignalIndex.get(userId);
}

function assertEntryOwner(entry, expectedUserId, operation) {
  if (expectedUserId && entry.userId !== expectedUserId) {
    throw new ValidationError('手账条目不存在或无权访问', { operation });
  }
}

function normalizeDecisionContext(context) {
  if (!context || typeof context !== 'object' || context.kind !== 'route_change') return null;
  return {
    kind: 'route_change',
    action: context.action === 'city_removed' ? 'city_removed' : null,
    changeId: String(context.changeId || '').slice(0, 120),
    city: String(context.city || '').slice(0, 80),
    reasonCategory: ROUTE_CHANGE_REASONS.has(context.reasonCategory) ? context.reasonCategory : null
  };
}

function normalizeReviewSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const worth = REVIEW_WORTH.has(snapshot.worth) ? snapshot.worth : null;
  const values = Array.from(new Set(Array.isArray(snapshot.values) ? snapshot.values.filter(item => REVIEW_VALUES.has(item)) : []));
  const deviations = Array.from(new Set(Array.isArray(snapshot.deviations) ? snapshot.deviations.filter(item => REVIEW_DEVIATIONS.has(item)) : []));
  const tripCompleted = Boolean(snapshot.tripCompleted);
  const rawActual = snapshot.actualSummary && typeof snapshot.actualSummary === 'object'
    ? snapshot.actualSummary
    : null;
  const actualSummary = rawActual ? {
    hasRecords: Boolean(rawActual.hasRecords),
    plannedCities: Array.isArray(rawActual.plannedCities) ? rawActual.plannedCities.map(String).slice(0, 30) : [],
    visitedCities: Array.isArray(rawActual.visitedCities) ? rawActual.visitedCities.map(String).slice(0, 30) : [],
    skippedCities: Array.isArray(rawActual.skippedCities) ? rawActual.skippedCities.map(String).slice(0, 30) : [],
    addedCities: Array.isArray(rawActual.addedCities) ? rawActual.addedCities.map(String).slice(0, 30) : [],
    stayChanges: Array.isArray(rawActual.stayChanges) ? rawActual.stayChanges.slice(0, 30).map(item => ({
      city: String(item?.city || '').slice(0, 80),
      plannedStay: item?.plannedStay == null ? null : Number(item.plannedStay),
      actualStay: item?.actualStay == null ? null : Number(item.actualStay)
    })) : []
  } : null;
  return {
    worth,
    values: values.slice(0, 6),
    deviations: deviations.slice(0, 8),
    tripCompleted,
    actualSummary,
    complete: Boolean(tripCompleted && worth && values.length > 0 && deviations.length > 0)
  };
}

function _isCompleteTripReview(entry) {
  return Boolean(entry && entry.type === 'review' && entry.reviewSnapshot?.complete);
}

function _resolveEvidenceReliability(entry) {
  if (_isCompleteTripReview(entry)) return EVIDENCE_RELIABILITY.review;
  if (entry?.type === 'planning' || entry?.decisionContext) return EVIDENCE_RELIABILITY.planning;
  return EVIDENCE_RELIABILITY.record;
}

// ============ 核心接口 ============

/**
 * 创建手账条目
 *
 * @param {string} userId - 用户 ID
 * @param {Object} entry - 手账内容
 * @param {string} [entry.tripId] - 关联旅行 ID
 * @param {string} [entry.type='record'] - 类型：record | review | planning
 * @param {string} [entry.content] - 文字内容（敏感字段，标记为 sensitive）
 * @param {Array} [entry.photos=[]] - 照片列表
 * @param {Object} [entry.location] - 位置信息（城市级或精确，需授权）
 * @param {string} [entry.mood] - 心情标签
 * @param {Object} [entry.decisionContext] - 用户主动说明的路线取舍上下文
 * @param {Object} [entry.reviewSnapshot] - 完整旅后复盘的结构化摘要
 * @param {boolean} [entry.analysisAuthorized=false] - 是否授权分析（默认不授权）
 * @param {string} [entry.sensitivityLevel='normal'] - 敏感等级
 * @returns {Object} 创建的手账条目
 *
 * 总纲8.2：默认「只是记下来」，不分析、不改变推荐
 */
function createEntry(userId, entry = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'createEntry' });
  }

  const type = entry.type || 'record';
  if (!ENTRY_TYPES.includes(type)) {
    throw new ValidationError(
      `type 必须是 ${ENTRY_TYPES.join(' / ')} 之一，实际收到: ${type}`,
      { operation: 'createEntry', type }
    );
  }

  const entryId = generateId('entry');
  const now = new Date().toISOString();

  const record = {
    id: entryId,
    userId,
    tripId: entry.tripId || null,
    type,
    // content 标记为 sensitive —— 分享时自动移除（总纲8.4 / 12.1 L2）
    content: entry.content || '',
    contentSensitivity: 'sensitive', // 标记：此字段为敏感字段
    photos: Array.isArray(entry.photos) ? [...entry.photos] : [],
    location: entry.location || null,
    mood: entry.mood || null,
    decisionContext: normalizeDecisionContext(entry.decisionContext),
    reviewSnapshot: normalizeReviewSnapshot(entry.reviewSnapshot),
    // 总纲7.2：默认不授权分析，不进入人格引擎
    analysisAuthorized: false,
    // 总纲8.1：模型训练权限永远为 false（手账原文不用于训练）
    modelTrainingPermission: false,
    sensitivityLevel: SENSITIVITY_LEVELS.includes(entry.sensitivityLevel)
      ? entry.sensitivityLevel
      : 'normal',
    createdAt: now,
    updatedAt: now
  };

  // 存储条目
  entries.set(entryId, record);
  getUserEntrySet(userId).add(entryId);
  store.set(ENTRY_NAMESPACE, entryId, record);

  return record;
}

/**
 * 获取用户手账列表（支持按 tripId / type / 日期过滤）
 *
 * @param {string} userId - 用户 ID
 * @param {Object} [filters] - 过滤条件
 * @param {string} [filters.tripId] - 按旅行 ID 过滤
 * @param {string} [filters.type] - 按类型过滤
 * @param {string} [filters.startDate] - 起始日期（ISO）
 * @param {string} [filters.endDate] - 结束日期（ISO）
 * @returns {Array<Object>} 手账列表（按创建时间降序）
 */
function getEntries(userId, filters = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'getEntries' });
  }

  const entryIds = getUserEntrySet(userId);
  let result = [];

  for (const id of entryIds) {
    const entry = entries.get(id);
    if (!entry) continue;

    // 按旅行 ID 过滤
    if (filters.tripId && entry.tripId !== filters.tripId) continue;
    // 按类型过滤
    if (filters.type && entry.type !== filters.type) continue;
    // 按起始日期过滤
    if (filters.startDate && entry.createdAt < filters.startDate) continue;
    // 按结束日期过滤
    if (filters.endDate && entry.createdAt > filters.endDate) continue;

    result.push(entry);
  }

  // 按创建时间降序排列
  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return result;
}

/**
 * 更新手账
 *
 * @param {string} entryId - 手账 ID
 * @param {Object} updates - 更新内容
 * @returns {Object} 更新后的手账条目
 */
function updateEntry(entryId, updates = {}, expectedUserId = null) {
  const entry = entries.get(entryId);
  if (!entry) {
    throw new ValidationError(`手账条目不存在: ${entryId}`, {
      operation: 'updateEntry',
      entryId
    });
  }
  assertEntryOwner(entry, expectedUserId, 'updateEntry');

  // 不允许直接修改 id / userId / createdAt
  const { id: _id, userId: _userId, createdAt: _createdAt, ...allowed } = updates;

  // type 需要校验
  if (allowed.type !== undefined && !ENTRY_TYPES.includes(allowed.type)) {
    throw new ValidationError(
      `type 必须是 ${ENTRY_TYPES.join(' / ')} 之一`,
      { operation: 'updateEntry', type: allowed.type }
    );
  }
  if (Object.prototype.hasOwnProperty.call(allowed, 'decisionContext')) {
    allowed.decisionContext = normalizeDecisionContext(allowed.decisionContext);
  }
  if (Object.prototype.hasOwnProperty.call(allowed, 'reviewSnapshot')) {
    allowed.reviewSnapshot = normalizeReviewSnapshot(allowed.reviewSnapshot);
  }

  Object.assign(entry, allowed);
  entry.updatedAt = new Date().toISOString();

  // 如果修改了影响证据的字段，同步证据池
  if (entry.analysisAuthorized) {
    if (entry.sensitivityLevel === 'restricted') _removeEvidence(entry);
    else _syncEvidence(entry);
  }
  store.set(ENTRY_NAMESPACE, entryId, entry);

  return entry;
}

/**
 * 删除手账（同时从证据池移除）
 *
 * 总纲12.5：用户必须能够删除数据
 *
 * @param {string} entryId - 手账 ID
 * @returns {Object} { deleted: true, entryId, evidenceRemoved }
 */
function deleteEntry(entryId, expectedUserId = null) {
  const entry = entries.get(entryId);
  if (!entry) {
    throw new ValidationError(`手账条目不存在: ${entryId}`, {
      operation: 'deleteEntry',
      entryId
    });
  }
  assertEntryOwner(entry, expectedUserId, 'deleteEntry');

  const userId = entry.userId;

  // 从证据池移除（如果存在）
  let evidenceRemoved = false;
  const userEvidence = getUserEvidenceSet(userId);
  for (const evidenceId of [...userEvidence]) {
    const evidence = evidencePool.get(evidenceId);
    if (evidence && evidence.sourceEntryId === entryId) {
      evidencePool.delete(evidenceId);
      store.delete(EVIDENCE_NAMESPACE, evidenceId);
      userEvidence.delete(evidenceId);
      evidenceRemoved = true;
    }
  }

  // 从用户索引移除
  getUserEntrySet(userId).delete(entryId);
  // 从主存储移除
  entries.delete(entryId);
  store.delete(ENTRY_NAMESPACE, entryId);

  return { deleted: true, entryId, evidenceRemoved };
}

/**
 * 设置分析授权
 *
 * 总纲7.2：不授权分析的记录绝不进入人格引擎
 * 总纲8.1：任何分享权限都不能自动等于分析权限
 *
 * @param {string} entryId - 手账 ID
 * @param {boolean} authorized - 是否授权
 * @returns {Object} 更新后的手账条目
 */
function setAnalysisAuthorization(entryId, authorized, expectedUserId = null) {
  const entry = entries.get(entryId);
  if (!entry) {
    throw new ValidationError(`手账条目不存在: ${entryId}`, {
      operation: 'setAnalysisAuthorization',
      entryId
    });
  }
  assertEntryOwner(entry, expectedUserId, 'setAnalysisAuthorization');

  entry.analysisAuthorized = Boolean(authorized) && entry.sensitivityLevel !== 'restricted';
  entry.updatedAt = new Date().toISOString();

  if (entry.analysisAuthorized) {
    _syncEvidence(entry);
  } else {
    // 取消授权时，从证据池移除
    _removeEvidence(entry);
  }
  store.set(ENTRY_NAMESPACE, entryId, entry);

  return entry;
}

/**
 * 获取已授权分析的手账条目
 *
 * 总纲7.2：只有 analysisAuthorized === true 的条目才进入分析池
 * 总纲7.3：用户允许该记录用于分析 是人格更新的必要条件之一
 *
 * @param {string} userId - 用户 ID
 * @returns {Array<Object>} 已授权的手账条目
 */
function getEntriesForAnalysis(userId) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'getEntriesForAnalysis' });
  }

  const entryIds = getUserEntrySet(userId);
  const result = [];

  for (const id of entryIds) {
    const entry = entries.get(id);
    if (!entry) continue;
    if (!entry.analysisAuthorized) continue;
    // restricted 级别的记录即使授权也不进入分析（总纲12.1 L3 严格隔离）
    if (entry.sensitivityLevel === 'restricted') continue;
    result.push(entry);
  }

  return result;
}

// ============ 敏感字段处理 ============

/**
 * 分享脱敏：移除敏感字段
 *
 * 总纲8.4 / 12.2：分享卡、通知、邮件和推送不得出现敏感内容
 * content 字段标记为 sensitive，分享时自动移除
 *
 * @param {Object} entry - 手账条目
 * @returns {Object} 脱敏后的条目（不含 content 等敏感字段）
 */
function sanitizeForShare(entry) {
  if (!entry) return null;

  const sanitized = { ...entry };

  // 移除所有标记为 sensitive 的字段
  for (const field of SENSITIVE_FIELDS) {
    if (field in sanitized) {
      // 不回显原文，仅保留标记表明该字段已被移除
      sanitized[field] = '[已移除：敏感内容]';
      sanitized[`${field}Redacted`] = true;
    }
  }

  // 移除精确位置（总纲8.3：分享输出必须自动移除精确位置）
  if (sanitized.location && sanitized.location.precision === 'exact') {
    sanitized.location = { city: sanitized.location.city || null, precision: 'redacted' };
  }

  return sanitized;
}

// ============ 书签（收藏标记） ============

/**
 * 给手账条目标记收藏类型
 *
 * 收藏不代表喜欢，只表示"暂存待决定"。
 * - wishlist: 备选（想去但未确定）
 * - avoid: 避雷（明确不想去）
 * - null: 取消书签
 *
 * 收藏不生成人格证据，不进入人格引擎。
 *
 * @param {string} entryId - 手账 ID
 * @param {string|null} type - 书签类型: 'wishlist' | 'avoid' | null
 * @param {string} expectedUserId - 用户 ID
 * @returns {Object} 书签结果
 */
function setBookmark(entryId, type, expectedUserId = null) {
  const entry = entries.get(entryId);
  if (!entry) {
    throw new ValidationError(`手账条目不存在: ${entryId}`, {
      operation: 'setBookmark',
      entryId
    });
  }
  assertEntryOwner(entry, expectedUserId, 'setBookmark');

  const userId = entry.userId;

  // 如果 type 为 null，取消书签
  if (type === null || type === undefined) {
    const existing = bookmarks.get(entryId);
    if (existing) {
      bookmarks.delete(entryId);
      store.delete(BOOKMARK_NAMESPACE, entryId);
      getUserBookmarkSet(userId).delete(entryId);
    }
    return { entryId, bookmarkType: null, removed: true };
  }

  if (!BOOKMARK_TYPES.has(type)) {
    throw new ValidationError(
      `type 必须是 wishlist / avoid 或 null，实际收到: ${type}`,
      { operation: 'setBookmark', type }
    );
  }

  const bookmark = {
    entryId,
    userId,
    type,
    createdAt: bookmarks.get(entryId)?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  bookmarks.set(entryId, bookmark);
  getUserBookmarkSet(userId).add(entryId);
  store.set(BOOKMARK_NAMESPACE, entryId, bookmark);

  return bookmark;
}

/**
 * 获取用户所有书签
 *
 * @param {string} userId - 用户 ID
 * @param {Object} [filters] - 过滤条件
 * @param {string} [filters.type] - 按书签类型过滤
 * @returns {Array<Object>} 书签列表
 */
function getBookmarks(userId, filters = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'getBookmarks' });
  }

  const entryIds = getUserBookmarkSet(userId);
  const result = [];

  for (const entryId of entryIds) {
    const bookmark = bookmarks.get(entryId);
    if (!bookmark) continue;
    if (filters.type && bookmark.type !== filters.type) continue;

    // 附加条目信息
    const entry = entries.get(entryId);
    result.push({
      ...bookmark,
      entry: entry ? {
        id: entry.id,
        type: entry.type,
        mood: entry.mood,
        location: entry.location,
        createdAt: entry.createdAt
      } : null
    });
  }

  return result;
}

/**
 * 获取条目的书签信息
 *
 * @param {string} entryId - 手账 ID
 * @returns {Object|null} 书签信息
 */
function getEntryBookmark(entryId) {
  return bookmarks.get(entryId) || null;
}

// ============ 隐式反馈机制 ============

/**
 * 记录隐式信号
 *
 * 隐式信号（反复查看、停留时长、删城、路径切换）权重极低（0.02-0.05）。
 * 隐式反馈只用于推荐排序的轻微先验，不写入长期人格画像。
 * 隐式信号存储在单独的 ephemeral 区域，不与人格证据混存。
 *
 * @param {string} userId - 用户 ID
 * @param {Object} signal - 信号数据
 * @param {string} signal.type - 信号类型: repeatedView | longStay | cityRemoved | pathSwitch
 * @param {string} signal.targetId - 目标 ID（手账条目或城市）
 * @param {number} [signal.weight] - 自定义权重（可选，默认使用预设值）
 * @returns {Object} 记录的隐式信号
 */
function recordImplicitSignal(userId, signal = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'recordImplicitSignal' });
  }

  const type = signal.type;
  if (!IMPLICIT_SIGNAL_TYPES.has(type)) {
    throw new ValidationError(
      `type 必须是 ${[...IMPLICIT_SIGNAL_TYPES].join(' / ')} 之一，实际收到: ${type}`,
      { operation: 'recordImplicitSignal', type }
    );
  }

  const targetId = String(signal.targetId || '').slice(0, 200);
  if (!targetId) {
    throw new ValidationError('targetId 不能为空', { operation: 'recordImplicitSignal' });
  }

  // 权重约束在 0.02-0.05 范围内
  const defaultWeight = IMPLICIT_SIGNAL_WEIGHTS[type] || 0.03;
  let weight = Number(signal.weight);
  if (!Number.isFinite(weight) || weight < 0 || weight > 0.1) {
    weight = defaultWeight;
  }
  // 强制夹紧到 0.02-0.05 范围
  weight = Math.max(0.02, Math.min(0.05, weight));

  const signalId = generateId('isig');
  const now = new Date().toISOString();

  const record = {
    id: signalId,
    userId,
    type,
    targetId,
    weight: Math.round(weight * 1000) / 1000, // 精确到 3 位
    ephemeral: true, // 标记为短期信号，不写入长期人格
    createdAt: now
  };

  implicitSignals.set(signalId, record);
  getUserImplicitSignalSet(userId).add(signalId);
  store.set(IMPLICIT_SIGNAL_NAMESPACE, signalId, record);

  return record;
}

/**
 * 获取用户所有隐式信号
 *
 * 用户能查看"这条线索为什么被使用"
 *
 * @param {string} userId - 用户 ID
 * @param {Object} [filters] - 过滤条件
 * @param {string} [filters.type] - 按信号类型过滤
 * @param {string} [filters.targetId] - 按目标 ID 过滤
 * @returns {Array<Object>} 隐式信号列表
 */
function getImplicitSignals(userId, filters = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'getImplicitSignals' });
  }

  const signalIds = getUserImplicitSignalSet(userId);
  const result = [];

  for (const id of signalIds) {
    const signal = implicitSignals.get(id);
    if (!signal) continue;
    if (filters.type && signal.type !== filters.type) continue;
    if (filters.targetId && signal.targetId !== filters.targetId) continue;
    result.push(signal);
  }

  // 按创建时间降序排列
  result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return result;
}

/**
 * 删除用户所有隐式信号（或按条件删除）
 *
 * 用户能撤回/删除所有隐式信号。
 * DELETE /api/v1/journals/implicit-signal
 *
 * @param {string} userId - 用户 ID
 * @param {Object} [filters] - 过滤条件
 * @param {string} [filters.type] - 按信号类型删除
 * @param {string} [filters.targetId] - 按目标 ID 删除
 * @param {string} [filters.signalId] - 删除特定信号
 * @returns {Object} 删除结果 { deleted: number }
 */
function deleteImplicitSignals(userId, filters = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'deleteImplicitSignals' });
  }

  const signalIds = getUserImplicitSignalSet(userId);
  let deleted = 0;

  for (const id of [...signalIds]) {
    const signal = implicitSignals.get(id);
    if (!signal) continue;

    // 应用过滤条件
    if (filters.signalId && id !== filters.signalId) continue;
    if (filters.type && signal.type !== filters.type) continue;
    if (filters.targetId && signal.targetId !== filters.targetId) continue;

    implicitSignals.delete(id);
    store.delete(IMPLICIT_SIGNAL_NAMESPACE, id);
    signalIds.delete(id);
    deleted++;
  }

  return { deleted };
}

/**
 * 获取隐式信号的聚合权重（供推荐排序使用）
 *
 * 返回按 targetId 聚合的权重总和，用于推荐排序的轻微先验。
 * 这些信号不写入长期人格画像。
 *
 * @param {string} userId - 用户 ID
 * @returns {Object} { [targetId]: totalWeight }
 */
function getImplicitSignalAggregation(userId) {
  if (!userId) return {};

  const signalIds = getUserImplicitSignalSet(userId);
  const aggregation = {};

  for (const id of signalIds) {
    const signal = implicitSignals.get(id);
    if (!signal) continue;

    const current = aggregation[signal.targetId] || 0;
    aggregation[signal.targetId] = Math.round((current + signal.weight) * 1000) / 1000;
  }

  return aggregation;
}

// ============ 证据池管理 ============

/**
 * 从手账条目同步生成证据（内部函数）
 *
 * 总纲7.2：已授权分析的手账条目可派生为证据
 * 证据可靠度根据手账类型确定
 *
 * @param {Object} entry - 已授权的手账条目
 */
function _syncEvidence(entry) {
  // 先移除旧证据（如果存在）
  _removeEvidence(entry);

  const evidenceId = generateId('evidence');
  const completeReview = _isCompleteTripReview(entry);
  const reliability = _resolveEvidenceReliability(entry);
  const derivedSignals = _deriveReflectionSignals(entry.content || '', completeReview ? entry.reviewSnapshot : null);

  const evidence = {
    id: evidenceId,
    type: completeReview ? 'tripReview' : 'journalEntry',
    source: `journal:${entry.id}`,
    sourceEntryId: entry.id,
    userId: entry.userId,
    tripId: entry.tripId,
    reliability,
    excluded: false,
    createdAt: new Date().toISOString(),
    // 情绪标签可作为维度影响线索（非敏感）
    mood: entry.mood || null,
    decisionContext: entry.decisionContext ? { ...entry.decisionContext } : null,
    reviewCompleteness: completeReview ? 'complete' : 'partial',
    reviewSnapshot: completeReview ? { ...entry.reviewSnapshot } : null,
    // 只保存从原文派生的结构化信号，不保存或回显原文。
    dimensionImpact: Object.keys(derivedSignals.dimensionImpact).length > 0 ? derivedSignals.dimensionImpact : null,
    signalLabels: derivedSignals.signalLabels,
    // 不包含 content 原文（敏感隔离，总纲12.2）
    contentHash: entry.content ? _hashContent(entry.content) : null
  };

  evidencePool.set(evidenceId, evidence);
  getUserEvidenceSet(entry.userId).add(evidenceId);
  store.set(EVIDENCE_NAMESPACE, evidenceId, evidence);
}

function _deriveReflectionSignals(content, reviewSnapshot = null) {
  const text = String(content || '').trim();
  const impacts = {};
  const labels = [];

  function add(key, direction, magnitude, label) {
    const existing = impacts[key];
    const signed = (direction === 'negative' ? -1 : 1) * magnitude;
    const current = existing ? (existing.direction === 'negative' ? -existing.magnitude : existing.magnitude) : 0;
    const total = Math.max(-0.12, Math.min(0.12, current + signed));
    impacts[key] = {
      traitKey: key,
      direction: total < 0 ? 'negative' : 'positive',
      magnitude: Math.abs(Number(total.toFixed(3)))
    };
    if (!labels.includes(label)) labels.push(label);
  }

  if (/少走回头路|减少.{0,4}折返|不走回头路|优先火车|换乘.{0,5}(顺|少)/.test(text)) {
    add('transit', 'positive', 0.08, '更在意路线顺畅和少折返');
  }
  if (/删掉|删到|少搬|收拾行李|不想赶|多留.{0,5}时间|留得下.{0,5}时间|不是打卡更多/.test(text)) {
    add('pace', 'negative', 0.08, '愿意少去几站，换取完整停留');
  }
  if (/行程.{0,3}紧凑|一天.{0,5}(多去|多跑|多看)|赶一点.{0,5}(更有精神|更开心)|喜欢.{0,5}打卡/.test(text)) {
    add('pace', 'positive', 0.06, '紧凑安排会带来兴奋感');
  }
  if (/绕路.{0,4}(没关系|不介意)|换乘.{0,4}(多|复杂).{0,4}(没关系|不介意)|愿意.{0,5}折返/.test(text)) {
    add('transit', 'negative', 0.05, '愿意为特定体验接受绕行和换乘');
  }
  if (/排队|人挤人|人太多/.test(text) && /不想|避免|讨厌|受不了|不愿/.test(text)) {
    add('lowCrowd', 'positive', 0.06, '明确回避拥挤和排队');
  }
  if (/性价比|溢价|预算|省钱|花费|收割/.test(text)) {
    add('budget', 'positive', 0.05, '会主动权衡预算和体验价值');
  }
  if (/自己的时间|独处|一个人待|安静/.test(text)) {
    add('restoration', 'positive', 0.05, '需要保留属于自己的旅行时间');
  }
  if (/博物馆|展览|看展|历史|古迹/.test(text)) {
    add('culture', 'positive', 0.05, '会为文化内容安排真实停留');
  }
  if (/在地|当地人|本地生活|街区/.test(text)) {
    add('authenticity', 'positive', 0.05, '偏好在地生活而非清单打卡');
  }
  if (/认识新朋友|结识|和当地人聊天/.test(text)) {
    add('social', 'positive', 0.05, '把真实的人际连接视为旅行价值');
  }

  if (reviewSnapshot) {
    const values = new Set(reviewSnapshot.values || []);
    const deviations = new Set(reviewSnapshot.deviations || []);
    if (values.has('new_experience')) add('novelty', 'positive', 0.05, '把新体验视为这次旅行的重要价值');
    if (values.has('connection')) add('social', 'positive', 0.05, '把人与连接视为这次旅行的重要价值');
    if (values.has('own_time')) add('restoration', 'positive', 0.05, '珍惜属于自己的旅行时间');
    if (deviations.has('fewer_places') || deviations.has('longer_stays') || deviations.has('more_relaxed')) {
      add('pace', 'negative', 0.06, '实际体验更支持少赶路和完整停留');
    }
    if (deviations.has('overspent') || deviations.has('underspent')) {
      add('budget', 'positive', 0.04, '会复盘预算与体验价值的差异');
    }
  }

  return { dimensionImpact: impacts, signalLabels: labels };
}

/**
 * 从证据池移除某手账条目关联的证据（内部函数）
 *
 * @param {Object} entry - 手账条目
 */
function _removeEvidence(entry) {
  const userEvidence = getUserEvidenceSet(entry.userId);
  for (const evidenceId of [...userEvidence]) {
    const evidence = evidencePool.get(evidenceId);
    if (evidence && evidence.sourceEntryId === entry.id) {
      evidencePool.delete(evidenceId);
      store.delete(EVIDENCE_NAMESPACE, evidenceId);
      userEvidence.delete(evidenceId);
    }
  }
}

/**
 * 简单内容哈希（用于证据引用，不存储原文）
 * 仅保存不可逆 SHA-256 摘要，不把手账原文写入人格证据
 */
function _hashContent(content) {
  const hash = crypto.createHash('sha256');
  hash.update(content);
  return hash.digest('hex').slice(0, 16);
}

/**
 * 获取用户的证据池（供人格校准使用）
 *
 * @param {string} userId - 用户 ID
 * @param {Object} [options]
 * @param {boolean} [options.excludeExcluded=true] - 是否排除已被用户排除的证据
 * @returns {Array<Object>} 证据列表
 */
function getEvidencePool(userId, options = {}) {
  const { excludeExcluded = true } = options;
  const evidenceIds = getUserEvidenceSet(userId);
  const result = [];

  for (const id of evidenceIds) {
    const evidence = evidencePool.get(id);
    if (!evidence) continue;
    if (excludeExcluded && evidence.excluded) continue;
    result.push(evidence);
  }

  return result;
}

/**
 * 标记证据为已排除（用户排除某条证据）
 *
 * 总纲12.5：用户必须能够排除人格标签与证据
 *
 * @param {string} evidenceId - 证据 ID
 * @returns {Object} 更新后的证据
 */
function excludeEvidenceFromPool(evidenceId) {
  const evidence = evidencePool.get(evidenceId);
  if (!evidence) {
    throw new ValidationError(`证据不存在: ${evidenceId}`, {
      operation: 'excludeEvidenceFromPool',
      evidenceId
    });
  }
  evidence.excluded = true;
  store.set(EVIDENCE_NAMESPACE, evidenceId, evidence);
  return evidence;
}

/**
 * Re-key a signed guest's journal and evidence to a verified account.
 * IDs stay stable so trip links, proposal evidence references and audit trails
 * remain intact. The operation is idempotent and never reads journal content.
 */
function transferUserData(sourceUserId, targetUserId) {
  if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
    return { entriesTransferred: 0, evidenceTransferred: 0 };
  }

  let entriesTransferred = 0;
  let evidenceTransferred = 0;
  const targetEntries = getUserEntrySet(targetUserId);
  const targetEvidence = getUserEvidenceSet(targetUserId);
  const targetBookmarks = getUserBookmarkSet(targetUserId);
  const targetSignals = getUserImplicitSignalSet(targetUserId);

  for (const entryId of [...getUserEntrySet(sourceUserId)]) {
    const entry = entries.get(entryId);
    if (!entry) continue;
    if (entry.userId === sourceUserId) {
      entry.userId = targetUserId;
      entry.updatedAt = new Date().toISOString();
      store.set(ENTRY_NAMESPACE, entryId, entry);
      entriesTransferred++;
    }
    if (entry.userId === targetUserId) targetEntries.add(entryId);
  }

  for (const evidenceId of [...getUserEvidenceSet(sourceUserId)]) {
    const evidence = evidencePool.get(evidenceId);
    if (!evidence) continue;
    if (evidence.userId === sourceUserId) {
      evidence.userId = targetUserId;
      store.set(EVIDENCE_NAMESPACE, evidenceId, evidence);
      evidenceTransferred++;
    }
    if (evidence.userId === targetUserId) targetEvidence.add(evidenceId);
  }

  // 转移书签
  for (const entryId of [...getUserBookmarkSet(sourceUserId)]) {
    const bookmark = bookmarks.get(entryId);
    if (!bookmark) continue;
    if (bookmark.userId === sourceUserId) {
      bookmark.userId = targetUserId;
      bookmark.updatedAt = new Date().toISOString();
      store.set(BOOKMARK_NAMESPACE, entryId, bookmark);
    }
    if (bookmark.userId === targetUserId) targetBookmarks.add(entryId);
  }

  // 转移隐式信号
  for (const signalId of [...getUserImplicitSignalSet(sourceUserId)]) {
    const signal = implicitSignals.get(signalId);
    if (!signal) continue;
    if (signal.userId === sourceUserId) {
      signal.userId = targetUserId;
      store.set(IMPLICIT_SIGNAL_NAMESPACE, signalId, signal);
    }
    if (signal.userId === targetUserId) targetSignals.add(signalId);
  }

  userEntryIndex.delete(sourceUserId);
  userEvidenceIndex.delete(sourceUserId);
  userBookmarkIndex.delete(sourceUserId);
  userImplicitSignalIndex.delete(sourceUserId);
  return { entriesTransferred, evidenceTransferred };
}

function deleteUserData(userId) {
  const entryIds = [...getUserEntrySet(userId)];
  entryIds.forEach(entryId => {
    if (entries.has(entryId)) deleteEntry(entryId);
  });
  const evidenceIds = [...getUserEvidenceSet(userId)];
  evidenceIds.forEach(evidenceId => {
    evidencePool.delete(evidenceId);
    store.delete(EVIDENCE_NAMESPACE, evidenceId);
  });
  // 删除书签
  const bookmarkIds = [...getUserBookmarkSet(userId)];
  bookmarkIds.forEach(entryId => {
    bookmarks.delete(entryId);
    store.delete(BOOKMARK_NAMESPACE, entryId);
  });
  // 删除隐式信号
  const signalIds = [...getUserImplicitSignalSet(userId)];
  signalIds.forEach(signalId => {
    implicitSignals.delete(signalId);
    store.delete(IMPLICIT_SIGNAL_NAMESPACE, signalId);
  });
  userEntryIndex.delete(userId);
  userEvidenceIndex.delete(userId);
  userBookmarkIndex.delete(userId);
  userImplicitSignalIndex.delete(userId);
  return { entriesDeleted: entryIds.length, evidenceDeleted: evidenceIds.length, bookmarksDeleted: bookmarkIds.length, implicitSignalsDeleted: signalIds.length };
}

// ============ 测试辅助 ============

/**
 * 重置所有内存存储（仅用于测试）
 */
function _reset() {
  entries.clear();
  userEntryIndex.clear();
  evidencePool.clear();
  userEvidenceIndex.clear();
  bookmarks.clear();
  userBookmarkIndex.clear();
  implicitSignals.clear();
  userImplicitSignalIndex.clear();
  store.clear(ENTRY_NAMESPACE);
  store.clear(EVIDENCE_NAMESPACE);
  store.clear(BOOKMARK_NAMESPACE);
  store.clear(IMPLICIT_SIGNAL_NAMESPACE);
}

/**
 * 获取存储统计（调试用）
 */
function _getStats() {
  return {
    totalEntries: entries.size,
    totalEvidence: evidencePool.size,
    totalUsers: userEntryIndex.size
  };
}

module.exports = {
  // 常量
  ENTRY_TYPES,
  EVIDENCE_RELIABILITY,
  SENSITIVE_FIELDS,
  BOOKMARK_TYPES,
  IMPLICIT_SIGNAL_TYPES,
  IMPLICIT_SIGNAL_WEIGHTS,

  // 核心接口
  createEntry,
  getEntries,
  updateEntry,
  deleteEntry,
  setAnalysisAuthorization,
  getEntriesForAnalysis,

  // 敏感字段处理
  sanitizeForShare,

  // 证据池
  getEvidencePool,
  excludeEvidenceFromPool,
  transferUserData,
  deleteUserData,

  // 书签（收藏标记）
  setBookmark,
  getBookmarks,
  getEntryBookmark,

  // 隐式反馈机制
  recordImplicitSignal,
  getImplicitSignals,
  deleteImplicitSignals,
  getImplicitSignalAggregation,

  // 测试辅助
  _reset,
  _getStats
};
