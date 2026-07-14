'use strict';

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const { resetProvider, BaiduMapProvider, parseBaiduTransitRoutes } = require('../src/services/map/mapProvider');
const mapRouter = require('../src/api/v1/map');
const { bd09ToWgs84 } = require('../src/services/map/coordinateSystems');

async function run() {
  const beijing = bd09ToWgs84(116.410369, 39.921336);
  assert.ok(beijing.lat > 39.90 && beijing.lat < 39.92, 'BD-09 纬度应转换到 WGS84 北京范围');
  assert.ok(beijing.lng > 116.39 && beijing.lng < 116.41, 'BD-09 经度应转换到 WGS84 北京范围');

  const transitFixture = [{
    distance: 1318000,
    duration: 16200,
    arrive_time: '2026-08-10 12:30:00',
    price: 553,
    steps: [{
      schemes: [{
        vehicle_info: {
          type: 1,
          detail: {
            name: 'G1', price: 553, departure_station: '北京南站', arrive_station: '南京南站',
            departure_time: '08:00', arrive_time: '12:30'
          }
        }
      }]
    }]
  }];
  const parsedTransit = parseBaiduTransitRoutes(transitFixture);
  assert.strictEqual(parsedTransit[0].price, 553);
  assert.strictEqual(parsedTransit[0].vehicles[0].name, 'G1');
  assert.strictEqual(parsedTransit[0].vehicles[0].departureStation, '北京南站');

  const originalFetch = global.fetch;
  const originalBaiduKey = process.env.BAIDU_MAP_API_KEY;
  let requestedUrl = '';
  process.env.BAIDU_MAP_API_KEY = 'test-baidu-key';
  global.fetch = async url => {
    requestedUrl = String(url);
    return { ok: true, json: async () => ({ status: 0, result: { routes: transitFixture } }) };
  };
  const baidu = new BaiduMapProvider();
  const liveRoute = await baidu.getRoute(
    { lat: 39.9042, lng: 116.4074 },
    { lat: 32.0603, lng: 118.7969 },
    [],
    'transit',
    { departureDate: '2026-08-10', departureTime: '06:00-22:00', tacticsIntercity: 2, transTypeIntercity: 0 }
  );
  assert.ok(requestedUrl.includes('/direction/v2/transit?'));
  assert.ok(requestedUrl.includes('departure_date=2026-08-10'));
  assert.ok(requestedUrl.includes('tactics_intercity=2'));
  assert.ok(requestedUrl.includes('trans_type_intercity=0'));
  assert.strictEqual(liveRoute.data.alternatives[0].vehicles[0].arrivalStation, '南京南站');
  global.fetch = originalFetch;
  if (originalBaiduKey === undefined) delete process.env.BAIDU_MAP_API_KEY;
  else process.env.BAIDU_MAP_API_KEY = originalBaiduKey;

  const originalProvider = process.env.MAP_PROVIDER;
  process.env.MAP_PROVIDER = 'mock';
  resetProvider();

  const app = express();
  app.use(express.json());
  app.use('/api/v1/map', mapRouter);

  const response = await request(app)
    .post('/api/v1/map/enrich-plan')
    .send({
      cities: ['北京', '广州', '北京'],
      pois: [
        { city: '北京', name: '故宫博物院' },
        { city: '北京', name: '故宫博物院' }
      ],
      transitLegs: [{ from: '北京', to: '南京' }],
      departureDate: '2026-08-10'
    })
    .expect(200);

  assert.strictEqual(response.body.mapFreshness, 'snapshot');
  assert.strictEqual(response.body.cities.length, 2, '城市应去重');
  assert.strictEqual(response.body.pois.length, 1, '地点应去重');
  assert.strictEqual(response.body.transitLegs.length, 1);
  assert.strictEqual(response.body.transitFreshness, 'snapshot');
  assert.strictEqual(response.body.verifiedTransitLegs, 0);
  assert.ok(response.body.cities.find(item => item.name === '北京').coordinates, '离线链仍应返回城市坐标');
  assert.strictEqual(response.body.userVisibleFailure, false);

  await request(app)
    .post('/api/v1/map/enrich-plan')
    .send({ cities: [], pois: [] })
    .expect(400);

  if (originalProvider === undefined) delete process.env.MAP_PROVIDER;
  else process.env.MAP_PROVIDER = originalProvider;
  resetProvider();
}

run()
  .then(() => console.log('Map enrichment tests passed.'))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
