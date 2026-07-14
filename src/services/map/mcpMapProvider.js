/**
 * 旅格 Travel Persona · MCP 地图 Provider
 *
 * 通过 MCP Server（stdio 模式）调用百度地图 API。
 * 作为 BaiduMapProvider 的替代实现，验证 MCP 链路的端到端可用性。
 *
 * 坐标系：MCP Server 返回 BD-09，Provider 统一转为 WGS-84
 */

const { spawn } = require('node:child_process');
const path = require('node:path');
const { bd09ToWgs84, wgs84ToBd09 } = require('./coordinateSystems');

/**
 * 本地 wrapResult 实现（与 mapProvider.js 保持一致的格式）
 * 避免循环依赖
 */
function wrapResult(data, source, error, cached = false) {
  return {
    data,
    source,
    fetchedAt: new Date().toISOString(),
    cached,
    error: error ? { message: error.message, code: error.code || null } : null,
  };
}

// ============================================================
// MCP 客户端 — 轻量实现，不依赖 MCP SDK
// 通过 stdio 与子进程通信 JSON-RPC
// ============================================================
class McpClient {
  constructor(serverPath, env) {
    this.serverPath = serverPath;
    this.env = env || {};
    this.proc = null;
    this.buffer = '';
    this.pending = new Map();
    this.requestId = 0;
    this.initialized = false;
  }

  async connect() {
    if (this.proc) return;

    this.proc = spawn('node', [this.serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.env },
    });

    this.proc.stdout.on('data', (data) => this._onData(data));
    this.proc.stderr.on('data', (data) => {
      // MCP Server 的日志输出到 stderr
      if (process.env.MCP_DEBUG === '1') {
        console.debug('[mcp-baidu]', data.toString().trim());
      }
    });

    this.proc.on('exit', (code) => {
      console.warn(`[mcp-baidu] Server exited with code ${code}`);
      this.proc = null;
      this.initialized = false;
    });

    // 等待启动
    await new Promise(r => setTimeout(r, 500));

