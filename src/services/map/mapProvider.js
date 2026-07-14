/**
 * 旅格 Travel Persona · Phase 2 地图 Provider 抽象层
 *
 * 设计目标：
 * 1. 供应商无关接口 —— 上层只需调用统一方法，不关心底层是百度/高德/Google
 * 2. 离线快照优先 —— 默认使用 MockMapProvider，依赖 cityRecords.js 静态数据
 * 3. 统一返回格式 —— 所有方法返回 { data, source, fetchedAt, cached }
 * 4. 超时保护 —— 所有在线 API 调用有 10 秒超时，防止阻塞主流程
 * 5. 内存缓存 —— 短 TTL 缓存，减少重复调用开销
 *
 * 对应总纲：
 * - 18.3 禁止用假数据伪装实时能力（无 Key 时不伪造，明确标记 source）
 * - 9.2 数据质量字段（coverageTier / lastVerifiedAt）
 */

const { NetworkError } = require('../../utils/errors');
const nominatimProvider = require('./nominatimProvider');
const { McpMapProvider } = require('./mcpMapProvider');

// ========== 常量配置 ==========

/** API 调用超时时间（毫秒） */
const API_TIMEOUT_MS = 10000;

/** 内存缓存默认 TTL（毫秒）—— 30 分钟 */
const CACHE_TTL_MS = 30 * 60 * 1000;

/** 百度地图 API 基础地址 */
const BAIDU_API_BASE = 'https://api.map.baidu.com';

// ========== 20 座城市的近似坐标（用于 Mock 模式生成 POI 伪坐标） ==========
// 坐标来源：公开地理数据，精度到城市中心级别，足以支撑路线距离估算
const CITY_COORDINATES = {
  dali:            { lat: 25.6065, lng: 100.2670 },
  lijiang:         { lat: 26.8721, lng: 100.2258 },
  xiamen:          { lat: 24.4798, lng: 118.0894 },
  qinghaihu:       { lat: 36.9029, lng: 100.1655 },
  chengdu:         { lat: 30.5728, lng: 104.0668 },
  suzhou:          { lat: 31.2989, lng: 120.5853 },
  hangzhou:        { lat: 30.2741, lng: 120.1551 },
  beijing:         { lat: 39.9042, lng: 116.4074 },
  chongqing:       { lat: 29.4316, lng: 106.9123 },
  xian:            { lat: 34.3416, lng: 108.9398 },
  guangzhou:       { lat: 23.1291, lng: 113.2644 },
  changsha:        { lat: 28.2282, lng: 112.9388 },
  shanghai:        { lat: 31.2304, lng: 121.4737 },
  shenzhen:        { lat: 22.5431, lng: 114.0579 },
  nanjing:         { lat: 32.0603, lng: 118.7969 },
  qingdao:         { lat: 36.0671, lng: 120.3826 },
  dalian:          { lat: 38.9140, lng: 121.6147 },
  dali_digital:    { lat: 25.6065, lng: 100.2670 },
  lijiang_digital: { lat: 26.8721, lng: 100.2258 },
  chengdu_digital: { lat: 30.5728, lng: 104.0668 },
  hangzhou_digital:{ lat: 30.2741, lng: 120.1551 }
};

// ========== 工具函数 ==========

/**
 * Haversine 公式计算两个经纬度坐标之间的球面距离（公里）
 * @param {number} lat1 - 起点纬度
 * @param {number} lng1 - 起点经度
 * @param {number} lat2 - 终点纬度
 * @param {number} lng2 - 终点经度
 * @returns {number} 距离（公里）
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // 地球半径（公里）
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return parseFloat((R * c).toFixed(2));
}

/**
 * 生成统一格式的返回对象
 * @param {*} data - 实际数据
 * @param {string} source - 数据来源（'baidu' / 'mock'）
 * @param {boolean} cached - 是否来自缓存
 * @returns {{ data: *, source: string, fetchedAt: string, cached: boolean }}
 */
function wrapResult(data, source, cached = false) {
  return {
    data,
    source,
    fetchedAt: new Date().toISOString(),
    cached
  };
}

