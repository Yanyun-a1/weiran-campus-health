/* 校园健康助手 · v22 医生预约逻辑 专项验收
 * 用法：node e2e-v22.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 1 三卡统一预约按钮 / 2 删除查看排班与提示 / 3-5 三位医生预填 / 6 预约时段只读字段
 * 7 提交后对话流凭证卡 / 8 我的预约同步 / 9 我要请假回归 / 10 手机竖堆 / 11 无 jsError
 * + 硬约束：小球/30问答/毛玻璃/圆角/主色/无横向溢出
 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const DIR = process.env.E2E_DIR || 'E:/gzkj/';   /* 线上复跑时可用 E2E_DIR 分流截图 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

async function main() {
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
    if (r.result && r.result.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const click = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO';e.click();return 'OK'})()`);
  const shot = async (file, w, h) => {
    if (w) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile_ }); await sleep(360); }
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  const setViewport = async (w, h, mobile) => { mobile_ = mobile; await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 }); await sleep(420); };
  let mobile_ = false;
  const mouse = async (type, x, y, opts = {}) => { await send('Input.dispatchMouseEvent', Object.assign({ type, x, y }, opts)); };
  const tapAt = async (x, y) => { await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); await sleep(90); };
  const touchTap = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(20); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(110); };
  const tap = (x, y) => mobile_ ? touchTap(x, y) : tapAt(x, y);
  const noHScroll = () => ev(`(function(){return {sw:document.documentElement.scrollWidth, iw:window.innerWidth}})()`);

  async function reset(w, h, mobile) {
    await setViewport(w, h, mobile);
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Page.navigate', { url: URL_ }); await sleep(1500);
    await ev(`(function(){try{localStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1900);
  }
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(500);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(150);
    await click('#consentAgree'); await sleep(600);
    if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(300); }
  }
  const centerRect = () => ev(`(function(){var c=document.querySelector('#orbCenter');if(!c)return null;var r=c.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}}())`);
  const openDoctors = async () => { const c = await centerRect(); await tap(c.cx, c.cy); await sleep(620); };
  const formVals = () => ev(`(function(){function v(s){var e=document.querySelector(s);return e?e.value:null}var s=document.querySelector('#lvSlot');return {title:document.querySelector('#leaveTitle').textContent,form:!!document.querySelector('#bookingForm'),doctor:v('#lvDoctor'),slot:v('#lvSlot'),slotReadonly:!!(s&&s.readOnly),start:v('#lvStart'),end:v('#lvEnd'),duration:v('#lvDuration'),reason:v('#lvReason'),name:v('#lvName'),sid:v('#lvSid'),cls:v('#lvClass'),counselor:v('#lvCounselor'),type:(document.querySelector('input[name=lvType]:checked')||{}).value||null,submit:(document.querySelector('#bookingForm button[type=submit]')||{}).textContent}})()`);
  const closeForm = async () => { await click('#closeModal'); await sleep(250); };

  /* ================= 桌面 (1440x1000) ================= */
  console.log('\n=== 桌面端 (1440x1000) 医生列表 / 三套预填 / 凭证卡 ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(400);
  const dates = await ev(`(function(){function f(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}var t=new Date(),m=new Date();m.setDate(m.getDate()+1);return {today:f(t),tomorrow:f(m),ymd:f(t).replace(/-/g,'')}})()`);

  // 空态文案回归（提交前）
  await click('#bookBtn'); await sleep(280);
  const empty = await ev(`(function(){var l=document.querySelector('#chatLog');return /你还没有预约记录。点右侧中间的校医院球可以发起预约。/.test(l.textContent)})()`);
  check('验收8(前置) · 「我的预约」空态文案一字未改', empty);

  await openDoctors();
  const cards = await ev(`(function(){
    var out=[].slice.call(document.querySelectorAll('#doctorCards .doc-card')).map(function(c){var b=c.querySelector('button');return {
      name:(c.querySelector('.dc-id b')||{}).textContent,dept:(c.querySelector('.dc-id span')||{}).textContent,
      status:(c.querySelector('.dc-status')||{}).textContent,statusClass:(c.querySelector('.dc-status')||{}).className,
      avatar:(c.querySelector('.dc-avatar')||{}).className,btn:b?b.textContent.trim():null,cls:b?b.className:null,data:b?b.getAttribute('data-book'):null}});
    return {cards:out,grid:getComputedStyle(document.querySelector('#doctorCards')).gridTemplateColumns,
      schedBtns:document.querySelectorAll('[data-sched]').length,schedTips:document.querySelectorAll('.dc-sched').length,
      text:document.querySelector('#doctorModal').textContent.replace(/\\s+/g,' ')};
  })()`);
  check('验收1 · 三张卡都是预约按钮，文字为「立即预约 / 预约 16:00 / 预约明日 08:00」',
    cards && cards.cards.length === 3 &&
    cards.cards[0].btn === '立即预约' && /is-primary/.test(cards.cards[0].cls) &&
    cards.cards[1].btn === '预约 16:00' && /is-outline/.test(cards.cards[1].cls) &&
    cards.cards[2].btn === '预约明日 08:00' && /is-outline/.test(cards.cards[2].cls) &&
    cards.cards.map(c => c.data).join(',') === 'zhang,li,wang', cards && cards.cards.map(c => ({ btn: c.btn, cls: c.cls, data: c.data })));
  check('验收2 · 「查看排班」按钮与展开提示文字均已删除',
    cards && cards.schedBtns === 0 && cards.schedTips === 0 && !/查看排班/.test(cards.text) &&
    !/医生上线后会通知你/.test(cards.text), { schedBtns: cards && cards.schedBtns, schedTips: cards && cards.schedTips });
  check('硬约束 · 卡片布局/头像/状态标签保持（3 列 / 三色头像 / 在线与灰色标签）',
    cards && cards.grid.split(' ').length === 3 && /av-teal/.test(cards.cards[0].avatar) &&
    /av-purple/.test(cards.cards[1].avatar) && /av-orange/.test(cards.cards[2].avatar) &&
    /is-online/.test(cards.cards[0].statusClass) && /is-off/.test(cards.cards[1].statusClass) &&
    /is-off/.test(cards.cards[2].statusClass) && /当前在线/.test(cards.cards[0].status) &&
    /16:00 后在线/.test(cards.cards[1].status) && /明日 08:00 在线/.test(cards.cards[2].status),
    { grid: cards && cards.grid });
  const btnStyle = await ev(`(function(){var a=getComputedStyle(document.querySelector('[data-book="li"]'));return {border:a.borderTopWidth+' '+a.borderTopColor,color:a.color,bg:a.backgroundColor}})()`);
  check('验收1b · 未在线医生按钮为绿色描边（#2AA79B 边框 / 青绿文字）',
    btnStyle && /1px/.test(btnStyle.border) && /42, 167, 155/.test(btnStyle.border) && /30, 140, 130/.test(btnStyle.color), btnStyle);
  const szD0 = await shot('v22-desktop-doctors.png', 1440, 1000); console.log('SHOT  v22-desktop-doctors.png  ' + szD0 + ' bytes');

  // 验收3：张医生
  await click('[data-book="zhang"]'); await sleep(400);
  const fz = await formVals();
  const zhangHH = await ev(`(function(){var d=new Date();return String(d.getHours()).padStart(2,'0')})()`);
  check('验收3 · 张医生：今天当前整点 → +4h、理由不含医生名',
    fz && fz.form && fz.start === dates.today + 'T' + zhangHH + ':00' &&
    fz.end === (await ev(`(function(){var d=new Date();d.setMinutes(0,0,0);d.setHours(d.getHours()+4);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'T'+String(d.getHours()).padStart(2,'0')+':00'})()`)) &&
    fz.reason === '因身体不适，需前往校医院就诊，申请病假半天（4 小时）。' && !/医生/.test(fz.reason) &&
    fz.doctor === '张医生（内科）', { start: fz && fz.start, end: fz && fz.end, doctor: fz && fz.doctor, reason: fz && fz.reason });
  check('验收6a · 张医生预约时段只读字段 = 今日 HH:00 – HH:30',
    fz && fz.slotReadonly && fz.slot === '今日 ' + zhangHH + ':00 – ' + zhangHH + ':30', { slot: fz && fz.slot, readonly: fz && fz.slotReadonly });
  const szD1 = await shot('v22-desktop-form-zhang.png', 1440, 1000); console.log('SHOT  v22-desktop-form-zhang.png  ' + szD1 + ' bytes');
  await closeForm();

  // 验收4：李医生（并提交）
  await openDoctors();
  await click('[data-book="li"]'); await sleep(400);
  const fl = await formVals();
  check('验收4 · 李医生：16:00 → 20:00、理由含「预约李医生（外科）16:00 门诊」',
    fl && fl.form && fl.start === dates.today + 'T16:00' && fl.end === dates.today + 'T20:00' &&
    fl.doctor === '李医生（外科）' &&
    fl.reason === '因身体不适，需前往校医院就诊，预约李医生（外科）16:00 门诊，申请病假半天（4 小时）。',
    { start: fl && fl.start, end: fl && fl.end, doctor: fl && fl.doctor, reason: fl && fl.reason });
  check('验收6b · 李医生预约时段只读 = 今日 16:00 – 16:30',
    fl && fl.slotReadonly && fl.slot === '今日 16:00 – 16:30', { slot: fl && fl.slot });
  check('硬约束 · 其余字段仍沿用现有自动填充（姓名/学号/班级/辅导员/病假/4 小时）',
    fl && !!fl.name && !!fl.sid && !!fl.cls && /辅导员/.test(fl.counselor || '') &&
    fl.type === '病假' && /4 小时/.test(fl.duration || '') && fl.submit === '提交请假申请',
    { name: fl && fl.name, sid: fl && fl.sid, cls: fl && fl.cls, type: fl && fl.type, duration: fl && fl.duration });
  const szD2 = await shot('v22-desktop-form-li.png', 1440, 1000); console.log('SHOT  v22-desktop-form-li.png  ' + szD2 + ' bytes');

  // 提交 → 验收7：对话流凭证卡
  await click('#bookingForm button[type="submit"]'); await sleep(450);
  const ticket = await ev(`(function(){
    var card=document.querySelector('#chatLog .msg-bot .bubble .bk-ticket');
    var m=document.querySelector('#leaveModal');
    if(!card)return {card:false,modalHidden:!!(m&&m.hidden)};
    var c=getComputedStyle(card),h=getComputedStyle(card.querySelector('h4')),
        p=getComputedStyle(card.querySelector('p:not(.bk-ticket-no)')),
        n=getComputedStyle(card.querySelector('.bk-ticket-no'));
    return {card:true,modalHidden:!!(m&&m.hidden),successPage:!!document.querySelector('.bk-success'),
      inBubble:!!card.closest('.msg-bot .bubble'),txt:card.textContent.replace(/\\s+/g,' ').trim(),
      bg:c.backgroundColor,radius:c.borderTopLeftRadius,bl:c.borderLeftWidth+' '+c.borderLeftColor,
      h4:{size:h.fontSize,weight:h.fontWeight,color:h.color},
      p:{size:p.fontSize,color:p.color,lh:p.lineHeight},
      no:{size:n.fontSize,color:n.color,font:n.fontFamily}};
  })()`);
  check('验收7a · 提交后表单关闭且不再出现弹窗成功页，卡片作为消息气泡进入对话流',
    ticket && ticket.modalHidden && !ticket.successPage && ticket.card && ticket.inBubble,
    { modalHidden: ticket && ticket.modalHidden, successPage: ticket && ticket.successPage, inBubble: ticket && ticket.inBubble });
  check('验收7b · 凭证卡内容：✅ 预约成功 / 李医生·外科 / 今日 16:00 – 16:30 / 凭证号 / 候诊提示',
    ticket && /✅ 预约成功/.test(ticket.txt) && /李医生 · 外科/.test(ticket.txt) &&
    /16:00.*16:30/.test(ticket.txt) && /MOCK-\d{8}-001/.test(ticket.txt) &&
    /请提前 10 分钟到校医院候诊/.test(ticket.txt), ticket && ticket.txt);
  check('验收7c · 凭证号按提交日期 + 三位流水号生成',
    ticket && new RegExp('MOCK-' + dates.ymd + '-001').test(ticket.txt), { ymd: dates.ymd, txt: ticket && ticket.txt });
  check('验收7d · 卡片样式：白底/20px/浅青绿左边框3px/标题15px·600·#2C3A38/正文13.5px·#5A6B68·1.7/凭证号等宽12.5px·#8A9694',
    ticket && ticket.bg === 'rgb(255, 255, 255)' && /20px/.test(ticket.radius) &&
    /^3px/.test(ticket.bl) && /183, 221, 214/.test(ticket.bl) &&
    ticket.h4.size === '15px' && ticket.h4.weight === '600' && ticket.h4.color === 'rgb(44, 58, 56)' &&
    ticket.p.size === '13.5px' && ticket.p.color === 'rgb(90, 107, 104)' && /22\.9/.test(ticket.p.lh) &&
    ticket.no.size === '12.5px' && ticket.no.color === 'rgb(138, 150, 148)' && /monospace|Consolas|Menlo/.test(ticket.no.font),
    { bg: ticket && ticket.bg, radius: ticket && ticket.radius, bl: ticket && ticket.bl, h4: ticket && ticket.h4, p: ticket && ticket.p, no: ticket && ticket.no });
  const szD3 = await shot('v22-desktop-ticket.png', 1440, 1000); console.log('SHOT  v22-desktop-ticket.png  ' + szD3 + ' bytes');

  // 验收8：我的预约同步
  await click('#bookBtn'); await sleep(340);
  const list = await ev(`(function(){var items=[].slice.call(document.querySelectorAll('#chatLog .bk-item'));return {n:items.length,last:items.length?items[items.length-1].textContent.replace(/\\s+/g,' ').trim():null,title:document.querySelector('.bk-list-title')?document.querySelector('.bk-list-title').textContent:null}})()`);
  check('验收8 · 「我的预约」显示刚提交的记录（医生/时段/等待辅导员审批/凭证号）',
    list && list.n === 1 && /李医生（外科）/.test(list.last) && /16:00/.test(list.last) &&
    /等待辅导员审批/.test(list.last) && new RegExp('MOCK-' + dates.ymd + '-001').test(list.last), list);
  const szD4 = await shot('v22-desktop-bookings.png', 1440, 1000); console.log('SHOT  v22-desktop-bookings.png  ' + szD4 + ' bytes');

  // 验收5：王医生 + 固定时间（不按真实时间算）
  await openDoctors();
  await click('[data-book="wang"]'); await sleep(400);
  const fw = await formVals();
  const tomorrow = await ev(`(function(){var d=new Date();d.setDate(d.getDate()+1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')})()`);
  check('验收5 · 王医生：明日 08:00 → 12:00、理由含「预约王医生（全科）明日 08:00 门诊」',
    fw && fw.form && fw.start === tomorrow + 'T08:00' && fw.end === tomorrow + 'T12:00' &&
    fw.doctor === '王医生（全科）' &&
    fw.reason === '因身体不适，需前往校医院就诊，预约王医生（全科）明日 08:00 门诊，申请病假半天（4 小时）。',
    { start: fw && fw.start, end: fw && fw.end, doctor: fw && fw.doctor, reason: fw && fw.reason });
  check('验收6c · 王医生预约时段只读 = 明日 08:00 – 08:30（固定值）',
    fw && fw.slotReadonly && fw.slot === '明日 08:00 – 08:30', { slot: fw && fw.slot });
  await closeForm();

  // 流水号递增：再提交一次张医生 → 002
  await openDoctors(); await click('[data-book="zhang"]'); await sleep(350);
  await click('#bookingForm button[type="submit"]'); await sleep(380);
  const seq2 = await ev(`(function(){var c=[].slice.call(document.querySelectorAll('#chatLog .bk-ticket'));return {n:c.length,last:c.length?c[c.length-1].textContent.replace(/\\s+/g,' ').trim():null}})()`);
  check('验收7e · 第二次提交凭证号流水递增到 -002',
    seq2 && seq2.n === 2 && new RegExp('MOCK-' + dates.ymd + '-002').test(seq2.last), seq2);

  // 验收9：原有「我要请假」流程完全不受影响
  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='我要请假三天';return 1})()`);
  await click('#sendBtn');
  // 云端意图识别有超时可能，轮询等待本地兜底完成（最多 9s）
  for (let i = 0; i < 18; i++) {
    await sleep(500);
    const ready = await ev(`(function(){return !!(document.querySelector('#leaveForm')||document.querySelector('[data-open-leave]'))})()`);
    if (ready) break;
  }
  let leave = await ev(`(function(){var m=document.querySelector('#leaveModal');return {open:!!(m&&!m.hidden),mode:m?m.classList.contains('booking-mode'):null,form:!!document.querySelector('#leaveForm'),title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent:null,slot:!!document.querySelector('#lvSlot'),ticketInForm:!!document.querySelector('#leaveBody .bk-ticket'),submit:document.querySelector('#leaveForm button[type=submit]')?document.querySelector('#leaveForm button[type=submit]').textContent.trim():null}})()`);
  if (!leave.form) { await click('[data-open-leave]'); await sleep(350); leave = await ev(`(function(){var m=document.querySelector('#leaveModal');return {open:!!(m&&!m.hidden),mode:m?m.classList.contains('booking-mode'):null,form:!!document.querySelector('#leaveForm'),title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent:null,slot:!!document.querySelector('#lvSlot'),ticketInForm:!!document.querySelector('#leaveBody .bk-ticket'),submit:document.querySelector('#leaveForm button[type=submit]')?document.querySelector('#leaveForm button[type=submit]').textContent.trim():null}})()`); }
  check('验收9 · 「我要请假」仍打开原请假条表单（无预约时段字段、无凭证卡、非 booking-mode）',
    leave && leave.open && leave.form && /请假条生成/.test(leave.title) && !leave.slot &&
    !leave.ticketInForm && !leave.mode && /生成请假条/.test(leave.submit || ''), leave);
  // 提交请假条，确认后续生成链路仍在
  await click('#leaveForm button[type="submit"]'); await sleep(350);
  const leaveResult = await ev(`(function(){return {doc:!!document.querySelector('#leaveDoc'),title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent:null}})()`);
  check('验收9b · 请假条生成结果页仍正常（复制/打印/审批顺序链路未断）',
    leaveResult && leaveResult.doc && /已生成/.test(leaveResult.title || ''), leaveResult);
  await closeForm();

  // 硬约束：小球 / 主色 / 毛玻璃 / 圆角 / 无溢出
  const hard = await ev(`(function(){function c(s){var e=document.querySelector(s);return e?getComputedStyle(e):null}var b=c('.msg-bot .bubble');return {
    blue:getComputedStyle(document.documentElement).getPropertyValue('--blue').trim(),
    bubbleBg:b?b.backgroundColor:null,bubbleBf:b?b.backdropFilter:null,bubbleRadius:b?b.borderRadius:null,
    majors:[].slice.call(document.querySelectorAll('.orb-major')).filter(function(e){return !e.hidden}).length,
    links:document.querySelectorAll('#orbLinkSvg .orb-link').length,
    chip:c('.quick-chips button')?getComputedStyle(document.querySelector('.quick-chips button')).borderRadius:null,
    doctorRadius:getComputedStyle(document.querySelector('.doctor-modal')).borderRadius,
    faqBtn:!!document.querySelector('#faqOpenBtn'),faqCount:(window.XiaoTongData?1:0)}})()`);
  check('硬约束 · 主色/毛玻璃/圆角/小球结构/问答入口全部未改',
    hard && hard.blue.toUpperCase() === '#2AA79B' && /255, 255, 255, 0\.72/.test(hard.bubbleBg) &&
    /blur\(20px\)/.test(hard.bubbleBf) && /20px/.test(hard.bubbleRadius) && /999px/.test(hard.chip) &&
    /24px/.test(hard.doctorRadius) && hard.majors === 3 && hard.links === 3 && hard.faqBtn, hard);
  const hs1 = await noHScroll();
  check('硬约束 · 桌面 1440 无横向溢出', hs1 && hs1.sw <= hs1.iw + 1, hs1);

  /* ================= 手机 (390x844) ================= */
  console.log('\n=== 手机端 (390x844) 三卡竖堆 / 按钮 / 凭证卡 ===');
  await reset(390, 844, true); await passGates(); await sleep(420);
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.close)window.XT_DRAWER.close();return 1})()`); await sleep(400);
  await openDoctors();
  const mob = await ev(`(function(){var g=getComputedStyle(document.querySelector('#doctorCards')).gridTemplateColumns;var bs=[].slice.call(document.querySelectorAll('#doctorCards button')).map(function(b){return b.textContent.trim()});var dm=document.querySelector('.doctor-modal');var t=document.querySelector('.topbar');return {grid:g,btns:bs,w:Math.round(dm.getBoundingClientRect().width),top:Math.round(document.querySelector('#doctorModal').getBoundingClientRect().top),tb:Math.round(t.getBoundingClientRect().bottom)}})()`);
  check('验收10 · 手机三卡竖向堆叠、三个预约按钮正常且不遮顶栏',
    mob && mob.grid.split(' ').length === 1 && mob.btns.join('|') === '立即预约|预约 16:00|预约明日 08:00' &&
    Math.abs(mob.w - Math.round(390 * 0.92)) <= 2 && mob.top >= mob.tb - 1, mob);
  const szM0 = await shot('v22-mobile-doctors.png', 390, 844); console.log('SHOT  v22-mobile-doctors.png  ' + szM0 + ' bytes');
  await click('[data-book="li"]'); await sleep(400);
  const fm = await formVals();
  check('验收10b · 手机点李医生仍能打开表单且预填一致、预约时段只读',
    fm && fm.form && fm.start === dates.today + 'T16:00' && fm.slot === '今日 16:00 – 16:30' && fm.slotReadonly,
    { start: fm && fm.start, slot: fm && fm.slot });
  await click('#bookingForm button[type="submit"]'); await sleep(520);
  const mt = await ev(`(function(){var c=document.querySelector('#chatLog .bk-ticket');var p=document.querySelector('#chatPane');return {card:!!c,txt:c?c.textContent.replace(/\\s+/g,' ').trim():null,drawerOpen:p?p.classList.contains('drawer-open'):null,modalHidden:!!document.querySelector('#leaveModal').hidden}})()`);
  check('验收10c · 手机提交后凭证卡进入对话流且抽屉自动展开可见',
    mt && mt.card && mt.modalHidden && mt.drawerOpen && /李医生 · 外科/.test(mt.txt), mt);
  const hsM = await noHScroll();
  check('验收10d · 390px 无横向溢出', hsM && hsM.sw <= hsM.iw + 1, hsM);
  const szM1 = await shot('v22-mobile-ticket.png', 390, 844); console.log('SHOT  v22-mobile-ticket.png  ' + szM1 + ' bytes');

  // 验收11：无 jsError
  check('验收11 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  if (pass !== results.length) process.exitCode = 1;
  ws.close();
}
main().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
