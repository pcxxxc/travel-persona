/**
 * 旅格 Travel Persona · 演示预设数据（v3 — 18 种人格类型）
 *
 * 基于 7 大理论框架构建：
 * - Plog 心理类型模型（1974）：Psychocentric ↔ Allocentric 连续体
 * - Cohen 旅游者现象学类型学（1979）：Recreational → Existential
 * - Iso-Ahola 二维动机模型（1982）：逃离/寻求 × 个人/人际
 * - Big Five 人格特质：Openness / Conscientiousness / Extraversion
 * - VALS 价值观与生活方式系统（SRI, 1978）
 * - Pearce 旅行生涯模式理论（2005）
 * - Kaplan 恢复性环境理论（1989）
 *
 * 18 种人格分为 5 大类，每类 3-4 种，覆盖 6 维空间的典型区域。
 * 每种预设的问卷答案经过精心设计，确保 computePersonaScore 输出
 * 的六维分数能触发对应的 inferPersonaLabel 规则。
 *
 * 用法：
 *   const presets = require('./demo/preset-answers');
 *   const answer = presets.PRESETS.nature_healer;
 *   const list = presets.PRESET_LIST; // 带 label + description + category 的列表
 *   const categories = presets.CATEGORIES; // 5 大类元数据
 */

// ===== 5 大类元数据 =====
var CATEGORIES = [
  {
    id: 'nature',
    name: '自然导向型',
    description: '以自然环境为核心诉求，追求身心恢复与自然连接',
    theory: 'Kaplan 恢复性环境理论 + Crompton 推-拉理论'
  },
  {
    id: 'urban',
    name: '城市探索型',
    description: '以城市文化与社交体验为核心，追求多元刺激与灵感',
    theory: 'Cohen 体验型/实验型 + Iso-Ahola 人际寻求'
  },
  {
    id: 'pace',
    name: '节奏导向型',
    description: '以旅行节奏为核心区分，从特种兵到深度慢游',
    theory: 'Big Five 尽责性 + Plog Midcentric/Allocentric'
  },
  {
    id: 'social',
    name: '社交导向型',
    description: '以社交需求为核心驱动力，从派对狂欢到静谧独处',
    theory: 'Big Five 外向性 + Iso-Ahola 二维动机模型'
  },
  {
    id: 'lifestyle',
    name: '生活方式型',
    description: '以生活态度和价值观为核心，旅行是生活方式的延伸',
    theory: 'VALS 价值观系统 + Cohen 存在型旅游者'
  }
];

// ===== 18 种人格预设 =====
//
// 设计原则：
// - 每种人格使用不同的 emotionGoal + door + rhythm 组合
// - 避免多种人格映射到相同的六维区域
// - 预设值必须与 dimensionMapping.js 中的映射表键完全一致
//
// 映射表有效键参考：
//   emotionGoal: 放空|逃离压力|找灵感|拍照出片|社交|独处整理|试住城市
//   door(空间): 海|山|森林|老街|咖啡馆|城市高楼|古镇|草原|沙漠|湖泊
//   duration:  1-2天|3-5天|一周以上|不确定
//   budget:    低预算|中等|高预算|不敏感
//   rhythm:    特种兵|适中|深度慢游|随机漫游
//   nomad:     是|否|想试试

