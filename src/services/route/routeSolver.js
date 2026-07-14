/**
 * 旅格 Travel Persona · Phase 2 路线求解服务
 *
 * 设计说明：
 * - Phase 2 简化实现，使用纯 JS 贪心算法，不依赖 OR-Tools
 * - 单城日内路线：贪心最近邻 TSP 近似（O(n²) 复杂度）
 * - 多城路线：拓扑排序 + 约束检查（处理城市间依赖关系）
 * - 日内 POI 排序：从起点出发的最近邻贪心
 *
 * 算法局限说明（诚实标注）：
 * - 贪心最近邻不保证全局最优，但保证可行解
 * - 多城拓扑排序为简化版，未做距离优化（Phase 3 可引入 2-opt / 模拟退火）
 *
 * 返回格式统一：
 *   { days: [{ dayIndex, nodes: [...] }], totalDistance, feasible }
 */

const { haversineDistance } = require('../map/mapProvider');

// ========== 常量 ==========

/** 每天建议 POI 数量上限（避免行程过载） */
const MAX_POIS_PER_DAY = 6;

/** 每天建议游览时长上限（小时） */
const MAX_HOURS_PER_DAY = 8;

/** 每个 POI 预估游览时间（小时） */
const AVG_POI_VISIT_HOURS = 1.5;

// ========== 工具函数 ==========

/**
 * 确保 POI 有坐标，若无则分配确定性伪坐标
 * （与 MockMapProvider 的伪坐标策略一致，保证路线求解可运行）
 * @param {Array} pois - POI 列表
 * @param {Object} [baseCoord] - 基准坐标 { lat, lng }
 * @returns {Array} 带坐标的 POI 列表（浅拷贝）
 */
function ensureCoordinates(pois, baseCoord = { lat: 30, lng: 110 }) {
  return pois.map((poi, idx) => {
    if (typeof poi.lat === 'number' && typeof poi.lng === 'number') {
      return poi;
    }
    // 分配确定性伪坐标
    const latOffset = 0.02 * (idx + 1) - 0.02 * (pois.length / 2);
    const lngOffset = 0.015 * Math.sin(idx * 1.3);
    return {
      ...poi,
      lat: parseFloat((baseCoord.lat + latOffset).toFixed(6)),
      lng: parseFloat((baseCoord.lng + lngOffset).toFixed(6))
    };
  });
}

/**
 * 计算有序节点序列的总距离
 * @param {Array<{lat:number,lng:number}>} orderedPoints
 * @returns {number} 总距离（公里）
 */
function computeTotalDistance(orderedPoints) {
  let total = 0;
  for (let i = 0; i < orderedPoints.length - 1; i++) {
    total += haversineDistance(
      orderedPoints[i].lat, orderedPoints[i].lng,
      orderedPoints[i + 1].lat, orderedPoints[i + 1].lng
    );
  }
  return parseFloat(total.toFixed(2));
}

// ================================================================
//  贪心最近邻 TSP 近似
// ================================================================

/**
 * 贪心最近邻 TSP 近似算法
 *
 * 算法步骤：
 * 1. 从起点出发（或第一个 POI）
 * 2. 每次选择距离当前节点最近的未访问节点
 * 3. 直到所有节点访问完毕
 *
 * 时间复杂度：O(n²)，适合 n ≤ 50 的场景
 *
 * @param {Array<{lat:number,lng:number}>} points - 待排序的点
 * @param {{lat:number,lng:number}} [startPoint] - 起点（可选，默认第一个点）
 * @returns {{ order: Array, distance: number }}
 */
function greedyNearestNeighbor(points, startPoint = null) {
  if (!points || points.length === 0) {
    return { order: [], distance: 0 };
  }
  if (points.length === 1) {
    return { order: [...points], distance: 0 };
  }

  const ordered = [];
  const remaining = [...points];
  let current;
  let startIsExternal = false; // 标记起点是否为外部位置（如酒店，不属于 POI 列表）

  if (startPoint) {
    // 检查起点是否在 POI 列表中（按引用匹配）
    const startIdx = remaining.indexOf(startPoint);
    if (startIdx >= 0) {
      // 起点是列表中的 POI —— 移出 remaining，作为第一个访问点
      current = remaining.splice(startIdx, 1)[0];
      ordered.push(current);
    } else {
      // 起点是外部位置（如酒店）—— 仅用于距离计算，不加入结果
      current = startPoint;
      startIsExternal = true;
    }
  } else {
    // 未指定起点，默认从第一个 POI 出发
    current = remaining.shift();
    ordered.push(current);
  }

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(
        current.lat, current.lng,
        remaining[i].lat, remaining[i].lng
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    current = remaining.splice(nearestIdx, 1)[0];
    ordered.push(current);
  }

  // 计算总距离
  // 若起点为外部位置，需加上从起点到第一个 POI 的距离
  let distance;
  if (startIsExternal && ordered.length > 0) {
    const firstLeg = haversineDistance(
      startPoint.lat, startPoint.lng,
      ordered[0].lat, ordered[0].lng
    );
    distance = firstLeg + computeTotalDistance(ordered);
  } else {
    distance = computeTotalDistance(ordered);
  }

  return {
    order: ordered,
    distance: parseFloat(distance.toFixed(2))
  };
}