/**
 * 带超时的 fetch 封装
 * @param {string} url - 请求地址
 * @param {Object} options - fetch 选项
 * @param {number} timeoutMs - 超时毫秒
 * @returns {Promise<Object>} 解析后的 JSON
 * @throws {NetworkError} 超时或请求失败时抛出
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    if (!res.ok) {
      throw new NetworkError(`地图 API 返回非 200 状态码: ${res.status}`, {
        url,
        status: res.status
      });
    }
    return await res.json();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new NetworkError(`地图 API 调用超时（${timeoutMs}ms）`, {
        url,
        timeoutMs
      });
    }
    if (err instanceof NetworkError) throw err;
    throw new NetworkError(`地图 API 调用失败: ${err.message}`, {
      url,
      originalError: err.message
    });
  } finally {
    clearTimeout(timer);
  }
}

// ========== 简单内存缓存 ==========

/**
 * TTL 内存缓存
 * 缓存键为字符串，值带过期时间戳
 */
class TtlCache {
  constructor(ttlMs = CACHE_TTL_MS) {
    this._store = new Map();
    this._ttlMs = ttlMs;
  }

  /**
   * 读取缓存
   * @param {string} key
   * @returns {*|null} 命中返回值，未命中返回 null
   */
  get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * 写入缓存
   * @param {string} key
   * @param {*} value
   * @param {number} [customTtlMs] 自定义 TTL
   */
  set(key, value, customTtlMs) {
    const ttl = customTtlMs || this._ttlMs;
    this._store.set(key, {
      value,
      expiresAt: Date.now() + ttl
    });
  }

  /** 清空缓存 */
  clear() {
    this._store.clear();
  }
}

// ================================================================
//  MapProvider 基类
// ================================================================

/**
 * 地图 Provider 抽象基类
 *
 * 定义供应商无关的统一接口，所有具体 Provider 实现这些方法。
 * 子类必须实现以下方法，返回统一格式 { data, source, fetchedAt, cached }：
 *   - searchPOI(query, options)
 *   - getPOIDetail(poiId)
 *   - getRoute(origin, destination, waypoints)
 *   - getDistanceMatrix(origins, destinations)
 *   - geocode(address)
 *   - reverseGeocode(lat, lng)
 */
class MapProvider {
  constructor(name) {
    this.name = name;
    this._cache = new TtlCache();
  }

  /**
   * 搜索 POI（兴趣点）
   * @param {string} query - 搜索关键词（如 "大理 洱海"）
   * @param {Object} [options] - 可选参数 { city, pageSize, type }
   * @returns {Promise<{data: Array, source: string, fetchedAt: string, cached: boolean}>}
   */
  async searchPOI(query, options = {}) {
    throw new Error(`${this.name}.searchPOI 未实现`);
  }

  /**
   * 获取 POI 详情
   * @param {string} poiId - POI 唯一标识
   * @returns {Promise<{data: Object|null, source: string, fetchedAt: string, cached: boolean}>}
   */
  async getPOIDetail(poiId) {
    throw new Error(`${this.name}.getPOIDetail 未实现`);
  }

  /**
   * 获取路线规划
   * @param {{lat: number, lng: number}} origin - 起点
   * @param {{lat: number, lng: number}} destination - 终点
   * @param {Array<{lat: number, lng: number}>} [waypoints] - 途经点
   * @param {string} [mode] - 出行方式（driving/walking/transit）
   * @param {Object} [options] - 日期、时段和跨城策略
   * @returns {Promise<{data: Object, source: string, fetchedAt: string, cached: boolean}>}
   */
  async getRoute(origin, destination, waypoints = [], mode = 'driving', options = {}) {
    throw new Error(`${this.name}.getRoute 未实现`);
  }

  /**
   * 获取距离矩阵
   * @param {Array<{lat:number,lng:number}>} origins - 起点列表
   * @param {Array<{lat:number,lng:number}>} destinations - 终点列表
   * @returns {Promise<{data: Object, source: string, fetchedAt: string, cached: boolean}>}
   */
  async getDistanceMatrix(origins, destinations) {
    throw new Error(`${this.name}.getDistanceMatrix 未实现`);
  }

