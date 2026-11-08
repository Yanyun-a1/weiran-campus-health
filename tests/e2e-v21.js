/* 校园健康助手 · v21 背景图替换 专项验收
 * 用法：node e2e-v21.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖：
 *   1 两张 PNG 资源存在且可解码、尺寸正确
 *   2 桌面 body：desktop 图 / cover / center / fixed / #F7FAF9
 *   3 右栏 + 小球舞台背景完全透明（含清掉 v9 渐变层）
 *   4 左栏 rgba(255,255,255,.58) + blur(24px) saturate(140%)
 *   5 顶栏纯白不透明
 *   6 中心白色径向遮罩（::before，在球层之下、pointer-events:none）
 *   7 ≤1023px 换 mobile 图（390 手机 / 820 平板）
 *   8 硬约束回归：小球投影/动画/五层配方、毛玻璃卡片、圆角、主色、无横向溢出
 *   9 功能回归：门禁 / 医生弹窗 / 预约表单 / 我的预约 / 分裂 / 虚线 / 抽屉拖拽 / 无 jsError
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
  const bodyCss = () => ev(`(function(){var b=getComputedStyle(document.body);return {img:b.backgroundImage,size:b.backgroundSize,pos:b.backgroundPosition,attach:b.backgroundAttachment,repeat:b.backgroundRepeat,color:b.backgroundColor}})()`);
  const glassOf = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var c=getComputedStyle(e);return {bg:c.backgroundColor,bf:c.backdropFilter,wbf:c.webkitBackdropFilter,border:c.borderTopWidth+' '+c.borderTopStyle+' '+c.borderTopColor,shadow:c.boxShadow,radius:c.borderRadius}})()`);
  const isGlass = g => !!g && /rgba\(255, 255, 255, 0\.72\)/.test(g.bg) &&
    /blur\(20px\)/.test(g.bf || '') && /saturate\(1\.4\)|saturate\(140%\)/.test(g.bf || '') &&
    /1px solid rgba\(255, 255, 255, 0\.7\)/.test(g.border) && /8px 32px/.test(g.shadow);

  /* ================= 资源层：两张 PNG ================= */
  console.log('\n=== 资源：bg-desktop-v2.png / bg-mobile-v2.png ===');
  await reset(1440, 1000, false);
  const assets = await ev(`(async function(){var out={};for(var f of ['bg-desktop-v2.png','bg-mobile-v2.png']){try{var r=await fetch(f);var i=new Image();i.src=f;await i.decode();out[f]={status:r.status,type:r.headers.get('content-type'),w:i.naturalWidth,h:i.naturalHeight}}catch(e){out[f]=String(e)}}return out})()`);
  check('资源 · 桌面图 200 / image/png / 1920x1064 可解码',
    assets && assets['bg-desktop-v2.png'] && assets['bg-desktop-v2.png'].status === 200 &&
    /image\/png/.test(assets['bg-desktop-v2.png'].type || '') &&
    assets['bg-desktop-v2.png'].w === 1920 && assets['bg-desktop-v2.png'].h === 1064, assets && assets['bg-desktop-v2.png']);
  check('资源 · 手机图 200 / image/png / 1064x1920 可解码',
    assets && assets['bg-mobile-v2.png'] && assets['bg-mobile-v2.png'].status === 200 &&
    /image\/png/.test(assets['bg-mobile-v2.png'].type || '') &&
    assets['bg-mobile-v2.png'].w === 1064 && assets['bg-mobile-v2.png'].h === 1920, assets && assets['bg-mobile-v2.png']);

  /* ================= 桌面端 (1440x1000) ================= */
  console.log('\n=== 桌面端 (1440x1000) 背景 / 透明层 / 遮罩 ===');
  await passGates();
  await sleep(450);
  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='今天吃了多少热量';return 1})()`);
  await click('#sendBtn'); await sleep(900);

  // 验收2：body 背景图四件套
  const bg = await bodyCss();
  check('验收1 · body 桌面图 bg-desktop-v2.png / cover / center / fixed / #F7FAF9',
    bg && /bg-desktop-v2\.png/.test(bg.img) && !/radial-gradient/.test(bg.img) &&
    bg.size === 'cover' && /50% 50%|center/.test(bg.pos) && bg.attach === 'fixed' &&
    /247, 250, 249/.test(bg.color), bg);

  // 验收3：右栏 / 舞台完全透明
  const transparent = await ev(`(function(){function s(q){var e=document.querySelector(q);if(!e)return null;var c=getComputedStyle(e);return {color:c.backgroundColor,img:c.backgroundImage,bf:c.backdropFilter}}return {pane:s('.pane-orb'),scene:s('.orb-scene'),view:s('.orb-view'),shell:s('.orb-shell')}})()`);
  const isClear = x => !!x && /rgba\(0, 0, 0, 0\)|transparent/.test(x.color) && x.img === 'none';
  check('验收2 · 右栏与小球舞台背景完全透明（v20 纯白 + v9 白色渐变均已清除）',
    transparent && isClear(transparent.pane) && isClear(transparent.scene) && isClear(transparent.view), transparent);
  check('验收2b · 舞台/球层各层仍无 backdrop-filter（小球视觉不受污染）',
    transparent && ['.pane-orb', '.orb-scene', '.orb-view'].every(k => transparent[k === '.pane-orb' ? 'pane' : k === '.orb-scene' ? 'scene' : 'view'].bf === 'none'),
    { pane: transparent && transparent.pane.bf, scene: transparent && transparent.scene.bf, view: transparent && transparent.view.bf });

  // 验收4：左栏半透明磨砂
  const chat = await glassOf('.pane-chat');
  check('验收3 · 左栏 rgba(255,255,255,.58) + blur(24px) saturate(140%)',
    chat && /rgba\(255, 255, 255, 0\.58\)/.test(chat.bg) &&
    /blur\(24px\)/.test(chat.bf || '') && /saturate\(1\.4\)|saturate\(140%\)/.test(chat.bf || ''), chat);

  // 验收5：顶栏纯白不透明
  const topbar = await glassOf('.topbar');
  check('验收4 · 顶栏纯白不透明且无毛玻璃',
    topbar && topbar.bg === 'rgb(255, 255, 255)' && (topbar.bf === 'none' || !topbar.bf), topbar);

  // 验收6：中心径向遮罩
  const halo = await ev(`(function(){var s=document.querySelector('.orb-scene');var p=getComputedStyle(s,'::before');var r=s.getBoundingClientRect();var sd=parseFloat(getComputedStyle(s).getPropertyValue('--shell-d'));var st=getComputedStyle(document.querySelector('.orb-stage'));return {content:p.content,img:p.backgroundImage,z:p.zIndex,pe:p.pointerEvents,w:p.width,h:p.height,left:p.left,top:p.top,stageZ:st.zIndex,sceneW:Math.round(r.width),sceneH:Math.round(r.height),shellD:sd}})()`);
  check('验收5 · 中心白色径向遮罩(.55 / .25 / transparent 72%) 已生成',
    halo && halo.content !== 'none' && /radial-gradient/.test(halo.img) &&
    /255, 255, 255, 0\.55/.test(halo.img) && /255, 255, 255, 0\.25/.test(halo.img) && /72%/.test(halo.img),
    { content: halo && halo.content, img: halo && halo.img.slice(0, 240) });
  check('验收5b · 遮罩在球层下方(z0 < z1) / 不拦截交互 / 尺寸跟随 --shell-d',
    halo && Number(halo.z) === 0 && Number(halo.stageZ) === 1 && halo.pe === 'none' &&
    Math.abs(parseFloat(halo.w) - halo.shellD) <= 1 && Math.abs(parseFloat(halo.h) - halo.shellD) <= 1,
    { z: halo && halo.z, stageZ: halo && halo.stageZ, pe: halo && halo.pe, w: halo && halo.w, shellD: halo && halo.shellD });

  // 硬约束：小球质感 / 卡片 / 圆角 / 主色
  const orb = await ev(`(function(){var sk=document.querySelector('.orb-skin');var c=getComputedStyle(sk);return {bg:c.backgroundImage,shadow:c.boxShadow,majors:[].slice.call(document.querySelectorAll('.orb-major')).filter(function(e){return !e.hidden}).length,links:document.querySelectorAll('#orbLinkSvg .orb-link').length,center:!!document.querySelector('#orbCenter')}})()`);
  check('硬约束 · 小球玻璃五层配方与投影公式未改（skin 渐变 / inset+外投影 / 3 大球 / 3 虚线 / 中心球）',
    orb && /radial-gradient/.test(orb.bg) && /inset/.test(orb.shadow) && /18px 40px/.test(orb.shadow) &&
    orb.majors === 3 && orb.links === 3 && orb.center, { majors: orb && orb.majors, links: orb && orb.links, shadow: orb && orb.shadow.slice(0, 90) });
  const gBubble = await glassOf('.msg-bot .bubble');
  const gChip = await glassOf('.quick-chips button');
  const gUser = await glassOf('.msg-user .bubble');
  check('硬约束 · AI 气泡 / 胶囊毛玻璃配方与圆角不变、用户气泡仍为青绿实心',
    isGlass(gBubble) && isGlass(gChip) && /20px/.test(gBubble.radius) && /999px/.test(gChip.radius) &&
    gUser && /42, 167, 155/.test(gUser.bg), { bubble: gBubble && { bg: gBubble.bg, bf: gBubble.bf }, chip: gChip && gChip.radius });
  const color = await ev(`(function(){return {blue:getComputedStyle(document.documentElement).getPropertyValue('--blue').trim(),radius:getComputedStyle(document.querySelector('.doctor-modal')).borderRadius}})()`);
  check('硬约束 · 主色 #2AA79B 与弹窗 24px 圆角未改',
    color && color.blue.toUpperCase() === '#2AA79B' && /24px/.test(color.radius), color);
  const hs1 = await noHScroll();
  check('硬约束 · 桌面无横向溢出', hs1 && hs1.sw <= hs1.iw + 1, hs1);
  const sz0 = await shot('v21-desktop-initial.png', 1440, 1000); console.log('SHOT  v21-desktop-initial.png  ' + sz0 + ' bytes');

  // 拖动性能守卫：左栏磨砂临时关闭，松手恢复
  const sceneR = await ev(`(function(){var r=document.querySelector('#orbScene').getBoundingClientRect();return {x:Math.round(r.left+40),y:Math.round(r.top+40)}})()`);
  await mouse('mousePressed', sceneR.x, sceneR.y, { button: 'left', buttons: 1, clickCount: 1 }); await sleep(40);
  for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', sceneR.x + i * 9, sceneR.y + i * 3, { button: 'left', buttons: 1 }); await sleep(16); }
  const during = await ev(`(function(){return {dragging:!!document.querySelector('#orbScene.is-dragging'),chatBf:getComputedStyle(document.querySelector('.pane-chat')).backdropFilter}})()`);
  await mouse('mouseReleased', sceneR.x + 90, sceneR.y + 30, { button: 'left', buttons: 0, clickCount: 1 }); await sleep(280);
  const afterDrag = await ev(`(function(){return {bf:getComputedStyle(document.querySelector('.pane-chat')).backdropFilter,dragging:!!document.querySelector('#orbScene.is-dragging')}})()`);
  check('验收6 · 拖动小球时左栏磨砂临时关闭、松手恢复（沿用 v20 性能守卫）',
    during && during.dragging && during.chatBf === 'none' && afterDrag && /blur\(24px\)/.test(afterDrag.bf) && !afterDrag.dragging, { during, afterDrag });

  // 功能回归：校医院 → 医生弹窗 → 预约表单 → 我的预约 / 分裂 / 虚线
  const cR = await centerRect();
  await tap(cR.cx, cR.cy); await sleep(700);
  const dm = await ev(`(function(){var m=document.querySelector('#doctorModal');var d=document.querySelector('.doctor-modal');return {open:!!(m&&!m.hidden),cards:document.querySelectorAll('#doctorCards .doc-card').length,glass:isFinite(1)?getComputedStyle(d).backdropFilter:null,radius:getComputedStyle(d).borderRadius}})()`);
  check('功能回归 · 点校医院打开医生弹窗（3 张卡 / 毛玻璃 / 24px）',
    dm && dm.open && dm.cards === 3 && /blur\(20px\)/.test(dm.glass || '') && /24px/.test(dm.radius), dm);
  const szD = await shot('v21-desktop-doctors.png', 1440, 1000); console.log('SHOT  v21-desktop-doctors.png  ' + szD + ' bytes');
  await click('[data-book="zhang"]'); await sleep(420);
  const form = await ev(`(function(){var m=document.querySelector('#leaveModal');var f=document.querySelector('#bookingForm');return {open:!!(m&&!m.hidden),reason:document.querySelector('#lvReason')?document.querySelector('#lvReason').value:null}})()`);
  check('功能回归 · 立即预约 → 专用表单打开且理由预填',
    form && form.open && /校医院就诊/.test(form.reason || ''), form);
  await click('#closeModal'); await sleep(280);
  await click('#bookBtn'); await sleep(320);
  const emptyOk = await ev(`(function(){return /你还没有预约记录/.test(document.querySelector('#chatLog').textContent)})()`);
  check('功能回归 · 「我的预约」空态提示正常', emptyOk);
  const majors = await ev(`(function(){return [].slice.call(document.querySelectorAll('.orb-major:not([hidden])')).map(function(e){var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})})()`);
  let sub = false;
  for (const m of (majors || [])) { await tap(m.cx, m.cy); await sleep(720); sub = await ev(`(function(){var b=document.querySelector('#orbBack');return !!b&&!b.hidden})()`); if (sub) break; }
  check('功能回归 · 三段式分裂动画仍正常', sub);
  if (sub) { await click('#orbBack'); await sleep(780); }
  check('功能回归 · 三条虚线仍在', await ev(`(function(){return document.querySelectorAll('#orbLinkSvg .orb-link').length===3})()`));

  /* ================= 平板 (820x1180, ≤1023) ================= */
  console.log('\n=== 平板 (820x1180) 换竖版背景图 ===');
  await reset(820, 1180, true); await passGates(); await sleep(420);
  const bgT = await bodyCss();
  check('验收7 · 820px 使用 bg-mobile-v2.png（≤1023 切换）',
    bgT && /bg-mobile-v2\.png/.test(bgT.img) && bgT.attach === 'fixed' && bgT.size === 'cover', bgT);
  const szT = await shot('v21-tablet.png', 820, 1180); console.log('SHOT  v21-tablet.png  ' + szT + ' bytes');

  /* ================= 手机 (390x844) ================= */
  console.log('\n=== 手机端 (390x844) 背景 / 抽屉 / 无溢出 ===');
  await reset(390, 844, true); await passGates(); await sleep(420);
  const bgM = await bodyCss();
  const mAll = await ev(`(function(){function s(q){var e=document.querySelector(q);if(!e)return null;var c=getComputedStyle(e);return {bg:c.backgroundColor,color:c.backgroundColor,img:c.backgroundImage,bf:c.backdropFilter}}return {chat:s('.pane-chat'),pane:s('.pane-orb'),scene:s('.orb-scene'),topbar:s('.topbar'),handle:s('.drawer-handle')}})()`);
  check('验收8 · 390px 使用 bg-mobile-v2.png / cover / center / fixed',
    bgM && /bg-mobile-v2\.png/.test(bgM.img) && bgM.size === 'cover' && /50% 50%|center/.test(bgM.pos) && bgM.attach === 'fixed', bgM);
  check('验收8b · 手机右栏/舞台透明、左栏 .58 磨砂、顶栏纯白',
    mAll && isClear(mAll.pane) && isClear(mAll.scene) && /rgba\(255, 255, 255, 0\.58\)/.test(mAll.chat.bg) &&
    /blur\(24px\)/.test(mAll.chat.bf) && mAll.topbar.bg === 'rgb(255, 255, 255)', mAll);
  check('验收8c · 手机抽屉把手仍为 v20 毛玻璃',
    mAll && /rgba\(255, 255, 255, 0\.72\)/.test(mAll.handle.bg) && /blur\(20px\)/.test(mAll.handle.bf), mAll && mAll.handle);
  const hsM = await noHScroll();
  check('验收8d · 390px 无横向溢出', hsM && hsM.sw <= hsM.iw + 1, hsM);
  const szM0 = await shot('v21-mobile-collapsed.png', 390, 844); console.log('SHOT  v21-mobile-collapsed.png  ' + szM0 + ' bytes');

  // 展开抽屉（真实触摸拖拽把手）
  const hR = await ev(`(function(){var r=document.querySelector('#drawerHandle').getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})()`);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hR.cx, y: hR.cy }] });
  for (let i = 1; i <= 6; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: hR.cx, y: hR.cy - i * 45 }] }); await sleep(28); }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(520);
  const drawer = await ev(`(function(){var p=document.querySelector('#chatPane');return {open:p.classList.contains('drawer-open'),transform:getComputedStyle(p).transform,chat:getComputedStyle(p).backgroundColor,bf:getComputedStyle(p).backdropFilter}})()`);
  check('功能回归 · 手机抽屉拖拽展开仍正常，且展开后仍为 .58 磨砂',
    drawer && drawer.open && /rgba\(255, 255, 255, 0\.58\)/.test(drawer.chat) && /blur\(24px\)/.test(drawer.bf), drawer);
  const szM1 = await shot('v21-mobile-open.png', 390, 844); console.log('SHOT  v21-mobile-open.png  ' + szM1 + ' bytes');

  // 收起抽屉 → 点校医院 → 医生弹窗，验证透明背景下弹窗层级
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.close)window.XT_DRAWER.close();return 1})()`); await sleep(460);
  const cM = await centerRect();
  await tap(cM.cx, cM.cy); await sleep(700);
  const dmM = await ev(`(function(){var m=document.querySelector('#doctorModal');var d=document.querySelector('.doctor-modal');var t=document.querySelector('.topbar');return {open:!!(m&&!m.hidden),w:d?Math.round(d.getBoundingClientRect().width):0,top:Math.round(m.getBoundingClientRect().top),tb:Math.round(t.getBoundingClientRect().bottom),bf:d?getComputedStyle(d).backdropFilter:null}})()`);
  const hsM2 = await noHScroll();
  check('功能回归 · 手机医生弹窗不遮顶栏、92vw、毛玻璃、无溢出',
    dmM && dmM.open && Math.abs(dmM.w - Math.round(390 * 0.92)) <= 2 && dmM.top >= dmM.tb - 1 &&
    /blur\(20px\)/.test(dmM.bf || '') && hsM2.sw <= hsM2.iw + 1, { dmM, hsM2 });
  const szMD = await shot('v21-mobile-doctors.png', 390, 844); console.log('SHOT  v21-mobile-doctors.png  ' + szMD + ' bytes');

  // 验收9：无 jsError
  check('验收9 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  if (pass !== results.length) process.exitCode = 1;
  ws.close();
}
main().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
