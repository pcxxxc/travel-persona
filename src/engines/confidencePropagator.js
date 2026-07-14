/**
 * 旅格 Travel Persona · 置信度传播器
 *
 * 工业级推荐系统不仅给出点估计（如 personaFit=0.78），还需要给出置信区间
 * （如 0.78±0.05）并在管线中传播不确定性。本模块负责：
 *   1. 将单个点估计包装为带区间的评分
 *   2. 在 11 个子分数层与 3 条路径层传播置信度
 *   3. 通过 Monte Carlo 采样估计排名稳定性
 *   4. 生成人类可读的置信度解释
 *
 * 依赖：multiObjectiveScorer.PATH_WEIGHTS（用于加权聚合置信度）
 * 约定：所有区间值 clamp 到 [0, 1]；使用 CommonJS；Monte Carlo 仅用 Math.random()
 */

const { PATH_WEIGHTS } = require('./multiObjectiveScorer');

/* ------------------------------------------------------------------ *
 * 1. 工具函数
 * ------------------------------------------------------------------ */

/**
 * 将数值限制在 [min, max] 区间内
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 按指定小数位四舍五入
 * @param {number} value
 * @param {number} [digits=3]
 * @returns {number}
 */
function round(value, digits = 3) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/* ------------------------------------------------------------------ *
 * 2. 单分数置信区间
 * ------------------------------------------------------------------ */

/**
 * 将点估计包装为带置信区间的评分
 *
 * 区间宽度由置信度反向决定：置信度越低，区间越宽。
 *   margin = (1 - confidence) * 0.15
 *   lower  = clamp(mean - margin, 0, 1)
 *   upper  = clamp(mean + margin, 0, 1)
 *
 * @param {number} pointEstimate - 点估计（0~1）
 * @param {number} confidence    - 置信度（0~1）
 * @returns {{ mean:number, lower:number, upper:number, confidence:number, margin:number }}
 */
function scoreWithConfidence(pointEstimate, confidence) {
  const mean = clamp(round(pointEstimate), 0, 1);
  const safeConfidence = clamp(confidence, 0, 1);
  const margin = (1 - safeConfidence) * 0.15;
  const lower = clamp(mean - margin, 0, 1);
  const upper = clamp(mean + margin, 0, 1);

  return {
    mean: round(mean),
    lower: round(lower),
    upper: round(upper),
    confidence: round(safeConfidence),
    margin: round(margin)
  };
}

/* ------------------------------------------------------------------ *
 * 3. 子分数层置信度传播
 * ------------------------------------------------------------------ */

/**
 * 对 11 个子分数批量注入置信区间，并按 PATH_WEIGHTS.balanced 加权聚合置信度
 *
 * @param {Object} subScores     - { personaFit, intentFit, ... } 共 11 项点估计
 * @param {Object} confidenceMap - { personaFit: 0.8, ... } 各子分数置信度；缺失项按 0.5 处理
 * @returns {{ subScores:Object, aggregateConfidence:number }}
 */
function propagateScore(subScores, confidenceMap) {
  const weights = PATH_WEIGHTS.balanced;
  const result = {};
  let weightedSum = 0;
  let totalWeight = 0;

  Object.keys(subScores || {}).forEach(key => {
    const conf = confidenceMap && confidenceMap[key] !== undefined
      ? confidenceMap[key]
      : 0.5;
    const band = scoreWithConfidence(subScores[key], conf);
    result[key] = {
      mean: band.mean,
      lower: band.lower,
      upper: band.upper,
      confidence: band.confidence
    };

    const w = weights[key] || 0;
    weightedSum += conf * w;
    totalWeight += w;
  });

  const aggregateConfidence = totalWeight > 0
    ? round(weightedSum / totalWeight)
    : 0;

  return {
    subScores: result,
    aggregateConfidence
  };
}

/* ------------------------------------------------------------------ *
 * 4. 人格向量置信度
 * ------------------------------------------------------------------ */

// 非维度元信息键，在遍历向量时跳过
const VECTOR_META_KEYS = new Set([
  'confidence', 'userConfidence', '_confidence',
  'name', 'id', 'cityId'
]);

