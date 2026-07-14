/**
 * 旅格 Travel Persona · 熔断器实现
 *
 * 设计模式：Circuit Breaker
 * 用途：防止 LLM API 故障级联，保护系统稳定性
 *
 * 状态机：
 * CLOSED（正常） → 失败计数 ≥ threshold → OPEN（熔断）
 * OPEN → 等待 timeout → HALF_OPEN（试探）
 * HALF_OPEN → 成功 → CLOSED
 * HALF_OPEN → 失败 → OPEN
 */

const { LLMError } = require('../utils/errors');

const State = {
  CLOSED: 'CLOSED',       // 正常状态，请求直接通过
  OPEN: 'OPEN',           // 熔断状态，请求直接失败
  HALF_OPEN: 'HALF_OPEN'  // 试探状态，允许一个请求通过测试
};

class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {number} options.failureThreshold - 触发熔断的连续失败次数（默认 5）
   * @param {number} options.timeout - 熔断后等待时间（毫秒，默认 60000 = 60秒）
   * @param {number} options.halfOpenMaxCalls - HALF_OPEN 状态允许的最大请求数（默认 1）
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.timeout = options.timeout || 60000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 1;

    this.state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;

    // 统计信息
    this.stats = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastStateChange: null
    };
  }

  /**
   * 执行被保护的函数
   * @param {Function} fn - 要执行的异步函数
   * @param {Object} context - 上下文信息（用于日志）
   * @returns {Promise<any>} 函数返回值
   */
  async execute(fn, context = {}) {
    this.stats.totalCalls++;

    // 检查当前状态
    if (this.state === State.OPEN) {
      // 检查是否已过超时时间
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this._transitionTo(State.HALF_OPEN);
        this.halfOpenCalls = 0;
      } else {
        // 仍在熔断期，直接失败
        throw new LLMError(
          `熔断器已打开，请等待 ${Math.ceil((this.timeout - (Date.now() - this.lastFailureTime)) / 1000)} 秒`,
          {
            operation: 'circuit_breaker',
            state: this.state,
            context
          }
        );
      }
    }

    if (this.state === State.HALF_OPEN) {
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        throw new LLMError(
          '熔断器处于试探状态，请求过多',
          {
            operation: 'circuit_breaker',
            state: this.state,
            halfOpenCalls: this.halfOpenCalls,
            context
          }
        );
      }
      this.halfOpenCalls++;
    }

    // 执行函数
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      this._onFailure();
      throw err;
    }
  }

  /**
   * 成功处理
   */
  _onSuccess() {
    this.failureCount = 0;
    this.successCount++;
    this.stats.totalSuccesses++;

    if (this.state === State.HALF_OPEN) {
      // 试探成功，关闭熔断器
      this._transitionTo(State.CLOSED);
    }
  }

  /**
   * 失败处理
   */
  _onFailure() {
    this.failureCount++;
    this.stats.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === State.HALF_OPEN) {
      // 试探失败，重新打开
      this._transitionTo(State.OPEN);
    } else if (this.state === State.CLOSED && this.failureCount >= this.failureThreshold) {
      // 达到失败阈值，打开熔断器
      this._transitionTo(State.OPEN);
    }
  }

  /**
   * 状态转换
   */
  _transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.stats.lastStateChange = new Date().toISOString();

    // 重置计数器
    if (newState === State.CLOSED) {
      this.failureCount = 0;
      this.halfOpenCalls = 0;
    }

    console.log(`[CircuitBreaker] ${oldState} → ${newState}`);
  }

  /**
   * 获取当前状态信息
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      stats: this.stats
    };
  }

  /**
   * 手动重置（用于测试或运维）
   */
  reset() {
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
    console.log('[CircuitBreaker] 手动重置为 CLOSED');
  }
}

module.exports = { CircuitBreaker, State };
