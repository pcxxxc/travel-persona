/**
 * 旅格 Travel Persona · 结构化解释生成器（工业级增强版）
 *
 * 总纲7.7要求每次推荐必须回答5个问题：
 * 1. 为什么它适合你
 * 2. 哪些证据支持这个判断
 * 3. 哪些部分仍不确定
 * 4. 你为它付出了什么代价
 * 5. 改变预算、天数或节奏后，排序会如何变化
 *
 * 增强实现六层解释：
 * 直觉层 → 量化层 → 代价层 → 反事实层 → 因果链层 → 对比分析层
 *
 * 新增工业级特性：
 * - 置信区间展示（"匹配度 78% ± 5%"）
 * - 子维度钻取（"自然匹配 82%：山川地貌 85%、水域 78%"）
 * - 因果证据链（用户输入 → 维度变化 → 分数影响）
 * - 城市间对比分析（"比第二名高3分，主要来自自然和恢复"）
 * - 敏感性分析注入（"最敏感维度是nature，调整±10%会导致排名变化"）
 */

const { TRAIT_KEYS } = require('./personaEngine');
const { getSubDimensions } = require('./subDimensions');

function round(value, digits = 3) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function clamp(v, min = 0, max = 1) {
  return Math.max(min, Math.min(max, v));
}

// ========== 维度标签映射 ==========

const TRAIT_LABELS = {
  restoration: '恢复', nature: '自然', culture: '文化', food: '美食',
  pace: '节奏', social: '社交', budget: '性价比', aesthetics: '审美',
  comfort: '舒适', novelty: '新奇', transit: '交通', lowCrowd: '安静',
  authenticity: '在地', weatherFlex: '天气容错', bookingEase: '预约便利',
  workation: '数字游民'
};

const METRIC_LABELS = {
  personaFit: '人格匹配度',
  intentFit: '当次取向匹配度',
  budgetScore: '预算适配度',
  daysScore: '天数适配度',
  avoidScore: '避雷兼容度',
  mapScore: '景点丰富度',
  communityScore: '社区兼容度',
  resilienceScore: '抗风险能力',
  diversityScore: '体验多样性',
  evidenceScore: '城市情报评分',
  routeScore: '路线适配度'
};

// ========== 第一层：直觉层（带置信区间） ==========

/**
 * 生成直觉层推荐理由
 * @param {Object} [holidayInfo] - 节假日信息
 * @param {Object} [confidenceBand] - 置信区间 { mean, lower, upper, confidence }
 */
function generateReason(city, subScores, pathType, userVector, holidayInfo, confidenceBand) {
  const reasons = [];

  // 最高子分数
  const sortedScores = Object.entries(subScores)
    .filter(([k]) => k !== 'riskPenalty' && k !== 'totalScore')
    .sort((a, b) => b[1] - a[1]);

  const topMetric = sortedScores[0];
  const topLabel = METRIC_LABELS[topMetric[0]] || topMetric[0];
  const topPercent = Math.round(topMetric[1] * 100);

  // 带置信区间的表述
  if (confidenceBand && confidenceBand.margin !== undefined) {
    const marginPercent = Math.round(confidenceBand.margin * 100);
    reasons.push(`${city.name}的${topLabel}很高（${topPercent}%±${marginPercent}%）`);
  } else {
    reasons.push(`${city.name}的${topLabel}很高（${topPercent}%）`);
  }

  // 路径特定理由
  if (pathType === 'personaBest') {
    const matchingTraits = TRAIT_KEYS.filter(key =>
      userVector[key] > 0.6 && (city.traitVector?.[key] || 0) > 0.6
    );
    if (matchingTraits.length > 0) {
      reasons.push(`你的${matchingTraits.slice(0, 3).map(k => TRAIT_LABELS[k]).join('、')}偏好非常契合`);
    }
  } else if (pathType === 'balanced') {
    reasons.push('在人格匹配、预算和体验之间找到了不错的平衡');
  } else if (pathType === 'lowCost') {
    reasons.push(`日均预算${city.dailyBudget}元，比多数选择更经济`);
  }

  // 节假日提醒
  if (holidayInfo && holidayInfo.travelFriendliness === 'low') {
    reasons.push(`注意：${holidayInfo.reason}`);
  }

  return reasons.join('，') + '。';
}

// ========== 第二层：量化层（带子维度钻取） ==========

