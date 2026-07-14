/**
 * 旅格 Travel Persona · 算法框架统一入口（v3）
 *
 * 集成了7个算法引擎，提供一站式推荐管线：
 *
 * 管线流程：
 *   Input (用户答案 + 上下文)
 *     → dimensionMapping (答案→六维画像)
 *     → multiLayerScorer (多层混合评分)
 *     → contextEngine (上下文增强)
 *     → collaborativeFilter (协同过滤)
 *     → diversityInjector (多样性注入)
 *     → paretoOptimizer (Pareto 前沿)
 *     → explainability (可解释性)
 *   Output (推荐城市 + 解释 + Pareto 前沿 + 置信度)
 *
 * 同时提供降级路径：当某个引擎失败时，自动跳过该层。
 */

const { computePersonaScore, inferPersonaLabel } = require('../data/dimensionMapping');
const { multiLayerScore } = require('./multiLayerScorer');
const { extractParetoFrontier, recommendWithPareto } = require('./paretoOptimizer');
const { enhanceDiversity } = require('./diversityInjector');
const { generateFullExplanation } = require('./explainability');
const { computeCollaborativeSignals, enhanceWithCollaborative, generateSyntheticUserPool } = require('./collaborativeFilter');
const { computeAllContexts } = require('./contextEngine');
const { temporalAnalysis, getLifecycleStrategy } = require('./temporalDynamics');
const { recommendCities, generateReason } = require('../core/scoring');
const { CITIES } = require('../data/cityDatabase');

// ============================================================
// 管线配置
// ============================================================

const PIPELINE_CONFIG = {
  // 各层开关
  layers: {
    hardConstraints: true,
    softMatching: true,
    contextBoost: true,
    collaborative: true,
    diversity: true,
    pareto: true,
    explainability: true,
    temporal: true
  },
  // 参数
  topK: 5,
  mmrLambda: 0.75,
  surpriseRatio: 0.25,
  diversityMinRelevance: 55,
  collaborativeWeight: 0.10
};

// ============================================================
// 管线缓存（简单的同步 LRU，避免重复计算）
// ============================================================
const pipelineCache = new Map();
const CACHE_MAX_SIZE = 50;
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

