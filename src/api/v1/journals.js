/**
 * 旅格 Travel Persona · API v1 手账路由
 * Phase 4：手账、旅格轨迹与人格校准
 */

const express = require('express');
const router = express.Router();
const journalService = require('../../services/journal/journalService');
const personaCalibration = require('../../services/journal/personaCalibration');
const travelTrace = require('../../services/journal/travelTrace');
const dataRights = require('../../services/journal/dataRights');
const contentSafety = require('../../services/ops/contentSafety');
const semanticContentSafety = require('../../services/ops/semanticContentSafety');
const growthTimeline = require('../../services/journal/growthTimeline');
const { ValidationError } = require('../../utils/errors');

function sendRouteError(res, status, { code, type, message, userMessage, userVisible = false }) {
  return res.status(status).json({
    code,
    type,
    message,
    ...(userMessage ? { userMessage } : {}),
    userVisible
  });
}

function logRouteError(operation, error) {
  console.warn(`[journals:${operation}]`, error && error.message ? error.message : error);
}

// 用户识别优先使用服务端签名访客会话；测试环境可显式启用 header。
function getUserId(req) {
  const trustedSessionUser = String(req.userId || '');
  if (/^[a-zA-Z0-9_-]{3,80}$/.test(trustedSessionUser)) return trustedSessionUser;
  if (process.env.NODE_ENV === 'test' || process.env.ALLOW_INSECURE_USER_HEADER === 'true') {
    const testCandidate = String(req.headers['x-user-id'] || 'test_anonymous');
    return /^[a-zA-Z0-9_-]{3,80}$/.test(testCandidate) ? testCandidate : 'test_anonymous';
  }
  throw new Error('Missing trusted user session');
}

// --- 手账条目 ---

router.post('/entries', async (req, res) => {
  try {
    const userId = getUserId(req);
    const requested = req.body || {};
    const safety = await semanticContentSafety.checkInput(requested.content || '', { surface: 'journal-create' });
    const associatedTrip = requested.tripId
      ? travelTrace.getTravelTrace(userId).find(trip => trip.tripId === requested.tripId)
      : null;
    const entry = journalService.createEntry(userId, {
      ...requested,
      reviewSnapshot: requested.reviewSnapshot ? {
        ...requested.reviewSnapshot,
        tripCompleted: associatedTrip?.status === travelTrace.TRIP_STATUS.COMPLETED,
        actualSummary: associatedTrip ? travelTrace.buildActualTripSummary(associatedTrip) : null
      } : null,
      sensitivityLevel: safety.sensitivityLevel
    });
    res.status(201).json(entry);
  } catch (error) {
    logRouteError('create-entry', error);
    sendRouteError(res, 400, {
      code: 'TP-1006', type: 'VALIDATION', message: 'Journal entry validation failed',
      userMessage: '这条手账暂时无法保存，请检查内容后再试。', userVisible: true
    });
  }
});

router.get('/entries', (req, res) => {
  const userId = getUserId(req);
  const entries = journalService.getEntries(userId, req.query);
  res.json({ entries });
});

router.put('/entries/:entryId', async (req, res) => {
  try {
    const userId = getUserId(req);
    const updates = { ...(req.body || {}) };
    if (typeof updates.content === 'string') {
      const safety = await semanticContentSafety.checkInput(updates.content, { surface: 'journal-update' });
      updates.sensitivityLevel = safety.sensitivityLevel;
    }
    const updated = journalService.updateEntry(req.params.entryId, updates, userId);
    personaCalibration.reconcilePendingProposals(
      userId,
      journalService.getEvidencePool(userId).map(item => item.id)
    );
    res.json(updated);
  } catch (error) {
    logRouteError('update-entry', error);
    sendRouteError(res, 404, { code: 'TP-2001', type: 'DATA', message: 'Journal entry not available' });
  }
});

