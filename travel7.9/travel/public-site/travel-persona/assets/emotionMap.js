/**
 * 旅格 Travel Persona · 情绪迁徙地图
 *
 * 职责：
 * 1. 每次推荐完成时，将情绪节点写入 localStorage
 * 2. 累积 ≥3 个节点后，渲染情绪时间线
 * 3. 可选：AI 生成洞察文本
 *
 * 使用方式：
 *   EmotionMap.addNode({ emotion: '放空', door: '海', personaScore: {...}, city: '大理' });
 *   EmotionMap.render('#emotion-map-container');
 */

const EmotionMap = (() => {
  /**
   * 添加情绪节点
   * @param {Object} node
   * @param {string} node.emotion - 情绪描述
   * @param {string} node.door - 空间意象
   * @param {Object} node.personaScore - PersonaScore
   * @param {string} node.city - 推荐城市
   */
  function addNode({ emotion, door, personaScore, city }) {
    if (typeof Storage === 'undefined') return false;

    const node = {
      emotion,
      door,
      personaScore,
      recommendedCity: city
    };

    return Storage.saveEmotionNode(node);
  }

  /**
   * 获取所有情绪节点
   */
  function getNodes() {
    if (typeof Storage === 'undefined') return [];
    return Storage.getEmotionNodes();
  }

  /**
   * 生成情绪洞察文本
   * @returns {string|null} 洞察文本或 null
   */
  function generateInsight() {
    const nodes = getNodes();
    if (nodes.length < 3) return null;

    // 分析情绪趋势
    const emotions = nodes.map(n => n.emotion);
    const cities = nodes.map(n => n.recommendedCity);

    // 统计最高频情绪
    const emotionCount = {};
    emotions.forEach(e => {
      emotionCount[e] = (emotionCount[e] || 0) + 1;
    });
    const topEmotion = Object.entries(emotionCount).sort((a, b) => b[1] - a[1])[0];

    // 统计最高频空间意象
    const doorCount = {};
    nodes.forEach(n => {
      if (n.door) doorCount[n.door] = (doorCount[n.door] || 0) + 1;
    });
    const topDoor = Object.entries(doorCount).sort((a, b) => b[1] - a[1])[0];

    // 检查 PersonaScore 变化趋势
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];
    const changes = [];
    if (firstNode.personaScore && lastNode.personaScore) {
      const dims = ['nature', 'pace', 'social', 'explore', 'freedom', 'budget'];
      const dimNames = { nature: '自然', pace: '节奏', social: '社交', explore: '探索', freedom: '自由', budget: '消费' };
      for (const dim of dims) {
        const diff = (lastNode.personaScore[dim] || 0.5) - (firstNode.personaScore[dim] || 0.5);
        if (Math.abs(diff) > 0.15) {
          changes.push({
            dimension: dim,
            name: dimNames[dim],
            direction: diff > 0 ? '上升' : '下降',
            amount: Math.abs(diff).toFixed(2)
          });
        }
      }
    }

    // 生成洞察
    let insight = `过去 ${nodes.length} 次使用中，`;

    if (topEmotion) {
      insight += `你最常选择的情绪是「${topEmotion[0]}」（${topEmotion[1]} 次）。`;
    }

    if (topDoor && topDoor[0]) {
      insight += `你偏好的空间意象是「${topDoor[0]}」。`;
    }

    if (changes.length > 0) {
      insight += `你的旅行人格正在变化：`;
      changes.forEach(c => {
        insight += `${c.name}${c.direction}${c.amount}，`;
      });
      insight = insight.slice(0, -1) + '。';
    }

    const uniqueCities = [...new Set(cities)];
    if (uniqueCities.length >= 2) {
      insight += `你去过 ${uniqueCities.join('、')} 等城市。`;
    }

    return insight;
  }

  /**
   * 渲染情绪时间线
   * @param {string|Element} container - 容器选择器或元素
   */
  function render(container) {
    const containerEl = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!containerEl) return;

    const nodes = getNodes();

    if (nodes.length === 0) {
      containerEl.innerHTML = `
        <div class="emotion-map-empty">
          <p>还没有情绪记录</p>
          <p class="emotion-map-hint">完成一次旅行人格测试后，这里会出现你的情绪轨迹</p>
        </div>
      `;
      return;
    }

    const insight = generateInsight();

    let html = '<div class="emotion-map">';

    // 洞察文本
    if (insight) {
      html += `
        <div class="emotion-insight">
          <div class="emotion-insight-icon">🔍</div>
          <p>${insight}</p>
        </div>
      `;
    }

    // 时间线
    html += '<div class="emotion-timeline">';

    nodes.forEach((node, i) => {
      const date = new Date(node.date);
      const dateStr = `${date.getMonth() + 1}月${date.getDate()}日`;

      html += `
        <div class="emotion-node">
          <div class="emotion-node-dot ${i === nodes.length - 1 ? 'latest' : ''}"></div>
          <div class="emotion-node-content">
            <div class="emotion-node-date">${dateStr}</div>
            <div class="emotion-node-emotion">${node.emotion || '未记录'}</div>
            ${node.door ? `<div class="emotion-node-door">🚪 ${node.door}</div>` : ''}
            ${node.recommendedCity ? `<div class="emotion-node-city">📍 ${node.recommendedCity}</div>` : ''}
          </div>
        </div>
      `;
    });

    html += '</div>';

    // 节点数量
    html += `
      <div class="emotion-map-footer">
        <span>共 ${nodes.length} 个情绪节点</span>
        <button class="emotion-map-clear" onclick="EmotionMap.clear()">清除记录</button>
      </div>
    `;

    html += '</div>';

    containerEl.innerHTML = html;

    // 注入样式
    injectStyles();
  }

  /**
   * 清除所有情绪节点
   */
  function clear() {
    if (typeof Storage !== 'undefined') {
      Storage.clearAll();
    }
    // 重新渲染
    const containers = document.querySelectorAll('.emotion-map, [data-emotion-map]');
    containers.forEach(c => render(c));
  }

  /**
   * 注入情绪地图样式
   */
  function injectStyles() {
    if (document.getElementById('emotion-map-styles')) return;

    const style = document.createElement('style');
    style.id = 'emotion-map-styles';
    style.textContent = `
      .emotion-map { max-width: 600px; margin: 0 auto; padding: 24px 0; }
      .emotion-map-empty { text-align: center; padding: 48px 24px; color: #8A8278; }
      .emotion-map-hint { font-size: 14px; margin-top: 8px; opacity: 0.7; }
      .emotion-insight { background: #F0EBE3; border-radius: 16px; padding: 20px 24px; margin-bottom: 32px; display: flex; gap: 12px; align-items: flex-start; }
      .emotion-insight-icon { font-size: 24px; flex-shrink: 0; }
      .emotion-insight p { margin: 0; font-size: 15px; line-height: 1.7; color: #2C2C2C; }
      .emotion-timeline { position: relative; padding-left: 32px; }
      .emotion-timeline::before { content: ''; position: absolute; left: 7px; top: 0; bottom: 0; width: 2px; background: #D4CFC6; }
      .emotion-node { position: relative; padding-bottom: 24px; }
      .emotion-node:last-child { padding-bottom: 0; }
      .emotion-node-dot { position: absolute; left: -28px; top: 6px; width: 12px; height: 12px; border-radius: 50%; background: #D4CFC6; border: 2px solid #F0EBE3; }
      .emotion-node-dot.latest { background: #C4704B; box-shadow: 0 0 0 4px rgba(196,112,75,0.15); }
      .emotion-node-content { background: #FFFFFF; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(44,44,44,0.06); }
      .emotion-node-date { font-size: 12px; color: #8A8278; margin-bottom: 4px; }
      .emotion-node-emotion { font-size: 16px; font-weight: 500; color: #2C2C2C; }
      .emotion-node-door, .emotion-node-city { font-size: 13px; color: #8A8278; margin-top: 4px; }
      .emotion-map-footer { display: flex; justify-content: space-between; align-items: center; padding-top: 16px; border-top: 1px solid #D4CFC6; margin-top: 24px; font-size: 13px; color: #8A8278; }
      .emotion-map-clear { background: none; border: none; color: #C4704B; cursor: pointer; font-size: 13px; text-decoration: underline; }
      .emotion-map-clear:hover { color: #A85D3D; }
    `;
    document.head.appendChild(style);
  }

  return {
    addNode,
    getNodes,
    generateInsight,
    render,
    clear
  };
})();

// 全局暴露
if (typeof window !== 'undefined') {
  window.EmotionMap = EmotionMap;
}