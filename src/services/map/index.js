/**
 * 旅格 Travel Persona · Phase 2 地图服务模块入口
 *
 * 统一导出地图 Provider 抽象层的所有公共接口。
 * 上层代码只需 require 此文件即可使用地图能力。
 *
 * 用法示例：
 *   const { getActiveProvider } = require('./services/map');
 *   const provider = getActiveProvider();
 *   const result = await provider.searchPOI('洱海', { city: '大理' });
 *   // result.data = POI 数组, result.source = 'mock' | 'baidu'
 */

const {
  MapProvider,
  BaiduMapProvider,
  MockMapProvider,
  getActiveProvider,
  resetProvider,
  haversineDistance,
  wrapResult,
  API_TIMEOUT_MS,
  CACHE_TTL_MS,
  CITY_COORDINATES
} = require('./mapProvider');

module.exports = {
  // 基类与实现类
  MapProvider,
  BaiduMapProvider,
  MockMapProvider,
  // 工厂函数（最常用）
  getActiveProvider,
  resetProvider,
  // 工具函数
  haversineDistance,
  wrapResult,
  // 常量
  API_TIMEOUT_MS,
  CACHE_TTL_MS,
  CITY_COORDINATES
};