router.delete('/entries/:entryId', (req, res) => {
  try {
    const userId = getUserId(req);
    journalService.deleteEntry(req.params.entryId, userId);
    personaCalibration.reconcilePendingProposals(
      userId,
      journalService.getEvidencePool(userId).map(item => item.id)
    );
    res.status(204).send();
  } catch (error) {
    logRouteError('delete-entry', error);
    sendRouteError(res, 404, { code: 'TP-2001', type: 'DATA', message: 'Journal entry not available' });
  }
});

router.post('/entries/:entryId/authorize', (req, res) => {
  try {
    const userId = getUserId(req);
    const { authorized } = req.body;
    const entry = journalService.setAnalysisAuthorization(req.params.entryId, authorized, userId);
    const evidence = authorized
      ? journalService.getEvidencePool(userId).filter(item => item.sourceEntryId === entry.id)
      : [];
    const proposals = authorized
      ? personaCalibration.generateUpdateProposal(userId, evidence, {
        contextEvidence: journalService.getEvidencePool(userId)
      })
      : [];
    if (!authorized) {
      personaCalibration.reconcilePendingProposals(
        userId,
        journalService.getEvidencePool(userId).map(item => item.id)
      );
    }
    res.json({ ...entry, proposals });
  } catch (error) {
    logRouteError('authorize-entry', error);
    sendRouteError(res, 400, {
      code: 'TP-1006', type: 'VALIDATION', message: 'Journal authorization failed',
      userMessage: '这条手账的分析授权没有更新，请稍后再试。', userVisible: true
    });
  }
});

// --- 人格校准 ---

router.get('/persona/proposals', (req, res) => {
  const userId = getUserId(req);
  const profile = personaCalibration.getOrCreateProfile(userId);
  const contextEvidence = journalService.getEvidencePool(userId);
  personaCalibration.reconcilePendingProposals(userId, contextEvidence.map(item => item.id));
  const proposals = personaCalibration.getProposals
    ? personaCalibration.getProposals(userId).map(proposal => {
      return personaCalibration.enrichProposalAudit(proposal, contextEvidence, profile.excludedEvidenceIds || []);
    })
    : [];
  res.json({ proposals });
});

router.get('/persona/profile', (req, res) => {
  const userId = getUserId(req);
  const activeEvidenceIds = journalService.getEvidencePool(userId).map(item => item.id);
  res.json(personaCalibration.getAuditedProfile(userId, activeEvidenceIds));
});

router.get('/persona/timeline', (req, res) => {
  const userId = getUserId(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20);
  res.json(contentSafety.sanitizeOutputValue(growthTimeline.buildGrowthTimeline(userId, { limit })));
});

router.post('/persona/proposals/:proposalId/accept', (req, res) => {
  try {
    const userId = getUserId(req);
    const result = personaCalibration.acceptProposal(req.params.proposalId, userId);
    res.json(result);
  } catch (error) {
    logRouteError('accept-proposal', error);
    sendRouteError(res, 400, {
      code: 'TP-3001', type: 'ALGORITHM', message: 'Persona proposal could not be accepted',
      userMessage: '这项变化暂时没有保存，请稍后再试。', userVisible: true
    });
  }
});

router.post('/persona/proposals/:proposalId/reject', (req, res) => {
  try {
    const userId = getUserId(req);
    const { reason } = req.body;
    const result = personaCalibration.rejectProposal(req.params.proposalId, reason, userId);
    res.json(result);
  } catch (error) {
    logRouteError('reject-proposal', error);
    sendRouteError(res, 400, {
      code: 'TP-3001', type: 'ALGORITHM', message: 'Persona proposal could not be rejected',
      userMessage: '这项反馈暂时没有保存，请稍后再试。', userVisible: true
    });
  }
});

