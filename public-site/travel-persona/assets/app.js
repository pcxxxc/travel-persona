(function () {
  "use strict";

  var DATA = window.TRAVEL_PERSONA_DATA;
  var API = window.TravelApi;

  if (!DATA) {
    return;
  }

  var state = {
    mood: null,
    profile: null,
    plan: null,
    selectedCityId: null,
    journalEntries: [],
    growthDemoStage: 0
  };

  var JOURNAL_STORAGE_KEY = "travelPersonaJournalV1";

  var TRAIT_WEIGHTS = {
    restoration: 0.13,
    nature: 0.11,
    culture: 0.12,
    food: 0.09,
    pace: 0.12,
    social: 0.09,
    budget: 0.12,
    aesthetics: 0.09,
    comfort: 0.07,
    novelty: 0.06,
    transit: 0.08,
    lowCrowd: 0.08,
    authenticity: 0.07,
    weatherFlex: 0.05,
    bookingEase: 0.05,
    workation: 0.05
  };

  var MOOD_LABELS = {
    restore: "放空恢复",
    escape: "逃离压力",
    inspire: "灵感采集",
    social: "热闹社交",
    efficient: "效率打卡",
    live: "试住一城"
  };

  var INTEREST_LABELS = {
    nature: "自然山海",
    oldtown: "老城街巷",
    art: "艺术展览",
    coffee: "咖啡书店",
    food: "夜市美食",
    photo: "建筑摄影",
    museum: "博物馆",
    hidden: "小众探索"
  };

  var AVOID_LABELS = {
    crowd: "人多排队",
    commercial: "过度商业化",
    climb: "爬山消耗",
    early: "早起赶路",
    longTransit: "长交通换乘",
    expensive: "溢价消费"
  };

  var AVOID_TO_RISK = {
    crowd: "crowd",
    commercial: "commercial",
    climb: "climb",
    early: "early",
    longTransit: "longTransit",
    expensive: "expensive"
  };

  var DEMO_PROFILES = [
    {
      id: "aestheticSolo",
      name: "审美独行",
      note: "累，但还想看展、喝咖啡、拍街区，不想排队。",
      profile: {
        mood: "inspire",
        interests: ["art", "coffee", "oldtown", "photo", "hidden"],
        avoid: ["crowd", "commercial", "early"],
        days: 4,
        budget: 560,
        origin: "上海",
        companion: "solo",
        freeText: "最近很累，但希望这趟旅行不是纯躺平。想看一点展、喝好咖啡、拍到有质感的街区，也不想一直排队。"
      }
    },
    {
      id: "restoreNature",
      name: "自然修复",
      note: "压力很大，要慢下来，预算中等，避开商业化。",
      profile: {
        mood: "escape",
        interests: ["nature", "coffee"],
        avoid: ["crowd", "commercial", "longTransit"],
        days: 5,
        budget: 420,
        origin: "广州",
        companion: "couple",
        freeText: "最近工作压得很满，想去一个能散步、看自然、晚上能安静睡觉的地方。"
      }
    },
    {
      id: "friendsFood",
      name: "朋友夜游",
      note: "朋友局，吃喝和夜生活优先，接受人多但不想太贵。",
      profile: {
        mood: "social",
        interests: ["food", "oldtown"],
        avoid: ["expensive"],
        days: 3,
        budget: 360,
        origin: "武汉",
        companion: "friends",
        freeText: "和朋友出去，想吃得爽、有夜生活，行程可以紧凑一点，但别全是排队。"
      }
    },
    {
      id: "familySafe",
      name: "家庭稳妥",
      note: "带家人，交通、天气备选、预约确定性优先。",
      profile: {
        mood: "efficient",
        interests: ["museum", "nature", "food"],
        avoid: ["climb", "longTransit", "early", "crowd"],
        days: 4,
        budget: 680,
        origin: "北京",
        companion: "family",
        freeText: "带家人出行，希望交通方便，室内备选多，不要爬太多山，也不要赶早。"
      }
    },
    {
      id: "maomingBeijingLoop",
      name: "茂名北上多城",
      note: "茂名去北京，返程未定，两三周尽量多玩城市且最高性价比。",
      profile: {
        mood: "efficient",
        interests: ["oldtown", "food", "museum", "hidden"],
        avoid: ["expensive", "longTransit", "early"],
        days: 18,
        budget: 320,
        origin: "茂名",
        companion: "solo",
        destination: "北京",
        routeGoal: "multiCityValue",
        freeText: "从茂名去北京，返程不知道怎么走，想用两三周最高效多玩几个城市，预算要最高性价比。"
      }
    }
  ];

  var ROUTE_CORRIDORS = [
    {
      id: "valueNorthbound",
      name: "中轴高性价比北上",
      role: "去程主线",
      summary: "沿高铁/普铁主干道北上，城市间距均匀，住宿成本比一线城市友好，适合把路程拆成可玩的段落。",
      estimatedDays: 12,
      valueScore: 94,
      efficiencyScore: 91,
      nodes: [
        { city: "茂名", stay: 0.5, role: "出发校准", reason: "不把第一天排满，留给到广州的交通缓冲。" },
        { city: "广州", stay: 1, role: "枢纽补给", reason: "从粤西进全国铁路网，顺手吃早茶和老城一小段。" },
        { city: "长沙", stay: 2, role: "低预算高密度", reason: "餐饮和夜游性价比高，适合作为第一段兴奋点。" },
        { city: "武汉", stay: 2, role: "江城中转", reason: "交通强、博物馆和江滩可雨天切换。" },
        { city: "郑州/洛阳", stay: 2, role: "历史节点", reason: "用洛阳补文化厚度，比只停郑州更有记忆点。" },
        { city: "北京", stay: 4, role: "主目的地", reason: "把预约型景点集中处理，住宿尽量避开核心溢价。" }
      ],
      redFlags: ["长沙五一商圈别住正核心", "北京热门场馆必须提前预约", "洛阳旺季汉服/景区溢价要筛选"]
    },
    {
      id: "eastReturn",
      name: "东线不走回头路返程",
      role: "返程推荐",
      summary: "从北京向东南回撤，用济南、南京、苏杭、闽南把返程变成第二条旅行线，减少重复路线的浪费感。",
      estimatedDays: 9,
      valueScore: 88,
      efficiencyScore: 84,
      nodes: [
        { city: "北京", stay: 0, role: "返程起点", reason: "离开前保留半天机动，处理预约或补票变化。" },
        { city: "济南", stay: 1, role: "短停缓冲", reason: "离北京近，适合把返程第一段拆短。" },
        { city: "南京", stay: 2, role: "历史城市", reason: "博物馆、老城和夜游密度高，不必绕路太多。" },
        { city: "苏州/杭州", stay: 2, role: "江南审美", reason: "二选一或连住，按预算避开景区旁住宿。" },
        { city: "泉州/厦门", stay: 2, role: "闽南收尾", reason: "比直接回广东更有变化，泉州更省，厦门更轻松。" },
        { city: "广州", stay: 1, role: "回程枢纽", reason: "回茂名前做补给和票务缓冲。" },
        { city: "茂名", stay: 0, role: "返程完成", reason: "不再加景点，避免最后两天疲劳超支。" }
      ],
      redFlags: ["杭州和厦门暑期住宿波动大", "苏杭二选一即可，低预算不建议都深玩", "低于 16 天时删济南或厦门"]
    },
    {
      id: "historyLoop",
      name: "历史审美加强线",
      role: "备选方案",
      summary: "如果用户更重文化和博物馆，把西安/洛阳权重提高，但总里程更长，预算和体力压力也更大。",
      estimatedDays: 19,
      valueScore: 82,
      efficiencyScore: 78,
      nodes: [
        { city: "茂名", stay: 0.5, role: "出发", reason: "预留交通日。" },
        { city: "广州", stay: 1, role: "枢纽", reason: "换乘效率最高。" },
        { city: "西安", stay: 3, role: "文化重心", reason: "历史体量大，但热门景点排队和住宿要控。" },
        { city: "洛阳", stay: 2, role: "补强", reason: "和西安形成古都线。" },
        { city: "北京", stay: 4, role: "主目的地", reason: "集中预约型景点。" },
        { city: "天津", stay: 1, role: "近距离短停", reason: "用低交通成本加一个城市。" },
        { city: "南京", stay: 2, role: "返程节点", reason: "东线回撤的高质量停点。" },
        { city: "广州", stay: 1, role: "回程", reason: "返茂名前缓冲。" },
        { city: "茂名", stay: 0, role: "结束", reason: "收束行程。" }
      ],
      redFlags: ["西安热门景区人流强", "跨区跨度大，18 天内会偏累", "预算 320/天时要优先青旅或地铁边住宿"]
    }
  ];

  var JOURNAL_SIGNAL_RULES = {
    liked: {
      oldtown: { culture: 0.10, authenticity: 0.12, pace: -0.03 },
      museum: { culture: 0.12, weatherFlex: 0.08, bookingEase: 0.04 },
      food: { food: 0.12, social: 0.04 },
      nature: { nature: 0.14, restoration: 0.08 },
      photo: { aesthetics: 0.14, novelty: 0.04 },
      slow: { restoration: 0.12, pace: -0.10, comfort: 0.06 }
    },
    friction: {
      crowd: { lowCrowd: 0.16, social: -0.08, bookingEase: 0.06 },
      expensive: { budget: -0.14, comfort: -0.02 },
      transit: { transit: 0.14, comfort: 0.06, pace: -0.04 },
      early: { bookingEase: 0.10, pace: -0.08, restoration: 0.04 },
      commercial: { authenticity: 0.14, novelty: 0.07, social: -0.04 },
      overpacked: { pace: -0.14, restoration: 0.08, comfort: 0.06 }
    }
  };

  var JOURNAL_DEMO_ENTRIES = [
    {
      city: "长沙",
      stage: "middle",
      energy: 6,
      load: 7,
      crowd: "overwhelmed",
      transit: "smooth",
      liked: ["food", "museum"],
      friction: ["crowd", "overpacked"],
      note: "吃得很值，博物馆也值，但五一商圈太吵，连续赶点会累。",
      createdAt: "2026-07-09T08:00:00.000Z"
    },
    {
      city: "武汉",
      stage: "middle",
      energy: 7,
      load: 5,
      crowd: "ok",
      transit: "smooth",
      liked: ["oldtown", "museum", "slow"],
      friction: ["transit"],
      note: "白天博物馆、傍晚江边散步很舒服，交通顺但不想一天跨太多区。",
      createdAt: "2026-07-10T08:00:00.000Z"
    },
    {
      city: "北京",
      stage: "end",
      energy: 5,
      load: 8,
      crowd: "overwhelmed",
      transit: "ok",
      liked: ["museum", "oldtown"],
      friction: ["early", "crowd", "expensive"],
      note: "北京内容很强，但预约、早起和住宿成本压力大，下次要把北京段锁定后再倒推路线。",
      createdAt: "2026-07-11T08:00:00.000Z"
    }
  ];

  var PERSONA_VISUALS = {
    quiet_restore: {
      image: "./assets/personas/abstract-quiet-restore.jpg",
      archetype: "把空白当目的地",
      scene: "适合山海、湖边、低噪音街区和能随时撤退的路线。",
      cue: "留白 / 慢走 / 低刺激",
      grammar: "大面积留白、低对比曲线和缓慢层叠，表示低刺激与恢复空间。",
      signals: { open: 92, density: 18, pace: 24, structure: 36 },
      accent: "#0f8b6f"
    },
    city_spark: {
      image: "./assets/personas/abstract-city-spark.jpg",
      archetype: "从城市烟火里充电",
      scene: "适合夜市、街区、朋友局和高密度但不失控的城市体验。",
      cue: "美食 / 热闹 / 即兴",
      grammar: "高密度线束、暖色脉冲和交错路径，表示烟火气、社交能量与即时反馈。",
      signals: { open: 42, density: 88, pace: 76, structure: 52 },
      accent: "#df6b57"
    },
    aesthetic_collector: {
      image: "./assets/personas/abstract-aesthetic-collector.jpg",
      archetype: "用空间和光线采样灵感",
      scene: "适合展览、建筑、咖啡店、街拍和能带回风格记忆的城市。",
      cue: "审美 / 摄影 / 展览",
      grammar: "切面、留框和冷色几何秩序，表示对光线、空间和构图的敏感。",
      signals: { open: 58, density: 46, pace: 44, structure: 82 },
      accent: "#7065d9"
    },
    slow_nomad: {
      image: "./assets/personas/abstract-slow-nomad.jpg",
      archetype: "把旅行当短暂生活实验",
      scene: "适合试住、远程办公、重复散步和有稳定日常半径的城市。",
      cue: "试住 / 办公 / 生活感",
      grammar: "模块网格、低速横向带和柔和边界，表示日常半径、稳定节律和可重复生活。",
      signals: { open: 64, density: 34, pace: 28, structure: 76 },
      accent: "#275efe"
    },
    heritage_drifter: {
      image: "./assets/personas/abstract-heritage-drifter.jpg",
      archetype: "顺着城市纹理慢慢读",
      scene: "适合老街、博物馆、地方故事和有在地真实感的目的地。",
      cue: "老城 / 历史 / 在地",
      grammar: "叠层肌理、沉积色块和隐约路径，表示城市纹理、时间厚度和地方记忆。",
      signals: { open: 46, density: 70, pace: 38, structure: 64 },
      accent: "#9a6b2f"
    },
    efficient_hunter: {
      image: "./assets/personas/abstract-efficient-hunter.jpg",
      archetype: "要结果感，也要路线确定",
      scene: "适合交通清楚、POI 集中、预约明确、短时间也有收获的城市。",
      cue: "效率 / 交通 / 计划",
      grammar: "清晰向量、节点和压缩动线，表示确定性、换乘效率和目标感。",
      signals: { open: 38, density: 62, pace: 86, structure: 90 },
      accent: "#202124"
    },
    wild_calibrator: {
      image: "./assets/personas/abstract-wild-calibrator.jpg",
      archetype: "用自然重置身体参数",
      scene: "适合山海、森林、湖边、低噪音郊野和能按体力伸缩的自然路线。",
      cue: "自然 / 低噪 / 校准",
      grammar: "地形波线、绿色团块和可呼吸留白，表示身体回到稳定阈值。",
      signals: { open: 86, density: 28, pace: 34, structure: 42 },
      accent: "#2f7d4f"
    },
    ritual_archivist: {
      image: "./assets/personas/abstract-ritual-archivist.jpg",
      archetype: "把旅行整理成可收藏的记忆",
      scene: "适合博物馆、展陈、盖章路线、纪念品和需要提前安排的文化点。",
      cue: "仪式 / 收藏 / 展陈",
      grammar: "层叠框线和档案式结构，表示预约、参观秩序和记忆归档。",
      signals: { open: 44, density: 58, pace: 48, structure: 88 },
      accent: "#7c4d2f"
    },
    taste_cartographer: {
      image: "./assets/personas/abstract-taste-cartographer.jpg",
      archetype: "用味觉给城市画地图",
      scene: "适合非核心商圈、居民区小店、夜市替代线和可错峰的餐饮区域。",
      cue: "吃喝 / 在地 / 区域",
      grammar: "散点、味觉坐标和横向路径，表示美食密度、替代点和区域路线。",
      signals: { open: 50, density: 82, pace: 58, structure: 48 },
      accent: "#d95f43"
    },
    night_flaneur: {
      image: "./assets/personas/abstract-night-flaneur.jpg",
      archetype: "在夜色里读取城市",
      scene: "适合夜景、酒吧、晚风街区、夜市和不需要早起的城市节奏。",
      cue: "夜行 / 灯光 / 漫游",
      grammar: "深色斜线、霓虹轨迹和松散节点，表示夜间能量与非线性游走。",
      signals: { open: 62, density: 70, pace: 58, structure: 40 },
      accent: "#16213e"
    },
    social_orbit: {
      image: "./assets/personas/abstract-social-orbit.jpg",
      archetype: "让关系成为路线中心",
      scene: "适合朋友局、情侣局、家庭轻社交和需要照顾同行差异的城市体验。",
      cue: "同行 / 共振 / 关系",
      grammar: "环形轨道和多点相位，表示同行者之间的距离、同步和共同记忆。",
      signals: { open: 54, density: 68, pace: 54, structure: 62 },
      accent: "#275efe"
    },
    comfort_navigator: {
      image: "./assets/personas/abstract-comfort-navigator.jpg",
      archetype: "先把舒适和确定性导航好",
      scene: "适合交通清楚、室内备选多、安全感强、跨区成本低的目的地。",
      cue: "舒适 / 交通 / 备选",
      grammar: "罗盘、轴线和稳定圆心，表示路线确定、天气容错和可撤退路径。",
      signals: { open: 48, density: 42, pace: 40, structure: 88 },
      accent: "#4c8c7a"
    },
    edge_explorer: {
      image: "./assets/personas/abstract-edge-explorer.jpg",
      archetype: "在可控边界里找新鲜感",
      scene: "适合反差城市、小众街区、新开放空间和不完全标准的探索路线。",
      cue: "新鲜 / 边界 / 反差",
      grammar: "强对角线、切面和错位色块，表示主动越界但保留控制。",
      signals: { open: 72, density: 56, pace: 78, structure: 34 },
      accent: "#111827"
    },
    micro_escape: {
      image: "./assets/personas/abstract-micro-escape.jpg",
      archetype: "用一次短逃离换气",
      scene: "适合短途周末、低预算、低换乘和能快速从日常抽离的目的地。",
      cue: "短途 / 换气 / 轻负担",
      grammar: "口袋状弧线和小型核心，表示低门槛、短半径和快速恢复。",
      signals: { open: 78, density: 26, pace: 30, structure: 58 },
      accent: "#83a95c"
    },
    family_anchor: {
      image: "./assets/personas/abstract-family-anchor.jpg",
      archetype: "把同行人的安全感放在中间",
      scene: "适合家庭、亲子、长辈同行和需要强备选、低风险、慢节奏的路线。",
      cue: "家庭 / 安全 / 弹性",
      grammar: "锚定矩形、横向缓冲带和柔和节点，表示稳定、照顾和可调整。",
      signals: { open: 46, density: 40, pace: 28, structure: 86 },
      accent: "#446c7c"
    },
    workation_weaver: {
      image: "./assets/personas/abstract-workation-weaver.jpg",
      archetype: "把工作、生活和旅行编在一起",
      scene: "适合试住、远程办公、稳定网络、日常半径和可持续消费。",
      cue: "旅居 / 办公 / 编织",
      grammar: "纵横交织的带状结构，表示工作节奏、生活半径和旅行探索被编排在一起。",
      signals: { open: 60, density: 54, pace: 32, structure: 84 },
      accent: "#275efe"
    }
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function round(value, digits) {
    var factor = Math.pow(10, digits || 0);
    return Math.round(value * factor) / factor;
  }

  function init() {
    state.journalEntries = loadJournalEntries();
    bindChoices();
    bindSliders();
    bindForm();
    bindDemoLab();
    bindJournal();
    bindGrowthDemo();
    renderInitialTraits();
    renderPersonaAtlas(null);
    renderDemoOutput(null);
    renderRouteExperiment(null);
    renderJournalMemory();
    renderGrowthDemo();
  }

  function bindChoices() {
    $all("[data-choice='mood'] button").forEach(function (button) {
      button.addEventListener("click", function () {
        state.mood = button.dataset.value;
        $all("[data-choice='mood'] button").forEach(function (item) {
          item.classList.toggle("is-selected", item === button);
        });
      });
    });
  }

  function bindSliders() {
    var days = $("#days");
    var budget = $("#budget");

    function update() {
      $("#daysValue").textContent = days.value + " 天";
      $("#budgetValue").textContent = budget.value + " 元";
    }

    days.addEventListener("input", update);
    budget.addEventListener("input", update);
    update();
  }

  function bindForm() {
    $("#personaForm").addEventListener("submit", function (event) {
      event.preventDefault();
      generate();
    });

    $("#useSample").addEventListener("click", function () {
      applyDemoPreset("aestheticSolo");
      generate();
    });

    $("#resetForm").addEventListener("click", function () {
      $("#personaForm").reset();
      state.mood = null;
      state.profile = null;
      state.plan = null;
      state.selectedCityId = null;
      state.activeDemo = null;
      $all("[data-choice='mood'] button").forEach(function (item) {
        item.classList.remove("is-selected");
      });
      bindSliders();
      renderInitialTraits();
      renderPersonaAtlas(null);
      $("#personaSummary").innerHTML = '<p class="empty-state">填写上面的取样后，这里会出现你的旅行人格画像。</p>';
      $("#cityResults").innerHTML = "";
      $("#itineraryBoard").innerHTML = '<p class="empty-state">生成推荐后会出现按天拆分的路线、预算、预约提醒和雨天备选。</p>';
      renderEmptyMap();
      renderMatrix(null);
      renderDemoOutput(null);
      renderRouteExperiment(null);
    });
  }

  function bindJournal() {
    var form = $("#journalForm");
    if (!form) {
      return;
    }

    var energy = $("#journalEnergy");
    var load = $("#journalLoad");

    function updateRanges() {
      $("#journalEnergyValue").textContent = energy.value;
      $("#journalLoadValue").textContent = load.value;
    }

    energy.addEventListener("input", updateRanges);
    load.addEventListener("input", updateRanges);
    updateRanges();

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      addJournalEntry();
    });

    $("#loadJournalDemo").addEventListener("click", function () {
      state.journalEntries = JOURNAL_DEMO_ENTRIES.map(function (entry) {
        return Object.assign({ id: makeEntryId() }, entry);
      });
      saveJournalEntries(state.journalEntries);
      renderJournalMemory();
      refreshPlanAfterJournalChange();
    });

    $("#clearJournal").addEventListener("click", function () {
      state.journalEntries = [];
      saveJournalEntries(state.journalEntries);
      renderJournalMemory();
      refreshPlanAfterJournalChange();
    });
  }

  function bindGrowthDemo() {
    var board = $("#growthDemoBoard");
    if (!board) {
      return;
    }

    $all("[data-growth-stage]").forEach(function (button) {
      button.addEventListener("click", function () {
        state.growthDemoStage = parseInt(button.dataset.growthStage, 10) || 0;
        renderGrowthDemo();
      });
    });

    var start = $("#runGrowthDemo");
    var journal = $("#applyGrowthJournal");
    var recommendation = $("#showGrowthRecommendation");

    if (start) {
      start.addEventListener("click", function () {
        state.growthDemoStage = 0;
        renderGrowthDemo();
      });
    }
    if (journal) {
      journal.addEventListener("click", function () {
        state.growthDemoStage = 1;
        renderGrowthDemo();
      });
    }
    if (recommendation) {
      recommendation.addEventListener("click", function () {
        state.growthDemoStage = 2;
        renderGrowthDemo();
      });
    }
  }

  function loadJournalEntries() {
    try {
      var raw = window.localStorage.getItem(JOURNAL_STORAGE_KEY);
      var entries = raw ? JSON.parse(raw) : [];
      return Array.isArray(entries) ? entries : [];
    } catch (err) {
      return [];
    }
  }

  function saveJournalEntries(entries) {
    try {
      window.localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries.slice(-80)));
    } catch (err) {
      return null;
    }
    return entries;
  }

  function addJournalEntry() {
    var entry = {
      id: makeEntryId(),
      city: $("#journalCity").value.trim() || (state.plan && state.plan.selectedItinerary ? state.plan.selectedItinerary.city.name : "未命名城市"),
      stage: $("#journalStage").value,
      energy: parseInt($("#journalEnergy").value, 10),
      load: parseInt($("#journalLoad").value, 10),
      crowd: $("#journalCrowd").value,
      transit: $("#journalTransit").value,
      liked: getJournalTags("liked"),
      friction: getJournalTags("friction"),
      note: $("#journalNote").value.trim(),
      createdAt: new Date().toISOString()
    };

    state.journalEntries = state.journalEntries.concat(entry).slice(-80);
    saveJournalEntries(state.journalEntries);
    $("#journalNote").value = "";
    renderJournalMemory();
    refreshPlanAfterJournalChange();
  }

  function makeEntryId() {
    return "j_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7);
  }

  function getJournalTags(group) {
    return $all("[data-journal-tags='" + group + "'] input:checked").map(function (input) {
      return input.value;
    });
  }

  function refreshPlanAfterJournalChange() {
    if (!state.plan) {
      return;
    }

    var profile = collectProfile();
    var plan = buildLocalPlan(profile);
    state.profile = profile;
    state.plan = plan;
    state.selectedCityId = plan.cities[0].city.id;
    renderPlan(plan);
  }

  function applySample() {
    applyDemoPreset("aestheticSolo");
  }

  function bindDemoLab() {
    var container = $("#demoPresets");
    if (!container) {
      return;
    }

    container.innerHTML = DEMO_PROFILES.map(function (demo) {
      return '<button type="button" class="demo-card" data-demo="' + demo.id + '">' +
        '<strong>' + escapeHtml(demo.name) + '</strong>' +
        '<span>' + escapeHtml(demo.note) + '</span>' +
        '</button>';
    }).join("");

    $all(".demo-card", container).forEach(function (button) {
      button.addEventListener("click", function () {
        applyDemoPreset(button.dataset.demo);
        generate();
        document.getElementById("analysisTitle").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function applyDemoPreset(id) {
    var demo = DEMO_PROFILES.find(function (item) {
      return item.id === id;
    }) || DEMO_PROFILES[0];
    var profile = demo.profile;
    state.activeDemo = demo.id;
    state.mood = "inspire";
    state.mood = profile.mood;
    $all("[data-choice='mood'] button").forEach(function (button) {
      button.classList.toggle("is-selected", button.dataset.value === state.mood);
    });

    setChecks("interests", profile.interests);
    setChecks("avoid", profile.avoid);
    $("#days").value = String(profile.days);
    $("#budget").value = String(profile.budget);
    $("#origin").value = profile.origin;
    $("#companion").value = profile.companion;
    $("#freeText").value = profile.freeText;
    $("#daysValue").textContent = profile.days + " 天";
    $("#budgetValue").textContent = profile.budget + " 元";
    $all(".demo-card").forEach(function (button) {
      button.classList.toggle("is-selected", button.dataset.demo === demo.id);
    });
  }

  function setChecks(group, values) {
    $all("[data-checks='" + group + "'] input").forEach(function (input) {
      input.checked = values.indexOf(input.value) >= 0;
    });
  }

  function getChecks(group) {
    return $all("[data-checks='" + group + "'] input:checked").map(function (input) {
      return input.value;
    });
  }

  function collectProfile() {
    var mood = state.mood || "restore";
    var interests = getChecks("interests");
    var avoid = getChecks("avoid");
    var activeDemo = DEMO_PROFILES.find(function (demo) {
      return demo.id === state.activeDemo;
    });
    var demoProfile = activeDemo ? activeDemo.profile : {};
    var origin = $("#origin").value.trim();
    var freeText = $("#freeText").value.trim();

    return {
      mood: mood,
      moodLabel: MOOD_LABELS[mood],
      interests: interests,
      avoid: avoid,
      days: parseInt($("#days").value, 10),
      budget: parseInt($("#budget").value, 10),
      origin: origin,
      companion: $("#companion").value,
      destination: demoProfile.destination || inferDestination(freeText),
      routeGoal: demoProfile.routeGoal || inferRouteGoal(origin, freeText),
      journalEntries: state.journalEntries.slice(),
      journalMemory: buildJournalMemory(state.journalEntries),
      freeText: freeText,
      assumedMood: !state.mood
    };
  }

  function inferDestination(text) {
    return text.indexOf("北京") >= 0 ? "北京" : "";
  }

  function inferRouteGoal(origin, text) {
    var source = (origin || "") + " " + (text || "");
    if (source.indexOf("茂名") >= 0 && source.indexOf("北京") >= 0) {
      return "multiCityValue";
    }
    if (source.indexOf("返程") >= 0 || source.indexOf("多玩") >= 0 || source.indexOf("多城") >= 0) {
      return "multiCityValue";
    }
    return "";
  }

  async function generate() {
    var profile = collectProfile();
    state.profile = profile;

    await runPipeline();

    var localPlan = buildLocalPlan(profile);
    state.plan = localPlan;
    state.selectedCityId = localPlan.cities[0].city.id;
    renderPlan(localPlan);

    if (API && API.enhancePlan) {
      API.enhancePlan(profile, localPlan).then(function (enhanced) {
        if (!enhanced) {
          return;
        }
        state.plan = mergeEnhancedPlan(localPlan, enhanced);
        renderPlan(state.plan, { silentRefresh: true });
      });
    }
  }

  function mergeEnhancedPlan(localPlan, enhanced) {
    return {
      profile: enhanced.profile || localPlan.profile,
      persona: enhanced.persona || localPlan.persona,
      vector: enhanced.vector || localPlan.vector,
      evidence: enhanced.evidence || localPlan.evidence,
      confidence: enhanced.confidence || localPlan.confidence,
      journalMemory: enhanced.journalMemory || localPlan.journalMemory,
      personaTensions: enhanced.personaTensions || localPlan.personaTensions,
      growthProfile: enhanced.growthProfile || localPlan.growthProfile,
      decisionAudit: enhanced.decisionAudit || localPlan.decisionAudit,
      insights: enhanced.insights || localPlan.insights,
      cities: Array.isArray(enhanced.cities) && enhanced.cities.length ? enhanced.cities : localPlan.cities,
      selectedItinerary: enhanced.selectedItinerary || localPlan.selectedItinerary,
      routeExperiment: enhanced.routeExperiment || localPlan.routeExperiment,
      mode: "hybrid-enhanced"
    };
  }

  async function runPipeline() {
    var items = $all("#pipeline li");
    items.forEach(function (item) {
      item.classList.remove("is-running", "is-done");
    });

    for (var i = 0; i < items.length; i += 1) {
      items[i].classList.add("is-running");
      await wait(210 + i * 45);
      items[i].classList.remove("is-running");
      items[i].classList.add("is-done");
    }
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function buildLocalPlan(profile) {
    var personaProfile = buildPersonaVector(profile);
    var scored = DATA.cities.map(function (city) {
      return scoreCity(profile, personaProfile.vector, city);
    }).sort(function (a, b) {
      return b.totalScore - a.totalScore;
    });

    var cities = includeRequiredCity(diversify(scored, 4), scored, profile);
    var persona = inferPersona(personaProfile.vector);
    var selectedItinerary = buildItinerary(profile, cities[0].city, cities[0]);
    var routeExperiment = buildRouteExperiment(profile);
    var personaTensions = analyzePersonaTensions(profile, personaProfile.vector, profile.journalMemory);
    var growthProfile = buildGrowthProfile(profile, personaProfile.vector, profile.journalMemory, personaTensions);
    var decisionAudit = buildDecisionAudit(profile, personaProfile.vector, persona, cities, routeExperiment, personaTensions, growthProfile);
    var confidence = round(clamp(personaProfile.confidence * 0.72 + growthProfile.confidence * 0.28, 0.50, 0.94), 2);
    var insights = buildInsights(profile, personaProfile.vector, persona, cities, routeExperiment, personaTensions, growthProfile);

    return {
      profile: profile,
      vector: personaProfile.vector,
      evidence: personaProfile.evidence,
      confidence: confidence,
      journalMemory: profile.journalMemory,
      persona: persona,
      personaTensions: personaTensions,
      growthProfile: growthProfile,
      decisionAudit: decisionAudit,
      cities: cities,
      insights: insights,
      selectedItinerary: selectedItinerary,
      routeExperiment: routeExperiment,
      mode: "local-industrial"
    };
  }

  function buildPersonaVector(profile) {
    var vector = {
      restoration: 0.50,
      nature: 0.50,
      culture: 0.50,
      food: 0.50,
      pace: 0.50,
      social: 0.50,
      budget: clamp(profile.budget / 1000, 0.18, 0.92),
      aesthetics: 0.50,
      comfort: 0.55,
      novelty: 0.50,
      transit: 0.55,
      lowCrowd: 0.50,
      authenticity: 0.50,
      weatherFlex: 0.50,
      bookingEase: 0.52,
      workation: 0.42
    };
    var evidence = [];

    applyMood(vector, profile.mood, evidence);
    applyInterests(vector, profile.interests, evidence);
    applyAvoid(vector, profile.avoid, evidence);
    applyCompanion(vector, profile.companion, evidence);
    applyFreeText(vector, profile.freeText, evidence);
    applyJournalMemory(vector, profile.journalMemory, evidence);

    if (profile.days <= 3) {
      vector.pace += 0.12;
      vector.comfort += 0.07;
      evidence.push("天数偏短，模型提高交通确定性与路线密度权重");
    } else if (profile.days >= 6) {
      vector.pace -= 0.12;
      vector.novelty += 0.08;
      evidence.push("天数较长，模型提高深度探索与试住适配度");
    }

    Object.keys(vector).forEach(function (key) {
      vector[key] = round(clamp(vector[key], 0.05, 0.95), 3);
    });

    var signalCount = 1 + profile.interests.length + profile.avoid.length + (profile.freeText ? 2 : 0) + (profile.origin ? 1 : 0);
    var confidence = round(clamp(0.58 + signalCount * 0.035, 0.62, 0.92), 2);

    if (profile.assumedMood) {
      evidence.push("未选择核心动机，系统以恢复型基线启动并保留较低置信度");
      confidence = Math.min(confidence, 0.72);
    }

    return { vector: vector, evidence: evidence.slice(0, 7), confidence: confidence };
  }

  function applyMood(vector, mood, evidence) {
    var effects = {
      restore: { restoration: 0.26, nature: 0.13, social: -0.18, pace: -0.18, comfort: 0.10 },
      escape: { restoration: 0.30, nature: 0.18, social: -0.22, pace: -0.16, novelty: 0.08, lowCrowd: 0.14 },
      inspire: { aesthetics: 0.22, culture: 0.18, novelty: 0.16, pace: -0.04, authenticity: 0.08 },
      social: { social: 0.26, food: 0.18, pace: 0.10, restoration: -0.10 },
      efficient: { pace: 0.28, comfort: 0.14, aesthetics: 0.10, restoration: -0.12, transit: 0.18, bookingEase: 0.12 },
      live: { restoration: 0.16, comfort: 0.16, pace: -0.20, novelty: 0.10, budget: -0.06, workation: 0.20 }
    };

    addEffects(vector, effects[mood] || effects.restore);
    evidence.push("核心动机：" + (MOOD_LABELS[mood] || "放空恢复"));
  }

  function applyInterests(vector, interests, evidence) {
    var effects = {
      nature: { nature: 0.22, restoration: 0.08 },
      oldtown: { culture: 0.17, novelty: 0.06, pace: -0.04, authenticity: 0.12 },
      art: { culture: 0.15, aesthetics: 0.16, comfort: 0.04 },
      coffee: { restoration: 0.10, comfort: 0.08, pace: -0.08 },
      food: { food: 0.20, social: 0.07 },
      photo: { aesthetics: 0.22, novelty: 0.06 },
      museum: { culture: 0.18, comfort: 0.06, weatherFlex: 0.10 },
      hidden: { novelty: 0.20, culture: 0.06, social: -0.04, authenticity: 0.12 }
    };

    interests.forEach(function (interest) {
      addEffects(vector, effects[interest] || {});
    });

    if (interests.length) {
      evidence.push("场景偏好：" + interests.map(function (item) { return INTEREST_LABELS[item]; }).join("、"));
    }
  }

  function applyAvoid(vector, avoid, evidence) {
    var effects = {
      crowd: { social: -0.14, comfort: 0.12, restoration: 0.06, lowCrowd: 0.22, bookingEase: 0.08 },
      commercial: { novelty: 0.12, culture: 0.08, social: -0.04, authenticity: 0.18 },
      climb: { pace: -0.10, comfort: 0.12, nature: -0.06 },
      early: { pace: -0.12, restoration: 0.06, bookingEase: 0.10 },
      longTransit: { comfort: 0.16, pace: -0.05, transit: 0.20 },
      expensive: { budget: -0.16, comfort: -0.02 }
    };

    avoid.forEach(function (item) {
      addEffects(vector, effects[item] || {});
    });

    if (avoid.length) {
      evidence.push("避雷约束：" + avoid.map(function (item) { return AVOID_LABELS[item]; }).join("、"));
    }
  }

  function applyCompanion(vector, companion, evidence) {
    var effects = {
      solo: { social: -0.08, comfort: 0.08, novelty: 0.04, lowCrowd: 0.05 },
      couple: { aesthetics: 0.08, comfort: 0.08, pace: -0.04 },
      friends: { social: 0.12, food: 0.08, pace: 0.06 },
      family: { comfort: 0.18, pace: -0.10, budget: 0.05, transit: 0.16, weatherFlex: 0.12, bookingEase: 0.12 }
    };
    addEffects(vector, effects[companion] || effects.solo);
  }

  function applyFreeText(vector, text, evidence) {
    if (!text) {
      return;
    }

    var rules = [
      { keys: ["累", "疲惫", "放空", "休息"], effect: { restoration: 0.14, pace: -0.08, lowCrowd: 0.06 } },
      { keys: ["咖啡", "书店", "散步"], effect: { comfort: 0.10, restoration: 0.08, pace: -0.06 } },
      { keys: ["展", "美术馆", "博物馆"], effect: { culture: 0.12, aesthetics: 0.10 } },
      { keys: ["小众", "避开", "不想排队"], effect: { novelty: 0.12, social: -0.08, comfort: 0.08, lowCrowd: 0.12, authenticity: 0.08 } },
      { keys: ["热闹", "朋友", "酒吧"], effect: { social: 0.12, food: 0.08 } },
      { keys: ["海", "山", "自然"], effect: { nature: 0.14, restoration: 0.08 } },
      { keys: ["拍", "出片", "建筑"], effect: { aesthetics: 0.14 } },
      { keys: ["交通", "方便", "地铁", "少换乘"], effect: { transit: 0.12, comfort: 0.06 } },
      { keys: ["雨天", "室内", "备选"], effect: { weatherFlex: 0.14, bookingEase: 0.06 } }
    ];

    rules.forEach(function (rule) {
      if (rule.keys.some(function (key) { return text.indexOf(key) >= 0; })) {
        addEffects(vector, rule.effect);
      }
    });

    evidence.push("原话信号已纳入：\"" + text.slice(0, 32) + (text.length > 32 ? "..." : "") + "\"");
  }

  function addEffects(vector, effects) {
    Object.keys(effects || {}).forEach(function (key) {
      vector[key] = (vector[key] || 0.5) + effects[key];
    });
  }

  function buildJournalMemory(entries) {
    var list = Array.isArray(entries) ? entries : [];
    var rawDelta = {};
    var evidence = [];
    var contradictions = [];
    var likedCounts = {};
    var frictionCounts = {};
    var totalEnergy = 0;
    var totalLoad = 0;
    var transitTiring = 0;
    var crowdStress = 0;

    function addDelta(effect, multiplier) {
      Object.keys(effect || {}).forEach(function (key) {
        rawDelta[key] = (rawDelta[key] || 0) + effect[key] * (multiplier || 1);
      });
    }

    list.forEach(function (entry) {
      var liked = entry.liked || [];
      var friction = entry.friction || [];
      totalEnergy += Number(entry.energy) || 5;
      totalLoad += Number(entry.load) || 5;

      liked.forEach(function (tag) {
        likedCounts[tag] = (likedCounts[tag] || 0) + 1;
        addDelta(JOURNAL_SIGNAL_RULES.liked[tag], 1);
      });

      friction.forEach(function (tag) {
        frictionCounts[tag] = (frictionCounts[tag] || 0) + 1;
        addDelta(JOURNAL_SIGNAL_RULES.friction[tag], 1);
      });

      if (entry.energy >= 7 && entry.load <= 5) {
        addDelta({ restoration: 0.08, comfort: 0.06 }, 1);
      }
      if (entry.energy <= 5 && entry.load >= 7) {
        addDelta({ pace: -0.12, restoration: 0.08, comfort: 0.06 }, 1);
      }
      if (entry.crowd === "overwhelmed") {
        crowdStress += 1;
        addDelta({ lowCrowd: 0.14, social: -0.08, bookingEase: 0.04 }, 1);
      }
      if (entry.crowd === "calm") {
        addDelta({ social: 0.03, comfort: 0.04 }, 1);
      }
      if (entry.transit === "tiring") {
        transitTiring += 1;
        addDelta({ transit: 0.14, comfort: 0.06, pace: -0.05 }, 1);
      }
      if (entry.transit === "smooth") {
        addDelta({ transit: 0.04, pace: 0.02 }, 1);
      }
      addDelta(inferJournalTextEffect(entry.note || ""), 1);

      if (entry.note) {
        evidence.push({
          city: entry.city || "未命名城市",
          note: entry.note,
          tags: liked.concat(friction).slice(0, 4)
        });
      }
    });

    var divisor = Math.max(Math.sqrt(Math.max(list.length, 1)) * 2.8, 2.8);
    var delta = {};
    Object.keys(rawDelta).forEach(function (key) {
      delta[key] = round(clamp(rawDelta[key] / divisor, -0.26, 0.26), 3);
    });

    if ((likedCounts.food || 0) > 0 && crowdStress > 0) {
      contradictions.push("喜欢烟火气和美食，但对拥挤阈值偏低，推荐应找非核心商圈的吃喝区域。");
    }
    if ((likedCounts.museum || 0) > 0 && (frictionCounts.early || 0) > 0) {
      contradictions.push("喜欢高信息量场馆，但不适合早起硬赶预约，推荐应提前锁票并减少当天第二站。");
    }
    if (transitTiring > 0 && list.length >= 2) {
      contradictions.push("真实记录显示换乘会显著消耗体力，多城路线应控制连续跨城天数。");
    }
    if (list.length) {
      var avgEnergy = totalEnergy / list.length;
      var avgLoad = totalLoad / list.length;
      if (avgEnergy <= 5.5 && avgLoad >= 6.8) {
        contradictions.push("手账里的实际体力低于问卷预期，系统会下调节奏、增加缓冲日。");
      }
    }

    var topDeltas = Object.keys(delta).map(function (key) {
      return { key: key, value: delta[key] };
    }).sort(function (a, b) {
      return Math.abs(b.value) - Math.abs(a.value);
    }).slice(0, 6);

    var confidence = list.length ? round(clamp(0.42 + Math.sqrt(list.length) * 0.12 + evidence.length * 0.015, 0.48, 0.9), 2) : 0;
    var nextRules = buildJournalNextRules(delta, contradictions);

    return {
      entryCount: list.length,
      confidence: confidence,
      delta: delta,
      topDeltas: topDeltas,
      evidence: evidence.slice(-5).reverse(),
      contradictions: contradictions.slice(0, 4),
      nextRules: nextRules,
      updatedAt: list.length ? list[list.length - 1].createdAt : null
    };
  }

  function inferJournalTextEffect(text) {
    var effect = {};
    var rules = [
      { keys: ["好吃", "夜市", "小吃"], effect: { food: 0.09, social: 0.03 } },
      { keys: ["博物馆", "展", "历史"], effect: { culture: 0.10, weatherFlex: 0.04 } },
      { keys: ["老城", "街巷", "本地"], effect: { culture: 0.08, authenticity: 0.10 } },
      { keys: ["散步", "舒服", "慢"], effect: { restoration: 0.08, pace: -0.05, comfort: 0.04 } },
      { keys: ["太吵", "排队", "人多"], effect: { lowCrowd: 0.12, social: -0.06 } },
      { keys: ["贵", "溢价", "住宿成本"], effect: { budget: -0.10 } },
      { keys: ["预约", "抢票"], effect: { bookingEase: 0.10, transit: 0.04 } },
      { keys: ["换乘", "跨区", "交通"], effect: { transit: 0.10, comfort: 0.04 } },
      { keys: ["赶", "累"], effect: { pace: -0.10, restoration: 0.05, comfort: 0.04 } }
    ];

    rules.forEach(function (rule) {
      if (rule.keys.some(function (key) { return text.indexOf(key) >= 0; })) {
        Object.keys(rule.effect).forEach(function (key) {
          effect[key] = (effect[key] || 0) + rule.effect[key];
        });
      }
    });

    return effect;
  }

  function buildJournalNextRules(delta, contradictions) {
    var rules = [];
    if ((delta.lowCrowd || 0) > 0.06) {
      rules.push("优先选择可错峰、可预约、非核心商圈的 POI。");
    }
    if ((delta.transit || 0) > 0.06) {
      rules.push("跨城路线最多连续两天移动，第三天必须安排低移动量。");
    }
    if ((delta.budget || 0) < -0.05) {
      rules.push("住宿和餐饮默认做性价比筛选，避免旺季溢价区。");
    }
    if ((delta.culture || 0) > 0.06) {
      rules.push("增加博物馆、老城和地方历史权重，但保留雨天/闭馆备选。");
    }
    if ((delta.pace || 0) < -0.05) {
      rules.push("每天核心任务不超过 2 个，保留下午或晚上自由段。");
    }
    if (!rules.length && contradictions.length) {
      rules.push("先尊重手账里出现的矛盾：喜欢内容，但不要用高强度方式获得内容。");
    }
    return rules.slice(0, 4);
  }

  function applyJournalMemory(vector, memory, evidence) {
    if (!memory || !memory.entryCount) {
      return;
    }

    var strength = clamp(0.18 + memory.confidence * 0.28, 0.2, 0.43);
    Object.keys(memory.delta || {}).forEach(function (key) {
      vector[key] = (vector[key] || 0.5) + memory.delta[key] * strength;
    });

    evidence.push("手账记忆已计入画像：" + memory.entryCount + " 条记录，置信度 " + Math.round(memory.confidence * 100) + "%。");
    if (memory.contradictions.length) {
      evidence.push("发现旅行偏好矛盾：" + memory.contradictions[0]);
    }
  }

  function inferPersona(vector) {
    var ranked = DATA.personas.map(function (persona) {
      var score = scorePersonaMatch(vector, persona);
      return { persona: persona, score: score };
    }).sort(function (a, b) {
      return b.score - a.score;
    });
    var best = ranked[0];
    var secondary = ranked[1] || ranked[0];
    var gap = best.score - secondary.score;

    return {
      id: best.persona.id,
      name: best.persona.name,
      summary: best.persona.summary,
      score: round(best.score, 3),
      secondary: {
        id: secondary.persona.id,
        name: secondary.persona.name,
        score: round(secondary.score, 3)
      },
      alternates: ranked.slice(0, 4).map(function (item) {
        return {
          id: item.persona.id,
          name: item.persona.name,
          score: round(item.score, 3)
        };
      }),
      confidenceMargin: round(gap, 3),
      blendLabel: gap < 0.045 ? best.persona.name + " × " + secondary.persona.name : best.persona.name
    };
  }

  function scorePersonaMatch(vector, persona) {
    var match = persona.match || {};
    var base = similarity(vector, match);
    var anchors = Object.keys(DATA.traitLabels).map(function (key) {
      var target = typeof match[key] === "number" ? match[key] : 0.5;
      var distanceFromNeutral = Math.abs(target - 0.5);
      return { key: key, target: target, weight: distanceFromNeutral };
    }).filter(function (item) {
      return item.weight >= 0.14;
    });

    if (!anchors.length) {
      return round(base, 4);
    }

    var anchorTotal = 0;
    var anchorWeight = 0;
    var contradiction = 0;
    anchors.forEach(function (item) {
      var actual = typeof vector[item.key] === "number" ? vector[item.key] : 0.5;
      var closeness = 1 - Math.abs(actual - item.target);
      anchorTotal += closeness * item.weight;
      anchorWeight += item.weight;
      if ((item.target > 0.68 && actual < 0.38) || (item.target < 0.32 && actual > 0.62)) {
        contradiction += item.weight;
      }
    });

    var anchorScore = anchorWeight ? anchorTotal / anchorWeight : base;
    var contradictionScore = anchorWeight ? 1 - clamp(contradiction / anchorWeight, 0, 1) : 1;
    return round(clamp(base * 0.68 + anchorScore * 0.24 + contradictionScore * 0.08, 0, 1), 4);
  }

  function scoreCity(profile, vector, city) {
    var cityVector = enrichCityVector(city);
    var personaScore = similarity(vector, cityVector);
    var budgetScore = scoreBudget(profile.budget, city.dailyBudget);
    var daysScore = scoreDays(profile.days, city.minDays, city.maxDays);
    var avoidScore = scoreAvoid(profile.avoid, city.riskFlags || []);
    var mapScore = scoreMap(profile, city);
    var communityScore = scoreCommunity(profile.avoid, city);
    var resilienceScore = scoreResilience(profile, city);
    var diversityScore = scorePoiDiversity(city);
    var intelligence = getCityIntel(city);
    var evidenceScore = scoreCityEvidence(profile, city, intelligence);
    var routeScore = scoreRouteFit(profile, city, intelligence);
    var growthScore = scoreGrowthFit(profile, vector, city, intelligence);

    var weightModel = getCityScoreWeights(profile, vector);
    var total = personaScore * weightModel.persona + budgetScore * weightModel.budget + daysScore * weightModel.days + avoidScore * weightModel.avoid + mapScore * weightModel.map + communityScore * weightModel.community + resilienceScore * weightModel.resilience + diversityScore * weightModel.diversity + evidenceScore * weightModel.evidence + routeScore * weightModel.route + growthScore * weightModel.growth;
    if (profile.destination && city.name === profile.destination) {
      total = total * 0.88 + 0.12;
    }
    if (profile.routeGoal === "multiCityValue" && routeScore < 0.64) {
      total -= 0.035;
    }
    var matchPercent = Math.round(58 + clamp(total, 0, 1) * 40);
    var best = bestDimension(vector, cityVector, true);
    var worst = bestDimension(vector, cityVector, false);

    return {
      city: city,
      cityVector: cityVector,
      totalScore: round(total, 4),
      matchPercent: matchPercent,
      breakdown: {
        persona: round(personaScore, 2),
        budget: round(budgetScore, 2),
        days: round(daysScore, 2),
        avoid: round(avoidScore, 2),
        map: round(mapScore, 2),
        community: round(communityScore, 2),
        resilience: round(resilienceScore, 2),
        diversity: round(diversityScore, 2),
        evidence: round(evidenceScore, 2),
        route: round(routeScore, 2),
        growth: round(growthScore, 2),
        weights: Object.keys(weightModel).reduce(function (acc, key) {
          acc[key] = round(weightModel[key], 3);
          return acc;
        }, {})
      },
      intelligence: intelligence,
      reason: buildCityReason(profile, vector, city, best, worst),
      bestFit: DATA.traitLabels[best.key],
      watchOut: buildWatchOut(profile, city, worst),
      mapUrl: API ? API.baiduPlaceUrl(city.centerQuery || city.name, city.name) : "#"
    };
  }

  function enrichCityVector(city) {
    var vector = Object.assign({}, city.vector);
    var riskFlags = city.riskFlags || [];
    var indoorCount = city.pois.filter(function (poi) { return poi.indoor; }).length;
    var typeCount = {};

    city.pois.forEach(function (poi) {
      typeCount[poi.type] = true;
    });

    vector.transit = city.transportScore;
    vector.lowCrowd = riskFlags.indexOf("crowd") >= 0 ? 0.32 : 0.74;
    vector.authenticity = riskFlags.indexOf("commercial") >= 0 ? clamp((city.vector.culture || 0.5) + 0.02, 0.35, 0.72) : clamp((city.vector.culture || 0.5) + 0.14, 0.45, 0.92);
    vector.weatherFlex = clamp(0.38 + indoorCount * 0.13, 0.38, 0.92);
    vector.bookingEase = riskFlags.indexOf("crowd") >= 0 || riskFlags.indexOf("early") >= 0 ? 0.42 : 0.72;
    vector.workation = city.cluster === "slow-nature" || city.id === "chengdu" || city.id === "hangzhou" || city.id === "shenzhen" ? 0.72 : 0.42;
    vector.poiDiversity = clamp(Object.keys(typeCount).length / 5, 0.35, 0.95);
    return vector;
  }

  function similarity(a, b) {
    var sum = 0;
    var weightSum = 0;

    Object.keys(TRAIT_WEIGHTS).forEach(function (key) {
      var weight = TRAIT_WEIGHTS[key];
      var av = typeof a[key] === "number" ? a[key] : 0.5;
      var bv = typeof b[key] === "number" ? b[key] : 0.5;
      sum += weight * Math.pow(av - bv, 2);
      weightSum += weight;
    });

    return clamp(1 - Math.sqrt(sum / weightSum), 0, 1);
  }

  function scoreBudget(userBudget, cityBudget) {
    if (!userBudget || !cityBudget) {
      return 0.72;
    }
    if (userBudget >= cityBudget) {
      return clamp(1 - (userBudget - cityBudget) / 1800, 0.78, 1);
    }
    return clamp(userBudget / cityBudget, 0.18, 0.88);
  }

  function scoreDays(days, minDays, maxDays) {
    if (days >= minDays && days <= maxDays) {
      return 1;
    }
    if (days < minDays) {
      return clamp(1 - (minDays - days) * 0.22, 0.35, 0.9);
    }
    return clamp(1 - (days - maxDays) * 0.08, 0.64, 0.95);
  }

  function scoreAvoid(avoid, riskFlags) {
    var penalty = 0;
    avoid.forEach(function (item) {
      if (riskFlags.indexOf(AVOID_TO_RISK[item]) >= 0) {
        penalty += 0.16;
      }
    });
    return clamp(1 - penalty, 0.36, 1);
  }

  function scoreMap(profile, city) {
    var poiTypes = {};
    city.pois.forEach(function (poi) {
      poiTypes[poi.type] = true;
    });
    var diversity = clamp(Object.keys(poiTypes).length / 5, 0.4, 1);
    var density = clamp(city.pois.length / Math.max(profile.days * 2, 4), 0.5, 1);
    return clamp(city.transportScore * 0.45 + diversity * 0.30 + density * 0.25, 0, 1);
  }

  function scoreCommunity(avoid, city) {
    var score = 0.92;
    var risks = city.riskFlags || [];
    avoid.forEach(function (item) {
      if (risks.indexOf(AVOID_TO_RISK[item]) >= 0) {
        score -= 0.12;
      }
    });
    return clamp(score, 0.48, 0.96);
  }

  function scoreResilience(profile, city) {
    var cityVector = enrichCityVector(city);
    var resilience = cityVector.transit * 0.32 + cityVector.weatherFlex * 0.25 + cityVector.bookingEase * 0.25 + cityVector.lowCrowd * 0.18;

    if (profile.companion === "family") {
      resilience = resilience * 0.85 + cityVector.comfort * 0.15;
    }

    return clamp(resilience, 0, 1);
  }

  function scorePoiDiversity(city) {
    var types = {};
    city.pois.forEach(function (poi) {
      types[poi.type] = true;
    });
    return clamp(Object.keys(types).length / 5, 0.45, 1);
  }

  function bestDimension(userVector, cityVector, wantBest) {
    var candidates = Object.keys(TRAIT_WEIGHTS).map(function (key) {
      var userValue = userVector[key] || 0.5;
      var cityValue = cityVector[key] || 0.5;
      var diff = Math.abs(userValue - cityValue);
      var sharedStrength = (userValue + cityValue) / 2;
      var score = wantBest ? (1 - diff) * sharedStrength * TRAIT_WEIGHTS[key] : diff * TRAIT_WEIGHTS[key];
      return { key: key, diff: diff, score: score };
    }).sort(function (a, b) {
      return b.score - a.score;
    });
    return candidates[0];
  }

  function buildCityReason(profile, vector, city, best) {
    var lead = "你这次的核心信号是" + (profile.moodLabel || MOOD_LABELS[profile.mood] || "当前旅行状态");
    var bestLabel = DATA.traitLabels[best.key];
    var intel = getCityIntel(city);
    var routeRole = intel.routeRoles && intel.routeRoles.length ? "；在这条路线里主要承担「" + intel.routeRoles[0] + "」" : "";
    return lead + "，" + city.name + "在" + bestLabel + "上和你贴合度最高；它的" + city.bestFor.slice(0, 2).join("、") + "有数据支撑" + routeRole + "。";
  }

  function buildWatchOut(profile, city, worst) {
    var matchedRisks = profile.avoid.filter(function (item) {
      return (city.riskFlags || []).indexOf(AVOID_TO_RISK[item]) >= 0;
    });

    if (matchedRisks.length) {
      return "你介意" + matchedRisks.map(function (item) { return AVOID_LABELS[item]; }).join("、") + "，这里需要错峰或替换路线。";
    }

    return city.notFor || ("在" + DATA.traitLabels[worst.key] + "上需要二次确认。");
  }

  function getCityIntel(city) {
    var scores = DATA.cityIntelligence && DATA.cityIntelligence.cityScores ? DATA.cityIntelligence.cityScores : {};
    return scores[city.id] || {
      transportEase: city.transportScore || 0.60,
      costStability: clamp(1 - (city.dailyBudget || 500) / 1000, 0.35, 0.82),
      poiDepth: clamp((city.pois || []).length / 6, 0.45, 0.88),
      weatherBackup: 0.58,
      bookingFriction: 0.50,
      crowdRisk: 0.55,
      routeValue: 0.55,
      growthSignal: 0.62,
      routeRoles: [],
      whenToUse: "作为通用目的地候选，需要更多地图和手账数据校准。",
      downgradeIf: "当预算、拥挤、预约或交通任一硬约束明显冲突时降权。",
      evidence: city.platformSignals || []
    };
  }

  function weightedAverage(items) {
    var total = 0;
    var weight = 0;
    items.forEach(function (item) {
      total += item.value * item.weight;
      weight += item.weight;
    });
    return weight ? clamp(total / weight, 0, 1) : 0.5;
  }

  function getCityScoreWeights(profile, vector) {
    var weights = {
      persona: 0.24,
      budget: 0.10,
      days: 0.07,
      avoid: 0.09,
      map: 0.08,
      community: 0.06,
      resilience: 0.08,
      diversity: 0.05,
      evidence: 0.14,
      route: 0.06,
      growth: 0.03
    };

    if (profile.routeGoal === "multiCityValue") {
      weights.route += 0.08;
      weights.evidence += 0.03;
      weights.days += 0.02;
      weights.persona -= 0.06;
      weights.diversity -= 0.01;
    }
    if (profile.budget < 420) {
      weights.budget += 0.04;
      weights.evidence += 0.02;
      weights.persona -= 0.03;
      weights.community += 0.01;
    }
    if (profile.journalMemory && profile.journalMemory.entryCount) {
      weights.growth += 0.04;
      weights.avoid += 0.02;
      weights.evidence += 0.01;
      weights.persona -= 0.03;
    }
    if (vector.lowCrowd > 0.64 || (profile.avoid || []).indexOf("crowd") >= 0) {
      weights.avoid += 0.03;
      weights.community += 0.02;
      weights.resilience += 0.01;
      weights.persona -= 0.03;
    }
    if (profile.companion === "family") {
      weights.resilience += 0.05;
      weights.map += 0.02;
      weights.route -= 0.02;
      weights.persona -= 0.03;
    }

    var sum = 0;
    Object.keys(weights).forEach(function (key) {
      weights[key] = Math.max(weights[key], 0.01);
      sum += weights[key];
    });
    Object.keys(weights).forEach(function (key) {
      weights[key] = weights[key] / sum;
    });
    return weights;
  }

  function scoreCityEvidence(profile, city, intel) {
    var avoid = profile.avoid || [];
    var routeMode = profile.routeGoal === "multiCityValue";
    var budgetStrict = profile.budget < 420;
    var wantsLowCrowd = avoid.indexOf("crowd") >= 0;
    var hatesEarly = avoid.indexOf("early") >= 0;
    var bookingEase = 1 - (intel.bookingFriction || 0.5);
    var crowdSafe = 1 - (intel.crowdRisk || 0.5);

    return weightedAverage([
      { value: intel.transportEase || city.transportScore || 0.6, weight: routeMode ? 1.25 : 0.90 },
      { value: intel.costStability || 0.60, weight: budgetStrict ? 1.45 : 0.95 },
      { value: intel.poiDepth || 0.60, weight: 1.05 },
      { value: intel.weatherBackup || 0.58, weight: 0.70 },
      { value: bookingEase, weight: hatesEarly ? 1.10 : 0.70 },
      { value: crowdSafe, weight: wantsLowCrowd ? 1.30 : 0.65 },
      { value: intel.routeValue || 0.55, weight: routeMode ? 1.35 : 0.35 }
    ]);
  }

  function scoreRouteFit(profile, city, intel) {
    if (profile.routeGoal !== "multiCityValue") {
      return weightedAverage([
        { value: intel.transportEase || city.transportScore || 0.6, weight: 0.55 },
        { value: intel.poiDepth || 0.6, weight: 0.30 },
        { value: intel.costStability || 0.6, weight: 0.15 }
      ]);
    }

    var longTransitPenalty = profile.avoid.indexOf("longTransit") >= 0 ? (1 - (intel.transportEase || city.transportScore || 0.6)) * 0.16 : 0;
    return clamp(weightedAverage([
      { value: intel.routeValue || 0.55, weight: 0.48 },
      { value: intel.transportEase || city.transportScore || 0.6, weight: 0.28 },
      { value: intel.costStability || 0.6, weight: 0.16 },
      { value: 1 - (intel.crowdRisk || 0.55), weight: 0.08 }
    ]) - longTransitPenalty, 0, 1);
  }

  function scoreGrowthFit(profile, vector, city, intel) {
    var memory = profile.journalMemory || {};
    var base = intel.growthSignal || 0.62;
    var memoryBoost = memory.entryCount ? clamp(memory.confidence || 0.5, 0.45, 0.90) : 0.44;
    var routeLearning = profile.routeGoal === "multiCityValue" ? (intel.routeValue || 0.55) : 0.55;
    var calmNeed = vector.lowCrowd > 0.62 ? (1 - (intel.crowdRisk || 0.55)) : 0.60;
    return weightedAverage([
      { value: base, weight: 0.40 },
      { value: memoryBoost, weight: memory.entryCount ? 0.25 : 0.12 },
      { value: routeLearning, weight: 0.20 },
      { value: calmNeed, weight: 0.15 }
    ]);
  }

  function formatScore(value) {
    return Math.round(clamp(value, 0, 1) * 100);
  }

  function analyzePersonaTensions(profile, vector, memory) {
    var tensions = [];
    var interests = profile.interests || [];
    var avoid = profile.avoid || [];
    var journal = memory || {};

    function add(title, detail, action, severity) {
      tensions.push({
        title: title,
        detail: detail,
        action: action,
        severity: severity || "medium"
      });
    }

    if (vector.restoration > 0.66 && vector.pace > 0.56) {
      add("想恢复，但又想多玩", "你的动机里同时出现低消耗和高收获，连续赶路会让推荐失真。", "每 2-3 天设置半天缓冲，把核心 POI 控制在每天 2 个以内。", "high");
    }
    if (avoid.indexOf("crowd") >= 0 && (interests.indexOf("food") >= 0 || interests.indexOf("local") >= 0 || interests.indexOf("oldtown") >= 0)) {
      add("喜欢烟火气，但不喜欢人挤人", "美食、老街和在地生活常常伴随排队与噪声。", "优先找非核心商圈、早晚错峰、居民区餐饮，而不是只追热门店。", "high");
    }
    if (avoid.indexOf("early") >= 0 && (interests.indexOf("museum") >= 0 || interests.indexOf("art") >= 0 || interests.indexOf("culture") >= 0)) {
      add("喜欢高信息量场馆，但不适合硬早起", "预约型场馆如果安排太满，会和你的节奏偏好冲突。", "提前锁票，把故宫/国博这类大体量场馆拆日，不在同一天叠加第二个重 POI。", "medium");
    }
    if (profile.routeGoal === "multiCityValue" && avoid.indexOf("longTransit") >= 0) {
      add("想多城高性价比，但怕长交通", "路线不是越多城市越值，连续跨城会吞掉体验。", "只保留顺路节点，删掉绕行城市，并给北京前后各留半天机动。", "high");
    }
    if (profile.days >= 14 && vector.lowCrowd > 0.62) {
      add("长线旅行需要稳定阈值", "两三周路线里，拥挤和行李搬运会不断累积。", "把返程城市做成低风险收束，而不是继续加高强度打卡。", "medium");
    }
    if (journal.entryCount && journal.contradictions && journal.contradictions.length) {
      add("手账已经修正问卷", journal.contradictions[0], "下一次推荐应优先相信真实记录，而不是只相信冷启动问卷。", "high");
    }

    return tensions.slice(0, 5);
  }

  function buildGrowthProfile(profile, vector, memory, tensions) {
    var journal = memory || { entryCount: 0, confidence: 0, evidence: [], contradictions: [] };
    var entryCount = journal.entryCount || 0;
    var stage = "冷启动";
    var stageKey = "cold";
    if (entryCount >= 6) {
      stage = "稳定画像";
      stageKey = "stable";
    } else if (entryCount >= 3) {
      stage = "手账校准";
      stageKey = "calibrated";
    } else if (entryCount >= 1) {
      stage = "早期学习";
      stageKey = "learning";
    }

    var freeTextScore = profile.freeText ? 0.16 : 0.05;
    var journalScore = entryCount ? clamp((journal.confidence || 0.48) * 0.28, 0.12, 0.26) : 0.03;
    var routeScore = profile.routeGoal ? 0.14 : 0.05;
    var conflictPenalty = Math.min((tensions || []).length * 0.015, 0.06);
    var confidence = round(clamp(0.34 + Math.min((profile.interests || []).length, 5) * 0.028 + Math.min((profile.avoid || []).length, 5) * 0.025 + freeTextScore + journalScore + routeScore - conflictPenalty, 0.38, 0.92), 2);

    var confidenceParts = [
      { label: "问卷选择", value: clamp(0.30 + Math.min((profile.interests || []).length, 5) * 0.07, 0.30, 0.72) },
      { label: "原话解析", value: profile.freeText ? 0.78 : 0.18 },
      { label: "手账证据", value: entryCount ? clamp(journal.confidence || 0.48, 0.48, 0.92) : 0.10 },
      { label: "路线约束", value: profile.routeGoal ? 0.82 : 0.24 },
      { label: "冲突识别", value: (tensions || []).length ? 0.76 : 0.36 }
    ];

    var nextDataNeeded = [];
    if (!entryCount) {
      nextDataNeeded.push("至少记录 3 天手账：一个喜欢的点、一个消耗点、一次真实交通体感。");
    } else if (entryCount < 3) {
      nextDataNeeded.push("继续补足不同城市/不同阶段的记录，避免只从单日情绪判断人格。");
    }
    if ((profile.avoid || []).indexOf("crowd") >= 0) {
      nextDataNeeded.push("记录每个热门点的人流体感，用来判断你能接受的排队阈值。");
    }
    if (profile.routeGoal === "multiCityValue") {
      nextDataNeeded.push("记录每段跨城后的能量变化，用来自动删减返程节点。");
    }
    if (!nextDataNeeded.length) {
      nextDataNeeded.push("继续记录正向体验，系统会逐步区分一时喜欢和长期偏好。");
    }

    return {
      stage: stage,
      stageKey: stageKey,
      confidence: confidence,
      entryCount: entryCount,
      confidenceParts: confidenceParts,
      nextDataNeeded: nextDataNeeded.slice(0, 3),
      readableSummary: stage + "阶段：系统会把问卷当作起点，把手账当作校准，把路线约束当作落地边界。"
    };
  }

  function buildDecisionAudit(profile, vector, persona, cities, routeExperiment, tensions, growthProfile) {
    growthProfile = growthProfile || buildGrowthProfile(profile, vector, profile.journalMemory, tensions || []);
    var constraints = [
      { label: "出发", value: profile.origin || "未指定" },
      { label: "目的", value: profile.destination || (profile.routeGoal ? "多城路线" : "开放推荐") },
      { label: "时长", value: profile.days + " 天" },
      { label: "日均预算", value: profile.budget + " 元" },
      { label: "成长阶段", value: growthProfile.stage }
    ];

    var cityRows = cities.slice(0, 4).map(function (item) {
      var intel = item.intelligence || getCityIntel(item.city);
      var metrics = [
        { key: "persona", label: "人格贴合", value: item.breakdown.persona, note: item.bestFit },
        { key: "value", label: "性价比", value: item.breakdown.evidence, note: intel.whenToUse },
        { key: "route", label: "路线效率", value: item.breakdown.route, note: (intel.routeRoles || []).slice(0, 2).join(" / ") || "通用目的地" },
        { key: "risk", label: "风险控制", value: item.breakdown.avoid, note: item.watchOut },
        { key: "growth", label: "成长价值", value: item.breakdown.growth, note: "能帮助画像分辨长期偏好" }
      ];

      return {
        city: item.city.name,
        score: item.matchPercent,
        decision: item.matchPercent >= 88 ? "主推" : item.matchPercent >= 82 ? "可选" : "备选",
        metrics: metrics,
        evidence: (intel.evidence || []).slice(0, 3),
        downgradeIf: intel.downgradeIf,
        reason: item.reason
      };
    });

    var routeRows = [];
    if (routeExperiment && routeExperiment.primary && routeExperiment.primary.nodes) {
      routeRows = routeExperiment.primary.nodes.map(function (node) {
        return {
          city: node.city,
          role: node.role,
          stay: node.stay,
          value: node.value || 72,
          efficiency: node.efficiency || 70,
          cost: node.cost || 68,
          fatigue: node.fatigue || 45,
          proof: node.proof || node.reason
        };
      });
    }

    return {
      title: profile.routeGoal === "multiCityValue" ? "路线证据优先的决策板" : "城市证据优先的决策板",
      subtitle: "总分只决定排序，真正的推荐要同时看约束、证据、风险和成长价值。",
      constraints: constraints,
      cityRows: cityRows,
      routeRows: routeRows,
      tensions: tensions || [],
      growth: growthProfile,
      persona: persona.name
    };
  }

  function diversify(scored, count) {
    var picked = [];
    var clusters = {};

    scored.forEach(function (item) {
      if (picked.length >= count) {
        return;
      }
      if (!clusters[item.city.cluster] || picked.length < 2) {
        picked.push(item);
        clusters[item.city.cluster] = true;
      }
    });

    scored.forEach(function (item) {
      if (picked.length >= count) {
        return;
      }
      if (!picked.some(function (selected) { return selected.city.id === item.city.id; })) {
        picked.push(item);
      }
    });

    return picked;
  }

  function includeRequiredCity(cities, scored, profile) {
    if (!profile.destination) {
      return cities;
    }
    var exists = cities.some(function (item) {
      return item.city.name === profile.destination;
    });
    if (exists) {
      return cities;
    }
    var required = scored.find(function (item) {
      return item.city.name === profile.destination;
    });
    if (!required) {
      return cities;
    }
    var next = cities.slice(0, 3);
    next.push(required);
    return next.sort(function (a, b) {
      if (a.city.name === profile.destination) {
        return -1;
      }
      if (b.city.name === profile.destination) {
        return 1;
      }
      return b.totalScore - a.totalScore;
    });
  }

  function buildInsights(profile, vector, persona, cities, routeExperiment, tensions, growthProfile) {
    var insights = [];
    insights.push("你的主画像是「" + (persona.blendLabel || persona.name) + "」，置信度来自核心动机、场景偏好、避雷项、原话和锚点维度交叉验证。");

    if (persona.secondary && persona.secondary.name !== persona.name) {
      insights.push("次级画像接近「" + persona.secondary.name + "」，说明系统会按混合倾向处理你，而不是把你锁死在单一人格。");
    }

    if (vector.restoration > 0.68 && vector.pace > 0.60) {
      insights.push("你同时想恢复又想高效，系统会避免把行程排成连续赶路。");
    }

    if (profile.avoid.indexOf("crowd") >= 0) {
      insights.push("你明确排斥拥挤，推荐排序已降低强网红城市和高排队 POI 的权重。");
    }

    if (profile.budget < 360) {
      insights.push("预算偏克制，模型优先选择日均消费稳定、公共交通可覆盖的城市。");
    }

    if (profile.freeText) {
      insights.push("你的原话被作为软信号处理，不会覆盖硬约束，但会影响审美、节奏和避坑排序。");
    }

    if (profile.journalMemory && profile.journalMemory.entryCount) {
      insights.push("手账记忆正在校正问卷：系统会优先相信你旅行中真实出现的疲惫、惊喜和踩雷。");
    }

    if (tensions && tensions.length) {
      insights.push("系统识别到 " + tensions.length + " 个偏好冲突，推荐会先处理「" + tensions[0].title + "」，避免路线看起来丰富但实际消耗过高。");
    }

    if (growthProfile) {
      insights.push("当前处于「" + growthProfile.stage + "」，后续会用手账继续校准，而不是把这次问卷当成永久标签。");
    }

    if (routeExperiment) {
      insights.push("这是路线问题，不是单城问题；系统已把顺路价值、返程效率、预算压力和删减策略放进排序。");
    }

    insights.push("当前 Top 1 是" + cities[0].city.name + "，不是因为单项最高，而是人格、预算、天数、避雷和地图密度综合最稳。");
    return insights.slice(0, 6);
  }

  function buildItinerary(profile, city, scoredCity) {
    var days = clamp(profile.days, city.minDays, Math.min(city.maxDays, 5));
    var pois = city.pois.slice();
    var planDays = [];

    for (var d = 0; d < days; d += 1) {
      var first = pois[(d * 2) % pois.length];
      var second = pois[(d * 2 + 1) % pois.length];
      var backup = pois[(d * 2 + 2) % pois.length];

      planDays.push({
        day: d + 1,
        title: d === 0 ? "抵达与校准节奏" : d === days - 1 ? "收束与低风险补完" : "深入一个区域",
        slots: [
          { time: "10:00", text: first.name + " · " + first.tip },
          { time: "12:30", text: "在住宿区域附近用餐，减少跨区移动（" + city.stayZone + "）" },
          { time: "15:00", text: second.name + " · " + second.tip },
          { time: "19:30", text: d % 2 === 0 ? "保留自由晚间，不强排第二轮打卡" : "按体力选择夜景、咖啡或回酒店整理照片" }
        ],
        backup: "雨天或临时疲惫时，替换为：" + backup.name + "。"
      });
    }

    return {
      city: city,
      scoredCity: scoredCity,
      days: planDays,
      budgetEstimate: {
        localDaily: city.dailyBudget,
        totalLocal: city.dailyBudget * days,
        userDaily: profile.budget
      },
      guardrails: city.platformSignals.concat([
        "每天最多安排 2 个核心 POI，其余作为可选，不把旅行变成清单。",
        "地图路线以后端 POI 聚类为准，智能体不可用时仍按本地知识库生成。"
      ])
    };
  }

  function buildRouteExperiment(profile) {
    if (profile.routeGoal !== "multiCityValue") {
      return null;
    }

    var days = clamp(profile.days || 18, 14, 21);
    var budget = Number(profile.budget) || 320;
    var outbound = ROUTE_CORRIDORS[0];
    var inbound = ROUTE_CORRIDORS[1];
    var history = ROUTE_CORRIDORS[2];
    var primaryNodes = [
      { city: "茂名", stay: 0.5, role: "出发校准", reason: "第一天只做出发和票务缓冲，不急着塞景点。", transport: "茂名到广州，优先白天到达。" },
      { city: "广州", stay: 1, role: "华南枢纽", reason: "用广州接入北上主线，早茶/老城轻量体验即可。", transport: "广州南或广州站按票价选择。" },
      { city: "长沙", stay: 2, role: "低预算高密度", reason: "餐饮、夜游和城市体验密度高，适合作为第一段兴奋点。", transport: "广州到长沙，高铁成熟。" },
      { city: "武汉", stay: 2, role: "江城中段", reason: "江滩、博物馆、街区都有，雨天也能调整。", transport: "长沙到武汉，车次密集。" },
      { city: "郑州/洛阳", stay: 2, role: "历史补强", reason: "郑州负责换乘，洛阳负责记忆点，别只为了中转而中转。", transport: "武汉北上接河南段。" },
      { city: "北京", stay: 4, role: "主目的地", reason: "把预约型景点集中处理，住宿尽量选地铁外圈但不牺牲通勤。", transport: "河南到北京，预留半天机动。" },
      { city: "济南", stay: days >= 19 ? 1 : 0.5, role: "返程缓冲", reason: "把北京离开后的第一段拆短，防止返程开头过累。", transport: "北京到济南短距离高铁。" },
      { city: "南京", stay: 2, role: "历史城市", reason: "博物馆、老城和夜游密度稳定，性价比高于一线城市深住。", transport: "济南到南京，走东线回撤。" },
      { city: "苏州/杭州", stay: days >= 19 ? 2 : 1.5, role: "江南审美", reason: "二选一深玩更稳；预算紧时优先苏州外圈或杭州地铁边。", transport: "南京到苏杭，短交通。" },
      { city: "泉州/厦门", stay: days >= 18 ? 1.5 : 1, role: "闽南收尾", reason: "泉州更省更有在地感，厦门更轻松但旺季贵。", transport: "江南南下福建，按票价二选一。" },
      { city: "广州", stay: 0.5, role: "回程枢纽", reason: "回茂名前只做补给和换乘，不再加大景点。", transport: "福建回广东后返茂名。" },
      { city: "茂名", stay: 0, role: "结束", reason: "最后一天收束，不把疲劳带回去。", transport: "广州回茂名。" }
    ];
    var routeKnowledge = DATA.cityIntelligence && DATA.cityIntelligence.routeNodes ? DATA.cityIntelligence.routeNodes : [];
    primaryNodes = primaryNodes.map(function (node) {
      var matched = routeKnowledge.find(function (item) {
        return item.city === node.city || node.city.indexOf(item.city) >= 0 || item.city.indexOf(node.city) >= 0;
      });
      return matched ? Object.assign({}, node, {
        value: matched.value,
        efficiency: matched.efficiency,
        cost: matched.cost,
        fatigue: matched.fatigue,
        proof: matched.proof,
        mapQuery: matched.mapQuery
      }) : node;
    });

    var totalDays = round(primaryNodes.reduce(function (sum, node) {
      return sum + node.stay;
    }, 0), 1);

    if (totalDays > days + 1) {
      primaryNodes = primaryNodes.filter(function (node) {
        return node.city !== "济南";
      });
      totalDays = round(primaryNodes.reduce(function (sum, node) {
        return sum + node.stay;
      }, 0), 1);
    }

    return {
      title: "推荐：中轴北上 + 东线返程，不走回头路",
      summary: "这个用户的关键不是“北京玩什么”，而是把去北京和回茂名之间的长距离变成两条可玩的城市走廊。主方案控制在 " + totalDays + " 天左右，保留 1-2 天给抢票、天气和临时删减。",
      origin: profile.origin || "茂名",
      destination: profile.destination || "北京",
      totalDays: totalDays,
      budgetModel: {
        daily: budget,
        localSpend: Math.round(totalDays * budget),
        intercityRange: budget <= 340 ? "约 1800-2600 元" : "约 2200-3200 元",
        hotelStrategy: "北京、杭州、厦门不住景区核心；长沙、武汉、南京用地铁边住宿拉低均价。"
      },
      primary: {
        name: "18 天高性价比推荐版",
        valueScore: 92,
        efficiencyScore: 88,
        nodes: primaryNodes,
        mapUrl: API ? API.baiduPlaceUrl("茂名 广州 长沙 武汉 郑州 洛阳 北京 济南 南京 苏州 杭州 泉州 厦门 广州", "中国") : "#"
      },
      alternatives: [
        {
          name: outbound.name,
          score: outbound.valueScore,
          summary: outbound.summary,
          useWhen: "只有 12-14 天，或返程想直接飞/高铁回广东。"
        },
        {
          name: inbound.name,
          score: inbound.valueScore,
          summary: inbound.summary,
          useWhen: "已经确定到北京，主要想让返程也有内容。"
        },
        {
          name: history.name,
          score: history.valueScore,
          summary: history.summary,
          useWhen: "更偏博物馆、古都和历史审美，能接受更累。"
        }
      ],
      redFlags: [
        "18 天以内别把西安、苏杭、厦门全部深玩，否则交通和收拾行李会吞掉体验。",
        "北京住宿和预约是最大风险，先锁北京段，再倒推前后城市。",
        "预算日均 320 元时，泉州通常比厦门更稳；杭州旺季可换苏州。",
        "如果连续两段车程超过 5 小时，中间城市必须降级为短停，不要硬塞景点。"
      ],
      cutPlan: [
        "14-15 天：删济南、删闽南，走茂名-广州-长沙-武汉-洛阳-北京-南京-广州-茂名。",
        "16-18 天：保留南京和闽南，苏杭二选一。",
        "20-21 天：可把泉州和厦门拆开，或把洛阳单独住满 2 天。"
      ]
    };
  }

  function renderPlan(plan) {
    renderTraits(plan.vector);
    renderInsights(plan.insights);
    renderPersona(plan);
    renderPersonaAtlas(plan.persona.id);
    renderCities(plan.cities);
    renderMatrix(plan);
    renderJournalMemory(plan.journalMemory);
    renderDemoOutput(plan);
    renderRouteExperiment(plan.routeExperiment);
    var selected = plan.cities.find(function (item) {
      return item.city.id === state.selectedCityId;
    }) || plan.cities[0];
    renderItinerary(buildItinerary(plan.profile, selected.city, selected));
    renderMap(selected.city);
  }

  function renderInitialTraits() {
    var initial = {};
    Object.keys(DATA.traitLabels).forEach(function (key) {
      initial[key] = 0.5;
    });
    renderTraits(initial);
    renderInsights(["等待用户输入后，系统会展示人格向量、约束冲突和推荐依据。"]);
    renderMatrix(null);
    renderEmptyMap();
  }

  function renderTraits(vector) {
    $("#traitStack").innerHTML = Object.keys(DATA.traitLabels).map(function (key) {
      var val = Math.round((vector[key] || 0.5) * 100);
      return '<div class="trait-row"><span>' + DATA.traitLabels[key] + '</span><div class="bar"><span style="width:' + val + '%"></span></div><strong>' + val + '</strong></div>';
    }).join("");
  }

  function renderInsights(insights) {
    $("#insightList").innerHTML = insights.map(function (item) {
      return "<p>" + escapeHtml(item) + "</p>";
    }).join("");
  }

  function renderPersona(plan) {
    var interestText = plan.profile.interests.length ? plan.profile.interests.map(function (item) { return INTEREST_LABELS[item]; }).join(" / ") : "未指定场景";
    var avoidText = plan.profile.avoid.length ? plan.profile.avoid.map(function (item) { return AVOID_LABELS[item]; }).join(" / ") : "无明确避雷";
    var journalText = plan.journalMemory && plan.journalMemory.entryCount ? plan.journalMemory.entryCount + " 条手账已进入画像" : "暂无手账记忆";
    var visual = PERSONA_VISUALS[plan.persona.id] || PERSONA_VISUALS.quiet_restore;
    var growth = plan.growthProfile || { stage: "冷启动", confidence: plan.confidence, confidenceParts: [], nextDataNeeded: [] };
    var tensions = plan.personaTensions || [];

    $("#personaSummary").innerHTML =
      '<div class="persona-hero">' +
      '<img src="' + visual.image + '" alt="' + escapeHtml(plan.persona.name) + '抽象图谱">' +
      '<div><p class="eyebrow">Persona result</p>' +
      "<h3>" + escapeHtml(plan.persona.name) + "</h3>" +
      '<strong style="--persona-accent:' + visual.accent + '">' + escapeHtml(visual.archetype) + '</strong></div>' +
      '</div>' +
      "<p>" + escapeHtml(plan.persona.summary) + "</p>" +
      '<p class="persona-scene">' + escapeHtml(visual.scene) + '</p>' +
      '<p class="persona-grammar">' + escapeHtml(visual.grammar) + '</p>' +
      renderVisualSignals(visual.signals) +
      '<span class="confidence">分析置信度 ' + Math.round(plan.confidence * 100) + "%</span>" +
      renderPersonaBlend(plan.persona) +
      '<div class="persona-growth-mini">' +
      '<strong>' + escapeHtml(growth.stage) + '</strong>' +
      '<p>' + escapeHtml(growth.readableSummary || "系统会在旅行中继续校准你的偏好。") + '</p>' +
      '</div>' +
      (tensions.length ? '<div class="persona-tensions"><h4>偏好冲突</h4>' + tensions.slice(0, 3).map(function (item) {
        return '<p><strong>' + escapeHtml(item.title) + '</strong><span>' + escapeHtml(item.action) + '</span></p>';
      }).join("") + '</div>' : '') +
      '<div class="evidence-list">' +
      "<span>动机：" + escapeHtml(plan.profile.moodLabel) + "</span>" +
      "<span>场景：" + escapeHtml(interestText) + "</span>" +
      "<span>避雷：" + escapeHtml(avoidText) + "</span>" +
      "<span>手账：" + escapeHtml(journalText) + "</span>" +
      "<span>链路：本地引擎已完成，智能体可选增强</span>" +
      "</div>";
  }

  function renderPersonaBlend(persona) {
    if (!persona || !persona.alternates || !persona.alternates.length) {
      return "";
    }

    return '<div class="persona-blend"><h4>画像分布</h4>' +
      persona.alternates.slice(0, 4).map(function (item) {
        var value = Math.round(clamp(item.score, 0, 1) * 100);
        return '<div><span>' + escapeHtml(item.name) + '<em>' + value + '</em></span><i style="width:' + value + '%"></i></div>';
      }).join("") +
      (persona.secondary ? '<p>次级画像：' + escapeHtml(persona.secondary.name) + ' · 差值 ' + Math.round((persona.confidenceMargin || 0) * 100) + '</p>' : '') +
      '</div>';
  }

  function renderPersonaAtlas(activePersonaId) {
    var gallery = $("#personaGallery");
    if (!gallery) {
      return;
    }

    gallery.innerHTML = DATA.personas.map(function (persona) {
      var visual = PERSONA_VISUALS[persona.id] || PERSONA_VISUALS.quiet_restore;
      var isActive = activePersonaId === persona.id;
      return '<article class="persona-card ' + (isActive ? 'is-active' : '') + '" style="--persona-accent:' + visual.accent + '">' +
        '<div class="persona-card-image"><img src="' + visual.image + '" alt="' + escapeHtml(persona.name) + '抽象图谱"></div>' +
        '<div class="persona-card-copy">' +
        '<p class="eyebrow">' + (isActive ? 'Current persona' : 'Travel persona') + '</p>' +
        '<h3>' + escapeHtml(persona.name) + '</h3>' +
        '<strong>' + escapeHtml(visual.archetype) + '</strong>' +
        '<p>' + escapeHtml(persona.summary) + '</p>' +
        '<p class="visual-grammar">' + escapeHtml(visual.grammar) + '</p>' +
        renderVisualSignals(visual.signals) +
        '<span>' + escapeHtml(visual.cue) + '</span>' +
        '</div>' +
        '</article>';
    }).join("");
  }

  function renderCities(cities) {
    var container = $("#cityResults");
    var template = $("#cityCardTemplate");
    container.innerHTML = "";

    cities.forEach(function (item, index) {
      var node = template.content.firstElementChild.cloneNode(true);
      node.classList.toggle("is-active", item.city.id === state.selectedCityId);
      $(".rank", node).textContent = "0" + (index + 1);
      $("h3", node).textContent = item.city.name;
      $(".city-meta", node).textContent = item.city.province + " · 日均约 " + item.city.dailyBudget + " 元 · 建议 " + item.city.minDays + "-" + item.city.maxDays + " 天";
      $(".score", node).textContent = item.matchPercent + "%";
      $(".city-reason", node).textContent = item.reason;
      $(".tag-row", node).innerHTML = item.city.bestFor.map(function (tag) { return "<span>" + escapeHtml(tag) + "</span>"; }).join("");
      $(".best-fit", node).textContent = item.bestFit;
      $(".watch-out", node).textContent = item.watchOut;
      $(".map-link", node).href = item.mapUrl;
      $(".select-city", node).addEventListener("click", function () {
        state.selectedCityId = item.city.id;
        renderPlan(state.plan);
        document.getElementById("itineraryTitle").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      container.appendChild(node);
    });
  }

  function renderMatrix(plan) {
    var board = $("#matrixBoard");
    if (!board) {
      return;
    }

    if (!plan) {
      board.innerHTML = '<p class="empty-state">生成推荐后，这里会展开 Top 目的地的维度评分和权衡关系。</p>';
      return;
    }

    var audit = plan.decisionAudit || buildDecisionAudit(plan.profile, plan.vector, plan.persona, plan.cities, plan.routeExperiment, plan.personaTensions, plan.growthProfile);
    var routeRows = audit.routeRows || [];

    board.innerHTML =
      '<article class="audit-hero">' +
      '<div><p class="eyebrow">Decision evidence</p><h3>' + escapeHtml(audit.title) + '</h3><p>' + escapeHtml(audit.subtitle) + '</p></div>' +
      '<div class="audit-constraint-list">' + audit.constraints.map(function (item) {
        return '<span><b>' + escapeHtml(item.label) + '</b>' + escapeHtml(item.value) + '</span>';
      }).join("") + '</div>' +
      '</article>' +
      '<div class="audit-city-grid">' + audit.cityRows.map(function (row) {
        return '<article class="audit-city-card">' +
          '<div class="audit-city-head"><span>' + escapeHtml(row.decision) + '</span><h3>' + escapeHtml(row.city) + '</h3><strong>' + row.score + '%</strong></div>' +
          '<p>' + escapeHtml(row.reason) + '</p>' +
          '<div class="audit-metrics">' + row.metrics.map(renderAuditMetric).join("") + '</div>' +
          '<div class="audit-evidence"><h4>可用证据</h4>' + row.evidence.map(function (item) {
            return '<span>' + escapeHtml(item) + '</span>';
          }).join("") + '</div>' +
          '<div class="audit-warning"><b>降权条件</b><span>' + escapeHtml(row.downgradeIf) + '</span></div>' +
        '</article>';
      }).join("") + '</div>' +
      (routeRows.length ? '<article class="audit-route-panel"><div class="audit-route-head"><h3>路线节点证据</h3><p>用价值、效率、成本和疲劳四个维度判断该停、深玩还是删掉。</p></div><div class="audit-route-grid">' + routeRows.map(function (node) {
        return '<div class="audit-route-row">' +
          '<div><strong>' + escapeHtml(node.city) + '</strong><span>' + escapeHtml(node.role) + ' · ' + node.stay + ' 天</span></div>' +
          '<div class="route-mini-meters">' +
          '<span>值<i style="width:' + node.value + '%"></i><em>' + node.value + '</em></span>' +
          '<span>效<i style="width:' + node.efficiency + '%"></i><em>' + node.efficiency + '</em></span>' +
          '<span>省<i style="width:' + node.cost + '%"></i><em>' + node.cost + '</em></span>' +
          '<span>累<i style="width:' + node.fatigue + '%"></i><em>' + node.fatigue + '</em></span>' +
          '</div>' +
          '<p>' + escapeHtml(node.proof) + '</p>' +
          '</div>';
      }).join("") + '</div></article>' : '') +
      (audit.tensions.length ? '<article class="audit-tension-panel"><h3>画像冲突处理</h3>' + audit.tensions.map(function (item) {
        return '<div class="audit-tension"><strong>' + escapeHtml(item.title) + '</strong><p>' + escapeHtml(item.detail) + '</p><span>' + escapeHtml(item.action) + '</span></div>';
      }).join("") + '</article>' : '');
  }

  function renderAuditMetric(metric) {
    var value = formatScore(metric.value);
    return '<div class="audit-metric">' +
      '<span><b>' + escapeHtml(metric.label) + '</b><em>' + value + '</em></span>' +
      '<i style="width:' + value + '%"></i>' +
      '<small>' + escapeHtml(metric.note || "") + '</small>' +
      '</div>';
  }

  function renderJournalMemory(memory) {
    var box = $("#journalMemory");
    if (!box) {
      return;
    }

    var model = memory || buildJournalMemory(state.journalEntries);
    if (!model.entryCount) {
      box.innerHTML = '<p class="empty-state">还没有手账记录。添加一条后，系统会显示画像漂移、证据链和下一次推荐会怎么改变。</p>';
      return;
    }

    var topDeltas = model.topDeltas.length ? model.topDeltas : Object.keys(DATA.traitLabels).slice(0, 4).map(function (key) {
      return { key: key, value: 0 };
    });

    box.innerHTML =
      '<div class="journal-head">' +
      '<div><p class="eyebrow">Memory model</p><h3>画像成长中</h3><p>' + model.entryCount + ' 条手账已进入人格记忆，当前置信度 ' + Math.round(model.confidence * 100) + '%。</p></div>' +
      '<span class="journal-badge">本地可运行</span>' +
      '</div>' +
      '<div class="journal-deltas">' +
      topDeltas.map(function (item) {
        var value = Math.round(Math.abs(item.value) * 100);
        var label = DATA.traitLabels[item.key] || item.key;
        var direction = item.value >= 0 ? "增强" : "降低";
        return '<div class="journal-delta ' + (item.value < 0 ? 'is-negative' : '') + '">' +
          '<span>' + escapeHtml(label) + '<em>' + direction + ' ' + value + '</em></span>' +
          '<i style="width:' + clamp(value * 3, 8, 100) + '%"></i>' +
          '</div>';
      }).join("") +
      '</div>' +
      '<div class="journal-grid">' +
      '<article><h4>证据链</h4>' + (model.evidence.length ? model.evidence.map(function (item) {
        return '<p><strong>' + escapeHtml(item.city) + '</strong>' + escapeHtml(item.note) + '</p>';
      }).join("") : '<p>暂无文本证据。</p>') + '</article>' +
      '<article><h4>偏好矛盾</h4>' + (model.contradictions.length ? '<ul>' + model.contradictions.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join("") + '</ul>' : '<p>暂未发现明显矛盾，继续记录会更准。</p>') + '</article>' +
      '<article><h4>下次会怎么变</h4>' + (model.nextRules.length ? '<ul>' + model.nextRules.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join("") + '</ul>' : '<p>记录量还少，先保持问卷和手账等权。</p>') + '</article>' +
      '</div>';
  }

  function buildGrowthDemoModel() {
    var demo = DEMO_PROFILES.find(function (item) {
      return item.id === "maomingBeijingLoop";
    }) || DEMO_PROFILES[0];
    var coldProfile = JSON.parse(JSON.stringify(demo.profile));
    coldProfile.journalEntries = [];
    coldProfile.journalMemory = buildJournalMemory([]);

    var journalEntries = JOURNAL_DEMO_ENTRIES.map(function (entry) {
      return Object.assign({ id: "growth_" + entry.city }, entry);
    });
    var learnedProfile = JSON.parse(JSON.stringify(demo.profile));
    learnedProfile.journalEntries = journalEntries;
    learnedProfile.journalMemory = buildJournalMemory(journalEntries);

    var coldPlan = buildLocalPlan(coldProfile);
    var learnedPlan = buildLocalPlan(learnedProfile);
    var stage = state.growthDemoStage || 0;
    var activePlan = stage === 0 ? coldPlan : learnedPlan;
    var nextTop = learnedPlan.cities[0];
    var route = learnedPlan.routeExperiment;

    return {
      stage: stage,
      coldPlan: coldPlan,
      learnedPlan: learnedPlan,
      activePlan: activePlan,
      journalEntries: journalEntries,
      nextTop: nextTop,
      route: route,
      steps: [
        {
          title: "冷启动",
          note: "只知道用户从茂名去北京、想高性价比多玩城市，系统先生成可解释的保守路线。",
          plan: coldPlan
        },
        {
          title: "手账校准",
          note: "写入长沙、武汉、北京三条记录后，系统开始识别拥挤、早起和长交通的真实消耗。",
          plan: learnedPlan
        },
        {
          title: "下一次推荐",
          note: "推荐不再只追城市数量，而是自动减少硬赶、提高错峰和缓冲权重。",
          plan: learnedPlan
        }
      ]
    };
  }

  function renderGrowthDemo() {
    var box = $("#growthDemoBoard");
    if (!box) {
      return;
    }

    var model = buildGrowthDemoModel();
    var active = model.activePlan;
    var learned = model.learnedPlan;
    var growth = active.growthProfile;
    var journal = learned.journalMemory;
    var route = model.route;

    $all("[data-growth-stage]").forEach(function (button) {
      button.classList.toggle("is-selected", parseInt(button.dataset.growthStage, 10) === model.stage);
    });

    box.innerHTML =
      '<div class="growth-stage-strip">' + model.steps.map(function (step, index) {
        var plan = step.plan;
        return '<button type="button" class="' + (model.stage === index ? 'is-active' : '') + '" data-growth-card="' + index + '">' +
          '<span>0' + (index + 1) + '</span><strong>' + escapeHtml(step.title) + '</strong><small>' + Math.round(plan.confidence * 100) + '% 置信</small>' +
          '</button>';
      }).join("") + '</div>' +
      '<div class="growth-board-grid">' +
      '<article class="growth-main-card">' +
      '<p class="eyebrow">User growth demo</p>' +
      '<h3>茂名出发去北京，返程未知，想两三周最高性价比多玩城市</h3>' +
      '<p>' + escapeHtml(model.steps[model.stage].note) + '</p>' +
      '<div class="growth-kpis">' +
      '<span><b>' + escapeHtml(growth.stage) + '</b>画像阶段</span>' +
      '<span><b>' + Math.round(growth.confidence * 100) + '%</b>成长置信</span>' +
      '<span><b>' + journal.entryCount + '</b>条手账样本</span>' +
      '<span><b>' + (route ? route.totalDays : 0) + '</b>天路线</span>' +
      '</div>' +
      '<div class="growth-confidence">' + growth.confidenceParts.map(function (part) {
        return '<div><span>' + escapeHtml(part.label) + '<em>' + formatScore(part.value) + '</em></span><i style="width:' + formatScore(part.value) + '%"></i></div>';
      }).join("") + '</div>' +
      '</article>' +
      '<article class="growth-memory-card">' +
      '<h3>手账如何改变画像</h3>' +
      (journal.topDeltas || []).slice(0, 5).map(function (item) {
        var value = Math.round(Math.abs(item.value) * 100);
        return '<div class="growth-delta ' + (item.value < 0 ? 'is-negative' : '') + '"><span>' + escapeHtml(DATA.traitLabels[item.key] || item.key) + '<em>' + (item.value >= 0 ? "+" : "-") + value + '</em></span><i style="width:' + clamp(value * 3, 10, 100) + '%"></i></div>';
      }).join("") +
      '<div class="growth-notes">' + (journal.contradictions || []).slice(0, 3).map(function (item) {
        return '<p>' + escapeHtml(item) + '</p>';
      }).join("") + '</div>' +
      '</article>' +
      '<article class="growth-recommend-card">' +
      '<h3>成长后的推荐动作</h3>' +
      '<div class="growth-next-city"><strong>' + escapeHtml(model.nextTop.city.name) + '</strong><span>' + model.nextTop.matchPercent + '%</span></div>' +
      '<p>' + escapeHtml(model.nextTop.reason) + '</p>' +
      '<ul>' + growth.nextDataNeeded.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join("") + '</ul>' +
      '</article>' +
      '</div>';

    $all("[data-growth-card]", box).forEach(function (button) {
      button.addEventListener("click", function () {
        state.growthDemoStage = parseInt(button.dataset.growthCard, 10) || 0;
        renderGrowthDemo();
      });
    });
  }

  function renderDemoOutput(plan) {
    var box = $("#demoOutput");
    if (!box) {
      return;
    }

    if (!plan) {
      box.innerHTML = '<p class="empty-state">选择一个 demo 后，会同步填写表单、生成画像、推荐和行程。</p>';
      return;
    }

    var active = DEMO_PROFILES.find(function (demo) {
      return demo.id === state.activeDemo;
    });
    var title = active ? active.name : "当前用户";
    var top = plan.cities[0];
    var visual = PERSONA_VISUALS[plan.persona.id] || PERSONA_VISUALS.quiet_restore;

    box.innerHTML =
      '<p class="eyebrow">Demo result</p>' +
      '<div class="demo-persona-visual">' +
      '<img src="' + visual.image + '" alt="' + escapeHtml(plan.persona.name) + '抽象图谱">' +
      '<div><h3>' + escapeHtml(title) + ' · ' + escapeHtml(plan.persona.name) + '</h3>' +
      '<strong>' + escapeHtml(visual.archetype) + '</strong></div>' +
      '</div>' +
      '<p>' + escapeHtml(plan.persona.summary) + '</p>' +
      '<p class="visual-grammar">' + escapeHtml(visual.grammar) + '</p>' +
      renderVisualSignals(visual.signals) +
      '<div class="demo-stats">' +
      '<span>Top 1：' + escapeHtml(top.city.name) + '</span>' +
      '<span>匹配度：' + top.matchPercent + '%</span>' +
      '<span>行程：' + plan.selectedItinerary.days.length + ' 天</span>' +
      '<span>模式：本地完整链条</span>' +
      '</div>';
  }

  function renderVisualSignals(signals) {
    var labels = [
      { key: "open", label: "开放度" },
      { key: "density", label: "密度" },
      { key: "pace", label: "节奏" },
      { key: "structure", label: "结构" }
    ];

    return '<div class="visual-signals">' + labels.map(function (item) {
      var value = signals && typeof signals[item.key] === "number" ? signals[item.key] : 50;
      return '<span><b>' + escapeHtml(item.label) + '</b><i style="width:' + value + '%"></i><em>' + value + '</em></span>';
    }).join("") + '</div>';
  }

  function renderRouteExperiment(route) {
    var board = $("#routeBoard");
    if (!board) {
      return;
    }

    if (!route) {
      board.innerHTML = '<p class="empty-state">选择“茂名北上多城”Demo 后，这里会生成两三周多城路线、删减策略、预算逻辑和踩雷提醒。</p>';
      return;
    }

    board.innerHTML =
      '<div class="route-summary">' +
      '<div><p class="eyebrow">Primary route</p><h3>' + escapeHtml(route.title) + '</h3><p>' + escapeHtml(route.summary) + '</p></div>' +
      '<div class="route-kpis">' +
      '<span><b>' + route.totalDays + '</b>天左右</span>' +
      '<span><b>' + route.primary.valueScore + '</b>性价比分</span>' +
      '<span><b>' + route.primary.efficiencyScore + '</b>效率分</span>' +
      '</div>' +
      '</div>' +
      '<div class="route-timeline">' +
      route.primary.nodes.map(function (node, index) {
        return '<article class="route-node">' +
          '<span class="route-index">' + String(index + 1).padStart(2, "0") + '</span>' +
          '<div><h4>' + escapeHtml(node.city) + '<em>' + node.stay + ' 天</em></h4>' +
          '<strong>' + escapeHtml(node.role) + '</strong>' +
          '<p>' + escapeHtml(node.reason) + '</p>' +
          '<div class="route-node-metrics">' +
          '<span>值 ' + (node.value || 72) + '</span>' +
          '<span>效 ' + (node.efficiency || 70) + '</span>' +
          '<span>省 ' + (node.cost || 68) + '</span>' +
          '<span>累 ' + (node.fatigue || 45) + '</span>' +
          '</div>' +
          (node.proof ? '<p class="route-proof">' + escapeHtml(node.proof) + '</p>' : '') +
          '<small>' + escapeHtml(node.transport) + '</small></div>' +
          '</article>';
      }).join("") +
      '</div>' +
      '<div class="route-details">' +
      '<article><h3>预算模型</h3><p>本地消费约 ' + route.budgetModel.localSpend + ' 元，跨城交通 ' + escapeHtml(route.budgetModel.intercityRange) + '。</p><p>' + escapeHtml(route.budgetModel.hotelStrategy) + '</p><a class="map-link" href="' + route.primary.mapUrl + '" target="_blank" rel="noreferrer">百度地图查走廊</a></article>' +
      '<article><h3>备选路线</h3>' + route.alternatives.map(function (item) {
        return '<div class="route-alt"><strong>' + escapeHtml(item.name) + '<span>' + item.score + '</span></strong><p>' + escapeHtml(item.summary) + '</p><small>' + escapeHtml(item.useWhen) + '</small></div>';
      }).join("") + '</article>' +
      '<article><h3>删减策略</h3><ul>' + route.cutPlan.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join("") + '</ul></article>' +
      '<article><h3>踩雷过滤</h3><ul>' + route.redFlags.map(function (item) {
        return '<li>' + escapeHtml(item) + '</li>';
      }).join("") + '</ul></article>' +
      '</div>';
  }

  function renderItinerary(itinerary) {
    var board = $("#itineraryBoard");
    state.plan.selectedItinerary = itinerary;

    board.innerHTML =
      '<div class="itinerary-title">' +
      "<div><p class=\"eyebrow\">Selected city</p><h3>" + itinerary.city.name + " · " + itinerary.days.length + " 天计划</h3></div>" +
      "<strong>本地消费约 " + itinerary.budgetEstimate.totalLocal + " 元</strong>" +
      "</div>" +
      '<div class="day-grid">' +
      itinerary.days.map(renderDay).join("") +
      "</div>" +
      '<div class="guardrail">' + escapeHtml(itinerary.guardrails[0]) + "；" + escapeHtml(itinerary.guardrails[1]) + "</div>";
  }

  function renderDay(day) {
    return '<article class="day-card">' +
      "<h4>D" + day.day + " · " + escapeHtml(day.title) + "</h4>" +
      '<div class="timeline">' +
      day.slots.map(function (slot) {
        return '<div class="slot"><time>' + slot.time + '</time><span>' + escapeHtml(slot.text) + '</span></div>';
      }).join("") +
      "</div>" +
      '<div class="guardrail">' + escapeHtml(day.backup) + "</div>" +
      "</article>";
  }

  function renderEmptyMap() {
    $("#mapCanvas").innerHTML = '<div class="map-empty"><strong>地图待生成</strong><span>推荐完成后显示城市、POI 和路线入口。</span></div>';
    $("#mapList").innerHTML = "";
  }

  function renderMap(city) {
    var canvas = $("#mapCanvas");
    var list = $("#mapList");
    var positions = [
      { left: 12, top: 18 },
      { left: 54, top: 16 },
      { left: 30, top: 42 },
      { left: 68, top: 48 },
      { left: 18, top: 70 }
    ];

    canvas.innerHTML = '<div class="map-city"><p class="eyebrow">Baidu map preview</p><h3>' + city.name + '</h3><p>' + city.stayZone + '</p></div>';

    city.pois.slice(0, 5).forEach(function (poi, index) {
      var pin = document.createElement("a");
      var pos = positions[index] || { left: 45, top: 50 };
      pin.className = "map-pin";
      pin.href = API ? API.baiduMarkerUrl(poi, city.name) : "#";
      pin.target = "_blank";
      pin.rel = "noreferrer";
      pin.style.left = pos.left + "%";
      pin.style.top = pos.top + "%";
      pin.innerHTML = "<strong>" + escapeHtml(poi.name) + "</strong><span>" + escapeHtml(poi.type) + " · " + poi.duration + "min</span>";
      canvas.appendChild(pin);
    });

    list.innerHTML = city.pois.slice(0, 5).map(function (poi) {
      var href = API ? API.baiduMarkerUrl(poi, city.name) : "#";
      return '<a href="' + href + '" target="_blank" rel="noreferrer"><strong>' + escapeHtml(poi.name) + '</strong><span>' + escapeHtml(poi.zone) + " · " + escapeHtml(poi.tip) + "</span></a>";
    }).join("");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
