/**
 * 旅格 Travel Persona · 功能开关（总纲 14.5 灰度发布）
 *
 * 职责：
 * 1. isEnabled(flagName, userId?)    — 检查某功能是否对当前用户启用
 * 2. getEnabledFeatures(userId?)     — 获取当前用户已启用的功能列表
 *
 * 支持两种开关模式：
 *   - 全局开关：对所有用户统一启用/禁用
 *   - 按用户灰度：基于用户 ID 的哈希值，按百分比逐步放开
 *
 * 预定义开关：
 *   - agent_enhancement     Agent 增强（AI 意图理解、解释增强等）
 *   - real_time_map         实时地图（对接百度地图实时数据）
 *   - journal_analysis      手账分析（自动总结和人格校准）
 *   - persona_calibration   人格校准（根据手账更新画像）
 *   - multi_city_route      多城路线（跨城市行程规划）
 *
 * 配置方式：
 *   - 环境变量 FEATURE_<FLAG_NAME>=true|false 可覆盖默认全局状态
 *   - 灰度百分比通过 DEFAULT_FLAGS 中的 rolloutPercentage 配置
 *   - 也可通过 setFlag() 在运行时动态修改（如运营后台调用）
 */

'use strict';

// ========== 预定义功能开关 ==========

/**
 * 功能开关默认配置
 *
 * @typedef {Object} FlagConfig
 * @property {boolean} enabled - 全局启用状态
 * @property {number} rolloutPercentage - 灰度百分比（0-100），100 表示全量启用
 * @property {string} description - 功能描述
 * @property {boolean} userOverrideAllowed - 是否允许按用户手动覆盖
 */
const DEFAULT_FLAGS = {
  // Agent 增强：AI 意图理解、解释增强、行程调整、手账总结
  agent_enhancement: {
    enabled: false,
    rolloutPercentage: 0,
    description: 'Agent 增强（AI 意图理解、解释增强等）',
    userOverrideAllowed: true
  },

  // 实时地图：对接百度地图实时 POI 数据
  real_time_map: {
    enabled: false,
    rolloutPercentage: 0,
    description: '实时地图（对接百度地图实时数据）',
    userOverrideAllowed: false
  },

  // 手账分析：自动总结旅行手账
  journal_analysis: {
    enabled: false,
    rolloutPercentage: 10,
    description: '手账分析（自动总结和人格校准）',
    userOverrideAllowed: true
  },

  // 人格校准：根据手账自动更新人格画像
  persona_calibration: {
    enabled: false,
    rolloutPercentage: 5,
    description: '人格校准（根据手账更新画像）',
    userOverrideAllowed: true
  },

  // 多城路线：跨城市行程规划
  multi_city_route: {
    enabled: false,
    rolloutPercentage: 0,
    description: '多城路线（跨城市行程规划）',
    userOverrideAllowed: false
  },

  // ========== 付费层功能开关 ==========

  // 多城路线深度优化：付费用户可获得更优的多城路线编排
  advancedMultiCity: {
    enabled: false,
    rolloutPercentage: 0,
    description: '多城路线深度优化（付费功能）',
    userOverrideAllowed: false
  },

  // 高级人格报告导出：付费用户可导出详细人格分析报告
  exportPersonaReport: {
    enabled: false,
    rolloutPercentage: 0,
    description: '高级人格报告导出（付费功能）',
    userOverrideAllowed: false
  },

  // 批量行程规划：付费用户可同时规划多个行程
  batchPlanning: {
    enabled: false,
    rolloutPercentage: 0,
    description: '批量行程规划（付费功能）',
    userOverrideAllowed: false
  }
};

// ========== 运行时状态 ==========

/**
 * 当前生效的开关配置（深拷贝默认值，避免修改原始常量）
 */
let _flags = JSON.parse(JSON.stringify(DEFAULT_FLAGS));

/**
 * 按用户的手动覆盖记录
 * 结构：Map<userId, Map<flagName, boolean>>
 */
const _userOverrides = new Map();

// ========== 工具函数 ==========

/**
 * 基于用户 ID 生成稳定的哈希值（0-99）
 *
 * 同一 userId 每次计算结果相同，保证灰度放开的稳定性。
 * 使用简单字符串哈希算法，适用于灰度分流场景。
 *
 * @param {string} userId - 用户 ID
 * @returns {number} 0-99 的哈希值
 */
