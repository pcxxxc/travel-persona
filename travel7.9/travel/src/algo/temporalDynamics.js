/**
 * 旅格 Travel Persona · 时间动力学引擎（v3）
 *
 * 旅行偏好不是一成不变的——
 * 上周想逃离压力去大理的人，下周可能想热闹社交去长沙。
 * 本引擎追踪用户偏好的时间演化。
 *
 * 三大模型：
 * 1. 时间衰减：近期行为权重 > 远期行为
 * 2. 人格漂移：用户画像随时间缓慢变化
 * 3. 生命周期：用户从"探索者"到"常客"的行为模式变化
 *
 * 学术基础：
 * - Ebbinghaus 遗忘曲线：记忆随时间指数衰减
 * - Plog (1974) 旅游者人格连续体：用户从 Psychocentric 向 Allocentric 漂移
 * - Pearce (2005) 旅游生涯阶梯：需求层次随时间升级
 *
 * 纯函数设计：时间数据通过参数注入，无外部依赖。
 */

// ============================================================
// 一、时间衰减模型
// ============================================================

/**
 * 指数衰减权重
 *
 * 公式：weight = base × e^(-λ × daysSinceEvent)
 *
 * 半衰期配置（不同行为类型有不同的衰减速度）：
 * - view（浏览）：7 天半衰期——快速遗忘
 * - favorite（收藏）：30 天半衰期——中等
 * - book（预订）：90 天半衰期——长期记忆
 * - personaTest（测评结果）：60 天半衰期
 */
const HALF_LIVES = {
  view: 7,        // 浏览行为：7 天半衰期
  favorite: 30,   // 收藏行为：30 天半衰期
  book: 90,        // 预订行为：90 天半衰期
  personaTest: 60, // 测评结果：60 天半衰期
  default: 14       // 默认：14 天
};

/**
 * 计算单个事件的衰减权重
 *
 * @param {string} eventDate - ISO 日期字符串
 * @param {string} eventType - 事件类型
 * @param {string} referenceDate - 参考日期（默认当前）
 * @returns {number} 衰减权重 [0, 1]
 */
function decayWeight(eventDate, eventType = 'default', referenceDate = null) {
  const event = new Date(eventDate).getTime();
  const ref = referenceDate ? new Date(referenceDate).getTime() : Date.now();

  const daysSince = (ref - event) / (1000 * 60 * 60 * 24);

  if (daysSince <= 0) return 1.0; // 未来的事件，全权重

  const halfLife = HALF_LIVES[eventType] || HALF_LIVES.default;
  const lambda = Math.log(2) / halfLife; // 衰减常数

  return parseFloat(Math.exp(-lambda * daysSince).toFixed(4));
}

/**
 * 对用户历史行为进行时间衰减加权
 *
 * @param {Array} history - 用户历史 [{ date, type, cityId, ... }]
 * @param {Object} options
 * @returns {Array} 带衰减权重的历史记录
 */
function applyTimeDecay(history, options = {}) {
  const { referenceDate = null } = options;

  return history
    .map(event => ({
      ...event,
      decayedWeight: decayWeight(event.date || event.timestamp, event.type || event.action, referenceDate)
    }))
    .sort((a, b) => b.decayedWeight - a.decayedWeight);
}

/**
 * 基于衰减加权的历史，计算城市偏好分数
 *
 * 结果为每个城市一个 [0,1] 的偏好分数，
 * 反映"基于用户历史行为，你现在有多喜欢这座城市"
 */
function computeDecayedCityPreferences(history, cities, options = {}) {
  const decayed = applyTimeDecay(history, options);
  const preferences = {};

  // 初始化
  for (const city of cities) {
    preferences[city.id] = 0;
  }

  // 行为权重
  const actionWeights = {
    view: 0.1,
    favorite: 0.3,
    book: 0.6,
    visit: 0.8
  };

  for (const event of decayed) {
    const cityId = event.cityId;
    if (!cityId || preferences[cityId] === undefined) continue;

    const actionWeight = actionWeights[event.action || event.type] || 0.1;
    const contribution = actionWeight * event.decayedWeight;
    preferences[cityId] = Math.min(1, (preferences[cityId] || 0) + contribution);
  }

  return preferences;
}

// ============================================================
// 二、人格漂移模型
// ============================================================

