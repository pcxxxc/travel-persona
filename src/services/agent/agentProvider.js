/**
 * 旅格 Travel Persona · Agent Provider 供应商无关接口（Phase 5）
 *
 * 总纲 10.1-10.4：定义供应商无关的 Agent 能力契约，提供 GLM 与 Mock 两套实现。
 *   - AgentProvider        基类，声明四项能力契约
 *   - GLMAgentProvider     调用 GLM API，带超时（15s）与重试（最多 2 次）
 *   - MockAgentProvider    本地启发式生成结果，离线/测试可用
 *   - getAgentProvider()   工厂函数，依据 AGENT_PROVIDER 选择实现
 *
 * 四项能力（总纲 11.5）：
 *   - extractIntent(freeText)          从自由文本提取当次旅行取向
 *   - enhanceExplanation(planResponse) 增强推荐解释（自然、克制）
 *   - adjustInTrip(planId, adjustments) 旅中受约束调整
 *   - summarizeJournal(journalEntries)  旅后复盘整理
 *
 * 总纲 10.5 Agent 安全规则：
 *   - 不得创建未验证 POI
 *   - 不得移动锁定节点
 *   - 不得修改长期人格
 *   - 返回内容必须经过事实校验
 *
 * 工厂选择（环境变量 AGENT_PROVIDER）：
 *   - 'glm'  -> GLMAgentProvider（需 GLM_API_KEY）
 *   - 'mock' -> MockAgentProvider
 *   - 其它/未设置 -> null（Agent 关闭，核心流程不依赖 Agent）
 */

const { CircuitBreaker, getBreaker } = require('./circuitBreaker');
const { validatePatch, factCheck } = require('./structuredPatch');
const { LLMError, ValidationError } = require('../../utils/errors');

/**
 * 各能力允许 Agent 修改的白名单路径（总纲 10.5 / 11.3）
 * 仅这些路径（及其子路径）可被 Agent Patch 触碰。
 */
const ALLOWED_PATHS = {
  extractIntent: ['/intent', '/softPreferences', '/tempAdjustments', '/sessionNotes'],
  enhanceExplanation: ['/explanations', '/highlights', '/conversationReply'],
  adjustInTrip: ['/selectedPlan/days', '/selectedPlan/notes', '/uncertainties'],
  summarizeJournal: ['/journalSummary', '/insights', '/reflectionPrompts']
};

/**
 * 全局受保护路径（任何能力都不得触碰，定义于 structuredPatch.PROTECTED_PATHS）
 * 这里仅作注释说明：personaProfile.traits / lockedTraits / hardConstraints / lockedNodes
 */

// ===== 基类 =====

/**
 * AgentProvider 供应商无关基类
 * 子类需实现四项能力，并通过 _safeReturn 统一执行安全校验。
 */
class AgentProvider {
  constructor(options = {}) {
    this.options = options;
    this.name = 'base';
    // 可选数据源，用于返回前事实校验（POI/坐标是否已验证）
    this.dataSource = options.dataSource || null;
  }

  /**
   * 自由文本提取旅行取向
   * @param {string} freeText - 用户自由文本
   * @returns {Promise<Object>} 结构化 Patch
   */
  async extractIntent(freeText) {
    throw new Error('AgentProvider.extractIntent 未实现');
  }

  /**
   * 增强推荐解释
   * @param {Object} planResponse - 本地规划器产出的 PlanResponse
   * @returns {Promise<Object>} 结构化 Patch
   */
  async enhanceExplanation(planResponse) {
    throw new Error('AgentProvider.enhanceExplanation 未实现');
  }

  /**
   * 旅中受约束调整
   * @param {string} planId - 行程 ID
   * @param {Object} adjustments - 调整指令（天气/精力/手动改期等）
   * @returns {Promise<Object>} 结构化 Patch
   */
  async adjustInTrip(planId, adjustments) {
    throw new Error('AgentProvider.adjustInTrip 未实现');
  }

  /**
   * 复盘整理
   * @param {Array} journalEntries - 手账条目
   * @returns {Promise<Object>} 结构化 Patch
   */
  async summarizeJournal(journalEntries) {
    throw new Error('AgentProvider.summarizeJournal 未实现');
  }

  /**
   * 生成详细日程规划
   * @param {Object} params - 规划参数
   * @param {string} params.cityName - 城市名称
   * @param {number} params.days - 天数
   * @param {number} params.budget - 预算
   * @param {string[]} params.interests - 兴趣标签
   * @param {string[]} params.avoid - 回避标签
   * @param {string} params.mood - 旅行动机
   * @param {string} params.companion - 同行类型
   * @param {Array} params.pois - 可用 POI 列表
   * @returns {Promise<Object>} 详细日程 JSON
   */
  async generateItinerary(params) {
    throw new Error('AgentProvider.generateItinerary 未实现');
  }

  /**
   * 设置事实校验数据源
   */
  setDataSource(dataSource) {
    this.dataSource = dataSource || null;
  }

