/**
 * 旅格 Travel Persona · Phase 2 数据质量服务
 *
 * 职责：
 * 1. 验证城市记录完整性 —— 16维向量、POI 坐标、情报分
 * 2. 验证 POI 数据 —— name/lat/lng/type 必填
 * 3. 检查数据新鲜度 —— lastVerifiedAt 是否在有效期内
 * 4. 生成全量数据质量报告 —— 汇总所有城市的校验结果
 * 5. 城市覆盖率统计 —— 按 coverageTier 分级统计
 *
 * 对应总纲：
 * - 9.2 数据质量字段（coverageTier / lastVerifiedAt / status）
 * - 18.3 数据诚实原则（缺失字段如实标记，不掩盖）
 *
 * 返回格式统一：
 *   { valid: boolean, issues: string[], coverageTier: string }
 */

// ========== 常量 ==========

/**
 * 16 维特质向量键名（与 personaEngine.TRAIT_KEYS 一致）
 */
const REQUIRED_TRAIT_KEYS = [
  'restoration', 'nature', 'culture', 'food', 'pace', 'social',
  'budget', 'aesthetics', 'comfort', 'novelty', 'transit',
  'lowCrowd', 'authenticity', 'weatherFlex', 'bookingEase', 'workation'
];

/**
 * 6 维基础向量键名（cityRecords.js 旧格式）
 */
const LEGACY_DIMENSION_KEYS = [
  'freedom', 'social', 'explore', 'nature', 'pace', 'budget'
];

/**
 * 覆盖率分级标准
 * - A 级：数据完整，16维齐全，POI 有坐标，情报分完整
 * - B 级：数据基本完整，部分字段缺失（如 POI 无坐标）
 * - C 级：数据不完整，关键字段缺失
 */
const COVERAGE_TIERS = {
  A: 'A', // 完整
  B: 'B', // 基本完整
  C: 'C'  // 不完整
};

/** 数据新鲜度默认阈值（天） */
const DEFAULT_MAX_AGE_DAYS = 90;

/** POI 过期阈值（天）—— lastVerifiedAt 超过此值的 POI 标记为 stale */
const POI_STALE_THRESHOLD_DAYS = 180;

/** POI 必填字段 */
const POI_REQUIRED_FIELDS = ['name', 'lat', 'lng', 'type'];

// ========== 工具函数 ==========

/**
 * 安全解析日期字符串为时间戳
 * @param {string|Date} dateStr
 * @returns {number} 时间戳，无效时返回 0
 */
function parseDate(dateStr) {
  if (!dateStr) return 0;
  if (dateStr instanceof Date) return dateStr.getTime();
  const ts = Date.parse(dateStr);
  return isNaN(ts) ? 0 : ts;
}

// ================================================================
//  POI 验证
// ================================================================

/**
 * 验证 POI 数据完整性
 *
 * 必填字段：name, lat, lng, type
 * lat/lng 范围：纬度 [-90, 90]，经度 [-180, 180]
 *
 * @param {Object} poi - POI 对象
 * @returns {{ valid: boolean, issues: string[] }}
 */
function validatePOI(poi) {
  const issues = [];

  if (!poi || typeof poi !== 'object') {
    return { valid: false, issues: ['POI 对象为空或类型错误'] };
  }

  // 检查必填字段
  POI_REQUIRED_FIELDS.forEach((field) => {
    if (poi[field] === undefined || poi[field] === null || poi[field] === '') {
      issues.push(`缺少必填字段: ${field}`);
    }
  });

  // 检查 name 非空字符串
  if (poi.name !== undefined && (typeof poi.name !== 'string' || poi.name.trim().length === 0)) {
    issues.push('name 必须为非空字符串');
  }

  // 检查 type 非空字符串
  if (poi.type !== undefined && (typeof poi.type !== 'string' || poi.type.trim().length === 0)) {
    issues.push('type 必须为非空字符串');
  }

  // 检查 lat/lng 数值范围
  if (poi.lat !== undefined && poi.lat !== null) {
    const lat = Number(poi.lat);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      issues.push(`lat 值非法: ${poi.lat}（应在 [-90, 90]）`);
    }
  }
  if (poi.lng !== undefined && poi.lng !== null) {
    const lng = Number(poi.lng);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      issues.push(`lng 值非法: ${poi.lng}（应在 [-180, 180]）`);
    }
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

