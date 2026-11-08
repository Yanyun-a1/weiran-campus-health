/* v24 · 纯改名专项验收（校园健康助手 → 未然 / 三大球 → 食序·息衡·动跃）
 * 用法：node e2e-v24.js [URL]     依赖 8123 静态服务 + 9222 无头 Chrome(CDP)
 * 覆盖验收 1-12：名称、logo/头像、大球、点球说明、FAQ 分类、30 条问答与云数据库、
 * 旧名残留、手机顶栏不溢出、无 jsError；另含门禁/预约/请假/抽屉/主色回归与截图。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const CDP = 'http://127.0.0.1:9222';
const URL_ = process.argv[2] || 'http://127.0.0.1:8123/index.html';
const DIR = process.env.E2E_DIR || 'E:/gzkj/';   /* 线上复跑时用 E2E_DIR 分流截图 */
const PROJECT = 'E:/gzkj/xiaotong';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}
function sha(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
function walk(dir) {
  let out = [];
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) { if (n !== 'node_modules') out = out.concat(walk(p)); }
    else out.push(p);
  }
  return out;
}

/* ================= 静态检查：数据 / 内容 / 旧名残留 ================= */
function staticChecks() {
  console.log('\n=== 静态源码检查（不依赖浏览器） ===');
  /* 验收 8 / 9 / 六：15 个「绝对不动」的文件与改动前哈希逐一比对 */
  const baseline = fs.readFileSync('E:/gzkj/v24-baseline.sha256', 'utf8').trim().split('\n');
  const bad = [];
  baseline.forEach(line => {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.+)$/);
    if (!m) return;
    const p = path.join(PROJECT, m[2]);
    if (sha(p) !== m[1]) bad.push(m[2]);
  });
  check('验收8·9·六 · 30 条问答/云数据库种子/门禁/布局/样式等 15 个文件一字未改',
    bad.length === 0, { checked: baseline.length, changed: bad });

  const faqsSrc = fs.readFileSync(path.join(PROJECT, 'faqs.js'), 'utf8');
  const ids = faqsSrc.match(/id:\s*\d+,\s*category:/g) || [];
  const cats = [...new Set((faqsSrc.match(/category:\s*"([^"]+)"/g) || []).map(s => s.replace(/.*"([^"]+)"/, '$1')))];
  check('验收8 · 本地 30 条问答仍为 30 条 / 10 类，前三类数据值未改',
    ids.length === 30 && cats.length === 10 && cats[0] === '食品健康' && cats[1] === '作息健康' && cats[2] === '运动健康',
    { count: ids.length, cats });
  const seed = fs.readFileSync(path.join(PROJECT, 'tools/seed.sql'), 'utf8');
  check('验收9 · 云数据库种子 30 行、category 保持原值（前端只做显示映射）',
    (seed.match(/^\(\d+,'/gm) || []).length === 30 && /\(1,'食品健康'/u.test(seed),
    { rows: (seed.match(/^\(\d+,'/gm) || []).length });

  const orbSrc = fs.readFileSync(path.join(PROJECT, 'orb-view.js'), 'utf8');
  const MINI_EXPECT = ['菜品营养', '饮食记录', '食堂安全', '作息记录', '睡眠质量', '宿舍环境', '运动记录', '场馆器材', '运动建议'];
  const miniFound = MINI_EXPECT.filter(n => orbSrc.indexOf("name: '" + n + "'") >= 0);
  check('六 · 九个子分类名字一字未改（按小球实际文案为准）',
    miniFound.length === 9, { found: miniFound.length, names: MINI_EXPECT });
  check('二 · orb-view.js 仅三处大球 name 改为新名，配色/方位/中球未动',
    ["name: '食序'", "name: '息衡'", "name: '动跃'"].every(s => orbSrc.indexOf(s) >= 0) &&
    orbSrc.indexOf("name: '食品健康'") < 0 && orbSrc.indexOf("name: '作息健康'") < 0 && orbSrc.indexOf("name: '运动健康'") < 0 &&
    /CAMERA_D = 1200/.test(orbSrc) && /var D2R = Math\.PI \/ 180/.test(orbSrc));

  /* 验收 10：全项目非注释文本中「校园健康助手」零残留。
     规格一「登录页副标题：防患于未然 · 校园健康助手」是唯一显式要求保留的非注释文案，
     作为白名单单独声明，其余（含 prompt / 署名 / aria / meta）必须清零。 */
  const html = fs.readFileSync(path.join(PROJECT, 'index.html'), 'utf8');
  const sub = html.match(/<p class="login-sub">([^<]*)<\/p>/);
  check('规格一 · 登录页副标题按逐处替换保留「防患于未然 · 校园健康助手」',
    !!sub && sub[1] === '防患于未然 · 校园健康助手', sub && { text: sub[1] });

  const residue = [], commentOnly = [];
  for (const f of walk(PROJECT)) {
    if (!/\.(js|html|css|sql)$/i.test(f)) continue;
    let src = fs.readFileSync(f, 'utf8');
    const comments = (src.match(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->|(^|\n)[ \t]*\/\/[^\n]*/g) || []).join('\n');
    if (comments.indexOf('校园健康助手') >= 0) commentOnly.push(path.relative(PROJECT, f));
    let s = src.replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/(^|\n)[ \t]*\/\/[^\n]*/g, '$1')
      .replace(/<p class="login-sub">[^<]*<\/p>/g, '');   /* 白名单：规格明确指定保留 */
    s.split('\n').forEach((ln, i) => {
      if (ln.indexOf('校园健康助手') >= 0) residue.push(path.relative(PROJECT, f) + ':' + (i + 1) + ':' + ln.trim().slice(0, 70));
    });
  }
  check('验收10 · 全项目「校园健康助手」除代码注释 + 登录页副标题外零残留',
    residue.length === 0, { residue, commentFiles: commentOnly });

  const htmlNoSub = html.replace(/<p class="login-sub">[^<]*<\/p>/g, '');
  check('验收1 · index.html 的 title / 顶栏 / 左栏标题 / 推荐弹窗品牌行均已改名',
    html.indexOf('<title>未然 · 校园健康</title>') >= 0 &&
    html.indexOf('<strong>未然</strong>') >= 0 &&
    html.indexOf('<small>食序 · 息衡 · 动跃</small>') >= 0 &&
    html.indexOf('<strong>和未然聊聊</strong>') >= 0 &&
    html.indexOf('<span class="eyebrow">未然 · 参赛演示版</span>') >= 0 &&
    html.indexOf('aria-label="未然首页"') >= 0 &&
    htmlNoSub.indexOf('校园健康助手') < 0);
  const appSrc = fs.readFileSync(path.join(PROJECT, 'app.js'), 'utf8');
  check('规格一 · 对话里 AI 自称 / prompt / 请假条署名均已改名，三处头像统一「未」',
    (appSrc.match(/bubble-avatar">未</g) || []).length === 3 &&
    appSrc.indexOf('你是「未然」的意图路由器') >= 0 &&
    appSrc.indexOf('未然 · 就诊预约生成') >= 0 &&
    appSrc.indexOf('校园健康助手') < 0);
  check('六 · localStorage key 未改动（门禁不重走）',
    /xiaotong\.login\.v1/.test(fs.readFileSync(path.join(PROJECT, 'gate.js'), 'utf8')) &&
    /xiaotong\.consent\.v1/.test(fs.readFileSync(path.join(PROJECT, 'gate.js'), 'utf8')) &&
    /xiaotong\.drawer\.v1/.test(fs.readFileSync(path.join(PROJECT, 'split.js'), 'utf8')));
}

async function main() {
  staticChecks();

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
    if (r.result && r.result.exceptionDetails) return { __err: r.result.exceptionDetails.text };
    return r.result && r.result.result ? r.result.result.value : null;
  };
  const click = async sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NO';e.click();return 'OK'})()`);
  const text = sel => ev(`(function(){var e=document.querySelector(${JSON.stringify(sel)});return e?e.textContent.trim():null})()`);
  let mobile_ = false;
  const shot = async file => {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(DIR + file, Buffer.from(r.result.data, 'base64'));
    return fs.statSync(DIR + file).size;
  };
  const setViewport = async (w, h, mobile) => { mobile_ = mobile; await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile }); await send('Emulation.setTouchEmulationEnabled', { enabled: mobile, maxTouchPoints: 1 }); await sleep(380); };
  const mouse = (type, x, y) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  const tap = async (x, y) => {
    if (mobile_) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] }); await sleep(20);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(120);
    } else {
      await mouse('mousePressed', x, y); await mouse('mouseReleased', x, y); await sleep(120);
    }
  };
  const noHScroll = () => ev(`(function(){return {sw:document.documentElement.scrollWidth,iw:window.innerWidth}})()`);

  await send('Runtime.enable'); await send('Page.enable');
  let firstReset = true;
  async function reset(w, h, mobile) {
    await setViewport(w, h, mobile);
    await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
    if (firstReset) { jsErrors.length = 0; firstReset = false; }
    await send('Page.navigate', { url: URL_ }); await sleep(1400);
    await ev(`(function(){try{localStorage.clear();sessionStorage.clear()}catch(e){}return 1})()`);
    await send('Page.reload'); await sleep(1700);
  }
  async function passGates() {
    await click('.demo-acc[data-sid="20260101"]'); await sleep(150);
    await click('#loginBtn'); await sleep(420);
    await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(120);
    await click('#consentAgree'); await sleep(500);
    if (!(await ev(`(function(){var m=document.querySelector('#introModal');return !m||m.hidden})()`))) { await click('#recoStart'); await sleep(280); }
  }
  const majorNames = () => ev(`(function(){return [].slice.call(document.querySelectorAll('.orb-major')).map(function(e){return {id:e.getAttribute('data-orb'),name:e.querySelector('.orb-text').textContent.trim(),aria:e.getAttribute('aria-label'),hi:e.style.getPropertyValue('--c-hi'),main:e.style.getPropertyValue('--c-main'),dark:e.style.getPropertyValue('--c-dark'),d:Math.round(e.getBoundingClientRect().width)}})})()`);
  const minorMods = g => ev(`(function(){return [].slice.call(document.querySelectorAll('.orb-minor[data-group="${g}"]')).map(function(e){return e.getAttribute('data-mod')})})()`);
  const lastBot = () => ev(`(function(){var a=[].slice.call(document.querySelectorAll('#chatLog .msg-bot .bubble'));if(!a.length)return null;var p=a[a.length-1].querySelector('p');return p?p.textContent.trim():a[a.length-1].textContent.trim()})()`);
  const tapMajor = async id => {
    const c = await ev(`(function(){var e=document.querySelector('.orb-major[data-orb="${id}"]');if(!e)return null;var r=e.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})()`);
    if (!c) return false;
    await tap(c.cx, c.cy); await sleep(850); return true;
  };
  const centerRect = () => ev(`(function(){var c=document.querySelector('#orbCenter');if(!c)return null;var r=c.getBoundingClientRect();return {cx:Math.round(r.left+r.width/2),cy:Math.round(r.top+r.height/2)}})()`);

  /* ================= 桌面 1440x1000 ================= */
  console.log('\n=== 桌面端 (1440x1000) ===');
  await reset(1440, 1000, false);
  await sleep(300);
  const docTitle = await ev('document.title');
  check('验收1 · 页面 title = 未然 · 校园健康', docTitle === '未然 · 校园健康', { docTitle });

  /* 登录页（门禁前） */
  const login = await ev(`(function(){return {mark:document.querySelector('.login-mark')?document.querySelector('.login-mark').textContent.trim():null,title:document.querySelector('#loginTitle')?document.querySelector('#loginTitle').textContent.trim():null,sub:document.querySelector('.login-sub')?document.querySelector('.login-sub').textContent.trim():null,consent:document.querySelector('#consentTitle')?document.querySelector('#consentTitle').textContent.trim():null}})()`);
  check('规格一 · 登录页大标题「未然」/ 图标「未」/ 副标题「防患于未然 · 校园健康助手」',
    login && login.mark === '未' && login.title === '未然' && login.sub === '防患于未然 · 校园健康助手', login);
  check('规格一 · 知情同意书标题原文本不含旧名（无需替换，未改动）',
    login && login.consent === '个人信息收集与使用知情同意书' && login.consent.indexOf('校园健康助手') < 0, { consent: login && login.consent });
  const sLogin = await shot('v24-desktop-login.png'); console.log('SHOT  v24-desktop-login.png  ' + sLogin + ' bytes');

  await click('.demo-acc[data-sid="20260101"]'); await sleep(140);
  await click('#loginBtn'); await sleep(420);
  await click('#consent_diet'); await click('#consent_sleep'); await click('#consent_exercise'); await sleep(120);
  await click('#consentAgree'); await sleep(520);
  const reco = await ev(`(function(){var m=document.querySelector('#introModal');return {open:m&&!m.hidden,eyebrow:document.querySelector('.eyebrow')?document.querySelector('.eyebrow').textContent.trim():null,title:document.querySelector('#recoTitle')?document.querySelector('#recoTitle').textContent.trim():null}})()`);
  check('规格一 · 推荐弹窗品牌行「未然 · 参赛演示版」，标题不含旧名',
    reco && reco.open && reco.eyebrow === '未然 · 参赛演示版' && reco.title.indexOf('校园健康助手') < 0, reco);
  const sReco = await shot('v24-desktop-reco.png'); console.log('SHOT  v24-desktop-reco.png  ' + sReco + ' bytes');
  await click('#recoStart'); await sleep(300);

  /* 验收 1 / 2：顶栏、logo、头像、欢迎语 */
  const top = await ev(`(function(){var f=function(s){var e=document.querySelector(s);return e?e.textContent.trim():null};return {strong:f('.brand-text strong'),small:f('.brand-text small'),mark:f('.brand-mark'),mini:f('.mini-avatar'),head:f('.pane-head-text strong'),aria:document.querySelector('.brand')?document.querySelector('.brand').getAttribute('aria-label'):null}})()`);
  check('验收1 · 顶栏主标题「未然」+ 副标题「食序 · 息衡 · 动跃」',
    top && top.strong === '未然' && top.small === '食序 · 息衡 · 动跃', top);
  check('验收2 · 顶栏 Logo / 左栏小头像 / AI 气泡头像均为「未」',
    top && top.mark === '未' && top.mini === '未' &&
    (await ev(`(function(){return [].slice.call(document.querySelectorAll('#chatLog .bubble-avatar')).every(function(e){return e.textContent.trim()==='未'})})()`)) === true, top);
  const welcome = await ev(`(function(){var b=document.querySelector('#chatLog .msg-bot .bubble');return b?{txt:b.textContent.replace(/\\s+/g,' ').trim(),chips:[].slice.call(b.querySelectorAll('.quick-chips button')).map(function(e){return e.textContent.trim()})}:null})()`);
  check('四 · 欢迎语三段新文案，且三个快捷胶囊文字不变',
    welcome && /你好，我是未然 👋/.test(welcome.txt) &&
    /名字取自「防患于未然」——希望在你还没生病的时候，就能帮上忙。/.test(welcome.txt) &&
    /可以问我健康相关的问题，也可以点右边的球。/.test(welcome.txt) &&
    JSON.stringify(welcome.chips) === JSON.stringify(['今天吃了多少热量', '这周睡眠怎么样', '体育馆人多吗']), welcome);
  const sInit = await shot('v24-desktop-initial.png'); console.log('SHOT  v24-desktop-initial.png  ' + sInit + ' bytes');

  /* 验收 3：三大球文字 */
  const majors = await majorNames();
  check('验收3 · 三个大球球面文字为 食序 / 息衡 / 动跃（aria 同步）',
    majors && majors.length === 3 && majors.map(x => x.name).join(',') === '食序,息衡,动跃' &&
    majors.every(x => x.aria === x.name), majors && majors.map(x => ({ id: x.id, name: x.name, aria: x.aria })));
  check('六 · 三色配方 / 球径 / 方位未动（小球视图其余属性保持）',
    majors && majors[0].hi === '#FFD9BE' && majors[0].main === '#FF8A5B' && majors[0].dark === '#C9442A' &&
    majors[1].main === '#6B7BE8' && majors[2].main === '#2AA79B' && majors.every(x => x.d > 0),
    majors && majors.map(x => ({ hi: x.hi, main: x.main, dark: x.dark, d: x.d })));

  /* 验收 4 / 5 / 6：点三个大球 → 中球名 + AI 解释句 */
  const EXPECT = {
    food: { label: '食序', explain: '食序，也就是饮食健康。', mods: ['菜品营养', '饮食记录', '食堂安全'] },
    sleep: { label: '息衡', explain: '息衡，也就是作息健康。', mods: ['作息记录', '睡眠质量', '宿舍环境'] },
    sport: { label: '动跃', explain: '动跃，也就是运动健康。', mods: ['运动记录', '场馆器材', '运动建议'] }
  };
  for (const id of ['food', 'sleep', 'sport']) {
    if (id !== 'food') { await click('#orbBack'); await sleep(700); }
    const ok = await tapMajor(id);
    const mods = await minorMods(id);
    const bot = await lastBot();
    const e = EXPECT[id];
    check('验收4/6 · 点' + e.label + '后三个中球仍是实际模块文案（一字未改）',
      ok && mods && JSON.stringify(mods.slice(0, 3)) === JSON.stringify(e.mods), { mods });
    check('验收5/6 · 点' + e.label + '后 AI 说明含「' + e.explain + '」且模块列表与实际一致',
      bot && bot.indexOf(e.explain) === 0 && bot.indexOf('包含三个模块：' + e.mods.join('、') + '。点右边的球看看。') > 0, { bot });
    if (id === 'food') { const sFood = await shot('v24-desktop-food.png'); console.log('SHOT  v24-desktop-food.png  ' + sFood + ' bytes'); }
  }
  await click('#orbBack'); await sleep(650);

  /* 验收 7 / 8：FAQ 10 个分类标签，前三类显示新名，data-cat 原值不变 */
  await click('#faqOpenBtn'); await sleep(350);
  const faq = await ev(`(function(){var t=[].slice.call(document.querySelectorAll('.faq-tab'));return {tabs:t.map(function(e){return {txt:e.textContent.trim(),cat:e.getAttribute('data-cat')}}),groups:[].slice.call(document.querySelectorAll('.faq-group-head')).map(function(e){return e.textContent.trim()}),items:document.querySelectorAll('.faq-q').length,intro:document.querySelector('.faq-intro')?document.querySelector('.faq-intro').textContent.trim():null}})()`);
  const OLD3 = ['食品健康', '作息健康', '运动健康'];
  const KEEP7 = ['校医就诊', '心理健康', '常见病症', '用药常识', '体检体测', '急救常识', '健康档案'];
  check('验收7 · 问答弹窗 10 个分类，前三类显示 食序/息衡/动跃，其余 7 类名字不变',
    faq && faq.tabs.length === 10 &&
    faq.tabs.slice(0, 3).map(x => x.txt).join(',') === '食序,息衡,动跃' &&
    faq.tabs.slice(3).map(x => x.txt).join(',') === KEEP7.join(','), faq && faq.tabs.map(x => x.txt));
  check('验收8 · 分类只改显示名：data-cat 仍是原始 10 类（分组/筛选逻辑不动）',
    faq && faq.tabs.map(x => x.cat).join(',') === OLD3.concat(KEEP7).join(','), faq && faq.tabs.map(x => x.cat));
  check('验收8 · 30 条问答条目数量与「10 个分类 · 每类 3 条」不变',
    faq && faq.items === 30 && /10 个分类 · 每类 3 条/.test(faq.intro) && faq.groups.length === 10,
    faq && { items: faq.items, groups: faq.groups.length });
  const sFaq = await shot('v24-desktop-faq.png'); console.log('SHOT  v24-desktop-faq.png  ' + sFaq + ' bytes');
  /* 点第一条问答 → 卡片分类标签也显示新名，答案四段式内容不变 */
  await click('.faq-q'); await sleep(400);
  const qa = await ev(`(function(){var c=document.querySelector('#chatLog .qa-card');return c?{cat:document.querySelector('#chatLog .qa-cat')?document.querySelector('#chatLog .qa-cat').textContent.trim():null,sections:document.querySelectorAll('#chatLog .qa-section-title').length,txt:c.textContent.slice(0,80)}:null})()`);
  check('验收7 · 问答卡片的分类标签同步显示「食序」，四段式答案结构不变',
    qa && qa.cat === '食序' && qa.sections === 4, qa);
  if (!(await ev(`(function(){var m=document.querySelector('#faqModal');return !m||m.hidden})()`))) { await click('#closeFaq'); await sleep(200); }

  const runtimeCat = await ev(`(function(){var c=window.__faqCatalog?window.__faqCatalog():null;var m=window.__faqMatch?window.__faqMatch('食堂几点开饭'):null;return {n:c?c.length:0,cats:c?[].concat.apply([],c.map(function(x){return [x.category]})).filter(function(v,i,a){return a.indexOf(v)===i}):[],q1:c?c[0].question:null,source:m?m.source:null,best:m?m.bestId:null,top:m&&m.top?m.top[0].id:null}})()`);
  check('验收8 · 运行时 30 条问答内容不变，分类字段仍为原值，匹配结果不变',
    runtimeCat && runtimeCat.n === 30 && runtimeCat.q1 === '食堂几点开饭' &&
    runtimeCat.cats.slice(0, 3).join(',') === OLD3.join(',') && (runtimeCat.best === 1 || runtimeCat.top === 1), runtimeCat);
  check('验收9 · 云数据库 / 本地镜像 30 条均在线且未改动（source = ' + (runtimeCat && runtimeCat.source) + '）',
    runtimeCat && runtimeCat.n === 30, { source: runtimeCat && runtimeCat.source });

  /* 回归：门禁 key、医生预约、我的预约、我要请假、主色/毛玻璃/圆角 */
  const keys = await ev(`(function(){return Object.keys(localStorage).sort()})()`);
  check('六 · localStorage key 未变（登录/同意/推荐/抽屉沿用原 key）',
    keys && keys.indexOf('xiaotong.login.v1') >= 0 && keys.indexOf('xiaotong.consent.v1') >= 0 && keys.indexOf('xiaotong.reco.v1') >= 0, keys);
  const c = await centerRect();
  await tap(c.cx, c.cy); await sleep(600);
  const docs = await ev(`(function(){var m=document.querySelector('#doctorModal');return {open:m&&!m.hidden,cards:document.querySelectorAll('#doctorCards .doc-card').length}})()`);
  check('回归 · 校医院球 → 医生列表 3 张卡仍正常', docs && docs.open && docs.cards === 3, docs);
  await click('#closeDoctor'); await sleep(220);
  await click('#bookBtn'); await sleep(300);
  const my = await ev(`(function(){var a=[].slice.call(document.querySelectorAll('#chatLog .bk-empty'));return a.length?a[a.length-1].textContent.trim():null})()`);
  check('回归 · 「我的预约」空态文案不变', my === '你还没有预约记录。点右侧中间的校医院球可以发起预约。', { my });
  await ev(`(function(){var t=document.querySelector('#userInput');if(t)t.value='我要请假三天';return 1})()`);
  await click('#sendBtn');
  /* 请假意图要过云端模型/本地兜底，历史用例同样轮询等待，不能固定 sleep */
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    if (await ev(`(function(){return !!(document.querySelector('#leaveForm')||document.querySelector('[data-open-leave]'))})()`)) break;
  }
  const leaveInfo = () => ev(`(function(){var m=document.querySelector('#leaveModal');return {open:!!(m&&!m.hidden),form:!!document.querySelector('#leaveForm'),mode:m?m.classList.contains('booking-mode'):null,title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent.trim():null,slot:!!document.querySelector('#lvSlot'),meta:(document.querySelector('.doc-meta')||{}).textContent||''}})()`);
  let leave = await leaveInfo();
  if (!leave.form) { await click('[data-open-leave]'); await sleep(350); leave = await leaveInfo(); }
  check('回归 · 原有「我要请假」流程不受影响（原请假条，非预约模式）',
    leave && leave.open && leave.form && /请假条生成/.test(leave.title) && !leave.mode && !leave.slot, leave);
  await click('#leaveForm button[type="submit"]'); await sleep(420);
  const generated = await ev(`(function(){return {doc:!!document.querySelector('#leaveDoc'),title:document.querySelector('#leaveTitle')?document.querySelector('#leaveTitle').textContent.trim():null,meta:(document.querySelector('.doc-meta')||{}).textContent||''}})()`);
  check('验收10 · 运行态生成的请假条署名已是「未然」且无旧名',
    generated && generated.doc && /未然 · 就诊预约生成/.test(generated.meta) && !/校园健康助手/.test(generated.meta),
    { doc: generated && generated.doc, title: generated && generated.title, meta: generated && generated.meta.slice(0, 70) });
  await click('#closeModal'); await sleep(200);
  const visual = await ev(`(function(){var b=document.querySelector('.msg-bot .bubble'),t=document.querySelector('.topbar'),p=document.querySelector('.pane-chat');function cs(e){return e?getComputedStyle(e):null}return {color:cs(b)?cs(b).color:null,primary:getComputedStyle(document.documentElement).getPropertyValue('--primary')||null,topBg:cs(t)?cs(t).backgroundColor:null,blur:cs(p)?cs(p).backdropFilter:null,radius:cs(b)?cs(b).borderRadius:null}})()`);
  check('六 · 主色 / 顶栏纯白 / 左栏磨砂 / 气泡圆角未动',
    visual && /rgba?\(255, 255, 255/.test(visual.topBg) && /blur/.test(visual.blur) && visual.color === 'rgb(44, 58, 56)', visual);
  const hsD = await noHScroll();
  check('回归 · 桌面 1440 无横向溢出', hsD && hsD.sw <= hsD.iw + 1, hsD);

  /* ================= 手机 390x844 ================= */
  console.log('\n=== 手机端 (390x844) ===');
  await reset(390, 844, true);
  await sleep(350);
  const loginM = await ev(`(function(){var c=document.querySelector('.login-card');if(!c)return null;var r=c.getBoundingClientRect();return {w:Math.round(r.width),sub:document.querySelector('.login-sub')?document.querySelector('.login-sub').textContent.trim():null}})()`);
  check('验收11 · 手机登录页副标题不溢出', loginM && loginM.w <= 390, loginM);
  await passGates();
  await sleep(300);
  const mTop = await ev(`(function(){var t=document.querySelector('.topbar'),b=document.querySelector('.brand-text'),r=document.querySelector('.topbar-right');if(!t)return null;function R(e){var x=e.getBoundingClientRect();return {l:Math.round(x.left),r:Math.round(x.right),t:Math.round(x.top),b:Math.round(x.bottom)}}return {bar:R(t),brand:R(b),right:R(r),strong:document.querySelector('.brand-text strong')?document.querySelector('.brand-text strong').textContent.trim():null,small:document.querySelector('.brand-text small')?document.querySelector('.brand-text small').textContent.trim():null,smallHidden:getComputedStyle(document.querySelector('.brand-text small')).display,btnSizes:[].slice.call(document.querySelectorAll('.top-btn')).map(function(e){return Math.round(e.getBoundingClientRect().width)})}})()`);
  const hsM = await noHScroll();
  check('验收11 · 手机顶栏「未然」不溢出（品牌区与右侧按钮不重叠、无横滚）',
    mTop && mTop.brand.r <= mTop.right.l + 1 && mTop.right.r <= 390 && mTop.bar.b <= 80 &&
    hsM && hsM.sw <= hsM.iw + 1, { mTop, hsM });
  const sMobile = await shot('v24-mobile-topbar.png'); console.log('SHOT  v24-mobile-topbar.png  ' + sMobile + ' bytes');
  const mMajors = await majorNames();
  check('验收3 · 手机端三个大球同为 食序 / 息衡 / 动跃',
    mMajors && mMajors.map(x => x.name).join(',') === '食序,息衡,动跃', mMajors && mMajors.map(x => x.name));
  const sMOrbs = await shot('v24-mobile-orbs.png'); console.log('SHOT  v24-mobile-orbs.png  ' + sMOrbs + ' bytes');
  await click('#faqOpenBtn'); await sleep(350);
  const mFaq = await ev(`(function(){var t=[].slice.call(document.querySelectorAll('.faq-tab'));return {n:t.length,first3:t.slice(0,3).map(function(e){return e.textContent.trim()}),dialogW:Math.round(document.querySelector('.faq-dialog').getBoundingClientRect().width)}})()`);
  check('验收7/11 · 手机端 FAQ 前三类标签正常，弹窗不溢出',
    mFaq && mFaq.n === 10 && mFaq.first3.join(',') === '食序,息衡,动跃' && mFaq.dialogW <= 390, mFaq);
  const sMFaq = await shot('v24-mobile-faq.png'); console.log('SHOT  v24-mobile-faq.png  ' + sMFaq + ' bytes');
  await click('#closeFaq'); await sleep(200);
  const drawer = await ev(`(function(){return !!(window.XT_DRAWER&&window.XT_DRAWER.open)})()`);
  check('回归 · 手机抽屉钩子仍可用', drawer === true);

  /* 验收 12 */
  check('验收12 · 全流程无 jsError', jsErrors.length === 0, jsErrors.slice(0, 8));
  const pass = results.filter(r => r.ok).length;
  console.log('\n==== ' + pass + '/' + results.length + ' PASS ====');
  if (pass !== results.length) {
    console.log('FAILED: ' + results.filter(r => !r.ok).map(r => r.name).join(' | '));
    process.exitCode = 1;
  }
  ws.close();
}
main().catch(e => { console.error('FATAL', e); process.exit(1); });
