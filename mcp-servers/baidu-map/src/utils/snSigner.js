/**
 * 百度地图 AK + SK 签名计算工具
 *
 * 算法（参考百度官方文档）：
 * 1. 将所有请求参数按 key 字典序排序
 * 2. 拼接为 querystring：key1=value1&key2=value2
 * 3. 加上 URI 路径前缀：/path? + querystring
 * 4. 拼接 SK 密钥：path_with_params + SK
 * 5. 进行 URL encode（注意：对特殊字符做百分号编码）
 * 6. 计算 MD5，得到 sn 参数
 */

import crypto from 'node:crypto';

/**
 * 计算 SN 签名
 * @param {string} path - API 路径，如 "/geocoding/v3/"
 * @param {Record<string, string|number>} params - 请求参数（不含 sn 和 ak？实际上 ak 要包含在内）
 * @param {string} sk - Secret Key
 * @returns {string} MD5 签名值
 */
export function calculateSn(path, params, sk) {
  // 按 key 字典序排序
  const sortedKeys = Object.keys(params).sort();

  // 拼接 querystring
  const queryString = sortedKeys
    .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`)
    .join('&');

  // 拼接完整路径 + SK
  const wholeStr = `${path}?${queryString}${sk}`;

  // URL encode 后计算 MD5
  const encodedStr = encodeURIComponent(wholeStr);
  return crypto.createHash('md5').update(encodedStr).digest('hex');
}

/**
 * 为请求参数添加 sn 签名
 * @param {string} path - API 路径
 * @param {Record<string, string|number>} params - 请求参数（必须包含 ak）
 * @param {string} sk - Secret Key
 * @returns {Record<string, string|number>} 带有 sn 参数的新 params 对象
 */
export function signParams(path, params, sk) {
  const sn = calculateSn(path, params, sk);
  return { ...params, sn };
}