/**
 * 生成量化层分数分解（带子维度钻取）
 * @param {Object} subScores - 11子分数
 * @param {Object} [city] - 城市数据（用于子维度钻取）
 * @param {Object} [userVector] - 用户向量（用于高亮匹配维度）
 * @param {Object} [confidenceBands] - 各子分数的置信区间
 */
function generateBreakdown(subScores, city, userVector, confidenceBands) {
  // 权重结构
  const weighted = {
    personaFit: round(subScores.personaFit * 0.28, 3),
    tripIntentFit: round(subScores.intentFit * 0.18, 3),
    contextFit: round(subScores.daysScore * 0.16, 3),
    routeEfficiency: round(subScores.routeScore * 0.14, 3),
    evidenceQuality: round(subScores.evidenceScore * 0.10, 3),
    resilience: round(subScores.resilienceScore * 0.08, 3),
    novelty: round(subScores.diversityScore * 0.06, 3),
    riskPenalty: round((1 - subScores.avoidScore) * 0.05, 3)
  };

  // 子维度钻取：对 personaFit 的高分维度展开子维度
  const subDimensionDrilldown = {};
  if (city && userVector) {
    const topTraits = TRAIT_KEYS
      .filter(key => userVector[key] > 0.5 && (city.traitVector?.[key] || 0) > 0.5)
      .sort((a, b) => (city.traitVector[b] || 0) - (city.traitVector[a] || 0))
      .slice(0, 3);

    for (const traitKey of topTraits) {
      const subDef = getSubDimensions(traitKey);
      if (subDef) {
        subDimensionDrilldown[traitKey] = {
          label: TRAIT_LABELS[traitKey],
          userValue: round(userVector[traitKey], 3),
          cityValue: round(city.traitVector?.[traitKey] || 0, 3),
          matchQuality: round(1 - Math.abs(userVector[traitKey] - (city.traitVector?.[traitKey] || 0)), 3),
          subDimensions: Object.entries(subDef).map(([subKey, subInfo]) => ({
            key: subKey,
            label: subInfo.label,
            description: subInfo.description
          }))
        };
      }
    }
  }

  // 置信区间标注
  const confidenceAnnotations = {};
  if (confidenceBands) {
    for (const [key, band] of Object.entries(confidenceBands)) {
      if (band && band.margin !== undefined) {
        confidenceAnnotations[key] = {
          margin: round(band.margin, 3),
          label: band.margin < 0.03 ? 'high' : band.margin < 0.08 ? 'medium' : 'low'
        };
      }
    }
  }

  return {
    weighted,
    total: round(Object.values(weighted).reduce((a, b) => a + b, 0), 3),
    subDimensionDrilldown,
    confidenceAnnotations
  };
}

// ========== 第三层：代价层 ==========

/**
 * 生成代价层（不适合或需要付出的代价）
 */
function generateWatchOut(city, subScores, pathType) {
  const watchOuts = [];

  const lowScores = Object.entries(subScores)
    .filter(([k, v]) => v < 0.45 && k !== 'riskPenalty' && k !== 'totalScore')
    .sort((a, b) => a[1] - b[1]);

  if (lowScores.length > 0) {
    const [metric, score] = lowScores[0];
    const messages = {
      personaFit: `与你的核心人格匹配度不够理想（${Math.round(score * 100)}%）`,
      intentFit: '这次出行的核心取向可能无法完全满足',
      budgetScore: '预算方面可能需要更精打细算',
      daysScore: '天数可能不太充裕',
      avoidScore: '可能包含你倾向避开的元素',
      mapScore: '景点类型可能不够丰富',
      communityScore: '社区环境可能与你的偏好有偏差',
      resilienceScore: '在交通或天气变动时灵活度较低',
      diversityScore: '体验类型可能相对单一',
      evidenceScore: '关于这座城市的参考信息较少',
      routeScore: '路线效率可能不是最优'
    };
    watchOuts.push(messages[metric] || '某些方面存在不足');
  }

  const riskFlags = city.riskFlags || [];
  if (riskFlags.includes('crowd')) watchOuts.push('旺季可能人流较大');
  if (riskFlags.includes('expensive')) watchOuts.push('住宿和餐饮成本偏高');
  if (riskFlags.includes('early')) watchOuts.push('热门景点需要早起排队');
  if (riskFlags.includes('commercial')) watchOuts.push('部分区域商业化程度较高');
  if (riskFlags.includes('longTransit')) watchOuts.push('城际交通耗时较长');

  if (watchOuts.length === 0) return '整体适配度不错，没有明显短板。';
  return '需要注意的是：' + watchOuts.join('，') + '。';
}

