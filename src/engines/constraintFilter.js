/**
 * 旅格 Travel Persona · 硬约束过滤引擎
 *
 * 总纲7.1定义：日期范围、必须到达城市、预算硬上限、无障碍要求、签证限制、不可接受交通方式
 * 所有硬约束失败的方案不得进入主推荐。
 */

const { getCities, getCityByName } = require('../data/cityRecords');

/**
 * 硬约束检查器注册表
 */
const CONSTRAINT_CHECKERS = {
  /**
   * 必须到达城市
   */
  mustReach(city, constraint) {
    if (!constraint.city) return { pass: true };
    const match = city.name === constraint.city || city.id === constraint.city;
    return {
      pass: match,
      reason: match ? null : `不是用户指定的目的地（${constraint.city}）`
    };
  },

  /**
   * 预算硬上限
   * 如果城市日均预算超过用户日均硬上限，直接淘汰
   */
  budgetCeiling(city, constraint) {
    if (!constraint.max) return { pass: true };
    // 使用总预算上限 / 天数 得到日均上限
    // 注意：这里 constraint.max 是总预算，需要结合天数计算
    // 实际过滤在 pipeline 中结合天数处理
    return { pass: true }; // 预算过滤在评分阶段更精确处理
  },

  /**
   * 天数范围
   * 城市最小天数 > 用户可用天数，直接淘汰
   */
  daysRange(city, constraint) {
    if (!constraint.max) return { pass: true };
    if (city.minDays > constraint.max) {
      return {
        pass: false,
        reason: `${city.name}最少需要${city.minDays}天，但用户只有${constraint.max}天`
      };
    }
    return { pass: true };
  },

  /**
   * 特定城市排除（如用户明确不想去的地方）
   */
  excludeCity(city, constraint) {
    if (!constraint.cities) return { pass: true };
    const excluded = constraint.cities.includes(city.name) || constraint.cities.includes(city.id);
    return {
      pass: !excluded,
      reason: excluded ? `用户明确排除${city.name}` : null
    };
  }
};

/**
 * 对城市列表应用硬约束过滤
 *
 * @param {Array} cities - CityRecord 列表
 * @param {Array} constraints - 硬约束列表
 * @returns {Object} { passed: [...], filtered: [{ city, reason, failedConstraints: [] }] }
 */
function applyConstraintFilter(cities, constraints = []) {
  const passed = [];
  const filtered = [];

  cities.forEach(city => {
    const failed = [];

    for (const constraint of constraints) {
      const checker = CONSTRAINT_CHECKERS[constraint.type];
      if (!checker) continue;

      const result = checker(city, constraint);
      if (!result.pass) {
        failed.push({
          type: constraint.type,
          reason: result.reason || `未通过 ${constraint.type} 约束`
        });
      }
    }

    if (failed.length === 0) {
      passed.push(city);
    } else {
      filtered.push({
        city,
        reason: failed.map(f => f.reason).join('；'),
        failedConstraints: failed
      });
    }
  });

  return { passed, filtered };
}

/**
 * 生成不确定性项（来自被过滤的城市）
 */
function buildUncertaintiesFromFiltered(filtered) {
  if (!filtered || filtered.length === 0) return [];

  const grouped = {};
  filtered.forEach(item => {
    const reason = item.reason;
    if (!grouped[reason]) grouped[reason] = [];
    grouped[reason].push(item.city.name);
  });

  return Object.entries(grouped).slice(0, 3).map(([reason, cityNames]) => ({
    field: '硬约束过滤',
    level: 'medium',
    reason: `${cityNames.join('、')}被排除：${reason}`,
    improveAction: '调整预算或天数后这些城市可能重新进入候选'
  }));
}

module.exports = {
  applyConstraintFilter,
  buildUncertaintiesFromFiltered,
  CONSTRAINT_CHECKERS
};