    // 初始化握手
    await this._request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'travel-persona', version: '2.1.0' },
    });

    // 发送 initialized 通知
    this.proc.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
      params: {},
    }) + '\n');

    this.initialized = true;
  }

  _onData(data) {
    this.buffer += data.toString();
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          } else {
            resolve(msg.result);
          }
        }
      } catch (e) {
        // 忽略非 JSON 行
      }
    }
  }

  _request(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      this.pending.set(id, { resolve, reject });
      this.proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        params,
      }) + '\n');

      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request timeout: ${method}`));
        }
      }, 15000);
    });
  }

  async callTool(name, args) {
    if (!this.initialized) await this.connect();
    const result = await this._request('tools/call', { name, arguments: args });
    // 解析返回的 text content 为 JSON
    if (result.content && result.content.length > 0) {
      const text = result.content.find(c => c.type === 'text');
      if (text) {
        try {
          return JSON.parse(text.text);
        } catch (e) {
          return text.text;
        }
      }
    }
    return result;
  }

  async listTools() {
    if (!this.initialized) await this.connect();
    const result = await this._request('tools/list', {});
    return result.tools || [];
  }

  close() {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
      this.initialized = false;
    }
  }
}

// ============================================================
// MCP 百度地图 Provider
// ============================================================

/**
 * 通过本地 MCP Server（stdio）调用百度地图 API。
 * 与 BaiduMapProvider 实现相同的接口，用于验证 MCP 链路。
 */
class McpMapProvider {
  constructor() {
    this._cache = new Map();
    this.providerName = 'mcp-baidu';
    this.coverageTier = 'national';

    // MCP Server 路径
    this._serverPath = path.resolve(__dirname, '..', '..', '..', 'mcp-servers', 'baidu-map', 'src', 'index.js');
    this._env = {
      BAIDU_MAP_AK: process.env.BAIDU_MAP_AK || process.env.BAIDU_MAP_API_KEY || '',
      BAIDU_MAP_SK: process.env.BAIDU_MAP_SK || '',
      BAIDU_MAP_AUTH_TOKEN: process.env.BAIDU_MAP_AUTH_TOKEN || '',
    };
    this._client = null;
  }

  isConfigured() {
    return Boolean(this._env.BAIDU_MAP_AK);
  }

  get name() {
    return 'mcp-baidu';
  }

  async _getClient() {
    if (!this._client) {
      this._client = new McpClient(this._serverPath, this._env);
    }
    return this._client;
  }

  async geocode(address) {
    if (!this.isConfigured()) {
      return wrapResult(null, 'mcp-baidu:unconfigured', new Error('MCP 百度地图未配置 AK'));
    }

    const cacheKey = `geocode:${address}`;
    const cached = this._cache.get(cacheKey);
    if (cached) return wrapResult(cached, 'mcp-baidu', null, true);

    try {
      const client = await this._getClient();
      const result = await client.callTool('baidu_map_geocode', { address });

      let data = null;
      if (result && result.lat != null && result.lng != null) {
        const wgs = bd09ToWgs84(result.lat, result.lng);
        data = {
          lat: wgs.lat,
          lng: wgs.lng,
          precise: result.precise,
          confidence: result.confidence,
          level: result.level,
          formatted_address: result.formatted_address,
        };
      }

      if (data) this._cache.set(cacheKey, data);
      return wrapResult(data, 'mcp-baidu');
    } catch (error) {
      return wrapResult(null, 'mcp-baidu:error', error);
    }
  }

  async reverseGeocode(lat, lng) {
    if (!this.isConfigured()) {
      return wrapResult(null, 'mcp-baidu:unconfigured', new Error('MCP 百度地图未配置 AK'));
    }

    const cacheKey = `reverseGeocode:${lat},${lng}`;
    const cached = this._cache.get(cacheKey);
    if (cached) return wrapResult(cached, 'mcp-baidu', null, true);

    try {
      const bd09 = wgs84ToBd09(lat, lng);
      const client = await this._getClient();
      const result = await client.callTool('baidu_map_reverse_geocode', {
        lat: bd09.lat,
        lng: bd09.lng,
      });

      if (result) this._cache.set(cacheKey, result);
      return wrapResult(result, 'mcp-baidu');
    } catch (error) {
      return wrapResult(null, 'mcp-baidu:error', error);
    }
  }

  async searchPOI(query, options = {}) {
    if (!this.isConfigured()) {
      return wrapResult([], 'mcp-baidu:unconfigured', new Error('MCP 百度地图未配置 AK'));
    }

    const cacheKey = `searchPOI:${query}:${options.city || ''}:${options.limit || 20}`;
    const cached = this._cache.get(cacheKey);
    if (cached) return wrapResult(cached, 'mcp-baidu', null, true);

    try {
      const client = await this._getClient();
      const result = await client.callTool('baidu_map_search_poi', {
        query,
        city: options.city,
        page_size: options.limit || 20,
        page_num: 0,
      });

      const items = (result.results || []).map(item => {
        let lat = item.location?.lat;
        let lng = item.location?.lng;
        if (lat != null && lng != null) {
          const wgs = bd09ToWgs84(lat, lng);
          lat = wgs.lat;
          lng = wgs.lng;
        }
        return {
          id: item.uid,
          name: item.name,
          address: item.address,
          lat,
          lng,
          type: item.detail_info?.type,
          rating: item.detail_info?.overall_rating,
          price: item.detail_info?.price,
          telephone: item.telephone,
        };
      });

      this._cache.set(cacheKey, items);
      return wrapResult(items, 'mcp-baidu');
    } catch (error) {
      return wrapResult([], 'mcp-baidu:error', error);
    }
  }

  async getPOIDetail(poiId) {
    if (!this.isConfigured()) {
      return wrapResult(null, 'mcp-baidu:unconfigured', new Error('MCP 百度地图未配置 AK'));
    }

    const cacheKey = `poiDetail:${poiId}`;
    const cached = this._cache.get(cacheKey);
    if (cached) return wrapResult(cached, 'mcp-baidu', null, true);

    try {
      const client = await this._getClient();
      const result = await client.callTool('baidu_map_poi_detail', {
        uid: poiId,
        scope: 2,
      });

      if (result?.location) {
        const wgs = bd09ToWgs84(result.location.lat, result.location.lng);
        result.location.lat = wgs.lat;
        result.location.lng = wgs.lng;
      }

      if (result) this._cache.set(cacheKey, result);
      return wrapResult(result, 'mcp-baidu');
    } catch (error) {
      return wrapResult(null, 'mcp-baidu:error', error);
    }
  }

  async getRoute(origin, destination, waypoints = [], mode = 'driving', options = {}) {
    if (!this.isConfigured()) {
      return wrapResult(null, 'mcp-baidu:unconfigured', new Error('MCP 百度地图未配置 AK'));
    }

    const cacheKey = `route:${mode}:${origin.lat},${origin.lng}:${destination.lat},${destination.lng}`;
    const cached = this._cache.get(cacheKey);
    if (cached) return wrapResult(cached, 'mcp-baidu', null, true);

    try {
      const bdOrigin = wgs84ToBd09(origin.lat, origin.lng);
      const bdDest = wgs84ToBd09(destination.lat, destination.lng);

      const client = await this._getClient();
      const result = await client.callTool('baidu_map_calculate_route', {
        origin_lat: bdOrigin.lat,
        origin_lng: bdOrigin.lng,
        dest_lat: bdDest.lat,
        dest_lng: bdDest.lng,
        mode,
        region: options.city,
        tactics: options.tactics,
      });

      const data = result ? {
        distance: result.total_distance,
        duration: result.total_duration,
        mode: result.mode,
        routes: result.routes,
      } : null;

      if (data) this._cache.set(cacheKey, data);
      return wrapResult(data, 'mcp-baidu');
    } catch (error) {
      return wrapResult(null, 'mcp-baidu:error', error);
    }
  }

  async getDistanceMatrix(origins, destinations) {
    if (!this.isConfigured()) {
      return wrapResult([], 'mcp-baidu:unconfigured', new Error('MCP 百度地图未配置 AK'));
    }

    try {
      const bdOrigins = origins.map(o => {
        const bd = wgs84ToBd09(o.lat, o.lng);
        return `${bd.lat},${bd.lng}`;
      }).join('|');
      const bdDests = destinations.map(d => {
        const bd = wgs84ToBd09(d.lat, d.lng);
        return `${bd.lat},${bd.lng}`;
      }).join('|');

      const client = await this._getClient();
      const result = await client.callTool('baidu_map_distance_matrix', {
        origins: bdOrigins,
        destinations: bdDests,
      });

      return wrapResult(result?.matrix || [], 'mcp-baidu');
    } catch (error) {
      return wrapResult([], 'mcp-baidu:error', error);
    }
  }
}

module.exports = {
  McpMapProvider,
  McpClient,
};