// ================================================================
//  城市记录验证
// ================================================================

/**
 * 验证城市数据完整性
 *
 * 检查项：
 * 1. 基础字段：id, name 必填
 * 2. 16维向量（traitVector）：所有键存在且为 [0,1] 数值
 *    —— 若为 6 维旧格式（dimensions），降级为 B 级
 * 3. POI 列表：每个 POI 调用 validatePOI
 * 4. 情报分（intelligence）：检查关键字段存在
 * 5. 数据质量字段：coverageTier / lastVerifiedAt
 *
 * @param {Object} city - 城市记录（cityDatabase.adaptCity 格式或 cityRecords 旧格式）
 * @returns {{ valid: boolean, issues: string[], coverageTier: string }}
 */
function validateCityRecord(city) {
  const issues = [];

  if (!city || typeof city !== 'object') {
    return { valid: false, issues: ['城市记录为空或类型错误'], coverageTier: COVERAGE_TIERS.C };
  }

  // --- 1. 基础字段 ---
  if (!city.id) {
    issues.push('缺少必填字段: id');
  }
  if (!city.name) {
    issues.push('缺少必填字段: name');
  }

  // --- 2. 维度向量验证 ---
  let hasFullTraitVector = false;
  let hasLegacyDimensions = false;

  if (city.traitVector) {
    hasFullTraitVector = true;
    REQUIRED_TRAIT_KEYS.forEach((key) => {
      const val = city.traitVector[key];
      if (val === undefined || val === null) {
        issues.push(`traitVector 缺少维度: ${key}`);
      } else if (typeof val !== 'number' || isNaN(val)) {
        issues.push(`traitVector.${key} 非数值: ${val}`);
      } else if (val < 0 || val > 1) {
        issues.push(`traitVector.${key} 超出 [0,1] 范围: ${val}`);
      }
    });
  } else if (city.dimensions) {
    hasLegacyDimensions = true;
    LEGACY_DIMENSION_KEYS.forEach((key) => {
      const val = city.dimensions[key];
      if (val === undefined || val === null) {
        issues.push(`dimensions 缺少维度: ${key}`);
      } else if (typeof val !== 'number' || isNaN(val) || val < 0 || val > 1) {
        issues.push(`dimensions.${key} 值非法: ${val}`);
      }
    });
  } else {
    issues.push('缺少维度向量（traitVector 或 dimensions）');
  }

  // --- 3. POI 列表验证 ---
  if (city.pois && Array.isArray(city.pois)) {
    if (city.pois.length === 0) {
      issues.push('POI 列表为空');
    }
    city.pois.forEach((poi, idx) => {
      const poiResult = validatePOI(poi);
      if (!poiResult.valid) {
        poiResult.issues.forEach((issue) => {
          issues.push(`POI[${idx}] "${poi.name || '?'}": ${issue}`);
        });
      }
    });
  } else {
    issues.push('缺少 POI 列表');
  }

  // --- 4. 情报分验证（intelligence） ---
  if (city.intelligence) {
    const intelKeys = ['transportEase', 'costStability', 'poiDepth', 'weatherBackup'];
    intelKeys.forEach((key) => {
      if (city.intelligence[key] === undefined) {
        issues.push(`intelligence 缺少字段: ${key}`);
      }
    });
  } else if (hasFullTraitVector) {
    // 完整格式应该有 intelligence，缺失则记为问题（但不致命）
    issues.push('缺少 intelligence 情报分（建议补充）');
  }

  // --- 5. 覆盖率分级 ---
  let coverageTier;
  if (issues.length === 0 && hasFullTraitVector) {
    coverageTier = COVERAGE_TIERS.A;
  } else if (issues.filter(i => !i.includes('建议补充')).length === 0 && (hasFullTraitVector || hasLegacyDimensions)) {
    // 仅有建议性问题（如缺少 intelligence 建议）不影响 B 级
    coverageTier = COVERAGE_TIERS.A;
  } else if (hasLegacyDimensions && issues.filter(i => i.includes('lat') || i.includes('lng')).length > 0) {
    // 6 维旧格式 + POI 无坐标 → B 级
    coverageTier = COVERAGE_TIERS.B;
  } else if (issues.length <= 3) {
    coverageTier = COVERAGE_TIERS.B;
  } else {
    coverageTier = COVERAGE_TIERS.C;
  }

  return {
    valid: issues.filter(i => !i.includes('建议补充')).length === 0,
    issues,
    coverageTier
  };
}

