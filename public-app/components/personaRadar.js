/**
 * 旅格 Travel Persona · 人格维度雷达图组件
 *
 * 纯 Canvas 2D 实现，零依赖，支持双层叠加对比。
 * 绘制正多边形网格 + 数据多边形，直观展示 16 维人格分布。
 */
(function (global) {
  'use strict';

  var App = global.App;
  if (!App) {
    console.error('[personaRadar.js] App 命名空间未找到');
    return;
  }

  // 16 维标签（与 app.js 中的 traitLabels 保持一致）
  var TRAIT_LABELS = {
    restoration: '恢复', nature: '自然', culture: '文化', food: '美食',
    pace: '节奏', social: '社交', budget: '预算', aesthetics: '审美',
    comfort: '舒适', novelty: '新鲜', transit: '交通', lowCrowd: '低拥挤',
    authenticity: '在地', weatherFlex: '天气', bookingEase: '预约', workation: '旅居'
  };

  var TRAIT_ORDER = [
    'restoration', 'nature', 'culture', 'food',
    'pace', 'social', 'budget', 'aesthetics',
    'comfort', 'novelty', 'transit', 'lowCrowd',
    'authenticity', 'weatherFlex', 'bookingEase', 'workation'
  ];

  /**
   * 获取 trait 的数值（兼容 number 和 { mean: number } 两种格式）
   */
  function getTraitValue(trait) {
    if (typeof trait === 'number') return trait;
    if (trait && typeof trait.mean === 'number') return trait.mean;
    return 0.5;
  }

  /**
   * 绘制雷达图
   * @param {HTMLCanvasElement} canvas - 画布元素
   * @param {Object} acceptedTraits - 长期人格维度数据
   * @param {Object} provisionalTraits - 本次信号维度数据（可选）
   * @param {Object} options - 绘制选项
   */
  function draw(canvas, acceptedTraits, provisionalTraits, options) {
    options = options || {};
    var dpr = global.devicePixelRatio || 1;
    var width = canvas.clientWidth || 320;
    var height = canvas.clientHeight || 320;

    // 适配高分屏
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var cx = width / 2;
    var cy = height / 2;
    var radius = Math.min(width, height) / 2 - 40; // 留边距给标签

    // 过滤出有数据的维度
    var activeKeys = [];
    TRAIT_ORDER.forEach(function (key) {
      var hasAccepted = acceptedTraits && (acceptedTraits[key] !== undefined);
      var hasProvisional = provisionalTraits && (provisionalTraits[key] !== undefined);
      if (hasAccepted || hasProvisional) {
        activeKeys.push(key);
      }
    });

    // 如果没有数据，绘制空状态提示
    if (activeKeys.length === 0) {
      ctx.fillStyle = '#9CA3AF';
      ctx.font = '14px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('完成规划后将展示人格雷达图', cx, cy);
      return;
    }

    var n = activeKeys.length;
    var angleStep = (Math.PI * 2) / n;
    var startAngle = -Math.PI / 2; // 从顶部开始

    // === 绘制网格 ===
    var gridLevels = 5;
    ctx.strokeStyle = 'rgba(26, 26, 46, 0.08)';
    ctx.lineWidth = 1;

    for (var level = 1; level <= gridLevels; level++) {
      var r = (radius * level) / gridLevels;
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var angle = startAngle + i * angleStep;
        var x = cx + r * Math.cos(angle);
        var y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }

    // === 绘制轴线 ===
    ctx.strokeStyle = 'rgba(26, 26, 46, 0.06)';
    for (var i = 0; i < n; i++) {
      var angle = startAngle + i * angleStep;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
      ctx.stroke();
    }

    // === 绘制维度标签 ===
    ctx.font = '12px "Noto Sans SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (var i = 0; i < n; i++) {
      var key = activeKeys[i];
      var label = TRAIT_LABELS[key] || key;
      var angle = startAngle + i * angleStep;
      var labelRadius = radius + 22;
      var lx = cx + labelRadius * Math.cos(angle);
      var ly = cy + labelRadius * Math.sin(angle);

      // 根据角度调整文字对齐
      if (Math.abs(Math.cos(angle)) < 0.3) {
        ctx.textAlign = 'center';
      } else if (Math.cos(angle) > 0) {
        ctx.textAlign = 'left';
      } else {
        ctx.textAlign = 'right';
      }

      ctx.fillStyle = '#6B7280';
      ctx.fillText(label, lx, ly);
    }

    // === 绘制数据多边形 ===
    function drawPolygon(traits, strokeStyle, fillStyle, lineWidth, lineDash) {
      if (!traits) return;
      var points = [];
      var hasData = false;

      for (var i = 0; i < n; i++) {
        var key = activeKeys[i];
        var value = getTraitValue(traits[key]);
        if (traits[key] !== undefined) hasData = true;
        var angle = startAngle + i * angleStep;
        var r = radius * Math.max(0, Math.min(1, value));
        points.push({
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle)
        });
      }

      if (!hasData || points.length === 0) return;

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (var i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();

      ctx.fillStyle = fillStyle;
      ctx.fill();

      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(lineDash || []);
      ctx.stroke();
      ctx.setLineDash([]);

      // 绘制顶点圆点
      ctx.fillStyle = strokeStyle;
      for (var i = 0; i < points.length; i++) {
        var key = activeKeys[i];
        if (traits[key] === undefined) continue;
        ctx.beginPath();
        ctx.arc(points[i].x, points[i].y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 长期人格（底层，实线，品牌绿）
    if (acceptedTraits && Object.keys(acceptedTraits).length > 0) {
      drawPolygon(
        acceptedTraits,
        'rgba(45, 106, 79, 0.85)',
        'rgba(45, 106, 79, 0.12)',
        2,
        []
      );
    }

    // 本次信号（上层，虚线，强调色）
    if (provisionalTraits && Object.keys(provisionalTraits).length > 0) {
      drawPolygon(
        provisionalTraits,
        'rgba(231, 111, 81, 0.85)',
        'rgba(231, 111, 81, 0.08)',
        2,
        [4, 3]
      );
    }

    // === 图例 ===
    var legendY = height - 16;
    var legendItems = [];
    if (acceptedTraits && Object.keys(acceptedTraits).length > 0) {
      legendItems.push({ label: '长期人格', color: 'rgba(45, 106, 79, 0.85)', dashed: false });
    }
    if (provisionalTraits && Object.keys(provisionalTraits).length > 0) {
      legendItems.push({ label: '本次信号', color: 'rgba(231, 111, 81, 0.85)', dashed: true });
    }

    if (legendItems.length > 1) {
      var totalWidth = legendItems.reduce(function (sum, item) {
        return sum + ctx.measureText(item.label).width + 24;
      }, 0) + (legendItems.length - 1) * 20;
      var legendX = (width - totalWidth) / 2;

      ctx.font = '11px "Noto Sans SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';

      legendItems.forEach(function (item) {
        ctx.beginPath();
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.setLineDash(item.dashed ? [4, 3] : []);
        ctx.moveTo(legendX, legendY);
        ctx.lineTo(legendX + 16, legendY);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#6B7280';
        ctx.fillText(item.label, legendX + 22, legendY);
        legendX += ctx.measureText(item.label).width + 44;
      });
    }
  }

  // 注册到 App 命名空间
  App.PersonaRadar = {
    draw: draw,
    TRAIT_LABELS: TRAIT_LABELS,
    TRAIT_ORDER: TRAIT_ORDER
  };

})(window);
