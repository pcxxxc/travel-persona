/**
 * 旅格 Travel Persona · 16维人格引擎
 *
 * 三层输入分离：
 * - Persona Core（长期人格）：来自 PersonaProfile.traits[*].mean
 * - Trip Intent（当次取向）：mood / interests / avoid / freeText
 * - Trip Context（现实状态）：days / budget / origin / season
 *
 * 输出：三层分离的向量和证据记录
 * 对应总纲：3.1 四层用户模型、3.2 16维人格模型、5.1 冷启动渐进取样
 */

const { getTraitLabels, getPersonaTypes } = require('../data/cityRecords');

const TRAIT_KEYS = [
  'restoration', 'nature', 'culture', 'food', 'pace', 'social',
  'budget', 'aesthetics', 'comfort', 'novelty', 'transit',
  'lowCrowd', 'authenticity', 'weatherFlex', 'bookingEase', 'workation'
];

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 3) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function addEffects(vector, effects = {}) {
  Object.keys(effects).forEach(key => {
    if (typeof vector[key] === 'number') {
      vector[key] += effects[key];
    }
  });
}

// ============ 信号规则 ============

const MOOD_EFFECTS = {
  restore: { restoration: 0.26, nature: 0.13, social: -0.18, pace: -0.18, comfort: 0.1 },
  escape: { restoration: 0.3, nature: 0.18, social: -0.22, pace: -0.16, novelty: 0.08, lowCrowd: 0.14 },
  inspire: { aesthetics: 0.22, culture: 0.18, novelty: 0.16, pace: -0.04, authenticity: 0.08 },
  social: { social: 0.26, food: 0.18, pace: 0.1, restoration: -0.1 },
  efficient: { pace: 0.28, comfort: 0.14, aesthetics: 0.1, restoration: -0.12, transit: 0.18, bookingEase: 0.12 },
  live: { restoration: 0.16, comfort: 0.16, pace: -0.2, novelty: 0.1, budget: -0.06, workation: 0.2 }
};

const INTEREST_EFFECTS = {
  nature: { nature: 0.22, restoration: 0.08 },
  oldtown: { culture: 0.17, novelty: 0.06, pace: -0.04, authenticity: 0.12 },
  art: { culture: 0.15, aesthetics: 0.16, comfort: 0.04 },
  coffee: { restoration: 0.1, comfort: 0.08, pace: -0.08 },
  food: { food: 0.2, social: 0.07 },
  photo: { aesthetics: 0.22, novelty: 0.06 },
  museum: { culture: 0.18, comfort: 0.06, weatherFlex: 0.1 },
  hidden: { novelty: 0.2, culture: 0.06, social: -0.04, authenticity: 0.12 }
};

const AVOID_EFFECTS = {
  crowd: { social: -0.14, comfort: 0.12, restoration: 0.06, lowCrowd: 0.22, bookingEase: 0.08 },
  commercial: { novelty: 0.12, culture: 0.08, social: -0.04, authenticity: 0.18 },
  climb: { pace: -0.1, comfort: 0.12, nature: -0.06 },
  early: { pace: -0.12, restoration: 0.06, bookingEase: 0.1 },
  longTransit: { comfort: 0.16, pace: -0.05, transit: 0.2 },
  expensive: { budget: -0.16, comfort: -0.02 }
};

const FREE_TEXT_RULES = [
  { keys: ['累', '疲惫', '放空', '休息'], effect: { restoration: 0.14, pace: -0.08, lowCrowd: 0.06 } },
  { keys: ['咖啡', '书店', '散步'], effect: { comfort: 0.1, restoration: 0.08, pace: -0.06 } },
  { keys: ['展', '美术馆', '博物馆'], effect: { culture: 0.12, aesthetics: 0.1, weatherFlex: 0.06 } },
  { keys: ['小众', '避开', '不想排队'], effect: { novelty: 0.12, social: -0.08, comfort: 0.08, lowCrowd: 0.12, authenticity: 0.08 } },
  { keys: ['交通', '方便', '高铁', '返程'], effect: { transit: 0.14, comfort: 0.06, bookingEase: 0.08 } },
  { keys: ['多玩', '多城', '性价比'], effect: { budget: -0.06, novelty: 0.08, pace: 0.08, transit: 0.08 } }
];

