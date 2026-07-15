'use strict';

const assert = require('assert');
const express = require('express');
const request = require('supertest');
const { resetProvider, BaiduMapProvider, McpMapProvider, parseBaiduTransitRoutes } = require('../src/services/map/mapProvider');
const mapRouter = require('../src/api/v1/map');
const { bd09ToWgs84, wgs84ToBd09 } = require('../src/services/map/coordinateSystems');

async function run() {
  const beijing = bd09ToWgs84(116.410369, 39.921336);
  assert.ok(beijing.lat > 39.90 && beijing.lat < 39.92, 'BD-09 纬度应转换到 WGS84 北京范围');
  assert.ok(beijing.lng > 116.39 && beijing.lng < 116.41, 'BD-09 经度应转换到 WGS84 北京范围');
  const bd09 = wgs84ToBd09(39.9042, 116.4074);
  const roundTrip = bd09ToWgs84(bd09.lng, bd09.lat);
  assert.ok(Math.abs(roundTrip.lat - 39.9042) < 0.0001, 'WGS84 纬度应可往返转换');
  assert.ok(Math.abs(roundTrip.lng - 116.4074) < 0.0001, 'WGS84 经度应可往返转换');

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
  assert.ok(requestedUrl.includes('departure_date=20260810'));
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

  const originalMcpKey = process.env.BAIDU_MAP_AK;
  const originalWebKey = process.env.BAIDU_WEB_AK;
  const originalMcpMethods = {
    isConfigured: McpMapProvider.prototype.isConfigured,
    geocode: McpMapProvider.prototype.geocode,
    searchPOI: McpMapProvider.prototype.searchPOI,
    getPOIDetail: McpMapProvider.prototype.getPOIDetail,
    getRoute: McpMapProvider.prototype.getRoute
  };
  process.env.MAP_PROVIDER = 'mcp-baidu';
  process.env.BAIDU_MAP_AK = 'test-mcp-key';
  process.env.BAIDU_WEB_AK = 'test-browser-key';
  McpMapProvider.prototype.isConfigured = function () { return true; };
  McpMapProvider.prototype.geocode = async function (address) {
    const coordinates = address === '南京' ? { lat: 32.0603, lng: 118.7969 } : { lat: 39.9042, lng: 116.4074 };
    return { data: coordinates, source: 'mcp-baidu', fetchedAt: '2026-07-15T00:00:00.000Z', cached: false };
  };
  McpMapProvider.prototype.searchPOI = async function () {
    return {
      data: [{ id: 'poi-1', name: '故宫博物院', lat: 39.9163, lng: 116.3972, address: '北京市东城区景山前街4号' }],
      source: 'mcp-baidu', fetchedAt: '2026-07-15T00:00:00.000Z', cached: false
    };
  };
  McpMapProvider.prototype.getPOIDetail = async function () {
    return {
      data: { id: 'poi-1', name: '故宫博物院', lat: 39.9163, lng: 116.3972, address: '北京市东城区景山前街4号', openHours: '08:30-17:00' },
      source: 'mcp-baidu', fetchedAt: '2026-07-15T00:00:00.000Z', cached: false
    };
  };
  McpMapProvider.prototype.getRoute = async function () {
    return {
      data: { alternatives: [{ duration: 16200, price: 553, transfers: 0, vehicles: [{ type: 1, name: 'G1', departureStation: '北京南站', arrivalStation: '南京南站' }] }] },
      source: 'mcp-baidu', fetchedAt: '2026-07-15T00:00:00.000Z', cached: false
    };
  };
  resetProvider();

  const clientConfig = await request(app).get('/api/v1/map/client-config').expect(200);
  assert.strictEqual(clientConfig.body.displayProvider, 'baidu-webgl');
  assert.strictEqual(clientConfig.body.baiduWebAk, 'test-browser-key');

  // The server-side Directions key must never become a browser fallback key.
  delete process.env.BAIDU_WEB_AK;
  const noBrowserConfig = await request(app).get('/api/v1/map/client-config').expect(200);
  assert.strictEqual(noBrowserConfig.body.displayProvider, 'route-fallback');
  assert.strictEqual(noBrowserConfig.body.baiduWebAk, null);
  process.env.BAIDU_WEB_AK = 'test-browser-key';

  const mcpResponse = await request(app)
    .post('/api/v1/map/enrich-plan')
    .send({
      cities: ['北京', '南京'],
      pois: [{ city: '北京', name: '故宫博物院' }],
      transitLegs: [{ from: '北京', to: '南京' }],
      departureDate: '2026-08-10'
    })
    .expect(200);
  assert.strictEqual(mcpResponse.body.mapProvider, 'mcp-baidu');
  assert.strictEqual(mcpResponse.body.mapFreshness, 'live');
  assert.strictEqual(mcpResponse.body.transitFreshness, 'live');
  assert.strictEqual(mcpResponse.body.cities[0].sourceCrs, 'wgs84');
  assert.strictEqual(mcpResponse.body.cities[0].coordinates.lat, 39.9042, 'MCP WGS84 coordinates must not be converted twice');
  assert.strictEqual(mcpResponse.body.verifiedTransitLegs, 1);

  McpMapProvider.prototype.isConfigured = originalMcpMethods.isConfigured;
  McpMapProvider.prototype.geocode = originalMcpMethods.geocode;
  McpMapProvider.prototype.searchPOI = originalMcpMethods.searchPOI;
  McpMapProvider.prototype.getPOIDetail = originalMcpMethods.getPOIDetail;
  McpMapProvider.prototype.getRoute = originalMcpMethods.getRoute;
  if (originalMcpKey === undefined) delete process.env.BAIDU_MAP_AK;
  else process.env.BAIDU_MAP_AK = originalMcpKey;
  if (originalWebKey === undefined) delete process.env.BAIDU_WEB_AK;
  else process.env.BAIDU_WEB_AK = originalWebKey;

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
