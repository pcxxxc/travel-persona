/**
 * 旅格 Travel Persona · 运营 API 路由（总纲 14.1-14.5）
 *
 * 路由清单：
 *   GET /api/v1/ops/health         — 系统健康检查（包含各服务状态）
 *   GET /api/v1/ops/metrics        — 获取监控指标
 *   GET /api/v1/ops/data-quality   — 数据质量报告
 *   GET /api/v1/ops/coverage       — 城市覆盖率统计
 *   POST /api/v1/ops/poi-refresh  — 触发 POI 数据刷新（标记城市为待更新状态）
 *   GET /api/v1/ops/complaints     — 查询投诉列表
 *   POST /api/v1/ops/complaints    — 提交投诉
 *
 * 认证：
 *   所有路由需要通过 x-api-key header 进行 API Key 认证。
 *   API Key 通过环境变量 OPS_API_KEY 配置。
 *   测试环境可设置 OPS_API_KEY 为固定值（如 'test-ops-key'）。
 *
 * 说明：
 * 本路由为运营管理接口，面向内部运维人员和监控系统，
 * 不直接面向终端用户。生产环境应配合 IP 白名单 / VPN 使用。
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const monitoring = require('../../services/ops/monitoring');
const contentSafety = require('../../services/ops/contentSafety');
const semanticContentSafety = require('../../services/ops/semanticContentSafety');
const backup = require('../../services/ops/backup');
const databaseBackup = require('../../services/ops/databaseBackup');

const REGION_PROVINCES = {
  华北: ['北京', '天津', '河北', '山西', '内蒙古'],
  东北: ['辽宁', '吉林', '黑龙江'],
  华东: ['上海', '江苏', '浙江', '安徽', '福建', '江西', '山东'],
  华中: ['河南', '湖北', '湖南'],
  华南: ['广东', '广西', '海南', '香港', '澳门'],
  西南: ['重庆', '四川', '贵州', '云南', '西藏'],
  西北: ['陕西', '甘肃', '青海', '宁夏', '新疆']
};

function getCityRegion(city) {
  if (city.region || city.area) return city.region || city.area;
  const province = String(city.province || '');
  return Object.keys(REGION_PROVINCES).find(region => REGION_PROVINCES[region].some(item => province.includes(item))) || '未分类';
}

function getConnectionCoverage() {
  const { INTERCITY_CONNECTIONS } = require('../../data/intercityConnections');
  const confidenceTotal = INTERCITY_CONNECTIONS.reduce((sum, item) => sum + Number(item.confidence || 0), 0);
  const cities = new Set(INTERCITY_CONNECTIONS.flatMap(item => [item.from, item.to]));
  return {
    totalConnections: INTERCITY_CONNECTIONS.length,
    coveredCities: cities.size,
    averageConfidence: INTERCITY_CONNECTIONS.length ? confidenceTotal / INTERCITY_CONNECTIONS.length : 0,
    liveVerifiedConnections: INTERCITY_CONNECTIONS.filter(item => !item.requiresLiveCheck).length,
    requiresLiveCheck: INTERCITY_CONNECTIONS.filter(item => item.requiresLiveCheck).length
  };
}

// ========== 运营数据存储（进程内内存） ==========

/**
 * POI 刷新标记
 * 结构：Map<cityId, { cityId, cityName, markedAt, status: 'pending'|'processing'|'done' }>
 */
const _poiRefreshMarks = new Map();

/**
 * 投诉存储
 * 结构：Array<{poiId, cityId, type, description, reporterId, createdAt, id, status}>
 */
const _complaints = [];

const VALID_COMPLAINT_TYPES = new Set(['closure', 'priceAnomaly', 'safety', 'other']);
const MAX_COMPLAINTS_STORED = 10000;

// ========== API Key 认证中间件 ==========

/**
 * 运营 API 认证中间件
 *
 * 从 x-api-key header 读取 API Key，与环境变量 OPS_API_KEY 对比。
 * 生产环境未配置 OPS_API_KEY 时拒绝提供运营接口；开发测试使用固定测试值。
 *
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {Function} next
 */
