/**
 * 百度地图 API 客户端
 *
 * 封装 fetch 请求，支持：
 * - AK 明文认证
 * - AK + SK 签名认证
 * - 超时保护
 * - 统一错误处理
 */

import { config, getAuthMode } from './utils/config.js';
import { signParams } from './utils/snSigner.js';

/**
 * 调用百度地图 API
 * @param {string} path - API 路径，如 "/geocoding/v3/"
 * @param {Record<string, string|number>} params - 请求参数（不含 ak/sn）
 * @param {object} [options] - 选项
 * @param {string} [options.method] - HTTP 方法
 * @param {number} [options.timeoutMs] - 超时时间
 * @returns {Promise<any>} 解析后的 JSON 响应
 */
export async function callBaiduApi(path, params = {}, options = {}) {
  const method = options.method || 'GET';
  const timeoutMs = options.timeoutMs || config.timeoutMs;
  const authMode = getAuthMode();

  // 添加 ak 参数
  const requestParams = { ...params, ak: config.ak };

  // 如果有 SK，计算并添加 sn 签名
  if (authMode === 'sk-signature' && config.sk) {
    Object.assign(requestParams, signParams(path, requestParams, config.sk));
  }

  // 拼接 URL
  const queryString = Object.keys(requestParams)
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(requestParams[key]))}`)
    .join('&');

  const url = `${config.baseUrl}${path}?${queryString}`;

  // 超时控制器
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`百度地图 API HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // 百度 API status 为 0 表示成功
    if (data.status !== 0 && data.status !== 200) {
      const message = data.message || data.msg || `错误码 ${data.status}`;
      const error = new Error(`百度地图 API 错误: ${message} (status=${data.status})`);
      error.status = data.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new Error(`百度地图 API 超时（${timeoutMs}ms）：${path}`);
    }

    throw error;
  }
}

export { config, getAuthMode };
