/**
 * 旅格 Travel Persona · Pareto 优化器
 *
 * 非支配排序 + 拥挤距离计算，用于找到多目标最优解集。
 * 总纲7.6定义的三条决策路径使用 Pareto 前沿选择不同策略。
 *
 * 参考：travel7.9/src/algo/paretoOptimizer.js 思路，纯 JS 实现。
 */

/**
 * 判断方案 a 是否支配方案 b（在所有目标上 >=，至少一个目标上 >）
 */
function dominates(a, b, objectives) {
  let atLeastOneBetter = false;
  for (const obj of objectives) {
    const va = a.subScores[obj] || 0;
    const vb = b.subScores[obj] || 0;
    if (va < vb) return false;
    if (va > vb) atLeastOneBetter = true;
  }
  return atLeastOneBetter;
}

/**
 * 非支配排序（NSGA-II 风格）
 * 返回按 Pareto 层级排序的方案列表
 */
function nonDominatedSort(candidates, objectives) {
  const n = candidates.length;
  const dominatedCounts = new Array(n).fill(0);
  const dominatedSets = Array.from({ length: n }, () => []);
  const fronts = [[]];

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (dominates(candidates[i], candidates[j], objectives)) {
        dominatedSets[i].push(j);
      } else if (dominates(candidates[j], candidates[i], objectives)) {
        dominatedCounts[i]++;
      }
    }

    if (dominatedCounts[i] === 0) {
      fronts[0].push(i);
    }
  }

  let currentFront = 0;
  while (fronts[currentFront] && fronts[currentFront].length > 0) {
    const nextFront = [];
    for (const i of fronts[currentFront]) {
      for (const j of dominatedSets[i]) {
        dominatedCounts[j]--;
        if (dominatedCounts[j] === 0) {
          nextFront.push(j);
        }
      }
    }
    currentFront++;
    if (nextFront.length > 0) {
      fronts[currentFront] = nextFront;
    } else {
      break;
    }
  }

  return fronts
    .filter(f => f.length > 0)
    .map(front => front.map(idx => ({ ...candidates[idx], paretoRank: fronts.indexOf(front) + 1 })));
}

/**
 * 计算拥挤距离（同一 Pareto 前沿内的多样性度量）
 */
function computeCrowdingDistance(front, objectives) {
  const n = front.length;
  if (n <= 2) {
    front.forEach(item => { item.crowdingDistance = Infinity; });
    return front;
  }

  front.forEach(item => { item.crowdingDistance = 0; });

  for (const obj of objectives) {
    front.sort((a, b) => (a.subScores[obj] || 0) - (b.subScores[obj] || 0));

    front[0].crowdingDistance = Infinity;
    front[n - 1].crowdingDistance = Infinity;

    const minVal = front[0].subScores[obj] || 0;
    const maxVal = front[n - 1].subScores[obj] || 0;
    const range = maxVal - minVal || 0.001;

    for (let i = 1; i < n - 1; i++) {
      const diff = ((front[i + 1].subScores[obj] || 0) - (front[i - 1].subScores[obj] || 0)) / range;
      front[i].crowdingDistance += diff;
    }
  }

  return front;
}

/**
 * 主入口：对候选集进行 Pareto 优化
 *
 * @param {Array} scoredCities - 已评分的城市候选列表
 * @param {Array} objectives - 优化目标维度（如 ['personaFit', 'budgetScore', 'resilienceScore']）
 * @returns {Object} { paretoFront: [...], allFronts: [...] }
 */
function optimize(scoredCities, objectives = ['personaFit', 'budgetScore', 'resilienceScore']) {
  if (!scoredCities || scoredCities.length === 0) {
    return { paretoFront: [], allFronts: [] };
  }

  const fronts = nonDominatedSort(scoredCities, objectives);

  // 计算拥挤距离
  fronts.forEach(front => computeCrowdingDistance(front, objectives));

  return {
    paretoFront: fronts[0],
    allFronts: fronts
  };
}

/**
 * 为三条路径从 Pareto 前沿选择不同策略
 */
function selectPathsFromPareto(paretoResult, scoredCities, pathConfigs) {
  const paretoFront = paretoResult.paretoFront;
  const results = {};

  for (const [pathType, config] of Object.entries(pathConfigs)) {
    const { prioritize, threshold } = config;

    // 先过滤满足门槛的
    const qualified = scoredCities.filter(item =>
      !threshold || (item.subScores[threshold.metric] || 0) >= threshold.value
    );

    if (qualified.length === 0) {
      results[pathType] = null;
      continue;
    }

    // 按优先级排序
    const sorted = [...qualified].sort((a, b) => {
      for (const metric of prioritize) {
        const diff = (b.subScores[metric] || 0) - (a.subScores[metric] || 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });

    results[pathType] = sorted[0];
  }

  return results;
}

module.exports = {
  nonDominatedSort,
  computeCrowdingDistance,
  optimize,
  selectPathsFromPareto,
  dominates
};
