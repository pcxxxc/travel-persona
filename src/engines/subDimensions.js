/**
 * 旅格 Travel Persona · 子维度增强模块
 *
 * 将 16 个主维度拆解为子维度，使推荐系统具备更细粒度的可解释性与匹配能力。
 *
 * 主维度列表（与 personaEngine.TRAIT_KEYS 对齐）：
 *   restoration, nature, culture, food, pace, social, budget, aesthetics,
 *   comfort, novelty, transit, lowCrowd, authenticity, weatherFlex,
 *   bookingEase, workation
 *
 * 本模块提供：
 *   1. SUB_DIMENSIONS            —— 子维度定义常量
 *   2. getSubDimensions(traitKey) —— 取指定主维度的子维度定义
 *   3. computeSubDimensionScores  —— 推导单个主维度的子维度分值
 *   4. enrichWithSubDimensions    —— 为城市生成完整子维度树
 *   5. flattenSubDimensions       —— 将子维度树扁平化为点分键
 *   6. computeDimensionalDepth    —— 评估每个主维度的数据深度
 *
 * 数据来源标注（source）：
 *   'poi-derived'         —— 由城市 POI 类型/数量推导
 *   'intelligence-derived'—— 由城市情报分（intelligence）推导
 *   'riskflag-derived'    —— 由城市风险标记（riskFlags）推导
 *   'default'             —— 无直接数据，以主维度值为基准的默认推导
 */

'use strict';

// ============ 通用工具 ============

/**
 * 将数值限制在 [min, max] 区间
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * 保留指定小数位（默认 3 位）
 * @param {number} value
 * @param {number} [digits=3]
 * @returns {number}
 */
function round(value, digits = 3) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/**
 * 16 个主维度键（与 personaEngine.TRAIT_KEYS 保持一致）
 */
const TRAIT_KEYS = [
  'restoration', 'nature', 'culture', 'food', 'pace', 'social',
  'budget', 'aesthetics', 'comfort', 'novelty', 'transit',
  'lowCrowd', 'authenticity', 'weatherFlex', 'bookingEase', 'workation'
];

// ============ 1. SUB_DIMENSIONS 定义 ============

/**
 * 子维度定义常量
 *
 * 结构：{ [traitKey]: { [subKey]: { key, label, description } } }
 * 每个主维度拆解为 2-3 个子维度。
 */