router.post('/persona/traits/:traitKey/reassess', (req, res) => {
  try {
    const userId = getUserId(req);
    res.json(personaCalibration.reassessTrait(userId, req.params.traitKey, req.body || {}));
  } catch (error) {
    logRouteError('reassess-trait', error);
    sendRouteError(res, 400, {
      code: 'TP-3002', type: 'ALGORITHM', message: 'Trait reassessment could not be saved',
      userMessage: '这次旅格复核暂时没有保存，请检查选择后再试。', userVisible: true
    });
  }
});

router.post('/persona/lock/:traitKey', (req, res) => {
  const userId = getUserId(req);
  const personaProfile = personaCalibration.getOrCreateProfile(userId);
  const result = personaCalibration.lockTrait(personaProfile, req.params.traitKey);
  res.json(result);
});

// --- 旅格轨迹 ---

router.post('/travel-trace', (req, res) => {
  try {
    const userId = getUserId(req);
    res.status(201).json(travelTrace.recordTrip(userId, req.body));
  } catch (error) {
    logRouteError('create-trace', error);
    sendRouteError(res, 400, {
      code: 'TP-1006', type: 'VALIDATION', message: 'Travel trace validation failed',
      userMessage: '这次旅行暂时无法记录，请检查内容后再试。', userVisible: true
    });
  }
});

router.get('/travel-trace', (req, res) => {
  const userId = getUserId(req);
  const trace = travelTrace.getTravelTrace(userId);
  const stats = travelTrace.getTripStats(userId);
  res.json({ trace, stats });
});

router.put('/travel-trace/:tripId', (req, res) => {
  try {
    const userId = getUserId(req);
    res.json(travelTrace.updateTrip(req.params.tripId, req.body, userId));
  } catch (error) {
    logRouteError('update-trace', error);
    const operation = error instanceof ValidationError ? error.context?.operation : null;
    const completionBlocked = operation === 'completeTrip';
    const realityBlocked = ['startTrip', 'recordTripReality'].includes(operation);
    const scheduleBlocked = operation === 'scheduleTrip';
    const validationBlocked = completionBlocked || realityBlocked || scheduleBlocked;
    sendRouteError(res, validationBlocked ? 400 : 404, {
      code: validationBlocked ? 'TP-1006' : 'TP-2001',
      type: validationBlocked ? 'VALIDATION' : 'DATA',
      message: completionBlocked
        ? 'Trip cannot be completed before its end date'
        : scheduleBlocked ? 'Trip schedule is required before reality or completion'
          : realityBlocked ? 'Trip reality cannot be recorded before departure' : 'Travel trace not available',
      userMessage: completionBlocked
        ? '旅行结束后才能标记为已完成。'
        : scheduleBlocked ? '先安排出发日期，再开始记录真实行程。'
          : realityBlocked ? '到出发日后再开始记录真实行程。' : undefined,
      userVisible: validationBlocked
    });
  }
});

router.delete('/travel-trace/:tripId', (req, res) => {
  try {
    const userId = getUserId(req);
    journalService.getEntries(userId)
      .filter(entry => entry.tripId === req.params.tripId)
      .forEach(entry => journalService.updateEntry(entry.id, { tripId: null }, userId));
    travelTrace.deleteTrip(req.params.tripId, userId);
    res.status(204).send();
  } catch (error) {
    logRouteError('delete-trace', error);
    sendRouteError(res, 404, { code: 'TP-2001', type: 'DATA', message: 'Travel trace not available' });
  }
});

router.get('/visit-map', (req, res) => {
  const userId = getUserId(req);
  const map = travelTrace.getVisitMap(userId);
  res.json(map);
});

// --- 书签（收藏标记） ---

/**
 * POST /api/v1/journals/entries/:entryId/bookmark
 * 给手账条目标记收藏类型
 * Body: { type: 'wishlist' | 'avoid' | null }
 *
 * 收藏不代表喜欢，只表示"暂存待决定"。
 */
