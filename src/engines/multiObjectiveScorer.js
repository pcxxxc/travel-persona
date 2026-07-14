/**
 * 旅格 Travel Persona · 多目标评分器
 *
 * 从 fallbackPlanner.scoreCity() 迁移并扩展为三条路径使用不同权重。
 * 总纲7.5定义的多目标基础分权重。
 */

const TRAIT_WEIGHTS = {
  restoration: 0.97, nature: 1.00, culture: 0.82, food: 0.85,
  pace: 1.03, social: 0.72, budget: 0.92, aesthetics: 0.75,
  comfort: 0.68, novelty: 0.70, transit: 0.58, lowCrowd: 0.85,
  authenticity: 0.80, weatherFlex: 0.60, bookingEase: 0.65, workation: 0.55
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 3) {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

/**
 * 计算城市与用户的加权欧氏距离相似度
 */
function computePersonaFit(userVector, cityVector) {
  let sumSq = 0;
  let sumWeight = 0;
  const keys = Object.keys(TRAIT_WEIGHTS);

  keys.forEach(key => {
    const diff = userVector[key] - cityVector[key];
    const weight = TRAIT_WEIGHTS[key];
    sumSq += weight * diff * diff;
    sumWeight += weight;
  });

  const distance = Math.sqrt(sumSq / sumWeight);
  return round(clamp(1 - distance, 0, 1), 3);
}

/**
 * 计算当次取向匹配度
 */
function computeIntentFit(tripIntent, city) {
  let score = 0.5;
  const intel = city.intelligence || {};

  // mood 匹配
  const mood = tripIntent?.mood || 'restore';
  const moodMap = {
    restore: ['restoration', 'nature', 'comfort'],
    escape: ['nature', 'novelty', 'lowCrowd'],
    inspire: ['culture', 'aesthetics', 'authenticity'],
    social: ['social', 'food', 'pace'],
    efficient: ['transit', 'bookingEase', 'pace'],
    live: ['restoration', 'comfort', 'workation']
  };
  const preferred = moodMap[mood] || moodMap.restore;
  const cityVec = city.traitVector || {};
  const avg = preferred.reduce((sum, k) => sum + (cityVec[k] || 0), 0) / preferred.length;
  score = 0.4 + avg * 0.6;

  // interests 匹配
  (tripIntent?.interests || []).forEach(interest => {
    const interestTraitMap = {
      nature: 'nature', oldtown: 'culture', art: 'aesthetics',
      coffee: 'comfort', food: 'food', photo: 'aesthetics',
      museum: 'culture', hidden: 'novelty'
    };
    const trait = interestTraitMap[interest];
    if (trait && cityVec[trait]) {
      score += cityVec[trait] * 0.04;
    }
  });

  // avoid 惩罚
  (tripIntent?.avoid || []).forEach(avoid => {
    const avoidMap = {
      crowd: { trait: 'social', threshold: 0.68 },
      commercial: { trait: 'authenticity', threshold: 0.55 },
      climb: { trait: 'pace', threshold: 0.75 },
      early: { trait: 'pace', threshold: 0.70 },
      longTransit: { trait: 'transit', threshold: 0.68 },
      expensive: { trait: 'budget', threshold: 0.55 }
    };
    const rule = avoidMap[avoid];
    if (rule && cityVec[rule.trait] < rule.threshold) {
      score -= 0.06;
    }
  });

  return round(clamp(score, 0, 1), 3);
}

/**
 * 计算预算匹配度
 */
function computeBudgetScore(tripContext, city) {
  if (!tripContext || !tripContext.budget) return 0.72;

  const budget = tripContext.budget;
  const days = tripContext.days || 4;
  const dailyBudget = city.dailyBudget || 500;

  // 硬上限
  if (budget.hardMax && dailyBudget * days > budget.hardMax) {
    return 0.1; // 超过硬上限，严重惩罚但保留（供 lowCost 路径使用）
  }

  // 舒适预算
  if (budget.comfort) {
    const comfortDaily = budget.comfort / Math.max(days, 1);
    const ratio = comfortDaily / dailyBudget;
    if (ratio >= 1.2) return 0.92;
    if (ratio >= 0.8) return 0.78;
    if (ratio >= 0.5) return 0.62;
    return 0.42;
  }

  return 0.72;
}

/**
 * 计算天数匹配度
 */
function computeDaysScore(tripContext, city) {
  const days = tripContext?.days || 4;
  const minDays = city.minDays || 1;
  const maxDays = city.maxDays || 30;

  if (days < minDays) return 0.1;
  if (days > maxDays) return 0.6;

  const optimal = clamp((minDays + maxDays) / 2, minDays, maxDays);
  const diff = Math.abs(days - optimal);
  return round(clamp(1 - diff / optimal * 0.5, 0.5, 1), 3);
}

/**
 * 计算避雷匹配度
 */
function computeAvoidScore(tripIntent, city) {
  if (!tripIntent || !tripIntent.avoid || tripIntent.avoid.length === 0) return 0.85;

  let penalty = 0;
  const riskFlags = city.riskFlags || [];

  tripIntent.avoid.forEach(avoid => {
    const flagMap = {
      crowd: 'crowd', commercial: 'commercial', climb: 'climb',
      early: 'early', longTransit: 'longTransit', expensive: 'expensive'
    };
    if (riskFlags.includes(flagMap[avoid])) {
      penalty += 0.34;
    }
  });

  return round(clamp(0.88 - penalty, 0.08, 0.95), 3);
}

/**
 * 计算POI多样性
 */
function computeMapScore(city) {
  return city.poiDiversity || 0.6;
}

/**
 * 计算社区兼容度
 */
function computeCommunityScore(tripIntent, city) {
  if (!tripIntent || !tripIntent.avoid || tripIntent.avoid.length === 0) return 0.72;

  const avoidFlags = tripIntent.avoid.map(a => {
    const map = { crowd: 'crowd', commercial: 'commercial', climb: 'climb',
      early: 'early', longTransit: 'longTransit', expensive: 'expensive' };
    return map[a];
  }).filter(Boolean);

  const riskFlags = city.riskFlags || [];
  const overlap = avoidFlags.filter(f => riskFlags.includes(f)).length;

  return round(clamp(0.76 - overlap * 0.22, 0.16, 0.92), 3);
}

/**
 * 计算抗风险能力
 * @param {Object} city - 城市数据
 * @param {Object} [weatherData] - 实时天气数据（来自Open-Meteo），可选
 */
function computeResilienceScore(city, weatherData) {
  const intel = city.intelligence || {};
  const transit = intel.transportEase || 0.6;
  let weather = intel.weatherBackup || 0.58;

  // 如果有实时天气数据，用实际降水概率修正 weatherBackup
  if (weatherData && weatherData.forecast && weatherData.forecast.length > 0) {
    // 取未来3天平均降水概率
    const days = weatherData.forecast.slice(0, 3);
    const avgPrecipProb = days.reduce((sum, d) => sum + (d.precipProb || 0), 0) / days.length;
    // 降水概率越高，天气容错越低（总纲18.3：不伪造，只修正）
    if (avgPrecipProb > 50) {
      weather = clamp(weather * (1 - (avgPrecipProb - 50) / 200), 0.2, weather);
    }
  }

  const booking = 1 - (intel.bookingFriction || 0.5);
  const crowd = 1 - (intel.crowdRisk || 0.55);

  return round(clamp((transit + weather + booking + crowd) / 4, 0.3, 0.92), 3);
}

/**
 * 计算城市情报加权
 */
function computeEvidenceScore(city) {
  const intel = city.intelligence || {};
  const values = [
    intel.transportEase || 0.6,
    intel.costStability || 0.6,
    intel.poiDepth || 0.6,
    intel.weatherBackup || 0.58,
    1 - (intel.bookingFriction || 0.5),
    1 - (intel.crowdRisk || 0.55),
    intel.routeValue || 0.55,
    intel.growthSignal || 0.62
  ];
  return round(values.reduce((a, b) => a + b, 0) / values.length, 3);
}

/**
 * 计算路线适配度
 */
function computeRouteScore(tripContext, city) {
  const intel = city.intelligence || {};
  const origin = tripContext?.origin || '';
  const originCoordinates = tripContext?.originCoordinates;
  const destinationCoordinates = city.coordinates;

  if (origin && originCoordinates && destinationCoordinates) {
    const toRad = degrees => degrees * Math.PI / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(destinationCoordinates.lat - originCoordinates.lat);
    const dLng = toRad(destinationCoordinates.lng - originCoordinates.lng);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(originCoordinates.lat)) * Math.cos(toRad(destinationCoordinates.lat))
      * Math.sin(dLng / 2) ** 2;
    const distanceKm = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const days = Math.max(1, Number(tripContext.days) || 4);
    const comfortableDistance = days <= 3 ? 450 : days <= 5 ? 850 : days <= 7 ? 1300 : 2200;
    const maxUsefulDistance = days <= 3 ? 1300 : days <= 5 ? 2100 : days <= 7 ? 3000 : 4600;
    const distanceScore = distanceKm <= comfortableDistance
      ? 0.94
      : clamp(0.94 - ((distanceKm - comfortableDistance) / Math.max(maxUsefulDistance - comfortableDistance, 1)) * 0.68, 0.18, 0.94);
    const transportScore = intel.transportEase || city.transportScore || 0.6;
    return round(clamp(distanceScore * 0.72 + transportScore * 0.2 + (intel.routeValue || 0.55) * 0.08, 0.18, 0.95), 3);
  }

  if (origin) {
    return round(clamp((intel.transportEase || 0.6) * 0.65 + (intel.routeValue || 0.55) * 0.35, 0.3, 0.88), 3);
  }

  return intel.routeValue || 0.55;
}

