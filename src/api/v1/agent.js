/**
 * 旅格 Travel Persona · API v1 Agent 路由
 * Phase 5：Agent 增强与无感故障切换
 */

const express = require('express');
const router = express.Router();
const { getAgentProvider, runWithAgent, ALLOWED_PATHS } = require('../../services/agent/agentProvider');
const { applyPatch } = require('../../services/agent/structuredPatch');
const contentSafety = require('../../services/ops/contentSafety');
const semanticContentSafety = require('../../services/ops/semanticContentSafety');
const monitoring = require('../../services/ops/monitoring');

function sendSafe(res, value) {
  return res.json(contentSafety.sanitizeOutputValue(value));
}

async function assessAgentInput(value, surface) {
  const safeValue = contentSafety.sanitizeOutputValue(value);
  const serialized = typeof safeValue === 'string' ? safeValue : JSON.stringify(safeValue).slice(0, 12000);
  const safety = await semanticContentSafety.checkInput(serialized, { surface });
  return { allowed: safety.safe, value: safeValue, safety };
}

// --- Agent 增强端点 ---

router.post('/extract-intent', async (req, res) => {
  try {
    const { freeText } = req.body;
    if (!freeText) {
      return res.status(400).json({ code: 'TP-1006', type: 'VALIDATION', message: 'freeText 必填' });
    }

    const provider = getAgentProvider();
    if (!provider) {
      return sendSafe(res, {
        extracted: null,
        operations: [],
        agentApplied: false
      });
    }
    const assessed = await assessAgentInput(freeText, 'agent-extract-intent');
    if (!assessed.allowed) {
      return sendSafe(res, { extracted: null, operations: [], agentApplied: false });
    }

    const result = await runWithAgent(
      provider,
      'extractIntent',
      [assessed.value],
      { extracted: null, operations: [], agentApplied: false }
    );

    sendSafe(res, { ...result, agentApplied: Array.isArray(result?.operations) && result.operations.length > 0 });
  } catch (error) {
    res.status(500).json({ code: 'TP-4001', type: 'LLM', message: '意图分析暂时不可用', userVisible: false });
  }
});

router.post('/enhance-explanation', async (req, res) => {
  try {
    const { planResponse } = req.body;
    const provider = getAgentProvider();
    if (!provider) {
      monitoring.recordMetric('agent_fallback_rate', 1, { surface: 'agent', reason: 'provider_unavailable' });
      return sendSafe(res, { ...planResponse, capability: { ...planResponse.capability, agentApplied: false } });
    }
    const assessed = await assessAgentInput(planResponse, 'agent-enhance-input');
    if (!assessed.allowed) {
      monitoring.recordMetric('agent_fallback_rate', 1, { surface: 'agent', reason: 'safety_blocked' });
      return sendSafe(res, { ...planResponse, capability: { ...planResponse.capability, agentApplied: false } });
    }

    const patch = await runWithAgent(
      provider,
      'enhanceExplanation',
      [assessed.value],
      null
    );
    const enhanced = patch
      ? applyPatch(structuredClone(planResponse), patch, ALLOWED_PATHS.enhanceExplanation)
      : planResponse;
    const outputSafety = await semanticContentSafety.checkOutput(JSON.stringify(enhanced).slice(0, 12000), { surface: 'agent-enhance-output' });
    if (!outputSafety.safe) {
      monitoring.recordMetric('agent_fallback_rate', 1, { surface: 'agent', reason: 'output_blocked' });
      return sendSafe(res, { ...planResponse, capability: { ...planResponse.capability, agentApplied: false } });
    }

    monitoring.recordMetric('agent_fallback_rate', patch ? 0 : 1, {
      surface: 'agent', reason: patch ? 'provider_success' : 'empty_patch'
    });
    sendSafe(res, { ...enhanced, capability: { ...enhanced.capability, agentApplied: Boolean(patch) } });
  } catch (error) {
    monitoring.recordMetric('agent_fallback_rate', 1, { surface: 'agent', reason: 'provider_error' });
    res.status(500).json({ code: 'TP-4002', type: 'LLM', message: '解释增强暂时不可用', userVisible: false });
  }
});

router.post('/adjust-in-trip', async (req, res) => {
  try {
    const { planId, adjustments } = req.body;
    const provider = getAgentProvider();
    if (!provider) {
      return sendSafe(res, { adjusted: false, agentApplied: false });
    }
    const assessed = await assessAgentInput(adjustments, 'agent-adjust-input');
    if (!assessed.allowed) return sendSafe(res, { adjusted: false, agentApplied: false });

    const result = await runWithAgent(
      provider,
      'adjustInTrip',
      [planId, assessed.value],
      { adjusted: false, operations: [], agentApplied: false }
    );

    sendSafe(res, { ...result, agentApplied: Array.isArray(result?.operations) && result.operations.length > 0 });
  } catch (error) {
    res.status(500).json({ code: 'TP-4001', type: 'LLM', message: '旅中调整暂时不可用', userVisible: false });
  }
});

router.post('/summarize-journal', async (req, res) => {
  try {
    const { entries } = req.body;
    const provider = getAgentProvider();
    if (!provider) {
      return sendSafe(res, { summary: null, agentApplied: false });
    }
    const authorizedEntries = (Array.isArray(entries) ? entries : []).filter(entry => {
      return entry && entry.analysisAuthorized === true && entry.sensitivityLevel !== 'restricted';
    });
    if (!authorizedEntries.length) {
      return sendSafe(res, { summary: null, agentApplied: false });
    }
    const assessed = await assessAgentInput(authorizedEntries, 'agent-journal-summary');
    if (!assessed.allowed) return sendSafe(res, { summary: null, agentApplied: false });

    const result = await runWithAgent(
      provider,
      'summarizeJournal',
      [assessed.value],
      { summary: null, operations: [], agentApplied: false }
    );

    sendSafe(res, { ...result, agentApplied: Array.isArray(result?.operations) && result.operations.length > 0 });
  } catch (error) {
    res.status(500).json({ code: 'TP-4002', type: 'LLM', message: '手账整理暂时不可用', userVisible: false });
  }
});

// --- Agent 状态 ---

router.get('/status', (req, res) => {
  const provider = getAgentProvider();
  res.json({
    enabled: provider !== null,
    provider: provider ? provider.constructor.name : 'none',
    agentApplied: provider !== null
  });
});

module.exports = router;
