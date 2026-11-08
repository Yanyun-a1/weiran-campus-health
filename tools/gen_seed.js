/* 由 faqs.js 生成云数据库 seed SQL（单次 INSERT，无双引号，便于安全传参） */
const fs = require('fs');
const path = require('path');

global.window = {};
require(path.join(__dirname, '..', 'faqs.js'));
const rows = global.window.CAMPUS_FAQS;

const q = (s) => String(s == null ? '' : s).replace(/'/g, "''");
const packSteps = (steps) => steps.map(s => [s.title, s.where, s.bring, s.time].join('~')).join(';;');

const values = rows.map(r =>
  `(${r.id},'${q(r.category)}','${q(r.question)}','${q(r.keywords)}','${q(r.whereText)}','${q(r.durationText)}','${q(packSteps(r.steps))}','${q(r.tip)}',${r.id})`
).join(',\n');

const sql = `INSERT INTO campus_faqs (id, category, question, keywords, where_text, duration_text, steps_text, tip, sort_order) VALUES\n${values}`;
fs.writeFileSync(path.join(__dirname, 'seed.sql'), sql, 'utf8');
console.log('rows=' + rows.length + ' chars=' + sql.length);
console.log('categories=' + [...new Set(rows.map(r => r.category))].join('/'));