/**
 * 计算人格匹配的逐维度置信度
 *
 * 对每个维度，综合置信度 = min(userConfidence, cityConfidence)。
 * 如果用户向量未携带置信度信息（冷启动），假设用户置信度为 0.65。
 * 城市维度置信度缺失时按 0.60 处理。
 *
 * userVector 可携带置信度：
 *   - userVector.confidence 为数字：所有维度共用同一用户置信度
 *   - userVector.confidence 为对象：按维度查表，缺失维度回退 0.65
 *   - 缺省：冷启动 0.65
 *
 * @param {Object} userVector    - 用户人格向量（16 维 traitVector）
 * @param {Object} cityVector    - 城市人格向量
 * @param {Object} cityConfidence - 城市维度置信度映射 { key: 0~1 }
 * @returns {{ perDimension:Object, aggregate:number }}
 */
function computeVectorConfidence(userVector, cityVector, cityConfidence) {
  const uVec = userVector || {};
  const cVec = cityVector || {};
  const cConf = cityConfidence || {};

  // 解析用户置信度来源
  const uConfRaw = uVec.confidence !== undefined
    ? uVec.confidence
    : uVec.userConfidence;
  const uConfIsNumber = typeof uConfRaw === 'number';
  const uConfIsMap = uConfRaw && typeof uConfRaw === 'object';

  // 以城市向量的维度为基准（人格匹配是针对城市维度计算的）
  const perDimension = {};
  let sum = 0;
  let count = 0;

  Object.keys(cVec).forEach(key => {
    if (VECTOR_META_KEYS.has(key)) return;
    if (cVec[key] === undefined || cVec[key] === null) return;

    let userConf;
    if (uConfIsNumber) {
      userConf = uConfRaw;
    } else if (uConfIsMap) {
      userConf = uConfRaw[key] !== undefined ? uConfRaw[key] : 0.65;
    } else {
      userConf = 0.65; // 冷启动
    }

    const cityConf = cConf[key] !== undefined ? cConf[key] : 0.6;
    const combined = clamp(Math.min(userConf, cityConf), 0, 1);
    perDimension[key] = round(combined);
    sum += combined;
    count++;
  });

  const aggregate = count > 0 ? round(sum / count) : 0;
  return { perDimension, aggregate };
}

/* ------------------------------------------------------------------ *
 * 5. 管线级置信区间注入
 * ------------------------------------------------------------------ */

/**
 * 根据城市数据的完整度，推导每个子分数的置信度
 * 数据越完整（intelligence / traitVector / riskFlags 等），置信度越高
 * @param {Object} city
 * @returns {Object} { personaFit: 0~1, ... }
 */
function deriveConfidenceMap(city) {
  const intel = (city && city.intelligence) || {};
  const hasIntel = Object.keys(intel).length > 0;
  const base = hasIntel ? 0.72 : 0.5;

  return {
    personaFit: city && city.traitVector ? 0.78 : 0.5,
    intentFit: hasIntel ? 0.7 : 0.5,
    budgetScore: city && city.dailyBudget !== undefined ? 0.8 : 0.45,
    daysScore: (city && city.minDays !== undefined && city.maxDays !== undefined) ? 0.82 : 0.5,
    avoidScore: (city && Array.isArray(city.riskFlags)) ? 0.75 : 0.55,
    mapScore: (city && city.poiDiversity !== undefined) ? 0.7 : 0.5,
    communityScore: (city && Array.isArray(city.riskFlags)) ? 0.7 : 0.5,
    resilienceScore: hasIntel ? 0.72 : 0.5,
    diversityScore: (city && city.poiDiversity !== undefined) ? 0.7 : 0.5,
    evidenceScore: hasIntel ? 0.8 : 0.4,
    routeScore: hasIntel ? 0.7 : 0.5,
    _base: base // 便于调试/扩展（不会被遍历到 11 子分数中）
  };
}

/**
 * 将评分项（multiObjectiveScorer.scoreCities 单项结果）的所有分数注入置信区间
 *
 * 输入: { city, subScores:{...11}, pathScores:{ personaBest, balanced, lowCost } }
 * 输出: { ...scoredItem, confidenceBands:{ subScores:{...}, pathScores:{...} } }
 *
 * 子分数置信度由 deriveConfidenceMap(city) 推导；
 * 路径分数置信度 = 该路径下子分数置信度的加权平均（权重即该路径的 PATH_WEIGHTS）。
 *
 * @param {Object} scoredItem
 * @returns {Object}
 */
