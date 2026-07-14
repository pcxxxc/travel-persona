/**
 * 旅格 Travel Persona · 上下文引擎（v3）
 *
 * 旅行推荐不能脱离"当下"——
 * 冬天去青海湖和夏天去青海湖是完全不同的体验。
 *
 * 本引擎处理四类上下文信号：
 * 1. 季节性信号：当前月份 vs 城市最佳/避开季节
 * 2. 天气信号：实时天气 + 天气预报
 * 3. 事件信号：当地节庆、大型活动
 * 4. 趋势信号：社交媒体热度、搜索趋势
 *
 * 所有信号最终融合为一个「上下文乘数」，
 * 在评分阶段作为 multiplier 应用到匹配分上。
 *
 * 纯函数设计：上下文数据通过参数注入，无外部 API 调用。
 */

// ============================================================
// 一、季节性信号
// ============================================================

/**
 * 中国主要城市的月度适宜指数
 *
 * 数据来源：综合气候、旅游旺季、节庆活动
 * 0 = 极不适宜，1 = 最适宜
 *
 * 格式：{ cityId: { 1: 0.8, 2: 0.7, ... 12: 0.6 } }
 */
const SEASONALITY_MATRIX = {
  // 南方城市：冬季避寒胜地
  sanya:     { 1: 0.95, 2: 0.95, 3: 0.85, 4: 0.70, 5: 0.55, 6: 0.35, 7: 0.30, 8: 0.35, 9: 0.55, 10: 0.75, 11: 0.90, 12: 0.95 },
  xiamen:    { 1: 0.60, 2: 0.65, 3: 0.85, 4: 0.90, 5: 0.85, 6: 0.75, 7: 0.65, 8: 0.65, 9: 0.80, 10: 0.90, 11: 0.85, 12: 0.65 },
  // 高原城市：夏季最佳
  lasa:      { 1: 0.20, 2: 0.25, 3: 0.40, 4: 0.55, 5: 0.75, 6: 0.90, 7: 0.95, 8: 0.95, 9: 0.80, 10: 0.55, 11: 0.30, 12: 0.15 },
  qinghaihu: { 1: 0.10, 2: 0.10, 3: 0.25, 4: 0.50, 5: 0.75, 6: 0.95, 7: 0.95, 8: 0.85, 9: 0.65, 10: 0.30, 11: 0.10, 12: 0.05 },
  // 云南城市：四季如春
  dali:      { 1: 0.65, 2: 0.70, 3: 0.90, 4: 0.95, 5: 0.85, 6: 0.70, 7: 0.55, 8: 0.60, 9: 0.80, 10: 0.90, 11: 0.85, 12: 0.65 },
  lijiang:   { 1: 0.60, 2: 0.65, 3: 0.85, 4: 0.90, 5: 0.85, 6: 0.65, 7: 0.50, 8: 0.55, 9: 0.80, 10: 0.85, 11: 0.80, 12: 0.60 },
  kunming:   { 1: 0.80, 2: 0.85, 3: 0.90, 4: 0.90, 5: 0.85, 6: 0.75, 7: 0.70, 8: 0.75, 9: 0.80, 10: 0.85, 11: 0.80, 12: 0.80 },
  // 四川/重庆：避开酷暑
  chengdu:   { 1: 0.55, 2: 0.60, 3: 0.85, 4: 0.90, 5: 0.80, 6: 0.65, 7: 0.45, 8: 0.45, 9: 0.70, 10: 0.85, 11: 0.75, 12: 0.55 },
  chongqing: { 1: 0.50, 2: 0.55, 3: 0.80, 4: 0.85, 5: 0.75, 6: 0.55, 7: 0.30, 8: 0.30, 9: 0.65, 10: 0.80, 11: 0.70, 12: 0.50 },
  // 东部城市：春秋最佳
  hangzhou:  { 1: 0.45, 2: 0.55, 3: 0.90, 4: 0.95, 5: 0.85, 6: 0.70, 7: 0.55, 8: 0.55, 9: 0.85, 10: 0.90, 11: 0.80, 12: 0.50 },
  suzhou:    { 1: 0.45, 2: 0.55, 3: 0.90, 4: 0.95, 5: 0.85, 6: 0.65, 7: 0.50, 8: 0.50, 9: 0.80, 10: 0.90, 11: 0.75, 12: 0.50 },
  shanghai:  { 1: 0.50, 2: 0.55, 3: 0.80, 4: 0.85, 5: 0.80, 6: 0.65, 7: 0.50, 8: 0.50, 9: 0.80, 10: 0.90, 11: 0.85, 12: 0.60 },
  nanjing:   { 1: 0.45, 2: 0.55, 3: 0.85, 4: 0.90, 5: 0.80, 6: 0.60, 7: 0.45, 8: 0.50, 9: 0.80, 10: 0.90, 11: 0.80, 12: 0.50 },
  // 华北/东北
  beijing:   { 1: 0.35, 2: 0.45, 3: 0.70, 4: 0.85, 5: 0.90, 6: 0.80, 7: 0.65, 8: 0.70, 9: 0.90, 10: 0.85, 11: 0.60, 12: 0.35 },
  qingdao:   { 1: 0.30, 2: 0.35, 3: 0.55, 4: 0.70, 5: 0.80, 6: 0.90, 7: 0.95, 8: 0.95, 9: 0.85, 10: 0.70, 11: 0.45, 12: 0.30 },
  dalian:    { 1: 0.30, 2: 0.35, 3: 0.50, 4: 0.65, 5: 0.80, 6: 0.90, 7: 0.95, 8: 0.95, 9: 0.85, 10: 0.65, 11: 0.45, 12: 0.30 },
  // 中部
  changsha:  { 1: 0.50, 2: 0.55, 3: 0.75, 4: 0.80, 5: 0.75, 6: 0.55, 7: 0.35, 8: 0.35, 9: 0.75, 10: 0.85, 11: 0.75, 12: 0.55 },
  wuhan:     { 1: 0.45, 2: 0.50, 3: 0.80, 4: 0.85, 5: 0.75, 6: 0.55, 7: 0.30, 8: 0.30, 9: 0.75, 10: 0.85, 11: 0.75, 12: 0.50 },
  xian:      { 1: 0.40, 2: 0.50, 3: 0.80, 4: 0.85, 5: 0.85, 6: 0.75, 7: 0.55, 8: 0.60, 9: 0.80, 10: 0.85, 11: 0.65, 12: 0.40 },
  // 珠三角
  guangzhou: { 1: 0.70, 2: 0.65, 3: 0.70, 4: 0.70, 5: 0.60, 6: 0.50, 7: 0.45, 8: 0.45, 9: 0.65, 10: 0.85, 11: 0.90, 12: 0.80 },
  shenzhen:  { 1: 0.70, 2: 0.65, 3: 0.70, 4: 0.70, 5: 0.65, 6: 0.55, 7: 0.50, 8: 0.50, 9: 0.70, 10: 0.85, 11: 0.90, 12: 0.80 },
  zhuhai:    { 1: 0.65, 2: 0.60, 3: 0.70, 4: 0.75, 5: 0.65, 6: 0.50, 7: 0.45, 8: 0.45, 9: 0.65, 10: 0.85, 11: 0.90, 12: 0.75 },
  // 其他
  guilin:    { 1: 0.50, 2: 0.55, 3: 0.75, 4: 0.85, 5: 0.85, 6: 0.75, 7: 0.65, 8: 0.70, 9: 0.80, 10: 0.90, 11: 0.80, 12: 0.55 },
  quanzhou:  { 1: 0.65, 2: 0.65, 3: 0.80, 4: 0.85, 5: 0.75, 6: 0.60, 7: 0.50, 8: 0.55, 9: 0.80, 10: 0.90, 11: 0.85, 12: 0.70 }
};

