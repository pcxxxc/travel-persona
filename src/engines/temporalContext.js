/**
 * 旅格 Travel Persona · 时间感知引擎（Temporal Context Engine）
 *
 * 解决问题：当前系统完全不考虑季节、昼夜、天气交互效应，同一城市冬天和夏天评分一样。
 * 本引擎为城市维度向量引入时间维度调制，实现工业级的时间感知推荐。
 *
 * 调制链路（四层）：
 * 1. 季节调制（SEASONAL_MODIFIERS）→ 城市在特定季节对主维度的结构性偏移
 * 2. 天气交互（WEATHER_INTERACTION）→ 实时天气数据对出行体验的动态影响
 * 3. 节假日人流（HOLIDAY_CROWD_MODIFIER）→ 法定假日/周末/调休工作日的拥挤度与预订难度调整
 * 4. 昼夜偏好（DAY_NIGHT_PATTERN）→ 用户出行时段偏好与城市昼夜活动供给的匹配度
 *
 * 数据来源：
 * - 季节调制表：基于城市气候特征与旅游淡旺季经验标注
 * - 天气数据：Open-Meteo API（weatherService.js 标准化格式）
 * - 节假日信息：chinese-days（holidayService.js → getTravelFriendliness）
 *
 * 对应总纲：3.3 时间感知维度、18.3 天气数据降级策略
 * 维度键与 personaEngine.js TRAIT_KEYS 保持一致（16维）
 */

// ========== 工具函数 ==========

/**
 * 将数值限制在 [min, max] 区间
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 保留指定小数位（默认 3 位）
 */
