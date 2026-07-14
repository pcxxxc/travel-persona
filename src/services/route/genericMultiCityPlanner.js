'use strict';

const { getCities, getCityByName } = require('../../data/cityRecords');
const { assessIntercityRoute, getCoordinates, distanceKm, normalizeCityName } = require('./intercityGraph');

const INTEREST_TRAITS = {
  nature: ['nature', 'restoration'],
  oldtown: ['culture', 'authenticity'],
  art: ['aesthetics', 'culture'],
  coffee: ['aesthetics', 'social'],
  food: ['food', 'authenticity'],
  photo: ['aesthetics', 'nature'],
  museum: ['culture', 'weatherFlex'],
  hidden: ['novelty', 'authenticity', 'lowCrowd']
};

const AVOID_RISKS = {
  crowd: 'crowd',
  commercial: 'commercial',
  climb: 'climb',
  early: 'early',
  longTransit: 'longTransit',
  expensive: 'expensive'
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundHalf(value) {
  return Math.round(value * 2) / 2;
}

function traitFit(userVector, city) {
  const keys = Object.keys(city.traitVector || {});
  if (!keys.length) return 0.5;
  const distance = keys.reduce((sum, key) => {
    const userValue = Number.isFinite(userVector?.[key]) ? userVector[key] : 0.5;
    return sum + Math.abs(userValue - Number(city.traitVector[key] || 0.5));
  }, 0) / keys.length;
  return clamp(1 - distance, 0, 1);
}

function interestFit(interests, city) {
  const keys = Array.from(new Set((interests || []).flatMap(item => INTEREST_TRAITS[item] || [])));
  if (!keys.length) return 0.55;
  return keys.reduce((sum, key) => sum + Number(city.traitVector?.[key] || 0.5), 0) / keys.length;
}

function avoidFit(avoids, city) {
  const risks = new Set(city.riskFlags || []);
  const selected = (avoids || []).map(item => AVOID_RISKS[item]).filter(Boolean);
  if (!selected.length) return 0.72;
  const conflicts = selected.filter(item => risks.has(item)).length;
  return clamp(1 - conflicts / selected.length, 0.15, 1);
}

function corridorGeometry(origin, destination, point) {
  const direct = distanceKm(origin, destination);
  if (!Number.isFinite(direct) || direct < 20) return null;
  const detourKm = distanceKm(origin, point) + distanceKm(point, destination) - direct;
  const x = destination.lng - origin.lng;
  const y = destination.lat - origin.lat;
  const denominator = x * x + y * y || 1;
  const progress = ((point.lng - origin.lng) * x + (point.lat - origin.lat) * y) / denominator;
  const side = x * (point.lat - origin.lat) - y * (point.lng - origin.lng);
  return {
    direct,
    detourKm,
    detourRatio: detourKm / direct,
    progress,
    side: Math.sign(side) || 1
  };
}

function buildCandidates(input, originCoordinates, destinationCoordinates) {
  const origin = normalizeCityName(input.origin);
  const destination = normalizeCityName(input.destination);
  const allCandidates = getCities()
    .filter(city => city.name !== origin && city.name !== destination && city.coordinates)
    .map(city => {
      const geometry = corridorGeometry(originCoordinates, destinationCoordinates, city.coordinates);
      if (!geometry) return null;
      const routeFit = clamp(1 - geometry.detourRatio / 1.25, 0, 1);
      const valueFit = clamp(1 - Number(city.dailyBudget || 420) / 1100, 0.25, 0.85);
      const utility = traitFit(input.userVector, city) * 0.28
        + interestFit(input.interests, city) * 0.22
        + avoidFit(input.avoid, city) * 0.14
        + routeFit * 0.24
        + Number(city.transportScore || 0.5) * 0.07
        + valueFit * 0.05;
      return { city, ...geometry, routeFit, utility: round(utility, 4) };
    })
    .filter(Boolean)
    .filter(item => item.progress > 0.05 && item.progress < 0.95)
    .sort((a, b) => b.utility - a.utility || a.detourRatio - b.detourRatio);
  const maxDetourKm = clamp(allCandidates[0]?.direct * 0.22 || 300, 220, 450);
  const corridorCandidates = allCandidates.filter(item => item.detourRatio <= 0.5 && item.detourKm <= maxDetourKm);
  return corridorCandidates.length >= 2
    ? corridorCandidates
    : allCandidates.filter(item => item.detourRatio <= 0.65 && item.detourKm <= maxDetourKm * 1.35);
}

function selectFromSide(candidates, count, side, used) {
  const preferred = candidates.filter(item => item.side === side && !used.has(item.city.name));
  const fallback = candidates.filter(item => !used.has(item.city.name));
  const selected = [];
  for (const candidate of [...preferred, ...fallback]) {
    if (selected.length >= count) break;
    if (used.has(candidate.city.name)) continue;
    selected.push(candidate);
    used.add(candidate.city.name);
  }
  return selected;
}

function selectStops(candidates, count) {
  const used = new Set();
  const positiveStrength = candidates.filter(item => item.side > 0).slice(0, Math.ceil(count / 2))
    .reduce((sum, item) => sum + item.utility, 0);
  const negativeStrength = candidates.filter(item => item.side < 0).slice(0, Math.ceil(count / 2))
    .reduce((sum, item) => sum + item.utility, 0);
  const outboundSide = positiveStrength >= negativeStrength ? 1 : -1;
  const outbound = selectFromSide(candidates, Math.ceil(count / 2), outboundSide, used)
    .sort((a, b) => a.progress - b.progress);
  const returning = selectFromSide(candidates, Math.floor(count / 2), -outboundSide, used)
    .sort((a, b) => b.progress - a.progress);
  return { outbound, returning };
}

function describeCity(candidate, phase) {
  const city = candidate.city;
  const signal = city.bestFor?.[0] || city.intelligence?.whenToUse || '城市体验与路线效率较平衡';
  return `${signal}；在${phase}中承担完整停留，不只作为换乘标签。`;
}

function attachTransport(nodes) {
  return nodes.map((node, index) => {
    if (index === 0) return { ...node, transport: `从${node.city}出发，首日不叠加景点。` };
    const previous = nodes[index - 1];
    if (index === nodes.length - 1) {
      return { ...node, transport: `${previous.city}返回${node.city}；具体车次、到发站和票价按出发日核验。` };
    }
    return { ...node, transport: `${previous.city}到${node.city}按总耗时和少换乘优先；当前为静态路线估算。` };
  });
}

function buildVariant(config, input, candidates, destinationCity) {
  const bufferDays = config.bufferDays;
  const destinationStay = config.destinationStay;
  const activeTarget = Number(input.days) - bufferDays;
  const maxIntermediateStops = Math.max(0, Math.floor((activeTarget - 1 - destinationStay) / config.minimumStay));
  const stopCount = Math.min(config.stopCount, maxIntermediateStops, candidates.length);
  const selected = selectStops(candidates, stopCount);
  const candidateNodes = [
    ...selected.outbound.map(item => ({ candidate: item, phase: '去程', role: '去程完整停留' })),
    { candidate: { city: destinationCity, utility: 1 }, phase: '主目的地', role: '必到主目的地', destination: true },
    ...selected.returning.map(item => ({ candidate: item, phase: '返程', role: '返程完整停留' }))
  ];

  candidateNodes.forEach(item => {
    item.stay = item.destination ? destinationStay : config.minimumStay;
  });
  let assigned = 1 + candidateNodes.reduce((sum, item) => sum + item.stay, 0);
  const priority = [
    ...candidateNodes.filter(item => item.destination),
    ...candidateNodes.filter(item => !item.destination).sort((a, b) => b.candidate.utility - a.candidate.utility)
  ];
  let guard = 0;
  while (activeTarget - assigned >= 0.49 && guard < 200) {
    const target = priority[guard % priority.length];
    const stayExtension = Number(config.stayExtension || 0);
    const stayCeiling = target.destination
      ? Math.max(destinationStay, (Number(destinationCity.maxDays) || 6) + stayExtension)
      : Math.max(config.minimumStay, (Number(target.candidate.city.maxDays) || 3) + stayExtension);
    if (target.stay >= stayCeiling - 0.01) {
      guard += 1;
      continue;
    }
    target.stay = roundHalf(target.stay + 0.5);
    assigned = roundHalf(assigned + 0.5);
    guard += 1;
  }
  const effectiveBufferDays = roundHalf(bufferDays + Math.max(0, activeTarget - assigned));

  const origin = normalizeCityName(input.origin);
  let nodes = [
    { city: origin, stay: 0.5, role: '出发', reason: '第一段只负责进入路线，不把出发日塞满。', coordinates: getCoordinates(origin) },
    ...candidateNodes.map(item => ({
      city: item.candidate.city.name,
      stay: item.stay,
      role: item.role,
      reason: item.destination
        ? `这是你明确要求到达的城市，至少保留 ${item.stay} 天，不把“必到”做成短暂停留。`
        : describeCity(item.candidate, item.phase),
      coordinates: item.candidate.city.coordinates,
      routeUtility: round(item.candidate.utility, 3)
    })),
    { city: origin, stay: 0.5, role: '回家', reason: '最后半天只做返程，不再追加景点。', coordinates: getCoordinates(origin) }
  ];
  nodes = attachTransport(nodes);
  const assessment = assessIntercityRoute(nodes, {
    origin,
    totalDays: Number(input.days),
    bufferDays: effectiveBufferDays,
    totalBudget: input.totalBudget,
    hardMax: input.hardMax
  });
  const geographicDistanceKm = nodes.slice(0, -1).reduce((sum, node, index) => {
    return sum + Number(distanceKm(node.coordinates, nodes[index + 1].coordinates) || 0);
  }, 0);
  const directRoundTripKm = Number(distanceKm(getCoordinates(origin), destinationCity.coordinates) || 0) * 2;
  assessment.geographicDistanceKm = Math.round(geographicDistanceKm);
  assessment.geographicDetourRatio = directRoundTripKm > 0
    ? round(Math.max(0, geographicDistanceKm / directRoundTripKm - 1), 2)
    : null;
  const strategyFit = config.id === 'balanced'
    ? 7
    : config.id === 'steady' && (input.avoid || []).some(item => ['longTransit', 'early'].includes(item))
      ? 3
      : config.id === 'explorer' && input.mood === 'efficient' && Number(input.days) >= 18 ? 2 : 0;

  return {
    id: config.id,
    name: config.name,
    tagline: `${candidateNodes.length} 个停留城市，${config.tagline}`,
    tradeoff: config.tradeoff,
    bufferDays: effectiveBufferDays,
    activeDays: roundHalf(assigned),
    totalDays: Number(input.days),
    nodes,
    routeAssessment: assessment,
    valueScore: assessment.scores.value,
    efficiencyScore: assessment.scores.efficiency,
    moveCount: assessment.moveCount,
    costRange: assessment.costRange,
    budgetStatus: assessment.budgetStatus,
    selectionScore: assessment.scores.overall + strategyFit - Number(assessment.geographicDetourRatio || 0) * 8
  };
}

function buildGenericRouteExperiment(input = {}) {
  const origin = normalizeCityName(input.origin);
  const destination = normalizeCityName(input.destination);
  const originCoordinates = getCoordinates(origin);
  const destinationCity = getCityByName(destination);
  const destinationCoordinates = destinationCity?.coordinates || getCoordinates(destination);
  const days = clamp(Number(input.days) || 14, 10, 21);
  if (!origin || !destination || origin === destination || !originCoordinates || !destinationCity || !destinationCoordinates) return null;

  const normalizedInput = { ...input, origin, destination, days };
  const candidates = buildCandidates(normalizedInput, originCoordinates, destinationCoordinates);
  if (candidates.length < 2) return null;
  const countByDays = days <= 14
    ? { steady: 2, balanced: 4, explorer: 6 }
    : days <= 18
      ? { steady: 3, balanced: 5, explorer: 7 }
      : { steady: 4, balanced: 6, explorer: 8 };
  const explorerCount = Math.min(countByDays.explorer, candidates.length);
  const steadyCount = Math.max(1, Math.min(countByDays.steady, Math.max(1, explorerCount - 2)));
  const balancedCount = Math.min(
    explorerCount,
    Math.max(steadyCount + 1, Math.min(countByDays.balanced, Math.max(steadyCount + 1, explorerCount - 1)))
  );
  const explorerAddsCity = explorerCount > balancedCount;
  const configs = [
    {
      id: 'steady', name: '少搬行李版', stopCount: steadyCount,
      bufferDays: 2, destinationStay: 4.5, minimumStay: 1.5, stayExtension: 2,
      tagline: '留出恢复和误点空间',
      tradeoff: '城市更少，每站更完整；适合不想把长假过成连续退房。'
    },
    {
      id: 'balanced', name: '平衡高效版', stopCount: balancedCount,
      bufferDays: 1.5, destinationStay: 4, minimumStay: 1.5, stayExtension: 1,
      tagline: '在城市数量与完整体验之间取平衡',
      tradeoff: '去程和返程各有内容，同时保留至少一天半机动。'
    },
    {
      id: 'explorer', name: explorerAddsCity ? '尽量多城版' : '少留白版', stopCount: explorerCount,
      bufferDays: 0.5, destinationStay: 3.5, minimumStay: 1, stayExtension: 0.5,
      tagline: explorerAddsCity ? '接近本次天数的换城上限' : '顺路城市已到上限，把机动时间换成更长停留',
      tradeoff: explorerAddsCity
        ? '城市更多，但住宿切换和静态交通估算也更多；实时核验失败时应立即切回平衡版。'
        : '不为了凑城市绕路，把时间留给已选站；代价是天气和误点缓冲更少。'
    }
  ];
  const variants = configs.map(config => {
    const boundedConfig = { ...config };
    const minimumStops = config.id === 'explorer'
      ? balancedCount
      : config.id === 'balanced' ? steadyCount : 1;
    let variant = buildVariant(boundedConfig, normalizedInput, candidates, destinationCity);
    while (
      Number(variant.routeAssessment.geographicDetourRatio || 0) > 0.45
      && boundedConfig.stopCount > minimumStops
    ) {
      boundedConfig.stopCount -= 1;
      variant = buildVariant(boundedConfig, normalizedInput, candidates, destinationCity);
    }
    if (config.id === 'explorer' && boundedConfig.stopCount <= balancedCount) {
      boundedConfig.name = '少留白版';
      boundedConfig.tagline = '顺路城市已到上限，把机动时间换成更长停留';
      boundedConfig.tradeoff = '不为了凑城市绕路，把时间留给已选站；代价是天气和误点缓冲更少。';
      variant = buildVariant(boundedConfig, normalizedInput, candidates, destinationCity);
    }
    return variant;
  });
  const primary = [...variants].sort((a, b) => b.selectionScore - a.selectionScore)[0] || variants[0];
  variants.forEach(variant => { variant.recommended = variant.id === primary.id; });

  const expensiveCities = [...new Set(primary.nodes
    .map(node => getCityByName(node.city))
    .filter(city => city && city.name !== origin && city.name !== destination)
    .sort((a, b) => b.dailyBudget - a.dailyBudget)
    .slice(0, 2)
    .map(city => city.name))];
  return {
    title: `${destination}必须到，往返有三种节奏`,
    summary: '三条路线都保留必到城市，并把去程、返程、预算和换酒店成本放在同一个判断里。',
    origin,
    destination,
    totalDays: days,
    routeModel: 'generic-corridor-v2',
    selectedVariantId: primary.id,
    budgetModel: {
      daily: Number(input.budget) || 360,
      totalBudget: Number(input.totalBudget) || 0,
      hardMax: Number(input.hardMax) || null,
      hotelStrategy: expensiveCities.length
        ? `${expensiveCities.join('、')}优先住地铁或公共交通沿线，不为景区门口溢价。`
        : '优先住公共交通沿线，避免为景区门口溢价。'
    },
    variants,
    primary,
    redFlags: [
      '通用路线中的距离估算不是车次承诺；填写出发日后应优先完成地图与跨城交通核验。',
      '连续两段超过 5.5 小时，下一站必须至少住两晚，否则旅程会退化成换乘清单。',
      '必到城市的住宿和预约优先锁定，再倒推前后停留。'
    ],
    cutPlan: [
      '先删只住 1 晚、且与前后体验重复的城市。',
      expensiveCities.length ? `预算变紧时，先检查 ${expensiveCities.join('、')} 的住宿段，不动必到城市。` : '预算变紧时，先压缩住宿溢价，不动必到城市。',
      '任一关键交通段无法核验时，直接切到少搬行李版，不重新推翻整趟计划。'
    ]
  };
}

module.exports = {
  buildGenericRouteExperiment,
  buildCandidates,
  selectStops,
  traitFit,
  interestFit,
  avoidFit
};
