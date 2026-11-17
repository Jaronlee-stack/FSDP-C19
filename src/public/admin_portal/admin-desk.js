'use strict';
/* AIKIDO SHINJU-KAI — admin-desk.js  (office portal, front desk: Today, Classes > Rosters, Roster, Payments, Equipment)

   Loaded after admin-shell.js. Prototype only: every rule here also has to be enforced by the server in the real system. */

const POL = () => DB.policies || {};
const BOOKING_RULES = () => Object.assign({ aheadMonths: 1, minDays: 1, cancelHours: 4, maxPackages: 2 }, POL().booking);
const DOGI_PRICE = 85;   // the Policies page has no dogi price yet, so the desk uses this fixed amount
const iso = d => isoDate(new Date(d));
const dayIdx = d => (new Date(d).getDay() + 6) % 7;   // 0 = Monday, like SESSIONS[].day
const hqClassesOn = date => SESSIONS.filter(s => s.dojo === HQ && s.day === dayIdx(date)).sort((a, b) => a.time.localeCompare(b.time));
const startAt = (date, cls) => { const s = startOfDay(new Date(date)); s.setHours(+cls.time.slice(0, 2), +cls.time.slice(3), 0, 0); return s; };
const who = () => (ADMIN ? ADMIN.name : 'Admin');
const rosterHref = (date, cls) => `roster.html?class=${encodeURIComponent(cls.code)}&date=${iso(date)}`;
const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const uid = p => p + String(Date.now()).slice(-5) + Math.floor(Math.random() * 90 + 10);
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const pill = (cls, t) => `<span class="pill ${cls}">${esc(t)}</span>`;
const STATE_PILL = { 'Upcoming': 'plain', 'Check-in open': 'ok', 'Attendance pending': 'warn', 'Done': 'navy plain', 'Cancelled': 'bad' };
const statePill = st => pill(STATE_PILL[st] || 'plain', st);
const refreshView = () => { if (PAGE === 'roster') renderRoster(); else if (PAGE === 'dashboard') renderToday(); };

/* ---------- people and rosters ---------- */
const SAMPLE_ADULTS = ['Alicia Fong', 'Marcus Yeo', 'Nadia Hassan', 'Peter Lau', 'Sandra Koh', 'Tariq Aziz', 'Vivian Chew', 'Wayne Sim', 'Xin Yi Tay', 'Zachary Ng', 'Bernice Loh', 'Calvin Ang', 'Dewi Santoso', 'Edwin Foo', 'Felicia Tan', 'Gordon Lim', 'Hui Min Teo', 'Irfan Malik'];
const SAMPLE_KIDS = ['Ava Chen', 'Ben Lau', 'Chloe Tan', 'Dylan Ong', 'Ella Sim', 'Finn Koh', 'Grace Ho', 'Hugo Lee', 'Isla Goh', 'Jonah Wee', 'Kyra Pang', 'Leo Yap', 'Mia Chua', 'Noah Seah'];

/* what the access rules need to know about a member. Gender is not collected, so it is assumed to fit the class. */
const personOf = (m, cls) => ({ g: m.g, gender: m.gender || (cls.type === 'Ladies' ? 'Female' : 'Male'), age: m.dob ? ageOn(m.dob) : m.kind === 'child' ? 10 : m.no === ME.no ? ME.age : 30 });
const mkRow = (no, name, g, how, id) => ({ id: id || no, no, name, g, how, status: 'booked' });
const memberLeft = m => m.no === ME.no ? MY_PASSES.filter(p => p.expires >= TODAY).reduce((a, p) => a + p.left, 0) : m.left;
const hasUnlimited = m => m.no === ME.no && !!DB.unlimited;

function genRoster(date, cls) {
  const key = rosterKey(date, cls), rows = [];
  const mine = BOOKINGS.some(b => b.key === key);
  const pool = MEMBERS.filter(m => m.no !== ME.no && m.st === 'Active' && m.left !== 0 && (cls.kids ? m.kind === 'child' : m.kind !== 'child') && !whyNotFor(personOf(m, cls), cls)).sort((a, b) => hash(key + a.no) - hash(key + b.no));
  const names = (cls.kids ? SAMPLE_KIDS : SAMPLE_ADULTS).slice().sort((a, b) => hash(key + a) - hash(key + b));
  const want = Math.min(cls.booked, cls.cap) - (mine ? 1 : 0);
  /* about half the places go to real members, the rest to sample names, so some members are always free to book */
  const real = Math.min(pool.length, Math.ceil(want / 2));
  for (let i = 0; i < real; i++) rows.push(mkRow(pool[i].no, pool[i].n, pool[i].g, 'Online'));
  for (let k = 0; rows.length < want && k < names.length; k++) rows.push(mkRow('', names[k], cls.kids ? '6th Kyu' : ['6th Kyu', '5th Kyu', '4th Kyu'][hash(names[k]) % 3], 'Online', 'S' + k));
  const waitlist = cls.booked >= cls.cap ? names.slice(-2).map((n, k) => ({ id: 'W' + k, no: '', name: n })) : [];
  return { rows, waitlist, submitted: null, corrections: [] };
}
/* the signed-in student's own booking (made in the student portal) shows on the roster; cancelling there removes it */
function syncMine(r, date, cls) {
  const key = rosterKey(date, cls), has = BOOKINGS.some(b => b.key === key), i = r.rows.findIndex(x => x.no === ME.no);
  if (has && i < 0 && !r.submitted) { const m = memberByNo(ME.no); r.rows.unshift(mkRow(ME.no, ME.name, m ? m.g : ME.grade, 'Online')); }
  if (!has && i > -1 && !r.submitted && r.rows[i].status === 'booked' && !ATTENDANCE.some(a => `${iso(a.date)}|${a.time}` === key)) r.rows.splice(i, 1);
}
function getRoster(date, cls) {
  const r = DB.rosters[rosterKey(date, cls)] || genRoster(date, cls);
  syncMine(r, date, cls);
  return r;
}
function ensureRoster(date, cls) { const r = getRoster(date, cls); DB.rosters[rosterKey(date, cls)] = r; return r; }
const counts = r => ({ booked: r.rows.length, present: r.rows.filter(x => x.status === 'present').length, walkins: r.rows.filter(x => x.guest).length, wait: r.waitlist.length });

/* access check for one person on a class: { s: 'ok' | 'warn' | 'bad', t: text } */
function accessOf(row, date, cls) {
  if (row.guest) return { s: 'ok', t: 'Guest pass' };
  const m = row.no && memberByNo(row.no);
  if (!m) return { s: 'ok', t: 'Eligible' };
  const why = whyNotFor(personOf(m, cls), cls) || (m.kind === 'child' && !cls.kids && cls.type !== 'Mixed' ? 'Children attend children\'s classes' : '');
  if (why) return { s: 'bad', t: `Not eligible · ${why}` };
  if (m.st === 'Lapsed') return { s: 'bad', t: 'Dues unpaid' };
  if (m.due > 0) return { s: 'bad', t: `Dues unpaid · ${money(m.due)}` };
  const exp = m.no === ME.no ? (MY_PASSES.filter(p => p.left > 0).map(p => p.expires).sort((a, b) => a - b)[0] || null) : (m.exp ? new Date(m.exp) : null);
  if (exp && iso(exp) < iso(date)) return { s: 'bad', t: 'Package expired' };
  if (exp && daysBetween(date, exp) <= 14) return { s: 'warn', t: `Package expiring · ${fmtShort(exp)}` };
  return { s: 'ok', t: 'Eligible' };
}
function canBook(m, date, cls) {
  const a = accessOf({ no: m.no }, date, cls);
  if (a.s === 'bad') return a;
  if (memberLeft(m) === 0 && !hasUnlimited(m)) return { s: 'bad', t: 'No lessons left' };
  return a;
}
const accessPill = a => pill(a.s, a.t);
const ruleText = cls => cls.kids ? 'Children only' : cls.type === 'Ladies' ? 'Ladies only' : cls.type === 'SG50' ? 'Ages 50 and above' : CLASS_RULES[cls.type] ? CLASS_RULES[cls.type].why : 'Open to all grades';