const FREE_TEXT_AVOID_RULES = [
  { pattern: /(不想|不要|不愿|讨厌|避开|不接受).{0,10}(排队|人挤人|拥挤)|排队.{0,6}(浪费|太久)/, value: 'crowd' },
  { pattern: /(不想|不要|讨厌|避开).{0,10}(商业化|商业街|网红街)/, value: 'commercial' },
  { pattern: /(不想|不要|不能|避免).{0,10}(爬山|徒步|登高)/, value: 'climb' },
  { pattern: /(不想|不要|不能|避免).{0,10}(早起|赶早|凌晨出发)/, value: 'early' },
  { pattern: /(不想|不要|不愿|避免|讨厌).{0,16}(长途|换乘|转车|赶路)|长途(换乘|转车).{0,8}(浪费|太累)/, value: 'longTransit' },
  { pattern: /(不想|不要|避免|讨厌).{0,10}(太贵|溢价|高消费|宰客)/, value: 'expensive' }
];

function inferAvoidsFromFreeText(freeText = '') {
  const text = String(freeText).trim();
  if (!text) return [];
  return FREE_TEXT_AVOID_RULES
    .filter(rule => rule.pattern.test(text))
    .map(rule => rule.value);
}

// ============ 三层输入分离的向量构建 ============

/**
 * 构建人格核心向量（长期偏好，来自 PersonaProfile）
 * 如果没有人格档案，返回中性基准
 */
function buildPersonaCoreVector(personaProfile = null) {
  const base = {};
  TRAIT_KEYS.forEach(key => {
    base[key] = 0.5;
  });

  if (!personaProfile || !personaProfile.traits) {
    return base;
  }

  TRAIT_KEYS.forEach(key => {
    const trait = personaProfile.traits[key];
    if (typeof trait === 'number') {
      base[key] = clamp(trait, 0, 1);
    } else if (trait && typeof trait.mean === 'number') {
      base[key] = trait.mean;
    }
  });

  return base;
}

/**
 * 将连续人格向量映射到最接近的旅行原型。
 * 原型只是可读摘要，连续维度仍是推荐计算的真实输入。
 */
function classifyPersona(vector, options = {}) {
  const personas = getPersonaTypes();
  const ranked = personas.map(persona => {
    let weightedDistance = 0;
    let weightTotal = 0;

    TRAIT_KEYS.forEach(key => {
      const userValue = typeof vector?.[key] === 'number' ? vector[key] : 0.5;
      const archetypeValue = typeof persona.match?.[key] === 'number' ? persona.match[key] : 0.5;
      const weight = 0.75 + Math.abs(userValue - 0.5);
      weightedDistance += Math.pow(userValue - archetypeValue, 2) * weight;
      weightTotal += weight;
    });

    const normalizedDistance = Math.sqrt(weightedDistance / Math.max(weightTotal, 1));
    return {
      ...persona,
      similarity: round(clamp(1 - normalizedDistance / 0.72, 0, 1), 3)
    };
  }).sort((a, b) => b.similarity - a.similarity);

  const primary = ranked[0] || null;
  const secondary = ranked[1] || null;
  const margin = primary && secondary ? primary.similarity - secondary.similarity : 0;
  const hasHistory = Boolean(options.hasHistory);
  const confidence = round(clamp(0.42 + margin * 1.8 + (hasHistory ? 0.12 : 0), 0.42, 0.82), 3);

  return {
    primary: primary ? {
      id: primary.id,
      name: primary.name,
      summary: primary.summary,
      similarity: primary.similarity,
      confidence
    } : null,
    secondary: secondary ? {
      id: secondary.id,
      name: secondary.name,
      summary: secondary.summary,
      similarity: secondary.similarity
    } : null,
    confidence,
    basis: hasHistory ? 'profile-and-current-trip' : 'current-trip-cold-start'
  };
}

/**
 * 构建当次取向偏移（来自 TripIntent）
 * 返回：{ offset: {...}, evidence: [...] }
 */
function buildTripIntentOffset(tripIntent = {}) {
  const offset = {};
  TRAIT_KEYS.forEach(key => { offset[key] = 0; });
  const evidence = [];

  // mood 影响
  const mood = tripIntent.mood || 'restore';
  const moodEffect = MOOD_EFFECTS[mood] || MOOD_EFFECTS.restore;
  addEffects(offset, moodEffect);
  evidence.push({ source: 'tripIntent.mood', value: mood, dimensions: Object.keys(moodEffect) });

  // interests 影响
  (tripIntent.interests || []).forEach(item => {
    const effect = INTEREST_EFFECTS[item];
    if (effect) {
      addEffects(offset, effect);
      evidence.push({ source: 'tripIntent.interest', value: item, dimensions: Object.keys(effect) });
    }
  });

  // avoid 影响
  (tripIntent.avoid || []).forEach(item => {
    const effect = AVOID_EFFECTS[item];
    if (effect) {
      addEffects(offset, effect);
      evidence.push({ source: 'tripIntent.avoid', value: item, dimensions: Object.keys(effect) });
    }
  });

  // freeText 影响
  const text = tripIntent.freeText || '';
  FREE_TEXT_RULES.forEach(rule => {
    if (rule.keys.some(key => text.includes(key))) {
      addEffects(offset, rule.effect);
      evidence.push({ source: 'tripIntent.freeText', value: rule.keys[0], dimensions: Object.keys(rule.effect) });
    }
  });

  return { offset, evidence };
}

