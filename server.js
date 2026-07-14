/**
 * 旅格 Travel Persona · 后端代理服务器（v2 -- Phase 0 冻结）
 *
 * 正式用户端使用 /api/v1/*；/api/* 仅保留兼容入口。
 *    正规 API 合同参见: docs/schemas/PlanResponse.json
 *    错误码体系参见:   docs/schemas/ErrorCodes.json
 *    API 版本化规划参见: 旅格-商业级产品体验与工程总纲-v1.md 13.6节
 *
 * 改进：
 * 1. 全局错误处理中间件
 * 2. Graceful shutdown
 * 3. 请求日志记录
 * 4. 健康检查扩展
 * 5. API 路由接入 LLM 服务层
 */

// 加载 .env 环境变量（必须在其他模块之前）
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { identityMiddleware, getIdentityStatus } = require('./src/services/auth/identityProvider');

const { PersonaError, ValidationError, DataError, LLMError } = require('./src/utils/errors');
const { computePersonaScore } = require('./src/data/dimensionMapping');
const { recommendCities, generateReason } = require('./src/core/scoring');
const llmService = require('./src/services/llmService');
const fallbackPlanner = require('./src/services/fallbackPlanner');
const { getWeather } = require('./src/services/weather/weatherService');
const { getCityByName } = require('./src/data/cityRecords');
const contentSafety = require('./src/services/ops/contentSafety');
const semanticContentSafety = require('./src/services/ops/semanticContentSafety');
const { getAgentProvider, runWithAgent, ALLOWED_PATHS } = require('./src/services/agent/agentProvider');
const { applyPatch } = require('./src/services/agent/structuredPatch');
const { getActiveProvider, isBaiduProvider } = require('./src/services/map/mapProvider');

const app = express();
const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
app.disable('x-powered-by');

function sendSafe(res, value) {
  return res.json(contentSafety.sanitizeOutputValue(value));
}

