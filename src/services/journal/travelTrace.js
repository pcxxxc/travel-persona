/**
 * 旅格 Travel Persona · 旅格轨迹服务（Phase 4）
 *
 * 职责：
 * 1. 记录用户每次旅行（城市、日期、状态、计划快照）
 * 2. 生成旅格轨迹（所有历史旅行的时间线）
 * 3. 生成向往地图数据（visited / planned / wished）
 * 4. 旅行统计（总次数、总城市、总天数、偏好簇）
 *
 * 对应总纲：
 * - 3.1 四层用户模型：旅格轨迹 Travel Trace 层（真实到访、删改、手账、照片与复盘）
 * - 8.6 向往地图：不是去过城市数量统计，而是信号的可视化
 * - 7.2 到访与停留（reliability 0.45）：需要位置授权，且不能等同于喜欢
 *
 * 存储说明：运行时索引使用 Map，所有长期数据同步写入 SQLite
 */

const crypto = require('crypto');
const { ValidationError } = require('../../utils/errors');
const { getStore } = require('../storage/sqliteStore');

// ============ 常量定义 ============

/**
 * 旅行状态
 * - planning: 规划中
 * - ongoing: 旅行中
 * - completed: 已完成
 * - cancelled: 已取消
 */
const TRIP_STATUS = {
  PLANNING: 'planning',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const ROUTE_CHANGE_TYPES = new Set(['city_removed']);
const ROUTE_CHANGE_STATUSES = new Set(['active', 'undone']);
const ACTUAL_EVENT_TYPES = new Set(['city_visited', 'city_skipped', 'city_added', 'stay_changed']);
const ACTUAL_EVENT_STATUSES = new Set(['active', 'undone', 'superseded']);

// ============ 内存存储 ============

/** tripId -> 旅行记录 */
const trips = new Map();

/** userId -> Set<tripId> 用户旅行索引 */
const userTripIndex = new Map();

/** userId -> Set<cityId> 用户收藏/向往城市 */
const userWishlist = new Map();

const store = getStore();
const TRIP_NAMESPACE = 'travel.trips';
const WISHLIST_NAMESPACE = 'travel.wishlist';

for (const { key, value } of store.list(TRIP_NAMESPACE)) {
  if (isFutureCompletedTrip(value)) {
    value.status = TRIP_STATUS.PLANNING;
    value.statusCorrectedAt = new Date().toISOString();
    value.statusCorrectionReason = 'future-completion';
    store.set(TRIP_NAMESPACE, key, value);
  }
  trips.set(key, value);
  getUserTripSet(value.userId).add(key);
}
for (const { key, value } of store.list(WISHLIST_NAMESPACE)) {
  userWishlist.set(key, value instanceof Set ? value : new Set(value || []));
}

// ============ 工具函数 ============

/**
 * 生成唯一 ID
 */
function generateId(prefix) {
  const random = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random.slice(0, 12)}`;
}

/**
 * 获取或创建用户的旅行索引
 */
function getUserTripSet(userId) {
  if (!userTripIndex.has(userId)) {
    userTripIndex.set(userId, new Set());
  }
  return userTripIndex.get(userId);
}

/**
 * 获取或创建用户的愿望清单
 */
function getUserWishlist(userId) {
  if (!userWishlist.has(userId)) {
    userWishlist.set(userId, new Set());
  }
  return userWishlist.get(userId);
}

/**
 * 计算两个日期之间的天数（含首尾）
 * @param {string} startDate - ISO 日期
 * @param {string} endDate - ISO 日期
 * @returns {number}
 */
function calculateDays(startDate, endDate) {
  if (!startDate || !endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  const diffMs = end.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays + 1); // 含首尾
}

function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

function resolvePlannedEndDate(trip) {
  const explicitEnd = parseDateOnly(trip.endDate);
  if (explicitEnd) return explicitEnd;
  const start = parseDateOnly(trip.startDate);
  if (!start) return null;
  const totalDays = Math.max(1, Number(trip.planSnapshot?.selectedPlan?.totalDays || trip.planSnapshot?.multiCityPlan?.totalDays || 1));
  start.setDate(start.getDate() + totalDays - 1);
  return start;
}

function isFutureCompletedTrip(trip) {
  if (trip.status !== TRIP_STATUS.COMPLETED) return false;
  const endDate = resolvePlannedEndDate(trip);
  if (!endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return endDate > today;
}

function assertCompletionAllowed(trip) {
  if (trip.status === TRIP_STATUS.COMPLETED && !parseDateOnly(trip.startDate)) {
    throw new ValidationError('未安排出发日期，不能标记为已完成', {
      operation: 'scheduleTrip'
    });
  }
  if (isFutureCompletedTrip(trip)) {
    throw new ValidationError('旅行尚未结束，不能标记为已完成', {
      operation: 'completeTrip',
      endDate: trip.endDate || null
    });
  }
}

function assertTripRealityAllowed(trip) {
  const start = parseDateOnly(trip.startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (trip.status === TRIP_STATUS.ONGOING && !start) {
    throw new ValidationError('未安排出发日期，不能进入实况模式', {
      operation: 'scheduleTrip'
    });
  }
  if (trip.status === TRIP_STATUS.ONGOING && start && start > today) {
    throw new ValidationError('旅行尚未开始，不能进入实况模式', {
      operation: 'startTrip',
      startDate: trip.startDate
    });
  }
  if ((trip.actualEvents || []).length > 0 && ![TRIP_STATUS.ONGOING, TRIP_STATUS.COMPLETED].includes(trip.status)) {
    throw new ValidationError('只有旅行中或已完成的行程可以记录实况', {
      operation: 'recordTripReality'
    });
  }
}

function assertTripDates(trip) {
  const hasStart = trip.startDate != null && trip.startDate !== '';
  const hasEnd = trip.endDate != null && trip.endDate !== '';
  const start = parseDateOnly(trip.startDate);
  const end = parseDateOnly(trip.endDate);
  if ((hasStart && !start) || (hasEnd && !end)) {
    throw new ValidationError('旅行日期格式无效', { operation: 'scheduleTrip' });
  }
  if (start && end && end < start) {
    throw new ValidationError('旅行结束日期不能早于出发日期', { operation: 'scheduleTrip' });
  }
}

function normalizeRouteChanges(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError('routeChanges 必须是数组', { operation: 'normalizeRouteChanges' });
  }

  return value.slice(-50).map((change, index) => {
    if (!change || typeof change !== 'object' || !ROUTE_CHANGE_TYPES.has(change.type)) {
      throw new ValidationError('存在无效的路线变更记录', { operation: 'normalizeRouteChanges', index });
    }
    const nodeSnapshot = change.nodeSnapshot && typeof change.nodeSnapshot === 'object'
      ? JSON.parse(JSON.stringify(change.nodeSnapshot))
      : null;
    if (nodeSnapshot && JSON.stringify(nodeSnapshot).length > 50000) {
      throw new ValidationError('路线变更快照过大', { operation: 'normalizeRouteChanges', index });
    }

    return {
      id: String(change.id || generateId('route_change')).slice(0, 120),
      type: change.type,
      city: String(change.city || nodeSnapshot?.city || '').slice(0, 80),
      originalIndex: Math.max(0, Math.min(Number(change.originalIndex) || 0, 100)),
      nodeSnapshot,
      status: ROUTE_CHANGE_STATUSES.has(change.status) ? change.status : 'active',
      occurredAt: String(change.occurredAt || new Date().toISOString()),
      undoneAt: change.undoneAt ? String(change.undoneAt) : null,
      explainedEntryId: change.explainedEntryId ? String(change.explainedEntryId).slice(0, 120) : null,
      explainedAt: change.explainedAt ? String(change.explainedAt) : null,
      explanationAuthorized: Boolean(change.explanationAuthorized)
    };
  });
}

function normalizeActualEvents(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new ValidationError('actualEvents 必须是数组', { operation: 'normalizeActualEvents' });
  }

  return value.slice(-100).map((event, index) => {
    if (!event || typeof event !== 'object' || !ACTUAL_EVENT_TYPES.has(event.type)) {
      throw new ValidationError('存在无效的旅行实况记录', { operation: 'normalizeActualEvents', index });
    }
    const city = String(event.city || '').trim().slice(0, 80);
    if (!city) {
      throw new ValidationError('旅行实况必须包含城市', { operation: 'normalizeActualEvents', index });
    }
    const plannedStay = event.plannedStay == null ? null : Math.max(0, Math.min(Number(event.plannedStay) || 0, 30));
    const actualStay = event.type === 'city_skipped'
      ? 0
      : event.actualStay == null ? null : Math.max(0.5, Math.min(Number(event.actualStay) || 0.5, 30));
    return {
      id: String(event.id || generateId('actual_event')).slice(0, 120),
      type: event.type,
      city,
      planned: event.type === 'city_added' ? false : Boolean(event.planned !== false),
      plannedStay,
      actualStay,
      status: ACTUAL_EVENT_STATUSES.has(event.status) ? event.status : 'active',
      source: 'user-confirmed',
      occurredAt: String(event.occurredAt || new Date().toISOString()),
      undoneAt: event.undoneAt ? String(event.undoneAt) : null,
      supersededAt: event.supersededAt ? String(event.supersededAt) : null
    };
  });
}

function buildActualTripSummary(trip) {
  const events = normalizeActualEvents(trip?.actualEvents || []);
  const active = events.filter(event => event.status === 'active');
  const latestByCity = list => {
    const index = new Map();
    list.sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt))).forEach(event => index.set(event.city, event));
    return [...index.values()];
  };
  const stateEvents = latestByCity(active.filter(event => ['city_visited', 'city_skipped', 'city_added'].includes(event.type)));
  const stayEvents = latestByCity(active.filter(event => event.type === 'stay_changed'));
  const plannedNodes = trip?.planSnapshot?.selectedPlan?.nodes || [];
  const rawPlannedCities = plannedNodes.length
    ? plannedNodes.slice(1, -1).map(node => node.city)
    : (trip?.cities || []).slice(1, -1);
  const plannedCities = Array.from(new Set(rawPlannedCities.filter(Boolean)));
  const visitedCities = Array.from(new Set(stateEvents.filter(event => ['city_visited', 'city_added'].includes(event.type)).map(event => event.city)));
  const skippedCities = Array.from(new Set(stateEvents.filter(event => event.type === 'city_skipped').map(event => event.city)));
  const addedCities = Array.from(new Set(stateEvents.filter(event => event.type === 'city_added').map(event => event.city)));
  const stayChanges = stayEvents.map(event => ({
    city: event.city,
    plannedStay: event.plannedStay,
    actualStay: event.actualStay
  }));
  return {
    hasRecords: stateEvents.length > 0,
    plannedCities,
    visitedCities,
    skippedCities,
    addedCities,
    stayChanges,
    counts: {
      planned: plannedCities.length,
      visited: visitedCities.length,
      skipped: skippedCities.length,
      added: addedCities.length,
      stayChanged: stayChanges.length
    }
  };
}

// ============ 核心接口 ============

/**
 * 记录旅行
 *
 * @param {string} userId - 用户 ID
 * @param {Object} tripData - 旅行数据
 * @param {Array<string>} [tripData.cities=[]] - 城市列表
 * @param {string} [tripData.startDate] - 开始日期
 * @param {string} [tripData.endDate] - 结束日期
 * @param {string} [tripData.status='planning'] - 旅行状态
 * @param {Object} [tripData.planSnapshot={}] - 计划快照（行程规划快照）
 * @returns {Object} 创建的旅行记录
 */
function recordTrip(userId, tripData = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'recordTrip' });
  }

  const status = tripData.status || TRIP_STATUS.PLANNING;
  const cities = Array.isArray(tripData.cities) ? [...tripData.cities] : [];

  const tripId = tripData.tripId || generateId('trip');
  const now = new Date().toISOString();
  const existingTrip = trips.get(tripId);
  if (existingTrip) {
    if (existingTrip.userId !== userId) {
      throw new ValidationError('旅行编号已被占用', { operation: 'recordTrip', tripId });
    }
    return existingTrip;
  }

  const trip = {
    tripId,
    userId,
    title: tripData.title || null,
    cities,
    startDate: tripData.startDate || null,
    endDate: tripData.endDate || null,
    status,
    routeChanges: normalizeRouteChanges(tripData.routeChanges),
    actualEvents: normalizeActualEvents(tripData.actualEvents),
    // 计划快照：保存旅行规划时的方案，用于后续对比计划与实际差异（总纲8.4）
    planSnapshot: tripData.planSnapshot || {},
    createdAt: now,
    updatedAt: now
  };

  assertTripDates(trip);
  assertCompletionAllowed(trip);
  assertTripRealityAllowed(trip);

  trips.set(tripId, trip);
  getUserTripSet(userId).add(tripId);
  store.set(TRIP_NAMESPACE, tripId, trip);

  return trip;
}

/**
 * 更新旅行状态
 *
 * @param {string} tripId - 旅行 ID
 * @param {Object} updates - 更新内容
 * @returns {Object} 更新后的旅行记录
 */
function updateTrip(tripId, updates = {}, expectedUserId = null) {
  const trip = trips.get(tripId);
  if (!trip) {
    throw new ValidationError(`旅行记录不存在: ${tripId}`, {
      operation: 'updateTrip',
      tripId
    });
  }
  if (expectedUserId && trip.userId !== expectedUserId) {
    throw new ValidationError('旅行记录不存在或无权访问', { operation: 'updateTrip', tripId });
  }

  const allowedKeys = new Set([
    'title', 'cities', 'startDate', 'endDate', 'status', 'routeChanges', 'actualEvents', 'planSnapshot'
  ]);
  const allowed = Object.fromEntries(Object.entries(updates).filter(([key]) => allowedKeys.has(key)));
  if (allowed.status && !Object.values(TRIP_STATUS).includes(allowed.status)) {
    throw new ValidationError(`无效的旅行状态: ${allowed.status}`, { operation: 'updateTrip', tripId });
  }
  if (Object.prototype.hasOwnProperty.call(allowed, 'routeChanges')) {
    allowed.routeChanges = normalizeRouteChanges(allowed.routeChanges);
  }
  if (Object.prototype.hasOwnProperty.call(allowed, 'actualEvents')) {
    allowed.actualEvents = normalizeActualEvents(allowed.actualEvents);
  }
  const candidate = { ...trip, ...allowed };
  assertTripDates(candidate);
  assertCompletionAllowed(candidate);
  assertTripRealityAllowed(candidate);

  Object.assign(trip, allowed);
  trip.updatedAt = new Date().toISOString();
  store.set(TRIP_NAMESPACE, tripId, trip);

  return trip;
}

/**
 * 获取用户旅格轨迹（所有历史旅行）
 *
 * @param {string} userId - 用户 ID
 * @param {Object} [filters]
 * @param {string} [filters.status] - 按状态过滤
 * @returns {Array<Object>} 旅行记录列表（按开始日期降序）
 */
function getTravelTrace(userId, filters = {}) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'getTravelTrace' });
  }

  const tripIds = getUserTripSet(userId);
  let result = [];

  for (const id of tripIds) {
    const trip = trips.get(id);
    if (!trip) continue;
    if (filters.status && trip.status !== filters.status) continue;
    result.push(trip);
  }

  // 按开始日期降序排列（无日期的排最后）
  result.sort((a, b) => {
    if (!a.startDate) return 1;
    if (!b.startDate) return -1;
    return b.startDate.localeCompare(a.startDate);
  });

  return result;
}

/**
 * 生成向往地图数据
 *
 * 总纲8.6：向往地图不是去过城市数量统计，而是信号的可视化
 * - visited: 已到访城市（来自 completed 状态的旅行）
 * - planned: 计划中城市（来自 planning / ongoing 状态的旅行）
 * - wished: 收藏/向往城市（来自用户愿望清单）
 *
 * @param {string} userId - 用户 ID
 * @returns {Object} { visited: [], planned: [], wished: [] }
 */
function getVisitMap(userId) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'getVisitMap' });
  }

  const allTrips = getTravelTrace(userId);
  const visited = new Set();
  const planned = new Set();
  const needsConfirmation = new Set();

  allTrips.forEach(trip => {
    if (!trip.cities) return;

    if (trip.status === TRIP_STATUS.COMPLETED) {
      const actual = buildActualTripSummary(trip);
      if (actual.hasRecords) {
        actual.visitedCities.forEach(city => visited.add(city));
      } else {
        (trip.cities || []).forEach(city => needsConfirmation.add(city));
      }
    } else if (trip.status === TRIP_STATUS.PLANNING || trip.status === TRIP_STATUS.ONGOING) {
      trip.cities.forEach(city => {
        // 计划中但还未到访的城市
        if (!visited.has(city)) {
          planned.add(city);
        }
      });
    }
  });

  // 愿望清单（收藏的城市）
  const wished = [...getUserWishlist(userId)].filter(city => !visited.has(city));

  return {
    visited: [...visited],
    planned: [...planned],
    wished,
    needsConfirmation: [...needsConfirmation].filter(city => !visited.has(city))
  };
}

/**
 * 添加愿望城市（收藏/向往）
 *
 * 总纲7.2：收藏（reliability 0.20）代表向往或研究，不代表可执行偏好
 *
 * @param {string} userId - 用户 ID
 * @param {string} cityId - 城市 ID
 * @returns {Object} { added: true, cityId }
 */
function addWish(userId, cityId) {
  if (!userId || !cityId) {
    throw new ValidationError('userId 和 cityId 不能为空', { operation: 'addWish' });
  }
  getUserWishlist(userId).add(cityId);
  store.set(WISHLIST_NAMESPACE, userId, getUserWishlist(userId));
  return { added: true, cityId };
}

/**
 * 移除愿望城市
 *
 * @param {string} userId - 用户 ID
 * @param {string} cityId - 城市 ID
 * @returns {Object} { removed: true, cityId }
 */
function removeWish(userId, cityId) {
  if (!userId || !cityId) {
    throw new ValidationError('userId 和 cityId 不能为空', { operation: 'removeWish' });
  }
  getUserWishlist(userId).delete(cityId);
  store.set(WISHLIST_NAMESPACE, userId, getUserWishlist(userId));
  return { removed: true, cityId };
}

/**
 * 旅行统计
 *
 * @param {string} userId - 用户 ID
 * @returns {Object} { totalTrips, totalCities, totalDays, favoriteCluster }
 *
 * - totalTrips: 已完成旅行次数（不含已取消）
 * - totalCities: 已到访的不同城市数
 * - totalDays: 已完成旅行的总天数
 * - favoriteCluster: 最常到访的城市簇（简化：出现次数最多的城市）
 */
function getTripStats(userId) {
  if (!userId) {
    throw new ValidationError('userId 不能为空', { operation: 'getTripStats' });
  }

  const allTrips = getTravelTrace(userId);

  // 只统计已完成和非取消的旅行
  const validTrips = allTrips.filter(t => t.status !== TRIP_STATUS.CANCELLED);
  const completedTrips = allTrips.filter(t => t.status === TRIP_STATUS.COMPLETED);

  // 统计不同城市
  const visitedCities = new Set();
  const cityVisitCount = {}; // cityId -> 到访次数

  completedTrips.forEach(trip => {
    const actual = buildActualTripSummary(trip);
    const completedCities = actual.hasRecords ? actual.visitedCities : [];
    completedCities.forEach(city => {
      visitedCities.add(city);
      cityVisitCount[city] = (cityVisitCount[city] || 0) + 1;
    });
  });

  // 统计总天数
  let totalDays = 0;
  completedTrips.forEach(trip => {
    totalDays += calculateDays(trip.startDate, trip.endDate);
  });

  // 偏好簇：出现次数最多的城市
  let favoriteCluster = null;
  let maxCount = 0;
  Object.entries(cityVisitCount).forEach(([city, count]) => {
    if (count > maxCount) {
      maxCount = count;
      favoriteCluster = city;
    }
  });

  return {
    totalTrips: validTrips.length,
    completedTrips: completedTrips.length,
    totalCities: visitedCities.size,
    totalDays,
    favoriteCluster,
    cityVisitCount
  };
}

/**
 * 删除旅行记录
 *
 * 总纲12.5：用户必须能够删除数据
 *
 * @param {string} tripId - 旅行 ID
 * @returns {Object} { deleted: true, tripId }
 */
function deleteTrip(tripId, expectedUserId = null) {
  const trip = trips.get(tripId);
  if (!trip) {
    throw new ValidationError(`旅行记录不存在: ${tripId}`, {
      operation: 'deleteTrip',
      tripId
    });
  }
  if (expectedUserId && trip.userId !== expectedUserId) {
    throw new ValidationError('旅行记录不存在或无权访问', { operation: 'deleteTrip', tripId });
  }

  getUserTripSet(trip.userId).delete(tripId);
  trips.delete(tripId);
  store.delete(TRIP_NAMESPACE, tripId);

  return { deleted: true, tripId };
}

/** Move a guest travel trace into a verified account without changing trip IDs. */
function transferUserData(sourceUserId, targetUserId) {
  if (!sourceUserId || !targetUserId || sourceUserId === targetUserId) {
    return { tripsTransferred: 0, wishesTransferred: 0 };
  }

  let tripsTransferred = 0;
  const targetTrips = getUserTripSet(targetUserId);
  for (const tripId of [...getUserTripSet(sourceUserId)]) {
    const trip = trips.get(tripId);
    if (!trip) continue;
    if (trip.userId === sourceUserId) {
      trip.userId = targetUserId;
      trip.updatedAt = new Date().toISOString();
      store.set(TRIP_NAMESPACE, tripId, trip);
      tripsTransferred++;
    }
    if (trip.userId === targetUserId) targetTrips.add(tripId);
  }
  userTripIndex.delete(sourceUserId);

  const sourceWishes = userWishlist.get(sourceUserId) || new Set();
  const targetWishes = getUserWishlist(targetUserId);
  const before = targetWishes.size;
  sourceWishes.forEach(cityId => targetWishes.add(cityId));
  userWishlist.delete(sourceUserId);
  store.delete(WISHLIST_NAMESPACE, sourceUserId);
  store.set(WISHLIST_NAMESPACE, targetUserId, targetWishes);

  return { tripsTransferred, wishesTransferred: targetWishes.size - before };
}

function deleteUserData(userId) {
  const tripIds = [...getUserTripSet(userId)];
  tripIds.forEach(tripId => {
    if (trips.has(tripId)) deleteTrip(tripId);
  });
  userTripIndex.delete(userId);
  userWishlist.delete(userId);
  store.delete(WISHLIST_NAMESPACE, userId);
  return { tripsDeleted: tripIds.length };
}

// ============ 测试辅助 ============

/**
 * 重置所有内存存储（仅用于测试）
 */
function _reset() {
  trips.clear();
  userTripIndex.clear();
  userWishlist.clear();
  store.clear(TRIP_NAMESPACE);
  store.clear(WISHLIST_NAMESPACE);
}

/**
 * 获取存储统计（调试用）
 */
function _getStats() {
  return {
    totalTrips: trips.size,
    totalUsers: userTripIndex.size
  };
}

module.exports = {
  // 常量
  TRIP_STATUS,
  ACTUAL_EVENT_TYPES,
  ACTUAL_EVENT_STATUSES,

  // 核心接口
  recordTrip,
  updateTrip,
  getTravelTrace,
  getVisitMap,
  getTripStats,
  buildActualTripSummary,
  deleteTrip,
  transferUserData,
  deleteUserData,

  // 愿望清单
  addWish,
  removeWish,

  // 工具
  calculateDays,

  // 测试辅助
  _reset,
  _getStats
};
