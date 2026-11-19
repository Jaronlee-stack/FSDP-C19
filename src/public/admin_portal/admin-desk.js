'use strict';
/* AIKIDO SHINJU-KAI — admin-desk.js  (office portal, front desk: Today, Classes > Rosters, Roster, Payments, Equipment)

   Loaded after admin-shell.js and admin-data-desk.js. Every page loads its data from the API (ASK.load.desk*) and writes through it (ASK.act.desk*),
   then loads again and draws again. The server enforces every rule (who is eligible, prices, refunds, the Business-Admin-only steps); this file only shows them. */

const iso = d => isoDate(new Date(d));
const who = () => (ADMIN ? ADMIN.name : 'Admin');
const cap1 = s => s.charAt(0).toUpperCase() + s.slice(1);
const pill = (cls, t) => `<span class="pill ${cls}">${esc(t)}</span>`;
const STATE_PILL = { 'Upcoming': 'plain', 'Check-in open': 'ok', 'Attendance pending': 'warn', 'Done': 'navy plain', 'Cancelled': 'bad' };
const statePill = st => pill(STATE_PILL[st] || 'plain', st);
/* run an API call; a refusal from the server (a rule, a role) is shown as a message and the page stays as it is */
const run = async fn => { try { return await fn(); } catch (e) { ASK.errToast(e); return undefined; } };
const deskDate = ymd => ASK.d(ymd);
const rosterHref = (date, cls) => cls && cls.lessonId ? `roster.html?lesson=${encodeURIComponent(cls.lessonId)}` : `roster.html?date=${iso(date)}&time=${cls.time}`;
/* a member row from the API in the field names the list code reads */
const memberLegacy = m => ({
  userId: m.userId, n: m.name, no: m.memberNo, g: m.rank, rankId: m.rankId, dojo: m.dojoId, hrs: m.hours, st: m.status, joinedAt: m.joinedOn,
  joined: `${MON[+m.joinedOn.slice(5, 7) - 1]} ${m.joinedOn.slice(0, 4)}`, source: m.source, kind: m.kind, gender: m.gender, phone: m.phone, email: m.email,
  guardian: m.guardian || '', dob: m.dob, nsf: !!m.nsf, seen: m.seenDays, left: m.left, exp: m.expires, unl: m.unlimitedUntil, owed: m.owed, expiring: m.expiring
});
const memberBtn = m => `<button type="button" class="row row-btn" data-pick="${esc(m.no)}"><span class="av">${initials(m.n)}</span><div class="grow"><div class="t">${esc(m.n)}</div><div class="d">${esc(m.no)} · ${esc(m.g)}${m.phone ? ' · ' + esc(m.phone) : ''}</div></div></button>`;
/* a search box that asks the server (after a short pause) for matching members, and hands them to draw() */
function memberSearch(inputSel, listSel, onPick, size = 6) {
  const input = $(inputSel), list = $(listSel); let t = null, seq = 0, found = [];
  const draw = async () => {
    const n = ++seq, r = await run(() => ASK.load.deskMembers({ q: input.value.trim(), pageSize: size }));
    if (!r || n !== seq) return;
    found = r.rows.map(memberLegacy);
    list.innerHTML = found.map(memberBtn).join('') || '<p style="color:var(--muted)">No student found.</p>';
  };
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); });
  list.addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; $$('.row-btn', list).forEach(x => x.classList.toggle('on', x === b)); onPick(found.find(m => m.no === b.dataset.pick)); });
  draw();
}

const desk = { date: startOfDay(TODAY), view: 'day', payTab: 'today', today: null, week: null, pay: null };
const todayIso = () => iso(TODAY);

