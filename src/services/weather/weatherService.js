/**
 * 旅格 Travel Persona · 天气服务（增强版）
 *
 * 数据源优先级：
 * 1. 和风天气（有 WEATHER_API_KEY）
 * 2. Open-Meteo（无需Key，聚合中国气象局CMA模型数据）
 * 3. null（天气不可用，总纲18.3不伪造）
 *
 * Open-Meteo 免费无需注册，CC-BY 4.0协议。
 * 非商用限制：每天10,000次 / 每小时5,000次 / 每分钟600次。
 */

const { NetworkError } = require('../../utils/errors');

// ========== 常量 ==========

const WEATHER_CACHE_TTL_MS = 60 * 60 * 1000;
const WEATHER_API_TIMEOUT_MS = 10000;

/** Open-Meteo API 基础URL（无需Key） */
const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

/** 32座城市坐标（WGS-84，用于Open-Meteo直接调用） */
const CITY_COORDS = {
  // --- 华北 / 东北 ---
  beijing:         { lat: 39.9042, lng: 116.4074 },
  tianjin:         { lat: 39.0842, lng: 117.2010 },
  taiyuan:         { lat: 37.8706, lng: 112.5489 },
  shenyang:        { lat: 41.8057, lng: 123.4315 },
  changchun:       { lat: 43.8171, lng: 125.3235 },
  harbin:          { lat: 45.8038, lng: 126.5340 },
  dalian:          { lat: 38.9140, lng: 121.6147 },

  // --- 华东 ---
  shanghai:        { lat: 31.2304, lng: 121.4737 },
  nanjing:         { lat: 32.0603, lng: 118.7969 },
  hangzhou:        { lat: 30.2741, lng: 120.1551 },
  suzhou:          { lat: 31.2989, lng: 120.5853 },
  yangzhou:        { lat: 32.3942, lng: 119.4127 },
  jinan:           { lat: 36.6512, lng: 117.1201 },
  qingdao:         { lat: 36.0671, lng: 120.3826 },
  fuzhou:          { lat: 26.0745, lng: 119.2965 },
  xiamen:          { lat: 24.4798, lng: 118.0894 },
  quanzhou:        { lat: 24.8744, lng: 118.6757 },
  nanchang:        { lat: 28.6820, lng: 115.8579 },

  // --- 华中 / 华南 ---
  wuhan:           { lat: 30.5928, lng: 114.3055 },
  changsha:        { lat: 28.2282, lng: 112.9388 },
  guangzhou:       { lat: 23.1291, lng: 113.2644 },
  shenzhen:        { lat: 22.5431, lng: 114.0579 },
  guilin:          { lat: 25.2736, lng: 110.2900 },
  luoyang:         { lat: 34.6197, lng: 112.4540 },

  // --- 西南 ---
  chengdu:         { lat: 30.5728, lng: 104.0668 },
  chongqing:       { lat: 29.4316, lng: 106.9123 },
  dali:            { lat: 25.6065, lng: 100.2670 },
  lijiang:         { lat: 26.8721, lng: 100.2258 },
  xian:            { lat: 34.3416, lng: 108.9398 },

  // --- 西北 ---
  xining:          { lat: 36.6171, lng: 101.7782 },
  qinghaihu:       { lat: 36.9029, lng: 100.1655 },
  urumqi:          { lat: 43.8256, lng: 87.6168 }
};

/** WMO天气代码 → 中文描述 */
const WMO_WEATHER_CODE = {
  0: '晴', 1: '大部晴', 2: '多云', 3: '阴', 45: '雾', 48: '雾凇',
  51: '小毛毛雨', 53: '毛毛雨', 55: '大毛毛雨', 61: '小雨', 63: '中雨', 65: '大雨',
  71: '小雪', 73: '中雪', 75: '大雪', 80: '阵雨', 81: '中阵雨', 82: '大阵雨',
  85: '小阵雪', 86: '大阵雪', 95: '雷暴', 96: '雷暴伴冰雹'
};

// ========== 内存缓存 ==========

const _weatherCache = new Map();

function getCache(cityId) {
  const entry = _weatherCache.get(cityId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    _weatherCache.delete(cityId);
    return null;
  }
  return entry.value;
}

function setCache(cityId, value) {
  _weatherCache.set(cityId, { value, expiresAt: Date.now() + WEATHER_CACHE_TTL_MS });
}

function clearCache() { _weatherCache.clear(); }

// ========== Open-Meteo（无需Key）==========

