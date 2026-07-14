(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PathSelection = api;
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  function numberOr(value, fallback) {
    var number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function chooseInitialPathType(paths, options) {
    var list = Array.isArray(paths) ? paths : [];
    if (!list.length) return null;
    options = options || {};
    if (options.routeGoal === 'multiCityValue') {
      return list.some(function (path) { return path.type === 'balanced'; }) ? 'balanced' : list[0].type;
    }

    var persona = list.find(function (path) { return path.type === 'personaBest'; });
    var balanced = list.find(function (path) { return path.type === 'balanced'; });
    if (!balanced) return persona ? persona.type : list[0].type;
    if (!persona) return balanced.type;

    var hardMax = numberOr(options.hardMax, 0);
    var personaCostMax = numberOr(persona.costEstimate && persona.costEstimate.totalMax, Infinity);
    var personaAffordable = !hardMax || personaCostMax <= hardMax;
    var personaAdvantage = numberOr(persona.personaFit, 0) - numberOr(balanced.personaFit, 0);
    var totalScoreGap = numberOr(persona.totalScore, 0) - numberOr(balanced.totalScore, 0);

    if (personaAffordable && personaAdvantage >= 0.08 && totalScoreGap >= -0.04) {
      return persona.type;
    }
    return balanced.type;
  }

  function chooseLowestCostVariant(variants) {
    var list = Array.isArray(variants) ? variants : [];
    var ranked = list.filter(function (variant) {
      var range = variant && variant.costRange;
      return range && Number.isFinite(Number(range.min)) && Number.isFinite(Number(range.max));
    }).slice().sort(function (left, right) {
      var leftRange = left.costRange;
      var rightRange = right.costRange;
      var maxGap = Number(leftRange.max) - Number(rightRange.max);
      if (maxGap) return maxGap;
      var minGap = Number(leftRange.min) - Number(rightRange.min);
      if (minGap) return minGap;
      return numberOr(left.moveCount, Infinity) - numberOr(right.moveCount, Infinity);
    });
    return ranked.length ? ranked[0].id : null;
  }

  return {
    chooseInitialPathType: chooseInitialPathType,
    chooseLowestCostVariant: chooseLowestCostVariant
  };
});
