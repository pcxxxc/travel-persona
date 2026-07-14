// ============================================================
// 旅格 Travel Persona - 城市目的地画像数据库 & 匹配算法
// ============================================================

// ---- 城市画像数据库 ----
var CITY_DATABASE = [
  {
    id: 'dali',
    name: '大理',
    province: '云南',
    tags: ['自然山海', '古城街巷', '咖啡书店', '小镇慢生活'],
    pace: 2,          // 1=极快 5=极慢
    costLevel: 2,     // 1=极低 5=极高
    climate: ['spring', 'autumn'],
    transportFriendly: 3, // 1=不便 5=非常便利
    spaceVibe: '自然疗愈',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['放空', '慢生活', '数字游民', '独行'],
    travelDensity: 2, // 1=稀疏 5=密集
    photoFriendly: 4,
    localLife: 4,
    nomadFriendly: 5,
    shortStayScore: 5,
    description: '苍山洱海之间，古城与自然交融。适合放空、骑行环海、咖啡馆发呆，是数字游民和慢生活爱好者的理想之地。',
    highlights: ['洱海骑行', '古城漫步', '苍山徒步', '喜洲古镇', '双廊日落'],
    risks: ['雨季影响出行', '旺季人流量大', '部分区域商业化'],
    stayDays: '3-7天',
    dailyBudget: '200-400元',
    emoji: '🏔️'
  },
  {
    id: 'chengdu',
    name: '成都',
    province: '四川',
    tags: ['夜市烟火气', '都市商业', '咖啡书店', '古城街巷'],
    pace: 3,
    costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '烟火人间',
    bestSeason: '3-6月 / 9-11月',
    crowd: ['美食', '慢生活', '社交', '城市漫游'],
    travelDensity: 3,
    photoFriendly: 3,
    localLife: 5,
    nomadFriendly: 4,
    shortStayScore: 4,
    description: '火锅、茶馆、熊猫、宽窄巷子。一座来了就不想走的城市，烟火气与文艺气息并存，适合深度城市漫游。',
    highlights: ['宽窄巷子', '人民公园喝茶', '春熙路', '熊猫基地', '玉林路小酒馆', '锦里夜游'],
    risks: ['夏季闷热', '部分景点商业化', '交通高峰拥堵'],
    stayDays: '3-5天',
    dailyBudget: '250-500元',
    emoji: '🐼'
  },
  {
    id: 'xiamen',
    name: '厦门',
    province: '福建',
    tags: ['自然山海', '咖啡书店', '艺术街区', '小镇慢生活'],
    pace: 3,
    costLevel: 3,
    climate: ['spring', 'autumn', 'winter'],
    transportFriendly: 4,
    spaceVibe: '海滨文艺',
    bestSeason: '3-5月 / 10-12月',
    crowd: ['拍照', '轻松旅行', '情侣', '独行'],
    travelDensity: 3,
    photoFriendly: 5,
    localLife: 3,
    nomadFriendly: 3,
    shortStayScore: 3,
    description: '鼓浪屿的钢琴声、曾厝垵的文艺小店、环岛路的海风。一座适合拍照、散步、发呆的海滨城市。',
    highlights: ['鼓浪屿', '曾厝垵', '环岛路骑行', '南普陀寺', '沙坡尾艺术区', '中山路步行街'],
    risks: ['台风季节影响', '鼓浪屿限流需预约', '旺季住宿涨价'],
    stayDays: '2-4天',
    dailyBudget: '200-450元',
    emoji: '🌊'
  },
  {
    id: 'hangzhou',
    name: '杭州',
    province: '浙江',
    tags: ['自然山海', '艺术街区', '咖啡书店', '都市商业'],
    pace: 3,
    costLevel: 4,
    climate: ['spring', 'autumn'],
    transportFriendly: 5,
    spaceVibe: '诗意审美',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['灵感采集', '审美', '自然', '创作者'],
    travelDensity: 3,
    photoFriendly: 4,
    localLife: 4,
    nomadFriendly: 4,
    shortStayScore: 4,
    description: '西湖、龙井、南宋御街。自然与城市完美结合，审美友好，适合灵感采集和创作者寻找素材。',
    highlights: ['西湖漫步', '灵隐寺', '龙井茶园', '南宋御街', '中国美术学院', '西溪湿地'],
    risks: ['节假日人流量极大', '消费水平较高', '梅雨季潮湿'],
    stayDays: '2-4天',
    dailyBudget: '300-600元',
    emoji: '🍵'
  },
  {
    id: 'changsha',
    name: '长沙',
    province: '湖南',
    tags: ['夜市烟火气', '都市商业', '古城街巷'],
    pace: 4,
    costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '热辣活力',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['社交', '美食', '夜生活', '短途高能'],
    travelDensity: 4,
    photoFriendly: 3,
    localLife: 5,
    nomadFriendly: 2,
    shortStayScore: 2,
    description: '茶颜悦色、文和友、橘子洲。夜生活丰富、美食密度极高，适合社交和短途高能体验。',
    highlights: ['橘子洲', '岳麓山', '太平老街', '坡子街', '超级文和友', '湖南博物院'],
    risks: ['夏季酷热', '夜生活噪音', '热门店排队时间长'],
    stayDays: '2-3天',
    dailyBudget: '150-350元',
    emoji: '🌶️'
  },
  {
    id: 'quanzhou',
    name: '泉州',
    province: '福建',
    tags: ['古城街巷', '夜市烟火气', '博物馆展览', '小镇慢生活'],
    pace: 2,
    costLevel: 2,
    climate: ['spring', 'autumn', 'winter'],
    transportFriendly: 3,
    spaceVibe: '古城文化',
    bestSeason: '10-12月 / 3-4月',
    crowd: ['深度探索', '文化', '步行', '独行'],
    travelDensity: 2,
    photoFriendly: 4,
    localLife: 5,
    nomadFriendly: 3,
    shortStayScore: 3,
    description: '半城烟火半城仙。世界遗产城市，古城街巷中藏着千年故事，适合深度步行探索和文化爱好者。',
    highlights: ['开元寺', '西街', '清净寺', '洛阳桥', '蟳埔村', '关帝庙'],
    risks: ['夏季炎热', '公共交通相对不便', '夜间活动较少'],
    stayDays: '2-4天',
    dailyBudget: '150-300元',
    emoji: '🏯'
  },
  {
    id: 'kunming',
    name: '昆明',
    province: '云南',
    tags: ['自然山海', '小镇慢生活', '咖啡书店', '博物馆展览'],
    pace: 3,
    costLevel: 2,
    climate: ['spring', 'summer', 'autumn', 'winter'],
    transportFriendly: 4,
    spaceVibe: '春城慢调',
    bestSeason: '全年适宜',
    crowd: ['放空', '数字游民', '自然', '短住'],
    travelDensity: 2,
    photoFriendly: 3,
    localLife: 4,
    nomadFriendly: 4,
    shortStayScore: 4,
    description: '四季如春的春城，气候舒适节奏慢，适合短住和轻度数字游民。作为云南旅行的中转站，也值得停留。',
    highlights: ['翠湖公园', '滇池', '云南大学', '官渡古镇', '斗南花市', '石林'],
    risks: ['紫外线强', '海拔较高需适应', '部分景点距离较远'],
    stayDays: '2-5天',
    dailyBudget: '150-350元',
    emoji: '🌸'
  },
  {
    id: 'chongqing',
    name: '重庆',
    province: '重庆',
    tags: ['夜市烟火气', '都市商业', '古城街巷'],
    pace: 4,
    costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '山城魔幻',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['探索', '夜景', '美食', '拍照'],
    travelDensity: 4,
    photoFriendly: 5,
    localLife: 4,
    nomadFriendly: 2,
    shortStayScore: 2,
    description: '8D魔幻山城，轻轨穿楼、洪崖洞夜景、火锅飘香。空间层次丰富，适合街巷探索和拍照打卡。',
    highlights: ['洪崖洞', '解放碑', '磁器口', '长江索道', '李子坝轻轨站', '南山一棵树'],
    risks: ['夏季酷热', '地形复杂体力消耗大', '导航容易迷路'],
    stayDays: '2-4天',
    dailyBudget: '150-350元',
    emoji: '🌃'
  },
  {
    id: 'sanya',
    name: '三亚',
    province: '海南',
    tags: ['自然山海', '小镇慢生活'],
    pace: 2,
    costLevel: 5,
    climate: ['winter', 'spring'],
    transportFriendly: 3,
    spaceVibe: '热带度假',
    bestSeason: '11月-次年3月',
    crowd: ['放空', '度假', '家庭', '情侣'],
    travelDensity: 3,
    photoFriendly: 4,
    localLife: 2,
    nomadFriendly: 2,
    shortStayScore: 3,
    description: '碧海蓝天椰林，中国最南端的热带度假胜地。适合放空、海边发呆、水上运动。',
    highlights: ['亚龙湾', '天涯海角', '蜈支洲岛', '南山寺', '椰梦长廊', '后海村冲浪'],
    risks: ['消费极高', '旺季人满为患', '夏季台风', '旅游陷阱较多'],
    stayDays: '3-5天',
    dailyBudget: '500-1500元',
    emoji: '🌴'
  },
  {
    id: 'lasa',
    name: '拉萨',
    province: '西藏',
    tags: ['自然山海', '博物馆展览', '古城街巷'],
    pace: 1,
    costLevel: 4,
    climate: ['summer', 'autumn'],
    transportFriendly: 2,
    spaceVibe: '神圣纯净',
    bestSeason: '6-9月',
    crowd: ['逃离', '放空', '独行', '精神'],
    travelDensity: 2,
    photoFriendly: 5,
    localLife: 3,
    nomadFriendly: 2,
    shortStayScore: 2,
    description: '布达拉宫、大昭寺、八廓街。离天空最近的城市，适合逃离压力、寻找内心平静和精神洗礼。',
    highlights: ['布达拉宫', '大昭寺', '八廓街', '纳木错', '色拉寺辩经', '玛吉阿米'],
    risks: ['高反风险', '紫外线极强', '消费较高', '需提前适应海拔'],
    stayDays: '3-7天',
    dailyBudget: '300-600元',
    emoji: '🛕'
  },
  {
    id: 'nanjing',
    name: '南京',
    province: '江苏',
    tags: ['古城街巷', '博物馆展览', '都市商业', '自然山海'],
    pace: 3,
    costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 5,
    spaceVibe: '六朝古都',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['文化', '历史', '城市漫游', '美食'],
    travelDensity: 3,
    photoFriendly: 4,
    localLife: 4,
    nomadFriendly: 3,
    shortStayScore: 3,
    description: '六朝古都，梧桐树下的浪漫。历史底蕴深厚，文化密度高，适合城市漫游和历史爱好者。',
    highlights: ['中山陵', '夫子庙', '明孝陵', '南京博物院', '先锋书店', '颐和路'],
    risks: ['夏季酷热', '节假日人流量大', '部分景点需预约'],
    stayDays: '2-4天',
    dailyBudget: '200-400元',
    emoji: '🍂'
  },
  {
    id: 'guilin',
    name: '桂林',
    province: '广西',
    tags: ['自然山海', '小镇慢生活'],
    pace: 2,
    costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '山水画卷',
    bestSeason: '4-10月',
    crowd: ['自然', '放空', '拍照', '家庭'],
    travelDensity: 3,
    photoFriendly: 5,
    localLife: 3,
    nomadFriendly: 2,
    shortStayScore: 2,
    description: '桂林山水甲天下。漓江竹筏、阳朔西街、龙脊梯田，一幅天然山水画卷。',
    highlights: ['漓江竹筏', '阳朔西街', '龙脊梯田', '象鼻山', '遇龙河漂流', '十里画廊'],
    risks: ['旺季拥挤', '部分景点商业化', '雨季影响漓江'],
    stayDays: '3-5天',
    dailyBudget: '200-400元',
    emoji: '🏔️'
  },
  {
    id: 'qingdao',
    name: '青岛',
    province: '山东',
    tags: ['自然山海', '都市商业', '咖啡书店', '艺术街区'],
    pace: 3,
    costLevel: 3,
    climate: ['summer', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '海滨摩登',
    bestSeason: '6-9月',
    crowd: ['拍照', '轻松旅行', '啤酒', '城市漫游'],
    travelDensity: 3,
    photoFriendly: 4,
    localLife: 4,
    nomadFriendly: 3,
    shortStayScore: 3,
    description: '红瓦绿树碧海蓝天，啤酒飘香的海滨城市。欧式建筑与海景交融，适合轻松漫游和拍照。',
    highlights: ['栈桥', '八大关', '崂山', '青岛啤酒博物馆', '大学路', '小鱼山'],
    risks: ['夏季旅游旺季拥挤', '海鲜消费较高', '冬季海风大'],
    stayDays: '2-4天',
    dailyBudget: '200-450元',
    emoji: '🍺'
  },
  {
    id: 'lijiang',
    name: '丽江',
    province: '云南',
    tags: ['自然山海', '古城街巷', '小镇慢生活', '咖啡书店'],
    pace: 2,
    costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '古城浪漫',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['放空', '情侣', '独行', '慢生活'],
    travelDensity: 3,
    photoFriendly: 4,
    localLife: 3,
    nomadFriendly: 3,
    shortStayScore: 3,
    description: '古城青石板路、玉龙雪山、束河古镇。浪漫与自然并存，适合放空和慢节奏旅行。',
    highlights: ['丽江古城', '玉龙雪山', '束河古镇', '泸沽湖', '蓝月谷', '黑龙潭'],
    risks: ['过度商业化', '旺季人满为患', '高反风险', '消费较高'],
    stayDays: '3-5天',
    dailyBudget: '250-500元',
    emoji: '🏔️'
  },
  {
    id: 'wuhan',
    name: '武汉',
    province: '湖北',
    tags: ['夜市烟火气', '都市商业', '博物馆展览', '古城街巷'],
    pace: 4,
    costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '江湖气韵',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['美食', '文化', '社交', '城市漫游'],
    travelDensity: 3,
    photoFriendly: 3,
    localLife: 4,
    nomadFriendly: 3,
    shortStayScore: 2,
    description: '热干面、黄鹤楼、东湖、武汉大学。一座有江湖气的城市，美食丰富，文化底蕴深厚。',
    highlights: ['黄鹤楼', '东湖', '武汉大学', '户部巷', '江汉路', '湖北省博物馆'],
    risks: ['夏季酷热', '冬季湿冷', '部分区域交通拥堵'],
    stayDays: '2-3天',
    dailyBudget: '150-350元',
    emoji: '🦆'
  },
  {
    id: 'xian',
    name: '西安',
    province: '陕西',
    tags: ['古城街巷', '博物馆展览', '夜市烟火气'],
    pace: 3,
    costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '千年帝都',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['历史', '文化', '美食', '深度探索'],
    travelDensity: 4,
    photoFriendly: 4,
    localLife: 4,
    nomadFriendly: 2,
    shortStayScore: 2,
    description: '兵马俑、城墙、回民街。十三朝古都，历史厚重感扑面而来，适合深度文化探索。',
    highlights: ['兵马俑', '古城墙骑行', '回民街', '大雁塔', '华清宫', '陕西历史博物馆'],
    risks: ['节假日人流量极大', '夏季炎热', '部分景点需提前预约'],
    stayDays: '3-5天',
    dailyBudget: '200-450元',
    emoji: '🏛️'
  },
  {
    id: 'suzhou',
    name: '苏州',
    province: '江苏',
    tags: ['古城街巷', '博物馆展览', '艺术街区', '小镇慢生活'],
    pace: 2,
    costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '园林诗意',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['审美', '文化', '慢生活', '创作者'],
    travelDensity: 2,
    photoFriendly: 4,
    localLife: 3,
    nomadFriendly: 3,
    shortStayScore: 3,
    description: '上有天堂下有苏杭。园林、昆曲、评弹、苏绣，一座充满诗意和审美的城市。',
    highlights: ['拙政园', '虎丘', '平江路', '山塘街', '苏州博物馆', '周庄古镇'],
    risks: ['节假日人流量大', '园林需预约', '梅雨季潮湿'],
    stayDays: '2-3天',
    dailyBudget: '200-400元',
    emoji: '🎋'
  },
  {
    id: 'beijing',
    name: '北京',
    province: '北京',
    tags: ['博物馆展览', '古城街巷', '都市商业', '艺术街区'],
    pace: 4,
    costLevel: 4,
    climate: ['spring', 'autumn'],
    transportFriendly: 5,
    spaceVibe: '帝都大气',
    bestSeason: '4-5月 / 9-10月',
    crowd: ['文化', '历史', '艺术', '创作者'],
    travelDensity: 4,
    photoFriendly: 4,
    localLife: 3,
    nomadFriendly: 3,
    shortStayScore: 3,
    description: '故宫、胡同、798、长城。文化密度极高，适合深度文化探索和灵感采集。',
    highlights: ['故宫', '长城', '颐和园', '798艺术区', '南锣鼓巷', '国家博物馆'],
    risks: ['节假日人满为患', '消费较高', '冬季寒冷干燥', '景点间距离远'],
    stayDays: '3-5天',
    dailyBudget: '300-600元',
    emoji: '🏯'
  },
  {
    id: 'shanghai',
    name: '上海',
    province: '上海',
    tags: ['都市商业', '艺术街区', '咖啡书店', '博物馆展览'],
    pace: 5,
    costLevel: 5,
    climate: ['spring', 'autumn'],
    transportFriendly: 5,
    spaceVibe: '摩登都市',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['都市', '艺术', '社交', '创作者'],
    travelDensity: 5,
    photoFriendly: 4,
    localLife: 3,
    nomadFriendly: 4,
    shortStayScore: 4,
    description: '外滩、法租界、美术馆、咖啡馆。国际化大都市，适合都市探索、艺术灵感和数字游民。',
    highlights: ['外滩', '法租界', '上海当代艺术馆', '武康路', '田子坊', '迪士尼'],
    risks: ['消费极高', '节奏快压力大', '节假日拥挤'],
    stayDays: '2-4天',
    dailyBudget: '400-800元',
    emoji: '🌆'
  },
  {
    id: 'zhuhai',
    name: '珠海',
    province: '广东',
    tags: ['自然山海', '都市商业', '咖啡书店', '小镇慢生活'],
    pace: 3,
    costLevel: 3,
    climate: ['winter', 'spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '海滨宜居',
    bestSeason: '10-12月 / 3-4月',
    crowd: ['放空', '家庭', '短住', '数字游民'],
    travelDensity: 2,
    photoFriendly: 3,
    localLife: 3,
    nomadFriendly: 4,
    shortStayScore: 4,
    description: '百岛之市，海滨宜居。节奏不快不慢，适合短住试居和轻度数字游民。',
    highlights: ['情侣路', '长隆海洋王国', '外伶仃岛', '圆明新园', '珠海渔女', '日月贝'],
    risks: ['台风季节', '夏季炎热', '景点相对分散'],
    stayDays: '2-4天',
    dailyBudget: '200-400元',
    emoji: '🏖️'
  }
];

// ---- 旅游人格类型定义 ----
var PERSONA_TYPES = {
  relax_roamer: {
    name: '松弛城市漫游者',
    icon: '☕',
    color: '#8B7355',
    description: '你喜欢在城市的街巷中慢慢走，没有固定目的地，遇到喜欢的咖啡馆就坐下来，看到有趣的小店就进去逛逛。旅行对你来说不是打卡，而是感受一座城市的呼吸。',
    pace: '慢',
    space: '古城街巷、咖啡书店、老社区',
    emotion: '放空、松弛、被城市接住',
    travelStyle: '少景点、重步行、咖啡馆、老街、展览'
  },
  nature_healer: {
    name: '自然疗愈逃离者',
    icon: '🌿',
    color: '#5B8C5A',
    description: '你渴望远离城市的喧嚣，在大自然中找回内心的平静。山、海、森林、星空——这些是你旅行的关键词。你需要的不是攻略，而是一片能让你深呼吸的空间。',
    pace: '很慢',
    space: '自然山海、森林、海边、高原',
    emotion: '逃离压力、放空、疗愈',
    travelStyle: '低强度自然路线、少商业化、重放空'
  },
  street_explorer: {
    name: '烟火气探索者',
    icon: '🍜',
    color: '#D4764E',
    description: '你最享受的是一座城市的市井气息——早市的叫卖声、夜市的烟火气、巷子口的老面馆、菜市场的新鲜蔬果。旅行对你来说，就是用味蕾和脚步去认识一座城市。',
    pace: '中等',
    space: '夜市、老社区、菜市场、本地餐馆',
    emotion: '社交、热闹、被烟火气包围',
    travelStyle: '夜市、老社区、菜市场、本地餐馆'
  },
  efficient_checker: {
    name: '高效打卡收集者',
    icon: '⚡',
    color: '#4A90D9',
    description: '你的旅行节奏很快，喜欢在有限的时间里尽可能多地体验。你善于规划路线，优化时间，减少折返。对你来说，旅行是一种高效的体验收集。',
    pace: '快',
    space: '都市商业、博物馆展览、地标建筑',
    emotion: '成就感、充实、打卡满足',
    travelStyle: '路线紧凑、交通优化、减少折返'
  },
  creative_collector: {
    name: '灵感采集型创作者',
    icon: '🎨',
    color: '#9B59B6',
    description: '你旅行是为了采集灵感——建筑的线条、街区的色彩、光影的变化、材质的触感。你会在一个地方停留很久，拍照、画画、记录。旅行是你的素材库。',
    pace: '中等偏慢',
    space: '艺术街区、建筑、展览、特色街区',
    emotion: '灵感、审美、创作冲动',
    travelStyle: '建筑、展览、街区、机位、材质观察'
  },
  nomad_trial: {
    name: '轻量数字游民试居者',
    icon: '💻',
    color: '#2C3E50',
    description: '你不只是想旅行，你想知道一座城市适不适合生活。你会关注咖啡馆的WiFi、共享办公空间、租房价格、生活便利度。旅行对你来说，是一次短期的"试住"。',
    pace: '很慢',
    space: '咖啡书店、共享办公、生活社区',
    emotion: '探索可能性、评估适配度',
    travelStyle: '工作空间、生活配套、租住区域、城市日常节奏'
  }
};

// ---- 行程模板（按人格类型） ----
var ITINERARY_TEMPLATES = {
  relax_roamer: {
    morning: ['在本地人常去的早餐店吃一顿慢早餐', '步行探索一条老街或历史街区', '找一家有格调的咖啡馆坐下来，读一本书或写手账'],
    afternoon: ['逛一家独立书店或小型展览', '在公园或河边散步发呆', '随机走进一家有趣的小店'],
    evening: ['在社区附近找一家本地餐馆', '饭后散步，感受城市的夜晚', '回住处整理今天的照片和感受']
  },
  nature_healer: {
    morning: ['早起看日出或晨雾', '在自然环境中慢走或轻度徒步', '找一个安静的地方冥想或写日记'],
    afternoon: ['探索自然景观（湖泊、山林、海岸）', '在自然中野餐或找一家乡村咖啡馆', '观察当地植物和野生动物'],
    evening: ['在安静的地方看日落', '品尝当地简单但新鲜的美食', '早休息，为明天的自然体验养精蓄锐']
  },
  street_explorer: {
    morning: ['去当地最热闹的早市或菜市场', '品尝至少3种本地早餐', '和当地人聊天了解城市故事'],
    afternoon: ['探索老社区和居民区', '找到本地人推荐的小馆子', '逛夜市前先在老街巷走走'],
    evening: ['逛当地最热闹的夜市', '尝试至少5种街头小吃', '在热闹的地方感受城市的烟火气']
  },
  efficient_checker: {
    morning: ['早起，利用上午黄金时间打卡核心景点', '按规划路线高效移动', '每个景点停留30-45分钟，拍照记录'],
    afternoon: ['继续打卡次要景点', '利用午餐时间休息调整', '下午完成剩余景点和购物'],
    evening: ['打卡城市夜景地标', '快速品尝当地特色美食', '整理今天的打卡成果']
  },
  creative_collector: {
    morning: ['在光线最好的时段拍摄建筑和街景', '寻找独特的色彩搭配和材质', '在有趣的街区慢慢走，记录灵感'],
    afternoon: ['参观当地美术馆或创意空间', '在特色咖啡馆整理素材和速写', '探索设计店和手作工坊'],
    evening: ['在光影最美的时段拍摄城市黄昏', '逛文创市集或艺术活动', '整理今天的灵感和创作素材']
  },
  nomad_trial: {
    morning: ['在住处附近体验晨间生活节奏', '考察一家适合远程办公的咖啡馆', '了解周边生活配套（超市、药店、交通）'],
    afternoon: ['在共享办公空间或图书馆工作几小时', '探索可能的居住区域和租房信息', '体验当地日常消费水平'],
    evening: ['和当地社群或远程工作者交流', '评估城市的社交氛围', '记录今天的试居感受']
  }
};

// ---- 手账关键词库 ----
var JOURNAL_KEYWORDS = {
  relax_roamer: ['慢走', '老街', '咖啡', '日落', '发呆', '偶遇', '书店', '青石板'],
  nature_healer: ['呼吸', '星空', '山风', '海浪', '安静', '放空', '治愈', '日出'],
  street_explorer: ['烟火', '夜市', '排队', '辣', '热闹', '本地人', '巷子口', '满足'],
  efficient_checker: ['打卡', '完成', '路线', '高效', '地标', '收藏', '充实', '下一站'],
  creative_collector: ['光影', '线条', '色彩', '材质', '灵感', '构图', '速写', '发现'],
  nomad_trial: ['WiFi', '办公', '社区', '日常', '节奏', '可能性', '适配', '评估']
};

var JOURNAL_QUESTIONS = {
  relax_roamer: ['今天哪个空间让你最想停下来？', '有没有遇到一个有趣的陌生人？', '今天最让你放松的瞬间是什么？'],
  nature_healer: ['今天你听到了哪些自然的声音？', '闭上眼睛，你能记住什么气味？', '今天的自然让你想到了什么？'],
  street_explorer: ['今天最好吃的一口是什么？', '你发现了什么隐藏的好店？', '今天的烟火气里，最打动你的是什么？'],
  efficient_checker: ['今天打卡了几个地方？', '哪个地方超出预期？', '如果重新规划，你会怎么调整路线？'],
  creative_collector: ['今天最打动你的色彩是什么？', '你拍到了最满意的一张照片吗？', '今天的灵感可以用来做什么创作？'],
  nomad_trial: ['你愿意在这座城市住一周吗？', '这里的远程办公体验如何？', '这座城市的生活节奏适合你吗？']
};

var EMOTION_TAGS = {
  relax_roamer: ['松弛', '安静', '被城市接住', '自在', '温柔'],
  nature_healer: ['平静', '疗愈', '自由', '敬畏', '轻盈'],
  street_explorer: ['满足', '热闹', '惊喜', '烟火气', '充实'],
  efficient_checker: ['成就感', '高效', '打卡满足', '充实', '兴奋'],
  creative_collector: ['灵感', '审美愉悦', '创作欲', '好奇', '沉浸'],
  nomad_trial: ['探索感', '可能性', '理性评估', '期待', '真实']
};

// ============================================================
// 匹配算法
// ============================================================

/**
 * 计算用户与城市的匹配度
 * @param {Object} userProfile - 用户画像
 * @param {Object} city - 城市画像
 * @returns {Object} { score, breakdown, reasons, risks }
 */
function calculateMatch(userProfile, city) {
  var breakdown = {};
  var total = 0;

  // 1. 空间偏好匹配 (30%)
  var spaceMatch = calculateSpaceMatch(userProfile.spacePrefs, city.tags);
  breakdown.space = spaceMatch;
  total += spaceMatch * 0.30;

  // 2. 节奏偏好匹配 (20%)
  var paceMatch = calculatePaceMatch(userProfile.pacePref, city.pace);
  breakdown.pace = paceMatch;
  total += paceMatch * 0.20;

  // 3. 消费水平匹配 (20%)
  var costMatch = calculateCostMatch(userProfile.budget, city.costLevel, city.dailyBudget);
  breakdown.cost = costMatch;
  total += costMatch * 0.20;

  // 4. 情绪需求匹配 (15%)
  var emotionMatch = calculateEmotionMatch(userProfile.emotionGoal, city.crowd, city.spaceVibe);
  breakdown.emotion = emotionMatch;
  total += emotionMatch * 0.15;

  // 5. 交通便利度 (10%)
  var transportScore = city.transportFriendly / 5;
  breakdown.transport = transportScore;
  total += transportScore * 0.10;

  // 6. 新鲜感 (5%) - 用户没去过的城市加分
  var freshness = 1.0;
  if (userProfile.visitedCities && userProfile.visitedCities.indexOf(city.name) !== -1) {
    freshness = 0.3;
  }
  breakdown.freshness = freshness;
  total += freshness * 0.05;

  // 生成推荐理由
  var reasons = generateReasons(userProfile, city, breakdown);
  var risks = city.risks || [];

  return {
    score: Math.round(total * 100),
    breakdown: breakdown,
    reasons: reasons,
    risks: risks
  };
}

function calculateSpaceMatch(userPrefs, cityTags) {
  if (!userPrefs || userPrefs.length === 0) return 0.7;
  var matchCount = 0;
  for (var i = 0; i < userPrefs.length; i++) {
    if (cityTags.indexOf(userPrefs[i]) !== -1) {
      matchCount++;
    }
  }
  return Math.min(1, matchCount / Math.max(1, userPrefs.length) * 1.2);
}

function calculatePaceMatch(userPace, cityPace) {
  // userPace: 1=特种兵 2=紧凑 3=适中 4=松弛 5=很慢
  var diff = Math.abs(userPace - cityPace);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.8;
  if (diff === 2) return 0.5;
  return 0.2;
}

function calculateCostMatch(budget, cityCost, cityDailyBudget) {
  if (!budget) return 0.7;
  // budget is total budget, estimate daily from city
  var budgetNum = parseInt(budget);
  if (isNaN(budgetNum)) return 0.7;
  var avgDaily = budgetNum / 4; // assume 4 days
  var cityMin = parseInt(cityDailyBudget.split('-')[0]);
  if (avgDaily >= cityMin * 1.5) return 1.0;
  if (avgDaily >= cityMin) return 0.8;
  if (avgDaily >= cityMin * 0.7) return 0.5;
  return 0.2;
}

function calculateEmotionMatch(emotionGoal, cityCrowd, cityVibe) {
  if (!emotionGoal) return 0.7;
  var matchCount = 0;
  var allTags = cityCrowd.concat([cityVibe]);
  if (allTags.indexOf(emotionGoal) !== -1) matchCount++;
  // partial match
  var emotionKeywords = {
    '放空': ['放空', '慢生活', '自然'],
    '逃离压力': ['逃离', '放空', '自然', '精神'],
    '找灵感': ['灵感采集', '创作者', '审美', '艺术'],
    '拍照出片': ['拍照', '审美', '艺术'],
    '社交': ['社交', '美食', '夜生活'],
    '独处整理': ['独行', '放空', '慢生活'],
    '试住城市': ['数字游民', '短住']
  };
  var keywords = emotionKeywords[emotionGoal] || [];
  for (var i = 0; i < keywords.length; i++) {
    for (var j = 0; j < allTags.length; j++) {
      if (allTags[j].indexOf(keywords[i]) !== -1) {
        matchCount++;
        break;
      }
    }
  }
  return Math.min(1, 0.4 + matchCount * 0.2);
}

function generateReasons(userProfile, city, breakdown) {
  var reasons = [];

  if (breakdown.space > 0.7) {
    reasons.push('城市空间气质与你的偏好高度契合');
  }
  if (breakdown.pace > 0.7) {
    reasons.push('旅行节奏与你的风格匹配');
  }
  if (breakdown.cost > 0.7) {
    reasons.push('消费水平在你的预算范围内');
  }
  if (breakdown.emotion > 0.7) {
    reasons.push('能满足你本次旅行的情绪需求');
  }
  if (city.nomadFriendly >= 4 && userProfile.considerNomad) {
    reasons.push('数字游民友好度较高，适合试居');
  }
  if (city.photoFriendly >= 4) {
    reasons.push('出片率高，适合拍照记录');
  }
  if (reasons.length === 0) {
    reasons.push('综合评估适合你的旅行风格');
  }
  return reasons;
}

/**
 * 获取推荐城市列表
 */
function getRecommendedCities(userProfile, topN) {
  topN = topN || 3;
  var results = [];

  for (var i = 0; i < CITY_DATABASE.length; i++) {
    var city = CITY_DATABASE[i];
    var match = calculateMatch(userProfile, city);
    results.push({
      city: city,
      match: match
    });
  }

  results.sort(function(a, b) { return b.match.score - a.match.score; });
  return results.slice(0, topN);
}

/**
 * v2: 根据用户输入推断旅游人格（情绪优先 + 空间辅助）
 * 
 * 核心改进：
 * - 情绪是第一驱动力，权重最高
 * - 空间偏好作为辅助信号，细化人格
 * - 无明确信号时，用情绪映射 + 旅行时长推断节奏
 */
function inferPersona(userProfile) {
  var scores = {};

  // ===== 第一优先级：情绪目标（权重最高） =====
  if (userProfile.emotionGoal) {
    var emotionMap = {
      '放空':       { relax_roamer: 5, nature_healer: 4 },
      '逃离压力':   { nature_healer: 5, relax_roamer: 2 },
      '找灵感':     { creative_collector: 5, relax_roamer: 2 },
      '拍照出片':   { creative_collector: 4, efficient_checker: 3, relax_roamer: 2 },
      '社交':       { street_explorer: 5, efficient_checker: 2 },
      '独处整理':   { relax_roamer: 4, nature_healer: 4 },
      '试住城市':   { nomad_trial: 5, relax_roamer: 2 }
    };
    var emScores = emotionMap[userProfile.emotionGoal] || {};
    for (var key in emScores) {
      scores[key] = (scores[key] || 0) + emScores[key];
    }
  }

  // ===== 第二优先级：空间偏好（辅助细化） =====
  if (userProfile.spacePrefs && userProfile.spacePrefs.length > 0) {
    for (var i = 0; i < userProfile.spacePrefs.length; i++) {
      var sp = userProfile.spacePrefs[i];
      if (sp === '古城街巷' || sp === '咖啡书店') scores.relax_roamer = (scores.relax_roamer || 0) + 2;
      if (sp === '自然山海') scores.nature_healer = (scores.nature_healer || 0) + 3;
      if (sp === '夜市烟火气') scores.street_explorer = (scores.street_explorer || 0) + 3;
      if (sp === '都市商业' || sp === '博物馆展览') scores.efficient_checker = (scores.efficient_checker || 0) + 2;
      if (sp === '艺术街区') scores.creative_collector = (scores.creative_collector || 0) + 3;
      if (sp === '小镇慢生活') { 
        scores.relax_roamer = (scores.relax_roamer || 0) + 1; 
        scores.nature_healer = (scores.nature_healer || 0) + 1; 
      }
    }
  }

  // ===== 第三优先级：旅行时长推断节奏 =====
  // 如果用户没有明确设置空间偏好，用时间长度辅助推断
  if (!userProfile.spacePrefs || userProfile.spacePrefs.length === 0) {
    if (userProfile.travelTime) {
      if (userProfile.travelTime.indexOf('1天') === 0) {
        // 短途 → 偏高能、高效
        scores.efficient_checker = (scores.efficient_checker || 0) + 1;
        scores.street_explorer = (scores.street_explorer || 0) + 1;
      } else if (userProfile.travelTime.indexOf('7') === 0) {
        // 长途 → 偏慢节奏、深度
        scores.relax_roamer = (scores.relax_roamer || 0) + 1;
        scores.nature_healer = (scores.nature_healer || 0) + 1;
        scores.nomad_trial = (scores.nomad_trial || 0) + 1;
      }
    }
  }

  // ===== 第四优先级：数字游民意向 =====
  if (userProfile.considerNomad) {
    scores.nomad_trial = (scores.nomad_trial || 0) + 4;
  }

  // ===== 第五优先级：预算感知消费倾向 =====
  if (userProfile.budget) {
    var budgetNum = parseInt(userProfile.budget);
    if (!isNaN(budgetNum)) {
      if (budgetNum <= 500) {
        // 低预算 → 偏高性价比探索
        scores.street_explorer = (scores.street_explorer || 0) + 1;
      } else if (budgetNum >= 5000) {
        // 高预算 → 偏品质、都市
        scores.efficient_checker = (scores.efficient_checker || 0) + 1;
      }
    }
  }

  // 找最高分
  var maxScore = 0;
  var bestPersona = 'relax_roamer';
  for (var key in scores) {
    if (scores[key] > maxScore) {
      maxScore = scores[key];
      bestPersona = key;
    }
  }

  if (maxScore === 0) bestPersona = 'relax_roamer';
  return bestPersona;
}

/**
 * 生成个性化行程
 */
function generateItinerary(city, personaType, days) {
  days = days || 3;
  var template = ITINERARY_TEMPLATES[personaType] || ITINERARY_TEMPLATES.relax_roamer;
  var itinerary = [];

  for (var d = 0; d < days; d++) {
    var dayPlan = {
      day: d + 1,
      title: 'Day ' + (d + 1),
      morning: template.morning[d % template.morning.length],
      afternoon: template.afternoon[d % template.afternoon.length],
      evening: template.evening[d % template.evening.length],
      highlights: city.highlights.slice(d * 2, d * 2 + 2),
      tips: []
    };

    // 添加城市特定提示
    if (d === 0) {
      dayPlan.tips.push('今天是第一天，建议先熟悉城市节奏，不要安排太满');
    }
    if (d === days - 1) {
      dayPlan.tips.push('最后一天，留一些时间买纪念品和告别');
    }
    if (city.risks && city.risks.length > 0) {
      dayPlan.tips.push('注意：' + city.risks[0]);
    }

    itinerary.push(dayPlan);
  }

  return itinerary;
}

/**
 * 生成手账数据
 */
function generateJournalData(personaType, dayIndex) {
  var keywords = JOURNAL_KEYWORDS[personaType] || JOURNAL_KEYWORDS.relax_roamer;
  var questions = JOURNAL_QUESTIONS[personaType] || JOURNAL_QUESTIONS.relax_roamer;
  var emotions = EMOTION_TAGS[personaType] || EMOTION_TAGS.relax_roamer;

  // 随机选3个关键词
  var shuffled = keywords.slice().sort(function() { return 0.5 - Math.random(); });
  var todayKeywords = shuffled.slice(0, 3);

  // 选一个问题
  var todayQuestion = questions[dayIndex % questions.length];

  // 选3个情绪标签
  var shuffledEmotions = emotions.slice().sort(function() { return 0.5 - Math.random(); });
  var todayEmotions = shuffledEmotions.slice(0, 3);

  return {
    keywords: todayKeywords,
    question: todayQuestion,
    emotions: todayEmotions
  };
}
