/**
 * 旅格 Travel Persona · 输入验证工具
 *
 * 所有验证函数：
 * - 通过时返回 true
 * - 失败时抛出 ValidationError（带详细上下文）
 */

const { ValidationError } = require('./errors');

// 六维名称（顺序固定）
const DIMENSIONS = ['freedom', 'social', 'explore', 'nature', 'pace', 'budget'];

// 基准分
const BASE_SCORE = 0.5;

// 允许的增量档位
const ALLOWED_INCREMENTS = [-0.5, -0.3, -0.1, 0, 0.1, 0.3, 0.5];

/**
 * 验证答案值是否在映射表允许范围内
 * @param {string} key - 答案键名（如 'emotionGoal'）
 * @param {string} value - 答案值（如 '放空'）
 * @param {Object} mappingTable - 映射表（如 EMOTION_GOAL_MAP）
 * @returns {boolean} 验证通过返回 true
 * @throws {ValidationError} 验证失败时抛出
 */
function validateAnswerValue(key, value, mappingTable) {
  if (!mappingTable) {
    throw new ValidationError(
      `映射表不存在: ${key}`,
      { key, value, reason: 'mapping_table_missing' }
    );
  }

  const allowedValues = Object.keys(mappingTable);

  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `非法答案值: "${value}" 不在 ${key} 的允许范围内。允许值: [${allowedValues.join(', ')}]`,
      {
        key,
        value,
        allowedValues,
        reason: 'value_not_in_mapping'
      }
    );
  }

  return true;
}

/**
 * 验证 PersonaScore 的维度完整性
 * @param {Object} score - PersonaScore 对象
 * @param {Object} options
 * @param {boolean} options.allowPartial - 是否允许部分维度缺失（默认 false）
 * @returns {Object} { valid: boolean, missing: string[], filled: string[] }
 * @throws {ValidationError} 当 allowPartial=false 且维度缺失时抛出
 */
function validatePersonaScore(score, { allowPartial = false } = {}) {
  if (!score || typeof score !== 'object') {
    throw new ValidationError(
      'PersonaScore 必须是对象',
      { score, reason: 'not_an_object' }
    );
  }

  const missing = [];
  const filled = [];

  for (const dim of DIMENSIONS) {
    if (typeof score[dim] !== 'number') {
      missing.push(dim);
    } else {
      filled.push(dim);
    }
  }

  if (missing.length > 0 && !allowPartial) {
    throw new ValidationError(
      `PersonaScore 缺少维度: [${missing.join(', ')}]`,
      {
        missing,
        filled,
        score,
        reason: 'missing_dimensions'
      }
    );
  }

  return { valid: missing.length === 0, missing, filled };
}

/**
 * 验证单个维度值是否在 [0, 1] 范围内
 * @param {string} dim - 维度名
 * @param {number} value - 维度值
 * @returns {boolean} 验证通过返回 true
 * @throws {ValidationError} 验证失败时抛出
 */
function validateDimensionValue(dim, value) {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new ValidationError(
      `维度 ${dim} 的值必须是数字，收到: ${value}`,
      { dim, value, reason: 'not_a_number' }
    );
  }

  if (value < 0 || value > 1) {
    throw new ValidationError(
      `维度 ${dim} 的值 ${value} 超出 [0, 1] 范围`,
      { dim, value, reason: 'out_of_range' }
    );
  }

  return true;
}

/**
 * 验证整个 PersonaScore 的所有维度值
 * @param {Object} score - PersonaScore 对象
 * @param {Object} options
 * @param {boolean} options.autoFix - 是否自动裁剪到 [0,1]（默认 false）
 * @returns {Object} { valid: boolean, violations: Array, fixed: Object|null }
 */
