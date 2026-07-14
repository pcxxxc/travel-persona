'use strict';

const assert = require('assert');
const request = require('supertest');

process.env.NODE_ENV = 'production';
process.env.PORT = '0';
process.env.TP_STORAGE_MODE = 'memory';
process.env.SESSION_SECRET = 'production-web-security-session-secret-123456';
process.env.OPS_API_KEY = 'production-web-security-operations-key-123';
process.env.ALLOWED_ORIGINS = 'https://travel.example.com';
process.env.SESSION_COOKIE_SECURE = 'true';

const app = require('../server');

(async () => {
  const page = await request(app).get('/app/');
  assert.strictEqual(page.status, 200);
  assert.strictEqual(page.headers['x-powered-by'], undefined);
  assert.match(page.headers['strict-transport-security'], /max-age=31536000/);
  assert.match(page.headers['content-security-policy'], /script-src 'self'/);
  assert.ok(!page.headers['content-security-policy'].includes("script-src 'self' 'unsafe-inline'"));
  assert.match(page.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.ok(!/<script>\s*[\s\S]*?DOMContentLoaded/.test(page.text), '首页不应依赖内联启动脚本');

  const missingOrigin = await request(app)
    .post('/api/v1/telemetry/events')
    .send({ events: [{ event: 'client_error', surface: 'startup', code: 'TEST', mode: 'local', durationBucket: 'lt_500' }] });
  assert.strictEqual(missingOrigin.status, 403);
  assert.strictEqual(missingOrigin.headers['cache-control'], 'no-store');

  const disallowedOrigin = await request(app)
    .post('/api/v1/telemetry/events')
    .set('Origin', 'https://attacker.example')
    .send({ events: [{ event: 'client_error', surface: 'startup', code: 'TEST', mode: 'local', durationBucket: 'lt_500' }] });
  assert.strictEqual(disallowedOrigin.status, 403);

  const allowedOrigin = await request(app)
    .post('/api/v1/telemetry/events')
    .set('Origin', 'https://travel.example.com')
    .send({ events: [{ event: 'client_error', surface: 'startup', code: 'TEST', mode: 'local', durationBucket: 'lt_500' }] });
  assert.strictEqual(allowedOrigin.status, 202);
  assert.strictEqual(allowedOrigin.headers['access-control-allow-origin'], 'https://travel.example.com');

  const apiResponse = await request(app)
    .get('/api/v1/journals/entries')
    .set('Origin', 'https://travel.example.com');
  assert.strictEqual(apiResponse.status, 200);
  assert.strictEqual(apiResponse.headers['cache-control'], 'no-store');

  console.log('Production web security tests passed.');
  process.exit(0);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
