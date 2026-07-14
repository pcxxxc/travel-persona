/**
 * 旅格 Travel Persona · 可解释性引擎（v3）
 *
 * 核心目标：让推荐不再是"黑盒"，而是可理解、可质疑、可修正。
 *
 * 四层解释体系：
 * 1. 直觉层：一句话解释（"你最近状态很累，大理最适合你"）
 * 2. 量化层：维度拆解（雷达图 + 每个维度的匹配/不匹配原因）
 * 3. 反事实层："如果...那就..."的假设推理
 *    - "如果你的预算翻倍，你会更匹配上海"
 *    - "如果你想要更多社交，成都可能比大理更适合你"
 * 4. 决策树层：从根到叶的推理路径可视化
 *
 * 纯函数设计，零外部状态。
 */

const { DIMENSIONS, WEIGHTS } = require('./multiLayerScorer');

// ============================================================
// 一、直觉层解释
// ============================================================

/**
 * 生成一句话核心解释
 *
 * 格式：情绪驱动 → 人格画像 → 城市匹配的逻辑链
 */
function generateIntuitiveExplanation(userScore, city, options = {}) {
  const { userQuote = '', mood = '' } = options;

  // 找出用户最凸出的 2 个维度
  const topDims = findDominantDimensions(userScore, 2);
  const primaryDim = topDims[0];
  const secondaryDim = topDims[1];

  // 维度→自然语言映射
  const dimToNatural = {
    nature: { high: '渴望自然与宁静', low: '更喜欢城市人文' },
    pace: { high: '享受快节奏高效体验', low: '需要慢下来喘口气' },
    social: { high: '想要热闹和连接', low: '更想独处和安静' },
    budget: { high: '预算宽裕讲究品质', low: '希望精打细算' },
    explore: { high: '渴望新鲜感和探索', low: '喜欢熟悉可控的安排' },
    freedom: { high: '向往自由随性的旅程', low: '偏好有计划的行程' }
  };

  const primaryState = userScore[primaryDim.dim] > 0.6 ? 'high' : 'low';
  const userNeed = dimToNatural[primaryDim.dim]?.[primaryState] || '寻找适合自己的旅行';

  // 城市适配的语言
  const cityTags = city.emotionTags || [];
  const cityVibe = city.profile?.vibe || city.name + '的气质';

  // 组装
  let explanation = '';

  if (mood) {
    explanation += `你最近的「${mood}」状态下，`;
  }

  explanation += `你${userNeed}。`;
  explanation += `${city.name}的${cityVibe}与此高度共鸣`;

  if (cityTags.length > 0) {
    explanation += `——${cityTags.slice(0, 2).join('、')}`;
  }

  explanation += '。';

  return {
    oneLiner: explanation,
    primaryDrive: { dimension: primaryDim.dim, value: primaryDim.value, intensity: primaryState },
    secondaryDrive: secondaryDim ? { dimension: secondaryDim.dim, value: secondaryDim.value } : null,
    citySignal: { name: city.name, vibe: cityVibe, tags: cityTags }
  };
}

function findDominantDimensions(userScore, n = 2) {
  return DIMENSIONS
    .map(dim => ({ dim, value: userScore[dim] || 0.5, deviation: Math.abs((userScore[dim] || 0.5) - 0.5) }))
    .sort((a, b) => b.deviation - a.deviation)
    .slice(0, n);
}

// ============================================================
// 二、量化层解释
// ============================================================

/**
 * 生成维度级拆解
 *
 * 对每个维度，说明：
 * - 用户画像值 vs 城市值
 * - 匹配度（%）
 * - 是优势还是劣势
 * - 一句话解释
 */
