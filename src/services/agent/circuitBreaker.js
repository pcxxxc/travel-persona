/**
 * 旅格 Travel Persona · Agent 熔断器（Phase 5，总纲 10.3）
 *
 * 用途：Agent 供应商（如 GLM）连续失败时快速熔断，避免故障级联，
 *       保护本地确定性规划器不受影响，实现「无感故障切换」。
 *
 * 状态机：
 *   closed（正常） —— 连续失败 ≥ failureThreshold ——> open（熔断）
 *   open —— 等待 recoveryTimeout ——> half-open（试探）
 *   half-open —— 成功 ——> closed
 *   half-open —— 失败 ——> open
 *
 * 默认参数（总纲 10.3）：
 *   failureThreshold = 5     连续 5 次失败后熔断
 *   recoveryTimeout  = 30000 30 秒后进入 half-open
 *   halfOpenMaxCalls = 1     half-open 仅允许 1 次试探
 */

const { LLMError } = require('../../utils/errors');

/**
 * 熔断器状态枚举
 */
const State = {
  CLOSED: 'closed',       // 正常状态，请求直接通过
  OPEN: 'open',           // 熔断状态，请求直接失败
  HALF_OPEN: 'half-open'  // 试探状态，允许一个请求通过测试
};

class CircuitBreaker {
  /**
   * @param {Object} options
   * @param {number} options.failureThreshold - 触发熔断的连续失败次数（默认 5）
   * @param {number} options.recoveryTimeout  - 熔断后等待时间（毫秒，默认 30000）
   * @param {number} options.halfOpenMaxCalls - half-open 允许的最大请求数（默认 1）
   */
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 30000;
    this.halfOpenMaxCalls = options.halfOpenMaxCalls || 1;

    this.state = State.CLOSED;
    this.failureCount = 0;       // 连续失败计数
    this.lastFailureTime = null; // 最近一次失败时间戳
    this.halfOpenCalls = 0;      // half-open 状态下已放行的试探次数

    // 运行统计
    this.stats = {
      totalCalls: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastStateChange: null
    };
  }

  /**
   * 通过熔断器执行异步函数
   * - closed：直接执行
   * - open：若已过恢复时间则转 half-open，否则直接拒绝
   * - half-open：仅放行 halfOpenMaxCalls 次试探
   * @param {Function} fn - 要执行的异步函数
   * @returns {Promise<any>} 函数返回值
   */
  async execute(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('CircuitBreaker.execute 需要一个函数参数');
    }
    this.stats.totalCalls++;

    // 熔断中：判断是否已到恢复时间
    if (this.state === State.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.recoveryTimeout) {
        // 恢复时间到，进入试探状态
        this._transitionTo(State.HALF_OPEN);
      } else {
        // 仍在熔断期，直接拒绝（不执行 fn）
        const waitSec = Math.ceil((this.recoveryTimeout - elapsed) / 1000);
        throw new LLMError(
          `Agent 熔断器已打开，请等待约 ${waitSec} 秒后重试`,
          { operation: 'circuit_breaker', state: this.state, waitSeconds: waitSec }
        );
      }
    }

    // half-open：限制试探并发
    if (this.state === State.HALF_OPEN) {
      if (this.halfOpenCalls >= this.halfOpenMaxCalls) {
        throw new LLMError(
          'Agent 熔断器处于半开状态，试探请求已达上限',
          { operation: 'circuit_breaker', state: this.state, halfOpenCalls: this.halfOpenCalls }
        );
      }
      this.halfOpenCalls++;
    }

    // 执行被保护函数
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
   * 成功处理：清零失败计数；half-open 成功则关闭熔断器
   */
  _onSuccess() {
    this.failureCount = 0;
    this.stats.totalSuccesses++;
    if (this.state === State.HALF_OPEN) {
      this._transitionTo(State.CLOSED);
    }
  }

  /**
   * 失败处理：累加失败计数；half-open 失败则重新打开，closed 达阈值则打开
   */
  _onFailure() {
    this.failureCount++;
    this.stats.totalFailures++;
    this.lastFailureTime = Date.now();

    if (this.state === State.HALF_OPEN) {
      // 试探失败，重新熔断
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

    if (newState === State.CLOSED) {
      this.failureCount = 0;
      this.halfOpenCalls = 0;
    } else if (newState === State.HALF_OPEN) {
      this.halfOpenCalls = 0;
    }

    console.log(`[AgentCircuitBreaker] ${oldState} -> ${newState}`);
  }

  /**
   * 获取当前状态信息
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      halfOpenCalls: this.halfOpenCalls,
      stats: this.stats
    };
  }

  /**
   * 手动重置（用于测试或运维）
   */
  reset() {
    this.state = State.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.halfOpenCalls = 0;
  }
}

// ===== 命名熔断器单例注册表 =====

const breakers = new Map();

/**
 * 获取命名熔断器实例（单例）
 * 同名多次调用返回同一实例，便于按能力/供应商隔离熔断状态。
 * @param {string} name - 熔断器名称，如 'glm-agent'、'glm-extract'
 * @param {Object} options - 仅在首次创建时生效
 * @returns {CircuitBreaker}
 */
function getBreaker(name, options) {
  if (!breakers.has(name)) {
    breakers.set(name, new CircuitBreaker(options));
  }
  return breakers.get(name);
}

/**
 * 重置所有命名熔断器（主要用于测试）
 */
function resetAllBreakers() {
  breakers.clear();
}

module.exports = {
  CircuitBreaker,
  State,
  getBreaker,
  resetAllBreakers
};
