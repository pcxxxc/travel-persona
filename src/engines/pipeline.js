/**
 * 旅格 Travel Persona · 推荐管线编排器（工业级增强版）
 *
 * 串联所有引擎模块，实现完整的推荐流程：
 * 输入 → 硬约束过滤 → 时间感知调制 → 多目标评分 → 置信传播 → Pareto前沿 → MMR重排 → 敏感性分析 → 六层解释 → 输出
 *
 * 工业级增强：
 * - 子维度系统（48个子维度）
 * - 置信区间传播（Monte Carlo排序稳定性）
 * - 时间感知引擎（季节/天气/节假日三维调制）
 * - 敏感性分析（摇摆因子/What-If/波动性）
 * - 六层解释（直觉→量化→代价→反事实→因果链→对比分析）
 *
 * 对应总纲：7.1-7.7 完整推荐管线 + 18.3 天气不伪造
 */

const { getCities } = require('../data/cityRecords');
const { localGeocode } = require('../services/map/nominatimProvider');
const { getWeather } = require('../services/weather/weatherService');
const { getActiveProvider } = require('../services/map/mapProvider');
const { getTravelFriendliness } = require('../services/ops/holidayService');
const { applyTravelStyleToRoutePlan } = require('../services/fallbackPlanner');
const { buildGenericRouteExperiment } = require('../services/route/genericMultiCityPlanner');
const { buildCityDayPlans } = require('../services/route/routeDayPlanner');
const {
  buildFinalVector,
  classifyPersona,
  inferAvoidsFromFreeText,
  extractHardConstraints,
  extractSoftPreferences
} = require('./personaEngine');
const { applyConstraintFilter, buildUncertaintiesFromFiltered } = require('./constraintFilter');
const { scoreCities, markBudgetViolations } = require('./multiObjectiveScorer');
const { optimize: paretoOptimize, selectPathsFromPareto } = require('./paretoOptimizer');
const { rerank: mmrRerank, diversifyAcrossPaths } = require('./mmrReranker');
const { explainPath } = require('./explainability');

// 工业级增强模块
const { enrichWithSubDimensions, computeDimensionalDepth } = require('./subDimensions');
const { propagateThroughPipeline, rankWithUncertainty, scoreWithConfidence } = require('./confidencePropagator');
const { applyTemporalContext, getSeasonFromDate } = require('./temporalContext');
const { generateSensitivityReport } = require('./sensitivityAnalyzer');

const DATA_VERSION = {
  personaModel: '2.0.0',
  weightVersion: 'phase1-industrial-2026-07-11',
  cityDataSnapshot: '2026-07-12',
  agentModelVersion: null,
  subDimensionVersion: '1.0.0',
  confidenceModelVersion: '1.0.0',
  temporalModelVersion: '1.0.0',
  routeModelVersion: 'generic-corridor-v2'
};

const MAOMING_BEIJING_ROUTE_COORDINATES = {
  '茂名': { lat: 21.6627, lng: 110.9255 },
  '广州': { lat: 23.1291, lng: 113.2644 },
  '长沙': { lat: 28.2282, lng: 112.9388 },
  '武汉': { lat: 30.5928, lng: 114.3055 },
  '洛阳': { lat: 34.6197, lng: 112.4540 },
  '郑州/洛阳': { lat: 34.6197, lng: 112.4540 },
  '北京': { lat: 39.9042, lng: 116.4074 },
  '济南': { lat: 36.6512, lng: 117.1201 },
  '南京': { lat: 32.0603, lng: 118.7969 },
  '杭州': { lat: 30.2741, lng: 120.1551 },
  '泉州': { lat: 24.8741, lng: 118.6757 },
  '苏州/杭州': { lat: 31.2989, lng: 120.5853 },
  '泉州/厦门': { lat: 24.8741, lng: 118.6757 }
};

/**
 * 获取候选城市的天气数据（并行，不阻塞主流程）
 */
