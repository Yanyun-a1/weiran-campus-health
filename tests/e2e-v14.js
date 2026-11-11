/* 校园健康助手 · v14 左右分屏 + 底部抽屉 专项验收
 * 用法：node e2e-v14.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 对齐 v14 需求六节 + 16 条验收标准：
 *   桌面：分屏布局 / 左 380px / 右小球按容器重算不溢出 / 点大球左追加短响应 /
 *         点中球左追加内容卡片 / 左问右高亮 / 初始欢迎+三快捷 / 桌面无详情滑出面板 /
 *         缩窗重算不溢出 / 无横向滚动条 / 无 jsError
 *   手机：初始小球全屏+56px 把手 / 点把手展开+小球缩放 / 向上拖超 30% 展开 /
 *         内容区滚动不误触收起 / 点中球自动展开+内容 / 刷新保持 / 390 无横滚
 * 注意：本测试只在本地 8123 跑，不发布；线上仍为 v13。
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

  const mouse = async (type, x, y, opts = {}) => { await send('Input.dispatchMouseEvent', Object.assign({ type, x, y }, opts)); };
  const tapAt = async (x, y) => { await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); await sleep(90); };
  const touchTap = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(20); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(110); };
  const tap = (x, y) => mobile_ ? touchTap(x, y) : tapAt(x, y);
  const touchDrag = async (x1, y1, x2, y2) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] }); await sleep(40);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x2, y: y2 }] }); await sleep(90);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(140);
  };
  const center = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e||e.hidden)return null;var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right)}})()`);
  const rect = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var r=e.getBoundingClientRect();var cs=getComputedStyle(e);var vis=cs.display!=='none'&&cs.visibility!=='hidden'&&r.width>0&&r.height>0;return {top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),h:Math.round(r.height),vis:vis,transform:cs.transform,cls:e.className}})()`);
  const minorsVisible = async () => ev(`(function(){var a=[].slice.call(document.querySelectorAll('.orb-minor'));return a.filter(function(e){return !e.hidden && e.offsetParent!==null}).map(function(e){var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom),left:Math.round(r.left),right:Math.round(r.right),mod:e.getAttribute('data-mod'),cur:e.classList.contains('is-current')}})})()`);
  const majorsCenters = async () => ev(`(function(){return [].slice.call(document.querySelectorAll('.orb-major')).filter(function(e){return !e.hidden&&e.offsetParent!==null}).map(function(e){var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})})()`);
  /* 选「坐标实际落在该中球元素上」且 is-current 的中球，避免点中球时坐标被大球遮挡
   * （sub 态大球点击无效，点到大球就不会触发 onMid） */
  async function pickClickableMinor() {
    const ms = await minorsVisible();
    for (const m of ms) {
      if (!m.cur) continue;
      const what = await ev(`(function(){var el=document.elementFromPoint(${m.cx},${m.cy});el=el&&el.closest?el.closest('.orb-minor'):null;return el?'minor':(el&&el.closest?el.closest('.orb-major')?'major':'other':'null')})()`);
      if (what === 'minor') return m;
    }
    return ms.find(m => m.cur) || null;
  }
  const majorsVisible = async () => ev(`(function(){var a=[].slice.call(document.querySelectorAll('.orb-major'));return a.filter(function(e){return !e.hidden && e.offsetParent!==null}).map(function(e){var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),orb:e.getAttribute('data-orb'),w:Math.round(r.width)}})})()`);
  const noHScroll = () => ev(`(function(){return {sw:document.documentElement.scrollWidth, iw:window.innerWidth, sh:document.documentElement.scrollHeight, ih:window.innerHeight}})()`);
  const shellD = () => ev(`(function(){var s=document.querySelector('#orbScene');if(!s)return null;return getComputedStyle(s).getPropertyValue('--shell-d')})()`);

  async function reset(w, h, mobile) {
    await setViewport(w, h, mobile);
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.navigate', { url: URL_ }); await sleep(1500);
    await ev(`(function(){try{localStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1900);
  }
  // v14 过门禁：登录 → 同意书(全勾) → 推荐弹窗 → 直接进入（无 ui-seg 切换器）
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(500);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(150);
    await click('#consentAgree'); await sleep(600);
    if (!(await hidden('#introModal'))) { await click('#recoStart'); await sleep(300); }
  }
  async function enterSub() {
    const m = await center('.orb-major');
    if (!m) return false;
    await tap(m.cx, m.cy); await sleep(750);
    return true;
  }
  const typeSend = async (text) => {
    await ev(`(function(){var i=document.querySelector('#userInput');if(i)i.value=${JSON.stringify(text)};return 1})()`);
    await click('#sendBtn'); await sleep(280);
  };

  /* ================= 桌面端验收 ================= */
  console.log('\n=== 桌面端 (1440x1000) ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(400);

  // 验收 D1：左右分屏 + 左栏 380px 固定 + 右栏小球可见
  const pc = await rect('#chatPane');
  const po = await rect('#orbPane');
  const chatW = pc ? pc.w : 0;
  check('验收D1 · 桌面左右分屏，左栏宽度=380px', !!pc && pc.vis && Math.abs(chatW - 380) <= 2 && !!po && po.vis, { chatW, orbVis: !!(po && po.vis) });
  // 验收 D2：右栏小球按容器重算（--shell-d 已设置）且不溢出
  const sd = await shellD();
  const sdNum = sd ? parseFloat(String(sd).replace('px', '')) : 0;
  const hs = await noHScroll();
  check('验收D2 · 右栏小球已按容器重算(--shell-d)且不溢出/无横滚', sdNum > 0 && sdNum <= (po ? po.w : 0) && hs && hs.sw <= hs.iw + 1, { sd, orbW: po ? po.w : 0, hs });
  check('验收D2b · 桌面无横向滚动条(scrollWidth<=innerWidth)', hs && hs.sw <= hs.iw + 1, hs);

  // 验收 D3：点大球 → 对话端追加两条短消息（用户+AI 概览）
  const mj = await majorsVisible();
  if (!mj || !mj.length) {
    check('验收D3 · 点大球，左栏追加两条短响应消息', false, { hasMajor: false });
  } else {
    await tap(mj[0].cx, mj[0].cy); await sleep(900);
    const chat = await ev(`(function(){var log=document.querySelector('#chatLog');if(!log)return null;var msgs=log.querySelectorAll('.msg');var txt=log.textContent;return {n:msgs.length, hasHint:/包含三个模块/.test(txt), sample:txt.slice(0,60)}})()`);
    check('验收D3 · 点大球，左栏追加两条短响应消息(用户+AI概览)', chat && chat.n >= 2 && chat.hasHint, chat);
  }

  // 验收 D4：点中球 → 左栏追加内容卡片(mc-card + 模拟声明)
  const mm = await pickClickableMinor();
  if (!mm) {
    check('验收D4 · 点中球，左栏追加内容卡片(数据卡+模拟声明)', false, { hasMinor: false });
  } else {
    await tap(mm.cx, mm.cy); await sleep(600);
    const card = await ev(`(function(){var log=document.querySelector('#chatLog');if(!log)return null;var c=log.querySelector('.mc-card');var foot=log.querySelector('.mc-foot');return {hasCard:!!c, foot:foot?foot.textContent:null, bignum:log.querySelector('.mc-bignum')?log.querySelector('.mc-bignum').textContent:null}})()`);
    check('验收D4 · 点中球，左栏追加内容卡片(数据卡+模拟声明)', card && card.hasCard && card.foot && /模拟演示/.test(card.foot), card);
    const sz = await shot('v14-desktop-split.png', 1440, 1000); console.log('SHOT  v14-desktop-split.png  ' + sz + ' bytes');
    const sz2 = await shot('v14-desktop-midcard.png', 1440, 1000); console.log('SHOT  v14-desktop-midcard.png  ' + sz2 + ' bytes');
  }

  // 验收 D5：桌面点中球后 #orbDetail 仍 hidden（取消右侧滑出面板）
  const detHidden = await ev(`(function(){var d=document.querySelector('#orbDetail');return !d||d.hidden})()`);
  check('验收D5 · 桌面取消详情滑出面板(#orbDetail 保持 hidden)', detHidden === true, { detHidden });

  // 验收 D6：左问右高亮（输入“这周睡眠怎么样” → sleep 大球 is-hot）
  await reset(1440, 1000, false);
  await passGates(); await sleep(300);
  await typeSend('这周睡眠怎么样');
  const hot = await ev(`(function(){var m=document.querySelector('.orb-major[data-orb=\"sleep\"]');return !!(m&&m.classList.contains('is-hot'))})()`);
  check('验收D6 · 左侧提问，右侧对应大球高亮(.is-hot)', hot === true, { hot });

  // 验收 D7：初始欢迎语 + 三个快捷问句
  const welcome = await ev(`(function(){var log=document.querySelector('#chatLog');if(!log)return null;var chips=log.querySelector('.quick-chips');var btns=chips?chips.querySelectorAll('button[data-q]'):[];return {hasChips:!!chips, n:btns.length, qs:[].slice.call(btns).map(function(b){return b.getAttribute('data-q')}), greet:/校园健康助手/.test(log.textContent)}})()`);
  check('验收D7 · 初始欢迎语 + 三个快捷问句(data-q)', welcome && welcome.hasChips && welcome.n === 3 && welcome.greet, welcome);

  // 验收 D8：缩窗重算（1440 → 1024 不溢出/无横滚）
  await setViewport(1024, 1000, false); await sleep(500);
  const sd2 = await shellD(); const sdNum2 = sd2 ? parseFloat(String(sd2).replace('px', '')) : 0;
  const po2 = await rect('#orbPane'); const hs2 = await noHScroll();
  const pc2 = await rect('#chatPane');
  check('验收D8 · 缩窗至 1024 重算不溢出(左栏仍 380 / 小球<=右栏 / 无横滚)', !!pc2 && Math.abs(pc2.w - 380) <= 2 && sdNum2 > 0 && sdNum2 <= (po2 ? po2.w : 0) && hs2 && hs2.sw <= hs2.iw + 1, { chatW: pc2 ? pc2.w : 0, sd: sd2, orbW: po2 ? po2.w : 0, hs: hs2 });

  /* ================= 手机端验收 ================= */
  console.log('\n=== 手机端 (390x844) ===');
  await reset(390, 844, true);
  await passGates(); await sleep(500);

  // 验收 M1：初始小球全屏 + 56px 把手收起 + 小球未缩放
  const poM = await rect('#orbPane');
  const pcM = await rect('#chatPane');
  const hd = await rect('#drawerHandle');
  check('验收M1 · 手机初始：小球全屏 + 56px 把手收起 + 小球未缩放',
    !!poM && poM.vis && poM.w >= 380 && !!pcM && !/drawer-open/.test(pcM.cls) && pcM.top >= 780 && !!hd && hd.h >= 50 && hd.h <= 64 && !/orb-shrunk/.test(poM.cls),
    { orbW: poM ? poM.w : 0, drawerTop: pcM ? pcM.top : 0, handleH: hd ? hd.h : 0, drawerCls: pcM ? pcM.cls : '', orbCls: poM ? poM.cls : '' });
  const szM1 = await shot('v14-mobile-collapsed.png', 390, 844); console.log('SHOT  v14-mobile-collapsed.png  ' + szM1 + ' bytes');

  // 验收 M2：点把手（非胶囊）→ 展开 82vh + 小球缩放
  if (hd) { await touchTap(hd.cx || Math.round((hd.left + hd.right) / 2), hd.bottom - 6); await sleep(450); }
  const pcM2 = await rect('#chatPane');
  const poM2 = await rect('#orbPane');
  check('验收M2 · 点把手展开抽屉(82vh) + 小球缩放(orb-shrunk)', !!pcM2 && /drawer-open/.test(pcM2.cls) && pcM2.top <= 160 && !!poM2 && /orb-shrunk/.test(poM2.cls), { drawerTop: pcM2 ? pcM2.top : 0, drawerCls: pcM2 ? pcM2.cls : '', orbCls: poM2 ? poM2.cls : '' });
  const szM2 = await shot('v14-mobile-drawer.png', 390, 844); console.log('SHOT  v14-mobile-drawer.png  ' + szM2 + ' bytes');

  // 验收 M3：向上拖超 30% → 展开（先收起再拖）
  let hdM0 = await rect('#drawerHandle');
  if (hdM0) { await touchTap(Math.round((hdM0.left + hdM0.right) / 2), hdM0.bottom - 6); await sleep(400); } // 收起（用当前把手坐标，避免 stale）
  const collapsedTop = (await rect('#chatPane')).top;
  const hdM = await rect('#drawerHandle');
  if (hdM) { await touchDrag(Math.round((hdM.left + hdM.right) / 2), hdM.bottom - 6, Math.round((hdM.left + hdM.right) / 2), hdM.bottom - 6 - 320); await sleep(800); } // 向上拖 320px
  const pcM3 = await rect('#chatPane');
  check('验收M3 · 向上拖>30% 把手 → 抽屉展开', !!pcM3 && /drawer-open/.test(pcM3.cls) && pcM3.top <= 200, { wasCollapsedTop: collapsedTop, nowTop: pcM3 ? pcM3.top : 0, cls: pcM3 ? pcM3.cls : '' });

  // 验收 M4：内容区滚动不误触收起（展开态滚动 chat-log，抽屉保持展开）
  await ev(`(function(){var c=document.querySelector('#chatLog');if(c){c.dispatchEvent(new WheelEvent('wheel',{deltaY:120,bubbles:true}))}return 1})()`);
  await sleep(200);
  const pcM4 = await rect('#chatPane');
  check('验收M4 · 内容区滚动不误触收起(抽屉保持展开)', !!pcM4 && /drawer-open/.test(pcM4.cls), { cls: pcM4 ? pcM4.cls : '' });

  // 验收 M5：点中球自动展开 + 内容卡片
  await reset(390, 844, true);
  await passGates(); await sleep(300);
  const okSub = await enterSub();
  const mmM = (await minorsVisible())[0];
  if (!okSub || !mmM) {
    check('验收M5 · 手机点中球自动展开抽屉 + 插入内容卡片', false, { okSub, hasMinor: !!mmM });
  } else {
    await tap(mmM.cx, mmM.cy); await sleep(650);
    const r = await ev(`(function(){var log=document.querySelector('#chatLog');var pane=document.querySelector('#chatPane');var orb=document.querySelector('#orbPane');return {hasCard:!!(log&&log.querySelector('.mc-card')), foot:log&&log.querySelector('.mc-foot')?log.querySelector('.mc-foot').textContent:null, drawerOpen:!!(pane&&pane.classList.contains('drawer-open')), orbShrunk:!!(orb&&orb.classList.contains('orb-shrunk'))}})()`);
    check('验收M5 · 手机点中球自动展开抽屉 + 插入内容卡片', r && r.hasCard && r.drawerOpen && r.orbShrunk, r);
    const szM5 = await shot('v14-mobile-midcard.png', 390, 844); console.log('SHOT  v14-mobile-midcard.png  ' + szM5 + ' bytes');
  }

  // 验收 M6：刷新保持（展开态刷新后仍为展开）
  // 先确保抽屉展开
  let pcNow = await rect('#chatPane');
  if (pcNow && !/drawer-open/.test(pcNow.cls)) { const hdX = (await rect('#drawerHandle')); if (hdX) await touchTap(hdX.cx || Math.round((hdX.left + hdX.right) / 2), hdX.bottom - 6); await sleep(400); }
  // 刷新（不清 localStorage，保留 drawer 记忆）
  await setViewport(390, 844, true); await sleep(150);
  await send('Page.reload'); await sleep(2000);
  await passGates(); await sleep(500);
  const pcM6 = await rect('#chatPane');
  check('验收M6 · 刷新后抽屉状态保持(localStorage 记忆)', !!pcM6 && /drawer-open/.test(pcM6.cls), { cls: pcM6 ? pcM6.cls : '' });

  // 验收 M7：390 无横向滚动条
  const hsM = await noHScroll();
  check('验收M7 · 390 无横向滚动条', hsM && hsM.sw <= hsM.iw + 1, hsM);

  // 验收 0：无 jsError
  check('验收0 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  fs.writeFileSync(DIR + 'e2e-v14.log', results.map(r => (r.ok ? 'PASS  ' : 'FAIL  ') + r.name).join('\n') + '\n\n' + pass + '/' + results.length + ' PASS');
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
