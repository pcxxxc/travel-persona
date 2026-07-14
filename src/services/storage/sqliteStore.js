'use strict';

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

let singleton = null;

function isTestProcess() {
  return process.env.NODE_ENV === 'test'
    || process.env.TP_STORAGE_MODE === 'memory'
    || process.argv.some(arg => /(^|[\\/])test([\\/]|$)|\.test\.|test\.cjs$/i.test(arg));
}

function resolveDatabasePath() {
  if (isTestProcess()) return ':memory:';
  if (process.env.TP_DATABASE_PATH) return path.resolve(process.env.TP_DATABASE_PATH);
  return path.join(__dirname, '..', '..', '..', '.data', 'travel-persona.sqlite');
}

function serialize(value) {
  return JSON.stringify(value, (key, item) => {
    if (item instanceof Set) return { __tpType: 'Set', values: [...item] };
    return item;
  });
}

function deserialize(raw) {
  return JSON.parse(raw, (key, item) => {
    if (item && item.__tpType === 'Set' && Array.isArray(item.values)) {
      return new Set(item.values);
    }
    return item;
  });
}

class SqliteStore {
  constructor(databasePath = resolveDatabasePath()) {
    this.databasePath = databasePath;
    if (databasePath !== ':memory:') {
      fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    }
    this.db = new DatabaseSync(databasePath);
    this.db.exec(
      'PRAGMA journal_mode = WAL;' +
      'PRAGMA synchronous = NORMAL;' +
      'CREATE TABLE IF NOT EXISTS tp_kv (' +
      'namespace TEXT NOT NULL,' +
      'item_key TEXT NOT NULL,' +
      'value_json TEXT NOT NULL,' +
      'updated_at TEXT NOT NULL,' +
      'PRIMARY KEY (namespace, item_key)' +
      ');' +
      'CREATE TABLE IF NOT EXISTS tp_metrics (' +
      'id INTEGER PRIMARY KEY AUTOINCREMENT,' +
      'metric_name TEXT NOT NULL,' +
      'metric_value REAL NOT NULL,' +
      'tags_json TEXT NOT NULL,' +
      'recorded_at INTEGER NOT NULL' +
      ');' +
      'CREATE INDEX IF NOT EXISTS idx_tp_metrics_name_time ' +
      'ON tp_metrics(metric_name, recorded_at);'
    );
    this.readStatement = this.db.prepare(
      'SELECT value_json FROM tp_kv WHERE namespace = ? AND item_key = ?'
    );
    this.listStatement = this.db.prepare(
      'SELECT item_key, value_json FROM tp_kv WHERE namespace = ? ORDER BY item_key'
    );
    this.writeStatement = this.db.prepare(
      'INSERT INTO tp_kv(namespace, item_key, value_json, updated_at) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(namespace, item_key) DO UPDATE SET ' +
      'value_json = excluded.value_json, updated_at = excluded.updated_at'
    );
    this.deleteStatement = this.db.prepare(
      'DELETE FROM tp_kv WHERE namespace = ? AND item_key = ?'
    );
    this.clearStatement = this.db.prepare(
      'DELETE FROM tp_kv WHERE namespace = ?'
    );
    this.appendMetricStatement = this.db.prepare(
      'INSERT INTO tp_metrics(metric_name, metric_value, tags_json, recorded_at) VALUES (?, ?, ?, ?)'
    );
    this.listMetricStatement = this.db.prepare(
      'SELECT metric_value, tags_json, recorded_at FROM tp_metrics ' +
      'WHERE metric_name = ? AND recorded_at >= ? AND recorded_at <= ? ' +
      'ORDER BY recorded_at, id'
    );
    this.trimMetricStatement = this.db.prepare(
      'DELETE FROM tp_metrics WHERE metric_name = ? AND id NOT IN (' +
      'SELECT id FROM tp_metrics WHERE metric_name = ? ORDER BY recorded_at DESC, id DESC LIMIT ?' +
      ')'
    );
    this.pruneMetricsStatement = this.db.prepare(
      'DELETE FROM tp_metrics WHERE recorded_at < ?'
    );
    this.clearMetricsStatement = this.db.prepare('DELETE FROM tp_metrics');
  }

  get(namespace, key) {
    const row = this.readStatement.get(namespace, String(key));
    return row ? deserialize(row.value_json) : null;
  }

  list(namespace) {
    return this.listStatement.all(namespace).map(row => ({
      key: row.item_key,
      value: deserialize(row.value_json)
    }));
  }

  set(namespace, key, value) {
    this.writeStatement.run(namespace, String(key), serialize(value), new Date().toISOString());
    return value;
  }

  delete(namespace, key) {
    return this.deleteStatement.run(namespace, String(key)).changes > 0;
  }

  clear(namespace) {
    this.clearStatement.run(namespace);
  }

  appendMetric(name, value, tags, timestamp, maxPoints = 10000) {
    this.appendMetricStatement.run(String(name), Number(value), serialize(tags || {}), Number(timestamp));
    this.trimMetricStatement.run(String(name), String(name), Number(maxPoints));
  }

  listMetric(name, start = 0, end = Number.MAX_SAFE_INTEGER) {
    return this.listMetricStatement.all(String(name), Number(start), Number(end)).map(row => ({
      value: Number(row.metric_value),
      tags: deserialize(row.tags_json),
      timestamp: Number(row.recorded_at)
    }));
  }

  pruneMetrics(beforeTimestamp) {
    return Number(this.pruneMetricsStatement.run(Number(beforeTimestamp)).changes || 0);
  }

  clearMetrics() {
    this.clearMetricsStatement.run();
  }

  close() {
    this.db.close();
  }
}

function getStore() {
  if (!singleton) singleton = new SqliteStore();
  return singleton;
}

function resetStoreForTests() {
  if (singleton) singleton.close();
  singleton = null;
}

module.exports = {
  SqliteStore,
  getStore,
  resolveDatabasePath,
  resetStoreForTests
};
