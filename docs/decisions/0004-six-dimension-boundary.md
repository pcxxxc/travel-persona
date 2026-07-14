# 0004: 旧6维与新16维代码边界

## 状态

已采纳

## 背景

项目中存在基于旧6维和新16维的两套代码。Phase 0 不修改旧6维代码的运行逻辑，但必须明确边界，防止新代码误用旧维度的数据结构。

## 决策

**旧6维代码在 Phase 0 仅标记不修改；新代码全部基于16维。**

### 旧6维文件（legacy，Phase 1 后移入 `legacy/` 目录）

| 文件 | 维度 | 说明 |
|------|------|------|
| `src/core/scoring.js` | 6维：freedom, social, explore, nature, pace, budget | 旧加权欧氏距离评分 |
| `src/data/dimensionMapping.js` | 6维 | 9张问卷映射表 |
| `src/data/cityDatabase.js` | 6维 | 旧城市数据（20城） |
| `src/models.js` | 6维 | 旧数据模型定义（PersonaScore, City 等） |
| `src/utils/validation.js` | 6维 DIMENSIONS 常量 | 旧输入验证 |
| `test/verify.js` | 6维 | 旧测试用例 |
| `test/planner-engine.js` | 6维 | 旧规划器测试 |
| `travel7.9/travel/src/algo/*.js` | 6维（全部8个模块） | 历史副本，思路可迁移 |

### 新16维文件（canonical，Phase 0 后作为正规参考）

| 文件 | 维度 | 说明 |
|------|------|------|
| `src/services/fallbackPlanner.js` | 16维 TRAIT_WEIGHTS | 16维向量构建与推荐 |
| `public-site/travel-persona/assets/data.js` | 16维 | 16种人格原型、17城16维数据 |
| `docs/schemas/*.json` | 16维 | **正规产品 Schema（Phase 0 新建）** |
| `docs/schemas/index.d.ts` | 16维 | **正规类型声明（Phase 0 新建）** |

### 维度映射关系

| 旧6维 | 对应新16维 | 映射说明 |
|--------|-----------|---------|
| freedom | workation + novelty + authenticity | "自由"拆分为试住、新鲜探索和在地真实感 |
| social | social + lowCrowd | "社交"保留，新增反拥挤偏好 |
| explore | novelty + culture + authenticity | "探索"拆分为新鲜、文化和在地感 |
| nature | nature + restoration + weatherFlex | "自然"保留，新增恢复需求和天气容错 |
| pace | pace + comfort + transit + bookingEase | "节奏"保留，新增舒适、交通确定和预约轻量 |
| budget | budget | 直接对应 |

## 备选方案

1. **立即删除旧6维代码**：否决——Phase 0 不做破坏性修改，且部分旧代码可能被现有 API 路由引用。
2. **将旧6维适配为16维的包装层**：否决——增加复杂度，不如直接在 Phase 1 基于16维重写。

## 后果

**正面：**
- 边界清晰，新开发者不会混淆
- 旧代码可继续运行，不阻塞现有 Demo

**负面：**
- 短期内项目中同时存在两套维度代码
- 旧 API 路由仍返回旧6维格式的数据

## 迁移

- Phase 0：标记旧文件头部为 legacy
- Phase 1：基于16维构建新的算法引擎，旧6维文件移入 `legacy/`
- Phase 2：新 API 使用16维响应格式，旧 API 逐步废弃

## 验证

- 旧6维文件顶部包含 `LEGACY` 标记注释
- `docs/migration/six-to-sixteen-dimensions.md` 记录完整映射
- Phase 1 新算法引擎不 import 任何旧6维模块
