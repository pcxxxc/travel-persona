'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.ALLOW_INSECURE_USER_HEADER = 'true';
process.env.PORT = '0';
process.env.SESSION_SECRET = 'trip-reality-test-secret-32-characters';

const app = require('../server');
const rights = require('../src/services/journal/dataRights');
const trace = require('../src/services/journal/travelTrace');
const journal = require('../src/services/journal/journalService');
const { buildGrowthTimeline } = require('../src/services/journal/growthTimeline');
const { COOKIE_NAME, verifySessionToken } = require('../src/services/auth/guestSession');

const root = path.join(__dirname, '..');

function event(id, type, city, options = {}) {
  return {
    id,
    type,
    city,
    planned: options.planned !== false,
    plannedStay: options.plannedStay ?? 2,
    actualStay: options.actualStay ?? (type === 'city_skipped' ? 0 : 2),
    status: options.status || 'active',
    occurredAt: options.occurredAt || '2026-01-10T08:00:00.000Z',
    note: '这段文字不得进入结构化实况'
  };
}

async function run() {
  rights._reset();
  const agent = request.agent(app);
  const sessionResponse = await agent.get('/api/v1/journals/persona/profile').expect(200);
  const cookie = (sessionResponse.headers['set-cookie'] || []).find(item => item.startsWith(`${COOKIE_NAME}=`));
  const token = decodeURIComponent(cookie.split(';')[0].split('=').slice(1).join('='));
  const sessionId = verifySessionToken(token, process.env.SESSION_SECRET);
  const userId = `guest_${sessionId.replace(/-/g, '')}`;
  const planSnapshot = {
    selectedPlan: {
      totalDays: 10,
      nodes: [
        { city: '上海', stay: 0.5 },
        { city: '杭州', stay: 2 },
        { city: '武汉', stay: 2 },
        { city: '成都', stay: 4 },
        { city: '上海', stay: 0.5 }
      ]
    }
  };

  const unscheduled = trace.recordTrip(userId, {
    tripId: 'unscheduled_trip', status: 'planning', cities: ['上海', '成都'], planSnapshot
  });
  assert.throws(() => trace.updateTrip(unscheduled.tripId, { status: 'ongoing' }, userId), /未安排出发日期/);
  assert.throws(() => trace.updateTrip(unscheduled.tripId, { status: 'completed' }, userId), /未安排出发日期/);
  assert.throws(() => trace.updateTrip(unscheduled.tripId, {
    startDate: '2026-02-31', endDate: '2026-03-10'
  }, userId), /日期格式无效/);
  const scheduled = trace.updateTrip(unscheduled.tripId, {
    startDate: '2026-01-01', endDate: '2026-01-10', injectedPrivateField: 'must-not-persist'
  }, userId);
  assert.strictEqual(scheduled.startDate, '2026-01-01');
  assert.strictEqual(scheduled.endDate, '2026-01-10');
  assert.strictEqual(scheduled.injectedPrivateField, undefined);

  const apiUnscheduled = await agent
    .post('/api/v1/journals/travel-trace')
    .send({ tripId: 'api_unscheduled_trip', status: 'planning', cities: ['上海', '成都'], planSnapshot })
    .expect(201);
  await agent
    .put('/api/v1/journals/travel-trace/' + apiUnscheduled.body.tripId)
    .send({ status: 'ongoing' })
    .expect(400)
    .expect(response => assert.match(response.body.userMessage, /安排出发日期/));

  assert.throws(() => trace.recordTrip(userId, {
    tripId: 'future_reality_trip', status: 'ongoing', startDate: '2099-01-01', cities: ['上海', '成都']
  }), /尚未开始/);

  assert.throws(() => trace.recordTrip(userId, {
    tripId: 'planning_with_reality', status: 'planning', startDate: '2026-01-01',
    cities: ['上海', '成都'], actualEvents: [event('invalid_state', 'city_visited', '成都')]
  }), /旅行中或已完成/);

  const trip = trace.recordTrip(userId, {
    tripId: 'actual_trip', title: '上海到成都', status: 'completed',
    startDate: '2026-01-01', endDate: '2026-01-10',
    cities: ['上海', '杭州', '武汉', '成都', '上海'], planSnapshot,
    actualEvents: [
      event('visit_hangzhou_old', 'city_visited', '杭州', { status: 'superseded', occurredAt: '2026-01-05T08:00:00.000Z' }),
      event('visit_hangzhou', 'city_visited', '杭州', { actualStay: 2.5, occurredAt: '2026-01-06T08:00:00.000Z' }),
      event('skip_wuhan', 'city_skipped', '武汉'),
      event('visit_chengdu', 'city_visited', '成都', { plannedStay: 4, actualStay: 4 }),
      event('add_wuxi', 'city_added', '无锡', { planned: false, plannedStay: null, actualStay: 1 }),
      event('stay_hangzhou', 'stay_changed', '杭州', { plannedStay: 2, actualStay: 2.5 })
    ]
  });

  assert.strictEqual(trip.actualEvents[0].note, undefined, '自由文本不得进入结构化实况');
  assert.ok(trip.actualEvents.every(item => item.source === 'user-confirmed'));
  const summary = trace.buildActualTripSummary(trip);
  assert.deepStrictEqual(summary.plannedCities, ['杭州', '武汉', '成都']);
  assert.deepStrictEqual(new Set(summary.visitedCities), new Set(['杭州', '成都', '无锡']));
  assert.deepStrictEqual(summary.skippedCities, ['武汉']);
  assert.deepStrictEqual(summary.addedCities, ['无锡']);
  assert.strictEqual(summary.counts.stayChanged, 1);

  const visitMap = trace.getVisitMap(userId);
  assert.deepStrictEqual(new Set(visitMap.visited), new Set(['杭州', '成都', '无锡']));
  assert.ok(!visitMap.visited.includes('武汉'), '完成旅行后不得把跳过的计划城市算成到访');
  assert.ok(!visitMap.visited.includes('上海'), '往返起点不应因计划节点自动算作旅行到访');
  const stats = trace.getTripStats(userId);
  assert.strictEqual(stats.totalCities, 3);
  assert.strictEqual(journal.getEvidencePool(userId).length, 0, '实况本身不得进入人格证据池');

  trace.recordTrip(userId, {
    tripId: 'legacy_completed_without_reality', status: 'completed',
    startDate: '2026-02-01', endDate: '2026-02-03', cities: ['南京', '苏州']
  });
  const mapWithLegacy = trace.getVisitMap(userId);
  assert.ok(!mapWithLegacy.visited.includes('南京') && !mapWithLegacy.visited.includes('苏州'));
  assert.deepStrictEqual(new Set(mapWithLegacy.needsConfirmation), new Set(['南京', '苏州']));

  const timeline = buildGrowthTimeline(userId);
  assert.strictEqual(timeline.summary.actualUpdates, 1);
  assert.ok(timeline.events.some(item => item.type === 'reality'));
  assert.ok(!JSON.stringify(timeline).includes('这段文字'));

  const otherAgent = request.agent(app);
  await otherAgent.get('/api/v1/journals/persona/profile').expect(200);
  await otherAgent
    .put('/api/v1/journals/travel-trace/actual_trip')
    .send({ actualEvents: [] })
    .expect(404);

  const review = await agent
    .post('/api/v1/journals/entries')
    .send({
      tripId: 'actual_trip', type: 'review', content: '少去一站以后，我在真正喜欢的地方留得更完整。',
      reviewSnapshot: { worth: 'worth_it', values: ['clarity'], deviations: ['fewer_places'] }
    })
    .expect(201);
  assert.strictEqual(review.body.reviewSnapshot.complete, true);
  assert.strictEqual(review.body.reviewSnapshot.actualSummary.hasRecords, true);
  assert.deepStrictEqual(review.body.reviewSnapshot.actualSummary.skippedCities, ['武汉']);
  assert.strictEqual(journal.getEvidencePool(userId).length, 0, '完整复盘仍需用户单独授权');

  await agent.delete('/api/v1/journals/travel-trace/actual_trip').expect(204);
  assert.ok(!trace.getTravelTrace(userId).some(item => item.tripId === 'actual_trip'));
  assert.strictEqual(journal.getEntries(userId).find(item => item.id === review.body.id).tripId, null, '删除行程后手账应保留但解除关联');

  const appSource = fs.readFileSync(path.join(root, 'public-app', 'app.js'), 'utf8');
  const stylesSource = fs.readFileSync(path.join(root, 'public-app', 'styles.css'), 'utf8');
  assert.match(appSource, /function renderActualTripSection/);
  assert.match(appSource, /function setActualCityState/);
  assert.match(appSource, /function changeActualStay/);
  assert.match(appSource, /function addActualCity/);
  assert.match(appSource, /function deleteTripRecord/);
  assert.match(appSource, /实际到访/);
  assert.match(appSource, /实况默认不进入旅格分析/);
  assert.match(stylesSource, /\.actual-city-row/);
  assert.match(stylesSource, /\.full-review__actual/);

  rights._reset();
  console.log('Trip reality tests passed.');
  process.exit(0);
}

run().catch(error => {
  console.error(error);
  process.exit(1);
});
