/**
 * 旅格 Travel Persona · 验证脚本
 *
 * 输入假问卷数据 → 计算 PersonaScore → 推荐 Top3 城市
 * 验证「输入问卷数据 → 算出 Top3 城市」在本地跑通
 */

const { computePersonaScore } = require('../src/data/dimensionMapping');
const { recommendCities, generateReason } = require('../src/core/scoring');

console.log('=====================================');
console.log('旅格 Travel Persona · 核心链路验证');
console.log('=====================================\n');

// ===== 测试用例 1：放空 + 海 + 3-5天 =====
console.log('【测试 1】情绪：放空 | 空间：海 | 时长：3-5天 | 预算：中等');
console.log('-------------------------------------');

const answers1 = {
  emotionGoal: '放空',
  door: '海',
  duration: '3-5天',
  budget: '中等'
};

const result1 = computePersonaScore(answers1);
console.log('PersonaScore:', JSON.stringify(result1.score, null, 2));
console.log('人格标签:', require('../src/data/dimensionMapping').inferPersonaLabel(result1.score));

const rec1 = recommendCities(result1.score, { includeWeather: false });
console.log('\nTop3 推荐:');
rec1.topCities.forEach((city, i) => {
  console.log(`  ${i + 1}. ${city.name} — 匹配度 ${city.matchScore}%`);
  const reason = generateReason(result1.score, city);
  console.log(`     理由: ${reason.reason}`);
  console.log(`     提醒: ${reason.honestNote}`);
});

console.log('\n');

// ===== 测试用例 2：逃离压力 + 森林 + 一周以上 + 低预算 =====
console.log('【测试 2】情绪：逃离压力 | 空间：森林 | 时长：一周以上 | 预算：低预算');
console.log('-------------------------------------');

const answers2 = {
  emotionGoal: '逃离压力',
  door: '森林',
  duration: '一周以上',
  budget: '低预算'
};

const result2 = computePersonaScore(answers2);
console.log('PersonaScore:', JSON.stringify(result2.score, null, 2));
console.log('人格标签:', require('../src/data/dimensionMapping').inferPersonaLabel(result2.score));

const rec2 = recommendCities(result2.score, { includeWeather: false });
console.log('\nTop3 推荐:');
rec2.topCities.forEach((city, i) => {
  console.log(`  ${i + 1}. ${city.name} — 匹配度 ${city.matchScore}%`);
});

console.log('\n');

// ===== 测试用例 3：社交 + 老街 + 1-2天 + 高预算 =====
console.log('【测试 3】情绪：社交 | 空间：老街 | 时长：1-2天 | 预算：高预算');
console.log('-------------------------------------');

const answers3 = {
  emotionGoal: '社交',
  door: '老街',
  duration: '1-2天',
  budget: '高预算'
};

const result3 = computePersonaScore(answers3);
console.log('PersonaScore:', JSON.stringify(result3.score, null, 2));
console.log('人格标签:', require('../src/data/dimensionMapping').inferPersonaLabel(result3.score));

const rec3 = recommendCities(result3.score, { includeWeather: false });
console.log('\nTop3 推荐:');
rec3.topCities.forEach((city, i) => {
  console.log(`  ${i + 1}. ${city.name} — 匹配度 ${city.matchScore}%`);
});

console.log('\n');

// ===== 测试用例 4：数字游民 =====
console.log('【测试 4】情绪：试住城市 | 空间：咖啡馆 | 数字游民：是');
console.log('-------------------------------------');

const answers4 = {
  emotionGoal: '试住城市',
  door: '咖啡馆',
  duration: '一周以上',
  budget: '中等',
  nomad: '是'
};

const result4 = computePersonaScore(answers4);
console.log('PersonaScore:', JSON.stringify(result4.score, null, 2));
console.log('人格标签:', require('../src/data/dimensionMapping').inferPersonaLabel(result4.score));

const rec4 = recommendCities(result4.score, { includeWeather: false });
console.log('\nTop3 推荐:');
rec4.topCities.forEach((city, i) => {
  console.log(`  ${i + 1}. ${city.name} — 匹配度 ${city.matchScore}%`);
});

console.log('\n=====================================');
console.log('验证完成！核心链路「问卷 → PersonaScore → Top3」已跑通。');
console.log('=====================================');
