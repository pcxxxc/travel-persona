/**
 * 旅格 Travel Persona · API v1 Plans 路由
 *
 * POST /api/v1/plans
 * 输入: { tripIntent, tripContext }
 * 输出: PlanResponse (符合 docs/schemas/PlanResponse.json)
 *
 * 总纲11.4：本地规划器与Agent输出同构
 * 总纲13.6：所有写接口必须支持幂等键
 */

const express = require('express');
const router = express.Router();
const { generatePlan } = require('../../engines/pipeline');
const { ValidationError } = require('../../utils/errors');
const contentSafety = require('../../services/ops/contentSafety');
const semanticContentSafety = require('../../services/ops/semanticContentSafety');
const personaCalibration = require('../../services/journal/personaCalibration');
const dataRights = require('../../services/journal/dataRights');
const monitoring = require('../../services/ops/monitoring');
const { getAgentProvider, runWithAgent } = require('../../services/agent/agentProvider');

function getUserId(req) {
  const trustedSessionUser = String(req.userId || '');
  if (/^[a-zA-Z0-9_-]{3,80}$/.test(trustedSessionUser)) return trustedSessionUser;
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_INSECURE_USER_HEADER === 'true') {
    const testCandidate = String(req.headers['x-user-id'] || 'test_anonymous');
    return /^[a-zA-Z0-9_-]{3,80}$/.test(testCandidate) ? testCandidate : 'test_anonymous';
  }
  throw new Error('Missing trusted user session');
}

function resolveTrustedPersona(userId) {
  const settings = dataRights.getPrivacySettings(userId);
  if (!settings.personalizationEnabled || !settings.longTermMemoryEnabled) {
    return {
      profile: null,
      capability: {
        personaSource: 'non-personalized',
        acceptedTraitCount: 0,
        personalizationApplied: false
      }
    };
  }

  const storedProfile = personaCalibration.getProfile(userId);
  const acceptedTraits = {};
  Object.entries(storedProfile?.traits || {}).forEach(([key, trait]) => {
    if (!trait || Number(trait.evidenceCount || 0) <= 0 || !Number.isFinite(Number(trait.mean))) return;
    acceptedTraits[key] = {
      mean: Number(trait.mean),
      confidence: Number(trait.confidence || 0),
      evidenceCount: Number(trait.evidenceCount || 0)
    };
  });

  const acceptedTraitCount = Object.keys(acceptedTraits).length;
  if (acceptedTraitCount === 0) {
    return {
      profile: null,
      capability: {
        personaSource: 'cold-start',
        acceptedTraitCount: 0,
        personalizationApplied: false
      }
    };
  }

  return {
    profile: {
      profileId: storedProfile.profileId,
      traits: acceptedTraits
    },
    capability: {
      personaSource: 'server-confirmed',
      acceptedTraitCount,
      personalizationApplied: true
    }
  };
}

/**
 * 请求体校验（轻量级，详细校验由各引擎处理）
 */
function validatePlanRequest(body) {
  const errors = [];

  if (!body) {
    errors.push('请求体不能为空');
    return errors;
  }

  // tripContext 必须存在且包含 days
  if (!body.tripContext) {
    errors.push('tripContext 必填');
  } else {
    const days = Number(body.tripContext.days);
    if (!days || days < 1 || days > 60) {
      errors.push('tripContext.days 必须在 1-60 之间');
    }
  }

  // tripIntent 必须存在且包含 mood
  if (!body.tripIntent) {
    errors.push('tripIntent 必填');
  } else {
    const validMoods = ['restore', 'escape', 'inspire', 'social', 'efficient', 'live'];
    if (!validMoods.includes(body.tripIntent.mood)) {
      errors.push(`tripIntent.mood 必须是以下之一: ${validMoods.join(', ')}`);
    }
  }

  return errors;
}

/**
 * POST /api/v1/plans
 * 生成旅行规划推荐
 */
