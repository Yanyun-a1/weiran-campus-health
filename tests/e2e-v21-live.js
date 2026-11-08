/* v21 线上冒烟：真实 Chrome 打开分享链接，验证背景图/CSS 加载与渲染 */
const fs = require('fs');
const CDP = 'http://127.0.0.1:9222';
const URL_ = 'https://xiaotong-campus.app.workbuddy.host/?sharecode=J7SOPQ2ENF';
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
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  let seq = 0; const pending = new Map(); const jsErrors = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') jsErrors.push((m.params.exceptionDetails || {}).text || '');
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
  const shot = async (file, w, h, mobile) => {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 });
    await sleep(500);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(500);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(150);
    await click('#consentAgree'); await sleep(600);
    if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(300); }
  }

  await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ }); await sleep(2600);

  const res = await ev(`(async function(){
    var out={sheets:[].slice.call(document.styleSheets).map(function(s){return (s.href||'').split('/').pop()})};
    var b=getComputedStyle(document.body);
    out.body={img:b.backgroundImage,size:b.backgroundSize,pos:b.backgroundPosition,attach:b.backgroundAttachment,color:b.backgroundColor};
    out.chat=getComputedStyle(document.querySelector('.pane-chat')).backgroundColor;
    out.chatBf=getComputedStyle(document.querySelector('.pane-chat')).backdropFilter;
    out.orb=getComputedStyle(document.querySelector('.pane-orb')).backgroundColor;
    out.scene=getComputedStyle(document.querySelector('.orb-scene')).backgroundImage;
    out.halo=getComputedStyle(document.querySelector('.orb-scene'),'::before').backgroundImage;
    out.topbar=getComputedStyle(document.querySelector('.topbar')).backgroundColor;
    out.assets={};
    for(var f of ['bg-v2.css','bg-desktop-v2.png','bg-mobile-v2.png']){
      try{var r=await fetch(f,{cache:'no-store'});out.assets[f]={status:r.status,type:r.headers.get('content-type')}}catch(e){out.assets[f]=String(e)}
    }
    try{var i=new Image();i.src='bg-desktop-v2.png';await i.decode();out.decoded=[i.naturalWidth,i.naturalHeight]}catch(e){out.decoded=String(e)}
    out.perf=performance.getEntriesByType('resource').filter(function(e){return /bg-/.test(e.name)}).map(function(e){return {name:e.name.split('/').pop().split('?')[0],bytes:e.transferSize,status:e.responseStatus}});
    return out;
  })()`);

  check('线上 · 首页引用 bg-v2.css', res && res.sheets.indexOf('bg-v2.css') >= 0, res && res.sheets);
  check('线上 · 桌面图 cover/center/fixed/#F7FAF9 生效',
    res && /bg-desktop-v2\.png/.test(res.body.img) && res.body.size === 'cover' &&
    res.body.attach === 'fixed' && /247, 250, 249/.test(res.body.color), res && res.body);
  check('线上 · 三个新资源在浏览器会话内均为 200',
    res && Object.keys(res.assets).every(k => res.assets[k].status === 200), res && res.assets);
  check('线上 · 桌面 PNG 解码 1920x1064', res && res.decoded && res.decoded[0] === 1920 && res.decoded[1] === 1064, res && res.decoded);
  check('线上 · 左栏 .58 磨砂 / 右栏+舞台透明 / 顶栏纯白 / 中心遮罩在',
    res && /255, 255, 255, 0\.58/.test(res.chat) && /blur\(24px\)/.test(res.chatBf) &&
    /rgba\(0, 0, 0, 0\)/.test(res.orb) && res.scene === 'none' &&
    /radial-gradient/.test(res.halo) && res.topbar === 'rgb(255, 255, 255)',
    { chat: res && res.chat, chatBf: res && res.chatBf, orb: res && res.orb, scene: res && res.scene, topbar: res && res.topbar });
  check('线上 · 背景图资源实际下载成功（performance 非空）',
    res && res.perf.some(p => /bg-desktop-v2\.png/.test(p.name) && p.bytes > 1000), res && res.perf);

  await passGates(); await sleep(500);
  const szD = await shot('v21-live-desktop.png', 1440, 1000, false); console.log('SHOT  v21-live-desktop.png  ' + szD + ' bytes');
  await shot('v21-live-mobile.png', 390, 844, true);
  const mImg = await ev(`getComputedStyle(document.body).backgroundImage`);
  check('线上 · 390px 自动切到 bg-mobile-v2.png', /bg-mobile-v2\.png/.test(mImg || ''), mImg);
  check('线上 · 无 jsError', jsErrors.length === 0, jsErrors.slice(0, 5));

  const pass = results.filter(r => r.ok).length;
  console.log('\n==== LIVE ' + pass + '/' + results.length + ' PASS ====');
  if (pass !== results.length) process.exitCode = 1;
  ws.close();
}
main().catch(e => { console.error('FATAL', e); process.exitCode = 1; });
