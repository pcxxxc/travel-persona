'use strict';

const localSafety = require('./contentSafety');
const monitoring = require('./monitoring');

const DEFAULT_TIMEOUT_MS = 2500;
const FAILURE_THRESHOLD = 3;
const OPEN_MS = 30000;
const MAX_TEXT_LENGTH = 12000;

const stats = {
  totalChecks: 0,
  providerCalls: 0,
  providerFailures: 0,
  providerFlagged: 0,
  localRestricted: 0,
  fallbacks: 0,
  lastFailureAt: null
};

let failureCount = 0;
let openUntil = 0;

function getMode() {
  return String(process.env.CONTENT_SAFETY_MODE || 'local').toLowerCase();
}

function getProviderConfig() {
  return {
    url: String(process.env.CONTENT_SAFETY_PROVIDER_URL || '').trim(),
    key: String(process.env.CONTENT_SAFETY_PROVIDER_KEY || '').trim(),
    timeoutMs: Math.min(Math.max(Number(process.env.CONTENT_SAFETY_PROVIDER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, 500), 10000),
    sendRaw: process.env.CONTENT_SAFETY_PROVIDER_SEND_RAW === 'true'
  };
}

function localCheck(text, operation) {
  const result = operation === 'output' ? localSafety.checkOutput(text) : localSafety.checkInput(text);
  return {
    ...result,
    sensitivityLevel: localSafety.getSensitivityLevel(text),
    action: result.safe ? 'allow' : localSafety.getSensitivityLevel(text) === 'restricted' ? 'restrict' : 'review',
    mode: 'local',
    providerApplied: false,
    degraded: false
  };
}

function normalizeProviderResult(value) {
  if (!value || typeof value !== 'object' || typeof value.safe !== 'boolean') {
    throw new Error('Content safety provider returned an invalid response');
  }
  const action = ['allow', 'review', 'restrict', 'block'].includes(value.action)
    ? value.action
    : value.safe ? 'allow' : 'restrict';
  return {
    safe: value.safe && action === 'allow',
    action,
    categories: Array.isArray(value.categories)
      ? value.categories.map(item => String(item || '').trim()).filter(Boolean).slice(0, 12)
      : [],
    requestId: String(value.requestId || '').slice(0, 120)
  };
}

async function callProvider(text, operation, context, localResult, config) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const payloadText = (config.sendRaw ? String(text || '') : localResult.sanitizedText).slice(0, MAX_TEXT_LENGTH);
  try {
    stats.providerCalls += 1;
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.key}`
      },
      body: JSON.stringify({
        operation,
        text: payloadText,
        context: {
          surface: String(context.surface || 'unknown').slice(0, 80),
          locale: 'zh-CN',
          localCategories: localResult.matchedCategories
        }
      }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Content safety provider HTTP ${response.status}`);
    const result = normalizeProviderResult(await response.json());
    failureCount = 0;
    openUntil = 0;
    if (!result.safe) stats.providerFlagged += 1;
    return result;
  } finally {
    clearTimeout(timer);
  }
}

function recordFallback(reason) {
  stats.fallbacks += 1;
  monitoring.recordMetric('content_safety_fallback_rate', 1, { reason });
}

async function checkWithProvider(text, options = {}) {
  const operation = options.operation === 'output' ? 'output' : 'input';
  const localResult = localCheck(text, operation);
  stats.totalChecks += 1;
  if (localResult.sensitivityLevel === 'restricted') {
    stats.localRestricted += 1;
    monitoring.recordMetric('sensitive_content_blocked_count', 1, { source: 'local', surface: options.surface || 'unknown' });
    return localResult;
  }

  if (getMode() !== 'provider') return localResult;
  const config = getProviderConfig();
  if (!config.url || !config.key) {
    recordFallback('not_configured');
    return { ...localResult, mode: 'provider', degraded: true, fallbackReason: 'not_configured' };
  }
  if (Date.now() < openUntil) {
    recordFallback('circuit_open');
    return { ...localResult, mode: 'provider', degraded: true, fallbackReason: 'circuit_open' };
  }

  try {
    const providerResult = await callProvider(text, operation, options, localResult, config);
    const safe = localResult.safe && providerResult.safe;
    const matchedCategories = Array.from(new Set(localResult.matchedCategories.concat(providerResult.categories)));
    if (!safe) {
      monitoring.recordMetric('sensitive_content_blocked_count', 1, { source: 'provider', surface: options.surface || 'unknown' });
    }
    monitoring.recordMetric('content_safety_fallback_rate', 0, { reason: 'provider_success' });
    return {
      ...localResult,
      safe,
      action: providerResult.safe ? localResult.action : providerResult.action,
      matchedCategories,
      sensitivityLevel: providerResult.safe ? localResult.sensitivityLevel : 'restricted',
      mode: 'provider',
      providerApplied: true,
      providerRequestId: providerResult.requestId || null,
      degraded: false
    };
  } catch (error) {
    failureCount += 1;
    stats.providerFailures += 1;
    stats.lastFailureAt = new Date().toISOString();
    if (failureCount >= FAILURE_THRESHOLD) openUntil = Date.now() + OPEN_MS;
    recordFallback(error.name === 'AbortError' ? 'timeout' : 'provider_error');
    console.warn(`[content-safety] provider fallback (${error.name || 'Error'})`);
    return {
      ...localResult,
      mode: 'provider',
      degraded: true,
      fallbackReason: error.name === 'AbortError' ? 'timeout' : 'provider_error'
    };
  }
}

function getStatus() {
  const config = getProviderConfig();
  return {
    mode: getMode(),
    configured: Boolean(config.url && config.key),
    providerState: Date.now() < openUntil ? 'open' : failureCount > 0 ? 'degraded' : 'closed',
    sendsRawText: config.sendRaw,
    stats: { ...stats }
  };
}

function resetForTests() {
  Object.keys(stats).forEach(key => { stats[key] = key === 'lastFailureAt' ? null : 0; });
  failureCount = 0;
  openUntil = 0;
}

module.exports = {
  checkInput: (text, options = {}) => checkWithProvider(text, { ...options, operation: 'input' }),
  checkOutput: (text, options = {}) => checkWithProvider(text, { ...options, operation: 'output' }),
  getStatus,
  resetForTests,
  MAX_TEXT_LENGTH
};
