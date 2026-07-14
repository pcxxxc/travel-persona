/**
 * 旅格 Travel Persona · 监控服务（总纲 14.1-14.3）
 *
 * 职责：
 * 1. 记录与查询核心运行指标（recordMetric / getMetrics）
 * 2. 基于阈值的告警检查（alert）
 * 3. 定义并跟踪 SLO（核心 API P95 < 2s，错误率 < 1%）
 *
 * 核心监控指标（总纲 14.1）：
 *   - plan_generation_time      规划生成时间（毫秒）
 *   - api_error_rate            API 错误率（0-1）
 *   - agent_fallback_rate       Agent 降级率（0-1）
 *   - map_freshness_ratio       地图数据新鲜率（0-1）
 *   - persona_update_acceptance_rate  人格更新接受率（0-1）
 *   - sensitive_content_blocked_count 敏感内容拦截数（整数）
 *
 * SLO 定义（总纲 14.2）：
 *   - 核心 API P95 延迟 < 2000ms
 *   - 核心 API 错误率 < 1%
 *
 * 说明：
 * 本实现为进程内内存版监控，适用于单实例部署与测试。
 * 生产环境应替换为 Prometheus / Grafana 或类似时序数据库后端。
 * 接口契约保持不变，只需替换内部存储实现。
 */

'use strict';

const { getStore } = require('../storage/sqliteStore');

// ========== 指标存储 ==========

/**
 * 指标数据点结构：{ value, tags, timestamp }
 * 使用 Map<metricName, DataPoint[]> 存储
 */
const _store = new Map();

/**
 * 告警历史记录（最近触发）
 */
const _alertHistory = [];

/**
 * 最大保留数据点数（防止内存无限增长）
 */
const MAX_POINTS_PER_METRIC = 10000;

/**
 * 最大告警历史条数
 */
const MAX_ALERT_HISTORY = 500;
const METRIC_RETENTION_DAYS = Math.min(
  Math.max(Number(process.env.TP_METRIC_RETENTION_DAYS) || 30, 1),
  365
);
let persistentStorageAvailable = true;
let lastPrunedAt = 0;

// ========== 核心监控指标定义 ==========

/**
 * 核心监控指标注册表
 * 每个指标定义包含：单位、描述、默认告警阈值、SLO 目标
 */