function propagateThroughPipeline(scoredItem) {
  if (!scoredItem) return scoredItem;

  const city = scoredItem.city || {};
  const confidenceMap = deriveConfidenceMap(city);

  // ---- 子分数区间 ----
  const subScoreBands = {};
  const subScores = scoredItem.subScores || {};
  Object.keys(subScores).forEach(key => {
    const band = scoreWithConfidence(subScores[key], confidenceMap[key] || 0.6);
    subScoreBands[key] = {
      mean: band.mean,
      lower: band.lower,
      upper: band.upper,
      confidence: band.confidence
    };
  });

  // ---- 路径分数区间 ----
  const pathScoreBands = {};
  const pathScores = scoredItem.pathScores || {};
  Object.keys(pathScores).forEach(pathType => {
    const weights = PATH_WEIGHTS[pathType] || PATH_WEIGHTS.balanced;
    let weightedSum = 0;
    let totalWeight = 0;
    Object.keys(weights).forEach(key => {
      const w = weights[key];
      const conf = confidenceMap[key] || 0.6;
      weightedSum += conf * w;
      totalWeight += w;
    });
    const pathConf = totalWeight > 0 ? weightedSum / totalWeight : 0.6;
    const band = scoreWithConfidence(pathScores[pathType], pathConf);
    pathScoreBands[pathType] = {
      mean: band.mean,
      lower: band.lower,
      upper: band.upper,
      confidence: band.confidence
    };
  });

  return {
    ...scoredItem,
    confidenceBands: {
      subScores: subScoreBands,
      pathScores: pathScoreBands
    }
  };
}

/* ------------------------------------------------------------------ *
 * 6. 带不确定性的排序（Monte Carlo）
 * ------------------------------------------------------------------ */

/**
 * 从 [lower, upper] 区间均匀采样一个值；区间退化时返回 mean
 * @param {{ lower:number, upper:number, mean:number }} band
 * @returns {number}
 */
function sampleBand(band) {
  const lower = band.lower !== undefined ? band.lower : band.mean;
  const upper = band.upper !== undefined ? band.upper : band.mean;
  if (upper <= lower) return band.mean;
  return lower + Math.random() * (upper - lower);
}

/**
 * 取评分项的综合分区间（优先用 balanced 路径区间，其次用子分数加权，最后用裸点估计）
 * @param {Object} item
 * @returns {{ mean:number, lower:number, upper:number }}
 */
function getAggregateBand(item) {
  const bands = item.confidenceBands;
  if (bands && bands.pathScores && bands.pathScores.balanced) {
    return bands.pathScores.balanced;
  }
  if (bands && bands.subScores) {
    const weights = PATH_WEIGHTS.balanced;
    let total = 0;
    let wSum = 0;
    Object.keys(weights).forEach(key => {
      const b = bands.subScores[key];
      if (b) {
        total += (b.mean || 0) * weights[key];
        wSum += weights[key];
      }
    });
    const mean = wSum > 0 ? total / wSum : 0;
    return { mean, lower: mean, upper: mean };
  }
  const ps = item.pathScores || {};
  const mean = ps.balanced || 0;
  return { mean, lower: mean, upper: mean };
}

/**
 * 获取评分项的城市标识
 */
function getCityId(item, idx) {
  return (item.city && (item.city.cityId || item.city.id)) || `city_${idx}`;
}

/**
 * 带不确定性的排序
 *
 * 不只按点估计排序，而是用 Monte Carlo 采样（100 次）估计排名稳定性：
 * 每次采样从每个评分项的综合分区间 [lower, upper] 均匀采样，重新排序，
 * 统计每个城市在多次采样中的排名均值与标准差。
 *
 *   stability = 1 - rankStdDev / totalCities   （标准差越小越稳定）
 *
 * @param {Array} scoredItems - 已通过 propagateThroughPipeline 注入区间的评分项
 * @returns {{ ranked:Array, stabilityScores:Object, rankChanges:Array }}
 */
