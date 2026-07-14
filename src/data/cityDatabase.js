/**
 * 旅格 Travel Persona · 城市知识库
 *
 * 20 座中国热门目的地城市，每城含六维向量 + 情绪标签 + 真实 POI
 *
 * 六维标注说明：
 * - 每维 0~1，由开发者基于城市公开标签（马蜂窝/小红书词频）+ 主观体验标注
 * - nature 高 = 自然占比高；pace 高 = 节奏快；social 高 = 热闹/社交属性强
 * - budget 高 = 消费高；explore 高 = 小众/探索属性强；freedom 高 = 自由度高
 *
 * POI 字段：name / zone / type / openHours / indoor / note
 */

const CITIES = [
  // ========== 自然疗愈型 ==========
  {
    id: 'dali',
    name: '大理',
    dimensions: { freedom: 0.80, social: 0.30, explore: 0.60, nature: 0.90, pace: 0.20, budget: 0.45 },
    emotionTags: ['治愈', '逃离', '放空', '慢生活'],
    pois: [
      { name: '洱海生态廊道', zone: '洱海西岸', type: '自然', openHours: '全天', indoor: false, note: '骑行、发呆、看云' },
      { name: '人民路', zone: '古城', type: '街区', openHours: '10:00-22:00', indoor: false, note: '咖啡馆、小店、流浪歌手' },
      { name: '寂照庵', zone: '苍山', type: '文化', openHours: '08:00-18:00', indoor: false, note: '最美尼姑庵、素斋' },
      { name: '喜洲古镇', zone: '喜洲', type: '街区', openHours: '全天', indoor: false, note: '稻田、老宅、粑粑' },
      { name: '双廊', zone: '洱海东岸', type: '自然', openHours: '全天', indoor: false, note: '临水民宿、日落' },
      { name: '苍山洗马潭索道', zone: '苍山', type: '自然', openHours: '08:30-17:00', indoor: false, note: '高山草甸、俯瞰洱海' }
    ]
  },
  {
    id: 'lijiang',
    name: '丽江',
    dimensions: { freedom: 0.75, social: 0.50, explore: 0.55, nature: 0.80, pace: 0.30, budget: 0.50 },
    emotionTags: ['浪漫', '古城', '雪山', '慢生活'],
    pois: [
      { name: '丽江古城', zone: '古城', type: '街区', openHours: '全天', indoor: false, note: '石板路、酒吧、夜景' },
      { name: '玉龙雪山', zone: '雪山', type: '自然', openHours: '06:30-18:00', indoor: false, note: '冰川公园、蓝月谷' },
      { name: '束河古镇', zone: '束河', type: '街区', openHours: '全天', indoor: false, note: '比古城安静、茶马古道' },
      { name: '拉市海', zone: '拉市海', type: '自然', openHours: '全天', indoor: false, note: '湿地、骑马、观鸟' },
      { name: '白沙古镇', zone: '白沙', type: '文化', openHours: '全天', indoor: false, note: '纳西文化、壁画、咖啡' },
      { name: '黑龙潭公园', zone: '古城', type: '自然', openHours: '全天', indoor: false, note: '雪山倒影、古桥', duration: 90, lat: 26.8797, lng: 100.2322 },
      { name: '木府', zone: '古城', type: '文化', openHours: '08:30-17:30', indoor: true, note: '纳西土司府邸', duration: 90, lat: 26.8745, lng: 100.2375 },
      { name: '四方街', zone: '古城', type: '街区', openHours: '全天', indoor: false, note: '古城中心、茶马古道枢纽', duration: 60, lat: 26.8755, lng: 100.2325 },
      { name: '狮子山万古楼', zone: '古城', type: '文化', openHours: '08:00-19:00', indoor: false, note: '俯瞰古城全景', duration: 60, lat: 26.8725, lng: 100.2315 },
      { name: '玉水寨', zone: '玉龙雪山', type: '文化', openHours: '08:00-18:00', indoor: false, note: '东巴文化、神泉', duration: 120, lat: 26.9467, lng: 100.2500 },
      { name: '观音峡', zone: '古城近郊', type: '自然', openHours: '08:00-18:00', indoor: false, note: '峡谷、滑道、玻璃栈道', duration: 180, lat: 26.8389, lng: 100.2683 },
      { name: '东巴谷', zone: '玉龙雪山', type: '文化', openHours: '08:00-18:00', indoor: false, note: '东巴祭祀、民俗体验', duration: 120, lat: 26.9156, lng: 100.2767 },
      { name: '文笔海', zone: '古城近郊', type: '自然', openHours: '全天', indoor: false, note: '湿地、骑行、远眺雪山', duration: 90, lat: 26.8533, lng: 100.2389 },
      { name: '泸沽湖', zone: '宁蒗', type: '自然', openHours: '全天', indoor: false, note: '高原湖泊、摩梭文化、猪槽船', duration: 480, lat: 27.7089, lng: 100.7833 },
      { name: '虎跳峡', zone: '玉龙雪山', type: '自然', openHours: '全天', indoor: false, note: '世界级大峡谷、徒步', duration: 240, lat: 27.2000, lng: 100.1333 },
      { name: '长江第一湾', zone: '石鼓', type: '自然', openHours: '全天', indoor: false, note: '长江V字大拐弯', duration: 60, lat: 26.8556, lng: 100.1889 },
      { name: '老君山', zone: '玉龙雪山', type: '自然', openHours: '08:00-18:00', indoor: false, note: '丹霞地貌、徒步圣地', duration: 240, lat: 26.7500, lng: 99.9167 },
      { name: '甘海子', zone: '玉龙雪山', type: '自然', openHours: '全天', indoor: false, note: '高山草甸、雪山背景', duration: 60, lat: 27.0833, lng: 100.2667 },
      { name: '印象丽江剧场', zone: '玉龙雪山', type: '文化', openHours: '演出日13:30/14:30', indoor: false, note: '张艺谋导演实景演出', duration: 90, lat: 27.0917, lng: 100.2617 },
      { name: '玉湖村', zone: '白沙', type: '文化', openHours: '全天', indoor: false, note: '雪山脚下纳西古村、洛克故居', duration: 120, lat: 26.9667, lng: 100.2333 },
      { name: '蓝月谷', zone: '玉龙雪山', type: '自然', openHours: '06:30-18:00', indoor: false, note: '雪山脚下碧蓝湖水', duration: 120, lat: 27.1000, lng: 100.2550 }
    ]
  },
  {
    id: 'xiamen',
    name: '厦门',
    dimensions: { freedom: 0.70, social: 0.55, explore: 0.50, nature: 0.65, pace: 0.40, budget: 0.55 },
    emotionTags: ['文艺', '海岛', '慢生活', '清新'],
    pois: [
      { name: '鼓浪屿', zone: '鼓浪屿', type: '街区', openHours: '全天', indoor: false, note: '万国建筑、钢琴博物馆' },
      { name: '环岛路', zone: '环岛', type: '自然', openHours: '全天', indoor: false, note: '骑行、海景、日落' },
      { name: '沙坡尾', zone: '思明', type: '街区', openHours: '全天', indoor: false, note: '艺术区、老渔港、咖啡' },
      { name: '植物园', zone: '万石山', type: '自然', openHours: '06:30-18:00', indoor: false, note: '雨林喷雾、多肉区' },
      { name: '曾厝垵', zone: '环岛', type: '街区', openHours: '全天', indoor: false, note: '小吃街、民宿、夜市' }
    ]
  },
  {
    id: 'qinghaihu',
    name: '青海湖',
    dimensions: { freedom: 0.85, social: 0.15, explore: 0.70, nature: 0.95, pace: 0.15, budget: 0.35 },
    emotionTags: ['孤独', '辽阔', '治愈', '逃离'],
    pois: [
      { name: '环湖西路', zone: '环湖', type: '自然', openHours: '全天', indoor: false, note: '最美环湖段、日出' },
      { name: '茶卡盐湖', zone: '茶卡', type: '自然', openHours: '07:00-21:00', indoor: false, note: '天空之镜、日落' },
      { name: '黑马河', zone: '环湖', type: '自然', openHours: '全天', indoor: false, note: '日出观测点' },
      { name: '鸟岛', zone: '环湖', type: '自然', openHours: '08:00-18:00', indoor: false, note: '候鸟、湿地（季节性）' },
      { name: '二郎剑景区', zone: '环湖', type: '自然', openHours: '08:00-18:00', indoor: false, note: '官方主景区、游船', duration: 180, lat: 36.8945, lng: 100.4597 },
      { name: '金银滩草原', zone: '海晏', type: '自然', openHours: '全天', indoor: false, note: '草原、牧民风情', duration: 120, lat: 36.9833, lng: 100.9167 },
      { name: '原子城纪念馆', zone: '海晏', type: '文化', openHours: '09:00-17:00', indoor: true, note: '两弹一星历史', duration: 90, lat: 36.9833, lng: 100.9000 },
      { name: '仙女湾', zone: '环湖', type: '自然', openHours: '全天', indoor: false, note: '湿地、观鸟、日落', duration: 120, lat: 36.9500, lng: 100.4333 },
      { name: '日月山', zone: '湟源', type: '自然', openHours: '全天', indoor: false, note: '文成公主传说、分界线', duration: 90, lat: 36.2833, lng: 101.0833 },
      { name: '倒淌河', zone: '湟源', type: '自然', openHours: '全天', indoor: false, note: '自东向西流淌的奇河', duration: 45, lat: 36.2833, lng: 101.0500 },
      { name: '塔尔寺', zone: '西宁', type: '文化', openHours: '08:00-17:00', indoor: true, note: '藏传佛教圣地、酥油花', duration: 150, lat: 36.4833, lng: 101.5667 },
      { name: '卓尔山', zone: '祁连', type: '自然', openHours: '06:00-20:00', indoor: false, note: '东方小瑞士、丹霞与雪山', duration: 180, lat: 38.2000, lng: 100.2667 },
      { name: '门源油菜花海', zone: '门源', type: '自然', openHours: '全天', indoor: false, note: '夏季万亩油菜花', duration: 120, lat: 37.3833, lng: 101.6167 },
      { name: '祁连山草原', zone: '祁连', type: '自然', openHours: '全天', indoor: false, note: '高山草原、骑马', duration: 120, lat: 38.2000, lng: 100.3500 },
      { name: '冰沟林海', zone: '祁连', type: '自然', openHours: '全天', indoor: false, note: '原始森林、冷杉溪流', duration: 90, lat: 38.1500, lng: 100.2167 },
      { name: '大冬树山垭口', zone: '祁连', type: '自然', openHours: '全天', indoor: false, note: '海拔4120米、雪山俯瞰', duration: 60, lat: 37.8500, lng: 100.1833 },
      { name: '环湖东路', zone: '环湖', type: '自然', openHours: '全天', indoor: false, note: '沙漠与湖水交界', duration: 120, lat: 36.8500, lng: 100.6167 },
      { name: '尕海', zone: '环湖', type: '自然', openHours: '全天', indoor: false, note: '内陆盐湖、候鸟', duration: 60, lat: 37.2500, lng: 100.3500 },
      { name: '金沙湾', zone: '环湖', type: '自然', openHours: '全天', indoor: false, note: '沙漠滑沙、湖岸风光', duration: 120, lat: 36.9167, lng: 100.5833 },
      { name: '海心山', zone: '青海湖', type: '自然', openHours: '全天', indoor: false, note: '湖心岛、宗教圣地', duration: 180, lat: 36.9167, lng: 100.4833 }
    ]
  },

  // ========== 城市漫游型 ==========
  {
    id: 'chengdu',
    name: '成都',
    dimensions: { freedom: 0.65, social: 0.60, explore: 0.50, nature: 0.40, pace: 0.35, budget: 0.50 },
    emotionTags: ['烟火气', '美食', '慢生活', '巴适'],
    pois: [
      { name: '宽窄巷子', zone: '青羊', type: '街区', openHours: '全天', indoor: false, note: '老成都、茶馆、小吃' },
      { name: '锦里', zone: '武侯', type: '街区', openHours: '全天', indoor: false, note: '古街、夜景、三国文化' },
      { name: '人民公园', zone: '青羊', type: '文化', openHours: '06:00-22:00', indoor: false, note: '鹤鸣茶社、采耳' },
      { name: '玉林路', zone: '武侯', type: '街区', openHours: '全天', indoor: false, note: '小酒馆、老社区、烧烤' },
      { name: '大熊猫基地', zone: '成华', type: '自然', openHours: '07:30-18:00', indoor: false, note: '看熊猫、早去' },
      { name: '太古里', zone: '锦江', type: '街区', openHours: '10:00-22:00', indoor: false, note: '时尚街区、方所书店' }
    ]
  },
  {
    id: 'suzhou',
    name: '苏州',
    dimensions: { freedom: 0.55, social: 0.40, explore: 0.60, nature: 0.55, pace: 0.30, budget: 0.55 },
    emotionTags: ['江南', '园林', '慢生活', '雅致'],
    pois: [
      { name: '拙政园', zone: '姑苏', type: '文化', openHours: '07:30-17:30', indoor: false, note: '中国四大名园之首' },
      { name: '平江路', zone: '姑苏', type: '街区', openHours: '全天', indoor: false, note: '水乡、评弹、猫空书店' },
      { name: '山塘街', zone: '姑苏', type: '街区', openHours: '全天', indoor: false, note: '夜景、小吃、游船' },
      { name: '苏州博物馆', zone: '姑苏', type: '文化', openHours: '09:00-17:00', indoor: true, note: '贝聿铭设计、需预约' },
      { name: '金鸡湖', zone: '园区', type: '自然', openHours: '全天', indoor: false, note: '现代苏州、摩天轮' }
    ]
  },
  {
    id: 'hangzhou',
    name: '杭州',
    dimensions: { freedom: 0.60, social: 0.50, explore: 0.50, nature: 0.60, pace: 0.40, budget: 0.60 },
    emotionTags: ['西湖', '文艺', '慢生活', '清新'],
    pois: [
      { name: '西湖', zone: '西湖', type: '自然', openHours: '全天', indoor: false, note: '断桥、苏堤、雷峰塔' },
      { name: '灵隐寺', zone: '西湖', type: '文化', openHours: '07:00-18:00', indoor: false, note: '古刹、飞来峰' },
      { name: '河坊街', zone: '上城', type: '街区', openHours: '全天', indoor: false, note: '老字号、小吃' },
      { name: '龙井村', zone: '西湖', type: '自然', openHours: '全天', indoor: false, note: '茶园、采茶、农家菜' },
      { name: '西溪湿地', zone: '余杭', type: '自然', openHours: '08:00-17:30', indoor: false, note: '摇橹船、秋芦飞雪' }
    ]
  },
  {
    id: 'beijing',
    name: '北京',
    dimensions: { freedom: 0.50, social: 0.70, explore: 0.75, nature: 0.40, pace: 0.70, budget: 0.70 },
    emotionTags: ['历史', '文化', '大气', '多元'],
    pois: [
      { name: '故宫', zone: '东城', type: '文化', openHours: '08:30-17:00', indoor: true, note: '需预约、周一闭馆' },
      { name: '胡同', zone: '东城/西城', type: '街区', openHours: '全天', indoor: false, note: '南锣鼓巷、五道营' },
      { name: '798艺术区', zone: '朝阳', type: '街区', openHours: '10:00-18:00', indoor: true, note: '画廊、展览、咖啡' },
      { name: '景山公园', zone: '西城', type: '自然', openHours: '06:00-21:00', indoor: false, note: '俯瞰故宫、日落' },
      { name: '国家博物馆', zone: '东城', type: '文化', openHours: '09:00-17:00', indoor: true, note: '免费、需预约' }
    ]
  },

  // ========== 烟火气探索型 ==========
  {
    id: 'chongqing',
    name: '重庆',
    dimensions: { freedom: 0.60, social: 0.70, explore: 0.65, nature: 0.35, pace: 0.60, budget: 0.45 },
    emotionTags: ['魔幻', '火锅', '烟火气', '立体'],
    pois: [
      { name: '洪崖洞', zone: '渝中', type: '街区', openHours: '全天', indoor: false, note: '夜景、吊脚楼' },
      { name: '解放碑', zone: '渝中', type: '街区', openHours: '全天', indoor: false, note: '商圈、美食街' },
      { name: '李子坝', zone: '渝中', type: '文化', openHours: '全天', indoor: false, note: '轻轨穿楼' },
      { name: '磁器口', zone: '沙坪坝', type: '街区', openHours: '全天', indoor: false, note: '古镇、陈麻花' },
      { name: '南山一棵树', zone: '南岸', type: '自然', openHours: '09:00-22:30', indoor: false, note: '夜景、火锅' }
    ]
  },
  {
    id: 'xian',
    name: '西安',
    dimensions: { freedom: 0.50, social: 0.65, explore: 0.70, nature: 0.30, pace: 0.55, budget: 0.45 },
    emotionTags: ['历史', '面食', '烟火气', '厚重'],
    pois: [
      { name: '回民街', zone: '莲湖', type: '街区', openHours: '全天', indoor: false, note: '羊肉泡馍、肉夹馍' },
      { name: '兵马俑', zone: '临潼', type: '文化', openHours: '08:30-18:00', indoor: true, note: '世界第八大奇迹' },
      { name: '城墙', zone: '碑林', type: '文化', openHours: '08:00-22:00', indoor: false, note: '骑行、日落' },
      { name: '大唐不夜城', zone: '雁塔', type: '街区', openHours: '全天', indoor: false, note: '夜景、表演' },
      { name: '陕西历史博物馆', zone: '雁塔', type: '文化', openHours: '08:30-18:00', indoor: true, note: '免费、需预约' },
      { name: '大雁塔', zone: '雁塔', type: '文化', openHours: '08:00-17:30', indoor: true, note: '玄奘译经地、音乐喷泉', duration: 90, lat: 34.2200, lng: 108.9580 },
      { name: '华清宫', zone: '临潼', type: '文化', openHours: '07:30-18:00', indoor: false, note: '唐明皇与杨贵妃、温泉', duration: 180, lat: 34.3636, lng: 109.2100 },
      { name: '钟鼓楼', zone: '莲湖', type: '文化', openHours: '08:00-22:00', indoor: true, note: '西安地标、晨钟暮鼓', duration: 60, lat: 34.2611, lng: 108.9389 },
      { name: '小雁塔', zone: '碑林', type: '文化', openHours: '09:00-17:00', indoor: true, note: '唐代古塔、西安博物院', duration: 90, lat: 34.2389, lng: 108.9417 },
      { name: '碑林博物馆', zone: '碑林', type: '文化', openHours: '08:00-18:00', indoor: true, note: '书法名碑、石刻艺术', duration: 120, lat: 34.2550, lng: 108.9330 },
      { name: '大明宫国家遗址公园', zone: '新城', type: '文化', openHours: '08:30-18:00', indoor: false, note: '盛唐皇宫遗址、微缩景观', duration: 180, lat: 34.2833, lng: 108.9667 },
      { name: '大唐芙蓉园', zone: '雁塔', type: '文化', openHours: '09:00-22:00', indoor: false, note: '仿唐皇家园林、水幕电影', duration: 180, lat: 34.2167, lng: 108.9667 },
      { name: '曲江池遗址公园', zone: '雁塔', type: '自然', openHours: '全天', indoor: false, note: '唐代曲江池、园林漫步', duration: 90, lat: 34.2000, lng: 108.9667 },
      { name: '永兴坊', zone: '新城', type: '街区', openHours: '全天', indoor: false, note: '非遗美食、摔碗酒', duration: 90, lat: 34.2667, lng: 108.9500 },
      { name: '法门寺', zone: '宝鸡', type: '文化', openHours: '08:00-18:00', indoor: true, note: '佛指舍利、唐代地宫', duration: 180, lat: 34.4333, lng: 107.9000 },
      { name: '乾陵', zone: '咸阳', type: '文化', openHours: '08:00-18:00', indoor: false, note: '武则天与唐高宗合葬墓', duration: 150, lat: 34.5667, lng: 108.2167 },
      { name: '华山', zone: '渭南', type: '自然', openHours: '全天', indoor: false, note: '五岳之险、长空栈道', duration: 480, lat: 34.4833, lng: 110.0833 },
      { name: '青龙寺', zone: '雁塔', type: '文化', openHours: '08:00-17:00', indoor: false, note: '樱花、密宗祖庭', duration: 90, lat: 34.2333, lng: 108.9833 },
      { name: '半坡博物馆', zone: '灞桥', type: '文化', openHours: '08:00-17:30', indoor: true, note: '新石器时代母系氏族遗址', duration: 90, lat: 34.2833, lng: 109.0500 },
      { name: '兴庆宫公园', zone: '碑林', type: '自然', openHours: '06:00-21:00', indoor: false, note: '唐代兴庆宫旧址、市民公园', duration: 90, lat: 34.2500, lng: 108.9833 },
      { name: '书院门', zone: '碑林', type: '街区', openHours: '全天', indoor: false, note: '书画文玩、仿古街区', duration: 60, lat: 34.2583, lng: 108.9417 }
    ]
  },
  {
    id: 'guangzhou',
    name: '广州',
    dimensions: { freedom: 0.55, social: 0.70, explore: 0.50, nature: 0.35, pace: 0.55, budget: 0.55 },
    emotionTags: ['早茶', '烟火气', '务实', '美食'],
    pois: [
      { name: '上下九', zone: '荔湾', type: '街区', openHours: '全天', indoor: false, note: '老字号、骑楼' },
      { name: '沙面', zone: '荔湾', type: '街区', openHours: '全天', indoor: false, note: '欧式建筑、咖啡' },
      { name: '广州塔', zone: '海珠', type: '文化', openHours: '09:30-22:30', indoor: true, note: '小蛮腰、夜景' },
      { name: '陈家祠', zone: '荔湾', type: '文化', openHours: '08:30-17:30', indoor: true, note: '岭南建筑、木雕' },
      { name: '北京路', zone: '越秀', type: '街区', openHours: '全天', indoor: false, note: '步行街、美食' }
    ]
  },
  {
    id: 'changsha',
    name: '长沙',
    dimensions: { freedom: 0.60, social: 0.75, explore: 0.50, nature: 0.30, pace: 0.65, budget: 0.40 },
    emotionTags: ['烟火气', '美食', '夜生活', '活力'],
    pois: [
      { name: '太平老街', zone: '天心', type: '街区', openHours: '全天', indoor: false, note: '小吃、臭豆腐、茶颜悦色' },
      { name: '橘子洲', zone: '岳麓', type: '自然', openHours: '全天', indoor: false, note: '毛泽东像、烟花（节假日）' },
      { name: '文和友', zone: '天心', type: '街区', openHours: '11:00-03:00', indoor: true, note: '复古市井、小龙虾' },
      { name: '岳麓山', zone: '岳麓', type: '自然', openHours: '06:00-23:00', indoor: false, note: '爱晚亭、书院' }
    ]
  },

  // ========== 高效打卡型 ==========
  {
    id: 'shanghai',
    name: '上海',
    dimensions: { freedom: 0.55, social: 0.75, explore: 0.65, nature: 0.30, pace: 0.80, budget: 0.80 },
    emotionTags: ['摩登', '多元', '高效', '精致'],
    pois: [
      { name: '外滩', zone: '黄浦', type: '街区', openHours: '全天', indoor: false, note: '万国建筑、夜景' },
      { name: '陆家嘴', zone: '浦东', type: '街区', openHours: '全天', indoor: false, note: '三件套、东方明珠' },
      { name: '武康路', zone: '徐汇', type: '街区', openHours: '全天', indoor: false, note: '老洋房、咖啡、梧桐' },
      { name: '迪士尼', zone: '浦东', type: '文化', openHours: '08:30-21:30', indoor: true, note: '主题乐园、烟花' },
      { name: '田子坊', zone: '黄浦', type: '街区', openHours: '全天', indoor: false, note: '石库门、创意小店' }
    ]
  },
  {
    id: 'shenzhen',
    name: '深圳',
    dimensions: { freedom: 0.60, social: 0.65, explore: 0.55, nature: 0.45, pace: 0.85, budget: 0.70 },
    emotionTags: ['现代', '高效', '年轻', '创新'],
    pois: [
      { name: '深圳湾', zone: '南山', type: '自然', openHours: '全天', indoor: false, note: '海景、日落、候鸟' },
      { name: '华侨城创意园', zone: '南山', type: '街区', openHours: '全天', indoor: false, note: '艺术、咖啡、展览' },
      { name: '大梅沙', zone: '盐田', type: '自然', openHours: '07:00-24:00', indoor: false, note: '海滩、游泳' },
      { name: '平安金融中心', zone: '福田', type: '文化', openHours: '09:00-22:00', indoor: true, note: '俯瞰深圳、观光层' }
    ]
  },
  {
    id: 'nanjing',
    name: '南京',
    dimensions: { freedom: 0.50, social: 0.55, explore: 0.65, nature: 0.45, pace: 0.50, budget: 0.50 },
    emotionTags: ['历史', '厚重', '梧桐', '雅致'],
    pois: [
      { name: '中山陵', zone: '玄武', type: '文化', openHours: '08:30-17:00', indoor: false, note: '梧桐大道、民国风' },
      { name: '夫子庙', zone: '秦淮', type: '街区', openHours: '全天', indoor: false, note: '秦淮河、小吃' },
      { name: '总统府', zone: '玄武', type: '文化', openHours: '08:30-17:00', indoor: true, note: '民国历史' },
      { name: '鸡鸣寺', zone: '玄武', type: '文化', openHours: '07:00-17:30', indoor: false, note: '樱花、古刹' },
      { name: '老门东', zone: '秦淮', type: '街区', openHours: '全天', indoor: false, note: '老城南、小吃、德云社' }
    ]
  },

  // ========== 灵感采集型 ==========
  {
    id: 'qingdao',
    name: '青岛',
    dimensions: { freedom: 0.65, social: 0.50, explore: 0.55, nature: 0.60, pace: 0.40, budget: 0.55 },
    emotionTags: ['海滨', '文艺', '啤酒', '清新'],
    pois: [
      { name: '栈桥', zone: '市南', type: '自然', openHours: '全天', indoor: false, note: '海鸥、回澜阁' },
      { name: '八大关', zone: '市南', type: '街区', openHours: '全天', indoor: false, note: '万国建筑、梧桐' },
      { name: '小鱼山', zone: '市南', type: '自然', openHours: '06:00-20:00', indoor: false, note: '俯瞰老城、红瓦绿树' },
      { name: '啤酒博物馆', zone: '市北', type: '文化', openHours: '08:30-16:30', indoor: true, note: '青岛啤酒历史' },
      { name: '信号山', zone: '市南', type: '自然', openHours: '06:00-20:30', indoor: false, note: '旋转观景台' }
    ]
  },
  {
    id: 'dalian',
    name: '大连',
    dimensions: { freedom: 0.60, social: 0.45, explore: 0.50, nature: 0.55, pace: 0.40, budget: 0.50 },
    emotionTags: ['海滨', '浪漫', '清新', '欧式'],
    pois: [
      { name: '星海广场', zone: '沙河口', type: '自然', openHours: '全天', indoor: false, note: '亚洲最大广场、海景' },
      { name: '老虎滩', zone: '中山', type: '自然', openHours: '08:00-17:00', indoor: false, note: '海洋公园、渔人码头' },
      { name: '滨海路', zone: '中山', type: '自然', openHours: '全天', indoor: false, note: '最美公路、徒步' },
      { name: '俄罗斯风情街', zone: '西岗', type: '街区', openHours: '全天', indoor: false, note: '俄式建筑、套娃' },
      { name: '金石滩', zone: '金州', type: '自然', openHours: '08:00-17:30', indoor: false, note: '国家地质公园、奇石海岸', duration: 240, lat: 39.0933, lng: 122.0083 },
      { name: '发现王国', zone: '金州', type: '文化', openHours: '09:30-17:00', indoor: false, note: '主题乐园、过山车', duration: 360, lat: 39.0833, lng: 122.0167 },
      { name: '棒棰岛', zone: '中山', type: '自然', openHours: '08:00-18:00', indoor: false, note: '国宾馆海滩、清澈海水', duration: 120, lat: 38.8667, lng: 121.7167 },
      { name: '旅顺口', zone: '旅顺', type: '文化', openHours: '全天', indoor: false, note: '军港、日俄战争历史', duration: 180, lat: 38.8167, lng: 121.2500 },
      { name: '白玉山', zone: '旅顺', type: '自然', openHours: '08:00-17:00', indoor: false, note: '俯瞰旅顺港、白玉山塔', duration: 90, lat: 38.8167, lng: 121.2667 },
      { name: '圣亚海洋世界', zone: '沙河口', type: '文化', openHours: '09:00-17:00', indoor: true, note: '海底隧道、极地动物', duration: 180, lat: 38.8667, lng: 121.6667 },
      { name: '森林动物园', zone: '西岗', type: '自然', openHours: '08:30-16:30', indoor: false, note: '依山而建、散养区', duration: 240, lat: 38.8833, lng: 121.6500 },
      { name: '傅家庄公园', zone: '西岗', type: '自然', openHours: '全天', indoor: false, note: '海滨浴场、市民海滩', duration: 90, lat: 38.8500, lng: 121.6500 },
      { name: '星海公园', zone: '沙河口', type: '自然', openHours: '全天', indoor: false, note: '海滨公园、游乐场', duration: 90, lat: 38.8833, lng: 121.6000 },
      { name: '中山广场', zone: '中山', type: '街区', openHours: '全天', indoor: false, note: '欧式建筑群、金融街', duration: 45, lat: 38.9167, lng: 121.6333 },
      { name: '友好广场', zone: '中山', type: '街区', openHours: '全天', indoor: false, note: '水晶球雕塑、商圈', duration: 30, lat: 38.9167, lng: 121.6167 },
      { name: '港湾广场', zone: '中山', type: '街区', openHours: '全天', indoor: false, note: '港口风光、游艇码头', duration: 45, lat: 38.9167, lng: 121.6500 },
      { name: '十五库', zone: '中山', type: '街区', openHours: '10:00-22:00', indoor: true, note: '文创园、海景咖啡', duration: 90, lat: 38.9167, lng: 121.6667 },
      { name: '东港商务区', zone: '中山', type: '街区', openHours: '全天', indoor: false, note: '音乐喷泉、威尼斯水城', duration: 120, lat: 38.9167, lng: 121.6833 },
      { name: '海之韵公园', zone: '中山', type: '自然', openHours: '全天', indoor: false, note: '滨海栈道、礁石海岸', duration: 120, lat: 38.8833, lng: 121.7000 },
      { name: '北大桥', zone: '中山', type: '自然', openHours: '全天', indoor: false, note: '滨海路地标、海景大桥', duration: 30, lat: 38.8500, lng: 121.6833 }
    ]
  },

  // ========== 数字游民试居型 ==========
  {
    id: 'dali_digital',
    name: '大理（数字游民版）',
    dimensions: { freedom: 0.90, social: 0.40, explore: 0.55, nature: 0.80, pace: 0.20, budget: 0.40 },
    emotionTags: ['数字游民', '慢生活', '逃离', '自由'],
    pois: [
      { name: '大理古城共享办公', zone: '古城', type: '室内', openHours: '09:00-21:00', indoor: true, note: 'NCC 社区、数字游民聚集' },
      { name: '洱海生态廊道', zone: '洱海西岸', type: '自然', openHours: '全天', indoor: false, note: '骑行、发呆' },
      { name: '三月街', zone: '古城', type: '街区', openHours: '全天', indoor: false, note: '集市、租房信息' },
      { name: '才村码头', zone: '洱海西岸', type: '自然', openHours: '全天', indoor: false, note: '短租民宿、安静' }
    ]
  },
  {
    id: 'lijiang_digital',
    name: '丽江（数字游民版）',
    dimensions: { freedom: 0.85, social: 0.45, explore: 0.50, nature: 0.75, pace: 0.25, budget: 0.45 },
    emotionTags: ['数字游民', '慢生活', '自由', '逃离'],
    pois: [
      { name: '束河古镇咖啡馆', zone: '束河', type: '室内', openHours: '09:00-22:00', indoor: true, note: 'WiFi、安静、长住客多' },
      { name: '白沙古镇', zone: '白沙', type: '街区', openHours: '全天', indoor: false, note: '纳西文化、低消费' },
      { name: '玉龙雪山脚下', zone: '雪山', type: '自然', openHours: '全天', indoor: false, note: '短租、田园' }
    ]
  },
  {
    id: 'chengdu_digital',
    name: '成都（数字游民版）',
    dimensions: { freedom: 0.70, social: 0.55, explore: 0.45, nature: 0.35, pace: 0.35, budget: 0.50 },
    emotionTags: ['数字游民', '烟火气', '美食', '巴适'],
    pois: [
      { name: '玉林路咖啡馆', zone: '武侯', type: '室内', openHours: '09:00-23:00', indoor: true, note: '共享办公、社区氛围' },
      { name: '东郊记忆', zone: '成华', type: '街区', openHours: '全天', indoor: false, note: '文创园、展览、咖啡' },
      { name: '人民公园', zone: '青羊', type: '文化', openHours: '06:00-22:00', indoor: false, note: '茶社、慢生活' }
    ]
  },
  {
    id: 'hangzhou_digital',
    name: '杭州（数字游民版）',
    dimensions: { freedom: 0.65, social: 0.50, explore: 0.50, nature: 0.55, pace: 0.40, budget: 0.60 },
    emotionTags: ['数字游民', '西湖', '互联网', '清新'],
    pois: [
      { name: '梦想小镇', zone: '余杭', type: '街区', openHours: '全天', indoor: false, note: '创业氛围、共享办公' },
      { name: '西溪湿地', zone: '余杭', type: '自然', openHours: '08:00-17:30', indoor: false, note: '安静、自然' },
      { name: '龙井村', zone: '西湖', type: '自然', openHours: '全天', indoor: false, note: '茶园、农家、短租' }
    ]
  }
];

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CITIES };
}
