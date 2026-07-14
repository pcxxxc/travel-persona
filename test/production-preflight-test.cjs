'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.join(__dirname, '..', 'scripts', 'production-preflight.js');
const invalid = spawnSync(process.execPath, [script], {
  encoding: 'utf8',
  env: { ...process.env, SESSION_SECRET: '', OPS_API_KEY: '', ALLOWED_ORIGINS: '', SESSION_COOKIE_SECURE: 'false' }
});
assert.notStrictEqual(invalid.status, 0);
assert.match(invalid.stderr, /Production preflight failed/);

const legacyEnabled = spawnSync(process.execPath, [script], {
  encoding: 'utf8',
  env: {
    ...process.env,
    SESSION_SECRET: 'session-secret-longer-than-thirty-two-characters',
    OPS_API_KEY: 'operations-secret-longer-than-thirty-two-characters',
    ALLOWED_ORIGINS: 'https://travel.example.com',
    SESSION_COOKIE_SECURE: 'true',
    IDENTITY_MODE: 'guest',
    ENABLE_LEGACY_API: 'true',
    CONTENT_SAFETY_MODE: 'local',
    TP_DATABASE_PATH: path.join(os.tmpdir(), 'travel-persona-preflight', 'legacy-enabled.sqlite')
  }
});
assert.notStrictEqual(legacyEnabled.status, 0);
assert.match(legacyEnabled.stderr, /ENABLE_LEGACY_API/);

const invalidMetricRetention = spawnSync(process.execPath, [script], {
  encoding: 'utf8',
  env: {
    ...process.env,
    SESSION_SECRET: 'session-secret-longer-than-thirty-two-characters',
    OPS_API_KEY: 'operations-secret-longer-than-thirty-two-characters',
    ALLOWED_ORIGINS: 'https://travel.example.com',
    SESSION_COOKIE_SECURE: 'true',
    LAUNCH_TIER: 'beta',
    IDENTITY_MODE: 'guest',
    ENABLE_LEGACY_API: 'false',
    CONTENT_SAFETY_MODE: 'local',
    TP_METRIC_RETENTION_DAYS: '0',
    TP_DATABASE_PATH: path.join(os.tmpdir(), 'travel-persona-preflight', 'invalid-retention.sqlite')
  }
});
assert.notStrictEqual(invalidMetricRetention.status, 0);
assert.match(invalidMetricRetention.stderr, /TP_METRIC_RETENTION_DAYS/);

const valid = spawnSync(process.execPath, [script], {
  encoding: 'utf8',
  env: {
    ...process.env,
    SESSION_SECRET: 'session-secret-longer-than-thirty-two-characters',
    OPS_API_KEY: 'operations-secret-longer-than-thirty-two-characters',
    ALLOWED_ORIGINS: 'https://travel.example.com',
    SESSION_COOKIE_SECURE: 'true',
    LAUNCH_TIER: 'beta',
    IDENTITY_MODE: 'guest',
    ENABLE_LEGACY_API: 'false',
    MAP_PROVIDER: 'mock',
    CONTENT_SAFETY_MODE: 'local',
    TP_DATABASE_PATH: path.join(os.tmpdir(), 'travel-persona-preflight', 'db.sqlite')
  }
});
assert.strictEqual(valid.status, 0, valid.stderr);
assert.match(valid.stdout, /Production preflight passed/);

const publicWithoutExternalProviders = spawnSync(process.execPath, [script], {
  encoding: 'utf8',
  env: {
    ...process.env,
    SESSION_SECRET: 'session-secret-longer-than-thirty-two-characters',
    OPS_API_KEY: 'operations-secret-longer-than-thirty-two-characters',
    ALLOWED_ORIGINS: 'https://travel.example.com',
    SESSION_COOKIE_SECURE: 'true',
    LAUNCH_TIER: 'public',
    IDENTITY_MODE: 'guest',
    ENABLE_LEGACY_API: 'false',
    MAP_PROVIDER: 'mock',
    CONTENT_SAFETY_MODE: 'local',
    TP_DATABASE_PATH: path.join(os.tmpdir(), 'travel-persona-preflight', 'public-missing-providers.sqlite')
  }
});
assert.notStrictEqual(publicWithoutExternalProviders.status, 0);
assert.match(publicWithoutExternalProviders.stderr, /MAP_PROVIDER must be baidu/);
assert.match(publicWithoutExternalProviders.stderr, /CONTENT_SAFETY_MODE must be provider/);
assert.match(publicWithoutExternalProviders.stderr, /IDENTITY_MODE must be provider/);

