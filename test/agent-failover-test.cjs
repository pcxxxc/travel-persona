'use strict';

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const agentRouter = require('../src/api/v1/agent');

async function run() {
  const originalProvider = process.env.AGENT_PROVIDER;
  const app = express();
  app.use(express.json());
  app.use('/api/v1/agent', agentRouter);

  delete process.env.AGENT_PROVIDER;
  const fallback = await request(app)
    .post('/api/v1/agent/extract-intent')
    .send({ freeText: '我想慢一点，少排队。' })
    .expect(200);
  assert.strictEqual(fallback.body.agentApplied, false);
  assert.deepStrictEqual(fallback.body.operations, []);
  assert.ok(!Object.prototype.hasOwnProperty.call(fallback.body, 'message'));

  process.env.AGENT_PROVIDER = 'mock';
  const enhanced = await request(app)
    .post('/api/v1/agent/enhance-explanation')
    .send({ planResponse: { explanations: [{ reason: '基础理由' }], capability: {} } })
    .expect(200);
  assert.strictEqual(enhanced.body.capability.agentApplied, true);
  assert.match(enhanced.body.explanations[0].reason, /基础理由/);

  const privateIntent = await request(app)
    .post('/api/v1/agent/extract-intent')
    .send({ freeText: '我失业了，手机号是13800138000，想出去走走。' })
    .expect(200);
  assert.strictEqual(privateIntent.body.agentApplied, true);
  assert.ok(!JSON.stringify(privateIntent.body).includes('13800138000'));
  assert.ok(!JSON.stringify(privateIntent.body).includes('失业'));

  if (originalProvider === undefined) delete process.env.AGENT_PROVIDER;
  else process.env.AGENT_PROVIDER = originalProvider;
}

run()
  .then(() => console.log('Agent failover tests passed.'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