function round(value, digits = 3) {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/**
 * 深拷贝维度向量（浅拷贝即可，值为基本类型）
 */
function copyVector(vector) {
  const result = {};
  for (const key of Object.keys(vector || {})) {
    result[key] = vector[key];
  }
  return result;
}

/**
 * 将向量中所有值 clamp 到 [min, max] 并 round 到 3 位小数
 */
function clampVector(vector, min = 0.05, max = 0.95) {
  const result = {};
  for (const key of Object.keys(vector || {})) {
    const val = typeof vector[key] === 'number' ? vector[key] : 0.5;
    result[key] = round(clamp(val, min, max));
  }
  return result;
}

// ========== 季节定义 ==========

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

/**
 * 月份 → 季节字符串
 * spring:  3-5月
 * summer:  6-8月
 * autumn:  9-11月
 * winter:  12-2月
 *
 * @param {number} month - 月份（1-12）
 * @returns {string} 季节字符串
 */
function getSeason(month) {
  const m = Number(month);
  if (m >= 3 && m <= 5) return 'spring';
  if (m >= 6 && m <= 8) return 'summer';
  if (m >= 9 && m <= 11) return 'autumn';
  return 'winter'; // 12, 1, 2
}

/**
 * 从日期字符串提取季节
 * 支持 'YYYY-MM-DD'、'YYYY/MM/DD'、ISO 等格式
 * 无法解析时回退到当前月份
 *
 * @param {string} dateString - 日期字符串
 * @returns {string} 季节字符串
 */
function getSeasonFromDate(dateString) {
  if (!dateString) {
    return getSeason(new Date().getMonth() + 1);
  }
  const d = new Date(dateString);
  if (isNaN(d.getTime())) {
    return getSeason(new Date().getMonth() + 1);
  }
  return getSeason(d.getMonth() + 1);
}

// ========== 1. SEASONAL_MODIFIERS（季节调制表）==========
//
// 每座城市的每个季节对主维度的结构性偏移。
// 调制值范围：-0.15 ~ +0.15
// 未定义的城市-季节-维度组合返回 0（无调制）
//
// 标注依据：
// - 气候数据（温度、降水、日照时数）
// - 旅游淡旺季人流规律
// - 自然景观季节性（花季、红叶、雪景等）
// - 城市POI季节适配度（户外vs室内占比）

const SEASONAL_MODIFIERS = {
  // ---------- 自然疗愈型 ----------
  dali: {
    spring:  { nature: +0.08, comfort: +0.05 },
    summer:  { weatherFlex: -0.06, lowCrowd: -0.08 },
    autumn:  { nature: +0.12, aesthetics: +0.06 },
    winter:  { comfort: -0.05, weatherFlex: -0.08 }
  },
  lijiang: {
    spring:  { nature: +0.06, aesthetics: +0.05 },
    summer:  { weatherFlex: -0.08, lowCrowd: -0.10 },
    autumn:  { nature: +0.08, weatherFlex: +0.04 },
    winter:  { comfort: -0.06, weatherFlex: -0.05 }
  },
  xiamen: {
    spring:  { comfort: +0.06, aesthetics: +0.04 },
    summer:  { weatherFlex: -0.10, comfort: -0.06 },
    autumn:  { nature: +0.06, aesthetics: +0.08, weatherFlex: +0.05 },
    winter:  { comfort: +0.04, weatherFlex: -0.03 }
  },
  qinghaihu: {
    spring:  { comfort: -0.08, weatherFlex: -0.06 },
    summer:  { nature: +0.15, aesthetics: +0.08 },
    autumn:  { nature: +0.05, comfort: -0.06 },
    winter:  { comfort: -0.15, weatherFlex: -0.12, nature: -0.08 }
  },

  // ---------- 城市漫游型 ----------
  chengdu: {
    spring:  { aesthetics: +0.05, comfort: +0.04 },
    summer:  { comfort: -0.08, pace: -0.04 },
    autumn:  { aesthetics: +0.06, comfort: +0.05 },
    winter:  { comfort: -0.06, weatherFlex: -0.05 }
  },
  suzhou: {
    spring:  { aesthetics: +0.10, nature: +0.06 },
    summer:  { comfort: -0.08, weatherFlex: -0.05 },
    autumn:  { aesthetics: +0.06, weatherFlex: +0.03 },
    winter:  { comfort: -0.06, aesthetics: -0.04 }
  },
  hangzhou: {
    spring:  { aesthetics: +0.10, nature: +0.07 },
    summer:  { comfort: -0.08, weatherFlex: -0.06 },
    autumn:  { aesthetics: +0.08, weatherFlex: +0.04 },
    winter:  { comfort: -0.06, weatherFlex: -0.04 }
  },
  beijing: {
    spring:  { weatherFlex: -0.05 },
    summer:  { weatherFlex: -0.10, lowCrowd: -0.10 },
    autumn:  { aesthetics: +0.12, weatherFlex: +0.06 },
    winter:  { comfort: -0.08, weatherFlex: -0.12 }
  },

  // ---------- 烟火气探索型 ----------
  chongqing: {
    spring:  { comfort: +0.05, aesthetics: +0.04 },
    summer:  { comfort: -0.12, pace: -0.06, weatherFlex: -0.06 },
    autumn:  { aesthetics: +0.05, comfort: +0.04 },
    winter:  { weatherFlex: -0.06, aesthetics: -0.03 }
  },
  xian: {
    spring:  { weatherFlex: -0.04, aesthetics: +0.04 },
    summer:  { comfort: -0.08, weatherFlex: -0.06 },
    autumn:  { aesthetics: +0.08, weatherFlex: +0.05 },
    winter:  { comfort: -0.07, weatherFlex: -0.08 }
  },
  guangzhou: {
    spring:  { weatherFlex: -0.05, aesthetics: +0.03 },
    summer:  { comfort: -0.10, pace: -0.05, weatherFlex: -0.08 },
    autumn:  { aesthetics: +0.06, comfort: +0.05 },
    winter:  { comfort: +0.05, weatherFlex: +0.03 }
  },
  changsha: {
    spring:  { weatherFlex: -0.05, aesthetics: +0.04 },
    summer:  { comfort: -0.10, pace: -0.05 },
    autumn:  { aesthetics: +0.06, comfort: +0.04 },
    winter:  { comfort: -0.06, weatherFlex: -0.05 }
  },

  // ---------- 高效打卡型 ----------
  shanghai: {
    spring:  { aesthetics: +0.06, weatherFlex: +0.03 },
    summer:  { comfort: -0.08, weatherFlex: -0.06, lowCrowd: -0.05 },
    autumn:  { aesthetics: +0.07, weatherFlex: +0.05 },
    winter:  { comfort: -0.06, weatherFlex: -0.05 }
  },
  shenzhen: {
    spring:  { comfort: +0.04, aesthetics: +0.03 },
    summer:  { weatherFlex: -0.08, comfort: -0.05 },
    autumn:  { aesthetics: +0.05, weatherFlex: +0.04 },
    winter:  { comfort: +0.05, weatherFlex: +0.03 }
  },
  nanjing: {
    spring:  { aesthetics: +0.07, nature: +0.05 },
    summer:  { comfort: -0.08, weatherFlex: -0.05 },
    autumn:  { aesthetics: +0.08, weatherFlex: +0.04 },
    winter:  { comfort: -0.06, weatherFlex: -0.05 }
  },

  // ---------- 灵感采集型 ----------
  qingdao: {
    spring:  { weatherFlex: -0.04, comfort: +0.03 },
    summer:  { nature: +0.06, lowCrowd: -0.08 },
    autumn:  { aesthetics: +0.07, comfort: +0.06 },
    winter:  { comfort: -0.06, weatherFlex: -0.06, nature: -0.04 }
  },
  dalian: {
    spring:  { weatherFlex: -0.03, comfort: +0.03 },
    summer:  { nature: +0.05, lowCrowd: -0.06 },
    autumn:  { aesthetics: +0.06, comfort: +0.05 },
    winter:  { comfort: -0.07, weatherFlex: -0.06, nature: -0.04 }
  },
  jingdezhen: {
    spring:  { aesthetics: +0.05, weatherFlex: +0.03 },
    summer:  { comfort: -0.08, weatherFlex: -0.06 },
    autumn:  { aesthetics: +0.06, comfort: +0.04 },
    winter:  { comfort: -0.05, weatherFlex: -0.04 }
  },
  huangshan: {
    spring:  { nature: +0.06, aesthetics: +0.05 },
    summer:  { lowCrowd: -0.10, weatherFlex: -0.06 },
    autumn:  { aesthetics: +0.10, nature: +0.06 },
    winter:  { aesthetics: +0.05, comfort: -0.10, nature: -0.03 }
  },

  // ---------- 数字游民试居型 ----------
  dali_digital: {
    spring:  { nature: +0.08, comfort: +0.05, workation: +0.04 },
    summer:  { weatherFlex: -0.06, lowCrowd: -0.08 },
    autumn:  { nature: +0.12, aesthetics: +0.06, workation: +0.05 },
    winter:  { comfort: -0.05, weatherFlex: -0.08 }
  }
};

/**
 * 获取城市在指定季节对指定维度的调制值
 *
 * @param {string} cityId - 城市ID（如 'dali'）
 * @param {string} season - 季节（'spring'|'summer'|'autumn'|'winter'）
 * @param {string} traitKey - 维度键（如 'nature'）
 * @returns {number} 调制值（-0.15 ~ +0.15），未定义的组合返回 0
 */
function getSeasonalModifier(cityId, season, traitKey) {
  const cityMods = SEASONAL_MODIFIERS[cityId];
  if (!cityMods) return 0;

  const seasonMods = cityMods[season];
  if (!seasonMods) return 0;

  const value = seasonMods[traitKey];
  if (typeof value !== 'number') return 0;

  return round(clamp(value, -0.15, 0.15));
}

// ========== 2. WEATHER_INTERACTION（天气交互效应）==========
//
// 基于 Open-Meteo 天气数据对维度向量进行动态调制。
// 天气数据格式（weatherService.js 标准化输出）：
//   { forecast: [{ textDay, tempMax, tempMin, precipitation, precipProb, weatherCode, windSpeed }],
//     current: { temp, windSpeed, text, weatherCode } }

const WEATHER_INTERACTION = {
  // 降水概率 > 60%：户外体验下降，室内备选价值上升
  highPrecipProb: {
    threshold: 60,
    effects: { weatherFlex: -0.10, comfort: -0.05, indoorBackup: +0.10 }
  },
  // 温度 > 35°C：酷热，舒适度与节奏大幅下降
  extremeHeat: {
    threshold: 35,
    effects: { comfort: -0.12, pace: -0.08, nature: -0.05 }
  },
  // 温度 < 0°C：严寒，舒适度与天气弹性下降
  freezingCold: {
    threshold: 0,
    effects: { comfort: -0.10, pace: -0.05, weatherFlex: -0.08 }
  },
  // 风速 > 30km/h：大风，舒适度与交通体验下降
  strongWind: {
    threshold: 30,
    effects: { comfort: -0.06, transit: -0.04 }
  },
  // 晴天（WMO code=0）：视觉与自然体验提升
  sunnyDay: {
    code: 0,
    effects: { aesthetics: +0.06, nature: +0.04 }
  }
};

/**
 * 从天气数据中提取关键信号
 * 优先使用 forecast[0]（出行日预报），current 作为回退
 */
function extractWeatherSignals(weatherData) {
  const forecast = weatherData.forecast || [];
  const first = forecast[0] || {};
  const current = weatherData.current || {};

  return {
    tempMax: first.tempMax !== undefined ? first.tempMax
           : (current.temp !== undefined ? current.temp : null),
    tempMin: first.tempMin !== undefined ? first.tempMin : null,
    temp: current.temp !== undefined ? current.temp
        : (first.tempMax !== undefined ? first.tempMax : null),
    precipProb: first.precipProb !== undefined ? first.precipProb
              : (current.precipProb !== undefined ? current.precipProb : null),
    windSpeed: current.windSpeed !== undefined ? current.windSpeed
             : (first.windSpeed !== undefined ? first.windSpeed : null),
    weatherCode: current.weatherCode !== undefined ? current.weatherCode
               : (first.weatherCode !== undefined ? first.weatherCode : null),
    text: current.text || first.textDay || null
  };
}

/**
 * 根据天气数据计算维度增量（不应用，仅返回 delta 对象）
 */
function computeWeatherDeltas(weatherData) {
  const deltas = {};
  if (!weatherData) return deltas;

  const signals = extractWeatherSignals(weatherData);

  // 降水概率 > 60%
  if (signals.precipProb !== null && signals.precipProb > WEATHER_INTERACTION.highPrecipProb.threshold) {
    const fx = WEATHER_INTERACTION.highPrecipProb.effects;
    deltas.weatherFlex = (deltas.weatherFlex || 0) + fx.weatherFlex;
    deltas.comfort = (deltas.comfort || 0) + fx.comfort;
    deltas.indoorBackup = (deltas.indoorBackup || 0) + fx.indoorBackup;
  }

  // 温度 > 35°C（使用日最高温）
  if (signals.tempMax !== null && signals.tempMax > WEATHER_INTERACTION.extremeHeat.threshold) {
    const fx = WEATHER_INTERACTION.extremeHeat.effects;
    deltas.comfort = (deltas.comfort || 0) + fx.comfort;
    deltas.pace = (deltas.pace || 0) + fx.pace;
    deltas.nature = (deltas.nature || 0) + fx.nature;
  }

  // 温度 < 0°C（使用日最低温）
  if (signals.tempMin !== null && signals.tempMin < WEATHER_INTERACTION.freezingCold.threshold) {
    const fx = WEATHER_INTERACTION.freezingCold.effects;
    deltas.comfort = (deltas.comfort || 0) + fx.comfort;
    deltas.pace = (deltas.pace || 0) + fx.pace;
    deltas.weatherFlex = (deltas.weatherFlex || 0) + fx.weatherFlex;
  }

  // 风速 > 30km/h
  if (signals.windSpeed !== null && signals.windSpeed > WEATHER_INTERACTION.strongWind.threshold) {
    const fx = WEATHER_INTERACTION.strongWind.effects;
    deltas.comfort = (deltas.comfort || 0) + fx.comfort;
    deltas.transit = (deltas.transit || 0) + fx.transit;
  }

  // 晴天（WMO code=0）
  if (signals.weatherCode !== null && signals.weatherCode === WEATHER_INTERACTION.sunnyDay.code) {
    const fx = WEATHER_INTERACTION.sunnyDay.effects;
    deltas.aesthetics = (deltas.aesthetics || 0) + fx.aesthetics;
    deltas.nature = (deltas.nature || 0) + fx.nature;
  }

  // Round all deltas
  for (const key of Object.keys(deltas)) {
    deltas[key] = round(deltas[key]);
  }

  return deltas;
}

/**
 * 应用天气调制到维度向量
 *
 * @param {Object} traitVector - 城市维度向量（16维）
 * @param {Object} weatherData - 天气数据（Open-Meteo 标准格式）
 * @returns {Object} 调制后的向量副本（不修改原向量），所有值 clamp 到 [0.05, 0.95]
 */
function applyWeatherModifier(traitVector, weatherData) {
  const result = copyVector(traitVector);

  if (!weatherData) {
    return clampVector(result);
  }

  const deltas = computeWeatherDeltas(weatherData);

  for (const [key, delta] of Object.entries(deltas)) {
    // 对于向量中不存在的键（如 indoorBackup），以中性值 0.5 初始化
    if (typeof result[key] !== 'number') {
      result[key] = 0.5;
    }
    result[key] += delta;
  }

  return clampVector(result);
}

// ========== 3. HOLIDAY_CROWD_MODIFIER（节假日人流调制）==========
//
// 节假日信息格式（holidayService.js → getTravelFriendliness）：
//   { travelFriendliness: 'low'|'medium'|'high', reason: string, date: string }
//
// 友好度分级：
// - low（法定假日 / 工作日需请假）：人流高峰，拥挤度上升，预订困难
// - medium（周末）：客流量中等，轻度影响
// - high（调休工作日）：出行人数少，反而更舒适

const HOLIDAY_CROWD_MODIFIER = {
  // 法定假日：景区人流量大
  low: {
    lowCrowd: -0.15,
    social: +0.08,
    bookingEase: -0.10,
    budget: -0.06
  },
  // 周末：客流量中等
  medium: {
    lowCrowd: -0.06,
    bookingEase: -0.04
  },
  // 调休工作日：出行人数相对较少
  high: {
    lowCrowd: +0.08,
    bookingEase: +0.06
  }
};

/**
 * 应用节假日人流调制到维度向量
 *
 * @param {Object} traitVector - 城市维度向量（16维）
 * @param {Object} holidayInfo - 节假日信息 { travelFriendliness, reason }
 * @returns {Object} 调制后的向量副本（不修改原向量），所有值 clamp 到 [0.05, 0.95]
 */
function applyHolidayModifier(traitVector, holidayInfo) {
  const result = copyVector(traitVector);

  if (!holidayInfo || !holidayInfo.travelFriendliness) {
    return clampVector(result);
  }

  const effects = HOLIDAY_CROWD_MODIFIER[holidayInfo.travelFriendliness];
  if (!effects) {
    return clampVector(result);
  }

  for (const [key, delta] of Object.entries(effects)) {
    if (typeof result[key] === 'number') {
      result[key] += delta;
    }
  }

  return clampVector(result);
}

// ========== 4. DAY_NIGHT_PATTERN（昼夜活动偏好）==========
//
// 评估用户出行时段偏好与城市昼夜活动供给的匹配度。
// nightLife / morningActivity 分数从城市 POI 开放时间和维度向量推导。

const DAY_NIGHT_PATTERN = {
  // 偏好键 → 推导依据
  nightlife: {
    description: '夜生活偏好',
    primaryTrait: 'social',
    poiKeywords: ['22:', '23:', '00:', '01:', '02:', '03:'],
    tagKeyword: '夜生活'
  },
  earlybird: {
    description: '早起活动偏好',
    primaryTrait: 'pace',
    poiKeywords: ['05:', '06:', '07:'],
    tagKeyword: null
  }
};

/**
 * 从城市 POI 与维度向量推导夜生活分数
 * 综合 social 维度 + 深夜开放 POI 占比 + 情绪标签
 */
function deriveNightLifeScore(city) {
  const pois = city.pois || [];
  const traitVector = city.traitVector || city.dimensions || {};

  // 统计深夜开放 POI（22:00 以后或全天或跨午夜）
  let lateNightCount = 0;
  const lateKeywords = DAY_NIGHT_PATTERN.nightlife.poiKeywords;
  pois.forEach(poi => {
    const hours = poi.openHours || '';
    if (hours === '全天' || lateKeywords.some(k => hours.includes(k))) {
      lateNightCount++;
    }
  });

  // social 维度作为基底（0.6 权重）
  const socialScore = traitVector.social || 0.5;
  // 深夜 POI 占比加成（0.3 权重上限）
  const poiBonus = clamp(lateNightCount / Math.max(pois.length, 1) * 0.3, 0, 0.3);
  // 情绪标签加成
  const tags = city.emotionTags || [];
  const tagBonus = tags.includes('夜生活') ? 0.10 : 0;

  return clamp(socialScore * 0.6 + poiBonus + tagBonus + 0.15, 0.05, 0.95);
}

/**
 * 从城市 POI 与维度向量推导晨间活动分数
 * 综合 pace 维度 + 早起开放 POI 占比
 */
function deriveMorningActivityScore(city) {
  const pois = city.pois || [];
  const traitVector = city.traitVector || city.dimensions || {};

  // 统计早起开放 POI（08:00 以前或全天）
  let earlyCount = 0;
  const earlyKeywords = DAY_NIGHT_PATTERN.earlybird.poiKeywords;
  pois.forEach(poi => {
    const hours = poi.openHours || '';
    if (hours === '全天' || earlyKeywords.some(k => hours.includes(k))) {
      earlyCount++;
    }
  });

  // pace 维度作为基底（0.5 权重）
  const paceScore = traitVector.pace || 0.5;
  // 早起 POI 占比加成（0.3 权重上限）
  const poiBonus = clamp(earlyCount / Math.max(pois.length, 1) * 0.3, 0, 0.3);

  return clamp(paceScore * 0.5 + poiBonus + 0.20, 0.05, 0.95);
}

/**
 * 计算昼夜活动匹配度
 *
 * @param {Object} city - 城市记录（含 traitVector、pois、emotionTags）
 * @param {Object} tripIntent - 行程意图（含 preferences 数组）
 * @returns {{ dayFit: number, nightFit: number, overallFit: number }}
 */
function computeDayNightFit(city, tripIntent) {
  const preferences = (tripIntent && Array.isArray(tripIntent.preferences)) ? tripIntent.preferences : [];

  // 推导城市昼夜活动供给
  const nightLifeScore = deriveNightLifeScore(city);
  const morningActivityScore = deriveMorningActivityScore(city);

  // 基底匹配度
  let dayFit = morningActivityScore;
  let nightFit = nightLifeScore;

  // 根据用户偏好调制
  if (preferences.includes('nightlife')) {
    // 用户偏好夜生活 → 夜间匹配度加权提升
    nightFit = clamp(nightFit * 1.20, 0.05, 0.95);
  } else {
    // 无夜生活偏好 → 略微降低权重
    nightFit = clamp(nightFit * 0.90, 0.05, 0.95);
  }

  if (preferences.includes('earlybird')) {
    // 用户偏好早起 → 日间匹配度加权提升
    dayFit = clamp(dayFit * 1.20, 0.05, 0.95);
  }

  const overallFit = round((dayFit + nightFit) / 2);

  return {
    dayFit: round(dayFit),
    nightFit: round(nightFit),
    overallFit
  };
}

// ========== 5. 主入口：applyTemporalContext ==========

/**
 * 综合应用所有时间调制
 *
 * 调制顺序：季节调制 → 天气交互 → 节假日人流调制
 * 每层调制的增量独立记录，便于可解释性输出。
 *
 * @param {Object} city - 城市记录（含 traitVector、id、name）
 * @param {Object} tripContext - 行程上下文（含 date/startDate/season 等）
 * @param {Object|null} weatherData - 天气数据（null 时跳过天气调制）
 * @param {Object|null} holidayInfo - 节假日信息（null 时跳过节假日调制）
 * @returns {{
 *   adjustedVector: Object,
 *   modifiers: { seasonal: Object, weather: Object, holiday: Object },
 *   sources: Array
 * }}
 */
function applyTemporalContext(city, tripContext, weatherData, holidayInfo) {
  const sources = [];
  const modifiers = {
    seasonal: {},
    weather: {},
    holiday: {}
  };

  // 获取城市维度向量
  const originalVector = city.traitVector || city.dimensions || {};
  if (Object.keys(originalVector).length === 0) {
    return {
      adjustedVector: {},
      modifiers,
      sources: [{ type: 'error', message: '城市维度向量不存在' }]
    };
  }

  // 复制向量，后续依次叠加调制
  const adjusted = copyVector(originalVector);
  const cityId = city.id || city.cityId || '';
  const cityName = city.name || cityId;

  // -------- 1. 季节调制 --------
  const ctx = tripContext || {};
  const dateStr = ctx.date || ctx.startDate || ctx.travelDate || null;

  let season;
  if (ctx.season && SEASONS.includes(ctx.season)) {
    season = ctx.season;
  } else {
    season = getSeasonFromDate(dateStr);
  }

  const seasonalDeltas = {};
  const citySeasonMods = SEASONAL_MODIFIERS[cityId];
  if (citySeasonMods && citySeasonMods[season]) {
    const seasonMods = citySeasonMods[season];
    for (const [key, delta] of Object.entries(seasonMods)) {
      const clampedDelta = round(clamp(delta, -0.15, 0.15));
      seasonalDeltas[key] = clampedDelta;
      if (typeof adjusted[key] === 'number') {
        adjusted[key] += clampedDelta;
      }
    }
    sources.push({
      type: 'seasonal',
      city: cityId,
      season,
      traits: Object.keys(seasonalDeltas),
      details: `${cityName} ${season} 季节调制`
    });
  }
  modifiers.seasonal = seasonalDeltas;

  // -------- 2. 天气交互 --------
  if (weatherData) {
    const weatherDeltas = computeWeatherDeltas(weatherData);

    if (Object.keys(weatherDeltas).length > 0) {
      for (const [key, delta] of Object.entries(weatherDeltas)) {
        // 对于向量中不存在的键（如 indoorBackup），以中性值 0.5 初始化
        if (typeof adjusted[key] !== 'number') {
          adjusted[key] = 0.5;
        }
        adjusted[key] += delta;
      }
      modifiers.weather = { ...weatherDeltas };

      const signals = extractWeatherSignals(weatherData);
      sources.push({
        type: 'weather',
        traits: Object.keys(weatherDeltas),
        conditions: {
          tempMax: signals.tempMax,
          tempMin: signals.tempMin,
          precipProb: signals.precipProb,
          windSpeed: signals.windSpeed,
          weatherCode: signals.weatherCode,
          text: signals.text
        }
      });
    }
  }

  // -------- 3. 节假日人流调制 --------
  if (holidayInfo && holidayInfo.travelFriendliness) {
    const holidayEffects = HOLIDAY_CROWD_MODIFIER[holidayInfo.travelFriendliness];

    if (holidayEffects) {
      const holidayDeltas = {};
      for (const [key, delta] of Object.entries(holidayEffects)) {
        holidayDeltas[key] = round(delta);
        if (typeof adjusted[key] === 'number') {
          adjusted[key] += delta;
        }
      }
      modifiers.holiday = holidayDeltas;

      sources.push({
        type: 'holiday',
        friendliness: holidayInfo.travelFriendliness,
        reason: holidayInfo.reason || '',
        traits: Object.keys(holidayDeltas)
      });
    }
  }

  // -------- 最终 clamp & round --------
  const adjustedVector = clampVector(adjusted);

  return {
    adjustedVector,
    modifiers,
    sources
  };
}

// ========== 导出 ==========

module.exports = {
  // 常量
  SEASONS,
  SEASONAL_MODIFIERS,
  WEATHER_INTERACTION,
  HOLIDAY_CROWD_MODIFIER,
  DAY_NIGHT_PATTERN,

  // 季节函数
  getSeason,
  getSeasonFromDate,
  getSeasonalModifier,

  // 天气函数
  applyWeatherModifier,
  computeWeatherDeltas,
  extractWeatherSignals,

  // 节假日函数
  applyHolidayModifier,

  // 昼夜函数
  computeDayNightFit,
  deriveNightLifeScore,
  deriveMorningActivityScore,

  // 主入口
  applyTemporalContext,

  // 工具函数
  clamp,
  round,
  clampVector,
  copyVector
};
