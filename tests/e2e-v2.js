/* 「小通同学」第二版无头浏览器验收脚本（仅本地开发使用，不随应用发布）
 * 用法：node e2e-v2.js [URL]
 * 依赖：本机 9222 端口的无头 Chrome（CDP）
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
  const netErrors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      jsErrors.push((d.text || '') + ' ' + ((d.exception && d.exception.description) || ''));
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      netErrors.push(m.params.entry.text);
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
  const navigate = async (url, wait = 8000) => {
    await send('Page.navigate', { url });
    await sleep(wait);
  };
  const setWidth = async (w, h) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 2, mobile: w < 700 });
    await sleep(900);
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Log.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });

  // 首次导航后清掉本地身份，再刷新，确保从默认「2026级1班 同学A」开始
  await navigate(URL_);
  await evalJS(`localStorage.removeItem('xiaotong.identity.v1'); true`);
  await send('Page.reload');
  await sleep(8000);

  const boot = await evalJS(`(function(){
    var cards=[].slice.call(document.querySelectorAll('.evi-card'));
    return {
      groups:document.querySelectorAll('.faq-group').length,
      items:document.querySelectorAll('[data-faq]').length,
      caps:document.querySelectorAll('.cap-card').length,
      eviCards:cards.length,
      eviText:cards.map(function(c){return c.innerText.replace(/\\n/g,' | ')}),
      note:document.querySelector('.evi-note')?document.querySelector('.evi-note').innerText:'',
      identityOptions:document.querySelectorAll('#identitySelect option').length,
      identityValue:document.querySelector('#identitySelect').value,
      identityHint:document.querySelector('#identityHint').innerText,
      aiStatus:document.querySelector('#aiStatus').innerText,
      modeHint:document.querySelector('#modeHint').innerText,
      heroTitle:document.querySelector('#heroTitle').innerText
    };
  })()`);
  console.log('BOOT:', JSON.stringify(boot, null, 1));

  check('原有 30 条问答 / 10 类未变', boot.groups === 10 && boot.items === 30, { groups: boot.groups, items: boot.items });
  check('三张能力卡片', boot.caps === 3, { caps: boot.caps });
  check('证据区 3 个数字 + 来源 + 说明',
    boot.eviCards === 3 &&
    /41/.test(boot.eviText[0] || '') && /2024/.test(boot.eviText[0] || '') && /1407/.test(boot.eviText[0] || '') &&
    /58\.51%/.test(boot.eviText[1] || '') && /2895/.test(boot.eviText[1] || '') &&
    /67\.63%/.test(boot.eviText[2] || '') && /2895/.test(boot.eviText[2] || '') &&
    /第三方调查/.test(boot.note),
    { eviText: boot.eviText, note: boot.note });
  check('身份选择器 4 项且默认 1 班 同学A', boot.identityOptions === 4 && boot.identityValue === 'c1',
    { options: boot.identityOptions, value: boot.identityValue, hint: boot.identityHint });

  // ---------- 验收 1：390px 三个数字卡完整、不溢出 ----------
  const mobileProbe = `(function(){
    var cards=[].slice.call(document.querySelectorAll('.evi-card'));
    return {
      innerWidth:window.innerWidth,
      scrollWidth:document.documentElement.scrollWidth,
      bodyScrollWidth:document.body.scrollWidth,
      cards:cards.map(function(c){var r=c.getBoundingClientRect();return {
        w:Math.round(r.width),h:Math.round(r.height),left:Math.round(r.left),right:Math.round(r.right),
        bottom:Math.round(r.bottom),clipX:c.scrollWidth>c.clientWidth+1,clipY:c.scrollHeight>c.clientHeight+1,
        text:c.innerText.replace(/\\n/g,' | ')}}),
      noteClip:(function(){var n=document.querySelector('.evi-note');return n?n.scrollWidth>n.clientWidth+1:false})()
    };
  })()`;
  await setWidth(390, 844);
  const m390 = await evalJS(mobileProbe);
  console.log('MOBILE 390:', JSON.stringify(m390, null, 1));
  check('验收1 · 390px 三个数字卡完整、无横向溢出',
    m390.cards.length === 3 &&
    m390.cards.every(c => c.w > 0 && c.h > 0 && c.left >= -1 && c.right <= m390.innerWidth + 1 && !c.clipX && !c.clipY) &&
    m390.scrollWidth <= m390.innerWidth && m390.bodyScrollWidth <= m390.innerWidth && !m390.noteClip,
    { scrollWidth: m390.scrollWidth, innerWidth: m390.innerWidth, cards: m390.cards.map(c => [c.w, c.h, c.left, c.right, c.bottom]) });
  check('验收1b · 390px 三个数字卡都在首屏可视区内',
    m390.cards.every(c => c.bottom <= 844), { bottoms: m390.cards.map(c => c.bottom) });

  await setWidth(320, 700);
  const m320 = await evalJS(mobileProbe);
  console.log('MOBILE 320:', JSON.stringify(m320, null, 1));
  check('硬约束 · 320px 无横向溢出',
    m320.scrollWidth <= m320.innerWidth && m320.bodyScrollWidth <= m320.innerWidth &&
    m320.cards.every(c => c.right <= m320.innerWidth + 1 && !c.clipX),
    { scrollWidth: m320.scrollWidth, innerWidth: m320.innerWidth });

  await setWidth(1280, 900);

  // ---------- 对话辅助 ----------
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
        note:b.querySelector('.data-note')?b.querySelector('.data-note').innerText:'',
        text:b.innerText.slice(0,400),
        modalOpen:!document.querySelector('#leaveModal').hidden
      };
    })()`);
  }
  const closeModal = () => evalJS(`(function(){var m=document.querySelector('#leaveModal');if(!m.hidden){m.hidden=true;document.body.style.overflow='';}return true})()`);
  const setIdentity = id => evalJS(`(function(){var s=document.querySelector('#identitySelect');s.value=${JSON.stringify(id)};s.dispatchEvent(new Event('change'));return s.value})()`);

  // ---------- 回归：原有问答 / 请假不串场景 ----------
  const r0 = await ask('请假流程');
  console.log('REG 请假流程:', JSON.stringify(r0, null, 1));
  check('回归 · 「请假流程」仍走事务问答（3 步 + 未串问数）',
    /事务问答/.test(r0.badge) && r0.steps === 3 && !r0.hasDataCard && !r0.modalOpen,
    { badge: r0.badge, qaTitle: r0.qaTitle, steps: r0.steps });

  const r1 = await ask('我要请假三天');
  const form1 = await evalJS(`(function(){return {
    open:!document.querySelector('#leaveModal').hidden,
    name:document.querySelector('#lvName')?document.querySelector('#lvName').value:null,
    sid:document.querySelector('#lvSid')?document.querySelector('#lvSid').value:null,
    start:document.querySelector('#lvStart')?document.querySelector('#lvStart').value:null,
    end:document.querySelector('#lvEnd')?document.querySelector('#lvEnd').value:null,
    fields:[].slice.call(document.querySelectorAll('#leaveForm .field > label')).map(function(l){return l.innerText})
  }})()`);
  console.log('REG 我要请假三天:', JSON.stringify({ r1, form1 }, null, 1));
  check('回归 · 「我要请假三天」仍打开请假表单，字段未变且姓名/学号跟随身份',
    r1.modalOpen && form1.open && form1.name === '同学A' && form1.sid === 'SIM20260101' && form1.fields.length === 6,
    { name: form1.name, sid: form1.sid, fields: form1.fields });
  await closeModal();

  // ---------- 验收 2：课表查询 ----------
  const r2 = await ask('我明天有什么课');
  const exp1 = await evalJS(`(function(){
    var D=window.XiaoTongData.data, d=new Date(); var w=d.getDay()===0?7:d.getDay();
    var target=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1); var tw=target.getDay()===0?7:target.getDay();
    return D.schedule['1'].filter(function(s){return s.day===tw}).map(function(s){
      return {block:s.block,course:s.course,room:s.room,teacher:s.teacher};
    });
  })()`);
  console.log('CASE2 我明天有什么课:', JSON.stringify(r2, null, 1));
  console.log('EXPECTED class1:', JSON.stringify(exp1));
  check('验收2 · 「我明天有什么课」返回具体课程且与课表数据一致',
    /智能问数/.test(r2.badge) && r2.hasDataCard && r2.dataRows.length === exp1.length &&
    exp1.every(s => r2.dataRows.some(row => row.indexOf(s.course) >= 0 && row.indexOf(s.room) >= 0 && row.indexOf(s.teacher) >= 0 && row.indexOf(s.block) >= 0)),
    { lead: r2.lead, rows: r2.dataRows, expected: exp1 });

  // ---------- 验收 3：空教室 ----------
  const r3 = await ask('下午三四节有空教室吗');
  console.log('CASE3 下午三四节有空教室吗:', JSON.stringify(r3, null, 1));
  check('验收3 · 「下午三四节有空教室吗」返回教室列表',
    /智能问数/.test(r3.badge) && r3.hasDataCard && r3.tableRows.length > 0 &&
    r3.tableRows.every(row => /^[AB]\d{3}$/.test(row[0])),
    { lead: r3.lead, rooms: r3.tableRows.map(r => r[0]) });

  const r3b = await ask('明天上午哪些教室空着');
  check('补充 · 「明天上午哪些教室空着」也返回列表',
    /智能问数/.test(r3b.badge) && r3b.tableRows.length > 0, { lead: r3b.lead, rooms: r3b.tableRows.map(r => r[0]) });

  // ---------- 验收 4：图书馆座位 ----------
  const r4 = await ask('图书馆还有座位吗');
  console.log('CASE4 图书馆还有座位吗:', JSON.stringify(r4, null, 1));
  const seatOK = r4.tableRows.length === 4 &&
    r4.tableRows[0][1] === '120' && r4.tableRows[0][2] === '87' && r4.tableRows[0][3] === '33' &&
    r4.tableRows[1][1] === '80' && r4.tableRows[1][2] === '63' && r4.tableRows[1][3] === '17' &&
    r4.tableRows[2][1] === '40' && r4.tableRows[2][2] === '31' && r4.tableRows[2][3] === '9' &&
    r4.tableRows[3][3] === '59';
  check('验收4 · 「图书馆还有座位吗」返回三个区座位数（剩余=总−已用）',
    /智能问数/.test(r4.badge) && r4.hasDataCard && seatOK && /59/.test(r4.lead),
    { lead: r4.lead, table: r4.tableRows });

  const r4b = await ask('三楼还有位置吗');
  check('补充 · 「三楼还有位置吗」定位到三楼阅览区',
    /三楼阅览区/.test(r4b.lead) && /17/.test(r4b.lead) && r4b.tableRows.length === 4,
    { lead: r4b.lead });

  // ---------- 验收 5：切身份后课程变化 ----------
  const idVal = await setIdentity('c2');
  const r5 = await ask('我明天有什么课');
  const exp2 = await evalJS(`(function(){
    var D=window.XiaoTongData.data; var d=new Date();
    var t=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1); var tw=t.getDay()===0?7:t.getDay();
    return D.schedule['2'].filter(function(s){return s.day===tw}).map(function(s){
      return {block:s.block,course:s.course,room:s.room,teacher:s.teacher};
    });
  })()`);
  console.log('CASE5 切同学B后:', JSON.stringify({ idVal, r5, exp2 }, null, 1));
  check('验收5 · 切到 2026级2班 同学B 后课程结果随之变化',
    idVal === 'c2' && /同学B/.test(r5.context) && r5.dataRows.length === exp2.length &&
    exp2.every(s => r5.dataRows.some(row => row.indexOf(s.course) >= 0)) &&
    r5.text !== r2.text,
    { context: r5.context, rows: r5.dataRows, expected: exp2.map(s => s.course) });

  const r5form = await ask('我要请假三天');
  const form2 = await evalJS(`({name:document.querySelector('#lvName').value,sid:document.querySelector('#lvSid').value})`);
  check('补充 · 切身份后请假条姓名/学号自动跟随',
    r5form.modalOpen && form2.name === '同学B' && form2.sid === 'SIM20260201', form2);
  await closeModal();

  // ---------- 验收 6：范围外问题正确路由到事务问答 ----------
  const r6 = await ask('怎么申请奖学金');
  console.log('CASE6 怎么申请奖学金:', JSON.stringify(r6, null, 1));
  check('验收6 · 「怎么申请奖学金」走事务问答，不串问数',
    /事务问答/.test(r6.badge) && !r6.hasDataCard && !r6.modalOpen && !/智能问数/.test(r6.badge),
    { badge: r6.badge, text: r6.text.slice(0, 90) });

  const r6b = await ask('选课在哪选、什么时候开始');
  check('补充 · 「选课在哪选」也不串问数',
    /事务问答/.test(r6b.badge) && !r6b.hasDataCard, { badge: r6b.badge, qaTitle: r6b.qaTitle });

  // ---------- 验收 7：无 JS 报错 + 模型不可用时关键词兜底 ----------
  check('验收7a · 全流程无 JS 异常', jsErrors.length === 0, { jsErrors });

  await send('Network.setBlockedURLs', { urls: ['*workbuddy-cloud-sdk*'] });
  await navigate(URL_, 6000);
  const offline = await evalJS(`({
    aiStatus:document.querySelector('#aiStatus').innerText,
    modeHint:document.querySelector('#modeHint').innerText,
    groups:document.querySelectorAll('.faq-group').length,
    items:document.querySelectorAll('[data-faq]').length,
    eviCards:document.querySelectorAll('.evi-card').length,
    identityValue:document.querySelector('#identitySelect').value,
    sdk:typeof window.WorkBuddyCloud
  })`);
  console.log('OFFLINE BOOT:', JSON.stringify(offline, null, 1));
  const o1 = await ask('请假流程');
  const o2 = await ask('我明天有什么课');
  const o3 = await ask('我要请假三天');
  console.log('OFFLINE ASKS:', JSON.stringify({ o1: o1.badge, o2: o2.badge, o3: o3.badge, o2rows: o2.dataRows.length }, null, 1));
  await closeModal();
  check('验收7b · 模型/SDK 不可用时，问答、问数、请假仍可用',
    /关键词匹配/.test(offline.aiStatus) && /本地镜像/.test(offline.modeHint) &&
    offline.items === 30 && offline.eviCards === 3 &&
    /事务问答/.test(o1.badge) && o1.steps === 3 &&
    /智能问数/.test(o2.badge) && o2.dataRows.length > 0 &&
    o3.modalOpen,
    { aiStatus: offline.aiStatus, modeHint: offline.modeHint, o1: o1.badge, o2: o2.badge, o3: o3.badge });
  await send('Network.setBlockedURLs', { urls: [] });

  check('验收7c · 断网演练阶段也无 JS 异常', jsErrors.length === 0, { jsErrors });
  if (netErrors.length) console.log('NETWORK WARNINGS (expected when SDK blocked):', netErrors.slice(0, 6));

  const failed = results.filter(r => !r.ok);
  console.log('\n===== SUMMARY =====');
  console.log('TOTAL', results.length, 'PASS', results.length - failed.length, 'FAIL', failed.length);
  if (failed.length) console.log('FAILED:', failed.map(f => f.name));
  ws.close();
  if (failed.length) process.exitCode = 1;
}
main().catch(e => { console.error('E2E ERROR', e); process.exit(1); });