function classItem(date, cls) {
  const r = getRoster(date, cls), c = counts(r), st = classState(date, cls);
  return `<div class="ag-item desk${cls.kids ? ' kids' : ''}" data-class="${esc(cls.code)}"><div class="ag-time">${timeLabel(cls.time)}<small>${esc(cls.mat || 'Mat A')}</small></div><div class="ag-main"><b>${esc(cls.type)}</b><span>${esc(cls.ins)} · ${c.booked}/${cls.cap} booked${c.wait ? ` · ${c.wait} waitlist` : ''}</span></div><div class="ag-acts">${statePill(st)}<a class="sbtn dark" href="${rosterHref(date, cls)}">Open roster</a></div></div>`;
}

/* ---------- Today (front desk home) ---------- */
function renderToday() {
  const todays = hqClassesOn(TODAY);
  $('#fdDate').textContent = `HQ Dojo · ${dayName(TODAY)} ${fmtDate(TODAY)}`;
  const open = todays.filter(c => classState(TODAY, c) !== 'Cancelled');
  const pending = todays.concat(hqClassesOn(addDays(TODAY, -1)).map(c => ({ c, y: true }))).filter(x => x.y ? classState(addDays(TODAY, -1), x.c) === 'Attendance pending' : classState(TODAY, x) === 'Attendance pending').length;
  const owed = (DB.ledger || []).filter(l => l.st === 'Outstanding');
  const card = (cls, l, v, h, page) => `<a class="stat ${cls}" href="${pageFile(page)}"><span class="l">${l}</span><span class="v">${v}</span><span class="h">${h}</span></a>`;
  $('#fdStats').innerHTML = card('', 'Sessions today', open.length, closureOn(TODAY) ? 'HQ is closed today' : 'HQ Dojo classes', 'sessions')
    + card('alert', 'Attendance pending', pending, 'Classes with attendance not submitted', 'sessions')
    + card('', 'Payments needing attention', owed.length, `${money(owed.reduce((s, l) => s + l.amt, 0))} to collect`, 'payments')
    + card('', 'Incomplete registrations', APPS.length, 'Waiting to be activated', 'applications');

  $('#fdSessions').innerHTML = todays.length ? todays.map(c => classItem(TODAY, c)).join('') : '<div class="ag-empty">No HQ classes today.</div>';
  if (closureOn(TODAY)) $('#fdSessions').insertAdjacentHTML('afterbegin', `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span>HQ is closed today${closureOn(TODAY).note ? ': ' + esc(closureOn(TODAY).note) : ''}. Classes are cancelled.</span></div>`);

  /* expected arrivals with an access warning, from today's rosters */
  const warns = [];
  todays.filter(c => ['Upcoming', 'Check-in open'].includes(classState(TODAY, c))).forEach(c => getRoster(TODAY, c).rows.forEach(x => { const a = accessOf(x, TODAY, c); if (a.s !== 'ok') warns.push({ x, a, c }); }));
  const eq = (DB.equipment || []).filter(e => e.status !== 'Handed over').length;
  const fu = (DB.followups || []).filter(f => iso(f.due) <= iso(TODAY)).length;
  const mc = MC_REQS.filter(r => r.status === 'pending').length;
  const row = (ic, t, d, page, btn, extra = '') => `<div class="row"><span class="av navy">${icon(ic)}</span><div class="grow"><div class="t">${t}</div><div class="d">${d}</div></div><${extra ? 'a class="sbtn" href="' + extra + '"' : 'button class="sbtn" data-page-link="' + page + '"'}>${btn}</${extra ? 'a' : 'button'}></div>`;
  const w = warns[0];
  $('#fdWaiting').innerHTML =
    (w ? row('shield', `${plural(warns.length, 'arrival')} with an access warning`, `${esc(w.x.name)}: ${esc(w.a.t)} · ${esc(w.c.type)} ${timeLabel(w.c.time)}`, '', 'Open roster', rosterHref(TODAY, w.c))
       : row('shield', 'Access warnings', 'No warnings for the classes still to come today', 'sessions', 'Classes'))
    + row('card', 'Payments to collect', `${plural(owed.length, 'payment')} outstanding`, 'payments', 'Collect')
    + row('box', 'Equipment to hand over', `${plural(eq, 'order')} not handed over yet`, 'equipment', 'Open')
    + row('flag', 'Follow-ups due', `${plural(fu, 'student')} to contact today or earlier`, 'followups', 'Open')
    + row('inbox', 'Incomplete registrations', `${plural(APPS.length, 'registration')} waiting`, 'applications', 'Review')
    + row('doc', 'Extension requests', `${plural(mc, 'request')} with a medical certificate or compassion extension`, 'applications', 'Review');
}

function findStudentModal() {
  openModal(`<h3 id="modalTitle">Find a student</h3><div class="fld" style="margin-top:14px"><label for="fs-q">Name, member no., phone, email or guardian</label><input id="fs-q" type="search" autocomplete="off" autofocus></div><div class="rows" id="fs-list"></div>`);
  const draw = () => { $('#fs-list').innerHTML = findMembers($('#fs-q').value).map(m => `<a class="row row-btn" href="member.html?no=${encodeURIComponent(m.no)}" style="text-decoration:none"><span class="av">${initials(m.n)}</span><div class="grow"><div class="t">${esc(m.n)}</div><div class="d">${esc(m.no)} · ${esc(m.g)}${m.phone ? ' · ' + esc(m.phone) : ''}</div></div>${icon('right')}</a>`).join('') || '<p style="color:var(--muted)">No student found.</p>'; };
  $('#fs-q').addEventListener('input', draw); draw();
}
const findMembers = q => {
  q = q.trim().toLowerCase();
  return MEMBERS.filter(m => !q || [m.n, m.no, m.phone, m.email, m.guardian].some(v => v && String(v).toLowerCase().includes(q))).sort((a, b) => a.n.localeCompare(b.n)).slice(0, 6);
};
const memberBtn = m => `<button type="button" class="row row-btn" data-pick="${esc(m.no)}"><span class="av">${initials(m.n)}</span><div class="grow"><div class="t">${esc(m.n)}</div><div class="d">${esc(m.no)} · ${esc(m.g)}${m.phone ? ' · ' + esc(m.phone) : ''}</div></div></button>`;

function walkPickClass() {
  const list = hqClassesOn(TODAY).filter(c => ['Upcoming', 'Check-in open'].includes(classState(TODAY, c)));
  if (!list.length) return toast('No class left today to add a guest to.', 'info');
  openModal(`<h3 id="modalTitle">Walk-in guest</h3><p class="sub">Which class is the guest joining?</p><div class="rows" style="margin-top:12px">${list.map(c => `<button type="button" class="row row-btn" data-wcls="${esc(c.code)}"><span class="av navy">${icon('cal')}</span><div class="grow"><div class="t">${esc(c.type)} · ${timeLabel(c.time)}</div><div class="d">${esc(c.ins)}</div></div></button>`).join('')}</div>`);
  $('#modalBody').onclick = e => { const b = e.target.closest('[data-wcls]'); if (b) walkInModal(TODAY, SESSIONS.find(s => s.code === b.dataset.wcls)); };
}

