'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ALLOW_INSECURE_USER_HEADER = 'true';
process.env.PORT = '0';

const app = require('../server');

async function run() {
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'public-app', 'app.js'), 'utf8');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'public-app', 'styles.css'), 'utf8');

  assert.ok(appJs.includes('function notify('), 'global non-blocking notification is required');
  assert.ok(appJs.includes("id: 'app-notifications'"), 'notification live region is required');
  assert.ok(appJs.includes("host.setAttribute('aria-live'"), 'notification must announce accessible status');
  assert.ok(styles.includes('.app-notifications'), 'notification layout styles are required');
  assert.ok(!appJs.includes('window.alert('), 'native alert must not interrupt the user flow');
  assert.ok(!appJs.includes('window.confirm('), 'native confirm must not interrupt the user flow');
  assert.ok(!appJs.includes('data.message ||'), 'raw server messages must not be shown as fallback copy');

  const secretType = 'secret-internal-entry-type';
  const journalResponse = await request(app)
    .post('/api/v1/journals/entries')
    .set('x-user-id', 'boundary_test_user')
    .send({ type: secretType, content: 'test' })
    .expect(400);

  assert.strictEqual(journalResponse.body.message, 'Journal entry validation failed');
  assert.ok(journalResponse.body.userMessage, 'recoverable errors should include user guidance');
  assert.ok(!JSON.stringify(journalResponse.body).includes(secretType), 'response must not echo internal input details');

  const planResponse = await request(app)
    .post('/api/v1/plans')
    .send({ tripContext: { days: 0 }, tripIntent: { mood: 'unknown-secret-mood' } })
    .expect(400);

  assert.strictEqual(planResponse.body.message, 'Plan request validation failed');
  assert.ok(planResponse.body.userMessage, 'plan validation should include safe user guidance');
  assert.ok(!JSON.stringify(planResponse.body).includes('unknown-secret-mood'));

  console.log('Frontend and API error-boundary tests passed.');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
