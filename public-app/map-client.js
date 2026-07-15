(function (global) {
  'use strict';

  var configPromise = null;
  var sdkPromise = null;
  var classicSdkPromise = null;
  var leafletPromise = null;
  var renderId = 0;

  // 手机端检测
  function isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  function getClientConfig() {
    if (!configPromise) {
      configPromise = fetch('/api/v1/map/client-config', {
        credentials: 'same-origin',
        cache: 'no-store'
      }).then(function (response) {
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
      var settled = false;
      var callbackName = '__travelPersonaBaiduWebGlReady';
      var script = document.createElement('script');
      function finish(error) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        global[callbackName] = function () {};
        if (error) reject(error);
        else resolve(global.BMapGL);
      }
      var timer = global.setTimeout(function () {
        finish(new Error('Baidu WebGL SDK load timeout'));
      }, 12000);

      global[callbackName] = function () {
        if (global.BMapGL) finish(null);
        else finish(new Error('Baidu WebGL SDK did not initialize'));
      };
      script.async = true;
      script.src = 'https://api.map.baidu.com/api?v=1.0&type=webgl&ak=' + encodeURIComponent(ak) + '&callback=' + callbackName;
      script.onload = function () {
        global.setTimeout(function () {
          if (global.BMapGL) finish(null);
        }, 0);
      };
      script.onerror = function () {
        finish(new Error('Baidu WebGL SDK script load error'));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      sdkPromise = null;
      throw error;
    });
    return sdkPromise;
  }

  function loadBaiduClassic(ak) {
    if (global.BMap) return Promise.resolve(global.BMap);
    if (classicSdkPromise) return classicSdkPromise;

    classicSdkPromise = new Promise(function (resolve, reject) {
      var settled = false;
      var callbackName = '__travelPersonaBaiduClassicReady';
      var script = document.createElement('script');
      function finish(error) {
        if (settled) return;
        settled = true;
        global.clearTimeout(timer);
        global[callbackName] = function () {};
        if (error) reject(error);
        else resolve(global.BMap);
      }
      var timer = global.setTimeout(function () {
        finish(new Error('Baidu classic SDK load timeout'));
      }, 12000);

      global[callbackName] = function () {
        if (global.BMap) finish(null);
        else finish(new Error('Baidu classic SDK did not initialize'));
      };
      script.async = true;
      script.src = 'https://api.map.baidu.com/api?v=3.0&ak=' + encodeURIComponent(ak) + '&callback=' + callbackName;
      script.onload = function () {
        global.setTimeout(function () {
          if (global.BMap) finish(null);
        }, 0);
      };
      script.onerror = function () {
        finish(new Error('Baidu classic SDK script load error'));
      };
      document.head.appendChild(script);
    }).catch(function (error) {
      classicSdkPromise = null;
      throw error;
    });
    return classicSdkPromise;
  }

  function loadLeaflet() {
    if (global.L) return Promise.resolve(global.L);
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise(function (resolve, reject) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'vendor/leaflet/leaflet.css';
      document.head.appendChild(link);
      var script = document.createElement('script');
      script.src = 'vendor/leaflet/leaflet.js';
      script.onload = function () {
        if (global.L) resolve(global.L);
        else reject(new Error('Leaflet did not initialize'));
      };
      script.onerror = function () { reject(new Error('Leaflet script load error')); };
      document.head.appendChild(script);
    }).catch(function (e) {
      leafletPromise = null;
      throw e;
    });
    return leafletPromise;
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

  function addSourceLabel(container) {
    var label = document.createElement('div');
    label.className = 'map-source-label';
    label.textContent = '百度地图 · 中国大陆';
    container.appendChild(label);
  }

  function drawBaiduMap(container, BMapGL, points, options) {
    container.classList.remove('plan-map--fallback');
    container.innerHTML = '';
    var map = new BMapGL.Map(container, { enableMapClick: false });
    map.enableScrollWheelZoom(false);
    if (BMapGL.ZoomControl) map.addControl(new BMapGL.ZoomControl());

    var viewportPoints = [];
    var routePoints = [];
    points.forEach(function (item, index) {
      var bd = wgs84ToBd09(item.coordinates.lat, item.coordinates.lng);
      var point = new BMapGL.Point(bd.lng, bd.lat);
      viewportPoints.push(point);
      routePoints.push(point);
      var marker = new BMapGL.Marker(point);
      marker.setTitle(item.name);
      map.addOverlay(marker);
      if (item.name && BMapGL.Label && BMapGL.Size) {
        var label = new BMapGL.Label(String(index + 1) + ' ' + item.name, {
          position: point,
          offset: new BMapGL.Size(12, -26)
        });
        label.setStyle({ color: '#173026', backgroundColor: '#ffffff', border: '1px solid #c9ddd2', borderRadius: '3px', padding: '3px 5px', fontSize: '11px', lineHeight: '15px' });
        map.addOverlay(label);
      }
    });

    var origin = validPoint(options.origin);
    if (origin) {
      var originBd = wgs84ToBd09(origin.coordinates.lat, origin.coordinates.lng);
      var originPoint = new BMapGL.Point(originBd.lng, originBd.lat);
      viewportPoints.push(originPoint);
      map.addOverlay(new BMapGL.Marker(originPoint));
    }

    if (options.drawRoute && routePoints.length > 1) {
      map.addOverlay(new BMapGL.Polyline(routePoints, { strokeColor: '#2d6a4f', strokeWeight: 4, strokeOpacity: 0.78 }));
    }
    // 单目的地模式：从出发地到各目的地画放射虚线
    if (!options.drawRoute && origin && routePoints.length > 0) {
      var originBd2 = wgs84ToBd09(origin.coordinates.lat, origin.coordinates.lng);
      var originPt = new BMapGL.Point(originBd2.lng, originBd2.lat);
      viewportPoints.push(originPt);
      routePoints.forEach(function (dest) {
        map.addOverlay(new BMapGL.Polyline([originPt, dest], {
          strokeColor: '#2d6a4f', strokeWeight: 2, strokeOpacity: 0.55, strokeStyle: 'dashed'
        }));
      });
    }
    if (viewportPoints.length > 1) map.setViewport(viewportPoints, { margins: [30, 30, 30, 30] });
    else map.centerAndZoom(viewportPoints[0], options.zoom || 11);
    addSourceLabel(container);
  }

  function drawBaiduClassicMap(container, BMap, points, options) {
    container.classList.remove('plan-map--fallback');
    container.innerHTML = '';
    var map = new BMap.Map(container, { enableMapClick: false });
    map.enableScrollWheelZoom(false);
    if (BMap.NavigationControl) map.addControl(new BMap.NavigationControl({ anchor: global.BMAP_ANCHOR_TOP_LEFT }));

    var viewportPoints = [];
    var routePoints = [];
    points.forEach(function (item, index) {
      var bd = wgs84ToBd09(item.coordinates.lat, item.coordinates.lng);
      var point = new BMap.Point(bd.lng, bd.lat);
      viewportPoints.push(point);
      routePoints.push(point);
      var marker = new BMap.Marker(point);
      marker.setTitle(item.name);
      map.addOverlay(marker);
      if (item.name && BMap.Label && BMap.Size) {
        var label = new BMap.Label(String(index + 1) + ' ' + item.name, {
          position: point,
          offset: new BMap.Size(12, -26)
        });
        label.setStyle({ color: '#173026', backgroundColor: '#ffffff', border: '1px solid #c9ddd2', borderRadius: '3px', padding: '3px 5px', fontSize: '11px', lineHeight: '15px' });
        map.addOverlay(label);
      }
    });

    var origin = validPoint(options.origin);
    if (origin) {
      var originBd = wgs84ToBd09(origin.coordinates.lat, origin.coordinates.lng);
      var originPoint = new BMap.Point(originBd.lng, originBd.lat);
      viewportPoints.push(originPoint);
      map.addOverlay(new BMap.Marker(originPoint));
    }

    if (options.drawRoute && routePoints.length > 1) {
      map.addOverlay(new BMap.Polyline(routePoints, { strokeColor: '#2d6a4f', strokeWeight: 4, strokeOpacity: 0.78 }));
    }
    // 单目的地模式：从出发地到各目的地画放射虚线
    if (!options.drawRoute && origin && routePoints.length > 0) {
      var originBd2 = wgs84ToBd09(origin.coordinates.lat, origin.coordinates.lng);
      var originPt = new BMap.Point(originBd2.lng, originBd2.lat);
      viewportPoints.push(originPt);
      routePoints.forEach(function (dest) {
        map.addOverlay(new BMap.Polyline([originPt, dest], {
          strokeColor: '#2d6a4f', strokeWeight: 2, strokeOpacity: 0.55, strokeStyle: 'dashed'
        }));
      });
    }
    if (viewportPoints.length > 1) map.setViewport(viewportPoints, { margins: [30, 30, 30, 30] });
    else map.centerAndZoom(viewportPoints[0], options.zoom || 11);
    addSourceLabel(container);
  }

  function drawBaiduStaticMap(container, points, options) {
    var routeValues = points.slice();
    var origin = validPoint(options.origin);
    if (origin && !routeValues.some(function (item) {
      return item.coordinates.lat === origin.coordinates.lat && item.coordinates.lng === origin.coordinates.lng;
    })) routeValues.unshift(origin);
    var serialized = routeValues.map(function (item) {
      return item.coordinates.lng.toFixed(6) + ',' + item.coordinates.lat.toFixed(6);
    }).join(';');
    if (!serialized) return;

    container.classList.remove('plan-map--fallback');
    container.innerHTML = '';
    var image = document.createElement('img');
    image.className = 'plan-map__static-image';
    image.alt = 'Baidu Map route overview';
    image.decoding = 'async';
    image.src = '/api/v1/map/static-route?points=' + encodeURIComponent(serialized);
    image.onerror = function () {
      if (image.isConnected) showFallback(container, 'Route order is available while the map refreshes.');
    };
    container.appendChild(image);
    addSourceLabel(container);
  }

  function drawLeafletMap(container, points, options) {
    // 使用 Leaflet 绘制地图（需要 Leaflet 已加载）
    if (!global.L) {
      showFallback(container, '地图加载中，路线顺序仍可正常使用。');
      return;
    }
    container.classList.remove('plan-map--fallback');
    container.innerHTML = '';
    var map = global.L.map(container, { zoomControl: false, attributionControl: false });

    // 添加瓦片层
    global.L.tileLayer('/api/v1/map/tile/amap/{z}/{x}/{y}', {
      maxZoom: 18,
      crossOrigin: true
    }).addTo(map);

    var markers = [];
    points.forEach(function(item, index) {
      var marker = global.L.marker([item.coordinates.lat, item.coordinates.lng]).addTo(map);
      marker.bindPopup(String(index + 1) + ' ' + item.name);
      markers.push([item.coordinates.lat, item.coordinates.lng]);
    });

    var origin = validPoint(options.origin);
    if (origin) {
      global.L.marker([origin.coordinates.lat, origin.coordinates.lng], {
        icon: global.L.divIcon({ className: 'map-origin-marker', html: '起', iconSize: [24, 24] })
      }).addTo(map);
      markers.push([origin.coordinates.lat, origin.coordinates.lng]);
    }

    if (options.drawRoute && markers.length > 1) {
      global.L.polyline(markers, { color: '#2d6a4f', weight: 4, opacity: 0.78 }).addTo(map);
    }
    // 单目的地模式：从出发地到各目的地画放射虚线
    if (!options.drawRoute && origin && markers.length > 1) {
      var originLatLng = [origin.coordinates.lat, origin.coordinates.lng];
      markers.forEach(function (dest) {
        global.L.polyline([originLatLng, dest], {
          color: '#2d6a4f', weight: 2, opacity: 0.55, dashArray: '8,8'
        }).addTo(map);
      });
    }

    if (markers.length > 1) {
      map.fitBounds(markers, { padding: [30, 30] });
    } else if (markers.length === 1) {
      map.setView(markers[0], options.zoom || 11);
    }

    addSourceLabel(container);
  }

  function render(container, values, options) {
    var points = (values || []).map(validPoint).filter(Boolean);
    if (!container) return Promise.resolve(false);
    if (!points.length) {
      showFallback(container, '这组结果暂时缺少可验证坐标，路线顺序仍可正常使用。');
      return Promise.resolve(false);
    }
    var currentRender = String(++renderId);
    container.dataset.travelMapRender = currentRender;

    return getClientConfig().then(function (config) {
      if (currentRender !== container.dataset.travelMapRender || !container.isConnected) return false;

      // 手机端：优先 Leaflet（轻量、兼容性好），再尝试百度 WebGL
      if (isMobile() && config.leafletTiles) {
        if (global.L) {
          drawLeafletMap(container, points, options || {});
        } else {
          // 动态加载 Leaflet
          loadLeaflet().then(function () {
            if (currentRender !== container.dataset.travelMapRender || !container.isConnected) return false;
            drawLeafletMap(container, points, options || {});
          }).catch(function () {
            showFallback(container, '地图加载中，路线顺序仍可正常使用。');
          });
        }
        return true;
      }

      // 桌面端：先静态图，再交互式
      if (config.staticAk) {
        drawBaiduStaticMap(container, points, options || {});
      }

      if (config.interactiveMap && config.baiduWebAk) {
        loadBaiduWebGl(config.baiduWebAk).then(function (BMapGL) {
          if (currentRender !== container.dataset.travelMapRender || !container.isConnected) return false;
          drawBaiduMap(container, BMapGL, points, options || {});
          return true;
        }).catch(function () {
          return loadBaiduClassic(config.baiduWebAk).then(function (BMap) {
            if (currentRender !== container.dataset.travelMapRender || !container.isConnected) return false;
            drawBaiduClassicMap(container, BMap, points, options || {});
            return true;
          });
        }).catch(function () {
          return false;
        });
      }

      return true;
    }).catch(function () {
      showFallback(container, '地图服务暂时不可用，路线顺序仍可正常使用。');
      return false;
    });
  }

  global.TravelMap = {
    renderPlan: function (container, points, origin, isMultiCity) {
      return render(container, points, { origin: origin, drawRoute: Boolean(isMultiCity), zoom: 11 });
    },
    renderDay: function (container, pois, cityCenter) {
      var values = (pois || []).map(function (poi) {
        return { name: poi.name, coordinates: poi.coordinates || { lat: poi.lat, lng: poi.lng } };
      });
      return render(container, values, { origin: cityCenter ? { coordinates: cityCenter } : null, drawRoute: false, zoom: 14 });
    }
  };
})(window);
