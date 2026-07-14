/**
 * 旅格 Travel Persona · Phase 3 测试（用户应用与视觉系统）
 *
 * 测试范围：
 * 1. index.html 存在且包含 #app 挂载点
 * 2. styles.css 包含设计令牌变量（颜色、字体、间距、圆角、阴影、断点）
 * 3. app.js 包含路由定义（#/plan, #/trips, #/journal, #/profile）
 * 4. app.js 包含 API 调用封装（apiCall）
 * 5. app.js 包含 16 种人格视觉数据
 * 6. styles.css 包含响应式断点定义
 * 7. plan.js 包含冷启动渐进取样逻辑
 * 8. 底部导航栏包含四个一级入口
 *
 * 运行方式：node test/phase3-test.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// ============================================================
// 测试框架
// ============================================================

let passed = 0;
let failed = 0;

/**
 * 同步测试包装器
 */
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (e) {
    failed++;
    console.log(`  \u2717 FAIL: ${name}`);
    console.log(`    ${e.message}`);
  }
}

// ============================================================
// 文件路径常量
// ============================================================

const PUBLIC_APP_DIR = path.join(__dirname, '..', 'public-app');
const INDEX_HTML = path.join(PUBLIC_APP_DIR, 'index.html');
const STYLES_CSS = path.join(PUBLIC_APP_DIR, 'styles.css');
const APP_JS = path.join(PUBLIC_APP_DIR, 'app.js');
const PLAN_JS = path.join(PUBLIC_APP_DIR, 'pages', 'plan.js');

// ============================================================
// 主测试流程（async IIFE 包裹）
// ============================================================

