/* 云服务「关闭 WorkBuddy 后仍运行」独立验证
 * 做法：全新无痕 browserContext（无 cookie / 无 localStorage / 无登录态），
 *       主动 block 本地预览服务 127.0.0.1:8123 与 localhost:8123，
 *       模拟「WorkBuddy 客户端与本地服务都不在」的访客环境，直接访问线上分享链接。
 * 场景 A：正常公网；场景 B：额外 block CDN SDK，验证站内 vendor 副本兜底。
 * 只依赖 9222 无头 Chrome 作为测试仪器，页面自身不访问任何本地资源。
 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const LIVE = 'https://xiaotong-campus.app.workbuddy.host/?sharecode=J7SOPQ2ENF';
const DIR = 'E:/gzkj/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

async function scenario(label, extraBlocked, shotName) {
  console.log('\n========== ' + label + ' ==========');
  const ver = await (await fetch(CDP + '/json/version')).json();
  const ws = new WebSocket(ver.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let seq = 0;
  const pending = new Map();
  const events = [];
  const jsErrors = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    events.push(m);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      jsErrors.push((d.text || '') + ' ' + ((d.exception && d.exception.description) || ''));
    }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      jsErrors.push('console: ' + m.params.args.map(a => a.value || a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error')
      jsErrors.push('log: ' + m.params.entry.text);
  });
  const cmd = (method, params = {}, sessionId) => new Promise(res => {
    const id = ++seq;
    pending.set(id, res);
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    ws.send(JSON.stringify(msg));
  });

  const ctx = await cmd('Target.createBrowserContext');
  const ctxId = ctx.result && ctx.result.browserContextId;
  if (!ctxId) { check(label + ' · 创建无痕上下文', false, ctx); ws.close(); return; }
  const created = await cmd('Target.createTarget', { url: 'about:blank', browserContextId: ctxId });
  const targetId = created.result && created.result.targetId;
  const attached = await cmd('Target.attachToTarget', { targetId, flatten: true });
  const S = attached.result && attached.result.sessionId;
  const send = (method, params = {}) => cmd(method, params, S);
  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    const rr = r.result || {};
    if (rr.exceptionDetails) return { __err: rr.exceptionDetails.text };
    return rr.result ? rr.result.value : null;
  };
  const click = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO';e.click();return 'OK'})()`);
  const shot = async file => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    if (!r.result || !r.result.data) return 0;
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  const blocked = ['*127.0.0.1:8123*', '*localhost:8123*'].concat(extraBlocked);
  await send('Network.setBlockedURLs', { urls: blocked });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  events.length = 0; jsErrors.length = 0;
  await send('Page.navigate', { url: LIVE });

  // 等云 SDK + 云数据库 boot 完成（bootCloud 内部 9s 超时）
  const stateExpr = `(function(){try{return {
      title:document.title, url:location.href, ready:document.readyState,
      hero:(document.querySelector('.hero-slogan')||{}).textContent||'',
      sdk:!!window.WorkBuddyCloud, cfg:!!window.XIAOTONG_PUBLIC_CONFIG,
      catalog:window.__faqCatalog?window.__faqCatalog().length:0,
      match:window.__faqMatch?window.__faqMatch('食堂几点开饭'):null,
      hint:(document.querySelector('#modeHint')||{}).textContent||''
    }}catch(e){return {err:String(e)}}})()`;
  let state = null;
  for (let i = 0; i < 34; i++) {
    await sleep(450);
    state = await ev(stateExpr);
    if (state && state.catalog > 0 && state.ready === 'complete') break;
  }
  await sleep(900);
  state = (await ev(stateExpr)) || state;
  const diag = await ev(`(function(){try{return {
    sdkFailed:!!window.__sdkCdnFailed,
    scripts:[].map.call(document.scripts,function(s){return s.src||'(inline)'}).slice(-8),
    source:window.__faqMatch?window.__faqMatch('食堂几点开饭').source:null,
    aiReady:window.__faqMatch?window.__faqMatch('食堂几点开饭').aiReady:null
  }}catch(e){return {err:String(e)}}})()`);
  console.log('  诊断: ' + JSON.stringify(diag));

  const reqWill = events.filter(e => e.sessionId === S && e.method === 'Network.requestWillBeSent');
  const resp = events.filter(e => e.sessionId === S && e.method === 'Network.responseReceived');
  const failed = events.filter(e => e.sessionId === S && e.method === 'Network.loadingFailed');
  const urls = reqWill.map(e => e.params.request.url);
  const statusOf = u => {
    const r = resp.find(e => e.params.response.url === u);
    return r ? r.params.response.status : null;
  };
  const localHits = urls.filter(u => /127\.0\.0\.1|localhost|file:\/\//i.test(u));
  const docStatus = statusOf(LIVE);
  const apiCalls = urls.filter(u => /genie-baas|campus_faqs|rest\/v1|database|oauth/i.test(u));
  const api200 = apiCalls.filter(u => statusOf(u) === 200 || statusOf(u) === 204);
  const assets = urls.filter(u => /(v28\.css|v28\.js|app\.js|config\.js|faqs\.js|orb-view\.js|index\.global\.js|vendor\/)/.test(u));

  const failDetail = failed.map(e => {
    const r = reqWill.find(x => x.params.requestId === e.params.requestId);
    return { url: r ? r.params.request.url : '?', err: e.params.errorText };
  });
  console.log('  页面请求总数 ' + urls.length + '，失败 ' + failed.length + '，API 请求 ' + apiCalls.length);
  console.log('  失败请求: ' + JSON.stringify(failDetail));
  console.log('  API 样例: ' + JSON.stringify(apiCalls.slice(0, 3)));
  console.log('  资源样例: ' + JSON.stringify(assets.slice(0, 3)));
  console.log('  态: ' + JSON.stringify(state));

  check(label + ' · 线上首页独立返回 200（无 cookie 的新访客）', docStatus === 200, { status: docStatus, title: state && state.title });
  check(label + ' · 页面零本地依赖（不含 127.0.0.1 / localhost / file://）', localHits.length === 0, { hits: localHits.slice(0, 5) });
  check(label + ' · 云 SDK 与公开配置就绪', !!(state && state.sdk && state.cfg), { sdk: state && state.sdk, cfg: state && state.cfg });
  check(label + ' · 云数据库 campus_faqs 读到 30 条且 source=cloud',
    !!(state && state.catalog === 30 && state.match && state.match.source === 'cloud' && state.match.bestId === 1),
    { catalog: state && state.catalog, source: state && state.match && state.match.source, bestId: state && state.match && state.match.bestId });
  check(label + ' · 云端 API 请求返回 2xx', api200.length > 0, { total: apiCalls.length, ok: api200.length });
  const v28Assets = assets.filter(u => /v28\.(css|js)/.test(u));
  check(label + ' · v28 新资源正常加载',
    v28Assets.length >= 2 && v28Assets.some(u => statusOf(u) === 200) && !!(state && state.hero),
    { count: v28Assets.length, statuses: v28Assets.map(statusOf) });
  check(label + ' · 桌面新主文案完整且无句号',
    !!(state && state.hero === '持续关注自身状态，提前关注健康变化，及时识别潜在健康风险，科学做好预防与养护，防患于未然'),
    { hero: state && state.hero });

  // 门禁 + 核心功能冒烟（全部在干净上下文内完成）
  await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
  await click('#loginBtn'); await sleep(420);
  await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(120);
  await click('#consentAgree'); await sleep(500);
  const introOpen = await ev(`(function(){var m=document.querySelector('#introModal');return !!(m&&!m.hidden)})()`);
  if (introOpen) { await click('#recoStart'); await sleep(280); }
  await sleep(300);
  const gated = await ev(`(function(){try{return {
    chat:!!document.querySelector('#chatLog'),
    msgs:document.querySelectorAll('#chatLog .msg').length,
    loginHidden:(document.querySelector('#login')||{}).hidden===true
  }}catch(e){return {err:String(e)}}})()`);
  check(label + ' · 三道门禁可正常通过并进入主界面', !!(gated && gated.chat && !gated.err), gated);

  await click('#faqOpenBtn'); await sleep(300);
  const tabs = await ev(`(function(){return [].map.call(document.querySelectorAll('.faq-tab'),function(e){return e.textContent.trim()})})()`);
  check(label + ' · FAQ 弹窗 10 个分类标签由云端数据渲染', tabs && tabs.length === 10 && tabs[0] === '食序', { count: tabs && tabs.length });
  await click('#closeFaq'); await sleep(150);

  await ev(`(function(){window.XT_CHAT.bookDoctor();return 1})()`); await sleep(380);
  const docs = await ev(`(function(){return document.querySelectorAll('#doctorCards .doc-card').length})()`);
  check(label + ' · 医生列表 / 预约入口正常', docs === 3, { cards: docs });
  await click('#closeDoctor'); await sleep(180);

  await click('#bookBtn'); await sleep(300);
  const myBooking = await ev(`(function(){var a=document.querySelectorAll('#chatLog .bk-empty');return a.length?a[a.length-1].textContent.trim():null})()`);
  check(label + ' · 我的预约读取正常', /你还没有预约记录/.test(myBooking || ''), { text: myBooking && myBooking.slice(0, 24) });

  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='食堂几点开饭';return 1})()`);
  await click('#sendBtn');
  let answered = null;
  for (let i = 0; i < 16; i++) {
    await sleep(400);
    answered = await ev(`(function(){var a=document.querySelectorAll('#chatLog .msg');var t=a.length?a[a.length-1].textContent:'';return {n:a.length,last:t.slice(0,40),typing:/正在理解你的问题/.test(t)}})()`);
    if (answered && answered.n > 0 && !answered.typing) break;
  }
  check(label + ' · 问答能出结果（云端 30 条匹配链路通）',
    answered && answered.n > 0 && !answered.typing, answered);

  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='我要请假三天';return 1})()`);
  await click('#sendBtn');
  let leave = null;
  for (let i = 0; i < 18; i++) { await sleep(400); leave = await ev(`(function(){var m=document.querySelector('#leaveModal');return {open:!!(m&&!m.hidden),form:!!document.querySelector('#leaveForm')}})()`); if (leave && leave.open && leave.form) break; }
  check(label + ' · 请假条流程正常', !!(leave && leave.open && leave.form), leave);

  const realErr = jsErrors.filter(s => !/favicon|net::ERR_|ERR_BLOCKED_BY_CLIENT|ERR_FAILED/i.test(s));
  check(label + ' · 全流程 0 未捕获 jsError', realErr.length === 0, { count: realErr.length, sample: realErr.slice(0, 3) });
  const size = await shot(shotName);
  console.log('SHOT  ' + shotName + '  ' + size + ' bytes');

  await cmd('Target.disposeBrowserContext', { browserContextId: ctxId });
  ws.close();
  await sleep(200);
}

(async () => {
  try {
    await scenario('场景A · 干净访客 + 本地服务已关闭', [], 'keepalive-sceneA.png');
    await scenario('场景B · 再叠加 CDN SDK 不可达（站内副本兜底）',
      ['*cdn.jsdelivr.net/npm/@tencent-ai/workbuddy-cloud-sdk*'], 'keepalive-sceneB.png');
  } catch (e) {
    console.log('FATAL  ' + (e && e.stack || e));
  }
  const pass = results.filter(r => r.ok).length;
  console.log('\n===== 汇总 ' + pass + '/' + results.length + ' PASS =====');
  results.filter(r => !r.ok).forEach(r => console.log('FAILED: ' + r.name));
  process.exit(pass === results.length ? 0 : 1);
})();
