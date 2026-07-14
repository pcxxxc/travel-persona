# 旧6维到新16维迁移说明

> 参见：总纲3.2（16维定义）、ADR 0001（16维作为canonical）、ADR 0004（代码边界）

---

## 1. 维度对照表

| 旧6维 | 对应新16维 | 映射说明 |
|--------|-----------|---------|
| **freedom** | workation + novelty + authenticity | "自由"拆分为：试住/数字游民倾向(workation)、新鲜探索(novelty)、在地真实感(authenticity) |
| **social** | social + lowCrowd | "社交"保留，新增反拥挤偏好(lowCrowd)——社交和怕挤是不同需求 |
| **explore** | novelty + culture + authenticity | "探索"拆分为：新鲜体验(novelty)、文化深度(culture)、在地真实感(authenticity) |
| **nature** | nature + restoration + weatherFlex | "自然"保留，新增恢复需求(restoration)和天气容错(weatherFlex)——喜欢自然不等于需要恢复，也不等于接受任何天气 |
| **pace** | pace + comfort + transit + bookingEase | "节奏"保留，新增舒适需求(comfort)、交通确定性(transit)和预约轻量(bookingEase)——慢节奏可能只是不想赶路，但还需要舒适和确定交通 |
| **budget** | budget | 直接对应，但升级为概率模型带置信度 |

### 新增的独立维度

| 新维度 | 旧体系中无对应 | 原因 |
|--------|--------------|------|
| **aesthetics** | 无 | 审美偏好是独立维度，不属于探索或自然 |
| **food** | 无 | 美食偏好是独立的旅行决策因素 |
| **comfort** | 隐含在 pace 中 | 舒适需求不等同于节奏——可能想要慢节奏但不介意艰苦，或想要快节奏但必须舒适 |

---

## 2. 代码影响范围

### 仍使用旧6维的文件（标记为 legacy）

| 文件 | 维度体系 | Phase 0 处理 |
|------|---------|-------------|
| `src/core/scoring.js` | 6维加权欧氏距离 | 标记 LEGACY，Phase 1 不再使用 |
| `src/data/dimensionMapping.js` | 6维映射表（9张） | 标记 LEGACY，Phase 1 不再使用 |
| `src/data/cityDatabase.js` | 6维城市数据 | 标记 LEGACY，Phase 1 不再使用 |
| `src/models.js` | 6维模型定义 | 标记 LEGACY，被 docs/schemas/ 替代 |
| `src/utils/validation.js` | 6维 DIMENSIONS 常量 | 标记 LEGACY，Phase 1 扩展为16维或创建新模块 |
| `test/verify.js` | 6维测试 | 标记 LEGACY |
| `test/planner-engine.js` | 6维测试 | 标记 LEGACY |
| `travel7.9/travel/src/algo/*.js` | 6维（8个模块） | 历史副本，不直接迁移 |

### 已使用新16维的文件（canonical）

| 文件 | 维度体系 | 说明 |
|------|---------|------|
| `src/services/fallbackPlanner.js` | 16维 TRAIT_WEIGHTS | 16维向量构建(buildVector)与相似度计算 |
| `public-site/travel-persona/assets/data.js` | 16维 | 16种人格原型、17城16维数据、traitLabels |
| `docs/schemas/*.json` | 16维 | **正规产品 Schema（Phase 0 新建）** |
| `docs/schemas/index.d.ts` | 16维 | **正规类型声明（Phase 0 新建）** |

---

## 3. 旧6维模块的核心逻辑与新16维的对应关系

### scoring.js → 新推荐引擎

| 旧功能 | 新实现位置 | 变化 |
|--------|-----------|------|
| `computePersonaScore(questionnaire)` 加权欧氏距离 | `packages/persona-engine/` 贝叶斯更新 | 从加法累加改为概率更新 |
| `recommendCities(userScore, cities)` | `packages/recommendation/` 多目标评分 | 从单分数排序改为多层管线（硬约束→人格门槛→Pareto→MMR） |
| `generateReason(city, score)` | `packages/recommendation/` 解释模块 | 从简单模板改为四层解释（直觉→量化→反事实→决策树） |
| `inferPersonaLabel(score)` | `packages/persona-engine/` 原型派生 | 从硬编码阈值改为与原型中心的相似度 |

### dimensionMapping.js → 新映射系统

| 旧功能 | 新实现位置 | 变化 |
|--------|-----------|------|
| 9张问卷映射表 | 渐进式取样系统 | 从一次性问卷改为渐进展开 |
| 每个选项固定增量 | 证据系统 | 从固定增量改为带可靠度的证据 |

### models.js → 共享 Schema

| 旧类型 | 新类型 | 变化 |
|--------|--------|------|
| `PersonaScore { freedom, social, ... }` | `PersonaProfile { traits: Record<TraitKey, PersonaTrait> }` | 从简单数值升级为概率状态 |
| `City { dimensions: {...} }` | `CityRecord { traitVector, traitConfidence, ... }` | 从简单向量升级为带置信度的画像 |
| `TravelState` | `TripIntent` + `TripContext` | 从混合状态拆分为当次取向和现实条件 |

---

## 4. 迁移策略

### Phase 0（当前）
- 建立共享 Schema 合同（16维）
- 标记旧6维文件为 legacy
- 编写本迁移说明

### Phase 1（本地高质量规划核心）
- 基于16维构建新的 `persona-engine` 和 `recommendation` 模块
- 旧6维代码保留在原位但不被新模块引用
- 新测试全部基于16维

### Phase 2（地图、数据平台与路线优化）
- 城市数据从6维迁移为16维（需要重新标注）
- 旧 `cityDatabase.js` 中的数据不再使用

### Phase 3（用户应用与视觉系统）
- 前端从 `data.js` 中的16维数据迁移为通过 API 获取
- 旧前端页面冻结为 legacy

### 清理（Phase 6 后可选）
- 将旧6维文件整体移入 `legacy/` 目录
- 从 `package.json` 中移除对旧模块的引用
- 删除不再需要的旧测试文件

---

## 5. 注意事项

1. **fallbackPlanner.js 是过渡桥梁**：它已经使用了16维，但数据源仍来自 `data.js`。Phase 1 的新引擎应直接使用数据库中的城市数据。
2. **前端 data.js 包含大量可用数据**：17城的16维向量、16种人格原型、路线走廊数据等。Phase 2 城市数据平台建设时，这些数据应迁移到数据库中。
3. **travel7.9 高级算法思路价值高**：`multiLayerScorer.js`、`paretoOptimizer.js`、`explainability.js` 的架构思路可直接用于16维新引擎，但代码需要重写而非复制。
