const assert = require('assert');
const fs = require('fs');
const path = require('path');
const planner = require('../src/services/fallbackPlanner');

const JOURNAL_SAMPLE = [
  {
    city: '长沙',
    stage: 'middle',
    energy: 6,
    load: 7,
    crowd: 'overwhelmed',
    transit: 'smooth',
    liked: ['food', 'museum'],
    friction: ['crowd', 'overpacked'],
    note: '吃得很值，博物馆也值，但五一商圈太吵，连续赶点会累。',
    createdAt: '2026-07-09T08:00:00.000Z'
  },
  {
    city: '武汉',
    stage: 'middle',
    energy: 7,
    load: 5,
    crowd: 'ok',
    transit: 'smooth',
    liked: ['oldtown', 'museum', 'slow'],
    friction: ['transit'],
    note: '白天博物馆、傍晚江边散步很舒服，交通顺但不想一天跨太多区。',
    createdAt: '2026-07-10T08:00:00.000Z'
  },
  {
    city: '北京',
    stage: 'end',
    energy: 5,
    load: 8,
    crowd: 'overwhelmed',
    transit: 'ok',
    liked: ['museum', 'oldtown'],
    friction: ['early', 'crowd', 'expensive'],
    note: '北京内容很强，但预约、早起和住宿成本压力大，下次要把北京段锁定后再倒推路线。',
    createdAt: '2026-07-11T08:00:00.000Z'
  }
];

function assertCorePlan(result) {
  assert(result, 'planner should return a result');
  assert.strictEqual(result.userVisibleFailure, false, 'fallback must be invisible to the user');
  assert(result.persona && result.persona.name, 'persona should be present');
  assert(Array.isArray(result.cities) && result.cities.length >= 4, 'should return diversified cities');
  assert(result.selectedItinerary.days.length > 0, 'should return an executable itinerary');
  assert(result.cities.every(item => item.breakdown.resilience !== undefined), 'resilience score should exist');
  assert(result.cities.every(item => item.breakdown.diversity !== undefined), 'diversity score should exist');
  assert(result.cities.every(item => item.breakdown.evidence !== undefined), 'city evidence score should exist');
  assert(result.cities.every(item => item.breakdown.route !== undefined), 'route fit score should exist');
  assert(result.decisionAudit && result.decisionAudit.cityRows.length >= 3, 'decision audit should explain city ranking');
  assert(result.growthProfile && result.growthProfile.stage, 'growth profile should be present');
}

const data = planner.getData();
assert(Object.keys(data.traitLabels).length >= 16, 'trait model should be multi-dimensional');
assert(data.personas.length >= 16, 'persona atlas should include at least 16 archetypes');
assert.strictEqual(new Set(data.personas.map(persona => persona.id)).size, data.personas.length, 'persona ids should be unique');
data.personas.forEach(persona => {
  Object.keys(data.traitLabels).forEach(key => {
    assert(typeof persona.match[key] === 'number', `persona ${persona.id} should contain ${key}`);
  });
  const assetName = `abstract-${persona.id.replace(/_/g, '-')}.jpg`;
  const assetPath = path.join(__dirname, '..', 'public-site', 'travel-persona', 'assets', 'personas', assetName);
  assert(fs.existsSync(assetPath), `persona asset should exist: ${assetName}`);
});
assert(fs.existsSync(path.join(__dirname, '..', 'public-site', 'travel-persona', 'assets', 'personas', 'abstract-persona-sheet.png')), 'abstract persona sheet should exist');
assert(data.cities.length >= 17, 'city database should include route corridor cities');
assert(Object.keys(data.cityIntelligence.cityScores).length >= data.cities.length, 'city intelligence should cover the database');
assert(data.cityIntelligence.routeNodes.length >= 10, 'route node knowledge should support long routes');

const memory = planner.buildJournalMemory(JOURNAL_SAMPLE);
assert.strictEqual(memory.entryCount, 3, 'journal memory should count entries');
assert(memory.confidence > 0.5, 'journal confidence should grow from evidence');
assert(memory.topDeltas.length > 0, 'journal should produce persona drift');
assert(memory.contradictions.length > 0, 'journal should surface preference contradictions');
assert(memory.nextRules.length > 0, 'journal should produce next-trip rules');

