/**
 * 旅格 Travel Persona · Pareto 多目标优化器（v3）
 *
 * 核心思想：
 * 旅行推荐本质上是一个多目标优化问题：
 *   - 目标1：最大化自然匹配度
 *   - 目标2：最小化预算压力
 *   - 目标3：最大化探索新鲜感
 *   - 目标4：最大化社交适配度
 *
 * 这些目标之间天然存在 trade-off：
 *   大理 = 自然好 + 便宜 + 慢节奏，但社交弱 + 太热门
 *   上海 = 社交强 + 交通好 + 探索多，但贵 + 自然弱
 *
 * Pareto 前沿给出"没有人能在不损害其他目标的情况下
 * 改进某一个目标"的城市集合——即客观上的最优解集。
 *
 * 纯函数设计，零外部状态，完全可测试。
 */

const { DIMENSIONS, WEIGHTS } = require('./multiLayerScorer');

// ============================================================
// Pareto 支配关系判断
// ============================================================

/**
 * 判断 cityA 是否在给定目标上支配 cityB
 *
 * 支配的定义：A 在所有目标上都不差于 B，且至少在一个目标上严格优于 B
 *
 * @param {Object} cityA - 城市 A 的目标向量
 * @param {Object} cityB - 城市 B 的目标向量
 * @param {Array} objectives - 目标配置 [{ key, direction: 'max'|'min' }]
 * @returns {boolean} A 是否支配 B
 */
function dominates(cityA, cityB, objectives) {
  let atLeastOneBetter = false;

  for (const obj of objectives) {
    const valA = cityA[obj.key] ?? 0.5;
    const valB = cityB[obj.key] ?? 0.5;

    if (obj.direction === 'max') {
      if (valA < valB) return false;
      if (valA > valB) atLeastOneBetter = true;
    } else {
      // direction === 'min'
      if (valA > valB) return false;
      if (valA < valB) atLeastOneBetter = true;
    }
  }

  return atLeastOneBetter;
}

// ============================================================
// 非支配排序 (Non-Dominated Sorting)
// ============================================================

/**
 * 非支配排序（NSGA-II 风格）
 *
 * 将城市列表分为多个前沿：
 *   - Front 0: Pareto 最优（无人能支配它们）
 *   - Front 1: 被 Front 0 支配，但支配 Front 2
 *   - Front 2+: 逐层递推
 *
 * @param {Array} cities - 城市列表（每项包含目标值）
 * @param {Array} objectives - 目标配置
 * @returns {Array<Array>} 前沿列表 [[front0], [front1], ...]
 */
function nonDominatedSort(cities, objectives) {
  const n = cities.length;
  const dominatedBy = new Array(n).fill(null).map(() => []);
  const dominationCount = new Array(n).fill(0);
  const fronts = [[]];

  // 计算支配关系
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (dominates(cities[i], cities[j], objectives)) {
        dominatedBy[i].push(j);
        dominationCount[j]++;
      } else if (dominates(cities[j], cities[i], objectives)) {
        dominatedBy[j].push(i);
        dominationCount[i]++;
      }
    }

    // 第一前沿（无人支配者）
    if (dominationCount[i] === 0) {
      fronts[0].push(i);
    }
  }

  // 逐层构建前沿
  let frontIdx = 0;
  while (frontIdx < fronts.length && fronts[frontIdx].length > 0) {
    const nextFront = [];

    for (const i of fronts[frontIdx]) {
      for (const j of dominatedBy[i]) {
        dominationCount[j]--;
        if (dominationCount[j] === 0) {
          nextFront.push(j);
        }
      }
    }

    frontIdx++;
    if (nextFront.length > 0) {
      fronts.push(nextFront);
    }
  }

  // 转换索引为实际城市
  return fronts.map(front => front.map(idx => cities[idx]));
}

// ============================================================
// 拥挤距离计算
// ============================================================

/**
 * 计算拥挤距离（Crowding Distance）
 *
 * 衡量解在目标空间中的"孤立程度"
 * 拥挤距离越大 = 越独特 = 越值得保留
 * 用于在同前沿内排序
 *
 * @param {Array} front - 同一个前沿上的城市
 * @param {Array} objectives - 目标配置
 * @returns {Array} 带有 crowdingDistance 的城市列表
 */
function crowdingDistance(front, objectives) {
  const n = front.length;
  const m = objectives.length;

  if (n <= 2) {
    return front.map(city => ({ ...city, crowdingDistance: Infinity }));
  }

  // 初始化
  for (const city of front) {
    city._crowdingDist = 0;
  }

  // 对每个目标排序后计算拥挤距离
  for (const obj of objectives) {
    // 按目标值排序
    const sorted = [...front].sort((a, b) => {
      const valA = a[obj.key] ?? 0.5;
      const valB = b[obj.key] ?? 0.5;
      return obj.direction === 'max' ? valB - valA : valA - valB;
    });

    const range = (sorted[n - 1][obj.key] ?? 0.5) - (sorted[0][obj.key] ?? 0.5);

    if (range === 0) continue; // 该目标对拥挤距离无贡献

    // 边界点获得无穷大距离
    sorted[0]._crowdingDist = Infinity;
    sorted[n - 1]._crowdingDist = Infinity;

    for (let i = 1; i < n - 1; i++) {
      const diff = Math.abs(
        (sorted[i + 1][obj.key] ?? 0.5) - (sorted[i - 1][obj.key] ?? 0.5)
      );
      sorted[i]._crowdingDist += diff / range;
    }
  }

  // 清洗内部标记
  const result = front.map(city => {
    const cd = city._crowdingDist;
    delete city._crowdingDist;
    return { ...city, crowdingDistance: parseFloat(cd.toFixed(4)) };
  });

  return result;
}