function generateDimensionalBreakdown(userScore, city, matchContributions) {
  const dimNames = {
    nature: '自然匹配', pace: '节奏匹配', social: '社交匹配',
    budget: '消费匹配', explore: '探索匹配', freedom: '自由度'
  };

  const dimExplanations = {
    nature: {
      high: { match: '你和这座城市都热爱自然，一起去山海之间吧', mismatch: '你更需要大自然，但这座城市偏城市感' },
      low: { match: '你更喜欢城市人文，这座城市刚好满足', mismatch: '你对自然的需求不高，但这座城市自然元素较多' }
    },
    pace: {
      high: { match: '快节奏+高效游，不浪费一分钟', mismatch: '你想要快节奏，但这座城市更适合慢慢品味' },
      low: { match: '慢下来不赶路，节奏刚好', mismatch: '你需要放松，但这座城市节奏偏快' }
    },
    social: {
      high: { match: '热闹、烟火气、人情味，都对了', mismatch: '你想要社交氛围，这座城市偏安静' },
      low: { match: '安静独处的空间，正好是你需要的', mismatch: '你想安静，但这里社交属性较强' }
    },
    budget: {
      high: { match: '品质消费无压力，体验不打折', mismatch: '你预算充足，但这里选择有限' },
      low: { match: '性价比高，精打细算也不亏', mismatch: '你需要控制预算，但这里消费偏高' }
    },
    explore: {
      high: { match: '新鲜感够足，不会无聊', mismatch: '你想要探索新事物，这里偏常规' },
      low: { match: '熟悉可控不焦虑，刚好是你要的', mismatch: '你偏好确定性，但这里需要更多探索精神' }
    },
    freedom: {
      high: { match: '自由安排无压力，想怎么走就怎么走', mismatch: '你需要自由度，但这里行程可能需要更多规划' },
      low: { match: '结构化的安排让你安心', mismatch: '你喜欢计划，但这里更适合随性而行' }
    }
  };

  const breakdown = [];

  for (const dim of DIMENSIONS) {
    const userVal = userScore[dim] || 0.5;
    const cityVal = city.dimensions?.[dim] || 0.5;
    const contribution = matchContributions?.[dim] || {};
    const matchPct = Math.round((1 - Math.abs(userVal - cityVal)) * 100);

    const state = userVal > 0.55 ? 'high' : userVal < 0.45 ? 'low' : 'mid';
    const matchType = matchPct >= 70 ? 'match' : 'mismatch';

    let explanation = '';
    if (matchPct >= 70) {
      explanation = dimExplanations[dim]?.[state]?.match || '这个维度的匹配度很高';
    } else if (matchPct <= 40) {
      explanation = dimExplanations[dim]?.[state]?.mismatch || '这个维度需要你留意';
    } else {
      explanation = `${dimNames[dim] || dim}处于中等水平，可以接受`;
    }

    breakdown.push({
      dimension: dim,
      label: dimNames[dim] || dim,
      userValue: parseFloat(userVal.toFixed(2)),
      cityValue: parseFloat(cityVal.toFixed(2)),
      matchPercent: matchPct,
      isStrength: matchPct >= 65,
      isWeakness: matchPct <= 40,
      explanation,
      weight: WEIGHTS[dim] || 0
    });
  }

  // 按匹配度排序：最匹配在前，最不匹配在后
  breakdown.sort((a, b) => b.matchPercent - a.matchPercent);

  return {
    dimensions: breakdown,
    strengths: breakdown.filter(d => d.isStrength),
    weaknesses: breakdown.filter(d => d.isWeakness),
    overallVerdict: breakdown.slice(0, 3).map(d => d.explanation).join('；')
  };
}

// ============================================================
// 三、反事实推理
// ============================================================

/**
 * 生成反事实推理
 *
 * "如果 X 变了，Y 会是更好的选择" 这种推理让用户理解
 * 推荐不是绝对的，而是基于当前输入的。
 *
 * 类型：
 * - counterfactual: "如果你的预算翻倍，上海匹配度 +15%"
 * - whatif: "如果你更想社交，成都更适合你"
 * - whyNot: "为什么不选三亚：预算压力太大"
 */