function validatePersonaScoreValues(score, { autoFix = false } = {}) {
  const violations = [];
  let fixed = null;

  if (autoFix) {
    fixed = {};
  }

  for (const dim of DIMENSIONS) {
    const value = score[dim];

    if (typeof value !== 'number' || isNaN(value)) {
      violations.push({ dim, value, reason: 'not_a_number' });
      if (autoFix) fixed[dim] = BASE_SCORE;
      continue;
    }

    if (value < 0 || value > 1) {
      violations.push({ dim, value, reason: 'out_of_range' });
      if (autoFix) {
        fixed[dim] = Math.max(0, Math.min(1, value));
      }
      continue;
    }

    if (autoFix) {
      fixed[dim] = value;
    }
  }

  return {
    valid: violations.length === 0,
    violations,
    fixed
  };
}

/**
 * 验证城市数据完整性
 * @param {Object} city - 城市对象
 * @returns {Object} { valid: boolean, missing: string[] }
 * @throws {ValidationError} 当城市 ID 或名称缺失时抛出
 */
function validateCityData(city) {
  if (!city || typeof city !== 'object') {
    throw new ValidationError(
      '城市数据必须是对象',
      { city, reason: 'not_an_object' }
    );
  }

  if (!city.id || !city.name) {
    throw new ValidationError(
      `城市数据缺少 id 或 name: ${JSON.stringify(city)}`,
      { city, reason: 'missing_id_or_name' }
    );
  }

  const missing = [];

  // 检查 dimensions
  if (!city.dimensions || typeof city.dimensions !== 'object') {
    missing.push('dimensions');
  } else {
    for (const dim of DIMENSIONS) {
      if (typeof city.dimensions[dim] !== 'number') {
        missing.push(`dimensions.${dim}`);
      }
    }
  }

  // 检查 emotionTags
  if (!Array.isArray(city.emotionTags) || city.emotionTags.length === 0) {
    missing.push('emotionTags');
  }

  return {
    valid: missing.length === 0,
    missing,
    cityId: city.id
  };
}

/**
 * 验证城市列表
 * @param {Array} cities - 城市列表
 * @returns {Object} { valid: boolean, validCities: Array, invalidCities: Array }
 */
function validateCityList(cities) {
  if (!Array.isArray(cities)) {
    throw new ValidationError(
      '城市列表必须是数组',
      { cities, reason: 'not_an_array' }
    );
  }

  const validCities = [];
  const invalidCities = [];

  for (const city of cities) {
    try {
      const result = validateCityData(city);
      if (result.valid) {
        validCities.push(city);
      } else {
        invalidCities.push({ city: city.id || 'unknown', missing: result.missing });
      }
    } catch (err) {
      invalidCities.push({ city: city?.id || 'unknown', error: err.message });
    }
  }

  return {
    valid: invalidCities.length === 0,
    validCities,
    invalidCities,
    total: cities.length
  };
}

/**
 * 验证问卷答案对象
 * @param {Object} answers - 问卷答案
 * @param {Object} mappingTables - 所有映射表
 * @returns {Object} { valid: boolean, invalid: Array, valid: Array }
 */
function validateAnswers(answers, mappingTables) {
  if (!answers || typeof answers !== 'object') {
    throw new ValidationError(
      '问卷答案必须是对象',
      { answers, reason: 'not_an_object' }
    );
  }

  const invalid = [];
  const valid = [];

  for (const [key, value] of Object.entries(answers)) {
    const table = mappingTables[key];

    if (!table) {
      // 未知的答案键，记录但不报错（可能是新版本添加的问题）
      invalid.push({ key, value, reason: 'unknown_key' });
      continue;
    }

    try {
      validateAnswerValue(key, value, table);
      valid.push({ key, value });
    } catch (err) {
      invalid.push({ key, value, reason: err.context?.reason, message: err.message });
    }
  }

  return {
    valid: invalid.length === 0,
    validAnswers: valid,
    invalidAnswers: invalid
  };
}

module.exports = {
  DIMENSIONS,
  BASE_SCORE,
  ALLOWED_INCREMENTS,
  validateAnswerValue,
  validatePersonaScore,
  validateDimensionValue,
  validatePersonaScoreValues,
  validateCityData,
  validateCityList,
  validateAnswers
};
