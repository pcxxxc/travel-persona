/**
 * 旅格 Travel Persona · LLM 服务层
 *
 * 职责：
 * 1. 统一封装 Claude API 调用
 * 2. 管理 API Key（环境变量）
 * 3. 熔断器保护（连续失败 5 次后熔断 60 秒）
 * 4. 降级策略（熔断期间返回模板结果）
 * 5. 记录每次调用的 latency、token 用量、成功/失败
 *
 * 环境变量：
 * - ANTHROPIC_API_KEY: Claude API Key
 * - ANTHROPIC_MODEL_EXTRACT: 维度提取模型（默认 claude-3-haiku-20240307）
 * - ANTHROPIC_MODEL_REASON: 推荐理由模型（默认 claude-3-sonnet-20240229）
 */

const { LLMError, ValidationError } = require('../utils/errors');
const { CircuitBreaker } = require('./circuitBreaker');
const {
  EXTRACT_PROMPT_TEMPLATE,
  REASON_PROMPT_TEMPLATE,
  ITINERARY_PROMPT_TEMPLATE,
  fillTemplate
} = require('./promptTemplates');

// 模型配置
const DEFAULT_MODELS = {
  extract: 'claude-3-haiku-20240307',   // 轻量、快速、便宜
  reason: 'claude-3-sonnet-20240229',   // 质量优先
  itinerary: 'claude-3-sonnet-20240229' // 质量优先
};

// 熔断器实例（按功能分离，避免一个功能故障影响其他功能）
const breakers = {
  extract: new CircuitBreaker({ failureThreshold: 5, timeout: 60000 }),
  reason: new CircuitBreaker({ failureThreshold: 5, timeout: 60000 }),
  itinerary: new CircuitBreaker({ failureThreshold: 5, timeout: 60000 })
};

// 调用统计
const stats = {
  totalCalls: 0,
  totalFailures: 0,
  totalTokens: 0,
  averageLatency: 0
};

/**
 * 获取 API Key
 */
function getApiKey() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new LLMError('未设置 ANTHROPIC_API_KEY 环境变量', {
      operation: 'get_api_key'
    });
  }
  return key;
}

/**
 * 调用 Claude API
 *
 * @param {Object} params
 * @param {string} params.model - 模型名称
 * @param {string} params.prompt - 完整 Prompt
 * @param {number} params.maxTokens - 最大 token 数
 * @param {boolean} params.stream - 是否流式输出
 * @returns {Promise<Object>} API 响应
 */
async function callClaudeAPI({ model, prompt, maxTokens = 1024, stream = false }) {
  const startTime = Date.now();
  const apiKey = getApiKey();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
        stream
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new LLMError(
        `Claude API 错误: ${response.status} - ${errorText}`,
        {
          operation: 'call_claude_api',
          status: response.status,
          response: errorText
        }
      );
    }

    // 更新统计
    const latency = Date.now() - startTime;
    stats.totalCalls++;
    stats.averageLatency = (stats.averageLatency * (stats.totalCalls - 1) + latency) / stats.totalCalls;

    if (stream) {
      return { stream: response.body, latency };
    }

    const data = await response.json();

    // 估算 token 用量（粗略估计：中文字符 ≈ 1.5 tokens）
    const content = data.content?.[0]?.text || '';
    const estimatedTokens = Math.ceil((prompt.length + content.length) * 0.5);
    stats.totalTokens += estimatedTokens;

    return {
      content,
      usage: data.usage || { input_tokens: 0, output_tokens: 0 },
      latency,
      model: data.model
    };

  } catch (err) {
    stats.totalFailures++;

    if (err instanceof LLMError) {
      throw err;
    }

    throw new LLMError(
      `Claude API 调用失败: ${err.message}`,
      {
        operation: 'call_claude_api',
        originalError: err.message
      }
    );
  }
}

/**
 * 解析 JSON 响应（带容错）
 *
 * @param {string} content - API 返回的文本
 * @returns {Object} 解析后的 JSON
 */
function parseJSONResponse(content) {
  try {
    // 尝试直接解析
    return JSON.parse(content);
  } catch (err) {
    // 尝试提取 JSON 块（有时模型会包裹在 markdown 代码块中）
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (err2) {
        // 忽略
      }
    }

    // 尝试提取花括号内的内容
    const braceMatch = content.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch (err3) {
        // 忽略
      }
    }

    throw new LLMError(
      `无法解析 LLM 响应为 JSON: ${content.substring(0, 200)}`,
      {
        operation: 'parse_json',
        content: content.substring(0, 500)
      }
    );
  }
}

