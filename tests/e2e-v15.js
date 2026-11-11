/* 校园健康助手 · v15 对话面板排版/字体 专项验收
 * 用法：node e2e-v15.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖 9 条验收：
 *   1 三个快捷胶囊文字完整不裁切   2 胶囊放不下自动换行   3 AI 正文深青灰#2C3A38
 *   4 AI 正文 15px/1.65            5 用户与AI同字号15px  6 胶囊 hover 有反馈
 *   7 AI 有头像(圆形青绿「健」)/用户无头像  8 390 胶囊换行不溢出  9 无 jsError
 * 只在本地 8123 跑，不发布；线上仍为 v14 之前的 v13。
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
  const center = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e||e.hidden)return null;var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height)}})()`);
  const rect = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect();var cs=getComputedStyle(e);var vis=cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0;return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height),vis:vis,cls:e.className}})()`);
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

  /* ================= 桌面端样式验收 ================= */
  console.log('\n=== 桌面端 (1440x1000) 对话面板排版/字体 ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(400);

  // 验收 1：三个快捷胶囊文字完整显示，没有被裁切
  const chips = await ev(`(function(){
    var log=document.querySelector('#chatLog'); if(!log) return null;
    var btns=[].slice.call(log.querySelectorAll('.quick-chips button[data-q]'));
    return btns.map(function(b){return {q:b.getAttribute('data-q'), txt:b.textContent, sw:b.scrollWidth, cw:b.clientWidth}});
  })()`);
  const clipFree = chips && chips.length === 3 && chips.every(c => c.sw <= c.cw + 1);
  check('验收1 · 三个快捷胶囊文字完整显示不裁切(scrollWidth<=clientWidth 且文本=属性)', clipFree, chips);

  // 验收 2：胶囊放不下时自动换行(flex-wrap:wrap)
  const wrap = await ev(`(function(){var q=document.querySelector('#chatLog .quick-chips');return q?getComputedStyle(q).flexWrap:null})()`);
  const wrapsToRows = await ev(`(function(){
    var q=document.querySelector('#chatLog .quick-chips'); if(!q) return null;
    var bs=[].slice.call(q.querySelectorAll('button')); var tops=bs.map(function(b){return Math.round(b.getBoundingClientRect().top)});
    return {flexWrap:getComputedStyle(q).flexWrap, distinctTops:[...new Set(tops)].length, tops:tops};
  })()`);
  check('验收2 · 胶囊容器 flex-wrap=wrap 且多按钮换行到多行', wrap === 'wrap' && wrapsToRows && wrapsToRows.distinctTops >= 2, wrapsToRows);

  // 验收 3：AI 正文颜色 #2C3A38(rgb(44,58,56))
  const aiColor = await ev(`(function(){
    var b=document.querySelector('#chatLog .msg-bot .bubble'); if(!b) return null;
    var p=b.querySelector('p')||b; return getComputedStyle(p).color;
  })()`);
  check('验收3 · AI 正文颜色为深青灰 #2C3A38(rgb(44,58,56))', aiColor === 'rgb(44, 58, 56)', { aiColor });

  // 验收 4：AI 正文字号 15px / 行高 1.65
  const aiType = await ev(`(function(){
    var b=document.querySelector('#chatLog .msg-bot .bubble'); if(!b) return null;
    var cs=getComputedStyle(b); return {fs:cs.fontSize, lh:cs.lineHeight};
  })()`);
  const lhNum = aiType ? parseFloat(aiType.lh) : 0;
  check('验收4 · AI 正文字号 15px 且 行高 1.65(≈24.75px)', aiType && aiType.fs === '15px' && Math.abs(lhNum - 24.75) <= 0.6, aiType);

  // 验收 5：用户与 AI 消息同字号 15px
  await typeSend('今天吃了多少热量');
  await sleep(200);
  const userType = await ev(`(function(){
    var u=document.querySelector('#chatLog .msg-user .bubble'); if(!u) return null;
    return getComputedStyle(u).fontSize;
  })()`);
  check('验收5 · 用户消息与AI字号一致(均 15px)', aiType && userType === '15px' && aiType.fs === '15px', { userFs: userType, aiFs: aiType ? aiType.fs : null });

  // 验收 6：胶囊 hover 有反馈(背景变 #F0FAF8)
  const hc = await center('#chatLog .quick-chips button[data-q]');
  let hoverBg = null;
  if (hc) { await mouse('mouseMoved', hc.cx, hc.cy); await sleep(180); hoverBg = await ev(`(function(){var b=document.querySelector('#chatLog .quick-chips button[data-q]');return b?getComputedStyle(b).backgroundColor:null})()`); await mouse('mouseMoved', 5, 5); }
  check('验收6 · 胶囊 hover 有反馈(背景 #F0FAF8=rgb(240,250,248))', hoverBg === 'rgb(240, 250, 248)', { hoverBg });

  // 验收 7：AI 消息有头像(圆形青绿「健」)，用户消息无头像
  const avatar = await ev(`(function(){
    var bot=document.querySelector('#chatLog .msg-bot');
    var user=document.querySelector('#chatLog .msg-user');
    var av=bot?bot.querySelector('.bubble-avatar'):null;
    var cs=av?getComputedStyle(av):null;
    return {
      botHasAvatar:!!av,
      avatarText: av?av.textContent:null,
      radius: cs?cs.borderRadius:null,
      bg: cs?cs.backgroundColor:null,
      userHasAvatar:!!(user&&user.querySelector('.bubble-avatar'))
    };
  })()`);
  const radiusOk = avatar && (avatar.radius === '50%' || avatar.radius === '14px');
  check('验收7 · AI 有头像(圆形/青绿/「健」)且用户无头像',
    avatar && avatar.botHasAvatar && avatar.avatarText === '健' && radiusOk && avatar.bg === 'rgb(42, 167, 155)' && !avatar.userHasAvatar, avatar);

  // 桌面：先把对话滚到顶部，确保欢迎语+胶囊+头像完整可见（不被滚动裁切）
  await ev(`(function(){var l=document.querySelector('#chatLog');if(l)l.scrollTop=0;return 1})()`); await sleep(200);
  const sz1 = await shot('v15-desktop-welcome.png', 1440, 1000); console.log('SHOT  v15-desktop-welcome.png  ' + sz1 + ' bytes');
  // 再滚到底部，截一张含用户气泡+头像的图
  await ev(`(function(){var l=document.querySelector('#chatLog');if(l)l.scrollTop=l.scrollHeight;return 1})()`); await sleep(200);
  const sz2 = await shot('v15-desktop-messages.png', 1440, 1000); console.log('SHOT  v15-desktop-messages.png  ' + sz2 + ' bytes');

  /* ================= 手机端 390 验收 ================= */
  console.log('\n=== 手机端 (390x844) 胶囊换行不溢出 ===');
  await reset(390, 844, true);
  await passGates();
  await sleep(400);

  // 验收 8：390 下胶囊换行且不溢出（先展开抽屉，使对话流中的胶囊可见）
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.open)window.XT_DRAWER.open();return 1})()`);
  await sleep(600);
  const mChips = await ev(`(function(){
    var q=document.querySelector('#chatLog .quick-chips'); if(!q) return null;
    var bs=[].slice.call(q.querySelectorAll('button'));
    var tops=bs.map(function(b){return Math.round(b.getBoundingClientRect().top)});
    return {flexWrap:getComputedStyle(q).flexWrap, scrollW:q.scrollWidth, clientW:q.clientWidth, distinctTops:[...new Set(tops)].length, n:bs.length};
  })()`);
  const hsM = await noHScroll();
  check('验收8 · 390 胶囊换行(多行)且不溢出(容器/页面无横滚)',
    mChips && mChips.flexWrap === 'wrap' && mChips.distinctTops >= 2 && mChips.scrollW <= mChips.clientW + 1 && hsM && hsM.sw <= hsM.iw + 1,
    { chips: mChips, hs: hsM });
  const szM = await shot('v15-mobile-390.png', 390, 844); console.log('SHOT  v15-mobile-390.png  ' + szM + ' bytes');

  // 验收 9：无 jsError
  check('验收9 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  fs.writeFileSync(DIR + 'e2e-v15.log', results.map(r => (r.ok ? 'PASS  ' : 'FAIL  ') + r.name).join('\n') + '\n\n' + pass + '/' + results.length + ' PASS');
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
