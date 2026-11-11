/* v13 · 移动端点中球详情闪退修复 专项验收
 * 用法：node e2e-v13.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 核心：用真实鼠标 / 触摸事件点中球，复现「pointerup → 浏览器补发 click 命中遮罩」
 *        的旧 bug 链路，验证修复后详情面板停住、关闭逻辑三道保护生效。
 * 验收：10 条（移动端点中球不闪 / 面板完整 / 返回关闭 / 桌面端点中球不闪 /
 *        点遮罩关闭 / 拖拽不关 / 350ms 内不关 / 350ms 后关 / 切换中球 / 无 jsError）
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
  const hidden = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return !e||e.hidden})()`);
  const shot = async (file, w, h) => {
    if (w) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile_ }); await sleep(360); await ev('window.scrollTo(0,0)'); }
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  const setViewport = async (w, h, mobile) => { mobile_ = mobile; await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 }); await sleep(420); };
  let mobile_ = false;

  // ===== 真实指针输入（关键：只有真实事件才会走 pointer→click 流水线）=====
  const mouse = async (type, x, y, opts = {}) => { await send('Input.dispatchMouseEvent', Object.assign({ type, x, y }, opts)); };
  const tapAt = async (x, y) => { await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); await sleep(90); };
  const touchTap = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(100); };
  const tap = (x, y) => mobile_ ? touchTap(x, y) : tapAt(x, y);
  const dragTo = async (x1, y1, x2, y2) => { await mouse('mousePressed', x1, y1, { button: 'left', clickCount: 1 }); await sleep(40); await mouse('mouseMoved', x2, y2, {}); await sleep(50); await mouse('mouseReleased', x2, y2, { button: 'left', clickCount: 1 }); await sleep(90); };
  const center = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e||e.hidden)return null;var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right)}})()`);
  const minorsVisible = async () => ev(`(function(){var a=[].slice.call(document.querySelectorAll('.orb-minor'));return a.filter(function(e){return !e.hidden && e.offsetParent!==null}).map(function(e){var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right)}})})()`);
  const detailState = async () => {
    const s = await ev(`(function(){var p=document.querySelector('#orbDetail');var b=document.querySelector('#orbDetailBackdrop');var o={panel:!!p&&!p.hidden, backdrop:!!b&&!b.hidden, open:p?p.classList.contains('open'):false, ret:!!document.querySelector('#orbDetailReturn')};return JSON.stringify(o)})()`);
    try { return JSON.parse(s); } catch (e) { return { raw: String(s) }; }
  };
  const detailTitle = async () => ev(`(function(){var t=document.querySelector('#orbDetailTitle');return t?t.textContent:null})()`);

  async function reset(w, h, mobile) {
    await setViewport(w, h, mobile);
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.navigate', { url: URL_ }); await sleep(1500);
    await ev(`(function(){try{localStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1900);
  }
  // 过门禁：登录 → 同意书(全勾) → 推荐弹窗 → orb 视图
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(500);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(150);
    await click('#consentAgree'); await sleep(600);
    if (!(await hidden('#introModal'))) { await click('#recoStart'); await sleep(300); }
    await click('button.ui-seg[data-view="orb"]'); await sleep(500);
  }
  // 进入 sub 状态（真实点大球 → 分裂出中球层）
  async function enterSub() {
    const m = await center('.orb-major');
    if (!m) return false;
    await tap(m.cx, m.cy); await sleep(750);   // 等分裂动画落定
    return true;
  }

  /* ================= 移动端验收 ================= */
  await reset(390, 844, true);
  await passGates();
  const okSubM = await enterSub();
  const mm = (await minorsVisible())[0];
  if (!okSubM || !mm) {
    check('验收1 · 移动端点中球，详情面板正常滑出并停住（不闪）', false, { okSubM, hasMinor: !!mm });
  } else {
    await tap(mm.cx, mm.cy);          // 真实触摸点中球 → openDetail + 浏览器补发 click 命中遮罩
    await sleep(550);                  // 等 > 动画 + 补发 click（旧逻辑此处会立即关闭）
    const st1 = await detailState();
    check('验收1 · 移动端点中球，详情面板正常滑出并停住（不闪）', st1.panel && st1.backdrop && st1.open, st1);
    // 验收2：面板内容完整，底部「返回小球视图」按钮可见可点
    const ret = await center('#orbDetailReturn');
    const retVisible = !!(ret && ret.top >= 0 && ret.bottom <= 844 && ret.w > 0);
    const titleOk = (await detailTitle()) != null;
    check('验收2 · 移动端面板内容完整，底部「返回小球视图」按钮可见可点', retVisible && titleOk, { ret, titleOk });
    const szM = await shot('v13-mobile-detail.png', 390, 844);
    console.log('SHOT  v13-mobile-detail.png  ' + szM + ' bytes');
    // 验收4：移动端点「返回」，面板正常关闭
    if (retVisible) { await tap(ret.cx, ret.cy); await sleep(700); }
    const st4 = await detailState();
    check('验收4 · 移动端点「返回」，面板正常关闭', st4.panel === false, st4);
  }

  /* ================= 桌面端验收 ================= */
  await reset(1440, 1000, false);
  await passGates();
  await enterSub();
  const dm = (await minorsVisible())[0];
  let openedDesktop = false;
  if (!dm) {
    check('验收5 · 桌面端点中球，面板正常滑出并停住', false, { hasMinor: !!dm });
  } else {
    await tap(dm.cx, dm.cy);
    await sleep(550);
    const st5 = await detailState();
    openedDesktop = !!(st5.panel && st5.open);
    check('验收5 · 桌面端点中球，面板正常滑出并停住', openedDesktop, st5);
    const szD = await shot('v13-desktop-detail.png', 1440, 1000);
    console.log('SHOT  v13-desktop-detail.png  ' + szD + ' bytes');

    // 验收3：桌面端打开后 >350ms 点遮罩空白 → 正常关闭
    await sleep(300);                       // 累计 > 350ms
    await tap(120, 500);                    // 左侧遮罩可见区（面板在右 480px）
    await sleep(700);
    const st3 = await detailState();
    check('验收3 · 点遮罩空白处，面板正常关闭（桌面端遮罩可见区）', st3.panel === false, st3);

    // 重新打开，做冷却期边界验证
    const dm2 = (await minorsVisible())[0];
    if (dm2) {
      await tap(dm2.cx, dm2.cy); await sleep(150);   // < 350ms
      await tap(120, 500);                            // 冷却期内点遮罩 → 不应关闭
      await sleep(400);
      const st7 = await detailState();
      check('验收7 · 面板打开后 350ms 内点遮罩，不关闭', st7.panel === true && st7.open === true, st7);
      // 验收8：累计 > 350ms 再点遮罩 → 关闭
      await sleep(400);
      await tap(120, 500);
      await sleep(700);
      const st8 = await detailState();
      check('验收8 · 面板打开后超过 350ms 点遮罩，正常关闭', st8.panel === false, st8);

      // 验收6：从面板区域按下、拖到遮罩松手 → 不关闭
      const dm3 = (await minorsVisible())[0];
      if (dm3) {
        await tap(dm3.cx, dm3.cy); await sleep(550);
        const pRect = await center('#orbDetail');     // 面板（右侧）中心
        if (pRect) {
          await dragTo(pRect.cx, pRect.cy, 120, 500); // 面板按下 → 遮罩松手
          await sleep(500);
          const st6 = await detailState();
          check('验收6 · 桌面端从面板上按下、拖到遮罩松手，不触发关闭', st6.panel === true && st6.open === true, st6);
          const r2 = await center('#orbDetailReturn');
          if (r2) { await tap(r2.cx, r2.cy); await sleep(700); }   // 收尾关闭
        }
      }
    }
  }

  /* ================= 验收9：连续点两个中球，正确切换 ================= */
  const minors = await minorsVisible();
  if (minors && minors.length >= 2) {
    await tap(minors[0].cx, minors[0].cy); await sleep(550);
    const t0 = await detailTitle();
    const st0 = await detailState();
    const opened0 = !!(st0.panel && st0.open);
    const r0 = await center('#orbDetailReturn');
    if (r0) { await tap(r0.cx, r0.cy); await sleep(700); }
    await tap(minors[1].cx, minors[1].cy); await sleep(550);
    const t1 = await detailTitle();
    const st1 = await detailState();
    const opened1 = !!(st1.panel && st1.open);
    check('验收9 · 连续点两个中球，面板能正确切换到第二个', opened0 && opened1 && t0 && t1 && t0 !== t1, { t0, t1, opened0, opened1 });
  } else {
    check('验收9 · 连续点两个中球，面板能正确切换到第二个', false, { count: minors ? minors.length : 0 });
  }

  check('验收10 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 5));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
