'use strict';

const { INTERCITY_CONNECTIONS } = require('../../data/intercityConnections');
const { getCityByName } = require('../../data/cityRecords');

const CITY_ALIASES = {
  '北京市': '北京', '南京市': '南京', '杭州市': '杭州', '广州市': '广州',
  '长沙市': '长沙', '武汉市': '武汉', '洛阳市': '洛阳', '济南市': '济南',
  '泉州市': '泉州', '茂名市': '茂名'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundHundred(value) {
  return Math.max(0, Math.round(value / 100) * 100);
}

function roundTen(value) {
  return Math.max(0, Math.round(value / 10) * 10);
}

function normalizeCityName(value) {
  const name = String(value || '').trim();
  return CITY_ALIASES[name] || name.replace(/市$/, '');
}

function connectionKey(from, to) {
  return [normalizeCityName(from), normalizeCityName(to)].sort((a, b) => a.localeCompare(b, 'zh-CN')).join('|');
}

const CONNECTION_INDEX = new Map(
  INTERCITY_CONNECTIONS.map(item => [connectionKey(item.from, item.to), item])
);

function getConnection(from, to) {
  const baseline = CONNECTION_INDEX.get(connectionKey(from, to));
  if (!baseline) return null;
  const reversed = normalizeCityName(baseline.from) !== normalizeCityName(from);
  return {
    ...baseline,
    from: normalizeCityName(from),
    to: normalizeCityName(to),
    reversed
  };
}

const SUPPLEMENTAL_COORDINATES = {
  '茂名': { lat: 21.6627, lng: 110.9255 }
};

function getCoordinates(cityName) {
  const normalized = normalizeCityName(cityName);
  return getCityByName(normalized)?.coordinates || SUPPLEMENTAL_COORDINATES[normalized] || null;
}

function distanceKm(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return null;
  const toRad = value => value * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function buildEstimatedConnection(from, to) {
  const normalizedFrom = normalizeCityName(from);
  const normalizedTo = normalizeCityName(to);
  const fromCoordinates = getCoordinates(normalizedFrom);
  const toCoordinates = getCoordinates(normalizedTo);
  const distance = distanceKm(fromCoordinates, toCoordinates);
  if (!Number.isFinite(distance)) return null;

  const fromCity = getCityByName(normalizedFrom);
  const toCity = getCityByName(normalizedTo);
  const transportValues = [fromCity?.transportScore, toCity?.transportScore].filter(Number.isFinite);
  const transportEase = transportValues.length
    ? transportValues.reduce((sum, value) => sum + value, 0) / transportValues.length
    : 0.58;
  const transfers = distance <= 350 || (distance <= 900 && transportEase >= 0.72) ? 0 : 1;
  const durationMin = Math.max(1, distance / 235 + 0.7 + transfers * 0.6);
  const durationMax = Math.max(durationMin + 0.6, distance / 135 + 1.6 + transfers * 1.2);
  const confidence = clamp(0.34 + transportEase * 0.16 - Math.max(0, distance - 1200) / 6000, 0.28, 0.5);

  return {
    from: normalizedFrom,
    to: normalizedTo,
    mode: 'rail-estimate',
    estimated: true,
    distanceKm: Math.round(distance),
    durationHours: { min: round(durationMin), max: round(durationMax) },
    fareCny: {
      min: roundTen(Math.max(40, distance * 0.24)),
      max: roundTen(Math.max(120, distance * 0.62))
    },
    transfers,
    frequency: 'unverified',
    confidence: round(confidence, 2),
    requiresLiveCheck: true,
    note: '基于城市间距离和交通便利度的保守估算，不代表真实车次；出发前必须按日期核验。',
    sourceRefs: [{ type: 'distanceEstimate', source: '旅格通用路线模型', date: '2026-07-13' }]
  };
}

function buildUnknownConnection(from, to) {
  return {
    from: normalizeCityName(from),
    to: normalizeCityName(to),
    mode: 'unknown',
    durationHours: { min: 4, max: 9 },
    fareCny: { min: 200, max: 650 },
    transfers: 1,
    frequency: 'unknown',
    confidence: 0.24,
    requiresLiveCheck: true,
    note: '当前缺少可靠的跨城基线，必须先完成地图或票务核验。',
    sourceRefs: []
  };
}

function assessIntercityRoute(nodes, options = {}) {
  const routeNodes = Array.isArray(nodes) ? nodes : [];
  const origin = normalizeCityName(options.origin || routeNodes[0]?.city);
  const bufferDays = Number(options.bufferDays) || 0;
  const totalDays = Number(options.totalDays) || routeNodes.reduce((sum, item) => sum + (Number(item.stay) || 0), 0) + bufferDays;
  const legs = [];

  for (let index = 0; index < routeNodes.length - 1; index += 1) {
    const from = routeNodes[index].city;
    const to = routeNodes[index + 1].city;
    const baseline = getConnection(from, to) || buildEstimatedConnection(from, to) || buildUnknownConnection(from, to);
    legs.push({ ...baseline, index });
  }

  const totals = legs.reduce((summary, leg) => {
    summary.durationMin += leg.durationHours.min;
    summary.durationMax += leg.durationHours.max;
    summary.fareMin += leg.fareCny.min;
    summary.fareMax += leg.fareCny.max;
    summary.transfers += leg.transfers;
    summary.longLegs += leg.durationHours.max >= 5.5 ? 1 : 0;
    summary.unknownLegs += leg.mode === 'unknown' ? 1 : 0;
    summary.estimatedLegs += leg.estimated ? 1 : 0;
    summary.confidence += leg.confidence;
    return summary;
  }, { durationMin: 0, durationMax: 0, fareMin: 0, fareMax: 0, transfers: 0, longLegs: 0, unknownLegs: 0, estimatedLegs: 0, confidence: 0 });

  const stayNodes = routeNodes.filter(item => normalizeCityName(item.city) !== origin && Number(item.stay) > 0);
  const localBaseCost = stayNodes.reduce((sum, item) => {
    const city = getCityByName(normalizeCityName(item.city));
    return sum + (city?.dailyBudget || 360) * Number(item.stay);
  }, 0);
  const oneNightStops = stayNodes.filter(item => Number(item.stay) <= 1).length;
  const averageStay = stayNodes.length
    ? stayNodes.reduce((sum, item) => sum + Number(item.stay), 0) / stayNodes.length
    : 0;
  const costRange = {
    min: roundHundred(localBaseCost * 0.86 + totals.fareMin),
    max: roundHundred(localBaseCost * 1.18 + totals.fareMax)
  };
  const midpointCost = (costRange.min + costRange.max) / 2;
  const budgetCeiling = Number(options.hardMax) || Number(options.totalBudget) || 0;
  const budgetFitScore = !budgetCeiling
    ? 72
    : costRange.max <= budgetCeiling
      ? 96
      : costRange.min > budgetCeiling
        ? clamp(78 - ((costRange.min - budgetCeiling) / budgetCeiling) * 120, 25, 72)
        : 74;

  const efficiencyScore = clamp(
    100 - ((totals.durationMin + totals.durationMax) / 2) * 0.45
      - totals.transfers * 2.5 - totals.longLegs * 2 - oneNightStops * 1.5
      + Math.min(averageStay, 3) * 2,
    35,
    96
  );
  const valueScore = clamp(104 - (midpointCost / Math.max(totalDays, 1)) / 30, 35, 96);
  const resilienceScore = clamp(72 + bufferDays * 8 - totals.longLegs * 3 - totals.transfers - totals.unknownLegs * 12, 25, 96);
  const integrityScore = clamp(100 - oneNightStops * 7 - Math.max(0, legs.length - 8) * 3, 35, 98);
  const coverageScore = clamp(62 + stayNodes.length * 4, 62, 98);
  const overallScore = efficiencyScore * 0.2 + valueScore * 0.18 + budgetFitScore * 0.2
    + resilienceScore * 0.18 + integrityScore * 0.14 + coverageScore * 0.1;
  const dataConfidence = legs.length ? totals.confidence / legs.length : 0;

  let budgetStatus = '待填写预算上限';
  if (budgetCeiling) {
    budgetStatus = costRange.max <= budgetCeiling
      ? '在预算上限内'
      : costRange.min > budgetCeiling
        ? '预计超过上限'
        : '需要压缩或实时比价';
  }

  return {
    legs,
    moveCount: legs.length,
    transportHours: { min: round(totals.durationMin), max: round(totals.durationMax) },
    transportFare: { min: roundHundred(totals.fareMin), max: roundHundred(totals.fareMax) },
    transfers: totals.transfers,
    longLegs: totals.longLegs,
    unknownLegs: totals.unknownLegs,
    estimatedLegs: totals.estimatedLegs,
    localBaseCost: roundHundred(localBaseCost),
    costRange,
    budgetStatus,
    dataConfidence: round(dataConfidence, 2),
    source: totals.unknownLegs > 0
      ? 'incomplete'
      : totals.estimatedLegs > 0 ? 'distance-estimate' : 'static-baseline',
    oneNightStops,
    averageStay: round(averageStay),
    scores: {
      overall: Math.round(overallScore),
      efficiency: Math.round(efficiencyScore),
      value: Math.round(valueScore),
      budgetFit: Math.round(budgetFitScore),
      resilience: Math.round(resilienceScore),
      integrity: Math.round(integrityScore),
      coverage: Math.round(coverageScore)
    }
  };
}

module.exports = {
  assessIntercityRoute,
  connectionKey,
  getConnection,
  buildEstimatedConnection,
  getCoordinates,
  distanceKm,
  normalizeCityName
};
