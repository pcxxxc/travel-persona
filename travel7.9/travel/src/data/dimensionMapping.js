/**
 * 旅格 Travel Persona · 维度增量映射表（v2）
 *
 * 核心改进：
 * 1. 加权累加：不同来源的增量有不同权重，避免信息丢失
 * 2. Sigmoid 压缩：替代硬裁剪 [0,1]，保留饱和方向的信息
 * 3. 冲突检测：同一维度正负增量冲突时自动标记
 * 4. 学术注释：每个映射表标注心理学理论依据
 *
 * 心理学理论基础：
 * - Plog (1974) 旅游者人格连续体：Psychocentric ↔ Allocentric
 * - Crompton (1979) 推-拉理论：Push（内在动机）vs Pull（目的地吸引力）
 * - Big Five 人格模型：Openness/Conscientiousness/Extraversion 与旅游行为关联
 * - Kaplan & Kaplan (1989) 恢复性环境理论：自然环境的注意力恢复功能
 */

const { ValidationError } = require('../utils/errors');
const { validateAnswerValue } = require('../utils/validation');

// ========== 基础配置 ==========

// 六维名称（顺序固定）
const DIMENSIONS = ['freedom', 'social', 'explore', 'nature', 'pace', 'budget'];

// 基准分（中性点）
const BASE_SCORE = 0.5;

// Sigmoid 压缩参数
// k=4 时：累加和 ±1 → 分数 0.27/0.73；±2 → 0.12/0.88；±3 → 0.05/0.95
const SIGMOID_K = 4;

// ========== 来源权重配置 ==========
// 设计原则：核心驱动（情绪）权重最高，间接信号权重较低，负向信号权重略低

const SOURCE_WEIGHTS = {
  emotionGoal: 1.0,   // 核心推力动机，最直接反映用户需求（Crompton, 1979）
  door: 0.9,          // 强拉力信号，目的地选择的关键（推-拉理论 Pull 因素）
  rhythm: 0.8,        // 直接决定旅行方式，与 Big Five Conscientiousness 相关
  nomad: 0.8,         // 强信号，直接改变推荐方向（生活方式偏好）
  mood: 0.7,          // 情绪状态，间接但重要（影响恢复性环境需求）
  naturePref: 0.7,    // 直接反映自然偏好强度
  budget: 0.7,        // 硬约束，但非情感驱动（现实约束层）
  duration: 0.6,      // 影响节奏，但较间接（时长→pace 的推导链路较长）
  companion: 0.6,     // 旅伴偏好，间接影响社交维度
  travelStyle: 0.6,   // 旅行方式，影响自由度和探索
  preference: 0.6,    // 历史行为，但人可能想尝试新类型（Plog 连续体可移动）
  risk: 0.6,          // 影响探索意愿，与 Plog 的 Psychocentric/Allocentric 相关
  dislike: 0.5        // 负向信号，权重略低（排除法不如选择法可靠）
};

// ========== 1. 情绪目标 → 维度增量 ==========
/**
 * 心理学依据：
 * - 基于 Crompton (1979) 推-拉理论的「推力」(Push) 动机分类
 * - 「放空」对应放松动机，与 Kaplan 恢复性环境理论中的「远离」(Being Away) 需求一致
 * - 「逃离压力」对应逃离动机，触发高 nature + 低 pace 组合（恢复性环境偏好）
 * - 「社交」对应社交动机，与 Big Five Extraversion 高相关
 * - 「独处整理」对应自我探索动机，低 social 反映内向恢复需求
 *
 * 增量设计原则：
 * - 直接影响情绪状态的维度（nature, pace, social）变化幅度最大（±0.3）
 * - 间接维度（freedom, explore）变化幅度较小（±0.1~0.2）
 * - budget 不受情绪目标直接影响（由独立预算问题决定）
 */
const EMOTION_GOAL_MAP = {
  '放空':       { nature: +0.3, pace: -0.3, social: -0.2 },
  '逃离压力':   { nature: +0.3, pace: -0.3, social: -0.3, freedom: +0.2 },
  '找灵感':     { explore: +0.3, social: +0.2, pace: -0.1 },
  '拍照出片':   { explore: +0.2, nature: +0.2, social: +0.1 },
  '社交':       { social: +0.5, pace: +0.2 },
  '独处整理':   { nature: +0.2, social: -0.5, pace: -0.2, freedom: +0.2 },
  '试住城市':   { freedom: +0.3, explore: +0.2, pace: -0.2 }
};

