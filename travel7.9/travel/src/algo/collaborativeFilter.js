/**
 * 旅格 Travel Persona · 协同过滤器（v3）
 *
 * 核心思想：
 * "和你相似的人也喜欢这些城市"——经典的协同过滤，
 * 但做了旅行领域的适配。
 *
 * 本模块在没有真实用户行为数据的冷启动阶段，
 * 使用「画像驱动的协同过滤」：
 * 1. 用户聚类：将用户按六维画像分入 6 个人格原型
 * 2. 原型偏好矩阵：每种人格对 20 城的"偏好分布"
 * 3. 近邻推荐：在同一聚类内，找最相似 top3 用户的选择
 * 4. 行为加权：用户实际操作（收藏、查看、预订）作为信号
 *
 * 设计为可增量迁移的架构：
 *   - 当前（冷启动）：纯画像相似度驱动
 *   - 未来（热启动）：接入真实行为数据
 *   - 终极：深度协同过滤（Neural CF）
 *
 * 纯函数设计，零外部状态。
 */

const { DIMENSIONS } = require('./multiLayerScorer');

// ============================================================
// 用户聚类（原型分配）
// ============================================================

/**
 * 6 种旅行人格的原型中心点（六维向量）
 */
const PERSONA_CENTROIDS = {
  relax_roamer:      { nature: 0.55, pace: 0.25, social: 0.40, budget: 0.50, explore: 0.45, freedom: 0.65 },
  nature_healer:     { nature: 0.85, pace: 0.15, social: 0.20, budget: 0.45, explore: 0.50, freedom: 0.70 },
  street_explorer:   { nature: 0.30, pace: 0.55, social: 0.75, budget: 0.40, explore: 0.60, freedom: 0.55 },
  efficient_checker: { nature: 0.35, pace: 0.80, social: 0.55, budget: 0.60, explore: 0.65, freedom: 0.45 },
  creative_collector:{ nature: 0.50, pace: 0.40, social: 0.45, budget: 0.55, explore: 0.75, freedom: 0.60 },
  nomad_trial:       { nature: 0.55, pace: 0.20, social: 0.50, budget: 0.45, explore: 0.55, freedom: 0.85 }
};

const PERSONA_LABELS = {
  relax_roamer: '松弛城市漫游者',
  nature_healer: '自然疗愈逃离者',
  street_explorer: '烟火气探索者',
  efficient_checker: '高效打卡收集者',
  creative_collector: '灵感采集型创作者',
  nomad_trial: '数字游民试居者'
};

/**
 * 将用户画像分配到最近的人格原型
 *
 * @param {Object} userScore - 用户六维画像
 * @returns {Object} { cluster, label, distance, membership }
 */
function assignCluster(userScore) {
  let bestCluster = 'relax_roamer';
  let bestDist = Infinity;
  const distances = {};

  for (const [cluster, centroid] of Object.entries(PERSONA_CENTROIDS)) {
    let sumSq = 0;
    for (const dim of DIMENSIONS) {
      const diff = (userScore[dim] || 0.5) - (centroid[dim] || 0.5);
      sumSq += diff * diff;
    }
    const dist = Math.sqrt(sumSq);
    distances[cluster] = parseFloat(dist.toFixed(4));

    if (dist < bestDist) {
      bestDist = dist;
      bestCluster = cluster;
    }
  }

  // 软聚类：计算每个聚类的隶属度
  const membership = {};
  let totalSimilarity = 0;
  for (const [cluster, dist] of Object.entries(distances)) {
    const sim = 1 / (1 + dist); // 距离→相似度
    membership[cluster] = sim;
    totalSimilarity += sim;
  }
  for (const cluster of Object.keys(membership)) {
    membership[cluster] = parseFloat((membership[cluster] / totalSimilarity).toFixed(3));
  }

  return {
    cluster: bestCluster,
    label: PERSONA_LABELS[bestCluster] || '未知',
    distance: parseFloat(bestDist.toFixed(4)),
    membership
  };
}

// ============================================================
// 原型偏好矩阵
// ============================================================

