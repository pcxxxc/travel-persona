/**
 * 旅格 Travel Persona · 构建脚本
 *
 * 职责：
 * 1. 运行数据同步（sync-data.js）
 * 2. 运行数据校验（validate-data）
 * 3. 生成构建摘要
 *
 * 使用：
 *   node scripts/build.js
 *   或 npm run build
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

console.log('旅格 Travel Persona · 构建');
console.log('='.repeat(50));

// Step 1: 数据同步
console.log('\n[1/3] 数据同步...');
try {
  execSync('node scripts/sync-data.js', { cwd: ROOT, stdio: 'inherit' });
} catch (err) {
  console.error('数据同步失败，构建终止');
  process.exit(1);
}

// Step 2: 数据校验
console.log('\n[2/3] 数据校验...');
try {
  const di = require(path.join(ROOT, 'src', 'data', 'dataInterface'));
  const result = di.validateAll();

  if (result.valid) {
    console.log('✓ 数据校验通过');
    console.log(`  - 城市: ${result.summary.totalCities} 个`);
    console.log(`  - 映射表: ${result.summary.totalMappingTables} 个`);
    console.log(`  - 映射条目: ${result.summary.totalMappingEntries} 条`);
  } else {
    console.warn(`⚠ 数据校验发现 ${result.errors.length} 个问题:`);
    result.errors.forEach(err => {
      console.warn(`  - [${err.type}] ${err.message}`);
    });
  }
} catch (err) {
  console.error(`✗ 数据校验失败: ${err.message}`);
}

// Step 3: 生成构建摘要
console.log('\n[3/3] 生成构建摘要...');
const summary = {
  buildTime: new Date().toISOString(),
  version: '2.0.0',
  nodeVersion: process.version,
  files: {
    server: fs.existsSync(path.join(ROOT, 'server.js')),
    models: fs.existsSync(path.join(ROOT, 'src', 'models.js')),
    cityDatabase: fs.existsSync(path.join(ROOT, 'src', 'data', 'cityDatabase.js')),
    dimensionMapping: fs.existsSync(path.join(ROOT, 'src', 'data', 'dimensionMapping.js')),
    scoring: fs.existsSync(path.join(ROOT, 'src', 'core', 'scoring.js')),
    itinerarySolver: fs.existsSync(path.join(ROOT, 'src', 'core', 'itinerarySolver.js')),
    dataInterface: fs.existsSync(path.join(ROOT, 'src', 'data', 'dataInterface.js')),
    llmService: fs.existsSync(path.join(ROOT, 'src', 'services', 'llmService.js')),
    weatherService: fs.existsSync(path.join(ROOT, 'src', 'services', 'weatherService.js')),
    frontend: {
      main: fs.existsSync(path.join(ROOT, 'public-site', 'travel-persona', 'index.html')),
      storage: fs.existsSync(path.join(ROOT, 'public-site', 'travel-persona', 'assets', 'storage.js')),
      apiClient: fs.existsSync(path.join(ROOT, 'public-site', 'travel-persona', 'assets', 'api-client.js')),
      questionnaire: fs.existsSync(path.join(ROOT, 'public-site', 'travel-persona', 'assets', 'questionnaire.js')),
      emotionMap: fs.existsSync(path.join(ROOT, 'public-site', 'travel-persona', 'assets', 'emotionMap.js')),
      cityData: fs.existsSync(path.join(ROOT, 'public-site', 'travel-persona', 'assets', 'city-data.js'))
    }
  }
};

const summaryPath = path.join(ROOT, '.build-summary.json');
fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
console.log(`✓ 构建摘要已生成: .build-summary.json`);

console.log('\n' + '='.repeat(50));
console.log('构建完成');