router.post('/', async (req, res) => {
  const startedAt = Date.now();
  try {
    const validationErrors = validatePlanRequest(req.body);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        code: 'TP-1006',
        type: 'VALIDATION',
        message: 'Plan request validation failed',
        userMessage: '请检查输入信息是否完整',
        userVisible: true,
        recoverable: true
      });
    }

    const userId = getUserId(req);
    const { tripIntent, tripContext } = req.body;
    const trustedPersona = resolveTrustedPersona(userId);
    const freeTextSafety = await semanticContentSafety.checkInput(tripIntent.freeText || '', { surface: 'plan-free-text' });
    const safeTripIntent = {
      ...tripIntent,
      freeText: freeTextSafety.sensitivityLevel === 'restricted'
        ? ''
        : freeTextSafety.sanitizedText
    };

    // 整体超时保护：25 秒超限返回降级结果
    const PLAN_TIMEOUT_MS = 25_000;
    let planResponse;
    try {
      planResponse = await Promise.race([
        generatePlan({
          personaProfile: trustedPersona.profile,
          tripIntent: safeTripIntent,
          tripContext
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Plan generation exceeded ${PLAN_TIMEOUT_MS}ms`)), PLAN_TIMEOUT_MS)
        )
      ]);
    } catch (timeoutError) {
      if (timeoutError.message.includes('exceeded')) {
        console.error(`[plans] generatePlan 超时 (${PLAN_TIMEOUT_MS}ms)`);
        return res.status(503).json({
          code: 'TP-4003',
          type: 'TIMEOUT',
          message: 'Plan generation timed out',
          userMessage: '方案生成超时，请稍后重试',
          userVisible: true,
          recoverable: true
        });
      }
      throw timeoutError;
    }

    planResponse.capability = {
      ...(planResponse.capability || {}),
      ...trustedPersona.capability,
      contentSafety: {
        mode: freeTextSafety.mode,
        providerApplied: freeTextSafety.providerApplied,
        degraded: freeTextSafety.degraded
      }
    };

    monitoring.recordMetric('plan_generation_time', Date.now() - startedAt, {
      endpoint: '/api/v1/plans', status: 'success'
    });
    monitoring.recordMetric('api_error_rate', 0, { endpoint: '/api/v1/plans', status: 'success' });
    res.json(contentSafety.sanitizeOutputValue(planResponse));
  } catch (error) {
    monitoring.recordMetric('api_error_rate', 1, { endpoint: '/api/v1/plans', status: 'error' });
    console.error('Plan generation error:', error);
    res.status(500).json({
      code: 'TP-9001',
      type: 'UNKNOWN',
      message: 'Plan generation failed',
      userMessage: '推荐生成出现意外问题，请稍后重试',
      userVisible: true,
      recoverable: true
    });
  }
});

/**
 * GET /api/v1/plans/health
 * 引擎健康检查
 */
router.get('/health', (req, res) => {
  const { getCities } = require('../../data/cityRecords');
  const cities = getCities();

  res.json({
    status: 'ok',
    engineVersion: '2.1.0-2026-07-12',
    cityCount: cities.length,
    traitDimensions: 16,
    agentEnabled: false,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /api/v1/plans/itinerary
 * AI 详细日程规划
 */
router.post('/itinerary', async (req, res) => {
  const startedAt = Date.now();
  try {
    const body = req.body || {};
    const errors = [];

    if (!body.cityId && !body.cityName) {
      errors.push('cityId 或 cityName 必填');
    }
    if (!body.days || body.days < 1 || body.days > 30) {
      errors.push('days 必须在 1-30 之间');
    }
    if (!Array.isArray(body.pois)) {
      errors.push('pois 必须是数组');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        code: 'TP-1006',
        type: 'VALIDATION',
        message: 'Itinerary request validation failed',
        userMessage: errors.join('；'),
        userVisible: true,
        recoverable: true
      });
    }

    const provider = getAgentProvider();
    const itinerary = await runWithAgent(
      provider,
      'generateItinerary',
      [{
        cityId: body.cityId,
        cityName: body.cityName,
        days: Number(body.days),
        budget: Number(body.budget) || 0,
        interests: Array.isArray(body.interests) ? body.interests : [],
        avoid: Array.isArray(body.avoid) ? body.avoid : [],
        mood: body.mood || '',
        companion: body.companion || 'solo',
        pois: body.pois
      }],
      null
    );

    if (!itinerary || !Array.isArray(itinerary.days)) {
      return res.status(503).json({
        code: 'TP-4003',
        type: 'LLM',
        message: 'Itinerary generation returned invalid structure',
        userMessage: 'AI 日程规划暂时不可用，请稍后重试',
        userVisible: true,
        recoverable: true
      });
    }

    monitoring.recordMetric('itinerary_generation_time', Date.now() - startedAt, {
      endpoint: '/api/v1/plans/itinerary', status: 'success'
    });
    monitoring.recordMetric('api_error_rate', 0, { endpoint: '/api/v1/plans/itinerary', status: 'success' });
    res.json(contentSafety.sanitizeOutputValue(itinerary));
  } catch (error) {
    monitoring.recordMetric('api_error_rate', 1, { endpoint: '/api/v1/plans/itinerary', status: 'error' });
    console.error('Itinerary generation error:', error);
    res.status(500).json({
      code: 'TP-9001',
      type: 'UNKNOWN',
      message: 'Itinerary generation failed',
      userMessage: '日程规划出现意外问题，请稍后重试',
      userVisible: true,
      recoverable: true
    });
  }
});

module.exports = router;
module.exports.resolveTrustedPersona = resolveTrustedPersona;
