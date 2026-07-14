/**
 * 旅格 Travel Persona · 敏感性分析模块
 *
 * 工业级推荐系统需要回答"哪个维度是决定性因素"，
 * 并支持假设分析（What-If）和反事实推理。
 *
 * 本模块提供八项核心能力：
 * 1. 单维度敏感性分析（computeDimensionSensitivity）
 * 2. 全维度敏感性排序（analyzeAllDimensions）
 * 3. 反事实矩阵 ±10%/±20%（computeCounterfactualMatrix）
 * 4. 摇摆因子识别（identifySwingFactors）
 * 5. What-If 场景生成（generateWhatIfScenarios）
 * 6. 推荐结果波动性评估（computeScoreVolatility）
 * 7. 完整敏感性报告（generateSensitivityReport）
 * 8. 工具函数（clamp / round）
 *
 * 对应总纲：7.7 反事实层解释、7.8 排序稳健性审计
 */

const { TRAIT_KEYS } = require('./personaEngine');
const { TRAIT_WEIGHTS } = require('./multiObjectiveScorer');

// ============ 工具函数 ============

/**
 * 将数值限制在 [min, max] 区间
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 四舍五入到指定小数位
 * @param {number} value
 * @param {number} digits - 小数位数，默认 3
 * @returns {number}
 */
function round(value, digits = 3) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

// ============ 内部：personaFit 计算 ============

/**
 * 计算加权欧氏距离相似度
 * 逻辑与 multiObjectiveScorer.computePersonaFit 一致，保证敏感性分析的基准分一致。
 *
 * @param {Object} userVector - 用户16维向量
 * @param {Object} cityVector - 城市16维向量
 * @returns {number} [0, 1] 范围的相似度
 */
function computePersonaFit(userVector, cityVector) {
  let sumSq = 0;
  let sumWeight = 0;
  const keys = Object.keys(TRAIT_WEIGHTS);

  keys.forEach(key => {
    const u = typeof userVector[key] === 'number' ? userVector[key] : 0.5;
    const c = typeof cityVector[key] === 'number' ? cityVector[key] : 0.5;
    const diff = u - c;
    const weight = TRAIT_WEIGHTS[key];
    sumSq += weight * diff * diff;
    sumWeight += weight;
  });

  const distance = Math.sqrt(sumSq / sumWeight);
  return round(clamp(1 - distance, 0, 1), 3);
}

/**
 * 从 scoredCities 条目中提取排序用分数
 * 优先使用 balanced 路径分，回退到 personaFit
 */
function getRankScore(item) {
  if (item.pathScores && typeof item.pathScores.balanced === 'number') {
    return item.pathScores.balanced;
  }
  if (item.subScores && typeof item.subScores.personaFit === 'number') {
    return item.subScores.personaFit;
  }
  return 0;
}

// ============ 1. 单维度敏感性 ============

/**
 * 计算单个维度对 personaFit 的敏感性
 *
 * 方法：将用户向量的 traitKey 值上下浮动 delta（+delta 和 -delta），
 * 重新计算 personaFit，用中心差分公式估计敏感性。
 *
 * sensitivity = |fit_high - fit_low| / (2 * delta)
 *
 * @param {Object} userVector - 用户16维向量
 * @param {Object} cityVector - 城市16维向量
 * @param {Object} city - 城市完整记录（用于上下文引用）
 * @param {string} traitKey - 要分析的维度键
 * @param {number} delta - 浮动幅度，默认 0.1
 * @returns {{ trait: string, sensitivity: number, direction: 'positive'|'negative'|'neutral', impact: 'high'|'medium'|'low' }}
 */