// ================================================================
//  数据新鲜度检查
// ================================================================

/**
 * 检查城市数据新鲜度
 *
 * 判断 lastVerifiedAt 距今是否超过 maxAgeDays 天。
 *
 * @param {Object} city - 城市记录（需含 lastVerifiedAt 字段）
 * @param {number} [maxAgeDays=90] - 最大允许年龄（天）
 * @returns {{ fresh: boolean, ageDays: number, maxAgeDays: number, issue: string|null }}
 */
function checkDataFreshness(city, maxAgeDays = DEFAULT_MAX_AGE_DAYS) {
  const verifiedAt = parseDate(city && city.lastVerifiedAt);

  if (verifiedAt === 0) {
    return {
      fresh: false,
      ageDays: Infinity,
      maxAgeDays,
      issue: `缺少 lastVerifiedAt 字段或日期格式无效`
    };
  }

  const ageMs = Date.now() - verifiedAt;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays > maxAgeDays) {
    return {
      fresh: false,
      ageDays,
      maxAgeDays,
      issue: `数据已过期 ${ageDays} 天（超过 ${maxAgeDays} 天阈值）`
    };
  }

  return {
    fresh: true,
    ageDays,
    maxAgeDays,
    issue: null
  };
}

// ================================================================
//  全量数据质量报告
// ================================================================

/**
 * 生成全量数据质量报告
 *
 * 遍历所有城市记录，汇总校验结果和新鲜度状态。
 *
 * @returns {{
 *   totalCities: number,
 *   validCount: number,
 *   coverageDistribution: { A: number, B: number, C: number },
 *   freshness: { fresh: number, stale: number },
 *   cityReports: Array,
 *   summary: string
 * }}
 */
function generateQualityReport() {
  // 优先使用 cityRecords（getCities 返回完整16维 CityRecord 格式），
  // 回退到 cityDatabase（CITIES 为6维旧格式）
  let cities = [];
  let dataSource = 'unknown';

  try {
    const records = require('../../data/cityRecords');
    if (typeof records.getCities === 'function') {
      cities = records.getCities();
      dataSource = 'cityRecords (16维完整格式)';
    } else {
      throw new Error('getCities 不可用');
    }
  } catch (e) {
    // cityRecords 的 getCities 可能依赖 data.js 文件，加载失败时回退
    try {
      const { CITIES } = require('../../data/cityDatabase');
      cities = CITIES || [];
      dataSource = 'cityDatabase (6维旧格式)';
    } catch (e2) {
      cities = [];
      dataSource = '加载失败';
    }
  }

  const cityReports = [];
  let validCount = 0;
  const coverageDistribution = { A: 0, B: 0, C: 0 };
  const freshness = { fresh: 0, stale: 0 };

  cities.forEach((city) => {
    // 完整性校验
    const validation = validateCityRecord(city);
    // 新鲜度检查
    const fresh = checkDataFreshness(city, DEFAULT_MAX_AGE_DAYS);

    if (validation.valid) validCount++;
    coverageDistribution[validation.coverageTier]++;

    if (fresh.fresh) {
      freshness.fresh++;
    } else {
      freshness.stale++;
    }

    cityReports.push({
      cityId: city.id,
      cityName: city.name,
      valid: validation.valid,
      coverageTier: validation.coverageTier,
      issueCount: validation.issues.length,
      issues: validation.issues,
      fresh: fresh.fresh,
      ageDays: fresh.ageDays
    });
  });

  const totalCities = cities.length;
  const summary =
    `数据源: ${dataSource} | ` +
    `城市总数: ${totalCities} | ` +
    `有效: ${validCount}/${totalCities} | ` +
    `覆盖率: A=${coverageDistribution.A} B=${coverageDistribution.B} C=${coverageDistribution.C} | ` +
    `新鲜度: 新鲜=${freshness.fresh} 过期=${freshness.stale}`;

  return {
    totalCities,
    validCount,
    coverageDistribution,
    freshness,
    cityReports,
    dataSource,
    summary,
    generatedAt: new Date().toISOString()
  };
}

