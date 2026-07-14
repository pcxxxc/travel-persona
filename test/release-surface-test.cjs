'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const dockerfile = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8');
const dockerignore = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8');

assert.ok(!/^COPY\s+(?:--chown=\S+\s+)?\.\s+\.$/m.test(dockerfile), '镜像不得复制整个工作区');
assert.match(dockerfile, /COPY --chown=node:node server\.js \./);
assert.match(dockerfile, /COPY --chown=node:node src \.\/src/);
assert.match(dockerfile, /COPY --chown=node:node public-app \.\/public-app/);
assert.match(dockerfile, /COPY mcp-servers\/baidu-map\/package\.json mcp-servers\/baidu-map\/package-lock\.json/);
assert.match(dockerfile, /COPY --chown=node:node mcp-servers\/baidu-map\/src/);
assert.ok(dockerfile.includes('/app/backups'), '镜像必须准备独立备份目录');
assert.ok(fs.readFileSync(path.join(root, 'docker-compose.yml'), 'utf8').includes('travel_persona_backups:/app/backups'), 'Compose 必须挂载独立备份卷');

for (const legacyPath of ['public-site', 'travel7.9', 'travel-persona', 'artifacts', 'test']) {
  assert.ok(dockerignore.split(/\r?\n/).includes(legacyPath), `${legacyPath} 应排除在镜像上下文外`);
}

assert.ok(!dockerignore.includes('*.html'), '不能排除用户端 index.html');
assert.ok(fs.existsSync(path.join(root, 'public-app', 'index.html')));
assert.ok(fs.existsSync(path.join(root, 'public-app', 'map-client.js')));
const appIndex = fs.readFileSync(path.join(root, 'public-app', 'index.html'), 'utf8');
const mapClient = fs.readFileSync(path.join(root, 'public-app', 'map-client.js'), 'utf8');
assert.ok(appIndex.includes('map-client.js'), '用户端必须加载国内地图客户端');
assert.ok(!appIndex.includes('leaflet'), '用户端不得加载 Leaflet 或外部瓦片依赖');
assert.ok(!mapClient.includes('openstreetmap.org'), '用户端不得回退到 OpenStreetMap');

const runtimeSources = [
  path.join(root, 'src', 'data', 'cityRecords.js'),
  path.join(root, 'src', 'services', 'fallbackPlanner.js')
].map(file => fs.readFileSync(file, 'utf8')).join('\n');
assert.ok(!runtimeSources.includes('public-site'), '发布运行时不得依赖未打包的历史站点目录');
assert.ok(fs.existsSync(path.join(root, 'src', 'data', 'travelPersonaSeed.json')), '发布包必须包含城市种子数据');

const releaseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-persona-release-'));
try {
  fs.cpSync(path.join(root, 'src'), path.join(releaseRoot, 'src'), { recursive: true });
  const runtimeProbe = [
    "const { getCities } = require('./src/data/cityRecords');",
    "const { buildRouteExperiment } = require('./src/services/fallbackPlanner');",
    "const cities = getCities();",
    "const plan = buildRouteExperiment({ routeGoal: 'multiCityValue', origin: '茂名', destination: '北京', days: 18, budget: 500, totalBudget: 9000, hardMax: 11000 });",
    "if (cities.length < 32 || !plan || plan.variants.length !== 3) process.exit(1);",
    "process.stdout.write(JSON.stringify({ cityCount: cities.length, variants: plan.variants.length }));"
  ].join('');
  const probeOutput = childProcess.execFileSync(process.execPath, ['-e', runtimeProbe], {
    cwd: releaseRoot,
    encoding: 'utf8'
  });
  const probeResult = JSON.parse(probeOutput);
  assert.strictEqual(probeResult.cityCount, 32);
  assert.strictEqual(probeResult.variants, 3);
} finally {
  fs.rmSync(releaseRoot, { recursive: true, force: true });
}

console.log('Release surface tests passed.');
