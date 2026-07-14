'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const failures = [];
const warnings = [];

function requireSecret(name, minLength = 32) {
  const value = String(process.env[name] || '');
  if (value.length < minLength) failures.push(`${name} must contain at least ${minLength} characters`);
}

const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor < 22) failures.push('Node.js 22.5 or newer is required');

const launchTier = String(process.env.LAUNCH_TIER || 'beta').toLowerCase();
if (!['beta', 'public'].includes(launchTier)) failures.push('LAUNCH_TIER must be beta or public');

requireSecret('SESSION_SECRET');
requireSecret('OPS_API_KEY');

const origins = String(process.env.ALLOWED_ORIGINS || '').split(',').map(item => item.trim()).filter(Boolean);
if (origins.length === 0) failures.push('ALLOWED_ORIGINS must contain the production site origin');
if (origins.some(origin => !origin.startsWith('https://'))) failures.push('Every production origin must use HTTPS');

if (process.env.SESSION_COOKIE_SECURE !== 'true') failures.push('SESSION_COOKIE_SECURE must be true in production');
if (process.env.ENABLE_LEGACY_API === 'true') failures.push('ENABLE_LEGACY_API must remain false in production');

const metricRetentionDays = Number(process.env.TP_METRIC_RETENTION_DAYS || 30);
if (!Number.isFinite(metricRetentionDays) || metricRetentionDays < 7 || metricRetentionDays > 365) {
  failures.push('TP_METRIC_RETENTION_DAYS must be between 7 and 365');
}
const telemetryRateLimit = Number(process.env.TELEMETRY_RATE_LIMIT_PER_MINUTE || 30);
if (!Number.isFinite(telemetryRateLimit) || telemetryRateLimit < 5 || telemetryRateLimit > 300) {
  failures.push('TELEMETRY_RATE_LIMIT_PER_MINUTE must be between 5 and 300');
}

const mapProvider = String(process.env.MAP_PROVIDER || 'mock').toLowerCase();
if (!['mock', 'baidu', 'mcp-baidu'].includes(mapProvider)) failures.push('MAP_PROVIDER must be mock, baidu, or mcp-baidu');
if (mapProvider === 'baidu' && !process.env.BAIDU_MAP_API_KEY) {
  failures.push('BAIDU_MAP_API_KEY is required when MAP_PROVIDER=baidu');
}
if (mapProvider === 'mcp-baidu' && !process.env.BAIDU_MAP_AK) {
  failures.push('BAIDU_MAP_AK is required when MAP_PROVIDER=mcp-baidu');
}
if (mapProvider !== 'mock' && !process.env.BAIDU_WEB_AK) {
  failures.push('BAIDU_WEB_AK is required for the domestic browser map');
}
if (mapProvider === 'mock') warnings.push('Map provider is still in fallback mode');
if (launchTier === 'public' && !['baidu', 'mcp-baidu'].includes(mapProvider)) {
  failures.push('MAP_PROVIDER must be baidu or mcp-baidu when LAUNCH_TIER=public');
}
if (!process.env.AGENT_PROVIDER) warnings.push('Agent enhancement is disabled; the local planner will remain active');

const contentSafetyMode = String(process.env.CONTENT_SAFETY_MODE || 'local').toLowerCase();
if (!['local', 'provider'].includes(contentSafetyMode)) {
  failures.push('CONTENT_SAFETY_MODE must be local or provider');
}
if (contentSafetyMode === 'local') {
  warnings.push('Content safety uses the local rule layer; connect a reviewed semantic moderation provider before a broad public launch');
} else {
  const providerUrl = String(process.env.CONTENT_SAFETY_PROVIDER_URL || '').trim();
  const providerKey = String(process.env.CONTENT_SAFETY_PROVIDER_KEY || '').trim();
  if (!providerUrl) failures.push('CONTENT_SAFETY_PROVIDER_URL is required when CONTENT_SAFETY_MODE=provider');
  if (providerUrl && !providerUrl.startsWith('https://')) failures.push('CONTENT_SAFETY_PROVIDER_URL must use HTTPS');
  if (providerKey.length < 16) failures.push('CONTENT_SAFETY_PROVIDER_KEY must contain at least 16 characters');
  const timeout = Number(process.env.CONTENT_SAFETY_PROVIDER_TIMEOUT_MS || 2500);
  if (!Number.isFinite(timeout) || timeout < 500 || timeout > 10000) failures.push('CONTENT_SAFETY_PROVIDER_TIMEOUT_MS must be between 500 and 10000');
  if (process.env.CONTENT_SAFETY_PROVIDER_SEND_RAW === 'true') {
    warnings.push('Content safety provider receives raw text; confirm consent, DPA, retention and training opt-out before launch');
  }
}
if (launchTier === 'public' && contentSafetyMode !== 'provider') {
  failures.push('CONTENT_SAFETY_MODE must be provider when LAUNCH_TIER=public');
}

const identityMode = String(process.env.IDENTITY_MODE || 'guest').toLowerCase();
if (!['guest', 'provider'].includes(identityMode)) failures.push('IDENTITY_MODE must be guest or provider');
if (identityMode === 'guest') {
  warnings.push('Identity uses signed guest sessions; connect a verified account provider before a broad public launch');
} else {
  const providerUrl = String(process.env.IDENTITY_PROVIDER_URL || '').trim();
  const providerKey = String(process.env.IDENTITY_PROVIDER_KEY || '').trim();
  const providerIssuer = String(process.env.IDENTITY_PROVIDER_ISSUER || '').trim();
  if (!providerUrl) failures.push('IDENTITY_PROVIDER_URL is required when IDENTITY_MODE=provider');
  if (providerUrl && !providerUrl.startsWith('https://')) failures.push('IDENTITY_PROVIDER_URL must use HTTPS');
  if (providerKey.length < 16) failures.push('IDENTITY_PROVIDER_KEY must contain at least 16 characters');
  if (!providerIssuer || /\s/.test(providerIssuer)) failures.push('IDENTITY_PROVIDER_ISSUER must be a stable value without spaces');
  const timeout = Number(process.env.IDENTITY_PROVIDER_TIMEOUT_MS || 2500);
  if (!Number.isFinite(timeout) || timeout < 500 || timeout > 10000) {
    failures.push('IDENTITY_PROVIDER_TIMEOUT_MS must be between 500 and 10000');
  }
}
if (launchTier === 'public' && identityMode !== 'provider') {
  failures.push('IDENTITY_MODE must be provider when LAUNCH_TIER=public');
}

const databasePath = path.resolve(process.env.TP_DATABASE_PATH || '.data/travel-persona.sqlite');
try {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  fs.accessSync(path.dirname(databasePath), fs.constants.R_OK | fs.constants.W_OK);
} catch (error) {
  failures.push(`Database directory is not writable: ${path.dirname(databasePath)}`);
}

const backupDirectory = path.resolve(process.env.TP_BACKUP_DIR || '.backups');
try {
  fs.mkdirSync(backupDirectory, { recursive: true });
  fs.accessSync(backupDirectory, fs.constants.R_OK | fs.constants.W_OK);
} catch (error) {
  failures.push(`Backup directory is not writable: ${backupDirectory}`);
}
if (!process.env.TP_BACKUP_DIR) warnings.push('TP_BACKUP_DIR is not explicit; production should mount a separate persistent backup volume');
if (path.dirname(databasePath) === backupDirectory) warnings.push('Database and backups share one directory; use separate persistent volumes');

if (failures.length > 0) {
  console.error('Production preflight failed:');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`Production preflight passed for ${launchTier} launch.`);
warnings.forEach(item => console.log(`Warning: ${item}`));