// ================================================================
//  POI 过期检测
// ================================================================

/**
 * 检测单个 POI 是否过期（stale）
 *
 * 当 POI 的 lastVerifiedAt 距今超过 POI_STALE_THRESHOLD_DAYS（180天），
 * 或缺少 lastVerifiedAt 字段时，标记为 stale。
 *
 * @param {Object} poi - POI 对象
 * @param {Object} cityContext - 所属城市上下文 { cityId, cityName }
 * @param {number} [thresholdDays=180] - 过期阈值天数
 * @returns {{ stale: boolean, poiName: string, cityId: string, cityName: string, ageDays: number|null, reason: string }}
 */
function checkPOIStaleness(poi, cityContext, thresholdDays = POI_STALE_THRESHOLD_DAYS) {
  if (!poi || typeof poi !== 'object') {
    return {
      stale: true,
      poiName: 'unknown',
      cityId: cityContext ? cityContext.cityId : 'unknown',
      cityName: cityContext ? cityContext.cityName : 'unknown',
      ageDays: null,
      reason: 'POI 对象无效'
    };
  }

  const verifiedAt = parseDate(poi.lastVerifiedAt);
  const ctx = {
    cityId: (cityContext && cityContext.cityId) || 'unknown',
    cityName: (cityContext && cityContext.cityName) || 'unknown'
  };

  if (verifiedAt === 0) {
    return {
      stale: true,
      poiName: poi.name || 'unnamed',
      ...ctx,
      ageDays: null,
      reason: '缺少 lastVerifiedAt 字段'
    };
  }

  const ageMs = Date.now() - verifiedAt;
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

  if (ageDays > thresholdDays) {
    return {
      stale: true,
      poiName: poi.name || 'unnamed',
      ...ctx,
      ageDays,
      reason: `lastVerifiedAt 超过 ${thresholdDays} 天（实际 ${ageDays} 天）`
    };
  }

  return {
    stale: false,
    poiName: poi.name || 'unnamed',
    ...ctx,
    ageDays,
    reason: null
  };
}

/**
 * 获取所有需要更新的 POI 列表（stale POIs）
 *
 * 遍历所有城市的 POI，返回 lastVerifiedAt 超过 180 天的 POI 列表。
 * 按过期天数降序排列，优先处理最旧的数据。
 *
 * @param {number} [thresholdDays=180] - 过期阈值天数
 * @returns {{
 *   totalPois: number,
 *   staleCount: number,
 *   stalePois: Array<{ stale: boolean, poiName: string, cityId: string, cityName: string, ageDays: number|null, reason: string }>,
 *   cityBreakdown: Object<string, number>,
 *   summary: string
 * }}
 */
