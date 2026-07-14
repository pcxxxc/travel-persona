/**
 * 旅格 Travel Persona -- 共享类型声明
 *
 * 本文件是 Single Source of Truth 的类型层，与 docs/schemas/ 下的 JSON Schema 保持一致。
 * Phase 0 手工维护，Phase 1 引入 json-schema-to-typescript 自动生成。
 *
 * 对应总纲：
 * - 3.1 四层用户模型（Persona Core / Trip Intent / Trip Context / Travel Trace）
 * - 3.2 16维人格模型
 * - 7.2 证据等级
 * - 7.4-7.6 推荐管线
 * - 11.4 统一响应合同
 */

// ============================================================
// 枚举类型
// ============================================================

/** 16维人格维度key，总纲3.2 */
export type TraitKey =
  | 'restoration'
  | 'nature'
  | 'culture'
  | 'food'
  | 'pace'
  | 'social'
  | 'budget'
  | 'aesthetics'
  | 'comfort'
  | 'novelty'
  | 'transit'
  | 'lowCrowd'
  | 'authenticity'
  | 'weatherFlex'
  | 'bookingEase'
  | 'workation';

/** 16维key列表常量 */
export const TRAIT_KEYS: TraitKey[];

/** 6种旅行动机，对应冷启动第一步 */
export type MoodType =
  | 'restore'
  | 'escape'
  | 'inspire'
  | 'social'
  | 'efficient'
  | 'live';

/** 兴趣标签 */
export type InterestType =
  | 'nature'
  | 'oldtown'
  | 'art'
  | 'coffee'
  | 'food'
  | 'photo'
  | 'museum'
  | 'hidden';

/** 避坑标签 */
export type AvoidType =
  | 'crowd'
  | 'commercial'
  | 'climb'
  | 'early'
  | 'longTransit'
  | 'expensive';

/** 同行关系 */
export type CompanionType =
  | 'solo'
  | 'couple'
  | 'friends'
  | 'family'
  | 'group';

/** 决策路径类型，总纲7.6 */
export type DecisionPathType =
  | 'personaBest'
  | 'balanced'
  | 'lowCost'
  | 'newDirection';

/** 证据类型，总纲7.2 */
export type EvidenceType =
  | 'userCorrection'
  | 'tripReview'
  | 'confirmedTrip'
  | 'statedPreference'
  | 'repeatedAction'
  | 'visit'
  | 'cancellation'
  | 'favorite'
  | 'photo'
  | 'journalEntry'
  | 'mapData'
  | 'communitySignal'
  | 'weatherData'
  | 'expertAnnotation';

/** 错误类型 */
export type ErrorType =
  | 'VALIDATION'
  | 'DATA'
  | 'ALGORITHM'
  | 'LLM'
  | 'NETWORK'
  | 'AUTH'
  | 'PERMISSION'
  | 'SENSITIVITY'
  | 'RATE_LIMIT'
  | 'UNKNOWN';

/** 已弃用的旧6维，仅迁移用 */
export type LegacySixDim = 'freedom' | 'social' | 'explore' | 'nature' | 'pace' | 'budget';

// ============================================================
// 人格模型 -- 总纲3.1 Persona Core 层
// ============================================================

/** 单维人格特征，总纲3.2 PersonaTrait */
export interface PersonaTrait {
  key: TraitKey;
  /** 当前估计值（贝叶斯后验均值）0..1 */
  mean: number;
  /** 证据可信度 0..1 */
  confidence: number;
  /** 累计证据数量 */
  evidenceCount: number;
  /** 最后更新时间 */
  lastUpdatedAt: string;
  /** 用户手动锁定 */
  lockedByUser: boolean;
}

/** 人格原型展示信息，总纲3.3。原型由向量与原型中心相似度派生，不参与推荐排序。 */
export interface PersonaTypeDisplay {
  id: string;
  name: string;
  confidence: number;
  secondary?: {
    id: string;
    name: string;
    confidence: number;
  };
  /** 最高与次高差距过小时显示混合标签 */
  blendLabel?: string;
}

