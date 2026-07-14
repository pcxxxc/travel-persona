'use strict';

const { restoreDatabaseBackup } = require('../src/services/ops/databaseBackup');

const backupPath = process.argv[2];
if (!backupPath || process.env.CONFIRM_DATABASE_RESTORE !== 'yes') {
  console.error('Stop the application, set CONFIRM_DATABASE_RESTORE=yes, then run: npm run restore:database -- <backup.sqlite>');
  process.exit(1);
}
try {
  const result = restoreDatabaseBackup(backupPath, { allowOverwrite: true });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Database restore failed: ${error.message}`);
  process.exit(1);
}