function getCacheKey(userScore, context) {
  // 简单的序列化键（生产环境应用更健壮的哈希）
  const scoreKey = Object.entries(userScore || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
  const ctxKey = context ? (context.month || '') + (context.isHoliday ? 'h' : '') : '';
  return `${scoreKey}|${ctxKey}`;
}

// ============================================================
// 综合推荐管线
// ============================================================

/**
 * 综合推荐：走完整的多层管线
 *
 * @param {Object} answers - 用户问卷答案
 * @param {Object} options - 管线选项
 * @param {Object} options.context - 上下文数据
 * @param {Array} options.userHistory - 用户历史行为
 * @param {Object} options.userStats - 用户使用统计
 * @param {Object} options.pipeline - 管线层配置（覆盖默认）
 * @returns {Object} 完整推荐结果
 */
function fullRecommend(answers, options = {}) {
  const startTime = Date.now();

  const {
    context = {},
    userHistory = [],
    userStats = {},
    pipeline: pipelineOverrides = {}
  } = options;

  // 合并管线配置
  const pipeline = { ...PIPELINE_CONFIG, layers: { ...PIPELINE_CONFIG.layers, ...pipelineOverrides.layers } };

  const trace = []; // 追踪每层耗时和结果

  // ================================================================
  // Step 0: 答案 → 六维画像
  // ================================================================
  const personaResult = computePersonaScore(answers);
  let userScore = personaResult.score;
  var personaLabel = inferPersonaLabel(userScore);
  trace.push({ layer: 'dimensionMapping', duration: 0, status: 'ok' });

  // ================================================================
  // Step 0b: 时间动力学调整
  // ================================================================
  let lifecycle = null;
  if (pipeline.layers.temporal && (userHistory.length > 0 || userStats.totalSessions > 0)) {
    try {
      const temporal = temporalAnalysis(userScore, userHistory, userStats, CITIES);
      userScore = temporal.effectiveScore;
      lifecycle = temporal.lifecycle;
      trace.push({ layer: 'temporal', duration: 0, status: 'ok', summary: temporal.drift.summary });
    } catch (err) {
      console.warn('[Pipeline] 时间动力学分析失败，使用原始画像:', err.message);
      trace.push({ layer: 'temporal', duration: 0, status: 'failed', error: err.message });
    }
  }

  // ================================================================
  // Step 1: 多层混合评分
  // ================================================================
  let scored;
  try {
    const scoreResult = multiLayerScore(CITIES, userScore, {
      userProfile: buildUserProfile(answers),
      context,
      userHistory,
      topK: pipeline.topK,
      enableMMR: pipeline.layers.diversity,
      mmrLambda: pipeline.mmrLambda
    });
    scored = scoreResult;
    trace.push({ layer: 'multiLayerScore', duration: 0, status: 'ok', count: scored.candidates.length });
  } catch (err) {
    console.warn('[Pipeline] 多层评分失败，降级到基础评分:', err.message);
    const fallback = recommendCities(userScore);
    scored = {
      candidates: fallback.topCities.map(c => ({
        id: c.id, name: c.name, city: CITIES.find(ci => ci.id === c.id),
        rawScore: c.matchScore, finalScore: c.matchScore
      })),
      meta: { fallback: true }
    };
    trace.push({ layer: 'multiLayerScore', duration: 0, status: 'fallback' });
  }

  let candidates = scored.candidates;

  // ================================================================
  // Step 2: 上下文增强
  // ================================================================
  if (pipeline.layers.contextBoost) {
    try {
      const { cityMultipliers } = computeAllContexts(
        candidates.map(c => c.city || CITIES.find(ci => ci.id === c.id)),
        context
      );

      candidates = candidates.map(c => {
        const cityId = c.id || c.city?.id;
        const ctx = cityMultipliers[cityId];
        const multiplier = ctx ? ctx.multiplier : 1.0;
        return {
          ...c,
          finalScore: Math.round((c.finalScore || c.rawScore || 50) * multiplier),
          contextMultiplier: multiplier,
          contextSummary: ctx ? ctx.summary : ''
        };
      });

      candidates.sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));
      trace.push({ layer: 'contextBoost', duration: 0, status: 'ok' });
    } catch (err) {
      console.warn('[Pipeline] 上下文增强失败:', err.message);
      trace.push({ layer: 'contextBoost', duration: 0, status: 'failed' });
    }
  }

  // ================================================================
  // Step 3: 协同过滤增强
  // ================================================================
  let collaborSignals = null;
  if (pipeline.layers.collaborative) {
    try {
      const synthPool = generateSyntheticUserPool(15, CITIES);
      collaborSignals = computeCollaborativeSignals(userScore, CITIES, {
        userPool: synthPool,
        userHistory
      });
      candidates = enhanceWithCollaborative(candidates, collaborSignals);
      trace.push({
        layer: 'collaborative',
        duration: 0, status: 'ok',
        cluster: collaborSignals.cluster.label
      });
    } catch (err) {
      console.warn('[Pipeline] 协同过滤失败:', err.message);
      trace.push({ layer: 'collaborative', duration: 0, status: 'failed' });
    }
  }

  // ================================================================
  // Step 4: 多样性注入
  // ================================================================
  if (pipeline.layers.diversity) {
    try {
      const diversityResult = enhanceDiversity(candidates, userScore, CITIES, {
        surpriseRatio: lifecycle ? lifecycle.diversityRatio : pipeline.surpriseRatio,
        minRelevance: pipeline.diversityMinRelevance
      });
      candidates = diversityResult.enhanced;
      trace.push({
        layer: 'diversity',
        duration: 0, status: 'ok',
        bubble: diversityResult.diversityReport.bubble.isBubble
      });
    } catch (err) {
      console.warn('[Pipeline] 多样性注入失败:', err.message);
      trace.push({ layer: 'diversity', duration: 0, status: 'failed' });
    }
  }

  // ================================================================
  // Step 5: Pareto 前沿
  // ================================================================
  let paretoResult = null;
  if (pipeline.layers.pareto && candidates.length >= 2) {
    try {
      // 确保输入格式兼容（diversity 注入后可能有额外字段）
      var paretoInput = candidates.map(function(c) {
        var dims = c.dimensions || (c.city && c.city.dimensions) || {};
        return {
          id: c.id || (c.city && c.city.id) || 'unknown',
          name: c.name || (c.city && c.city.name) || 'unknown',
          city: c.city || c,
          dimensions: dims
        };
      });
      paretoResult = recommendWithPareto(paretoInput, userScore, {
        strategy: 'balanced',
        topK: pipeline.topK,
        includeTradeOffs: true
      });
      trace.push({
        layer: 'pareto',
        duration: 0, status: 'ok',
        frontSize: (paretoResult.paretoAnalysis && paretoResult.paretoAnalysis.paretoFrontSize) || 0
      });
    } catch (err) {
      console.warn('[Pipeline] Pareto 分析失败:', err.message);
      trace.push({ layer: 'pareto', duration: 0, status: 'failed' });
    }
  }

  // ================================================================
  // Step 6: 可解释性
  // ================================================================
  let explanation = null;
  if (pipeline.layers.explainability && candidates.length > 0) {
    try {
      const topCandidate = candidates[0];
      const topCity = topCandidate.city || CITIES.find(c => c.id === (topCandidate.id));
      const alternatives = candidates.slice(1, 4).map(c =>
        c.city || CITIES.find(ci => ci.id === c.id)
      ).filter(Boolean);

      explanation = generateFullExplanation(userScore, topCity, {
        userProfile: answers,
        personaLabel: personaLabel.label || personaLabel,
        alternatives,
        matchContributions: topCandidate.matchContributions || topCandidate.contributions,
        mood: answers.mood || '',
        userHistory,
        totalQuestions: 12,
        answeredQuestions: Object.keys(answers).length
      });
      trace.push({ layer: 'explainability', duration: 0, status: 'ok' });
    } catch (err) {
      console.warn('[Pipeline] 可解释性生成失败:', err.message);
      trace.push({ layer: 'explainability', duration: 0, status: 'failed' });
    }
  }

  // ================================================================
  // 组装最终输出
  // ================================================================
  const topCities = candidates.slice(0, pipeline.topK).map(c => ({
    id: c.id || c.city?.id,
    name: c.name || c.city?.name,
    city: c.city,
    matchScore: c.finalScore || c.rawScore || c.matchScore || 50,
    scoreBreakdown: c.scoreBreakdown || null,
    contextMultiplier: c.contextMultiplier || null,
    contextSummary: c.contextSummary || '',
    noveltyScore: c.novelty || c.noveltyScore || null,
    collaborativeSignal: c.collaborativeSignal || null,
    source: c._source || 'normal',
    dimensions: c.dimensions || c.city?.dimensions || {}
  }));

  const totalDuration = Date.now() - startTime;

  return {
    personaScore: userScore,
    personaLabel: personaLabel,
    conflicts: personaResult.conflicts,
    topCities,
    pareto: paretoResult
      ? {
        front: paretoResult.recommendations.slice(0, 3).map(r => ({
          id: r.id, name: r.name, objectives: {
            natureFit: r.natureFit, socialFit: r.socialFit,
            budgetEfficiency: r.budgetEfficiency, noveltyIndex: r.noveltyIndex
          }
        })),
        tradeOffs: paretoResult.tradeOffs,
        summary: paretoResult.paretoAnalysis
      }
      : null,
    explanation: explanation
      ? {
        oneLiner: explanation.summary.oneLiner,
        dimensional: explanation.dimensional,
        counterfactuals: explanation.counterfactuals,
        decisionPath: explanation.decisionPath,
        confidence: explanation.confidence
      }
      : null,
    lifecycle: lifecycle ? { stage: lifecycle.stage, strategy: lifecycle } : null,
    metadata: {
      duration: totalDuration,
      pipeline: trace,
      version: '3.0.0',
      layersExecuted: trace.map(t => t.layer),
      timestamp: new Date().toISOString()
    }
  };
}