/**
 * 每种人格类型的城市偏好分布
 *
 * 这是"群体的智慧"——基于人格原型，预计算每种人格
 * 最可能喜欢的城市类型。在无真实行为数据时，
 * 用维度匹配度作为代理信号。
 *
 * 格式：{ personaType: { cityId: preferenceScore } }
 */
function buildPreferenceMatrix(cities, userScore) {
  const matrix = {};

  for (const [personaType, centroid] of Object.entries(PERSONA_CENTROIDS)) {
    matrix[personaType] = {};

    for (const city of cities) {
      const dims = city.dimensions || {};
      // 计算原型中心点与城市的加权距离
      let sumSq = 0;
      for (const dim of DIMENSIONS) {
        const diff = (centroid[dim] || 0.5) - (dims[dim] || 0.5);
        sumSq += diff * diff;
      }
      const score = 1 - Math.sqrt(sumSq / DIMENSIONS.length);
      matrix[personaType][city.id] = parseFloat(score.toFixed(3));
    }
  }

  return matrix;
}

// ============================================================
// 近邻查找
// ============================================================

/**
 * 在用户池中找到与当前用户最相似的 K 个近邻
 *
 * 相似度 = 六维余弦相似度
 *
 * @param {Object} userScore - 当前用户画像
 * @param {Array} userPool - 其他用户数据 [{ id, personaScore, history: [{ cityId, action }] }]
 * @param {number} k - 近邻数量
 * @returns {Array} 近邻列表（按相似度降序）
 */
