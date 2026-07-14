(function (global) {
  'use strict';

  var configPromise = null;
  var sdkPromise = null;
  var leafletPromise = null;
  var renderId = 0;

  function getConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/v1/map/client-config', { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('Map client configuration is unavailable');
          return response.json();
        });
    }
    return configPromise;
  }

  function loadBaiduWebGl(ak) {
    if (global.BMapGL) return Promise.resolve(global.BMapGL);
    if (sdkPromise) return sdkPromise;

    sdkPromise = new Promise(function (resolve, reject) {
      // 先尝试直接加载 SDK 脚本
      var script = document.createElement('script');
      script.async = true;
      script.src = 'https://api.map.baidu.com/api?v=1.0&type=webgl&ak=' + encodeURIComponent(ak);
      var resolved = false;
      var loadTimeout = setTimeout(function () {
        if (!resolved) { resolved = true; reject(new Error('Baidu WebGL SDK load timeout (8s)')); }
      }, 8000);
      script.onload = function () {
        clearTimeout(loadTimeout);
        if (resolved) return;
        // SDK 脚本加载后，BMapGL 可能需要额外时间初始化
        var pollCount = 0;
        var pollInterval = setInterval(function () {
          pollCount++;
          if (global.BMapGL) {
            clearInterval(pollInterval);
            if (!resolved) { resolved = true; resolve(global.BMapGL); }
          } else if (pollCount > 20) {
            clearInterval(pollInterval);
            if (!resolved) { resolved = true; reject(new Error('BMapGL not available after script loaded')); }
          }
        }, 200);
      };
      script.onerror = function () {
        clearTimeout(loadTimeout);
        if (!resolved) { resolved = true; reject(new Error('Baidu WebGL SDK script load error')); }
      };
      document.head.appendChild(script);
    });
    return sdkPromise;
  }

  function transformLat(lng, lat) {
    var result = -100 + 2 * lng + 3 * lat + 0.2 * lat * lat + 0.1 * lng * lng + 0.2 * Math.sqrt(Math.abs(lng));
    result += (20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2 / 3;
    result += (20 * Math.sin(lat * Math.PI) + 40 * Math.sin(lat / 3 * Math.PI)) * 2 / 3;
    result += (160 * Math.sin(lat / 12 * Math.PI) + 320 * Math.sin(lat * Math.PI / 30)) * 2 / 3;
    return result;
  }

  function transformLng(lng, lat) {
    var result = 300 + lng + 2 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng));
    result += (20 * Math.sin(6 * lng * Math.PI) + 20 * Math.sin(2 * lng * Math.PI)) * 2 / 3;
    result += (150 * Math.sin(lng * Math.PI) + 40 * Math.sin(lng / 3 * Math.PI)) * 2 / 3;
    result += (150 * Math.sin(lng / 12 * Math.PI) + 300 * Math.sin(lng * Math.PI / 30)) * 2 / 3;
    return result;
  }

  function wgs84ToBd09(lat, lng) {
    var x = lng;
    var y = lat;
    if (lng >= 72.004 && lng <= 137.8347 && lat >= 0.8293 && lat <= 55.8271) {
      var dLat = transformLat(lng - 105, lat - 35);
      var dLng = transformLng(lng - 105, lat - 35);
      var radLat = lat / 180 * Math.PI;
      var magic = Math.sin(radLat);
      magic = 1 - 0.00669342162296594323 * magic * magic;
      var sqrtMagic = Math.sqrt(magic);
      dLat = (dLat * 180) / ((6378245 * (1 - 0.00669342162296594323)) / (magic * sqrtMagic) * Math.PI);
      dLng = (dLng * 180) / (6378245 / sqrtMagic * Math.cos(radLat) * Math.PI);
      x = lng + dLng;
      y = lat + dLat;
    }
    var z = Math.sqrt(x * x + y * y) + 0.00002 * Math.sin(y * Math.PI * 3000 / 180);
    var theta = Math.atan2(y, x) + 0.000003 * Math.cos(x * Math.PI * 3000 / 180);
    return { lng: z * Math.cos(theta) + 0.0065, lat: z * Math.sin(theta) + 0.006 };
  }

  function validPoint(value) {
    var coordinates = value && (value.coordinates || value);
    if (!coordinates || !Number.isFinite(Number(coordinates.lat)) || !Number.isFinite(Number(coordinates.lng))) return null;
    return {
      name: String(value.name || ''),
      meta: String(value.meta || ''),
      coordinates: { lat: Number(coordinates.lat), lng: Number(coordinates.lng) }
    };
  }

  function showFallback(container, message) {
    container.classList.add('plan-map--fallback');
    container.innerHTML = '';
    var fallback = document.createElement('div');
    fallback.className = 'plan-map__fallback plan-map__fallback--domestic';
    fallback.textContent = message;
    container.appendChild(fallback);
  }

  function addSourceLabel(container, text) {
    var label = document.createElement('div');
    label.className = 'map-source-label';
    label.textContent = text || '百度地图 · 中国大陆';
    container.appendChild(label);
  }

  /* ── 百度 WebGL 地图绘制 ── */
  function drawBaiduMap(container, BMapGL, points, options) {
    container.classList.remove('plan-map--fallback');
    container.innerHTML = '';
    var map = new BMapGL.Map(container, { enableMapClick: false });
    map.enableScrollWheelZoom(false);
    if (BMapGL.ZoomControl) map.addControl(new BMapGL.ZoomControl());

    var bdPoints = points.map(function (item) {
      var bd = wgs84ToBd09(item.coordinates.lat, item.coordinates.lng);
      return new BMapGL.Point(bd.lng, bd.lat);
    });

    if (options.origin) {
      var origin = validPoint(options.origin);
      if (origin) {
        var originBd = wgs84ToBd09(origin.coordinates.lat, origin.coordinates.lng);
        var originPoint = new BMapGL.Point(originBd.lng, originBd.lat);
        map.addOverlay(new BMapGL.Marker(originPoint));
        bdPoints.push(originPoint);
      }
    }

    points.forEach(function (item, index) {
      var marker = new BMapGL.Marker(bdPoints[index]);
      marker.setTitle(item.name);
      map.addOverlay(marker);
      if (item.name && BMapGL.Label && BMapGL.Size) {
        var label = new BMapGL.Label(String(index + 1) + ' ' + item.name, {
          position: bdPoints[index],
          offset: new BMapGL.Size(12, -26)
        });
        label.setStyle({
          color: '#173026',
          backgroundColor: '#ffffff',
          border: '1px solid #c9ddd2',
          borderRadius: '3px',
          padding: '3px 5px',
          fontSize: '11px',
          lineHeight: '15px'
        });
        map.addOverlay(label);
      }
    });

    if (options.drawRoute && bdPoints.length > 1) {
      map.addOverlay(new BMapGL.Polyline(bdPoints, {
        strokeColor: '#2d6a4f',
        strokeWeight: 4,
        strokeOpacity: 0.78
      }));
    }

    if (bdPoints.length > 1) {
      map.setViewport(bdPoints, { margins: [30, 30, 30, 30] });
    } else {
      map.centerAndZoom(bdPoints[0], options.zoom || 11);
    }
    addSourceLabel(container, '百度地图 · 中国大陆');
  }

  /* ── Leaflet + 高德瓦片降级 ── */
  function loadLeafletScript() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletPromise) return leafletPromise;
    var s = document.createElement('script');
    s.src = '/app/vendor/leaflet/leaflet.js';
    document.head.appendChild(s);
    leafletPromise = new Promise(function (resolve, reject) {
      s.onload = function () { resolve(window.L); };
      s.onerror = function () { reject(new Error('Leaflet SDK load failed')); };
    });
    return leafletPromise;
  }

  function loadLeafletFallback(container, points, options) {
    return loadLeafletScript().then(function (L) {
      container.innerHTML = '';
      container.classList.remove('plan-map--fallback');
      container.style.minHeight = '240px';

      var first = points[0];
      var map = L.map(container).setView([first.coordinates.lat, first.coordinates.lng], options.zoom || 6);

      // 高德瓦片（通过本地代理，国内可用）
      L.tileLayer('/api/v1/map/tile/amap/{z}/{x}/{y}', {
        maxZoom: 18,
        attribution: '&copy; 高德地图'
      }).addTo(map);

      // 目的地标记
      var coordsList = [];
      points.forEach(function (p) {
        var latlng = [p.coordinates.lat, p.coordinates.lng];
        coordsList.push(latlng);
        L.marker(latlng).addTo(map).bindPopup(p.name || '目的地');
      });

      // 出发地标记（紫色圆点）
      if (options.origin) {
        var ov = validPoint(options.origin);
        if (ov) {
          L.circleMarker([ov.coordinates.lat, ov.coordinates.lng], {
            radius: 8, fillColor: '#6366F1', color: '#fff', weight: 2, fillOpacity: 1
          }).addTo(map).bindPopup('出发地');
        }
      }

      // 连线
      if (coordsList.length > 1) {
        L.polyline(coordsList, { color: '#2d6a4f', weight: 3, opacity: 0.8 }).addTo(map);
        map.fitBounds(coordsList, { padding: [30, 30] });
      }

      addSourceLabel(container, '高德地图 · 降级模式');
      return true;
    }).catch(function () {
      showFallback(container, '地图服务暂不可用，路线顺序仍已保留。');
      return false;
    });
  }

  /* ── 统一入口 ── */
  function render(container, values, options) {
    var points = (values || []).map(validPoint).filter(Boolean);
    if (!container) return Promise.resolve(false);
    if (!points.length) {
      showFallback(container, '这组结果暂时缺少可用坐标。');
      return Promise.resolve(false);
    }
    var currentRender = String(++renderId);
    container.dataset.travelMapRender = currentRender;

    // 优先百度 WebGL
    return getConfig()
      .then(function (config) {
        if (currentRender !== container.dataset.travelMapRender || !container.isConnected) return false;
        if (config.displayProvider !== 'baidu-webgl' || !config.baiduWebAk) {
          // 无百度 AK，直接降级 Leaflet
          return loadLeafletFallback(container, points, options || {});
        }
        return loadBaiduWebGl(config.baiduWebAk)
          .then(function (BMapGL) {
            if (currentRender !== container.dataset.travelMapRender || !container.isConnected) return false;
            drawBaiduMap(container, BMapGL, points, options || {});
            return true;
          });
      })
      .catch(function () {
        if (currentRender === container.dataset.travelMapRender && container.isConnected) {
          return loadLeafletFallback(container, points, options || {});
        }
        return false;
      });
  }

  global.TravelMap = {
    renderPlan: function (container, points, origin, isMultiCity) {
      return render(container, points, { origin: origin, drawRoute: Boolean(isMultiCity), zoom: 11 });
    },
    renderDay: function (container, pois, cityCenter) {
      var pointValues = (pois || []).map(function (poi) {
        return { name: poi.name, coordinates: poi.coordinates || { lat: poi.lat, lng: poi.lng } };
      });
      return render(container, pointValues, { origin: cityCenter ? { coordinates: cityCenter } : null, drawRoute: false, zoom: 14 });
    }
  };
})(window);