const METRIC_DEFINITIONS = {
  // 规划生成时间（毫秒）
  plan_generation_time: {
    unit: 'ms',
    description: '旅行规划生成的端到端耗时',
    alertThreshold: { op: '>', value: 5000 },
    slo: { p95: 2000, description: 'P95 延迟 < 2000ms' }
  },

  // API 错误率（0-1）
  api_error_rate: {
    unit: 'ratio',
    description: '核心 API 请求错误率',
    alertThreshold: { op: '>', value: 0.05 },
    slo: { max: 0.01, description: '错误率 < 1%' }
  },

  // Agent 降级率（0-1）
  agent_fallback_rate: {
    unit: 'ratio',
    description: 'Agent 增强请求触发本地降级的比例',
    alertThreshold: { op: '>', value: 0.3 },
    slo: { max: 0.2, description: '降级率 < 20%（非硬性 SLO）' }
  },

  // 地图数据新鲜率（0-1）
  map_freshness_ratio: {
    unit: 'ratio',
    description: '地图 POI 数据在有效期内的比例',
    alertThreshold: { op: '<', value: 0.8 },
    slo: { min: 0.9, description: '新鲜率 >= 90%' }
  },

  // 人格更新接受率（0-1）
  persona_update_acceptance_rate: {
    unit: 'ratio',
    description: '人格校准提案被用户接受的比例',
    alertThreshold: { op: '<', value: 0.3 },
    slo: { min: 0.4, description: '接受率 >= 40%（观察指标）' }
  },

  // 敏感内容拦截数（整数）
  sensitive_content_blocked_count: {
    unit: 'count',
    description: '内容安全服务拦截的敏感内容总数',
    alertThreshold: { op: '>', value: 100 },
    slo: null
  },

  content_safety_fallback_rate: {
    unit: 'ratio',
    description: '语义内容安全服务降级到本地规则的比例',
    alertThreshold: { op: '>', value: 0.2 },
    slo: { max: 0.05, description: '内容安全降级率 < 5%' }
  },

  client_event_count: {
    unit: 'count',
    description: '用户端匿名运行事件计数（仅白名单维度）',
    alertThreshold: { op: '>', value: 100 },
    slo: null
  },

  // ========== 推荐质量与运营指标看板（P2-3） ==========

  // 推荐多样性分数（0-1）：衡量推荐结果在维度覆盖上的多样性
  recommendation_diversity_score: {
    unit: 'ratio',
    description: '推荐结果多样性分数（0-1），衡量推荐在维度覆盖上的多样性',
    alertThreshold: { op: '<', value: 0.5 },
    slo: { min: 0.6, description: '推荐多样性分数 >= 60%' }
  },

  // 路线失败率（0-1）：路线生成过程中出现错误或降级的比例
  route_failure_rate: {
    unit: 'ratio',
    description: '路线生成失败率（0-1），包含错误、降级和空结果',
    alertThreshold: { op: '>', value: 0.1 },
    slo: { max: 0.05, description: '路线失败率 < 5%' }
  },

  // 降级率（0-1）：功能降级到本地/备用方案的比例
  degradation_rate: {
    unit: 'ratio',
    description: '服务降级率（0-1），功能降级到本地或备用方案',
    alertThreshold: { op: '>', value: 0.3 },
    slo: { max: 0.15, description: '降级率 < 15%' }
  },

  // 提案接受率（0-1）：人格校准提案被用户接受的比例
  proposal_acceptance_rate: {
    unit: 'ratio',
    description: '人格校准提案接受率（0-1）',
    alertThreshold: { op: '<', value: 0.3 },
    slo: { min: 0.4, description: '提案接受率 >= 40%' }
  },

  // 证据撤回率（0-1）：证据因事实校验不合格被撤回的比例
  evidence_withdrawal_rate: {
    unit: 'ratio',
    description: '证据撤回率（0-1），证据因事实校验不合格被撤回',
    alertThreshold: { op: '>', value: 0.2 },
    slo: { max: 0.1, description: '证据撤回率 < 10%' }
  },

  // 完整审查完成率（0-1）：行程经过完整审查流程的比例
  full_review_completion_rate: {
    unit: 'ratio',
    description: '完整审查完成率（0-1），行程经过完整审查流程',
    alertThreshold: { op: '<', value: 0.7 },
    slo: { min: 0.85, description: '完整审查完成率 >= 85%' }
  }
};

const ALLOWED_TAG_KEYS = new Set([
  'endpoint', 'surface', 'event', 'code', 'mode', 'source', 'provider',
  'status', 'durationBucket', 'reason'
]);

function sanitizeMetricTags(tags) {
  const safe = {};
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return safe;

  for (const [key, rawValue] of Object.entries(tags)) {
    if (!ALLOWED_TAG_KEYS.has(key)) continue;
    const value = String(rawValue == null ? '' : rawValue).slice(0, 64);
    if (/^[A-Za-z0-9_:/.-]+$/.test(value)) safe[key] = value;
  }
  return safe;
}

// ========== SLO 定义 ==========

/**
 * 系统 SLO 定义（总纲 14.2）
 */
const SLO_DEFINITIONS = {
  core_api_latency: {
    metric: 'plan_generation_time',
    percentile: 95,
    target: 2000,
    unit: 'ms',
    description: '核心 API P95 延迟 < 2 秒',
    window: '5m'
  },
  core_api_error_rate: {
    metric: 'api_error_rate',
    target: 0.01,
    unit: 'ratio',
    description: '核心 API 错误率 < 1%',
    window: '5m'
  }
};

// ========== 工具函数 ==========

/**
 * 计算分位数
 * @param {number[]} sortedValues - 已排序的数值数组
 * @param {number} p - 分位数（0-100）
 * @returns {number}
 */
function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)];
}

/**
 * 计算平均值
 * @param {number[]} values
 * @returns {number}
 */
