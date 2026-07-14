/**
 * 旅格 Travel Persona · 多层混合评分引擎（v3）
 *
 * 设计理念：
 * 旅行推荐不是简单的"距离最近=最匹配"。真实用户决策是分层的：
 *   Layer 1: 硬约束过滤（预算天花板、高反禁忌、签证限制）
 *   Layer 2: 软匹配打分（六维加权欧氏距离）
 *   Layer 3: 上下文增强（季节、天气、节庆事件）
 *   Layer 4: 协同信号（相似用户行为、趋势热度）
 *   Layer 5: 多样性注入（避免“大理大理大理”的 echo chamber）
 *
 * 每层独立计算、可插拔、有置信度，最终融合为综合得分。
 *
 * 纯函数设计：零外部状态，无副作用，完全可测试。
 */

const { ValidationError, AlgorithmError } = require('../utils/errors');
const { validatePersonaScore, validatePersonaScoreValues } = require('../utils/validation');

// ============================================================
// 六维权重配置（和 v2 保持一致）
// ============================================================
const WEIGHTS = {
  nature: 0.25,
  pace: 0.20,
  social: 0.20,
  budget: 0.15,
  explore: 0.12,
  freedom: 0.08
};

const DIMENSIONS = Object.keys(WEIGHTS);

// ============================================================
// Layer 1: 硬约束过滤
// ============================================================

/**
 * 硬约束类型
 * - budgetCeiling: 预算上限（日消费不能超过）
 * - altitudeLimit: 海拔限制（高反禁忌）
 * - stayDays: 天数匹配（3天行程不去需要7天的城市）
 * - transportRequirement: 交通可达性（高铁/飞机）
 * - climateSensitivity: 气候敏感（怕热/怕冷）
 */

const HARD_CONSTRAINT_CHECKS = {
  // 预算硬约束：日预算上限
  budgetCeiling(city, userProfile) {
    const maxDaily = userProfile.maxDailyBudget;
    if (!maxDaily) return { passed: true };
    const cityMin = parseInt((city.profile?.dailyCost || '200').split('-')[0]) || 200;
    return { passed: cityMin <= maxDaily, reason: cityMin > maxDaily ? `日消费约 ¥${cityMin}，超出预算 ¥${maxDaily}` : null };
  },

  // 海拔限制
  altitudeLimit(city, userProfile) {
    if (!userProfile.altitudeSensitive) return { passed: true };
    const highAltCities = ['lasa', 'lijiang'];
    return {
      passed: !highAltCities.includes(city.id),
      reason: highAltCities.includes(city.id) ? '该城市海拔较高，已为你排除' : null
    };
  },

  // 天数匹配
  stayDays(city, userProfile) {
    const tripDays = userProfile.tripDays;
    if (!tripDays) return { passed: true };
    const suggestDays = city.profile?.suggestDays || '2-3天';
    const minDays = parseInt(suggestDays.split('-')[0]) || 1;
    const maxDaysMatch = suggestDays.match(/(\d+)天/);
    const maxDays = maxDaysMatch ? parseInt(maxDaysMatch[1]) : 14;
    return {
      passed: tripDays >= minDays && tripDays <= maxDays,
      reason: tripDays < minDays ? `建议至少 ${suggestDays}` : tripDays > maxDays ? `建议不超过 ${maxDays}` : null
    };
  },

  // 交通可达性
  transportRequirement(city, userProfile) {
    if (!userProfile.transportMode) return { passed: true };
    const cityTransport = city.profile?.transportScore || 3;
    if (userProfile.transportMode === '高铁优先' && cityTransport < 3) {
      return { passed: false, reason: '高铁可达性较低' };
    }
    return { passed: true };
  }
};

function applyHardConstraints(cities, userProfile) {
  const passed = [];
  const filtered = [];

  for (const city of cities) {
    let allPassed = true;
    const failedReasons = [];

    for (const [checkName, checkFn] of Object.entries(HARD_CONSTRAINT_CHECKS)) {
      const result = checkFn(city, userProfile);
      if (!result.passed) {
        allPassed = false;
        if (result.reason) failedReasons.push(result.reason);
      }
    }

    if (allPassed) {
      passed.push(city);
    } else {
      filtered.push({ city: city.id || city.name, reasons: failedReasons });
    }
  }

  return { passed, filtered };
}

// ============================================================
// Layer 2: 软匹配打分（增强版加权欧氏距离）
// ============================================================

