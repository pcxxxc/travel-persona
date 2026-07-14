/**
 * 旅格 Travel Persona · 行程约束求解器
 *
 * 职责：
 * 1. 按 zone 聚类 —— 同区域 POI 安排在同一天，减少折返
 * 2. 营业时间过滤 —— 排除 openHours 冲突
 * 3. 雨天替换 —— indoor:false 的 POI 替换为 indoor:true 的备选
 * 4. 节奏适配 —— pace 低少排 POI（留白），pace 高排满
 *
 * 输入：城市 POI 列表 + 天数 + 天气 + personaScore
 * 输出：结构化行程骨架 { days: [{ day, theme, morning, afternoon, evening }] }
 *
 * 纯函数设计：无外部依赖，无副作用。
 */

const { ValidationError, DataError } = require('../utils/errors');

// 每日 POI 数量配置（按 pace 调整）
// pace 低 → 每天 2-3 个 POI；pace 高 → 每天 4-6 个 POI
const POI_PER_DAY = {
  low: { morning: 1, afternoon: 1, evening: 1 },      // pace < 0.4，松弛型
  medium: { morning: 1, afternoon: 2, evening: 1 },    // 0.4 ≤ pace < 0.6
  high: { morning: 2, afternoon: 2, evening: 2 }       // pace ≥ 0.6，高效型
};

// 时段到 POI 类型的映射偏好
const TIME_SLOT_PREFERENCE = {
  morning: ['自然', '文化', '街区'],
  afternoon: ['自然', '文化', '街区', '美食', '室内'],
  evening: ['街区', '美食', '夜市', '室内']
};

// 每日主题词汇（按人格类型）
const DAY_THEMES = {
  '松弛城市漫游者': ['抵达与慢下来', '老街与咖啡', '步行与发呆', '收尾与告别'],
  '自然疗愈逃离者': ['抵达与呼吸', '山海之间', '放空与日出', '告别与约定'],
  '烟火气探索者': ['抵达与觅食', '早市与老社区', '夜市与本地味', '最后一口烟火'],
  '高效打卡收集者': ['紧凑开局', '高效扫点', '深度覆盖', '收尾冲刺'],
  '灵感采集型创作者': ['抵达与观察', '建筑与线条', '街区与色彩', '整理与告别'],
  '数字游民试居者': ['抵达与安顿', '工坊与生活', '日常节奏', '评估与总结'],
  '平衡型旅行者': ['抵达与探索', '深入体验', '自由漫步', '温暖收尾']
};

/**
 * 解析营业时间字符串，返回 [openHour, closeHour]
 * 支持格式："全天"、"10:00-22:00"、"08:30-17:00"
 */
function parseOpenHours(hoursStr) {
  if (!hoursStr || hoursStr === '全天') {
    return [0, 24]; // 全天开放
  }

  const match = hoursStr.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/);
  if (match) {
    const openHour = parseInt(match[1]) + parseInt(match[2]) / 60;
    const closeHour = parseInt(match[3]) + parseInt(match[4]) / 60;
    return [openHour, closeHour];
  }

  return [8, 22]; // 默认 8:00-22:00
}

/**
 * 判断 POI 是否在指定时段可用
 * @param {Object} poi - POI 对象
 * @param {string} timeSlot - 'morning' | 'afternoon' | 'evening'
 */
function isPoiAvailable(poi, timeSlot) {
  const [open, close] = parseOpenHours(poi.openHours);

  const slotHours = {
    morning: [7, 12],
    afternoon: [12, 18],
    evening: [18, 24]
  };

  const [slotStart, slotEnd] = slotHours[timeSlot] || [7, 24];

  // POI 在时段内至少开放 2 小时
  const overlapStart = Math.max(open, slotStart);
  const overlapEnd = Math.min(close, slotEnd);
  return (overlapEnd - overlapStart) >= 2;
}

/**
 * 判断 POI 类型是否匹配时段偏好
 */
function isPoiTypeMatch(poi, timeSlot) {
  const preferred = TIME_SLOT_PREFERENCE[timeSlot] || [];
  return preferred.includes(poi.type) || preferred.includes('*');
}

/**
 * 按 zone 聚类 POI
 * @param {Array} pois - POI 列表
 * @returns {Object} { zoneName: [poi1, poi2, ...] }
 */
function clusterByZone(pois) {
  const clusters = {};
  for (const poi of pois) {
    const zone = poi.zone || '其他';
    if (!clusters[zone]) {
      clusters[zone] = [];
    }
    clusters[zone].push(poi);
  }
  return clusters;
}

/**
 * 获取 pace 等级
 */
function getPaceLevel(pace) {
  if (pace < 0.4) return 'low';
  if (pace < 0.6) return 'medium';
  return 'high';
}

/**
 * 雨天替换 POI
 * @param {Array} pois - 原始 POI 列表
 * @param {Array} allPois - 所有城市 POI（用于查找室内备选）
 * @returns {Array} 替换后的 POI 列表
 */
