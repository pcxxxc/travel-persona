'use strict';

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const monitoring = require('../src/services/ops/monitoring');

const app = express();
app.use(express.json());
app.use('/api/v1/telemetry', require('../src/api/v1/telemetry'));
app.use('/api/v1/ops', require('../src/api/v1/ops'));

(async () => {
  monitoring.resetMetrics();

  const accepted = await request(app)
    .post('/api/v1/telemetry/events')
    .send({
      events: [{
        event: 'agent_fallback',
        surface: 'agent',
        code: 'LOCAL_RESULT',
        mode: 'fallback',
        durationBucket: '500_1500'
      }]
    });
  assert.strictEqual(accepted.status, 202);
  assert.deepStrictEqual(accepted.body, { accepted: true, count: 1 });

  const metric = monitoring.getMetrics('client_event_count');
  assert.strictEqual(metric.count, 1);
  assert.deepStrictEqual(metric.points[0].tags, {
    event: 'agent_fallback',
    surface: 'agent',
    code: 'LOCAL_RESULT',
    mode: 'fallback',
    durationBucket: '500_1500'
  });

  const forbidden = await request(app)
    .post('/api/v1/telemetry/events')
    .send({
      events: [{
        event: 'api_error',
        surface: 'plan',
        code: 'NETWORK',
        mode: 'fallback',
        durationBucket: 'unknown',
        city: '北京'
      }]
    });
  assert.strictEqual(forbidden.status, 400);
  assert.strictEqual(monitoring.getMetrics('client_event_count').count, 1);

  const hiddenContent = await request(app)
    .post('/api/v1/telemetry/events')
    .send({ events: [{ event: 'client_error', surface: 'journal', content: 'private text' }] });
  assert.strictEqual(hiddenContent.status, 400);

  monitoring.recordMetric('plan_generation_time', 900, {
    endpoint: '/api/v1/plans',
    userId: 'must-not-exist',
    city: 'must-not-exist'
  });
  assert.deepStrictEqual(monitoring.getMetrics('plan_generation_time').points[0].tags, {
    endpoint: '/api/v1/plans'
  });

  const summary = monitoring.getClientEventSummary();
  assert.strictEqual(summary.last15m.total, 1);
  assert.strictEqual(summary.last15m.byEvent.agent_fallback, 1);
  assert.strictEqual(summary.privacy, 'allowlisted-anonymous-no-content');

  const unauthorized = await request(app).get('/api/v1/ops/client-events');
  assert.strictEqual(unauthorized.status, 401);
  const authorized = await request(app)
    .get('/api/v1/ops/client-events')
    .set('x-api-key', 'test-ops-key');
  assert.strictEqual(authorized.status, 200);
  assert.strictEqual(authorized.body.last24h.total, 1);

  console.log('Telemetry privacy tests passed');
})().catch(error => {
  console.error(error);
  process.exit(1);
});
