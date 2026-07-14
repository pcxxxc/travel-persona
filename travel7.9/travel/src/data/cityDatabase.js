/**
 * 旅格 Travel Persona · 城市知识库 v2
 *
 * 20 座中国热门目的地城市，每城含六维向量 + 情绪标签 + 真实 POI + 深度剖析
 *
 * 六维标注说明：
 * - 每维 0~1，由开发者基于城市公开标签（马蜂窝/小红书词频）+ 主观体验标注
 * - nature 高 = 自然占比高；pace 高 = 节奏快；social 高 = 热闹/社交属性强
 * - budget 高 = 消费高；explore 高 = 小众/探索属性强；freedom 高 = 自由度高
 *
 * 新增深度剖析字段：
 * - profile: 城市概况、最佳季节、建议天数
 * - climate: 气候特征、穿衣建议
 * - food: 美食特色、必吃清单
 * - culture: 当地文化、历史背景
 * - practical: 交通、住宿、消费、安全提示
 * - mapCenter: 地图中心坐标 [lng, lat]
 */

const CITIES = [
  // ========== 自然疗愈型 ==========
  {
    id: 'dali',
    name: '大理',
    images: {
      cover: 'https://picsum.photos/seed/dali_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/dali_g1/400/300',
        'https://picsum.photos/seed/dali_g2/400/300',
        'https://picsum.photos/seed/dali_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.80, social: 0.30, explore: 0.60, nature: 0.90, pace: 0.20, budget: 0.45 },
    emotionTags: ['治愈', '逃离', '放空', '慢生活'],
    mapCenter: [100.165, 25.679],
    profile: {
      overview: '大理是云南高原上的一颗明珠，苍山洱海构成了它最经典的画面。这里曾是南诏国和大理国的都城，白族文化在此绵延千年。对旅行者而言，大理最大的魅力不在于某个景点，而在于一种"无所事事"的状态——在洱海边发呆、在古城里闲逛、在咖啡馆里晒太阳。',
      bestSeasons: ['3-5月（春暖花开，苍山雪未化）', '9-11月（秋高气爽，雨季结束）'],
      avoidSeasons: ['7-8月（雨季，洱海水质受影响）', '春节/国庆（人满为患）'],
      suggestDays: '4-7天',
      idealFor: '想要放空、逃离城市喧嚣、寻找创作灵感的人',
      vibe: '慵懒、自由、文艺、治愈'
    },
    climate: {
      type: '高原季风气候',
      features: '四季如春，昼夜温差大，紫外线强',
      avgTemp: { spring: '15-22°C', summer: '18-25°C', autumn: '15-22°C', winter: '8-18°C' },
      rainfall: '6-9月为雨季，其余干燥',
      clothing: '春秋：薄外套+长袖；夏：短袖+防晒；冬：羽绒服（早晚冷）',
      tips: '防晒！防晒！防晒！高原紫外线极强，SPF50+必备'
    },
    food: {
      signature: '白族菜、酸辣鱼、乳扇、饵丝、鲜花饼',
      mustTry: [
        { name: '酸辣鱼', desc: '洱海鲫鱼配木瓜酸，白族待客头道菜', where: '古城周边白族餐馆' },
        { name: '乳扇', desc: '牛奶制成的薄片，烤或炸都香', where: '古城小吃摊' },
        { name: '饵丝', desc: '大米制成的面条，早餐首选', where: '古城北门菜市场' },
        { name: '喜洲粑粑', desc: '酥脆多层，有甜咸两种', where: '喜洲古镇' },
        { name: '鲜花饼', desc: '玫瑰花瓣入馅，现烤最佳', where: '古城各店' }
      ],
      diningScene: '古城内咖啡馆密度极高，从10元的本地茶馆到50元的精品咖啡都有。人民路是夜生活核心区，小酒馆和烧烤摊营业到凌晨。',
      budget: '早餐10-20元，正餐30-60元，咖啡20-40元'
    },
    culture: {
      ethnicity: '白族为主，白族人口占60%以上',
      history: '南诏国（738-902）和大理国（937-1253）的都城，历时500余年。古城始建于明洪武年间，距今600多年。',
      customs: '白族三道茶（一苦二甜三回味）、本主崇拜（每个村子有自己的守护神）、扎染技艺',
      taboos: '不要随意触摸白族民居的门神画；进寺庙不要踩门槛',
      festivals: '三月街（农历三月十五，持续一周，赛马、对歌、贸易）'
    },
    practical: {
      transport: {
        arrival: '飞机：大理凤仪机场（距古城30km，打车约80元）；高铁：大理站（距古城15km）',
        local: '古城内步行即可；环洱海建议租电动车（50-80元/天）或自行车',
        gettingAround: '古城→喜洲：中巴10元；古城→双廊：拼车约30元'
      },
      accommodation: {
        budget: '古城内青旅床位30-60元，民宿标间100-200元',
        mid: '洱海海景民宿300-600元（海西看日出，海东看日落）',
        luxury: '双廊临水精品酒店800-2000元'
      },
      safety: '总体安全，古城内夜间有巡逻。注意：环洱海骑行注意防晒和补水；洱海西部分路段机动车与非机动车混行需注意',
      health: '海拔2000米，一般无高反。紫外线极强，需做好防晒。雨季偶有腹泻，注意饮食卫生。',
      money: '支付宝/微信普及，现金需求少。古城内ATM较多。'
    },
    pois: [
      { name: '洱海生态廊道', zone: '洱海西岸', type: '自然', openHours: '全天', indoor: false, note: '骑行、发呆、看云', lat: 25.7, lng: 100.15 },
      { name: '人民路', zone: '古城', type: '街区', openHours: '10:00-22:00', indoor: false, note: '咖啡馆、小店、流浪歌手', lat: 25.69, lng: 100.165 },
      { name: '寂照庵', zone: '苍山', type: '文化', openHours: '08:00-18:00', indoor: false, note: '最美尼姑庵、素斋（20元/人，11:30开餐）', lat: 25.68, lng: 100.15 },
      { name: '喜洲古镇', zone: '喜洲', type: '街区', openHours: '全天', indoor: false, note: '稻田、老宅、粑粑', lat: 25.85, lng: 100.13 },
      { name: '双廊', zone: '洱海东岸', type: '自然', openHours: '全天', indoor: false, note: '临水民宿、日落', lat: 25.92, lng: 100.19 },
      { name: '苍山洗马潭索道', zone: '苍山', type: '自然', openHours: '08:30-17:00', indoor: false, note: '高山草甸、俯瞰洱海（门票+索道约300元）', lat: 25.68, lng: 100.14 }
    ]
  },
  {
    id: 'lijiang',
    name: '丽江',
    images: {
      cover: 'https://picsum.photos/seed/lijiang_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/lijiang_g1/400/300',
        'https://picsum.photos/seed/lijiang_g2/400/300',
        'https://picsum.photos/seed/lijiang_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.75, social: 0.50, explore: 0.55, nature: 0.80, pace: 0.30, budget: 0.50 },
    emotionTags: ['浪漫', '古城', '雪山', '慢生活'],
    mapCenter: [100.23, 26.87],
    profile: {
      overview: '丽江是纳西族的故乡，世界文化遗产古城保存完好。玉龙雪山常年积雪，古城内小桥流水、石板街巷，夜晚酒吧街热闹非凡。相比大理，丽江更商业化但也更精致，适合喜欢热闹又不想太喧嚣的人。',
      bestSeasons: ['4-5月（春花烂漫，雪山清晰可见）', '9-10月（秋高气爽，游客相对较少）'],
      avoidSeasons: ['7-8月（雨季，古城石板路湿滑）', '春节/国庆（古城内寸步难行）'],
      suggestDays: '3-5天',
      idealFor: '喜欢古城氛围、想体验纳西文化、想看雪山的人',
      vibe: '浪漫、热闹、古朴、多元'
    },
    climate: {
      type: '高原山地气候',
      features: '昼夜温差大，干湿季分明，紫外线强',
      avgTemp: { spring: '12-20°C', summer: '16-24°C', autumn: '12-20°C', winter: '5-15°C' },
      rainfall: '6-9月雨季，其余干燥',
      clothing: '春秋：外套+长袖；夏：短袖+薄外套；冬：羽绒服',
      tips: '古城海拔2400米，部分人可能有轻微高反。不要剧烈运动。'
    },
    food: {
      signature: '纳西菜、腊排骨火锅、鸡豆凉粉、粑粑',
      mustTry: [
        { name: '腊排骨火锅', desc: '腌制风干的排骨，汤底浓郁', where: '古城南门附近' },
        { name: '鸡豆凉粉', desc: '纳西特色小吃，凉拌或煎炒', where: '古城小吃街' },
        { name: '纳西烤鱼', desc: '泸沽湖鱼配纳西香料', where: '古城餐馆' },
        { name: '酥油茶', desc: '藏族饮品，咸香暖胃', where: '古城藏餐馆' }
      ],
      diningScene: '古城内餐饮选择极多，从纳西家常菜到西餐酒吧应有尽有。五一街、七一街是美食集中地。',
      budget: '早餐15-25元，正餐40-80元，酒吧消费50-150元'
    },
    culture: {
      ethnicity: '纳西族为主，还有藏族、白族、汉族',
      history: '丽江古城始建于宋末元初，距今800余年。纳西族创造了世界上唯一活着的象形文字——东巴文。',
      customs: '东巴文化、纳西古乐、三朵节（纳西族传统节日）',
      taboos: '不要踩踏古城内的三眼井（饮水、洗衣、洗菜依次使用）；进纳西民居先敲门',
      festivals: '三朵节（农历二月初八，纳西族最盛大节日）'
    },
    practical: {
      transport: {
        arrival: '飞机：丽江三义机场（距古城30km，机场大巴20元）；高铁：丽江站',
        local: '古城内步行；去玉龙雪山可拼车（约50元/人往返）',
        gettingAround: '古城→束河：公交或打车约20元；古城→玉龙雪山：拼车或包车'
      },
      accommodation: {
        budget: '古城内青旅床位40-80元，民宿标间150-300元',
        mid: '古城精品客栈300-600元',
        luxury: '古城内高端酒店800-2000元'
      },
      safety: '古城内安全，但夜间酒吧街人多需注意财物。玉龙雪山海拔4680米，需备氧气瓶（古城购买约30元）。',
      health: '海拔2400米，少数人会有轻微高反。上玉龙雪山建议提前在古城适应1-2天。',
      money: '支付宝/微信普及。古城内ATM较多。'
    },
    pois: [
      { name: '丽江古城', zone: '古城', type: '街区', openHours: '全天', indoor: false, note: '石板路、酒吧、夜景（维护费50元）', lat: 26.87, lng: 100.23 },
      { name: '玉龙雪山', zone: '雪山', type: '自然', openHours: '06:30-18:00', indoor: false, note: '冰川公园、蓝月谷（门票+索道约400元）', lat: 27.1, lng: 100.18 },
      { name: '束河古镇', zone: '束河', type: '街区', openHours: '全天', indoor: false, note: '比古城安静、茶马古道', lat: 26.9, lng: 100.2 },
      { name: '拉市海', zone: '拉市海', type: '自然', openHours: '全天', indoor: false, note: '湿地、骑马、观鸟', lat: 26.85, lng: 100.12 },
      { name: '白沙古镇', zone: '白沙', type: '文化', openHours: '全天', indoor: false, note: '纳西文化、壁画、咖啡', lat: 26.95, lng: 100.22 }
    ]
  },
  {
    id: 'xiamen',
    name: '厦门',
    images: {
      cover: 'https://picsum.photos/seed/xiamen_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/xiamen_g1/400/300',
        'https://picsum.photos/seed/xiamen_g2/400/300',
        'https://picsum.photos/seed/xiamen_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.70, social: 0.55, explore: 0.50, nature: 0.65, pace: 0.40, budget: 0.55 },
    emotionTags: ['文艺', '海岛', '慢生活', '清新'],
    mapCenter: [118.08, 24.44],
    profile: {
      overview: '厦门是中国最文艺的海滨城市，鼓浪屿的万国建筑、环岛路的海风、沙坡尾的艺术区，构成了它独特的气质。这里既有大都市的便利，又有小城市的悠闲，是文艺青年和情侣的热门目的地。',
      bestSeasons: ['3-5月（气候舒适，三角梅盛开）', '10-11月（秋高气爽，海鲜肥美）'],
      avoidSeasons: ['7-9月（台风季，湿热难耐）', '春节（鼓浪屿限流，一票难求）'],
      suggestDays: '3-4天',
      idealFor: '文艺青年、情侣、喜欢海岛城市氛围的人',
      vibe: '清新、文艺、浪漫、悠闲'
    },
    climate: {
      type: '亚热带海洋性气候',
      features: '温暖湿润，台风季明显，夏季炎热',
      avgTemp: { spring: '18-25°C', summer: '26-33°C', autumn: '20-28°C', winter: '12-20°C' },
      rainfall: '4-9月多雨，7-9月台风季',
      clothing: '春：薄外套；夏：短袖+防晒；秋：长袖；冬：薄外套即可',
      tips: '夏季湿热，建议带止汗用品。台风季关注天气预报。'
    },
    food: {
      signature: '闽南菜、沙茶面、土笋冻、海蛎煎、花生汤',
      mustTry: [
        { name: '沙茶面', desc: '沙茶酱汤底，自选配料', where: '四里沙茶面、乌糖沙茶面' },
        { name: '土笋冻', desc: '海虫熬制的果冻，蘸酱吃', where: '中山路小吃街' },
        { name: '海蛎煎', desc: '海蛎+鸡蛋+地瓜粉煎制', where: '鼓浪屿、中山路' },
        { name: '花生汤', desc: '花生熬至软烂，甜而不腻', where: '黄则和花生汤' },
        { name: '姜母鸭', desc: '老姜+番鸭慢炖，温补', where: '大排档、餐馆' }
      ],
      diningScene: '中山路是美食集中地，从老字号到网红店都有。鼓浪屿上小吃众多但价格偏高。沙坡尾有很多精品咖啡馆。',
      budget: '早餐15-30元，正餐50-100元，小吃10-30元'
    },
    culture: {
      ethnicity: '闽南人为主，闽南文化浓厚',
      history: '厦门港是近代中国最早开放的通商口岸之一。鼓浪屿有"万国建筑博览"之称，保存了1000多栋风格各异的老建筑。',
      customs: '闽南茶文化（功夫茶）、博饼（中秋传统游戏）、南音（古老乐种）',
      taboos: '不要随意进入未开放的鼓浪屿老建筑；喝茶时主人倒茶要轻叩桌面表示感谢',
      festivals: '中秋博饼（农历八月，厦门特有民俗）'
    },
    practical: {
      transport: {
        arrival: '飞机：厦门高崎机场（市区内，地铁直达）；高铁：厦门站/厦门北站',
        local: '地铁+公交覆盖主要景点；鼓浪屿需轮渡（船票35元往返，需提前预订）',
        gettingAround: '环岛路建议骑行（共享单车或租车）；鼓浪屿全程步行'
      },
      accommodation: {
        budget: '青旅床位50-100元，快捷酒店150-250元',
        mid: '鼓浪屿民宿300-600元，岛内酒店300-500元',
        luxury: '海景酒店600-1500元'
      },
      safety: '治安良好。注意：鼓浪屿轮渡票需提前在"厦门轮渡"公众号预订；夏季海边游泳注意安全。',
      health: '夏季注意防暑降温，多补水。海鲜注意新鲜度，避免肠胃不适。',
      money: '支付宝/微信普及。鼓浪屿上部分老店只收现金，建议备少量。'
    },
    pois: [
      { name: '鼓浪屿', zone: '鼓浪屿', type: '街区', openHours: '全天', indoor: false, note: '万国建筑、钢琴博物馆（船票35元）', lat: 24.44, lng: 118.08 },
      { name: '环岛路', zone: '环岛', type: '自然', openHours: '全天', indoor: false, note: '骑行、海景、日落', lat: 24.45, lng: 118.1 },
      { name: '沙坡尾', zone: '思明', type: '街区', openHours: '全天', indoor: false, note: '艺术区、老渔港、咖啡', lat: 24.44, lng: 118.1 },
      { name: '植物园', zone: '万石山', type: '自然', openHours: '06:30-18:00', indoor: false, note: '雨林喷雾、多肉区（门票30元）', lat: 24.44, lng: 118.12 },
      { name: '曾厝垵', zone: '环岛', type: '街区', openHours: '全天', indoor: false, note: '小吃街、民宿、夜市', lat: 24.43, lng: 118.12 }
    ]
  },
  {
    id: 'qinghaihu',
    name: '青海湖',
    images: {
      cover: 'https://picsum.photos/seed/qinghaihu_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/qinghaihu_g1/400/300',
        'https://picsum.photos/seed/qinghaihu_g2/400/300',
        'https://picsum.photos/seed/qinghaihu_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.85, social: 0.15, explore: 0.70, nature: 0.95, pace: 0.15, budget: 0.35 },
    emotionTags: ['孤独', '辽阔', '治愈', '逃离'],
    mapCenter: [100.0, 36.8],
    profile: {
      overview: '青海湖是中国最大的内陆咸水湖，海拔3200米。这里的辽阔和寂静有一种治愈人心的力量——环湖360公里，沿途是草原、沙漠、雪山和油菜花的交替。适合想要彻底逃离人群、与大自然独处的人。',
      bestSeasons: ['7-8月（油菜花盛开，湖水最蓝）', '9月（游客少，秋色初现）'],
      avoidSeasons: ['11-3月（严寒，部分路段封闭）', '5-6月（风大，景色单调）'],
      suggestDays: '3-4天（环湖）',
      idealFor: '想要彻底逃离、喜欢自驾/骑行、能承受高原环境的人',
      vibe: '辽阔、孤独、神圣、原始'
    },
    climate: {
      type: '高原大陆性气候',
      features: '昼夜温差极大，紫外线极强，天气多变',
      avgTemp: { spring: '0-10°C', summer: '10-20°C', autumn: '0-12°C', winter: '-15-(-5)°C' },
      rainfall: '全年干燥，夏季偶有阵雨',
      clothing: '夏：冲锋衣+长袖（早晚冷）；冬：羽绒服+保暖内衣',
      tips: '海拔3200米，可能有高反。建议提前服用红景天。防晒和保暖同等重要。'
    },
    food: {
      signature: '藏餐、牛羊肉、糌粑、酥油茶、酸奶',
      mustTry: [
        { name: '手抓羊肉', desc: '高原羊肉，鲜嫩无膻味', where: '环湖沿途餐馆' },
        { name: '牦牛酸奶', desc: '浓稠酸爽，表面结奶皮', where: '牧民家或小镇餐馆' },
        { name: '糌粑', desc: '青稞面+酥油茶搅拌', where: '藏民家体验' },
        { name: '酥油茶', desc: '藏族日常饮品，咸香暖胃', where: '各处藏餐馆' }
      ],
      diningScene: '环湖沿途餐饮选择有限，以川菜和藏餐为主。黑马河、二郎剑是主要补给点。',
      budget: '正餐40-80元，住宿含早的话早餐免费'
    },
    culture: {
      ethnicity: '藏族为主，还有回族、蒙古族',
      history: '青海湖在藏语中叫"措温布"（青色的海），是藏传佛教的圣湖。环湖有众多寺庙，每年夏季有转湖仪式。',
      customs: '转湖（顺时针绕行，祈求福报）、磕长头、挂经幡',
      taboos: '不要逆时针转湖；不要踩踏经幡；不要触摸藏族人的头部',
      festivals: '环青海湖国际公路自行车赛（每年7-8月）'
    },
    practical: {
      transport: {
        arrival: '飞机：西宁曹家堡机场（距青海湖150km）；高铁：西宁站',
        local: '环湖建议自驾或包车（约600-1000元/天）；骑行需4-5天',
        gettingAround: '西宁→青海湖：大巴约2小时（40元）；环湖拼车约150元/人'
      },
      accommodation: {
        budget: '青旅床位50-100元，湖边帐篷100-200元',
        mid: '湖边客栈200-400元（条件一般，景色绝佳）',
        luxury: '湖边度假酒店500-1000元（极少，需提前预订）'
      },
      safety: '环湖公路车况良好但偶有牛羊横穿。海拔3200米，注意高反。湖边风大，注意保暖。',
      health: '海拔3200米，高反常见症状：头痛、失眠、气短。建议在西宁适应1天再前往。',
      money: '支付宝/微信在主要景点可用，但湖边部分地区信号差，建议备现金。'
    },
    pois: [
      { name: '环湖西路', zone: '环湖', type: '自然', openHours: '全天', indoor: false, note: '最美环湖段、日出', lat: 36.9, lng: 99.9 },
      { name: '茶卡盐湖', zone: '茶卡', type: '自然', openHours: '07:00-21:00', indoor: false, note: '天空之镜、日落（门票60元）', lat: 36.8, lng: 99.1 },
      { name: '黑马河', zone: '环湖', type: '自然', openHours: '全天', indoor: false, note: '日出观测点', lat: 36.75, lng: 99.78 },
      { name: '鸟岛', zone: '环湖', type: '自然', openHours: '08:00-18:00', indoor: false, note: '候鸟、湿地（季节性，门票100元）', lat: 36.95, lng: 99.85 }
    ]
  },

  // ========== 城市漫游型 ==========
  {
    id: 'chengdu',
    name: '成都',
    images: {
      cover: 'https://picsum.photos/seed/chengdu_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/chengdu_g1/400/300',
        'https://picsum.photos/seed/chengdu_g2/400/300',
        'https://picsum.photos/seed/chengdu_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.65, social: 0.60, explore: 0.50, nature: 0.40, pace: 0.35, budget: 0.50 },
    emotionTags: ['烟火气', '美食', '慢生活', '巴适'],
    mapCenter: [104.06, 30.67],
    profile: {
      overview: '成都是中国最具"烟火气"的城市，也是联合国认证的世界美食之都。这里有3000年不曾更名的历史，也有最慵懒的生活节奏——喝茶、打麻将、吃火锅是成都人的日常。对旅行者而言，成都是一座"来了就不想走"的城市。',
      bestSeasons: ['3-5月（春暖花开，气候宜人）', '9-11月（秋高气爽，银杏金黄）'],
      avoidSeasons: ['7-8月（闷热，但室内有空调）', '春节（部分老店休息）'],
      suggestDays: '4-6天',
      idealFor: '吃货、喜欢慢生活的人、想体验地道川渝文化的人',
      vibe: '巴适、烟火、慵懒、包容'
    },
    climate: {
      type: '亚热带季风气候',
      features: '湿润多雨，夏季闷热，冬季阴冷',
      avgTemp: { spring: '15-22°C', summer: '24-32°C', autumn: '16-23°C', winter: '6-12°C' },
      rainfall: '全年湿润，夏季多雨',
      clothing: '春：薄外套；夏：短袖+防晒；秋：长袖+外套；冬：羽绒服',
      tips: '成都冬天阴冷，体感温度比实际低。夏天闷热，建议中午回酒店休息。'
    },
    food: {
      signature: '川菜、火锅、串串、担担面、龙抄手、钟水饺',
      mustTry: [
        { name: '火锅', desc: '麻辣鲜香，成都灵魂', where: '小龙坎、蜀大侠、电台巷' },
        { name: '串串香', desc: '竹签串菜，按签计费', where: '钢管厂五区小郡肝' },
        { name: '担担面', desc: '肉末+芽菜+花生碎', where: '老字号面馆' },
        { name: '龙抄手', desc: '成都名小吃，皮薄馅嫩', where: '春熙路龙抄手总店' },
        { name: '兔头', desc: '成都人最爱，麻辣入味', where: '双流老妈兔头' }
      ],
      diningScene: '成都餐饮极其丰富，从街边苍蝇馆子到米其林餐厅应有尽有。玉林路、建设路是美食集中地。',
      budget: '早餐10-20元，正餐40-100元，火锅人均80-150元'
    },
    culture: {
      ethnicity: '汉族为主，有藏族、回族等少数民族',
      history: '成都建城史超过2300年，是中国唯一一个3000年未更名的城市。三国时期蜀汉都城，杜甫曾在此居住。',
      customs: '茶馆文化（盖碗茶）、麻将文化、川剧变脸',
      taboos: '不要评论成都人吃兔头"残忍"；进茶馆不要大声喧哗',
      festivals: '成都美食节（每年9月）'
    },
    practical: {
      transport: {
        arrival: '飞机：成都天府机场/双流机场；高铁：成都东站/南站',
        local: '地铁覆盖主要景点；去大熊猫基地有旅游专线',
        gettingAround: '市区内地铁+公交即可；去都江堰可城际高铁'
      },
      accommodation: {
        budget: '青旅床位40-80元，快捷酒店150-250元',
        mid: '市区酒店300-500元',
        luxury: '高端酒店600-1500元'
      },
      safety: '治安良好。注意：吃火锅注意辣度，量力而行；吃串串注意签子计数。',
      health: '吃辣容易上火，建议备肠胃药。夏天注意防暑。',
      money: '支付宝/微信普及，现金需求极少。'
    },
    pois: [
      { name: '宽窄巷子', zone: '青羊', type: '街区', openHours: '全天', indoor: false, note: '老成都、茶馆、小吃', lat: 30.67, lng: 104.05 },
      { name: '锦里', zone: '武侯', type: '街区', openHours: '全天', indoor: false, note: '古街、夜景、三国文化', lat: 30.64, lng: 104.04 },
      { name: '人民公园', zone: '青羊', type: '文化', openHours: '06:00-22:00', indoor: false, note: '鹤鸣茶社、采耳', lat: 30.66, lng: 104.05 },
      { name: '玉林路', zone: '武侯', type: '街区', openHours: '全天', indoor: false, note: '小酒馆、老社区、烧烤', lat: 30.63, lng: 104.05 },
      { name: '大熊猫基地', zone: '成华', type: '自然', openHours: '07:30-18:00', indoor: false, note: '看熊猫、早去（门票55元）', lat: 30.73, lng: 104.15 },
      { name: '太古里', zone: '锦江', type: '街区', openHours: '10:00-22:00', indoor: false, note: '时尚街区、方所书店', lat: 30.66, lng: 104.08 }
    ]
  },
  {
    id: 'suzhou',
    name: '苏州',
    images: {
      cover: 'https://picsum.photos/seed/suzhou_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/suzhou_g1/400/300',
        'https://picsum.photos/seed/suzhou_g2/400/300',
        'https://picsum.photos/seed/suzhou_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.55, social: 0.40, explore: 0.60, nature: 0.55, pace: 0.30, budget: 0.55 },
    emotionTags: ['江南', '园林', '慢生活', '雅致'],
    mapCenter: [120.62, 31.30],
    profile: {
      overview: '苏州是江南文化的代表，"上有天堂，下有苏杭"。这里有小桥流水、粉墙黛瓦，有中国最美的古典园林，也有现代化的工业园区。苏州的慢不是慵懒，而是一种精致的从容。',
      bestSeasons: ['3-5月（春暖花开，园林最美）', '9-11月（秋高气爽，桂花飘香）'],
      avoidSeasons: ['6-7月（梅雨季节，潮湿闷热）', '春节/国庆（园林拥挤）'],
      suggestDays: '3-4天',
      idealFor: '喜欢江南文化、园林艺术、精致生活的人',
      vibe: '雅致、温婉、精致、诗意'
    },
    climate: {
      type: '亚热带季风气候',
      features: '四季分明，梅雨季节明显',
      avgTemp: { spring: '12-20°C', summer: '25-33°C', autumn: '18-26°C', winter: '3-10°C' },
      rainfall: '6-7月梅雨季节',
      clothing: '春：薄外套；夏：短袖；秋：长袖；冬：羽绒服',
      tips: '梅雨季节带伞，园林石板路湿滑。'
    },
    food: {
      signature: '苏帮菜、松鼠桂鱼、响油鳝糊、苏式汤面、蟹壳黄',
      mustTry: [
        { name: '松鼠桂鱼', desc: '苏帮菜代表，酸甜酥脆', where: '松鹤楼、得月楼' },
        { name: '苏式汤面', desc: '浇头丰富，汤清味鲜', where: '同得兴、裕兴记' },
        { name: '蟹壳黄', desc: '酥脆小烧饼，有甜咸两种', where: '老字号点心店' },
        { name: '响油鳝糊', desc: '热油浇淋，香气四溢', where: '传统苏帮菜馆' }
      ],
      diningScene: '苏州菜偏甜，口味清淡。平江路、山塘街有很多特色餐馆。',
      budget: '早餐15-30元，正餐60-120元'
    },
    culture: {
      ethnicity: '汉族，吴文化核心区',
      history: '苏州建城史2500余年，是吴文化的发源地。明清时期苏州园林达到鼎盛，现存9座古典园林被列入世界文化遗产。',
      customs: '昆曲（百戏之祖）、评弹、苏绣、园林文化',
      taboos: '进园林不要踩踏假山；听评弹不要大声说话',
      festivals: '苏州国际旅游节（每年4-5月）'
    },
    practical: {
      transport: {
        arrival: '高铁：苏州站/苏州北站（上海过来约30分钟）',
        local: '地铁+公交；古城区建议步行或骑行',
        gettingAround: '苏州→周庄/同里：公交或旅游专线'
      },
      accommodation: {
        budget: '快捷酒店150-250元',
        mid: '古城区民宿300-500元',
        luxury: '园林式酒店600-1500元'
      },
      safety: '治安良好。园林内注意防滑。',
      health: '梅雨季节注意防潮。饮食偏甜，糖尿病患者注意。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '拙政园', zone: '姑苏', type: '文化', openHours: '07:30-17:30', indoor: false, note: '中国四大名园之首（门票80元）', lat: 31.32, lng: 120.62 },
      { name: '平江路', zone: '姑苏', type: '街区', openHours: '全天', indoor: false, note: '水乡、评弹、猫空书店', lat: 31.31, lng: 120.63 },
      { name: '山塘街', zone: '姑苏', type: '街区', openHours: '全天', indoor: false, note: '夜景、小吃、游船', lat: 31.32, lng: 120.58 },
      { name: '苏州博物馆', zone: '姑苏', type: '文化', openHours: '09:00-17:00', indoor: true, note: '贝聿铭设计、需预约（免费）', lat: 31.32, lng: 120.63 },
      { name: '金鸡湖', zone: '园区', type: '自然', openHours: '全天', indoor: false, note: '现代苏州、摩天轮', lat: 31.32, lng: 120.72 }
    ]
  },
  {
    id: 'hangzhou',
    name: '杭州',
    images: {
      cover: 'https://picsum.photos/seed/hangzhou_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/hangzhou_g1/400/300',
        'https://picsum.photos/seed/hangzhou_g2/400/300',
        'https://picsum.photos/seed/hangzhou_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.60, social: 0.50, explore: 0.50, nature: 0.60, pace: 0.40, budget: 0.60 },
    emotionTags: ['西湖', '文艺', '慢生活', '清新'],
    mapCenter: [120.15, 30.25],
    profile: {
      overview: '杭州是中国最具幸福感的城市之一，西湖是它最闪亮的名片。这里有"淡妆浓抹总相宜"的湖光山色，也有阿里巴巴带来的互联网活力。杭州的美在于自然与人文的完美融合。',
      bestSeasons: ['3-5月（苏堤春晓，桃红柳绿）', '9-11月（满陇桂雨，秋高气爽）'],
      avoidSeasons: ['6-7月（梅雨）', '春节/国庆（西湖断桥可能"断"不了）'],
      suggestDays: '3-5天',
      idealFor: '喜欢湖光山色、茶文化、互联网氛围的人',
      vibe: '清新、文艺、活力、诗意'
    },
    climate: {
      type: '亚热带季风气候',
      features: '四季分明，夏季炎热，冬季湿冷',
      avgTemp: { spring: '12-20°C', summer: '25-35°C', autumn: '18-28°C', winter: '3-10°C' },
      rainfall: '6-7月梅雨，8-9月台风',
      clothing: '春：薄外套；夏：短袖；秋：长袖；冬：羽绒服',
      tips: '夏天非常热，建议早晚出行。'
    },
    food: {
      signature: '杭帮菜、西湖醋鱼、东坡肉、龙井虾仁、片儿川',
      mustTry: [
        { name: '西湖醋鱼', desc: '酸甜口味，选用草鱼', where: '楼外楼、知味观' },
        { name: '东坡肉', desc: '肥而不腻，入口即化', where: '各杭帮菜馆' },
        { name: '龙井虾仁', desc: '茶叶+虾仁，清香鲜嫩', where: '高档杭帮菜馆' },
        { name: '片儿川', desc: '杭州特色面食，雪菜笋片', where: '菊英面馆、奎元馆' }
      ],
      diningScene: '杭帮菜口味清淡偏甜。河坊街、南宋御街是美食集中地。',
      budget: '早餐15-30元，正餐60-150元'
    },
    culture: {
      ethnicity: '汉族，吴越文化',
      history: '杭州是南宋都城，距今800余年。西湖文化景观被列入世界文化遗产。龙井茶产自杭州西湖区。',
      customs: '茶文化、丝绸文化、佛教文化（灵隐寺）',
      taboos: '在龙井村买茶注意辨别真伪；进寺庙不要大声喧哗',
      festivals: '西湖博览会（每年10月）'
    },
    practical: {
      transport: {
        arrival: '飞机：杭州萧山机场；高铁：杭州东站/城站',
        local: '地铁覆盖主要景点；西湖景区建议骑行或步行',
        gettingAround: '西湖环湖有观光车；去灵隐寺有公交专线'
      },
      accommodation: {
        budget: '快捷酒店200-300元',
        mid: '西湖周边酒店400-800元',
        luxury: '西湖国宾馆等1000-3000元'
      },
      safety: '治安良好。西湖边注意防骗（不要信"算命""卖玉"）。',
      health: '夏季防暑，冬季湿冷注意保暖。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '西湖', zone: '西湖', type: '自然', openHours: '全天', indoor: false, note: '断桥、苏堤、雷峰塔（免费）', lat: 30.25, lng: 120.15 },
      { name: '灵隐寺', zone: '西湖', type: '文化', openHours: '07:00-18:00', indoor: false, note: '古刹、飞来峰（门票75元）', lat: 30.24, lng: 120.1 },
      { name: '河坊街', zone: '上城', type: '街区', openHours: '全天', indoor: false, note: '老字号、小吃', lat: 30.24, lng: 120.17 },
      { name: '龙井村', zone: '西湖', type: '自然', openHours: '全天', indoor: false, note: '茶园、采茶、农家菜', lat: 30.22, lng: 120.1 },
      { name: '西溪湿地', zone: '余杭', type: '自然', openHours: '08:00-17:30', indoor: false, note: '摇橹船、秋芦飞雪（门票80元）', lat: 30.27, lng: 120.06 }
    ]
  },
  {
    id: 'beijing',
    name: '北京',
    images: {
      cover: 'https://picsum.photos/seed/beijing_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/beijing_g1/400/300',
        'https://picsum.photos/seed/beijing_g2/400/300',
        'https://picsum.photos/seed/beijing_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.50, social: 0.70, explore: 0.75, nature: 0.40, pace: 0.70, budget: 0.70 },
    emotionTags: ['历史', '文化', '大气', '多元'],
    mapCenter: [116.40, 39.90],
    profile: {
      overview: '北京是中国的心脏，也是一座巨大的露天博物馆。这里有世界最大的宫殿建筑群——故宫，有绵延万里的长城，也有798艺术区这样的当代艺术地标。北京的大气在于它的历史厚度，也在于它的文化包容。',
      bestSeasons: ['4-5月（春暖花开，柳絮飞舞）', '9-10月（秋高气爽，香山红叶）'],
      avoidSeasons: ['7-8月（闷热）', '11-3月（寒冷干燥，偶有雾霾）'],
      suggestDays: '5-7天',
      idealFor: '历史爱好者、文化探索者、第一次来中国的人',
      vibe: '大气、厚重、多元、活力'
    },
    climate: {
      type: '温带季风气候',
      features: '四季分明，夏季炎热多雨，冬季寒冷干燥',
      avgTemp: { spring: '10-20°C', summer: '24-32°C', autumn: '10-20°C', winter: '-5-5°C' },
      rainfall: '7-8月雨季',
      clothing: '春：外套；夏：短袖；秋：厚外套；冬：羽绒服+保暖',
      tips: '冬天非常干燥，注意保湿。春天有柳絮，过敏者注意。'
    },
    food: {
      signature: '北京烤鸭、炸酱面、豆汁、卤煮、涮羊肉',
      mustTry: [
        { name: '北京烤鸭', desc: '皮脆肉嫩，配薄饼葱丝', where: '全聚德、大董、四季民福' },
        { name: '炸酱面', desc: '黄酱+肉末，配黄瓜丝', where: '老北京面馆' },
        { name: '豆汁', desc: '发酵绿豆汁，老北京特色（味道挑战）', where: '护国寺小吃' },
        { name: '涮羊肉', desc: '铜锅炭火，羊肉片涮几秒即食', where: '东来顺、南门涮肉' }
      ],
      diningScene: '北京餐饮极其多元，从宫廷菜到胡同小吃，从米其林到苍蝇馆子。簋街是夜宵圣地。',
      budget: '早餐15-30元，正餐60-200元，烤鸭人均150-300元'
    },
    culture: {
      ethnicity: '汉族为主，多民族聚居',
      history: '北京建城史3000余年，元明清三朝都城。故宫是世界最大宫殿群，长城是世界文化遗产。',
      customs: '京剧、胡同文化、四合院、老北京吆喝',
      taboos: '不要对故宫建筑指指点点；进寺庙不要踩门槛',
      festivals: '春节庙会、地坛书市'
    },
    practical: {
      transport: {
        arrival: '飞机：首都机场/大兴机场；高铁：北京南站/西站',
        local: '地铁极其发达，覆盖所有景点；公交辅助',
        gettingAround: '故宫→长城：旅游专线或S2线火车'
      },
      accommodation: {
        budget: '青旅床位80-150元，快捷酒店250-400元',
        mid: '市区酒店400-800元',
        luxury: '五星级酒店1000-3000元'
      },
      safety: '治安良好。注意：故宫、长城等热门景点需提前网上预订。',
      health: '冬季干燥，注意补水。空气质量偶有不佳，敏感人群关注AQI。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '故宫', zone: '东城', type: '文化', openHours: '08:30-17:00', indoor: true, note: '需预约、周一闭馆（门票60元）', lat: 39.92, lng: 116.40 },
      { name: '胡同', zone: '东城/西城', type: '街区', openHours: '全天', indoor: false, note: '南锣鼓巷、五道营', lat: 39.93, lng: 116.40 },
      { name: '798艺术区', zone: '朝阳', type: '街区', openHours: '10:00-18:00', indoor: true, note: '画廊、展览、咖啡', lat: 39.98, lng: 116.50 },
      { name: '景山公园', zone: '西城', type: '自然', openHours: '06:00-21:00', indoor: false, note: '俯瞰故宫、日落（门票2元）', lat: 39.92, lng: 116.39 },
      { name: '国家博物馆', zone: '东城', type: '文化', openHours: '09:00-17:00', indoor: true, note: '免费、需预约', lat: 39.90, lng: 116.40 }
    ]
  },

  // ========== 烟火气探索型 ==========
  {
    id: 'chongqing',
    name: '重庆',
    images: {
      cover: 'https://picsum.photos/seed/chongqing_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/chongqing_g1/400/300',
        'https://picsum.photos/seed/chongqing_g2/400/300',
        'https://picsum.photos/seed/chongqing_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.60, social: 0.70, explore: 0.65, nature: 0.35, pace: 0.60, budget: 0.45 },
    emotionTags: ['魔幻', '火锅', '烟火气', '立体'],
    mapCenter: [106.55, 29.56],
    profile: {
      overview: '重庆是中国最"魔幻"的城市——轻轨穿楼、电梯当公交、导航在这里会失灵。这里是火锅的发源地，也是赛博朋克风格的天然取景地。重庆的烟火气藏在每一个梯坎和夜市里。',
      bestSeasons: ['4-5月（气候舒适）', '9-10月（秋高气爽）'],
      avoidSeasons: ['7-8月（火炉城市，极度闷热）', '12-2月（湿冷，多雾）'],
      suggestDays: '3-4天',
      idealFor: '吃货、喜欢探索独特城市景观、不怕爬坡上坎的人',
      vibe: '魔幻、热辣、烟火、立体'
    },
    climate: {
      type: '亚热带季风气候',
      features: '夏季酷热（火炉城市），冬季湿冷，多雾',
      avgTemp: { spring: '15-22°C', summer: '26-38°C', autumn: '18-25°C', winter: '7-12°C' },
      rainfall: '夏季多雨',
      clothing: '春：薄外套；夏：短袖（大量）；秋：长袖；冬：羽绒服',
      tips: '夏天极其闷热，建议室内活动为主。穿舒适的平底鞋（爬坡多）。'
    },
    food: {
      signature: '重庆火锅、小面、酸辣粉、毛血旺、辣子鸡',
      mustTry: [
        { name: '重庆火锅', desc: '牛油锅底，麻辣鲜香', where: '珮姐老火锅、周师兄' },
        { name: '重庆小面', desc: '早餐首选，麻辣开胃', where: '街边小面馆' },
        { name: '酸辣粉', desc: '红薯粉+酸辣汤底', where: '好又来酸辣粉' },
        { name: '毛血旺', desc: '鸭血+毛肚+各种配菜', where: '川菜馆' }
      ],
      diningScene: '重庆是火锅之城，空气中都飘着牛油味。八一好吃街、磁器口是美食集中地。',
      budget: '早餐10-20元，正餐40-100元，火锅人均60-120元'
    },
    culture: {
      ethnicity: '汉族，巴渝文化',
      history: '重庆是巴国故地，抗战时期曾为陪都。独特的山地地形造就了独特的城市文化。',
      customs: '码头文化、袍哥文化、山城棒棒军',
      taboos: '不要说重庆火锅"不够辣"；不要小看重庆的坡度',
      festivals: '重庆火锅文化节'
    },
    practical: {
      transport: {
        arrival: '飞机：江北机场；高铁：重庆北站/西站',
        local: '轻轨是最佳出行方式（可看风景）；打车便宜但易堵车',
        gettingAround: '轻轨2号线是观光线路（穿楼、过江）'
      },
      accommodation: {
        budget: '青旅床位40-80元，快捷酒店150-250元',
        mid: '市区酒店250-500元',
        luxury: '江景酒店500-1200元'
      },
      safety: '治安良好。注意：地形复杂，注意脚下；夏天防暑。',
      health: '吃辣量力而行，备肠胃药。夏天注意防暑降温。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '洪崖洞', zone: '渝中', type: '街区', openHours: '全天', indoor: false, note: '夜景、吊脚楼', lat: 29.56, lng: 106.57 },
      { name: '解放碑', zone: '渝中', type: '街区', openHours: '全天', indoor: false, note: '商圈、美食街', lat: 29.56, lng: 106.57 },
      { name: '李子坝', zone: '渝中', type: '文化', openHours: '全天', indoor: false, note: '轻轨穿楼', lat: 29.55, lng: 106.53 },
      { name: '磁器口', zone: '沙坪坝', type: '街区', openHours: '全天', indoor: false, note: '古镇、陈麻花', lat: 29.58, lng: 106.45 },
      { name: '南山一棵树', zone: '南岸', type: '自然', openHours: '09:00-22:30', indoor: false, note: '夜景、火锅', lat: 29.55, lng: 106.60 }
    ]
  },
  {
    id: 'xian',
    name: '西安',
    images: {
      cover: 'https://picsum.photos/seed/xian_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/xian_g1/400/300',
        'https://picsum.photos/seed/xian_g2/400/300',
        'https://picsum.photos/seed/xian_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.50, social: 0.65, explore: 0.70, nature: 0.30, pace: 0.55, budget: 0.45 },
    emotionTags: ['历史', '面食', '烟火气', '厚重'],
    mapCenter: [108.93, 34.27],
    profile: {
      overview: '西安是中国历史的缩影，十三朝古都的厚重感扑面而来。兵马俑、大雁塔、古城墙，每一处都在诉说着千年的故事。而回民街的烟火气和面食文化，又让这座城市充满了生活气息。',
      bestSeasons: ['4-5月（气候宜人）', '9-10月（秋高气爽）'],
      avoidSeasons: ['7-8月（炎热）', '11-3月（寒冷干燥）'],
      suggestDays: '4-5天',
      idealFor: '历史爱好者、面食爱好者、想感受古都氛围的人',
      vibe: '厚重、烟火、古朴、热情'
    },
    climate: {
      type: '温带季风气候',
      features: '四季分明，夏季炎热，冬季寒冷干燥',
      avgTemp: { spring: '10-20°C', summer: '24-35°C', autumn: '10-20°C', winter: '-3-5°C' },
      rainfall: '夏季多雨',
      clothing: '春：外套；夏：短袖；秋：厚外套；冬：羽绒服',
      tips: '冬天有暖气，室内温暖。夏天炎热干燥。'
    },
    food: {
      signature: '陕西面食、肉夹馍、羊肉泡馍、凉皮、biangbiang面',
      mustTry: [
        { name: '肉夹馍', desc: '白吉馍+腊汁肉', where: '樊记腊汁肉、子午路张记' },
        { name: '羊肉泡馍', desc: '自己掰馍，汤浓肉烂', where: '老米家、老孙家' },
        { name: '凉皮', desc: '酸辣爽口，夏天必备', where: '魏家凉皮' },
        { name: 'biangbiang面', desc: '宽如腰带，油泼辣子', where: '面馆' }
      ],
      diningScene: '回民街是美食集中地，但游客区价格偏高。建议去洒金桥等本地人常去的地方。',
      budget: '早餐10-20元，正餐30-80元'
    },
    culture: {
      ethnicity: '汉族，关中文化',
      history: '西安是十三朝古都，丝绸之路起点。兵马俑被誉为世界第八大奇迹。',
      customs: '秦腔、皮影戏、剪纸、面食文化',
      taboos: '参观兵马俑不要开闪光灯；进清真寺注意着装',
      festivals: '西安城墙马拉松、丝绸之路国际电影节'
    },
    practical: {
      transport: {
        arrival: '飞机：咸阳机场（距市区40km）；高铁：西安北站',
        local: '地铁覆盖主要景点；城墙可骑行',
        gettingAround: '市区景点集中，步行+地铁即可'
      },
      accommodation: {
        budget: '青旅床位40-80元，快捷酒店150-250元',
        mid: '市区酒店250-500元',
        luxury: '五星级酒店500-1200元'
      },
      safety: '治安良好。注意：兵马俑景区有假导游，认准正规渠道。',
      health: '面食为主，注意营养均衡。夏天防暑。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '回民街', zone: '莲湖', type: '街区', openHours: '全天', indoor: false, note: '羊肉泡馍、肉夹馍', lat: 34.26, lng: 108.94 },
      { name: '兵马俑', zone: '临潼', type: '文化', openHours: '08:30-18:00', indoor: true, note: '世界第八大奇迹（门票120元）', lat: 34.38, lng: 109.28 },
      { name: '城墙', zone: '碑林', type: '文化', openHours: '08:00-22:00', indoor: false, note: '骑行、日落（门票54元）', lat: 34.26, lng: 108.95 },
      { name: '大唐不夜城', zone: '雁塔', type: '街区', openHours: '全天', indoor: false, note: '夜景、表演', lat: 34.21, lng: 108.96 },
      { name: '陕西历史博物馆', zone: '雁塔', type: '文化', openHours: '08:30-18:00', indoor: true, note: '免费、需预约', lat: 34.22, lng: 108.95 }
    ]
  },
  {
    id: 'guangzhou',
    name: '广州',
    images: {
      cover: 'https://picsum.photos/seed/guangzhou_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/guangzhou_g1/400/300',
        'https://picsum.photos/seed/guangzhou_g2/400/300',
        'https://picsum.photos/seed/guangzhou_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.55, social: 0.70, explore: 0.50, nature: 0.35, pace: 0.55, budget: 0.55 },
    emotionTags: ['早茶', '烟火气', '务实', '美食'],
    mapCenter: [113.26, 23.13],
    profile: {
      overview: '广州是中国最会吃的城市，"食在广州"绝非虚言。这里有最正宗的粤菜、最丰富的早茶、最热闹的夜市。同时，广州也是一座务实而包容的城市，千年商都的底蕴让它既有历史感又有现代活力。',
      bestSeasons: ['10-12月（秋高气爽，最舒适）', '3-4月（春暖花开）'],
      avoidSeasons: ['5-9月（湿热，台风季）', '春节（部分茶楼休息）'],
      suggestDays: '3-4天',
      idealFor: '吃货、喜欢早茶文化、想体验岭南风情的人',
      vibe: '务实、烟火、包容、美味'
    },
    climate: {
      type: '亚热带季风气候',
      features: '温暖湿润，夏季漫长，冬季短暂',
      avgTemp: { spring: '20-26°C', summer: '26-33°C', autumn: '22-28°C', winter: '12-20°C' },
      rainfall: '4-9月多雨，7-9月台风季',
      clothing: '春：薄长袖；夏：短袖；秋：长袖；冬：薄外套即可',
      tips: '夏天极其湿热，建议多补水。冬天温暖，是避寒好去处。'
    },
    food: {
      signature: '粤菜、早茶、烧腊、肠粉、煲仔饭',
      mustTry: [
        { name: '早茶', desc: '虾饺、烧卖、凤爪、肠粉...', where: '点都德、陶陶居、广州酒家' },
        { name: '烧腊', desc: '烧鹅、叉烧、烧肉', where: '炳胜、九爷鸡' },
        { name: '肠粉', desc: '米浆蒸制，配酱油', where: '银记肠粉' },
        { name: '煲仔饭', desc: '砂锅煮饭，锅巴香脆', where: '超记煲仔饭' }
      ],
      diningScene: '广州餐饮从早茶到夜宵全天候供应。上下九、北京路是美食集中地。',
      budget: '早茶人均50-100元，正餐60-150元'
    },
    culture: {
      ethnicity: '汉族，广府文化',
      history: '广州是千年商都，海上丝绸之路起点。岭南文化、粤剧、广绣在此传承。',
      customs: '早茶文化、粤剧、花市（春节）、赛龙舟',
      taboos: '不要插筷子在饭上；喝茶时别人倒茶要叩指致谢',
      festivals: '广府庙会（春节）、端午龙舟赛'
    },
    practical: {
      transport: {
        arrival: '飞机：白云机场；高铁：广州南站/东站',
        local: '地铁极其发达；公交辅助',
        gettingAround: '市区景点地铁可达；去顺德可城际地铁'
      },
      accommodation: {
        budget: '青旅床位60-100元，快捷酒店200-300元',
        mid: '市区酒店300-600元',
        luxury: '五星级酒店800-2000元'
      },
      safety: '治安良好。注意：早茶热门店需排队，建议早去或提前预订。',
      health: '湿热气候易上火，注意饮食清淡。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '上下九', zone: '荔湾', type: '街区', openHours: '全天', indoor: false, note: '老字号、骑楼', lat: 23.12, lng: 113.25 },
      { name: '沙面', zone: '荔湾', type: '街区', openHours: '全天', indoor: false, note: '欧式建筑、咖啡', lat: 23.11, lng: 113.24 },
      { name: '广州塔', zone: '海珠', type: '文化', openHours: '09:30-22:30', indoor: true, note: '小蛮腰、夜景（门票150元起）', lat: 23.11, lng: 113.32 },
      { name: '陈家祠', zone: '荔湾', type: '文化', openHours: '08:30-17:30', indoor: true, note: '岭南建筑、木雕（门票10元）', lat: 23.13, lng: 113.26 },
      { name: '北京路', zone: '越秀', type: '街区', openHours: '全天', indoor: false, note: '步行街、美食', lat: 23.13, lng: 113.27 }
    ]
  },
  {
    id: 'changsha',
    name: '长沙',
    images: {
      cover: 'https://picsum.photos/seed/changsha_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/changsha_g1/400/300',
        'https://picsum.photos/seed/changsha_g2/400/300',
        'https://picsum.photos/seed/changsha_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.60, social: 0.75, explore: 0.50, nature: 0.30, pace: 0.65, budget: 0.40 },
    emotionTags: ['烟火气', '美食', '夜生活', '活力'],
    mapCenter: [112.98, 28.11],
    profile: {
      overview: '长沙是中国最"好吃"的城市之一，也是夜生活最丰富的新一线城市。这里有臭豆腐、茶颜悦色、口味虾，也有橘子洲头的伟人雕像和岳麓书院的千年书香。长沙的活力在于它的年轻和无畏。',
      bestSeasons: ['4-5月（气候舒适）', '9-10月（秋高气爽）'],
      avoidSeasons: ['7-8月（炎热）', '12-2月（湿冷）'],
      suggestDays: '3-4天',
      idealFor: '吃货、喜欢夜生活、年轻人',
      vibe: '活力、热辣、年轻、烟火'
    },
    climate: {
      type: '亚热带季风气候',
      features: '夏季炎热，冬季湿冷',
      avgTemp: { spring: '15-22°C', summer: '26-35°C', autumn: '18-25°C', winter: '4-10°C' },
      rainfall: '春夏多雨',
      clothing: '春：薄外套；夏：短袖；秋：长袖；冬：羽绒服',
      tips: '夏天非常热，建议室内活动。冬天湿冷，注意保暖。'
    },
    food: {
      signature: '湘菜、臭豆腐、口味虾、茶颜悦色、糖油粑粑',
      mustTry: [
        { name: '臭豆腐', desc: '外酥里嫩，配辣椒酱', where: '黑色经典、文和友' },
        { name: '口味虾', desc: '麻辣鲜香，夜宵首选', where: '文和友、虾小龙' },
        { name: '茶颜悦色', desc: '长沙网红奶茶，幽兰拿铁必点', where: '遍地都是' },
        { name: '糖油粑粑', desc: '糯米粉炸制，甜糯可口', where: '街边小摊' }
      ],
      diningScene: '长沙餐饮极具特色，从文和友的复古市井到茶颜悦色的新中式。太平老街、坡子街是美食集中地。',
      budget: '早餐10-20元，正餐40-80元，夜宵30-60元'
    },
    culture: {
      ethnicity: '汉族，湖湘文化',
      history: '长沙是楚汉名城，岳麓书院是中国四大书院之一。近代史上，长沙是维新变法和辛亥革命的重要据点。',
      customs: '湘绣、花鼓戏、火宫殿庙会',
      taboos: '不要评论湖南人"吃得苦"；不要小看湖南的辣',
      festivals: '橘子洲烟花（节假日，现已减少）'
    },
    practical: {
      transport: {
        arrival: '飞机：黄花机场；高铁：长沙南站',
        local: '地铁覆盖主要景点；磁悬浮连接机场',
        gettingAround: '市区景点集中，地铁+步行即可'
      },
      accommodation: {
        budget: '青旅床位40-80元，快捷酒店150-250元',
        mid: '市区酒店250-500元',
        luxury: '五星级酒店500-1000元'
      },
      safety: '治安良好。注意：茶颜悦色排队人多，可提前小程序下单。',
      health: '吃辣量力而行。夏天防暑。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '太平老街', zone: '天心', type: '街区', openHours: '全天', indoor: false, note: '小吃、臭豆腐、茶颜悦色', lat: 28.19, lng: 112.97 },
      { name: '橘子洲', zone: '岳麓', type: '自然', openHours: '全天', indoor: false, note: '毛泽东像、烟花（节假日）', lat: 28.17, lng: 112.96 },
      { name: '文和友', zone: '天心', type: '街区', openHours: '11:00-03:00', indoor: true, note: '复古市井、小龙虾', lat: 28.19, lng: 112.98 },
      { name: '岳麓山', zone: '岳麓', type: '自然', openHours: '06:00-23:00', indoor: false, note: '爱晚亭、书院', lat: 28.18, lng: 112.93 }
    ]
  },

  // ========== 高效打卡型 ==========
  {
    id: 'shanghai',
    name: '上海',
    images: {
      cover: 'https://picsum.photos/seed/shanghai_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/shanghai_g1/400/300',
        'https://picsum.photos/seed/shanghai_g2/400/300',
        'https://picsum.photos/seed/shanghai_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.55, social: 0.75, explore: 0.65, nature: 0.30, pace: 0.80, budget: 0.80 },
    emotionTags: ['摩登', '多元', '高效', '精致'],
    mapCenter: [121.47, 31.23],
    profile: {
      overview: '上海是中国最国际化的城市，也是效率与精致的代名词。外滩的万国建筑、陆家嘴的摩天大楼、法租界的梧桐街道，构成了上海的多面性。这里有时速400公里的磁悬浮，也有藏在弄堂里的本帮菜馆。',
      bestSeasons: ['4-5月（气候宜人）', '10-11月（秋高气爽）'],
      avoidSeasons: ['7-8月（炎热）', '1-2月（湿冷）'],
      suggestDays: '4-6天',
      idealFor: '喜欢都市繁华、追求精致生活、第一次来中国的人',
      vibe: '摩登、精致、多元、高效'
    },
    climate: {
      type: '亚热带季风气候',
      features: '四季分明，夏季炎热，冬季湿冷',
      avgTemp: { spring: '12-20°C', summer: '25-33°C', autumn: '18-25°C', winter: '4-10°C' },
      rainfall: '6-7月梅雨',
      clothing: '春：薄外套；夏：短袖；秋：长袖；冬：羽绒服',
      tips: '冬天湿冷，体感温度低。夏天闷热。'
    },
    food: {
      signature: '本帮菜、生煎、小笼包、蟹壳黄、排骨年糕',
      mustTry: [
        { name: '生煎包', desc: '底部焦脆，汤汁丰富', where: '小杨生煎、大壶春' },
        { name: '小笼包', desc: '皮薄汁多，先开窗后喝汤', where: '南翔馒头店' },
        { name: '蟹壳黄', desc: '酥脆小烧饼，有甜咸两种', where: '老字号点心店' },
        { name: '排骨年糕', desc: '炸排骨配年糕，上海特色', where: '鲜得来' }
      ],
      diningScene: '上海餐饮极其多元，从米其林餐厅到弄堂小吃。城隍庙、云南南路是美食集中地。',
      budget: '早餐15-30元，正餐80-200元'
    },
    culture: {
      ethnicity: '汉族，海派文化',
      history: '上海1843年开埠，是中国近代化最早的城市。外滩建筑群见证了百年风云。',
      customs: '海派文化、石库门、沪剧、旗袍',
      taboos: '不要对上海人说"你们上海人排外"；排队是基本礼仪',
      festivals: '上海国际电影节、上海时装周'
    },
    practical: {
      transport: {
        arrival: '飞机：浦东机场/虹桥机场；高铁：虹桥站/上海站',
        local: '地铁极其发达，覆盖全城',
        gettingAround: '市区地铁即可；去迪士尼有专线'
      },
      accommodation: {
        budget: '青旅床位80-150元，快捷酒店250-400元',
        mid: '市区酒店400-800元',
        luxury: '五星级酒店1000-3000元'
      },
      safety: '治安良好。注意：热门景点需提前预订。',
      health: '冬天湿冷注意保暖。空气质量总体良好。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '外滩', zone: '黄浦', type: '街区', openHours: '全天', indoor: false, note: '万国建筑、夜景', lat: 31.24, lng: 121.49 },
      { name: '陆家嘴', zone: '浦东', type: '街区', openHours: '全天', indoor: false, note: '三件套、东方明珠', lat: 31.24, lng: 121.50 },
      { name: '武康路', zone: '徐汇', type: '街区', openHours: '全天', indoor: false, note: '老洋房、咖啡、梧桐', lat: 31.21, lng: 121.44 },
      { name: '迪士尼', zone: '浦东', type: '文化', openHours: '08:30-21:30', indoor: true, note: '主题乐园、烟花（门票399元起）', lat: 31.14, lng: 121.66 },
      { name: '田子坊', zone: '黄浦', type: '街区', openHours: '全天', indoor: false, note: '石库门、创意小店', lat: 31.21, lng: 121.47 }
    ]
  },
  {
    id: 'shenzhen',
    name: '深圳',
    images: {
      cover: 'https://picsum.photos/seed/shenzhen_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/shenzhen_g1/400/300',
        'https://picsum.photos/seed/shenzhen_g2/400/300',
        'https://picsum.photos/seed/shenzhen_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.60, social: 0.65, explore: 0.55, nature: 0.45, pace: 0.85, budget: 0.70 },
    emotionTags: ['现代', '高效', '年轻', '创新'],
    mapCenter: [114.05, 22.55],
    profile: {
      overview: '深圳是中国最年轻的一线城市，从一个小渔村发展成为国际化大都市只用了40年。这里没有历史包袱，只有创新和效率。公园密度全国最高，山海连城是深圳的独特标签。',
      bestSeasons: ['10-12月（最舒适）', '3-4月（春暖花开）'],
      avoidSeasons: ['5-9月（湿热，台风季）'],
      suggestDays: '3-4天',
      idealFor: '科技爱好者、喜欢现代都市、年轻人',
      vibe: '现代、高效、年轻、绿色'
    },
    climate: {
      type: '亚热带海洋性气候',
      features: '温暖湿润，夏季漫长',
      avgTemp: { spring: '20-26°C', summer: '26-33°C', autumn: '22-28°C', winter: '15-22°C' },
      rainfall: '5-9月多雨，台风季',
      clothing: '全年短袖为主，冬天备薄外套',
      tips: '夏天极其湿热，建议多补水。'
    },
    food: {
      signature: '粤菜、海鲜、椰子鸡、潮汕牛肉火锅',
      mustTry: [
        { name: '椰子鸡', desc: '椰子水锅底+文昌鸡，清甜', where: '润园四季' },
        { name: '潮汕牛肉火锅', desc: '鲜切牛肉，涮几秒即食', where: '八合里海记' }
      ],
      diningScene: '深圳餐饮多元，粤菜为主，也有各国料理。',
      budget: '早餐15-30元，正餐60-150元'
    },
    culture: {
      ethnicity: '汉族，移民城市',
      history: '深圳1980年设经济特区，是中国改革开放的窗口。',
      customs: '创新文化、公园文化、阅读文化（深圳图书馆）',
      taboos: '不要对深圳人说"你们没有文化"',
      festivals: '深圳读书月（每年11月）'
    },
    practical: {
      transport: {
        arrival: '飞机：宝安机场；高铁：深圳北站/福田站',
        local: '地铁覆盖主要区域',
        gettingAround: '去香港可福田/罗湖口岸过关'
      },
      accommodation: {
        budget: '青旅床位60-100元，快捷酒店200-300元',
        mid: '市区酒店300-600元',
        luxury: '五星级酒店800-2000元'
      },
      safety: '治安良好。',
      health: '湿热气候注意防暑。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '深圳湾', zone: '南山', type: '自然', openHours: '全天', indoor: false, note: '海景、日落、候鸟', lat: 22.52, lng: 113.94 },
      { name: '华侨城创意园', zone: '南山', type: '街区', openHours: '全天', indoor: false, note: '艺术、咖啡、展览', lat: 22.54, lng: 113.97 },
      { name: '大梅沙', zone: '盐田', type: '自然', openHours: '07:00-24:00', indoor: false, note: '海滩、游泳', lat: 22.59, lng: 114.30 },
      { name: '平安金融中心', zone: '福田', type: '文化', openHours: '09:00-22:00', indoor: true, note: '俯瞰深圳、观光层（门票180元）', lat: 22.54, lng: 114.05 }
    ]
  },
  {
    id: 'nanjing',
    name: '南京',
    images: {
      cover: 'https://picsum.photos/seed/nanjing_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/nanjing_g1/400/300',
        'https://picsum.photos/seed/nanjing_g2/400/300',
        'https://picsum.photos/seed/nanjing_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.50, social: 0.55, explore: 0.65, nature: 0.45, pace: 0.50, budget: 0.50 },
    emotionTags: ['历史', '厚重', '梧桐', '雅致'],
    mapCenter: [118.78, 32.06],
    profile: {
      overview: '南京是六朝古都，也是近代中国历史的见证者。这里有中山陵的庄严、夫子庙的繁华、颐和路的静谧。南京的厚重感来自于它的历史，而它的美食（鸭血粉丝、盐水鸭）则让人感受到生活的温度。',
      bestSeasons: ['4-5月（春暖花开）', '10-11月（秋高气爽，梧桐金黄）'],
      avoidSeasons: ['7-8月（炎热）', '12-2月（湿冷）'],
      suggestDays: '3-4天',
      idealFor: '历史爱好者、喜欢江南文化、吃货',
      vibe: '厚重、雅致、烟火、诗意'
    },
    climate: {
      type: '亚热带季风气候',
      features: '四季分明，夏季炎热，冬季湿冷',
      avgTemp: { spring: '12-20°C', summer: '25-33°C', autumn: '15-23°C', winter: '2-8°C' },
      rainfall: '6-7月梅雨',
      clothing: '春：薄外套；夏：短袖；秋：长袖；冬：羽绒服',
      tips: '冬天湿冷，注意保暖。'
    },
    food: {
      signature: '金陵菜、盐水鸭、鸭血粉丝汤、小笼包、锅贴',
      mustTry: [
        { name: '盐水鸭', desc: '皮白肉嫩，咸香适口', where: '桂花鸭、韩复兴' },
        { name: '鸭血粉丝汤', desc: '鸭血+鸭肠+粉丝，南京代表', where: '回味鸭血粉丝' },
        { name: '牛肉锅贴', desc: '底部焦脆，肉馅多汁', where: '李记清真馆' }
      ],
      diningScene: '南京餐饮以鸭为特色。夫子庙、老门东是美食集中地。',
      budget: '早餐10-20元，正餐40-80元'
    },
    culture: {
      ethnicity: '汉族，金陵文化',
      history: '南京是六朝古都（东吴、东晋、宋、齐、梁、陈），也是明朝首都和民国政府所在地。',
      customs: '秦淮文化、云锦、金箔、雨花石',
      taboos: '参观侵华日军南京大屠杀遇难同胞纪念馆保持肃穆',
      festivals: '秦淮灯会（春节）'
    },
    practical: {
      transport: {
        arrival: '飞机：禄口机场；高铁：南京南站/南京站',
        local: '地铁覆盖主要景点',
        gettingAround: '市区景点地铁可达'
      },
      accommodation: {
        budget: '青旅床位50-80元，快捷酒店150-250元',
        mid: '市区酒店250-500元',
        luxury: '五星级酒店500-1200元'
      },
      safety: '治安良好。',
      health: '冬天湿冷注意保暖。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '中山陵', zone: '玄武', type: '文化', openHours: '08:30-17:00', indoor: false, note: '梧桐大道、民国风（免费）', lat: 32.05, lng: 118.85 },
      { name: '夫子庙', zone: '秦淮', type: '街区', openHours: '全天', indoor: false, note: '秦淮河、小吃', lat: 32.02, lng: 118.79 },
      { name: '总统府', zone: '玄武', type: '文化', openHours: '08:30-17:00', indoor: true, note: '民国历史（门票40元）', lat: 32.04, lng: 118.80 },
      { name: '鸡鸣寺', zone: '玄武', type: '文化', openHours: '07:00-17:30', indoor: false, note: '樱花、古刹（门票10元）', lat: 32.06, lng: 118.74 },
      { name: '老门东', zone: '秦淮', type: '街区', openHours: '全天', indoor: false, note: '老城南、小吃、德云社', lat: 32.01, lng: 118.79 }
    ]
  },

  // ========== 灵感采集型 ==========
  {
    id: 'qingdao',
    name: '青岛',
    images: {
      cover: 'https://picsum.photos/seed/qingdao_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/qingdao_g1/400/300',
        'https://picsum.photos/seed/qingdao_g2/400/300',
        'https://picsum.photos/seed/qingdao_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.65, social: 0.50, explore: 0.55, nature: 0.60, pace: 0.40, budget: 0.55 },
    emotionTags: ['海滨', '文艺', '啤酒', '清新'],
    mapCenter: [120.38, 36.07],
    profile: {
      overview: '青岛是中国最具欧洲风情的海滨城市，红瓦绿树、碧海蓝天是它的名片。这里曾是德国租界，留下了大量德式建筑。青岛啤酒更是享誉世界，每年夏天的啤酒节吸引着全球游客。',
      bestSeasons: ['6-8月（啤酒节，海滨最舒服）', '9-10月（秋高气爽，海鲜肥美）'],
      avoidSeasons: ['7月中下旬（浒苔季）', '11-3月（寒冷）'],
      suggestDays: '3-4天',
      idealFor: '喜欢海滨城市、啤酒爱好者、想体验欧式风情的人',
      vibe: '清新、浪漫、欧式、豪爽'
    },
    climate: {
      type: '温带季风气候',
      features: '海洋性明显，夏季凉爽，冬季寒冷',
      avgTemp: { spring: '10-18°C', summer: '20-28°C', autumn: '15-22°C', winter: '0-5°C' },
      rainfall: '7-8月多雨',
      clothing: '春：外套；夏：短袖+薄外套；秋：长袖；冬：羽绒服',
      tips: '夏天比内陆凉爽，是避暑好去处。'
    },
    food: {
      signature: '海鲜、青岛啤酒、锅贴、辣炒蛤蜊',
      mustTry: [
        { name: '辣炒蛤蜊', desc: '青岛人最爱，配啤酒绝配', where: '大排档、餐馆' },
        { name: '原浆啤酒', desc: '新鲜酿造，口感醇厚', where: '青岛啤酒博物馆、啤酒街' },
        { name: '海鲜水饺', desc: '鲅鱼、墨鱼、虾仁馅', where: '船歌鱼水饺' }
      ],
      diningScene: '青岛海鲜丰富，啤酒文化浓厚。台东夜市、啤酒街是美食集中地。',
      budget: '早餐10-20元，正餐50-100元，啤酒10-30元/杯'
    },
    culture: {
      ethnicity: '汉族，齐鲁文化',
      history: '青岛1897年被德国租借，留下了大量德式建筑。青岛啤酒厂建于1903年，是中国历史最悠久的啤酒厂。',
      customs: '啤酒文化、海洋文化',
      taboos: '不要对青岛人说"你们山东人都很能喝"',
      festivals: '青岛国际啤酒节（每年8月）'
    },
    practical: {
      transport: {
        arrival: '飞机：胶东机场；高铁：青岛站/青岛北站',
        local: '地铁+公交；老城区步行',
        gettingAround: '市区景点地铁可达'
      },
      accommodation: {
        budget: '青旅床位50-80元，快捷酒店150-250元',
        mid: '市区酒店250-500元',
        luxury: '海景酒店500-1200元'
      },
      safety: '治安良好。夏天海边游泳注意安全。',
      health: '夏天凉爽，但海边紫外线强。吃海鲜注意新鲜度。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '栈桥', zone: '市南', type: '自然', openHours: '全天', indoor: false, note: '海鸥、回澜阁', lat: 36.06, lng: 120.32 },
      { name: '八大关', zone: '市南', type: '街区', openHours: '全天', indoor: false, note: '万国建筑、梧桐', lat: 36.05, lng: 120.35 },
      { name: '小鱼山', zone: '市南', type: '自然', openHours: '06:00-20:00', indoor: false, note: '俯瞰老城、红瓦绿树', lat: 36.06, lng: 120.33 },
      { name: '啤酒博物馆', zone: '市北', type: '文化', openHours: '08:30-16:30', indoor: true, note: '青岛啤酒历史（门票60元）', lat: 36.09, lng: 120.38 },
      { name: '信号山', zone: '市南', type: '自然', openHours: '06:00-20:30', indoor: false, note: '旋转观景台', lat: 36.07, lng: 120.34 }
    ]
  },
  {
    id: 'dalian',
    name: '大连',
    images: {
      cover: 'https://picsum.photos/seed/dalian_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/dalian_g1/400/300',
        'https://picsum.photos/seed/dalian_g2/400/300',
        'https://picsum.photos/seed/dalian_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.60, social: 0.45, explore: 0.50, nature: 0.55, pace: 0.40, budget: 0.50 },
    emotionTags: ['海滨', '浪漫', '清新', '欧式'],
    mapCenter: [121.61, 38.91],
    profile: {
      overview: '大连是中国最北的海滨城市，有"北方明珠"之称。这里有漫长的海岸线、众多的广场和公园，还有俄罗斯风情街和日本风情街。大连的夏天凉爽宜人，是避暑的好去处。',
      bestSeasons: ['7-8月（避暑，海滨最舒服）', '9-10月（秋高气爽）'],
      avoidSeasons: ['11-3月（寒冷，海风刺骨）'],
      suggestDays: '3-4天',
      idealFor: '喜欢海滨城市、想避暑、喜欢欧式建筑的人',
      vibe: '清新、浪漫、开阔、整洁'
    },
    climate: {
      type: '温带季风气候',
      features: '海洋性明显，夏季凉爽，冬季寒冷多风',
      avgTemp: { spring: '8-15°C', summer: '20-26°C', autumn: '12-20°C', winter: '-5-2°C' },
      rainfall: '7-8月多雨',
      clothing: '春：厚外套；夏：短袖+薄外套；秋：厚外套；冬：羽绒服+保暖',
      tips: '夏天凉爽，是避暑好去处。冬天海风刺骨。'
    },
    food: {
      signature: '海鲜、烧烤、焖子、海菜包子',
      mustTry: [
        { name: '海鲜烧烤', desc: '新鲜海产炭火烤制', where: '夜市、大排档' },
        { name: '焖子', desc: '地瓜粉制品，煎制配麻酱', where: '街边小摊' },
        { name: '海菜包子', desc: '海菜+猪肉馅，鲜美', where: '老字号包子铺' }
      ],
      diningScene: '大连海鲜丰富，烧烤文化浓厚。天津街是美食集中地。',
      budget: '早餐10-20元，正餐50-100元'
    },
    culture: {
      ethnicity: '汉族，东北文化',
      history: '大连曾是俄国和日本的租借地，留下了大量异国建筑。',
      customs: '海洋文化、广场文化',
      taboos: '不要对大连人说"你们东北人都很粗犷"',
      festivals: '大连国际服装节'
    },
    practical: {
      transport: {
        arrival: '飞机：周水子机场；高铁：大连站/大连北站',
        local: '地铁+公交；老城区步行',
        gettingAround: '市区景点地铁可达'
      },
      accommodation: {
        budget: '青旅床位50-80元，快捷酒店150-250元',
        mid: '市区酒店250-500元',
        luxury: '海景酒店500-1000元'
      },
      safety: '治安良好。夏天海边游泳注意安全。',
      health: '夏天凉爽。冬天注意防风保暖。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '星海广场', zone: '沙河口', type: '自然', openHours: '全天', indoor: false, note: '亚洲最大广场、海景', lat: 38.86, lng: 121.68 },
      { name: '老虎滩', zone: '中山', type: '自然', openHours: '08:00-17:00', indoor: false, note: '海洋公园、渔人码头', lat: 38.87, lng: 121.68 },
      { name: '滨海路', zone: '中山', type: '自然', openHours: '全天', indoor: false, note: '最美公路、徒步', lat: 38.90, lng: 121.68 },
      { name: '俄罗斯风情街', zone: '西岗', type: '街区', openHours: '全天', indoor: false, note: '俄式建筑、套娃', lat: 38.92, lng: 121.63 }
    ]
  },

  // ========== 数字游民试居型 ==========
  {
    id: 'dali_digital',
    name: '大理（数字游民版）',
    images: {
      cover: 'https://picsum.photos/seed/dali_digital_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/dali_digital_g1/400/300',
        'https://picsum.photos/seed/dali_digital_g2/400/300',
        'https://picsum.photos/seed/dali_digital_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.90, social: 0.40, explore: 0.55, nature: 0.80, pace: 0.20, budget: 0.40 },
    emotionTags: ['数字游民', '慢生活', '逃离', '自由'],
    mapCenter: [100.165, 25.679],
    profile: {
      overview: '大理是中国数字游民最集中的地方之一。这里有低廉的生活成本、宜人的气候、完善的共享办公设施，以及一个庞大的远程工作者社区。对数字游民而言，大理不仅是一个工作地点，更是一种生活方式的选择。',
      bestSeasons: ['3-5月', '9-11月'],
      avoidSeasons: ['7-8月（雨季）'],
      suggestDays: '1个月以上（试居）',
      idealFor: '远程工作者、自由职业者、想尝试数字游民生活的人',
      vibe: '自由、慵懒、创作、社区'
    },
    climate: {
      type: '高原季风气候',
      features: '四季如春，昼夜温差大',
      avgTemp: { spring: '15-22°C', summer: '18-25°C', autumn: '15-22°C', winter: '8-18°C' },
      rainfall: '6-9月雨季',
      clothing: '春秋：薄外套；夏：短袖；冬：羽绒服',
      tips: '防晒！高原紫外线强。'
    },
    food: {
      signature: '白族菜、素食、咖啡馆文化',
      mustTry: [
        { name: '素斋', desc: '寂照庵等寺庙提供', where: '寂照庵' }
      ],
      diningScene: '古城内咖啡馆密度极高，是数字游民的主要工作场所。',
      budget: '早餐10-20元，正餐30-60元，咖啡20-40元'
    },
    culture: {
      ethnicity: '白族',
      history: '见大理',
      customs: '数字游民社区文化、共创空间',
      taboos: '见大理',
      festivals: '见大理'
    },
    practical: {
      transport: {
        arrival: '见大理',
        local: '电动车是主要交通工具',
        gettingAround: '见大理'
      },
      accommodation: {
        budget: '青旅长住1000-2000元/月',
        mid: '民宿长住2000-4000元/月',
        luxury: '别墅长住5000元+/月'
      },
      safety: '治安良好。',
      health: '海拔2000米，一般无高反。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '大理古城共享办公', zone: '古城', type: '室内', openHours: '09:00-21:00', indoor: true, note: 'NCC 社区、数字游民聚集', lat: 25.69, lng: 100.165 },
      { name: '洱海生态廊道', zone: '洱海西岸', type: '自然', openHours: '全天', indoor: false, note: '骑行、发呆', lat: 25.7, lng: 100.15 },
      { name: '三月街', zone: '古城', type: '街区', openHours: '全天', indoor: false, note: '集市、租房信息', lat: 25.70, lng: 100.16 },
      { name: '才村码头', zone: '洱海西岸', type: '自然', openHours: '全天', indoor: false, note: '短租民宿、安静', lat: 25.71, lng: 100.15 }
    ]
  },
  {
    id: 'lijiang_digital',
    name: '丽江（数字游民版）',
    images: {
      cover: 'https://picsum.photos/seed/lijiang_digital_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/lijiang_digital_g1/400/300',
        'https://picsum.photos/seed/lijiang_digital_g2/400/300',
        'https://picsum.photos/seed/lijiang_digital_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.85, social: 0.45, explore: 0.50, nature: 0.75, pace: 0.25, budget: 0.45 },
    emotionTags: ['数字游民', '慢生活', '自由', '逃离'],
    mapCenter: [100.23, 26.87],
    profile: {
      overview: '丽江是另一个数字游民聚集地，相比大理更安静、更纳西。束河古镇和白沙古镇是远程工作者的首选，这里WiFi稳定、租金低廉、社区氛围好。',
      bestSeasons: ['4-5月', '9-10月'],
      avoidSeasons: ['7-8月（雨季）'],
      suggestDays: '1个月以上（试居）',
      idealFor: '喜欢更安静环境的远程工作者',
      vibe: '安静、纳西、创作、自然'
    },
    climate: {
      type: '高原山地气候',
      features: '昼夜温差大',
      avgTemp: { spring: '12-20°C', summer: '16-24°C', autumn: '12-20°C', winter: '5-15°C' },
      rainfall: '6-9月雨季',
      clothing: '春秋：外套；夏：短袖+薄外套；冬：羽绒服',
      tips: '海拔2400米，部分人可能有轻微高反。'
    },
    food: {
      signature: '纳西菜、咖啡馆',
      mustTry: [],
      diningScene: '束河古镇有很多安静的咖啡馆适合工作。',
      budget: '早餐15-25元，正餐40-80元'
    },
    culture: {
      ethnicity: '纳西族',
      history: '见丽江',
      customs: '纳西文化、数字游民社区',
      taboos: '见丽江',
      festivals: '见丽江'
    },
    practical: {
      transport: {
        arrival: '见丽江',
        local: '步行或电动车',
        gettingAround: '见丽江'
      },
      accommodation: {
        budget: '青旅长住1200-2000元/月',
        mid: '民宿长住2000-4000元/月',
        luxury: '别墅长住4000元+/月'
      },
      safety: '治安良好。',
      health: '海拔2400米，注意高反。',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '束河古镇咖啡馆', zone: '束河', type: '室内', openHours: '09:00-22:00', indoor: true, note: 'WiFi、安静、长住客多', lat: 26.90, lng: 100.20 },
      { name: '白沙古镇', zone: '白沙', type: '街区', openHours: '全天', indoor: false, note: '纳西文化、低消费', lat: 26.95, lng: 100.22 },
      { name: '玉龙雪山脚下', zone: '雪山', type: '自然', openHours: '全天', indoor: false, note: '短租、田园', lat: 26.90, lng: 100.18 }
    ]
  },
  {
    id: 'chengdu_digital',
    name: '成都（数字游民版）',
    images: {
      cover: 'https://picsum.photos/seed/chengdu_digital_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/chengdu_digital_g1/400/300',
        'https://picsum.photos/seed/chengdu_digital_g2/400/300',
        'https://picsum.photos/seed/chengdu_digital_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.70, social: 0.55, explore: 0.45, nature: 0.35, pace: 0.35, budget: 0.50 },
    emotionTags: ['数字游民', '烟火气', '美食', '巴适'],
    mapCenter: [104.06, 30.67],
    profile: {
      overview: '成都是新一线城市中数字游民最友好的城市之一。这里有完善的共享办公生态、丰富的美食、低廉的生活成本，以及一个庞大的创意人群体。对数字游民而言，成都提供了工作与生活的完美平衡。',
      bestSeasons: ['3-5月', '9-11月'],
      avoidSeasons: ['7-8月（闷热）'],
      suggestDays: '1个月以上（试居）',
      idealFor: '喜欢城市便利+慢生活的远程工作者',
      vibe: '巴适、烟火、创意、包容'
    },
    climate: {
      type: '亚热带季风气候',
      features: '湿润多雨',
      avgTemp: { spring: '15-22°C', summer: '24-32°C', autumn: '16-23°C', winter: '6-12°C' },
      rainfall: '夏季多雨',
      clothing: '春秋：薄外套；夏：短袖；冬：羽绒服',
      tips: '见成都'
    },
    food: {
      signature: '川菜、火锅',
      mustTry: [],
      diningScene: '见成都',
      budget: '见成都'
    },
    culture: {
      ethnicity: '汉族',
      history: '见成都',
      customs: '创意社区文化、茶馆办公',
      taboos: '见成都',
      festivals: '见成都'
    },
    practical: {
      transport: {
        arrival: '见成都',
        local: '地铁+共享单车',
        gettingAround: '见成都'
      },
      accommodation: {
        budget: '合租1500-2500元/月',
        mid: '整租3000-5000元/月',
        luxury: '高端公寓6000元+/月'
      },
      safety: '治安良好。',
      health: '见成都',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '玉林路咖啡馆', zone: '武侯', type: '室内', openHours: '09:00-23:00', indoor: true, note: '共享办公、社区氛围', lat: 30.63, lng: 104.05 },
      { name: '东郊记忆', zone: '成华', type: '街区', openHours: '全天', indoor: false, note: '文创园、展览、咖啡', lat: 30.67, lng: 104.11 },
      { name: '人民公园', zone: '青羊', type: '文化', openHours: '06:00-22:00', indoor: false, note: '茶社、慢生活', lat: 30.66, lng: 104.05 }
    ]
  },
  {
    id: 'hangzhou_digital',
    name: '杭州（数字游民版）',
    images: {
      cover: 'https://picsum.photos/seed/hangzhou_digital_cover/800/500',
      gallery: [
        'https://picsum.photos/seed/hangzhou_digital_g1/400/300',
        'https://picsum.photos/seed/hangzhou_digital_g2/400/300',
        'https://picsum.photos/seed/hangzhou_digital_g3/400/300'
      ]
    },
    dimensions: { freedom: 0.65, social: 0.50, explore: 0.50, nature: 0.55, pace: 0.40, budget: 0.60 },
    emotionTags: ['数字游民', '西湖', '互联网', '清新'],
    mapCenter: [120.15, 30.25],
    profile: {
      overview: '杭州是中国互联网之都，也是数字游民的理想基地。这里有阿里巴巴、网易等巨头，也有大量的创业公司和共享办公空间。西湖边的咖啡馆、梦想小镇的创客空间，都是远程工作者的好去处。',
      bestSeasons: ['3-5月', '9-11月'],
      avoidSeasons: ['6-7月（梅雨）'],
      suggestDays: '1个月以上（试居）',
      idealFor: '互联网从业者、创业者、喜欢自然+科技氛围的人',
      vibe: '创新、清新、活力、自然'
    },
    climate: {
      type: '亚热带季风气候',
      features: '四季分明',
      avgTemp: { spring: '12-20°C', summer: '25-35°C', autumn: '18-28°C', winter: '3-10°C' },
      rainfall: '6-7月梅雨',
      clothing: '春秋：薄外套；夏：短袖；冬：羽绒服',
      tips: '见杭州'
    },
    food: {
      signature: '杭帮菜',
      mustTry: [],
      diningScene: '见杭州',
      budget: '见杭州'
    },
    culture: {
      ethnicity: '汉族',
      history: '见杭州',
      customs: '互联网文化、创业文化',
      taboos: '见杭州',
      festivals: '见杭州'
    },
    practical: {
      transport: {
        arrival: '见杭州',
        local: '地铁+共享单车',
        gettingAround: '见杭州'
      },
      accommodation: {
        budget: '合租2000-3500元/月',
        mid: '整租4000-7000元/月',
        luxury: '高端公寓8000元+/月'
      },
      safety: '治安良好。',
      health: '见杭州',
      money: '支付宝/微信普及。'
    },
    pois: [
      { name: '梦想小镇', zone: '余杭', type: '街区', openHours: '全天', indoor: false, note: '创业氛围、共享办公', lat: 30.28, lng: 119.99 },
      { name: '西溪湿地', zone: '余杭', type: '自然', openHours: '08:00-17:30', indoor: false, note: '安静、自然', lat: 30.27, lng: 120.06 },
      { name: '龙井村', zone: '西湖', type: '自然', openHours: '全天', indoor: false, note: '茶园、农家、短租', lat: 30.22, lng: 120.10 }
    ]
  }
];

// 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CITIES };
}