  /**
   * 安全返回：对 Agent 产出的 Patch 执行白名单校验 + 事实校验
   * 任一不通过则抛出 LLMError，由调用方捕获后丢弃 Agent 结果（无感降级）。
   * @param {Object} patch - Agent 产出的 Patch
   * @param {string[]} allowedPaths - 该能力的白名单路径
   * @param {Object} dataSource - 事实校验数据源（可选）
   * @returns {Object} 通过校验的 Patch
   * @throws {LLMError} 校验失败
   */
  _safeReturn(patch, allowedPaths, dataSource) {
    // 1) 白名单 + 受保护路径校验
    const validation = validatePatch(patch, allowedPaths);
    if (!validation.valid) {
      throw new LLMError(
        `Agent Patch 安全校验失败: ${validation.errors.join('; ')}`,
        { operation: 'agent_patch_validate', errors: validation.errors }
      );
    }
    // 2) 事实校验（POI/坐标是否存在于数据源）
    if (dataSource) {
      const fc = factCheck(patch, dataSource);
      if (!fc.valid) {
        throw new LLMError(
          `Agent Patch 事实校验失败: ${JSON.stringify(fc.violations)}`,
          { operation: 'agent_fact_check', violations: fc.violations }
        );
      }
    }
    return patch;
  }
}

// ===== DeepSeek 实现 =====

/**
 * DeepSeekAgentProvider —— 调用 DeepSeek API（OpenAI 兼容格式）
 * - 超时 15 秒（AbortController）
 * - 最多重试 2 次
 * - 受熔断器保护（连续 5 次失败熔断 30 秒）
 * - 返回结构化 Patch，并经 _safeReturn 校验
 */
class DeepSeekAgentProvider extends AgentProvider {
  constructor(options = {}) {
    super(options);
    this.name = 'deepseek';
    this.apiKey = options.apiKey || process.env.DEEPSEEK_API_KEY || process.env.GLM_API_KEY;
    this.baseUrl = options.baseUrl || process.env.DEEPSEEK_BASE_URL || process.env.GLM_BASE_URL || 'https://api.deepseek.com/v1';
    // DeepSeek V4 双模型：flash 用于常规，pro 用于旅后复盘/复杂多城
    this.flashModel = options.flashModel || process.env.DEEPSEEK_MODEL_FLASH || process.env.DEEPSEEK_MODEL || process.env.GLM_MODEL || 'deepseek-chat';
    this.proModel = options.proModel || process.env.DEEPSEEK_MODEL_PRO || 'deepseek-reasoner';
    this.model = this.flashModel;  // 默认使用 flash
    this.timeout = options.timeout || 30000;
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 2;
    this.breaker = options.breaker || getBreaker('deepseek-agent', {
      failureThreshold: 5,
      recoveryTimeout: 30000
    });

    if (!this.apiKey) {
      throw new LLMError('未设置 DEEPSEEK_API_KEY 或 GLM_API_KEY 环境变量', { operation: 'init_deepseek' });
    }
  }

