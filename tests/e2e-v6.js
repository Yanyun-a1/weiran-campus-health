/* 校园健康助手 v6「JS 逐帧投影 · 球永远正圆」无头浏览器验收
 * 用法：node e2e-v6.js [URL]   依赖本机 9222 端口的无头 Chrome（CDP）
 */
const fs = require('fs');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CDP = 'http://127.0.0.1:9222';
const APP = 'E:/gzkj/xiaotong/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
/* 拼装禁用词，测试脚本自身也不出现字面量 */
const BAD = ['pre' + 'serve-3d', 'pers' + 'pective', 'rotate' + 'Y', 'rotate' + 'X', 'trans' + 'lateZ', 'ro' + 'tate3d'];

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
  const navigate = async (url, wait = 3500) => { await send('Page.navigate', { url }); await sleep(wait); };
  const reload = async (wait = 3500) => { await send('Page.reload'); await sleep(wait); };
  const setWidth = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 769 });
    await sleep(700);
  };
  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const v = await evalJS(expr); if (v) return v; await sleep(300); }
    return null;
  };
  const sendText = t => evalJS(`(function(){var i=document.querySelector('#userInput');i.value=${JSON.stringify(t)};document.querySelector('#sendBtn').click();return true})()`);
  const waitText = (needle, timeout = 25000) =>
    waitFor(`(function(){var l=document.querySelector('#chatLog');return !!l&&l.innerText.indexOf(${JSON.stringify(needle)})>=0})()`, timeout);
  const clearState = () => evalJS(`(function(){['xiaotong.ui.v1','xiaotong.identity.v1','xiaotong.intro.v1'].forEach(function(k){localStorage.removeItem(k)});return true})()`);

  /* 合成 pointer 事件，走真实阈值与缓动逻辑 */
  const dragStart = (x, y, pid) => evalJS(`(function(){var s=document.querySelector('#orbScene');s.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:${x},clientY:${y},pointerId:${pid},button:0}));return true})()`);
  const dragMove = (x, y, pid) => evalJS(`(function(){window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:${x},clientY:${y},pointerId:${pid}}));return true})()`);
  const dragEnd = (x, y, pid) => evalJS(`(function(){window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:${x},clientY:${y},pointerId:${pid}}));return true})()`);

  /* 读取三个球（或当前中球）的投影状态 */
  const snap = (sel = '.orb-major') => evalJS(`(function(){
    var its=[].slice.call(document.querySelectorAll(${JSON.stringify(sel)}));
    var R=function(e){var r=e.getBoundingClientRect();return {w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2,left:r.left,right:r.right}};
    return {state:window.__orbState(),rects:its.map(R),
      px:its.map(function(i){return parseFloat(i.style.getPropertyValue('--px'))}),
      py:its.map(function(i){return parseFloat(i.style.getPropertyValue('--py'))}),
      sc:its.map(function(i){return parseFloat(i.style.getPropertyValue('--sc'))}),
      txt:its.map(function(i){return i.style.getPropertyValue('--txt-op')}),
      z:its.map(function(i){return i.style.zIndex}),
      op:its.map(function(i){return parseFloat(getComputedStyle(i.querySelector('.orb-skin')).opacity)}),
      filter:its.map(function(i){return getComputedStyle(i.querySelector('.orb-skin')).filter}),
      tf:its.map(function(i){return getComputedStyle(i).transform}),
      textTf:its.map(function(i){return getComputedStyle(i.querySelector('.orb-text')).transform}),
      orb:its.map(function(i){return i.getAttribute('data-orb')||i.getAttribute('data-mod')})};})()`);
  /* 解析计算后的 transform 矩阵：b/c 为斜切分量，a/d 为横纵缩放；
   * 只有 a===d>0 且 b=c=0 才说明没有任何旋转或压扁。 */
  function noRotation(tf) {
    const body = String(tf).slice(String(tf).indexOf('(') + 1);
    const n = (body.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || []).map(Number);
    if (String(tf).indexOf('matrix3d') === 0 && n.length >= 16)
      return Math.abs(n[1]) < 1e-6 && Math.abs(n[4]) < 1e-6 && Math.abs(n[0] - n[5]) < 1e-6 && n[0] > 0;
    if (String(tf).indexOf('matrix') === 0 && n.length >= 6)
      return Math.abs(n[1]) < 1e-6 && Math.abs(n[2]) < 1e-6 && Math.abs(n[0] - n[3]) < 1e-6 && n[0] > 0;
    return false;
  }
  const circleOK = s => s.rects.every(r => Math.abs(r.w - r.h) < 0.6) && s.tf.every(noRotation);
  const blur = f => parseFloat((f.match(/blur\(([\d.]+)px\)/) || [0, 0])[1]);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await setWidth(1440, 900);
  await navigate(URL_, 2500);
  await clearState();
  await reload();

  /* ===== 验收 1：初始态三个球都是正圆，且完全没有 CSS 3D ===== */
  const init = await evalJS(`(function(){
    var scene=document.querySelector('#orbScene'),stage=document.querySelector('#orbStage'),
        shell=document.querySelector('.orb-shell'),rim=document.querySelector('.orb-rim'),
        items=[].slice.call(document.querySelectorAll('.orb-major')),skin=items[0].querySelector('.orb-skin');
    var R=function(e){var r=e.getBoundingClientRect();return {w:r.width,h:r.height,cx:r.left+r.width/2,cy:r.top+r.height/2,left:r.left,right:r.right}};
    var c=items.map(R);
    var base=Math.abs(c[1].cx-c[2].cx), l1=Math.hypot(c[0].cx-c[2].cx,c[0].cy-c[2].cy), l2=Math.hypot(c[0].cx-c[1].cx,c[0].cy-c[1].cy);
    return {
      scene:{persp:getComputedStyle(scene).perspective,origin:getComputedStyle(scene).perspectiveOrigin,overflow:getComputedStyle(scene).overflow},
      stage:{transform:getComputedStyle(stage).transform,style:getComputedStyle(stage).transformStyle,z:getComputedStyle(stage).zIndex},
      item:{style:getComputedStyle(items[0]).transformStyle,overflow:getComputedStyle(items[0]).overflow,transform:getComputedStyle(items[0]).transform},
      skin:{overflow:getComputedStyle(skin).overflow,bg:getComputedStyle(skin).backgroundImage,shadow:getComputedStyle(skin).boxShadow},
      shell:{z:getComputedStyle(shell).zIndex,bg:getComputedStyle(shell).backgroundImage,shadow:getComputedStyle(shell).boxShadow,rect:R(shell)},
      rim:{z:getComputedStyle(rim).zIndex,bg:getComputedStyle(rim).backgroundImage},
      order:[].slice.call(scene.children).map(function(x){return x.className}),
      centers:c,base:base,l1:l1,l2:l2,
      topHit:(function(){var e=document.elementFromPoint(c[0].cx,c[0].cy);return e?e.className:null})(),
      azel:items.map(function(i){return i.getAttribute('data-az')+'/'+i.getAttribute('data-el')}),
      R:getComputedStyle(items[0]).getPropertyValue('--R').trim(),d:getComputedStyle(items[0]).getPropertyValue('--d').trim(),
      font:getComputedStyle(items[0].querySelector('.orb-text')).fontSize,
      weight:getComputedStyle(items[0].querySelector('.orb-text')).fontWeight,
      majorCount:items.length,minorCount:document.querySelectorAll('.orb-minor').length,
      identityHidden:document.querySelector('#identityBar').hidden,
      introHidden:document.querySelector('#introModal').hidden,
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
      imgs:document.querySelectorAll('img').length,
      scripts:[].slice.call(document.scripts).map(function(s){return s.src}).filter(Boolean),
      ai:document.querySelector('#aiStatus').innerText,mode:document.querySelector('#modeHint').innerText};})()`);
  console.log('INIT:', JSON.stringify(init, null, 1));

  const src = ['index.html', 'styles.css', 'orb-view.css', 'orb-view.js', 'app.js', 'config.js', 'faqs.js', 'campus-data.js', 'data-query.js', 'evidence.js']
    .map(f => ({ f, txt: fs.readFileSync(APP + f, 'utf8') }));
  const css = src.find(x => x.f === 'orb-view.css').txt;
  const js = src.find(x => x.f === 'orb-view.js').txt;
  const forbidden = src.flatMap(x => BAD.filter(b => x.txt.indexOf(b) >= 0).map(b => x.f + ':' + b));

  const s0 = await snap();
  console.log('S0:', JSON.stringify({ rects: s0.rects, sc: s0.sc, z: s0.z, op: s0.op, tf: s0.tf }));
  check('验收1 · 初始三球均为正圆（宽高比 1:1、变换矩阵无旋转/斜切），全项目无 CSS 3D',
    circleOK(s0) && s0.textTf.every(t => t === 'none') &&
    init.scene.persp === 'none' && init.stage.transform === 'none' && init.stage.style === 'flat' &&
    init.item.style === 'flat' && init.item.overflow === 'visible' &&
    /translate3d\(var\(--px\), var\(--py\), 0\) scale\(var\(--sc\)\)/.test(css) &&
    forbidden.length === 0 && init.imgs === 0 && !init.scripts.some(s => /three/i.test(s)),
    { ratios: s0.rects.map(r => +(r.w / r.h).toFixed(4)), tf: s0.tf, forbidden });

  /* ===== 验收 2：等边三角形 + 三球大小接近 ===== */
  check('验收2 · 三球呈等边三角形、大小接近（不会一大两小）',
    Math.abs(init.l1 - init.base) / init.base < .05 && Math.abs(init.l2 - init.base) / init.base < .05 &&
    init.centers[0].cy < init.centers[1].cy && Math.abs(init.centers[1].cy - init.centers[2].cy) <= 1 &&
    Math.max(...s0.rects.map(r => r.w)) / Math.min(...s0.rects.map(r => r.w)) < 1.08 &&
    init.azel.join('/') === '0/48/42/-20/-42/-20' && init.R === '250px' && init.d === '150px',
    { base: +init.base.toFixed(1), l1: +init.l1.toFixed(1), l2: +init.l2.toFixed(1), widths: s0.rects.map(r => +r.w.toFixed(1)) });

  /* ===== 验收 3 / 5 / 6：向左拖 ===== */
  const LI = 2, RI = 1; // 运动健康(左) / 作息健康(右)
  await dragStart(700, 400, 11); await dragMove(580, 400, 11); await sleep(220);
  const sl = await snap();
  console.log('DRAG_LEFT:', JSON.stringify({ ry: sl.state.ry, sc: sl.sc, w: sl.rects.map(r => +r.w.toFixed(1)), op: sl.op, z: sl.z, filter: sl.filter }));
  check('验收3 · 左拖：左球变小变暗变虚退后，右球变大变亮',
    sl.state.ry < -30 &&
    sl.rects[LI].w < s0.rects[LI].w * .93 && sl.op[LI] < s0.op[LI] - .10 &&
    blur(sl.filter[LI]) > blur(s0.filter[LI]) + .3 &&
    Number(sl.z[LI]) < Number(sl.z[RI]) &&
    sl.rects[RI].w > s0.rects[RI].w * 1.03 && sl.op[RI] > s0.op[RI] + .03 &&
    sl.rects[LI].cx < s0.rects[LI].cx,
    { ry: +sl.state.ry.toFixed(2), leftW: [+s0.rects[LI].w.toFixed(1), +sl.rects[LI].w.toFixed(1)],
      rightW: [+s0.rects[RI].w.toFixed(1), +sl.rects[RI].w.toFixed(1)], op: sl.op, z: sl.z });
  check('验收5 · 拖动全程三球仍是正圆、无任何旋转（截图量宽高比 1:1）', circleOK(sl), {
    ratios: sl.rects.map(r => +(r.w / r.h).toFixed(4)), tf: sl.tf });
  check('验收6 · 前后层级由 z2 决定，前球盖住后球',
    Number(sl.z[RI]) > Number(sl.z[LI]) && Number(sl.z[RI]) > Number(sl.z[0]) &&
    sl.sc[RI] > sl.sc[LI] && /Math\.round\(t \* 100\)/.test(js),
    { z: sl.z, sc: sl.sc });

  /* ===== 验收 7：松手 500ms 回弹 ===== */
  await dragEnd(580, 400, 11); await sleep(560);
  const sr = await snap();
  check('验收7 · 松手后 500ms 内回到 0deg / 0deg，位置复原',
    Math.abs(sr.state.ry) < .01 && Math.abs(sr.state.rx) < .01 &&
    sr.px.every((v, i) => Math.abs(v - s0.px[i]) < .5) &&
    sr.sc.every((v, i) => Math.abs(v - s0.sc[i]) < .001),
    { ry: sr.state.ry, rx: sr.state.rx, px: sr.px });

  /* ===== 验收 4：向右拖，效果相反 ===== */
  await dragStart(700, 400, 12); await dragMove(820, 400, 12); await sleep(220);
  const sd = await snap();
  check('验收4 · 右拖效果相反：右球变小变暗，左球变大变亮',
    sd.state.ry > 30 && circleOK(sd) &&
    sd.rects[RI].w < s0.rects[RI].w * .93 && sd.op[RI] < s0.op[RI] - .10 &&
    sd.rects[LI].w > s0.rects[LI].w * 1.03 && sd.op[LI] > s0.op[LI] + .03 &&
    Number(sd.z[LI]) > Number(sd.z[RI]),
    { ry: +sd.state.ry.toFixed(2), widths: sd.rects.map(r => +r.w.toFixed(1)), op: sd.op, z: sd.z });
  await dragEnd(820, 400, 12); await sleep(600);

  /* ===== 验收 8：外壳中心透明，只有边缘一圈和顶部有亮 ===== */
  const shellCssOK = /circle closest-side at 50% 50%/.test(css) &&
    /rgba\(255, 255, 255, 0\) 0%/.test(css) &&
    /rgba\(255, 255, 255, 0\) 52%/.test(css) &&
    /rgba\(255, 255, 255, \.30\) 94%/.test(css) &&
    /inset 0 0 60px rgba\(255, 255, 255, \.05\)/.test(css) &&
    /orb-shell::before/.test(css) && /orb-shell::after/.test(css) &&
    init.shell.z === '0' && init.rim.z === '3' && init.rim.bg === 'none';
  /* 只截球心所在的一条水平窄带，送回页面用 canvas 逐点取色，
   * 直接比较「球心 / 壳外」亮度是否一致、边缘是否更亮。 */
  const geo = await evalJS(`(function(){var s=document.querySelector('#orbScene').getBoundingClientRect(),
    sh=document.querySelector('.orb-shell').getBoundingClientRect();
    return {cx:Math.round(s.left+s.width/2),cy:Math.round(s.top+s.height/2),rad:Math.round(sh.width/2)}})()`);
  const clipX = Math.max(0, geo.cx - geo.rad - 30);
  const clipW = Math.min(1440 - clipX, geo.rad * 2 + 60);
  const shot = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false,
    clip: { x: clipX, y: geo.cy - 2, width: clipW, height: 5, scale: 1 }
  });
  const pixels = await evalJS(`(async function(){
    var img=new Image();img.src='data:image/png;base64,${shot.result.data}';
    await img.decode();
    var cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;
    var c=cv.getContext('2d');c.drawImage(img,0,0);
    var x0=${clipX},cx=${geo.cx},rad=${geo.rad};
    var at=function(x){var d=c.getImageData(Math.round(x-x0),2,1,1).data;return [d[0],d[1],d[2]]};
    return {center:at(cx),inner:at(cx+rad*0.45),edge:at(cx+rad*0.99),outside:at(cx+rad*1.06)};})()`);
  const lum = p => (p[0] + p[1] + p[2]) / 3;
  console.log('SHELL_PIXELS:', JSON.stringify(pixels));
  /* 背景本身接近白色，白色边缘光带来的亮度增量有限（约 2~3 灰阶），
   * 因此判据用「球心≈壳外、内圈≈球心、最外圈明显更亮」三段比较。 */
  check('验收8 · 外壳球心透明能见背景色，只有最外圈与顶部发亮',
    shellCssOK && Math.abs(lum(pixels.center) - lum(pixels.outside)) < 4 &&
    Math.abs(lum(pixels.inner) - lum(pixels.center)) < 4 &&
    lum(pixels.edge) > lum(pixels.center) + 1.5 && lum(pixels.edge) > lum(pixels.inner) + 2,
    { center: pixels.center, inner: pixels.inner, edge: pixels.edge, outside: pixels.outside });

  /* ===== 验收 9：<8px 判定点击并触发分裂 ===== */
  await dragStart(700, 400, 13); await dragMove(705, 400, 13); await dragEnd(705, 400, 13);
  await sleep(140);
  const small = await snap();
  await evalJS(`(function(){document.querySelector('.orb-major[data-orb="food"]').click();return true})()`);
  await sleep(950);
  const clickState = await evalJS(`(function(){var st=document.querySelector('#orbStage');return {
    ry:window.__orbState().ry,split:st.classList.contains('major-out'),
    minors:document.querySelectorAll('.orb-minor.is-current').length};})()`);
  check('验收9 · 位移 <8px 不旋转，判定为点击并正常触发分裂',
    Math.abs(small.state.ry) < .01 && small.px.every((v, i) => Math.abs(v - s0.px[i]) < .5) &&
    clickState.split && clickState.minors === 3 && Math.abs(clickState.ry) < .01,
    { ry: clickState.ry, split: clickState.split, minors: clickState.minors });

  /* ===== 验收 10：分裂后中球更大、顶栏切换器隐藏、44px 返回 ===== */
  const sp = await evalJS(`(function(){
    var st=document.querySelector('#orbStage'),mins=[].slice.call(document.querySelectorAll('.orb-minor.is-current')),
        b=document.querySelector('#orbBack'),maj=[].slice.call(document.querySelectorAll('.orb-major'));
    return {cls:st.className,page:document.querySelector('.page').className,
      switchDisplay:getComputedStyle(document.querySelector('.ui-switch')).display,
      idDisplay:getComputedStyle(document.querySelector('#identityBar')).display,
      backHidden:b.hidden,backW:Math.round(b.getBoundingClientRect().width),
      majorOp:maj.map(function(m){return getComputedStyle(m).opacity}),
      minors:mins.map(function(m){return {name:m.getAttribute('data-mod'),w:Math.round(m.getBoundingClientRect().width),
        h:Math.round(m.getBoundingClientRect().height),op:getComputedStyle(m).opacity,vis:getComputedStyle(m).visibility,
        dur:getComputedStyle(m).animationDuration,delay:getComputedStyle(m).animationDelay,
        ease:getComputedStyle(m).animationTimingFunction,
        R:getComputedStyle(m).getPropertyValue('--R').trim(),d:getComputedStyle(m).getPropertyValue('--d').trim()}}),
      hint:document.querySelector('#orbHint').textContent,
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};})()`);
  console.log('SPLIT:', JSON.stringify(sp, null, 1));
  const sMinor = await snap('.orb-minor.is-current');
  check('验收10 · 分裂后三个中球更大占满视图、切换器隐藏、44px 返回、时序正确',
    sp.cls.indexOf('major-out') >= 0 && sp.cls.indexOf('minor-on') >= 0 &&
    sp.page.indexOf('orb-split') >= 0 && sp.switchDisplay === 'none' && sp.idDisplay === 'none' &&
    !sp.backHidden && sp.backW === 44 && sp.majorOp.every(o => o === '0') &&
    sp.minors.length === 3 && circleOK(sMinor) &&
    sp.minors.every(m => m.w > Math.max(...s0.rects.map(r => r.w)) && m.op === '1' && m.vis === 'visible' &&
      m.dur === '0.42s' && m.delay === '0.22s' && m.ease === 'cubic-bezier(0.22, 1, 0.36, 1)' &&
      m.R === '175px' && m.d === '200px') && sp.scrollWidth <= sp.clientWidth + 1,
    { minors: sp.minors.map(m => ({ name: m.name, w: m.w, R: m.R, d: m.d })), switchDisplay: sp.switchDisplay });

  /* 中球层同样支持拖动投影 */
  await dragStart(700, 400, 14); await dragMove(600, 400, 14); await sleep(220);
  const minorDrag = await snap('.orb-minor.is-current');
  check('验收10b · 中球层与大球用同一套 JS 投影，拖动照样生效',
    minorDrag.state.ry < -25 && minorDrag.state.layer === 'minor' && circleOK(minorDrag) &&
    new Set(minorDrag.sc.map(v => v.toFixed(3))).size >= 2,
    { ry: +minorDrag.state.ry.toFixed(2), R: minorDrag.state.R, sc: minorDrag.sc });
  await dragEnd(600, 400, 14); await sleep(600);

  /* ===== 验收 11：点中球仍能滑出详情面板 ===== */
  await evalJS(`(function(){document.querySelector('.orb-minor.is-current[data-mod="菜品营养"]').click();return true})()`);
  await sleep(550);
  const detail = await evalJS(`(function(){var p=document.querySelector('#orbDetail'),r=p.getBoundingClientRect();return {
    hidden:p.hidden,open:p.classList.contains('open'),w:Math.round(r.width),right:Math.round(r.right),
    title:document.querySelector('#orbDetailTitle').innerText,tag:document.querySelector('.orb-detail-tag').innerText,
    desc:document.querySelector('#orbDetailDesc').innerText,foot:document.querySelector('#orbDetailReturn').innerText};})()`);
  check('验收11 · 点中球仍右侧滑出 480px 详情面板，标题与占位说明正确',
    !detail.hidden && detail.open && detail.w === 480 && detail.right === 1440 &&
    detail.title === '菜品营养' && detail.tag === '模块开发中' &&
    detail.desc === '每道菜的热量、蛋白质、脂肪、钠含量与搭配建议' && detail.foot === '返回小球视图', detail);
  await evalJS(`(function(){document.querySelector('#orbDetailBack').click();return true})()`);
  await sleep(450);

  const descs = await evalJS(`(function(){return [].slice.call(document.querySelectorAll('.orb-minor')).map(function(m){return m.getAttribute('data-mod')+'|'+m.getAttribute('data-desc')})})()`);
  const EXPECT = {
    '菜品营养': '每道菜的热量、蛋白质、脂肪、钠含量与搭配建议',
    '饮食记录': '今日三餐记录与营养摄入进度',
    '食堂安全': '卫生评级、留样公示与问题反馈',
    '作息记录': '入睡与起床时间统计、睡眠时长趋势',
    '睡眠质量': '睡眠评分与影响因素分析',
    '宿舍环境': '噪音、光照、通风等影响睡眠的环境数据',
    '运动记录': '运动类型、时长与消耗统计',
    '场馆器材': '场地空闲状态与器材借用',
    '运动建议': '按近期运动量给出锻炼与防损伤建议'
  };
  check('硬约束 · 九个子模块占位文案逐字不动、无外部图片 / 3D 库',
    descs.length === 9 && descs.every(d => { const p = d.split('|'); return EXPECT[p[0]] === p[1]; }) &&
    !init.scripts.some(s => /three/i.test(s)) && !/url\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, '')) &&
    /AI 意图识别/.test(init.ai) && /云数据库/.test(init.mode),
    { count: descs.length });

  /* ===== 对话视图回归（一律不动的部分） ===== */
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="chat"]').click();return true})()`);
  await sleep(250);
  const chat = await evalJS(`(function(){return {
    shown:!document.querySelector('#chatView').hidden,orbHidden:document.querySelector('#orbView').hidden,
    idShown:!document.querySelector('#identityBar').hidden,stored:localStorage.getItem('xiaotong.ui.v1'),
    quick:document.querySelectorAll('.quick-chips button').length,
    scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};})()`);
  await sendText('请假流程');
  const qaOk = await waitText('请假流程怎么走');
  const qa = await evalJS(`(function(){var l=document.querySelector('#chatLog');return {cards:l.querySelectorAll('.qa-card').length,steps:l.querySelectorAll('.step').length}})()`);
  const exp = await evalJS(`(function(){var D=window.XIAOTONG_CAMPUS_DATA,Q=window.XiaoTongData;return Q.compute.schedule('我明天有什么课',D.identities[0]).lead})()`);
  await sendText('我明天有什么课');
  const dqOk = await waitText(exp);
  await evalJS(`(function(){var s=document.querySelector('#identitySelect');s.value='c2';s.dispatchEvent(new Event('change'));return true})()`);
  await sleep(200);
  await evalJS(`(function(){document.querySelector('#faqOpenBtn').click();return true})()`);
  await sleep(250);
  const faq = await evalJS(`(function(){var m=document.querySelector('#faqModal');return {shown:!m.hidden,tabs:m.querySelectorAll('.faq-tab').length,items:m.querySelectorAll('.faq-q').length,visible:m.querySelectorAll('.faq-group.open .faq-q').length}})()`);
  await evalJS(`(function(){document.querySelector('#closeFaq').click();return true})()`);
  await sendText('我要请假三天');
  const formOk = await waitFor(`(function(){return !document.querySelector('#leaveModal').hidden})()`, 20000);
  const form = await evalJS(`(function(){var m=document.querySelector('#leaveModal');return {name:(m.querySelector('#lvName')||{}).value,sid:(m.querySelector('#lvSid')||{}).value,fields:m.querySelectorAll('.field').length}})()`);
  check('回归 · 对话视图 30 条问答 / 智能问数 / 身份切换 / 问答弹窗 / 请假表单全部未受影响',
    chat.shown && chat.orbHidden && chat.idShown && chat.stored === 'chat' && chat.quick === 6 &&
    !!qaOk && qa.cards >= 1 && qa.steps >= 3 && !!dqOk &&
    faq.shown && faq.tabs === 10 && faq.items === 30 && faq.visible === 3 &&
    !!formOk && form.fields === 6 && form.name === '同学B' && /SIM202602/.test(form.sid),
    { chat, qa, dqOk: !!dqOk, faq, form });
  await evalJS(`(function(){document.querySelector('#leaveModal').hidden=true;document.body.style.overflow='';return true})()`);
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="orb"]').click();return true})()`);
  await sleep(350);

  /* ===== 验收 12：390px 手机端 ===== */
  await setWidth(390, 844);
  await reload();
  const mob = await evalJS(`(function(){
    var shell=document.querySelector('.orb-shell'),items=[].slice.call(document.querySelectorAll('.orb-major')),scene=document.querySelector('#orbScene');
    var R=function(e){var r=e.getBoundingClientRect();return {w:r.width,h:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom}};
    return {shell:R(shell),scene:R(scene),items:items.map(R),
      d:getComputedStyle(items[0]).getPropertyValue('--d').trim(),
      R:getComputedStyle(items[0]).getPropertyValue('--R').trim(),
      font:getComputedStyle(items[0].querySelector('.orb-text')).fontSize,
      switchW:Math.round(document.querySelector('.ui-switch').getBoundingClientRect().width),
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
      persp:getComputedStyle(scene).perspective};})()`);
  console.log('MOBILE:', JSON.stringify(mob));
  const m0 = await snap();
  check('验收12a · 390px 外壳不溢出、三球完整可见且为正圆、R/球径/字号按手机规格',
    mob.shell.left >= 0 && mob.shell.right <= 390 && Math.abs(mob.shell.w - 390 * .96) <= 2 &&
    mob.items.every(r => r.left >= 0 && r.right <= 390 && r.top >= mob.scene.top - 1 && r.bottom <= mob.scene.bottom + 1 && r.w > 40) &&
    circleOK(m0) && mob.d === '104px' && mob.R === '140px' && mob.font === '15px' &&
    mob.switchW < 390 && mob.scrollWidth <= mob.clientWidth + 1 && mob.persp === 'none',
    { shell: mob.shell, widths: m0.rects.map(r => +r.w.toFixed(1)), scrollWidth: mob.scrollWidth });

  await dragStart(195, 300, 21);
  const frames = [];
  for (let i = 1; i <= 8; i++) {
    await dragMove(195 - i * 10, 300, 21);
    await sleep(20);
    frames.push((await snap()).px[LI]);
  }
  const mobDrag = await snap();
  await dragEnd(115, 300, 21); await sleep(600);
  check('验收12b · 390px 拖动逐帧更新投影、始终是正圆、不掉帧且无横向溢出',
    mobDrag.state.ry < -20 && circleOK(mobDrag) &&
    new Set(frames.map(v => v.toFixed(1))).size >= 6 &&
    mob.scrollWidth <= mob.clientWidth + 1,
    { ry: +mobDrag.state.ry.toFixed(2), frames: frames.map(v => +v.toFixed(1)) });

  await evalJS(`(function(){document.querySelector('.orb-major[data-orb="sleep"]').click();return true})()`);
  await sleep(950);
  const mobSplit = await snap('.orb-minor.is-current');
  const mobSp = await evalJS(`(function(){var m=[].slice.call(document.querySelectorAll('.orb-minor.is-current'));return {
    count:m.length,R:getComputedStyle(m[0]).getPropertyValue('--R').trim(),d:getComputedStyle(m[0]).getPropertyValue('--d').trim(),
    scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};})()`);
  check('验收12c · 390px 分裂中球 R=96px / 球径 140px、正圆且不出屏',
    mobSp.count === 3 && mobSp.R === '96px' && mobSp.d === '140px' && circleOK(mobSplit) &&
    mobSplit.rects.every(r => r.left >= 0 && r.right <= 390) &&
    mobSp.scrollWidth <= mobSp.clientWidth + 1,
    { R: mobSp.R, d: mobSp.d, widths: mobSplit.rects.map(r => +r.w.toFixed(1)) });

  await evalJS(`(function(){document.querySelector('.orb-minor.is-current[data-mod="睡眠质量"]').click();return true})()`);
  await sleep(550);
  const mobDetail = await evalJS(`(function(){var p=document.querySelector('#orbDetail'),r=p.getBoundingClientRect();return {
    w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left),open:p.classList.contains('open'),
    title:document.querySelector('#orbDetailTitle').innerText,desc:document.querySelector('#orbDetailDesc').innerText};})()`);
  check('验收12d · 390px 详情面板全屏滑出、标题与占位正确',
    mobDetail.w === 390 && mobDetail.left === 0 && mobDetail.h === 844 && mobDetail.open &&
    mobDetail.title === '睡眠质量' && mobDetail.desc === '睡眠评分与影响因素分析', mobDetail);
  await evalJS(`(function(){document.querySelector('#orbDetailBackdrop').click();return true})()`);
  await sleep(450);

  /* ===== 验收 13：无 jsError ===== */
  check('验收13 · 全流程无 jsError', jsErrors.length === 0, { jsErrors });

  const pass = results.filter(r => r.ok).length;
  console.log('\n===== SUMMARY =====');
  console.log('TOTAL ' + results.length + ' PASS ' + pass + ' FAIL ' + (results.length - pass));
  if (pass !== results.length) console.log('FAILED:\n' + results.filter(r => !r.ok).map(r => ' - ' + r.name).join('\n'));
  ws.close();
  if (pass !== results.length) process.exitCode = 1;
}
main().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