/**
 * 对单个城市进行完整评分
 * 返回 11 个子分数
 * @param {Object} [weatherData] - 实时天气数据（影响 resilienceScore）
 */
function scoreCity(userVector, tripIntent, tripContext, city, weatherData) {
  return {
    personaFit: computePersonaFit(userVector, city.traitVector),
    intentFit: computeIntentFit(tripIntent, city),
    budgetScore: computeBudgetScore(tripContext, city),
    daysScore: computeDaysScore(tripContext, city),
    avoidScore: computeAvoidScore(tripIntent, city),
    mapScore: computeMapScore(city),
    communityScore: computeCommunityScore(tripIntent, city),
    resilienceScore: computeResilienceScore(city, weatherData),
    diversityScore: city.poiDiversity || 0.6,
    evidenceScore: computeEvidenceScore(city),
    routeScore: computeRouteScore(tripContext, city)
  };
}

/**
 * 三条路径的权重配置
 */
const PATH_WEIGHTS = {
  personaBest: {
    personaFit: 0.40, intentFit: 0.15, budgetScore: 0.05, daysScore: 0.05,
    avoidScore: 0.10, mapScore: 0.05, communityScore: 0.05,
    resilienceScore: 0.04, diversityScore: 0.02, evidenceScore: 0.04, routeScore: 0.05
  },
  balanced: {
    personaFit: 0.19, intentFit: 0.14, budgetScore: 0.14, daysScore: 0.09,
    avoidScore: 0.10, mapScore: 0.05, communityScore: 0.05,
    resilienceScore: 0.08, diversityScore: 0.03, evidenceScore: 0.04, routeScore: 0.09
  },
  lowCost: {
    personaFit: 0.23, intentFit: 0.09, budgetScore: 0.28, daysScore: 0.09,
    avoidScore: 0.10, mapScore: 0.03, communityScore: 0.03,
    resilienceScore: 0.03, diversityScore: 0.02, evidenceScore: 0.02, routeScore: 0.08
  }
};

