/* 校园健康助手 · 登录 / 隐私同意 / 推荐弹窗（v12）
 * 三道门全部用 localStorage 记忆；小球视图与对话视图的内部逻辑不被本文件改动。
 * 仅暴露 window.XT_CONSENT 供 app.js 的「健康数据」问数做授权门控。
 */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  /* 四个演示账号：学号 → 身份 id（与 campus-data.js 的 c1~c4 对应）。
   * 全部为模拟编号，不对应任何真实学号。 */
  var ACCOUNTS = [
    { sid: '20260101', pwd: '123456', id: 'c1', name: '同学A', cls: '2026级1班' },
    { sid: '20260102', pwd: '123456', id: 'c2', name: '同学B', cls: '2026级1班' },
    { sid: '20260201', pwd: '123456', id: 'c3', name: '同学C', cls: '2026级2班' },
    { sid: '20260202', pwd: '123456', id: 'c4', name: '同学D', cls: '2026级2班' }
  ];
  var LS_LOGIN = 'xiaotong.login.v1';
  var LS_CONSENT = 'xiaotong.consent.v1';
  var LS_RECO = 'xiaotong.reco.v1';

  var AUTH_LABEL = { diet: '饮食记录', sleep: '作息记录', exercise: '运动记录' };
  var AUTH_CATS = ['diet', 'sleep', 'exercise'];

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- 同意书状态 ---------- */
  function loadConsent() {
    var raw = lsGet(LS_CONSENT);
    if (!raw) return null;
    try {
      var o = JSON.parse(raw);
      return { diet: !!o.diet, sleep: !!o.sleep, exercise: !!o.exercise };
    } catch (e) { return null; }
  }
  var consent = loadConsent();

  function saveConsent(c) {
    c = c || { diet: false, sleep: false, exercise: false };
    lsSet(LS_CONSENT, JSON.stringify({ diet: !!c.diet, sleep: !!c.sleep, exercise: !!c.exercise }));
  }

  var XT = {
    state: function () { return consent; },
    isAuth: function (cat) { return !!(consent && consent[cat]); },
    set: function (c) {
      consent = { diet: !!c.diet, sleep: !!c.sleep, exercise: !!c.exercise };
      saveConsent(consent);
      renderOrbConsent();
    }
  };
  window.XT_CONSENT = XT;

  /* ---------- 身份同步到现有选择器 ---------- */
  function applyIdentity(id) {
    var sel = $('#identitySelect');
    if (!sel) return;
    sel.value = id;
    if (typeof sel.dispatchEvent === 'function') {
      try { sel.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
    }
    lsSet('xiaotong.identity.v1', id);
  }

  /* ---------- 小球视图授权条（附加 DOM，不触及 orb-view.js） ---------- */
  function renderOrbConsent() {
    var box = $('#orbConsent');
    if (!box) return;
    if (!consent) { box.innerHTML = ''; box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = '<span class="oc-label">数据授权</span>' + AUTH_CATS.map(function (c) {
      var on = !!consent[c];
      return '<span class="oc-chip' + (on ? ' on' : '') + '">' +
        (on ? '已授权' : '未授权') + ' · ' + AUTH_LABEL[c] + '</span>';
    }).join('');
  }

  /* ---------- 登录 ---------- */
  var loginPage, errEl, sidInput, pwdInput;
  function showLogin() {
    loginPage.hidden = false;
    document.body.classList.remove('logged-in');
  }
  function hideLogin() { loginPage.hidden = true; }
  function doLogin() {
    var sid = (sidInput.value || '').trim();
    var pwd = pwdInput.value || '';
    var acc = null;
    for (var i = 0; i < ACCOUNTS.length; i++) if (ACCOUNTS[i].sid === sid) { acc = ACCOUNTS[i]; break; }
    if (!acc || acc.pwd !== pwd) {
      errEl.textContent = '学号或密码不正确';
      errEl.hidden = false;
      return;
    }
    errEl.hidden = true;
    lsSet(LS_LOGIN, acc.id);
    document.body.classList.add('logged-in');
    applyIdentity(acc.id);
    hideLogin();
    afterAuth();
  }
  function logout() {
    try { localStorage.removeItem(LS_LOGIN); } catch (e) {}
    document.body.classList.remove('logged-in');
    showLogin();
  }

  /* ---------- 同意书 ---------- */
  var consentModal, consentIsInitial = false, cToggles = {};
  function readToggles() {
    return {
      diet: !!(cToggles.diet && cToggles.diet.checked),
      sleep: !!(cToggles.sleep && cToggles.sleep.checked),
      exercise: !!(cToggles.exercise && cToggles.exercise.checked)
    };
  }
  function refreshAgreeBtn() {
    var t = readToggles();
    var btn = $('#consentAgree');
    if (btn) btn.disabled = !(t.diet || t.sleep || t.exercise);
  }
  function openConsent(initial) {
    consentIsInitial = !!initial;
    var cur = consent || { diet: false, sleep: false, exercise: false };
    AUTH_CATS.forEach(function (k) { if (cToggles[k]) cToggles[k].checked = !!cur[k]; });
    refreshAgreeBtn();
    consentModal.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeConsent() {
    consentModal.hidden = true;
    document.body.style.overflow = '';
  }
  function agreeConsent() {
    var c = readToggles();
    if (!(c.diet || c.sleep || c.exercise)) return;
    XT.set(c);
    closeConsent();
    if (consentIsInitial) afterConsent();
  }

  /* ---------- 推荐弹窗（即 #introModal，顶栏「介绍」亦打开它） ---------- */
  function openReco() {
    var m = $('#introModal');
    if (!m) return;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
    var sc = m.querySelector('.reco-scroll');
    if (sc) sc.scrollTop = 0;
  }
  function closeReco() {
    var m = $('#introModal');
    if (m) m.hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------- 流程编排 ---------- */
  function afterAuth() {
    renderOrbConsent();
    if (!consent) { openConsent(true); }
    else { maybeReco(); }
  }
  function afterConsent() { maybeReco(); }
  function maybeReco() {
    if (lsGet(LS_RECO)) return;
    lsSet(LS_RECO, '1');
    openReco();
  }

  /* ---------- 初始化 ---------- */
  function init() {
    loginPage = $('#loginPage');
    errEl = $('#loginErr');
    sidInput = $('#loginSid');
    pwdInput = $('#loginPwd');
    consentModal = $('#consentModal');
    AUTH_CATS.forEach(function (k) { cToggles[k] = $('#consent_' + k); });

    // 登录交互
    var form = $('#loginForm');
    if (form) form.addEventListener('submit', function (e) { e.preventDefault(); doLogin(); });
    [].forEach.call(document.querySelectorAll('.demo-acc'), function (b) {
      b.addEventListener('click', function () {
        sidInput.value = b.getAttribute('data-sid');
        pwdInput.value = b.getAttribute('data-pwd');
        errEl.hidden = true;
      });
    });

    // 同意书交互
    AUTH_CATS.forEach(function (k) {
      if (cToggles[k]) cToggles[k].addEventListener('change', refreshAgreeBtn);
    });
    var allBtn = $('#consentAll');
    if (allBtn) allBtn.addEventListener('click', function () {
      AUTH_CATS.forEach(function (k) { if (cToggles[k]) cToggles[k].checked = true; });
      refreshAgreeBtn();
    });
    var agreeBtn = $('#consentAgree');
    if (agreeBtn) agreeBtn.addEventListener('click', agreeConsent);
    if (consentModal) consentModal.addEventListener('click', function (e) {
      if (e.target === consentModal && !consentIsInitial) closeConsent();
    });

    // 顶栏
    var priv = $('#privacyBtn'); if (priv) priv.addEventListener('click', function () { openConsent(false); });
    var out = $('#logoutBtn'); if (out) out.addEventListener('click', logout);

    // 推荐弹窗按钮
    var start = $('#recoStart'); if (start) start.addEventListener('click', closeReco);
    var more = $('#recoMore'); if (more) more.addEventListener('click', function () { closeReco(); openConsent(false); });
    var close = $('#recoClose'); if (close) close.addEventListener('click', closeReco);

    renderOrbConsent();

    // 启动：依据 localStorage 决定挡在哪一步
    var loggedId = lsGet(LS_LOGIN);
    if (loggedId) {
      document.body.classList.add('logged-in');
      applyIdentity(loggedId);
      afterAuth();
    } else {
      showLogin();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