function generateCounterfactuals(userScore, topCity, alternatives, options = {}) {
  const counterfactuals = [];

  // 1. 预算反事实
  if (userScore.budget !== undefined) {
    const currentBudget = userScore.budget;
    const doubledBudget = Math.min(1, currentBudget * 1.5);

    // 看哪个城市在更高预算下大幅提升
    for (const alt of alternatives.slice(0, 5)) {
      const altDims = alt.dimensions || {};
      const currentMatch = 1 - Math.abs(currentBudget - (altDims.budget || 0.5));
      const newMatch = 1 - Math.abs(doubledBudget - (altDims.budget || 0.5));
      const improvement = newMatch - currentMatch;

      if (improvement > 0.15) {
        counterfactuals.push({
          type: 'budget',
          condition: `如果你的预算增加 50%`,
          then: `${alt.name}的消费匹配度将提升 ${Math.round(improvement * 100)}%`,
          importance: 'medium',
          actionable: true
        });
        break; // 只选一个最显著的反事实
      }
    }
  }

  // 2. 社交偏好反事实
  if (userScore.social !== undefined && userScore.social < 0.4) {
    // 低社交用户：如果更想社交 → 哪些城市更适合
    const highSocialCities = alternatives.filter(a => (a.dimensions?.social || 0) > 0.6);
    if (highSocialCities.length > 0) {
      const bestSocialCity = highSocialCities[0];
      counterfactuals.push({
        type: 'social',
        condition: '如果你忽然想要更多社交和热闹',
        then: `${bestSocialCity.name}可能比${topCity.name}更适合你`,
        importance: 'low',
        actionable: false
      });
    }
  }

  // 3. 探索偏好的反事实
  if ((userScore.explore || 0.5) < 0.5) {
    const highExploreCities = alternatives.filter(a => (a.dimensions?.explore || 0) > 0.65);
    if (highExploreCities.length > 0) {
      counterfactuals.push({
        type: 'explore',
        condition: '如果你想要更多新鲜感和未知',
        then: `${highExploreCities[0].name}有更多值得探索的角落`,
        importance: 'low',
        actionable: false
      });
    }
  }

  // 4. 为什么不是排名第二的城市
  if (alternatives.length >= 2) {
    const runnerUp = alternatives[1];
    const runnerUpDims = runnerUp.dimensions || {};
    const topDims = topCity.dimensions || {};

    // 找出 runner-up 不如 top 的关键维度
    const criticalDiffs = [];
    for (const dim of DIMENSIONS) {
      const diffTop = Math.abs((userScore[dim] || 0.5) - (topDims[dim] || 0.5));
      const diffRunnerUp = Math.abs((userScore[dim] || 0.5) - (runnerUpDims[dim] || 0.5));
      if (diffRunnerUp - diffTop > 0.1) {
        criticalDiffs.push({
          dimension: dim,
          topDiff: parseFloat(diffTop.toFixed(2)),
          runnerUpDiff: parseFloat(diffRunnerUp.toFixed(2)),
          gap: parseFloat((diffRunnerUp - diffTop).toFixed(2))
        });
      }
    }

    if (criticalDiffs.length > 0) {
      const mainDiff = criticalDiffs.sort((a, b) => b.gap - a.gap)[0];
      const dimNames = { nature: '自然匹配', pace: '节奏', social: '社交', budget: '消费', explore: '探索', freedom: '自由' };
      counterfactuals.push({
        type: 'whyNot',
        condition: `为什么不选${runnerUp.name}？`,
        then: `在${dimNames[mainDiff.dimension] || mainDiff.dimension}方面，${topCity.name}比你更精准`,
        importance: 'high',
        actionable: false
      });
    }
  }

  return {
    counterfactuals,
    summary: counterfactuals.length > 0
      ? `基于你的当前状态，${topCity.name}是最优解。但如果你调整偏好，其他城市也可能脱颖而出。`
      : `${topCity.name}在当前条件下各方面都很匹配。`
  };
}

// ============================================================
// 四、决策树路径
// ============================================================

/**
 * 生成决策路径：用户是如何一步步被引导到这个推荐的
 *
 * 从根节点（情绪选择）到叶节点（城市推荐）的逻辑链路
 */
