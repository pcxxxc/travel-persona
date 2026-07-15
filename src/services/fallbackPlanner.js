const TRAVEL_PERSONA_SEED = require('../data/travelPersonaSeed.json');
const { getCities: getCityRecords } = require('../data/cityRecords');
const { assessIntercityRoute } = require('./route/intercityGraph');

let cachedData = null;

const TRAIT_WEIGHTS = {
  restoration: 0.13,
  nature: 0.11,
  culture: 0.12,
  food: 0.09,
  pace: 0.12,
  social: 0.09,
  budget: 0.12,
  aesthetics: 0.09,
  comfort: 0.07,
  novelty: 0.06,
  transit: 0.08,
  lowCrowd: 0.08,
  authenticity: 0.07,
  weatherFlex: 0.05,
  bookingEase: 0.05,
  workation: 0.05
};

const MOOD_LABELS = {
  restore: '放空恢复',
  escape: '逃离压力',
  inspire: '灵感采集',
  social: '热闹社交',
  efficient: '效率打卡',
  live: '试住一城'
};

const INTEREST_LABELS = {
  nature: '自然山海',
  oldtown: '老城街巷',
  art: '艺术展览',
  coffee: '咖啡书店',
  food: '夜市美食',
  photo: '建筑摄影',
  museum: '博物馆',
  hidden: '小众探索'
};

const AVOID_LABELS = {
  crowd: '人多排队',
  commercial: '过度商业化',
  climb: '爬山消耗',
  early: '早起赶路',
  longTransit: '长交通换乘',
  expensive: '溢价消费'
};

const AVOID_TO_RISK = {
  crowd: 'crowd',
  commercial: 'commercial',
  climb: 'climb',
  early: 'early',
  longTransit: 'longTransit',
  expensive: 'expensive'
};

const ROUTE_CORRIDORS = [
  {
    id: 'valueNorthbound',
    name: '中轴高性价比北上',
    role: '去程主线',
    summary: '沿高铁/普铁主干道北上，城市间距均匀，住宿成本比一线城市友好，适合把路程拆成可玩的段落。',
    estimatedDays: 12,
    valueScore: 94,
    efficiencyScore: 91
  },
  {
    id: 'eastReturn',
    name: '东线不走回头路返程',
    role: '返程推荐',
    summary: '从北京向东南回撤，用济南、南京、苏杭、闽南把返程变成第二条旅行线，减少重复路线的浪费感。',
    estimatedDays: 9,
    valueScore: 88,
    efficiencyScore: 84
  },
  {
    id: 'historyLoop',
    name: '历史审美加强线',
    role: '备选方案',
    summary: '如果用户更重文化和博物馆，把西安/洛阳权重提高，但总里程更长，预算和体力压力也更大。',
    estimatedDays: 19,
    valueScore: 82,
    efficiencyScore: 78
  }
];

const JOURNAL_SIGNAL_RULES = {
  liked: {
    oldtown: { culture: 0.1, authenticity: 0.12, pace: -0.03 },
    museum: { culture: 0.12, weatherFlex: 0.08, bookingEase: 0.04 },
    food: { food: 0.12, social: 0.04 },
    nature: { nature: 0.14, restoration: 0.08 },
    photo: { aesthetics: 0.14, novelty: 0.04 },
    slow: { restoration: 0.12, pace: -0.1, comfort: 0.06 }
  },
  friction: {
    crowd: { lowCrowd: 0.16, social: -0.08, bookingEase: 0.06 },
    expensive: { budget: -0.14, comfort: -0.02 },
    transit: { transit: 0.14, comfort: 0.06, pace: -0.04 },
    early: { bookingEase: 0.1, pace: -0.08, restoration: 0.04 },
    commercial: { authenticity: 0.14, novelty: 0.07, social: -0.04 },
    overpacked: { pace: -0.14, restoration: 0.08, comfort: 0.06 }
  }
};

function getData() {
  if (cachedData) {
    return cachedData;
  }
  const cities = getCityRecords().map(city => ({
    ...city,
    vector: { ...city.traitVector }
  }));
  const cityScores = cities.reduce((scores, city) => {
    scores[city.id] = city.intelligence || {};
    return scores;
  }, { ...(TRAVEL_PERSONA_SEED.cityIntelligence.cityScores || {}) });
  cachedData = {
    ...TRAVEL_PERSONA_SEED,
    cities,
    cityIntelligence: {
      ...TRAVEL_PERSONA_SEED.cityIntelligence,
      cityScores
    }
  };
  return cachedData;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 0) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function addEffects(vector, effects = {}) {
  Object.keys(effects).forEach(key => {
    vector[key] = (vector[key] || 0.5) + effects[key];
  });
}

function inferDestination(text = '') {
  return text.includes('北京') ? '北京' : '';
}

function inferRouteGoal(origin = '', text = '') {
  const source = `${origin} ${text}`;
  if (source.includes('茂名') && source.includes('北京')) {
    return 'multiCityValue';
  }
  if (source.includes('返程') || source.includes('多玩') || source.includes('多城')) {
    return 'multiCityValue';
  }
  return '';
}

function normalizeProfile(profile = {}) {
  const freeText = profile.freeText || profile.note || '';
  const origin = profile.origin || '';
  const routeGoal = profile.routeGoal || inferRouteGoal(origin, freeText);
  const destination = profile.destination || inferDestination(freeText);
  const mood = profile.mood || 'restore';
  const journalEntries = Array.isArray(profile.journalEntries) ? profile.journalEntries : [];
  const journalMemory = profile.journalMemory && profile.journalMemory.entryCount
    ? profile.journalMemory
    : buildJournalMemory(journalEntries);

  return {
    mood,
    moodLabel: MOOD_LABELS[mood] || MOOD_LABELS.restore,
    interests: Array.isArray(profile.interests) ? profile.interests : [],
    avoid: Array.isArray(profile.avoid) ? profile.avoid : [],
    days: Number(profile.days) || 4,
    budget: Number(profile.budget) || 500,
    origin,
    companion: profile.companion || 'solo',
    destination,
    routeGoal,
    journalEntries,
    journalMemory,
    freeText
  };
}

