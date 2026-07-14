/**
 * 旅格 Travel Persona · 免Key地理编码服务（多源策略）
 *
 * 数据源优先级：
 * 1. Nominatim（OSM，免费无需Key，每秒1次限制）
 * 2. Open-Meteo Geocoding（免费无需Key，适合主要城市）
 * 3. 本地城市坐标表（20座城市内置数据，离线可用）
 *
 * 所有源都失败时返回空数组/null，不伪造数据（总纲18.3）。
 */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OPEN_METEO_GEO_BASE = 'https://geocoding-api.open-meteo.com/v1/search';

// 请求队列：确保不超过1 req/s（Nominatim限制）
let _lastRequestTime = 0;
const MIN_REQUEST_INTERVAL_MS = 1100;

function wait() {
  const now = Date.now();
  const waitTime = Math.max(0, MIN_REQUEST_INTERVAL_MS - (now - _lastRequestTime));
  _lastRequestTime = now + waitTime;
  return new Promise(resolve => setTimeout(resolve, waitTime));
}

const TIMEOUT_MS = 15000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeout || TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'TravelPersona/1.0 (travel-plan-app)' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ========== 本地城市坐标（20座，离线兜底） ==========

const LOCAL_CITIES = {
  '大理':     { lat: 25.6065, lng: 100.2670, province: '云南' },
  '丽江':     { lat: 26.8721, lng: 100.2258, province: '云南' },
  '厦门':     { lat: 24.4798, lng: 118.0894, province: '福建' },
  '青海湖':   { lat: 36.9029, lng: 100.1655, province: '青海' },
  '成都':     { lat: 30.5728, lng: 104.0668, province: '四川' },
  '苏州':     { lat: 31.2989, lng: 120.5853, province: '江苏' },
  '杭州':     { lat: 30.2741, lng: 120.1551, province: '浙江' },
  '北京':     { lat: 39.9042, lng: 116.4074, province: '北京' },
  '茂名':     { lat: 21.6627, lng: 110.9255, province: '广东' },
  '重庆':     { lat: 29.4316, lng: 106.9123, province: '重庆' },
  '西安':     { lat: 34.3416, lng: 108.9398, province: '陕西' },
  '广州':     { lat: 23.1291, lng: 113.2644, province: '广东' },
  '长沙':     { lat: 28.2282, lng: 112.9388, province: '湖南' },
  '上海':     { lat: 31.2304, lng: 121.4737, province: '上海' },
  '深圳':     { lat: 22.5431, lng: 114.0579, province: '广东' },
  '南京':     { lat: 32.0603, lng: 118.7969, province: '江苏' },
  '武汉':     { lat: 30.5928, lng: 114.3055, province: '湖北' },
  '郑州':     { lat: 34.7466, lng: 113.6254, province: '河南' },
  '洛阳':     { lat: 34.6197, lng: 112.4540, province: '河南' },
  '济南':     { lat: 36.6512, lng: 117.1201, province: '山东' },
  '泉州':     { lat: 24.8741, lng: 118.6757, province: '福建' },
  '青岛':     { lat: 36.0671, lng: 120.3826, province: '山东' },
  '大连':     { lat: 38.9140, lng: 121.6147, province: '辽宁' },
  '景德镇':   { lat: 29.2687, lng: 117.1784, province: '江西' },
  '黄山':     { lat: 30.1376, lng: 118.1694, province: '安徽' }
};

/**
 * 本地城市名模糊匹配
 * @param {string} query
 * @returns {Array} 匹配结果
 */
function localGeocode(query) {
  const results = [];
  const q = query.trim();

  for (const [name, info] of Object.entries(LOCAL_CITIES)) {
    if (name.includes(q) || q.includes(name)) {
      results.push({
        displayName: `中国${info.province}省${name}市`,
        lat: info.lat,
        lng: info.lng,
        type: 'city',
        importance: 1.0,
        source: 'local'
      });
    }
  }

  return results;
}

/**
 * 本地逆地理编码（找最近城市）
 */
function localReverseGeocode(lat, lng) {
  let minDist = Infinity;
  let closest = null;

  for (const [name, info] of Object.entries(LOCAL_CITIES)) {
    const dist = Math.sqrt(Math.pow(lat - info.lat, 2) + Math.pow(lng - info.lng, 2));
    if (dist < minDist) {
      minDist = dist;
      closest = { name, ...info };
    }
  }

  if (!closest || minDist > 2) return null; // 超过2度不返回

  return {
    displayName: `中国${closest.province}省${closest.name}市（附近）`,
    lat: closest.lat,
    lng: closest.lng,
    type: 'city',
    source: 'local'
  };
}

// ========== Nominatim 在线 ==========