function generateDecisionPath(userProfile, personaLabel, city) {
  const steps = [];

  // Step 1: 情绪入口
  if (userProfile.emotionGoal) {
    steps.push({
      level: 1,
      label: '情绪入口',
      decision: `你选择了"${userProfile.emotionGoal}"`,
      reasoning: emotionToReasoning(userProfile.emotionGoal),
      icon: '🎯'
    });
  }

  // Step 2: 人格推断
  if (personaLabel) {
    const label = typeof personaLabel === 'string' ? personaLabel : personaLabel.label;
    steps.push({
      level: 2,
      label: '人格推断',
      decision: `系统推断你是「${label}」`,
      reasoning: `基于你对情绪、空间、节奏等问题的回答`,
      icon: '🧠'
    });
  }

  // Step 3: 关键维度匹配
  const topDims = findDominantDimensions(
    userProfile.dimensions || computeDimsFromProfile(userProfile),
    2
  );

  steps.push({
    level: 3,
    label: '维度匹配',
    decision: `${topDims.map(d => d.dim).join(' + ')} 是你的核心需求`,
    reasoning: `${city.name}在这两个维度上与你的匹配度最高`,
    icon: '📊'
  });

  // Step 4: 最终选择
  steps.push({
    level: 4,
    label: '最终推荐',
    decision: city.name,
    reasoning: `综合评估后，${city.name}是当前状态下最适合你的目的地`,
    icon: '📍'
  });

  return { steps, totalSteps: steps.length };
}

function emotionToReasoning(emotion) {
  const map = {
    '放空': '需要一个能让人停下来、不赶路的地方',
    '逃离压力': '需要一个远离日常、让人深呼吸的空间',
    '找灵感': '需要新鲜刺激来激发创造力',
    '拍照出片': '需要视觉上有冲击力的场景',
    '社交': '需要热闹、有烟火气的地方',
    '独处整理': '需要安静、不被打扰的空间',
    '试住城市': '想探索另一种生活方式的可能性'
  };
  return map[emotion] || '';
}

/**
 * 从用户 profile 中近似计算六维向量（用于没有后端计算时的降级）
 */
function computeDimsFromProfile(profile) {
  const dims = { nature: 0.5, pace: 0.5, social: 0.5, budget: 0.5, explore: 0.5, freedom: 0.5 };

  if (profile.emotionGoal) {
    const emMap = {
      '放空': { nature: 0.8, pace: 0.2, social: 0.3 },
      '逃离压力': { nature: 0.8, pace: 0.2, social: 0.2, freedom: 0.8 },
      '找灵感': { explore: 0.8, social: 0.6, pace: 0.4 },
      '拍照出片': { explore: 0.7, nature: 0.7 },
      '社交': { social: 0.9, pace: 0.7 },
      '独处整理': { nature: 0.7, social: 0.1, pace: 0.3, freedom: 0.8 },
      '试住城市': { freedom: 0.8, explore: 0.7, pace: 0.3 }
    };
    Object.assign(dims, emMap[profile.emotionGoal] || {});
  }

  return dims;
}

// ============================================================
// 五、置信度校准
// ============================================================

/**
 * 计算推荐置信度
 *
 * 置信度由以下因素决定：
 * - 输入完整度：用户回答了多少问题（越多越确定）
 * - 维度区分度：用户各维度方差（方差大=偏好明确=置信度高）
 * - 分数差距：第一名和第二名的分数差（差距大=无争议=置信度高）
 * - 历史一致性：用户历史选择是否与当前一致
 */
