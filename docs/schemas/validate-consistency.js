/**
 * 旅格 Schema 一致性验证脚本
 *
 * 验证 docs/schemas/ 下的 JSON Schema 文件内部一致性。
 * 执行: node docs/schemas/validate-consistency.js
 */

const fs = require('fs');
const path = require('path');

const SCHEMAS_DIR = path.join(__dirname);

// 16维 TraitKey 列表
const CANONICAL_TRAIT_KEYS = [
  'restoration', 'nature', 'culture', 'food', 'pace', 'social',
  'budget', 'aesthetics', 'comfort', 'novelty', 'transit',
  'lowCrowd', 'authenticity', 'weatherFlex', 'bookingEase', 'workation'
];

// 旧6维列表
const LEGACY_SIX_DIMS = ['freedom', 'social', 'explore', 'nature', 'pace', 'budget'];

let passed = 0;
let failed = 0;

function check(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ FAIL: ${message}`);
  }
}

console.log('=== 旅格 Schema 一致性验证 ===\n');

// --- 1. 验证所有 JSON 文件可解析 ---
console.log('1. 验证 JSON Schema 文件可解析');
const schemaFiles = fs.readdirSync(SCHEMAS_DIR)
  .filter(f => f.endsWith('.json'))
  .sort();

check(schemaFiles.length > 0, `找到 ${schemaFiles.length} 个 JSON Schema 文件`);

let allParseOk = true;
const schemas = {};
for (const file of schemaFiles) {
  try {
    const content = fs.readFileSync(path.join(SCHEMAS_DIR, file), 'utf-8');
    schemas[file] = JSON.parse(content);
    check(true, `${file} 解析成功`);
  } catch (e) {
    allParseOk = false;
    check(false, `${file} 解析失败: ${e.message}`);
  }
}

// --- 2. 验证 SharedEnums.json 中的 TRAIT_KEYS ---
console.log('\n2. 验证 SharedEnums.json TRAIT_KEYS');
if (schemas['SharedEnums.json']) {
  const enums = schemas['SharedEnums.json'];
  const traitDef = enums.definitions?.TraitKey;
  check(traitDef && traitDef.enum, 'TraitKey 定义存在且包含 enum');
  if (traitDef?.enum) {
    check(
      JSON.stringify(traitDef.enum) === JSON.stringify(CANONICAL_TRAIT_KEYS),
      `TraitKey 包含完整16维: ${traitDef.enum.length} 个`
    );
  }

  const legacyDef = enums.properties?.LEGACY_SIX_DIMS?.items;
  if (legacyDef?.enum) {
    check(
      JSON.stringify(legacyDef.enum.sort()) === JSON.stringify(LEGACY_SIX_DIMS.sort()),
      `LEGACY_SIX_DIMS 包含旧6维: ${legacyDef.enum.length} 个`
    );
  }

  // 检查证据类型
  const evidenceDef = enums.definitions?.EvidenceType;
  check(evidenceDef && evidenceDef.enum, 'EvidenceType 定义存在且包含 enum');
  if (evidenceDef?.enum) {
    check(evidenceDef.enum.length >= 14, `EvidenceType 包含 ${evidenceDef.enum.length} 种证据类型（>=14）`);
  }

  // 检查决策路径类型
  const pathDef = enums.definitions?.DecisionPathType;
  check(pathDef && pathDef.enum, 'DecisionPathType 定义存在且包含 enum');
  if (pathDef?.enum) {
    check(pathDef.enum.includes('personaBest'), '包含 personaBest');
    check(pathDef.enum.includes('balanced'), '包含 balanced');
    check(pathDef.enum.includes('lowCost'), '包含 lowCost');
    check(pathDef.enum.includes('newDirection'), '包含 newDirection');
  }
}

// --- 3. 验证 PersonaProfile.json 的 traits ---
console.log('\n3. 验证 PersonaProfile.json traits');
if (schemas['PersonaProfile.json']) {
  const profile = schemas['PersonaProfile.json'];
  const traitsRequired = profile.properties?.traits?.required;
  check(traitsRequired, 'traits 有 required 字段');
  if (traitsRequired) {
    check(
      JSON.stringify(traitsRequired.sort()) === JSON.stringify(CANONICAL_TRAIT_KEYS.sort()),
      `traits.required 包含完整16维: ${traitsRequired.length} 个`
    );
  }

  const personaTrait = profile.definitions?.PersonaTrait;
  check(personaTrait, 'PersonaTrait 定义存在');
  if (personaTrait) {
    check(personaTrait.properties?.mean, 'PersonaTrait.mean 存在');
    check(personaTrait.properties?.confidence, 'PersonaTrait.confidence 存在');
    check(personaTrait.properties?.evidenceCount, 'PersonaTrait.evidenceCount 存在');
    check(personaTrait.properties?.lockedByUser, 'PersonaTrait.lockedByUser 存在');
  }
}

// --- 4. 验证 PlanResponse.json 的核心结构 ---
console.log('\n4. 验证 PlanResponse.json');
if (schemas['PlanResponse.json']) {
  const planResp = schemas['PlanResponse.json'];
  const required = planResp.required;
  check(required, 'PlanResponse 有 required 字段');
  if (required) {
    check(required.includes('planId'), 'required 包含 planId');
    check(required.includes('personaSnapshot'), 'required 包含 personaSnapshot');
    check(required.includes('decisionPaths'), 'required 包含 decisionPaths');
    check(required.includes('generatedAt'), 'required 包含 generatedAt');
    check(required.includes('dataVersion'), 'required 包含 dataVersion');
    check(required.includes('capability'), 'required 包含 capability');
  }

  const dp = planResp.definitions?.DecisionPath;
  check(dp, 'DecisionPath 定义存在');
  if (dp) {
    check(dp.required?.includes('personaFit'), 'DecisionPath.required 包含 personaFit');
    const dpProps = dp.properties;
    check(dpProps?.personaFit?.maximum === 1 && dpProps?.personaFit?.minimum === 0, 'personaFit 范围 [0,1]');
  }

  const cap = planResp.definitions?.Capability;
  check(cap, 'Capability 定义存在');
  if (cap?.properties) {
    check(cap.properties.agentApplied, 'Capability 包含 agentApplied');
    check(cap.properties.mapFreshness, 'Capability 包含 mapFreshness');
  }
}

// --- 5. 验证 EvidenceRef.json ---
console.log('\n5. 验证 EvidenceRef.json');
if (schemas['EvidenceRef.json']) {
  const evidence = schemas['EvidenceRef.json'];
  const required = evidence.required;
  check(required, 'EvidenceRef 有 required 字段');
  if (required) {
    check(required.includes('id'), 'required 包含 id');
    check(required.includes('type'), 'required 包含 type');
    check(required.includes('source'), 'required 包含 source');
    check(required.includes('reliability'), 'required 包含 reliability');
  }
  check(
    evidence.properties?.reliability?.minimum === 0 && evidence.properties?.reliability?.maximum === 1,
    'reliability 范围 [0,1]'
  );
}

// --- 6. 验证 ErrorCodes.json ---
console.log('\n6. 验证 ErrorCodes.json');
if (schemas['ErrorCodes.json']) {
  const errors = schemas['ErrorCodes.json'];
  const travelErr = errors.definitions?.TravelError;
  check(travelErr, 'TravelError 定义存在');
  if (travelErr) {
    check(travelErr.required?.includes('code'), 'TravelError.required 包含 code');
    check(travelErr.required?.includes('userVisible'), 'TravelError.required 包含 userVisible');
    check(travelErr.properties?.code?.pattern === '^TP-\\d{4}$', 'code 模式为 TP-NNNN');
  }
}

// --- 7. 验证错误码注册表 ---
console.log('\n7. 验证错误码注册表');
const registryPath = path.join(SCHEMAS_DIR, 'error-code-registry.md');
if (fs.existsSync(registryPath)) {
  const registry = fs.readFileSync(registryPath, 'utf-8');
  check(true, 'error-code-registry.md 存在');

  const tpCodes = registry.match(/TP-\d{4}/g) || [];
  check(tpCodes.length > 20, `注册表包含 ${tpCodes.length} 个错误码（>20）`);

  const uniqueCodes = new Set(tpCodes);
  check(uniqueCodes.size === tpCodes.length, `所有 ${uniqueCodes.size} 个错误码唯一无重复`);
}

// --- 8. 验证 TypeScript 声明 ---
console.log('\n8. 验证 index.d.ts');
const dtsPath = path.join(SCHEMAS_DIR, 'index.d.ts');
if (fs.existsSync(dtsPath)) {
  const dts = fs.readFileSync(dtsPath, 'utf-8');
  check(true, 'index.d.ts 存在');

  for (const key of CANONICAL_TRAIT_KEYS) {
    check(dts.includes(`'${key}'`), `index.d.ts 包含 '${key}'`);
  }

  check(dts.includes('PersonaProfile'), '包含 PersonaProfile 接口');
  check(dts.includes('TripIntent'), '包含 TripIntent 接口');
  check(dts.includes('TripContext'), '包含 TripContext 接口');
  check(dts.includes('PlanResponse'), '包含 PlanResponse 接口');
  check(dts.includes('EvidenceRef'), '包含 EvidenceRef 接口');
  check(dts.includes('DecisionPath'), '包含 DecisionPath 接口');
  check(dts.includes('TravelError'), '包含 TravelError 接口');
  check(dts.includes('DataVersion'), '包含 DataVersion 接口');
} else {
  check(false, 'index.d.ts 不存在');
}

// --- 9. 验证 ADR 文件 ---
console.log('\n9. 验证 ADR 文件');
const decisionsDir = path.join(__dirname, '..', 'decisions');
if (fs.existsSync(decisionsDir)) {
  const adrFiles = fs.readdirSync(decisionsDir)
    .filter(f => f.endsWith('.md') && /^\d{4}-/.test(f))
    .sort();

  check(adrFiles.length >= 4, `找到 ${adrFiles.length} 个 ADR 文件（>=4）`);

  const requiredADRs = [
    '0001-sixteen-dimensions-as-canonical.md',
    '0002-schema-as-single-source-of-truth.md',
    '0003-legacy-demo-freeze.md',
    '0004-six-dimension-boundary.md'
  ];
  for (const adr of requiredADRs) {
    check(adrFiles.includes(adr), `存在 ADR: ${adr}`);
  }
}

// --- 10. 验证迁移说明 ---
console.log('\n10. 验证迁移说明');
const migrationDir = path.join(__dirname, '..', 'migration');
if (fs.existsSync(migrationDir)) {
  const migrationFiles = fs.readdirSync(migrationDir).filter(f => f.endsWith('.md'));
  check(migrationFiles.includes('six-to-sixteen-dimensions.md'), '存在迁移说明: six-to-sixteen-dimensions.md');

  if (migrationFiles.includes('six-to-sixteen-dimensions.md')) {
    const content = fs.readFileSync(path.join(migrationDir, 'six-to-sixteen-dimensions.md'), 'utf-8');
    check(content.includes('freedom') && content.includes('workation'), '包含旧→新维度映射');
    check(content.includes('scoring.js') && content.includes('fallbackPlanner.js'), '包含代码影响范围');
  }
}

// --- 结果 ---
console.log('\n=== 验证结果 ===');
console.log(`通过: ${passed}`);
console.log(`失败: ${failed}`);
console.log(`总计: ${passed + failed}\n`);

if (failed > 0) {
  console.log('存在失败项，请检查后再继续。');
  process.exit(1);
} else {
  console.log('所有检查通过。Phase 0 Schema 一致性验证完成。');
  process.exit(0);
}
