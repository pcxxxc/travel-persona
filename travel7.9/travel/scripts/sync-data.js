/**
 * 旅格 Travel Persona · 前后端数据同步脚本
 *
 * 职责：
 * 1. 将 src/data/cityDatabase.js 导出为前端可用的 JSON 格式
 * 2. 将 src/data/dimensionMapping.js 的映射表导出
 * 3. 确保前后端数据一致性
 *
 * 使用：
 *   node scripts/sync-data.js
 *   或 npm run sync:data
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DATA = path.join(ROOT, 'src', 'data');
const PUBLIC_ASSETS = path.join(ROOT, 'public-site', 'travel-persona', 'assets');

// 确保目标目录存在
if (!fs.existsSync(PUBLIC_ASSETS)) {
  fs.mkdirSync(PUBLIC_ASSETS, { recursive: true });
}

console.log('旅格 Travel Persona · 数据同步');
console.log('='.repeat(40));

// 1. 同步城市数据
try {
  const { CITIES } = require(path.join(SRC_DATA, 'cityDatabase'));

  // 导出为前端可用的 JS 模块
  const cityData = `/**
 * 旅格 Travel Persona · 城市数据（自动生成，请勿手动编辑）
 * 来源: src/data/cityDatabase.js
 * 生成时间: ${new Date().toISOString()}
 */
window.CITY_DATA = ${JSON.stringify(CITIES, null, 2)};
`;

  fs.writeFileSync(path.join(PUBLIC_ASSETS, 'city-data.js'), cityData, 'utf-8');
  console.log(`✓ 城市数据已同步: ${CITIES.length} 个城市 -> city-data.js`);
} catch (err) {
  console.error(`✗ 城市数据同步失败: ${err.message}`);
}

// 2. 同步映射表数据
try {
  const { MAPPING_TABLES, SOURCE_WEIGHTS } = require(path.join(SRC_DATA, 'dimensionMapping'));

  const mappingData = `/**
 * 旅格 Travel Persona · 维度映射数据（自动生成，请勿手动编辑）
 * 来源: src/data/dimensionMapping.js
 * 生成时间: ${new Date().toISOString()}
 */
window.MAPPING_TABLES = ${JSON.stringify(MAPPING_TABLES, null, 2)};
window.SOURCE_WEIGHTS = ${JSON.stringify(SOURCE_WEIGHTS, null, 2)};
`;

  fs.writeFileSync(path.join(PUBLIC_ASSETS, 'mapping-data.js'), mappingData, 'utf-8');
  console.log(`✓ 映射数据已同步: ${Object.keys(MAPPING_TABLES).length} 个映射表 -> mapping-data.js`);
} catch (err) {
  console.error(`✗ 映射数据同步失败: ${err.message}`);
}

// 3. 同步数据版本
try {
  const di = require(path.join(SRC_DATA, 'dataInterface'));
  const snapshot = di.exportSnapshot();

  const versionData = `/**
 * 旅格 Travel Persona · 数据版本快照（自动生成）
 * 生成时间: ${new Date().toISOString()}
 */
window.DATA_VERSION = '${di.getVersion()}';
window.DATA_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)};
`;

  fs.writeFileSync(path.join(PUBLIC_ASSETS, 'data-version.js'), versionData, 'utf-8');
  console.log(`✓ 数据版本已同步: v${di.getVersion()} -> data-version.js`);
} catch (err) {
  console.error(`✗ 数据版本同步失败: ${err.message}`);
}

console.log('='.repeat(40));
console.log('数据同步完成');