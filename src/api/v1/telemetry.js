'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const monitoring = require('../../services/ops/monitoring');

const router = express.Router();
const MAX_BATCH_SIZE = 10;
const ALLOWED_EVENTS = new Set([
  'plan_completed', 'api_error', 'agent_fallback', 'map_fallback', 'client_error'
]);
const ALLOWED_SURFACES = new Set([
  'plan', 'trip', 'journal', 'profile', 'startup', 'agent', 'map', 'unknown'
]);
const ALLOWED_MODES = new Set(['local', 'enhanced', 'snapshot', 'live', 'fallback', 'unknown']);
const ALLOWED_DURATION_BUCKETS = new Set([
  'lt_500', '500_1500', '1500_3000', '3000_5000', 'gte_5000', 'unknown'
]);
const ALLOWED_EVENT_KEYS = new Set(['event', 'surface', 'code', 'mode', 'durationBucket']);
const FORBIDDEN_KEYS = new Set([
  'content', 'freetext', 'message', 'stack', 'userid', 'tripid', 'city', 'journal',
  'photo', 'location', 'route', 'origin', 'destination', 'title', 'persona', 'url'
]);

const telemetryLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.TELEMETRY_RATE_LIMIT_PER_MINUTE) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 'TP-1429', type: 'RATE_LIMIT', userVisible: false }
});

function containsForbiddenKey(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, nested]) => {
    if (FORBIDDEN_KEYS.has(String(key).toLowerCase())) return true;
    return containsForbiddenKey(nested);
  });
}

function normalizeCode(value) {
  const code = String(value || 'UNKNOWN').slice(0, 32).toUpperCase();
  return /^[A-Z0-9_-]+$/.test(code) ? code : 'UNKNOWN';
}

function normalizeEvent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).some(key => !ALLOWED_EVENT_KEYS.has(key))) return null;
  if (!ALLOWED_EVENTS.has(value.event) || !ALLOWED_SURFACES.has(value.surface)) return null;

  const mode = ALLOWED_MODES.has(value.mode) ? value.mode : 'unknown';
  const durationBucket = ALLOWED_DURATION_BUCKETS.has(value.durationBucket)
    ? value.durationBucket
    : 'unknown';

  return {
    event: value.event,
    surface: value.surface,
    code: normalizeCode(value.code),
    mode,
    durationBucket
  };
}

router.post('/events', telemetryLimiter, (req, res) => {
  if (containsForbiddenKey(req.body)) {
    return res.status(400).json({ code: 'TP-1006', type: 'VALIDATION', userVisible: false });
  }

  const bodyKeys = req.body && typeof req.body === 'object' ? Object.keys(req.body) : [];
  if (bodyKeys.length !== 1 || bodyKeys[0] !== 'events' || !Array.isArray(req.body.events)) {
    return res.status(400).json({ code: 'TP-1006', type: 'VALIDATION', userVisible: false });
  }
  if (req.body.events.length < 1 || req.body.events.length > MAX_BATCH_SIZE) {
    return res.status(400).json({ code: 'TP-1006', type: 'VALIDATION', userVisible: false });
  }

  const events = req.body.events.map(normalizeEvent);
  if (events.some(event => event === null)) {
    return res.status(400).json({ code: 'TP-1006', type: 'VALIDATION', userVisible: false });
  }

  events.forEach(event => monitoring.recordMetric('client_event_count', 1, event));
  return res.status(202).json({ accepted: true, count: events.length });
});

router.normalizeEvent = normalizeEvent;
router.containsForbiddenKey = containsForbiddenKey;

module.exports = router;
