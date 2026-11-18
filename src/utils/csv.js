'use strict';
/* Safe CSV writer. Cells that start with = + - @ (or a control char) get a leading ' so a spreadsheet will not run them as formulas. */
const cell = v => {
  let s = v === null || v === undefined ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

const toCsv = rows => rows.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';

module.exports = { toCsv, cell };
