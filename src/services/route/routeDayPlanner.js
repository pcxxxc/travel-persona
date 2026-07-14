'use strict';

const INTEREST_TYPE_MATCH = {
  nature: ['自然'],
  oldtown: ['街区', '建筑', '文化'],
  art: ['艺术', '建筑'],
  coffee: ['餐饮', '街区'],
  food: ['餐饮', '街区'],
  photo: ['自然', '建筑', '街区', '艺术'],
  museum: ['博物馆', '文化'],
  hidden: ['民俗', '街区', '建筑', '文化']
};

function scorePoi(poi, interests, avoids) {
  let score = 1;
  const preferredTypes = new Set((interests || []).flatMap(key => INTEREST_TYPE_MATCH[key] || []));
  if (preferredTypes.has(poi.type)) score += 3;
  if (poi.indoor) score += 0.25;
  const searchable = `${poi.name || ''} ${poi.tip || ''}`;
  if ((avoids || []).includes('crowd') && /排队|人多|拥挤|预约紧张/.test(searchable)) score -= 2.5;
  if ((avoids || []).includes('expensive') && /溢价|昂贵|高价|旺季贵/.test(searchable)) score -= 2;
  if ((avoids || []).includes('climb') && /山|登高|徒步/.test(searchable)) score -= 1.5;
  return score;
}

function distanceKm(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return 99;
  const toRad = value => value * Math.PI / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function hasExplicitPairConflict(a, b) {
  const aTip = String(a?.tip || '');
  const bTip = String(b?.tip || '');
  return (b?.name && aTip.includes(`不要和${b.name}`))
    || (a?.name && bTip.includes(`不要和${a.name}`));
}

function schedulePois(pois, activeDayCount) {
  const remaining = [...pois];
  const scheduled = [];
  for (let dayIndex = 0; dayIndex < activeDayCount; dayIndex += 1) {
    const anchor = remaining.shift();
    if (!anchor) {
      scheduled.push([]);
      continue;
    }
    const anchorDuration = Number(anchor.duration) || 120;
    const candidates = remaining
      .map((poi, index) => {
        const totalDuration = anchorDuration + (Number(poi.duration) || 120);
        const typePenalty = anchor.type === poi.type ? 7 : 0;
        const durationPenalty = totalDuration > 360 ? 20 : 0;
        const conflictPenalty = hasExplicitPairConflict(anchor, poi) ? 100 : 0;
        return { poi, index, cost: distanceKm(anchor, poi) + typePenalty + durationPenalty + conflictPenalty };
      })
      .sort((a, b) => a.cost - b.cost || a.index - b.index);
    const partner = candidates.find(item => item.cost < 20);
    const dayPois = [anchor];
    if (partner) {
      dayPois.push(partner.poi);
      remaining.splice(partner.index, 1);
    }
    scheduled.push(dayPois);
  }
  return scheduled;
}

function buildCityDayPlans(city, stay, tripIntent = {}) {
  if (!city || Number(stay) < 1) return [];
  const dayCount = Math.max(1, Math.round(Number(stay)));
  const pois = (city.pois || [])
    .filter(poi => poi && poi.name && poi.type !== '交通')
    .map(poi => ({ poi, score: scorePoi(poi, tripIntent.interests, tripIntent.avoid) }))
    .sort((a, b) => b.score - a.score || a.poi.name.localeCompare(b.poi.name, 'zh-CN'))
    .slice(0, Math.max(dayCount * 2, 16))
    .map(item => item.poi);

  const activeDayCount = dayCount >= 4 ? dayCount - 1 : dayCount;
  const poisByDay = schedulePois(pois, activeDayCount);

  const plans = [];
  const stayAnchor = String(city.stayZone || '').split(/[，,]/)[0].replace(/之间$/, '');
  const openDayThemes = [
    stayAnchor ? `围绕${stayAnchor}慢游，不跨区` : '住处周边慢游，不跨区',
    '留给临时收藏、天气变化和重访',
    '补觉、洗衣或完全自由安排'
  ];
  let openDayIndex = 0;
  for (let day = 1; day <= dayCount; day += 1) {
    const selected = (poisByDay[day - 1] || []).map(poi => ({
      name: poi.name,
      type: poi.type,
      zone: poi.zone || null,
      durationMinutes: poi.duration || null,
      tip: poi.tip || '',
      coordinates: Number.isFinite(poi.lat) && Number.isFinite(poi.lng) ? { lat: poi.lat, lng: poi.lng } : null
    }));
    plans.push({
      day,
      theme: selected.length > 0 ? '两个核心地点以内' : openDayThemes[openDayIndex++ % openDayThemes.length],
      pois: selected,
      note: selected.length > 0
        ? '同一天只锁两个核心地点，剩余时间留给街区、吃饭和临时变化。'
        : '这一天不预塞地点，优先承接天气、预约或前段疲劳。'
    });
  }
  return plans;
}

module.exports = { buildCityDayPlans, scorePoi, schedulePois, distanceKm, INTEREST_TYPE_MATCH };
