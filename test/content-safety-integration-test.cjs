'use strict';

const assert = require('assert');
const contentSafety = require('../src/services/ops/contentSafety');
const journal = require('../src/services/journal/journalService');
const rights = require('../src/services/journal/dataRights');

rights._reset();

const privateText = '我失业后得了抑郁症，手机号是13800138000，但仍想把旅行记下来。';
assert.strictEqual(contentSafety.getSensitivityLevel(privateText), 'restricted');

const entry = journal.createEntry('safety_user', {
  type: 'review',
  content: privateText,
  mood: 'restore',
  sensitivityLevel: contentSafety.getSensitivityLevel(privateText)
});
journal.setAnalysisAuthorization(entry.id, true);
assert.strictEqual(journal.getEvidencePool('safety_user').length, 0, 'restricted private content must never enter persona evidence');

const sanitized = contentSafety.sanitizeOutputValue({
  reason: privateText,
  nested: ['联系微信 traveler_2026']
});
assert.ok(!sanitized.reason.includes('抑郁症'));
assert.ok(!sanitized.reason.includes('13800138000'));
assert.ok(!sanitized.nested[0].includes('traveler_2026'));

rights._reset();
console.log('Content safety integration tests passed.');

