/* 校园健康助手 · 模拟健康档案总配置
 * 全部为虚构脱敏数据，不接入任何真实校医 / 食堂 / 体育馆系统。
 * 学生一律用同学A / B / C / D 代称，学号带 SIM 前缀明示为模拟编号。
 * 4 个身份各带一份完整健康档案；五个问数场景的结果全部由这里的数值现算，
 * 切换身份后同一句问句会返回不同数据（尤其同学A 规律型 vs 同学B 熬夜型）。
 */
(function () {
  'use strict';

  /* ---------- 食堂低脂菜库（模拟，每份口径） ---------- */
  var DISHES = {
    '鸡胸藜麦碗': { kcal: 385, protein: 32 },
    '清蒸鲈鱼套餐': { kcal: 410, protein: 34 },
    '白灼时蔬拼盘': { kcal: 165, protein: 6 },
    '番茄豆腐汤': { kcal: 140, protein: 11 },
    '香菇滑鸡饭（少油版）': { kcal: 420, protein: 28 },
    '虾仁蒸蛋': { kcal: 230, protein: 22 },
    '凉拌鸡丝荞麦面': { kcal: 395, protein: 27 },
    '蒜蓉西兰花': { kcal: 120, protein: 7 }
  };
  var LOW_FAT_WINDOW = '三楼轻食区（模拟）';

  /* ---------- 4 份健康档案 ---------- */
  var IDENTITIES = [
    {
      id: 'c1', label: '2026级1班 同学A', grade: '2026级', classNo: 1, className: '1班',
      name: '同学A', sid: 'SIM20260101',
      profile: { type: '作息规律型', note: '固定 23:00 前后入睡，三餐规律、运动稳定' },
      health: {
        kcalRange: [1800, 2100],
        meals: [
          { meal: '早餐', items: '燕麦牛奶 + 水煮蛋 + 苹果', kcal: 480, protein: 19 },
          { meal: '午餐', items: '米饭 + 香煎鸡胸 + 清炒时蔬', kcal: 680, protein: 36 },
          { meal: '晚餐', items: '番茄鸡蛋面 + 酸奶', kcal: 590, protein: 23 }
        ],
        sleep7: [
          { date: '11-05', day: '周四', sleep: '23:05', wake: '07:00', hours: 7.9, score: 88 },
          { date: '11-06', day: '周五', sleep: '23:15', wake: '07:05', hours: 7.8, score: 86 },
          { date: '11-07', day: '周六', sleep: '23:40', wake: '07:40', hours: 8.0, score: 85 },
          { date: '11-08', day: '周日', sleep: '22:55', wake: '06:55', hours: 8.0, score: 90 },
          { date: '11-09', day: '周一', sleep: '23:00', wake: '06:50', hours: 7.8, score: 89 },
          { date: '11-10', day: '周二', sleep: '23:10', wake: '07:00', hours: 7.8, score: 87 },
          { date: '11-11', day: '周三', sleep: '23:00', wake: '06:55', hours: 7.9, score: 88 }
        ],
        lowFat: ['鸡胸藜麦碗', '白灼时蔬拼盘', '番茄豆腐汤', '虾仁蒸蛋'],
        gym: { present: 42, capacity: 120, free: ['跑步机 6 台', '哑铃区', '羽毛球 2 号场'], quiet: '14:00-16:00', at: '09:30' },
        exercise: {
          count: 12, minutes: 540, kcal: 4200,
          dist: [{ name: '慢跑', count: 6, minutes: 300 }, { name: '羽毛球', count: 4, minutes: 160 }, { name: '力量训练', count: 2, minutes: 80 }]
        }
      }
    },
    {
      id: 'c2', label: '2026级2班 同学B', grade: '2026级', classNo: 2, className: '2班',
      name: '同学B', sid: 'SIM20260201',
      profile: { type: '熬夜型', note: '常凌晨 1 点后入睡，夜间加餐多、白天困倦' },
      health: {
        kcalRange: [1900, 2200],
        meals: [
          { meal: '早餐', items: '豆浆 + 手抓饼', kcal: 380, protein: 11 },
          { meal: '午餐', items: '红烧肉盖饭 + 冰奶茶', kcal: 760, protein: 25 },
          { meal: '晚餐', items: '炸鸡汉堡 + 薯条', kcal: 700, protein: 24 },
          { meal: '夜宵', items: '泡面 + 含糖饮料', kcal: 560, protein: 9 }
        ],
        sleep7: [
          { date: '11-05', day: '周四', sleep: '01:35', wake: '08:20', hours: 6.8, score: 60 },
          { date: '11-06', day: '周五', sleep: '02:10', wake: '08:40', hours: 6.5, score: 54 },
          { date: '11-07', day: '周六', sleep: '02:40', wake: '10:10', hours: 7.5, score: 62 },
          { date: '11-08', day: '周日', sleep: '01:50', wake: '08:30', hours: 6.7, score: 58 },
          { date: '11-09', day: '周一', sleep: '01:20', wake: '07:30', hours: 6.2, score: 56 },
          { date: '11-10', day: '周二', sleep: '02:05', wake: '08:10', hours: 6.1, score: 52 },
          { date: '11-11', day: '周三', sleep: '01:40', wake: '07:50', hours: 6.2, score: 55 }
        ],
        lowFat: ['香菇滑鸡饭（少油版）', '凉拌鸡丝荞麦面', '虾仁蒸蛋', '蒜蓉西兰花'],
        gym: { present: 88, capacity: 120, free: ['拉伸区', '动感单车 2 台'], quiet: '21:00 后', at: '19:10' },
        exercise: {
          count: 3, minutes: 120, kcal: 900,
          dist: [{ name: '慢跑', count: 2, minutes: 70 }, { name: '力量训练', count: 1, minutes: 50 }]
        }
      }
    },
    {
      id: 'c3', label: '2026级3班 同学C', grade: '2026级', classNo: 3, className: '3班',
      name: '同学C', sid: 'SIM20260301',
      profile: { type: '运动活跃型', note: '每周训练 4 次以上，蛋白质摄入与恢复较重视' },
      health: {
        kcalRange: [2100, 2400],
        meals: [
          { meal: '早餐', items: '全麦面包 + 鸡蛋 2 个 + 牛奶', kcal: 560, protein: 28 },
          { meal: '午餐', items: '米饭 + 清蒸鱼 + 西兰花', kcal: 780, protein: 45 },
          { meal: '晚餐', items: '牛肉荞麦面 + 香蕉', kcal: 760, protein: 38 }
        ],
        sleep7: [
          { date: '11-05', day: '周四', sleep: '23:20', wake: '06:50', hours: 7.5, score: 84 },
          { date: '11-06', day: '周五', sleep: '23:35', wake: '07:00', hours: 7.4, score: 82 },
          { date: '11-07', day: '周六', sleep: '23:10', wake: '07:30', hours: 8.3, score: 88 },
          { date: '11-08', day: '周日', sleep: '23:00', wake: '06:40', hours: 7.7, score: 86 },
          { date: '11-09', day: '周一', sleep: '23:25', wake: '06:45', hours: 7.3, score: 81 },
          { date: '11-10', day: '周二', sleep: '23:15', wake: '06:50', hours: 7.6, score: 85 },
          { date: '11-11', day: '周三', sleep: '23:05', wake: '06:45', hours: 7.7, score: 87 }
        ],
        lowFat: ['清蒸鲈鱼套餐', '鸡胸藜麦碗', '虾仁蒸蛋', '白灼时蔬拼盘'],
        gym: { present: 63, capacity: 120, free: ['深蹲架 1 个', '划船机 2 台', '羽毛球 4 号场'], quiet: '11:00-13:00', at: '07:20' },
        exercise: {
          count: 18, minutes: 860, kcal: 7200,
          dist: [{ name: '慢跑', count: 8, minutes: 400 }, { name: '力量训练', count: 6, minutes: 300 }, { name: '游泳', count: 4, minutes: 160 }]
        }
      }
    },
    {
      id: 'c4', label: '2026级4班 同学D', grade: '2026级', classNo: 4, className: '4班',
      name: '同学D', sid: 'SIM20260401',
      profile: { type: '清淡控制型', note: '偏素食、控油控糖，睡眠时长中等但入睡偏晚' },
      health: {
        kcalRange: [1700, 2000],
        meals: [
          { meal: '早餐', items: '小米粥 + 水煮蛋 + 凉拌黄瓜', kcal: 360, protein: 14 },
          { meal: '午餐', items: '杂粮饭 + 白灼时蔬 + 豆腐', kcal: 610, protein: 26 },
          { meal: '晚餐', items: '蔬菜汤面 + 水果', kcal: 520, protein: 17 }
        ],
        sleep7: [
          { date: '11-05', day: '周四', sleep: '00:10', wake: '07:30', hours: 7.3, score: 76 },
          { date: '11-06', day: '周五', sleep: '00:25', wake: '07:40', hours: 7.3, score: 74 },
          { date: '11-07', day: '周六', sleep: '00:50', wake: '08:30', hours: 7.7, score: 79 },
          { date: '11-08', day: '周日', sleep: '23:55', wake: '07:20', hours: 7.4, score: 78 },
          { date: '11-09', day: '周一', sleep: '00:05', wake: '07:20', hours: 7.3, score: 75 },
          { date: '11-10', day: '周二', sleep: '00:20', wake: '07:35', hours: 7.3, score: 73 },
          { date: '11-11', day: '周三', sleep: '00:00', wake: '07:25', hours: 7.4, score: 77 }
        ],
        lowFat: ['白灼时蔬拼盘', '番茄豆腐汤', '蒜蓉西兰花', '虾仁蒸蛋'],
        gym: { present: 31, capacity: 120, free: ['跑步机 9 台', '瑜伽垫区', '羽毛球 1、3 号场'], quiet: '10:00-11:30', at: '10:10' },
        exercise: {
          count: 8, minutes: 330, kcal: 2400,
          dist: [{ name: '快走', count: 4, minutes: 150 }, { name: '瑜伽', count: 3, minutes: 120 }, { name: '慢跑', count: 1, minutes: 60 }]
        }
      }
    }
  ];

  window.XIAOTONG_CAMPUS_DATA = {
    identities: IDENTITIES,
    dishes: DISHES,
    lowFatWindow: LOW_FAT_WINDOW,
    clinic: {
      name: '校医室（模拟）',
      location: '3 号学生宿舍楼一层西侧',
      slots: { '上午': '09:00-11:30', '下午': '14:00-17:00', '晚间': '18:30-20:00' }
    },
    disclaimer: '全部为虚构脱敏模拟数据，不接入任何真实校医或校园系统'
  };
})();
