/* v6 截图：node screenshot-v6.js <width> <height> <state> <output.png> [url]
 * state: initial | drag-left | drag-right | split | detail | back
 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const width = Number(process.argv[2] || 1440);
const height = Number(process.argv[3] || 900);
const state = process.argv[4] || 'initial';
const out = process.argv[5] || 'E:/gzkj/v6-shot.png';
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
  await ev(`(function(){['xiaotong.ui.v1','xiaotong.identity.v1','xiaotong.intro.v1'].forEach(function(k){localStorage.removeItem(k)});return true})()`);
  await send('Page.reload');
  await sleep(3500);

  const drag = (dx, pid) => ev(`(function(){
    var s=document.querySelector('#orbScene'),x=${Math.round(width / 2)},y=${Math.round(height / 2)};
    s.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:x,clientY:y,pointerId:${pid},button:0}));
    window.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:x+${dx},clientY:y,pointerId:${pid}}));
    return true})()`);

  if (state === 'drag-left') { await drag(-120, 31); await sleep(350); }
  if (state === 'drag-right') { await drag(120, 32); await sleep(350); }
  if (state === 'split' || state === 'detail' || state === 'back') {
    await ev(`(function(){document.querySelector('.orb-major[data-orb="food"]').click();return true})()`);
    await sleep(950);
  }
  if (state === 'detail') {
    await ev(`(function(){document.querySelector('.orb-minor.is-current[data-mod="菜品营养"]').click();return true})()`);
    await sleep(650);
  }
  if (state === 'back') {
    await ev(`(function(){document.querySelector('#orbBack').click();return true})()`);
    await sleep(500);
  }
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  console.log('saved', out, state, width + 'x' + height, fs.statSync(out).size);
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
