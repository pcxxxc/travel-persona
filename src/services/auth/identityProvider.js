'use strict';

const crypto = require('crypto');
const { guestSessionMiddleware, getSessionSecret } = require('./guestSession');
const { migrateGuestData } = require('./identityMigration');

const IDENTITY_MODES = new Set(['guest', 'provider']);
const stats = {
  authenticatedRequests: 0,
  rejectedCredentials: 0,
  providerFailures: 0,
  migrations: 0,
  migrationFailures: 0
};

function getIdentityMode() {
  return String(process.env.IDENTITY_MODE || 'guest').trim().toLowerCase();
}

function deriveAccountUserId(subject, issuer, secret = getSessionSecret()) {
  const normalizedSubject = String(subject || '').trim();
  const normalizedIssuer = String(issuer || '').trim();
  if (!normalizedSubject || normalizedSubject.length > 512 || !normalizedIssuer || normalizedIssuer.length > 512) {
    throw new Error('Identity provider returned an invalid subject');
  }
  const digest = crypto.createHmac('sha256', secret)
    .update(`${normalizedIssuer}\u0000${normalizedSubject}`)
    .digest('hex')
    .slice(0, 32);
  return `acct_${digest}`;
}

function getBearerToken(header) {
  const value = String(header || '').trim();
  if (!value) return { present: false, token: null };
  const match = value.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || match[1].length > 8192) return { present: true, token: null };
  return { present: true, token: match[1] };
}

async function introspectWithProvider(token, options = {}) {
  const providerUrl = String(options.providerUrl || process.env.IDENTITY_PROVIDER_URL || '').trim();
  const providerKey = String(options.providerKey || process.env.IDENTITY_PROVIDER_KEY || '').trim();
  const timeoutMs = Number(options.timeoutMs || process.env.IDENTITY_PROVIDER_TIMEOUT_MS || 2500);
  if (!providerUrl || !providerKey) throw new Error('Identity provider is not configured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerKey}`
      },
      body: JSON.stringify({ token }),
      signal: controller.signal
    });
    if (response.status === 401 || response.status === 403) return { active: false };
    if (!response.ok) throw new Error(`Identity provider returned HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 16384) throw new Error('Identity provider response is too large');
    const payload = JSON.parse(text);
    return {
      active: payload.active === true,
      subject: typeof payload.subject === 'string' ? payload.subject : '',
      displayName: typeof payload.displayName === 'string' ? payload.displayName.slice(0, 80) : null,
      scopes: Array.isArray(payload.scopes) ? payload.scopes.map(String).slice(0, 30) : []
    };
  } finally {
    clearTimeout(timer);
  }
}

function sendIdentityError(res, status, code, message) {
  return res.status(status).json({
    code,
    type: 'AUTH',
    message,
    userVisible: status < 500
  });
}

function identityMiddleware(options = {}) {
  const mode = String(options.mode || getIdentityMode()).toLowerCase();
  if (!IDENTITY_MODES.has(mode)) throw new Error('IDENTITY_MODE must be guest or provider');
  const secret = options.secret || getSessionSecret();
  const issuer = String(options.issuer || process.env.IDENTITY_PROVIDER_ISSUER || process.env.IDENTITY_PROVIDER_URL || '').trim();
  const guest = options.guestMiddleware || guestSessionMiddleware({ secret });
  const introspect = options.introspect || introspectWithProvider;
  const migrate = options.migrate || migrateGuestData;

  return function resolveIdentity(req, res, next) {
    guest(req, res, async guestError => {
      if (guestError) return next(guestError);
      req.guestUserId = req.userId;
      req.identity = { mode: 'signed-guest', authenticated: false, dataInherited: false };
      if (mode === 'guest') return next();

      const credential = getBearerToken(req.get('authorization'));
      if (!credential.present) return next();
      if (!credential.token) {
        stats.rejectedCredentials++;
        return sendIdentityError(res, 401, 'TP-1401', '登录凭证无效，请重新登录');
      }

      let verified;
      try {
        verified = await introspect(credential.token, options);
      } catch (error) {
        stats.providerFailures++;
        return sendIdentityError(res, 503, 'TP-1503', '登录状态暂时无法确认，请稍后重试');
      }
      if (!verified?.active || !verified.subject) {
        stats.rejectedCredentials++;
        return sendIdentityError(res, 401, 'TP-1401', '登录已过期，请重新登录');
      }

      let accountUserId;
      try {
        accountUserId = deriveAccountUserId(verified.subject, issuer, secret);
      } catch (error) {
        stats.providerFailures++;
        return sendIdentityError(res, 502, 'TP-1502', '登录服务返回了无效身份');
      }

      let migration;
      try {
        migration = migrate(req.guestUserId, accountUserId);
      } catch (error) {
        stats.migrationFailures++;
        return sendIdentityError(res, 503, 'TP-1504', '正在同步你的旅行记录，请稍后重试');
      }

      if (migration?.migrated) stats.migrations++;
      stats.authenticatedRequests++;
      req.userId = accountUserId;
      req.authMode = 'provider';
      req.identity = {
        mode: 'provider',
        authenticated: true,
        displayName: verified.displayName || null,
        scopes: Array.isArray(verified.scopes) ? verified.scopes : [],
        dataInherited: Boolean(migration?.migrated || migration?.alreadyClaimed)
      };
      return next();
    });
  };
}

function getIdentityStatus() {
  const mode = getIdentityMode();
  return {
    mode,
    providerConfigured: mode === 'provider'
      && Boolean(process.env.IDENTITY_PROVIDER_URL && process.env.IDENTITY_PROVIDER_KEY && process.env.IDENTITY_PROVIDER_ISSUER),
    ...stats
  };
}

function _resetStats() {
  Object.keys(stats).forEach(key => { stats[key] = 0; });
}

module.exports = {
  deriveAccountUserId,
  getBearerToken,
  introspectWithProvider,
  identityMiddleware,
  getIdentityStatus,
  _resetStats
};