function replaceRainPois(pois, allPois) {
  const indoorPois = allPois.filter(p => p.indoor);
  const outdoorPois = pois.filter(p => !p.indoor);

  if (outdoorPois.length === 0 || indoorPois.length === 0) {
    return pois;
  }

  // 替换策略：每个室外 POI 尝试替换为同 zone 的室内 POI，否则用任意室内 POI
  const usedIndoor = []; // 局部追踪已使用的室内 POI，避免重复分配
  const replaced = pois.map(poi => {
    if (poi.indoor) return poi;

    // 优先找同 zone 的室内备选
    const sameZone = indoorPois.filter(p => p.zone === poi.zone && !usedIndoor.includes(p.name));
    if (sameZone.length > 0) {
      usedIndoor.push(sameZone[0].name);
      return sameZone[0];
    }

    // 找任意室内备选
    const available = indoorPois.filter(p => !usedIndoor.includes(p.name));
    if (available.length > 0) {
      usedIndoor.push(available[0].name);
      return available[0];
    }

    return poi; // 无备选，保留原 POI
  });

  return replaced;
}

/**
 * 为每日分配 POI
 * @param {Array} zones - 聚类后的 zone 名称列表
 * @param {Object} clusters - zone → POI 映射
 * @param {number} days - 旅行天数
 * @param {Object} quota - 每日配额 { morning, afternoon, evening }
 * @returns {Array} 每日 POI 分配 [{ day, theme, pois: [{poi, timeSlot}] }]
 */
function assignPoisToDays(zones, clusters, days, quota, weather) {
  const dailyPlans = [];
  const usedPois = new Set();

  // 将 zone 均匀分配到各天
  const zonesPerDay = Math.ceil(zones.length / days);

  for (let d = 0; d < days; d++) {
    const dayIndex = d + 1;
    const dayZones = zones.slice(d * zonesPerDay, (d + 1) * zonesPerDay);
    const dayPois = [];

    // 收集当天所有 zone 的 POI
    for (const zone of dayZones) {
      const zonePois = (clusters[zone] || []).filter(p => !usedPois.has(p.name));
      dayPois.push(...zonePois);
    }

    // 如果当天 POI 不够，从剩余 POI 中补充
    if (dayPois.length < quota.morning + quota.afternoon + quota.evening) {
      for (const zone of zones) {
        if (dayPois.length >= quota.morning + quota.afternoon + quota.evening) break;
        const extraPois = (clusters[zone] || []).filter(
          p => !usedPois.has(p.name) && !dayPois.find(dp => dp.name === p.name)
        );
        dayPois.push(...extraPois.slice(0, quota.morning + quota.afternoon + quota.evening - dayPois.length));
      }
    }

    // 雨天替换
    let finalPois = dayPois;
    if (weather && weather[d] && weather[d].condition === 'rain') {
      const allPois = Object.values(clusters).flat();
      finalPois = replaceRainPois(dayPois, allPois);
    }

    // 按时段分配
    const assigned = assignToTimeSlots(finalPois, quota, usedPois);

    dailyPlans.push({
      day: dayIndex,
      weather: weather?.[d] || null,
      pois: assigned,
      zoneCount: dayZones.length
    });
  }

  return dailyPlans;
}

/**
 * 按时段分配 POI
 */
function assignToTimeSlots(pois, quota, usedPois) {
  const assigned = [];
  let remaining = [...pois];

  const slots = ['morning', 'afternoon', 'evening'];

  for (const slot of slots) {
    const count = quota[slot];

    // 筛选该时段可用的 POI
    const available = remaining.filter(p => {
      if (usedPois.has(p.name)) return false;
      if (!isPoiAvailable(p, slot)) return false;
      return true;
    });

    // 优先匹配时段偏好
    const preferred = available.filter(p => isPoiTypeMatch(p, slot));
    const others = available.filter(p => !isPoiTypeMatch(p, slot));

    const selected = [...preferred, ...others].slice(0, count);

    for (const poi of selected) {
      assigned.push({
        poi: poi.name,
        zone: poi.zone,
        type: poi.type,
        timeSlot: slot,
        indoor: poi.indoor,
        note: poi.note || ''
      });
      usedPois.add(poi.name);
      remaining = remaining.filter(p => p.name !== poi.name);
    }
  }

  return assigned;
}

/**
 * 生成每日主题
 * @param {number} dayIndex - 第几天（1-based）
 * @param {string} personaLabel - 人格标签
 * @param {Object} weather - 天气数据
 */
function generateDayTheme(dayIndex, personaLabel, weather) {
  const themes = DAY_THEMES[personaLabel] || DAY_THEMES['平衡型旅行者'];
  const theme = themes[(dayIndex - 1) % themes.length];

  if (weather && weather.condition === 'rain') {
    return theme + ' · 雨天版';
  }

  return theme;
}