  async _callDeepSeek(prompt, { maxTokens = 1024 } = {}) {
    return this.breaker.execute(async () => {
      const attempts = this.maxRetries + 1;
      let lastErr = null;

      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
          const resp = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
              model: this.model,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: maxTokens,
              temperature: 0.3
            }),
            signal: controller.signal
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new LLMError(`DeepSeek API 错误 ${resp.status}: ${text}`, {
              operation: 'call_deepseek',
              status: resp.status,
              response: text
            });
          }

          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content || '';
          return content;
        } catch (err) {
          if (err.name === 'AbortError') {
            lastErr = new LLMError(`DeepSeek 调用超时（${this.timeout}ms）`, {
              operation: 'call_deepseek',
              timeout: this.timeout
            });
          } else if (err instanceof LLMError) {
            lastErr = err;
          } else {
            lastErr = new LLMError(`DeepSeek 调用失败: ${err.message}`, {
              operation: 'call_deepseek',
              originalError: err.message
            });
          }

          const status = lastErr.context?.status;
          const isTimeout = !!lastErr.context?.timeout;
          const retriable = isTimeout || status === 429 || (status >= 500 && status <= 599) || !status;
          if (!retriable || attempt === attempts - 1) {
            break;
          }
        } finally {
          clearTimeout(timer);
        }
      }

      throw lastErr instanceof Error
        ? lastErr
        : new LLMError(`DeepSeek 调用失败: ${lastErr}`, { operation: 'call_deepseek' });
    });
  }

  _normalizePatch(parsed) {
    if (parsed && Array.isArray(parsed.operations)) {
      return parsed;
    }
    throw new LLMError('Agent 返回非结构化 Patch（缺少 operations）', {
      operation: 'normalize_patch',
      parsed
    });
  }

  async extractIntent(freeText) {
    if (!freeText || typeof freeText !== 'string') {
      throw new ValidationError('freeText 必须是字符串', { freeText });
    }
    const prompt = [
      '你是旅格的旅行意图分析助手。请从用户自由文本中提取「当次旅行取向」（软偏好），以 JSON Patch 格式返回。',
      '只允许修改路径：/intent、/softPreferences、/tempAdjustments、/sessionNotes。',
      '禁止修改 /personaProfile/traits、/lockedTraits、/hardConstraints、/lockedNodes。',
      '不得创建未经验证的 POI。',
      `用户文本：${freeText}`,
      '返回格式：{ "operations": [ { "op": "replace", "path": "/intent/summary", "value": "..." } ] }'
    ].join('\n');

    const content = await this._callDeepSeek(prompt, { maxTokens: 512 });
    const patch = this._normalizePatch(parseJSONContent(content));
    return this._safeReturn(patch, ALLOWED_PATHS.extractIntent, this.dataSource);
  }

  async enhanceExplanation(planResponse) {
    if (!planResponse || typeof planResponse !== 'object') {
      throw new ValidationError('planResponse 必须是对象', { planResponse });
    }
    const prompt = [
      '你是旅格的旅行编辑。请基于本地推荐结果，写出自然、克制的解释，以 JSON Patch 格式返回。',
      '只允许修改路径：/explanations、/highlights、/conversationReply。',
      '禁止修改 /personaProfile/traits、/lockedTraits、/hardConstraints、/lockedNodes。',
      '语气温暖但不煽情，不要过度承诺，不要堆砌景点。',
      `本地结果摘要：${JSON.stringify(planResponse).slice(0, 1500)}`,
      '返回格式：{ "operations": [ { "op": "replace", "path": "/explanations/0/reason", "value": "..." } ] }'
    ].join('\n');

    const content = await this._callDeepSeek(prompt, { maxTokens: 1024 });
    const patch = this._normalizePatch(parseJSONContent(content));
    return this._safeReturn(patch, ALLOWED_PATHS.enhanceExplanation, this.dataSource);
  }

  async adjustInTrip(planId, adjustments) {
    if (!planId) {
      throw new ValidationError('planId 不能为空', { planId });
    }
    const prompt = [
      '你是旅格的旅中调整助手。请根据旅中状态生成受约束的行程调整，以 JSON Patch 格式返回。',
      '只允许修改路径：/selectedPlan/days、/selectedPlan/notes、/uncertainties。',
      '禁止移动锁定节点（/lockedNodes），禁止修改硬约束与长期人格。',
      '不得创建未经验证的 POI；如需替换地点，只能引用已验证 POI。',
      `行程ID：${planId}`,
      `调整指令：${JSON.stringify(adjustments || {})}`,
      '返回格式：{ "operations": [ { "op": "replace", "path": "/selectedPlan/days/0/morning", "value": "..." } ] }'
    ].join('\n');

    const content = await this._callDeepSeek(prompt, { maxTokens: 1024 });
    const patch = this._normalizePatch(parseJSONContent(content));
    return this._safeReturn(patch, ALLOWED_PATHS.adjustInTrip, this.dataSource);
  }

  async summarizeJournal(journalEntries) {
    const entries = Array.isArray(journalEntries) ? journalEntries : [];
    const prompt = [
      '你是旅格的复盘助手。请根据用户手账生成旅后复盘摘要与温和的反思问题，以 JSON Patch 格式返回。',
      '只允许修改路径：/journalSummary、/insights、/reflectionPrompts。',
      '只递问题、不给建议；主语始终是用户；不得根据敏感输入生成身份/心理标签。',
      `手账条目：${JSON.stringify(entries).slice(0, 1500)}`,
      '返回格式：{ "operations": [ { "op": "replace", "path": "/journalSummary", "value": "..." } ] }'
    ].join('\n');

    const savedModel = this.model;
    this.model = this.proModel;  // 旅后复盘使用 pro 模型
    try {
      const content = await this._callDeepSeek(prompt, { maxTokens: 1500 });
      const patch = this._normalizePatch(parseJSONContent(content));
      return this._safeReturn(patch, ALLOWED_PATHS.summarizeJournal, this.dataSource);
    } finally {
      this.model = savedModel;
    }
  }

  async generateItinerary(params) {
    const {
      cityName = '',
      days = 3,
      budget = 1000,
      interests = [],
      avoid = [],
      mood = '',
      companion = 'solo',
      pois = []
    } = params || {};

    const prompt = [
      '你是一位资深旅行规划师。请根据以下信息，为用户生成一份详细的城市旅行日程规划。',
      '',
      '## 输入信息',
      `- 城市：${cityName}`,
      `- 天数：${days} 天`,
      `- 总预算：约 ${budget} 元`,
      `- 兴趣：${interests.join('、') || '无特定偏好'}`,
      `- 回避：${avoid.join('、') || '无'}`,
      `- 旅行动机：${mood}`,
      `- 同行：${companion}`,
      pois.length > 0
        ? `- 可用 POI 列表（优先从中选择，也可补充你确知存在的同类地点）：\n${JSON.stringify(pois.slice(0, 30), null, 2)}`
        : `- POI 列表：未提供，请根据你对${cityName}的了解，自行推荐真实的景点、餐饮、住宿地点。`,
      '',
      '## 输出规则',
      '1. 严格按以下 JSON 格式输出，不要包含 markdown 代码块标记，不要添加任何额外文字。',
      '2. 每天安排 2-4 个活动，时间合理，避免过度紧凑。',
      '3. POI 名称应使用该地点的正式/常用名称，确保真实存在。',
      '4. 预算分配要现实，包含餐饮、门票、交通、住宿等。',
      '5. 根据兴趣和回避调整推荐内容。',
      '6. 每个活动包含实用建议（tips）。',
      '7. 类型只能是：景点、餐饮、交通、休息 四种之一。',
      '8. 每个活动必须包含 duration（分钟）、location（具体地址）、transportToNext（到下一站怎么走+多久）、highlight（一个亮点/看点）。',
      '9. 每天必须包含 accommodation（推荐住宿区域）和 accommodationBudget（当日住宿预算）。',
      '10. transportToNext 描述从当前活动地点到下一个活动地点的交通方式和预计时间。',
      '',
      '## 输出格式',
      JSON.stringify({
        days: [
          {
            day: 1,
            date: '建议日期描述，如"第一天 · 抵达与初探"',
            theme: '当天主题',
            schedule: [
              {
                time: '09:00-11:30',
                activity: '活动名称',
                poiName: 'POI名称（必须匹配pois列表）',
                type: '景点/餐饮/交通/休息',
                duration: 150,
                location: '具体地址描述',
                budget: 120,
                tips: '实用建议',
                transportToNext: '步行15分钟',
                highlight: '亮点描述',
                lat: 39.9,
                lng: 116.4
              }
            ],
            dayBudget: 350,
            dayTransport: '地铁/公交/步行',
            accommodation: '推荐住宿区域，如鼓楼区附近经济型酒店',
            accommodationBudget: 200
          }
        ],
        totalBudget: 1050,
        transportTips: '整体交通建议',
        budgetBreakdown: { '住宿': 400, '餐饮': 300, '门票': 200, '交通': 150 }
      }, null, 2),
      '',
      '请直接输出纯 JSON，不要包裹在 ```json 代码块中。'
    ].join('\n');

    const savedModel = this.model;
    const savedTimeout = this.timeout;
    this.model = this.proModel;  // 复杂多城日程使用 pro 模型
    this.timeout = 60000;        // 日程生成允许 60 秒
    try {
      const content = await this._callDeepSeek(prompt, { maxTokens: 4096 });
      return parseJSONContent(content);
    } finally {
      this.model = savedModel;
      this.timeout = savedTimeout;
    }
  }
}

