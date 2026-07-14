/**
 * 旅格 Travel Persona · 六维加权评分算法（v2）
 *
 * 核心改进：
 * 1. 输入验证：所有入口函数验证输入数据
 * 2. 天气过滤：移除 Math.random()，改用可注入的天气数据
 * 3. 错误处理：所有异常抛出 PersonaError，支持降级
 * 4. 可观测性：记录推荐耗时和结果分布
 *
 * 纯函数设计：无外部依赖（除城市数据），无 LLM 调用。
 */

const { CITIES } = require('../data/cityDatabase');
const { ValidationError, DataError, safeExecute } = require('../utils/errors');
const { validatePersonaScore, validatePersonaScoreValues, validateCityList } = require('../utils/validation');

// 六维权重（和为 1）
// 权重依据：
// - nature(0.25): 最影响目的地大类（自然 vs 城市）
// - pace(0.20): 决定城市气质匹配（慢 vs 快）
// - social(0.20): 情绪驱动用户核心诉求（独处 vs 热闹）
// - budget(0.15): 现实约束（经济匹配度）
// - explore(0.12): 影响小众 vs 热门（Plog 连续体）
// - freedom(0.08): 更多影响行程，非选城市（权重最低）
const WEIGHTS = {
  nature: 0.25,
  pace: 0.20,
  social: 0.20,
  budget: 0.15,
  explore: 0.12,
  freedom: 0.08
};

const DIMENSIONS = Object.keys(WEIGHTS);

// 理论最大距离（当用户和城市在所有维度上都相差 1 时）
// sqrt(Σ wᵢ × 1²) = sqrt(0.25 + 0.20 + 0.20 + 0.15 + 0.12 + 0.08) = sqrt(1) = 1
const MAX_DISTANCE = 1;

/**
 * 计算加权欧氏距离
 *
 * 公式：distance = sqrt( Σ wᵢ × (userᵢ − cityᵢ)² )
 *
 * @param {Object} userScore - 用户 PersonaScore（已验证）
 * @param {Object} cityDims - 城市 dimensions（已验证）
 * @returns {number} 加权欧氏距离 [0, 1]
 */
