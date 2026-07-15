'use strict';

const express = require('express');
const router = express.Router();
const { getActiveProvider, isBaiduProvider } = require('../../services/map/mapProvider');
const { getCityByName } = require('../../data/cityRecords');
const contentSafety = require('../../services/ops/contentSafety');
const { bd09ToWgs84 } = require('../../services/map/coordinateSystems');
const monitoring = require('../../services/ops/monitoring');

const MAX_CITIES = 12;
const MAX_POIS = 12;
const MAX_TRANSIT_LEGS = 10;
const MAX_STATIC_ROUTE_POINTS = 20;

function uniqueStrings(values, limit) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(value => String(value || '').trim())
    .filter(Boolean)))
    .slice(0, limit);
}

function normalizePoiRequests(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(item => ({
      city: String(item?.city || '').trim(),
      name: String(item?.name || '').trim()
    }))
    .filter(item => {
      const key = `${item.city}::${item.name}`;
      if (!item.city || !item.name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_POIS);
}

function normalizeTransitRequests(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : [])
    .map(item => ({ from: String(item?.from || '').trim(), to: String(item?.to || '').trim() }))
    .filter(item => {
      const key = `${item.from}::${item.to}`;
      if (!item.from || !item.to || item.from === item.to || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_TRANSIT_LEGS);
}

function normalizeDepartureDate(value) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00Z`)) ? date : '';
}

function normalizeStaticRoutePoints(value) {
  return String(value || '')
    .split(';')
    .map(pair => pair.split(',').map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat)
      && lng >= 72 && lng <= 136 && lat >= 3 && lat <= 55)
    .slice(0, MAX_STATIC_ROUTE_POINTS);
}

function buildStaticBounds(points) {
  const longitudes = points.map(([lng]) => lng);
  const latitudes = points.map(([, lat]) => lat);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const padLng = Math.max(0.35, (maxLng - minLng) * 0.16);
  const padLat = Math.max(0.25, (maxLat - minLat) * 0.16);
  return `${minLng - padLng},${minLat - padLat};${maxLng + padLng},${maxLat + padLat}`;
}

function getStaticMapAk() {
  return String(process.env.BAIDU_STATIC_AK || process.env.BAIDU_MAP_AK || process.env.BAIDU_MAP_API_KEY || '').trim();
}

function toWgs84(provider, location) {
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  if (provider.coordinateSystem === 'wgs84') {
    return { lat: location.lat, lng: location.lng };
  }
  return bd09ToWgs84(location.lng, location.lat);
}

async function mapWithConcurrency(values, limit, mapper) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await mapper(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

function normalizeName(value) {
  return String(value || '').replace(/[\s·•（）()\-—_]/g, '').toLowerCase();
}

function choosePoi(results, expectedName) {
  const expected = normalizeName(expectedName);
  let best = null;
  let bestScore = 0;
  for (const item of Array.isArray(results) ? results : []) {
    const actual = normalizeName(item.name);
    const score = actual === expected ? 3
      : actual.includes(expected) || expected.includes(actual) ? 2
        : 0;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

async function enrichCity(provider, name) {
  const local = getCityByName(name);
  const fallback = {
    name,
    coordinates: local?.coordinates || null,
    verified: false,
    source: 'snapshot'
  };
  if (!isBaiduProvider(provider)) return fallback;

  try {
    const result = await provider.geocode(name);
    if (!result?.data || !Number.isFinite(result.data.lat) || !Number.isFinite(result.data.lng)) return fallback;
    const wgs84 = toWgs84(provider, result.data);
    if (!wgs84) return fallback;
    return {
      name,
      coordinates: { lat: wgs84.lat, lng: wgs84.lng },
      verified: true,
      source: result.source || 'baidu',
      sourceCrs: provider.coordinateSystem || 'bd09',
      outputCrs: 'wgs84',
      fetchedAt: result.fetchedAt
    };
  } catch (error) {
    console.warn(`[map/enrich] 城市 ${name} 核验失败: ${error.message}`);
    return fallback;
  }
}

async function enrichPoi(provider, request) {
  if (!isBaiduProvider(provider)) {
    return { ...request, verified: false, source: 'snapshot' };
  }

  try {
    const search = await provider.searchPOI(request.name, { city: request.city, pageSize: 5 });
    const match = choosePoi(search?.data, request.name);
    if (!match) return { ...request, verified: false, source: 'snapshot' };

    let detail = null;
    if (match.id) {
      try {
        detail = (await provider.getPOIDetail(match.id))?.data || null;
      } catch (_) {
        detail = null;
      }
    }
    const merged = { ...match, ...(detail || {}) };
    const wgs84 = toWgs84(provider, merged);
    return {
      city: request.city,
      name: request.name,
      matchedName: merged.name,
      coordinates: wgs84 ? { lat: wgs84.lat, lng: wgs84.lng } : null,
      address: merged.address || '',
      openHours: merged.openHours || '',
      verified: true,
      source: search.source || 'baidu',
      sourceCrs: provider.coordinateSystem || 'bd09',
      outputCrs: 'wgs84',
      fetchedAt: search.fetchedAt
    };
  } catch (error) {
    console.warn(`[map/enrich] 地点 ${request.city}/${request.name} 核验失败: ${error.message}`);
    return { ...request, verified: false, source: 'snapshot' };
  }
}

async function enrichTransitLeg(provider, request, departureDate) {
  const fallback = {
    ...request,
    departureDate: departureDate || null,
    verified: false,
    source: 'snapshot',
    status: departureDate ? 'provider_unavailable' : 'date_required'
  };
  if (!isBaiduProvider(provider) || !departureDate) return fallback;

  try {
    const [origin, destination] = await Promise.all([
      provider.geocode(request.from),
      provider.geocode(request.to)
    ]);
    if (!origin?.data || !destination?.data) return fallback;
    const routeResult = await provider.getRoute(
      { lat: origin.data.lat, lng: origin.data.lng },
      { lat: destination.data.lat, lng: destination.data.lng },
      [],
      'transit',
      {
        departureDate,
        departureTime: '06:00-22:00',
        tacticsIncity: 1,
        tacticsIntercity: 0,
        transTypeIntercity: 0,
        pageSize: 3
      }
    );
    const alternatives = (routeResult?.data?.alternatives || []).filter(item => Number(item.duration) > 0);
    if (!alternatives.length) return fallback;
    const durations = alternatives.map(item => Number(item.duration) / 3600);
    const prices = alternatives.map(item => Number(item.price)).filter(value => value > 0);
    const preferred = alternatives[0];
    const serviceNames = Array.from(new Set(alternatives.flatMap(item =>
      (item.vehicles || []).filter(vehicle => [1, 2, 6].includes(vehicle.type)).map(vehicle => vehicle.name).filter(Boolean)
    ))).slice(0, 6);
    return {
      ...request,
      departureDate,
      verified: true,
      source: routeResult.source || 'baidu',
      status: 'verified',
      durationHours: {
        min: Math.round(Math.min(...durations) * 10) / 10,
        max: Math.round(Math.max(...durations) * 10) / 10
      },
      fareCny: prices.length ? {
        min: Math.round(Math.min(...prices)),
        max: Math.round(Math.max(...prices))
      } : null,
      transfers: Math.min(...alternatives.map(item => Number(item.transfers) || 0)),
      serviceNames,
      departureStation: preferred.vehicles?.find(item => [1, 2, 6].includes(item.type))?.departureStation || '',
      arrivalStation: [...(preferred.vehicles || [])].reverse().find(item => [1, 2, 6].includes(item.type))?.arrivalStation || '',
      fetchedAt: routeResult.fetchedAt
    };
  } catch (error) {
    console.warn(`[map/enrich] 跨城 ${request.from}/${request.to} 核验失败: ${error.message}`);
    return fallback;
  }
}

router.get('/client-config', (req, res) => {
  // Browser and MCP credentials have different exposure rules. Never surface the server AK.
  const baiduWebAk = String(process.env.BAIDU_WEB_AK || '').trim();
  const staticAk = String(process.env.BAIDU_STATIC_AK || process.env.BAIDU_WEB_AK || '').trim();
  res.json({
    country: 'CN',
    displayProvider: staticAk ? 'baidu-static' : 'route-fallback',
    baiduWebAk: baiduWebAk || null,
    staticAk: staticAk || null,
    interactiveMap: true,
    leafletTiles: '/api/v1/map/tile/amap'
  });
});

router.get('/static-route', async (req, res) => {
  const points = normalizeStaticRoutePoints(req.query.points);
  const ak = getStaticMapAk();
  if (points.length < 2 || !ak) {
    return res.status(400).json({ code: 'TP-1012', type: 'VALIDATION', message: 'Static route map is unavailable', userVisible: false });
  }

  const params = new URLSearchParams({
    ak,
    width: '512',
    height: '260',
    scale: '2',
    dpiType: 'ph',
    coordtype: 'wgs84ll',
    bbox: buildStaticBounds(points),
    markers: points.map(([lng, lat]) => `${lng},${lat}`).join('|'),
    markerStyles: points.map((_, index) => `m,${(index + 1) % 10},0x2D6A4F`).join('|'),
    paths: points.map(([lng, lat]) => `${lng},${lat}`).join(';'),
    pathStyles: '0x2D6A4F,5,0.78',
    copyright: '1'
  });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`https://api.map.baidu.com/staticimage/v2?${params}`, { signal: controller.signal });
    const contentType = String(response.headers.get('content-type') || '');
    if (!response.ok || !contentType.startsWith('image/')) {
      return res.status(502).json({ code: 'TP-1013', type: 'MAP_PROVIDER', message: 'Static map provider failed', userVisible: false });
    }
    const body = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.send(body);
  } catch (error) {
    return res.status(502).json({ code: 'TP-1014', type: 'MAP_PROVIDER', message: 'Static map provider unavailable', userVisible: false });
  } finally {
    clearTimeout(timer);
  }
});

