/* 校园健康助手 · v19 医生列表弹窗 + 预约流程 专项验收
 * 用法：node e2e-v19.js   依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖 13 条验收 + 硬约束回归：
 *   1 底部第二按钮为「我的预约」        2 点我的预约出现空态提示
 *   3 点校医院球弹医生列表、三卡齐全   4 张医生在线绿态+绿色实心立即预约
 *   5 李/王灰态+查看排班               6 查看排班展开提示
 *   7 立即预约→关医生弹窗→表单六项预填  8 请假理由文案
 *   9 表单顶部模拟演示说明             10 提交显示成功提示
 *   11 手机弹窗不溢出、卡片竖堆        12 小球动画/拖动不受影响
 *   13 全流程无 jsError
 *   + 弹窗不遮挡顶栏 / 无横向滚动 / 有记录时我的预约展示列表 / 医生状态固定
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
    if (w) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile_ }); await sleep(360); await ev('window.scrollTo(0,0)'); }
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
  const docModal = () => ev(`(function(){var m=document.querySelector('#doctorModal');if(!m)return null;var d=document.querySelector('.doctor-modal');var t=document.querySelector('.topbar');var mr=d?d.getBoundingClientRect():null;var tr=t?t.getBoundingClientRect():null;return {open:!m.hidden,w:mr?Math.round(mr.width):0,h:mr?Math.round(mr.height):0,top:mr?Math.round(mr.top):0,radius:d?getComputedStyle(d).borderRadius:'',backdropTop:Math.round(m.getBoundingClientRect().top),topbarBottom:tr?Math.round(tr.bottom):0}})()`);
  const cardsInfo = () => ev(`(function(){
    var g=document.querySelector('#doctorCards');
    var a=[].slice.call(document.querySelectorAll('#doctorCards .doc-card')).map(function(e){
      var st=e.querySelector('.dc-status'), av=e.querySelector('.dc-avatar'), btn=e.querySelector('.dc-btn');
      var rows=[].slice.call(e.querySelectorAll('.dc-row')).map(function(r){return r.textContent});
      var cs=st?getComputedStyle(st):null, r=e.getBoundingClientRect();
      return {id:e.getAttribute('data-doc'),
        name:e.querySelector('.dc-id b')?e.querySelector('.dc-id b').textContent:null,
        dept:e.querySelector('.dc-id span')?e.querySelector('.dc-id span').textContent:null,
        avatar:av?{w:Math.round(av.getBoundingClientRect().width),h:Math.round(av.getBoundingClientRect().height),radius:getComputedStyle(av).borderRadius,bg:getComputedStyle(av).backgroundColor}:null,
        status:st?st.textContent.trim():null, statusClass:st?st.className:null, statusColor:cs?cs.color:null,
        rows:rows, btn:btn?btn.textContent.trim():null, btnClass:btn?btn.className:null,
        btnBg:btn?getComputedStyle(btn).backgroundColor:null,
        top:Math.round(r.top), left:Math.round(r.left), w:Math.round(r.width)};
    });
    a.push({grid:g?getComputedStyle(g).gridTemplateColumns:null});
    return a;
  })()`);

  /* ================= 桌面端 (1440) ================= */
  console.log('\n=== 桌面端 (1440x1000) 去重合 + 医生列表 + 预约流程 ===');
  await reset(1440, 1000, false);
  await passGates();
  await sleep(400);

  // 验收1：底部第二按钮文案
  const btns = await ev(`(function(){return [].slice.call(document.querySelectorAll('.composer-actions .ca-btn')).map(function(b){return b.textContent.trim()})})()`);
  check('验收1 · 底部第二按钮为「我的预约」且首按钮保留',
    btns && btns.length === 2 && /30 条高频问答/.test(btns[0]) && /我的预约/.test(btns[1]) && !/预约校医/.test(btns[1]), btns);

  // 验收2：点我的预约 → 空态提示
  await click('#bookBtn'); await sleep(350);
  const emptyState = await ev(`(function(){var l=document.querySelector('#chatLog');var m=document.querySelector('#leaveModal');return {txt:l.textContent,modalOpen:!!(m&&!m.hidden)}})()`);
  check('验收2 · 点「我的预约」对话面板出现空态提示',
    emptyState && /你还没有预约记录。点右侧中间的校医院球可以发起预约/.test(emptyState.txt) && !emptyState.modalOpen, { hasEmpty: emptyState && /你还没有预约记录/.test(emptyState.txt), modalOpen: emptyState && emptyState.modalOpen });

  // 验收12（回归）：小球视图/虚线仍在、中心球可点
  const cR = await centerRect();
  const preSplit = await ev(`(function(){return {links:document.querySelectorAll('#orbLinkSvg .orb-link').length,majors:[].slice.call(document.querySelectorAll('.orb-major')).filter(function(e){return !e.hidden}).length,center:!!document.querySelector('#orbCenter')}})()`);
  check('验收12a · 改版后小球视图未受影响(3大球/3虚线/中心球)', preSplit && preSplit.links === 3 && preSplit.majors === 3 && preSplit.center, preSplit);

  // 验收3：点校医院球 → 医生列表弹窗
  await tap(cR.cx, cR.cy); await sleep(650);
  const dm = await docModal();
  const cards = await cardsInfo();
  const cardList = (cards || []).filter(c => c.id);
  check('验收3 · 点校医院球弹出医生列表弹窗,三个医生卡片齐全',
    dm && dm.open && cardList.length === 3 && /校医院 · 今日值班/.test(await ev(`document.querySelector('#doctorTitle').textContent`)),
    { open: dm && dm.open, n: cardList.length, w: dm && dm.w, radius: dm && dm.radius });
  check('验收3b · 桌面弹窗 720px 宽 / 圆角20px / 副标题正确',
    dm && Math.abs(dm.w - 720) <= 2 && /20px/.test(dm.radius) &&
    /三个时段轮值，当前值班医生可立即预约/.test(await ev(`document.querySelector('.doctor-sub').textContent`)),
    { w: dm && dm.w, radius: dm && dm.radius });

  // 硬约束：弹窗不遮挡顶栏
  check('硬约束 · 医生弹窗不遮挡顶栏(遮罩起点≥顶栏下缘)',
    dm && dm.backdropTop >= dm.topbarBottom - 1, { backdropTop: dm && dm.backdropTop, topbarBottom: dm && dm.topbarBottom });
  const hs1 = await noHScroll();
  check('硬约束 · 桌面无横向滚动条', hs1 && hs1.sw <= hs1.iw + 1, hs1);

  const szD = await shot('v19-desktop-doctors.png', 1440, 1000); console.log('SHOT  v19-desktop-doctors.png  ' + szD + ' bytes');

  // 验收4：张医生绿态 + 绿色实心立即预约
  const zhang = cardList.find(c => c.id === 'zhang');
  check('验收4 · 张医生「当前在线」绿色状态 + 绿色实心「立即预约」',
    zhang && zhang.name === '张医生' && zhang.dept === '内科' && /当前在线/.test(zhang.status) &&
    /is-online/.test(zhang.statusClass) && zhang.btn === '立即预约' && /is-primary/.test(zhang.btnClass) &&
    /42, 167, 155/.test(zhang.btnBg) && zhang.avatar && Math.abs(zhang.avatar.w - 48) <= 2,
    { name: zhang && zhang.name, status: zhang && zhang.status, color: zhang && zhang.statusColor, btn: zhang && zhang.btn, btnBg: zhang && zhang.btnBg, avatar: zhang && zhang.avatar });

  // 验收5：李/王灰态 + 查看排班
  const li = cardList.find(c => c.id === 'li'), wang = cardList.find(c => c.id === 'wang');
  check('验收5 · 李医生/王医生灰色状态 + 「查看排班」描边按钮',
    li && wang && /16:00 后在线/.test(li.status) && /is-off/.test(li.statusClass) && li.btn === '查看排班' && /is-ghost/.test(li.btnClass) &&
    /明日 08:00 在线/.test(wang.status) && /is-off/.test(wang.statusClass) && wang.btn === '查看排班',
    { li: li && { s: li.status, c: li.statusColor, b: li.btn }, wang: wang && { s: wang.status, c: wang.statusColor, b: wang.btn } });
  check('验收5b · 三卡时段/擅长文案正确且桌面横向排列',
    cardList.length === 3 && /08:00 – 16:00/.test(zhang.rows.join('')) && /感冒发热、肠胃不适/.test(zhang.rows.join('')) &&
    /外伤处理、扭伤/.test(li.rows.join('')) && /综合诊疗、健康咨询/.test(wang.rows.join('')) &&
    Math.abs(zhang.top - li.top) <= 2 && Math.abs(li.top - wang.top) <= 2,
    (cards || []).filter(c => c.grid).map(c => c.grid));

  // 验收6：点查看排班 → 展开提示
  await click('[data-sched="li"]'); await sleep(200);
  const schedLi = await ev(`(function(){var e=document.querySelector('#sched-li');if(!e)return null;var cs=getComputedStyle(e);return {hidden:e.hidden,txt:e.textContent.trim(),size:cs.fontSize,color:cs.color,borderLeft:cs.borderLeftWidth}})()`);
  check('验收6 · 点「查看排班」卡片下方展开提示(13px/#8A9694/左3px竖线)',
    schedLi && !schedLi.hidden && /李医生今日 16:00 开始值班，可先提交预约，医生上线后会通知你/.test(schedLi.txt) &&
    schedLi.size === '13px' && /138, 150, 148/.test(schedLi.color) && parseFloat(schedLi.borderLeft) === 3, schedLi);

  // 验收7：点立即预约 → 关医生弹窗、开表单、六项预填
  await click('[data-book="zhang"]'); await sleep(400);
  const form = await ev(`(function(){var m=document.querySelector('#leaveModal');var d=document.querySelector('#doctorModal');var f=document.querySelector('#bookingForm');function v(s){var e=document.querySelector(s);return e?e.value:null}return {leaveOpen:!!(m&&!m.hidden),docOpen:!!(d&&!d.hidden),form:!!f,bookingMode:!!(m&&m.classList.contains('booking-mode')),type:(document.querySelector('input[name=lvType]:checked')||{}).value||null,start:v('#lvStart'),end:v('#lvEnd'),duration:v('#lvDuration'),doctor:v('#lvDoctor'),reason:v('#lvReason'),name:v('#lvName'),sid:v('#lvSid'),cls:v('#lvClass'),counselor:v('#lvCounselor'),note:document.querySelector('.bk-note')?document.querySelector('.bk-note').textContent.trim():null,submit:f?f.querySelector('button[type=submit]').textContent.trim():null}})()`);
  check('验收7 · 点立即预约关闭医生弹窗、打开表单、六项预填',
    form && form.leaveOpen && !form.docOpen && form.form && form.type === '病假' &&
    form.start && form.end && /4 小时（半天）/.test(form.duration || '') && /张医生（内科）/.test(form.doctor || '') &&
    !!form.reason && !!form.name && !!form.sid,
    form && { leaveOpen: form.leaveOpen, docOpen: form.docOpen, type: form.type, start: form.start, end: form.end, duration: form.duration, doctor: form.doctor, cls: form.cls, counselor: form.counselor });
  // 时间：今天整点 + 4 小时
  const timeOk = await ev(`(function(){var s=new Date(document.querySelector('#lvStart').value),e=new Date(document.querySelector('#lvEnd').value),n=new Date();return {sameDay:s.getFullYear()===n.getFullYear()&&s.getMonth()===n.getMonth()&&s.getDate()===n.getDate(),hourFloor:s.getMinutes()===0&&s.getSeconds()===0,diffH:(e-s)/3600000}})()`);
  check('验收7b · 开始=今天当前整点、结束=开始+4小时',
    timeOk && timeOk.sameDay && timeOk.hourFloor && timeOk.diffH === 4, timeOk);

  // 验收8：请假理由文案
  check('验收8 · 请假理由为指定文案',
    form && form.reason === '因身体不适，需前往校医院就诊，申请病假半天（4 小时）。', { reason: form && form.reason });

  // 验收9：表单顶部模拟演示说明
  const noteStyle = await ev(`(function(){var e=document.querySelector('.bk-note');if(!e)return null;var cs=getComputedStyle(e);return {size:cs.fontSize,color:cs.color,bg:cs.backgroundColor}})()`);
  check('验收9 · 表单顶部模拟演示说明(12px/#8A9694/#F6F8F7)',
    form && /本表单为模拟演示，不会提交到任何真实系统/.test(form.note || '') && form.submit === '提交请假申请' &&
    noteStyle && noteStyle.size === '12px' && /138, 150, 148/.test(noteStyle.color) && /246, 248, 247/.test(noteStyle.bg),
    { note: form && form.note, submit: form && form.submit, style: noteStyle });

  const szF = await shot('v19-desktop-booking-form.png', 1440, 1000); console.log('SHOT  v19-desktop-booking-form.png  ' + szF + ' bytes');

  // 验收10：点提交 → 成功提示
  await click('#bookingForm button[type="submit"]'); await sleep(350);
  const success = await ev(`(function(){var h=document.querySelector('.bk-success h3');var b=document.querySelector('#bookingDone');return {txt:h?h.textContent.trim():null,done:!!b}})()`);
  check('验收10 · 点提交显示成功提示「请假申请已提交，等待辅导员审批。」',
    success && success.txt === '请假申请已提交，等待辅导员审批。' && success.done, success);
  const szS = await shot('v19-desktop-success.png', 1440, 1000); console.log('SHOT  v19-desktop-success.png  ' + szS + ' bytes');

  // 补充：有记录时「我的预约」展示列表（医生/时段/状态）
  await click('#bookingDone'); await sleep(250);
  await click('#bookBtn'); await sleep(350);
  const listState = await ev(`(function(){var l=document.querySelector('#chatLog');var items=[].slice.call(l.querySelectorAll('.bk-item'));return {n:items.length,txt:l.textContent}})()`);
  check('补充 · 有预约记录时「我的预约」展示列表(医生/时段/状态)',
    listState && listState.n >= 1 && /张医生（内科）/.test(listState.txt) && /08:00 – 16:00/.test(listState.txt) && /等待辅导员审批/.test(listState.txt), listState);
  const szL = await shot('v19-desktop-mybookings.png', 1440, 1000); console.log('SHOT  v19-desktop-mybookings.png  ' + szL + ' bytes');

  // 验收12（回归）：小球分裂动画 + 拖动旋转仍正常
  const entered = await ev(`(function(){return 1})()`);
  const majors = await ev(`(function(){var a=[].slice.call(document.querySelectorAll('.orb-major:not([hidden])'));return a.map(function(e){var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})})()`);
  let sub = false;
  for (const m of (majors || [])) { await tap(m.cx, m.cy); await sleep(700); sub = await ev(`(function(){var b=document.querySelector('#orbBack');return !!b&&!b.hidden})()`); if (sub) break; }
  check('验收12b · 点种类球三段式分裂仍正常(进入中球层)', sub, { sub });
  if (sub) { await ev(`(function(){var b=document.querySelector('#orbBack');if(b)b.click();return 1})()`); await sleep(750); }
  const before = await ev(`(function(){return [].slice.call(document.querySelectorAll('#orbLinkSvg .orb-link')).map(function(e){return e.getAttribute('d')})})()`);
  await ev(`(function(){if(window.__orbApply)window.__orbApply(28,12);return 1})()`); await sleep(220);
  const after = await ev(`(function(){return [].slice.call(document.querySelectorAll('#orbLinkSvg .orb-link')).map(function(e){return e.getAttribute('d')})})()`);
  check('验收12c · 拖动旋转投影与连线重算仍正常', before && after && before.length === 3 && after.some((d, i) => d !== before[i]), { before, after });

  /* ================= 手机端 (390) ================= */
  console.log('\n=== 手机端 (390x844) 医生弹窗 ===');
  await reset(390, 844, true);
  await passGates();
  await sleep(400);
  const cM = await centerRect();
  await tap(cM.cx, cM.cy); await sleep(650);
  const dmM = await docModal();
  const cardsM = (await cardsInfo() || []).filter(c => c.id);
  const gridM = (await cardsInfo() || []).filter(c => c.grid).map(c => c.grid)[0];
  const hsM = await noHScroll();
  check('验收11 · 手机端弹窗 92vw 不溢出、三卡竖向堆叠',
    dmM && dmM.open && Math.abs(dmM.w - Math.round(390 * 0.92)) <= 2 && cardsM.length === 3 &&
    cardsM[0].top < cardsM[1].top && cardsM[1].top < cardsM[2].top &&
    hsM && hsM.sw <= hsM.iw + 1,
    { w: dmM && dmM.w, expect: Math.round(390 * 0.92), grid: gridM, tops: cardsM.map(c => c.top), hs: hsM });
  check('硬约束 · 手机端弹窗不遮挡顶栏 / 无横向滚动',
    dmM && dmM.backdropTop >= dmM.topbarBottom - 1 && hsM.sw <= hsM.iw + 1,
    { backdropTop: dmM && dmM.backdropTop, topbarBottom: dmM && dmM.topbarBottom, hs: hsM });
  const szM = await shot('v19-mobile-doctors.png', 390, 844); console.log('SHOT  v19-mobile-doctors.png  ' + szM + ' bytes');

  // 手机端也能完成预约流程
  await click('[data-book="zhang"]'); await sleep(400);
  const formM = await ev(`(function(){var m=document.querySelector('#leaveModal');var card=m.querySelector('.modal');return {leaveOpen:!!(m&&!m.hidden),docOpen:!!(document.querySelector('#doctorModal')&&!document.querySelector('#doctorModal').hidden),w:Math.round(card.getBoundingClientRect().width),backdropW:Math.round(m.getBoundingClientRect().width),left:Math.round(card.getBoundingClientRect().left),radius:getComputedStyle(card).borderRadius}})()`);
  check('验收11b · 手机端预约表单 92vw 居中圆角20px、医生弹窗已关闭',
    formM && formM.leaveOpen && !formM.docOpen && Math.abs(formM.w - Math.round(390 * 0.92)) <= 2 &&
    Math.abs(formM.left - Math.round((390 - formM.w) / 2)) <= 2 && /20px/.test(formM.radius), formM);
  const hsM2 = await noHScroll();
  check('验收11c · 手机端预约表单无横向滚动', hsM2 && hsM2.sw <= hsM2.iw + 1, hsM2);
  const szMF = await shot('v19-mobile-booking-form.png', 390, 844); console.log('SHOT  v19-mobile-booking-form.png  ' + szMF + ' bytes');

  // 硬约束：医生状态固定（不随真实时间变化）—— 同一时间两次读取一致
  const stat1 = await ev(`(function(){return [].slice.call(document.querySelectorAll('#doctorCards .dc-status')).map(function(e){return e.textContent.trim()})})()`);
  await sleep(1200);
  const stat2 = await ev(`(function(){var m=document.querySelector('#doctorModal');return [].slice.call(document.querySelectorAll('#doctorCards .dc-status')).map(function(e){return e.textContent.trim()})})()`);
  check('硬约束 · 医生状态固定为演示值(张医生始终当前在线)',
    stat1 && stat1.length === 3 && JSON.stringify(stat1) === JSON.stringify(stat2) && /当前在线/.test(stat1[0]), { stat1, stat2 });

  // 验收13：无 jsError
  check('验收13 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 6));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  if (pass !== results.length) process.exitCode = 1;
  ws.close();
}
main().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
