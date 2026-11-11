/* 校园健康助手 · 智能问数
 * 五个健康场景：今日热量 / 近 7 天睡眠 / 食堂低脂菜 / 体育馆在场 / 本月运动。
 * 意图由本地确定性白名单识别（不依赖大模型），结果在
 * window.XIAOTONG_CAMPUS_DATA 的模拟档案上现算；切换身份后同一问句结果不同。
 * 不调用任何真实系统，不返回写死的答案文本。
 */
(function () {
  'use strict';

  var D = window.XIAOTONG_CAMPUS_DATA;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function avg(a) { return a.length ? sum(a) / a.length : 0; }
  function round1(n) { return Math.round(n * 10) / 10; }

  /* ---------- 意图细分：先让知识问答 / 预约走各自通道，再认五个问数场景 ---------- */
  function detect(text) {
    var t = String(text || '').replace(/\s+/g, '');
    if (!t) return null;

    // 办事与知识咨询类优先交给 30 条健康知识库 / 预约表单
    var askWord = /怎么办|怎么处理|要带什么|在哪里|几点开饭|几点上班|有哪些项目|要收费吗|谁能看到|怎么授权|怎么撤销|能混着吃吗|完整疗程|空腹能吃药吗|多少度要去医院|能吃什么|热身多久|什么影响|怎么改善|怎么查|哪个窗口|要多久|几点熄灯|开放时间|怎么走/;
    if (askWord.test(t)) return null;
    if (/预约|挂号|就诊|看诊|我要看校医/.test(t)) return null;

    // 1. 今日热量
    if (/卡路里|热量|今天吃|三餐|摄入|吃了多少|吃了啥/.test(t)) return { kind: 'calories' };
    // 2. 近 7 天睡眠
    if (/睡眠|睡得|睡了多久|入睡|熬夜|这周睡|睡得怎么样/.test(t)) return { kind: 'sleep' };
    // 3. 食堂低脂菜
    if (/低脂|低卡|减脂|清淡|少油|轻食/.test(t)) return { kind: 'lowfat' };
    // 4. 体育馆在场
    if (/体育馆|人多|在场|器材|健身房|空闲时段/.test(t)) return { kind: 'gym' };
    // 5. 本月运动
    if (/运动了几次|运动次数|运动量|本月运动|这个月.*运动|锻炼.*几次/.test(t)) return { kind: 'exercise' };

    return null;
  }

  /* ---------- 1. 今日热量：三餐明细 + 总热量 + 建议范围 ---------- */
  function answerCalories(text, identity) {
    var h = identity.health, meals = h.meals;
    var total = sum(meals.map(function (m) { return m.kcal; }));
    var protein = sum(meals.map(function (m) { return m.protein; }));
    var lo = h.kcalRange[0], hi = h.kcalRange[1];
    var gap = total > hi ? '比建议上限多 ' + (total - hi) + ' 千卡' :
              total < lo ? '比建议下限少 ' + (lo - total) + ' 千卡' : '落在建议区间内';
    var lead = identity.label + ' 今日共摄入 ' + total + ' 千卡（建议 ' + lo + '-' + hi + ' 千卡）';

    var rows = '<div class="data-scroll"><table class="data-table">' +
      '<thead><tr><th>餐次</th><th>内容</th><th>热量</th><th>蛋白质</th></tr></thead><tbody>' +
      meals.map(function (m) {
        return '<tr><td><b>' + esc(m.meal) + '</b></td><td>' + esc(m.items) + '</td>' +
          '<td>' + m.kcal + ' 千卡</td><td>' + m.protein + ' g</td></tr>';
      }).join('') +
      '<tr class="row-total"><td><b>合计</b></td><td>' + meals.length + ' 餐</td><td><b>' +
        total + ' 千卡</b></td><td>' + protein + ' g</td></tr>' +
      '</tbody></table></div>';
    var sub = '按 ' + identity.label + ' 的模拟饮食记录逐餐累加；' + gap +
      '，蛋白质共 ' + protein + ' g。想看低脂菜可问「食堂三楼有什么低脂的」。';
    return { lead: lead, rows: rows, sub: sub };
  }

  /* ---------- 2. 近 7 天睡眠：入睡 / 起床 / 时长 / 质量评分 ---------- */
  function answerSleep(text, identity) {
    var h = identity.health, list = h.sleep7;
    var avgH = round1(avg(list.map(function (d) { return d.hours; })));
    var avgS = Math.round(avg(list.map(function (d) { return d.score; })));
    var short = list.filter(function (d) { return d.hours < 6.5; }).length;
    var lead = identity.label + ' 近 7 天平均睡眠 ' + avgH + ' 小时，质量评分 ' + avgS + ' 分';

    var rows = '<div class="data-rows">' + list.map(function (d) {
      return '<div class="data-row">' +
        '<span class="dr-period">' + esc(d.date) + ' ' + esc(d.day) + '</span>' +
        '<b>' + esc(d.sleep) + ' → ' + esc(d.wake) + '</b>' +
        '<span class="dr-meta">' + d.hours.toFixed(1) + ' 小时 · 质量 ' + d.score + ' 分</span>' +
      '</div>';
    }).join('') + '</div>';
    var sub = '档案画像：' + identity.profile.type + '。7 天中有 ' + short + ' 天不足 6.5 小时；' +
      '时长由入睡到起床时间现算，评分是模拟设备给出的睡眠质量分。';
    return { lead: lead, rows: rows, sub: sub };
  }

  /* ---------- 3. 食堂低脂菜：3~5 道菜名 + 热量 + 蛋白质 ---------- */
  function answerLowFat(text, identity) {
    var names = identity.health.lowFat;
    var rowsData = names.map(function (n) {
      var d = D.dishes[n];
      return { name: n, kcal: d.kcal, protein: d.protein, window: D.lowFatWindow };
    });
    var lead = identity.label + ' 常去的' + D.lowFatWindow + '今日有 ' + rowsData.length + ' 道低脂菜';

    var rows = '<div class="data-scroll"><table class="data-table">' +
      '<thead><tr><th>菜名</th><th>热量</th><th>蛋白质</th><th>窗口</th></tr></thead><tbody>' +
      rowsData.map(function (d) {
        return '<tr><td><b>' + esc(d.name) + '</b></td><td>' + d.kcal + ' 千卡</td>' +
          '<td>' + d.protein + ' g</td><td>' + esc(d.window) + '</td></tr>';
      }).join('') +
      '</tbody></table></div>';
    var sub = '按每份口径标注，单份主菜控制在 350-450 千卡；已按 ' +
      identity.profile.type + ' 的历史点餐偏好排序，可备注「少油少盐」。';
    return { lead: lead, rows: rows, sub: sub };
  }

  /* ---------- 4. 体育馆在场：人数 / 容量 + 空闲器材 + 预计空闲时段 ---------- */
  function answerGym(text, identity) {
    var g = identity.health.gym;
    var pct = Math.round(g.present / g.capacity * 100);
    var lead = '体育馆现在 ' + g.present + ' / ' + g.capacity + ' 人在场（约 ' + pct + '%）';

    var rows = '<div class="data-rows">' +
      '<div class="data-row"><span class="dr-period">在场人数</span><b>' + g.present + ' 人</b>' +
        '<span class="dr-meta">容量 ' + g.capacity + ' 人 · ' + g.at + ' 快照</span></div>' +
      '<div class="data-row"><span class="dr-period">空闲器材</span><b>' + esc(g.free.join(' · ')) + '</b></div>' +
      '<div class="data-row"><span class="dr-period">预计空闲</span><b>' + esc(g.quiet) + '</b>' +
        '<span class="dr-meta">按该身份常去时段估算</span></div>' +
      '</div>';
    var sub = '在场人数与空闲器材来自 ' + g.at + ' 的模拟快照，按 ' + identity.label +
      ' 常去时段估算；' + (pct > 70 ? '当前偏满，建议换个时段。' : '当前比较宽松，可以直接去。');
    return { lead: lead, rows: rows, sub: sub };
  }

  /* ---------- 5. 本月运动：次数 / 总时长 / 消耗 / 项目分布 ---------- */
  function answerExercise(text, identity) {
    var e = identity.health.exercise;
    var lead = identity.label + ' 本月运动 ' + e.count + ' 次，累计 ' + e.minutes + ' 分钟';

    var rows = '<div class="data-scroll"><table class="data-table">' +
      '<thead><tr><th>项目</th><th>次数</th><th>时长</th></tr></thead><tbody>' +
      e.dist.map(function (d) {
        return '<tr><td><b>' + esc(d.name) + '</b></td><td>' + d.count + ' 次</td><td>' + d.minutes + ' 分钟</td></tr>';
      }).join('') +
      '<tr class="row-total"><td><b>合计</b></td><td><b>' + e.count + ' 次</b></td><td><b>' +
        e.minutes + ' 分钟</b></td></tr>' +
      '</tbody></table></div>';
    var sub = '按模拟运动打卡记录累加，共消耗约 ' + e.kcal + ' 千卡；' +
      '本月 ' + e.dist.length + ' 类项目，平均每次约 ' + Math.round(e.minutes / e.count) + ' 分钟。';
    return { lead: lead, rows: rows, sub: sub };
  }

  /* ---------- 组装回答 ---------- */
  var KIND_LABEL = {
    calories: '今日热量', sleep: '近 7 天睡眠', lowfat: '食堂低脂菜',
    gym: '体育馆在场', exercise: '本月运动'
  };
  function answer(text, identity) {
    var d = detect(text);
    if (!d || !identity || !identity.health) return '';
    var r = d.kind === 'calories' ? answerCalories(text, identity)
          : d.kind === 'sleep'    ? answerSleep(text, identity)
          : d.kind === 'lowfat'   ? answerLowFat(text, identity)
          : d.kind === 'gym'      ? answerGym(text, identity)
          :                        answerExercise(text, identity);

    return '<div class="intent-badge data">📊 智能问数 · ' + KIND_LABEL[d.kind] + '</div>' +
      '<div class="data-head">' +
        '<div class="data-lead">' + esc(r.lead) + '</div>' +
        '<div class="data-context">当前身份：' + esc(identity.label) +
          ' · 档案画像：' + esc(identity.profile.type) + ' · 「我」按这份档案现算</div>' +
      '</div>' +
      '<div class="data-card">' + r.rows +
        '<div class="data-note">' + esc(r.sub) +
          ' · 意图由本地规则识别（模型不可用时照常可用），结果由模拟数据现算，不连接真实系统。</div>' +
      '</div>';
  }

  window.XiaoTongData = {
    detect: detect,
    answer: answer,
    data: D,
    compute: {
      calories: answerCalories,
      sleep: answerSleep,
      lowfat: answerLowFat,
      gym: answerGym,
      exercise: answerExercise
    }
  };
})();
