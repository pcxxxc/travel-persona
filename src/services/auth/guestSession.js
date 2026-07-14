'use strict';

const crypto = require('crypto');

const COOKIE_NAME = 'tp_guest_session';
const SESSION_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const DEV_SECRET = 'travel-persona-local-session-secret-change-before-production';

function getSessionSecret() {
  const configured = String(process.env.SESSION_SECRET || '');
  if (process.env.NODE_ENV === 'production' && configured.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters in production');
  }
  return configured || DEV_SECRET;
}

function signSessionId(sessionId, secret = getSessionSecret()) {
  return crypto.createHmac('sha256', secret).update(sessionId).digest('hex');
}

function createSessionToken(sessionId = crypto.randomUUID(), secret = getSessionSecret()) {
  return `${sessionId}.${signSessionId(sessionId, secret)}`;
}

function verifySessionToken(token, secret = getSessionSecret()) {
  const match = String(token || '').match(/^([a-f0-9-]{36})\.([a-f0-9]{64})$/i);
  if (!match) return null;
  const sessionId = match[1];
  const supplied = Buffer.from(match[2], 'hex');
  const expected = Buffer.from(signSessionId(sessionId, secret), 'hex');
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) return null;
  return sessionId;
}

function parseCookies(header) {
  return String(header || '').split(';').reduce((cookies, part) => {
    const index = part.indexOf('=');
    if (index < 1) return cookies;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function isSecureRequest(req) {
  if (process.env.SESSION_COOKIE_SECURE === 'false') return false;
  if (process.env.SESSION_COOKIE_SECURE === 'true') return true;
  return Boolean(req.secure || String(req.get('x-forwarded-proto') || '').split(',')[0].trim() === 'https');
}

function guestSessionMiddleware(options = {}) {
  const secret = options.secret || getSessionSecret();
  return function guestSession(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    let sessionId = verifySessionToken(cookies[COOKIE_NAME], secret);
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      const attributes = [
        `${COOKIE_NAME}=${encodeURIComponent(createSessionToken(sessionId, secret))}`,
        'Path=/',
        `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
        'HttpOnly',
        'SameSite=Lax'
      ];
      if (isSecureRequest(req)) attributes.push('Secure');
      res.append('Set-Cookie', attributes.join('; '));
    }
    req.userId = `guest_${sessionId.replace(/-/g, '')}`;
    req.authMode = 'signed-guest';
    next();
  };
}

module.exports = {
  COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  parseCookies,
  guestSessionMiddleware,
  getSessionSecret
};

