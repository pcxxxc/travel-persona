/**
 * 旅格 Travel Persona · 数据接入统一接口
 *
 * 设计原则：
 * 1. 所有外部数据接入通过此接口，不直接操作数据文件
 * 2. 支持数据版本管理，方便后续热更新
 * 3. 前端通过 API 获取数据，后端通过此接口读取
 * 4. 所有写操作自动校验数据完整性
 *
 * 使用方式：
 *   const di = require('./dataInterface');
 *   const cities = di.getCities({ format: 'full' });
 *   const result = di.addCity({ id: 'newcity', name: '新城', ... });
 */

const CITIES = require('./cityDatabase').CITIES;
const { MAPPING_TABLES, SOURCE_WEIGHTS } = require('./dimensionMapping');
const { DataError, ValidationError } = require('../utils/errors');

// 当前数据版本
const DATA_VERSION = '2.0.0';

// 写操作互斥锁（防止并发修改 CITIES 数组的竞态条件）
let writeLock = false;
const writeQueue = [];

function acquireWriteLock() {
  return new Promise(function(resolve) {
    if (!writeLock) {
      writeLock = true;
      resolve();
    } else {
      writeQueue.push(resolve);
    }
  });
}

function releaseWriteLock() {
  if (writeQueue.length > 0) {
    var next = writeQueue.shift();
    next();
  } else {
    writeLock = false;
  }
}

// 六维名称
const DIMENSIONS = ['freedom', 'social', 'explore', 'nature', 'pace', 'budget'];

// ===== 内部辅助函数 =====

/**
 * 校验城市数据完整性
 */
function validateCityData(city) {
  const errors = [];

  if (!city.id || typeof city.id !== 'string') {
    errors.push('city.id 必须是非空字符串');
  }
  if (!city.name || typeof city.name !== 'string') {
    errors.push('city.name 必须是非空字符串');
  }
  if (!city.dimensions || typeof city.dimensions !== 'object') {
    errors.push('city.dimensions 必须是对象');
  } else {
    for (const dim of DIMENSIONS) {
      const val = city.dimensions[dim];
      if (typeof val !== 'number' || val < 0 || val > 1) {
        errors.push(`city.dimensions.${dim} 必须是 [0, 1] 之间的数值，当前: ${val}`);
      }
    }
  }
  if (!Array.isArray(city.emotionTags)) {
    errors.push('city.emotionTags 必须是数组');
  }
  if (!Array.isArray(city.pois) || city.pois.length === 0) {
    errors.push('city.pois 必须是非空数组');
  } else {
    city.pois.forEach((poi, i) => {
      if (!poi.name) errors.push(`pois[${i}].name 缺失`);
      if (!poi.zone) errors.push(`pois[${i}].zone 缺失`);
      if (!poi.type) errors.push(`pois[${i}].type 缺失`);
      if (!poi.openHours) errors.push(`pois[${i}].openHours 缺失`);
      if (typeof poi.indoor !== 'boolean') errors.push(`pois[${i}].indoor 必须是布尔值`);
    });
  }

  return errors;
}

/**
 * 校验映射条目
 */
function validateMappingEntry(tableName, key, delta) {
  const errors = [];

  if (!tableName || typeof tableName !== 'string') {
    errors.push('tableName 必须是非空字符串');
  }
  if (!key || typeof key !== 'string') {
    errors.push('key 必须是非空字符串');
  }
  if (!delta || typeof delta !== 'object') {
    errors.push('delta 必须是对象');
  } else {
    for (const [dim, val] of Object.entries(delta)) {
      if (!DIMENSIONS.includes(dim)) {
        errors.push(`delta.${dim} 不是有效的维度名，有效值: ${DIMENSIONS.join(', ')}`);
      }
      if (typeof val !== 'number' || val < -0.5 || val > 0.5) {
        errors.push(`delta.${dim} 必须是 [-0.5, 0.5] 之间的数值，当前: ${val}`);
      }
    }
  }

  return errors;
}

// ===== 公开接口 =====