  /**
   * 地理编码：地址 → 坐标
   * @param {string} address - 地址字符串
   * @returns {Promise<{data: Object|null, source: string, fetchedAt: string, cached: boolean}>}
   */
  async geocode(address) {
    throw new Error(`${this.name}.geocode 未实现`);
  }

  /**
   * 逆地理编码：坐标 → 地址
   * @param {number} lat - 纬度
   * @param {number} lng - 经度
   * @returns {Promise<{data: Object|null, source: string, fetchedAt: string, cached: boolean}>}
   */
  async reverseGeocode(lat, lng) {
    throw new Error(`${this.name}.reverseGeocode 未实现`);
  }

  /**
   * 带缓存的调用包装器
   * @param {string} cacheKey - 缓存键
   * @param {Function} fetchFn - 实际获取数据的异步函数
   * @returns {Promise<{data: *, source: string, fetchedAt: string, cached: boolean}>}
   */
  async _cachedCall(cacheKey, fetchFn) {
    const cached = this._cache.get(cacheKey);
    if (cached !== null) {
      return wrapResult(cached, this.name, true);
    }
    const data = await fetchFn();
    this._cache.set(cacheKey, data);
    return wrapResult(data, this.name, false);
  }
}

function collectTransitVehicles(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach(item => collectTransitVehicles(item, output));
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if (value.vehicle_info && typeof value.vehicle_info === 'object') {
    const info = value.vehicle_info;
    const detail = info.detail && typeof info.detail === 'object' ? info.detail : {};
    output.push({
      type: Number(info.type) || 0,
      name: detail.name || '',
      price: Number(detail.price) || 0,
      departureStation: detail.departure_station || detail.start_info?.start_name || '',
      arrivalStation: detail.arrive_station || detail.end_info?.end_name || '',
      departureTime: detail.departure_time || detail.start_info?.start_time || '',
      arrivalTime: detail.arrive_time || detail.end_info?.end_time || ''
    });
  }
  ['steps', 'schemes', 'sub_steps'].forEach(key => {
    if (value[key]) collectTransitVehicles(value[key], output);
  });
  return output;
}

function parseBaiduTransitRoutes(routes) {
  return (Array.isArray(routes) ? routes : []).map(route => {
    const vehicles = collectTransitVehicles(route.steps || []);
    const intercityVehicles = vehicles.filter(item => [1, 2, 6].includes(item.type));
    const vehiclePrice = intercityVehicles.reduce((sum, item) => sum + item.price, 0);
    return {
      distance: Number(route.distance) || 0,
      duration: Number(route.duration) || 0,
      arriveTime: route.arrive_time || '',
      price: Number(route.price) || vehiclePrice || 0,
      transfers: Math.max(0, intercityVehicles.length - 1),
      vehicles,
      steps: (route.steps || []).map(step => ({
        instruction: step.instructions || step.instruction || '',
        distance: Number(step.distance) || 0,
        duration: Number(step.duration) || 0
      }))
    };
  });
}

// ================================================================
//  BaiduMapProvider —— 百度地图 API 实现
// ================================================================

/**
 * 百度地图 Provider
 *
 * 通过百度地图开放平台 API 实现各项地图能力。
 * 需要环境变量 BAIDU_MAP_API_KEY 配置 AK。
 * 所有调用有 10 秒超时保护，结果走内存缓存。
 */
class BaiduMapProvider extends MapProvider {
  constructor() {
    super('baidu');
    this.apiKey = process.env.BAIDU_MAP_API_KEY || '';
    this.apiBase = BAIDU_API_BASE;
    if (!this.apiKey) {
      console.warn('[BaiduMapProvider] 未配置 BAIDU_MAP_API_KEY，在线功能将不可用');
    }
  }

  /** 是否已配置 API Key */
  isConfigured() {
    return !!this.apiKey;
  }

