/* 校园健康助手 · v23 真实时间驱动的医生状态与预约时刻 专项验收
 * 用法：node e2e-v23.js [URL]     依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 通过 Page.addScriptToEvaluateOnNewDocument 冻结页面 Date（URL ?xtNow= 指定时刻），
 * 覆盖 00:00 / 00:01 / 03:20 / 08:00 / 10:40 / 16:00 / 21:05 / 23:59 等时刻。
 * 验收 1-11 + 硬约束（小球/30问答/我要请假/主色/毛玻璃/圆角/无横向溢出/无过去时刻）
 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const DIR = process.env.E2E_DIR || 'E:/gzkj/';   /* 线上复跑时用 E2E_DIR 分流截图 */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

/* 冻结时钟：URL 带 xtNow=YYYY-MM-DDTHH:mm:ss 时，把页面 Date 固定到该本地时刻。
   保留多参数构造 / Date.now / parse / UTC / prototype，避免影响动画与其它既有逻辑。 */
const FAKE_HOOK = `(function(){
  var q = new URLSearchParams(location.search).get('xtNow');
  /* 线上分享链接会在会话建立后把地址栏参数抹成 /?，reload 时从会话存储取回时刻 */
  if (q) { try { sessionStorage.setItem('__xtNow', q); } catch (e) {} }
  else { try { q = sessionStorage.getItem('__xtNow'); } catch (e) {} }
  if (!q) return;
  var Native = Date, fixed = Native.parse(q);
  if (!fixed) return;
  function MockDate() {
    if (!(this instanceof MockDate)) return new Native(fixed).toString();
    var a = Array.prototype.slice.call(arguments);
    if (!a.length) return new Native(fixed);
    return Reflect.construct(Native, a);
  }
  MockDate.prototype = Native.prototype;
  MockDate.now = function () { return fixed; };
  MockDate.parse = Native.parse;
  MockDate.UTC = Native.UTC;
  window.Date = MockDate;
  window.__XT_NOW__ = q;
})();`;

