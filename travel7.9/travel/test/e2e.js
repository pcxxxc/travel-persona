/**
 * 旅格 Travel Persona · E2E 测试脚本
 *
 * 零依赖测试：使用 Node.js 原生 http 模块
 * 覆盖 7 个核心 API 端点
 *
 * 用法：node test/e2e.js
 */

const http = require('http');

const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;
let total = 0;

/**
 * 发送 HTTP 请求
 */
function request(method, path, body) {
  return new Promise(function(resolve, reject) {
    var options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    };
    var req = http.request(options, function(res) {
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', function() { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * 断言辅助
 */
function assert(condition, label, detail) {
  total++;
  if (condition) {
    passed++;
    console.log('  \x1b[32mPASS\x1b[0m ' + label + (detail ? ' — ' + detail : ''));
  } else {
    failed++;
    console.log('  \x1b[31mFAIL\x1b[0m ' + label + (detail ? ' — ' + detail : ''));
  }
}

/**
 * 运行单个测试（独立 try-catch）
 */
async function runTest(name, fn) {
  console.log('\n[' + name + ']');
  try {
    await fn();
  } catch (err) {
    total++;
    failed++;
    console.log('  \x1b[31mFAIL\x1b[0m 异常: ' + err.message);
  }
}

// ===== 测试用例 =====

async function testHealth() {
  var r = await request('GET', '/api/health');
  assert(r.status === 200, '状态码 200');
  assert(r.body && r.body.status === 'ok', 'status = ok');
  assert(r.body.version === '2.0.0', 'version = 2.0.0');
  assert(typeof r.body.uptime === 'number', 'uptime 是数字 (' + r.body.uptime + 's)');
}

async function testVersion() {
  var r = await request('GET', '/api/data/version');
  assert(r.status === 200, '状态码 200');
  assert(r.body.version === '2.0.0', 'version = 2.0.0');
  assert(r.body.timestamp, 'timestamp 存在');
}

async function testCities() {
  var r = await request('GET', '/api/data/cities?format=summary');
  assert(r.status === 200, '状态码 200');
  assert(r.body.cities && Array.isArray(r.body.cities), 'cities 是数组');
  assert(r.body.cities.length >= 20, '城市数量 >= 20', r.body.cities.length + ' 个');
  assert(r.body.count === r.body.cities.length, 'count 与数组长度一致');
}

async function testRecommend() {
  var r = await request('POST', '/api/recommend', {
    answers: {
      emotionGoal: '放空',
      travelTime: '3-5天',
      budget: '中等',
      spacePrefs: ['海'],
      pacePref: 1
    }
  });
  assert(r.status === 200, '状态码 200');
  assert(r.body.personaScore, '返回 personaScore');
  assert(r.body.personaScore.nature !== undefined, 'personaScore 含六维分数');
  assert(r.body.topCities && Array.isArray(r.body.topCities), '返回 topCities 数组');
  assert(r.body.topCities.length >= 1, '推荐至少 1 个城市', r.body.topCities.length + ' 个');
  if (r.body.topCities[0]) {
    assert(r.body.topCities[0].name, '首个城市有 name', r.body.topCities[0].name);
  }
}

async function testWeather() {
  var r = await request('GET', '/api/weather?city=dali&days=3');
  assert(r.status === 200, '状态码 200');
  assert(r.body, '返回数据');
  if (r.body.fallback) {
    assert(true, '天气降级模式（预期行为）');
  } else {
    assert(r.body.daily, '含 daily 数组');
  }
}

async function testMappings() {
  var r = await request('GET', '/api/data/mappings/emotionGoal');
  assert(r.status === 200, '状态码 200');
  assert(r.body, '返回映射表数据');
}

async function testWeights() {
  var r = await request('GET', '/api/data/weights');
  assert(r.status === 200, '状态码 200');
  assert(r.body && typeof r.body === 'object', '返回权重对象');
  // sourceWeights 包含答案字段权重（emotionGoal, door, rhythm 等）
  var fields = ['emotionGoal', 'door', 'rhythm', 'budget'];
  var hasFields = fields.every(function(f) { return typeof r.body[f] === 'number'; });
  assert(hasFields, '包含核心字段权重 (emotionGoal/door/rhythm/budget)');
}

// ===== 主流程 =====

async function main() {
  console.log('====================================');
  console.log('  旅格 Travel Persona · E2E 测试');
  console.log('  目标: ' + BASE);
  console.log('====================================');

  await runTest('1/7 健康检查', testHealth);
  await runTest('2/7 数据版本', testVersion);
  await runTest('3/7 城市列表', testCities);
  await runTest('4/7 推荐接口', testRecommend);
  await runTest('5/7 天气接口', testWeather);
  await runTest('6/7 映射表', testMappings);
  await runTest('7/7 权重配置', testWeights);

  console.log('\n====================================');
  console.log('  结果: ' + passed + '/' + total + ' 通过');
  if (failed === 0) {
    console.log('  \x1b[32m全部通过 ✓\x1b[0m');
  } else {
    console.log('  \x1b[31m' + failed + ' 项失败\x1b[0m');
  }
  console.log('====================================');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(function(err) {
  console.error('\n致命错误:', err.message);
  process.exit(2);
});