/**
 * 用户旅行人格随时间漂移
 *
 * 理论基础：
 * - Plog (1974) 发现旅行者会从 Psychocentric（安全型）
 *   向 Allocentric（冒险型）漂移
 * - 越旅行越有经验 → 越愿意探索 → explore 维度上升
 * - 第一次旅行总是保守 → 多次后更随性 → freedom 维度上升
 *
 * 漂移方向取决于：
 * 1. 旅行经验积累（explore ↑, pace 变化取决于个人）
 * 2. 年龄/人生阶段变化
 * 3. 外部冲击（疫情后偏好户外 → nature ↑）
 */
const DRIFT_VECTORS = {
  // 每次旅行带来的经验漂移
  perTrip: {
    explore: +0.03,  // 越旅行越想探索
    freedom: +0.02,  // 越旅行越随性
    pace: -0.01      // 越旅行越慢下来（不那么赶了）
  },
  // 自然老化漂移（每年）
  perYear: {
    pace: -0.02,     // 年纪越大越慢
    nature: +0.01,   // 年纪越大越爱自然
    social: -0.01    // 年纪越大越独处
  }
};

/**
 * 计算用户人格漂移
 *
 * @param {Object} originalScore - 原始六维画像
 * @param {Object} options
 * @param {number} options.tripCount - 历史旅行次数
 * @param {number} options.yearsSinceFirst - 首次使用以来的年数
 * @param {Array} options.externalShocks - 外部冲击事件
 * @returns {Object} 漂移后的画像
 */
function computePersonaDrift(originalScore, options = {}) {
  const {
    tripCount = 0,
    yearsSinceFirst = 0,
    externalShocks = [] // [{ dimension, delta, reason }]
  } = options;

  const drifted = { ...originalScore };

  // 旅行经验漂移
  for (const [dim, delta] of Object.entries(DRIFT_VECTORS.perTrip)) {
    const totalDelta = delta * tripCount;
    drifted[dim] = parseFloat(Math.max(0, Math.min(1, (drifted[dim] || 0.5) + totalDelta)).toFixed(2));
  }

  // 时间老化漂移
  for (const [dim, delta] of Object.entries(DRIFT_VECTORS.perYear)) {
    const totalDelta = delta * yearsSinceFirst;
    drifted[dim] = parseFloat(Math.max(0, Math.min(1, (drifted[dim] || 0.5) + totalDelta)).toFixed(2));
  }

  // 外部冲击
  for (const shock of externalShocks) {
    drifted[shock.dimension] = parseFloat(
      Math.max(0, Math.min(1, (drifted[shock.dimension] || 0.5) + shock.delta)).toFixed(2)
    );
  }

  // 生成漂移报告
  const changes = [];
  for (const dim of Object.keys(originalScore)) {
    const diff = (drifted[dim] || 0.5) - (originalScore[dim] || 0.5);
    if (Math.abs(diff) > 0.02) {
      changes.push({
        dimension: dim,
        from: originalScore[dim],
        to: drifted[dim],
        delta: parseFloat(diff.toFixed(2)),
        direction: diff > 0 ? '↑' : '↓'
      });
    }
  }

  return {
    originalScore,
    driftedScore: drifted,
    changes,
    hasSignificantDrift: changes.length > 0,
    summary: changes.length > 0
      ? `你的旅行人格发生了变化：${changes.map(c => `${c.dimension}${c.direction}`).join('、')}`
      : '你的旅行人格保持稳定'
  };
}

// ============================================================
// 三、用户生命周期模型
// ============================================================

/**
 * 用户生命周期阶段
 *
 * 基于 Pearce (2005) 旅游生涯阶梯理论和
 * 互联网产品的经典生命周期模型：
 *
 * - newbie（新手期）：前 3 次使用，还在探索
 * - active（活跃期）：3-10 次，频繁使用，明确偏好
 * - mature（成熟期）：10-30 次，很清楚自己要什么
 * - veteran（老手期）：30+ 次，需要新鲜感刺激
 * - dormant（沉睡期）：60 天未使用
 * - reawakening（唤醒期）：沉睡后重新使用
 */
function determineLifecycleStage(userStats) {
  const {
    totalSessions = 0,
    totalTripsPlanned = 0,
    daysSinceLastActive = 0,
    daysSinceRegistered = 0
  } = userStats;

  // 沉睡检测
  if (daysSinceLastActive > 60 && totalSessions > 3) {
    return 'dormant';
  }

  // 重新唤醒
  if (daysSinceLastActive > 60 && totalSessions > 10) {
    // 判断是之前沉睡过又回来的
    const wasDormant = daysSinceLastActive > 60;
    if (wasDormant && daysSinceLastActive < 90) {
      return 'reawakening';
    }
  }

  // 按使用次数分层
  if (totalSessions <= 3) return 'newbie';
  if (totalSessions <= 10) return 'active';
  if (totalSessions <= 30) return 'mature';
  return 'veteran';
}

