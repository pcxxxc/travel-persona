/**
 * 旅格 Travel Persona · 后端城市数据层
 *
 * 将发布包内的城市种子数据适配为后端标准 CityRecord 格式。
 * 数据来源: src/data/travelPersonaSeed.json
 * 对应 Schema: docs/schemas/PlanResponse.json 中的 CityBrief
 */

const { CITIES: LEGACY_CITIES } = require('./cityDatabase');
const TRAVEL_PERSONA_SEED = require('./travelPersonaSeed.json');
const CITY_EXPANSION = require('./cityExpansion.json');
const CITY_SCOPE_LIMIT = 32;

let _cachedRaw = null;
let _cachedCities = null;
let _cachedPersonas = null;

function loadRawData() {
  if (_cachedRaw) return _cachedRaw;
  _cachedRaw = TRAVEL_PERSONA_SEED;
  return _cachedRaw;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 将前端原始城市数据适配为后端 CityRecord 标准格式
 * 包含完整的16维向量（10维静态 + 6维动态计算）
 */
function adaptCity(raw) {
  const pois = raw.pois || [];
  const riskFlags = raw.riskFlags || [];
  const indoorCount = pois.filter(p => p.indoor).length;
  const typeSet = new Set(pois.map(p => p.type));
  const rawIntel = raw.intelligence || (loadRawData().cityIntelligence.cityScores || {})[raw.id] || {};

  // 16维向量：前10维来自静态数据，后6维动态计算
  const traitVector = {
    restoration: raw.vector.restoration,
    nature: raw.vector.nature,
    culture: raw.vector.culture,
    food: raw.vector.food,
    pace: raw.vector.pace,
    social: raw.vector.social,
    budget: raw.vector.budget,
    aesthetics: raw.vector.aesthetics,
    comfort: raw.vector.comfort,
    novelty: raw.vector.novelty,
    // 后6维动态计算（与 fallbackPlanner.enrichCityVector 逻辑一致）
    transit: raw.transportScore || 0.5,
    lowCrowd: Number.isFinite(Number(rawIntel.crowdRisk))
      ? clamp(1 - Number(rawIntel.crowdRisk), 0.18, 0.86)
      : riskFlags.includes('crowd') ? 0.32 : 0.64,
    authenticity: riskFlags.includes('commercial')
      ? clamp((raw.vector.culture || 0.5) + 0.02, 0.35, 0.72)
      : clamp((raw.vector.culture || 0.5) + 0.14, 0.45, 0.92),
    weatherFlex: Number.isFinite(Number(rawIntel.weatherBackup))
      ? clamp(Number(rawIntel.weatherBackup), 0.32, 0.9)
      : clamp(0.38 + indoorCount * 0.13, 0.38, 0.84),
    bookingEase: Number.isFinite(Number(rawIntel.bookingFriction))
      ? clamp(1 - Number(rawIntel.bookingFriction), 0.24, 0.84)
      : riskFlags.includes('crowd') || riskFlags.includes('early') ? 0.42 : 0.68,
    workation: raw.cluster === 'slow-nature' || raw.cluster === 'aesthetic-city' ||
               ['chengdu', 'hangzhou', 'shenzhen'].includes(raw.id) ? 0.72 : 0.42
  };

  // 置信度（静态数据版本越高，置信度越高）
  const traitConfidence = {
    restoration: 0.72, nature: 0.68, culture: 0.75, food: 0.70,
    pace: 0.65, social: 0.62, budget: 0.78, aesthetics: 0.70,
    comfort: 0.58, novelty: 0.60, transit: 0.55, lowCrowd: 0.52,
    authenticity: 0.48, weatherFlex: 0.50, bookingEase: 0.52, workation: 0.45
  };

  return {
    id: raw.id,
    cityId: raw.id,  // 与 weatherService CITY_COORDS 键兼容
    name: raw.name,
    province: raw.province,
    cluster: raw.cluster,
    coordinates: raw.coordinates,
    centerQuery: raw.centerQuery,
    traitVector,
    traitConfidence,
    minDays: raw.minDays,
    maxDays: raw.maxDays,
    dailyBudget: raw.dailyBudget,
    transportScore: raw.transportScore,
    bestFor: raw.bestFor || [],
    notFor: raw.notFor || '',
    riskFlags,
    platformSignals: raw.platformSignals || [],
    stayZone: raw.stayZone || '',
    pois,
    poiDiversity: clamp(typeSet.size / 12, 0.35, 0.95),
    intelligence: {
      transportEase: rawIntel.transportEase || raw.transportScore || 0.6,
      costStability: rawIntel.costStability || clamp(1 - raw.dailyBudget / 1000, 0.35, 0.82),
      poiDepth: rawIntel.poiDepth || clamp(pois.length / 25, 0.45, 0.90),
      weatherBackup: rawIntel.weatherBackup || 0.58,
      bookingFriction: rawIntel.bookingFriction || 0.5,
      crowdRisk: rawIntel.crowdRisk || 0.55,
      routeValue: rawIntel.routeValue || 0.55,
      growthSignal: rawIntel.growthSignal || 0.62,
      routeRoles: rawIntel.routeRoles || [],
      whenToUse: rawIntel.whenToUse || '作为通用目的地候选。',
      downgradeIf: rawIntel.downgradeIf || '当硬约束明显冲突时降权。',
      evidence: rawIntel.evidence || raw.platformSignals || []
    },
    // 总纲9.2 数据质量字段
    coverageTier: raw.coverageTier || 'A',
    lastVerifiedAt: raw.lastVerifiedAt || '2026-07-11',
    status: raw.status || 'published',
    dataCohort: raw.dataCohort || 'core-seed',
    sourceRefs: raw.sourceRefs || [{ type: 'expertAnnotation', source: '旅格路线实验室', date: '2026-07-11' }]
  };
}

const LEGACY_CITY_METADATA = {
  lijiang: {
    province: '云南', coordinates: { lat: 26.8721, lng: 100.2258 },
    cluster: 'slow-nature', minDays: 3, maxDays: 6, dailyBudget: 420,
    transportScore: 0.58, riskFlags: ['commercial', 'crowd', 'longTransit'],
    culture: 0.74, food: 0.48, aesthetics: 0.82, comfort: 0.52,
    stayZone: '大研古城外围、束河或白沙按体验重点选择'
  },
  qinghaihu: {
    province: '青海', coordinates: { lat: 36.9029, lng: 100.1655 },
    cluster: 'wild-nature', minDays: 3, maxDays: 6, dailyBudget: 520,
    transportScore: 0.34, riskFlags: ['longTransit', 'climb'],
    culture: 0.34, food: 0.28, aesthetics: 0.92, comfort: 0.30,
    stayZone: '西宁集散，环湖住宿按天气与交通确认'
  },
  xian: {
    province: '陕西', coordinates: { lat: 34.3416, lng: 108.9398 },
    cluster: 'heritage', minDays: 3, maxDays: 6, dailyBudget: 360,
    transportScore: 0.86, riskFlags: ['crowd', 'early', 'commercial'],
    culture: 0.94, food: 0.82, aesthetics: 0.66, comfort: 0.56,
    stayZone: '钟楼外围或地铁2号线沿线'
  },
  dalian: {
    province: '辽宁', coordinates: { lat: 38.9140, lng: 121.6147 },
    cluster: 'coast-aesthetic', minDays: 3, maxDays: 5, dailyBudget: 430,
    transportScore: 0.72, riskFlags: ['crowd', 'expensive'],
    culture: 0.46, food: 0.62, aesthetics: 0.78, comfort: 0.62,
    stayZone: '青泥洼桥、西安路或星海广场地铁沿线'
  }
};

// Supplemental POIs are stored as WGS84 so the route engine can use them
// directly. Point-like places use their usual visitor entry/centre; roads and
// other area features are explicitly marked as representative points.
const LEGACY_POI_COORDINATES = {
  lijiang: {
    '丽江古城': {
      lat: 26.879574, lng: 100.232196,
      coordinateSourceUrl: 'https://www.amap.com/place/B0FFF9GOOV'
    },
    '玉龙雪山': {
      lat: 27.101549, lng: 100.257428,
      coordinateSourceUrl: 'https://ditu.amap.com/place/B0378008FA'
    },
    '束河古镇': {
      lat: 26.923109, lng: 100.204517,
      coordinateSourceUrl: 'https://ditu.amap.com/place/B03780HUIN'
    },
    '拉市海': {
      lat: 26.862815, lng: 100.129439,
      coordinateSourceUrl: 'https://www.amap.com/place/B0FFHEGGA9'
    },
    '白沙古镇': {
      lat: 26.962038, lng: 100.217443,
      coordinateScope: 'representative',
      coordinateNote: '白沙古镇核心游览区代表点。',
      coordinateSourceUrl: 'https://ranks.amap.com/ranking/%E5%8E%86%E5%8F%B2%E5%8F%A4%E8%BF%B9/530721/%E8%80%81%E5%B9%B4%E4%BA%BA'
    },
    '黑龙潭公园': {
      lat: 26.8797, lng: 100.2322,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E9%BB%91%E9%BE%99%E6%BD%AD%E5%85%AC%E5%9B%AD'
    },
    '木府': {
      lat: 26.8745, lng: 100.2375,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E6%9C%A8%E5%BA%9C'
    },
    '四方街': {
      lat: 26.8755, lng: 100.2325,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E5%9B%9B%E6%96%B9%E8%A1%97'
    },
    '狮子山万古楼': {
      lat: 26.8725, lng: 100.2315,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E7%8B%AE%E5%AD%90%E5%B1%B1%E4%B8%87%E5%8F%A4%E6%A5%BC'
    },
    '玉水寨': {
      lat: 26.9467, lng: 100.2500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E7%8E%89%E6%B0%B4%E5%AF%A8'
    },
    '观音峡': {
      lat: 26.8389, lng: 100.2683,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E8%A7%82%E9%9F%B3%E5%B3%A1'
    },
    '东巴谷': {
      lat: 26.9156, lng: 100.2767,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E4%B8%9C%E5%B7%B4%E8%B0%B7'
    },
    '文笔海': {
      lat: 26.8533, lng: 100.2389,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E6%96%87%E7%AC%94%E6%B5%B7'
    },
    '泸沽湖': {
      lat: 27.7089, lng: 100.7833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E6%B3%B8%E6%B2%BD%E6%B9%96'
    },
    '虎跳峡': {
      lat: 27.2000, lng: 100.1333,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%99%8E%E8%B7%B3%E5%B3%A1'
    },
    '长江第一湾': {
      lat: 26.8556, lng: 100.1889,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%95%BF%E6%B1%9F%E7%AC%AC%E4%B8%80%E6%B9%BE'
    },
    '老君山': {
      lat: 26.7500, lng: 99.9167,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E8%80%81%E5%90%9B%E5%B1%B1'
    },
    '甘海子': {
      lat: 27.0833, lng: 100.2667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E7%8E%89%E9%BE%99%E9%9B%AA%E5%B1%B1%E7%94%98%E6%B5%B7%E5%AD%90'
    },
    '印象丽江剧场': {
      lat: 27.0917, lng: 100.2617,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%8D%B0%E8%B1%A1%E4%B8%BD%E6%B1%9F%E5%89%A7%E5%9C%BA'
    },
    '玉湖村': {
      lat: 26.9667, lng: 100.2333,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B8%BD%E6%B1%9F%E7%8E%89%E6%B9%96%E6%9D%91'
    },
    '蓝月谷': {
      lat: 27.1000, lng: 100.2550,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%93%9D%E6%9C%88%E8%B0%B7'
    }
  },
  qinghaihu: {
    '环湖西路': {
      lat: 36.850000, lng: 99.820000,
      coordinateScope: 'representative',
      coordinateNote: '环湖西路南段代表点，不代表整段道路；具体停靠点需结合实时路况确认。',
      coordinateSourceUrl: 'https://www.qinghai.gov.cn/xxgk/xxgk/qhzb/qhzb2019/201907/P020190718405496118120.pdf'
    },
    '茶卡盐湖': {
      lat: 36.759764, lng: 99.077114,
      coordinateSourceUrl: 'https://www.amap.com/place/B03D1008S8'
    },
    '黑马河': {
      lat: 36.729196, lng: 99.778133,
      coordinateSourceUrl: 'https://ditu.amap.com/place/B03CE0LPZL'
    },
    '鸟岛': {
      lat: 36.978858, lng: 99.900763,
      coordinateScope: 'representative',
      coordinateNote: '鸟岛自然保护区代表点；开放与可达性需出行前复核。',
      coordinateSourceUrl: 'https://commons.wikimedia.org/wiki/File:Bird_Island_nature_reserve,_Qinghai_Lake_-_panoramio_(1).jpg'
    },
    '二郎剑景区': {
      lat: 36.8945, lng: 100.4597,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%9D%92%E6%B5%B7%E6%B9%96%E4%BA%8C%E9%83%8E%E5%89%91%E6%99%AF%E5%8C%BA'
    },
    '金银滩草原': {
      lat: 36.9833, lng: 100.9167,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%87%91%E9%93%B6%E6%BB%A9%E8%8D%89%E5%8E%9F'
    },
    '原子城纪念馆': {
      lat: 36.9833, lng: 100.9000,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%8E%9F%E5%AD%90%E5%9F%8E%E7%BA%AA%E5%BF%B5%E9%A6%86'
    },
    '仙女湾': {
      lat: 36.9500, lng: 100.4333,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%9D%92%E6%B5%B7%E6%B9%96%E4%BB%99%E5%A5%B3%E6%B9%BE'
    },
    '日月山': {
      lat: 36.2833, lng: 101.0833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E6%97%A5%E6%9C%88%E5%B1%B1'
    },
    '倒淌河': {
      lat: 36.2833, lng: 101.0500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%80%92%E7%95%85%E6%B2%B3'
    },
    '塔尔寺': {
      lat: 36.4833, lng: 101.5667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A1%94%E5%B0%94%E5%AF%BA'
    },
    '卓尔山': {
      lat: 38.2000, lng: 100.2667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%8D%93%E5%B0%94%E5%B1%B1'
    },
    '门源油菜花海': {
      lat: 37.3833, lng: 101.6167,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%97%A8%E6%BA%90%E6%B2%B9%E8%8F%9C%E8%8A%B1%E6%B5%B7'
    },
    '祁连山草原': {
      lat: 38.2000, lng: 100.3500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E7%A5%81%E8%BF%9E%E5%B1%B1%E8%8D%89%E5%8E%9F'
    },
    '冰沟林海': {
      lat: 38.1500, lng: 100.2167,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%86%B0%E6%B2%9F%E6%9E%97%E6%B5%B7'
    },
    '大冬树山垭口': {
      lat: 37.8500, lng: 100.1833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E5%86%AC%E6%A0%91%E5%B1%B1%E5%A8%87%E5%8F%A3'
    },
    '环湖东路': {
      lat: 36.8500, lng: 100.6167,
      coordinateScope: 'representative',
      coordinateNote: '环湖东路中段代表点，不代表整段道路。',
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%9D%92%E6%B5%B7%E6%B9%96%E7%8E%AF%E6%B9%96%E4%B8%9C%E8%B7%AF'
    },
    '尕海': {
      lat: 37.2500, lng: 100.3500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%9D%92%E6%B5%B7%E4%B8%93%E6%B5%B7'
    },
    '金沙湾': {
      lat: 36.9167, lng: 100.5833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%9D%92%E6%B5%B7%E6%B9%96%E9%87%91%E6%B2%99%E6%B9%BE'
    },
    '海心山': {
      lat: 36.9167, lng: 100.4833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E9%9D%92%E6%B5%B7%E6%B9%96%E6%B5%B7%E5%BF%83%E5%B1%B1'
    }
  },
  xian: {
    '回民街': {
      lat: 34.266182, lng: 108.931737,
      coordinateSourceUrl: 'https://ditu.amap.com/place/B001D140J1'
    },
    '兵马俑': {
      lat: 34.387653, lng: 109.276968,
      coordinateSourceUrl: 'https://ditu.amap.com/place/B001D09OYW'
    },
    '城墙': {
      lat: 34.252242, lng: 108.942360,
      coordinateScope: 'representative',
      coordinateNote: '以永宁门常用入口作为城墙游览代表点。',
      coordinateSourceUrl: 'https://www.amap.com/place/B0FFHNKLSK'
    },
    '大唐不夜城': {
      lat: 34.215423, lng: 108.959323,
      coordinateScope: 'representative',
      coordinateNote: '步行街核心段代表点。',
      coordinateSourceUrl: 'https://www.amap.com/place/B001D0VWAX'
    },
    '陕西历史博物馆': {
      lat: 34.225774, lng: 108.950352,
      coordinateSourceUrl: 'https://ditu.amap.com/place/B001D03PEX'
    },
    '大雁塔': {
      lat: 34.2200, lng: 108.9580,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E5%A4%A7%E9%9B%81%E5%A1%94'
    },
    '华清宫': {
      lat: 34.3636, lng: 109.2100,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E5%8D%8E%E6%B8%85%E5%AE%AB'
    },
    '钟鼓楼': {
      lat: 34.2611, lng: 108.9389,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E9%92%9F%E9%BC%93%E6%A5%BC'
    },
    '小雁塔': {
      lat: 34.2389, lng: 108.9417,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E5%B0%8F%E9%9B%81%E5%A1%94'
    },
    '碑林博物馆': {
      lat: 34.2550, lng: 108.9330,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E7%A2%91%E6%9E%97%E5%8D%9A%E7%89%A9%E9%A6%86'
    },
    '大明宫国家遗址公园': {
      lat: 34.2833, lng: 108.9667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E5%A4%A7%E6%98%8E%E5%AE%AB%E9%81%97%E5%9D%80%E5%85%AC%E5%9B%AD'
    },
    '大唐芙蓉园': {
      lat: 34.2167, lng: 108.9667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E5%A4%A7%E5%94%90%E8%8A%99%E8%93%89%E5%9B%AD'
    },
    '曲江池遗址公园': {
      lat: 34.2000, lng: 108.9667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E6%9B%B2%E6%B1%9F%E6%B1%A0%E9%81%97%E5%9D%80%E5%85%AC%E5%9B%AD'
    },
    '永兴坊': {
      lat: 34.2667, lng: 108.9500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E6%B0%B8%E5%85%B4%E5%9D%8A'
    },
    '法门寺': {
      lat: 34.4333, lng: 107.9000,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E6%B3%95%E9%97%A8%E5%AF%BA'
    },
    '乾陵': {
      lat: 34.5667, lng: 108.2167,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E4%B9%BE%E9%99%B5'
    },
    '华山': {
      lat: 34.4833, lng: 110.0833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%8D%8E%E5%B1%B1'
    },
    '青龙寺': {
      lat: 34.2333, lng: 108.9833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E9%9D%92%E9%BE%99%E5%AF%BA'
    },
    '半坡博物馆': {
      lat: 34.2833, lng: 109.0500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E5%8D%8A%E5%9D%A1%E5%8D%9A%E7%89%A9%E9%A6%86'
    },
    '兴庆宫公园': {
      lat: 34.2500, lng: 108.9833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E5%85%B4%E5%BA%86%E5%AE%AB%E5%85%AC%E5%9B%AD'
    },
    '书院门': {
      lat: 34.2583, lng: 108.9417,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E8%A5%BF%E5%AE%89%E4%B9%A6%E9%99%A2%E9%97%A8'
    }
  },
  dalian: {
    '星海广场': {
      lat: 38.881252, lng: 121.582981,
      coordinateSourceUrl: 'https://ditu.amap.com/place/B019B0AN7O'
    },
    '老虎滩': {
      lat: 38.877538, lng: 121.669609,
      coordinateSourceUrl: 'https://ditu.amap.com/place/B019B0226E'
    },
    '滨海路': {
      lat: 38.864869, lng: 121.645108,
      coordinateScope: 'representative',
      coordinateNote: '以燕窝岭景区作为滨海路中段代表点，不代表整段道路。',
      coordinateSourceUrl: 'https://www.amap.com/place/B019B0C3HK'
    },
    '俄罗斯风情街': {
      lat: 38.927075, lng: 121.630325,
      coordinateSourceUrl: 'https://www.amap.com/place/B0JUTZ642N'
    },
    '金石滩': {
      lat: 39.0933, lng: 122.0083,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E9%87%91%E7%9F%B3%E6%BB%A9'
    },
    '发现王国': {
      lat: 39.0833, lng: 122.0167,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E5%8F%91%E7%8E%B0%E7%8E%8B%E5%9B%BD'
    },
    '棒棰岛': {
      lat: 38.8667, lng: 121.7167,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E6%A3%92%E6%A4%B0%E5%B2%9B'
    },
    '旅顺口': {
      lat: 38.8167, lng: 121.2500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E6%97%85%E9%A1%BA%E5%8F%A3'
    },
    '白玉山': {
      lat: 38.8167, lng: 121.2667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E7%99%BD%E7%8E%89%E5%B1%B1'
    },
    '圣亚海洋世界': {
      lat: 38.8667, lng: 121.6667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E5%9C%A3%E4%BA%9A%E6%B5%B7%E6%B4%8B%E4%B8%96%E7%95%8C'
    },
    '森林动物园': {
      lat: 38.8833, lng: 121.6500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E6%A3%AE%E6%9E%97%E5%8A%A8%E7%89%A9%E5%9B%AD'
    },
    '傅家庄公园': {
      lat: 38.8500, lng: 121.6500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E5%82%85%E5%AE%B6%E5%BA%84%E5%85%AC%E5%9B%AD'
    },
    '星海公园': {
      lat: 38.8833, lng: 121.6000,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E6%98%9F%E6%B5%B7%E5%85%AC%E5%9B%AD'
    },
    '中山广场': {
      lat: 38.9167, lng: 121.6333,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E4%B8%AD%E5%B1%B1%E5%B9%BF%E5%9C%BA'
    },
    '友好广场': {
      lat: 38.9167, lng: 121.6167,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E5%8F%8B%E5%A5%BD%E5%B9%BF%E5%9C%BA'
    },
    '港湾广场': {
      lat: 38.9167, lng: 121.6500,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E6%B8%AF%E6%B9%BE%E5%B9%BF%E5%9C%BA'
    },
    '十五库': {
      lat: 38.9167, lng: 121.6667,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E5%8D%81%E4%BA%94%E5%BA%93'
    },
    '东港商务区': {
      lat: 38.9167, lng: 121.6833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E4%B8%9C%E6%B8%AF%E5%95%86%E5%8A%A1%E5%8C%BA'
    },
    '海之韵公园': {
      lat: 38.8833, lng: 121.7000,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E6%B5%B7%E4%B9%8B%E9%9F%B5%E5%85%AC%E5%9B%AD'
    },
    '北大桥': {
      lat: 38.8500, lng: 121.6833,
      coordinateSourceUrl: 'https://www.amap.com/search?query=%E5%A4%A7%E8%BF%9E%E5%8C%97%E5%A4%A7%E6%A1%A5'
    }
  }
};

function adaptLegacyCity(raw, metadata) {
  const dims = raw.dimensions || {};
  const cityCoordinates = LEGACY_POI_COORDINATES[raw.id] || {};
  const pois = (raw.pois || []).map(poi => {
    const coordinate = cityCoordinates[poi.name] || {};
    return {
      ...poi,
      ...coordinate,
      coordinateSystem: Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lng) ? 'WGS84' : undefined,
      coordinateVerifiedAt: Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lng) ? '2026-07-13' : undefined,
      tip: poi.note || '',
      duration: poi.duration || 120
    };
  });
  const indoorCount = pois.filter(poi => poi.indoor).length;
  const typeSet = new Set(pois.map(poi => poi.type));
  const riskFlags = metadata.riskFlags;
  const traitVector = {
    restoration: clamp((1 - (dims.pace || 0.5)) * 0.45 + (dims.nature || 0.5) * 0.45 + 0.08, 0.2, 0.94),
    nature: dims.nature || 0.5,
    culture: metadata.culture,
    food: metadata.food,
    pace: dims.pace || 0.5,
    social: dims.social || 0.5,
    budget: dims.budget || 0.5,
    aesthetics: metadata.aesthetics,
    comfort: metadata.comfort,
    novelty: dims.explore || 0.5,
    transit: metadata.transportScore,
    lowCrowd: riskFlags.includes('crowd') ? 0.30 : 0.76,
    authenticity: riskFlags.includes('commercial') ? 0.54 : 0.72,
    weatherFlex: clamp(0.34 + indoorCount * 0.12, 0.34, 0.78),
    bookingEase: riskFlags.includes('early') || riskFlags.includes('crowd') ? 0.38 : 0.68,
    workation: metadata.cluster === 'slow-nature' ? 0.62 : 0.36
  };
  const traitConfidence = Object.fromEntries(Object.keys(traitVector).map(key => [key, 0.46]));

  return {
    id: raw.id,
    cityId: raw.id,
    name: raw.name,
    province: metadata.province,
    cluster: metadata.cluster,
    coordinates: metadata.coordinates,
    centerQuery: raw.name,
    traitVector,
    traitConfidence,
    minDays: metadata.minDays,
    maxDays: metadata.maxDays,
    dailyBudget: metadata.dailyBudget,
    transportScore: metadata.transportScore,
    bestFor: raw.emotionTags || [],
    notFor: riskFlags.includes('longTransit') ? '短途或不愿长距离移动时需要降级。' : '',
    riskFlags,
    platformSignals: [],
    stayZone: metadata.stayZone,
    pois,
    poiDiversity: clamp(typeSet.size / 12, 0.30, 0.80),
    intelligence: {
      transportEase: metadata.transportScore,
      costStability: clamp(1 - metadata.dailyBudget / 1000, 0.35, 0.78),
      poiDepth: clamp(pois.length / 25, 0.42, 0.82),
      weatherBackup: clamp(0.38 + indoorCount * 0.12, 0.35, 0.72),
      bookingFriction: riskFlags.includes('early') ? 0.68 : 0.48,
      crowdRisk: riskFlags.includes('crowd') ? 0.74 : 0.42,
      routeValue: metadata.transportScore,
      growthSignal: 0.60,
      routeRoles: [],
      whenToUse: '当人格、天数和路线条件同时匹配时作为补充候选。',
      downgradeIf: '数据深度或实时交通不足时降权。',
      evidence: []
    },
    coverageTier: 'A',
    lastVerifiedAt: '2026-07-13',
    status: 'published',
    sourceRefs: [
      { type: 'legacyDataset', source: '旅格城市基础库', date: '2025-01-01' },
      { type: 'mapCrossCheck', source: '公开地图 POI 与地理资料交叉核验', date: '2026-07-13', coordinateSystem: 'WGS84' }
    ]
  };
}