var PRESETS = {

  // ========== I. 自然导向型（4 种） ==========

  /**
   * 1. 自然疗愈逃离者
   * 理论：Kaplan ART + Crompton Push-逃离
   * 核心信号：逃离压力 + 森林 + 随机漫游 → nature↑↑ pace↓↓ social↓
   * 与山野冒险家的区别：不用「一周以上」（不加 explore），social 更低
   */
  nature_healer: {
    emotionGoal: '逃离压力',
    travelTime: '3-5天',
    budget: '中等',
    spacePrefs: ['森林'],
    pacePref: 1  // → 随机漫游
  },

  /**
   * 2. 山野冒险家
   * 理论：Plog Allocentric + VALS Experiential
   * 核心信号：逃离压力 + 山 + 一周以上 → nature↑↑ explore↑↑ freedom↑
   * 与自然疗愈者的区别：「一周以上」带来 explore+0.2，「山」带来 explore+0.3
   */
  mountain_adventurer: {
    emotionGoal: '逃离压力',
    travelTime: '一周以上',
    budget: '中等',
    spacePrefs: ['山'],
    pacePref: 2  // → 深度慢游
  },

  /**
   * 3. 自然社交者
   * 理论：Iso-Ahola 双维度寻求
   * 核心信号：放空 + 湖泊 + 深度慢游 → nature↑ social↑ pace↓
   * 关键：用「放空」而非「逃离压力」（social 不减），用「湖泊」（social 只减 0.2）
   */
  nature_social: {
    emotionGoal: '放空',
    travelTime: '3-5天',
    budget: '中等',
    spacePrefs: ['湖泊'],
    pacePref: 2  // → 深度慢游
  },

  /**
   * 4. 生态守护旅行者
   * 理论：VALS Socially Conscious
   * 核心信号：逃离压力 + 草原 + 一周以上 + 高预算 → nature↑ explore↑ budget↑ pace↓
   * 与山野冒险家的区别：用「草原」（nature+0.5 vs 山 nature+0.3）+ 高预算
   */
  eco_guardian: {
    emotionGoal: '逃离压力',
    travelTime: '一周以上',
    budget: '高预算',
    spacePrefs: ['草原'],
    pacePref: 2  // → 深度慢游
  },

  // ========== II. 城市探索型（4 种） ==========

  /**
   * 5. 烟火气探索者
   * 理论：Iso-Ahola 人际寻求
   * 核心信号：社交 + 城市高楼 + 适中 → social↑↑ nature↓ explore→
   * 关键：pacePref=4(适中) 让 pace 不会太高，与都市活力派区分
   */
  street_explorer: {
    emotionGoal: '社交',
    travelTime: '1-2天',
    budget: '低预算',
    spacePrefs: ['城市高楼'],
    pacePref: 4  // → 适中
  },

  /**
   * 6. 都市活力派
   * 理论：VALS Emulator + Big Five Extraversion
   * 核心信号：社交 + 城市高楼 + 特种兵 → pace↑↑ social↑↑ nature↓
   * 与烟火气探索者的区别：pacePref=5(特种兵) → pace 极高
   */
  urban_vitality: {
    emotionGoal: '社交',
    travelTime: '1-2天',
    budget: '中等',
    spacePrefs: ['城市高楼'],
    pacePref: 5  // → 特种兵
  },

  /**
   * 7. 文化朝圣者
   * 理论：Pearce TCP + Cohen Experiential
   * 核心信号：独处整理 + 古镇 + 深度慢游 → explore↑↑ pace↓ social↓
   * 关键：用「独处整理」(social-0.5) + 「古镇」(explore+0.2, pace-0.3)
   */
  culture_pilgrim: {
    emotionGoal: '独处整理',
    travelTime: '3-5天',
    budget: '中等',
    spacePrefs: ['古镇'],
    pacePref: 2  // → 深度慢游
  },

  /**
   * 8. 灵感采集型创作者
   * 理论：Cohen Experimental
   * 核心信号：找灵感 + 老街 + 适中 → explore↑↑ nature↑ freedom↑
   * 关键：用「找灵感」(explore+0.3, social+0.2) + pacePref=3(适中) 保持 pace 中性
   */
  creative_collector: {
    emotionGoal: '找灵感',
    travelTime: '3-5天',
    budget: '中等',
    spacePrefs: ['老街'],
    pacePref: 3  // → 适中
  },

  // ========== III. 节奏导向型（3 种） ==========

  /**
   * 9. 高效打卡收集者
   * 理论：Big Five Conscientiousness
   * 核心信号：拍照出片 + 城市高楼 + 特种兵 → pace↑↑ explore↑
   */
  efficient_checker: {
    emotionGoal: '拍照出片',
    travelTime: '1-2天',
    budget: '中等',
    spacePrefs: ['城市高楼'],
    pacePref: 5  // → 特种兵
  },

  /**
   * 10. 松弛城市漫游者
   * 理论：Plog Midcentric
   * 核心信号：放空 + 咖啡馆 + 随机漫游 → pace↓↓ freedom↑ nature↓
   * 关键：用「咖啡馆」(freedom+0.3, nature 无增量) 区别于自然疗愈者
   */
  relax_roamer: {
    emotionGoal: '放空',
    travelTime: '3-5天',
    budget: '中等',
    spacePrefs: ['咖啡馆'],
    pacePref: 1  // → 随机漫游
  },

  /**
   * 11. 深度慢游家
   * 理论：Plog Allocentric + Big Five Agreeableness
   * 核心信号：找灵感 + 古镇 + 随机漫游 + 一周以上 → pace↓↓ explore↑↑
   * 关键：用「找灵感」+「古镇」+「一周以上」三重 explore 增量
   */
  deep_slow_traveler: {
    emotionGoal: '找灵感',
    travelTime: '一周以上',
    budget: '中等',
    spacePrefs: ['古镇'],
    pacePref: 1  // → 随机漫游
  },

  // ========== IV. 社交导向型（3 种） ==========

  /**
   * 12. 社交派对型
   * 理论：Big Five Extraversion 极端
   * 核心信号：社交 + 城市高楼 + 特种兵 → social↑↑ pace↑↑ nature↓↓ explore↓
   * 与都市活力派的区别：需要 social>0.65 且 explore<0.55
   *   用「低预算」拉低 budget（不影响 social/pace），但 explore 不增加
   */
  party_social: {
    emotionGoal: '社交',
    travelTime: '1-2天',
    budget: '低预算',
    spacePrefs: ['城市高楼'],
    pacePref: 5  // → 特种兵
  },

  /**
   * 13. 静谧独行者
   * 理论：Iso-Ahola 个人逃离
   * 核心信号：独处整理 + 森林 + 随机漫游 → social↓↓ pace↓
   * 与自然疗愈者的区别：用「独处整理」(social-0.5 比「逃离压力」的 -0.3 更强)
   */
  quiet_solo: {
    emotionGoal: '独处整理',
    travelTime: '3-5天',
    budget: '中等',
    spacePrefs: ['森林'],
    pacePref: 1  // → 随机漫游
  },

  /**
   * 14. 亲子陪伴型
   * 理论：家庭旅行细分
   * 核心信号：放空 + 海 + 深度慢游 → social↑ pace↓ nature↑
   * 关键：用「放空」(不降 social) + 「海」(nature+0.3, social-0.3) → social 略降、nature 升
   *   pacePref=2 → 深度慢游(pace-0.3)
   */
  family_companion: {
    emotionGoal: '放空',
    travelTime: '3-5天',
    budget: '中等',
    spacePrefs: ['海'],
    pacePref: 2  // → 深度慢游
  },

  // ========== V. 生活方式型（4 种） ==========

  /**
   * 15. 数字游民试居者
   * 理论：Cohen Existential
   * 核心信号：试住城市 + 咖啡馆 + 深度慢游 + nomad=是 → freedom↑↑ pace↓
   * 唯一使用 considerNomad 的预设，触发优先判定规则
   */
  nomad_trial: {
    emotionGoal: '试住城市',
    travelTime: '一周以上',
    budget: '高预算',
    spacePrefs: ['咖啡馆'],
    pacePref: 2,  // → 深度慢游
    considerNomad: true
  },

  /**
   * 16. 品质生活家
   * 理论：VALS Achiever
   * 核心信号：放空 + 海 + 深度慢游 + 高预算 → budget↑↑ pace↓
   * 与亲子陪伴型的区别：高预算 → budget 维度显著更高
   */
  quality_living: {
    emotionGoal: '放空',
    travelTime: '3-5天',
    budget: '高预算',
    spacePrefs: ['海'],
    pacePref: 2  // → 深度慢游
  },

  /**
   * 17. 精打细算旅行家
   * 理论：VALS Sustainer
   * 核心信号：逃离压力 + 草原 + 深度慢游 + 低预算 → budget↓↓ freedom↑
   * 关键：「低预算」(budget-0.3, freedom+0.1) + 「草原」(freedom+0.3) → freedom 高、budget 低
   */
  budget_savvy: {
    emotionGoal: '逃离压力',
    travelTime: '一周以上',
    budget: '低预算',
    spacePrefs: ['草原'],
    pacePref: 2  // → 深度慢游
  },

  /**
   * 18. 自由冒险家
   * 理论：Plog Allocentric + VALS I-Am-Me
   * 核心信号：逃离压力 + 沙漠 + 一周以上 + 深度慢游 → freedom↑ explore↑↑ nature↑
   * 关键：「沙漠」(nature+0.4, explore+0.3, freedom 无) + 「一周以上」(explore+0.2)
   *   与山野冒险家的区别：「沙漠」nature 更高(0.4 vs 0.3) 但 freedom 增量来自「逃离压力」(+0.2)
   */
  free_adventurer: {
    emotionGoal: '逃离压力',
    travelTime: '一周以上',
    budget: '中等',
    spacePrefs: ['沙漠'],
    pacePref: 2  // → 深度慢游
  }
};

