/* v28 · 桌面主文案 / 手机功能说明 / 手机球下标签
 * 用法：node e2e-v28.js [URL]   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖用户验收 1-17 + 通用回归（30 问答 / 云数据库 / 医生 / 预约 / 请假 /
 * 把手条 / 抽屉 / 主色 / 小球投影与分裂 / 哈希基线 / 0 jsError）。
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

function lum(a) { const f = a.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return .2126 * f[0] + .7152 * f[1] + .0722 * f[2]; }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

/* ================= 静态源码检查 ================= */
function staticChecks() {
  console.log('\n=== 静态源码检查（不依赖浏览器） ===');
  const baseline = fs.readFileSync('E:/gzkj/v28-baseline.sha256', 'utf8').trim().split('\n');
  const bad = [];
  baseline.forEach(line => {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
    if (!m) return;
    if (sha(path.join(PROJECT, m[2])) !== m[1]) bad.push(m[2]);
  });
  check('保留不动 · 23 个既有文件（问答/云数据库/门禁/医生/把手条/小球 CSS/棱镜 CSS）一字未改',
    bad.length === 0, { checked: baseline.length, changed: bad });

  const html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(PROJECT, 'v28.css'), 'utf8');
  const js = fs.readFileSync(path.join(PROJECT, 'v28.js'), 'utf8');
  const orb = fs.readFileSync(path.join(PROJECT, 'orb-view.js'), 'utf8');
  const v26 = fs.readFileSync(path.join(PROJECT, 'v26.css'), 'utf8');

  check('一 · 棱镜 DOM 已移除、CSS 类定义保留；桌面新文案结尾无句号；v28 最后加载',
    !/class="prism-wrap"|class="prism-title"|class="prism-line"/.test(html) &&
    /\.prism-wrap\s*\{/.test(v26) && /@keyframes prism-flow/.test(v26) &&
    /\.prism-title::before/.test(v26) &&
    (html.match(/class="hero-slogan"/g) || []).length === 1 &&
    html.indexOf('科学做好预防与养护，防患于未然</span>') > 0 &&
    !/防患于未然。/.test(html) &&
    html.indexOf('href="v28.css"') > html.indexOf('href="v27.css"') &&
    html.indexOf('<script src="v28.js"') > html.indexOf('<script src="v27.js"'));

  check('一 · 硬约束：三色蓝→青绿渐变 / 无 drop-shadow / 无流动动画 / 无紫色 / @supports 降级',
    /linear-gradient\(\s*95deg,\s*#2C6EA0 0%,\s*#257F9C 45%,\s*#1A847E 100%/.test(css) &&
    !/filter\s*:/.test(css) && !/drop-shadow/.test(css) &&
    !/@keyframes/.test(css) && !/animation\s*:/.test(css) &&
    !/background-position/.test(css) && !/#7B8CFF|#5B6FE0|purple|rebeccapurple/i.test(css) &&
    /@supports not \(-webkit-background-clip: text\)/.test(css) &&
    /-webkit-text-fill-color: #2C6EA0/.test(css) &&
    /hero-slogan\.is-solid/.test(css));

  check('一 · v28.js 按给定公式自适应（40px / box*.96 / floor / <1200 下限 16 / 纯色降级 / resize）',
    /el\.style\.fontSize = '40px'/.test(js) && /need > box \* 0\.96/.test(js) &&
    /Math\.floor\(40 \* \(box \* 0\.96 \/ need\)\)/.test(js) &&
    /window\.innerWidth < 1200 && fs < 16/.test(js) && /fs = 16/.test(js) &&
    /classList\.add\('is-solid'\)/.test(js) && /addEventListener\('resize', run\)/.test(js) &&
    /--hero-top/.test(js) && /--hero-gap/.test(js));

  check('一 · 位置用「顶栏底 → 球舞台圆顶」实测 + flex 居中，不写死像素',
    /b\.bottom - p\.top/.test(js) && /s\.top - b\.bottom/.test(js) &&
    /align-items: center/.test(css) && /justify-content: center/.test(css) &&
    !/top: 56px/.test(css));

  check('二 · 手机说明行：12px/400/rgba(60,80,90,.50)/.02em/下方 10px/绝对定位/桌面隐藏',
    html.indexOf('校园健康助手 · 点球看数据，上拉聊天') > 0 &&
    /top: calc\(100% \+ 10px\)/.test(css) && /font-size: 12px/.test(css) &&
    /font-weight: 400/.test(css) && /rgba\(60, 80, 90, \.50\)/.test(css) &&
    /letter-spacing: 0\.02em/.test(css) && /position: absolute/.test(css) &&
    /\.prism-m-sub \{ display: none; \}/.test(css) &&
    html.indexOf('class="prism-m-sub"') > html.indexOf('class="prism-m-title"'));

  check('三 · 球下标签：三球映射 / 11px/500/rgba(...,.45)/.06em/6px/低于球/中球层隐藏/桌面不显示',
    /\['food', '饮食'\], \['sleep', '作息'\], \['sport', '运动'\]/.test(orb) &&
    /font-size: calc\(11px \* var\(--tag-comp\)\)/.test(css) &&
    /font-weight: 500/.test(css) && /rgba\(60, 80, 90, \.45\)/.test(css) &&
    /letter-spacing: 0\.06em/.test(css) && /translateY\(calc\(6px \* var\(--tag-comp\)\)\)/.test(css) &&
    /z-index: -1/.test(css) && /\.page\.orb-split \.orb-tag/.test(css) &&
    /@media \(min-width: 1024px\)[\s\S]*\.orb-tag \{ display: none !important; \}/.test(css) &&
    /pane-orb\.orb-shrunk \.orb-tag/.test(css));

  check('三 · 投影公式与三段式动画逐字未改，只新增标签同步（不改球的 --px/--py/--sc 写法）',
    /var k = CAMERA_D \/ \(CAMERA_D - z2\)/.test(orb) &&
    /el\.style\.setProperty\('--px', \(x2 \* k\)\.toFixed\(2\) \+ 'px'\)/.test(orb) &&
    /el\.style\.setProperty\('--sc', k\.toFixed\(4\)\)/.test(orb) &&
    /function triggerSplit/.test(orb) && /function goRoot/.test(orb) &&
    /--tag-px/.test(orb) && /--tag-py/.test(orb) &&
    (orb.match(/setProperty\('--tag-/g) || []).length === 2 &&
    /o\.tag\.style\.setProperty\('--tag-px'/.test(orb) &&
    /o\.tag\.style\.setProperty\('--tag-py'/.test(orb));
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
    await sleep(400);
  }
  const noHScroll = () => ev(`(function(){return {sw:document.documentElement.scrollWidth,iw:innerWidth}})()`);

  const deskProbe = `(function(){
    var e=document.querySelector('.hero-slogan'),w=document.querySelector('.hero-slogan-wrap');
    if(!e||!w)return null;
    var c=getComputedStyle(e),wc=getComputedStyle(w),er=e.getBoundingClientRect(),wr=w.getBoundingClientRect();
    var bar=document.querySelector('.topbar').getBoundingClientRect(),sh=document.querySelector('.orb-shell').getBoundingClientRect();
    var pane=document.querySelector('#orbPane').getBoundingClientRect(),before=getComputedStyle(e,'::before');
    return {text:e.textContent.trim(),fontSize:c.fontSize,ratio:+(er.width/wr.width).toFixed(4),
      textW:Math.round(er.width),boxW:Math.round(wr.width),whiteSpace:c.whiteSpace,
      lineHeight:c.lineHeight,textH:Math.round(er.height),solid:e.classList.contains('is-solid'),
      fill:c.webkitTextFillColor,bg:c.backgroundImage,filter:c.filter,anim:c.animationName,
      animDur:c.animationDuration,bgPos:c.backgroundPosition,bgSize:c.backgroundSize,clip:c.webkitBackgroundClip||c.backgroundClip,
      beforeContent:before.content,beforeFilter:before.filter,
      wrapTop:Math.round(wr.top),wrapH:Math.round(wr.height),wrapDisplay:wc.display,align:wc.alignItems,justify:wc.justifyContent,
      textCy:Math.round(er.top+er.height/2),gapCy:Math.round((bar.bottom+sh.top)/2),
      barBottom:Math.round(bar.bottom),shellTop:Math.round(sh.top),
      paneLeft:Math.round(pane.left),paneRight:Math.round(pane.right),
      textLeft:Math.round(er.left),textRight:Math.round(er.right),
      centerOffset:Math.round((er.left+er.width/2)-(pane.left+pane.width/2)),
      prismNodes:document.querySelectorAll('.prism-wrap,.prism-title,.prism-line').length,
      heroVars:{top:w.style.getPropertyValue('--hero-top'),gap:w.style.getPropertyValue('--hero-gap')},
      tagDisplay:getComputedStyle(document.querySelector('.orb-tag')).display,
      subDisplay:getComputedStyle(document.querySelector('.prism-m-sub')).display,
      mobileWrap:getComputedStyle(document.querySelector('.prism-mobile-wrap')).display,
      allItems:document.querySelectorAll('.orb-item').length};
  })()`;

  const snap = () => ev(`(function(){return [].map.call(document.querySelectorAll('.orb-item'),function(e){
    var r=e.getBoundingClientRect(),c=getComputedStyle(e);
    return {id:e.getAttribute('data-orb')+'/'+e.getAttribute('data-mod'),
      x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height),
      px:c.getPropertyValue('--px').trim(),py:c.getPropertyValue('--py').trim(),sc:c.getPropertyValue('--sc').trim()};
  })})()`);

  const mobProbe = `(function(){
    var sub=document.querySelector('.prism-m-sub'),mw=document.querySelector('.prism-mobile-wrap'),title=document.querySelector('.prism-m-title');
    var tags=[].map.call(document.querySelectorAll('.orb-tag'),function(t){
      var r=t.getBoundingClientRect(),c=getComputedStyle(t),b=document.querySelector('.orb-major[data-orb="'+t.getAttribute('data-tag')+'"]');
      var br=b.getBoundingClientRect(),bc=getComputedStyle(b);
      return {txt:t.textContent.trim(),tag:t.getAttribute('data-tag'),display:c.display,vis:c.visibility,opacity:c.opacity,
        z:c.zIndex,fs:c.fontSize,weight:c.fontWeight,color:c.color,ls:c.letterSpacing,tf:c.transform,
        px:bc.getPropertyValue('--px').trim(),py:bc.getPropertyValue('--py').trim(),sc:parseFloat(bc.getPropertyValue('--sc')),
        d:parseFloat(bc.getPropertyValue('--d')),tpx:c.getPropertyValue('--tag-px').trim(),tpy:c.getPropertyValue('--tag-py').trim(),
        ballZ:bc.zIndex,dx:Math.round((r.left+r.width/2)-(br.left+br.width/2)),dy:Math.round(r.top-br.bottom),
        rect:{l:Math.round(r.left),r:Math.round(r.right),t:Math.round(r.top),b:Math.round(r.bottom),w:Math.round(r.width),h:Math.round(r.height)}};
    });
    var sr=sub?sub.getBoundingClientRect():null,sc=sub?getComputedStyle(sub):null,wr=mw.getBoundingClientRect(),wcs=getComputedStyle(mw);
    var tr=title.getBoundingClientRect(),tc=getComputedStyle(title);
    var bar=document.querySelector('.topbar').getBoundingClientRect(),sh=document.querySelector('.orb-shell').getBoundingClientRect();
    var handle=document.querySelector('.drawer-handle').getBoundingClientRect();
    return {sub:sr?{txt:sub.textContent.trim(),display:sc.display,vis:sc.visibility,fs:sc.fontSize,weight:sc.fontWeight,
      color:sc.color,ls:sc.letterSpacing,top:Math.round(sr.top),bottom:Math.round(sr.bottom),
      l:Math.round(sr.left),r:Math.round(sr.right),gapToTitle:Math.round(sr.top-wr.bottom),
      centerOffset:Math.round((sr.left+sr.width/2)-innerWidth/2)}:null,
      title:{txt:title.textContent.trim(),fs:tc.fontSize,weight:tc.fontWeight,bg:tc.backgroundImage,
        filter:tc.filter,anim:tc.animationName,bgSize:tc.backgroundSize},
      wrap:{top:Math.round(wr.top),bottom:Math.round(wr.bottom),h:Math.round(wr.height),display:wcs.display,
        opacity:wcs.opacity,vis:wcs.visibility,offsetHeight:mw.offsetHeight},
      barBottom:Math.round(bar.bottom),shellTop:Math.round(sh.top),handleTop:Math.round(handle.top),
      tags:tags,heroDisplay:getComputedStyle(document.querySelector('.hero-slogan-wrap')).display,
      scrollW:document.documentElement.scrollWidth,iw:innerWidth};
  })()`;

  /* ================= 桌面 ================= */
  console.log('\n=== 桌面 1440x1000：验收 1-7 ===');
  await reset(1440, 1000, false); await passGates();
  const d = await ev(deskProbe);
  const SLOGAN = '持续关注自身状态，提前关注健康变化，及时识别潜在健康风险，科学做好预防与养护，防患于未然';
  check('验收1 · 舞台上方只有那一整句话，结尾无句号；棱镜 DOM 与装饰线已移除',
    d && d.text === SLOGAN && !/[。.!]$/.test(d.text) && d.prismNodes === 0 && d.wrapDisplay === 'flex',
    { text: d && d.text, prismNodes: d && d.prismNodes });
  check('验收2 · 单行不换行、中蓝→青绿三色渐变、无紫色相',
    d && d.whiteSpace === 'nowrap' && d.textH <= Math.ceil(parseFloat(d.fontSize) * 1.3) + 1 &&
    /95deg/.test(d.bg) && /rgb\(44, 110, 160\)/.test(d.bg) && /rgb\(37, 127, 156\)/.test(d.bg) &&
    /rgb\(26, 132, 126\)/.test(d.bg) && !/123, 140, 255|91, 111, 224/.test(d.bg) &&
    /text/.test(d.clip) && /rgba\(0, 0, 0, 0\)/.test(d.fill),
    { size: d && d.fontSize, bg: d && d.bg, clip: d && d.clip });
  check('验收3 · 无发光/无光晕/无流动动画（filter、animation、::before、背景位全静态）',
    d && d.filter === 'none' && (d.anim === 'none' || d.anim === '') && d.beforeContent === 'none' &&
    d.beforeFilter === 'none' && d.bgSize === 'auto' && d.bgPos === '0% 0%',
    { filter: d && d.filter, anim: d && d.anim, before: d && d.beforeContent, bgSize: d && d.bgSize, bgPos: d && d.bgPos });
  const p1 = d && d.bgPos; await sleep(520);
  const p2 = await ev(`(function(){return getComputedStyle(document.querySelector('.hero-slogan')).backgroundPosition})()`);
  check('验收3b · 520ms 后背景位置不变（无 background-position 流动动画）', p1 === p2, { p1, p2 });
  const cBlue = contrast([44, 110, 160], [247, 250, 249]);
  const cTeal = contrast([26, 132, 126], [247, 250, 249]);
  const cBlueGreen = contrast([44, 110, 160], [220, 238, 234]);
  const cTealGreen = contrast([26, 132, 126], [220, 238, 234]);
  check('验收4 · 渐变起止色在奶白与青绿背景上对比度均 ≥3（可读）',
    Math.min(cBlue, cTeal, cBlueGreen, cTealGreen) >= 3,
    { milk: [+cBlue.toFixed(2), +cTeal.toFixed(2)], green: [+cBlueGreen.toFixed(2), +cTealGreen.toFixed(2)] });
  check('验收5 · 1440 文字占容器 92%–96%，不溢出右栏',
    d && d.ratio >= .92 && d.ratio <= .96 && d.textLeft >= d.paneLeft - 1 && d.textRight <= d.paneRight + 1,
    { ratio: d && d.ratio, textW: d && d.textW, boxW: d && d.boxW, fontSize: d && d.fontSize });
  check('验收6 · 顶栏底→球舞台圆顶空隙内 flex 垂直居中、水平居中小球舞台',
    d && Math.abs(d.textCy - d.gapCy) <= 1 && d.align === 'center' && d.justify === 'center' &&
    Math.abs(d.centerOffset) <= 1 && d.heroVars.gap !== '' && d.heroVars.top !== '',
    { textCy: d && d.textCy, gapCy: d && d.gapCy, barBottom: d && d.barBottom, shellTop: d && d.shellTop, vars: d && d.heroVars });
  check('验收16 · 桌面端看不到球下标签与手机说明行（12 球仍在）',
    d && d.tagDisplay === 'none' && d.subDisplay === 'none' && d.mobileWrap === 'none' && d.allItems === 12,
    { tag: d && d.tagDisplay, sub: d && d.subDisplay, items: d && d.allItems });

  const before = await snap();
  await ev(`(function(){document.querySelector('.hero-slogan-wrap').style.display='none';return 1})()`); await sleep(120);
  const after = await snap();
  await ev(`(function(){document.querySelector('.hero-slogan-wrap').style.display='';return 1})()`); await sleep(80);
  const same = before && after && before.length === 12 && before.every((b, i) => {
    const a = after[i];
    return a && b.id === a.id && Math.abs(a.x - b.x) <= 2 && Math.abs(a.y - b.y) <= 2 &&
      a.w === b.w && a.h === b.h && a.px === b.px && a.py === b.py && a.sc === b.sc;
  });
  check('验收7 · 小球位置/尺寸/投影变量在新文案显隐前后完全一致（12 球逐个对比）', same,
    { count: before && before.length, sample: before && before[0] });
  const sD1 = await shot('v28-desktop-1440.png'); console.log('SHOT  v28-desktop-1440.png  ' + sD1 + ' bytes');
  const hsD = await noHScroll();
  check('通用 · 桌面 1440 无横向溢出', hsD && hsD.sw <= hsD.iw + 1, hsD);

  /* 三段式分裂回归（小球动画不受影响） */
  const orbPt = await ev(`(function(){var e=document.querySelector('.orb-major[data-orb="food"]');var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  await tap(orbPt.x, orbPt.y); await sleep(950);
  const subState = await ev(`(function(){return {split:document.querySelector('.page').classList.contains('orb-split'),isSub:document.querySelector('#orbStage').classList.contains('is-sub'),lv:window.__orbState&&window.__orbState().level}})()`);
  check('验收7b · 三段式分裂动画回归：点大球进入中球层', subState && subState.split && subState.isSub && subState.lv === 'sub', subState);
  const back = await ev(`(function(){var e=document.querySelector('#orbBack');if(!e||e.hidden)return null;var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (back) { await tap(back.x, back.y); await sleep(900); }
  const rootState = await ev(`(function(){return window.__orbState&&window.__orbState().level})()`);
  check('验收7c · 返回大球层正常', rootState === 'root', { level: rootState });

  /* 1920 与 <1200 下限 */
  console.log('\n=== 桌面 1920x1080 / 1024x800 ===');
  await reset(1920, 1080, false); await passGates();
  const d2 = await ev(deskProbe);
  check('验收5b · 1920 文字占容器 92%–96%、居中、无溢出',
    d2 && d2.ratio >= .92 && d2.ratio <= .96 && Math.abs(d2.textCy - d2.gapCy) <= 1 &&
    d2.textLeft >= d2.paneLeft - 1 && d2.textRight <= d2.paneRight + 1,
    { ratio: d2 && d2.ratio, size: d2 && d2.fontSize, textW: d2 && d2.textW });
  const sD2 = await shot('v28-desktop-1920.png'); console.log('SHOT  v28-desktop-1920.png  ' + sD2 + ' bytes');

  await reset(1024, 800, false); await passGates();
  const d3 = await ev(deskProbe);
  check('验收5c · 窗口 <1200 且放不下：字号下限 16px、降级纯色 #2C6EA0、保持单行不换行',
    d3 && d3.fontSize === '16px' && d3.solid && /rgb\(44, 110, 160\)/.test(d3.fill) &&
    d3.bg === 'none' && d3.whiteSpace === 'nowrap',
    { size: d3 && d3.fontSize, solid: d3 && d3.solid, fill: d3 && d3.fill, bg: d3 && d3.bg });
  const hsD3 = await noHScroll();
  check('通用 · 1024 桌面无横向滚动（页面 overflow:hidden）', hsD3 && hsD3.sw <= hsD3.iw + 1, hsD3);
  const sD3 = await shot('v28-desktop-1024-solid.png'); console.log('SHOT  v28-desktop-1024-solid.png  ' + sD3 + ' bytes');

  /* ================= 手机 390 ================= */
  console.log('\n=== 手机 390x844：验收 8-15 ===');
  await reset(390, 844, true); await passGates();
  const m = await ev(mobProbe);
  check('验收8 · 顶部两行字：「防患于未然」+ 下方 10px 的「校园健康助手 · 点球看数据，上拉聊天」',
    m && m.title.txt === '防患于未然' && m.sub.txt === '校园健康助手 · 点球看数据，上拉聊天' &&
    m.sub.display === 'block' && m.sub.gapToTitle === 10 && Math.abs(m.sub.centerOffset) <= 1 &&
    m.wrap.opacity === '1' && m.wrap.vis === 'visible',
    { title: m && m.title.txt, sub: m && m.sub.txt, gap: m && m.sub.gapToTitle });
  check('验收9 · 说明行 12px/400/rgba(60,80,90,.50)/.02em，明显小于上一行且更淡',
    m && m.sub.fs === '12px' && parseFloat(m.title.fs) === 20 && m.sub.weight === '400' &&
    /rgba\(60, 80, 90, 0\.5\)/.test(m.sub.color) && /0\.24px/.test(m.sub.ls) &&
    parseFloat(m.sub.fs) < parseFloat(m.title.fs),
    { sub: m && m.sub.fs, title: m && m.title.fs, color: m && m.sub.color, ls: m && m.sub.ls });
  check('二 · 手机顶部「防患于未然」20px 渐变保持不动（drop-shadow / 静态 / 100%）',
    m && m.title.fs === '20px' && m.title.weight === '600' && /linear-gradient/.test(m.title.bg) &&
    /drop-shadow/.test(m.title.filter) && (m.title.anim === 'none' || m.title.anim === '') &&
    m.title.bgSize === '100% 100%', { fs: m && m.title.fs, filter: m && m.title.filter });
  check('二 · 说明行是绝对定位子元素，父元素 offsetHeight 不变（不参与球舞台定位计算）',
    m && m.wrap.offsetHeight === 28 && m.wrap.h === 28 && m.sub.bottom > m.wrap.bottom && m.shellTop > m.sub.bottom,
    { offsetHeight: m && m.wrap.offsetHeight, wrapBottom: m && m.wrap.bottom, subBottom: m && m.sub.bottom, shellTop: m && m.shellTop });

  const tagOK = m && m.tags.length === 3 &&
    m.tags.every(t => t.display === 'block' && t.fs === '11px' && t.weight === '500' &&
      /rgba\(60, 80, 90, 0\.45\)/.test(t.color) && /0\.66px/.test(t.ls) &&
      t.dx === 0 && t.dy >= 5 && t.dy <= 7 && t.z === '-1' && +t.z < +t.ballZ &&
      /^matrix\(1, 0, 0, 1,/.test(t.tf) &&
      t.tpx === t.px && Math.abs(parseFloat(t.tpy) - (parseFloat(t.py) + t.d * t.sc / 2)) <= .02);
  check('验收10/11 · 三标签 11px/500/.06em、距球底 6px、共用 translate3d 无 scale/旋转、z-index 低于球',
    tagOK, m && m.tags.map(t => ({ tag: t.tag, txt: t.txt, dx: t.dx, dy: t.dy, z: t.z, tf: t.tf.slice(0, 30) })));
  check('验收10b · 文案映射正确：食序→饮食 / 息衡→作息 / 动跃→运动；校医院球无标签',
    m && m.tags.find(t => t.tag === 'food').txt === '饮食' &&
    m.tags.find(t => t.tag === 'sleep').txt === '作息' &&
    m.tags.find(t => t.tag === 'sport').txt === '运动' && m.tags.length === 3,
    m && m.tags.map(t => t.tag + ':' + t.txt));

  const pairs = [[0, 1], [0, 2], [1, 2]];
  const overlap = m && pairs.some(([i, j]) => {
    const a = m.tags[i].rect, b = m.tags[j].rect;
    return !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
  });
  const sleepSportGap = m && (m.tags[1].rect.l - m.tags[2].rect.r);
  check('验收12 · 三个标签互不重叠，动跃与息衡间距 ≥12px',
    m && !overlap && sleepSportGap >= 12, { overlap, sleepSportGap });
  check('验收13 · 390 下标签不超出屏幕左右边界、无横向溢出',
    m && m.tags.every(t => t.rect.l >= 0 && t.rect.r <= m.iw) && m.scrollW <= m.iw + 1,
    { rects: m && m.tags.map(t => [t.rect.l, t.rect.r]), sw: m && m.scrollW, iw: m && m.iw });
  check('验收14 · 标签不压到底部把手条', m && m.tags.every(t => t.rect.b < m.handleTop),
    { maxTagBottom: m && Math.max.apply(null, m.tags.map(t => t.rect.b)), handleTop: m && m.handleTop });
  check('验收16b · 手机端不显示桌面主文案', m && m.heroDisplay === 'none', { heroDisplay: m && m.heroDisplay });
  const sM = await shot('v28-mobile-390.png'); console.log('SHOT  v28-mobile-390.png  ' + sM + ' bytes');

  /* 拖动 / 投影角度变化：标签逐帧跟随 */
  await ev(`(function(){window.__orbApply(24,8);return 1})()`); await sleep(160);
  const dragged = await ev(mobProbe);
  const follow = dragged && dragged.tags.every((t, i) => t.dx === 0 && t.dy >= 5 && t.dy <= 7 &&
    t.tpx === t.px && Math.abs(parseFloat(t.tpy) - (parseFloat(t.py) + t.d * t.sc / 2)) <= .02 &&
    Math.round(t.rect.l - m.tags[i].rect.l) === Math.round(parseFloat(t.px) - parseFloat(m.tags[i].px)));
  check('验收11b · 改变投影角度后标签与球同步位移（逐帧跟随，无错位）', follow,
    dragged && dragged.tags.map(t => ({ tag: t.tag, px: t.px, dx: t.dx, dy: t.dy })));
  const ballPt = await ev(`(function(){var e=document.querySelector('.orb-major[data-orb="sleep"]');var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  await mouse('mousePressed', ballPt.x, ballPt.y);
  await mouse('mouseMoved', ballPt.x + 36, ballPt.y + 10); await sleep(140);
  const realDrag = await ev(`(function(){var t=document.querySelector('.orb-tag[data-tag="sleep"]'),b=document.querySelector('.orb-major[data-orb="sleep"]');
    var tr=t.getBoundingClientRect(),br=b.getBoundingClientRect(),tc=getComputedStyle(t),bc=getComputedStyle(b);
    return {dragging:document.querySelector('.orb-scene').isDragging||document.querySelector('.orb-scene').classList.contains('is-dragging'),
      dx:Math.round((tr.left+tr.width/2)-(br.left+br.width/2)),dy:Math.round(tr.top-br.bottom),
      tpx:tc.getPropertyValue('--tag-px').trim(),px:bc.getPropertyValue('--px').trim()}})()`);
  check('验收11c · 真实拖动小球舞台时标签仍贴合球底、不错位',
    realDrag && realDrag.dragging && realDrag.dx === 0 && realDrag.dy >= 5 && realDrag.dy <= 7 && realDrag.tpx === realDrag.px, realDrag);
  const sDrag = await shot('v28-mobile-drag.png'); console.log('SHOT  v28-mobile-drag.png  ' + sDrag + ' bytes');
  await mouse('mouseReleased', ballPt.x + 36, ballPt.y + 10); await sleep(160);
  await ev(`(function(){window.__orbApply(0,0);return 1})()`); await sleep(120);

  /* 进入中球层标签隐藏 */
  const majorPt = await ev(`(function(){var e=document.querySelector('.orb-major[data-orb="food"]');var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  await tap(majorPt.x, majorPt.y); await sleep(950);
  const inSub = await ev(`(function(){var t=document.querySelector('.orb-tag'),c=getComputedStyle(t);return {split:document.querySelector('.page').classList.contains('orb-split'),isSub:document.querySelector('#orbStage').classList.contains('is-sub'),vis:c.visibility,op:c.opacity}})()`);
  check('验收15 · 进入中球层后大球标签隐藏', inSub && (inSub.split || inSub.isSub) && (inSub.vis === 'hidden' || inSub.op === '0'), inSub);
  const sSub = await shot('v28-mobile-sub-hidden.png'); console.log('SHOT  v28-mobile-sub-hidden.png  ' + sSub + ' bytes');
  const backPt = await ev(`(function(){var e=document.querySelector('#orbBack');if(!e||e.hidden)return null;var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`);
  if (backPt) { await tap(backPt.x, backPt.y); await sleep(900); }
  const backTag = await ev(`(function(){var c=getComputedStyle(document.querySelector('.orb-tag'));return {vis:c.visibility,op:c.opacity}})()`);
  check('验收15b · 返回大球层后标签恢复', backTag && backTag.vis === 'visible' && backTag.op === '1', backTag);

  /* 抽屉展开：标签缩放补偿 + 顶部文案避让 */
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.open)window.XT_DRAWER.open();return 1})()`); await sleep(440);
  const opened = await ev(`(function(){var t=document.querySelector('.orb-tag'),c=getComputedStyle(t),r=t.getBoundingClientRect();
    var w=document.querySelector('.prism-mobile-wrap'),wc=getComputedStyle(w);
    var h=document.querySelector('.drawer-handle').getBoundingClientRect();
    return {open:window.XT_DRAWER.isOpen(),comp:c.getPropertyValue('--tag-comp').trim(),fs:c.fontSize,
      visualH:Math.round(r.height),tagBottom:Math.round(r.bottom),handleTop:Math.round(h.top),
      wrapOp:wc.opacity,wrapVis:wc.visibility,shrunken:document.querySelector('.pane-orb').classList.contains('orb-shrunk')}})()`);
  check('通用 · 抽屉展开：标签字号反向补偿后视觉仍约 11px、不压把手条；顶部文案淡出',
    opened && opened.open && opened.shrunken && Math.abs(parseFloat(opened.comp) - 2.381) < .01 &&
    opened.visualH >= 12 && opened.visualH <= 19 && opened.tagBottom < opened.handleTop &&
    (opened.wrapOp === '0' || opened.wrapVis === 'hidden'), opened);
  const sOpen = await shot('v28-mobile-drawer-open.png'); console.log('SHOT  v28-mobile-drawer-open.png  ' + sOpen + ' bytes');
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.close)window.XT_DRAWER.close();return 1})()`); await sleep(440);
  const closedFs = await ev(`(function(){return getComputedStyle(document.querySelector('.orb-tag')).fontSize})()`);
  check('通用 · 抽屉收起后标签字号恢复 11px', closedFs === '11px', { fs: closedFs });

  /* 把手条 v26 保留 */
  const hd = await ev(`(function(){var tx=document.querySelector('.dh-text'),ar=document.querySelector('.dh-arrow');
    var c=getComputedStyle(tx),a=getComputedStyle(ar);return {text:tx.textContent.trim(),size:c.fontSize,color:c.color,arrow:ar.textContent.trim(),anim:a.animationName}})()`);
  check('保留不动 · 手机把手条深蓝 14px/600 文字、↑ 箭头与引导动画',
    hd && hd.text === '和助手聊聊' && hd.size === '14px' && hd.color === 'rgb(43, 92, 217)' &&
    hd.arrow === '↑' && hd.anim === 'arrow-hint', hd);

  /* 320 边界 / 820 平板 / 1023 避让 */
  console.log('\n=== 手机 320x568 / 平板 820x1180 / 1023x768 ===');
  await reset(320, 568, true); await passGates();
  const n320 = await ev(mobProbe);
  const ov320 = n320 && [[0, 1], [0, 2], [1, 2]].some(([i, j]) => {
    const a = n320.tags[i].rect, b = n320.tags[j].rect;
    return !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
  });
  check('验收13b · 320 下标签不超屏、互不重叠、不压把手条、无横向溢出',
    n320 && n320.tags.every(t => t.rect.l >= 0 && t.rect.r <= n320.iw && t.rect.b < n320.handleTop) &&
    !ov320 && n320.scrollW <= n320.iw + 1,
    { rects: n320 && n320.tags.map(t => [t.rect.l, t.rect.r, t.rect.b]), handleTop: n320 && n320.handleTop });
  const s320 = await shot('v28-mobile-320.png'); console.log('SHOT  v28-mobile-320.png  ' + s320 + ' bytes');

  await reset(820, 1180, true); await passGates();
  const t820 = await ev(mobProbe);
  check('通用 · 820 平板：两行文案、三标签、互不压球舞台',
    t820 && t820.sub.display === 'block' && t820.sub.bottom < t820.shellTop &&
    t820.tags.length === 3 && t820.tags.every(t => t.dy >= 5 && t.dy <= 7),
    { subBottom: t820 && t820.sub.bottom, shellTop: t820 && t820.shellTop });
  const s820 = await shot('v28-tablet-820.png'); console.log('SHOT  v28-tablet-820.png  ' + s820 + ' bytes');

  await reset(1023, 768, true); await passGates();
  const n1023 = await ev(mobProbe);
  check('通用 · 1023 横屏：顶部两行文案随 v27 避让一起淡出，不压顶栏/球舞台',
    n1023 && (n1023.wrap.vis === 'hidden' || n1023.wrap.opacity === '0') &&
    n1023.sub.vis === 'hidden', { wrap: n1023 && n1023.wrap, subVis: n1023 && n1023.sub.vis });
  const s1023 = await shot('v28-narrow-1023.png'); console.log('SHOT  v28-narrow-1023.png  ' + s1023 + ' bytes');

  /* ================= 通用回归 ================= */
  console.log('\n=== 通用回归（问答 / 医生 / 预约 / 请假 / 主色） ===');
  await reset(1440, 1000, false); await passGates();
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
  check('验收17 · 全流程 0 未捕获 jsError / console.error', realErrors.length === 0,
    { count: realErrors.length, sample: realErrors.slice(0, 4) });

  const pass = results.filter(r => r.ok).length;
  console.log('\n================ 汇总 ================');
  console.log(`PASS ${pass}/${results.length}`);
  if (pass !== results.length) { console.log('FAILED:'); results.filter(r => !r.ok).forEach(r => console.log('  - ' + r.name)); }
  ws.close();
  setTimeout(() => process.exit(pass === results.length ? 0 : 1), 180);
}
main().catch(e => { console.error('FATAL', e); setTimeout(() => process.exit(1), 180); });
