/**
 * 旅格 Travel Persona · 天气服务
 *
 * 职责：
 * 1. 接入真实天气 API（和风天气优先）
 * 2. 6 小时缓存，同城共享
 * 3. 失败时降级为跳过天气过滤
 * 4. 环境变量配置 API Key
 *
 * 环境变量：
 * - WEATHER_API_KEY: 和风天气 API Key
 * - WEATHER_API_TYPE: 'qweather' | 'openweather' | 'mock'（默认 mock）
 */

const { NetworkError } = require('../utils/errors');

// 缓存配置
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 小时
const CACHE_MAX_SIZE = 500; // 最大缓存条目数（防止内存泄漏）
const cache = new Map();

// 缓存清理：超过最大条目时删除最旧条目
function enforceCacheSizeLimit() {
  if (cache.size <= CACHE_MAX_SIZE) return;
  // 按时间戳排序，删除最旧的条目
  var entries = Array.from(cache.entries())
    .sort(function(a, b) { return a[1].timestamp - b[1].timestamp; });
  var toDelete = entries.slice(0, entries.length - CACHE_MAX_SIZE);
  toDelete.forEach(function(entry) { cache.delete(entry[0]); });
  console.warn('[WeatherService] 缓存清理: 删除 ' + toDelete.length + ' 条过期/最旧条目');
}

// 和风天气城市 ID 映射（部分）
const QWEATHER_CITY_IDS = {
  dali: '101290201',
  lijiang: '101291401',
  xiamen: '101230201',
  chengdu: '101270101',
  chongqing: '101040100',
  hangzhou: '101210101',
  xian: '101110101',
  changsha: '101250101',
  nanjing: '101190101',
  suzhou: '101190401',
  qingdao: '101120201',
  guilin: '101300501',
  sanya: '101310201',
  lasa: '101140101',
  kunming: '101290101',
  quanzhou: '101230501',
  wuhan: '101200101',
  beijing: '101010100',
  shanghai: '101020100',
  guangzhou: '101280101'
};

/**
 * 获取缓存键
 */
function getCacheKey(cityId, days) {
  return `${cityId}_${days}`;
}

/**
 * 检查缓存
 */
function getFromCache(cityId, days) {
  const key = getCacheKey(cityId, days);
  const entry = cache.get(key);

  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.data;
  }

  return null;
}

/**
 * 写入缓存
 */
function setCache(cityId, days, data) {
  const key = getCacheKey(cityId, days);
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
  enforceCacheSizeLimit(); // 防止内存泄漏
}

/**
 * 清除全部缓存
 */
function clearCache() {
  cache.clear();
}

/**
 * 判断是否为极端天气
 * @param {string} condition - 天气状况描述
 * @returns {boolean}
 */
function isExtremeWeather(condition) {
  if (!condition) return false;

  const extremeKeywords = [
    '暴雨', '暴雪', '台风', '沙尘暴', '霾', '严重霾',
    '冰雹', '冻雨', '暴风', '龙卷风', '高温', '寒潮'
  ];

  return extremeKeywords.some(kw => condition.includes(kw));
}

/**
 * 和风天气 API 调用
 * @param {string} cityId - 城市 ID
 * @param {number} days - 天数（1-7）
 * @returns {Promise<Object>} 天气数据
 */