const SUB_DIMENSIONS = {
  // --- 恢复 ---
  restoration: {
    deepRest: {
      key: 'deepRest',
      label: '深度恢复（睡眠/放空）',
      description: '安静的住宿环境、低刺激空间，支持睡眠与彻底放空'
    },
    activeRest: {
      key: 'activeRest',
      label: '轻度活动恢复（散步/温泉）',
      description: '可通过散步、温泉、骑行等轻度活动实现的身体恢复'
    },
    sensoryRest: {
      key: 'sensoryRest',
      label: '感官恢复（安静/自然声）',
      description: '自然环境声、低噪音、低视觉刺激带来的感官放松'
    }
  },

  // --- 自然 ---
  nature: {
    landscape: {
      key: 'landscape',
      label: '山川地貌',
      description: '山地、峡谷、高原等陆地地貌景观的丰富度'
    },
    waterBody: {
      key: 'waterBody',
      label: '水域景观',
      description: '湖泊、河流、海岸等水体景观的可达性与品质'
    },
    biodiversity: {
      key: 'biodiversity',
      label: '生物多样性',
      description: '动植物资源、生态保护区的丰富程度'
    }
  },

  // --- 文化 ---
  culture: {
    historical: {
      key: 'historical',
      label: '历史遗迹',
      description: '古迹、遗址、历史街区等历史文化遗产密度'
    },
    folkCustom: {
      key: 'folkCustom',
      label: '民俗风情',
      description: '本地民俗、非遗、传统节庆等活态文化'
    },
    contemporary: {
      key: 'contemporary',
      label: '当代文化',
      description: '当代艺术、设计、独立书店等现代文化场景'
    }
  },

  // --- 美食 ---
  food: {
    localCuisine: {
      key: 'localCuisine',
      label: '本地特色菜',
      description: '具备地方识别度的正餐菜系与代表餐厅'
    },
    streetFood: {
      key: 'streetFood',
      label: '街头小吃',
      description: '夜市、街边摊、市井小吃的密度与品质'
    },
    fineDining: {
      key: 'fineDining',
      label: '精致餐饮',
      description: '高端餐厅、主厨店、融合菜的可用性'
    }
  },

  // --- 节奏 ---
  pace: {
    daytime: {
      key: 'daytime',
      label: '日间节奏',
      description: '日间活动的密集度与可调度空间'
    },
    evening: {
      key: 'evening',
      label: '夜间节奏',
      description: '夜间场景（夜市、夜景、酒吧）的丰富度'
    },
    transition: {
      key: 'transition',
      label: '转场节奏',
      description: '城际/区域内移动的耗时与切换成本'
    }
  },

  // --- 社交 ---
  social: {
    localInteraction: {
      key: 'localInteraction',
      label: '与本地人互动',
      description: '与本地居民自然接触的机会与氛围'
    },
    travelerCommunity: {
      key: 'travelerCommunity',
      label: '旅行者社群',
      description: '旅行者聚集、交流的场所与社群活跃度'
    },
    solitude: {
      key: 'solitude',
      label: '独处空间',
      description: '可独处、不被打扰的空间可用性'
    }
  },

  // --- 预算 ---
  budget: {
    accommodation: {
      key: 'accommodation',
      label: '住宿成本',
      description: '住宿均价相对消费力的友好度（值越高越友好/越便宜）'
    },
    dining: {
      key: 'dining',
      label: '餐饮成本',
      description: '餐饮均价相对消费力的友好度'
    },
    activities: {
      key: 'activities',
      label: '活动成本',
      description: '门票、体验、交通等活动开销的友好度'
    }
  },

  // --- 美学 ---
  aesthetics: {
    visual: {
      key: 'visual',
      label: '视觉美学',
      description: '建筑、街景、自然光影的视觉品质'
    },
    auditory: {
      key: 'auditory',
      label: '听觉美学',
      description: '声景品质：自然声、市井声、安静度'
    },
    tactile: {
      key: 'tactile',
      label: '触觉/氛围',
      description: '触感、温度、整体氛围等非视觉感官体验'
    }
  },

  // --- 舒适 ---
  comfort: {
    accommodation: {
      key: 'accommodation',
      label: '住宿品质',
      description: '住宿硬件、床品、隔音等品质水平'
    },
    infrastructure: {
      key: 'infrastructure',
      label: '基础设施',
      description: '道路、卫生、公共设施的完善程度'
    },
    serviceLevel: {
      key: 'serviceLevel',
      label: '服务水平',
      description: '服务业专业度、外语支持、服务态度'
    }
  },

  // --- 新奇 ---
  novelty: {
    discovery: {
      key: 'discovery',
      label: '新发现度',
      description: '主流攻略之外、尚待被发现的目的地内容'
    },
    surprise: {
      key: 'surprise',
      label: '意外惊喜',
      description: '计划外惊喜体验的概率（偶遇、节庆、限时）'
    },
    trendsetting: {
      key: 'trendsetting',
      label: '前沿趋势',
      description: '新兴生活方式、独立品牌、潮流文化的浓度'
    }
  },

  // --- 交通 ---
  transit: {
    intercity: {
      key: 'intercity',
      label: '城际交通',
      description: '高铁、航班、长途等城际可达性'
    },
    intraCity: {
      key: 'intraCity',
      label: '市内交通',
      description: '地铁、公交、网约车等市内出行便利度'
    },
    lastMile: {
      key: 'lastMile',
      label: '最后一公里',
      description: '从交通节点到 POI 的步行/接驳便利度'
    }
  },

  // --- 低密度 ---
  lowCrowd: {
    touristDensity: {
      key: 'touristDensity',
      label: '游客密度',
      description: '景区游客密集度（值越高越不拥挤）'
    },
    localDensity: {
      key: 'localDensity',
      label: '本地人密度',
      description: '本地日常生活场所的拥挤度（值越高越不拥挤）'
    },
    queuingTime: {
      key: 'queuingTime',
      label: '排队时间',
      description: '热门 POI 排队等待的轻松度（值越高越不需要排队）'
    }
  },

  // --- 真实性 ---
  authenticity: {
    uncommercialized: {
      key: 'uncommercialized',
      label: '非商业化程度',
      description: '未被旅游商业过度改造的原貌保留度'
    },
    localLife: {
      key: 'localLife',
      label: '本地生活融入',
      description: '可观察、可参与的本地日常生活的真实度'
    },
    culturalPreservation: {
      key: 'culturalPreservation',
      label: '文化保存度',
      description: '传统建筑、语言、手工艺等文化的保存状况'
    }
  },

  // --- 天气容错 ---
  weatherFlex: {
    indoorBackup: {
      key: 'indoorBackup',
      label: '室内备选',
      description: '雨天/高温可替换的室内 POI 储备'
    },
    weatherAdaptability: {
      key: 'weatherAdaptability',
      label: '天气适应性',
      description: '户外活动对天气的耐受与调整能力'
    },
    seasonalStability: {
      key: 'seasonalStability',
      label: '季节稳定性',
      description: '全年体验的稳定程度（淡旺季差异）'
    }
  },

  // --- 预订难度 ---
  bookingEase: {
    accommodationAvail: {
      key: 'accommodationAvail',
      label: '住宿可订性',
      description: '热门时段住宿的可得性与价格稳定性'
    },
    ticketAvail: {
      key: 'ticketAvail',
      label: '门票可订性',
      description: '景区/博物馆门票的预约难度'
    },
    transportAvail: {
      key: 'transportAvail',
      label: '交通可订性',
      description: '高铁/机票的余票充足度'
    }
  },

  // --- 数字游民 ---
  workation: {
    internetQuality: {
      key: 'internetQuality',
      label: '网络质量',
      description: '公共与住宿网络的速度与稳定性'
    },
    workspaceAvail: {
      key: 'workspaceAvail',
      label: '工作空间',
      description: '咖啡馆、共享办公等可工作场所的密度'
    },
    powerAccess: {
      key: 'powerAccess',
      label: '电力供应',
      description: '公共场所插座/充电的可用性'
    }
  }
};