// 默认季节性指数（未知城市）
const DEFAULT_SEASONALITY = { 1: 0.6, 2: 0.6, 3: 0.75, 4: 0.8, 5: 0.75, 6: 0.65, 7: 0.55, 8: 0.55, 9: 0.75, 10: 0.8, 11: 0.7, 12: 0.6 };

/**
 * 获取城市的季节性指数
 */
function getSeasonalityIndex(cityId, month) {
  const monthKey = ((month - 1) % 12) + 1;
  const matrix = SEASONALITY_MATRIX[cityId] || DEFAULT_SEASONALITY;
  return matrix[monthKey] || 0.5;
}

function getSeasonalityLabel(index) {
  if (index >= 0.85) return '最佳季节';
  if (index >= 0.7) return '适宜旅行';
  if (index >= 0.5) return '可以出行';
  if (index >= 0.3) return '不太推荐';
  return '建议避开';
}

// ============================================================
// 二、天气信号
// ============================================================

/**
 * 天气条件对旅行体验的影响
 *
 * @param {Object} weather - 天气数据 { condition, temp, humidity, wind }
 * @param {Object} city - 城市对象
 * @returns {Object} { impact, multiplier, description }
 */
function computeWeatherImpact(weather, city) {
  if (!weather) return { impact: 'unknown', multiplier: 1.0, description: '暂无天气数据' };

  const { condition, temp } = weather;
  const isNatureCity = (city.dimensions?.nature || 0) > 0.6;

  let multiplier = 1.0;
  let description = '';

  switch (condition) {
    case 'sunny':
    case 'clear':
      multiplier = isNatureCity ? 1.08 : 1.05;
      description = isNatureCity ? '晴天+自然风光=绝佳体验' : '晴朗天气，适合出行';
      break;
    case 'cloudy':
    case 'partly cloudy':
      multiplier = 1.0;
      description = '多云天气，不影响出行';
      break;
    case 'rain':
    case 'light rain':
      multiplier = isNatureCity ? 0.90 : 0.95;
      description = isNatureCity ? '雨天可能影响户外体验' : '小雨不影响城市探索';
      break;
    case 'heavy rain':
    case 'storm':
    case 'thunderstorm':
      multiplier = 0.80;
      description = '恶劣天气，建议调整行程或选择室内活动';
      break;
    case 'snow':
      multiplier = 1.05; // 雪景反而是加分项
      description = '雪景很美，注意保暖和交通';
      break;
    default:
      multiplier = 1.0;
      description = '';
  }

  // 温度修正
  if (temp !== undefined) {
    if (temp > 38) {
      multiplier -= 0.08;
      description += (description ? '；' : '') + '高温预警，注意防暑';
    } else if (temp < -10) {
      multiplier -= 0.08;
      description += (description ? '；' : '') + '极寒天气，注意保暖';
    }
  }

  return {
    impact: multiplier > 1 ? 'positive' : multiplier < 1 ? 'negative' : 'neutral',
    multiplier: parseFloat(Math.max(0.75, Math.min(1.15, multiplier)).toFixed(3)),
    description
  };
}

