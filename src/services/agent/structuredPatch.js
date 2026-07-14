/**
 * 旅格 Travel Persona · 结构化 Patch（Phase 5，总纲 10.4）
 *
 * 设计原则（总纲 11.1 / 11.3）：
 *   本地确定性规划器永远先产出完整合同，Agent 只能以受约束的
 *   JSON Patch 形式增量修改结果。Patch 经 schema、白名单、事实
 *   校验后才安全合并；任何一项不通过则丢弃 Agent 结果。
 *
 * Patch 格式：
 *   {
 *     operations: [
 *       { op: 'add' | 'replace' | 'remove', path: '/path/to/field', value: <any> }
 *     ]
 *   }
 *
 * 安全规则（总纲 10.5 / 11.6）：
 *   - 只允许修改白名单路径
 *   - 绝不允许修改 personaProfile.traits / lockedTraits / hardConstraints / lockedNodes
 *   - 新增或替换的 POI / 坐标必须通过事实校验
 */

const { ValidationError } = require('../../utils/errors');

/**
 * 受保护路径前缀（命中即拒绝，优先级高于白名单）
 * 对应总纲 10.5：不得移动锁定节点、不得修改长期人格、不得改硬约束
 */
const PROTECTED_PATHS = [
  '/personaProfile/traits',      // 长期人格维度
  '/personaProfile/lockedTraits', // 锁定的人格维度
  '/lockedTraits',                // 锁定维度（顶层别名）
  '/hardConstraints',             // 硬约束（预算/时间/不可移动项）
  '/lockedNodes',                 // 锁定的行程节点
  '/personaSnapshot/traits',      // 人格快照维度
  '/personaSnapshot/lockedTraits'
];

const VALID_OPS = new Set(['add', 'replace', 'remove']);

// ===== 路径工具（JSON Pointer 子集）=====

/**
 * 解析 JSON Pointer 路径为段数组
 * '/a/b/c' -> ['a', 'b', 'c']；还原 ~1 -> '/'、~0 -> '~'
 */
function parsePath(path) {
  if (typeof path !== 'string' || path.length === 0 || path[0] !== '/') {
    throw new ValidationError(`非法 patch 路径: ${path}`, { path });
  }
  return path.slice(1).split('/').map(seg => seg.replace(/~1/g, '/').replace(/~0/g, '~'));
}

/** 按段读取对象上的值 */
function getPath(obj, segments) {
  let cur = obj;
  for (const seg of segments) {
    if (cur == null) return undefined;
    cur = cur[seg];
  }
  return cur;
}

/** 按段写入值（自动创建中间对象） */
function setPath(obj, segments, value) {
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (cur[seg] == null || typeof cur[seg] !== 'object') {
      cur[seg] = {};
    }
    cur = cur[seg];
  }
  cur[segments[segments.length - 1]] = value;
}

/** 按段删除值（数组用 splice，对象用 delete） */
function removePath(obj, segments) {
  let cur = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    if (cur == null) return false;
    cur = cur[segments[i]];
  }
  if (cur == null) return false;
  const last = segments[segments.length - 1];
  if (Array.isArray(cur) && /^\d+$/.test(last)) {
    cur.splice(parseInt(last, 10), 1);
  } else {
    delete cur[last];
  }
  return true;
}

// ===== 白名单 / 保护判断 =====

/** 路径是否命中受保护前缀（自身或子路径） */
function isProtected(path) {
  return PROTECTED_PATHS.some(p => path === p || path.startsWith(p + '/'));
}

/**
 * 路径是否被白名单允许
 * - 未提供白名单（空）时，仅受保护路径限制，其余放行
 * - 提供白名单时，路径需等于或位于某个白名单前缀之下
 */
function isAllowed(path, allowedPaths) {
  if (!allowedPaths || allowedPaths.length === 0) return true;
  return allowedPaths.some(a => path === a || path.startsWith(a + '/'));
}

// ===== 校验 =====

/**
 * 验证 Patch 是否安全
 * @param {Object} patch - { operations: [...] }
 * @param {string[]} allowedPaths - 允许修改的路径白名单（前缀匹配）
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validatePatch(patch, allowedPaths = []) {
  const errors = [];

  if (!patch || typeof patch !== 'object') {
    return { valid: false, errors: ['patch 必须是对象'] };
  }
  const ops = patch.operations;
  if (!Array.isArray(ops)) {
    return { valid: false, errors: ['patch.operations 必须是数组'] };
  }

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    if (!op || typeof op !== 'object') {
      errors.push(`operations[${i}] 不是对象`);
      continue;
    }
    if (!VALID_OPS.has(op.op)) {
      errors.push(`operations[${i}].op 非法: ${op.op}`);
      continue;
    }
    if (typeof op.path !== 'string' || op.path[0] !== '/') {
      errors.push(`operations[${i}].path 非法: ${op.path}`);
      continue;
    }
    // add / replace 必须带 value（允许 null / false / 0 等合法值）
    if (op.op !== 'remove' && op.value === undefined) {
      errors.push(`operations[${i}] 缺少 value（${op.op} 操作需要 value）`);
      continue;
    }
    // 受保护路径：一律拒绝
    if (isProtected(op.path)) {
      errors.push(`operations[${i}].path 受保护，禁止修改: ${op.path}`);
      continue;
    }
    // 白名单：不在白名单内则拒绝
    if (!isAllowed(op.path, allowedPaths)) {
      errors.push(`operations[${i}].path 不在白名单内: ${op.path}`);
      continue;
    }
  }

  return { valid: errors.length === 0, errors };
}

// ===== 应用 =====

/**
 * 将 Agent 返回的 Patch 应用到目标对象（就地修改并返回）
 * @param {Object} target - 目标对象
 * @param {Object} patch - { operations: [...] }
 * @param {string[]} allowedPaths - 允许修改的路径白名单（可选）
 * @returns {Object} 修改后的 target
 * @throws {ValidationError} 校验失败时抛出
 */