// ========== 1b. 情绪状态（mood）→ 维度增量 ==========
/**
 * 心理学依据：
 * - 基于 Kaplan & Kaplan (1989) 恢复性环境理论
 * - 「疲惫」→ 需要恢复性环境（高 nature + 低 pace）
 * - 「低落」→ 需要情感愈合 + 自然接触
 * - 「麻木」→ 需要新异刺激重新激活感官
 * - 「精力充沛」→ 高探索 + 高效率
 *
 * 增量设计原则：
 * - 疲惫/低落 → 高 nature + 低 pace（恢复性环境偏好）
 * - 精力充沛 → 高 explore + 高 pace（探索驱动）
 * - 权重 0.7，作为情绪目标的补充信号
 */
const MOOD_MAP = {
  '疲惫':       { nature: +0.3, pace: -0.3, social: -0.2 },
  '低落':       { nature: +0.2, pace: -0.2, social: +0.1 },
  '麻木':       { explore: +0.3, social: +0.1, freedom: +0.1 },
  '还行':       { explore: +0.1 },
  '精力充沛':   { explore: +0.3, pace: +0.2, social: +0.1 }
};

// ========== 1c. 自然亲近度（naturePref）→ 维度增量 ==========
/**
 * 心理学依据：
 * - 直接对应 Kaplan 恢复性环境理论中的「软性魅力」(Soft Fascination)
 * - 「必须有大自然」→ 高 nature，自然的恢复力是旅行核心需求
 * - 「城市公园就够了」→ 低 nature，城市环境即可满足
 *
 * 增量设计原则：
 * - 自然亲近度直接映射到 nature 维度
 * - 权重 0.7
 */
const NATURE_PREF_MAP = {
  '城市公园就够了': { nature: -0.2, pace: +0.1 },
  '偶尔亲近自然':   { nature: +0.1 },
  '必须有大自然':   { nature: +0.4, pace: -0.1 }
};

// ========== 1d. 旅伴偏好（companion）→ 维度增量 ==========
/**
 * 心理学依据：
 * - 基于 Big Five Extraversion 和 Iso-Ahola (1982) 社交/逃避二维动机
 * - 「独自」→ 低 social + 高 freedom（逃避社交动机）
 * - 「一群人」→ 高 social + 高 pace（社交驱动动机）
 *
 * 增量设计原则：
 * - 独自 = 低 social + 高 freedom
 * - 伴侣/朋友/一群人 = 递增的 social 和 pace
 * - 权重 0.6
 */
const COMPANION_MAP = {
  '独自':     { social: -0.3, freedom: +0.2 },
  '伴侣':     { social: +0.1, pace: -0.1 },
  '朋友':     { social: +0.3, pace: +0.1 },
  '一群人':   { social: +0.4, pace: +0.2 }
};

// ========== 1e. 旅行方式（travelStyle）→ 维度增量 ==========
/**
 * 心理学依据：
 * - 对应 Big Five Conscientiousness（规划型=高尽责性）和 Plog 连续体（随性型=Allocentric）
 * - 「规划型」→ 低 freedom + 高 pace（按计划执行）
 * - 「随性型」→ 高 freedom + 低 pace（走哪算哪）
 *
 * 增量设计原则：
 * - 规划型 vs 随性型形成 freedom 和 pace 的对称对比
 * - 权重 0.6
 */
const TRAVEL_STYLE_MAP = {
  '规划型':   { freedom: -0.1, pace: +0.1 },
  '灵活型':   { freedom: +0.1, explore: +0.1 },
  '随性型':   { freedom: +0.3, pace: -0.2 }
};

// ========== 2. 空间偏好（door）→ 维度增量 ==========
/**
 * 心理学依据：
 * - 基于 Crompton (1979) 推-拉理论的「拉力」(Pull) 因素
 * - 空间意象是目的地吸引力的直接投射（Kaplan 的「兼容」Compatibility）
 * - 「海/森林/草原」等高 nature 选项对应恢复性环境（Kaplan & Kaplan, 1989）
 * - 「城市高楼」低 nature + 高 pace 反映现代都市环境特征
 * - 「咖啡馆」pace 降低 + freedom 升高，对应第三空间（Oldenburg, 1989）概念
 *
 * 增量设计原则：
 * - 强自然意象（森林、草原、沙漠）nature 增量最大（±0.4~0.5）
 * - 空间意象通常同时影响多个维度（环境是多维的）
 * - 社交维度与空间开放度负相关（自然空间通常人少）
 */