  async searchPOI(query, options = {}) {
    const params = new URLSearchParams({
      query: String(query),
      ak: this.apiKey,
      output: 'json',
      page_size: String(options.pageSize || 20),
      page_num: '0'
    });
    if (options.city) params.set('region', options.city);

    return this._cachedCall(`poi:search:${query}:${options.city || ''}`, async () => {
      const json = await fetchWithTimeout(
        `${this.apiBase}/place/v2/search?${params.toString()}`
      );
      return (json.results || []).map((r) => ({
        id: r.uid,
        name: r.name,
        lat: r.location ? r.location.lat : null,
        lng: r.location ? r.location.lng : null,
        address: r.address || '',
        type: r.detail_info ? r.detail_info.type : ''
      }));
    });
  }

  async getPOIDetail(poiId) {
    return this._cachedCall(`poi:detail:${poiId}`, async () => {
      const params = new URLSearchParams({
        uid: String(poiId),
        ak: this.apiKey,
        output: 'json',
        scope: '2'
      });
      const json = await fetchWithTimeout(
        `${this.apiBase}/place/v2/detail?${params.toString()}`
      );
      if (!json.result) return null;
      const r = json.result;
      return {
        id: r.uid,
        name: r.name,
        lat: r.location ? r.location.lat : null,
        lng: r.location ? r.location.lng : null,
        address: r.address || '',
        telephone: r.telephone || '',
        openHours: r.detail_info ? r.detail_info.open_hours : '',
        type: r.detail_info ? r.detail_info.type : ''
      };
    });
  }

  async getRoute(origin, destination, waypoints = [], mode = 'driving', options = {}) {
    const optionKey = mode === 'transit'
      ? `${options.departureDate || ''}:${options.departureTime || ''}:${options.tacticsIntercity ?? 0}:${options.transTypeIntercity ?? 0}`
      : '';
    const key = `route:${mode}:${origin.lat},${origin.lng}:${destination.lat},${destination.lng}:${waypoints.map(w => `${w.lat},${w.lng}`).join('|')}:${optionKey}`;
    return this._cachedCall(key, async () => {
      // 百度路线规划：direction API
      const endpoint = mode === 'walking' ? 'direction/v2/walking'
        : mode === 'transit' ? 'direction/v2/transit'
        : 'direction/v2/driving';

      const params = new URLSearchParams({
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        ak: this.apiKey,
        output: 'json'
      });
      if (waypoints.length > 0 && mode === 'driving') {
        params.set('waypoints', waypoints.map(w => `${w.lat},${w.lng}`).join('|'));
      }
      if (mode === 'transit') {
        params.set('coord_type', options.coordType || 'bd09ll');
        params.set('ret_coordtype', options.returnCoordType || 'bd09ll');
        params.set('tactics_incity', String(options.tacticsIncity ?? 1));
        params.set('tactics_intercity', String(options.tacticsIntercity ?? 0));
        params.set('trans_type_intercity', String(options.transTypeIntercity ?? 0));
        params.set('page_size', String(options.pageSize || 3));
        params.set('page_index', '1');
        if (options.departureDate) params.set('departure_date', String(options.departureDate));
        if (options.departureTime) params.set('departure_time', String(options.departureTime));
      }

      const json = await fetchWithTimeout(
        `${this.apiBase}/${endpoint}?${params.toString()}`
      );
      if (Number(json.status) !== 0) {
        throw new NetworkError(`百度路线规划失败，状态码: ${json.status}`, {
          status: json.status,
          providerMessage: json.message || ''
        });
      }
      const routes = json.result ? (json.result.routes || []) : [];
      if (routes.length === 0) {
        return { distance: 0, duration: 0, steps: [] };
      }
      if (mode === 'transit') {
        const alternatives = parseBaiduTransitRoutes(routes);
        return { ...alternatives[0], alternatives };
      }
      const route = routes[0];
      return {
        distance: route.distance,  // 米
        duration: route.duration,  // 秒
        steps: (route.steps || []).map(s => ({
          instruction: s.instructions || s.instruction || '',
          distance: s.distance || 0,
          duration: s.duration || 0
        }))
      };
    });
  }