function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 比较运算符判断
 * @param {number} value - 实际值
 * @param {string} op - 运算符（'>', '<', '>=', '<=', '=='）
 * @param {number} threshold - 阈值
 * @returns {boolean}
 */
function compare(value, op, threshold) {
  switch (op) {
    case '>':  return value > threshold;
    case '<':  return value < threshold;
    case '>=': return value >= threshold;
    case '<=': return value <= threshold;
    case '==': return value === threshold;
    default:   return false;
  }
}

// ========== 核心接口 ==========

/**
 * 记录一个指标数据点
 *
 * @param {string} name - 指标名称（参见 METRIC_DEFINITIONS）
 * @param {number} value - 指标值
 * @param {Object} [tags] - 可选的低基数白名单标签，不接受用户或行程标识
 * @returns {{ recorded: boolean, metric: string, value: number }}
 */
function recordMetric(name, value, tags = {}) {
  if (!name || typeof name !== 'string') {
    throw new Error('recordMetric: name 必须是非空字符串');
  }
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`recordMetric: value 必须是有效数字，收到: ${value}`);
  }

  const dataPoint = {
    value,
    tags: sanitizeMetricTags(tags),
    timestamp: Date.now()
  };

  if (!_store.has(name)) {
    _store.set(name, []);
  }

  const arr = _store.get(name);
  arr.push(dataPoint);

  // 防止内存无限增长：超过上限时丢弃最旧的数据点
  if (arr.length > MAX_POINTS_PER_METRIC) {
    arr.splice(0, arr.length - MAX_POINTS_PER_METRIC);
  }

  if (persistentStorageAvailable) {
    try {
      const store = getStore();
      store.appendMetric(name, value, dataPoint.tags, dataPoint.timestamp, MAX_POINTS_PER_METRIC);
      if (dataPoint.timestamp - lastPrunedAt >= 60 * 60 * 1000) {
        store.pruneMetrics(dataPoint.timestamp - METRIC_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        lastPrunedAt = dataPoint.timestamp;
      }
    } catch (error) {
      persistentStorageAvailable = false;
      console.warn(`[Monitor] persistent storage unavailable: ${error.message}`);
    }
  }

  return { recorded: true, metric: name, value };
}

function getClientEventSummary(now = Date.now()) {
  const points = getMetrics('client_event_count').points;
  const windows = {
    last15m: now - 15 * 60 * 1000,
    last24h: now - 24 * 60 * 60 * 1000
  };

  function aggregate(start) {
    const summary = { total: 0, byEvent: {}, bySurface: {}, byCode: {}, byMode: {} };
    points.filter(point => point.timestamp >= start && point.timestamp <= now).forEach(point => {
      summary.total += point.value;
      [['byEvent', 'event'], ['bySurface', 'surface'], ['byCode', 'code'], ['byMode', 'mode']]
        .forEach(([group, tag]) => {
          const value = point.tags[tag];
          if (value) summary[group][value] = (summary[group][value] || 0) + point.value;
        });
    });
    return summary;
  }

  return {
    last15m: aggregate(windows.last15m),
    last24h: aggregate(windows.last24h),
    generatedAt: new Date(now).toISOString(),
    privacy: 'allowlisted-anonymous-no-content'
  };
}

/**
 * 查询指标数据
 *
 * @param {string} name - 指标名称
 * @param {Object} [timeRange] - 时间范围
 * @param {number} [timeRange.start] - 起始时间戳（毫秒）
 * @param {number} [timeRange.end] - 结束时间戳（毫秒，默认当前）
 * @returns {{
 *   name: string,
 *   count: number,
 *   values: number[],
 *   points: Array,
 *   avg: number,
 *   min: number,
 *   max: number,
 *   p50: number,
 *   p95: number,
 *   p99: number
 * }}
 */