/** 用户旅行人格档案，总纲3.1 Persona Core 层 */
export interface PersonaProfile {
  profileId: string;
  userId?: string;
  traits: Record<TraitKey, PersonaTrait>;
  primaryPersona?: PersonaTypeDisplay;
  lockedTraits: TraitKey[];
  excludedEvidenceIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================
// 当次取向 -- 总纲3.1 Trip Intent 层
// ============================================================

/** 当次旅行取向。不直接改变长期人格。 */
export interface TripIntent {
  mood: MoodType;
  moodLabel?: string;
  interests?: InterestType[];
  avoid?: AvoidType[];
  freeText?: string;
  companion?: CompanionType;
  destination?: string;
}

// ============================================================
// 现实状态 -- 总纲3.1 Trip Context 层
// ============================================================

/** 预算弹性，总纲5.3 */
export interface BudgetElasticity {
  /** 舒适总预算（本次旅行中不需要反复犹豫的金额） */
  comfort?: number;
  /** 可接受上限（硬约束过滤条件） */
  hardMax?: number;
  /** 节省目标（用户主动希望压缩的金额） */
  saveTarget?: number;
}

/** 现实状态。算法不得因现实条件改变长期人格。 */
export interface TripContext {
  origin?: string;
  days: number;
  budget?: BudgetElasticity;
  season?: 'spring' | 'summer' | 'autumn' | 'winter' | 'unknown';
  weatherContext?: {
    forecast: unknown[];
    source: string;
    fetchedAt: string;
  };
}

// ============================================================
// 证据 -- 总纲7.2
// ============================================================

/** 证据引用。每条影响推荐或人格的数据都必须可追溯到来源。 */
export interface EvidenceRef {
  id: string;
  type: EvidenceType;
  source: string;
  /** 可靠度先验 0..1，参考总纲7.2证据等级表 */
  reliability: number;
  excluded: boolean;
  createdAt: string;
  expiresAt?: string;
  dimensionImpact?: Record<string, {
    traitKey: TraitKey;
    direction: 'positive' | 'negative' | 'neutral';
    /** 单维最大变化0.08，总纲7.3 */
    magnitude: number;
  }>;
}

// ============================================================
// 规划响应 -- 总纲11.4
// ============================================================

/** 成本估算 */
export interface CostEstimate {
  totalMin: number;
  totalMax: number;
  currency: string;
  mostUncertain?: string;
}

/** 城市摘要（Phase 1 细化） */
export interface CityBrief {
  id: string;
  name: string;
  province?: string;
}

/** 分数分解，总纲7.5多目标基础分 */
export interface ScoreBreakdown {
  personaFit: number;       // 0.28
  tripIntentFit: number;   // 0.18
  contextFit: number;      // 0.16
  routeEfficiency: number; // 0.14
  evidenceQuality: number; // 0.10
  resilience: number;      // 0.08
  novelty: number;         // 0.06
  riskPenalty: number;
}

/** 决策路径，总纲7.6 */
export interface DecisionPath {
  type: DecisionPathType;
  city: CityBrief;
  totalScore: number;
  /** 人格匹配度，主推荐默认 >= 0.62（总纲7.4保护门槛） */
  personaFit: number;
  costEstimate: CostEstimate;
  /** 适合你的理由 */
  reason: string;
  /** 不适合或需要付出的代价 */
  watchOut: string;
  /** 反事实解释，如"如果把预算降低15%会怎样" */
  counterfactual?: string;
  breakdown: ScoreBreakdown;
}

/** 推荐解释，总纲7.7 */
export interface Explanation {
  type: 'whyFit' | 'evidence' | 'uncertainty' | 'cost' | 'counterfactual';
  content: string;
  evidenceIds?: string[];
}

/** 不确定项 */
export interface Uncertainty {
  field: string;
  level: 'low' | 'medium' | 'high';
  reason: string;
  improveAction?: string;
}

/** 能力状态 */
export interface Capability {
  mapFreshness: 'live' | 'cached' | 'snapshot' | 'unavailable';
  weatherFreshness: 'live' | 'cached' | 'unavailable';
  /** 仅内部使用，不得传入用户界面文案层 */
  agentApplied: boolean;
}

/** 人格快照（规划时使用） */
export interface PersonaSnapshot {
  traits: Record<string, number>;
  primaryPersona?: PersonaTypeDisplay;
  confidence: number;
}

/** 可执行计划（Phase 1 细化） */
export interface ExecutablePlan {
  planId: string;
  days: {
    dayIndex: number;
    nodes: unknown[];
  }[];
}

/** 统一规划响应。本地规划器与Agent输出同构。 */
export interface PlanResponse {
  planId: string;
  personaSnapshot: PersonaSnapshot;
  /** 1-4条：人格本选、现实平衡、低成本方案，可选新方向 */
  decisionPaths: DecisionPath[];
  selectedPlan?: ExecutablePlan;
  explanations: Explanation[];
  evidence: EvidenceRef[];
  uncertainties: Uncertainty[];
  generatedAt: string;
  dataVersion: DataVersion;
  capability: Capability;
}

// ============================================================
// 版本 -- 总纲9.7
// ============================================================

/** 数据版本快照 */
export interface DataVersion {
  personaModel: string;
  weightVersion: string;
  cityDataSnapshot: string;
  mapQueryTime?: string;
  weatherQueryTime?: string;
  communitySignalVersion?: string;
  agentModelVersion?: string;
}

// ============================================================
// 错误码
// ============================================================

/** 统一错误结构 */
export interface TravelError {
  code: string;        // TP-NNNN
  type: ErrorType;
  message: string;
  userMessage?: string;
  userVisible: boolean;
  recoverable: boolean;
  context?: Record<string, unknown>;
  traceId?: string;
  timestamp?: string;
}

// ============================================================
// 幂等
// ============================================================

export interface IdempotentRequest {
  idempotencyKey: string;
}

export interface IdempotentResponse {
  idempotencyKey: string;
  firstProcessedAt: string;
  isReplay: boolean;
}