  async getDistanceMatrix(origins, destinations) {
    const origStr = origins.map(o => `${o.lat},${o.lng}`).join('|');
    const destStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');
    const key = `matrix:${origStr}:${destStr}`;
    return this._cachedCall(key, async () => {
      const params = new URLSearchParams({
        origins: origStr,
        destinations: destStr,
        ak: this.apiKey,
        output: 'json'
      });
      const json = await fetchWithTimeout(
        `${this.apiBase}/routematrix/v2/driving?${params.toString()}`
      );
      return {
        rows: (json.result || []).map(row =>
          (row.elements || []).map(el => ({
            distance: el.distance ? el.distance.value : 0,
            duration: el.duration ? el.duration.value : 0
          }))
        )
      };
    });
  }

  async geocode(address) {
    // 未配置百度 Key 时，降级到 Nominatim（免Key多源策略）
    if (!this.isConfigured()) {
      const results = await nominatimProvider.geocode(address);
      if (results.length > 0) {
        const r = results[0];
        return wrapResult({
          lat: r.lat,
          lng: r.lng,
          sourceName: r.displayName,
          precise: true
        }, r.source, false);
      }
      return wrapResult(null, 'none', false);
    }

    return this._cachedCall(`geocode:${address}`, async () => {
      const params = new URLSearchParams({
        address: String(address),
        ak: this.apiKey,
        output: 'json'
      });
      const json = await fetchWithTimeout(
        `${this.apiBase}/geocoding/v3/?${params.toString()}`
      );
      if (!json.result) return null;
      return {
        lat: json.result.lat,
        lng: json.result.lng,
        precise: json.result.precise,
        confidence: json.result.confidence
      };
    });
  }

  async reverseGeocode(lat, lng) {
    // 未配置百度 Key 时，降级到 Nominatim
    if (!this.isConfigured()) {
      const result = await nominatimProvider.reverseGeocode(lat, lng);
      if (result) {
        return wrapResult({
          address: result.displayName,
          province: '',
          city: '',
          district: '',
          street: ''
        }, result.source, false);
      }
      return wrapResult(null, 'none', false);
    }

    return this._cachedCall(`reverse:${lat},${lng}`, async () => {
      const params = new URLSearchParams({
        location: `${lat},${lng}`,
        ak: this.apiKey,
        output: 'json'
      });
      const json = await fetchWithTimeout(
        `${this.apiBase}/reverse_geocoding/v3/?${params.toString()}`
      );
      if (!json.result) return null;
      const comp = json.result.addressComponent || {};
      return {
        address: json.result.formatted_address || '',
        province: comp.province || '',
        city: comp.city || '',
        district: comp.district || '',
        street: comp.street || ''
      };
    });
  }
}

// ================================================================
//  MockMapProvider —— 离线快照实现
// ================================================================

/**
 * Mock 地图 Provider
 *
 * 使用 cityRecords.js 中的静态 POI 数据作为离线快照。
 * 所有返回数据的 source 标记为 'mock'，明确告知调用方这不是实时数据。
 *
 * POI 伪坐标生成策略：
 * - 以城市中心坐标为基准
 * - 按 POI 在城市列表中的索引做确定性偏移（~0.01~0.05 度）
 * - 保证同城市不同 POI 坐标不同，支撑距离矩阵计算
 */
class MockMapProvider extends MapProvider {
  constructor() {
    super('mock');
    // 延迟加载 cityRecords，避免循环依赖问题
    this._poiIndex = null; // 预处理的 POI 全量索引
  }

