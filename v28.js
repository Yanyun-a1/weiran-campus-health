/* ============================================================
   v28 · 桌面主文案的两件事：宽度自适应 + 空隙内 flex 垂直居中
   只读写 .hero-slogan 的 fontSize / is-solid 与 .hero-slogan-wrap 的
   --hero-top / --hero-gap 两个变量。
   不碰小球（投影/动画/质感）、抽屉、把手条、对话、问答与预约。
   ============================================================ */
(function () {
  var el = document.querySelector('.hero-slogan');
  var wrap = document.querySelector('.hero-slogan-wrap');
  if (!el || !wrap) return;
  var mq = window.matchMedia('(min-width: 1024px)');

  /* 40px 基准；容器不够宽时按给定公式自动降字号，目标宽度占容器 92%–96%。
     窗口 <1200px 时字号不低于 16px；到下限仍放不下就切纯色，保持单行不换行。 */
  function fit() {
    if (!mq.matches) return;                       /* 手机端：CSS display:none */
    var box = el.parentElement.getBoundingClientRect().width;
    if (!box) return;
    el.classList.remove('is-solid');
    el.style.fontSize = '40px';
    var need = el.scrollWidth;
    if (need > box * 0.96) {
      el.style.fontSize = Math.floor(40 * (box * 0.96 / need)) + 'px';
    }
    var fs = parseFloat(el.style.fontSize) || 40;
    if (window.innerWidth < 1200 && fs < 16) {
      fs = 16;
      el.style.fontSize = fs + 'px';
    }
    if (el.scrollWidth > box * 0.96) el.classList.add('is-solid');
  }

  /* 顶栏底部 → 球舞台圆顶（.orb-shell 外接圆顶）这段空隙，
     用 CSS 变量交给 .hero-slogan-wrap 的 flex 做垂直居中，不写死像素。 */
  function place() {
    if (!mq.matches) return;
    var bar = document.querySelector('.topbar');
    var shell = document.querySelector('.orb-shell');
    var pane = document.querySelector('#orbPane');
    if (!bar || !shell || !pane) return;
    var b = bar.getBoundingClientRect();
    var s = shell.getBoundingClientRect();
    var p = pane.getBoundingClientRect();
    if (!b.height || !s.height || !p.height) return;   /* 门禁 / 舞台未就绪 */
    var top = Math.max(0, b.bottom - p.top);
    var gap = Math.max(0, s.top - b.bottom);
    wrap.style.setProperty('--hero-top', top.toFixed(1) + 'px');
    wrap.style.setProperty('--hero-gap', gap.toFixed(1) + 'px');
  }

  function run() { place(); fit(); }
  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('resize', run);
  window.addEventListener('load', run);
  if (mq.addEventListener) mq.addEventListener('change', run);
  else if (mq.addListener) mq.addListener(run);

  /* 门禁异步完成、云 SDK 就绪、relayout 写入 --shell-d 都晚于本脚本 */
  setTimeout(run, 420);
  setTimeout(run, 1500);
  if (window.MutationObserver) {
    var timer = null;
    var mo = new MutationObserver(function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () { timer = null; run(); }, 120);
    });
    ['body', '#orbPane'].forEach(function (sel) {
      var node = sel === 'body' ? document.body : document.querySelector(sel);
      if (node) mo.observe(node, { attributes: true, attributeFilter: ['class', 'hidden'] });
    });
  }
  if (window.ResizeObserver && document.querySelector('#orbPane')) {
    new ResizeObserver(run).observe(document.querySelector('#orbPane'));
  }
})();
