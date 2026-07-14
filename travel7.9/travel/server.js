/**
 * 旅格 Travel Persona · 后端代理服务器（v2）
 *
 * 改进：
 * 1. 全局错误处理中间件
 * 2. Graceful shutdown
 * 3. 请求日志记录
 * 4. 健康检查扩展
 * 5. API 路由接入 LLM 服务层
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');

const { PersonaError, ValidationError, DataError, LLMError } = require('./src/utils/errors');
const { computePersonaScore } = require('./src/data/dimensionMapping');
const { recommendCities, generateReason } = require('./src/core/scoring');
const { solveItinerary, getItineraryStyle } = require('./src/core/itinerarySolver');
const weatherService = require('./src/services/weatherService');
const dataInterface = require('./src/data/dataInterface');
const llmService = require('./src/services/llmService');

// v3 算法框架
const algo = require('./src/algo');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== 启动时间 =====
const startTime = new Date().toISOString();

// ===== CORS =====
app.use(cors({
  origin: ['http://localhost:8080', 'http://127.0.0.1:8080', 'http://localhost:3000', 'http://localhost:5500', 'http://127.0.0.1:5500'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// ===== Helmet 安全头部 =====
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 15552000 } : false
}));

// ===== 响应压缩 =====
app.use(compression({ level: 6 }));

// ===== 请求日志 =====
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// ===== 限流：每分钟 30 次 =====
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 30,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

// ===== Body Parser =====
app.use(express.json({ limit: '1mb' }));

// 输入消毒中间件 — 防止原型污染攻击
function sanitizeInput(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  var forbidden = ['__proto__', 'constructor', 'prototype'];
  if (Array.isArray(obj)) return obj.map(sanitizeInput);
  var clean = {};
  for (var key of Object.keys(obj)) {
    if (forbidden.includes(key)) continue;
    clean[key] = sanitizeInput(obj[key]);
  }
  return clean;
}
app.use(function(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeInput(req.body);
  }
  next();
});

// ===== 健康检查 =====
app.get('/api/health', (req, res) => {
  var breakerStats;
  try { breakerStats = llmService.getStats(); } catch(e) { breakerStats = { totalCalls: 0, totalFailures: 0, breakers: {} }; }
  var cacheStats;
  try { cacheStats = weatherService.getCacheStats(); } catch(e) { cacheStats = { size: 0 }; }
  res.json({
    status: 'ok',
    version: '2.0.0',
    uptime: Math.floor(process.uptime()),
    llm: breakerStats,
    weather: cacheStats
  });
});

// ===== API 路由 =====

// 辅助函数：前端 pace 数字 → 后端 rhythm 字符串
// 5 个前端选项映射到 5 个不同的后端值，确保信息不丢失
function paceToRhythm(pace) {
  if (pace === 1) return '随机漫游';
  if (pace === 2) return '深度慢游';
  if (pace === 3) return '紧凑高效';  // 修复：不与 4 合并
  if (pace === 4) return '适中';
  if (pace === 5) return '特种兵';
  return '';
}

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

    res.json(result);
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

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/itinerary —— 行程生成（itinerarySolver 骨架 + LLM 润色）
app.post('/api/itinerary', async (req, res, next) => {
  try {
    const {
      cityId,
      cityName,
      days = 3,
      personaScore = {},
      weather = null,
      adjustInstruction = ''
    } = req.body;

    if (!cityId && !cityName) {
      throw new ValidationError('缺少 cityId 或 cityName 参数');
    }

    // Step 1: 查找城市数据
    const city = cityId
      ? dataInterface.getCityById(cityId)
      : dataInterface.searchCities({ name: cityName })[0];

    if (!city) {
      throw new DataError(`未找到城市: ${cityId || cityName}`);
    }

    // Step 2: 行程约束求解 → 骨架
    let skeleton;
    try {
      skeleton = solveItinerary({ city, days, weather, personaScore });
    } catch (err) {
      // 求解失败时降级为简单骨架
      console.warn('[/api/itinerary] 约束求解失败，使用简单骨架:', err.message);
      skeleton = {
        days: Array.from({ length: days }, (_, i) => ({
          day: i + 1,
          theme: `第 ${i + 1} 天`,
          morning: [{ name: '自由探索', note: '根据你的节奏自由安排' }],
          afternoon: [{ name: '自由探索', note: '根据你的节奏自由安排' }],
          evening: [{ name: '自由探索', note: '根据你的节奏自由安排' }]
        }))
      };
    }

    // Step 3: LLM 润色
    let result;
    try {
      result = await llmService.polishItinerary({
        cityName: city.name,
        days,
        personaLabel: skeleton.personaLabel || '',
        skeleton,
        adjustInstruction
      });
    } catch (err) {
      // LLM 失败时降级：返回骨架
      console.warn('[/api/itinerary] LLM 失败，返回骨架:', err.message);
      result = {
        city: city.name,
        days: skeleton.days,
        note: '行程润色服务暂时不可用，显示基础骨架',
        fallback: true
      };
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/weather —— 天气代理 + 缓存（接入 weatherService）
app.get('/api/weather', async (req, res) => {
  const { city, days = 7 } = req.query;

  if (!city) {
    return res.status(400).json({ error: '缺少 city 参数' });
  }

  try {
    const weather = await weatherService.getWeather(city, { days: parseInt(days) });
    res.json({ city, days: parseInt(days), ...weather });
  } catch (err) {
    // 降级：返回 mock 数据
    console.warn('[/api/weather] 天气服务失败，降级:', err.message);
    res.json({
      city,
      days: parseInt(days),
      daily: [],
      note: '天气服务暂时不可用',
      fallback: true
    });
  }
});

// POST /api/recommend —— 完整推荐链路（v3 多引擎管线 + v2 降级）
app.post('/api/recommend', (req, res, next) => {
  try {
    const { answers, options = {} } = req.body;

    if (!answers || typeof answers !== 'object') {
      throw new ValidationError('缺少 answers 参数或格式错误');
    }

    // 字段映射：前端格式 → 后端 dimensionMapping 期望格式
    const nomadValue = (answers.considerNomad === '是' || answers.considerNomad === '想试试')
      ? answers.considerNomad : '';

    const rawMapped = {
      emotionGoal: answers.emotionGoal || '',
      mood: answers.mood || '',
      door: (answers.spacePrefs && answers.spacePrefs.length > 0) ? answers.spacePrefs[0] : '',
      naturePref: answers.naturePref || '',
      duration: answers.travelTime || '',
      budget: String(answers.budget || ''),
      nomad: nomadValue,
      companion: answers.companion || '',
      travelStyle: answers.travelStyle || '',
      rhythm: paceToRhythm(answers.pacePref),
      risk: answers.risk || '',
      dislike: answers.dislike || []
    };

    // 移除空值键
    const mappedAnswers = {};
    for (var k in rawMapped) {
      var val = rawMapped[k];
      if (k === 'dislike') {
        if (Array.isArray(val) && val.length > 0 && val[0] !== '') {
          mappedAnswers[k] = val[0];
        }
      } else if (val !== '' && val !== undefined && val !== null) {
        mappedAnswers[k] = val;
      }
    }

    // 尝试 v3 算法管线
    const mode = options.mode || 'auto'; // 'quick' | 'deep' | 'auto'
    let useV3 = true;

    try {
      let result;
      const v3Options = {
        context: {
          month: new Date().getMonth() + 1,
          isHoliday: false
        }
      };

      if (mode === 'quick' || (mode === 'auto' && Object.keys(mappedAnswers).length <= 3)) {
        result = algo.quickRecommend(mappedAnswers, v3Options);
      } else if (mode === 'deep' || (mode === 'auto' && Object.keys(mappedAnswers).length >= 8)) {
        result = algo.deepRecommend(mappedAnswers, v3Options);
      } else {
        result = algo.fullRecommend(mappedAnswers, v3Options);
      }

      // v3 成功：返回完整结果
      return res.json(result);
    } catch (v3Err) {
      console.warn('[/api/recommend] v3 管线异常，降级到 v2:', v3Err.message);
      useV3 = false;
    }

    // v2 降级
    const personaResult = computePersonaScore(mappedAnswers);
    const recResult = recommendCities(personaResult.score, options);
    const topCity = recResult.topCities[0];
    let reason = null;
    if (topCity) {
      reason = generateReason(personaResult.score, topCity);
    }

    res.json({
      personaScore: personaResult.score,
      personaLabel: recResult.personaLabel,
      conflicts: personaResult.conflicts,
      topCities: recResult.topCities,
      reason,
      metadata: {
        ...personaResult.metadata,
        ...recResult.metadata,
        pipelineVersion: 'v2-fallback'
      }
    });
  } catch (err) {
    next(err);
  }
});

// ===== v3 算法增强 API 路由 =====

// POST /api/v3/recommend —— 显式调用 v3 深度管线
app.post('/api/v3/recommend', (req, res, next) => {
  try {
    const { answers, options = {} } = req.body;
    if (!answers || typeof answers !== 'object') {
      throw new ValidationError('缺少 answers 参数');
    }
    const result = algo.deepRecommend(answers, { context: { month: new Date().getMonth() + 1 } });
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/v3/pareto —— Pareto 前沿分析
app.post('/api/v3/pareto', (req, res, next) => {
  try {
    const { personaScore, cityIds } = req.body;
    if (!personaScore || !cityIds) {
      throw new ValidationError('缺少 personaScore 或 cityIds 参数');
    }
    const cities = cityIds.map(id => require('./src/data/cityDatabase').CITIES.find(c => c.id === id)).filter(Boolean);
    const { extractParetoFrontier } = require('./src/algo/paretoOptimizer');
    const result = extractParetoFrontier(cities, personaScore);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/v3/explain —— 城市推荐解释
app.post('/api/v3/explain', (req, res, next) => {
  try {
    const { personaScore, cityId, answers } = req.body;
    if (!personaScore || !cityId) {
      throw new ValidationError('缺少 personaScore 或 cityId 参数');
    }
    const city = require('./src/data/cityDatabase').CITIES.find(c => c.id === cityId);
    if (!city) throw new DataError(`未找到城市: ${cityId}`);
    const { generateFullExplanation } = require('./src/algo/explainability');
    const explanation = generateFullExplanation(personaScore, city, {
      userProfile: answers || {},
      personaLabel: '',
      alternatives: require('./src/data/cityDatabase').CITIES.filter(c => c.id !== cityId).slice(0, 3),
      mood: answers?.mood || '',
      totalQuestions: 12,
      answeredQuestions: Object.keys(answers || {}).length
    });
    res.json(explanation);
  } catch (err) { next(err); }
});

// GET /api/v3/context —— 当前所有城市的上下文分析
app.get('/api/v3/context', (req, res, next) => {
  try {
    const { computeAllContexts } = require('./src/algo/contextEngine');
    const { CITIES } = require('./src/data/cityDatabase');
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;
    const isHoliday = req.query.holiday === 'true';
    const context = { month, isHoliday };
    const result = computeAllContexts(CITIES, context);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v3/diversity —— 检测当前推荐是否陷入过滤器气泡
app.get('/api/v3/diversity', (req, res, next) => {
  try {
    const { detectFilterBubble } = require('./src/algo/diversityInjector');
    const { CITIES } = require('./src/data/cityDatabase');
    const cityIds = req.query.ids ? req.query.ids.split(',') : CITIES.slice(0, 5).map(c => c.id);
    const candidates = cityIds.map(id => CITIES.find(c => c.id === id)).filter(Boolean);
    const bubble = detectFilterBubble(candidates);
    res.json(bubble);
  } catch (err) { next(err); }
});

// POST /api/v3/temporal —— 用户人格时间动力学分析
app.post('/api/v3/temporal', (req, res, next) => {
  try {
    const { personaScore, history, userStats } = req.body;
    if (!personaScore) throw new ValidationError('缺少 personaScore');
    const { temporalAnalysis } = require('./src/algo/temporalDynamics');
    const { CITIES } = require('./src/data/cityDatabase');
    const result = temporalAnalysis(personaScore, history || [], userStats || {}, CITIES);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v3/health —— 算法引擎健康检查
app.get('/api/v3/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.0.0',
    engines: {
      multiLayerScorer: 'loaded',
      paretoOptimizer: 'loaded',
      explainability: 'loaded',
      collaborativeFilter: 'loaded',
      diversityInjector: 'loaded',
      contextEngine: 'loaded',
      temporalDynamics: 'loaded'
    },
    timestamp: new Date().toISOString()
  });
});

// POST /api/companion —— Travel Companion Agent（复赛）
app.post('/api/companion', (req, res) => {
  res.status(503).json({
    error: 'Companion Agent 尚未启用',
    note: '复赛阶段实现'
  });
});

// ===== 数据 API 路由（通过 dataInterface 统一接入） =====

// GET /api/data/cities —— 获取城市列表
app.get('/api/data/cities', (req, res, next) => {
  try {
    const { format = 'full' } = req.query;
    const cities = dataInterface.getCities({ format });
    res.json({ cities, count: cities.length });
  } catch (err) { next(err); }
});

// GET /api/data/cities/search —— 按维度筛选城市
app.get('/api/data/cities/search', (req, res, next) => {
  try {
    const filters = {};
    ['nature', 'pace', 'budget', 'freedom', 'social', 'explore'].forEach(dim => {
      if (req.query[dim] !== undefined) {
        const parsed = parseFloat(req.query[dim]);
        // 修复：NaN 检查，返回 400 错误而非静默过滤所有结果
        if (isNaN(parsed)) {
          return res.status(400).json({
            error: 'INVALID_DIMENSION_VALUE',
            message: `参数 ${dim}=${req.query[dim]} 不是有效的数字`,
            dimension: dim
          });
        }
        filters[dim] = parsed;
      }
    });
    // 如果已经有错误响应，直接返回
    if (res.headersSent) return;
    const cities = dataInterface.searchCities(filters);
    res.json({ cities, count: cities.length });
  } catch (err) { next(err); }
});

// GET /api/data/cities/:id —— 获取单个城市
app.get('/api/data/cities/:id', (req, res, next) => {
  try {
    const city = dataInterface.getCityById(req.params.id);
    if (!city) {
      return res.status(404).json({ error: `未找到城市: ${req.params.id}` });
    }
    res.json(city);
  } catch (err) { next(err); }
});

// GET /api/data/mappings/:tableName —— 获取指定映射表
app.get('/api/data/mappings/:tableName', (req, res, next) => {
  try {
    const table = dataInterface.getMappingTable(req.params.tableName);
    if (!table) {
      return res.status(404).json({ error: `未找到映射表: ${req.params.tableName}` });
    }
    res.json(table);
  } catch (err) { next(err); }
});

// GET /api/data/weights —— 获取当前权重配置
app.get('/api/data/weights', (req, res, next) => {
  try {
    const weights = dataInterface.getWeights();
    res.json(weights);
  } catch (err) { next(err); }
});

// GET /api/data/version —— 返回数据版本号
app.get('/api/data/version', (req, res, next) => {
  try {
    const version = dataInterface.getVersion();
    res.json({ version, timestamp: new Date().toISOString() });
  } catch (err) { next(err); }
});

// GET /api/data/snapshot —— 导出完整数据快照
app.get('/api/data/snapshot', (req, res, next) => {
  try {
    const snapshot = dataInterface.exportSnapshot();
    res.json({ ...snapshot, exportedAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ===== 静态文件服务 =====
app.use(express.static(path.join(__dirname, 'public-site'), {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0,
  etag: true,
  lastModified: true
}));

// 兜底：返回 index.html（SPA 路由）
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public-site', 'travel-persona', 'index.html'));
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
  console.log(`静态文件目录: ${path.join(__dirname, 'public-site')}`);
  console.log(`版本: 2.0`);
});

// 连接超时与 Keep-Alive 配置
server.timeout = 30000; // 30s 连接超时
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

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