function buildJournalMemory(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const rawDelta = {};
  const evidence = [];
  const contradictions = [];
  const likedCounts = {};
  const frictionCounts = {};
  let totalEnergy = 0;
  let totalLoad = 0;
  let transitTiring = 0;
  let crowdStress = 0;

  const addDelta = (effect = {}, multiplier = 1) => {
    Object.keys(effect).forEach(key => {
      rawDelta[key] = (rawDelta[key] || 0) + effect[key] * multiplier;
    });
  };

  list.forEach(entry => {
    const liked = Array.isArray(entry.liked) ? entry.liked : [];
    const friction = Array.isArray(entry.friction) ? entry.friction : [];
    totalEnergy += Number(entry.energy) || 5;
    totalLoad += Number(entry.load) || 5;

    liked.forEach(tag => {
      likedCounts[tag] = (likedCounts[tag] || 0) + 1;
      addDelta(JOURNAL_SIGNAL_RULES.liked[tag]);
    });

    friction.forEach(tag => {
      frictionCounts[tag] = (frictionCounts[tag] || 0) + 1;
      addDelta(JOURNAL_SIGNAL_RULES.friction[tag]);
    });

    if (entry.energy >= 7 && entry.load <= 5) {
      addDelta({ restoration: 0.08, comfort: 0.06 });
    }
    if (entry.energy <= 5 && entry.load >= 7) {
      addDelta({ pace: -0.12, restoration: 0.08, comfort: 0.06 });
    }
    if (entry.crowd === 'overwhelmed') {
      crowdStress += 1;
      addDelta({ lowCrowd: 0.14, social: -0.08, bookingEase: 0.04 });
    }
    if (entry.crowd === 'calm') {
      addDelta({ social: 0.03, comfort: 0.04 });
    }
    if (entry.transit === 'tiring') {
      transitTiring += 1;
      addDelta({ transit: 0.14, comfort: 0.06, pace: -0.05 });
    }
    if (entry.transit === 'smooth') {
      addDelta({ transit: 0.04, pace: 0.02 });
    }

    addDelta(inferJournalTextEffect(entry.note || ''));

    if (entry.note) {
      evidence.push({
        city: entry.city || '未命名城市',
        note: entry.note,
        tags: liked.concat(friction).slice(0, 4)
      });
    }
  });

  const divisor = Math.max(Math.sqrt(Math.max(list.length, 1)) * 2.8, 2.8);
  const delta = {};
  Object.keys(rawDelta).forEach(key => {
    delta[key] = round(clamp(rawDelta[key] / divisor, -0.26, 0.26), 3);
  });

  if ((likedCounts.food || 0) > 0 && crowdStress > 0) {
    contradictions.push('喜欢烟火气和美食，但对拥挤阈值偏低，推荐应找非核心商圈的吃喝区域。');
  }
  if ((likedCounts.museum || 0) > 0 && (frictionCounts.early || 0) > 0) {
    contradictions.push('喜欢高信息量场馆，但不适合早起硬赶预约，推荐应提前锁票并减少当天第二站。');
  }
  if (transitTiring > 0 && list.length >= 2) {
    contradictions.push('真实记录显示换乘会显著消耗体力，多城路线应控制连续跨城天数。');
  }
  if (list.length) {
    const avgEnergy = totalEnergy / list.length;
    const avgLoad = totalLoad / list.length;
    if (avgEnergy <= 5.5 && avgLoad >= 6.8) {
      contradictions.push('手账里的实际体力低于问卷预期，系统会下调节奏、增加缓冲日。');
    }
  }

  const topDeltas = Object.keys(delta)
    .map(key => ({ key, value: delta[key] }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 6);

  const confidence = list.length ? round(clamp(0.42 + Math.sqrt(list.length) * 0.12 + evidence.length * 0.015, 0.48, 0.9), 2) : 0;

  return {
    entryCount: list.length,
    confidence,
    delta,
    topDeltas,
    evidence: evidence.slice(-5).reverse(),
    contradictions: contradictions.slice(0, 4),
    nextRules: buildJournalNextRules(delta, contradictions),
    updatedAt: list.length ? list[list.length - 1].createdAt : null
  };
}

function inferJournalTextEffect(text = '') {
  const effect = {};
  const rules = [
    { keys: ['好吃', '夜市', '小吃'], effect: { food: 0.09, social: 0.03 } },
    { keys: ['博物馆', '展', '历史'], effect: { culture: 0.1, weatherFlex: 0.04 } },
    { keys: ['老城', '街巷', '本地'], effect: { culture: 0.08, authenticity: 0.1 } },
    { keys: ['散步', '舒服', '慢'], effect: { restoration: 0.08, pace: -0.05, comfort: 0.04 } },
    { keys: ['太吵', '排队', '人多'], effect: { lowCrowd: 0.12, social: -0.06 } },
    { keys: ['贵', '溢价', '住宿成本'], effect: { budget: -0.1 } },
    { keys: ['预约', '抢票'], effect: { bookingEase: 0.1, transit: 0.04 } },
    { keys: ['换乘', '跨区', '交通'], effect: { transit: 0.1, comfort: 0.04 } },
    { keys: ['赶', '累'], effect: { pace: -0.1, restoration: 0.05, comfort: 0.04 } }
  ];

  rules.forEach(rule => {
    if (rule.keys.some(key => text.includes(key))) {
      Object.keys(rule.effect).forEach(key => {
        effect[key] = (effect[key] || 0) + rule.effect[key];
      });
    }
  });

  return effect;
}

function buildJournalNextRules(delta, contradictions) {
  const rules = [];
  if ((delta.lowCrowd || 0) > 0.06) {
    rules.push('优先选择可错峰、可预约、非核心商圈的 POI。');
  }
  if ((delta.transit || 0) > 0.06) {
    rules.push('跨城路线最多连续两天移动，第三天必须安排低移动量。');
  }
  if ((delta.budget || 0) < -0.05) {
    rules.push('住宿和餐饮默认做性价比筛选，避免旺季溢价区。');
  }
  if ((delta.culture || 0) > 0.06) {
    rules.push('增加博物馆、老城和地方历史权重，但保留雨天/闭馆备选。');
  }
  if ((delta.pace || 0) < -0.05) {
    rules.push('每天核心任务不超过 2 个，保留下午或晚上自由段。');
  }
  if (!rules.length && contradictions.length) {
    rules.push('先尊重手账里出现的矛盾：喜欢内容，但不要用高强度方式获得内容。');
  }
  return rules.slice(0, 4);
}

function applyJournalMemory(vector, memory) {
  if (!memory || !memory.entryCount) {
    return;
  }

  const strength = clamp(0.18 + memory.confidence * 0.28, 0.2, 0.43);
  Object.keys(memory.delta || {}).forEach(key => {
    vector[key] = (vector[key] || 0.5) + memory.delta[key] * strength;
  });
}

function buildVector(profile = {}) {
  const budget = Number(profile.budget) || 500;
  const vector = {
    restoration: 0.5,
    nature: 0.5,
    culture: 0.5,
    food: 0.5,
    pace: 0.5,
    social: 0.5,
    budget: clamp(budget / 1000, 0.18, 0.92),
    aesthetics: 0.5,
    comfort: 0.55,
    novelty: 0.5,
    transit: 0.55,
    lowCrowd: 0.5,
    authenticity: 0.5,
    weatherFlex: 0.5,
    bookingEase: 0.52,
    workation: 0.42
  };

  const moodEffects = {
    restore: { restoration: 0.26, nature: 0.13, social: -0.18, pace: -0.18, comfort: 0.1 },
    escape: { restoration: 0.3, nature: 0.18, social: -0.22, pace: -0.16, novelty: 0.08, lowCrowd: 0.14 },
    inspire: { aesthetics: 0.22, culture: 0.18, novelty: 0.16, pace: -0.04, authenticity: 0.08 },
    social: { social: 0.26, food: 0.18, pace: 0.1, restoration: -0.1 },
    efficient: { pace: 0.28, comfort: 0.14, aesthetics: 0.1, restoration: -0.12, transit: 0.18, bookingEase: 0.12 },
    live: { restoration: 0.16, comfort: 0.16, pace: -0.2, novelty: 0.1, budget: -0.06, workation: 0.2 }
  };

  const interestEffects = {
    nature: { nature: 0.22, restoration: 0.08 },
    oldtown: { culture: 0.17, novelty: 0.06, pace: -0.04, authenticity: 0.12 },
    art: { culture: 0.15, aesthetics: 0.16, comfort: 0.04 },
    coffee: { restoration: 0.1, comfort: 0.08, pace: -0.08 },
    food: { food: 0.2, social: 0.07 },
    photo: { aesthetics: 0.22, novelty: 0.06 },
    museum: { culture: 0.18, comfort: 0.06, weatherFlex: 0.1 },
    hidden: { novelty: 0.2, culture: 0.06, social: -0.04, authenticity: 0.12 }
  };

  const avoidEffects = {
    crowd: { social: -0.14, comfort: 0.12, restoration: 0.06, lowCrowd: 0.22, bookingEase: 0.08 },
    commercial: { novelty: 0.12, culture: 0.08, social: -0.04, authenticity: 0.18 },
    climb: { pace: -0.1, comfort: 0.12, nature: -0.06 },
    early: { pace: -0.12, restoration: 0.06, bookingEase: 0.1 },
    longTransit: { comfort: 0.16, pace: -0.05, transit: 0.2 },
    expensive: { budget: -0.16, comfort: -0.02 }
  };

  addEffects(vector, moodEffects[profile.mood] || moodEffects.restore);
  (profile.interests || []).forEach(item => addEffects(vector, interestEffects[item]));
  (profile.avoid || []).forEach(item => addEffects(vector, avoidEffects[item]));

  if ((Number(profile.days) || 4) <= 3) {
    addEffects(vector, { pace: 0.12, comfort: 0.07, transit: 0.06 });
  } else if ((Number(profile.days) || 4) >= 6) {
    addEffects(vector, { pace: -0.12, novelty: 0.08, workation: 0.08 });
  }

  const text = profile.freeText || '';
  const textRules = [
    { keys: ['累', '疲惫', '放空', '休息'], effect: { restoration: 0.14, pace: -0.08, lowCrowd: 0.06 } },
    { keys: ['咖啡', '书店', '散步'], effect: { comfort: 0.1, restoration: 0.08, pace: -0.06 } },
    { keys: ['展', '美术馆', '博物馆'], effect: { culture: 0.12, aesthetics: 0.1, weatherFlex: 0.06 } },
    { keys: ['小众', '避开', '不想排队'], effect: { novelty: 0.12, social: -0.08, comfort: 0.08, lowCrowd: 0.12, authenticity: 0.08 } },
    { keys: ['交通', '方便', '高铁', '返程'], effect: { transit: 0.14, comfort: 0.06, bookingEase: 0.08 } },
    { keys: ['多玩', '多城', '性价比'], effect: { budget: -0.06, novelty: 0.08, pace: 0.08, transit: 0.08 } }
  ];

  textRules.forEach(rule => {
    if (rule.keys.some(key => text.includes(key))) {
      addEffects(vector, rule.effect);
    }
  });

  applyJournalMemory(vector, profile.journalMemory);

  Object.keys(vector).forEach(key => {
    vector[key] = round(clamp(vector[key], 0.05, 0.95), 3);
  });

  return vector;
}

function enrichCityVector(city) {
  const vector = { ...city.vector };
  const riskFlags = city.riskFlags || [];
  const pois = city.pois || [];
  const indoorCount = pois.filter(poi => poi.indoor).length;
  const typeSet = new Set(pois.map(poi => poi.type));

  vector.transit = Number.isFinite(Number(vector.transit)) ? Number(vector.transit) : city.transportScore || 0.5;
  vector.lowCrowd = Number.isFinite(Number(vector.lowCrowd))
    ? Number(vector.lowCrowd)
    : riskFlags.includes('crowd') ? 0.32 : 0.64;
  vector.authenticity = Number.isFinite(Number(vector.authenticity))
    ? Number(vector.authenticity)
    : riskFlags.includes('commercial')
      ? clamp((city.vector.culture || 0.5) + 0.02, 0.35, 0.72)
      : clamp((city.vector.culture || 0.5) + 0.1, 0.45, 0.86);
  vector.weatherFlex = Number.isFinite(Number(vector.weatherFlex))
    ? Number(vector.weatherFlex)
    : clamp(0.38 + indoorCount * 0.13, 0.38, 0.84);
  vector.bookingEase = Number.isFinite(Number(vector.bookingEase))
    ? Number(vector.bookingEase)
    : riskFlags.includes('crowd') || riskFlags.includes('early') ? 0.42 : 0.68;
  vector.workation = Number.isFinite(Number(vector.workation))
    ? Number(vector.workation)
    : city.cluster === 'slow-nature' || city.id === 'chengdu' || city.id === 'hangzhou' || city.id === 'shenzhen' ? 0.72 : 0.42;
  vector.poiDiversity = clamp(typeSet.size / 12, 0.35, 0.95);

  return vector;
}

function similarity(a, b) {
  let sum = 0;
  let weightSum = 0;

  Object.keys(TRAIT_WEIGHTS).forEach(key => {
    const weight = TRAIT_WEIGHTS[key];
    const av = typeof a[key] === 'number' ? a[key] : 0.5;
    const bv = typeof b[key] === 'number' ? b[key] : 0.5;
    sum += weight * Math.pow(av - bv, 2);
    weightSum += weight;
  });

  return clamp(1 - Math.sqrt(sum / weightSum), 0, 1);
}

function scoreBudget(userBudget, cityBudget) {
  const budget = Number(userBudget) || 500;
  if (budget >= cityBudget) {
    return clamp(1 - (budget - cityBudget) / 1800, 0.78, 1);
  }
  return clamp(budget / cityBudget, 0.18, 0.88);
}

function scoreDays(days, minDays, maxDays) {
  const value = Number(days) || 4;
  if (value >= minDays && value <= maxDays) {
    return 1;
  }
  if (value < minDays) {
    return clamp(1 - (minDays - value) * 0.22, 0.35, 0.9);
  }
  return clamp(1 - (value - maxDays) * 0.08, 0.64, 0.95);
}

function scoreAvoid(avoid = [], riskFlags = []) {
  let penalty = 0;
  avoid.forEach(item => {
    if (riskFlags.includes(AVOID_TO_RISK[item])) {
      penalty += 0.16;
    }
  });
  return clamp(1 - penalty, 0.36, 1);
}

function scoreMap(profile, city) {
  const typeSet = new Set((city.pois || []).map(poi => poi.type));
  const diversity = clamp(typeSet.size / 12, 0.4, 1);
  const density = clamp((city.pois || []).length / Math.max((Number(profile.days) || 4) * 2, 4), 0.5, 1);
  return clamp((city.transportScore || 0.5) * 0.45 + diversity * 0.3 + density * 0.25, 0, 1);
}

function scoreCommunity(avoid = [], city) {
  let score = 0.92;
  const risks = city.riskFlags || [];
  avoid.forEach(item => {
    if (risks.includes(AVOID_TO_RISK[item])) {
      score -= 0.12;
    }
  });
  return clamp(score, 0.48, 0.96);
}

function scoreResilience(profile, city) {
  const cityVector = enrichCityVector(city);
  let resilience = cityVector.transit * 0.32 + cityVector.weatherFlex * 0.25 + cityVector.bookingEase * 0.25 + cityVector.lowCrowd * 0.18;

  if (profile.companion === 'family') {
    resilience = resilience * 0.85 + (cityVector.comfort || 0.5) * 0.15;
  }

  return clamp(resilience, 0, 1);
}

function scorePoiDiversity(city) {
  const typeSet = new Set((city.pois || []).map(poi => poi.type));
  return clamp(typeSet.size / 12, 0.45, 1);
}

const INTEREST_POI_TYPES = {
  nature: ['自然', '海边'],
  oldtown: ['街区', '古镇', '建筑', '文化', '民俗'],
  art: ['艺术', '建筑'],
  coffee: ['餐饮', '街区', '生活'],
  food: ['餐饮', '街区', '生活'],
  photo: ['建筑', '自然', '海边', '街区', '古镇', '艺术'],
  museum: ['博物馆', '文化'],
  hidden: ['民俗', '街区', '古镇', '文化', '建筑']
};

function scoreInterestFit(interests, city) {
  const selected = Array.isArray(interests) ? interests : [];
  if (!selected.length) return 0.5;
  const pois = (city.pois || []).filter(poi => poi.type && poi.type !== '交通');
  const scores = selected.map(interest => {
    const acceptedTypes = INTEREST_POI_TYPES[interest] || [];
    const matched = pois.filter(poi => acceptedTypes.includes(poi.type)).length;
    return clamp(matched / 4, 0, 1);
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function bestDimension(userVector, cityVector, wantBest) {
  return Object.keys(TRAIT_WEIGHTS).map(key => {
    const userValue = userVector[key] || 0.5;
    const cityValue = cityVector[key] || 0.5;
    const diff = Math.abs(userValue - cityValue);
    const sharedStrength = (userValue + cityValue) / 2;
    const score = wantBest ? (1 - diff) * sharedStrength * TRAIT_WEIGHTS[key] : diff * TRAIT_WEIGHTS[key];
    return { key, diff, score };
  }).sort((a, b) => b.score - a.score)[0];
}

function inferPersona(vector) {
  const data = getData();
  const allRanked = data.personas
    .map(persona => ({ persona, score: scorePersonaMatch(vector, persona) }))
    .sort((a, b) => b.score - a.score);
  const best = allRanked[0];
  const secondary = allRanked[1] || allRanked[0];
  const gap = best.score - secondary.score;

  return {
    id: best.persona.id,
    name: best.persona.name,
    summary: best.persona.summary,
    score: round(best.score, 3),
    secondary: {
      id: secondary.persona.id,
      name: secondary.persona.name,
      score: round(secondary.score, 3)
    },
    alternates: allRanked.slice(0, 4).map(item => ({
      id: item.persona.id,
      name: item.persona.name,
      score: round(item.score, 3)
    })),
    confidenceMargin: round(gap, 3),
    blendLabel: gap < 0.045 ? `${best.persona.name} × ${secondary.persona.name}` : best.persona.name
  };
}

function scorePersonaMatch(vector, persona) {
  const data = getData();
  const match = persona.match || {};
  const base = similarity(vector, match);
  const anchors = Object.keys(data.traitLabels)
    .map(key => {
      const target = typeof match[key] === 'number' ? match[key] : 0.5;
      return { key, target, weight: Math.abs(target - 0.5) };
    })
    .filter(item => item.weight >= 0.14);

  if (!anchors.length) {
    return round(base, 4);
  }

  let anchorTotal = 0;
  let anchorWeight = 0;
  let contradiction = 0;
  anchors.forEach(item => {
    const actual = typeof vector[item.key] === 'number' ? vector[item.key] : 0.5;
    const closeness = 1 - Math.abs(actual - item.target);
    anchorTotal += closeness * item.weight;
    anchorWeight += item.weight;
    if ((item.target > 0.68 && actual < 0.38) || (item.target < 0.32 && actual > 0.62)) {
      contradiction += item.weight;
    }
  });

  const anchorScore = anchorWeight ? anchorTotal / anchorWeight : base;
  const contradictionScore = anchorWeight ? 1 - clamp(contradiction / anchorWeight, 0, 1) : 1;
  return round(clamp(base * 0.68 + anchorScore * 0.24 + contradictionScore * 0.08, 0, 1), 4);
}

function buildCityReason(profile, vector, city, best) {
  const data = getData();
  const bestLabel = data.traitLabels[best.key] || best.key;
  const intel = getCityIntel(city);
  const routeRole = intel.routeRoles && intel.routeRoles.length ? `；在这条路线里主要承担“${intel.routeRoles[0]}”` : '';
  const moodLabel = profile.moodLabel || MOOD_LABELS[profile.mood] || '当前旅行状态';
  const interestText = (profile.interests || []).slice(0, 2).map(key => INTEREST_LABELS[key]).filter(Boolean).join('、');
  return `你的核心信号是${moodLabel}${interestText ? `，并明确选择了${interestText}` : ''}；${city.name}在${bestLabel}和实际地点覆盖上更贴合，它的${city.bestFor.slice(0, 2).join('、')}有数据支撑${routeRole}。`;
}

function buildWatchOut(profile, city, worst) {
  const data = getData();
  const matchedRisks = profile.avoid.filter(item => (city.riskFlags || []).includes(AVOID_TO_RISK[item]));

  if (matchedRisks.length) {
    return `你介意${matchedRisks.map(item => AVOID_LABELS[item]).join('、')}，这里需要错峰或替换路线。`;
  }

  return city.notFor || `在${data.traitLabels[worst.key] || worst.key}上需要二次确认。`;
}

function getCityIntel(city) {
  const data = getData();
  const scores = data.cityIntelligence && data.cityIntelligence.cityScores ? data.cityIntelligence.cityScores : {};
  return city.intelligence || scores[city.id] || {
    transportEase: city.transportScore || 0.6,
    costStability: clamp(1 - (city.dailyBudget || 500) / 1000, 0.35, 0.82),
    poiDepth: clamp((city.pois || []).length / 25, 0.45, 0.90),
    weatherBackup: 0.58,
    bookingFriction: 0.5,
    crowdRisk: 0.55,
    routeValue: 0.55,
    growthSignal: 0.62,
    routeRoles: [],
    whenToUse: '作为通用目的地候选，需要更多地图和手账数据校准。',
    downgradeIf: '当预算、拥挤、预约或交通任一硬约束明显冲突时降权。',
    evidence: city.platformSignals || []
  };
}

function weightedAverage(items) {
  const result = items.reduce((acc, item) => {
    acc.total += item.value * item.weight;
    acc.weight += item.weight;
    return acc;
  }, { total: 0, weight: 0 });
  return result.weight ? clamp(result.total / result.weight, 0, 1) : 0.5;
}

function getCityScoreWeights(profile, vector) {
  const weights = profile.routeGoal === 'multiCityValue'
    ? {
      persona: 0.18, budget: 0.1, days: 0.09, avoid: 0.09,
      map: 0.08, community: 0.06, resilience: 0.08, diversity: 0.04,
      evidence: 0.17, route: 0.14, growth: 0.03
    }
    : {
      persona: 0.4, budget: 0.1, days: 0.08, avoid: 0.12,
      map: 0.04, community: 0.03, resilience: 0.06, diversity: 0.03,
      evidence: 0.08, route: 0.01, growth: 0.05
    };
  if (profile.budget < 420) {
    weights.budget += 0.04;
    weights.evidence += 0.02;
    weights.persona -= 0.03;
    weights.community += 0.01;
  }
  if (profile.journalMemory && profile.journalMemory.entryCount) {
    weights.growth += 0.04;
    weights.avoid += 0.02;
    weights.evidence += 0.01;
    weights.persona -= 0.03;
  }
  if (vector.lowCrowd > 0.64 || (profile.avoid || []).includes('crowd')) {
    weights.avoid += 0.03;
    weights.community += 0.02;
    weights.resilience += 0.01;
    weights.persona -= 0.03;
  }
  if (profile.companion === 'family') {
    weights.resilience += 0.05;
    weights.map += 0.02;
    weights.route -= 0.02;
    weights.persona -= 0.03;
  }

  let sum = 0;
  Object.keys(weights).forEach(key => {
    weights[key] = Math.max(weights[key], 0.01);
    sum += weights[key];
  });
  Object.keys(weights).forEach(key => {
    weights[key] /= sum;
  });
  return weights;
}

function scoreCityEvidence(profile, city, intel) {
  const avoid = profile.avoid || [];
  const routeMode = profile.routeGoal === 'multiCityValue';
  const budgetStrict = profile.budget < 420;
  const wantsLowCrowd = avoid.includes('crowd');
  const hatesEarly = avoid.includes('early');
  const bookingEase = 1 - (intel.bookingFriction || 0.5);
  const crowdSafe = 1 - (intel.crowdRisk || 0.5);

  return weightedAverage([
    { value: intel.transportEase || city.transportScore || 0.6, weight: routeMode ? 1.25 : 0.9 },
    { value: intel.costStability || 0.6, weight: budgetStrict ? 1.45 : 0.95 },
    { value: intel.poiDepth || 0.6, weight: 1.05 },
    { value: intel.weatherBackup || 0.58, weight: 0.7 },
    { value: bookingEase, weight: hatesEarly ? 1.1 : 0.7 },
    { value: crowdSafe, weight: wantsLowCrowd ? 1.3 : 0.65 },
    { value: intel.routeValue || 0.55, weight: routeMode ? 1.35 : 0.35 }
  ]);
}

function scoreRouteFit(profile, city, intel) {
  if (profile.routeGoal !== 'multiCityValue') {
    return weightedAverage([
      { value: intel.transportEase || city.transportScore || 0.6, weight: 0.55 },
      { value: intel.poiDepth || 0.6, weight: 0.3 },
      { value: intel.costStability || 0.6, weight: 0.15 }
    ]);
  }

  const longTransitPenalty = profile.avoid.includes('longTransit') ? (1 - (intel.transportEase || city.transportScore || 0.6)) * 0.16 : 0;
  return clamp(weightedAverage([
    { value: intel.routeValue || 0.55, weight: 0.48 },
    { value: intel.transportEase || city.transportScore || 0.6, weight: 0.28 },
    { value: intel.costStability || 0.6, weight: 0.16 },
    { value: 1 - (intel.crowdRisk || 0.55), weight: 0.08 }
  ]) - longTransitPenalty, 0, 1);
}

function scoreGrowthFit(profile, vector, city, intel) {
  const memory = profile.journalMemory || {};
  const memoryBoost = memory.entryCount ? clamp(memory.confidence || 0.5, 0.45, 0.9) : 0.44;
  const calmNeed = vector.lowCrowd > 0.62 ? (1 - (intel.crowdRisk || 0.55)) : 0.6;
  return weightedAverage([
    { value: intel.growthSignal || 0.62, weight: 0.4 },
    { value: memoryBoost, weight: memory.entryCount ? 0.25 : 0.12 },
    { value: profile.routeGoal === 'multiCityValue' ? (intel.routeValue || 0.55) : 0.55, weight: 0.2 },
    { value: calmNeed, weight: 0.15 }
  ]);
}

function analyzePersonaTensions(profile, vector, memory) {
  const tensions = [];
  const interests = profile.interests || [];
  const avoid = profile.avoid || [];
  const journal = memory || {};
  const add = (title, detail, action, severity = 'medium') => tensions.push({ title, detail, action, severity });

  if (vector.restoration > 0.66 && vector.pace > 0.56) {
    add('想恢复，但又想多玩', '你的动机里同时出现低消耗和高收获，连续赶路会让推荐失真。', '每 2-3 天设置半天缓冲，把核心 POI 控制在每天 2 个以内。', 'high');
  }
  if (avoid.includes('crowd') && (interests.includes('food') || interests.includes('local') || interests.includes('oldtown'))) {
    add('喜欢烟火气，但不喜欢人挤人', '美食、老街和在地生活常常伴随排队与噪声。', '优先找非核心商圈、早晚错峰、居民区餐饮，而不是只追热门店。', 'high');
  }
  if (avoid.includes('early') && (interests.includes('museum') || interests.includes('art') || interests.includes('culture'))) {
    add('喜欢高信息量场馆，但不适合硬早起', '预约型场馆如果安排太满，会和你的节奏偏好冲突。', '提前锁票，把故宫/国博这类大体量场馆拆日，不在同一天叠加第二个重 POI。');
  }
  if (profile.routeGoal === 'multiCityValue' && avoid.includes('longTransit')) {
    add('想多城高性价比，但怕长交通', '路线不是越多城市越值，连续跨城会吞掉体验。', '只保留顺路节点，删掉绕行城市，并给北京前后各留半天机动。', 'high');
  }
  if (profile.days >= 14 && vector.lowCrowd > 0.62) {
    add('长线旅行需要稳定阈值', '两三周路线里，拥挤和行李搬运会不断累积。', '把返程城市做成低风险收束，而不是继续加高强度打卡。');
  }
  if (journal.entryCount && journal.contradictions && journal.contradictions.length) {
    add('手账已经修正问卷', journal.contradictions[0], '下一次推荐应优先相信真实记录，而不是只相信冷启动问卷。', 'high');
  }

  return tensions.slice(0, 5);
}

function buildGrowthProfile(profile, vector, memory, tensions) {
  const journal = memory || { entryCount: 0, confidence: 0, evidence: [], contradictions: [] };
  const entryCount = journal.entryCount || 0;
  let stage = '冷启动';
  let stageKey = 'cold';
  if (entryCount >= 6) {
    stage = '稳定画像';
    stageKey = 'stable';
  } else if (entryCount >= 3) {
    stage = '手账校准';
    stageKey = 'calibrated';
  } else if (entryCount >= 1) {
    stage = '早期学习';
    stageKey = 'learning';
  }

  const freeTextScore = profile.freeText ? 0.16 : 0.05;
  const journalScore = entryCount ? clamp((journal.confidence || 0.48) * 0.28, 0.12, 0.26) : 0.03;
  const routeScore = profile.routeGoal ? 0.14 : 0.05;
  const conflictPenalty = Math.min((tensions || []).length * 0.015, 0.06);
  const confidence = round(clamp(0.34 + Math.min((profile.interests || []).length, 5) * 0.028 + Math.min((profile.avoid || []).length, 5) * 0.025 + freeTextScore + journalScore + routeScore - conflictPenalty, 0.38, 0.92), 2);
  const confidenceParts = [
    { label: '问卷选择', value: clamp(0.3 + Math.min((profile.interests || []).length, 5) * 0.07, 0.3, 0.72) },
    { label: '原话解析', value: profile.freeText ? 0.78 : 0.18 },
    { label: '手账证据', value: entryCount ? clamp(journal.confidence || 0.48, 0.48, 0.92) : 0.1 },
    { label: '路线约束', value: profile.routeGoal ? 0.82 : 0.24 },
    { label: '冲突识别', value: (tensions || []).length ? 0.76 : 0.36 }
  ];
  const nextDataNeeded = [];
  if (!entryCount) {
    nextDataNeeded.push('至少记录 3 天手账：一个喜欢的点、一个消耗点、一次真实交通体感。');
  } else if (entryCount < 3) {
    nextDataNeeded.push('继续补足不同城市/不同阶段的记录，避免只从单日情绪判断人格。');
  }
  if ((profile.avoid || []).includes('crowd')) {
    nextDataNeeded.push('记录每个热门点的人流体感，用来判断你能接受的排队阈值。');
  }
  if (profile.routeGoal === 'multiCityValue') {
    nextDataNeeded.push('记录每段跨城后的能量变化，用来自动删减返程节点。');
  }
  if (!nextDataNeeded.length) {
    nextDataNeeded.push('继续记录正向体验，系统会逐步区分一时喜欢和长期偏好。');
  }

  return {
    stage,
    stageKey,
    confidence,
    entryCount,
    confidenceParts,
    nextDataNeeded: nextDataNeeded.slice(0, 3),
    readableSummary: `${stage}阶段：系统会把问卷当作起点，把手账当作校准，把路线约束当作落地边界。`
  };
}

function buildDecisionAudit(profile, vector, persona, cities, routeExperiment, tensions, growthProfile) {
  growthProfile = growthProfile || buildGrowthProfile(profile, vector, profile.journalMemory, tensions || []);
  const constraints = [
    { label: '出发', value: profile.origin || '未指定' },
    { label: '目的', value: profile.destination || (profile.routeGoal ? '多城路线' : '开放推荐') },
    { label: '时长', value: `${profile.days} 天` },
    { label: '日均预算', value: `${profile.budget} 元` },
    { label: '成长阶段', value: growthProfile.stage }
  ];
  const cityRows = cities.slice(0, 4).map(item => {
    const intel = item.intelligence || getCityIntel(item.city);
    return {
      city: item.city.name,
      score: item.matchPercent,
      decision: item.matchPercent >= 88 ? '主推' : item.matchPercent >= 82 ? '可选' : '备选',
      metrics: [
        { key: 'persona', label: '人格贴合', value: item.breakdown.persona, note: item.bestFit },
        { key: 'value', label: '性价比', value: item.breakdown.evidence, note: intel.whenToUse },
        { key: 'route', label: '路线效率', value: item.breakdown.route, note: (intel.routeRoles || []).slice(0, 2).join(' / ') || '通用目的地' },
        { key: 'risk', label: '风险控制', value: item.breakdown.avoid, note: item.watchOut },
        { key: 'growth', label: '成长价值', value: item.breakdown.growth, note: '能帮助画像分辨长期偏好' }
      ],
      evidence: (intel.evidence || []).slice(0, 3),
      downgradeIf: intel.downgradeIf,
      reason: item.reason
    };
  });
  const routeRows = routeExperiment && routeExperiment.primary && routeExperiment.primary.nodes
    ? routeExperiment.primary.nodes.map(node => ({
      city: node.city,
      role: node.role,
      stay: node.stay,
      value: node.value || 72,
      efficiency: node.efficiency || 70,
      cost: node.cost || 68,
      fatigue: node.fatigue || 45,
      proof: node.proof || node.reason
    }))
    : [];

  return {
    title: profile.routeGoal === 'multiCityValue' ? '路线证据优先的决策板' : '城市证据优先的决策板',
    subtitle: '总分只决定排序，真正的推荐要同时看约束、证据、风险和成长价值。',
    constraints,
    cityRows,
    routeRows,
    tensions: tensions || [],
    growth: growthProfile,
    persona: persona.name
  };
}

function scoreCity(profile, vector, city) {
  const cityVector = enrichCityVector(city);
  const vectorSimilarity = similarity(vector, cityVector);
  const interestFit = scoreInterestFit(profile.interests, city);
  const personaScore = (profile.interests || []).length
    ? vectorSimilarity * 0.72 + interestFit * 0.28
    : vectorSimilarity;
  const budgetScore = scoreBudget(profile.budget, city.dailyBudget);
  const daysScore = scoreDays(profile.days, city.minDays, city.maxDays);
  const avoidScore = scoreAvoid(profile.avoid, city.riskFlags || []);
  const mapScore = scoreMap(profile, city);
  const communityScore = scoreCommunity(profile.avoid, city);
  const resilienceScore = scoreResilience(profile, city);
  const diversityScore = scorePoiDiversity(city);
  const intelligence = getCityIntel(city);
  const evidenceScore = scoreCityEvidence(profile, city, intelligence);
  const routeScore = scoreRouteFit(profile, city, intelligence);
  const growthScore = scoreGrowthFit(profile, vector, city, intelligence);
  const weightModel = getCityScoreWeights(profile, vector);
  let total = personaScore * weightModel.persona + budgetScore * weightModel.budget + daysScore * weightModel.days + avoidScore * weightModel.avoid + mapScore * weightModel.map + communityScore * weightModel.community + resilienceScore * weightModel.resilience + diversityScore * weightModel.diversity + evidenceScore * weightModel.evidence + routeScore * weightModel.route + growthScore * weightModel.growth;
  if (profile.destination && city.name === profile.destination) {
    total = total * 0.88 + 0.12;
  }
  if (profile.routeGoal === 'multiCityValue' && routeScore < 0.64) {
    total -= 0.035;
  }
  const best = bestDimension(vector, cityVector, true);
  const worst = bestDimension(vector, cityVector, false);

  return {
    city,
    cityVector,
    totalScore: round(total, 4),
    matchPercent: Math.round(58 + clamp(total, 0, 1) * 40),
    breakdown: {
      persona: round(personaScore, 2),
      intent: round(interestFit, 2),
      budget: round(budgetScore, 2),
      days: round(daysScore, 2),
      avoid: round(avoidScore, 2),
      map: round(mapScore, 2),
      community: round(communityScore, 2),
      resilience: round(resilienceScore, 2),
      diversity: round(diversityScore, 2),
      evidence: round(evidenceScore, 2),
      route: round(routeScore, 2),
      growth: round(growthScore, 2),
      weights: Object.keys(weightModel).reduce((acc, key) => {
        acc[key] = round(weightModel[key], 3);
        return acc;
      }, {})
    },
    intelligence,
    reason: buildCityReason(profile, vector, city, best),
    bestFit: getData().traitLabels[best.key] || best.key,
    watchOut: buildWatchOut(profile, city, worst)
  };
}

function buildItinerary(profile, city, scoredCity) {
  const days = clamp(Number(profile.days) || 4, city.minDays, Math.min(city.maxDays, 5));
  const planDays = [];

  for (let index = 0; index < days; index += 1) {
    const first = city.pois[(index * 2) % city.pois.length];
    const second = city.pois[(index * 2 + 1) % city.pois.length];
    const backup = city.pois[(index * 2 + 2) % city.pois.length];

    planDays.push({
      day: index + 1,
      title: index === 0 ? '抵达与校准节奏' : index === days - 1 ? '收束与低风险补完' : '深入一个区域',
      slots: [
        { time: '10:00', text: `${first.name} · ${first.tip}` },
        { time: '12:30', text: `在住宿区域附近用餐，减少跨区移动：${city.stayZone}` },
        { time: '15:00', text: `${second.name} · ${second.tip}` },
        { time: '19:30', text: index % 2 === 0 ? '保留自由晚间，不强排第二轮打卡。' : '按体力选择夜景、咖啡或回酒店整理照片。' }
      ],
      backup: `雨天或临时疲惫时，替换为：${backup.name}。`
    });
  }

  return {
    city,
    scoredCity,
    days: planDays,
    budgetEstimate: {
      localDaily: city.dailyBudget,
      totalLocal: city.dailyBudget * days,
      userDaily: Number(profile.budget) || 500
    },
    guardrails: city.platformSignals.concat([
      '每天最多安排 2 个核心 POI，其余作为可选，不把旅行变成清单。',
      '智能体不可用时仍按本地知识库生成，用户不需要感知降级。'
    ])
  };
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

function fitVariantToDays(variant, requestedDays) {
  const shortTripRemovals = requestedDays <= 15
    ? variant.id === 'balanced'
      ? new Set(['广州'])
      : variant.id === 'explorer'
        ? new Set(['广州', '杭州'])
        : new Set()
    : new Set();
  const fitted = {
    ...variant,
    nodes: variant.nodes.filter(item => !shortTripRemovals.has(item.city)).map(item => ({ ...item }))
  };
  const ratio = requestedDays / 18;
  const bufferDays = fitted.id === 'explorer'
    ? (requestedDays >= 20 ? 0.5 : 0)
    : roundHalf(clamp(fitted.bufferDays * ratio, 1, fitted.id === 'steady' ? 2 : 2.5));
  const targetActiveDays = requestedDays - bufferDays;
  const currentActiveDays = () => fitted.nodes.reduce((sum, item) => sum + Number(item.stay || 0), 0);
  const minimumStay = item => {
    if (item.city === '茂名') return 0.5;
    if (item.city === '北京') return fitted.id === 'steady' ? 4 : 3.5;
    if (fitted.id !== 'explorer') return 1.5;
    return 1;
  };

  let guard = 0;
  while (currentActiveDays() - targetActiveDays >= 0.49 && guard < 100) {
    const candidate = fitted.nodes
      .filter(item => Number(item.stay) - minimumStay(item) >= 0.49)
      .sort((a, b) => {
        const aPriority = a.city === '北京' ? 2 : ['南京', '泉州'].includes(a.city) ? 1 : 0;
        const bPriority = b.city === '北京' ? 2 : ['南京', '泉州'].includes(b.city) ? 1 : 0;
        return aPriority - bPriority || (Number(b.stay) - minimumStay(b)) - (Number(a.stay) - minimumStay(a));
      })[0];
    if (!candidate) break;
    candidate.stay = roundHalf(Number(candidate.stay) - 0.5);
    guard += 1;
  }

  const expansionOrder = ['北京', '南京', '泉州', '长沙', '武汉', '洛阳', '杭州', '广州', '济南'];
  guard = 0;
  while (targetActiveDays - currentActiveDays() >= 0.49 && guard < 100) {
    const cityName = expansionOrder[guard % expansionOrder.length];
    const candidate = fitted.nodes.find(item => item.city === cityName);
    if (candidate) candidate.stay = roundHalf(Number(candidate.stay) + 0.5);
    guard += 1;
  }

  fitted.bufferDays = bufferDays;
  fitted.activeDays = round(currentActiveDays(), 1);
  fitted.totalDays = round(fitted.activeDays + fitted.bufferDays, 1);
  const stopCount = fitted.nodes.filter(item => item.city !== '茂名').length;
  fitted.tagline = fitted.id === 'steady'
    ? `${stopCount} 个重点城市，留得下完整体验`
    : fitted.id === 'balanced'
      ? `${stopCount} 个城市，不走回头路也不靠半日打卡`
      : `${stopCount} 个城市，接近 ${requestedDays} 天的换城上限`;
  return fitted;
}

const TRAVEL_STYLE_RULES = {
  value: {
    label: '性价比优先', costMultiplier: 0.82, minimumDaily: 330,
    summary: '先把预算留给真正想体验的部分，住宿与餐饮优先稳定、交通便利。',
    stay: '青年旅舍或经济型酒店，优先地铁可达的非核心区。',
    dining: '本地小吃与高口碑平价正餐，不为网红排队溢价买单。',
    experiences: '免费开放空间、低价门票和一项最想做的付费体验。'
  },
  balanced: {
    label: '舒适平衡', costMultiplier: 1, minimumDaily: 520,
    summary: '用稳定的住宿和餐饮换取更少的临时取舍，保留经典体验。',
    stay: '舒适型酒店或品质民宿，优先交通节点附近且隔音稳定的房源。',
    dining: '一顿口碑正餐搭配在地小店，预留少量咖啡与夜间体验。',
    experiences: '经典景点与一项预约型体验，避免把同类项目重复堆叠。'
  },
  depth: {
    label: '深度体验', costMultiplier: 1.16, minimumDaily: 760,
    summary: '减少打卡密度，把预算放到有在地感的住宿、餐饮和完整体验上。',
    stay: '特色民宿或精品酒店，围绕一个街区连续停留而非频繁换房。',
    dining: '预留特色餐厅或地方料理，至少安排一顿需要提前确认的用餐。',
    experiences: '文化场馆、演出或小团体验择一深入，给现场留出完整时段。'
  },
  premium: {
    label: '品质享受', costMultiplier: 1.38, minimumDaily: 1100,
    summary: '以更高的住宿、餐饮和体验质量降低摩擦，但仍不牺牲路线效率。',
    stay: '高品质酒店或设计感住宿，优先位置、睡眠质量和服务稳定性。',
    dining: '预约型餐厅与当地代表性餐饮结合，保留可替换的备选位。',
    experiences: '高质量导览、演出或私享体验按日程留出余量，不做价格虚高的填充。'
  }
};

function getBudgetStatus(costRange, hardMax, totalBudget) {
  const ceiling = Number(hardMax || totalBudget || 0);
  if (!ceiling) return '费用待出发日前核验';
  if (Number(costRange.min) > ceiling) return '预计超过上限';
  if (Number(costRange.max) > ceiling) return '需要取舍';
  return '在预算上限内';
}

function buildTravelStyleModel(profile = {}) {
  const style = TRAVEL_STYLE_RULES[profile.travelStyle] || TRAVEL_STYLE_RULES.balanced;
  const days = Math.max(1, Number(profile.days) || 1);
  const ceiling = Number(profile.hardMax || profile.totalBudget || 0);
  const dailyCeiling = ceiling ? Math.round(ceiling / days) : 0;
  const needsTradeoff = dailyCeiling > 0 && dailyCeiling < style.minimumDaily;
  return {
    id: profile.travelStyle in TRAVEL_STYLE_RULES ? profile.travelStyle : 'balanced',
    label: style.label,
    costMultiplier: style.costMultiplier,
    summary: style.summary,
    stay: style.stay,
    dining: style.dining,
    experiences: style.experiences,
    status: needsTradeoff ? '预算需要取舍' : '预算匹配',
    budgetNote: needsTradeoff
      ? `当前日均上限约 ${dailyCeiling} 元，低于“${style.label}”的常见档位；系统保留你的偏好，但会优先删去低价值溢价项，不突破上限。`
      : dailyCeiling
        ? `当前日均上限约 ${dailyCeiling} 元；价格会随出发日和预订窗口变化，保存前仍需核验。`
        : '尚未给出预算上限，结果按当前风格估算，建议在保存前补充可接受上限。'
  };
}

function scaleCostRange(costRange, multiplier) {
  return {
    min: Math.round((Number(costRange?.min || 0) * multiplier) / 100) * 100,
    max: Math.round((Number(costRange?.max || 0) * multiplier) / 100) * 100
  };
}

function applyTravelStyleToRoutePlan(routePlan, profile = {}) {
  if (!routePlan) return routePlan;
  const travelStyle = buildTravelStyleModel(profile);
  const hardMax = Number(profile.hardMax || routePlan.budgetModel?.hardMax || 0);
  const totalBudget = Number(profile.totalBudget || routePlan.budgetModel?.totalBudget || 0);
  (routePlan.variants || []).forEach(variant => {
    const styledCost = scaleCostRange(variant.costRange, travelStyle.costMultiplier);
    variant.costRange = styledCost;
    variant.budgetStatus = getBudgetStatus(styledCost, hardMax, totalBudget);
    if (variant.routeAssessment) {
      variant.routeAssessment.costRange = styledCost;
      variant.routeAssessment.styleMultiplier = travelStyle.costMultiplier;
    }
  });
  if (routePlan.primary) {
    routePlan.primary = (routePlan.variants || []).find(item => item.id === routePlan.primary.id) || routePlan.primary;
  }
  routePlan.budgetModel = {
    ...(routePlan.budgetModel || {}),
    travelStyle
  };
  return routePlan;
}

function buildRouteExperiment(profile) {
  if (profile.routeGoal !== 'multiCityValue') {
    return null;
  }

  const days = clamp(Number(profile.days) || 18, 14, 21);
  const budget = Number(profile.budget) || 320;
  const totalBudget = Number(profile.totalBudget) || budget * days;
  const hardMax = Number(profile.hardMax) || null;
  const node = (city, stay, role, reason, transport) => ({ city, stay, role, reason, transport });
  let variants = [
    {
      id: 'steady',
      name: '少搬行李版',
      tagline: '5 个重点城市，留得下完整体验',
      valueScore: 89,
      efficiencyScore: 86,
      moveCount: 6,
      bufferDays: 1.5,
      tradeoff: '城市更少，但每天更完整；适合不想把两周过成连续退房。',
      nodes: [
        node('茂名', 0.5, '出发', '第一天只负责出发和票务缓冲。', '经广州接入北上主线，不在广州额外住宿。'),
        node('长沙', 2.5, '第一段兴奋点', '餐饮、夜游和城市密度高，住两晚以上才值得停。', '茂名经广州转长沙，优先一次联程。'),
        node('武汉', 2, '江城停留', '博物馆、江滩和街区都能应对天气变化。', '长沙到武汉为成熟短途高铁段。'),
        node('北京', 5, '主目的地', '给预约型景点和临时调整留出完整空间。', '武汉直达北京，避免再插入纯中转城市。'),
        node('南京', 3, '返程主停留', '历史、博物馆和夜游密度稳定，三天不必赶。', '北京到南京走东线高铁。'),
        node('泉州', 3, '在地收尾', '比厦门更稳地控制预算，也更符合避开溢价的要求。', '南京南下泉州，长段交通安排在白天。'),
        node('茂名', 0.5, '回家', '最后半天只做返程，不再追加景点。', '泉州经深圳或广州回茂名，按当日票价选择。')
      ]
    },
    {
      id: 'balanced',
      name: '平衡高效版',
      tagline: '7 个城市，不走回头路但也不靠半日打卡',
      valueScore: 93,
      efficiencyScore: 90,
      moveCount: 8,
      bufferDays: 2,
      tradeoff: '比少搬行李版多两站，仍保留 2 天机动；这是城市数量和旅行完整度的平衡点。',
      nodes: [
        node('茂名', 0.5, '出发', '第一天只做出发和票务缓冲。', '茂名到广州，接入北上主线。'),
        node('广州', 1, '华南枢纽', '只做早茶或老城轻体验，不把枢纽玩成主目的地。', '按总价选择广州南或广州站。'),
        node('长沙', 2, '低预算高密度', '餐饮和夜间体验能快速形成旅行记忆点。', '广州到长沙，高铁班次密集。'),
        node('武汉', 1.5, '中段缓冲', '用江滩或博物馆承接北上过程，不追求全玩。', '长沙到武汉为短交通段。'),
        node('洛阳', 2, '历史补强', '真正停在洛阳，不把郑州包装成景点。', '武汉到洛阳按直达或郑州一次换乘校验。'),
        node('北京', 4, '主目的地', '先锁住宿和预约，再反推前后车次。', '洛阳到北京，预留半天机动。'),
        node('南京', 2, '返程主停留', '文化与城市体验稳定，承担返程的主要内容。', '北京到南京走东线。'),
        node('泉州', 2.5, '闽南收尾', '避开厦门旺季溢价，用在地街区完成收尾。', '南京南下泉州，出发前再次校验长段车次。'),
        node('茂名', 0.5, '回家', '最后一天只做返程。', '泉州经深圳或广州回茂名。')
      ]
    },
    {
      id: 'explorer',
      name: '尽量多城版',
      tagline: '9 个城市，已经接近 18 天的换城上限',
      valueScore: 87,
      efficiencyScore: 80,
      moveCount: 10,
      bufferDays: 0,
      tradeoff: '城市最多，但没有天气和抢票缓冲；任何一段延误都要立即删城。',
      nodes: [
        node('茂名', 0.5, '出发', '只负责离开茂名。', '茂名到广州。'),
        node('广州', 1, '枢纽短停', '只保留一顿饭和一段老城。', '广州接长沙。'),
        node('长沙', 1.5, '高密度短停', '夜间体验为主，不安排远郊。', '广州到长沙。'),
        node('武汉', 1.5, '江城短停', '博物馆与江滩二选一。', '长沙到武汉。'),
        node('洛阳', 2, '历史重点', '两天是保住记忆点的最低停留。', '武汉到洛阳。'),
        node('北京', 4, '主目的地', '目的地不能再压缩，否则会变成只到过。', '洛阳到北京。'),
        node('济南', 1, '返程短停', '仅在车次顺、住宿便宜时保留。', '北京到济南。'),
        node('南京', 2, '返程重点', '用博物馆与夜游形成第二个稳定停留。', '济南到南京。'),
        node('杭州', 2, '江南停留', '旺季价格过高时无条件替换为苏州。', '南京到杭州。'),
        node('泉州', 2, '闽南收尾', '预算优先，不再叠加厦门。', '杭州南下泉州。'),
        node('茂名', 0.5, '回家', '不再经广州停留游玩。', '泉州经深圳或广州回茂名。')
      ]
    }
  ];
  const data = getData();
  const routeKnowledge = data.cityIntelligence && data.cityIntelligence.routeNodes ? data.cityIntelligence.routeNodes : [];
  variants = variants.map(variant => fitVariantToDays(variant, days));
  const steadyStopCount = variants.find(item => item.id === 'steady').nodes.filter(item => item.city !== '茂名').length;
  const balancedVariant = variants.find(item => item.id === 'balanced');
  const balancedStopCount = balancedVariant.nodes.filter(item => item.city !== '茂名').length;
  balancedVariant.tradeoff = `比少搬行李版多 ${Math.max(0, balancedStopCount - steadyStopCount)} 站，仍保留 ${balancedVariant.bufferDays} 天机动；这是城市数量和旅行完整度的平衡点。`;
  variants.forEach(variant => {
    variant.nodes = variant.nodes.map(routeNode => {
      const matched = routeKnowledge.find(item => item.city === routeNode.city || routeNode.city.includes(item.city) || item.city.includes(routeNode.city));
      return matched ? { ...routeNode, value: matched.value, efficiency: matched.efficiency, cost: matched.cost, fatigue: matched.fatigue, proof: matched.proof, mapQuery: matched.mapQuery } : routeNode;
    });
    const assessment = assessIntercityRoute(variant.nodes, {
      origin: profile.origin || '茂名',
      totalDays: variant.totalDays,
      bufferDays: variant.bufferDays,
      totalBudget,
      hardMax
    });
    const strategyFit = variant.id === 'balanced'
      ? 4
      : variant.id === 'steady' && (profile.avoid || []).some(item => ['longTransit', 'early'].includes(item))
        ? 4
        : variant.id === 'explorer' && days >= 20
          ? 1
          : 0;
    variant.routeAssessment = assessment;
    variant.valueScore = assessment.scores.value;
    variant.efficiencyScore = assessment.scores.efficiency;
    variant.moveCount = assessment.moveCount;
    variant.costRange = assessment.costRange;
    variant.budgetStatus = assessment.budgetStatus;
    variant.selectionScore = assessment.scores.overall + strategyFit;
  });
  const primary = [...variants].sort((a, b) => b.selectionScore - a.selectionScore)[0] || variants[0];
  variants.forEach(variant => { variant.recommended = variant.id === primary.id; });
  const lodgingCityLimit = Math.max(3, Math.floor(days / 2));
  const primaryStops = primary.nodes.filter(item => item.city !== (profile.origin || '茂名'));
  const shortStayCities = primaryStops
    .filter(item => Number(item.stay || 0) <= 1 && item.city !== (profile.destination || '目的地'))
    .map(item => item.city);
  const higherCostCities = primaryStops
    .filter(item => Number.isFinite(Number(item.cost)) && Number(item.cost) < 65)
    .map(item => item.city);
  const routeCities = new Set(primaryStops.map(item => item.city));
  const lodgingAdvice = higherCostCities.length
    ? `${higherCostCities.join('、')}优先住轨道交通可达的非核心区；其余城市用交通便利的青年旅舍或经济型住宿稳定均价。`
    : '优先选择交通便利的青年旅舍或经济型住宿，不为景区门口溢价买单。';
  const substitutionAdvice = [];
  if (routeCities.has('杭州')) substitutionAdvice.push('杭州住宿明显超预算时换成苏州');
  if (routeCities.has('厦门')) substitutionAdvice.push('厦门旺季溢价过高时换成泉州');
  if (routeCities.has('泉州')) substitutionAdvice.push('泉州保留在地街区住宿，不再额外叠加周边热门海滨城市');
  const budgetCutAdvice = substitutionAdvice.length
    ? `预算变紧：${substitutionAdvice.join('；')}；${lodgingAdvice}`
    : `预算变紧：${lodgingAdvice}`;
  const shortStayAdvice = shortStayCities.length
    ? `先检查只停 ${shortStayCities.join('、')} 的短停段；若车次不顺就直接删掉，再删与前后体验重复的城市。`
    : '先删与前后体验重复的城市，不压缩目的地的完整停留。';
  const routeBudgetRisk = routeCities.has('泉州')
    ? `预算日均约 ${budget} 元时，泉州保留在地街区即可，不再叠加周边热门海滨城市的旺季住宿成本。`
    : higherCostCities.length
      ? `预算日均约 ${budget} 元时，${higherCostCities.join('、')}的住宿最需要提前锁价。`
      : `预算日均约 ${budget} 元时，优先控制住宿位置和临时交通溢价。`;

  const routePlan = {
    title: `从${profile.origin || '出发地'}出发，${profile.destination || '目的地'}之后有三种返程走法`,
    summary: `先决定你愿意换多少次住宿，再决定城市数量。三条路线都保留${profile.destination || '目的地'}，也都避免原路返回。`,
    origin: profile.origin || '茂名',
    destination: profile.destination || '',
    totalDays: days,
    selectedVariantId: primary.id,
    budgetModel: {
      daily: budget,
      totalBudget,
      hardMax,
      hotelStrategy: lodgingAdvice
    },
    variants,
    primary,
    redFlags: [
      `${days} 天内超过 ${lodgingCityLimit} 个住宿城市后，新增城市带来的体验通常低于搬行李和换乘成本。`,
      `${profile.destination || '目的地'}的住宿和预约是最大风险，先锁目的地停留，再倒推前后城市。`,
      routeBudgetRisk,
      '如果连续两段车程超过 5 小时，中间城市必须降级为短停，不要硬塞景点。'
    ],
    cutPlan: [
      shortStayAdvice,
      budgetCutAdvice,
      '天气或票务失控：直接切到少搬行李版，不用重新做整份计划。'
    ]
  };
  return applyTravelStyleToRoutePlan(routePlan, profile);
}

function diversify(scored, count) {
  const picked = [];
  const clusters = new Set();

  scored.forEach(item => {
    if (picked.length >= count) {
      return;
    }
    if (!clusters.has(item.city.cluster) || picked.length < 2) {
      picked.push(item);
      clusters.add(item.city.cluster);
    }
  });

  scored.forEach(item => {
    if (picked.length < count && !picked.some(selected => selected.city.id === item.city.id)) {
      picked.push(item);
    }
  });

  return picked;
}

function includeRequiredCity(cities, scored, profile) {
  if (!profile.destination || cities.some(item => item.city.name === profile.destination)) {
    return cities;
  }
  const required = scored.find(item => item.city.name === profile.destination);
  if (!required) {
    return cities;
  }
  return cities.slice(0, 3).concat(required).sort((a, b) => {
    if (a.city.name === profile.destination) {
      return -1;
    }
    if (b.city.name === profile.destination) {
      return 1;
    }
    return b.totalScore - a.totalScore;
  });
}

function buildInsights(profile, vector, persona, cities, routeExperiment, tensions, growthProfile) {
  const insights = [
    `你的主画像是“${persona.blendLabel || persona.name}”，置信度来自核心动机、场景偏好、避雷项、原话和锚点维度交叉验证。`
  ];

  if (persona.secondary && persona.secondary.name !== persona.name) {
    insights.push(`次级画像接近“${persona.secondary.name}”，说明系统会按混合倾向处理你，而不是把你锁死在单一人格。`);
  }

  if (vector.restoration > 0.68 && vector.pace > 0.6) {
    insights.push('你同时想恢复又想高效，系统会避免把行程排成连续赶路。');
  }

  if (profile.avoid.includes('crowd')) {
    insights.push('你明确排斥拥挤，推荐排序已降低强网红城市和高排队 POI 的权重。');
  }

  if (profile.budget < 360) {
    insights.push('预算偏克制，模型优先选择日均消费稳定、公共交通可覆盖的城市。');
  }

  if (routeExperiment) {
    insights.push('这次不是单目的地问题，系统已切换到多城路线模式，同时计算去程、返程、删减策略和预算压力。');
  }

  if (profile.journalMemory && profile.journalMemory.entryCount) {
    insights.push('手账记忆正在校正问卷：系统会优先相信旅行中真实出现的疲惫、惊喜和踩雷。');
  }

  if (tensions && tensions.length) {
    insights.push(`系统识别到 ${tensions.length} 个偏好冲突，推荐会先处理“${tensions[0].title}”，避免路线看起来丰富但实际消耗过高。`);
  }

  if (growthProfile) {
    insights.push(`当前处于“${growthProfile.stage}”，后续会用手账继续校准，而不是把这次问卷当成永久标签。`);
  }

  insights.push(`当前 Top 1 是 ${cities[0].city.name}，不是因为单项最高，而是人格、预算、天数、避雷和地图密度综合最稳。`);
  return insights.slice(0, 6);
}

function plan(profile = {}) {
  const data = getData();
  const normalized = normalizeProfile(profile);
  const vector = buildVector(normalized);
  const scored = data.cities.map(city => scoreCity(normalized, vector, city)).sort((a, b) => b.totalScore - a.totalScore);
  const cities = includeRequiredCity(diversify(scored, 4), scored, normalized);
  const persona = inferPersona(vector);
  const routeExperiment = buildRouteExperiment(normalized);
  const personaTensions = analyzePersonaTensions(normalized, vector, normalized.journalMemory);
  const growthProfile = buildGrowthProfile(normalized, vector, normalized.journalMemory, personaTensions);
  const decisionAudit = buildDecisionAudit(normalized, vector, persona, cities, routeExperiment, personaTensions, growthProfile);
  const confidence = round(clamp((routeExperiment ? 0.86 : 0.82) * 0.72 + growthProfile.confidence * 0.28, 0.5, 0.94), 2);

  return {
    profile: normalized,
    vector,
    confidence,
    persona,
    personaTensions,
    growthProfile,
    decisionAudit,
    journalMemory: normalized.journalMemory,
    insights: buildInsights(normalized, vector, persona, cities, routeExperiment, personaTensions, growthProfile),
    cities,
    selectedItinerary: buildItinerary(normalized, cities[0].city, cities[0]),
    routeExperiment,
    mode: 'server-local-fallback',
    enhancedByAgent: false,
    userVisibleFailure: false
  };
}

function getCityByName(cityName) {
  const data = getData();
  return data.cities.find(city => city.name === cityName || city.id === cityName || city.centerQuery === cityName) || null;
}

module.exports = {
  getData,
  plan,
  getCityByName,
  buildVector,
  buildRouteExperiment,
  buildJournalMemory,
  buildTravelStyleModel,
  applyTravelStyleToRoutePlan
};
