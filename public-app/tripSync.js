(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TripSync = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function reconcileTrips(remoteTrips, localTrips) {
    var remote = Array.isArray(remoteTrips) ? remoteTrips : [];
    var local = Array.isArray(localTrips) ? localTrips : [];
    var localById = {};
    local.forEach(function (trip) {
      if (trip && trip.id) localById[trip.id] = trip;
    });

    var seen = {};
    var result = remote.map(function (trip) {
      seen[trip.id] = true;
      var localTrip = localById[trip.id];
      if (localTrip && localTrip.syncState === 'pending-update') {
        return Object.assign({}, localTrip, { syncState: 'pending-update' });
      }
      return Object.assign({}, trip, { syncState: 'synced' });
    });

    local.forEach(function (trip) {
      if (!trip || !trip.id || seen[trip.id]) return;
      if (trip.syncState === 'synced') return;
      result.push(Object.assign({}, trip, {
        syncState: trip.syncState === 'pending-create' ? 'pending-create' : 'local-only'
      }));
    });

    return result;
  }

  function getSyncCopy(state) {
    if (state === 'local-only') return {
      label: '仅此设备',
      title: '这条早期计划只保存在当前设备',
      description: '保存到当前旅格后，日期、实况和复盘才能稳定对账。',
      action: '保存到当前旅格'
    };
    if (state === 'pending-create') return {
      label: '等待同步',
      title: '这条计划还没有完成首次保存',
      description: '计划仍在当前设备，网络恢复后可以重新保存。',
      action: '重新保存'
    };
    if (state === 'pending-update') return {
      label: '有改动待同步',
      title: '这条计划有改动尚未同步',
      description: '当前设备保留了最新改动，重新同步前不会用旧版本覆盖。',
      action: '重试同步'
    };
    return null;
  }

  return { reconcileTrips: reconcileTrips, getSyncCopy: getSyncCopy };
});
