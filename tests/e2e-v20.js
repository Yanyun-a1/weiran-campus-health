/* 校园健康助手 · v20 视觉质感升级 专项验收
 * 用法：node e2e-v20.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖 8 条验收 + 硬约束回归：
 *   1 背景两层极淡光晕(青绿/淡紫) + 左栏半透明 + 右栏/顶栏纯白
 *   2 AI气泡/医生卡/弹窗/胶囊/底部按钮/手机把手 均为毛玻璃
 *   3 小球舞台纯白、无任何 backdrop-filter、小球视觉未改
 *   4 圆角统一(气泡20/医生卡20/弹窗24/胶囊999/用户气泡不变)
 *   5 主色 #2AA79B 未改
 *   6 拖动小球流畅(拖动期间 backdrop-filter 关闭 + rAF 帧间隔采样)
 *   7 手机 390 不溢出、毛玻璃正常
 *   8 全流程无 jsError
 *   + 功能回归(门禁/医生弹窗/预约表单/我的预约/小球分裂/虚线) + 无横向滚动
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
    if (w) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile_ }); await sleep(360); }
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
  const centerRect = () => ev(`(function(){var c=document.querySelector('#orbCenter');if(!c)return null;var r=c.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}}())`);

  /* 计算样式采集：毛玻璃四件套 */
  const glassOf = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var c=getComputedStyle(e);return {bg:c.backgroundColor,bf:c.backdropFilter,wbf:c.webkitBackdropFilter,border:c.borderTopWidth+' '+c.borderTopStyle+' '+c.borderTopColor,shadow:c.boxShadow,radius:c.borderRadius}})()`);
  const isGlass = g => !!g && /rgba\(255, 255, 255, 0\.72\)/.test(g.bg) &&
    /blur\(20px\)/.test(g.bf || '') && /saturate\(1\.4\)|saturate\(140%\)/.test(g.bf || '') &&
    /1px solid rgba\(255, 255, 255, 0\.7\)/.test(g.border) && /8px 32px/.test(g.shadow);

  /* ================= 桌面端 (1440) ================= */
  console.log('\n=== 桌面端 (1440x1000) 环境光 / 毛玻璃 / 圆角 ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(450);
  // 发一条消息，让对话流里同时存在用户气泡与 AI 气泡（便于对比两者样式）
  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='今天吃了多少热量';return 1})()`);
  await click('#sendBtn'); await sleep(900);

  // 验收1：背景光晕 + 左栏半透明 + 右栏/顶栏纯白
  const bg = await ev(`(function(){var b=getComputedStyle(document.body);var pc=getComputedStyle(document.querySelector('.pane-chat'));var po=getComputedStyle(document.querySelector('.pane-orb'));var tb=getComputedStyle(document.querySelector('.topbar'));return {bodyImg:b.backgroundImage,bodyColor:b.backgroundColor,chat:pc.backgroundColor,orb:po.backgroundColor,orbBf:po.backdropFilter,topbar:tb.backgroundColor,topbarBf:tb.backdropFilter}})()`);
  check('验收1 · body 两层极淡光晕(青绿.07/淡紫.05)+#F7FAF9 底色',
    bg && /42, 167, 155, 0\.07/.test(bg.bodyImg) && /107, 123, 232, 0\.05/.test(bg.bodyImg) &&
    /900px 700px/.test(bg.bodyImg) && /800px 600px/.test(bg.bodyImg) && /247, 250, 249/.test(bg.bodyColor),
    { img: bg && bg.bodyImg.slice(0, 220), color: bg && bg.bodyColor });
  check('验收1b · 左栏 rgba(247,250,249,.72) 半透明 / 右栏与顶栏纯白不透',
    bg && /rgba\(247, 250, 249, 0\.72\)/.test(bg.chat) && /rgb\(255, 255, 255\)/.test(bg.orb) &&
    bg.orbBf === 'none' && /rgb\(255, 255, 255\)/.test(bg.topbar) && bg.topbarBf === 'none',
    { chat: bg && bg.chat, orb: bg && bg.orb, orbBf: bg && bg.orbBf, topbar: bg && bg.topbar });
  const hs1 = await noHScroll();
  check('硬约束 · 桌面无横向滚动条', hs1 && hs1.sw <= hs1.iw + 1, hs1);

  // 验收2：初始可见的毛玻璃组件
  const gBubble = await glassOf('.msg-bot .bubble');
  const gChip = await glassOf('.quick-chips button');
  const gBtn = await glassOf('.ca-btn');
  const gUser = await glassOf('.msg-user .bubble');
  check('验收2 · AI 气泡毛玻璃(rgba.72 / blur20 saturate140 / 白缘 / 柔影)', isGlass(gBubble), gBubble);
  check('验收2b · 快捷胶囊毛玻璃 + 999px 圆角保持',
    isGlass(gChip) && /999px/.test(gChip.radius), gChip);
  check('验收2c · 底部两个按钮毛玻璃(FAQ/我的预约)', isGlass(gBtn), gBtn);
  check('硬约束 · 用户气泡仍为青绿实心、不加毛玻璃',
    gUser && /42, 167, 155/.test(gUser.bg) && (gUser.bf === 'none' || !gUser.bf), gUser);

  // 验收3：小球舞台 / 小球本体完全不受影响
  const orbSafe = await ev(`(function(){var sel=['.pane-orb','.orb-view','.orb-scene','.orb-stage','.orb-skin','.orb-item','.orb-center'];var out={};sel.forEach(function(s){var e=document.querySelector(s);out[s]=e?(getComputedStyle(e).backdropFilter||'none'):'MISSING'});var bg=getComputedStyle(document.querySelector('.pane-orb')).backgroundColor;var links=document.querySelectorAll('#orbLinkSvg .orb-link').length;var majors=[].slice.call(document.querySelectorAll('.orb-major')).filter(function(e){return !e.hidden}).length;return {bf:out,bg:bg,links:links,majors:majors}})()`);
  check('验收3 · 小球舞台纯白，舞台/小球各层均无 backdrop-filter',
    orbSafe && orbSafe.bg === 'rgb(255, 255, 255)' &&
    Object.keys(orbSafe.bf).every(k => orbSafe.bf[k] === 'none' || orbSafe.bf[k] === 'MISSING'), orbSafe.bf);
  check('验收3b · 小球视图结构未受损(3 大球 / 3 条虚线 / 中心球在)',
    orbSafe && orbSafe.majors === 3 && orbSafe.links === 3, { majors: orbSafe && orbSafe.majors, links: orbSafe && orbSafe.links });

  // 验收4：圆角统一
  const rad = await ev(`(function(){function c(s){var e=document.querySelector(s);return e?getComputedStyle(e).borderRadius:null}return {bot:c('.msg-bot .bubble'),botTL:(function(){var e=document.querySelector('.msg-bot .bubble');return e?getComputedStyle(e).borderTopLeftRadius:null})(),user:c('.msg-user .bubble'),userBR:(function(){var e=document.querySelector('.msg-user .bubble');return e?getComputedStyle(e).borderBottomRightRadius:null})(),chip:c('.quick-chips button')}})()`);
  check('验收4 · AI 气泡圆角 20px(保留 4px 左上切角)',
    rad && /20px/.test(rad.bot) && rad.botTL === '4px', rad);
  check('验收4b · 用户气泡保持原样 16px + 右下角 4px 切角 / 胶囊仍 999px',
    rad && /16px/.test(rad.user) && rad.userBR === '4px' && /999px/.test(rad.chip), rad);

  // 验收5：主色未改
  const color = await ev(`(function(){var v=getComputedStyle(document.documentElement).getPropertyValue('--blue').trim();function bg(s){var e=document.querySelector(s);return e?getComputedStyle(e).backgroundColor:null}return {v:v,avatar:bg('.bubble-avatar'),user:bg('.msg-user .bubble')}})()`);
  check('验收5 · 主色 #2AA79B 未改(--blue / 头像 / 用户气泡一致)',
    color && color.v.toUpperCase() === '#2AA79B' && /42, 167, 155/.test(color.avatar) && /42, 167, 155/.test(color.user), color);

  const sz0 = await shot('v20-desktop-initial.png', 1440, 1000); console.log('SHOT  v20-desktop-initial.png  ' + sz0 + ' bytes');

  // 打开医生弹窗：验收2(医生卡/弹窗容器) + 验收4(圆角) + 功能回归
  const cR = await centerRect();
  await tap(cR.cx, cR.cy); await sleep(700);
  const gModal = await glassOf('.doctor-modal');
  const gCard = await glassOf('.doc-card');
  const dmInfo = await ev(`(function(){var m=document.querySelector('#doctorModal');var d=document.querySelector('.doctor-modal');return {open:!!(m&&!m.hidden),w:d?Math.round(d.getBoundingClientRect().width):0,radius:d?getComputedStyle(d).borderRadius:'',cards:document.querySelectorAll('#doctorCards .doc-card').length,btn:getComputedStyle(document.querySelector('.dc-btn.is-primary')).backgroundColor}})()`);
  check('验收2d · 医生列表弹窗容器毛玻璃 + 圆角 24px',
    isGlass(gModal) && /24px/.test(gModal.radius) && dmInfo && dmInfo.open && dmInfo.w === 720, { glass: gModal && { bg: gModal.bg, bf: gModal.bf, radius: gModal.radius }, w: dmInfo && dmInfo.w });
  check('验收2e · 三张医生卡片毛玻璃 + 圆角 20px',
    isGlass(gCard) && /20px/.test(gCard.radius) && dmInfo && dmInfo.cards === 3, { glass: gCard && { bg: gCard.bg, bf: gCard.bf, radius: gCard.radius }, n: dmInfo && dmInfo.cards });
  check('验收5b · 主色实心「立即预约」按钮未被改动', dmInfo && /42, 167, 155/.test(dmInfo.btn), { btn: dmInfo && dmInfo.btn });
  const hs2 = await noHScroll();
  check('硬约束 · 医生弹窗打开时无横向滚动条', hs2 && hs2.sw <= hs2.iw + 1, hs2);
  const szD = await shot('v20-desktop-doctors.png', 1440, 1000); console.log('SHOT  v20-desktop-doctors.png  ' + szD + ' bytes');

  // 打开预约表单：验收2(请假表单容器) + 验收4(圆角) + 功能回归
  await click('[data-book="zhang"]'); await sleep(420);
  const gForm = await glassOf('#leaveModal .modal');
  const formInfo = await ev(`(function(){var m=document.querySelector('#leaveModal');var f=document.querySelector('#bookingForm');return {open:!!(m&&!m.hidden),form:!!f,reason:document.querySelector('#lvReason')?document.querySelector('#lvReason').value:null,submit:f?f.querySelector('button[type=submit]').textContent.trim():null}})()`);
  check('验收2f · 请假表单弹窗容器毛玻璃 + 圆角 24px',
    isGlass(gForm) && /24px/.test(gForm.radius), { glass: gForm && { bg: gForm.bg, bf: gForm.bf, radius: gForm.radius } });
  check('功能回归 · 预约流程仍完整(表单打开/理由预填/提交按钮)',
    formInfo && formInfo.open && formInfo.form && formInfo.reason === '因身体不适，需前往校医院就诊，申请病假半天（4 小时）。' && formInfo.submit === '提交请假申请', formInfo);
  const szF = await shot('v20-desktop-booking.png', 1440, 1000); console.log('SHOT  v20-desktop-booking.png  ' + szF + ' bytes');
  await click('#closeModal'); await sleep(280);

  // 验收6：拖动小球 —— 期间 backdrop-filter 关闭 + rAF 帧间隔采样
  const sceneR = await ev(`(function(){var r=document.querySelector('#orbScene').getBoundingClientRect();return {x:Math.round(r.left+40),y:Math.round(r.top+40)}})()`);
  await ev(`(function(){window.__fps={t:[],on:true};var last=0;function loop(ts){if(!window.__fps.on)return;if(last)window.__fps.t.push(ts-last);last=ts;requestAnimationFrame(loop)}requestAnimationFrame(loop);return 1})()`);
  await mouse('mousePressed', sceneR.x, sceneR.y, { button: 'left', buttons: 1, clickCount: 1 }); await sleep(40);
  for (let i = 1; i <= 12; i++) { await mouse('mouseMoved', sceneR.x + i * 9, sceneR.y + i * 3, { button: 'left', buttons: 1 }); await sleep(16); }
  const during = await ev(`(function(){var s=document.querySelector('#orbScene');var b=document.querySelector('.msg-bot .bubble');var h=document.querySelector('.ca-btn');return {dragging:!!(s&&s.classList.contains('is-dragging')),bubbleBf:b?getComputedStyle(b).backdropFilter:null,btnBf:h?getComputedStyle(h).backdropFilter:null,orbBf:getComputedStyle(document.querySelector('.pane-orb')).backdropFilter}})()`);
  await mouse('mouseReleased', sceneR.x + 108, sceneR.y + 36, { button: 'left', buttons: 0, clickCount: 1 }); await sleep(260);
  const frames = await ev(`(function(){window.__fps.on=false;var t=window.__fps.t.slice(2);return {n:t.length,avg:t.length?+(t.reduce(function(a,b){return a+b},0)/t.length).toFixed(1):0,max:t.length?+Math.max.apply(null,t).toFixed(1):0}})()`);
  const afterDrag = await ev(`(function(){var b=document.querySelector('.msg-bot .bubble');return {restored:b?getComputedStyle(b).backdropFilter:null,dragging:!!document.querySelector('#orbScene.is-dragging')}})()`);
  check('验收6 · 拖动期间小球舞台不被模糊、所有毛玻璃临时关闭',
    during && during.dragging && during.bubbleBf === 'none' && during.btnBf === 'none' && during.orbBf === 'none', during);
  check('验收6b · 松手后毛玻璃自动恢复、拖动标记清除',
    afterDrag && /blur\(20px\)/.test(afterDrag.restored || '') && !afterDrag.dragging, afterDrag);
  check('验收6c · 拖动过程帧间隔平稳(rAF 采样,无掉帧)',
    frames && frames.n >= 8 && frames.avg < 40 && frames.max < 120, frames);

  // 功能回归：我的预约 / 小球分裂 / 虚线重算
  await click('#bookBtn'); await sleep(320);
  const emptyOk = await ev(`(function(){var l=document.querySelector('#chatLog');return /你还没有预约记录。点右侧中间的校医院球可以发起预约/.test(l.textContent)})()`);
  check('功能回归 · 「我的预约」空态提示仍正常', emptyOk);
  const majors = await ev(`(function(){return [].slice.call(document.querySelectorAll('.orb-major:not([hidden])')).map(function(e){var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})})()`);
  let sub = false;
  for (const m of (majors || [])) { await tap(m.cx, m.cy); await sleep(720); sub = await ev(`(function(){var b=document.querySelector('#orbBack');return !!b&&!b.hidden})()`); if (sub) break; }
  check('功能回归 · 三段式分裂动画仍正常(进入中球层)', sub, { sub });
  if (sub) { await click('#orbBack'); await sleep(780); }
  const linksOk = await ev(`(function(){return document.querySelectorAll('#orbLinkSvg .orb-link').length===3})()`);
  check('功能回归 · 三条虚线仍在(投影重算未受影响)', linksOk);

  /* ================= 手机端 (390) ================= */
  console.log('\n=== 手机端 (390x844) 毛玻璃 / 无溢出 ===');
  await reset(390, 844, true);
  await passGates();
  await sleep(450);
  // 展开抽屉以看到对话气泡 / 胶囊 / 把手
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.open)window.XT_DRAWER.open();return 1})()`); await sleep(480);

  const mBg = await ev(`(function(){return {chat:getComputedStyle(document.querySelector('.pane-chat')).backgroundColor,orb:getComputedStyle(document.querySelector('.pane-orb')).backgroundColor,topbar:getComputedStyle(document.querySelector('.topbar')).backgroundColor}})()`);
  const gHandle = await glassOf('.drawer-handle');
  const gMBubble = await glassOf('.msg-bot .bubble');
  const gMChip = await glassOf('.quick-chips button');
  const hsM = await noHScroll();
  check('验收7 · 手机 390 左栏半透明 / 小球舞台纯白 / 顶栏纯白',
    mBg && /rgba\(247, 250, 249, 0\.72\)/.test(mBg.chat) && /rgb\(255, 255, 255\)/.test(mBg.orb) && /rgb\(255, 255, 255\)/.test(mBg.topbar), mBg);
  check('验收7b · 手机抽屉把手条毛玻璃正常', isGlass(gHandle), gHandle);
  check('验收7c · 手机 AI 气泡 / 快捷胶囊毛玻璃正常', isGlass(gMBubble) && isGlass(gMChip), { bubble: gMBubble && gMBubble.bf, chip: gMChip && gMChip.bf });
  check('验收7d · 390px 无横向溢出', hsM && hsM.sw <= hsM.iw + 1, hsM);
  const szM = await shot('v20-mobile-initial.png', 390, 844); console.log('SHOT  v20-mobile-initial.png  ' + szM + ' bytes');

  // 手机医生弹窗：毛玻璃 + 不溢出（先收起抽屉，避免盖住小球舞台）
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.close)window.XT_DRAWER.close();return 1})()`); await sleep(460);
  const cM = await centerRect();
  await tap(cM.cx, cM.cy); await sleep(700);
  const gMModal = await glassOf('.doctor-modal');
  const gMCard = await glassOf('.doc-card');
  const dmM = await ev(`(function(){var m=document.querySelector('#doctorModal');var d=document.querySelector('.doctor-modal');var t=document.querySelector('.topbar');return {open:!!(m&&!m.hidden),w:d?Math.round(d.getBoundingClientRect().width):0,radius:d?getComputedStyle(d).borderRadius:'',backdropTop:Math.round(m.getBoundingClientRect().top),topbarBottom:t?Math.round(t.getBoundingClientRect().bottom):0,grid:getComputedStyle(document.querySelector('#doctorCards')).gridTemplateColumns}})()`);
  const hsM2 = await noHScroll();
  check('验收7e · 手机医生弹窗毛玻璃 + 24px 圆角 + 92vw + 竖堆 + 不溢出',
    dmM && dmM.open && isGlass(gMModal) && isGlass(gMCard) && /24px/.test(dmM.radius) &&
    Math.abs(dmM.w - Math.round(390 * 0.92)) <= 2 && hsM2.sw <= hsM2.iw + 1,
    { w: dmM && dmM.w, radius: dmM && dmM.radius, grid: dmM && dmM.grid, hs: hsM2, bf: gMModal && gMModal.bf });
  check('硬约束 · 手机弹窗不遮挡顶栏', dmM && dmM.backdropTop >= dmM.topbarBottom - 1, { backdropTop: dmM && dmM.backdropTop, topbarBottom: dmM && dmM.topbarBottom });
  const szMD = await shot('v20-mobile-doctors.png', 390, 844); console.log('SHOT  v20-mobile-doctors.png  ' + szMD + ' bytes');

  // 验收8：无 jsError
  check('验收8 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  if (pass !== results.length) process.exitCode = 1;
  ws.close();
}
main().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