// ===== GLM 实现 =====

/**
 * GLMAgentProvider —— 调用智谱 GLM API
 * - 超时 15 秒（AbortController）
 * - 最多重试 2 次（仅超时/5xx/429/网络错误重试，4xx 鉴权类不重试）
 * - 受熔断器保护（连续 5 次失败熔断 30 秒）
 * - 返回结构化 Patch，并经 _safeReturn 校验
 */
class GLMAgentProvider extends AgentProvider {
  constructor(options = {}) {
    super(options);
    this.name = 'glm';
    this.apiKey = options.apiKey || process.env.GLM_API_KEY;
    this.baseUrl = options.baseUrl || process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
    this.model = options.model || process.env.GLM_MODEL || 'glm-4';
    this.timeout = options.timeout || 30000;        // 30 秒超时
    this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : 2; // 最多重试 2 次
    // 复用命名熔断器单例
    this.breaker = options.breaker || getBreaker('glm-agent', {
      failureThreshold: 5,
      recoveryTimeout: 30000
    });

    if (!this.apiKey) {
      throw new LLMError('未设置 GLM_API_KEY 环境变量', { operation: 'init_glm' });
    }
  }

  /**
   * 带超时与重试的 GLM 调用（受熔断器保护）
   * @param {string} prompt - 完整 Prompt
   * @param {Object} opts
   * @param {number} opts.maxTokens - 最大 token 数
   * @returns {Promise<string>} 模型输出文本
   */
  async _callGLM(prompt, { maxTokens = 1024 } = {}) {
    return this.breaker.execute(async () => {
      const attempts = this.maxRetries + 1; // 初次 + 重试次数
      let lastErr = null;

      for (let attempt = 0; attempt < attempts; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);
        try {
          const resp = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
              model: this.model,
              messages: [{ role: 'user', content: prompt }],
              max_tokens: maxTokens,
              temperature: 0.3
            }),
            signal: controller.signal
          });