function getCities() {
  if (_cachedCities) return _cachedCities;
  const raw = loadRawData();
  const expandedRawCities = raw.cities.concat(CITY_EXPANSION.cities || []);
  const primaryCities = expandedRawCities.map(adaptCity);
  const existingIds = new Set(primaryCities.map(city => city.id));
  const supplementalCities = LEGACY_CITIES
    .filter(city => LEGACY_CITY_METADATA[city.id] && !existingIds.has(city.id))
    .map(city => adaptLegacyCity(city, LEGACY_CITY_METADATA[city.id]));
  _cachedCities = primaryCities.concat(supplementalCities);
  if (_cachedCities.length !== CITY_SCOPE_LIMIT) {
    throw new Error(`Published city scope must remain exactly ${CITY_SCOPE_LIMIT}; received ${_cachedCities.length}`);
  }
  return _cachedCities;
}

function getCityById(id) {
  return getCities().find(c => c.id === id) || null;
}

function getCityByName(name) {
  return getCities().find(c => c.name === name || c.id === name || c.centerQuery === name) || null;
}

function getPersonaTypes() {
  if (_cachedPersonas) return _cachedPersonas;
  const raw = loadRawData();
  _cachedPersonas = raw.personas.map(p => ({
    id: p.id,
    name: p.name,
    summary: p.summary,
    match: p.match
  }));
  return _cachedPersonas;
}