const DataInterface = {
  /**
   * 获取当前数据版本号
   * @returns {string} 版本号
   */
  getVersion() {
    return DATA_VERSION;
  },

  // ===== 城市数据 =====

  /**
   * 获取城市列表
   * @param {Object} options
   * @param {string} options.format - 'full' | 'summary' | 'vector-only'
   *   - full: 完整城市数据（含 POI）
   *   - summary: 摘要（不含 POI，含维度 + 标签）
   *   - vector-only: 仅六维向量（用于匹配计算）
   * @returns {Array} 城市列表
   */
  getCities(options = {}) {
    const { format = 'full' } = options;

    switch (format) {
      case 'vector-only':
        return CITIES.map(c => ({
          id: c.id,
          name: c.name,
          dimensions: { ...c.dimensions }
        }));

      case 'summary':
        return CITIES.map(c => ({
          id: c.id,
          name: c.name,
          dimensions: { ...c.dimensions },
          emotionTags: [...c.emotionTags],
          poiCount: c.pois.length
        }));

      case 'full':
      default:
        // 深拷贝，避免外部修改，包含所有深度剖析字段
        return CITIES.map(c => ({
          id: c.id,
          name: c.name,
          dimensions: { ...c.dimensions },
          emotionTags: [...c.emotionTags],
          images: c.images ? {
            cover: c.images.cover,
            gallery: [...c.images.gallery]
          } : null,
          mapCenter: c.mapCenter ? [...c.mapCenter] : null,
          profile: c.profile ? {
            overview: c.profile.overview,
            bestSeasons: [...c.profile.bestSeasons],
            avoidSeasons: [...c.profile.avoidSeasons],
            suggestDays: c.profile.suggestDays,
            idealFor: c.profile.idealFor,
            vibe: c.profile.vibe
          } : null,
          climate: c.climate ? {
            type: c.climate.type,
            features: c.climate.features,
            avgTemp: { ...c.climate.avgTemp },
            rainfall: c.climate.rainfall,
            clothing: c.climate.clothing,
            tips: c.climate.tips
          } : null,
          food: c.food ? {
            signature: c.food.signature,
            mustTry: c.food.mustTry.map(m => ({ ...m })),
            diningScene: c.food.diningScene,
            budget: c.food.budget
          } : null,
          culture: c.culture ? {
            ethnicity: c.culture.ethnicity,
            history: c.culture.history,
            customs: c.culture.customs,
            taboos: c.culture.taboos,
            festivals: c.culture.festivals
          } : null,
          practical: c.practical ? {
            transport: { ...c.practical.transport },
            accommodation: { ...c.practical.accommodation },
            safety: c.practical.safety,
            health: c.practical.health,
            money: c.practical.money
          } : null,
          pois: c.pois.map(p => ({ ...p }))
        }));
    }
  },

  /**
   * 根据 ID 获取单个城市
   * @param {string} cityId - 城市 ID
   * @returns {Object|null} 城市对象或 null
   */
  getCityById(cityId) {
    const city = CITIES.find(c => c.id === cityId);
    if (!city) return null;

    return {
      id: city.id,
      name: city.name,
      dimensions: { ...city.dimensions },
      emotionTags: [...city.emotionTags],
      images: city.images ? {
        cover: city.images.cover,
        gallery: [...city.images.gallery]
      } : null,
      mapCenter: city.mapCenter ? [...city.mapCenter] : null,
      profile: city.profile ? {
        overview: city.profile.overview,
        bestSeasons: [...city.profile.bestSeasons],
        avoidSeasons: [...city.profile.avoidSeasons],
        suggestDays: city.profile.suggestDays,
        idealFor: city.profile.idealFor,
        vibe: city.profile.vibe
      } : null,
      climate: city.climate ? {
        type: city.climate.type,
        features: city.climate.features,
        avgTemp: { ...city.climate.avgTemp },
        rainfall: city.climate.rainfall,
        clothing: city.climate.clothing,
        tips: city.climate.tips
      } : null,
      food: city.food ? {
        signature: city.food.signature,
        mustTry: city.food.mustTry.map(m => ({ ...m })),
        diningScene: city.food.diningScene,
        budget: city.food.budget
      } : null,
      culture: city.culture ? {
        ethnicity: city.culture.ethnicity,
        history: city.culture.history,
        customs: city.culture.customs,
        taboos: city.culture.taboos,
        festivals: city.culture.festivals
      } : null,
      practical: city.practical ? {
        transport: { ...city.practical.transport },
        accommodation: { ...city.practical.accommodation },
        safety: city.practical.safety,
        health: city.practical.health,
        money: city.practical.money
      } : null,
      pois: city.pois.map(p => ({ ...p }))
    };
  },

  /**
   * 按维度筛选城市
   * @param {Object} filters - 筛选条件 { nature: 0.7, pace: 0.3 }
   * @param {number} options.tolerance - 容差（默认 0.2）
   * @returns {Array} 匹配的城市列表
   */
  searchCities(filters, options = {}) {
    const { tolerance = 0.2 } = options;

    return CITIES.filter(city => {
      return Object.entries(filters).every(([dim, target]) => {
        // 支持按名称搜索（中文名或 ID）
        if (dim === 'name') {
          return city.name.includes(target) || city.id === target;
        }
        if (!DIMENSIONS.includes(dim)) return true;
        const cityVal = city.dimensions[dim];
        if (cityVal === undefined) return true;
        return Math.abs(cityVal - target) <= tolerance;
      });
    }).map(c => ({
      id: c.id,
      name: c.name,
      dimensions: { ...c.dimensions },
      emotionTags: [...c.emotionTags],
      poiCount: c.pois.length
    }));
  },

  /**
   * 添加新城市（运行时添加，不影响持久化数据文件）
   * @param {Object} cityData - 城市数据
   * @returns {Object} { success, errors }
   */
  addCity(cityData) {
    const errors = validateCityData(cityData);
    if (errors.length > 0) {
      return { success: false, errors };
    }

    // 检查重复 ID
    if (CITIES.find(c => c.id === cityData.id)) {
      return { success: false, errors: [`城市 ID "${cityData.id}" 已存在`] };
    }

    CITIES.push({
      id: cityData.id,
      name: cityData.name,
      dimensions: { ...cityData.dimensions },
      emotionTags: [...cityData.emotionTags],
      pois: cityData.pois.map(p => ({ ...p }))
    });

    return { success: true, errors: [] };
  },

  /**
   * 更新城市六维向量
   * @param {string} cityId - 城市 ID
   * @param {Object} dimensions - 新的六维向量（部分更新）
   * @returns {Object} { success, errors }
   */
  updateCityDimensions(cityId, dimensions) {
    const city = CITIES.find(c => c.id === cityId);
    if (!city) {
      return { success: false, errors: [`城市 "${cityId}" 不存在`] };
    }

    const errors = [];
    for (const [dim, val] of Object.entries(dimensions)) {
      if (!DIMENSIONS.includes(dim)) {
        errors.push(`${dim} 不是有效维度`);
        continue;
      }
      if (typeof val !== 'number' || val < 0 || val > 1) {
        errors.push(`${dim} 的值 ${val} 不在 [0,1] 范围内`);
        continue;
      }
      city.dimensions[dim] = val;
    }

    return { success: errors.length === 0, errors };
  },

  /**
   * 获取城市总数
   * @returns {number}
   */
  getCityCount() {
    return CITIES.length;
  },

  // ===== 维度映射 =====

  /**
   * 获取映射表
   * @param {string} tableName - 表名：'emotionGoal' | 'door' | 'duration' | 'budget' | 'nomad' | 'preference' | 'dislike' | 'rhythm' | 'risk'
   * @returns {Object|null} 映射表或 null
   */
  getMappingTable(tableName) {
    const table = MAPPING_TABLES[tableName];
    if (!table) return null;

    // 深拷贝
    return Object.fromEntries(
      Object.entries(table).map(([key, val]) => [key, { ...val }])
    );
  },

  /**
   * 获取所有映射表名称
   * @returns {string[]}
   */
  getMappingTableNames() {
    return Object.keys(MAPPING_TABLES);
  },

  /**
   * 更新映射表条目
   * @param {string} tableName - 表名
   * @param {string} key - 条目键
   * @param {Object} delta - 维度增量
   * @returns {Object} { success, errors }
   */
  updateMappingEntry(tableName, key, delta) {
    const errors = validateMappingEntry(tableName, key, delta);
    if (errors.length > 0) {
      return { success: false, errors };
    }

    const table = MAPPING_TABLES[tableName];
    if (!table) {
      return { success: false, errors: [`映射表 "${tableName}" 不存在`] };
    }

    table[key] = { ...delta };
    return { success: true, errors: [] };
  },

  /**
   * 添加映射条目
   * @param {string} tableName - 表名
   * @param {string} key - 条目键
   * @param {Object} delta - 维度增量
   * @returns {Object} { success, errors }
   */
  addMappingEntry(tableName, key, delta) {
    const errors = validateMappingEntry(tableName, key, delta);
    if (errors.length > 0) {
      return { success: false, errors };
    }

    const table = MAPPING_TABLES[tableName];
    if (!table) {
      return { success: false, errors: [`映射表 "${tableName}" 不存在`] };
    }

    if (table[key]) {
      return { success: false, errors: [`映射条目 "${key}" 已存在，请使用 updateMappingEntry`] };
    }

    table[key] = { ...delta };
    return { success: true, errors: [] };
  },

  // ===== 权重配置 =====

  /**
   * 获取当前权重配置
   * @returns {Object} 权重对象
   */
  getWeights() {
    return { ...SOURCE_WEIGHTS };
  },

  /**
   * 更新权重配置
   * @param {Object} newWeights - 新权重（部分更新）
   * @returns {Object} { success, errors }
   */
  updateWeights(newWeights) {
    const errors = [];

    for (const [source, weight] of Object.entries(newWeights)) {
      if (!(source in SOURCE_WEIGHTS)) {
        errors.push(`来源 "${source}" 不存在，有效值: ${Object.keys(SOURCE_WEIGHTS).join(', ')}`);
        continue;
      }
      if (typeof weight !== 'number' || weight < 0 || weight > 2) {
        errors.push(`权重 ${weight} 不在 [0, 2] 范围内`);
        continue;
      }
      SOURCE_WEIGHTS[source] = weight;
    }

    return { success: errors.length === 0, errors };
  },

  // ===== 数据校验 =====

  /**
   * 校验所有数据完整性
   * @returns {Object} { valid, errors: [{ type, message }] }
   */
  validateAll() {
    const errors = [];

    // 校验所有城市
    CITIES.forEach(city => {
      const cityErrors = validateCityData(city);
      cityErrors.forEach(msg => errors.push({ type: 'city', cityId: city.id, message: msg }));
    });

    // 校验映射表
    Object.entries(MAPPING_TABLES).forEach(([tableName, table]) => {
      if (Object.keys(table).length === 0) {
        errors.push({ type: 'mapping', tableName, message: '映射表为空' });
      }
    });

    // 校验六维权重（从 scoring.js 的 WEIGHTS）
    try {
      const { WEIGHTS } = require('../core/scoring');
      const weightSum = Object.values(WEIGHTS).reduce((s, w) => s + w, 0);
      if (Math.abs(weightSum - 1) > 0.001) {
        errors.push({ type: 'weights', message: `六维权重和不为 1（当前: ${weightSum}）` });
      }
    } catch (err) {
      errors.push({ type: 'weights', message: '无法加载权重配置' });
    }

    return {
      valid: errors.length === 0,
      errors,
      summary: {
        totalCities: CITIES.length,
        totalMappingTables: Object.keys(MAPPING_TABLES).length,
        totalMappingEntries: Object.values(MAPPING_TABLES).reduce((s, t) => s + Object.keys(t).length, 0)
      }
    };
  },

  // ===== 数据快照 =====

  /**
   * 导出完整数据快照
   * @returns {Object} { version, timestamp, cities, mappings, weights }
   */
  exportSnapshot() {
    return {
      version: DATA_VERSION,
      timestamp: new Date().toISOString(),
      cities: DataInterface.getCities({ format: 'full' }),
      mappings: Object.fromEntries(
        Object.entries(MAPPING_TABLES).map(([name, table]) => [
          name,
          Object.fromEntries(Object.entries(table).map(([k, v]) => [k, { ...v }]))
        ])
      ),
      weights: { ...SOURCE_WEIGHTS },
      dimensions: [...DIMENSIONS],
      stats: {
        cityCount: CITIES.length,
        mappingTableCount: Object.keys(MAPPING_TABLES).length,
        mappingEntryCount: Object.values(MAPPING_TABLES).reduce((s, t) => s + Object.keys(t).length, 0)
      }
    };
  },

  // ===== 维度常量 =====

  /**
   * 获取维度列表
   * @returns {string[]}
   */
  getDimensions() {
    return [...DIMENSIONS];
  }
};

module.exports = DataInterface;