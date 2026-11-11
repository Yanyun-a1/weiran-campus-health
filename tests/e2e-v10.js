/* v10 · 交互专项验收（消息 13 的 12 条标准）+ 四张状态截图
 * 用法：node e2e-v10.js [URL]   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 桌面用 CDP 真实鼠标，手机用 CDP 真实触摸；不注入任何模拟 pointer 事件。
 * 全程只读项目文件，不改动 xiaotong/ 下任何内容。
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
  let page = targets.find(t => t.type === 'page' && t.url.indexOf('8123') >= 0) || targets.find(t => t.type === 'page');
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
  const shot = async file => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  const setViewport = async (w, h, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await sleep(450);
  };
  const fresh = async (w, h, mobile) => {
    await setViewport(w, h, mobile);
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.navigate', { url: URL_ });
    await sleep(1400);
    await ev(`(function(){try{localStorage.setItem('xiaotong.intro.v1','1');localStorage.setItem('xiaotong.ui.v1','orb');}catch(e){}return 1})()`);
    await send('Page.reload');
    await sleep(2300);
    await ev(`(function(){var m=document.querySelector('#introModal');if(m)m.hidden=true;document.body.style.overflow='';
      window.__v10={drag:0,sel:0,ctx:0};
      document.addEventListener('dragstart',function(){window.__v10.drag++},true);
      document.addEventListener('selectstart',function(){window.__v10.sel++},true);
      document.addEventListener('contextmenu',function(){window.__v10.ctx++},true);
      return !!window.__orbState})()`);
    await sleep(250);
  };

  /* ---------- 输入：真实鼠标 / 真实触摸 ---------- */
  const mDown = (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  const mMove = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 });
  const mUp = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  const click = async (x, y) => { await mDown(x, y); await sleep(30); await mUp(x, y); };
  const tStart = (x, y) => send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  const tMove = (x, y) => send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
  const tEnd = () => send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const center = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
    var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()`);
  const waitAnim = async () => { for (let i = 0; i < 60; i++) { if (!(await ev('window.__orbState().isAnimating'))) return true; await sleep(80); } return false; };

  /* ---------- 采样 ---------- */
  const snap = layer => ev(`(function(){
    var sel=${JSON.stringify(layer === 'sub' ? '.orb-minor.is-current' : '.orb-major')};
    var items=[].slice.call(document.querySelectorAll(sel)).map(function(e){
      var b=e.getBoundingClientRect(),s=e.style,sk=e.querySelector('.orb-skin');
      return {name:e.getAttribute('aria-label'),w:+b.width.toFixed(2),h:+b.height.toFixed(2),
        ratio:+(b.width/b.height).toFixed(4),sc:+parseFloat(s.getPropertyValue('--sc')||1).toFixed(4),
        px:+(parseFloat(s.getPropertyValue('--px'))||0).toFixed(1),py:+(parseFloat(s.getPropertyValue('--py'))||0).toFixed(1),
        z:+(s.zIndex||0),skin:+(sk.style.opacity||1),left:+b.left.toFixed(1),right:+b.right.toFixed(1),
        top:+b.top.toFixed(1),bottom:+b.bottom.toFixed(1)};
    });
    var sc=document.querySelector('#orbScene'),cs=getComputedStyle(sc),b=sc.getBoundingClientRect();
    var sh=document.querySelector('.orb-shell').getBoundingClientRect();
    return {items:items,st:window.__orbState(),
      scene:{cursor:cs.cursor,touchAction:cs.touchAction,userSelect:cs.userSelect,
        dragging:sc.classList.contains('is-dragging'),rect:{l:Math.round(b.left),t:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}},
      shell:{l:Math.round(sh.left),r:Math.round(sh.right),w:Math.round(sh.width)},
      selection:window.getSelection().toString(),scrollX:window.scrollX,scrollY:window.scrollY,
      overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      counters:window.__v10,uiSwitch:+getComputedStyle(document.querySelector('#uiSwitch')).opacity,
      detailHidden:document.querySelector('#orbDetail').hidden,backHidden:document.querySelector('#orbBack').hidden,
      minorCount:document.querySelectorAll('.orb-minor.is-current').length};
  })()`);
  const findBlank = () => ev(`(function(){
    var s=document.querySelector('#orbScene'),b=s.getBoundingClientRect();
    var pts=[[b.left+36,b.top+36],[b.right-36,b.top+36],[b.left+36,b.bottom-36],
             [b.left+b.width/2,b.top+24],[b.left+24,b.top+b.height/2]];
    for(var i=0;i<pts.length;i++){
      var e=document.elementFromPoint(pts[i][0],pts[i][1]);
      if(e&&s.contains(e)&&!e.closest('.orb-item')&&!e.closest('#orbBack')&&e.tagName!=='BUTTON'&&e.tagName!=='SELECT')
        return {x:Math.round(pts[i][0]),y:Math.round(pts[i][1]),hit:(e.className||e.tagName).toString().slice(0,40)};
    }
    return null;
  })()`);
  const dragBy = async (start, dx, dy, moveFn, steps = 10) => {
    for (let i = 1; i <= steps; i++) { await moveFn(start.x + dx * i / steps, start.y + dy * i / steps); await sleep(24); }
    return { x: start.x + dx, y: start.y + dy };
  };
  const circlesOK = s => s.items.length > 0 && s.items.every(i => Math.abs(i.ratio - 1) < 0.02);

  await send('Runtime.enable');
  await send('Page.enable');

  /* ==================== 桌面 1440x900 ==================== */
  await fresh(1440, 900, false);
  let s0 = await snap('root');
  check('D0 · 桌面初始：三球正圆 / 等边 / 层级 / 无横向滚动 / CSS 手势控制齐备',
    circlesOK(s0) && s0.items.length === 3 && s0.overflowX <= 0 &&
    s0.scene.cursor === 'grab' && s0.scene.touchAction === 'none' && s0.scene.userSelect === 'none',
    { ratios: s0.items.map(i => i.ratio), sc: s0.items.map(i => i.sc), z: s0.items.map(i => i.z),
      cursor: s0.scene.cursor, touchAction: s0.scene.touchAction, overflowX: s0.overflowX });
  const n0 = await shot('v10-desktop-initial.png');
  console.log('SHOT  v10-desktop-initial.png  ' + n0 + ' bytes');

  /* --- 空白处按住向左拖 --- */
  const blank = await findBlank();
  check('验收1 · 找到透明背景空白点（不是球、不是按钮）', !!blank, blank);
  await mDown(blank.x, blank.y);
  const endPt = await dragBy(blank, -150, 0, mMove);
  let sd = await snap('root');
  const left = sd.items.find(i => i.name === '运动健康'), right = sd.items.find(i => i.name === '作息健康');
  check('验收1/3 · 空白处按住拖动生效，左球退后变小变暗、右球变大变亮',
    sd.st.ry < -20 && sd.st.isDragging && left && right && left.sc < s0.items[2].sc && right.sc > s0.items[1].sc &&
    left.z < right.z && sd.scene.dragging,
    { ry: +sd.st.ry.toFixed(2), downOrb: sd.st.downOrb, isDragging: sd.st.isDragging,
      left: { sc0: s0.items[2].sc, sc: left && left.sc, z: left && left.z },
      right: { sc0: s0.items[1].sc, sc: right && right.sc, z: right && right.z } });
  check('验收2/3 · 拖动不选中文字、不产生原生拖拽 / 长按菜单，指针为 grabbing',
    sd.selection === '' && sd.counters.sel === 0 && sd.counters.drag === 0 && sd.counters.ctx === 0 &&
    sd.scene.cursor === 'grabbing',
    { selection: sd.selection, counters: sd.counters, cursor: sd.scene.cursor });
  check('验收5/6 · 拖动中三球仍为正圆且前后层级正确', circlesOK(sd) && left.z < right.z,
    { ratios: sd.items.map(i => i.ratio), z: sd.items.map(i => i.z) });
  const n1 = await shot('v10-desktop-dragging.png');
  console.log('SHOT  v10-desktop-dragging.png  ' + n1 + ' bytes  (按住未松手)');

  /* --- 拖到容器外再松手 --- */
  await dragBy({ x: endPt.x, y: endPt.y }, 700, -260, mMove, 6);
  await mUp(1438, 12);
  await sleep(650);
  let su = await snap('root');
  check('验收7/9 · 容器外松手：不分裂、状态复位、500ms 内角度归零、指针恢复 grab',
    su.st.level === 'root' && su.st.pointerId === null && !su.st.isDragging && !su.scene.dragging &&
    Math.abs(su.st.ry) < 0.01 && su.scene.cursor === 'grab' && circlesOK(su),
    { level: su.st.level, ry: +su.st.ry.toFixed(3), pointerId: su.st.pointerId,
      dragging: su.st.isDragging, cursor: su.scene.cursor });

  /* --- 单击球 → 中球层 --- */
  const maj = await center('.orb-major');
  await click(maj.x, maj.y);
  await waitAnim(); await sleep(180);
  let ss = await snap('sub');
  check('验收10 · 单击球正常分裂进入中球层（3 个中球 / 切换器隐藏 / 左上返回可见）',
    ss.st.level === 'sub' && ss.minorCount === 3 && ss.items.length === 3 &&
    +ss.uiSwitch === 0 && !ss.backHidden && circlesOK(ss),
    { level: ss.st.level, minors: ss.minorCount, ratios: ss.items.map(i => i.ratio),
      sc: ss.items.map(i => i.sc), uiSwitch: ss.uiSwitch, backHidden: ss.backHidden });

  /* --- 中球层空白处拖动 + 点中球开详情 --- */
  const blank2 = await findBlank();
  await mDown(blank2.x, blank2.y);
  await dragBy(blank2, -110, 0, mMove, 8);
  let sm = await snap('sub');
  check('验收10 · 中球层同样支持空白处拖动（投影随角度变化、球仍正圆）',
    sm.st.ry < -15 && sm.st.isDragging && circlesOK(sm) &&
    sm.items.some((i, k) => Math.abs(i.sc - ss.items[k].sc) > 0.005),
    { ry: +sm.st.ry.toFixed(2), scBefore: ss.items.map(i => i.sc), scAfter: sm.items.map(i => i.sc) });
  await mUp(blank2.x - 110, blank2.y);
  await sleep(620);
  const min = await center('.orb-minor.is-current');
  await click(min.x, min.y);
  await sleep(450);
  let sdet = await snap('sub');
  check('验收11 · 点中球仍能滑出详情面板', sdet.st.level === 'detail' && !sdet.detailHidden,
    { level: sdet.st.level, detailHidden: sdet.detailHidden, title: await ev(`document.querySelector('#orbDetailTitle').textContent`) });
  await click((await center('#orbDetailBack')).x, (await center('#orbDetailBack')).y);
  await sleep(520);
  await click((await center('#orbBack')).x, (await center('#orbBack')).y);
  await waitAnim(); await sleep(200);

  /* --- 空白处单击 / 拖动超阈值松手都不分裂 --- */
  const b3 = await findBlank();
  await click(b3.x, b3.y);
  await sleep(260);
  const sClick = await snap('root');
  check('验收6 · 单击空白处不触发分裂，只做回弹',
    sClick.st.level === 'root' && Math.abs(sClick.st.ry) < 0.01 && sClick.st.pointerId === null,
    { level: sClick.st.level, ry: +sClick.st.ry.toFixed(3) });
  await mDown(b3.x, b3.y);
  const e3 = await dragBy(b3, 90, 10, mMove, 7);
  await mUp(e3.x, e3.y);
  await sleep(620);
  const sDrag = await snap('root');
  check('验收7 · 拖动超过 8px 后松手不触发分裂、角度归零',
    sDrag.st.level === 'root' && Math.abs(sDrag.st.ry) < 0.01 && !sDrag.st.isDragging,
    { level: sDrag.st.level, ry: +sDrag.st.ry.toFixed(3) });

  /* ==================== 手机 390x844 ==================== */
  await fresh(390, 844, true);
  const m0 = await snap('root');
  check('验收12 · 390px 初始：三球正圆完整可见、外壳不溢出、无横向滚动条',
    circlesOK(m0) && m0.overflowX <= 0 && m0.items.every(i => i.left >= -1 && i.right <= 391) &&
    m0.shell.l >= -1 && m0.shell.r <= 391,
    { ratios: m0.items.map(i => i.ratio), sc: m0.items.map(i => i.sc),
      shell: m0.shell, overflowX: m0.overflowX, balls: m0.items.map(i => [i.left, i.right]) });
  const n2 = await shot('v10-mobile-initial.png');
  console.log('SHOT  v10-mobile-initial.png  ' + n2 + ' bytes');

  const mb = await findBlank();
  await tStart(mb.x, mb.y);
  const tEndPt = await dragBy(mb, -70, 0, tMove, 8);
  const md = await snap('root');
  check('验收4/12 · 手指在空白处拖动生效且不触发页面滚动 / 选中文字 / 浏览器手势',
    md.st.ry < -10 && md.st.isDragging && md.scrollY === m0.scrollY && md.scrollX === m0.scrollX &&
    md.selection === '' && md.counters.drag === 0 && circlesOK(md) && md.scene.touchAction === 'none',
    { ry: +md.st.ry.toFixed(2), isDragging: md.st.isDragging, scrollY: [m0.scrollY, md.scrollY],
      counters: md.counters, ratios: md.items.map(i => i.ratio) });
  const n3 = await shot('v10-mobile-dragging.png');
  console.log('SHOT  v10-mobile-dragging.png  ' + n3 + ' bytes  (手指未抬起)');
  await tEnd();
  await sleep(620);
  const mu = await snap('root');
  check('手机 · 松手复位，角度归零，仍无横向溢出',
    Math.abs(mu.st.ry) < 0.01 && mu.st.pointerId === null && !mu.scene.dragging && mu.overflowX <= 0,
    { ry: +mu.st.ry.toFixed(3), overflowX: mu.overflowX });
  const mm = await center('.orb-major');
  await tStart(mm.x, mm.y); await sleep(40); await tEnd();
  await waitAnim(); await sleep(150);
  const ms = await snap('sub');
  check('手机 · 触摸单击球正常进入中球层', ms.st.level === 'sub' && ms.minorCount === 3,
    { level: ms.st.level, minors: ms.minorCount });

  check('验收12 · 全流程无 jsError', jsErrors.length === 0, { errors: jsErrors, count: jsErrors.length });
  const pass = results.filter(r => r.ok).length;
  console.log('\nTOTAL: ' + pass + '/' + results.length + ' PASS');
  ws.close();
  if (pass !== results.length) process.exitCode = 2;
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
