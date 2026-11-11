/* v12 · 模拟登录 / 隐私同意 / 推荐弹窗 专项验收
 * 用法：node e2e-v12.js [URL]   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 产出五张图：登录页 / 同意书(未勾选) / 同意书(勾选后) / 推荐弹窗桌面 / 推荐弹窗手机
 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const DIR = 'E:/gzkj/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

async function main() {
  let targets = await (await fetch(CDP + '/json/list')).json();
  let page = targets.find(t => t.type === 'page' && t.url.indexOf('8123') >= 0) || targets.find(t => t.type === 'page');
  if (!page) { await fetch(CDP + '/json/new?' + encodeURIComponent(URL_), { method: 'PUT' }); await sleep(900); targets = await (await fetch(CDP + '/json/list')).json(); page = targets.find(t => t.type === 'page'); }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let seq = 0; const pending = new Map(); const jsErrors = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      jsErrors.push((d.text || '') + ' ' + ((d.exception && d.exception.description) || ''));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      jsErrors.push('console: ' + m.params.args.map(a => a.value || a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise(res => { const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const click = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO';e.click();return 'OK'})()`);
  const setVal = async (sel, v) => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO';e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));return 'OK'})()`);
  const hidden = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return !e||e.hidden})()`);
  const shot = async (file, w, h) => {
    if (w) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile_ }); await sleep(360); await ev('window.scrollTo(0,0)'); }
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  const setViewport = async (w, h, mobile) => { mobile_ = mobile; await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 }); await sleep(420); };
  let mobile_ = false;
  async function reset(w, h, mobile) {
    await setViewport(w, h, mobile);
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.navigate', { url: URL_ }); await sleep(1500);
    await ev(`(function(){try{localStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1900);
  }
  const overflow = async () => ev(`(function(){var d=document.documentElement;return d.scrollWidth-d.clientWidth})()`);

  /* ===== A. 首访 → 登录页 ===== */
  await reset(1440, 1000, false);
  const loginShown = !(await hidden('#loginPage'));
  const appBlocked = loginShown && (await hidden('#consentModal')) && (await hidden('#introModal'));
  check('验收1 · 首访显示登录页，主界面被挡住（小球/对话不可达）', appBlocked, { loginShown, consentHidden: await hidden('#consentModal'), recoHidden: await hidden('#introModal') });
  const sz = await shot('v12-login.png', 1440, 1000);
  console.log('SHOT  v12-login.png  ' + sz + ' bytes');

  /* ===== B. 错误账号密码 ===== */
  await setVal('#loginSid', '00000000');
  await setVal('#loginPwd', '111');
  await click('#loginBtn');
  await sleep(400);
  const errTxt = await ev(`(function(){var e=document.querySelector('#loginErr');return e?{hidden:e.hidden,text:e.textContent}:null})()`);
  const stillLogin = !(await hidden('#loginPage'));
  check('验收3 · 错误账号密码红字提示且不跳转', errTxt && errTxt.hidden === false && errTxt.text.indexOf('不正确') >= 0 && stillLogin, errTxt);

  /* ===== C. 演示账号登录 → 同意书（未勾选） ===== */
  await click('.demo-acc[data-sid="20260101"]');
  await sleep(150);
  const demoFill = await ev(`(function(){return {sid:document.querySelector('#loginSid').value,pwd:document.querySelector('#loginPwd').value}})()`);
  await click('#loginBtn');
  await sleep(500);
  const consentShown = !(await hidden('#consentModal'));
  const loginGone = await hidden('#loginPage');
  const identity = await ev(`(function(){var s=document.querySelector('#identitySelect');return s?s.value:null})()`);
  const togglesOff = await ev(`(function(){return ['diet','sleep','exercise'].map(function(k){return document.querySelector('#consent_'+k).checked})})()`);
  const agreeDisabled = await ev(`(function(){return document.querySelector('#consentAgree').disabled})()`);
  check('验收2 · 演示账号登录后身份切到同学A(c1)且进入同意书', consentShown && loginGone && identity === 'c1', { identity, demoFill });
  check('验收5 · 同意书三项默认全部未勾选', togglesOff && togglesOff.every(v => v === false), togglesOff);
  check('验收6 · 一项都不勾时「同意并继续」置灰', agreeDisabled === true, { agreeDisabled });
  const sz2 = await shot('v12-consent-empty.png', 1440, 1400);
  console.log('SHOT  v12-consent-empty.png  ' + sz2 + ' bytes');

  /* ===== D. 勾选一项 → 可继续 ===== */
  await click('#consent_diet');
  await sleep(150);
  const togglesOne = await ev(`(function(){return ['diet','sleep','exercise'].map(function(k){return document.querySelector('#consent_'+k).checked})})()`);
  const agreeEnabled = await ev(`(function(){return !document.querySelector('#consentAgree').disabled})()`);
  check('验收7 · 勾选一项后「同意并继续」可点', togglesOne[0] === true && agreeEnabled === true, { togglesOne, agreeEnabled });
  const sz3 = await shot('v12-consent-checked.png', 1440, 1400);
  console.log('SHOT  v12-consent-checked.png  ' + sz3 + ' bytes');

  /* ===== E. 同意并继续 → 主界面 + 推荐弹窗 ===== */
  await click('#consentAgree');
  await sleep(600);
  const recoShown = !(await hidden('#introModal'));
  const consentGone = await hidden('#consentModal');
  const loginStillGone = await hidden('#loginPage');
  const recoGrid = await ev(`(function(){var g=document.querySelector('.reco-grid');var c=document.querySelector('.reco-copy');var v=document.querySelector('.reco-visual');if(!g||!c||!v)return null;var gb=g.getBoundingClientRect(),cb=c.getBoundingClientRect(),vb=v.getBoundingClientRect();return {cols:getComputedStyle(g).gridTemplateColumns, copyRight:Math.round(cb.right), visualLeft:Math.round(vb.left), copyBottom:Math.round(cb.bottom), visualTop:Math.round(vb.top)}})()`);
  // 桌面双栏：视觉列在文案列右侧
  const twoCol = recoGrid && recoGrid.visualLeft >= recoGrid.copyRight - 4;
  check('验收7/8 · 同意并继续进入主界面并自动弹出推荐弹窗', recoShown && consentGone && loginStillGone, { recoShown, consentGone, loginStillGone });
  check('验收8 · 推荐弹窗桌面双栏（视觉在文案右侧）', twoCol, recoGrid);
  const sz4 = await shot('v12-reco-desktop.png', 1440, 980);
  console.log('SHOT  v12-reco-desktop.png  ' + sz4 + ' bytes');

  /* ===== F. 对话视图 + 未授权门控 ===== */
  await click('#recoStart');           // 关闭推荐弹窗
  await sleep(300);
  await click('button.ui-seg[data-view="chat"]');   // 切到对话视图
  await sleep(400);
  const chatVisible = !(await hidden('#chatView'));
  await setVal('#userInput', '这周睡眠质量如何');
  await click('#sendBtn');
  await sleep(700);
  const sleepMsg = await ev(`(function(){var m=document.querySelectorAll('#chatLog .msg-bot');var last=m[m.length-1];return last?last.innerText:''})()`);
  const isUnauth = sleepMsg.indexOf('未授权') >= 0;
  check('验收11(一) · 未授权数据类别在对话视图显示「未授权」', chatVisible && isUnauth, { chatVisible, hasUnauth: isUnauth });

  /* ===== G. 隐私入口改授权 → 数据可显示 ===== */
  await click('#privacyBtn');
  await sleep(400);
  const privacyOpen = !(await hidden('#consentModal'));
  const dietChecked = await ev(`(function(){return document.querySelector('#consent_diet').checked})()`);
  const sleepUnchecked = await ev(`(function(){return !document.querySelector('#consent_sleep').checked})()`);
  await click('#consent_sleep');
  await sleep(150);
  await click('#consentAgree');
  await sleep(500);
  const consentClosed = await hidden('#consentModal');
  await setVal('#userInput', '这周睡眠质量如何');
  await click('#sendBtn');
  await sleep(800);
  const sleepMsg2 = await ev(`(function(){var m=document.querySelectorAll('#chatLog .msg-bot');var last=m[m.length-1];return last?last.innerText:''})()`);
  const showsData = sleepMsg2.indexOf('平均睡眠') >= 0 || sleepMsg2.indexOf('近 7 天') >= 0;
  check('验收11 · 顶栏「隐私」重新打开同意书并改授权后，问数数据随授权变化', privacyOpen && dietChecked && sleepUnchecked && consentClosed && showsData, { privacyOpen, dietChecked, sleepUnchecked, consentClosed, showsData });
  // 小球授权条同步
  const orbChips = await ev(`(function(){var b=document.querySelector('#orbConsent');if(!b||b.hidden)return null;return {hidden:b.hidden,chips:[].slice.call(b.querySelectorAll('.oc-chip')).map(function(c){return c.innerText})} })()`);
  const chipsOk = orbChips && orbChips.chips.length === 3 && orbChips.chips.filter(c => c.indexOf('已授权') >= 0).length === 2;
  check('验收11(二) · 小球视图授权条随授权同步（2 已授权/1 未授权）', chipsOk, orbChips);

  /* ===== H. 推荐弹窗手机版（介绍按钮复用） ===== */
  await setViewport(390, 844, true);
  await sleep(400);
  await click('#introBtn');
  await sleep(500);
  const recoMobileShown = !(await hidden('#introModal'));
  const recoGridM = await ev(`(function(){var g=document.querySelector('.reco-grid');var c=document.querySelector('.reco-copy');var v=document.querySelector('.reco-visual');if(!g||!c||!v)return null;var cb=c.getBoundingClientRect(),vb=v.getBoundingClientRect();return {cols:getComputedStyle(g).gridTemplateColumns, visualTop:Math.round(vb.top), copyBottom:Math.round(cb.bottom)}})()`);
  const oneCol = recoGridM && recoGridM.visualTop >= recoGridM.copyBottom - 6;   // 视觉在文案下方 → 单栏
  const recoOverflow = await overflow();
  check('验收10 · 顶栏「介绍」能重新打开推荐弹窗', recoMobileShown, { recoMobileShown });
  check('验收15 · 推荐弹窗手机端单栏、无横向溢出', oneCol && recoOverflow <= 0, { oneCol, recoOverflow });
  const sz5 = await shot('v12-reco-mobile.png', 390, 844);
  console.log('SHOT  v12-reco-mobile.png  ' + sz5 + ' bytes');
  await click('#closeIntro');
  await sleep(300);

  /* ===== I. 390 登录页 / 同意书 不溢出 ===== */
  await click('#logoutBtn');
  await sleep(500);
  const logoutToLogin = !(await hidden('#loginPage'));
  const loginOverflow = await overflow();
  check('验收12 · 顶栏「退出」回到登录页', logoutToLogin, { logoutToLogin });
  check('验收15 · 登录页手机端不溢出', loginOverflow <= 0, { loginOverflow });

  // 以 390 重新走一遍首访：清 localStorage → 登录页 → 登录 → 同意书（未授权），验证全屏不溢出
  await reset(390, 844, true);
  await click('.demo-acc[data-sid="20260102"]');
  await sleep(150);
  await click('#loginBtn');
  await sleep(600);
  const consentMobile = !(await hidden('#consentModal'));
  const consentOverflow = await overflow();
  check('验收15 · 同意书手机端全屏不溢出', consentMobile && consentOverflow <= 0, { consentMobile, consentOverflow });
  await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise');
  await sleep(150); await click('#consentAgree'); await sleep(500);
  if (!(await hidden('#introModal'))) { await click('#recoStart'); await sleep(300); }

  /* ===== J. 小球视图功能不受影响（桌面） ===== */
  await setViewport(1440, 1000, false);
  await sleep(400);
  await click('button.ui-seg[data-view="orb"]');
  await sleep(500);
  const orbVisible = !(await hidden('#orbView'));
  const orbState = await ev(`(function(){var s=document.querySelector('#orbStage');return {orb:!!s, items:s?s.querySelectorAll('.orb-item').length:-1, major:s?s.querySelectorAll('.orb-item.major, .orb-item[data-key]').length:-1, consent:document.querySelector('#orbConsent')?document.querySelector('#orbConsent').hidden:null}})()`);
  check('验收14 · 小球视图功能正常（三球存在、授权条可见）', orbVisible && orbState.items >= 3 && orbState.consent === false, orbState);

  /* ===== K. 刷新后登录态保持 ===== */
  await send('Page.reload'); await sleep(2000);
  const persistLogin = await hidden('#loginPage');
  const persistConsent = await hidden('#consentModal');
  const persistReco = await hidden('#introModal');
  check('验收13 · 刷新后已登录状态保持，不重复走流程', persistLogin && persistConsent && persistReco, { persistLogin, persistConsent, persistReco });

  check('验收16 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 5));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
