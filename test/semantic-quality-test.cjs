'use strict';

const assert = require('assert');
const { buildFinalVector, classifyPersona, inferAvoidsFromFreeText } = require('../src/engines/personaEngine');
const { computeRouteScore, scoreCity } = require('../src/engines/multiObjectiveScorer');
const { diversifyAcrossPaths } = require('../src/engines/mmrReranker');
const { getCities } = require('../src/data/cityRecords');
const { generatePlan } = require('../src/engines/pipeline');
const { validateCityRecord, checkDataFreshness } = require('../src/services/dataQuality');

async function run() {
  const inferred = inferAvoidsFromFreeText('不想把时间浪费在排队和长途换乘上');
  assert(inferred.includes('crowd'), '应从自由文本识别排队规避');
  assert(inferred.includes('longTransit'), '应从自由文本识别长途换乘规避');

  const cities = getCities();
  assert.strictEqual(cities.length, 32, '首发青年旅行候选库固定为 32 座可分析城市');
  const expansionIds = ['tianjin', 'yangzhou', 'fuzhou', 'guilin', 'xining', 'harbin', 'urumqi', 'taiyuan', 'shenyang', 'changchun', 'nanchang'];
  const expandedCities = expansionIds.map(id => cities.find(city => city.id === id));
  assert(expandedCities.every(Boolean), '2026 Q3 扩展城市必须全部进入统一推荐库');
  assert(
    expandedCities.every(city => city.dataCohort === '2026-q3-expansion' && city.pois.length >= 4),
    '扩展城市必须标记数据批次并保留至少 4 个可排行地点'
  );
  assert(
    expandedCities.every(city => city.sourceRefs.some(ref => ref.url) && city.pois.every(poi => poi.coordinateSourceUrl && poi.coordinateVerifiedAt)),
    '扩展城市和地点必须保留可追溯来源与坐标核验日期'
  );
  const invalidCities = cities
    .map(city => ({ city, validation: validateCityRecord(city) }))
    .filter(item => !item.validation.valid);
  assert.deepStrictEqual(
    invalidCities.map(item => `${item.city.name}: ${item.validation.issues.join('；')}`),
    [],
    '所有参与推荐的城市都必须通过完整数据校验'
  );
  assert(
    cities.every(city => checkDataFreshness(city).fresh),
    '所有参与推荐的城市都必须在数据新鲜度窗口内'
  );
  const scopedPois = cities.flatMap(city => city.pois || []).filter(poi => poi.coordinateScope === 'representative');
  assert(scopedPois.length >= 5, '道路、街区与保护区等范围地点必须保留代表点语义');
  assert(
    scopedPois.every(poi => poi.coordinateNote && poi.coordinateSourceUrl),
    '范围地点必须说明代表范围并保留坐标来源'
  );
  const suzhou = cities.find(city => city.id === 'suzhou');
  const chengdu = cities.find(city => city.id === 'chengdu');
  const routeContext = {
    origin: '上海',
    originCoordinates: { lat: 31.2304, lng: 121.4737 },
    days: 3
  };
  assert(
    computeRouteScore(routeContext, suzhou) > computeRouteScore(routeContext, chengdu) + 0.2,
    '短途推荐应显著偏好更近的目的地'
  );

  const avoidEarlyScore = scoreCity(
    Object.fromEntries(Object.keys(suzhou.traitVector).map(key => [key, 0.5])),
    { mood: 'efficient', avoid: ['early'] },
    { days: 4, budget: {} },
    cities.find(city => city.id === 'nanjing')
  ).avoidScore;
  assert(avoidEarlyScore <= 0.55, '明确避开早起时，早起风险城市必须被明显降权');

  const candidate = (id, cluster, score) => ({
    city: { id, cityId: id, cluster },
    pathScores: { personaBest: score, balanced: score, lowCost: score }
  });
  const diversified = diversifyAcrossPaths({
    personaBest: [candidate('a', 'x', 0.9), candidate('b', 'y', 0.8)],
    balanced: [candidate('a', 'x', 0.91), candidate('b', 'y', 0.89)],
    lowCost: [candidate('b', 'y', 0.92), candidate('c', 'z', 0.86)]
  });
  const topIds = Object.values(diversified).map(items => items[0].city.id);
  assert.strictEqual(new Set(topIds).size, topIds.length, '三条决策路径有备选时不应重复同一城市');

  const vector = buildFinalVector(null, {
    mood: 'inspire',
    interests: ['oldtown', 'art', 'coffee'],
    avoid: ['crowd']
  }, { days: 4, budget: { hardMax: 3200 } }).vector;
  const classification = classifyPersona(vector);
  assert(classification.primary && classification.secondary, '冷启动也应返回主次人格摘要');
  assert(classification.confidence < 0.65, '一次冷启动采样不应表现出过高置信度');

  const result = await generatePlan({
    personaProfile: null,
    tripIntent: {
      mood: 'efficient',
      interests: ['art', 'coffee', 'oldtown'],
      avoid: ['crowd', 'early'],
      freeText: '不想长途换乘，也不想排队'
    },
    tripContext: {
      origin: '上海',
      days: 4,
      budget: { comfort: 2400, hardMax: 3400 }
    }
  });
  assert(result.personaSnapshot.primaryPersona, '规划响应必须包含真实人格摘要');
  const resultIds = result.decisionPaths.map(path => path.city.cityId || path.city.id);
  assert.strictEqual(new Set(resultIds).size, resultIds.length, '推荐结果的三条路径不应重复城市');
  const balancedPath = result.decisionPaths.find(path => path.type === 'balanced');
  const balancedRecord = cities.find(city => city.id === (balancedPath.city.cityId || balancedPath.city.id));
  assert(!balancedRecord.riskFlags.includes('early'), '现实平衡方案不得直接违反用户明确避雷项');
  assert(cities.every(city => !('_adjustedVector' in city)), '管线不得污染共享城市数据对象');

  const longRoute = await generatePlan({
    personaProfile: null,
    tripIntent: {
      mood: 'efficient',
      interests: ['oldtown', 'museum', 'food'],
      avoid: ['expensive', 'longTransit', 'early'],
      destination: '北京',
      freeText: '从茂名去北京，返程想顺路多玩几个城市，控制预算。'
    },
    tripContext: {
      origin: '茂名',
      days: 18,
      budget: { comfort: 6200, hardMax: 8500 }
    }
  });
  assert(longRoute.multiCityPlan, '茂名到北京的两三周请求应进入多城路线模式');
  const routeNames = longRoute.multiCityPlan.primary.nodes.map(node => node.city).join(' → ');
  assert(routeNames.includes('茂名') && routeNames.includes('北京'), '多城路线必须保留出发地与必达目的地');
  assert(longRoute.multiCityPlan.totalDays >= 14 && longRoute.multiCityPlan.totalDays <= 21, '多城路线必须落在用户时长内');

  console.log('语义质量门禁通过：自由文本降级、路线距离、避雷、人格置信度和跨路径去重均正常。');
}

run().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
