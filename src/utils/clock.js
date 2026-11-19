'use strict';
/* Server clock. All business rules read the date and time from here (never CURRENT_DATE / now() in SQL),
   so APP_FAKE_TODAY keeps rules and CHECK constraints consistent. Dates are 'YYYY-MM-DD' strings in APP_TZ. */
const config = require('../config');

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.APP_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
});

function parts(date) {
  const o = {};
  for (const p of fmt.formatToParts(date)) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}

/* ms to add to a UTC instant to get the wall clock in APP_TZ */
const offsetMs = date => { const p = parts(date); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000; };

/* the current instant. With APP_FAKE_TODAY (non-production only) the date is pinned and the time of day stays real. */
function now() {
  const real = new Date();
  if (!config.FAKE_TODAY) return real;
  const p = parts(real), [y, m, d] = config.FAKE_TODAY.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, p.hour, p.minute, p.second);
  return new Date(wall - offsetMs(real));
}

const pad = n => String(n).padStart(2, '0');
const ymd = date => { const p = parts(date); return `${p.year}-${pad(p.month)}-${pad(p.day)}`; };
const today = () => ymd(now());
const hhmm = (date = now()) => { const p = parts(date); return `${pad(p.hour)}:${pad(p.minute)}`; };

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}
function addMonths(day, n) {
  const [y, m, d] = day.split('-').map(Number), t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}
const diffDays = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const diffHours = (a, b) => (new Date(b).getTime() - new Date(a).getTime()) / 36e5;

/* the instant for a calendar day + 'HH:MM[:SS]' wall time in APP_TZ */
function at(day, time) {
  const [y, m, d] = day.split('-').map(Number), [h, mi, s] = time.split(':').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi, s || 0));
  return new Date(guess.getTime() - offsetMs(guess));
}

module.exports = { now, today, ymd, hhmm, addDays, addMonths, diffDays, diffHours, at };