(async () => {
  console.log('\n=== Phase 3 测试：用户应用与视觉系统 ===\n');

  // ==========================================================
  // 1. index.html 存在且结构正确
  // ==========================================================
  console.log('1. index.html 入口页面');

  test('index.html 文件存在', () => {
    assert.ok(fs.existsSync(INDEX_HTML), 'index.html 应存在于 public-app/ 目录');
  });

  test('index.html 包含 #app 挂载点', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(html.includes('id="app"'), '应包含 <div id="app"> 挂载点');
  });

  test('index.html 加载 styles.css', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(html.includes('styles.css'), '应引用 styles.css');
  });

  test('index.html 加载 app.js', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(html.includes('app.js'), '应引用 app.js');
  });

  test('index.html 在 app.js 前加载行程对账策略', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(html.includes('tripSync.js'), '应加载行程对账策略');
    assert.ok(html.indexOf('src="tripSync.js') < html.indexOf('src="app.js'), '行程对账策略必须先于 app.js');
  });

  test('index.html 在 plan.js 前加载路径选择策略', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(html.includes('pathSelection.js'), '应加载路径选择策略');
    assert.ok(html.indexOf('pathSelection.js') < html.indexOf('pages/plan.js'), '路径选择策略必须先于 plan.js');
  });

  test('index.html 包含 viewport meta 标签', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(
      html.includes('name="viewport"') && html.includes('width=device-width'),
      '应包含响应式 viewport meta 标签'
    );
  });

  test('index.html 标题为"旅格 Travel Persona"', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(
      html.includes('<title>旅格 Travel Persona</title>'),
      '标题应为"旅格 Travel Persona"'
    );
  });

  test('index.html 包含底部导航栏四个入口', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(html.includes('规划'), '导航应包含"规划"');
    assert.ok(html.includes('行程'), '导航应包含"行程"');
    assert.ok(html.includes('手账'), '导航应包含"手账"');
    assert.ok(html.includes('我的'), '导航应包含"我的"');
  });

  test('index.html 底部导航包含 data-route 属性', () => {
    const html = fs.readFileSync(INDEX_HTML, 'utf-8');
    assert.ok(html.includes('data-route="plan"'), '应包含 data-route="plan"');
    assert.ok(html.includes('data-route="trips"'), '应包含 data-route="trips"');
    assert.ok(html.includes('data-route="journal"'), '应包含 data-route="journal"');
    assert.ok(html.includes('data-route="profile"'), '应包含 data-route="profile"');
  });

  // ==========================================================
  // 2. styles.css 设计令牌
  // ==========================================================
  console.log('\n2. styles.css 设计令牌');

  test('styles.css 文件存在', () => {
    assert.ok(fs.existsSync(STYLES_CSS), 'styles.css 应存在于 public-app/ 目录');
  });

  test('styles.css 包含颜色设计令牌', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('--color-primary'), '应定义 --color-primary');
    assert.ok(css.includes('#2D6A4F'), '--color-primary 应为 #2D6A4F 山野绿');
    assert.ok(css.includes('--color-bg'), '应定义 --color-bg');
    assert.ok(css.includes('#FAFAF7'), '--color-bg 应为 #FAFAF7');
    assert.ok(css.includes('--color-text'), '应定义 --color-text');
    assert.ok(css.includes('#1A1A2E'), '--color-text 应为 #1A1A2E');
    assert.ok(css.includes('--color-muted'), '应定义 --color-muted');
    assert.ok(css.includes('#6C757D'), '--color-muted 应为 #6C757D');
    assert.ok(css.includes('--color-accent'), '应定义 --color-accent');
    assert.ok(css.includes('#E76F51'), '--color-accent 应为 #E76F51');
    assert.ok(css.includes('--color-card'), '应定义 --color-card');
    assert.ok(css.includes('#FFFFFF'), '--color-card 应为 #FFFFFF');
  });

  test('styles.css 包含字体设计令牌', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('--font-sans'), '应定义 --font-sans');
    assert.ok(css.includes('Noto Sans SC'), '--font-sans 应包含 Noto Sans SC');
    assert.ok(css.includes('system-ui'), '--font-sans 应包含 system-ui');
    assert.ok(css.includes('--font-mono'), '应定义 --font-mono');
  });

  test('styles.css 包含间距设计令牌', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('--space-xs'), '应定义 --space-xs');
    assert.ok(css.includes('--space-sm'), '应定义 --space-sm');
    assert.ok(css.includes('--space-md'), '应定义 --space-md');
    assert.ok(css.includes('--space-lg'), '应定义 --space-lg');
    assert.ok(css.includes('--space-xl'), '应定义 --space-xl');
  });

  test('styles.css 包含圆角设计令牌', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('--radius-sm'), '应定义 --radius-sm');
    assert.ok(css.includes('--radius-md'), '应定义 --radius-md');
    assert.ok(css.includes('--radius-lg'), '应定义 --radius-lg');
  });

  test('styles.css 包含阴影设计令牌', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('--shadow-sm'), '应定义 --shadow-sm');
    assert.ok(css.includes('--shadow-md'), '应定义 --shadow-md');
  });

  test('styles.css 包含响应式断点设计令牌', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('--bp-mobile'), '应定义 --bp-mobile');
    assert.ok(css.includes('360px'), '--bp-mobile 应为 360px');
    assert.ok(css.includes('--bp-tablet'), '应定义 --bp-tablet');
    assert.ok(css.includes('768px'), '--bp-tablet 应为 768px');
    assert.ok(css.includes('--bp-desktop'), '应定义 --bp-desktop');
    assert.ok(css.includes('1200px'), '--bp-desktop 应为 1200px');
  });

  test('styles.css 包含全局重置', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('box-sizing'), '应包含 box-sizing 重置');
    assert.ok(css.includes('margin: 0'), '应包含 margin 重置');
  });

  test('styles.css 包含 App Shell 布局', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('#app'), '应包含 #app 样式');
    assert.ok(css.includes('.bottom-nav'), '应包含 .bottom-nav 样式');
    assert.ok(css.includes('.page'), '应包含 .page 样式');
  });

  test('styles.css 包含卡片组件', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('.card'), '应包含 .card 组件');
    assert.ok(css.includes('.card__header'), '应包含 .card__header');
    assert.ok(css.includes('.card__title'), '应包含 .card__title');
    assert.ok(css.includes('.card__body'), '应包含 .card__body');
    assert.ok(css.includes('.card__footer'), '应包含 .card__footer');
  });

  test('styles.css 包含按钮组件', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('.btn'), '应包含 .btn 组件');
    assert.ok(css.includes('.btn--primary'), '应包含 .btn--primary');
    assert.ok(css.includes('.btn--secondary'), '应包含 .btn--secondary');
  });

  test('styles.css 包含标签组件', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('.tag'), '应包含 .tag 组件');
    assert.ok(css.includes('--radius-pill') || css.includes('9999px'), '标签应使用胶囊圆角');
  });

  test('styles.css 包含空状态样式', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('.empty-state'), '应包含 .empty-state 空状态');
    assert.ok(css.includes('.empty-state__title'), '应包含 .empty-state__title');
    assert.ok(css.includes('.empty-state__description'), '应包含 .empty-state__description');
  });

  test('styles.css 包含加载状态样式', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('.loading-state'), '应包含 .loading-state 加载状态');
    assert.ok(css.includes('.loading-spinner'), '应包含 .loading-spinner');
    assert.ok(css.includes('@keyframes spin'), '应包含 spin 动画');
  });

  test('styles.css 包含错误状态样式', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('.error-state'), '应包含 .error-state 错误状态');
    assert.ok(css.includes('.error-state__title'), '应包含 .error-state__title');
  });

  test('styles.css 包含 16 种人格视觉渐变', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    const personaIds = [
      'quiet-restore', 'city-spark', 'aesthetic-collector', 'slow-nomad',
      'heritage-drifter', 'efficient-hunter', 'wild-calibrator', 'ritual-archivist',
      'taste-cartographer', 'night-flaneur', 'social-orbit', 'comfort-navigator',
      'edge-explorer', 'micro-escape', 'family-anchor', 'workation-weaver'
    ];
    personaIds.forEach(function (id) {
      assert.ok(
        css.includes('persona-visual--' + id),
        '应包含人格视觉样式 persona-visual--' + id
      );
    });
  });

  test('styles.css 包含响应式 media query', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(css.includes('@media'), '应包含 @media 响应式查询');
    assert.ok(css.includes('min-width: 768px'), '应包含平板断点 768px');
    assert.ok(css.includes('min-width: 1200px'), '应包含桌面断点 1200px');
  });

  test('styles.css 包含 prefers-reduced-motion 支持', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(
      css.includes('prefers-reduced-motion'),
      '应支持 prefers-reduced-motion（总纲14.9）'
    );
  });

  test('styles.css 防止横向溢出', () => {
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(
      css.includes('overflow-x: hidden'),
      '应包含 overflow-x: hidden 防止横向溢出'
    );
  });

  // ==========================================================
  // 3. app.js 路由和 API 封装
  // ==========================================================
  console.log('\n3. app.js 路由与 API 封装');

  test('app.js 文件存在', () => {
    assert.ok(fs.existsSync(APP_JS), 'app.js 应存在于 public-app/ 目录');
  });

  test('app.js 包含路由定义 #/plan', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('#/plan'), '应定义 #/plan 路由');
  });

  test('app.js 包含路由定义 #/trips', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('#/trips'), '应定义 #/trips 路由');
  });

  test('app.js 包含路由定义 #/journal', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('#/journal'), '应定义 #/journal 路由');
  });

  test('app.js 包含路由定义 #/profile', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('#/profile'), '应定义 #/profile 路由');
  });

  test('app.js 包含 ROUTES 路由表', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('ROUTES'), '应定义 ROUTES 路由表');
    assert.ok(js.includes("'/plan'") || js.includes("'plan'"), '路由表应包含 plan');
  });

  test('app.js 包含 apiCall 函数封装', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('apiCall'), '应包含 apiCall 函数');
    assert.ok(js.includes('function apiCall') || js.includes('async function apiCall'), '应定义 apiCall 函数');
  });

  test('app.js 的 apiCall 使用 fetch', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('fetch('), 'apiCall 应使用 fetch API');
  });

  test('app.js 的 apiCall 使用 /api/v1 版本化路径', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('/api/v1'), '应使用 /api/v1 版本化路径（总纲13.6）');
  });

  test('app.js 包含全局状态管理对象', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('var state'), '应定义全局 state 对象');
    assert.ok(js.includes('tripIntent'), 'state 应包含 tripIntent');
    assert.ok(js.includes('tripContext'), 'state 应包含 tripContext');
  });

  test('app.js 包含隐私安全的旅格成长时间线', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('/journals/persona/timeline'), '应读取成长时间线');
    assert.ok(js.includes('旅格是怎么长出来的'), '应呈现成长过程');
    assert.ok(js.includes('手账原文不会出现在这里'), '应明确原文不进入时间线');
  });

  test('本次人格信号使用有方向的语言而非伪精确百分比', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(js.includes("mean >= 0.6 ? scale[1]") && js.includes("mean <= 0.4 ? scale[0]"), '临时信号应说明更靠近维度哪一端');
    assert.ok(js.includes("isProvisional ? directionLabel"), '只有已稳定维度才显示精确位置');
    assert.ok(css.includes('.trait-item--directional .trait-item__value'), '方向文案应有稳定的移动端空间');
  });

  test('长期倾向展示位置、证据数量和把握度', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('已确认的长期倾向'));
    assert.ok(js.includes('当前位置 '));
    assert.ok(js.includes("' 条有效证据'"));
    assert.ok(js.includes('来源证据已撤回'));
    assert.ok(js.includes("'把握 '"));
  });

  test('app.js 展示人格提案的支持、反例和可能范围', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('支持证据'));
    assert.ok(js.includes('反例证据'));
    assert.ok(js.includes('变化后可能范围'));
  });

  test('app.js 包含 16 种人格数据', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('PERSONAS'), '应定义 PERSONAS 数组');
    assert.ok(js.includes('quiet-restore'), '应包含 quiet-restore 人格');
    assert.ok(js.includes('workation-weaver'), '应包含 workation-weaver 人格');
  });

  test('app.js 包含 6 种动机数据', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('MOODS'), '应定义 MOODS 数组');
    assert.ok(js.includes('restore'), '应包含 restore 动机');
    assert.ok(js.includes('escape'), '应包含 escape 动机');
    assert.ok(js.includes('inspire'), '应包含 inspire 动机');
    assert.ok(js.includes('social'), '应包含 social 动机');
    assert.ok(js.includes('efficient'), '应包含 efficient 动机');
    assert.ok(js.includes('live'), '应包含 live 动机');
  });

  test('app.js 包含三条决策路径类型', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('personaBest'), '应包含 personaBest 路径类型');
    assert.ok(js.includes('balanced'), '应包含 balanced 路径类型');
    assert.ok(js.includes('lowCost'), '应包含 lowCost 路径类型');
  });

  test('app.js 包含页面渲染函数', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('renderTrips'), '应包含 renderTrips 渲染函数');
    assert.ok(js.includes('renderJournal'), '应包含 renderJournal 渲染函数');
    assert.ok(js.includes('renderProfile'), '应包含 renderProfile 渲染函数');
  });

  test('手账关联行程选项能区分同名计划', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(js.includes('function formatJournalTripOption(trip)'), '应集中生成可区分的行程选项文案');
    assert.ok(js.includes("trip.startDate || '日期待定'"), '选项应包含出发日期或明确待定');
    assert.ok(js.includes('getTripStatusLabel(trip.status)'), '选项应包含行程状态');
    assert.ok(js.includes("' · 仅此设备'"), '本机计划应在选项中明确标记');
    assert.ok(js.includes("className: 'journal-card__trip'"), '已关联的手账卡片应显示证据来源行程');
    assert.ok(css.includes('.journal-card__trip'), '关联行程应有稳定的移动端布局');
  });

  test('行程改动同步后立即消除等待状态', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('state.selectedTripId === trip.id') && js.includes("global.location.hash === '#/trips'"), '同步完成后应刷新当前行程详情');
    assert.ok(js.includes("'写一条行前手账'") && js.includes("'记录旅途感受'"), '手账入口应随行程阶段说明当前记录目的');
  });

  test('无日期行程必须先安排出发日才能进入实况', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('function updateTripSchedule'));
    assert.ok(js.includes('先安排出发日期'));
    assert.ok(js.includes("allowed: false, label: '先安排出发日'"));
  });

  test('app.js 包含空状态渲染函数', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('renderEmptyState'), '应包含 renderEmptyState 空状态渲染');
  });

  test('app.js 包含加载状态渲染函数', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('renderLoadingState'), '应包含 renderLoadingState 加载状态渲染');
  });

  test('app.js 包含错误状态渲染函数', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('renderErrorState'), '应包含 renderErrorState 错误状态渲染');
  });

  test('app.js 包含 hash 路由器', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('hashchange'), '应监听 hashchange 事件');
    assert.ok(js.includes('handleRoute'), '应包含 handleRoute 路由处理函数');
  });

  test('app.js 包含初始化函数', () => {
    const js = fs.readFileSync(APP_JS, 'utf-8');
    assert.ok(js.includes('function init'), '应包含 init 初始化函数');
    assert.ok(js.includes('localStorage'), '应使用 localStorage 持久化状态');
  });

  // ==========================================================
  // 4. plan.js 冷启动渐进取样
  // ==========================================================
  console.log('\n4. plan.js 冷启动渐进取样');

  test('plan.js 文件存在', () => {
    assert.ok(fs.existsSync(PLAN_JS), 'plan.js 应存在于 public-app/pages/ 目录');
  });

  test('plan.js 包含三步渐进取样逻辑', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes('renderMoodStep'), '应包含 renderMoodStep 第一步（mood）');
    assert.ok(js.includes('renderInterestsStep'), '应包含 renderInterestsStep 第二步（interests）');
    assert.ok(js.includes('renderContextStep'), '应包含 renderContextStep 第三步（days+budget）');
  });

  test('plan.js 调用 POST /api/v1/plans', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes("apiCall('POST'") || js.includes('apiCall("POST"'), '应调用 apiCall 发送 POST 请求');
    assert.ok(js.includes("'/plans'") || js.includes('"/plans"'), '应请求 /plans 路径');
  });

  test('plan.js 在本地结果后静默请求 Agent 解释增强', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes("apiCall('POST', '/agent/enhance-explanation'"), '应请求 Agent 解释增强');
    assert.ok(js.includes('agentApplied'), '应仅在 Agent 实际生效时更新结果');
  });

  test('plan.js 在本地结果后静默请求地图事实核验', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes("apiCall('POST', '/map/enrich-plan'"), '应请求地图事实核验');
    assert.ok(js.includes('mapFreshness'), '应按地图新鲜度更新结果');
  });

  test('plan.js 展示跨城耗时、票价与静态数据把握', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes('routeAssessment'), '应读取路线事实评估');
    assert.ok(js.includes('跨城约'), '应展示跨城耗时区间');
    assert.ok(js.includes('交通票价'), '应展示交通票价区间');
    assert.ok(js.includes('静态数据把握'), '应展示静态路线数据把握');
    assert.ok(js.includes('departureDate'), '应把真实出发日期传给地图核验');
    assert.ok(js.includes('transitFreshness'), '应处理跨城交通实时核验状态');
    assert.ok(js.includes('baidu-live'), '应区分百度出发日数据与静态基线');
  });

  test('plan.js 在地图容器稳定后重新适配路线范围', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes('requestAnimationFrame'), '地图应等待下一帧尺寸稳定');
    assert.ok(js.includes('map.invalidateSize();') && js.includes('map.fitBounds(latLngs'), '尺寸刷新后应重新适配路线范围');
    assert.ok(js.indexOf('map.invalidateSize();') < js.indexOf('map.fitBounds(latLngs'), '必须先刷新尺寸，再计算路线范围');
    assert.ok(js.includes('latitudeSpan <= 28') && js.includes('longitudeSpan <= 42') && js.includes('map.setZoom(4)'), '国内长线不应被缩到接近世界地图');
    assert.ok(js.includes('renderDecisionBrief') && js.includes('“长途换乘”已作为降权项'), '结果页应解释用户避雷条件与多城目标之间的取舍');
    assert.ok(js.includes("alt: '路线节点：' + point.name"), '地图节点应向辅助技术读出真实城市名');
    assert.ok(js.includes('result.decisionContext = {') && js.includes('avoid: (requestBody.tripIntent.avoid || []).slice()'), '已保存方案应保留可解释的结构化规划条件');
    assert.ok(!/decisionContext\s*=\s*\{[\s\S]{0,500}freeText/.test(js), '持久化决策上下文不得包含自由文本原文');
    assert.ok(js.includes("addEventListener('resize', activePlanMapResizeHandler"), '窗口尺寸变化后应重新适配地图');
    assert.ok(js.includes("removeEventListener('resize', activePlanMapResizeHandler"), '页面重绘时应清理旧地图监听');
    assert.ok(js.includes('new global.ResizeObserver(activePlanMapResizeHandler)'), '父容器尺寸变化也应重新适配地图');
    assert.ok(js.includes('activePlanMapResizeObserver.disconnect()'), '页面重绘时应清理旧尺寸观察器');
  });

  test('plan.js 在手机地图下方展示所选方案的完整城市顺序', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    const css = fs.readFileSync(STYLES_CSS, 'utf-8');
    assert.ok(js.includes("routeSequence.join(' → ')"), '地图下方应展示完整路线顺序');
    assert.ok(js.includes("'aria-label': '当前路线城市顺序'"), '路线顺序应有明确的无障碍名称');
    assert.ok(css.includes('.route-map-sequence'), '路线顺序应使用稳定的响应式布局');
  });

  test('plan.js 在行程保存完成后刷新同步状态', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes('.then(finishTripSave)'), '保存成功后应解除锁定并刷新行程列表');
    assert.ok(js.includes("window.location.hash === '#/trips' && !state.selectedTripId"), '刷新不能打断用户已经打开的行程详情');
    assert.ok(js.includes('.catch(showTripSaveFallback)'), '保存失败时应保留本地方案并刷新失败状态');
    assert.ok(js.includes('if (state.plan.saveBusy) return;'), '保存期间应阻止重复创建行程');
    assert.ok(js.includes("state.plan.saveBusy ? '保存中' : '保存所选方案'"), '保存按钮应显示进行中状态');
    assert.ok(js.includes('state.plan.saveBusy = false;'), '保存完成或失败后应解除按钮锁定');
  });

  test('plan.js 包含决策路径卡片渲染', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes('renderPathCard'), '应包含 renderPathCard 决策路径卡片渲染');
    assert.ok(js.includes('personaBest'), '应处理 personaBest 路径');
    assert.ok(js.includes('balanced'), '应处理 balanced 路径');
    assert.ok(js.includes('lowCost'), '应处理 lowCost 路径');
  });

  test('plan.js 包含反事实解释展示', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes('counterfactual'), '应包含 counterfactual 反事实解释（总纲6.3）');
  });

  test('plan.js 包含步骤指示器', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes('renderStepIndicator'), '应包含步骤指示器渲染');
    assert.ok(js.includes('step-indicator') || js.includes('step-dot'), '应使用步骤指示器样式');
    assert.ok(js.includes('这次取向') && js.includes('体验偏好') && js.includes('现实条件'), '步骤指示器应说明每一步的含义');
    assert.ok(js.includes('scrollPageToTop'), '步骤和结果切换后应回到页面顶部');
  });

  test('plan.js 包含预算弹性输入（总纲5.3）', () => {
    const js = fs.readFileSync(PLAN_JS, 'utf-8');
    assert.ok(js.includes('comfort'), '应包含舒适预算输入');
    assert.ok(js.includes('hardMax'), '应包含可接受上限输入');
    assert.ok(js.includes('saveTarget'), '应包含节省目标输入');
    assert.ok(js.includes('route-budget-callout'), '预算区间跨过最高上限时应显示风险提示');
  });

  // ==========================================================
  // 测试结果汇总
  // ==========================================================
  console.log('\n=== Phase 3 测试结果 ===');
  console.log(`  通过: ${passed}`);
  console.log(`  失败: ${failed}`);
  console.log(`  总计: ${passed + failed}`);

  if (failed > 0) {
    console.log('\n  存在失败的测试用例，请检查上述输出。');
    process.exit(1);
  } else {
    console.log('\n  全部通过。');
  }

})().catch(function (err) {
  console.error('\n测试执行出错:', err);
  process.exit(1);
});
