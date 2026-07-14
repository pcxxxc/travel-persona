'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const { getStore, resolveDatabasePath } = require('../src/services/storage/sqliteStore');

const resolvedDatabase = resolveDatabasePath();
const databasePath = resolvedDatabase === ':memory:' ? resolvedDatabase : path.resolve(resolvedDatabase);
const workspaceDatabase = path.resolve(__dirname, '..', '.data', 'travel-persona.sqlite');

assert.strictEqual(process.env.NODE_ENV, 'test');
assert.notStrictEqual(databasePath, workspaceDatabase, 'tests must never use the workspace database');
assert.ok(databasePath === ':memory:' || databasePath.startsWith(path.resolve(os.tmpdir())), 'test database must be in memory or in the operating-system temp directory');

const store = getStore();
store.set('test.isolation', 'probe', { isolated: true });
assert.deepStrictEqual(store.get('test.isolation', 'probe'), { isolated: true });

console.log('Test storage isolation passed.');