function computeDimensionSensitivity(userVector, cityVector, city, traitKey, delta = 0.1) {
  const originalValue = typeof userVector[traitKey] === 'number' ? userVector[traitKey] : 0.5;

  // 上浮 delta
  const highVector = { ...userVector, [traitKey]: clamp(originalValue + delta, 0, 1) };
  const fitHigh = computePersonaFit(highVector, cityVector);

  // 下浮 delta
  const lowVector = { ...userVector, [traitKey]: clamp(originalValue - delta, 0, 1) };
  const fitLow = computePersonaFit(lowVector, cityVector);

  // 中心差分敏感性
  const sensitivity = round(Math.abs(fitHigh - fitLow) / (2 * delta), 3);

  // 方向判断：增加该维度值是否提升 fit
  const diff = fitHigh - fitLow;
  let direction;
  if (Math.abs(diff) < 0.001) {
    direction = 'neutral';
  } else if (diff > 0) {
    direction = 'positive'; // 增加该维度值 → fit 提升
  } else {
    direction = 'negative'; // 增加该维度值 → fit 下降
  }

  // 影响等级
  let impact;
  if (sensitivity > 0.5) {
    impact = 'high';
  } else if (sensitivity >= 0.2) {
    impact = 'medium';
  } else {
    impact = 'low';
  }

  return { trait: traitKey, sensitivity, direction, impact };
}

// ============ 2. 全维度敏感性分析 ============

/**
 * 对所有16个维度调用 computeDimensionSensitivity
 *
 * @param {Object} userVector - 用户16维向量
 * @param {Object} cityVector - 城市16维向量
 * @param {Object} city - 城市完整记录
 * @returns {{ dimensions: Array, topFactors: Array, stableFactors: Array }}
 *   - dimensions: 按 sensitivity 降序排列的全维度数组
 *   - topFactors: 前3个最敏感维度
 *   - stableFactors: 后3个最不敏感维度
 */
function analyzeAllDimensions(userVector, cityVector, city) {
  const dimensions = TRAIT_KEYS
    .map(key => computeDimensionSensitivity(userVector, cityVector, city, key))
    .sort((a, b) => b.sensitivity - a.sensitivity);

  return {
    dimensions,
    topFactors: dimensions.slice(0, 3),
    stableFactors: dimensions.slice(-3)
  };
}

// ============ 3. 反事实矩阵 ============

/**
 * 生成反事实矩阵——如果某个维度变化 ±10%, ±20%，personaFit 如何变化
 *
 * 对每个维度，将用户向量该维度值按相对比例缩放，
 * 重新计算 personaFit，记录4个变化幅度下的结果。
 *
 * @param {Object} userVector - 用户16维向量
 * @param {Object} city - 城市完整记录（使用 city.traitVector）
 * @param {number} baseFit - 基准 personaFit（可选，不传则自动计算）
 * @returns {Object} { traitKey: { plus10, minus10, plus20, minus20, delta, baseFit } }
 */
function computeCounterfactualMatrix(userVector, city, baseFit) {
  const cityVector = city.traitVector || {};
  const fit = typeof baseFit === 'number' ? baseFit : computePersonaFit(userVector, cityVector);
  const matrix = {};

  TRAIT_KEYS.forEach(key => {
    const originalValue = typeof userVector[key] === 'number' ? userVector[key] : 0.5;

    // 相对比例缩放：±10%, ±20%
    const plus10Vec = { ...userVector, [key]: clamp(originalValue * 1.1, 0, 1) };
    const minus10Vec = { ...userVector, [key]: clamp(originalValue * 0.9, 0, 1) };
    const plus20Vec = { ...userVector, [key]: clamp(originalValue * 1.2, 0, 1) };
    const minus20Vec = { ...userVector, [key]: clamp(originalValue * 0.8, 0, 1) };

    const plus10 = computePersonaFit(plus10Vec, cityVector);
    const minus10 = computePersonaFit(minus10Vec, cityVector);
    const plus20 = computePersonaFit(plus20Vec, cityVector);
    const minus20 = computePersonaFit(minus20Vec, cityVector);

    const values = [plus10, minus10, plus20, minus20];
    const delta = round(Math.max(...values) - Math.min(...values), 3);

    matrix[key] = { plus10, minus10, plus20, minus20, delta, baseFit: fit };
  });

  return matrix;
}

// ============ 4. 摇摆因子识别 ============

/**
 * 识别"摇摆因子"——哪些维度变化会导致排名改变
 *
 * 对排名相邻的城市对，逐维度扰动用户向量 ±10%，
 * 检测该维度是否会导致两者的 personaFit 排序互换。
 *
 * @param {Array} scoredCities - multiObjectiveScorer.scoreCities 的输出
 * @param {Object} userVector - 用户16维向量
 * @returns {Array<{ dimension, cityA, cityB, cityAId, cityBId, difference, isSwingFactor }>}
 *   按 difference 降序排列
 */