function getMetrics(name, timeRange = {}) {
  const end = timeRange.end || Date.now();
  const start = timeRange.start || 0;
  let filtered;

  if (persistentStorageAvailable) {
    try {
      filtered = getStore().listMetric(name, start, end);
    } catch (error) {
      persistentStorageAvailable = false;
      console.warn(`[Monitor] persistent query unavailable: ${error.message}`);
    }
  }
  if (!filtered) {
    const arr = _store.get(name) || [];
    filtered = arr.filter(p => p.timestamp >= start && p.timestamp <= end);
  }
  const values = filtered.map(p => p.value).sort((a, b) => a - b);

  return {
    name,
    count: values.length,
    values,
    points: filtered,
    avg: average(values),
    min: values.length > 0 ? values[0] : 0,
    max: values.length > 0 ? values[values.length - 1] : 0,
    p50: percentile(values, 50),
    p95: percentile(values, 95),
    p99: percentile(values, 99)
  };
}

/**
 * 告警检查：判断指定指标当前值是否超过阈值
 *
 * @param {string} name - 指标名称
 * @param {{ op: string, value: number }} threshold - 阈值定义
 * @param {string} message - 告警消息
 * @returns {{
 *   triggered: boolean,
 *   metric: string,
 *   currentValue: number,
 *   threshold: { op: string, value: number },
 *   message: string,
 *   timestamp: string
 * }}
 */
function alert(name, threshold, message) {
  const metrics = getMetrics(name);
  const currentValue = metrics.count > 0 ? metrics.avg : 0;
  const triggered = compare(currentValue, threshold.op, threshold.value);

  const result = {
    triggered,
    metric: name,
    currentValue,
    threshold,
    message,
    timestamp: new Date().toISOString()
  };

  if (triggered) {
    _alertHistory.push(result);
    if (_alertHistory.length > MAX_ALERT_HISTORY) {
      _alertHistory.shift();
    }
    console.warn(`[Monitor:ALERT] ${name} 当前值=${currentValue} ${threshold.op} ${threshold.value} — ${message}`);
  }

  return result;
}

// ========== SLO 评估 ==========

/**
 * 评估所有 SLO 的达成情况
 *
 * @returns {Object} SLO 评估结果
 */
function evaluateSLOs() {
  const results = {};

  for (const [sloName, sloDef] of Object.entries(SLO_DEFINITIONS)) {
    const metrics = getMetrics(sloDef.metric);
    let currentValue;

    if (sloDef.percentile) {
      currentValue = metrics[`p${sloDef.percentile}`];
    } else {
      currentValue = metrics.avg;
    }

    const met = currentValue <= sloDef.target;

    results[sloName] = {
      ...sloDef,
      currentValue,
      met,
      sampleCount: metrics.count
    };
  }

  return results;
}

/**
 * 获取告警历史
 * @param {number} [limit=20] - 返回最近 N 条
 * @returns {Array}
 */
function getAlertHistory(limit = 20) {
  return _alertHistory.slice(-limit);
}

/**
 * 获取所有已注册的指标名称及其定义
 * @returns {Object}
 */
function getMetricDefinitions() {
  return { ...METRIC_DEFINITIONS };
}

function getMonitoringStorageStatus() {
  return {
    mode: persistentStorageAvailable ? 'sqlite' : 'memory-fallback',
    retentionDays: METRIC_RETENTION_DAYS,
    maxPointsPerMetric: MAX_POINTS_PER_METRIC
  };
}

/**
 * 获取 SLO 定义
 * @returns {Object}
 */
function getSLODefinitions() {
  return { ...SLO_DEFINITIONS };
}

/**
 * 重置所有指标数据（用于测试）
 */
function resetMetrics() {
  _store.clear();
  _alertHistory.length = 0;
  try {
    getStore().clearMetrics();
    persistentStorageAvailable = true;
    lastPrunedAt = 0;
  } catch (error) {
    persistentStorageAvailable = false;
  }
}

module.exports = {
  // 核心接口
  recordMetric,
  getMetrics,
  alert,

  // SLO 与告警
  evaluateSLOs,
  getAlertHistory,
  getSLODefinitions,

  // 指标元信息
  getMetricDefinitions,
  getClientEventSummary,
  sanitizeMetricTags,
  getMonitoringStorageStatus,

  // 测试辅助
  resetMetrics,

  // 常量导出
  METRIC_DEFINITIONS,
  SLO_DEFINITIONS
};