/* ---------- Classes > Rosters ---------- */
const desk = { date: startOfDay(TODAY), view: 'day', payTab: 'today' };
function renderRosters() {
  const d = desk.date, mon = mondayOf(d);
  $('#dayStrip').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(k => { const x = addDays(mon, k), n = hqClassesOn(x).length; return `<button class="ag-day${iso(x) === iso(d) ? ' on' : ''}${iso(x) === iso(TODAY) ? ' today' : ''}" data-day="${iso(x)}" aria-label="${dayName(x)} ${fmtDate(x)}">${DAY[x.getDay()]}<b>${x.getDate()}</b>${n && !closureOn(x) ? '<i></i>' : ''}</button>`; }).join('');
  $('#dayPick').value = iso(d);
  $$('#viewToggle button').forEach(b => b.classList.toggle('on', b.dataset.view === desk.view));
  $('#dayBody').hidden = desk.view !== 'day'; $('#weekBody').hidden = desk.view !== 'week';
  const cl = closureOn(d);
  $('#dayHead').textContent = `${dayName(d)} ${fmtDate(d)}${iso(d) === iso(TODAY) ? ' · Today' : ''}`;
  $('#dayNote').innerHTML = cl ? `<div class="note warn" style="margin-bottom:10px"><svg class="ic"><use href="#i-info"/></svg><span><b>HQ is closed.</b> ${esc(cl.note || '')} Every class on this day is cancelled.</span></div>` : '';
  const list = hqClassesOn(d);
  $('#dayList').innerHTML = list.length ? list.map(c => classItem(d, c)).join('') : '<div class="ag-empty">No HQ classes on this day.</div>';
  const rows = [];
  [0, 1, 2, 3, 4, 5, 6].forEach(k => { const x = addDays(mon, k); hqClassesOn(x).forEach(c => { const r = getRoster(x, c), n = counts(r).booked; rows.push(`<tr><td><b>${dayName(x)}</b> ${fmtShort(x)}</td><td>${timeLabel(c.time)}</td><td><b>${esc(c.type)}</b></td><td>${esc(c.ins)}</td><td class="num">${n}/${c.cap}</td><td class="num">${Math.max(0, c.cap - n)}</td><td>${statePill(classState(x, c))}</td><td><a class="sbtn" href="${rosterHref(x, c)}">Open roster</a></td></tr>`); }); });
  $('#wkRows').innerHTML = rows.join('') || '<tr><td colspan="8" style="color:var(--muted)">No HQ classes this week.</td></tr>';
}
function setTab(tab) {
  $$('#clsTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#tabRosters').style.display = tab === 'rosters' ? 'grid' : 'none';
  const t = $('#tabTimetable'); if (t) { t.hidden = tab !== 'timetable'; t.style.display = tab === 'timetable' ? 'grid' : 'none'; }
  const c = $('#tabClosures'); if (c) { c.hidden = tab !== 'closures'; c.style.display = tab === 'closures' ? 'grid' : 'none'; }
}

/* ---------- Roster page ---------- */
let RC = null;
function renderRoster() {
  const root = $('#rosterRoot'), q = new URLSearchParams(location.search), ds = q.get('date') || '';
  const cls = SESSIONS.find(s => s.code === q.get('class') && s.dojo === HQ);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(ds) ? new Date(ds + 'T00:00:00') : null;
  if (!cls || !date || isNaN(date) || dayIdx(date) !== cls.day) { root.innerHTML = '<div class="card"><h3>Class not found</h3><p style="margin:8px 0 14px;color:var(--muted)">This link does not match an HQ class on that date.</p><a class="sbtn dark" href="sessions.html">Back to Classes</a></div>'; return; }
  RC = { date, cls };
  const r = getRoster(date, cls), st = classState(date, cls), c = counts(r), closed = st === 'Cancelled', locked = !!r.submitted, over = locked || closed || st === 'Done';
  const end = `${String(+cls.time.slice(0, 2) + 1).padStart(2, '0')}:00`;
  document.title = `${cls.type} roster · Admin · Aikido Shinju-Kai`;
  const rows = r.rows.map((x, i) => {
    const a = accessOf(x, date, cls), m = x.no && memberByNo(x.no);
    return `<tr data-i="${i}"><td><div class="who"><span class="av">${initials(x.name)}</span><div><b>${esc(x.name)}</b><span class="num">${x.guest ? 'Guest' : esc(x.no || 'Sample student')}</span></div></div></td>
      <td>${x.g ? `<span class="belt" style="--belt:${beltOf(x.g)}"><i></i>${esc(x.g)}</span>` : '—'}</td>
      <td>${accessPill(a)}</td>
      <td>${esc(x.how)}${x.override ? `<span class="sub-note">Override: ${esc(x.override)}</span>` : ''}</td>
      <td><div class="acts-inline"><button class="mark${x.status === 'present' ? ' on' : ''}" data-att="present" aria-pressed="${x.status === 'present'}">${icon('check')}Present</button><button class="mark${x.status === 'noshow' ? ' on' : ''}" data-att="noshow" aria-pressed="${x.status === 'noshow'}">No-show</button></div></td>
      <td>${over || x.guest ? '' : `<button class="sbtn ghost" data-cancel="${i}" aria-label="Cancel booking for ${esc(x.name)}">${icon('trash')}</button>`}</td></tr>`;
  }).join('') || '<tr><td colspan="6" style="color:var(--muted)">Nobody is booked yet.</td></tr>';
  root.innerHTML = `<div class="page-h"><div><h1>${esc(cls.type)} · ${timeLabel(cls.time)}</h1><p>${dayName(date)} ${fmtDate(date)} · ${timeLabel(cls.time)} to ${timeLabel(end)} · ${esc(cls.ins)} · ${esc(cls.mat || 'Mat A')} · Who can join: ${esc(ruleText(cls))}</p></div>
      <div class="acts wrap">${statePill(st)}<button class="sbtn" id="rWalk"${over ? ' disabled' : ''}>${icon('user')}Add walk-in</button><button class="sbtn" id="rBook"${over ? ' disabled' : ''}>${icon('plus')}Book student</button><button class="sbtn dark" id="rSubmit"${over ? ' disabled' : ''}>${icon('check')}Submit attendance</button></div></div>
    ${closed ? `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span><b>${(closureOn(date, cls) || {}).scope === 'class' ? 'This class is cancelled.' : 'HQ is closed on this date.'}</b> Attendance and bookings are closed.</span></div>` : ''}
    <div class="g4"><div class="stat"><span class="l">Booked</span><span class="v">${c.booked}/${cls.cap}</span><span class="h">${Math.max(0, cls.cap - c.booked)} spaces left</span></div>
      <div class="stat"><span class="l">Checked in</span><span class="v">${c.present}</span><span class="h">Marked present</span></div>
      <div class="stat"><span class="l">Walk-ins</span><span class="v">${c.walkins}</span><span class="h">Guests with a pass</span></div>
      <div class="stat"><span class="l">Waitlist</span><span class="v">${c.wait}</span><span class="h">In order</span></div></div>
    <div class="list-bar"><div class="acts-inline"><button class="sbtn" id="rAllPresent"${over ? ' disabled' : ''}>Mark everyone present</button></div></div>
    <div class="tbl-wrap"><table class="tbl" id="rTbl"><thead><tr><th>Student</th><th>Belt</th><th>Access check</th><th>How booked</th><th>Attendance</th><th></th></tr></thead><tbody id="rRows">${rows}</tbody></table></div>
    ${r.waitlist.length ? `<div class="card"><div class="card-h"><h3>Waitlist</h3><span class="sub">First in line is offered a spot first</span></div><div class="rows">${r.waitlist.map((w, i) => `<div class="row"><span class="av">${i + 1}</span><div class="grow"><div class="t">${esc(w.name)}</div><div class="d">${esc(w.no || 'Sample student')}</div></div><button class="sbtn dark" data-offer="${i}"${over ? ' disabled' : ''}>Offer spot</button></div>`).join('')}</div></div>` : ''}
    <div class="note"><svg class="ic"><use href="#i-info"/></svg><span>A no-show uses the lesson, unless the student sends an approved medical certificate (MC). MC requests are reviewed under Registrations.${locked ? ` <b>Attendance was submitted${r.submittedBy ? ' by ' + esc(r.submittedBy) : ''}.</b> To change a mark, select it and give a reason.` : ''}</span></div>
    ${(r.corrections || []).length ? `<div class="card"><div class="card-h"><h3>Corrections</h3></div><div class="rows">${r.corrections.map(k => `<div class="row"><div class="grow"><div class="t">${esc(k.who)}: ${esc(k.from)} to ${esc(k.to)}</div><div class="d">${esc(k.reason)} · ${esc(k.by)}</div></div></div>`).join('')}</div></div>` : ''}`;
}

