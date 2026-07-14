'use strict';

const assert = require('assert');
const rights = require('../src/services/journal/dataRights');
const journal = require('../src/services/journal/journalService');
const persona = require('../src/services/journal/personaCalibration');

rights._reset();

const partialUser = 'evidence_partial_user';
const partial = journal.createEntry(partialUser, {
  type: 'review',
  content: '我不想赶路，愿意少去一站。'
});
journal.setAnalysisAuthorization(partial.id, true, partialUser);
const partialEvidence = journal.getEvidencePool(partialUser);
assert.strictEqual(partialEvidence[0].type, 'journalEntry');
assert.strictEqual(partialEvidence[0].reliability, 0.35);
assert.strictEqual(partialEvidence[0].reviewCompleteness, 'partial');
assert.strictEqual(persona.generateUpdateProposal(partialUser, partialEvidence).length, 0, '单条普通记录不得改变长期人格');

const planningUser = 'evidence_planning_user';
function addPlanningEntry(content) {
  const entry = journal.createEntry(planningUser, { type: 'planning', content });
  journal.setAnalysisAuthorization(entry.id, true, planningUser);
  return journal.getEvidencePool(planningUser).find(item => item.sourceEntryId === entry.id);
}
const firstPlanning = addPlanningEntry('我不想赶路，愿意少去一站。');
assert.strictEqual(firstPlanning.reliability, 0.4);
assert.strictEqual(persona.generateUpdateProposal(planningUser, [firstPlanning], {
  contextEvidence: journal.getEvidencePool(planningUser)
}).length, 0, '单条计划期取舍不得形成长期变化');
const secondPlanning = addPlanningEntry('这次还是不想赶路，宁愿少去几个地方。');
const repeatedPlanning = persona.generateUpdateProposal(planningUser, [secondPlanning], {
  contextEvidence: journal.getEvidencePool(planningUser)
});
assert.ok(repeatedPlanning.some(item => item.traitKey === 'pace'), '多次一致的低权重取舍可以形成待确认线索');

const reviewUser = 'evidence_complete_review_user';
const complete = journal.createEntry(reviewUser, {
  type: 'review',
  content: '我开心了，我出发了，我到了，我看见了。',
  reviewSnapshot: {
    worth: 'worth_it',
    values: ['connection'],
    deviations: ['longer_stays'],
    tripCompleted: true
  }
});
journal.setAnalysisAuthorization(complete.id, true, reviewUser);
const completeEvidence = journal.getEvidencePool(reviewUser);
assert.strictEqual(completeEvidence[0].type, 'tripReview');
assert.strictEqual(completeEvidence[0].reliability, 0.9);
assert.strictEqual(completeEvidence[0].reviewCompleteness, 'complete');
assert.strictEqual(completeEvidence[0].dimensionImpact.social.direction, 'positive');
assert.strictEqual(completeEvidence[0].dimensionImpact.pace.direction, 'negative');
assert.ok(persona.generateUpdateProposal(reviewUser, completeEvidence).length > 0, '完整复盘可单独形成待确认变化');

rights._reset();
console.log('Evidence tiering tests passed.');