/**
 * 计算综合分数
 */
function computeTotalScore(subScores, pathType) {
  const weights = PATH_WEIGHTS[pathType] || PATH_WEIGHTS.balanced;
  let total = 0;
  Object.keys(weights).forEach(key => {
    total += (subScores[key] || 0) * weights[key];
  });
  return round(total, 3);
}

/**
 * 主入口：对城市列表进行多目标评分
 * 返回每个城市的 11 子分数 + 三条路径综合分
 * @param {Object} [weatherData] - 可选的实时天气数据（按 cityId 索引）
 */
function scoreCities(userVector, tripIntent, tripContext, cities, weatherDataMap) {
  return cities.map(city => {
    const wData = weatherDataMap ? weatherDataMap[city.cityId] : undefined;
    const subScores = scoreCity(userVector, tripIntent, tripContext, city, wData);
    return {
      city,
      subScores,
      pathScores: {
        personaBest: computeTotalScore(subScores, 'personaBest'),
        balanced: computeTotalScore(subScores, 'balanced'),
        lowCost: computeTotalScore(subScores, 'lowCost')
      }
    };
  });
}

/**
 * 将预算超过硬上限的城市标记为 lowCost 候选池
 */
function markBudgetViolations(scoredCities, tripContext) {
  const hardMax = tripContext?.budget?.hardMax;
  const days = tripContext?.days || 4;
  if (!hardMax) return scoredCities;

  return scoredCities.map(item => {
    const dailyBudget = item.city.dailyBudget || 500;
    const totalBudget = dailyBudget * days;
    return {
      ...item,
      budgetViolation: totalBudget > hardMax,
      budgetRatio: totalBudget / hardMax
    };
  });
}

module.exports = {
  TRAIT_WEIGHTS,
  scoreCity,
  scoreCities,
  computeTotalScore,
  markBudgetViolations,
  computeRouteScore,
  PATH_WEIGHTS
};
