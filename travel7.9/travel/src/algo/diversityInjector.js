/**
 * 旅格 Travel Persona · 多样性注入器（v3）
 *
 * 解决"推荐 echo chamber"问题：
 * 传统推荐系统倾向于给用户反复推荐类似城市。
 * 比如一个自然疗愈型用户，永远只能看到大理、丽江、桂林——
 * 但实际上他们可能也会喜欢青岛（海滨+自然）、泉州（古城+慢节奏）。
 *
 * 本模块负责：
 * 1. 新颖度评分：量化一个城市对用户而言有多"意外但合理"
 * 2. 惊喜注入：在结果中按比例混合"安全选择"和"惊喜选择"
 * 3. MMR 重排：避免结果列表中连续出现同类城市
 * 4. 冷启动探索：新城市/少有人去的城市获得 bonus
 *
 * 纯函数设计，零外部状态。
 */

const { DIMENSIONS } = require('./multiLayerScorer');

// ============================================================
// 新颖度评分
// ============================================================

/**
 * 计算城市对用户的新颖度
 *
 * 新颖度 = 超出预期的匹配度
 *
 * 如果用户画像显示"高自然 + 低社交"，但某个城市在"社交"维度意外地
 * 高分，算高新颖度。因为这可能是用户从未考虑过的方向，但确实值得一试。
 *
 * @param {Object} userScore - 用户六维画像
 * @param {Object} cityDims - 城市六维向量
 * @param {Object} options
 * @param {Array} options.userHistory - 用户去过/看过/拒绝的城市类型
 * @returns {Object} { noveltyScore, surpriseDimensions, explanation }
 */
function computeNovelty(userScore, cityDims, options = {}) {
  const { userHistory = [] } = options;

  // 找出用户最突出的维度（top 2）
  const userTop = findTopDimensions(userScore, 2);
  const userBottom = findBottomDimensions(userScore, 2);

  // 找出城市的意外维度：城市在用户"弱维度"上表现出色
  const surpriseDimensions = [];
  let surpriseScore = 0;

  for (const dim of userBottom) {
    const cityVal = cityDims[dim] ?? 0.5;
    if (cityVal > 0.65) {
      // 城市在用户的弱维度上很优秀 → 意外
      surpriseDimensions.push({
        dimension: dim,
        userValue: userScore[dim] || 0.5,
        cityValue: cityVal,
        gap: parseFloat((cityVal - (userScore[dim] || 0.5)).toFixed(2))
      });
      surpriseScore += cityVal - (userScore[dim] || 0.5);
    }
  }

  // 历史惩罚：用户去过的城市类型，降低新颖度
  let historyPenalty = 0;
  if (userHistory.length > 0) {
    const cityTypes = extractCityArchetypes(cityDims);
    for (const hist of userHistory) {
      const histTypes = extractCityArchetypes(hist);
      const overlap = cityTypes.filter(t => histTypes.includes(t)).length;
      historyPenalty += overlap * 0.05; // 每个重叠类型 -0.05
    }
  }

  // 冷启动 bonus：POI 少/知名度低的城市
  const coldStartBonus = computeColdStartBonus(cityDims);

  const noveltyScore = parseFloat(
    Math.max(0, Math.min(1, surpriseScore * 0.7 + coldStartBonus * 0.3 - historyPenalty))
    .toFixed(3)
  );

  let explanation = '';
  if (surpriseDimensions.length > 0) {
    const dim = surpriseDimensions[0];
    const dimNames = {
      social: '社交氛围', nature: '自然环境', pace: '旅行节奏',
      explore: '探索空间', freedom: '自由度', budget: '消费水平'
    };
    explanation = `虽然你平时不太关注${dimNames[dim.dimension] || dim.dimension}，` +
      `但这座城市在这方面的表现意外地出色`;
  } else if (noveltyScore < 0.1) {
    explanation = '这座城市在你的舒适区内，是很稳妥的选择';
  }

  return { noveltyScore, surpriseDimensions, coldStartBonus, explanation };
}

/**
 * 找出用户画像中值最高的 N 个维度
 */
