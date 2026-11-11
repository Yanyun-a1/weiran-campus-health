/* 由 faqs.js 生成云数据库 campus_faqs 的同步 SQL（幂等：ON CONFLICT 更新）
 * 表结构沿用 v1（线上 v4 仍在读），四段内容按列语义映射：
 *   judge→where_text，self→steps_text(;;)，doctor→duration_text(;;)，
 *   caution→tip(;;)，keywords[]→keywords(空格分隔)。
 * 用法：node tools/gen_seed.js  →  写出 tools/seed.sql
 */
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'faqs.js'));
const rows = global.window.CAMPUS_FAQS;

const q = (s) => String(s == null ? '' : s).replace(/'/g, "''");
const pack = (arr) => (arr || []).join(';;');

const values = rows.map(r =>
  `(${r.id},'${q(r.category)}','${q(r.question)}','${q((r.keywords || []).join(' '))}',` +
  `'${q(r.judge)}','${q(pack(r.doctor))}','${q(pack(r.self))}','${q(pack(r.caution))}',${r.id})`
).join(',\n');

const sql =
  `INSERT INTO campus_faqs (id, category, question, keywords, where_text, duration_text, steps_text, tip, sort_order) VALUES\n${values}\n` +
  `ON CONFLICT (id) DO UPDATE SET ` +
  `category=EXCLUDED.category, question=EXCLUDED.question, keywords=EXCLUDED.keywords, ` +
  `where_text=EXCLUDED.where_text, duration_text=EXCLUDED.duration_text, ` +
  `steps_text=EXCLUDED.steps_text, tip=EXCLUDED.tip, sort_order=EXCLUDED.sort_order`;

fs.writeFileSync(path.join(__dirname, 'seed.sql'), sql, 'utf8');
console.log('rows=' + rows.length + ' chars=' + sql.length);
console.log('categories=' + [...new Set(rows.map(r => r.category))].join('/'));
console.log('allFourSections=' + rows.every(r => r.judge && r.self.length >= 2 && r.doctor.length >= 1 && r.caution.length >= 1));
console.log('keywordsArray=' + rows.every(r => Array.isArray(r.keywords) && r.keywords.length >= 5));
