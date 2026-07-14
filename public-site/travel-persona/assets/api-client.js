(function () {
  "use strict";

  var DEFAULT_TIMEOUT = 1800;

  function withTimeout(ms) {
    if (!window.AbortController) {
      return { signal: undefined, cancel: function () {} };
    }

    var controller = new AbortController();
    var timer = window.setTimeout(function () {
      controller.abort();
    }, ms || DEFAULT_TIMEOUT);

    return {
      signal: controller.signal,
      cancel: function () {
        window.clearTimeout(timer);
      }
    };
  }

  async function postJson(url, body, options) {
    options = options || {};
    var timeout = withTimeout(options.timeout || DEFAULT_TIMEOUT);

    try {
      var response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
        signal: timeout.signal
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (err) {
      return null;
    } finally {
      timeout.cancel();
    }
  }

  async function getJson(url, options) {
    options = options || {};
    var timeout = withTimeout(options.timeout || DEFAULT_TIMEOUT);

    try {
      var response = await fetch(url, { signal: timeout.signal });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (err) {
      return null;
    } finally {
      timeout.cancel();
    }
  }

  function baiduPlaceUrl(query, region) {
    var q = encodeURIComponent(query || "");
    var r = encodeURIComponent(region || "");
    return "https://api.map.baidu.com/place/search?query=" + q + "&region=" + r + "&output=html&src=webapp.travel-persona";
  }

  function baiduMarkerUrl(poi, cityName) {
    if (poi && typeof poi.lat === "number" && typeof poi.lng === "number") {
      return "https://api.map.baidu.com/marker?location=" + poi.lat + "," + poi.lng + "&title=" + encodeURIComponent(poi.name) + "&content=" + encodeURIComponent((cityName || "") + " · " + (poi.tip || "")) + "&output=html&src=webapp.travel-persona";
    }
    return baiduPlaceUrl((poi && poi.name) || cityName, cityName);
  }

  async function enhancePlan(profile, localPlan) {
    var payload = {
      profile: profile,
      localPlan: localPlan,
      fallbackPolicy: {
        strategy: "local-first",
        userVisibleFailure: false,
        timeoutMs: DEFAULT_TIMEOUT
      }
    };

    var enhanced = await postJson("/api/agent/plan", payload, { timeout: DEFAULT_TIMEOUT });
    if (!enhanced || enhanced.error) {
      return null;
    }

    return enhanced;
  }

  async function fetchMapPois(city) {
    if (!city || !city.name) {
      return null;
    }
    return await getJson("/api/map/pois?city=" + encodeURIComponent(city.name), { timeout: 1200 });
  }

  async function fetchCommunitySignals(city) {
    if (!city || !city.name) {
      return null;
    }
    return await postJson("/api/research/signals", { city: city.name, pois: city.pois || [] }, { timeout: 1600 });
  }

  window.TravelApi = {
    postJson: postJson,
    getJson: getJson,
    enhancePlan: enhancePlan,
    fetchMapPois: fetchMapPois,
    fetchCommunitySignals: fetchCommunitySignals,
    baiduPlaceUrl: baiduPlaceUrl,
    baiduMarkerUrl: baiduMarkerUrl
  };
})();
