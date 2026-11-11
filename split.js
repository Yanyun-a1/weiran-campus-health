/* 校园健康助手 · v14 底部抽屉 + 小球重算触发
 * 职责：手机端底部抽屉的点击 / 拖拽展开收起（仅把手区起手）、localStorage 记忆、
 *      以及监听右栏尺寸变化触发 orb-view 的 relayout()。
 * 不触碰小球投影公式 / 玻璃质感 / 三段式动画；桌面端不启用抽屉。
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var DRAWER_KEY = 'xiaotong.drawer.v1';
  var pane = $('#chatPane');
  var handle = $('#drawerHandle');
  var orbPane = $('#orbPane');
  var mq = window.matchMedia ? window.matchMedia('(max-width: 1023px)') : { matches: false, addListener: function () {} };
  var isMobile = function () { return mq.matches; };

  function setOpen(open) {
    if (!pane) return;
    if (isMobile()) {
      pane.classList.toggle('drawer-open', open);
      if (orbPane) orbPane.classList.toggle('orb-shrunk', open);   // 小球同步缩小上移
    }
    try { localStorage.setItem(DRAWER_KEY, open ? '1' : '0'); } catch (e) {}
  }
  function isOpen() { return !!(pane && pane.classList.contains('drawer-open')); }
  function openDrawer() { if (isMobile()) setOpen(true); }
  function closeDrawer() { setOpen(false); }

  /* 跨断点时清理抽屉态，避免桌面端残留 orb-shrunk 缩放 / drawer-open */
  function syncMode() {
    if (!isMobile()) {
      if (pane) pane.classList.remove('drawer-open', 'no-trans');
      if (orbPane) orbPane.classList.remove('orb-shrunk');
    } else {
      var saved = null;
      try { saved = localStorage.getItem(DRAWER_KEY); } catch (e) { saved = null; }
      if (saved === '1') setOpen(true);
    }
  }

  /* 恢复记忆：手机端若上次展开则展开 */
  var saved0 = null;
  try { saved0 = localStorage.getItem(DRAWER_KEY); } catch (e) { saved0 = null; }
  if (saved0 === '1' && isMobile()) setOpen(true);
  if (mq.addEventListener) mq.addEventListener('change', syncMode);

  /* 点击把手：胶囊 → 展开 + 发送（发送由 app.js 的 data-q 处理）；
   * 非胶囊的切换统一交给 pointerup（onUp）处理，这里不再二次切换，避免抵消。 */
  if (handle) {
    handle.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.dh-pill')) { openDrawer(); return; }
    });
  }

  /* 拖拽：仅从把手区起手（实现要点 6）；用 rAF 节流（要点 5）；松手超 30% 展开 / 回弹 */
  var dragging = false, pid = null, startY = 0, baseOff = 0, lastOff = 0, rafPending = false, lastEvt = null;
  function paneH() { return pane ? pane.offsetHeight : 0; }
  function applyTransform(px) { if (pane) pane.style.transform = (px === '' || px == null) ? '' : 'translateY(' + px + 'px)'; }

  function onDown(e) {
    if (!isMobile() || !pane) return;
    if (e.target.closest && e.target.closest('.dh-pill')) return;   // 胶囊自行处理
    if (e.button != null && e.button !== 0) return;
    dragging = true; pid = e.pointerId; startY = e.clientY;
    baseOff = isOpen() ? 0 : (paneH() - 52);
    lastOff = baseOff;
    pane.classList.add('no-trans');                                 // 拖拽期间关闭过渡，跟随手指
    try { handle.setPointerCapture(e.pointerId); } catch (err) {}
    document.body.classList.add('no-select');
    e.preventDefault();
  }
  function onMove(e) {
    if (!dragging || e.pointerId !== pid) return;
    lastEvt = e;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      if (!dragging) return;                 // onUp 已结束拖拽：丢弃这次待执行的重绘，避免回写陈旧 transform 覆盖开合终态
      if (!lastEvt) return;
      var dy = lastEvt.clientY - startY;
      var target = Math.min(paneH() - 52, Math.max(0, baseOff + dy)); // 限幅在 [0, H-52]
      lastOff = target;
      applyTransform(target);
    });
  }
  function onUp(e) {
    if (!dragging) return;
    dragging = false; pid = null;
    rafPending = false;                                              // 丢弃可能尚未执行的重绘帧
    pane.classList.remove('no-trans');                              // 恢复过渡，回弹 / 展开有动画
    applyTransform('');                                              // 清除内联，交还给 class 终态
    document.body.classList.remove('no-select');
    var moved = lastOff - baseOff;
    var H = paneH();
    var tapped = Math.abs(moved) < 8;                                // 位移极小视为点击而非拖拽
    var shouldOpen;
    if (tapped) shouldOpen = !isOpen();                              // 点击 = 切换
    else if (isOpen()) shouldOpen = moved < 0.3 * H;                 // 展开态向下拖 >30% → 收起
    else shouldOpen = moved < -0.3 * H;                              // 收起态向上拖 >30% → 展开
    setOpen(shouldOpen);
  }
  if (handle) {
    handle.addEventListener('pointerdown', onDown);
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  /* 小球重算：右栏尺寸变化 → orb-view.relayout()（实现要点 3） */
  function relayout() { if (window.XT_ORB && window.XT_ORB.recompute) window.XT_ORB.recompute(); }
  if (orbPane && window.ResizeObserver) {
    new ResizeObserver(function () { relayout(); }).observe(orbPane);
  }
  window.addEventListener('resize', function () { syncMode(); relayout(); });
  requestAnimationFrame(relayout);

  window.XT_DRAWER = { open: openDrawer, close: closeDrawer, isOpen: isOpen };
})();