// ============================================================
// 多目标评分转为统一排名
// ============================================================

/**
 * 将六维画像转为多目标优化目标
 *
 * 默认配置 4 个优化目标：
 *   1. natureFit: 最大化自然匹配（用户 nature 和城市 nature 的一致性）
 *   2. socialFit: 最大化社交匹配
 *   3. budgetEfficiency: 最小化预算压力（用户 budget 越低，越需要便宜城市）
 *   4. noveltyIndex: 最大化新鲜感（探索价值）
 */
const DEFAULT_OBJECTIVES = [
  { key: 'natureFit', direction: 'max', label: '自然匹配' },
  { key: 'socialFit', direction: 'max', label: '社交匹配' },
  { key: 'budgetEfficiency', direction: 'max', label: '预算效率' },
  { key: 'noveltyIndex', direction: 'max', label: '新鲜感' }
];

/**
 * 从用户画像和城市维度构建目标向量
 */
function buildObjectiveVector(userScore, city) {
  const dims = city.dimensions || {};

  return {
    natureFit: 1 - Math.abs((userScore.nature ?? 0.5) - (dims.nature ?? 0.5)),
    socialFit: 1 - Math.abs((userScore.social ?? 0.5) - (dims.social ?? 0.5)),
    budgetEfficiency: (dims.budget ?? 0.5) <= (userScore.budget ?? 0.5) ? 1 : (userScore.budget ?? 0.5) / (dims.budget ?? 0.5),
    noveltyIndex: 1 - Math.min(1, Math.abs((userScore.explore ?? 0.5) - (dims.explore ?? 0.5)) * 1.5)
  };
}

// ============================================================
// Pareto 前沿提取
// ============================================================

/**
 * 提取 Pareto 最优城市
 *
 * @param {Array} cities - 城市列表
 * @param {Object} userScore - 用户六维画像
 * @param {Object} options
 * @param {Array} options.objectives - 自定义目标配置
 * @param {number} options.maxFrontSize - 最大前沿大小（用拥挤距离截断）
 * @returns {Object} { paretoFront, allFronts, dominatedCities, summary }
 */
function extractParetoFrontier(cities, userScore, options = {}) {
  const {
    objectives = DEFAULT_OBJECTIVES,
    maxFrontSize = 5
  } = options;

  // 为目标向量添加城市标识
  const vectors = cities.map(city => ({
    id: city.id,
    name: city.name,
    city,
    ...buildObjectiveVector(userScore, city)
  }));

  // 非支配排序
  const allFronts = nonDominatedSort(vectors, objectives);

  // Pareto 前沿（第一层）
  let paretoFront = allFronts[0] || [];

  // 拥挤距离排序
  paretoFront = crowdingDistance(paretoFront, objectives);

  // 按拥挤距离降序排列
  paretoFront.sort((a, b) => (b.crowdingDistance || 0) - (a.crowdingDistance || 0));

  // 截断到 maxFrontSize
  const truncated = paretoFront.slice(0, maxFrontSize);

  // 受支配城市列表（不在 Pareto 前沿的）
  const paretoIds = new Set(truncated.map(c => c.id));
  const dominatedCities = vectors.filter(c => !paretoIds.has(c.id));

  // 摘要
  const summary = {
    totalCities: cities.length,
    paretoFrontSize: paretoFront.length,
    selectedSize: truncated.length,
    numFronts: allFronts.length,
    frontSizes: allFronts.map(f => f.length),
    objectiveCoverage: computeObjectiveCoverage(truncated, objectives)
  };

  return {
    paretoFront: truncated,
    allFronts,
    dominatedCities,
    summary
  };
}

/**
 * 计算 Pareto 前沿的目标覆盖度
 * 即每个目标上，前沿中最佳值和全局最佳值的比值
 */
function computeObjectiveCoverage(paretoFront, objectives) {
  const coverage = {};

  for (const obj of objectives) {
    const bestInFront = paretoFront.reduce((max, c) => {
      const val = c[obj.key] ?? 0;
      return obj.direction === 'max' ? Math.max(max, val) : Math.min(max, val);
    }, obj.direction === 'max' ? -Infinity : Infinity);

    coverage[obj.key] = parseFloat(bestInFront.toFixed(3));
  }

  return coverage;
}