router.post('/enrich-plan', async (req, res) => {
  const cities = uniqueStrings(req.body?.cities, MAX_CITIES);
  const pois = normalizePoiRequests(req.body?.pois);
  const transitRequests = normalizeTransitRequests(req.body?.transitLegs);
  const departureDate = normalizeDepartureDate(req.body?.departureDate);
  if (!cities.length && !pois.length && !transitRequests.length) {
    return res.status(400).json({
      code: 'TP-1006',
      type: 'VALIDATION',
      message: '至少提供一个城市或地点',
      userVisible: false
    });
  }

  const provider = getActiveProvider();
  const [cityFacts, poiFacts, transitFacts] = await Promise.all([
    Promise.all(cities.map(name => enrichCity(provider, name))),
    Promise.all(pois.map(item => enrichPoi(provider, item))),
    mapWithConcurrency(transitRequests, 2, item => enrichTransitLeg(provider, item, departureDate))
  ]);
  const verifiedCities = cityFacts.filter(item => item.verified).length;
  const verifiedPois = poiFacts.filter(item => item.verified).length;
  const verifiedTransitLegs = transitFacts.filter(item => item.verified).length;
  const mapFreshness = isBaiduProvider(provider) && (verifiedCities > 0 || verifiedPois > 0)
    ? 'live'
    : 'snapshot';

  monitoring.recordMetric('map_freshness_ratio', mapFreshness === 'live' ? 1 : 0, {
    endpoint: '/api/v1/map/enrich-plan', provider: provider.name, mode: mapFreshness
  });

  res.json(contentSafety.sanitizeOutputValue({
    mapFreshness,
    mapProvider: provider.name,
    cities: cityFacts,
    pois: poiFacts,
    transitLegs: transitFacts,
    verifiedCities,
    verifiedPois,
    verifiedTransitLegs,
    transitFreshness: verifiedTransitLegs > 0 ? 'live' : departureDate ? 'snapshot' : 'date-required',
    departureDate: departureDate || null,
    checkedAt: new Date().toISOString(),
    userVisibleFailure: false
  }));
});

module.exports = router;