// ============================================================
// 三、事件/节庆信号
// ============================================================

/**
 * 中国主要城市年度节庆活动
 *
 * 格式：{ cityId: [{ name, month, impact, description }] }
 */
const CITY_EVENTS = {
  dali: [
    { name: '三月街', month: 4, impact: 1.08, description: '白族传统集市，赛马、对歌、商贸' },
    { name: '火把节', month: 7, impact: 1.05, description: '彝族和白族的传统火把节' }
  ],
  lasa: [
    { name: '藏历新年', month: 2, impact: 1.10, description: '藏区最盛大的节日，体验藏族文化的最佳时机' },
    { name: '雪顿节', month: 8, impact: 1.08, description: '晒大佛、藏戏表演、酸奶盛宴' }
  ],
  chengdu: [
    { name: '成都国际美食节', month: 9, impact: 1.05, description: '各国美食汇聚，适合美食爱好者' }
  ],
  harbin: [
    { name: '冰雪大世界', month: 1, impact: 1.12, description: '世界最大的冰雪主题乐园' }
  ],
  qingdao: [
    { name: '青岛国际啤酒节', month: 8, impact: 1.10, description: '亚洲最大的啤酒盛会' }
  ],
  suzhou: [
    { name: '苏州园林艺术节', month: 10, impact: 1.05, description: '园林文化展览和表演' }
  ],
  xian: [
    { name: '西安城墙灯会', month: 2, impact: 1.06, description: '古城墙上的新春灯会' }
  ],
  guilin: [
    { name: '桂林山水文化旅游节', month: 10, impact: 1.05, description: '山水实景演出和文化活动' }
  ]
};

/**
 * 查找城市在指定月份的节庆活动
 */
function findCityEvents(cityId, month) {
  const events = CITY_EVENTS[cityId] || [];
  return events
    .filter(e => e.month === month)
    .map(e => ({
      name: e.name,
      impact: e.impact,
      description: e.description
    }));
}

// ============================================================
// 四、趋势信号
// ============================================================

/**
 * 模拟社交媒体趋势热度
 *
 * 在实际部署中，这可以接入真实数据源（小红书搜索量、抖音话题热度等）
 * 当前使用简化的模型模拟趋势波动
 */
function computeTrendSignal(cityId, options = {}) {
  const {
    trendData = null,     // 真实趋势数据（未来接入）
    enableSynthetic = true // 是否使用合成数据
  } = options;

  // 如果有真实数据，直接用
  if (trendData && trendData[cityId] !== undefined) {
    return { trend: trendData[cityId], source: 'real' };
  }

  // 合成趋势（用于开发和测试）
  if (enableSynthetic) {
    // 基于城市 ID 的确定性"随机"值
    const hash = cityId.split('').reduce((h, c) => h + c.charCodeAt(0), 0);
    const baseTrend = (hash % 30) / 100 + 0.35; // 0.35 ~ 0.65
    return { trend: parseFloat(baseTrend.toFixed(2)), source: 'synthetic' };
  }

  return { trend: 0.5, source: 'default' };
}

