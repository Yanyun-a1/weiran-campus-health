/* 校园健康助手 v8「逐级返回 + 三段式分裂动画」无头浏览器验收
 * 用法：node e2e-v8.js [URL]   依赖本机 9222 端口的无头 Chrome（CDP）
 * 交互一律走 CDP 真实鼠标 / 触摸输入；动画中间帧按时间采样。
 */
const fs = require('fs');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CDP = 'http://127.0.0.1:9222';
const APP = 'E:/gzkj/xiaotong/';
const BACKUP = 'E:/gzkj/backups/xiaotong-v7-2026-11-11/';
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
  const navigate = async (url, wait = 2600) => { await send('Page.navigate', { url }); await sleep(wait); };
  const reload = async (wait = 2900) => { await send('Page.reload'); await sleep(wait); };
  const setWidth = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 769 });
    await sleep(600);
  };
  const clearState = () => evalJS(`(function(){['xiaotong.ui.v1','xiaotong.identity.v1','xiaotong.intro.v1'].forEach(function(k){localStorage.removeItem(k)});return true})()`);
  const waitFor = async (expr, timeout = 12000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) { const v = await evalJS(expr); if (v) return v; await sleep(120); }
    return null;
  };
  const waitAnimEnd = async () => { await sleep(60); return waitFor('!window.__orbState().isAnimating', 6000); };
  const sendText = t => evalJS(`(function(){var i=document.querySelector('#userInput');i.value=${JSON.stringify(t)};document.querySelector('#sendBtn').click();return true})()`);
  const waitText = (needle, timeout = 25000) =>
    waitFor(`(function(){var l=document.querySelector('#chatLog');return !!l&&l.innerText.indexOf(${JSON.stringify(needle)})>=0})()`, timeout);

  const mouseDown = (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  const mouseMove = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 1 });
  const mouseUp = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  const clickAt = async (x, y) => { await mouseDown(x, y); await mouseUp(x, y); };

  const GEO = `(function(){
    var s=document.querySelector('#orbScene').getBoundingClientRect();
    var r=function(e){var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2),w:Math.round(b.width),h:Math.round(b.height)}};
    return {scene:{cx:Math.round(s.left+s.width/2),cy:Math.round(s.top+s.height/2),left:Math.round(s.left),right:Math.round(s.right)},
      balls:[].slice.call(document.querySelectorAll('.orb-major')).map(r),
      minors:[].slice.call(document.querySelectorAll('.orb-minor.is-current')).map(r),
      back:(function(){var b=document.querySelector('#orbBack'),q=b.getBoundingClientRect();return {x:Math.round(q.left+q.width/2),y:Math.round(q.top+q.height/2)}})()};})()`;
  const geo = () => evalJS(GEO);

  /* 采样：大球 3 个 + 当前中球 3 个，含内联目标值与 computed 当前值 */
  const SAMPLE = `(function(){
    var its=[].slice.call(document.querySelectorAll('.orb-major,.orb-minor.is-current'));
    var list=its.map(function(e){
      var cs=getComputedStyle(e),m=new DOMMatrix(cs.transform);
      return {cls:e.className,group:e.getAttribute('data-group'),mod:e.getAttribute('data-mod'),
        picked:e.getAttribute('data-picked'),tf:e.style.transform,op:e.style.opacity,
        filter:e.style.filter,trans:e.style.transition,vis:e.style.visibility,z:e.style.zIndex,
        skinShadow:(e.querySelector('.orb-skin')||{style:{boxShadow:''}}).style.boxShadow,
        cw:+m.a.toFixed(4),ch:+m.d.toFixed(4),compVis:cs.visibility,compOp:cs.opacity,
        px:e.style.getPropertyValue('--px'),py:e.style.getPropertyValue('--py'),sc:e.style.getPropertyValue('--sc'),
        keep:e.getAttribute('data-keep')};
    });
    return {state:window.__orbState(),anim:window.__orbAnim(),items:list,
      stageIsSub:document.querySelector('#orbStage').classList.contains('is-sub'),
      stageChildren:document.querySelector('#orbStage').children.length,
      stageSame:(window.__stageRef===document.querySelector('#orbStage')),
      detailHidden:document.querySelector('#orbDetail').hidden,
      detailOpen:document.querySelector('#orbDetail').classList.contains('open'),
      detailTitle:document.querySelector('#orbDetailTitle').innerText,
      backHidden:document.querySelector('#orbBack').hidden,
      orbSplit:document.querySelector('.page').classList.contains('orb-split'),
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,
      scrollY:window.scrollY};})()`;
  const sample = () => evalJS(SAMPLE);
  const majors = s => s.items.filter(i => /orb-major/.test(i.cls));
  const minors = s => s.items.filter(i => /orb-minor/.test(i.cls));
  const scaleOf = tf => { const m = /scale\(([\d.]+)\)/.exec(tf || ''); return m ? +m[1] : null; };
  /* 浏览器会把内联 transform 序列化成 translate3d(0px, 0px, 0px) scale(1.35)，
   * 不能用生成时的字符串硬匹配，按值解析。 */
  const parseTf = tf => {
    const m = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*[-\d.]+px\)\s*scale\(([\d.]+)\)/.exec(tf || '');
    return m ? { x: +m[1], y: +m[2], sc: +m[3] } : null;
  };
  const markT = (s, p) => { const x = s.anim.marks.find(m => m.phase === p); return x ? x.t : null; };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await setWidth(1440, 900);
  await navigate(URL_, 2500);
  await clearState();
  await reload();

  /* ===== 硬约束：v7 的投影公式 / 事件绑定 / 视觉样式逐字未改 ===== */
  const v7js = fs.readFileSync(BACKUP + 'orb-view.js', 'utf8');
  const v8js = fs.readFileSync(APP + 'orb-view.js', 'utf8');
  const v7css = fs.readFileSync(BACKUP + 'orb-view.css', 'utf8');
  const v8css = fs.readFileSync(APP + 'orb-view.css', 'utf8');
  const cut = (t, a, b) => t.slice(t.indexOf(a), t.indexOf(b, t.indexOf(a)));
  const projSame = cut(v7js, 'function applyProjection(', '/* 规格里的缓动') === cut(v8js, 'function applyProjection(', '/* 规格里的缓动');
  const orbSame = cut(v7js, 'var ORBS = [', 'function shade(') === cut(v8js, 'var ORBS = [', 'function shade(');
  const htmlSame = cut(v7js, 'function itemHtml(', 'var MAJORS') === cut(v8js, 'function itemHtml(', 'var MAJORS');
  const dragA = cut(v7js, '  function bindDrag() {', '  /* ================= 分裂');
  const dragB = cut(v8js, '  function bindDrag() {', '  /* ================= 三段式');
  const guardLine = '      if (isAnimating) return;                           // 动画期间忽略一切指针输入\n';
  const dragSame = dragB.replace(guardLine, '').replace('else if (hitBack) goRoot();', 'else if (hitBack) collapse();') === dragA;
  /* CSS：v7 中所有「视觉规则」行仍逐字存在（动画块 / 注释 / 过渡声明除外） */
  const animSkip = l => /^\s*(\/\*|\*|\*\/)/.test(l);
  const cssSkip = l => animSkip(l) || /@keyframes|animation:|major-out|minor-on|minor-out|^\s*transition: opacity \.24s|^\s*visibility: hidden; opacity: 0;|^\s*from \{|^\s*to\s+\{|^\s*\}/.test(l);
  const cssMissing = v7css.split('\n').filter(l => l.trim() && !cssSkip(l)).filter(l => v8css.indexOf(l) < 0);
  const visualOK = ['--R: 250px', '--d: 150px', '--R: 175px', '--d: 200px',
    'radial-gradient(circle at 32% 26%', 'inset 0 0 24px rgba(0, 0, 0, .28)',
    '--shell-d: 720px', '--shell-d: 96vw', 'font-size: 17px', 'font-size: 15px'].every(s => v8css.indexOf(s) >= 0);
  /* 三色在 ORBS 数组里，不在 CSS 中 */
  const colorsOK = ['#FFD9BE', '#FF8A5B', '#C9442A', '#C7CFFF', '#6B7BE8', '#3B49A8',
    '#A8F0E8', '#2AA79B', '#16756C'].every(s => v8js.indexOf(s) >= 0);
  const noKeyframes = !/@keyframes|animation\s*:/.test(v8css) && !/\.style\.animation/.test(v8js);
  const no3d = !/preserve-3d|perspective|rotateY|rotateX|translateZ/.test(v8css + v8js);
  const stateOK = /level = 'root'/.test(v8js) && /setLevel\('sub'\)/.test(v8js) && /setLevel\('detail'\)/.test(v8js) &&
    !/var detailOpen/.test(v8js) && !/function collapse\(/.test(v8js);
  check('硬约束 · 投影公式/事件绑定/尺寸配色五层配方逐字未改，只改动画与层级',
    projSame && orbSame && htmlSame && dragSame && cssMissing.length === 0 && visualOK && colorsOK &&
    noKeyframes && no3d && stateOK && /var k = CAMERA_D \/ \(CAMERA_D - z2\)/.test(v8js),
    { projSame, orbSame, htmlSame, dragSame, cssMissing, visualOK, colorsOK, noKeyframes, no3d, stateOK });

  /* ===== 验收 4：阶段 A 聚焦（点球后 200ms 采样） ===== */
  const g = await geo();
  console.log('GEO:', JSON.stringify(g));
  await evalJS(`(function(){window.__stageRef=document.querySelector('#orbStage');return true})()`);
  await clickAt(g.balls[0].x, g.balls[0].y);
  await sleep(190);
  const A = await sample();
  const aHit = majors(A).find(i => i.picked === '1');
  const aOther = majors(A).filter(i => i.picked !== '1');
  console.log('PHASE_A:', JSON.stringify({ phase: A.anim.phase, hit: aHit, others: aOther.map(i => ({ tf: i.tf, op: i.op, filter: i.filter })) }));
  check('验收4 · 被点球放大居中到 1.35、z 提最高；另两球缩小到 0.55 并虚化变暗',
    A.state.isAnimating && A.anim.phase === 'A-start' &&
    aHit && (() => { const t = parseTf(aHit.tf); return t && t.x === 0 && t.y === 0 && Math.abs(t.sc - 1.35) < 0.002; })() &&
    aHit.z === '999' &&
    aOther.length === 2 && aOther.every(i => {
      const t = parseTf(i.tf), base = parseFloat(i.sc);
      return t && base > 0 && Math.abs(t.sc - base * 0.55) < 0.002 && i.op === '0.15' && /blur\(4px\)/.test(i.filter);
    }),
    { phase: A.anim.phase, hitTf: aHit && aHit.tf, hitZ: aHit && aHit.z, others: aOther.map(i => ({ tf: i.tf, op: i.op, filter: i.filter })) });

  /* ===== 验收 5：阶段 B 收缩消失 + 白光 + 中球从中心生成；阶段 C 飞向目标 ===== */
  await sleep(140);                       // 累计约 330ms，阶段 B 中
  const B = await sample();
  const bHit = majors(B).find(i => i.picked === '1');
  console.log('PHASE_B:', JSON.stringify({ phase: B.anim.phase, hitTf: bHit && bHit.tf, hitOp: bHit && bHit.op, shadow: bHit && bHit.skinShadow, minors: minors(B).map(i => ({ tf: i.tf, vis: i.vis, op: i.op })) }));
  check('验收5a · 被点球收缩到 0.15 并淡出，内层白光扩散；三个中球在场景中心生成',
    B.anim.phase === 'B-start' && bHit && Math.abs((parseTf(bHit.tf) || {}).sc - 0.15) < 0.002 && bHit.op === '0' &&
    /60px/.test(bHit.skinShadow || '') &&
    minors(B).length === 3 && minors(B).every(i => {
      const t = parseTf(i.tf);
      return i.vis === 'visible' && t && t.x === 0 && t.y === 0 && Math.abs(t.sc - 0.15) < 0.002 && i.op === '0';
    }),
    { phase: B.anim.phase, shadow: bHit && bHit.skinShadow, minorTf: minors(B)[0] && minors(B)[0].tf });

  await sleep(200);                       // 累计约 530ms，阶段 C 中
  const C = await sample();
  const cMin = minors(C);
  const flown = cMin.filter(i => i.tf && !/translate3d\(0\.00px,0\.00px,0\)/.test(i.tf));
  console.log('PHASE_C:', JSON.stringify({ phase: C.anim.phase, flown: flown.length, marks: C.anim.marks.map(m => m.phase) }));
  check('验收5b · 中球从中心飞向各自投影目标、opacity 1、blur 归零',
    flown.length >= 2 && cMin.every(i => i.op === '1' && /blur\(0px\)/.test(i.filter)) &&
    C.anim.marks.some(m => m.phase === 'C-start'),
    { flown: flown.length, tfs: cMin.map(i => i.tf) });

  const done = await waitAnimEnd();
  const SUB = await sample();
  check('验收5c · 动画结束落到 sub 静止态，中球三个可见且为正圆',
    !!done && SUB.state.level === 'sub' && SUB.stageIsSub && minors(SUB).length === 3 &&
    minors(SUB).every(i => i.compVis === 'visible' && Math.abs(i.cw - i.ch) < 0.001) &&
    majors(SUB).every(i => i.compVis === 'hidden') && SUB.detailHidden && !SUB.backHidden,
    { level: SUB.state.level, stageIsSub: SUB.stageIsSub, minors: minors(SUB).length });

  /* ===== 验收 6 / 7：错开 40ms、总时长约 700ms ===== */
  const c0 = markT(SUB, 'C0'), c1 = markT(SUB, 'C1'), c2 = markT(SUB, 'C2');
  const a0 = markT(SUB, 'A-start'), end = markT(SUB, 'settle-sub');
  check('验收6 · 三个中球错开 40ms 出发，不同时弹出',
    c0 !== null && c1 !== null && c2 !== null && c1 - c0 >= 20 && c1 - c0 <= 90 &&
    c2 - c1 >= 20 && c2 - c1 <= 90, { c0, c1, c2, d1: c1 - c0, d2: c2 - c1 });
  check('验收7 · 进入动画总时长约 700ms，无跳帧（三段时序齐全）',
    a0 !== null && end !== null && end - a0 >= 640 && end - a0 <= 900 &&
    ['A-start', 'B-start', 'C-start', 'C0', 'C1', 'C2', 'settle-sub'].every(p => SUB.anim.marks.some(m => m.phase === p)),
    { total: end - a0, phases: SUB.anim.marks.map(m => m.phase) });

  /* ===== 验收 1：详情面板返回只回 sub，不跳级 ===== */
  const g2 = await geo();
  await clickAt(g2.minors[0].x, g2.minors[0].y);
  await sleep(520);
  const DET = await sample();
  check('验收1a · 点中球正常打开详情面板（level=detail）',
    DET.state.level === 'detail' && !DET.detailHidden && DET.detailOpen && DET.detailTitle === '菜品营养',
    { level: DET.state.level, title: DET.detailTitle, open: DET.detailOpen });
  await evalJS(`(function(){document.querySelector('#orbDetailBack').click();return true})()`);
  await sleep(560);
  const AFTER = await sample();
  check('验收1 · 详情面板返回后回到「中球层」，不是三个大球',
    AFTER.state.level === 'sub' && AFTER.stageIsSub && minors(AFTER).length === 3 &&
    minors(AFTER).every(i => i.compVis === 'visible') && majors(AFTER).every(i => i.compVis === 'hidden') &&
    AFTER.detailHidden && !AFTER.backHidden && AFTER.orbSplit,
    { level: AFTER.state.level, stageIsSub: AFTER.stageIsSub, backHidden: AFTER.backHidden, minorsVisible: minors(AFTER).length });

  /* ===== 验收 3：详情返回不重建 stage，中球位置与状态保持原样 ===== */
  await evalJS(`(function(){[].slice.call(document.querySelectorAll('.orb-minor.is-current')).forEach(function(m){m.setAttribute('data-keep','v8')});return true})()`);
  const BEFORE3 = await sample();
  const beforeVars = minors(BEFORE3).map(i => [i.px, i.py, i.sc].join('|'));
  const beforeChildren = BEFORE3.stageChildren;
  const g3 = await geo();
  await clickAt(g3.minors[0].x, g3.minors[0].y);
  await sleep(480);
  await evalJS(`(function(){document.querySelector('#orbDetailReturn').click();return true})()`);
  await sleep(560);
  const AFTER3 = await sample();
  check('验收3 · 详情返回不重建 stage，三个中球节点与投影值原样保留',
    AFTER3.stageChildren === beforeChildren && AFTER3.stageSame &&
    minors(AFTER3).length === 3 && minors(AFTER3).every(i => i.keep === 'v8') &&
    JSON.stringify(minors(AFTER3).map(i => [i.px, i.py, i.sc].join('|'))) === JSON.stringify(beforeVars) &&
    AFTER3.state.level === 'sub',
    { children: [beforeChildren, AFTER3.stageChildren], stageSame: AFTER3.stageSame, vars: [beforeVars, minors(AFTER3).map(i => i.px)] });

  /* ===== 验收 8 / 2：返回动画收拢 + 逐级回 root ===== */
  const g4 = await geo();
  await clickAt(g4.back.x, g4.back.y);
  await sleep(175);
  const OUT = await sample();
  console.log('PHASE_OUT:', JSON.stringify({ phase: OUT.anim.phase, minors: minors(OUT).map(i => ({ tf: i.tf, op: i.op })), majors: majors(OUT).map(i => ({ tf: i.tf, op: i.op })) }));
  check('验收8 · 返回时三个中球向中心收拢到 0.2 淡出，大球随后从中心放大出现',
    OUT.state.isAnimating && minors(OUT).length === 3 &&
    minors(OUT).every(i => {
      const t = parseTf(i.tf);
      return t && t.x === 0 && t.y === 0 && Math.abs(t.sc - 0.2) < 0.002 && i.op === '0';
    }) &&
    majors(OUT).some(i => i.op === '1' && i.vis === 'visible'),
    { phase: OUT.anim.phase, minorTf: minors(OUT)[0] && minors(OUT)[0].tf, majorOps: majors(OUT).map(i => i.op) });
  await waitAnimEnd();
  const ROOT = await sample();
  const o0 = markT(ROOT, 'OUT0'), o1 = markT(ROOT, 'OUT1'), o2 = markT(ROOT, 'OUT2');
  const os = markT(ROOT, 'OUT-start'), oe = markT(ROOT, 'settle-root');
  check('验收2 · 中球层返回到达「大球层」，静止态完整复位',
    ROOT.state.level === 'root' && !ROOT.stageIsSub && !ROOT.orbSplit && ROOT.backHidden &&
    ROOT.detailHidden && majors(ROOT).every(i => i.compVis === 'visible' && Math.abs(i.cw - i.ch) < 0.001) &&
    minors(ROOT).length === 0 && ROOT.stageSame,
    { level: ROOT.state.level, stageIsSub: ROOT.stageIsSub, backHidden: ROOT.backHidden });
  check('验收8b · 返回动画约 520ms、大球错开 40ms 出现',
    o0 !== null && o1 - o0 >= 20 && o1 - o0 <= 90 && o2 - o1 >= 20 && o2 - o1 <= 90 &&
    os !== null && oe !== null && oe - os >= 460 && oe - os <= 700,
    { total: oe - os, d1: o1 - o0, d2: o2 - o1 });

  /* ===== 验收 9：动画中点击无响应，不出现半截状态 ===== */
  await reload();
  const g5 = await geo();
  await clickAt(g5.balls[0].x, g5.balls[0].y);
  await sleep(140);
  await clickAt(g5.balls[1].x, g5.balls[1].y);   // 动画中再点另一个球
  await sleep(120);
  const MID = await sample();
  await waitAnimEnd();
  const MIDEND = await sample();
  check('验收9 · 动画进行中点击/拖动/键盘一律无响应，不会卡在半截状态',
    MID.state.picked === 'food' && MID.detailHidden && MID.state.level === 'root' &&
    MIDEND.state.level === 'sub' && MIDEND.state.picked === 'food' && !MIDEND.state.isAnimating &&
    MIDEND.stageIsSub && MIDEND.items.every(i => !i.trans && !i.tf && i.vis === '') &&
    MIDEND.detailHidden,
    { midLevel: MID.state.level, midPicked: MID.state.picked, endLevel: MIDEND.state.level, endPicked: MIDEND.state.picked });

  /* 键盘 Enter 在动画中也被忽略 */
  await evalJS(`(function(){document.querySelector('#orbBack').click();return true})()`);
  await waitAnimEnd();

  /* ===== 验收 10：动画结束后能正常拖动、正常点击 ===== */
  const g6 = await geo();
  const p0 = await sample();
  await mouseDown(g6.scene.cx, g6.scene.cy);
  await mouseMove(g6.scene.cx - 110, g6.scene.cy);
  await sleep(200);
  const DRAG = await sample();
  await mouseUp(g6.scene.cx - 110, g6.scene.cy);
  await sleep(620);
  const DRAGEND = await sample();
  check('验收10a · 动画结束后空白处拖动正常，松手 500ms 回弹归零',
    Math.abs(DRAG.state.ry) > 25 && DRAG.state.pointerId !== null &&
    Math.abs(DRAGEND.state.ry) < 0.01 && DRAGEND.state.mode === 'idle' && DRAGEND.state.pointerId === null,
    { ry: +DRAG.state.ry.toFixed(2), endRy: DRAGEND.state.ry });
  await clickAt(g6.balls[1].x, g6.balls[1].y);
  await waitAnimEnd();
  const g7 = await geo();
  await clickAt(g7.minors[0].x, g7.minors[0].y);
  await sleep(500);
  const CLICK = await sample();
  check('验收10b · 动画结束后重新分裂、点中球开详情都正常',
    CLICK.state.level === 'detail' && !CLICK.detailHidden && CLICK.detailTitle === '作息记录' &&
    CLICK.state.picked === 'sleep',
    { level: CLICK.state.level, picked: CLICK.state.picked, title: CLICK.detailTitle });
  await evalJS(`(function(){document.querySelector('#orbDetailBack').click();return true})()`);
  await sleep(500);
  const BACKSUB = await sample();
  check('验收10c · 第二次详情返回仍只回中球层（逐级返回可重复）',
    BACKSUB.state.level === 'sub' && BACKSUB.stageIsSub && minors(BACKSUB).length === 3,
    { level: BACKSUB.state.level });

  /* ===== 回归：对话视图 / 30 问答 / 问数 / 请假 / 9 条文案 / 无横向滚动 ===== */
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="chat"]').click();return true})()`);
  await sleep(260);
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
  const scrollOK = await evalJS(`(function(){return document.documentElement.scrollWidth<=document.documentElement.clientWidth+1})()`);
  check('回归 · 对话视图 30 问答 / 问数 / 请假 6 字段 / 9 条文案 / 无横向滚动条未受影响',
    !!qaOk && !!dqOk && faq.tabs === 10 && faq.items === 30 && !!formOk && form === 6 &&
    descs.length === 9 && descs[0] === '菜品营养|每道菜的热量、蛋白质、脂肪、钠含量与搭配建议' && scrollOK,
    { qaOk: !!qaOk, dqOk: !!dqOk, faq, form, descs: descs.length, scrollOK });
  await evalJS(`(function(){document.querySelector('#leaveModal').hidden=true;document.body.style.overflow='';return true})()`);

  /* ===== 验收 11：390px 下动画同样完整、无横向滚动 ===== */
  await setWidth(390, 844);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await clearState();                 // 回归时切到 chat 并存了偏好，这里必须回到默认小球视图
  await reload();
  const mg = await geo();
  await clickAt(mg.balls[0].x, mg.balls[0].y);
  await waitAnimEnd();
  const MOB = await sample();
  const mg2 = await geo();
  await clickAt(mg2.back.x, mg2.back.y);
  await waitAnimEnd();
  const MOBR = await sample();
  check('验收11 · 390px 下进入/返回动画完整、球为正圆、无横向滚动条',
    MOB.state.level === 'sub' && minors(MOB).length === 3 &&
    minors(MOB).every(i => Math.abs(i.cw - i.ch) < 0.001) &&
    MOBR.state.level === 'root' && majors(MOBR).every(i => Math.abs(i.cw - i.ch) < 0.001) &&
    MOB.scrollWidth <= MOB.clientWidth + 1 && MOBR.scrollWidth <= MOBR.clientWidth + 1,
    { subLevel: MOB.state.level, rootLevel: MOBR.state.level, sw: MOB.scrollWidth, cw: MOB.clientWidth });

  /* ===== 验收 12：全流程无 jsError ===== */
  check('验收12 · 全流程无 jsError', jsErrors.length === 0, { jsErrors });

  const pass = results.filter(r => r.ok).length;
  console.log('\n===== SUMMARY =====');
  console.log('TOTAL ' + results.length + ' PASS ' + pass + ' FAIL ' + (results.length - pass));
  if (pass !== results.length) console.log('FAILED:\n' + results.filter(r => !r.ok).map(r => ' - ' + r.name).join('\n'));
  ws.close();
  if (pass !== results.length) process.exitCode = 1;
}
main().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