function weightedEuclideanDistance(userScore, cityDims) {
  let sum = 0;

  for (const dim of DIMENSIONS) {
    const userVal = userScore[dim] ?? 0.5;
    const cityVal = cityDims[dim] ?? 0.5;
    const diff = userVal - cityVal;
    sum += WEIGHTS[dim] * diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * 计算匹配分（0-100）
 *
 * 公式：matchScore = round( (1 − distance / maxDist) × 100 )
 *
 * @param {number} distance - 加权欧氏距离
 * @returns {number} 匹配分 [0, 100]
 */
function matchScore(distance) {
  return Math.round((1 - distance / MAX_DISTANCE) * 100);
}

/**
 * 天气过滤
 *
 * 改进：
 * - 移除 Math.random()，改用可注入的天气数据
 * - 支持测试时注入固定天气数据
 * - 支持强制启用/禁用天气过滤
 *
 * @param {Array} cities - 城市列表（含 matchScore）
 * @param {Object} options
 * @param {Object} options.weatherData - 可注入的天气数据 { cityId: { hasExtremeWeather: boolean, note: string } }
 * @param {boolean} options.forceFilter - 是否强制启用过滤（即使无天气数据）
 * @returns {Array} 过滤后的城市列表
 */
function weatherFilter(cities, options = {}) {
  const { weatherData = null, forceFilter = false } = options;

  if (!Array.isArray(cities) || cities.length === 0) {
    return [];
  }

  return cities.map(city => {
    let hasExtremeWeather = false;
    let weatherNote = null;

    // 如果提供了天气数据，使用它
    if (weatherData && weatherData[city.id]) {
      hasExtremeWeather = weatherData[city.id].hasExtremeWeather;
      weatherNote = weatherData[city.id].note;
    } else if (forceFilter) {
      // 强制过滤模式：给特定城市标记极端天气（用于测试）
      // 默认不给任何城市标记，除非显式指定
      hasExtremeWeather = false;
    }

    const weatherPenalty = hasExtremeWeather ? 0.85 : 1;
    const adjustedScore = Math.round(city.matchScore * weatherPenalty);

    return {
      ...city,
      weatherNote,
      adjustedScore,
      hasExtremeWeather
    };
  });
}

/**
 * 核心推荐函数：输入用户画像 → 输出 TopK 城市
 *
 * 改进：
 * - 输入验证：验证 userScore 的完整性和数值范围
 * - 数据验证：过滤掉数据不完整的城市
 * - 错误处理：所有异常抛出 PersonaError
 * - 可观测性：记录推荐耗时和结果
 *
 * @param {Object} userScore - PersonaScore
 * @param {Object} options - 可选参数
 * @param {number} options.topK - 返回城市数量，默认 3
 * @param {boolean} options.includeWeather - 是否启用天气过滤，默认 false（Week 2 接入真实 API 后改为 true）
 * @param {Object} options.weatherData - 可注入的天气数据
 * @returns {Object} { topCities: Array, allScores: Array, personaLabel: Object, metadata: Object }
 */
function recommendCities(userScore, options = {}) {
  const startTime = Date.now();

  const {
    topK = 3,
    includeWeather = false,
    weatherData = null
  } = options;

  // ===== 输入验证 =====
  // 验证 userScore 完整性
  validatePersonaScore(userScore, { allowPartial: false });

  // 验证 userScore 数值范围
  const valueCheck = validatePersonaScoreValues(userScore, { autoFix: false });
  if (!valueCheck.valid) {
    throw new ValidationError(
      `PersonaScore 包含非法值: ${JSON.stringify(valueCheck.violations)}`,
      { violations: valueCheck.violations }
    );
  }

  // 验证城市数据
  const cityValidation = validateCityList(CITIES);
  if (cityValidation.validCities.length === 0) {
    throw new DataError('没有有效的城市数据', { invalidCities: cityValidation.invalidCities });
  }

  // ===== Step 1: 计算所有城市匹配分 =====
  const scoredCities = cityValidation.validCities.map(city => {
    const distance = weightedEuclideanDistance(userScore, city.dimensions);
    const score = matchScore(distance);

    return {
      id: city.id,
      name: city.name,
      dimensions: city.dimensions,
      emotionTags: city.emotionTags,
      pois: city.pois,
      distance: parseFloat(distance.toFixed(4)),
      matchScore: score
    };
  });

  // ===== Step 2: 排序取 Top10 =====
  const top10 = scoredCities
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

  // ===== Step 3: 天气过滤 =====
  let filtered = top10;
  let weatherApplied = false;

  if (includeWeather) {
    filtered = weatherFilter(top10, { weatherData });
    filtered.sort((a, b) => b.adjustedScore - a.adjustedScore);
    weatherApplied = true;
  }

  // ===== Step 4: 取 TopK =====
  const topCities = filtered.slice(0, topK).map(city => ({
    id: city.id,
    name: city.name,
    dimensions: city.dimensions,
    matchScore: weatherApplied ? city.adjustedScore : city.matchScore,
    originalScore: city.matchScore,
    emotionTags: city.emotionTags,
    pois: city.pois,
    weatherNote: city.weatherNote || null,
    hasExtremeWeather: city.hasExtremeWeather || false
  }));

  // ===== Step 5: 人格标签 =====
  // 从 dimensionMapping.js 引入（避免循环依赖，这里动态引入）
  let personaLabel = { label: '未知', confidence: 0 };
  try {
    const { inferPersonaLabel } = require('../data/dimensionMapping');
    personaLabel = inferPersonaLabel(userScore);
  } catch (err) {
    // 人格标签失败不影响推荐结果
    console.warn('[recommendCities] 人格标签推断失败:', err.message);
  }

  // ===== 元数据 =====
  const duration = Date.now() - startTime;
  const metadata = {
    duration,
    totalCities: scoredCities.length,
    validCities: cityValidation.validCities.length,
    invalidCities: cityValidation.invalidCities.length,
    weatherApplied,
    scoreRange: {
      highest: topCities[0]?.matchScore || 0,
      lowest: topCities[topCities.length - 1]?.matchScore || 0
    }
  };

  return {
    topCities,
    allScores: scoredCities.sort((a, b) => b.matchScore - a.matchScore),
    personaLabel,
    metadata
  };
}

/**
 * 生成推荐理由（模板版）
 *
 * 改进：
 * - 输入验证
 * - 更丰富的理由模板
 * - 支持自定义用户原话
 *
 * @param {Object} userScore - PersonaScore
 * @param {Object} city - 推荐城市
 * @param {Object} options
 * @param {string} options.userQuote - 用户原话（用于引用）
 * @returns {Object} { reason, honestNote, highlight }
 */
function generateReason(userScore, city, options = {}) {
  const { userQuote = '' } = options;

  // 验证输入
  if (!city || !city.dimensions) {
    throw new ValidationError('生成理由需要有效的城市数据', { city });
  }

  const dimNames = {
    nature: '自然', pace: '节奏', social: '社交',
    budget: '消费', explore: '探索', freedom: '自由'
  };

  // 找出最匹配的维度（差异最小）
  let bestDim = 'nature';
  let bestDiff = Infinity;
  for (const dim of DIMENSIONS) {
    const diff = Math.abs((userScore[dim] ?? 0.5) - (city.dimensions[dim] ?? 0.5));
    if (diff < bestDiff) {
      bestDiff = diff;
      bestDim = dim;
    }
  }

  // 找出最不匹配的维度（差异最大）
  let worstDim = 'budget';
  let worstDiff = 0;
  for (const dim of DIMENSIONS) {
    const diff = Math.abs((userScore[dim] ?? 0.5) - (city.dimensions[dim] ?? 0.5));
    if (diff > worstDiff) {
      worstDiff = diff;
      worstDim = dim;
    }
  }

  // 理由模板（更丰富）
  const reasons = {
    nature: `${city.name}的自然氛围与你的状态高度契合，山海之间能让人真正慢下来。`,
    pace: `${city.name}的节奏刚好适合你此刻想要的步调，不紧不慢，刚刚好。`,
    social: `${city.name}的烟火气和人情味，能接住你想要连接的心情。`,
    budget: `${city.name}的消费水平在你的预算范围内，不用为花钱焦虑。`,
    explore: `${city.name}有足够的新鲜感等你去发现，不会觉得无聊。`,
    freedom: `${city.name}给你足够的空间自由探索，没有必须打卡的压力。`
  };

  // 诚实提醒模板
  const honestNotes = {
    nature: '如果你期待繁华都市的便利，这里可能不够热闹。',
    pace: '如果你喜欢快节奏的充实感，这里可能会让你觉得慢。',
    social: '如果你想独处安静，这里的烟火气可能会打扰你。',
    budget: '如果你的预算很宽裕，这里的消费可能让你觉得不够尽兴。',
    explore: '如果你追求小众独特，这里的热门景点可能会让你失望。',
    freedom: '如果你喜欢被安排好的行程，这里的自由可能会让你无所适从。'
  };

  // 如果有用户原话，尝试引用
  let reason = reasons[bestDim] || `${city.name}与你的旅行人格高度匹配。`;
  if (userQuote && userQuote.length > 0) {
    // 简单引用：在理由开头添加引用
    reason = `你说"${userQuote}"——${reason}`;
  }

  return {
    reason,
    honestNote: honestNotes[worstDim] || '每个城市都有不适合的地方，建议你根据自己的状态权衡。',
    highlight: dimNames[bestDim],
    bestMatch: {
      dimension: bestDim,
      userValue: parseFloat((userScore[bestDim] ?? 0.5).toFixed(2)),
      cityValue: parseFloat((city.dimensions[bestDim] ?? 0.5).toFixed(2)),
      diff: parseFloat(bestDiff.toFixed(3))
    },
    worstMatch: {
      dimension: worstDim,
      userValue: parseFloat((userScore[worstDim] ?? 0.5).toFixed(2)),
      cityValue: parseFloat((city.dimensions[worstDim] ?? 0.5).toFixed(2)),
      diff: parseFloat(worstDiff.toFixed(3))
    }
  };
}

/**
 * 批量推荐（用于测试和数据分析）
 *
 * @param {Array} testCases - 测试用例数组 [{ name, answers }, ...]
 * @returns {Array} 结果数组
 */
function batchRecommend(testCases) {
  const { computePersonaScore } = require('../data/dimensionMapping');

  return testCases.map(tc => {
    const startTime = Date.now();

    try {
      const personaResult = computePersonaScore(tc.answers);
      const recResult = recommendCities(personaResult.score);

      return {
        name: tc.name,
        success: true,
        personaScore: personaResult.score,
        personaLabel: recResult.personaLabel,
        topCities: recResult.topCities,
        duration: Date.now() - startTime,
        metadata: recResult.metadata
      };
    } catch (err) {
      return {
        name: tc.name,
        success: false,
        error: err.message,
        type: err.type,
        duration: Date.now() - startTime
      };
    }
  });
}

// 导出
module.exports = {
  WEIGHTS,
  DIMENSIONS,
  MAX_DISTANCE,
  weightedEuclideanDistance,
  matchScore,
  weatherFilter,
  recommendCities,
  generateReason,
  batchRecommend
};