function setAttendance(i, st) {
  const { date, cls } = RC, key = rosterKey(date, cls);
  if (closureOn(date, cls)) return;
  const r = getRoster(date, cls), row = r.rows[i]; if (!row) return;
  const next = row.status === st ? 'booked' : st;
  if (r.submitted) {
    openModal(`<h3 id="modalTitle">Correct attendance</h3><p class="sub">${esc(row.name)}: ${esc(row.status)} to ${esc(next)}. This class has already been submitted, so a reason is needed.</p><div class="fld" style="margin-top:16px"><label for="cor-why">Reason</label><textarea id="cor-why" autofocus></textarea></div><div class="acts"><button class="sbtn dark" id="corGo">Save correction</button><button class="sbtn" data-close>Cancel</button></div>`);
    $('#corGo').addEventListener('click', () => {
      const why = $('#cor-why').value.trim(); if (!why) return toast('Add a reason for the correction.', 'bad');
      const R = ensureRoster(date, cls); R.rows[i].status = next;
      R.corrections.push({ at: new Date(), by: who(), who: row.name, from: row.status, to: next, reason: why });
      save(); closeModal(); renderRoster(); toast('Correction saved.');
    });
    return;
  }
  const R = ensureRoster(date, cls); R.rows[i].status = next; save(); renderRoster();
}

function submitAttendance() {
  const { date, cls } = RC, r = ensureRoster(date, cls);
  if (!r.rows.length) return toast('Nobody is booked for this class.', 'bad');
  if (r.rows.some(x => x.status === 'booked')) return toast('Mark every student present or no-show first.', 'bad');
  r.submitted = new Date(); r.submittedBy = who();
  const mine = r.rows.find(x => x.no === ME.no);
  if (mine) recordMyAttendance({ date: startOfDay(date), time: cls.time, type: cls.type, ins: cls.ins, status: mine.status });   // the student's own record and progress
  save(); renderRoster(); toast(`Attendance submitted · ${counts(r).present} present`);
}

