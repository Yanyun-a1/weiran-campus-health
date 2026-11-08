/* 「小通同学」v3「弹窗引导 + 干净主界面」无头浏览器验收脚本
 * 用法：node e2e-v3.js [URL]   依赖本机 9222 端口的无头 Chrome（CDP）
 */
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
  const navigate = async (url, wait = 7500) => { await send('Page.navigate', { url }); await sleep(wait); };
  const reload = async (wait = 7500) => { await send('Page.reload'); await sleep(wait); };
  const setWidth = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 769 });
    await sleep(700);
  };
  const clearIntro = () => evalJS(`(function(){localStorage.removeItem('xiaotong.intro.v1');return true})()`);
  const closeAll = () => evalJS(`(function(){
    ['#introModal','#faqModal','#leaveModal'].forEach(function(s){var m=document.querySelector(s);if(m)m.hidden=true});
    document.body.style.overflow='';return true})()`);

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await setWidth(1440, 900);

  // 首次访问：清掉所有本地状态后刷新
  await navigate(URL_, 2500);
  await evalJS(`(function(){localStorage.removeItem('xiaotong.intro.v1');localStorage.removeItem('xiaotong.identity.v1');return true})()`);
  await reload();

  /* ================= 验收 1：1440px 首次访问自动弹、内容完整 ================= */
  const intro = await evalJS(`(function(){
    var m=document.querySelector('#introModal'), d=document.querySelector('.intro-dialog'),
        s=document.querySelector('.intro-scroll'), b=document.querySelector('#closeIntro'),
        cards=[].slice.call(document.querySelectorAll('.evi-card'));
    var rect=function(x){var r=x.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),top:Math.round(r.top),bottom:Math.round(r.bottom)}};
    return {
      autoOpen:!m.hidden,
      backdrop:getComputedStyle(m).backgroundColor,
      dialog:rect(d), maxAllowedH:Math.round(window.innerHeight*.88), maxAllowedW:Math.round(window.innerWidth*.92),
      scrollH:s.scrollHeight, clientH:s.clientHeight,
      closeBtn:rect(b), closePosition:getComputedStyle(b).position,
      closeParent:b.parentNode.className,
      heroTitle:document.querySelector('#heroTitle').innerText,
      lead:document.querySelector('.hero-lead').innerText,
      leadLines:Math.round(document.querySelector('.hero-lead').getBoundingClientRect().height/parseFloat(getComputedStyle(document.querySelector('.hero-lead')).lineHeight)),
      ctas:[].slice.call(document.querySelectorAll('[data-demo]')).map(function(x){return x.innerText}),
      visual:!!document.querySelector('.hero-visual .one-box'),
      eviCards:cards.length, eviH:cards.map(function(c){return Math.round(c.getBoundingClientRect().height)}),
      eviClipped:cards.map(function(c){return c.scrollWidth>c.clientWidth+1||c.scrollHeight>c.clientHeight+1}),
      eviText:cards.map(function(c){return c.innerText.replace(/\\n/g,' | ')}),
      note:document.querySelector('.evi-note').innerText,
      caps:[].slice.call(document.querySelectorAll('.intro-cap')).map(function(c){return c.innerText.replace(/\\n/g,' | ')}),
      foot:document.querySelector('.intro-foot').innerText,
      gridCols:getComputedStyle(document.querySelector('.intro-grid')).gridTemplateColumns
    };
  })()`);
  console.log('INTRO:', JSON.stringify(intro, null, 1));
  check('验收1 · 1440px 首次访问自动弹出引导弹窗，内容完整无截断',
    intro.autoOpen && intro.dialog.w === 880 && intro.dialog.w <= intro.maxAllowedW &&
    intro.dialog.h <= intro.maxAllowedH && intro.scrollH <= intro.clientH + 1 &&
    /15, 23, 42/.test(intro.backdrop) &&
    /办一件事/.test(intro.heroTitle) && /对话框/.test(intro.lead) && intro.leadLines <= 3 &&
    intro.ctas.length === 2 && intro.visual && intro.eviCards === 3 && intro.caps.length === 3 &&
    /模拟数据/.test(intro.foot) && intro.eviClipped.every(x => !x),
    { dialog: intro.dialog, scrollH: intro.scrollH, clientH: intro.clientH, leadLines: intro.leadLines, ctas: intro.ctas });
  check('验收1b · 遮罩色 / 关闭按钮 44×44 固定 / 数据卡 ≤80px / 数值来源文案',
    intro.closeBtn.w === 44 && intro.closeBtn.h === 44 && intro.closePosition === 'absolute' &&
    /intro-dialog/.test(intro.closeParent) && intro.eviH.every(h => h <= 80) &&
    /41/.test(intro.eviText[0]) && /1407/.test(intro.eviText[0]) &&
    /58\.51%/.test(intro.eviText[1]) && /2895/.test(intro.eviText[1]) &&
    /67\.63%/.test(intro.eviText[2]) && /2895/.test(intro.eviText[2]) &&
    /第三方调查 · 本校抽样验证中/.test(intro.note) &&
    /分步骤/.test(intro.caps[0]) && /请假条/.test(intro.caps[1]) && /课表/.test(intro.caps[2]),
    { closeBtn: intro.closeBtn, eviH: intro.eviH, note: intro.note });
  check('验收1c · 桌面弹窗上半两栏（约 55% / 45%）',
    intro.gridCols.split(' ').length === 2 &&
    Math.abs(parseFloat(intro.gridCols.split(' ')[0]) / (parseFloat(intro.gridCols.split(' ')[0]) + parseFloat(intro.gridCols.split(' ')[1])) - 0.55) < 0.04,
    { gridCols: intro.gridCols });

  /* ================= 验收 2 / 3：关闭后主界面结构与高度 ================= */
  await evalJS(`document.querySelector('#closeIntro').click(); true`);
  const shell = await evalJS(`(function(){
    var pageKids=[].slice.call(document.querySelector('.page').children).map(function(x){return x.tagName.toLowerCase()+'.'+x.className});
    var mainKids=[].slice.call(document.querySelectorAll('main > *')).map(function(x){return x.tagName.toLowerCase()+'.'+x.className});
    var inp=document.querySelector('#userInput').getBoundingClientRect();
    var card=document.querySelector('.chat-card').getBoundingClientRect();
    var ws=document.querySelector('.workspace').getBoundingClientRect();
    return {
      introHidden:document.querySelector('#introModal').hidden,
      pageKids:pageKids, mainKids:mainKids,
      bodyOverflow:document.body.style.overflow,
      legacy:{hero:document.querySelectorAll('.hero').length,caps:document.querySelectorAll('.caps,.cap-card').length,side:document.querySelectorAll('.side-card').length},
      pageH:document.documentElement.scrollHeight, innerH:window.innerHeight,
      scrollWidth:document.documentElement.scrollWidth, clientWidth:document.documentElement.clientWidth, innerWidth:window.innerWidth,
      inputBottom:Math.round(inp.bottom), cardH:Math.round(card.height),
      cardW:Math.round(card.width), wsW:Math.round(ws.width),
      hint:document.querySelector('.composer-hint').innerText.replace(/\\n/g,' | '),
      faqBtn:document.querySelector('#faqOpenBtn').innerText.replace(/\\n/g,' | '),
      quickTop:[].slice.call(document.querySelectorAll('.quick-chips button')).map(function(b){return Math.round(b.getBoundingClientRect().top)})
    };
  })()`);
  console.log('SHELL:', JSON.stringify(shell, null, 1));
  check('验收2 · 关闭后主界面只有顶栏 / 身份 / 对话 / 页脚，能力卡与右侧目录已删除',
    shell.introHidden && shell.pageKids.length === 3 &&
    /header\.topbar/.test(shell.pageKids[0]) && /identity-bar/.test(shell.pageKids[1]) && /main/.test(shell.pageKids[2]) &&
    shell.mainKids.length === 2 && /section\.workspace/.test(shell.mainKids[0]) && /footer\.footer/.test(shell.mainKids[1]) &&
    shell.legacy.hero === 0 && shell.legacy.caps === 0 && shell.legacy.side === 0 && shell.bodyOverflow === '',
    { pageKids: shell.pageKids, mainKids: shell.mainKids, legacy: shell.legacy });
  check('验收3 · 页面总高 ≤1.5 屏，输入框在首屏内可见，对话占满内容区',
    shell.pageH <= shell.innerH * 1.5 && shell.inputBottom <= shell.innerH &&
    Math.abs(shell.cardW - shell.wsW) <= 2 && shell.cardH >= 520 &&
    shell.scrollWidth <= shell.clientWidth + 1,
    { pageH: shell.pageH, innerH: shell.innerH, inputBottom: shell.inputBottom, cardH: shell.cardH, cardW: shell.cardW, wsW: shell.wsW });
  check('验收3b · 桌面快捷按钮一行、输入区上方有「30 条高频问答」入口',
    new Set(shell.quickTop).size === 1 && /30 条高频问答 · 点开看看/.test(shell.faqBtn) &&
    /Enter 发送 · Shift \+ Enter 换行/.test(shell.hint),
    { quickRows: new Set(shell.quickTop).size, faqBtn: shell.faqBtn, hint: shell.hint });

  // 刷新后不再自动弹
  await reload(5000);
  const afterReload = await evalJS(`({hidden:document.querySelector('#introModal').hidden, seen:localStorage.getItem('xiaotong.intro.v1')})`);
  check('弹窗行为 · 关闭后刷新不再自动弹（localStorage 记录）',
    afterReload.hidden === true && afterReload.seen === '1', afterReload);

  /* ================= 验收 4：顶栏「介绍」重新打开 + 遮罩关闭 ================= */
  await evalJS(`document.querySelector('#introBtn').click(); true`);
  const reopened = await evalJS(`!document.querySelector('#introModal').hidden`);
  await evalJS(`document.querySelector('#introModal').click(); true`); // 点遮罩
  const closedByMask = await evalJS(`document.querySelector('#introModal').hidden`);
  check('验收4 · 顶栏「介绍」可重新打开，点击遮罩可关闭',
    reopened === true && closedByMask === true, { reopened, closedByMask });

  /* ================= 对话辅助 ================= */
  async function ask(text) {
    const before = await evalJS(`document.querySelectorAll('#chatLog .msg-bot').length`);
    await evalJS(`(function(){var i=document.querySelector('#userInput');i.value=${JSON.stringify(text)};document.querySelector('#sendBtn').click();return true})()`);
    for (let k = 0; k < 100; k++) {
      const n = await evalJS(`document.querySelectorAll('#chatLog .msg-bot').length`);
      if (n > before) break;
      await sleep(250);
    }
    for (let k = 0; k < 100; k++) {
      const done = await evalJS(`!document.querySelector('#typingMsg') && !document.querySelector('#sendBtn').disabled`);
      if (done) break;
      await sleep(250);
    }
    return await evalJS(`(function(){
      var b=[].slice.call(document.querySelectorAll('.msg-bot .bubble')).pop();
      if(!b) return {empty:true};
      return {
        badge:b.querySelector('.intent-badge')?b.querySelector('.intent-badge').innerText:'',
        qaTitle:b.querySelector('.qa-title')?b.querySelector('.qa-title').innerText:'',
        steps:b.querySelectorAll('.step').length,
        hasDataCard:!!b.querySelector('.data-card'),
        lead:b.querySelector('.data-lead')?b.querySelector('.data-lead').innerText:'',
        context:b.querySelector('.data-context')?b.querySelector('.data-context').innerText:'',
        dataRows:[].slice.call(b.querySelectorAll('.data-row')).map(function(r){return r.innerText.replace(/\\n/g,' ')}),
        tableRows:[].slice.call(b.querySelectorAll('.data-table tbody tr')).map(function(r){return [].slice.call(r.querySelectorAll('td')).map(function(td){return td.innerText})}),
        text:b.innerText.slice(0,400),
        lastUser:[].slice.call(document.querySelectorAll('.msg-user .bubble')).pop().innerText,
        modalOpen:!document.querySelector('#leaveModal').hidden
      };
    })()`);
  }
  const setIdentity = id => evalJS(`(function(){var s=document.querySelector('#identitySelect');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change'));return s.value})()`);
  async function waitIdle() {
    for (let k = 0; k < 120; k++) {
      const idle = await evalJS(`!document.querySelector('#typingMsg') && !document.querySelector('#sendBtn').disabled`);
      if (idle) return true;
      await sleep(250);
    }
    return false;
  }

  /* ================= 验收 5：CTA 关闭弹窗并自动发送 ================= */
  await evalJS(`document.querySelector('#introBtn').click(); true`);
  await evalJS(`(function(){var b=[].slice.call(document.querySelectorAll('[data-demo]')).filter(function(x){return x.getAttribute('data-demo')==='请假流程'})[0];b.click();return true})()`);
  await waitIdle();
  const cta = await evalJS(`(function(){
    var b=[].slice.call(document.querySelectorAll('.msg-bot .bubble')).pop();
    return {
      introHidden:document.querySelector('#introModal').hidden,
      lastUser:[].slice.call(document.querySelectorAll('.msg-user .bubble')).pop().innerText,
      badge:b.querySelector('.intent-badge')?b.querySelector('.intent-badge').innerText:'',
      qaTitle:b.querySelector('.qa-title')?b.querySelector('.qa-title').innerText:'',
      steps:b.querySelectorAll('.step').length
    };
  })()`);
  console.log('CTA:', JSON.stringify(cta, null, 1));
  check('验收5 · 点「试试问一句」→ 弹窗关闭且「请假流程」自动发出并显示答案',
    cta.introHidden && cta.lastUser === '请假流程' && /事务问答/.test(cta.badge) && cta.steps === 3,
    cta);

  // 另一个 CTA：自动办请假
  await evalJS(`document.querySelector('#introBtn').click(); true`);
  await evalJS(`(function(){var b=[].slice.call(document.querySelectorAll('[data-demo]')).filter(function(x){return x.getAttribute('data-demo')==='我要请假三天'})[0];b.click();return true})()`);
  await waitIdle();
  const cta2 = await evalJS(`(function(){return {
    introHidden:document.querySelector('#introModal').hidden,
    leaveOpen:!document.querySelector('#leaveModal').hidden,
    lastUser:[].slice.call(document.querySelectorAll('.msg-user .bubble')).pop().innerText,
    fields:document.querySelectorAll('#leaveForm .field > label').length
  }})()`);
  check('验收5b · 点「试试办一件」→ 弹窗关闭且自动进入请假表单（6 字段）',
    cta2.introHidden && cta2.leaveOpen && cta2.lastUser === '我要请假三天' && cta2.fields === 6, cta2);
  await closeAll();

  /* ================= 验收 6：30 条问答弹窗 ================= */
  await evalJS(`document.querySelector('#faqOpenBtn').click(); true`);
  const faqOpen = await evalJS(`(function(){
    var vis=[].slice.call(document.querySelectorAll('.faq-group.open .faq-q'));
    return {
      open:!document.querySelector('#faqModal').hidden,
      tabs:document.querySelectorAll('.faq-tab').length,
      totalItems:document.querySelectorAll('[data-faq]').length,
      panels:document.querySelectorAll('.faq-group').length,
      visibleItems:vis.length,
      activeTab:document.querySelector('.faq-tab.active').innerText,
      questions:vis.map(function(b){return b.querySelector('span:nth-child(2)').innerText}),
      matchesLocal:[].slice.call(document.querySelectorAll('[data-faq]')).every(function(b){
        var id=Number(b.getAttribute('data-faq'));var f=window.CAMPUS_FAQS.filter(function(x){return Number(x.id)===id})[0];
        return f && b.innerText.indexOf(f.question)>=0;
      })
    };
  })()`);
  console.log('FAQ OPEN:', JSON.stringify(faqOpen, null, 1));
  check('验收6a · 「30 条高频问答」弹窗：10 个分类标签 + 当前分类 3 条，30 条内容未改',
    faqOpen.open && faqOpen.tabs === 10 && faqOpen.totalItems === 30 && faqOpen.panels === 10 &&
    faqOpen.visibleItems === 3 && faqOpen.matchesLocal, faqOpen);

  // 切换分类
  await evalJS(`(function(){var b=[].slice.call(document.querySelectorAll('.faq-tab')).filter(function(x){return x.innerText==='图书馆'})[0];b.click();return true})()`);
  const switched = await evalJS(`(function(){return {
    active:document.querySelector('.faq-tab.active').innerText,
    visible:[].slice.call(document.querySelectorAll('.faq-group.open .faq-q')).map(function(b){return b.querySelector('span:nth-child(2)').innerText}),
    allVisible:[].slice.call(document.querySelectorAll('.faq-q')).filter(function(b){return b.getBoundingClientRect().height>0}).length
  }})()`);
  check('验收6b · 切换分类标签后只显示该分类 3 条',
    switched.active === '图书馆' && switched.visible.length === 3 && switched.allVisible === 3, switched);

  // 点一条问题：关闭弹窗 + 发送 + 答案
  const picked = switched.visible[0];
  await evalJS(`(function(){var b=[].slice.call(document.querySelectorAll('.faq-group.open .faq-q'))[0];b.click();return true})()`);
  await sleep(700);
  const faqPick = await evalJS(`(function(){
    var b=[].slice.call(document.querySelectorAll('.msg-bot .bubble')).pop();
    return {
      faqHidden:document.querySelector('#faqModal').hidden,
      lastUser:[].slice.call(document.querySelectorAll('.msg-user .bubble')).pop().innerText,
      qaTitle:b.querySelector('.qa-title')?b.querySelector('.qa-title').innerText:'',
      steps:b.querySelectorAll('.step').length,
      badge:b.querySelector('.intent-badge')?b.querySelector('.intent-badge').innerText:''
    };
  })()`);
  console.log('FAQ PICK:', JSON.stringify(faqPick, null, 1));
  check('验收6c · 点任一问题 → 弹窗关闭、问题自动发送并显示答案',
    faqPick.faqHidden && faqPick.lastUser === picked && faqPick.qaTitle === picked &&
    faqPick.steps === 3 && /事务问答/.test(faqPick.badge), faqPick);

  /* ================= 验收 7：桌面无横滚 / 无移动端残留 ================= */
  const desktop = await evalJS(`(function(){return {
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth,
    innerWidth:window.innerWidth,
    bodyScrollWidth:document.body.scrollWidth,
    quickDisplay:getComputedStyle(document.querySelector('.quick-chips')).display,
    quickRows:new Set([].slice.call(document.querySelectorAll('.quick-chips button')).map(function(b){return Math.round(b.getBoundingClientRect().top)})).size,
    hint:document.querySelector('.composer-hint').innerText.replace(/\\n/g,' | '),
    chatW:Math.round(document.querySelector('.chat-card').getBoundingClientRect().width),
    pageH:document.documentElement.scrollHeight, innerH:window.innerHeight,
    innerW:window.innerWidth
  }})()`);
  check('验收7 · 桌面无横向滚动条、快捷按钮一行、仅保留 Shift+Enter 提示',
    desktop.scrollWidth <= desktop.clientWidth + 1 && desktop.bodyScrollWidth <= desktop.clientWidth + 1 &&
    desktop.quickDisplay === 'flex' && desktop.quickRows === 1 && /Shift \+ Enter/.test(desktop.hint) &&
    desktop.pageH <= desktop.innerH * 1.5, desktop);

  /* ================= 硬约束回归：问答 / 问数 / 请假 / 身份 ================= */
  const r0 = await ask('请假流程');
  check('回归 · 两个原用例不串场景：「请假流程」走事务问答',
    /事务问答/.test(r0.badge) && r0.steps === 3 && !r0.hasDataCard && !r0.modalOpen, { badge: r0.badge, qaTitle: r0.qaTitle });
  const r1 = await ask('我要请假三天');
  const form1 = await evalJS(`({name:document.querySelector('#lvName').value,sid:document.querySelector('#lvSid').value,fields:document.querySelectorAll('#leaveForm .field > label').length})`);
  check('回归 · 「我要请假三天」打开请假表单，字段与身份联动不变',
    r1.modalOpen && form1.fields === 6 && form1.name === '同学A' && form1.sid === 'SIM20260101', form1);
  await closeAll();

  const r2 = await ask('我明天有什么课');
  const exp1 = await evalJS(`(function(){
    var D=window.XiaoTongData.data; var d=new Date(); var t=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1); var tw=t.getDay()===0?7:t.getDay();
    return D.schedule['1'].filter(function(s){return s.day===tw}).map(function(s){return {block:s.block,course:s.course,room:s.room,teacher:s.teacher}});
  })()`);
  check('回归 · 课表问数与 1 班数据一致',
    /智能问数/.test(r2.badge) && r2.dataRows.length === exp1.length &&
    exp1.every(s => r2.dataRows.some(row => row.indexOf(s.course) >= 0 && row.indexOf(s.room) >= 0 && row.indexOf(s.teacher) >= 0)),
    { lead: r2.lead, rows: r2.dataRows });
  const r3 = await ask('下午三四节有空教室吗');
  check('回归 · 空教室问数返回教室列表',
    /智能问数/.test(r3.badge) && r3.tableRows.length > 0 && r3.tableRows.every(row => /^[AB]\d{3}$/.test(row[0])),
    { lead: r3.lead, rooms: r3.tableRows.map(r => r[0]) });
  const r4 = await ask('图书馆还有座位吗');
  check('回归 · 图书馆座位三区 + 合计（剩余=总−已用）',
    /智能问数/.test(r4.badge) && r4.tableRows.length === 4 && r4.tableRows[3][3] === '59', { lead: r4.lead, table: r4.tableRows });
  const r5id = await setIdentity('c2');
  const r5 = await ask('我明天有什么课');
  check('回归 · 切到 2026级2班 同学B 后课程结果变化',
    r5id === 'c2' && /同学B/.test(r5.context) && r5.text !== r2.text, { context: r5.context, rows: r5.dataRows });
  const r5form = await ask('我要请假三天');
  const form2 = await evalJS(`({name:document.querySelector('#lvName').value,sid:document.querySelector('#lvSid').value})`);
  check('回归 · 切身份后请假条姓名/学号自动跟随',
    r5form.modalOpen && form2.name === '同学B' && form2.sid === 'SIM20260201', form2);
  await closeAll();
  await setIdentity('c1');
  const r6 = await ask('怎么申请奖学金');
  check('回归 · 范围外问题走事务问答，不串问数',
    /事务问答/.test(r6.badge) && !r6.hasDataCard && !r6.modalOpen, { badge: r6.badge });

  /* ================= 验收 8：手机 390px 结构统一、无回归 ================= */
  await setWidth(390, 844);
  await clearIntro();
  await reload(6500);
  const mIntro = await evalJS(`(function(){
    var cards=[].slice.call(document.querySelectorAll('.evi-card'));
    return {
      autoOpen:!document.querySelector('#introModal').hidden,
      gridCols:getComputedStyle(document.querySelector('.intro-grid')).gridTemplateColumns,
      dialogW:Math.round(document.querySelector('.intro-dialog').getBoundingClientRect().width),
      maxW:Math.round(window.innerWidth*.92),
      dialogH:Math.round(document.querySelector('.intro-dialog').getBoundingClientRect().height),
      maxH:Math.round(window.innerHeight*.88),
      scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,
      cards:cards.map(function(c){var r=c.getBoundingClientRect();return {w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),clip:c.scrollWidth>c.clientWidth+1}}),
      note:document.querySelector('.evi-note').innerText
    };
  })()`);
  console.log('MOBILE INTRO:', JSON.stringify(mIntro, null, 1));
  check('验收8a · 390px 首次访问也自动弹窗，单栏、无横向溢出、数据卡完整',
    mIntro.autoOpen && mIntro.gridCols.split(' ').length === 1 && mIntro.dialogW <= mIntro.maxW &&
    mIntro.dialogH <= mIntro.maxH && mIntro.scrollWidth <= mIntro.innerWidth &&
    mIntro.cards.length === 3 && mIntro.cards.every(c => c.right <= mIntro.innerWidth + 1 && !c.clip),
    { dialogW: mIntro.dialogW, gridCols: mIntro.gridCols, scrollWidth: mIntro.scrollWidth, cards: mIntro.cards });
  await evalJS(`document.querySelector('#closeIntro').click(); true`);
  const mShell = await evalJS(`(function(){
    var card=document.querySelector('.chat-card').getBoundingClientRect();
    return {
      pageKids:[].slice.call(document.querySelector('.page').children).map(function(x){return x.tagName.toLowerCase()+'.'+x.className}),
      mainKids:[].slice.call(document.querySelectorAll('main > *')).map(function(x){return x.tagName.toLowerCase()+'.'+x.className}),
      cardW:Math.round(card.width),innerWidth:window.innerWidth,
      quickRows:new Set([].slice.call(document.querySelectorAll('.quick-chips button')).map(function(b){return Math.round(b.getBoundingClientRect().top)})).size,
      quickCols:getComputedStyle(document.querySelector('.quick-chips')).gridTemplateColumns.split(' ').length,
      scrollWidth:document.documentElement.scrollWidth,
      faqBtn:document.querySelector('#faqOpenBtn').innerText.replace(/\\n/g,' | '),
      inputBottom:Math.round(document.querySelector('#userInput').getBoundingClientRect().bottom)
    };
  })()`);
  console.log('MOBILE SHELL:', JSON.stringify(mShell, null, 1));
  check('验收8b · 390px 主界面结构一致、对话占满视口、快捷按钮两行',
    mShell.pageKids.length === 3 && mShell.mainKids.length === 2 &&
    Math.abs(mShell.cardW - mShell.innerWidth) <= 2 && mShell.quickRows === 2 && mShell.quickCols === 3 &&
    mShell.scrollWidth <= mShell.innerWidth && /30 条高频问答/.test(mShell.faqBtn),
    mShell);
  const mAsk = await ask('我明天有什么课');
  check('验收8c · 390px 问数 / 问答功能无回归',
    /智能问数/.test(mAsk.badge) && mAsk.dataRows.length > 0, { lead: mAsk.lead, rows: mAsk.dataRows.length });
  const mFaq = await ask('请假流程');
  check('验收8d · 390px 事务问答无回归', /事务问答/.test(mFaq.badge) && mFaq.steps === 3, { badge: mFaq.badge });
  await setWidth(320, 700);
  const m320 = await evalJS(`({scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,cardW:Math.round(document.querySelector('.chat-card').getBoundingClientRect().width)})`);
  check('验收8e · 320px 无横向溢出', m320.scrollWidth <= m320.innerWidth, m320);

  /* ================= 验收 9：无 jsError + 模型不可用降级 ================= */
  check('验收9a · 全流程无 JS 异常', jsErrors.length === 0, { jsErrors });
  await setWidth(1440, 900);
  await send('Network.setBlockedURLs', { urls: ['*workbuddy-cloud-sdk*'] });
  await navigate(URL_, 6000);
  const offline = await evalJS(`({
    aiStatus:document.querySelector('#aiStatus').innerText,
    modeHint:document.querySelector('#modeHint').innerText,
    items:document.querySelectorAll('[data-faq]').length,
    tabs:document.querySelectorAll('.faq-tab').length,
    eviCards:document.querySelectorAll('.evi-card').length,
    sdk:typeof window.WorkBuddyCloud
  })`);
  console.log('OFFLINE BOOT:', JSON.stringify(offline, null, 1));
  await evalJS(`document.querySelector('#introBtn').click(); true`);
  const offlineIntro = await evalJS(`!document.querySelector('#introModal').hidden`);
  await closeAll();
  const o1 = await ask('请假流程');
  const o2 = await ask('我明天有什么课');
  const o3 = await ask('我要请假三天');
  console.log('OFFLINE ASKS:', JSON.stringify({ o1: o1.badge, o2: o2.badge, o3: o3.badge, rows: o2.dataRows.length }, null, 1));
  await closeAll();
  check('验收9b · 模型/SDK 不可用时仍降级可用，弹窗与问答目录照常渲染',
    /关键词匹配/.test(offline.aiStatus) && /本地镜像/.test(offline.modeHint) &&
    offline.items === 30 && offline.tabs === 10 && offline.eviCards === 3 && offlineIntro &&
    /事务问答/.test(o1.badge) && o1.steps === 3 &&
    /智能问数/.test(o2.badge) && o2.dataRows.length > 0 && o3.modalOpen,
    { aiStatus: offline.aiStatus, modeHint: offline.modeHint, o1: o1.badge, o2: o2.badge, o3: o3.badge });
  await send('Network.setBlockedURLs', { urls: [] });
  check('验收9c · 降级演练阶段也无 JS 异常', jsErrors.length === 0, { jsErrors });

  const failed = results.filter(r => !r.ok);
  console.log('\n===== SUMMARY =====');
  console.log('TOTAL', results.length, 'PASS', results.length - failed.length, 'FAIL', failed.length);
  if (failed.length) console.log('FAILED:', failed.map(f => f.name));
  ws.close();
  if (failed.length) process.exitCode = 1;
}
main().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