/**
 * 增强版六维加权距离
 *
 * 和 v2 的区别：
 * 1. 维度交互项：nature×pace 交互（自然+慢节奏 = 额外加分）
 * 2. 非线性映射：对差异进行 tanh 压缩，避免极端值主导
 * 3. 置信度加权：用户对某些维度更确定时，权重更高
 */
function enhancedWeightedDistance(userScore, cityDims, options = {}) {
  const { interactionTerms = true, confidence = null } = options;

  // 基础加权距离
  let sumSq = 0;
  const dimContributions = {};

  for (const dim of DIMENSIONS) {
    const userVal = userScore[dim] ?? 0.5;
    const cityVal = cityDims[dim] ?? 0.5;
    const diff = userVal - cityVal;
    const weight = WEIGHTS[dim];

    // 如果有维度置信度，调整权重
    let adjustedWeight = weight;
    if (confidence && confidence[dim] !== undefined) {
      // 低置信维度降权，高置信维度加权
      adjustedWeight = weight * (0.5 + confidence[dim] * 0.5);
    }

    sumSq += adjustedWeight * diff * diff;
    dimContributions[dim] = { diff: parseFloat(diff.toFixed(3)), weight: adjustedWeight };
  }

  let distance = Math.sqrt(sumSq);

  // 维度交互项（可选）
  if (interactionTerms) {
    // nature × pace 交互：高自然 + 慢节奏 = 正向协同
    const natureDiff = 1 - Math.abs(userScore.nature - cityDims.nature);
    const paceDiff = 1 - Math.abs(userScore.pace - cityDims.pace);
    const interactionBonus = natureDiff * paceDiff * 0.05; // 最多 5% 的加分
    distance = Math.max(0, distance - interactionBonus);
  }

  // 转分数：距离越小越好
  const score = Math.round((1 - Math.min(1, distance)) * 100);

  return {
    distance: parseFloat(distance.toFixed(4)),
    score,
    contributions: dimContributions
  };
}

// ============================================================
// Layer 3: 上下文增强
// ============================================================

/**
 * 上下文增强信号
 *
 * 信号类型：
 * - seasonal: 季节匹配度（当前月份是否在最佳季节内）
 * - weather: 当前天气状况
 * - holiday: 节假日拥挤度调整
 * - trend: 社交媒体热度
 * - localEvent: 当地节庆活动
 */
function computeContextBoosts(city, context) {
  const boosts = {};
  let totalMultiplier = 1.0;
  const reasons = [];

  // 季节匹配
  if (context.currentMonth) {
    const seasonMatch = checkSeasonMatch(city, context.currentMonth);
    if (seasonMatch.score > 0) {
      boosts.seasonal = seasonMatch;
      totalMultiplier *= seasonMatch.multiplier;
      if (seasonMatch.multiplier > 1) reasons.push(seasonMatch.reason);
    }
  }

  // 天气因素
  if (context.weather) {
    const weatherBoost = checkWeatherBoost(city, context.weather);
    if (weatherBoost.multiplier !== 1) {
      boosts.weather = weatherBoost;
      totalMultiplier *= weatherBoost.multiplier;
      if (weatherBoost.reason) reasons.push(weatherBoost.reason);
    }
  }

  // 节假日拥挤
  if (context.isHoliday) {
    // 节假日：冷门城市加分，热门城市减分
    const popularity = city.popularity || 0.5;
    const holidayFactor = 1 + (0.5 - popularity) * 0.2; // 冷门城市+10%，热门-10%
    boosts.holiday = { multiplier: holidayFactor, reason: popularity < 0.4 ? '节假日避开人潮的好选择' : '节假日人流较大' };
    totalMultiplier *= holidayFactor;
  }

  // 趋势热度（模拟社交媒体信号）
  if (context.trends && context.trends[city.id]) {
    const trendBoost = 1 + context.trends[city.id] * 0.03; // 最多 +3%
    boosts.trend = { multiplier: trendBoost, value: context.trends[city.id] };
    totalMultiplier *= trendBoost;
  }

  return { boosts, multiplier: parseFloat(totalMultiplier.toFixed(4)), reasons };
}

