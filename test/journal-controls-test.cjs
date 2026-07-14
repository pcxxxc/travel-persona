'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const journal = require('../src/services/journal/journalService');
const persona = require('../src/services/journal/personaCalibration');
const rights = require('../src/services/journal/dataRights');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'public-app', 'app.js'), 'utf8');
const stylesSource = fs.readFileSync(path.join(root, 'public-app', 'styles.css'), 'utf8');

assert.match(appSource, /function toggleJournalAnalysis\(entry\)/);
assert.match(appSource, /function deleteJournalEntry\(entry\)/);
assert.match(appSource, /\/journals\/entries\/.*\/authorize/);
assert.match(appSource, /apiCall\('DELETE', '\/journals\/entries\/'/);
assert.match(appSource, /change\.explainedEntryId = null/);
assert.match(stylesSource, /\.journal-card__delete-confirm/);

rights._reset();
const userId = 'journal_controls_user';
const entry = journal.createEntry(userId, {
  type: 'review',
  reviewSnapshot: { worth: 'worth_it', values: ['arrived'], deviations: ['as_planned'], tripCompleted: true },
  content: '我不想赶路，愿意少去一站，换取完整停留。',
  sensitivityLevel: 'normal'
});

assert.strictEqual(journal.getEvidencePool(userId).length, 0, '默认不得进入证据池');
journal.setAnalysisAuthorization(entry.id, true, userId);
const evidence = journal.getEvidencePool(userId);
assert.strictEqual(evidence.length, 1, '主动授权后应进入证据池');

const proposals = persona.generateUpdateProposal(userId, evidence);
assert.ok(proposals.length > 0, '有效复盘可产生待确认变化');
journal.setAnalysisAuthorization(entry.id, false, userId);
persona.reconcilePendingProposals(userId, journal.getEvidencePool(userId).map(item => item.id));
assert.strictEqual(journal.getEvidencePool(userId).length, 0, '停止分析后应移除证据');
assert.strictEqual(persona.getPendingProposals(userId).length, 0, '失去依据的待确认变化应失效');

journal.deleteEntry(entry.id, userId);
assert.strictEqual(journal.getEntries(userId).length, 0, '确认删除后原文应移除');

rights._reset();
console.log('Journal controls tests passed.');