function identifySwingFactors(scoredCities, userVector) {
  if (!scoredCities || scoredCities.length < 2) {
    return [];
  }

  // 按当前分数排序获取排名
  const sorted = [...scoredCities].sort((a, b) => getRankScore(b) - getRankScore(a));
  const results = [];

  // 遍历每对相邻城市
  for (let i = 0; i < sorted.length - 1; i++) {
    const itemA = sorted[i];
    const itemB = sorted[i + 1];
    const cityA = itemA.city;
    const cityB = itemB.city;
    const cityAVector = cityA.traitVector || {};
    const cityBVector = cityB.traitVector || {};

    const fitABase = computePersonaFit(userVector, cityAVector);
    const fitBBase = computePersonaFit(userVector, cityBVector);
    const baseGap = fitABase - fitBBase; // 正数表示 A 领先

    TRAIT_KEYS.forEach(key => {
      const originalValue = typeof userVector[key] === 'number' ? userVector[key] : 0.5;

      // 扰动 ±10%
      const plusVec = { ...userVector, [key]: clamp(originalValue * 1.1, 0, 1) };
      const minusVec = { ...userVector, [key]: clamp(originalValue * 0.9, 0, 1) };

      const fitAPlus = computePersonaFit(plusVec, cityAVector);
      const fitBPlus = computePersonaFit(plusVec, cityBVector);
      const fitAMinus = computePersonaFit(minusVec, cityAVector);
      const fitBMinus = computePersonaFit(minusVec, cityBVector);

      const gapPlus = fitAPlus - fitBPlus;
      const gapMinus = fitAMinus - fitBMinus;

      // 差异：扰动范围内 gap 的变化幅度
      const difference = round(Math.abs(gapPlus - gapMinus), 3);

      // 摇摆判定：基准 A > B，扰动后是否出现 B > A（gap 符号翻转）
      const baseSign = baseGap >= 0;
      const flipsPlus = (gapPlus >= 0) !== baseSign;
      const flipsMinus = (gapMinus >= 0) !== baseSign;
      const isSwingFactor = flipsPlus || flipsMinus;

      results.push({
        dimension: key,
        cityA: cityA.name,
        cityB: cityB.name,
        cityAId: cityA.cityId || cityA.id,
        cityBId: cityB.cityId || cityB.id,
        rankA: i + 1,
        rankB: i + 2,
        difference,
        isSwingFactor
      });
    });
  }

  // 按差异降序排列
  return results.sort((a, b) => b.difference - a.difference);
}

// ============ 5. What-If 场景生成 ============

/**
 * 生成"如果...会怎样"场景
 *
 * 场景1: 如果预算增加20%
 * 场景2: 如果多2天时间
 * 场景3: 如果换一个季节
 * 场景4: 如果避开人流高峰
 *
 * 每个场景模拟用户向量相关维度的调整，计算 personaFit 变化方向和幅度。
 *
 * @param {Object} userVector - 用户16维向量
 * @param {Object} city - 城市完整记录
 * @param {Object} tripContext - 旅行上下文（days / budget / season 等）
 * @returns {Array<{ scenario, description, expectedChange, magnitude, affectedDimensions }>}
 */
