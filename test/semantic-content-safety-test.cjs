'use strict';

const assert = require('assert');
const express = require('express');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.CONTENT_SAFETY_MODE = 'provider';
process.env.CONTENT_SAFETY_PROVIDER_URL = 'https://safety.example.test/check';
process.env.CONTENT_SAFETY_PROVIDER_KEY = 'semantic-provider-test-key';
process.env.CONTENT_SAFETY_PROVIDER_SEND_RAW = 'false';

const semanticSafety = require('../src/services/ops/semanticContentSafety');
const journalService = require('../src/services/journal/journalService');
const journalRouter = require('../src/api/v1/journals');

async function run() {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  let lastPayload = null;
  global.fetch = async (url, options) => {
    fetchCalls += 1;
    lastPayload = JSON.parse(options.body);
    const subtleRisk = lastPayload.text.includes('从所有人的生活里消失');
    return {
      ok: true,
      json: async () => subtleRisk
        ? { safe: false, action: 'restrict', categories: ['selfHarm'], requestId: 'req-semantic-1' }
        : { safe: true, action: 'allow', categories: [], requestId: 'req-semantic-2' }
    };
  };

  semanticSafety.resetForTests();
  const obviousPrivate = await semanticSafety.checkInput('我的手机号是13800138000', { surface: 'test' });
  assert.strictEqual(obviousPrivate.sensitivityLevel, 'restricted');
  assert.strictEqual(fetchCalls, 0, '本地已识别的高风险内容不应发送给外部 Provider');

  const medium = await semanticSafety.checkInput('这个蠢猪让我很生气', { surface: 'test' });
  assert.strictEqual(medium.sensitivityLevel, 'sensitive');
  assert.ok(!lastPayload.text.includes('蠢猪'), '默认应先本地脱敏再发送');
  assert.strictEqual(medium.providerApplied, true);

  const subtle = await semanticSafety.checkInput('我想从所有人的生活里消失', { surface: 'test' });
  assert.strictEqual(subtle.sensitivityLevel, 'restricted');
  assert.ok(subtle.matchedCategories.includes('selfHarm'));
  assert.strictEqual(subtle.providerRequestId, 'req-semantic-1');

  const app = express();
  app.use(express.json());
  app.use('/api/v1/journals', journalRouter);
  const userId = `semantic_user_${Date.now()}`;
  const created = await request(app)
    .post('/api/v1/journals/entries')
    .set('x-user-id', userId)
    .send({ type: 'review', content: '我想从所有人的生活里消失', analysisAuthorized: true })
    .expect(201);
  assert.strictEqual(created.body.sensitivityLevel, 'restricted');
  assert.strictEqual(created.body.analysisAuthorized, false);
  const authorized = await request(app)
    .post(`/api/v1/journals/entries/${created.body.id}/authorize`)
    .set('x-user-id', userId)
    .send({ authorized: true })
    .expect(200);
  assert.strictEqual(authorized.body.analysisAuthorized, false);
  assert.deepStrictEqual(authorized.body.proposals, []);
  journalService.deleteUserData(userId);

  semanticSafety.resetForTests();
  global.fetch = async () => {
    fetchCalls += 1;
    throw new Error('provider offline');
  };
  for (let index = 0; index < 3; index += 1) {
    const degraded = await semanticSafety.checkInput('普通旅行文字', { surface: 'test' });
    assert.strictEqual(degraded.degraded, true);
    assert.strictEqual(degraded.safe, true, 'Provider 故障时本地安全链仍应可用');
  }
  const callsBeforeOpenCheck = fetchCalls;
  const circuitFallback = await semanticSafety.checkInput('另一段普通旅行文字', { surface: 'test' });
  assert.strictEqual(circuitFallback.fallbackReason, 'circuit_open');
  assert.strictEqual(fetchCalls, callsBeforeOpenCheck, '熔断后不应继续请求故障 Provider');
  assert.strictEqual(semanticSafety.getStatus().providerState, 'open');

  global.fetch = originalFetch;
  delete process.env.CONTENT_SAFETY_PROVIDER_URL;
  delete process.env.CONTENT_SAFETY_PROVIDER_KEY;
  delete process.env.CONTENT_SAFETY_PROVIDER_SEND_RAW;
  process.env.CONTENT_SAFETY_MODE = 'local';
  semanticSafety.resetForTests();
  console.log('Semantic content safety provider and journal isolation tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