function hashUserId(userId) {
  if (!userId || typeof userId !== 'string') {
    return 0;
  }
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

/**
 * 从环境变量读取开关覆盖
 * 环境变量格式：FEATURE_AGENT_ENHANCEMENT=true
 *
 * @param {string} flagName
 * @returns {boolean|null} - true/false 表示环境变量覆盖值，null 表示无覆盖
 */
function getEnvOverride(flagName) {
  const envKey = `FEATURE_${flagName.toUpperCase()}`;
  const value = process.env[envKey];
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return value === 'true' || value === '1';
}

// ========== 核心接口 ==========

/**
 * 检查功能是否启用
 *
 * 判断优先级（从高到低）：
 * 1. 用户级手动覆盖（如果 userOverrideAllowed 且存在覆盖）
 * 2. 环境变量覆盖
 * 3. 全局启用状态（enabled）
 * 4. 灰度百分比（基于 userId 哈希）
 *
 * @param {string} flagName - 功能开关名称
 * @param {string} [userId] - 用户 ID（可选，用于灰度判断）
 * @returns {boolean} 是否启用
 */
function isEnabled(flagName, userId) {
  const flag = _flags[flagName];
  if (!flag) {
    // 未注册的开关默认返回 false
    return false;
  }

  // 1. 用户级手动覆盖
  if (userId && flag.userOverrideAllowed) {
    const userMap = _userOverrides.get(userId);
    if (userMap && userMap.has(flagName)) {
      return userMap.get(flagName);
    }
  }

  // 2. 环境变量覆盖
  const envValue = getEnvOverride(flagName);
  if (envValue !== null) {
    return envValue;
  }

  // 3. 全局启用状态
  if (flag.enabled) {
    return true;
  }

  // 4. 灰度百分比（需要 userId）
  if (userId && flag.rolloutPercentage > 0) {
    const hash = hashUserId(userId);
    return hash < flag.rolloutPercentage;
  }

  return false;
}

/**
 * 获取用户已启用的功能列表
 *
 * @param {string} [userId] - 用户 ID（可选）
 * @returns {string[]} 已启用的功能开关名称数组
 */
function getEnabledFeatures(userId) {
  const enabled = [];

  for (const flagName of Object.keys(_flags)) {
    if (isEnabled(flagName, userId)) {
      enabled.push(flagName);
    }
  }

  return enabled;
}

// ========== 管理接口 ==========

/**
 * 设置功能开关（运行时动态修改，供运营后台调用）
 *
 * @param {string} flagName - 功能开关名称
 * @param {Object} config - 配置更新
 * @param {boolean} [config.enabled] - 全局启用状态
 * @param {number} [config.rolloutPercentage] - 灰度百分比
 * @returns {Object} 更新后的开关配置
 */
function setFlag(flagName, config) {
  if (!_flags[flagName]) {
    throw new Error(`setFlag: 未知的功能开关 "${flagName}"`);
  }

  if (config.enabled !== undefined) {
    _flags[flagName].enabled = Boolean(config.enabled);
  }
  if (config.rolloutPercentage !== undefined) {
    const pct = Number(config.rolloutPercentage);
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      throw new Error(`setFlag: rolloutPercentage 必须是 0-100 的数字`);
    }
    _flags[flagName].rolloutPercentage = pct;
  }

  return { ..._flags[flagName] };
}

/**
 * 为特定用户设置手动覆盖
 *
 * @param {string} userId - 用户 ID
 * @param {string} flagName - 功能开关名称
 * @param {boolean} enabled - 是否启用
 */
function setUserOverride(userId, flagName, enabled) {
  if (!_flags[flagName]) {
    throw new Error(`setUserOverride: 未知的功能开关 "${flagName}"`);
  }
  if (!_flags[flagName].userOverrideAllowed) {
    throw new Error(`setUserOverride: 功能开关 "${flagName}" 不允许用户级覆盖`);
  }

  if (!_userOverrides.has(userId)) {
    _userOverrides.set(userId, new Map());
  }
  _userOverrides.get(userId).set(flagName, Boolean(enabled));
}

/**
 * 清除特定用户的手动覆盖
 *
 * @param {string} userId - 用户 ID
 * @param {string} [flagName] - 功能开关名称（不传则清除该用户所有覆盖）
 */
function clearUserOverride(userId, flagName) {
  if (!flagName) {
    _userOverrides.delete(userId);
    return;
  }
  const userMap = _userOverrides.get(userId);
  if (userMap) {
    userMap.delete(flagName);
  }
}

/**
 * 获取所有功能开关的当前配置（不含用户覆盖）
 *
 * @returns {Object} 开关配置快照
 */
function getAllFlags() {
  return JSON.parse(JSON.stringify(_flags));
}

/**
 * 重置所有开关为默认值（用于测试）
 */
function resetFlags() {
  _flags = JSON.parse(JSON.stringify(DEFAULT_FLAGS));
  _userOverrides.clear();
}

module.exports = {
  // 核心接口
  isEnabled,
  getEnabledFeatures,

  // 管理接口
  setFlag,
  setUserOverride,
  clearUserOverride,
  getAllFlags,

  // 测试辅助
  resetFlags,

  // 常量导出
  DEFAULT_FLAGS
};
