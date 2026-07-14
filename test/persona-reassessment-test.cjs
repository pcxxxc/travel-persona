'use strict';

const assert = require('assert');
const rights = require('../src/services/journal/dataRights');
const persona = require('../src/services/journal/personaCalibration');
const { buildGrowthTimeline } = require('../src/services/journal/growthTimeline');

rights._reset();
const userId = 'persona_reassessment_user';
const proposals = persona.generateUpdateProposal(userId, [{
  id: 'reassessment_seed_evidence',
  type: 'tripReview',
  reliability: 0.9,
  dimensionImpact: {
    transit: { traitKey: 'transit', direction: 'positive', magnitude: 0.08 }
  }
}]);
const seed = proposals.find(item => item.traitKey === 'transit');
assert.ok(seed, '应先形成一个可确认的长期维度');
persona.acceptProposal(seed.id, userId);

const profile = persona.getOrCreateProfile(userId);
const originalMean = profile.traits.transit.mean;
const originalConfidence = profile.traits.transit.confidence;
const reconfirmed = persona.reassessTrait(userId, 'transit', { response: 'still_true' });
assert.strictEqual(reconfirmed.proposal, null, '仍然准确不应产生数值变化提案');
assert.strictEqual(reconfirmed.profile.traits.transit.mean, originalMean);
assert.ok(reconfirmed.profile.traits.transit.confidence >= originalConfidence);
assert.strictEqual(reconfirmed.reassessment.status, 'confirmed');

const tripSpecific = persona.reassessTrait(userId, 'transit', { response: 'trip_specific' });
assert.ok(tripSpecific.proposal, '当次状态应形成待确认调整');
assert.strictEqual(tripSpecific.proposal.proposedValue, 0.5);
assert.strictEqual(tripSpecific.proposal.sourceType, 'userReassessment');
persona.reconcilePendingProposals(userId, []);
assert.ok(persona.getPendingProposals(userId).some(item => item.id === tripSpecific.proposal.id), '主动复核不依赖证据池存活');
const competingEvidence = persona.generateUpdateProposal(userId, [{
  id: 'later_automatic_evidence',
  type: 'tripReview',
  reliability: 0.9,
  dimensionImpact: {
    transit: { traitKey: 'transit', direction: 'positive', magnitude: 0.08 }
  }
}]);
assert.ok(!competingEvidence.some(item => item.traitKey === 'transit'), '新的自动证据不得覆盖尚未处理的主动复核');
assert.ok(persona.getPendingProposals(userId).some(item => item.id === tripSpecific.proposal.id));
persona.rejectProposal(tripSpecific.proposal.id, '保持原判断', userId);
assert.strictEqual(profile.reassessmentHistory.find(item => item.id === tripSpecific.reassessment.id).status, 'rejected');

const changed = persona.reassessTrait(userId, 'transit', { response: 'changed', targetValue: 0.25 });
persona.lockTrait(profile, 'transit');
const applied = persona.acceptProposal(changed.proposal.id, userId);
assert.strictEqual(applied.applied, true, '用户主动复核应能覆盖被锁定的自动维度');
assert.strictEqual(applied.newValue, 0.25);
assert.strictEqual(profile.traits.transit.userAdjusted, true);
assert.strictEqual(profile.reassessmentHistory.find(item => item.id === changed.reassessment.id).status, 'accepted');

const timeline = buildGrowthTimeline(userId);
assert.ok(timeline.events.some(item => item.type === 'reconfirmed'), '仍然准确应进入复核时间线');
assert.ok(timeline.events.some(item => item.type === 'confirmed' && /重新定位/.test(item.title)), '重新定位应进入确认时间线');

assert.throws(
  () => persona.reassessTrait(userId, 'transit', { response: 'changed', targetValue: 1.2 }),
  /0.10 到 0.90/
);

rights._reset();
console.log('Persona reassessment tests passed.');
