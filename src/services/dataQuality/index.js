/**
 * 旅格 Travel Persona · Phase 2 数据质量服务模块入口
 *
 * 统一导出数据质量校验与报告生成的所有公共接口。
 */

const {
  validateCityRecord,
  validatePOI,
  checkDataFreshness,
  generateQualityReport,
  getCoverageStats,
  // 常量
  COVERAGE_TIERS,
  REQUIRED_TRAIT_KEYS
} = require('./dataQualityService');

module.exports = {
  // 校验方法
  validateCityRecord,
  validatePOI,
  checkDataFreshness,
  // 报告与统计
  generateQualityReport,
  getCoverageStats,
  // 常量
  COVERAGE_TIERS,
  REQUIRED_TRAIT_KEYS
};