// ========== 第四层：反事实层 ==========

/**
 * 生成反事实解释
 */
function generateCounterfactual(city, subScores, tripContext, pathType) {
  const budget = tripContext?.budget;
  const days = tripContext?.days;

  if (budget?.hardMax) {
    const reducedBudget = Math.round(budget.hardMax * 0.85);
    return `如果把预算降低15%（降至${reducedBudget}元），可能最先失去的是${city.bestFor?.[0] || '核心体验'}部分。`;
  }

  if (days && days <= 3) {
    return `如果多给2天时间，可以深入${city.name}的${city.bestFor?.[1] || '周边'}区域。`;
  }

  return `如果把节奏放慢，${city.name}的在地氛围会更加明显。`;
}

// ========== 第五层：因果证据链 ==========

/**
 * 生成因果证据链：用户输入 → 维度变化 → 分数影响
 * @param {Object} userVector - 用户向量
 * @param {Object} city - 城市数据
 * @param {Object} subScores - 子分数
 * @param {Object} [vectorResult] - 来自 personaEngine 的证据记录
 */
function generateCausalChain(userVector, city, subScores, vectorResult) {
  const chains = [];

  // 链1：最高匹配维度 → personaFit 贡献
  const topMatchTraits = TRAIT_KEYS
    .map(key => ({
      key,
      userVal: userVector[key] || 0,
      cityVal: city.traitVector?.[key] || 0,
      match: 1 - Math.abs((userVector[key] || 0) - (city.traitVector?.[key] || 0))
    }))
    .filter(t => t.match > 0.75)
    .sort((a, b) => b.match - a.match)
    .slice(0, 2);

  for (const t of topMatchTraits) {
    chains.push({
      cause: `你的${TRAIT_LABELS[t.key]}偏好为${Math.round(t.userVal * 100)}%`,
      effect: `${city.name}的${TRAIT_LABELS[t.key]}评分为${Math.round(t.cityVal * 100)}%`,
      outcome: `对人格匹配度贡献了约${Math.round(t.match * 28)}%（权重28%）`,
      confidence: 'high'
    });
  }

  // 链2：最低匹配维度 → 代价
  const worstMatch = TRAIT_KEYS
    .map(key => ({
      key,
      userVal: userVector[key] || 0,
      cityVal: city.traitVector?.[key] || 0,
      gap: Math.abs((userVector[key] || 0) - (city.traitVector?.[key] || 0))
    }))
    .filter(t => t.gap > 0.25)
    .sort((a, b) => b.gap - a.gap)[0];

  if (worstMatch) {
    chains.push({
      cause: `你的${TRAIT_LABELS[worstMatch.key]}偏好为${Math.round(worstMatch.userVal * 100)}%`,
      effect: `但${city.name}的${TRAIT_LABELS[worstMatch.key]}评分仅${Math.round(worstMatch.cityVal * 100)}%`,
      outcome: `这是主要的适配短板，拉低了约${Math.round(worstMatch.gap * 14)}%的匹配度`,
      confidence: 'medium'
    });
  }

  // 链3：来自向量构建的证据
  if (vectorResult && vectorResult.evidence) {
    for (const ev of vectorResult.evidence.slice(0, 2)) {
      chains.push({
        cause: ev.source || '用户输入',
        effect: `影响了${TRAIT_LABELS[ev.traitKey] || ev.traitKey || '相关维度'}`,
        outcome: ev.description || '产生了维度偏移',
        confidence: ev.reliability > 0.7 ? 'high' : 'medium'
      });
    }
  }

  return chains;
}

// ========== 第六层：对比分析层 ==========

/**
 * 生成城市间对比分析
 * @param {Object} topCity - 首选城市
 * @param {Object} runnerUp - 次选城市
 * @param {Object} topScores - 首选城市子分数
 * @param {Object} runnerUpScores - 次选城市子分数
 * @param {Object} userVector - 用户向量
 */
