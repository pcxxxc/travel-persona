# 0001: 16维体系作为唯一正规产品维度

## 状态

已采纳

## 背景

项目当前存在两套人格维度体系：

1. **旧6维**：freedom, social, explore, nature, pace, budget
   - 用于 `src/core/scoring.js`、`src/data/dimensionMapping.js`、`src/models.js`
   - 加权欧氏距离算法
   - 9张映射表

2. **新16维**：restoration, nature, culture, food, pace, social, budget, aesthetics, comfort, novelty, transit, lowCrowd, authenticity, weatherFlex, bookingEase, workation
   - 用于 `src/services/fallbackPlanner.js`、`public-site/travel-persona/assets/data.js`
   - 16种人格原型、17城数据

此外，`travel7.9/travel/src/algo/` 中的历史高级算法模块也基于旧6维。

两套体系并存导致前后端数据模型不一致、新增代码无法确定应基于哪套维度。

## 决策

**新16维体系（restoration, nature, culture, food, pace, social, budget, aesthetics, comfort, novelty, transit, lowCrowd, authenticity, weatherFlex, bookingEase, workation）是旅格唯一的正规产品维度体系。**

依据：总纲 3.2 节明确定义了16维，是产品的 Single Source of Truth。

旧6维代码在 Phase 0 不修改运行逻辑，仅标记为 legacy。所有新代码（Phase 1 起）必须基于16维。

## 备选方案

1. **统一为新6维**：精简维度。否决——总纲已明确16维，且16维能更细致地捕获用户偏好差异。
2. **两套并存，通过适配层转换**：否决——总纲明确禁止"前端、后端各自维护城市与人格逻辑的方案"。

## 后果

**正面：**
- 消除维度歧义，所有实现者使用同一种语言
- 16维更精细，能区分"恢复需求"和"自然偏好"、"社交"和"反拥挤"等概念

**负面：**
- 旧6维代码（scoring.js、dimensionMapping.js、models.js）需要迁移或废弃
- travel7.9 中的高级算法模块不能直接复制，思路需适配16维

## 迁移

- Phase 0：标记旧6维文件为 legacy，建立16维 JSON Schema 合同
- Phase 1：基于16维重构算法引擎，旧6维代码移入 `legacy/` 目录

## 验证

- `docs/schemas/PersonaProfile.json` 定义了完整的16维
- `docs/migration/six-to-sixteen-dimensions.md` 记录了旧6维到新16维的映射关系
- Phase 1 算法引擎的所有测试基于16维数据
