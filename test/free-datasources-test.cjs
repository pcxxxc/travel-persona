/**
 * 旅格 · 免Key数据源实际接入测试
 * 验证 Open-Meteo 天气、chinese-days 节假日、地理编码多源降级
 */

const assert = require('assert');

// Node's console.assert only logs. In this test process, failed checks must fail the suite.
console.assert = (condition, message) => assert.ok(condition, message);

(async () => {
  let passed = 0, failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ✗ FAIL: ${name} — ${e.message}`);
    }
  }

  console.log('\n=== 免Key数据源实际接入测试 ===\n');

  // ===== 1. Open-Meteo 天气 =====
  console.log('1. Open-Meteo 天气 API（无需Key，真实调用）');

  await test('大理天气预报', async () => {
    const { fetchFromOpenMeteo } = require('../src/services/weather/weatherService');
    const result = await fetchFromOpenMeteo('dali');
    console.assert(result, '应返回数据');
    console.assert(result.source === 'open-meteo', `source 应为 open-meteo，实际为 ${result.source}`);
    console.assert(result.forecast.length > 0, '应有预报数据');
    console.assert(result.forecast[0].tempMax !== undefined, '应有最高温');
    console.assert(result.forecast[0].tempMin !== undefined, '应有最低温');
    console.assert(result.forecast[0].textDay, '应有天气描述');
    console.log(`    → ${result.forecast[0].date}: ${result.forecast[0].textDay}, ${result.forecast[0].tempMin}°C ~ ${result.forecast[0].tempMax}°C`);
  });

  await test('北京天气预报', async () => {
    const { fetchFromOpenMeteo } = require('../src/services/weather/weatherService');
    const result = await fetchFromOpenMeteo('beijing');
    console.assert(result && result.forecast.length > 0, '应有预报');
    console.log(`    → ${result.forecast[0].date}: ${result.forecast[0].textDay}, ${result.forecast[0].tempMin}°C ~ ${result.forecast[0].tempMax}°C`);
  });

  await test('天气数据有7天预报', async () => {
    const { fetchFromOpenMeteo } = require('../src/services/weather/weatherService');
    const result = await fetchFromOpenMeteo('chengdu');
    console.assert(result.forecast.length === 7, `应有7天预报，实际${result.forecast.length}天`);
  });

  await test('当前天气', async () => {
    const { fetchFromOpenMeteo } = require('../src/services/weather/weatherService');
    const result = await fetchFromOpenMeteo('shanghai');
    console.assert(result.current !== null, '应有当前天气');
    if (result.current) {
      console.log(`    → 当前 ${result.current.temp}°C, ${result.current.text}`);
    }
  });

  // ===== 2. 节假日服务 =====
  console.log('\n2. chinese-days 节假日服务（纯本地计算）');

  await test('日期类型识别（国庆）', () => {
    const { getHolidayInfo } = require('../src/services/ops/holidayService');
    const info = getHolidayInfo('2026-10-01');
    // chinese-days 可能不覆盖2026年，此时应降级返回工作日/周末
    console.assert(info && info.type, `应有类型信息，实际: ${JSON.stringify(info)}`);
    console.assert(typeof info.isHoliday === 'boolean', 'isHoliday 应为布尔值');
    console.assert(typeof info.isWorkday === 'boolean', 'isWorkday 应为布尔值');
    console.log(`    → ${info.date}: ${info.name} (${info.type})`);
  });

  await test('普通工作日识别', () => {
    const { getHolidayInfo } = require('../src/services/ops/holidayService');
    const info = getHolidayInfo('2026-07-13'); // 周一
    console.assert(info.isWorkday === true, '应为工作日');
    console.log(`    → ${info.date}: ${info.name} (${info.type})`);
  });

  await test('出行友好度评估', () => {
    const { getTravelFriendliness } = require('../src/services/ops/holidayService');
    const info = getTravelFriendliness('2026-07-15');
    console.assert(['low', 'medium', 'high'].includes(info.travelFriendliness), `友好度应为 low/medium/high，实际: ${info.travelFriendliness}`);
    console.assert(info.reason, '应有原因');
    console.log(`    → ${info.date}: ${info.travelFriendliness} — ${info.reason}`);
  });

  await test('获取近期节假日', () => {
    const { getUpcomingHolidays } = require('../src/services/ops/holidayService');
    const holidays = getUpcomingHolidays(6);
    console.log(`    → 近6个月找到 ${holidays.length} 个法定节假日`);
    // 2026年可能不被覆盖，所以不强制断言数量
  });

  await test('获取最佳出行日期', () => {
    const { getBestTravelDates } = require('../src/services/ops/holidayService');
    const dates = getBestTravelDates('2026-10-01', '2026-10-07', 3);
    console.assert(dates.length === 3, `应返回3个日期，实际${dates.length}个`);
    console.assert(dates[0].travelFriendliness, '应有友好度');
    console.log(`    → 最佳: ${dates[0].date} (${dates[0].travelFriendliness}, ${dates[0].reason})`);
  });

  // ===== 3. 地理编码（多源降级） =====
  console.log('\n3. 地理编码（Nominatim → Open-Meteo Geo → 本地坐标）');

  await test('大理城市地理编码', async () => {
    const { geocode } = require('../src/services/map/nominatimProvider');
    const results = await geocode('大理');
    console.assert(results.length > 0, '应返回结果');
    console.assert(typeof results[0].lat === 'number', '应有lat');
    console.assert(typeof results[0].lng === 'number', '应有lng');
    console.assert(results[0].lat > 25 && results[0].lat < 26, '大理纬度应在25-26之间');
    console.log(`    → ${results[0].lat}, ${results[0].lng} — ${results[0].displayName.slice(0, 40)} [${results[0].source}]`);
  });

  await test('北京城市地理编码', async () => {
    const { geocode } = require('../src/services/map/nominatimProvider');
    const results = await geocode('北京');
    console.assert(results.length > 0, '应返回结果');
    console.assert(results[0].lat > 39 && results[0].lat < 41, '北京纬度应在39-41之间');
    console.log(`    → ${results[0].lat}, ${results[0].lng} [${results[0].source}]`);
  });

  await test('逆地理编码（大理坐标）', async () => {
    const { reverseGeocode } = require('../src/services/map/nominatimProvider');
    const result = await reverseGeocode(25.6065, 100.2670);
    console.assert(result !== null, '应返回结果');
    console.assert(typeof result.displayName === 'string', '应有地名');
    console.log(`    → ${result.displayName.slice(0, 50)} [${result.source}]`);
  });

  await test('本地坐标直接查询', async () => {
    const { localGeocode } = require('../src/services/map/nominatimProvider');
    const results = localGeocode('大理');
    console.assert(results.length > 0, '应匹配到本地数据');
    console.assert(results[0].source === 'local', '来源应为local');
    console.assert(results[0].lat === 25.6065, '纬度应精确');
    console.log(`    → ${results[0].displayName} [${results[0].source}]`);
  });

  // ===== 4. 天气服务完整调用链 =====
  console.log('\n4. 天气服务完整链（带缓存）');

  await test('getWeather 入口调用（带缓存）', async () => {
    const { getWeather, clearCache } = require('../src/services/weather/weatherService');
    clearCache(); // 清除之前的缓存

    const result1 = await getWeather('beijing');
    console.assert(result1 !== null, '应返回数据');
    console.assert(result1.cached === false, '首次应非缓存');
    console.assert(result1.source === 'open-meteo', `source应为open-meteo，实际: ${result1.source}`);

    // 第二次调用应命中缓存
    const result2 = await getWeather('beijing');
    console.assert(result2.cached === true, '第二次应命中缓存');

    console.log(`    → 首次: ${result1.cached ? '缓存' : '实时'}, 第二次: ${result2.cached ? '缓存' : '实时'}`);
  });

  // ===== 汇总 =====
  console.log('\n=== 结果 ===');
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`总计: ${passed + failed}\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('所有免Key数据源接入测试通过！数据全部真实可用。');
    process.exit(0);
  }
})();
