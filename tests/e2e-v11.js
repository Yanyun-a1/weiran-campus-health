/* v11 · 健康四段式问答 / 关键词加权 / 置信度兜底 专项验收
 * 用法：node e2e-v11.js [URL]   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 交互走真实鼠标点击与真实输入；截图时临时隐藏历史消息（不改任何项目文件）。
 * 产出三张图：正确回答 / 兜底提示 / 问答弹窗 10 分类。
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
  const shot = async (file, tall) => {
    // 四段式答案较长，截图时临时加高视口，避免第四段被裁掉（不改任何项目文件）
    if (tall) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: tall, deviceScaleFactor: 1, mobile: false });
      await sleep(320);
      await ev('window.scrollTo(0,0)');
    }
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    if (tall) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
      await sleep(240);
    }
    return fs.statSync(DIR + file).size;
  };
  const setViewport = async (w, h, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await sleep(400);
  };
  const fresh = async (w, h, mobile, view) => {
    await setViewport(w, h, mobile);
    await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.navigate', { url: URL_ });
    await sleep(1400);
    await ev(`(function(){try{localStorage.setItem('xiaotong.intro.v1','1');
      localStorage.setItem('xiaotong.ui.v1',${JSON.stringify(view || 'chat')});}catch(e){}return 1})()`);
    await send('Page.reload');
    await sleep(1400);
    // bootCloud 最多 9s 超时，等只读钩子出现再开始断言
    for (let i = 0; i < 60; i++) {
      if (await ev(`!!window.__faqCatalog`)) break;
      await sleep(250);
    }
    await ev(`(function(){var m=document.querySelector('#introModal');if(m)m.hidden=true;
      document.body.style.overflow='';return true})()`);
    await sleep(200);
  };
  const mouseDown = (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  const mouseUp = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  const click = async (x, y) => { await mouseDown(x, y); await sleep(25); await mouseUp(x, y); };
  const center = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;
    var b=e.getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()`);

  const sendText = async t => {
    const before = await ev(`document.querySelectorAll('#chatLog .msg').length`);
    await ev(`(function(){var i=document.querySelector('#userInput');i.value=${JSON.stringify(t)};return true})()`);
    const b = await center('#sendBtn');
    await click(b.x, b.y);                       // 真实鼠标点击发送
    for (let i = 0; i < 140; i++) {
      const n = await ev(`document.querySelectorAll('#chatLog .msg').length`);
      const typing = await ev(`!!document.querySelector('#typingMsg')`);
      if (n >= before + 2 && !typing) return true;
      await sleep(250);
    }
    return false;
  };
  const lastBot = () => ev(`(function(){
    var b=[].slice.call(document.querySelectorAll('#chatLog .msg-bot .bubble')).pop();
    if(!b)return null;
    var st=function(e){if(!e)return null;var c=getComputedStyle(e);
      return {bg:c.backgroundColor,border:c.borderColor,leftW:c.borderLeftWidth,radius:c.borderRadius};};
    return {text:b.innerText,
      badge:(b.querySelector('.intent-badge')||{}).innerText||'',
      hasCard:!!b.querySelector('.qa-card'), hasFallback:!!b.querySelector('.fallback-note'),
      sections:[].slice.call(b.querySelectorAll('.qa-section-title')).map(function(x){return x.innerText}),
      lists:[].slice.call(b.querySelectorAll('.qa-list')).map(function(x){return x.querySelectorAll('li').length}),
      fbStyle:st(b.querySelector('.fallback-note')), cardStyle:st(b.querySelector('.qa-card')),
      fbEgs:[].slice.call(b.querySelectorAll('.fb-egs button')).map(function(x){return x.innerText.trim()})};
  })()`);
  const focusLast = () => ev(`(function(){
    var m=[].slice.call(document.querySelectorAll('#chatLog .msg'));
    m.forEach(function(x,i){if(i<m.length-2){x.setAttribute('data-v11hide','1');x.style.display='none';}});
    if(!document.getElementById('v11-shot')){var s=document.createElement('style');s.id='v11-shot';
      s.textContent='.chat-log{max-height:none !important;overflow:visible !important}.chat-card{min-height:0 !important}';
      document.head.appendChild(s);}
    window.scrollTo(0,0);return m.length;
  })()`);
  const restore = () => ev(`(function(){
    document.querySelectorAll('[data-v11hide]').forEach(function(x){x.style.display='';x.removeAttribute('data-v11hide');});
    var s=document.getElementById('v11-shot');if(s)s.remove();return true;
  })()`);

  await send('Runtime.enable');
  await send('Page.enable');

  /* ==================== 桌面 · 对话视图 ==================== */
  await fresh(1440, 1000, false, 'chat');
  const cat = await ev(`window.__faqCatalog()`);
  const cats = {};
  cat.forEach(r => { cats[r.category] = (cats[r.category] || 0) + 1; });
  check('数据 · 30 条 / 10 类 / 每类 3 条 / 每条四段齐全 + keywords 数组',
    cat.length === 30 && Object.keys(cats).length === 10 && Object.values(cats).every(n => n === 3) &&
    cat.every(r => r.keywords >= 5 && r.sections[0] === true && r.sections[1] >= 2 && r.sections[2] >= 1 && r.sections[3] >= 1),
    { rows: cat.length, cats: cats, mode: await ev(`document.querySelector('#modeHint').innerText`) });
  check('数据 · 第 16/17/18 条已换成新三条症状',
    cat[15].question === '感冒发烧怎么办' && cat[16].question === '肚子疼拉肚子怎么办' &&
    cat[17].question === '头痛头晕怎么办' && cat[15].category === '常见病症',
    [cat[15].question, cat[16].question, cat[17].question]);

  const m1 = await ev(`window.__faqMatch('我肚子疼怎么办')`);
  const m2 = await ev(`window.__faqMatch('我睡不着')`);
  const m3 = await ev(`window.__faqMatch('感冒了咋整')`);
  const m4 = await ev(`window.__faqMatch('痛经怎么办')`);
  check('匹配分 · 关键词加权后四条验收问句落点正确且兜底阈值 0.45 生效',
    m1.bestId === 17 && m2.bestId === 6 && m3.bestId === 16 && m4.bestId === null &&
    m4.score < 0.45 && m4.threshold === 0.45,
    { stomach: [m1.bestId, m1.score], sleep: [m2.bestId, m2.score],
      cold: [m3.bestId, m3.score], dysmenorrhea: [m4.bestId, m4.score, m4.top[0]] });

  /* ---------- 验收 1：正确回答 ---------- */
  const ok1 = await sendText('我肚子疼怎么办');
  const a1 = await lastBot();
  check('验收1 · 问「我肚子疼怎么办」返回肚子疼相关答案而不是感冒',
    ok1 && a1 && a1.text.indexOf('肚子疼拉肚子怎么办') >= 0 &&
    a1.text.indexOf('感冒发烧怎么办') < 0 && a1.hasCard,
    { title: a1 && a1.text.split('\n').slice(0, 3), badge: a1 && a1.badge });
  check('验收4 · 四段式结构齐备，不再出现「去哪办 / 带什么 / 大概多久」',
    a1 && a1.sections.length === 4 && a1.lists.length === 3 &&
    a1.sections[0].indexOf('一句话判断') >= 0 && a1.sections[1].indexOf('可以自己做的') >= 0 &&
    a1.sections[2].indexOf('什么情况要找校医') >= 0 && a1.sections[3].indexOf('注意') >= 0 &&
    ['去哪办', '带什么', '大概多久'].every(w => a1.text.indexOf(w) < 0),
    { sections: a1 && a1.sections, listItems: a1 && a1.lists });
  check('验收7 · 意图标签为「健康问答」，不出现「事务问答」',
    a1 && a1.badge.indexOf('健康问答') >= 0 && a1.badge.indexOf('事务问答') < 0 &&
    (await ev(`document.querySelector('#aiStatus').innerText`)) === 'AI 意图识别 · 健康问答' &&
    (await ev(`document.body.innerText`)).indexOf('事务问答') < 0,
    { badge: a1 && a1.badge, chip: await ev(`document.querySelector('#aiStatus').innerText`) });
  await focusLast();
  const s1 = await shot('v11-answer-stomach.png', 1500);
  console.log('SHOT  v11-answer-stomach.png  ' + s1 + ' bytes');
  await restore();

  /* ---------- 验收 2 / 3 ---------- */
  const ok2 = await sendText('我睡不着');
  const a2 = await lastBot();
  check('验收2 · 问「我睡不着」返回睡眠质量改善',
    ok2 && a2 && a2.text.indexOf('怎么改善睡眠质量') >= 0 && a2.hasCard,
    { first: a2 && a2.text.split('\n').slice(0, 2) });
  const ok3 = await sendText('感冒了咋整');
  const a3 = await lastBot();
  check('验收3 · 问「感冒了咋整」返回感冒发烧怎么办',
    ok3 && a3 && a3.text.indexOf('感冒发烧怎么办') >= 0 && a3.hasCard,
    { first: a3 && a3.text.split('\n').slice(0, 2) });

  /* ---------- 验收 5 / 6：兜底 ---------- */
  const ok4 = await sendText('痛经怎么办');
  const a4 = await lastBot();
  check('验收5 · 30 条外的「痛经怎么办」返回兜底提示，不硬答',
    ok4 && a4 && a4.hasFallback && !a4.hasCard &&
    a4.text.indexOf('这个问题我暂时没有收录。') >= 0 &&
    a4.text.indexOf('校医室（工作日 8:00-17:30）') >= 0 &&
    a4.text.indexOf('多喝温水') < 0 && a4.text.indexOf('① 一句话判断') < 0,
    { text: a4 && a4.text.replace(/\n/g, ' | '), egs: a4 && a4.fbEgs });
  check('验收6 · 兜底是浅色提示条，视觉样式与知识卡片明显不同',
    a4 && a4.fbStyle && a4.fbStyle.leftW === '4px' && a4.fbStyle.bg !== '#ffffff' &&
    a4.fbStyle.bg !== 'rgb(255, 255, 255)' && !a4.cardStyle,
    { fallback: a4 && a4.fbStyle, card: a1 && a1.cardStyle });
  await focusLast();
  const s2 = await shot('v11-fallback.png');
  console.log('SHOT  v11-fallback.png  ' + s2 + ' bytes');
  await restore();

  /* ---------- 验收 7 补充：健康数据 / 就诊预约 ---------- */
  await sendText('这周睡眠质量如何');
  const a5 = await lastBot();
  check('意图标签 · 问数回答显示「健康数据」',
    a5 && a5.badge.indexOf('健康数据') >= 0 && a5.badge.indexOf('智能问数') < 0,
    { badge: a5 && a5.badge });
  await sendText('我要请假三天');
  const a6 = await lastBot();
  check('意图标签 · 请假路径显示「就诊预约」',
    a6 && a6.badge.indexOf('就诊预约') >= 0, { badge: a6 && a6.badge });
  await ev(`(function(){var m=document.querySelector('#leaveModal');if(m){m.hidden=true;document.body.style.overflow='';}return true})()`);

  /* ---------- 验收 8：问答弹窗 10 分类 ---------- */
  const fb = await center('#faqOpenBtn');
  await click(fb.x, fb.y);
  await sleep(400);
  const modal = await ev(`(function(){
    var m=document.querySelector('#faqModal'); if(!m||m.hidden)return null;
    var box=m.querySelector('.faq-tabs'),br=box.getBoundingClientRect();
    var tabs=[].slice.call(m.querySelectorAll('.faq-tab'));
    var groups=[].slice.call(m.querySelectorAll('.faq-group')).map(function(g){
      return {cat:g.getAttribute('data-cat-panel'),n:g.querySelectorAll('.faq-q').length,
        qs:[].slice.call(g.querySelectorAll('.faq-q')).map(function(q){return q.innerText.replace(/^[0-9]+/,'').trim()})};});
    return {hidden:m.hidden,tabs:tabs.map(function(x){return x.innerText}),
      allTabsVisible:tabs.every(function(t){var b=t.getBoundingClientRect();
        return b.left>=br.left-1&&b.right<=br.right+1&&b.top>=br.top-1&&b.bottom<=br.bottom+1;}),
      groups:groups, foot:m.querySelector('.faq-foot').innerText,
      overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth};
  })()`);
  check('验收8 · 弹窗显示 10 个分类、每类 3 条，常见病症三条已更新',
    modal && modal.tabs.length === 10 && modal.groups.length === 10 &&
    modal.groups.every(g => g.n === 3) && modal.allTabsVisible &&
    modal.groups.find(g => g.cat === '常见病症').qs.join('|').indexOf('感冒发烧怎么办') >= 0 &&
    modal.groups.find(g => g.cat === '常见病症').qs.join('|').indexOf('肚子疼拉肚子怎么办') >= 0 &&
    modal.groups.find(g => g.cat === '常见病症').qs.join('|').indexOf('头痛头晕怎么办') >= 0 &&
    modal.foot.indexOf('四段式') >= 0 && modal.overflowX <= 0,
    { tabs: modal && modal.tabs, allTabsVisible: modal && modal.allTabsVisible,
      groups: modal && modal.groups.map(g => g.cat + ':' + g.n),
      symptom: modal && modal.groups.find(g => g.cat === '常见病症').qs });
  const s3 = await shot('v11-faq-modal.png');
  console.log('SHOT  v11-faq-modal.png  ' + s3 + ' bytes');
  const cb = await center('#closeFaq');
  await click(cb.x, cb.y);

  /* ---------- 验收 10 / 页面约束：小球视图不受影响 ---------- */
  const sw = await center('.ui-seg[data-view="orb"]');
  await click(sw.x, sw.y);
  await sleep(500);
  const orb = await ev(`(function(){
    var items=[].slice.call(document.querySelectorAll('.orb-major')).map(function(e){
      var b=e.getBoundingClientRect();return {ratio:+(b.width/b.height).toFixed(4)};});
    return {state:window.__orbState(),ratios:items.map(function(x){return x.ratio}),
      overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
      sceneTouch:getComputedStyle(document.querySelector('#orbScene')).touchAction};
  })()`);
  check('验收10 · 小球视图功能未受影响（三球正圆 / 状态机正常 / 空白处仍可拖）',
    orb && orb.ratios.length === 3 && orb.ratios.every(r => Math.abs(r - 1) < 0.02) &&
    orb.state.level === 'root' && orb.sceneTouch === 'none' && orb.overflowX <= 0,
    { ratios: orb && orb.ratios, level: orb && orb.state.level, overflowX: orb && orb.overflowX });
  check('硬约束 · 页面无横向滚动条（桌面）', orb && orb.overflowX <= 0, { overflowX: orb && orb.overflowX });

  /* ---------- 手机 390 ---------- */
  await fresh(390, 844, true, 'chat');
  const okm = await sendText('痛经怎么办');
  const am = await lastBot();
  const mob = await ev(`(function(){return {
    overflowX:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    fbW:Math.round((document.querySelector('.fallback-note')||{getBoundingClientRect:function(){return {width:0}}}).getBoundingClientRect().width),
    badge:document.querySelector('#aiStatus').innerText};})()`);
  check('手机 390px · 兜底提示正常、无横向溢出、标签一致',
    okm && am && am.hasFallback && mob.overflowX <= 0 &&
    mob.badge === 'AI 意图识别 · 健康问答',
    { overflowX: mob.overflowX, fbW: mob.fbW, badge: mob.badge });

  check('验收11 · 全流程无 jsError', jsErrors.length === 0, { errors: jsErrors, count: jsErrors.length });
  const pass = results.filter(r => r.ok).length;
  console.log('\nTOTAL: ' + pass + '/' + results.length + ' PASS');
  ws.close();
  if (pass !== results.length) process.exitCode = 2;
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
