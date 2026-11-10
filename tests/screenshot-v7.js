/* v7 截图：node screenshot-v7.js <width> <height> <state> <output.png> [url]
 * state: initial | dragging       （dragging 用 CDP 真实鼠标 / 触摸输入，按住不放再截）
 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const width = Number(process.argv[2] || 1440);
const height = Number(process.argv[3] || 900);
const state = process.argv[4] || 'initial';
const out = process.argv[5] || 'E:/gzkj/v7-shot.png';
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
  if (width < 769) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await send('Page.navigate', { url });
  await sleep(2500);
  await ev(`(function(){['xiaotong.ui.v1','xiaotong.identity.v1','xiaotong.intro.v1'].forEach(function(k){localStorage.removeItem(k)});return true})()`);
  await send('Page.reload');
  await sleep(3200);

  /* 拖动起点取场景中心：那里是透明空白处，不压在任何球上 */
  const c = await ev(`(function(){var s=document.querySelector('#orbScene').getBoundingClientRect();
    return {x:Math.round(s.left+s.width/2),y:Math.round(s.top+s.height/2)}})()`);

  if (state === 'dragging') {
    if (width < 769) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 0 }] });
      await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x - 70, y: c.y, id: 0 }] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', buttons: 1, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x - 120, y: c.y, button: 'none', buttons: 1 });
    }
    await sleep(350);
  }

  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  console.log('saved', out, state, width + 'x' + height, fs.statSync(out).size, 'start', JSON.stringify(c));

  if (state === 'dragging') {
    if (width < 769) await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    else await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x - 120, y: c.y, button: 'left', buttons: 0, clickCount: 1 });
  }
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