// ============ POI 类型 → 子维度映射 ============

/**
 * 将城市 POI 的中文 type 映射到子维度及其贡献方向。
 *
 * 映射规则：每个 POI 类型对其相关子维度有正向（+）或负向（-）贡献。
 * 贡献强度通过同类型 POI 数量归一化后体现。
 *
 * 数据来源：public-site/travel-persona/assets/data.js 中实际使用的 POI 类型
 * （文化/街区/民俗/博物馆/生活/艺术/自然/古镇/建筑/园林/城市/夜景/海边/餐饮/商业/交通）
 */
const POI_TYPE_TO_SUBDIM = {
  // 文化类
  '文化':     [{ trait: 'culture', sub: 'historical', dir: 1 }, { trait: 'culture', sub: 'contemporary', dir: 0.4 }],
  '民俗':     [{ trait: 'culture', sub: 'folkCustom', dir: 1 }, { trait: 'authenticity', sub: 'localLife', dir: 1 }, { trait: 'authenticity', sub: 'culturalPreservation', dir: 0.6 }],
  '博物馆':   [{ trait: 'culture', sub: 'historical', dir: 0.8 }, { trait: 'weatherFlex', sub: 'indoorBackup', dir: 1 }, { trait: 'comfort', sub: 'infrastructure', dir: 0.4 }],
  '古镇':     [{ trait: 'culture', sub: 'historical', dir: 0.8 }, { trait: 'authenticity', sub: 'culturalPreservation', dir: 1 }, { trait: 'aesthetics', sub: 'visual', dir: 0.7 }, { trait: 'authenticity', sub: 'uncommercialized', dir: -0.3 }],

  // 生活/街区
  '生活':     [{ trait: 'authenticity', sub: 'localLife', dir: 1 }, { trait: 'social', sub: 'localInteraction', dir: 1 }, { trait: 'restoration', sub: 'activeRest', dir: 0.6 }, { trait: 'social', sub: 'solitude', dir: 0.3 }],
  '街区':     [{ trait: 'social', sub: 'travelerCommunity', dir: 0.6 }, { trait: 'aesthetics', sub: 'visual', dir: 0.5 }, { trait: 'food', sub: 'streetFood', dir: 0.6 }, { trait: 'pace', sub: 'daytime', dir: 0.5 }],

  // 艺术/建筑/园林
  '艺术':     [{ trait: 'aesthetics', sub: 'visual', dir: 1 }, { trait: 'culture', sub: 'contemporary', dir: 1 }, { trait: 'novelty', sub: 'trendsetting', dir: 0.8 }, { trait: 'weatherFlex', sub: 'indoorBackup', dir: 0.6 }],
  '建筑':     [{ trait: 'aesthetics', sub: 'visual', dir: 1 }, { trait: 'culture', sub: 'contemporary', dir: 0.6 }, { trait: 'comfort', sub: 'infrastructure', dir: 0.4 }],
  '园林':     [{ trait: 'aesthetics', sub: 'visual', dir: 1 }, { trait: 'nature', sub: 'landscape', dir: 0.6 }, { trait: 'restoration', sub: 'sensoryRest', dir: 0.8 }, { trait: 'culture', sub: 'historical', dir: 0.5 }],

  // 自然
  '自然':     [{ trait: 'nature', sub: 'landscape', dir: 1 }, { trait: 'restoration', sub: 'sensoryRest', dir: 1 }, { trait: 'restoration', sub: 'activeRest', dir: 0.7 }, { trait: 'lowCrowd', sub: 'touristDensity', dir: 0.3 }],
  '海边':     [{ trait: 'nature', sub: 'waterBody', dir: 1 }, { trait: 'restoration', sub: 'activeRest', dir: 0.8 }, { trait: 'aesthetics', sub: 'tactile', dir: 0.6 }, { trait: 'weatherFlex', sub: 'weatherAdaptability', dir: -0.4 }],

  // 夜景/城市
  '夜景':     [{ trait: 'aesthetics', sub: 'visual', dir: 0.8 }, { trait: 'pace', sub: 'evening', dir: 1 }, { trait: 'social', sub: 'travelerCommunity', dir: 0.7 }],
  '城市':     [{ trait: 'transit', sub: 'intraCity', dir: 0.6 }, { trait: 'aesthetics', sub: 'visual', dir: 0.4 }, { trait: 'comfort', sub: 'infrastructure', dir: 0.5 }],

  // 餐饮/商业/交通
  '餐饮':     [{ trait: 'food', sub: 'localCuisine', dir: 0.7 }, { trait: 'food', sub: 'streetFood', dir: 0.6 }, { trait: 'social', sub: 'localInteraction', dir: 0.5 }, { trait: 'weatherFlex', sub: 'indoorBackup', dir: 0.5 }],
  '商业':     [{ trait: 'food', sub: 'fineDining', dir: 0.4 }, { trait: 'bookingEase', sub: 'ticketAvail', dir: -0.3 }, { trait: 'authenticity', sub: 'uncommercialized', dir: -1 }, { trait: 'lowCrowd', sub: 'touristDensity', dir: -0.6 }],
  '交通':     [{ trait: 'transit', sub: 'intercity', dir: 0.8 }, { trait: 'transit', sub: 'intraCity', dir: 0.6 }, { trait: 'transit', sub: 'lastMile', dir: 0.5 }, { trait: 'comfort', sub: 'infrastructure', dir: 0.5 }]
};