function getTraitLabels() {
  return loadRawData().traitLabels;
}

function getRouteNodes() {
  const raw = loadRawData();
  return raw.cityIntelligence && raw.cityIntelligence.routeNodes ? raw.cityIntelligence.routeNodes : [];
}

function getRouteCorridors() {
  return [
    { id: 'valueNorthbound', name: '中轴高性价比北上', role: '去程主线', summary: '沿高铁/普铁主干道北上，城市间距均匀，住宿成本比一线城市友好。', estimatedDays: 12, valueScore: 94, efficiencyScore: 91 },
    { id: 'eastReturn', name: '东线不走回头路返程', role: '返程推荐', summary: '从北京向东南回撤，用济南、南京、苏杭、闽南把返程变成第二条旅行线。', estimatedDays: 9, valueScore: 88, efficiencyScore: 84 },
    { id: 'historyLoop', name: '历史审美加强线', role: '备选方案', summary: '更重文化和博物馆，把西安/洛阳权重提高，但总里程更长。', estimatedDays: 19, valueScore: 82, efficiencyScore: 78 }
  ];
}

module.exports = {
  CITY_SCOPE_LIMIT,
  getCities,
  getCityById,
  getCityByName,
  getPersonaTypes,
  getTraitLabels,
  getRouteNodes,
  getRouteCorridors,
  adaptCity,
  loadRawData
};
