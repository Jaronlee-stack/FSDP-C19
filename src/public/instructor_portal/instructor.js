'use strict';
/* AIKIDO SHINJU-KAI — instructor.js  (instructor portal pages) */

const MY_INS = 'Bob Tan Sensei';
const timeLabelExact = d => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
const inst = { sets: {}, sim: new Set() };   // sets: who is marked present per class; sim: classes whose NFC taps were already simulated

/* ---------- schedule: the instructor's day, one column for each hour that has a class ---------- */
const SCHED_ALL = CLASSES.concat(PRIVATE_CLASSES);          // group classes first, then one-to-one lessons
const SCH = { date: startOfDay(TODAY), view: 'day', sel: null, loaded: null, rf: 'all', pop: null };   // rf: roster filter; pop: the row that was just ticked   // day: 0 = Mon; sel: index into SCHED_ALL of the class whose roster is open
const STATE_LABEL = { live: 'Active now', open: 'Check-in open', later: 'Upcoming', done: 'Finished' };
const schDate = () => SCH.date;
const slotKey = (c, d) => `${isoDate(d)}|${c.time}${c.private ? '|private' : ''}`;
const classTitle = c => c.private ? `${c.type} (Private)` : c.type;
const rosterOf = c => c.private ? STUDENTS.filter(s => s.n === c.student) : STUDENTS.slice(0, c.booked);
const classHour = c => +c.time.slice(0, 2);
const classRange = c => { const h = classHour(c), e = h + 1; return `${h % 12 || 12}:00 – ${e % 12 || 12}:00 ${e < 12 ? 'AM' : 'PM'}`; };
const myClasses = d => hqClosedOn(d) ? [] : SCHED_ALL.map((c, i) => ({ c, i })).filter(({ c }) => c.ins === MY_INS && c.day === (d.getDay() + 6) % 7);
const TONES = [[/^children/i, 'kids'], [/^adults/i, 'adults'], [/^intermediate/i, 'inter'], [/^advanced/i, 'adv'], [/^mixed/i, 'mixed'], [/^ladies/i, 'ladies'], [/^weapons/i, 'weap'], [/^sg50/i, 'sg']];
const toneOf = type => 't-' + ((TONES.find(([re]) => re.test(type)) || [0, 'adults'])[1]);
const REMARKS = DB.remarks;
/* students who have applied for grading */
const goingForGrading = s => GRAD_APPS.some(a => a.n === s.n) || CANDIDATES.some(c => c.n === s.n);
const findRemark = (kind, key, student) => REMARKS.find(r => r.kind === kind && r.key === key && r.student === student);
/* one remark per class / per student per class / per student for grading; saving empty text removes it */
function upsertRemark({ kind, key, student, text, label }) {
  let r = findRemark(kind, key, student);
  if (!text) { if (r) REMARKS.splice(REMARKS.indexOf(r), 1); save(); return null; }
  if (!r) REMARKS.push(r = { kind, key, student });
  Object.assign(r, { text, label, by: MY_INS, at: new Date() });
  save(); return r;
}
/* every student sends the centre a photo. Until the backend serves it (s.photo), a plain stand-in portrait is used; two students have none, to show that state. */
const NO_PHOTO = new Set(['David Koh', 'Marcus Lim']);
function standInPhoto(name) {
  const h = [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const body = `hsl(${h} 25% 56%)`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="hsl(${h} 30% 84%)"/><circle cx="60" cy="46" r="22" fill="${body}"/><path d="M16 120c4-30 22-44 44-44s40 14 44 44z" fill="${body}"/></svg>`);
}
const photoOf = s => s.photo || (NO_PHOTO.has(s.n) ? null : standInPhoto(s.n));
const avatarHtml = (s, cls) => { const p = photoOf(s); return p ? `<span class="${cls} ph"><img src="${p}" alt="${esc(s.n)}"></span>` : `<span class="${cls}" title="No photo on file">${initials(s.n)}</span>`; };
function setRemarkState(el, has) { el.textContent = has ? 'Saved' : 'Add'; el.classList.toggle('has', has); }
/* ---------- grading panel on the timetable ----------
   Only the instructors on the panel see it. Locked until 15 minutes before the start; counts only, no names, until then. */
const GRADE_LEAD_MIN = 15;
function gradingOn(d) {
  const sh = DB.panels.find(p => p.examiners.includes(MY_INS) && isoDate(p.date) === isoDate(d));
  if (!sh) return null;
  const at = t => { const x = startOfDay(d); x.setHours(+t.slice(0, 2), +t.slice(3), 0, 0); return x; };
  const start = at(sh.from), end = at(sh.to), unlock = new Date(+start - GRADE_LEAD_MIN * 60000), now = Date.now();
  const left = CANDIDATES.filter(c => !c.done).length;
  const state = CANDIDATES.length && !left ? 'done' : now < +unlock ? 'locked' : now < +start ? 'soon' : now <= +end ? 'live' : 'late';
  const label = { locked: `Opens ${timeLabelExact(unlock)}`, soon: `Starts ${timeLabelExact(start)}`, live: 'In progress', late: 'Running late', done: 'Results sent to HQ' }[state];
  return { sh, start, end, unlock, state, label, total: CANDIDATES.length, left };
}
const gradeBlock = g => `<button type="button" class="grade-slot gs-${g.state}" data-grade="${g.state}" aria-label="Grading panel, ${esc(g.label)}">
  ${g.state === 'locked' ? '<span class="gb-lock" aria-hidden="true">' + icon('lock') + '</span>' : ''}
  <span class="sl-tag">${icon('award')}<span>${esc(g.label)}</span></span>
  <b>${esc(g.sh.label || 'Grading panel')}</b><span>${timeLabelExact(g.start)} – ${timeLabelExact(g.end)}</span><span>HQ Dojo · ${g.total} candidates</span></button>`;

/* a locked tap shakes the block and explains; an open one goes straight to the candidates */
function gradeTap(el) {
  const g = gradingOn(schDate());
  if (!g) return;
  if (g.state === 'locked') {
    if (!reduce) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); el.addEventListener('animationend', () => el.classList.remove('shake'), { once: true }); }
    openGradeSheet(g); return;
  }
  if (g.state === 'soon' || g.state === 'live' || g.state === 'late') { location.href = 'grading.html'; return; }
  openGradeSheet(g);
}
function openGradeSheet(g) {
  const others = g.sh.examiners.filter(n => n !== MY_INS);
  openModal(`<h3 id="modalTitle">${esc(g.sh.label || 'Grading panel')}</h3>
    <p class="sub">${dayName(g.start)} ${g.start.getDate()} ${MON[g.start.getMonth()]} · ${timeLabelExact(g.start)} – ${timeLabelExact(g.end)} · HQ Dojo</p>
    <div class="rows" style="margin-top:12px">
      <div class="row"><span class="av navy">${icon('award')}</span><div class="grow"><div class="t">Lead examiner</div><div class="d">${esc(g.sh.lead)}</div></div></div>
      <div class="row"><span class="av">${icon('users')}</span><div class="grow"><div class="t">Your panel</div><div class="d">${others.map(esc).join(', ') || 'Just you'}</div></div></div>
      <div class="row"><span class="av">${icon('doc')}</span><div class="grow"><div class="t">Candidates</div><div class="d">${g.total} candidates${g.state === 'locked' ? '' : `, ${g.left} still to score`}</div></div></div>
    </div>
    <p class="hint" style="margin-top:12px">${g.state === 'locked' ? `Names appear at ${timeLabelExact(g.unlock)}, ${GRADE_LEAD_MIN} minutes before the start.` : 'The lead examiner sends the results to HQ.'}</p>
    <div class="acts"><button class="sbtn" data-close>Close</button></div>`);
}

const presentSet = key => inst.sets[key] || (inst.sets[key] = new Set());

/* finished once its hour is over or the instructor has ended it; attendance opens 30 minutes before the start */
function classState(c, d) {
  if (DB.classEnded[slotKey(c, d)]) return 'done';
  const start = new Date(d); start.setHours(classHour(c), +c.time.slice(3), 0, 0);
  const now = Date.now();
  if (now >= +start + 3600000) return 'done';
  if (now >= +start) return 'live';
  return now >= +start - 1800000 ? 'open' : 'later';
}

function renderSchedule() {
  const d = schDate(), mine = myClasses(d), isToday = +d === +TODAY, mon = mondayOf(TODAY);
  $('#dayChips').innerHTML = [...Array(7)].map((_, k) => {
    const dt = addDays(mon, k), sel = +dt === +SCH.date;
    return `<button type="button" class="ag-day${+dt === +TODAY ? ' today' : ''}${sel ? ' on' : ''}" data-day="${k}" aria-pressed="${sel}"><span>${DAY[dt.getDay()]}</span><b>${dt.getDate()}</b>${myClasses(dt).length || gradingOn(dt) ? '<i></i>' : ''}</button>`;
  }).join('');

  const nowD = new Date(), nowH = nowD.getHours() + nowD.getMinutes() / 60;
  const gr = gradingOn(d);
  const hours = [...new Set([...mine.map(m => classHour(m.c)), ...(gr ? [+gr.sh.from.slice(0, 2)] : [])])].sort((x, y) => x - y);
  const grid = $('#schedGrid');
  grid.style.setProperty('--n', hours.length || 1);
  grid.innerHTML = hours.length ? hours.map(h => {
    const isNow = isToday && nowH >= h && nowH < h + 1;
    const slots = (gr && +gr.sh.from.slice(0, 2) === h ? gradeBlock(gr) : '') + mine.filter(m => classHour(m.c) === h).map(m => {
      const st = classState(m.c, d), who = m.c.private ? `With ${esc(m.c.student)}` : `HQ Dojo · ${m.c.booked} booked`;
      return `<button type="button" class="cls-slot ${toneOf(m.c.type)} ${st}${m.c.private ? ' private' : ''}${SCH.sel === m.i ? ' sel' : ''}" data-slot="${m.i}" aria-pressed="${SCH.sel === m.i}">
          <span class="sl-tag">${STATE_LABEL[st]}</span><b>${esc(classTitle(m.c))}</b><span>${classRange(m.c)}</span><span>${who}</span></button>`;
    }).join('');
    return `<div class="sh-col${isNow ? ' now' : ''}"><div class="sh-h">${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}</div><div class="sh-cell">${slots}</div>${isNow ? `<i class="sh-now" style="--f:${(nowH - h).toFixed(2)}" aria-hidden="true"></i>` : ''}</div>`;
  }).join('') : `<div class="sch-empty"><b>Nothing scheduled</b><span>You have no classes on ${dayName(d)} ${d.getDate()} ${MON[d.getMonth()]}.</span></div>`;
}

/* bring the first live or upcoming class into view, so the day opens on what matters now */
/* ---------- views: day (hour columns), week (each day listed), month (calendar) ---------- */
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const nClasses = n => n === 1 ? '1 class' : `${n} classes`;
const countRange = (from, days) => { let n = 0; for (let k = 0; k < days; k++) n += myClasses(addDays(from, k)).length; return n; };

function setHeader() {
  const v = SCH.view, d = SCH.date;
  if (v === 'day') {
    const mine = myClasses(d), g = gradingOn(d), isToday = +d === +TODAY;
    $('#dayTitle').textContent = `${isToday ? 'Today · ' : ''}${dayName(d)} ${d.getDate()} ${MON[d.getMonth()]}`;
    const parts = [mine.length ? nClasses(mine.length) : '', g ? 'grading panel' : ''].filter(Boolean).join(' and ');
    $('#daySub').textContent = parts ? `${parts[0].toUpperCase() + parts.slice(1)}. Tap a class to open its roster.` : 'A free day.';
  } else if (v === 'week') {
    const mon = mondayOf(d), sun = addDays(mon, 6);
    $('#dayTitle').textContent = `${mon.getDate()} ${MON[mon.getMonth()]} – ${sun.getDate()} ${MON[sun.getMonth()]}`;
    $('#daySub').textContent = `${nClasses(countRange(mon, 7))} this week. Tap a day to open it.`;
  } else {
    const first = new Date(d.getFullYear(), d.getMonth(), 1), days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    $('#dayTitle').textContent = `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
    $('#daySub').textContent = `${nClasses(countRange(first, days))} this month. Tap a day to open it.`;
  }
}