async function fetchWeatherForCities(cities) {
  const weatherMap = {};
  let hasData = false;

  await Promise.all(
    cities.map(async city => {
      const cityId = city.cityId;
      if (!cityId) return;
      try {
        const w = await getWeather(cityId);
        if (w) {
          weatherMap[cityId] = w;
          hasData = true;
        }
      } catch (e) {
        console.warn(`[pipeline] 获取 ${cityId} 天气失败: ${e.message}`);
      }
    })
  );

  return { weatherMap, hasData };
}

/**
 * 根据天气预报生成出行小建议
 */
function generateWeatherTip(forecast) {
  if (!forecast || !forecast.length) return null;
  const day = forecast[0];
  const tips = [];
  if (day.precipProb > 60) tips.push('建议携带雨具');
  if (day.tempMax > 35) tips.push('注意防暑降温');
  if (day.tempMin < 5) tips.push('注意保暖');
  if (day.windSpeed > 30) tips.push('户外活动注意防风');
  return tips.length ? tips.join('；') : null;
}

/**
 * 获取行程日期的节假日信息
 */
function fetchHolidayInfo(tripContext) {
  const startDate = tripContext?.dates?.start;
  if (!startDate) return null;
  try {
    return getTravelFriendliness(startDate);
  } catch (e) {
    console.warn(`[pipeline] 节假日查询失败: ${e.message}`);
    return null;
  }
}

/**
 * 主入口：生成旅行规划推荐（工业级增强版）
 */
