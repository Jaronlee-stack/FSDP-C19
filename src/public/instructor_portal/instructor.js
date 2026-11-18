'use strict';
/* AIKIDO SHINJU-KAI — instructor.js  (instructor portal pages)
   Data comes from the API (see instructor-data.js): the schedule, rosters, remarks, grading and ratings. Nothing is kept in the browser.
   The server checks every rule again (ownership, class windows, examiner window); the checks here only decide what to show. */

const MY_INS = ASK.me ? ASK.me.name : '';
const timeLabelExact = d => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;

/* ---------- schedule: the instructor's day, one column for each hour that has a class ---------- */
const SCH = { date: startOfDay(TODAY), view: 'day', sel: null, roster: null, loaded: null, rf: 'all', pop: null };   // sel: lessonId of the class whose roster is open; roster: its API payload
const STATE_LABEL = { live: 'Active now', open: 'Check-in open', later: 'Upcoming', done: 'Finished' };
const schDate = () => SCH.date;
const classTitle = c => c.private ? `${c.type} (Private)` : c.type;
const classHour = c => +c.time.slice(0, 2);
const classRange = c => `${timeLabel(c.time)} – ${timeLabel(c.end)}`;
const dojoLabel = c => c.dojoName || 'HQ Dojo';
const myClasses = d => SCHED.sessions.filter(c => c.date === isoDate(d));
const findClass = lessonId => SCHED.sessions.find(c => c.lessonId === lessonId) || null;
const TONES = [[/^children/i, 'kids'], [/^adults/i, 'adults'], [/^intermediate/i, 'inter'], [/^advanced/i, 'adv'], [/^mixed/i, 'mixed'], [/^ladies/i, 'ladies'], [/^weapons/i, 'weap'], [/^sg50/i, 'sg']];
const toneOf = type => 't-' + ((TONES.find(([re]) => re.test(type)) || [0, 'adults'])[1]);
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

/* the date range the visible view needs, loaded once and kept until the view moves outside it */
function wantedRange() {
  const d = SCH.date;
  if (SCH.view === 'month') { const s = mondayOf(new Date(d.getFullYear(), d.getMonth(), 1)); return [s, addDays(s, 41)]; }
  const m = mondayOf(d);
  return [m, addDays(m, 6)];
}
async function ensureRange(force) {
  const [a, b] = wantedRange(), from = isoDate(a), to = isoDate(b);
  if (!force && SCHED.from && SCHED.from <= from && SCHED.to >= to) return;
  await ASK.load.schedule(from, to);
}
/* make sure the schedule of the visible range is here, then draw */
async function show() {
  try { await ensureRange(); } catch (e) { ASK.errToast(e); }
  renderAll();
}

/* ---------- grading panel on the timetable ----------
   Only the instructors on the panel see it. Locked until 15 minutes before the start; counts only, no names, until then. */
const GRADE_LEAD_MIN = 15;
function gradingOn(d) {
  const sh = SCHED.grading.find(p => p.date === isoDate(d));
  if (!sh) return null;
  const at = t => { const x = startOfDay(d); x.setHours(+t.slice(0, 2), +t.slice(3), 0, 0); return x; };
  const start = at(sh.from), end = at(sh.to), unlock = new Date(+start - GRADE_LEAD_MIN * 60000), now = +NOW();
  const left = sh.left;
  const state = sh.candidateCount && !left ? 'done' : now < +unlock ? 'locked' : now < +start ? 'soon' : now <= +end ? 'live' : 'over';
  const label = { locked: `Opens ${timeLabelExact(unlock)}`, soon: `Starts ${timeLabelExact(start)}`, live: 'In progress', over: 'Finished', done: 'Results sent to HQ' }[state];
  return { sh, start, end, unlock, state, label, total: sh.candidateCount, left };
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
  if (g.state === 'soon' || g.state === 'live') { location.href = 'grading.html'; return; }
  openGradeSheet(g);
}
function openGradeSheet(g) {
  const others = g.sh.examiners.filter(n => n !== MY_INS);
  const hint = g.state === 'locked' ? `Names appear at ${timeLabelExact(g.unlock)}, ${GRADE_LEAD_MIN} minutes before the start.`
    : g.state === 'over' ? 'This panel has ended, so grading is closed.' : 'The lead examiner sends the results to HQ.';
  openModal(`<h3 id="modalTitle">${esc(g.sh.label || 'Grading panel')}</h3>
    <p class="sub">${dayName(g.start)} ${g.start.getDate()} ${MON[g.start.getMonth()]} · ${timeLabelExact(g.start)} – ${timeLabelExact(g.end)} · HQ Dojo</p>
    <div class="rows" style="margin-top:12px">
      <div class="row"><span class="av navy">${icon('award')}</span><div class="grow"><div class="t">Lead examiner</div><div class="d">${esc(g.sh.lead)}</div></div></div>
      <div class="row"><span class="av">${icon('users')}</span><div class="grow"><div class="t">Your panel</div><div class="d">${others.map(esc).join(', ') || 'Just you'}</div></div></div>
      <div class="row"><span class="av">${icon('doc')}</span><div class="grow"><div class="t">Candidates</div><div class="d">${g.total} candidates${g.state === 'locked' ? '' : `, ${g.left} still to score`}</div></div></div>
    </div>
    <p class="hint" style="margin-top:12px">${hint}</p>
    <div class="acts"><button class="sbtn" data-close>Close</button></div>`);
}