          if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new LLMError(`GLM API 错误 ${resp.status}: ${text}`, {
              operation: 'call_glm',
              status: resp.status,
              response: text
            });
          }

          const data = await resp.json();
          const content = data.choices?.[0]?.message?.content || '';
          return content;
        } catch (err) {
          // 统一包装为 LLMError，便于判断可重试性
          if (err.name === 'AbortError') {
            lastErr = new LLMError(`GLM 调用超时（${this.timeout}ms）`, {
              operation: 'call_glm',
              timeout: this.timeout
            });
          } else if (err instanceof LLMError) {
            lastErr = err;
          } else {
            lastErr = new LLMError(`GLM 调用失败: ${err.message}`, {
              operation: 'call_glm',
              originalError: err.message
            });
          }

          // 判断是否可重试：超时 / 5xx / 429 / 纯网络错误（无 status）
          const status = lastErr.context?.status;
          const isTimeout = !!lastErr.context?.timeout;
          const retriable = isTimeout || status === 429 || (status >= 500 && status <= 599) || !status;
          if (!retriable || attempt === attempts - 1) {
            break;
          }
        } finally {
          clearTimeout(timer);
        }
      }

      throw lastErr instanceof Error
        ? lastErr
        : new LLMError(`GLM 调用失败: ${lastErr}`, { operation: 'call_glm' });
    });
  }

  /**
   * 解析模型输出为结构化 Patch
   * 要求模型返回 { operations: [...] }，否则视为畸形输出并丢弃
   */
  _normalizePatch(parsed) {
    if (parsed && Array.isArray(parsed.operations)) {
      return parsed;
    }
    throw new LLMError('Agent 返回非结构化 Patch（缺少 operations）', {
      operation: 'normalize_patch',
      parsed
    });
  }

  async extractIntent(freeText) {
    if (!freeText || typeof freeText !== 'string') {
      throw new ValidationError('freeText 必须是字符串', { freeText });
    }
    const prompt = [
      '你是旅格的旅行意图分析助手。请从用户自由文本中提取「当次旅行取向」（软偏好），以 JSON Patch 格式返回。',
      '只允许修改路径：/intent、/softPreferences、/tempAdjustments、/sessionNotes。',
      '禁止修改 /personaProfile/traits、/lockedTraits、/hardConstraints、/lockedNodes。',
      '不得创建未经验证的 POI。',
      `用户文本：${freeText}`,
      '返回格式：{ "operations": [ { "op": "replace", "path": "/intent/summary", "value": "..." } ] }'
    ].join('\n');

    const content = await this._callGLM(prompt, { maxTokens: 512 });
    const patch = this._normalizePatch(parseJSONContent(content));
    return this._safeReturn(patch, ALLOWED_PATHS.extractIntent, this.dataSource);
  }

  async enhanceExplanation(planResponse) {
    if (!planResponse || typeof planResponse !== 'object') {
      throw new ValidationError('planResponse 必须是对象', { planResponse });
    }
    const prompt = [
      '你是旅格的旅行编辑。请基于本地推荐结果，写出自然、克制的解释，以 JSON Patch 格式返回。',
      '只允许修改路径：/explanations、/highlights、/conversationReply。',
      '禁止修改 /personaProfile/traits、/lockedTraits、/hardConstraints、/lockedNodes。',
      '语气温暖但不煽情，不要过度承诺，不要堆砌景点。',
      `本地结果摘要：${JSON.stringify(planResponse).slice(0, 1500)}`,
      '返回格式：{ "operations": [ { "op": "replace", "path": "/explanations/0/reason", "value": "..." } ] }'
    ].join('\n');

    const content = await this._callGLM(prompt, { maxTokens: 1024 });
    const patch = this._normalizePatch(parseJSONContent(content));
    return this._safeReturn(patch, ALLOWED_PATHS.enhanceExplanation, this.dataSource);
  }

  async adjustInTrip(planId, adjustments) {
    if (!planId) {
      throw new ValidationError('planId 不能为空', { planId });
    }
    const prompt = [
      '你是旅格的旅中调整助手。请根据旅中状态生成受约束的行程调整，以 JSON Patch 格式返回。',
      '只允许修改路径：/selectedPlan/days、/selectedPlan/notes、/uncertainties。',
      '禁止移动锁定节点（/lockedNodes），禁止修改硬约束与长期人格。',
      '不得创建未经验证的 POI；如需替换地点，只能引用已验证 POI。',
      `行程ID：${planId}`,
      `调整指令：${JSON.stringify(adjustments || {})}`,
      '返回格式：{ "operations": [ { "op": "replace", "path": "/selectedPlan/days/0/morning", "value": "..." } ] }'
    ].join('\n');

    const content = await this._callGLM(prompt, { maxTokens: 1024 });
    const patch = this._normalizePatch(parseJSONContent(content));
    return this._safeReturn(patch, ALLOWED_PATHS.adjustInTrip, this.dataSource);
  }

  async summarizeJournal(journalEntries) {
    const entries = Array.isArray(journalEntries) ? journalEntries : [];
    const prompt = [
      '你是旅格的复盘助手。请根据用户手账生成旅后复盘摘要与温和的反思问题，以 JSON Patch 格式返回。',
      '只允许修改路径：/journalSummary、/insights、/reflectionPrompts。',
      '只递问题、不给建议；主语始终是用户；不得根据敏感输入生成身份/心理标签。',
      `手账条目：${JSON.stringify(entries).slice(0, 1500)}`,
      '返回格式：{ "operations": [ { "op": "replace", "path": "/journalSummary", "value": "..." } ] }'
    ].join('\n');

    const content = await this._callGLM(prompt, { maxTokens: 1024 });
    const patch = this._normalizePatch(parseJSONContent(content));
    return this._safeReturn(patch, ALLOWED_PATHS.summarizeJournal, this.dataSource);
  }

  async generateItinerary(params) {
    const {
      cityName = '',
      days = 3,
      budget = 1000,
      interests = [],
      avoid = [],
      mood = '',
      companion = 'solo',
      pois = []
    } = params || {};

    const prompt = [
      '你是一位资深旅行规划师。请根据以下信息，为用户生成一份详细的城市旅行日程规划。',
      '',
      '## 输入信息',
      `- 城市：${cityName}`,
      `- 天数：${days} 天`,
      `- 总预算：约 ${budget} 元`,
      `- 兴趣：${interests.join('、') || '无特定偏好'}`,
      `- 回避：${avoid.join('、') || '无'}`,
      `- 旅行动机：${mood}`,
      `- 同行：${companion}`,
      pois.length > 0
        ? `- 可用 POI 列表（优先从中选择，也可补充你确知存在的同类地点）：\n${JSON.stringify(pois.slice(0, 30), null, 2)}`
        : `- POI 列表：未提供，请根据你对${cityName}的了解，自行推荐真实的景点、餐饮、住宿地点。`,
      '',
      '## 输出规则',
      '1. 严格按以下 JSON 格式输出，不要包含 markdown 代码块标记，不要添加任何额外文字。',
      '2. 每天安排 2-4 个活动，时间合理，避免过度紧凑。',
      '3. POI 名称应使用该地点的正式/常用名称，确保真实存在。',
      '4. 预算分配要现实，包含餐饮、门票、交通、住宿等。',
      '5. 根据兴趣和回避调整推荐内容。',
      '6. 每个活动包含实用建议（tips）。',
      '7. 类型只能是：景点、餐饮、交通、休息 四种之一。',
      '8. 每个活动必须包含 duration（分钟）、location（具体地址）、transportToNext（到下一站怎么走+多久）、highlight（一个亮点/看点）。',
      '9. 每天必须包含 accommodation（推荐住宿区域）和 accommodationBudget（当日住宿预算）。',
      '10. transportToNext 描述从当前活动地点到下一个活动地点的交通方式和预计时间。',
      '',
      '## 输出格式',
      JSON.stringify({
        days: [
          {
            day: 1,
            date: '建议日期描述，如"第一天 · 抵达与初探"',
            theme: '当天主题',
            schedule: [
              {
                time: '09:00-11:30',
                activity: '活动名称',
                poiName: 'POI名称（必须匹配pois列表）',
                type: '景点/餐饮/交通/休息',
                duration: 150,
                location: '具体地址描述',
                budget: 120,
                tips: '实用建议',
                transportToNext: '步行15分钟',
                highlight: '亮点描述',
                lat: 39.9,
                lng: 116.4
              }
            ],
            dayBudget: 350,
            dayTransport: '地铁/公交/步行',
            accommodation: '推荐住宿区域，如鼓楼区附近经济型酒店',
            accommodationBudget: 200
          }
        ],
        totalBudget: 1050,
        transportTips: '整体交通建议',
        budgetBreakdown: { '住宿': 400, '餐饮': 300, '门票': 200, '交通': 150 }
      }, null, 2),
      '',
      '请直接输出纯 JSON，不要包裹在 ```json 代码块中。'
    ].join('\n');

    const savedTimeout = this.timeout;
    this.timeout = 60000;        // 日程生成允许 60 秒
    try {
      const content = await this._callGLM(prompt, { maxTokens: 4096 });
      return parseJSONContent(content);
    } finally {
      this.timeout = savedTimeout;
    }
  }
}

