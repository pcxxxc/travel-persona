/**
 * 旅格 Travel Persona · 内容安全服务（总纲 12.3-12.4）
 *
 * 职责：
 * 1. checkInput(text)  — 输入内容安全检查（用户提交的自由文本）
 * 2. checkOutput(text) — 输出内容安全检查（LLM 生成 / 系统返回的内容）
 * 3. getSensitiveCategories() — 获取敏感词分类列表
 *
 * 敏感词分类（基础版）：
 *   - political  政治敏感
 *   - sexual     色情低俗
 *   - violence   暴力恐怖
 *   - gambling   赌博相关
 *   - fraud      诈骗引流
 *   - abuse      辱骂人身攻击
 *
 * 重要声明（总纲 18.3）：
 *   "不得用一个敏感词文本文件代替隐私与内容安全体系。"
 *   本模块是内容安全体系的「基础层」——基于关键词的快速过滤。
 *   它并非完整的内容安全方案，未来需要在此基础上扩展：
 *     1. 语义分类层：使用 NLP 模型识别隐晦、变体、谐音等绕过手段
 *     2. 人工审核层：对高风险内容或边界案例引入人工审核队列
 *     3. 上下文判断：结合用户意图和会话上下文降低误判
 *     4. 动态词库：支持热更新，对接第三方内容安全 API（如阿里云绿网）
 *     5. 审计日志：所有拦截记录需持久化，供合规审查追溯
 *
 * 当前基础层的设计目标：
 *   - 拦截明显的违规内容，作为第一道防线
 *   - 保证不误杀正常旅行相关文本（如"大理""酒吧"等正常词汇）
 *   - 提供清晰的分类标记，便于上层做差异化处理
 */

'use strict';

// ========== 敏感词库（基础版）==========
//
// 注意：此处仅包含少量示例性敏感词用于演示基础层能力。
// 生产环境应使用专业的敏感词库（数千至数万条），并配合语义模型。
// 实际部署时可通过加载外部词库文件或调用第三方 API 来扩展。

const SENSITIVE_CATEGORIES = {
  political: {
    label: '政治敏感',
    description: '涉及政治敏感、违法违规讨论的内容',
    severity: 'high',
    words: [
      // 示例性词条，实际部署需扩充并对接专业词库
      '反动',
      '颠覆政权',
      '分裂国家'
    ]
  },

  sexual: {
    label: '色情低俗',
    description: '色情、低俗、不良信息',
    severity: 'high',
    words: [
      '色情',
      '裸体',
      '成人视频',
      '招嫖'
    ]
  },

  violence: {
    label: '暴力恐怖',
    description: '暴力、恐怖、伤害他人相关内容',
    severity: 'high',
    words: [
      '杀人',
      '炸弹制作',
      '恐怖袭击',
      '自制武器'
    ]
  },

  gambling: {
    label: '赌博相关',
    description: '赌博、博彩、赌资相关内容',
    severity: 'medium',
    words: [
      '在线赌博',
      '赌场下注',
      '博彩平台',
      '外围赌球'
    ]
  },

  fraud: {
    label: '诈骗引流',
    description: '诈骗、虚假引流、违法广告',
    severity: 'high',
    words: [
      '刷单兼职',
      '代开发票',
      '办假证',
      '高息贷款无抵押'
    ]
  },

  abuse: {
    label: '辱骂攻击',
    description: '辱骂、人身攻击、歧视性言论',
    severity: 'medium',
    words: [
      '蠢猪',
      '去死吧',
      '废物滚'
    ]
  },

  selfHarm: {
    label: '自伤风险',
    description: '涉及自伤、自杀或危机经历的高度私密内容',
    severity: 'high',
    words: ['自杀', '自残', '不想活了', '结束生命', '轻生']
  },

  privateTrauma: {
    label: '私密创伤',
    description: '不应被系统用于人格归因的创伤与私密经历',
    severity: 'high',
    words: ['性侵', '家暴', '家庭暴力', '被骚扰', '创伤后应激', '虐待经历']
  },

  healthPrivacy: {
    label: '健康隐私',
    description: '医疗诊断、精神健康和成瘾相关隐私',
    severity: 'high',
    words: ['抑郁症', '躁郁症', '双相情感障碍', '精神分裂', '艾滋病', '癌症确诊', '药物成瘾']
  },

  lifePrivacy: {
    label: '生活隐私',
    description: '不应由系统主动复述或人格化的个人困境',
    severity: 'high',
    words: ['失业', '离婚', '出轨', '欠债', '破产', '被裁员', '网贷逾期']
  },

  illegalTrade: {
    label: '违法交易',
    description: '毒品、违禁品和违法交易相关内容',
    severity: 'high',
    words: ['购买毒品', '出售毒品', '买卖枪支', '洗钱', '非法换汇', '贩卖个人信息']
  }
};

