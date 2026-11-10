/* 校园健康助手 v5「CSS 3D 球面」无头浏览器验收
 * 用法：node e2e-v5.js [URL]   依赖本机 9222 端口的无头 Chrome（CDP）
 */
const fs = require('fs');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CDP = 'http://127.0.0.1:9222';
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
  const navigate = async (url, wait = 6500) => { await send('Page.navigate', { url }); await sleep(wait); };
  const reload = async (wait = 6500) => { await send('Page.reload'); await sleep(wait); };
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

  /* 合成 pointer 事件：真实走一遍 pointerdown / pointermove / pointerup 与 8px 阈值 */
  const dragStart = (x, y, pid) => evalJS(`(function(){var s=document.querySelector('#orbScene');s.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:${x},clientY:${y},pointerId:${pid},button:0}));return true})()`);
  const dragMove = (x, y, pid) => evalJS(`(function(){window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:${x},clientY:${y},pointerId:${pid}}));return true})()`);
  const dragEnd = (x, y, pid) => evalJS(`(function(){window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:${x},clientY:${y},pointerId:${pid}}));return true})()`);

  const SNAP = `(function(){
    var st=document.querySelector('#orbStage'),its=[].slice.call(document.querySelectorAll('.orb-major'));
    var sk=its.map(function(i){return i.querySelector('.orb-skin')});
    return {ry:st.style.getPropertyValue('--ry'),rx:st.style.getPropertyValue('--rx'),
      t:its.map(function(i){return Number(i.style.getPropertyValue('--t'))}),
      txt:its.map(function(i){return i.style.getPropertyValue('--txt-op')}),
      w:its.map(function(i){return Math.round(i.getBoundingClientRect().width)}),
      h:its.map(function(i){return Math.round(i.getBoundingClientRect().height)}),
      cx:its.map(function(i){var r=i.getBoundingClientRect();return Math.round(r.left+r.width/2)}),
      cy:its.map(function(i){var r=i.getBoundingClientRect();return Math.round(r.top+r.height/2)}),
      textW:its.map(function(i){return Math.round(i.querySelector('.orb-text').getBoundingClientRect().width)}),
      textTransform:its.map(function(i){return getComputedStyle(i.querySelector('.orb-text')).transform}),
      op:sk.map(function(s){return Number(getComputedStyle(s).opacity)}),
      filter:sk.map(function(s){return getComputedStyle(s).filter}),
      orb:its.map(function(i){return i.getAttribute('data-orb')})};})()`;
  const snap = () => evalJS(SNAP);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await setWidth(1440, 900);
  await navigate(URL_, 2500);
  await clearState();
  await reload();

  /* ===== 验收 1：四层结构 + 等边三角形 + 玻璃边缘光 ===== */
  const init = await evalJS(`(function(){
    var scene=document.querySelector('#orbScene'),stage=document.querySelector('#orbStage'),
        shell=document.querySelector('.orb-shell'),rim=document.querySelector('.orb-rim'),
        items=[].slice.call(document.querySelectorAll('.orb-major')),skin=items[0].querySelector('.orb-skin');
    var R=function(e){var r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2),left:Math.round(r.left),right:Math.round(r.right)}};
    var c=items.map(R);
    var base=Math.abs(c[1].cx-c[2].cx), l1=Math.hypot(c[0].cx-c[2].cx,c[0].cy-c[2].cy), l2=Math.hypot(c[0].cx-c[1].cx,c[0].cy-c[1].cy);
    return {
      scene:{perspective:getComputedStyle(scene).perspective,origin:getComputedStyle(scene).perspectiveOrigin,overflow:getComputedStyle(scene).overflow},
      stage:{overflow:getComputedStyle(stage).overflow,style:getComputedStyle(stage).transformStyle,transform:getComputedStyle(stage).transform,z:getComputedStyle(stage).zIndex},
      item:{overflow:getComputedStyle(items[0]).overflow,style:getComputedStyle(items[0]).transformStyle,transform:getComputedStyle(items[0]).transform},
      skin:{overflow:getComputedStyle(skin).overflow,bg:getComputedStyle(skin).backgroundImage,shadow:getComputedStyle(skin).boxShadow},
      shell:{z:getComputedStyle(shell).zIndex,rect:R(shell),bg:getComputedStyle(shell).backgroundImage},
      rim:{z:getComputedStyle(rim).zIndex,bg:getComputedStyle(rim).backgroundImage,shadow:getComputedStyle(rim).boxShadow},
      order:[].slice.call(scene.children).map(function(x){return x.className}),
      centers:c,base:base,l1:l1,l2:l2,
      topHit:(function(){var e=document.elementFromPoint(c[0].cx,c[0].cy);return e?e.className:null})(),
      azel:items.map(function(i){return i.getAttribute('data-az')+'/'+i.getAttribute('data-el')}),
      names:items.map(function(i){return i.getAttribute('aria-label')}),
      majorCount:items.length,minorCount:document.querySelectorAll('.orb-minor').length,
      identityHidden:document.querySelector('#identityBar').hidden,
      introHidden:document.querySelector('#introModal').hidden,
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
      imgs:document.querySelectorAll('img').length,
      scripts:[].slice.call(document.scripts).map(function(s){return s.src}).filter(Boolean),
      ai:document.querySelector('#aiStatus').innerText,mode:document.querySelector('#modeHint').innerText};})()`);
  console.log('INIT:', JSON.stringify(init, null, 1));
  check('验收1 · 四层 3D 结构、等边三角形、玻璃边缘光可见且球未被遮挡',
    init.scene.perspective === '1200px' &&
    /perspective-origin:\s*50%\s*50%/.test(fs.readFileSync('E:/gzkj/xiaotong/orb-view.css', 'utf8')) &&
    init.stage.style === 'preserve-3d' && init.stage.overflow === 'visible' &&
    init.item.style === 'preserve-3d' && init.item.overflow === 'visible' &&
    /matrix3d/.test(init.item.transform) && init.skin.overflow === 'hidden' &&
    /radial-gradient/.test(init.skin.bg) && /inset/.test(init.skin.shadow) &&
    init.rim.z === '3' && init.rim.bg === 'none' && /inset/.test(init.rim.shadow) &&
    init.shell.z === '0' && init.majorCount === 3 &&
    init.azel.join('/') === '0/48/42/-20/-42/-20' &&
    Math.abs(init.l1 - init.base) / init.base < .05 && Math.abs(init.l2 - init.base) / init.base < .05 &&
    init.centers[0].cy < init.centers[1].cy && Math.abs(init.centers[1].cy - init.centers[2].cy) <= 1 &&
    /orb-skin/.test(init.topHit) && init.identityHidden && init.introHidden,
    { base: init.base, l1: init.l1, l2: init.l2, centers: init.centers, topHit: init.topHit });

  /* ===== 验收 2：初始三球大小接近 ===== */
  const s0 = await snap();
  const eq = s0.w.map((w, i) => Math.sqrt(w * s0.h[i]));
  check('验收2 · 初始三球大小接近（等效直径差异 <35%），深度因子接近',
    Math.max(...eq) / Math.min(...eq) < 1.35 && Math.max(...s0.t) - Math.min(...s0.t) < .05 &&
    s0.op.every(o => o > .85) && s0.txt.every(t => t === '1'),
    { eq: eq.map(Math.round), t: s0.t, op: s0.op });

  /* ===== 验收 3 / 5 / 6：向左拖 ===== */
  await dragStart(700, 400, 11); await dragMove(580, 400, 11); await sleep(220);
  const sl = await snap();
  console.log('DRAG_LEFT:', JSON.stringify(sl));
  const leftIdx = 2, rightIdx = 1; // 运动健康(左) / 作息健康(右)
  check('验收3 · 向左拖：左球明显缩小变暗变虚、右球变大变亮（球面绕行非整体倾斜）',
    parseFloat(sl.ry) < -30 && /rotateY|matrix3d/.test(await evalJS(`getComputedStyle(document.querySelector('#orbStage')).transform`)) &&
    sl.t[leftIdx] < s0.t[leftIdx] - .2 && sl.w[leftIdx] < s0.w[leftIdx] * .6 &&
    sl.op[leftIdx] < s0.op[leftIdx] - .15 && parseFloat(sl.filter[leftIdx].match(/blur\(([\d.]+)px\)/)[1]) >
      parseFloat(s0.filter[leftIdx].match(/blur\(([\d.]+)px\)/)[1]) + .5 &&
    sl.t[rightIdx] > s0.t[rightIdx] + .1 && sl.w[rightIdx] > s0.w[rightIdx] * 1.1 &&
    sl.op[rightIdx] > s0.op[rightIdx] + .05 &&
    sl.cx[leftIdx] < s0.cx[leftIdx] && sl.cx[rightIdx] !== s0.cx[rightIdx],
    { ry: sl.ry, t: sl.t, w: sl.w, op: sl.op, cx: sl.cx });
  check('验收5 · 拖动时球内文字跟着缩小、透视形变，且不做反向旋转抵消',
    sl.textW[leftIdx] < s0.textW[leftIdx] * .6 && sl.textW[rightIdx] > s0.textW[rightIdx] &&
    sl.textTransform.every(t => t === 'none'),
    { textW: sl.textW, transforms: sl.textTransform });
  check('验收6 · 转到背面的球变暗变虚，文字不会硬糊在正面',
    sl.op[leftIdx] < .75 && /blur\((1|0\.9)/.test(sl.filter[leftIdx]) &&
    sl.textW[leftIdx] < s0.textW[leftIdx] * .6 &&
    /--txt-op/.test(fs.readFileSync('E:/gzkj/xiaotong/orb-view.css', 'utf8')) &&
    /t < 0\.25 \? '0\.35'/.test(fs.readFileSync('E:/gzkj/xiaotong/orb-view.js', 'utf8')),
    { darkOp: sl.op[leftIdx], darkFilter: sl.filter[leftIdx], darkTextW: sl.textW[leftIdx] });

  /* 背面保护分支：直接指定大角度，验证 t<0.25 时文字透明度 0.35 */
  const back = await evalJS(`(function(){window.__orbApply(140,0);var its=[].slice.call(document.querySelectorAll('.orb-major'));
    var r={t:its.map(function(i){return Number(i.style.getPropertyValue('--t'))}),txt:its.map(function(i){return i.style.getPropertyValue('--txt-op')}),
    op:its.map(function(i){return Number(getComputedStyle(i.querySelector('.orb-skin')).opacity)})};
    window.__orbApply(0,0);return r})()`);
  check('验收6b · t<0.25 时文字透明度降到 0.35、球体显著变暗（背面保护）',
    back.t.some(t => t < .25) && back.txt.filter(x => x === '0.35').length >= 2 &&
    back.op.some(o => o < .45), back);

  /* ===== 验收 7：松手 500ms 内回弹 ===== */
  await dragEnd(580, 400, 11); await sleep(530);
  const sr = await snap();
  check('验收7 · 松手后 500ms 内回到 0deg / 0deg',
    Math.abs(parseFloat(sr.ry)) < .01 && Math.abs(parseFloat(sr.rx)) < .01 &&
    sr.t.every((t, i) => Math.abs(t - s0.t[i]) < .001), { ry: sr.ry, rx: sr.rx, t: sr.t });

  /* ===== 验收 4：向右拖，效果相反 ===== */
  await dragStart(700, 400, 12); await dragMove(820, 400, 12); await sleep(220);
  const sd = await snap();
  check('验收4 · 向右拖效果相反：右球变小变暗、左球变大变亮',
    parseFloat(sd.ry) > 30 && sd.t[rightIdx] < s0.t[rightIdx] - .2 &&
    sd.w[rightIdx] < s0.w[rightIdx] * .6 && sd.op[rightIdx] < s0.op[rightIdx] - .15 &&
    sd.t[leftIdx] > s0.t[leftIdx] + .1 && sd.w[leftIdx] > s0.w[leftIdx] * 1.1,
    { ry: sd.ry, t: sd.t, w: sd.w, op: sd.op });
  await dragEnd(820, 400, 12); await sleep(600);

  /* ===== 验收 8：位移 < 8px 判定为点击，能触发分裂 ===== */
  await dragStart(700, 400, 13); await dragMove(705, 400, 13); await dragEnd(705, 400, 13);
  await sleep(120);
  await evalJS(`(function(){document.querySelector('.orb-major[data-orb="food"]').click();return true})()`);
  await sleep(950);
  const clickState = await evalJS(`(function(){var st=document.querySelector('#orbStage');return {
    ry:st.style.getPropertyValue('--ry'),split:st.classList.contains('major-out'),
    minors:document.querySelectorAll('.orb-minor.is-current').length};})()`);
  check('验收8 · 位移 <8px 不旋转，判定为点击并正常触发分裂',
    Math.abs(parseFloat(clickState.ry)) < .01 && clickState.split && clickState.minors === 3, clickState);

  /* ===== 验收 9：分裂后中球更大、切换器隐藏、左上角返回 ===== */
  const sp = await evalJS(`(function(){
    var st=document.querySelector('#orbStage'),mins=[].slice.call(document.querySelectorAll('.orb-minor.is-current')),
        b=document.querySelector('#orbBack'),maj=[].slice.call(document.querySelectorAll('.orb-major'));
    return {cls:st.className,page:document.querySelector('.page').className,
      switchDisplay:getComputedStyle(document.querySelector('.ui-switch')).display,
      idDisplay:getComputedStyle(document.querySelector('#identityBar')).display,
      backHidden:b.hidden,backW:Math.round(b.getBoundingClientRect().width),
      backBg:getComputedStyle(b).backgroundColor,
      majorOp:maj.map(function(m){return getComputedStyle(m).opacity}),
      minors:mins.map(function(m){return {name:m.getAttribute('data-mod'),w:Math.round(m.getBoundingClientRect().width),
        op:getComputedStyle(m).opacity,vis:getComputedStyle(m).visibility,
        dur:getComputedStyle(m).animationDuration,delay:getComputedStyle(m).animationDelay,
        ease:getComputedStyle(m).animationTimingFunction,
        R:getComputedStyle(m).getPropertyValue('--R').trim(),d:getComputedStyle(m).getPropertyValue('--d').trim()}}),
      majorDur:getComputedStyle(maj[0]).transitionDuration,
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};})()`);
  console.log('SPLIT:', JSON.stringify(sp, null, 1));
  check('验收9 · 分裂后三个中球更大占满视图、切换器隐藏、44px 返回按钮、时序正确',
    sp.cls.indexOf('major-out') >= 0 && sp.cls.indexOf('minor-on') >= 0 &&
    sp.page.indexOf('orb-split') >= 0 && sp.switchDisplay === 'none' && sp.idDisplay === 'none' &&
    !sp.backHidden && sp.backW === 44 &&
    sp.majorOp.every(o => o === '0') && sp.minors.length === 3 &&
    sp.minors.every(m => m.w > 200 && m.op === '1' && m.vis === 'visible' &&
      m.dur === '0.42s' && m.delay === '0.22s' && m.ease === 'cubic-bezier(0.22, 1, 0.36, 1)' &&
      m.R === '175px' && m.d === '200px') &&
    sp.scrollWidth <= sp.clientWidth + 1,
    { minors: sp.minors.map(m => ({ name: m.name, w: m.w, R: m.R, d: m.d })), switchDisplay: sp.switchDisplay });

  /* 中球层同样支持拖动自转与深度处理 */
  await dragStart(700, 400, 14); await dragMove(600, 400, 14); await sleep(220);
  const minorDrag = await evalJS(`(function(){var m=[].slice.call(document.querySelectorAll('.orb-minor.is-current'));return {
    ry:document.querySelector('#orbStage').style.getPropertyValue('--ry'),
    t:m.map(function(x){return Number(x.style.getPropertyValue('--t'))})};})()`);
  check('验收9b · 中球层同样支持拖动自转与逐帧深度处理',
    parseFloat(minorDrag.ry) < -30 && new Set(minorDrag.t.map(t => t.toFixed(3))).size >= 2, minorDrag);
  await dragEnd(600, 400, 14); await sleep(600);

  /* ===== 验收 10：点返回倒放回到三个大球 ===== */
  await evalJS(`(function(){document.querySelector('#orbBack').click();return true})()`);
  await sleep(400);
  const backState = await evalJS(`(function(){var st=document.querySelector('#orbStage'),
    maj=[].slice.call(document.querySelectorAll('.orb-major')),mins=[].slice.call(document.querySelectorAll('.orb-minor'));
    return {cls:st.className,page:document.querySelector('.page').className,
      switchDisplay:getComputedStyle(document.querySelector('.ui-switch')).display,
      backHidden:document.querySelector('#orbBack').hidden,
      majorOp:maj.map(function(m){return getComputedStyle(m).opacity}),
      majorPush:maj.map(function(m){return getComputedStyle(m).getPropertyValue('--push').trim()}),
      minorVis:mins.map(function(m){return getComputedStyle(m).visibility}),
      ry:st.style.getPropertyValue('--ry')};})()`);
  check('验收10 · 点返回倒放：中球收起、大球恢复、切换器与身份条回来',
    backState.cls.indexOf('major-out') < 0 && backState.cls.indexOf('minor-on') < 0 &&
    backState.page.indexOf('orb-split') < 0 && backState.switchDisplay !== 'none' &&
    backState.backHidden && backState.majorOp.every(o => o === '1') &&
    backState.majorPush.every(p => p === '0px') && backState.minorVis.every(v => v === 'hidden'),
    backState);

  /* ===== 验收 11：点中球仍能滑出详情面板 + 九条文案 ===== */
  await evalJS(`(function(){document.querySelector('.orb-major[data-orb="food"]').click();return true})()`);
  await sleep(900);
  await evalJS(`(function(){document.querySelector('.orb-minor.is-current[data-mod="菜品营养"]').click();return true})()`);
  await sleep(550);
  const detail = await evalJS(`(function(){var p=document.querySelector('#orbDetail'),r=p.getBoundingClientRect();return {
    hidden:p.hidden,open:p.classList.contains('open'),w:Math.round(r.width),right:Math.round(r.right),
    title:document.querySelector('#orbDetailTitle').innerText,tag:document.querySelector('.orb-detail-tag').innerText,
    desc:document.querySelector('#orbDetailDesc').innerText,
    foot:document.querySelector('#orbDetailReturn').innerText};})()`);
  check('验收11 · 点中球仍右侧滑出 480px 详情面板，标题与占位说明正确',
    !detail.hidden && detail.open && detail.w === 480 && detail.right === 1440 &&
    detail.title === '菜品营养' && detail.tag === '模块开发中' &&
    detail.desc === '每道菜的热量、蛋白质、脂肪、钠含量与搭配建议' &&
    detail.foot === '返回小球视图', detail);
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
  check('硬约束 · 九个子模块占位文案逐字不动',
    descs.length === 9 && descs.every(d => { const p = d.split('|'); return EXPECT[p[0]] === p[1]; }),
    { count: descs.length });

  /* ===== 硬约束：无 3D 库 / 无外部图片 / 不改对话视图 / 云数据库仍在 ===== */
  check('硬约束 · 纯 CSS 3D（无 Three.js、无外部图片、无 rotate3d、无横向溢出）',
    init.imgs === 0 && !init.scripts.some(s => /three/i.test(s)) &&
    !/rotate3d|matrix3d|url\(/i.test(fs.readFileSync('E:/gzkj/xiaotong/orb-view.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')) &&
    init.scrollWidth <= init.clientWidth + 1 &&
    /AI 意图识别/.test(init.ai) && /云数据库/.test(init.mode),
    { imgs: init.imgs, ai: init.ai, mode: init.mode });

  /* ===== 对话视图回归 ===== */
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
    { chat, qa, expected: exp, dqOk: !!dqOk, faq, form });
  await evalJS(`(function(){document.querySelector('#leaveModal').hidden=true;document.body.style.overflow='';return true})()`);
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="orb"]').click();return true})()`);
  await sleep(350);

  /* ===== 验收 12：390px 手机端 ===== */
  await setWidth(390, 844);
  await reload();
  const mob = await evalJS(`(function(){
    var shell=document.querySelector('.orb-shell'),rim=document.querySelector('.orb-rim'),
        items=[].slice.call(document.querySelectorAll('.orb-major')),scene=document.querySelector('#orbScene');
    var R=function(e){var r=e.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left),right:Math.round(r.right),cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}};
    return {shell:R(shell),rim:R(rim),scene:R(scene),items:items.map(R),
      d:getComputedStyle(items[0]).getPropertyValue('--d').trim(),
      R:getComputedStyle(items[0]).getPropertyValue('--R').trim(),
      font:getComputedStyle(items[0].querySelector('.orb-text')).fontSize,
      switchW:Math.round(document.querySelector('.ui-switch').getBoundingClientRect().width),
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
      perspective:getComputedStyle(scene).perspective};})()`);
  console.log('MOBILE:', JSON.stringify(mob));
  check('验收12a · 390px 外壳不溢出、三球完整可见、切换器可见、R/球径/字号按手机规格',
    mob.shell.left >= 0 && mob.shell.right <= 390 && Math.abs(mob.shell.w - 390 * .96) <= 2 &&
    mob.items.every(r => r.left >= 0 && r.right <= 390 && r.w > 40) &&
    mob.d === '104px' && mob.R === '140px' && mob.font === '15px' &&
    mob.switchW < 390 && mob.scrollWidth <= mob.clientWidth + 1 && mob.perspective === '1200px',
    { shell: mob.shell, d: mob.d, R: mob.R, scrollWidth: mob.scrollWidth });

  await dragStart(195, 300, 21); await dragMove(120, 300, 21); await sleep(220);
  const mobDrag = await evalJS(`(function(){var st=document.querySelector('#orbStage');return {
    ry:st.style.getPropertyValue('--ry'),
    t:[].slice.call(document.querySelectorAll('.orb-major')).map(function(i){return Number(i.style.getPropertyValue('--t'))}),
    scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};})()`);
  await dragEnd(120, 300, 21); await sleep(600);
  check('验收12b · 390px 拖动自转正常、不掉帧、无横向溢出',
    parseFloat(mobDrag.ry) < -20 && new Set(mobDrag.t.map(t => t.toFixed(3))).size >= 2 &&
    mobDrag.scrollWidth <= mobDrag.clientWidth + 1, mobDrag);

  await evalJS(`(function(){document.querySelector('.orb-major[data-orb="sleep"]').click();return true})()`);
  await sleep(950);
  const mobSplit = await evalJS(`(function(){var m=[].slice.call(document.querySelectorAll('.orb-minor.is-current'));return {
    count:m.length,rects:m.map(function(x){var r=x.getBoundingClientRect();return {w:Math.round(r.width),left:Math.round(r.left),right:Math.round(r.right)}}),
    R:getComputedStyle(m[0]).getPropertyValue('--R').trim(),d:getComputedStyle(m[0]).getPropertyValue('--d').trim(),
    scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};})()`);
  check('验收12c · 390px 分裂中球 R=96px / 球径 140px 且不出屏',
    mobSplit.count === 3 && mobSplit.R === '96px' && mobSplit.d === '140px' &&
    mobSplit.rects.every(r => r.left >= 0 && r.right <= 390) &&
    mobSplit.scrollWidth <= mobSplit.clientWidth + 1, mobSplit);

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