function getAllowedOrigins() {
  const defaults = [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  return String(process.env.ALLOWED_ORIGINS || defaults.join(','))
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function getRequestOrigin(req) {
  const value = String(req.get('origin') || '').trim();
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch (error) {
    return '';
  }
}

// ===== 启动时间 =====
const startTime = new Date().toISOString();

// ===== CORS =====
app.use(cors({
  origin(origin, callback) {
    if (!origin || getAllowedOrigins().includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-API-Key'],
  credentials: true
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' https://api.map.baidu.com https://mapopen-pub-jsapi.bj.bcebos.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://*.bdimg.com https://*.baidu.com https://*.bcebos.com",
    "connect-src 'self' https://*.baidu.com https://*.bdimg.com https://*.bcebos.com",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; '));
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(identityMiddleware());

// ===== 请求日志 =====
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ===== 限流：每分钟 10 次 =====
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: Number(process.env.RATE_LIMIT_PER_MINUTE) || 120,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

// ===== Body Parser =====
app.use(express.json({ limit: '1mb' }));

app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

app.use('/api/v1', (req, res, next) => {
  if (process.env.NODE_ENV !== 'production' || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }
  const requestOrigin = getRequestOrigin(req);
  // 无 Origin 头的请求视为同源请求，直接放行
  if (!requestOrigin) {
    return next();
  }
  if (!getAllowedOrigins().includes(requestOrigin)) {
    return res.status(403).json({
      code: 'TP-1403',
      type: 'AUTH',
      message: 'Request origin is not allowed',
      userVisible: false
    });
  }
  next();
});

// Future account clients only need to attach a Bearer token. Anonymous usage
// keeps the same signed guest session and receives the full local experience.
app.get('/api/v1/identity/session', (req, res) => {
  res.json({
    mode: req.identity?.mode || req.authMode || 'signed-guest',
    authenticated: Boolean(req.identity?.authenticated),
    displayName: req.identity?.displayName || null,
    dataInherited: Boolean(req.identity?.dataInherited)
  });
});

// ===== 健康检查 =====
app.get('/health', (req, res) => {
  const llmStats = llmService.getStats();
  const activeMapProvider = getActiveProvider();

  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: Date.now() - new Date(startTime).getTime(),
    version: '2.1.0',
    identity: getIdentityStatus(),
    map: {
      provider: activeMapProvider.name,
      freshness: isBaiduProvider(activeMapProvider) ? 'live' : 'snapshot',
      browserMap: process.env.BAIDU_WEB_AK ? 'baidu-webgl' : 'route-fallback',
      mcp: typeof activeMapProvider.getStatus === 'function' ? activeMapProvider.getStatus() : null
    },
    contentSafety: semanticContentSafety.getStatus(),
    llm: {
      totalCalls: llmStats.totalCalls,
      totalFailures: llmStats.totalFailures,
      breakers: {
        extract: llmStats.breakers.extract.state,
        reason: llmStats.breakers.reason.state,
        itinerary: llmStats.breakers.itinerary.state
      }
    }
  });
});

// ===== API 路由 =====

// 历史 API 默认关闭。新版用户端只使用 /api/v1/*；旧入口没有完整的
// 身份、语义安全和错误边界，不应进入生产攻击面。
app.use('/api', (req, res, next) => {
  if (req.path === '/v1' || req.path.startsWith('/v1/')) return next();
  if (process.env.ENABLE_LEGACY_API === 'true') return next();
  return res.status(404).json({ code: 'TP-9001', type: 'UNKNOWN', message: 'API endpoint not found' });
});

// POST /api/extract —— 维度提取（LLM 离散输出）
app.post('/api/extract', async (req, res, next) => {
  try {
    const { freeText, currentScore = {} } = req.body;

    if (!freeText) {
      throw new ValidationError('缺少 freeText 参数');
    }

    // 尝试调用 LLM
    let result;
    try {
      result = await llmService.extractDimensions({ freeText, currentScore });
    } catch (err) {
      // LLM 失败时降级：返回空增量（让调用方使用选项打分）
      console.warn('[/api/extract] LLM 失败，降级为空增量:', err.message);
      result = {
        delta: {},
        rationale: { note: 'LLM 服务暂时不可用，请使用选项打分' },
        confidence: 0,
        fallback: true
      };
    }

    sendSafe(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/reason —— 推荐理由（LLM + 模板降级）
app.post('/api/reason', async (req, res, next) => {
  try {
    const {
      personaScore,
      userQuotes = [],
      topCity,
      candidates = []
    } = req.body;

    if (!personaScore || !topCity) {
      throw new ValidationError('缺少 personaScore 或 topCity 参数');
    }

    // 先计算模板理由（作为降级方案）
    const templateReason = generateReason(personaScore, topCity, {
      userQuote: userQuotes[0] || ''
    });

    // 尝试调用 LLM
    let result;
    try {
      result = await llmService.generateReason({
        personaLabel: topCity.name,
        userQuote: userQuotes[0] || '',
        cityName: topCity.name,
        cityTags: topCity.emotionTags || [],
        bestMatch: templateReason.bestMatch,
        worstMatch: templateReason.worstMatch
      });
    } catch (err) {
      // LLM 失败时降级：返回模板理由
      console.warn('[/api/reason] LLM 失败，使用模板理由:', err.message);
      result = {
        ...templateReason,
        fallback: true
      };
    }

    sendSafe(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/itinerary —— 行程润色（LLM + 骨架降级）
app.post('/api/itinerary', async (req, res, next) => {
  try {
    const {
      city,
      skeleton,
      personaScore,
      adjustInstruction = ''
    } = req.body;

    if (!city || !skeleton) {
      throw new ValidationError('缺少 city 或 skeleton 参数');
    }

    // 尝试调用 LLM
    let result;
    try {
      result = await llmService.polishItinerary({
        cityName: city,
        days: skeleton.days?.length || 3,
        personaLabel: '',
        skeleton,
        adjustInstruction
      });
    } catch (err) {
      // LLM 失败时降级：返回骨架（朴素但可用）
      console.warn('[/api/itinerary] LLM 失败，返回骨架:', err.message);
      result = {
        city,
        days: skeleton.days || [],
        note: '行程润色服务暂时不可用，显示基础骨架',
        fallback: true
      };
    }

    sendSafe(res, result);
  } catch (err) {
    next(err);
  }
});

// GET /api/weather —— 天气代理 + 缓存
app.get('/api/weather', async (req, res, next) => {
  const { city, days = 7 } = req.query;

  if (!city) {
    return res.status(400).json({ error: '缺少 city 参数' });
  }

  try {
    const cityRecord = getCityByName(city);
    if (!cityRecord) return res.status(404).json({ error: '暂不支持该城市的天气查询' });
    const weather = await getWeather(cityRecord.cityId, { cityName: cityRecord.name });
    if (!weather) return res.status(503).json({ error: '天气数据暂时不可用', recoverable: true });
    res.json({ ...weather, city: cityRecord.name, forecast: (weather.forecast || []).slice(0, Math.min(14, Number(days) || 7)) });
  } catch (error) {
    next(error);
  }
});

// POST /api/recommend —— 完整推荐链路（新增）
app.post('/api/recommend', (req, res, next) => {
  try {
    const { answers, options = {} } = req.body;

    if (!answers || typeof answers !== 'object') {
      throw new ValidationError('缺少 answers 参数或格式错误');
    }

    // Step 1: 计算 PersonaScore
    const personaResult = computePersonaScore(answers);

    // Step 2: 推荐城市
    const recResult = recommendCities(personaResult.score, options);

    // Step 3: 生成理由（模板版）
    const topCity = recResult.topCities[0];
    let reason = null;
    if (topCity) {
      reason = generateReason(personaResult.score, topCity);
    }

    sendSafe(res, {
      personaScore: personaResult.score,
      personaLabel: recResult.personaLabel,
      conflicts: personaResult.conflicts,
      topCities: recResult.topCities,
      reason,
      metadata: {
        ...personaResult.metadata,
        ...recResult.metadata
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/agent/plan —— 智能体增强入口（本地引擎无感兜底）
app.post('/api/agent/plan', async (req, res, next) => {
  try {
    const { profile = {}, localPlan = null } = req.body || {};

    const fallback = localPlan || fallbackPlanner.plan(profile);
    const provider = getAgentProvider();
    const patch = await runWithAgent(
      provider,
      'enhanceExplanation',
      [contentSafety.sanitizeOutputValue(fallback)],
      null
    );
    const result = patch
      ? applyPatch(structuredClone(fallback), patch, ALLOWED_PATHS.enhanceExplanation)
      : fallback;

    sendSafe(res, {
      ...result,
      mode: patch ? 'agent-enhanced' : 'server-local-fallback',
      enhancedByAgent: Boolean(patch),
      userVisibleFailure: false,
      capability: {
        ...(result.capability || {}),
        localPlannerApplied: true,
        agentApplied: Boolean(patch)
      }
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/local/plan —— 无智能体完整规划链条
app.post('/api/local/plan', (req, res, next) => {
  try {
    const { profile = {} } = req.body || {};
    sendSafe(res, fallbackPlanner.plan(profile));
  } catch (err) {
    next(err);
  }
});

// GET /api/map/pois —— 地图 POI 数据层，后续可替换为百度地图 Place API
app.get('/api/map/pois', (req, res) => {
  const city = fallbackPlanner.getCityByName(req.query.city);

  if (!city) {
    return res.json({ city: req.query.city || '', pois: [], source: 'local-empty' });
  }

  sendSafe(res, {
    city: city.name,
    center: city.coordinates,
    centerQuery: city.centerQuery,
    stayZone: city.stayZone,
    pois: city.pois,
    source: 'local-map-fallback'
  });
});

// POST /api/research/signals —— 口碑/避坑信号层，后续可接小红书等数据清洗
app.post('/api/research/signals', (req, res) => {
  const { city: cityName } = req.body || {};
  const city = fallbackPlanner.getCityByName(cityName);

  if (!city) {
    return res.json({ city: cityName || '', signals: [], source: 'local-empty' });
  }

  sendSafe(res, {
    city: city.name,
    signals: city.platformSignals,
    riskFlags: city.riskFlags,
    source: 'curated-local-fallback',
    userVisibleFailure: false
  });
});

// POST /api/companion —— Travel Companion Agent 兼容入口
app.post('/api/companion', (req, res, next) => {
  try {
    const { profile = {} } = req.body || {};
    sendSafe(res, {
      ...fallbackPlanner.plan(profile),
      mode: 'companion-local-fallback',
      enhancedByAgent: false,
      userVisibleFailure: false
    });
  } catch (err) {
    next(err);
  }
});

// ===== API v1 路由（Phase 1-6 整合） =====
const v1PlansRouter = require('./src/api/v1/plans');
const v1JournalsRouter = require('./src/api/v1/journals');
const v1AgentRouter = require('./src/api/v1/agent');
const v1OpsRouter = require('./src/api/v1/ops');
const v1MapRouter = require('./src/api/v1/map');
const v1TransportRouter = require('./src/api/v1/transport');
const v1TelemetryRouter = require('./src/api/v1/telemetry');

app.use('/api/v1/plans', v1PlansRouter);
app.use('/api/v1/journals', v1JournalsRouter);
app.use('/api/v1/agent', v1AgentRouter);
app.use('/api/v1/ops', v1OpsRouter);
app.use('/api/v1/map', v1MapRouter);
app.use('/api/v1/transport', v1TransportRouter);
app.use('/api/v1/telemetry', v1TelemetryRouter);

// ===== 瓦片代理（解决客户端跨域和 TRAE 浏览器网络限制）=====
const TILE_PROVIDERS = {
  osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  amap: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}'
};
app.get('/api/v1/map/tile/:provider/:z/:x/:y', async (req, res) => {
  const { provider = 'amap', z, x, y } = req.params;
  if (!z || !x || !y) return res.status(400).send('Missing z/x/y');
  const subdomains = provider === 'amap' ? ['1','2','3','4'] : ['a','b','c'];
  const subdomain = subdomains[Math.abs(parseInt(x) + parseInt(y)) % subdomains.length];
  const urlTemplate = TILE_PROVIDERS[provider] || TILE_PROVIDERS.amap;
  const url = urlTemplate.replace('{s}', subdomain).replace('{z}', z).replace('{x}', x).replace('{y}', y);
  try {
    const tileRes = await fetch(url, {
      headers: { 'User-Agent': 'TravelPersona/2.1', Referer: 'http://localhost:3000/' }
    });
    if (!tileRes.ok) return res.status(tileRes.status).send('Tile not available');
    const contentType = tileRes.headers.get('content-type') || 'image/png';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = Buffer.from(await tileRes.arrayBuffer());
    res.send(buf);
  } catch (err) {
    res.status(502).send('Tile fetch failed');
  }
});

// ===== 静态文件服务 =====
// 新版多路由应用（Phase 3）
app.use('/app', express.static(path.join(__dirname, 'public-app')));
app.get(['/', '/travel-persona', '/travel-persona/'], (req, res) => res.redirect('/app/'));
// 旧版 Demo 默认不对外开放，需要内部对照时显式启用。
if (process.env.ENABLE_LEGACY_DEMO === 'true') {
  app.use('/legacy', express.static(path.join(__dirname, 'public-site')));
}

// 兜底：返回新应用 index.html
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ code: 'TP-9001', type: 'UNKNOWN', message: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, 'public-app', 'index.html'));
});

// ===== 全局错误处理中间件 =====
app.use((err, req, res, next) => {
  // 如果是 PersonaError，使用其内置的响应格式
  if (err instanceof PersonaError) {
    console.error(`[Error] ${err.type}: ${err.message}`, err.context);

    const statusCode = err.code || 500;
    const response = err.toResponse();

    // 可恢复错误返回 200 + 错误信息（前端可处理）
    // 不可恢复错误返回对应状态码
    if (err.recoverable) {
      return res.status(statusCode).json({
        ...response,
        recoverable: true
      });
    }

    return res.status(statusCode).json(response);
  }

  // 未知错误
  console.error('[Error] 未处理的错误:', err);
  res.status(500).json({
    error: {
      type: 'UNKNOWN',
      message: '服务器内部错误',
      code: 500
    }
  });
});

// ===== Graceful Shutdown =====
const server = app.listen(PORT, () => {
  console.log(`旅格 Travel Persona 服务器运行在 http://localhost:${PORT}`);
  console.log(`用户端目录: ${path.join(__dirname, 'public-app')}`);
  console.log(`版本: 2.1.0`);
});

// 处理优雅关闭
function gracefulShutdown(signal) {
  console.log(`\n[${signal}] 开始优雅关闭...`);

  server.close(() => {
    console.log('HTTP 服务器已关闭');
    process.exit(0);
  });

  // 强制关闭超时
  setTimeout(() => {
    console.error('强制关闭（超时）');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
