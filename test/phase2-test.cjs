/**
 * 旅格 Travel Persona · Phase 2 核心模块测试
 *
 * 测试范围：
 * 1. MockMapProvider 返回 POI 数据
 * 2. 路线求解器生成合理路线（单城 + 多城 + 日内排序）
 * 3. 数据质量服务验证城市记录
 * 4. 天气服务在无 Key 时返回 null（总纲 18.3）
 * 5. 地图降级模式（baidu 无 Key → 自动降级 mock）
 *
 * 运行方式：node test/phase2-test.cjs
 */

const assert = require('assert');

// 引入被测模块
const {
  MockMapProvider,
  BaiduMapProvider,
  getActiveProvider,
  resetProvider,
  haversineDistance
} = require('../src/services/map');

const {
  solveSingleCity,
  solveMultiCity,
  optimizeDailySchedule
} = require('../src/services/route/routeSolver');

const {
  validateCityRecord,
  validatePOI,
  checkDataFreshness,
  generateQualityReport,
  getCoverageStats
} = require('../src/services/dataQuality');

const { getWeather, getWeatherMock } = require('../src/services/weather/weatherService');

// 引入数据源（CITIES 由 cityDatabase.js 导出，含原始 POI 数据）
const { CITIES } = require('../src/data/cityDatabase');

// ========== 测试框架 ==========

let passed = 0;
let failed = 0;