function applyPatch(target, patch, allowedPaths = []) {
  const validation = validatePatch(patch, allowedPaths);
  if (!validation.valid) {
    throw new ValidationError(
      `Patch 校验失败: ${validation.errors.join('; ')}`,
      { errors: validation.errors }
    );
  }

  for (const op of patch.operations) {
    const segments = parsePath(op.path);
    if (op.op === 'remove') {
      removePath(target, segments);
    } else {
      // add 与 replace 在本实现中均采用写入语义
      setPath(target, segments, op.value);
    }
  }
  return target;
}

// ===== 事实校验 =====

function round4(n) {
  return Number(n.toFixed(4));
}

/** 判断一个对象是否疑似 POI（有名称且带坐标，或位于 poi 路径下） */
function looksLikePOI(v, path) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  if (typeof v.name !== 'string') return false;
  const hasCoords = typeof v.lat === 'number' && typeof v.lng === 'number';
  const pathMentionsPoi = (path || '').toLowerCase().includes('poi');
  return hasCoords || pathMentionsPoi;
}

/**
 * 从一个值中递归收集所有疑似 POI 的对象
 */
function collectPOICandidates(value, basePath) {
  const out = [];
  const stack = [{ v: value, p: basePath || '' }];
  while (stack.length) {
    const { v, p } = stack.pop();
    if (!v || typeof v !== 'object') continue;
    if (looksLikePOI(v, p)) {
      out.push(v);
    }
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) stack.push({ v: v[i], p: `${p}/${i}` });
    } else {
      for (const k of Object.keys(v)) stack.push({ v: v[k], p: `${p}/${k}` });
    }
  }
  return out;
}

function verifyOnePOI(c, customVerify, poiNames, poiCoords) {
  // 优先使用数据源自定义校验
  if (customVerify) {
    try {
      if (customVerify(c)) return true;
    } catch (_) {
      // 自定义校验异常视为未通过
    }
  }
  // 按名称匹配
  if (c.name && poiNames.has(c.name)) return true;
  // 按坐标匹配（4 位小数容差）
  if (typeof c.lat === 'number' && typeof c.lng === 'number') {
    if (poiCoords.has(`${round4(c.lat)},${round4(c.lng)}`)) return true;
  }
  return false;
}

/**
 * 事实校验：检查 Agent 返回的 POI / 坐标是否存在于数据源
 *
 * 数据源 dataSource 支持以下形式（任选其一或组合）：
 *   - pois: Array<{ name, lat?, lng?, type?, zone? }>  已验证 POI 列表
 *   - getAllPOIs(): Array<...>                         延迟获取 POI 列表
 *   - verifyPOI(poi): boolean                          自定义校验函数
 *
 * @param {Object} patch
 * @param {Object} dataSource
 * @returns {{ valid: boolean, violations: Array, checked: number }}
 */
function factCheck(patch, dataSource) {
  const violations = [];

  // 无数据源 => 视为跳过事实校验（由调用方决定是否信任）
  if (!dataSource) {
    return { valid: true, violations, checked: 0 };
  }

  // 构建 POI 名称 / 坐标索引
  const poiNames = new Set();
  const poiCoords = new Set();
  let pois = [];
  if (Array.isArray(dataSource.pois)) {
    pois = dataSource.pois;
  } else if (typeof dataSource.getAllPOIs === 'function') {
    pois = dataSource.getAllPOIs() || [];
  }
  for (const p of pois) {
    if (p && typeof p.name === 'string') poiNames.add(p.name);
    if (p && typeof p.lat === 'number' && typeof p.lng === 'number') {
      poiCoords.add(`${round4(p.lat)},${round4(p.lng)}`);
    }
  }
  const customVerify = typeof dataSource.verifyPOI === 'function' ? dataSource.verifyPOI : null;

  let checked = 0;
  const ops = (patch && Array.isArray(patch.operations)) ? patch.operations : [];
  for (const op of ops) {
    if (!op || op.op === 'remove') continue;
    if (op.value === undefined) continue;

    // 收集该操作值中所有疑似 POI 并逐一核对
    const candidates = collectPOICandidates(op.value, op.path);
    for (const c of candidates) {
      checked++;
      const ok = verifyOnePOI(c, customVerify, poiNames, poiCoords);
      if (!ok) {
        violations.push({
          path: op.path,
          poi: c,
          reason: 'unverified_poi'
        });
      }
    }
  }

  return { valid: violations.length === 0, violations, checked };
}

module.exports = {
  PROTECTED_PATHS,
  parsePath,
  getPath,
  validatePatch,
  applyPatch,
  factCheck,
  // 以下导出主要用于测试
  isProtected,
  isAllowed,
  collectPOICandidates
};
