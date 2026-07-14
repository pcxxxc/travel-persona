/**
 * 旅格 Travel Persona · localStorage 管理模块
 *
 * 职责：
 * 1. 问卷答案的自动保存与恢复（中断恢复机制）
 * 2. 情绪节点（EmotionNode）的持久化存储
 * 3. 推荐历史记录
 *
 * 设计原则：
 * - 无声保存：每次用户操作后自动写入，无显式"保存"按钮
 * - 随时可续：检测到未完成答卷时主动提示
 * - 允许丢弃：用户始终可以选择重新开始
 */

const Storage = (() => {
  const STORAGE_KEYS = {
    QUESTIONNAIRE: 'travel_persona_questionnaire',
    EMOTION_NODES: 'travel_persona_emotion_nodes',
    RECOMMEND_HISTORY: 'travel_persona_recommend_history',
    LAST_SESSION: 'travel_persona_last_session'
  };

  // ===== 问卷断点保存/恢复 =====

  /**
   * 保存问卷进度
   * @param {Object} state - 问卷状态
   * @param {Object} state.answers - 已答题目 { questionId: answer }
   * @param {string} state.mode - 问卷模式 'speed' | '10q' | '20q'
   * @param {number} state.currentStep - 当前步骤
   * @param {number} state.totalSteps - 总步骤数
   */
  function saveProgress(state) {
    try {
      const data = {
        answers: state.answers || {},
        mode: state.mode || '10q',
        currentStep: state.currentStep || 0,
        totalSteps: state.totalSteps || 10,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEYS.QUESTIONNAIRE, JSON.stringify(data));
      return true;
    } catch (err) {
      console.warn('[Storage] 保存问卷进度失败:', err.message);
      return false;
    }
  }

  /**
   * 恢复问卷进度
   * @returns {Object|null} 问卷状态或 null
   */
  function restoreProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.QUESTIONNAIRE);
      if (!raw) return null;

      const data = JSON.parse(raw);

      // 检查是否过期（超过 7 天未继续视为过期）
      const savedAt = new Date(data.savedAt);
      const now = new Date();
      const daysSinceSaved = (now - savedAt) / (1000 * 60 * 60 * 24);

      if (daysSinceSaved > 7) {
        clearProgress();
        return null;
      }

      return data;
    } catch (err) {
      console.warn('[Storage] 恢复问卷进度失败:', err.message);
      return null;
    }
  }

  /**
   * 清除问卷进度
   */
  function clearProgress() {
    try {
      localStorage.removeItem(STORAGE_KEYS.QUESTIONNAIRE);
    } catch (err) {
      console.warn('[Storage] 清除问卷进度失败:', err.message);
    }
  }

  /**
   * 检查是否有未完成的问卷
   * @returns {Object|null} 进度摘要 { hasProgress, mode, progress, savedAt }
   */
  function hasPendingProgress() {
    const progress = restoreProgress();
    if (!progress) return null;

    return {
      hasProgress: progress.currentStep > 0,
      mode: progress.mode,
      progress: `${progress.currentStep}/${progress.totalSteps}`,
      completedRatio: progress.totalSteps > 0
        ? Math.round((progress.currentStep / progress.totalSteps) * 100)
        : 0,
      savedAt: progress.savedAt
    };
  }

  // ===== 情绪节点存储 =====

  /**
   * 保存情绪节点
   * @param {Object} node - 情绪节点
   * @param {string} node.emotion - 情绪描述
   * @param {string} node.door - 空间意象
   * @param {Object} node.personaScore - PersonaScore
   * @param {string} node.recommendedCity - 推荐城市
   */
  function saveEmotionNode(node) {
    try {
      const nodes = getEmotionNodes();
      nodes.push({
        date: new Date().toISOString(),
        emotion: node.emotion || '',
        door: node.door || '',
        personaScore: node.personaScore || {},
        recommendedCity: node.recommendedCity || ''
      });

      // 最多保留 50 个节点
      const trimmed = nodes.slice(-50);
      localStorage.setItem(STORAGE_KEYS.EMOTION_NODES, JSON.stringify(trimmed));
      return true;
    } catch (err) {
      console.warn('[Storage] 保存情绪节点失败:', err.message);
      return false;
    }
  }

  /**
   * 获取所有情绪节点
   * @returns {Array} 情绪节点列表
   */
  function getEmotionNodes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.EMOTION_NODES);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      console.warn('[Storage] 读取情绪节点失败:', err.message);
      return [];
    }
  }

  /**
   * 情绪节点数量
   * @returns {number}
   */
  function getEmotionNodeCount() {
    return getEmotionNodes().length;
  }

  // ===== 推荐历史 =====

  /**
   * 保存推荐记录
   * @param {Object} record - 推荐记录
   */
  function saveRecommendHistory(record) {
    try {
      const history = getRecommendHistory();
      history.push({
        timestamp: new Date().toISOString(),
        personaLabel: record.personaLabel || '',
        personaScore: record.personaScore || {},
        topCity: record.topCity || '',
        matchScore: record.matchScore || 0
      });

      // 最多保留 20 条
      const trimmed = history.slice(-20);
      localStorage.setItem(STORAGE_KEYS.RECOMMEND_HISTORY, JSON.stringify(trimmed));
      return true;
    } catch (err) {
      console.warn('[Storage] 保存推荐历史失败:', err.message);
      return false;
    }
  }

  /**
   * 获取推荐历史
   * @returns {Array}
   */
  function getRecommendHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.RECOMMEND_HISTORY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  // ===== 最后会话信息 =====

  /**
   * 保存最后会话信息
   */
  function saveLastSession(info) {
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_SESSION, JSON.stringify({
        ...info,
        timestamp: new Date().toISOString()
      }));
    } catch (err) {
      // 静默失败
    }
  }

  /**
   * 获取最后会话信息
   */
  function getLastSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LAST_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  // ===== 工具函数 =====

  /**
   * 检查 localStorage 是否可用
   * @returns {boolean}
   */
  function isAvailable() {
    try {
      const testKey = '__storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * 清除所有旅格数据
   */
  function clearAll() {
    try {
      localStorage.removeItem(STORAGE_KEYS.QUESTIONNAIRE);
      localStorage.removeItem(STORAGE_KEYS.EMOTION_NODES);
      localStorage.removeItem(STORAGE_KEYS.RECOMMEND_HISTORY);
      localStorage.removeItem(STORAGE_KEYS.LAST_SESSION);
    } catch (err) {
      console.warn('[Storage] 清除数据失败:', err.message);
    }
  }

  return {
    // 问卷进度
    saveProgress,
    restoreProgress,
    clearProgress,
    hasPendingProgress,

    // 情绪节点
    saveEmotionNode,
    getEmotionNodes,
    getEmotionNodeCount,

    // 推荐历史
    saveRecommendHistory,
    getRecommendHistory,

    // 会话
    saveLastSession,
    getLastSession,

    // 工具
    isAvailable,
    clearAll
  };
})();

// 全局暴露（兼容非模块化引用）
if (typeof window !== 'undefined') {
  window.Storage = Storage;
}