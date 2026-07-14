'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.SESSION_SECRET = 'full-trip-review-test-secret-32-characters';

const app = require('../server');
const rights = require('../src/services/journal/dataRights');
const journal = require('../src/services/journal/journalService');
const trace = require('../src/services/journal/travelTrace');
const { COOKIE_NAME, verifySessionToken } = require('../src/services/auth/guestSession');

async function run() {
  rights._reset();
  const agent = request.agent(app);
  const sessionResponse = await agent.get('/api/v1/journals/persona/profile').expect(200);
  const cookie = (sessionResponse.headers['set-cookie'] || []).find(item => item.startsWith(`${COOKIE_NAME}=`));
  const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
  const sessionId = verifySessionToken(token, process.env.SESSION_SECRET);
  const userId = `guest_${sessionId.replace(/-/g, '')}`;

  trace.recordTrip(userId, {
    tripId: 'completed_review_trip', cities: ['茂名', '北京'],
    startDate: '2026-01-01', endDate: '2026-01-18', status: 'completed'
  });
  trace.recordTrip(userId, {
    tripId: 'planning_review_trip', cities: ['茂名', '北京'],
    startDate: '2026-09-01', endDate: '2026-09-18', status: 'planning'
  });

  const complete = await agent.post('/api/v1/journals/entries').send({
    tripId: 'completed_review_trip', type: 'review',
    content: '我开心了，我出发了，我到了，我看见了。',
    reviewSnapshot: {
      worth: 'worth_it', values: ['connection'], deviations: ['longer_stays'], tripCompleted: false
    }
  }).expect(201);
  assert.strictEqual(complete.body.reviewSnapshot.complete, true, '服务端应以真实旅行状态确认完整复盘');
  const completeAuthorized = await agent
    .post(`/api/v1/journals/entries/${complete.body.id}/authorize`)
    .send({ authorized: true })
    .expect(200);
  assert.ok(completeAuthorized.body.proposals.length > 0, '完整复盘可形成待确认变化');
  const completeEvidence = journal.getEvidencePool(userId).find(item => item.sourceEntryId === complete.body.id);
  assert.strictEqual(completeEvidence.type, 'tripReview');
  assert.strictEqual(completeEvidence.reliability, 0.9);

  const spoofed = await agent.post('/api/v1/journals/entries').send({
    tripId: 'planning_review_trip', type: 'review', content: '这次预算让我更谨慎。',
    reviewSnapshot: {
      worth: 'worth_it', values: ['arrived'], deviations: ['overspent'], tripCompleted: true
    }
  }).expect(201);
  assert.strictEqual(spoofed.body.reviewSnapshot.complete, false, '未完成旅行不能伪装为完整复盘');
  const spoofedAuthorized = await agent
    .post(`/api/v1/journals/entries/${spoofed.body.id}/authorize`)
    .send({ authorized: true })
    .expect(200);
  assert.strictEqual(spoofedAuthorized.body.proposals.length, 0, '单条未完成复盘不得改变长期人格');
  const partialEvidence = journal.getEvidencePool(userId).find(item => item.sourceEntryId === spoofed.body.id);
  assert.strictEqual(partialEvidence.type, 'journalEntry');
  assert.strictEqual(partialEvidence.reliability, 0.35);

  const appSource = fs.readFileSync(path.join(__dirname, '..', 'public-app', 'app.js'), 'utf8');
  assert.match(appSource, /entryType = draft\.reviewMode/);
  assert.match(appSource, /TRIP_REVIEW_WORTH/);
  assert.match(appSource, /TRIP_REVIEW_VALUES/);
  assert.match(appSource, /TRIP_REVIEW_DEVIATIONS/);

  rights._reset();
  console.log('Full trip review tests passed.');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