const SENSITIVE_PATTERNS = [
  { category: 'personalData', label: '手机号', regex: /(?<!\d)1[3-9]\d{9}(?!\d)/g },
  { category: 'personalData', label: '身份证号', regex: /(?<!\d)\d{17}[\dXx](?!\d)/g },
  { category: 'personalData', label: '电子邮箱', regex: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { category: 'personalData', label: '社交账号', regex: /(?:微信|VX|V信|QQ)\s*[:：号]?\s*[A-Za-z0-9_-]{5,20}/gi }
];

// ========== 预处理：构建匹配索引 ==========

/**
 * 将所有敏感词按分类索引，便于快速查找
 * 结构：Map<word, category>
 */
const _wordIndex = new Map();
for (const [category, def] of Object.entries(SENSITIVE_CATEGORIES)) {
  for (const word of def.words) {
    _wordIndex.set(word, category);
  }
}

/**
 * 转义正则特殊字符
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ========== 核心接口 ==========

/**
 * 输入内容安全检查
 *
 * 检查用户提交的自由文本是否包含敏感内容。
 * 如果检测到敏感词，返回脱敏后的文本（敏感词替换为 ***）。
 *
 * @param {string} text - 待检查的文本
 * @returns {{
 *   safe: boolean,
 *   matchedCategories: string[],
 *   matchedWords: Array<{ word: string, category: string }>,
 *   sanitizedText: string
 * }}
 */
function checkInput(text) {
  if (!text || typeof text !== 'string') {
    return {
      safe: true,
      matchedCategories: [],
      matchedWords: [],
      sanitizedText: text || ''
    };
  }

  const matchedCategories = new Set();
  const matchedWords = [];
  let sanitizedText = text;

  // 遍历所有敏感词进行匹配
  for (const [word, category] of _wordIndex) {
    if (text.includes(word)) {
      matchedCategories.add(category);
      matchedWords.push({ word, category });
      // 脱敏：将敏感词替换为等长的星号
      const escaped = escapeRegExp(word);
      sanitizedText = sanitizedText.replace(new RegExp(escaped, 'g'), '*'.repeat(word.length));
    }
  }

  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.regex.lastIndex = 0;
    if (pattern.regex.test(text)) {
      matchedCategories.add(pattern.category);
      matchedWords.push({ word: pattern.label, category: pattern.category });
      pattern.regex.lastIndex = 0;
      sanitizedText = sanitizedText.replace(pattern.regex, match => '*'.repeat(match.length));
    }
  }

  return {
    safe: matchedCategories.size === 0,
    matchedCategories: Array.from(matchedCategories),
    matchedWords,
    sanitizedText
  };
}

/**
 * 输出内容安全检查
 *
 * 检查系统输出（LLM 生成内容、推荐理由等）是否包含敏感内容。
 * 输出检查策略与输入一致，但未来可增加更严格的语义层校验。
 *
 * @param {string} text - 待检查的输出文本
 * @returns {{
 *   safe: boolean,
 *   matchedCategories: string[],
 *   matchedWords: Array<{ word: string, category: string }>,
 *   sanitizedText: string
 * }}
 */
function checkOutput(text) {
  // 当前基础层中，输出检查复用输入检查逻辑
  // 未来扩展：输出检查可增加更严格的语义校验，如检测幻觉性危险建议
  return checkInput(text);
}

function sanitizeOutputValue(value) {
  if (typeof value === 'string') return checkOutput(value).sanitizedText;
  if (Array.isArray(value)) return value.map(sanitizeOutputValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeOutputValue(item)]));
  }
  return value;
}

function getSensitivityLevel(text) {
  const result = checkInput(text);
  const highSeverity = result.matchedCategories.some(category => {
    return SENSITIVE_CATEGORIES[category]?.severity === 'high' || category === 'personalData';
  });
  if (highSeverity) return 'restricted';
  return result.safe ? 'normal' : 'sensitive';
}

/**
 * 获取敏感词分类列表
 *
 * @returns {Object} 分类定义，结构同 SENSITIVE_CATEGORIES
 */
function getSensitiveCategories() {
  const result = {};
  for (const [key, def] of Object.entries(SENSITIVE_CATEGORIES)) {
    result[key] = {
      label: def.label,
      description: def.description,
      severity: def.severity,
      wordCount: def.words.length
    };
  }
  return result;
}

/**
 * 获取拦截统计（供监控服务调用）
 *
 * @returns {{ totalBlocked: number, byCategory: Object }}
 */
function getBlockStats() {
  // 基础版不持久化统计，返回结构占位
  // 生产环境应对接监控服务的 recordMetric
  return {
    totalBlocked: 0,
    byCategory: {}
  };
}

module.exports = {
  // 核心接口
  checkInput,
  checkOutput,
  sanitizeOutputValue,
  getSensitivityLevel,
  getSensitiveCategories,

  // 统计
  getBlockStats,

  // 常量导出
  SENSITIVE_CATEGORIES
};
