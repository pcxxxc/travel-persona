/**
 * 旅格 Travel Persona · 数据权利服务（Phase 4）
 *
 * 职责：
 * 1. 导出用户全部数据（手账、人格、旅行记录）
 * 2. 删除用户全部数据（包括备份清理标记）
 * 3. 关闭个性化（立即停止使用个人标签推荐）
 * 4. 隐私设置管理（查看 / 更新）
 *
 * 对应总纲：
 * - 12.5 用户权利：查看系统保存了什么 / 导出 / 删除账号与全部关联数据
 *   / 关闭个性化推荐并使用非人格模式 / 撤回授权
 * - 12.1 数据分类：L0~L4 分级管理
 * - 7.3 人格更新写入条件：用户允许该记录用于分析
 *
 * 存储说明：隐私设置与删除标记持久化到 SQLite
 */

const crypto = require('crypto');
const { ValidationError } = require('../../utils/errors');
const journalService = require('./journalService');
const personaCalibration = require('./personaCalibration');
const travelTrace = require('./travelTrace');
const { getStore } = require('../storage/sqliteStore');

// ============ 常量定义 ============

/**
 * 默认隐私设置
 *
 * 总纲12.5 / 12.6 合规要求：
 * - personalizationEnabled: 个性化推荐开关（关闭后使用非人格模式）
 * - analysisConsent: 是否允许分析手账内容
 * - locationPrecision: 位置精度授权级别
 * - photoAnalysisEnabled: 照片分析授权
 * - longTermMemoryEnabled: 长期记忆授权
 * - modelTrainingEnabled: 模型训练授权（手账原文永远为 false，总纲8.1）
 * - dataRetentionDays: 数据保留天数
 */
const DEFAULT_PRIVACY_SETTINGS = {
  personalizationEnabled: true,
  analysisConsent: false,
  locationPrecision: 'city',        // 'exact' | 'city' | 'off'
  photoAnalysisEnabled: false,
  longTermMemoryEnabled: true,
  modelTrainingEnabled: false,       // 总纲8.1：永远 false，手账原文不用于训练
  dataRetentionDays: 365,
  shareWithoutSensitive: true       // 总纲8.4：分享时自动移除敏感内容
};

// ============ 内存存储 ============

/** userId -> 隐私设置 */
const privacySettings = new Map();

/** userId -> 删除标记（用于备份清理追踪） */
const deletionMarkers = new Map();

const store = getStore();
const PRIVACY_NAMESPACE = 'privacy.settings';
const DELETION_NAMESPACE = 'privacy.deletions';

for (const { key, value } of store.list(PRIVACY_NAMESPACE)) privacySettings.set(key, value);
for (const { key, value } of store.list(DELETION_NAMESPACE)) deletionMarkers.set(key, value);

// ============ 工具函数 ============

/**
 * 生成唯一 ID
 */
