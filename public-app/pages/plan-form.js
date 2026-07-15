/**
 * 旅格 Travel Persona · 规划页 — 表单输入部分（Phase 3 拆分）
 *
 * 模块职责：
 * - 渐进取样三步骤渲染（Step 1: mood / Step 2: interests / Step 3: days+budget）
 * - 步骤指示器
 * - 预算弹性输入
 * - 表单校验
 *
 * 依赖：app.js 已定义全局 App 对象
 * 注册：App.PlanForm
 */
(function (global) {
  'use strict';

  var App = global.App;
  if (!App) {
    console.error('[plan-form.js] App 命名空间未找到，请确保 app.js 已加载');
    return;
  }

  // 快捷引用
  var el = App.el;
  var state = App.state;
  var icon = App.icon;
  var MOODS = App.MOODS;
  var INTERESTS = App.INTERESTS;
  var AVOIDS = App.AVOIDS;
  var COMPANIONS = App.COMPANIONS;
  var TRAVEL_STYLES = [
    { key: 'value', label: '性价比优先', desc: '交通便利的经济住宿、本地餐饮和免费或低价体验。' },
    { key: 'balanced', label: '舒适平衡', desc: '稳定舒适的住宿、口碑餐厅和经典体验的平衡。' },
    { key: 'depth', label: '深度体验', desc: '特色住宿、更完整的文化体验和少一点赶路。' },
    { key: 'premium', label: '品质享受', desc: '更好的房间、预约型餐饮和高品质的体验配额。' }
  ];

  function scrollPageToTop() {
    global.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function renderAndReset() {
    App.PlanPage.render(document.getElementById('app'));
    scrollPageToTop();
  }

  // ============================================================
  // 渐进取样步骤渲染
  // ============================================================

  /**
   * 渲染当前步骤
   * Step 1: mood / Step 2: interests / Step 3: days + budget
   */
  function renderStep(container) {
    var plan = state.plan;
    var step = plan.step;

    var page = el('div', { className: 'page' });
    page.appendChild(el('div', { className: 'page-kicker', textContent: 'NEW TRIP' }));
    page.appendChild(el('h1', { className: 'page__title', textContent: '这次，想怎么出发？' }));
    page.appendChild(el('p', { className: 'page__subtitle', textContent: '先看这一次的你，再把预算、时间和路线放进同一个判断里。' }));

    // 步骤指示器
    page.appendChild(renderStepIndicator(step));

    // 首次引导提示
    if (step === 1 && !global.localStorage.getItem('tp_hasSeenGuide')) {
      var guideCard = el('div', { className: 'card guide-card mb-md' }, [
        el('div', { className: 'guide-card__body' }, [
          el('div', { className: 'guide-card__title', textContent: '初次见面，三步即可' }),
          el('p', { className: 'guide-card__text', textContent: '先选心情 → 再选兴趣 → 最后填时间和预算。旅格会根据你的偏好生成三条不同风格的路线，不会一刀切。' })
        ]),
        el('button', {
          type: 'button',
          className: 'btn btn--text guide-card__close',
          textContent: '知道了',
          onClick: function () {
            global.localStorage.setItem('tp_hasSeenGuide', '1');
            guideCard.style.opacity = '0';
            guideCard.style.transform = 'translateY(-8px)';
            setTimeout(function () { guideCard.remove(); }, 240);
          }
        })
      ]);
      page.appendChild(guideCard);
    }

    // 根据步骤渲染不同内容
    if (step === 1) {
      page.appendChild(renderMoodStep());
    } else if (step === 2) {
      page.appendChild(renderInterestsStep());
    } else if (step === 3) {
      page.appendChild(renderContextStep());
    }

    container.innerHTML = '';
    container.appendChild(page);
  }

  /**
   * 渲染步骤指示器（三个圆点 + 连线）
   */
  function renderStepIndicator(currentStep) {
    var labels = ['这次取向', '体验偏好', '现实条件'];
    var indicator = el('div', { className: 'step-indicator', role: 'list', 'aria-label': '规划进度' });

    for (var i = 1; i <= 3; i++) {
      var dotClass = 'step-dot';
      if (i < currentStep) {
        dotClass += ' step-dot--done';
      } else if (i === currentStep) {
        dotClass += ' step-dot--active';
      }
      indicator.appendChild(el('div', { className: 'step-marker', role: 'listitem' }, [
        el('div', {
          className: dotClass,
          textContent: String(i),
          'aria-current': i === currentStep ? 'step' : null
        }),
        el('span', { className: 'step-label' + (i === currentStep ? ' step-label--active' : ''), textContent: labels[i - 1] })
      ]));

      if (i < 3) {
        var lineClass = 'step-line';
        if (i < currentStep) {
          lineClass += ' step-line--done';
        }
        indicator.appendChild(el('div', { className: lineClass }));
      }
    }

    return indicator;
  }

  // ============================================================
  // Step 1: 选择动机（mood）
  // ============================================================

  /**
   * 渲染动机选择步骤
   * 总纲5.1：这次想怎样度过
   */
  function renderMoodStep() {
    var section = el('section', { className: 'sampling-section', 'aria-labelledby': 'mood-title' });
    section.appendChild(el('div', { className: 'sampling-heading' }, [
      el('div', {}, [
        el('h2', { id: 'mood-title', className: 'sampling-title', textContent: '你现在更接近哪种状态？' }),
        el('p', { className: 'sampling-note', textContent: '这是本次旅行的取向，不会被写成永久标签。' })
      ]),
      el('span', { className: 'sampling-count', textContent: '选 1 项' })
    ]));

    var grid = el('div', { className: 'option-grid' });

    MOODS.forEach(function (mood) {
      var isSelected = state.plan.tripIntent.mood === mood.key;
      var card = el('button', {
        type: 'button',
        className: 'option-card' + (isSelected ? ' option-card--selected' : ''),
        dataset: { mood: mood.key },
        'aria-pressed': isSelected ? 'true' : 'false'
      }, [
        el('span', { className: 'option-card__icon-wrap' }, [icon(mood.icon, 'option-card__icon')]),
        el('span', { className: 'option-card__copy' }, [
          el('span', { className: 'option-card__label', textContent: mood.label }),
          el('span', { className: 'option-card__desc', textContent: mood.desc })
        ]),
        isSelected ? icon('check', 'option-card__check') : null
      ]);

      card.addEventListener('click', function () {
        state.plan.tripIntent.mood = mood.key;
        var container = card.closest('.option-grid') || card.parentElement;
        container.querySelectorAll('.option-card').forEach(function(c) {
          var isSelected = c.dataset.mood === mood.key;
          c.classList.toggle('option-card--selected', isSelected);
          c.setAttribute('aria-pressed', String(isSelected));
          var oldCheck = c.querySelector('.option-card__check');
          if (oldCheck) oldCheck.remove();
        });
        card.appendChild(icon('check', 'option-card__check'));
        var nextBtn = document.querySelector('.sampling-actions .btn--primary');
        if (nextBtn) nextBtn.disabled = false;
      });

      grid.appendChild(card);
    });

    section.appendChild(grid);
    section.appendChild(el('div', { className: 'sampling-actions' }, [
      el('button', {
        type: 'button',
        className: 'btn btn--primary btn--with-icon',
        disabled: state.plan.tripIntent.mood ? null : 'disabled',
        onClick: function () {
           if (!state.plan.tripIntent.mood) return;
           state.plan.step = 2;
           renderAndReset();
        }
      }, [
        el('span', { textContent: '继续' }),
        icon('arrow-right', 'btn__icon')
      ])
    ]));
    return section;
  }

  // ============================================================
  // Step 2: 选择兴趣（interests）
  // ============================================================

  /**
   * 渲染兴趣选择步骤
   * 可多选，至少选1个
   */
  function renderInterestsStep() {
    var section = el('section', { className: 'sampling-section', 'aria-labelledby': 'interest-title' });
    section.appendChild(el('div', { className: 'sampling-heading' }, [
      el('div', {}, [
        el('h2', { id: 'interest-title', className: 'sampling-title', textContent: '什么会让这趟旅行变得值得？' }),
        el('p', { className: 'sampling-note', textContent: '选你真的会停下来感受的，不必为了丰富而多选。' })
      ]),
      el('span', { className: 'sampling-count', textContent: '已选 ' + state.plan.tripIntent.interests.length + ' 项' })
    ]));

    var grid = el('div', { className: 'option-grid option-grid--compact' });

    INTERESTS.forEach(function (interest) {
      var isSelected = state.plan.tripIntent.interests.indexOf(interest.key) !== -1;
      var card = el('button', {
        type: 'button',
        className: 'option-card' + (isSelected ? ' option-card--selected' : ''),
        dataset: { interest: interest.key },
        'aria-pressed': isSelected ? 'true' : 'false'
      }, [
        icon(interest.icon, 'option-card__icon'),
        el('span', { className: 'option-card__label', textContent: interest.label }),
        isSelected ? icon('check', 'option-card__check') : null
      ]);

      card.addEventListener('click', function () {
        var idx = state.plan.tripIntent.interests.indexOf(interest.key);
        if (idx === -1) {
          state.plan.tripIntent.interests.push(interest.key);
        } else {
          state.plan.tripIntent.interests.splice(idx, 1);
        }
        var container = card.closest('.option-grid') || card.parentElement;
        container.querySelectorAll('.option-card').forEach(function(c) {
          var isSel = state.plan.tripIntent.interests.indexOf(c.dataset.interest) !== -1;
          c.classList.toggle('option-card--selected', isSel);
          c.setAttribute('aria-pressed', String(isSel));
          var oldCheck = c.querySelector('.option-card__check');
          if (oldCheck) oldCheck.remove();
          if (isSel) c.appendChild(icon('check', 'option-card__check'));
        });
        var countEl = document.querySelector('.sampling-heading .sampling-count');
        if (countEl) countEl.textContent = '已选 ' + state.plan.tripIntent.interests.length + ' 项';
        var nextBtn = document.querySelector('.sampling-actions .btn--primary');
        if (nextBtn) nextBtn.disabled = state.plan.tripIntent.interests.length === 0;
      });

      grid.appendChild(card);
    });

    section.appendChild(grid);

    section.appendChild(el('div', { className: 'sampling-subsection' }, [
      el('h3', { className: 'sampling-subtitle', textContent: '这次最不想遇到什么？' }),
      el('div', { className: 'chip-grid' }, AVOIDS.map(function (item) {
        var selected = state.plan.tripIntent.avoid.indexOf(item.key) !== -1;
        return el('button', {
          type: 'button',
          className: 'choice-chip' + (selected ? ' choice-chip--selected' : ''),
          'aria-pressed': selected ? 'true' : 'false',
          textContent: item.label,
          dataset: { avoid: item.key },
          onClick: function () {
            var idx = state.plan.tripIntent.avoid.indexOf(item.key);
            if (idx === -1) state.plan.tripIntent.avoid.push(item.key);
            else state.plan.tripIntent.avoid.splice(idx, 1);
            var chipGrid = this.closest('.chip-grid') || this.parentElement;
            chipGrid.querySelectorAll('.choice-chip').forEach(function(c) {
              var isSel = state.plan.tripIntent.avoid.indexOf(c.dataset.avoid) !== -1;
              c.classList.toggle('choice-chip--selected', isSel);
              c.setAttribute('aria-pressed', String(isSel));
            });
          }
        });
      }))
    ]));

    section.appendChild(el('div', { className: 'sampling-subsection' }, [
      el('h3', { className: 'sampling-subtitle', textContent: '和谁一起？' }),
      el('div', { className: 'segmented-control', role: 'group', 'aria-label': '同行关系' }, COMPANIONS.map(function (item) {
        var selected = state.plan.tripIntent.companion === item.key;
        return el('button', {
          type: 'button',
          className: 'segment' + (selected ? ' segment--selected' : ''),
          'aria-pressed': selected ? 'true' : 'false',
          textContent: item.label,
          dataset: { companion: item.key },
          onClick: function () {
            state.plan.tripIntent.companion = item.key;
            var group = this.closest('.segmented-control') || this.parentElement;
            group.querySelectorAll('.segment').forEach(function(c) {
              var isSel = c.dataset.companion === item.key;
              c.classList.toggle('segment--selected', isSel);
              c.setAttribute('aria-pressed', String(isSel));
            });
          }
        });
      }))
    ]));

    // 操作按钮
    var actions = el('div', { className: 'sampling-actions sampling-actions--split' }, [
      el('button', {
        type: 'button',
        className: 'btn btn--secondary btn--with-icon',
        onClick: function () {
           state.plan.step = 1;
           renderAndReset();
        }
      }, [icon('arrow-left', 'btn__icon'), el('span', { textContent: '上一步' })]),
      el('button', {
        type: 'button',
        className: 'btn btn--primary btn--with-icon',
        disabled: state.plan.tripIntent.interests.length === 0 ? 'disabled' : null,
        onClick: function () {
           if (state.plan.tripIntent.interests.length === 0) return;
           state.plan.step = 3;
           renderAndReset();
        }
      }, [el('span', { textContent: '现实条件' }), icon('arrow-right', 'btn__icon')])
    ]);
    section.appendChild(actions);

    return section;
  }

  // ============================================================
  // Step 3: 天数 + 预算
  // ============================================================

  /**
   * 渲染天数与预算输入步骤
   * 总纲5.1：大致天数与出发地
   * 总纲5.3：预算拆成舒适/上限/节省目标
   */
  function renderContextStep() {
    var ctx = state.plan.tripContext;
    var section = el('section', { className: 'sampling-section', 'aria-labelledby': 'context-title' });
    section.appendChild(el('div', { className: 'sampling-heading' }, [
      el('div', {}, [
        el('h2', { id: 'context-title', className: 'sampling-title', textContent: '把现实条件也算进去' }),
        el('p', { className: 'sampling-note', textContent: '人格最合适的选择会保留，同时给你现实平衡和更低成本的方向。' })
      ]),
      el('span', { className: 'sampling-count', textContent: '最后一步' })
    ]));

    var locationGrid = el('div', { className: 'field-grid' });
    locationGrid.appendChild(el('label', { className: 'field' }, [
      el('span', { className: 'field__label', textContent: '从哪里出发' }),
      el('span', { className: 'field__control field__control--icon' }, [
        icon('map-pinned', 'field__icon'),
        el('input', {
          type: 'text',
          value: ctx.origin || '',
          placeholder: '例如：上海',
          autocomplete: 'address-level2',
          onInput: function () { ctx.origin = this.value.trim(); state.plan.validationMessage = null; }
        })
      ])
    ]));
    locationGrid.appendChild(el('label', { className: 'field' }, [
      el('span', { className: 'field__label', textContent: '一定要到的地方（可选）' }),
      el('span', { className: 'field__control field__control--icon' }, [
        icon('route', 'field__icon'),
        el('input', {
          type: 'text',
          value: ctx.destination || '',
          placeholder: '留空就是开放推荐',
          onInput: function () { ctx.destination = this.value.trim(); }
        })
      ])
    ]));
    section.appendChild(locationGrid);

    section.appendChild(el('div', { className: 'sampling-subsection' }, [
      el('h3', { className: 'sampling-subtitle', textContent: '计划旅行几天？' })
    ]));
    var daysRow = el('div', { className: 'chip-grid mb-lg' });
    var dayOptions = [2, 3, 5, 7, 10, 14];
    dayOptions.forEach(function (d) {
      var isSelected = ctx.days === d;
      var tag = el('button', {
        type: 'button',
        className: 'choice-chip' + (isSelected ? ' choice-chip--selected' : ''),
        'aria-pressed': isSelected ? 'true' : 'false',
        textContent: d + ' 天',
        dataset: { days: String(d) },
        onClick: function () {
          ctx.days = d;
          state.plan.validationMessage = null;
          var chipGrid = this.closest('.chip-grid') || this.parentElement;
          chipGrid.querySelectorAll('.choice-chip').forEach(function(c) {
            var isSel = c.dataset.days === String(d);
            c.classList.toggle('choice-chip--selected', isSel);
            c.setAttribute('aria-pressed', String(isSel));
          });
        }
      });
      daysRow.appendChild(tag);
    });
    section.appendChild(daysRow);

    var timingGrid = el('div', { className: 'field-grid' }, [
      el('label', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: '自定义天数' }),
        el('span', { className: 'field__control' }, [
          el('input', {
            type: 'number', min: '1', max: '60', placeholder: '1 - 60',
            value: ctx.days && dayOptions.indexOf(ctx.days) === -1 ? String(ctx.days) : '',
            onInput: function () {
              var value = parseInt(this.value, 10);
              if (value >= 1 && value <= 60) ctx.days = value;
            }
          })
        ])
      ]),
      el('label', { className: 'field' }, [
        el('span', { className: 'field__label', textContent: '大概什么时候出发（可选）' }),
        el('span', { className: 'field__control field__control--icon' }, [
          icon('calendar-days', 'field__icon'),
          el('input', {
            type: 'date', value: (ctx.dates && ctx.dates.start) || '',
            onInput: function () { ctx.dates = { start: this.value }; }
          })
        ])
      ])
    ]);
    section.appendChild(timingGrid);

    section.appendChild(renderTravelStylePicker(ctx));

    section.appendChild(el('div', { className: 'sampling-subsection' }, [
      el('h3', { className: 'sampling-subtitle', textContent: '这趟旅行的总预算' }),
      el('p', { className: 'sampling-note', textContent: '舒适预算用于体验基线；最高上限会淘汰明显超支方案，区间跨线时会明确提示。' })
    ]));
    section.appendChild(el('div', { className: 'budget-grid' }, [
      renderMoneyField('舒服地玩，大约', '例如 2500', ctx.budget.comfort, function (value) { ctx.budget.comfort = value; }),
      renderMoneyField('最多不超过', '例如 3500', ctx.budget.hardMax, function (value) { ctx.budget.hardMax = value; }),
      renderMoneyField('希望再省下（可选）', '例如 400', ctx.budget.saveTarget, function (value) { ctx.budget.saveTarget = value; })
    ]));

    section.appendChild(el('label', { className: 'field field--wide sampling-subsection' }, [
      el('span', { className: 'field__label', textContent: '还有什么只有你自己知道？（可选）' }),
      el('textarea', {
        rows: '3',
        placeholder: '例如：最近很累，但不想完全躺平；想看展、喝好咖啡，也不想一直排队。',
        onInput: function () { state.plan.tripIntent.freeText = this.value; },
        textContent: state.plan.tripIntent.freeText || ''
      })
    ]));

    if (state.plan.validationMessage) {
      section.appendChild(el('div', { className: 'inline-error', role: 'alert', textContent: state.plan.validationMessage }));
    }

    var actions = el('div', { className: 'sampling-actions sampling-actions--split' }, [
      el('button', {
        type: 'button',
        className: 'btn btn--secondary btn--with-icon',
        onClick: function () {
           state.plan.step = 2;
           renderAndReset();
        }
      }, [icon('arrow-left', 'btn__icon'), el('span', { textContent: '上一步' })]),
      el('button', {
        type: 'button',
        className: 'btn btn--primary btn--with-icon',
        onClick: function () {
          var validation = validateContext(ctx);
          if (validation) {
            state.plan.validationMessage = validation;
            App.PlanPage.render(document.getElementById('app'));
            return;
          }
          state.plan.validationMessage = null;
          App.PlanPage.submitPlan();
        }
      }, [el('span', { textContent: '看看三种可能' }), icon('sparkles', 'btn__icon')])
    ]);
    section.appendChild(actions);

    return section;
  }

  function renderTravelStylePicker(ctx) {
    var current = ctx.travelStyle || 'balanced';
    var grid = el('div', { className: 'sampling-subsection' }, [
      el('h3', { className: 'sampling-subtitle', textContent: '这趟旅行想把钱花在哪里？' }),
      el('p', { className: 'sampling-note', textContent: '它会同时调整住宿、餐饮和体验的建议档位；预算上限始终优先。' })
    ]);
    var choices = el('div', { className: 'travel-style-grid', role: 'radiogroup', 'aria-label': '旅行风格' });
    TRAVEL_STYLES.forEach(function (style) {
      var selected = current === style.key;
      choices.appendChild(el('button', {
        type: 'button',
        className: 'travel-style-option' + (selected ? ' travel-style-option--selected' : ''),
        role: 'radio',
        'aria-checked': selected ? 'true' : 'false',
        dataset: { travelStyle: style.key },
        onClick: function () {
          ctx.travelStyle = style.key;
          choices.querySelectorAll('.travel-style-option').forEach(function (item) {
            var isSelected = item.dataset.travelStyle === style.key;
            item.classList.toggle('travel-style-option--selected', isSelected);
            item.setAttribute('aria-checked', String(isSelected));
          });
        }
      }, [
        el('strong', { textContent: style.label }),
        el('span', { textContent: style.desc })
      ]));
    });
    grid.appendChild(choices);
    return grid;
  }

  function renderMoneyField(label, placeholder, value, onChange) {
    return el('label', { className: 'field' }, [
      el('span', { className: 'field__label', textContent: label }),
      el('span', { className: 'field__control field__control--money' }, [
        el('span', { className: 'field__prefix', textContent: '¥' }),
        el('input', {
          type: 'number', min: '0', step: '100', placeholder: placeholder,
          value: value != null ? String(value) : '',
          onInput: function () { onChange(parseInt(this.value, 10) || null); }
        })
      ])
    ]);
  }

  function validateContext(ctx) {
    if (!ctx.origin || ctx.origin.length < 2) return '先告诉我从哪里出发，路线效率才不会凭空猜。';
    if (!ctx.days || ctx.days < 1 || ctx.days > 60) return '请选择 1 到 60 天的旅行时长。';
    if (ctx.budget.comfort && ctx.budget.hardMax && ctx.budget.comfort > ctx.budget.hardMax) {
      return '舒适预算不能高于最高上限，可以把上限再放宽一点。';
    }
    return '';
  }

  // ============================================================
  // 注册到 App 命名空间
  // ============================================================

  App.PlanForm = {
    renderStep: renderStep,
    renderStepIndicator: renderStepIndicator,
    renderMoodStep: renderMoodStep,
    renderInterestsStep: renderInterestsStep,
    renderContextStep: renderContextStep,
    renderTravelStylePicker: renderTravelStylePicker,
    renderMoneyField: renderMoneyField,
    validateContext: validateContext,
    scrollPageToTop: scrollPageToTop,
    renderAndReset: renderAndReset
  };

})(typeof window !== 'undefined' ? window : this);
