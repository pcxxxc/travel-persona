/**
 * 旅格 Travel Persona · 问卷交互模块
 *
 * 职责：
 * 1. 管理三种问卷模式（极速/10 题/20 题）
 * 2. 题目渲染与交互
 * 3. 中断恢复：自动保存到 localStorage，支持恢复
 * 4. 答案收集与提交
 *
 * 使用方式：
 *   const q = Questionnaire.init({ container: '#q-container', mode: '10q' });
 *   q.onComplete = (answers) => { ... };
 *   q.start();
 */

const Questionnaire = (() => {
  /**
   * HTML 转义函数（安全最佳实践：防止 XSS 注入）
   * 对所有用户输入进行转义后再拼接到 innerHTML 中
   */
  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 问卷配置（从 问卷问题文本.md 提取）
  const QUESTION_SETS = {
    // 极速模式：1 题 + 1 追问
    speed: {
      steps: [
        {
          id: 'emotionGoal',
          question: '你现在，最需要什么？',
          type: 'single',
          options: [
            { value: '放空', label: '☁️ 放空自己' },
            { value: '逃离压力', label: '🏃 逃离压力' },
            { value: '找灵感', label: '💡 寻找灵感' },
            { value: '拍照出片', label: '📷 拍照出片' },
            { value: '社交', label: '👥 热闹一下' },
            { value: '独处整理', label: '🧘 独自静静' },
            { value: '试住城市', label: '🏠 试住一座城' }
          ]
        },
        {
          id: 'door',
          question: null, // 动态设置
          type: 'single',
          conditional: true,
          questionMap: {
            '放空': '你希望空间给你什么感觉？',
            '逃离压力': '你最想逃离的是什么？',
            '找灵感': '你需要什么样的刺激来激发灵感？',
            '拍照出片': '你更想拍什么类型的画面？',
            '社交': '你想要什么样的热闹？',
            '独处整理': '你希望独处时周围是什么环境？',
            '试住城市': '你更看重城市的哪方面？'
          },
          options: [
            { value: '海', label: '🌊 海' },
            { value: '山', label: '⛰️ 山' },
            { value: '森林', label: '🌲 森林' },
            { value: '老街', label: '🏘️ 老街' },
            { value: '咖啡馆', label: '☕ 咖啡馆' },
            { value: '城市高楼', label: '🏙️ 城市高楼' },
            { value: '古镇', label: '🏯 古镇' },
            { value: '草原', label: '🌿 草原' },
            { value: '沙漠', label: '🏜️ 沙漠' },
            { value: '湖泊', label: '🏞️ 湖泊' }
          ]
        }
      ]
    },

    // 12 题精简版（映射到6维度评分系统）
    '10q': {
      steps: [
        {
          id: 'emotionGoal', question: '你现在最需要什么？', type: 'single',
          options: [
            { value: '放空', label: '☁️ 放空自己' },
            { value: '逃离压力', label: '🏃 逃离压力' },
            { value: '找灵感', label: '💡 寻找灵感' },
            { value: '拍照出片', label: '📷 拍照出片' },
            { value: '社交', label: '👥 热闹一下' },
            { value: '独处整理', label: '🧘 独自静静' },
            { value: '试住城市', label: '🏠 试住一座城' }
          ]
        },
        {
          id: 'mood', question: '最近一周，你的整体状态更接近？', type: 'single',
          options: [
            { value: '疲惫', label: '😮‍💨 身心俱疲，什么都不想做' },
            { value: '低落', label: '😔 有点低落，需要被治愈' },
            { value: '麻木', label: '😐 平静但麻木，想找回感觉' },
            { value: '还行', label: '🙂 状态还行，就是想换换环境' },
            { value: '精力充沛', label: '🤩 精力充沛，想探索新事物' }
          ]
        },
        {
          id: 'door', question: '你更喜欢什么样的空间？（可多选）', type: 'multi',
          options: [
            { value: '海', label: '🌊 海' },
            { value: '山', label: '⛰️ 山' },
            { value: '森林', label: '🌲 森林' },
            { value: '老街', label: '🏘️ 老街' },
            { value: '咖啡馆', label: '☕ 咖啡馆' },
            { value: '城市高楼', label: '🏙️ 城市高楼' },
            { value: '古镇', label: '🏯 古镇' },
            { value: '草原', label: '🌿 草原' },
            { value: '沙漠', label: '🏜️ 沙漠' },
            { value: '湖泊', label: '🏞️ 湖泊' }
          ]
        },
        {
          id: 'naturePref', question: '你对大自然的亲近程度？', type: 'single',
          options: [
            { value: '城市公园就够了', label: '🏙️ 城市公园就够了' },
            { value: '偶尔亲近自然', label: '🌳 偶尔亲近自然' },
            { value: '必须有大自然', label: '🏔️ 必须有大自然' }
          ]
        },
        {
          id: 'rhythm', question: '你喜欢的旅行节奏？', type: 'single',
          options: [
            { value: '特种兵', label: '⚡ 特种兵打卡（一天8个景点）' },
            { value: '适中', label: '🚶 紧凑高效（每天3-5个点）' },
            { value: '适中', label: '🌤️ 适中节奏（每天2-3个点）' },
            { value: '深度慢游', label: '☕ 松弛漫游（走到哪算哪）' },
            { value: '深度慢游', label: '🌿 深度停留（一个地方待一天）' }
          ]
        },
        {
          id: 'companion', question: '你更想和谁一起旅行？', type: 'single',
          options: [
            { value: '独自', label: '🧍 独自一人' },
            { value: '伴侣', label: '💑 伴侣' },
            { value: '朋友', label: '👫 朋友2-3人' },
            { value: '一群人', label: '👨‍👩‍👧‍👦 一群人' }
          ]
        },
        {
          id: 'travelStyle', question: '你更擅长哪种旅行方式？', type: 'single',
          options: [
            { value: '规划型', label: '🗺️ 规划型（提前做攻略）' },
            { value: '灵活型', label: '🎒 灵活型（大概方向就行）' },
            { value: '随性型', label: '🌊 随性型（走哪算哪）' }
          ]
        },
        {
          id: 'budget', question: '你的总预算是？', type: 'single',
          options: [
            { value: '不敏感', label: '不限预算' },
            { value: '低预算', label: '500 元以内' },
            { value: '低预算', label: '500-1000 元' },
            { value: '中等', label: '1000-2000 元' },
            { value: '中等', label: '2000-3000 元' },
            { value: '高预算', label: '3000-5000 元' },
            { value: '高预算', label: '5000 元以上' }
          ]
        },
        {
          id: 'duration', question: '计划出行多久？', type: 'single',
          options: [
            { value: '不确定', label: '不想设限' },
            { value: '1-2天', label: '1天（周末闪游）' },
            { value: '1-2天', label: '2-3天（短途旅行）' },
            { value: '3-5天', label: '4-5天（小长假）' },
            { value: '一周以上', label: '7天以上（深度旅行）' }
          ]
        },
        {
          id: 'risk', question: '你对旅行中不确定性的接受度？', type: 'single',
          options: [
            { value: '安全稳妥', label: '📋 低接受度（喜欢一切确定）' },
            { value: '可以接受', label: '🎲 中等（可以接受小意外）' },
            { value: '喜欢冒险', label: '🧭 高接受度（随遇而安）' }
          ]
        },
        {
          id: 'dislike', question: '你不喜欢什么样的旅行体验？（可多选）', type: 'multi',
          options: [
            { value: '人多拥挤', label: '人多拥挤' },
            { value: '商业化', label: '过度商业化' },
            { value: '体力消耗', label: '体力消耗大' },
            { value: '交通不便', label: '交通不便' },
            { value: '千篇一律', label: '千篇一律的景点' }
          ]
        },
        {
          id: 'nomad', question: '是否考虑短住或数字游民试居？', type: 'single',
          options: [
            { value: '否', label: '✈️ 纯旅行就好' },
            { value: '想试试', label: '🤔 有点好奇' },
            { value: '是', label: '💻 是的，想试试' }
          ]
        }
      ]
    },

    // 20 题完整版（基于 12 题版扩展）
    '20q': {
      steps: [] // 从 10q(12题) 扩展，在 init 时生成
    }
  };

  // 20 题版在 10 题版基础上增加额外问题
  const EXTRA_QUESTIONS = [
    {
      id: 'location', question: '你目前在哪个城市？', type: 'text',
      placeholder: '例如：北京、上海、成都...'
    },
    {
      id: 'cityType', question: '你喜欢的城市类型？', type: 'multi',
      options: [
        { value: '烟火气', label: '成都（烟火气）' },
        { value: '自然疗愈', label: '大理（自然疗愈）' },
        { value: '诗意', label: '杭州（诗意审美）' },
        { value: '探索', label: '重庆（魔幻探索）' },
        { value: '文艺', label: '厦门（海滨文艺）' },
        { value: '活力', label: '长沙（热辣活力）' },
        { value: '文化', label: '泉州（古城文化）' },
        { value: '都市', label: '上海（摩登都市）' }
      ]
    },
    {
      id: 'mood', question: '最近一周，你的整体状态更接近？', type: 'single',
      options: [
        { value: '疲惫', label: '😮‍💨 身心俱疲，什么都不想做' },
        { value: '低落', label: '😔 有点低落，需要被治愈' },
        { value: '麻木', label: '😐 平静但麻木，想找回感觉' },
        { value: '还行', label: '🙂 状态还行，就是想换换环境' },
        { value: '精力充沛', label: '🤩 精力充沛，想探索新事物' }
      ]
    },
    {
      id: 'companion', question: '你更想一个人去，还是有人陪？', type: 'single',
      options: [
        { value: '独处', label: '必须一个人，谁也别打扰我' },
        { value: '各自玩', label: '可以有人，但各自玩各自的' },
        { value: '轻陪伴', label: '希望有人一起，但不用时刻在一起' },
        { value: '深度陪伴', label: '想要深度陪伴，一起分享体验' },
        { value: '热闹', label: '人越多越好，热闹最重要' }
      ]
    },
    {
      id: 'foodVsView', question: '你更在意看风景，还是吃美食？', type: 'single',
      options: [
        { value: '只看风景', label: '只看风景，吃什么都行' },
        { value: '风景为主', label: '风景为主，美食加分' },
        { value: '两者都重要', label: '两者都重要' },
        { value: '美食为主', label: '美食为主，风景是背景' },
        { value: '专门吃', label: '专门为了吃而去' }
      ]
    }
  ];

  /**
   * 初始化问卷
   */
  function init({ container, mode = '10q', onComplete = null, onStepChange = null }) {
    const containerEl = typeof container === 'string'
      ? document.querySelector(container)
      : container;

    if (!containerEl) {
      throw new Error('问卷容器不存在');
    }

    // 构建题目列表
    let steps;
    if (mode === '20q') {
      // 20 题 = 10 题 + 额外问题
      steps = [...QUESTION_SETS['10q'].steps];
      // 在合适位置插入额外问题
      steps.splice(1, 0, EXTRA_QUESTIONS[0]); // location 在 emotionGoal 之后
      steps.splice(5, 0, EXTRA_QUESTIONS[1]); // cityType 在 duration 之后
      steps.splice(8, 0, EXTRA_QUESTIONS[2]); // mood 在 preference(看重的) 之后
      steps.splice(9, 0, EXTRA_QUESTIONS[3]); // companion
      steps.splice(10, 0, EXTRA_QUESTIONS[4]); // foodVsView
    } else {
      steps = QUESTION_SETS[mode]?.steps || QUESTION_SETS['10q'].steps;
    }

    // 状态
    let currentStep = 0;
    let answers = {};
    let isComplete = false;

    // 检查是否有未完成的问卷
    const pending = Storage.hasPendingProgress();
    if (pending && pending.mode === mode) {
      const saved = Storage.restoreProgress();
      if (saved) {
        answers = saved.answers || {};
        currentStep = saved.currentStep || 0;
      }
    }

    /**
     * 渲染当前步骤
     */
    function renderStep() {
      if (currentStep >= steps.length) {
        complete();
        return;
      }

      const step = steps[currentStep];
      let question = step.question;

      // 处理条件问题（极速模式追问）
      if (step.conditional && step.questionMap) {
        const prevAnswer = answers[steps[currentStep - 1]?.id];
        question = step.questionMap[prevAnswer] || question;
      }

      const progress = Math.round((currentStep / steps.length) * 100);

      let html = `
        <div class="questionnaire-step" data-step="${currentStep}">
          <div class="q-progress">
            <div class="q-progress-bar" style="width:${progress}%"></div>
            <span class="q-progress-text">${currentStep + 1} / ${steps.length}</span>
          </div>
          <h2 class="q-question">${question}</h2>
          <div class="q-options" data-type="${step.type}">
      `;

      if (step.type === 'single') {
        step.options.forEach(opt => {
          const checked = answers[step.id] === opt.value ? 'checked' : '';
          html += `
            <label class="q-option ${checked ? 'selected' : ''}">
              <input type="radio" name="q-${step.id}" value="${opt.value}" ${checked}>
              <span>${opt.label}</span>
            </label>
          `;
        });
      } else if (step.type === 'multi') {
        step.options.forEach(opt => {
          const selected = Array.isArray(answers[step.id]) && answers[step.id].includes(opt.value);
          html += `
            <label class="q-option ${selected ? 'selected' : ''}">
              <input type="checkbox" name="q-${step.id}" value="${opt.value}" ${selected ? 'checked' : ''}>
              <span>${opt.label}</span>
            </label>
          `;
        });
      } else if (step.type === 'text') {
        html += `
          <input type="text" class="q-text-input" name="q-${step.id}"
            placeholder="${escapeHtml(step.placeholder || '')}" value="${escapeHtml(answers[step.id] || '')}">
        `;
      }

      html += `
          </div>
          <div class="q-actions">
            ${currentStep > 0 ? '<button class="q-btn q-btn-back">上一步</button>' : ''}
            ${step.skip ? '<button class="q-btn q-btn-skip">跳过</button>' : ''}
            <button class="q-btn q-btn-next" ${!hasAnswer(step.id) ? 'disabled' : ''}>
              ${currentStep === steps.length - 1 ? '完成' : '下一题'}
            </button>
          </div>
          <button class="q-btn q-btn-quit">先到这</button>
        </div>
      `;

      containerEl.innerHTML = html;

      // 绑定事件
      bindEvents(step);

      // 回调
      if (onStepChange) {
        onStepChange({ step: currentStep, total: steps.length, question, answers });
      }

      // 自动保存
      Storage.saveProgress({ answers, mode, currentStep, totalSteps: steps.length });
    }

    /**
     * 检查当前步骤是否有答案
     */
    function hasAnswer(stepId) {
      const val = answers[stepId];
      if (val === undefined || val === null || val === '') return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    }

    /**
     * 收集当前步骤的答案
     */
    function collectAnswer(step) {
      if (step.type === 'single') {
        const selected = containerEl.querySelector(`input[name="q-${step.id}"]:checked`);
        if (selected) {
          answers[step.id] = selected.value;
        }
      } else if (step.type === 'multi') {
        const selected = containerEl.querySelectorAll(`input[name="q-${step.id}"]:checked`);
        answers[step.id] = Array.from(selected).map(el => el.value);
      } else if (step.type === 'text') {
        const input = containerEl.querySelector(`input[name="q-${step.id}"]`);
        if (input) {
          answers[step.id] = input.value;
        }
      }
    }

    /**
     * 绑定事件
     */
    function bindEvents(step) {
      // 选项点击
      containerEl.querySelectorAll('.q-option').forEach(option => {
        option.addEventListener('click', () => {
          const input = option.querySelector('input');
          if (step.type === 'single') {
            // 单选：清除其他选中
            containerEl.querySelectorAll('.q-option').forEach(o => o.classList.remove('selected'));
          }
          option.classList.toggle('selected');

          // 更新按钮状态
          const nextBtn = containerEl.querySelector('.q-btn-next');
          if (nextBtn) {
            collectAnswer(step);
            nextBtn.disabled = !hasAnswer(step.id);
          }
        });
      });

      // 文本输入
      const textInput = containerEl.querySelector('.q-text-input');
      if (textInput) {
        textInput.addEventListener('input', () => {
          collectAnswer(step);
          const nextBtn = containerEl.querySelector('.q-btn-next');
          if (nextBtn) {
            nextBtn.disabled = !hasAnswer(step.id);
          }
        });
      }

      // 下一题
      const nextBtn = containerEl.querySelector('.q-btn-next');
      if (nextBtn) {
        nextBtn.addEventListener('click', () => {
          collectAnswer(step);
          if (currentStep < steps.length - 1) {
            currentStep++;
            renderStep();
          } else {
            complete();
          }
        });
      }

      // 上一步
      const backBtn = containerEl.querySelector('.q-btn-back');
      if (backBtn) {
        backBtn.addEventListener('click', () => {
          if (currentStep > 0) {
            currentStep--;
            renderStep();
          }
        });
      }

      // 跳过
      const skipBtn = containerEl.querySelector('.q-btn-skip');
      if (skipBtn) {
        skipBtn.addEventListener('click', () => {
          if (currentStep < steps.length - 1) {
            currentStep++;
            renderStep();
          } else {
            complete();
          }
        });
      }

      // 先到这
      const quitBtn = containerEl.querySelector('.q-btn-quit');
      if (quitBtn) {
        quitBtn.addEventListener('click', () => {
          collectAnswer(step);
          Storage.saveProgress({ answers, mode, currentStep, totalSteps: steps.length });
          if (onComplete) {
            onComplete({ ...answers, _interrupted: true, _progress: `${currentStep + 1}/${steps.length}` });
          }
        });
      }
    }

    /**
     * 完成问卷
     */
    function complete() {
      isComplete = true;
      Storage.clearProgress(); // 清除进度（已完成）

      // 标准化答案格式
      const normalized = normalizeAnswers(answers);

      if (onComplete) {
        onComplete(normalized);
      }
    }

    /**
     * 标准化答案格式
     * 将 multi 的数组 join 为逗号分隔字符串，以便后端处理
     */
    function normalizeAnswers(raw) {
      const normalized = {};
      for (const [key, val] of Object.entries(raw)) {
        if (Array.isArray(val)) {
          normalized[key] = val.join(',');
        } else {
          normalized[key] = val;
        }
      }
      return normalized;
    }

    /**
     * 开始问卷
     */
    function start() {
      renderStep();
    }

    /**
     * 重置问卷
     */
    function reset() {
      currentStep = 0;
      answers = {};
      isComplete = false;
      Storage.clearProgress();
    }

    return {
      start,
      reset,
      getAnswers: () => ({ ...answers }),
      getProgress: () => ({ currentStep, total: steps.length, isComplete }),
      getMode: () => mode
    };
  }

  return { init, QUESTION_SETS, EXTRA_QUESTIONS };
})();

// 全局暴露
if (typeof window !== 'undefined') {
  window.Questionnaire = Questionnaire;
}