function findNeighbors(userScore, userPool, k = 5) {
  if (!userPool || userPool.length === 0) return [];

  const neighbors = userPool.map(otherUser => {
    const similarity = cosineSimilarity(userScore, otherUser.personaScore || {});
    return {
      userId: otherUser.id,
      similarity,
      history: otherUser.history || [],
      cluster: otherUser.cluster || null
    };
  });

  neighbors.sort((a, b) => b.similarity - a.similarity);
  return neighbors.slice(0, k).filter(n => n.similarity > 0.3);
}

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0, normA = 0, normB = 0;

  for (const dim of DIMENSIONS) {
    const a = vecA[dim] || 0.5;
    const b = vecB[dim] || 0.5;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ============================================================
// 协同信号生成
// ============================================================

/**
 * 基于近邻的行为生成城市协同信号
 *
 * 信号来源：
 * - 近邻的城市偏好（加权平均）
 * - 原型群体的城市偏好（先验）
 * - 用户自己的历史选择（自回归）
 *
 * @param {Object} userScore - 当前用户画像
 * @param {Array} cities - 城市列表
 * @param {Object} options
 * @param {Array} options.userPool - 其他用户数据
 * @param {Array} options.userHistory - 当前用户的历史
 * @param {number} options.neighborWeight - 近邻权重 (0~1)，默认 0.3
 * @param {number} options.priorWeight - 先验权重 (0~1)，默认 0.7
 * @returns {Object} { citySignals, cluster, neighbors }
 */
function computeCollaborativeSignals(userScore, cities, options = {}) {
  const {
    userPool = [],
    userHistory = [],
    neighborWeight = 0.3,
    priorWeight = 0.7
  } = options;

  // 分配聚类
  const cluster = assignCluster(userScore);

  // 构建偏好矩阵
  const preferenceMatrix = buildPreferenceMatrix(cities, userScore);
  const priorPrefs = preferenceMatrix[cluster.cluster] || {};

  // 找近邻
  const neighbors = findNeighbors(userScore, userPool, 5);

  // 融合信号
  const citySignals = {};

  for (const city of cities) {
    // 先验信号（原型偏好）
    const prior = priorPrefs[city.id] || 0.5;

    // 近邻信号
    let neighborSignal = 0;
    let neighborCount = 0;

    for (const neighbor of neighbors) {
      for (const action of neighbor.history) {
        if (action.cityId === city.id) {
          // 行为加权：预订 > 收藏 > 查看
          const actionWeights = { book: 1.0, favorite: 0.7, view: 0.3 };
          const weight = actionWeights[action.action] || 0.3;
          neighborSignal += weight * neighbor.similarity;
          neighborCount++;
        }
      }
    }

    const avgNeighborSignal = neighborCount > 0
      ? neighborSignal / neighborCount
      : 0;

    // 历史自回归信号
    let historySignal = 0;
    for (const hist of userHistory) {
      if (hist.cityId === city.id) {
        const actionWeights = { book: 0.3, favorite: 0.2, view: 0.1 };
        historySignal += actionWeights[hist.action] || 0.1;
      }
    }

    // 融合
    const totalWeight = priorWeight + neighborWeight + 0.1; // 历史 10%
    const signal = (
      prior * priorWeight +
      avgNeighborSignal * neighborWeight +
      historySignal * 0.1
    ) / totalWeight;

    citySignals[city.id] = parseFloat(Math.min(1, Math.max(0, signal)).toFixed(3));
  }

  return { citySignals, cluster, neighbors };
}

// ============================================================
// 协同推荐增强
// ============================================================

/**
 * 将协同信号注入评分结果
 *
 * 策略：
 * - 有近邻数据时：协同权重 0.15
 * - 无近邻数据时：协同权重 0.05（仅用先验）
 *
 * @param {Array} candidates - 已评分的候选列表
 * @param {Object} collaborSignals - 协同信号 { citySignals, cluster }
 * @param {Object} options
 * @returns {Array} 增强后的候选列表
 */
function enhanceWithCollaborative(candidates, collaborSignals, options = {}) {
  const { citySignals, cluster } = collaborSignals;
  const hasNeighbors = cluster && collaborSignals.neighbors && collaborSignals.neighbors.length > 0;
  const collaborativeWeight = hasNeighbors ? 0.15 : 0.05;

  const enhanced = candidates.map(c => {
    const cityId = c.id || c.city?.id;
    const collabSignal = citySignals[cityId] || 0.5;
    const originalScore = c.score || c.finalScore || c.matchScore || 50;

    const boostedScore = Math.round(
      originalScore * (1 - collaborativeWeight) + collabSignal * 100 * collaborativeWeight
    );

    return {
      ...c,
      collaborativeSignal: collabSignal,
      boostedScore,
      _cluster: cluster
    };
  });

  enhanced.sort((a, b) => b.boostedScore - a.boostedScore);
  return enhanced;
}

// ============================================================
// 冷启动测试数据生成
// ============================================================

/**
 * 生成模拟用户池（用于开发和测试）
 *
 * 创建一批"虚拟用户"，每个人有不同的人格倾向和历史行为。
 * 这样在无真实数据时也能测试协同过滤逻辑。
 */
function generateSyntheticUserPool(count = 20, cities) {
  const pool = [];
  const personaTypes = Object.keys(PERSONA_CENTROIDS);

  for (let i = 0; i < count; i++) {
    const personaType = personaTypes[i % personaTypes.length];
    const centroid = PERSONA_CENTROIDS[personaType];

    // 在原型中心点基础上加随机扰动
    const personaScore = {};
    for (const dim of DIMENSIONS) {
      const noise = (Math.random() - 0.5) * 0.3;
      personaScore[dim] = parseFloat(Math.max(0, Math.min(1, (centroid[dim] || 0.5) + noise)).toFixed(2));
    }

    // 生成模拟历史行为
    const history = [];
    if (cities && cities.length > 0) {
      const actionCount = 1 + Math.floor(Math.random() * 3);
      for (let j = 0; j < actionCount; j++) {
        const randomCity = cities[Math.floor(Math.random() * cities.length)];
        const actions = ['view', 'view', 'favorite', 'book'];
        const action = actions[Math.floor(Math.random() * actions.length)];
        history.push({
          cityId: randomCity.id,
          cityName: randomCity.name,
          action,
          timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000).toISOString()
        });
      }
    }

    pool.push({
      id: `synth_user_${i}`,
      personaType,
      personaScore,
      cluster: personaType,
      history
    });
  }

  return pool;
}

module.exports = {
  // 聚类
  PERSONA_CENTROIDS,
  PERSONA_LABELS,
  assignCluster,

  // 偏好矩阵
  buildPreferenceMatrix,

  // 近邻
  findNeighbors,
  cosineSimilarity,

  // 协同信号
  computeCollaborativeSignals,
  enhanceWithCollaborative,

  // 测试
  generateSyntheticUserPool
};
