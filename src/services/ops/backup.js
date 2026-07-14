/**
 * 旅格 Travel Persona · 备份与恢复服务（总纲 14.4）
 *
 * 职责：
 * 1. createBackup(scope)        — 创建备份标记（scope: user | system | persona）
 * 2. getBackupStatus(backupId)  — 查询备份状态
 * 3. restoreFromBackup(backupId)— 从备份恢复数据
 * 4. verifyBackupIntegrity(backupId) — 验证备份完整性
 *
 * 备份策略（总纲 14.4）：
 *   - 用户数据：每日备份（scope = 'user'）
 *   - 系统配置：每周备份（scope = 'system'）
 *   - 人格模型：每次校准后增量备份（scope = 'persona'）
 *
 * 备份生命周期：
 *   pending → in_progress → completed / failed
 *
 * 说明：
 * 本实现为进程内内存版，记录备份元数据与状态。
 * 生产环境应对接真实的备份存储后端（如对象存储、数据库快照），
 * 并实现实际的数据导出 / 导入逻辑。接口契约保持不变。
 */

'use strict';

// ========== 备份策略配置 ==========

/**
 * 备份策略定义
 */
const BACKUP_STRATEGIES = {
  // 用户数据：每日备份
  user: {
    label: '用户数据',
    frequency: 'daily',
    description: '用户画像、手账、旅行轨迹等个人数据',
    retentionDays: 30  // 保留 30 天
  },

  // 系统配置：每周备份
  system: {
    label: '系统配置',
    frequency: 'weekly',
    description: '城市数据库、功能开关、运营配置等',
    retentionDays: 90  // 保留 90 天
  },

  // 人格模型：增量备份
  persona: {
    label: '人格模型',
    frequency: 'on-change',
    description: '人格校准后的增量快照',
    retentionDays: 60  // 保留 60 天
  }
};

/**
 * 有效的备份范围
 */
const VALID_SCOPES = Object.keys(BACKUP_STRATEGIES);

// ========== 备份状态枚举 ==========

const BackupStatus = {
  PENDING: 'pending',           // 已创建，等待执行
  IN_PROGRESS: 'in_progress',   // 正在执行备份
  COMPLETED: 'completed',       // 备份完成
  FAILED: 'failed'              // 备份失败
};

// ========== 内存存储 ==========

/**
 * 备份记录存储：Map<backupId, BackupRecord>
 * BackupRecord 结构：
 *   {
 *     id, scope, status, createdAt, completedAt,
 *     checksum, sizeBytes, itemCount, error
 *   }
 */
const _backups = new Map();

/**
 * 生成唯一备份 ID
 * 格式：bak_<scope>_<timestamp>_<random>
 * @param {string} scope
 * @returns {string}
 */
function generateBackupId(scope) {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `bak_${scope}_${ts}_${rand}`;
}

/**
 * 生成简单的校验和（用于完整性验证）
 * 生产环境应使用 SHA-256 或类似算法
 * @param {string} data
 * @returns {string}
 */
function computeChecksum(data) {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return `cs_${Math.abs(hash).toString(16)}`;
}

// ========== 核心接口 ==========

/**
 * 创建备份标记
 *
 * 创建一个备份任务记录。在完整实现中，此函数会触发实际的数据导出。
 * 当前基础版：记录备份元数据并模拟执行。
 *
 * @param {'user'|'system'|'persona'} scope - 备份范围
 * @param {Object} [options] - 可选参数
 * @param {string} [options.triggeredBy] - 触发者（如 'scheduler', 'admin', 'user:xxx'）
 * @param {Object} [options.snapshot] - 可选的数据快照（用于完整性校验）
 * @returns {{
 *   backupId: string,
 *   scope: string,
 *   status: string,
 *   createdAt: string,
 *   strategy: Object
 * }}
 */
function createBackup(scope, options = {}) {
  if (!VALID_SCOPES.includes(scope)) {
    throw new Error(`createBackup: 无效的 scope "${scope}"，有效值: ${VALID_SCOPES.join(', ')}`);
  }

  const strategy = BACKUP_STRATEGIES[scope];
  const backupId = generateBackupId(scope);

  // 模拟数据快照（生产环境为实际导出的数据）
  const snapshot = options.snapshot || { _note: '模拟快照', scope, timestamp: Date.now() };
  const checksum = computeChecksum(snapshot);

  const record = {
    id: backupId,
    scope,
    status: BackupStatus.COMPLETED,  // 基础版直接标记完成
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    triggeredBy: options.triggeredBy || 'system',
    checksum,
    sizeBytes: JSON.stringify(snapshot).length,
    itemCount: 1,
    error: null,
    // 保存快照引用（仅内存版；生产环境不保存数据本身，只保存存储路径）
    _snapshot: snapshot
  };

  _backups.set(backupId, record);

  console.log(`[Backup] 已创建备份 ${backupId} (scope=${scope}, strategy=${strategy.frequency})`);

  return {
    backupId: record.id,
    scope: record.scope,
    status: record.status,
    createdAt: record.createdAt,
    strategy
  };
}