async function generatePlan(input) {
  const { personaProfile, tripIntent, tripContext } = input;
  const effectiveTripContext = {
    ...tripContext,
    destination: tripIntent?.destination || tripContext?.destination
  };
  const inferredAvoids = inferAvoidsFromFreeText(tripIntent?.freeText);
  const effectiveTripIntent = {
    ...tripIntent,
    avoid: Array.from(new Set([...(tripIntent?.avoid || []), ...inferredAvoids]))
  };

  // --- 步骤 0: 获取节假日信息 ---
  const holidayInfo = fetchHolidayInfo(effectiveTripContext);

  // --- 步骤 1: 构建人格向量 ---
  const vectorResult = buildFinalVector(personaProfile, effectiveTripIntent, effectiveTripContext);
  const userVector = vectorResult.vector;
  const personaClassification = classifyPersona(userVector, {
    hasHistory: Boolean(personaProfile?.profileId || personaProfile?.traits && Object.keys(personaProfile.traits).length)
  });

  // --- 步骤 2: 提取硬约束 ---
  const hardConstraints = extractHardConstraints(effectiveTripContext);
  if (effectiveTripIntent?.avoid?.includes('expensive') && effectiveTripContext?.budget?.hardMax) {
    hardConstraints.push({
      type: 'budgetCeiling',
      max: effectiveTripContext.budget.hardMax * 0.9,
      reason: '用户倾向避免高消费'
    });
  }

  // --- 步骤 3: 硬约束过滤 ---
  const allCities = getCities();
  const originText = String(effectiveTripContext?.origin || '').trim();
  const localOrigin = allCities.find(city => city.name === originText || city.id === originText.toLowerCase());
  let originCoordinates = localOrigin?.coordinates || null;
  if (!originCoordinates && originText) {
    // 优先用百度地图 MCP geocode，失败则降级到本地
    const mapProvider = getActiveProvider();
    if (mapProvider && mapProvider.providerName !== 'mock') {
      try {
        const geoResult = await mapProvider.geocode(originText);
        if (geoResult && geoResult.data) {
          originCoordinates = { lat: geoResult.data.lat, lng: geoResult.data.lng };
          console.log(`[pipeline] 出发地使用百度地图坐标: ${originText} (${originCoordinates.lat}, ${originCoordinates.lng})`);
        }
      } catch (geoErr) {
        console.warn(`[pipeline] 百度地图 geocode 失败，降级到本地: ${geoErr.message}`);
      }
    }
    if (!originCoordinates) {
      const localHits = localGeocode(originText);
      if (localHits?.[0]) {
        originCoordinates = { lat: localHits[0].lat, lng: localHits[0].lng };
        console.log(`[pipeline] 出发地使用本地坐标: ${originText}`);
      } else {
        console.warn(`[pipeline] 出发地未找到坐标: ${originText}`);
      }
    }
  }
  const scoringContext = { ...effectiveTripContext, originCoordinates };
  const candidateCities = localOrigin && allCities.length > 1 && !effectiveTripIntent?.destination
    ? allCities.filter(city => city.id !== localOrigin.id)
    : allCities;
  const { passed: filteredCities, filtered: rejectedCities } = applyConstraintFilter(candidateCities, hardConstraints);

  if (filteredCities.length === 0) {
    return buildEmptyResponse(
      '所有候选城市未通过硬约束过滤',
      buildUncertaintiesFromFiltered(rejectedCities),
      vectorResult,
      holidayInfo
    );
  }

  // --- 步骤 3.5: 两阶段候选缩圈后获取天气 ---
  // 天气只影响最终候选，不应为整个城市库逐城发起网络请求。
  const preliminaryScored = scoreCities(
    userVector,
    effectiveTripIntent,
    scoringContext,
    filteredCities,
    {}
  );
  const weatherCandidateIds = new Set();
  ['personaBest', 'balanced', 'lowCost'].forEach(pathType => {
    [...preliminaryScored]
      .sort((a, b) => b.pathScores[pathType] - a.pathScores[pathType])
      .slice(0, 4)
      .forEach(candidate => weatherCandidateIds.add(candidate.city.cityId || candidate.city.id));
  });
  const weatherCandidates = filteredCities.filter(city => weatherCandidateIds.has(city.cityId || city.id));
  const { weatherMap, hasData } = await fetchWeatherForCities(weatherCandidates);

  // --- 步骤 4: 时间感知调制（季节 + 天气 + 节假日三维调制城市向量）---
  const temporalAdjustments = {};
  for (const city of filteredCities) {
    const cityId = city.cityId || city.id;
    const wData = weatherMap[cityId];
    const result = applyTemporalContext(city, effectiveTripContext, wData, holidayInfo);
    temporalAdjustments[cityId] = result;
  }

  // --- 步骤 5: 多目标评分（使用时间调制后的向量）---
  // 临时将 _adjustedVector 作为 traitVector 传入评分
  const citiesForScoring = filteredCities.map(c => ({
    ...c,
    traitVector: temporalAdjustments[c.cityId || c.id]?.adjustedVector || c.traitVector
  }));
  let scoredCities = scoreCities(userVector, effectiveTripIntent, scoringContext, citiesForScoring, weatherMap);
  scoredCities = markBudgetViolations(scoredCities, effectiveTripContext);

  // --- 步骤 5.5: 置信传播（为每个评分项注入置信区间）---
  scoredCities = scoredCities.map(item => propagateThroughPipeline(item));

  // --- 步骤 5.6: 带不确定性的排序 ---
  const uncertaintyRanking = rankWithUncertainty(scoredCities);

  // --- 步骤 6: 人格匹配门槛 ---
  const highFitCities = scoredCities.filter(c => c.subScores.personaFit >= 0.62);
  const candidatePool = highFitCities.length > 0 ? highFitCities : scoredCities;
  const avoidRiskMap = {
    crowd: 'crowd', commercial: 'commercial', climb: 'climb',
    early: 'early', longTransit: 'longTransit', expensive: 'expensive'
  };
  const avoidedRisks = new Set((effectiveTripIntent.avoid || []).map(value => avoidRiskMap[value]).filter(Boolean));
  const conflictFreePool = candidatePool.filter(candidate => {
    const flags = candidate.city.riskFlags || [];
    return !flags.some(flag => avoidedRisks.has(flag));
  });
  const shortTransferPool = effectiveTripIntent.avoid?.includes('longTransit')
    ? conflictFreePool.filter(candidate => candidate.subScores.routeScore >= 0.87)
    : conflictFreePool;
  const realisticPool = shortTransferPool.length > 0
    ? shortTransferPool
    : conflictFreePool.length > 0 ? conflictFreePool : candidatePool;
  const lowCostPool = effectiveTripIntent.avoid?.includes('longTransit')
    ? candidatePool.filter(candidate => candidate.subScores.routeScore >= 0.87)
    : realisticPool;

  // --- 步骤 7: Pareto 优化 ---
  const paretoResult = paretoOptimize(candidatePool, ['personaFit', 'budgetScore', 'resilienceScore']);

  // --- 步骤 8: 为三条路径选择候选 ---
  const pathSelections = {};

  if (paretoResult.paretoFront.length > 0) {
    const sorted = [...paretoResult.paretoFront].sort(
      (a, b) => b.subScores.personaFit - a.subScores.personaFit
    );
    pathSelections.personaBest = sorted.slice(0, 4);
  }

  const balancedSorted = [...realisticPool].sort(
    (a, b) => b.pathScores.balanced - a.pathScores.balanced
  );
  pathSelections.balanced = balancedSorted.slice(0, 4);

  const lowCostCandidates = lowCostPool.filter(
    c => !c.budgetViolation && c.subScores.personaFit >= 0.5
  );
  const lowCostSorted = [...(lowCostCandidates.length > 0 ? lowCostCandidates : lowCostPool)].sort(
    (a, b) => b.pathScores.lowCost - a.pathScores.lowCost
  );
  pathSelections.lowCost = lowCostSorted.slice(0, 4);

  // --- 步骤 9: MMR 重排 ---
  const rerankedPaths = {};
  for (const [pathType, candidates] of Object.entries(pathSelections)) {
    if (candidates && candidates.length > 0) {
      rerankedPaths[pathType] = mmrRerank(candidates, pathType, 3, 0.75);
    }
  }

  // --- 步骤 10: 跨路径多样性去重 ---
  const diversifiedPaths = diversifyAcrossPaths(rerankedPaths);

  // 补查最终路径 Top1 城市的天气（可能不在 preliminary Top4 内）
  const finalTopCityIds = new Set();
  Object.values(diversifiedPaths).forEach(candidates => {
    if (candidates && candidates[0]) {
      finalTopCityIds.add(candidates[0].city.cityId || candidates[0].city.id);
    }
  });
  await Promise.all(
    Array.from(finalTopCityIds).map(async cityId => {
      if (weatherMap[cityId]) return;
      const cityObj = filteredCities.find(c => (c.cityId || c.id) === cityId);
      if (!cityObj) return;
      try {
        const w = await getWeather(cityId, { cityName: cityObj.name, coordinates: cityObj.coordinates });
        if (w) weatherMap[cityId] = w;
      } catch (e) {
        console.warn(`[pipeline] 补查 ${cityId} 天气失败: ${e.message}`);
      }
    })
  );

  // --- 步骤 11: 子维度增强（为 Top 候选城市计算子维度树）---
  const subDimensionData = {};
  const dimensionalDepthData = {};
  for (const [pathType, candidates] of Object.entries(diversifiedPaths)) {
    if (!candidates || candidates.length === 0) continue;
    const top = candidates[0];
    const cityId = top.city.cityId || top.city.id;
    subDimensionData[cityId] = enrichWithSubDimensions(top.city);
    dimensionalDepthData[cityId] = computeDimensionalDepth(top.city);
  }

  // --- 步骤 12: 生成六层解释（带置信区间+因果链+对比+敏感性）---
  const decisionPaths = [];
  const allUncertainties = [];
  const allEvidence = [];

  // 收集证据
  vectorResult.evidence.forEach(ev => {
    allEvidence.push({
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: 'statedPreference',
      source: ev.source,
      reliability: 0.75,
      excluded: false,
      createdAt: new Date().toISOString()
    });
  });

  // 为每条路径生成增强解释
  const pathEntries = Object.entries(diversifiedPaths);
  for (let idx = 0; idx < pathEntries.length; idx++) {
    const [pathType, candidates] = pathEntries[idx];
    if (!candidates || candidates.length === 0) continue;

    const topCandidate = candidates[0];
    const subScores = { ...topCandidate.subScores, totalScore: topCandidate.pathScores[pathType] };

    // 获取置信区间
    const confidenceBand = topCandidate.confidenceBands?.pathScores?.[pathType] || null;
    const confidenceBands = topCandidate.confidenceBands?.subScores || null;

    // 寻找次选城市（同路径的第二名或下一条路径的第一名）
    let runnerUp = null;
    let runnerUpScores = null;
    if (candidates.length > 1) {
      runnerUp = candidates[1].city;
      runnerUpScores = { ...candidates[1].subScores, totalScore: candidates[1].pathScores[pathType] };
    } else if (idx + 1 < pathEntries.length) {
      const nextPath = pathEntries[idx + 1][1];
      if (nextPath && nextPath.length > 0) {
        runnerUp = nextPath[0].city;
        runnerUpScores = { ...nextPath[0].subScores, totalScore: nextPath[0].pathScores[pathEntries[idx + 1][0]] };
      }
    }

    // 生成敏感性分析报告
    let sensitivityReport = null;
    try {
      sensitivityReport = generateSensitivityReport(
        userVector,
        topCandidate.city,
        runnerUp,
        scoredCities
      );
    } catch (e) {
      console.warn(`[pipeline] 敏感性分析失败: ${e.message}`);
    }

    // 生成增强解释
    const explanation = explainPath(
      topCandidate.city,
      subScores,
      pathType,
      userVector,
      effectiveTripContext,
      holidayInfo,
      {
        confidenceBand,
        confidenceBands,
        sensitivityReport,
        vectorResult,
        runnerUp,
        runnerUpScores
      }
    );

    // 注入子维度数据
    const cityId = topCandidate.city.cityId || topCandidate.city.id;
    explanation.subDimensions = subDimensionData[cityId] || null;
    explanation.dimensionalDepth = dimensionalDepthData[cityId] || null;

    // 注入时间调制信息
    explanation.temporalModifiers = temporalAdjustments[cityId]?.modifiers || null;

    // 注入排序稳定性
    const rankChange = uncertaintyRanking.rankChanges?.find(rc => rc.cityId === cityId);
    explanation.rankStability = rankChange ? {
      originalRank: rankChange.originalRank,
      meanRank: rankChange.meanRank,
      rankStdDev: rankChange.rankStdDev,
      stability: uncertaintyRanking.stabilityScores?.[cityId] || null
    } : null;

    decisionPaths.push(explanation);
    allUncertainties.push(...explanation.uncertainties);
  }

  // 添加硬约束过滤的不确定性
  if (rejectedCities.length > 0) {
    allUncertainties.push(...buildUncertaintiesFromFiltered(rejectedCities));
  }

  // 添加节假日相关不确定性
  if (holidayInfo && holidayInfo.travelFriendliness === 'low') {
    allUncertainties.push({
      field: '出行日期',
      level: 'medium',
      reason: holidayInfo.reason,
      improveAction: '如时间灵活，考虑前后错峰出行'
    });
  }

  // 去重不确定性
  const uniqueUncertainties = [];
  const seenFields = new Set();
  for (const u of allUncertainties) {
    if (!seenFields.has(u.field)) {
      seenFields.add(u.field);
      uniqueUncertainties.push(u);
    }
  }

  // --- 构建各路径天气摘要 ---
  const weatherByPath = {};
  for (const [pathType, candidates] of Object.entries(diversifiedPaths)) {
    if (!candidates || candidates.length === 0) continue;
    const top = candidates[0];
    const w = weatherMap[top.city.cityId];
    if (w) {
      weatherByPath[pathType] = {
        cityId: top.city.cityId,
        cityName: top.city.name,
        source: w.source,
        cached: w.cached,
        forecast: w.forecast?.slice(0, 3) || [],
        current: w.current || null
      };
    }
  }
  const hasVisibleWeather = Object.keys(weatherByPath).length > 0;

  // 将天气数据附加到各路径（供前端 path.weather 使用）
  decisionPaths.forEach(function (dp) {
    if (dp.type && weatherByPath[dp.type]) {
      dp.weather = weatherByPath[dp.type];
      if (dp.weather && !dp.weather.weatherTip) dp.weather.weatherTip = generateWeatherTip(dp.weather.forecast);
    }
    if (originCoordinates) {
      dp.originCoordinates = originCoordinates;
    }
  });

  // --- 跨城交通数据查询（百度地图优先，静态数据降级）---
  const mapProvider2 = getActiveProvider();
  const transportData = {};
  const staticConnections = require('../data/intercityConnections').INTERCITY_CONNECTIONS;
  if (originCoordinates && mapProvider2 && mapProvider2.providerName !== 'mock') {
    // 并行查询每条路径的交通数据
    const routePromises = decisionPaths.map(async function (dp) {
      if (!dp.city || !dp.city.coordinates) return;
      try {
        const routeResult = await mapProvider2.getRoute(
          originCoordinates,
          { lat: dp.city.coordinates.lat, lng: dp.city.coordinates.lng },
          [], 'driving', { city: dp.city.name }
        );
        if (routeResult && routeResult.data) {
          transportData[dp.type] = {
            mode: 'driving',
            distanceKm: routeResult.data.distance ? Math.round(routeResult.data.distance / 1000) : null,
            durationHours: routeResult.data.duration ? +(routeResult.data.duration / 3600).toFixed(1) : null,
            source: 'baidu-map'
          };
        }
      } catch (routeErr) {
        console.warn(`[pipeline] 百度路线查询失败 (${dp.city.name}): ${routeErr.message}`);
      }
    });
    await Promise.all(routePromises);
  }
  // 补充静态铁路数据（百度驾车不包含火车，静态数据提供铁路选项）
  if (originText) {
    decisionPaths.forEach(function (dp) {
      if (transportData[dp.type]) return; // 已有百度数据
      const cityName = dp.city?.name;
      if (!cityName) return;
      const conn = staticConnections.find(c =>
        (c.from === originText && c.to === cityName) || (c.from === cityName && c.to === originText)
      );
      if (conn) {
        transportData[dp.type] = {
          mode: conn.mode,
          durationHours: { min: conn.durationHours.min, max: conn.durationHours.max },
          fareCny: { min: conn.fareCny.min, max: conn.fareCny.max },
          transfers: conn.transfers,
          source: 'static-baseline'
        };
      }
    });
  }
  // 注入交通数据到路径
  decisionPaths.forEach(function (dp) {
    dp.transportCost = transportData[dp.type] || null;
  });

  // --- 步骤 13: 构建最终响应 ---
  let multiCityPlan = null;
  const destinationText = String(effectiveTripContext.destination || '').trim();
  if (destinationText && Number(effectiveTripContext.days) >= 10 && Number(effectiveTripContext.days) <= 21) {
    const totalComfortBudget = Number(effectiveTripContext.budget?.comfort) || 0;
    multiCityPlan = buildGenericRouteExperiment({
      origin: originText,
      destination: destinationText,
      days: Number(effectiveTripContext.days),
      budget: totalComfortBudget > 0
        ? Math.round(totalComfortBudget / Number(effectiveTripContext.days))
        : 360,
      totalBudget: totalComfortBudget,
      hardMax: Number(effectiveTripContext.budget?.hardMax) || null,
      avoid: effectiveTripIntent.avoid || [],
      interests: effectiveTripIntent.interests || [],
      mood: effectiveTripIntent.mood,
      userVector
    });
    multiCityPlan = applyTravelStyleToRoutePlan(multiCityPlan, {
      days: Number(effectiveTripContext.days),
      totalBudget: totalComfortBudget,
      hardMax: Number(effectiveTripContext.budget?.hardMax) || null,
      travelStyle: effectiveTripContext.travelStyle || 'balanced'
    });
  }
  if (multiCityPlan?.primary?.nodes) {
    (multiCityPlan.variants || [multiCityPlan.primary]).forEach(variant => {
      variant.nodes = variant.nodes.map(node => {
        const cityRecord = allCities.find(city => city.name === node.city);
        return {
          ...node,
          coordinates: node.coordinates || MAOMING_BEIJING_ROUTE_COORDINATES[node.city] || cityRecord?.coordinates || null,
          dayPlans: buildCityDayPlans(cityRecord, node.stay, effectiveTripIntent)
        };
      });
    });
    multiCityPlan.primary = (multiCityPlan.variants || []).find(variant => variant.id === multiCityPlan.selectedVariantId) || multiCityPlan.primary;
  }

  const totalBudget = Number(effectiveTripContext.budget?.comfort) || Number(effectiveTripContext.budget?.hardMax) || 0;
  const tripDays = Number(effectiveTripContext.days) || 1;
  const dailyBudget = Math.round(totalBudget / tripDays);
  let budgetTier, budgetTierDesc;
  if (dailyBudget < 200) { budgetTier = 'budget'; budgetTierDesc = '经济型'; }
  else if (dailyBudget < 400) { budgetTier = 'standard'; budgetTierDesc = '标准型'; }
  else if (dailyBudget < 700) { budgetTier = 'comfort'; budgetTierDesc = '舒适型'; }
  else if (dailyBudget < 1200) { budgetTier = 'premium'; budgetTierDesc = '品质型'; }
  else { budgetTier = 'luxury'; budgetTierDesc = '奢华型'; }

  return {
    planId: `plan-${Date.now()}`,
    personaSnapshot: {
      traits: userVector,
      primaryPersona: personaClassification.primary,
      secondaryPersona: personaClassification.secondary,
      confidence: personaClassification.confidence,
      basis: personaClassification.basis
    },
    decisionPaths,
    multiCityPlan,
    selectedPlan: null,
    explanations: decisionPaths.flatMap(dp => dp.explanations || []),
    evidence: allEvidence,
    uncertainties: uniqueUncertainties.slice(0, 5),
    generatedAt: new Date().toISOString(),
    dataVersion: DATA_VERSION,
    capability: {
      mapFreshness: 'snapshot',
      weatherFreshness: hasVisibleWeather ? 'live' : 'unavailable',
      agentApplied: false,
      subDimensions: true,
      confidencePropagation: true,
      temporalAwareness: true,
      sensitivityAnalysis: true,
      routeOptimization: Boolean(multiCityPlan)
    },
    realTimeData: {
      weather: weatherByPath,
      holiday: holidayInfo,
      weatherSource: hasVisibleWeather ? 'open-meteo' : null
    },
    // 工业级增强：全局排序稳定性
    rankingStability: {
      volatility: uncertaintyRanking.rankChanges?.[0] || null,
      topStability: uncertaintyRanking.stabilityScores || {}
    },
    budgetTier: { tier: budgetTier, label: budgetTierDesc, dailyBudget }
  };
}

/**
 * 空响应
 */
function buildEmptyResponse(reason, uncertainties, vectorResult, holidayInfo) {
  return {
    planId: `plan-${Date.now()}`,
    personaSnapshot: {
      traits: vectorResult?.vector || {},
      confidence: 0.5
    },
    decisionPaths: [],
    selectedPlan: null,
    explanations: [{
      type: 'whyFit',
      content: `当前条件下暂无合适推荐：${reason}`
    }],
    evidence: [],
    uncertainties: uncertainties.length > 0 ? uncertainties : [{
      field: '推荐结果',
      level: 'high',
      reason: '所有候选城市未通过硬约束过滤',
      improveAction: '请放宽预算、天数或目的地要求后重试'
    }],
    generatedAt: new Date().toISOString(),
    dataVersion: DATA_VERSION,
    capability: {
      mapFreshness: 'snapshot',
      weatherFreshness: 'unavailable',
      agentApplied: false,
      subDimensions: true,
      confidencePropagation: true,
      temporalAwareness: true,
      sensitivityAnalysis: true
    },
    realTimeData: {
      weather: {},
      holiday: holidayInfo,
      weatherSource: null
    }
  };
}

module.exports = {
  generatePlan,
  DATA_VERSION
};
