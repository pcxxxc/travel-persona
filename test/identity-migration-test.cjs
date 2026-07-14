'use strict';

const assert = require('assert');
const journalService = require('../src/services/journal/journalService');
const personaCalibration = require('../src/services/journal/personaCalibration');
const travelTrace = require('../src/services/journal/travelTrace');
const dataRights = require('../src/services/journal/dataRights');
const { deriveAccountUserId } = require('../src/services/auth/identityProvider');
const identityMigration = require('../src/services/auth/identityMigration');
const { getStore } = require('../src/services/storage/sqliteStore');

function run() {
  dataRights._reset();
  identityMigration._reset();

  const guestUserId = `guest_${'a'.repeat(32)}`;
  const accountUserId = deriveAccountUserId(
    'provider-subject-that-must-not-be-stored',
    'travel-persona-test',
    'migration-secret-longer-than-thirty-two-characters'
  );

  const entry = journalService.createEntry(guestUserId, {
    type: 'review',
    content: '这次少赶路让我更喜欢完整停留。',
    analysisAuthorized: false,
    reviewSnapshot: {
      tripCompleted: true,
      worth: 'worth_it',
      values: ['own_time'],
      deviations: ['longer_stays']
    }
  });
  journalService.setAnalysisAuthorization(entry.id, true, guestUserId);
  travelTrace.recordTrip(guestUserId, {
    tripId: 'trip_identity_migration',
    title: '游客行程',
    cities: ['北京', '天津'],
    status: 'planning'
  });
  travelTrace.addWish(guestUserId, 'yangzhou');

  const sourceProfile = personaCalibration.getOrCreateProfile(guestUserId);
  sourceProfile.traits.culture.mean = 0.82;
  sourceProfile.traits.culture.confidence = 0.78;
  sourceProfile.traits.culture.evidenceCount = 3;
  sourceProfile.traits.nature.mean = 0.76;
  sourceProfile.traits.nature.confidence = 0.7;
  sourceProfile.traits.nature.evidenceCount = 2;
  personaCalibration.lockTrait(sourceProfile, 'culture');

  const targetProfile = personaCalibration.getOrCreateProfile(accountUserId);
  targetProfile.traits.culture.mean = 0.31;
  targetProfile.traits.culture.confidence = 0.61;
  targetProfile.traits.culture.evidenceCount = 2;
  personaCalibration.lockTrait(targetProfile, 'transit');

  dataRights.updatePrivacySettings(guestUserId, {
    analysisConsent: true,
    photoAnalysisEnabled: true,
    locationPrecision: 'exact',
    dataRetentionDays: 365
  });
  dataRights.updatePrivacySettings(accountUserId, {
    analysisConsent: false,
    photoAnalysisEnabled: false,
    locationPrecision: 'city',
    dataRetentionDays: 90
  });

  const first = identityMigration.migrateGuestData(guestUserId, accountUserId);
  assert.strictEqual(first.migrated, true);
  assert.strictEqual(journalService.getEntries(guestUserId).length, 0);
  assert.strictEqual(journalService.getEntries(accountUserId).length, 1);
  assert.strictEqual(journalService.getEvidencePool(accountUserId).length, 1);
  assert.strictEqual(travelTrace.getTravelTrace(guestUserId).length, 0);
  assert.strictEqual(travelTrace.getTravelTrace(accountUserId).length, 1);
  assert.deepStrictEqual(travelTrace.getVisitMap(accountUserId).wished, ['yangzhou']);

  const mergedProfile = personaCalibration.getProfile(accountUserId);
  assert.strictEqual(mergedProfile.traits.culture.mean, 0.82);
  assert.strictEqual(mergedProfile.traits.nature.mean, 0.76);
  assert.ok(mergedProfile.lockedTraits.includes('culture'));
  assert.ok(mergedProfile.lockedTraits.includes('transit'));
  const privacy = dataRights.getPrivacySettings(accountUserId);
  assert.strictEqual(privacy.analysisConsent, false);
  assert.strictEqual(privacy.photoAnalysisEnabled, false);
  assert.strictEqual(privacy.locationPrecision, 'city');
  assert.strictEqual(privacy.dataRetentionDays, 90);

  const second = identityMigration.migrateGuestData(guestUserId, accountUserId);
  assert.strictEqual(second.alreadyClaimed, true);
  assert.strictEqual(journalService.getEntries(accountUserId).length, 1);
  const storedClaims = getStore().list(identityMigration.CLAIM_NAMESPACE);
  assert.strictEqual(storedClaims.length, 1);
  assert.ok(!JSON.stringify(storedClaims).includes('provider-subject-that-must-not-be-stored'));

  console.log('Identity migration tests passed.');
}

run();
