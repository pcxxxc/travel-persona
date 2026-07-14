/**
 * 旅格 Travel Persona · MMR 多样性重排器
 *
 * Maximal Marginal Relevance = lambda * relevance - (1-lambda) * max_similarity_to_selected
 * 确保同一路径内的候选城市有足够的多样性。
 * 参考：travel7.9/src/algo/multiLayerScorer.js MMR 思路。
 */

function computeCitySimilarity(a, b) {
  const vecA = a.city?.traitVector || a.traitVector || {};
  const vecB = b.city?.traitVector || b.traitVector || {};

  const keys = Object.keys(vecA).filter(k => typeof vecA[k] === 'number');
  if (keys.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  keys.forEach(key => {
    const va = vecA[key] || 0;
    const vb = vecB[key] || 0;
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  });

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * MMR 重排
 * @param {Array} candidates - 候选列表（含 pathScores）
 * @param {string} pathType - 路径类型（personaBest/balanced/lowCost）
 * @param {number} topK - 返回数量
 * @param {number} lambda - 相关性权重（0~1），越高越关注相关性
 */
function rerank(candidates, pathType = 'personaBest', topK = 4, lambda = 0.75) {
  if (!candidates || candidates.length === 0) return [];

  const pool = candidates.map(c => ({
    ...c,
    mmrScore: c.pathScores?.[pathType] || 0
  }));

  const selected = [];
  const selectedIds = new Set();

  // 第一轮：选择分数最高的
  pool.sort((a, b) => b.mmrScore - a.mmrScore);
  selected.push(pool[0]);
  selectedIds.add(pool[0].city?.id || pool[0].id);

  // 后续轮次：MMR 选择
  while (selected.length < topK && selected.length < pool.length) {
    let bestMMR = -Infinity;
    let bestIdx = -1;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      const cid = candidate.city?.id || candidate.id;
      if (selectedIds.has(cid)) continue;

      const relevance = candidate.pathScores?.[pathType] || 0;

      // 计算与已选候选的最大相似度
      let maxSim = 0;
      for (const sel of selected) {
        const sim = computeCitySimilarity(candidate, sel);
        if (sim > maxSim) maxSim = sim;
      }

      const mmr = lambda * relevance - (1 - lambda) * maxSim;

      if (mmr > bestMMR) {
        bestMMR = mmr;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) break;

    selected.push(pool[bestIdx]);
    selectedIds.add(pool[bestIdx].city?.id || pool[bestIdx].id);
  }

  return selected;
}

/**
 * 聚类去重：确保不同路径的推荐城市尽量分散
 */
function diversifyAcrossPaths(pathResults, minClusterDiversity = 3) {
  const usedClusters = new Set();
  const usedCityIds = new Set();
  const diversified = {};

  for (const [pathType, candidates] of Object.entries(pathResults)) {
    if (!candidates || candidates.length === 0) {
      diversified[pathType] = [];
      continue;
    }

    const filtered = [];
    for (const candidate of candidates) {
      const cluster = candidate.city?.cluster;
      const cityId = candidate.city?.cityId || candidate.city?.id;
      let penalty = 0;
      if (cityId && usedCityIds.has(cityId)) penalty += 0.35;
      if (cluster && usedClusters.has(cluster)) {
        // 已使用过的聚类，降低优先级
        penalty += 0.08;
      }
      filtered.push(penalty > 0 ? { ...candidate, diversityPenalty: penalty } : candidate);
    }

    // 按调整后的分数排序
    filtered.sort((a, b) => {
      const sa = (a.pathScores?.[pathType] || 0) - (a.diversityPenalty || 0);
      const sb = (b.pathScores?.[pathType] || 0) - (b.diversityPenalty || 0);
      return sb - sa;
    });

    const selected = filtered.slice(0, 3);
    diversified[pathType] = selected;
    const top = selected[0];
    const topCityId = top?.city?.cityId || top?.city?.id;
    const topCluster = top?.city?.cluster;
    if (topCityId) usedCityIds.add(topCityId);
    if (topCluster) usedClusters.add(topCluster);
  }

  return diversified;
}

module.exports = {
  rerank,
  diversifyAcrossPaths,
  computeCitySimilarity
};