  /**
   * 加载并预处理 cityRecords.js 中的 POI 数据
   * 为每个 POI 生成唯一 id 和确定性伪坐标
   * @returns {Array} POI 列表
   */
  _loadPOIs() {
    if (this._poiIndex) return this._poiIndex;

    // CITIES 数据当前由 cityDatabase.js 导出（含原始 POI 数据）
    const { CITIES } = require('../../data/cityDatabase');
    const pois = [];

    CITIES.forEach((city) => {
      const baseCoord = CITY_COORDINATES[city.id] || { lat: 30, lng: 110 };
      (city.pois || []).forEach((poi, idx) => {
        // 确定性伪坐标：以城市中心为基准，按索引偏移
        // 纬度偏移：0.02 * (idx+1) 向北递增
        // 经度偏移：0.015 * sin(idx) 东西交替
        const latOffset = 0.02 * (idx + 1) - 0.02 * (city.pois.length / 2);
        const lngOffset = 0.015 * Math.sin(idx * 1.3);
        pois.push({
          id: `${city.id}__poi__${idx}`,
          name: poi.name,
          lat: parseFloat((baseCoord.lat + latOffset).toFixed(6)),
          lng: parseFloat((baseCoord.lng + lngOffset).toFixed(6)),
          type: poi.type,
          zone: poi.zone,
          openHours: poi.openHours,
          indoor: poi.indoor,
          note: poi.note,
          cityId: city.id,
          cityName: city.name
        });
      });
    });

    this._poiIndex = pois;
    return pois;
  }