/* 每个场景的期望值独立写死，避免用被测逻辑去算期望 */
const SCENES = [
  {
    t: '2026-11-11T21:05:00', floor: '2026-11-11T21:00', online: 'li', ymd: '20261111',
    status: { zhang: '明日 08:00 在线', li: '当前在线', wang: '明日 00:00 在线' },
    btn: { zhang: '预约 明日 08:00', li: '立即预约', wang: '预约 明日 00:00' },
    form: {
      li:    { slot: '今日 21:00 – 21:30', start: '2026-11-11T21:00', end: '2026-11-12T01:00', sh: '今日 21:00', eh: '次日 01:00',
               reason: '因身体不适，需前往校医院就诊，申请病假半天（4 小时）。' },
      zhang: { slot: '明日 08:00 – 08:30', start: '2026-11-12T08:00', end: '2026-11-12T12:00', sh: '明日 08:00', eh: '明日 12:00',
               reason: '因身体不适，需前往校医院就诊，预约张医生（内科）明日 08:00 门诊，申请病假半天（4 小时）。' },
      wang:  { slot: '明日 00:00 – 00:30', start: '2026-11-12T00:00', end: '2026-11-12T04:00', sh: '明日 00:00', eh: '明日 04:00',
               reason: '因身体不适，需前往校医院就诊，预约王医生（全科）明日 00:00 门诊，申请病假半天（4 小时）。' }
    }
  },
  {
    t: '2026-11-11T03:20:00', floor: '2026-11-11T03:00', online: 'wang', ymd: '20261111',
    status: { zhang: '今日 08:00 后可约', li: '今日 16:00 后可约', wang: '当前在线' },
    btn: { zhang: '预约 今日 08:00', li: '预约 今日 16:00', wang: '立即预约' },
    form: {
      zhang: { slot: '今日 08:00 – 08:30', start: '2026-11-11T08:00', end: '2026-11-11T12:00', sh: '今日 08:00', eh: '今日 12:00',
               reason: '因身体不适，需前往校医院就诊，预约张医生（内科）今日 08:00 门诊，申请病假半天（4 小时）。' },
      li:    { slot: '今日 16:00 – 16:30', start: '2026-11-11T16:00', end: '2026-11-11T20:00', sh: '今日 16:00', eh: '今日 20:00',
               reason: '因身体不适，需前往校医院就诊，预约李医生（外科）今日 16:00 门诊，申请病假半天（4 小时）。' },
      wang:  { slot: '今日 03:00 – 03:30', start: '2026-11-11T03:00', end: '2026-11-11T07:00', sh: '今日 03:00', eh: '今日 07:00',
               reason: '因身体不适，需前往校医院就诊，申请病假半天（4 小时）。' }
    }
  },
  {
    t: '2026-11-11T10:40:00', floor: '2026-11-11T10:00', online: 'zhang', ymd: '20261111',
    status: { zhang: '当前在线', li: '今日 16:00 后可约', wang: '明日 00:00 在线' },
    btn: { zhang: '立即预约', li: '预约 今日 16:00', wang: '预约 明日 00:00' },
    form: {
      zhang: { slot: '今日 10:00 – 10:30', start: '2026-11-11T10:00', end: '2026-11-11T14:00', sh: '今日 10:00', eh: '今日 14:00',
               reason: '因身体不适，需前往校医院就诊，申请病假半天（4 小时）。' },
      li:    { slot: '今日 16:00 – 16:30', start: '2026-11-11T16:00', end: '2026-11-11T20:00', sh: '今日 16:00', eh: '今日 20:00',
               reason: '因身体不适，需前往校医院就诊，预约李医生（外科）今日 16:00 门诊，申请病假半天（4 小时）。' },
      wang:  { slot: '明日 00:00 – 00:30', start: '2026-11-12T00:00', end: '2026-11-12T04:00', sh: '明日 00:00', eh: '明日 04:00',
               reason: '因身体不适，需前往校医院就诊，预约王医生（全科）明日 00:00 门诊，申请病假半天（4 小时）。' }
    }
  },
  {
    t: '2026-11-11T23:59:00', floor: '2026-11-11T23:00', online: 'li', ymd: '20261111',
    status: { zhang: '明日 08:00 在线', li: '当前在线', wang: '明日 00:00 在线' },
    btn: { zhang: '预约 明日 08:00', li: '立即预约', wang: '预约 明日 00:00' },
    form: {
      li:    { slot: '今日 23:00 – 23:30', start: '2026-11-11T23:00', end: '2026-11-12T03:00', sh: '今日 23:00', eh: '次日 03:00',
               reason: '因身体不适，需前往校医院就诊，申请病假半天（4 小时）。' },
      wang:  { slot: '明日 00:00 – 00:30', start: '2026-11-12T00:00', end: '2026-11-12T04:00', sh: '明日 00:00', eh: '明日 04:00',
               reason: '因身体不适，需前往校医院就诊，预约王医生（全科）明日 00:00 门诊，申请病假半天（4 小时）。' }
    }
  },
  {
    t: '2026-11-12T00:01:00', floor: '2026-11-12T00:00', online: 'wang', ymd: '20261112',
    status: { zhang: '今日 08:00 后可约', li: '今日 16:00 后可约', wang: '当前在线' },
    btn: { zhang: '预约 今日 08:00', li: '预约 今日 16:00', wang: '立即预约' },
    form: {
      wang:  { slot: '今日 00:00 – 00:30', start: '2026-11-12T00:00', end: '2026-11-12T04:00', sh: '今日 00:00', eh: '今日 04:00',
               reason: '因身体不适，需前往校医院就诊，申请病假半天（4 小时）。' },
      zhang: { slot: '今日 08:00 – 08:30', start: '2026-11-12T08:00', end: '2026-11-12T12:00', sh: '今日 08:00', eh: '今日 12:00',
               reason: '因身体不适，需前往校医院就诊，预约张医生（内科）今日 08:00 门诊，申请病假半天（4 小时）。' }
    }
  },
  {
    t: '2026-11-11T08:00:00', floor: '2026-11-11T08:00', online: 'zhang', ymd: '20261111',
    status: { zhang: '当前在线', li: '今日 16:00 后可约', wang: '明日 00:00 在线' },
    btn: { zhang: '立即预约', li: '预约 今日 16:00', wang: '预约 明日 00:00' }, form: {}
  },
  {
    t: '2026-11-11T16:00:00', floor: '2026-11-11T16:00', online: 'li', ymd: '20261111',
    status: { zhang: '明日 08:00 在线', li: '当前在线', wang: '明日 00:00 在线' },
    btn: { zhang: '预约 明日 08:00', li: '立即预约', wang: '预约 明日 00:00' }, form: {}
  },
  {
    t: '2026-11-11T00:00:00', floor: '2026-11-11T00:00', online: 'wang', ymd: '20261111',
    status: { zhang: '今日 08:00 后可约', li: '今日 16:00 后可约', wang: '当前在线' },
    btn: { zhang: '预约 今日 08:00', li: '预约 今日 16:00', wang: '立即预约' }, form: {}
  }
];

