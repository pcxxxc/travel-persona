'use strict';

/**
 * Static intercity corridor baseline used before live map/ticket enrichment.
 * Ranges are deliberately conservative. Every leg remains marked for live
 * verification because schedules and fares can change.
 */

const VERIFIED_AT = '2026-07-13';

function connection(from, to, durationMin, durationMax, fareMin, fareMax, options = {}) {
  return {
    from,
    to,
    mode: options.mode || 'rail',
    durationHours: { min: durationMin, max: durationMax },
    fareCny: { min: fareMin, max: fareMax },
    transfers: options.transfers || 0,
    frequency: options.frequency || 'high',
    confidence: options.confidence || 0.72,
    verifiedAt: VERIFIED_AT,
    requiresLiveCheck: true,
    note: options.note || '出发前按实际日期核验班次、票价和到发车站。',
    sourceRefs: [{ type: 'routeBaseline', source: '旅格路线实验室', date: VERIFIED_AT }]
  };
}

const INTERCITY_CONNECTIONS = [
  connection('茂名', '广州', 2.5, 4, 120, 230),
  connection('茂名', '长沙', 5.5, 7.5, 300, 480, { transfers: 1, confidence: 0.62, note: '通常需经广州衔接，优先购买同站联程并预留换乘时间。' }),
  connection('广州', '长沙', 2.3, 3, 300, 380),
  connection('长沙', '武汉', 1.3, 2, 160, 220),
  connection('武汉', '北京', 4, 5.5, 520, 700),
  connection('武汉', '洛阳', 3.5, 5, 280, 430, { transfers: 1, frequency: 'medium', confidence: 0.62, note: '直达与郑州换乘并存，按当天车次选择总耗时更短的方案。' }),
  connection('洛阳', '北京', 3.5, 4.5, 320, 460),
  connection('北京', '天津', 0.5, 1.2, 55, 130),
  connection('北京', '太原', 2.2, 3.5, 180, 300),
  connection('太原', '西安', 3, 4.5, 200, 350),
  connection('北京', '哈尔滨', 4.5, 6.5, 500, 800, { confidence: 0.68 }),
  connection('北京', '沈阳', 2.5, 4, 250, 450),
  connection('大连', '沈阳', 1.7, 2.6, 120, 230),
  connection('沈阳', '长春', 1.5, 2.5, 100, 220),
  connection('长春', '哈尔滨', 1, 1.8, 90, 190),
  connection('北京', '济南', 1.3, 2.2, 180, 260),
  connection('北京', '南京', 3.3, 4.5, 440, 620),
  connection('济南', '南京', 2.5, 3.5, 270, 420),
  connection('南京', '南昌', 3, 4.2, 230, 380),
  connection('武汉', '南昌', 2, 3, 120, 230),
  connection('南昌', '长沙', 1.8, 2.8, 130, 240),
  connection('南昌', '桂林', 4, 6, 280, 460, { frequency: 'medium', confidence: 0.66 }),
  connection('南京', '扬州', 1, 1.6, 40, 90),
  connection('扬州', '苏州', 1.5, 2.6, 80, 170, { frequency: 'medium', confidence: 0.66 }),
  connection('南京', '杭州', 1, 1.5, 90, 160),
  connection('南京', '泉州', 6, 8, 400, 560, { frequency: 'medium', confidence: 0.66 }),
  connection('杭州', '泉州', 5, 6.5, 330, 480, { frequency: 'medium', confidence: 0.66 }),
  connection('福州', '泉州', 1, 1.6, 60, 120),
  connection('福州', '厦门', 1.3, 2, 80, 150),
  connection('广州', '桂林', 2.5, 3.5, 180, 280),
  connection('西宁', '青海湖', 2.5, 4, 80, 190, { mode: 'road', frequency: 'medium', confidence: 0.60, note: '公路接驳受季节、天气和停靠点影响，必须按当天运营与路况核验。' }),
  connection('西宁', '乌鲁木齐', 10, 13.5, 550, 900, { frequency: 'medium', confidence: 0.60, note: '长距离车次与席别差异大，优先按真实日期比较夜车和航空替代。' }),
  connection('泉州', '茂名', 6.5, 9, 330, 560, { transfers: 1, confidence: 0.58, note: '通常经深圳或广州衔接，实时比较同站换乘和分段购票。' }),

  // === 华东走廊（12条） ===
  connection('上海', '苏州', 0.5, 1, 40, 80),
  connection('上海', '杭州', 1, 1.5, 70, 120),
  connection('上海', '南京', 1.3, 2, 140, 220),
  connection('苏州', '杭州', 1.3, 2, 90, 160),
  connection('南京', '苏州', 0.8, 1.3, 60, 120),
  connection('扬州', '杭州', 2.5, 3.5, 150, 280, { frequency: 'medium', confidence: 0.66 }),
  connection('福州', '杭州', 3, 4.5, 220, 380, { frequency: 'medium', confidence: 0.66 }),
  connection('上海', '厦门', 5.5, 7, 380, 600, { frequency: 'medium', confidence: 0.66 }),
  connection('杭州', '厦门', 4.5, 6, 300, 480, { frequency: 'medium', confidence: 0.66 }),
  connection('上海', '青岛', 4.5, 6, 380, 580, { frequency: 'medium', confidence: 0.66 }),
  connection('青岛', '济南', 2.5, 3.5, 120, 220),
  connection('青岛', '北京', 4, 5.5, 320, 500),

  // === 华南走廊（9条） ===
  connection('广州', '深圳', 0.5, 1, 80, 180),
  connection('深圳', '厦门', 3, 4, 180, 320, { frequency: 'medium', confidence: 0.66 }),
  connection('深圳', '桂林', 3, 4, 220, 380, { frequency: 'medium', confidence: 0.66 }),
  connection('桂林', '长沙', 3, 4, 180, 300, { frequency: 'medium', confidence: 0.66 }),
  connection('广州', '武汉', 3.5, 4.5, 460, 700),
  connection('深圳', '长沙', 3, 4, 380, 600, { frequency: 'medium', confidence: 0.66 }),
  connection('广州', '南昌', 4.5, 6, 380, 580, { frequency: 'medium', confidence: 0.66 }),
  connection('深圳', '茂名', 2.5, 4, 130, 260),
  connection('茂名', '厦门', 5.5, 8, 280, 480, { transfers: 1, confidence: 0.60, note: '通常经深圳或广州衔接，建议分段购票并预留换乘时间。' }),

  // === 华北·华中·东北走廊（11条） ===
  connection('天津', '济南', 2, 3, 160, 280),
  connection('北京', '西安', 4.5, 6, 520, 800),
  connection('洛阳', '西安', 1.5, 2.5, 170, 280),
  connection('武汉', '南京', 2.5, 3.5, 200, 340),
  connection('武汉', '西安', 4, 5.5, 450, 650),
  connection('北京', '上海', 4.5, 5.5, 550, 900),
  connection('南京', '武汉', 2.5, 3.5, 200, 340),
  connection('大连', '北京', 4, 6, 260, 450),
  connection('哈尔滨', '沈阳', 2.5, 3.5, 170, 300),
  connection('大连', '长春', 3.5, 5, 200, 380, { frequency: 'medium', confidence: 0.66 }),
  connection('济南', '天津', 2, 3, 160, 280),

  // === 西南·西北走廊（13条） ===
  connection('成都', '重庆', 1.5, 2.5, 150, 280),
  connection('成都', '大理', 5.5, 8, 350, 600, { frequency: 'medium', confidence: 0.64, note: '高铁+动车组合，部分时段需在昆明或贵阳换乘，按实际日期比较总耗时。' }),
  connection('成都', '丽江', 6, 9, 400, 700, { frequency: 'medium', confidence: 0.60, note: '无直达高铁，通常经昆明或大理换乘，建议对比航空替代方案。' }),
  connection('大理', '丽江', 2, 3, 80, 180, { mode: 'road', frequency: 'medium', confidence: 0.60, note: '公路/铁路混合接驳，受天气和路况影响较大。' }),
  connection('成都', '西安', 3, 4.5, 260, 450),
  connection('重庆', '西安', 4.5, 6, 280, 480, { frequency: 'medium', confidence: 0.66 }),
  connection('重庆', '大理', 5.5, 8, 380, 650, { frequency: 'medium', confidence: 0.60, note: '高铁+动车组合，部分时段需换乘，按实际日期比较总耗时。' }),
  connection('重庆', '武汉', 4.5, 6, 350, 550),
  connection('重庆', '广州', 7, 9, 450, 720, { frequency: 'medium', confidence: 0.64 }),
  connection('西安', '西宁', 4.5, 6, 260, 420, { frequency: 'medium', confidence: 0.66 }),
  connection('西安', '乌鲁木齐', 15, 20, 550, 950, { frequency: 'low', confidence: 0.58, note: '超长距离，强烈建议对比航空替代方案。' }),
  connection('成都', '武汉', 7, 9, 450, 720, { frequency: 'medium', confidence: 0.64 }),
  connection('成都', '广州', 7.5, 10, 580, 950, { frequency: 'medium', confidence: 0.64 }),

  // === 跨区域主干（2条） ===
  connection('北京', '成都', 7.5, 10, 780, 1200, { frequency: 'medium', confidence: 0.66 }),
  connection('上海', '成都', 10, 13, 600, 950, { frequency: 'medium', confidence: 0.64 }),

  // === 补充高频直达（20条） ===
  connection('北京', '广州', 8, 10, 850, 1300, { frequency: 'medium', confidence: 0.66 }),
  connection('北京', '深圳', 8, 10.5, 900, 1400, { frequency: 'medium', confidence: 0.66 }),
  connection('上海', '广州', 6.5, 8.5, 700, 1100, { frequency: 'medium', confidence: 0.66 }),
  connection('上海', '深圳', 7, 9, 750, 1200, { frequency: 'medium', confidence: 0.66 }),
  connection('北京', '武汉', 4.5, 6, 520, 820, { frequency: 'medium', confidence: 0.66 }),
  connection('上海', '武汉', 4.5, 6, 450, 750, { frequency: 'medium', confidence: 0.66 }),
  connection('广州', '成都', 8, 10, 550, 900, { frequency: 'medium', confidence: 0.64 }),
  connection('深圳', '成都', 8.5, 11, 600, 980, { frequency: 'medium', confidence: 0.64 }),
  connection('杭州', '武汉', 4.5, 6, 350, 580, { frequency: 'medium', confidence: 0.66 }),
  connection('杭州', '长沙', 4, 5.5, 320, 520, { frequency: 'medium', confidence: 0.66 }),
  connection('南京', '长沙', 4, 5.5, 350, 560, { frequency: 'medium', confidence: 0.66 }),
  connection('天津', '南京', 3, 4.5, 300, 480, { frequency: 'medium', confidence: 0.66 }),
  connection('西安', '南京', 5, 6.5, 420, 680, { frequency: 'medium', confidence: 0.66 }),
  connection('成都', '南京', 8, 10, 500, 800, { frequency: 'medium', confidence: 0.64 }),
  connection('重庆', '南京', 7, 9, 480, 780, { frequency: 'medium', confidence: 0.64 }),
  connection('长沙', '桂林', 3.5, 5, 200, 350, { frequency: 'medium', confidence: 0.66 }),
  connection('武汉', '桂林', 4.5, 6, 280, 450, { frequency: 'medium', confidence: 0.66 }),
  connection('福州', '南昌', 3, 4.5, 180, 320, { frequency: 'medium', confidence: 0.66 }),
  connection('厦门', '南昌', 3.5, 5, 200, 350, { frequency: 'medium', confidence: 0.66 }),
  connection('杭州', '南昌', 3, 4, 240, 400, { frequency: 'medium', confidence: 0.66 })
];

module.exports = { INTERCITY_CONNECTIONS, VERIFIED_AT };
