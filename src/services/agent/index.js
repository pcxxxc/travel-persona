/**
 * 旅格 Travel Persona · Agent 服务统一入口（Phase 5）
 *
 * 统一导出 Agent 子系统的全部能力：
 *   - agentProvider   供应商无关接口与工厂
 *   - circuitBreaker  熔断器
 *   - structuredPatch 结构化 Patch 与安全校验
 */

const {
  AgentProvider,
  GLMAgentProvider,
  MockAgentProvider,
  getAgentProvider,
  runWithAgent,
  parseJSONContent,
  ALLOWED_PATHS
} = require('./agentProvider');

const {
  CircuitBreaker,
  State,
  getBreaker,
  resetAllBreakers
} = require('./circuitBreaker');

const {
  PROTECTED_PATHS,
  parsePath,
  getPath,
  validatePatch,
  applyPatch,
  factCheck,
  isProtected,
  isAllowed,
  collectPOICandidates
} = require('./structuredPatch');

module.exports = {
  // 供应商无关接口
  AgentProvider,
  GLMAgentProvider,
  MockAgentProvider,
  getAgentProvider,
  runWithAgent,
  parseJSONContent,
  ALLOWED_PATHS,

  // 熔断器
  CircuitBreaker,
  State,
  getBreaker,
  resetAllBreakers,

  // 结构化 Patch
  PROTECTED_PATHS,
  parsePath,
  getPath,
  validatePatch,
  applyPatch,
  factCheck,
  isProtected,
  isAllowed,
  collectPOICandidates
};
