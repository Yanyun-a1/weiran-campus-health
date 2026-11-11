/* ============================================================
   v27 · 手机端静态棱镜文案的几何避让
   只读写 #prismMobileWrap 自身的 top / class：
   - 不调用 XT_DRAWER、不改 #chatPane / #orbPane 的 transform、不介入拖拽；
   - 只读 .topbar 与 .orb-shell 的 rect（不改小球任何属性）；
   - 桌面端与抽屉展开态直接交还 CSS 处理。
   「顶栏下方 60px」优先；若会碰到球舞台，改为顶栏底→球舞台顶空隙的
   垂直中点；空隙连一行文字都放不下时淡出，保证不压顶栏、不压球舞台。
   ============================================================ */
(function () {
  var wrap = document.getElementById('prismMobileWrap');
  if (!wrap) return;
  var mq = window.matchMedia('(max-width: 1023px)');

  function place() {
    wrap.classList.remove('is-avoid-hidden');
    wrap.style.top = '';
    if (!mq.matches) return;                              /* 桌面：CSS display:none */
    var bar = document.querySelector('.topbar');
    var shell = document.querySelector('.orb-shell');
    var chat = document.querySelector('.pane-chat');
    if (!bar || !shell) return;
    if (chat && chat.classList.contains('drawer-open')) return;  /* 展开态：CSS 淡出 */

    var b = bar.getBoundingClientRect(), s = shell.getBoundingClientRect();
    if (!b.height || !s.height) return;                  /* 门禁未就绪，沿用 CSS 默认 */
    var bottom = b.bottom, shellTop = s.top, h = wrap.offsetHeight || 28;
    var gap = shellTop - bottom;
    if (gap < h + 8) { wrap.classList.add('is-avoid-hidden'); return; }

    var want = bottom + 60;
    if (want + h + 4 <= shellTop) { wrap.style.top = want + 'px'; return; }
    wrap.style.top = Math.round(Math.max(bottom + 4, (bottom + shellTop) / 2 - h / 2)) + 'px';
  }

  place();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', place);
  window.addEventListener('resize', place);
  window.addEventListener('load', place);
  if (mq.addEventListener) mq.addEventListener('change', place);
  else if (mq.addListener) mq.addListener(place);

  /* 抽屉开合 / 门禁完成 / 舞台缩放都会改 class。
     展开与收起的 320ms transform 过渡期间 .orb-shell 的 rect 是中间态，
     此刻测量会误判空隙，所以只延时到过渡结束后重算；即时显隐交给 CSS :has() 规则。 */
  var reflowTimer = null;
  function reflow() {
    if (reflowTimer) clearTimeout(reflowTimer);
    reflowTimer = setTimeout(function () { reflowTimer = null; place(); }, 380);
  }
  if (window.MutationObserver) {
    var mo = new MutationObserver(reflow);
    ['body', '.pane-chat', '.pane-orb'].forEach(function (sel) {
      var el = sel === 'body' ? document.body : document.querySelector(sel);
      if (el) mo.observe(el, { attributes: true, attributeFilter: ['class', 'hidden'] });
    });
  }
  /* 云 SDK / --xt-topbar-h 可能晚于本脚本写入，补两次延时重算 */
  setTimeout(place, 400);
  setTimeout(place, 1400);
})();