// ===== Mock 实现 =====

/**
 * MockAgentProvider —— 本地启发式生成结果，不依赖网络
 * 用于测试、离线场景与 Agent 不可用时的等价合同验证。
 */
class MockAgentProvider extends AgentProvider {
  constructor(options = {}) {
    super(options);
    this.name = 'mock';
  }

  async extractIntent(freeText) {
    if (!freeText || typeof freeText !== 'string') {
      throw new ValidationError('freeText 必须是字符串', { freeText });
    }
    // 本地启发式：根据关键词推断当次软偏好（绝不修改人格维度）
    const preferences = {};
    if (/累|疲惫|发呆|放空|安静|慢|休息/.test(freeText)) {
      preferences.pace = 'slow';
    }
    if (/热闹|人多|社交|朋友|一起|集市/.test(freeText)) {
      preferences.social = 'high';
    }
    if (/自然|山|海|户外|风景|湖/.test(freeText)) {
      preferences.nature = 'high';
    }
    if (/省钱|便宜|预算|穷游|性价比/.test(freeText)) {
      preferences.budget = 'low';
    }
    if (/小众|冷门|独特|未知/.test(freeText)) {
      preferences.explore = 'high';
    }

    const summary = `从“${freeText.slice(0, 24)}”中识别到当次旅行取向`;
    const patch = {
      operations: [
        { op: 'replace', path: '/intent/summary', value: summary },
        { op: 'replace', path: '/softPreferences', value: preferences }
      ]
    };
    return this._safeReturn(patch, ALLOWED_PATHS.extractIntent, this.dataSource);
  }