function apiKeyAuth(req, res, next) {
  const expectedKey = process.env.OPS_API_KEY
    || (process.env.NODE_ENV === 'production' ? '' : 'test-ops-key');
  const providedKey = req.get('x-api-key');

  if (!expectedKey) {
    return res.status(503).json({
      code: 'TP-1503',
      type: 'CONFIGURATION',
      message: 'OPS_API_KEY is not configured',
      userVisible: false
    });
  }

  if (!providedKey) {
    return res.status(401).json({
      code: 'TP-1401',
      type: 'AUTH',
      message: '缺少 x-api-key 认证头',
      userMessage: '需要 API Key 才能访问运营接口',
      userVisible: false
    });
  }

  const providedBuffer = Buffer.from(providedKey);
  const expectedBuffer = Buffer.from(expectedKey);
  const keyMatches = providedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(providedBuffer, expectedBuffer);

  if (!keyMatches) {
    return res.status(403).json({
      code: 'TP-1403',
      type: 'AUTH',
      message: 'API Key 无效',
      userMessage: 'API Key 认证失败',
      userVisible: false
    });
  }

  next();
}

// 所有运营路由都需要认证
router.use(apiKeyAuth);

// ========== GET /api/v1/ops/health ==========
// 系统健康检查（包含各服务状态）

router.get('/health', (req, res) => {
  const sloResults = monitoring.evaluateSLOs();
  const alertHistory = monitoring.getAlertHistory(5);

  // 检查各服务健康状态
  const monitoringStorage = monitoring.getMonitoringStorageStatus();
  const services = {
    monitoring: {
      status: monitoringStorage.mode === 'sqlite' ? 'ok' : 'degraded',
      alertCount: alertHistory.length,
      storage: monitoringStorage
    },
    contentSafety: {
      status: semanticContentSafety.getStatus().providerState === 'open' ? 'degraded' : 'ok',
      categories: Object.keys(contentSafety.getSensitiveCategories()).length,
      semantic: semanticContentSafety.getStatus()
    },
    backup: {
      status: databaseBackup.getBackupReadiness().status === 'ready' ? 'ok' : 'degraded',
      totalLogicalSnapshots: backup.listBackups().length,
      database: databaseBackup.getBackupReadiness()
    }
  };

  // 判断整体健康状态
  const allOk = Object.values(services).every(s => s.status === 'ok');
  const overallStatus = allOk ? 'ok' : 'degraded';

  res.json({
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime ? Math.floor(process.uptime()) : null,
    services,
    slo: sloResults,
    recentAlerts: alertHistory
  });
});

// ========== GET /api/v1/ops/metrics ==========
// 获取监控指标
//
// 查询参数：
//   name  — 指标名称（可选，不传则返回所有指标概要）
//   start — 起始时间戳（毫秒，可选）
//   end   — 结束时间戳（毫秒，可选）

router.get('/metrics', (req, res) => {
  const { name, start, end } = req.query;

  // 如果指定了指标名称，返回该指标的详细数据
  if (name) {
    const timeRange = {};
    if (start) timeRange.start = parseInt(start, 10);
    if (end) timeRange.end = parseInt(end, 10);

    const metrics = monitoring.getMetrics(name, timeRange);
    return res.json({
      metric: name,
      ...metrics
    });
  }

  // 未指定名称，返回所有已注册指标的概要
  const definitions = monitoring.getMetricDefinitions();
  const summary = {};

  for (const metricName of Object.keys(definitions)) {
    const m = monitoring.getMetrics(metricName);
    summary[metricName] = {
      count: m.count,
      avg: m.avg,
      p95: m.p95,
      unit: definitions[metricName].unit,
      description: definitions[metricName].description
    };
  }

  res.json({
    metrics: summary,
    slo: monitoring.evaluateSLOs(),
    timestamp: new Date().toISOString()
  });
});

router.get('/client-events', (req, res) => {
  res.json(monitoring.getClientEventSummary());
});

