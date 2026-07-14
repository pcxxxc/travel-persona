/**
 * 旅格 Travel Persona · 错误分类体系
 *
 * 设计原则：
 * 1. 每个错误有明确的 type，便于调用方判断如何处理
 * 2. 每个错误包含 context，便于调试
 * 3. 区分「用户输入错误」(400) 和 「系统错误」(500)
 * 4. 所有错误最终可被序列化为日志
 * 5. 可恢复错误不中断核心推荐流程
 */

/**
 * 错误类型枚举
 */
const ErrorType = {
  VALIDATION: 'VALIDATION',   // 输入验证失败
  DATA: 'DATA',               // 数据问题
  LLM: 'LLM',                 // LLM 调用失败
  ALGORITHM: 'ALGORITHM',     // 算法内部错误
  NETWORK: 'NETWORK',         // 网络错误
  UNKNOWN: 'UNKNOWN'          // 未知错误
};

/**
 * 基础错误类
 */
class PersonaError extends Error {
  /**
   * @param {string} message - 错误描述
   * @param {Object} options
   * @param {string} options.type - 错误类型 (ErrorType)
   * @param {number} options.code - HTTP 状态码建议
   * @param {Object} options.context - 调试上下文
   * @param {boolean} options.recoverable - 是否可降级恢复
   */
  constructor(message, { type = ErrorType.UNKNOWN, code = 500, context = {}, recoverable = false } = {}) {
    super(message);
    this.name = 'PersonaError';
    this.type = type;
    this.code = code;
    this.context = context;
    this.recoverable = recoverable;
    this.timestamp = new Date().toISOString();

    // 保持堆栈跟踪
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PersonaError);
    }
  }

  /**
   * 序列化为日志对象
   */
  toLog() {
    return {
      type: this.type,
      code: this.code,
      message: this.message,
      context: this.context,
      recoverable: this.recoverable,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }

  /**
   * 序列化为 API 响应
   */
  toResponse() {
    return {
      error: {
        type: this.type,
        message: this.message,
        code: this.code,
        ...(process.env.NODE_ENV === 'development' ? { context: this.context } : {})
      }
    };
  }
}

/**
 * 输入验证错误
 * 场景：非法答案值、缺失必填项、类型错误
 * 处理：返回基准分 + 记录警告
 */
class ValidationError extends PersonaError {
  constructor(message, context = {}) {
    super(message, {
      type: ErrorType.VALIDATION,
      code: 400,
      context,
      recoverable: true
    });
    this.name = 'ValidationError';
  }
}

/**
 * 数据错误
 * 场景：城市缺失维度、POI 不完整、数据版本不匹配
 * 处理：跳过不完整数据 / 用默认值补齐
 */
class DataError extends PersonaError {
  constructor(message, context = {}) {
    super(message, {
      type: ErrorType.DATA,
      code: 500,
      context,
      recoverable: true
    });
    this.name = 'DataError';
  }
}

/**
 * LLM 调用错误
 * 场景：API 超时、格式错误、内容过滤、配额耗尽
 * 处理：熔断器 + 模板降级
 */
class LLMError extends PersonaError {
  constructor(message, context = {}) {
    super(message, {
      type: ErrorType.LLM,
      code: 503,
      context,
      recoverable: true
    });
    this.name = 'LLMError';
  }
}

/**
 * 算法内部错误
 * 场景：计算溢出、维度不匹配、意外的空值
 * 处理：强制裁剪 / 跳过 / 返回默认值
 */
class AlgorithmError extends PersonaError {
  constructor(message, context = {}) {
    super(message, {
      type: ErrorType.ALGORITHM,
      code: 500,
      context,
      recoverable: true
    });
    this.name = 'AlgorithmError';
  }
}

/**
 * 网络错误
 * 场景：天气 API 超时、DNS 失败
 * 处理：跳过可选步骤
 */
class NetworkError extends PersonaError {
  constructor(message, context = {}) {
    super(message, {
      type: ErrorType.NETWORK,
      code: 503,
      context,
      recoverable: true
    });
    this.name = 'NetworkError';
  }
}

/**
 * 安全地执行函数，捕获并包装错误
 * @param {Function} fn - 要执行的函数
 * @param {Object} options
 * @param {string} options.operation - 操作名称（用于日志）
 * @param {Function} options.fallback - 降级函数
 * @param {PersonaError} options.ErrorClass - 错误类（默认 PersonaError）
 * @returns {any} 函数返回值或降级值
 */
function safeExecute(fn, { operation = 'unknown', fallback = null, ErrorClass = PersonaError } = {}) {
  try {
    return fn();
  } catch (err) {
    // 如果已经是 PersonaError，直接抛出
    if (err instanceof PersonaError) {
      throw err;
    }

    // 包装为 PersonaError
    const wrapped = new ErrorClass(err.message, {
      context: {
        operation,
        originalError: err.message,
        stack: err.stack
      }
    });

    // 如果有降级函数，执行降级
    if (fallback) {
      console.warn(`[${operation}] 错误已捕获，执行降级:`, err.message);
      return fallback();
    }

    throw wrapped;
  }
}

/**
 * 异步版本的安全执行
 */
async function safeExecuteAsync(fn, { operation = 'unknown', fallback = null, ErrorClass = PersonaError } = {}) {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PersonaError) {
      throw err;
    }

    const wrapped = new ErrorClass(err.message, {
      context: {
        operation,
        originalError: err.message,
        stack: err.stack
      }
    });

    if (fallback) {
      console.warn(`[${operation}] 异步错误已捕获，执行降级:`, err.message);
      return fallback();
    }

    throw wrapped;
  }
}

module.exports = {
  ErrorType,
  PersonaError,
  ValidationError,
  DataError,
  LLMError,
  AlgorithmError,
  NetworkError,
  safeExecute,
  safeExecuteAsync
};