/**
 * 不同生命周期阶段的推荐策略
 */
const LIFECYCLE_STRATEGIES = {
  newbie: {
    description: '新手用户，需要引导和教育',
    diversityRatio: 0.1,    // 少给惊喜，多给安全选择
    explanationDepth: 'simple', // 简单解释
    surgePrice: 1.0,         // 无溢价
    encourageRepeat: false,
    quickActions: ['从情绪开始', '试试热门城市']
  },
  active: {
    description: '活跃用户，偏好正在形成',
    diversityRatio: 0.25,   // 适度惊喜
    explanationDepth: 'moderate',
    surgePrice: 1.0,
    encourageRepeat: true,
    quickActions: ['继续上次的探索', '发现更多相似城市']
  },
  mature: {
    description: '成熟用户，明确偏好但不拒绝新鲜感',
    diversityRatio: 0.35,   // 更多惊喜
    explanationDepth: 'detailed',
    surgePrice: 1.05,
    encourageRepeat: true,
    quickActions: ['挑战陌生城市', '深度行程规划']
  },
  veteran: {
    description: '资深用户，需要新鲜感维持兴趣',
    diversityRatio: 0.45,   // 高比例惊喜
    explanationDepth: 'expert',
    surgePrice: 1.0,
    encourageRepeat: false,
    quickActions: ['探索小众目的地', '自定义行程']
  },
  dormant: {
    description: '沉睡用户，需要重新激活',
    diversityRatio: 0.2,
    explanationDepth: 'simple',
    surgePrice: 0.9,         // 轻微折扣吸引回归
    encourageRepeat: true,
    quickActions: ['看看有什么新城市', '快速匹配']
  },
  reawakening: {
    description: '重新唤醒用户，偏好可能已变化',
    diversityRatio: 0.3,
    explanationDepth: 'moderate',
    surgePrice: 1.0,
    encourageRepeat: true,
    quickActions: ['重新评估人格', '发现新变化']
  }
};

/**
 * 获取用户生命周期对应的推荐策略
 */
function getLifecycleStrategy(userStats) {
  const stage = determineLifecycleStage(userStats);
  const strategy = LIFECYCLE_STRATEGIES[stage] || LIFECYCLE_STRATEGIES.newbie;

  return { stage, ...strategy };
}

// ============================================================
// 四、综合时间动力学
// ============================================================

/**
 * 综合时间动力学分析
 *
 * 融合衰减、漂移、生命周期三个模型，
 * 输出"此时此刻最适合用户的推荐画像"
 *
 * @param {Object} originalScore - 最新一次测评的画像
 * @param {Array} history - 用户历史行为
 * @param {Object} userStats - 用户统计信息
 * @param {Array} cities - 城市列表
 * @returns {Object} 综合时间动力学输出
 */
function temporalAnalysis(originalScore, history, userStats, cities) {
  // 衰减
  const decayedPrefs = history.length > 0
    ? computeDecayedCityPreferences(history, cities)
    : {};

  // 人格漂移
  const tripCount = userStats?.totalTripsPlanned || history.filter(h => h.action === 'book').length;
  const yearsSinceFirst = userStats?.daysSinceRegistered
    ? userStats.daysSinceRegistered / 365
    : 0;
  const drift = computePersonaDrift(originalScore, { tripCount, yearsSinceFirst });

  // 生命周期
  const lifecycle = getLifecycleStrategy(userStats);

  // 融合策略
  const effectiveScore = { ...drift.driftedScore };

  return {
    effectiveScore,        // 时效调整后的画像
    originalScore,         // 原始画像
    drift,                 // 漂移详情
    decayedPreferences: decayedPrefs, // 衰减后的城市偏好
    lifecycle,             // 生命周期阶段和策略
    recommendation: {
      diversityRatio: lifecycle.diversityRatio,
      explanationDepth: lifecycle.explanationDepth,
      quickActions: lifecycle.quickActions
    }
  };
}

module.exports = {
  // 衰减
  HALF_LIVES,
  decayWeight,
  applyTimeDecay,
  computeDecayedCityPreferences,

  // 漂移
  DRIFT_VECTORS,
  computePersonaDrift,

  // 生命周期
  determineLifecycleStage,
  LIFECYCLE_STRATEGIES,
  getLifecycleStrategy,

  // 综合
  temporalAnalysis
};
