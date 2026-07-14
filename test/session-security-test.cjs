'use strict';

const assert = require('assert');
const {
  COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  parseCookies
} = require('../src/services/auth/guestSession');

const secret = 'test-session-secret-that-is-longer-than-thirty-two-characters';
const sessionId = '123e4567-e89b-12d3-a456-426614174000';
const token = createSessionToken(sessionId, secret);

assert.strictEqual(verifySessionToken(token, secret), sessionId);
assert.strictEqual(verifySessionToken(token.slice(0, -1) + '0', secret), null);
assert.strictEqual(verifySessionToken('not-a-token', secret), null);
assert.strictEqual(parseCookies(`a=1; ${COOKIE_NAME}=${token}`)[COOKIE_NAME], token);

console.log('Signed guest session tests passed.');