const DOOR_MAP = {
  '海':         { nature: +0.3, social: -0.3, pace: -0.3 },
  '山':         { explore: +0.3, nature: +0.3, freedom: +0.1 },
  '森林':       { nature: +0.5, social: -0.3, pace: -0.3 },
  '老街':       { social: +0.3, explore: +0.1, nature: -0.3 },
  '咖啡馆':     { pace: -0.3, freedom: +0.3, social: +0.1 },
  '城市高楼':   { pace: +0.3, social: +0.2, nature: -0.5 },
  '古镇':       { explore: +0.2, pace: -0.3, social: +0.1 },
  '草原':       { nature: +0.5, freedom: +0.3, social: -0.3 },
  '沙漠':       { nature: +0.4, explore: +0.3, social: -0.3 },
  '湖泊':       { nature: +0.3, pace: -0.3, social: -0.2 }
};

// ========== 3. 旅行时长 → 维度增量 ==========
/**
 * 心理学依据：
 * - 时长影响「深度」vs「广度」权衡（时间压力理论）
 * - 短途（1-2天）→ 高 pace（时间有限，必须高效）
 * - 长途（一周以上）→ 低 pace + 高 explore（有时间深入探索）
 * - 与 Big Five Conscientiousness 交互：高尽责性者在短时内安排更多活动
 */
const DURATION_MAP = {
  '1-2天':      { pace: +0.2 },
  '3-5天':      { pace: -0.1 },
  '一周以上':   { pace: -0.3, explore: +0.2 },
  '不确定':     {}  // 无信号，不施加影响
};

// ========== 4. 预算 → 维度增量 ==========
/**
 * 心理学依据：
 * - 预算是硬约束，但 budget 维度也反映「消费观念」
 * - 低预算 → 高 freedom（穷游通常更自由、更少预设）
 * - 高预算 → 高 budget（消费能力匹配品质需求）
 * - 与 Plog 连续体无关，是独立的经济约束层
 */
const BUDGET_MAP = {
  '低预算':     { budget: -0.3, freedom: +0.1 },
  '中等':       { budget: 0 },
  '高预算':     { budget: +0.3 },
  '不敏感':     {}  // 无信号
};

// ========== 5. 数字游民意向 → 维度增量 ==========
/**
 * 心理学依据：
 * - 数字游民是一种生活方式选择，超越单次旅行决策
 * - 高 freedom + 低 pace 反映「工作与生活融合」的价值观
 * - 与 Big Five Openness 高相关（愿意尝试非传统生活方式）
 * - 强信号：一旦确认，直接改变推荐方向（推荐数字游民版城市）
 */
const NOMAD_MAP = {
  '是':         { freedom: +0.3, explore: +0.2, pace: -0.2 },
  '否':         {},
  '想试试':     { freedom: +0.2, explore: +0.1 }
};

// ========== 6. 旅行经历（偏好城市类型）→ 维度增量 ==========
/**
 * 心理学依据：
 * - 基于过往行为推断偏好（行为一致性理论）
 * - 但人可能想尝试新类型（Plog 连续体可移动，非固定）
 * - 因此权重较低（0.6），避免过度依赖历史行为
 * - 「户外冒险」高 explore + 高 nature 对应 Allocentric 型旅游者
 */
const PREFERENCE_MAP = {
  '自然风光':   { nature: +0.3, explore: +0.1 },
  '历史文化':   { explore: +0.3, pace: -0.1 },
  '现代都市':   { pace: +0.2, social: +0.2, nature: -0.2 },
  '美食探索':   { social: +0.3, pace: +0.1 },
  '艺术创意':   { explore: +0.3, freedom: +0.2 },
  '户外冒险':   { nature: +0.3, explore: +0.3, pace: +0.1 }
};

// ========== 7. 厌恶项 → 维度增量（负向） ==========
/**
 * 心理学依据：
 * - 厌恶项是排除法信号，与偏好项不对称（厌恶更强，但更难量化）
 * - 「人多拥挤」低 social 反映恢复性环境中的「远离」需求
 * - 「商业化」高 explore 反映对authenticity（本真性）的追求
 * - 权重较低（0.5），因为负向信号通常不如正向信号明确
 */
