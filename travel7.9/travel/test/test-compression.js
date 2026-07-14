/**
 * 旅格 Travel Persona · 压缩函数对比测试
 *
 * 验证 sigmoid 压缩 vs 简单加法的信息保留能力
 */

const { compressScore, computePersonaScore, BASE_SCORE, SIGMOID_K } = require('../src/data/dimensionMapping');

console.log('=====================================');
console.log('压缩函数对比测试');
console.log('=====================================\n');

// ===== 测试 1: 同方向多信号 =====
console.log('【测试 1】同方向多信号（信息保留能力）');
console.log('场景：用户选择了3个都指向高 nature 的选项');
console.log('-------------------------------------');

const answers1 = {
  emotionGoal: '放空',      // nature +0.3
  door: '森林',             // nature +0.5
  rhythm: '深度慢游'        // nature +0.1
};

// 简单加法
const simpleResult = computePersonaScore(answers1, { useCompression: false });
// Sigmoid 压缩
const sigmoidResult = computePersonaScore(answers1, { useCompression: true });

console.log('简单加法 nature:', simpleResult.score.nature);
console.log('Sigmoid 压缩 nature:', sigmoidResult.score.nature);
console.log('信息保留差异:', (sigmoidResult.score.nature - simpleResult.score.nature).toFixed(3));
console.log('结论:', sigmoidResult.score.nature > simpleResult.score.nature ? '✓ Sigmoid 保留更多信息' : '✗');
console.log();

// ===== 测试 2: 正负冲突信号 =====
console.log('【测试 2】正负冲突信号（冲突检测）');
console.log('场景：用户同时选择了高 social 和低 social 的选项');
console.log('-------------------------------------');

const answers2 = {
  emotionGoal: '社交',      // social +0.5
  door: '森林',             // social -0.3
  dislike: '人多拥挤'       // social -0.3
};

const conflictResult = computePersonaScore(answers2, { trackConflicts: true });

console.log('social 分数:', conflictResult.score.social);
console.log('冲突检测:', conflictResult.conflicts.length > 0 ? '✓ 检测到冲突' : '✗ 未检测到');
if (conflictResult.conflicts.length > 0) {
  console.log('冲突详情:', JSON.stringify(conflictResult.conflicts[0], null, 2));
}
console.log();

// ===== 测试 3: 加权累加验证 =====
console.log('【测试 3】加权累加验证（情绪目标权重 > 偏好权重）');
console.log('-------------------------------------');

const answers3a = { emotionGoal: '放空' };  // weight=1.0
const answers3b = { preference: '自然风光' }; // weight=0.6

const result3a = computePersonaScore(answers3a);
const result3b = computePersonaScore(answers3b);

console.log('emotionGoal=放空 → nature:', result3a.score.nature, '(权重 1.0)');
console.log('preference=自然风光 → nature:', result3b.score.nature, '(权重 0.6)');
console.log('结论:', result3a.score.nature > result3b.score.nature ? '✓ 情绪目标影响更大' : '✗');
console.log();

// ===== 测试 4: Sigmoid 数学特性 =====
console.log('【测试 4】Sigmoid 数学特性验证');
console.log('-------------------------------------');

const testValues = [-3, -2, -1, -0.5, 0, 0.5, 1, 2, 3];
console.log('累加和 → 压缩分数 (k=' + SIGMOID_K + '):');
for (const val of testValues) {
  const score = compressScore(BASE_SCORE, val, SIGMOID_K);
  console.log(`  ${val >= 0 ? '+' : ''}${val.toFixed(1)} → ${score.toFixed(3)}`);
}
console.log();

// ===== 测试 5: 边界测试 =====
console.log('【测试 5】边界测试');
console.log('-------------------------------------');

// 空答案
const emptyResult = computePersonaScore({});
console.log('空答案 → 基准分:', JSON.stringify(emptyResult.score));
console.log('是否全为 0.5:', Object.values(emptyResult.score).every(v => v === 0.5) ? '✓' : '✗');

// 大量同方向信号（测试饱和行为）
const answers5 = {
  emotionGoal: '放空',
  door: '森林',
  rhythm: '深度慢游',
  preference: '自然风光',
  risk: '安全稳妥'  // 这个不影响 nature
};
const saturatedResult = computePersonaScore(answers5);
console.log('多信号 nature:', saturatedResult.score.nature);
console.log('是否 < 1.0（未硬饱和）:', saturatedResult.score.nature < 1.0 ? '✓' : '✗');

console.log('\n=====================================');
console.log('压缩函数测试完成');
console.log('=====================================');