router.post('/entries/:entryId/bookmark', (req, res) => {
  try {
    const userId = getUserId(req);
    const { type } = req.body;
    const bookmark = journalService.setBookmark(req.params.entryId, type, userId);
    res.json(bookmark);
  } catch (error) {
    logRouteError('bookmark-entry', error);
    sendRouteError(res, error instanceof ValidationError ? 400 : 404, {
      code: error instanceof ValidationError ? 'TP-1006' : 'TP-2001',
      type: error instanceof ValidationError ? 'VALIDATION' : 'DATA',
      message: error instanceof ValidationError ? 'Bookmark validation failed' : 'Journal entry not available',
      userMessage: error instanceof ValidationError
        ? '收藏标记更新失败，请检查请求内容。'
        : undefined,
      userVisible: error instanceof ValidationError
    });
  }
});

/**
 * GET /api/v1/journals/bookmarks
 * 查询用户所有书签
 * Query: ?type=wishlist|avoid
 */
router.get('/bookmarks', (req, res) => {
  const userId = getUserId(req);
  const bookmarks = journalService.getBookmarks(userId, req.query);
  res.json({ bookmarks });
});

// --- 隐式反馈机制 ---

/**
 * POST /api/v1/journals/implicit-signal
 * 记录隐式信号（反复查看、停留时长、删城、路径切换）
 * Body: { type: 'repeatedView'|'longStay'|'cityRemoved'|'pathSwitch', targetId, weight? }
 *
 * 隐式信号权重极低（0.02-0.05），仅用于推荐排序的轻微先验，不写入长期人格画像。
 * 隐式信号存储在单独的 ephemeral 区域，不与人格证据混存。
 */
router.post('/implicit-signal', (req, res) => {
  try {
    const userId = getUserId(req);
    const signal = journalService.recordImplicitSignal(userId, req.body || {});
    res.status(201).json(signal);
  } catch (error) {
    logRouteError('implicit-signal', error);
    sendRouteError(res, 400, {
      code: 'TP-1006', type: 'VALIDATION', message: 'Implicit signal validation failed',
      userMessage: '信号记录失败，请检查请求内容。', userVisible: true
    });
  }
});

/**
 * GET /api/v1/journals/implicit-signal
 * 查询用户所有隐式信号
 * Query: ?type=repeatedView|longStay|cityRemoved|pathSwitch&targetId=xxx
 *
 * 用户能查看"这条线索为什么被使用"
 */
router.get('/implicit-signal', (req, res) => {
  const userId = getUserId(req);
  const signals = journalService.getImplicitSignals(userId, req.query);
  res.json({ signals });
});

/**
 * DELETE /api/v1/journals/implicit-signal
 * 删除用户所有隐式信号（或按条件删除）
 * Query: ?type=repeatedView|longStay|cityRemoved|pathSwitch&targetId=xxx&signalId=xxx
 *
 * 用户能撤回/删除所有隐式信号
 */
router.delete('/implicit-signal', (req, res) => {
  const userId = getUserId(req);
  const result = journalService.deleteImplicitSignals(userId, req.query);
  res.json(result);
});

// --- 数据权利 ---

router.get('/data/export', (req, res) => {
  const userId = getUserId(req);
  const data = dataRights.exportUserData(userId);
  res.json(data);
});

router.delete('/data/delete', (req, res) => {
  const userId = getUserId(req);
  const result = dataRights.deleteUserData(userId);
  res.json(result);
});

router.post('/data/disable-personalization', (req, res) => {
  const userId = getUserId(req);
  const result = dataRights.disablePersonalization(userId);
  res.json(result);
});

router.get('/privacy/settings', (req, res) => {
  const userId = getUserId(req);
  const settings = dataRights.getPrivacySettings(userId);
  res.json(settings);
});

router.put('/privacy/settings', (req, res) => {
  const userId = getUserId(req);
  const settings = dataRights.updatePrivacySettings(userId, req.body);
  res.json(settings);
});

module.exports = router;
