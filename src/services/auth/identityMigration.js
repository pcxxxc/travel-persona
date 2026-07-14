'use strict';

const crypto = require('crypto');
const dataRights = require('../journal/dataRights');
const { getStore } = require('../storage/sqliteStore');

const CLAIM_NAMESPACE = 'auth.identityClaims';
const store = getStore();

function getClaimKey(sourceUserId, targetUserId) {
  return crypto.createHash('sha256')
    .update(`${sourceUserId}>${targetUserId}`)
    .digest('hex');
}

function migrateGuestData(sourceUserId, targetUserId) {
  if (!/^guest_[a-f0-9]{32}$/i.test(String(sourceUserId || ''))) {
    throw new Error('Identity migration requires a signed guest source');
  }
  if (!/^acct_[a-f0-9]{32}$/i.test(String(targetUserId || ''))) {
    throw new Error('Identity migration requires a verified account target');
  }

  const claimKey = getClaimKey(sourceUserId, targetUserId);
  const existing = store.get(CLAIM_NAMESPACE, claimKey);
  if (existing) return { migrated: false, alreadyClaimed: true, claim: existing };

  const transfer = dataRights.transferUserData(sourceUserId, targetUserId);
  const claim = {
    sourceUserId,
    targetUserId,
    migratedAt: new Date().toISOString(),
    details: transfer.details
  };
  store.set(CLAIM_NAMESPACE, claimKey, claim);
  return { migrated: true, alreadyClaimed: false, claim };
}

function _reset() {
  store.clear(CLAIM_NAMESPACE);
}

module.exports = {
  CLAIM_NAMESPACE,
  migrateGuestData,
  getClaimKey,
  _reset
};
