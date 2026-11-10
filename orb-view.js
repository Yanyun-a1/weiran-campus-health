/* 校园健康助手 · 小球视图 v5
 * CSS 3D 球面自转 + 逐帧深度处理 + 分裂/倒放 + 双 UI 切换。
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

  /* ================= 深度处理 =================
   * 主项就是规格里的公式：Z/R = cos(el) · cos(az + ry)
   * 另加 rotateX(rx) 的修正项，使上下拖动也有真实的深度变化。
   * t = (Z - Zmin) / (Zmax - Zmin)，取球面理论极值 Zmin = -R、Zmax = +R。
   * 每帧只写 CSS 变量：--ry / --rx / --t / --txt-op，
   * opacity、brightness、blur 全部由 .orb-skin 上的 calc() 自动求值。
   */
  var layer = 'major';
  function activeItems() {
    return layer === 'major' ? $$('.orb-major') : $$('.orb-minor.is-current');
  }
  function applyRotation(ry, rx) {
    var stage = $('#orbStage');
    if (!stage) return;
    stage.style.setProperty('--ry', ry.toFixed(3) + 'deg');
    stage.style.setProperty('--rx', rx.toFixed(3) + 'deg');
    var ryR = ry * D2R, rxR = rx * D2R;
    activeItems().forEach(function (it) {
      var az = Number(it.getAttribute('data-az')) * D2R;
      var el = Number(it.getAttribute('data-el')) * D2R;
      var z = Math.cos(ryR) * (-Math.sin(el) * Math.sin(rxR) +
                               Math.cos(el) * Math.cos(az) * Math.cos(rxR)) -
              Math.cos(el) * Math.sin(az) * Math.sin(ryR);
      var t = clamp((z + 1) / 2, 0, 1);
      it.style.setProperty('--t', t.toFixed(4));
      it.style.setProperty('--txt-op', t < 0.25 ? '0.35' : '1');
    });
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

  /* ================= 拖动自转（rAF 节流） ================= */
  var cur = { ry: 0, rx: 0 };
  var target = { ry: 0, rx: 0 };
  var mode = 'idle';                 // idle | drag | ease
  var rafId = null;
  var easeStart = 0, easeFrom = { ry: 0, rx: 0 };
  var suppressClick = false;

  function tick(ts) {
    rafId = null;
    if (mode === 'ease') {
      var p = Math.min(1, (ts - easeStart) / EASE_MS);
      var k = 1 - EASE(p);
      cur.ry = easeFrom.ry * k;
      cur.rx = easeFrom.rx * k;
      if (p >= 1) { mode = 'idle'; cur.ry = 0; cur.rx = 0; }
      applyRotation(cur.ry, cur.rx);
      if (mode !== 'idle') rafId = requestAnimationFrame(tick);
      return;
    }
    if (mode === 'drag') {
      cur.ry = target.ry; cur.rx = target.rx;
      applyRotation(cur.ry, cur.rx);
      return;                       // 下一次 pointermove 再请求帧
    }
    applyRotation(0, 0);
  }
  function requestFrame() { if (rafId === null) rafId = requestAnimationFrame(tick); }

  function bindDrag() {
    var scene = $('#orbScene');
    if (!scene) return;
    var start = null, moved = 0, dragging = false;

    scene.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      moved = 0; dragging = false;
      try { scene.setPointerCapture(e.pointerId); } catch (err) {}
    });

    window.addEventListener('pointermove', function (e) {
      if (!start) return;
      var dx = e.clientX - start.x, dy = e.clientY - start.y;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (!dragging && moved < 8) return;   // 位移 < 8px 判定为点击，不触发旋转
      dragging = true;
      mode = 'drag';
      scene.classList.add('dragging');
      /* 规格给的是 ry = -dx × 0.35。实机验证方向后按授权把符号改回正号：
       * 手指向左拖（dx<0）→ ry<0 → 左边的球退到背面变暗，右边的球转到前面变亮。 */
      target.ry = clamp(dx * 0.35, -38, 38);
      target.rx = clamp(dy * 0.22, -20, 20);
      requestFrame();                       // pointermove 里不直接改 DOM
    }, { passive: true });

    function finish() {
      if (!start) return;
      start = null;
      scene.classList.remove('dragging');
      if (dragging) {
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 80);
        easeFrom = { ry: cur.ry, rx: cur.rx };
        easeStart = performance.now();
        mode = 'ease';
        requestFrame();                     // 500ms 内缓动回 0deg / 0deg
      }
      dragging = false;
    }
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  }

  /* ================= 分裂 / 倒放 ================= */
  var picked = null;
  var detailOpen = false;

  function split(id) {
    if (layer === 'minor' && picked === id) { collapse(); return; }
    picked = id;
    var stage = $('#orbStage');
    $$('.orb-major').forEach(function (m) {
      if (m.getAttribute('data-orb') === id) m.setAttribute('data-picked', '1');
      else m.removeAttribute('data-picked');
    });
    $$('.orb-minor').forEach(function (m) {
      m.classList.toggle('is-current', m.getAttribute('data-group') === id);
    });
    stage.classList.remove('minor-out', 'minor-on');
    stage.classList.add('major-out');      // 大球 240ms 淡出 + translateZ 收/推
    layer = 'minor';
    document.querySelector('.page').classList.add('orb-split');
    $('#orbBack').hidden = false;
    $('#orbHint').textContent = '拖动旋转 · 点中球查看详情 · 点左上角返回';
    /* 重播中球入场动画（含 CSS 里的 220ms 延迟 + 420ms 主体） */
    $$('.orb-minor.is-current').forEach(function (m) {
      m.style.animation = 'none';
      void m.offsetWidth;
      m.style.animation = '';
    });
    void stage.offsetWidth;
    stage.classList.add('minor-on');
    applyRotation(cur.ry, cur.rx);
  }

  function collapse() {
    var stage = $('#orbStage');
    stage.classList.remove('minor-on', 'major-out'); // 大球 240ms 淡入 + push 归零
    stage.classList.add('minor-out');                // 中球 240ms 淡出 + blur
    layer = 'major';
    picked = null;
    document.querySelector('.page').classList.remove('orb-split');
    $('#orbBack').hidden = true;
    $('#orbHint').textContent = '拖动旋转大球 · 点一个球展开子模块';
    applyRotation(cur.ry, cur.rx);
    setTimeout(function () {
      if (layer !== 'major') return;
      stage.classList.remove('minor-out');
      $$('.orb-minor').forEach(function (m) { m.classList.remove('is-current'); });
      $$('.orb-major').forEach(function (m) { m.removeAttribute('data-picked'); });
      applyRotation(cur.ry, cur.rx);
    }, 270);
  }

  /* ================= 详情占位面板（保持 v4） ================= */
  function openDetail(name, desc) {
    var t = $('#orbDetailTitle'), d = $('#orbDetailDesc');
    if (t) t.textContent = name;
    if (d) d.textContent = desc;
    var bd = $('#orbDetailBackdrop'), p = $('#orbDetail');
    if (bd) bd.hidden = false;
    if (p) {
      p.hidden = false;
      p.classList.remove('open');
      void p.offsetWidth;
      requestAnimationFrame(function () { p.classList.add('open'); });
    }
    detailOpen = true;
    document.body.style.overflow = 'hidden';
  }
  function closeDetail() {
    var bd = $('#orbDetailBackdrop'), p = $('#orbDetail');
    if (bd) bd.hidden = true;
    if (p) { p.classList.remove('open'); p.hidden = true; }
    if (detailOpen) {
      detailOpen = false;
      if (!document.querySelector('.modal-backdrop:not([hidden])')) document.body.style.overflow = '';
    }
    collapse();
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
    if (v === 'orb' && detailOpen) closeDetail();
  }

  function bind() {
    $$('.ui-seg').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); });
    });

    document.addEventListener('click', function (e) {
      if (!e.target || typeof e.target.closest !== 'function') return;
      if (e.target.id === 'orbDetailBack' || e.target.id === 'orbDetailReturn' ||
          e.target.id === 'orbDetailBackdrop') { closeDetail(); return; }
      if (e.target.id === 'orbBack') { collapse(); return; }
    });

    var stage = $('#orbStage');
    stage.addEventListener('click', function (e) {
      if (suppressClick) { suppressClick = false; return; } // 拖动结束后的 click 不触发分裂
      if (detailOpen) return;
      var it = e.target.closest && e.target.closest('.orb-item');
      if (!it) return;
      if (it.classList.contains('orb-major')) split(it.getAttribute('data-orb'));
      else if (it.classList.contains('orb-minor')) {
        openDetail(it.getAttribute('data-mod'), it.getAttribute('data-desc'));
      }
    });
    stage.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var it = e.target.closest && e.target.closest('.orb-item');
      if (it) { e.preventDefault(); it.click(); }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var p = $('#orbDetail');
      if (p && !p.hidden) { closeDetail(); return; }
      if (layer === 'minor') collapse();
    });

    bindDrag();
  }

  function boot() {
    buildStage();
    var saved = null;
    try { saved = localStorage.getItem(UI_KEY); } catch (e) { saved = null; }
    setView(saved === 'chat' ? 'chat' : 'orb', false);
    bind();
    applyRotation(0, 0);
    /* 只读验收钩子：供无头浏览器直接指定角度，验证背面文字保护等分支 */
    window.__orbApply = applyRotation;
  }
  boot();
})();