const DISLIKE_MAP = {
  '人多拥挤':   { social: -0.3, nature: +0.1 },
  '商业化':     { explore: +0.2, freedom: +0.1 },
  '爬山':       { nature: -0.2, pace: +0.1 },
  '长途交通':   { freedom: -0.2 },
  '早起':       { pace: -0.2 },
  '打卡拍照':   { explore: -0.1, social: -0.1 }
};

// ========== 8. 节奏偏好 → 维度增量 ==========
/**
 * 心理学依据：
 * - 直接对应 Big Five Conscientiousness（高=特种兵/计划性强）
 * - 也受 Agreeableness 影响（高=深度慢游/和谐）
 * - 「特种兵」高 pace + 高 explore 是当代年轻人特有的高效打卡模式
 * - 「随机漫游」高 freedom 反映 Plog 的 Allocentric 极端
 */
const RHYTHM_MAP = {
  '特种兵':     { pace: +0.5, explore: +0.2 },
  '紧凑高效':   { pace: +0.3, explore: +0.1 },
  '适中':       { pace: 0 },
  '深度慢游':   { pace: -0.3, explore: +0.2, nature: +0.1 },
  '随机漫游':   { freedom: +0.3, pace: -0.2 }
};

// ========== 9. 风险容忍度 → 维度增量 ==========
/**
 * 心理学依据：
 * - 直接对应 Plog (1974) 的 Psychocentric/Allocentric 连续体
 * - 「安全稳妥」= Psychocentric（偏好熟悉、安全、结构化）
 * - 「喜欢冒险」= Allocentric（偏好新奇、异国、非结构化）
 * - 与 Big Five Openness 和 Neuroticism 交互
 */
const RISK_MAP = {
  '安全稳妥':   { explore: -0.2, freedom: -0.1 },
  '可以接受':   { explore: +0.1 },
  '喜欢冒险':   { explore: +0.3, freedom: +0.2 }
};

// ========== 汇总所有映射表 ==========
const MAPPING_TABLES = {
  emotionGoal: EMOTION_GOAL_MAP,
  mood: MOOD_MAP,
  door: DOOR_MAP,
  naturePref: NATURE_PREF_MAP,
  duration: DURATION_MAP,
  budget: BUDGET_MAP,
  nomad: NOMAD_MAP,
  companion: COMPANION_MAP,
  travelStyle: TRAVEL_STYLE_MAP,
  preference: PREFERENCE_MAP,
  dislike: DISLIKE_MAP,
  rhythm: RHYTHM_MAP,
  risk: RISK_MAP
};

// ========== Sigmoid 压缩函数 ==========

/**
 * Sigmoid 压缩函数
 *
 * 将加权累加和映射到 [0, 1] 区间，替代硬裁剪。
 *
 * 数学特性：
 * - 当 weightedSum = 0 时，score = base（中性点）
 * - 当 weightedSum → +∞ 时，score → 1（平滑饱和）
 * - 当 weightedSum → -∞ 时，score → 0（平滑饱和）
 * - 保序性：更大的累加和总是对应更高的分数
 * - 信息保留：即使累加和很大，不同的大值仍能区分（差异变小但不消失）
 *
 * @param {number} base - 基准分（通常 0.5）
 * @param {number} weightedSum - 加权累加和
 * @param {number} k - 压缩强度（默认 4）
 * @returns {number} 压缩后的分数 [0, 1]
 */
function compressScore(base, weightedSum, k = SIGMOID_K) {
  if (typeof base !== 'number' || typeof weightedSum !== 'number') {
    return base;
  }

  // Sigmoid: f(x) = 1 / (1 + e^(-k*x))
  // 调整为中心在 base 点：当 weightedSum=0 时输出 base
  const sigmoid = 1 / (1 + Math.exp(-k * weightedSum));

  // 将 [0,1] 的 sigmoid 输出映射到以 base 为中心的 [0,1] 区间
  // base=0.5 时：sigmoid 0→0, 0.5→0.5, 1→1
  // base=0.3 时：sigmoid 0→0, 0.5→0.3, 1→1（不对称，但合理）
  if (base === 0.5) {
    return sigmoid;
  }

  // 非中性基准时的调整
  return base + (sigmoid - 0.5) * 2 * Math.min(base, 1 - base);
}

