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
    // 中转推断：通过枢纽城市做一次中转拼接
    var hubs = ['北京', '上海', '广州', '武汉', '成都', '西安', '长沙', '南京', '郑州', '重庆'];
    var bestTransfer = null;
    for (var i = 0; i < hubs.length; i++) {
      if (hubs[i] === from || hubs[i] === to) continue;
      var leg1 = INTERCITY_CONNECTIONS.find(function (c) {
        return (c.from === from && c.to === hubs[i]) || (c.from === hubs[i] && c.to === from);
      });
      var leg2 = INTERCITY_CONNECTIONS.find(function (c) {
        return (c.from === hubs[i] && c.to === to) || (c.from === to && c.to === hubs[i]);
      });
      if (leg1 && leg2) {
        var totalMin = leg1.durationHours.min + leg2.durationHours.min + 0.5;
        var totalMax = leg1.durationHours.max + leg2.durationHours.max + 1;
        var totalFareMin = leg1.fareCny.min + leg2.fareCny.min;
        var totalFareMax = leg1.fareCny.max + leg2.fareCny.max;
        if (!bestTransfer || totalMin < bestTransfer.durationHours.min) {
          bestTransfer = {
            mode: 'rail',
            durationHours: { min: Math.round(totalMin * 10) / 10, max: Math.round(totalMax * 10) / 10 },
            fareCny: { min: totalFareMin, max: totalFareMax },
            transfers: 1,
            note: '经' + hubs[i] + '中转，换乘时间未计入，请预留 30-60 分钟',
            source: 'routeBaseline-transfer',
            verifiedAt: VERIFIED_AT,
            requiresLiveCheck: true
          };
        }
      }
    }
    if (bestTransfer) {
      return res.json({
        ok: true, available: true, from, to,
        mode: bestTransfer.mode,
        durationHours: bestTransfer.durationHours,
        fareCny: bestTransfer.fareCny,
        transfers: bestTransfer.transfers,
        note: bestTransfer.note,
        source: bestTransfer.source,
        verifiedAt: bestTransfer.verifiedAt,
        requiresLiveCheck: bestTransfer.requiresLiveCheck
      });
    }
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