/**
 * 核心求解函数
 *
 * @param {Object} params
 * @param {Object} params.city - 城市对象（含 pois）
 * @param {number} params.days - 旅行天数
 * @param {Object} params.weather - 天气数据 { daily: [{ condition, temp, date }] } 或 null
 * @param {Object} params.personaScore - PersonaScore { pace, ... }
 * @param {string} params.personaLabel - 人格标签（如 "松弛城市漫游者"）
 * @returns {Object} 行程骨架 { city, days: [{ day, theme, weather, morning, afternoon, evening }] }
 */
function solveItinerary({ city, days = 3, weather = null, personaScore = {}, personaLabel = '平衡型旅行者' }) {
  // ===== 输入验证 =====
  if (!city || !Array.isArray(city.pois) || city.pois.length === 0) {
    throw new ValidationError('城市数据无效：缺少 POI 列表', { city: city?.name });
  }

  if (days < 1 || days > 14) {
    throw new ValidationError('旅行天数必须在 1-14 之间', { days });
  }

  const pois = city.pois;

  // ===== Step 1: 确定 pace 等级和每日配额 =====
  const pace = personaScore.pace ?? 0.5;
  const paceLevel = getPaceLevel(pace);
  const quota = POI_PER_DAY[paceLevel];

  // ===== Step 2: 按 zone 聚类 =====
  const clusters = clusterByZone(pois);
  const zones = Object.keys(clusters);

  if (zones.length === 0) {
    throw new DataError('城市 POI 数据不完整：zone 聚类结果为空', { city: city.name });
  }

  // ===== Step 3: 分配 POI 到各天 =====
  const weatherDaily = Array.isArray(weather?.daily) ? weather.daily : null;
  const dailyPlans = assignPoisToDays(zones, clusters, days, quota, weatherDaily);

  // ===== Step 4: 生成结构化输出 =====
  const daysOutput = dailyPlans.map(plan => {
    const morningPois = plan.pois.filter(p => p.timeSlot === 'morning');
    const afternoonPois = plan.pois.filter(p => p.timeSlot === 'afternoon');
    const eveningPois = plan.pois.filter(p => p.timeSlot === 'evening');

    const dayWeather = plan.weather || (weatherDaily?.[plan.day - 1] || null);

    return {
      day: plan.day,
      theme: generateDayTheme(plan.day, personaLabel, dayWeather),
      pace: paceLevel,
      weather: dayWeather
        ? { condition: dayWeather.condition || '未知', temp: dayWeather.temp || '--' }
        : null,
      morning: morningPois.map(p => ({
        name: p.poi,
        zone: p.zone,
        type: p.type,
        note: p.note
      })),
      afternoon: afternoonPois.map(p => ({
        name: p.poi,
        zone: p.zone,
        type: p.type,
        note: p.note
      })),
      evening: eveningPois.map(p => ({
        name: p.poi,
        zone: p.zone,
        type: p.type,
        note: p.note
      })),
      hasRainReplacement: plan.pois.some(p => p.rainReplaced)
    };
  });

  return {
    city: city.name,
    cityId: city.id,
    days: daysOutput,
    meta: {
      paceLevel,
      totalPois: daysOutput.reduce((sum, d) => sum + d.morning.length + d.afternoon.length + d.evening.length, 0),
      zoneCount: zones.length,
      quotas: quota
    }
  };
}

/**
 * 按人格类型获取行程模板配置
 * 用于前端展示不同人格的行程风格说明
 */
function getItineraryStyle(personaLabel) {
  const styles = {
    '松弛城市漫游者': {
      description: '少景点、重步行、咖啡馆、老街，不设严密的点位路线',
      poiPerDay: '2-3 个',
      pace: '慢',
      focus: '步行空间、咖啡、发呆'
    },
    '自然疗愈逃离者': {
      description: '低强度自然路线、少商业化、重放空、早起看日出',
      poiPerDay: '2-3 个',
      pace: '慢',
      focus: '山海、森林、日出日落'
    },
    '烟火气探索者': {
      description: '早市→老社区→本地餐馆→夜市，以「吃」为线索串联',
      poiPerDay: '3-4 个',
      pace: '中',
      focus: '美食、市场、本地生活'
    },
    '高效打卡收集者': {
      description: '路线紧凑、交通优化、减少折返，每个点位分配合理时间',
      poiPerDay: '5-6 个',
      pace: '快',
      focus: '地标、博物馆、高效路线'
    },
    '灵感采集型创作者': {
      description: '建筑→展览→街区→机位→材质观察，以「记录」串联',
      poiPerDay: '3-4 个',
      pace: '中',
      focus: '建筑、艺术、摄影机位'
    },
    '数字游民试居者': {
      description: '工作空间→生活配套→租住区域→城市日常节奏探索',
      poiPerDay: '2-3 个',
      pace: '慢',
      focus: '咖啡馆、共享空间、生活区'
    }
  };

  return styles[personaLabel] || styles['松弛城市漫游者'];
}

module.exports = {
  solveItinerary,
  getItineraryStyle,
  parseOpenHours,
  isPoiAvailable,
  isPoiTypeMatch,
  clusterByZone,
  getPaceLevel,
  replaceRainPois,
  assignPoisToDays,
  POI_PER_DAY,
  DAY_THEMES
};