function generateWhatIfScenarios(userVector, city, tripContext) {
  const cityVector = city.traitVector || {};
  const baseFit = computePersonaFit(userVector, cityVector);
  const scenarios = [];

  // --- 场景1: 如果预算增加20% ---
  {
    const budgetVal = typeof userVector.budget === 'number' ? userVector.budget : 0.5;
    const comfortVal = typeof userVector.comfort === 'number' ? userVector.comfort : 0.5;
    const adjusted = {
      ...userVector,
      budget: clamp(budgetVal * 1.2, 0, 1),
      comfort: clamp(comfortVal + 0.06, 0, 1)
    };
    const newFit = computePersonaFit(adjusted, cityVector);
    const change = newFit - baseFit;
    scenarios.push({
      scenario: '如果预算增加20%',
      description: '预算维度上调20%，可能解锁更舒适的住宿和餐饮层级',
      expectedChange: classifyChange(change),
      magnitude: round(Math.abs(change), 3),
      affectedDimensions: ['budget', 'comfort']
    });
  }

  // --- 场景2: 如果多2天时间 ---
  {
    const paceVal = typeof userVector.pace === 'number' ? userVector.pace : 0.5;
    const noveltyVal = typeof userVector.novelty === 'number' ? userVector.novelty : 0.5;
    const workationVal = typeof userVector.workation === 'number' ? userVector.workation : 0.5;
    // 更多天数 → 节奏放缓、探索深度提升（与 personaEngine.buildContextAdjustment 逻辑一致）
    const adjusted = {
      ...userVector,
      pace: clamp(paceVal - 0.12, 0, 1),
      novelty: clamp(noveltyVal + 0.08, 0, 1),
      workation: clamp(workationVal + 0.08, 0, 1)
    };
    const newFit = computePersonaFit(adjusted, cityVector);
    const change = newFit - baseFit;
    const currentDays = tripContext?.days || 4;
    scenarios.push({
      scenario: '如果多2天时间',
      description: `天数从${currentDays}天增至${currentDays + 2}天，节奏放缓、可探索更多周边`,
      expectedChange: classifyChange(change),
      magnitude: round(Math.abs(change), 3),
      affectedDimensions: ['pace', 'novelty', 'workation']
    });
  }

  // --- 场景3: 如果换一个季节 ---
  {
    const weatherVal = typeof userVector.weatherFlex === 'number' ? userVector.weatherFlex : 0.5;
    const restorationVal = typeof userVector.restoration === 'number' ? userVector.restoration : 0.5;
    // 换季节 → 天气容错度变化，恢复体验可能受影响
    const adjusted = {
      ...userVector,
      weatherFlex: clamp(weatherVal * 0.85, 0, 1),
      restoration: clamp(restorationVal - 0.04, 0, 1)
    };
    const newFit = computePersonaFit(adjusted, cityVector);
    const change = newFit - baseFit;
    const currentSeason = tripContext?.season || '当前';
    scenarios.push({
      scenario: '如果换一个季节',
      description: `从${currentSeason}换到其他季节，天气容错度和户外体验可能变化`,
      expectedChange: classifyChange(change),
      magnitude: round(Math.abs(change), 3),
      affectedDimensions: ['weatherFlex', 'restoration', 'nature']
    });
  }

  // --- 场景4: 如果避开人流高峰 ---
  {
    const lowCrowdVal = typeof userVector.lowCrowd === 'number' ? userVector.lowCrowd : 0.5;
    const bookingVal = typeof userVector.bookingEase === 'number' ? userVector.bookingEase : 0.5;
    const comfortVal = typeof userVector.comfort === 'number' ? userVector.comfort : 0.5;
    // 错峰出行 → 安静度提升、预约更便利（与 personaEngine.AVOID_EFFECTS.crowd 逻辑一致）
    const adjusted = {
      ...userVector,
      lowCrowd: clamp(lowCrowdVal + 0.15, 0, 1),
      bookingEase: clamp(bookingVal + 0.08, 0, 1),
      comfort: clamp(comfortVal + 0.05, 0, 1)
    };
    const newFit = computePersonaFit(adjusted, cityVector);
    const change = newFit - baseFit;
    scenarios.push({
      scenario: '如果避开人流高峰',
      description: '错峰或淡季出行，人流压力降低、预约和舒适度提升',
      expectedChange: classifyChange(change),
      magnitude: round(Math.abs(change), 3),
      affectedDimensions: ['lowCrowd', 'bookingEase', 'comfort']
    });
  }

  return scenarios;
}

/**
 * 根据 personaFit 变化值分类方向
 * @param {number} change - newFit - baseFit
 * @returns {'improve'|'decline'|'neutral'}
 */
function classifyChange(change) {
  if (change > 0.005) return 'improve';
  if (change < -0.005) return 'decline';
  return 'neutral';
}

// ============ 6. 推荐结果波动性 ============

/**
 * 计算推荐结果的"波动性"——排名的脆弱程度
 *
 * 方法：对用户向量的每个维度施加轻微扰动（±5%, ±10%, ±15%），
 * 重新计算所有城市的 personaFit 排名，统计 top1 和 top3 的变化频率。
 * 如果轻微扰动就导致排名大变，volatility 高。
 *
 * @param {Array} scoredCities - multiObjectiveScorer.scoreCities 的输出
 * @param {Object} userVector - 用户16维向量
 * @returns {{ volatility: 'low'|'medium'|'high', score: number, topRankStability: number, recommendationMargin: number }}
 *   - volatility: 综合波动等级
 *   - score: [0, 1] 波动性分数（越高越不稳定）
 *   - topRankStability: [0, 1] top1 在扰动下保持不变的比例
 *   - recommendationMargin: top1 与 top2 的分数差距（越大越稳定）
 */
