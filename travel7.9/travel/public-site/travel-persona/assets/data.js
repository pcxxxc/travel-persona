// ============================================================
// 旅格 Travel Persona v2 - 城市目的地画像数据库 & 匹配算法
// 六维向量版本 (freedom, social, explore, nature, pace, budget)
// 同时保留旧版展示字段以兼容前端渲染
// ============================================================

// ---- 城市画像数据库（v2 六维向量 + 旧版展示字段） ----
var CITY_DATABASE = [
  // ========== 自然疗愈型 ==========
  {
    id: 'dali',
    name: '大理',
    province: '云南',
    // v2 六维向量 (0~1)
    dimensions: { freedom: 0.80, social: 0.30, explore: 0.60, nature: 0.90, pace: 0.20, budget: 0.45 },
    emotionTags: ['治愈', '逃离', '放空', '慢生活'],
    // 旧版展示字段
    tags: ['自然山海', '古城街巷', '咖啡书店', '小镇慢生活'],
    pace: 1, costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '自然疗愈',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['放空', '慢生活', '数字游民', '独行'],
    travelDensity: 2, photoFriendly: 4, localLife: 4, nomadFriendly: 5, shortStayScore: 5,
    description: '苍山洱海之间，古城与自然交融。适合放空、骑行环海、咖啡馆发呆，是数字游民和慢生活爱好者的理想之地。',
    highlights: ['洱海骑行', '古城漫步', '苍山徒步', '喜洲古镇', '双廊日落'],
    risks: ['雨季影响出行', '旺季人流量大', '部分区域商业化'],
    stayDays: '3-7天', dailyBudget: '200-400元', emoji: '🏔️'
  },
  {
    id: 'lijiang',
    name: '丽江',
    province: '云南',
    dimensions: { freedom: 0.75, social: 0.50, explore: 0.55, nature: 0.80, pace: 0.30, budget: 0.50 },
    emotionTags: ['浪漫', '古城', '雪山', '慢生活'],
    tags: ['自然山海', '古城街巷', '小镇慢生活', '咖啡书店'],
    pace: 1, costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '古城浪漫',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['放空', '情侣', '独行', '慢生活'],
    travelDensity: 3, photoFriendly: 4, localLife: 3, nomadFriendly: 3, shortStayScore: 3,
    description: '古城青石板路、玉龙雪山、束河古镇。浪漫与自然并存，适合放空和慢节奏旅行。',
    highlights: ['丽江古城', '玉龙雪山', '束河古镇', '泸沽湖', '蓝月谷', '黑龙潭'],
    risks: ['过度商业化', '旺季人满为患', '高反风险', '消费较高'],
    stayDays: '3-5天', dailyBudget: '250-500元', emoji: '🏔️'
  },
  {
    id: 'xiamen',
    name: '厦门',
    province: '福建',
    dimensions: { freedom: 0.70, social: 0.55, explore: 0.50, nature: 0.65, pace: 0.40, budget: 0.55 },
    emotionTags: ['文艺', '海岛', '慢生活', '清新'],
    tags: ['自然山海', '咖啡书店', '艺术街区', '小镇慢生活'],
    pace: 3, costLevel: 3,
    climate: ['spring', 'autumn', 'winter'],
    transportFriendly: 4,
    spaceVibe: '海滨文艺',
    bestSeason: '3-5月 / 10-12月',
    crowd: ['拍照', '轻松旅行', '情侣', '独行'],
    travelDensity: 3, photoFriendly: 5, localLife: 3, nomadFriendly: 3, shortStayScore: 3,
    description: '鼓浪屿的钢琴声、曾厝垵的文艺小店、环岛路的海风。一座适合拍照、散步、发呆的海滨城市。',
    highlights: ['鼓浪屿', '曾厝垵', '环岛路骑行', '南普陀寺', '沙坡尾艺术区', '中山路步行街'],
    risks: ['台风季节影响', '鼓浪屿限流需预约', '旺季住宿涨价'],
    stayDays: '2-4天', dailyBudget: '200-450元', emoji: '🌊'
  },
  {
    id: 'qinghaihu',
    name: '青海湖',
    province: '青海',
    dimensions: { freedom: 0.85, social: 0.15, explore: 0.70, nature: 0.95, pace: 0.15, budget: 0.35 },
    emotionTags: ['孤独', '辽阔', '治愈', '逃离'],
    tags: ['自然山海', '小镇慢生活'],
    pace: 1, costLevel: 2,
    climate: ['summer', 'autumn'],
    transportFriendly: 2,
    spaceVibe: '高原圣湖',
    bestSeason: '6-9月',
    crowd: ['逃离', '放空', '独行', '摄影'],
    travelDensity: 2, photoFriendly: 5, localLife: 2, nomadFriendly: 1, shortStayScore: 2,
    description: '中国最大的内陆湖，天空之镜、高原草甸、油菜花海。适合寻找辽阔与孤独的旅行者。',
    highlights: ['环湖西路', '茶卡盐湖', '黑马河日出', '鸟岛', '油菜花田'],
    risks: ['高反风险', '紫外线强', '季节性明显', '公共交通不便'],
    stayDays: '2-4天', dailyBudget: '200-400元', emoji: '🌊'
  },

  // ========== 城市漫游型 ==========
  {
    id: 'chengdu',
    name: '成都',
    province: '四川',
    dimensions: { freedom: 0.65, social: 0.60, explore: 0.50, nature: 0.40, pace: 0.35, budget: 0.50 },
    emotionTags: ['烟火气', '美食', '慢生活', '巴适'],
    tags: ['夜市烟火气', '都市商业', '咖啡书店', '古城街巷'],
    pace: 3, costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '烟火人间',
    bestSeason: '3-6月 / 9-11月',
    crowd: ['美食', '慢生活', '社交', '城市漫游'],
    travelDensity: 3, photoFriendly: 3, localLife: 5, nomadFriendly: 4, shortStayScore: 4,
    description: '火锅、茶馆、熊猫、宽窄巷子。一座来了就不想走的城市，烟火气与文艺气息并存。',
    highlights: ['宽窄巷子', '人民公园喝茶', '春熙路', '熊猫基地', '玉林路小酒馆', '锦里夜游'],
    risks: ['夏季闷热', '部分景点商业化', '交通高峰拥堵'],
    stayDays: '3-5天', dailyBudget: '250-500元', emoji: '🐼'
  },
  {
    id: 'suzhou',
    name: '苏州',
    province: '江苏',
    dimensions: { freedom: 0.55, social: 0.40, explore: 0.60, nature: 0.55, pace: 0.30, budget: 0.55 },
    emotionTags: ['江南', '园林', '慢生活', '雅致'],
    tags: ['古城街巷', '博物馆展览', '艺术街区', '小镇慢生活'],
    pace: 2, costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '园林诗意',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['审美', '文化', '慢生活', '创作者'],
    travelDensity: 2, photoFriendly: 4, localLife: 3, nomadFriendly: 3, shortStayScore: 3,
    description: '上有天堂下有苏杭。园林、昆曲、评弹、苏绣，一座充满诗意和审美的城市。',
    highlights: ['拙政园', '虎丘', '平江路', '山塘街', '苏州博物馆', '周庄古镇'],
    risks: ['节假日人流量大', '园林需预约', '梅雨季潮湿'],
    stayDays: '2-3天', dailyBudget: '200-400元', emoji: '🎋'
  },
  {
    id: 'hangzhou',
    name: '杭州',
    province: '浙江',
    dimensions: { freedom: 0.60, social: 0.50, explore: 0.50, nature: 0.60, pace: 0.40, budget: 0.60 },
    emotionTags: ['西湖', '文艺', '慢生活', '清新'],
    tags: ['自然山海', '艺术街区', '咖啡书店', '都市商业'],
    pace: 3, costLevel: 4,
    climate: ['spring', 'autumn'],
    transportFriendly: 5,
    spaceVibe: '诗意审美',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['灵感采集', '审美', '自然', '创作者'],
    travelDensity: 3, photoFriendly: 4, localLife: 4, nomadFriendly: 4, shortStayScore: 4,
    description: '西湖、龙井、南宋御街。自然与城市完美结合，审美友好，适合灵感采集和创作者寻找素材。',
    highlights: ['西湖漫步', '灵隐寺', '龙井茶园', '南宋御街', '中国美术学院', '西溪湿地'],
    risks: ['节假日人流量极大', '消费水平较高', '梅雨季潮湿'],
    stayDays: '2-4天', dailyBudget: '300-600元', emoji: '🍵'
  },
  {
    id: 'beijing',
    name: '北京',
    province: '北京',
    dimensions: { freedom: 0.50, social: 0.70, explore: 0.75, nature: 0.40, pace: 0.70, budget: 0.70 },
    emotionTags: ['历史', '文化', '大气', '多元'],
    tags: ['博物馆展览', '古城街巷', '都市商业', '艺术街区'],
    pace: 4, costLevel: 4,
    climate: ['spring', 'autumn'],
    transportFriendly: 5,
    spaceVibe: '帝都大气',
    bestSeason: '4-5月 / 9-10月',
    crowd: ['文化', '历史', '艺术', '创作者'],
    travelDensity: 4, photoFriendly: 4, localLife: 3, nomadFriendly: 3, shortStayScore: 3,
    description: '故宫、胡同、798、长城。文化密度极高，适合深度文化探索和灵感采集。',
    highlights: ['故宫', '长城', '颐和园', '798艺术区', '南锣鼓巷', '国家博物馆'],
    risks: ['节假日人满为患', '消费较高', '冬季寒冷干燥', '景点间距离远'],
    stayDays: '3-5天', dailyBudget: '300-600元', emoji: '🏯'
  },

  // ========== 烟火气探索型 ==========
  {
    id: 'chongqing',
    name: '重庆',
    province: '重庆',
    dimensions: { freedom: 0.60, social: 0.70, explore: 0.65, nature: 0.35, pace: 0.60, budget: 0.45 },
    emotionTags: ['魔幻', '火锅', '烟火气', '立体'],
    tags: ['夜市烟火气', '都市商业', '古城街巷'],
    pace: 4, costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '山城魔幻',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['探索', '夜景', '美食', '拍照'],
    travelDensity: 4, photoFriendly: 5, localLife: 4, nomadFriendly: 2, shortStayScore: 2,
    description: '8D魔幻山城，轻轨穿楼、洪崖洞夜景、火锅飘香。空间层次丰富，适合街巷探索和拍照打卡。',
    highlights: ['洪崖洞', '解放碑', '磁器口', '长江索道', '李子坝轻轨站', '南山一棵树'],
    risks: ['夏季酷热', '地形复杂体力消耗大', '导航容易迷路'],
    stayDays: '2-4天', dailyBudget: '150-350元', emoji: '🌃'
  },
  {
    id: 'xian',
    name: '西安',
    province: '陕西',
    dimensions: { freedom: 0.50, social: 0.65, explore: 0.70, nature: 0.30, pace: 0.55, budget: 0.45 },
    emotionTags: ['历史', '面食', '烟火气', '厚重'],
    tags: ['古城街巷', '博物馆展览', '夜市烟火气'],
    pace: 3, costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '千年帝都',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['历史', '文化', '美食', '深度探索'],
    travelDensity: 4, photoFriendly: 4, localLife: 4, nomadFriendly: 2, shortStayScore: 2,
    description: '兵马俑、城墙、回民街。十三朝古都，历史厚重感扑面而来，适合深度文化探索。',
    highlights: ['兵马俑', '古城墙骑行', '回民街', '大雁塔', '华清宫', '陕西历史博物馆'],
    risks: ['节假日人流量极大', '夏季炎热', '部分景点需提前预约'],
    stayDays: '3-5天', dailyBudget: '200-450元', emoji: '🏛️'
  },
  {
    id: 'guangzhou',
    name: '广州',
    province: '广东',
    dimensions: { freedom: 0.55, social: 0.70, explore: 0.50, nature: 0.35, pace: 0.55, budget: 0.55 },
    emotionTags: ['早茶', '烟火气', '务实', '美食'],
    tags: ['夜市烟火气', '都市商业', '古城街巷', '博物馆展览'],
    pace: 3, costLevel: 3,
    climate: ['spring', 'autumn', 'winter'],
    transportFriendly: 5,
    spaceVibe: '岭南烟火',
    bestSeason: '10-12月 / 3-4月',
    crowd: ['美食', '城市漫游', '文化', '购物'],
    travelDensity: 4, photoFriendly: 3, localLife: 5, nomadFriendly: 3, shortStayScore: 3,
    description: '食在广州，早茶、烧腊、糖水、煲仔饭。一座用味蕾认识的城市，烟火气渗透在每一条街巷。',
    highlights: ['上下九', '沙面', '广州塔', '陈家祠', '北京路', '珠江夜游'],
    risks: ['夏季闷热潮湿', '部分区域拥堵', '方言沟通偶有障碍'],
    stayDays: '2-4天', dailyBudget: '200-500元', emoji: '🥟'
  },
  {
    id: 'changsha',
    name: '长沙',
    province: '湖南',
    dimensions: { freedom: 0.60, social: 0.75, explore: 0.50, nature: 0.30, pace: 0.65, budget: 0.40 },
    emotionTags: ['烟火气', '美食', '夜生活', '活力'],
    tags: ['夜市烟火气', '都市商业', '古城街巷'],
    pace: 4, costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '热辣活力',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['社交', '美食', '夜生活', '短途高能'],
    travelDensity: 4, photoFriendly: 3, localLife: 5, nomadFriendly: 2, shortStayScore: 2,
    description: '茶颜悦色、文和友、橘子洲。夜生活丰富、美食密度极高，适合社交和短途高能体验。',
    highlights: ['橘子洲', '岳麓山', '太平老街', '坡子街', '超级文和友', '湖南博物院'],
    risks: ['夏季酷热', '夜生活噪音', '热门店排队时间长'],
    stayDays: '2-3天', dailyBudget: '150-350元', emoji: '🌶️'
  },

  // ========== 高效打卡型 ==========
  {
    id: 'shanghai',
    name: '上海',
    province: '上海',
    dimensions: { freedom: 0.55, social: 0.75, explore: 0.65, nature: 0.30, pace: 0.80, budget: 0.80 },
    emotionTags: ['摩登', '多元', '高效', '精致'],
    tags: ['都市商业', '艺术街区', '咖啡书店', '博物馆展览'],
    pace: 5, costLevel: 5,
    climate: ['spring', 'autumn'],
    transportFriendly: 5,
    spaceVibe: '摩登都市',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['都市', '艺术', '社交', '创作者'],
    travelDensity: 5, photoFriendly: 4, localLife: 3, nomadFriendly: 4, shortStayScore: 4,
    description: '外滩、法租界、美术馆、咖啡馆。国际化大都市，适合都市探索、艺术灵感和数字游民。',
    highlights: ['外滩', '法租界', '上海当代艺术馆', '武康路', '田子坊', '迪士尼'],
    risks: ['消费极高', '节奏快压力大', '节假日拥挤'],
    stayDays: '2-4天', dailyBudget: '400-800元', emoji: '🌆'
  },
  {
    id: 'shenzhen',
    name: '深圳',
    province: '广东',
    dimensions: { freedom: 0.60, social: 0.65, explore: 0.55, nature: 0.45, pace: 0.85, budget: 0.70 },
    emotionTags: ['现代', '高效', '年轻', '创新'],
    tags: ['都市商业', '艺术街区', '自然山海', '咖啡书店'],
    pace: 5, costLevel: 4,
    climate: ['spring', 'autumn', 'winter'],
    transportFriendly: 5,
    spaceVibe: '创新都市',
    bestSeason: '10-12月 / 3-4月',
    crowd: ['年轻', '科技', '创新', '高效'],
    travelDensity: 4, photoFriendly: 3, localLife: 3, nomadFriendly: 4, shortStayScore: 3,
    description: '深圳湾、华侨城、科技园。一座年轻的城市，适合高效打卡和感受中国创新的脉搏。',
    highlights: ['深圳湾公园', '华侨城创意园', '大梅沙', '平安金融中心', '世界之窗'],
    risks: ['夏季炎热', '消费较高', '文化底蕴相对薄弱'],
    stayDays: '2-3天', dailyBudget: '300-600元', emoji: '🚀'
  },
  {
    id: 'nanjing',
    name: '南京',
    province: '江苏',
    dimensions: { freedom: 0.50, social: 0.55, explore: 0.65, nature: 0.45, pace: 0.50, budget: 0.50 },
    emotionTags: ['历史', '厚重', '梧桐', '雅致'],
    tags: ['古城街巷', '博物馆展览', '都市商业', '自然山海'],
    pace: 3, costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 5,
    spaceVibe: '六朝古都',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['文化', '历史', '城市漫游', '美食'],
    travelDensity: 3, photoFriendly: 4, localLife: 4, nomadFriendly: 3, shortStayScore: 3,
    description: '六朝古都，梧桐树下的浪漫。历史底蕴深厚，文化密度高，适合城市漫游和历史爱好者。',
    highlights: ['中山陵', '夫子庙', '明孝陵', '南京博物院', '先锋书店', '颐和路'],
    risks: ['夏季酷热', '节假日人流量大', '部分景点需预约'],
    stayDays: '2-4天', dailyBudget: '200-400元', emoji: '🍂'
  },

  // ========== 灵感采集型 ==========
  {
    id: 'qingdao',
    name: '青岛',
    province: '山东',
    dimensions: { freedom: 0.65, social: 0.50, explore: 0.55, nature: 0.60, pace: 0.40, budget: 0.55 },
    emotionTags: ['海滨', '文艺', '啤酒', '清新'],
    tags: ['自然山海', '都市商业', '咖啡书店', '艺术街区'],
    pace: 3, costLevel: 3,
    climate: ['summer', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '海滨摩登',
    bestSeason: '6-9月',
    crowd: ['拍照', '轻松旅行', '啤酒', '城市漫游'],
    travelDensity: 3, photoFriendly: 4, localLife: 4, nomadFriendly: 3, shortStayScore: 3,
    description: '红瓦绿树碧海蓝天，啤酒飘香的海滨城市。欧式建筑与海景交融，适合轻松漫游和拍照。',
    highlights: ['栈桥', '八大关', '崂山', '青岛啤酒博物馆', '大学路', '小鱼山'],
    risks: ['夏季旅游旺季拥挤', '海鲜消费较高', '冬季海风大'],
    stayDays: '2-4天', dailyBudget: '200-450元', emoji: '🍺'
  },
  {
    id: 'dalian',
    name: '大连',
    province: '辽宁',
    dimensions: { freedom: 0.60, social: 0.45, explore: 0.50, nature: 0.55, pace: 0.40, budget: 0.50 },
    emotionTags: ['海滨', '浪漫', '清新', '欧式'],
    tags: ['自然山海', '都市商业', '艺术街区', '咖啡书店'],
    pace: 3, costLevel: 3,
    climate: ['summer', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '浪漫海滨',
    bestSeason: '6-9月',
    crowd: ['拍照', '浪漫', '轻松旅行', '家庭'],
    travelDensity: 3, photoFriendly: 4, localLife: 3, nomadFriendly: 2, shortStayScore: 2,
    description: '星海广场、滨海路、老虎滩。东北最浪漫的海滨城市，欧式建筑与海景交织。',
    highlights: ['星海广场', '老虎滩', '滨海路', '俄罗斯风情街', '棒棰岛'],
    risks: ['冬季寒冷', '旅游季节性强', '部分景点距离较远'],
    stayDays: '2-3天', dailyBudget: '200-400元', emoji: '🌊'
  },

  // ========== 数字游民试居型 ==========
  {
    id: 'dali_digital',
    name: '大理（数字游民版）',
    province: '云南',
    dimensions: { freedom: 0.90, social: 0.40, explore: 0.55, nature: 0.80, pace: 0.20, budget: 0.40 },
    emotionTags: ['数字游民', '慢生活', '逃离', '自由'],
    tags: ['小镇慢生活', '咖啡书店', '自然山海'],
    pace: 1, costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '游民社区',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['数字游民', '远程办公', '短住', '社群'],
    travelDensity: 2, photoFriendly: 4, localLife: 4, nomadFriendly: 5, shortStayScore: 5,
    description: 'NCC社区、共享办公、洱海骑行。中国数字游民最集中的地方之一，适合短期试居和远程办公。',
    highlights: ['NCC社区', '洱海生态廊道', '三月街', '才村码头', '古城咖啡馆'],
    risks: ['网络稳定性需考察', '旺季租房紧张', '医疗资源有限'],
    stayDays: '7-30天', dailyBudget: '150-300元', emoji: '💻'
  },
  {
    id: 'lijiang_digital',
    name: '丽江（数字游民版）',
    province: '云南',
    dimensions: { freedom: 0.85, social: 0.45, explore: 0.50, nature: 0.75, pace: 0.25, budget: 0.45 },
    emotionTags: ['数字游民', '慢生活', '自由', '逃离'],
    tags: ['小镇慢生活', '咖啡书店', '自然山海', '古城街巷'],
    pace: 1, costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '古城游民',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['数字游民', '远程办公', '短住'],
    travelDensity: 2, photoFriendly: 4, localLife: 3, nomadFriendly: 4, shortStayScore: 4,
    description: '束河古镇咖啡馆、白沙壁画。比大理更安静的数字游民选择，低成本慢生活。',
    highlights: ['束河古镇咖啡馆', '白沙古镇', '玉龙雪山脚下', '丽江古城'],
    risks: ['高反风险', '网络覆盖需考察', '医疗资源有限'],
    stayDays: '7-30天', dailyBudget: '150-300元', emoji: '💻'
  },
  {
    id: 'chengdu_digital',
    name: '成都（数字游民版）',
    province: '四川',
    dimensions: { freedom: 0.70, social: 0.55, explore: 0.45, nature: 0.35, pace: 0.35, budget: 0.50 },
    emotionTags: ['数字游民', '烟火气', '美食', '巴适'],
    tags: ['都市商业', '咖啡书店', '夜市烟火气'],
    pace: 2, costLevel: 3,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '巴适游民',
    bestSeason: '3-6月 / 9-11月',
    crowd: ['数字游民', '美食', '社群', '短住'],
    travelDensity: 3, photoFriendly: 3, localLife: 5, nomadFriendly: 4, shortStayScore: 4,
    description: '玉林路咖啡馆、共享办公空间、社区活动。烟火气与数字游民生活的完美结合。',
    highlights: ['玉林路咖啡馆', '人民公园', '太古里共享办公', '锦里夜游'],
    risks: ['夏季闷热', '租房竞争激烈', '部分区域噪音'],
    stayDays: '7-30天', dailyBudget: '200-350元', emoji: '💻'
  },

  // ========== 扩展城市（旧版保留） ==========
  {
    id: 'sanya',
    name: '三亚', province: '海南',
    dimensions: { freedom: 0.55, social: 0.40, explore: 0.30, nature: 0.80, pace: 0.25, budget: 0.85 },
    emotionTags: ['度假', '海岛', '放空', '热带'],
    tags: ['自然山海', '小镇慢生活'],
    pace: 1, costLevel: 5,
    climate: ['winter', 'spring'],
    transportFriendly: 3,
    spaceVibe: '热带度假',
    bestSeason: '11月-次年3月',
    crowd: ['放空', '度假', '家庭', '情侣'],
    travelDensity: 3, photoFriendly: 4, localLife: 2, nomadFriendly: 2, shortStayScore: 3,
    description: '碧海蓝天椰林，中国最南端的热带度假胜地。适合放空、海边发呆、水上运动。',
    highlights: ['亚龙湾', '天涯海角', '蜈支洲岛', '南山寺', '椰梦长廊', '后海村冲浪'],
    risks: ['消费极高', '旺季人满为患', '夏季台风', '旅游陷阱较多'],
    stayDays: '3-5天', dailyBudget: '500-1500元', emoji: '🌴'
  },
  {
    id: 'lasa',
    name: '拉萨', province: '西藏',
    dimensions: { freedom: 0.70, social: 0.20, explore: 0.60, nature: 0.85, pace: 0.10, budget: 0.70 },
    emotionTags: ['神圣', '纯净', '逃离', '精神'],
    tags: ['自然山海', '博物馆展览', '古城街巷'],
    pace: 1, costLevel: 4,
    climate: ['summer', 'autumn'],
    transportFriendly: 2,
    spaceVibe: '神圣纯净',
    bestSeason: '6-9月',
    crowd: ['逃离', '放空', '独行', '精神'],
    travelDensity: 2, photoFriendly: 5, localLife: 3, nomadFriendly: 2, shortStayScore: 2,
    description: '布达拉宫、大昭寺、八廓街。离天空最近的城市，适合逃离压力、寻找内心平静和精神洗礼。',
    highlights: ['布达拉宫', '大昭寺', '八廓街', '纳木错', '色拉寺辩经', '玛吉阿米'],
    risks: ['高反风险', '紫外线极强', '消费较高', '需提前适应海拔'],
    stayDays: '3-7天', dailyBudget: '300-600元', emoji: '🛕'
  },
  {
    id: 'guilin',
    name: '桂林', province: '广西',
    dimensions: { freedom: 0.60, social: 0.35, explore: 0.30, nature: 0.90, pace: 0.25, budget: 0.30 },
    emotionTags: ['山水', '画卷', '放空', '自然'],
    tags: ['自然山海', '小镇慢生活'],
    pace: 1, costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 3,
    spaceVibe: '山水画卷',
    bestSeason: '4-10月',
    crowd: ['自然', '放空', '拍照', '家庭'],
    travelDensity: 3, photoFriendly: 5, localLife: 3, nomadFriendly: 2, shortStayScore: 2,
    description: '桂林山水甲天下。漓江竹筏、阳朔西街、龙脊梯田，一幅天然山水画卷。',
    highlights: ['漓江竹筏', '阳朔西街', '龙脊梯田', '象鼻山', '遇龙河漂流', '十里画廊'],
    risks: ['旺季拥挤', '部分景点商业化', '雨季影响漓江'],
    stayDays: '3-5天', dailyBudget: '200-400元', emoji: '🏔️'
  },
  {
    id: 'wuhan',
    name: '武汉', province: '湖北',
    dimensions: { freedom: 0.50, social: 0.65, explore: 0.40, nature: 0.30, pace: 0.60, budget: 0.30 },
    emotionTags: ['江湖', '美食', '烟火气', '活力'],
    tags: ['夜市烟火气', '都市商业', '博物馆展览', '古城街巷'],
    pace: 4, costLevel: 2,
    climate: ['spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '江湖气韵',
    bestSeason: '3-5月 / 9-11月',
    crowd: ['美食', '文化', '社交', '城市漫游'],
    travelDensity: 3, photoFriendly: 3, localLife: 4, nomadFriendly: 3, shortStayScore: 2,
    description: '热干面、黄鹤楼、东湖、武汉大学。一座有江湖气的城市，美食丰富，文化底蕴深厚。',
    highlights: ['黄鹤楼', '东湖', '武汉大学', '户部巷', '江汉路', '湖北省博物馆'],
    risks: ['夏季酷热', '冬季湿冷', '部分区域交通拥堵'],
    stayDays: '2-3天', dailyBudget: '150-350元', emoji: '🦆'
  },
  {
    id: 'quanzhou',
    name: '泉州', province: '福建',
    dimensions: { freedom: 0.55, social: 0.45, explore: 0.60, nature: 0.25, pace: 0.25, budget: 0.30 },
    emotionTags: ['古城', '文化', '烟火气', '世遗'],
    tags: ['古城街巷', '夜市烟火气', '博物馆展览', '小镇慢生活'],
    pace: 1, costLevel: 2,
    climate: ['spring', 'autumn', 'winter'],
    transportFriendly: 3,
    spaceVibe: '古城文化',
    bestSeason: '10-12月 / 3-4月',
    crowd: ['深度探索', '文化', '步行', '独行'],
    travelDensity: 2, photoFriendly: 4, localLife: 5, nomadFriendly: 3, shortStayScore: 3,
    description: '半城烟火半城仙。世界遗产城市，古城街巷中藏着千年故事，适合深度步行探索和文化爱好者。',
    highlights: ['开元寺', '西街', '清净寺', '洛阳桥', '蟳埔村', '关帝庙'],
    risks: ['夏季炎热', '公共交通相对不便', '夜间活动较少'],
    stayDays: '2-4天', dailyBudget: '150-300元', emoji: '🏯'
  },
  {
    id: 'kunming',
    name: '昆明', province: '云南',
    dimensions: { freedom: 0.65, social: 0.35, explore: 0.45, nature: 0.60, pace: 0.30, budget: 0.30 },
    emotionTags: ['春城', '慢生活', '自然', '宜居'],
    tags: ['自然山海', '小镇慢生活', '咖啡书店', '博物馆展览'],
    pace: 2, costLevel: 2,
    climate: ['spring', 'summer', 'autumn', 'winter'],
    transportFriendly: 4,
    spaceVibe: '春城慢调',
    bestSeason: '全年适宜',
    crowd: ['放空', '数字游民', '自然', '短住'],
    travelDensity: 2, photoFriendly: 3, localLife: 4, nomadFriendly: 4, shortStayScore: 4,
    description: '四季如春的春城，气候舒适节奏慢，适合短住和轻度数字游民。作为云南旅行的中转站，也值得停留。',
    highlights: ['翠湖公园', '滇池', '云南大学', '官渡古镇', '斗南花市', '石林'],
    risks: ['紫外线强', '海拔较高需适应', '部分景点距离较远'],
    stayDays: '2-5天', dailyBudget: '150-350元', emoji: '🌸'
  },
  {
    id: 'zhuhai',
    name: '珠海', province: '广东',
    dimensions: { freedom: 0.60, social: 0.45, explore: 0.40, nature: 0.55, pace: 0.40, budget: 0.50 },
    emotionTags: ['海滨', '宜居', '慢生活', '清新'],
    tags: ['自然山海', '都市商业', '咖啡书店', '小镇慢生活'],
    pace: 3, costLevel: 3,
    climate: ['winter', 'spring', 'autumn'],
    transportFriendly: 4,
    spaceVibe: '海滨宜居',
    bestSeason: '10-12月 / 3-4月',
    crowd: ['放空', '家庭', '短住', '数字游民'],
    travelDensity: 2, photoFriendly: 3, localLife: 3, nomadFriendly: 4, shortStayScore: 4,
    description: '百岛之市，海滨宜居。节奏不快不慢，适合短住试居和轻度数字游民。',
    highlights: ['情侣路', '长隆海洋王国', '外伶仃岛', '圆明新园', '珠海渔女', '日月贝'],
    risks: ['台风季节', '夏季炎热', '景点相对分散'],
    stayDays: '2-4天', dailyBudget: '200-400元', emoji: '🏖️'
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
// 匹配算法 v2 — 六维加权欧氏距离（前端降级方案）
// 当后端不可用时，前端使用此算法完成推荐
// ============================================================

// v2 六维权重配置（与后端 src/core/scoring.js 保持一致）
var V2_WEIGHTS = {
  nature: 0.25,   // 自然匹配（空间偏好核心）
  pace: 0.20,     // 节奏匹配
  social: 0.20,   // 社交匹配
  budget: 0.15,   // 消费匹配
  explore: 0.12,  // 探索匹配
  freedom: 0.08   // 自由度匹配
};

/**
 * v2: 六维加权欧氏距离匹配
 * 距离越小 = 匹配度越高
 */
function calculateMatchV2(userDimensions, city) {
  if (!userDimensions || !city.dimensions) {
    return { score: 50, breakdown: {}, reasons: [], risks: city.risks || [] };
  }

  var dims = city.dimensions;
  var breakdown = {};
  var weightedSum = 0;

  for (var dim in V2_WEIGHTS) {
    var userVal = userDimensions[dim] || 0.5;
    var cityVal = dims[dim] || 0.5;
    var diff = userVal - cityVal;
    var dimScore = 1 - Math.abs(diff); // 0~1, 越高越匹配
    weightedSum += V2_WEIGHTS[dim] * (1 - dimScore); // 加权距离
    breakdown[dim] = Math.round(dimScore * 100);
  }

  // 距离转分数：distance 越小，score 越高
  var score = Math.round((1 - weightedSum) * 100);
  score = Math.max(0, Math.min(100, score));

  var reasons = generateReasonsV2(userDimensions, city, breakdown);

  return {
    score: score,
    breakdown: breakdown,
    reasons: reasons,
    risks: city.risks || []
  };
}

function generateReasonsV2(userDimensions, city, breakdown) {
  var reasons = [];
  if (breakdown.nature > 80) reasons.push('自然空间气质与你的偏好高度契合');
  if (breakdown.pace > 80) reasons.push('旅行节奏与你的风格匹配');
  if (breakdown.budget > 80) reasons.push('消费水平在你的预算范围内');
  if (breakdown.social > 80) reasons.push('社交氛围符合你的需求');
  if (breakdown.freedom > 80) reasons.push('城市自由度适合你的旅行方式');
  if (breakdown.explore > 80) reasons.push('探索空间满足你的好奇心');
  if (city.nomadFriendly >= 4) reasons.push('数字游民友好度较高，适合试居');
  if (city.photoFriendly >= 4) reasons.push('出片率高，适合拍照记录');
  if (reasons.length === 0) reasons.push('综合评估适合你的旅行风格');
  return reasons;
}

/**
 * v2: 获取推荐城市列表（六维加权欧氏距离）
 */
function getRecommendedCitiesV2(userDimensions, topN) {
  topN = topN || 3;
  var results = [];
  for (var i = 0; i < CITY_DATABASE.length; i++) {
    var city = CITY_DATABASE[i];
    var match = calculateMatchV2(userDimensions, city);
    results.push({ city: city, match: match });
  }
  results.sort(function(a, b) { return b.match.score - a.match.score; });
  return results.slice(0, topN);
}

// ============================================================
// 旧版匹配算法（保留兼容）
// ============================================================

/**
 * 计算用户与城市的匹配度（旧版）
 */
function calculateMatch(userProfile, city) {
  // 如果用户画像包含 v2 dimensions，优先使用 v2 算法
  if (userProfile.dimensions && city.dimensions) {
    return calculateMatchV2(userProfile.dimensions, city);
  }

  var breakdown = {};
  var total = 0;

  var spaceMatch = calculateSpaceMatch(userProfile.spacePrefs, city.tags);
  breakdown.space = spaceMatch;
  total += spaceMatch * 0.30;

  var paceMatch = calculatePaceMatch(userProfile.pacePref, city.pace);
  breakdown.pace = paceMatch;
  total += paceMatch * 0.20;

  var costMatch = calculateCostMatch(userProfile.budget, city.costLevel, city.dailyBudget);
  breakdown.cost = costMatch;
  total += costMatch * 0.20;

  var emotionMatch = calculateEmotionMatch(userProfile.emotionGoal, city.crowd, city.spaceVibe);
  breakdown.emotion = emotionMatch;
  total += emotionMatch * 0.15;

  var transportScore = city.transportFriendly / 5;
  breakdown.transport = transportScore;
  total += transportScore * 0.10;

  var freshness = 1.0;
  if (userProfile.visitedCities && userProfile.visitedCities.indexOf(city.name) !== -1) {
    freshness = 0.3;
  }
  breakdown.freshness = freshness;
  total += freshness * 0.05;

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
    if (cityTags.indexOf(userPrefs[i]) !== -1) matchCount++;
  }
  return Math.min(1, matchCount / Math.max(1, userPrefs.length) * 1.2);
}

function calculatePaceMatch(userPace, cityPace) {
  if (!userPace) return 0.7;
  var diff = Math.abs(userPace - cityPace);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.8;
  if (diff === 2) return 0.5;
  return 0.2;
}

function calculateCostMatch(budget, cityCost, cityDailyBudget) {
  if (!budget) return 0.7;
  var budgetNum = parseInt(budget);
  if (isNaN(budgetNum)) return 0.7;
  var avgDaily = budgetNum / 4;
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
  if (breakdown.space > 0.7) reasons.push('城市空间气质与你的偏好高度契合');
  if (breakdown.pace > 0.7) reasons.push('旅行节奏与你的风格匹配');
  if (breakdown.cost > 0.7) reasons.push('消费水平在你的预算范围内');
  if (breakdown.emotion > 0.7) reasons.push('能满足你本次旅行的情绪需求');
  if (city.nomadFriendly >= 4 && userProfile.considerNomad) reasons.push('数字游民友好度较高，适合试居');
  if (city.photoFriendly >= 4) reasons.push('出片率高，适合拍照记录');
  if (reasons.length === 0) reasons.push('综合评估适合你的旅行风格');
  return reasons;
}

/**
 * 获取推荐城市列表（旧版，优先调用 v2）
 */
function getRecommendedCities(userProfile, topN) {
  topN = topN || 3;
  // 如果有 v2 dimensions，使用 v2 算法
  if (userProfile.dimensions) {
    return getRecommendedCitiesV2(userProfile.dimensions, topN);
  }
  var results = [];
  for (var i = 0; i < CITY_DATABASE.length; i++) {
    var city = CITY_DATABASE[i];
    var match = calculateMatch(userProfile, city);
    results.push({ city: city, match: match });
  }
  results.sort(function(a, b) { return b.match.score - a.match.score; });
  return results.slice(0, topN);
}

/**
 * 根据用户输入推断旅游人格（情绪优先 + 空间辅助）
 */
function inferPersona(userProfile) {
  var scores = {};

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
    for (var key in emScores) { scores[key] = (scores[key] || 0) + emScores[key]; }
  }

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

  if (!userProfile.spacePrefs || userProfile.spacePrefs.length === 0) {
    if (userProfile.travelTime) {
      if (userProfile.travelTime.indexOf('1天') === 0) {
        scores.efficient_checker = (scores.efficient_checker || 0) + 1;
        scores.street_explorer = (scores.street_explorer || 0) + 1;
      } else if (userProfile.travelTime.indexOf('7') === 0) {
        scores.relax_roamer = (scores.relax_roamer || 0) + 1;
        scores.nature_healer = (scores.nature_healer || 0) + 1;
        scores.nomad_trial = (scores.nomad_trial || 0) + 1;
      }
    }
  }

  if (userProfile.considerNomad) {
    scores.nomad_trial = (scores.nomad_trial || 0) + 4;
  }

  if (userProfile.budget) {
    var budgetNum = parseInt(userProfile.budget);
    if (!isNaN(budgetNum)) {
      if (budgetNum <= 500) scores.street_explorer = (scores.street_explorer || 0) + 1;
      else if (budgetNum >= 5000) scores.efficient_checker = (scores.efficient_checker || 0) + 1;
    }
  }

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
  var persona = PERSONA_TYPES[personaType] || PERSONA_TYPES.relax_roamer;
  var highlights = city.highlights && city.highlights.length ? city.highlights : [city.name + '核心街区', city.name + '本地生活区', city.name + '夜间散步路线'];
  var moveMode = city.transportFriendly >= 4 ? '地铁/步行' : city.transportFriendly >= 3 ? '打车/步行' : '包车/打车';
  var routeThemes = {
    relax_roamer: ['城市松弛感', '老街与咖啡', '低密度散步'],
    nature_healer: ['自然恢复', '低强度户外', '日落留白'],
    street_explorer: ['烟火气采样', '本地餐桌', '夜市路线'],
    efficient_checker: ['高效串联', '核心景点', '减少折返'],
    creative_collector: ['光影素材', '建筑街区', '展览灵感'],
    nomad_trial: ['试居半径', '工作空间', '生活配套']
  };
  var themes = routeThemes[personaType] || routeThemes.relax_roamer;

  for (var d = 0; d < days; d++) {
    var primary = highlights[(d * 2) % highlights.length];
    var secondary = highlights[(d * 2 + 1) % highlights.length] || highlights[0];
    var eveningPoi = highlights[(d * 2 + 2) % highlights.length] || city.name + '夜间生活区';
    var dayPlan = {
      day: d + 1,
      title: 'Day ' + (d + 1),
      theme: themes[d % themes.length],
      morning: template.morning[d % template.morning.length],
      afternoon: template.afternoon[d % template.afternoon.length],
      evening: template.evening[d % template.evening.length],
      routeSummary: primary + ' → ' + secondary + ' → ' + eveningPoi,
      mapQuery: city.name + ' ' + primary + ' ' + secondary,
      transport: moveMode,
      highlights: [primary, secondary, eveningPoi].filter(function(item, index, arr) { return item && arr.indexOf(item) === index; }),
      slots: [
        {
          time: '09:00-11:30',
          poi: primary,
          action: template.morning[d % template.morning.length],
          move: moveMode,
          why: '用上午精力完成本日主体验，适配你的「' + persona.pace + '」节奏。'
        },
        {
          time: '13:30-16:30',
          poi: secondary,
          action: template.afternoon[d % template.afternoon.length],
          move: moveMode,
          why: '下午安排更轻的探索，把空间偏好落到具体街区或场景。'
        },
        {
          time: '18:30-21:00',
          poi: eveningPoi,
          action: template.evening[d % template.evening.length],
          move: '步行/短途打车',
          why: '夜间保留弹性，既能记录当天感受，也能捕捉城市真实生活。'
        }
      ],
      tasks: [
        '收藏 1 个真正想再来的地点',
        '记录 1 个和人格画像相符的瞬间',
        '拍 3 张不同距离的照片：远景/中景/细节'
      ],
      tips: []
    };

    if (d === 0) dayPlan.tips.push('今天是第一天，建议先熟悉城市节奏，不要安排太满');
    if (d === days - 1) dayPlan.tips.push('最后一天，留一些时间买纪念品和告别');
    if (city.risks && city.risks.length > 0) dayPlan.tips.push('注意：' + city.risks[0]);
    if (personaType === 'nomad_trial') dayPlan.tips.push('建议记录 WiFi、通勤、外卖、洗衣和周边便利店情况');
    if (personaType === 'efficient_checker') dayPlan.tips.push('建议提前预约核心景点，并按交通方向排序');

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

  var shuffled = keywords.slice().sort(function() { return 0.5 - Math.random(); });
  var todayKeywords = shuffled.slice(0, 3);
  var todayQuestion = questions[dayIndex % questions.length];
  var shuffledEmotions = emotions.slice().sort(function() { return 0.5 - Math.random(); });
  var todayEmotions = shuffledEmotions.slice(0, 3);

  return {
    keywords: todayKeywords,
    question: todayQuestion,
    emotions: todayEmotions
  };
}