function generateId(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random.slice(0, 12)}`;
}

// ============ 核心接口 ============

/**
 * 导出用户全部数据
 *
 * 总纲12.5：用户必须能够导出旅行、手账、收藏和人格数据
 *
 * @param {string} userId - 用户 ID
 * @returns {Object} 用户全部数据
 * {
 *   userId, exportedAt,
 *   journal: { entries, evidenceCount },
 *   persona: { profile, proposals },
 *   travel: { trips, visitMap, stats },
 *   privacySettings
 * }
 */
function exportUserData(userId) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'exportUserData' });
  }

  // 手账数据
  const entries = journalService.getEntries(userId);
  const evidence = journalService.getEvidencePool(userId, { excludeExcluded: false });

  // 人格数据
  const profile = personaCalibration.getOrCreateProfile(userId);
  const proposals = personaCalibration.getProposals(userId);

  // 旅行数据
  const trips = travelTrace.getTravelTrace(userId);
  const visitMap = travelTrace.getVisitMap(userId);
  const stats = travelTrace.getTripStats(userId);

  // 隐私设置
  const settings = getPrivacySettings(userId);

  return {
    userId,
    exportedAt: new Date().toISOString(),
    version: 'phase4',

    // 手账数据（含敏感原文，仅导出给用户本人）
    journal: {
      entries,
      evidenceCount: evidence.length,
      evidence
    },

    // 人格档案与提案
    persona: {
      profile,
      proposals
    },

    // 旅行记录与轨迹
    travel: {
      trips,
      visitMap,
      stats
    },

    // 隐私设置
    privacySettings: settings
  };
}

/**
 * 删除用户全部数据（包括备份清理标记）
 *
 * 总纲12.5：用户必须能够删除账号与全部关联数据
 *
 * @param {string} userId - 用户 ID
 * @returns {Object} { deleted: true, userId, details }
 */
function deleteUserData(userId) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'deleteUserData' });
  }

  const details = {
    entriesDeleted: 0,
    evidenceDeleted: 0,
    proposalsDeleted: 0,
    tripsDeleted: 0,
    profileDeleted: false,
    privacySettingsDeleted: false
  };

  // 删除手账条目（同时清除证据池）
  const entries = journalService.getEntries(userId);
  entries.forEach(entry => {
    const result = journalService.deleteEntry(entry.id);
    if (result.evidenceRemoved) {
      details.evidenceDeleted++;
    }
    details.entriesDeleted++;
  });

  // 删除剩余证据（可能有独立于手账的证据）
  const remainingEvidence = journalService.getEvidencePool(userId, { excludeExcluded: false });
  details.evidenceDeleted += remainingEvidence.length;

  // 删除人格提案
  const proposals = personaCalibration.getProposals(userId);
  details.proposalsDeleted = proposals.length;

  // 删除旅行记录
  const trips = travelTrace.getTravelTrace(userId);
  trips.forEach(trip => {
    travelTrace.deleteTrip(trip.tripId);
    details.tripsDeleted++;
  });

  journalService.deleteUserData(userId);
  const personaDeletion = personaCalibration.deleteUserData(userId);
  travelTrace.deleteUserData(userId);
  details.profileDeleted = personaDeletion.profileDeleted;

  // 删除隐私设置
  privacySettings.delete(userId);
  store.delete(PRIVACY_NAMESPACE, userId);
  details.privacySettingsDeleted = true;

  // 写入删除标记（用于备份清理追踪）
  // 总纲12.5：删除包括备份清理
  const deletionMarker = {
    userId,
    deletedAt: new Date().toISOString(),
    marker: generateId('deletion'),
    details
  };
  deletionMarkers.set(userId, deletionMarker);
  store.set(DELETION_NAMESPACE, userId, deletionMarker);

  return { deleted: true, userId, details };
}

/**
 * 关闭个性化
 *
 * 总纲12.5：关闭个性化推荐并使用非人格模式
 * 立即停止使用个人标签推荐
 *
 * @param {string} userId - 用户 ID
 * @returns {Object} 更新后的隐私设置
 */
function disablePersonalization(userId) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'disablePersonalization' });
  }

  const settings = getPrivacySettings(userId);
  settings.personalizationEnabled = false;
  // 关闭个性化时同时停止分析授权（不再使用手账进行人格分析）
  settings.analysisConsent = false;
  settings.longTermMemoryEnabled = false;
  settings.updatedAt = new Date().toISOString();

  privacySettings.set(userId, settings);
  store.set(PRIVACY_NAMESPACE, userId, settings);

  return settings;
}

/**
 * 获取隐私设置
 *
 * @param {string} userId - 用户 ID
 * @returns {Object} 隐私设置（不存在时返回默认值）
 */
function getPrivacySettings(userId) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'getPrivacySettings' });
  }

  if (!privacySettings.has(userId)) {
    // 返回默认设置的副本
    const defaults = {
      ...DEFAULT_PRIVACY_SETTINGS,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    privacySettings.set(userId, defaults);
    store.set(PRIVACY_NAMESPACE, userId, defaults);
    return defaults;
  }

  return privacySettings.get(userId);
}

/**
 * 更新隐私设置
 *
 * 总纲12.5：用户可撤回精确位置、照片分析、长期记忆和模型训练授权
 *
 * @param {string} userId - 用户 ID
 * @param {Object} settings - 要更新的设置项
 * @returns {Object} 更新后的完整隐私设置
 */
function updatePrivacySettings(userId, settings = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'updatePrivacySettings' });
  }

  const current = getPrivacySettings(userId);

  // 合并更新（不允许修改 userId）
  const { userId: _userId, ...allowed } = settings;

  // 总纲8.1：modelTrainingEnabled 永远为 false，即使用户尝试开启
  if ('modelTrainingEnabled' in allowed) {
    allowed.modelTrainingEnabled = false;
  }

  Object.assign(current, allowed);
  current.updatedAt = new Date().toISOString();

  privacySettings.set(userId, current);
  store.set(PRIVACY_NAMESPACE, userId, current);

  return current;
}

/**
 * 检查用户是否已关闭个性化
 *
 * @param {string} userId - 用户 ID
 * @returns {boolean} true 表示个性化已关闭
 */
function isPersonalizationDisabled(userId) {
  const settings = getPrivacySettings(userId);
  return !settings.personalizationEnabled;
}

/**
 * 获取删除标记（用于备份清理追踪）
 *
 * @param {string} userId - 用户 ID
 * @returns {Object|null} 删除标记，不存在时返回 null
 */
function getDeletionMarker(userId) {
  return deletionMarkers.get(userId) || null;
}

/**
 * 检查用户数据是否已被删除
 *
 * @param {string} userId - 用户 ID
 * @returns {boolean}
 */
function isUserDeleted(userId) {
  return deletionMarkers.has(userId);
}

function mergePrivacySettings(source, target, targetUserId) {
  if (!source) return target || null;
  if (!target) {
    return { ...source, userId: targetUserId, updatedAt: new Date().toISOString() };
  }

  const precisionRank = { off: 0, city: 1, exact: 2 };
  const sourcePrecision = precisionRank[source.locationPrecision] ?? 1;
  const targetPrecision = precisionRank[target.locationPrecision] ?? 1;
  const mergedPrecision = Object.keys(precisionRank)
    .find(key => precisionRank[key] === Math.min(sourcePrecision, targetPrecision)) || 'city';

  return {
    ...source,
    ...target,
    userId: targetUserId,
    personalizationEnabled: Boolean(source.personalizationEnabled && target.personalizationEnabled),
    analysisConsent: Boolean(source.analysisConsent && target.analysisConsent),
    photoAnalysisEnabled: Boolean(source.photoAnalysisEnabled && target.photoAnalysisEnabled),
    longTermMemoryEnabled: Boolean(source.longTermMemoryEnabled && target.longTermMemoryEnabled),
    modelTrainingEnabled: false,
    locationPrecision: mergedPrecision,
    dataRetentionDays: Math.min(
      Number(source.dataRetentionDays || DEFAULT_PRIVACY_SETTINGS.dataRetentionDays),
      Number(target.dataRetentionDays || DEFAULT_PRIVACY_SETTINGS.dataRetentionDays)
    ),
    shareWithoutSensitive: Boolean(source.shareWithoutSensitive || target.shareWithoutSensitive),
    createdAt: [source.createdAt, target.createdAt].filter(Boolean).sort()[0] || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Transfer all anonymous product data into a verified account. Privacy settings
 * use the stricter value whenever two profiles already exist.
 */
function transferUserData(sourceUserId, targetUserId) {
  if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
    return { transferred: false, details: {} };
  }

  const details = {
    journal: journalService.transferUserData(sourceUserId, targetUserId),
    persona: personaCalibration.transferUserData(sourceUserId, targetUserId),
    travel: travelTrace.transferUserData(sourceUserId, targetUserId)
  };

  const sourceSettings = privacySettings.get(sourceUserId) || null;
  const targetSettings = privacySettings.get(targetUserId) || null;
  const mergedSettings = mergePrivacySettings(sourceSettings, targetSettings, targetUserId);
  if (mergedSettings) {
    privacySettings.set(targetUserId, mergedSettings);
    store.set(PRIVACY_NAMESPACE, targetUserId, mergedSettings);
  }
  privacySettings.delete(sourceUserId);
  store.delete(PRIVACY_NAMESPACE, sourceUserId);
  details.privacySettingsTransferred = Boolean(sourceSettings);

  return { transferred: true, details };
}

// ============ 测试辅助 ============

/**
 * 重置所有内存存储（仅用于测试）
 *
 * 注意：此函数同时重置关联的 journalService / personaCalibration / travelTrace
 */
function _reset() {
  privacySettings.clear();
  deletionMarkers.clear();
  store.clear(PRIVACY_NAMESPACE);
  store.clear(DELETION_NAMESPACE);
  journalService._reset();
  personaCalibration._reset();
  travelTrace._reset();
}

/**
 * 获取存储统计（调试用）
 */
function _getStats() {
  return {
    totalPrivacySettings: privacySettings.size,
    totalDeletionMarkers: deletionMarkers.size,
    journal: journalService._getStats(),
    persona: personaCalibration._getStats(),
    travel: travelTrace._getStats()
  };
}

module.exports = {
  // 常量
  DEFAULT_PRIVACY_SETTINGS,

  // 核心接口
  exportUserData,
  deleteUserData,
  disablePersonalization,
  getPrivacySettings,
  updatePrivacySettings,
  transferUserData,

  // 辅助
  isPersonalizationDisabled,
  getDeletionMarker,
  isUserDeleted,

  // 测试辅助
  _reset,
  _getStats
};