function checkSeasonMatch(city, month) {
  const bestSeasons = city.profile?.bestSeasons || [];
  const avoidSeasons = city.profile?.avoidSeasons || [];

  // 解析月份范围
  function monthInRange(rangeStr, targetMonth) {
    const match = rangeStr.match(/(\d+)\s*-\s*(\d+)\s*月/);
    if (!match) return false;
    const start = parseInt(match[1]);
    const end = parseInt(match[2]);
    return targetMonth >= start && targetMonth <= end;
  }

  for (const season of bestSeasons) {
    if (monthInRange(season, month)) {
      return { score: 1, multiplier: 1.08, reason: `${month}月正值最佳旅行季节` };
    }
  }

  for (const season of avoidSeasons) {
    if (monthInRange(season, month)) {
      return { score: -1, multiplier: 0.92, reason: `${month}月是当地建议避开的季节` };
    }
  }

  return { score: 0, multiplier: 1.0 };
}

function checkWeatherBoost(city, weather) {
  if (!weather || !weather[city.id]) return { multiplier: 1.0 };

  const w = weather[city.id];
  if (w.condition === 'rain' || w.condition === 'storm') {
    return { multiplier: 0.93, reason: '近期有雨，可能影响户外活动' };
  }
  if (w.condition === 'sunny' && city.dimensions?.nature > 0.6) {
    return { multiplier: 1.05, reason: '晴天+自然风光 = 绝佳体验' };
  }

  return { multiplier: 1.0 };
}

// ============================================================
// Layer 4: 协同信号（简化版）
// ============================================================

/**
 * 协同信号：基于当前用户画像，计算城市"受欢迎度"
 * 在无真实用户数据时，用画像相似度模拟
 *
 * @param {Object} city
 * @param {Object} userScore
 * @param {Array} userHistory - 用户历史选择
 */
function computeCollaborativeSignal(city, userScore, userHistory = []) {
  // 基础热度：城市总体受欢迎程度
  const basePopularity = city.popularity || 0.5;

  // 历史增强：如果用户去过类似城市，对同类型城市加分
  let historyBonus = 0;
  if (userHistory.length > 0) {
    const visitedIds = new Set(userHistory.map(h => h.cityId));
    if (visitedIds.has(city.id)) {
      historyBonus = -0.05; // 去过的城市小幅降权，鼓励探索
    }
  }

  const signal = parseFloat((basePopularity + historyBonus).toFixed(3));
  return { signal, popularity: basePopularity, historyBonus };
}

// ============================================================
// Layer 5: 多样性注入
// ============================================================

/**
 * MMR (Maximal Marginal Relevance) 重排序
 *
 * 原则：结果列表既要有相关性，又要有多样性
 * MMR = λ × relevance − (1−λ) × max_similarity
 */
