'use strict';

const assert = require('assert');
const { getCityByName } = require('../src/data/cityRecords');
const { buildCityDayPlans } = require('../src/services/route/routeDayPlanner');

const beijing = getCityByName('北京');
const plans = buildCityDayPlans(beijing, 4, {
  interests: ['museum', 'hidden'],
  avoid: ['crowd', 'expensive']
});

assert.strictEqual(plans.length, 4);
assert.ok(plans.every(day => day.pois.length <= 2));
assert.ok(plans.flatMap(day => day.pois).every(poi => poi.type !== '交通'));
assert.ok(plans.flatMap(day => day.pois).some(poi => poi.type === '博物馆'));
assert.ok(plans.some(day => day.pois.length === 0), 'long stays should preserve a real flex day when POIs run out');
assert.ok(plans.every(day => day.pois.filter(poi => poi.type === '博物馆').length <= 1), 'two major museums should not be packed into the same day');
const palaceDay = plans.find(day => day.pois.some(poi => poi.name === '故宫博物院'));
assert.ok(palaceDay.pois.some(poi => poi.name === '景山公园'), 'nearby compatible POIs should be paired on the same day');

console.log('Route day planner tests passed.');
