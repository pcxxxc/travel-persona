'use strict';

const express = require('express');
const { INTERCITY_CONNECTIONS } = require('../../data/intercityConnections');
const { CITY_12306_MAPPING } = require('../../data/city12306Mapping');
const { Train12306Provider } = require('../../services/transport/train12306Provider');

const router = express.Router();
const trainProvider = new Train12306Provider();

/**
 * POST /api/v1/transport/cost-estimate
 * 查询两个城市之间的交通基线数据（铁路为主）
 */
router.post('/cost-estimate', async function (req, res) {
  const { from, to } = req.body || {};
  if (!from || !to) {
    return res.status(400).json({
      ok: false,
      error: '缺少 from 或 to 参数'
    });
  }

  // 若两城均在 32 城范围内，优先查询 12306 实时数据
  const isIn32Cities = CITY_12306_MAPPING[from] && CITY_12306_MAPPING[to];
  if (isIn32Cities) {
    try {
      const today = new Date().toISOString().slice(0, 10);
      const liveResult = await trainProvider.queryDirectTickets(from, to, today);
      if (liveResult && liveResult.tickets && liveResult.tickets.length > 0) {
        // 提取最低/最高票价与最短/最长时长
        const tickets = liveResult.tickets;
        const prices = tickets
          .flatMap(t => Object.values(t.prices || {}).filter(p => typeof p === 'number' && p > 0));
        const durations = tickets
          .map(t => {
            if (!t.duration) return null;
            const parts = String(t.duration).split(':');
            if (parts.length === 3) {
              return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
            }
            return null;
          })
          .filter(d => d !== null);

        return res.json({
          ok: true,
          available: true,
          from,
          to,
          mode: 'rail',
          durationHours: durations.length
            ? { min: Math.round(Math.min(...durations) * 10) / 10, max: Math.round(Math.max(...durations) * 10) / 10 }
            : { min: null, max: null },
          fareCny: prices.length
            ? { min: Math.round(Math.min(...prices)), max: Math.round(Math.max(...prices)) }
            : { min: null, max: null },
          transfers: 0,
          note: `12306 实时查询共 ${tickets.length} 个车次`,
          source: '12306-live',
          queriedAt: liveResult.queriedAt,
          requiresLiveCheck: false
        });
      }
    } catch (e) {
      console.warn(`[transport/cost-estimate] 12306 查询失败 (${from}-${to}): ${e.message}`);
      // 降级到静态数据
    }
  }

  // 查找匹配路线（双向）
  const matches = INTERCITY_CONNECTIONS.filter(function (c) {
    return (c.from === from && c.to === to) || (c.from === to && c.to === from);
  });

  if (matches.length === 0) {
    return res.json({
      ok: true,
      available: false,
      from,
      to,
      note: '暂无该路线的交通基线数据'
    });
  }

  // 取最优匹配（直达优先，然后最短时长）
  const best = matches.sort(function (a, b) {
    if (a.transfers !== b.transfers) return a.transfers - b.transfers;
    return a.durationHours.min - b.durationHours.min;
  })[0];

  res.json({
    ok: true,
    available: true,
    from,
    to,
    mode: best.mode,
    durationHours: best.durationHours,
    fareCny: best.fareCny,
    transfers: best.transfers,
    note: best.note,
    source: 'routeBaseline',
    verifiedAt: best.verifiedAt,
    requiresLiveCheck: best.requiresLiveCheck
  });
});

module.exports = router;