function mmrRerank(candidates, lambda = 0.7) {
  if (candidates.length <= 1) return candidates;

  const selected = [candidates[0]]; // 最高分先选
  const remaining = candidates.slice(1);

  while (remaining.length > 0 && selected.length < candidates.length) {
    let bestIdx = 0;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const relevance = remaining[i].score / 100; // 归一化到 [0,1]

      // 计算与已选城市的最大相似度
      let maxSim = 0;
      for (const s of selected) {
        const sim = citySimilarity(remaining[i], s);
        maxSim = Math.max(maxSim, sim);
      }

      const mmr = lambda * relevance - (1 - lambda) * maxSim;
      if (mmr > bestScore) {
        bestScore = mmr;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}

/**
 * 城市间相似度（基于六维向量的余弦相似度）
 */
function citySimilarity(cityA, cityB) {
  const dimsA = cityA.dimensions || cityA.city?.dimensions || {};
  const dimsB = cityB.dimensions || cityB.city?.dimensions || {};

  let dotProduct = 0, normA = 0, normB = 0;

  for (const dim of DIMENSIONS) {
    const a = dimsA[dim] ?? 0.5;
    const b = dimsB[dim] ?? 0.5;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================
// 主评分函数
// ============================================================

/**
 * 多层混合评分
 *
 * 输入：城市列表 + 用户画像 + 上下文 + 选项
 * 输出：排序后的综合推荐列表
 *
 * @param {Array} cities - 城市列表
 * @param {Object} userScore - 用户六维画像
 * @param {Object} options
 * @param {Object} options.userProfile - 用户额外约束
 * @param {Object} options.context - 上下文信号
 * @param {Array} options.userHistory - 用户历史选择
 * @param {number} options.topK - 返回数量
 * @param {boolean} options.enableMMR - 是否启用 MMR 重排
 * @param {number} options.mmrLambda - MMR λ 参数
 * @returns {Object} { candidates, pipeline, meta }
 */
function multiLayerScore(cities, userScore, options = {}) {
  const {
    userProfile = {},
    context = {},
    userHistory = [],
    topK = 5,
    enableMMR = true,
    mmrLambda = 0.75,
    interactionTerms = true,
    confidence = null
  } = options;

  const pipeline = {};

  // ==== Layer 1: 硬约束过滤 ====
  const { passed, filtered } = applyHardConstraints(cities, userProfile);
  pipeline.hardConstraints = { inputCount: cities.length, passedCount: passed.length, filtered };

  if (passed.length === 0) {
    // 如果全部被过滤，放宽硬约束，返回最接近的
    return {
      candidates: [],
      pipeline,
      meta: { warning: '所有城市被硬约束过滤，请放宽条件' }
    };
  }

  // ==== Layer 2: 软匹配打分 ====
  const scored = passed.map(city => {
    const matchResult = enhancedWeightedDistance(userScore, city.dimensions, { interactionTerms, confidence });
    const collabSignal = computeCollaborativeSignal(city, userScore, userHistory);

    return {
      id: city.id,
      name: city.name,
      city,
      rawScore: matchResult.score,
      distance: matchResult.distance,
      matchContributions: matchResult.contributions,
      collaborative: collabSignal
    };
  });

  // 按原始得分排序
  scored.sort((a, b) => b.rawScore - a.rawScore);
  pipeline.softMatching = { scored: scored.map(c => ({ id: c.id, name: c.name, rawScore: c.rawScore })) };

  // ==== Layer 3: 上下文增强 ====
  const contextEnhanced = scored.map(item => {
    const { boosts, multiplier, reasons } = computeContextBoosts(item.city, context);
    const adjustedScore = Math.round(Math.min(100, item.rawScore * multiplier));

    return {
      ...item,
      contextBoosts: boosts,
      contextReasons: reasons,
      contextMultiplier: multiplier,
      adjustedScore
    };
  });

  // 按调整后得分排序
  contextEnhanced.sort((a, b) => b.adjustedScore - a.adjustedScore);
  pipeline.contextBoost = { applied: Object.keys(context).length > 0 };

  // ==== Layer 4: 协同信号融合 ====
  const fused = contextEnhanced.map(item => {
    const collabWeight = userHistory.length > 0 ? 0.05 : 0.02; // 有历史数据时协同权重更高
    const finalScore = Math.round(
      item.adjustedScore * (1 - collabWeight) +
      item.collaborative.signal * 100 * collabWeight
    );

    return {
      ...item,
      finalScore,
      scoreBreakdown: {
        raw: item.rawScore,
        contextAdjusted: item.adjustedScore,
        collaborative: Math.round(item.collaborative.signal * 100 * collabWeight),
        final: finalScore
      }
    };
  });

  fused.sort((a, b) => b.finalScore - a.finalScore);

  // ==== Layer 5: 多样性重排 ====
  let candidates;
  if (enableMMR && fused.length > 1) {
    candidates = mmrRerank(fused, mmrLambda);
    pipeline.diversity = { enabled: true, mmrLambda, inputCount: fused.length };
  } else {
    candidates = fused;
    pipeline.diversity = { enabled: false };
  }

  // 截取 TopK
  const topCandidates = candidates.slice(0, topK);

  // ==== 元数据 ====
  const meta = {
    pipeline,
    scoreDistribution: {
      max: topCandidates[0]?.finalScore || 0,
      min: topCandidates[topCandidates.length - 1]?.finalScore || 0,
      gap: topCandidates.length > 1
        ? topCandidates[0].finalScore - topCandidates[1].finalScore
        : 0
    },
    confidenceLevel: computeOverallConfidence(topCandidates)
  };

  return { candidates: topCandidates, pipeline, meta };
}

/**
 * 计算整体置信度
 */
function computeOverallConfidence(candidates) {
  if (candidates.length === 0) return 'low';

  const topScore = candidates[0].finalScore;
  const gap = candidates.length > 1 ? topScore - candidates[1].finalScore : 20;

  if (gap >= 15 && topScore >= 80) return 'high';
  if (gap >= 8 && topScore >= 65) return 'medium';
  return 'low';
}

module.exports = {
  // 配置
  WEIGHTS,
  DIMENSIONS,

  // Layer 1
  HARD_CONSTRAINT_CHECKS,
  applyHardConstraints,

  // Layer 2
  enhancedWeightedDistance,

  // Layer 3
  computeContextBoosts,
  checkSeasonMatch,
  checkWeatherBoost,

  // Layer 4
  computeCollaborativeSignal,

  // Layer 5
  mmrRerank,
  citySimilarity,

  // 主函数
  multiLayerScore
};