/**
 * riskFlags 到子维度的影响规则。
 * dir > 0 表示风险标记会降低该子维度值；dir < 0 表示提升（如 crowd 提升独处空间的相对价值评估）。
 * 这里统一用 penalty 表示对该子维度的扣减幅度。
 */
const RISKFLAG_TO_SUBDIM = {
  'crowd': [
    { trait: 'lowCrowd', sub: 'touristDensity', penalty: 0.35 },
    { trait: 'lowCrowd', sub: 'queuingTime', penalty: 0.30 },
    { trait: 'bookingEase', sub: 'ticketAvail', penalty: 0.20 },
    { trait: 'bookingEase', sub: 'accommodationAvail', penalty: 0.15 },
    { trait: 'social', sub: 'solitude', penalty: 0.25 }
  ],
  'commercial': [
    { trait: 'authenticity', sub: 'uncommercialized', penalty: 0.35 },
    { trait: 'authenticity', sub: 'localLife', penalty: 0.18 },
    { trait: 'novelty', sub: 'discovery', penalty: 0.15 },
    { trait: 'culture', sub: 'folkCustom', penalty: 0.12 }
  ],
  'expensive': [
    { trait: 'budget', sub: 'accommodation', penalty: 0.25 },
    { trait: 'budget', sub: 'dining', penalty: 0.18 },
    { trait: 'budget', sub: 'activities', penalty: 0.20 }
  ],
  'climb': [
    { trait: 'pace', sub: 'daytime', penalty: 0.15 },
    { trait: 'comfort', sub: 'serviceLevel', penalty: 0.10 },
    { trait: 'restoration', sub: 'activeRest', penalty: 0.10 }
  ],
  'early': [
    { trait: 'pace', sub: 'daytime', penalty: 0.18 },
    { trait: 'bookingEase', sub: 'ticketAvail', penalty: 0.15 },
    { trait: 'bookingEase', sub: 'transportAvail', penalty: 0.10 }
  ],
  'longTransit': [
    { trait: 'transit', sub: 'intercity', penalty: 0.25 },
    { trait: 'transit', sub: 'lastMile', penalty: 0.20 },
    { trait: 'pace', sub: 'transition', penalty: 0.22 }
  ],
  'hot': [
    { trait: 'weatherFlex', sub: 'weatherAdaptability', penalty: 0.25 },
    { trait: 'weatherFlex', sub: 'seasonalStability', penalty: 0.20 },
    { trait: 'comfort', sub: 'infrastructure', penalty: 0.10 }
  ]
};

