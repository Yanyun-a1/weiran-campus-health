/* v27 · 桌面棱镜文案放大拉开 + 手机端静态渐变文案
 * 用法：node e2e-v27.js [URL]   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖验收 1-10：桌面 32px/.26em、整行更宽、40px 线+20px 间距、460×140 blur24 光斑、
 * 渐变/220%/9s 流动/拖动暂停；手机 20px/.2em/静态「防患于未然」、不压顶栏与球舞台、
 * 28px 线+14px 间距；小球位置尺寸零变化、桌面/手机互斥显隐、0 jsError。
 * 另含 20 文件基线哈希与问答·医生·预约·请假·把手条·抽屉回归。
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

/* ================= 静态源码检查 ================= */
function staticChecks() {
  console.log('\n=== 静态源码检查（不依赖浏览器） ===');
  const baseline = fs.readFileSync('E:/gzkj/v27-baseline.sha256', 'utf8').trim().split('\n');
  const bad = [];
  baseline.forEach(line => {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
    if (!m) return;
    if (sha(path.join(PROJECT, m[2])) !== m[1]) bad.push(m[2]);
  });
  check('保留不动 · 20 个既有文件（小球/问答/云数据库/门禁/医生/把手条/主色）一字未改',
    bad.length === 0, { checked: baseline.length, changed: bad });

  const html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(PROJECT, 'v27.css'), 'utf8');
  const js = fs.readFileSync(path.join(PROJECT, 'v27.js'), 'utf8');
  const old = fs.readFileSync(path.join(PROJECT, 'v26.css'), 'utf8');

  check('结构 · v27.css / v27.js 最后加载，桌面与手机文案各一处',
    html.indexOf('v27.css') > html.indexOf('v26.css') &&
    html.indexOf('v27.js') > html.indexOf('v26.js') &&
    (html.match(/class="prism-wrap"/g) || []).length === 1 &&
    (html.match(/class="prism-mobile-wrap"/g) || []).length === 1 &&
    html.indexOf('未然 · 防患于未然') >= 0 && html.indexOf('>防患于未然<') >= 0 &&
    /class="prism-m-line"/g.test(html));

  check('一 · 桌面只改 3 个尺寸值：32px / .26em / 40px 线 / 20px 间距 / 光斑 460×140 blur24',
    /\.prism-wrap \{ gap: 20px; \}/.test(css) && /\.prism-line \{ width: 40px; \}/.test(css) &&
    /font-size: 32px;/.test(css) && /letter-spacing: 0\.26em;/.test(css) &&
    /width: 460px;/.test(css) && /height: 140px;/.test(css) && /filter: blur\(24px\);/.test(css));

  check('一 · 渐变配方/220%/9s 流动/柔光/拖动暂停/手机隐藏 全部沿用 v26.css 未改',
    /#2E7FD9 0%/.test(old) && /#7B8CFF 85%/.test(old) &&
    /background-size:\s*220% 100%/.test(old) &&
    /animation:\s*prism-flow 9s linear infinite/.test(old) &&
    /@keyframes prism-flow/.test(old) &&
    /drop-shadow\(0 0 14px rgba\(79, 168, 232, \.35\)\)/.test(old) &&
    /body:has\(\.orb-scene\.is-dragging\) \.prism-title \{ animation-play-state: paused; \}/.test(old) &&
    /@media \(max-width: 1023px\)[\s\S]*\.prism-wrap \{ display: none !important; \}/.test(old) &&
    !/animation: prism-flow/.test(css));

  check('二 · 手机端：20px/600/.2em、同套六段渐变、clip:text 透明、10px 柔光、静态无动画',
    /font-size: 20px;/.test(css) && /font-weight: 600;/.test(css) && /letter-spacing: 0\.2em;/.test(css) &&
    /#2E7FD9 0%/.test(css) && /#5B6FE0 22%/.test(css) && /#1E8C82 45%/.test(css) &&
    /#4FA8E8 68%/.test(css) && /#7B8CFF 85%/.test(css) &&
    /-webkit-background-clip: text/.test(css) && /background-clip: text/.test(css) &&
    /-webkit-text-fill-color: transparent/.test(css) &&
    /filter: drop-shadow\(0 0 10px rgba\(79, 168, 232, \.30\)\)/.test(css) &&
    !/@keyframes/.test(css) && !/^\s*animation\s*:/m.test(css));

  check('二 · 手机端：顶栏下 60px / 28px 线 / 14px 间距 / 桌面隐藏 / fixed 不拦拖拽 / 避让规则',
    /top: calc\(var\(--xt-topbar-h, 56px\) \+ 60px\)/.test(css) &&
    /gap: 14px;/.test(css) && /width: 28px;/.test(css) &&
    /\.prism-mobile-wrap \{ display: none; \}/.test(css) &&
    /position: fixed;/.test(css) && /pointer-events: none;/.test(css) &&
    /body:has\(\.pane-chat\.drawer-open\) \.prism-mobile-wrap/.test(css) &&
    /is-avoid-hidden/.test(css) && /@supports not/.test(css));

  check('三 · v27.js 只读几何、不写 transform、不调用 XT_DRAWER、含中点与空隙不足避让',
    /getBoundingClientRect\(\)/.test(js) && /\(bottom \+ shellTop\) \/ 2 - h \/ 2/.test(js) &&
    /is-avoid-hidden/.test(js) && /bottom \+ 60/.test(js) &&
    !/\.style\.transform/.test(js) && !/XT_DRAWER\.(open|close)\(/.test(js) &&
    !/setAttribute\('style'/.test(js));
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
    await send('Page.reload'); await sleep(1850);
  }
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(420);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(120);
    await click('#consentAgree'); await sleep(500);
    if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(280); }
    await sleep(260);
  }
  const noHScroll = () => ev(`(function(){return {sw:document.documentElement.scrollWidth,iw:innerWidth,sh:document.documentElement.scrollHeight,ih:innerHeight}})()`);

  /* ================= 桌面端 ================= */
  console.log('\n=== 桌面 (1440x1000) 棱镜文案放大拉开 ===');
  await reset(1440, 1000, false);
  await passGates();

  const desk = () => ev(`(function(){
    var w=document.querySelector('.prism-wrap'),t=document.querySelector('.prism-title'),ls=document.querySelectorAll('.prism-line'),p=document.querySelector('#orbPane');
    if(!w||!t)return null;var c=getComputedStyle(t),wc=getComputedStyle(w),b=getComputedStyle(t,'::before');
    var wr=w.getBoundingClientRect(),pr=p.getBoundingClientRect(),tr=t.getBoundingClientRect();
    return {display:wc.display,top:wc.top,wrapW:Math.round(wr.width),wrapTop:Math.round(wr.top-pr.top),
      centerOffset:Math.round((wr.left+wr.width/2)-(pr.left+pr.width/2)),pos:wc.position,pe:wc.pointerEvents,
      text:t.textContent.trim(),fontSize:c.fontSize,fontWeight:c.fontWeight,letterSpacing:c.letterSpacing,textW:Math.round(tr.width),
      bgImage:c.backgroundImage,bgSize:c.backgroundSize,bgPos:c.backgroundPosition,
      clip:c.webkitBackgroundClip||c.backgroundClip,fill:c.webkitTextFillColor,color:c.color,filter:c.filter,
      animName:c.animationName,animDur:c.animationDuration,animState:c.animationPlayState,
      before:{w:b.width,h:b.height,filter:b.filter,z:b.zIndex,bg:b.backgroundImage},
      lines:[].map.call(ls,function(e){var s=getComputedStyle(e),r=e.getBoundingClientRect();return {w:s.width,h:s.height,bg:s.backgroundColor,cy:Math.round(r.top+r.height/2)}}),
      textCy:Math.round(tr.top+tr.height/2),
      gaps:[].map.call(ls,function(e){var r=e.getBoundingClientRect();return Math.round(r.left<tr.left?tr.left-r.right:r.left-tr.right)}),
      spheres:document.querySelectorAll('.orb-major').length,allItems:document.querySelectorAll('.orb-item').length,
      mobileWrap:getComputedStyle(document.querySelector('.prism-mobile-wrap')).display};
  })()`);
  const d = await desk();
  check('验收1 · 桌面字号 32px、字间距 .26em，明显比 v26 更大更开',
    d && d.fontSize === '32px' && parseFloat(d.letterSpacing) >= 8.3 && d.fontWeight === '600',
    { size: d && d.fontSize, spacing: d && d.letterSpacing, weight: d && d.fontWeight });
  check('验收2 · 整行视觉面积更宽（文字 ≥310px、整行 ≥430px），仍不压小球',
    d && d.textW >= 310 && d.wrapW >= 430 && d.wrapW <= 900 && d.top === '56px' && Math.abs(d.centerOffset) <= 1,
    { textW: d && d.textW, wrapW: d && d.wrapW, top: d && d.top, offset: d && d.centerOffset });
  check('验收3 · 两侧装饰线 40×1px rgba(79,168,232,.25)，与文字间距 20px',
    d && d.lines.length === 2 && d.lines.every(l => l.w === '40px' && l.h === '1px' && /79, 168, 232/.test(l.bg) && Math.abs(l.cy - d.textCy) <= 2) &&
    d.gaps.every(g => g >= 18 && g <= 22), { lines: d && d.lines, gaps: d && d.gaps });
  check('验收4 · ::before 光斑 460×140 / blur24 / z-index -1 跟着放大',
    d && d.before.w === '460px' && d.before.h === '140px' && /blur\(24px\)/.test(d.before.filter) && d.before.z === '-1',
    d && d.before);
  check('验收5 · 六段棱镜渐变 / 220% / clip:text / 透明填充 / 14px 柔光 / prism-flow 9s 全部不变',
    d && /#2e7fd9|rgb\(46, 127, 217\)/i.test(d.bgImage) && /#7b8cff|rgb\(123, 140, 255\)/i.test(d.bgImage) &&
    d.bgSize === '220% 100%' && /text/.test(d.clip) && /rgba\(0, 0, 0, 0\)|transparent/.test(d.fill) &&
    /drop-shadow/.test(d.filter) && /14px/.test(d.filter) && /79, 168, 232/.test(d.filter) &&
    d.animName === 'prism-flow' && d.animDur === '9s',
    { bgSize: d && d.bgSize, clip: d && d.clip, fill: d && d.fill, filter: d && d.filter, anim: d && d.animName, dur: d && d.animDur });
  const pos1 = d && d.bgPos;
  await sleep(520);
  const pos2 = await ev(`(function(){return getComputedStyle(document.querySelector('.prism-title')).backgroundPosition})()`);
  check('验收5b · 渐变 9s 缓慢流动（520ms 内背景位持续变化）', pos1 && pos2 && pos1 !== pos2, { pos1, pos2 });
  check('通用16 · 桌面端不显示手机文案，桌面文案 fixed/absolute 不占布局、pointer-events:none',
    d && d.mobileWrap === 'none' && d.pos === 'absolute' && d.pe === 'none' && d.spheres === 3 && d.allItems === 12,
    { mobileWrap: d && d.mobileWrap, pos: d && d.pos, pe: d && d.pe, spheres: d && d.spheres, items: d && d.allItems });

  /* 验收9：隐藏/恢复桌面文案，逐一对比 12 个球的投影变量与几何位置 */
  const snap = () => ev(`(function(){return [].map.call(document.querySelectorAll('.orb-item'),function(e){
    var r=e.getBoundingClientRect(),c=getComputedStyle(e);
    return {id:e.getAttribute('data-orb')+'/'+e.getAttribute('data-mod'),
      x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),
      px:c.getPropertyValue('--px').trim(),py:c.getPropertyValue('--py').trim(),sc:c.getPropertyValue('--sc').trim()};
  })})()`);
  const before = await snap();
  await ev(`(function(){document.querySelector('.prism-wrap').style.display='none';return 1})()`);
  await sleep(120);
  const after = await snap();
  await ev(`(function(){document.querySelector('.prism-wrap').style.display='';return 1})()`);
  await sleep(80);
  const same = before && after && before.length === 12 && before.every((b, i) => {
    const a = after[i];
    return a && b.id === a.id && Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 &&
      a.w === b.w && a.h === b.h && a.px === b.px && a.py === b.py && a.sc === b.sc;
  });
  check('验收9 · 小球位置/尺寸/投影变量在文案显隐前后完全一致（12 个球逐个对比）',
    same, { count: before && before.length, sample: before && before[0] });

  const sDesk = await shot('v27-desktop-prism.png'); console.log('SHOT  v27-desktop-prism.png  ' + sDesk + ' bytes');

  /* 验收5c：拖动时暂停、松手恢复 */
  const orbPt = await ev(`(function(){var e=document.querySelector('.orb-major[data-orb="food"]');if(!e)return null;var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (orbPt) {
    await mouse('mousePressed', orbPt.x, orbPt.y);
    await mouse('mouseMoved', orbPt.x + 40, orbPt.y + 12); await sleep(120);
    const ds = await ev(`(function(){return {dragging:document.querySelector('.orb-scene').classList.contains('is-dragging'),state:getComputedStyle(document.querySelector('.prism-title')).animationPlayState}})()`);
    check('验收5c · 拖动小球时棱镜动画暂停（保留 v26 规则）', ds && ds.dragging && ds.state === 'paused', ds);
    const sDrag = await shot('v27-desktop-drag-paused.png'); console.log('SHOT  v27-desktop-drag-paused.png  ' + sDrag + ' bytes');
    await mouse('mouseReleased', orbPt.x + 40, orbPt.y + 12); await sleep(140);
    const rs = await ev(`(function(){return {dragging:document.querySelector('.orb-scene').classList.contains('is-dragging'),state:getComputedStyle(document.querySelector('.prism-title')).animationPlayState}})()`);
    check('验收5d · 松手后自动恢复 running', rs && !rs.dragging && rs.state === 'running', rs);
  } else { check('验收5c · 拖动小球时棱镜动画暂停', false, { reason: 'no orb point' }); }

  const hsD = await noHScroll();
  check('通用 · 桌面 1440 无横向溢出', hsD && hsD.sw <= hsD.iw + 1, hsD);

  /* ================= 手机端 390x844 ================= */
  console.log('\n=== 手机 (390x844) 静态渐变文案与避让 ===');
  await reset(390, 844, true);
  await passGates();

  const mob = () => ev(`(function(){
    var w=document.querySelector('.prism-mobile-wrap'),t=document.querySelector('.prism-m-title'),ls=document.querySelectorAll('.prism-m-line');
    if(!w||!t)return null;var c=getComputedStyle(t),wc=getComputedStyle(w);
    var wr=w.getBoundingClientRect(),tr=t.getBoundingClientRect(),bar=document.querySelector('.topbar').getBoundingClientRect(),sh=document.querySelector('.orb-shell').getBoundingClientRect();
    return {display:wc.display,top:wc.top,pos:wc.position,pe:wc.pointerEvents,z:wc.zIndex,visibility:wc.visibility,opacity:wc.opacity,
      text:t.textContent.trim(),fontSize:c.fontSize,weight:c.fontWeight,spacing:c.letterSpacing,
      bg:c.backgroundImage,bgSize:c.backgroundSize,bgPos:c.backgroundPosition,clip:c.webkitBackgroundClip||c.backgroundClip,
      fill:c.webkitTextFillColor,filter:c.filter,anim:c.animationName,animDur:c.animationDuration,
      rect:{t:Math.round(wr.top),b:Math.round(wr.bottom),l:Math.round(wr.left),w:Math.round(wr.width)},
      centerOffset:Math.round((wr.left+wr.width/2)-innerWidth/2),
      topbarBottom:Math.round(bar.bottom),shellTop:Math.round(sh.top),
      lines:[].map.call(ls,function(e){var s=getComputedStyle(e);return {w:s.width,h:s.height,bg:s.backgroundColor}}),
      gap:getComputedStyle(w).gap,textCy:Math.round(tr.top+tr.height/2),
      lineCy:[].map.call(ls,function(e){var r=e.getBoundingClientRect();return Math.round(r.top+r.height/2)}),
      gaps:[].map.call(ls,function(e){var r=e.getBoundingClientRect();return Math.round(r.left<tr.left?tr.left-r.right:r.left-tr.right)}),
      deskWrap:getComputedStyle(document.querySelector('.prism-wrap')).display,
      allItems:document.querySelectorAll('.orb-item').length};
  })()`);
  const m = await mob();
  check('验收6 · 手机端显示「防患于未然」，20px / 600 / .2em',
    m && m.display === 'flex' && m.text === '防患于未然' && m.fontSize === '20px' && m.weight === '600' && parseFloat(m.spacing) >= 3.9,
    { text: m && m.text, size: m && m.fontSize, weight: m && m.weight, spacing: m && m.spacing });
  check('验收6b · 同套六段渐变 / clip:text / 透明 / 10px 柔光 / 静态无流动动画',
    m && /#2e7fd9|rgb\(46, 127, 217\)/i.test(m.bg) && /#5b6fe0|rgb\(91, 111, 224\)/i.test(m.bg) &&
    /#1e8c82|rgb\(30, 140, 130\)/i.test(m.bg) && /#7b8cff|rgb\(123, 140, 255\)/i.test(m.bg) &&
    /text/.test(m.clip) && /rgba\(0, 0, 0, 0\)|transparent/.test(m.fill) &&
    /drop-shadow/.test(m.filter) && /10px/.test(m.filter) && /79, 168, 232/.test(m.filter) &&
    (m.anim === 'none' || m.anim === '') && m.bgSize === '100% 100%',
    { clip: m && m.clip, fill: m && m.fill, filter: m && m.filter, anim: m && m.anim, bgSize: m && m.bgSize });
  check('验收7 · 不与顶栏重叠、不压球舞台（文案底 < 球壳顶），水平居中',
    m && m.rect.t >= m.topbarBottom && m.rect.b <= m.shellTop - 4 && Math.abs(m.centerOffset) <= 1,
    { wrap: m && m.rect, topbarBottom: m && m.topbarBottom, shellTop: m && m.shellTop, offset: m && m.centerOffset });
  check('验收7b · 位置为顶栏下方 60px（116px），fixed 且不拦拖拽',
    m && m.rect.t === m.topbarBottom + 60 && m.pos === 'fixed' && m.pe === 'none' && m.z === '6',
    { top: m && m.rect.t, pos: m && m.pos, pe: m && m.pe, z: m && m.z });
  check('验收8 · 两侧 28×1px 装饰线 rgba(79,168,232,.25)，与文字间距 14px',
    m && m.lines.length === 2 && m.lines.every(l => l.w === '28px' && l.h === '1px' && /79, 168, 232/.test(l.bg)) &&
    m.gap === '14px' && m.gaps.every(g => g >= 12 && g <= 16) && m.lineCy.every(y => Math.abs(y - m.textCy) <= 2),
    { lines: m && m.lines, gap: m && m.gap, gaps: m && m.gaps });
  check('通用16 · 手机端不显示桌面棱镜文案，12 个球仍在',
    m && m.deskWrap === 'none' && m.allItems === 12, { deskWrap: m && m.deskWrap, items: m && m.allItems });
  const sMob = await shot('v27-mobile-prism.png'); console.log('SHOT  v27-mobile-prism.png  ' + sMob + ' bytes');

  /* 把手条 v26 保留不动 */
  const hd = await ev(`(function(){var tx=document.querySelector('.dh-text'),ar=document.querySelector('.dh-arrow'),bar=document.querySelector('.dh-bar'),h=document.querySelector('#drawerHandle');
    if(!tx||!ar||!bar||!h)return null;var c=getComputedStyle(tx),a=getComputedStyle(ar),b=getComputedStyle(bar),hc=getComputedStyle(h);
    return {text:tx.textContent.trim(),size:c.fontSize,weight:c.fontWeight,color:c.color,arrow:ar.textContent.trim(),aAnim:a.animationName,barW:b.width,barH:b.height,barBg:b.backgroundImage,shadow:hc.boxShadow}})()`);
  check('保留不动 · 手机把手条深蓝 14px/600 文字、↑箭头动画、44×4 渐变横线、顶部淡蓝边',
    hd && hd.text === '和助手聊聊' && hd.size === '14px' && hd.weight === '600' && hd.color === 'rgb(43, 92, 217)' &&
    hd.arrow === '↑' && hd.aAnim === 'arrow-hint' && hd.barW === '44px' && hd.barH === '4px' &&
    /43, 92, 217/.test(hd.barBg) && /30, 140, 130|1e8c82/i.test(hd.barBg) && /43, 92, 217/.test(hd.shadow),
    { text: hd && hd.text, size: hd && hd.size, color: hd && hd.color, arrow: hd && hd.arrow });

  /* 抽屉展开：文案避让淡出；收起恢复；拖拽/点击展开正常 */
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.open)window.XT_DRAWER.open();return 1})()`); await sleep(420);
  const opened = await ev(`(function(){var w=document.querySelector('.prism-mobile-wrap');var c=getComputedStyle(w);return {open:window.XT_DRAWER.isOpen(),opacity:c.opacity,visibility:c.visibility,shrunken:document.querySelector('.pane-orb').classList.contains('orb-shrunk')}})()`);
  check('验收7c · 抽屉展开时文案淡出，不压缩小后的球舞台（300ms 收起逻辑未改动）',
    opened && opened.open && (opened.opacity === '0' || opened.visibility === 'hidden') && opened.shrunken, opened);
  const sOpen = await shot('v27-mobile-drawer-open.png'); console.log('SHOT  v27-mobile-drawer-open.png  ' + sOpen + ' bytes');
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.close)window.XT_DRAWER.close();return 1})()`); await sleep(420);
  const closed = await ev(`(function(){var c=getComputedStyle(document.querySelector('.prism-mobile-wrap'));return {open:window.XT_DRAWER.isOpen(),opacity:c.opacity,visibility:c.visibility,top:Math.round(document.querySelector('.prism-mobile-wrap').getBoundingClientRect().top)}})()`);
  check('验收7d · 收起后文案恢复显示且位置不变', closed && !closed.open && closed.opacity === '1' && closed.visibility === 'visible' && Math.abs(closed.top - (m.rect.t)) <= 2, closed);
  const handlePt = `(function(){var r=document.querySelector('#drawerHandle').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`;
  const hr = await ev(handlePt);
  await tap(hr.x, hr.y); await sleep(400);
  const tapOpen = await ev(`(function(){return window.XT_DRAWER.isOpen()})()`);
  /* 展开后把手条随抽屉上移，必须重新取坐标再点第二次 */
  const hr2 = await ev(handlePt);
  await tap(hr2.x, hr2.y); await sleep(400);
  const tapClose = await ev(`(function(){return window.XT_DRAWER.isOpen()})()`);
  check('保留不动 · 把手条点击展开 / 再次点击收起功能正常', tapOpen === true && tapClose === false, { tapOpen, tapClose, hr, hr2 });
  const hsM = await noHScroll();
  check('通用 · 手机 390 无横向溢出', hsM && hsM.sw <= hsM.iw + 1, hsM);

  /* ================= 平板 820x1180 ================= */
  console.log('\n=== 平板 (820x1180) 与窄横屏 (1023x768) 避让 ===');
  await reset(820, 1180, true);
  await passGates();
  const t = await mob();
  check('验收7e · 820 平板：文案顶栏下 60px、水平居中、不压球舞台',
    t && t.rect.t === t.topbarBottom + 60 && Math.abs(t.centerOffset) <= 1 && t.rect.b <= t.shellTop - 4,
    { top: t && t.rect.t, topbarBottom: t && t.topbarBottom, shellTop: t && t.shellTop, wrapBottom: t && t.rect.b });
  const sTab = await shot('v27-tablet-prism.png'); console.log('SHOT  v27-tablet-prism.png  ' + sTab + ' bytes');

  await reset(1023, 768, true);
  await passGates();
  const n = await mob();
  check('验收7f · 1023×768 空隙仅 23px：自动避让（隐藏或居中），仍不压顶栏/球舞台',
    n && (n.visibility === 'hidden' || n.opacity === '0' ||
      (n.rect.t >= n.topbarBottom && n.rect.b <= n.shellTop - 2)),
    { visibility: n && n.visibility, opacity: n && n.opacity, wrap: n && n.rect, topbarBottom: n && n.topbarBottom, shellTop: n && n.shellTop });
  const sNarrow = await shot('v27-narrow-avoid.png'); console.log('SHOT  v27-narrow-avoid.png  ' + sNarrow + ' bytes');

  /* ================= 通用回归 ================= */
  console.log('\n=== 通用回归（问答 / 医生 / 预约 / 请假 / 主色） ===');
  await reset(1440, 1000, false);
  await passGates();
  const faq = await ev(`(function(){return {n:window.__faqCatalog?window.__faqCatalog().length:0,best:window.__faqMatch?window.__faqMatch('食堂几点开饭').bestId:null}})()`);
  check('回归 · 30 条问答与云数据库匹配未变', faq && faq.n === 30 && faq.best === 1, faq);
  await click('#faqOpenBtn'); await sleep(320);
  const tabs = await ev(`(function(){return [].map.call(document.querySelectorAll('.faq-tab'),function(e){return e.textContent.trim()})})()`);
  check('回归 · 10 个分类标签完整（前三类 食序/息衡/动跃）',
    tabs && tabs.length === 10 && tabs[0] === '食序' && tabs[1] === '息衡' && tabs[2] === '动跃', { count: tabs && tabs.length });
  await click('#closeFaq'); await sleep(180);
  await ev(`(function(){window.XT_CHAT.bookDoctor();return 1})()`); await sleep(400);
  const docs = await ev(`(function(){var a=document.querySelectorAll('#doctorCards .doc-card');return {n:a.length,btns:[].map.call(a,function(e){var b=e.querySelector('.dc-btn');return b?b.textContent.trim():null})}})()`);
  check('回归 · 医生列表三卡与动态预约按钮未受影响', docs && docs.n === 3 && docs.btns.every(Boolean), docs);
  await click('#closeDoctor'); await sleep(200);
  await click('#bookBtn'); await sleep(320);
  const empty = await ev(`(function(){var a=document.querySelectorAll('#chatLog .bk-empty');return a.length?a[a.length-1].textContent.trim():null})()`);
  check('回归 · 我的预约空态文案不变', /你还没有预约记录/.test(empty || ''), { empty: empty && empty.slice(0, 40) });
  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='我要请假三天';return 1})()`);
  await click('#sendBtn');
  let leave = null;
  for (let i = 0; i < 14; i++) {
    await sleep(400);
    leave = await ev(`(function(){var m=document.querySelector('#leaveModal');return {open:!!(m&&!m.hidden),form:!!document.querySelector('#leaveForm')}})()`);
    if (leave && leave.open && leave.form) break;
  }
  check('回归 · 「我要请假」流程未受影响', leave && leave.open && leave.form, leave);
  const theme = await ev(`(function(){return getComputedStyle(document.documentElement).getPropertyValue('--blue').trim()})()`);
  check('回归 · 主色 #2AA79B 未变', theme === '#2AA79B', { theme });

  const realErrors = jsErrors.filter(s => !/favicon|net::ERR_/i.test(s));
  check('验收10 · 全流程 0 未捕获 jsError / console.error', realErrors.length === 0, { count: realErrors.length, sample: realErrors.slice(0, 4) });

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