/**
 * 计算加权累加和
 * @param {Array} deltas - 增量列表 [{increment, weight}, ...]
 * @returns {number} 加权累加和
 */
function computeWeightedSum(deltas) {
  return deltas.reduce((sum, { increment, weight }) => {
    return sum + (increment * weight);
  }, 0);
}

/**
 * 检测维度内冲突
 * @param {Array} deltas - 增量列表
 * @returns {Object|null} 冲突信息或 null
 */
function detectConflict(deltas) {
  const positive = deltas.filter(d => d.increment > 0);
  const negative = deltas.filter(d => d.increment < 0);

  if (positive.length > 0 && negative.length > 0) {
    const posSum = positive.reduce((s, d) => s + d.increment * d.weight, 0);
    const negSum = Math.abs(negative.reduce((s, d) => s + d.increment * d.weight, 0));

    // 冲突强度 = min(|正和|, |负和|) / max(|正和|, |负和|)
    // 接近 1 表示强烈冲突（正负相当），接近 0 表示弱冲突（一方主导）
    const intensity = Math.min(posSum, negSum) / Math.max(posSum, negSum);

    return {
      hasConflict: true,
      intensity: parseFloat(intensity.toFixed(3)),
      positiveSources: positive.map(d => d.source),
      negativeSources: negative.map(d => d.source),
      netDirection: posSum > negSum ? 'positive' : 'negative'
    };
  }

  return null;
}

// ========== 核心计算函数 ==========

/**
 * 计算 PersonaScore（v2 改进版）
 *
 * 核心改进：
 * 1. 加权累加：不同来源的增量有不同权重
 * 2. Sigmoid 压缩：替代硬裁剪，保留饱和方向信息
 * 3. 冲突检测：同一维度正负增量冲突时自动标记
 * 4. 输入验证：非法答案值抛出 ValidationError
 *
 * @param {Object} answers - 问卷答案对象，如 { emotionGoal: '放空', door: '海', ... }
 * @param {Object} options - 可选配置
 * @param {boolean} options.useCompression - 是否使用 sigmoid 压缩（默认 true）
 * @param {boolean} options.trackConflicts - 是否检测冲突（默认 true）
 * @param {Object} options.sourceWeights - 自定义来源权重
 * @returns {Object} { score: PersonaScore, deltas: 各维度增量明细, conflicts: 冲突列表, metadata: 元数据 }
 */
function computePersonaScore(answers, options = {}) {
  const {
    useCompression = true,
    trackConflicts = true,
    sourceWeights = SOURCE_WEIGHTS
  } = options;

  // 初始化
  const score = {};
  const deltas = {};      // 每个维度的增量明细
  const conflicts = [];   // 冲突列表

  DIMENSIONS.forEach(dim => {
    score[dim] = BASE_SCORE;
    deltas[dim] = [];
  });

  // 收集所有增量
  for (const [key, value] of Object.entries(answers)) {
    const table = MAPPING_TABLES[key];
    if (!table) continue;

    // 输入验证：非法答案值抛出 ValidationError
    validateAnswerValue(key, value, table);

    const delta = table[value];
    if (!delta) continue;

    const weight = sourceWeights[key] || 0.5;

    for (const [dim, increment] of Object.entries(delta)) {
      if (DIMENSIONS.includes(dim)) {
        deltas[dim].push({
          source: key,
          value,
          increment,
          weight,
          weightedIncrement: parseFloat((increment * weight).toFixed(4))
        });
      }
    }
  }

  // 计算最终分数
  for (const dim of DIMENSIONS) {
    const dimDeltas = deltas[dim];

    if (dimDeltas.length === 0) {
      // 无信号，保持基准分
      score[dim] = BASE_SCORE;
      continue;
    }

    // 计算加权累加和
    const weightedSum = computeWeightedSum(dimDeltas);

    if (useCompression) {
      // Sigmoid 压缩
      score[dim] = parseFloat(compressScore(BASE_SCORE, weightedSum, SIGMOID_K).toFixed(3));
    } else {
      // 传统加法（用于对比测试）
      const rawSum = dimDeltas.reduce((s, d) => s + d.increment, 0);
      score[dim] = parseFloat(Math.max(0, Math.min(1, BASE_SCORE + rawSum)).toFixed(3));
    }

    // 冲突检测
    if (trackConflicts) {
      const conflict = detectConflict(dimDeltas);
      if (conflict) {
        conflicts.push({
          dimension: dim,
          ...conflict
        });
      }
    }
  }

  // 元数据
  const metadata = {
    version: '2.0',
    algorithm: useCompression ? 'weighted_sigmoid' : 'simple_addition',
    sigmoidK: SIGMOID_K,
    sourceWeights,
    totalSignals: Object.values(deltas).reduce((sum, d) => sum + d.length, 0),
    conflictCount: conflicts.length
  };

  // 在 score 上附加信号标记，供 inferPersonaLabel 使用
  score._hasNomadSignal = !!answers.nomad;

  return { score, deltas, conflicts, metadata };
}