const missingSafetyProvider = spawnSync(process.execPath, [script], {
  encoding: 'utf8',
  env: {
    ...process.env,
    SESSION_SECRET: 'session-secret-longer-than-thirty-two-characters',
    OPS_API_KEY: 'operations-secret-longer-than-thirty-two-characters',
    ALLOWED_ORIGINS: 'https://travel.example.com',
    SESSION_COOKIE_SECURE: 'true',
    LAUNCH_TIER: 'beta',
    IDENTITY_MODE: 'guest',
    ENABLE_LEGACY_API: 'false',
    MAP_PROVIDER: 'mock',
    CONTENT_SAFETY_MODE: 'provider',
    CONTENT_SAFETY_PROVIDER_URL: '',
    CONTENT_SAFETY_PROVIDER_KEY: '',
    TP_DATABASE_PATH: path.join(os.tmpdir(), 'travel-persona-preflight', 'provider-missing.sqlite')
  }
});
assert.notStrictEqual(missingSafetyProvider.status, 0);
assert.match(missingSafetyProvider.stderr, /CONTENT_SAFETY_PROVIDER_URL/);

const validSafetyProvider = spawnSync(process.execPath, [script], {
  encoding: 'utf8',
  env: {
    ...process.env,
    SESSION_SECRET: 'session-secret-longer-than-thirty-two-characters',
    OPS_API_KEY: 'operations-secret-longer-than-thirty-two-characters',
    ALLOWED_ORIGINS: 'https://travel.example.com',
    SESSION_COOKIE_SECURE: 'true',
    LAUNCH_TIER: 'beta',
    IDENTITY_MODE: 'guest',
    ENABLE_LEGACY_API: 'false',
    MAP_PROVIDER: 'mock',
    CONTENT_SAFETY_MODE: 'provider',
    CONTENT_SAFETY_PROVIDER_URL: 'https://safety.example.com/check',
    CONTENT_SAFETY_PROVIDER_KEY: 'content-safety-provider-key-long',
    CONTENT_SAFETY_PROVIDER_TIMEOUT_MS: '2500',
    TP_DATABASE_PATH: path.join(os.tmpdir(), 'travel-persona-preflight', 'provider-valid.sqlite')
  }
});
assert.strictEqual(validSafetyProvider.status, 0, validSafetyProvider.stderr);

const validPublic = spawnSync(process.execPath, [script], {
  encoding: 'utf8',
  env: {
    ...process.env,
    SESSION_SECRET: 'session-secret-longer-than-thirty-two-characters',
    OPS_API_KEY: 'operations-secret-longer-than-thirty-two-characters',
    ALLOWED_ORIGINS: 'https://travel.example.com',
    SESSION_COOKIE_SECURE: 'true',
    LAUNCH_TIER: 'public',
    IDENTITY_MODE: 'provider',
    IDENTITY_PROVIDER_URL: 'https://identity.example.com/introspect',
    IDENTITY_PROVIDER_KEY: 'identity-provider-key-long-enough',
    IDENTITY_PROVIDER_ISSUER: 'travel-persona-production',
    IDENTITY_PROVIDER_TIMEOUT_MS: '2500',
    ENABLE_LEGACY_API: 'false',
    MAP_PROVIDER: 'baidu',
    BAIDU_MAP_API_KEY: 'baidu-map-key-for-production',
    CONTENT_SAFETY_MODE: 'provider',
    CONTENT_SAFETY_PROVIDER_URL: 'https://safety.example.com/check',
    CONTENT_SAFETY_PROVIDER_KEY: 'content-safety-provider-key-long',
    CONTENT_SAFETY_PROVIDER_TIMEOUT_MS: '2500',
    TP_DATABASE_PATH: path.join(os.tmpdir(), 'travel-persona-preflight', 'public-valid.sqlite')
  }
});
assert.strictEqual(validPublic.status, 0, validPublic.stderr);
assert.match(validPublic.stdout, /passed for public launch/);

console.log('Production preflight tests passed.');