// ================================================================
//  核心方法
// ================================================================

/**
 * 单城日内路线求解
 *
 * 将 POI 列表分配到指定天数的日程中，每天用贪心最近邻排序。
 *
 * 分配策略：
 * - 按 MAX_POIS_PER_DAY 上限均分到各天
 * - 每天内用最近邻算法排序，减少移动距离
 *
 * @param {Array} pois - POI 列表（需含 lat/lng，或会被分配伪坐标）
 * @param {number} days - 游览天数
 * @param {Object} [options] - 可选参数
 * @param {{lat:number,lng:number}} [options.startLocation] - 每天起点（如酒店位置）
 * @returns {{ days: Array, totalDistance: number, feasible: boolean }}
 */
function solveSingleCity(pois, days, options = {}) {
  const safeDays = Math.max(1, Math.floor(days) || 1);
  const startLocation = options.startLocation || null;

  // 确保 POI 有坐标
  const poisWithCoords = ensureCoordinates(pois, startLocation || { lat: 30, lng: 110 });

  // 将 POI 均分到各天
  const poisPerDay = Math.min(
    MAX_POIS_PER_DAY,
    Math.ceil(poisWithCoords.length / safeDays)
  );

  const dayGroups = [];
  for (let d = 0; d < safeDays; d++) {
    const start = d * poisPerDay;
    const end = start + poisPerDay;
    dayGroups.push(poisWithCoords.slice(start, end));
  }

  // 对每天用最近邻排序
  const resultDays = dayGroups.map((dayPOIs, dayIndex) => {
    const start = startLocation || (dayPOIs.length > 0 ? dayPOIs[0] : null);
    if (!start || dayPOIs.length === 0) {
      return { dayIndex, nodes: [], distance: 0 };
    }

    const { order, distance } = greedyNearestNeighbor(dayPOIs, start);
    return {
      dayIndex,
      nodes: order.map((poi, idx) => ({
        ...poi,
        visitOrder: idx,
        estimatedVisitHours: AVG_POI_VISIT_HOURS
      })),
      distance
    };
  });

  const totalDistance = resultDays.reduce((sum, d) => sum + (d.distance || 0), 0);

  // 可行性检查：每天的 POI 数和时间不超限
  const feasible = resultDays.every(
    (d) => d.nodes.length <= MAX_POIS_PER_DAY &&
            d.nodes.length * AVG_POI_VISIT_HOURS <= MAX_HOURS_PER_DAY
  );

  return {
    days: resultDays,
    totalDistance: parseFloat(totalDistance.toFixed(2)),
    feasible
  };
}

/**
 * 多城路线求解（简化版：拓扑排序 + 约束检查）
 *
 * 处理城市间的访问顺序依赖关系，并检查约束是否满足。
 *
 * routeNodes 格式示例：
 *   [{ id: 'chengdu', name: '成都', lat: 30.57, lng: 104.07, order: 1, dependsOn: [] }, ...]
 *
 * constraints 格式示例：
 *   { maxDays: 15, mustReach: ['chengdu', 'xian'], budgetCeiling: 10000 }
 *
 * 算法：
 * 1. 构建 DAG（有向无环图）—— dependsOn 定义依赖边
 * 2. Kahn 拓扑排序，生成访问顺序
 * 3. 检查约束：mustReach 是否全覆盖、maxDays 是否超限、budgetCeiling 是否超预算
 *
 * @param {Array} routeNodes - 城市节点列表
 * @param {Object} [constraints] - 约束条件
 * @returns {{ days: Array, totalDistance: number, feasible: boolean }}
 */