function renderWeek() {
  const mon = mondayOf(SCH.date);
  $('#weekList').innerHTML = [...Array(7)].map((_, k) => {
    const dt = addDays(mon, k), isToday = +dt === +TODAY, g = gradingOn(dt);
    const grading = g ? `<span class="wk-item gr"><span class="wk-time">${timeLabel(g.sh.from)}</span><span class="wk-what">${esc(g.sh.label || 'Grading panel')}</span><span class="wk-st">${esc(g.label)}</span></span>` : '';
    const classes = myClasses(dt).slice().sort((a, b) => a.c.time.localeCompare(b.c.time)).map(m => {
      const st = classState(m.c, dt);
      return `<span class="wk-item ${toneOf(m.c.type)}"><span class="wk-time">${timeLabel(m.c.time)}</span><span class="wk-what">${esc(classTitle(m.c))}</span><span class="wk-st ${st}">${STATE_LABEL[st]}</span></span>`;
    }).join('');
    return `<button type="button" class="wk-day${isToday ? ' today' : ''}" data-wkday="${+dt}"><span class="wk-head"><b>${DAY[dt.getDay()]} ${dt.getDate()}</b>${isToday ? '<em>Today</em>' : ''}</span><span class="wk-items">${grading}${classes || (g ? '' : '<span class="wk-free">Free</span>')}</span></button>`;
  }).join('');
}

