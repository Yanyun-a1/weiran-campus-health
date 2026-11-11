/* 校园健康助手 · 小球视图 v9
 * v6 的逐帧投影 / 质感 / 尺寸 / 文案、v7 的指针事件绑定、v8 的三级状态与
 * 三段式动画全部一字未改（v8 做的两件事：level = root|sub|detail 单一三级状态、
 * 逐级返回；分裂 / 返回改为 JS 时序 + CSS transition 三段式、无 keyframes）。
 * v9 只补一个过渡：进入中球层时顶栏切换器 / 身份选择器渐隐，返回时延迟
 * 200ms 渐显；动画中途取消或切视图强落终态。
 * JS 每帧计算球面坐标 → 两次旋转 → 透视投影，只写位置 / 缩放 / 深度。
 * 球自身只有 translate + scale，永远是正圆；不使用任何 3D 库。
 * 对话视图（30 条问答 / 智能问数 / 请假表单 / 身份切换 / 问答弹窗）完全不碰。
 */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  var UI_KEY = 'xiaotong.ui.v1';
  var D2R = Math.PI / 180;
  var CAMERA_D = 1200;          // 相机距离 d
  var RY_MAX = 42, RX_MAX = 22; // 拖动角度上限（度）
  var DRAG_SIGN = 1;            // 见下方拖动说明：验收 3/4 要求左拖时左球退后

  /* 三色与九个占位文案逐字沿用 v4，不动 */
  var ORBS = [
    {
      id: 'food', name: '食序', az: 0, el: 48,
      hi: '#FFD9BE', main: '#FF8A5B', dark: '#C9442A',
      minis: [
        { name: '菜品营养', desc: '每道菜的热量、蛋白质、脂肪、钠含量与搭配建议' },
        { name: '饮食记录', desc: '今日三餐记录与营养摄入进度' },
        { name: '食堂安全', desc: '卫生评级、留样公示与问题反馈' }
      ]
    },
    {
      id: 'sleep', name: '息衡', az: 42, el: -20,
      hi: '#C7CFFF', main: '#6B7BE8', dark: '#3B49A8',
      minis: [
        { name: '作息记录', desc: '入睡与起床时间统计、睡眠时长趋势' },
        { name: '睡眠质量', desc: '睡眠评分与影响因素分析' },
        { name: '宿舍环境', desc: '噪音、光照、通风等影响睡眠的环境数据' }
      ]
    },
    {
      id: 'sport', name: '动跃', az: -42, el: -20,
      hi: '#A8F0E8', main: '#2AA79B', dark: '#16756C',
      minis: [
        { name: '运动记录', desc: '运动类型、时长与消耗统计' },
        { name: '场馆器材', desc: '场地空闲状态与器材借用' },
        { name: '运动建议', desc: '按近期运动量给出锻炼与防损伤建议' }
      ]
    }
  ];
  /* 中球沿用大球的三个方位角，构成同样的等边三角形 */
  var COORDS = [{ az: 0, el: 48 }, { az: 42, el: -20 }, { az: -42, el: -20 }];
  /* 三个中球明度依次相差 10% */
  var DELTAS = [-0.05, 0, 0.05];

  function shade(hex, d) {
    var v = String(hex).replace('#', '');
    var r = parseInt(v.slice(0, 2), 16), g = parseInt(v.slice(2, 4), 16), b = parseInt(v.slice(4, 6), 16);
    var f = Math.abs(d) * 2; // ±0.05 → 与白/黑混合 10%
    if (d > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
    else if (d < 0) { r *= (1 - f); g *= (1 - f); b *= (1 - f); }
    return '#' + [r, g, b].map(function (x) {
      var s = Math.round(x).toString(16); return s.length < 2 ? '0' + s : s;
    }).join('');
  }

  function itemHtml(o) {
    var vars = '--az:' + o.az + 'deg;--el:' + o.el + 'deg;' +
               '--c-hi:' + o.hi + ';--c-main:' + o.main + ';--c-dark:' + o.dark + ';';
    return '<div class="orb-item ' + o.cls + '" ' + o.attrs +
      ' data-az="' + o.az + '" data-el="' + o.el + '" style="' + vars + '"' +
      ' role="button" tabindex="0" aria-label="' + esc(o.name) + '">' +
      '<div class="orb-skin"></div>' +
      '<div class="orb-text">' + esc(o.name) + '</div>' +
      '</div>';
  }

  function buildStage() {
    var stage = $('#orbStage');
    if (!stage) return;
    var html = ORBS.map(function (o) {
      return itemHtml({ cls: 'orb-major', attrs: 'data-orb="' + o.id + '"', name: o.name,
                        az: o.az, el: o.el, hi: o.hi, main: o.main, dark: o.dark });
    }).join('');
    /* 九个中球预生成（文案始终在 DOM 里），按当前大球切换 is-current */
    ORBS.forEach(function (o) {
      html += o.minis.map(function (m, i) {
        var d = DELTAS[i], c = COORDS[i];
        return itemHtml({ cls: 'orb-minor',
          attrs: 'data-group="' + o.id + '" data-mod="' + esc(m.name) + '" data-desc="' + esc(m.desc) + '"',
          name: m.name, az: c.az, el: c.el,
          hi: shade(o.hi, d), main: shade(o.main, d), dark: shade(o.dark, d) });
      }).join('');
    });
    /* v28：手机端三个大球下方的通俗标签，与球同放在 .orb-stage 球层容器里。
       只新增元素，不改球体 HTML；由 applyProjection 每帧下发与大球一致的位移。 */
    html += [['food', '饮食'], ['sleep', '作息'], ['sport', '运动']].map(function (t) {
      return '<span class="orb-tag" data-tag="' + t[0] + '" aria-hidden="true">' + t[1] + '</span>';
    }).join('');
    stage.innerHTML = html;
  }

  /* 预索引：避免每帧做 DOM 查询；半径 R 从 CSS 变量读，自动跟随桌面/手机断点 */
  var MAJORS = [], MINORS = {}, R_CACHE = { major: 250, minor: 175, majorD: 150, minorD: 200 };
  /* v18：中心「校医院」球 + 三条虚线（目的地节点，独立于 ORBS，不参与 3D 绕行） */
  var LINKS = {};
  var HUB = { center: null, centerR: 55, inConverge: false };
  function rec(el) {
    return {
      el: el, skin: el.querySelector('.orb-skin'),
      az: Number(el.getAttribute('data-az')) * D2R,
      elv: Number(el.getAttribute('data-el')) * D2R
    };
  }
  function indexItems() {
    MAJORS = $$('.orb-major').map(function (el) {
      var r = rec(el);
      /* v28：预索引同组标签，避免每帧 DOM 查询 */
      r.tag = document.querySelector('.orb-tag[data-tag="' + el.getAttribute('data-orb') + '"]');
      return r;
    });
    MINORS = {};
    $$('.orb-minor').forEach(function (m) {
      var g = m.getAttribute('data-group');
      (MINORS[g] = MINORS[g] || []).push(rec(m));
    });
  }
  function measure() {
    var a = $('.orb-major'), b = $('.orb-minor');
    if (a) {
      R_CACHE.major = parseFloat(getComputedStyle(a).getPropertyValue('--R')) || 250;
      R_CACHE.majorD = parseFloat(getComputedStyle(a).getPropertyValue('--d')) || 150;
    }
    if (b) {
      R_CACHE.minor = parseFloat(getComputedStyle(b).getPropertyValue('--R')) || 175;
      R_CACHE.minorD = parseFloat(getComputedStyle(b).getPropertyValue('--d')) || 200;
    }
    if (HUB.center) HUB.centerR = HUB.center.offsetWidth / 2 || 55;
  }

  /* ================= 三级层级状态（唯一数据源） =================
   * level 只有 root / sub / detail；layer 只是投影用的派生别名，由 setLevel
   * 同步，不是独立状态，也不再叠加 detailOpen 一类的布尔值。 */
  var level = 'root';
  var layer = 'major';
  var picked = null;
  function setLevel(v) {
    level = v;
    layer = (v === 'root') ? 'major' : 'minor';
  }
  function activeRecs() { return layer === 'major' ? MAJORS : (MINORS[picked] || []); }

  /* 动画保护：进行中忽略一切指针 / 键盘 / 返回入口，取消时直接落到静止态 */
  var isAnimating = false;
  var animTarget = 'root';
  var animTimers = [];
  var detailTimer = null;
  var detailOpenedAt = 0;            // 详情面板打开时刻，用于关闭冷却期
  var detailDownOnOverlay = false;   // 遮罩 pointerdown 是否落在遮罩本身（保护 3）
  var animPhase = null, animMarks = [];

  /* ================= 每帧投影（核心公式） =================
   *  x0 = R cos(el) sin(az), y0 = R sin(el), z0 = R cos(el) cos(az)
   *  绕 Y：x1 = x0 cos(ry) + z0 sin(ry)，z1 = -x0 sin(ry) + z0 cos(ry)，y1 = y0
   *  绕 X：y2 = y1 cos(rx) - z1 sin(rx)，z2 = y1 sin(rx) + z1 cos(rx)，x2 = x1
   *  投影：k = d / (d - z2)，px = x2·k，py = -y2·k，sc = k
   *  深度：t = (z2 + R) / (2R)
   * 每帧只写三个球的 --px / --py / --sc / --txt-op，
   * 以及 opacity / filter（质感层）与 z-index（球层），不碰其他属性。
   */
  function applyProjection(ryDeg, rxDeg) {
    var ry = ryDeg * D2R, rx = rxDeg * D2R;
    var cy = Math.cos(ry), sy = Math.sin(ry);
    var cx = Math.cos(rx), sx = Math.sin(rx);
    var R = R_CACHE[layer];
    var list = activeRecs();
    for (var i = 0; i < list.length; i++) {
      var o = list[i], el = o.el;
      var ce = Math.cos(o.elv), se = Math.sin(o.elv);
      var x0 = R * ce * Math.sin(o.az);
      var y0 = R * se;
      var z0 = R * ce * Math.cos(o.az);

      var x1 = x0 * cy + z0 * sy;
      var z1 = -x0 * sy + z0 * cy;
      var y1 = y0;

      var y2 = y1 * cx - z1 * sx;
      var z2 = y1 * sx + z1 * cx;
      var x2 = x1;

      var k = CAMERA_D / (CAMERA_D - z2);
      var t = clamp((z2 + R) / (2 * R), 0, 1);

      el.style.setProperty('--px', (x2 * k).toFixed(2) + 'px');
      el.style.setProperty('--py', (-y2 * k).toFixed(2) + 'px');
      el.style.setProperty('--sc', k.toFixed(4));
      el.style.setProperty('--txt-op', t < 0.25 ? '0.35' : '1');
      o.skin.style.opacity = (0.35 + 0.65 * t).toFixed(3);
      o.skin.style.filter = 'brightness(' + (0.65 + 0.35 * t).toFixed(3) + ') blur(' + ((1 - t) * 2.2).toFixed(2) + 'px)';
      el.style.zIndex = String(Math.round(t * 100));
      /* v28：标签与大球共用同一组投影位移，但不套用球的 --sc 缩放、不参与旋转；
         球底 +6px 的间距由 CSS 承担。拖动 / relayout / 返回大球层时逐帧同步。 */
      if (layer === 'major' && o.tag) {
        o.tag.style.setProperty('--tag-px', (x2 * k).toFixed(2) + 'px');
        o.tag.style.setProperty('--tag-py', (-y2 * k + R_CACHE.majorD * k / 2).toFixed(2) + 'px');
      }
    }
    /* v18：大球层下，按三个大球当前投影位置实时重算三条虚线（中心固定，线随大球走） */
    if (layer === 'major') updateLinks();
  }

  /* v18：三条虚线——从大球边缘连到中心球边缘；中心球固定在投影中心(0,0)，
   * 大球端随投影坐标移动，因此拖动 / 动画时连线始终贴合。轻微贝塞尔弯曲。 */
  function updateLinks() {
    if (!HUB.center) return;
    var cr = HUB.centerR || (HUB.center.offsetWidth / 2) || 55;
    for (var i = 0; i < MAJORS.length; i++) {
      var o = MAJORS[i];
      var id = o.el.getAttribute('data-orb');
      var path = LINKS[id];
      if (!path) continue;
      var px = parseFloat(o.el.style.getPropertyValue('--px')) || 0;
      var py = parseFloat(o.el.style.getPropertyValue('--py')) || 0;
      var k = parseFloat(o.el.style.getPropertyValue('--sc')) || 1;
      var mr = (R_CACHE.majorD / 2) * k;          // 大球当前渲染半径
      var len = Math.sqrt(px * px + py * py);
      if (len < 1) { path.setAttribute('d', ''); continue; }
      var ux = px / len, uy = py / len;            // 中心→大球方向
      var ix = ux * cr, iy = uy * cr;              // 中心球边缘起点
      var ox = px - ux * mr, oy = py - uy * mr;    // 大球边缘终点
      var mx = (ix + ox) / 2, my = (iy + oy) / 2;  // 中点 + 垂直微弯
      var nx = -uy, ny = ux, bow = 10;
      var cx = mx + nx * bow, cy = my + ny * bow;
      path.setAttribute('d', 'M ' + ix.toFixed(1) + ' ' + iy.toFixed(1) +
        ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) +
        ' ' + ox.toFixed(1) + ' ' + oy.toFixed(1));
    }
  }

  /* 规格里的缓动：cubic-bezier(.22,1,.36,1)，用二分反解参数 t */
  function cubicBezier(x1, y1, x2, y2) {
    function calc(a1, a2, t) {
      var u = 1 - t;
      return 3 * a1 * t * u * u + 3 * a2 * t * t * u + t * t * t;
    }
    return function (x) {
      var lo = 0, hi = 1, t = x;
      for (var i = 0; i < 22; i++) {
        if (calc(x1, x2, t) < x) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return calc(y1, y2, t);
    };
  }
  var EASE = cubicBezier(.22, 1, .36, 1);
  var EASE_MS = 500;

  /* ================= 拖动（rAF 节流） ================= */
  var cur = { ry: 0, rx: 0 };
  var target = { ry: 0, rx: 0 };
  var mode = 'idle';                 // idle | drag | ease
  var rafId = null;
  var easeStart = 0, easeFrom = { ry: 0, rx: 0 };

  function tick(ts) {
    rafId = null;
    if (mode === 'ease') {
      var p = Math.min(1, (ts - easeStart) / EASE_MS);
      var k = 1 - EASE(p);
      cur.ry = easeFrom.ry * k;
      cur.rx = easeFrom.rx * k;
      if (p >= 1) { mode = 'idle'; cur.ry = 0; cur.rx = 0; }
      applyProjection(cur.ry, cur.rx);
      if (mode !== 'idle') rafId = requestAnimationFrame(tick);
      return;
    }
    if (mode === 'drag') {
      cur.ry = target.ry; cur.rx = target.rx;
      applyProjection(cur.ry, cur.rx);
      rafId = requestAnimationFrame(tick); // 按住期间持续逐帧，直到松手进入回弹
      return;
    }
    applyProjection(cur.ry, cur.rx);
  }
  function requestFrame() {
    if (isAnimating || rafId !== null) return;  // 动画期间不跑拖动/回弹的逐帧循环
    rafId = requestAnimationFrame(tick);
  }
  function startRAF() { requestFrame(); }
  /* 动画开始时彻底停掉逐帧循环，避免它和动画抢 transform / opacity */
  function stopRAF() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    mode = 'idle';
    cur.ry = 0; cur.rx = 0; target.ry = 0; target.rx = 0;
  }
  function startEaseBack() {
    if (isAnimating) { cur.ry = 0; cur.rx = 0; mode = 'idle'; return; }
    if (Math.abs(cur.ry) < .001 && Math.abs(cur.rx) < .001) {
      cur.ry = 0; cur.rx = 0; mode = 'idle';
      applyProjection(0, 0);
      return;
    }
    easeFrom = { ry: cur.ry, rx: cur.rx };
    easeStart = performance.now();
    mode = 'ease';
    requestFrame();                        // 500ms 内缓动回 0deg / 0deg
  }

  /* ================= 指针事件：全部绑在 .orb-scene 上 =================
   * 大球层与中球层共用同一个 scene 和同一套逻辑，靠 downOrb 的 class 区分，
   * 不写两遍。点击不再依赖 click：pointerdown 里 preventDefault，
   * 所有点击判定都在 pointerup 里用 downOrb 自己算。
   */
  var pointerId = null;
  var downX = 0, downY = 0;
  var downOrb = null;        // pointerdown 命中的球，空白处为 null
  var downBack = false;      // 命中的是左上角返回按钮
  var downCenter = false;    // 命中的是中心「校医院」球（v18）
  var isDragging = false;

  function bindDrag() {
    var scene = $('#orbScene');
    if (!scene) return;

    function handleMove(e) {
      var dx = e.clientX - downX, dy = e.clientY - downY;
      if (!isDragging && Math.hypot(dx, dy) > 8) isDragging = true;
      if (isDragging) {
        /* 符号沿用 v6 已验收的方向（左拖 → 左球退后变暗）；
         * 需按字面 -dx 时可在控制台 __orbDragSign(-1) 切换。 */
        target.ry = clamp(DRAG_SIGN * dx * 0.32, -RY_MAX, RY_MAX);
        target.rx = clamp(dy * 0.20, -RX_MAX, RX_MAX);
      }
    }

    function handleUp(e, allowClick) {
      var pid = e.pointerId;
      var moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      var hitOrb = downOrb, hitBack = downBack, hitCenter = downCenter;
      pointerId = null;                  // 先置空，避免兜底逻辑重复收尾
      try { scene.releasePointerCapture(pid); } catch (err) {}
      if (allowClick && moved < 8) {     // pointerup 的 target 已被捕获，只能用 downOrb
        var wasDetail = (level === 'detail');
        if (hitOrb) triggerSplit(hitOrb);
        else if (hitBack) goRoot();
        else if (hitCenter) convergeToCenter();
        /* 排查 1：若这次点击打开了详情（仅中球会，level 从非 detail 进入 detail），
         * 立刻拦住事件，防止冒泡到 window 兜底，并抑制移动端补发的 click
         * 命中遮罩误关。绝不影响返回按钮（返回不改 level 到 detail）。 */
        if (!wasDetail && level === 'detail') {
          e.stopPropagation();
          e.preventDefault();
        }
      }
      scene.classList.remove('is-dragging');
      target.ry = 0; target.rx = 0;
      downOrb = null; downBack = false; downCenter = false; isDragging = false;
      startEaseBack();                   // 点击与拖动都走回弹，角度归零
    }

    function handleCancel() {
      if (pointerId === null) return;
      pointerId = null; downOrb = null; downBack = false; downCenter = false; isDragging = false;
      scene.classList.remove('is-dragging');
      target.ry = 0; target.rx = 0;
      startEaseBack();
    }

    scene.addEventListener('pointerdown', function (e) {
      if (isAnimating) return;                           // 动画期间忽略一切指针输入
      if (e.button != null && e.button !== 0) return;   // 只响应左键 / 单指
      if (pointerId !== null) return;                    // 已有指针在拖，忽略第二根手指
      e.preventDefault();                                // 挡住选中、手势、原生拖拽
      pointerId = e.pointerId;
      downX = e.clientX; downY = e.clientY;
      downOrb = (e.target && e.target.closest) ? e.target.closest('.orb-item') : null;
      downBack = !!(e.target && e.target.closest && e.target.closest('#orbBack'));
      downCenter = !!(e.target && e.target.closest && e.target.closest('#orbCenter'));
      isDragging = false;
      scene.classList.add('is-dragging');
      try { scene.setPointerCapture(e.pointerId); } catch (err) {}
      target.ry = cur.ry; target.rx = cur.rx;            // 从当前角度接着拖，不跳变
      mode = 'drag';
      startRAF();
    });

    scene.addEventListener('pointermove', function (e) {
      if (pointerId === null || pointerId !== e.pointerId) return;
      handleMove(e);
    });
    scene.addEventListener('pointerup', function (e) {
      if (pointerId === null || pointerId !== e.pointerId) return;
      handleUp(e, true);
    });
    scene.addEventListener('pointercancel', handleCancel);
    scene.addEventListener('dragstart', function (e) { e.preventDefault(); });
    scene.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* 兜底：Chrome 在 pointerdown 被 preventDefault 后会释放显式鼠标捕获，
     * 指针拖出容器时 scene 收不到 move / up。window 上只在「捕获丢失且目标
     * 不在 scene 内」时补一次，避免重复处理；主键事件仍全部绑在 scene 上。 */
    function handledByScene(e) {
      return e.target === scene || (e.target && scene.contains(e.target));
    }
    window.addEventListener('pointermove', function (e) {
      if (pointerId === null || pointerId !== e.pointerId || handledByScene(e)) return;
      handleMove(e);
    });
    window.addEventListener('pointerup', function (e) {
      if (pointerId === null || pointerId !== e.pointerId || handledByScene(e)) return;
      handleUp(e, false);                // 容器外松手只复位，不当作点击
    });
    window.addEventListener('pointercancel', handleCancel);
  }

  /* ================= 三段式分裂 / 反向动画（v8） =================
   * 动画只写 transform / opacity / filter / transition 等内联样式；
   * --px / --py / --sc 始终由 applyProjection 按原公式算，动画期间不跑 rAF。
   * 静止态由 settle() 清掉内联后交给 .orb-stage.is-sub 表达，全程不重建 stage。 */
  function later(fn, ms) { var id = setTimeout(fn, ms); animTimers.push(id); return id; }
  function clearTimers() { animTimers.forEach(clearTimeout); animTimers = []; }
  function mark(p) { animPhase = p; animMarks.push({ phase: p, t: Math.round(performance.now()) }); }
  function readVars(el) {
    var s = el.style;
    return { px: parseFloat(s.getPropertyValue('--px')) || 0,
             py: parseFloat(s.getPropertyValue('--py')) || 0,
             sc: parseFloat(s.getPropertyValue('--sc')) || 1 };
  }
  function tf(px, py, sc) {
    return 'translate3d(' + Number(px).toFixed(2) + 'px,' + Number(py).toFixed(2) + 'px,0) scale(' + Number(sc).toFixed(4) + ')';
  }
  /* 只清「动画层」内联属性。.orb-skin 的 opacity / filter 是投影深度效果，不能清。 */
  function clearAnimStyles(el) {
    var s = el.style;
    ['transform', 'opacity', 'filter', 'transition', 'visibility', 'z-index', 'pointer-events']
      .forEach(function (p) { s.removeProperty(p); });
    var skin = el.querySelector('.orb-skin');
    if (skin) { skin.style.removeProperty('box-shadow'); skin.style.removeProperty('transition'); }
  }

  /* ================= v9 顶栏过渡 =================
   * 只切 .ui-switch / .identity-bar 的 opacity / transform / pointer-events，
   * 完全不用 display / visibility，过渡才不会被打断。
   * instant=true 时跳过过渡直接落终态：动画中途切视图或取消动画用，
   * 保证不会停在 opacity 0.4 这类中间值。 */
  function setHeader(hidden, instant) {
    var els = [$('#uiSwitch'), $('#identityBar')];
    els.forEach(function (el) {
      if (!el) return;
      if (instant) el.classList.add('orb-head-snap');
      el.classList.toggle('orb-head-hidden', !!hidden);
      void el.offsetWidth;              // 提交这一帧：过渡立即启动 / 终态立即生效
    });
    if (instant) {
      requestAnimationFrame(function () {
        els.forEach(function (el) { if (el) el.classList.remove('orb-head-snap'); });
      });
    }
  }
  /* 由「当前视图 + level」推导顶栏终态：对话视图一律可见，不受小球层影响 */
  function syncHeader(instant) {
    var orbActive = !($('#orbView') && $('#orbView').hidden);
    setHeader(orbActive && level !== 'root', instant);
  }

  /* 强制落到某一级的静止态：动画正常结束与中途取消共用，绝不重建 stage */
  function settle(target) {
    clearTimers();
    var stage = $('#orbStage');
    $$('.orb-major, .orb-minor').forEach(clearAnimStyles);
    if (target === 'sub') {
      $$('.orb-minor').forEach(function (m) {
        m.classList.toggle('is-current', m.getAttribute('data-group') === picked);
      });
      stage.classList.add('is-sub');
      document.querySelector('.page').classList.add('orb-split');
      $('#orbBack').hidden = false;
      $('#orbHint').textContent = '拖动旋转 · 点中球查看详情 · 点左上角返回';
    } else {
      $$('.orb-minor').forEach(function (m) { m.classList.remove('is-current'); });
      $$('.orb-major').forEach(function (m) { m.removeAttribute('data-picked'); });
      stage.classList.remove('is-sub');
      document.querySelector('.page').classList.remove('orb-split');
      $('#orbBack').hidden = true;
      $('#orbHint').textContent = '拖动旋转大球 · 点一个球展开子模块';
      picked = null;
    }
    setLevel(target === 'sub' ? 'sub' : 'root');
    syncHeader(true);                  // 终态强落：正常结束 / 中途取消都不会卡在中间透明度
    isAnimating = false;
    animPhase = null;
    applyProjection(0, 0);
    mark('settle-' + target);
  }
  function cancelAnim() { if (isAnimating) settle(animTarget); }

  var EASE_A = 'cubic-bezier(.4, 0, .2, 1)';
  var EASE_B = 'cubic-bezier(.4, 0, 1, 1)';
  var EASE_C = 'cubic-bezier(.22, 1, .36, 1)';
  var EASE_OUT = 'cubic-bezier(.22, 1, .36, 1)';

  /* root → sub：聚焦 0-280ms → 裂开 280-460ms → 重组 400-700ms */
  function enterSub(id) {
    if (level !== 'root' || isAnimating) return;
    isAnimating = true; animTarget = 'sub'; animMarks = [];
    picked = id;
    var stage = $('#orbStage');
    stopRAF();
    applyProjection(0, 0);            // level 仍 root，锁定三个大球的投影值

    $$('.orb-minor').forEach(function (m) {
      m.classList.toggle('is-current', m.getAttribute('data-group') === id);
    });
    $$('.orb-major').forEach(function (m) {
      if (m.getAttribute('data-orb') === id) m.setAttribute('data-picked', '1');
      else m.removeAttribute('data-picked');
    });
    document.querySelector('.page').classList.add('orb-split');
    setHeader(true, false);           // 与聚焦阶段同步启动：0 → 240ms 渐隐
    $('#orbBack').hidden = false;
    $('#orbHint').textContent = '拖动旋转 · 点中球查看详情 · 点左上角返回';

    var majors = $$('.orb-major'), hit = null, others = [];
    majors.forEach(function (m) {
      if (m.getAttribute('data-orb') === id) hit = m; else others.push(m);
    });
    var minors = $$('.orb-minor.is-current');

    /* 起点帧：无 transition，显式写出与 CSS 变量一致的 transform 作为过渡起点 */
    majors.forEach(function (m) {
      var v = readVars(m);
      m.style.transition = 'none';
      m.style.visibility = 'visible';
      m.style.opacity = '1';
      m.style.filter = 'blur(0px)';
      m.style.transform = tf(v.px, v.py, v.sc);
    });
    hit.style.zIndex = '999';
    minors.forEach(function (m) {
      m.style.transition = 'none';
      m.style.visibility = 'hidden';
      m.style.opacity = '0';
      m.style.pointerEvents = 'none';
      m.style.transform = tf(0, 0, 0.15);
    });
    mark('A-start');
    void stage.offsetWidth;           // 强制重排，保证 transform 过渡一定触发

    /* 阶段 A · 聚焦：被点球冲到场景正中心放大到 1.35，其余缩小虚化 */
    hit.style.transition = 'transform 280ms ' + EASE_A;
    hit.style.transform = tf(0, 0, 1.35);
    others.forEach(function (m) {
      var v = readVars(m);
      m.style.transition = 'transform 280ms ' + EASE_A + ', opacity 280ms ' + EASE_A + ', filter 280ms ' + EASE_A;
      m.style.transform = tf(v.px, v.py, v.sc * 0.55);
      m.style.opacity = '0.15';
      m.style.filter = 'blur(4px)';
    });

    later(function () {
      /* 阶段 B · 裂开：被点球收缩消失并扩散一圈白光，三个中球在中心生成 */
      mark('B-start');
      var skin = hit.querySelector('.orb-skin');
      hit.style.transition = 'none';
      hit.style.transform = tf(0, 0, 1.35);
      hit.style.opacity = '1';
      skin.style.transition = 'none';
      skin.style.boxShadow = '0 0 0 0 rgba(255,255,255,.5)';
      minors.forEach(function (m) {
        m.style.transition = 'none';
        m.style.visibility = 'visible';
        m.style.opacity = '0';
        m.style.filter = 'blur(6px)';
        m.style.transform = tf(0, 0, 0.15);
        m.style.pointerEvents = 'none';
      });
      void stage.offsetWidth;
      hit.style.transition = 'transform 180ms ' + EASE_B + ', opacity 180ms ' + EASE_B;
      hit.style.transform = tf(0, 0, 0.15);
      hit.style.opacity = '0';
      /* 另外两个大球跟着淡出并继续后退，避免动画结束时突然消失 */
      others.forEach(function (m) {
        var v = readVars(m);
        m.style.transition = 'opacity 180ms ' + EASE_B + ', transform 180ms ' + EASE_B;
        m.style.opacity = '0';
        m.style.transform = tf(v.px, v.py, v.sc * 0.3);
      });
      /* 白光 180ms 内先扩散到 60px 峰值再淡出：两段各 90ms */
      skin.style.transition = 'box-shadow 90ms ease-out';
      skin.style.boxShadow = '0 0 60px 12px rgba(255,255,255,.5)';
      later(function () {
        skin.style.transition = 'box-shadow 90ms ease-in';
        skin.style.boxShadow = '0 0 60px 12px rgba(255,255,255,0)';
      }, 90);

      later(function () {
        /* 阶段 C · 重组：中球从中心飞向按原公式算出的目标位置，逐个错开 40ms */
        mark('C-start');
        setLevel('sub');
        applyProjection(0, 0);        // 只写中球的 --px / --py / --sc / 深度
        minors.forEach(function (m, i) {
          later(function () {
            var v = readVars(m);
            var dur = 300 - i * 40;   // 400 / 440 / 480 出发，统一 700ms 收尾
            void m.offsetWidth;       // 每次改 transform 前强制重排
            m.style.transition = 'transform ' + dur + 'ms ' + EASE_C +
              ', opacity ' + dur + 'ms ' + EASE_C + ', filter ' + dur + 'ms ' + EASE_C;
            m.style.transform = tf(v.px, v.py, v.sc);
            m.style.opacity = '1';
            m.style.filter = 'blur(0px)';
            mark('C' + i);
          }, i * 40);
        });
        later(function () { settle('sub'); }, 300);
      }, 120);                        // 280 + 120 = 400ms
    }, 280);
  }

  /* sub → root：中球向中心收拢 280ms → 延迟 120ms 大球从中心放大出现，总 520ms */
  function goRoot() {
    if (level !== 'sub' || isAnimating) return;
    isAnimating = true; animTarget = 'root'; animMarks = [];
    var stage = $('#orbStage');
    stopRAF();
    var minors = $$('.orb-minor.is-current');
    var majors = $$('.orb-major');
    var minorVars = minors.map(readVars);   // 中球当前位置，作为收拢起点

    setLevel('root');
    applyProjection(0, 0);                 // 重新算出三个大球的目标位置
    var majorVars = majors.map(readVars);

    minors.forEach(function (m, i) {
      m.style.transition = 'none';
      m.style.visibility = 'visible';
      m.style.opacity = '1';
      m.style.filter = 'blur(0px)';
      m.style.transform = tf(minorVars[i].px, minorVars[i].py, minorVars[i].sc);
      m.style.pointerEvents = 'none';
    });
    majors.forEach(function (m) {
      m.style.transition = 'none';
      m.style.visibility = 'visible';
      m.style.opacity = '0';
      m.style.filter = 'blur(0px)';
      m.style.transform = tf(0, 0, 0.2);
      m.style.pointerEvents = 'none';
    });
    stage.classList.remove('is-sub');     // 大球不再被静止态隐藏，内联 opacity 接管
    mark('OUT-start');
    void stage.offsetWidth;
    /* 返回时淡入延迟 200ms 启动、240ms 完成，与三个大球放大出现大致同步 */
    later(function () { setHeader(false, false); }, 200);

    minors.forEach(function (m) {
      m.style.transition = 'transform 280ms ' + EASE_OUT + ', opacity 280ms ' + EASE_OUT + ', filter 280ms ' + EASE_OUT;
      m.style.transform = tf(0, 0, 0.2);
      m.style.opacity = '0';
      m.style.filter = 'blur(4px)';
    });
    majors.forEach(function (m, i) {
      later(function () {
        var dur = 360 - i * 40;           // 120 / 160 / 200 出发，统一 480ms 收尾
        void m.offsetWidth;
        m.style.transition = 'transform ' + dur + 'ms ' + EASE_OUT + ', opacity ' + dur + 'ms ' + EASE_OUT;
        m.style.transform = tf(majorVars[i].px, majorVars[i].py, majorVars[i].sc);
        m.style.opacity = '1';
        mark('OUT' + i);
      }, 120 + i * 40);
    });
    later(function () { settle('root'); }, 520);
  }

  /* 单击判定唯一入口：按在哪个球上由 pointerdown 记录的 downOrb 决定。
   * 大球 → 分裂；当前中球 → 详情面板；键盘 Enter / Space 也走这里。 */
  function triggerSplit(it) {
    if (!it || isAnimating || level === 'detail') return;
    if (it.classList.contains('orb-major') && level === 'root') {
      /* 大球：原有分裂动画照常；同时通知左侧对话做轻量响应 */
      var id = it.getAttribute('data-orb');
      enterSub(id);
      if (window.XT_CHAT) {
        var orb = null;
        for (var i = 0; i < ORBS.length; i++) if (ORBS[i].id === id) { orb = ORBS[i]; break; }
        if (orb) window.XT_CHAT.onMajor(orb.name, orb.minis.map(function (m) { return m.name; }));
      }
    } else if (it.classList.contains('orb-minor') && it.classList.contains('is-current') && level === 'sub') {
      /* 中球：桌面取消滑出详情面板，内容卡片直接插入左侧对话流（XT_CHAT.onMid 处理） */
      if (window.XT_CHAT) {
        window.XT_CHAT.onMid(it.getAttribute('data-mod'), it.getAttribute('data-desc'), it.getAttribute('data-group'));
      }
    }
  }

  /* ================= 模块详情占位面板（文案 / 版式保持 v4） =================
   * 只做 sub ↔ detail 一级切换。关闭时绝不调用 goRoot、不重建 stage、
   * 不触碰大球层任何状态，中球层位置与深度效果原样保留。 */
  function openDetail(name, desc) {
    if (isAnimating || level !== 'sub') return;
    if (detailTimer !== null) { clearTimeout(detailTimer); detailTimer = null; }
    setLevel('detail');
    var t = $('#orbDetailTitle'), d = $('#orbDetailDesc');
    if (t) t.textContent = name;
    if (d) d.textContent = desc;
    var bd = $('#orbDetailBackdrop'), p = $('#orbDetail');
    if (bd) { bd.hidden = false; bd.style.opacity = '1'; }
    detailOpenedAt = performance.now();   // 记录打开时刻，进入 350ms 冷却期
    if (p) {
      p.hidden = false;
      p.classList.remove('open');
      void p.offsetWidth;
      requestAnimationFrame(function () { p.classList.add('open'); });
    }
    document.body.style.overflow = 'hidden';
  }
  function closeDetail() {
    if (isAnimating || level !== 'detail') return;   // 动画期间不响应关闭（排查 3）
    setLevel('sub');                       // 只退一级：detail → sub
    var bd = $('#orbDetailBackdrop'), p = $('#orbDetail');
    if (p) p.classList.remove('open');    // 播放面板自身 translateX(100%) 退出
    if (bd) bd.style.opacity = '0';       // 遮罩淡出
    if (!document.querySelector('.modal-backdrop:not([hidden])')) document.body.style.overflow = '';
    if (detailTimer !== null) clearTimeout(detailTimer);
    detailTimer = setTimeout(function () {
      detailTimer = null;
      if (level === 'detail') return;     // 期间又打开了详情，不收面板
      if (p) p.hidden = true;
      if (bd) { bd.hidden = true; bd.style.opacity = '1'; }
    }, 460);
  }

  /* ================= 双 UI 切换（保持 v4） ================= */
  function setView(v, save) {
    if (v !== 'orb' && v !== 'chat') v = 'orb';
    var ov = $('#orbView'), cv = $('#chatView'), ib = $('#identityBar');
    if (ov) ov.hidden = (v !== 'orb');
    if (cv) cv.hidden = (v !== 'chat');
    if (ib) ib.hidden = (v !== 'chat');
    $$('.ui-seg').forEach(function (b) {
      var on = b.getAttribute('data-view') === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (save) { try { localStorage.setItem(UI_KEY, v); } catch (e) {} }
    if (isAnimating) cancelAnim();
    if (v === 'chat' && level === 'detail') closeDetail();
    syncHeader(true);                  // 切视图终态强落：对话视图切换器始终可见可点
  }

  function bind() {
    $$('.ui-seg').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); });
    });

    document.addEventListener('click', function (e) {
      if (!e.target || typeof e.target.closest !== 'function') return;
      var isBack = e.target.id === 'orbBack';
      var isDetailClose = e.target.id === 'orbDetailBack' || e.target.id === 'orbDetailReturn';
      if (isAnimating) {
        if (isBack || isDetailClose) cancelAnim(); // 狂点返回：取消动画，直接落到目标静止态
        return;                                    // 其余点击一律忽略
      }
      if (isDetailClose) { closeDetail(); return; } // 只退一级 detail → sub
      if (isBack) { goRoot(); return; }             // 只退一级 sub → root
    });

    /* 球不再绑 click：所有激活都在 pointerup / 键盘里走 triggerSplit */
    var stage = $('#orbStage');
    stage.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (isAnimating) { e.preventDefault(); return; }   // 动画中忽略键盘 Enter / Space
      var it = e.target.closest && e.target.closest('.orb-item');
      if (it) { e.preventDefault(); triggerSplit(it); }
    });

    /* v18：中心「校医院」球键盘可达（Enter / Space 触发汇聚 + 预约） */
    var centerEl = $('#orbCenter');
    if (centerEl) {
      centerEl.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        convergeToCenter();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (isAnimating) { cancelAnim(); return; }
      if (level === 'detail') { closeDetail(); return; }
      if (level === 'sub') goRoot();
    });

    /* 详情遮罩关闭：只走 pointer 事件（不再用 document click 判定 backdrop，
     * 否则打开详情的同一次手势补发的 click 命中遮罩会立即关闭，移动端闪退）。
     * 三道保护：① 350ms 冷却期挡住打开手势本身；② 关闭必须 e.target === 遮罩本身；
     * ③ 起终点都在遮罩上（从面板按下拖到遮罩松手不关）。 */
    var bdEl = $('#orbDetailBackdrop');
    if (bdEl) {
      bdEl.addEventListener('pointerdown', function (e) {
        detailDownOnOverlay = (e.target === bdEl);   // 保护 ③：起点落在遮罩本身
      });
      bdEl.addEventListener('pointerup', function (e) {
        var canClose = (performance.now() - detailOpenedAt >= 350)  // 保护 ①：冷却期
                    && detailDownOnOverlay                         // 保护 ③：起点在遮罩
                    && (e.target === bdEl);                        // 保护 ②：终点在遮罩
        detailDownOnOverlay = false;                 // 复位，避免跨手势残留
        if (canClose) closeDetail();
      });
      bdEl.addEventListener('pointercancel', function () { detailDownOnOverlay = false; });
    }

    bindDrag();
    window.addEventListener('resize', function () { measure(); requestFrame(); relayout(); });
  }

  /* ================= v14：分屏 / 抽屉联动（只改布局与联动，不碰投影公式） =================
   * relayout：按右栏容器尺寸重算外壳直径 / R / 球径，再 applyProjection 重跑；
   *           用 offset 尺寸（忽略 transform），避免抽屉缩放影响尺寸计算。
   * highlight：对应大球高亮（scale 脉冲 + 同色光晕），600ms 后自动复位，叠加在玻璃质感之上。 */
  function relayout() {
    var pane = $('#orbPane');
    var W = pane ? pane.offsetWidth : window.innerWidth;
    var H = pane ? pane.offsetHeight : window.innerHeight;
    if (!W || !H) return;
    /* 手机端(≤768)放宽宽度系数，让三角形铺开，给固定的中心「校医院」球留出间隙，
     * 避免在 390 等窄屏下与侧球边缘相碰；桌面系数与投影公式均不变。 */
    var wf = (W <= 768) ? 1.0 : 0.82;
    var D = Math.min(W * wf, H * 0.78, 720);
    var R = D * 0.33, d = D * 0.21;
    var scene = $('#orbScene');
    if (scene) scene.style.setProperty('--shell-d', D.toFixed(1) + 'px');
    var Rm = R * 0.7, dm = d * (200 / 150);   // 中球沿用 v4 比例（R 0.7×、d 大球的 1.333×）
    $$('.orb-major').forEach(function (m) {
      m.style.setProperty('--R', R.toFixed(1) + 'px');
      m.style.setProperty('--d', d.toFixed(1) + 'px');
    });
    $$('.orb-minor').forEach(function (m) {
      m.style.setProperty('--R', Rm.toFixed(1) + 'px');
      m.style.setProperty('--d', dm.toFixed(1) + 'px');
    });
    measure();
    applyProjection(cur.ry, cur.rx);
  }
  /* v25：脉冲高亮（CSS orbHot 600ms：scale 1 → 1.15 → 1 + 同色光晕），660ms 后复位 */
  function pulse(el) {
    if (!el) return;
    el.classList.remove('is-hot');
    void el.offsetWidth;
    el.classList.add('is-hot');
    setTimeout(function () { el.classList.remove('is-hot'); }, 660);
  }
  function highlight(group) { pulse($('.orb-major[data-orb="' + group + '"]')); }
  /* v25：「去点球」落点。点大球后视图已分裂到中球层、大球按静止态隐藏，
     先走既有 goRoot 返回大球层，待动画落定再脉冲，保证引导光晕真的可见；
     中球卡片则直接脉冲当前可见的那一颗。投影公式 / 分裂动画 / 玻璃质感均不动。 */
  function focusOrb(kind, group, mod, tries) {
    tries = tries || 0;
    var stage = $('#orbStage');
    if (kind === 'major') {
      var m = $('.orb-major[data-orb="' + group + '"]');
      if (!m) return;
      if (stage && stage.classList.contains('is-sub')) {
        if (isAnimating) {
          if (tries < 8) setTimeout(function () { focusOrb(kind, group, mod, tries + 1); }, 180);
          return;
        }
        goRoot();
        setTimeout(function () { pulse(m); }, 560);
      } else pulse(m);
    } else if (kind === 'minor') {
      pulse($('.orb-minor[data-group="' + group + '"][data-mod="' + mod + '"]'));
    }
  }
  window.XT_ORB = window.XT_ORB || {};
  window.XT_ORB.recompute = relayout;
  window.XT_ORB.highlight = highlight;
  window.XT_ORB.focus = focusOrb;

  /* v18：索引中心球与三条虚线；并缓存中心球半径（measure 时刷新） */
  function indexHub() {
    LINKS = {};
    $$('#orbLinkSvg .orb-link').forEach(function (p) {
      LINKS[p.getAttribute('data-orb')] = p;
    });
    HUB.center = $('#orbCenter');
    if (HUB.center) HUB.centerR = HUB.center.offsetWidth / 2 || 55;
  }

  /* v18：点中心「校医院」球——轻量「汇聚」动作，随后在对话面板追加预约消息并打开表单。
   * 只动 --cv（汇聚倍率），不碰投影公式 / 玻璃质感 / 三段式动画。 */
  function convergeToCenter() {
    if (isAnimating || level !== 'root' || HUB.inConverge) return;
    HUB.inConverge = true;
    var majors = $$('.orb-major');
    var center = HUB.center;
    /* 阶段 1（100ms）：三个大球内吸到 0.94，中心球放大到 1.12 */
    majors.forEach(function (m) {
      m.style.transition = 'transform 100ms ease';
      m.style.setProperty('--cv', '0.94');
    });
    if (center) {
      center.style.transition = 'transform 100ms ease';
      center.style.setProperty('--cv', '1.12');
    }
    setTimeout(function () {
      /* 阶段 2（200ms）：全部回到 1 */
      majors.forEach(function (m) {
        m.style.transition = 'transform 200ms cubic-bezier(.22, 1, .36, 1)';
        m.style.setProperty('--cv', '1');
      });
      if (center) {
        center.style.transition = 'transform 200ms cubic-bezier(.22, 1, .36, 1)';
        center.style.setProperty('--cv', '1');
      }
      setTimeout(function () {
        /* 清理内联，交还静止态（避免残留 transition 干扰后续分裂动画） */
        majors.forEach(function (m) {
          m.style.removeProperty('--cv');
          m.style.removeProperty('transition');
        });
        if (center) {
          center.style.removeProperty('--cv');
          center.style.removeProperty('transition');
        }
        HUB.inConverge = false;
        /* 动作结束后：对话面板追加两条消息 + 打开校医预约表单（手机端展开抽屉） */
        if (window.XT_CHAT && window.XT_CHAT.bookDoctor) window.XT_CHAT.bookDoctor();
      }, 220);
    }, 110);
  }

  function boot() {
    buildStage();
    indexItems();
    indexHub();
    measure();
    var saved = null;
    try { saved = localStorage.getItem(UI_KEY); } catch (e) { saved = null; }
    setView(saved === 'chat' ? 'chat' : 'orb', false);
    bind();
    applyProjection(0, 0);
    /* v14：按右栏容器重算小球尺寸，并监听尺寸变化 */
    requestAnimationFrame(function () { relayout(); });
    if (window.ResizeObserver && $('#orbPane')) {
      var _ro = new ResizeObserver(function () { relayout(); });
      _ro.observe($('#orbPane'));
    }
    /* 只读验收钩子：供无头浏览器直接指定角度、读取状态 */
    window.__orbApply = function (ry, rx) {
      cur.ry = ry; cur.rx = rx; target.ry = ry; target.rx = rx;
      applyProjection(ry, rx);
    };
    window.__orbState = function () {
      return { ry: cur.ry, rx: cur.rx, level: level, layer: layer, picked: picked, mode: mode,
               isAnimating: isAnimating, animTarget: animTarget,
               pointerId: pointerId, isDragging: isDragging, downOrb: downOrb ? downOrb.getAttribute('aria-label') : null,
               R: R_CACHE[layer], d: CAMERA_D, dragSign: DRAG_SIGN };
    };
    /* 只读动画时序钩子：验收三段式与 40ms 错开用 */
    window.__orbAnim = function () {
      return { isAnimating: isAnimating, phase: animPhase, marks: animMarks.slice() };
    };
    window.__orbDragSign = function (s) { DRAG_SIGN = Number(s) < 0 ? -1 : 1; return DRAG_SIGN; };
  }
  boot();
})();