// ========== GET /api/v1/ops/data-quality ==========
// 数据质量报告
//
// 报告城市数据的完整度、维度覆盖率等信息。

router.get('/data-quality', (req, res) => {
  let cityCount = 0;
  let cityNames = [];
  let dimensionCoverage = {};
  let poiCount = 0;
  let freshCityCount = 0;
  let poiDepthTotal = 0;
  let traceableCityCount = 0;

  // 尝试加载城市数据
  try {
    const { getCities } = require('../../data/cityRecords');
    const cities = getCities();
    cityCount = cities.length;
    cityNames = cities.map(c => c.name || c.id).filter(Boolean);

    // 统计 POI 数量与字段完整度
    const requiredPoiFields = [
      'name', 'zone', 'type', 'duration', 'indoor', 'lat', 'lng',
      'coordinateSystem', 'coordinateVerifiedAt', 'coordinateSourceUrl',
      'openHours', 'priceBand', 'bookingRequired', 'bestSeasons',
      'crowdLevel', 'commonPitfalls', 'suitableFor', 'notSuitableFor',
      'accessibility', 'sourceRefs', 'lastVerifiedAt', 'dataConfidence'
    ];
    for (const city of cities) {
      if (Array.isArray(city.pois)) {
        poiCount += city.pois.length;
        const quantityScore = Math.min(city.pois.length / 20, 1);
        let fieldScore = 0;
        for (const poi of city.pois) {
          let filled = 0;
          for (const f of requiredPoiFields) {
            if (poi[f] !== undefined && poi[f] !== null && poi[f] !== '') filled++;
          }
          fieldScore += filled / requiredPoiFields.length;
        }
        fieldScore = city.pois.length > 0 ? fieldScore / city.pois.length : 0;
        poiDepthTotal += quantityScore * fieldScore;
      }
      const verifiedAt = Date.parse(city.lastVerifiedAt || '');
      if (Number.isFinite(verifiedAt) && Date.now() - verifiedAt <= 180 * 24 * 60 * 60 * 1000) freshCityCount += 1;
      if (Array.isArray(city.sourceRefs) && city.sourceRefs.length > 0) traceableCityCount += 1;
    }

    // 维度覆盖率（基于16维标准）
    const dimensions = [
      'restoration', 'nature', 'culture', 'food', 'pace', 'social',
      'budget', 'aesthetics', 'comfort', 'novelty', 'transit',
      'lowCrowd', 'authenticity', 'weatherFlex', 'bookingEase', 'workation'
    ];
    for (const dim of dimensions) {
      const filled = cities.filter(c => c.traitVector && c.traitVector[dim] !== undefined).length;
      dimensionCoverage[dim] = {
        filled,
        total: cityCount,
        ratio: cityCount > 0 ? filled / cityCount : 0
      };
    }
  } catch (err) {
    // 城市数据不可用时返回空报告
    console.warn('[ops/data-quality] 城市数据加载失败:', err.message);
  }

  // 计算整体数据质量分
  const coverageValues = Object.values(dimensionCoverage).map(d => d.ratio);
  const avgCoverage = coverageValues.length > 0
    ? coverageValues.reduce((a, b) => a + b, 0) / coverageValues.length
    : 0;
  const intercityCoverage = getConnectionCoverage();
  const freshnessRatio = cityCount ? freshCityCount / cityCount : 0;
  const poiDepthRatio = cityCount ? poiDepthTotal / cityCount : 0;
  const cityBreadthRatio = Math.min(cityCount / 32, 1);
  const routeBreadthRatio = Math.min(intercityCoverage.totalConnections / 80, 1);
  const traceabilityRatio = cityCount ? traceableCityCount / cityCount : 0;
  const readinessScore = Math.round((
    avgCoverage * 0.2
    + freshnessRatio * 0.15
    + poiDepthRatio * 0.25
    + cityBreadthRatio * 0.2
    + routeBreadthRatio * 0.15
    + traceabilityRatio * 0.05
  ) * 100);

  res.json({
    timestamp: new Date().toISOString(),
    cityCount,
    poiCount,
    dimensionCoverage,
    averageDimensionCoverage: avgCoverage,
    schemaQualityScore: Math.round(avgCoverage * 100),
    schemaQualityGrade: avgCoverage >= 0.9 ? 'A' : avgCoverage >= 0.7 ? 'B' : avgCoverage >= 0.5 ? 'C' : 'D',
    qualityScore: readinessScore,
    qualityGrade: readinessScore >= 85 ? 'A' : readinessScore >= 70 ? 'B' : readinessScore >= 55 ? 'C' : 'D',
    componentScores: {
      schemaCompleteness: Math.round(avgCoverage * 100),
      freshness: Math.round(freshnessRatio * 100),
      poiDepth: Math.round(poiDepthRatio * 100),
      cityBreadth: Math.round(cityBreadthRatio * 100),
      routeBreadth: Math.round(routeBreadthRatio * 100),
      traceability: Math.round(traceabilityRatio * 100)
    },
    launchTargets: { cities: 32, poisPerCity: 20, intercityConnections: 80 },
    intercityCoverage,
    // 投诉统计
    complaintStats: {
      total: _complaints.length,
      open: _complaints.filter(c => c.status === 'open').length,
      resolved: _complaints.filter(c => c.status === 'resolved').length,
      byType: (() => {
        const byType = {};
        for (const c of _complaints) {
          byType[c.type] = (byType[c.type] || 0) + 1;
        }
        return byType;
      })()
    }
  });
});