/* ---------- Today (front desk home) ---------- */
function classItem(s) {
  return `<div class="ag-item desk${s.kids ? ' kids' : ''}" data-class="${esc(s.lessonId)}"><div class="ag-time">${timeLabel(s.time)}<small>${esc(s.mat || 'Mat A')}</small></div><div class="ag-main"><b>${esc(s.type)}</b><span>${esc(s.instructor)} · ${s.booked}/${s.cap} booked${s.waitlist ? ` · ${s.waitlist} waitlist` : ''}</span></div><div class="ag-acts">${statePill(s.state)}<a class="sbtn dark" href="${rosterHref(deskDate(s.date), s)}">Open roster</a></div></div>`;
}
function renderToday() {
  const d = desk.today; if (!d) return;
  $('#fdDate').textContent = `${d.dojoName} · ${dayName(TODAY)} ${fmtDate(TODAY)}`;
  const card = (cls, l, v, h, page) => `<a class="stat ${cls}" href="${pageFile(page)}"><span class="l">${l}</span><span class="v">${v}</span><span class="h">${h}</span></a>`;
  $('#fdStats').innerHTML = card('', 'Sessions today', d.stats.sessionsToday, d.closure ? 'HQ is closed today' : 'HQ Dojo classes', 'sessions')
    + card('alert', 'Attendance pending', d.stats.attendancePending, 'Classes with attendance not submitted', 'sessions')
    + card('', 'Payments needing attention', d.stats.outstandingCount, `${money(d.stats.outstandingTotal)} to collect`, 'payments')
    + card('', 'Incomplete registrations', d.stats.applicationsWaiting, 'Waiting to be activated', 'applications');
  $('#fdSessions').innerHTML = d.classes.length ? d.classes.map(classItem).join('') : '<div class="ag-empty">No HQ classes today.</div>';
  if (d.closure) $('#fdSessions').insertAdjacentHTML('afterbegin', `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span>HQ is closed today${d.closure.note ? ': ' + esc(d.closure.note) : ''}. Classes are cancelled.</span></div>`);
  const w = d.waiting, first = w.accessWarnings[0];
  const row = (ic, t, desc, page, btn, extra = '') => `<div class="row"><span class="av navy">${icon(ic)}</span><div class="grow"><div class="t">${t}</div><div class="d">${desc}</div></div><${extra ? 'a class="sbtn" href="' + extra + '"' : 'button class="sbtn" data-page-link="' + page + '"'}>${btn}</${extra ? 'a' : 'button'}></div>`;
  $('#fdWaiting').innerHTML =
    (first ? row('shield', `${plural(w.accessWarningCount, 'arrival')} with an access warning`, `${esc(first.name)}: ${esc(first.text)} · ${esc(first.type)} ${timeLabel(first.time)}`, '', 'Open roster', rosterHref(TODAY, first))
      : row('shield', 'Access warnings', 'No warnings for the classes still to come today', 'sessions', 'Classes'))
    + row('card', 'Payments to collect', `${plural(d.stats.outstandingCount, 'payment')} outstanding`, 'payments', 'Collect')
    + row('box', 'Equipment to hand over', `${plural(w.equipmentToCollect, 'order')} not handed over yet`, 'equipment', 'Open')
    + row('flag', 'Follow-ups due', `${plural(w.followupsDue, 'student')} to contact today or earlier`, 'followups', 'Open')
    + row('inbox', 'Incomplete registrations', `${plural(w.applications, 'registration')} waiting`, 'applications', 'Review')
    + row('doc', 'Extension requests', `${plural(w.mcPending, 'request')} with a medical certificate or compassion extension`, 'applications', 'Review');
}
function findStudentModal() {
  openModal(`<h3 id="modalTitle">Find a student</h3><div class="fld" style="margin-top:14px"><label for="fs-q">Name, member no., phone, email or guardian</label><input id="fs-q" type="search" autocomplete="off" autofocus></div><div class="rows" id="fs-list"></div>`);
  const list = $('#fs-list'); let t = null, n = 0;
  const draw = async () => {
    const k = ++n, r = await run(() => ASK.load.deskMembers({ q: $('#fs-q').value.trim(), pageSize: 6 }));
    if (!r || k !== n) return;
    list.innerHTML = r.rows.map(memberLegacy).map(m => `<a class="row row-btn" href="member.html?no=${encodeURIComponent(m.no)}" style="text-decoration:none"><span class="av">${initials(m.n)}</span><div class="grow"><div class="t">${esc(m.n)}</div><div class="d">${esc(m.no)} · ${esc(m.g)}${m.phone ? ' · ' + esc(m.phone) : ''}</div></div>${icon('right')}</a>`).join('') || '<p style="color:var(--muted)">No student found.</p>';
  };
  $('#fs-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); }); draw();
}
function walkPickClass() {
  const list = (desk.today ? desk.today.classes : []).filter(c => ['Upcoming', 'Check-in open'].includes(c.state));
  if (!list.length) return toast('No class left today to add a guest to.', 'info');
  openModal(`<h3 id="modalTitle">Walk-in guest</h3><p class="sub">Which class is the guest joining?</p><div class="rows" style="margin-top:12px">${list.map(c => `<button type="button" class="row row-btn" data-wcls="${esc(c.lessonId)}"><span class="av navy">${icon('cal')}</span><div class="grow"><div class="t">${esc(c.type)} · ${timeLabel(c.time)}</div><div class="d">${esc(c.instructor)}</div></div></button>`).join('')}</div>`);
  $('#modalBody').onclick = e => { const b = e.target.closest('[data-wcls]'); if (b) walkInModal(desk.today.classes.find(c => c.lessonId === b.dataset.wcls), () => { loadToday(); }); };
}
async function loadToday() { const d = await run(() => ASK.load.deskToday()); if (d) { desk.today = d; renderToday(); } }

/* ---------- Classes > Rosters ---------- */
const weekOf = d => iso(mondayOf(d));
const classesOn = date => ((desk.week && desk.week.sessions) || []).filter(s => s.date === iso(date));
const closureNote = date => { const c = ((desk.week && desk.week.closures) || []).find(x => x.from <= iso(date) && iso(date) <= x.to); return c || null; };
function renderRosters() {
  if (!desk.week) return;
  const d = desk.date, mon = mondayOf(d);
  $('#dayStrip').innerHTML = [0, 1, 2, 3, 4, 5, 6].map(k => { const x = addDays(mon, k), n = classesOn(x).filter(s => s.state !== 'Cancelled').length; return `<button class="ag-day${iso(x) === iso(d) ? ' on' : ''}${iso(x) === todayIso() ? ' today' : ''}" data-day="${iso(x)}" aria-label="${dayName(x)} ${fmtDate(x)}">${DAY[x.getDay()]}<b>${x.getDate()}</b>${n ? '<i></i>' : ''}</button>`; }).join('');
  $('#dayPick').value = iso(d);
  $$('#viewToggle button').forEach(b => b.classList.toggle('on', b.dataset.view === desk.view));
  $('#dayBody').hidden = desk.view !== 'day'; $('#weekBody').hidden = desk.view !== 'week';
  const cl = closureNote(d);
  $('#dayHead').textContent = `${dayName(d)} ${fmtDate(d)}${iso(d) === todayIso() ? ' · Today' : ''}`;
  $('#dayNote').innerHTML = cl ? `<div class="note warn" style="margin-bottom:10px"><svg class="ic"><use href="#i-info"/></svg><span><b>HQ is closed.</b> ${esc(cl.note || '')} Every class on this day is cancelled.</span></div>` : '';
  const list = classesOn(d);
  $('#dayList').innerHTML = list.length ? list.map(classItem).join('') : '<div class="ag-empty">No HQ classes on this day.</div>';
  const rows = desk.week.sessions.map(c => `<tr><td><b>${dayName(deskDate(c.date))}</b> ${fmtShort(deskDate(c.date))}</td><td>${timeLabel(c.time)}</td><td><b>${esc(c.type)}</b></td><td>${esc(c.instructor)}</td><td class="num">${c.booked}/${c.cap}</td><td class="num">${Math.max(0, c.cap - c.booked)}</td><td>${statePill(c.state)}</td><td><a class="sbtn" href="${rosterHref(deskDate(c.date), c)}">Open roster</a></td></tr>`);
  $('#wkRows').innerHTML = rows.join('') || '<tr><td colspan="8" style="color:var(--muted)">No HQ classes this week.</td></tr>';
}
async function loadWeek() {
  const mon = mondayOf(desk.date), r = await run(() => ASK.load.deskClasses(iso(mon), iso(addDays(mon, 6))));
  if (r) { desk.week = r; renderRosters(); }
}
async function goDay(date) { desk.date = startOfDay(date); if (!desk.week || desk.week.from !== weekOf(desk.date)) await loadWeek(); else renderRosters(); }
function setTab(tab) {
  $$('#clsTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  $('#tabRosters').style.display = tab === 'rosters' ? 'grid' : 'none';
  const t = $('#tabTimetable'); if (t) { t.hidden = tab !== 'timetable'; t.style.display = tab === 'timetable' ? 'grid' : 'none'; }
  const c = $('#tabClosures'); if (c) { c.hidden = tab !== 'closures'; c.style.display = tab === 'closures' ? 'grid' : 'none'; }
}

/* ---------- Roster page ---------- */
let RC = null;   // { data: GET /admin/rosters/:id, marks: { userId: 'present' | 'noshow' } }  marks are only what the desk has ticked so far, before Submit
const effStatus = x => x.status !== 'booked' ? x.status : (RC.marks[x.userId] || 'booked');
const roundOver = () => { const s = RC.data.session; return !!RC.data.submitted || s.state === 'Cancelled' || s.state === 'Done'; };
async function loadRoster(keepMarks = true) {
  const q = new URLSearchParams(location.search);
  let id = q.get('lesson');
  if (!id && q.get('date') && q.get('time')) {   // an older link: day and start time
    const r = await run(() => ASK.load.deskClasses(q.get('date'), q.get('date')));
    const s = r && r.sessions.find(x => x.time === q.get('time')); id = s && s.lessonId;
  }
  const root = $('#rosterRoot');
  if (!id) { root.innerHTML = '<div class="card"><h3>Class not found</h3><p style="margin:8px 0 14px;color:var(--muted)">This link does not match an HQ class.</p><a class="sbtn dark" href="sessions.html">Back to Classes</a></div>'; return; }
  let data;
  try { data = await ASK.load.deskRoster(id); } catch (e) {
    root.innerHTML = `<div class="card"><h3>Class not found</h3><p style="margin:8px 0 14px;color:var(--muted)">${esc(e.message)}</p><a class="sbtn dark" href="sessions.html">Back to Classes</a></div>`; return;
  }
  RC = { data, marks: keepMarks && RC && RC.data.session.lessonId === id ? RC.marks : {} };
  renderRoster();
}
function renderRoster() {
  const root = $('#rosterRoot'), r = RC.data, s = r.session, date = deskDate(s.date), st = s.state, over = roundOver(), locked = !!r.submitted, closed = st === 'Cancelled';
  const eff = r.rows.map(effStatus);
  const present = eff.filter(x => x === 'present').length;
  document.title = `${s.type} roster · Admin · Aikido Shinju-Kai`;
  const rows = r.rows.map((x, i) => {
    const cur = eff[i], isNew = x.status === 'booked';
    return `<tr data-uid="${esc(x.userId)}"><td><div class="who"><span class="av">${initials(x.name)}</span><div><b>${esc(x.name)}</b><span class="num">${x.guest ? 'Guest' : esc(x.memberNo || '')}</span></div></div></td>
      <td>${x.rank ? `<span class="belt" style="--belt:${beltOf(x.rank)}"><i></i>${esc(x.rank)}</span>` : '—'}</td>
      <td>${pill(x.access.s, x.access.t)}</td>
      <td>${esc(x.how)}${x.override ? `<span class="sub-note">Override: ${esc(x.override)}</span>` : ''}</td>
      <td><div class="acts-inline"><button class="mark${cur === 'present' ? ' on' : ''}" data-att="present" aria-pressed="${cur === 'present'}">${icon('check')}Present</button><button class="mark${cur === 'noshow' ? ' on' : ''}" data-att="noshow" aria-pressed="${cur === 'noshow'}">No-show</button></div></td>
      <td>${over || x.guest || !isNew ? '' : `<button class="sbtn ghost" data-cancel="${esc(x.userId)}" aria-label="Cancel booking for ${esc(x.name)}">${icon('trash')}</button>`}</td></tr>`;
  }).join('') || '<tr><td colspan="6" style="color:var(--muted)">Nobody is booked yet.</td></tr>';
  root.innerHTML = `<div class="page-h"><div><h1>${esc(s.type)} · ${timeLabel(s.time)}</h1><p>${dayName(date)} ${fmtDate(date)} · ${timeLabel(s.time)} to ${timeLabel(s.end)} · ${esc(s.instructor)} · ${esc(s.mat || 'Mat A')} · Who can join: ${esc(s.rule)}</p></div>
      <div class="acts wrap">${statePill(st)}<button class="sbtn" id="rWalk"${over ? ' disabled' : ''}>${icon('user')}Add walk-in</button><button class="sbtn" id="rBook"${over ? ' disabled' : ''}>${icon('plus')}Book student</button><button class="sbtn dark" id="rSubmit"${over ? ' disabled' : ''}>${icon('check')}Submit attendance</button></div></div>
    ${closed ? `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span><b>${s.closure ? 'HQ is closed on this date.' : 'This class is cancelled.'}</b> Attendance and bookings are closed.</span></div>` : ''}
    <div class="g4"><div class="stat"><span class="l">Booked</span><span class="v">${r.counts.booked}/${s.cap}</span><span class="h">${Math.max(0, s.cap - r.counts.booked)} spaces left</span></div>
      <div class="stat"><span class="l">Checked in</span><span class="v">${present}</span><span class="h">Marked present</span></div>
      <div class="stat"><span class="l">Walk-ins</span><span class="v">${r.counts.walkins}</span><span class="h">Guests with a pass</span></div>
      <div class="stat"><span class="l">Waitlist</span><span class="v">${r.counts.wait}</span><span class="h">In order</span></div></div>
    <div class="list-bar"><div class="acts-inline"><button class="sbtn" id="rAllPresent"${over ? ' disabled' : ''}>Mark everyone present</button></div></div>
    <div class="tbl-wrap"><table class="tbl" id="rTbl"><thead><tr><th>Student</th><th>Belt</th><th>Access check</th><th>How booked</th><th>Attendance</th><th></th></tr></thead><tbody id="rRows">${rows}</tbody></table></div>
    ${r.waitlist.length ? `<div class="card"><div class="card-h"><h3>Waitlist</h3><span class="sub">First in line is offered a spot first</span></div><div class="rows">${r.waitlist.map((w, i) => `<div class="row"><span class="av">${i + 1}</span><div class="grow"><div class="t">${esc(w.name)}</div><div class="d">${esc(w.memberNo || '')}</div></div><button class="sbtn dark" data-offer="${esc(w.userId)}"${over ? ' disabled' : ''}>Offer spot</button></div>`).join('')}</div></div>` : ''}
    <div class="note"><svg class="ic"><use href="#i-info"/></svg><span>A no-show uses the lesson, unless the student sends an approved medical certificate (MC). MC requests are reviewed under Registrations.${locked ? ' <b>Attendance was submitted.</b> To change a mark, select it and give a reason.' : ''}</span></div>
    ${r.corrections.length ? `<div class="card"><div class="card-h"><h3>Corrections</h3></div><div class="rows">${r.corrections.map(k => `<div class="row"><div class="grow"><div class="t">${esc(k.name)}</div><div class="d">${esc(k.text)}</div></div></div>`).join('')}</div></div>` : ''}`;
}
function setAttendance(userId, st) {
  const x = RC.data.rows.find(r => r.userId === userId); if (!x || RC.data.session.state === 'Cancelled') return;
  const next = (x.status !== 'booked' ? x.status : RC.marks[userId]) === st ? 'booked' : st;
  if (RC.data.submitted) {
    if (x.status === next || next === 'booked') return;
    openModal(`<h3 id="modalTitle">Correct attendance</h3><p class="sub">${esc(x.name)}: ${esc(x.status)} to ${esc(next)}. This class has already been submitted, so a reason is needed.</p><div class="fld" style="margin-top:16px"><label for="cor-why">Reason</label><textarea id="cor-why" autofocus></textarea></div><div class="acts"><button class="sbtn dark" id="corGo">Save correction</button><button class="sbtn" data-close>Cancel</button></div>`);
    $('#corGo').addEventListener('click', async () => {
      const why = $('#cor-why').value.trim(); if (!why) return toast('Add a reason for the correction.', 'bad');
      if (await run(() => ASK.act.deskAttendance(RC.data.session.lessonId, userId, { status: next === 'present' ? 'Attended' : 'No-Show', reason: why }))) { closeModal(); await loadRoster(); toast('Correction saved.'); }
    });
    return;
  }
  if (x.status === 'present') return toast('This student is already counted as present.', 'info');
  if (next === 'booked') delete RC.marks[userId]; else RC.marks[userId] = next;
  renderRoster();
}
async function submitAttendance() {
  const r = RC.data;
  if (!r.rows.length) return toast('Nobody is booked for this class.', 'bad');
  const eff = r.rows.map(effStatus);
  if (eff.some(x => x === 'booked')) return toast('Mark every student present or no-show first.', 'bad');
  const rows = r.rows.map((x, i) => ({ userId: x.userId, status: eff[i] === 'present' ? 'Attended' : 'No-Show' }));
  const out = await run(() => ASK.act.deskSubmit(r.session.lessonId, rows));
  if (out) { RC.marks = {}; await loadRoster(false); toast(`Attendance submitted · ${out.present} present`); }
}
function cancelBooking(userId) {
  const r = RC.data, s = r.session, row = r.rows.find(x => x.userId === userId); if (!row) return;
  const rules = (ASK.ref && ASK.ref.policies && ASK.ref.policies.booking) || { cancelHours: 4 };
  const start = new Date(`${s.date}T${s.time}:00`), hrs = (start - NOW()) / 36e5, refund = hrs >= rules.cancelHours;   // a hint only: the server decides whether the lesson goes back
  openModal(`<h3 id="modalTitle">Cancel ${esc(row.name)}'s booking?</h3><p class="sub">${esc(s.type)} · ${dayName(deskDate(s.date))} ${fmtShort(deskDate(s.date))} · ${timeLabel(s.time)}</p><div class="note${refund ? '' : ' warn'}" style="margin-top:16px"><svg class="ic"><use href="#i-info"/></svg><span>${refund ? `This is at least ${rules.cancelHours} hours before the class, so the lesson goes back to the student's package.` : `The class starts in under ${rules.cancelHours} hours, so the lesson is not returned.`}</span></div><div class="acts"><button class="sbtn red" id="cbGo">Cancel booking</button><button class="sbtn" data-close>Keep it</button></div>`);
  $('#cbGo').addEventListener('click', async () => {
    const out = await run(() => ASK.act.deskCancelBooking(s.lessonId, userId, {}));
    if (out) { closeModal(); delete RC.marks[userId]; await loadRoster(); toast(out.refunded ? 'Booking cancelled. Lesson returned.' : 'Booking cancelled. Lesson not returned.', out.refunded ? 'ok' : 'info'); }
  });
}

/* book a student: the server checks every rule. If it refuses, the front desk can refer the request to a Business Admin; a Business Admin can override with a reason. */
function bookModal(session) {
  const s = session || RC.data.session;
  openModal(`<h3 id="modalTitle">Book a student</h3><p class="sub">${esc(s.type)} · ${dayName(deskDate(s.date))} ${fmtShort(deskDate(s.date))} · ${timeLabel(s.time)}. Desk bookings are taken until the class starts.</p>
    <div class="fld" style="margin-top:14px"><label for="bk-q">Find student</label><input id="bk-q" type="search" placeholder="Name, member no., phone or guardian" autocomplete="off" autofocus></div>
    <div class="rows" id="bk-list"></div><div id="bk-box" style="margin-top:14px"></div>`);
  const after = async msg => { closeModal(); if (PAGE === 'roster') await loadRoster(); else await loadToday(); toast(msg); };
  memberSearch('#bk-q', '#bk-list', m => {
    const head = `<div class="kv" style="margin:0 0 12px;border-top:1px solid var(--line)"><div><span>Student</span><span>${esc(m.n)} · ${esc(m.no)}</span></div><div><span>Belt</span><span>${esc(m.g)}</span></div></div>`;
    $('#bk-box').innerHTML = head + `<div class="acts" style="margin-top:0"><button class="sbtn dark" id="bk-do">Book</button><button class="sbtn" data-close>Cancel</button></div>`;
    const bookIt = async (extra, msg) => {
      try { await ASK.act.deskBook(s.lessonId, { memberNo: m.no, ...extra }); await after(msg); }
      catch (e) { refuse(e); }
    };
    /* a refusal from the server: show why, and what this person may do about it */
    const refuse = e => {
      const full = e.code === 'CLASS_FULL', soft = ['NOT_ELIGIBLE', 'NO_CREDIT', 'CLASS_FULL'].includes(e.code);
      if (!soft) { ASK.errToast(e); return; }
      $('#bk-box').innerHTML = head + `<div class="note warn" style="margin-bottom:12px"><svg class="ic"><use href="#i-info"/></svg><span>${esc(e.message)}</span></div>
        <div class="fld"><label for="bk-why">Reason</label><textarea id="bk-why" placeholder="Why does this student need a place?"></textarea></div>
        <div class="acts" style="margin-top:12px">${full ? '<button class="sbtn dark" id="bk-wait">Add to waitlist</button>' : ''}${isBA() ? '<button class="sbtn red" id="bk-over" data-ba>Override with reason</button>' : '<button class="sbtn dark" id="bk-refer">Refer to Business Admin</button>'}<button class="sbtn" data-close>Cancel</button></div>`;
      stripBA($('#bk-box'));
      const wl = $('#bk-wait'); if (wl) wl.addEventListener('click', async () => { if (await run(() => ASK.act.deskWaitlistAdd(s.lessonId, m.no))) after(`${m.n} added to the waitlist.`); });
      const rf = $('#bk-refer'); if (rf) rf.addEventListener('click', async () => {
        const why = $('#bk-why').value.trim(); if (!why) return toast('Add a reason first.', 'bad');
        if (await run(() => ASK.act.deskException({ kind: 'access', memberNo: m.no, subjectName: m.n, detail: `Asked to join ${s.type} on ${fmtShort(deskDate(s.date))} (${e.message}). ${why}` }))) after('Sent to a Business Admin to decide.');
      });
      const ov = $('#bk-over'); if (ov) ov.addEventListener('click', () => {
        const why = $('#bk-why').value.trim(); if (!why) return toast('An override needs a reason.', 'bad');
        bookIt({ override: true, reason: why }, `${m.n} booked with an override.`);
      });
    };
    $('#bk-do').addEventListener('click', () => bookIt({}, `${m.n} booked. Lesson used.`));
  });
}

/* walk-in guests: a trial, day, week or month pass lets a guest in; the server checks the pass and the class */
const passLabel = g => ({ trial: 'Free trial', single: 'Single class', day: 'Day pass', week: 'Week pass', month: 'Month pass', private: 'Private lesson' }[g.pass] || g.pass);
const validPass = (g, ymd) => ['trial', 'single'].includes(g.pass) ? !g.used : ['day', 'week', 'month'].includes(g.pass) && !!g.until && iso(g.until) >= ymd;
async function walkInModal(session, done) {
  const s = session || RC.data.session;
  if (['Cancelled', 'Done'].includes(s.state)) return toast('This class is not open for walk-ins.', 'bad');
  await run(() => ASK.load.deskGuests());
  const onRoster = new Set(PAGE === 'roster' && RC ? RC.data.rows.filter(r => r.guest).map(r => r.userId) : []);
  const guests = DB.guests.filter(g => validPass(g, s.date) && !onRoster.has(g.id));
  openModal(`<h3 id="modalTitle">Add a walk-in guest</h3><p class="sub">${esc(s.type)} · ${timeLabel(s.time)}. Only guests with a trial, day or week pass can walk in. Members must book.</p>
    <div class="rows" id="wk-list" style="margin-top:10px">${guests.map(g => `<div class="row"><span class="av">${initials(g.name)}</span><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${passLabel(g)} · ${esc(g.mobile || '')}</div></div><button class="sbtn dark" data-wk="${esc(g.id)}">Add</button></div>`).join('') || '<p style="color:var(--muted)">No guest has a valid pass for this date.</p>'}</div>
    <h4 style="margin:18px 0 10px">New guest on a free trial</h4>
    <div class="grid2"><div class="fld"><label for="wk-n">Name</label><input id="wk-n" autocomplete="off"></div><div class="fld"><label for="wk-m">Mobile</label><input id="wk-m" inputmode="tel" autocomplete="off"></div><div class="fld full"><label for="wk-e">Email<span class="opt">Optional</span></label><input id="wk-e" type="email" autocomplete="off"></div></div>
    <div id="wk-warn" style="margin-top:12px"></div>
    <div class="acts"><button class="sbtn dark" id="wk-new">Add as trial guest</button><button class="sbtn" data-close>Close</button></div>`);
  const added = async name => { closeModal(); if (done) await done(); else await loadRoster(); toast(`${name} added as a walk-in.`); };
  const warn = e => { if (e.code === 'NO_VALID_PASS') $('#wk-warn').innerHTML = `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span>${esc(e.message)}</span></div>`; else ASK.errToast(e); };
  $('#wk-list').addEventListener('click', async e => {
    const b = e.target.closest('[data-wk]'); if (!b) return;
    try { await ASK.act.deskWalkIn(s.lessonId, { guestId: b.dataset.wk }); await added(DB.guests.find(g => g.id === b.dataset.wk).name); } catch (er) { warn(er); }
  });
  $('#wk-new').addEventListener('click', async () => {
    const name = $('#wk-n').value.trim(), mob = $('#wk-m').value.trim(), mail = $('#wk-e').value.trim();
    if (!name || mob.replace(/\D/g, '').length < 8) return toast('Add a name and a mobile number.', 'bad');
    try { await ASK.act.deskWalkIn(s.lessonId, { guest: { name, mobile: mob, ...(mail ? { email: mail } : {}) } }); await added(name); } catch (er) { warn(er); }
  });
}
async function offerSpot(userId) {
  const r = RC.data, w = r.waitlist.find(x => x.userId === userId); if (!w) return;
  if (await run(() => ASK.act.deskWaitlistOffer(r.session.lessonId, userId))) { await loadRoster(); toast(`Spot offered to ${w.name}. They have been notified.`); }
}

/* ---------- Payments ---------- */
const stPill = st => pill(st === 'Paid' ? 'ok' : st === 'Processing' ? 'warn' : st === 'Voided' || st === 'Refunded' ? 'plain' : 'bad', st);
const LEDGER = () => (desk.pay ? DB.ledger : []);
const ledgerAll = () => LEDGER().slice();
const isThisMonth_ = l => !!l.day && l.day.slice(0, 7) === todayIso().slice(0, 7);
const dayLock = () => (desk.pay && desk.pay.summary.lock) || null;
function receiptPDF(l) {
  saveBlob(`receipt-${l.inv}.pdf`, makePDF([
    { text: 'Aikido Shinju-Kai', size: 18, bold: true }, { text: 'Payment receipt · HQ Dojo', gap: 22 }, { rule: true },
    { text: 'Invoice', value: l.inv, gap: 26 }, { text: 'Date', value: fmtDate(new Date(l.date)) }, { text: 'Member', value: `${l.name} (${l.no})` },
    { text: 'Item', value: l.item }, { text: 'Amount', value: money(l.amt), bold: true }, { text: 'Method', value: 'Stripe' }, { text: 'Status', value: l.st },
    { rule: true }, { text: `Taken by ${who()}`, size: 9 }]));
}
function payStats() {
  const s = desk.pay.stats;
  $('#payHead').textContent = `Stripe · ${MONTHS_FULL[TODAY.getMonth()]} ${TODAY.getFullYear()}`;
  $('#payStats').innerHTML = `<div class="stat dark"><span class="l">Collected today</span><span class="v">${money(s.collectedToday)}</span><span class="h">Paid through Stripe</span></div>
    <div class="stat alert"><span class="l">Outstanding</span><span class="v">${money(s.outstandingTotal)}</span><span class="h">Booking locked until paid</span></div>
    <div class="stat"><span class="l">Processing</span><span class="v">${s.processingCount}</span><span class="h">Pending on Stripe</span></div>`;
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
  if (!desk.pay) return;
  payStats(); payTabs();
  const t = desk.payTab, table = $('#payTblWrap'), other = $('#payOther');
  const isTable = ['today', 'month', 'out', 'fail'].includes(t);
  table.hidden = !isTable; other.hidden = isTable;
  if (isTable) {
    const list = ledgerAll().filter(l => t === 'today' ? l.day === todayIso() : t === 'month' ? isThisMonth_(l) : t === 'out' ? l.st === 'Outstanding' : l.st === 'Failed');
    const empty = { today: 'No payments today yet.', month: 'No payments this month.', out: 'Nothing outstanding.', fail: 'No failed payments.' }[t];
    $('#payRows').innerHTML = list.map(l => `<tr><td><div class="who"><div><b>${esc(l.name)}</b><span class="num">${esc(l.no)}</span></div></div></td><td>${esc(l.item)}${l.note ? `<span class="sub-note">${esc(l.note)}</span>` : ''}</td><td>${fmtShort(deskDate(l.day))}</td><td class="num">${money(l.amt)}</td><td>${stPill(l.st)}</td><td>${rowActions(l)}</td></tr>`).join('') || `<tr><td colspan="6" style="color:var(--muted)">${empty}</td></tr>`;
    stripBA($('#payRows'));
  } else if (t === 'sum') {
    const sm = desk.pay.summary, rows = sm.rows, lk = sm.lock;
    other.innerHTML = `<div class="card-h"><div><h3>Daily summary</h3><span class="sub">Payments taken at the desk on ${dayName(TODAY)} ${fmtDate(TODAY)}</span></div></div>
      <div class="rows" id="sumRows">${rows.map(l => `<div class="row"><div class="grow"><div class="t">${esc(l.name)}</div><div class="d">${esc(l.item)} · ${esc(l.invoice)}</div></div><b class="num">${money(l.amount)}</b></div>`).join('') || '<p style="color:var(--muted)">No desk payments yet today.</p>'}</div>
      <div class="kv"><div><span>Payments at the desk</span><span id="sumCount">${sm.count}</span></div><div><span>Total</span><span id="sumTotal">${money(sm.total)}</span></div></div>
      ${lk ? `<div class="note"><svg class="ic"><use href="#i-lock"/></svg><span><b>Submitted and locked</b> by ${esc(lk.name || lk.by)} at ${new Date(lk.at).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}. Total ${money(lk.total)}.</span></div>` : ''}
      <div class="acts-inline" style="margin-top:14px"><button class="sbtn dark" id="sumLock"${lk || !sm.count ? ' disabled' : ''}>${icon('lock')}${lk ? 'Locked' : 'Submit and lock'}</button><button class="sbtn" id="sumPdf">${icon('download')}Download PDF</button></div>`;
  } else if (t === 'ref') {
    const R = DB.refunds.slice();
    other.innerHTML = `<div class="card-h"><div><h3>Refund requests</h3><span class="sub">Policy is no refunds. A lesson returned after an early cancellation is automatic and is not a money refund.</span></div><button class="sbtn" id="refNew">Request a refund</button></div>
      <div class="rows" id="refRows">${R.map(x => `<div class="row"><span class="av">${icon('receipt')}</span><div class="grow"><div class="t">${esc(x.name)} · ${money(x.amt)}</div><div class="d">${esc(x.item)} · ${esc(x.reason)} · asked by ${esc(x.by)}, ${fmtShort(x.at)}</div></div>${x.status === 'pending' && isBA() ? `<div class="acts"><button class="sbtn dark" data-ref-ok="${esc(x.id)}" data-ba>Approve</button><button class="sbtn" data-ref-no="${esc(x.id)}" data-ba>Decline</button></div>` : pill(x.status === 'approved' ? 'ok' : x.status === 'declined' ? 'bad' : 'warn', cap1(x.status === 'pending' ? 'with a Business Admin' : x.status))}</div>`).join('') || '<p style="color:var(--muted)">No refund requests.</p>'}</div>`;
    stripBA(other);
  }
}
async function loadPayments() { const r = await run(() => ASK.load.deskPayments({})); if (r) { desk.pay = r; renderPayments(); } return r; }
const refreshPage = async () => { if (PAGE === 'payments') await loadPayments(); else if (PAGE === 'dashboard') await loadToday(); else if (PAGE === 'member' && typeof memberReload === 'function') await memberReload(); };

/* take a payment at the desk (mock Stripe checkout). pre: { member } (a member row) or { id } to collect an outstanding row. The server works out the price. */
const DOGI_TYPES = [['Cotton (Standard)', 30], ['Heavyweight Cotton', 45], ['Competition Grade', 60]];
function takePayment(pre = {}) {
  const led = pre.id ? DB.ledger.find(l => l.id === pre.id) : null;
  let m = pre.member || null;
  const policy = () => (ASK.ref && ASK.ref.policies) || {};
  const itemsFor = mem => {
    const p = policy(), pk = mem && mem.kind === 'child' ? PKG.kids : PKG.adult;
    return [{ id: 'reg', t: 'Registration', amt: p.registration, disc: true }, { id: 'dues', t: 'Annual dues', amt: p.annualDues, disc: true }]
      .concat(pk.map(k => ({ id: 'pkg:' + k.id, t: k.name, amt: k.amt, disc: true })))
      .concat([{ id: 'grading', t: 'Grading fee', amt: 0, disc: false }]).concat(DOGI_TYPES.map(([n, a]) => ({ id: 'dogi:' + n, t: `Dogi · ${n}`, amt: a, disc: false })));
  };
  /* what the page expects to charge. It is a preview: the receipt shows what the server charged. */
  const quote = () => {
    if (led) return { item: led.item, base: led.amt, pct: 0, label: '', total: led.amt };
    const it = itemsFor(m).find(x => x.id === $('#tp-item').value);
    const base = it.id === 'grading' ? (GRADING_FEE[(BELTS[BELTS.findIndex(b => b.g === (m && m.g)) + 1] || {}).g] || 0) : it.amt;
    const d = it.disc && m && m.dob ? discountFor(new Date(m.dob + 'T00:00:00'), m.nsf) : { pct: 0, label: '' };
    return { item: it.t, base, pct: d.pct, label: d.label, total: Math.round(base * (100 - d.pct)) / 100 };
  };
  const sum = () => {
    if (!m && !led) { $('#tp-sum').innerHTML = '<p style="color:var(--muted)">Choose a student first.</p>'; $('#tp-go').disabled = true; return; }
    const q = quote(), who_ = led ? `${led.name} · ${led.no}` : `${m.n} · ${m.no}`;
    $('#tp-sum').innerHTML = `<div class="kv" style="margin:0"><div><span>Student</span><span>${esc(who_)}</span></div><div><span>Item</span><span>${esc(q.item)}</span></div><div><span>Price (set in Policies)</span><span id="tp-base">${money(q.base)}</span></div>${q.pct ? `<div><span>Discount</span><span id="tp-disc">${esc(q.label)}</span></div>` : ''}<div><span>Total</span><span id="tp-total">${money(q.total)}</span></div></div>`;
    $('#tp-go').disabled = false;
  };
  openModal(`<h3 id="modalTitle">${led ? 'Collect payment' : 'Take payment'}</h3><p class="sub">Charged through Stripe at the desk. Stripe is the only payment method.</p>
    ${led ? '' : `<div class="fld" style="margin-top:14px"><label for="tp-q">Student</label><input id="tp-q" type="search" placeholder="Name, member no., phone or guardian" autocomplete="off"></div><div class="rows" id="tp-list"></div>
    <div class="fld" style="margin-top:12px"><label for="tp-item">What they owe</label><select id="tp-item"></select></div>`}
    <div id="tp-sum" style="margin-top:14px"></div>
    <div class="fld" style="margin-top:14px"><label for="tp-method">Payment method</label><select id="tp-method"><option>Stripe (card at the desk)</option></select></div>
    <div class="acts"><button class="sbtn dark" id="tp-go" disabled>Charge with Stripe</button><button class="sbtn" data-close>Cancel</button></div>`);
  const fillItems = () => { const sel = $('#tp-item'); if (!sel) return; const cur = sel.value; sel.innerHTML = itemsFor(m).map(i => `<option value="${esc(i.id)}">${esc(i.t)}</option>`).join(''); if (cur && itemsFor(m).some(i => i.id === cur)) sel.value = cur; };
  if (!led) {
    fillItems();
    memberSearch('#tp-q', '#tp-list', x => { m = x; fillItems(); sum(); });
    if (m) { $('#tp-q').value = m.n; }
    $('#tp-item').addEventListener('change', sum);
  }
  sum();
  $('#tp-go').addEventListener('click', async () => {
    const btn = $('#tp-go'); btn.disabled = true; btn.textContent = 'Waiting for Stripe…';
    let out;
    try { out = led ? await ASK.act.deskCollect(led.id) : await ASK.act.deskTakePayment(m.no, $('#tp-item').value); }
    catch (e) { btn.disabled = false; btn.textContent = 'Charge with Stripe'; ASK.errToast(e); return; }
    const l = ASK.map.ledgerRow(out.payment);
    openModal(`<h3 id="modalTitle">Payment received</h3><p class="sub">${esc(l.name)} · ${esc(l.item)}</p><div class="kv"><div><span>Amount</span><span>${money(l.amt)}</span></div><div><span>Method</span><span>Stripe</span></div><div><span>Invoice</span><span>${esc(l.inv)}</span></div></div><div class="acts"><button class="sbtn dark" id="tp-pdf">${icon('download')}Download receipt (PDF)</button><button class="sbtn" data-close>Done</button></div>`);
    $('#tp-pdf').addEventListener('click', () => receiptPDF(l));
    await refreshPage();
    toast('Payment recorded.');
  });
}

function mistakeModal(l) {
  openModal(`<h3 id="modalTitle">Report a mistake</h3><p class="sub">${esc(l.name)} · ${esc(l.item)} · ${money(l.amt)}. A Business Admin will review it. You cannot change a payment yourself.</p><div class="fld" style="margin-top:14px"><label for="ms-why">What went wrong?</label><textarea id="ms-why" autofocus></textarea></div><div class="acts"><button class="sbtn dark" id="msGo">Send to Business Admin</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#msGo').addEventListener('click', async () => {
    const why = $('#ms-why').value.trim(); if (!why) return toast('Describe the mistake first.', 'bad');
    if (await run(() => ASK.act.deskMistake(l.id, why))) { closeModal(); toast('Sent to a Business Admin.'); }
  });
}
function voidModal(l) {
  openModal(`<h3 id="modalTitle">Void or adjust</h3><p class="sub">${esc(l.name)} · ${esc(l.item)} · ${money(l.amt)} · ${esc(l.inv)}</p>
    <div class="fld" style="margin-top:14px"><label>What to do</label><div class="seg" id="vd-seg"><input type="radio" name="vd" id="vd-void" value="void" checked><label for="vd-void">Void payment</label><input type="radio" name="vd" id="vd-adj" value="adjust"><label for="vd-adj">Adjust amount</label></div></div>
    <div class="fld" id="vd-amtbox" style="margin-top:12px" hidden><label for="vd-amt">Correct amount (S$)</label><input id="vd-amt" type="number" min="0" step="0.01" value="${l.amt}"></div>
    <div class="fld" style="margin-top:12px"><label for="vd-why">Reason</label><textarea id="vd-why"></textarea></div>
    <div class="acts"><button class="sbtn red" id="vdGo">Save</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#vd-seg').addEventListener('change', () => { $('#vd-amtbox').hidden = radio('vd') !== 'adjust'; });
  $('#vdGo').addEventListener('click', async () => {
    const why = $('#vd-why').value.trim(); if (!why) return toast('A reason is needed.', 'bad');
    const body = { reason: why };
    if (radio('vd') === 'adjust') { const a = +$('#vd-amt').value; if (!(a >= 0) || $('#vd-amt').value === '') return toast('Enter the correct amount.', 'bad'); body.adjustTo = a; }
    if (await run(() => ASK.act.deskVoid(l.id, body))) { closeModal(); await refreshPage(); toast('Payment updated.'); }
  });
}
function refundRequestModal(preset) {
  const paid = DB.ledger.filter(l => l.st === 'Paid' && (!preset || l.no === preset));
  if (!paid.length) return toast('There is no paid payment to refund.', 'info');
  openModal(`<h3 id="modalTitle">Request a refund</h3><p class="sub">Policy is no refunds. A Business Admin decides exceptions.</p>
    <div class="fld" style="margin-top:14px"><label for="rq-pay">Payment</label><select id="rq-pay">${paid.map(l => `<option value="${esc(l.id)}">${esc(l.name)} · ${esc(l.item)} · ${money(l.amt)}</option>`).join('')}</select></div>
    <div class="fld" style="margin-top:12px"><label for="rq-why">Reason</label><textarea id="rq-why"></textarea></div>
    <div class="acts"><button class="sbtn dark" id="rqGo">Send request</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#rqGo').addEventListener('click', async () => {
    const id = $('#rq-pay').value, why = $('#rq-why').value.trim();
    if (!id) return toast('Choose a payment.', 'bad'); if (!why) return toast('Add a reason.', 'bad');
    if (await run(() => ASK.act.deskRefund(id, why))) { closeModal(); await refreshPage(); toast('Request sent to a Business Admin.'); }
  });
}

/* ---------- Equipment ---------- */
async function renderEquipment() {
  const E = DB.equipment, open = E.filter(e => e.status !== 'Handed over'), unpaid = open.filter(e => !e.paid);
  $('#eqStats').innerHTML = `<div class="stat alert"><span class="l">To collect</span><span class="v">${open.length}</span><span class="h">Orders not handed over yet</span></div><div class="stat"><span class="l">Unpaid orders</span><span class="v">${unpaid.length}</span><span class="h">Payment due before hand-over</span></div>`;
  $('#eqRows').innerHTML = E.map(e => `<tr><td><div class="who"><div><b>${esc(e.name)}</b><span class="num">${esc(e.no)}</span></div></div></td><td>${esc(e.item)}</td><td>${e.size ? esc(e.size) : '—'}</td><td>${pill(e.paid ? 'ok' : 'bad', e.paid ? 'Paid' : 'Unpaid')}</td><td>${pill(e.status === 'Handed over' ? 'navy plain' : e.status === 'Ready at HQ' ? 'ok' : 'warn', e.status)}${e.status === 'Handed over' && e.by ? `<span class="sub-note">Collected by ${esc(e.by)}</span>` : ''}</td><td>${fmtShort(e.at)}</td><td>${e.status === 'Requested' ? `<button class="sbtn" data-eq-ready="${esc(e.id)}">Mark ready at HQ</button>` : e.status === 'Ready at HQ' ? `<button class="sbtn dark" data-eq-out="${esc(e.id)}">Mark handed over</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" style="color:var(--muted)">No equipment orders.</td></tr>';
}
async function loadEquipment() { if (await run(() => ASK.load.deskEquipment())) renderEquipment(); }
function handOver(e) {
  if (!e.paid) return toast('This order is still unpaid. Collect payment first.', 'bad');
  openModal(`<h3 id="modalTitle">Hand over</h3><p class="sub">${esc(e.name)} · ${esc(e.item)}${e.size ? ' · size ' + esc(e.size) : ''}</p><div class="fld" style="margin-top:14px"><label for="eq-by">Name of the person collecting</label><input id="eq-by" autocomplete="off" autofocus></div><div class="acts"><button class="sbtn dark" id="eqGo">Mark handed over</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#eqGo').addEventListener('click', async () => {
    const by = $('#eq-by').value.trim(); if (!by) return toast('Enter who collected it.', 'bad');
    if (await run(() => ASK.act.deskHandOver(e.id, by))) { closeModal(); await loadEquipment(); toast('Marked as handed over.'); }
  });
}

/* ---------- page setup ---------- */
runPage({
  async dashboard() {
    if (isBA()) { const f = $('#fdHome'), h = $('#baHome'); if (f && h) { h.appendChild(f); f.style.display = 'none'; } }   // Business Admins open this from "Today at HQ" on the Overview
    $('#fdPay').addEventListener('click', () => takePayment());
    $('#fdFind').addEventListener('click', findStudentModal);
    $('#fdWalk').addEventListener('click', walkPickClass);
    await loadToday();
  },
  async sessions() {
    if (!$('#clsTabs [data-tab="timetable"]')) $('#clsTabBar').remove();   // the front desk has one tab only
    else $('#clsTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
    $('#dayStrip').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) goDay(new Date(b.dataset.day + 'T00:00:00')); });
    $('#wkPrev').addEventListener('click', () => goDay(addDays(desk.date, -7)));
    $('#wkNext').addEventListener('click', () => goDay(addDays(desk.date, 7)));
    $('#dayToday').addEventListener('click', () => goDay(startOfDay(TODAY)));
    $('#dayPick').addEventListener('change', e => { if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) goDay(new Date(e.target.value + 'T00:00:00')); });
    $('#viewToggle').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) { desk.view = b.dataset.view; renderRosters(); } });
    await loadWeek();
  },
  async roster() {
    $('#rosterRoot').addEventListener('click', e => {
      if (!RC) return;
      if (e.target.closest('#rBook')) return bookModal();
      if (e.target.closest('#rWalk')) return walkInModal();
      if (e.target.closest('#rSubmit')) return submitAttendance();
      if (e.target.closest('#rAllPresent')) { RC.data.rows.forEach(x => { if (x.status === 'booked') RC.marks[x.userId] = 'present'; }); return renderRoster(); }
      const at = e.target.closest('[data-att]'); if (at) return setAttendance(at.closest('tr').dataset.uid, at.dataset.att);
      const cb = e.target.closest('[data-cancel]'); if (cb) return cancelBooking(cb.dataset.cancel);
      const of = e.target.closest('[data-offer]'); if (of) return offerSpot(of.dataset.offer);
    });
    await loadRoster();
  },
  async payments() {
    filterList('#paySearch', ['#payRows', '#payOther']);
    $('#payTake').addEventListener('click', () => takePayment());
    $('#payTabs').addEventListener('click', e => { const b = e.target.closest('[data-pt]'); if (b) { desk.payTab = b.dataset.pt; renderPayments(); } });
    const find = id => DB.ledger.find(l => l.id === id);
    document.addEventListener('click', async e => {
      const c = e.target.closest('[data-collect]'); if (c) return takePayment({ id: c.dataset.collect });
      const r = e.target.closest('[data-rcpt]'); if (r) return receiptPDF(find(r.dataset.rcpt));
      const ms = e.target.closest('[data-mistake]'); if (ms) return mistakeModal(find(ms.dataset.mistake));
      const vd = e.target.closest('[data-void]'); if (vd && isBA()) return voidModal(find(vd.dataset.void));
      if (e.target.closest('#refNew')) return refundRequestModal();
      const ok = e.target.closest('[data-ref-ok]'), no = e.target.closest('[data-ref-no]');
      if ((ok || no) && isBA()) {
        const id = (ok || no).dataset[ok ? 'refOk' : 'refNo'];
        if (await run(() => ASK.act.deskRefundDecision(id, ok ? 'approved' : 'declined'))) { await loadPayments(); toast(ok ? 'Refund approved as an exception.' : 'Refund declined.', ok ? 'ok' : 'info'); }
        return;
      }
      if (e.target.closest('#sumLock')) {
        if (dayLock()) return;
        if (await run(() => ASK.act.deskLockDay())) { await loadPayments(); toast('Daily summary submitted and locked.'); }
        return;
      }
      if (e.target.closest('#sumPdf')) {
        const sm = desk.pay.summary;
        saveBlob(`daily-summary-${todayIso()}.pdf`, makePDF([{ text: 'Aikido Shinju-Kai · HQ Dojo', size: 16, bold: true }, { text: `Daily summary, ${fmtDate(TODAY)}`, gap: 22 }, { rule: true }]
          .concat(sm.rows.map((l, k) => ({ text: `${l.name} · ${l.item}`, value: money(l.amount), vx: 400, gap: k ? 16 : 24 })))
          .concat([{ rule: true }, { text: `Total (${plural(sm.count, 'payment')})`, value: money(sm.total), vx: 400, bold: true }, { text: `Prepared by ${who()}`, size: 9, gap: 26 }])));
      }
    });
    await loadPayments();
  },
  async equipment() {
    filterList('#eqSearch', '#eqRows');
    $('#eqRows').addEventListener('click', async e => {
      const rd = e.target.closest('[data-eq-ready]'), out = e.target.closest('[data-eq-out]');
      if (rd) { if (await run(() => ASK.act.deskEquipmentReady(rd.dataset.eqReady))) { await loadEquipment(); toast('Marked ready at HQ.'); } }
      if (out) handOver(DB.equipment.find(y => y.id === out.dataset.eqOut));
    });
    await loadEquipment();
  }
});