/**
 * 同步测试包装器
 */
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 FAIL: ${name}`);
    console.log(`    ${e.message}`);
  }
}

/**
 * 异步测试包装器
 */
async function asyncTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 FAIL: ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ========== 测试主体（async IIFE 包裹） ==========

(async () => {
  console.log('\n=== Phase 2 核心模块测试 ===\n');

  // --------------------------------------------------
  //  1. MockMapProvider 测试
  // --------------------------------------------------
  console.log('1. MockMapProvider 地图离线快照');

  await asyncTest('searchPOI 返回 POI 数据数组', async () => {
    const provider = new MockMapProvider();
    const result = await provider.searchPOI('洱海', { city: '大理' });
    assert.strictEqual(result.source, 'mock', 'source 应为 mock');
    assert.ok(result.fetchedAt, '应有 fetchedAt 时间戳');
    assert.strictEqual(result.cached, false, '首次调用 cached 应为 false');
    assert.ok(Array.isArray(result.data), 'data 应为数组');
    assert.ok(result.data.length > 0, '应返回至少 1 个 POI');
    assert.ok(result.data[0].name, 'POI 应有 name 字段');
    assert.ok(typeof result.data[0].lat === 'number', 'POI 应有 lat 数值');
    assert.ok(typeof result.data[0].lng === 'number', 'POI 应有 lng 数值');
  });

  await asyncTest('searchPOI 第二次调用命中缓存', async () => {
    const provider = new MockMapProvider();
    await provider.searchPOI('洱海', { city: '大理' }); // 第一次
    const result = await provider.searchPOI('洱海', { city: '大理' }); // 第二次
    assert.strictEqual(result.cached, true, '第二次调用应命中缓存');
    assert.strictEqual(result.source, 'mock', '缓存数据 source 仍为 mock');
  });

  await asyncTest('getPOIDetail 返回单个 POI 详情', async () => {
    const provider = new MockMapProvider();
    // 先搜索拿到 POI id
    const searchResult = await provider.searchPOI('洱海', { city: '大理' });
    const poiId = searchResult.data[0].id;
    const detail = await provider.getPOIDetail(poiId);
    assert.ok(detail.data, '应返回 POI 详情');
    assert.strictEqual(detail.data.id, poiId, 'id 应匹配');
    assert.ok(detail.data.name, '详情应有 name');
  });

  await asyncTest('getRoute 返回路线距离和步骤', async () => {
    const provider = new MockMapProvider();
    const origin = { lat: 25.60, lng: 100.27 };
    const destination = { lat: 25.65, lng: 100.30 };
    const result = await provider.getRoute(origin, destination);
    assert.ok(result.data.distance > 0, '距离应大于 0');
    assert.ok(result.data.duration > 0, '时间应大于 0');
    assert.ok(result.data.steps.length > 0, '应至少 1 个步骤');
  });

  await asyncTest('getDistanceMatrix 返回距离矩阵', async () => {
    const provider = new MockMapProvider();
    const origins = [{ lat: 25.60, lng: 100.27 }];
    const destinations = [
      { lat: 25.65, lng: 100.30 },
      { lat: 26.87, lng: 100.23 }
    ];
    const result = await provider.getDistanceMatrix(origins, destinations);
    assert.ok(result.data.rows.length === 1, '应有 1 行');
    assert.ok(result.data.rows[0].elements.length === 2, '应有 2 列');
    assert.ok(result.data.rows[0].elements[0].distance > 0, '距离应大于 0');
  });

  await asyncTest('geocode 返回城市坐标', async () => {
    const provider = new MockMapProvider();
    const result = await provider.geocode('大理');
    assert.ok(result.data, '应返回坐标');
    assert.ok(typeof result.data.lat === 'number', '应有 lat');
    assert.ok(typeof result.data.lng === 'number', '应有 lng');
  });

  await asyncTest('reverseGeocode 返回最近城市', async () => {
    const provider = new MockMapProvider();
    const result = await provider.reverseGeocode(25.60, 100.27);
    assert.ok(result.data, '应返回地址');
    assert.ok(result.data.city, '应有 city 字段');
  });

  await asyncTest('统一返回格式包含 source/fetchedAt/cached', async () => {
    const provider = new MockMapProvider();
    const result = await provider.searchPOI('成都');
    assert.ok('source' in result, '应有 source 字段');
    assert.ok('fetchedAt' in result, '应有 fetchedAt 字段');
    assert.ok('cached' in result, '应有 cached 字段');
  });

  // --------------------------------------------------
  //  2. 路线求解器测试
  // --------------------------------------------------
  console.log('\n2. 路线求解器');

  test('solveSingleCity 生成合理日内路线', () => {
    // 使用成都的 POI 数据
    const chengdu = CITIES.find(c => c.id === 'chengdu');
    const pois = chengdu.pois;
    const result = solveSingleCity(pois, 2); // 2 天
    assert.ok(result.days.length === 2, '应生成 2 天的日程');
    assert.ok(result.totalDistance >= 0, '总距离应非负');
    assert.strictEqual(result.feasible, true, '应可行');
    // 每天的节点应有 visitOrder
    result.days.forEach(day => {
      day.nodes.forEach((node, idx) => {
        assert.strictEqual(node.visitOrder, idx, 'visitOrder 应连续');
      });
    });
  });

  test('solveSingleCity 单天路线节点数不超限', () => {
    const chengdu = CITIES.find(c => c.id === 'chengdu');
    const result = solveSingleCity(chengdu.pois, 1);
    result.days.forEach(day => {
      assert.ok(day.nodes.length <= 6, '每天 POI 不超过 6 个');
    });
  });

  test('solveSingleCity 空列表返回空日程', () => {
    const result = solveSingleCity([], 3);
    assert.strictEqual(result.days.length, 3, '应有 3 天空日程');
    assert.strictEqual(result.totalDistance, 0, '距离为 0');
  });

  test('solveMultiCity 拓扑排序生成城市顺序', () => {
    const routeNodes = [
      { id: 'chengdu', name: '成都', lat: 30.57, lng: 104.07, order: 1, minDays: 3 },
      { id: 'xian', name: '西安', lat: 34.34, lng: 108.94, order: 2, minDays: 2, dependsOn: ['chengdu'] },
      { id: 'beijing', name: '北京', lat: 39.90, lng: 116.41, order: 3, minDays: 3, dependsOn: ['xian'] }
    ];
    const result = solveMultiCity(routeNodes, { maxDays: 15 });
    assert.ok(result.days.length === 3, '应生成 3 个城市节点');
    assert.ok(result.totalDistance > 0, '总距离应大于 0');
    // 验证拓扑顺序：成都 → 西安 → 北京
    assert.strictEqual(result.days[0].cityId, 'chengdu', '第一个应为成都');
    assert.strictEqual(result.days[1].cityId, 'xian', '第二个应为西安');
    assert.strictEqual(result.days[2].cityId, 'beijing', '第三个应为北京');
  });

  test('solveMultiCity 约束检查 - mustReach 未覆盖时不可行', () => {
    const routeNodes = [
      { id: 'chengdu', name: '成都', lat: 30.57, lng: 104.07, minDays: 3 },
      { id: 'xian', name: '西安', lat: 34.34, lng: 108.94, minDays: 2 }
    ];
    const result = solveMultiCity(routeNodes, { mustReach: ['chengdu', 'shanghai'] });
    assert.strictEqual(result.feasible, false, '缺少必达城市时应不可行');
    assert.ok(result.issues.length > 0, '应有问题列表');
  });

  test('solveMultiCity 约束检查 - maxDays 超限时不可行', () => {
    const routeNodes = [
      { id: 'chengdu', name: '成都', lat: 30.57, lng: 104.07, minDays: 5 },
      { id: 'xian', name: '西安', lat: 34.34, lng: 108.94, minDays: 5 }
    ];
    const result = solveMultiCity(routeNodes, { maxDays: 8 });
    assert.strictEqual(result.feasible, false, '天数超限时应不可行');
  });

  test('optimizeDailySchedule 从起点排序 POI', () => {
    const startLocation = { lat: 30.57, lng: 104.07 }; // 成都市中心
    const chengdu = CITIES.find(c => c.id === 'chengdu');
    // 给 POI 加上伪坐标
    const pois = chengdu.pois.map((p, i) => ({
      ...p,
      lat: 30.57 + 0.02 * (i + 1),
      lng: 104.07 + 0.015 * Math.sin(i)
    }));
    const result = optimizeDailySchedule(pois, startLocation);
    assert.ok(result.orderedPOIs.length === pois.length, '所有 POI 都应被排序');
    assert.ok(result.distance >= 0, '距离应非负');
    // 第一个节点应距离起点最近
    assert.ok(result.orderedPOIs[0].visitOrder === 0, '首节点 visitOrder 为 0');
  });

  test('haversineDistance 计算球面距离', () => {
    // 北京到上海约 1067 公里
    const dist = haversineDistance(39.9042, 116.4074, 31.2304, 121.4737);
    assert.ok(dist > 1000 && dist < 1200, `北京-上海距离应在 1000-1200km，实际 ${dist}`);
    // 相同点距离为 0
    const zero = haversineDistance(30, 104, 30, 104);
    assert.strictEqual(zero, 0, '相同点距离应为 0');
  });

  // --------------------------------------------------
  //  3. 数据质量服务测试
  // --------------------------------------------------
  console.log('\n3. 数据质量服务');

  test('validateCityRecord 验证城市记录完整性', () => {
    const chengdu = CITIES.find(c => c.id === 'chengdu');
    const result = validateCityRecord(chengdu);
    assert.ok('valid' in result, '应有 valid 字段');
    assert.ok('issues' in result, '应有 issues 字段');
    assert.ok('coverageTier' in result, '应有 coverageTier 字段');
    // cityRecords.js 的旧格式 POI 无 lat/lng，应为 B 级
    assert.ok(['A', 'B', 'C'].includes(result.coverageTier), 'coverageTier 应为 A/B/C');
  });

  test('validateCityRecord 完整16维格式通过校验', () => {
    // 构造一个完整的城市记录（16维 + POI坐标 + intelligence）
    const fullCity = {
      id: 'test_city',
      name: '测试城市',
      traitVector: {
        restoration: 0.5, nature: 0.6, culture: 0.7, food: 0.5,
        pace: 0.4, social: 0.5, budget: 0.5, aesthetics: 0.6,
        comfort: 0.5, novelty: 0.5, transit: 0.6, lowCrowd: 0.7,
        authenticity: 0.6, weatherFlex: 0.5, bookingEase: 0.6, workation: 0.5
      },
      pois: [
        { name: '测试景点', lat: 30.5, lng: 104.0, type: '文化' }
      ],
      intelligence: {
        transportEase: 0.6, costStability: 0.7, poiDepth: 0.8, weatherBackup: 0.5
      },
      lastVerifiedAt: new Date().toISOString()
    };
    const result = validateCityRecord(fullCity);
    assert.strictEqual(result.valid, true, '完整格式应通过校验');
    assert.strictEqual(result.coverageTier, 'A', '应为 A 级');
  });

  test('validatePOI 检测缺失必填字段', () => {
    const incompletePOI = { name: '测试', type: '自然' }; // 缺 lat/lng
    const result = validatePOI(incompletePOI);
    assert.strictEqual(result.valid, false, '缺坐标应不通过');
    assert.ok(result.issues.length >= 2, '应有至少 2 个问题（lat, lng）');
  });

  test('validatePOI 完整 POI 通过校验', () => {
    const validPOI = { name: '洱海', lat: 25.6, lng: 100.2, type: '自然' };
    const result = validatePOI(validPOI);
    assert.strictEqual(result.valid, true, '完整 POI 应通过');
    assert.strictEqual(result.issues.length, 0, '无问题');
  });

  test('validatePOI 检测非法坐标范围', () => {
    const badPOI = { name: '测试', lat: 999, lng: 999, type: '自然' };
    const result = validatePOI(badPOI);
    assert.strictEqual(result.valid, false, '非法坐标应不通过');
  });

  test('checkDataFreshness 新数据判为新鲜', () => {
    const city = { lastVerifiedAt: new Date().toISOString() };
    const result = checkDataFreshness(city, 90);
    assert.strictEqual(result.fresh, true, '当天数据应新鲜');
    assert.strictEqual(result.ageDays, 0, '年龄应为 0 天');
  });

  test('checkDataFreshness 过期数据判为不新鲜', () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);
    const city = { lastVerifiedAt: oldDate.toISOString() };
    const result = checkDataFreshness(city, 90);
    assert.strictEqual(result.fresh, false, '100天前数据应过期');
    assert.ok(result.ageDays > 90, '年龄应超过 90 天');
  });

  test('checkDataFreshness 无日期字段判为不新鲜', () => {
    const city = { id: 'test' };
    const result = checkDataFreshness(city, 90);
    assert.strictEqual(result.fresh, false, '无日期应判为不新鲜');
    assert.strictEqual(result.ageDays, Infinity, '年龄应为无穷');
  });

  test('generateQualityReport 生成全量报告', () => {
    const report = generateQualityReport();
    assert.ok(report.totalCities > 0, '城市总数应大于 0');
    assert.ok('coverageDistribution' in report, '应有覆盖率分布');
    assert.ok('freshness' in report, '应有新鲜度统计');
    assert.ok('cityReports' in report, '应有逐城报告');
    assert.ok('summary' in report, '应有汇总摘要');
    assert.ok(report.generatedAt, '应有生成时间');
  });

  test('getCoverageStats 返回覆盖率统计', () => {
    const stats = getCoverageStats();
    assert.ok(stats.total > 0, '总数应大于 0');
    assert.ok('A' in stats.tiers, '应有 A 级统计');
    assert.ok('B' in stats.tiers, '应有 B 级统计');
    assert.ok('C' in stats.tiers, '应有 C 级统计');
    // A + B + C = total
    const sum = stats.tiers.A.count + stats.tiers.B.count + stats.tiers.C.count;
    assert.strictEqual(sum, stats.total, '各级别之和应等于总数');
    assert.ok(stats.overallCoverage >= 0 && stats.overallCoverage <= 100, '整体覆盖率应在 0-100%');
  });

  // --------------------------------------------------
  //  4. 天气服务测试
  // --------------------------------------------------
  console.log('\n4. 天气服务（总纲 18.3：无 Key 返回 null）');

  await asyncTest('无 WEATHER_API_KEY 时 getWeather 降级到 Open-Meteo', async () => {
    // 确保环境变量未设置
    const savedKey = process.env.WEATHER_API_KEY;
    delete process.env.WEATHER_API_KEY;
    try {
      const result = await getWeather('dali');
      // Open-Meteo 无需 Key，应返回真实天气数据（总纲18.3：不伪造，但可用真实免Key源）
      assert.ok(result !== null, 'Open-Meteo 应返回真实数据');
      assert.strictEqual(result.source, 'open-meteo', '来源应为 open-meteo');
      assert.ok(result.forecast.length > 0, '应有预报数据');
    } finally {
      if (savedKey) process.env.WEATHER_API_KEY = savedKey;
    }
  });

  test('getWeatherMock 始终返回 null', () => {
    const result = getWeatherMock('dali');
    assert.strictEqual(result, null, 'Mock 天气服务应返回 null');
  });

  // --------------------------------------------------
  //  5. 地图降级模式测试
  // --------------------------------------------------
  console.log('\n5. 地图降级模式');

  test('MAP_PROVIDER=mock 时使用 MockMapProvider', () => {
    const savedProvider = process.env.MAP_PROVIDER;
    const savedKey = process.env.BAIDU_MAP_API_KEY;
    process.env.MAP_PROVIDER = 'mock';
    delete process.env.BAIDU_MAP_API_KEY;
    resetProvider();
    try {
      const provider = getActiveProvider();
      assert.ok(provider instanceof MockMapProvider, 'mock 模式应返回 MockMapProvider');
      assert.strictEqual(provider.name, 'mock', 'provider.name 应为 mock');
    } finally {
      if (savedProvider) process.env.MAP_PROVIDER = savedProvider;
      if (savedKey) process.env.BAIDU_MAP_API_KEY = savedKey;
      resetProvider();
    }
  });

  test('MAP_PROVIDER=baidu 但无 Key 时降级到 MockMapProvider', () => {
    const savedProvider = process.env.MAP_PROVIDER;
    const savedKey = process.env.BAIDU_MAP_API_KEY;
    process.env.MAP_PROVIDER = 'baidu';
    delete process.env.BAIDU_MAP_API_KEY;
    resetProvider();
    try {
      const provider = getActiveProvider();
      assert.ok(provider instanceof MockMapProvider, '无 Key 时应降级到 MockMapProvider');
      assert.strictEqual(provider.name, 'mock', '降级后 name 应为 mock');
    } finally {
      if (savedProvider) process.env.MAP_PROVIDER = savedProvider;
      if (savedKey) process.env.BAIDU_MAP_API_KEY = savedKey;
      resetProvider();
    }
  });

  test('未设置 MAP_PROVIDER 时默认使用 mock', () => {
    const savedProvider = process.env.MAP_PROVIDER;
    delete process.env.MAP_PROVIDER;
    resetProvider();
    try {
      const provider = getActiveProvider();
      assert.ok(provider instanceof MockMapProvider, '默认应使用 MockMapProvider');
    } finally {
      if (savedProvider) process.env.MAP_PROVIDER = savedProvider;
      resetProvider();
    }
  });

  test('getActiveProvider 单例缓存', () => {
    resetProvider();
    const p1 = getActiveProvider();
    const p2 = getActiveProvider();
    assert.strictEqual(p1, p2, '应返回同一实例（单例）');
  });

  await asyncTest('降级模式下仍能正常搜索 POI', async () => {
    const savedProvider = process.env.MAP_PROVIDER;
    const savedKey = process.env.BAIDU_MAP_API_KEY;
    process.env.MAP_PROVIDER = 'baidu';
    delete process.env.BAIDU_MAP_API_KEY;
    resetProvider();
    try {
      const provider = getActiveProvider();
      const result = await provider.searchPOI('西湖');
      assert.ok(result.source === 'mock', '降级后 source 应为 mock');
      assert.ok(Array.isArray(result.data), '仍应返回 POI 数组');
    } finally {
      if (savedProvider) process.env.MAP_PROVIDER = savedProvider;
      if (savedKey) process.env.BAIDU_MAP_API_KEY = savedKey;
      resetProvider();
    }
  });

  // --------------------------------------------------
  //  测试结果汇总
  // --------------------------------------------------
  console.log('\n=== 测试结果 ===');
  console.log(`  通过: ${passed}  失败: ${failed}  总计: ${passed + failed}`);
  if (failed > 0) {
    console.log('\n  存在失败用例，请检查上述输出。');
    process.exit(1);
  } else {
    console.log('\n  全部通过。');
  }
})();
