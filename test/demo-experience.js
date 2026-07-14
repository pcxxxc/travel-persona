/**
 * 旅格 Travel Persona · 体验演示脚本
 */

const { computePersonaScore } = require('../src/data/dimensionMapping');
const { recommendCities, generateReason } = require('../src/core/scoring');

console.log('========================================');
console.log('  旅格 Travel Persona - 推荐体验');
console.log('========================================\n');

// ===== 场景 1: 放空疗愈型 =====
console.log('【场景 1】"最近好累，想去海边放空自己"');
console.log('----------------------------------------');
const answers1 = { emotionGoal: '放空', door: '海', duration: '3-5天', budget: '中等' };
const persona1 = computePersonaScore(answers1);
const rec1 = recommendCities(persona1.score);

console.log('六维画像:', JSON.stringify(persona1.score));
console.log('人格标签:', rec1.personaLabel.label, '(置信度:', rec1.personaLabel.confidence + ')');
console.log('推荐城市:');
rec1.topCities.forEach((city, i) => {
  const reason = generateReason(persona1.score, city, { userQuote: '想放空一下' });
  console.log(`  ${i+1}. ${city.name} — 匹配度 ${city.matchScore}%`);
  console.log('    理由:', reason.reason);
});
console.log();

// ===== 场景 2: 社交打卡型 =====
console.log('【场景 2】"周末想和朋友们出去玩，热闹一下"');
console.log('----------------------------------------');
const answers2 = { emotionGoal: '社交', door: '老街', duration: '1-2天', budget: '高预算', rhythm: '特种兵' };
const persona2 = computePersonaScore(answers2);
const rec2 = recommendCities(persona2.score);

console.log('六维画像:', JSON.stringify(persona2.score));
console.log('人格标签:', rec2.personaLabel.label, '(置信度:', rec2.personaLabel.confidence + ')');
console.log('推荐城市:');
rec2.topCities.forEach((city, i) => {
  console.log(`  ${i+1}. ${city.name} — 匹配度 ${city.matchScore}%`);
});
console.log();

// ===== 场景 3: 压力逃离型 =====
console.log('【场景 3】"压力大到想消失，去森林里待一周"');
console.log('----------------------------------------');
const answers3 = { emotionGoal: '逃离压力', door: '森林', duration: '一周以上', budget: '低预算' };
const persona3 = computePersonaScore(answers3);
const rec3 = recommendCities(persona3.score);

console.log('六维画像:', JSON.stringify(persona3.score));
console.log('人格标签:', rec3.personaLabel.label, '(置信度:', rec3.personaLabel.confidence + ')');
console.log('推荐城市:');
rec3.topCities.forEach((city, i) => {
  console.log(`  ${i+1}. ${city.name} — 匹配度 ${city.matchScore}%`);
});
console.log();

// ===== 场景 4: 数字游民型 =====
console.log('【场景 4】"想换个城市生活一段时间试试"');
console.log('----------------------------------------');
const answers4 = { emotionGoal: '试住城市', door: '咖啡馆', duration: '一周以上', nomad: '是', budget: '中等' };
const persona4 = computePersonaScore(answers4);
const rec4 = recommendCities(persona4.score);

console.log('六维画像:', JSON.stringify(persona4.score));
console.log('人格标签:', rec4.personaLabel.label, '(置信度:', rec4.personaLabel.confidence + ')');
console.log('推荐城市:');
rec4.topCities.forEach((city, i) => {
  console.log(`  ${i+1}. ${city.name} — 匹配度 ${city.matchScore}%`);
});
console.log();

console.log('========================================');
console.log('体验完成！后端 v2 算法已就绪。');
console.log('========================================');