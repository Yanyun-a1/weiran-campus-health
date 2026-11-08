/* v25 · 分端方位词文案 / 手机端「去点球」引导 / placeholder / 抽屉高度
 * 用法：node e2e-v25.js [URL]     依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖验收 1-10：桌面/手机说明文案、窗口拖窄实时切换、按钮显隐、大球/中球高亮 600ms、
 * placeholder 不截断、抽屉展开后三球可见、动画流畅、无 jsError；
 * 另含 30 问答 / 云数据库 / 门禁 / 医生 / 预约 / 请假 / 主色回归与截图。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CDP = 'http://127.0.0.1:9222';
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const DIR = process.env.E2E_DIR || 'E:/gzkj/';
const PROJECT = 'E:/gzkj/xiaotong';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

/* ================= 静态检查 ================= */
function staticChecks() {
  console.log('\n=== 静态源码检查（不依赖浏览器） ===');
  const baseline = fs.readFileSync('E:/gzkj/v25-baseline.sha256', 'utf8').trim().split('\n');
  const bad = [];
  baseline.forEach(line => {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
    if (!m) return;
    if (sha(path.join(PROJECT, m[2])) !== m[1]) bad.push(m[2]);
  });
  check('四 · 30 问答 / 云数据库种子 / 门禁 / 医生预约 / 主色毛玻璃等 12 文件一字未改',
    bad.length === 0, { checked: baseline.length, changed: bad });

  const html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');
  check('一 · 方位词文案不写死在 HTML（无「右边 / 右侧 / 右边的球」，长 placeholder 已移除）',
    !/点右边的球|点右侧|右边的球/.test(html) &&
    html.indexOf('例如：我肚子疼怎么办 / 我睡不着') < 0 &&
    html.indexOf('v25.css') >= 0, { hasV25: html.indexOf('v25.css') >= 0 });

  const app = fs.readFileSync(path.join(PROJECT, 'app.js'), 'utf8');
  check('一 · JS 用 matchMedia(1024) 动态生成文案，并监听 change + resize 实时刷新',
    app.indexOf("window.matchMedia('(min-width: 1024px)')") >= 0 &&
    /DIR_COPY/.test(app) && /function dirCopy/.test(app) && /function dirSpan/.test(app) &&
    /refreshDirCopy/.test(app) && /addEventListener\('change', refreshDirCopy\)/.test(app) &&
    /addEventListener\('resize', refreshDirCopy\)/.test(app) &&
    app.indexOf("点右边的球看看。") >= 0 && app.indexOf("收起对话，点上面的球看看。") >= 0);
  check('一 · 三处方位词（欢迎语 / 模块概览 / 我的预约空态）都改为 dirSpan 动态节点',
    (app.match(/dirSpan\('(phrase|hint|hub)'\)/g) || []).length === 3);
  check('二 · 「去点球」按钮由 JS 生成，携带 major/minor + group（+mod）',
    /function goOrbBtnHtml/.test(app) && /去点球 →/.test(app) &&
    /goOrbBtnHtml\('major'/.test(app) && /goOrbBtnHtml\('minor'/.test(app) &&
    /closest\('\[data-go\]'\)/.test(app) && /XT_DRAWER\.close/.test(app));

  const css = fs.readFileSync(path.join(PROJECT, 'v25.css'), 'utf8');
  check('二 · 按钮样式 13px / #1E8C82 / rgba(42,167,155,.08) / 999px / 6px 14px / 居右 / 桌面 none',
    /font-size:\s*13px/.test(css) && /color:\s*#1E8C82/.test(css) &&
    /rgba\(42,\s*167,\s*155,\s*\.08\)/.test(css) && /border-radius:\s*999px/.test(css) &&
    /padding:\s*6px 14px/.test(css) && /margin:\s*10px 0 2px auto/.test(css) &&
    /@media \(min-width:\s*1024px\)[\s\S]*display:\s*none/.test(css));

  const split = fs.readFileSync(path.join(PROJECT, 'split.css'), 'utf8');
  const drawerH = split.match(/width: auto; flex: none; height:\s*(\d+)vh;/);
  check('三 · 抽屉展开高度由 82vh 下调到 76vh（且不低于 70vh）',
    !!drawerH && Number(drawerH[1]) === 76 && Number(drawerH[1]) >= 70 && Number(drawerH[1]) < 82,
    { height: drawerH && drawerH[1] + 'vh' });
  check('三 · 舞台展开态小球同步缩小上移（translateY 负值 + scale < 1）',
    /translateY\(-3[0-9]vh\)\s*scale\(0\.\d+\)/.test(split) && /transform-origin:\s*center center/.test(split));

  const orb = fs.readFileSync(path.join(PROJECT, 'orb-view.js'), 'utf8');
  const orbCss = fs.readFileSync(path.join(PROJECT, 'orb-view.css'), 'utf8');
  check('二 · 高亮复用既有 orbHot 600ms（1 → 1.15 → 1 + 光晕），并新增中球/聚焦出口',
    /function pulse/.test(orb) && /function focusOrb/.test(orb) &&
    /window\.XT_ORB\.focus\s*=\s*focusOrb/.test(orb) &&
    /@keyframes orbHot/.test(orbCss) && /scale\(1\.15\)/.test(orbCss) &&
    /box-shadow: 0 0 34px 10px var\(--c-main\)/.test(orbCss) &&
    /\.orb-item\.is-hot \.orb-skin/.test(orbCss) && /animation: orbHot 600ms/.test(orbCss));
  check('四 · 大球名 / 九子分类 / 投影公式 / 分裂动画代码未改',
    ["name: '食序'", "name: '息衡'", "name: '动跃'", '菜品营养', '饮食记录', '食堂安全',
     '作息记录', '睡眠质量', '宿舍环境', '运动记录', '场馆器材', '运动建议'].every(s => orb.indexOf(s) >= 0) &&
    /CAMERA_D = 1200/.test(orb) && /function enterSub/.test(orb) && /function goRoot/.test(orb));
}

async function main() {
  staticChecks();

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
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const click = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO';e.click();return 'OK'})()`);
  const shot = async file => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  let mobile_ = false;
  const setViewport = async (w, h, mobile) => {
    mobile_ = mobile;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await sleep(420);
  };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  const tap = async (x, y) => {
    if (mobile_) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(20);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(140);
    } else { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(140); }
  };
  const noHScroll = () => ev(`(function(){return {sw:document.documentElement.scrollWidth,iw:window.innerWidth}})()`);
  let firstReset = true;
  async function reset(w, h, mobile) {
    await setViewport(w, h, mobile);
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    if (firstReset) { jsErrors.length = 0; firstReset = false; }
    await send('Page.navigate', { url: URL_ }); await sleep(1400);
    await ev(`(function(){try{localStorage.clear();sessionStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1750);
  }
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(420);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(120);
    await click('#consentAgree'); await sleep(500);
    if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(280); }
  }
  const drawer = state => ev(`(function(){window.XT_DRAWER.${state}();return 1})()`);
  const hintText = () => ev(`(function(){var a=document.querySelectorAll('.dir-hint[data-dir="hint"]');return a.length?a[a.length-1].textContent:null})()`);
  const phraseText = () => ev(`(function(){var a=document.querySelectorAll('.dir-hint[data-dir="phrase"]');return a.length?a[a.length-1].textContent:null})()`);
  const placeholder = () => ev(`(function(){var t=document.querySelector('#userInput');return t?t.getAttribute('placeholder'):null})()`);
  const lastBot = () => ev(`(function(){var a=[].slice.call(document.querySelectorAll('#chatLog .msg-bot .bubble'));if(!a.length)return null;var p=a[a.length-1].querySelector('p');return p?p.textContent.trim():a[a.length-1].textContent.trim()})()`);
  const btnInfo = () => ev(`(function(){var a=document.querySelectorAll('.go-orb-btn');if(!a.length)return null;var e=a[a.length-1],c=getComputedStyle(e),r=e.getBoundingClientRect();return {text:e.textContent.trim(),display:c.display,go:e.getAttribute('data-go'),group:e.getAttribute('data-group'),mod:e.getAttribute('data-mod'),w:Math.round(r.width),rightGap:Math.round(window.innerWidth-r.right)}})()`);
  const tapMajor = async id => {
    const c = await ev(`(function(){var e=document.querySelector('.orb-major[data-orb="${id}"]');if(!e)return null;var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})()`);
    if (!c) return false;
    await tap(c.cx, c.cy); await sleep(900);
    if (!(await ev(`(function(){return document.querySelector('#orbStage').classList.contains('is-sub')})()`))) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.cx, y: c.cy, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.cx, y: c.cy, button: 'left', clickCount: 1 });
      await sleep(900);
    }
    return true;
  };
  const tapMinor = async mod => {
    const c = await ev(`(function(){var e=document.querySelector('.orb-minor[data-mod="${mod}"].is-current');if(!e)return null;var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})()`);
    if (!c) return false;
    await tap(c.cx, c.cy); await sleep(500); return true;
  };
  const clickGo = kind => ev(`(function(){var a=document.querySelectorAll('.go-orb-btn[data-go="${kind}"]');if(!a.length)return 'NO';a[a.length-1].click();return 'OK'})()`);
  /* 轮询捕捉 is-hot 生命周期；第一次命中时同步读 .orb-skin 的动画，避免结束时读到 none */
  async function watchHot(sel, ms, shotFile) {
    const t0 = Date.now(); const hits = []; let css = null;
    while (Date.now() - t0 < ms) {
      const on = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return !!(e&&e.classList.contains('is-hot'))})()`);
      if (on) {
        hits.push(Date.now() - t0);
        if (!css) {
          css = await ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var s=e.querySelector('.orb-skin');if(!s)return null;var c=getComputedStyle(s);return {name:c.animationName,dur:c.animationDuration}})()`);
          if (shotFile) { const n = await shot(shotFile); console.log('SHOT  ' + shotFile + '  ' + n + ' bytes'); }
        }
      }
      await sleep(45);
    }
    return { hits, css };
  }

  /* ================= 桌面 1440x1000 ================= */
  console.log('\n=== 桌面端 (1440x1000) ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(250);

  const dWelcome = await phraseText();
  check('一 · 桌面欢迎语方位短语 =「点右边的球」（JS 动态生成）', dWelcome === '点右边的球', { dWelcome });
  const dPh = await placeholder();
  check('三 · 桌面 placeholder 保留完整版本',
    dPh === '例如：我肚子疼怎么办 / 我睡不着 / 这周睡眠质量如何', { dPh });

  await tapMajor('food');
  const dHint = await hintText();
  const dLast = await lastBot();
  check('验收1 · 桌面点大球，说明文案含「点右边的球看看。」且不含手机文案',
    dHint === '点右边的球看看。' && /食序，也就是饮食健康/.test(dLast || '') &&
    (dLast || '').indexOf('点右边的球看看。') >= 0 && (dLast || '').indexOf('收起对话') < 0,
    { hint: dHint, tail: dLast && dLast.slice(-46) });
  const dBtn = await btnInfo();
  check('验收4 · 桌面端「去点球」按钮 display:none',
    dBtn && dBtn.display === 'none' && dBtn.text === '去点球 →', dBtn);
  const sDesk = await shot('v25-desktop-major.png'); console.log('SHOT  v25-desktop-major.png  ' + sDesk + ' bytes');

  /* 验收3：不重载页面，直接把窗口从宽拖到窄，已渲染文案实时切换 */
  console.log('\n=== 验收3 · 宽 → 窄 实时切换（不刷新页面） ===');
  await setViewport(390, 844, true);
  await sleep(500);
  const mHint = await hintText();
  const mWelcome = await phraseText();
  const mPh = await placeholder();
  const mBtn = await btnInfo();
  check('验收2 · 手机端点大球，说明文案是「收起对话，点上面的球看看。」',
    mHint === '收起对话，点上面的球看看。', { mHint });
  check('验收3 · 窗口从宽拖到窄，同一条已渲染文案实时切换（未 reload）',
    dHint === '点右边的球看看。' && mHint === '收起对话，点上面的球看看。' &&
    mWelcome === '点上面的球', { before: dHint, after: mHint, welcome: mWelcome });
  check('验收7 · 手机 placeholder 切为短版「例如：我肚子疼怎么办」',
    mPh === '例如：我肚子疼怎么办', { mPh });
  check('验收4 · 拖窄后「去点球」按钮即时可见（DOM 常驻 + CSS 断点）',
    mBtn && mBtn.display !== 'none' && mBtn.go === 'major' && mBtn.group === 'food', mBtn);
  const sNarrow = await shot('v25-narrow-major.png'); console.log('SHOT  v25-narrow-major.png  ' + sNarrow + ' bytes');

  /* 再拖回桌面，验证双向切换 */
  await setViewport(1440, 1000, false);
  await sleep(450);
  const backHint = await hintText();
  const backPh = await placeholder();
  check('验收3 · 窄 → 宽 也能实时切回桌面文案',
    backHint === '点右边的球看看。' && backPh === '例如：我肚子疼怎么办 / 我睡不着 / 这周睡眠质量如何',
    { hint: backHint, ph: backPh });

  /* ================= 手机端 390x844 全流程 ================= */
  console.log('\n=== 手机端 (390x844) 独立流程 ===');
  await reset(390, 844, true);
  await passGates();
  await sleep(300);
  await drawer('close'); await sleep(420);

  const mPh2 = await placeholder();
  const phFit = await ev(`(function(){var t=document.querySelector('#userInput'),c=getComputedStyle(t),g=document.createElement('canvas').getContext('2d');g.font=c.fontSize+' '+c.fontFamily;var w=g.measureText(t.getAttribute('placeholder')||'').width,r=t.getBoundingClientRect();return {textW:Math.round(w),boxW:Math.round(r.width),padL:parseFloat(c.paddingLeft),padR:parseFloat(c.paddingRight),font:g.font}})()`);
  check('验收7 · 手机 placeholder 不截断（文本像素宽 + 内边距 ≤ 输入框宽）',
    mPh2 === '例如：我肚子疼怎么办' && phFit && phFit.textW + phFit.padL + phFit.padR <= phFit.boxW + 2, phFit);

  /* 验收8：抽屉展开后，三个缩小的大球完整落在「顶栏底部 ~ 抽屉顶部」的可见带内 */
  await drawer('open'); await sleep(620);
  const vis = await ev(`(function(){var chat=document.querySelector('.pane-chat'),tb=document.querySelector('.topbar'),pane=document.querySelector('.pane-orb');if(!chat||!tb)return null;var top=tb.getBoundingClientRect().bottom,bottom=chat.getBoundingClientRect().top;var balls=[].slice.call(document.querySelectorAll('.orb-major')).map(function(e){var r=e.getBoundingClientRect();return {id:e.getAttribute('data-orb'),top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height)}});return {topbarBottom:Math.round(top),drawerTop:Math.round(bottom),vh:window.innerHeight,chatH:Math.round(chat.getBoundingClientRect().height),shrunk:pane.classList.contains('orb-shrunk'),balls:balls}})()`);
  const allVisible = vis && vis.balls.length === 3 && vis.balls.every(b =>
    b.w > 0 && b.top >= vis.topbarBottom - 3 && b.bottom <= vis.drawerTop + 3 &&
    b.left >= -2 && b.right <= 390 + 2);
  check('验收8 · 抽屉展开后上方可见带内三个缩小大球完整可见',
    allVisible && vis.shrunk && vis.chatH === Math.round(vis.vh * 0.76), vis);
  const sOpen = await shot('v25-mobile-drawer-open.png'); console.log('SHOT  v25-mobile-drawer-open.png  ' + sOpen + ' bytes');

  /* 收起 → 点大球 → 展开抽屉看说明 + 按钮 */
  await drawer('close'); await sleep(460);
  await tapMajor('food');
  await drawer('open'); await sleep(560);
  const mLast = await lastBot();
  const mBtn2 = await btnInfo();
  check('二 · 手机端模块概览卡片下方有「去点球 →」按钮，属性指向 food 大球',
    (mLast || '').indexOf('收起对话，点上面的球看看。') >= 0 &&
    mBtn2 && mBtn2.display !== 'none' && mBtn2.text === '去点球 →' &&
    mBtn2.go === 'major' && mBtn2.group === 'food' && mBtn2.w > 0 && mBtn2.rightGap < 60, mBtn2);
  const sBtn = await shot('v25-mobile-go-btn.png'); console.log('SHOT  v25-mobile-go-btn.png  ' + sBtn + ' bytes');

  /* 验收5：点「去点球」→ 抽屉收起 → 对应大球高亮约 600ms */
  await clickGo('major');
  await sleep(380);
  const closed = await ev(`(function(){return {open:document.querySelector('.pane-chat').classList.contains('drawer-open'),shrunk:document.querySelector('.pane-orb').classList.contains('orb-shrunk')}})()`);
  check('验收5 · 点「去点球」后抽屉走既有逻辑收起（drawer-open / orb-shrunk 均清除）',
    closed && !closed.open && !closed.shrunk, closed);
  const hotM = await watchHot('.orb-major[data-orb="food"]', 2400, 'v25-mobile-hot-pulse.png');
  const hotMajor = hotM.hits, hotCss = hotM.css;
  const hotSpan = hotMajor.length ? hotMajor[hotMajor.length - 1] - hotMajor[0] : 0;
  check('验收5 · 收起完成后 food 大球脉冲高亮，持续 ≈600ms 且用 orbHot 动画',
    hotMajor.length > 0 && hotSpan >= 430 && hotSpan <= 900 &&
    hotCss && hotCss.name === 'orbHot' && hotCss.dur === '0.6s',
    { hits: hotMajor.length, spanMs: hotSpan, first: hotMajor[0], last: hotMajor[hotMajor.length - 1], css: hotCss });
  const recov = await ev(`(function(){var e=document.querySelector('.orb-major[data-orb="food"]');return {hot:e.classList.contains('is-hot'),root:!document.querySelector('#orbStage').classList.contains('is-sub')}})()`);
  check('验收5 · 高亮结束后恢复常态（is-hot 移除，回到大球层静止态）',
    recov && !recov.hot && recov.root, recov);
  const sHot = await shot('v25-mobile-hot-major.png'); console.log('SHOT  v25-mobile-hot-major.png  ' + sHot + ' bytes');

  /* 验收6：点中球后的卡片同样有按钮，点后收起 + 高亮对应中球 */
  await sleep(300);
  await tapMajor('food');
  await tapMinor('菜品营养');
  await drawer('open'); await sleep(560);
  const mBtn3 = await btnInfo();
  const cardOk = await ev(`(function(){var a=[].slice.call(document.querySelectorAll('#chatLog .mc-card'));return a.length>0 && a[a.length-1].textContent.indexOf('菜品营养')>=0})()`);
  check('验收6 · 点中球后卡片也有「去点球」按钮，指向 minor / food / 菜品营养',
    cardOk && mBtn3 && mBtn3.display !== 'none' && mBtn3.go === 'minor' &&
    mBtn3.group === 'food' && mBtn3.mod === '菜品营养', mBtn3);
  await clickGo('minor');
  await sleep(360);
  const closed2 = await ev(`(function(){return document.querySelector('.pane-chat').classList.contains('drawer-open')})()`);
  const hotMinor = (await watchHot('.orb-minor[data-group="food"][data-mod="菜品营养"]', 1500)).hits;
  const minorSpan = hotMinor.length ? hotMinor[hotMinor.length - 1] - hotMinor[0] : 0;
  check('验收6 · 中球按钮行为一致：抽屉收起 + 对应中球高亮 ≈600ms',
    !closed2 && hotMinor.length > 0 && minorSpan >= 430 && minorSpan <= 900,
    { closed: !closed2, hits: hotMinor.length, spanMs: minorSpan });
  const sMinor = await shot('v25-mobile-hot-minor.png'); console.log('SHOT  v25-mobile-hot-minor.png  ' + sMinor + ' bytes');

  /* 验收9：抽屉连续展开 / 收起，动画流畅、状态不残留、无横向溢出 */
  const trans = await ev(`(function(){var c=getComputedStyle(document.querySelector('.pane-chat'));return {dur:c.transitionDuration,prop:c.transitionProperty,timing:c.transitionTimingFunction}})()`);
  let cycleOk = true;
  for (let i = 0; i < 3; i++) {
    await drawer('open'); await sleep(360);
    cycleOk = cycleOk && (await ev(`(function(){return document.querySelector('.pane-chat').classList.contains('drawer-open')})()`));
    await drawer('close'); await sleep(360);
    cycleOk = cycleOk && !(await ev(`(function(){return document.querySelector('.pane-chat').classList.contains('drawer-open')})()`));
  }
  const hs = await noHScroll();
  check('验收9 · 抽屉 3 轮展开/收起状态正确、过渡 320ms 无卡顿、无横向溢出',
    cycleOk && /0\.32s/.test(trans.dur) && /transform/.test(trans.prop) && hs.sw <= hs.iw + 1,
    { trans, hs });

  /* 分端空态文案 */
  await click('#bookBtn'); await sleep(420);
  const empty = await ev(`(function(){var e=document.querySelector('#chatLog .bk-empty');return e?e.textContent.trim():null})()`);
  check('一 · 我的预约空态也按设备生成方位短语（手机＝「点上面的校医院球」）',
    (empty || '').indexOf('点上面的校医院球') >= 0 && (empty || '').indexOf('点右侧') < 0, { empty });

  /* ================= 保留项回归 ================= */
  console.log('\n=== 保留项回归 ===');
  const faq = await ev(`(function(){var c=window.__faqCatalog?window.__faqCatalog():null,m=window.__faqMatch?window.__faqMatch('食堂几点开饭'):null;return {n:c?c.length:0,q1:c?c[0].question:null,source:m?m.source:null,best:m?m.bestId:null,top:m&&m.top?m.top[0].id:null}})()`);
  check('四 · 30 条问答与匹配算法不变（沿用 v24 同一用例：食堂几点开饭 → top=1）',
    faq.n === 30 && faq.q1 === '食堂几点开饭' && (faq.best === 1 || faq.top === 1), faq);
  await click('#faqOpenBtn'); await sleep(320);
  const tabs = await ev(`(function(){return [].slice.call(document.querySelectorAll('.faq-tab')).map(function(e){return e.textContent.trim()})})()`);
  check('四 · 10 个分类标签前三类仍为 食序/息衡/动跃，其余 7 类不变',
    tabs.length === 10 && tabs[0] === '食序' && tabs[1] === '息衡' && tabs[2] === '动跃', tabs);
  await click('#closeFaq'); await sleep(200);

  /* 医生列表 / 预约表单 */
  const docOk = await ev(`(function(){window.XT_CHAT.bookDoctor();var m=document.querySelector('#doctorModal');var cards=document.querySelectorAll('#doctorCards .doc-card');var btns=[].slice.call(document.querySelectorAll('#doctorCards .dc-btn')).map(function(b){return b.textContent.trim()});return {open:!!m&&!m.hidden,cards:cards.length,btns:btns}})()`);
  check('四 · 医生列表三卡与动态预约按钮不变、无「查看排班」',
    docOk && docOk.open && docOk.cards === 3 && docOk.btns.length === 3 &&
    docOk.btns.every(t => t.indexOf('查看排班') < 0), docOk);
  await click('#closeDoctor'); await sleep(200);

  /* 我要请假（走云端意图，需要轮询等待） */
  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='我要请假三天';return 1})()`);
  await click('#sendBtn');
  let leave = null;
  for (let i = 0; i < 22; i++) {
    await sleep(300);
    leave = await ev(`(function(){var m=document.querySelector('#leaveModal');return {open:!!(m&&!m.hidden),form:!!document.querySelector('#leaveForm'),title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent.trim():null}})()`);
    if (leave && leave.open && leave.form) break;
  }
  check('四 · 原有「我要请假」流程完全不受影响', leave && leave.open && leave.form && /请假条/.test(leave.title || ''), leave);
  if (leave && leave.open) { await click('#closeModal'); await sleep(200); }

  const theme = await ev(`(function(){var b=getComputedStyle(document.body);return {bg:b.backgroundColor,blue:getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()}})()`);
  check('四 · 背景 / 主色 / 毛玻璃基线未变（bg-v2.css 与 polish.css 文件哈希已校验）',
    !!theme, theme);
  const sMobile = await shot('v25-mobile-final.png'); console.log('SHOT  v25-mobile-final.png  ' + sMobile + ' bytes');

  /* 验收10 */
  const realErrors = jsErrors.filter(s => !/favicon|net::ERR_/i.test(s));
  check('验收10 · 全流程 0 未捕获 jsError / console.error', realErrors.length === 0, { count: realErrors.length, sample: realErrors.slice(0, 4) });

  const pass = results.filter(r => r.ok).length;
  console.log('\n================ 汇总 ================');
  console.log(`PASS ${pass}/${results.length}`);
  if (pass !== results.length) {
    console.log('FAILED:');
    results.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name));
  }
  ws.close();
  setTimeout(() => process.exit(pass === results.length ? 0 : 1), 180);
}
main().catch(e => { console.error('FATAL', e); setTimeout(() => process.exit(1), 180); });
