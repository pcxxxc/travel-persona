'use strict';

const express = require('express');
const { INTERCITY_CONNECTIONS } = require('../../data/intercityConnections');

const router = express.Router();

/**
 * POST /api/v1/transport/cost-estimate
 * 查询两个城市之间的交通基线数据（铁路为主）
 */
router.post('/cost-estimate', function (req, res) {
  const { from, to } = req.body || {};
  if (!from || !to) {
    return res.status(400).json({
      ok: false,
      error: '缺少 from 或 to 参数'
    });
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
