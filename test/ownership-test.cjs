'use strict';

const assert = require('assert');
const journal = require('../src/services/journal/journalService');
const persona = require('../src/services/journal/personaCalibration');
const trace = require('../src/services/journal/travelTrace');
const rights = require('../src/services/journal/dataRights');

rights._reset();

const owner = 'owner_user';
const attacker = 'other_user';
const entry = journal.createEntry(owner, {
  type: 'review',
  reviewSnapshot: { worth: 'worth_it', values: ['arrived'], deviations: ['as_planned'], tripCompleted: true },
  content: 'Private travel reflection',
  mood: 'restore'
});

assert.throws(
  () => journal.updateEntry(entry.id, { content: 'changed' }, attacker),
  /无权访问/
);
assert.throws(
  () => journal.setAnalysisAuthorization(entry.id, true, attacker),
  /无权访问/
);
assert.throws(
  () => journal.deleteEntry(entry.id, attacker),
  /无权访问/
);
assert.strictEqual(journal.getEntries(owner).length, 1);

journal.setAnalysisAuthorization(entry.id, true, owner);
const proposals = persona.generateUpdateProposal(owner, journal.getEvidencePool(owner));
assert.ok(proposals.length > 0);
assert.throws(
  () => persona.acceptProposal(proposals[0].id, attacker),
  /无权访问/
);
assert.throws(
  () => persona.rejectProposal(proposals[0].id, 'no', attacker),
  /无权访问/
);
assert.strictEqual(persona.getProposals(owner)[0].status, 'pending');

const trip = trace.recordTrip(owner, { tripId: 'private_trip', cities: ['茂名', '北京'] });
assert.strictEqual(trace.recordTrip(owner, { tripId: 'private_trip', cities: ['茂名', '北京'] }), trip, '同一用户重试创建应保持幂等');
assert.throws(() => trace.recordTrip(attacker, { tripId: 'private_trip', cities: ['广州'] }), /已被占用/);
assert.throws(() => trace.updateTrip(trip.tripId, { status: 'completed' }, attacker), /无权访问/);
assert.throws(() => trace.deleteTrip(trip.tripId, attacker), /无权访问/);
assert.strictEqual(trace.getTravelTrace(owner).length, 1);

rights._reset();
console.log('Cross-user ownership tests passed.');