// ============ 2. getSubDimensions ============

/**
 * 返回指定主维度的子维度定义
 * @param {string} traitKey - 主维度键，如 'nature'
 * @returns {Object|null} { subKey: { key, label, description } }，无定义时返回 null
 */
function getSubDimensions(traitKey) {
  return SUB_DIMENSIONS[traitKey] || null;
}

// ============ 3. computeSubDimensionScores ============

/**
 * 从城市的 POI 数据、riskFlags、intelligence 推导指定主维度的子维度分值。
 *
 * 推导优先级：
 *   1. POI 派生（poi-derived）：若城市 POI 中存在映射到该子维度的类型
 *   2. 情报派生（intelligence-derived）：若城市 intelligence 含可映射字段
 *   3. 风险标记派生（riskflag-derived）：riskFlags 对该子维度有调整
 *   4. 默认推导（default）：以主维度 traitVector 值为基准
 *
 * 多来源可叠加：POI 提供基准后，riskFlags 与 intelligence 做微调，
 * source 取贡献最大的来源；若仅有微调无 POI，则 source 为对应微调来源。
 *
 * @param {Object} city - 城市记录（含 traitVector / pois / riskFlags / intelligence）
 * @param {string} traitKey - 主维度键
 * @returns {Object} { subKey: { value, confidence, source } }
 */
