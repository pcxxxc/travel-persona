'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const {
  createDatabaseBackup,
  verifyDatabaseBackup,
  restoreDatabaseBackup
} = require('../src/services/ops/databaseBackup');

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-persona-db-backup-'));
  try {
    const sourcePath = path.join(root, 'source.sqlite');
    const backupDir = path.join(root, 'backups');
    const source = new DatabaseSync(sourcePath);
    source.exec('CREATE TABLE tp_kv(namespace TEXT, item_key TEXT, value_json TEXT, updated_at TEXT);');
    source.prepare('INSERT INTO tp_kv VALUES (?, ?, ?, ?)').run('journal.entries', 'entry-1', '{"content":"private"}', new Date().toISOString());
    source.close();

    const created = await createDatabaseBackup({ sourcePath, backupDir, label: 'test', maxBackups: 5 });
    assert.ok(fs.existsSync(created.backupPath));
    assert.ok(fs.existsSync(created.manifestPath));
    assert.strictEqual(created.manifest.kvRows, 1);
    assert.strictEqual(created.manifest.metricRows, 0);
    assert.strictEqual(verifyDatabaseBackup(created.backupPath).valid, true);

    const corruptPath = path.join(backupDir, 'corrupt.sqlite');
    fs.copyFileSync(created.backupPath, corruptPath);
    fs.copyFileSync(created.manifestPath, `${corruptPath}.manifest.json`);
    fs.appendFileSync(corruptPath, 'corruption');
    assert.strictEqual(verifyDatabaseBackup(corruptPath).reason, 'checksum_mismatch');

    const restoredPath = path.join(root, 'restored.sqlite');
    const restored = restoreDatabaseBackup(created.backupPath, { targetPath: restoredPath });
    assert.strictEqual(restored.restored, true);
    const restoredDb = new DatabaseSync(restoredPath, { readOnly: true });
    assert.strictEqual(Number(restoredDb.prepare('SELECT COUNT(*) AS count FROM tp_kv').get().count), 1);
    restoredDb.close();

    assert.throws(
      () => restoreDatabaseBackup(created.backupPath, { targetPath: restoredPath }),
      /allowOverwrite/
    );
    const overwritten = restoreDatabaseBackup(created.backupPath, { targetPath: restoredPath, allowOverwrite: true });
    assert.ok(overwritten.previousDatabasePath && fs.existsSync(overwritten.previousDatabasePath));

    console.log('Real SQLite backup, verification and restore tests passed.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
