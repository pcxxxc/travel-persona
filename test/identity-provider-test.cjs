'use strict';

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const {
  deriveAccountUserId,
  identityMiddleware,
  _resetStats
} = require('../src/services/auth/identityProvider');

async function run() {
  _resetStats();
  const secret = 'identity-test-secret-longer-than-thirty-two-characters';
  const migrations = [];
  const app = express();
  app.use(identityMiddleware({
    mode: 'provider',
    issuer: 'travel-persona-test',
    secret,
    introspect: async token => {
      if (token === 'provider-down') throw new Error('provider unavailable');
      if (token === 'valid-token') {
        return { active: true, subject: 'raw-provider-subject-42', displayName: '测试用户', scopes: ['profile'] };
      }
      return { active: false };
    },
    migrate(sourceUserId, targetUserId) {
      migrations.push({ sourceUserId, targetUserId });
      return { migrated: true };
    }
  }));
  app.get('/session', (req, res) => res.json({
    userId: req.userId,
    guestUserId: req.guestUserId,
    authMode: req.authMode,
    identity: req.identity
  }));

  const guest = await request(app).get('/session').expect(200);
  assert.strictEqual(guest.body.authMode, 'signed-guest');
  assert.match(guest.body.userId, /^guest_[a-f0-9]{32}$/);
  assert.ok(guest.headers['set-cookie']?.[0].includes('HttpOnly'));
  const cookie = guest.headers['set-cookie'][0].split(';')[0];

  const verified = await request(app)
    .get('/session')
    .set('Cookie', cookie)
    .set('Authorization', 'Bearer valid-token')
    .expect(200);
  assert.strictEqual(verified.body.authMode, 'provider');
  assert.strictEqual(verified.body.identity.authenticated, true);
  assert.strictEqual(verified.body.identity.dataInherited, true);
  assert.strictEqual(verified.body.guestUserId, guest.body.userId);
  assert.strictEqual(
    verified.body.userId,
    deriveAccountUserId('raw-provider-subject-42', 'travel-persona-test', secret)
  );
  assert.ok(!JSON.stringify(verified.body).includes('raw-provider-subject-42'));
  assert.deepStrictEqual(migrations[0], {
    sourceUserId: guest.body.userId,
    targetUserId: verified.body.userId
  });

  await request(app).get('/session').set('Authorization', 'Basic invalid').expect(401);
  await request(app).get('/session').set('Authorization', 'Bearer expired-token').expect(401);
  const unavailable = await request(app)
    .get('/session')
    .set('Authorization', 'Bearer provider-down')
    .expect(503);
  assert.strictEqual(unavailable.body.code, 'TP-1503');
  assert.ok(!unavailable.body.userId);

  console.log('Identity provider contract tests passed.');
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
