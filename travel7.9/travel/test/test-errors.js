/**
 * 旅格 Travel Persona · 错误处理测试
 *
 * 验证错误分类体系的正确性和降级行为
 */

const {
  PersonaError,
  ValidationError,
  DataError,
  LLMError,
  safeExecute,
  safeExecuteAsync
} = require('../src/utils/errors');

const {
  validateAnswerValue,
  validatePersonaScore,
  validatePersonaScoreValues,
  validateCityData
} = require('../src/utils/validation');

const { EMOTION_GOAL_MAP } = require('../src/data/dimensionMapping');

console.log('=====================================');
console.log('错误处理测试');
console.log('=====================================\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passCount++;
  } catch (err) {
    console.log(`✗ ${name}: ${err.message}`);
    failCount++;
  }
}

function shouldThrow(name, fn, ExpectedError) {
  try {
    fn();
    console.log(`✗ ${name}: 应该抛出错误但没有`);
    failCount++;
  } catch (err) {
    if (err instanceof ExpectedError) {
      console.log(`✓ ${name}: 正确抛出 ${ExpectedError.name}`);
      passCount++;
    } else {
      console.log(`✗ ${name}: 抛出了错误但不是 ${ExpectedError.name}: ${err.message}`);
      failCount++;
    }
  }
}

// ===== 测试 1: 错误类层级 =====
console.log('【测试组 1】错误类层级');
console.log('-------------------------------------');

shouldThrow('ValidationError 是 PersonaError 子类', () => {
  throw new ValidationError('测试');
}, PersonaError);

shouldThrow('DataError 是 PersonaError 子类', () => {
  throw new DataError('测试');
}, PersonaError);

shouldThrow('LLMError 是 PersonaError 子类', () => {
  throw new LLMError('测试');
}, PersonaError);

test('ValidationError 有正确的 type', () => {
  const err = new ValidationError('测试');
  if (err.type !== 'VALIDATION') throw new Error('type 不对');
});

test('ValidationError 是可恢复的', () => {
  const err = new ValidationError('测试');
  if (!err.recoverable) throw new Error('应该可恢复');
});

// ===== 测试 2: 输入验证 =====
console.log('\n【测试组 2】输入验证');
console.log('-------------------------------------');

shouldThrow('非法答案值抛出 ValidationError', () => {
  validateAnswerValue('emotionGoal', '不存在的值', EMOTION_GOAL_MAP);
}, ValidationError);

shouldThrow('PersonaScore 缺少维度抛出 ValidationError', () => {
  validatePersonaScore({ freedom: 0.5, social: 0.5 }); // 缺少 4 个维度
}, ValidationError);

test('PersonaScore 完整通过验证', () => {
  const result = validatePersonaScore({
    freedom: 0.5, social: 0.5, explore: 0.5,
    nature: 0.5, pace: 0.5, budget: 0.5
  });
  if (!result.valid) throw new Error('应该通过');
});

test('PersonaScore 数值范围验证（非法值）', () => {
  const result = validatePersonaScoreValues({
    freedom: 0.5, social: 1.5, explore: -0.2,
    nature: 0.5, pace: 0.5, budget: 0.5
  });
  if (result.valid) throw new Error('不应该通过');
  if (result.violations.length !== 2) throw new Error('应该检测到 2 个违规');
});

test('PersonaScore 数值范围验证（autoFix）', () => {
  const result = validatePersonaScoreValues({
    freedom: 0.5, social: 1.5, explore: -0.2,
    nature: 0.5, pace: 0.5, budget: 0.5
  }, { autoFix: true });
  if (!result.fixed) throw new Error('应该有 fixed');
  if (result.fixed.social !== 1.0) throw new Error('social 应该被裁剪为 1.0');
  if (result.fixed.explore !== 0.0) throw new Error('explore 应该被裁剪为 0.0');
});

shouldThrow('城市数据缺少 id 抛出 ValidationError', () => {
  validateCityData({ name: '测试' });
}, ValidationError);

// ===== 测试 3: safeExecute =====
console.log('\n【测试组 3】safeExecute');
console.log('-------------------------------------');

test('safeExecute 正常执行', () => {
  const result = safeExecute(() => 42, { operation: 'test' });
  if (result !== 42) throw new Error('返回值不对');
});

test('safeExecute 降级执行', () => {
  const result = safeExecute(
    () => { throw new Error('原始错误'); },
    { operation: 'test', fallback: () => '降级值' }
  );
  if (result !== '降级值') throw new Error('降级值不对');
});

shouldThrow('safeExecute 无降级时抛出', () => {
  safeExecute(() => { throw new Error('原始错误'); }, { operation: 'test' });
}, PersonaError);

// ===== 测试 4: 错误序列化 =====
console.log('\n【测试组 4】错误序列化');
console.log('-------------------------------------');

test('toLog 包含必要字段', () => {
  const err = new ValidationError('测试', { key: 'value' });
  const log = err.toLog();
  if (!log.type || !log.message || !log.context || !log.timestamp) {
    throw new Error('缺少必要字段');
  }
});

test('toResponse 不包含 context（生产环境）', () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';

  const err = new ValidationError('测试', { key: 'value' });
  const response = err.toResponse();

  process.env.NODE_ENV = originalEnv;

  if (response.error.context) throw new Error('生产环境不应包含 context');
});

// ===== 测试 5: 端到端错误场景 =====
console.log('\n【测试组 5】端到端错误场景');
console.log('-------------------------------------');

const { computePersonaScore } = require('../src/data/dimensionMapping');

shouldThrow('computePersonaScore 接收非法答案值', () => {
  computePersonaScore({ emotionGoal: '不存在的值' });
}, ValidationError);

test('computePersonaScore 忽略未知键', () => {
  const result = computePersonaScore({ unknownKey: 'value' });
  if (result.score.nature !== 0.5) throw new Error('应该返回基准分');
});

const { recommendCities } = require('../src/core/scoring');

shouldThrow('recommendCities 接收非法 PersonaScore', () => {
  recommendCities({ freedom: 999 }); // 超出范围
}, ValidationError);

shouldThrow('recommendCities 接收不完整 PersonaScore', () => {
  recommendCities({ freedom: 0.5, social: 0.5 }); // 缺少维度
}, ValidationError);

// ===== 总结 =====
console.log('\n=====================================');
console.log(`测试结果: ${passCount} 通过, ${failCount} 失败`);
console.log('=====================================');

if (failCount > 0) {
  process.exit(1);
}
