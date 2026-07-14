# 0002: Schema 作为前后端唯一数据合同来源

## 状态

已采纳

## 背景

当前项目中，前端 `public-site/travel-persona/assets/data.js` 和后端 `src/data/cityDatabase.js` 各自维护城市和人格数据。前端有18城，后端有20城；前端使用16维向量，后端旧算法使用6维。任何修改需要同步两处，极易遗漏。

Week1-2 深度完善计划中已将此问题标记为 P1-4（城市数据不一致风险）。

总纲 0.3 执行纪律第3条和 13.3 仓库结构都明确要求使用共享 contracts。

## 决策

**所有前后端交互必须通过 `docs/schemas/` 目录中的 JSON Schema 校验。** Schema 是数据合同的唯一真实来源（Single Source of Truth）。

具体规则：
1. 新增或修改 API 接口时，必须先更新 `docs/schemas/` 中的对应 Schema
2. 前端和后端不得各自定义冲突的数据结构
3. `docs/schemas/index.d.ts` 提供对应的 TypeScript 类型声明

## 备选方案

1. **前端直接引用后端模块**：否决——前后端将部署为独立应用（Phase 3）
2. **通过 Swagger/OpenAPI 自动生成**：否决——Phase 0 不引入代码生成工具，手工维护 Schema 即可，Phase 1 再引入自动化

## 后果

**正面：**
- 消除前后端数据漂移
- 新开发者有明确的数据合同参考
- Schema 可用于单元测试的契约验证

**负面：**
- Phase 0 需要手工维护 JSON Schema 和 .d.ts 的一致性
- 增加了一层间接性，简单修改也需要更新 Schema

## 迁移

- Phase 0：建立核心 Schema 文件
- Phase 1：引入 `ajv` 做运行时校验；引入 `json-schema-to-typescript` 自动生成 .d.ts
- Phase 3：前端直接从 `packages/contracts/` 导入类型（总纲13.3推荐的 monorepo 结构）

## 验证

- `docs/schemas/validate-consistency.js` 验证所有 Schema 文件内部一致
- 前后端测试共享同一套测试数据 fixture
- API 响应可通过 Schema 校验
