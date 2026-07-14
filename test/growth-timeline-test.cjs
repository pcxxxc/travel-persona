'use strict';

const assert = require('assert');
const dataRights = require('../src/services/journal/dataRights');
const journalService = require('../src/services/journal/journalService');
const personaCalibration = require('../src/services/journal/personaCalibration');
const travelTrace = require('../src/services/journal/travelTrace');
const { buildGrowthTimeline } = require('../src/services/journal/growthTimeline');

dataRights._reset();

const userId = 'timeline_user';
const COMPLETE_REVIEW = { worth: 'worth_it', values: ['arrived'], deviations: ['as_planned'], tripCompleted: true };
travelTrace.recordTrip(userId, {
  tripId: 'timeline_trip',
  title: '茂名 → 北京 → 茂名 · 平衡高效版',
  cities: ['茂名', '长沙', '北京', '南京', '茂名'],
  status: 'planning',
  routeChanges: [{
    id: 'route_change_timeline_1',
    type: 'city_removed',
    city: '广州',
    originalIndex: 1,
    nodeSnapshot: { city: '广州', stay: 2 },
    status: 'active',
    occurredAt: '2026-07-13T08:00:00.000Z'
  }]
});

const choiceOnlyTimeline = buildGrowthTimeline(userId);
assert.ok(choiceOnlyTimeline.events.some(event => event.type === 'decision'), '路线删改应成为可回看的取舍事件');
assert.strictEqual(choiceOnlyTimeline.summary.routeDecisions, 1);
assert.strictEqual(choiceOnlyTimeline.summary.authorizedEvidence, 0, '删城动作本身不得成为人格证据');
assert.match(choiceOnlyTimeline.nextStep, /旅行后再写/);
assert.match(choiceOnlyTimeline.nextStep, /由你决定是否让它进入旅格分析/);
assert.doesNotMatch(choiceOnlyTimeline.nextStep, /只需标记/);

const rawText = '我发现高效不是打卡更多。少搬几次行李、减少折返以后，我在街区里留得更久。';
const entry = journalService.createEntry(userId, {
  type: 'review',
  reviewSnapshot: COMPLETE_REVIEW,
  tripId: 'timeline_trip',
  content: rawText,
  mood: 'efficient',
  decisionContext: {
    kind: 'route_change',
    action: 'city_removed',
    changeId: 'route_change_timeline_1',
    city: '广州',
    reasonCategory: 'pace'
  },
  sensitivityLevel: 'normal'
});
assert.strictEqual(journalService.getEvidencePool(userId).length, 0, '未授权的路线解释不得进入证据池');
journalService.setAnalysisAuthorization(entry.id, true, userId);

const evidence = journalService.getEvidencePool(userId).filter(item => item.sourceEntryId === entry.id);
assert.strictEqual(evidence[0].decisionContext.city, '广州', '授权后应保留结构化取舍上下文');
const proposals = personaCalibration.generateUpdateProposal(userId, evidence);
assert.ok(proposals.length > 0, '真实复盘应形成候选变化');
personaCalibration.acceptProposal(proposals[0].id, userId);

const privateEntry = journalService.createEntry(userId, {
  type: 'review',
  content: '这是一段不会进入人格时间线的高度私密原文',
  mood: 'restore',
  sensitivityLevel: 'restricted'
});
journalService.setAnalysisAuthorization(privateEntry.id, true, userId);
assert.strictEqual(journalService.getEntries(userId).find(item => item.id === privateEntry.id).analysisAuthorized, false);

const timeline = buildGrowthTimeline(userId);
const types = new Set(timeline.events.map(event => event.type));
assert.ok(types.has('plan'));
assert.ok(types.has('decision'));
assert.ok(types.has('evidence'));
assert.ok(types.has('confirmed'));
assert.strictEqual(timeline.summary.plannedTrips, 1);
assert.strictEqual(timeline.summary.authorizedEvidence, 1, 'restricted 记录不得成为成长事件');
assert.strictEqual(timeline.summary.confirmedChanges, 1);
assert.strictEqual(timeline.privacy.rawJournalIncluded, false);
assert.match(timeline.nextStep, /支持或相反体验/);
assert.doesNotMatch(timeline.nextStep, /实际到访/);
assert.ok(!JSON.stringify(timeline).includes(rawText), '时间线不得复述手账原文');
assert.ok(!JSON.stringify(timeline).includes(privateEntry.content), '时间线不得暴露私密原文');

journalService.setAnalysisAuthorization(entry.id, false, userId);
const auditedProfile = personaCalibration.getAuditedProfile(userId, []);
assert.strictEqual(auditedProfile.traits[proposals[0].traitKey].activeEvidenceCount, 0);
assert.strictEqual(auditedProfile.traits[proposals[0].traitKey].evidenceStatus, 'confirmed-source-withdrawn');
const withdrawnTimeline = buildGrowthTimeline(userId);
const confirmedAfterWithdrawal = withdrawnTimeline.events.find(event => event.type === 'confirmed');
assert.strictEqual(withdrawnTimeline.summary.confirmedWithoutActiveEvidence, 1);
assert.strictEqual(confirmedAfterWithdrawal.sourceEvidenceWithdrawn, true);
assert.match(confirmedAfterWithdrawal.summary, /来源证据已撤回/);
assert.doesNotMatch(confirmedAfterWithdrawal.summary, /有效证据/);

const otherUserTimeline = buildGrowthTimeline('timeline_other');
assert.strictEqual(otherUserTimeline.events.length, 0, '不同用户的成长轨迹必须隔离');

const revokeUser = 'timeline_revoke_user';
const revokeEntry = journalService.createEntry(revokeUser, {
  type: 'review',
  reviewSnapshot: COMPLETE_REVIEW,
  content: '我删掉一站是因为不想赶路，想多留一点完整时间。',
  sensitivityLevel: 'normal'
});
journalService.setAnalysisAuthorization(revokeEntry.id, true, revokeUser);
const revokeEvidence = journalService.getEvidencePool(revokeUser);
const revokeProposals = personaCalibration.generateUpdateProposal(revokeUser, revokeEvidence);
assert.ok(revokeProposals.length > 0, '授权解释应能形成待确认线索');
journalService.setAnalysisAuthorization(revokeEntry.id, false, revokeUser);
const reconciliation = personaCalibration.reconcilePendingProposals(
  revokeUser,
  journalService.getEvidencePool(revokeUser).map(item => item.id)
);
assert.ok(reconciliation.invalidatedProposalIds.length > 0, '撤回证据后相关待确认提案应失效');
assert.strictEqual(personaCalibration.getPendingProposals(revokeUser).length, 0);
assert.strictEqual(personaCalibration.getProposals(revokeUser)[0].supersededReason, 'evidence-revoked');

dataRights._reset();
console.log('Growth timeline tests passed.');
