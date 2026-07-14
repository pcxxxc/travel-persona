(function() {
  var style = getComputedStyle(document.documentElement);
  var accent = style.getPropertyValue('--accent').trim();
  var accent2 = style.getPropertyValue('--accent2').trim();
  var ink = style.getPropertyValue('--ink').trim();
  var muted = style.getPropertyValue('--muted').trim();
  var rule = style.getPropertyValue('--rule').trim();
  var bg2 = style.getPropertyValue('--bg2').trim();

  // --- Chart: Phase Progress (Horizontal Stacked Bar) ---
  var chartProgress = echarts.init(document.getElementById('chart-progress'), null, { renderer: 'svg' });

  var phases = ['Week 1\n数据/算法/服务', 'Week 2\nAI 集成', 'Week 3\n前端+行程', 'Week 4\n体验打磨', 'Week 5\nAI 质量攻坚', 'Week 6\n前端体验', 'Week 7\n测试安全', 'Week 8\n交付打磨'];
  var doneData =    [100, 50, 80, 0, 0, 0, 0, 0];
  var partialData = [0,   33, 10, 0, 0, 0, 0, 0];
  var todoData =    [0,   17, 10, 100, 100, 100, 100, 100];

  chartProgress.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      appendToBody: true,
      formatter: function(params) {
        var total = 0;
        var lines = params.map(function(p) {
          total += p.value;
          return p.marker + ' ' + p.seriesName + ': ' + p.value + '%';
        });
        lines.unshift('<b>' + params[0].name.replace('\n', ' ') + '</b>');
        lines.push('总计: ' + total + '%');
        return lines.join('<br/>');
      }
    },
    legend: {
      data: ['已完成', '部分完成', '未开始'],
      bottom: 0,
      textStyle: { color: muted, fontSize: 12 }
    },
    grid: {
      left: 160,
      right: 40,
      top: 20,
      bottom: 40
    },
    xAxis: {
      type: 'value',
      max: 100,
      axisLabel: {
        formatter: '{value}%',
        color: muted,
        fontSize: 11
      },
      splitLine: { lineStyle: { color: rule } },
      axisLine: { lineStyle: { color: rule } }
    },
    yAxis: {
      type: 'category',
      data: phases,
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false },
      axisLabel: {
        color: ink,
        fontSize: 11,
        lineHeight: 16
      }
    },
    series: [
      {
        name: '已完成',
        type: 'bar',
        stack: 'progress',
        data: doneData,
        itemStyle: { color: accent2 },
        barWidth: 18,
        label: {
          show: true,
          position: 'inside',
          formatter: function(p) { return p.value > 15 ? p.value + '%' : ''; },
          color: '#fff',
          fontSize: 10
        }
      },
      {
        name: '部分完成',
        type: 'bar',
        stack: 'progress',
        data: partialData,
        itemStyle: { color: '#e6a23c' },
        barWidth: 18,
        label: {
          show: true,
          position: 'inside',
          formatter: function(p) { return p.value > 15 ? p.value + '%' : ''; },
          color: '#fff',
          fontSize: 10
        }
      },
      {
        name: '未开始',
        type: 'bar',
        stack: 'progress',
        data: todoData,
        itemStyle: { color: bg2 },
        barWidth: 18,
        label: {
          show: true,
          position: 'inside',
          formatter: function(p) { return p.value > 15 ? p.value + '%' : ''; },
          color: muted,
          fontSize: 10
        }
      }
    ]
  });

  window.addEventListener('resize', function() { chartProgress.resize(); });

  // --- Chart: Gantt Timeline ---
  var chartGantt = echarts.init(document.getElementById('chart-gantt'), null, { renderer: 'svg' });

  // Week dates: W1=05-26..06-01, W2=06-02..06-08, W3=06-09..06-15, W4=06-16..06-22
  // W5=06-23..06-29, W6=06-30..07-06, W7=07-07..07-13, W8=07-14..07-20
  // Convert to day offsets from Jun 1 (day 0 = Jun 1)
  // W1: -6..0, W2: 1..7, W3: 8..14, W4: 15..21, W5: 22..28, W6: 29..35, W7: 36..42, W8: 43..49

  var tasks = [
    { name: '数据/算法/服务层', start: -6, end: 0, status: 'done' },
    { name: 'AI 集成层', start: 1, end: 14, status: 'partial' },
    { name: '前端 + 行程规划', start: 8, end: 21, status: 'partial' },
    { name: '体验打磨（原 W4）', start: 15, end: 21, status: 'todo' },
    { name: 'AI 质量攻坚', start: 22, end: 28, status: 'todo' },
    { name: '前端体验周', start: 29, end: 35, status: 'todo' },
    { name: '测试与安全周', start: 36, end: 42, status: 'todo' },
    { name: '交付打磨周', start: 43, end: 49, status: 'todo' }
  ];

  var statusColor = {
    done: accent2,
    partial: '#e6a23c',
    todo: rule
  };

  var ganttData = tasks.map(function(t) {
    return {
      name: t.name,
      value: [t.start, t.end, t.end - t.start],
      itemStyle: { color: statusColor[t.status] }
    };
  });

  // Week markers
  var weekLines = [
    { xAxis: -6, label: 'W1' },
    { xAxis: 1, label: 'W2' },
    { xAxis: 8, label: 'W3' },
    { xAxis: 15, label: 'W4' },
    { xAxis: 22, label: 'W5' },
    { xAxis: 29, label: 'W6' },
    { xAxis: 36, label: 'W7' },
    { xAxis: 43, label: 'W8' }
  ];

  var markLines = weekLines.map(function(w) {
    return {
      xAxis: w.xAxis,
      label: {
        formatter: w.label,
        position: 'start',
        color: muted,
        fontSize: 10
      },
      lineStyle: { color: rule, type: 'dashed', opacity: 0.6 }
    };
  });

  // Today marker (Jun 23 = day 22)
  markLines.push({
    xAxis: 22,
    label: {
      formatter: '今天',
      position: 'start',
      color: accent,
      fontSize: 10,
      fontWeight: 'bold'
    },
    lineStyle: { color: accent, type: 'solid', width: 2 }
  });

  chartGantt.setOption({
    animation: false,
    tooltip: {
      trigger: 'axis',
      appendToBody: true,
      formatter: function(params) {
        if (!params || params.length === 0) return '';
        var p = params[0];
        var task = tasks[p.dataIndex];
        var statusMap = { done: '已完成', partial: '部分完成', todo: '未开始' };
        return '<b>' + task.name + '</b><br/>' +
               '状态: ' + statusMap[task.status] + '<br/>' +
               '周期: ' + (task.end - task.start + 1) + ' 天';
      }
    },
    grid: {
      left: 140,
      right: 30,
      top: 15,
      bottom: 30
    },
    xAxis: {
      type: 'value',
      min: -8,
      max: 51,
      axisLabel: {
        formatter: function(v) {
          var labels = {
            '-6': '5/26', '1': '6/2', '8': '6/9', '15': '6/16',
            '22': '6/23', '29': '6/30', '36': '7/7', '43': '7/14'
          };
          return labels[v] || '';
        },
        color: muted,
        fontSize: 10
      },
      splitLine: { show: false },
      axisLine: { lineStyle: { color: rule } },
      axisTick: { show: false }
    },
    yAxis: {
      type: 'category',
      data: tasks.map(function(t) { return t.name; }),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: ink, fontSize: 11 }
    },
    series: [{
      type: 'custom',
      renderItem: function(params, api) {
        var categoryIndex = api.value(0);
        var start = api.coord([api.value(1), categoryIndex]);
        var end = api.coord([api.value(2), categoryIndex]);
        var height = api.size([0, 1])[1];
        var rectShape = echarts.graphic.clipRectByRect(
          { x: start[0], y: start[1] - height * 0.35, width: end[0] - start[0], height: height * 0.7 },
          { x: params.coordSys.x, y: params.coordSys.y, width: params.coordSys.width, height: params.coordSys.height }
        );
        return rectShape && {
          type: 'rect',
          transition: ['shape'],
          shape: rectShape,
          style: api.style(),
          textContent: {
            type: 'text',
            style: {
              text: tasks[categoryIndex].name,
              x: (rectShape.x + rectShape.width / 2),
              y: rectShape.y + rectShape.height / 2,
              fill: '#fff',
              fontSize: 10,
              textAlign: 'center',
              textVerticalAlign: 'middle'
            }
          }
        };
      },
      encode: {
        x: [1, 2],
        y: 0
      },
      data: tasks.map(function(t, i) {
        return {
          value: [i, t.start, t.end],
          itemStyle: {
            color: statusColor[t.status],
            borderRadius: 3
          }
        };
      }),
      markLine: {
        silent: true,
        symbol: 'none',
        data: markLines
      }
    }]
  });

  window.addEventListener('resize', function() { chartGantt.resize(); });
})();