  async searchPOI(query, options = {}) {
    return this._cachedCall(`poi:search:${query}:${options.city || ''}`, async () => {
      const allPOIs = this._loadPOIs();
      let results = allPOIs;

      // 城市过滤
      if (options.city) {
        const cityLower = String(options.city).toLowerCase();
        results = results.filter(
          (p) =>
            p.cityId === cityLower ||
            p.cityName === options.city
        );
      }

      // 关键词过滤（匹配 name / type / zone）
      if (query) {
        const q = String(query).toLowerCase();
        results = results.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.type && p.type.toLowerCase().includes(q)) ||
            (p.zone && p.zone.toLowerCase().includes(q)) ||
            p.cityName.toLowerCase().includes(q)
        );
      }

      // 分页
      const pageSize = options.pageSize || 20;
      const pageNum = options.pageNum || 0;
      const start = pageNum * pageSize;
      return results.slice(start, start + pageSize);
    });
  }

  async getPOIDetail(poiId) {
    return this._cachedCall(`poi:detail:${poiId}`, async () => {
      const allPOIs = this._loadPOIs();
      return allPOIs.find((p) => p.id === poiId) || null;
    });
  }

  async getRoute(origin, destination, waypoints = [], mode = 'driving', options = {}) {
    const key = `route:${mode}:${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
    return this._cachedCall(key, async () => {
      // 顺序：origin → waypoints → destination
      const points = [origin, ...waypoints, destination];
      let totalDistance = 0;
      let totalDuration = 0;
      const steps = [];

      for (let i = 0; i < points.length - 1; i++) {
        const segDist = haversineDistance(
          points[i].lat, points[i].lng,
          points[i + 1].lat, points[i + 1].lng
        );
        totalDistance += segDist;
        // 粗略估算：驾车 40km/h，步行 5km/h
        const speed = mode === 'walking' ? 5 : mode === 'transit' ? 25 : 40;
        const segDuration = (segDist / speed) * 3600; // 秒
        totalDuration += segDuration;
        steps.push({
          instruction: `从 (${points[i].lat.toFixed(4)}, ${points[i].lng.toFixed(4)}) 前往 (${points[i + 1].lat.toFixed(4)}, ${points[i + 1].lng.toFixed(4)})`,
          distance: parseFloat((segDist * 1000).toFixed(0)), // 转米
          duration: parseFloat(segDuration.toFixed(0))
        });
      }

      return {
        distance: parseFloat((totalDistance * 1000).toFixed(0)), // 米
        duration: parseFloat(totalDuration.toFixed(0)),           // 秒
        steps
      };
    });
  }

  async getDistanceMatrix(origins, destinations) {
    const origStr = origins.map(o => `${o.lat},${o.lng}`).join('|');
    const destStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');
    const key = `matrix:${origStr}:${destStr}`;
    return this._cachedCall(key, async () => {
      const rows = origins.map((o) => {
        const elements = destinations.map((d) => {
          const dist = haversineDistance(o.lat, o.lng, d.lat, d.lng);
          return {
            distance: parseFloat((dist * 1000).toFixed(0)), // 米
            duration: parseFloat(((dist / 40) * 3600).toFixed(0)) // 秒，按 40km/h
          };
        });
        return { elements };
      });
      return { rows };
    });
  }

  async geocode(address) {
    return this._cachedCall(`geocode:${address}`, async () => {
      // Mock：尝试匹配城市名（CITIES 由 cityDatabase.js 导出）
      const { CITIES } = require('../../data/cityDatabase');
      const city = CITIES.find(
        (c) => c.name === address || c.id === address.toLowerCase()
      );
      if (!city) return null;
      const coord = CITY_COORDINATES[city.id] || { lat: 30, lng: 110 };
      return {
        lat: coord.lat,
        lng: coord.lng,
        precise: 0,
        confidence: 50
      };
    });
  }

  async reverseGeocode(lat, lng) {
    return this._cachedCall(`reverse:${lat},${lng}`, async () => {
      // Mock：找最近的城市（CITIES 由 cityDatabase.js 导出）
      const { CITIES } = require('../../data/cityDatabase');
      let nearest = null;
      let minDist = Infinity;
      for (const city of CITIES) {
        const coord = CITY_COORDINATES[city.id];
        if (!coord) continue;
        const dist = haversineDistance(lat, lng, coord.lat, coord.lng);
        if (dist < minDist) {
          minDist = dist;
          nearest = city;
        }
      }
      if (!nearest) return null;
      return {
        address: nearest.name,
        province: '',
        city: nearest.name,
        district: '',
        street: ''
      };
    });
  }
}

// ================================================================
//  工厂函数
// ================================================================

/** 已实例化的 Provider 单例缓存 */
let _activeProvider = null;

/**
 * 根据环境变量获取当前活跃的地图 Provider
 *
 * 选择逻辑：
 * - MAP_PROVIDER=baidu → 使用 BaiduMapProvider（需配置 BAIDU_MAP_API_KEY）
 * - MAP_PROVIDER=mock 或未设置 → 使用 MockMapProvider（默认，离线安全）
 *
 * 降级策略：若选择 baidu 但未配置 API Key，自动降级到 mock 并打印警告
 *
 * @returns {MapProvider} 活跃的 Provider 实例
 */
function getActiveProvider() {
  if (_activeProvider) return _activeProvider;

  const providerType = (process.env.MAP_PROVIDER || 'mock').toLowerCase();

  if (providerType === 'baidu') {
    const baidu = new BaiduMapProvider();
    if (baidu.isConfigured()) {
      _activeProvider = baidu;
    } else {
      // 降级：未配置 Key 时回退到 Mock
      console.warn('[mapProvider] MAP_PROVIDER=baidu 但未配置 BAIDU_MAP_API_KEY，降级到 mock 模式');
      _activeProvider = new MockMapProvider();
    }
  } else if (providerType === 'mcp-baidu') {
    const mcpBaidu = new McpMapProvider();
    if (mcpBaidu.isConfigured()) {
      _activeProvider = mcpBaidu;
      console.log('[mapProvider] 使用 MCP 百度地图 Provider（stdio 模式）');
    } else {
      console.warn('[mapProvider] MAP_PROVIDER=mcp-baidu 但未配置 BAIDU_MAP_AK，降级到 mock 模式');
      _activeProvider = new MockMapProvider();
    }
  } else {
    _activeProvider = new MockMapProvider();
  }

  return _activeProvider;
}

/**
 * 重置 Provider 单例（主要用于测试）
 */
function resetProvider() {
  _activeProvider = null;
}

// ========== 导出 ==========

module.exports = {
  // 基类与实现
  MapProvider,
  BaiduMapProvider,
  MockMapProvider,
  // 工厂
  getActiveProvider,
  resetProvider,
  // 工具函数（供 routeSolver 等模块复用）
  haversineDistance,
  wrapResult,
  parseBaiduTransitRoutes,
  // 常量
  API_TIMEOUT_MS,
  CACHE_TTL_MS,
  CITY_COORDINATES
};