function calibrateConfidence(userScore, candidates, options = {}) {
  const { userHistory = [], totalQuestions = 12, answeredQuestions = 12 } = options;

  // 1. 输入完整度 (0~1)
  const completeness = Math.min(1, answeredQuestions / totalQuestions);

  // 2. 维度区分度 (0~1)
  const values = DIMENSIONS.map(d => userScore[d] || 0.5);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  const distinctiveness = Math.min(1, variance * 10); // 方差 0.1 → 区分度 1.0

  // 3. 分数差距 (0~1)
  let scoreGap = 0.5;
  if (candidates.length >= 2) {
    const s1 = candidates[0].score || candidates[0].finalScore || candidates[0].matchScore || 0;
    const s2 = candidates[1].score || candidates[1].finalScore || candidates[1].matchScore || 0;
    scoreGap = Math.min(1, (s1 - s2) / 20); // 差距 > 20 分 → 1.0
  }

  // 4. 历史一致性 (0~1)
  let consistency = 0.5;
  if (userHistory.length > 0) {
    const topType = extractCityArchetypesSimple(candidates[0]);
    const historicalTypes = userHistory.map(h => extractCityArchetypesSimple(h));
    const matches = historicalTypes.filter(t => t === topType).length;
    consistency = matches / Math.max(1, userHistory.length);
  }

  // 加权综合（完整性 40%，区分度 25%，差距 25%，一致性 10%）
  const confidence = Math.round(
    (completeness * 0.40 + distinctiveness * 0.25 + scoreGap * 0.25 + consistency * 0.10) * 100
  );

  let level;
  if (confidence >= 80) level = 'high';
  else if (confidence >= 60) level = 'medium';
  else level = 'low';

  const levelDescriptions = {
    high: '推荐结果置信度较高，可以放心参考',
    medium: '推荐结果有一定参考价值，建议结合自己的直觉判断',
    low: '你的偏好尚不明确，建议多回答几个问题以获得更精准的推荐'
  };

  return {
    confidence,
    level,
    message: levelDescriptions[level],
    factors: {
      completeness: { score: Math.round(completeness * 100), weight: 0.40 },
      distinctiveness: { score: Math.round(distinctiveness * 100), weight: 0.25 },
      scoreGap: { score: Math.round(scoreGap * 100), weight: 0.25 },
      consistency: { score: Math.round(consistency * 100), weight: 0.10 }
    }
  };
}

function extractCityArchetypesSimple(candidate) {
  const dims = candidate.dimensions || candidate.city?.dimensions || {};
  if ((dims.nature || 0) > 0.65) return 'nature';
  if ((dims.social || 0) > 0.65) return 'social';
  if ((dims.explore || 0) > 0.65) return 'explore';
  if ((dims.pace || 0) > 0.65) return 'fast';
  return 'balanced';
}

// ============================================================
// 六、综合解释生成
// ============================================================

/**
 * 综合解释生成器：一键生成所有层级的解释
 */
function generateFullExplanation(userScore, city, options = {}) {
  const {
    userProfile = {},
    personaLabel = '',
    alternatives = [],
    matchContributions = null,
    userQuote = '',
    mood = '',
    userHistory = [],
    totalQuestions = 12,
    answeredQuestions = 12
  } = options;

  // 直觉层
  const intuitive = generateIntuitiveExplanation(userScore, city, { userQuote, mood });

  // 量化层
  const dimensional = generateDimensionalBreakdown(userScore, city, matchContributions);

  // 反事实层
  const counterfactuals = generateCounterfactuals(userScore, city, alternatives);

  // 决策树
  const decisionPath = generateDecisionPath(userProfile, personaLabel, city);

  // 置信度
  const confidence = calibrateConfidence(userScore, [{ ...city, score: 80 }], {
    userHistory, totalQuestions, answeredQuestions
  });

  return {
    intuitive,
    dimensional,
    counterfactuals,
    decisionPath,
    confidence,
    // 摘要：供前端快速展示用
    summary: {
      oneLiner: intuitive.oneLiner,
      topStrength: dimensional.strengths[0]?.explanation || '',
      topWeakness: dimensional.weaknesses[0]?.explanation || '',
      confidence: confidence.level,
      notableTradeOff: counterfactuals.counterfactuals[0]?.then || ''
    }
  };
}

module.exports = {
  // 直觉层
  generateIntuitiveExplanation,
  findDominantDimensions,

  // 量化层
  generateDimensionalBreakdown,

  // 反事实
  generateCounterfactuals,

  // 决策树
  generateDecisionPath,

  // 置信度
  calibrateConfidence,

  // 综合
  generateFullExplanation
};
