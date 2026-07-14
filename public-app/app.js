/**
 * 旅格 Travel Persona · SPA 核心应用（Phase 3）
 *
 * 纯JS实现，无框架依赖。
 * 总纲4.1：从长单页Demo迁移为多路由应用结构。
 *
 * 职责：
 * 1. 全局状态管理（state 对象）
 * 2. Hash 路由器（#/plan, #/trips, #/journal, #/profile）
 * 3. API 调用封装（apiCall）
 * 4. 页面渲染函数（renderTrips, renderJournal, renderProfile）
 * 5. 16种人格视觉数据（CSS渐变+文字标识，不生成图片）
 * 6. 底部导航高亮
 * 7. 公共工具函数
 *
 * 规划页逻辑（冷启动渐进取样）由 pages/plan.js 扩展。
 */
(function (global) {
  'use strict';
  var TripSync = global.TripSync;

  // ============================================================
  // 1. 常量定义
  // ============================================================

  /**
   * 6种旅行动机（总纲5.1冷启动第一步 / SharedEnums.MoodType）
   * 对应 tripIntent.mood 字段
   */
  var MOODS = [
    { key: 'restore',   label: '恢复充能', icon: 'leaf', desc: '需要安静、自然和慢节奏' },
    { key: 'escape',    label: '逃离日常', icon: 'log-out', desc: '换个环境，暂时离开原来的节奏' },
    { key: 'inspire',   label: '寻找灵感', icon: 'sparkles', desc: '想看到不一样的风景和文化' },
    { key: 'social',    label: '与人连接', icon: 'users-round', desc: '认识新朋友或陪伴同行者' },
    { key: 'efficient', label: '高效探索', icon: 'timer', desc: '在有限时间里获得更完整的体验' },
    { key: 'live',      label: '像当地人一样', icon: 'house', desc: '体验目的地真实生活' }
  ];

  /**
   * 8种兴趣标签（SharedEnums.InterestType）
   * 对应 tripIntent.interests 字段
   */
  var INTERESTS = [
    { key: 'nature',  label: '自然山水', icon: 'mountain-snow' },
    { key: 'oldtown', label: '古镇老街', icon: 'landmark' },
    { key: 'art',     label: '艺术展览', icon: 'palette' },
    { key: 'coffee',  label: '咖啡馆', icon: 'coffee' },
    { key: 'food',    label: '在地美食', icon: 'utensils' },
    { key: 'photo',   label: '摄影出片', icon: 'camera' },
    { key: 'museum',  label: '博物馆', icon: 'building-2' },
    { key: 'hidden',  label: '小众探索', icon: 'compass' }
  ];

  var AVOIDS = [
    { key: 'crowd', label: '人多排队' },
    { key: 'commercial', label: '过度商业化' },
    { key: 'climb', label: '爬山消耗' },
    { key: 'early', label: '早起赶路' },
    { key: 'longTransit', label: '长途换乘' },
    { key: 'expensive', label: '溢价消费' }
  ];

  var ROUTE_CHANGE_REASONS = [
    { key: 'budget', label: '预算取舍' },
    { key: 'pace', label: '不想太赶' },
    { key: 'interest', label: '兴趣变化' },
    { key: 'logistics', label: '交通不顺' },
    { key: 'unexpected', label: '临时变化' },
    { key: 'other', label: '其他原因' }
  ];

  var TRIP_REVIEW_WORTH = [
    { key: 'worth_it', label: '每一段都很值得' },
    { key: 'mostly_worth', label: '整体值得' },
    { key: 'mixed', label: '有值得，也有落差' },
    { key: 'not_worth', label: '这次不太值得' }
  ];
  var TRIP_REVIEW_VALUES = [
    { key: 'arrived', label: '我出发了，也真正看见了' },
    { key: 'new_experience', label: '一些新的体验' },
    { key: 'connection', label: '认识的人与连接' },
    { key: 'own_time', label: '属于自己的时间' },
    { key: 'clarity', label: '更明白自己向往什么' },
    { key: 'joy', label: '单纯开心就够了' }
  ];
  var TRIP_REVIEW_DEVIATIONS = [
    { key: 'fewer_places', label: '实际少去了几个地方' },
    { key: 'longer_stays', label: '有些地方留得更久' },
    { key: 'overspent', label: '实际花得更多' },
    { key: 'underspent', label: '实际比预计省' },
    { key: 'more_tired', label: '比想象中更累' },
    { key: 'more_relaxed', label: '比计划更松弛' },
    { key: 'changed_route', label: '临时改了路线' },
    { key: 'as_planned', label: '基本按计划发生' }
  ];

  var COMPANIONS = [
    { key: 'solo', label: '一个人' },
    { key: 'couple', label: '两个人' },
    { key: 'friends', label: '朋友同行' },
    { key: 'family', label: '家人同行' }
  ];

  var TRAIT_LABELS = {
    restoration: '恢复需求', nature: '自然偏好', culture: '文化兴趣', food: '美食兴趣',
    pace: '旅行节奏', social: '社交需求', budget: '预算取向', aesthetics: '审美取向',
    comfort: '舒适需求', novelty: '新鲜感', transit: '交通效率', lowCrowd: '低拥挤偏好',
    authenticity: '在地真实感', weatherFlex: '天气弹性', bookingEase: '预约接受度', workation: '旅居倾向'
  };

  var TRAIT_SCALE_LABELS = {
    restoration: ['更偏探索', '更需要恢复'], nature: ['更偏城市', '更偏自然'], culture: ['随性看看', '深度文化'],
    food: ['饮食随意', '为吃而去'], pace: ['更松弛', '更紧凑'], social: ['更享受独处', '更想连接'],
    budget: ['体验优先', '更看重成本'], aesthetics: ['实用优先', '审美优先'], comfort: ['能接受折腾', '更要舒适'],
    novelty: ['熟悉安心', '追求新鲜'], transit: ['能接受绕行', '很在意顺路'], lowCrowd: ['不介意热闹', '更避开拥挤'],
    authenticity: ['经典清单', '在地生活'], weatherFlex: ['天气敏感', '能灵活调整'], bookingEase: ['不爱预约', '愿意提前安排'],
    workation: ['短途切换', '长期旅居']
  };

  /**
   * 16种人格原型（总纲3.3 / 14.7）
   * id 对应 CSS 类名 persona-visual--{id}
   * 渐变颜色源自 scripts/generate-abstract-personas.ps1
   * short 用于人格视觉方块上的文字标识（取首字）
   */
  var PERSONAS = [
    { id: 'quiet-restore',       name: '静谧恢复者',   short: '静', blend: '恢复 × 自然' },
    { id: 'city-spark',          name: '城市火花',     short: '城', blend: '社交 × 探索' },
    { id: 'aesthetic-collector', name: '审美收藏家',   short: '美', blend: '审美 × 文化' },
    { id: 'slow-nomad',          name: '慢速游牧者',   short: '慢', blend: '节奏 × 自由' },
    { id: 'heritage-drifter',    name: '遗产漂流者',   short: '遗', blend: '文化 × 在地' },
    { id: 'efficient-hunter',    name: '路径编排型',   short: '序', blend: '取舍 × 路线' },
    { id: 'wild-calibrator',     name: '野生校准者',   short: '野', blend: '自然 × 新鲜' },
    { id: 'ritual-archivist',    name: '仪式档案者',   short: '仪', blend: '文化 × 审美' },
    { id: 'taste-cartographer',  name: '味觉制图师',   short: '味', blend: '美食 × 在地' },
    { id: 'night-flaneur',       name: '夜间漫游者',   short: '夜', blend: '社交 × 审美' },
    { id: 'social-orbit',        name: '社交轨道',     short: '社', blend: '社交 × 节奏' },
    { id: 'comfort-navigator',   name: '舒适导航者',   short: '适', blend: '舒适 × 交通' },
    { id: 'edge-explorer',       name: '边缘探索者',   short: '探', blend: '新鲜 × 探索' },
    { id: 'micro-escape',        name: '微型逃离',     short: '微', blend: '恢复 × 节奏' },
    { id: 'family-anchor',       name: '家庭之锚',     short: '家', blend: '社交 × 舒适' },
    { id: 'workation-weaver',    name: '旅居编织者',   short: '居', blend: '节奏 × 工作' }
  ];

  /**
   * 三条决策路径类型（总纲5.2 / SharedEnums.DecisionPathType）
   */
  var PATH_TYPES = {
    personaBest: { label: '人格本选', desc: '人格匹配最高' },
    balanced:    { label: '现实平衡', desc: '总体最稳' },
    lowCost:     { label: '低成本方案', desc: '压低总成本' },
    newDirection:{ label: '新的方向', desc: '偏离历史偏好' }
  };

  /**
   * 路由表（总纲4.1：多路由应用结构）
   */
  var ROUTES = {
    '#/plan':    'plan',
    '#/trips':   'trips',
    '#/journal': 'journal',
    '#/profile': 'profile'
  };

  /**
   * API 基础路径（总纲13.6：API版本化 /api/v1/）
   */
  var API_BASE = '/api/v1';

  // ============================================================
  // 2. 全局状态管理
  // ============================================================

  /**
   * 全局状态对象
   * 总纲3.1：四层用户模型分开存储
   */
  var state = {
    // 当前路由
    currentRoute: '#/plan',

    // 规划页状态（由 plan.js 使用）
    plan: {
      step: 1,              // 冷启动步骤：1=mood, 2=interests, 3=days+budget
      tripIntent: {
        mood: null,          // SharedEnums.MoodType
        interests: [],        // SharedEnums.InterestType[]
        avoid: [],
        freeText: '',
        companion: 'solo'     // SharedEnums.CompanionType
      },
      tripContext: {
        origin: '',           // 出发城市
        destination: '',      // 指定目的地（可选）
        days: null,           // 1-60
        dates: { start: '' },
        budget: {
          comfort: null,      // 本次旅行舒适总预算
          hardMax: null,       // 可接受上限
          saveTarget: null     // 节省目标
        },
        season: 'unknown'
      },
      result: null,          // PlanResponse
      selectedPathType: 'balanced',
      selectedRouteVariantId: 'balanced',
      loading: false,
      error: null,
      validationMessage: null
    },

    // 行程列表
    trips: [],
    selectedTripId: null,
    personaReassessment: null,

    // 手账列表
    journal: [],
    journalComposerOpen: false,
    journalDraft: {
      tripId: '',
      content: '',
      mood: '',
      decisionContext: null,
      reasonCategory: '',
      reviewMode: false,
      reviewSnapshot: { worth: '', values: [], deviations: [] },
      analysisAuthorized: false,
      error: null,
      saving: false
    },

    // 人格档案（总纲3.2 PersonaProfile）
    persona: {
      profileId: null,
      traits: {},
      primaryPersona: null,
      provisionalPersona: null,
      provisionalTraits: {},
      acceptedTraits: {},
      createdAt: null,
      updatedAt: null
    },

    growthTimeline: {
      events: [],
      summary: { plannedTrips: 0, authorizedEvidence: 0, confirmedChanges: 0, activeDimensions: 0 },
      nextStep: ''
    },

    // 隐私设置（总纲12.5）
    privacy: {
      personalizationEnabled: true,
      analysisConsent: false,
      modelTrainingEnabled: false,
      locationPrecision: 'city'
    },

    // 全局加载状态
    loading: false,
    error: null
  };

  // ============================================================
  // 3. API 调用封装
  // ============================================================

  function getTelemetrySurface() {
    var route = String(window.location.hash || '').replace(/^#\/?/, '').split(/[?\/]/)[0];
    if (route === 'trips') return 'trip';
    if (route === 'journal') return 'journal';
    if (route === 'profile') return 'profile';
    if (route === 'plan') return 'plan';
    return 'startup';
  }

  function durationBucket(durationMs) {
    var duration = Number(durationMs);
    if (!Number.isFinite(duration)) return 'unknown';
    if (duration < 500) return 'lt_500';
    if (duration < 1500) return '500_1500';
    if (duration < 3000) return '1500_3000';
    if (duration < 5000) return '3000_5000';
    return 'gte_5000';
  }

  function sendTelemetry(event) {
    var payload = {
      event: String(event?.event || ''),
      surface: String(event?.surface || getTelemetrySurface()),
      code: String(event?.code || 'UNKNOWN'),
      mode: String(event?.mode || 'unknown'),
      durationBucket: String(event?.durationBucket || 'unknown')
    };
    fetch(API_BASE + '/telemetry/events', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events: [payload] }),
      keepalive: true
    }).catch(function () {
      // Telemetry must never affect the user journey.
    });
  }

  /**
   * 统一 API 调用函数
   * 总纲13.6：所有 API 走 /api/v1/ 版本化路径
   * 总纲11.2：无感切换，前端始终接收统一格式
   *
   * @param {string} method - HTTP 方法 ('GET' | 'POST' | 'PUT' | 'DELETE')
   * @param {string} path   - API 路径（如 '/plans'，会自动拼接 API_BASE）
   * @param {object} [body] - 请求体（POST/PUT 时传入）
   * @returns {Promise<object>} 解析后的 JSON 响应
   * @throws {Error} 网络错误或服务端错误
   */
  async function apiCall(method, path, body) {
    var startedAt = Date.now();
    var url = API_BASE + path;
    var options = {
      method: method,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      options.body = JSON.stringify(body);
    }

    var response;
    try {
      response = await fetch(url, options);
    } catch (networkErr) {
      sendTelemetry({
        event: 'api_error',
        code: 'NETWORK',
        durationBucket: durationBucket(Date.now() - startedAt)
      });
      // 网络错误（总纲18.3：不得伪造数据）
      throw new Error('网络连接失败，请检查网络后重试');
    }

    // 尝试解析 JSON
    var data;
    try {
      data = await response.json();
    } catch (parseErr) {
      data = null;
    }

    if (!response.ok) {
      // 总纲1.5：只使用审核过的用户文案，不把服务端内部 message 原样显示。
      var safeMessages = {
        400: '提交的信息需要调整，请检查后再试。',
        401: '当前会话需要重新确认，请刷新后再试。',
        403: '当前操作没有获得授权。',
        404: '这项内容可能已经被删除或移动。',
        409: '内容刚刚发生变化，请刷新后再试。',
        429: '操作有点频繁，请稍等片刻。'
      };
      var errMsg = data && data.userMessage
        ? data.userMessage
        : (safeMessages[response.status] || (response.status >= 500 ? '服务暂时没有响应，请稍后再试。' : '请求暂时没有完成，请重试。'));
      var err = new Error(errMsg);
      err.status = response.status;
      err.code = data && data.code;
      err.userMessage = errMsg;
      sendTelemetry({
        event: 'api_error',
        code: err.code || ('HTTP_' + response.status),
        durationBucket: durationBucket(Date.now() - startedAt)
      });
      throw err;
    }

    return data;
  }

  // ============================================================
  // 4. 工具函数
  // ============================================================

  /**
   * 安全转义 HTML（防止 XSS）
   */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 创建 DOM 元素并设置属性
   * @param {string} tag - 标签名
   * @param {object} [attrs] - 属性对象 { className, textContent, innerHTML, dataset, ... }
   * @param {Node[]} [children] - 子节点数组
   * @returns {HTMLElement}
   */
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (!attrs.hasOwnProperty(key)) continue;
        if (key === 'className') {
          node.className = attrs[key];
        } else if (key === 'textContent') {
          node.textContent = attrs[key];
        } else if (key === 'innerHTML') {
          node.innerHTML = attrs[key];
        } else if (key === 'dataset') {
          for (var dk in attrs.dataset) {
            node.dataset[dk] = attrs.dataset[dk];
          }
        } else if (key.indexOf('on') === 0 && typeof attrs[key] === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), attrs[key]);
        } else if (attrs[key] == null || attrs[key] === false) {
          continue;
        } else if (attrs[key] === true) {
          node.setAttribute(key, '');
        } else {
          node.setAttribute(key, attrs[key]);
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        if (children[i] == null) continue;
        if (typeof children[i] === 'string') {
          node.appendChild(document.createTextNode(children[i]));
        } else {
          node.appendChild(children[i]);
        }
      }
    }
    return node;
  }

  function icon(name, className, alt) {
    return el('img', {
      className: className || 'icon',
      src: 'assets/icons/' + name + '.svg',
      alt: alt || '',
      'aria-hidden': alt ? 'false' : 'true'
    });
  }

  var notificationTimer = null;

  function notify(message, options) {
    options = options || {};
    var type = options.type || 'info';
    var host = document.getElementById('app-notifications');
    if (!host) {
      host = el('div', {
        id: 'app-notifications',
        className: 'app-notifications',
        'aria-live': type === 'error' ? 'assertive' : 'polite',
        'aria-atomic': 'true'
      });
      document.body.appendChild(host);
    }
    host.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    host.innerHTML = '';
    if (notificationTimer) clearTimeout(notificationTimer);

    var notice = el('div', {
      className: 'app-notice app-notice--' + type,
      role: type === 'error' ? 'alert' : 'status'
    }, [
      icon(type === 'success' ? 'check' : type === 'error' ? 'circle-alert' : 'compass', 'app-notice__icon'),
      el('span', { className: 'app-notice__message', textContent: String(message || '') }),
      el('button', {
        type: 'button',
        className: 'app-notice__close',
        'aria-label': '关闭提示',
        title: '关闭提示',
        onClick: function () {
          host.innerHTML = '';
          if (notificationTimer) clearTimeout(notificationTimer);
        }
      }, [icon('x', 'app-notice__close-icon')])
    ]);
    host.appendChild(notice);
    requestAnimationFrame(function () { notice.classList.add('app-notice--visible'); });
    notificationTimer = setTimeout(function () {
      notice.classList.remove('app-notice--visible');
      setTimeout(function () {
        if (notice.parentNode === host) host.removeChild(notice);
      }, 180);
    }, Number(options.duration) || 3600);
  }

  /**
   * 格式化金额（人民币）
   */
  function formatCurrency(amount) {
    if (amount == null) return '--';
    return '¥' + Number(amount).toLocaleString('zh-CN');
  }

  /**
   * 格式化百分比
   */
  function formatPercent(value) {
    if (value == null) return '--';
    return Math.round(value * 100) + '%';
  }

  function dedupePendingProposals(items, limit) {
    var bestByTrait = {};
    (items || []).filter(function (proposal) {
      return proposal && (!proposal.status || proposal.status === 'pending');
    }).forEach(function (proposal) {
      var key = proposal.traitKey || proposal.id;
      var existing = bestByTrait[key];
      var support = Number(proposal.supportingEvidenceCount || proposal.evidenceCount || (proposal.evidenceIds || []).length || 0);
      var existingSupport = existing
        ? Number(existing.supportingEvidenceCount || existing.evidenceCount || (existing.evidenceIds || []).length || 0)
        : -1;
      var newer = String(proposal.createdAt || '') > String(existing?.createdAt || '');
      if (!existing || support > existingSupport || (support === existingSupport && newer)) bestByTrait[key] = proposal;
    });
    return Object.keys(bestByTrait).map(function (key) { return bestByTrait[key]; })
      .sort(function (a, b) {
        var aScore = Math.abs(Number(a.delta) || 0) * Number(a.auditConfidence ?? a.confidence ?? 0.5);
        var bScore = Math.abs(Number(b.delta) || 0) * Number(b.auditConfidence ?? b.confidence ?? 0.5);
        return bScore - aScore;
      })
      .slice(0, limit || 2);
  }

  function parseDateOnly(value) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    var year = Number(match[1]);
    var month = Number(match[2]);
    var day = Number(match[3]);
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function calculateTripEndDate(startDate, totalDays) {
    var start = parseDateOnly(startDate);
    var days = Math.max(1, Number(totalDays) || 1);
    if (!start) return '';
    start.setDate(start.getDate() + days - 1);
    var year = start.getFullYear();
    var month = String(start.getMonth() + 1).padStart(2, '0');
    var day = String(start.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function getTripCompletionState(trip) {
    if (!trip?.startDate) return { allowed: false, label: '先安排出发日', reason: '先安排出发日期，再标记旅行完成。' };
    var totalDays = Number(trip.planSnapshot?.selectedPlan?.totalDays || trip.planSnapshot?.multiCityPlan?.totalDays || 1);
    var endDateText = trip.endDate || calculateTripEndDate(trip.startDate, totalDays);
    var startDate = parseDateOnly(trip.startDate);
    var endDate = parseDateOnly(endDateText) || startDate;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (endDate && endDate > today) {
      return {
        allowed: false,
        label: startDate && startDate > today ? '出发后再标记完成' : '旅行结束后再标记完成',
        reason: '只有真实发生过的旅行才能进入已完成轨迹。'
      };
    }
    return { allowed: true, label: '标记为已完成' };
  }

  function getTripStartState(trip) {
    if (!trip?.startDate) return { allowed: false, label: '先安排出发日', reason: '先安排出发日期，再开始记录真实行程。' };
    var startDate = parseDateOnly(trip.startDate);
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    if (startDate && startDate > today) {
      return { allowed: false, label: '到出发日再开始', reason: '实况只记录真实发生，不提前假设。' };
    }
    return { allowed: true, label: '开始记录实况' };
  }

  /**
   * 根据 persona id 查找人格原型数据
   */
  function findPersona(personaId) {
    var normalized = String(personaId || '').replace(/_/g, '-');
    return PERSONAS.find(function (p) { return p.id === normalized; }) || PERSONAS[0];
  }

  /**
   * 根据 mood key 查找动机数据
   */
  function findMood(moodKey) {
    return MOODS.find(function (m) { return m.key === moodKey; });
  }

  /**
   * 获取本地存储数据（安全封装）
   */
  function getStorage(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  /**
   * 写入本地存储（安全封装）
   */
  function setStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // 存储失败静默处理
    }
  }

  // ============================================================
  // 5. 状态组件渲染
  // ============================================================

  /**
   * 渲染空状态
   * 总纲14.6：Empty 状态
   */
  function renderEmptyState(icon, title, description, actionLabel, actionFn) {
    var children = [
      el('div', { className: 'empty-state__icon' }, [AppIcon(icon, 'empty-state__icon-image')]),
      el('div', { className: 'empty-state__title', textContent: title }),
      el('div', { className: 'empty-state__description', textContent: description })
    ];
    if (actionLabel && actionFn) {
      children.push(
        el('button', {
          className: 'btn btn--primary',
          textContent: actionLabel,
          onClick: actionFn
        })
      );
    }
    return el('div', { className: 'empty-state' }, children);
  }

  function AppIcon(name, className) {
    return icon(name, className || 'icon');
  }

  /**
   * 渲染加载状态
   * 总纲14.6：Loading 状态
   * 总纲14.9：不伪造"AI思考表演"
   */
  function renderLoadingState(text) {
    return el('div', { className: 'loading-state' }, [
      el('div', { className: 'loading-spinner' }),
      el('div', { className: 'loading-text', textContent: text || '正在生成方案...' })
    ]);
  }

  /**
   * 渲染错误状态
   * 总纲14.6：Error 状态
   * 总纲1.5：不在用户端展示工程状态
   */
  function renderErrorState(title, description, retryFn) {
    var children = [
      el('div', { className: 'error-state__icon' }, [icon('circle-alert', 'error-state__icon-image')]),
      el('div', { className: 'error-state__title', textContent: title || '出了点问题' }),
      el('div', { className: 'error-state__description', textContent: description || '请稍后重试' })
    ];
    if (retryFn) {
      children.push(
        el('button', {
          className: 'btn btn--secondary',
          textContent: '重试',
          onClick: retryFn
        })
      );
    }
    return el('div', { className: 'error-state' }, children);
  }

  /**
   * 渲染人格视觉方块
   * 总纲14.7：CSS渐变+文字标识，不生成图片
   */
  function renderPersonaVisual(personaId, size) {
    var persona = findPersona(personaId);
    var sizeClass = size === 'lg' ? ' persona-visual--lg' : size === 'sm' ? ' persona-visual--sm' : '';
    return el('div', {
      className: 'persona-visual persona-visual--' + persona.id + sizeClass,
      title: persona.name
    }, [icon('sparkles', 'persona-visual__icon')]);
  }

  // ============================================================
  // 6. 页面渲染：行程页（#/trips）
  // ============================================================

  /**
   * 渲染行程页
   * 总纲4.1 路由 /trip/:id 的列表入口
   * 显示已保存的行程，空状态友好提示
   */
  function renderTrips(container) {
    var selectedTrip = state.selectedTripId
      ? state.trips.find(function (trip) { return trip.id === state.selectedTripId; })
      : null;
    if (selectedTrip) {
      renderTripDetail(container, selectedTrip);
      return;
    }

    var page = el('div', { className: 'page' });
    page.appendChild(el('h1', { className: 'page__title', textContent: '我的行程' }));
    page.appendChild(el('p', { className: 'page__subtitle', textContent: '查看和管理你保存的旅行计划' }));

    var trips = state.trips;

    if (!trips || trips.length === 0) {
      // 空状态友好提示
      page.appendChild(renderEmptyState(
        'luggage',
        '行囊空空',
        '还没出发？先告诉旅格你想怎样度过这次旅行，选一条喜欢的方案，就可以保存到这里。',
        '去规划一次',
        function () { location.hash = '#/plan'; }
      ));
    } else {
      // 行程列表
      var list = el('div', { className: 'card-list' });
      trips.forEach(function (trip) {
        var syncCopy = TripSync?.getSyncCopy(trip.syncState);
        var card = el('article', { className: 'card trip-card' }, [
          el('div', { className: 'card__header' }, [
            el('div', { className: 'card__title', textContent: trip.title || '未命名行程' }),
            el('div', { className: 'trip-card__status' }, [
              syncCopy ? el('span', { className: 'tag trip-sync-tag', textContent: syncCopy.label }) : null,
              el('span', {
                className: 'tag tag--' + (trip.status === 'completed' ? 'success' : 'primary'),
                textContent: getTripStatusLabel(trip.status)
              })
            ])
          ]),
          el('div', { className: 'card__body', textContent: trip.cities ? trip.cities.join(' → ') : '' }),
          el('div', { className: 'card__footer' }, [
            el('span', { className: 'font-meta text-muted', textContent: trip.startDate || '' }),
            el('button', {
              type: 'button',
              className: 'btn btn--text',
              textContent: '查看详情',
              onClick: function () {
                state.selectedTripId = trip.id;
                renderTrips(document.getElementById('app'));
              }
            })
          ])
        ]);
        list.appendChild(card);
      });
      page.appendChild(list);
    }

    container.innerHTML = '';
    container.appendChild(page);
  }

  function getTripStatusLabel(status) {
    return status === 'completed' ? '已完成' : status === 'ongoing' ? '旅行中' : status === 'cancelled' ? '已取消' : '规划中';
  }

  function renderTripSyncBand(trip) {
    var copy = TripSync?.getSyncCopy(trip.syncState);
    if (!copy) return null;
    return el('section', { className: 'trip-sync-band', 'aria-label': '行程保存状态' }, [
      el('div', {}, [
        el('strong', { textContent: copy.title }),
        el('span', { textContent: copy.description })
      ]),
      el('button', {
        type: 'button', className: 'btn btn--secondary',
        textContent: trip.syncBusy ? '保存中' : copy.action,
        disabled: trip.syncBusy ? 'disabled' : null,
        onClick: function () { retryTripSync(trip); }
      })
    ]);
  }

  async function retryTripSync(trip) {
    if (!trip || trip.syncBusy) return;
    trip.syncBusy = true;
    renderTripDetail(document.getElementById('app'), trip);
    try {
      await persistTrip(trip, { strict: true });
      trip.syncBusy = false;
      renderTripDetail(document.getElementById('app'), trip);
      notify('这条行程已经保存在当前旅格。', { type: 'success' });
    } catch (error) {
      trip.syncBusy = false;
      renderTripDetail(document.getElementById('app'), trip);
      notify(error.userMessage || '这条行程暂时没有同步，请稍后重试。', { type: 'error' });
    }
  }

  function renderTripSchedule(trip, totalDays) {
    if (!trip.scheduleDraft) {
      trip.scheduleDraft = { open: !trip.startDate, startDate: trip.startDate || '', busy: false };
    }
    var draft = trip.scheduleDraft;
    var section = el('section', { className: 'trip-schedule', 'aria-labelledby': 'trip-schedule-title' });

    if (!draft.open && trip.startDate) {
      section.appendChild(el('div', { className: 'trip-schedule__summary' }, [
        el('div', {}, [
          el('h2', { id: 'trip-schedule-title', className: 'sampling-title', textContent: '旅行时间' }),
          el('p', { className: 'sampling-note', textContent: trip.startDate + ' 出发，预计 ' + (trip.endDate || calculateTripEndDate(trip.startDate, totalDays)) + ' 结束。' })
        ]),
        el('button', {
          type: 'button', className: 'btn btn--secondary', textContent: '调整日期',
          onClick: function () {
            draft.open = true;
            draft.startDate = trip.startDate;
            renderTripDetail(document.getElementById('app'), trip);
          }
        })
      ]));
      return section;
    }

    var preview = el('span', {
      className: 'trip-schedule__preview',
      textContent: draft.startDate
        ? '预计 ' + calculateTripEndDate(draft.startDate, totalDays) + ' 结束，共 ' + totalDays + ' 天'
        : '选择日期后会自动计算计划结束日'
    });
    section.appendChild(el('div', { className: 'trip-schedule__form' }, [
      el('div', {}, [
        el('h2', { id: 'trip-schedule-title', className: 'sampling-title', textContent: trip.startDate ? '调整出发日期' : '先安排出发日期' }),
        el('p', { className: 'sampling-note', textContent: '日期只决定什么时候进入实况与复盘，不会改变你已经选好的路线。' })
      ]),
      el('label', { className: 'field trip-schedule__field' }, [
        el('span', { className: 'field__label', textContent: '出发日期' }),
        el('input', {
          type: 'date', value: draft.startDate,
          onInput: function () {
            draft.startDate = this.value;
            preview.textContent = draft.startDate
              ? '预计 ' + calculateTripEndDate(draft.startDate, totalDays) + ' 结束，共 ' + totalDays + ' 天'
              : '选择日期后会自动计算计划结束日';
            var saveButton = section.querySelector('.trip-schedule__save');
            if (saveButton) saveButton.disabled = !parseDateOnly(draft.startDate);
          }
        }),
        preview
      ]),
      el('div', { className: 'trip-schedule__actions' + (trip.startDate ? ' trip-schedule__actions--split' : '') }, [
        trip.startDate ? el('button', {
          type: 'button', className: 'btn btn--text', textContent: '取消',
          disabled: draft.busy ? 'disabled' : null,
          onClick: function () {
            draft.open = false;
            draft.startDate = trip.startDate;
            renderTripDetail(document.getElementById('app'), trip);
          }
        }) : null,
        el('button', {
          type: 'button', className: 'btn btn--primary trip-schedule__save', textContent: draft.busy ? '保存中' : '保存日期',
          disabled: draft.busy || !parseDateOnly(draft.startDate) ? 'disabled' : null,
          onClick: function () { updateTripSchedule(trip, totalDays); }
        })
      ])
    ]));
    return section;
  }

  async function updateTripSchedule(trip, totalDays) {
    var draft = trip.scheduleDraft;
    if (!draft || draft.busy || !parseDateOnly(draft.startDate)) return;
    var previousStartDate = trip.startDate;
    var previousEndDate = trip.endDate;
    draft.busy = true;
    trip.startDate = draft.startDate;
    trip.endDate = calculateTripEndDate(draft.startDate, totalDays);
    trip.updatedAt = new Date().toISOString();
    renderTripDetail(document.getElementById('app'), trip);
    try {
      await persistTrip(trip, { strict: true });
      draft.busy = false;
      draft.open = false;
      setStorage('tp_trips', state.trips);
      renderTripDetail(document.getElementById('app'), trip);
      notify('出发日期已安排，旅行开始后就能记录真实行程。', { type: 'success' });
    } catch (error) {
      trip.startDate = previousStartDate;
      trip.endDate = previousEndDate;
      draft.busy = false;
      setStorage('tp_trips', state.trips);
      renderTripDetail(document.getElementById('app'), trip);
      notify(error.userMessage || '出发日期暂时没有保存，请重试。', { type: 'error' });
    }
  }

  function renderTripDetail(container, trip) {
    var snapshot = trip.planSnapshot || {};
    var selectedPlan = snapshot.selectedPlan || {};
    var nodes = selectedPlan.nodes || [];
    var page = el('div', { className: 'page' });
    page.appendChild(el('button', {
      type: 'button',
      className: 'btn btn--text trip-detail__back',
      onClick: function () {
        state.selectedTripId = null;
        renderTrips(document.getElementById('app'));
      }
    }, [icon('arrow-left', 'btn__icon'), el('span', { textContent: '全部行程' })]));

    page.appendChild(el('div', { className: 'trip-detail__heading' }, [
      el('div', {}, [
        el('div', { className: 'page-kicker', textContent: 'SAVED TRIP' }),
        el('h1', { className: 'page__title', textContent: trip.title || '未命名行程' }),
        el('p', { className: 'page__subtitle', textContent: selectedPlan.tradeoff || '这份计划会继续接住你的删改、实际行程和旅行复盘。' })
      ]),
      el('span', { className: 'tag tag--' + (trip.status === 'completed' ? 'success' : 'primary'), textContent: getTripStatusLabel(trip.status) })
    ]));

    var totalDays = Number(selectedPlan.totalDays || snapshot.multiCityPlan?.totalDays || 1);
    page.appendChild(el('section', { className: 'trip-facts', 'aria-label': '行程摘要' }, [
      el('div', {}, [el('strong', { textContent: trip.startDate || '待定' }), el('span', { textContent: '出发日期' })]),
      el('div', {}, [el('strong', { textContent: String(totalDays || '--') }), el('span', { textContent: '计划天数' })]),
      el('div', {}, [el('strong', { textContent: String(Math.max(0, (trip.cities || []).length - 1)) }), el('span', { textContent: '停留城市' })]),
      el('div', {}, [el('strong', { textContent: selectedPlan.name || '已保存方案' }), el('span', { textContent: '路线版本' })])
    ]));
    var syncBand = renderTripSyncBand(trip);
    if (syncBand) page.appendChild(syncBand);
    if (trip.status === 'planning') page.appendChild(renderTripSchedule(trip, totalDays));

    if (nodes.length > 0) {
      var routeSection = el('section', { className: 'trip-route', 'aria-labelledby': 'trip-route-title' }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [
            el('h2', { id: 'trip-route-title', className: 'sampling-title', textContent: trip.status === 'planning' ? '这条路线现在怎么走' : '当时保存的路线' }),
            el('p', { className: 'sampling-note', textContent: trip.status === 'planning'
              ? '中间城市可以继续删；起点、终点和必到城市会被保留。'
              : '原计划已经冻结；实际少去、久留和临时变化会单独记录，不反向改写计划。' })
          ])
        ])
      ]);
      var routeList = el('ol', { className: 'trip-route__list' });
      nodes.forEach(function (node, index) {
        var protectedNode = trip.status !== 'planning' || index === 0 || index === nodes.length - 1 || node.city === snapshot.multiCityPlan?.destination || node.city === '北京';
        var nodeTips = [];
        var seenNodeTips = {};
        (node.dayPlans || []).flatMap(function (day) { return day.pois || []; }).forEach(function (poi) {
          var tip = poi.tip ? poi.name + '：' + poi.tip : '';
          if (tip && /预约|闭馆|营业|不要|提前|天气|旺季|排队/.test(tip) && !seenNodeTips[tip] && nodeTips.length < 2) {
            seenNodeTips[tip] = true;
            nodeTips.push(tip);
          }
        });
        routeList.appendChild(el('li', { className: 'trip-route__item' }, [
          el('span', { className: 'trip-route__index', textContent: String(index + 1) }),
          el('div', { className: 'trip-route__content' }, [
            el('div', { className: 'trip-route__title' }, [
              el('strong', { textContent: node.city }),
              el('span', { className: 'font-meta text-muted', textContent: node.stay ? node.stay + ' 天' : node.role || '' })
            ]),
            el('span', { className: 'font-meta text-muted', textContent: node.transport || node.reason || '' }),
            node.dayPlans && node.dayPlans.length ? el('div', { className: 'trip-route__days' }, node.dayPlans.map(function (day) {
              var names = (day.pois || []).map(function (poi) { return poi.name; });
              return el('span', { textContent: 'D' + day.day + ' · ' + (names.length ? names.join(' / ') : day.theme) });
            })) : null,
            nodeTips.length ? el('ul', { className: 'trip-route__tips' }, nodeTips.map(function (tip) { return el('li', { textContent: tip }); })) : null
          ]),
          protectedNode
            ? el('span', { className: 'tag', textContent: trip.status !== 'planning' ? '计划' : node.city === snapshot.multiCityPlan?.destination || node.city === '北京' ? '必到' : '保留' })
            : el('button', {
                type: 'button',
                className: 'icon-button trip-route__remove',
                title: '从方案移除',
                'aria-label': '从方案移除' + node.city,
                onClick: function () { removeCityFromTrip(trip, index); }
              }, [icon('x', 'icon-button__icon')])
        ]));
      });
      routeSection.appendChild(routeList);
      (trip.routeChanges || []).filter(function (change) {
        return change.status !== 'undone';
      }).slice(-3).reverse().forEach(function (change) {
        routeSection.appendChild(renderRouteChangeBand(trip, change));
      });
      page.appendChild(routeSection);
    }

    page.appendChild(renderActualTripSection(trip, nodes));

    var completionState = getTripCompletionState(trip);
    if (trip.deleteConfirm) {
      page.appendChild(el('div', { className: 'trip-delete-confirm', role: 'alert' }, [
        el('div', {}, [
          el('strong', { textContent: '确认删除这条行程？' }),
          el('span', { textContent: '计划和旅行实况会删除；已经保存的手账仍会保留，但不再关联这条行程。' })
        ]),
        el('div', { className: 'trip-delete-confirm__actions' }, [
          el('button', {
            type: 'button', className: 'btn btn--text', textContent: '取消',
            onClick: function () { trip.deleteConfirm = false; renderTripDetail(document.getElementById('app'), trip); }
          }),
          el('button', {
            type: 'button', className: 'btn btn--secondary', textContent: trip.deleteBusy ? '删除中' : '确认删除',
            disabled: trip.deleteBusy ? 'disabled' : null,
            onClick: function () { deleteTripRecord(trip); }
          })
        ])
      ]));
    }
    page.appendChild(el('div', { className: 'trip-detail__actions' }, [
      trip.status === 'ongoing' ? el('button', {
        type: 'button',
        className: 'btn btn--secondary',
        textContent: completionState.label,
        disabled: completionState.allowed ? null : 'disabled',
        title: completionState.reason || '',
        onClick: function () { updateTripStatus(trip, 'completed'); }
      }) : null,
      el('button', {
        type: 'button',
        className: 'btn btn--primary btn--with-icon',
        onClick: function () { startTripReview(trip); }
      }, [icon('book-open', 'btn__icon'), el('span', { textContent: trip.status === 'completed'
        ? '写旅行复盘'
        : trip.status === 'ongoing'
          ? '记录旅途感受'
          : '写一条行前手账' })]),
      el('button', {
        type: 'button',
        className: 'btn btn--text',
        textContent: '回到方案比较',
        onClick: function () {
          state.plan.result = snapshot;
          state.plan.selectedRouteVariantId = (trip.selectedPathType || '').replace('multiCity:', '') || 'balanced';
          location.hash = '#/plan';
        }
      }),
      el('button', {
        type: 'button',
        className: 'btn btn--text trip-detail__delete',
        textContent: '删除行程',
        onClick: function () {
          trip.deleteConfirm = true;
          renderTripDetail(document.getElementById('app'), trip);
        }
      })
    ]));

    container.innerHTML = '';
    container.appendChild(page);
  }

  async function deleteTripRecord(trip) {
    if (!trip || trip.deleteBusy) return;
    trip.deleteBusy = true;
    renderTripDetail(document.getElementById('app'), trip);
    try {
      if (trip.syncState !== 'local-only') {
        try {
          await apiCall('DELETE', '/journals/travel-trace/' + trip.id);
        } catch (error) {
          if (!(trip.syncState === 'pending-create' && error.status === 404)) throw error;
        }
      }
      state.trips = state.trips.filter(function (item) { return item.id !== trip.id; });
      state.journal.forEach(function (entry) {
        if (entry.tripId === trip.id) entry.tripId = null;
      });
      state.selectedTripId = null;
      setStorage('tp_trips', state.trips);
      setStorage('tp_journal', state.journal);
      await loadGrowthTimeline();
      renderTrips(document.getElementById('app'));
      notify('行程已删除，已有手账仍为你保留。', { type: 'success' });
    } catch (error) {
      trip.deleteBusy = false;
      renderTripDetail(document.getElementById('app'), trip);
      notify(error.userMessage || '这条行程暂时无法删除，请重试。', { type: 'error' });
    }
  }

  function getLatestActiveActualEvent(trip, city, types) {
    return (trip.actualEvents || [])
      .filter(function (event) { return event.status === 'active' && event.city === city && types.indexOf(event.type) >= 0; })
      .sort(function (a, b) { return String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')); })[0] || null;
  }

  function getActualStay(trip, city, stateEvent, plannedStay) {
    var stayEvent = getLatestActiveActualEvent(trip, city, ['stay_changed']);
    return Number(stayEvent?.actualStay || stateEvent?.actualStay || plannedStay || 1);
  }

  function getActualTripSummaryLocal(trip, nodes) {
    var uniquePlanned = [];
    (nodes || []).slice(1, -1).forEach(function (node) {
      if (node.city && !uniquePlanned.some(function (item) { return item.city === node.city; })) uniquePlanned.push(node);
    });
    var visited = 0;
    var skipped = 0;
    uniquePlanned.forEach(function (node) {
      var stateEvent = getLatestActiveActualEvent(trip, node.city, ['city_visited', 'city_skipped']);
      if (stateEvent?.type === 'city_visited') visited += 1;
      if (stateEvent?.type === 'city_skipped') skipped += 1;
    });
    var added = (trip.actualEvents || []).filter(function (event) {
      return event.status === 'active' && event.type === 'city_added';
    });
    var stayChanged = (trip.actualEvents || []).filter(function (event) {
      return event.status === 'active' && event.type === 'stay_changed';
    });
    return {
      plannedNodes: uniquePlanned,
      planned: uniquePlanned.length,
      visited: visited + added.length,
      skipped: skipped,
      added: added.length,
      stayChanged: stayChanged.length,
      addedEvents: added,
      hasRecords: visited + skipped + added.length > 0
    };
  }

  function renderActualTripSection(trip, nodes) {
    trip.actualEvents = Array.isArray(trip.actualEvents) ? trip.actualEvents : [];
    trip.actualDraft = trip.actualDraft || { open: false, city: '', stay: 1 };
    var summary = getActualTripSummaryLocal(trip, nodes);
    var recordable = trip.status === 'ongoing' || trip.status === 'completed';
    var section = el('section', { className: 'trip-actual', 'aria-labelledby': 'trip-actual-title' }, [
      el('div', { className: 'section-heading trip-actual__heading' }, [
        el('div', {}, [
          el('h2', { id: 'trip-actual-title', className: 'sampling-title', textContent: '这趟实际发生了什么' }),
          el('p', { className: 'sampling-note', textContent: '只和原计划做对照。实况默认不进入旅格分析，完整复盘仍由你决定是否授权。' })
        ]),
        recordable ? el('button', {
          type: 'button', className: 'btn btn--secondary btn--with-icon',
          onClick: function () {
            trip.actualDraft.open = !trip.actualDraft.open;
            renderTripDetail(document.getElementById('app'), trip);
          }
        }, [icon(trip.actualDraft.open ? 'x' : 'plus', 'btn__icon'), el('span', { textContent: trip.actualDraft.open ? '收起' : '补记临时城市' })]) : null
      ])
    ]);

    if (!recordable) {
      var startState = getTripStartState(trip);
      section.appendChild(el('div', { className: 'trip-actual__start' }, [
        el('div', {}, [
          el('strong', { textContent: '出发后再记录，不提前替你假设' }),
          el('span', { textContent: '开始实况后，原计划会冻结，实际变化会单独保存。' })
        ]),
        el('button', {
          type: 'button', className: 'btn btn--primary', textContent: startState.label,
          disabled: startState.allowed ? null : 'disabled', title: startState.reason || '',
          onClick: function () { updateTripStatus(trip, 'ongoing'); }
        })
      ]));
      return section;
    }

    section.appendChild(el('div', { className: 'trip-actual__metrics', 'aria-label': '计划与实际摘要' }, [
      renderActualMetric(summary.planned, '计划城市'),
      renderActualMetric(summary.visited, '实际到访'),
      renderActualMetric(summary.skipped, '没去成'),
      renderActualMetric(summary.added, '临时新增')
    ]));

    if (trip.actualDraft.open) {
      section.appendChild(el('div', { className: 'trip-actual__add-form' }, [
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label', textContent: '临时去了哪座城市' }),
          el('input', {
            type: 'text', maxlength: '40', placeholder: '例如：无锡', value: trip.actualDraft.city,
            onInput: function () { trip.actualDraft.city = this.value; }
          })
        ]),
        el('label', { className: 'field' }, [
          el('span', { className: 'field__label', textContent: '实际停留天数' }),
          el('input', {
            type: 'number', min: '0.5', max: '30', step: '0.5', value: String(trip.actualDraft.stay || 1),
            onInput: function () { trip.actualDraft.stay = Number(this.value) || 1; }
          })
        ]),
        el('button', {
          type: 'button', className: 'btn btn--primary', textContent: '加入实况',
          onClick: function () { addActualCity(trip, summary.plannedNodes); }
        })
      ]));
    }

    var list = el('div', { className: 'trip-actual__list' });
    summary.plannedNodes.forEach(function (node) {
      list.appendChild(renderActualCityRow(trip, node, true));
    });
    summary.addedEvents.forEach(function (event) {
      list.appendChild(renderActualCityRow(trip, {
        city: event.city,
        stay: event.actualStay || 1,
        addedEvent: event
      }, false));
    });
    section.appendChild(list);
    if (!summary.hasRecords) {
      section.appendChild(el('p', { className: 'trip-actual__empty', textContent: '还没有实况记录。可以只标记一座真正到过或没去成的城市，不必一次补完整趟旅行。' }));
    }
    return section;
  }

  function renderActualMetric(value, label) {
    return el('div', {}, [el('strong', { textContent: String(value) }), el('span', { textContent: label })]);
  }

  function renderActualCityRow(trip, node, planned) {
    var stateEvent = planned
      ? getLatestActiveActualEvent(trip, node.city, ['city_visited', 'city_skipped'])
      : node.addedEvent;
    var visited = stateEvent && ['city_visited', 'city_added'].indexOf(stateEvent.type) >= 0;
    var skipped = stateEvent?.type === 'city_skipped';
    var actualStay = getActualStay(trip, node.city, stateEvent, node.stay);
    var row = el('div', { className: 'actual-city-row' }, [
      el('div', { className: 'actual-city-row__identity' }, [
        el('strong', { textContent: node.city }),
        el('span', { textContent: planned ? '计划 ' + Number(node.stay || 0) + ' 天' : '临时新增' })
      ]),
      planned ? el('div', { className: 'actual-city-row__states', role: 'group', 'aria-label': node.city + '实际状态' }, [
        el('button', {
          type: 'button', className: 'actual-state' + (visited ? ' actual-state--active' : ''),
          'aria-pressed': visited ? 'true' : 'false', textContent: '实际到访',
          onClick: function () { setActualCityState(trip, node, 'city_visited'); }
        }),
        el('button', {
          type: 'button', className: 'actual-state' + (skipped ? ' actual-state--skipped' : ''),
          'aria-pressed': skipped ? 'true' : 'false', textContent: '没去成',
          onClick: function () { setActualCityState(trip, node, 'city_skipped'); }
        })
      ]) : el('span', { className: 'tag tag--success', textContent: '实际到访' })
    ]);

    if (visited) {
      row.appendChild(el('div', { className: 'actual-stay-stepper', role: 'group', 'aria-label': node.city + '实际停留天数' }, [
        el('span', { textContent: '实际停留' }),
        el('button', {
          type: 'button', className: 'icon-button', title: '减少半天', 'aria-label': '减少' + node.city + '实际停留半天',
          disabled: actualStay <= 0.5 ? 'disabled' : null,
          onClick: function () { changeActualStay(trip, node.city, node.stay, actualStay - 0.5); }
        }, [icon('minus', 'icon-button__icon')]),
        el('output', { textContent: actualStay + ' 天' }),
        el('button', {
          type: 'button', className: 'icon-button', title: '增加半天', 'aria-label': '增加' + node.city + '实际停留半天',
          disabled: actualStay >= 30 ? 'disabled' : null,
          onClick: function () { changeActualStay(trip, node.city, node.stay, actualStay + 0.5); }
        }, [icon('plus', 'icon-button__icon')])
      ]));
    }
    if (!planned) {
      row.appendChild(el('button', {
        type: 'button', className: 'icon-button actual-city-row__remove', title: '撤销临时城市', 'aria-label': '撤销临时城市' + node.city,
        onClick: function () { undoActualEvent(trip, node.addedEvent); }
      }, [icon('x', 'icon-button__icon')]));
    }
    return row;
  }

  function newActualEvent(type, city, planned, plannedStay, actualStay) {
    return {
      id: 'actual_event_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type: type,
      city: city,
      planned: planned,
      plannedStay: plannedStay == null ? null : Number(plannedStay),
      actualStay: actualStay == null ? null : Number(actualStay),
      status: 'active',
      source: 'user-confirmed',
      occurredAt: new Date().toISOString(),
      undoneAt: null,
      supersededAt: null
    };
  }

  function supersedeActualEvents(trip, city, types) {
    var now = new Date().toISOString();
    (trip.actualEvents || []).forEach(function (event) {
      if (event.city === city && event.status === 'active' && types.indexOf(event.type) >= 0) {
        event.status = 'superseded';
        event.supersededAt = now;
      }
    });
  }

  function setActualCityState(trip, node, type) {
    var current = getLatestActiveActualEvent(trip, node.city, ['city_visited', 'city_skipped']);
    if (current?.type === type) {
      current.status = 'undone';
      current.undoneAt = new Date().toISOString();
      supersedeActualEvents(trip, node.city, ['stay_changed']);
    } else {
      supersedeActualEvents(trip, node.city, ['city_visited', 'city_skipped', 'stay_changed']);
      trip.actualEvents.push(newActualEvent(type, node.city, true, node.stay, type === 'city_skipped' ? 0 : node.stay || 1));
    }
    trip.updatedAt = new Date().toISOString();
    persistTrip(trip);
    renderTripDetail(document.getElementById('app'), trip);
  }

  function changeActualStay(trip, city, plannedStay, nextStay) {
    var stateEvent = getLatestActiveActualEvent(trip, city, ['city_visited', 'city_added']);
    if (!stateEvent) return;
    supersedeActualEvents(trip, city, ['stay_changed']);
    trip.actualEvents.push(newActualEvent('stay_changed', city, stateEvent.type !== 'city_added', plannedStay, Math.max(0.5, Math.min(Number(nextStay) || 0.5, 30))));
    trip.updatedAt = new Date().toISOString();
    persistTrip(trip);
    renderTripDetail(document.getElementById('app'), trip);
  }

  function addActualCity(trip, plannedNodes) {
    var city = String(trip.actualDraft?.city || '').trim();
    var stay = Math.max(0.5, Math.min(Number(trip.actualDraft?.stay) || 1, 30));
    if (!city) {
      notify('先写下临时到访的城市。', { type: 'info' });
      return;
    }
    if ((plannedNodes || []).some(function (node) { return node.city === city; })) {
      notify(city + '已经在原计划里，可以直接标记实际到访。', { type: 'info' });
      return;
    }
    supersedeActualEvents(trip, city, ['city_added', 'stay_changed']);
    trip.actualEvents.push(newActualEvent('city_added', city, false, null, stay));
    trip.actualDraft = { open: false, city: '', stay: 1 };
    trip.updatedAt = new Date().toISOString();
    persistTrip(trip);
    renderTripDetail(document.getElementById('app'), trip);
  }

  function undoActualEvent(trip, event) {
    if (!event || event.status !== 'active') return;
    event.status = 'undone';
    event.undoneAt = new Date().toISOString();
    supersedeActualEvents(trip, event.city, ['stay_changed']);
    trip.updatedAt = event.undoneAt;
    persistTrip(trip);
    renderTripDetail(document.getElementById('app'), trip);
  }

  function persistTrip(trip, options) {
    options = options || {};
    var createMode = trip.syncState === 'local-only' || trip.syncState === 'pending-create';
    trip.syncState = createMode ? 'pending-create' : 'pending-update';
    setStorage('tp_trips', state.trips);
    var payload = {
      tripId: trip.id,
      title: trip.title,
      cities: trip.cities,
      status: trip.status,
      startDate: trip.startDate,
      endDate: trip.endDate,
      planSnapshot: trip.planSnapshot,
      routeChanges: trip.routeChanges || [],
      actualEvents: trip.actualEvents || []
    };
    var request = apiCall(createMode ? 'POST' : 'PUT', createMode
      ? '/journals/travel-trace'
      : '/journals/travel-trace/' + trip.id, payload);
    return request.then(function (saved) {
      trip.syncState = 'synced';
      trip.updatedAt = saved?.updatedAt || trip.updatedAt;
      setStorage('tp_trips', state.trips);
      if (state.selectedTripId === trip.id && global.location.hash === '#/trips') {
        renderTripDetail(document.getElementById('app'), trip);
      }
      return saved;
    }).catch(function (error) {
      trip.syncState = createMode ? 'pending-create' : 'pending-update';
      setStorage('tp_trips', state.trips);
      if (options.strict) throw error;
      return null;
    });
  }

  function removeCityFromTrip(trip, nodeIndex) {
    var selectedPlan = trip.planSnapshot?.selectedPlan;
    if (!selectedPlan?.nodes || !selectedPlan.nodes[nodeIndex]) return;
    var removedNode = selectedPlan.nodes.splice(nodeIndex, 1)[0];
    trip.routeChanges = Array.isArray(trip.routeChanges) ? trip.routeChanges : [];
    trip.routeChanges.push({
      id: 'route_change_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      type: 'city_removed',
      city: removedNode.city,
      originalIndex: nodeIndex,
      nodeSnapshot: removedNode,
      status: 'active',
      occurredAt: new Date().toISOString(),
      undoneAt: null,
      explainedEntryId: null,
      explainedAt: null,
      explanationAuthorized: false
    });
    trip.cities = selectedPlan.nodes.map(function (node) { return node.city; }).filter(function (city, index, all) {
      return city && all.indexOf(city) === index;
    });
    trip.updatedAt = new Date().toISOString();
    persistTrip(trip);
    renderTripDetail(document.getElementById('app'), trip);
  }

  function renderRouteChangeBand(trip, change) {
    var explained = Boolean(change.explainedEntryId);
    var statusText = explained
      ? (change.explanationAuthorized ? '你的解释已作为旅格证据，仍需你确认后才会改变长期人格。' : '原因已写入手账，只保存、未分析。')
      : '这只是一次路线编辑，不会被系统擅自理解成“不喜欢”。';
    return el('div', { className: 'route-change-band', role: 'status' }, [
      el('div', { className: 'route-change-band__copy' }, [
        el('strong', { textContent: '已移除 ' + (change.city || '一个城市') }),
        el('span', { textContent: statusText })
      ]),
      el('div', { className: 'route-change-band__actions' }, [
        el('button', {
          type: 'button',
          className: 'btn btn--secondary',
          textContent: '撤销',
          onClick: function () { undoRouteChange(trip, change.id); }
        }),
        !explained ? el('button', {
          type: 'button',
          className: 'btn btn--text',
          textContent: '说明这次取舍',
          onClick: function () { startRouteChangeReview(trip, change); }
        }) : null
      ])
    ]);
  }

  async function undoRouteChange(trip, changeId) {
    var change = (trip.routeChanges || []).find(function (item) { return item.id === changeId; });
    var selectedPlan = trip.planSnapshot?.selectedPlan;
    if (!change || change.status === 'undone' || !selectedPlan?.nodes || !change.nodeSnapshot) return;
    if (!selectedPlan.nodes.some(function (node) { return node.city === change.city; })) {
      var insertAt = Math.max(0, Math.min(Number(change.originalIndex) || 0, selectedPlan.nodes.length));
      selectedPlan.nodes.splice(insertAt, 0, change.nodeSnapshot);
    }
    change.status = 'undone';
    change.undoneAt = new Date().toISOString();
    trip.cities = selectedPlan.nodes.map(function (node) { return node.city; }).filter(function (city, index, all) {
      return city && all.indexOf(city) === index;
    });
    trip.updatedAt = change.undoneAt;
    if (state.journalDraft?.decisionContext?.changeId === change.id && !change.explainedEntryId) {
      state.journalDraft = createJournalDraft();
      state.journalComposerOpen = false;
    }
    persistTrip(trip);
    renderTripDetail(document.getElementById('app'), trip);
    notify((change.city || '城市') + '已恢复到路线。', { type: 'success' });

    if (change.explainedEntryId && change.explanationAuthorized) {
      try {
        await apiCall('POST', '/journals/entries/' + change.explainedEntryId + '/authorize', { authorized: false });
        change.explanationAuthorized = false;
        var journalEntry = state.journal.find(function (entry) { return entry.id === change.explainedEntryId; });
        if (journalEntry) journalEntry.analysisAuthorized = false;
        setStorage('tp_journal', state.journal);
        persistTrip(trip);
        await refreshPendingProposals();
        loadGrowthTimeline();
        notify('关联手账仍保留，但已停止作为旅格证据。', { type: 'info' });
      } catch (_) {
        notify('路线已恢复；关联证据暂未停用，请到手账关闭分析授权。', { type: 'error', duration: 6000 });
      }
    }
  }

  function createJournalDraft(overrides) {
    return Object.assign({
      tripId: '', content: '', mood: '', decisionContext: null, reasonCategory: '',
      reviewMode: false, reviewSnapshot: { worth: '', values: [], deviations: [] },
      analysisAuthorized: false, error: null, saving: false
    }, overrides || {});
  }

  function startRouteChangeReview(trip, change) {
    state.journalDraft = createJournalDraft({
      tripId: trip.id,
      decisionContext: {
        kind: 'route_change',
        action: 'city_removed',
        changeId: change.id,
        city: change.city
      }
    });
    state.journalComposerOpen = true;
    state.selectedTripId = null;
    location.hash = '#/journal';
  }

  async function updateTripStatus(trip, status) {
    if (status === 'completed') {
      var completionState = getTripCompletionState(trip);
      if (!completionState.allowed) {
        notify(completionState.reason, { type: 'info' });
        return;
      }
    }
    if (status === 'ongoing') {
      var startState = getTripStartState(trip);
      if (!startState.allowed) {
        notify(startState.reason, { type: 'info' });
        return;
      }
    }
    var previousStatus = trip.status;
    trip.status = status;
    trip.updatedAt = new Date().toISOString();
    renderTripDetail(document.getElementById('app'), trip);
    try {
      await persistTrip(trip, { strict: true });
    } catch (error) {
      trip.status = previousStatus;
      trip.updatedAt = new Date().toISOString();
      setStorage('tp_trips', state.trips);
      renderTripDetail(document.getElementById('app'), trip);
      notify(error.userMessage || '行程状态暂时没有更新，请重试。', { type: 'error' });
    }
  }

  function startTripReview(trip) {
    state.journalDraft = createJournalDraft({
      tripId: trip.id,
      reviewMode: trip.status === 'completed'
    });
    state.journalComposerOpen = true;
    state.selectedTripId = null;
    location.hash = '#/journal';
  }

  // ============================================================
  // 7. 页面渲染：手账页（#/journal）
  // ============================================================

  /**
   * 渲染手账页
   * 总纲4.1 路由 /journal/:tripId 的列表入口
   * 总纲5.7：支持只记录、不分析
   */
  function renderJournal(container) {
    var page = el('div', { className: 'page' });
    page.appendChild(el('div', { className: 'page-heading-row' }, [
      el('div', {}, [
        el('div', { className: 'page-kicker', textContent: 'TRAVEL MEMORY' }),
        el('h1', { className: 'page__title', textContent: '旅行手账' }),
        el('p', { className: 'page__subtitle', textContent: '先记录真实体验，再决定要不要让它参与旅格分析。' })
      ]),
      el('button', {
        type: 'button',
        className: 'btn btn--primary btn--with-icon',
        onClick: function () {
          state.journalComposerOpen = !state.journalComposerOpen;
          renderJournal(document.getElementById('app'));
        }
      }, [icon(state.journalComposerOpen ? 'x' : 'square-pen', 'btn__icon'), el('span', { textContent: state.journalComposerOpen ? '收起' : '记录一次' })])
    ]));

    var journal = state.journal;
    var authorizedCount = journal.filter(function (entry) { return entry.analysisAuthorized; }).length;
    var pendingCount = (state.persona.pendingProposals || []).length;

    page.appendChild(el('section', { className: 'growth-strip', 'aria-label': '旅格成长进度' }, [
      el('div', { className: 'growth-strip__copy' }, [
        el('div', { className: 'growth-strip__title', textContent: '你的旅格不会被一条记录擅自改写' }),
        el('div', { className: 'growth-strip__desc', textContent: '手账先成为证据；只有达到可靠度门槛，系统才提出维度变化，并由你确认。' })
      ]),
      el('div', { className: 'growth-metrics' }, [
        renderGrowthMetric(journal.length, '真实记录'),
        renderGrowthMetric(authorizedCount, '授权证据'),
        renderGrowthMetric(pendingCount, '待确认变化')
      ])
    ]));

    if (state.journalComposerOpen) page.appendChild(renderJournalComposer());

    if (!journal || journal.length === 0) {
      page.appendChild(renderEmptyState(
        'book-open',
        '手账还是空白的',
        '旅行中或旅行后，记下期待落差、临时删改和真正喜欢的瞬间。默认只你可见。',
        '写第一条',
        function () {
          state.journalComposerOpen = true;
          renderJournal(document.getElementById('app'));
        }
      ));
    } else {
      // 手账列表
      var list = el('div', { className: 'card-list' });
      journal.forEach(function (entry) {
        var linkedRouteChange = findRouteChangeForJournalEntry(entry);
        var linkedJournalTrip = entry.tripId ? state.trips.find(function (trip) { return trip.id === entry.tripId; }) : null;
        var routeChangeUndone = linkedRouteChange?.status === 'undone';
        var cardChildren = [
          el('div', { className: 'card__header' }, [
            el('div', { className: 'card__title', textContent: entry.title || '手账记录' }),
            entry.mood ? el('span', { className: 'tag tag--primary', textContent: (findMood(entry.mood) || {}).label || entry.mood }) : null
          ]),
          entry.reviewSnapshot?.complete ? el('div', { className: 'journal-card__context' }, [
            el('span', { textContent: '完整旅行复盘' }),
            el('strong', { textContent: '计划与实际已对照' })
          ]) : entry.decisionContext?.kind === 'route_change' ? el('div', { className: 'journal-card__context' }, [
            el('span', { textContent: routeChangeUndone ? '已撤销的路线取舍' : '路线取舍' }),
            el('strong', { textContent: entry.decisionContext.city || '行程调整' })
          ]) : null,
          linkedJournalTrip ? el('div', { className: 'journal-card__trip' }, [
            icon('route', 'journal-card__trip-icon'),
            el('span', { textContent: '关联行程' }),
            el('strong', { textContent: formatJournalTripOption(linkedJournalTrip) })
          ]) : null,
          el('div', { className: 'card__body', textContent: entry.content }),
          el('div', { className: 'card__footer' }, [
            el('span', { className: 'font-meta text-muted', textContent: entry.createdAt || '' }),
            el('span', {
              className: 'tag ' + (entry.analysisAuthorized ? 'tag--success' : ''),
              textContent: entry.analysisAuthorized ? '已进入证据池' : '仅自己可见'
            })
          ]),
          el('div', { className: 'journal-card__actions', role: 'group', 'aria-label': '手账记录操作' }, [
            routeChangeUndone ? el('span', { className: 'journal-card__action-note', textContent: '对应取舍已撤销，保持未分析' }) : el('button', {
              type: 'button',
              className: 'btn btn--text journal-card__action',
              disabled: entry.actionBusy ? 'disabled' : null,
              textContent: entry.analysisAuthorized ? '停止分析' : '用于旅格分析',
              onClick: function () { toggleJournalAnalysis(entry); }
            }),
            el('button', {
              type: 'button',
              className: 'btn btn--text journal-card__action journal-card__action--danger',
              disabled: entry.actionBusy ? 'disabled' : null,
              textContent: '删除',
              onClick: function () {
                entry.deleteConfirm = true;
                renderJournal(document.getElementById('app'));
              }
            })
          ])
        ];
        if (entry.deleteConfirm) {
          cardChildren.push(el('div', { className: 'journal-card__delete-confirm', role: 'alert' }, [
            el('span', { textContent: '删除后，原文和未确认变化都会移除。' }),
            el('div', { className: 'journal-card__delete-actions' }, [
              el('button', {
                type: 'button', className: 'btn btn--text', textContent: '取消',
                onClick: function () { entry.deleteConfirm = false; renderJournal(document.getElementById('app')); }
              }),
              el('button', {
                type: 'button', className: 'btn btn--secondary journal-card__confirm-delete',
                disabled: entry.actionBusy ? 'disabled' : null,
                textContent: entry.actionBusy ? '删除中' : '确认删除',
                onClick: function () { deleteJournalEntry(entry); }
              })
            ])
          ]));
        }
        var card = el('article', { className: 'card journal-card' }, cardChildren);
        list.appendChild(card);
      });
      page.appendChild(list);
    }

    container.innerHTML = '';
    container.appendChild(page);
  }

  function renderGrowthMetric(value, label) {
    return el('div', { className: 'growth-metric' }, [
      el('strong', { className: 'growth-metric__value', textContent: String(value) }),
      el('span', { className: 'growth-metric__label', textContent: label })
    ]);
  }

  function findRouteChangeForJournalEntry(entry) {
    if (!entry) return null;
    var changeId = entry.decisionContext?.changeId;
    for (var i = 0; i < state.trips.length; i++) {
      var match = (state.trips[i].routeChanges || []).find(function (change) {
        return (changeId && change.id === changeId) || change.explainedEntryId === entry.id;
      });
      if (match) return match;
    }
    return null;
  }

  function syncJournalRouteChange(entry, authorized, deleted) {
    state.trips.forEach(function (trip) {
      var changed = false;
      (trip.routeChanges || []).forEach(function (change) {
        var linked = change.explainedEntryId === entry.id || (entry.decisionContext?.changeId && change.id === entry.decisionContext.changeId);
        if (!linked) return;
        if (deleted) {
          change.explainedEntryId = null;
          change.explainedAt = null;
          change.explanationAuthorized = false;
        } else {
          change.explanationAuthorized = Boolean(authorized);
        }
        changed = true;
      });
      if (changed) persistTrip(trip);
    });
  }

  async function refreshPendingProposals() {
    var result = await apiCall('GET', '/journals/persona/proposals');
    var pending = (result.proposals || []).filter(function (proposal) { return proposal.status === 'pending'; });
    state.persona.pendingProposals = dedupePendingProposals(pending, 2);
    state.persona.suppressedProposalCount = Math.max(0, pending.length - state.persona.pendingProposals.length);
    setStorage('tp_persona', state.persona);
  }

  async function toggleJournalAnalysis(entry) {
    if (!entry || entry.actionBusy) return;
    var target = !entry.analysisAuthorized;
    entry.actionBusy = true;
    entry.deleteConfirm = false;
    renderJournal(document.getElementById('app'));
    try {
      var saved = await apiCall('POST', '/journals/entries/' + entry.id + '/authorize', { authorized: target });
      entry.analysisAuthorized = Boolean(saved.analysisAuthorized);
      syncJournalRouteChange(entry, entry.analysisAuthorized, false);
      await refreshPendingProposals();
      await loadGrowthTimeline();
      entry.actionBusy = false;
      entry.deleteConfirm = false;
      setStorage('tp_journal', state.journal);
      renderJournal(document.getElementById('app'));
      notify(target && !entry.analysisAuthorized
        ? '这条记录因隐私分级保持未分析。'
        : (entry.analysisAuthorized ? '这条记录已进入旅格证据池。' : '已停止分析，手账原文仍为你保留。'),
      { type: target && !entry.analysisAuthorized ? 'info' : 'success' });
    } catch (error) {
      entry.actionBusy = false;
      renderJournal(document.getElementById('app'));
      notify(error.userMessage || '分析授权暂时没有更新，请重试。', { type: 'error' });
    }
  }

  async function deleteJournalEntry(entry) {
    if (!entry || entry.actionBusy) return;
    entry.actionBusy = true;
    renderJournal(document.getElementById('app'));
    try {
      await apiCall('DELETE', '/journals/entries/' + entry.id);
      syncJournalRouteChange(entry, false, true);
      state.journal = state.journal.filter(function (item) { return item.id !== entry.id; });
      setStorage('tp_journal', state.journal);
      await refreshPendingProposals();
      await loadGrowthTimeline();
      renderJournal(document.getElementById('app'));
      notify('这条手账和相关未确认变化已删除。', { type: 'success' });
    } catch (error) {
      entry.actionBusy = false;
      renderJournal(document.getElementById('app'));
      notify(error.userMessage || '这条手账暂时无法删除，请重试。', { type: 'error' });
    }
  }

  function formatJournalTripOption(trip) {
    if (!trip) return '当前行程';
    var date = trip.startDate || '日期待定';
    var syncSuffix = trip.syncState === 'local-only'
      ? ' · 仅此设备'
      : (trip.syncState === 'pending-create' || trip.syncState === 'pending-update') ? ' · 待同步' : '';
    return (trip.title || '未命名行程') + ' · ' + date + ' · ' + getTripStatusLabel(trip.status) + syncSuffix;
  }

  function renderJournalComposer() {
    var draft = state.journalDraft;
    var routeContext = draft.decisionContext?.kind === 'route_change' ? draft.decisionContext : null;
    var fullReview = Boolean(draft.reviewMode);
    draft.reviewSnapshot = draft.reviewSnapshot || { worth: '', values: [], deviations: [] };
    draft.reviewSnapshot.values = Array.isArray(draft.reviewSnapshot.values) ? draft.reviewSnapshot.values : [];
    draft.reviewSnapshot.deviations = Array.isArray(draft.reviewSnapshot.deviations) ? draft.reviewSnapshot.deviations : [];
    var section = el('section', { className: 'journal-composer', 'aria-labelledby': 'journal-composer-title' });
    section.appendChild(el('div', { className: 'journal-composer__heading' }, [
      el('div', {}, [
        el('h2', { id: 'journal-composer-title', className: 'sampling-title', textContent: fullReview ? '把这趟旅行完整地留下来' : routeContext ? '这次取舍，真实原因是什么？' : '这一段旅行，真实发生了什么？' }),
        el('p', { className: 'sampling-note', textContent: fullReview ? '不是为了证明成长，只是让计划、实际和你的感受被认真区分。' : routeContext ? '只记录你自己说出的原因；删除城市本身不会被当成人格结论。' : '可以写开心，也可以写落差、取消和临时改变。没有标准答案。' })
      ]),
      el('span', { className: 'sampling-count', textContent: fullReview ? '完整复盘' : '默认不分析' })
    ]));

    var tripOptions = [el('option', { value: '', textContent: '暂不关联行程' })];
    state.trips.forEach(function (trip) {
      tripOptions.push(el('option', { value: trip.id, selected: draft.tripId === trip.id ? true : null, textContent: formatJournalTripOption(trip) }));
    });
    var moodOptions = [el('option', { value: '', textContent: '不贴状态标签' })];
    MOODS.forEach(function (mood) {
      moodOptions.push(el('option', { value: mood.key, selected: draft.mood === mood.key ? true : null, textContent: mood.label }));
    });

    if (fullReview) {
      var reviewTrip = state.trips.find(function (trip) { return trip.id === draft.tripId; });
      var reviewNodes = reviewTrip?.planSnapshot?.selectedPlan?.nodes || [];
      var actualReviewSummary = getActualTripSummaryLocal(reviewTrip || { actualEvents: [] }, reviewNodes);
      section.appendChild(el('div', { className: 'full-review__trip' }, [
        el('span', { textContent: '正在复盘' }),
        el('strong', { textContent: reviewTrip?.title || '这次旅行' })
      ]));
      section.appendChild(el('div', { className: 'full-review__actual' }, [
        el('div', { className: 'full-review__actual-heading' }, [
          el('strong', { textContent: '计划与实际的结构化对照' }),
          el('span', { textContent: actualReviewSummary.hasRecords ? '来自你亲自标记的旅行实况' : '还没有逐城实况，仍可按记忆完成复盘' })
        ]),
        el('div', { className: 'full-review__actual-metrics' }, [
          renderActualMetric(actualReviewSummary.planned, '计划城市'),
          renderActualMetric(actualReviewSummary.visited, '实际到访'),
          renderActualMetric(actualReviewSummary.skipped, '没去成'),
          renderActualMetric(actualReviewSummary.added, '临时新增')
        ]),
        el('p', { textContent: actualReviewSummary.hasRecords
          ? '这些数字只帮助回忆，不会替你选择下面的答案，也不会自动改变旅格。'
          : '没有实况记录不会降低这次复盘的价值；你可以直接按自己的感受回答。' })
      ]));
      section.appendChild(el('div', { className: 'full-review__steps' }, [
        el('section', { className: 'full-review__step', 'aria-labelledby': 'full-review-worth' }, [
          renderFullReviewStepHeading('01', 'full-review-worth', '回头看，这趟旅行值得吗？', '“出发了就是值得”也完全是一种答案。'),
          el('div', { className: 'full-review__option-grid', role: 'radiogroup', 'aria-label': '这趟旅行是否值得' }, TRIP_REVIEW_WORTH.map(function (item) {
            return el('button', {
              type: 'button', role: 'radio',
              className: 'full-review__option' + (draft.reviewSnapshot.worth === item.key ? ' full-review__option--selected' : ''),
              'aria-checked': draft.reviewSnapshot.worth === item.key ? 'true' : 'false',
              textContent: item.label,
              onClick: function () {
                draft.reviewSnapshot.worth = item.key;
                draft.error = null;
                renderJournal(document.getElementById('app'));
              }
            });
          }))
        ]),
        el('section', { className: 'full-review__step', 'aria-labelledby': 'full-review-value' }, [
          renderFullReviewStepHeading('02', 'full-review-value', '真正留在你心里的是什么？', '可以多选，也可以只是单纯开心。'),
          renderFullReviewChips(TRIP_REVIEW_VALUES, draft.reviewSnapshot.values, false)
        ]),
        el('section', { className: 'full-review__step', 'aria-labelledby': 'full-review-deviation' }, [
          renderFullReviewStepHeading('03', 'full-review-deviation', '计划和实际，差在哪里？', '这些差异比“按计划完成多少”更能帮助下一次。'),
          renderFullReviewChips(TRIP_REVIEW_DEVIATIONS, draft.reviewSnapshot.deviations, true)
        ])
      ]));
    }

    function renderFullReviewStepHeading(number, id, title, description) {
      return el('div', { className: 'full-review__step-heading' }, [
        el('span', { textContent: number }),
        el('div', {}, [el('h3', { id: id, textContent: title }), el('p', { textContent: description })])
      ]);
    }

    function renderFullReviewChips(options, selected, exclusivePlanned) {
      return el('div', { className: 'chip-grid', role: 'group' }, options.map(function (item) {
        var active = selected.indexOf(item.key) >= 0;
        return el('button', {
          type: 'button',
          className: 'choice-chip' + (active ? ' choice-chip--selected' : ''),
          'aria-pressed': active ? 'true' : 'false',
          textContent: item.label,
          onClick: function () {
            if (active) {
              selected.splice(selected.indexOf(item.key), 1);
            } else if (exclusivePlanned && item.key === 'as_planned') {
              selected.splice(0, selected.length, 'as_planned');
            } else {
              if (exclusivePlanned) {
                var plannedIndex = selected.indexOf('as_planned');
                if (plannedIndex >= 0) selected.splice(plannedIndex, 1);
              }
              selected.push(item.key);
            }
            draft.error = null;
            renderJournal(document.getElementById('app'));
          }
        });
      }));
    }

    if (routeContext) {
      section.appendChild(el('div', { className: 'journal-decision-context' }, [
        el('div', { className: 'journal-decision-context__copy' }, [
          el('strong', { textContent: '你刚刚从路线中移除了 ' + (routeContext.city || '一个城市') }),
          el('span', { textContent: '可以先标记最接近的原因，再用自己的话写下来。原因标签不会单独改变旅格。' })
        ]),
        el('div', { className: 'journal-reason-options', role: 'group', 'aria-label': '这次取舍的原因' }, ROUTE_CHANGE_REASONS.map(function (reason) {
          return el('button', {
            type: 'button',
            className: 'choice-chip' + (draft.reasonCategory === reason.key ? ' choice-chip--selected' : ''),
            'aria-pressed': draft.reasonCategory === reason.key ? 'true' : 'false',
            textContent: reason.label,
            onClick: function () {
              draft.reasonCategory = draft.reasonCategory === reason.key ? '' : reason.key;
              renderJournal(document.getElementById('app'));
            }
          });
        }))
      ]));
    }

    section.appendChild(el('div', { className: 'field-grid' }, [
      (fullReview || routeContext) ? el('div', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: fullReview ? '完整复盘对应行程' : '关联行程' }),
        el('div', { className: 'field__static', textContent: formatJournalTripOption(state.trips.find(function (trip) { return trip.id === draft.tripId; })) })
      ]) : el('label', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: '关联哪次旅行（可选）' }),
        el('span', { className: 'field__control' }, [el('select', { onChange: function () { draft.tripId = this.value; } }, tripOptions)])
      ]),
      el('label', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: fullReview ? '这趟旅行整体更接近' : '这段体验更接近' }),
        el('span', { className: 'field__control' }, [el('select', { onChange: function () { draft.mood = this.value; } }, moodOptions)])
      ])
    ]));

    // ---- 结构化字段（仅关联行程时显示）----
    if (draft.tripId) {
      // 今日亮点标签（多选 chip）
      var tagsField = el('div', { className: 'journal-composer__field' }, [
        el('label', { className: 'journal-composer__label', textContent: '今日亮点' }),
        el('div', { className: 'journal-composer__chips' })
      ]);
      var tagOptions = ['风景', '美食', '人文', '住宿', '交通', '偶遇'];
      tagOptions.forEach(function(tag) {
        var chip = el('button', { type: 'button', className: 'journal-composer__chip', textContent: tag });
        chip.addEventListener('click', function() {
          this.classList.toggle('journal-composer__chip--selected');
        });
        tagsField.querySelector('.journal-composer__chips').appendChild(chip);
      });

      // 实际花费（数字输入）
      var costField = el('div', { className: 'journal-composer__field' }, [
        el('label', { className: 'journal-composer__label', textContent: '实际花费（选填）' }),
        el('input', { type: 'number', className: 'journal-composer__cost', placeholder: '今日花费', min: '0' })
      ]);

      // 与计划的偏差（单选按钮组）
      var deviationField = el('div', { className: 'journal-composer__field' }, [
        el('label', { className: 'journal-composer__label', textContent: '与计划的偏差' }),
        el('div', { className: 'journal-composer__radio-group' })
      ]);
      var deviationOptions = ['按计划执行', '临时变更', '意外惊喜', '体验不佳'];
      deviationOptions.forEach(function(opt, idx) {
        var radioWrap = el('label', { className: 'journal-composer__radio' }, [
          el('input', { type: 'radio', name: 'plan-deviation', value: ['on_plan', 'change', 'surprise', 'bad'][idx] }),
          el('span', { textContent: opt })
        ]);
        deviationField.querySelector('.journal-composer__radio-group').appendChild(radioWrap);
      });

      // 今日心情打分（5星）
      var moodField = el('div', { className: 'journal-composer__field' }, [
        el('label', { className: 'journal-composer__label', textContent: '今日心情' }),
        el('div', { className: 'journal-composer__stars' })
      ]);
      for (var s = 1; s <= 5; s++) {
        (function(score) {
          var star = el('button', { type: 'button', className: 'journal-composer__star', textContent: '\u2605', 'data-score': score });
          star.addEventListener('click', function() {
            moodField.querySelectorAll('.journal-composer__star').forEach(function(s, i) {
              s.classList.toggle('journal-composer__star--active', i < score);
            });
          });
          moodField.querySelector('.journal-composer__stars').appendChild(star);
        })(s);
      }

      // 把这些字段插入到 section 中（文本输入框之前）
      section.insertBefore(moodField, section.querySelector('.field--wide'));
      section.insertBefore(deviationField, section.querySelector('.field--wide'));
      section.insertBefore(costField, section.querySelector('.field--wide'));
      section.insertBefore(tagsField, section.querySelector('.field--wide'));
    }

    section.appendChild(el('label', { className: 'field field--wide' }, [
      el('span', { className: 'field__label', textContent: fullReview ? '最后，用自己的话留下这趟旅行' : '写下体验、变化或此刻的感受' }),
      el('textarea', {
        rows: '5',
        placeholder: fullReview
          ? '例如：我开心了，我出发了，我到了，我看见了。真正留下来的不是去了多少地方，而是……'
          : routeContext
          ? '例如：我删掉这里，不是因为不喜欢，而是这次预算更想留给北京，也不想再多换一次车。'
          : '例如：原本收藏了很多景点，最后删到每天两个。少赶路之后，我反而更记得那些街区和偶遇。',
        textContent: draft.content,
        onInput: function () { draft.content = this.value; draft.error = null; }
      })
    ]));

    var consentId = 'journal-analysis-consent';
    section.appendChild(el('label', { className: 'consent-row', for: consentId }, [
      el('input', {
        id: consentId,
        type: 'checkbox',
        checked: draft.analysisAuthorized ? true : null,
        onChange: function () { draft.analysisAuthorized = this.checked; }
      }),
      el('span', {}, [
        el('strong', { textContent: fullReview ? '允许把完整复盘转成旅格证据' : routeContext ? '允许把这次解释转成旅格证据' : '允许把这条记录转成旅格证据' }),
        el('small', { textContent: fullReview ? '结构化答案和文字会一起分析；原文不进入人格档案，任何长期变化仍需你确认。' : routeContext ? '只有你写下的解释会被分析；删城动作本身不会。原文不进入人格档案，变化仍需你确认。' : '原文不会出现在人格档案中；系统只提取维度变化线索，并且仍需你确认。' })
      ])
    ]));

    if (draft.error) section.appendChild(el('div', { className: 'inline-error', role: 'alert', textContent: draft.error }));
    section.appendChild(el('div', { className: 'sampling-actions' }, [
      el('button', {
        type: 'button',
        className: 'btn btn--primary btn--with-icon',
        disabled: draft.saving ? 'disabled' : null,
        onClick: saveJournalDraft
      }, [icon('check', 'btn__icon'), el('span', { textContent: draft.saving ? '保存中' : '保存记录' })])
    ]));
    return section;
  }

  async function saveJournalDraft() {
    var draft = state.journalDraft;
    if (draft.reviewMode && (!draft.reviewSnapshot?.worth
      || !draft.reviewSnapshot.values?.length
      || !draft.reviewSnapshot.deviations?.length)) {
      draft.error = '完整复盘需要回答“是否值得、留下了什么、计划与实际差异”三个部分。';
      renderJournal(document.getElementById('app'));
      return;
    }
    if (!draft.content.trim()) {
      draft.error = '至少写下一句真实感受。';
      renderJournal(document.getElementById('app'));
      return;
    }
    draft.saving = true;
    draft.error = null;
    renderJournal(document.getElementById('app'));

    try {
      var linkedTripForEntry = state.trips.find(function (trip) { return trip.id === draft.tripId; });
      var entryType = draft.reviewMode
        ? 'review'
        : (draft.decisionContext || linkedTripForEntry?.status === 'planning' ? 'planning' : 'record');
      var reviewSnapshot = draft.reviewMode ? {
        worth: draft.reviewSnapshot.worth,
        values: draft.reviewSnapshot.values.slice(),
        deviations: draft.reviewSnapshot.deviations.slice(),
        tripCompleted: true,
        complete: true
      } : null;
      var created = await apiCall('POST', '/journals/entries', {
        tripId: draft.tripId || null,
        type: entryType,
        content: draft.content.trim(),
        mood: draft.mood || state.plan.tripIntent.mood || null,
        reviewSnapshot: reviewSnapshot,
        decisionContext: draft.decisionContext ? Object.assign({}, draft.decisionContext, {
          reasonCategory: draft.reasonCategory || null
        }) : null
      });
      var authorizedResult = draft.analysisAuthorized
        ? await apiCall('POST', '/journals/entries/' + created.id + '/authorize', { authorized: true })
        : null;
      var saved = authorizedResult || created;
      state.journal.unshift({
        id: saved.id,
        tripId: saved.tripId,
        type: saved.type || entryType,
        title: draft.content.trim().slice(0, 24) + (draft.content.trim().length > 24 ? '…' : ''),
        content: draft.content.trim(),
        mood: saved.mood,
        decisionContext: saved.decisionContext || null,
        reviewSnapshot: saved.reviewSnapshot || null,
        createdAt: new Date(saved.createdAt || Date.now()).toLocaleDateString('zh-CN'),
        analysisAuthorized: Boolean(saved.analysisAuthorized)
      });
      if (authorizedResult && authorizedResult.proposals) {
        state.persona.pendingProposals = dedupePendingProposals(
          (state.persona.pendingProposals || []).concat(authorizedResult.proposals),
          2
        );
        setStorage('tp_persona', state.persona);
      }
      setStorage('tp_journal', state.journal);
      if (draft.decisionContext?.changeId) {
        var linkedTrip = state.trips.find(function (trip) { return trip.id === draft.tripId; });
        var linkedChange = (linkedTrip?.routeChanges || []).find(function (change) { return change.id === draft.decisionContext.changeId; });
        if (linkedChange) {
          linkedChange.explainedEntryId = saved.id;
          linkedChange.explainedAt = new Date(saved.createdAt || Date.now()).toISOString();
          linkedChange.explanationAuthorized = Boolean(saved.analysisAuthorized);
          persistTrip(linkedTrip);
        }
      }
      state.journalDraft = createJournalDraft();
      state.journalComposerOpen = false;
      renderJournal(document.getElementById('app'));
      loadGrowthTimeline();
    } catch (error) {
      draft.saving = false;
      draft.error = error.userMessage || '这条记录暂时没有保存，请重试。';
      renderJournal(document.getElementById('app'));
    }
  }

  // ============================================================
  // 8. 页面渲染：我的页（#/profile）
  // ============================================================

  async function loadGrowthTimeline() {
    try {
      state.growthTimeline = await apiCall('GET', '/journals/persona/timeline?limit=8');
      return true;
    } catch (_) {
      return false;
    }
  }

  function renderGrowthTimelineSection() {
    var timeline = state.growthTimeline || {};
    var events = timeline.events || [];
    var summary = timeline.summary || {};
    if (!events.length && !timeline.nextStep) return null;

    var labels = {
      plan: '计划时的选择',
      decision: '计划中的取舍',
      reality: '实际发生的行程',
      evidence: '真实体验成为证据',
      confirmed: '你确认的变化',
      reconfirmed: '你主动复核'
    };
    var icons = { plan: 'route', decision: 'route', reality: 'map-pinned', evidence: 'book-open', confirmed: 'check', reconfirmed: 'check' };
    var section = el('section', { className: 'growth-timeline mb-lg', 'aria-labelledby': 'growth-timeline-title' }, [
      el('div', { className: 'section-heading' }, [
        el('div', {}, [
          el('h2', { id: 'growth-timeline-title', className: 'sampling-title', textContent: '旅格是怎么长出来的' }),
          el('p', { className: 'sampling-note', textContent: '从计划、真实体验到你亲自确认的变化；手账原文不会出现在这里。' })
        ]),
        el('span', {
          className: 'sampling-count',
          textContent: Number(summary.confirmedChanges || 0) > 0
            ? summary.confirmedChanges + ' 次亲自确认'
            : events.length + ' 个成长节点'
        })
      ])
    ]);

    if (events.length) {
      section.appendChild(el('ol', { className: 'growth-timeline__list' }, events.map(function (event) {
        var date = event.occurredAt
          ? new Date(event.occurredAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
          : '';
        return el('li', { className: 'growth-timeline__item growth-timeline__item--' + event.type }, [
          el('div', { className: 'growth-timeline__marker' }, [icon(icons[event.type] || 'circle-alert', 'growth-timeline__icon')]),
          el('div', { className: 'growth-timeline__content' }, [
            el('div', { className: 'growth-timeline__meta' }, [
              el('span', { textContent: labels[event.type] || '成长节点' }),
              el('time', { datetime: event.occurredAt || '', textContent: date })
            ]),
            el('strong', { textContent: event.title || '' }),
            el('p', { textContent: event.summary || '' })
          ])
        ]);
      })));
    }

    if (timeline.nextStep) {
      section.appendChild(el('div', { className: 'growth-timeline__next' }, [
        icon('telescope', 'growth-timeline__next-icon'),
        el('div', { className: 'growth-timeline__next-body' }, [
          el('strong', { textContent: '接下来需要什么证据' }),
          el('p', { textContent: timeline.nextStep }),
          el('button', {
            type: 'button',
            className: 'btn btn--secondary growth-timeline__next-action',
            onClick: function () {
              state.journalDraft = createJournalDraft();
              state.journalComposerOpen = true;
              state.selectedTripId = null;
              location.hash = '#/journal';
            }
          }, [icon('square-pen', 'btn__icon'), el('span', { textContent: '记录一次体验' })])
        ])
      ]));
    }
    return section;
  }

  /**
   * 渲染我的页
   * 总纲4.1 路由 /persona：人格档案展示
   * 总纲4.1 路由 /settings/privacy：隐私设置入口
   * 总纲3.3：人格原型展示（主原型+次原型+混合说明）
   */
  function renderProfile(container) {
    var page = el('div', { className: 'page' });
    page.appendChild(el('h1', { className: 'page__title', textContent: '我的旅格' }));
    page.appendChild(el('p', { className: 'page__subtitle', textContent: '分清最近一次的状态，和已经由你确认的长期倾向。' }));

    // --- 人格档案卡片 ---
    var persona = state.persona;
    var acceptedTraitKeys = Object.keys(persona.acceptedTraits || {});
    var historicalEvidenceCount = acceptedTraitKeys.reduce(function (sum, key) {
      return sum + Number(persona.acceptedTraits[key]?.evidenceCount || 0);
    }, 0);
    var activeEvidenceCount = acceptedTraitKeys.reduce(function (sum, key) {
      var trait = persona.acceptedTraits[key] || {};
      return sum + Number(trait.activeEvidenceCount ?? trait.evidenceCount ?? 0);
    }, 0);
    var hasMaturePersona = acceptedTraitKeys.length >= 3 && activeEvidenceCount >= 4;
    var primaryPersona = hasMaturePersona && persona.primaryPersona
      ? persona.primaryPersona
      : (persona.provisionalPersona || persona.primaryPersona);
    var isProvisional = Boolean(primaryPersona) && !hasMaturePersona;
    if (!primaryPersona) {
      page.appendChild(renderEmptyState(
        'compass',
        '还没有足够证据定义你的旅格',
        '先完成一次规划。旅行后的手账、删改和复盘会比一次问卷更准确。',
        '开始一次规划',
        function () { location.hash = '#/plan'; }
      ));
    } else {
      var personaId = primaryPersona.id;
      var personaData = findPersona(personaId);
      var personaCard = el('div', { className: 'card mb-lg' }, [
        el('div', { className: 'persona-card' }, [
          renderPersonaVisual(personaId, 'lg'),
          el('div', { className: 'persona-card__info' }, [
            el('div', { className: 'profile-label', textContent: isProvisional ? '本次取向 · 暂不写入长期人格' : '当前旅格' }),
            el('div', { className: 'persona-card__name', textContent: isProvisional ? personaData.name : (primaryPersona.name || personaData.name) }),
            el('div', { className: 'persona-card__blend', textContent: isProvisional && personaId === 'efficient-hunter'
              ? '你会本能地整理交通、停留和取舍。真正适合你的不是塞满城市，而是减少无意义移动，让有限时间都花在值得的地方。'
              : (primaryPersona.summary || personaData.blend) }),
            el('div', { className: 'flex items-center gap-sm' }, [
              el('span', { className: 'font-meta text-muted', textContent: '当前把握' }),
              el('div', { className: 'confidence-bar', style: 'width: 120px' }, [
                el('div', {
                  className: 'confidence-bar__fill',
                  style: 'width: ' + formatPercent(primaryPersona.confidence || persona.provisionalConfidence || persona.confidence || 0.5)
                })
              ]),
            el('span', { className: 'font-meta', textContent: formatPercent(primaryPersona.confidence || persona.provisionalConfidence || persona.confidence || 0.5) })
            ]),
            isProvisional
              ? el('p', { className: 'profile-caveat', textContent: '这不是永久标签。只有旅行后的真实记录与复盘，才会逐步校准长期人格。' })
              : null
          ])
        ])
      ]);
      page.appendChild(personaCard);

      // --- 人格维度雷达图 ---
      if (App.PersonaRadar) {
        var radarCard = el('div', { className: 'card mb-lg persona-radar-card' }, [
          el('div', { className: 'card__header' }, [
            el('div', { className: 'card__title', textContent: '人格维度雷达' })
          ]),
          el('canvas', {
            className: 'persona-radar',
            width: 320,
            height: 320,
            'aria-label': '16维人格雷达图，直观展示各维度分布'
          })
        ]);
        page.appendChild(radarCard);
        // 延迟绘制确保 DOM 已挂载
        requestAnimationFrame(function () {
          var canvas = radarCard.querySelector('.persona-radar');
          if (canvas && canvas.getContext) {
            App.PersonaRadar.draw(
              canvas,
              persona.acceptedTraits,
              persona.provisionalTraits
            );
          }
        });
      }
    }

    // --- 16维人格维度列表 ---
    var visibleTraits = isProvisional ? (persona.provisionalTraits || {}) : (persona.acceptedTraits || {});
    if (visibleTraits && Object.keys(visibleTraits).length > 0) {
      var traitSection = el('div', { className: 'card mb-lg' }, [
        el('div', { className: 'card__header' }, [
          el('div', { className: 'card__title', textContent: isProvisional ? '本次信号维度' : '稳定人格维度' })
        ]),
        el('div', { className: 'trait-list' })
      ]);
      var traitList = traitSection.querySelector('.trait-list');

      var traitLabels = {
        restoration: '恢复', nature: '自然', culture: '文化', food: '美食',
        pace: '节奏', social: '社交', budget: '预算', aesthetics: '审美',
        comfort: '舒适', novelty: '新鲜', transit: '交通', lowCrowd: '低拥挤',
        authenticity: '在地', weatherFlex: '天气', bookingEase: '预约', workation: '旅居'
      };

      var visibleTraitKeys = Object.keys(visibleTraits).sort(function (a, b) {
        var aTrait = visibleTraits[a];
        var bTrait = visibleTraits[b];
        var aMean = typeof aTrait === 'number' ? aTrait : aTrait?.mean ?? 0.5;
        var bMean = typeof bTrait === 'number' ? bTrait : bTrait?.mean ?? 0.5;
        return Math.abs(bMean - 0.5) - Math.abs(aMean - 0.5);
      });
      if (isProvisional) visibleTraitKeys = visibleTraitKeys.slice(0, 6);

      visibleTraitKeys.forEach(function (key) {
        var trait = visibleTraits[key];
        var mean = typeof trait === 'number' ? trait : trait && trait.mean != null ? trait.mean : 0.5;
        var scale = TRAIT_SCALE_LABELS[key] || ['偏低', '偏高'];
        var directionLabel = mean >= 0.6 ? scale[1] : mean <= 0.4 ? scale[0] : '两端较平衡';
        var traitChildren = [
          el('span', { className: 'trait-item__label', textContent: traitLabels[key] || key }),
          el('div', { className: 'trait-item__bar' }, [
            el('div', { className: 'trait-item__fill', style: 'width: ' + (mean * 100) + '%' })
          ]),
          el('span', {
            className: 'trait-item__value',
            textContent: isProvisional ? directionLabel : Math.round(mean * 100) + '%'
          })
        ];
        traitList.appendChild(el('div', {
          className: 'trait-item' + (isProvisional ? ' trait-item--directional' : ''),
          'aria-label': (traitLabels[key] || key) + '：' + (isProvisional ? directionLabel : Math.round(mean * 100) + '%')
        }, traitChildren));
      });

      page.appendChild(traitSection);
    }

    if (acceptedTraitKeys.length > 0) {
      page.appendChild(el('section', { className: 'accepted-evidence mb-lg' }, [
        el('div', {}, [
          el('div', { className: 'accepted-evidence__title', textContent: '已确认的长期倾向 · ' + acceptedTraitKeys.length + ' 项' }),
          el('div', { className: 'accepted-evidence__desc', textContent: hasMaturePersona
            ? '这些判断都经过你亲自确认；证据强弱仍会影响把握，也可以随时重新定位。'
            : activeEvidenceCount === 0 && historicalEvidenceCount > 0
              ? '长期旅格还在形成。目前有 ' + acceptedTraitKeys.length + ' 个维度由你确认保留，但来源证据已经撤回，不会再算作有效证据；上面的类型仍只代表最近一次规划。'
              : '长期旅格还在形成。目前只有 ' + acceptedTraitKeys.length + ' 个维度、' + activeEvidenceCount + ' 条有效证据，因此上面的类型只代表最近一次规划。' })
        ]),
        el('div', { className: 'accepted-trait-list' }, acceptedTraitKeys.map(function (key) {
          var trait = persona.acceptedTraits[key] || {};
          var mean = typeof trait === 'number' ? trait : Number(trait.mean ?? 0.5);
          var confidence = typeof trait === 'number' ? 0.5 : Number(trait.confidence ?? 0.5);
          var evidenceCount = typeof trait === 'number' ? 0 : Number(trait.evidenceCount || 0);
          var currentEvidenceCount = typeof trait === 'number' ? 0 : Number(trait.activeEvidenceCount ?? evidenceCount);
          var evidenceLabel = trait.evidenceStatus === 'confirmed-source-withdrawn'
            ? '来源证据已撤回'
            : currentEvidenceCount + ' 条有效证据';
          return el('button', {
            type: 'button',
            className: 'accepted-trait-row accepted-evidence__review',
            'aria-label': '复核' + (TRAIT_LABELS[key] || key),
            onClick: function () { startTraitReassessment(key, persona.acceptedTraits[key]); }
          }, [
            el('div', { className: 'accepted-trait-row__identity' }, [
              el('strong', { textContent: TRAIT_LABELS[key] || key }),
              el('span', { textContent: '当前位置 ' + Math.round(mean * 100) + '%' })
            ]),
            el('div', { className: 'accepted-trait-row__audit' }, [
              el('span', { textContent: evidenceLabel }),
              el('span', { textContent: '把握 ' + Math.round(confidence * 100) + '%' }),
              el('span', { className: 'accepted-trait-row__action', textContent: '复核' }),
              icon('chevron-right', 'accepted-trait-row__icon')
            ])
          ]);
        }))
      ]));
    }

    if (state.personaReassessment?.traitKey && persona.acceptedTraits?.[state.personaReassessment.traitKey]) {
      page.appendChild(renderTraitReassessmentPanel(
        state.personaReassessment.traitKey,
        persona.acceptedTraits[state.personaReassessment.traitKey]
      ));
    }

    var growthTimelineSection = renderGrowthTimelineSection();
    if (growthTimelineSection) page.appendChild(growthTimelineSection);

    var pendingProposals = persona.pendingProposals || [];
    if (pendingProposals.length > 0) {
      var hasReassessmentProposal = pendingProposals.some(function (proposal) { return proposal.sourceType === 'userReassessment'; });
      var proposalSection = el('section', { className: 'proposal-section mb-lg', 'aria-labelledby': 'proposal-title' }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [
            el('h2', { id: 'proposal-title', className: 'sampling-title', textContent: hasReassessmentProposal ? '等待你确认的旅格复核' : '这次经历可能改变了什么' }),
            el('p', { className: 'sampling-note', textContent: hasReassessmentProposal ? '主动复核与旅行证据分开标记；接受前，长期人格不会改变。' : '这里只显示当前最强的两条线索。接受前，长期人格不会改变。' })
          ]),
          el('span', { className: 'sampling-count', textContent: pendingProposals.length + ' 项待确认' })
        ])
      ]);
      var proposalLabels = {
        restoration: '恢复需求', nature: '自然偏好', culture: '文化兴趣', food: '美食兴趣',
        pace: '旅行节奏', social: '社交需求', budget: '预算取向', aesthetics: '审美取向',
        comfort: '舒适需求', novelty: '新鲜感', transit: '交通效率', lowCrowd: '低拥挤偏好',
        authenticity: '在地真实感', weatherFlex: '天气弹性', bookingEase: '预约接受度', workation: '旅居倾向'
      };
      pendingProposals.forEach(function (proposal) {
        var isReassessment = proposal.sourceType === 'userReassessment';
        var direction = proposal.delta >= 0 ? '提高' : '降低';
        var amount = Math.abs(proposal.delta || 0);
        var evidenceCount = proposal.evidenceCount || (proposal.evidenceIds ? proposal.evidenceIds.length : 0) || 1;
        var supportCount = proposal.supportingEvidenceCount != null ? proposal.supportingEvidenceCount : evidenceCount;
        var counterCount = proposal.counterEvidenceCount || 0;
        var interval = proposal.confidenceInterval || {
          low: Math.max(0.05, (proposal.proposedValue || 0.5) - 0.1),
          high: Math.min(0.95, (proposal.proposedValue || 0.5) + 0.1)
        };
        proposalSection.appendChild(el('article', { className: 'proposal-row' }, [
          el('div', { className: 'proposal-row__main' }, [
            el('div', { className: 'proposal-row__title', textContent: isReassessment
              ? (proposalLabels[proposal.traitKey] || proposal.traitKey) + '重新定位 ' + Math.round(proposal.currentValue * 100) + '% → ' + Math.round(proposal.proposedValue * 100) + '%'
              : (proposalLabels[proposal.traitKey] || proposal.traitKey) + '建议' + direction + ' ' + Math.round(amount * 100) + '%' }),
            el('div', { className: 'proposal-row__reason', textContent: proposal.reason || (evidenceCount + ' 条旅行复盘指向这个变化；单次调整已限制在 8% 以内。') }),
            el('div', { className: 'proposal-row__evidence', textContent: isReassessment
              ? '来源：你主动完成的旅格复核 · 接受前不会写入长期人格'
              : '证据把握 ' + formatPercent(proposal.auditConfidence ?? proposal.confidence ?? 0.5) + ' · 接受前不会写入长期人格' }),
            el('div', { className: 'proposal-row__audit', 'aria-label': '证据平衡与可能范围' }, [
              isReassessment
                ? el('div', {}, [el('span', { textContent: '当前位置' }), el('strong', { textContent: Math.round(proposal.currentValue * 100) + '%' })])
                : el('div', {}, [el('span', { textContent: '支持证据' }), el('strong', { textContent: supportCount + ' 条' })]),
              isReassessment
                ? el('div', {}, [el('span', { textContent: '复核位置' }), el('strong', { textContent: Math.round(proposal.proposedValue * 100) + '%' })])
                : el('div', {}, [el('span', { textContent: '反例证据' }), el('strong', { textContent: counterCount + ' 条' })]),
              el('div', {}, [el('span', { textContent: isReassessment ? '生效方式' : '变化后可能范围' }), el('strong', { textContent: isReassessment ? '由你确认' : Math.round(interval.low * 100) + '%–' + Math.round(interval.high * 100) + '%' })])
            ]),
            proposal.dataNeeded ? el('div', { className: 'proposal-row__data-needed' }, [
              icon('telescope', 'proposal-row__data-icon'),
              el('span', { textContent: proposal.dataNeeded })
            ]) : null
          ]),
          el('div', { className: 'proposal-row__actions' }, [
            el('button', { type: 'button', className: 'btn btn--text', textContent: isReassessment ? '保持原判断' : '暂不更新', 'aria-label': '暂不更新' + (proposalLabels[proposal.traitKey] || proposal.traitKey), onClick: function () { rejectPersonaProposal(proposal); } }),
            el('button', { type: 'button', className: 'btn btn--secondary', textContent: isReassessment ? '接受新位置' : '接受变化', 'aria-label': '接受' + (proposalLabels[proposal.traitKey] || proposal.traitKey) + '变化', onClick: function () { acceptPersonaProposal(proposal); } })
          ])
        ]));
      });
      page.appendChild(proposalSection);
    }

    // --- 隐私设置入口 ---
    var privacyCard = el('button', { type: 'button', className: 'card card--clickable privacy-card-button' }, [
      el('div', { className: 'card__header' }, [
        el('div', {}, [
          el('div', { className: 'card__title', textContent: '隐私与数据' }),
          el('div', { className: 'card__body', textContent: '管理个性化、分析授权和数据权利' })
        ]),
        icon('chevron-right', 'privacy-card__icon')
      ])
    ]);
    privacyCard.addEventListener('click', showPrivacySettings);
    page.appendChild(privacyCard);

    container.innerHTML = '';
    container.appendChild(page);
  }

  function startTraitReassessment(traitKey, trait) {
    var currentValue = Number(trait?.mean ?? 0.5);
    state.personaReassessment = {
      traitKey: traitKey,
      response: '',
      targetValue: currentValue >= 0.5 ? Math.max(0.1, currentValue - 0.15) : Math.min(0.9, currentValue + 0.15),
      saving: false,
      error: null
    };
    renderProfile(document.getElementById('app'));
    requestAnimationFrame(function () {
      document.querySelector('.trait-reassessment')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  function renderTraitReassessmentPanel(traitKey, trait) {
    var draft = state.personaReassessment;
    var currentValue = Number(trait?.mean ?? 0.5);
    var labels = TRAIT_SCALE_LABELS[traitKey] || ['更低', '更高'];
    var nearNeutral = Math.abs(currentValue - 0.5) < 0.01;
    var panel = el('section', { className: 'trait-reassessment', 'aria-labelledby': 'trait-reassessment-title' }, [
      el('div', { className: 'trait-reassessment__heading' }, [
        el('div', {}, [
          el('h3', { id: 'trait-reassessment-title', textContent: (TRAIT_LABELS[traitKey] || traitKey) + '现在还像你吗？' }),
          el('p', { textContent: '旅行不一定让人“成长”，但你可以随时纠正系统对你的理解。' })
        ]),
        el('button', {
          type: 'button', className: 'btn btn--text', textContent: '收起',
          onClick: function () { state.personaReassessment = null; renderProfile(document.getElementById('app')); }
        })
      ]),
      el('div', { className: 'trait-reassessment__options', role: 'radiogroup', 'aria-label': '选择复核结果' }, [
        renderReassessmentChoice('still_true', '仍然准确', '只确认，不改变位置'),
        renderReassessmentChoice('trip_specific', nearNeutral ? '已经接近中性' : '只代表那次旅行', '建议回到中性位置', nearNeutral),
        renderReassessmentChoice('changed', '我已经变化', '重新定位这一维度')
      ])
    ]);

    function renderReassessmentChoice(value, label, description, disabled) {
      return el('button', {
        type: 'button',
        className: 'trait-reassessment__choice' + (draft.response === value ? ' trait-reassessment__choice--selected' : ''),
        role: 'radio',
        'aria-checked': draft.response === value ? 'true' : 'false',
        disabled: disabled ? 'disabled' : null,
        onClick: function () {
          draft.response = value;
          draft.error = null;
          renderProfile(document.getElementById('app'));
        }
      }, [el('strong', { textContent: label }), el('span', { textContent: description })]);
    }

    if (draft.response === 'trip_specific') {
      panel.appendChild(el('div', { className: 'trait-reassessment__preview' }, [
        el('span', { textContent: '当前 ' + Math.round(currentValue * 100) + '%' }),
        icon('arrow-right', 'trait-reassessment__arrow'),
        el('strong', { textContent: '中性 50%' })
      ]));
    }

    if (draft.response === 'changed') {
      panel.appendChild(el('div', { className: 'trait-reassessment__scale' }, [
        el('div', { className: 'trait-reassessment__scale-labels' }, [
          el('span', { textContent: labels[0] }),
          el('output', { id: 'trait-reassessment-value-' + traitKey, textContent: Math.round(draft.targetValue * 100) + '%' }),
          el('span', { textContent: labels[1] })
        ]),
        el('input', {
          type: 'range', min: '0.1', max: '0.9', step: '0.05', value: String(draft.targetValue),
          'aria-label': (TRAIT_LABELS[traitKey] || traitKey) + '新的位置',
          onInput: function () {
            draft.targetValue = Number(this.value);
            var output = document.getElementById('trait-reassessment-value-' + traitKey);
            if (output) output.textContent = Math.round(draft.targetValue * 100) + '%';
          }
        })
      ]));
    }

    if (draft.error) panel.appendChild(el('div', { className: 'inline-error', role: 'alert', textContent: draft.error }));
    panel.appendChild(el('div', { className: 'trait-reassessment__actions' }, [
      el('span', { textContent: draft.response === 'still_true'
        ? '这次确认会提高把握，但不会改变维度位置。'
        : '提交后先成为待确认变化，不会立刻改写长期人格。' }),
      el('button', {
        type: 'button', className: 'btn btn--primary',
        disabled: !draft.response || draft.saving ? 'disabled' : null,
        textContent: draft.saving ? '保存中' : '提交复核',
        onClick: function () { submitTraitReassessment(traitKey); }
      })
    ]));
    return panel;
  }

  async function submitTraitReassessment(traitKey) {
    var draft = state.personaReassessment;
    if (!draft || draft.traitKey !== traitKey || !draft.response || draft.saving) return;
    draft.saving = true;
    draft.error = null;
    renderProfile(document.getElementById('app'));
    try {
      var result = await apiCall('POST', '/journals/persona/traits/' + traitKey + '/reassess', {
        response: draft.response,
        targetValue: draft.response === 'changed' ? Number(draft.targetValue) : undefined
      });
      if (result.profile?.traits?.[traitKey]) {
        state.persona.acceptedTraits[traitKey] = result.profile.traits[traitKey];
        state.persona.traits = state.persona.acceptedTraits;
      }
      if (result.proposal) {
        state.persona.pendingProposals = dedupePendingProposals(
          (state.persona.pendingProposals || []).concat([result.proposal]),
          2
        );
      }
      state.personaReassessment = null;
      setStorage('tp_persona', state.persona);
      await loadGrowthTimeline();
      renderProfile(document.getElementById('app'));
      notify(result.proposal
        ? '复核结果已成为待确认变化，接受前不会改写旅格。'
        : '已记录这次确认，维度位置没有改变。',
      { type: 'success' });
    } catch (error) {
      draft.saving = false;
      draft.error = error.userMessage || '这次复核暂时没有保存，请重试。';
      renderProfile(document.getElementById('app'));
    }
  }

  async function acceptPersonaProposal(proposal) {
    try {
      var result = await apiCall('POST', '/journals/persona/proposals/' + proposal.id + '/accept', {});
      if (result.profile && result.profile.traits && result.traitKey) {
        state.persona.acceptedTraits = state.persona.acceptedTraits || {};
        state.persona.acceptedTraits[result.traitKey] = result.profile.traits[result.traitKey];
        state.persona.traits = state.persona.acceptedTraits;
        state.persona.profileId = state.persona.profileId || 'local-profile';
      }
      state.persona.pendingProposals = (state.persona.pendingProposals || []).filter(function (item) { return item.id !== proposal.id; });
      if (proposal.sourceType !== 'userReassessment') {
        state.persona.growthEvidenceCount = (state.persona.growthEvidenceCount || 0) + 1;
      }
      setStorage('tp_persona', state.persona);
      await loadGrowthTimeline();
      renderProfile(document.getElementById('app'));
      notify(proposal.sourceType === 'userReassessment'
        ? '新的位置已由你确认，之后会参与推荐。'
        : '这项变化已由你确认，之后会参与新的推荐。', { type: 'success' });
    } catch (error) {
      notify(error.userMessage || '这项变化暂时没有保存，请稍后再试。', { type: 'error' });
    }
  }

  async function rejectPersonaProposal(proposal) {
    try {
      await apiCall('POST', '/journals/persona/proposals/' + proposal.id + '/reject', { reason: '用户选择暂不更新' });
    } catch (error) {
      // 即使远端暂时不可用，也允许用户在本地隐藏建议。
    }
    state.persona.pendingProposals = (state.persona.pendingProposals || []).filter(function (item) { return item.id !== proposal.id; });
    setStorage('tp_persona', state.persona);
    renderProfile(document.getElementById('app'));
  }

  /**
   * 显示隐私设置（总纲12.5：同意、导出、删除、非个性化模式）
   */
  function showPrivacySettings() {
    var draft = Object.assign({}, state.privacy);
    var status = el('div', { className: 'privacy-dialog__status', role: 'status' });
    var deleteConfirm = el('div', { className: 'privacy-delete-confirm', hidden: true }, [
      el('strong', { textContent: '永久删除全部旅格数据？' }),
      el('p', { textContent: '手账原文、证据、人格提案和服务器中的行程都会删除。这个操作不能撤销。' }),
      el('div', { className: 'flex gap-sm' }, [
        el('button', { type: 'button', className: 'btn btn--text', textContent: '取消', onClick: function () { deleteConfirm.hidden = true; } }),
        el('button', { type: 'button', className: 'btn btn--danger', textContent: '确认永久删除', onClick: deleteAllUserData })
      ])
    ]);

    var dialog = el('dialog', { className: 'privacy-dialog', 'aria-labelledby': 'privacy-dialog-title' }, [
      el('div', { className: 'privacy-dialog__header' }, [
        el('div', {}, [
          el('div', { className: 'page-kicker', textContent: 'DATA CONTROL' }),
          el('h2', { id: 'privacy-dialog-title', textContent: '隐私与数据' }),
          el('p', { textContent: '每项授权都可以单独撤回；手账原文不会用于模型训练。' })
        ]),
        el('button', { type: 'button', className: 'icon-button', title: '关闭', 'aria-label': '关闭隐私设置', onClick: function () { dialog.close(); } }, [icon('x', 'icon-button__icon')])
      ]),
      el('div', { className: 'privacy-settings-list' }, [
        renderPrivacyToggle('个性化推荐', '使用你确认过的人格变化调整下一次方案。', 'personalizationEnabled'),
        renderPrivacyToggle('允许分析手账', '只有你主动授权的记录才能变成人格证据。', 'analysisConsent'),
        renderPrivacyToggle('照片线索分析', '关闭后，照片只作为手账附件保存。', 'photoAnalysisEnabled'),
        renderPrivacyToggle('长期记忆', '关闭后，系统只考虑这一次旅行的条件。', 'longTermMemoryEnabled'),
        el('label', { className: 'privacy-setting-row' }, [
          el('span', {}, [el('strong', { textContent: '位置精度' }), el('small', { textContent: '推荐只需要城市级位置；精确位置不会出现在分享内容中。' })]),
          el('select', { onChange: function () { draft.locationPrecision = this.value; } }, [
            el('option', { value: 'off', selected: draft.locationPrecision === 'off' ? true : null, textContent: '关闭' }),
            el('option', { value: 'city', selected: draft.locationPrecision === 'city' ? true : null, textContent: '城市级' }),
            el('option', { value: 'exact', selected: draft.locationPrecision === 'exact' ? true : null, textContent: '精确位置' })
          ])
        ])
      ]),
      status,
      el('div', { className: 'privacy-dialog__actions' }, [
        el('button', { type: 'button', className: 'btn btn--text', textContent: '导出我的数据', onClick: exportMyData }),
        el('button', { type: 'button', className: 'btn btn--text btn--danger-text', textContent: '删除全部数据', onClick: function () { deleteConfirm.hidden = false; } }),
        el('span', { className: 'privacy-dialog__spacer' }),
        el('button', { type: 'button', className: 'btn btn--secondary', textContent: '取消', onClick: function () { dialog.close(); } }),
        el('button', { type: 'button', className: 'btn btn--primary', textContent: '保存设置', onClick: savePrivacySettings })
      ]),
      deleteConfirm
    ]);

    function renderPrivacyToggle(title, description, key) {
      return el('label', { className: 'privacy-setting-row' }, [
        el('span', {}, [el('strong', { textContent: title }), el('small', { textContent: description })]),
        el('input', { type: 'checkbox', className: 'privacy-switch', checked: draft[key] ? true : null, onChange: function () { draft[key] = this.checked; } })
      ]);
    }

    async function savePrivacySettings() {
      status.textContent = '正在保存…';
      try {
        state.privacy = await apiCall('PUT', '/journals/privacy/settings', draft);
        setStorage('tp_privacy', state.privacy);
        status.textContent = '设置已保存';
        setTimeout(function () { dialog.close(); renderProfile(document.getElementById('app')); }, 350);
      } catch (error) {
        status.textContent = error.userMessage || '设置暂时没有保存，请重试。';
      }
    }

    async function exportMyData() {
      status.textContent = '正在整理你的数据…';
      try {
        var data = await apiCall('GET', '/journals/data/export');
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = 'travel-persona-data.json';
        link.click();
        URL.revokeObjectURL(url);
        status.textContent = '数据已导出';
      } catch (error) {
        status.textContent = error.userMessage || '数据暂时无法导出，请稍后再试。';
      }
    }

    async function deleteAllUserData() {
      status.textContent = '正在删除…';
      try {
        await apiCall('DELETE', '/journals/data/delete');
        state.trips = [];
        state.journal = [];
        state.persona = { profileId: null, traits: {}, primaryPersona: null, provisionalPersona: null, provisionalTraits: {}, acceptedTraits: {}, pendingProposals: [] };
        state.growthTimeline = { events: [], summary: { plannedTrips: 0, authorizedEvidence: 0, confirmedChanges: 0, activeDimensions: 0 }, nextStep: '' };
        setStorage('tp_trips', []);
        setStorage('tp_journal', []);
        setStorage('tp_persona', state.persona);
        dialog.close();
        renderProfile(document.getElementById('app'));
      } catch (error) {
        status.textContent = error.userMessage || '数据暂时无法删除，请稍后再试。';
      }
    }

    document.body.appendChild(dialog);
    dialog.addEventListener('close', function () { dialog.remove(); }, { once: true });
    dialog.showModal();
  }

  // ============================================================
  // 9. 规划页渲染（委托给 plan.js，如果已加载）
  // ============================================================

  /**
   * 渲染规划页
   * 如果 pages/plan.js 已加载并注册了 App.PlanPage.render，则委托给它。
   * 否则使用内置的简单版本。
   */
  function renderPlan(container) {
    if (global.App && global.App.PlanPage && typeof global.App.PlanPage.render === 'function') {
      global.App.PlanPage.render(container);
    } else {
      // plan.js 未加载时的降级渲染
      container.innerHTML = '';
      container.appendChild(renderLoadingState('正在加载规划工具...'));
    }
  }

  // ============================================================
  // 10. Hash 路由器
  // ============================================================

  /**
   * 获取当前 hash 路由
   * 默认路由为 #/plan
   */
  function getCurrentHash() {
    var hash = window.location.hash;
    if (!hash || !ROUTES.hasOwnProperty(hash)) {
      return '#/plan';
    }
    return hash;
  }

  /**
   * 路由分发：根据 hash 调用对应的渲染函数
   */
  function handleRoute() {
    var hash = getCurrentHash();
    state.currentRoute = hash;
    var routeName = ROUTES[hash];

    var container = document.getElementById('app');
    if (!container) return;

    // 更新底部导航高亮
    updateBottomNav(routeName);

    // 调用对应渲染函数
    switch (routeName) {
      case 'plan':
        renderPlan(container);
        break;
      case 'trips':
        renderTrips(container);
        break;
      case 'journal':
        renderJournal(container);
        break;
      case 'profile':
        renderProfile(container);
        break;
      default:
        renderPlan(container);
    }

    // 滚动到顶部
    window.scrollTo(0, 0);
  }

  /**
   * 更新底部导航高亮状态
   */
  function updateBottomNav(routeName) {
    var navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(function (item) {
      var itemRoute = item.getAttribute('data-route');
      if (itemRoute === routeName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  // ============================================================
  // 11. 初始化
  // ============================================================

  /**
   * 应用初始化
   * 1. 从 localStorage 恢复状态
   * 2. 注册路由事件
   * 3. 触发首次路由
   */
  function init() {
    window.addEventListener('error', function () {
      sendTelemetry({ event: 'client_error', code: 'CLIENT_RUNTIME' });
    });
    window.addEventListener('unhandledrejection', function () {
      sendTelemetry({ event: 'client_error', code: 'UNHANDLED_REJECTION' });
    });
    // 从本地存储恢复状态
    var localTripStateCorrected = false;
    state.trips = getStorage('tp_trips', []).map(function (trip) {
      trip.routeChanges = Array.isArray(trip.routeChanges) ? trip.routeChanges : [];
      trip.actualEvents = Array.isArray(trip.actualEvents) ? trip.actualEvents : [];
      if (trip.status === 'completed' && !getTripCompletionState(trip).allowed) {
        localTripStateCorrected = true;
        return Object.assign({}, trip, {
          status: 'planning',
          statusCorrectedAt: new Date().toISOString(),
          statusCorrectionReason: 'future-completion'
        });
      }
      return trip;
    });
    if (localTripStateCorrected) setStorage('tp_trips', state.trips);
    state.journal = getStorage('tp_journal', []);
    state.persona = getStorage('tp_persona', state.persona);
    state.persona.acceptedTraits = state.persona.acceptedTraits || {};
    state.persona.provisionalTraits = state.persona.provisionalTraits || {};
    if (state.persona.primaryPersona && !state.persona.provisionalPersona && Object.keys(state.persona.acceptedTraits).length < 3) {
      state.persona.provisionalPersona = state.persona.primaryPersona;
      state.persona.provisionalTraits = state.persona.traits || {};
      state.persona.primaryPersona = null;
      state.persona.traits = state.persona.acceptedTraits;
    }
    state.privacy = getStorage('tp_privacy', state.privacy);

    // 注册 hash 变化事件
    window.addEventListener('hashchange', handleRoute);

    // 如果没有 hash，设置默认路由
    if (!window.location.hash) {
      window.location.hash = '#/plan';
    } else {
      // 触发首次路由
      handleRoute();
    }

    hydrateRemoteState();
  }

  async function hydrateRemoteState() {
    try {
      var results = await Promise.all([
        apiCall('GET', '/journals/entries'),
        apiCall('GET', '/journals/persona/proposals'),
        apiCall('GET', '/journals/persona/profile'),
        apiCall('GET', '/journals/privacy/settings'),
        apiCall('GET', '/journals/travel-trace'),
        apiCall('GET', '/journals/persona/timeline?limit=8')
      ]);
      var journalResult = results[0] || {};
      var proposalResult = results[1] || {};
      var profile = results[2] || {};
      var privacy = results[3] || {};
      var traceResult = results[4] || {};
      var timelineResult = results[5] || {};

      var remoteTrips = (traceResult.trace || []).map(function (trip) {
        return {
          id: trip.tripId,
          title: trip.title || ((trip.cities || []).slice(0, 2).join(' → ') || '已保存行程'),
          cities: trip.cities || [],
          startDate: trip.startDate || '',
          endDate: trip.endDate || '',
          status: trip.status || 'planning',
          routeChanges: Array.isArray(trip.routeChanges) ? trip.routeChanges : [],
          actualEvents: Array.isArray(trip.actualEvents) ? trip.actualEvents : [],
          selectedPathType: trip.planSnapshot?.selectedPlan?.id ? 'multiCity:' + trip.planSnapshot.selectedPlan.id : 'balanced',
          planSnapshot: trip.planSnapshot || {},
          updatedAt: trip.updatedAt || trip.createdAt || '',
          syncState: 'synced'
        };
      });
      state.trips = TripSync.reconcileTrips(remoteTrips, state.trips || []);

      state.journal = (journalResult.entries || []).map(function (entry) {
        var content = entry.content || '';
        return {
          id: entry.id,
          tripId: entry.tripId,
          type: entry.type,
          title: content.slice(0, 24) + (content.length > 24 ? '…' : ''),
          content: content,
          mood: entry.mood,
          decisionContext: entry.decisionContext || null,
          reviewSnapshot: entry.reviewSnapshot || null,
          createdAt: new Date(entry.createdAt || Date.now()).toLocaleDateString('zh-CN'),
          analysisAuthorized: Boolean(entry.analysisAuthorized)
        };
      });

      var allPendingProposals = (proposalResult.proposals || []).filter(function (item) {
        return item.status === 'pending';
      });
      state.persona.pendingProposals = dedupePendingProposals(allPendingProposals, 2);
      state.persona.suppressedProposalCount = Math.max(0, allPendingProposals.length - state.persona.pendingProposals.length);
      state.persona.profileId = profile.profileId || state.persona.profileId;
      state.persona.createdAt = profile.createdAt || state.persona.createdAt;
      state.persona.updatedAt = profile.updatedAt || state.persona.updatedAt;
      state.persona.acceptedTraits = {};
      Object.keys(profile.traits || {}).forEach(function (key) {
        var trait = profile.traits[key];
        if (trait && trait.evidenceCount > 0) state.persona.acceptedTraits[key] = trait;
      });
      state.persona.traits = state.persona.acceptedTraits;
      state.persona.growthEvidenceCount = Object.keys(state.persona.acceptedTraits).reduce(function (sum, key) {
        var trait = state.persona.acceptedTraits[key] || {};
        return sum + Number(trait.activeEvidenceCount ?? trait.evidenceCount ?? 0);
      }, 0);
      if (Object.keys(state.persona.acceptedTraits).length < 3 && state.persona.primaryPersona) {
        state.persona.provisionalPersona = state.persona.provisionalPersona || state.persona.primaryPersona;
        state.persona.primaryPersona = null;
      }
      state.privacy = Object.assign({}, state.privacy, privacy);
      state.growthTimeline = Object.assign({}, state.growthTimeline, timelineResult);

      setStorage('tp_journal', state.journal);
      setStorage('tp_persona', state.persona);
      setStorage('tp_privacy', state.privacy);
      setStorage('tp_trips', state.trips);
      handleRoute();
    } catch (error) {
      // Local state remains usable when the server is temporarily unavailable.
    }
  }

  // ============================================================
  // 12. 导出 API
  // ============================================================

  global.App = {
    // 常量
    MOODS: MOODS,
    INTERESTS: INTERESTS,
    AVOIDS: AVOIDS,
    COMPANIONS: COMPANIONS,
    PERSONAS: PERSONAS,
    PATH_TYPES: PATH_TYPES,
    ROUTES: ROUTES,
    API_BASE: API_BASE,

    // 状态
    state: state,

    // API
    apiCall: apiCall,
    persistTrip: persistTrip,
    sendTelemetry: sendTelemetry,
    durationBucket: durationBucket,
    notify: notify,

    // 工具函数
    escapeHtml: escapeHtml,
    el: el,
    icon: icon,
    formatCurrency: formatCurrency,
    formatPercent: formatPercent,
    findPersona: findPersona,
    findMood: findMood,
    getStorage: getStorage,
    setStorage: setStorage,

    // 状态组件
    renderEmptyState: renderEmptyState,
    renderLoadingState: renderLoadingState,
    renderErrorState: renderErrorState,
    renderPersonaVisual: renderPersonaVisual,

    // 页面渲染
    renderPlan: renderPlan,
    renderTrips: renderTrips,
    renderJournal: renderJournal,
    renderProfile: renderProfile,
    loadGrowthTimeline: loadGrowthTimeline,

    // 路由
    handleRoute: handleRoute,
    getCurrentHash: getCurrentHash,

    // 初始化
    init: init
  };

  document.addEventListener('DOMContentLoaded', function () {
    if (global.App && typeof global.App.init === 'function') global.App.init();
  });

})(typeof window !== 'undefined' ? window : this);