function cancelBooking(i) {
  const { date, cls } = RC, r = getRoster(date, cls), row = r.rows[i]; if (!row) return;
  const hrs = (startAt(date, cls) - new Date()) / 36e5, refund = hrs >= BOOKING_RULES().cancelHours;
  openModal(`<h3 id="modalTitle">Cancel ${esc(row.name)}'s booking?</h3><p class="sub">${esc(cls.type)} · ${dayName(date)} ${fmtShort(date)} · ${timeLabel(cls.time)}</p><div class="note${refund ? '' : ' warn'}" style="margin-top:16px"><svg class="ic"><use href="#i-info"/></svg><span>${refund ? `This is at least ${BOOKING_RULES().cancelHours} hours before the class, so the lesson goes back to the student's package.` : `The class starts in under ${BOOKING_RULES().cancelHours} hours, so the lesson is not returned.`}</span></div><div class="acts"><button class="sbtn red" id="cbGo">Cancel booking</button><button class="sbtn" data-close>Keep it</button></div>`);
  $('#cbGo').addEventListener('click', () => {
    const R = ensureRoster(date, cls), k = R.rows.findIndex(x => x.id === row.id); if (k < 0) return;
    const m = row.no && memberByNo(row.no);
    R.rows.splice(k, 1);
    if (row.no === ME.no) {
      const bi = BOOKINGS.findIndex(b => b.key === rosterKey(date, cls));
      if (bi > -1) { const p = MY_PASSES.find(x => x.id === BOOKINGS[bi].passId); BOOKINGS.splice(bi, 1); if (p && refund) p.left++; }
    } else if (m && typeof m.left === 'number' && refund) m.left++;
    save(); closeModal(); renderRoster(); toast(refund ? 'Booking cancelled. Lesson returned.' : 'Booking cancelled. Lesson not returned.', refund ? 'ok' : 'info');
  });
}

function addBooking(date, cls, m, how, override) {
  const R = ensureRoster(date, cls), row = mkRow(m.no, m.n, m.g, how);
  if (override) row.override = override;
  R.rows.push(row);
  if (m.no === ME.no) {
    const p = MY_PASSES.filter(x => x.left > 0 && x.expires >= TODAY).sort((a, b) => a.expires - b.expires)[0];
    BOOKINGS.push({ c: cls, date: startOfDay(date), key: rosterKey(date, cls), passId: p ? p.id : null, unlimited: !p && !!DB.unlimited });
    if (p) p.left--;
  } else if (typeof m.left === 'number' && m.left > 0) m.left--;
}

function bookModal(date, cls) {
  const st = classState(date, cls);
  if (st === 'Cancelled') return toast('HQ is closed on this date.', 'bad');
  if (st === 'Done' || st === 'Attendance pending') return toast('This class has finished.', 'bad');
  const win = BOOKING_RULES();
  if (date > addMonths(TODAY, win.aheadMonths)) return toast(`Classes can be booked up to ${plural(win.aheadMonths, 'month')} ahead.`, 'bad');
  openModal(`<h3 id="modalTitle">Book a student</h3><p class="sub">${esc(cls.type)} · ${dayName(date)} ${fmtShort(date)} · ${timeLabel(cls.time)}. Desk bookings are taken until the class starts. Online booking needs ${plural(win.minDays, 'day')} notice.</p>
    <div class="fld" style="margin-top:14px"><label for="bk-q">Find student</label><input id="bk-q" type="search" placeholder="Name, member no., phone or guardian" autocomplete="off" autofocus></div>
    <div class="rows" id="bk-list"></div><div id="bk-box" style="margin-top:14px"></div>`);
  const draw = () => { $('#bk-list').innerHTML = findMembers($('#bk-q').value).map(memberBtn).join('') || '<p style="color:var(--muted)">No student found.</p>'; };
  $('#bk-q').addEventListener('input', draw); draw();
  $('#bk-list').addEventListener('click', e => {
    const b = e.target.closest('[data-pick]'); if (!b) return;
    $$('#bk-list .row-btn').forEach(x => x.classList.toggle('on', x === b));
    const m = memberByNo(b.dataset.pick), r = getRoster(date, cls), a = canBook(m, date, cls), already = r.rows.some(x => x.no === m.no), full = r.rows.length >= cls.cap;
    const head = `<div class="kv" style="margin:0 0 12px;border-top:1px solid var(--line)"><div><span>Student</span><span>${esc(m.n)} · ${esc(m.no)}</span></div><div><span>Belt</span><span>${esc(m.g)}</span></div><div><span>Access check</span><span>${accessPill(a)}</span></div></div>`;
    let foot = '';
    if (already) foot = '<div class="note"><svg class="ic"><use href="#i-info"/></svg><span>Already booked on this class.</span></div>';
    else if (a.s !== 'bad') foot = `<div class="acts" style="margin-top:0">${full ? '<button class="sbtn dark" id="bk-wait">Class is full. Add to waitlist</button>' : '<button class="sbtn dark" id="bk-do">Book</button>'}<button class="sbtn" data-close>Cancel</button></div>`;
    else foot = `<div class="fld"><label for="bk-why">Reason</label><textarea id="bk-why" placeholder="Why does this student need a place?"></textarea></div><div class="acts" style="margin-top:12px">${isBA() ? '<button class="sbtn red" id="bk-over" data-ba>Override with reason</button>' : '<button class="sbtn dark" id="bk-refer">Refer to Business Admin</button>'}<button class="sbtn" data-close>Cancel</button></div>`;
    $('#bk-box').innerHTML = head + foot; stripBA($('#bk-box'));
    const done = msg => { save(); closeModal(); refreshView(); toast(msg); };
    const go = $('#bk-do'); if (go) go.addEventListener('click', () => { addBooking(date, cls, m, 'Desk'); done(`${m.n} booked. Lesson used.`); });
    const wl = $('#bk-wait'); if (wl) wl.addEventListener('click', () => { const R = ensureRoster(date, cls); R.waitlist.push({ id: m.no, no: m.no, name: m.n }); done(`${m.n} added to the waitlist.`); });
    const rf = $('#bk-refer'); if (rf) rf.addEventListener('click', () => {
      const why = $('#bk-why').value.trim(); if (!why) return toast('Add a reason first.', 'bad');
      DB.exceptions.unshift({ id: uid('X-'), kind: 'access', who: m.n, text: `Asked to join ${cls.type} on ${fmtShort(date)} (${a.t}). ${why}`, by: who(), at: new Date(), status: 'pending' });
      done('Sent to a Business Admin to decide.');
    });
    const ov = $('#bk-over'); if (ov) ov.addEventListener('click', () => {
      const why = $('#bk-why').value.trim(); if (!why) return toast('An override needs a reason.', 'bad');
      if (r.rows.length >= cls.cap) return toast('The class is full.', 'bad');
      addBooking(date, cls, m, 'Desk', why); done(`${m.n} booked with an override.`);
    });
  });
}

const validPass = (g, date) => g.pass === 'trial' ? !g.used : !!g.until && iso(g.until) >= iso(date);
const passLabel = g => ({ trial: 'Free trial', day: 'Day pass', week: 'Week pass' }[g.pass] || g.pass);
function addWalkIn(date, cls, g) {
  const r = getRoster(date, cls);
  if (r.rows.length >= cls.cap) return toast('The class is full.', 'bad');
  const R = ensureRoster(date, cls);
  R.rows.push({ id: g.id, no: '', guest: g.id, name: g.name, g: '', how: 'Walk-in', status: 'booked' });
  if (g.pass === 'trial') g.used = true;
  save(); closeModal(); refreshView(); toast(`${g.name} added as a walk-in.`);
}
function walkInModal(date, cls) {
  const st = classState(date, cls);
  if (st === 'Cancelled' || st === 'Done') return toast('This class is not open for walk-ins.', 'bad');
  const r = getRoster(date, cls), guests = (DB.guests || []).filter(g => validPass(g, date) && !r.rows.some(x => x.guest === g.id));
  openModal(`<h3 id="modalTitle">Add a walk-in guest</h3><p class="sub">${esc(cls.type)} · ${timeLabel(cls.time)}. Only guests with a trial, day or week pass can walk in. Members must book.</p>
    <div class="rows" id="wk-list" style="margin-top:10px">${guests.map(g => `<div class="row"><span class="av">${initials(g.name)}</span><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${passLabel(g)} · ${esc(g.mobile)}</div></div><button class="sbtn dark" data-wk="${esc(g.id)}">Add</button></div>`).join('') || '<p style="color:var(--muted)">No guest has a valid pass for this date.</p>'}</div>
    <h4 style="margin:18px 0 10px">New guest on a free trial</h4>
    <div class="grid2"><div class="fld"><label for="wk-n">Name</label><input id="wk-n" autocomplete="off"></div><div class="fld"><label for="wk-m">Mobile</label><input id="wk-m" inputmode="tel" autocomplete="off"></div><div class="fld full"><label for="wk-e">Email<span class="opt">Optional</span></label><input id="wk-e" type="email" autocomplete="off"></div></div>
    <div id="wk-warn" style="margin-top:12px"></div>
    <div class="acts"><button class="sbtn dark" id="wk-new">Add as trial guest</button><button class="sbtn" data-close>Close</button></div>`);
  $('#wk-list').addEventListener('click', e => { const b = e.target.closest('[data-wk]'); if (b) addWalkIn(date, cls, DB.guests.find(g => g.id === b.dataset.wk)); });
  const digits = s => String(s || '').replace(/\D/g, '');
  $('#wk-new').addEventListener('click', () => {
    const name = $('#wk-n').value.trim(), mob = $('#wk-m').value.trim();
    if (!name || digits(mob).length < 8) return toast('Add a name and a mobile number.', 'bad');
    const same = DB.guests.find(g => digits(g.mobile) === digits(mob));
    if (same && same.pass === 'trial' && same.used) { $('#wk-warn').innerHTML = `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span><b>This mobile number already used a free trial</b> (${esc(same.name)}). They need a day or week pass before they can train.</span></div>`; return; }
    if (same && validPass(same, date)) return addWalkIn(date, cls, same);
    const g = { id: 'G-' + String(DB.guests.length + 1).padStart(2, '0'), name, mobile: mob, email: $('#wk-e').value.trim(), pass: 'trial', used: false, until: null };
    DB.guests.push(g); addWalkIn(date, cls, g);
  });
}

function offerSpot(i) {
  const { date, cls } = RC, r = getRoster(date, cls), w = r.waitlist[i]; if (!w) return;
  if (r.rows.length >= cls.cap) return toast('No space yet. A booking has to be cancelled first.', 'bad');
  const m = w.no && memberByNo(w.no);
  if (m) { const a = canBook(m, date, cls); if (a.s === 'bad') return toast(`${m.n} cannot take the spot: ${a.t}.`, 'bad'); }
  const R = ensureRoster(date, cls); R.waitlist.splice(i, 1);
  if (m) addBooking(date, cls, m, 'Waitlist offer'); else R.rows.push(mkRow('', w.name, '6th Kyu', 'Waitlist offer', w.id));
  save(); renderRoster(); toast(`Spot offered to ${w.name}. They have been notified.`);
}

/* ---------- Payments ---------- */
const stPill = st => pill(st === 'Paid' ? 'ok' : st === 'Processing' ? 'warn' : st === 'Voided' || st === 'Refunded' ? 'plain' : 'bad', st);
const ledgerAll = () => (DB.ledger || []).filter(l => isBA() || l.st !== 'Failed').slice().sort((a, b) => new Date(b.date) - new Date(a.date));
const deskToday = () => (DB.ledger || []).filter(l => l.by === 'desk' && l.st === 'Paid' && iso(l.date) === iso(TODAY));
const dailyLock = () => (DB.dailyLocks || {})[iso(TODAY)];

function receiptPDF(l) {
  saveBlob(`receipt-${l.inv}.pdf`, makePDF([
    { text: 'Aikido Shinju-Kai', size: 18, bold: true }, { text: 'Payment receipt · HQ Dojo', gap: 22 }, { rule: true },
    { text: 'Invoice', value: l.inv, gap: 26 }, { text: 'Date', value: fmtDate(new Date(l.date)) }, { text: 'Member', value: `${l.name} (${l.no})` },
    { text: 'Item', value: l.item }, { text: 'Amount', value: money(l.amt), bold: true }, { text: 'Method', value: 'Stripe' }, { text: 'Status', value: l.st },
    { rule: true }, { text: `Taken by ${who()}`, size: 9 }]));
}

function payStats() {
  const L = DB.ledger || [], paid = ledgerSum(l => l.st === 'Paid' && iso(l.date) === iso(TODAY));
  $('#payHead').textContent = `Stripe · ${MONTHS_FULL[TODAY.getMonth()]} ${TODAY.getFullYear()}`;
  $('#payStats').innerHTML = `<div class="stat dark"><span class="l">Collected today</span><span class="v">${money(paid)}</span><span class="h">Paid through Stripe</span></div>
    <div class="stat alert"><span class="l">Outstanding</span><span class="v">${money(ledgerSum(l => l.st === 'Outstanding'))}</span><span class="h">Booking locked until paid</span></div>
    <div class="stat"><span class="l">Processing</span><span class="v">${L.filter(l => l.st === 'Processing').length}</span><span class="h">Pending on Stripe</span></div>`;
}
function payTabs() {
  const tabs = [['today', 'Today'], ['month', 'This month'], ['out', 'Outstanding'], ['sum', 'Daily summary'], ['ref', 'Refunds']];
  $('#payTabs').innerHTML = tabs.map(([k, l]) => `<button class="fpill${desk.payTab === k ? ' on' : ''}" data-pt="${k}">${l}</button>`).join('')
    + (isBA() ? `<button class="fpill${desk.payTab === 'fail' ? ' on' : ''}" data-pt="fail" data-ba>Failed payments</button>` : '');
}
function rowActions(l) {
  const a = [];
  if (l.st === 'Outstanding') a.push(`<button class="sbtn dark" data-collect="${esc(l.id)}">Collect</button>`);
  if (l.st === 'Paid') a.push(`<button class="sbtn" data-rcpt="${esc(l.id)}">${icon('receipt')}Receipt</button>`);
  if (isBA() && ['Paid', 'Processing', 'Failed'].includes(l.st)) a.push(`<button class="sbtn" data-void="${esc(l.id)}" data-ba>Void or adjust</button>`);
  else if (!isBA() && l.st === 'Paid') a.push(`<button class="sbtn ghost" data-mistake="${esc(l.id)}">Report a mistake</button>`);
  return `<div class="acts-inline">${a.join('')}</div>`;
}
function renderPayments() {
  payStats(); payTabs();
  const t = desk.payTab, table = $('#payTblWrap'), other = $('#payOther');
  const isTable = ['today', 'month', 'out', 'fail'].includes(t);
  table.hidden = !isTable; other.hidden = isTable;
  if (isTable) {
    const list = ledgerAll().filter(l => t === 'today' ? iso(l.date) === iso(TODAY) : t === 'month' ? isThisMonth(l.date) : t === 'out' ? l.st === 'Outstanding' : l.st === 'Failed');
    const empty = { today: 'No payments today yet.', month: 'No payments this month.', out: 'Nothing outstanding.', fail: 'No failed payments.' }[t];
    $('#payRows').innerHTML = list.map(l => `<tr><td><div class="who"><div><b>${esc(l.name)}</b><span class="num">${esc(l.no)}</span></div></div></td><td>${esc(l.item)}${l.note ? `<span class="sub-note">${esc(l.note)}</span>` : ''}</td><td>${fmtShort(new Date(l.date))}</td><td class="num">${money(l.amt)}</td><td>${stPill(l.st)}</td><td>${rowActions(l)}</td></tr>`).join('') || `<tr><td colspan="6" style="color:var(--muted)">${empty}</td></tr>`;
    stripBA($('#payRows'));
  } else if (t === 'sum') {
    const rows = deskToday(), total = rows.reduce((s, l) => s + l.amt, 0), lk = dailyLock();
    other.innerHTML = `<div class="card-h"><div><h3>Daily summary</h3><span class="sub">Payments taken at the desk on ${dayName(TODAY)} ${fmtDate(TODAY)}</span></div></div>
      <div class="rows" id="sumRows">${rows.map(l => `<div class="row"><div class="grow"><div class="t">${esc(l.name)}</div><div class="d">${esc(l.item)} · ${esc(l.inv)}</div></div><b class="num">${money(l.amt)}</b></div>`).join('') || '<p style="color:var(--muted)">No desk payments yet today.</p>'}</div>
      <div class="kv"><div><span>Payments at the desk</span><span id="sumCount">${rows.length}</span></div><div><span>Total</span><span id="sumTotal">${money(total)}</span></div></div>
      ${lk ? `<div class="note"><svg class="ic"><use href="#i-lock"/></svg><span><b>Submitted and locked</b> by ${esc(lk.by)} at ${new Date(lk.at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}. Total ${money(lk.total)}.</span></div>` : ''}
      <div class="acts-inline" style="margin-top:14px"><button class="sbtn dark" id="sumLock"${lk || !rows.length ? ' disabled' : ''}>${icon('lock')}${lk ? 'Locked' : 'Submit and lock'}</button><button class="sbtn" id="sumPdf">${icon('download')}Download PDF</button></div>`;
  } else if (t === 'ref') {
    const R = (DB.refunds || []).slice().sort((a, b) => new Date(b.at) - new Date(a.at));
    other.innerHTML = `<div class="card-h"><div><h3>Refund requests</h3><span class="sub">Policy is no refunds. A lesson returned after an early cancellation is automatic and is not a money refund.</span></div><button class="sbtn" id="refNew">Request a refund</button></div>
      <div class="rows" id="refRows">${R.map(x => `<div class="row"><span class="av">${icon('receipt')}</span><div class="grow"><div class="t">${esc(x.name)} · ${money(x.amt)}</div><div class="d">${esc(x.item)} · ${esc(x.reason)} · asked by ${esc(x.by)}, ${fmtShort(new Date(x.at))}</div></div>${x.status === 'pending' && isBA() ? `<div class="acts"><button class="sbtn dark" data-ref-ok="${esc(x.id)}" data-ba>Approve</button><button class="sbtn" data-ref-no="${esc(x.id)}" data-ba>Decline</button></div>` : pill(x.status === 'approved' ? 'ok' : x.status === 'declined' ? 'bad' : 'warn', cap1(x.status === 'pending' ? 'with a Business Admin' : x.status))}</div>`).join('') || '<p style="color:var(--muted)">No refund requests.</p>'}</div>`;
    stripBA(other);
  }
}

/* take a payment at the desk (mock Stripe checkout). pre: { no } or { id } to collect an outstanding row */
function takePayment(pre = {}) {
  const led = pre.id ? (DB.ledger || []).find(l => l.id === pre.id) : null;
  let m = led ? memberByNo(led.no) : pre.no ? memberByNo(pre.no) : null;
  const p = POL();
  const items = [{ id: 'reg', t: `Registration`, amt: p.registration, disc: true }, { id: 'dues', t: 'Annual dues', amt: p.annualDues, disc: true }]
    .concat((p.packages || []).map(k => ({ id: k.id, t: k.name, amt: k.amt, disc: true })))
    .concat([{ id: 'grading', t: 'Grading fee', amt: 0, disc: false }, { id: 'dogi', t: 'Dogi', amt: DOGI_PRICE, disc: false }]);
  const quote = () => {
    if (led) return { item: led.item, base: led.amt, pct: 0, label: '', total: led.amt };
    const it = items.find(x => x.id === $('#tp-item').value), base = it.id === 'grading' ? (GRADING_FEE[(BELTS[BELTS.findIndex(b => b.g === (m && m.g)) + 1] || {}).g] || 60) : it.amt;
    const d = it.disc && m ? discountFor(m.dob, m.nsf) : { pct: 0, label: '' };
    return { item: it.t, base, pct: d.pct, label: d.label, total: Math.round(base * (100 - d.pct)) / 100 };
  };
  const sum = () => {
    if (!m) { $('#tp-sum').innerHTML = '<p style="color:var(--muted)">Choose a student first.</p>'; $('#tp-go').disabled = true; return; }
    const q = quote();
    $('#tp-sum').innerHTML = `<div class="kv" style="margin:0"><div><span>Student</span><span>${esc(m.n)} · ${esc(m.no)}</span></div><div><span>Item</span><span>${esc(q.item)}</span></div><div><span>Price (set in Policies)</span><span id="tp-base">${money(q.base)}</span></div>${q.pct ? `<div><span>Discount</span><span id="tp-disc">${esc(q.label)}</span></div>` : ''}<div><span>Total</span><span id="tp-total">${money(q.total)}</span></div></div>`;
    $('#tp-go').disabled = false;
  };
  openModal(`<h3 id="modalTitle">${led ? 'Collect payment' : 'Take payment'}</h3><p class="sub">Charged through Stripe at the desk. Stripe is the only payment method.</p>
    ${led ? '' : `<div class="fld" style="margin-top:14px"><label for="tp-q">Student</label><input id="tp-q" type="search" placeholder="Name, member no., phone or guardian" autocomplete="off"></div><div class="rows" id="tp-list"></div>
    <div class="fld" style="margin-top:12px"><label for="tp-item">What they owe</label><select id="tp-item">${items.map(i => `<option value="${i.id}">${esc(i.t)}</option>`).join('')}</select></div>`}
    <div id="tp-sum" style="margin-top:14px"></div>
    <div class="fld" style="margin-top:14px"><label for="tp-method">Payment method</label><select id="tp-method"><option>Stripe (card at the desk)</option></select></div>
    <div class="acts"><button class="sbtn dark" id="tp-go" disabled>Charge with Stripe</button><button class="sbtn" data-close>Cancel</button></div>`);
  if (!led) {
    const draw = () => { $('#tp-list').innerHTML = findMembers($('#tp-q').value).map(memberBtn).join('') || '<p style="color:var(--muted)">No student found.</p>'; if (m) $$('#tp-list .row-btn').forEach(b => b.classList.toggle('on', b.dataset.pick === m.no)); };
    $('#tp-q').addEventListener('input', draw); draw();
    $('#tp-list').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; m = memberByNo(b.dataset.pick); $$('#tp-list .row-btn').forEach(x => x.classList.toggle('on', x === b)); sum(); });
    $('#tp-item').addEventListener('change', sum);
  }
  sum();
  $('#tp-go').addEventListener('click', () => {
    const q = quote(), btn = $('#tp-go'); btn.disabled = true; btn.textContent = 'Waiting for Stripe…';
    setTimeout(() => {
      let l;
      if (led) { led.st = 'Paid'; led.date = new Date(); led.by = 'desk'; led.method = 'Stripe'; led.inv = newInv(); l = led; }
      else { l = { id: 'L-' + String(Date.now()).slice(-6), no: m.no, name: m.n, item: q.item, amt: q.total, method: 'Stripe', date: new Date(), st: 'Paid', by: 'desk', inv: newInv() }; if (q.pct) l.note = q.label; DB.ledger.unshift(l); }
      if (/dues/i.test(l.item) && m && m.due) m.due = 0;
      save();
      openModal(`<h3 id="modalTitle">Payment received</h3><p class="sub">${esc(l.name)} · ${esc(l.item)}</p><div class="kv"><div><span>Amount</span><span>${money(l.amt)}</span></div><div><span>Method</span><span>Stripe</span></div><div><span>Invoice</span><span>${esc(l.inv)}</span></div></div><div class="acts"><button class="sbtn dark" id="tp-pdf">${icon('download')}Download receipt (PDF)</button><button class="sbtn" data-close>Done</button></div>`);
      $('#tp-pdf').addEventListener('click', () => receiptPDF(l));
      if (PAGE === 'payments') renderPayments(); else if (PAGE === 'dashboard') renderToday();
      toast('Payment recorded.');
    }, 700);
  });
}