// ========== GET /api/v1/ops/coverage ==========
// 城市覆盖率统计
//
// 报告系统支持的城市列表、按区域分布等。

router.get('/coverage', (req, res) => {
  let cities = [];

  try {
    const { getCities } = require('../../data/cityRecords');
    cities = getCities();
  } catch (err) {
    console.warn('[ops/coverage] 城市数据加载失败:', err.message);
  }

  // 按区域分组统计
  const byRegion = {};
  for (const city of cities) {
    const region = getCityRegion(city);
    if (!byRegion[region]) {
      byRegion[region] = [];
    }
    byRegion[region].push({
      id: city.id,
      name: city.name,
      poiCount: Array.isArray(city.pois) ? city.pois.length : 0
    });
  }

  // 区域统计摘要
  const regionSummary = {};
  for (const [region, list] of Object.entries(byRegion)) {
    regionSummary[region] = {
      cityCount: list.length,
      totalPois: list.reduce((sum, c) => sum + c.poiCount, 0)
    };
  }

  res.json({
    timestamp: new Date().toISOString(),
    totalCities: cities.length,
    totalPois: cities.reduce((sum, c) => sum + (Array.isArray(c.pois) ? c.pois.length : 0), 0),
    byRegion,
    regionSummary,
    intercityCoverage: getConnectionCoverage(),
    cities: cities.map(c => ({
      id: c.id,
      name: c.name,
      region: getCityRegion(c),
      province: c.province || null,
      poiCount: Array.isArray(c.pois) ? c.pois.length : 0
    }))
  });
});

// ========== POST /api/v1/ops/poi-refresh ==========
// 触发 POI 数据刷新（标记城市为待更新状态）
//
// 请求体：
//   { cityId: string, cityName?: string }
//
// 将指定城市标记为"待更新"，等待后台数据刷新任务处理。

router.post('/poi-refresh', (req, res) => {
  const { cityId, cityName } = req.body;

  if (!cityId || typeof cityId !== 'string' || cityId.trim().length === 0) {
    return res.status(400).json({
      code: 'TP-1006',
      type: 'VALIDATION',
      message: 'cityId 为必填字段且不能为空',
      userVisible: false
    });
  }

  const entry = {
    cityId: cityId.trim(),
    cityName: (cityName || cityId).trim(),
    markedAt: new Date().toISOString(),
    status: 'pending'
  };

  _poiRefreshMarks.set(entry.cityId, entry);

  res.json({
    accepted: true,
    cityId: entry.cityId,
    cityName: entry.cityName,
    status: entry.status,
    markedAt: entry.markedAt
  });
});

