/**
 * 旅格 Travel Persona · 规划页 — 多城路线详情（Phase 3 拆分）
 *
 * 模块职责：
 * - 多城路线可视化（renderMultiCityPlan）
 * - 路线变体选择器
 * - 跨城耗时/票价展示（routeAssessment）
 * - 路线节点时间线
 * - 地图数据增强请求构建（buildMapEnrichmentRequest）
 * - 地图数据增强应用（applyMapEnrichment）
 * - 选中路线变体获取（getSelectedRouteVariant）
 * - 关键节点提示（getCriticalNodeTips）
 *
 * 依赖：app.js 已定义全局 App 对象
 * 注册：App.PlanRoute
 */
(function (global) {
  'use strict';

  var App = global.App;
  if (!App) {
    console.error('[plan-route.js] App 命名空间未找到，请确保 app.js 已加载');
    return;
  }

  // 快捷引用
  var el = App.el;
  var state = App.state;
  var icon = App.icon;
  var PATH_TYPES = App.PATH_TYPES;
  var formatCurrency = App.formatCurrency;

  // ============================================================
  // 选中路线变体获取
  // ============================================================

  function getSelectedRouteVariant(plan) {
    var variants = plan?.variants || [];
    return variants.find(function (variant) { return variant.id === state.plan.selectedRouteVariantId; })
      || variants.find(function (variant) { return variant.recommended; })
      || plan?.primary
      || variants[0]
      || null;
  }

  // ============================================================
  // 地图数据增强
  // ============================================================

  function buildMapEnrichmentRequest(result) {
    var cityNames = [];
    var pois = [];
    var transitLegs = [];
    if (result.multiCityPlan) {
      (result.multiCityPlan.variants || [result.multiCityPlan.primary]).forEach(function (variant) {
        (variant?.nodes || []).forEach(function (node) {
          if (node.city) cityNames.push(node.city);
          (node.dayPlans || []).forEach(function (day) {
            (day.pois || []).forEach(function (poi) {
              if (poi.name) pois.push({ city: node.city, name: poi.name });
            });
          });
        });
      });
      var selectedVariant = getSelectedRouteVariant(result.multiCityPlan);
      var selectedNodes = selectedVariant?.nodes || [];
      for (var legIndex = 0; legIndex < selectedNodes.length - 1; legIndex += 1) {
        transitLegs.push({ from: selectedNodes[legIndex].city, to: selectedNodes[legIndex + 1].city });
      }
    } else {
      (result.decisionPaths || []).forEach(function (path) {
        if (path.city?.name) cityNames.push(path.city.name);
      });
    }
    return {
      cities: cityNames.filter(function (name, index, all) { return name && all.indexOf(name) === index; }).slice(0, 12),
      pois: pois.filter(function (poi, index, all) {
        return all.findIndex(function (item) { return item.city === poi.city && item.name === poi.name; }) === index;
      }).slice(0, 12),
      transitLegs: transitLegs.slice(0, 10),
      departureDate: state.plan.tripContext.dates?.start || ''
    };
  }

  function applyMapEnrichment(result, enrichment) {
    if (!enrichment || (enrichment.mapFreshness !== 'live' && enrichment.transitFreshness !== 'live')) return false;
    var cityMap = {};
    (enrichment.cities || []).forEach(function (item) {
      if (item.verified && item.coordinates) cityMap[item.name] = item.coordinates;
    });
    (result.decisionPaths || []).forEach(function (path) {
      if (path.city && cityMap[path.city.name]) path.city.coordinates = cityMap[path.city.name];
    });
    if (result.multiCityPlan) {
      (result.multiCityPlan.variants || [result.multiCityPlan.primary]).forEach(function (variant) {
        (variant?.nodes || []).forEach(function (node) {
          if (cityMap[node.city]) node.coordinates = cityMap[node.city];
          (node.dayPlans || []).forEach(function (day) {
            (day.pois || []).forEach(function (poi) {
              var fact = (enrichment.pois || []).find(function (item) {
                return item.verified && item.city === node.city && item.name === poi.name;
              });
              if (!fact) return;
              if (fact.coordinates) poi.coordinates = fact.coordinates;
              if (fact.openHours) poi.openHours = fact.openHours;
              if (fact.address) poi.address = fact.address;
              poi.mapVerified = true;
            });
          });
        });
      });
      result.multiCityPlan.primary = getSelectedRouteVariant(result.multiCityPlan) || result.multiCityPlan.primary;
      if (enrichment.transitFreshness === 'live') {
        var selectedVariant = getSelectedRouteVariant(result.multiCityPlan);
        var assessment = selectedVariant?.routeAssessment;
        var liveLegs = (enrichment.transitLegs || []).filter(function (item) { return item.verified; });
        if (assessment && assessment.legs && liveLegs.length) {
          assessment.legs.forEach(function (leg) {
            var live = liveLegs.find(function (item) { return item.from === leg.from && item.to === leg.to; });
            if (live) leg.live = live;
          });
          var allMatched = assessment.legs.length > 0 && assessment.legs.every(function (leg) { return Boolean(leg.live); });
          if (allMatched) {
            assessment.transportHours = assessment.legs.reduce(function (total, leg) {
              total.min += Number(leg.live.durationHours?.min || 0);
              total.max += Number(leg.live.durationHours?.max || 0);
              return total;
            }, { min: 0, max: 0 });
            assessment.transportHours.min = Math.round(assessment.transportHours.min * 10) / 10;
            assessment.transportHours.max = Math.round(assessment.transportHours.max * 10) / 10;
            var allFaresKnown = assessment.legs.every(function (leg) { return leg.live.fareCny && Number(leg.live.fareCny.min) > 0; });
            if (allFaresKnown) {
              assessment.transportFare = assessment.legs.reduce(function (total, leg) {
                total.min += Number(leg.live.fareCny.min);
                total.max += Number(leg.live.fareCny.max);
                return total;
              }, { min: 0, max: 0 });
              var styleMultiplier = Number(result.multiCityPlan.budgetModel?.travelStyle?.costMultiplier || 1);
              assessment.costRange = {
                min: Math.round((Number(assessment.localBaseCost || 0) * styleMultiplier * 0.86 + assessment.transportFare.min) / 100) * 100,
                max: Math.round((Number(assessment.localBaseCost || 0) * styleMultiplier * 1.18 + assessment.transportFare.max) / 100) * 100
              };
              selectedVariant.costRange = assessment.costRange;
              var ceiling = Number(result.multiCityPlan.budgetModel?.hardMax || result.multiCityPlan.budgetModel?.totalBudget || 0);
              if (ceiling) {
                selectedVariant.budgetStatus = assessment.costRange.max <= ceiling
                  ? '在预算上限内'
                  : assessment.costRange.min > ceiling ? '预计超过上限' : '需要压缩或实时比价';
              }
            }
            assessment.source = 'baidu-live';
            assessment.departureDate = enrichment.departureDate;
            assessment.checkedAt = enrichment.checkedAt;
            assessment.dataConfidence = 0.9;
          }
        }
      }
    }
    result.capability = Object.assign({}, result.capability, {
      mapFreshness: enrichment.mapFreshness === 'live' ? 'live' : result.capability?.mapFreshness,
      transitFreshness: enrichment.transitFreshness,
      mapProvider: enrichment.mapProvider || result.capability?.mapProvider
    });
    result.realTimeData = Object.assign({}, result.realTimeData, {
      mapEvidence: {
        verifiedCities: enrichment.verifiedCities || 0,
        verifiedPois: enrichment.verifiedPois || 0,
        verifiedTransitLegs: enrichment.verifiedTransitLegs || 0,
        transitFreshness: enrichment.transitFreshness,
        mapProvider: enrichment.mapProvider || '',
        checkedAt: enrichment.checkedAt
      }
    });
    return true;
  }

  // ============================================================
  // 关键节点提示
  // ============================================================

  function getCriticalNodeTips(node) {
    var seen = {};
    return (node.dayPlans || []).flatMap(function (day) { return day.pois || []; }).map(function (poi) {
      return poi.tip ? poi.name + '：' + poi.tip : '';
    }).filter(function (tip) {
      if (!tip || !/预约|闭馆|营业|不要|提前|天气|旺季|排队/.test(tip) || seen[tip]) return false;
      seen[tip] = true;
      return true;
    }).slice(0, 2);
  }

  function renderTravelStyleStrategy(style) {
    if (!style || !style.label) return null;
    var rows = [
      { label: '住宿', value: style.stay },
      { label: '餐饮', value: style.dining },
      { label: '体验', value: style.experiences }
    ].filter(function (item) { return item.value; });
    return el('section', { className: 'route-style-plan', 'aria-label': '本次旅行消费策略' }, [
      el('div', { className: 'route-style-plan__heading' }, [
        el('div', {}, [
          el('span', { className: 'route-style-plan__eyebrow', textContent: '本次消费策略' }),
          el('h3', { textContent: style.label }),
          el('p', { textContent: style.summary || '' })
        ]),
        style.status ? el('span', { className: 'tag', textContent: style.status }) : null
      ]),
      el('dl', { className: 'route-style-plan__rows' }, rows.flatMap(function (item) {
        return [el('dt', { textContent: item.label }), el('dd', { textContent: item.value })];
      })),
      style.budgetNote ? el('p', { className: 'route-style-plan__note', textContent: style.budgetNote }) : null
    ]);
  }

  // ============================================================
  // 多城路线可视化
  // ============================================================

  function renderMultiCityPlan(plan) {
    var section = el('section', { className: 'route-plan', 'aria-labelledby': 'route-plan-title' });
    var variants = plan.variants || (plan.primary ? [plan.primary] : []);
    var selected = getSelectedRouteVariant(plan);
    var hardMax = Number(plan.budgetModel?.hardMax || 0);
    var lowestCostVariantId = global.PathSelection.chooseLowestCostVariant(variants);

    if (variants.length > 1) {
      var chooser = el('div', { className: 'route-variant-grid', role: 'radiogroup', 'aria-label': '选择路线节奏' });
      variants.forEach(function (variant) {
        var isSelected = selected && variant.id === selected.id;
        var variantCost = variant.costRange || {};
        var variantCostText = Number(variantCost.min) > 0 && Number(variantCost.max) > 0
          ? formatCurrency(variantCost.min) + '–' + formatCurrency(variantCost.max)
          : '费用待核验';
        var uniqueCities = (variant.nodes || []).map(function (item) { return item.city; }).filter(function (city, index, all) {
          return city && all.indexOf(city) === index;
        });
        var stops = Math.max(0, uniqueCities.length - 1);
        var budgetLabel = '';
        var budgetClass = '';
        if (hardMax && Number(variantCost.min) > hardMax) {
          budgetLabel = '超出上限';
          budgetClass = ' route-variant__budget--danger';
        } else if (hardMax && Number(variantCost.max) > hardMax) {
          budgetLabel = '有超支风险';
          budgetClass = ' route-variant__budget--warning';
        } else if (hardMax && Number(variantCost.max) > 0) {
          budgetLabel = '预算上限内';
        }
        var badges = el('span', { className: 'route-variant__badges' });
        if (variant.recommended) badges.appendChild(el('span', { className: 'route-variant__badge', textContent: '建议先看' }));
        if (variant.id === lowestCostVariantId) badges.appendChild(el('span', { className: 'route-variant__badge route-variant__badge--cost', textContent: '更低成本' }));
        if (!variant.recommended && variant.id !== lowestCostVariantId) {
          badges.appendChild(el('span', { className: 'route-variant__badge route-variant__badge--neutral', textContent: stops + ' 个停留城市' }));
        }
        chooser.appendChild(el('button', {
          type: 'button',
          className: 'route-variant' + (isSelected ? ' route-variant--selected' : ''),
          role: 'radio',
          'aria-checked': isSelected ? 'true' : 'false',
          'aria-label': variant.name + '，预计 ' + variantCostText + '，' + Number(variant.moveCount || 0) + ' 段换城，' + Number(variant.bufferDays || 0) + ' 天机动' + (budgetLabel ? '，' + budgetLabel : ''),
          onClick: function () {
            state.plan.selectedRouteVariantId = variant.id;
            App.PlanPage.render(document.getElementById('app'));
          }
        }, [
          badges,
          el('strong', { textContent: variant.name }),
          el('span', { className: 'route-variant__tagline', textContent: variant.tagline }),
          el('span', { className: 'route-variant__facts' }, [
            el('span', { className: 'route-variant__price', textContent: variantCostText }),
            el('span', { textContent: Number(variant.moveCount || 0) + ' 段换城' }),
            el('span', { textContent: Number(variant.bufferDays || 0) + ' 天机动' })
          ]),
          budgetLabel ? el('span', { className: 'route-variant__budget' + budgetClass, textContent: budgetLabel }) : null,
          el('span', { className: 'route-variant__tradeoff', textContent: variant.tradeoff })
        ]));
      });
      section.appendChild(chooser);
    }

    selected = selected || plan.primary || {};
    var cost = selected.costRange || {};
    var costText = cost.min && cost.max ? formatCurrency(cost.min) + '–' + formatCurrency(cost.max) : '--';
    section.appendChild(el('div', { className: 'route-plan__summary' }, [
      el('div', {}, [
        el('h2', { id: 'route-plan-title', className: 'sampling-title', textContent: selected.name || '多城路线方案' }),
        el('p', { className: 'sampling-note', textContent: selected.tradeoff || plan.summary })
      ]),
      el('div', { className: 'route-plan__metrics' }, [
        el('div', {}, [el('strong', { textContent: String(selected.totalDays || plan.totalDays || '--') }), el('span', { textContent: '总天数' })]),
        el('div', {}, [el('strong', { textContent: String(selected.moveCount || '--') }), el('span', { textContent: '换城段数' })]),
        el('div', { className: 'route-plan__metric-wide' }, [el('strong', { textContent: costText }), el('span', { textContent: '预计总花费' })]),
        el('div', {}, [el('strong', { textContent: String(selected.bufferDays || 0) }), el('span', { textContent: '机动天数' })])
      ])
    ]));

    var styleStrategy = renderTravelStyleStrategy(plan.budgetModel?.travelStyle);
    if (styleStrategy) section.appendChild(styleStrategy);

    if (hardMax && Number(cost.min) > hardMax) {
      section.appendChild(el('div', { className: 'route-budget-callout route-budget-callout--danger', role: 'alert' }, [
        el('strong', { textContent: '这条路线预计会超过你的最高上限' }),
        el('span', { textContent: '最低估算仍比上限高 ' + formatCurrency(Number(cost.min) - hardMax) + '，请先切换路线或删减城市。' })
      ]));
    } else if (hardMax && Number(cost.max) > hardMax) {
      section.appendChild(el('div', { className: 'route-budget-callout', role: 'status' }, [
        el('strong', { textContent: '预算存在 ' + formatCurrency(Number(cost.max) - hardMax) + ' 的风险区间' }),
        el('span', { textContent: '当前最低估算仍在上限内；保存前优先压住宿、核验车票，必要时删掉一站。' })
      ]));
    }

    var assessment = selected.routeAssessment;
    if (assessment) {
      var hours = assessment.transportHours || {};
      var fare = assessment.transportFare || {};
      var confidenceText = Math.round(Number(assessment.dataConfidence || 0) * 100) + '%';
      var transitIsLive = assessment.source === 'baidu-live';
      section.appendChild(el('div', { className: 'route-plan__evidence', 'aria-label': '路线计算依据' }, [
        icon('route', 'route-plan__evidence-icon'),
        el('div', { className: 'route-plan__evidence-body' }, [
          el('div', { className: 'route-plan__evidence-facts' }, [
            el('span', { textContent: '跨城约 ' + hours.min + '–' + hours.max + ' 小时' }),
            el('span', { textContent: assessment.transfers + ' 段需中途转车' }),
            el('span', { textContent: '交通票价 ' + formatCurrency(fare.min) + '–' + formatCurrency(fare.max) }),
            el('span', { textContent: transitIsLive ? '出发日数据已核验' : '静态数据把握 ' + confidenceText })
          ]),
          el('p', {
            textContent: transitIsLive
              ? '已按 ' + assessment.departureDate + ' 由百度地图核验跨城方案；最终车次、余票和价格仍以出票页为准。'
              : assessment.unknownLegs
              ? assessment.unknownLegs + ' 段仍缺可靠基线，保存前必须完成地图核验。'
              : assessment.estimatedLegs
              ? assessment.estimatedLegs + ' 段采用城市间距离与交通便利度的保守估算；填写出发日后应逐段核验真实车次。'
              : '预计总价由各城停留成本和跨城交通共同计算；"中途转车"不同于跨城段数，班次与票价仍需按真实出发日核验。'
          })
        ])
      ]));
    }

    var nodes = selected.nodes || [];
    var timeline = el('ol', { className: 'route-timeline', 'aria-label': '多城路线顺序' });
    nodes.forEach(function (node, index) {
      var criticalTips = getCriticalNodeTips(node);
      timeline.appendChild(el('li', { className: 'route-node' }, [
        el('div', { className: 'route-node__rail' }, [
          el('span', { className: 'route-node__index', textContent: String(index + 1) })
        ]),
        el('div', { className: 'route-node__content' }, [
          el('div', { className: 'route-node__heading' }, [
            el('strong', { textContent: node.city }),
            el('span', { className: 'tag', textContent: node.stay ? node.stay + ' 天' : '结束' }),
            el('span', { className: 'route-node__role', textContent: node.role || '' })
          ]),
          el('p', { textContent: node.reason || '' }),
          node.transport ? el('div', { className: 'route-node__transport' }, [icon('route', 'route-node__icon'), el('span', { textContent: node.transport })]) : null,
          node.dayPlans && node.dayPlans.length ? el('div', { className: 'route-node__days' }, node.dayPlans.map(function (day) {
            var poiNames = (day.pois || []).map(function (poi) { return poi.name; });
            return el('div', { className: 'route-node__day' }, [
              el('strong', { textContent: 'D' + day.day }),
              el('span', { textContent: poiNames.length ? poiNames.join(' / ') : day.theme })
            ]);
          })) : null,
          criticalTips.length ? el('ul', { className: 'route-node__tips' }, criticalTips.map(function (tip) {
            return el('li', { textContent: tip });
          })) : null
        ])
      ]));
    });
    section.appendChild(timeline);

    if (plan.cutPlan && plan.cutPlan.length) {
      section.appendChild(el('div', { className: 'route-cut-plan' }, [
        el('h3', { textContent: '按天数怎么删' }),
        el('ul', {}, plan.cutPlan.map(function (item) { return el('li', { textContent: item }); }))
      ]));
    }

    if (plan.redFlags && plan.redFlags.length) {
      section.appendChild(el('div', { className: 'route-watchouts' }, [
        el('h3', { textContent: '先锁住这些风险' }),
        el('ul', {}, plan.redFlags.slice(0, 3).map(function (item) { return el('li', { textContent: item }); }))
      ]));
    }
    return section;
  }

  // ============================================================
  // 注册到 App 命名空间
  // ============================================================

  App.PlanRoute = {
    getSelectedRouteVariant: getSelectedRouteVariant,
    buildMapEnrichmentRequest: buildMapEnrichmentRequest,
    applyMapEnrichment: applyMapEnrichment,
    getCriticalNodeTips: getCriticalNodeTips,
    renderTravelStyleStrategy: renderTravelStyleStrategy,
    renderMultiCityPlan: renderMultiCityPlan
  };

})(typeof window !== 'undefined' ? window : this);
