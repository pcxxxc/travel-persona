/**
 * 百度地图 MCP Server — 配置模块
 *
 * 读取并校验环境变量，支持三种认证模式：
 * 1. AK + SK 签名模式（推荐，生产级安全）
 * 2. AK 明文模式（简单，测试用）
 * 3. BAIDU_MAP_AUTH_TOKEN 备用模式
 */

export const config = {
  ak: process.env.BAIDU_MAP_AK || process.env.BAIDU_MAP_API_KEY || '',
  sk: process.env.BAIDU_MAP_SK || '',
  authToken: process.env.BAIDU_MAP_AUTH_TOKEN || '',
  baseUrl: process.env.BAIDU_MAP_BASE_URL || 'https://api.map.baidu.com',
  timeoutMs: Number(process.env.BAIDU_MAP_TIMEOUT_MS || 10000),
};

/**
 * 检查是否配置了必要的认证信息
 * @returns {boolean}
 */
export function isConfigured() {
  // 只要有 AK 就能运行（明文模式）
  return Boolean(config.ak);
}

/**
 * 获取当前认证模式
 * @returns {'sk-signature' | 'ak-plain' | 'auth-token' | 'none'}
 */
export function getAuthMode() {
  if (config.ak && config.sk) return 'sk-signature';
  if (config.ak) return 'ak-plain';
  if (config.authToken) return 'auth-token';
  return 'none';
}

/**
 * 校验配置，缺失时抛出友好错误
 */
export function validateConfig() {
  const mode = getAuthMode();
  if (mode === 'none') {
    throw new Error(
      '百度地图 API 未配置。请设置 BAIDU_MAP_AK（推荐同时设置 BAIDU_MAP_SK 以启用签名认证）。'
    );
  }
  return mode;
}
