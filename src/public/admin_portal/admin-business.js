'use strict';
/* AIKIDO SHINJU-KAI — admin-business.js  (office portal: Business Admin Overview, Closures, Insights, Revenue, Policies, Staff,
   Import issues, Reports, and Notifications for both roles)

   Loaded after admin-shell.js, admin-data-desk.js, admin-data-business.js and admin-desk.js (reuses iso, pill, cap1, run, memberLegacy, memberBtn).
   Every figure and every change goes through the API (ASK.load.ba*, ASK.act.ba*): the server works out the numbers, applies the rules and checks that the
   account is a Business Admin. Hiding a page or a button here is only a courtesy. Nothing is kept in the browser. */

/* ---------- small helpers ---------- */
const bzDay = d => DSHORT[d].charAt(0) + DSHORT[d].slice(1).toLowerCase();
const bzLabel = s => `${s.type} · ${bzDay(s.day)} ${timeLabel(s.time)}`;
const bzPct = n => Math.round(n * 100);
const bzBar = (label, pct, val) => `<div><span class="bl" title="${esc(label)}">${esc(label)}</span><span class="bt"><i data-w="${Math.max(0, Math.min(100, pct))}"></i></span><span class="bv">${val}</span></div>`;
const bzGrow = () => setTimeout(() => $$('.bars i[data-w]').forEach(i => { i.style.width = i.dataset.w + '%'; }), 150);
const bzStat = (cls, l, v, h, extra = '') => `<div class="stat ${cls}"><span class="l">${l}</span><span class="v">${v}</span><span class="h">${h}</span>${extra}</div>`;
const bzRow = (ic, t, d, btn) => `<div class="row"><span class="av navy">${icon(ic)}</span><div class="grow"><div class="t">${t}</div><div class="d">${d}</div></div>${btn}</div>`;
const bzNote = (t, warn) => `<div class="note${warn ? ' warn' : ''}"><svg class="ic"><use href="#i-info"/></svg><span>${t}</span></div>`;
const bzSetOpt = (sel, list, val) => { sel.innerHTML = list.map(([v, t]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(t)}</option>`).join(''); };
const bzChange = n => (n === null || n === undefined ? '' : `${n >= 0 ? '+' : ''}${n} pts`);

/* ---------- Overview (Business Admin home) ---------- */
const BZ_PERIOD = { month: 'this month', 30: 'in the last 30 days', 90: 'in the last 90 days', 365: 'in the last 12 months' };
let bzOvSeq = 0;
async function bzOverview() {
  const per = $('#baPeriod').value, n = ++bzOvSeq;
  const d = await run(() => ASK.load.baOverview(per));
  if (!d || n !== bzOvSeq) return;   // a newer period was chosen while this one loaded
  const s = d.stats, label = BZ_PERIOD[per];
  $('#baSub').textContent = `All centres · ${fmtDate(TODAY)}`;
  $('#baStats').innerHTML = bzStat('', 'Active members', s.activeMembers, `${s.totalMembers} members in total`)
    + bzStat('', 'New members', s.newMembers, `Joined ${label}`)
    + bzStat('', '90-day retention', s.retention === null ? '—' : s.retention + '%', s.retention === null ? 'No month of joiners is 90 days old yet' : 'Still training 90 days after joining')
    + bzStat('alert', 'Collected vs outstanding', money(s.collected), `${money(s.outstanding)} outstanding · collected ${label}`);
  $('#baCentres').innerHTML = d.centres.map(r => `<div class="row"><span class="av navy">${esc(r.short.slice(0, 2).toUpperCase())}</span><div class="grow"><div class="t">${esc(r.name)}</div><div class="d">Occupancy ${bzPct(r.occupancy)}% · ${r.classes} ${r.classes === 1 ? 'class' : 'classes'} · Outstanding ${money(r.outstanding)}${r.delta === null ? '' : ` · ${r.delta >= 0 ? 'Up' : 'Down'} ${Math.abs(r.delta)} pts on the 4 weeks before`}</div></div><a class="sbtn" href="insights.html?centre=${esc(r.id)}">Insights</a></div>`).join('')
    || '<p style="color:var(--muted)">No classes in the last 4 weeks.</p>';
  const w = d.waiting;
  $('#baWaiting').innerHTML = bzRow('shield', 'Exceptions to decide', `${plural(w.exceptions, 'item')} sent up by the front desk`, '<button class="sbtn" data-page-link="applications">Review</button>')
    + bzRow('card', 'Payment failures', `${plural(w.failedPayments, 'failed payment')} to look at`, '<button class="sbtn" data-page-link="revenue">Review</button>')
    + bzRow('upload', 'Import issues', `${plural(w.imports, 'row')} to match or dismiss`, '<button class="sbtn" data-page-link="imports">Review</button>')
    + bzRow('award', 'Promotion results', `${plural(w.promotions, 'result')} signed by examiners`, '<button class="sbtn" data-page-link="grading">Review</button>')
    + bzRow('bell', 'Follow-up outcomes', `${plural(w.followupOutcomes, 'student')} with a logged contact to review`, '<button class="sbtn" data-page-link="followups">Review</button>')
    + bzRow('flag', 'Low attendance flags', `${plural(w.declining, 'student')} not seen in ${w.declineDays}+ days`, '<button class="sbtn" data-page-link="followups">View</button>');
  const q = d.questions, iv = q.intervention;
  const card = (title, v, h, tab) => bzStat('', title, v, h, `<a class="sbtn" href="insights.html?tab=${tab}" style="justify-self:start;margin-top:8px">Explore</a>`);
  $('#baQuestions').innerHTML = card('Should we open another class here?', q.fullClasses, 'classes are 85% full or more', 'capacity')
    + card('Why are newcomers leaving?', q.leftAfter90 === null ? '—' : q.leftAfter90 + '%', q.leftAfter90 === null ? 'no month of joiners is 90 days old yet' : 'of new members were gone after 90 days', 'retention')
    + card('Which classes need attention?', q.lowClasses, 'classes are under half full', 'attention')
    + card('Did an intervention work?', iv ? `${iv.change >= 0 ? '+' : ''}${iv.change}%` : '—', iv ? `${esc(iv.name)}: ${iv.before} to ${iv.after} a week` : 'No intervention logged yet', 'interventions');
}

/* ---------- Closures (Business Admin, Classes page) ---------- */
const CL = { list: null, seq: 0 };
const clDay = v => new Date(v + 'T00:00:00');
/* what the form asks the server to preview or save: { dojoId, from, to } for HQ dates, { lessonId } for one class. err = a message to show. */
function clForm() {
  const scope = radio('clscope'), from = $('#cl-from').value, to = $('#cl-to').value, out = { scope, err: '' };
  if (!from) { out.err = scope === 'HQ' ? 'Pick the first day.' : 'Pick the day.'; return out; }
  if (from < iso(TODAY)) { out.err = 'A closure starts today or later.'; return out; }
  if (scope === 'HQ') {
    const end = to || from;
    if (end < from) { out.err = 'The last day is before the first day.'; return out; }
    if (daysBetween(clDay(from), clDay(end)) + 1 > 60) { out.err = 'Close at most 60 days at a time.'; return out; }
    out.query = { dojoId: HQ, from, to: end };
  } else {
    const lessonId = $('#cl-cls').value;
    if (!lessonId) { out.err = 'There is no HQ class left to cancel on that day.'; return out; }
    out.query = { lessonId };
  }
  return out;
}
async function clPreview() {
  const c = clForm(), box = $('#clAffected'), btn = $('#clSave'), n = ++CL.seq;
  const warn = text => { box.className = 'note warn'; box.innerHTML = `<svg class="ic"><use href="#i-info"/></svg><span>${esc(text)}</span>`; };
  btn.disabled = true;
  if (c.err) { warn(c.err); return c; }
  let p;
  try { p = await ASK.load.baClosurePreview(c.query); } catch (e) { if (n === CL.seq) warn(e.message); return Object.assign(c, { err: e.message }); }
  if (n !== CL.seq) return c;
  const people = p.people.map(x => `${x.name} (${x.class}${x.date ? ', ' + fmtShort(clDay(x.date)) : ''})`);
  box.className = 'note';
  box.innerHTML = `<svg class="ic"><use href="#i-info"/></svg><span id="clAffText"><b>${plural(p.students, 'student')} booked on ${plural(p.classes, 'class')}.</b> Their lessons are returned and they get a notice.${people.length ? `<span class="sub-note" style="margin-top:6px">${esc(people.slice(0, 8).join(', '))}${p.students > 8 ? ` and ${p.students - 8} more` : ''}</span>` : ''}</span>`;
  btn.disabled = !p.classes;
  if (!p.classes) warn('There is no class to cancel in that range.');
  return Object.assign(c, { preview: p });
}
async function clLoad() {
  const r = await run(() => ASK.load.baClosures());
  if (r) { CL.list = r; clList(); }
}
function clList() {
  const L = CL.list || { closures: [], cancelledClasses: [] };
  const when = (a, b) => (a === b ? fmtDate(clDay(a)) : `${fmtShort(clDay(a))} to ${fmtDate(clDay(b))}`);
  const counts = x => (x.students ? ` · ${plural(x.students, 'student')} · ${plural(x.lessons, 'lesson')} returned` : '');
  const rows = L.closures.map(c => ({ at: c.from, html: `<div class="row"><span class="av navy">${icon('cal')}</span><div class="grow"><div class="t">${esc(c.scope === 'HQ' ? 'HQ' : c.dojoName)} closed · ${when(c.from, c.to)}</div><div class="d">${esc(c.note || 'No reason given')}${counts(c)}</div></div><button class="sbtn ghost" data-clrm="${esc(c.id)}" aria-label="Remove closure">${icon('trash')}</button></div>` }))
    .concat(L.cancelledClasses.map(c => ({ at: c.date, html: `<div class="row"><span class="av navy">${icon('cal')}</span><div class="grow"><div class="t">${esc(c.label)} cancelled · ${fmtDate(clDay(c.date))}</div><div class="d">${esc(c.dojoName)}${counts(c)}</div></div></div>` })))
    .sort((a, b) => b.at.localeCompare(a.at));
  $('#clList').innerHTML = rows.map(r => r.html).join('') || '<p style="color:var(--muted)">No closures or cancellations.</p>';
}
async function clClasses() {
  const v = $('#cl-from').value, sel = $('#cl-cls');
  let list = [];
  if (v) { const r = await run(() => ASK.load.deskClasses(v, v)); list = r ? r.sessions.filter(s => s.state !== 'Cancelled' && s.state !== 'Done') : []; }
  sel.innerHTML = list.map(c => `<option value="${esc(c.lessonId)}">${esc(c.type)} · ${timeLabel(c.time)}</option>`).join('') || '<option value="">No class on this day</option>';
}
function clInit() {
  if (!$('#clForm')) return;
  $('#cl-from').min = iso(TODAY); $('#cl-to').min = iso(TODAY);
  const sync = async () => {
    const one = radio('clscope') === 'class';
    $('#clToBox').hidden = one; $('#clClsBox').hidden = !one;
    $('#clFromL').textContent = one ? 'Date' : 'From';
    $('#clSave').textContent = one ? 'Cancel class and return lessons' : 'Close HQ and return lessons';
    if (one) await clClasses();
    clPreview();
  };
  $('#clScope').addEventListener('change', sync);
  ['#cl-from', '#cl-to', '#cl-cls'].forEach(s => $(s).addEventListener('change', async () => { if (s === '#cl-from' && radio('clscope') === 'class') await clClasses(); clPreview(); }));
  $('#clForm').addEventListener('submit', async e => {
    e.preventDefault();
    const c = await clPreview(); if (c.err) return toast(c.err, 'bad');
    const note = $('#cl-note').value.trim(), btn = $('#clSave');
    btn.disabled = true;
    const done = await run(() => c.scope === 'HQ' ? ASK.act.baClosureCreate({ dojoId: HQ, from: c.query.from, to: c.query.to, note: note || undefined }) : ASK.act.baClassCancel(c.query.lessonId, note));
    if (!done) { btn.disabled = false; return; }
    $('#cl-note').value = '';
    await clLoad(); if (typeof loadWeek === 'function') loadWeek();
    clPreview();
    toast(`${c.scope === 'HQ' ? 'HQ closed' : 'Class cancelled'}. ${plural(done.lessons, 'lesson')} returned, ${plural(done.students, 'student')} notified.`);
  });
  $('#clList').addEventListener('click', async e => {
    const b = e.target.closest('[data-clrm]'); if (!b) return;
    const r = await run(() => ASK.act.baClosureDelete(b.dataset.clrm)); if (!r) return;
    await clLoad(); if (typeof loadWeek === 'function') loadWeek();
    toast(`Removed. ${plural(r.reopened, 'class')} open again. Lessons that were returned stay returned.`, 'info');
  });
  sync(); clLoad();
}

/* ---------- Insights ---------- */
const INS = { tab: 'centres', period: '3m', cmp: 'prev', centre: 'all', type: 'all', slot: 'all', age: 'all', belt: 'all', data: null, typesSet: false, seq: 0 };
const INS_PERIOD = [['4w', 'Last 4 weeks'], ['3m', 'Last 3 months'], ['12m', 'Last 12 months']];
const INS_CMP = [['prev', 'Previous period'], ['year', 'Same period last year'], ['none', 'No comparison']];
const INS_SLOT = [['all', 'All times'], ['am', 'Morning (before 12)'], ['pm', 'Afternoon (12 to 5)'], ['eve', 'Evening (after 5)']];
const INS_AGE = [['all', 'All ages'], ['kids', 'Children'], ['adult', 'Adults']];
const INS_BELT = [['all', 'All belts'], ['beg', '6th to 5th Kyu'], ['mid', '4th to 3rd Kyu'], ['adv', '2nd Kyu and above']];
const insHead = (t, sub) => `<div class="card-h"><div><h3>${t}</h3>${sub ? `<span class="sub">${sub}</span>` : ''}</div></div>`;
const insDelta = d => (INS.cmp === 'none' || d === null || d === undefined ? '—' : `${bzChange(d)} vs ${INS.cmp === 'prev' ? 'previous period' : 'last year'}`);
const insSlots = () => (INS.data ? INS.data.slots : []);
const bzSlotRate = s => (s.rating === null || s.rating === undefined ? null : s.rating);

function insCentres() {
  const d = INS.data, rows = d.centres, classes = insSlots().slice().sort((a, b) => b.occupancy - a.occupancy), shown = classes.slice(0, 12);
  return `<div class="card white">${insHead('Centres', 'Average occupancy of the dated classes in the period')}
      <div class="bars">${rows.map(r => bzBar(r.name, bzPct(r.occupancy), bzPct(r.occupancy) + '%')).join('') || '<p style="color:var(--muted)">No classes match these filters.</p>'}</div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Centre</th><th>Classes</th><th>Occupancy</th><th>Members</th><th>Change</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td class="num">${r.classes}</td><td class="num">${bzPct(r.occupancy)}%</td><td class="num">${r.members}</td><td>${esc(insDelta(r.delta))}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card white">${insHead('Classes', `The ${shown.length} fullest of ${classes.length} weekly classes`)}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Class</th><th>Centre</th><th>Instructor</th><th>Average booked</th><th>Occupancy</th><th>Rating</th></tr></thead><tbody>${shown.map(s => { const r = bzSlotRate(s); return `<tr><td><b>${esc(bzLabel(s))}</b></td><td>${esc(s.dojoName)}</td><td>${esc(s.ins)}</td><td class="num">${s.booked}/${s.cap}</td><td class="num">${bzPct(s.occupancy)}%</td><td class="num">${r ? r.toFixed(1) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="6" style="color:var(--muted)">No classes match these filters.</td></tr>'}</tbody></table></div></div>`;
}
function insCapacity() {
  const ss = insSlots().filter(s => s.sessions).sort((a, b) => b.occupancy - a.occupancy), sig = s => s.occupancy >= .85 ? pill('warn', 'Near full') : s.occupancy < .5 ? pill('plain', 'Room to fill') : pill('ok', 'Healthy');
  return `<div class="card white">${insHead('Capacity', 'Classes that are nearly full may need another slot. Try a pilot slot first, then follow it under Interventions.')}
      <div class="acts-inline" style="margin-bottom:12px"><button class="sbtn dark" id="planPilot">${icon('plus')}Plan a pilot slot</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Class</th><th>Centre</th><th>Average booked</th><th>Occupancy</th><th>Signal</th></tr></thead><tbody>${ss.slice(0, 14).map(s => `<tr><td><b>${esc(bzLabel(s))}</b></td><td>${esc(s.dojoName)}</td><td class="num">${s.booked}/${s.cap}</td><td class="num">${bzPct(s.occupancy)}%</td><td>${sig(s)}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No classes match these filters.</td></tr>'}</tbody></table></div></div>`;
}
function insAttention() {
  const list = insSlots().filter(s => s.sessions && (s.occupancy < .5 || (bzSlotRate(s) !== null && s.rating < 4))).sort((a, b) => a.occupancy - b.occupancy), shown = list.slice(0, 40);
  return `<div class="note warn" id="attBanner"><svg class="ic"><use href="#i-info"/></svg><span><b>Investigate first.</b> Talk to the instructor and the members before changing the schedule. A class is never cancelled automatically because of these numbers.</span></div>
    <div class="card white">${insHead('Classes that need attention', `Under half full, or rated below 4${list.length > shown.length ? ` · the ${shown.length} emptiest of ${list.length}` : ''}`)}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Class</th><th>Centre</th><th>Occupancy</th><th>Rating</th><th>Why flagged</th><th>First step</th></tr></thead><tbody>${shown.map(s => { const lo = s.occupancy < .5, lr = bzSlotRate(s) !== null && s.rating < 4; return `<tr><td><b>${esc(bzLabel(s))}</b></td><td>${esc(s.dojoName)}</td><td class="num">${bzPct(s.occupancy)}%</td><td class="num">${s.rating ? s.rating.toFixed(1) : '—'}</td><td>${lo && lr ? 'Under half full and low rating' : lo ? 'Under half full' : 'Rating below 4'}</td><td>${lr ? 'Read the class feedback and speak to the instructor' : 'Ask members and the instructor about the time slot'}</td></tr>`; }).join('') || '<tr><td colspan="6" style="color:var(--muted)">Nothing needs attention with these filters.</td></tr>'}</tbody></table></div></div>`;
}
function insRetention() {
  const d = INS.data, n = { '4w': 3, '3m': 6, '12m': 12 }[INS.period], co = d.cohorts.slice(-n), risk = d.risk;
  const pctOf = c => Math.round(c.kept / c.joined * 100);
  return `<div class="card white">${insHead('90-day retention', 'Members who joined each month and were still training 90 days later')}
      <div class="bars">${co.map(c => c.kept === null ? bzBar(`${c.label} · ${c.joined} joined`, 0, 'Not yet') : bzBar(`${c.label} · ${c.joined} joined`, pctOf(c), pctOf(c) + '%')).join('') || '<p style="color:var(--muted)">No members joined in these months.</p>'}</div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Joined in</th><th>Joined</th><th>Still training</th><th>Retention</th></tr></thead><tbody>${co.map(c => `<tr><td><b>${esc(c.label)}</b></td><td class="num">${c.joined}</td><td class="num">${c.kept === null ? '—' : c.kept}</td><td>${c.kept === null ? 'Less than 90 days' : pctOf(c) + '%'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="g2"><div class="card white">${insHead('Members at risk', 'From the member list with these filters')}<div class="kv" style="margin:0"><div><span>Lapsed</span><span>${risk.lapsed}</span></div><div><span>Not seen in ${risk.declineDays}+ days</span><span>${risk.notSeen}</span></div><div><span>Expiring within 14 days</span><span>${risk.expiring}</span></div></div></div>
    <div class="card white">${insHead('Why newcomers leave', 'Reasons the front desk wrote down')}<div class="rows">${d.reasons.map(r => `<div class="row"><span class="av">${initials(r.name)}</span><div class="grow"><div class="t">${esc(r.name)}</div><div class="d">${esc(r.note || 'No reason written')}</div></div></div>`).join('') || '<p style="color:var(--muted)">No reasons logged yet. The front desk writes one when someone says they are not returning.</p>'}</div></div></div>`;
}
function insExperience() {
  const x = INS.data.experience, hq = INS.centre === 'all' || INS.centre === HQ;
  return `<div class="card white">${insHead('Experience and teaching', hq ? 'Anonymous class ratings from students' : 'Ratings are collected at HQ only')}
      <div class="bars">${x.byType.map(t => bzBar(t.type, Math.round(t.avg / 5 * 100), t.avg.toFixed(1))).join('') || '<p style="color:var(--muted)">No ratings for these filters.</p>'}</div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Instructor</th><th>Responses</th><th>Average rating</th><th>Most common praise</th></tr></thead><tbody>${x.byInstructor.map(r => `<tr><td><b>${esc(r.ins)}</b></td><td class="num">${r.n}</td><td class="num">${r.avg.toFixed(1)}</td><td>${esc(r.tag)}</td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted)">No ratings for these filters.</td></tr>'}</tbody></table></div></div>`;
}
function insInterventions() {
  const L = INS.data.interventions;
  return `<div class="card white">${insHead('Interventions', 'A change tried at a centre, with attendance before and after')}
      <div class="acts-inline" style="margin-bottom:12px"><button class="sbtn dark" id="ivNew">${icon('plus')}Log an intervention</button></div>
      <div class="rows" id="ivRows">${L.map(x => `<div class="row"><span class="av navy">${icon('chart')}</span><div class="grow"><div class="t">${esc(x.name)}</div><div class="d">${esc(x.slot)} · started ${fmtShort(ASK.d(x.start))} · ${x.before} a week before, ${x.after} after (${x.change >= 0 ? '+' : ''}${x.change}%)</div></div><div class="acts-inline"><span class="pill ${x.decision === 'continue' ? 'ok' : x.decision === 'stop' ? 'bad' : 'warn'}">${cap1(x.decision)}</span>${['continue', 'adjust', 'stop'].filter(d => d !== x.decision).map(d => `<button class="sbtn" data-iv="${esc(x.id)}" data-d="${d}">${cap1(d)}</button>`).join('')}</div></div>`).join('') || '<p style="color:var(--muted)">Nothing logged yet.</p>'}</div></div>`;
}
const INS_TABS = { centres: insCentres, capacity: insCapacity, attention: insAttention, retention: insRetention, experience: insExperience, interventions: insInterventions };
function insRender() {
  $$('#insTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.it === INS.tab));
  if (!INS.data) return;
  $('#insBody').innerHTML = INS_TABS[INS.tab]();
  bzGrow();
}
async function insLoad() {
  const n = ++INS.seq;
  const d = await run(() => ASK.load.baInsights({ period: INS.period, cmp: INS.cmp, centre: INS.centre, type: INS.type, slot: INS.slot, age: INS.age, belt: INS.belt }));
  if (!d || n !== INS.seq) return;
  INS.data = d;
  if (!INS.typesSet) { bzSetOpt($('#f-type'), [['all', 'All class types']].concat(d.types.map(t => [t, t])), INS.type); INS.typesSet = true; }
  insRender();
}
/* a pilot slot: the fullest class, copied to a free time on the other mat */
function insPilotPreset() {
  const ss = insSlots().length ? insSlots() : [], top = ss.slice().sort((a, b) => b.occupancy - a.occupancy)[0];
  if (!top) return { pilot: true };
  const taken = ss.filter(x => x.dojoId === top.dojoId && x.day === top.day).map(x => sesMins(x.time));
  const free = t => taken.every(m => Math.abs(m - sesMins(t)) >= 60);
  return { type: top.type, day: top.day, dojoId: top.dojoId, instructorId: top.instructorId, cap: top.cap, mat: 'Mat B', time: TIMES.find(free) || top.time, pilot: true };
}
function insLogModal() {
  openModal(`<h3 id="modalTitle">Log an intervention</h3><p class="sub">Write down a change you tried and the attendance before and after it.</p>
    <form id="ivForm" class="grid2" style="margin-top:16px" novalidate>
      <div class="fld full"><label for="iv-name">What was tried</label><input id="iv-name" maxlength="80" placeholder="e.g. Extra beginner slot on Saturday"></div>
      <div class="fld"><label for="iv-slot">Class or slot</label><input id="iv-slot" maxlength="40" placeholder="e.g. Sat 10 AM"></div>
      <div class="fld"><label for="iv-dec">Decision</label><select id="iv-dec"><option value="continue">Continue</option><option value="adjust">Adjust</option><option value="stop">Stop</option></select></div>
      <div class="fld"><label for="iv-before">Students a week before</label><input id="iv-before" type="number" min="0" value="0"></div>
      <div class="fld"><label for="iv-after">Students a week after</label><input id="iv-after" type="number" min="0" value="0"></div>
      <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}Save</button></div></form>`, true);
  $('#ivForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#iv-name').value.trim(), slot = $('#iv-slot').value.trim();
    if (!name || !slot) return toast('Add what was tried and the class or slot.', 'bad');
    const body = { name, slot, before: Math.max(0, Math.round(+$('#iv-before').value || 0)), after: Math.max(0, Math.round(+$('#iv-after').value || 0)), decision: $('#iv-dec').value };
    if (!(await run(() => ASK.act.baIntervention(body)))) return;
    closeModal(); await insLoad(); toast('Intervention logged.');
  });
}
function insInit() {
  const q = new URLSearchParams(location.search);
  if (INS_TABS[q.get('tab')]) INS.tab = q.get('tab');
  if (q.get('centre') && DOJOS.some(d => d.id === q.get('centre'))) INS.centre = q.get('centre');
  bzSetOpt($('#f-period'), INS_PERIOD, INS.period); bzSetOpt($('#f-cmp'), INS_CMP, INS.cmp);
  bzSetOpt($('#f-centre'), [['all', 'All centres']].concat(DOJOS.map(d => [d.id, d.name])), INS.centre);
  bzSetOpt($('#f-type'), [['all', 'All class types']], INS.type); bzSetOpt($('#f-slot'), INS_SLOT, INS.slot); bzSetOpt($('#f-age'), INS_AGE, INS.age); bzSetOpt($('#f-belt'), INS_BELT, INS.belt);
  [['period', 'f-period'], ['cmp', 'f-cmp'], ['centre', 'f-centre'], ['type', 'f-type'], ['slot', 'f-slot'], ['age', 'f-age'], ['belt', 'f-belt']].forEach(([k, id]) => $('#' + id).addEventListener('change', e => { INS[k] = e.target.value; insLoad(); }));
  $('#insTabs').addEventListener('click', e => { const b = e.target.closest('[data-it]'); if (b) { INS.tab = b.dataset.it; insRender(); } });
  $('#insBody').addEventListener('click', async e => {
    if (e.target.closest('#planPilot')) return openSessionForm(undefined, insPilotPreset(), () => { toast('Pilot slot created. Log it under Interventions to follow it.'); insLoad(); });
    if (e.target.closest('#ivNew')) return insLogModal();
    const d = e.target.closest('[data-iv]');
    if (d) { const r = await run(() => ASK.act.baInterventionDecision(d.dataset.iv, d.dataset.d)); if (r) { await insLoad(); toast(`Decision: ${r.intervention.decision}.`); } }
  });
  return insLoad();
}

/* ---------- Revenue ---------- */
const REV = { data: null };
function revDraw() {
  const d = REV.data, ym = ASK.d(d.from);
  $('#revSub').textContent = `Payments received in ${MON[ym.getMonth()]} ${ym.getFullYear()} through Stripe.`;
  $('#revStats').innerHTML = `<div class="stat dark"><span class="l">Received this month</span><span class="v" id="revTotal">${money(d.total)}</span><span class="h">${plural(d.count, 'paid payment')}</span></div>`
    + bzStat('', 'Outstanding', money(d.outstanding.amount), 'Not yet paid') + bzStat('alert', 'Failed payments', d.failed.count, `${money(d.failed.amount)} declined by Stripe`);
  $('#revBars').innerHTML = d.items.map(g => bzBar(g.group, d.total ? Math.round(g.amount / d.total * 100) : 0, money(g.amount))).join('') || '<p style="color:var(--muted)">No payments this month.</p>';
  $('#revItems').innerHTML = d.items.map(g => `<tr><td><b>${esc(g.group)}</b></td><td class="num">${g.count}</td><td class="num">${money(g.amount)}</td></tr>`).join('') + `<tr><td><b>Total</b></td><td class="num">${d.count}</td><td class="num"><b>${money(d.total)}</b></td></tr>`;
  $('#revFailed').innerHTML = d.failed.rows.map(l => `<div class="row"><span class="av">${initials(l.name)}</span><div class="grow"><div class="t">${esc(l.name)}</div><div class="d">${esc(l.item)} · ${money(l.amount)} · ${fmtShort(new Date(l.date))} · ${l.channel === 'auto' ? 'Auto-billing' : 'Online'}</div></div><a class="sbtn" href="member.html?no=${encodeURIComponent(l.memberNo)}">Open member</a></div>`).join('') || '<p style="color:var(--muted)">No failed payments.</p>';
}
async function revInit() {
  $('#revExport').addEventListener('click', () => { if (REV.data) run(() => ASK.baCsv('payments', { from: REV.data.from, to: REV.data.to })); });
  const d = await run(() => ASK.load.baRevenue({}));
  if (d) { REV.data = d; revDraw(); }
}

/* ---------- Policies ---------- */
const polUI = { tab: 'prices', data: null };
const polNum = (sel, min, max) => { const v = +$(sel).value; return $(sel).value !== '' && isFinite(v) && v >= min && v <= max ? v : null; };
/* every save shows what changes and who it reaches before it is applied. apply() sends the changes to the server. */
function polConfirm(title, lines, impact, apply) {
  if (!lines.length) return toast('Nothing changed.', 'info');
  openModal(`<h3 id="modalTitle">Apply these changes?</h3><p class="sub">${esc(title)}</p><div class="kv" style="margin-top:14px">${lines.map(l => `<div><span>${esc(l[0])}</span><span>${esc(l[1])}</span></div>`).join('')}</div><div class="note" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span id="polImpact">${impact}</span></div><div class="acts"><button class="sbtn dark" id="polGo">Apply changes</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#polGo').addEventListener('click', async () => {
    $('#polGo').disabled = true;
    if (!(await run(async () => { await apply(); return true; }))) { $('#polGo').disabled = false; await polLoad(); return; }
    closeModal(); await polLoad(); toast('Policy saved.');
  });
}
async function polLoad() {
  const d = await run(() => ASK.load.baPolicies({}));
  if (d) { polUI.data = d; polRender(); }
}
function polRender() {
  $$('#polTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.pt === polUI.tab));
  const P = polUI.data, box = $('#polBody'), head = (t, s) => `<div class="card-h"><div><h3>${t}</h3><span class="sub">${s}</span></div></div>`;
  if (!P) return;
  if (polUI.tab === 'prices') {
    box.innerHTML = `${head('Packages and prices', 'The desk and online checkout read these prices. Discounts are worked out from date of birth.')}
      <form id="polForm" class="grid2" novalidate>
        <div class="fld"><label for="p-reg">Registration fee (S$)</label><input id="p-reg" type="number" min="0" step="0.01" value="${P.registration}"></div>
        <div class="fld"><label for="p-dues">Annual dues (S$)</label><input id="p-dues" type="number" min="0" step="0.01" value="${P.annualDues}"></div>
        ${P.packages.map(k => `<div class="fld"><label for="pk-${esc(k.id)}">${esc(k.name)} (S$)</label><input id="pk-${esc(k.id)}" class="p-pkg" data-id="${esc(k.id)}" type="number" min="0" step="0.01" value="${k.amt}"></div>`).join('')}
        <div class="fld full"><span class="hint">Discounts: ${P.discounts.senior.age} and over ${P.discounts.senior.pct}% off. Ages ${P.discounts.student.from} to ${P.discounts.student.to} and NSFs ${P.discounts.student.pct}% off.</span></div>
        <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}Review and save</button></div></form>`;
  } else if (polUI.tab === 'booking') {
    const b = P.booking;
    box.innerHTML = `${head('Booking rules', 'How far ahead students may book, and when a cancelled lesson comes back.')}
      <form id="polForm" class="grid2" novalidate>
        <div class="fld"><label for="b-ahead">Book up to (months ahead)</label><input id="b-ahead" type="number" min="1" max="6" value="${b.aheadMonths}"></div>
        <div class="fld"><label for="b-min">Online booking notice (days)</label><input id="b-min" type="number" min="0" max="14" value="${b.minDays}"></div>
        <div class="fld"><label for="b-cancel">Lesson returned when cancelled this many hours before</label><input id="b-cancel" type="number" min="0" max="72" value="${b.cancelHours}"></div>
        <div class="fld"><label for="b-max">Packages a student can hold at once</label><input id="b-max" type="number" min="1" max="5" value="${b.maxPackages}"></div>
        <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}Review and save</button></div></form>`;
  } else if (polUI.tab === 'activation') {
    box.innerHTML = `${head('Auto-activation rules', 'The front desk can press Activate only when every rule switched on here passes.')}
      <form id="polForm" novalidate><div class="rows">${P.autoActivation.map(r => `<label class="check" style="padding:10px 0"><input type="checkbox" class="p-act" data-id="${esc(r.id)}"${r.on ? ' checked' : ''}><span>${esc(r.text)}</span></label>`).join('')}</div>
        <div style="margin-top:14px"><button class="sbtn dark" type="submit">${icon('check')}Review and save</button></div></form>`;
  } else if (polUI.tab === 'methods') {
    box.innerHTML = `${head('Approved payment methods', 'Payments are taken through Stripe only.')}
      <div class="rows"><div class="row"><span class="av navy">${icon('card')}</span><div class="grow"><div class="t">Stripe</div><div class="d">Cards online, and a card at the desk. Used for packages, dues, registration and grading fees.</div></div><span class="pill ok">Approved</span></div></div>
      ${bzNote('Cash, bank transfer and QR codes are not approved. No other method can be added here.')}`;
  } else if (polUI.tab === 'templates') {
    box.innerHTML = `${head('Notification templates', 'The front desk can only send these. Business Admins can also write their own message.')}
      <form id="polForm" novalidate><div style="display:grid;gap:14px">${P.templates.map(t => `<div class="fld"><label for="t-n-${esc(t.id)}">Template name</label><input id="t-n-${esc(t.id)}" class="p-tn" data-id="${esc(t.id)}" maxlength="60" value="${esc(t.name)}"><label for="t-t-${esc(t.id)}" style="margin-top:8px">Message</label><textarea id="t-t-${esc(t.id)}" class="p-tt" data-id="${esc(t.id)}" maxlength="240">${esc(t.text)}</textarea></div>`).join('')}
        <div class="fld"><label for="t-n-new">New template name</label><input id="t-n-new" maxlength="60" placeholder="Leave empty to skip"><label for="t-t-new" style="margin-top:8px">New template message</label><textarea id="t-t-new" maxlength="240"></textarea></div></div>
        <div style="margin-top:14px"><button class="sbtn dark" type="submit">${icon('check')}Review and save</button></div></form>`;
  } else {
    const t = P.followTriggers;
    box.innerHTML = `${head('Follow-up triggers', 'When a student appears on the Follow-ups lists.')}
      <form id="polForm" class="grid2" novalidate>
        <div class="fld"><label for="t-dec">Declining attendance: not seen for (days)</label><input id="t-dec" type="number" min="1" max="90" value="${t.declineDays}"></div>
        <div class="fld"><label for="t-ren">Renewal coming up: expires within (days)</label><input id="t-ren" type="number" min="1" max="90" value="${t.renewalDays}"></div>
        <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}Review and save</button></div></form>`;
  }
  enhance(box);
  const f = $('#polForm'); if (f) f.addEventListener('submit', e => { e.preventDefault(); polSave(); });
}
async function polSave() {
  const P = polUI.data, T = polUI.tab, L = [];
  if (T === 'prices') {
    const reg = polNum('#p-reg', 0, 5000), dues = polNum('#p-dues', 0, 5000), pk = $$('.p-pkg').map(i => ({ id: i.dataset.id, amt: i.value !== '' && +i.value >= 0 && +i.value <= 5000 ? +i.value : null }));
    if (reg == null || dues == null || pk.some(p => p.amt == null)) return toast('Enter a price of zero or more for every item.', 'bad');
    if (reg !== P.registration) L.push(['Registration fee', `${money(P.registration)} to ${money(reg)}`]);
    if (dues !== P.annualDues) L.push(['Annual dues', `${money(P.annualDues)} to ${money(dues)}`]);
    const changed = pk.filter(p => { const o = P.packages.find(x => x.id === p.id); return o && o.amt !== p.amt; });
    changed.forEach(p => { const o = P.packages.find(x => x.id === p.id); L.push([o.name, `${money(o.amt)} to ${money(p.amt)}`]); });
    return polConfirm('Packages and prices', L, 'Take payment and registration use the new prices straight away. Payments already recorded keep the price they were taken at.', async () => {
      const fees = {}; if (reg !== P.registration) fees.registration_fee = reg; if (dues !== P.annualDues) fees.annual_dues = dues;
      if (Object.keys(fees).length) await ASK.act.baPolicies(fees);
      for (const p of changed) await ASK.act.baPackage(p.id, { price: p.amt });
    });
  }
  if (T === 'booking') {
    const v = { aheadMonths: polNum('#b-ahead', 1, 6), minDays: polNum('#b-min', 0, 14), cancelHours: polNum('#b-cancel', 0, 72), maxPackages: polNum('#b-max', 1, 5) }, o = P.booking;
    if (Object.values(v).some(x => x == null || !Number.isInteger(x))) return toast('Enter whole numbers inside the allowed range.', 'bad');
    const nm = { aheadMonths: 'Months ahead', minDays: 'Online notice (days)', cancelHours: 'Lesson returned (hours before)', maxPackages: 'Packages at once' };
    const key = { aheadMonths: 'booking_ahead_months', minDays: 'booking_min_days', cancelHours: 'cancel_hours', maxPackages: 'max_packages' }, body = {};
    Object.keys(v).forEach(k => { if (v[k] !== o[k]) { L.push([nm[k], `${o[k]} to ${v[k]}`]); body[key[k]] = v[k]; } });
    return polConfirm('Booking rules', L, `New bookings and cancellations follow these rules from now on. ${plural(P.impact.upcomingBookings, 'booking')} already made are not changed.`, () => ASK.act.baPolicies(body));
  }
  if (T === 'activation') {
    const on = {}; $$('.p-act').forEach(c => { on[c.dataset.id] = c.checked; });
    const changed = P.autoActivation.filter(r => on[r.id] !== r.on);
    changed.forEach(r => L.push([r.text, on[r.id] ? 'Off to on' : 'On to off']));
    return polConfirm('Auto-activation rules', L, `${plural(P.impact.waitingApplications, 'waiting registration')} will be checked again against the new rules. A rule switched off no longer blocks Activate.`, async () => { for (const r of changed) await ASK.act.baRule(r.id, on[r.id]); });
  }
  if (T === 'templates') {
    const edits = $$('.p-tn').map(i => ({ id: i.dataset.id, name: i.value.trim(), text: $(`.p-tt[data-id="${i.dataset.id}"]`).value.trim() }));
    if (edits.some(x => !x.name || !x.text)) return toast('Every template needs a name and a message.', 'bad');
    const nn = $('#t-n-new').value.trim(), nt = $('#t-t-new').value.trim();
    if (!!nn !== !!nt) return toast('A new template needs both a name and a message.', 'bad');
    const changed = edits.filter(x => { const o = P.templates.find(t => t.id === x.id); return o && (o.name !== x.name || o.text !== x.text); });
    changed.forEach(x => L.push(['Edited template', x.name]));
    if (nn) L.push(['New template', nn]);
    return polConfirm('Notification templates', L, 'The front desk sees the new wording in Notifications straight away. Messages already sent are not changed.', async () => {
      for (const x of changed) await ASK.act.baTemplateUpdate(x.id, { name: x.name, text: x.text });
      if (nn) await ASK.act.baTemplateCreate({ name: nn, text: nt });
    });
  }
  if (T === 'triggers') {
    const dec = polNum('#t-dec', 1, 90), ren = polNum('#t-ren', 1, 90), o = P.followTriggers;
    if (dec == null || ren == null || !Number.isInteger(dec) || !Number.isInteger(ren)) return toast('Enter a number of days from 1 to 90.', 'bad');
    const body = {};
    if (dec !== o.declineDays) { L.push(['Declining attendance', `${o.declineDays} to ${dec} days`]); body.follow_decline_days = dec; }
    if (ren !== o.renewalDays) { L.push(['Renewal coming up', `${o.renewalDays} to ${ren} days`]); body.follow_renewal_days = ren; }
    const imp = await run(() => ASK.load.baPolicies({ declineDays: dec }));
    return polConfirm('Follow-up triggers', L, `With ${dec} days, ${plural(imp ? imp.impact.decliningNow : 0, 'active member')} would be on the declining attendance list.`, () => ASK.act.baPolicies(body));
  }
}

/* ---------- Staff ---------- */
const STAFF_ROLE = { business: 'Business Admin', frontdesk: 'Front desk', instructor: 'Instructor' };
const STF = { rows: [], activeBA: 0 };
const stfLastBA = s => s.type === 'business' && s.status === 'active' && STF.activeBA <= 1;
const stfWhen = s => (s.last ? fmtDate(new Date(s.last)) : 'Never');
function stfRender() {
  $('#stfRows').innerHTML = STF.rows.map(s => `<tr><td><div class="who"><span class="av">${initials(s.name)}</span><div><b>${esc(s.name)}</b>${s.you ? '<span class="num">You</span>' : ''}</div></div></td><td class="num">${esc(s.id)}</td><td>${STAFF_ROLE[s.type]}</td><td>${pill(s.status === 'active' ? 'ok' : 'bad', s.status === 'active' ? 'Active' : 'Deactivated')}</td><td>${stfWhen(s)}</td><td><button class="sbtn" data-stf="${esc(s.id)}">Manage</button></td></tr>`).join('');
}
async function stfLoad() {
  const r = await run(() => ASK.load.baStaff());
  if (r) { STF.rows = r.staff; STF.activeBA = r.activeBusinessAdmins; stfRender(); }
}
function stfDrawer(id) {
  const s = STF.rows.find(x => x.id === id); if (!s) return;
  const adm = s.type !== 'instructor', lock = s.you || stfLastBA(s);
  const body = `<div class="kv" style="margin:0;border-top:1px solid var(--line)"><div><span>ID</span><span>${esc(s.id)}</span></div><div><span>Email</span><span>${esc(s.email)}</span></div><div><span>Role</span><span>${STAFF_ROLE[s.type]}</span></div><div><span>Status</span><span>${s.status === 'active' ? 'Active' : 'Deactivated'}</span></div><div><span>Last sign-in</span><span>${stfWhen(s)}</span></div></div>
    ${adm ? `<div class="fld" style="margin-top:16px"><span class="lbl">Role</span><div class="seg" id="stf-role"><input type="radio" name="stfr" id="sr1" value="frontdesk"${s.type === 'frontdesk' ? ' checked' : ''}${lock ? ' disabled' : ''}><label for="sr1">Front desk</label><input type="radio" name="stfr" id="sr2" value="business"${s.type === 'business' ? ' checked' : ''}${lock ? ' disabled' : ''}><label for="sr2">Business Admin</label></div>${lock ? `<span class="hint">${s.you ? 'You cannot change your own role.' : 'The last Business Admin keeps this role.'}</span>` : ''}</div>` : '<p class="sub" style="margin-top:16px">Instructor accounts keep their role. Create a new account to give someone a different one.</p>'}
    <div class="acts" style="margin-top:16px;flex-wrap:wrap"><button class="sbtn" id="stf-reset">${icon('lock')}Reset password</button>${adm && !lock ? '<button class="sbtn" id="stf-saverole">Save role</button>' : ''}</div>
    <div id="stf-temp"></div>
    ${s.status === 'active' ? `<div class="acts" style="margin-top:8px"><button class="sbtn red" id="stf-off"${s.you || stfLastBA(s) ? ' disabled' : ''}>Deactivate account</button></div>${s.you ? '<span class="hint">You cannot deactivate your own account.</span>' : stfLastBA(s) ? '<span class="hint">This is the last active Business Admin, so it cannot be deactivated.</span>' : ''}` : '<div class="acts" style="margin-top:8px"><button class="sbtn dark" id="stf-on">Reactivate account</button></div>'}`;
  openDrawer(s.name, body, '<button class="sbtn" data-drawer-close>Close</button>');
  const done = async msg => { await stfLoad(); closeDrawer(); toast(msg); };
  $('#stf-reset').addEventListener('click', async () => {
    const r = await run(() => ASK.act.baStaffReset(s.id)); if (!r) return;
    $('#stf-temp').innerHTML = `<div class="note" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span>New temporary password for ${esc(s.name)}: <b id="stf-pw" class="num">${esc(r.tempPassword)}</b><br>It is shown only once. Share it securely; the old password no longer works. ${esc(s.name)} must choose a new password at first sign-in.</span></div>`;
    toast('Password reset. The new password is shown below.');
  });
  const sr = $('#stf-saverole'); if (sr) sr.addEventListener('click', async () => {
    const t = radio('stfr');
    if (!t || t === s.type) return toast('The role is unchanged.', 'info');
    if (await run(() => ASK.act.baStaffUpdate(s.id, { type: t }))) done(`${s.name} is now ${STAFF_ROLE[t]}.`);
  });
  const off = $('#stf-off'); if (off) off.addEventListener('click', async () => { if (await run(() => ASK.act.baStaffUpdate(s.id, { status: 'inactive' }))) done(`${s.name} was deactivated. They can no longer sign in.`); });
  const on = $('#stf-on'); if (on) on.addEventListener('click', async () => { if (await run(() => ASK.act.baStaffUpdate(s.id, { status: 'active' }))) done(`${s.name} was reactivated.`); });
}
function stfCreate() {
  openModal(`<h3 id="modalTitle">Create account</h3><p class="sub">The ID is made for you when you save. The person signs in with it on the staff sign-in page.</p>
    <form id="stfForm" style="margin-top:16px" novalidate>
      <div class="fld"><label for="sc-name">Full name</label><input id="sc-name" maxlength="60" autocomplete="off" autofocus></div>
      <div class="fld" style="margin-top:12px"><label for="sc-email">Email</label><input id="sc-email" type="email" maxlength="120" autocomplete="off"></div>
      <div class="fld" style="margin-top:12px"><span class="lbl">Role</span><div class="seg" id="sc-role"><input type="radio" name="scr" id="sc1" value="instructor" checked><label for="sc1">Instructor</label><input type="radio" name="scr" id="sc2" value="frontdesk"><label for="sc2">Front desk</label><input type="radio" name="scr" id="sc3" value="business"><label for="sc3">Business Admin</label></div></div>
      <div class="fld" id="sc-danBox" style="margin-top:12px"><label for="sc-dan">Dan grade</label><select id="sc-dan">${[1, 2, 3, 4, 5, 6, 7, 8].map(n => `<option value="${n}"${n === 5 ? ' selected' : ''}>${n}${['st', 'nd', 'rd'][n - 1] || 'th'} Dan</option>`).join('')}</select></div>
      <p class="sub" id="sc-idHint" style="margin-top:12px"></p>
      <div class="acts"><button class="sbtn dark" type="submit">${icon('check')}Create account</button><button class="sbtn" type="button" data-close>Cancel</button></div></form>`);
  const hint = () => { const t = radio('scr'); $('#sc-danBox').hidden = t !== 'instructor'; $('#sc-idHint').innerHTML = `ID: <b>${{ instructor: 'INS-nnnn', frontdesk: 'ADM-1nn', business: 'ADM-0nn' }[t]}</b> (the next free number)`; };
  $('#sc-role').addEventListener('change', hint); hint();
  $('#stfForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#sc-name').value.trim(), email = $('#sc-email').value.trim(), type = radio('scr');
    if (name.length < 2) return toast('Enter the full name.', 'bad');
    if (!/^\S+@\S+\.\S+$/.test(email)) return toast('Enter a valid email address.', 'bad');
    const r = await run(() => ASK.act.baStaffCreate(Object.assign({ name, email, type }, type === 'instructor' ? { danGrade: +$('#sc-dan').value } : {})));
    if (!r) return;
    await stfLoad();
    openModal(`<h3 id="modalTitle">Account created</h3><div class="kv" style="margin-top:14px"><div><span>Name</span><span>${esc(r.staff.name)}</span></div><div><span>Role</span><span>${STAFF_ROLE[r.staff.type]}</span></div><div><span>Sign-in ID</span><span id="newStaffId">${esc(r.staff.id)}</span></div><div><span>Temporary password</span><span id="newStaffPw" class="num">${esc(r.tempPassword)}</span></div></div><p class="sub" style="margin-top:12px">The password is shown only once. Share it securely. They must choose a new password at first sign-in.</p><div class="acts"><button class="sbtn dark" data-close>Done</button></div>`);
  });
}

/* ---------- Import issues ---------- */
const IMP = { f: 'open', issues: [], counts: { open: 0, fixed: 0, dismissed: 0 } };
function impRender() {
  const I = IMP.issues, c = IMP.counts;

  ['open', 'fixed', 'dismissed'].forEach(k => { const el = $('#n' + cap1(k)); if (el) el.textContent = c[k]; });
  if (typeof setCount === 'function') setCount('imports', c.open);
  $('#impStats').innerHTML = bzStat('alert', 'Open', c.open, 'Waiting for a decision') + bzStat('', 'Fixed', c.fixed, 'Matched to a member') + bzStat('', 'Dismissed', c.dismissed, 'Left out of the roll');
  $$('#impTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.f === IMP.f));
  $('#impRows').innerHTML = I.filter(i => i.status === IMP.f).map(i => `<div class="row" data-imp="${esc(i.id)}"><span class="av navy">${icon('upload')}</span><div class="grow"><div class="t">${esc(i.issue)}${i.name ? ' · ' + esc(i.name) : ''}</div><div class="d">${esc(i.file)}, row ${i.row} · ${esc(i.detail)}${i.matchedNo ? ` · matched to ${esc(i.matchedNo)}` : ''}</div></div>${i.status === 'open' ? `<div class="acts-inline"><button class="sbtn dark" data-fix="${esc(i.id)}">Fix</button><button class="sbtn" data-dismiss="${esc(i.id)}">Dismiss</button></div>` : pill(i.status === 'fixed' ? 'ok' : 'plain', i.status === 'fixed' ? 'Fixed' : 'Dismissed')}</div>`).join('') || '<p style="color:var(--muted)">Nothing here.</p>';
}
async function impLoad() {
  const r = await run(() => ASK.load.baImports());
  if (r) { IMP.issues = r.issues; IMP.counts = r.counts; impRender(); }
}
function impFix(id) {
  const it = IMP.issues.find(x => x.id === id); if (!it) return;
  openModal(`<h3 id="modalTitle">Match to a member</h3><p class="sub">${esc(it.issue)} · ${esc(it.name || 'No name')} · ${esc(it.file)}, row ${it.row}</p><div class="fld" style="margin-top:14px"><label for="im-q">Find the member</label><input id="im-q" type="search" autocomplete="off" value="${esc((it.name || '').split(/[\s.]+/)[0])}" autofocus></div><div class="rows" id="im-list"></div><div class="acts"><button class="sbtn dark" id="im-go" disabled>Match and mark fixed</button><button class="sbtn" data-close>Cancel</button></div>`);
  let pick = null, found = [], seq = 0, t = null;
  const draw = async () => {
    const n = ++seq, r = await run(() => ASK.load.deskMembers({ q: $('#im-q').value.trim(), pageSize: 6 }));
    if (!r || n !== seq) return;
    found = r.rows.map(memberLegacy);
    $('#im-list').innerHTML = found.map(memberBtn).join('') || '<p style="color:var(--muted)">No member found.</p>';
    $$('#im-list .row-btn').forEach(b => b.classList.toggle('on', b.dataset.pick === pick));
  };
  $('#im-q').addEventListener('input', () => { clearTimeout(t); t = setTimeout(draw, 250); }); draw();
  $('#im-list').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; pick = b.dataset.pick; $('#im-go').disabled = false; $$('#im-list .row-btn').forEach(x => x.classList.toggle('on', x === b)); });
  $('#im-go').addEventListener('click', async () => {
    if (!(await run(() => ASK.act.baImportDecide(id, { status: 'fixed', memberNo: pick })))) return;
    closeModal(); await impLoad(); toast('Row matched and marked fixed.');
  });
}
function impInit() {
  $('#impTabs').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { IMP.f = b.dataset.f; impRender(); } });
  $('#impRows').addEventListener('click', async e => {
    const f = e.target.closest('[data-fix]'); if (f) return impFix(f.dataset.fix);
    const d = e.target.closest('[data-dismiss]');
    if (d && (await run(() => ASK.act.baImportDecide(d.dataset.dismiss, { status: 'dismissed' })))) { await impLoad(); toast('Row dismissed.', 'info'); }
  });
  return impLoad();
}

/* ---------- Reports ---------- */
const RP_KINDS = ['attendance', 'progression', 'payments', 'followups'];
const rpParams = () => { const p = { from: $('#rp-from').value || undefined, to: $('#rp-to').value || undefined, centre: $('#rp-centre').value }; if (p.centre === 'all') delete p.centre; return p; };
let rpSeq = 0;
async function rpCount() {
  const n = ++rpSeq, r = await run(() => ASK.load.baReports(rpParams()));
  if (!r || n !== rpSeq) return;
  RP_KINDS.forEach(k => { $('#rpN-' + k).textContent = `${plural(r.counts[k], 'row')} with the filters above`; });
}
function rpInit() {
  $('#rp-from').value = iso(addMonths(TODAY, -6)); $('#rp-to').value = iso(TODAY);
  bzSetOpt($('#rp-centre'), [['all', 'All centres']].concat(DOJOS.map(d => [d.id, d.name])), 'all');
  ['#rp-from', '#rp-to', '#rp-centre'].forEach(s => $(s).addEventListener('change', rpCount));
  $('#rpCards').addEventListener('click', async e => {
    const b = e.target.closest('[data-export]'); if (!b) return;
    await run(() => ASK.baCsv(b.dataset.export, rpParams()));
  });
  return rpCount();
}

/* ---------- Notifications (both roles) ---------- */
const NF = { data: null, aud: { 'HQ class': 'lesson', 'One student': 'student', 'All members': 'all', 'One dojo': 'dojo', 'By grade': 'grade' }, seq: 0, targetSeq: 0 };
const nfTpl = () => (NF.data ? NF.data.templates : []);
async function nfTargets(a) {
  if (a === 'HQ class') {
    const r = await run(() => ASK.load.deskClasses(iso(TODAY), iso(addDays(TODAY, 6))));
    const o = ((r && r.sessions) || []).filter(c => !['Done', 'Cancelled'].includes(c.state)).map(c => `<option value="${esc(c.lessonId)}">${dayName(ASK.d(c.date))} ${fmtShort(ASK.d(c.date))} · ${timeLabel(c.time)} · ${esc(c.type)}</option>`);
    return o.join('') || '<option value="">No class in the next 7 days</option>';
  }
  if (a === 'One student') {
    const r = await run(() => ASK.load.deskMembers({ pageSize: 200 }));
    return ((r && r.rows) || []).map(m => `<option value="${esc(m.memberNo)}">${esc(m.name)} · ${esc(m.memberNo)}</option>`).join('');
  }
  if (a === 'One dojo') return DOJOS.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  return BELTS.map(b => `<option value="${esc(b.id)}">${esc(b.g)}</option>`).join('');
}
/* the preview line ("Name · 3 recipients") comes from the server, so it counts exactly who a send would reach */
async function nfPreview() {
  const a = radio('aud'), type = NF.aud[a], target = a === 'All members' ? undefined : $('#n-target').value, n = ++NF.seq;
  if (type !== 'all' && !target) { $('#audPreview').textContent = `${a} · choose one`; return null; }
  let r;
  try { r = await ASK.load.notifyAudience(type, target); } catch (e) { if (n === NF.seq) $('#audPreview').textContent = e.message; return null; }
  if (n !== NF.seq) return null;
  $('#audPreview').textContent = `${r.audience} · ${plural(r.recipients, 'recipient')}`;
  return r;
}
function nfSent() {
  $('#sentRows').innerHTML = (NF.data ? NF.data.sentLog : []).slice(0, 8).map(x => `<div class="row"><span class="av navy">${icon('send')}</span><div class="grow"><div class="t">${esc(x.title)}</div><div class="d">${esc(x.audience)} · ${esc(x.by || 'Staff')} · ${fmtShort(new Date(x.at))}</div></div></div>`).join('') || '<p style="color:var(--muted)">Nothing sent yet.</p>';
}
async function nfInit() {
  const ba = isBA();
  NF.data = await run(() => ASK.load.deskNotifications());
  if (!NF.data) return;
  $('#nSub').textContent = ba ? 'Send an approved template or your own message to everyone, one dojo, a grade, an HQ class or one student.' : 'Send an approved template to an HQ class or one student.';
  $('#tplHint').textContent = ba ? 'Pick a template, or write your own message.' : 'Templates are approved by a Business Admin. You cannot edit the wording.';
  $('#n-tpl').innerHTML = '<option value="">Choose a template</option>' + (ba && NF.data.canWriteOwn ? '<option value="own">Write my own message</option>' : '') + nfTpl().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  const lock = on => { $('#n-title').readOnly = on; $('#n-body').readOnly = on; };
  const show = () => { $('#pvTitle').textContent = $('#n-title').value || 'Your title'; $('#pvBody').textContent = $('#n-body').value || 'Your message appears here.'; $('#nCount').textContent = $('#n-body').value.length; };
  const syncAud = async () => {
    const a = radio('aud'), extra = $('#audExtra'), n = ++NF.targetSeq;
    extra.hidden = a === 'All members';
    $('#audLabel').textContent = { 'HQ class': 'Class', 'One student': 'Student', 'One dojo': 'Dojo', 'By grade': 'Grade' }[a] || 'Target';
    const html = a === 'All members' ? '' : await nfTargets(a);
    if (n !== NF.targetSeq) return;
    $('#n-target').innerHTML = html;
    nfPreview();
  };
  $('#audSeg').addEventListener('change', syncAud); $('#n-target').addEventListener('change', nfPreview);
  $('#n-tpl').addEventListener('change', () => {
    const v = $('#n-tpl').value, t = nfTpl().find(x => x.id === v);
    if (t) { lock(true); $('#n-title').value = t.name; $('#n-body').value = t.text; }
    else if (v === 'own') { lock(false); $('#n-title').value = ''; $('#n-body').value = ''; $('#n-title').focus(); }
    else { lock(true); $('#n-title').value = ''; $('#n-body').value = ''; }
    show();
  });
  $('#n-title').addEventListener('input', show); $('#n-body').addEventListener('input', show);
  $('#notifyForm').addEventListener('submit', async e => {
    e.preventDefault();
    const tpl = $('#n-tpl').value;
    if (!tpl) { toast(ba ? 'Choose a template or write your own message.' : 'Choose an approved template first.', 'bad'); return; }
    const t = $('#n-title'), b = $('#n-body');
    if (!t.value.trim() || !b.value.trim()) { toast('Add a title and a message first.', 'bad'); (t.value.trim() ? b : t).focus(); return; }
    const a = radio('aud'), type = NF.aud[a], target = a === 'All members' ? undefined : $('#n-target').value;
    if (type !== 'all' && !target) { toast('Choose who to send this to.', 'bad'); return; }
    const sent = await run(() => ASK.act.notifySend(Object.assign({ audience: Object.assign({ type }, target ? { target } : {}) }, tpl === 'own' ? { title: t.value.trim() } : { templateId: tpl })));
    if (!sent) return;
    NF.data = (await run(() => ASK.load.deskNotifications())) || NF.data; nfSent();
    toast(`Sent to ${sent.audience} · ${plural(sent.recipients, 'recipient')}${$('#n-email').checked ? ' (push + email)' : ''}`);
    $('#n-tpl').value = ''; $('#n-tpl').dispatchEvent(new Event('change', { bubbles: true }));
  });
  await syncAud(); nfSent(); show();
}

/* ---------- page setup ---------- */
runPage({
  dashboard() {
    if (!isBA()) return;
    $('#baPeriod').addEventListener('change', bzOverview);
    $('#baView').addEventListener('click', e => {
      const b = e.target.closest('[data-bv]'); if (!b) return;
      $$('#baView button').forEach(x => x.classList.toggle('on', x === b));
      const today = b.dataset.bv === 'today';
      $('#baOrg').style.display = today ? 'none' : 'grid'; $('#fdHome').style.display = today ? 'grid' : 'none';
      $('#baPeriod').closest('.fld').style.visibility = today ? 'hidden' : 'visible';
    });
    return bzOverview();
  },
  sessions() { return clInit(); },
  insights() { return insInit(); },
  revenue() { return revInit(); },
  policies() {
    $('#polTabs').addEventListener('click', e => { const b = e.target.closest('[data-pt]'); if (b) { polUI.tab = b.dataset.pt; polRender(); } });
    return polLoad();
  },
  staff() {
    filterList('#stfSearch', '#stfRows');
    $('#stfNew').addEventListener('click', stfCreate);
    $('#stfRows').addEventListener('click', e => { const b = e.target.closest('[data-stf]'); if (b) stfDrawer(b.dataset.stf); });
    return stfLoad();
  },
  imports() { return impInit(); },
  reports() { return rpInit(); },
  notify() { return nfInit(); }
});
