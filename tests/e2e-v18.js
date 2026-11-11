/* 校园健康助手 · v18 中心「校医院」球 + 三条虚线 专项验收
 * 用法：node e2e-v18.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖 11 条验收：
 *   1 桌面端三角形中心有「校医院」球(白系/与彩色球区分明显)
 *   2 三条虚线从种类球连到中心球,线条很淡,不抢主视觉
 *   3 虚线有流动动画
 *   4 点任意种类球,分裂动画和之前一致(回归)
 *   5 点中心球,三个种类球内吸再弹回+中心球放大再回位(汇聚)
 *   6 点中心球后,对话面板只出现两条预约消息,不弹请假条表单(v18 修正)
 *   6b 回归:既有请假入口(左栏预约校医按钮)仍能打开请假表单
 *   6c 纯对话可继续:点中心球后在输入框描述症状,正常追加对话且仍不弹请假条
 *   7 手机端中心球正常显示,虚线已隐藏
 *   8 手机端点中心球,抽屉自动展开 + 两条预约消息,且不弹请假条
 *   9 拖动小球舞台,中心球与虚线跟着整体平移,不变形
 *   10 390px 下四个球不重叠
 *   11 全流程无 jsError
 * 只在本地 8123 跑；本脚本不发布,由调用方发布。
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
  const centerRect = () => ev(`(function(){var c=document.querySelector('#orbCenter');if(!c)return null;var r=c.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),w:Math.round(r.width),h:Math.round(r.height),l:Math.round(r.left),t:Math.round(r.top),rgt:Math.round(r.right),b:Math.round(r.bottom)}}())`);
  const centerInfo = () => ev(`(function(){
    var c=document.querySelector('#orbCenter'); if(!c) return null;
    var cs=getComputedStyle(c); var label=c.querySelector('.oc-label');
    return {w:Math.round(c.getBoundingClientRect().width), h:Math.round(c.getBoundingClientRect().height),
      bg:cs.backgroundImage, border:cs.borderTopColor, label:label?label.textContent:null,
      isMajor:c.classList.contains('orb-major'), isMinor:c.classList.contains('orb-minor'), z:cs.zIndex};
  })()`);
  const linesInfo = () => ev(`(function(){
    var p=[].slice.call(document.querySelectorAll('#orbLinkSvg .orb-link'));
    return p.map(function(e){var cs=getComputedStyle(e);return {d:e.getAttribute('d'), stroke:cs.stroke, anim:cs.animationName, da:cs.strokeDasharray, w:cs.strokeWidth};});
  })()`);
  const mobileLinesDisplay = () => ev(`(function(){var s=document.querySelector('#orbLinkSvg');if(!s)return null;return getComputedStyle(s).display})()`);
  const overlapCheck = () => ev(`(function(){
    var c=document.querySelector('#orbCenter'); if(!c) return null;
    var cr=c.getBoundingClientRect();
    var balls=[].slice.call(document.querySelectorAll('.orb-major:not([hidden])')).map(function(e){return e.getBoundingClientRect();});
    function noOverlap(a,b){return (a.bottom<=b.top||a.top>=b.bottom||a.right<=b.left||a.left>=b.right);}
    var ok = balls.every(function(b){return noOverlap(cr,b);});
    return {center:{l:Math.round(cr.left),t:Math.round(cr.top),r:Math.round(cr.right),b:Math.round(cr.bottom)}, ok:ok, balls:balls.length};
  })()`);

  /* ================= 桌面端 (1440) ================= */
  console.log('\n=== 桌面端 (1440x1000) 中心球 + 虚线 ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(400);

  // 验收1：中心球存在且为白系、与彩色球区分、尺寸正圆、文字「校医院」
  const ci = await centerInfo();
  check('验收1 · 桌面端中心「校医院」球存在(白系渐变/正圆/文字正确/非彩色球)',
    ci && ci.label === '校医院' && !ci.isMajor && !ci.isMinor && Math.abs(ci.w - ci.h) <= 2 && /gradient/.test(ci.bg) && /42, 167, 155/.test(ci.border), ci);

  // 验收2：三条虚线存在、很淡、不抢视觉
  const li = await linesInfo();
  check('验收2 · 三条虚线存在且很淡(淡青/虚线/细线)',
    li && li.length === 3 && li.every(x => x.d && x.d.length > 5 && /42, 167, 155/.test(x.stroke) && /4/.test(x.da) && /6/.test(x.da) && parseFloat(x.w) === 1), li);

  // 验收3：流动动画
  const flowOn = li && li.length === 3 && li.every(x => x.anim === 'orbFlow');
  check('验收3 · 三条虚线有流动动画(orbFlow)', flowOn, li ? li.map(x => x.anim) : null);

  const szC = await shot('v18-desktop-initial.png', 1440, 1000); console.log('SHOT  v18-desktop-initial.png  ' + szC + ' bytes');

  // 验收4（回归）：点任意种类球，分裂动画与之前一致（进入 sub + 追加概览消息）
  const enteredD = await enterSubViaTap();
  check('验收4-前置 · 桌面端点种类球仍能进入中球层(is-sub)', enteredD, { enteredD });
  const splitMsg = await ev(`(function(){var log=document.querySelector('#chatLog');return /包含三个模块/.test(log.textContent)})()`);
  check('验收4 · 点种类球分裂动画与之前一致(追加概览消息)', enteredD && splitMsg, { splitMsg });
  // 返回大球层
  await ev(`(function(){var b=document.querySelector('#orbBack');if(b)b.click();return 1})()`); await sleep(750);
  const backD = await ev(`(function(){var b=document.querySelector('#orbBack');var s=document.querySelector('.orb-stage');var p=document.querySelector('.page');return {hidden:!!(b&&b.hidden), isSub:!!(s&&s.classList.contains('is-sub')), orbSplit:!!(p&&p.classList.contains('orb-split'))}})()`);
  check('验收4-清理 · 返回后回到大球层(中心球重现)', backD && backD.hidden && !backD.isSub && !backD.orbSplit, backD);

  // 验收9：拖动舞台，中心球与虚线跟随（中心保持正圆且在中心；连线随大球重算）
  const cBefore = await centerRect();
  const dBefore = (await linesInfo() || []).map(x => x.d);
  await ev(`(function(){ if(window.__orbApply) window.__orbApply(30, 14); return 1; })()`); await sleep(200);
  const cAfter = await centerRect();
  const dAfter = (await linesInfo() || []).map(x => x.d);
  const sceneC = await ev(`(function(){var s=document.querySelector('#orbScene');var r=s.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}}())`);
  const centerFixed = cAfter && cBefore && Math.abs(cAfter.cx - cBefore.cx) <= 2 && Math.abs(cAfter.cy - cBefore.cy) <= 2
    && sceneC && Math.abs(cAfter.cx - sceneC.cx) <= 3 && Math.abs(cAfter.cy - sceneC.cy) <= 3
    && Math.abs(cAfter.w - cAfter.h) <= 2;
  const linesFollow = dAfter.length === 3 && dBefore.length === 3 && dAfter.some((d, i) => d !== dBefore[i]);
  check('验收9 · 拖动后中心球保持正圆且在舞台中心(不变形/不平移)', centerFixed, { cBefore, cAfter, sceneC });
  check('验收9 · 拖动后三条虚线随大球重算(跟随)', linesFollow, { dBefore, dAfter });

  // 验收5 + 6：点中心球 → 汇聚 + 对话面板出现两条预约消息，且「不弹请假条」
  // 先把角度回正
  await ev(`(function(){ if(window.__orbApply) window.__orbApply(0, 0); return 1; })()`); await sleep(150);
  const cTap = await centerRect();
  await tap(cTap.cx, cTap.cy);
  // 采样汇聚动画：立刻轮询 --cv，确认大球内吸 + 中心放大出现过
  let sawMajorScale = false, sawCenterScale = false;
  for (let i = 0; i < 12; i++) {
    const s = await ev(`(function(){
      var ms=[].slice.call(document.querySelectorAll('.orb-major')).map(function(m){return m.style.getPropertyValue('--cv');});
      var c=document.querySelector('#orbCenter'); var cv=c?c.style.getPropertyValue('--cv'):'';
      return {ms:ms, c:cv};
    })()`);
    if (s && s.ms.some(v => v && parseFloat(v) < 0.999)) sawMajorScale = true;
    if (s && s.c && parseFloat(s.c) > 1.05) sawCenterScale = true;
    await sleep(25);
  }
  await sleep(400);
  const conv = await ev(`(function(){
    var log=document.querySelector('#chatLog');
    var hasUser=/我要预约校医/.test(log.textContent);
    var hasBot=/请问你哪里不舒服/.test(log.textContent);
    var modal=document.querySelector('#leaveModal');
    var form=document.querySelector('#leaveForm');
    var p=document.querySelector('.page');
    var back=document.querySelector('#orbBack');
    return {hasUser:hasUser, hasBot:hasBot, modalOpen:!!(modal&&!modal.hidden), formShown:!!form,
      orbSplit:!!(p&&p.classList.contains('orb-split')), backHidden:!!(back&&back.hidden)};
  })()`);
  check('验收5 · 点中心球触发汇聚(大球内吸 + 中心放大)', sawMajorScale && sawCenterScale, { sawMajorScale, sawCenterScale });
  check('验收6 · 点中心球后对话面板出现两条预约消息,且不弹请假条',
    conv && conv.hasUser && conv.hasBot && !conv.modalOpen && !conv.formShown && !conv.orbSplit && conv.backHidden, conv);
  // 桌面端截图：本轮起无弹窗，直接拍对话面板里的两条预约消息
  const szDC = await shot('v18-desktop-center-chat.png', 1440, 1000); console.log('SHOT  v18-desktop-center-chat.png  ' + szDC + ' bytes');

  // 验收6c（纯对话可继续）：点中心球后在输入框描述症状，对话正常接上，且仍不弹请假条
  // 放在 6b 之前，此时页面从未打开过请假表单，可直接用「DOM 里没有 #leaveForm」这个硬判据
  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='我这两天有点头晕，睡得不太好';return 1})()`);
  await click('#sendBtn'); await sleep(900);
  const followUp = await ev(`(function(){var log=document.querySelector('#chatLog');var m=document.querySelector('#leaveModal');var f=document.querySelector('#leaveForm');return {hasSymptom:/头晕/.test(log.textContent), botN:log.querySelectorAll('.msg-bot').length, modalOpen:!!(m&&!m.hidden), formShown:!!f}})()`);
  check('验收6c · 纯对话可继续:描述症状后追加对话且仍不弹请假条',
    followUp && followUp.hasSymptom && followUp.botN >= 2 && !followUp.modalOpen && !followUp.formShown, followUp);

  // 验收6b（回归）：既有请假入口未被破坏 —— 左栏「预约校医」按钮仍能打开请假表单
  await click('#bookBtn'); await sleep(350);
  const leaveReg = await ev(`(function(){var m=document.querySelector('#leaveModal');var f=document.querySelector('#leaveForm');var t=document.querySelector('#leaveTitle');return {modalOpen:!!(m&&!m.hidden),formShown:!!f,title:t?t.textContent:null}})()`);
  check('验收6b · 既有请假入口仍可用(左栏预约校医按钮打开请假表单)',
    leaveReg && leaveReg.modalOpen && leaveReg.formShown && /请假条/.test(leaveReg.title), leaveReg);
  await click('#closeModal'); await sleep(250);

  /* ================= 手机端 (390) ================= */
  console.log('\n=== 手机端 (390x844) 中心球 + 抽屉 ===');
  await reset(390, 844, true);
  await passGates();
  await sleep(400);

  // 验收7：手机端中心球显示、虚线隐藏
  const ciM = await centerInfo();
  const dispM = await mobileLinesDisplay();
  check('验收7 · 手机端中心球正常显示', ciM && ciM.label === '校医院' && Math.abs(ciM.w - ciM.h) <= 2, ciM);
  check('验收7 · 手机端三条虚线已隐藏(display:none)', dispM === 'none', { dispM });

  const szMI = await shot('v18-mobile-initial.png', 390, 844); console.log('SHOT  v18-mobile-initial.png  ' + szMI + ' bytes');

  // 验收10：390 四球不重叠
  const ovM = await overlapCheck();
  const hsM = await noHScroll();
  check('验收10 · 390px 下四个球(中心+三彩色)不重叠,无横滚', ovM && ovM.ok && hsM && hsM.sw <= hsM.iw + 1, { ov: ovM, hs: hsM });

  // 验收8：手机端点中心球 → 抽屉自动展开 + 对话出现预约消息，且不弹请假条
  const cTapM = await centerRect();
  await tap(cTapM.cx, cTapM.cy);
  await sleep(500);
  const convM = await ev(`(function(){
    var log=document.querySelector('#chatLog');
    var hasUser=/我要预约校医/.test(log.textContent);
    var hasBot=/请问你哪里不舒服/.test(log.textContent);
    var drawer=document.querySelector('#chatPane');
    var modal=document.querySelector('#leaveModal');
    var form=document.querySelector('#leaveForm');
    return {hasUser:hasUser, hasBot:hasBot, drawerOpen:!!(drawer&&drawer.classList.contains('drawer-open')),
      modalOpen:!!(modal&&!modal.hidden), formShown:!!form};
  })()`);
  check('验收8 · 手机端点中心球:抽屉自动展开 + 对话出现预约消息,且不弹请假条',
    convM && convM.hasUser && convM.hasBot && convM.drawerOpen && !convM.modalOpen && !convM.formShown, convM);
  // 本轮起无弹窗，直接拍展开后的抽屉与两条预约消息
  const szMD = await shot('v18-mobile-center-drawer.png', 390, 844); console.log('SHOT  v18-mobile-center-drawer.png  ' + szMD + ' bytes');

  // 验收 11：无 jsError
  check('验收11 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  fs.writeFileSync(DIR + 'e2e-v18.log', results.map(r => (r.ok ? 'PASS  ' : 'FAIL  ') + r.name).join('\n') + '\n\n' + pass + '/' + results.length + ' PASS');
  ws.close();
  process.exit(pass === results.length ? 0 : 1);
}
main().catch(e => { console.error('FATAL', e); process.exit(2); });