// ============================================================
// 综合上下文计算
// ============================================================

/**
 * 计算某城市在当前上下文中的综合乘数
 *
 * @param {Object} city - 城市对象
 * @param {Object} context - 上下文数据
 * @param {number} context.month - 当前月份 (1-12)
 * @param {Object} context.weather - 天气数据 { [cityId]: { condition, temp } }
 * @param {Object} context.trendData - 趋势数据
 * @param {boolean} context.isHoliday - 是否节假日
 * @returns {Object} { multiplier, components, summary }
 */
function computeCityContext(city, context = {}) {
  const {
    month = new Date().getMonth() + 1,
    weather = {},
    trendData = null,
    isHoliday = false
  } = context;

  const components = {};
  let multiplier = 1.0;
  const notes = [];

  // 季节性
  const seasonIndex = getSeasonalityIndex(city.id, month);
  const seasonLabel = getSeasonalityLabel(seasonIndex);
  // 季节乘数：以 0.7 为基准（大多数城市在大多数时间都还好）
  const seasonMultiplier = 0.85 + seasonIndex * 0.2;
  components.seasonal = {
    index: seasonIndex,
    label: seasonLabel,
    multiplier: parseFloat(seasonMultiplier.toFixed(3))
  };
  multiplier *= seasonMultiplier;
  if (seasonLabel === '最佳季节') notes.push(`${month}月是${city.name}的最佳旅行季节`);
  if (seasonLabel === '建议避开') notes.push(`${month}月不太适合去${city.name}`);

  // 天气
  const cityWeather = weather[city.id] || null;
  const weatherImpact = computeWeatherImpact(cityWeather, city);
  components.weather = weatherImpact;
  multiplier *= weatherImpact.multiplier;
  if (weatherImpact.description) notes.push(weatherImpact.description);

  // 节庆
  const events = findCityEvents(city.id, month);
  if (events.length > 0) {
    const eventMultiplier = events.reduce((max, e) => Math.max(max, e.impact), 1);
    components.events = {
      events: events.map(e => e.name),
      multiplier: eventMultiplier
    };
    multiplier *= eventMultiplier;
    notes.push(`${month}月有${events.map(e => e.name).join('、')}`);
  }

  // 节假日
  if (isHoliday) {
    const popularity = city.popularity || 0.5;
    // 热门城市节假日拥挤，冷门城市反而更舒适
    const holidayImpact = 1 + (0.5 - popularity) * 0.15;
    components.holiday = { isHoliday: true, impact: parseFloat(holidayImpact.toFixed(3)) };
    multiplier *= holidayImpact;
  }

  // 趋势
  const trend = computeTrendSignal(city.id, { trendData });
  const trendMultiplier = 0.98 + trend.trend * 0.04;
  components.trend = { ...trend, multiplier: parseFloat(trendMultiplier.toFixed(3)) };
  multiplier *= trendMultiplier;

  return {
    cityId: city.id,
    cityName: city.name,
    multiplier: parseFloat(Math.max(0.75, Math.min(1.25, multiplier)).toFixed(3)),
    components,
    notes,
    summary: notes.length > 0 ? notes.slice(0, 3).join('；') : '当前季节适宜旅行'
  };
}

/**
 * 批量计算所有城市的上下文
 *
 * @param {Array} cities - 城市列表
 * @param {Object} context - 上下文数据
 * @returns {Object} { cityMultipliers: {}, globalNotes: [] }
 */
function computeAllContexts(cities, context = {}) {
  const multipliers = {};
  const allSummaries = [];

  for (const city of cities) {
    const ctx = computeCityContext(city, context);
    multipliers[city.id] = ctx;
    allSummaries.push({
      cityId: city.id,
      cityName: city.name,
      multiplier: ctx.multiplier,
      summary: ctx.summary
    });
  }

  return { cityMultipliers: multipliers, citySummaries: allSummaries };
}

module.exports = {
  // 季节性
  SEASONALITY_MATRIX,
  getSeasonalityIndex,
  getSeasonalityLabel,

  // 天气
  computeWeatherImpact,

  // 节庆
  CITY_EVENTS,
  findCityEvents,

  // 趋势
  computeTrendSignal,

  // 综合
  computeCityContext,
  computeAllContexts
};