// ============================================================
// 快捷推荐（走核心管线，跳过重计算层）
// ============================================================

/**
 * 轻量推荐：仅走核心评分 + 上下文
 * 用于需要快速返回的场景
 */
function quickRecommend(answers, options = {}) {
  return fullRecommend(answers, {
    ...options,
    pipeline: {
      layers: {
        hardConstraints: true,
        softMatching: true,
        contextBoost: true,
        collaborative: false,
        diversity: false,
        pareto: false,
        explainability: true,
        temporal: false
      }
    }
  });
}

/**
 * 深度推荐：走完整七层管线
 * 用于用户明确要求"深度分析"的场景（20 题测评）
 */
function deepRecommend(answers, options = {}) {
  return fullRecommend(answers, {
    ...options,
    pipeline: {
      layers: {
        hardConstraints: true,
        softMatching: true,
        contextBoost: true,
        collaborative: true,
        diversity: true,
        pareto: true,
        explainability: true,
        temporal: true
      }
    }
  });
}

// ============================================================
// 辅助函数
// ============================================================

function buildUserProfile(answers) {
  return {
    maxDailyBudget: answers.budget ? parseInt(answers.budget) / 3 : null,
    altitudeSensitive: answers.dislike === '高原' || (answers.extraInfo || '').includes('高原'),
    tripDays: answers.duration === '1天' ? 1 : answers.duration === '2-3天' ? 2 : answers.duration === '4-5天' ? 4 : answers.duration === '7天以上' ? 7 : null,
    transportMode: answers.transportMode || null,
    emotionGoal: answers.emotionGoal || '',
    mood: answers.mood || ''
  };
}

module.exports = {
  // 配置
  PIPELINE_CONFIG,

  // 核心接口
  fullRecommend,
  quickRecommend,
  deepRecommend,

  // 各层独立导出（方便单层测试）
  layers: {
    multiLayerScore: require('./multiLayerScorer'),
    paretoOptimizer: require('./paretoOptimizer'),
    explainability: require('./explainability'),
    collaborativeFilter: require('./collaborativeFilter'),
    diversityInjector: require('./diversityInjector'),
    contextEngine: require('./contextEngine'),
    temporalDynamics: require('./temporalDynamics')
  }
};
