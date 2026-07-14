'use strict';

const assert = require('assert');
const { reconcileTrips, getSyncCopy } = require('../public-app/tripSync');

const remote = [
  { id: 'remote_kept', title: '服务端版本', updatedAt: '2026-07-01', syncState: 'synced' },
  { id: 'pending_update', title: '服务端旧版本', updatedAt: '2026-07-01' }
];
const local = [
  { id: 'remote_kept', title: '本地旧副本', updatedAt: '2026-07-12', syncState: 'synced' },
  { id: 'deleted_remote', title: '不应复活', syncState: 'synced' },
  { id: 'legacy_local', title: '旧版本本地计划' },
  { id: 'pending_create', title: '等待首次保存', syncState: 'pending-create' },
  { id: 'pending_update', title: '本地待同步改动', syncState: 'pending-update' }
];

const result = reconcileTrips(remote, local);
assert.strictEqual(result.find(item => item.id === 'remote_kept').title, '服务端版本');
assert.ok(!result.some(item => item.id === 'deleted_remote'), '服务端已删除的同步记录不得被本地副本复活');
assert.strictEqual(result.find(item => item.id === 'legacy_local').syncState, 'local-only');
assert.strictEqual(result.find(item => item.id === 'pending_create').syncState, 'pending-create');
assert.strictEqual(result.find(item => item.id === 'pending_update').title, '本地待同步改动');
assert.strictEqual(getSyncCopy('local-only').action, '保存到当前旅格');
assert.strictEqual(getSyncCopy('synced'), null);

console.log('Trip reconciliation tests passed.');
