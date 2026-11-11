/* v8 截图：node screenshot-v8.js <width> <height> <state> <output.png> [url]
 * state: initial | focus | burst | reform | sub | detail | returning
 * 交互走 CDP 真实鼠标，动画中间帧按固定时间采样。
 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const width = Number(process.argv[2] || 1440);
const height = Number(process.argv[3] || 900);
const state = process.argv[4] || 'initial';
const out = process.argv[5] || 'E:/gzkj/v8-shot.png';
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
  const down = (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  const up = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  const click = async (x, y) => { await down(x, y); await up(x, y); };
  const center = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});var b=e.getBoundingClientRect();
    return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()`);
  const waitAnim = async () => {
    for (let i = 0; i < 40; i++) {
      if (!(await ev('window.__orbState().isAnimating'))) return;
      await sleep(80);
    }
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
  await sleep(2900);

  if (state !== 'initial') {
    const b = await center('.orb-major');
    await click(b.x, b.y);
    if (state === 'focus') await sleep(190);
    else if (state === 'burst') await sleep(330);
    else if (state === 'reform') await sleep(530);
    else {
      await waitAnim();
      await sleep(120);
      if (state === 'detail') {
        const m = await center('.orb-minor.is-current');
        await click(m.x, m.y);
        await sleep(520);
      } else if (state === 'returning') {
        const r = await center('#orbBack');
        await click(r.x, r.y);
        await sleep(190);
      }
    }
  }

  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(r.result.data, 'base64'));
  const lv = await ev('window.__orbState().level');
  console.log('saved', out, state, width + 'x' + height, fs.statSync(out).size, 'level=' + lv);
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