/**
 * 查询备份状态
 *
 * @param {string} backupId - 备份 ID
 * @returns {Object|null} 备份记录（不含内部快照），不存在返回 null
 */
function getBackupStatus(backupId) {
  if (!backupId || typeof backupId !== 'string') {
    throw new Error('getBackupStatus: backupId 必须是非空字符串');
  }

  const record = _backups.get(backupId);
  if (!record) {
    return null;
  }

  // 返回时排除内部快照字段
  const { _snapshot, ...publicRecord } = record;
  return publicRecord;
}

/**
 * 从备份恢复数据
 *
 * 在完整实现中，此函数会从备份存储中读取数据并覆盖当前数据。
 * 当前基础版：验证备份存在且完整，返回恢复标记。
 *
 * @param {string} backupId - 备份 ID
 * @returns {{
 *   restored: boolean,
 *   backupId: string,
 *   scope: string,
 *   restoredAt: string,
 *   message: string
 * }}
 */
function restoreFromBackup(backupId) {
  if (!backupId || typeof backupId !== 'string') {
    throw new Error('restoreFromBackup: backupId 必须是非空字符串');
  }

  const record = _backups.get(backupId);
  if (!record) {
    return {
      restored: false,
      backupId,
      scope: null,
      restoredAt: new Date().toISOString(),
      message: `备份 ${backupId} 不存在`
    };
  }

  if (record.status !== BackupStatus.COMPLETED) {
    return {
      restored: false,
      backupId,
      scope: record.scope,
      restoredAt: new Date().toISOString(),
      message: `备份状态为 ${record.status}，无法恢复（仅 completed 状态可恢复）`
    };
  }

  // 基础版：标记恢复成功（生产环境在此执行实际数据导入）
  console.log(`[Backup] 从备份 ${backupId} 恢复数据 (scope=${record.scope})`);

  return {
    restored: true,
    backupId,
    scope: record.scope,
    restoredAt: new Date().toISOString(),
    message: `已从备份 ${backupId} 恢复 ${record.scope} 数据`
  };
}

/**
 * 验证备份完整性
 *
 * 通过重新计算校验和与备份时记录的校验和对比，
 * 判断备份数据是否完整、未被篡改。
 *
 * @param {string} backupId - 备份 ID
 * @returns {{
 *   valid: boolean,
 *   backupId: string,
 *   expectedChecksum: string,
 *   actualChecksum: string,
 *   verifiedAt: string,
 *   message: string
 * }}
 */
function verifyBackupIntegrity(backupId) {
  if (!backupId || typeof backupId !== 'string') {
    throw new Error('verifyBackupIntegrity: backupId 必须是非空字符串');
  }

  const record = _backups.get(backupId);
  if (!record) {
    return {
      valid: false,
      backupId,
      expectedChecksum: null,
      actualChecksum: null,
      verifiedAt: new Date().toISOString(),
      message: `备份 ${backupId} 不存在`
    };
  }

  // 重新计算快照的校验和
  const actualChecksum = computeChecksum(record._snapshot);
  const valid = actualChecksum === record.checksum;

  return {
    valid,
    backupId,
    expectedChecksum: record.checksum,
    actualChecksum,
    verifiedAt: new Date().toISOString(),
    message: valid
      ? '备份完整性验证通过'
      : '备份完整性验证失败：校验和不匹配，数据可能已损坏'
  };
}

// ========== 辅助接口 ==========

/**
 * 列出所有备份记录
 *
 * @param {Object} [filters] - 可选过滤条件
 * @param {string} [filters.scope] - 按范围过滤
 * @param {string} [filters.status] - 按状态过滤
 * @returns {Array}
 */
function listBackups(filters = {}) {
  const results = [];
  for (const record of _backups.values()) {
    if (filters.scope && record.scope !== filters.scope) continue;
    if (filters.status && record.status !== filters.status) continue;
    const { _snapshot, ...publicRecord } = record;
    results.push(publicRecord);
  }
  // 按创建时间降序排列（最新在前）
  results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return results;
}

/**
 * 获取备份策略定义
 * @returns {Object}
 */
function getBackupStrategies() {
  return { ...BACKUP_STRATEGIES };
}

/**
 * 清除所有备份记录（用于测试）
 */
function resetBackups() {
  _backups.clear();
}

module.exports = {
  // 核心接口
  createBackup,
  getBackupStatus,
  restoreFromBackup,
  verifyBackupIntegrity,

  // 辅助接口
  listBackups,
  getBackupStrategies,

  // 测试辅助
  resetBackups,

  // 常量导出
  BACKUP_STRATEGIES,
  BackupStatus,
  VALID_SCOPES
};
