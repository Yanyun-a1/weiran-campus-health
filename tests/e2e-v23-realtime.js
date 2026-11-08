/* v23 真实（未冻结）时钟冒烟：确认不注入任何钩子时，页面按系统当前时间正确判定在线医生 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const DIR = process.env.E2E_DIR || 'E:/gzkj/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = [];
function check(n, ok, d) { out.push(ok); console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (d !== undefined ? '  ' + JSON.stringify(d) : '')); }

async function main() {
  let ts = await (await fetch(CDP + '/json/list')).json();
  let pg = ts.find(t => t.type === 'page');
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  let id = 0; const pend = new Map(); const errs = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errs.push((m.params.exceptionDetails || {}).text || 'err');
  });
  const send = (method, params = {}) => new Promise(r => { const k = ++id; pend.set(k, r); ws.send(JSON.stringify({ id: k, method, params })); });
  const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true }); return r.result && r.result.result ? r.result.result.value : null; };
  const click = s => ev(`(function(){var e=document.querySelector(${JSON.stringify(s)});if(!e)return 'NO';e.click();return 'OK'})()`);
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  errs.length = 0;
  await send('Page.navigate', { url: URL_ }); await sleep(1600);
  await ev(`(function(){try{localStorage.clear()}catch(e){}return 1})()`);
  await send('Page.reload'); await sleep(1900);
  await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
  await click('#loginBtn'); await sleep(500);
  await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(150);
  await click('#consentAgree'); await sleep(600);
  if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(300); }
  const c = await ev(`(function(){var e=document.querySelector('#orbCenter');if(!e)return null;var r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),h:new Date().getHours(),clock:new Date().toString()}})()`);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  await sleep(650);
  const v = await ev(`(function(){var a=[].slice.call(document.querySelectorAll('#doctorCards .doc-card')).map(function(x){return {id:x.getAttribute('data-doc'),status:x.querySelector('.dc-status').textContent.trim(),online:/is-online/.test(x.querySelector('.dc-status').className),btn:x.querySelector('button').textContent.trim()}});return {h:new Date().getHours(),list:a}})()`);
  const expected = v.h >= 8 && v.h < 16 ? 'zhang' : (v.h >= 16 ? 'li' : 'wang');
  const on = v.list.filter(x => x.online);
  const hijack = await ev(`(function(){return {hook:window.__XT_NOW__||null,iso:new Date().toISOString()}})()`);
  check('真实时钟 · 页面未被冻结时钟钩子接管', !hijack.hook, hijack);
  check('真实时钟 · 当前 ' + v.h + ' 点，恰好一人在线且为 ' + expected,
    v.h === c.h && on.length === 1 && on[0].id === expected && /当前在线/.test(on[0].status), v);
  check('真实时钟 · 未冻结时按钮与状态文案同步生成',
    v.list.every(x => x.online ? x.btn === '立即预约' : /^预约 (今日|明日|次日) \d{2}:\d{2}$/.test(x.btn)), v.list.map(x => x.id + ':' + x.btn));
  check('真实时钟 · 无 jsError', errs.length === 0, errs.slice(0, 4));
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(DIR + 'v23-realtime-doctors.png', Buffer.from(r.result.data, 'base64'));
  console.log('SHOT  v23-realtime-doctors.png  ' + fs.statSync(DIR + 'v23-realtime-doctors.png').size + ' bytes');
  console.log('\n==== ' + out.filter(Boolean).length + '/' + out.length + ' PASS ====');
  if (out.filter(Boolean).length !== out.length) process.exitCode = 1;
  ws.close();
}
main().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
