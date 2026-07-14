'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const testFiles = process.argv.slice(2);

if (testFiles.length === 0) {
  console.error('Usage: node scripts/run-test-isolated.js <test-file> [...]');
  process.exit(1);
}

for (let index = 0; index < testFiles.length; index += 1) {
  const testFile = testFiles[index];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'travel-persona-test-'));
  const databasePath = path.join(tempDir, 'test.sqlite');
  const backupDir = path.join(tempDir, 'backups');
  const result = spawnSync(process.execPath, [path.resolve(root, testFile)], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TP_DATABASE_PATH: databasePath,
      TP_BACKUP_DIR: backupDir
    }
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}