function computeSubDimensionScores(city, traitKey) {
  const subDef = SUB_DIMENSIONS[traitKey];
  if (!subDef) return {};

  const traitVector = city.traitVector || {};
  const baseValue = typeof traitVector[traitKey] === 'number'
    ? traitVector[traitKey]
    : 0.5;
  const intel = city.intelligence || {};
  const riskFlags = city.riskFlags || [];
  const pois = Array.isArray(city.pois) ? city.pois : [];

  // --- 步骤 1：聚合 POI 对该主维度各子维度的贡献 ---
  const poiContributions = {}; // subKey -> { sum, count }
  pois.forEach(poi => {
    const type = poi && poi.type;
    const mappings = POI_TYPE_TO_SUBDIM[type];
    if (!mappings) return;
    mappings.forEach(m => {
      if (m.trait !== traitKey) return;
      if (!poiContributions[m.sub]) poiContributions[m.sub] = { sum: 0, count: 0 };
      poiContributions[m.sub].sum += m.dir;
      poiContributions[m.sub].count += 1;
    });
  });

  // --- 步骤 2：为每个子维度计算初始值 ---
  const result = {};
  const subKeys = Object.keys(subDef);

  subKeys.forEach(subKey => {
    let value = baseValue;
    let confidence = 0.4; // 默认置信度
    let source = 'default';
    const contrib = poiContributions[subKey];

    if (contrib && contrib.count > 0) {
      // POI 派生：基础值 + 贡献调整，按 POI 数量做对数式收敛避免过度偏移
      const avgDir = contrib.sum / Math.max(contrib.count, 1);
      const poiBoost = clamp(avgDir * 0.18, -0.25, 0.25);
      value = clamp(baseValue + poiBoost, 0, 1);
      confidence = clamp(0.55 + contrib.count * 0.06, 0.55, 0.85);
      source = 'poi-derived';
    }
    // 暂存 POI 派生状态，后续 intelligence/riskflag 在此基础上微调
    result[subKey] = { value, confidence, source, _poiDerived: !!contrib };
  });

  // --- 步骤 3：intelligence 微调 ---
  // 将 intelligence 字段映射到主维度，对子维度做小幅均匀修正
  const intelAdjust = _mapIntelligenceToTrait(traitKey, intel);
  if (intelAdjust !== null) {
    subKeys.forEach(subKey => {
      const adj = clamp(intelAdjust * 0.12, -0.1, 0.1);
      const cur = result[subKey];
      cur.value = clamp(cur.value + adj, 0, 1);
      // 若无 POI 派生且 intelligence 影响显著，标记来源
      if (!cur._poiDerived && Math.abs(intelAdjust) > 0.1) {
        cur.source = 'intelligence-derived';
        cur.confidence = Math.max(cur.confidence, 0.5);
      }
    });
  }

  // --- 步骤 4：riskFlags 微调 ---
  let anyRiskAdjusted = false;
  riskFlags.forEach(flag => {
    const rules = RISKFLAG_TO_SUBDIM[flag];
    if (!rules) return;
    rules.forEach(rule => {
      if (rule.trait !== traitKey) return;
      const cur = result[rule.sub];
      if (!cur) return;
      cur.value = clamp(cur.value - rule.penalty, 0, 1);
      // riskflag 是强信号：若有 POI 派生则保留 poi-derived 为主来源但降低置信；
      // 若无 POI 派生，则来源改为 riskflag-derived
      if (!cur._poiDerived) {
        cur.source = 'riskflag-derived';
        cur.confidence = Math.max(cur.confidence, 0.5);
      } else {
        cur.confidence = clamp(cur.confidence - 0.05, 0.4, 0.85);
      }
      anyRiskAdjusted = true;
    });
  });

  // --- 步骤 5：清理临时字段、round ---
  subKeys.forEach(subKey => {
    const cur = result[subKey];
    delete cur._poiDerived;
    cur.value = round(cur.value, 3);
    cur.confidence = round(cur.confidence, 3);
  });

  // 若整个维度既无 POI 也无 riskflag/intelligence 显著影响，保留 default
  // （已在步骤 2 设定）
  return result;
}

/**
 * 将 intelligence 字段映射为主维度的修正系数
 * @returns {number|null} 修正方向（-1~1），null 表示无映射
 */
