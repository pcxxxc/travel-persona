'use strict';

const assert = require('assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.SESSION_SECRET = 'plan-persona-authority-secret-32-characters';

const app = require('../server');
const rights = require('../src/services/journal/dataRights');
const persona = require('../src/services/journal/personaCalibration');
const { COOKIE_NAME, verifySessionToken } = require('../src/services/auth/guestSession');

async function createSignedUser() {
  const agent = request.agent(app);
  const response = await agent.get('/api/v1/journals/persona/profile').expect(200);
  const cookie = (response.headers['set-cookie'] || []).find(item => item.startsWith(`${COOKIE_NAME}=`));
  assert.ok(cookie, '应建立签名访客会话');
  const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
  const sessionId = verifySessionToken(token, process.env.SESSION_SECRET);
  return { agent, userId: `guest_${sessionId.replace(/-/g, '')}` };
}

function planRequest(forgedTransit = 0.05) {
  return {
    personaProfile: {
      profileId: 'forged-client-profile',
      traits: {
        transit: { mean: forgedTransit, evidenceCount: 999 }
      }
    },
    tripIntent: {
      mood: 'restore',
      interests: ['nature'],
      avoid: [],
      freeText: '',
      destination: '北京'
    },
    tripContext: {
      origin: '茂名',
      days: 14,
      budget: { comfort: 6000, hardMax: 7000 },
      season: 'autumn'
    }
  };
}

async function run() {
  rights._reset();
  const first = await createSignedUser();
  const second = await createSignedUser();

  const proposal = persona.generateUpdateProposal(first.userId, [{
    id: 'trusted-plan-profile-evidence',
    type: 'tripReview',
    reliability: 0.9,
    dimensionImpact: {
      transit: { traitKey: 'transit', direction: 'positive', magnitude: 0.08 }
    }
  }]).find(item => item.traitKey === 'transit');
  assert.ok(proposal, '高可靠度复盘应形成旅格提案');
  persona.acceptProposal(proposal.id, first.userId);
  const acceptedTransit = persona.getProfile(first.userId).traits.transit.mean;

  const personalized = await first.agent
    .post('/api/v1/plans')
    .send(planRequest(0.05))
    .expect(200);

  assert.strictEqual(personalized.body.capability.personaSource, 'server-confirmed');
  assert.strictEqual(personalized.body.capability.acceptedTraitCount, 1);
  assert.strictEqual(personalized.body.capability.personalizationApplied, true);
  assert.strictEqual(personalized.body.capability.agentApplied, false, '本地完整链路无需智能体');
  assert.strictEqual(personalized.body.personaSnapshot.traits.transit, acceptedTransit);
  assert.notStrictEqual(personalized.body.personaSnapshot.traits.transit, 0.05, '客户端伪造画像必须被忽略');

  const isolated = await second.agent
    .post('/api/v1/plans')
    .send(planRequest(0.95))
    .expect(200);

  assert.strictEqual(isolated.body.capability.personaSource, 'cold-start');
  assert.strictEqual(isolated.body.capability.acceptedTraitCount, 0);
  assert.strictEqual(isolated.body.personaSnapshot.traits.transit, 0.5, '其他用户不得继承第一位用户的旅格');

  await first.agent
    .put('/api/v1/journals/privacy/settings')
    .send({ personalizationEnabled: false, longTermMemoryEnabled: false })
    .expect(200);

  const privateMode = await first.agent
    .post('/api/v1/plans')
    .send(planRequest(0.05))
    .expect(200);

  assert.strictEqual(privateMode.body.capability.personaSource, 'non-personalized');
  assert.strictEqual(privateMode.body.capability.personalizationApplied, false);
  assert.strictEqual(privateMode.body.personaSnapshot.traits.transit, 0.5, '关闭个性化后不得读取已存旅格');

  rights._reset();
  console.log('Plan persona authority tests passed.');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