// ========== 业务接口 ==========

/**
 * 维度提取
 *
 * @param {Object} params
 * @param {string} params.freeText - 用户自由文本
 * @param {Object} params.currentScore - 当前 PersonaScore
 * @returns {Promise<Object>} { delta, rationale, confidence }
 */
async function extractDimensions({ freeText, currentScore = {} }) {
  if (!freeText || typeof freeText !== 'string') {
    throw new ValidationError('freeText 必须是字符串', { freeText });
  }

  const prompt = fillTemplate(EXTRACT_PROMPT_TEMPLATE, {
    freeText,
    currentScore: JSON.stringify(currentScore)
  });

  return breakers.extract.execute(async () => {
    const result = await callClaudeAPI({
      model: process.env.ANTHROPIC_MODEL_EXTRACT || DEFAULT_MODELS.extract,
      prompt,
      maxTokens: 512
    });

    return parseJSONResponse(result.content);
  }, { operation: 'extract_dimensions', freeText });
}

/**
 * 生成推荐理由
 *
 * @param {Object} params
 * @param {string} params.personaLabel - 人格标签
 * @param {string} params.userQuote - 用户原话
 * @param {string} params.cityName - 城市名称
 * @param {Array} params.cityTags - 城市标签
 * @param {Object} params.bestMatch - 最匹配维度信息
 * @param {Object} params.worstMatch - 最不匹配维度信息
 * @returns {Promise<Object>} { reason, honestNote, highlight }
 */
async function generateReason({
  personaLabel = '',
  userQuote = '',
  cityName = '',
  cityTags = [],
  bestMatch = {},
  worstMatch = {}
}) {
  const prompt = fillTemplate(REASON_PROMPT_TEMPLATE, {
    personaLabel,
    userQuote,
    cityName,
    cityTags: cityTags.join(', '),
    bestMatchDim: bestMatch.dimension || '',
    userValue: bestMatch.userValue || '',
    cityValue: bestMatch.cityValue || '',
    worstMatchDim: worstMatch.dimension || '',
    userValue2: worstMatch.userValue || '',
    cityValue2: worstMatch.cityValue || ''
  });

  return breakers.reason.execute(async () => {
    const result = await callClaudeAPI({
      model: process.env.ANTHROPIC_MODEL_REASON || DEFAULT_MODELS.reason,
      prompt,
      maxTokens: 512
    });

    return parseJSONResponse(result.content);
  }, { operation: 'generate_reason', cityName });
}

/**
 * 润色行程
 *
 * @param {Object} params
 * @param {string} params.cityName - 城市名称
 * @param {number} params.days - 天数
 * @param {string} params.personaLabel - 人格标签
 * @param {Object} params.skeleton - 行程骨架
 * @param {string} params.adjustInstruction - 调整指令
 * @returns {Promise<Object>} Itinerary 对象
 */
async function polishItinerary({
  cityName = '',
  days = 3,
  personaLabel = '',
  skeleton = {},
  adjustInstruction = ''
}) {
  const prompt = fillTemplate(ITINERARY_PROMPT_TEMPLATE, {
    cityName,
    days: String(days),
    personaLabel,
    skeleton: JSON.stringify(skeleton, null, 2),
    adjustInstruction: adjustInstruction || '无'
  });

  return breakers.itinerary.execute(async () => {
    const result = await callClaudeAPI({
      model: process.env.ANTHROPIC_MODEL_ITINERARY || DEFAULT_MODELS.itinerary,
      prompt,
      maxTokens: 2048
    });

    return parseJSONResponse(result.content);
  }, { operation: 'polish_itinerary', cityName });
}

/**
 * 获取 LLM 服务统计信息
 */
function getStats() {
  return {
    ...stats,
    breakers: {
      extract: breakers.extract.getState(),
      reason: breakers.reason.getState(),
      itinerary: breakers.itinerary.getState()
    }
  };
}

/**
 * 重置熔断器（用于测试）
 */
function resetBreakers() {
  breakers.extract.reset();
  breakers.reason.reset();
  breakers.itinerary.reset();
}

module.exports = {
  // 核心函数
  extractDimensions,
  generateReason,
  polishItinerary,

  // 工具函数
  callClaudeAPI,
  parseJSONResponse,

  // 统计
  getStats,
  resetBreakers
};
