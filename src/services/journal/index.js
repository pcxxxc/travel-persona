/**
 * 旅格 Travel Persona · Phase 4 手账、旅格轨迹与人格校准 · 统一导出
 *
 * 模块结构：
 * - journalService:    手账系统（条目CRUD、分析授权、敏感字段标记、证据池）
 * - personaCalibration: 人格更新提案系统（提案生成、应用、锁定、排除）
 * - travelTrace:       旅格轨迹服务（旅行记录、向往地图、统计）
 * - dataRights:        数据权利服务（导出、删除、关闭个性化、隐私设置）
 *
 * 对应总纲章节：
 * - 7.2 证据等级
 * - 7.3 人格更新
 * - 8.1 手账的双重属性
 * - 8.4 旅后完整复盘
 * - 8.5 更新提案
 * - 8.6 向往地图
 * - 12.5 用户权利
 */

const journalService = require('./journalService');
const personaCalibration = require('./personaCalibration');
const travelTrace = require('./travelTrace');
const dataRights = require('./dataRights');

module.exports = {
  // 手账系统服务
  journalService,

  // 人格更新提案系统
  personaCalibration,

  // 旅格轨迹服务
  travelTrace,

  // 数据权利服务
  dataRights,

  // 便捷别名（扁平导出常用接口）
  // 手账
  createEntry: journalService.createEntry,
  getEntries: journalService.getEntries,
  updateEntry: journalService.updateEntry,
  deleteEntry: journalService.deleteEntry,
  setAnalysisAuthorization: journalService.setAnalysisAuthorization,
  getEntriesForAnalysis: journalService.getEntriesForAnalysis,
  sanitizeForShare: journalService.sanitizeForShare,
  getEvidencePool: journalService.getEvidencePool,

  // 人格校准
  generateUpdateProposal: personaCalibration.generateUpdateProposal,
  applyProposal: personaCalibration.applyProposal,
  rejectProposal: personaCalibration.rejectProposal,
  lockTrait: personaCalibration.lockTrait,
  unlockTrait: personaCalibration.unlockTrait,
  excludeEvidence: personaCalibration.excludeEvidence,
  getOrCreateProfile: personaCalibration.getOrCreateProfile,
  getPendingProposals: personaCalibration.getPendingProposals,

  // 旅格轨迹
  recordTrip: travelTrace.recordTrip,
  getTravelTrace: travelTrace.getTravelTrace,
  getVisitMap: travelTrace.getVisitMap,
  getTripStats: travelTrace.getTripStats,

  // 数据权利
  exportUserData: dataRights.exportUserData,
  deleteUserData: dataRights.deleteUserData,
  disablePersonalization: dataRights.disablePersonalization,
  getPrivacySettings: dataRights.getPrivacySettings,
  updatePrivacySettings: dataRights.updatePrivacySettings,

  // 常量
  MAX_DELTA: personaCalibration.MAX_DELTA,
  PROPOSAL_STATUS: personaCalibration.PROPOSAL_STATUS,
  EVIDENCE_RELIABILITY: journalService.EVIDENCE_RELIABILITY,
  TRIP_STATUS: travelTrace.TRIP_STATUS,

  // 测试辅助
  _resetAll: function () {
    journalService._reset();
    personaCalibration._reset();
    travelTrace._reset();
    dataRights._reset();
  }
};