async function fetchFromOpenMeteo(cityIdOrCoords) {
  let coords;
  if (cityIdOrCoords && typeof cityIdOrCoords === 'object' && 'lat' in cityIdOrCoords) {
    coords = cityIdOrCoords;
  } else {
    coords = CITY_COORDS[cityIdOrCoords];
  }
  if (!coords) return null;

  const url = `${OPEN_METEO_BASE}?latitude=${coords.lat}&longitude=${coords.lng}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode,wind_speed_10m_max,precipitation_probability_max` +
    `&current_weather=true&timezone=Asia/Shanghai&forecast_days=7`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_API_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Open-Meteo 返回 ${res.status}`);
    }

    const json = await res.json();

    // 标准化为统一格式
    const daily = (json.daily || {}).time || [];
    const tMax = (json.daily || {}).temperature_2m_max || [];
    const tMin = (json.daily || {}).temperature_2m_min || [];
    const precip = (json.daily || {}).precipitation_sum || [];
    const wCode = (json.daily || {}).weathercode || [];
    const wind = (json.daily || {}).wind_speed_10m_max || [];
    const precipProb = (json.daily || {}).precipitation_probability_max || [];

    const current = json.current_weather || {};

    const forecast = daily.map((date, i) => ({
      date,
      textDay: WMO_WEATHER_CODE[wCode[i]] || '未知',
      textNight: WMO_WEATHER_CODE[wCode[i]] || '未知',
      tempMax: Math.round(tMax[i] || 0),
      tempMin: Math.round(tMin[i] || 0),
      humidity: null,
      windSpeed: Math.round((wind[i] || 0) * 3.6), // m/s → km/h
      precipitation: precip[i] || 0,
      precipProb: precipProb[i] || 0,
      weatherCode: wCode[i] || 0
    }));

    return {
      forecast,
      current: current.temperature !== undefined ? {
        temp: Math.round(current.temperature),
        windSpeed: Math.round((current.windspeed || 0) * 3.6),
        weatherCode: current.weathercode,
        text: WMO_WEATHER_CODE[current.weathercode] || '未知'
      } : null,
      source: 'open-meteo'
    };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new NetworkError(`Open-Meteo 超时（${WEATHER_API_TIMEOUT_MS}ms）`, { cityId });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ========== 和风天气（有Key）==========

async function fetchFromQWeather(cityName, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WEATHER_API_TIMEOUT_MS);

  try {
    const geoUrl = `https://geoapi.qweather.com/v2/city/lookup?location=${encodeURIComponent(cityName)}&key=${apiKey}`;
    const geoRes = await fetch(geoUrl, { signal: controller.signal });
    if (!geoRes.ok) throw new Error(`Geo API 返回 ${geoRes.status}`);
    const geoJson = await geoRes.json();
    const locationId = geoJson.location && geoJson.location[0] ? geoJson.location[0].id : null;
    if (!locationId) throw new Error(`未找到城市: ${cityName}`);

    const forecastUrl = `https://devapi.qweather.com/v7/weather/3d?location=${locationId}&key=${apiKey}`;
    const res = await fetch(forecastUrl, { signal: controller.signal });
    if (!res.ok) throw new Error(`预报 API 返回 ${res.status}`);
    const json = await res.json();

    return {
      forecast: (json.daily || []).map(d => ({
        date: d.fxDate, textDay: d.textDay || '', textNight: d.textNight || '',
        tempMax: parseInt(d.tempMax, 10) || 0, tempMin: parseInt(d.tempMin, 10) || 0,
        humidity: parseInt(d.humidity, 10) || 0, windSpeed: parseInt(d.windSpeedDay, 10) || 0
      })),
      current: null,
      source: 'qweather'
    };
  } finally {
    clearTimeout(timer);
  }
}

// ========== 核心入口 ==========

/**
 * 获取城市天气预报
 * 优先级：和风天气(有Key) → Open-Meteo(无Key) → null
 */
async function getWeather(cityId, options = {}) {
  // 检查缓存
  const cached = getCache(cityId);
  if (cached) {
    return { ...cached, fetchedAt: new Date().toISOString(), cached: true };
  }

  // 尝试和风天气（有Key时）
  const apiKey = process.env.WEATHER_API_KEY || '';
  if (apiKey) {
    try {
      const cityName = options.cityName || cityId;
      const result = await fetchFromQWeather(cityName, apiKey);
      setCache(cityId, result);
      return { ...result, fetchedAt: new Date().toISOString(), cached: false };
    } catch (err) {
      console.warn(`[weatherService] 和风天气失败 (${cityId}): ${err.message}，尝试Open-Meteo`);
    }
  }

  // 尝试 Open-Meteo（无需Key）
  try {
    const coords = CITY_COORDS[cityId] || options.coordinates || null;
    if (!coords) return null;
    const result = await fetchFromOpenMeteo(coords);
    if (result) {
      setCache(cityId, result);
      return { ...result, fetchedAt: new Date().toISOString(), cached: false };
    }
  } catch (err) {
    console.warn(`[weatherService] Open-Meteo 失败 (${cityId}): ${err.message}`);
  }

  // 全部失败，返回null
  return null;
}

function getWeatherMock(cityId) {
  return null;
}

module.exports = {
  getWeather,
  getWeatherMock,
  clearCache,
  WEATHER_CACHE_TTL_MS,
  WEATHER_API_TIMEOUT_MS,
  CITY_COORDS,
  // 暴露Open-Meteo函数供直接调用
  fetchFromOpenMeteo
};
