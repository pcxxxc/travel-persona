'use strict';

const assert = require('assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ALLOW_INSECURE_USER_HEADER = 'true';
process.env.PORT = '0';
process.env.SESSION_SECRET = 'persona-reassessment-api-test-secret-32-characters';

const app = require('../server');
const rights = require('../src/services/journal/dataRights');
const persona = require('../src/services/journal/personaCalibration');
const { COOKIE_NAME, verifySessionToken } = require('../src/services/auth/guestSession');

async function run() {
  rights._reset();
  const agent = request.agent(app);
  const sessionResponse = await agent.get('/api/v1/journals/persona/profile').expect(200);
  const cookie = (sessionResponse.headers['set-cookie'] || []).find(item => item.startsWith(`${COOKIE_NAME}=`));
  assert.ok(cookie, '应建立签名访客会话');
  const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
  const sessionId = verifySessionToken(token, process.env.SESSION_SECRET);
  const userId = `guest_${sessionId.replace(/-/g, '')}`;
  const seed = persona.generateUpdateProposal(userId, [{
    id: 'api_reassessment_seed',
    type: 'tripReview',
    reliability: 0.9,
    dimensionImpact: {
      transit: { traitKey: 'transit', direction: 'positive', magnitude: 0.08 }
    }
  }]).find(item => item.traitKey === 'transit');
  persona.acceptProposal(seed.id, userId);

  const response = await agent
    .post('/api/v1/journals/persona/traits/transit/reassess')
    .send({ response: 'changed', targetValue: 0.25 })
    .expect(200);

  assert.strictEqual(response.body.proposal.sourceType, 'userReassessment');
  assert.strictEqual(response.body.proposal.status, 'pending');
  assert.strictEqual(response.body.proposal.proposedValue, 0.25);

  await agent
    .post('/api/v1/journals/persona/traits/transit/reassess')
    .send({ response: 'changed', targetValue: 1.2 })
    .expect(400);

  rights._reset();
  console.log('Persona reassessment API tests passed.');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