// ===== 预设展示列表 =====
var PRESET_LIST = [
  // I. 自然导向型
  {
    key: 'nature_healer',
    label: '自然疗愈逃离者',
    description: '在森林山海间放空，恢复身心能量',
    emoji: '🌲',
    category: '自然导向型',
    theory: 'Kaplan ART + Crompton Push'
  },
  {
    key: 'mountain_adventurer',
    label: '山野冒险家',
    description: '深入自然腹地，挑战自我边界',
    emoji: '⛰',
    category: '自然导向型',
    theory: 'Plog Allocentric + VALS Experiential'
  },
  {
    key: 'nature_social',
    label: '自然社交者',
    description: '与好友结伴走进自然，慢节奏社交',
    emoji: '🏕',
    category: '自然导向型',
    theory: 'Iso-Ahola 双维度寻求'
  },
  {
    key: 'eco_guardian',
    label: '生态守护旅行者',
    description: '注重可持续旅行，深度体验自然生态',
    emoji: '🌿',
    category: '自然导向型',
    theory: 'VALS Socially Conscious'
  },

  // II. 城市探索型
  {
    key: 'street_explorer',
    label: '烟火气探索者',
    description: '在街头巷尾寻找城市的真实温度',
    emoji: '🏮',
    category: '城市探索型',
    theory: 'Iso-Ahola 人际寻求'
  },
  {
    key: 'urban_vitality',
    label: '都市活力派',
    description: '快节奏穿梭都市，享受繁华与效率',
    emoji: '🌃',
    category: '城市探索型',
    theory: 'VALS Emulator + Big Five Extraversion'
  },
  {
    key: 'culture_pilgrim',
    label: '文化朝圣者',
    description: '在古镇古迹中沉浸，追寻文化根脉',
    emoji: '🏛',
    category: '城市探索型',
    theory: 'Pearce TCP + Cohen Experiential'
  },
  {
    key: 'creative_collector',
    label: '灵感采集型创作者',
    description: '在异乡街巷中收集创作素材与灵感',
    emoji: '🎨',
    category: '城市探索型',
    theory: 'Cohen Experimental'
  },

  // III. 节奏导向型
  {
    key: 'efficient_checker',
    label: '高效打卡收集者',
    description: '精准规划每分钟，不浪费任何一处打卡点',
    emoji: '📸',
    category: '节奏导向型',
    theory: 'Big Five Conscientiousness'
  },
  {
    key: 'relax_roamer',
    label: '松弛城市漫游者',
    description: '没有目的地，在城市中随心漫步',
    emoji: '☕',
    category: '节奏导向型',
    theory: 'Plog Midcentric'
  },
  {
    key: 'deep_slow_traveler',
    label: '深度慢游家',
    description: '用一周时间读懂一座城，拒绝走马观花',
    emoji: '📖',
    category: '节奏导向型',
    theory: 'Plog Allocentric + Big Five Agreeableness'
  },

  // IV. 社交导向型
  {
    key: 'party_social',
    label: '社交派对型',
    description: '旅行就是换个地方热闹，结交新朋友',
    emoji: '🎉',
    category: '社交导向型',
    theory: 'Big Five Extraversion'
  },
  {
    key: 'quiet_solo',
    label: '静谧独行者',
    description: '一个人安静地待着，就是最好的旅行',
    emoji: '🌙',
    category: '社交导向型',
    theory: 'Iso-Ahola 个人逃离'
  },
  {
    key: 'family_companion',
    label: '亲子陪伴型',
    description: '陪孩子看世界，安全与体验并重',
    emoji: '👨‍👩‍👧',
    category: '社交导向型',
    theory: '家庭旅行理论'
  },

  // V. 生活方式型
  {
    key: 'nomad_trial',
    label: '数字游民试居者',
    description: '带着电脑去远方，旅行就是生活',
    emoji: '💻',
    category: '生活方式型',
    theory: 'Cohen Existential'
  },
  {
    key: 'quality_living',
    label: '品质生活家',
    description: '不将就每一晚住宿，享受精致慢旅行',
    emoji: '✨',
    category: '生活方式型',
    theory: 'VALS Achiever'
  },
  {
    key: 'budget_savvy',
    label: '精打细算旅行家',
    description: '预算有限但自由无限，穷游也精彩',
    emoji: '🎒',
    category: '生活方式型',
    theory: 'VALS Sustainer'
  },
  {
    key: 'free_adventurer',
    label: '自由冒险家',
    description: '不受攻略约束，走到哪算哪',
    emoji: '🧭',
    category: '生活方式型',
    theory: 'Plog Allocentric + VALS I-Am-Me'
  }
];

module.exports = {
  PRESETS: PRESETS,
  PRESET_LIST: PRESET_LIST,
  CATEGORIES: CATEGORIES
};