function rankWithUncertainty(scoredItems) {
  const items = Array.isArray(scoredItems) ? scoredItems : [];
  const totalCities = items.length;
  const SAMPLES = 100;

  if (totalCities === 0) {
    return { ranked: [], stabilityScores: {}, rankChanges: [] };
  }

  // 点估计排序（按综合分 mean 降序），得到原始排名
  const indexed = items.map((item, idx) => ({
    idx,
    id: getCityId(item, idx),
    mean: getAggregateBand(item).mean
  }));
  indexed.sort((a, b) => b.mean - a.mean);

  const originalRank = {};
  indexed.forEach((entry, rank) => {
    originalRank[entry.id] = rank + 1;
  });

  // Monte Carlo 采样
  const rankHistory = {};
  items.forEach((item, idx) => {
    rankHistory[getCityId(item, idx)] = [];
  });

  for (let s = 0; s < SAMPLES; s++) {
    const sampled = items.map((item, idx) => ({
      id: getCityId(item, idx),
      score: sampleBand(getAggregateBand(item))
    }));
    sampled.sort((a, b) => b.score - a.score);
    sampled.forEach((entry, rank) => {
      rankHistory[entry.id].push(rank + 1);
    });
  }

  // 统计稳定性
  const stabilityScores = {};
  const rankChanges = [];
  indexed.forEach(entry => {
    const ranks = rankHistory[entry.id];
    const meanRank = ranks.reduce((a, b) => a + b, 0) / ranks.length;
    const variance = ranks.reduce((a, b) => a + (b - meanRank) ** 2, 0) / ranks.length;
    const rankStdDev = Math.sqrt(variance);
    const stability = clamp(1 - rankStdDev / totalCities, 0, 1);
    stabilityScores[entry.id] = round(stability);
    rankChanges.push({
      cityId: entry.id,
      originalRank: originalRank[entry.id],
      meanRank: round(meanRank),
      rankStdDev: round(rankStdDev)
    });
  });

  // 最终排序结果（按点估计降序，附带稳定性）
  const ranked = indexed.map((entry, rank) => {
    const item = items[entry.idx];
    return {
      ...item,
      rank: rank + 1,
      rankStability: stabilityScores[entry.id]
    };
  });

  return {
    ranked,
    stabilityScores,
    rankChanges
  };
}

/* ------------------------------------------------------------------ *
 * 7. 置信度人类可读解释
 * ------------------------------------------------------------------ */

/**
 * 生成置信度的人类可读解释
 *
 *   high  : confidence > 0.75  -> "高置信度"
 *   medium: 0.5 ~ 0.75         -> "中等置信度"
 *   low   : < 0.5              -> "低置信度，建议补充信息"
 *
 * @param {{ mean:number, lower:number, upper:number, confidence:number }} scoreWithBand
 * @returns {{ label:'high'|'medium'|'low', text:string, recommendation:string }}
 */
function explainConfidence(scoreWithBand) {
  const band = scoreWithBand || {};
  const confidence = band.confidence !== undefined ? band.confidence : 0.5;
  const mean = band.mean !== undefined ? band.mean : 0;
  const lower = band.lower !== undefined ? band.lower : mean;
  const upper = band.upper !== undefined ? band.upper : mean;

  const pct = (confidence * 100).toFixed(0);
  const bandText = `评分 ${round(mean)} (区间 ${round(lower)}~${round(upper)})，置信度 ${pct}%`;

  let label;
  let text;
  let recommendation;

  if (confidence > 0.75) {
    label = 'high';
    text = `高置信度：${bandText}`;
    recommendation = '可直接用于推荐展示与排序。';
  } else if (confidence >= 0.5) {
    label = 'medium';
    text = `中等置信度：${bandText}`;
    recommendation = '建议在展示时标注区间，并提示用户该结果存在一定不确定性。';
  } else {
    label = 'low';
    text = `低置信度，建议补充信息：${bandText}`;
    recommendation = '建议补充用户偏好或城市情报数据后再做强推荐。';
  }

  return { label, text, recommendation };
}

/* ------------------------------------------------------------------ *
 * 导出
 * ------------------------------------------------------------------ */

module.exports = {
  // 工具函数
  clamp,
  round,
  // 核心能力
  scoreWithConfidence,
  propagateScore,
  computeVectorConfidence,
  propagateThroughPipeline,
  rankWithUncertainty,
  explainConfidence
};