function findTopDimensions(userScore, n = 2) {
  return DIMENSIONS
    .map(dim => ({ dim, value: userScore[dim] || 0.5 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .map(d => d.dim);
}

/**
 * 找出用户画像中值最低的 N 个维度
 */
function findBottomDimensions(userScore, n = 2) {
  return DIMENSIONS
    .map(dim => ({ dim, value: userScore[dim] || 0.5 }))
    .sort((a, b) => a.value - b.value)
    .slice(0, n)
    .map(d => d.dim);
}

/**
 * 提取城市原型标签
 * 用简单的阈值判断法标记城市类型
 */
function extractCityArchetypes(cityDims) {
  const types = [];
  const dims = cityDims || {};

  if ((dims.nature || 0) > 0.65) types.push('nature');
  if ((dims.social || 0) > 0.6) types.push('social');
  if ((dims.pace || 0) > 0.6) types.push('fast');
  if ((dims.pace || 0) < 0.35) types.push('slow');
  if ((dims.explore || 0) > 0.6) types.push('explore');
  if ((dims.budget || 0) < 0.4) types.push('budget');
  if ((dims.freedom || 0) > 0.7) types.push('free');

  return types;
}

/**
 * 冷启动 bonus：知名度较低的城市获得额外的"发现"加成
 */
function computeColdStartBonus(cityDims) {
  // 探索维度高的城市 = 小众 = 冷启动
  const explore = cityDims?.explore || 0.5;
  const isPopular = explore < 0.4; // 低探索 = 热门 = 很多人去过

  return isPopular ? 0 : Math.min(0.3, explore * 0.4);
}

// ============================================================
// 惊喜注入策略
// ============================================================

/**
 * 惊喜注入：在推荐列表中按比例混入"意外之选"
 *
 * 策略：
 * - slot 1: 安全首选（最匹配）
 * - slot 2: 惊喜之选（高新颖度 + 合理匹配度 > 60）
 * - slot 3: 安全备选（次匹配）
 * - slot 4: 探索之选（最高新颖度，匹配度 > 50）
 * ... 依此类推
 *
 * @param {Array} candidates - 已排序的候选城市列表
 * @param {Object} userScore - 用户画像
 * @param {Object} options
 * @param {number} options.surpriseRatio - 惊喜比例 (0~1)，默认 0.25
 * @param {number} options.minRelevance - 惊喜城市最低匹配分，默认 55
 * @returns {Array} 重新排序后的推荐列表
 */
function injectSurprise(candidates, userScore, options = {}) {
  const {
    surpriseRatio = 0.25,
    minRelevance = 55
  } = options;

  if (candidates.length <= 1) return candidates;

  // 为每个候选计算新颖度（如果是多层评分输出，可能已有 dimensions）
  const enriched = candidates.map((c, idx) => {
    const dims = c.dimensions || c.city?.dimensions || {};
    const novelty = computeNovelty(userScore, dims, { userHistory: [] });
    const relevance = c.score || c.finalScore || c.matchScore || 50;

    return {
      ...c,
      noveltyScore: novelty.noveltyScore,
      surpriseDimensions: novelty.surpriseDimensions,
      noveltyExplanation: novelty.explanation,
      isSurprise: novelty.noveltyScore > 0.4 && relevance >= minRelevance
    };
  });

  // 分类：安全 vs 惊喜
  const safe = enriched.filter(c => !c.isSurprise);
  const surprise = enriched.filter(c => c.isSurprise);

  // 惊喜候选按"新颖度 × 匹配度"排序
  surprise.sort((a, b) => {
    const scoreA = (a.noveltyScore || 0) * 0.5 + ((a.score || a.finalScore || 50) / 100) * 0.5;
    const scoreB = (b.noveltyScore || 0) * 0.5 + ((b.score || b.finalScore || 50) / 100) * 0.5;
    return scoreB - scoreA;
  });

  // 交织排列
  const totalSurprise = Math.max(1, Math.round(candidates.length * surpriseRatio));
  const result = [];

  let safeIdx = 0, surpriseIdx = 0;
  const pattern = ['safe', 'surprise', 'safe', 'safe', 'surprise']; // 2:1:2:1 的交织模式

  for (let i = 0; i < candidates.length; i++) {
    const slotType = pattern[i % pattern.length];

    if (slotType === 'surprise' && surpriseIdx < surprise.length && result.length < candidates.length) {
      result.push({ ...surprise[surpriseIdx], _source: 'surprise' });
      surpriseIdx++;
    } else if (safeIdx < safe.length) {
      result.push({ ...safe[safeIdx], _source: 'safe' });
      safeIdx++;
    } else if (surpriseIdx < surprise.length) {
      result.push({ ...surprise[surpriseIdx], _source: 'surprise' });
      surpriseIdx++;
    }
  }

  return result;
}

// ============================================================
// 过滤器气泡检测与避免
// ============================================================

/**
 * 检测推荐列表是否陷入"过滤器气泡"
 *
 * 定义：如果 TopK 中超过 60% 的城市属于同一原型，
 * 则认为陷入气泡，需要强制注入多样性。
 *
 * @param {Array} candidates - 推荐列表
 * @returns {Object} { isBubble, dominantType, typeDistribution, recommendation }
 */
function detectFilterBubble(candidates) {
  if (candidates.length < 3) return { isBubble: false, dominantType: null, typeDistribution: {}, recommendation: null };

  const typeCounts = {};

  for (const c of candidates) {
    const dims = c.dimensions || c.city?.dimensions || {};
    const types = extractCityArchetypes(dims);
    for (const t of types) {
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
  }

  const total = candidates.length;
  let dominantType = null;
  let maxCount = 0;

  for (const [type, count] of Object.entries(typeCounts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantType = type;
    }
  }

  const dominanceRatio = maxCount / total;
  const isBubble = dominanceRatio > 0.6;

  return {
    isBubble,
    dominantType,
    dominanceRatio: parseFloat(dominanceRatio.toFixed(2)),
    typeDistribution: typeCounts,
    recommendation: isBubble
      ? `推荐列表过度集中在"${dominantType}"类型，建议注入其他维度的城市`
      : null
  };
}

/**
 * 气泡打破器：强制替换列表中类型最集中的城市
 *
 * @param {Array} candidates - 推荐列表
 * @param {Array} allCities - 所有可选城市
 * @param {number} replaceCount - 替换数量
 * @returns {Array} 替换后的列表
 */
function breakFilterBubble(candidates, allCities, replaceCount = 1) {
  const bubble = detectFilterBubble(candidates);

  if (!bubble.isBubble) return candidates;

  const dominantType = bubble.dominantType;

  // 找到不同类型且匹配度尚可的替代城市
  const alternatives = allCities
    .filter(city => {
      const dims = city.dimensions || {};
      const types = extractCityArchetypes(dims);
      return !types.includes(dominantType);
    })
    .slice(0, replaceCount);

  if (alternatives.length === 0) return candidates;

  // 替换最后 N 个同类型城市
  const newCandidates = [...candidates];
  for (let i = newCandidates.length - 1; i >= 0 && alternatives.length > 0; i--) {
    const dims = newCandidates[i].dimensions || newCandidates[i].city?.dimensions || {};
    const types = extractCityArchetypes(dims);
    if (types.includes(dominantType)) {
      const alt = alternatives.shift();
      newCandidates[i] = {
        ...alt,
        _source: 'bubble-break',
        _replaced: newCandidates[i].name || newCandidates[i].id
      };
      break;
    }
  }

  return newCandidates;
}

// ============================================================
// 综合多样性增强
// ============================================================

/**
 * 多样性增强主函数
 *
 * 整合新颖度评分 + 惊喜注入 + 气泡检测 + 气泡打破
 *
 * @param {Array} candidates - 原始推荐列表
 * @param {Object} userScore - 用户画像
 * @param {Array} allCities - 所有可选城市（用于气泡打破）
 * @param {Object} options
 * @returns {Object} { enhanced, diversityReport }
 */
function enhanceDiversity(candidates, userScore, allCities, options = {}) {
  const {
    surpriseRatio = 0.25,
    minRelevance = 55,
    breakBubbles = true
  } = options;

  // Step 1: 检测气泡
  const bubbleReport = detectFilterBubble(candidates);

  // Step 2: 惊喜注入
  let enhanced = injectSurprise(candidates, userScore, { surpriseRatio, minRelevance });

  // Step 3: 必要时打破气泡
  if (breakBubbles && bubbleReport.isBubble) {
    enhanced = breakFilterBubble(enhanced, allCities);
  }

  // Step 4: 计算每条结果的新颖度
  const withNovelty = enhanced.map(c => {
    const dims = c.dimensions || c.city?.dimensions || {};
    const novelty = computeNovelty(userScore, dims);
    return { ...c, novelty: novelty.noveltyScore };
  });

  // 多样性报告
  const diversityReport = {
    bubble: bubbleReport,
    surpriseInjected: enhanced.filter(c => c._source === 'surprise').length,
    bubbleBroken: enhanced.filter(c => c._source === 'bubble-break').length,
    noveltyRange: {
      min: parseFloat(Math.min(...withNovelty.map(c => c.novelty)).toFixed(2)),
      max: parseFloat(Math.max(...withNovelty.map(c => c.novelty)).toFixed(2)),
      avg: parseFloat((withNovelty.reduce((s, c) => s + c.novelty, 0) / withNovelty.length).toFixed(2))
    },
    typeDiversity: computeTypeDiversity(enhanced)
  };

  return { enhanced: withNovelty, diversityReport };
}

/**
 * 计算类型多样性指数 (Shannon Diversity Index)
 */
function computeTypeDiversity(candidates) {
  const typeCounts = {};
  let totalTags = 0;

  for (const c of candidates) {
    const dims = c.dimensions || c.city?.dimensions || {};
    const types = extractCityArchetypes(dims);
    for (const t of types) {
      typeCounts[t] = (typeCounts[t] || 0) + 1;
      totalTags++;
    }
  }

  // Shannon 指数：H = -Σ p_i × ln(p_i)
  let shannon = 0;
  for (const count of Object.values(typeCounts)) {
    const p = count / Math.max(1, totalTags);
    shannon -= p * Math.log(p);
  }

  return {
    uniqueTypes: Object.keys(typeCounts).length,
    shannonIndex: parseFloat(shannon.toFixed(3)),
    distribution: typeCounts
  };
}

module.exports = {
  // 新颖度
  computeNovelty,
  findTopDimensions,
  findBottomDimensions,
  extractCityArchetypes,
  computeColdStartBonus,

  // 惊喜注入
  injectSurprise,

  // 气泡
  detectFilterBubble,
  breakFilterBubble,
  computeTypeDiversity,

  // 综合
  enhanceDiversity
};
