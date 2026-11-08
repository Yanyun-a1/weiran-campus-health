/* 「小通同学」智能问数
 * 职责：识别三类问数意图 → 解析日期/节次/楼层 → 在 window.XIAOTONG_CAMPUS_DATA 上真实计算 → 渲染「结论 + 明细」
 * 不调用任何真实系统，不返回任何预写死的答案文本；意图识别不依赖大模型，模型不可用时照常工作。
 */
(function () {
  'use strict';

  var D = window.XIAOTONG_CAMPUS_DATA;
  var WEEK = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var CN = {
    '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7,
    '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function weekday(d) { var w = d.getDay(); return w === 0 ? 7 : w; }
  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function dateLabel(d) { return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 ' + WEEK[weekday(d)]; }
  function nextSchoolDay() {
    var x = new Date(), w = weekday(x);
    return w > 5 ? addDays(x, 8 - w) : x;
  }
  function hhmm() { var d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function blockPeriods(b) {
    var p = b.split('-'), r = [];
    for (var i = Number(p[0]); i <= Number(p[1]); i++) r.push(i);
    return r;
  }
  function periodsOf(blocks) {
    return blocks.reduce(function (a, b) { return a.concat(blockPeriods(b)); }, []);
  }

  /* ---------- 意图细分（严格白名单，越界问题一律返回 null 交给事务问答） ---------- */
  function parseZone(t) {
    if (/二楼|2楼|自习区/.test(t)) return '2F';
    if (/三楼|3楼|阅览区/.test(t)) return '3F';
    if (/四楼|4楼|研讨区/.test(t)) return '4F';
    return null;
  }
  function detect(text) {
    var t = String(text || '').replace(/\s+/g, '');
    if (!t) return null;

    // 办事/流程类问题优先归事务问答：含「怎么/流程/去哪/申请」且不含明确问数词
    var procedural = /怎么|如何|怎样|流程|去哪|哪里|在哪|材料|规定|办法|申请|办理|报销|请假|假条|报修|选课|补考|退选|改选|奖学金|助学金|成绩|学分|学生证|在读证明/;
    var dataWord = /有课吗|有课么|有没有课|有什么课|上什么课|几门课|几节课|课程表|课表|空教室|教室空|座位|空位|有座|位置/;
    if (procedural.test(t) && !dataWord.test(t)) return null;

    // 图书馆座位
    var seatWord = /座位|空位|有座|位置|还有位|剩几个/;
    var placeWord = /图书馆|二楼|2楼|三楼|3楼|四楼|4楼|阅览区|自习区|研讨区/;
    if (seatWord.test(t) && placeWord.test(t)) return { kind: 'seats', zone: parseZone(t) };

    // 空教室
    if (/空教室|教室空|哪些教室|有空教室|空着的教室|教室.*空|空.*教室/.test(t)) return { kind: 'rooms' };

    // 课表 / 我的课
    if (/课表|有课|什么课|几门课|几节课|上课|课程安排/.test(t)) return { kind: 'schedule' };

    return null;
  }

  /* ---------- 日期解析 ---------- */
  function resolveDay(text) {
    var t = String(text || '').replace(/\s+/g, '');
    if (/后天/.test(t)) return { kind: 'date', date: addDays(new Date(), 2), prefix: '后天', auto: false };
    if (/明天|明日/.test(t)) return { kind: 'date', date: addDays(new Date(), 1), prefix: '明天', auto: false };
    if (/今天|今日|现在|当前|此刻/.test(t)) return { kind: 'date', date: new Date(), prefix: '今天', auto: false };

    var m = t.match(/(?:周|星期)\s*([一二两三四五六日天1-7])/);
    if (m) {
      var w = CN[m[1]];
      var delta = (w - weekday(new Date()) + 7) % 7;
      return { kind: 'date', date: addDays(new Date(), delta), prefix: '', auto: false, weekdayTarget: w };
    }
    if (/这学期|本学期|一学期|整周|一周|每周|全周/.test(t)) return { kind: 'term', prefix: '', auto: false };

    // 没说日期：取最近一个上课日（周末自动顺延到周一）
    return { kind: 'date', date: nextSchoolDay(), prefix: '', auto: true };
  }

  /* ---------- 节次解析 ----------
   * 全天 8 节按 1-2 / 3-4 / 5-6 / 7-8 四个时段排；
   * 「下午三四节」按下午的第 3、4 节理解，即全天第 7-8 节，并在结论里写明换算。
   */
  function resolvePeriods(text) {
    var t = String(text || '').replace(/\s+/g, '');
    var am = /上午|早上|早晨/.test(t), pm = /下午|午后/.test(t);
    var blocks = null, special = false;

    if (/七八节|7-8节|7～8节|7、8节|第7-8节/.test(t)) blocks = ['7-8'];
    else if (/五六节|5-6节|5、6节|第5-6节/.test(t)) blocks = ['5-6'];
    else if (/三四节|3-4节|3、4节|第3-4节|第3、4节/.test(t)) {
      blocks = pm ? ['7-8'] : ['3-4'];
      special = pm;
    } else if (/一二节|1-2节|1、2节|第1-2节/.test(t)) blocks = ['1-2'];

    if (!blocks) {
      if (am && !pm) blocks = ['1-2', '3-4'];
      else if (pm && !am) blocks = ['5-6', '7-8'];
      else blocks = D.periods.slice();
    }

    var joined = blocks.join(','), label;
    if (special) label = '下午第 3-4 节（全天第 7-8 节）';
    else if (blocks.length === 1) label = '第 ' + blocks[0] + ' 节';
    else if (joined === '1-2,3-4') label = '上午（第 1-4 节）';
    else if (joined === '5-6,7-8') label = '下午（第 5-8 节）';
    else label = '全天（第 1-8 节）';

    return { blocks: blocks, periods: periodsOf(blocks), label: label };
  }

  /* ---------- 1. 课表查询 ---------- */
  function answerSchedule(text, identity) {
    var list = D.schedule[String(identity.classNo)] || [];
    var day = resolveDay(text), per = resolvePeriods(text);
    var lead, rows, sub;

    if (day.kind === 'term') {
      var names = [];
      list.forEach(function (s) { if (names.indexOf(s.course) < 0) names.push(s.course); });
      lead = identity.label + ' 本学期共 ' + names.length + ' 门课';
      rows = '<div class="data-chips">' + names.map(function (n) {
        return '<span>' + esc(n) + '</span>';
      }).join('') + '</div>';
      sub = '按该班每周课表的课程名去重统计，共 ' + list.length + ' 个上课时段。';
    } else {
      var w = weekday(day.date);
      var sessions = w > 5 ? [] : list.filter(function (s) {
        return s.day === w && per.periods.some(function (p) { return p >= s.start && p <= s.end; });
      });
      var dl = dateLabel(day.date);
      if (day.prefix) lead = day.prefix + '（' + dl + '）你有 ' + sessions.length + ' 门课';
      else if (day.auto) lead = '最近上课日（' + dl + '）你有 ' + sessions.length + ' 门课';
      else lead = dl + ' ' + per.label + '你有 ' + sessions.length + ' 门课';
      if (w > 5) lead = dl + ' 是周末，没有排课';

      rows = sessions.length
        ? '<div class="data-rows">' + sessions.map(function (s) {
            return '<div class="data-row">' +
              '<span class="dr-period">第 ' + esc(s.block) + ' 节</span>' +
              '<b>' + esc(s.course) + '</b>' +
              '<span class="dr-meta">' + esc(s.room) + ' · ' + esc(s.teacher) + '</span>' +
            '</div>';
          }).join('') + '</div>'
        : '<div class="data-empty">这个时段没有课，可以安心安排别的事。</div>';
      sub = '按 ' + per.label + '筛选，来自 ' + identity.label + ' 的每周课表（共 ' + list.length + ' 个时段）。';
    }
    return { lead: lead, rows: rows, sub: sub };
  }

  /* ---------- 2. 空教室查询 ---------- */
  function answerRooms(text) {
    var day = resolveDay(text), per = resolvePeriods(text);
    var date = day.date, w = weekday(date);
    if (w > 5) { date = nextSchoolDay(); w = weekday(date); }
    var idx = w - 1;
    var free = D.rooms.filter(function (r) {
      return per.periods.every(function (p) { return r.occupy[idx].charAt(p - 1) === '0'; });
    });
    var lead = (day.auto ? '最近上课日 ' : '') + dateLabel(date) + ' · ' + per.label + '：' + free.length + ' 间教室空着';
    var rows = free.length
      ? '<div class="data-scroll"><table class="data-table table-rooms">' +
          '<thead><tr><th>教室</th><th>区域</th><th>座位</th><th>空闲节次</th></tr></thead><tbody>' +
          free.map(function (r) {
            return '<tr><td><b>' + esc(r.id) + '</b></td><td>' + esc(r.area) + '</td>' +
              '<td>' + r.seats + '</td><td>' + esc(per.blocks.join('、')) + '</td></tr>';
          }).join('') +
        '</tbody></table></div>'
      : '<div class="data-empty">这个时段 12 间教室都被占用了，换个节次试试。</div>';
    var sub = '对 12 间教室的「周一至周五 × 第 1-8 节」占用表逐节比对，' +
      (D.rooms.length - free.length) + ' 间在该时段被占用。';
    return { lead: lead, rows: rows, sub: sub };
  }

  /* ---------- 3. 图书馆座位 ---------- */
  function answerSeats(zoneId) {
    var zones = D.library.zones.map(function (z) {
      return { id: z.id, name: z.name, total: z.total, used: z.used, free: z.total - z.used };
    });
    var total = sum(zones.map(function (z) { return z.total; }));
    var used = sum(zones.map(function (z) { return z.used; }));
    var free = sum(zones.map(function (z) { return z.free; }));
    var pick = zoneId ? zones.filter(function (z) { return z.id === zoneId; })[0] : null;

    var lead = pick
      ? pick.name + '还有 ' + pick.free + ' 个空位（共 ' + pick.total + ' 座，已用 ' + pick.used + ' 座）'
      : '图书馆现在还有 ' + free + ' 个空位（共 ' + total + ' 座）';

    var rows = '<div class="data-scroll"><table class="data-table">' +
      '<thead><tr><th>阅览区</th><th>总座位</th><th>已用</th><th>剩余</th></tr></thead><tbody>' +
      zones.map(function (z) {
        return '<tr class="' + (pick && pick.id === z.id ? 'row-hl' : '') + '">' +
          '<td><b>' + esc(z.name) + '</b></td><td>' + z.total + '</td><td>' + z.used +
          '</td><td class="dr-free">' + z.free + '</td></tr>';
      }).join('') +
      '<tr class="row-total"><td><b>合计</b></td><td>' + total + '</td><td>' + used + '</td><td>' + free + '</td></tr>' +
      '</tbody></table></div>';
    var sub = '剩余 = 总座位 − 已用，三个区逐项现算 · ' + hhmm() + ' 模拟实时快照。';
    return { lead: lead, rows: rows, sub: sub };
  }

  /* ---------- 组装回答 ---------- */
  var KIND_LABEL = { schedule: '课表查询', rooms: '空教室查询', seats: '图书馆座位' };
  function answer(text, identity) {
    var d = detect(text);
    if (!d || !identity) return '';
    var r = d.kind === 'schedule' ? answerSchedule(text, identity)
          : d.kind === 'rooms'   ? answerRooms(text)
          :                       answerSeats(d.zone);

    return '<div class="intent-badge data">📊 智能问数 · ' + KIND_LABEL[d.kind] + '</div>' +
      '<div class="data-head">' +
        '<div class="data-lead">' + esc(r.lead) + '</div>' +
        '<div class="data-context">当前身份：' + esc(identity.label) +
          ' · 「我」按这个身份的班级与姓名计算</div>' +
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
      resolveDay: resolveDay,
      resolvePeriods: resolvePeriods,
      schedule: answerSchedule,
      rooms: answerRooms,
      seats: answerSeats
    }
  };
})();