function generateComparison(topCity, runnerUp, topScores, runnerUpScores, userVector) {
  if (!runnerUp) return null;

  const advantages = [];
  const disadvantages = [];

  for (const [metric, topVal] of Object.entries(topScores)) {
    if (metric === 'totalScore' || metric === 'riskPenalty') continue;
    const runnerVal = runnerUpScores[metric] || 0;
    const diff = topVal - runnerVal;
    const label = METRIC_LABELS[metric] || metric;

    if (diff > 0.03) {
      advantages.push({
        metric,
        label,
        topValue: round(topVal, 3),
        runnerUpValue: round(runnerVal, 3),
        difference: round(diff, 3),
        explanation: `${topCity.name}在${label}上高出${Math.round(diff * 100)}个百分点`
      });
    } else if (diff < -0.03) {
      disadvantages.push({
        metric,
        label,
        topValue: round(topVal, 3),
        runnerUpValue: round(runnerVal, 3),
        difference: round(diff, 3),
        explanation: `${runnerUp.name}在${label}上高出${Math.round(-diff * 100)}个百分点`
      });
    }
  }

  // 维度级对比
  const traitComparison = TRAIT_KEYS
    .map(key => {
      const topVal = topCity.traitVector?.[key] || 0;
      const runnerVal = runnerUp.traitVector?.[key] || 0;
      const userVal = userVector[key] || 0;
      return {
        trait: key,
        label: TRAIT_LABELS[key],
        topCity: round(topVal, 3),
        runnerUp: round(runnerVal, 3),
        userPreference: round(userVal, 3),
        topAdvantage: round(topVal - runnerVal, 3)
      };
    })
    .sort((a, b) => Math.abs(b.topAdvantage) - Math.abs(a.topAdvantage))
    .slice(0, 5);

  const totalDiff = (topScores.totalScore || 0) - (runnerUpScores.totalScore || 0);

  return {
    topCity: { id: topCity.id, name: topCity.name },
    runnerUp: { id: runnerUp.id, name: runnerUp.name },
    scoreDifference: round(totalDiff, 3),
    advantages: advantages.slice(0, 3),
    disadvantages: disadvantages.slice(0, 2),
    traitComparison,
    summary: totalDiff > 0.05
      ? `${topCity.name}在关键维度上明显优于${runnerUp.name}`
      : totalDiff > 0.02
        ? `${topCity.name}略优于${runnerUp.name}，差距不大`
        : `${topCity.name}和${runnerUp.name}非常接近，取决于个人偏好`
  };
}

// ========== 不确定性生成 ==========

/**
 * 生成不确定性项
 * @param {Object} city - 城市数据
 * @param {Object} subScores - 子分数
 * @param {Object} [confidenceBands] - 置信区间
 */
function generateUncertainties(city, subScores, pathType, confidenceBands) {
  const uncertainties = [];

  // 低置信度维度
  const confidence = city.traitConfidence || {};
  const lowConfTraits = Object.entries(confidence)
    .filter(([k, v]) => v < 0.55)
    .map(([k]) => k);

  if (lowConfTraits.length > 0) {
    uncertainties.push({
      field: '数据置信度',
      level: 'medium',
      reason: `${lowConfTraits.slice(0, 3).map(k => TRAIT_LABELS[k]).join('、')}等城市维度的数据置信度较低`,
      improveAction: '后续可以通过实际旅行体验校准这些维度'
    });
  }

  // 置信区间宽的子分数
  if (confidenceBands) {
    const wideBands = Object.entries(confidenceBands)
      .filter(([_, band]) => band && band.margin > 0.08)
      .map(([key]) => METRIC_LABELS[key] || key);
    if (wideBands.length > 0) {
      uncertainties.push({
        field: '评分置信区间',
        level: 'medium',
        reason: `${wideBands.slice(0, 2).join('、')}的评分区间较宽，结果可能有波动`,
        improveAction: '补充更多偏好信息可以收窄区间'
      });
    }
  }

  if (subScores.budgetScore < 0.5) {
    uncertainties.push({
      field: '预算估算',
      level: 'high',
      reason: '当前预算条件与这座城市的消费水平有偏差',
      improveAction: '调整预算范围或选择更经济的住宿方案'
    });
  }

  if (subScores.routeScore < 0.5) {
    uncertainties.push({
      field: '路线效率',
      level: 'medium',
      reason: '从出发地到这座城市的交通方案可能不够理想',
      improveAction: '可以重新考虑出发城市或中转方案'
    });
  }

  return uncertainties;
}

// ========== 主入口：生成完整解释（增强版） ==========