/**
 * 从 PersonaScore 推断人格标签（v4 — 基于原型距离匹配）
 *
 * 理论基础（7 大框架）：
 * - Plog 心理类型模型（1974）
 * - Cohen 旅游者现象学类型学（1979）
 * - Iso-Ahola 二维动机模型（1982）
 * - Big Five 人格特质
 * - VALS 价值观与生活方式系统（SRI, 1978）
 * - Pearce 旅行生涯模式理论（2005）
 * - Kaplan 恢复性环境理论（1989）
 *
 * 判定算法：基于"原型距离匹配"（Prototype Distance Matching）
 * 1. 定义 18 种人格的 6D 原型向量（来自 computePersonaScore 实际输出）
 * 2. 对输入分数计算与每个原型的加权欧氏距离
 * 3. 距离越小 = 拟合度越高，选最佳匹配
 * 4. 置信度 = 基于最佳与次佳之间的距离差
 *
 * 维度权重设计：对区分度高的维度赋予更高权重
 * - budget: 权重 3.0（0.30/0.50/0.70 三档，区分力最强）
 * - social: 权重 2.5（0.04~0.94 大范围，关键区分因子）
 * - explore: 权重 2.0（0.50~0.92，区分自然/城市/节奏型）
 * - pace: 权重 1.5（0.04~0.98，区分节奏导向）
 * - freedom: 权重 1.2（0.50~0.90，辅助区分）
 * - nature: 权重 1.0（0.14~0.96，但多数自然型共享高值）
 *
 * @param {Object} score - PersonaScore（6 维 0-1 值，可含 _hasNomadSignal）
 * @returns {Object} { label, confidence, secondary, category }
 */