const routeCase = {
  mood: 'efficient',
  interests: ['oldtown', 'food', 'museum', 'hidden'],
  avoid: ['expensive', 'longTransit', 'early'],
  days: 18,
  budget: 320,
  origin: '茂名',
  destination: '北京',
  companion: 'solo',
  routeGoal: 'multiCityValue',
  journalEntries: JOURNAL_SAMPLE,
  freeText: '从茂名去北京，返程不知道怎么走，想用两三周最高效多玩几个城市，预算要最高性价比。'
};

const routeResult = planner.plan(routeCase);
assertCorePlan(routeResult);
assert(routeResult.persona.secondary && routeResult.persona.secondary.name, 'persona should include a secondary archetype');
assert(Array.isArray(routeResult.persona.alternates) && routeResult.persona.alternates.length >= 4, 'persona should expose ranked alternates');
assert(routeResult.routeExperiment, 'Maoming to Beijing case should trigger route experiment');
assert(routeResult.routeExperiment.primary.nodes.some(node => node.city.includes('茂名')), 'route should include Maoming');
assert(routeResult.routeExperiment.primary.nodes.some(node => node.city.includes('北京')), 'route should include Beijing');
assert(routeResult.routeExperiment.primary.nodes.every(node => typeof node.value === 'number' || node.city === '茂名'), 'route nodes should expose value evidence');
assert(routeResult.routeExperiment.totalDays >= 14 && routeResult.routeExperiment.totalDays <= 21, 'route should fit 2-3 weeks');
assert(routeResult.journalMemory.entryCount === 3, 'plan should carry journal memory');
assert(routeResult.insights.some(item => item.includes('手账')), 'insights should mention journal correction');
assert(routeResult.personaTensions.length > 0, 'route plan should expose persona tensions');
assert(routeResult.growthProfile.stage === '手账校准', 'three journal entries should move the user into calibration');
assert(routeResult.decisionAudit.routeRows.length >= 7 && routeResult.decisionAudit.routeRows.length <= 9, 'balanced route should expose a complete but non-excessive decision audit');
assert(routeResult.cities.some(item => item.city.name === '北京'), 'fixed destination should remain visible in city recommendations');
assert(routeResult.cities.every(item => item.breakdown.weights && item.breakdown.weights.evidence > 0), 'city scores should include dynamic weight model');

const coldRouteResult = planner.plan(Object.assign({}, routeCase, { journalEntries: [] }));
assert(coldRouteResult.growthProfile.stage === '冷启动', 'no journal entries should stay in cold start');
assert(routeResult.growthProfile.confidence > coldRouteResult.growthProfile.confidence, 'journal evidence should increase growth confidence');

const noAgentScenarios = [
  {
    mood: 'inspire',
    interests: ['art', 'coffee', 'oldtown', 'photo', 'hidden'],
    avoid: ['crowd', 'commercial', 'early'],
    days: 4,
    budget: 560,
    origin: '上海',
    companion: 'solo',
    freeText: '最近很累，但希望这趟旅行不是纯躺平。'
  },
  {
    mood: 'escape',
    interests: ['nature', 'coffee'],
    avoid: ['crowd', 'commercial', 'longTransit'],
    days: 5,
    budget: 420,
    origin: '广州',
    companion: 'couple',
    freeText: '想去一个能散步、看自然、晚上能安静睡觉的地方。'
  },
  {
    mood: 'social',
    interests: ['food', 'oldtown'],
    avoid: ['expensive'],
    days: 3,
    budget: 360,
    origin: '武汉',
    companion: 'friends',
    freeText: '想吃得爽，有夜生活，但别全是排队。'
  }
];

noAgentScenarios.forEach(profile => {
  const result = planner.plan(profile);
  assertCorePlan(result);
  Object.keys(data.traitLabels).forEach(key => {
    assert(typeof result.vector[key] === 'number', `vector should contain ${key}`);
  });
});

console.log('planner-engine tests passed');
