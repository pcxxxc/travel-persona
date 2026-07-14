'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { DatabaseSync, backup } = require('node:sqlite');
const { resolveDatabasePath } = require('../storage/sqliteStore');

function resolveBackupDirectory() {
  return path.resolve(process.env.TP_BACKUP_DIR || '.backups');
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function inspectDatabase(filePath) {
  const db = new DatabaseSync(filePath, { readOnly: true });
  try {
    const quickCheck = db.prepare('PRAGMA quick_check').all().map(row => Object.values(row)[0]);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(row => row.name);
    const kvRows = tables.includes('tp_kv') ? Number(db.prepare('SELECT COUNT(*) AS count FROM tp_kv').get().count) : 0;
    const metricRows = tables.includes('tp_metrics') ? Number(db.prepare('SELECT COUNT(*) AS count FROM tp_metrics').get().count) : 0;
    return { valid: quickCheck.length === 1 && quickCheck[0] === 'ok', quickCheck, tables, kvRows, metricRows };
  } finally {
    db.close();
  }
}

function manifestPathFor(backupPath) {
  return `${backupPath}.manifest.json`;
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

async function createDatabaseBackup(options = {}) {
  const sourcePath = path.resolve(options.sourcePath || resolveDatabasePath());
  const backupDir = path.resolve(options.backupDir || resolveBackupDirectory());
  if (sourcePath === ':memory:' || !fs.existsSync(sourcePath)) throw new Error(`Database file does not exist: ${sourcePath}`);
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const label = String(options.label || 'scheduled').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'scheduled';
  const backupPath = path.join(backupDir, `travel-persona-${timestamp}-${label}.sqlite`);
  const sourceDb = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(sourceDb, backupPath);
  } finally {
    sourceDb.close();
  }

  const inspection = inspectDatabase(backupPath);
  if (!inspection.valid) throw new Error('SQLite quick_check failed after backup');
  const stat = fs.statSync(backupPath);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceFile: path.basename(sourcePath),
    backupFile: path.basename(backupPath),
    sizeBytes: stat.size,
    sha256: sha256File(backupPath),
    quickCheck: inspection.quickCheck,
    tables: inspection.tables,
    kvRows: inspection.kvRows,
    metricRows: inspection.metricRows
  };
  writeJsonAtomic(manifestPathFor(backupPath), manifest);
  pruneDatabaseBackups({ backupDir, retentionDays: options.retentionDays, maxBackups: options.maxBackups });
  return { backupPath, manifestPath: manifestPathFor(backupPath), manifest };
}

function verifyDatabaseBackup(backupPath) {
  const resolved = path.resolve(backupPath);
  const manifestPath = manifestPathFor(resolved);
  if (!fs.existsSync(resolved) || !fs.existsSync(manifestPath)) {
    return { valid: false, reason: 'backup_or_manifest_missing', backupPath: resolved };
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const actualSha256 = sha256File(resolved);
    if (actualSha256 !== manifest.sha256) {
      return { valid: false, reason: 'checksum_mismatch', backupPath: resolved, expectedSha256: manifest.sha256, actualSha256 };
    }
    const inspection = inspectDatabase(resolved);
    return { valid: inspection.valid, reason: inspection.valid ? null : 'sqlite_quick_check_failed', backupPath: resolved, manifest, inspection };
  } catch (error) {
    return { valid: false, reason: 'verification_error', backupPath: resolved, error: error.message };
  }
}

function restoreDatabaseBackup(backupPath, options = {}) {
  const verification = verifyDatabaseBackup(backupPath);
  if (!verification.valid) throw new Error(`Backup verification failed: ${verification.reason}`);
  const targetPath = path.resolve(options.targetPath || resolveDatabasePath());
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (fs.existsSync(targetPath) && options.allowOverwrite !== true) {
    throw new Error('Target database exists; set allowOverwrite only after stopping the application');
  }
  const tempPath = `${targetPath}.restore-${process.pid}.tmp`;
  fs.copyFileSync(path.resolve(backupPath), tempPath);
  const tempInspection = inspectDatabase(tempPath);
  if (!tempInspection.valid) {
    fs.rmSync(tempPath, { force: true });
    throw new Error('Restored temporary database failed SQLite quick_check');
  }

  let previousDatabasePath = null;
  if (fs.existsSync(targetPath)) {
    const suffix = new Date().toISOString().replace(/[-:.]/g, '');
    previousDatabasePath = `${targetPath}.pre-restore-${suffix}`;
    fs.renameSync(targetPath, previousDatabasePath);
    for (const sidecar of [`${targetPath}-wal`, `${targetPath}-shm`]) {
      if (fs.existsSync(sidecar)) fs.rmSync(sidecar, { force: true });
    }
  }
  fs.renameSync(tempPath, targetPath);
  return { restored: true, targetPath, previousDatabasePath, inspection: tempInspection };
}

function pruneDatabaseBackups(options = {}) {
  const backupDir = path.resolve(options.backupDir || resolveBackupDirectory());
  if (!fs.existsSync(backupDir)) return { removed: [] };
  const retentionDays = Math.max(Number(options.retentionDays) || Number(process.env.TP_BACKUP_RETENTION_DAYS) || 30, 1);
  const maxBackups = Math.max(Number(options.maxBackups) || Number(process.env.TP_BACKUP_MAX_FILES) || 30, 1);
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(backupDir)
    .filter(name => /^travel-persona-.*\.sqlite$/.test(name))
    .map(name => ({ path: path.join(backupDir, name), mtimeMs: fs.statSync(path.join(backupDir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  const removed = [];
  files.forEach((file, index) => {
    if (file.mtimeMs >= cutoff && index < maxBackups) return;
    fs.rmSync(file.path, { force: true });
    fs.rmSync(manifestPathFor(file.path), { force: true });
    removed.push(file.path);
  });
  return { removed };
}

function getBackupReadiness() {
  const databasePath = resolveDatabasePath();
  const backupDir = resolveBackupDirectory();
  try {
    fs.mkdirSync(backupDir, { recursive: true });
    fs.accessSync(backupDir, fs.constants.R_OK | fs.constants.W_OK);
    return { status: fs.existsSync(databasePath) ? 'ready' : 'database-missing', databasePath, backupDir };
  } catch (error) {
    return { status: 'unavailable', databasePath, backupDir, error: error.message };
  }
}

module.exports = {
  createDatabaseBackup,
  verifyDatabaseBackup,
  restoreDatabaseBackup,
  pruneDatabaseBackups,
  getBackupReadiness,
  resolveBackupDirectory,
  sha256File
};
