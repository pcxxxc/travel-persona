'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-trace-migration-'));
const databasePath = path.join(tempDir, 'trace.sqlite');
const db = new DatabaseSync(databasePath);
db.exec('CREATE TABLE tp_kv (namespace TEXT NOT NULL, item_key TEXT NOT NULL, value_json TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (namespace, item_key));');
db.prepare('INSERT INTO tp_kv(namespace, item_key, value_json, updated_at) VALUES (?, ?, ?, ?)').run(
  'travel.trips',
  'future_trip',
  JSON.stringify({
    tripId: 'future_trip',
    userId: 'migration_user',
    cities: ['beijing'],
    startDate: '2099-08-01',
    endDate: '2099-08-05',
    status: 'completed',
    planSnapshot: {}
  }),
  new Date().toISOString()
);
db.close();

const result = spawnSync(process.execPath, ['-e', [
  "const assert = require('assert');",
  "const trace = require('./src/services/journal/travelTrace');",
  "const trip = trace.getTravelTrace('migration_user')[0];",
  "assert.strictEqual(trip.status, 'planning');",
  "assert.strictEqual(trip.statusCorrectionReason, 'future-completion');"
].join('\n')], {
  cwd: path.join(__dirname, '..'),
  encoding: 'utf8',
  env: { ...process.env, NODE_ENV: 'production', TP_DATABASE_PATH: databasePath }
});

try {
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  console.log('Future-trip status migration passed.');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
