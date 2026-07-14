/**
 * 旅格 Travel Persona · 规划页 — 三路径结果渲染（Phase 3 拆分）
 *
 * 模块职责：
 * - 决策路径卡片渲染（personaBest / balanced / lowCost）
 * - 反事实解释展示（总纲6.3）
 * - 决策摘要（renderDecisionBrief）
 * - 地图容器渲染与初始化（renderPlanMap / initPlanMap）
 * - 结果页主渲染入口（renderResult）
 * - 提交规划请求（submitPlan）
 * - 保存为行程（saveAsTrip 及相关函数）
 *
 * 依赖：app.js 已定义全局 App 对象
 * 注册：App.PlanResult
 */
(function (global) {
  'use strict';

  var App = global.App;
  if (!App) {
    console.error('[plan-result.js] App 命名空间未找到，请确保 app.js 已加载');
    return;
  }

  // 快捷引用
  var el = App.el;
  var state = App.state;
  var apiCall = App.apiCall;
  var PATH_TYPES = App.PATH_TYPES;
  var AVOIDS = App.AVOIDS;
  var renderLoadingState = App.renderLoadingState;
  var renderErrorState = App.renderErrorState;
  var formatCurrency = App.formatCurrency;
  var formatPercent = App.formatPercent;
  var setStorage = App.setStorage;
  var sendTelemetry = App.sendTelemetry;
  var durationBucket = App.durationBucket;

  // 地图状态变量（跨渲染生命周期保持）
  var activePlanMap = null;
  var activePlanMapResizeHandler = null;
  var activePlanMapResizeObserver = null;

  function scrollPageToTop() {
    global.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function calculateEndDate(startDate, totalDays) {
    var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(startDate || ''));
    if (!match) return '';
    var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    date.setDate(date.getDate() + Math.max(1, Number(totalDays) || 1) - 1);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  }

  function getSelectedRouteVariant(plan) {
    // 优先使用 App.PlanRoute 提供的版本（如果已加载），否则用本地实现
    if (App.PlanRoute && App.PlanRoute.getSelectedRouteVariant) {
      return App.PlanRoute.getSelectedRouteVariant(plan);
    }
    var variants = plan?.variants || [];
    return variants.find(function (variant) { return variant.id === state.plan.selectedRouteVariantId; })
      || variants.find(function (variant) { return variant.recommended; })
      || plan?.primary
      || variants[0]
      || null;
  }

  // ============================================================
  // 提交规划请求
  // ============================================================

  /**
   * 提交规划请求到 POST /api/v1/plans
   * 总纲13.6：API版本化
   * 输入格式：{ tripIntent, tripContext }
   * 输出格式：PlanResponse（含 decisionPaths）
   */
  async function submitPlan() {
    var startedAt = Date.now();
    var plan = state.plan;
    plan.loading = true;
    plan.error = null;
    plan.result = null;

    // 立即渲染加载状态
    App.PlanPage.render(document.getElementById('app'));

    try {
      // 构造请求体（符合 docs/schemas/TripIntent.json 和 TripContext.json）
      var requestBody = {
        tripIntent: {
          mood: plan.tripIntent.mood,
          moodLabel: (App.findMood(plan.tripIntent.mood) || {}).label || plan.tripIntent.mood,
          interests: plan.tripIntent.interests,
          avoid: plan.tripIntent.avoid,
          freeText: plan.tripIntent.freeText,
          companion: plan.tripIntent.companion || 'solo',
          destination: plan.tripContext.destination || undefined
        },
        tripContext: {
          origin: plan.tripContext.origin,
          days: plan.tripContext.days,
          dates: plan.tripContext.dates && plan.tripContext.dates.start ? plan.tripContext.dates : undefined,
          budget: {
            comfort: plan.tripContext.budget.comfort,
            hardMax: plan.tripContext.budget.hardMax,
            saveTarget: plan.tripContext.budget.saveTarget
          },
          season: plan.tripContext.season || 'unknown'
        }
      };

      // 调用 API
      var result = await apiCall('POST', '/plans', requestBody);
      result.decisionContext = {
        tripIntent: {
          avoid: (requestBody.tripIntent.avoid || []).slice()
        },
        tripContext: {
          origin: requestBody.tripContext.origin,
          destination: requestBody.tripIntent.destination || '',
          days: requestBody.tripContext.days,
          dates: requestBody.tripContext.dates ? { start: requestBody.tripContext.dates.start } : undefined,
          budget: Object.assign({}, requestBody.tripContext.budget)
        }
      };
      sendTelemetry({
        event: 'plan_completed',
        surface: 'plan',
        code: 'SUCCESS',
        mode: 'local',
        durationBucket: durationBucket(Date.now() - startedAt)
      });

      plan.loading = false;
      plan.result = result;
      var returnedPaths = result.decisionPaths || [];
      plan.selectedPathType = global.PathSelection.chooseInitialPathType(returnedPaths, {
        hardMax: plan.tripContext.budget.hardMax,
        routeGoal: result.multiCityPlan ? 'multiCityValue' : ''
      });
      plan.selectedRouteVariantId = result.multiCityPlan
        ? (result.multiCityPlan.selectedVariantId || 'balanced')
        : null;

      // 如果返回中包含人格快照，更新本地人格档案
      if (result.personaSnapshot && result.personaSnapshot.primaryPersona) {
        state.persona.provisionalPersona = result.personaSnapshot.primaryPersona;
        state.persona.provisionalSecondaryPersona = result.personaSnapshot.secondaryPersona || null;
        state.persona.provisionalConfidence = result.personaSnapshot.confidence;
        state.persona.secondaryPersona = result.personaSnapshot.secondaryPersona || null;
        if (result.personaSnapshot.traits) {
          state.persona.provisionalTraits = result.personaSnapshot.traits;
        }
        state.persona.basis = result.personaSnapshot.basis || result.capability?.personaSource || 'current-trip-cold-start';
        state.persona.updatedAt = new Date().toISOString();
        setStorage('tp_persona', state.persona);
      }

      // 渲染结果
      App.PlanPage.render(document.getElementById('app'));
      scrollPageToTop();

      // 本地规划结果先完整呈现，Agent 只在后台增强解释。
      // 增强失败、超时或未配置时保持当前结果，用户不会看到模式切换。
      apiCall('POST', '/agent/enhance-explanation', { planResponse: result })
        .then(function (enhanced) {
          if (!enhanced || !enhanced.capability || !enhanced.capability.agentApplied) {
            sendTelemetry({ event: 'agent_fallback', surface: 'agent', code: 'LOCAL_RESULT', mode: 'fallback' });
            return;
          }
          if (!plan.result || plan.result.planId !== result.planId) return;
          ['explanations', 'highlights', 'conversationReply'].forEach(function (key) {
            if (enhanced[key] !== undefined) plan.result[key] = enhanced[key];
          });
          plan.result.capability = Object.assign({}, plan.result.capability, { agentApplied: true });
          if (global.location.hash !== '#/plan') return;
          App.PlanPage.render(document.getElementById('app'));
        })
        .catch(function (error) {
          sendTelemetry({ event: 'agent_fallback', surface: 'agent', code: error?.code || 'NETWORK', mode: 'fallback' });
          // 本地结果已经完整可用，增强失败无需打断用户。
        });

      var mapRequest = App.PlanRoute.buildMapEnrichmentRequest(result);
      if (mapRequest.cities.length || mapRequest.pois.length) {
        apiCall('POST', '/map/enrich-plan', mapRequest)
          .then(function (enrichment) {
            if (enrichment?.mapFreshness !== 'live' && enrichment?.transitFreshness !== 'live') {
              sendTelemetry({ event: 'map_fallback', surface: 'map', code: 'SNAPSHOT_USED', mode: 'snapshot' });
            }
            if (!plan.result || plan.result.planId !== result.planId) return;
            if (!App.PlanRoute.applyMapEnrichment(plan.result, enrichment)) return;
            if (global.location.hash !== '#/plan') return;
            App.PlanPage.render(document.getElementById('app'));
          })
          .catch(function (error) {
            sendTelemetry({ event: 'map_fallback', surface: 'map', code: error?.code || 'NETWORK', mode: 'fallback' });
            // 静态坐标已经足够支撑基础决策，在线核验失败不打断规划。
          });
      }

    } catch (err) {
      plan.loading = false;
      plan.error = err;
      App.PlanPage.render(document.getElementById('app'));
    }
  }

  // ============================================================
  // 渲染决策路径结果
  // ============================================================

  function renderDecisionBrief(result, multiCityPlan) {
    var savedContext = result?.decisionContext || {};
    var context = savedContext.tripContext || state.plan.tripContext || {};
    var intent = savedContext.tripIntent || state.plan.tripIntent || {};
    var facts = [];
    if (context.origin) facts.push(context.origin + '出发');
    if (context.destination) facts.push(context.destination + '必到');
    if (context.days) facts.push(context.days + ' 天');
    if (context.budget?.hardMax) facts.push('最高 ' + formatCurrency(context.budget.hardMax));
    if (context.budget?.saveTarget) facts.push('希望再省 ' + formatCurrency(context.budget.saveTarget));

    var avoidLabels = (intent.avoid || []).map(function (key) {
      var item = AVOIDS.find(function (option) { return option.key === key; });
      return item ? item.label : '';
    }).filter(Boolean);
    var explanation = avoidLabels.length
      ? '同时避开：' + avoidLabels.join('、') + '。'
      : '没有额外避雷条件，系统按本次取向与现实条件平衡。';

    if (multiCityPlan && (intent.avoid || []).indexOf('longTransit') !== -1) {
      var variants = multiCityPlan.variants || [];
      var selected = getSelectedRouteVariant(multiCityPlan);
      var leastMoves = variants.reduce(function (best, variant) {
        return !best || Number(variant.moveCount || Infinity) < Number(best.moveCount || Infinity) ? variant : best;
      }, null);
      if (selected && leastMoves && selected.id !== leastMoves.id && Number(selected.moveCount) > Number(leastMoves.moveCount)) {
        var selectedStops = new Set((selected.nodes || []).map(function (node) { return node.city; }).filter(Boolean)).size - 1;
        var leastStops = new Set((leastMoves.nodes || []).map(function (node) { return node.city; }).filter(Boolean)).size - 1;
        explanation += ' "长途换乘"已作为降权项；当前方案仍保留 ' + selected.moveCount + ' 段跨城移动，是为了比' + leastMoves.name + '多保留 ' + Math.max(0, selectedStops - leastStops) + ' 个停留城市。更在意少移动时，可直接切换到' + leastMoves.name + '。';
      } else if (selected && leastMoves && selected.id === leastMoves.id) {
        explanation += ' 当前已经是三条方案里跨城移动最少的一条。';
      }
    }

    return el('section', { className: 'decision-brief', 'aria-labelledby': 'decision-brief-title' }, [
      el('div', { className: 'decision-brief__label', textContent: '本次计算条件' }),
      el('div', { className: 'decision-brief__body' }, [
        el('strong', { id: 'decision-brief-title', textContent: facts.join(' · ') || '按本次取向计算' }),
        el('p', { textContent: explanation })
      ])
    ]);
  }

  /**
   * 渲染规划结果页
   * 总纲5.2：三条并列路径（人格本选/现实平衡/低成本方案）
   * 每条路径显示：城市名、匹配度、理由、代价、反事实
   */
  function renderResult(container) {
    var result = state.plan.result;
    var multiCityPlan = result.multiCityPlan || null;
    var page = el('div', { className: 'page' });

    page.appendChild(el('div', { className: 'page-kicker', textContent: 'DECISION PATHS' }));
    page.appendChild(el('h1', { className: 'page__title', textContent: multiCityPlan ? multiCityPlan.title : '三种都合理，但代价不同' }));
    page.appendChild(el('p', { className: 'page__subtitle', textContent: multiCityPlan
      ? (multiCityPlan.summary || '把去程、必到城市和返程放在一条线上计算；路线留有删减空间，不用把所有城市都玩满。')
      : '先选一条作为当前方案。你之后的删除、替换和真实体验也会成为理解你的证据。' }));

    page.appendChild(renderDecisionBrief(result, multiCityPlan));
    page.appendChild(renderPlanMap(result));
    if (multiCityPlan) page.appendChild(App.PlanRoute.renderMultiCityPlan(multiCityPlan));

    // 节假日/实时数据提醒
    var realTime = result.realTimeData || {};
    if (realTime.holiday && realTime.holiday.travelFriendliness === 'low') {
      page.appendChild(el('div', { className: 'alert alert--warning mb-md' }, [
        el('span', { textContent: '日历提醒：' + realTime.holiday.reason + '。如时间灵活，建议错峰。' })
      ]));
    }
    if (!multiCityPlan && realTime.weather && Object.keys(realTime.weather).length > 0) {
      page.appendChild(el('div', { className: 'font-meta text-muted mb-md', textContent: '已接入未来 7 天天气；超出预报范围时只作为近期参考。' }));
    }

    // 决策路径列表
    var decisionPaths = result.decisionPaths || [];

    // 桌面端用网格，移动端用列表
    var grid = el('div', { className: 'card-grid' });

    if (!multiCityPlan) decisionPaths.forEach(function (path) {
      // 将对应路径的天气数据附加到 path 上（供卡片内展示）
      if (realTime.weather && realTime.weather[path.type]) {
        path.weather = realTime.weather[path.type];
      }
      grid.appendChild(renderPathCard(path, state.plan.selectedPathType === path.type, function () {
        state.plan.selectedPathType = path.type;
        var grid = document.querySelector('.card-grid');
        if (grid) {
          grid.querySelectorAll('.path-card').forEach(function(c) {
            var isSel = c.dataset.pathType === path.type;
            c.classList.toggle('path-card--selected', isSel);
            c.setAttribute('aria-checked', String(isSel));
            // 更新选择指示文字
            var selSpan = c.querySelector('.path-card__selection span:last-child');
            var iconWrap = c.querySelector('.path-card__selection');
            if (selSpan) selSpan.textContent = isSel ? '当前选择' : '选择这条';
            var oldIcon = iconWrap ? iconWrap.querySelector('.path-card__selection-icon') : null;
            var oldDot = iconWrap ? iconWrap.querySelector('.path-card__selection-dot') : null;
            if (isSel && oldDot) {
              oldDot.remove();
              iconWrap.insertBefore(App.icon('check', 'path-card__selection-icon'), iconWrap.querySelector('span'));
            } else if (!isSel && oldIcon) {
              oldIcon.remove();
              iconWrap.insertBefore(el('span', { className: 'path-card__selection-dot' }), iconWrap.querySelector('span'));
            }
          });
        }
      }));
    });

    if (!multiCityPlan) page.appendChild(grid);

    // 人格快照信息（如果有的话）
    if (result.personaSnapshot && result.personaSnapshot.primaryPersona) {
      var personaInfo = result.personaSnapshot.primaryPersona;
      var personaCapability = result.capability || {};
      var personaSourceText = personaCapability.personaSource === 'server-confirmed'
        ? '已使用你确认过的 ' + personaCapability.acceptedTraitCount + ' 个长期旅格维度，并结合这次的取向重新计算。'
        : personaCapability.personaSource === 'non-personalized'
          ? '这次未使用长期旅格，只按你此刻给出的条件计算。'
          : '长期旅格还没有形成，这次先按当前取向和现实条件计算。';
      var personaCard = el('div', { className: 'card mt-lg' }, [
        el('div', { className: 'card__header' }, [
          el('div', { className: 'card__title', textContent: '这次决策如何理解你' })
        ]),
        el('div', { className: 'card__body' }, [
          el('div', { className: 'persona-card' }, [
            App.renderPersonaVisual(personaInfo.id, 'sm'),
            el('div', { className: 'persona-card__info' }, [
              el('div', { className: 'persona-card__name', textContent: personaInfo.name }),
              el('div', { className: 'persona-card__blend', textContent: '判断把握 ' + formatPercent(personaInfo.confidence || 0.5) }),
              el('div', { className: 'sampling-note', textContent: personaSourceText })
            ])
          ])
        ])
      ]);
      page.appendChild(personaCard);
    }

    // 操作按钮
    var actions = el('div', { className: 'flex gap-sm mt-lg' }, [
      el('button', {
        className: 'btn btn--secondary',
          textContent: '调整条件',
          onClick: function () {
           state.plan.step = 3;
           state.plan.result = null;
           state.plan.error = null;
           App.PlanForm.renderAndReset();
        }
      }),
      el('button', {
        className: 'btn btn--primary',
        textContent: state.plan.saveBusy ? '保存中' : '保存所选方案',
        disabled: state.plan.saveBusy || !(multiCityPlan || state.plan.selectedPathType) ? 'disabled' : null,
        onClick: function () {
          saveAsTrip(result, state.plan.selectedPathType);
        }
      })
    ]);
    page.appendChild(actions);

    container.innerHTML = '';
    container.appendChild(page);
    initPlanMap(result);
  }

  function renderPlanMap(result) {
    var isRoute = Boolean(result.multiCityPlan);
    var routeSequence = isRoute
      ? (getSelectedRouteVariant(result.multiCityPlan)?.nodes || []).map(function (node) { return node.city; }).filter(Boolean)
      : [];
    var mapIsLive = result.capability?.mapFreshness === 'live';
    var transitIsLive = result.capability?.transitFreshness === 'live';
    var mapProvider = result.capability?.mapProvider || '';
    var note = isRoute
      ? (transitIsLive ? '城市、关键地点和跨城交通已按出发日期核验；最终车次与价格仍以出票页为准。' : mapIsLive ? '城市与关键地点已由地图服务核验；车次和票价仍需在出发前确认。' : '地图用于判断方向和绕行，具体车次与耗时需在出发前再次校验。')
      : (mapIsLive ? '目的地坐标已由地图服务核验，距离会继续参与方案比较。' : '距离会参与现实平衡与低成本方案，不再只按城市标签排序。');
    return el('section', { className: 'map-section', 'aria-labelledby': 'plan-map-title' }, [
      el('div', { className: 'map-section__heading' }, [
        el('div', {}, [
          el('div', { className: 'map-section__title-row' }, [
            el('h2', { id: 'plan-map-title', className: 'sampling-title', textContent: isRoute ? '整条路线放在地图上' : '先看这三个选择在哪里' }),
            mapIsLive ? el('span', { className: 'tag map-section__verified', textContent: mapProvider === 'mcp-baidu' ? '百度地图已核验' : '地图地点已核验' }) : null
          ]),
          el('p', { className: 'sampling-note', textContent: note })
        ]),
        App.icon('map', 'map-section__icon')
      ]),
      el('div', { id: 'plan-map', className: 'plan-map' }, [
        el('div', { className: 'plan-map__fallback', textContent: '正在载入地图…' })
      ]),
      routeSequence.length ? el('div', { className: 'route-map-sequence', 'aria-label': '当前路线城市顺序' }, [
        el('span', { className: 'route-map-sequence__label', textContent: '当前路线' }),
        el('span', { className: 'route-map-sequence__cities', textContent: routeSequence.join(' → ') })
      ]) : null
    ]);
  }

  // ========== 瓦片层配置 ==========

  var TILE_SOURCES = [];

  function createTileLayer(map, onSourceChange) {
    var sourceIndex = 0;
    var errorCount = 0;
    var errorTimer = null;
    var currentLayer = null;

    function trySource(index) {
      if (index >= TILE_SOURCES.length) {
        index = TILE_SOURCES.length - 1;
      }
      sourceIndex = index;
      var src = TILE_SOURCES[index];
      if (currentLayer) {
        map.removeLayer(currentLayer);
      }
      currentLayer = global.L.tileLayer(src.url, {
        maxZoom: 18,
        attribution: src.attribution,
        subdomains: src.subdomains
      });
      currentLayer.on('tileerror', function () {
        errorCount++;
        if (!errorTimer) {
          errorTimer = setTimeout(function () {
            if (errorCount >= 3 && sourceIndex < TILE_SOURCES.length - 1) {
              trySource(sourceIndex + 1);
            }
            errorCount = 0;
            errorTimer = null;
          }, 3000);
        }
      });
      currentLayer.addTo(map);
      if (onSourceChange) onSourceChange(src.name);
    }

    trySource(0);
    return { currentLayer: currentLayer, getSourceName: function () { return TILE_SOURCES[sourceIndex].name; } };
  }

  // ========== Haversine 距离计算 ==========
  function haversineDistance(lat1, lng1, lat2, lng2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function estimateTransitTime(distanceKm) {
    return {
      driving: { timeMin: Math.round(distanceKm / 40 * 60), label: '约' + Math.round(distanceKm / 40 * 10) / 10 + '小时' },
      walking: { timeMin: Math.round(distanceKm / 5 * 60), label: '约' + Math.round(distanceKm / 5 * 10) / 10 + '小时' },
      transit: { timeMin: Math.round(distanceKm / 25 * 60), label: '约' + Math.round(distanceKm / 25 * 10) / 10 + '小时' }
    };
  }

  // ========== 主地图初始化 ==========
  function initPlanMap(result) {
    var mapElement = document.getElementById('plan-map');
    if (!mapElement) return;
    if (!global.TravelMap) {
      mapElement.querySelector('.plan-map__fallback').textContent = '国内地图组件暂未加载。';
      return;
    }

    if (activePlanMapResizeHandler) {
      global.removeEventListener('resize', activePlanMapResizeHandler);
      activePlanMapResizeHandler = null;
    }
    if (activePlanMapResizeObserver) {
      activePlanMapResizeObserver.disconnect();
      activePlanMapResizeObserver = null;
    }
    if (activePlanMap) {
      try { activePlanMap.remove(); } catch (error) { /* detached maps are safe to discard */ }
      activePlanMap = null;
    }

    var isMultiCity = !!result.multiCityPlan;
    var points = [];
    if (isMultiCity) {
      var selectedRoute = getSelectedRouteVariant(result.multiCityPlan);
      (selectedRoute?.nodes || []).forEach(function (node) {
        if (!node.coordinates) return;
        points.push({ name: node.city, coordinates: node.coordinates, meta: node.stay ? node.stay + ' 天' : node.role });
      });
    } else {
      (result.decisionPaths || []).forEach(function (path) {
        if (!path.city?.coordinates) return;
        points.push({
          name: path.city.name,
          coordinates: path.city.coordinates,
          meta: (PATH_TYPES[path.type] || PATH_TYPES.balanced).label
        });
      });
    }
    if (points.length === 0) {
      mapElement.querySelector('.plan-map__fallback').textContent = '这组结果暂时缺少可验证坐标。';
      return;
    }

    var mapOrigin = null;
    if (!isMultiCity && state.plan && state.plan.tripContext && state.plan.tripContext.origin) {
      var firstDecisionPath = (result.decisionPaths || [])[0];
      if (firstDecisionPath && firstDecisionPath.originCoordinates) {
        mapOrigin = {
          name: state.plan.tripContext.origin,
          coordinates: firstDecisionPath.originCoordinates
        };
      }
    }
    global.TravelMap.renderPlan(mapElement, points, mapOrigin, isMultiCity);
    return;

    mapElement.innerHTML = '';
    var map = global.L.map(mapElement, {
      scrollWheelZoom: false,
      zoomControl: true,
      attributionControl: true
    });
    activePlanMap = map;

    // 瓦片层 + 来源标签
    var sourceLabel = null;
    var tileManager = createTileLayer(map, function (name) {
      if (!sourceLabel) {
        sourceLabel = global.L.control({ position: 'bottomright' });
        sourceLabel.onAdd = function () {
          var div = global.L.DomUtil.create('div', 'map-source-label');
          div.style.cssText = 'background:rgba(255,255,255,0.85);padding:2px 8px;border-radius:4px;font-size:11px;color:#6B7280;pointer-events:none;';
          return div;
        };
        sourceLabel.addTo(map);
      }
      sourceLabel.getContainer().textContent = '地图来源：' + name;
    });

    var latLngs = [];
    var allBounds = [];

    // 出发地 Hub（单目的地模式）
    var originLatLng = null;
    var originName = '';
    if (!isMultiCity && state.plan && state.plan.tripContext && state.plan.tripContext.origin) {
      originName = state.plan.tripContext.origin;
      // 尝试从已有数据中找出发地坐标（优先用第一个path的originCoordinates，或 city.name 匹配）
      var firstPath = (result.decisionPaths || [])[0];
      if (firstPath && firstPath.originCoordinates) {
        originLatLng = [firstPath.originCoordinates.lat, firstPath.originCoordinates.lng];
      }
    }

    // 渲染目的地标记
    points.forEach(function (point) {
      var latLng = [point.coordinates.lat, point.coordinates.lng];
      latLngs.push(latLng);
      allBounds.push(latLng);
      global.L.marker(latLng, {
        title: point.name,
        alt: '目的地：' + point.name
      }).addTo(map).bindTooltip(point.name + (point.meta ? ' · ' + point.meta : ''));
    });

    // 路线绘制
    if (isMultiCity) {
      // 多城路线：顺序折线
      if (latLngs.length > 1) {
        global.L.polyline(latLngs, { color: '#275EFE', weight: 3, opacity: 0.72 }).addTo(map);
      }
    } else if (originLatLng) {
      // 单目的地：Hub-Spoke 放射式
      allBounds.push(originLatLng);
      // 出发地 Hub 标记（品牌绿色）
      var hubIcon = global.L.divIcon({
        className: 'hub-marker',
        html: '<div style="width:14px;height:14px;background:#2D6A4F;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.3);"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      global.L.marker(originLatLng, { icon: hubIcon, title: originName, alt: '出发地：' + originName })
        .addTo(map).bindTooltip(originName + ' · 出发地');

      // 放射线 + 点击交通时间
      points.forEach(function (point) {
        var destLatLng = [point.coordinates.lat, point.coordinates.lng];
        var polyline = global.L.polyline([originLatLng, destLatLng], {
          color: '#275EFE', weight: 2, opacity: 0.55, dashArray: '6, 4'
        }).addTo(map);

        polyline.on('click', function (e) {
          var dist = haversineDistance(originLatLng[0], originLatLng[1], destLatLng[0], destLatLng[1]);
          var estimates = estimateTransitTime(dist);
          var popupContent = '<div style="min-width:180px;">' +
            '<div style="font-weight:600;margin-bottom:6px;">' + originName + ' → ' + point.name + '</div>' +
            '<div style="font-size:12px;color:#6B7280;margin-bottom:4px;">直线距离 ' + Math.round(dist) + ' 公里</div>' +
            '<div style="display:flex;gap:12px;font-size:13px;">' +
            '<div>🚗 ' + estimates.driving.label + '</div>' +
            '<div>🚌 ' + estimates.transit.label + '</div>' +
            '<div>🚶 ' + estimates.walking.label + '</div>' +
            '</div>' +
            '<div style="font-size:11px;color:#9CA3AF;margin-top:6px;">按直线距离估算，仅供参考</div>' +
            '</div>';
          global.L.popup({ offset: [0, -5] }).setLatLng(e.latlng).setContent(popupContent).openOn(map);
        });
      });
    } else if (latLngs.length > 1) {
      // 无出发地坐标时 fallback 到顺序折线
      global.L.polyline(latLngs, { color: '#275EFE', weight: 3, opacity: 0.72 }).addTo(map);
    }

    // 视图适配
    var resizeFrame = 0;
    function fitMapToRoute() {
      resizeFrame = 0;
      if (!mapElement.isConnected || activePlanMap !== map) return;
      map.invalidateSize();
      if (allBounds.length > 1) {
        map.fitBounds(allBounds, { padding: [30, 30], maxZoom: 7 });
        var latitudes = allBounds.map(function (p) { return p[0]; });
        var longitudes = allBounds.map(function (p) { return p[1]; });
        var latSpan = Math.max.apply(null, latitudes) - Math.min.apply(null, latitudes);
        var lngSpan = Math.max.apply(null, longitudes) - Math.min.apply(null, longitudes);
        if (latSpan <= 28 && lngSpan <= 42 && map.getZoom() < 4) {
          map.setZoom(4);
        }
      } else if (allBounds.length === 1) {
        map.setView(allBounds[0], 10);
      }
    }
    activePlanMapResizeHandler = function () {
      if (resizeFrame) global.cancelAnimationFrame(resizeFrame);
      resizeFrame = global.requestAnimationFrame(fitMapToRoute);
    };
    global.addEventListener('resize', activePlanMapResizeHandler, { passive: true });
    if (global.ResizeObserver) {
      activePlanMapResizeObserver = new global.ResizeObserver(activePlanMapResizeHandler);
      activePlanMapResizeObserver.observe(mapElement);
    }
    resizeFrame = global.requestAnimationFrame(fitMapToRoute);
  }

  // ========== 每日迷你地图初始化 ==========
  function initDayMiniMap(containerId, pois, cityCenter) {
    if (!global.TravelMap) return;
    var container = document.getElementById(containerId);
    if (!container) return;
    global.TravelMap.renderDay(container, pois, cityCenter);
    return;

    var center = cityCenter && cityCenter.lat != null
      ? [cityCenter.lat, cityCenter.lng]
      : [pois[0].lat, pois[0].lng];

    var map = global.L.map(container, {
      scrollWheelZoom: false,
      zoomControl: false,
      attributionControl: false
    });

    // 复用瓦片逻辑，但静默模式（无来源标签切换）
    global.L.tileLayer(TILE_SOURCES[0].url, {
      maxZoom: 18,
      subdomains: TILE_SOURCES[0].subdomains,
      attribution: ''
    }).addTo(map);

    var bounds = [];
    pois.forEach(function (p) {
      var latLng = [p.lat, p.lng];
      bounds.push(latLng);
      global.L.circleMarker(latLng, {
        radius: 5,
        color: '#275EFE',
        fillColor: '#275EFE',
        fillOpacity: 0.8,
        weight: 1
      }).addTo(map).bindTooltip(p.name);
    });

    if (bounds.length === 1) {
      map.setView(bounds[0], 14);
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
    } else {
      map.setView(center, 13);
    }
  }

  /**
   * 渲染单条决策路径卡片
   * 总纲5.2：personaBest / balanced / lowCost
   * 总纲6.3：反事实解释
   */
  function renderPathCard(path, selected, onSelect) {
    var pathType = path.type || 'balanced';
    var typeInfo = PATH_TYPES[pathType] || PATH_TYPES.balanced;
    var city = path.city || {};
    var cost = path.costEstimate || {};
    var personaFit = path.personaFit != null ? path.personaFit : 0;

    // 卡片容器
    var card = el('article', {
      className: 'card path-card path-card--' + pathType + (selected ? ' path-card--selected' : ''),
      role: 'radio',
      tabindex: '0',
      dataset: { pathType: pathType },
      'aria-checked': selected ? 'true' : 'false',
      onClick: onSelect,
      onKeydown: function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }
    });

    // 路径类型标签
    card.appendChild(el('div', { className: 'path-card__badge', textContent: typeInfo.label }));
    card.appendChild(el('div', { className: 'path-card__selection' }, [
      selected ? App.icon('check', 'path-card__selection-icon') : el('span', { className: 'path-card__selection-dot' }),
      el('span', { textContent: selected ? '当前选择' : '选择这条' })
    ]));

    // 城市名
    card.appendChild(el('div', { className: 'path-card__city', textContent: city.name || '未知城市' }));
    if (city.province) {
      card.appendChild(el('div', { className: 'font-meta text-muted mb-sm', textContent: city.province }));
    }

    // 匹配度
    card.appendChild(el('div', { className: 'path-card__score' }, [
      el('span', { className: 'path-card__score-value', textContent: formatPercent(personaFit) }),
      el('span', { className: 'path-card__score-label', textContent: '人格匹配度' })
    ]));

    // 适合理由
    if (path.reason) {
      card.appendChild(el('div', { className: 'path-card__reason', textContent: path.reason }));
    }

    // 代价/不适合的方面
    if (path.watchOut) {
      card.appendChild(el('div', { className: 'path-card__reason path-card__watchout', textContent: path.watchOut }));
    }

    // 成本估算
    if (cost.totalMin != null || cost.totalMax != null) {
      var costText = '';
      if (cost.totalMin != null && cost.totalMax != null) {
        costText = formatCurrency(cost.totalMin) + ' - ' + formatCurrency(cost.totalMax);
      } else if (cost.totalMin != null) {
        costText = '起 ' + formatCurrency(cost.totalMin);
      } else {
        costText = '最高 ' + formatCurrency(cost.totalMax);
      }
      card.appendChild(el('div', { className: 'path-card__cost' }, [
        el('span', { className: 'path-card__cost-label', textContent: '预计花费' }),
        el('span', { className: 'path-card__cost-value', textContent: costText })
      ]));
    }

    // 实时天气摘要
    var weather = path.weather || null;
    if (weather && weather.forecast && weather.forecast.length > 0) {
      var w = weather.forecast[0];
      var weatherIcons = { '晴': '☀️', '多云': '⛅', '阴': '☁️', '小雨': '🌦️', '中雨': '🌧️', '大雨': '⛈️', '雷阵雨': '⛈️', '雪': '❄️', '雾': '🌫️', '霾': '😷' };
      var icon = weatherIcons[w.textDay] || '';
      var windText = w.windDir && w.windScale ? ' · ' + w.windDir + w.windScale + '级' : '';
      card.appendChild(el('div', { className: 'path-card__weather' }, [
        el('span', { className: 'path-card__weather-label', textContent: '天气' }),
        el('span', { textContent: icon + ' ' + w.textDay + ' ' + w.tempMin + '°~' + w.tempMax + '°' + windText })
      ]));
    } else {
      card.appendChild(el('div', { className: 'path-card__weather' }, [
        el('span', { className: 'path-card__weather-label', textContent: '天气' }),
        el('span', { style: { color: '#9CA3AF' }, textContent: '数据暂不可用' })
      ]));
    }

    // 天气小建议
    if (path.weather && path.weather.weatherTip) {
      var tipEl = el('div', { className: 'path-card__weather-tip', textContent: path.weather.weatherTip });
      // 插入到天气元素后面
      var weatherSection = card.querySelector('.path-card__weather');
      if (weatherSection && weatherSection.parentNode) {
        weatherSection.parentNode.insertBefore(tipEl, weatherSection.nextSibling);
      }
    }

    // 交通成本（优先用后端返回的 transportCost，否则异步查询）
    var originName = state.plan && state.plan.tripContext && state.plan.tripContext.origin ? state.plan.tripContext.origin : '';
    if (originName && originName !== city.name) {
      var transportEl = el('div', { className: 'path-card__transport' }, [
        el('span', { className: 'path-card__transport-label', textContent: '往返交通' }),
        el('span', { className: 'path-card__transport-loading' })
      ]);
      card.appendChild(transportEl);

      // 渲染交通数据的通用函数
      function renderTransport(t) {
        if (!transportEl.isConnected) return;
        var textEl = transportEl.querySelector('.path-card__transport-loading');
        if (!textEl) return;
        if (!t) {
          textEl.style.color = '#9CA3AF';
          textEl.textContent = '暂无数据';
          return;
        }
        if (t.source === 'baidu-map' && t.distanceKm && t.durationHours) {
          textEl.textContent = t.distanceKm + 'km · 驾车约' + t.durationHours + '小时';
          textEl.style.color = '';
        } else if (t.source === 'static-baseline' && t.fareCny && t.durationHours) {
          var durMin = t.durationHours.min || t.durationHours;
          var durMax = t.durationHours.max || t.durationHours;
          var durText = (durMin === durMax ? durMin + '小时' : durMin + '-' + durMax + '小时');
          var fareText = '¥' + t.fareCny.min + '-' + t.fareCny.max;
          textEl.textContent = fareText + ' · ' + (t.mode === 'rail' ? '铁路' : t.mode || '交通') + ' ' + durText;
          textEl.style.color = '';
          // 叠加交通费用到总预算显示
          var costValueEl = card.querySelector('.path-card__cost-value');
          if (costValueEl && cost.totalMin != null && cost.totalMax != null) {
            var newMin = cost.totalMin + (t.fareCny.min || 0);
            var newMax = cost.totalMax + (t.fareCny.max || 0);
            costValueEl.textContent = formatCurrency(newMin) + ' - ' + formatCurrency(newMax) + '（含往返交通）';
          }
        } else if (t.mode || t.distanceKm) {
          var parts = [];
          if (t.fareCny) parts.push('¥' + t.fareCny.min + '-' + t.fareCny.max);
          if (t.distanceKm) parts.push(t.distanceKm + 'km');
          if (typeof t.durationHours === 'number') parts.push((t.mode === 'rail' ? '铁路' : '驾车') + '约' + t.durationHours + '小时');
          textEl.textContent = parts.join(' · ') || '暂无数据';
          textEl.style.color = parts.length ? '' : '#9CA3AF';
        } else {
          textEl.style.color = '#9CA3AF';
          textEl.textContent = '暂无数据';
        }
      }

      // 优先使用后端返回的 transportCost
      if (path.transportCost) {
        renderTransport(path.transportCost);
      } else {
        // 后端未返回，异步查询作为降级
        transportEl.querySelector('.path-card__transport-loading').textContent = '查询中...';
        apiCall('POST', '/transport/cost-estimate', { from: originName, to: city.name }).then(function (res) {
          if (!transportEl.isConnected) return;
          if (res.available) {
            renderTransport({
              mode: res.mode,
              fareCny: res.fareCny,
              durationHours: res.durationHours,
              source: 'static-api'
            });
          } else {
            renderTransport(null);
          }
        }).catch(function () {
          if (!transportEl.isConnected) return;
          renderTransport(null);
        });
      }
    }

    // 反事实解释（总纲6.3）
    if (path.counterfactual) {
      card.appendChild(el('div', { className: 'path-card__counterfactual' }, [
        el('span', { className: 'path-card__counterfactual-label', textContent: '如果换个条件' }),
        el('span', { textContent: path.counterfactual })
      ]));
    }

    // 旅格详细日程按钮
    card.appendChild(el('button', {
      className: 'btn btn--text btn--block itinerary-btn',
      textContent: '查看旅格详细日程',
      onClick: function (event) {
        event.stopPropagation();
        renderItineraryModal(city, path);
      }
    }));

    return card;
  }

  // ============================================================
  // AI 详细日程模态框
  // ============================================================

  function renderItineraryModal(city, path) {
    var plan = state.plan;
    var tripContext = plan.tripContext || {};
    var tripIntent = plan.tripIntent || {};
    var loadingTexts = ['旅格正在为您规划行程', '旅格正在为您规划行程.', '旅格正在为您规划行程..', '旅格正在为您规划行程...'];
    var loadingIndex = 0;

    var contentArea = el('div', { className: 'itinerary-content' });

    // 加载状态
    var loadingArea = el('div', { className: 'itinerary-loading' }, [
      el('div', { className: 'itinerary-loading__spinner' }),
      el('div', { className: 'itinerary-loading__text', textContent: loadingTexts[0] })
    ]);
    contentArea.appendChild(loadingArea);

    var loadingInterval = setInterval(function () {
      loadingIndex = (loadingIndex + 1) % loadingTexts.length;
      var textEl = loadingArea.querySelector('.itinerary-loading__text');
      if (textEl) textEl.textContent = loadingTexts[loadingIndex];
    }, 500);

    var dialog = el('dialog', {
      className: 'itinerary-dialog',
      'aria-labelledby': 'itinerary-dialog-title'
    }, [
      el('div', { className: 'itinerary-dialog__header' }, [
        el('div', {}, [
          el('div', { className: 'page-kicker', textContent: '旅格 ITINERARY' }),
          el('h2', { id: 'itinerary-dialog-title', textContent: (city.name || '未知城市') + ' · 详细日程' })
        ]),
        el('button', {
          type: 'button',
          className: 'icon-button',
          title: '关闭',
          'aria-label': '关闭日程详情',
          onClick: function () { dialog.close(); }
        }, [App.icon('x', 'icon-button__icon')])
      ]),
      contentArea,
      el('div', { className: 'itinerary-dialog__footer' }, [
        el('button', { type: 'button', className: 'btn btn--secondary', textContent: '关闭', onClick: function () { dialog.close(); } })
      ])
    ]);

    document.body.appendChild(dialog);
    dialog.addEventListener('close', function () {
      clearInterval(loadingInterval);
      dialog.remove();
    });
    dialog.showModal();

    // 获取 POI 并调用 itinerary API
    fetchPOIsAndGenerate(city, path, contentArea, loadingArea, loadingInterval);
  }

  async function fetchPOIsAndGenerate(city, path, contentArea, loadingArea, loadingInterval) {
    var plan = state.plan;
    var tripContext = plan.tripContext || {};
    var tripIntent = plan.tripIntent || {};
    var pois = [];

    try {
      var poiRes = await apiCall('GET', '/map/pois?city=' + encodeURIComponent(city.name));
      if (poiRes && Array.isArray(poiRes.pois)) {
        pois = poiRes.pois.slice(0, 24).map(function (p) {
          return {
            name: p.name || '',
            type: p.type || '',
            duration: p.duration || '',
            priceBand: p.priceBand || '',
            openHours: p.openHours || '',
            lat: p.lat || (p.coordinates && p.coordinates.lat) || null,
            lng: p.lng || (p.coordinates && p.coordinates.lng) || null
          };
        });
      }
    } catch (err) {
      // POI 获取失败不影响主流程，传空数组让 AI 基于城市知识生成
      console.warn('POI 获取失败:', err);
    }

    var requestBody = {
      cityId: city.id || '',
      cityName: city.name || '',
      days: Number(tripContext.days) || 3,
      budget: Number(tripContext.budget && tripContext.budget.comfort) || Number(tripContext.budget && tripContext.budget.hardMax) || 2000,
      interests: Array.isArray(tripIntent.interests) ? tripIntent.interests : [],
      avoid: Array.isArray(tripIntent.avoid) ? tripIntent.avoid : [],
      mood: tripIntent.mood || '',
      companion: tripIntent.companion || 'solo',
      pois: pois
    };

    try {
      var itinerary = await apiCall('POST', '/plans/itinerary', requestBody);
      clearInterval(loadingInterval);
      renderItineraryContent(contentArea, itinerary, city, pois);
    } catch (err) {
      clearInterval(loadingInterval);
      contentArea.innerHTML = '';
      contentArea.appendChild(el('div', { className: 'itinerary-error' }, [
        el('p', { textContent: err.userMessage || '日程规划暂时不可用，请稍后重试。' }),
        el('button', {
          className: 'btn btn--secondary',
          textContent: '重试',
          onClick: function () {
            contentArea.innerHTML = '';
            var loadingArea2 = el('div', { className: 'itinerary-loading' }, [
              el('div', { className: 'itinerary-loading__spinner' }),
              el('div', { className: 'itinerary-loading__text', textContent: '旅格正在为您规划行程' })
            ]);
            contentArea.appendChild(loadingArea2);
            fetchPOIsAndGenerate(city, path, contentArea, loadingArea2, loadingInterval);
          }
        })
      ]));
    }
  }

  function renderItineraryContent(container, itinerary, city, allPois) {
    container.innerHTML = '';
    var days = itinerary.days || [];
    var totalBudget = itinerary.totalBudget || 0;
    var transportTips = itinerary.transportTips || '';
    var budgetBreakdown = itinerary.budgetBreakdown || {};

    // 预算条形图
    var budgetKeys = Object.keys(budgetBreakdown);
    var budgetMax = budgetKeys.length ? Math.max.apply(null, budgetKeys.map(function (k) { return budgetBreakdown[k]; })) : 1;
    var budgetBars = el('div', { className: 'itinerary-budget' });
    budgetKeys.forEach(function (key) {
      var value = budgetBreakdown[key];
      var pct = Math.round((value / budgetMax) * 100);
      budgetBars.appendChild(el('div', { className: 'itinerary-budget__row' }, [
        el('span', { className: 'itinerary-budget__label', textContent: key }),
        el('div', { className: 'itinerary-budget__bar-wrap' }, [
          el('div', { className: 'itinerary-budget__bar', style: 'width:' + pct + '%' }),
          el('span', { className: 'itinerary-budget__value', textContent: '¥' + value })
        ])
      ]));
    });

    // 总预算与交通建议
    var originName = state.plan && state.plan.tripContext && state.plan.tripContext.origin ? state.plan.tripContext.origin : '';
    var transportCostEl = null;
    var summarySection = el('div', { className: 'itinerary-summary' }, [
      el('div', { className: 'itinerary-summary__budget' }, [
        el('span', { className: 'itinerary-summary__label', textContent: '预估总预算' }),
        el('span', { className: 'itinerary-summary__value', textContent: '¥' + totalBudget })
      ]),
      transportCostEl = el('div', { className: 'itinerary-summary__transport' }, [
        el('span', { className: 'itinerary-summary__label', textContent: '往返交通' }),
        el('span', { textContent: '查询中...' })
      ]),
      transportTips ? el('div', { className: 'itinerary-summary__transport' }, [
        el('span', { className: 'itinerary-summary__label', textContent: '交通建议' }),
        el('p', { textContent: transportTips })
      ]) : null
    ]);

    container.appendChild(summarySection);
    container.appendChild(budgetBars);

    // 异步查询往返交通成本并更新
    if (originName && originName !== city.name) {
      apiCall('POST', '/transport/cost-estimate', { from: originName, to: city.name }).then(function (res) {
        if (!transportCostEl || !transportCostEl.isConnected) return;
        if (res.available) {
          var durationText = res.durationHours.min + '-' + res.durationHours.max + '小时';
          var fareText = '¥' + res.fareCny.min + '-' + res.fareCny.max;
          transportCostEl.querySelector('span:last-child').textContent = fareText + ' · ' + (res.mode === 'rail' ? '铁路' : res.mode) + ' ' + durationText;
          // 更新总预算显示
          var budgetValueEl = summarySection.querySelector('.itinerary-summary__value');
          if (budgetValueEl) {
            var newTotal = totalBudget + res.fareCny.min;
            budgetValueEl.textContent = '¥' + newTotal + '起（含往返交通）';
          }
        } else {
          transportCostEl.querySelector('span:last-child').textContent = '数据待补充';
          transportCostEl.querySelector('span:last-child').style.color = '#9CA3AF';
        }
      }).catch(function () {
        if (transportCostEl && transportCostEl.isConnected) {
          transportCostEl.querySelector('span:last-child').textContent = '查询失败';
          transportCostEl.querySelector('span:last-child').style.color = '#9CA3AF';
        }
      });
    } else if (transportCostEl) {
      transportCostEl.style.display = 'none';
    }

    // 按天展示时间线
    days.forEach(function (day) {
      // 提取当天有坐标的 POI
      var dayPois = [];
      (day.schedule || []).forEach(function (item) {
        if (item.poiName && allPois) {
          var matched = allPois.find(function (p) { return p.name === item.poiName; });
          if (matched && matched.lat != null && matched.lng != null) {
            dayPois.push({ name: matched.name, lat: matched.lat, lng: matched.lng });
          }
        }
      });

      var mapContainerId = 'day-map-' + day.day;
      var dayMapEl = el('div', { id: mapContainerId, className: 'itinerary-day__map' });

      var dayEl = el('div', { className: 'itinerary-day' }, [
        el('div', { className: 'itinerary-day__header' }, [
          el('span', { className: 'itinerary-day__number', textContent: 'Day ' + day.day }),
          el('span', { className: 'itinerary-day__date', textContent: day.date || '' }),
          el('span', { className: 'itinerary-day__theme', textContent: day.theme || '' })
        ]),
        dayMapEl,
        el('div', { className: 'itinerary-day__transport', textContent: day.dayTransport || '' }),
        el('div', { className: 'itinerary-timeline' })
      ]);

      var timeline = dayEl.querySelector('.itinerary-timeline');
      (day.schedule || []).forEach(function (item) {
        var typeClass = 'itinerary-tag--' + (item.type === '景点' ? 'sight' : item.type === '餐饮' ? 'food' : item.type === '交通' ? 'transit' : 'rest');
        var itemEl = el('div', { className: 'itinerary-item' }, [
          el('div', { className: 'itinerary-item__time', textContent: item.time || '' }),
          el('div', { className: 'itinerary-item__body' }, [
            el('div', { className: 'itinerary-item__title' }, [
              el('span', { textContent: item.activity || '' }),
              el('span', { className: 'itinerary-tag ' + typeClass, textContent: item.type || '' })
            ]),
            item.poiName ? el('div', { className: 'itinerary-item__poi', textContent: item.poiName }) : null,
            item.budget != null ? el('div', { className: 'itinerary-item__budget', textContent: '预算 ¥' + item.budget }) : null,
            item.tips ? el('div', { className: 'itinerary-item__tips', textContent: item.tips }) : null
          ])
        ]);
        timeline.appendChild(itemEl);
      });

      container.appendChild(dayEl);

      // 在 DOM 插入后初始化迷你地图
      if (dayPois.length > 0) {
        requestAnimationFrame(function () {
          initDayMiniMap(mapContainerId, dayPois, city.coordinates);
        });
      }
    });
  }

  // ============================================================
  // 保存为行程
  // ============================================================

  /**
   * 将规划结果保存为行程
   */
  function rememberTripInTimeline(trip) {
    state.growthTimeline = state.growthTimeline || { events: [], summary: {}, nextStep: '' };
    var events = state.growthTimeline.events || [];
    var eventId = 'plan:' + trip.id;
    if (!events.some(function (event) { return event.id === eventId; })) {
      events.unshift({
        id: eventId,
        type: 'plan',
        occurredAt: new Date().toISOString(),
        title: '保存了一次旅行选择',
        summary: trip.title + (trip.cities?.length ? ' · ' + new Set(trip.cities).size + ' 个路线节点' : ''),
        tripId: trip.id,
        status: trip.status
      });
    }
    state.growthTimeline.events = events.slice(0, 8);
    state.growthTimeline.summary = Object.assign({}, state.growthTimeline.summary, {
      plannedTrips: Number(state.growthTimeline.summary?.plannedTrips || 0) + 1
    });
    if (!state.growthTimeline.nextStep) {
      state.growthTimeline.nextStep = '下一次旅行中只需记录一个真实的删改、惊喜或落差，再决定是否允许分析。';
    }
  }

  function refreshTripsAfterSave() {
    return App.loadGrowthTimeline().then(function () {
      if (window.location.hash === '#/trips' && !state.selectedTripId) {
        App.renderTrips(document.getElementById('app'));
      }
    });
  }

  function finishTripSave() {
    state.plan.saveBusy = false;
    return refreshTripsAfterSave();
  }

  function showTripSaveFallback() {
    state.plan.saveBusy = false;
    if (window.location.hash === '#/trips' && !state.selectedTripId) {
      App.renderTrips(document.getElementById('app'));
    }
    App.notify('方案已保存在当前设备，网络恢复后可以在行程里重新保存。', { type: 'info' });
  }

  function saveAsTrip(result, selectedPathType) {
    if (state.plan.saveBusy) return;
    state.plan.saveBusy = true;
    if (result.multiCityPlan) {
      var routePlan = result.multiCityPlan;
      var selectedRoute = getSelectedRouteVariant(routePlan) || routePlan.primary || {};
      var routeNodes = selectedRoute.nodes || [];
      var routeTrip = {
        id: 'trip_' + Date.now(),
        title: (routePlan.origin || '出发地') + ' → ' + (routePlan.destination || '目的地') + ' → ' + (routePlan.origin || '出发地') + ' · ' + (selectedRoute.name || '长线'),
        cities: routeNodes.map(function (node) { return node.city; }).filter(function (city, index, all) { return city && all.indexOf(city) === index; }),
        startDate: state.plan.tripContext.dates.start || '',
        endDate: calculateEndDate(state.plan.tripContext.dates.start || '', selectedRoute.totalDays || routePlan.totalDays),
        status: 'planning',
        syncState: 'pending-create',
        routeChanges: [],
        selectedPathType: 'multiCity:' + (selectedRoute.id || 'balanced'),
        planSnapshot: { ...result, selectedPlan: selectedRoute }
      };
      state.trips.unshift(routeTrip);
      rememberTripInTimeline(routeTrip);
      setStorage('tp_trips', state.trips);
      App.persistTrip(routeTrip, { strict: true })
        .then(finishTripSave)
        .catch(showTripSaveFallback);
      window.location.hash = '#/trips';
      return;
    }

    var decisionPaths = result.decisionPaths || [];
    var selectedPath = decisionPaths.find(function (path) { return path.type === selectedPathType; }) || decisionPaths[0] || {};
    var city = selectedPath.city || {};

    var trip = {
      id: 'trip_' + Date.now(),
      title: city.name ? city.name + '之旅' : '未命名行程',
      cities: city.name ? [city.name] : [],
      startDate: state.plan.tripContext.dates.start || '',
      endDate: calculateEndDate(state.plan.tripContext.dates.start || '', state.plan.tripContext.days),
      status: 'planning',
      syncState: 'pending-create',
      routeChanges: [],
      selectedPathType: selectedPath.type || 'balanced',
      planSnapshot: { ...result, selectedPlan: selectedPath }
    };

    state.trips.unshift(trip);
    rememberTripInTimeline(trip);
    setStorage('tp_trips', state.trips);
    App.persistTrip(trip, { strict: true })
      .then(finishTripSave)
      .catch(showTripSaveFallback);

    // 跳转到行程页
    window.location.hash = '#/trips';
  }

  // ============================================================
  // 注册到 App 命名空间
  // ============================================================

  App.PlanResult = {
    submitPlan: submitPlan,
    renderResult: renderResult,
    renderDecisionBrief: renderDecisionBrief,
    renderPlanMap: renderPlanMap,
    initPlanMap: initPlanMap,
    renderPathCard: renderPathCard,
    saveAsTrip: saveAsTrip,
    rememberTripInTimeline: rememberTripInTimeline,
    getSelectedRouteVariant: getSelectedRouteVariant,
    renderItineraryModal: renderItineraryModal
  };

})(typeof window !== 'undefined' ? window : this);
