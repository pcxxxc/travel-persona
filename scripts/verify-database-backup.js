'use strict';

const { verifyDatabaseBackup } = require('../src/services/ops/databaseBackup');

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: npm run verify:backup -- <backup.sqlite>');
  process.exit(1);
}
const result = verifyDatabaseBackup(backupPath);
console.log(JSON.stringify(result, null, 2));
if (!result.valid) process.exit(1);
