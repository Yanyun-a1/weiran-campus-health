/* ============================================================
   v26 · 手机端把手条「首次引导」动效
   职责单一：进入主界面 1.5s 后给 #drawerHandle 加一次 400ms 的视觉位移 class。
   不修改 #chatPane 的 transform、不改变 XT_DRAWER 状态、不介入 pointer 拖拽，
   抽屉展开 / 收起 / 拖拽逻辑完全沿用 split.js。
   sessionStorage 记录本次会话已播，同会话刷新不重播。
   ============================================================ */
(function () {
  'use strict';

  var KEY = 'xiaotong.handleHint.v1';
  var handle = document.getElementById('drawerHandle');
  var mqMobile = window.matchMedia ? window.matchMedia('(max-width: 1023px)')
    : { matches: false, addEventListener: function () {} };

  /* 运行时可观测状态（供 E2E 断言，不参与业务逻辑） */
  var state = { ready: false, scheduled: false, played: 0, skipped: 0, suppressed: false };
  window.__xtHandleHint = state;
  if (!handle) return;

  var scheduled = false;

  function lsPlayed() {
    try { return sessionStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function markPlayed() {
    try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  }
  /* 主界面就绪 = 已登录 且 登录 / 知情同意 / 推荐 三个遮罩全部关闭 */
  function mainReady() {
    var lp = document.getElementById('loginPage');
    var cm = document.getElementById('consentModal');
    var im = document.getElementById('introModal');
    return document.body.classList.contains('logged-in') &&
      (!lp || lp.hidden) && (!cm || cm.hidden) && (!im || im.hidden);
  }
  function drawerOpen() {
    if (window.XT_DRAWER && typeof window.XT_DRAWER.isOpen === 'function') return window.XT_DRAWER.isOpen();
    var p = document.getElementById('chatPane');
    return !!(p && p.classList.contains('drawer-open'));
  }
  function stopHint() {
    if (handle.classList.contains('is-hinting')) handle.classList.remove('is-hinting');
  }

  function fire() {
    if (!mqMobile.matches || !mainReady()) return;
    if (drawerOpen()) { state.skipped++; return; }   /* 抽屉已展开时不播 */
    if (lsPlayed()) return;
    markPlayed();
    state.played++;
    stopHint();
    void handle.offsetWidth;                          /* 强制重排，保证动画可重放 */
    handle.classList.add('is-hinting');
    setTimeout(stopHint, 460);                          /* 动画 400ms，兜底移除 */
  }

  function schedule() {
    if (scheduled) return;
    if (!mqMobile.matches || !mainReady()) return;
    if (lsPlayed()) { state.suppressed = true; scheduled = true; return; }
    scheduled = true;
    state.scheduled = true;
    setTimeout(fire, 1500);
  }

  handle.addEventListener('animationend', function (e) {
    if (e.animationName === 'handle-hint') stopHint();
  });
  /* 拖拽 / 点击把手起手即撤掉引导位移，避免与手势视觉叠加 */
  handle.addEventListener('pointerdown', stopHint, true);

  function onReady() { state.ready = true; schedule(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

  /* 门禁是异步走完的：观察遮罩 hidden 与 body class 的变化，首个就绪时刻触发调度 */
  if (window.MutationObserver) {
    var mo = new MutationObserver(function () { schedule(); });
    ['loginPage', 'consentModal', 'introModal'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['hidden'] });
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  /* 桌面 → 手机 跨断点时补一次调度（桌面进入不消耗首次引导） */
  if (mqMobile.addEventListener) mqMobile.addEventListener('change', function () { schedule(); });
})();