function _mapIntelligenceToTrait(traitKey, intel) {
  const map = {
    restoration: ['weatherBackup', 'poiDepth'],
    nature: ['poiDepth'],
    culture: ['poiDepth', 'routeValue'],
    food: ['costStability', 'poiDepth'],
    pace: ['transportEase'],
    social: ['growthSignal'],
    budget: ['costStability'],
    aesthetics: ['poiDepth', 'routeValue'],
    comfort: ['transportEase', 'costStability'],
    novelty: ['growthSignal', 'routeValue'],
    transit: ['transportEase', 'routeValue'],
    lowCrowd: ['crowdRisk'],
    authenticity: ['poiDepth'],
    weatherFlex: ['weatherBackup'],
    bookingEase: ['bookingFriction'],
    workation: ['transportEase', 'costStability']
  };
  const fields = map[traitKey];
  if (!fields || fields.length === 0) return null;
  let sum = 0;
  let n = 0;
  fields.forEach(f => {
    const v = intel[f];
    if (typeof v === 'number') {
      // crowdRisk / bookingFriction 是负向指标（值越高越差），需反转
      if (f === 'crowdRisk' || f === 'bookingFriction') {
        sum += (0.5 - v) * 2; // 映射到 -1~1
      } else {
        sum += (v - 0.5) * 2;
      }
      n += 1;
    }
  });
  if (n === 0) return null;
  return sum / n;
}

// ============ 4. enrichWithSubDimensions ============

/**
 * 对城市的每个主维度调用 computeSubDimensionScores，
 * 返回完整的子维度树。
 *
 * @param {Object} city - 城市记录
 * @returns {Object} { traitKey: { subKey: { value, confidence, source } } }
 */
function enrichWithSubDimensions(city) {
  const tree = {};
  TRAIT_KEYS.forEach(traitKey => {
    tree[traitKey] = computeSubDimensionScores(city, traitKey);
  });
  return tree;
}

// ============ 5. flattenSubDimensions ============

/**
 * 将子维度树扁平化为点分键值对
 *
 * @param {Object} subTree - enrichWithSubDimensions 的返回值
 * @returns {Object} { 'nature.landscape': 0.75, 'nature.waterBody': 0.82, ... }
 */
function flattenSubDimensions(subTree) {
  const flat = {};
  if (!subTree || typeof subTree !== 'object') return flat;

  Object.keys(subTree).forEach(traitKey => {
    const subs = subTree[traitKey];
    if (!subs || typeof subs !== 'object') return;
    Object.keys(subs).forEach(subKey => {
      const entry = subs[subKey];
      const value = entry && typeof entry.value === 'number' ? entry.value : 0;
      flat[`${traitKey}.${subKey}`] = round(value, 3);
    });
  });
  return flat;
}

// ============ 6. computeDimensionalDepth ============

/**
 * 计算每个主维度的"数据深度"——有多少子维度有真实数据支撑（vs 默认推导）。
 *
 * 真实数据来源：'poi-derived' | 'intelligence-derived' | 'riskflag-derived'
 * 非真实来源：'default'
 *
 * @param {Object} city - 城市记录
 * @returns {Object} { traitKey: { depth, realDataCount, totalCount } }
 */
function computeDimensionalDepth(city) {
  const result = {};
  TRAIT_KEYS.forEach(traitKey => {
    const subs = computeSubDimensionScores(city, traitKey);
    const subKeys = Object.keys(subs);
    const totalCount = subKeys.length;
    let realDataCount = 0;

    subKeys.forEach(subKey => {
      const src = subs[subKey].source;
      if (src && src !== 'default') {
        realDataCount += 1;
      }
    });

    const depth = totalCount > 0
      ? round(realDataCount / totalCount, 3)
      : 0;

    result[traitKey] = { depth, realDataCount, totalCount };
  });
  return result;
}

// ============ 导出 ============

module.exports = {
  // 常量
  SUB_DIMENSIONS,
  TRAIT_KEYS,
  POI_TYPE_TO_SUBDIM,
  RISKFLAG_TO_SUBDIM,
  // 工具
  clamp,
  round,
  // 函数
  getSubDimensions,
  computeSubDimensionScores,
  enrichWithSubDimensions,
  flattenSubDimensions,
  computeDimensionalDepth
};
