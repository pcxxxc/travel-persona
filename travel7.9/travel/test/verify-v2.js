/**
 * 旅格 Travel Persona · 核心链路验证（v2）
 *
 * 验证「输入问卷数据 → 算出 Top3 城市」在本地跑通
 * 包含边界测试和性能测试
 */

const { computePersonaScore } = require('../src/data/dimensionMapping');
const { recommendCities, generateReason, batchRecommend } = require('../src/core/scoring');

console.log('=====================================');
console.log('旅格 Travel Persona · 核心链路验证 v2');
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
console.log('冲突:', result1.conflicts.length > 0 ? result1.conflicts : '无');
console.log('元数据:', JSON.stringify(result1.metadata, null, 2));

const rec1 = recommendCities(result1.score, { includeWeather: false });
console.log('\n人格标签:', rec1.personaLabel);
console.log('Top3 推荐:');
rec1.topCities.forEach((city, i) => {
  console.log(`  ${i + 1}. ${city.name} — 匹配度 ${city.matchScore}%`);
  const reason = generateReason(result1.score, city, { userQuote: '想放空一下' });
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

const rec2 = recommendCities(result2.score, { includeWeather: false });
console.log('\n人格标签:', rec2.personaLabel);
console.log('Top3 推荐:');
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

const rec3 = recommendCities(result3.score, { includeWeather: false });
console.log('\n人格标签:', rec3.personaLabel);
console.log('Top3 推荐:');
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

const rec4 = recommendCities(result4.score, { includeWeather: false });
console.log('\n人格标签:', rec4.personaLabel);
console.log('Top3 推荐:');
rec4.topCities.forEach((city, i) => {
  console.log(`  ${i + 1}. ${city.name} — 匹配度 ${city.matchScore}%`);
});

console.log('\n');

// ===== 测试用例 5：天气过滤 =====
console.log('【测试 5】天气过滤测试（注入固定天气数据）');
console.log('-------------------------------------');

const weatherData = {
  'dali': { hasExtremeWeather: true, note: '近期暴雨' },
  'lijiang': { hasExtremeWeather: false, note: null }
};

const rec5 = recommendCities(result1.score, {
  includeWeather: true,
  weatherData
});
console.log('Top3 推荐（含天气过滤）:');
rec5.topCities.forEach((city, i) => {
  const weatherInfo = city.hasExtremeWeather ? `[天气降权: ${city.weatherNote}]` : '';
  console.log(`  ${i + 1}. ${city.name} — 匹配度 ${city.matchScore}% (原始: ${city.originalScore}%) ${weatherInfo}`);
});

console.log('\n');

// ===== 测试用例 6：批量推荐性能测试 =====
console.log('【测试 6】批量推荐性能测试');
console.log('-------------------------------------');

const testCases = [
  { name: '自然疗愈', answers: { emotionGoal: '放空', door: '海', duration: '3-5天', budget: '中等' } },
  { name: '城市探索', answers: { emotionGoal: '找灵感', door: '城市高楼', duration: '1-2天', budget: '高预算' } },
  { name: '深度慢游', answers: { emotionGoal: '独处整理', door: '古镇', duration: '一周以上', budget: '低预算' } },
  { name: '社交打卡', answers: { emotionGoal: '社交', door: '老街', duration: '1-2天', budget: '中等', rhythm: '特种兵' } },
  { name: '数字游民', answers: { emotionGoal: '试住城市', door: '咖啡馆', duration: '一周以上', nomad: '是' } }
];

const batchStart = Date.now();
const batchResults = batchRecommend(testCases);
const batchDuration = Date.now() - batchStart;

console.log(`批量处理 ${testCases.length} 个用例，总耗时: ${batchDuration}ms`);
console.log('结果:');
batchResults.forEach(r => {
  if (r.success) {
    console.log(`  ✓ ${r.name}: ${r.personaLabel.label} → ${r.topCities[0]?.name} (${r.topCities[0]?.matchScore}%) [${r.duration}ms]`);
  } else {
    console.log(`  ✗ ${r.name}: ${r.error}`);
  }
});

console.log('\n');

// ===== 测试用例 7：冲突检测 =====
console.log('【测试 7】冲突检测测试');
console.log('-------------------------------------');

const conflictAnswers = {
  emotionGoal: '社交',      // social +0.5
  door: '森林',             // social -0.3
  dislike: '人多拥挤'       // social -0.3
};

const conflictResult = computePersonaScore(conflictAnswers, { trackConflicts: true });
console.log('PersonaScore:', JSON.stringify(conflictResult.score, null, 2));
console.log('冲突:', conflictResult.conflicts.length > 0
  ? JSON.stringify(conflictResult.conflicts, null, 2)
  : '无');

console.log('\n=====================================');
console.log('验证完成！核心链路「问卷 → PersonaScore → Top3」已跑通。');
console.log('=====================================');