function computeScoreVolatility(scoredCities, userVector) {
  if (!scoredCities || scoredCities.length === 0) {
    return { volatility: 'low', score: 0, topRankStability: 1, recommendationMargin: 0 };
  }

  // 按当前分数排序获取基准排名
  const sorted = [...scoredCities].sort((a, b) => getRankScore(b) - getRankScore(a));
  const top1 = sorted[0];
  const top2 = sorted[1] || sorted[0];
  const top1Score = getRankScore(top1);
  const top2Score = getRankScore(top2);
  const recommendationMargin = round(Math.abs(top1Score - top2Score), 3);

  // 基准 top3 的城市标识
  const baselineTop3Ids = sorted.slice(0, 3).map(item =>
    item.city.cityId || item.city.id
  );
  const top1Id = top1.city.cityId || top1.city.id;

  // 对每个维度施加扰动，统计排名变化
  const perturbationLevels = [0.05, 0.10, 0.15];
  let top1Changed = 0;
  let top3Changed = 0;
  let totalTests = 0;

  perturbationLevels.forEach(delta => {
    TRAIT_KEYS.forEach(key => {
      const originalValue = typeof userVector[key] === 'number' ? userVector[key] : 0.5;

      // 正负两个方向
      [originalValue + delta, originalValue - delta].forEach(perturbedValue => {
        const perturbed = {
          ...userVector,
          [key]: clamp(perturbedValue, 0, 1)
        };

        // 重新计算所有城市的 personaFit 并排序
        const perturbedRanking = scoredCities
          .map(item => {
            const cityVector = item.city.traitVector || {};
            const fit = computePersonaFit(perturbed, cityVector);
            return { id: item.city.cityId || item.city.id, fit };
          })
          .sort((a, b) => b.fit - a.fit);

        // top1 是否变化
        if (perturbedRanking[0].id !== top1Id) {
          top1Changed++;
        }

        // top3 是否变化（比较集合）
        const perturbedTop3Ids = perturbedRanking.slice(0, 3).map(r => r.id);
        const top3SetChanged = perturbedTop3Ids.some(
          id => !baselineTop3Ids.includes(id)
        );
        if (top3SetChanged) {
          top3Changed++;
        }

        totalTests++;
      });
    });
  });

  const top1ChangeRatio = totalTests > 0 ? top1Changed / totalTests : 0;
  const top3ChangeRatio = totalTests > 0 ? top3Changed / totalTests : 0;
  const topRankStability = round(1 - top1ChangeRatio, 3);

  // 综合波动性分数：top1 变化率 50% + top3 变化率 30% + 推荐边际 20%
  const marginFactor = 1 - clamp(recommendationMargin * 5, 0, 1); // 边际越小，因子越大
  const volatilityScore = round(
    top1ChangeRatio * 0.5 + top3ChangeRatio * 0.3 + marginFactor * 0.2,
    3
  );

  let volatility;
  if (volatilityScore > 0.5) {
    volatility = 'high';
  } else if (volatilityScore > 0.2) {
    volatility = 'medium';
  } else {
    volatility = 'low';
  }

  return {
    volatility,
    score: volatilityScore,
    topRankStability,
    recommendationMargin
  };
}

// ============ 7. 完整敏感性报告 ============

/**
 * 生成完整的敏感性分析报告
 *
 * 整合 topFactors、swingFactors、whatIfScenarios、volatility、recommendMargin，
 * 返回适合注入 explainability 模块的结构化报告。
 *
 * @param {Object} userVector - 用户16维向量
 * @param {Object} topCity - 推荐第一的城市完整记录
 * @param {Object} runnerUp - 推荐第二的城市完整记录（可选）
 * @param {Array} scoredCities - multiObjectiveScorer.scoreCities 的输出
 * @returns {Object} 结构化敏感性报告
 */