  async enhanceExplanation(planResponse) {
    if (!planResponse || typeof planResponse !== 'object') {
      throw new ValidationError('planResponse 必须是对象', { planResponse });
    }
    const explanations = Array.isArray(planResponse.explanations) ? planResponse.explanations : [];
    const operations = explanations.map((exp, i) => {
      const base = exp && exp.reason ? exp.reason : '该目的地与你的当次取向较为契合。';
      return {
        op: 'replace',
        path: `/explanations/${i}/reason`,
        value: `${base}（已由 Agent 润色，语气更自然克制）`
      };
    });
    const patch = {
      operations: operations.length
        ? operations
        : [{ op: 'add', path: '/highlights', value: ['契合当次取向'] }]
    };
    return this._safeReturn(patch, ALLOWED_PATHS.enhanceExplanation, this.dataSource);
  }

  async adjustInTrip(planId, adjustments) {
    if (!planId) {
      throw new ValidationError('planId 不能为空', { planId });
    }
    const ops = [];
    if (adjustments && typeof adjustments === 'object') {
      const day = typeof adjustments.day === 'number' ? adjustments.day : 1;
      const slot = adjustments.slot || 'morning';
      const content = adjustments.content || '根据旅中状态调整后的安排';
      // day 从 1 计数，Patch 路径下标从 0 计数
      const idx = Math.max(0, day - 1);
      ops.push({
        op: 'replace',
        path: `/selectedPlan/days/${idx}/${slot}`,
        value: content
      });
      if (adjustments.note) {
        ops.push({ op: 'add', path: '/selectedPlan/notes', value: adjustments.note });
      }
    }
    const patch = {
      operations: ops.length
        ? ops
        : [{ op: 'add', path: '/uncertainties', value: [] }]
    };
    return this._safeReturn(patch, ALLOWED_PATHS.adjustInTrip, this.dataSource);
  }

  async summarizeJournal(journalEntries) {
    const entries = Array.isArray(journalEntries) ? journalEntries : [];
    const summary = entries.length
      ? `本次旅行共记录 ${entries.length} 条手账，整体情绪偏"${guessMood(entries)}"。`
      : '暂无手账记录，无法生成复盘摘要。';
    const patch = {
      operations: [
        { op: 'replace', path: '/journalSummary', value: summary },
        { op: 'add', path: '/insights', value: [] },
        { op: 'add', path: '/reflectionPrompts', value: ['这次旅行中最让你意外的瞬间是什么？'] }
      ]
    };
    return this._safeReturn(patch, ALLOWED_PATHS.summarizeJournal, this.dataSource);
  }

  async generateItinerary(params) {
    const {
      cityName = '未知城市',
      days = 3,
      budget = 1000,
      interests = [],
      avoid = [],
      mood = '',
      companion = 'solo',
      pois = []
    } = params || {};

    const dayBudget = Math.floor(budget / Math.max(1, days));
    const mockDays = [];
    for (let d = 1; d <= days; d++) {
      const schedule = [];
      const morningPoi = pois[(d - 1) * 2] || { name: cityName + '核心景点', lat: 39.9, lng: 116.4 };
      const afternoonPoi = pois[(d - 1) * 2 + 1] || { name: cityName + '特色街区', lat: 39.85, lng: 116.35 };

      schedule.push({
        time: '09:00-11:30',
        activity: `游览 ${morningPoi.name}`,
        poiName: morningPoi.name,
        type: '景点',
        duration: 150,
        location: cityName + '市中心核心区域',
        budget: Math.floor(dayBudget * 0.25),
        tips: '建议早到避开人流，带好防晒用品。',
        transportToNext: '步行10分钟',
        highlight: morningPoi.name + '最具代表性的核心景观',
        lat: morningPoi.lat || 39.9,
        lng: morningPoi.lng || 116.4
      });
      schedule.push({
        time: '12:00-13:30',
        activity: '当地特色午餐',
        poiName: afternoonPoi.name,
        type: '餐饮',
        duration: 90,
        location: afternoonPoi.name + '附近美食街',
        budget: Math.floor(dayBudget * 0.2),
        tips: '尝试本地招牌菜，避开景区主街溢价餐厅。',
        transportToNext: '步行5分钟',
        highlight: '当地最正宗的风味小吃',
        lat: afternoonPoi.lat || 39.85,
        lng: afternoonPoi.lng || 116.35
      });
      if (d % 2 === 1) {
        schedule.push({
          time: '14:00-17:00',
          activity: `探索 ${afternoonPoi.name}`,
          poiName: afternoonPoi.name,
          type: '景点',
          duration: 180,
          location: cityName + '文化街区',
          budget: Math.floor(dayBudget * 0.2),
          tips: '下午光线适合拍照，注意保管随身物品。',
          transportToNext: '地铁2号线15分钟',
          highlight: '感受当地历史与人文气息',
          lat: afternoonPoi.lat || 39.85,
          lng: afternoonPoi.lng || 116.35
        });
      } else {
        schedule.push({
          time: '14:00-16:00',
          activity: '自由活动 / 咖啡馆休息',
          poiName: '休息',
          type: '休息',
          duration: 120,
          location: cityName + '文艺街区咖啡馆',
          budget: Math.floor(dayBudget * 0.1),
          tips: '选一家有露台的咖啡馆，观察当地生活节奏。',
          transportToNext: '步行10分钟',
          highlight: '体验当地人的慢生活',
          lat: morningPoi.lat || 39.9,
          lng: morningPoi.lng || 116.4
        });
      }
      schedule.push({
        time: '18:00-20:00',
        activity: '晚餐与夜景',
        poiName: afternoonPoi.name,
        type: '餐饮',
        duration: 120,
        location: afternoonPoi.name + '夜景观景区附近',
        budget: Math.floor(dayBudget * 0.25),
        tips: '晚餐后可在附近散步，感受城市夜晚氛围。',
        transportToNext: null,
        highlight: '城市夜景与美食的双重享受',
        lat: afternoonPoi.lat || 39.85,
        lng: afternoonPoi.lng || 116.35
      });

      mockDays.push({
        day: d,
        date: `第 ${d} 天`,
        theme: d === 1 ? '初识' + cityName : (d === days ? '告别与返程' : '深度探索'),
        schedule,
        dayBudget,
        dayTransport: d % 2 === 1 ? '地铁' : '公交/步行',
        accommodation: cityName + (d === 1 ? '市中心经济型酒店' : '特色民宿区'),
        accommodationBudget: Math.floor(budget * 0.35 / Math.max(1, days))
      });
    }

    return {
      days: mockDays,
      totalBudget: budget,
      transportTips: '市内交通以地铁为主，建议购买一日通票；远郊景点可使用网约车或旅游专线。',
      budgetBreakdown: {
        '住宿': Math.floor(budget * 0.35),
        '餐饮': Math.floor(budget * 0.3),
        '门票': Math.floor(budget * 0.2),
        '交通': Math.floor(budget * 0.15)
      }
    };
  }
}

