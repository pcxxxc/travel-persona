'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const databasePath = path.join(os.tmpdir(), 'travel-persona-persistence-' + process.pid + '.sqlite');
const userId = 'persistence_user_' + process.pid;

function runChild(label, lines) {
  const result = spawnSync(process.execPath, ['-e', lines.join('\n')], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      TP_STORAGE_MODE: 'sqlite',
      TP_DATABASE_PATH: databasePath,
      TP_TEST_USER_ID: userId
    }
  });

  if (result.status !== 0) {
    throw new Error(
      label + ' failed\nSTDOUT:\n' + result.stdout + '\nSTDERR:\n' + result.stderr
    );
  }
}

try {
  runChild('create persistent data', [
    "const assert = require('assert');",
    "const journal = require('./src/services/journal/journalService');",
    "const persona = require('./src/services/journal/personaCalibration');",
    "const trace = require('./src/services/journal/travelTrace');",
    "const rights = require('./src/services/journal/dataRights');",
    "const userId = process.env.TP_TEST_USER_ID;",
    "const entry = journal.createEntry(userId, { type: 'review', tripId: 'trip_persist', content: 'I felt restored by a quiet route.', mood: 'restore', reviewSnapshot: { worth: 'worth_it', values: ['arrived'], deviations: ['as_planned'], tripCompleted: true } });",
    "journal.setAnalysisAuthorization(entry.id, true);",
    "const evidence = journal.getEvidencePool(userId);",
    "assert.strictEqual(evidence.length, 1);",
    "const proposals = persona.generateUpdateProposal(userId, evidence);",
    "assert.ok(proposals.length > 0);",
    "persona.acceptProposal(proposals[0].id);",
    "trace.recordTrip(userId, { tripId: 'trip_persist', cities: ['maoming', 'beijing'], startDate: '2024-09-01', endDate: '2024-09-16', status: 'completed' });",
    "rights.updatePrivacySettings(userId, { analysisConsent: true, photoAnalysisEnabled: true });"
  ]);

  runChild('restore persistent data', [
    "const assert = require('assert');",
    "const journal = require('./src/services/journal/journalService');",
    "const persona = require('./src/services/journal/personaCalibration');",
    "const trace = require('./src/services/journal/travelTrace');",
    "const rights = require('./src/services/journal/dataRights');",
    "const userId = process.env.TP_TEST_USER_ID;",
    "assert.strictEqual(journal.getEntries(userId).length, 1);",
    "assert.strictEqual(journal.getEvidencePool(userId).length, 1);",
    "assert.ok(persona.getProposals(userId).some(item => item.status === 'accepted'));",
    "assert.strictEqual(trace.getTravelTrace(userId).length, 1);",
    "assert.strictEqual(rights.getPrivacySettings(userId).analysisConsent, true);",
    "assert.strictEqual(rights.getPrivacySettings(userId).photoAnalysisEnabled, true);"
  ]);

  runChild('delete persistent data', [
    "const assert = require('assert');",
    "const journal = require('./src/services/journal/journalService');",
    "const persona = require('./src/services/journal/personaCalibration');",
    "const trace = require('./src/services/journal/travelTrace');",
    "const rights = require('./src/services/journal/dataRights');",
    "const userId = process.env.TP_TEST_USER_ID;",
    "const result = rights.deleteUserData(userId);",
    "assert.strictEqual(result.deleted, true);",
    "assert.strictEqual(journal.getEntries(userId).length, 0);",
    "assert.strictEqual(journal.getEvidencePool(userId).length, 0);",
    "assert.strictEqual(persona.getProposals(userId).length, 0);",
    "assert.strictEqual(trace.getTravelTrace(userId).length, 0);",
    "assert.ok(rights.getDeletionMarker(userId));"
  ]);

  runChild('verify deletion survives restart', [
    "const assert = require('assert');",
    "const journal = require('./src/services/journal/journalService');",
    "const persona = require('./src/services/journal/personaCalibration');",
    "const trace = require('./src/services/journal/travelTrace');",
    "const rights = require('./src/services/journal/dataRights');",
    "const userId = process.env.TP_TEST_USER_ID;",
    "assert.strictEqual(journal.getEntries(userId).length, 0);",
    "assert.strictEqual(persona.getProposals(userId).length, 0);",
    "assert.strictEqual(trace.getTravelTrace(userId).length, 0);",
    "assert.ok(rights.getDeletionMarker(userId));"
  ]);

  console.log('Persistence restart and deletion tests passed.');
} finally {
  for (const suffix of ['', '-wal', '-shm']) {
    fs.rmSync(databasePath + suffix, { force: true });
  }
}