function solveMultiCity(routeNodes, constraints = {}) {
  if (!routeNodes || routeNodes.length === 0) {
    return { days: [], totalDistance: 0, feasible: true };
  }

  // --- 步骤1：构建依赖图 ---
  // 每个节点可能有 dependsOn（必须在哪些城市之后访问）或 order（显式顺序）
  const nodeMap = new Map();
  routeNodes.forEach((node) => {
    nodeMap.set(node.id, {
      ...node,
      dependsOn: node.dependsOn || [],
      inDegree: 0
    });
  });

  // 计算入度
  const adjList = new Map(); // 邻接表：id → [依赖它的 id]
  nodeMap.forEach((node) => {
    adjList.set(node.id, []);
  });

  nodeMap.forEach((node) => {
    (node.dependsOn || []).forEach((depId) => {
      if (nodeMap.has(depId)) {
        adjList.get(depId).push(node.id);
        node.inDegree++;
      }
    });
  });

  // --- 步骤2：Kahn 拓扑排序 ---
  // 若节点有 order 字段，优先按 order 排序（同入度时）
  const queue = [];
  nodeMap.forEach((node) => {
    if (node.inDegree === 0) queue.push(node);
  });
  queue.sort((a, b) => (a.order || 999) - (b.order || 999));

  const sortedIds = [];
  while (queue.length > 0) {
    const current = queue.shift();
    sortedIds.push(current.id);

    const neighbors = adjList.get(current.id) || [];
    const newZeroDegree = [];
    neighbors.forEach((neighborId) => {
      const neighbor = nodeMap.get(neighborId);
      neighbor.inDegree--;
      if (neighbor.inDegree === 0) {
        newZeroDegree.push(neighbor);
      }
    });
    // 保持 order 排序
    newZeroDegree.sort((a, b) => (a.order || 999) - (b.order || 999));
    queue.push(...newZeroDegree);
  }

  // 检测环路：若排序后节点数 < 总节点数，说明有环
  const hasCycle = sortedIds.length < routeNodes.length;

  // 获取排序后的城市节点
  const orderedCities = sortedIds
    .map((id) => nodeMap.get(id))
    .filter(Boolean);

  // 若有环，将未排序的节点追加到末尾（保证不丢数据）
  if (hasCycle) {
    const sortedSet = new Set(sortedIds);
    routeNodes.forEach((node) => {
      if (!sortedSet.has(node.id)) {
        orderedCities.push(nodeMap.get(node.id));
      }
    });
  }

  // --- 步骤3：计算总距离 ---
  const citiesWithCoords = ensureCoordinates(
    orderedCities.map((c) => ({
      ...c,
      lat: c.lat || c.coordinates?.lat,
      lng: c.lng || c.coordinates?.lng
    }))
  );
  const totalDistance = computeTotalDistance(citiesWithCoords);

  // --- 步骤4：约束检查 ---
  const issues = [];

  // mustReach 检查
  if (constraints.mustReach && Array.isArray(constraints.mustReach)) {
    const visitedIds = new Set(orderedCities.map((c) => c.id));
    const missed = constraints.mustReach.filter((id) => !visitedIds.has(id));
    if (missed.length > 0) {
      issues.push(`未覆盖必达城市: ${missed.join(', ')}`);
    }
  }

  // maxDays 检查（假设每城至少 1 天）
  if (constraints.maxDays) {
    const estimatedDays = orderedCities.reduce(
      (sum, c) => sum + (c.minDays || c.estimatedDays || 2), 2
    );
    if (estimatedDays > constraints.maxDays) {
      issues.push(`预估天数 ${estimatedDays} 超出上限 ${constraints.maxDays}`);
    }
  }

  // budgetCeiling 检查
  if (constraints.budgetCeiling) {
    const estimatedCost = orderedCities.reduce(
      (sum, c) => sum + (c.dailyBudget || 300) * (c.minDays || 2), 0
    );
    if (estimatedCost > constraints.budgetCeiling) {
      issues.push(`预估费用 ${estimatedCost} 超出预算上限 ${constraints.budgetCeiling}`);
    }
  }

  // 环路检查
  if (hasCycle) {
    issues.push('城市间存在循环依赖，部分顺序可能不合理');
  }

  // --- 构建返回结构 ---
  const days = orderedCities.map((city, idx) => ({
    dayIndex: idx,
    nodes: [citiesWithCoords[idx]],
    cityName: city.name,
    cityId: city.id,
    estimatedDays: city.minDays || city.estimatedDays || 2
  }));

  return {
    days,
    totalDistance: parseFloat(totalDistance.toFixed(2)),
    feasible: issues.length === 0,
    issues
  };
}

/**
 * 日内 POI 排序优化
 *
 * 从指定起点出发，用贪心最近邻对当天 POI 列表排序，
 * 使总移动距离最小化。
 *
 * @param {Array} dayPOIs - 当天待排序的 POI 列表
 * @param {{lat:number,lng:number}} startLocation - 起点（如酒店/车站）
 * @returns {{ orderedPOIs: Array, distance: number }}
 */
function optimizeDailySchedule(dayPOIs, startLocation) {
  if (!dayPOIs || dayPOIs.length === 0) {
    return { orderedPOIs: [], distance: 0 };
  }

  if (!startLocation) {
    // 无起点时，以第一个 POI 为起点
    const { order, distance } = greedyNearestNeighbor(dayPOIs);
    return {
      orderedPOIs: order.map((poi, idx) => ({
        ...poi,
        visitOrder: idx,
        estimatedVisitHours: AVG_POI_VISIT_HOURS
      })),
      distance
    };
  }

  const poisWithCoords = ensureCoordinates(dayPOIs, startLocation);
  const { order, distance } = greedyNearestNeighbor(poisWithCoords, startLocation);

  return {
    orderedPOIs: order.map((poi, idx) => ({
      ...poi,
      visitOrder: idx,
      estimatedVisitHours: AVG_POI_VISIT_HOURS
    })),
    distance: parseFloat(distance.toFixed(2))
  };
}

// ========== 导出 ==========

module.exports = {
  // 核心方法
  solveSingleCity,
  solveMultiCity,
  optimizeDailySchedule,
  // 算法工具（供测试和扩展使用）
  greedyNearestNeighbor,
  computeTotalDistance,
  ensureCoordinates,
  // 常量
  MAX_POIS_PER_DAY,
  MAX_HOURS_PER_DAY,
  AVG_POI_VISIT_HOURS
};
