(function () {
  "use strict";

  window.TRAVEL_PERSONA_DATA = {
    version: "2026.07-persona16-commercial-fallback",
    traitLabels: {
      restoration: "恢复需求",
      nature: "自然偏好",
      culture: "文化深度",
      food: "烟火美食",
      pace: "行动节奏",
      social: "社交密度",
      budget: "预算弹性",
      aesthetics: "审美出片",
      comfort: "舒适安全",
      novelty: "新鲜探索",
      transit: "交通确定",
      lowCrowd: "低拥挤度",
      authenticity: "在地真实感",
      weatherFlex: "天气容错",
      bookingEase: "预约轻量",
      workation: "试住办公"
    },
    personas: [
      {
        id: "quiet_restore",
        name: "安静恢复型",
        summary: "你不是不想玩，而是需要一个不会持续消耗你的地方。好的行程应该留出空白、散步和随时撤退的余地。",
        match: { restoration: 0.86, nature: 0.68, culture: 0.44, food: 0.34, pace: 0.24, social: 0.20, budget: 0.46, aesthetics: 0.50, comfort: 0.78, novelty: 0.36, transit: 0.60, lowCrowd: 0.86, authenticity: 0.54, weatherFlex: 0.64, bookingEase: 0.72, workation: 0.42 }
      },
      {
        id: "city_spark",
        name: "城市电量型",
        summary: "你会从街区、夜生活、好吃的和人与人的连接里充电。行程需要密度，但不能只有排队和打卡。",
        match: { restoration: 0.34, nature: 0.24, culture: 0.52, food: 0.82, pace: 0.72, social: 0.82, budget: 0.48, aesthetics: 0.58, comfort: 0.50, novelty: 0.68, transit: 0.66, lowCrowd: 0.30, authenticity: 0.58, weatherFlex: 0.46, bookingEase: 0.42, workation: 0.20 }
      },
      {
        id: "aesthetic_collector",
        name: "审美采样型",
        summary: "你对空间、光线、建筑和展览很敏感。目的地不只要好玩，还要能带回风格和灵感。",
        match: { restoration: 0.48, nature: 0.42, culture: 0.72, food: 0.40, pace: 0.48, social: 0.42, budget: 0.50, aesthetics: 0.90, comfort: 0.58, novelty: 0.66, transit: 0.62, lowCrowd: 0.56, authenticity: 0.60, weatherFlex: 0.62, bookingEase: 0.54, workation: 0.36 }
      },
      {
        id: "slow_nomad",
        name: "松弛试住型",
        summary: "你适合把旅行当成短暂生活实验：找一个能住下来、能办公、能重复散步的城市。",
        match: { restoration: 0.74, nature: 0.56, culture: 0.50, food: 0.42, pace: 0.26, social: 0.34, budget: 0.56, aesthetics: 0.52, comfort: 0.76, novelty: 0.48, transit: 0.58, lowCrowd: 0.70, authenticity: 0.68, weatherFlex: 0.70, bookingEase: 0.68, workation: 0.82 }
      },
      {
        id: "heritage_drifter",
        name: "街巷考古型",
        summary: "你会被城市肌理、地方故事和老街生活吸引。比起热门机位，你更在意这个地方有没有自己的纹理。",
        match: { restoration: 0.50, nature: 0.34, culture: 0.90, food: 0.58, pace: 0.42, social: 0.36, budget: 0.44, aesthetics: 0.64, comfort: 0.50, novelty: 0.74, transit: 0.54, lowCrowd: 0.58, authenticity: 0.88, weatherFlex: 0.54, bookingEase: 0.44, workation: 0.28 }
      },
      {
        id: "efficient_hunter",
        name: "路径编排型",
        summary: "你会本能地整理交通、停留和取舍。真正适合你的不是塞满城市，而是减少无意义移动，让有限时间都花在值得的地方。",
        match: { restoration: 0.26, nature: 0.32, culture: 0.60, food: 0.54, pace: 0.88, social: 0.52, budget: 0.58, aesthetics: 0.58, comfort: 0.68, novelty: 0.56, transit: 0.90, lowCrowd: 0.42, authenticity: 0.44, weatherFlex: 0.62, bookingEase: 0.86, workation: 0.24 }
      },
      {
        id: "wild_calibrator",
        name: "自然校准型",
        summary: "你需要通过山海、风、树和水把身体状态调回来。路线可以有探索，但必须给自然和低噪音留出主位。",
        match: { restoration: 0.78, nature: 0.92, culture: 0.36, food: 0.32, pace: 0.38, social: 0.24, budget: 0.48, aesthetics: 0.62, comfort: 0.58, novelty: 0.58, transit: 0.50, lowCrowd: 0.82, authenticity: 0.56, weatherFlex: 0.42, bookingEase: 0.52, workation: 0.38 }
      },
      {
        id: "ritual_archivist",
        name: "仪式收藏型",
        summary: "你喜欢有仪式感的参观、预约、盖章、展陈和纪念物。旅行的满足感来自被认真整理过的记忆。",
        match: { restoration: 0.44, nature: 0.28, culture: 0.86, food: 0.34, pace: 0.50, social: 0.30, budget: 0.52, aesthetics: 0.76, comfort: 0.62, novelty: 0.60, transit: 0.64, lowCrowd: 0.62, authenticity: 0.74, weatherFlex: 0.78, bookingEase: 0.84, workation: 0.30 }
      },
      {
        id: "taste_cartographer",
        name: "味觉地图型",
        summary: "你会用吃喝理解一座城市，但真正适合你的不是排队名店，而是有路径、有区域、有替代方案的味觉地图。",
        match: { restoration: 0.38, nature: 0.22, culture: 0.50, food: 0.94, pace: 0.58, social: 0.66, budget: 0.42, aesthetics: 0.44, comfort: 0.52, novelty: 0.62, transit: 0.58, lowCrowd: 0.44, authenticity: 0.82, weatherFlex: 0.48, bookingEase: 0.36, workation: 0.18 }
      },
      {
        id: "night_flaneur",
        name: "夜行漫游型",
        summary: "你在傍晚后才真正进入城市。夜景、酒吧、晚风和街区灯光比早起打卡更能给你电量。",
        match: { restoration: 0.36, nature: 0.24, culture: 0.52, food: 0.70, pace: 0.64, social: 0.76, budget: 0.56, aesthetics: 0.72, comfort: 0.46, novelty: 0.72, transit: 0.62, lowCrowd: 0.34, authenticity: 0.60, weatherFlex: 0.50, bookingEase: 0.30, workation: 0.22 }
      },
      {
        id: "social_orbit",
        name: "关系共振型",
        summary: "你更在意和谁一起、怎么相处、有没有共同记忆。目的地要服务关系，而不是把每个人拖进打卡表。",
        match: { restoration: 0.50, nature: 0.38, culture: 0.44, food: 0.72, pace: 0.56, social: 0.92, budget: 0.50, aesthetics: 0.46, comfort: 0.72, novelty: 0.48, transit: 0.70, lowCrowd: 0.42, authenticity: 0.56, weatherFlex: 0.68, bookingEase: 0.58, workation: 0.24 }
      },
      {
        id: "comfort_navigator",
        name: "舒适导航型",
        summary: "你不是保守，而是非常清楚舒适、安全、交通确定和天气备选会决定旅行质量。",
        match: { restoration: 0.62, nature: 0.42, culture: 0.50, food: 0.48, pace: 0.42, social: 0.42, budget: 0.58, aesthetics: 0.46, comfort: 0.92, novelty: 0.34, transit: 0.88, lowCrowd: 0.66, authenticity: 0.46, weatherFlex: 0.90, bookingEase: 0.82, workation: 0.42 }
      },
      {
        id: "edge_explorer",
        name: "边界探索型",
        summary: "你想被新鲜感推着往前走，喜欢不那么标准的路线、反差城市和一点可控的不确定。",
        match: { restoration: 0.28, nature: 0.54, culture: 0.62, food: 0.58, pace: 0.76, social: 0.50, budget: 0.52, aesthetics: 0.68, comfort: 0.36, novelty: 0.94, transit: 0.46, lowCrowd: 0.48, authenticity: 0.76, weatherFlex: 0.38, bookingEase: 0.32, workation: 0.22 }
      },
      {
        id: "micro_escape",
        name: "微逃离型",
        summary: "你不一定需要远行，但需要一次低成本、低负担、能快速换气的短逃离。",
        match: { restoration: 0.76, nature: 0.62, culture: 0.40, food: 0.44, pace: 0.34, social: 0.26, budget: 0.30, aesthetics: 0.48, comfort: 0.70, novelty: 0.42, transit: 0.82, lowCrowd: 0.74, authenticity: 0.52, weatherFlex: 0.66, bookingEase: 0.78, workation: 0.24 }
      },
      {
        id: "family_anchor",
        name: "家庭锚点型",
        summary: "你需要照顾同行人的体力、兴趣差异和安全感。好路线应该有弹性、有休息点，也有共同记忆。",
        match: { restoration: 0.56, nature: 0.44, culture: 0.52, food: 0.58, pace: 0.34, social: 0.68, budget: 0.58, aesthetics: 0.42, comfort: 0.94, novelty: 0.36, transit: 0.86, lowCrowd: 0.60, authenticity: 0.46, weatherFlex: 0.88, bookingEase: 0.76, workation: 0.20 }
      },
      {
        id: "workation_weaver",
        name: "旅居编织型",
        summary: "你想把工作、生活和旅行编在一起。目的地要有稳定网络、日常半径、低压节奏和可持续消费。",
        match: { restoration: 0.66, nature: 0.48, culture: 0.48, food: 0.46, pace: 0.30, social: 0.38, budget: 0.44, aesthetics: 0.56, comfort: 0.82, novelty: 0.46, transit: 0.72, lowCrowd: 0.70, authenticity: 0.62, weatherFlex: 0.78, bookingEase: 0.72, workation: 0.94 }
      }
    ],
    cityIntelligence: {
      evidenceVersion: "2026-07-route-lab",
      cityScores: {
        quanzhou: {
          transportEase: 0.68, costStability: 0.82, poiDepth: 0.78, weatherBackup: 0.66, bookingFriction: 0.42, crowdRisk: 0.48, routeValue: 0.78, growthSignal: 0.82,
          routeRoles: ["闽南收尾", "低预算文化补强", "返程情绪缓冲"],
          whenToUse: "预算紧、想要在地街巷和文化密度时，泉州优先于厦门。",
          downgradeIf: "用户明确想要海岛度假、夜生活或极高效率商圈。",
          evidence: ["老城街巷密度高，步行可完成主体验", "商业化集中在局部街区，错峰后体验稳定", "雨天可切换博物馆和寺庙线"]
        },
        chengdu: {
          transportEase: 0.83, costStability: 0.74, poiDepth: 0.86, weatherBackup: 0.72, bookingFriction: 0.46, crowdRisk: 0.64, routeValue: 0.56, growthSignal: 0.70,
          routeRoles: ["美食恢复", "朋友局", "慢节奏中途修复"],
          whenToUse: "用户想恢复但又需要烟火气，且不执着北上主线效率。",
          downgradeIf: "路线目标是茂名到北京的高性价比闭环，成都会明显绕路。",
          evidence: ["城市公共交通成熟", "餐饮选择多，预算弹性较好", "热门商圈与熊猫基地需要错峰"]
        },
        dali: {
          transportEase: 0.55, costStability: 0.54, poiDepth: 0.74, weatherBackup: 0.52, bookingFriction: 0.52, crowdRisk: 0.68, routeValue: 0.42, growthSignal: 0.76,
          routeRoles: ["长住恢复", "自然慢游", "关系修复"],
          whenToUse: "用户明确想慢下来、试住、看自然和湖山。",
          downgradeIf: "预算低且时间有限，或路线需要高铁主干效率。",
          evidence: ["环海与古城分散，交通和住宿位置决定体验", "旺季价格波动明显", "适合独立成行，不适合塞入北上返程"]
        },
        hangzhou: {
          transportEase: 0.88, costStability: 0.58, poiDepth: 0.84, weatherBackup: 0.74, bookingFriction: 0.58, crowdRisk: 0.70, routeValue: 0.80, growthSignal: 0.74,
          routeRoles: ["江南审美", "东线返程", "展览咖啡补给"],
          whenToUse: "用户重视审美、展览、咖啡和地铁效率，且预算有余量。",
          downgradeIf: "低预算、高峰期、怕人多时，优先改苏州或南京。",
          evidence: ["西湖和核心商圈拥挤度高", "地铁覆盖好但住宿价格波动", "雨天可切换博物馆和商业体"]
        },
        xiamen: {
          transportEase: 0.76, costStability: 0.48, poiDepth: 0.72, weatherBackup: 0.62, bookingFriction: 0.55, crowdRisk: 0.72, routeValue: 0.70, growthSignal: 0.66,
          routeRoles: ["海边收尾", "轻松返程", "情侣/朋友局"],
          whenToUse: "用户想要更轻松的海边情绪，而不是最省钱文化线。",
          downgradeIf: "旺季、预算紧、怕商业化时，泉州更稳。",
          evidence: ["核心景区人流与住宿溢价明显", "适合收尾不适合承担文化主线", "沿海天气需要备选室内点"]
        },
        suzhou: {
          transportEase: 0.86, costStability: 0.72, poiDepth: 0.82, weatherBackup: 0.70, bookingFriction: 0.52, crowdRisk: 0.62, routeValue: 0.84, growthSignal: 0.78,
          routeRoles: ["江南审美", "南京后短交通", "低风险收束"],
          whenToUse: "用户喜欢审美、街巷、园林，但不想承受杭州价格波动。",
          downgradeIf: "用户更想夜生活或大城市刺激。",
          evidence: ["高铁短交通非常友好", "园林与博物馆需要预约/错峰", "外圈住宿能压低成本"]
        },
        chongqing: {
          transportEase: 0.78, costStability: 0.70, poiDepth: 0.86, weatherBackup: 0.62, bookingFriction: 0.45, crowdRisk: 0.74, routeValue: 0.54, growthSignal: 0.66,
          routeRoles: ["高密度城市体验", "夜景美食", "强刺激样本"],
          whenToUse: "用户想要高密度、夜景、美食和强城市记忆。",
          downgradeIf: "用户怕拥挤、怕爬坡、怕复杂换乘，或路线目标是北上闭环。",
          evidence: ["立体交通对体力和方向感有要求", "热门机位拥挤明显", "餐饮与夜景价值高"]
        },
        qingdao: {
          transportEase: 0.76, costStability: 0.62, poiDepth: 0.74, weatherBackup: 0.58, bookingFriction: 0.48, crowdRisk: 0.66, routeValue: 0.62, growthSignal: 0.68,
          routeRoles: ["海滨恢复", "北方慢收束", "建筑散步"],
          whenToUse: "用户想在北方路线里加入海边和建筑散步。",
          downgradeIf: "时间只有两周且需要从北京高效返茂名，青岛会增加绕行。",
          evidence: ["海滨路线受天气影响较大", "旺季住宿波动", "老城和海边适合慢行"]
        },
        shanghai: {
          transportEase: 0.95, costStability: 0.42, poiDepth: 0.92, weatherBackup: 0.86, bookingFriction: 0.58, crowdRisk: 0.72, routeValue: 0.66, growthSignal: 0.72,
          routeRoles: ["展览补给", "高效率中转", "审美采样"],
          whenToUse: "用户预算足、重视展览与城市效率。",
          downgradeIf: "最高性价比是核心目标时，上海通常只做短停或跳过。",
          evidence: ["展览与咖啡密度高", "住宿成本高且热门区域拥挤", "交通确定性强"]
        },
        changsha: {
          transportEase: 0.88, costStability: 0.86, poiDepth: 0.72, weatherBackup: 0.58, bookingFriction: 0.38, crowdRisk: 0.78, routeValue: 0.92, growthSignal: 0.70,
          routeRoles: ["北上第一兴奋点", "低预算高密度", "夜间美食"],
          whenToUse: "从华南北上、预算紧、想用低成本获得明显城市记忆。",
          downgradeIf: "用户极度怕拥挤和夜间噪音，需减少五一商圈和网红店。",
          evidence: ["广州北上高铁主线顺路", "餐饮性价比强", "热门商圈拥挤，适合错峰和街区替代"]
        },
        guangzhou: {
          transportEase: 0.96, costStability: 0.62, poiDepth: 0.80, weatherBackup: 0.78, bookingFriction: 0.34, crowdRisk: 0.66, routeValue: 0.88, growthSignal: 0.62,
          routeRoles: ["华南枢纽", "出发补给", "短停换乘"],
          whenToUse: "从茂名出发需要接入全国铁路网，广州适合短停而不是深玩。",
          downgradeIf: "用户时间很紧时，广州只做换乘，不单独占完整游玩日。",
          evidence: ["粤西进出全国铁路网络的效率高", "老城早茶和骑楼街区可做轻量体验", "核心商圈和长隆等点位不适合塞入本次长线"]
        },
        wuhan: {
          transportEase: 0.90, costStability: 0.78, poiDepth: 0.82, weatherBackup: 0.78, bookingFriction: 0.40, crowdRisk: 0.58, routeValue: 0.90, growthSignal: 0.76,
          routeRoles: ["江城中段", "雨天容错", "体力校准"],
          whenToUse: "广州到北京中段需要稳定过渡，武汉能提供博物馆、江滩和街区的切换。",
          downgradeIf: "用户只想极限压缩去程时，武汉可降级为一晚中转。",
          evidence: ["高铁枢纽位置好", "湖北省博物馆等室内点适合雨天", "江滩和老街区可按体力轻重切换"]
        },
        luoyang: {
          transportEase: 0.76, costStability: 0.74, poiDepth: 0.78, weatherBackup: 0.58, bookingFriction: 0.55, crowdRisk: 0.66, routeValue: 0.82, growthSignal: 0.82,
          routeRoles: ["历史补强", "古都记忆点", "中轴文化节点"],
          whenToUse: "用户需要历史厚度时，洛阳比单纯停郑州更有记忆点。",
          downgradeIf: "用户对石窟/古都兴趣弱，或跨城后体力明显下降。",
          evidence: ["龙门石窟等点位记忆强但需要预约和体力", "城市消费比一线更稳", "适合 1-2 天，不适合过度扩展"]
        },
        jinan: {
          transportEase: 0.82, costStability: 0.72, poiDepth: 0.62, weatherBackup: 0.56, bookingFriction: 0.34, crowdRisk: 0.48, routeValue: 0.68, growthSignal: 0.58,
          routeRoles: ["返程缓冲", "拆短车程", "可删节点"],
          whenToUse: "北京离开后需要拆短第一段，济南适合半天到一晚缓冲。",
          downgradeIf: "总天数少于 18 天时优先删除，把时间留给南京或北京。",
          evidence: ["北京南下短距离高铁方便", "城市体验轻量，不应承担主目的地", "适合防止返程开头过累"]
        },
        nanjing: {
          transportEase: 0.88, costStability: 0.74, poiDepth: 0.86, weatherBackup: 0.82, bookingFriction: 0.46, crowdRisk: 0.56, routeValue: 0.88, growthSignal: 0.82,
          routeRoles: ["东线历史城市", "返程主停点", "博物馆与老城"],
          whenToUse: "从北京东线返程时，南京比继续硬赶更能平衡文化厚度和交通效率。",
          downgradeIf: "用户已经在北京过度消耗，应减少博物馆密度，保留轻街区。",
          evidence: ["博物馆和历史街区密度高", "交通连接江南和华南稳定", "比一线城市深住更有性价比"]
        },
        beijing: {
          transportEase: 0.92, costStability: 0.44, poiDepth: 0.96, weatherBackup: 0.88, bookingFriction: 0.82, crowdRisk: 0.78, routeValue: 0.88, growthSignal: 0.86,
          routeRoles: ["主目的地", "预约型文化核心", "长线锚点"],
          whenToUse: "用户目的地明确是北京，必须先锁预约、住宿和体力缓冲。",
          downgradeIf: "用户不愿预约、不想早起、预算过低且只能短停。",
          evidence: ["故宫、国博等核心点预约强依赖", "地铁效率高但跨区通勤仍需控制", "适合把博物馆和胡同拆日，不要同日硬塞"]
        },
        shenzhen: {
          transportEase: 0.92, costStability: 0.48, poiDepth: 0.72, weatherBackup: 0.82, bookingFriction: 0.38, crowdRisk: 0.56, routeValue: 0.50, growthSignal: 0.64,
          routeRoles: ["现代城市", "设计街区", "短途补给"],
          whenToUse: "用户想要现代城市、设计街区、海边和商场室内备选。",
          downgradeIf: "用户要厚重历史、低预算或茂名到北京闭环效率。",
          evidence: ["地铁与商业配套强", "海边与城市点位分散", "住宿和餐饮成本偏高"]
        }
      },
      routeNodes: [
        { city: "茂名", role: "出发校准", stay: 0.5, value: 72, efficiency: 70, cost: 82, fatigue: 28, proof: "首日只做出发和票务缓冲，防止一开始就超载。", mapQuery: "茂名站" },
        { city: "广州", role: "华南枢纽", stay: 1, value: 84, efficiency: 96, cost: 66, fatigue: 45, proof: "把粤西接入全国铁路网，适合短停补给，不适合深玩。", mapQuery: "广州南站" },
        { city: "长沙", role: "低预算高密度", stay: 2, value: 92, efficiency: 90, cost: 88, fatigue: 58, proof: "北上顺路，餐饮夜游性价比高，但热门商圈要错峰。", mapQuery: "长沙五一广场" },
        { city: "武汉", role: "江城中段", stay: 2, value: 88, efficiency: 90, cost: 78, fatigue: 48, proof: "高铁中段稳定，博物馆、江滩、街区可互相替换。", mapQuery: "湖北省博物馆" },
        { city: "郑州/洛阳", role: "历史补强", stay: 2, value: 86, efficiency: 78, cost: 76, fatigue: 58, proof: "郑州负责换乘，洛阳负责记忆点，避免只为中转而停。", mapQuery: "洛阳龙门石窟" },
        { city: "北京", role: "主目的地", stay: 4, value: 90, efficiency: 84, cost: 48, fatigue: 70, proof: "预约型文化资源最强，但住宿和早起压力最大。", mapQuery: "故宫博物院" },
        { city: "济南", role: "返程缓冲", stay: 0.5, value: 72, efficiency: 76, cost: 72, fatigue: 36, proof: "用于拆短北京离开后的第一段，时间紧可删。", mapQuery: "济南趵突泉" },
        { city: "南京", role: "东线历史城市", stay: 2, value: 88, efficiency: 86, cost: 74, fatigue: 46, proof: "返程东线的文化厚度与交通效率都比较稳。", mapQuery: "南京博物院" },
        { city: "苏州/杭州", role: "江南审美二选一", stay: 1.5, value: 82, efficiency: 84, cost: 62, fatigue: 44, proof: "苏州更稳更省，杭州审美强但价格波动更大。", mapQuery: "苏州博物馆" },
        { city: "泉州/厦门", role: "闽南收尾", stay: 1.5, value: 80, efficiency: 70, cost: 70, fatigue: 52, proof: "泉州文化和预算更稳，厦门更轻松但旺季溢价。", mapQuery: "泉州西街" }
      ]
    },
    cities: [
      {
        id: "quanzhou",
        name: "泉州",
        province: "福建",
        cluster: "heritage",
        coordinates: { lat: 24.8741, lng: 118.6757 },
        centerQuery: "泉州西街",
        vector: { restoration: 0.64, nature: 0.35, culture: 0.88, food: 0.74, pace: 0.34, social: 0.42, budget: 0.34, aesthetics: 0.68, comfort: 0.58, novelty: 0.78 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 260,
        transportScore: 0.62,
        bestFor: ["老城街巷", "文化深度", "低预算慢游"],
        notFor: "想要夜生活和大城市效率感的人，可能会觉得节奏偏安静。",
        riskFlags: ["commercial"],
        platformSignals: ["西街核心段商业化上升，建议早晚错峰", "寺庙和街巷适合步行，夏季体感热"],
        stayZone: "西街/开元寺附近，步行覆盖核心街巷",
        pois: [
          { name: "开元寺", zone: "西街", type: "文化", duration: 90, indoor: false, tip: "清晨人少，适合作为第一站", lat: 24.9138, lng: 118.5894 },
          { name: "西街", zone: "鲤城", type: "街区", duration: 120, indoor: false, tip: "避开下午高峰，顺路吃小吃", lat: 24.9148, lng: 118.5890 },
          { name: "清净寺", zone: "涂门街", type: "文化", duration: 50, indoor: false, tip: "和关岳庙可连成一条线", lat: 24.9067, lng: 118.5929 },
          { name: "蟳埔村", zone: "丰泽", type: "民俗", duration: 120, indoor: false, tip: "拍照妆造需筛选店铺，先看客片", lat: 24.8696, lng: 118.6889 },
          { name: "泉州海外交通史博物馆", zone: "丰泽", type: "博物馆", duration: 120, indoor: true, tip: "雨天备选价值高", lat: 24.9122, lng: 118.6168 }
        ]
      },
      {
        id: "chengdu",
        name: "成都",
        province: "四川",
        cluster: "food-city",
        coordinates: { lat: 30.5728, lng: 104.0668 },
        centerQuery: "成都人民公园",
        vector: { restoration: 0.62, nature: 0.30, culture: 0.62, food: 0.92, pace: 0.46, social: 0.72, budget: 0.45, aesthetics: 0.58, comfort: 0.70, novelty: 0.52 },
        minDays: 3,
        maxDays: 5,
        dailyBudget: 360,
        transportScore: 0.82,
        bestFor: ["美食", "朋友局", "松弛城市漫游"],
        notFor: "如果你想远离人群，核心商圈和热门馆子会显得过热。",
        riskFlags: ["crowd", "commercial"],
        platformSignals: ["热门餐厅排队时间波动大，午后茶馆更稳定", "春熙路、锦里商业化强，建议控制停留"],
        stayZone: "太古里/人民公园/玉林之间，兼顾交通和生活感",
        pois: [
          { name: "人民公园", zone: "青羊", type: "生活", duration: 120, indoor: false, tip: "喝茶、采耳、观察本地节奏", lat: 30.6596, lng: 104.0592 },
          { name: "玉林路", zone: "武侯", type: "街区", duration: 150, indoor: false, tip: "傍晚到夜间更有氛围", lat: 30.6264, lng: 104.0520 },
          { name: "四川博物院", zone: "青羊", type: "博物馆", duration: 150, indoor: true, tip: "雨天和高温天优先", lat: 30.6601, lng: 104.0284 },
          { name: "东郊记忆", zone: "成华", type: "艺术", duration: 150, indoor: false, tip: "适合拍照和看展", lat: 30.6732, lng: 104.1212 },
          { name: "成都大熊猫繁育研究基地", zone: "成华", type: "自然", duration: 180, indoor: false, tip: "需要早去，和慢游需求有冲突", lat: 30.7397, lng: 104.1507 }
        ]
      },
      {
        id: "dali",
        name: "大理",
        province: "云南",
        cluster: "slow-nature",
        coordinates: { lat: 25.6065, lng: 100.2676 },
        centerQuery: "大理古城",
        vector: { restoration: 0.88, nature: 0.86, culture: 0.58, food: 0.48, pace: 0.25, social: 0.36, budget: 0.42, aesthetics: 0.76, comfort: 0.58, novelty: 0.60 },
        minDays: 3,
        maxDays: 7,
        dailyBudget: 340,
        transportScore: 0.56,
        bestFor: ["放空恢复", "试住一城", "自然散步"],
        notFor: "短时间高效打卡不适合大理，景点之间移动会稀释体验。",
        riskFlags: ["commercial", "longTransit"],
        platformSignals: ["洱海沿线住宿和租车体验差异很大，需看近期开业评价", "古城主街商业化明显，建议住边缘街区"],
        stayZone: "大理古城南门外/才村一带，兼顾生活与洱海",
        pois: [
          { name: "洱海生态廊道", zone: "洱海西岸", type: "自然", duration: 180, indoor: false, tip: "骑行优先，避开中午强晒", lat: 25.7047, lng: 100.1960 },
          { name: "大理古城", zone: "古城", type: "街区", duration: 150, indoor: false, tip: "主街少停留，往小巷走", lat: 25.6942, lng: 100.1617 },
          { name: "喜洲古镇", zone: "喜洲", type: "古镇", duration: 180, indoor: false, tip: "早去看稻田和老宅", lat: 25.8517, lng: 100.1299 },
          { name: "苍山洗马潭索道", zone: "苍山", type: "自然", duration: 240, indoor: false, tip: "看天气再决定，别硬排", lat: 25.6897, lng: 100.0908 },
          { name: "双廊", zone: "洱海东岸", type: "自然", duration: 180, indoor: false, tip: "适合日落，但路程较长", lat: 25.9080, lng: 100.2038 }
        ]
      },
      {
        id: "hangzhou",
        name: "杭州",
        province: "浙江",
        cluster: "aesthetic-city",
        coordinates: { lat: 30.2741, lng: 120.1551 },
        centerQuery: "杭州西湖",
        vector: { restoration: 0.68, nature: 0.62, culture: 0.70, food: 0.46, pace: 0.48, social: 0.48, budget: 0.62, aesthetics: 0.82, comfort: 0.76, novelty: 0.45 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 520,
        transportScore: 0.86,
        bestFor: ["审美出片", "短途周末", "自然和城市兼有"],
        notFor: "节假日西湖和灵隐寺客流极高，不适合讨厌拥挤的人。",
        riskFlags: ["crowd", "expensive"],
        platformSignals: ["西湖核心线节假日拥挤明显，清晨和雨后体验更好", "灵隐寺需提前看预约和交通管制"],
        stayZone: "武林/湖滨/黄龙，交通稳定，不必执着住湖边",
        pois: [
          { name: "西湖苏堤", zone: "西湖", type: "自然", duration: 150, indoor: false, tip: "清晨体验远好于午后", lat: 30.2448, lng: 120.1390 },
          { name: "中国美术学院象山校区", zone: "转塘", type: "建筑", duration: 120, indoor: false, tip: "适合建筑和空间采样", lat: 30.1525, lng: 120.0779 },
          { name: "良渚博物院", zone: "余杭", type: "博物馆", duration: 180, indoor: true, tip: "远但值得，适合深度文化线", lat: 30.3888, lng: 120.0391 },
          { name: "龙井村", zone: "西湖", type: "自然", duration: 160, indoor: false, tip: "别把餐饮期待拉太高", lat: 30.2228, lng: 120.1022 },
          { name: "天目里", zone: "西湖", type: "艺术", duration: 120, indoor: true, tip: "展览、书店、建筑集中", lat: 30.2893, lng: 120.0944 }
        ]
      },
      {
        id: "xiamen",
        name: "厦门",
        province: "福建",
        cluster: "coast-aesthetic",
        coordinates: { lat: 24.4798, lng: 118.0894 },
        centerQuery: "厦门沙坡尾",
        vector: { restoration: 0.66, nature: 0.60, culture: 0.48, food: 0.50, pace: 0.42, social: 0.48, budget: 0.50, aesthetics: 0.76, comfort: 0.68, novelty: 0.44 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 420,
        transportScore: 0.78,
        bestFor: ["海边散步", "拍照", "轻松短途"],
        notFor: "想要小众和深度文化的人，厦门核心线路可能偏熟悉。",
        riskFlags: ["crowd", "commercial"],
        platformSignals: ["鼓浪屿需预约船票并避开高峰", "曾厝垵商业化强，可少停留"],
        stayZone: "思明区沙坡尾/厦大附近，兼顾海边和街区",
        pois: [
          { name: "沙坡尾", zone: "思明", type: "街区", duration: 120, indoor: false, tip: "傍晚更有层次", lat: 24.4388, lng: 118.0938 },
          { name: "环岛路", zone: "思明", type: "自然", duration: 160, indoor: false, tip: "骑行和散步都稳定", lat: 24.4297, lng: 118.1557 },
          { name: "鼓浪屿", zone: "思明", type: "街区", duration: 240, indoor: false, tip: "提前买船票，少走商业街", lat: 24.4478, lng: 118.0678 },
          { name: "华新路", zone: "思明", type: "街区", duration: 100, indoor: false, tip: "老别墅和咖啡适合慢逛", lat: 24.4620, lng: 118.0812 },
          { name: "厦门市园林植物园", zone: "万石山", type: "自然", duration: 180, indoor: false, tip: "雨林喷雾时间需提前查", lat: 24.4446, lng: 118.1035 }
        ]
      },
      {
        id: "suzhou",
        name: "苏州",
        province: "江苏",
        cluster: "heritage",
        coordinates: { lat: 31.2989, lng: 120.5853 },
        centerQuery: "苏州平江路",
        vector: { restoration: 0.62, nature: 0.52, culture: 0.82, food: 0.45, pace: 0.36, social: 0.36, budget: 0.48, aesthetics: 0.86, comfort: 0.74, novelty: 0.52 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 430,
        transportScore: 0.84,
        bestFor: ["江南审美", "园林博物馆", "低压周末"],
        notFor: "节假日园林排队会破坏松弛感，需要错峰和预约。",
        riskFlags: ["crowd"],
        platformSignals: ["苏州博物馆和热门园林需提前预约", "平江路主街人多，支巷体验更好"],
        stayZone: "观前街/平江路外圈，步行和地铁都方便",
        pois: [
          { name: "苏州博物馆", zone: "姑苏", type: "博物馆", duration: 150, indoor: true, tip: "提前预约，和拙政园可连线", lat: 31.3243, lng: 120.6256 },
          { name: "拙政园", zone: "姑苏", type: "园林", duration: 120, indoor: false, tip: "早场体验更安静", lat: 31.3267, lng: 120.6270 },
          { name: "平江路", zone: "姑苏", type: "街区", duration: 150, indoor: false, tip: "主街少停留，多走河边支路", lat: 31.3176, lng: 120.6306 },
          { name: "艺圃", zone: "姑苏", type: "园林", duration: 90, indoor: false, tip: "相对小众，适合静坐", lat: 31.3168, lng: 120.6087 },
          { name: "金鸡湖", zone: "园区", type: "自然", duration: 120, indoor: false, tip: "现代苏州和夜景线", lat: 31.3040, lng: 120.7053 }
        ]
      },
      {
        id: "chongqing",
        name: "重庆",
        province: "重庆",
        cluster: "food-city",
        coordinates: { lat: 29.5630, lng: 106.5516 },
        centerQuery: "重庆解放碑",
        vector: { restoration: 0.32, nature: 0.34, culture: 0.58, food: 0.90, pace: 0.70, social: 0.76, budget: 0.38, aesthetics: 0.80, comfort: 0.42, novelty: 0.74 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 330,
        transportScore: 0.58,
        bestFor: ["夜景", "美食", "强视觉城市"],
        notFor: "怕累、怕热、讨厌复杂路线的人，需要谨慎选择重庆。",
        riskFlags: ["climb", "crowd", "longTransit"],
        platformSignals: ["网红点排队和绕路较多，建议减少机位执念", "山城步行消耗比地图距离更高"],
        stayZone: "解放碑/较场口附近，减少跨江折返",
        pois: [
          { name: "山城步道", zone: "渝中", type: "街区", duration: 120, indoor: false, tip: "有坡度，鞋要舒服", lat: 29.5545, lng: 106.5694 },
          { name: "李子坝轻轨站", zone: "渝中", type: "城市", duration: 40, indoor: false, tip: "顺路看即可，不必单独久等", lat: 29.5523, lng: 106.5306 },
          { name: "洪崖洞", zone: "渝中", type: "夜景", duration: 80, indoor: false, tip: "外观远看比内部逛更值", lat: 29.5628, lng: 106.5791 },
          { name: "鹅岭二厂", zone: "渝中", type: "艺术", duration: 110, indoor: false, tip: "适合拍照，但商业店铺多", lat: 29.5499, lng: 106.5364 },
          { name: "南山一棵树", zone: "南岸", type: "夜景", duration: 120, indoor: false, tip: "看天气和交通再决定", lat: 29.5572, lng: 106.6108 }
        ]
      },
      {
        id: "qingdao",
        name: "青岛",
        province: "山东",
        cluster: "coast-aesthetic",
        coordinates: { lat: 36.0671, lng: 120.3826 },
        centerQuery: "青岛八大关",
        vector: { restoration: 0.64, nature: 0.58, culture: 0.55, food: 0.52, pace: 0.42, social: 0.46, budget: 0.48, aesthetics: 0.78, comfort: 0.68, novelty: 0.46 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 430,
        transportScore: 0.72,
        bestFor: ["海边城市", "建筑散步", "夏季短途"],
        notFor: "旺季海边住宿溢价明显，不适合极低预算。",
        riskFlags: ["expensive", "crowd"],
        platformSignals: ["旺季海鲜和住宿价格波动大，优先看明码标价", "老城坡路较多，路线别排太满"],
        stayZone: "市南老城/五四广场之间，看你更偏建筑还是交通",
        pois: [
          { name: "八大关", zone: "市南", type: "建筑", duration: 150, indoor: false, tip: "适合慢走和拍建筑", lat: 36.0518, lng: 120.3527 },
          { name: "小鱼山", zone: "市南", type: "自然", duration: 70, indoor: false, tip: "俯瞰红瓦绿树", lat: 36.0631, lng: 120.3336 },
          { name: "栈桥", zone: "市南", type: "海边", duration: 70, indoor: false, tip: "早晚比白天更舒服", lat: 36.0611, lng: 120.3205 },
          { name: "信号山", zone: "市南", type: "自然", duration: 90, indoor: false, tip: "视野好，体力消耗可控", lat: 36.0704, lng: 120.3307 },
          { name: "青岛啤酒博物馆", zone: "市北", type: "博物馆", duration: 120, indoor: true, tip: "雨天备选，也适合朋友局", lat: 36.0873, lng: 120.3569 }
        ]
      },
      {
        id: "shanghai",
        name: "上海",
        province: "上海",
        cluster: "aesthetic-city",
        coordinates: { lat: 31.2304, lng: 121.4737 },
        centerQuery: "上海武康路",
        vector: { restoration: 0.35, nature: 0.20, culture: 0.72, food: 0.66, pace: 0.82, social: 0.74, budget: 0.82, aesthetics: 0.88, comfort: 0.82, novelty: 0.66 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 760,
        transportScore: 0.94,
        bestFor: ["展览", "城市审美", "高效短途"],
        notFor: "如果你当前需要真正放空，上海的高密度可能继续消耗你。",
        riskFlags: ["expensive", "crowd"],
        platformSignals: ["热门展览和餐厅需预约，周末排队显著", "武康路等街区拍照人流高，清晨体验更好"],
        stayZone: "静安/徐汇/黄浦，按展览和餐厅分布选择",
        pois: [
          { name: "武康路", zone: "徐汇", type: "街区", duration: 120, indoor: false, tip: "清晨更适合散步拍照", lat: 31.2109, lng: 121.4387 },
          { name: "西岸美术馆", zone: "徐汇", type: "艺术", duration: 160, indoor: true, tip: "看展期再安排", lat: 31.1690, lng: 121.4580 },
          { name: "外滩源", zone: "黄浦", type: "建筑", duration: 100, indoor: false, tip: "比外滩主线更从容", lat: 31.2444, lng: 121.4912 },
          { name: "愚园路", zone: "长宁", type: "街区", duration: 140, indoor: false, tip: "咖啡、买手店和老建筑集中", lat: 31.2226, lng: 121.4284 },
          { name: "浦东美术馆", zone: "浦东", type: "艺术", duration: 150, indoor: true, tip: "夜景和展览可组合", lat: 31.2405, lng: 121.4999 }
        ]
      },
      {
        id: "changsha",
        name: "长沙",
        province: "湖南",
        cluster: "food-city",
        coordinates: { lat: 28.2282, lng: 112.9388 },
        centerQuery: "长沙五一广场",
        vector: { restoration: 0.28, nature: 0.22, culture: 0.48, food: 0.88, pace: 0.78, social: 0.82, budget: 0.36, aesthetics: 0.52, comfort: 0.50, novelty: 0.52 },
        minDays: 2,
        maxDays: 3,
        dailyBudget: 280,
        transportScore: 0.76,
        bestFor: ["朋友局", "夜生活", "低预算高密度"],
        notFor: "想独处、早睡、低刺激的人不适合把长沙排第一。",
        riskFlags: ["crowd", "early"],
        platformSignals: ["五一商圈排队密度高，餐饮建议错峰", "夜生活噪声强，住宿别贴核心商圈"],
        stayZone: "地铁 2 号线沿线，避开五一广场正核心",
        pois: [
          { name: "太平老街", zone: "天心", type: "街区", duration: 90, indoor: false, tip: "小吃密集但人多", lat: 28.1948, lng: 112.9759 },
          { name: "橘子洲", zone: "岳麓", type: "自然", duration: 150, indoor: false, tip: "看天气和接驳安排", lat: 28.1987, lng: 112.9600 },
          { name: "湖南博物院", zone: "开福", type: "博物馆", duration: 180, indoor: true, tip: "马王堆是核心，需预约", lat: 28.2147, lng: 112.9838 },
          { name: "岳麓山", zone: "岳麓", type: "自然", duration: 180, indoor: false, tip: "怕爬山可只走低强度路线", lat: 28.1854, lng: 112.9442 },
          { name: "文和友", zone: "天心", type: "餐饮", duration: 90, indoor: true, tip: "适合看空间，不必执着排队吃", lat: 28.1918, lng: 112.9769 }
        ]
      },
      {
        id: "guangzhou",
        name: "广州",
        province: "广东",
        cluster: "corridor",
        coordinates: { lat: 23.1291, lng: 113.2644 },
        centerQuery: "广州永庆坊",
        vector: { restoration: 0.38, nature: 0.26, culture: 0.62, food: 0.86, pace: 0.70, social: 0.70, budget: 0.56, aesthetics: 0.58, comfort: 0.72, novelty: 0.46 },
        minDays: 1,
        maxDays: 3,
        dailyBudget: 420,
        transportScore: 0.94,
        bestFor: ["华南枢纽", "早茶老城", "短停补给"],
        notFor: "这条路线里广州不适合深玩，停太久会挤压北上和返程节点。",
        riskFlags: ["crowd", "commercial"],
        platformSignals: ["广州适合作为茂名出发后的全国交通入口", "核心商圈和长线景区不适合塞进本次高性价比闭环"],
        stayZone: "广州南/老城区地铁沿线，按第二天车次选择",
        pois: [
          { name: "永庆坊", zone: "荔湾", type: "街区", duration: 100, indoor: false, tip: "老城短停体验，避开下午高峰", lat: 23.1172, lng: 113.2454 },
          { name: "沙面", zone: "荔湾", type: "建筑", duration: 90, indoor: false, tip: "适合轻量散步拍照", lat: 23.1096, lng: 113.2386 },
          { name: "陈家祠", zone: "荔湾", type: "文化", duration: 90, indoor: true, tip: "室内文化点，雨天可用", lat: 23.1293, lng: 113.2465 },
          { name: "北京路", zone: "越秀", type: "商业", duration: 90, indoor: false, tip: "商业化强，只做补给不做主线", lat: 23.1252, lng: 113.2698 },
          { name: "广州南站", zone: "番禺", type: "交通", duration: 40, indoor: true, tip: "北上车次核心节点", lat: 22.9890, lng: 113.2695 }
        ]
      },
      {
        id: "wuhan",
        name: "武汉",
        province: "湖北",
        cluster: "corridor",
        coordinates: { lat: 30.5928, lng: 114.3055 },
        centerQuery: "湖北省博物馆",
        vector: { restoration: 0.44, nature: 0.42, culture: 0.76, food: 0.66, pace: 0.64, social: 0.58, budget: 0.42, aesthetics: 0.54, comfort: 0.66, novelty: 0.58 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 330,
        transportScore: 0.90,
        bestFor: ["中段高铁枢纽", "博物馆", "江滩街区"],
        notFor: "如果用户只想压缩路程，武汉可降级为一晚中转。",
        riskFlags: ["hot"],
        platformSignals: ["夏季体感热，室内博物馆和夜间江滩更稳", "黄鹤楼等传统景点需要控制期待，别只按名气排"],
        stayZone: "武昌/汉口地铁沿线，按博物馆或江滩分区",
        pois: [
          { name: "湖北省博物馆", zone: "武昌", type: "博物馆", duration: 180, indoor: true, tip: "预约后作为雨天/热天核心", lat: 30.5646, lng: 114.3632 },
          { name: "东湖听涛", zone: "武昌", type: "自然", duration: 150, indoor: false, tip: "体力好时走湖边，不硬环湖", lat: 30.5590, lng: 114.3840 },
          { name: "江汉路", zone: "汉口", type: "街区", duration: 100, indoor: false, tip: "夜间更有城市感，注意人流", lat: 30.5833, lng: 114.2920 },
          { name: "黎黄陂路", zone: "汉口", type: "建筑", duration: 90, indoor: false, tip: "和江滩可连线", lat: 30.5905, lng: 114.2999 },
          { name: "武汉站", zone: "洪山", type: "交通", duration: 40, indoor: true, tip: "北上/东线车次衔接点", lat: 30.6107, lng: 114.4245 }
        ]
      },
      {
        id: "luoyang",
        name: "洛阳",
        province: "河南",
        cluster: "heritage",
        coordinates: { lat: 34.6197, lng: 112.4540 },
        centerQuery: "洛阳龙门石窟",
        vector: { restoration: 0.42, nature: 0.34, culture: 0.90, food: 0.48, pace: 0.56, social: 0.44, budget: 0.38, aesthetics: 0.66, comfort: 0.56, novelty: 0.70 },
        minDays: 1,
        maxDays: 3,
        dailyBudget: 300,
        transportScore: 0.76,
        bestFor: ["古都历史", "石窟寺庙", "中段记忆点"],
        notFor: "如果用户对古都兴趣弱，洛阳不应为了凑城市数硬停。",
        riskFlags: ["early", "crowd"],
        platformSignals: ["龙门石窟对天气和体力要求更高", "热门季节需预约和错峰"],
        stayZone: "洛阳龙门站/老城之间，按石窟行程选择",
        pois: [
          { name: "龙门石窟", zone: "洛龙", type: "文化", duration: 210, indoor: false, tip: "留半天，不和长交通同日硬塞", lat: 34.5590, lng: 112.4780 },
          { name: "洛阳博物馆", zone: "洛龙", type: "博物馆", duration: 150, indoor: true, tip: "雨天或体力弱时替代户外", lat: 34.6222, lng: 112.4440 },
          { name: "老城十字街", zone: "老城", type: "餐饮", duration: 90, indoor: false, tip: "夜市人多，作为轻体验", lat: 34.6836, lng: 112.4779 },
          { name: "白马寺", zone: "瀍河", type: "文化", duration: 120, indoor: false, tip: "适合文化线延展", lat: 34.7211, lng: 112.6060 },
          { name: "洛阳龙门站", zone: "洛龙", type: "交通", duration: 40, indoor: true, tip: "承接武汉到北京中段", lat: 34.5931, lng: 112.4582 }
        ]
      },
      {
        id: "jinan",
        name: "济南",
        province: "山东",
        cluster: "corridor",
        coordinates: { lat: 36.6512, lng: 117.1201 },
        centerQuery: "济南趵突泉",
        vector: { restoration: 0.50, nature: 0.44, culture: 0.58, food: 0.48, pace: 0.44, social: 0.40, budget: 0.38, aesthetics: 0.48, comfort: 0.62, novelty: 0.42 },
        minDays: 1,
        maxDays: 2,
        dailyBudget: 300,
        transportScore: 0.82,
        bestFor: ["返程缓冲", "短停散步", "拆短车程"],
        notFor: "不适合作为主目的地，时间少时优先删除。",
        riskFlags: [],
        platformSignals: ["从北京南下可拆短第一段车程", "城市体验轻量，适合半天到一晚"],
        stayZone: "济南站/大明湖附近，减少换乘",
        pois: [
          { name: "趵突泉", zone: "历下", type: "自然", duration: 90, indoor: false, tip: "短停核心点", lat: 36.6612, lng: 117.0116 },
          { name: "大明湖", zone: "历下", type: "自然", duration: 100, indoor: false, tip: "适合轻散步", lat: 36.6756, lng: 117.0292 },
          { name: "曲水亭街", zone: "历下", type: "街区", duration: 70, indoor: false, tip: "和大明湖顺路", lat: 36.6687, lng: 117.0309 },
          { name: "山东博物馆", zone: "历下", type: "博物馆", duration: 120, indoor: true, tip: "雨天替代", lat: 36.6681, lng: 117.0965 },
          { name: "济南西站", zone: "槐荫", type: "交通", duration: 40, indoor: true, tip: "承接北京到南京段", lat: 36.6683, lng: 116.8920 }
        ]
      },
      {
        id: "nanjing",
        name: "南京",
        province: "江苏",
        cluster: "heritage",
        coordinates: { lat: 32.0603, lng: 118.7969 },
        centerQuery: "南京博物院",
        vector: { restoration: 0.48, nature: 0.42, culture: 0.88, food: 0.58, pace: 0.58, social: 0.50, budget: 0.42, aesthetics: 0.66, comfort: 0.68, novelty: 0.58 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 360,
        transportScore: 0.88,
        bestFor: ["历史城市", "博物馆", "东线返程"],
        notFor: "如果北京段已经过度消耗，南京需要降强度，别再堆满博物馆。",
        riskFlags: ["early", "crowd"],
        platformSignals: ["南京博物院等热门点需要预约", "夫子庙商业化强，可用老门东/颐和路替代"],
        stayZone: "新街口/明故宫/夫子庙外围地铁沿线",
        pois: [
          { name: "南京博物院", zone: "玄武", type: "博物馆", duration: 180, indoor: true, tip: "提前预约，体量大", lat: 32.0406, lng: 118.8307 },
          { name: "中山陵", zone: "玄武", type: "文化", duration: 150, indoor: false, tip: "和明孝陵二选一，不硬塞", lat: 32.0641, lng: 118.8487 },
          { name: "老门东", zone: "秦淮", type: "街区", duration: 100, indoor: false, tip: "比夫子庙更稳，但仍需错峰", lat: 32.0134, lng: 118.7916 },
          { name: "颐和路", zone: "鼓楼", type: "建筑", duration: 90, indoor: false, tip: "适合低强度散步", lat: 32.0628, lng: 118.7627 },
          { name: "南京南站", zone: "雨花台", type: "交通", duration: 40, indoor: true, tip: "连接苏杭和华南方向", lat: 31.9706, lng: 118.7965 }
        ]
      },
      {
        id: "beijing",
        name: "北京",
        province: "北京",
        cluster: "heritage",
        coordinates: { lat: 39.9042, lng: 116.4074 },
        centerQuery: "北京故宫",
        vector: { restoration: 0.30, nature: 0.30, culture: 0.92, food: 0.55, pace: 0.72, social: 0.66, budget: 0.70, aesthetics: 0.72, comfort: 0.70, novelty: 0.68 },
        minDays: 3,
        maxDays: 6,
        dailyBudget: 650,
        transportScore: 0.88,
        bestFor: ["历史文化", "博物馆", "高信息量旅行"],
        notFor: "不适合完全不想预约、不想早起的人。",
        riskFlags: ["early", "crowd", "expensive"],
        platformSignals: ["故宫、国博等核心场馆预约强依赖", "热门胡同商业化与居民生活混杂，需控制期待"],
        stayZone: "东城/西城地铁沿线，减少跨城通勤",
        pois: [
          { name: "故宫博物院", zone: "东城", type: "博物馆", duration: 240, indoor: true, tip: "提前预约，周一通常闭馆", lat: 39.9163, lng: 116.3972 },
          { name: "景山公园", zone: "西城", type: "自然", duration: 70, indoor: false, tip: "俯瞰中轴线", lat: 39.9251, lng: 116.3967 },
          { name: "国家博物馆", zone: "东城", type: "博物馆", duration: 210, indoor: true, tip: "体量大，不要和故宫同日硬塞", lat: 39.9051, lng: 116.4010 },
          { name: "五道营胡同", zone: "东城", type: "街区", duration: 110, indoor: false, tip: "比南锣鼓巷更克制", lat: 39.9471, lng: 116.4082 },
          { name: "798艺术区", zone: "朝阳", type: "艺术", duration: 180, indoor: true, tip: "看展期和店铺营业时间", lat: 39.9840, lng: 116.4940 }
        ]
      },
      {
        id: "shenzhen",
        name: "深圳",
        province: "广东",
        cluster: "modern",
        coordinates: { lat: 22.5431, lng: 114.0579 },
        centerQuery: "深圳华侨城创意文化园",
        vector: { restoration: 0.42, nature: 0.48, culture: 0.48, food: 0.58, pace: 0.84, social: 0.64, budget: 0.68, aesthetics: 0.70, comfort: 0.86, novelty: 0.54 },
        minDays: 2,
        maxDays: 4,
        dailyBudget: 620,
        transportScore: 0.90,
        bestFor: ["现代城市", "设计街区", "高效轻旅行"],
        notFor: "如果你想看厚重历史，深圳不是最佳主目的地。",
        riskFlags: ["expensive"],
        platformSignals: ["海边和商圈距离分散，路线要分区", "夏季户外热，室内展馆和商场需作为备选"],
        stayZone: "南山/福田地铁沿线，按海边或展览选择",
        pois: [
          { name: "华侨城创意文化园", zone: "南山", type: "艺术", duration: 150, indoor: false, tip: "展览、咖啡和设计店集中", lat: 22.5408, lng: 113.9897 },
          { name: "深圳湾公园", zone: "南山", type: "自然", duration: 150, indoor: false, tip: "日落和骑行稳定", lat: 22.5155, lng: 113.9568 },
          { name: "大梅沙海滨公园", zone: "盐田", type: "海边", duration: 210, indoor: false, tip: "旺季拥挤，交通时间长", lat: 22.5964, lng: 114.3089 },
          { name: "何香凝美术馆", zone: "南山", type: "艺术", duration: 120, indoor: true, tip: "和 OCT 连线", lat: 22.5392, lng: 113.9844 },
          { name: "深业上城", zone: "福田", type: "商业", duration: 120, indoor: true, tip: "高温天可作为补给点", lat: 22.5552, lng: 114.0556 }
        ]
      }
    ],
    itinerarySlots: [
      { key: "morning", label: "上午" },
      { key: "noon", label: "午间" },
      { key: "afternoon", label: "下午" },
      { key: "evening", label: "晚上" }
    ]
  };
})();