/**
 * 为单个决策路径生成完整解释
 * @param {Object} city - 城市数据
 * @param {Object} subScores - 子分数（含 totalScore）
 * @param {string} pathType - 路径类型
 * @param {Object} userVector - 用户向量
 * @param {Object} tripContext - 行程上下文
 * @param {Object} [holidayInfo] - 节假日信息
 * @param {Object} [enhancement] - 增强数据 { confidenceBand, confidenceBands, sensitivityReport, vectorResult, runnerUp, runnerUpScores }
 */
function explainPath(city, subScores, pathType, userVector, tripContext, holidayInfo, enhancement = {}) {
  const {
    confidenceBand,
    confidenceBands,
    sensitivityReport,
    vectorResult,
    runnerUp,
    runnerUpScores
  } = enhancement;

  // 基础解释
  const reason = generateReason(city, subScores, pathType, userVector, holidayInfo, confidenceBand);
  const watchOut = generateWatchOut(city, subScores, pathType);
  const counterfactual = generateCounterfactual(city, subScores, tripContext, pathType);
  const breakdown = generateBreakdown(subScores, city, userVector, confidenceBands);
  const causalChain = generateCausalChain(userVector, city, subScores, vectorResult);
  const comparison = generateComparison(city, runnerUp, subScores, runnerUpScores, userVector);
  const uncertainties = generateUncertainties(city, subScores, pathType, confidenceBands);

  // 构建多层解释数组
  const explanations = [
    { type: 'whyFit', content: reason, layer: 'intuition' },
    { type: 'cost', content: watchOut, layer: 'cost' },
    { type: 'counterfactual', content: counterfactual, layer: 'counterfactual' }
  ];

  // 添加因果链层
  if (causalChain.length > 0) {
    explanations.push({
      type: 'causalChain',
      content: causalChain.map(c => `${c.cause} → ${c.effect} → ${c.outcome}`).join('; '),
      layer: 'causal',
      details: causalChain
    });
  }

  // 添加对比分析层
  if (comparison) {
    explanations.push({
      type: 'comparison',
      content: comparison.summary,
      layer: 'comparison',
      details: comparison
    });
  }

  // 添加敏感性分析层
  if (sensitivityReport) {
    const topFactorText = sensitivityReport.topFactors
      ? sensitivityReport.topFactors.slice(0, 2).map(f => `${TRAIT_LABELS[f.trait] || f.trait}（敏感度${round(f.sensitivity, 2)}）`).join('、')
      : '';
    explanations.push({
      type: 'sensitivity',
      content: topFactorText ? `关键敏感维度：${topFactorText}` : '',
      layer: 'sensitivity',
      details: {
        topFactors: sensitivityReport.topFactors,
        swingFactors: sensitivityReport.swingFactors,
        whatIfScenarios: sensitivityReport.whatIfScenarios,
        volatility: sensitivityReport.volatility
      }
    });
  }

  // 构建置信信息摘要
  const confidenceSummary = confidenceBand
    ? {
        mean: round(confidenceBand.mean, 3),
        lower: round(confidenceBand.lower, 3),
        upper: round(confidenceBand.upper, 3),
        confidence: round(confidenceBand.confidence, 3),
        margin: round(confidenceBand.margin, 3),
        label: confidenceBand.confidence > 0.75 ? 'high' : confidenceBand.confidence > 0.5 ? 'medium' : 'low'
      }
    : null;

  return {
    type: pathType,
    city: {
      id: city.id,
      name: city.name,
      province: city.province,
      coordinates: city.coordinates || null,
      coverageTier: city.coverageTier || null
    },
    totalScore: round(subScores.totalScore || 0, 3),
    personaFit: round(subScores.personaFit || 0, 3),
    confidenceSummary,
    costEstimate: {
      totalMin: Math.round((city.dailyBudget || 400) * (tripContext?.days || 4) * 0.75),
      totalMax: Math.round((city.dailyBudget || 400) * (tripContext?.days || 4) * 1.25),
      currency: 'CNY',
      mostUncertain: '住宿价格波动'
    },
    reason,
    watchOut,
    counterfactual,
    breakdown,
    causalChain,
    comparison,
    sensitivity: sensitivityReport || null,
    explanations,
    uncertainties
  };
}

module.exports = {
  generateReason,
  generateWatchOut,
  generateCounterfactual,
  generateBreakdown,
  generateCausalChain,
  generateComparison,
  generateUncertainties,
  explainPath,
  TRAIT_LABELS,
  METRIC_LABELS
};
