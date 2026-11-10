/* 校园健康助手 v4「主题框架 + 小球视图 + 双 UI」无头浏览器验收
 * 用法：node e2e-v4.js [URL]   依赖本机 9222 端口的无头 Chrome（CDP）
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
  const navigate = async (url, wait = 7000) => { await send('Page.navigate', { url }); await sleep(wait); };
  const reload = async (wait = 7000) => { await send('Page.reload'); await sleep(wait); };
  const setWidth = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 769 });
    await sleep(700);
  };
  const waitFor = async (expr, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const v = await evalJS(expr);
      if (v) return v;
      await sleep(300);
    }
    return null;
  };
  const sendText = t => evalJS(`(function(){var i=document.querySelector('#userInput');i.value=${JSON.stringify(t)};document.querySelector('#sendBtn').click();return true})()`);
  const waitText = (needle, timeout = 25000) =>
    waitFor(`(function(){var l=document.querySelector('#chatLog');return !!l&&l.innerText.indexOf(${JSON.stringify(needle)})>=0})()`, timeout);
  const clearState = () => evalJS(`(function(){['xiaotong.ui.v1','xiaotong.identity.v1','xiaotong.intro.v1'].forEach(function(k){localStorage.removeItem(k)});return true})()`);
  const resetOrb = () => evalJS(`(function(){var b=document.querySelector('#orbReset');if(b&&!b.hidden)b.click();var p=document.querySelector('#orbDetailBack');if(p&&!document.querySelector('#orbDetail').hidden)p.click();return true})()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await setWidth(1440, 900);
  await navigate(URL_, 2500);
  await clearState();
  await reload();

  /* ============ 验收 1：默认小球视图 + 改名 + 主题 + 介绍不自动弹 ============ */
  const init = await evalJS(`(function(){
    var main=document.querySelector('.orb-main'), lab=document.querySelector('.orb-label'),
        mini=document.querySelector('.orb-mini'), stage=document.querySelector('#orbStage');
    var rect=function(x){var r=x.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left),top:Math.round(r.top)}};
    return {
      title:document.title,
      brand:document.querySelector('.brand-text strong').innerText,
      sub:document.querySelector('.brand-text small').innerText,
      orbShown:!document.querySelector('#orbView').hidden,
      chatHidden:document.querySelector('#chatView').hidden,
      idHidden:document.querySelector('#identityBar').hidden,
      introHidden:document.querySelector('#introModal').hidden,
      activeSeg:(document.querySelector('.ui-seg.active')||{}).innerText,
      segs:[].slice.call(document.querySelectorAll('.ui-seg')).map(function(x){return x.innerText}),
      slots:document.querySelectorAll('.orb-slot').length,
      minis:document.querySelectorAll('.orb-mini').length,
      labels:[].slice.call(document.querySelectorAll('.orb-label')).map(function(x){return x.innerText}),
      mainRect:rect(main), mainBg:getComputedStyle(main).backgroundImage,
      mainShadow:getComputedStyle(main).boxShadow,
      mainTransform:getComputedStyle(main).transform,
      labelLayer:lab.parentNode.className,
      labelFont:[getComputedStyle(lab).fontSize,getComputedStyle(lab).fontWeight,getComputedStyle(lab).color,getComputedStyle(lab).textShadow],
      miniOpacity:getComputedStyle(mini).opacity, miniFilter:getComputedStyle(mini).filter,
      miniTransform:getComputedStyle(mini).transform,
      miniLabelOpacity:getComputedStyle(document.querySelector('.orb-mini-label')).opacity,
      primary:getComputedStyle(document.documentElement).getPropertyValue('--blue').trim(),
      sendBg:getComputedStyle(document.querySelector('#sendBtn')).backgroundColor,
      stage:rect(stage),
      pageH:document.documentElement.scrollHeight,
      scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth,
      ai:document.querySelector('#aiStatus').innerText, mode:document.querySelector('#modeHint').innerText,
      imgs:document.querySelectorAll('img').length,
      scripts:[].slice.call(document.scripts).map(function(s){return s.src}).filter(Boolean)
    };})()`);
  console.log('INIT:', JSON.stringify(init, null, 1));
  check('验收1 · 默认小球视图，三个大球立体感明显、文字清晰可读',
    init.orbShown && init.chatHidden && init.activeSeg === '小球视图' &&
    init.slots === 3 && init.labels.join('/') === '食品健康/作息健康/运动健康' &&
    init.mainRect.w === 150 && init.mainRect.h === 150 &&
    /radial-gradient/.test(init.mainBg) && /inset/.test(init.mainShadow) &&
    init.labelLayer === 'orb-slot' && init.labelFont[0] === '17px' && init.labelFont[1] === '600' &&
    init.labelFont[2] === 'rgb(255, 255, 255)' && /0px 1px 2px/.test(init.labelFont[3]) &&
    init.mainTransform === 'matrix(1, 0, 0, 1, 0, 0)',
    { mainRect: init.mainRect, labels: init.labels, labelFont: init.labelFont });
  check('验收9 · 桌面 1440px 布局正常，无横向滚动条',
    init.scrollWidth <= init.clientWidth + 1 && init.pageH < 1200 && init.stage.w > 1000,
    { scrollWidth: init.scrollWidth, clientWidth: init.clientWidth, pageH: init.pageH, stage: init.stage });
  check('主题框架 · 改名 / 副标题 / 青绿主色 / 圆角字体保留 / 介绍不自动弹',
    /校园健康助手/.test(init.title) && init.brand === '校园健康助手' &&
    init.sub === '校园健康 · 食品 / 作息 / 运动' &&
    init.primary === '#2AA79B' && init.sendBg === 'rgb(42, 167, 155)' &&
    init.introHidden && init.idHidden && init.segs.join('/') === '小球视图/对话视图' &&
    init.imgs === 0 && !init.scripts.some(s => /three/i.test(s)),
    { brand: init.brand, sub: init.sub, primary: init.primary, introHidden: init.introHidden });

  const oldCss = fs.readFileSync('E:/gzkj/backups/xiaotong-v3-2026-11-10/styles.css', 'utf8');
  const newCss = fs.readFileSync('E:/gzkj/xiaotong/styles.css', 'utf8');
  const orbCss = fs.readFileSync('E:/gzkj/xiaotong/orb-view.css', 'utf8');
  const orbCode = orbCss.replace(/\/\*[\s\S]*?\*\//g, ''); // 判据只看代码，不看注释说明
  const deskOld = oldCss.split('/* ===== ≤768px')[0];
  const deskNew = newCss.split('/* ===== ≤768px')[0];
  check('主题框架 · 只换主色（桌面段圆角/间距/字体/结构未动），球体纯 CSS 无 3D 库无外链图片',
    deskOld.split('\n').length === deskNew.split('\n').length &&
    deskOld.replace(/#[0-9a-fA-F]{6}|rgba\([^)]*\)/g, '#C') ===
      deskNew.replace(/#[0-9a-fA-F]{6}|rgba\([^)]*\)/g, '#C')
      .replace('校园健康助手 · 校园健康主题（青绿主色）', '小通同学 · 校园事务一站通') &&
    /--radius: 18px/.test(newCss) &&
    oldCss.match(/font-family:[^;]+/)[0] === newCss.match(/font-family:[^;]+/)[0] &&
    !/rotate3d|matrix3d|perspective|three\.js|url\(/i.test(orbCode),
    { oldLines: oldCss.split('\n').length, newLines: newCss.split('\n').length });

  check('主题框架 · 顶栏「介绍」按钮仍可手动打开', await (async () => {
    await evalJS(`(function(){document.querySelector('#introBtn').click();return true})()`);
    await sleep(200);
    const opened = await evalJS(`(function(){return !document.querySelector('#introModal').hidden})()`);
    await evalJS(`(function(){document.querySelector('#closeIntro').click();return true})()`);
    await sleep(150);
    const closed = await evalJS(`(function(){return document.querySelector('#introModal').hidden})()`);
    return opened && closed;
  })());

  /* ============ 验收 2：背景预览中球 + hover 变清晰 ============ */
  const preview = await evalJS(`(function(){
    var m=[].slice.call(document.querySelectorAll('.orb-slot[data-orb="food"] .orb-mini'));
    return { count:m.length, opacity:m.map(function(x){return getComputedStyle(x).opacity}),
      filter:m.map(function(x){return getComputedStyle(x).filter}),
      scale:m.map(function(x){return getComputedStyle(x).transform}),
      labelOpacity:m.map(function(x){return getComputedStyle(x.querySelector('.orb-mini-label')).opacity}),
      text:m.map(function(x){return x.innerText}) };})()`);
  check('验收2a · 每个大球背后 3 个中球若隐若现、无文字',
    preview.count === 3 && preview.opacity.every(o => o === '0.14') &&
    preview.filter.every(f => /blur\(5px\)/.test(f)) &&
    preview.scale.every(t => /0\.82/.test(t)) &&
    preview.labelOpacity.every(o => o === '0'), preview);
  await evalJS(`(function(){document.querySelector('.orb-slot[data-orb="food"] .orb-main').dispatchEvent(new MouseEvent('mouseenter'));return true})()`);
  await sleep(450);
  const hovered = await evalJS(`(function(){
    var m=[].slice.call(document.querySelectorAll('.orb-slot[data-orb="food"] .orb-mini'));
    return { opacity:m.map(function(x){return getComputedStyle(x).opacity}),
      filter:m.map(function(x){return getComputedStyle(x).filter}),
      scale:m.map(function(x){return getComputedStyle(x).transform}) };})()`);
  check('验收2b · hover 大球后中球变清晰（0.3 / blur2.5 / scale0.9）',
    hovered.opacity.every(o => o === '0.3') &&
    hovered.filter.every(f => /blur\(2\.5px\)/.test(f)) &&
    hovered.scale.every(t => /0\.9, 0, 0, 0\.9/.test(t)), hovered);
  await evalJS(`(function(){document.querySelector('.orb-slot[data-orb="food"] .orb-main').dispatchEvent(new MouseEvent('mouseleave'));return true})()`);
  await sleep(450);
  const unhover = await evalJS(`(function(){var m=document.querySelector('.orb-slot[data-orb="food"] .orb-mini');return getComputedStyle(m).opacity})()`);
  check('验收2c · 鼠标离开后恢复 0.14', unhover === '0.14', { opacity: unhover });

  /* ============ 验收 3：点击分裂 ============ */
  await evalJS(`(function(){document.querySelector('[data-orb-main="food"]').click();return true})()`);
  await sleep(800);
  const split = await evalJS(`(function(){
    var stage=document.querySelector('#orbStage'),
        act=document.querySelector('.orb-slot.active'),
        dim=[].slice.call(document.querySelectorAll('.orb-slot.dimmed')),
        mins=[].slice.call(document.querySelectorAll('.orb-slot.active .orb-mini'));
    return {
      stageSplit:stage.classList.contains('split'),
      activeOrb:act?act.getAttribute('data-orb'):null,
      dimCount:dim.length,
      dim:dim.map(function(s){return {op:getComputedStyle(s.querySelector('.orb-main')).opacity,
        label:getComputedStyle(s.querySelector('.orb-label')).opacity,
        tr:getComputedStyle(s.querySelector('.orb-main')).transform}}),
      pickedTransform:getComputedStyle(act.querySelector('.orb-main')).transform,
      minis:mins.map(function(m){return {
        name:m.getAttribute('data-mod'),
        w:Math.round(m.getBoundingClientRect().width),
        font:getComputedStyle(m).fontSize,
        op:getComputedStyle(m).opacity, filter:getComputedStyle(m).filter,
        tr:getComputedStyle(m).transform,
        dur:getComputedStyle(m).animationDuration, ease:getComputedStyle(m).animationTimingFunction,
        labelOp:getComputedStyle(m.querySelector('.orb-mini-label')).opacity,
        mainColor:m.style.getPropertyValue('--m-main'),
        bg:getComputedStyle(m).backgroundImage}}),
      resetShown:!document.querySelector('#orbReset').hidden,
      pageScroll:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth
    };})()`);
  console.log('SPLIT:', JSON.stringify(split, null, 1));
  check('验收3 · 点「食品健康」：另两球变暗缩小、中球弹出、动画 600ms',
    split.stageSplit && split.activeOrb === 'food' && split.dimCount === 2 &&
    split.dim.every(d => d.op === '0.25' && d.label === '0.25' && /0\.9, 0, 0, 0\.9/.test(d.tr)) &&
    /0\.9, 0, 0, 0\.9/.test(split.pickedTransform) &&
    split.minis.length === 3 &&
    split.minis.every(m => m.op === '1' && /blur\(0px\)|none/.test(m.filter) &&
      m.dur === '0.6s' && m.ease === 'cubic-bezier(0.22, 1, 0.36, 1)' &&
      m.labelOp === '1' && m.w === 100 && m.font === '13px' && /radial-gradient/.test(m.bg)) &&
    split.resetShown && split.pageScroll <= split.clientWidth + 1,
    { dim: split.dim, pickedTransform: split.pickedTransform, minis: split.minis.map(m => ({ name: m.name, op: m.op, dur: m.dur, ease: m.ease })) });
  check('验收3b · 三个中球名称正确、颜色明度依次区分、位置在三个方向',
    split.minis.map(m => m.name).join('/') === '菜品营养/饮食记录/食堂安全' &&
    new Set(split.minis.map(m => m.mainColor)).size === 3 &&
    new Set(split.minis.map(m => m.tr)).size === 3,
    { names: split.minis.map(m => m.name), colors: split.minis.map(m => m.mainColor), transforms: split.minis.map(m => m.tr) });

  /* ============ 验收 4：详情面板 ============ */
  await evalJS(`(function(){document.querySelector('.orb-slot.active [data-mod="菜品营养"]').click();return true})()`);
  await sleep(550);
  const detail = await evalJS(`(function(){
    var p=document.querySelector('#orbDetail'), r=p.getBoundingClientRect();
    return { hidden:p.hidden, open:p.classList.contains('open'),
      w:Math.round(r.width), right:Math.round(r.right), h:Math.round(r.height),
      backdropShown:!document.querySelector('#orbDetailBackdrop').hidden,
      title:document.querySelector('#orbDetailTitle').innerText,
      tag:document.querySelector('.orb-detail-tag').innerText,
      desc:document.querySelector('#orbDetailDesc').innerText,
      backBtn:!!document.querySelector('#orbDetailBack'),
      footBtn:document.querySelector('#orbDetailReturn').innerText };})()`);
  check('验收4 · 点「菜品营养」右侧滑出 480px 详情面板，标题/返回/占位正确',
    !detail.hidden && detail.open && detail.w === 480 && detail.right === 1440 &&
    detail.backdropShown && detail.title === '菜品营养' && detail.tag === '模块开发中' &&
    detail.desc === '每道菜的热量、蛋白质、脂肪、钠含量与搭配建议' &&
    detail.backBtn && detail.footBtn === '返回小球视图', detail);

  /* 九个模块说明逐条核对（点击每个中球会覆盖，这里直接读配置） */
  const descs = await evalJS(`(function(){return [].slice.call(document.querySelectorAll('.orb-mini')).map(function(m){return m.getAttribute('data-mod')+'|'+m.getAttribute('data-desc')})})()`);
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
  check('验收4b · 九个子模块占位说明齐全且逐字一致',
    descs.length === 9 && descs.every(d => { const p = d.split('|'); return EXPECT[p[0]] === p[1]; }),
    { count: descs.length });

  /* ============ 验收 5：返回恢复 ============ */
  await evalJS(`(function(){document.querySelector('#orbDetailBack').click();return true})()`);
  await sleep(750);
  const back = await evalJS(`(function(){
    var st=document.querySelector('#orbStage'), m=document.querySelector('.orb-slot[data-orb="food"] .orb-mini');
    return { detailHidden:document.querySelector('#orbDetail').hidden,
      backdropHidden:document.querySelector('#orbDetailBackdrop').hidden,
      split:st.classList.contains('split'),
      actives:document.querySelectorAll('.orb-slot.active').length,
      dimmed:document.querySelectorAll('.orb-slot.dimmed').length,
      resetHidden:document.querySelector('#orbReset').hidden,
      miniOpacity:getComputedStyle(m).opacity, miniFilter:getComputedStyle(m).filter,
      miniLabel:getComputedStyle(m.querySelector('.orb-mini-label')).opacity,
      mainTransform:getComputedStyle(document.querySelector('[data-orb-main="food"]')).transform,
      bodyOverflow:document.body.style.overflow };})()`);
  check('验收5 · 点返回回到小球视图，中球收起、大球恢复',
    back.detailHidden && back.backdropHidden && !back.split && back.actives === 0 &&
    back.dimmed === 0 && back.resetHidden && back.miniOpacity === '0.14' &&
    /blur\(5px\)/.test(back.miniFilter) && back.miniLabel === '0' &&
    back.mainTransform === 'matrix(1, 0, 0, 1, 0, 0)' && back.bodyOverflow === '', back);
  /* 底部按钮与遮罩关闭也验证 */
  await evalJS(`(function(){document.querySelector('[data-orb-main="sport"]').click();return true})()`);
  await sleep(700);
  await evalJS(`(function(){document.querySelector('.orb-slot.active [data-mod="运动记录"]').click();return true})()`);
  await sleep(300);
  await evalJS(`(function(){document.querySelector('#orbDetailReturn').click();return true})()`);
  await sleep(500);
  const back2 = await evalJS(`(function(){return {hidden:document.querySelector('#orbDetail').hidden,split:document.querySelector('#orbStage').classList.contains('split')}})()`);
  check('验收5b · 底部「返回小球视图」同样恢复状态', back2.hidden && !back2.split, back2);

  /* ============ 验收 6：切到对话视图，原版功能全可用 ============ */
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="chat"]').click();return true})()`);
  await sleep(250);
  const chat = await evalJS(`(function(){return {
    chatShown:!document.querySelector('#chatView').hidden,
    orbHidden:document.querySelector('#orbView').hidden,
    idShown:!document.querySelector('#identityBar').hidden,
    activeSeg:(document.querySelector('.ui-seg.active')||{}).innerText,
    stored:localStorage.getItem('xiaotong.ui.v1'),
    scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth,
    ai:document.querySelector('#aiStatus').innerText, mode:document.querySelector('#modeHint').innerText,
    quick:document.querySelectorAll('.quick-chips button').length,
    faqBtn:document.querySelector('#faqOpenBtn').innerText.replace(/\\n/g,' ') };})()`);
  check('验收6a · 切换即时生效且存 localStorage，对话视图结构完好',
    chat.chatShown && chat.orbHidden && chat.idShown && chat.activeSeg === '对话视图' &&
    chat.stored === 'chat' && chat.quick === 6 && /30 条高频问答/.test(chat.faqBtn) &&
    chat.scrollWidth <= chat.clientWidth + 1, chat);

  await sendText('请假流程');
  const qaOk = await waitText('请假流程怎么走');
  const qa = await evalJS(`(function(){var l=document.querySelector('#chatLog');return {text:l.innerText,cards:l.querySelectorAll('.qa-card').length,steps:l.querySelectorAll('.step').length}})()`);
  check('验收6b · 问「请假流程」有分步骤答案',
    !!qaOk && qa.cards >= 1 && qa.steps >= 3 && /去哪办/.test(qa.text) && /耗时/.test(qa.text),
    { cards: qa.cards, steps: qa.steps });

  const exp = await evalJS(`(function(){var D=window.XIAOTONG_CAMPUS_DATA,Q=window.XiaoTongData;return Q.compute.schedule('我明天有什么课',D.identities[0]).lead})()`);
  await sendText('我明天有什么课');
  const dqOk = await waitText(exp);
  const dq = await evalJS(`(function(){var l=document.querySelector('#chatLog');return {rows:l.querySelectorAll('.data-row').length,leads:[].slice.call(l.querySelectorAll('.data-lead')).map(function(x){return x.innerText})}})()`);
  check('验收6c · 问「我明天有什么课」返回课表且与数据一致',
    !!dqOk && dq.rows >= 1 && dq.leads[dq.leads.length - 1] === exp,
    { expected: exp, rows: dq.rows, leads: dq.leads });

  await evalJS(`(function(){var s=document.querySelector('#identitySelect');s.value='c2';s.dispatchEvent(new Event('change'));return true})()`);
  await sleep(200);
  const ident = await evalJS(`(function(){return {hint:document.querySelector('#identityHint').innerText,stored:localStorage.getItem('xiaotong.identity.v1'),sel:document.querySelector('#identitySelect').value}})()`);
  check('验收6d · 身份切换即时生效并存本地',
    /同学B/.test(ident.hint) && ident.stored === 'c2' && ident.sel === 'c2', ident);

  await evalJS(`(function(){document.querySelector('#faqOpenBtn').click();return true})()`);
  await sleep(250);
  const faq = await evalJS(`(function(){var m=document.querySelector('#faqModal');return {
    shown:!m.hidden, tabs:m.querySelectorAll('.faq-tab').length,
    items:m.querySelectorAll('.faq-q').length,
    visible:m.querySelectorAll('.faq-group.open .faq-q').length,
    cats:[].slice.call(m.querySelectorAll('.faq-tab')).map(function(x){return x.innerText}) };})()`);
  check('验收6e · 30 条问答弹窗能打开（10 类 / 30 条 / 当前 3 条）',
    faq.shown && faq.tabs === 10 && faq.items === 30 && faq.visible === 3, faq);
  await evalJS(`(function(){document.querySelector('#closeFaq').click();return true})()`);

  await sendText('我要请假三天');
  const formOk = await waitFor(`(function(){return !document.querySelector('#leaveModal').hidden})()`, 20000);
  const form = await evalJS(`(function(){var m=document.querySelector('#leaveModal');return {
    name:(m.querySelector('#lvName')||{}).value, sid:(m.querySelector('#lvSid')||{}).value,
    fields:m.querySelectorAll('.field').length, hasReason:!!m.querySelector('#lvReason') };})()`);
  check('验收6f · 请假表单回归（字段与身份联动未改）',
    !!formOk && form.fields === 6 && form.hasReason && form.name === '同学B' && /SIM202602/.test(form.sid), form);
  await evalJS(`(function(){document.querySelector('#leaveModal').hidden=true;document.body.style.overflow='';return true})()`);

  /* ============ 验收 7：切回小球视图 + 刷新保持 ============ */
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="chat"]').click();return true})()`);
  await sleep(150);
  await reload();
  const persisted = await evalJS(`(function(){return {chat:!document.querySelector('#chatView').hidden,stored:localStorage.getItem('xiaotong.ui.v1')}})()`);
  check('验收7a · 视图选择刷新后仍保持（localStorage）', persisted.chat && persisted.stored === 'chat', persisted);
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="orb"]').click();return true})()`);
  await sleep(450);
  const backOrb = await evalJS(`(function(){var s=document.querySelector('#orbStage');return {
    orbShown:!document.querySelector('#orbView').hidden, chatHidden:document.querySelector('#chatView').hidden,
    stored:localStorage.getItem('xiaotong.ui.v1'),
    split:s.classList.contains('split'), slots:document.querySelectorAll('.orb-slot').length,
    miniOpacity:getComputedStyle(document.querySelector('.orb-mini')).opacity,
    scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth };})()`);
  check('验收7b · 切回小球视图状态正常',
    backOrb.orbShown && backOrb.chatHidden && backOrb.stored === 'orb' && !backOrb.split &&
    backOrb.slots === 3 && backOrb.miniOpacity === '0.14' &&
    backOrb.scrollWidth <= backOrb.clientWidth + 1, backOrb);

  /* ============ 验收 8：390px 手机端 ============ */
  await setWidth(390, 844);
  await reload();
  const mob = await evalJS(`(function(){
    var mains=[].slice.call(document.querySelectorAll('.orb-main')),
        labels=[].slice.call(document.querySelectorAll('.orb-label')),
        sw=document.querySelector('.ui-switch');
    var r=mains.map(function(x){var q=x.getBoundingClientRect();return {w:Math.round(q.width),cx:Math.round(q.left+q.width/2),cy:Math.round(q.top+q.height/2)}});
    return { scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth,
      mainRects:r, gaps:[r[1].cy-r[0].cy, r[2].cy-r[1].cy],
      labelFont:getComputedStyle(labels[0]).fontSize,
      switchW:Math.round(sw.getBoundingClientRect().width), switchLines:Math.round(sw.getBoundingClientRect().height/parseFloat(getComputedStyle(sw).lineHeight||22)),
      segs:[].slice.call(document.querySelectorAll('.ui-seg')).map(function(x){return x.innerText}),
      vertical:r.every(function(x){return x.cx===r[0].cx}),
      orbShown:!document.querySelector('#orbView').hidden };})()`);
  check('验收8a · 390px 三球竖排 120px、间距 20px、切换器不换行、无横向溢出',
    mob.orbShown && mob.vertical && mob.mainRects.every(x => x.w === 120) &&
    mob.gaps.every(g => g === 140) && mob.labelFont === '15px' &&
    mob.switchW < 390 && mob.segs.length === 2 &&
    mob.scrollWidth <= mob.clientWidth + 1, mob);

  await evalJS(`(function(){document.querySelector('[data-orb-main="food"]').click();return true})()`);
  await sleep(800);
  const mobSplit = await evalJS(`(function(){
    var mins=[].slice.call(document.querySelectorAll('.orb-slot.active .orb-mini'));
    return { count:mins.length,
      rects:mins.map(function(m){var r=m.getBoundingClientRect();return {name:m.getAttribute('data-mod'),w:Math.round(r.width),left:Math.round(r.left),right:Math.round(r.right),top:Math.round(r.top),bottom:Math.round(r.bottom)}}),
      opacity:mins.map(function(m){return getComputedStyle(m).opacity}),
      pageScroll:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth,
      activeH:Math.round(document.querySelector('.orb-slot.active').getBoundingClientRect().height) };})()`);
  check('验收8b · 手机分裂后中球呈下方三角、84px、不超出屏幕',
    mobSplit.count === 3 && mobSplit.rects.every(r => r.w === 84 && r.left >= 0 && r.right <= 390) &&
    new Set(mobSplit.rects.map(r => r.top)).size >= 2 &&
    mobSplit.opacity.every(o => o === '1') && mobSplit.activeH >= 270 &&
    mobSplit.pageScroll <= mobSplit.clientWidth + 1, mobSplit);

  await evalJS(`(function(){document.querySelector('.orb-slot.active [data-mod="饮食记录"]').click();return true})()`);
  await sleep(550);
  const mobDetail = await evalJS(`(function(){var p=document.querySelector('#orbDetail'),r=p.getBoundingClientRect();return {
    w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left),open:p.classList.contains('open'),
    title:document.querySelector('#orbDetailTitle').innerText,
    desc:document.querySelector('#orbDetailDesc').innerText,
    back:!!document.querySelector('#orbDetailBack'),
    scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth };})()`);
  check('验收8c · 手机详情面板全屏滑出，标题与返回按钮正确',
    mobDetail.w === 390 && mobDetail.left === 0 && mobDetail.h === 844 && mobDetail.open &&
    mobDetail.title === '饮食记录' && mobDetail.desc === '今日三餐记录与营养摄入进度' &&
    mobDetail.back && mobDetail.scrollWidth <= mobDetail.clientWidth + 1, mobDetail);
  await evalJS(`(function(){document.querySelector('#orbDetailBackdrop').click();return true})()`);
  await sleep(600);
  const mobBack = await evalJS(`(function(){return {hidden:document.querySelector('#orbDetail').hidden,split:document.querySelector('#orbStage').classList.contains('split')}})()`);
  check('验收8d · 手机点遮罩返回，状态恢复', mobBack.hidden && !mobBack.split, mobBack);

  /* 手机对话视图切换回归 */
  await evalJS(`(function(){document.querySelector('.ui-seg[data-view="chat"]').click();return true})()`);
  await sleep(200);
  const mobChat = await evalJS(`(function(){return {shown:!document.querySelector('#chatView').hidden,scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth,quickRows:new Set([].slice.call(document.querySelectorAll('.quick-chips button')).map(function(b){return Math.round(b.getBoundingClientRect().top)})).size}})()`);
  check('验收8e · 390px 对话视图无回归（两行快捷按钮、无溢出）',
    mobChat.shown && mobChat.quickRows === 2 && mobChat.scrollWidth <= mobChat.clientWidth + 1, mobChat);

  /* ============ 验收 10：无 JS 异常 ============ */
  check('验收10 · 全流程无 jsError', jsErrors.length === 0, { jsErrors });

  const pass = results.filter(r => r.ok).length;
  console.log('\n===== SUMMARY =====');
  console.log('TOTAL ' + results.length + ' PASS ' + pass + ' FAIL ' + (results.length - pass));
  if (pass !== results.length) console.log('FAILED:\n' + results.filter(r => !r.ok).map(r => ' - ' + r.name).join('\n'));
  ws.close();
  if (pass !== results.length) process.exitCode = 1;
}
main().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
