/* 校园健康助手 · 小球视图 v8
 * v6 的逐帧投影 / 质感 / 尺寸 / 文案、v7 的指针事件绑定全部一字未改。
 * v8 只做两件事：
 *  1) level = root | sub | detail 单一三级状态，逐级返回，详情关闭不再 collapse；
 *  2) 分裂 / 返回改为 JS 时序 + CSS transition 的三段式动画（无 keyframes）。
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
      id: 'food', name: '食品健康', az: 0, el: 48,
      hi: '#FFD9BE', main: '#FF8A5B', dark: '#C9442A',
      minis: [
        { name: '菜品营养', desc: '每道菜的热量、蛋白质、脂肪、钠含量与搭配建议' },
        { name: '饮食记录', desc: '今日三餐记录与营养摄入进度' },
        { name: '食堂安全', desc: '卫生评级、留样公示与问题反馈' }
      ]
    },
    {
      id: 'sleep', name: '作息健康', az: 42, el: -20,
      hi: '#C7CFFF', main: '#6B7BE8', dark: '#3B49A8',
      minis: [
        { name: '作息记录', desc: '入睡与起床时间统计、睡眠时长趋势' },
        { name: '睡眠质量', desc: '睡眠评分与影响因素分析' },
        { name: '宿舍环境', desc: '噪音、光照、通风等影响睡眠的环境数据' }
      ]
    },
    {
      id: 'sport', name: '运动健康', az: -42, el: -20,
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
    stage.innerHTML = html;
  }

  /* 预索引：避免每帧做 DOM 查询；半径 R 从 CSS 变量读，自动跟随桌面/手机断点 */
  var MAJORS = [], MINORS = {}, R_CACHE = { major: 250, minor: 175 };
  function rec(el) {
    return {
      el: el, skin: el.querySelector('.orb-skin'),
      az: Number(el.getAttribute('data-az')) * D2R,
      elv: Number(el.getAttribute('data-el')) * D2R
    };
  }
  function indexItems() {
    MAJORS = $$('.orb-major').map(rec);
    MINORS = {};
    $$('.orb-minor').forEach(function (m) {
      var g = m.getAttribute('data-group');
      (MINORS[g] = MINORS[g] || []).push(rec(m));
    });
  }
  function measure() {
    var a = $('.orb-major'), b = $('.orb-minor');
    if (a) R_CACHE.major = parseFloat(getComputedStyle(a).getPropertyValue('--R')) || 250;
    if (b) R_CACHE.minor = parseFloat(getComputedStyle(b).getPropertyValue('--R')) || 175;
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
      var hitOrb = downOrb, hitBack = downBack;
      pointerId = null;                  // 先置空，避免兜底逻辑重复收尾
      try { scene.releasePointerCapture(pid); } catch (err) {}
      if (allowClick && moved < 8) {     // pointerup 的 target 已被捕获，只能用 downOrb
        if (hitOrb) triggerSplit(hitOrb);
        else if (hitBack) goRoot();
      }
      scene.classList.remove('is-dragging');
      target.ry = 0; target.rx = 0;
      downOrb = null; downBack = false; isDragging = false;
      startEaseBack();                   // 点击与拖动都走回弹，角度归零
    }

    function handleCancel() {
      if (pointerId === null) return;
      pointerId = null; downOrb = null; downBack = false; isDragging = false;
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
    if (it.classList.contains('orb-major') && level === 'root') enterSub(it.getAttribute('data-orb'));
    else if (it.classList.contains('orb-minor') && it.classList.contains('is-current') && level === 'sub') {
      openDetail(it.getAttribute('data-mod'), it.getAttribute('data-desc'));
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
    if (p) {
      p.hidden = false;
      p.classList.remove('open');
      void p.offsetWidth;
      requestAnimationFrame(function () { p.classList.add('open'); });
    }
    document.body.style.overflow = 'hidden';
  }
  function closeDetail() {
    if (level !== 'detail') return;
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
  }

  function bind() {
    $$('.ui-seg').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); });
    });

    document.addEventListener('click', function (e) {
      if (!e.target || typeof e.target.closest !== 'function') return;
      var isBack = e.target.id === 'orbBack';
      var isDetailClose = e.target.id === 'orbDetailBack' || e.target.id === 'orbDetailReturn' ||
                          e.target.id === 'orbDetailBackdrop';
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

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (isAnimating) { cancelAnim(); return; }
      if (level === 'detail') { closeDetail(); return; }
      if (level === 'sub') goRoot();
    });

    bindDrag();
    window.addEventListener('resize', function () { measure(); requestFrame(); });
  }

  function boot() {
    buildStage();
    indexItems();
    measure();
    var saved = null;
    try { saved = localStorage.getItem(UI_KEY); } catch (e) { saved = null; }
    setView(saved === 'chat' ? 'chat' : 'orb', false);
    bind();
    applyProjection(0, 0);
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
