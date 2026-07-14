#!/usr/bin/env node
'use strict';

/**
 * 灾难恢复自动化演练脚本
 *
 * 演练流程：
 * 1. 创建测试数据库并写入初始数据
 * 2. 创建备份并验证完整性
 * 3. 写入新数据（模拟灾难后新增数据丢失场景）
 * 4. 恢复备份
 * 5. 验证新数据已消失（恢复到备份时的状态）
 * 6. 输出完整演练报告
 *
 * 用法：node scripts/disaster-recovery-test.js
 * 环境变量：
 *   TP_DR_TEST_DIR — 演练临时目录（默认 .data/dr-test-{timestamp}）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync, backup } = require('node:sqlite');

// ========== 工具函数 ==========

const PASSED = 'PASS';
const FAILED = 'FAIL';
const WARN = 'WARN';

function logStep(step, status, message) {
  const icon = status === PASSED ? '[PASS]' : status === FAILED ? '[FAIL]' : '[WARN]';
  console.log(`  ${icon} ${step}: ${message}`);
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
    return { valid: quickCheck.length === 1 && quickCheck[0] === 'ok', tables, kvRows };
  } finally {
    db.close();
  }
}

async function createBackup(sourcePath, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const backupPath = path.join(backupDir, `dr-test-${timestamp}.sqlite`);
  const sourceDb = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    await backup(sourceDb, backupPath);
  } finally {
    sourceDb.close();
  }
  return backupPath;
}

function restoreBackup(backupPath, targetPath) {
  fs.copyFileSync(backupPath, targetPath);
}

function createTestDatabase(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    db.prepare(`
      CREATE TABLE IF NOT EXISTS tp_kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS tp_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        value REAL NOT NULL,
        recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `).run();
    // 插入初始数据
    db.prepare("INSERT INTO tp_kv (key, value) VALUES (?, ?)").run('city:chengdu', JSON.stringify({ name: '成都', traitVector: { nature: 0.8 } }));
    db.prepare("INSERT INTO tp_kv (key, value) VALUES (?, ?)").run('city:beijing', JSON.stringify({ name: '北京', traitVector: { culture: 0.9 } }));
    db.prepare("INSERT INTO tp_metrics (name, value) VALUES (?, ?)").run('request_count', 42);
  } finally {
    db.close();
  }
}

function getKvValue(dbPath, key) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const row = db.prepare("SELECT value FROM tp_kv WHERE key = ?").get(key);
    return row ? row.value : null;
  } finally {
    db.close();
  }
}

function getKvCount(dbPath) {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const result = db.prepare('SELECT COUNT(*) AS count FROM tp_kv').get();
    return result.count;
  } finally {
    db.close();
  }
}

// ========== 演练主体 ==========

async function runDisasterRecoveryTest() {
  const startTime = Date.now();
  const testId = crypto.randomBytes(4).toString('hex');
  const testDir = path.resolve(process.env.TP_DR_TEST_DIR || `.data/dr-test-${Date.now()}`);
  const backupDir = path.join(testDir, 'backups');

  console.log('');
  console.log('================================================');
  console.log('  灾难恢复演练 (Disaster Recovery Test)');
  console.log(`  演练ID: ${testId}`);
  console.log(`  临时目录: ${testDir}`);
  console.log('================================================');
  console.log('');

  const steps = [];
  let allPassed = true;
  const cleanupPaths = [];

  try {
    // ---- 步骤 1: 创建测试数据库 ----
    console.log('--- 步骤 1: 创建测试数据库 ---');
    const dbPath = path.join(testDir, 'travel-persona.sqlite');
    fs.mkdirSync(testDir, { recursive: true });
    createTestDatabase(dbPath);
    cleanupPaths.push(testDir);

    const initialKvCount = getKvCount(dbPath);
    if (initialKvCount === 2) {
      logStep('create-db', PASSED, `初始数据库创建成功，包含 ${initialKvCount} 条 KV 记录`);
      steps.push({ step: 'create-db', status: PASSED, detail: `${initialKvCount} 条 KV 记录` });
    } else {
      logStep('create-db', FAILED, `初始 KV 记录数异常: ${initialKvCount}`);
      steps.push({ step: 'create-db', status: FAILED, detail: `期望 2 条，实际 ${initialKvCount} 条` });
      allPassed = false;
    }

    // ---- 步骤 2: 创建备份并验证完整性 ----
    console.log('--- 步骤 2: 创建备份并验证完整性 ---');
    const backupPath = await createBackup(dbPath, backupDir);
    const inspection = inspectDatabase(backupPath);
    const backupSha = sha256File(backupPath);

    if (inspection.valid && inspection.kvRows === 2) {
      logStep('backup-create', PASSED, `备份创建成功，SHA256: ${backupSha.slice(0, 16)}...`);
      steps.push({ step: 'backup-create', status: PASSED, detail: backupSha });
    } else {
      logStep('backup-create', FAILED, `备份验证失败: quick_check=${inspection.valid}, kvRows=${inspection.kvRows}`);
      steps.push({ step: 'backup-create', status: FAILED, detail: JSON.stringify(inspection) });
      allPassed = false;
    }

    // ---- 步骤 3: 写入新数据（模拟灾难后的新增数据） ----
    console.log('--- 步骤 3: 写入新数据 ---');
    const newKey = `dr-test-${testId}`;
    const newValue = JSON.stringify({ testData: true, timestamp: new Date().toISOString() });
    const db2 = new DatabaseSync(dbPath);
    try {
      db2.prepare("INSERT INTO tp_kv (key, value) VALUES (?, ?)").run(newKey, newValue);
      db2.prepare("INSERT INTO tp_metrics (name, value) VALUES (?, ?)").run('dr_test_metric', 99);
    } finally {
      db2.close();
    }

    const afterNewKvCount = getKvCount(dbPath);
    const newKeyValue = getKvValue(dbPath, newKey);
    if (afterNewKvCount === 3 && newKeyValue === newValue) {
      logStep('write-new-data', PASSED, `新数据写入成功，KV 总数: ${afterNewKvCount}`);
      steps.push({ step: 'write-new-data', status: PASSED, detail: `KV 总数 ${afterNewKvCount}` });
    } else {
      logStep('write-new-data', FAILED, `新数据写入异常: count=${afterNewKvCount}, found=${!!newKeyValue}`);
      steps.push({ step: 'write-new-data', status: FAILED, detail: `count=${afterNewKvCount}` });
      allPassed = false;
    }

    // ---- 步骤 4: 恢复备份 ----
    console.log('--- 步骤 4: 恢复备份 ---');
    restoreBackup(backupPath, dbPath);

    const restoredInspection = inspectDatabase(dbPath);
    const restoredSha = sha256File(dbPath);
    if (restoredInspection.valid && restoredSha === backupSha) {
      logStep('restore', PASSED, `备份恢复成功，SHA256 一致: ${restoredSha.slice(0, 16)}...`);
      steps.push({ step: 'restore', status: PASSED, detail: 'SHA256 校验通过' });
    } else {
      logStep('restore', FAILED, `恢复后 SHA256 不匹配或数据库损坏`);
      steps.push({ step: 'restore', status: FAILED, detail: `backup=${backupSha.slice(0, 16)}, restored=${restoredSha.slice(0, 16)}` });
      allPassed = false;
    }

    // ---- 步骤 5: 确认新数据不存在 ----
    console.log('--- 步骤 5: 确认新数据已消除 ---');
    const finalKvCount = getKvCount(dbPath);
    const finalNewValue = getKvValue(dbPath, newKey);

    if (finalKvCount === 2 && finalNewValue === null) {
      logStep('verify-data-loss', PASSED, `恢复后新数据已消除，KV 总数回归 ${finalKvCount}`);
      steps.push({ step: 'verify-data-loss', status: PASSED, detail: `KV 总数 ${finalKvCount}，测试数据已消除` });
    } else {
      logStep('verify-data-loss', FAILED, `恢复验证失败: count=${finalKvCount}, testKey exists=${!!finalNewValue}`);
      steps.push({ step: 'verify-data-loss', status: FAILED, detail: `count=${finalKvCount}, testKey=${!!finalNewValue}` });
      allPassed = false;
    }

  } catch (error) {
    logStep('exception', FAILED, `演练过程中发生异常: ${error.message}`);
    steps.push({ step: 'exception', status: FAILED, detail: error.stack });
    allPassed = false;
  } finally {
    // 清理临时文件
    console.log('--- 清理临时文件 ---');
    cleanupPaths.forEach(p => {
      try {
        fs.rmSync(p, { recursive: true, force: true });
        logStep('cleanup', PASSED, `已清理: ${p}`);
      } catch (e) {
        logStep('cleanup', WARN, `清理失败: ${p} (${e.message})`);
      }
    });
  }

  // ========== 输出报告 ==========
  const elapsed = Date.now() - startTime;
  const passedCount = steps.filter(s => s.status === PASSED).length;
  const failedCount = steps.filter(s => s.status === FAILED).length;

  console.log('');
  console.log('================================================');
  console.log('  演练报告 (Disaster Recovery Test Report)');
  console.log('================================================');
  console.log(`  演练ID:    ${testId}`);
  console.log(`  开始时间:  ${new Date(startTime).toISOString()}`);
  console.log(`  耗时:      ${elapsed}ms`);
  console.log(`  结果:      ${allPassed ? 'ALL PASSED' : 'HAS FAILURES'}`);
  console.log(`  通过步骤:  ${passedCount}/${steps.length}`);
  console.log('  步骤明细:');
  steps.forEach(s => {
    console.log(`    [${s.status}] ${s.step}: ${s.detail}`);
  });
  console.log('================================================');
  console.log('');

  const report = {
    testId,
    startTime: new Date(startTime).toISOString(),
    elapsed,
    overallResult: allPassed ? 'passed' : 'failed',
    steps,
    summary: {
      total: steps.length,
      passed: passedCount,
      failed: failedCount
    }
  };

  // 输出 JSON 报告到标准输出（最后一行）
  console.log('--- JSON REPORT ---');
  console.log(JSON.stringify(report, null, 2));

  process.exit(allPassed ? 0 : 1);
}

runDisasterRecoveryTest().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(2);
});
