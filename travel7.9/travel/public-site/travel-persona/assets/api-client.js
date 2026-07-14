/**
 * 旅格 Travel Persona · API 客户端
 *
 * 职责：
 * 1. 封装所有后端 API 调用
 * 2. 处理 SSE 流式输出
 * 3. 处理错误和降级
 * 4. 管理请求状态
 *
 * 使用方式：
 *   const result = await ApiClient.recommend({ emotionGoal: '放空', door: '海' });
 *   for await (const chunk of ApiClient.generateReasonStream(personaScore, topCity)) { ... }
 */

const ApiClient = (() => {
  // 后端地址（可通过 data-api-host 属性配置）
  const getBaseUrl = () => {
    const scriptTag = document.querySelector('script[data-api-host]');
    if (scriptTag) return scriptTag.getAttribute('data-api-host');
    return ''; // 空字符串 = 同源
  };

  const BASE_URL = getBaseUrl();

  /**
   * 通用请求封装
   */
  async function request(method, path, body = null, signal = null) {
    const url = `${BASE_URL}${path}`;
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    if (signal) {
      options.signal = signal;
    }

    const startTime = Date.now();

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return { data, latency: Date.now() - startTime };
    } catch (err) {
      // 如果是网络错误，尝试降级到本地计算
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        throw new Error('NETWORK_ERROR: 无法连接到后端服务');
      }
      throw err;
    }
  }

  /**
   * 完整推荐链路
   * POST /api/recommend
   *
   * @param {Object} answers - 问卷答案
   * @param {Object} options - 可选配置
   * @returns {Promise<Object>} { personaScore, personaLabel, topCities, reason, metadata }
   */
  async function recommend(answers, options = {}) {
    var controller = new AbortController(); var timeout = setTimeout(function() { controller.abort(); }, 8000);
    try {
      var { data } = await request('POST', '/api/recommend', { answers, options }, controller.signal);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') { console.warn('[ApiClient] 请求超时，降级为本地算法'); }
      throw err;
    } finally { clearTimeout(timeout); }
  }

  /**
   * 维度提取（自由文本 → 维度增量）
   * POST /api/extract
   *
   * @param {string} freeText - 用户自由文本
   * @param {Object} currentScore - 当前 PersonaScore
   * @returns {Promise<Object>} { delta, rationale, confidence }
   */
  async function extractDimensions(freeText, currentScore = {}) {
    var controller = new AbortController(); var timeout = setTimeout(function() { controller.abort(); }, 8000);
    try {
      var { data } = await request('POST', '/api/extract', { freeText, currentScore }, controller.signal);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') { console.warn('[ApiClient] 请求超时，降级为本地算法'); }
      throw err;
    } finally { clearTimeout(timeout); }
  }

  /**
   * 流式推荐理由（SSE）
   * POST /api/reason
   *
   * @param {Object} params
   * @param {Object} params.personaScore - PersonaScore
   * @param {Array} params.userQuotes - 用户原话
   * @param {Object} params.topCity - 推荐城市
   * @param {Array} params.candidates - 候选城市
   * @returns {AsyncGenerator} 流式结果
   */
  async function* generateReasonStream({ personaScore, userQuotes = [], topCity, candidates = [] }) {
    const url = `${BASE_URL}/api/reason`;
    var controller = new AbortController(); var timeout = setTimeout(function() { controller.abort(); }, 8000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personaScore, userQuotes, topCity, candidates }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const chunk = JSON.parse(jsonStr);
              yield chunk;
            } catch (e) {
              // 非 JSON 行，跳过
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') { console.warn('[ApiClient] 请求超时，降级为本地算法'); }
      console.warn('[ApiClient] 流式推荐理由失败:', err.message);
      // 降级：返回空（调用方使用模板理由）
      yield { fallback: true, error: err.message };
    } finally { clearTimeout(timeout); }
  }

  /**
   * 流式行程润色（SSE）
   * POST /api/itinerary
   *
   * @param {Object} params
   * @returns {AsyncGenerator} 流式结果
   */
  async function* generateItineraryStream({ city, skeleton, personaScore, adjustInstruction = '' }) {
    const url = `${BASE_URL}/api/itinerary`;
    var controller = new AbortController(); var timeout = setTimeout(function() { controller.abort(); }, 8000);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city, skeleton, personaScore, adjustInstruction }),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6);
            try {
              const chunk = JSON.parse(jsonStr);
              yield chunk;
            } catch (e) {
              // 跳过
            }
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') { console.warn('[ApiClient] 请求超时，降级为本地算法'); }
      console.warn('[ApiClient] 流式行程润色失败:', err.message);
      yield { fallback: true, error: err.message };
    } finally { clearTimeout(timeout); }
  }

  /**
   * 获取天气数据
   * GET /api/weather
   *
   * @param {string} city - 城市 ID
   * @param {number} days - 天数
   * @returns {Promise<Object>} 天气数据
   */
  async function getWeather(city, days = 7) {
    var controller = new AbortController(); var timeout = setTimeout(function() { controller.abort(); }, 8000);
    try {
      var { data } = await request('GET', `/api/weather?city=${encodeURIComponent(city)}&days=${days}`, null, controller.signal);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') { console.warn('[ApiClient] 请求超时，降级为本地算法'); }
      console.warn('[ApiClient] 获取天气失败:', err.message);
      return { city, days, daily: [], note: '天气数据暂不可用', fallback: true };
    } finally { clearTimeout(timeout); }
  }

  /**
   * 获取城市数据
   * GET /api/data/cities
   *
   * @param {string} format - 'full' | 'summary' | 'vector-only'
   * @returns {Promise<Array>}
   */
  async function getCities(format = 'summary') {
    const { data } = await request('GET', `/api/data/cities?format=${format}`);
    return data;
  }

  /**
   * 获取数据版本
   * GET /api/data/version
   */
  async function getDataVersion() {
    const { data } = await request('GET', '/api/data/version');
    return data;
  }

  /**
   * 获取数据映射表
   * GET /api/data/mappings/:tableName
   */
  async function getMappingTable(tableName) {
    const { data } = await request('GET', `/api/data/mappings/${tableName}`);
    return data;
  }

  /**
   * 获取权重配置
   * GET /api/data/weights
   */
  async function getWeights() {
    const { data } = await request('GET', '/api/data/weights');
    return data;
  }

  /**
   * 健康检查
   * GET /api/health （修复：URL 与服务器端点一致）
   */
  async function healthCheck() {
    try {
      const { data } = await request('GET', '/api/health');
      return data;
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  /**
   * v3 深度推荐
   * POST /api/v3/recommend
   */
  async function deepRecommend(answers, options = {}) {
    var controller = new AbortController(); var timeout = setTimeout(function() { controller.abort(); }, 12000);
    try {
      var { data } = await request('POST', '/api/v3/recommend', { answers, options }, controller.signal);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') { console.warn('[ApiClient] v3 深度推荐超时'); }
      throw err;
    } finally { clearTimeout(timeout); }
  }

  /**
   * v3 城市推荐解释
   * POST /api/v3/explain
   */
  async function explainRecommendation(personaScore, cityId, answers) {
    var { data } = await request('POST', '/api/v3/explain', { personaScore, cityId, answers });
    return data;
  }

  /**
   * v3 Pareto 前沿分析
   * POST /api/v3/pareto
   */
  async function getParetoAnalysis(personaScore, cityIds) {
    var { data } = await request('POST', '/api/v3/pareto', { personaScore, cityIds });
    return data;
  }

  /**
   * v3 上下文分析
   * GET /api/v3/context
   */
  async function getContextAnalysis(month) {
    var qs = month ? '?month=' + month : '';
    var { data } = await request('GET', '/api/v3/context' + qs);
    return data;
  }

  /**
   * v3 算法引擎健康检查
   * GET /api/v3/health
   */
  async function algoHealthCheck() {
    try {
      var { data } = await request('GET', '/api/v3/health');
      return data;
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  }

  return {
    recommend,
    deepRecommend,           // v3
    extractDimensions,
    generateReasonStream,
    generateItineraryStream,
    getWeather,
    getCities,
    getDataVersion,
    getMappingTable,
    getWeights,
    healthCheck,
    explainRecommendation,  // v3
    getParetoAnalysis,      // v3
    getContextAnalysis,     // v3
    algoHealthCheck         // v3
  };
})();

// 全局暴露
if (typeof window !== 'undefined') {
  window.ApiClient = ApiClient;
}