// ========== GET /api/v1/ops/complaints ==========
// 查询投诉列表
//
// 查询参数：
//   type  — 投诉类型（可选，closure|priceAnomaly|safety|other）
//   poiId — POI ID（可选）
//   cityId — 城市 ID（可选）
//   status — 状态（可选，open|resolved）

router.get('/complaints', (req, res) => {
  const { type, poiId, cityId, status } = req.query;

  let filtered = _complaints;

  if (type && VALID_COMPLAINT_TYPES.has(type)) {
    filtered = filtered.filter(c => c.type === type);
  }
  if (poiId) {
    filtered = filtered.filter(c => c.poiId === poiId);
  }
  if (cityId) {
    filtered = filtered.filter(c => c.cityId === cityId);
  }
  if (status && (status === 'open' || status === 'resolved')) {
    filtered = filtered.filter(c => c.status === status);
  }

  // 投诉统计摘要
  const stats = {
    total: _complaints.length,
    byType: {},
    open: _complaints.filter(c => c.status === 'open').length,
    resolved: _complaints.filter(c => c.status === 'resolved').length
  };
  for (const c of _complaints) {
    stats.byType[c.type] = (stats.byType[c.type] || 0) + 1;
  }

  res.json({
    complaints: filtered.map(c => ({
      id: c.id,
      poiId: c.poiId,
      cityId: c.cityId,
      type: c.type,
      description: c.description,
      status: c.status,
      reporterId: c.reporterId,
      createdAt: c.createdAt
    })),
    stats,
    timestamp: new Date().toISOString()
  });
});

// ========== POST /api/v1/ops/complaints ==========
// 提交投诉
//
// 请求体：
//   { poiId: string, cityId: string, type: 'closure'|'priceAnomaly'|'safety'|'other', description: string, reporterId?: string }

router.post('/complaints', (req, res) => {
  const { poiId, cityId, type, description, reporterId } = req.body;

  // 参数校验
  if (!poiId || typeof poiId !== 'string' || poiId.trim().length === 0) {
    return res.status(400).json({
      code: 'TP-1006',
      type: 'VALIDATION',
      message: 'poiId 为必填字段且不能为空',
      userVisible: false
    });
  }
  if (!cityId || typeof cityId !== 'string' || cityId.trim().length === 0) {
    return res.status(400).json({
      code: 'TP-1006',
      type: 'VALIDATION',
      message: 'cityId 为必填字段且不能为空',
      userVisible: false
    });
  }
  if (!type || !VALID_COMPLAINT_TYPES.has(type)) {
    return res.status(400).json({
      code: 'TP-1006',
      type: 'VALIDATION',
      message: `type 必须是以下之一: ${Array.from(VALID_COMPLAINT_TYPES).join(', ')}`,
      userVisible: false
    });
  }
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    return res.status(400).json({
      code: 'TP-1006',
      type: 'VALIDATION',
      message: 'description 为必填字段且不能为空',
      userVisible: false
    });
  }

  const complaint = {
    id: `cpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    poiId: poiId.trim(),
    cityId: cityId.trim(),
    type,
    description: description.trim().slice(0, 2000),
    reporterId: reporterId ? String(reporterId).trim().slice(0, 64) : null,
    createdAt: new Date().toISOString(),
    status: 'open'
  };

  _complaints.push(complaint);

  // 防止内存无限增长
  if (_complaints.length > MAX_COMPLAINTS_STORED) {
    _complaints.splice(0, _complaints.length - MAX_COMPLAINTS_STORED);
  }

  res.status(201).json({
    accepted: true,
    complaint: {
      id: complaint.id,
      poiId: complaint.poiId,
      cityId: complaint.cityId,
      type: complaint.type,
      status: complaint.status,
      createdAt: complaint.createdAt
    }
  });
});

module.exports = router;
