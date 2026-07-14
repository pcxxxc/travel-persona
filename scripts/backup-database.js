'use strict';

const { createDatabaseBackup } = require('../src/services/ops/databaseBackup');

createDatabaseBackup({ label: process.argv[2] || 'manual' })
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(error => {
    console.error(`Database backup failed: ${error.message}`);
    process.exit(1);
  });