async function nominatimGeocode(query) {
  await wait();
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    'accept-language': 'zh'
  });

  const res = await fetchWithTimeout(
    `${NOMINATIM_BASE}/search?${params.toString()}`
  );
  const json = await res.json();

  return (json || []).map(item => ({
    displayName: item.display_name,
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    type: item.type,
    importance: item.importance,
    source: 'nominatim'
  }));
}

async function nominatimReverseGeocode(lat, lng) {
  await wait();
  const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=zh&zoom=10`;

  const res = await fetchWithTimeout(url);
  const json = await res.json();

  if (!json || json.error) return null;

  return {
    displayName: json.display_name,
    lat: parseFloat(json.lat),
    lng: parseFloat(json.lon),
    type: json.type,
    address: json.address,
    source: 'nominatim'
  };
}

// ========== Open-Meteo Geocoding 在线 ==========

async function openMeteoGeocode(query) {
  const params = new URLSearchParams({
    name: query,
    count: '5',
    language: 'zh'
  });

  const res = await fetchWithTimeout(
    `${OPEN_METEO_GEO_BASE}?${params.toString()}`,
    { timeout: 8000 }
  );
  const json = await res.json();

  if (!json.results || json.results.length === 0) return [];

  return json.results.map(item => ({
    displayName: item.name + (item.admin1 ? `, ${item.admin1}` : '') + (item.country ? `, ${item.country}` : ''),
    lat: item.latitude,
    lng: item.longitude,
    type: item.feature_code || 'city',
    importance: undefined,
    source: 'open-meteo-geo'
  }));
}

// ========== 核心入口（多源降级） ==========

/**
 * 地理编码：地址 → 坐标
 * 优先级：Nominatim → Open-Meteo Geocoding → 本地坐标
 *
 * @param {string} query - 查询文本（如"大理古城"）
 * @param {Object} [options] - { limit: 5, preferLocal: false }
 * @returns {Promise<Array>}
 */
async function geocode(query, options = {}) {
  const q = query.trim();

  // 0. 本地精确匹配优先（内置20城数据最准确，避免在线源歧义如"大理"→四川）
  const localExact = localGeocode(q);
  if (localExact.length > 0 && localExact.some(r => q.includes(r.displayName.slice(4, 6)) || LOCAL_CITIES[q])) {
    return localExact;
  }

  // 1. 尝试 Nominatim（数据最全，适合POI级别查询）
  try {
    const results = await nominatimGeocode(q);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn(`[geocode] Nominatim 不可用: ${err.message}`);
  }

  // 2. 尝试 Open-Meteo Geocoding（适合主要城市）
  try {
    const results = await openMeteoGeocode(q);
    if (results.length > 0) return results;
  } catch (err) {
    console.warn(`[geocode] Open-Meteo Geocoding 不可用: ${err.message}`);
  }

  // 3. 本地模糊匹配
  const localFuzzy = localGeocode(q);
  if (localFuzzy.length > 0) {
    console.log(`[geocode] 使用本地坐标: ${q}`);
    return localFuzzy;
  }

  console.warn(`[geocode] 所有数据源均未找到: ${q}`);
  return [];
}

/**
 * 逆地理编码：坐标 → 地址
 * 优先级：Nominatim → 本地最近城市
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {Promise<Object|null>}
 */
async function reverseGeocode(lat, lng) {
  // 1. Nominatim
  try {
    const result = await nominatimReverseGeocode(lat, lng);
    if (result) return result;
  } catch (err) {
    console.warn(`[reverseGeocode] Nominatim 不可用: ${err.message}`);
  }

  // 2. 本地最近城市
  const local = localReverseGeocode(lat, lng);
  if (local) {
    console.log(`[reverseGeocode] 使用本地最近城市匹配`);
    return local;
  }

  return null;
}

/**
 * 搜索POI（使用Overpass API）
 *
 * @param {number} lat - 中心纬度
 * @param {number} lng - 中心经度
 * @param {number} radius - 搜索半径（米）
 * @param {string} [tag] - OSM标签筛选
 * @returns {Promise<Array>}
 */
async function searchPOI(lat, lng, radius = 5000, tag = 'tourism') {
  const query = `[out:json];node["tourism"="attraction"](around:${radius},${lat},${lng});out body;`;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

  try {
    const res = await fetchWithTimeout(url);
    const json = await res.json();

    return (json.elements || []).map(item => ({
      id: item.id,
      type: item.tags?.tourism || item.tags?.amenity || 'poi',
      name: item.tags?.name || item.tags?.['name:zh'] || '',
      lat: item.lat,
      lng: item.lon,
      tags: item.tags,
      source: 'overpass'
    }));
  } catch (err) {
    console.warn(`[nominatim] searchPOI 失败: ${err.message}`);
    return [];
  }
}

module.exports = {
  geocode,
  reverseGeocode,
  searchPOI,
  // 暴露本地查找函数供直接使用
  localGeocode,
  localReverseGeocode
};
