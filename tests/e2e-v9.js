/* 校园健康助手 v9「顶栏渐隐渐显」无头浏览器验收
 * 用法：node e2e-v9.js [URL]   依赖本机 9222 端口的无头 Chrome（CDP）
 * 交互一律走 CDP 真实鼠标；opacity 曲线用页面内 rAF 逐帧记录，按 pointerdown 对齐 t0。
 */
const fs = require('fs');
const path = require('path');
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const CDP = 'http://127.0.0.1:9222';
const APP = 'E:/gzkj/xiaotong/';
const BACKUP = 'E:/gzkj/backups/xiaotong-v8-2026-11-11/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
const walk = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
  d.isDirectory() ? walk(path.join(dir, d.name), base + d.name + '/') : [base + d.name]);

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
  const mouseUp = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  const clickAt = async (x, y) => { await mouseDown(x, y); await mouseUp(x, y); };
  const center = sel => evalJS(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;var b=e.getBoundingClientRect();
    return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()`);

  /* 顶栏状态采样：computed 值 + 类名 + 布局 + 滚动条 */
  const HEAD = `(function(){
    var f=function(sel){var e=document.querySelector(sel);if(!e)return null;
      var c=getComputedStyle(e),b=e.getBoundingClientRect(),m=new DOMMatrix(c.transform);
      return {op:+(+c.opacity).toFixed(3),pe:c.pointerEvents,disp:c.display,
        transDur:c.transitionDuration,transProp:c.transitionProperty,willChange:c.willChange,
        tf:c.transform,tx:+m.e.toFixed(3),ty:+m.f.toFixed(3),
        hiddenCls:e.classList.contains('orb-head-hidden'),snapCls:e.classList.contains('orb-head-snap'),
        left:Math.round(b.left),right:Math.round(b.right),w:Math.round(b.width),h:Math.round(b.height)};};
    return {sw:f('#uiSwitch'),id:f('#identityBar'),
      level:window.__orbState().level,animating:window.__orbState().isAnimating,
      orbSplit:document.querySelector('.page').classList.contains('orb-split'),
      chatHidden:document.querySelector('#chatView').hidden,orbHidden:document.querySelector('#orbView').hidden,
      scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth};})()`;
  const head = () => evalJS(HEAD);

  /* 逐帧记录切换器 opacity，t0 对齐 pointerdown */
  const armRec = () => evalJS(`(function(){
    window.__headRec=null;
    document.querySelector('#orbScene').addEventListener('pointerdown',function(){
      var t0=performance.now(); window.__headRec=[];
      (function tick(){var s=getComputedStyle(document.querySelector('#uiSwitch'));
        window.__headRec.push([Math.round(performance.now()-t0),Math.round((+s.opacity)*1000)/1000]);
        if(performance.now()-t0<1000) requestAnimationFrame(tick);})();
    },{once:true});return true})()`);
  const rec = () => evalJS('window.__headRec');
  const firstBelow = (r, th) => { const x = (r || []).find(p => p[1] < th); return x ? x[0] : null; };
  const firstAbove = (r, th) => { const x = (r || []).find(p => p[1] > th); return x ? x[0] : null; };
  const mids = r => (r || []).filter(p => p[1] > .05 && p[1] < .95).length;
  const curve = r => ({ start: r[0], mid: r[Math.floor(r.length / 4)], end: r[r.length - 1], frames: r.length });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await setWidth(1440, 900);
  await navigate(URL_, 2500);
  await clearState();
  await reload();

  /* ===== 硬约束：与 v8 备份逐行比对，只有 css/js 两个文件不同 ===== */
  const changed = walk(BACKUP).filter(f => {
    const a = fs.readFileSync(path.join(BACKUP, f));
    try { return !a.equals(fs.readFileSync(path.join(APP, f))); } catch (e) { return true; }
  });
  const v8js = fs.readFileSync(BACKUP + 'orb-view.js', 'utf8');
  const v9js = fs.readFileSync(APP + 'orb-view.js', 'utf8');
  const v8css = fs.readFileSync(BACKUP + 'orb-view.css', 'utf8');
  const v9css = fs.readFileSync(APP + 'orb-view.css', 'utf8');
  const cut = (t, a, b) => t.slice(t.indexOf(a), t.indexOf(b, t.indexOf(a)));
  const projSame = cut(v8js, 'function applyProjection(', '/* 规格里的缓动') === cut(v9js, 'function applyProjection(', '/* 规格里的缓动');
  const orbSame = cut(v8js, 'var ORBS = [', 'function shade(') === cut(v9js, 'var ORBS = [', 'function shade(');
  const htmlSame = cut(v8js, 'function itemHtml(', 'var MAJORS') === cut(v9js, 'function itemHtml(', 'var MAJORS');
  const dragSame = cut(v8js, '  function bindDrag() {', '  /* ================= 三段式') === cut(v9js, '  function bindDrag() {', '  /* ================= 三段式');
  /* 三段式动画函数：剔除 v9 新增的顶栏调用行后须与 v8 完全一致 */
  const strip = s => s.split('\n').filter(l =>
    !/setHeader\(|syncHeader\(|返回时淡入延迟|顶栏过渡|orb-head|只切 \.ui-switch|完全不用 display|instant=true|保证不会|由「当前视图|requestAnimationFrame\(function \(\) \{|els\.forEach\(function \(el\) \{ if \(el\)|void el\.offsetWidth;              \/\/ 提交|if \(instant\) el\.classList\.add|el\.classList\.toggle\('orb-head-hidden'|function syncHeader|function setHeader|var els = \[\$\('#uiSwitch'\)/.test(l)).join('\n');
  const animSame = strip(cut(v8js, '  /* 强制落到某一级的静止态', '  /* ================= 模块详情占位面板')) ===
                   strip(cut(v9js, '  /* 强制落到某一级的静止态', '  /* ================= 模块详情占位面板'));
  const cssVisualOK = ['--R: 250px', '--d: 150px', '--R: 175px', '--d: 200px',
    'radial-gradient(circle at 32% 26%', 'inset 0 0 24px rgba(0, 0, 0, .28)',
    '--shell-d: 720px', '--shell-d: 96vw', 'font-size: 17px', 'font-size: 15px',
    'transition: opacity 240ms ease, transform 240ms ease', 'will-change: opacity, transform',
    'opacity: 0;\n  transform: translateY(-6px);\n  pointer-events: none;'].every(s => v9css.indexOf(s) >= 0);
  const noDisplayToggle = !/\.orb-split[^\n]*display\s*:\s*none/.test(v9css) && v9js.indexOf('orb-head-hidden') > 0;
  const no3d = !/preserve-3d|perspective|rotateY|rotateX|rotate3d|translateZ/.test(v9js + v9css);
  check('硬约束 · 仅 orb-view.css / orb-view.js 变动；投影公式、ORBS、球 HTML、事件绑定、三段式动画逐字未改',
    changed.length === 2 && changed.includes('orb-view.css') && changed.includes('orb-view.js') &&
    projSame && orbSame && htmlSame && dragSame && animSame && cssVisualOK && noDisplayToggle && no3d,
    { changed, projSame, orbSame, htmlSame, dragSame, animSame, cssVisualOK, noDisplayToggle, no3d });

  const H0 = await head();
  check('硬约束 · 两个容器都挂了 240ms opacity/transform 过渡，且初始可见可点',
    H0.sw.op === 1 && H0.sw.pe === 'auto' && !H0.sw.hiddenCls &&
    /0\.24s, 0\.24s/.test(H0.sw.transDur) && /opacity/.test(H0.sw.transProp) &&
    /0\.24s, 0\.24s/.test(H0.id.transDur) && /opacity, transform/.test(H0.sw.willChange),
    { sw: H0.sw, id: H0.id });
  console.log('HEAD0:', JSON.stringify(H0));

  /* ===== 验收 1：进入中球层，切换器渐隐（0 → 240ms） ===== */
  await armRec();
  const ball = await center('.orb-major');
  await clickAt(ball.x, ball.y);
  await sleep(1080);
  const outRec = await rec();
  const H1 = await head();
  const o0 = firstBelow(outRec, .98), o1 = firstBelow(outRec, .02), oDur = (o0 !== null && o1 !== null) ? o1 - o0 : null;
  console.log('FADE_OUT_CURVE:', JSON.stringify(curve(outRec || [])), 'start=' + o0, 'end=' + o1, 'mids=' + mids(outRec));
  check('验收1 · 点球进入中球层，顶栏切换器是渐隐不是瞬间消失（0→240ms）',
    mids(outRec) >= 4 && o0 !== null && o0 <= 70 && oDur >= 130 && oDur <= 340 &&
    H1.sw.op === 0 && H1.sw.disp !== 'none' && H1.level === 'sub' && H1.sw.hiddenCls &&
    Math.abs(H1.sw.ty + 6) < 0.6 && Math.abs(H1.sw.tx) < 0.01,
    { mids: mids(outRec), t0: o0, t1: o1, duration: oDur, op: H1.sw.op, disp: H1.sw.disp, ty: H1.sw.ty, level: H1.level });

  /* ===== 验收 3：淡出后不可点击 ===== */
  const swCenter = { x: Math.round(H1.sw.left + H1.sw.w / 2), y: Math.round((await evalJS(`document.querySelector('#uiSwitch').getBoundingClientRect().top`)) + H1.sw.h / 2) };
  const hit = await evalJS(`(function(){var e=document.elementFromPoint(${swCenter.x},${swCenter.y});return e?(e.id||e.className):'null'})()`);
  await clickAt(swCenter.x, swCenter.y);
  await sleep(200);
  const H3 = await head();
  check('验收3 · 淡出后 pointer-events:none，真实鼠标点击不会误触切视图',
    H1.sw.pe === 'none' && H3.sw.pe === 'none' && H3.chatHidden === true && H3.level === 'sub' &&
    String(hit).indexOf('ui-seg') < 0,
    { pointerEvents: H1.sw.pe, hit, chatHidden: H3.chatHidden, level: H3.level });

  /* ===== 验收 2：返回大球层，切换器延迟 200ms 渐显（240ms 完成） ===== */
  await armRec();
  const back = await center('#orbBack');
  await clickAt(back.x, back.y);
  await sleep(1080);
  const inRec = await rec();
  const H2 = await head();
  const i0 = firstAbove(inRec, .02), i1 = firstAbove(inRec, .98), iDur = (i0 !== null && i1 !== null) ? i1 - i0 : null;
  console.log('FADE_IN_CURVE:', JSON.stringify(curve(inRec || [])), 'start=' + i0, 'end=' + i1, 'mids=' + mids(inRec));
  check('验收2 · 返回大球层，顶栏切换器延迟约 200ms 后渐显（240ms 完成）不是瞬间弹出',
    mids(inRec) >= 4 && i0 !== null && i0 >= 150 && i0 <= 300 && iDur >= 130 && iDur <= 340 &&
    H2.sw.op === 1 && !H2.sw.hiddenCls && H2.level === 'root' && Math.abs(H2.sw.ty) < 0.01,
    { mids: mids(inRec), t0: i0, t1: i1, duration: iDur, op: H2.sw.op, ty: H2.sw.ty, level: H2.level });

  /* ===== 验收 4：淡入后切换器正常可点 ===== */
  const seg = await center('.ui-seg[data-view="chat"]');
  await clickAt(seg.x, seg.y);
  await sleep(260);
  const H4 = await head();
  check('验收4 · 淡入后 pointer-events 恢复，真实鼠标点切换器能进入对话视图',
    H2.sw.pe === 'auto' && H4.chatHidden === false && H4.sw.op === 1 && H4.sw.pe === 'auto',
    { chatHidden: H4.chatHidden, op: H4.sw.op, pe: H4.sw.pe });
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="orb"]').click();return true})()`);
  await sleep(200);

  /* ===== 验收 5：动画中途切视图强落终态，不卡在中间透明度 ===== */
  await clearState();
  await reload();
  const ball5 = await center('.orb-major');
  await clickAt(ball5.x, ball5.y);
  await sleep(100);
  const midDuring = await head();
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="chat"]').click();return true})()`);
  await sleep(320);
  const H5 = await head();
  check('验收5 · 动画中途切视图：立即落到 opacity 1 终态，无中间值残留',
    midDuring.animating === true && midDuring.sw.op > 0 && midDuring.sw.op < 1 &&
    H5.sw.op === 1 && !H5.sw.hiddenCls && !H5.sw.snapCls && H5.sw.pe === 'auto' &&
    H5.chatHidden === false && H5.animating === false,
    { during: midDuring.sw.op, after: H5.sw.op, snap: H5.sw.snapCls, animating: H5.animating, chatHidden: H5.chatHidden });
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="orb"]').click();return true})()`);
  await sleep(200);
  const H5b = await head();
  check('验收5b · 中途切视图后回到小球视图，顶栏状态与当前层级一致（sub 仍隐藏）',
    H5b.orbHidden === false && H5b.level === 'sub' && H5b.sw.op === 0 && H5b.sw.pe === 'none',
    { level: H5b.level, op: H5b.sw.op, pe: H5b.sw.pe });

  /* ===== 回归：对话视图 30 问答 / 问数 / 请假 / 9 条文案 ===== */
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="chat"]').click();return true})()`);
  await sleep(240);
  await sendText('请假流程');
  const qaOk = await waitText('请假流程怎么走');
  const exp = await evalJS(`(function(){var D=window.XIAOTONG_CAMPUS_DATA,Q=window.XiaoTongData;return Q.compute.schedule('我明天有什么课',D.identities[0]).lead})()`);
  await sendText('我明天有什么课');
  const dqOk = await waitText(exp);
  await evalJS(`(function(){document.querySelector('#faqOpenBtn').click();return true})()`);
  await sleep(240);
  const faq = await evalJS(`(function(){var m=document.querySelector('#faqModal');return {tabs:m.querySelectorAll('.faq-tab').length,items:m.querySelectorAll('.faq-q').length}})()`);
  await evalJS(`(function(){document.querySelector('#closeFaq').click();return true})()`);
  const descs = await evalJS(`(function(){return [].slice.call(document.querySelectorAll('.orb-minor')).map(function(m){return m.getAttribute('data-mod')+'|'+m.getAttribute('data-desc')})})()`);
  check('回归 · 对话视图 30 问答 / 问数 / 9 条占位文案不受顶栏过渡影响',
    !!qaOk && !!dqOk && faq.tabs === 10 && faq.items === 30 && descs.length === 9 &&
    descs[0] === '菜品营养|每道菜的热量、蛋白质、脂肪、钠含量与搭配建议',
    { qaOk: !!qaOk, dqOk: !!dqOk, faq, descs: descs.length });
  await evalJS(`(function(){document.querySelector('#leaveModal').hidden=true;document.body.style.overflow='';return true})()`);

  /* ===== 验收 6：390px 下过渡正常、无横向滚动条 ===== */
  await setWidth(390, 844);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await clearState();
  await reload();
  const M0 = await head();
  await armRec();
  const mb = await center('.orb-major');
  await clickAt(mb.x, mb.y);
  await sleep(1080);
  const mOut = await rec();
  const M1 = await head();
  await armRec();
  const mbk = await center('#orbBack');
  await clickAt(mbk.x, mbk.y);
  await sleep(1080);
  const mIn = await rec();
  const M2 = await head();
  const noOverflow = [M0, M1, M2].every(h => h.scrollWidth <= h.clientWidth + 1);
  const noXShift = [M0, M1, M2].every(h => Math.abs(h.sw.tx) < 0.01 && h.sw.right <= h.clientWidth + 1);
  console.log('MOBILE_CURVES:', JSON.stringify({ out: curve(mOut || []), in: curve(mIn || []), M0: M0.sw, M1: M1.sw, M2: M2.sw }));
  check('验收6 · 390px 下淡出/淡入都有逐帧中间值，translateY 不造成横向溢出或滚动条',
    mids(mOut) >= 4 && mids(mIn) >= 4 && M1.sw.op === 0 && M2.sw.op === 1 &&
    noOverflow && noXShift && M2.level === 'root',
    { outMids: mids(mOut), inMids: mids(mIn), noOverflow, noXShift, op: [M0.sw.op, M1.sw.op, M2.sw.op] });

  /* ===== 验收 7：全流程无 jsError ===== */
  check('验收7 · 全流程无 jsError', jsErrors.length === 0, { errors: jsErrors.slice(0, 5), count: jsErrors.length });

  const passed = results.filter(r => r.ok).length;
  console.log('\nTOTAL: ' + passed + '/' + results.length + ' PASS');
  const failed = results.filter(r => !r.ok);
  if (failed.length) { console.log('FAILED:'); failed.forEach(r => console.log(' - ' + r.name)); }
  ws.close();
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('E2E ERROR', e); process.exit(2); });
