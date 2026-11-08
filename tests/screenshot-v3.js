/* v3 截图：node screenshot-v3.js <width> <height> <open|closed> <output.png> [url] */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const width = Number(process.argv[2] || 1440);
const height = Number(process.argv[3] || 900);
const state = process.argv[4] || 'open';
const out = process.argv[5] || 'E:/gzkj/v3-shot.png';
const url = process.argv[6] || 'http://127.0.0.1:8123/index.html';

(async () => {
  const list = await (await fetch(CDP + '/json/list')).json();
  const page = list.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const send = (method, params = {}) => new Promise(r => {
    const i = ++id; pending.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const ev = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : null;
  };
  await send('Page.enable');
  await send('Network.enable');
  await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 769 });
  await send('Page.navigate', { url });
  await sleep(2500);
  // 恢复默认身份；按参数决定首次访问自动弹窗 or 已访问过的干净主界面
  await ev(`(function(){
    localStorage.removeItem('xiaotong.identity.v1');
    if (${JSON.stringify(state === 'open')}) localStorage.removeItem('xiaotong.intro.v1');
    else localStorage.setItem('xiaotong.intro.v1','1');
    return true;
  })()`);
  await send('Page.reload');
  await sleep(6500);
  await ev(`(function(){var s=document.querySelector('.intro-scroll');if(s)s.scrollTop=0;return true})()`);
  await sleep(300);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  console.log('saved', out, state, width + 'x' + height, fs.statSync(out).size);
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