function getStalePois(thresholdDays = POI_STALE_THRESHOLD_DAYS) {
  let cities = [];
  let dataSource = 'unknown';

  try {
    const records = require('../../data/cityRecords');
    if (typeof records.getCities === 'function') {
      cities = records.getCities();
      dataSource = 'cityRecords (16维完整格式)';
    } else {
      throw new Error('getCities 不可用');
    }
  } catch (e) {
    try {
      const { CITIES } = require('../../data/cityDatabase');
      cities = CITIES || [];
      dataSource = 'cityDatabase (6维旧格式)';
    } catch (e2) {
      cities = [];
      dataSource = '加载失败';
    }
  }

  let totalPois = 0;
  const stalePois = [];
  const cityBreakdown = {};

  cities.forEach((city) => {
    if (city.pois && Array.isArray(city.pois)) {
      const cityContext = { cityId: city.id || 'unknown', cityName: city.name || 'unknown' };
      city.pois.forEach((poi) => {
        totalPois++;
        const result = checkPOIStaleness(poi, cityContext, thresholdDays);
        if (result.stale) {
          stalePois.push(result);
          cityBreakdown[cityContext.cityName] = (cityBreakdown[cityContext.cityName] || 0) + 1;
        }
      });
    }
  });

  // 按过期天数降序排列（null 排最后）
  stalePois.sort((a, b) => {
    if (a.ageDays === null) return 1;
    if (b.ageDays === null) return -1;
    return b.ageDays - a.ageDays;
  });

  const staleCityCount = Object.keys(cityBreakdown).length;
  const summary =
    `POI 过期检测 | 数据源: ${dataSource} | ` +
    `总 POI 数: ${totalPois} | ` +
    `过期 POI: ${stalePois.length}/${totalPois} | ` +
    `涉及城市: ${staleCityCount}`;

  return {
    totalPois,
    staleCount: stalePois.length,
    stalePois,
    cityBreakdown,
    dataSource,
    summary,
    thresholdDays,
    generatedAt: new Date().toISOString()
  };
}

// ================================================================
//  城市覆盖率统计
// ================================================================

/**
 * 城市覆盖率统计
 *
 * 按 coverageTier 分级统计城市数量和比例。
 *
 * @returns {{
 *   total: number,
 *   tiers: { A: {count, ratio}, B: {count, ratio}, C: {count, ratio} },
 *   overallCoverage: number,
 *   summary: string
 * }}
 */
function getCoverageStats() {
  // 优先使用 cityRecords（getCities），回退到 cityDatabase（CITIES）
  let cities = [];
  try {
    const records = require('../../data/cityRecords');
    if (typeof records.getCities === 'function') {
      cities = records.getCities();
    } else {
      throw new Error('getCities 不可用');
    }
  } catch (e) {
    try {
      const { CITIES } = require('../../data/cityDatabase');
      cities = CITIES || [];
    } catch (e2) {
      cities = [];
    }
  }

  const total = cities.length;
  const tiers = { A: 0, B: 0, C: 0 };

  cities.forEach((city) => {
    const validation = validateCityRecord(city);
    tiers[validation.coverageTier]++;
  });

  const ratio = (count) => (total > 0 ? parseFloat((count / total * 100).toFixed(1)) : 0);

  // 整体覆盖率 = (A + B) / total（A 和 B 级视为可用数据）
  const overallCoverage = total > 0
    ? parseFloat(((tiers.A + tiers.B) / total * 100).toFixed(1))
    : 0;

  const summary =
    `城市覆盖率统计: 总计 ${total} 座 | ` +
    `A 级(完整): ${tiers.A} (${ratio(tiers.A)}%) | ` +
    `B 级(基本): ${tiers.B} (${ratio(tiers.B)}%) | ` +
    `C 级(不完整): ${tiers.C} (${ratio(tiers.C)}%) | ` +
    `整体可用覆盖率: ${overallCoverage}%`;

  return {
    total,
    tiers: {
      A: { count: tiers.A, ratio: ratio(tiers.A) },
      B: { count: tiers.B, ratio: ratio(tiers.B) },
      C: { count: tiers.C, ratio: ratio(tiers.C) }
    },
    overallCoverage,
    summary,
    generatedAt: new Date().toISOString()
  };
}

// ========== 导出 ==========

module.exports = {
  // 校验方法
  validateCityRecord,
  validatePOI,
  checkDataFreshness,
  // POI 过期检测
  checkPOIStaleness,
  getStalePois,
  // 报告与统计
  generateQualityReport,
  getCoverageStats,
  // 常量
  COVERAGE_TIERS,
  REQUIRED_TRAIT_KEYS,
  LEGACY_DIMENSION_KEYS,
  POI_REQUIRED_FIELDS,
  DEFAULT_MAX_AGE_DAYS,
  POI_STALE_THRESHOLD_DAYS
};
