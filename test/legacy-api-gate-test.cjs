'use strict';

const assert = require('assert');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.PORT = '0';
process.env.ENABLE_LEGACY_API = 'false';

const app = require('../server');

async function run() {
  const legacy = await request(app)
    .post('/api/recommend')
    .send({ answers: {} })
    .expect(404);
  assert.strictEqual(legacy.body.message, 'API endpoint not found');

  const v1 = await request(app)
    .post('/api/v1/plans')
    .send({})
    .expect(400);
  assert.strictEqual(v1.body.type, 'VALIDATION');

  console.log('Legacy API production gate tests passed.');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