/* 校验「今日 HH:MM」不得早于当前整点；明日 / 次日均天然在未来 */
function labelNotPast(label, floor) {
  const hh = floor.slice(11, 16), re = /(今日|明日|次日) (\d{2}):(\d{2})/g;
  let m, seen = false;
  while ((m = re.exec(label))) { seen = true; if (m[1] === '今日' && (m[2] + ':' + m[3]) < hh) return false; }
  return seen;
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
  let mobile_ = false;
  const shot = async (file, w, h) => {
    if (w) { await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: !!mobile_ }); await sleep(340); }
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  const setViewport = async (w, h, mobile) => { mobile_ = mobile; await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 }); await sleep(380); };
  const mouse = async (type, x, y, opts = {}) => { await send('Input.dispatchMouseEvent', Object.assign({ type, x, y }, opts)); };
  const tapAt = async (x, y) => { await mouse('mousePressed', x, y, { button: 'left', clickCount: 1 }); await mouse('mouseReleased', x, y, { button: 'left', clickCount: 1 }); await sleep(90); };
  const touchTap = async (x, y) => { await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(20); await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(110); };
  const tap = (x, y) => mobile_ ? touchTap(x, y) : tapAt(x, y);
  const withNow = t => URL_ + (URL_.includes('?') ? '&' : '?') + 'xtNow=' + encodeURIComponent(t);
  const noHScroll = () => ev(`(function(){return {sw:document.documentElement.scrollWidth, iw:window.innerWidth}})()`);

  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_HOOK });
  let firstReset = true;
  async function reset(w, h, mobile, t) {
    await setViewport(w, h, mobile);
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    /* 只在首次导航前丢弃「进场时旧页面」的残留异常，其后所有场景的异常累计统计 */
    if (firstReset) { jsErrors.length = 0; firstReset = false; }
    await send('Page.navigate', { url: withNow(t) }); await sleep(1450);
    await ev(`(function(){try{localStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1750);
  }
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(500);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(150);
    await click('#consentAgree'); await sleep(600);
    if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(300); }
  }
  const centerRect = () => ev(`(function(){var c=document.querySelector('#orbCenter');if(!c)return null;var r=c.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}}())`);
  const openDoctors = async () => { const c = await centerRect(); await tap(c.cx, c.cy); await sleep(600); };
  const closeForm = async () => { await click('#closeModal'); await sleep(230); };
  const cards = () => ev(`(function(){
    var out=[].slice.call(document.querySelectorAll('#doctorCards .doc-card')).map(function(c){
      var b=c.querySelector('button'), s=c.querySelector('.dc-status'), dot=s?getComputedStyle(s.querySelector('i')):null;
      return {id:c.getAttribute('data-doc'),status:s?s.textContent.trim():null,cls:s?s.className:null,
        dot:dot?dot.backgroundColor:null,border:dot?dot.borderTopWidth:null,color:s?getComputedStyle(s).color:null,
        btn:b?b.textContent.trim():null,btnCls:b?b.className:null,on:c.classList.contains('is-on'),
        rows:[].slice.call(c.querySelectorAll('.dc-row')).map(function(r){return r.textContent.trim()})};});
    return {list:out,grid:getComputedStyle(document.querySelector('#doctorCards')).gridTemplateColumns,
      text:document.querySelector('#doctorModal').textContent.replace(/\\s+/g,' '),
      now:window.__XT_NOW__||null};
  })()`);
  const formVals = () => ev(`(function(){
    function v(s){var e=document.querySelector(s);return e?e.value:null}
    function h(s){var e=document.querySelector(s);return e?e.textContent.trim():null}
    var s=document.querySelector('#lvSlot');
    return {title:h('#leaveTitle'),form:!!document.querySelector('#bookingForm'),doctor:v('#lvDoctor'),
      slot:v('#lvSlot'),slotReadonly:!!(s&&s.readOnly),start:v('#lvStart'),end:v('#lvEnd'),
      sh:h('label[for=lvStart] .bk-dayhint'),eh:h('label[for=lvEnd] .bk-dayhint'),
      startTitle:document.querySelector('#lvStart')?document.querySelector('#lvStart').getAttribute('title'):null,
      endTitle:document.querySelector('#lvEnd')?document.querySelector('#lvEnd').getAttribute('title'):null,
      duration:v('#lvDuration'),reason:v('#lvReason'),name:v('#lvName'),sid:v('#lvSid'),cls:v('#lvClass'),
      counselor:v('#lvCounselor'),type:(document.querySelector('input[name=lvType]:checked')||{}).value||null,
      submit:(document.querySelector('#bookingForm button[type=submit]')||{}).textContent};
  })()`);
  const doctorName = { zhang: '张医生（内科）', li: '李医生（外科）', wang: '王医生（全科）' };

  /* ================= 多时刻桌面验收 ================= */
  for (const sc of SCENES) {
    const tag = sc.t.slice(5, 16).replace(/[-:T]/g, '');
    console.log('\n=== 桌面 1440x1000 · 冻结时刻 ' + sc.t + ' ===');
    await reset(1440, 1000, false, sc.t);
    await passGates();
    const clock = await ev(`(function(){return {now:new Date().toISOString(),local:new Date().toString(),stamp:Date.now(),hook:window.__XT_NOW__||null}})()`);
    check('时钟注入 · ' + sc.t + ' 页面 Date 已冻结', clock && clock.hook === sc.t && new Date(clock.stamp).getTime() === new Date(sc.t).getTime(), clock && { hook: clock.hook, stamp: clock.stamp });
    await openDoctors();
    const c = await cards();
    const by = {}; (c && c.list || []).forEach(x => { by[x.id] = x; });
    const onlineIds = (c && c.list || []).filter(x => /is-online/.test(x.cls)).map(x => x.id);
    check('验收1 · ' + sc.t + ' 当前时段恰好一人在线且为 ' + sc.online,
      c && c.list.length === 3 && onlineIds.length === 1 && onlineIds[0] === sc.online &&
      by[sc.online] && /当前在线/.test(by[sc.online].status) && by[sc.online].on,
      { online: onlineIds, status: c && c.list.map(x => x.id + ':' + x.status) });
    check('验收2 · ' + sc.t + ' 另两人状态文案与真实下一次值班匹配',
      c && ['zhang', 'li', 'wang'].every(id => by[id] && by[id].status === sc.status[id]),
      c && c.list.map(x => x.id + ':' + x.status));
    check('验收2b · 在线绿色实心点 / 不在线灰色空心点',
      c && /34, 181, 115/.test(by[sc.online].dot) && /31, 154, 107/.test(by[sc.online].color) &&
      ['zhang', 'li', 'wang'].filter(id => id !== sc.online).every(id => /138, 150, 148/.test(by[id].color) && by[id].dot === 'rgba(0, 0, 0, 0)'),
      c && c.list.map(x => x.id + ':' + x.dot + '/' + x.color));
    check('验收7 · ' + sc.t + ' 三个按钮文字随真实时间计算',
      c && ['zhang', 'li', 'wang'].every(id => by[id] && by[id].btn === sc.btn[id]) &&
      /is-primary/.test(by[sc.online].btnCls) &&
      ['zhang', 'li', 'wang'].filter(id => id !== sc.online).every(id => /is-outline/.test(by[id].btnCls)),
      c && c.list.map(x => x.id + ':' + x.btn));
    check('硬约束 · 卡片布局 / 头像 / 擅长描述保持不变且无「查看排班」',
      c && c.grid.split(' ').length === 3 && !/查看排班/.test(c.text) &&
      ['zhang', 'li', 'wang'].every(id => by[id] && by[id].rows.length === 2 && /擅长/.test(by[id].rows[1])),
      { grid: c && c.grid });
    if (sc.t === '2026-11-11T21:05:00') {
      const s0 = await shot('v23-desktop-2105-doctors.png', 1440, 1000); console.log('SHOT  v23-desktop-2105-doctors.png  ' + s0 + ' bytes');
    }
    if (sc.t === '2026-11-11T03:20:00') {
      const s0 = await shot('v23-desktop-0320-doctors.png', 1440, 1000); console.log('SHOT  v23-desktop-0320-doctors.png  ' + s0 + ' bytes');
    }

    for (const id of Object.keys(sc.form)) {
      const exp = sc.form[id];
      await openDoctors();
      await click('[data-book="' + id + '"]'); await sleep(340);
      const f = await formVals();
      const okBasic = f && f.form && f.doctor === doctorName[id] && f.slotReadonly &&
        f.slot === exp.slot && f.start === exp.start && f.end === exp.end &&
        f.sh === exp.sh && f.eh === exp.eh && f.startTitle === exp.sh && f.endTitle === exp.eh &&
        f.reason === exp.reason;
      check('验收3/5/6 · ' + sc.t + ' 点' + id + ' 预填与理由全部按计算时刻', okBasic,
        f && { slot: f.slot, start: f.start, end: f.end, sh: f.sh, eh: f.eh, reason: f.reason });
      check('验收4/5 · ' + sc.t + ' ' + id + ' 无任何早于当前整点的时间值',
        f && f.start >= sc.floor && f.end >= sc.floor &&
        labelNotPast(f.slot, sc.floor) && labelNotPast(f.sh, sc.floor) && labelNotPast(f.eh, sc.floor) &&
        !/昨日|昨日|昨天/.test(f.slot + f.sh + f.eh),
        { floor: sc.floor, start: f && f.start, end: f && f.end, slot: f && f.slot });
      check('硬约束 · ' + sc.t + ' ' + id + ' 其余字段沿用原自动填充',
        f && !!f.name && !!f.sid && !!f.cls && /辅导员/.test(f.counselor || '') &&
        f.type === '病假' && /4 小时/.test(f.duration || '') && /提交请假申请/.test(f.submit || ''),
        f && { name: f.name, sid: f.sid, type: f.type });
      if (sc.t === '2026-11-11T21:05:00' && id === 'li') {
        const s1 = await shot('v23-desktop-2105-form-li.png', 1440, 1000); console.log('SHOT  v23-desktop-2105-form-li.png  ' + s1 + ' bytes');
        /* 提交 → 凭证卡 / 我的预约 */
        await click('#bookingForm button[type="submit"]'); await sleep(420);
        const tk = await ev(`(function(){var c=document.querySelector('#chatLog .msg-bot .bubble .bk-ticket');var m=document.querySelector('#leaveModal');return {card:!!c,inBubble:!!(c&&c.closest('.msg-bot .bubble')),modalHidden:!!(m&&m.hidden),txt:c?c.textContent.replace(/\\s+/g,' ').trim():null,style:c?{bg:getComputedStyle(c).backgroundColor,radius:getComputedStyle(c).borderTopLeftRadius,bl:getComputedStyle(c).borderLeftWidth,h4:getComputedStyle(c.querySelector('h4')).fontSize}:null}})()`);
        check('验收8 · 提交后凭证卡进入对话流，时段与计算值一致、凭证号逻辑不变',
          tk && tk.card && tk.inBubble && tk.modalHidden && /✅ 预约成功/.test(tk.txt) &&
          /李医生 · 外科/.test(tk.txt) && new RegExp(sc.form.li.slot.replace(/[–]/g, '.') ).test(tk.txt) &&
          new RegExp('MOCK-' + sc.ymd + '-001').test(tk.txt) && /请提前 10 分钟到校医院候诊/.test(tk.txt) &&
          /20px/.test(tk.style.radius) && /3px/.test(tk.style.bl), tk);
        const s2 = await shot('v23-desktop-2105-ticket.png', 1440, 1000); console.log('SHOT  v23-desktop-2105-ticket.png  ' + s2 + ' bytes');
        await click('#bookBtn'); await sleep(320);
        const bk = await ev(`(function(){var items=[].slice.call(document.querySelectorAll('#chatLog .bk-item'));return {n:items.length,last:items.length?items[items.length-1].textContent.replace(/\\s+/g,' ').trim():null}})()`);
        check('验收9 · 「我的预约」列表时间与凭证号同步',
          bk && bk.n === 1 && /李医生（外科）/.test(bk.last) && new RegExp(sc.form.li.slot.replace(/–/g, '.')).test(bk.last) &&
          /等待辅导员审批/.test(bk.last) && new RegExp('MOCK-' + sc.ymd + '-001').test(bk.last), bk);
      } else if (sc.t === '2026-11-11T23:59:00' && id === 'li') {
        const s1 = await shot('v23-desktop-2359-crossmidnight.png', 1440, 1000); console.log('SHOT  v23-desktop-2359-crossmidnight.png  ' + s1 + ' bytes');
        await click('#bookingForm button[type="submit"]'); await sleep(400);
        const tk2 = await ev(`(function(){var c=document.querySelector('#chatLog .bk-ticket');return {txt:c?c.textContent.replace(/\\s+/g,' ').trim():null}})()`);
        check('验收6b · 23:59 提交不报错，跨午夜凭证卡时段正确',
          tk2 && /今日 23:00 – 23:30/.test(tk2.txt), tk2);
      } else if (sc.t === '2026-11-12T00:01:00' && id === 'wang') {
        await click('#bookingForm button[type="submit"]'); await sleep(400);
        const tk3 = await ev(`(function(){var c=document.querySelector('#chatLog .bk-ticket');return {txt:c?c.textContent.replace(/\\s+/g,' ').trim():null}})()`);
        check('验收8b · 跨日 00:01 凭证号按当日日期生成且时段为今日 00:00',
          tk3 && new RegExp('MOCK-' + sc.ymd + '-001').test(tk3.txt) && /今日 00:00 – 00:30/.test(tk3.txt), tk3);
      } else {
        await closeForm();
      }
    }
  }

  /* 旧版固定演示记录不得再展示（可能指向过去时刻） */
  console.log('\n=== 旧记录迁移 / 请假流程 / 硬约束回归 ===');
  await reset(1440, 1000, false, '2026-11-11T21:05:00'); await passGates();
  await ev(`(function(){localStorage.setItem('xiaotong.bookings.v1',JSON.stringify([{doctor:'李医生（外科）',slot:'今日 16:00 – 16:30',status:'等待辅导员审批',ticket:'MOCK-20261111-999'}]));return 1})()`);
  await click('#bookBtn'); await sleep(300);
  const legacy = await ev(`(function(){var l=document.querySelector('#chatLog');return {empty:/你还没有预约记录。点右侧中间的校医院球可以发起预约。/.test(l.textContent),old:/MOCK-20261111-999/.test(l.textContent)}})()`);
  check('硬约束 · v22 固定演示时段旧记录不展示，空态文案不变', legacy && legacy.empty && !legacy.old, legacy);
  await ev(`(function(){localStorage.removeItem('xiaotong.bookings.v1');return 1})()`);

  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='我要请假三天';return 1})()`);
  await click('#sendBtn');
  for (let i = 0; i < 18; i++) {
    await sleep(500);
    if (await ev(`(function(){return !!(document.querySelector('#leaveForm')||document.querySelector('[data-open-leave]'))})()`)) break;
  }
  let leave = await ev(`(function(){var m=document.querySelector('#leaveModal');return {open:!!(m&&!m.hidden),mode:m?m.classList.contains('booking-mode'):null,form:!!document.querySelector('#leaveForm'),title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent:null,slot:!!document.querySelector('#lvSlot'),hint:!!document.querySelector('.bk-dayhint'),submit:document.querySelector('#leaveForm button[type=submit]')?document.querySelector('#leaveForm button[type=submit]').textContent.trim():null}})()`);
  if (!leave.form) { await click('[data-open-leave]'); await sleep(350); leave = await ev(`(function(){var m=document.querySelector('#leaveModal');return {open:!!(m&&!m.hidden),mode:m?m.classList.contains('booking-mode'):null,form:!!document.querySelector('#leaveForm'),title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent:null,slot:!!document.querySelector('#lvSlot'),hint:!!document.querySelector('.bk-dayhint'),submit:document.querySelector('#leaveForm button[type=submit]')?document.querySelector('#leaveForm button[type=submit]').textContent.trim():null}})()`); }
  check('验收10/硬约束 · 「我要请假」仍是原请假条（无预约时段字段、无时间前缀提示、非 booking-mode）',
    leave && leave.open && leave.form && /请假条生成/.test(leave.title) && !leave.slot && !leave.hint && !leave.mode && /生成请假条/.test(leave.submit || ''), leave);
  await click('#leaveForm button[type="submit"]'); await sleep(350);
  const leaveResult = await ev(`(function(){return {doc:!!document.querySelector('#leaveDoc'),title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent:null}})()`);
  check('硬约束 · 请假条生成结果页链路未断', leaveResult && leaveResult.doc && /已生成/.test(leaveResult.title || ''), leaveResult);
  await closeForm();

  const hard = await ev(`(function(){function c(s){var e=document.querySelector(s);return e?getComputedStyle(e):null}var b=c('.msg-bot .bubble');return {
    blue:getComputedStyle(document.documentElement).getPropertyValue('--blue').trim(),
    bubbleBg:b?b.backgroundColor:null,bubbleBf:b?b.backdropFilter:null,bubbleRadius:b?b.borderRadius:null,
    majors:[].slice.call(document.querySelectorAll('.orb-major')).filter(function(e){return !e.hidden}).length,
    links:document.querySelectorAll('#orbLinkSvg .orb-link').length,
    chip:c('.quick-chips button')?getComputedStyle(document.querySelector('.quick-chips button')).borderRadius:null,
    doctorRadius:getComputedStyle(document.querySelector('.doctor-modal')).borderRadius,
    faqBtn:!!document.querySelector('#faqOpenBtn'),faqData:!!(window.XiaoTongData)}})()`);
  check('硬约束 · 主色 / 毛玻璃 / 圆角 / 三小球 / 三条虚线 / 问答入口均未改',
    hard && hard.blue.toUpperCase() === '#2AA79B' && /255, 255, 255, 0\.72/.test(hard.bubbleBg) &&
    /blur\(20px\)/.test(hard.bubbleBf) && /20px/.test(hard.bubbleRadius) && /999px/.test(hard.chip) && /24px/.test(hard.doctorRadius) &&
    hard.majors === 3 && hard.links === 3 && hard.faqBtn && hard.faqData, hard);
  await click('#faqOpenBtn');
  let faqCount = 0;
  for (let i = 0; i < 12; i++) {
    await sleep(300);
    faqCount = await ev(`(function(){return document.querySelectorAll('#faqList .faq-q').length})()`);
    if (faqCount >= 30) break;
  }
  check('硬约束 · 30 条问答内容库完整', faqCount === 30, { count: faqCount });
  await click('#closeFaq');
  const hs1 = await noHScroll();
  check('硬约束 · 桌面 1440 无横向溢出', hs1 && hs1.sw <= hs1.iw + 1, hs1);

  /* ================= 手机端 ================= */
  console.log('\n=== 手机端 390x844 · 21:05 ===');
  await reset(390, 844, true, '2026-11-11T21:05:00'); await passGates(); await sleep(350);
  await ev(`(function(){if(window.XT_DRAWER&&window.XT_DRAWER.close)window.XT_DRAWER.close();return 1})()`); await sleep(380);
  await openDoctors();
  const mob = await ev(`(function(){var g=getComputedStyle(document.querySelector('#doctorCards')).gridTemplateColumns;var bs=[].slice.call(document.querySelectorAll('#doctorCards button')).map(function(b){return b.textContent.trim()});var dm=document.querySelector('.doctor-modal'),t=document.querySelector('.topbar');return {grid:g,btns:bs,w:Math.round(dm.getBoundingClientRect().width),top:Math.round(document.querySelector('#doctorModal').getBoundingClientRect().top),tb:Math.round(t.getBoundingClientRect().bottom),status:[].slice.call(document.querySelectorAll('.dc-status')).map(function(s){return s.textContent.trim()})}})()`);
  check('验收10 · 手机三卡竖堆、按钮随时间计算、不遮顶栏',
    mob && mob.grid.split(' ').length === 1 && mob.btns.join('|') === '预约 明日 08:00|立即预约|预约 明日 00:00' &&
    Math.abs(mob.w - Math.round(390 * 0.92)) <= 2 && mob.top >= mob.tb - 1, mob);
  const m0 = await shot('v23-mobile-2105-doctors.png', 390, 844); console.log('SHOT  v23-mobile-2105-doctors.png  ' + m0 + ' bytes');
  await click('[data-book="wang"]'); await sleep(350);
  const fm = await formVals();
  check('验收10b · 手机点王医生预填为明日 00:00 – 00:30 且时间提示正确',
    fm && fm.form && fm.slot === '明日 00:00 – 00:30' && fm.start === '2026-11-12T00:00' && fm.end === '2026-11-12T04:00' &&
    fm.sh === '明日 00:00' && fm.eh === '明日 04:00' && fm.slotReadonly,
    fm && { slot: fm.slot, start: fm.start, end: fm.end, sh: fm.sh, eh: fm.eh });
  await click('#bookingForm button[type="submit"]'); await sleep(480);
  const mt = await ev(`(function(){var c=document.querySelector('#chatLog .bk-ticket'),p=document.querySelector('#chatPane');return {card:!!c,txt:c?c.textContent.replace(/\\s+/g,' ').trim():null,drawerOpen:p?p.classList.contains('drawer-open'):null,modalHidden:!!document.querySelector('#leaveModal').hidden}})()`);
  check('验收10c · 手机提交后凭证卡进入对话流且抽屉自动展开',
    mt && mt.card && mt.modalHidden && mt.drawerOpen && /王医生 · 全科/.test(mt.txt) && /明日 00:00 – 00:30/.test(mt.txt), mt);
  const hsM = await noHScroll();
  check('验收10d · 390px 无横向溢出', hsM && hsM.sw <= hsM.iw + 1, hsM);
  const m1 = await shot('v23-mobile-2105-ticket.png', 390, 844); console.log('SHOT  v23-mobile-2105-ticket.png  ' + m1 + ' bytes');

  check('验收11 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 8));
  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  if (pass !== results.length) process.exitCode = 1;
  ws.close();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
