'use strict';

const journalService = require('./journalService');
const personaCalibration = require('./personaCalibration');
const travelTrace = require('./travelTrace');

const TRAIT_LABELS = {
  restoration: '恢复需求', nature: '自然偏好', culture: '文化兴趣', food: '美食兴趣',
  pace: '旅行节奏', social: '社交需求', budget: '预算取向', aesthetics: '审美取向',
  comfort: '舒适需求', novelty: '新鲜感', transit: '交通效率', lowCrowd: '低拥挤偏好',
  authenticity: '在地真实感', weatherFlex: '天气弹性', bookingEase: '预约接受度', workation: '旅居倾向'
};

const MOOD_LABELS = {
  restore: '恢复充能', escape: '逃离日常', inspire: '寻找灵感',
  social: '与人连接', efficient: '高效探索', live: '像当地人一样'
};

function safeDate(value, fallback) {
  const date = new Date(value || fallback || 0);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function buildPlanEvent(trip) {
  const cityCount = new Set(trip.cities || []).size;
  const routeName = trip.title || (trip.cities || []).join(' → ') || '一次旅行选择';
  return {
    id: `plan:${trip.tripId}`,
    type: 'plan',
    occurredAt: safeDate(trip.createdAt, trip.startDate),
    title: '保存了一次旅行选择',
    summary: `${routeName}${cityCount ? ` · ${cityCount} 个路线节点` : ''}`,
    tripId: trip.tripId,
    status: trip.status
  };
}

function buildEvidenceEvent(entry) {
  const mood = MOOD_LABELS[entry.mood] || '未贴状态标签';
  const routeDecision = entry.decisionContext?.kind === 'route_change';
  const completeReview = Boolean(entry.reviewSnapshot?.complete);
  return {
    id: `evidence:${entry.id}`,
    type: 'evidence',
    occurredAt: safeDate(entry.updatedAt, entry.createdAt),
    title: completeReview ? '一趟完整复盘进入证据池' : routeDecision ? '一次路线取舍成为旅格证据' : '一条真实体验进入证据池',
    summary: completeReview
      ? `${mood} · 已对照是否值得、留下了什么和计划差异，不复述原文`
      : routeDecision
      ? `${entry.decisionContext.city || '路线调整'} · ${mood} · 只保留你授权的结构化线索`
      : `${mood} · 系统只保留结构化变化线索，不在这里复述原文`,
    tripId: entry.tripId || null
  };
}

function buildRouteChangeEvent(trip, change) {
  const undone = change.status === 'undone';
  const explained = Boolean(change.explainedEntryId);
  const authorized = explained && Boolean(change.explanationAuthorized);
  let summary = `${change.city || '一个城市'}已从路线移除 · 删除本身不会改写旅格`;
  if (explained) summary = authorized
    ? `${change.city || '这次取舍'} · 你已允许自己的解释进入证据池`
    : `${change.city || '这次取舍'} · 原因已记录，只保存未分析`;
  if (undone) summary = explained
    ? `${change.city || '这个城市'}已恢复 · 关联解释不会继续作为旅格证据`
    : `${change.city || '这个城市'}已恢复 · 这次操作从未进入旅格证据`;
  return {
    id: `decision:${trip.tripId}:${change.id}`,
    type: 'decision',
    occurredAt: safeDate(change.undoneAt || change.occurredAt, trip.updatedAt),
    title: undone ? '撤销了一次路线取舍' : '调整了一次行程路线',
    summary,
    tripId: trip.tripId,
    status: change.status || 'active'
  };
}

function buildRealityEvent(trip) {
  const actual = travelTrace.buildActualTripSummary(trip);
  if (!actual.hasRecords) return null;
  const parts = [`到访 ${actual.counts.visited}`];
  if (actual.counts.skipped) parts.push(`跳过 ${actual.counts.skipped}`);
  if (actual.counts.added) parts.push(`临时新增 ${actual.counts.added}`);
  if (actual.counts.stayChanged) parts.push(`停留调整 ${actual.counts.stayChanged}`);
  return {
    id: `reality:${trip.tripId}`,
    type: 'reality',
    occurredAt: safeDate(trip.updatedAt, trip.startDate),
    title: '计划和实际开始有了对照',
    summary: `${parts.join(' · ')} · 这些实况默认不进入人格证据`,
    tripId: trip.tripId
  };
}

function buildConfirmedEvent(proposal, activeEvidenceIds = new Set()) {
  const direction = Number(proposal.delta) >= 0 ? '提高' : '降低';
  const percent = Math.round(Math.abs(Number(proposal.delta) || 0) * 100);
  const label = TRAIT_LABELS[proposal.traitKey] || proposal.traitKey;
  const sourceEvidenceIds = Array.isArray(proposal.evidenceIds) ? proposal.evidenceIds : [];
  const activeEvidenceCount = sourceEvidenceIds.filter(id => activeEvidenceIds.has(id)).length;
  const sourceWithdrawn = sourceEvidenceIds.length > 0 && activeEvidenceCount === 0;
  return {
    id: `confirmed:${proposal.id}`,
    type: 'confirmed',
    occurredAt: safeDate(proposal.appliedAt, proposal.createdAt),
    title: proposal.sourceType === 'userReassessment' ? `你重新定位了“${label}”` : `你确认了“${label}”的变化`,
    summary: proposal.sourceType === 'userReassessment'
      ? `由你主动复核到 ${Math.round(Number(proposal.proposedValue) * 100)}% · 之后会参与新的推荐`
      : sourceWithdrawn
        ? `${direction} ${percent}% · 来源证据已撤回；因为这是你亲自确认的判断，当前仍保留并可随时复核`
        : `${direction} ${percent}% · 仍有 ${activeEvidenceCount || proposal.evidenceCount || sourceEvidenceIds.length || 1} 条有效证据，之后会参与新的推荐`,
    traitKey: proposal.traitKey,
    delta: Number(proposal.delta) || 0,
    sourceEvidenceWithdrawn: sourceWithdrawn,
    activeEvidenceCount
  };
}

function buildReconfirmationEvent(item) {
  const label = TRAIT_LABELS[item.traitKey] || item.traitKey;
  return {
    id: `reconfirmed:${item.id}`,
    type: 'reconfirmed',
    occurredAt: safeDate(item.createdAt),
    title: `你复核了“${label}”`,
    summary: '仍然准确 · 这次确认只提高把握，不改变维度位置',
    traitKey: item.traitKey
  };
}

function buildNextStep(summary) {
  if (summary.plannedTrips === 0) return '先完成一次真实规划，让系统有一个可被后续体验修正的起点。';
  if (summary.authorizedEvidence === 0 && summary.actualUpdates === 0) {
    return '旅行中先标记实际到访、跳过或临时增加；旅行后再写下一次真正喜欢、消耗或改变主意的体验，并由你决定是否让它进入旅格分析。';
  }
  if (summary.authorizedEvidence === 0) {
    return '你已经留下计划与实况的差异；再写下其中一次真正喜欢、消耗或改变主意的体验，并由你决定是否让它进入旅格分析。';
  }
  if (summary.confirmedChanges === 0) return '已经有体验成为证据；等线索达到门槛后，再由你决定要不要更新长期人格。';
  if (summary.confirmedChanges < 3) return '再记录 1–2 次不同旅行中的支持或相反体验；系统会据此区分当时状态和长期倾向。';
  return '继续记录反例和意外变化，它们能防止长期人格变成一成不变的标签。';
}

function buildGrowthTimeline(userId, options = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 20);
  const trips = travelTrace.getTravelTrace(userId);
  const activeEvidence = journalService.getEvidencePool(userId);
  const activeEvidenceIds = new Set(activeEvidence.map(evidence => evidence.id));
  const activeEvidenceEntries = new Set(activeEvidence.map(evidence => evidence.sourceEntryId).filter(Boolean));
  const entries = journalService.getEntries(userId).filter(entry => {
    return entry.analysisAuthorized
      && entry.sensitivityLevel !== 'restricted'
      && activeEvidenceEntries.has(entry.id);
  });
  const proposals = personaCalibration.getProposals(userId);
  const accepted = proposals.filter(proposal => proposal.status === personaCalibration.PROPOSAL_STATUS.ACCEPTED);
  const profile = personaCalibration.getOrCreateProfile(userId);
  const reconfirmed = (profile.reassessmentHistory || []).filter(item => item.status === 'confirmed');
  const routeDecisionEvents = trips.flatMap(trip => {
    return (Array.isArray(trip.routeChanges) ? trip.routeChanges : []).map(change => buildRouteChangeEvent(trip, change));
  });
  const realityEvents = trips.map(buildRealityEvent).filter(Boolean);

  const events = [
    ...trips.map(buildPlanEvent),
    ...routeDecisionEvents,
    ...realityEvents,
    ...entries.map(buildEvidenceEvent),
    ...accepted.map(proposal => buildConfirmedEvent(proposal, activeEvidenceIds)),
    ...reconfirmed.map(buildReconfirmationEvent)
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const summary = {
    plannedTrips: trips.length,
    authorizedEvidence: entries.length,
    confirmedChanges: accepted.length + reconfirmed.length,
    confirmedWithoutActiveEvidence: accepted.filter(proposal => {
      const ids = Array.isArray(proposal.evidenceIds) ? proposal.evidenceIds : [];
      return ids.length > 0 && ids.every(id => !activeEvidenceIds.has(id));
    }).length,
    activeDimensions: new Set([...accepted.map(item => item.traitKey), ...reconfirmed.map(item => item.traitKey)]).size,
    routeDecisions: routeDecisionEvents.length,
    actualUpdates: realityEvents.length
  };

  return {
    events: events.slice(0, limit),
    summary,
    nextStep: buildNextStep(summary),
    privacy: {
      rawJournalIncluded: false,
      sensitiveInferencesIncluded: false
    }
  };
}

module.exports = { buildGrowthTimeline };