function inferPersonaLabel(score) {
  // 数字游民优先判定（需要 nomad 信号 + 极高自由度 + 极慢节奏）
  if (score._hasNomadSignal && score.freedom > 0.7 && score.pace < 0.4) {
    return {
      label: '数字游民试居者',
      confidence: 0.95,
      secondary: score.nature > 0.6 ? '自然倾向型' : '城市探索型',
      category: '生活方式型'
    };
  }

  // 18 种人格原型：[freedom, social, explore, nature, pace, budget]
  // 数值来自 computePersonaScore 对各预设答案组合的实际输出
  var prototypes = [
    { id: 'nature_healer',      label: '自然疗愈逃离者',   category: '自然导向型',
      profile: [0.85, 0.09, 0.50, 0.95, 0.04, 0.50] },
    { id: 'mountain_adventurer', label: '山野冒险家',     category: '自然导向型',
      profile: [0.76, 0.23, 0.90, 0.93, 0.05, 0.50] },
    { id: 'nature_social',      label: '自然社交者',       category: '自然导向型',
      profile: [0.50, 0.18, 0.66, 0.93, 0.03, 0.50] },
    { id: 'eco_guardian',       label: '生态守护旅行者',   category: '自然导向型',
      profile: [0.87, 0.09, 0.75, 0.96, 0.05, 0.70] },
    { id: 'street_explorer',    label: '烟火气探索者',     category: '城市探索型',
      profile: [0.57, 0.94, 0.50, 0.14, 0.91, 0.30] },
    { id: 'urban_vitality',     label: '都市活力派',       category: '城市探索型',
      profile: [0.50, 0.94, 0.66, 0.14, 0.98, 0.50] },
    { id: 'culture_pilgrim',    label: '文化朝圣者',       category: '城市探索型',
      profile: [0.69, 0.16, 0.80, 0.75, 0.04, 0.50] },
    { id: 'creative_collector', label: '灵感采集型创作者', category: '城市探索型',
      profile: [0.50, 0.87, 0.83, 0.25, 0.34, 0.50] },
    { id: 'efficient_checker',  label: '高效打卡收集者',   category: '节奏导向型',
      profile: [0.50, 0.75, 0.81, 0.27, 0.96, 0.50] },
    { id: 'relax_roamer',       label: '松弛城市漫游者',   category: '节奏导向型',
      profile: [0.89, 0.39, 0.50, 0.77, 0.04, 0.50] },
    { id: 'deep_slow_traveler', label: '深度慢游家',      category: '节奏导向型',
      profile: [0.72, 0.76, 0.92, 0.50, 0.06, 0.50] },
    { id: 'party_social',       label: '社交派对型',       category: '社交导向型',
      profile: [0.57, 0.94, 0.66, 0.14, 0.98, 0.30] },
    { id: 'quiet_solo',         label: '静谧独行者',       category: '社交导向型',
      profile: [0.85, 0.04, 0.50, 0.93, 0.06, 0.50] },
    { id: 'family_companion',   label: '亲子陪伴型',       category: '社交导向型',
      profile: [0.50, 0.13, 0.66, 0.93, 0.03, 0.50] },
    { id: 'quality_living',     label: '品质生活家',       category: '生活方式型',
      profile: [0.50, 0.13, 0.66, 0.93, 0.03, 0.70] },
    { id: 'budget_savvy',       label: '精打细算旅行家',   category: '生活方式型',
      profile: [0.90, 0.09, 0.75, 0.96, 0.05, 0.30] },
    { id: 'free_adventurer',    label: '自由冒险家',       category: '生活方式型',
      profile: [0.69, 0.09, 0.90, 0.95, 0.05, 0.50] }
  ];

  // 维度权重：区分度越高权重越大
  // 顺序：[freedom, social, explore, nature, pace, budget]
  var dimWeights = [1.2, 2.5, 2.0, 1.0, 1.5, 3.0];

  // 输入分数向量（与原型同序）
  var input = [
    score.freedom, score.social, score.explore,
    score.nature, score.pace, score.budget
  ];

  // 计算每个原型的加权距离
  var distances = prototypes.map(function(proto) {
    var sumSq = 0;
    for (var d = 0; d < 6; d++) {
      var diff = input[d] - proto.profile[d];
      sumSq += diff * diff * dimWeights[d];
    }
    return {
      id: proto.id,
      label: proto.label,
      category: proto.category,
      distance: Math.sqrt(sumSq)
    };
  });

  // 按距离升序排列
  distances.sort(function(a, b) { return a.distance - b.distance; });

  var best = distances[0];
  var second = distances[1];

  // 置信度计算：
  // - 距离为 0 时置信度 1.0（完美匹配）
  // - 距离越大置信度越低
  // - 用最佳与次佳的间距作为额外增益（间距大说明匹配更明确）
  var rawConf = Math.exp(-best.distance * 3);
  var margin = second.distance - best.distance;
  var marginBonus = Math.min(margin * 2, 0.2); // 间距贡献最多 0.2
  var confidence = parseFloat(Math.min(rawConf + marginBonus, 0.99).toFixed(3));

  return {
    label: best.label,
    confidence: confidence,
    secondary: second.label,
    category: best.category
  };
}

// ========== 导出 ==========

module.exports = {
  // 常量
  DIMENSIONS,
  BASE_SCORE,
  SIGMOID_K,
  SOURCE_WEIGHTS,
  MAPPING_TABLES,

  // 映射表（单独导出，便于测试和引用）
  EMOTION_GOAL_MAP,
  MOOD_MAP,
  DOOR_MAP,
  NATURE_PREF_MAP,
  DURATION_MAP,
  BUDGET_MAP,
  NOMAD_MAP,
  COMPANION_MAP,
  TRAVEL_STYLE_MAP,
  PREFERENCE_MAP,
  DISLIKE_MAP,
  RHYTHM_MAP,
  RISK_MAP,

  // 核心函数
  compressScore,
  computeWeightedSum,
  detectConflict,
  computePersonaScore,
  inferPersonaLabel
};