// ============================================================
// Trade-Off 分析
// ============================================================

/**
 * 分析两个 Pareto 最优城市之间的 trade-off
 *
 * 输出格式：
 *   "选择大理意味着牺牲社交便利换取自然疗愈（自然+25%，社交-35%）"
 */
function analyzeTradeOff(cityA, cityB, objectives = DEFAULT_OBJECTIVES) {
  const tradeoffs = [];

  for (const obj of objectives) {
    const valA = cityA[obj.key] ?? 0;
    const valB = cityB[obj.key] ?? 0;
    const diff = valA - valB;
    const pctDiff = Math.abs(diff) * 100;

    if (pctDiff > 5) {
      tradeoffs.push({
        objective: obj.key,
        label: obj.label,
        winner: diff > 0 ? cityA.name : cityB.name,
        loser: diff > 0 ? cityB.name : cityA.name,
        diffText: `${diff > 0 ? '+' : ''}${Math.round(pctDiff)}%`,
        magnitude: pctDiff
      });
    }
  }

  // 按差异幅度排序
  tradeoffs.sort((a, b) => b.magnitude - a.magnitude);

  return {
    cityA: cityA.name,
    cityB: cityB.name,
    tradeoffs,
    summary: buildTradeOffSummary(cityA, cityB, tradeoffs)
  };
}

function buildTradeOffSummary(cityA, cityB, tradeoffs) {
  if (tradeoffs.length === 0) {
    return `${cityA.name} 和 ${cityB.name} 在各目标上表现相似`;
  }

  const aWins = tradeoffs.filter(t => t.winner === cityA.name);
  const bWins = tradeoffs.filter(t => t.winner === cityB.name);

  let summary = '';
  if (aWins.length > 0) {
    summary += `选择 ${cityA.name} 的优势：${aWins.map(t => `${t.label}(${t.diffText})`).join('、')}。`;
  }
  if (bWins.length > 0) {
    summary += `选择 ${cityB.name} 的优势：${bWins.map(t => `${t.label}(${t.diffText})`).join('、')}。`;
  }

  return summary;
}

// ============================================================
// 综合推荐（Pareto + 评分融合）
// ============================================================

/**
 * 综合推荐函数
 *
 * 策略：
 * 1. 先用 multiLayerScore 选出 TopK
 * 2. 再对 TopK 做 Pareto 分析
 * 3. 如果用户需要"最优解"→ 返回 Pareto 前沿
 * 4. 如果用户需要"多样性"→ 从每个前沿各取一个
 *
 * @returns {Object} { recommendations, paretoAnalysis, tradeOffs }
 */
function recommendWithPareto(candidates, userScore, options = {}) {
  const {
    objectives = DEFAULT_OBJECTIVES,
    strategy = 'balanced', // 'pareto-first' | 'balanced' | 'diverse'
    topK = 3,
    includeTradeOffs = true
  } = options;

  // 提取 Pareto 前沿
  const paretoResult = extractParetoFrontier(
    candidates.map(c => c.city || c),
    userScore,
    { objectives, maxFrontSize: topK + 2 }
  );

  let recommendations;
  switch (strategy) {
    case 'pareto-first':
      // 优先 Pareto 前沿
      recommendations = paretoResult.paretoFront.slice(0, topK);
      break;

    case 'diverse':
      // 从不同前沿各取一个
      recommendations = [];
      for (const front of paretoResult.allFronts) {
        if (recommendations.length >= topK) break;
        const withDist = crowdingDistance(front, objectives);
        withDist.sort((a, b) => (b.crowdingDistance || 0) - (a.crowdingDistance || 0));
        recommendations.push(withDist[0]);
      }
      break;

    case 'balanced':
    default:
      // 平衡：从 Pareto 前沿取第一 + 从候选取高分
      const paretoTop = paretoResult.paretoFront[0];
      recommendations = [paretoTop];
      for (const c of candidates) {
        if (recommendations.length >= topK) break;
        const alreadyIncluded = recommendations.some(r => r.id === (c.id || c.city?.id));
        if (!alreadyIncluded) {
          recommendations.push({
            id: c.id || c.city?.id,
            name: c.name || c.city?.name,
            city: c.city || c,
            ...buildObjectiveVector(userScore, c.city?.dimensions || c.dimensions || {})
          });
        }
      }
      break;
  }

  // Trade-off 分析（前两个的对比）
  let tradeOffs = null;
  if (includeTradeOffs && recommendations.length >= 2) {
    tradeOffs = analyzeTradeOff(recommendations[0], recommendations[1], objectives);
  }

  return {
    recommendations,
    paretoAnalysis: paretoResult.summary,
    tradeOffs
  };
}

module.exports = {
  // 核心
  dominates,
  nonDominatedSort,
  crowdingDistance,

  // 目标
  DEFAULT_OBJECTIVES,
  buildObjectiveVector,

  // 前沿
  extractParetoFrontier,
  computeObjectiveCoverage,

  // Trade-off
  analyzeTradeOff,

  // 综合
  recommendWithPareto
};
