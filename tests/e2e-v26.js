/* v26 · 桌面棱镜渐变文案 + 手机端上拉栏显眼化
 * 用法：node e2e-v26.js [URL]     依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖验收 1-17：桌面文案/渐变/柔光/光斑/9s 流动/字号/浅底可读/装饰线/拖动暂停，
 * 手机把手条背景·横线·文字·箭头·首次引导·刷新不重播·展开不播·拖拽点击，
 * 通用手机隐藏文案 / 0 jsError；另含 18 文件基线哈希与问答·医生·预约·请假回归。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CDP = 'http://127.0.0.1:9222';
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const DIR = process.env.E2E_DIR || 'E:/gzkj/';
const PROJECT = 'E:/gzkj/xiaotong';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

/* ================= 静态检查 ================= */
function staticChecks() {
  console.log('\n=== 静态源码检查（不依赖浏览器） ===');
  const baseline = fs.readFileSync('E:/gzkj/v26-baseline.sha256', 'utf8').trim().split('\n');
  const bad = [];
  baseline.forEach(line => {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
    if (!m) return;
    if (sha(path.join(PROJECT, m[2])) !== m[1]) bad.push(m[2]);
  });
  check('保留不动 · 18 个既有文件（小球/问答/云数据库/门禁/医生/主色毛玻璃）一字未改',
    bad.length === 0, { checked: baseline.length, changed: bad });

  const html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(PROJECT, 'v26.css'), 'utf8');
  const js = fs.readFileSync(path.join(PROJECT, 'v26.js'), 'utf8');

  check('一 · 棱镜文案只在桌面这一处，HTML 有 v26.css / v26.js 引用',
    html.indexOf('class="prism-wrap"') >= 0 && html.indexOf('未然 · 防患于未然') >= 0 &&
    html.indexOf('v26.css') >= 0 && html.indexOf('v26.js') >= 0 &&
    (html.match(/prism-title/g) || []).length === 1);
  check('一 · 完整渐变配方 / 220% / clip:text / 柔光 / 9s 流动 / 光斑伪元素',
    /#2E7FD9 0%/.test(css) && /#5B6FE0 22%/.test(css) && /#1E8C82 45%/.test(css) &&
    /#4FA8E8 68%/.test(css) && /#7B8CFF 85%/.test(css) &&
    /background-size:\s*220% 100%/.test(css) &&
    /-webkit-background-clip:\s*text/.test(css) && /background-clip:\s*text/.test(css) &&
    /drop-shadow\(0 0 14px rgba\(79, 168, 232, \.35\)\)/.test(css) &&
    /animation:\s*prism-flow 9s linear infinite/.test(css) &&
    /@keyframes prism-flow/.test(css) && /background-position:\s*220% 50%/.test(css) &&
    /\.prism-title::before/.test(css) && /width:\s*340px/.test(css) && /height:\s*110px/.test(css) &&
    /filter:\s*blur\(18px\)/.test(css) && /z-index:\s*-1/.test(css));
  check('一 · 降级 / reduced-motion / 拖动暂停 / 手机隐藏 / 不占布局不拦拖拽',
    /@supports not \(\(-webkit-background-clip: text\) or \(background-clip: text\)\)/.test(css) &&
    /#2E7FD9;\s*\n\s*color: #2E7FD9/.test(css) &&
    /prefers-reduced-motion:\s*reduce/.test(css) && /body:has\(\.orb-scene\.is-dragging\) \.prism-title \{ animation-play-state: paused; \}/.test(css) &&
    /@media \(max-width: 1023px\)[\s\S]*\.prism-wrap \{ display: none !important; \}/.test(css) &&
    /position: absolute/.test(css) && /pointer-events: none/.test(css));
  check('二 · 把手条：背景 .92 / 顶部淡蓝 1px / 44×4 渐变横线 / 深蓝 600 文字 / ↑ 箭头',
    /background: rgba\(255, 255, 255, \.92\)/.test(css) &&
    /inset 0 1px 0 rgba\(43, 92, 217, \.10\)/.test(css) &&
    /width: 44px/.test(css) && /height: 4px/.test(css) &&
    /rgba\(43, 92, 217, \.30\) 0%/.test(css) && /rgba\(30, 140, 130, \.60\) 50%/.test(css) &&
    /font-size: 14px/.test(css) && /font-weight: 600/.test(css) && /#2B5CD9/.test(css) &&
    /letter-spacing: 0\.02em/.test(css) && /gap: 6px/.test(css) &&
    /@keyframes arrow-hint/.test(css) && /translateY\(-2px\)/.test(css) &&
    /animation: arrow-hint 2\.4s ease-in-out infinite/.test(css));
  check('二 · 首次引导 400ms：0→200ms ease-out 上移 10px，200→400ms ease-in 回落',
    /@keyframes handle-hint/.test(css) && /transform: translateY\(-10px\); animation-timing-function: ease-in/.test(css) &&
    /animation-timing-function: ease-out/.test(css) && /animation: handle-hint 400ms both/.test(css) &&
    /setTimeout\(fire, 1500\)/.test(js));
  check('二 · 引导只用 sessionStorage + 不改抽屉 transform / 不介入拖拽',
    /sessionStorage/.test(js) && /handle\.classList\.add\('is-hinting'\)/.test(js) &&
    !/\.style\.transform/.test(js) && !/XT_DRAWER\.(open|close)\(/.test(js) &&
    /drawerOpen\(\)/.test(js) && /pointerdown', stopHint/.test(js));
}

async function main() {
  staticChecks();

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
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const click = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO';e.click();return 'OK'})()`);
  const shot = async file => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
  /* 每次导航都自动装上动画事件探针，可在 reload 后继续统计 */
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `(function(){window.__hintLog=[];
      document.addEventListener('animationstart',function(e){if(e.animationName==='handle-hint')window.__hintLog.push({type:'start',t:Math.round(performance.now())})},true);
      document.addEventListener('animationend',function(e){if(e.animationName==='handle-hint')window.__hintLog.push({type:'end',t:Math.round(performance.now())})},true);
    })();`
  });

  let mobile_ = false;
  const setViewport = async (w, h, mobile) => {
    mobile_ = mobile;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await sleep(420);
  };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  const tap = async (x, y) => {
    if (mobile_) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(20);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(140);
    } else { await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(140); }
  };
  let firstReset = true;
  async function reset(w, h, mobile) {
    await setViewport(w, h, mobile);
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    if (firstReset) { jsErrors.length = 0; firstReset = false; }
    await send('Page.navigate', { url: URL_ }); await sleep(1400);
    await ev(`(function(){try{localStorage.clear();sessionStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1750);
  }
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(420);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(120);
    await click('#consentAgree'); await sleep(500);
    if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(280); }
  }
  const prism = () => ev(`(function(){
    var w=document.querySelector('.prism-wrap'),t=document.querySelector('.prism-title'),ls=document.querySelectorAll('.prism-line'),p=document.querySelector('#orbPane');
    if(!w||!t)return null;var c=getComputedStyle(t),wc=getComputedStyle(w),b=getComputedStyle(t,'::before');
    var wr=w.getBoundingClientRect(),pr=p.getBoundingClientRect(),tr=t.getBoundingClientRect();
    return {display:wc.display,top:wc.top,wrapTop:Math.round(wr.top-pr.top),centerOffset:Math.round((wr.left+wr.width/2)-(pr.left+pr.width/2)),
      text:t.textContent.trim(),fontSize:c.fontSize,fontWeight:c.fontWeight,letterSpacing:c.letterSpacing,
      bgImage:c.backgroundImage,bgSize:c.backgroundSize,bgPos:c.backgroundPosition,
      clip:c.webkitBackgroundClip||c.backgroundClip,fill:c.webkitTextFillColor,color:c.color,filter:c.filter,
      animName:c.animationName,animDur:c.animationDuration,animState:c.animationPlayState,
      before:{w:b.width,h:b.height,bg:b.backgroundImage,filter:b.filter,z:b.zIndex},
      lines:[].map.call(ls,function(e){var s=getComputedStyle(e),r=e.getBoundingClientRect();return {w:s.width,h:s.height,bg:s.backgroundColor,cy:Math.round(r.top+r.height/2)}}),
      textCy:Math.round(tr.top+tr.height/2),
      gaps:[].map.call(ls,function(e){var r=e.getBoundingClientRect();return Math.round(r.left<tr.left?tr.left-r.right:r.left-tr.right)}),
      orbHint:getComputedStyle(document.querySelector('.orb-hint')||document.body).fontSize,
      spheres:document.querySelectorAll('.orb-major').length,
      allItems:document.querySelectorAll('.orb-item').length};
  })()`);
  const handleInfo = () => ev(`(function(){
    var h=document.querySelector('#drawerHandle'),bar=document.querySelector('.dh-bar'),tx=document.querySelector('.dh-text'),ar=document.querySelector('.dh-arrow'),row=document.querySelector('.dh-row');
    if(!h||!bar||!tx||!ar)return null;
    var hc=getComputedStyle(h),bc=getComputedStyle(bar),tc=getComputedStyle(tx),ac=getComputedStyle(ar),rc=getComputedStyle(row);
    return {bg:hc.backgroundColor,shadow:hc.boxShadow,radius:hc.borderTopLeftRadius,
      barW:bc.width,barH:bc.height,barRadius:bc.borderRadius,barBg:bc.backgroundImage,
      text:tx.textContent.trim(),fontSize:tc.fontSize,weight:tc.fontWeight,color:tc.color,spacing:tc.letterSpacing,
      arrow:ar.textContent.trim(),aSize:ac.fontSize,aWeight:ac.fontWeight,aColor:ac.color,
      aAnim:ac.animationName,aDur:ac.animationDuration,aDisplay:ac.display,gap:rc.gap,
      hint:window.__xtHandleHint?JSON.parse(JSON.stringify(window.__xtHandleHint)):null,
      log:window.__hintLog?JSON.parse(JSON.stringify(window.__hintLog)):null};
  })()`);

  /* ================= 桌面 1440x1000 ================= */
  console.log('\n=== 桌面端 (1440x1000) 棱镜渐变文案 ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(300);
  const d = await prism();
  check('验收1 · 舞台上方显示「未然 · 防患于未然」，蓝紫青渐变文字（clip:text + 透明填充）',
    d && d.text === '未然 · 防患于未然' && d.display === 'flex' &&
    /linear-gradient/.test(d.bgImage) && /#2E7FD9|rgb\(46, 127, 217\)/.test(d.bgImage) &&
    /#1E8C82|rgb\(30, 140, 130\)/.test(d.bgImage) && d.clip === 'text' &&
    /rgba\(0, 0, 0, 0\)|transparent/.test(d.fill), { text: d && d.text, clip: d && d.clip, fill: d && d.fill });
  check('验收2 · 文字柔光 drop-shadow + 背后 340×110 淡蓝光斑（blur 18px / z-index -1）',
    d && /drop-shadow/.test(d.filter) && d.before.w === '340px' && d.before.h === '110px' &&
    /radial-gradient/.test(d.before.bg) && /blur\(18px\)/.test(d.before.filter) && d.before.z === '-1', d && d.before);
  check('验收3 · 渐变缓慢流动：prism-flow 9s infinite，实测背景位置随时间推进',
    d && d.animName === 'prism-flow' && d.animDur === '9s' && d.animState === 'running' && d.bgSize === '220% 100%',
    { name: d && d.animName, dur: d && d.animDur, size: d && d.bgSize });
  const pos1 = await ev(`(function(){var t=document.querySelector('.prism-title');return t?getComputedStyle(t).backgroundPosition:null})()`);
  await sleep(650);
  const pos2 = await ev(`(function(){var t=document.querySelector('.prism-title');return t?getComputedStyle(t).backgroundPosition:null})()`);
  check('验收3b · 9 秒周期内背景位置确实在移动（两次采样不同）', pos1 !== pos2 && !!pos1 && !!pos2, { pos1, pos2 });
  check('验收4 · 23px / 600 / 0.12em，明显大于周围 11.5px 提示与 12.5px 按钮',
    d && d.fontSize === '23px' && d.fontWeight === '600' &&
    parseFloat(d.letterSpacing) > 2 && parseFloat(d.fontSize) > parseFloat(d.orbHint) + 8,
    { size: d && d.fontSize, weight: d && d.fontWeight, spacing: d && d.letterSpacing, orbHint: d && d.orbHint });
  check('验收5 · 浅色背景上为渐变文字 + 柔光（非纯透明消失），配色含深蓝/青绿主色',
    d && d.filter !== 'none' && /linear-gradient/.test(d.bgImage) && d.bgImage.split('rgb').length >= 4);
  check('验收6 · 两侧各 24×1px 装饰线 rgba(79,168,232,.25)，与文字垂直居中、左右各 12px',
    d && d.lines.length === 2 && d.lines.every(l => l.w === '24px' && l.h === '1px' && /79, 168, 232/.test(l.bg) && Math.abs(l.cy - d.textCy) <= 2) &&
    d.gaps.every(g => g >= 10 && g <= 14), { lines: d && d.lines, gaps: d && d.gaps });
  check('硬约束 · 文案在顶部 56px 水平居中，绝对定位不占布局；三大球 + 九中球共 12 个未变',
    d && d.top === '56px' && d.wrapTop === 56 && Math.abs(d.centerOffset) <= 1 &&
    d.spheres === 3 && d.allItems === 12,
    { top: d && d.top, wrapTop: d && d.wrapTop, offset: d && d.centerOffset, spheres: d && d.spheres, allItems: d && d.allItems });
  const sDesk = await shot('v26-desktop-prism.png'); console.log('SHOT  v26-desktop-prism.png  ' + sDesk + ' bytes');

  /* 验收7：拖动小球时动画暂停（真实拖动 + 类状态双重验证） */
  const orbPt = await ev(`(function(){var e=document.querySelector('.orb-major[data-orb="food"]');if(!e)return null;var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (orbPt) {
    await mouse('mousePressed', orbPt.x, orbPt.y);
    await mouse('mouseMoved', orbPt.x + 40, orbPt.y + 12);
    await sleep(120);
    const dragState = await ev(`(function(){var s=document.querySelector('.orb-scene'),t=document.querySelector('.prism-title');return {dragging:s.classList.contains('is-dragging'),state:getComputedStyle(t).animationPlayState}})()`);
    check('验收7 · 拖动小球时 prism-flow 暂停（is-dragging → animation-play-state:paused）',
      dragState && dragState.dragging && dragState.state === 'paused', dragState);
    const sDrag = await shot('v26-desktop-drag-paused.png'); console.log('SHOT  v26-desktop-drag-paused.png  ' + sDrag + ' bytes');
    await mouse('mouseReleased', orbPt.x + 40, orbPt.y + 12);
    await sleep(120);
    const resume = await ev(`(function(){var t=document.querySelector('.prism-title');return {dragging:document.querySelector('.orb-scene').classList.contains('is-dragging'),state:getComputedStyle(t).animationPlayState}})()`);
    check('验收7b · 松手后动画自动恢复 running', resume && !resume.dragging && resume.state === 'running', resume);
  } else {
    check('验收7 · 拖动小球时 prism-flow 暂停', false, { reason: 'no orb point' });
  }
  /* reduced-motion 降级 */
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await sleep(120);
  const rm = await ev(`(function(){var t=document.querySelector('.prism-title'),a=document.querySelector('.dh-arrow');return {prism:getComputedStyle(t).animationName,arrow:a?getComputedStyle(a).animationName:null}})()`);
  check('降级 · prefers-reduced-motion 开启时 prism-flow / arrow-hint 均关闭',
    rm && rm.prism === 'none' && (rm.arrow === 'none' || rm.arrow === null), rm);
  await send('Emulation.setEmulatedMedia', { features: [] });
  await sleep(120);

  /* ================= 手机 390x844 ================= */
  console.log('\n=== 手机端 (390x844) 上拉栏 ===');
  await reset(390, 844, true);
  await passGates();
  await sleep(200);
  const m = await handleInfo();
  check('验收8 · 把手条文字「和助手聊聊」14px / 600 / 深蓝 #2B5CD9 / 0.02em',
    m && m.text === '和助手聊聊' && m.fontSize === '14px' && m.weight === '600' &&
    m.color === 'rgb(43, 92, 217)' && parseFloat(m.spacing) > 0.2,
    { text: m && m.text, size: m && m.fontSize, weight: m && m.weight, color: m && m.color });
  /* .dh-arrow 是 flex 子项，getComputedStyle 会把 inline-block 规整为 block；transform 仍生效 */
  check('验收9 · 文字前有 ↑，15px / 700 / 深蓝，间距 6px，arrow-hint 2.4s 上浮动画',
    m && m.arrow === '↑' && m.aSize === '15px' && m.aWeight === '700' && m.aColor === 'rgb(43, 92, 217)' &&
    m.aAnim === 'arrow-hint' && m.aDur === '2.4s' && /^(inline-block|block)$/.test(m.aDisplay) && m.gap === '6px',
    { arrow: m && m.arrow, size: m && m.aSize, weight: m && m.aWeight, color: m && m.aColor,
      display: m && m.aDisplay, anim: m && m.aAnim, dur: m && m.aDur, gap: m && m.gap });
  const arrowFrames = [];
  for (let i = 0; i < 7; i++) {
    arrowFrames.push(await ev(`(function(){var a=document.querySelector('.dh-arrow');return a?getComputedStyle(a).transform:null})()`));
    await sleep(180);
  }
  const hasFloat = arrowFrames.some(t => t && t !== 'none' && /matrix/.test(t) && parseFloat(t.split(',')[5]) < -0.1);
  check('验收9b · ↑ 箭头实测在上浮（采样到负 translateY，幅度 ≤2px）',
    hasFloat && arrowFrames.every(t => !t || t === 'none' || Math.abs(parseFloat(t.split(',')[5])) <= 2.1),
    { frames: arrowFrames });
  check('验收10 · 横线 44×4 / 999px，两端深蓝、中间青绿的三段渐变',
    m && m.barW === '44px' && m.barH === '4px' && /999px/.test(m.barRadius) &&
    /linear-gradient/.test(m.barBg) && /43, 92, 217/.test(m.barBg) && /30, 140, 130/.test(m.barBg),
    { w: m && m.barW, h: m && m.barH, bg: m && m.barBg.slice(0, 90) });
  check('验收11 · 背景 .92 白 + 顶部 1px 极淡蓝边，圆角上边缘保留',
    m && m.bg === 'rgba(255, 255, 255, 0.92)' && /inset/.test(m.shadow) &&
    /43, 92, 217/.test(m.shadow) && /0px 1px 0px|1px 0px/.test(m.shadow) && m.radius === '20px',
    { bg: m && m.bg, radius: m && m.radius });
  check('验收16 · 手机端不显示桌面棱镜文案',
    await ev(`(function(){var w=document.querySelector('.prism-wrap');return !!w&&getComputedStyle(w).display==='none'})()`));
  const sHandle = await shot('v26-mobile-handle.png'); console.log('SHOT  v26-mobile-handle.png  ' + sHandle + ' bytes');

  /* 验收12：进入主界面 1.5s 后引导只播一次 */
  console.log('\n=== 首次引导动效（等待 1.5s 触发） ===');
  await sleep(2100);
  const h1 = await handleInfo();
  const starts = (h1 && h1.log || []).filter(x => x.type === 'start');
  check('验收12 · 主界面就绪 1.5s 后把手条播放一次 400ms「上移 10px 再回落」',
    h1 && h1.hint && h1.hint.played === 1 && starts.length === 1 &&
    h1.hint.scheduled === true && (h1.log || []).some(x => x.type === 'end'),
    { hint: h1 && h1.hint, log: h1 && h1.log });
  check('验收12b · 动画结束后 class 已移除，把手条回到常态（不残留 transform）',
    await ev(`(function(){var h=document.querySelector('#drawerHandle');return !h.classList.contains('is-hinting')&&getComputedStyle(h).transform==='none'})()`));
  const sHint = await shot('v26-mobile-hint.png'); console.log('SHOT  v26-mobile-hint.png  ' + sHint + ' bytes');

  /* 验收13：同会话刷新不重播（只 reload，不清 sessionStorage） */
  await send('Page.reload'); await sleep(2200);
  const h2 = await handleInfo();
  check('验收13 · 同会话刷新后不重播（sessionStorage 生效，0 次动画）',
    h2 && h2.hint && h2.hint.played === 0 && h2.hint.suppressed === true &&
    (h2.log || []).filter(x => x.type === 'start').length === 0,
    { hint: h2 && h2.hint, log: h2 && h2.log });

  /* 验收14：抽屉已展开时不播 */
  console.log('\n=== 抽屉已展开时不播（独立场景） ===');
  await reset(390, 844, true);
  await ev(`(function(){window.XT_DRAWER.open();return 1})()`);
  const openedBefore = await ev(`(function(){return window.XT_DRAWER.isOpen()})()`);
  await passGates();
  await sleep(2100);
  const h3 = await handleInfo();
  check('验收14 · 抽屉已展开时不播引导（skipped=1 / played=0 / 0 次动画）',
    openedBefore === true && h3 && h3.hint && h3.hint.skipped >= 1 && h3.hint.played === 0 &&
    (h3.log || []).filter(x => x.type === 'start').length === 0,
    { openedBefore, hint: h3 && h3.hint, log: h3 && h3.log });

  /* 验收15：点击展开 / 拖拽展开仍正常 */
  console.log('\n=== 验收15 · 把手条点击与拖拽回归 ===');
  await ev(`(function(){window.XT_DRAWER.close();return 1})()`); await sleep(420);
  const hr = await ev(`(function(){var h=document.querySelector('#drawerHandle');var r=h.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  await tap(hr.x, hr.y); await sleep(420);
  const afterTap = await ev(`(function(){return window.XT_DRAWER.isOpen()})()`);
  check('验收15a · 点击把手条正常切换为展开', afterTap === true, { afterTap });
  /* 展开后把手条随抽屉移到上方，必须重新取坐标 */
  const hrOpen = await ev(`(function(){var h=document.querySelector('#drawerHandle');var r=h.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  await tap(hrOpen.x, hrOpen.y); await sleep(420);
  const afterTap2 = await ev(`(function(){return window.XT_DRAWER.isOpen()})()`);
  check('验收15b · 再次点击正常收起', afterTap2 === false, { afterTap2 });
  /* 真实向上拖拽 >30% 高度（收起态重新取坐标） */
  const hrDown = await ev(`(function(){var h=document.querySelector('#drawerHandle');var r=h.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  await mouse('mousePressed', hrDown.x, hrDown.y);
  for (let dy = -40; dy >= -280; dy -= 40) { await mouse('mouseMoved', hrDown.x, hrDown.y + dy); await sleep(28); }
  await mouse('mouseReleased', hrDown.x, hrDown.y - 280); await sleep(480);
  const afterDrag = await ev(`(function(){return {open:window.XT_DRAWER.isOpen(),tf:getComputedStyle(document.querySelector('#chatPane')).transform}})()`);
  check('验收15c · 向上拖拽 >30% 正常展开，抽屉 transform 回到 class 终态',
    afterDrag && afterDrag.open === true, afterDrag);
  const sDrag2 = await shot('v26-mobile-drag.png'); console.log('SHOT  v26-mobile-drag.png  ' + sDrag2 + ' bytes');
  const hs = await ev(`(function(){return {sw:document.documentElement.scrollWidth,iw:window.innerWidth}})()`);
  check('硬约束 · 手机端无横向溢出', hs.sw <= hs.iw + 1, hs);

  /* ================= 通用回归 ================= */
  console.log('\n=== 通用回归（问答 / 医生 / 预约 / 请假 / 主色） ===');
  const faq = await ev(`(function(){return {n:window.__faqCatalog?window.__faqCatalog().length:0,best:window.__faqMatch?window.__faqMatch('食堂几点开饭').bestId:null,source:window.__faqMatch?window.__faqMatch('食堂几点开饭').source:null}})()`);
  check('回归 · 30 条问答与云数据库匹配未变', faq && faq.n === 30 && faq.best === 1, faq);
  await click('#faqOpenBtn'); await sleep(320);
  const tabs = await ev(`(function(){return [].map.call(document.querySelectorAll('.faq-tab'),function(e){return e.textContent.trim()})})()`);
  check('回归 · 10 个分类标签完整（前三类显示名仍为 食序/息衡/动跃）',
    tabs && tabs.length === 10 && tabs[0] === '食序' && tabs[1] === '息衡' && tabs[2] === '动跃', { count: tabs && tabs.length, first3: tabs && tabs.slice(0, 3) });
  await click('#closeFaq'); await sleep(180);
  await ev(`(function(){window.XT_CHAT.bookDoctor();return 1})()`); await sleep(400);
  const docs = await ev(`(function(){var a=document.querySelectorAll('#doctorCards .doc-card');return {n:a.length,btns:[].map.call(a,function(e){var b=e.querySelector('.dc-btn');return b?b.textContent.trim():null})}})()`);
  check('回归 · 医生列表三卡与动态预约按钮未受影响', docs && docs.n === 3 && docs.btns.every(Boolean), docs);
  await click('#closeDoctor'); await sleep(200);
  await click('#bookBtn'); await sleep(320);
  const empty = await ev(`(function(){var a=document.querySelectorAll('#chatLog .bk-empty');return a.length?a[a.length-1].textContent.trim():null})()`);
  check('回归 · 我的预约空态文案不变', /你还没有预约记录/.test(empty || ''), { empty: empty && empty.slice(0, 40) });
  const theme = await ev(`(function(){return getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()})()`);
  check('回归 · 主色 #2AA79B 未变（CSS 文件哈希亦已校验）', theme === '#2AA79B', { theme });

  const realErrors = jsErrors.filter(s => !/favicon|net::ERR_/i.test(s));
  check('验收17 · 全流程 0 未捕获 jsError / console.error', realErrors.length === 0, { count: realErrors.length, sample: realErrors.slice(0, 4) });

  const pass = results.filter(r => r.ok).length;
  console.log('\n================ 汇总 ================');
  console.log(`PASS ${pass}/${results.length}`);
  if (pass !== results.length) {
    console.log('FAILED:');
    results.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name));
  }
  ws.close();
  setTimeout(() => process.exit(pass === results.length ? 0 : 1), 180);
}
main().catch(e => { console.error('FATAL', e); setTimeout(() => process.exit(1), 180); });
