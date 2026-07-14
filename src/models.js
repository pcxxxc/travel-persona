/**
 * 旅格 Travel Persona · 核心数据模型（LEGACY -- Phase 0 冻结）
 *
 * ⚠️ 本文件定义的是旧6维体系（freedom / social / explore / nature / pace / budget），
 *    仅用于向后兼容，不得用于新功能开发。
 *
 * 正规产品模型参见: docs/schemas/PersonaProfile.json
 * 共享类型声明参见:  docs/schemas/index.d.ts
 * 迁移说明参见:    docs/migration/six-to-sixteen-dimensions.md
 * 代码边界决策参见: docs/decisions/0004-six-dimension-boundary.md
 *
 * Phase 1 后本文件将移入 legacy/ 目录。
 */

/**
 * PersonaScore —— 人格维度分（推荐的核心依据）
 * 每维 0~1，由问卷答案经离散增量累加得到
 * 人格名（如"松弛漫游者"）由这组分值派生，仅用于展示，不参与计算
 */
const DEFAULT_PERSONA_SCORE = {
  freedom: 0.5,   // 自由探索倾向
  social: 0.5,    // 社交/热闹倾向
  explore: 0.5,   // 深度探索/小众倾向
  nature: 0.5,    // 自然/户外倾向
  pace: 0.5,      // 快节奏/高效率倾向
  budget: 0.5     // 高消费/品质倾向
};

/**
 * City —— 城市模型（与人格维度同构）
 * dimensions 与用户 PersonaScore 同构，用于加权欧氏距离匹配
 * pois 带 zone / openHours / indoor，为行程约束求解准备
 */
const CITY_SCHEMA = {
  id: 'string',           // 唯一标识，如 "dali"
  name: 'string',         // 显示名称，如 "大理"
  dimensions: {
    freedom: 0.0,
    social: 0.0,
    explore: 0.0,
    nature: 0.0,
    pace: 0.0,
    budget: 0.0
  },
  emotionTags: ['string'],  // 情绪标签，如 ["治愈", "逃离", "放空"]
  pois: [{
    name: 'string',         // POI 名称
    zone: 'string',         // 所属区域，如 "洱海东岸"
    type: 'string',         // 类型：自然 / 街区 / 文化 / 美食 / 室内等
    openHours: 'string',    // 营业时间，如 "10:00-22:00" 或 "全天"
    indoor: false,          // 是否室内（雨天替换用）
    note: 'string'          // 备注，如 "骑行/发呆"
  }]
};

/**
 * EmotionNode —— 单次情绪节点（情绪迁徙地图的基本单元）
 * 每次使用旅格时记录，沉淀为长期情绪轨迹
 */
const EMOTION_NODE_SCHEMA = {
  date: 'string',           // ISO 日期，如 "2026-01-15"
  emotion: 'string',        // 用户原始情绪描述，如 "想消失几天"
  door: 'string',           // 用户选择的空间意象，如 "海"
  personaScore: {},         // 当时的 PersonaScore
  recommendedCity: 'string' // 推荐的城市 id
};

/**
 * Itinerary —— 行程模型
 * 按日组织，每日含主题与时段安排
 */
const ITINERARY_SCHEMA = {
  city: 'string',
  days: [{
    day: 1,
    weather: 'string',      // 如 "晴 18℃"
    theme: 'string',        // 当日主题，如 "抵达与慢下来"
    morning: 'string',
    afternoon: 'string',
    evening: 'string'
  }]
};

/**
 * TravelState —— 旅行中状态（Agent 维护）
 * 用于 Travel Companion Agent 的实时调整
 */
const TRAVEL_STATE_SCHEMA = {
  city: 'string',
  day: 1,
  totalDays: 4,
  weather: 'string',        // 如 "rain"
  energy: 50,               // 0-100
  mood: 'string',           // 如 "tired"
  originalItinerary: {},
  completedActivities: []
};

/**
 * EvolutionLog —— 人格演化记录
 * 记录每次人格变化的触发事件
 */
const EVOLUTION_LOG_SCHEMA = {
  date: 'string',
  dimension: 'string',      // 变化的维度，如 "social"
  from: 0.0,
  to: 0.0,
  triggerEvent: 'string',   // 触发事件，如 "在大理和民宿老板聊了一晚上"
  userReflection: 'string'  // 用户反思原话
};

// 导出（CommonJS + ES Module 兼容）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_PERSONA_SCORE,
    CITY_SCHEMA,
    EMOTION_NODE_SCHEMA,
    ITINERARY_SCHEMA,
    TRAVEL_STATE_SCHEMA,
    EVOLUTION_LOG_SCHEMA
  };
}
