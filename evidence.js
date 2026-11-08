/* 「小通同学」首屏数据证据区 —— 独立配置文件
 * 只放数值与来源文案，页面组件（index.html / app.js）不硬编码任何数字。
 * 以后要替换数据，直接改下面 cards 里的 value / unit / label / source，以及 note，刷新页面即可生效。
 */
window.XIAOTONG_EVIDENCE = {
  note: '数据来自公开发布的第三方调查 · 本校抽样验证中',
  cards: [
    {
      value: '41',
      unit: '个',
      label: '高校平均拥有的业务系统数量',
      source: '《2024年中国高校数字化发展报告》· 1407 所高校填报'
    },
    {
      value: '58.51%',
      unit: '',
      label: '手机里同时装着 5 个以上校园 App 的大学生',
      source: '中国青年报·中青校媒 · 2895 份有效问卷'
    },
    {
      value: '67.63%',
      unit: '',
      label: '期待学校整合资源、为校园 App「瘦身」的大学生',
      source: '中国青年报·中青校媒 · 2895 份有效问卷'
    }
  ]
};