/* finished once its hour is over or the instructor has ended it; attendance opens 30 minutes before the start (the server uses the same rule) */
function classState(c) {
  if (c.ended) return 'done';
  const at = t => { const x = ASK.d(c.date); x.setHours(+t.slice(0, 2), +t.slice(3), 0, 0); return x; };
  const start = at(c.time), end = at(c.end), now = +NOW();
  if (now >= +end) return 'done';
  if (now >= +start) return 'live';
  return now >= +start - 1800000 ? 'open' : 'later';
}

function renderSchedule() {
  const d = schDate(), mine = myClasses(d), isToday = +d === +TODAY, mon = mondayOf(d);
  $('#dayChips').innerHTML = [...Array(7)].map((_, k) => {
    const dt = addDays(mon, k), sel = +dt === +SCH.date;
    return `<button type="button" class="ag-day${+dt === +TODAY ? ' today' : ''}${sel ? ' on' : ''}" data-day="${k}" aria-pressed="${sel}"><span>${DAY[dt.getDay()]}</span><b>${dt.getDate()}</b>${myClasses(dt).length || gradingOn(dt) ? '<i></i>' : ''}</button>`;
  }).join('');

  const nowD = NOW(), nowH = nowD.getHours() + nowD.getMinutes() / 60;
  const gr = gradingOn(d);
  const hours = [...new Set([...mine.map(classHour), ...(gr ? [+gr.sh.from.slice(0, 2)] : [])])].sort((x, y) => x - y);
  const grid = $('#schedGrid');
  grid.style.setProperty('--n', hours.length || 1);
  grid.innerHTML = hours.length ? hours.map(h => {
    const isNow = isToday && nowH >= h && nowH < h + 1;
    const slots = (gr && +gr.sh.from.slice(0, 2) === h ? gradeBlock(gr) : '') + mine.filter(c => classHour(c) === h).map(c => {
      const st = classState(c), who = c.private ? `With ${esc(c.studentName)}` : `${esc(dojoLabel(c))} · ${c.booked} booked`;
      return `<button type="button" class="cls-slot ${toneOf(c.type)} ${st}${c.private ? ' private' : ''}${SCH.sel === c.lessonId ? ' sel' : ''}" data-slot="${esc(c.lessonId)}" aria-pressed="${SCH.sel === c.lessonId}">
          <span class="sl-tag">${STATE_LABEL[st]}</span><b>${esc(classTitle(c))}</b><span>${classRange(c)}</span><span>${who}</span></button>`;
    }).join('');
    return `<div class="sh-col${isNow ? ' now' : ''}"><div class="sh-h">${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}</div><div class="sh-cell">${slots}</div>${isNow ? `<i class="sh-now" style="--f:${(nowH - h).toFixed(2)}" aria-hidden="true"></i>` : ''}</div>`;
  }).join('') : `<div class="sch-empty"><b>Nothing scheduled</b><span>You have no classes on ${dayName(d)} ${d.getDate()} ${MON[d.getMonth()]}.</span></div>`;
}

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
    const classes = myClasses(dt).slice().sort((a, b) => a.time.localeCompare(b.time)).map(c => {
      const st = classState(c);
      return `<span class="wk-item ${toneOf(c.type)}"><span class="wk-time">${timeLabel(c.time)}</span><span class="wk-what">${esc(classTitle(c))}</span><span class="wk-st ${st}">${STATE_LABEL[st]}</span></span>`;
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
  if (v === 'day') { renderSchedule(); } else { SCH.sel = null; SCH.roster = null; if (v === 'week') renderWeek(); else renderMonth(); }
  renderRoster();
  setHeader();
}

/* previous / next move by the unit of the view: a day, a week or a month */
function stepDate(dir) {
  const d = SCH.date;
  if (SCH.view === 'day') SCH.date = addDays(d, dir);
  else if (SCH.view === 'week') SCH.date = addDays(d, 7 * dir);
  else { const x = new Date(d.getFullYear(), d.getMonth() + dir, 1); SCH.date = x; }
  SCH.sel = null; SCH.roster = null; return show();
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

const rosterRows = () => (SCH.roster ? SCH.roster.rows : []);
const isHere = s => s.st === 'Attended';

function renderRoster() {
  const card = $('#rosterCard'); if (!card) return;
  if (SCH.sel == null || !SCH.roster) { card.hidden = true; SCH.loaded = null; stopDictation(); return; }
  const c = SCH.roster.session, d = ASK.d(c.date), st = classState(c), ended = c.ended, roster = rosterRows();
  const canMark = !ended && (st === 'live' || st === 'open');
  const opening = card.hidden;
  card.className = `card white ac ${toneOf(c.type)}`;
  card.hidden = false;
  if (opening && !reduce) { card.classList.add('enter'); card.addEventListener('animationend', () => card.classList.remove('enter'), { once: true }); }
  const nHere = roster.filter(isHere).length, nGone = roster.length - nHere;
  $('#rosterTitle').textContent = `${c.private ? '' : 'Roster · '}${classTitle(c)}`;
  $('#rosterWhen').textContent = `${dayName(d)} ${d.getDate()} ${MON[d.getMonth()]} · ${classRange(c)} · ${dojoLabel(c)}`;
  $('#rosterSub').textContent = ended
    ? `${nHere} present (+1 session each) · ${nGone} no-show (lesson used, not counted)`
    : st === 'done' ? 'This class has finished and its attendance was not recorded.'
    : canMark ? `${nHere} of ${roster.length} checked in`
    : 'Attendance opens 30 minutes before the class starts.';
  if (SCH.loaded !== c.lessonId) {   // load this class's remarks once, so typing is never wiped by a re-render
    stopDictation();
    const cr = SCH.roster.classRemark;
    $('#classRemarkText').value = cr ? cr.body : '';
    $('#classRemarkNote').textContent = cr ? `Saved ${timeLabelExact(new Date(cr.at))}` : '';
    $('#classRemarkBox').open = false;
    setRemarkState($('#classRemarkState'), !!cr);
    SCH.loaded = c.lessonId; SCH.rf = 'all';
  }
  $('#markAll').hidden = !canMark;
  $('#endClass').hidden = !canMark;
  $('#rosterLocked').hidden = !ended;
  if (ended) $('#rosterLocked').innerHTML = `${icon('lock')}Locked · ended ${timeLabelExact(new Date(c.endedAt))}`;
  const labels = ended ? ['Present', 'No-show'] : ['Here', 'Not yet'];
  $('#rosterFilter').innerHTML = [['all', 'All', roster.length], ['here', labels[0], nHere], ['not', labels[1], nGone]]
    .map(([k, l, n]) => `<button type="button" class="fpill${SCH.rf === k ? ' on' : ''}" data-rf="${k}" aria-pressed="${SCH.rf === k}">${l}<span class="n">${n}</span></button>`).join('');
  $('#roster').innerHTML = roster.filter(s => SCH.rf === 'all' || (SCH.rf === 'here') === isHere(s)).map(s => {
    const here = isHere(s), first = esc(s.n.split(' ')[0]);
    const act = ended
      ? `<span class="pill ${here ? 'ok' : 'warn'}">${here ? 'Present · +1' : 'No-show'}</span>`
      : canMark ? `<button class="mark chk${here ? ' on' : ''}${SCH.pop === s.userId ? ' pop' : ''}" data-mark="${esc(s.userId)}" aria-pressed="${here}"${here ? ' disabled title="Counted. Attendance cannot be undone."' : ''} aria-label="${here ? `${first} is present` : `Mark ${first} present`}">${icon('check')}</button>` : '';
    const noted = !!s.remark;
    return `<div class="row">${avatarHtml(s, 'av')}<div class="grow"><button type="button" class="t row-name" data-s="${esc(s.userId)}">${esc(s.n)}${noted ? '<i class="rm-dot" title="Remark added" aria-label="Remark added"></i>' : ''}</button><div class="d"><span class="belt" style="--belt:${beltOf(s.g)}"><i></i>${esc(s.g)}</span> · ${s.s} sessions${s.goingForGrading ? ' · <span class="gfg" title="Going for grading">Grading</span>' : ''}${isDeclining(s) ? ` · <b class="away" title="Not seen in ${s.seen} days">Away ${s.seen}d</b>` : ''}</div></div><div class="acts">${act}</div></div>`;
  }).join('') || '<div class="no-match">Nobody here.</div>';
  SCH.pop = null;
  const q = $('#rosterSearch'); if (q && q.value) q.dispatchEvent(new Event('input'));
}

/* open (or close) the roster of one class: the roster is read from the server each time it opens */
async function openRoster(lessonId) {
  if (SCH.sel === lessonId) { SCH.sel = null; SCH.roster = null; renderSchedule(); renderRoster(); return; }
  try { SCH.roster = await ASK.load.roster(lessonId); } catch (e) { ASK.errToast(e); return; }
  SCH.sel = lessonId; SCH.loaded = null;
  renderSchedule(); renderRoster();
  $('#rosterCard').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}
/* re-read the open roster and the schedule counts after something changed on the server */
async function reloadRoster() {
  if (SCH.sel == null) return;
  const [r] = await Promise.all([ASK.load.roster(SCH.sel), ensureRange(true)]);
  SCH.roster = r;
  renderSchedule(); renderRoster();
}

/* one tick: the server credits the hour once; a person already counted stays counted */
async function markPresent(userId) {
  if (SCH.sel == null || !SCH.roster) return;
  const row = rosterRows().find(s => s.userId === userId);
  if (!row || isHere(row)) return;
  try {
    await ASK.act.mark(SCH.sel, userId, 'Attended');
    row.st = 'Attended'; row.s += 1; row.seen = 0; SCH.pop = userId;
    renderRoster();
  } catch (e) { ASK.errToast(e); if (e.status === 409) reloadRoster().catch(() => {}); }
}

function endClassFlow() {
  if (SCH.sel == null || !SCH.roster) return;
  const c = SCH.roster.session, roster = rosterRows();
  const here = roster.filter(isHere), gone = roster.filter(s => !isHere(s));
  openModal(`<h3 id="modalTitle">End ${esc(classTitle(c))} · ${timeLabel(c.time)}?</h3>
    <p class="sub">Attendance locks once the class ends. Check the roster first.</p>
    <div class="end-sum">
      <div class="es ok"><b class="num">${here.length}</b><span>${here.length === 1 ? 'student' : 'students'} present</span><small>Each gets <b>+1 session</b> toward their next grade.</small></div>
      <div class="es warn"><b class="num">${gone.length}</b><span>no-show${gone.length === 1 ? '' : 's'}</span><small>Lesson used, <b>no refund</b>, not counted toward grading.</small></div>
    </div>
    ${gone.length ? `<details class="es-list"><summary>See who's marked as a no-show</summary><p>${gone.map(x => esc(x.n)).join(', ')}</p></details>` : ''}
    <div class="acts"><button class="sbtn red" id="doEnd">${icon('lock')}End class &amp; lock</button><button class="sbtn" data-close>Keep taking attendance</button></div>`);
  $('#doEnd').addEventListener('click', async e => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const r = await ASK.act.end(c.lessonId, here.map(x => x.userId), gone.map(x => x.userId));
      closeModal();
      await reloadRoster();
      toast(`Class ended. ${plural(r.present, 'session')} counted, ${plural(r.noShow, 'no-show')}.`);
    } catch (err) { btn.disabled = false; closeModal(); ASK.errToast(err); reloadRoster().catch(() => {}); }
  });
}

function initSchedule() {
  if (/nograding/.test(location.search)) toast('Grading is open only to the examiner panel during their shift.', 'bad');
  renderAll(); scrollSchedule();
  $('#schView').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (!b) return; SCH.view = b.dataset.view; SCH.sel = null; SCH.roster = null; show().then(() => { if (SCH.view === 'day') scrollSchedule(); }); });
  $('#schPrev').addEventListener('click', () => stepDate(-1));
  $('#schNext').addEventListener('click', () => stepDate(1));
  $('#schToday').addEventListener('click', () => { SCH.date = startOfDay(TODAY); SCH.sel = null; SCH.roster = null; show().then(() => { if (SCH.view === 'day') scrollSchedule(); }); });
  $('#dayChips').addEventListener('click', e => {
    const b = e.target.closest('[data-day]'); if (!b) return;
    SCH.date = addDays(mondayOf(SCH.date), +b.dataset.day); SCH.sel = null; SCH.roster = null; show().then(scrollSchedule);
  });
  $('#weekList').addEventListener('click', e => { const b = e.target.closest('[data-wkday]'); if (!b) return; SCH.date = new Date(+b.dataset.wkday); SCH.view = 'day'; SCH.sel = null; SCH.roster = null; show().then(scrollSchedule); });
  $('#monthGrid').addEventListener('click', e => { const b = e.target.closest('[data-mdate]'); if (!b) return; SCH.date = new Date(+b.dataset.mdate); SCH.view = 'day'; SCH.sel = null; SCH.roster = null; show().then(scrollSchedule); });

  $('#schedGrid').addEventListener('click', e => { const g = e.target.closest('[data-grade]'); if (g) { gradeTap(g); return; } const b = e.target.closest('[data-slot]'); if (b) openRoster(b.dataset.slot); });
  $('#rosterClose').addEventListener('click', () => { SCH.sel = null; SCH.roster = null; renderSchedule(); renderRoster(); });
  $('#roster').addEventListener('click', e => {
    const n = e.target.closest('[data-s]');
    if (n && SCH.roster) { const c = SCH.roster.session, d = ASK.d(c.date); openStudent(n.dataset.s, { lessonId: c.lessonId, label: `${classTitle(c)} · ${dayName(d)} ${fmtShort(d)}` }); return; }
    const b = e.target.closest('[data-mark]'); if (!b || b.disabled) return;
    markPresent(b.dataset.mark);
  });
  $('#markAll').addEventListener('click', async () => {
    const todo = rosterRows().filter(s => !isHere(s));
    if (!todo.length) return;
    $('#markAll').disabled = true;
    try { for (const s of todo) { await ASK.act.mark(SCH.sel, s.userId, 'Attended'); s.st = 'Attended'; s.s += 1; s.seen = 0; } toast(todo.length === 1 ? 'Student marked present' : `All ${rosterRows().length} students marked present`); }
    catch (e) { ASK.errToast(e); }
    $('#markAll').disabled = false;
    reloadRoster().catch(() => renderRoster());
  });
  $('#endClass').addEventListener('click', endClassFlow);
  $('#rosterFilter').addEventListener('click', e => { const b = e.target.closest('[data-rf]'); if (b) { SCH.rf = b.dataset.rf; renderRoster(); } });
  $('#saveClassRemark').addEventListener('click', async () => {
    if (SCH.sel == null || !SCH.roster) return;
    stopDictation();
    try {
      const r = await ASK.act.remark(SCH.sel, 'class', null, $('#classRemarkText').value.trim());
      SCH.roster.classRemark = r.deleted ? null : { body: r.body, at: r.at };
      $('#classRemarkNote').textContent = r.deleted ? '' : `Saved ${timeLabelExact(new Date(r.at))}`;
      setRemarkState($('#classRemarkState'), !r.deleted);
      $('#classRemarkBox').open = false;
      toast(r.deleted ? 'Class remarks cleared' : 'Class remarks saved');
    } catch (e) { ASK.errToast(e); }
  });
  setInterval(() => renderAll(), 60000);   // classes move from upcoming to active to finished on their own
}

let STU_CTX = null;   // the class a student was opened from, so a remark is saved against it
const stuOf = userId => rosterRows().find(s => s.userId === userId) || STUDENTS.find(s => s.userId === userId) || null;
function remarkSection(s, ctx) {
  if (!ctx) return '';
  const first = esc(s.n.split(' ')[0]), mine = s.remark, gfg = s.goingForGrading, gn = gfg ? s.gradingNote : '';
  const past = s.earlier || [];
  const field = (id, label, hint, val, ph) => `<details class="rm-details"><summary><svg class="ic"><use href="#i-edit"/></svg><span>${label}</span><em class="rm-state${val ? ' has' : ''}">${val ? 'Saved' : 'Add'}</em><svg class="ic chev"><use href="#i-chev"/></svg></summary><div class="rm-body"><div class="fld dict-fld"><div class="dict-lbl"><label for="${id}">${label}</label><button type="button" class="dict-btn" data-dictate="${id}" aria-pressed="false">${icon('mic')}<span>Dictate</span></button></div><textarea id="${id}" rows="3" placeholder="${ph}">${esc(val)}</textarea>${hint ? `<span class="hint">${hint}</span>` : ''}<span class="dict-msg" role="status" aria-live="polite"></span></div></div></details>`;
  return `<section class="remark-sec">
    ${field('stuRemark', `Remark for ${first}`, `For ${esc(ctx.label)}. ${first} will see this in their notes.`, mine, 'e.g. Good effort on ikkyo. Work on the footwork.')}
    ${gfg ? field('stuGradeNote', 'Note for grading', `${first} will see this too. The examiner panel reads it when ${first} is graded.`, gn, 'e.g. Ready for the next grade. Strong ukemi.') : ''}
    <div class="remark-actions"><button class="sbtn dark" id="saveStuRemark">${icon('check')}Save remarks</button></div>
    ${past.length ? `<div class="remark-past"><b>Earlier remarks</b>${past.map(r => `<p><span>${esc(r.label)}</span>${esc(r.text)}</p>`).join('')}</div>` : ''}
  </section>`;
}
document.addEventListener('click', async e => {
  const btn = e.target.closest('#saveStuRemark');
  if (!btn || !STU_CTX) return;
  stopDictation();
  const s = stuOf(STU_CTX.userId), gn = $('#stuGradeNote'), ctx = STU_CTX;
  btn.disabled = true;
  try {
    const r = await ASK.act.remark(ctx.lessonId, 'student', s.userId, $('#stuRemark').value.trim());
    s.remark = r.deleted ? '' : r.body;
    if (gn) { const g = await ASK.act.gradingNote(s.userId, ctx.lessonId, gn.value.trim()); s.gradingNote = g.deleted ? '' : g.body; }
    closeDrawer(); renderRoster(); toast(`Remarks saved for ${s.n.split(' ')[0]}`);
  } catch (err) { btn.disabled = false; ASK.errToast(err); }
});

function openStudent(userId, ctx) {
  const s = stuOf(userId); if (!s) return;
  const first = esc(s.n.split(' ')[0]), away = isDeclining(s);
  STU_CTX = ctx ? { ...ctx, userId } : null;
  openDrawer(s.n, `
    <div class="stu-sum">${avatarHtml(s, 'stu-av')}
      <div class="stu-info">
        <span class="belt" style="--belt:${beltOf(s.g)}"><i></i>${esc(s.g)}</span>
        <b class="num">${s.s} / ${s.need} sessions</b>
        <span class="stu-meta"><span class="pill ${s.goingForGrading ? 'ok' : 'plain'}">${s.goingForGrading ? 'Applied for grading' : 'In progress'}</span><span>${away ? 'Last seen ' + s.seen + ' days ago' : 'Training regularly'}${photoOf(s) ? '' : ' · No photo on file'}</span></span>
      </div>
    </div>
    ${away ? `<div class="note warn"><svg class="ic"><use href="#i-flag"/></svg><span><b>Attendance has dropped.</b> ${first} was last seen ${s.seen} days ago.</span></div>` : ''}
    ${remarkSection(s, ctx)}`,
    s.goingForGrading ? '' : `<button class="sbtn dark" data-remind="${esc(userId)}">${icon('send')}${s.s >= s.need ? 'Remind to apply for grading' : 'Send reminder'}</button>`,
    { onClose: () => { stopDictation(); $('#drawer').classList.remove('compact'); } });
  $('#drawer').classList.add('compact');
}
document.addEventListener('click', e => {
  const r = e.target.closest('[data-remind]');
  if (r) { const s = stuOf(r.dataset.remind); if (s) toast(`Reminder sent to ${s.n}`); return; }   // the reminder itself is a mock for now: no message is sent
});

/* ---------- examiner grading panel ----------
   PROVISIONAL rubric: structure follows the attack > technique > variation > criteria sheet, four bands each.
   Criteria names, marks and pass thresholds are placeholders until the centre / ASK confirm them.
   The server holds the same numbers (services/gradingRules.js) and decides the result itself from the marks. */
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

const EX = { sel: -1, scores: {}, fb: {}, sig: null, panel: null };
const bandOf = k => EXAM_BANDS.find(b => b.k === k);
const examScores = i => EX.scores[i] || (EX.scores[i] = {});
const examFb = i => EX.fb[i] || (EX.fb[i] = { well: '', next: '' });
const examTotal = s => EXAM_CRITERIA.reduce((n, k) => n + (s[k.id] ? bandOf(s[k.id]).marks : 0), 0);
const examDone = s => EXAM_CRITERIA.every(k => s[k.id]);
const resultOf = total => total / EXAM_MAX >= EXAM_PASS_PCT ? RES_PASS : total / EXAM_MAX >= EXAM_RETAKE_PCT ? RES_RETAKE : RES_FAIL;
const resPill = r => `<span class="pill ${r === RES_PASS ? 'ok' : r === RES_RETAKE ? 'warn' : 'bad'}">${r}</span>`;
/* marks of a result that was already sent: only the percentage is stored */
const sentMarks = c => Math.round(((c.score || 0) / 100) * EXAM_MAX);

function renderExamQueue() {
  const groups = [];
  CANDIDATES.forEach((c, i) => {
    let g = groups.find(x => x.from === c.from);
    if (!g) groups.push(g = { from: c.from, items: [] });
    g.items.push(i);
  });
  $('#candQueue').innerHTML = groups.map(g => `<div class="exam-group">${esc(g.from)}</div>` + g.items.map(i => {
    const c = CANDIDATES[i], s = c.done ? {} : examScores(i);
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
  const notes = (c.notes || []).slice(0, 3);
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
  if (!done) EXAM_RUBRIC.forEach(a => a.techniques.forEach(t => t.variations.forEach(v => {
    rows += `<div class="exam-vh"><span>${esc(a.attack)} · ${esc(t.name)}</span><b>${esc(v.name)}</b></div>`;
    v.criteria.forEach(k => {
      rows += `<div class="crit"><div class="crit-n"><b>${esc(k.name)}</b><span>${esc(k.hint)}</span></div>
        <div class="bands" role="group" aria-label="${esc(k.name)}">${EXAM_BANDS.map(b =>
          `<button type="button" class="band ${b.k}" data-band="${k.id}" data-k="${b.k}" aria-pressed="false">${b.label}<small>${b.marks} mk</small></button>`).join('')}</div></div>`;
    });
  })));
  const when = EX.panel ? fmtDate(ASK.d(EX.panel.date)) : '';
  main.innerHTML = `
    <div class="card white exam-head">
      <div class="exam-who"><span class="av lg">${initials(c.n)}</span>
        <div><h2>${esc(c.n)}</h2><p>${esc(c.from)} → ${esc(c.to)} · HQ Dojo · ${esc(when)}</p></div></div>
      <div class="exam-score"><span>Marks</span><b class="num" id="exTotal"></b><span class="exam-of">of ${EXAM_MAX}</span></div>
    </div>
    ${gradeNoteCard(c)}
    ${done ? '' : `<div class="card white">
      <div class="card-h"><div><h2>Technique assessment</h2><div class="sub">Pick one band per criterion. Marks add up automatically.</div></div></div>
      ${rows}
    </div>`}
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
  const i = EX.sel, c = CANDIDATES[i], done = !!c.done, s = done ? {} : examScores(i);
  document.querySelectorAll('[data-band]').forEach(b => b.setAttribute('aria-pressed', s[b.dataset.band] === b.dataset.k));
  const total = done ? sentMarks(c) : examTotal(s), complete = done || examDone(s), res = done ? c.result : resultOf(total);
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

/* send one candidate's marks. The server adds them up and decides Pass / Retake / Fail; the page shows what it answered. */
async function submitExam() {
  const i = EX.sel, c = CANDIDATES[i], f = examFb(i), s = { ...examScores(i) }, btn = $('#exSubmit');
  btn.disabled = true;
  try {
    const marks = Object.fromEntries(EXAM_CRITERIA.map(k => [k.id, bandOf(s[k.id]).marks]));
    const r = await ASK.act.submitResult(EX.panel.id, c.userId, { scores: marks, well: f.well.trim(), toImprove: f.next.trim(), signature: true });
    Object.assign(c, { done: true, result: r.result, score: r.score, fb: { well: f.well.trim(), next: f.next.trim() } });
    setCount('grading', r.left);
    toast(`Result for ${c.n} sent to HQ`);
    renderExamQueue(); renderExamPanel();
  } catch (e) {
    ASK.errToast(e);
    if (e.code === 'GRADING_NOT_OPEN' || e.code === 'NOT_EXAMINER') setTimeout(() => location.replace('index.html?nograding'), 1500);
    else btn.disabled = false;
  }
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

function renderProfile() {
  const p = ASK.insProfile, me = ASK.me;
  /* the card in the page is a template: fill in the signed-in instructor */
  const card = $('#insCard');
  $('.ini', card).textContent = initials(p.name);
  $('.pcard-name', card).textContent = p.name;
  $('.pcard-rank', card).innerHTML = `<i></i>${esc(me.rank)}`;
  const info = $$('.icard-info li span', card);
  if (info[0]) info[0].textContent = `${me.rank} · Black belt`;
  if (info[1]) info[1].textContent = `Instructor ID · ASK-${p.id}`;
  profileCard(card);
  $('#pwBtn').addEventListener('click', () => ASK.openChangePassword());
  $('#forgotPw').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Reset your password</h3><p class="sub">We will email a reset link to the address registered to your instructor account.</p><div class="acts"><button class="sbtn dark" id="sendReset">Send reset link</button><button class="sbtn" data-close>Cancel</button></div>`);
    $('#sendReset').addEventListener('click', () => { closeModal(); toast('Reset link sent to your registered email'); });
  });
  const f = p.feedback, n = f.count, avg = f.avg, fb = FEEDBACK;
  $('#insStats').innerHTML = [
    ['Average rating', n ? `${avg.toFixed(1)} / 5` : '–'],
    ['Student ratings', n],
    ['Classes per week', p.stats.classesPerWeek],
    ['Average class fill', p.stats.fillPct === null ? '–' : `${p.stats.fillPct}%`]
  ].map(([l, v]) => `<div class="stat"><span>${l}</span><b class="num">${v}</b></div>`).join('');

  const counts = [5, 4, 3, 2, 1].map(r => ({ r, k: f.distribution[r] || 0 }));
  const topTags = f.tags.slice(0, 4);
  $('#fbSummary').innerHTML = n ? `
    <div class="fb-avg"><b class="num">${avg.toFixed(1)}</b>${stars(Math.round(avg))}<span>${plural(n, 'rating')}</span></div>
    <div class="fb-dist">${counts.map(({ r, k }) => `<div><span>${r} ★</span><div class="bar"><i style="width:${k / n * 100}%"></i></div><span class="num">${k}</span></div>`).join('')}</div>
    ${topTags.length ? `<div class="fb-tags"><span>Students most often praise</span>${topTags.map(t => `<em>${esc(t.tag)} · ${t.count}</em>`).join('')}</div>` : ''}`
    : '<p class="ag-empty">No ratings yet. Students rate a class after it ends.</p>';

  const written = fb.filter(x => x.note);
  $('#fbList').innerHTML = written.map(x => `<article class="fb-item">
      <div class="fb-top">${stars(x.rating)}<span class="fb-type ${toneOf(x.type)}">${esc(x.type)}</span><span>${dayName(x.date)} ${fmtShort(x.date)}</span></div>
      <p>${esc(x.note)}</p>
      ${x.tags.length ? `<div class="fb-chips">${x.tags.map(t => `<em>${esc(t)}</em>`).join('')}</div>` : ''}
    </article>`).join('') || '<p class="ag-empty">No written comments yet.</p>';
  $('#fbCount').textContent = `${written.length} written ${written.length === 1 ? 'comment' : 'comments'} · students stay anonymous`;
}

/* every instructor page first loads the student list and the profile figures (the bell counts "away" students and new ratings from them) */
const insReady = ALLOWED && !GATED ? Promise.all([ASK.load.students(), ASK.load.profile()]) : Promise.resolve();
insReady.catch(() => {});
const insPage = fn => async () => { try { await insReady; await fn(); } catch (e) { ASK.errToast(e); } };

runPage({
  profile: insPage(() => renderProfile()),
  today: insPage(async () => { await ensureRange(); initSchedule(); }),
  grading: insPage(async () => {
    let r;
    try { r = await ASK.load.grading(); } catch (e) { ASK.errToast(e); setTimeout(() => location.replace('index.html?nograding'), 1200); return; }
    EX.panel = r.session;
    $('#examSub').textContent = `Examiner panel · HQ Dojo · ${fmtDate(ASK.d(r.session.date))}. Score each candidate, then submit to HQ.`;
    EX.sel = CANDIDATES.findIndex(c => !c.done);
    if (EX.sel < 0 && CANDIDATES.length) EX.sel = 0;
    renderExamQueue(); renderExamPanel();
  })
});

// search boxes: each one filters only its own list
runPage({
  today() { filterList('#rosterSearch', '#roster'); },
  grading() { filterList('#candSearch', '#candQueue'); }
});