function mistakeModal(l) {
  openModal(`<h3 id="modalTitle">Report a mistake</h3><p class="sub">${esc(l.name)} · ${esc(l.item)} · ${money(l.amt)}. A Business Admin will review it. You cannot change a payment yourself.</p><div class="fld" style="margin-top:14px"><label for="ms-why">What went wrong?</label><textarea id="ms-why" autofocus></textarea></div><div class="acts"><button class="sbtn dark" id="msGo">Send to Business Admin</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#msGo').addEventListener('click', () => {
    const why = $('#ms-why').value.trim(); if (!why) return toast('Describe the mistake first.', 'bad');
    DB.exceptions.unshift({ id: uid('X-'), kind: 'mistake', who: l.name, text: `${l.item} ${money(l.amt)} (${l.inv}): ${why}`, by: who(), at: new Date(), status: 'pending' });
    save(); closeModal(); toast('Sent to a Business Admin.');
  });
}
function voidModal(l) {
  openModal(`<h3 id="modalTitle">Void or adjust</h3><p class="sub">${esc(l.name)} · ${esc(l.item)} · ${money(l.amt)} · ${esc(l.inv)}</p>
    <div class="fld" style="margin-top:14px"><label>What to do</label><div class="seg" id="vd-seg"><input type="radio" name="vd" id="vd-void" value="void" checked><label for="vd-void">Void payment</label><input type="radio" name="vd" id="vd-adj" value="adjust"><label for="vd-adj">Adjust amount</label></div></div>
    <div class="fld" id="vd-amtbox" style="margin-top:12px" hidden><label for="vd-amt">Correct amount (S$)</label><input id="vd-amt" type="number" min="0" step="0.01" value="${l.amt}"></div>
    <div class="fld" style="margin-top:12px"><label for="vd-why">Reason</label><textarea id="vd-why"></textarea></div>
    <div class="acts"><button class="sbtn red" id="vdGo">Save</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#vd-seg').addEventListener('change', () => { $('#vd-amtbox').hidden = radio('vd') !== 'adjust'; });
  $('#vdGo').addEventListener('click', () => {
    const why = $('#vd-why').value.trim(); if (!why) return toast('A reason is needed.', 'bad');
    if (radio('vd') === 'adjust') { const a = +$('#vd-amt').value; if (!(a >= 0)) return toast('Enter the correct amount.', 'bad'); l.note = `Adjusted from ${money(l.amt)}: ${why}`; l.amt = a; }
    else { l.st = 'Voided'; l.note = `Voided: ${why}`; }
    save(); closeModal(); renderPayments(); toast('Payment updated.');
  });
}
function refundRequestModal() {
  const paid = (DB.ledger || []).filter(l => l.st === 'Paid' && isThisMonth(l.date));
  openModal(`<h3 id="modalTitle">Request a refund</h3><p class="sub">Policy is no refunds. A Business Admin decides exceptions.</p>
    <div class="fld" style="margin-top:14px"><label for="rq-pay">Payment</label><select id="rq-pay">${paid.map(l => `<option value="${esc(l.id)}">${esc(l.name)} · ${esc(l.item)} · ${money(l.amt)}</option>`).join('')}</select></div>
    <div class="fld" style="margin-top:12px"><label for="rq-why">Reason</label><textarea id="rq-why"></textarea></div>
    <div class="acts"><button class="sbtn dark" id="rqGo">Send request</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#rqGo').addEventListener('click', () => {
    const l = paid.find(x => x.id === $('#rq-pay').value), why = $('#rq-why').value.trim();
    if (!l) return toast('Choose a payment.', 'bad'); if (!why) return toast('Add a reason.', 'bad');
    DB.refunds.unshift({ id: uid('R-'), no: l.no, name: l.name, item: l.item, amt: l.amt, reason: why, by: who(), at: new Date(), status: 'pending' });
    save(); closeModal(); renderPayments(); toast('Request sent to a Business Admin.');
  });
}

/* ---------- Equipment ---------- */
function renderEquipment() {
  const E = DB.equipment || [], open = E.filter(e => e.status !== 'Handed over'), unpaid = open.filter(e => !e.paid);
  $('#eqStats').innerHTML = `<div class="stat alert"><span class="l">To collect</span><span class="v">${open.length}</span><span class="h">Orders not handed over yet</span></div><div class="stat"><span class="l">Unpaid orders</span><span class="v">${unpaid.length}</span><span class="h">Payment due before hand-over</span></div>`;
  const rank = { 'Requested': 0, 'Ready at HQ': 1, 'Handed over': 2 };
  $('#eqRows').innerHTML = E.slice().sort((a, b) => rank[a.status] - rank[b.status] || new Date(b.at) - new Date(a.at)).map(e => `<tr><td><div class="who"><div><b>${esc(e.name)}</b><span class="num">${esc(e.no)}</span></div></div></td><td>${esc(e.item)}</td><td>${e.size ? esc(e.size) : '—'}</td><td>${pill(e.paid ? 'ok' : 'bad', e.paid ? 'Paid' : 'Unpaid')}</td><td>${pill(e.status === 'Handed over' ? 'navy plain' : e.status === 'Ready at HQ' ? 'ok' : 'warn', e.status)}${e.status === 'Handed over' && e.by ? `<span class="sub-note">Collected by ${esc(e.by)}</span>` : ''}</td><td>${fmtShort(new Date(e.at))}</td><td>${e.status === 'Requested' ? `<button class="sbtn" data-eq-ready="${esc(e.id)}">Mark ready at HQ</button>` : e.status === 'Ready at HQ' ? `<button class="sbtn dark" data-eq-out="${esc(e.id)}">Mark handed over</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" style="color:var(--muted)">No equipment orders.</td></tr>';
}
function handOver(e) {
  if (!e.paid) return toast('This order is still unpaid. Collect payment first.', 'bad');
  openModal(`<h3 id="modalTitle">Hand over</h3><p class="sub">${esc(e.name)} · ${esc(e.item)}${e.size ? ' · size ' + esc(e.size) : ''}</p><div class="fld" style="margin-top:14px"><label for="eq-by">Name of the person collecting</label><input id="eq-by" autocomplete="off" autofocus></div><div class="acts"><button class="sbtn dark" id="eqGo">Mark handed over</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#eqGo').addEventListener('click', () => {
    const by = $('#eq-by').value.trim(); if (!by) return toast('Enter who collected it.', 'bad');
    e.status = 'Handed over'; e.by = by; e.handedAt = new Date(); save(); closeModal(); renderEquipment(); toast('Marked as handed over.');
  });
}

/* ---------- page setup ---------- */
runPage({
  dashboard() {
    if (isBA()) { const f = $('#fdHome'), h = $('#baHome'); if (f && h) { h.appendChild(f); f.style.display = 'none'; } }   // Business Admins open this from "Today at HQ" on the Overview
    renderToday();
    $('#fdPay').addEventListener('click', () => takePayment());
    $('#fdFind').addEventListener('click', findStudentModal);
    $('#fdWalk').addEventListener('click', walkPickClass);
  },
  sessions() {
    renderRosters();
    if (!$('#clsTabs [data-tab="timetable"]')) $('#clsTabBar').remove();   // the front desk has one tab only
    else $('#clsTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#dayStrip').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) { desk.date = new Date(b.dataset.day + 'T00:00:00'); renderRosters(); } });
    $('#wkPrev').addEventListener('click', () => { desk.date = addDays(desk.date, -7); renderRosters(); });
    $('#wkNext').addEventListener('click', () => { desk.date = addDays(desk.date, 7); renderRosters(); });
    $('#dayToday').addEventListener('click', () => { desk.date = startOfDay(TODAY); renderRosters(); });
    $('#dayPick').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { desk.date = new Date(e.target.value + 'T00:00:00'); renderRosters(); } });
    $('#viewToggle').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { desk.view = b.dataset.view; renderRosters(); } });
  },
  roster() {
    renderRoster();
    $('#rosterRoot').addEventListener('click', e => {
      if (!RC) return;
      const { date, cls } = RC;
      if (e.target.closest('#rBook')) return bookModal(date, cls);
      if (e.target.closest('#rWalk')) return walkInModal(date, cls);
      if (e.target.closest('#rSubmit')) return submitAttendance();
      if (e.target.closest('#rAllPresent')) { const R = ensureRoster(date, cls); R.rows.forEach(x => { x.status = 'present'; }); save(); return renderRoster(); }
      const at = e.target.closest('[data-att]'); if (at) return setAttendance(+at.closest('tr').dataset.i, at.dataset.att);
      const cb = e.target.closest('[data-cancel]'); if (cb) return cancelBooking(+cb.dataset.cancel);
      const of = e.target.closest('[data-offer]'); if (of) return offerSpot(+of.dataset.offer);
    });
  },
  payments() {
    renderPayments();
    filterList('#paySearch', ['#payRows', '#payOther']);
    $('#payTake').addEventListener('click', () => takePayment());
    $('#payTabs').addEventListener('click', e => { const b = e.target.closest('[data-pt]'); if (b) { desk.payTab = b.dataset.pt; renderPayments(); } });
    const find = id => (DB.ledger || []).find(l => l.id === id);
    document.addEventListener('click', e => {
      const c = e.target.closest('[data-collect]'); if (c) return takePayment({ id: c.dataset.collect });
      const r = e.target.closest('[data-rcpt]'); if (r) return receiptPDF(find(r.dataset.rcpt));
      const ms = e.target.closest('[data-mistake]'); if (ms) return mistakeModal(find(ms.dataset.mistake));
      const vd = e.target.closest('[data-void]'); if (vd && isBA()) return voidModal(find(vd.dataset.void));
      if (e.target.closest('#refNew')) return refundRequestModal();
      const ok = e.target.closest('[data-ref-ok]'), no = e.target.closest('[data-ref-no]');
      if ((ok || no) && isBA()) { const x = DB.refunds.find(y => y.id === (ok || no).dataset[ok ? 'refOk' : 'refNo']); if (x) { x.status = ok ? 'approved' : 'declined'; save(); renderPayments(); toast(ok ? 'Refund approved as an exception.' : 'Refund declined.', ok ? 'ok' : 'info'); } return; }
      if (e.target.closest('#sumLock')) {
        const rows = deskToday(); DB.dailyLocks = DB.dailyLocks || {};
        if (dailyLock()) return;
        DB.dailyLocks[iso(TODAY)] = { at: new Date(), by: who(), total: rows.reduce((s, l) => s + l.amt, 0), count: rows.length };
        save(); renderPayments(); return toast('Daily summary submitted and locked.');
      }
      if (e.target.closest('#sumPdf')) {
        const rows = deskToday(), total = rows.reduce((s, l) => s + l.amt, 0);
        saveBlob(`daily-summary-${iso(TODAY)}.pdf`, makePDF([{ text: 'Aikido Shinju-Kai · HQ Dojo', size: 16, bold: true }, { text: `Daily summary, ${fmtDate(TODAY)}`, gap: 22 }, { rule: true }]
          .concat(rows.map((l, k) => ({ text: `${l.name} · ${l.item}`, value: money(l.amt), vx: 400, gap: k ? 16 : 24 })))
          .concat([{ rule: true }, { text: `Total (${plural(rows.length, 'payment')})`, value: money(total), vx: 400, bold: true }, { text: `Prepared by ${who()}`, size: 9, gap: 26 }])));
      }
    });
  },
  equipment() {
    renderEquipment();
    filterList('#eqSearch', '#eqRows');
    $('#eqRows').addEventListener('click', e => {
      const rd = e.target.closest('[data-eq-ready]'), out = e.target.closest('[data-eq-out]');
      if (rd) { const x = DB.equipment.find(y => y.id === rd.dataset.eqReady); x.status = 'Ready at HQ'; save(); renderEquipment(); toast('Marked ready at HQ.'); }
      if (out) handOver(DB.equipment.find(y => y.id === out.dataset.eqOut));
    });
  }
});