function renderMonth() {
  const d = SCH.date, first = new Date(d.getFullYear(), d.getMonth(), 1), start = mondayOf(first), m = d.getMonth();
  $('#monthGrid').innerHTML = [...Array(42)].map((_, k) => {
    const dt = addDays(start, k), mine = myClasses(dt).length, g = gradingOn(dt);
    const cls = ['mc-day', dt.getMonth() !== m ? 'other' : '', +dt === +TODAY ? 'today' : '', +dt === +d ? 'sel' : ''].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}" data-mdate="${+dt}" aria-label="${DAY[dt.getDay()]} ${dt.getDate()}, ${nClasses(mine)}${g ? ', grading panel' : ''}"><b>${dt.getDate()}</b><span class="mc-dots">${mine ? '<i class="dot-c"></i>' : ''}${g ? '<i class="dot-g"></i>' : ''}</span></button>`;
  }).join('');
}

/* one place that shows the right view and keeps the switch, the header and the roster in step */
function renderAll() {
  const v = SCH.view;
  $$('#schView [data-view]').forEach(b => { const on = b.dataset.view === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  $('#dayChips').hidden = v !== 'day';
  $('#schedCard').hidden = v !== 'day';
  $('#weekCard').hidden = v !== 'week';
  $('#monthCard').hidden = v !== 'month';
  if (v === 'day') { renderSchedule(); } else { SCH.sel = null; if (v === 'week') renderWeek(); else renderMonth(); }
  renderRoster();
  setHeader();
}

/* previous / next move by the unit of the view: a day, a week or a month */
function stepDate(dir) {
  const d = SCH.date;
  if (SCH.view === 'day') SCH.date = addDays(d, dir);
  else if (SCH.view === 'week') SCH.date = addDays(d, 7 * dir);
  else { const x = new Date(d.getFullYear(), d.getMonth() + dir, 1); SCH.date = x; }
  SCH.sel = null; renderAll();
}

/* bring the first live or upcoming class into view, so the day opens on what matters now */
function scrollSchedule() {
  const box = $('#schedScroll'), target = $('#schedGrid .cls-slot.live, #schedGrid .cls-slot.open, #schedGrid .cls-slot.later') || $('#schedGrid .cls-slot');
  if (!box || !target) return;
  if (matchMedia('(max-width: 700px)').matches) {
    const top = target.getBoundingClientRect().top;
    if (top > innerHeight * 0.6) window.scrollBy({ top: top - 200, behavior: reduce ? 'auto' : 'smooth' });
  } else box.scrollLeft = Math.max(0, target.closest('.sh-col').offsetLeft - 24);
}

function renderRoster() {
  const card = $('#rosterCard'); if (!card) return;
  if (SCH.sel == null) { card.hidden = true; SCH.loaded = null; stopDictation(); return; }
  const c = SCHED_ALL[SCH.sel], d = schDate(), key = slotKey(c, d), st = classState(c, d), e = DB.classEnded[key];
  const roster = rosterOf(c), set = presentSet(key), canMark = !e && (st === 'live' || st === 'open');
  const opening = card.hidden;
  card.className = `card white ac ${toneOf(c.type)}`;
  card.hidden = false;
  if (opening && !reduce) { card.classList.add('enter'); card.addEventListener('animationend', () => card.classList.remove('enter'), { once: true }); }
  $('#rosterTitle').textContent = `${c.private ? '' : 'Roster · '}${classTitle(c)}`;
  $('#rosterWhen').textContent = `${dayName(d)} ${d.getDate()} ${MON[d.getMonth()]} · ${classRange(c)} · HQ Dojo`;
  $('#rosterSub').textContent = e
    ? `${e.present.length} present (+1 session each) · ${e.noshow.length} no-show (lesson used, not counted)`
    : st === 'done' ? 'This class has finished and its attendance was not recorded.'
    : canMark ? `${set.size} of ${roster.length} checked in`
    : 'Attendance opens 30 minutes before the class starts.';
  if (SCH.loaded !== key) {   // load this class's remarks once, so typing is never wiped by a re-render
    stopDictation();
    const cr = findRemark('class', key, c.private ? c.student : null);
    $('#classRemarkText').value = cr ? cr.text : '';
    $('#classRemarkNote').textContent = cr ? `Saved ${timeLabelExact(new Date(cr.at))}` : '';
    $('#classRemarkBox').open = false;
    setRemarkState($('#classRemarkState'), !!cr);
    SCH.loaded = key; SCH.rf = 'all';
  }
  $('#markAll').hidden = !canMark;
  $('#endClass').hidden = !canMark;
  $('#rosterLocked').hidden = !e;
  if (e) $('#rosterLocked').innerHTML = `${icon('lock')}Locked · ended ${timeLabelExact(new Date(e.at))}`;
  const isHere = (st, i) => e ? e.present.includes(st.n) : set.has(i);
  const nHere = roster.filter(isHere).length, labels = e ? ['Present', 'No-show'] : ['Here', 'Not yet'];
  $('#rosterFilter').innerHTML = [['all', 'All', roster.length], ['here', labels[0], nHere], ['not', labels[1], roster.length - nHere]]
    .map(([k, l, n]) => `<button type="button" class="fpill${SCH.rf === k ? ' on' : ''}" data-rf="${k}" aria-pressed="${SCH.rf === k}">${l}<span class="n">${n}</span></button>`).join('');
  $('#roster').innerHTML = roster.map((s, i) => ({ s, i })).filter(({ s, i }) => SCH.rf === 'all' || (SCH.rf === 'here') === isHere(s, i)).map(({ s, i }) => {
    const here = isHere(s, i), first = esc(s.n.split(' ')[0]);
    const act = e
      ? `<span class="pill ${here ? 'ok' : 'warn'}">${here ? 'Present · +1' : 'No-show'}</span>`
      : canMark ? `<button class="mark chk${here ? ' on' : ''}${SCH.pop === i ? ' pop' : ''}" data-mark="${i}" aria-pressed="${here}" aria-label="${here ? `Mark ${first} absent` : `Mark ${first} present`}">${icon('check')}</button>` : '';
    const noted = !!findRemark('student', key, s.n);
    return `<div class="row">${avatarHtml(s, 'av')}<div class="grow"><button type="button" class="t row-name" data-s="${STUDENTS.indexOf(s)}">${esc(s.n)}${noted ? '<i class="rm-dot" title="Remark added" aria-label="Remark added"></i>' : ''}</button><div class="d"><span class="belt" style="--belt:${beltOf(s.g)}"><i></i>${s.g}</span> · ${s.s} sessions${goingForGrading(s) ? ' · <span class="gfg" title="Going for grading">Grading</span>' : ''}${isDeclining(s) ? ` · <b class="away" title="Not seen in ${s.seen} days">Away ${s.seen}d</b>` : ''}</div></div><div class="acts">${act}</div></div>`;
  }).join('') || '<div class="no-match">Nobody here.</div>';
  SCH.pop = null;
  const q = $('#rosterSearch'); if (q && q.value) q.dispatchEvent(new Event('input'));
}

function openRoster(i) {
  SCH.sel = SCH.sel === i ? null : i;
  renderSchedule(); renderRoster();
  if (SCH.sel == null) return;
  const c = SCHED_ALL[i], d = schDate(), key = slotKey(c, d);
  if (classState(c, d) === 'live' || classState(c, d) === 'open') simulateTaps(key, c, d);
  $('#rosterCard').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/* demo only: a few students tap the NFC tag shortly after the roster opens */
function simulateTaps(key, c, d) {
  if (inst.sim.has(key) || DB.classEnded[key]) return;
  inst.sim.add(key);
  [0, 2, 5, 9].filter(i => i < rosterOf(c).length).forEach((i, k) => setTimeout(() => {
    if (DB.classEnded[key]) return;
    presentSet(key).add(i);
    if (SCH.sel != null && slotKey(SCHED_ALL[SCH.sel], schDate()) === key) renderRoster();
  }, 1200 + k * 900));
}

function endClassFlow() {
  const c = SCHED_ALL[SCH.sel], d = schDate(), key = slotKey(c, d), set = presentSet(key), roster = rosterOf(c);
  const here = roster.filter((_, i) => set.has(i)), gone = roster.filter((_, i) => !set.has(i));
  openModal(`<h3 id="modalTitle">End ${esc(classTitle(c))} · ${timeLabel(c.time)}?</h3>
    <p class="sub">Attendance locks once the class ends. Check the roster first.</p>
    <div class="end-sum">
      <div class="es ok"><b class="num">${here.length}</b><span>${here.length === 1 ? 'student' : 'students'} present</span><small>Each gets <b>+1 session</b> toward their next grade.</small></div>
      <div class="es warn"><b class="num">${gone.length}</b><span>no-show${gone.length === 1 ? '' : 's'}</span><small>Lesson used, <b>no refund</b>, not counted toward grading.</small></div>
    </div>
    ${gone.length ? `<details class="es-list"><summary>See who's marked as a no-show</summary><p>${gone.map(x => esc(x.n)).join(', ')}</p></details>` : ''}
    <div class="acts"><button class="sbtn red" id="doEnd">${icon('lock')}End class &amp; lock</button><button class="sbtn" data-close>Keep taking attendance</button></div>`);
  $('#doEnd').addEventListener('click', () => {
    roster.forEach(st => {
      const present = here.includes(st);
      if (st.n === ME.name) recordMyAttendance({ date: new Date(d), time: c.time, type: c.type, ins: MY_INS, status: present ? 'present' : 'noshow' });
      else if (present) { st.s++; st.seen = 0; }
    });
    DB.classEnded[key] = { at: new Date(), present: here.map(x => x.n), noshow: gone.map(x => x.n) };
    save(); closeModal(); renderSchedule(); renderRoster();
    toast(`Class ended. ${plural(here.length, 'session')} counted, ${plural(gone.length, 'no-show')}.`);
  });
}

function initSchedule() {
  if (/nograding/.test(location.search)) toast('Grading is open only to the examiner panel during their shift.', 'bad');
  renderAll(); scrollSchedule();
  $('#schView').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; SCH.view = b.dataset.view; SCH.sel = null; renderAll(); if (SCH.view === 'day') scrollSchedule(); });
  $('#schPrev').addEventListener('click', () => stepDate(-1));
  $('#schNext').addEventListener('click', () => stepDate(1));
  $('#schToday').addEventListener('click', () => { SCH.date = startOfDay(TODAY); SCH.sel = null; renderAll(); if (SCH.view === 'day') scrollSchedule(); });
  $('#dayChips').addEventListener('click', e => {
    const b = e.target.closest('[data-day]'); if (!b) return;
    SCH.date = addDays(mondayOf(SCH.date), +b.dataset.day); SCH.sel = null; renderAll(); scrollSchedule();
  });
  $('#weekList').addEventListener('click', e => { const b = e.target.closest('[data-wkday]'); if (!b) return; SCH.date = new Date(+b.dataset.wkday); SCH.view = 'day'; SCH.sel = null; renderAll(); scrollSchedule(); });
  $('#monthGrid').addEventListener('click', e => { const b = e.target.closest('[data-mdate]'); if (!b) return; SCH.date = new Date(+b.dataset.mdate); SCH.view = 'day'; SCH.sel = null; renderAll(); scrollSchedule(); });

  $('#schedGrid').addEventListener('click', e => { const g = e.target.closest('[data-grade]'); if (g) { gradeTap(g); return; } const b = e.target.closest('[data-slot]'); if (b) openRoster(+b.dataset.slot); });
  $('#rosterClose').addEventListener('click', () => { SCH.sel = null; renderSchedule(); renderRoster(); });
  $('#roster').addEventListener('click', e => {
    const n = e.target.closest('[data-s]');
    if (n && SCH.sel != null) { const c = SCHED_ALL[SCH.sel], d = schDate(); openStudent(+n.dataset.s, { key: slotKey(c, d), label: `${classTitle(c)} · ${dayName(d)} ${fmtShort(d)}` }); return; }
    const b = e.target.closest('[data-mark]'); if (!b || SCH.sel == null) return;
    const set = presentSet(slotKey(SCHED_ALL[SCH.sel], schDate())), i = +b.dataset.mark;
    set.has(i) ? set.delete(i) : set.add(i); SCH.pop = set.has(i) ? i : null; renderRoster();
  });
  $('#markAll').addEventListener('click', () => {
    const c = SCHED_ALL[SCH.sel], n = rosterOf(c).length, set = presentSet(slotKey(c, schDate()));
    for (let i = 0; i < n; i++) set.add(i);
    renderRoster(); toast(n === 1 ? 'Student marked present' : `All ${n} students marked present`);
  });
  $('#endClass').addEventListener('click', endClassFlow);
  $('#rosterFilter').addEventListener('click', e => { const b = e.target.closest('[data-rf]'); if (b) { SCH.rf = b.dataset.rf; renderRoster(); } });
  $('#saveClassRemark').addEventListener('click', () => {
    if (SCH.sel == null) return;
    stopDictation();
    const c = SCHED_ALL[SCH.sel], d = schDate(), key = slotKey(c, d);
    const r = upsertRemark({ kind: 'class', key, student: c.private ? c.student : null, text: $('#classRemarkText').value.trim(), label: `${classTitle(c)} · ${dayName(d)} ${fmtShort(d)}` });
    $('#classRemarkNote').textContent = r ? `Saved ${timeLabelExact(new Date(r.at))}` : '';
    setRemarkState($('#classRemarkState'), !!r);
    $('#classRemarkBox').open = false;
    toast(r ? 'Class remarks saved' : 'Class remarks cleared');
  });
  setInterval(() => renderAll(), 60000);   // classes move from upcoming to active to finished on their own
}

let STU_CTX = null;   // the class a student was opened from, so a remark is saved against it
function remarkSection(s, ctx) {
  if (!ctx) return '';
  const first = esc(s.n.split(' ')[0]), mine = findRemark('student', ctx.key, s.n), gfg = goingForGrading(s), gn = gfg ? findRemark('grading', ctx.key, s.n) : null;
  const past = REMARKS.filter(r => r.kind === 'student' && r.student === s.n && r.key !== ctx.key).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 3);
  const field = (id, label, hint, val, ph) => `<details class="rm-details"><summary><svg class="ic"><use href="#i-edit"/></svg><span>${label}</span><em class="rm-state${val ? ' has' : ''}">${val ? 'Saved' : 'Add'}</em><svg class="ic chev"><use href="#i-chev"/></svg></summary><div class="rm-body"><div class="fld dict-fld"><div class="dict-lbl"><label for="${id}">${label}</label><button type="button" class="dict-btn" data-dictate="${id}" aria-pressed="false">${icon('mic')}<span>Dictate</span></button></div><textarea id="${id}" rows="3" placeholder="${ph}">${esc(val)}</textarea>${hint ? `<span class="hint">${hint}</span>` : ''}<span class="dict-msg" role="status" aria-live="polite"></span></div></div></details>`;
  return `<section class="remark-sec">
    ${field('stuRemark', `Remark for ${first}`, `For ${esc(ctx.label)}. ${first} will see this in their notes.`, mine ? mine.text : '', 'e.g. Good effort on ikkyo. Work on the footwork.')}
    ${gfg ? field('stuGradeNote', 'Note for grading', `${first} will see this too. The examiner panel reads it when ${first} is graded.`, gn ? gn.text : '', 'e.g. Ready for the next grade. Strong ukemi.') : ''}
    <div class="remark-actions"><button class="sbtn dark" id="saveStuRemark">${icon('check')}Save remarks</button></div>
    ${past.length ? `<div class="remark-past"><b>Earlier remarks</b>${past.map(r => `<p><span>${esc(r.label)}</span>${esc(r.text)}</p>`).join('')}</div>` : ''}
  </section>`;
}
document.addEventListener('click', e => {
  if (!e.target.closest('#saveStuRemark') || !STU_CTX) return;
  stopDictation();
  const s = STUDENTS[STU_CTX.i], gn = $('#stuGradeNote');
  upsertRemark({ kind: 'student', key: STU_CTX.key, student: s.n, text: $('#stuRemark').value.trim(), label: STU_CTX.label });
  if (gn) upsertRemark({ kind: 'grading', key: STU_CTX.key, student: s.n, text: gn.value.trim(), label: STU_CTX.label });
  closeDrawer(); renderRoster(); toast(`Remarks saved for ${s.n.split(' ')[0]}`);
});

function openStudent(i, ctx) {
  const s = STUDENTS[i], first = esc(s.n.split(' ')[0]), away = isDeclining(s);
  STU_CTX = ctx ? { ...ctx, i } : null;
  openDrawer(s.n, `
    <div class="stu-sum">${avatarHtml(s, 'stu-av')}
      <div class="stu-info">
        <span class="belt" style="--belt:${beltOf(s.g)}"><i></i>${s.g}</span>
        <b class="num">${s.s} / ${s.need} sessions</b>
        <span class="stu-meta"><span class="pill ${goingForGrading(s) ? 'ok' : 'plain'}">${goingForGrading(s) ? 'Applied for grading' : 'In progress'}</span><span>${away ? 'Last seen ' + s.seen + ' days ago' : 'Training regularly'}${photoOf(s) ? '' : ' · No photo on file'}</span></span>
      </div>
    </div>
    ${away ? `<div class="note warn"><svg class="ic"><use href="#i-flag"/></svg><span><b>Attendance has dropped.</b> ${first} was last seen ${s.seen} days ago.</span></div>` : ''}
    ${remarkSection(s, ctx)}`,
    goingForGrading(s) ? '' : `<button class="sbtn dark" data-remind="${i}">${icon('send')}${s.s >= s.need ? 'Remind to apply for grading' : 'Send reminder'}</button>`,
    { onClose: () => { stopDictation(); $('#drawer').classList.remove('compact'); } });
  $('#drawer').classList.add('compact');
}
document.addEventListener('click', e => {
  const r = e.target.closest('[data-remind]');
  if (r) { toast(`Reminder sent to ${STUDENTS[+r.dataset.remind].n}`); return; }
});

/* ---------- examiner grading panel ----------
   PROVISIONAL rubric: structure follows the attack > technique > variation > criteria sheet, four bands each.
   Criteria names, marks and pass thresholds are placeholders until the centre / ASK confirm them. */
const EXAM_BANDS = [
  { k: 'problem', label: 'Problem', marks: 0 },
  { k: 'pass', label: 'Pass', marks: 1 },
  { k: 'good', label: 'Good', marks: 2 },
  { k: 'excellent', label: 'Excellent', marks: 3 }
];
const EXAM_RUBRIC = [{
  attack: 'Shomen Uchi',
  techniques: [{
    name: 'Ikkyo',
    variations: ['Omote', 'Ura'].map(v => ({
      name: v,
      criteria: [
        { id: `${v}-entry`, name: 'Entry', hint: 'Clear, correct entry for this variation' },
        { id: `${v}-control`, name: 'Control of uke', hint: 'Keeps uke in line and off balance' },
        { id: `${v}-posture`, name: 'Posture', hint: 'Stays upright and centred through the pin' }
      ]
    }))
  }]
}];
const EXAM_CRITERIA = EXAM_RUBRIC.flatMap(a => a.techniques.flatMap(t => t.variations.flatMap(v => v.criteria)));
const EXAM_MAX = EXAM_CRITERIA.length * 3;
const EXAM_PASS_PCT = 0.7, EXAM_RETAKE_PCT = 0.5;   // provisional
const RES_PASS = 'Pass', RES_RETAKE = 'Retake', RES_FAIL = 'Fail';
const RES_HINT = {
  [RES_PASS]: c => `Promoted to ${c.to} once HQ approves.`,
  [RES_RETAKE]: c => `Stays at ${c.from}. May retake ${c.to} at the next grading without re-qualifying.`,
  [RES_FAIL]: c => `Stays at ${c.from}. Must meet the session requirements again before re-applying.`
};

const EX = { sel: -1, scores: {}, fb: {}, sig: null };
const bandOf = k => EXAM_BANDS.find(b => b.k === k);
const examScores = i => EX.scores[i] || (EX.scores[i] = {});
const examFb = i => EX.fb[i] || (EX.fb[i] = { well: '', next: '' });
const examTotal = s => EXAM_CRITERIA.reduce((n, k) => n + (s[k.id] ? bandOf(s[k.id]).marks : 0), 0);
const examDone = s => EXAM_CRITERIA.every(k => s[k.id]);
const resultOf = total => total / EXAM_MAX >= EXAM_PASS_PCT ? RES_PASS : total / EXAM_MAX >= EXAM_RETAKE_PCT ? RES_RETAKE : RES_FAIL;
const resPill = r => `<span class="pill ${r === RES_PASS ? 'ok' : r === RES_RETAKE ? 'warn' : 'bad'}">${r}</span>`;

function renderExamQueue() {
  const groups = [];
  CANDIDATES.forEach((c, i) => {
    let g = groups.find(x => x.from === c.from);
    if (!g) groups.push(g = { from: c.from, items: [] });
    g.items.push(i);
  });
  $('#candQueue').innerHTML = groups.map(g => `<div class="exam-group">${esc(g.from)}</div>` + g.items.map(i => {
    const c = CANDIDATES[i], s = c.done ? c.scores || {} : examScores(i);
    const st = c.done ? resPill(c.result)
      : examDone(s) ? `<span class="pill navy">${examTotal(s)} / ${EXAM_MAX}</span>`
      : '<span class="pill plain">Not started</span>';
    return `<button type="button" class="row cand-row${i === EX.sel ? ' on' : ''}" data-cand="${i}" aria-pressed="${i === EX.sel}">
      <span class="av">${initials(c.n)}</span>
      <span class="grow"><span class="t">${esc(c.n)}</span><span class="d">${esc(c.to)} target</span></span>${st}</button>`;
  }).join('')).join('');
  $('#examCount').textContent = `${CANDIDATES.filter(c => !c.done).length} to score`;
}

function gradeNoteCard(c) {
  const notes = REMARKS.filter(r => r.kind === 'grading' && r.student === c.n).sort((x, y) => new Date(y.at) - new Date(x.at)).slice(0, 3);
  return notes.length ? `<div class="card white inst-note"><div class="card-h"><div><h2>Notes from their instructor</h2><div class="sub">Latest first. The student can read these too.</div></div></div>${notes.map(r => `<p><span>${esc(r.by)} · ${esc(r.label)}</span>${esc(r.text)}</p>`).join('')}</div>` : '';
}

function renderExamPanel() {
  const main = $('#examMain');
  if (EX.sel < 0 || !CANDIDATES[EX.sel]) {
    main.innerHTML = '<div class="card white exam-empty"><h2>No candidates</h2><p>Everyone on this panel has been sent to HQ.</p></div>';
    return;
  }
  const i = EX.sel, c = CANDIDATES[i], done = !!c.done, fb = done ? { well: c.fb?.well || '', next: c.fb?.next || '' } : examFb(i);
  let rows = '';
  EXAM_RUBRIC.forEach(a => a.techniques.forEach(t => t.variations.forEach(v => {
    rows += `<div class="exam-vh"><span>${esc(a.attack)} · ${esc(t.name)}</span><b>${esc(v.name)}</b></div>`;
    v.criteria.forEach(k => {
      rows += `<div class="crit"><div class="crit-n"><b>${esc(k.name)}</b><span>${esc(k.hint)}</span></div>
        <div class="bands" role="group" aria-label="${esc(k.name)}">${EXAM_BANDS.map(b =>
          `<button type="button" class="band ${b.k}" data-band="${k.id}" data-k="${b.k}" aria-pressed="false"${done ? ' disabled' : ''}>${b.label}<small>${b.marks} mk</small></button>`).join('')}</div></div>`;
    });
  })));
  main.innerHTML = `
    <div class="card white exam-head">
      <div class="exam-who"><span class="av lg">${initials(c.n)}</span>
        <div><h2>${esc(c.n)}</h2><p>${esc(c.from)} → ${esc(c.to)} · HQ Dojo · 13 Dec 2026</p></div></div>
      <div class="exam-score"><span>Marks</span><b class="num" id="exTotal"></b><span class="exam-of">of ${EXAM_MAX}</span></div>
    </div>
    ${gradeNoteCard(c)}
    <div class="card white">
      <div class="card-h"><div><h2>Technique assessment</h2><div class="sub">Pick one band per criterion. Marks add up automatically.</div></div></div>
      ${rows}
    </div>
    <div class="card white exam-result-card">
      <div><span class="lbl">Result</span><div id="exResult"></div></div>
      <p class="hint" id="exHint"></p>
      <p class="hint">Provisional: result follows the marks and is not chosen by hand. There are no overrides.</p>
    </div>
    <div class="card white">
      <div class="card-h"><div><h2>Feedback for ${esc(c.n.split(' ')[0])}</h2><div class="sub">Shown on the student's Grading page.</div></div></div>
      <div class="exam-fb">
        <div class="fld"><label for="exWell">What went well</label><textarea id="exWell" rows="3" placeholder="e.g. Confident ukemi, calm posture in ikkyo"${done ? ' disabled' : ''}>${esc(fb.well)}</textarea></div>
        <div class="fld"><label for="exNext">What to work on next</label><textarea id="exNext" rows="3" placeholder="e.g. Keep hips lower in iriminage"${done ? ' disabled' : ''}>${esc(fb.next)}</textarea></div>
      </div>
    </div>
    <div class="card white">
      <div class="card-h"><div><h2>Examiner's signature</h2><div class="sub">Signed as the lead examiner for this panel.</div></div></div>
      ${done ? `<p class="hint">Submitted to HQ as ${resPill(c.result)}.</p>` : '<div id="exSig"></div>'}
    </div>
    ${done ? '' : `<div class="exam-foot"><span class="hint" id="exNote"></span><button type="button" class="sbtn red" id="exSubmit" disabled>${icon('send')}Submit to HQ</button></div>`}`;

  if (!done) {
    EX.sig = signaturePad($('#exSig'), { startLabel: 'Sign as examiner', onChange: refreshExam });
    ['exWell', 'exNext'].forEach(id => $('#' + id).addEventListener('input', () => {
      const f = examFb(i); f.well = $('#exWell').value; f.next = $('#exNext').value; refreshExam();
    }));
  }
  refreshExam();
}

/* updates only the parts that change, so the signature pad and typed feedback survive each tap */
function refreshExam() {
  if (EX.sel < 0 || !CANDIDATES[EX.sel]) return;
  const i = EX.sel, c = CANDIDATES[i], done = !!c.done, s = done ? c.scores || {} : examScores(i);
  document.querySelectorAll('[data-band]').forEach(b => b.setAttribute('aria-pressed', s[b.dataset.band] === b.dataset.k));
  const total = examTotal(s), complete = examDone(s), res = done ? c.result : resultOf(total);
  $('#exTotal').textContent = total;
  $('#exResult').innerHTML = complete ? resPill(res) : '<span class="pill plain">Score every criterion</span>';
  $('#exHint').textContent = complete ? RES_HINT[res](c) : '';
  if (done) return;
  const f = examFb(i), sigOk = !!(EX.sig && EX.sig.value());
  const note = !complete ? 'Score every criterion to continue.' : !f.well.trim() || !f.next.trim() ? 'Add feedback in both boxes.' : !sigOk ? 'Sign to submit.' : 'Ready to send to HQ.';
  $('#exNote').textContent = note;
  $('#exSubmit').disabled = !(complete && f.well.trim() && f.next.trim() && sigOk);
  renderExamQueue();
}

function submitExam() {
  const i = EX.sel, c = CANDIDATES[i], f = examFb(i), s = { ...examScores(i) }, total = examTotal(s), result = resultOf(total);
  const well = f.well.trim(), next = f.next.trim(), to = result === RES_PASS ? c.to : c.from;
  c.done = true; c.result = result; c.scores = s; c.fb = { well, next }; c.marks = total;
  PROPOSALS.unshift({ n: c.n, from: c.from, to, by: MY_INS, result, marks: `${total} / ${EXAM_MAX}`, well, next, fb: `${well} Next: ${next}`, sig: EX.sig.value() });
  if (c.n === ME.name) GRADE_FB.unshift({ from: c.from, to, date: new Date(TODAY), by: MY_INS, result, well, next, status: 'Sent to HQ' });
  save(); setCount('grading', CANDIDATES.filter(x => !x.done).length);
  toast(`Result for ${c.n} sent to HQ`);
  renderExamQueue(); renderExamPanel();
}

document.addEventListener('click', e => {
  const cand = e.target.closest('[data-cand]');
  if (cand) { EX.sel = +cand.dataset.cand; renderExamQueue(); renderExamPanel(); return; }
  const band = e.target.closest('[data-band]');
  if (band && !band.disabled && EX.sel >= 0) { examScores(EX.sel)[band.dataset.band] = band.dataset.k; refreshExam(); return; }
  if (e.target.closest('#exSubmit') && !e.target.closest('#exSubmit').disabled) submitExam();
});

/* ---------- profile: the instructor's card, teaching summary and anonymous student feedback ---------- */
const stars = n => `<span class="stars" role="img" aria-label="${n} out of 5 stars">${[1, 2, 3, 4, 5].map(i => `<svg class="st${i <= n ? ' on' : ''}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-star"/></svg>`).join('')}</span>`;
const myFeedback = () => FEEDBACK.filter(f => f.ins === MY_INS).sort((a, b) => b.date - a.date);

function renderProfile() {
  profileCard($('#insCard'));
  $('#forgotPw').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Reset your password</h3><p class="sub">We will email a reset link to the address registered to your instructor account.</p><div class="acts"><button class="sbtn dark" id="sendReset">Send reset link</button><button class="sbtn" data-close>Cancel</button></div>`);
    $('#sendReset').addEventListener('click', () => { closeModal(); toast('Reset link sent to your registered email'); });
  });
  const fb = myFeedback(), n = fb.length, avg = n ? fb.reduce((s, f) => s + f.rating, 0) / n : 0;
  const mine = CLASSES.filter(c => c.ins === MY_INS), own = SCHED_ALL.filter(c => c.ins === MY_INS), booked = mine.reduce((s, c) => s + c.booked, 0), cap = mine.reduce((s, c) => s + c.cap, 0);
  $('#insStats').innerHTML = [
    ['Average rating', n ? `${avg.toFixed(1)} / 5` : '–'],
    ['Student ratings', n],
    ['Classes per week', own.length],
    ['Average class fill', cap ? `${Math.round(booked / cap * 100)}%` : '–']
  ].map(([l, v]) => `<div class="stat"><span>${l}</span><b class="num">${v}</b></div>`).join('');

  const counts = [5, 4, 3, 2, 1].map(r => ({ r, k: fb.filter(f => f.rating === r).length }));
  const tags = {}; fb.forEach(f => f.tags.forEach(t => tags[t] = (tags[t] || 0) + 1));
  const topTags = Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 4);
  $('#fbSummary').innerHTML = n ? `
    <div class="fb-avg"><b class="num">${avg.toFixed(1)}</b>${stars(Math.round(avg))}<span>${plural(n, 'rating')}</span></div>
    <div class="fb-dist">${counts.map(({ r, k }) => `<div><span>${r} ★</span><div class="bar"><i style="width:${k / n * 100}%"></i></div><span class="num">${k}</span></div>`).join('')}</div>
    ${topTags.length ? `<div class="fb-tags"><span>Students most often praise</span>${topTags.map(([t, k]) => `<em>${esc(t)} · ${k}</em>`).join('')}</div>` : ''}`
    : '<p class="ag-empty">No ratings yet. Students rate a class after it ends.</p>';

  $('#fbList').innerHTML = fb.filter(f => f.note).map(f => `<article class="fb-item">
      <div class="fb-top">${stars(f.rating)}<span class="fb-type ${toneOf(f.type)}">${esc(f.type)}</span><span>${dayName(f.date)} ${fmtShort(f.date)}</span></div>
      <p>${esc(f.note)}</p>
      ${f.tags.length ? `<div class="fb-chips">${f.tags.map(t => `<em>${esc(t)}</em>`).join('')}</div>` : ''}
    </article>`).join('') || '<p class="ag-empty">No written comments yet.</p>';
  $('#fbCount').textContent = `${fb.filter(f => f.note).length} written ${fb.filter(f => f.note).length === 1 ? 'comment' : 'comments'} · students stay anonymous`;

  // demo only: pretend the office has scheduled this instructor on the grading panel, so Grading can be tried out
  const demo = $('#demoPanel');
  if (demo) {
    demo.checked = !!DB.panels[0].demoOn;
    demo.addEventListener('change', () => { DB.panels[0].demoOn = demo.checked; save(); location.reload(); });
  }
}

runPage({
  profile() { renderProfile(); },
  today() { initSchedule(); },
  grading() { EX.sel = CANDIDATES.findIndex(c => !c.done); renderExamQueue(); renderExamPanel(); }
});

// search boxes: each one filters only its own list
runPage({
  today() { filterList('#rosterSearch', '#roster'); },
  grading() { filterList('#candSearch', '#candQueue'); }
});