// ===== 工具函数 =====

/**
 * 解析 LLM 文本输出为 JSON（容错：直接解析 / 代码块 / 花括号提取）
 */
function parseJSONContent(content) {
  if (typeof content !== 'string') {
    throw new LLMError('Agent 返回非字符串内容', { operation: 'parse_agent_json', content });
  }
  // 1) 直接解析
  try {
    return JSON.parse(content);
  } catch (_) {
    // 继续尝试
  }
  // 2) 提取 ```json ... ``` 代码块
  const codeBlock = content.match(/```json\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try {
      return JSON.parse(codeBlock[1]);
    } catch (_) {
      // 继续尝试
    }
  }
  // 3) 提取首个花括号块
  const brace = content.match(/\{[\s\S]*\}/);
  if (brace) {
    try {
      return JSON.parse(brace[0]);
    } catch (_) {
      // 继续抛错
    }
  }
  throw new LLMError(
    `无法解析 Agent 返回为 JSON: ${content.slice(0, 200)}`,
    { operation: 'parse_agent_json', content: content.slice(0, 500) }
  );
}

/**
 * 根据手账条目粗略判断整体情绪
 */
function guessMood(entries) {
  const text = entries.map(e => (e && (e.text || e.content)) || '').join('');
  if (/开心|满足|惊喜|感动|值得|美好/.test(text)) return '满足';
  if (/累|疲惫|失望|遗憾|无聊/.test(text)) return '疲惫';
  return '平静';
}

// ===== 工厂 =====

/**
 * 获取 Agent Provider 实例
 * @param {Object} options - 透传给具体实现的选项
 * @param {string} options.provider - 显式指定 provider，覆盖环境变量
 * @returns {AgentProvider|null} provider 实例；Agent 关闭时返回 null
 */
function getAgentProvider(options = {}) {
  const choice = (options.provider || process.env.AGENT_PROVIDER || '').toLowerCase();
  if (choice === 'deepseek') {
    return new DeepSeekAgentProvider(options);
  }
  if (choice === 'glm') {
    return new GLMAgentProvider(options);
  }
  if (choice === 'mock') {
    return new MockAgentProvider(options);
  }
  // 默认：Agent 关闭（核心流程不依赖 Agent）
  return null;
}

/**
 * 无感降级执行器
 * - provider 为 null（Agent 关闭）时直接返回降级结果
 * - provider 调用抛错时同样返回降级结果（总纲 11.2 无感切换）
 * @param {AgentProvider|null} provider
 * @param {string} methodName - 能力名：extractIntent / enhanceExplanation / adjustInTrip / summarizeJournal
 * @param {Array} args - 传给能力的参数数组
 * @param {Function|any} fallback - 降级值或降级函数
 * @returns {Promise<any>}
 */
async function runWithAgent(provider, methodName, args, fallback) {
  if (!provider || typeof provider[methodName] !== 'function') {
    return typeof fallback === 'function' ? fallback() : fallback;
  }
  try {
    const params = Array.isArray(args) ? args : [args];
    return await provider[methodName](...params);
  } catch (err) {
    // Agent 失败：记录并无感降级
    console.warn(`[Agent] ${methodName} 失败，执行无感降级: ${err.message}`);
    return typeof fallback === 'function' ? fallback() : fallback;
  }
}

module.exports = {
  AgentProvider,
  DeepSeekAgentProvider,
  GLMAgentProvider,
  MockAgentProvider,
  getAgentProvider,
  runWithAgent,
  parseJSONContent,
  ALLOWED_PATHS
};