function generateSensitivityReport(userVector, topCity, runnerUp, scoredCities) {
  const cityVector = topCity.traitVector || {};
  const baseFit = computePersonaFit(userVector, cityVector);

  // 1. 全维度敏感性分析
  const {
    dimensions,
    topFactors,
    stableFactors
  } = analyzeAllDimensions(userVector, cityVector, topCity);

  // 2. 反事实矩阵
  const counterfactualMatrix = computeCounterfactualMatrix(userVector, topCity, baseFit);

  // 3. 摇摆因子
  const allSwingResults = identifySwingFactors(scoredCities, userVector);
  const swingFactors = allSwingResults.filter(s => s.isSwingFactor).slice(0, 5);
  const topSwingCandidates = allSwingResults.slice(0, 10);

  // 4. What-If 场景
  const whatIfScenarios = generateWhatIfScenarios(userVector, topCity, null);

  // 5. 波动性
  const volatilityResult = computeScoreVolatility(scoredCities, userVector);

  // 6. 亚军对比分析
  let runnerUpComparison = null;
  if (runnerUp) {
    const runnerUpVector = runnerUp.traitVector || {};
    const runnerUpFit = computePersonaFit(userVector, runnerUpVector);
    const runnerUpAnalysis = analyzeAllDimensions(userVector, runnerUpVector, runnerUp);
    runnerUpComparison = {
      city: runnerUp.name,
      fit: runnerUpFit,
      fitGap: round(baseFit - runnerUpFit, 3),
      topFactors: runnerUpAnalysis.topFactors
    };
  }

  // 7. 生成关键洞察
  const insights = generateInsights(
    topFactors,
    stableFactors,
    swingFactors,
    volatilityResult,
    baseFit
  );

  return {
    summary: {
      topCity: topCity.name,
      baseFit,
      recommendationMargin: volatilityResult.recommendationMargin,
      volatility: volatilityResult.volatility,
      volatilityScore: volatilityResult.score,
      topRankStability: volatilityResult.topRankStability,
      swingFactorCount: swingFactors.length
    },
    topFactors,
    stableFactors,
    dimensionSensitivity: dimensions,
    counterfactualMatrix,
    swingFactors,
    topSwingCandidates,
    whatIfScenarios,
    volatility: volatilityResult,
    runnerUpComparison,
    insights
  };
}

/**
 * 根据分析结果生成人类可读的关键洞察
 */
function generateInsights(topFactors, stableFactors, swingFactors, volatility, baseFit) {
  const insights = [];

  // 敏感性洞察
  if (topFactors.length > 0 && topFactors[0].sensitivity > 0) {
    const top = topFactors[0];
    const directionText = top.direction === 'positive' ? '提升' : top.direction === 'negative' ? '降低' : '不影响';
    insights.push({
      type: 'keyDriver',
      message: `${top.trait} 是最敏感的维度（敏感性=${top.sensitivity}），调整该维度会明显${directionText}匹配度`
    });
  }

  // 稳定性洞察
  if (stableFactors.length > 0) {
    const stable = stableFactors[0];
    insights.push({
      type: 'stableDimension',
      message: `${stable.trait} 是最不敏感的维度（敏感性=${stable.sensitivity}），对推荐结果影响较小`
    });
  }

  // 摇摆因子洞察
  if (swingFactors.length > 0) {
    const dims = [...new Set(swingFactors.map(s => s.dimension))];
    insights.push({
      type: 'swingRisk',
      message: `发现 ${swingFactors.length} 个摇摆因子，涉及维度：${dims.slice(0, 3).join('、')}，轻微调整可能导致排名变化`
    });
  }

  // 波动性洞察
  if (volatility.volatility === 'high') {
    insights.push({
      type: 'volatilityWarning',
      message: `推荐结果波动性较高（score=${volatility.score}），top1 稳定性=${volatility.topRankStability}，建议关注推荐边际`
    });
  } else if (volatility.volatility === 'low') {
    insights.push({
      type: 'volatilityOk',
      message: `推荐结果稳定性良好，top1 在大多数扰动下保持不变`
    });
  }

  return insights;
}

// ============ 模块导出 ============

module.exports = {
  // 工具函数
  clamp,
  round,
  // 敏感性分析
  computeDimensionSensitivity,
  analyzeAllDimensions,
  computeCounterfactualMatrix,
  identifySwingFactors,
  generateWhatIfScenarios,
  computeScoreVolatility,
  generateSensitivityReport
};
