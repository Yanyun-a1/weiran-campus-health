/* v9 截图：node screenshot-v9.js <width> <height> <state> <output.png> [url]
 * state: initial | out1 | out2 | sub | in1 | in2 | root | outslow | inslow
 *   out1/out2 = 进入中球层时顶栏渐隐的早期 / 中期帧（真实 240ms）
 *   in1/in2   = 返回大球层时顶栏渐显的早期 / 中期帧（真实 240ms）
 *   outslow/inslow = 仅截图时临时把顶栏过渡放慢到 1600ms 线性，便于看清中间态；
 *                    注入只在当前页面会话生效，不改任何项目文件。
 * 交互走 CDP 真实鼠标；截图前后读取 computed opacity 便于核对帧位置。
 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const width = Number(process.argv[2] || 1440);
const height = Number(process.argv[3] || 900);
const state = process.argv[4] || 'initial';
const out = process.argv[5] || 'E:/gzkj/v9-shot.png';
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
  const op = () => ev(`(function(){return {sw:+(+getComputedStyle(document.querySelector('#uiSwitch')).opacity).toFixed(3),
    id:+(+getComputedStyle(document.querySelector('#identityBar')).opacity).toFixed(3),level:window.__orbState().level}})()`);

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

  if (state === 'outslow' || state === 'inslow') {
    /* 截图专用：把顶栏过渡放慢并改成线性，中间帧才拍得清。
     * 连 .orb-head-snap 一起覆盖，避免 settle() 把过渡强落终态。 */
    await ev(`(function(){var s=document.createElement('style');s.id='v9-slowmo';
      s.textContent='.ui-switch,.identity-bar,.ui-switch.orb-head-snap,.identity-bar.orb-head-snap{transition:opacity 1600ms linear,transform 1600ms linear !important}';
      document.head.appendChild(s);return true})()`);
  }

  if (state !== 'initial') {
    const b = await center('.orb-major');
    await click(b.x, b.y);
    if (state === 'out1') await sleep(55);
    else if (state === 'out2') await sleep(125);
    else if (state === 'outslow') await sleep(780);
    else {
      await waitAnim();
      await sleep(120);
      if (state === 'in1' || state === 'in2' || state === 'inslow' || state === 'root') {
        const r = await center('#orbBack');
        await click(r.x, r.y);
        if (state === 'in1') await sleep(220);
        else if (state === 'in2') await sleep(300);
        else if (state === 'inslow') await sleep(800);
        else { await waitAnim(); await sleep(120); }
      }
    }
  }

  const before = await op();
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  const after = await op();
  console.log('saved', out, state, width + 'x' + height, fs.statSync(out).size,
    'opacity', JSON.stringify(before), '->', JSON.stringify(after));
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
