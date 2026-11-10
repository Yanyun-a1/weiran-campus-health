/* 校园健康助手 v7「指针交互重做」无头浏览器验收
 * 用法：node e2e-v7.js [URL]   依赖本机 9222 端口的无头 Chrome（CDP）
 * 交互验证尽量走 CDP 真实鼠标 / 触摸输入（Input.dispatch*），
 * 而不是只在页面里 dispatch 合成事件。
 */
const fs = require('fs');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CDP = 'http://127.0.0.1:9222';
const APP = 'E:/gzkj/xiaotong/';
const BACKUP = 'E:/gzkj/backups/xiaotong-v6-2026-11-11/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

async function main() {
  let targets = await (await fetch(CDP + '/json/list')).json();
  let page = targets.find(t => t.type === 'page');
  if (!page) {
    await fetch(CDP + '/json/new?' + encodeURIComponent(URL_), { method: 'PUT' });
    await sleep(800);
    targets = await (await fetch(CDP + '/json/list')).json();
    page = targets.find(t => t.type === 'page');
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let seq = 0;
  const pending = new Map();
  const jsErrors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      jsErrors.push((d.text || '') + ' ' + ((d.exception && d.exception.description) || ''));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      jsErrors.push('console: ' + m.params.args.map(a => a.value || a.description).join(' '));
    }
  });
  const send = (method, params = {}) => new Promise(res => {
    const id = ++seq; pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJS = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const navigate = async (url, wait = 3000) => { await send('Page.navigate', { url }); await sleep(wait); };
  const reload = async (wait = 3000) => { await send('Page.reload'); await sleep(wait); };
  const setWidth = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 769 });
    await sleep(600);
  };
  const clearState = () => evalJS(`(function(){['xiaotong.ui.v1','xiaotong.identity.v1','xiaotong.intro.v1'].forEach(function(k){localStorage.removeItem(k)});return true})()`);
  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const v = await evalJS(expr); if (v) return v; await sleep(300); }
    return null;
  };
  const sendText = t => evalJS(`(function(){var i=document.querySelector('#userInput');i.value=${JSON.stringify(t)};document.querySelector('#sendBtn').click();return true})()`);
  const waitText = (needle, timeout = 25000) =>
    waitFor(`(function(){var l=document.querySelector('#chatLog');return !!l&&l.innerText.indexOf(${JSON.stringify(needle)})>=0})()`, timeout);

  /* ===== CDP 真实输入 ===== */
  const mouseDown = (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  const mouseMove = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 1 });
  const mouseUp = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  const touchStart = (x, y) => send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 0 }] });
  const touchMove = (x, y) => send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 0 }] });
  const touchEnd = () => send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  const GEO = `(function(){
    var s=document.querySelector('#orbScene').getBoundingClientRect();
    var r=function(e){var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),
      w:Math.round(b.width),h:Math.round(b.height),left:Math.round(b.left),right:Math.round(b.right)}};
    return {scene:{cx:Math.round(s.left+s.width/2),cy:Math.round(s.top+s.height/2),left:Math.round(s.left),right:Math.round(s.right),top:Math.round(s.top),bottom:Math.round(s.bottom)},
      balls:[].slice.call(document.querySelectorAll('.orb-major')).map(r),
      back:(function(){var b=document.querySelector('#orbBack'),q=b.getBoundingClientRect();return {x:Math.round(q.left+q.width/2),y:Math.round(q.top+q.height/2)}})()};})()`;
  const geo = () => evalJS(GEO);
  const SNAP = `(function(){
    var its=[].slice.call(document.querySelectorAll('.orb-major'));
    return {state:window.__orbState(),
      px:its.map(function(i){return parseFloat(i.style.getPropertyValue('--px'))}),
      sc:its.map(function(i){return parseFloat(i.style.getPropertyValue('--sc'))}),
      w:its.map(function(i){return Math.round(i.getBoundingClientRect().width)}),
      h:its.map(function(i){return Math.round(i.getBoundingClientRect().height)}),
      dragging:document.querySelector('#orbScene').classList.contains('is-dragging'),
      cursor:getComputedStyle(document.querySelector('#orbScene')).cursor,
      selection:(window.getSelection()?window.getSelection().toString():''),
      scrollY:window.scrollY,
      split:document.querySelector('#orbStage').classList.contains('major-out'),
      minorGroup:(function(){var m=document.querySelector('.orb-minor.is-current');return m?m.getAttribute('data-group'):null})(),
      minorCount:document.querySelectorAll('.orb-minor.is-current').length,
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};})()`;
  const snap = () => evalJS(SNAP);
  const resetAll = async () => {
    await evalJS(`(function(){if(document.querySelector('.page').classList.contains('orb-split'))document.querySelector('#orbBack').click();
      document.querySelector('#orbDetail').hidden=true;document.querySelector('#orbDetailBackdrop').hidden=true;
      document.body.style.overflow='';return true})()`);
    await sleep(650);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await setWidth(1440, 900);
  await navigate(URL_, 2500);
  await clearState();
  await reload();
  const g = await geo();
  console.log('GEO:', JSON.stringify(g));
  const s0 = await snap();
  console.log('S0:', JSON.stringify({ state: s0.state, px: s0.px, w: s0.w }));

  /* ===== 硬约束：v6 的视觉与投影公式逐字未改 ===== */
  const v6css = fs.readFileSync(BACKUP + 'orb-view.css', 'utf8');
  const v7css = fs.readFileSync(APP + 'orb-view.css', 'utf8');
  const v6js = fs.readFileSync(BACKUP + 'orb-view.js', 'utf8');
  const v7js = fs.readFileSync(APP + 'orb-view.js', 'utf8');
  const skipCss = l => /^\s*(\/\*|\*|\*\/)/.test(l) || /\.orb-scene\.dragging/.test(l);
  const cssMissing = v6css.split('\n').filter(l => l.trim() && !skipCss(l)).filter(l => v7css.indexOf(l) < 0);
  const cut = (txt, a, b) => txt.slice(txt.indexOf(a), txt.indexOf(b, txt.indexOf(a)));
  const projSame = cut(v6js, 'function applyProjection(', '/* 规格里的缓动') === cut(v7js, 'function applyProjection(', '/* 规格里的缓动');
  const orbSame = cut(v6js, 'var ORBS = [', 'function shade(') === cut(v7js, 'var ORBS = [', 'function shade(');
  const htmlSame = cut(v6js, 'function itemHtml(', 'var MAJORS') === cut(v7js, 'function itemHtml(', 'var MAJORS');
  const css6 = v7css;
  const cssRulesOK = ['user-select: none', '-webkit-user-select: none', '-webkit-touch-callout: none',
    'overscroll-behavior: contain', '-webkit-user-drag: none', '.orb-scene.is-dragging'].every(s => css6.indexOf(s) >= 0);
  check('硬约束 · 视觉/尺寸/配色/投影公式逐字未改，只新增指针交互 CSS 规则',
    cssMissing.length === 0 && projSame && orbSame && htmlSame && cssRulesOK &&
    /--R: 250px/.test(css6) && /--d: 150px/.test(css6) && /--R: 175px/.test(css6) && /--d: 200px/.test(css6) &&
    /var k = CAMERA_D \/ \(CAMERA_D - z2\)/.test(v7js),
    { cssMissing, projSame, orbSame, htmlSame, cssRulesOK });

  /* ===== 验收 1 / 2 / 3 / 8：空白处按住拖动（真实鼠标） ===== */
  await mouseDown(g.scene.cx, g.scene.cy);
  await mouseMove(g.scene.cx - 120, g.scene.cy);
  await sleep(220);
  const d1 = await snap();
  console.log('BLANK_DRAG:', JSON.stringify({ state: d1.state, px: d1.px, dragging: d1.dragging, cursor: d1.cursor, selection: d1.selection }));
  check('验收1 · 透明背景任意空白处按住拖动，三个球都跟着转',
    Math.abs(d1.state.ry) > 25 && d1.state.pointerId !== null && d1.state.isDragging &&
    d1.px.every((v, i) => Math.abs(v - s0.px[i]) > 5) && d1.sc.some((v, i) => Math.abs(v - s0.sc[i]) > .05),
    { ry: +d1.state.ry.toFixed(2), px0: s0.px, px1: d1.px });
  check('验收2 · 拖动过程中不选中任何文字、无蓝色选区',
    d1.selection === '' && await evalJS(`(function(){var s=document.querySelector('#orbScene'),i=document.querySelector('.orb-item'),t=document.querySelector('.orb-text');
      return [getComputedStyle(s).userSelect,getComputedStyle(i).userSelect,getComputedStyle(t).webkitUserSelect||getComputedStyle(t).userSelect].join('/')})()`) === 'none/none/none',
    { selection: d1.selection });
  check('验收8 · 拖动中光标 grabbing，松手后恢复 grab',
    d1.dragging && d1.cursor === 'grabbing' && /\.orb-scene\.is-dragging \{ cursor: grabbing; \}/.test(css6),
    { dragging: d1.dragging, cursor: d1.cursor });
  const native = await evalJS(`(function(){
    var b=document.querySelector('.orb-major'),out={};
    ['dragstart','contextmenu'].forEach(function(t){var e=new Event(t,{bubbles:true,cancelable:true});b.dispatchEvent(e);out[t]=e.defaultPrevented});
    return out})()`);
  check('验收3 · 原生拖拽 / 长按菜单 / 手势被挡住，无图片可拖',
    native.dragstart && native.contextmenu &&
    await evalJS(`(function(){var s=getComputedStyle(document.querySelector('#orbScene'));
      return s.touchAction==='none'&&document.querySelectorAll('img').length===0&&!/three/i.test([].slice.call(document.scripts).map(function(x){return x.src}).join(''))})()`) &&
    /-webkit-touch-callout: none/.test(css6) && /-webkit-user-drag: none/.test(css6),
    native);
  await mouseUp(g.scene.cx - 120, g.scene.cy);
  await sleep(620);
  const d1end = await snap();
  check('验收8b · 松手后光标恢复 grab、状态复位、角度归零',
    !d1end.dragging && d1end.cursor === 'grab' && d1end.state.pointerId === null &&
    !d1end.state.isDragging && Math.abs(d1end.state.ry) < .01 && d1end.state.mode === 'idle' &&
    d1end.px.every((v, i) => Math.abs(v - s0.px[i]) < .5),
    { cursor: d1end.cursor, state: d1end.state });

  /* ===== 验收 6 / 7：单击空白、拖动 >8px 松手都不分裂 ===== */
  await mouseDown(g.scene.cx, g.scene.cy); await mouseUp(g.scene.cx, g.scene.cy);
  await sleep(300);
  const cBlank = await snap();
  check('验收6 · 单击空白不触发分裂，只做回弹',
    !cBlank.split && cBlank.minorCount === 0 && Math.abs(cBlank.state.ry) < .01 &&
    cBlank.state.pointerId === null && cBlank.px.every((v, i) => Math.abs(v - s0.px[i]) < .5),
    { split: cBlank.split, state: cBlank.state });

  await mouseDown(g.scene.cx, g.scene.cy);
  await mouseMove(g.scene.cx + 100, g.scene.cy);
  await sleep(160);
  await mouseUp(g.scene.cx + 100, g.scene.cy);
  await sleep(620);
  const cDrag = await snap();
  check('验收7 · 拖动超过 8px 后松手不触发分裂',
    !cDrag.split && cDrag.minorCount === 0 && !cDrag.dragging && Math.abs(cDrag.state.ry) < .01,
    { split: cDrag.split, ry: cDrag.state.ry });

  /* 按在球上也应能拖，不能只允许点击 */
  await mouseDown(g.balls[0].x, g.balls[0].y);
  await mouseMove(g.balls[0].x - 110, g.balls[0].y);
  await sleep(200);
  const onBallDrag = await snap();
  await mouseUp(g.balls[0].x - 110, g.balls[0].y);
  await sleep(620);
  const onBallEnd = await snap();
  check('验收7b · 按在球上拖动照样旋转且松手不分裂',
    Math.abs(onBallDrag.state.ry) > 25 && onBallDrag.state.downOrb === '食品健康' &&
    !onBallEnd.split && onBallEnd.minorCount === 0 && Math.abs(onBallEnd.state.ry) < .01,
    { ry: +onBallDrag.state.ry.toFixed(2), downOrb: onBallDrag.state.downOrb, split: onBallEnd.split });

  /* ===== 验收 9：拖到容器外再松手，状态复位 ===== */
  const outX = Math.min(1430, g.scene.right + 40);
  await mouseDown(g.scene.cx, g.scene.cy);
  await mouseMove(outX, g.scene.cy);
  await sleep(180);
  const outsideDrag = await snap();
  await mouseUp(outX, g.scene.cy);
  await sleep(620);
  const outsideEnd = await snap();
  check('验收9 · 拖到容器外再松手仍能复位，不卡在拖动状态',
    Math.abs(outsideDrag.state.ry) > 20 && outsideDrag.state.pointerId !== null &&
    !outsideEnd.dragging && outsideEnd.state.pointerId === null && !outsideEnd.state.isDragging &&
    outsideEnd.state.mode === 'idle' && Math.abs(outsideEnd.state.ry) < .01 &&
    outsideEnd.px.every((v, i) => Math.abs(v - s0.px[i]) < .5),
    { outX, during: outsideDrag.state, after: outsideEnd.state });

  /* ===== 验收 5：单击任意一个球，打开对应细分种类（真实鼠标） ===== */
  for (let i = 0; i < 3; i++) {
    const b = g.balls[i];
    const id = ['food', 'sleep', 'sport'][i];
    await mouseDown(b.x, b.y); await mouseUp(b.x, b.y);
    await sleep(900);
    const st = await snap();
    check('验收5.' + (i + 1) + ' · 单击「' + ['食品健康', '作息健康', '运动健康'][i] + '」打开对应细分种类',
      st.split && st.minorCount === 3 && st.minorGroup === id && st.state.layer === 'minor',
      { split: st.split, group: st.minorGroup, count: st.minorCount, ry: st.state.ry });
    await resetAll();
  }

  /* ===== 验收 10：中球层同一套事件，空白处可拖、点中球开详情 ===== */
  await mouseDown(g.balls[0].x, g.balls[0].y); await mouseUp(g.balls[0].x, g.balls[0].y);
  await sleep(900);
  /* 分裂后切换器被隐藏，场景会整体上移，重新取一次当前几何 */
  const g2 = await geo();
  const minGeo = await evalJS(`(function(){var m=[].slice.call(document.querySelectorAll('.orb-minor.is-current'));
    var r=function(e){var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}};
    return {balls:m.map(r),name:m[0].getAttribute('data-mod'),desc:m[0].getAttribute('data-desc')};})()`);
  await mouseDown(g2.scene.cx, g2.scene.cy);
  await mouseMove(g2.scene.cx - 90, g2.scene.cy);
  await sleep(200);
  const minorDrag = await evalJS(`(function(){var m=[].slice.call(document.querySelectorAll('.orb-minor.is-current'));
    return {state:window.__orbState(),px:m.map(function(x){return parseFloat(x.style.getPropertyValue('--px'))}),
      dragging:document.querySelector('#orbScene').classList.contains('is-dragging')};})()`);
  await mouseUp(g2.scene.cx - 90, g2.scene.cy);
  await sleep(620);
  check('验收10a · 中球层同样支持空白处拖动（同一套 scene 事件）',
    Math.abs(minorDrag.state.ry) > 20 && minorDrag.state.layer === 'minor' && minorDrag.dragging &&
    new Set(minorDrag.px.map(v => v.toFixed(1))).size >= 2 &&
    Math.abs((await snap()).state.ry) < .01,
    { ry: +minorDrag.state.ry.toFixed(2), px: minorDrag.px });

  await mouseDown(minGeo.balls[0].x, minGeo.balls[0].y);
  await mouseUp(minGeo.balls[0].x, minGeo.balls[0].y);
  await sleep(550);
  const detail = await evalJS(`(function(){var p=document.querySelector('#orbDetail');return {
    hidden:p.hidden,open:p.classList.contains('open'),w:Math.round(p.getBoundingClientRect().width),
    title:document.querySelector('#orbDetailTitle').innerText,desc:document.querySelector('#orbDetailDesc').innerText};})()`);
  check('验收10b · 点中球仍滑出详情面板，标题与占位文案正确',
    !detail.hidden && detail.open && detail.w === 480 &&
    detail.title === minGeo.name && detail.desc === minGeo.desc, detail);
  await evalJS(`(function(){document.querySelector('#orbDetailBack').click();return true})()`);
  await sleep(500);

  /* 返回按钮：pointerup 的 downBack 分支（原生 click 可能不触发） */
  await mouseDown(g.balls[0].x, g.balls[0].y); await mouseUp(g.balls[0].x, g.balls[0].y);
  await sleep(900);
  const g3 = await geo();
  await mouseDown(g3.back.x, g3.back.y); await mouseUp(g3.back.x, g3.back.y);
  await sleep(450);
  const backState = await snap();
  check('验收10c · 左上角返回按钮仍可用，分裂倒放回到三大球',
    !backState.split && backState.state.layer === 'major' && backState.minorCount === 0,
    { layer: backState.state.layer, split: backState.split });

  /* ===== 回归：对话视图 / 30 条问答 / 问数 / 请假 / 9 条文案 / 无横向滚动 ===== */
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="chat"]').click();return true})()`);
  await sleep(250);
  await sendText('请假流程');
  const qaOk = await waitText('请假流程怎么走');
  const exp = await evalJS(`(function(){var D=window.XIAOTONG_CAMPUS_DATA,Q=window.XiaoTongData;return Q.compute.schedule('我明天有什么课',D.identities[0]).lead})()`);
  await sendText('我明天有什么课');
  const dqOk = await waitText(exp);
  await evalJS(`(function(){document.querySelector('#faqOpenBtn').click();return true})()`);
  await sleep(250);
  const faq = await evalJS(`(function(){var m=document.querySelector('#faqModal');return {tabs:m.querySelectorAll('.faq-tab').length,items:m.querySelectorAll('.faq-q').length}})()`);
  await evalJS(`(function(){document.querySelector('#closeFaq').click();return true})()`);
  await sendText('我要请假三天');
  const formOk = await waitFor(`(function(){return !document.querySelector('#leaveModal').hidden})()`, 20000);
  const form = await evalJS(`(function(){return document.querySelectorAll('#leaveModal .field').length})()`);
  const descs = await evalJS(`(function(){return [].slice.call(document.querySelectorAll('.orb-minor')).map(function(m){return m.getAttribute('data-mod')+'|'+m.getAttribute('data-desc')})})()`);
  check('回归 · 对话视图 30 条问答 / 问数 / 请假表单 / 9 条占位文案 / 无横向滚动条全部未受影响',
    !!qaOk && !!dqOk && faq.tabs === 10 && faq.items === 30 && !!formOk && form === 6 &&
    descs.length === 9 && descs[0] === '菜品营养|每道菜的热量、蛋白质、脂肪、钠含量与搭配建议' &&
    s0.scrollWidth <= s0.clientWidth + 1,
    { qaOk: !!qaOk, dqOk: !!dqOk, faq, form, descs: descs.length, scrollWidth: s0.scrollWidth });
  await evalJS(`(function(){document.querySelector('#leaveModal').hidden=true;document.body.style.overflow='';
    document.querySelector('.ui-seg[data-view="orb"]').click();return true})()`);
  await sleep(350);

  /* ===== 验收 4 / 11：390px 真实触摸拖动不滚动页面 ===== */
  await setWidth(390, 844);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await reload();
  const mg = await geo();
  const m0 = await snap();
  await touchStart(mg.scene.cx, mg.scene.cy);
  const touchFrames = [];
  for (let i = 1; i <= 5; i++) {
    await touchMove(mg.scene.cx - i * 12, mg.scene.cy);
    await sleep(25);
    touchFrames.push((await snap()).px[2]);
  }
  const tm = await snap();
  await touchEnd();
  await sleep(620);
  const afterTouch = await snap();
  const touchCss = await evalJS(`(function(){var s=getComputedStyle(document.querySelector('#orbScene'));
    return {touchAction:s.touchAction,overscroll:s.overscrollBehavior,select:s.userSelect}})()`);
  check('验收4 · 390px 手指拖动不会变成页面滚动（touch-action / overscroll 生效）',
    tm.scrollY === m0.scrollY && afterTouch.scrollY === m0.scrollY &&
    touchCss.touchAction === 'none' && /contain/.test(touchCss.overscroll) && touchCss.select === 'none' &&
    Math.abs(tm.state.ry) > 15 && tm.state.pointerId !== null,
    { scrollBefore: m0.scrollY, during: tm.scrollY, after: afterTouch.scrollY, ry: +tm.state.ry.toFixed(2), css: touchCss });
  check('验收11 · 390px 触摸拖动逐帧流畅、无横向滚动、松手复位',
    new Set(touchFrames.map(v => v.toFixed(1))).size >= 4 &&
    tm.scrollWidth <= tm.clientWidth + 1 &&
    Math.abs(afterTouch.state.ry) < .01 && afterTouch.state.pointerId === null && !afterTouch.dragging,
    { frames: touchFrames.map(v => +v.toFixed(1)), scrollWidth: tm.scrollWidth, clientWidth: tm.clientWidth });

  /* ===== 验收 12：无 jsError ===== */
  check('验收12 · 全流程无 jsError', jsErrors.length === 0, { jsErrors });

  const pass = results.filter(r => r.ok).length;
  console.log('\n===== SUMMARY =====');
  console.log('TOTAL ' + results.length + ' PASS ' + pass + ' FAIL ' + (results.length - pass));
  if (pass !== results.length) console.log('FAILED:\n' + results.filter(r => !r.ok).map(r => ' - ' + r.name).join('\n'));
  ws.close();
  if (pass !== results.length) process.exitCode = 1;
}
main().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
