/**
 * 旅格 Travel Persona · 节假日服务
 *
 * 基于 chinese-days npm 包，提供中国法定节假日判断能力。
 * 数据来源：国务院每年发布的节假日安排。
 * 无需API Key，纯本地计算。
 */

const { getDayDetail } = require('chinese-days');

function parseHolidayName(rawName) {
  const parts = String(rawName || '').split(',');
  return parts.length >= 2 ? parts[1] : null;
}

/**
 * 获取指定日期的节假日信息
 *
 * @param {string|Date} date - 日期（如 '2026-10-01'）
 * @returns {Object|null} 节假日信息或 null
 *   { name: '国庆节', type: 'holiday', isHoliday: true, isWorkday: false }
 */
function getHolidayInfo(date) {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    const dateString = formatDate(d);
    const detail = getDayDetail(dateString);
    const holidayName = parseHolidayName(detail?.name);

    if (detail && detail.work === false && holidayName) {
      return {
        name: holidayName,
        type: 'holiday',
        isHoliday: true,
        isWorkday: false,
        date: formatDate(d)
      };
    }

    if (detail && detail.work === true && holidayName) {
      return {
        name: `${holidayName}调休工作日`,
        type: 'adjustment',
        isHoliday: false,
        isWorkday: true,
        isWorkdayOff: false,
        date: formatDate(d)
      };
    }

    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    return {
      name: isWeekend ? (dayOfWeek === 0 ? '周日' : '周六') : '工作日',
      type: isWeekend ? 'weekend' : 'workday',
      isHoliday: false,
      isWorkday: !isWeekend,
      date: formatDate(d)
    };
  } catch (err) {
    // chinese-days 可能不覆盖某些年份，使用传入参数降级
    const fallback = typeof date === 'string' ? new Date(date) : date;
    const dayOfWeek = fallback.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return {
      name: isWeekend ? '周末' : '工作日',
      type: isWeekend ? 'weekend' : 'workday',
      isHoliday: false,
      isWorkday: !isWeekend,
      date: formatDate(fallback)
    };
  }
}

/**
 * 判断指定日期是否适合出行（避开高峰）
 *
 * 出行友好度评估：
 * - holiday（法定假日）：高峰，低友好度
 * - adjustment（调休工作日）：正常友好度
 * - weekend（周末）：中等友好度
 * - workday（工作日）：高峰，低友好度（除非请了假）
 *
 * @param {string|Date} date
 * @returns {Object} { date, travelFriendliness: 'low'|'medium'|'high', reason }
 */
function getTravelFriendliness(date) {
  const info = getHolidayInfo(date);

  switch (info.type) {
    case 'holiday':
      return { date: info.date, travelFriendliness: 'low', reason: `${info.name}，景区人流量大` };
    case 'weekend':
      return { date: info.date, travelFriendliness: 'medium', reason: '周末，客流量中等' };
    case 'adjustment':
      return { date: info.date, travelFriendliness: 'high', reason: `${info.name}，出行人数相对较少` };
    case 'workday':
      return { date: info.date, travelFriendliness: 'low', reason: '工作日，需请假' };
    default:
      return { date: info.date, travelFriendliness: 'medium', reason: '常规日' };
  }
}

/**
 * 获取日期范围内最佳的出行日期
 *
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 * @param {number} topN - 返回前N个最佳日期
 * @returns {Array} 按出行友好度排序的日期列表
 */
function getBestTravelDates(startDate, endDate, topN = 3) {
  const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
  const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

  const results = [];
  const current = new Date(start);

  while (current <= end) {
    results.push(getTravelFriendliness(new Date(current)));
    current.setDate(current.getDate() + 1);
  }

  // 按友好度排序：high > medium > low
  const order = { high: 0, medium: 1, low: 2 };
  results.sort((a, b) => order[a.travelFriendliness] - order[b.travelFriendliness]);

  return results.slice(0, topN);
}

/**
 * 获取近期节假日列表
 *
 * @param {number} months - 未来几个月
 * @returns {Array} 节假日列表
 */
function getUpcomingHolidays(months = 3) {
  const results = [];
  const now = new Date();
  const end = new Date(now);
  end.setMonth(end.getMonth() + months);

  const current = new Date(now);

  while (current <= end) {
    try {
      const detail = getDayDetail(formatDate(current));
      const holidayName = parseHolidayName(detail?.name);
      if (detail && detail.work === false && holidayName) {
        results.push({
          date: formatDate(current),
          name: holidayName,
          type: 'holiday'
        });
      }
    } catch (e) {
      // 忽略不支持的年份
    }
    current.setDate(current.getDate() + 1);
  }

  return results;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

module.exports = {
  getHolidayInfo,
  getTravelFriendliness,
  getBestTravelDates,
  getUpcomingHolidays
};