async function fetchQWeather(cityId, days = 7) {
  const apiKey = process.env.WEATHER_API_KEY;
  if (!apiKey) {
    throw new NetworkError('未设置 WEATHER_API_KEY 环境变量');
  }

  const locationId = QWEATHER_CITY_IDS[cityId];
  if (!locationId) {
    throw new NetworkError(`城市 "${cityId}" 不在和风天气映射表中`, { cityId });
  }

  const url = `https://devapi.qweather.com/v7/weather/7d?location=${locationId}&key=${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new NetworkError(`和风天气 API 错误: ${response.status}`, { cityId, status: response.status });
  }

  const data = await response.json();

  if (data.code !== '200') {
    throw new NetworkError(`和风天气 API 返回错误: ${data.code}`, { cityId, code: data.code });
  }

  return {
    city: cityId,
    days: Math.min(days, data.daily.length),
    daily: data.daily.slice(0, days).map(d => ({
      date: d.fxDate,
      temp: `${d.tempMin}℃ ~ ${d.tempMax}℃`,
      condition: d.textDay,
      hasExtremeWeather: isExtremeWeather(d.textDay),
      humidity: d.humidity,
      wind: d.windDirDay
    })),
    source: 'qweather',
    cached: false
  };
}

/**
 * Mock 天气数据（降级用）
 */
function fetchMockWeather(cityId, days = 7) {
  const conditions = ['晴', '多云', '阴', '小雨', '晴', '多云', '晴'];
  const temps = ['18℃ ~ 28℃', '20℃ ~ 30℃', '15℃ ~ 25℃', '16℃ ~ 22℃', '18℃ ~ 27℃', '19℃ ~ 29℃', '20℃ ~ 31℃'];

  return {
    city: cityId,
    days: Math.min(days, 7),
    daily: Array.from({ length: Math.min(days, 7) }, (_, i) => ({
      date: new Date(Date.now() + i * 86400000).toISOString().split('T')[0],
      temp: temps[i],
      condition: conditions[i],
      hasExtremeWeather: false,
    })),
    source: 'mock',
    cached: false,
    note: '使用模拟天气数据，请配置 WEATHER_API_KEY 以接入真实天气'
  };
}

/**
 * 获取天气数据（统一入口）
 *
 * @param {string} cityId - 城市 ID
 * @param {Object} options
 * @param {number} options.days - 天数（默认 7）
 * @param {boolean} options.forceRefresh - 是否强制刷新（忽略缓存）
 * @returns {Promise<Object>} 天气数据 { city, days, daily: [...], source }
 */
async function getWeather(cityId, options = {}) {
  const { days = 7, forceRefresh = false } = options;

  // 检查缓存
  if (!forceRefresh) {
    const cached = getFromCache(cityId, days);
    if (cached) {
      return { ...cached, cached: true };
    }
  }

  const apiType = process.env.WEATHER_API_TYPE || 'mock';

  try {
    let result;

    switch (apiType) {
      case 'qweather':
        result = await fetchQWeather(cityId, days);
        break;

      case 'mock':
      default:
        result = fetchMockWeather(cityId, days);
        break;
    }

    // 写入缓存
    setCache(cityId, days, result);

    return result;
  } catch (err) {
    console.warn(`[WeatherService] 获取天气失败 (${cityId}):`, err.message);

    // 降级：返回 mock 数据
    const fallback = fetchMockWeather(cityId, days);
    fallback.note = '天气数据获取失败，使用模拟数据';
    fallback.fallback = true;

    return fallback;
  }
}

/**
 * 批量获取多个城市的天气
 * @param {Array} cityIds - 城市 ID 列表
 * @param {Object} options
 * @returns {Promise<Object>} { cityId: weatherData, ... }
 */
async function getWeatherBatch(cityIds, options = {}) {
  const results = {};

  // 并行请求（但每个城市独立缓存）
  const promises = cityIds.map(async (cityId) => {
    const weather = await getWeather(cityId, options);
    return { cityId, weather };
  });

  const settled = await Promise.allSettled(promises);

  for (const result of settled) {
    if (result.status === 'fulfilled') {
      results[result.value.cityId] = result.value.weather;
    } else {
      results[result.value?.cityId || 'unknown'] = {
        error: result.reason?.message || '未知错误',
        fallback: true
      };
    }
  }

  return results;
}

/**
 * 从天气数据中提取极端天气标记
 * 用于 scoring.js 的 weatherFilter
 *
 * @param {Object} weatherData - getWeather 返回的天气数据
 * @returns {Object} { hasExtremeWeather: boolean, note: string }
 */
function extractExtremeWeatherFlag(weatherData) {
  if (!weatherData || !Array.isArray(weatherData.daily)) {
    return { hasExtremeWeather: false, note: null };
  }

  const extremeDays = weatherData.daily.filter(d => d.hasExtremeWeather);

  if (extremeDays.length > 0) {
    return {
      hasExtremeWeather: true,
      note: `${extremeDays.length} 天极端天气: ${extremeDays.map(d => d.condition).join(', ')}`
    };
  }

  return { hasExtremeWeather: false, note: null };
}

/**
 * 获取缓存统计
 */
function getCacheStats() {
  return {
    size: cache.size,
    entries: Array.from(cache.entries()).map(([key, entry]) => ({
      key,
      age: Date.now() - entry.timestamp,
      expired: Date.now() - entry.timestamp > CACHE_TTL
    }))
  };
}

module.exports = {
  getWeather,
  getWeatherBatch,
  extractExtremeWeatherFlag,
  clearCache,
  getCacheStats,
  isExtremeWeather,
  QWEATHER_CITY_IDS
};