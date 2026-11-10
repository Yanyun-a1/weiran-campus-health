/* 校园健康助手 · 小球视图状态机 + 双 UI 切换
 * 只负责：视图显示/隐藏、球体分裂/收起、详情占位面板。
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

  var UI_KEY = 'xiaotong.ui.v1';

  var ORBS = [
    {
      id: 'food', name: '食品健康', hi: '#FFB27A', main: '#E85D3D', dark: '#B23A20',
      minis: [
        { name: '菜品营养', desc: '每道菜的热量、蛋白质、脂肪、钠含量与搭配建议' },
        { name: '饮食记录', desc: '今日三餐记录与营养摄入进度' },
        { name: '食堂安全', desc: '卫生评级、留样公示与问题反馈' }
      ]
    },
    {
      id: 'sleep', name: '作息健康', hi: '#8FA0FF', main: '#4E5FD9', dark: '#313FA6',
      minis: [
        { name: '作息记录', desc: '入睡与起床时间统计、睡眠时长趋势' },
        { name: '睡眠质量', desc: '睡眠评分与影响因素分析' },
        { name: '宿舍环境', desc: '噪音、光照、通风等影响睡眠的环境数据' }
      ]
    },
    {
      id: 'sport', name: '运动健康', hi: '#5FD9CF', main: '#2AA79B', dark: '#1B7A71',
      minis: [
        { name: '运动记录', desc: '运动类型、时长与消耗统计' },
        { name: '场馆器材', desc: '场地空闲状态与器材借用' },
        { name: '运动建议', desc: '按近期运动量给出锻炼与防损伤建议' }
      ]
    }
  ];

  /* 中球位置：桌面从大球向三个方向弹出；手机在大球下方呈三角形 */
  var OFFSETS = [
    { dx: -118, dy: -72, mx: -82, my: 92 },
    { dx: 118, dy: -72, mx: 82, my: 92 },
    { dx: 0, dy: 118, mx: 0, my: 158 }
  ];
  /* 三个中球明度依次相差约 10%，不抢大球视觉重心 */
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

  function slotHtml(orb) {
    var minis = orb.minis.map(function (m, i) {
      var d = DELTAS[i], o = OFFSETS[i];
      var vars = '--tx-d:' + o.dx + 'px;--ty-d:' + o.dy + 'px;' +
                 '--tx-m:' + o.mx + 'px;--ty-m:' + o.my + 'px;' +
                 '--m-hi:' + shade(orb.hi, d) + ';' +
                 '--m-main:' + shade(orb.main, d) + ';' +
                 '--m-dark:' + shade(orb.dark, d) + ';';
      return '<button class="orb-mini" type="button" data-mod="' + esc(m.name) + '" ' +
               'data-desc="' + esc(m.desc) + '" style="' + vars + '">' +
               '<span class="orb-mini-label">' + esc(m.name) + '</span></button>';
    }).join('');
    var vars = '--c-hi:' + orb.hi + ';--c-main:' + orb.main + ';--c-dark:' + orb.dark + ';';
    return '<div class="orb-slot" data-orb="' + orb.id + '" style="' + vars + '">' +
             minis +
             '<button class="orb-main" type="button" data-orb-main="' + orb.id + '" ' +
               'aria-label="' + esc(orb.name) + '"></button>' +
             '<div class="orb-label">' + esc(orb.name) + '</div>' +
           '</div>';
  }

  function buildStage() {
    var top = $('#orbRowTop'), bottom = $('#orbRowBottom');
    if (!top || !bottom) return;
    top.innerHTML = slotHtml(ORBS[0]);
    bottom.innerHTML = slotHtml(ORBS[1]) + slotHtml(ORBS[2]);
  }

  var picked = null;
  var detailOpen = false;

  function resetSplit() {
    picked = null;
    var stage = $('#orbStage');
    if (stage) stage.classList.remove('split');
    $$('.orb-slot').forEach(function (s) { s.classList.remove('active', 'dimmed', 'hovered'); });
    var r = $('#orbReset'); if (r) r.hidden = true;
    var h = $('#orbHint'); if (h) h.textContent = '点一个大球，展开它的三个子模块';
  }

  function splitOrb(id) {
    var stage = $('#orbStage');
    if (!stage) return;
    if (picked === id) { resetSplit(); return; } // 再点一次当前大球即收起
    picked = id;
    stage.classList.add('split');
    $$('.orb-slot').forEach(function (s) {
      var on = s.getAttribute('data-orb') === id;
      s.classList.toggle('active', on);
      s.classList.toggle('dimmed', !on);
      s.classList.remove('hovered');
    });
    // 重播弹出动画（从一个大球切到另一个时也重新弹出）
    $$('.orb-slot.active .orb-mini').forEach(function (m) {
      m.style.animation = 'none';
      void m.offsetWidth;
      m.style.animation = '';
    });
    var r = $('#orbReset'); if (r) r.hidden = false;
    var h = $('#orbHint'); if (h) h.textContent = '点中球查看详情 · 点「收起」或再点大球返回';
  }

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
    resetSplit(); // 中球收起、大球恢复
  }

  function setView(v, save) {
    if (v !== 'orb' && v !== 'chat') v = 'orb';
    var ov = $('#orbView'), cv = $('#chatView'), ib = $('#identityBar');
    if (ov) ov.hidden = (v !== 'orb');
    if (cv) cv.hidden = (v !== 'chat');
    if (ib) ib.hidden = (v !== 'chat'); // 身份选择器属于对话视图
    $$('.ui-seg').forEach(function (b) {
      var on = b.getAttribute('data-view') === v;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (save) { try { localStorage.setItem(UI_KEY, v); } catch (e) {} }
    if (v === 'orb') closeDetail();
  }

  function bind() {
    $$('.ui-seg').forEach(function (b) {
      b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); });
    });

    document.addEventListener('click', function (e) {
      if (!e.target || typeof e.target.closest !== 'function') return;
      if (e.target.id === 'orbDetailBack' || e.target.id === 'orbDetailReturn' ||
          e.target.id === 'orbDetailBackdrop') { closeDetail(); return; }
      if (e.target.id === 'orbReset') { resetSplit(); return; }
      var main = e.target.closest('[data-orb-main]');
      if (main) { splitOrb(main.getAttribute('data-orb-main')); return; }
      var mini = e.target.closest('.orb-mini');
      if (mini) {
        if (!mini.closest('.orb-slot.active')) return; // 预览态不可点
        openDetail(mini.getAttribute('data-mod'), mini.getAttribute('data-desc'));
      }
    });

    $$('.orb-main').forEach(function (b) {
      var slot = b.closest('.orb-slot');
      b.addEventListener('mouseenter', function () {
        var st = $('#orbStage');
        if (st && !st.classList.contains('split')) slot.classList.add('hovered');
      });
      b.addEventListener('mouseleave', function () { slot.classList.remove('hovered'); });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var p = $('#orbDetail');
      if (p && !p.hidden) { closeDetail(); return; }
      var st = $('#orbStage');
      if (st && st.classList.contains('split')) resetSplit();
    });
  }

  function boot() {
    buildStage();
    var saved = null;
    try { saved = localStorage.getItem(UI_KEY); } catch (e) { saved = null; }
    setView(saved === 'chat' ? 'chat' : 'orb', false);
    bind();
  }
  boot();
})();
