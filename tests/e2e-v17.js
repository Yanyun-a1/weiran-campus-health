/* 校园健康助手 · v17 返回按钮与顶栏logo重叠修复 专项验收
 * 用法：node e2e-v17.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖 6 条验收：
 *   1 390 进入中球层,返回按钮在顶栏下方,不与logo重叠
 *   2 320 同样不重叠
 *   3 桌面端返回按钮位置正常,不与顶栏重叠
 *   4 返回按钮可点击,点击回到大球层(按钮隐藏+退出sub)
 *   5 返回按钮半透明背景+箭头清晰可见
 *   6 全流程无 jsError
 * 只在本地 8123 跑；本脚本不发布，由调用方发布。
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
  let page = targets.find(t => t.type === 'page');
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
  const shot = async (file, w, h) => {
    if (w) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile_ }); await sleep(360); await ev('window.scrollTo(0,0)'); }
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  const setViewport = async (w, h, mobile) => { mobile_ = mobile; await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 }); await sleep(420); };
  let mobile_ = false;
  const mouse = async (type, x, y, opts = {}) => { await send('Input.dispatchMouseEvent', Object.assign({ type, x, y }, opts)); };
  const tapAt = async (x, y) => { await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); await sleep(90); };
  const touchTap = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(20); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(110); };
  const tap = (x, y) => mobile_ ? touchTap(x, y) : tapAt(x, y);
  const noHScroll = () => ev(`(function(){return {sw:document.documentElement.scrollWidth, iw:window.innerWidth}})()`);

  async function reset(w, h, mobile) {
    await setViewport(w, h, mobile);
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.navigate', { url: URL_ }); await sleep(1500);
    await ev(`(function(){try{localStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1900);
  }
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(500);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(150);
    await click('#consentAgree'); await sleep(600);
    if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(300); }
  }
  // 进入中球层：依次尝试点大球,直到返回按钮出现
  async function enterSubViaTap() {
    const majors = await ev(`(function(){var a=[].slice.call(document.querySelectorAll('.orb-major:not([hidden])'));return a.map(function(e){var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height)}})}())`);
    for (const m of (majors || [])) {
      if (m.w < 12 || m.h < 12) continue;
      await tap(m.cx, m.cy); await sleep(750);
      const vis = await ev(`(function(){var b=document.querySelector('#orbBack');return !!b && !b.hidden})()`);
      if (vis) return true;
    }
    return false;
  }
  // 返回按钮与 logo 的重叠诊断
  const backDiag = () => ev(`(function(){
    var b=document.querySelector('#orbBack'); var logo=document.querySelector('.brand-mark');
    if(!b||!logo||b.hidden) return null;
    var r=b.getBoundingClientRect(), l=logo.getBoundingClientRect();
    var noOverlap = (r.bottom<=l.top || r.top>=l.bottom || r.right<=l.left || r.left>=l.right);
    return {bT:Math.round(r.top),bB:Math.round(r.bottom),bL:Math.round(r.left),bR:Math.round(r.right),
            lT:Math.round(l.top),lB:Math.round(l.bottom),lL:Math.round(l.left),lR:Math.round(l.right),
            noOverlap:noOverlap, bBelowLogo: r.top >= l.bottom - 4};
  })()`);
  const backVis = () => ev(`(function(){var b=document.querySelector('#orbBack');if(!b||b.hidden)return null;var cs=getComputedStyle(b);return {bg:cs.backgroundColor, w:Math.round(b.getBoundingClientRect().width), h:Math.round(b.getBoundingClientRect().height), text:b.textContent.trim(), radius:cs.borderRadius, z:cs.zIndex}})()`);

  /* ================= 桌面端 (1440) ================= */
  console.log('\n=== 桌面端 (1440x1000) 返回按钮位置 ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(400);
  const enteredD = await enterSubViaTap();
  check('验收3-前置 · 桌面端能进入中球层(返回按钮出现)', enteredD, { enteredD });
  const diagD = await backDiag();
  check('验收3 · 桌面端返回按钮不与顶栏logo重叠(且位于顶栏下方)',
    diagD && diagD.noOverlap && diagD.bBelowLogo, diagD);
  const visD = await backVis();
  check('验收5 · 桌面端返回按钮半透明+箭头(圆形,←)', visD && /rgba/.test(visD.bg) && visD.text === '←' && (visD.radius === '50%' || parseFloat(visD.radius) > 0), visD);
  const szD = await shot('v17-desktop-backbtn.png', 1440, 1000); console.log('SHOT  v17-desktop-backbtn.png  ' + szD + ' bytes');
  // 点击返回
  await ev(`(function(){var b=document.querySelector('#orbBack');if(b)b.click();return 1})()`); await sleep(750);
  const backD = await ev(`(function(){var b=document.querySelector('#orbBack');var s=document.querySelector('.orb-stage');return {hidden:!!(b&&b.hidden), isSub:!!(s&&s.classList.contains('is-sub'))}})()`);
  check('验收4 · 桌面端点击返回按钮回到大球层', backD && backD.hidden && !backD.isSub, backD);

  /* ================= 手机端 (390) ================= */
  console.log('\n=== 手机端 (390x844) 返回按钮位置 ===');
  await reset(390, 844, true);
  await passGates();
  await sleep(400);
  const enteredM = await enterSubViaTap();
  check('验收1-前置 · 390 能进入中球层(返回按钮出现)', enteredM, { enteredM });
  const diagM = await backDiag();
  const hsM = await noHScroll();
  check('验收1 · 390 返回按钮在顶栏下方,不与logo重叠,无横滚',
    diagM && diagM.noOverlap && diagM.bBelowLogo && hsM && hsM.sw <= hsM.iw + 1, { diag: diagM, hs: hsM });
  const visM = await backVis();
  check('验收5 · 390 返回按钮半透明+箭头(40px圆形,←)', visM && /rgba/.test(visM.bg) && visM.text === '←' && (visM.radius === '50%' || parseFloat(visM.radius) > 0) && visM.w === 40, visM);
  const szM = await shot('v17-mobile-390-backbtn.png', 390, 844); console.log('SHOT  v17-mobile-390-backbtn.png  ' + szM + ' bytes');
  await ev(`(function(){var b=document.querySelector('#orbBack');if(b)b.click();return 1})()`); await sleep(750);
  const backM = await ev(`(function(){var b=document.querySelector('#orbBack');var s=document.querySelector('.orb-stage');return {hidden:!!(b&&b.hidden), isSub:!!(s&&s.classList.contains('is-sub'))}})()`);
  check('验收4 · 390 点击返回按钮回到大球层', backM && backM.hidden && !backM.isSub, backM);

  /* ================= 手机端 (320) ================= */
  console.log('\n=== 手机端 (320x700) 返回按钮位置 ===');
  await reset(320, 700, true);
  await passGates();
  await sleep(400);
  const enteredT = await enterSubViaTap();
  check('验收2-前置 · 320 能进入中球层(返回按钮出现)', enteredT, { enteredT });
  const diagT = await backDiag();
  const hsT = await noHScroll();
  check('验收2 · 320 返回按钮在顶栏下方,不与logo重叠,无横滚',
    diagT && diagT.noOverlap && diagT.bBelowLogo && hsT && hsT.sw <= hsT.iw + 1, { diag: diagT, hs: hsT });
  const visT = await backVis();
  check('验收5 · 320 返回按钮半透明+箭头(40px圆形,←)', visT && /rgba/.test(visT.bg) && visT.text === '←' && (visT.radius === '50%' || parseFloat(visT.radius) > 0) && visT.w === 40, visT);
  const szT = await shot('v17-mobile-320-backbtn.png', 320, 700); console.log('SHOT  v17-mobile-320-backbtn.png  ' + szT + ' bytes');

  // 验收 6：无 jsError
  check('验收6 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  fs.writeFileSync(DIR + 'e2e-v17.log', results.map(r => (r.ok ? 'PASS  ' : 'FAIL  ') + r.name).join('\n') + '\n\n' + pass + '/' + results.length + ' PASS');
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
