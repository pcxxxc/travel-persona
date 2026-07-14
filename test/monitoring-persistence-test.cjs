'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const databasePath = path.join(os.tmpdir(), `travel-persona-monitoring-${process.pid}.sqlite`);

function run(label, source) {
  const result = spawnSync(process.execPath, ['-e', source], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      TP_STORAGE_MODE: 'sqlite',
      TP_DATABASE_PATH: databasePath,
      TP_METRIC_RETENTION_DAYS: '7'
    }
  });
  if (result.status !== 0) {
    throw new Error(`${label} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
}

try {
  run('write anonymous metrics', `
    const monitoring = require('./src/services/ops/monitoring');
    monitoring.resetMetrics();
    monitoring.recordMetric('client_event_count', 1, {
      event: 'map_fallback', surface: 'map', code: 'SNAPSHOT_USED', mode: 'snapshot',
      durationBucket: '500_1500', userId: 'forbidden', city: 'forbidden'
    });
    if (monitoring.getMonitoringStorageStatus().mode !== 'sqlite') process.exit(2);
  `);

  run('read metrics after restart', `
    const assert = require('assert');
    const monitoring = require('./src/services/ops/monitoring');
    const metric = monitoring.getMetrics('client_event_count');
    assert.strictEqual(metric.count, 1);
    assert.strictEqual(metric.points[0].tags.event, 'map_fallback');
    assert.ok(!('userId' in metric.points[0].tags));
    assert.ok(!('city' in metric.points[0].tags));
    assert.strictEqual(monitoring.getClientEventSummary().last24h.total, 1);
  `);

  run('prune expired metrics', `
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(process.env.TP_DATABASE_PATH);
    db.prepare('INSERT INTO tp_metrics(metric_name, metric_value, tags_json, recorded_at) VALUES (?, ?, ?, ?)')
      .run('client_event_count', 1, '{}', Date.now() - 8 * 24 * 60 * 60 * 1000);
    db.close();
    const monitoring = require('./src/services/ops/monitoring');
    monitoring.recordMetric('client_event_count', 1, {
      event: 'plan_completed', surface: 'plan', code: 'SUCCESS', mode: 'local', durationBucket: 'lt_500'
    });
    const all = monitoring.getMetrics('client_event_count');
    if (all.count !== 2) process.exit(3);
  `);

  console.log('Monitoring persistence and retention tests passed.');
} finally {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(databasePath + suffix, { force: true });
}