/**
 * 构建现实条件调整（来自 TripContext）
 * 返回：{ adjustment: {...}, evidence: [...] }
 */
function buildContextAdjustment(tripContext = {}) {
  const adjustment = {};
  TRAIT_KEYS.forEach(key => { adjustment[key] = 0; });
  const evidence = [];

  const days = Number(tripContext.days) || 4;
  if (days <= 3) {
    addEffects(adjustment, { pace: 0.12, comfort: 0.07, transit: 0.06 });
    evidence.push({ source: 'tripContext.days', value: `${days}天（短途）`, dimensions: ['pace', 'comfort', 'transit'] });
  } else if (days >= 6) {
    addEffects(adjustment, { pace: -0.12, novelty: 0.08, workation: 0.08 });
    evidence.push({ source: 'tripContext.days', value: `${days}天（长线）`, dimensions: ['pace', 'novelty', 'workation'] });
  }

  // 预算调整
  const budget = tripContext.budget;
  if (budget && budget.hardMax) {
    const dailyBudget = budget.hardMax / Math.max(days, 1);
    if (dailyBudget < 350) {
      addEffects(adjustment, { budget: -0.1, comfort: -0.05 });
      evidence.push({ source: 'tripContext.budget', value: '低预算', dimensions: ['budget', 'comfort'] });
    } else if (dailyBudget > 600) {
      addEffects(adjustment, { budget: 0.08, comfort: 0.06 });
      evidence.push({ source: 'tripContext.budget', value: '高预算', dimensions: ['budget', 'comfort'] });
    }
  }

  return { adjustment, evidence };
}

/**
 * 主入口：三层输入合并为最终16维向量
 * 对应 Schema: docs/schemas/PersonaProfile.json + TripIntent.json + TripContext.json
 */
function buildFinalVector(personaProfile, tripIntent, tripContext) {
  const core = buildPersonaCoreVector(personaProfile);
  const { offset: intentOffset, evidence: intentEvidence } = buildTripIntentOffset(tripIntent);
  const { adjustment: ctxAdjustment, evidence: ctxEvidence } = buildContextAdjustment(tripContext);

  const final = {};
  const sourceMap = {}; // 记录每个维度值的来源

  TRAIT_KEYS.forEach(key => {
    const base = core[key];
    const intent = intentOffset[key] || 0;
    const ctx = ctxAdjustment[key] || 0;
    final[key] = round(clamp(base + intent + ctx, 0.05, 0.95), 3);

    sourceMap[key] = [];
    if (base !== 0.5) sourceMap[key].push('personaCore');
    if (intent !== 0) sourceMap[key].push('tripIntent');
    if (ctx !== 0) sourceMap[key].push('tripContext');
    if (sourceMap[key].length === 0) sourceMap[key].push('default');
  });

  return {
    vector: final,
    layers: {
      personaCore: core,
      tripIntentOffset: intentOffset,
      contextAdjustment: ctxAdjustment
    },
    evidence: [...intentEvidence, ...ctxEvidence],
    sourceMap
  };
}

/**
 * 从 TripContext 提取硬约束
 */
function extractHardConstraints(tripContext = {}) {
  const constraints = [];

  if (tripContext.destination) {
    constraints.push({ type: 'mustReach', city: tripContext.destination, reason: '用户指定目的地' });
  }

  if (tripContext.budget && tripContext.budget.hardMax) {
    constraints.push({ type: 'budgetCeiling', max: tripContext.budget.hardMax, reason: '预算硬上限' });
  }

  if (tripContext.days) {
    constraints.push({ type: 'daysRange', min: 1, max: tripContext.days, reason: '旅行天数' });
  }

  return constraints;
}

/**
 * 从 TripContext 提取软偏好
 */
function extractSoftPreferences(tripContext = {}) {
  const prefs = {};

  if (tripContext.budget) {
    prefs.comfortBudget = tripContext.budget.comfort;
    prefs.saveTarget = tripContext.budget.saveTarget;
  }

  if (tripContext.season) {
    prefs.season = tripContext.season;
  }

  if (tripContext.origin) {
    prefs.origin = tripContext.origin;
  }

  return prefs;
}

module.exports = {
  TRAIT_KEYS,
  buildPersonaCoreVector,
  buildTripIntentOffset,
  buildContextAdjustment,
  buildFinalVector,
  classifyPersona,
  inferAvoidsFromFreeText,
  extractHardConstraints,
  extractSoftPreferences,
  clamp,
  round
};
