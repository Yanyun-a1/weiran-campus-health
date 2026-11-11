/* 校园健康助手 · v16 顶栏(≤768)精简 + 底部把手去胶囊 专项验收
 * 用法：node e2e-v16.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖 9 条验收：
 *   1 390 顶栏不重叠(标题+两按钮各就位,无裁切)  2 手机端顶栏仅 隐私/退出 两按钮
 *   3 底部把手只有横线+「和助手聊聊」,无胶囊       4 拖把手上拖不误触发送
 *   5 展开后对话面板仍有三胶囊且可点击            6 桌面顶栏仍三按钮+副标题
 *   7 320 顶栏不重叠                            8 v15 对话排版不受影响(换行/深青灰/头像)
 *   9 无 jsError
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
  const touchDrag = async (x1, y1, x2, y2) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] }); await sleep(20);
    const steps = 10;
    for (let i = 1; i <= steps; i++) { const x = x1 + (x2 - x1) * i / steps, y = y1 + (y2 - y1) * i / steps; await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] }); await sleep(15); }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(130);
  };
  const center = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e||e.hidden)return null;var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height)}})()`);
  const rect = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect();var cs=getComputedStyle(e);var vis=cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0;return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height),vis:vis,disp:cs.display,cls:e.className}})()`);
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
  const typeSend = async (text) => {
    await ev(`(function(){var i=document.querySelector('#userInput');if(i)i.value=${JSON.stringify(text)};return 1})()`);
    await click('#sendBtn'); await sleep(300);
  };
  const msgCount = () => ev(`(function(){var l=document.querySelector('#chatLog');return l?l.querySelectorAll('.msg').length:0})()`);
  const topbarInfo = () => ev(`(function(){
    var tb=document.querySelector('.topbar'); if(!tb) return null;
    var right=tb.querySelector('.topbar-right');
    var strong=tb.querySelector('.brand-text strong');
    var sub=tb.querySelector('.brand-text small');
    var intro=tb.querySelector('.intro-btn');
    var btns=[].slice.call(right?right.querySelectorAll('button'):[]);
    var visBtns=btns.filter(function(b){var cs=getComputedStyle(b);return cs.display!=='none'&&cs.visibility!=='hidden'&&b.getBoundingClientRect().width>0});
    function rr(el){if(!el)return null;var r=el.getBoundingClientRect();return {l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom),w:Math.round(r.width)}}
    return {
      tb:rr(tb), strong:rr(strong), subDisp:sub?getComputedStyle(sub).display:null,
      introDisp:intro?getComputedStyle(intro).display:null,
      visBtnCount:visBtns.length, btnLabels:visBtns.map(function(b){return b.textContent.trim()}),
      iw:window.innerWidth
    };
  })()`);

  /* ================= 桌面端 (1440) ：顶栏完整 + v15 排版不受影响 ================= */
  console.log('\n=== 桌面端 (1440x1000) 顶栏完整三按钮+副标题 + v15 排版 ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(400);

  // 验收 6：桌面顶栏仍是完整三按钮 + 副标题
  const dt = await topbarInfo();
  check('验收6 · 桌面顶栏三按钮(隐私/介绍/退出)且副标题可见',
    dt && dt.visBtnCount === 3 && dt.btnLabels.indexOf('隐私') >= 0 && dt.btnLabels.indexOf('介绍') >= 0 && dt.btnLabels.indexOf('退出') >= 0 && dt.subDisp !== 'none', dt);

  // 验收 8：v15 对话排版不受影响（胶囊换行 / AI 深青灰 / 头像）
  const wrap = await ev(`(function(){var q=document.querySelector('#chatLog .quick-chips');if(!q)return null;var bs=[].slice.call(q.querySelectorAll('button'));var tops=bs.map(function(b){return Math.round(b.getBoundingClientRect().top)});return {flexWrap:getComputedStyle(q).flexWrap, distinctTops:[...new Set(tops)].length}})()`);
  check('验收8a · 胶囊容器 flex-wrap=wrap 且多行', wrap && wrap.flexWrap === 'wrap' && wrap.distinctTops >= 2, wrap);
  const aiColor = await ev(`(function(){var b=document.querySelector('#chatLog .msg-bot .bubble');if(!b)return null;var p=b.querySelector('p')||b;return getComputedStyle(p).color})()`);
  check('验收8b · AI 正文深青灰 #2C3A38(rgb(44,58,56))', aiColor === 'rgb(44, 58, 56)', { aiColor });
  const avatar = await ev(`(function(){var bot=document.querySelector('#chatLog .msg-bot');var av=bot?bot.querySelector('.bubble-avatar'):null;var cs=av?getComputedStyle(av):null;var user=document.querySelector('#chatLog .msg-user');return {has:!!av,text:av?av.textContent:null,radius:cs?cs.borderRadius:null,bg:cs?cs.backgroundColor:null,userHas:!!(user&&user.querySelector('.bubble-avatar'))}})()`);
  check('验收8c · AI 有圆形青绿「健」头像且用户无头像', avatar && avatar.has && avatar.text === '健' && (avatar.radius==='50%') && avatar.bg === 'rgb(42, 167, 155)' && !avatar.userHas, avatar);
  await ev(`(function(){var l=document.querySelector('#chatLog');if(l)l.scrollTop=0;return 1})()`); await sleep(150);
  const szD1 = await shot('v16-desktop-topbar.png', 1440, 1000); console.log('SHOT  v16-desktop-topbar.png  ' + szD1 + ' bytes');
  await ev(`(function(){var l=document.querySelector('#chatLog');if(l)l.scrollTop=l.scrollHeight;return 1})()`); await sleep(150);
  const szD2 = await shot('v16-desktop-chat.png', 1440, 1000); console.log('SHOT  v16-desktop-chat.png  ' + szD2 + ' bytes');

  /* ================= 手机端 (390) ：顶栏精简 + 把手去胶囊 + 拖拽 ================= */
  console.log('\n=== 手机端 (390x844) 顶栏精简/把手去胶囊/拖拽 ===');
  await reset(390, 844, true);
  await passGates();
  await sleep(400);

  // 验收 3：底部把手只有横线 + 文案，没有胶囊
  const handle = await ev(`(function(){
    var h=document.querySelector('#drawerHandle'); if(!h) return null;
    var pills=h.querySelectorAll('.dh-pill').length;
    var bar=h.querySelector('.dh-bar'); var txt=h.querySelector('.dh-text');
    return {pillCount:pills, hasBar:!!bar, hasText:!!txt, text:txt?txt.textContent:null, barW:bar?Math.round(bar.getBoundingClientRect().width):0, barH:bar?Math.round(bar.getBoundingClientRect().height):0};
  })()`);
  check('验收3 · 底部把手无胶囊(仅横线+「和助手聊聊」)', handle && handle.pillCount === 0 && handle.hasBar && handle.hasText && handle.text === '和助手聊聊' && handle.barW === 40 && handle.barH === 4, handle);
  const szH = await shot('v16-mobile-handle-collapsed.png', 390, 844); console.log('SHOT  v16-mobile-handle-collapsed.png  ' + szH + ' bytes');

  // 验收 1：390 顶栏不重叠（标题+两按钮各占其位，无裁切）
  const tb390 = await topbarInfo();
  const hs390 = await noHScroll();
  const noOverlap390 = tb390 && tb390.strong && tb390.tb &&
    tb390.strong.r <= (tb390.tb.r - 4) &&            // 标题右缘不超过顶栏右侧内容区
    tb390.tb.l >= 0 &&                               // 顶栏不外溢左
    tb390.tb.r <= tb390.iw + 1 &&                    // 顶栏不外溢右
    hs390 && hs390.sw <= hs390.iw + 1;               // 无横向滚动
  check('验收1 · 390 顶栏不重叠/无裁切(标题与两按钮各就位,无横滚)',
    noOverlap390 && tb390.subDisp === 'none', { tb: tb390, hs: hs390 });

  // 验收 2：手机端顶栏仅 隐私/退出 两按钮
  check('验收2 · 手机端顶栏仅两按钮(隐私/退出)且介绍隐藏',
    tb390 && tb390.visBtnCount === 2 && tb390.btnLabels.indexOf('隐私') >= 0 && tb390.btnLabels.indexOf('退出') >= 0 && tb390.introDisp === 'none', tb390);
  const szT = await shot('v16-mobile-390-topbar.png', 390, 844); console.log('SHOT  v16-mobile-390-topbar.png  ' + szT + ' bytes');

  // 验收 4：按住把手向上拖 → 抽屉展开，但不误触发送（消息数不变）
  const hdRect = await rect('#drawerHandle');
  const beforeCount = await msgCount();
  if (hdRect) {
    const hx = Math.round((hdRect.left + hdRect.right) / 2);
    const hy = Math.round(hdRect.bottom - 14);       // 把手底部区域起手
    await touchDrag(hx, hy, hx, hy - 340);           // 向上拖 340px
    await sleep(400);
  }
  const afterCount = await msgCount();
  const drawerOpen = await ev(`(function(){var p=document.querySelector('#chatPane');return p?p.classList.contains('drawer-open'):false})()`);
  check('验收4 · 拖把手上拖展开抽屉且不误触发送(消息数不变)',
    !!hdRect && drawerOpen === true && afterCount === beforeCount, { before: beforeCount, after: afterCount, open: drawerOpen });

  // 验收 5：展开后的对话面板仍有三胶囊，且可点击（点击后新增消息）
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.open)window.XT_DRAWER.open();return 1})()`); await sleep(500);
  const chips = await ev(`(function(){
    var q=document.querySelector('#chatLog .quick-chips'); if(!q) return null;
    var bs=[].slice.call(q.querySelectorAll('button[data-q]'));
    return {n:bs.length, labels:bs.map(function(b){return b.textContent.trim()}), flexWrap:getComputedStyle(q).flexWrap};
  })()`);
  const chipOk = chips && chips.n === 3 && chips.labels.indexOf('今天吃了多少热量') >= 0 && chips.labels.indexOf('这周睡眠怎么样') >= 0 && chips.labels.indexOf('体育馆人多吗') >= 0;
  // 点击第一个胶囊，确认会发送（消息数 +2）
  const c0 = await msgCount();
  const cc = await center('#chatLog .quick-chips button[data-q]');
  if (cc) { await touchTap(cc.cx, cc.cy); await sleep(500); }
  const c1 = await msgCount();
  check('验收5 · 展开后三胶囊存在且可点击(点击新增消息)', chipOk && c1 >= c0 + 2, { chips: chips ? chips.n : 0, before: c0, after: c1 });
  const szDr = await shot('v16-mobile-drawer.png', 390, 844); console.log('SHOT  v16-mobile-drawer.png  ' + szDr + ' bytes');

  /* ================= 手机端 (320) ：顶栏不重叠 ================= */
  console.log('\n=== 手机端 (320x700) 顶栏不重叠 ===');
  await reset(320, 700, true);
  await passGates();
  await sleep(400);
  const tb320 = await topbarInfo();
  const hs320 = await noHScroll();
  const noOverlap320 = tb320 && tb320.strong && tb320.tb &&
    tb320.strong.r <= (tb320.tb.r - 4) && tb320.tb.l >= 0 && tb320.tb.r <= tb320.iw + 1 &&
    hs320 && hs320.sw <= hs320.iw + 1 && tb320.subDisp === 'none' && tb320.visBtnCount === 2;
  check('验收7 · 320 顶栏不重叠(两按钮/无副标题/无横滚)', noOverlap320, { tb: tb320, hs: hs320 });
  const sz320 = await shot('v16-mobile-320.png', 320, 700); console.log('SHOT  v16-mobile-320.png  ' + sz320 + ' bytes');

  // 验收 9：无 jsError
  check('验收9 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  fs.writeFileSync(DIR + 'e2e-v16.log', results.map(r => (r.ok ? 'PASS  ' : 'FAIL  ') + r.name).join('\n') + '\n\n' + pass + '/' + results.length + ' PASS');
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
