'use strict';
/* AIKIDO SHINJU-KAI — admin-business.js  (office portal: Business Admin Overview, Closures, Insights, Revenue, Policies, Staff,
   Import issues, Reports, and Notifications for both roles)

   Loaded after admin-shell.js and admin-desk.js (reuses iso, who, uid, pill, hash, hqClassesOn, getRoster, ensureRoster, findMembers, memberBtn).
   Prototype only: every role rule here also has to be enforced by the server. Pages for Business Admins are guarded in portal.js;
   the real system must repeat that check on the server for each request. Figures marked "Sample data" are example numbers. */

/* ---------- small helpers ---------- */
const bzJoined = m => {
  if (m.joinedAt) return new Date(String(m.joinedAt).slice(0, 10) + 'T00:00:00');
  const p = String(m.joined || '').split(' '), k = MON.indexOf(p[0]);
  return k > -1 && +p[1] ? new Date(+p[1], k, 1) : new Date(TODAY);
};
const bzSeen = m => m.seen != null ? m.seen : ((STUDENTS.find(s => s.n === m.n) || {}).seen || 0);
const bzDay = d => DSHORT[d].charAt(0) + DSHORT[d].slice(1).toLowerCase();
const bzLabel = s => `${s.type} · ${bzDay(s.day)} ${timeLabel(s.time)}`;
const bzOcc = s => s.cap ? s.booked / s.cap : 0;
const bzPct = n => Math.round(n * 100);
const bzAvg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const bzRate = s => { const r = FEEDBACK.filter(f => f.type === s.type && f.ins === s.ins).map(f => f.rating); return bzAvg(r); };
const bzBar = (label, pct, val) => `<div><span class="bl" title="${esc(label)}">${esc(label)}</span><span class="bt"><i data-w="${Math.max(0, Math.min(100, pct))}"></i></span><span class="bv">${val}</span></div>`;
const bzGrow = () => setTimeout(() => $$('.bars i[data-w]').forEach(i => { i.style.width = i.dataset.w + '%'; }), 150);
const bzStat = (cls, l, v, h, extra = '') => `<div class="stat ${cls}"><span class="l">${l}</span><span class="v">${v}</span><span class="h">${h}</span>${extra}</div>`;
const bzRow = (ic, t, d, btn) => `<div class="row"><span class="av navy">${icon(ic)}</span><div class="grow"><div class="t">${t}</div><div class="d">${d}</div></div>${btn}</div>`;
const bzNote = (t, warn) => `<div class="note${warn ? ' warn' : ''}"><svg class="ic"><use href="#i-info"/></svg><span>${t}</span></div>`;
const bzSample = '<span class="pill plain" style="height:20px;font-size:11px">Sample data</span>';
const bzTrend = key => (hash(key) % 11) - 3;   // sample change in percentage points, always the same for the same key
const bzCsvStamp = () => `${MON[TODAY.getMonth()].toLowerCase()}-${TODAY.getFullYear()}`;
const bzSetOpt = (sel, list, val) => { sel.innerHTML = list.map(([v, t]) => `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(t)}</option>`).join(''); };

/* ---------- Overview (Business Admin home) ---------- */
const bzPeriodStart = p => p === 'month' ? new Date(TODAY.getFullYear(), TODAY.getMonth(), 1) : addDays(TODAY, -(+p));
const bzRetention = () => { const c = (DB.cohorts || []).filter(x => x.kept > 0), j = c.reduce((s, x) => s + x.joined, 0), k = c.reduce((s, x) => s + x.kept, 0); return j ? Math.round(k / j * 100) : 0; };

function bzOverview() {
  const per = $('#baPeriod').value, start = bzPeriodStart(per);
  $('#baSub').textContent = `All centres · ${fmtDate(TODAY)}`;
  const active = MEMBERS.filter(m => m.st === 'Active').length;
  const fresh = MEMBERS.filter(m => bzJoined(m) >= start).length;
  const ret = bzRetention();
  const got = ledgerSum(l => l.st === 'Paid' && new Date(l.date) >= start), owed = ledgerSum(l => l.st === 'Outstanding');
  const label = { month: 'this month', 30: 'in the last 30 days', 90: 'in the last 90 days', 365: 'in the last 12 months' }[per];
  $('#baStats').innerHTML = bzStat('', 'Active members', active, `${MEMBERS.length} members in total`)
    + bzStat('', 'New members', fresh, `Joined ${label}`)
    + bzStat('', '90-day retention', ret + '%', 'Still training 90 days after joining (sample data)')
    + bzStat('alert', 'Collected vs outstanding', money(got), `${money(owed)} outstanding · collected ${label}`);

  /* centres at a glance */
  const rows = DOJOS.map(d => {
    const ss = SESSIONS.filter(s => s.dojo === d.id), cap = ss.reduce((a, s) => a + s.cap, 0), bk = ss.reduce((a, s) => a + s.booked, 0);
    const out = ledgerSum(l => l.st === 'Outstanding' && (memberByNo(l.no) || {}).dojo === d.id);
    return { d, n: ss.length, occ: cap ? bk / cap : 0, out, t: bzTrend('centre' + d.id) };
  }).filter(r => r.n).sort((a, b) => b.occ - a.occ).slice(0, 6);
  $('#baCentres').innerHTML = rows.map(r => `<div class="row"><span class="av navy">${esc(r.d.short.slice(0, 2).toUpperCase())}</span><div class="grow"><div class="t">${esc(r.d.name)}</div><div class="d">Occupancy ${bzPct(r.occ)}% · ${r.n} ${r.n === 1 ? 'class' : 'classes'} · Outstanding ${money(r.out)} · Attendance ${r.t >= 0 ? 'up' : 'down'} ${Math.abs(r.t)}%</div></div><a class="sbtn" href="insights.html?centre=${esc(r.d.id)}">Insights</a></div>`).join('');

  /* waiting on the Business Admin */
  const exc = (DB.exceptions || []).filter(x => x.status === 'pending').length, fail = (DB.ledger || []).filter(l => l.st === 'Failed').length, imp = (DB.imports || []).filter(i => i.status === 'open').length;
  const fu = (DB.followups || []).filter(f => f.attempts && f.attempts.length).length;
  $('#baWaiting').innerHTML = bzRow('shield', 'Exceptions to decide', `${plural(exc, 'item')} sent up by the front desk`, '<button class="sbtn" data-page-link="applications">Review</button>')
    + bzRow('card', 'Payment failures', `${plural(fail, 'failed payment')} to look at`, '<button class="sbtn" data-page-link="revenue">Review</button>')
    + bzRow('upload', 'Import issues', `${plural(imp, 'row')} to match or dismiss`, '<button class="sbtn" data-page-link="imports">Review</button>')
    + bzRow('award', 'Promotion results', `${plural(PROPOSALS.length, 'result')} signed by examiners`, '<button class="sbtn" data-page-link="grading">Review</button>')
    + bzRow('bell', 'Follow-up outcomes', `${plural(fu, 'student')} with a logged contact to review`, '<button class="sbtn" data-page-link="followups">Review</button>')
    + bzRow('flag', 'Low attendance flags', `${plural(STUDENTS.filter(isDeclining).length, 'student')} not seen in 14+ days`, '<button class="sbtn" data-page-link="followups">View</button>');

  /* business questions */
  const full = SESSIONS.filter(s => bzOcc(s) >= .85).length, low = SESSIONS.filter(s => bzOcc(s) < .5).length, iv = (DB.interventions || [])[0];
  const q = (title, v, h, tab) => bzStat('', title, v, h, `<a class="sbtn" href="insights.html?tab=${tab}" style="justify-self:start;margin-top:8px">Explore</a>`);
  $('#baQuestions').innerHTML = q('Should we open another class here?', full, 'classes are 85% full or more', 'capacity')
    + q('Why are newcomers leaving?', (100 - ret) + '%', 'of new members were gone after 90 days (sample data)', 'retention')
    + q('Which classes need attention?', low, 'classes are under half full', 'attention')
    + q('Did an intervention work?', iv ? `${iv.after >= iv.before ? '+' : ''}${iv.before ? Math.round((iv.after - iv.before) / iv.before * 100) : 0}%` : '—', iv ? `${esc(iv.name)}: ${iv.before} to ${iv.after} a week` : 'No intervention logged yet', 'interventions');
}

/* ---------- Closures (Business Admin, Classes page) ---------- */
function clCollect() {
  const scope = radio('clscope'), from = $('#cl-from').value, to = $('#cl-to').value, out = { scope, items: [], err: '' };
  const day = v => new Date(v + 'T00:00:00');
  if (!from) { out.err = scope === 'HQ' ? 'Pick the first day.' : 'Pick the day.'; return out; }
  if (from < iso(TODAY)) { out.err = 'A closure starts today or later.'; return out; }
  const add = (d, c) => { if (classState(d, c) !== 'Cancelled') out.items.push({ date: d, cls: c, rows: getRoster(d, c).rows }); };
  if (scope === 'HQ') {
    const end = to || from;
    if (end < from) { out.err = 'The last day is before the first day.'; return out; }
    const n = daysBetween(day(from), day(end)) + 1;
    if (n > 60) { out.err = 'Close at most 60 days at a time.'; return out; }
    for (let k = 0; k < n; k++) { const d = addDays(day(from), k); hqClassesOn(d).forEach(c => add(d, c)); }
  } else {
    const c = SESSIONS.find(s => s.code === $('#cl-cls').value && s.dojo === HQ);
    if (!c) { out.err = 'There is no HQ class left to cancel on that day.'; return out; }
    add(day(from), c);
  }
  return out;
}
function clPreview() {
  const c = clCollect(), box = $('#clAffected'), btn = $('#clSave');
  btn.disabled = !!c.err;
  if (c.err) { box.className = 'note warn'; box.innerHTML = `<svg class="ic"><use href="#i-info"/></svg><span>${esc(c.err)}</span>`; return c; }
  const people = c.items.flatMap(x => x.rows.map(r => `${r.name} (${x.cls.type} ${timeLabel(x.cls.time)}${x.date ? ', ' + fmtShort(x.date) : ''})`));
  box.className = 'note';
  box.innerHTML = `<svg class="ic"><use href="#i-info"/></svg><span id="clAffText"><b>${plural(people.length, 'student')} booked on ${plural(c.items.length, 'class')}.</b> Their lessons are returned and they get a notice.${people.length ? `<span class="sub-note" style="margin-top:6px">${esc(people.slice(0, 8).join(', '))}${people.length > 8 ? ` and ${people.length - 8} more` : ''}</span>` : ''}</span>`;
  return c;
}
/* give back one lesson for every booked member of a class; runs once per class */
function clReturn(date, cls) {
  const R = ensureRoster(date, cls); if (R.returned) return 0;
  let n = 0;
  R.rows.forEach(x => {
    if (x.guest || !x.no) return;
    if (x.no === ME.no) {
      const bi = BOOKINGS.findIndex(b => b.key === rosterKey(date, cls));
      if (bi > -1) { const p = MY_PASSES.find(y => y.id === BOOKINGS[bi].passId); BOOKINGS.splice(bi, 1); if (p) p.left++; n++; }
    } else { const m = memberByNo(x.no); if (m && typeof m.left === 'number') { m.left++; n++; } }
  });
  R.returned = true; return n;
}
function clList() {
  const L = (DB.closures || []).slice().sort((a, b) => new Date(b.from) - new Date(a.from));
  $('#clList').innerHTML = L.map(c => {
    const same = iso(c.from) === iso(c.to), when = same ? fmtDate(new Date(c.from)) : `${fmtShort(new Date(c.from))} to ${fmtDate(new Date(c.to))}`;
    const t = c.scope === 'class' ? `${esc(c.label || 'Class')} cancelled · ${when}` : `HQ closed · ${when}`;
    return `<div class="row"><span class="av navy">${icon('cal')}</span><div class="grow"><div class="t">${t}</div><div class="d">${esc(c.note || 'No reason given')}${c.lessons != null ? ` · ${plural(c.students, 'student')} · ${plural(c.lessons, 'lesson')} returned` : ''}</div></div><button class="sbtn ghost" data-clrm="${esc(c.id)}" aria-label="Remove closure">${icon('trash')}</button></div>`;
  }).join('') || '<p style="color:var(--muted)">No closures or cancellations.</p>';
}
function clInit() {
  if (!$('#clForm')) return;
  $('#cl-from').min = iso(TODAY); $('#cl-to').min = iso(TODAY);
  const fillClasses = () => {
    const v = $('#cl-from').value, list = v ? hqClassesOn(new Date(v + 'T00:00:00')).filter(c => classState(new Date(v + 'T00:00:00'), c) !== 'Cancelled') : [];
    $('#cl-cls').innerHTML = list.map(c => `<option value="${esc(c.code)}">${esc(c.type)} · ${timeLabel(c.time)}</option>`).join('') || '<option value="">No class on this day</option>';
  };
  const sync = () => {
    const one = radio('clscope') === 'class';
    $('#clToBox').hidden = one; $('#clClsBox').hidden = !one;
    $('#clFromL').textContent = one ? 'Date' : 'From';
    $('#clSave').textContent = one ? 'Cancel class and return lessons' : 'Close HQ and return lessons';
    if (one) fillClasses();
    clPreview();
  };
  $('#clScope').addEventListener('change', sync);
  ['#cl-from', '#cl-to', '#cl-cls'].forEach(s => $(s).addEventListener('change', () => { if (s === '#cl-from' && radio('clscope') === 'class') fillClasses(); clPreview(); }));
  $('#clForm').addEventListener('submit', e => {
    e.preventDefault();
    const c = clPreview(); if (c.err) return toast(c.err, 'bad');
    const note = $('#cl-note').value.trim(), students = c.items.reduce((s, x) => s + x.rows.length, 0);
    let lessons = 0; c.items.forEach(x => { lessons += clReturn(x.date, x.cls); });
    const from = new Date($('#cl-from').value + 'T00:00:00'), to = c.scope === 'HQ' ? new Date(($('#cl-to').value || $('#cl-from').value) + 'T00:00:00') : from;
    const cls = c.scope === 'class' ? c.items[0].cls : null;
    DB.closures.push(Object.assign({ id: uid('C-'), scope: c.scope, from, to, note, students, lessons }, cls ? { code: cls.code, label: `${cls.type} ${timeLabel(cls.time)}` } : {}));
    (DB.sentLog = DB.sentLog || []).unshift({ at: new Date(), by: who(), aud: c.scope === 'HQ' ? 'HQ students' : `${cls.type} · ${timeLabel(cls.time)}`, title: `Class cancelled${note ? ': ' + note : ''}. Lesson returned.` });
    save(); clList(); $('#cl-note').value = ''; clPreview();
    toast(`${c.scope === 'HQ' ? 'HQ closed' : 'Class cancelled'}. ${plural(lessons, 'lesson')} returned, ${plural(students, 'student')} notified.`);
  });
  $('#clList').addEventListener('click', e => {
    const b = e.target.closest('[data-clrm]'); if (!b) return;
    const i = DB.closures.findIndex(c => c.id === b.dataset.clrm); if (i < 0) return;
    DB.closures.splice(i, 1); save(); clList(); toast('Removed. Lessons that were returned stay returned.', 'info');
  });
  sync(); clList();
}

/* ---------- Insights ---------- */
const INS = { tab: 'centres', period: '3m', cmp: 'prev', centre: 'all', type: 'all', slot: 'all', age: 'all', belt: 'all' };
const INS_PERIOD = [['4w', 'Last 4 weeks'], ['3m', 'Last 3 months'], ['12m', 'Last 12 months']];
const INS_CMP = [['prev', 'Previous period'], ['year', 'Same period last year'], ['none', 'No comparison']];
const INS_SLOT = [['all', 'All times'], ['am', 'Morning (before 12)'], ['pm', 'Afternoon (12 to 5)'], ['eve', 'Evening (after 5)']];
const INS_AGE = [['all', 'All ages'], ['kids', 'Children'], ['adult', 'Adults']];
const INS_BELT = [['all', 'All belts'], ['beg', '6th to 5th Kyu'], ['mid', '4th to 3rd Kyu'], ['adv', '2nd Kyu and above']];
const bzBeltGroup = g => { const k = kyuOf(g); return k >= 5 ? 'beg' : k >= 3 ? 'mid' : 'adv'; };
const bzSlot = t => { const h = +t.slice(0, 2); return h < 12 ? 'am' : h < 17 ? 'pm' : 'eve'; };
const insSessions = () => SESSIONS.filter(s => (INS.centre === 'all' || s.dojo === INS.centre) && (INS.type === 'all' || s.type === INS.type) && (INS.slot === 'all' || bzSlot(s.time) === INS.slot) && (INS.age === 'all' || (INS.age === 'kids') === !!s.kids));
const insMembers = () => MEMBERS.filter(m => (INS.centre === 'all' || m.dojo === INS.centre) && (INS.belt === 'all' || bzBeltGroup(m.g) === INS.belt) && (INS.age === 'all' || (INS.age === 'kids') === (m.kind === 'child')));
const insDelta = key => INS.cmp === 'none' ? '' : `${bzTrend(key + INS.period + INS.cmp) >= 0 ? '+' : ''}${bzTrend(key + INS.period + INS.cmp)} pts vs ${INS.cmp === 'prev' ? 'previous period' : 'last year'}`;
const insHead = (t, sub, sample) => `<div class="card-h"><div><h3>${t}</h3>${sub ? `<span class="sub">${sub}</span>` : ''}</div>${sample ? bzSample : ''}</div>`;

function insCentres() {
  const ss = insSessions();
  const rows = DOJOS.map(d => ({ d, s: ss.filter(x => x.dojo === d.id) })).filter(r => r.s.length).map(r => { const cap = r.s.reduce((a, x) => a + x.cap, 0), bk = r.s.reduce((a, x) => a + x.booked, 0); return { d: r.d, n: r.s.length, occ: cap ? bk / cap : 0, mem: insMembers().filter(m => m.dojo === r.d.id).length }; }).sort((a, b) => b.occ - a.occ);
  const classes = ss.slice().sort((a, b) => bzOcc(b) - bzOcc(a)), shown = classes.slice(0, 12);
  return `<div class="card white">${insHead('Centres', 'Average occupancy of weekly classes', true)}
      <div class="bars">${rows.map(r => bzBar(r.d.name, bzPct(r.occ), bzPct(r.occ) + '%')).join('') || '<p style="color:var(--muted)">No classes match these filters.</p>'}</div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Centre</th><th>Classes</th><th>Occupancy</th><th>Members</th><th>Change</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.d.name)}</b></td><td class="num">${r.n}</td><td class="num">${bzPct(r.occ)}%</td><td class="num">${r.mem}</td><td>${esc(insDelta('c' + r.d.id)) || '—'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card white">${insHead('Classes', `The ${shown.length} fullest of ${classes.length} weekly classes`)}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Class</th><th>Centre</th><th>Instructor</th><th>Booked</th><th>Occupancy</th><th>Rating</th></tr></thead><tbody>${shown.map(s => { const r = bzRate(s); return `<tr><td><b>${esc(bzLabel(s))}</b></td><td>${esc(dojoName(s.dojo))}</td><td>${esc(s.ins)}</td><td class="num">${s.booked}/${s.cap}</td><td class="num">${bzPct(bzOcc(s))}%</td><td class="num">${r ? r.toFixed(1) : '—'}</td></tr>`; }).join('') || '<tr><td colspan="6" style="color:var(--muted)">No classes match these filters.</td></tr>'}</tbody></table></div></div>`;
}
function insCapacity() {
  const ss = insSessions().slice().sort((a, b) => bzOcc(b) - bzOcc(a)), sig = s => bzOcc(s) >= .85 ? pill('warn', 'Near full') : bzOcc(s) < .5 ? pill('plain', 'Room to fill') : pill('ok', 'Healthy');
  return `<div class="card white">${insHead('Capacity', 'Classes that are nearly full may need another slot. Try a pilot slot first, then follow it under Interventions.')}
      <div class="acts-inline" style="margin-bottom:12px"><button class="sbtn dark" id="planPilot">${icon('plus')}Plan a pilot slot</button></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Class</th><th>Centre</th><th>Booked</th><th>Occupancy</th><th>Signal</th></tr></thead><tbody>${ss.slice(0, 14).map(s => `<tr><td><b>${esc(bzLabel(s))}</b></td><td>${esc(dojoName(s.dojo))}</td><td class="num">${s.booked}/${s.cap}</td><td class="num">${bzPct(bzOcc(s))}%</td><td>${sig(s)}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No classes match these filters.</td></tr>'}</tbody></table></div></div>`;
}
function insAttention() {
  const list = insSessions().map(s => ({ s, r: bzRate(s) })).filter(x => bzOcc(x.s) < .5 || (x.r != null && x.r < 4)).sort((a, b) => bzOcc(a.s) - bzOcc(b.s));
  return `<div class="note warn" id="attBanner"><svg class="ic"><use href="#i-info"/></svg><span><b>Investigate first.</b> Talk to the instructor and the members before changing the schedule. A class is never cancelled automatically because of these numbers.</span></div>
    <div class="card white">${insHead('Classes that need attention', 'Under half full, or rated below 4')}
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Class</th><th>Centre</th><th>Occupancy</th><th>Rating</th><th>Why flagged</th><th>First step</th></tr></thead><tbody>${list.map(({ s, r }) => { const lo = bzOcc(s) < .5, lr = r != null && r < 4; return `<tr><td><b>${esc(bzLabel(s))}</b></td><td>${esc(dojoName(s.dojo))}</td><td class="num">${bzPct(bzOcc(s))}%</td><td class="num">${r ? r.toFixed(1) : '—'}</td><td>${lo && lr ? 'Under half full and low rating' : lo ? 'Under half full' : 'Rating below 4'}</td><td>${lr ? 'Read the class feedback and speak to the instructor' : 'Ask members and the instructor about the time slot'}</td></tr>`; }).join('') || '<tr><td colspan="6" style="color:var(--muted)">Nothing needs attention with these filters.</td></tr>'}</tbody></table></div></div>`;
}
function insRetention() {
  const n = { '4w': 3, '3m': 6, '12m': 6 }[INS.period], co = (DB.cohorts || []).slice(-n), mem = insMembers();
  const reasons = (DB.followups || []).flatMap(f => (f.attempts || []).filter(a => a.outcome === 'Not returning').map(a => ({ name: f.name, note: a.note, at: a.at })));
  return `<div class="card white">${insHead('90-day retention', 'Members who joined each month and were still training 90 days later', true)}
      <div class="bars">${co.map(c => c.kept ? bzBar(`${c.label} · ${c.joined} joined`, Math.round(c.kept / c.joined * 100), Math.round(c.kept / c.joined * 100) + '%') : bzBar(`${c.label} · ${c.joined} joined`, 0, 'Not yet')).join('')}</div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Joined in</th><th>Joined</th><th>Still training</th><th>Retention</th></tr></thead><tbody>${co.map(c => `<tr><td><b>${esc(c.label)}</b></td><td class="num">${c.joined}</td><td class="num">${c.kept || '—'}</td><td>${c.kept ? Math.round(c.kept / c.joined * 100) + '%' : 'Less than 90 days'}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="g2"><div class="card white">${insHead('Members at risk', 'From the member list with these filters')}<div class="kv" style="margin:0"><div><span>Lapsed</span><span>${mem.filter(m => m.st === 'Lapsed').length}</span></div><div><span>Not seen in 14+ days</span><span>${mem.filter(m => bzSeen(m) >= 14).length}</span></div><div><span>Expiring within 14 days</span><span>${mem.filter(m => m.exp && daysBetween(TODAY, new Date(m.exp)) >= 0 && daysBetween(TODAY, new Date(m.exp)) <= 14).length}</span></div></div></div>
    <div class="card white">${insHead('Why newcomers leave', 'Reasons the front desk wrote down')}<div class="rows">${reasons.map(r => `<div class="row"><span class="av">${initials(r.name)}</span><div class="grow"><div class="t">${esc(r.name)}</div><div class="d">${esc(r.note || 'No reason written')}</div></div></div>`).join('') || '<p style="color:var(--muted)">No reasons logged yet. The front desk writes one when someone says they are not returning.</p>'}</div></div></div>`;
}
function insExperience() {
  const hq = INS.centre === 'all' || INS.centre === HQ;
  const F = hq ? FEEDBACK.filter(f => (INS.type === 'all' || f.type === INS.type) && (INS.age === 'all' || (INS.age === 'kids') === /Children/.test(f.type))) : [];
  const byIns = {}; F.forEach(f => { (byIns[f.ins] = byIns[f.ins] || []).push(f); });
  const rows = Object.entries(byIns).map(([ins, a]) => { const tags = {}; a.forEach(f => (f.tags || []).forEach(t => { tags[t] = (tags[t] || 0) + 1; })); const top = Object.entries(tags).sort((x, y) => y[1] - x[1])[0]; return { ins, n: a.length, avg: bzAvg(a.map(f => f.rating)), tag: top ? top[0] : '—' }; }).sort((a, b) => b.avg - a.avg);
  const byType = {}; F.forEach(f => { (byType[f.type] = byType[f.type] || []).push(f.rating); });
  return `<div class="card white">${insHead('Experience and teaching', hq ? 'Anonymous class ratings from students' : 'Ratings are collected at HQ only')}
      <div class="bars">${Object.entries(byType).map(([t, r]) => bzBar(t, Math.round(bzAvg(r) / 5 * 100), bzAvg(r).toFixed(1))).join('') || '<p style="color:var(--muted)">No ratings for these filters.</p>'}</div>
      <div class="tbl-wrap" style="margin-top:14px"><table class="tbl"><thead><tr><th>Instructor</th><th>Responses</th><th>Average rating</th><th>Most common praise</th></tr></thead><tbody>${rows.map(r => `<tr><td><b>${esc(r.ins)}</b></td><td class="num">${r.n}</td><td class="num">${r.avg.toFixed(1)}</td><td>${esc(r.tag)}</td></tr>`).join('') || '<tr><td colspan="4" style="color:var(--muted)">No ratings for these filters.</td></tr>'}</tbody></table></div></div>`;
}
function insInterventions() {
  const L = DB.interventions || [], chg = x => x.before ? Math.round((x.after - x.before) / x.before * 100) : 0;
  return `<div class="card white">${insHead('Interventions', 'A change tried at a centre, with attendance before and after')}
      <div class="acts-inline" style="margin-bottom:12px"><button class="sbtn dark" id="ivNew">${icon('plus')}Log an intervention</button></div>
      <div class="rows" id="ivRows">${L.map(x => `<div class="row"><span class="av navy">${icon('chart')}</span><div class="grow"><div class="t">${esc(x.name)}</div><div class="d">${esc(x.slot)} · started ${fmtShort(new Date(x.start))} · ${x.before} a week before, ${x.after} after (${chg(x) >= 0 ? '+' : ''}${chg(x)}%)</div></div><div class="acts-inline"><span class="pill ${x.decision === 'continue' ? 'ok' : x.decision === 'stop' ? 'bad' : 'warn'}">${cap1(x.decision)}</span>${['continue', 'adjust', 'stop'].filter(d => d !== x.decision).map(d => `<button class="sbtn" data-iv="${esc(x.id)}" data-d="${d}">${cap1(d)}</button>`).join('')}</div></div>`).join('') || '<p style="color:var(--muted)">Nothing logged yet.</p>'}</div></div>`;
}
const INS_TABS = { centres: insCentres, capacity: insCapacity, attention: insAttention, retention: insRetention, experience: insExperience, interventions: insInterventions };
function insRender() {
  $$('#insTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.it === INS.tab));
  $('#insBody').innerHTML = INS_TABS[INS.tab]();
  bzGrow();
}
function insPilotPreset() {
  const ss = insSessions().length ? insSessions() : SESSIONS, top = ss.slice().sort((a, b) => bzOcc(b) - bzOcc(a))[0];
  const free = t => !SESSIONS.some(x => x.day === top.day && Math.abs(sesMins(x.time) - sesMins(t)) < 60 && (x.ins === top.ins || (x.dojo === top.dojo && (x.mat || 'Mat A') === (top.mat || 'Mat A'))));
  return { type: top.type, day: top.day, dojo: top.dojo, ins: top.ins, cap: top.cap, mat: top.mat || 'Mat A', time: TIMES.find(free) || top.time, pilot: true };
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
  $('#ivForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#iv-name').value.trim(), slot = $('#iv-slot').value.trim();
    if (!name || !slot) return toast('Add what was tried and the class or slot.', 'bad');
    DB.interventions.unshift({ id: uid('N-'), name, slot, start: new Date(TODAY), before: Math.max(0, +$('#iv-before').value || 0), after: Math.max(0, +$('#iv-after').value || 0), decision: $('#iv-dec').value });
    save(); closeModal(); insRender(); toast('Intervention logged.');
  });
}
function insInit() {
  const q = new URLSearchParams(location.search);
  if (INS_TABS[q.get('tab')]) INS.tab = q.get('tab');
  if (q.get('centre') && DOJOS.some(d => d.id === q.get('centre'))) INS.centre = q.get('centre');
  const types = [['all', 'All class types']].concat([...new Set(SESSIONS.map(s => s.type))].map(t => [t, t]));
  bzSetOpt($('#f-period'), INS_PERIOD, INS.period); bzSetOpt($('#f-cmp'), INS_CMP, INS.cmp);
  bzSetOpt($('#f-centre'), [['all', 'All centres']].concat(DOJOS.map(d => [d.id, d.name])), INS.centre);
  bzSetOpt($('#f-type'), types, INS.type); bzSetOpt($('#f-slot'), INS_SLOT, INS.slot); bzSetOpt($('#f-age'), INS_AGE, INS.age); bzSetOpt($('#f-belt'), INS_BELT, INS.belt);
  [['period', 'f-period'], ['cmp', 'f-cmp'], ['centre', 'f-centre'], ['type', 'f-type'], ['slot', 'f-slot'], ['age', 'f-age'], ['belt', 'f-belt']].forEach(([k, id]) => $('#' + id).addEventListener('change', e => { INS[k] = e.target.value; insRender(); }));
  $('#insTabs').addEventListener('click', e => { const b = e.target.closest('[data-it]'); if (b) { INS.tab = b.dataset.it; insRender(); } });
  $('#insBody').addEventListener('click', e => {
    if (e.target.closest('#planPilot')) return openSessionForm(undefined, insPilotPreset());
    if (e.target.closest('#ivNew')) return insLogModal();
    const d = e.target.closest('[data-iv]'); if (d) { const x = DB.interventions.find(y => y.id === d.dataset.iv); if (x) { x.decision = d.dataset.d; save(); insRender(); toast(`Decision: ${x.decision}.`); } }
  });
  insRender();
}

/* ---------- Revenue ---------- */
const revGroup = item => /unlimited/i.test(item) ? 'Unlimited plans' : /pack|lesson/i.test(item) ? 'Lesson packages' : /registration/i.test(item) ? 'Registration' : /dues/i.test(item) ? 'Annual dues' : /grading/i.test(item) ? 'Grading fees' : /dogi|handbook|belt/i.test(item) ? 'Equipment' : 'Other';
function revInit() {
  const month = l => isThisMonth(l.date), paid = (DB.ledger || []).filter(l => l.st === 'Paid' && month(l)), total = paid.reduce((s, l) => s + l.amt, 0);
  const owed = ledgerSum(l => l.st === 'Outstanding'), failed = (DB.ledger || []).filter(l => l.st === 'Failed');
  $('#revSub').textContent = `Payments received in ${MON[TODAY.getMonth()]} ${TODAY.getFullYear()} through Stripe.`;
  $('#revStats').innerHTML = `<div class="stat dark"><span class="l">Received this month</span><span class="v" id="revTotal">${money(total)}</span><span class="h">${plural(paid.length, 'paid payment')}</span></div>`
    + bzStat('', 'Outstanding', money(owed), 'Not yet paid') + bzStat('alert', 'Failed payments', failed.length, `${money(failed.reduce((s, l) => s + l.amt, 0))} declined by Stripe`);
  const g = {}; paid.forEach(l => { const k = revGroup(l.item); g[k] = g[k] || { n: 0, amt: 0 }; g[k].n++; g[k].amt += l.amt; });
  const items = Object.entries(g).sort((a, b) => b[1].amt - a[1].amt);
  $('#revBars').innerHTML = items.map(([k, v]) => bzBar(k, total ? Math.round(v.amt / total * 100) : 0, money(v.amt))).join('') || '<p style="color:var(--muted)">No payments this month.</p>';
  $('#revItems').innerHTML = items.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td class="num">${v.n}</td><td class="num">${money(v.amt)}</td></tr>`).join('') + `<tr><td><b>Total</b></td><td class="num">${paid.length}</td><td class="num"><b>${money(total)}</b></td></tr>`;
  $('#revFailed').innerHTML = failed.map(l => `<div class="row"><span class="av">${initials(l.name)}</span><div class="grow"><div class="t">${esc(l.name)}</div><div class="d">${esc(l.item)} · ${money(l.amt)} · ${fmtShort(new Date(l.date))} · ${l.by === 'auto' ? 'Auto-billing' : 'Online'}</div></div><a class="sbtn" href="member.html?no=${encodeURIComponent(l.no)}">Open member</a></div>`).join('') || '<p style="color:var(--muted)">No failed payments.</p>';
  $('#revExport').addEventListener('click', () => downloadCSV(`revenue-${bzCsvStamp()}.csv`, [['Member', 'Member no.', 'Item', 'Date', 'Amount', 'Method', 'Status']].concat((DB.ledger || []).filter(month).map(l => [l.name, l.no, l.item, iso(l.date), l.amt, l.method, l.st]))));
}

/* ---------- Policies ---------- */
const polUI = { tab: 'prices' };
const polNum = (sel, min, max) => { const v = +$(sel).value; return $(sel).value !== '' && isFinite(v) && v >= min && v <= max ? v : null; };
/* every save shows what changes and who it reaches before it is applied */
function polConfirm(title, lines, impact, apply) {
  if (!lines.length) return toast('Nothing changed.', 'info');
  openModal(`<h3 id="modalTitle">Apply these changes?</h3><p class="sub">${esc(title)}</p><div class="kv" style="margin-top:14px">${lines.map(l => `<div><span>${esc(l[0])}</span><span>${esc(l[1])}</span></div>`).join('')}</div><div class="note" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span id="polImpact">${impact}</span></div><div class="acts"><button class="sbtn dark" id="polGo">Apply changes</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#polGo').addEventListener('click', () => { apply(); save(); closeModal(); polRender(); toast('Policy saved.'); });
}
function polRender() {
  $$('#polTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.pt === polUI.tab));
  const P = DB.policies, box = $('#polBody'), head = (t, s) => `<div class="card-h"><div><h3>${t}</h3><span class="sub">${s}</span></div></div>`;
  if (polUI.tab === 'prices') {
    box.innerHTML = `${head('Packages and prices', 'The desk and online checkout read these prices. Discounts are worked out from date of birth.')}
      <form id="polForm" class="grid2" novalidate>
        <div class="fld"><label for="p-reg">Registration fee (S$)</label><input id="p-reg" type="number" min="0" step="0.01" value="${P.registration}"></div>
        <div class="fld"><label for="p-dues">Annual dues (S$)</label><input id="p-dues" type="number" min="0" step="0.01" value="${P.annualDues}"></div>
        ${(P.packages || []).map(k => `<div class="fld"><label for="pk-${esc(k.id)}">${esc(k.name)} (S$)</label><input id="pk-${esc(k.id)}" class="p-pkg" data-id="${esc(k.id)}" type="number" min="0" step="0.01" value="${k.amt}"></div>`).join('')}
        <div class="fld full"><span class="hint">Discounts: ${P.discounts.senior.age} and over ${P.discounts.senior.pct}% off. Ages ${P.discounts.student.from} to ${P.discounts.student.to} and NSFs ${P.discounts.student.pct}% off.</span></div>
        <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}Review and save</button></div></form>`;
  } else if (polUI.tab === 'booking') {
    const b = Object.assign({ aheadMonths: 1, minDays: 1, cancelHours: 4, maxPackages: 2 }, P.booking);
    box.innerHTML = `${head('Booking rules', 'How far ahead students may book, and when a cancelled lesson comes back.')}
      <form id="polForm" class="grid2" novalidate>
        <div class="fld"><label for="b-ahead">Book up to (months ahead)</label><input id="b-ahead" type="number" min="1" max="6" value="${b.aheadMonths}"></div>
        <div class="fld"><label for="b-min">Online booking notice (days)</label><input id="b-min" type="number" min="0" max="14" value="${b.minDays}"></div>
        <div class="fld"><label for="b-cancel">Lesson returned when cancelled this many hours before</label><input id="b-cancel" type="number" min="0" max="72" value="${b.cancelHours}"></div>
        <div class="fld"><label for="b-max">Packages a student can hold at once</label><input id="b-max" type="number" min="1" max="5" value="${b.maxPackages}"></div>
        <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}Review and save</button></div></form>`;
  } else if (polUI.tab === 'activation') {
    box.innerHTML = `${head('Auto-activation rules', 'The front desk can press Activate only when every rule switched on here passes.')}
      <form id="polForm" novalidate><div class="rows">${(P.autoActivation || []).map(r => `<label class="check" style="padding:10px 0"><input type="checkbox" class="p-act" data-id="${esc(r.id)}"${r.on ? ' checked' : ''}><span>${esc(r.text)}</span></label>`).join('')}</div>
        <div style="margin-top:14px"><button class="sbtn dark" type="submit">${icon('check')}Review and save</button></div></form>`;
  } else if (polUI.tab === 'methods') {
    box.innerHTML = `${head('Approved payment methods', 'Payments are taken through Stripe only.')}
      <div class="rows"><div class="row"><span class="av navy">${icon('card')}</span><div class="grow"><div class="t">Stripe</div><div class="d">Cards online, and a card at the desk. Used for packages, dues, registration and grading fees.</div></div><span class="pill ok">Approved</span></div></div>
      ${bzNote('Cash, bank transfer and QR codes are not approved. No other method can be added in this prototype.')}`;
  } else if (polUI.tab === 'templates') {
    box.innerHTML = `${head('Notification templates', 'The front desk can only send these. Business Admins can also write their own message.')}
      <form id="polForm" novalidate><div style="display:grid;gap:14px">${(P.templates || []).map(t => `<div class="fld"><label for="t-n-${esc(t.id)}">Template name</label><input id="t-n-${esc(t.id)}" class="p-tn" data-id="${esc(t.id)}" maxlength="60" value="${esc(t.name)}"><label for="t-t-${esc(t.id)}" style="margin-top:8px">Message</label><textarea id="t-t-${esc(t.id)}" class="p-tt" data-id="${esc(t.id)}" maxlength="240">${esc(t.text)}</textarea></div>`).join('')}
        <div class="fld"><label for="t-n-new">New template name</label><input id="t-n-new" maxlength="60" placeholder="Leave empty to skip"><label for="t-t-new" style="margin-top:8px">New template message</label><textarea id="t-t-new" maxlength="240"></textarea></div></div>
        <div style="margin-top:14px"><button class="sbtn dark" type="submit">${icon('check')}Review and save</button></div></form>`;
  } else {
    const t = Object.assign({ declineDays: 14, renewalDays: 30 }, P.followTriggers);
    box.innerHTML = `${head('Follow-up triggers', 'When a student appears on the Follow-ups lists.')}
      <form id="polForm" class="grid2" novalidate>
        <div class="fld"><label for="t-dec">Declining attendance: not seen for (days)</label><input id="t-dec" type="number" min="1" max="90" value="${t.declineDays}"></div>
        <div class="fld"><label for="t-ren">Renewal coming up: expires within (days)</label><input id="t-ren" type="number" min="1" max="90" value="${t.renewalDays}"></div>
        <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}Review and save</button></div></form>`;
  }
  enhance(box);
  const f = $('#polForm'); if (f) f.addEventListener('submit', e => { e.preventDefault(); polSave(); });
}
function polSave() {
  const P = DB.policies, T = polUI.tab, L = [];
  if (T === 'prices') {
    const reg = polNum('#p-reg', 0, 5000), dues = polNum('#p-dues', 0, 5000), pk = $$('.p-pkg').map(i => ({ id: i.dataset.id, amt: i.value !== '' && +i.value >= 0 ? +i.value : null }));
    if (reg == null || dues == null || pk.some(p => p.amt == null)) return toast('Enter a price of zero or more for every item.', 'bad');
    if (reg !== P.registration) L.push(['Registration fee', `${money(P.registration)} to ${money(reg)}`]);
    if (dues !== P.annualDues) L.push(['Annual dues', `${money(P.annualDues)} to ${money(dues)}`]);
    pk.forEach(p => { const o = P.packages.find(x => x.id === p.id); if (o && o.amt !== p.amt) L.push([o.name, `${money(o.amt)} to ${money(p.amt)}`]); });
    return polConfirm('Packages and prices', L, 'Take payment and registration use the new prices straight away. Payments already recorded keep the price they were taken at.', () => { P.registration = reg; P.annualDues = dues; pk.forEach(p => { P.packages.find(x => x.id === p.id).amt = p.amt; }); });
  }
  if (T === 'booking') {
    const v = { aheadMonths: polNum('#b-ahead', 1, 6), minDays: polNum('#b-min', 0, 14), cancelHours: polNum('#b-cancel', 0, 72), maxPackages: polNum('#b-max', 1, 5) }, o = Object.assign({ aheadMonths: 1, minDays: 1, cancelHours: 4, maxPackages: 2 }, P.booking);
    if (Object.values(v).some(x => x == null)) return toast('Enter whole numbers inside the allowed range.', 'bad');
    const nm = { aheadMonths: 'Months ahead', minDays: 'Online notice (days)', cancelHours: 'Lesson returned (hours before)', maxPackages: 'Packages at once' };
    Object.keys(v).forEach(k => { if (v[k] !== o[k]) L.push([nm[k], `${o[k]} to ${v[k]}`]); });
    return polConfirm('Booking rules', L, `New bookings and cancellations follow these rules from now on. ${plural(BOOKINGS.length, 'booking')} already made are not changed.`, () => { P.booking = v; });
  }
  if (T === 'activation') {
    const on = {}; $$('.p-act').forEach(c => { on[c.dataset.id] = c.checked; });
    P.autoActivation.forEach(r => { if (on[r.id] !== r.on) L.push([r.text, on[r.id] ? 'Off to on' : 'On to off']); });
    return polConfirm('Auto-activation rules', L, `${plural(APPS.length, 'waiting registration')} will be checked again against the new rules. A rule switched off no longer blocks Activate.`, () => { P.autoActivation.forEach(r => { r.on = on[r.id]; }); });
  }
  if (T === 'templates') {
    const edits = $$('.p-tn').map(i => ({ id: i.dataset.id, name: i.value.trim(), text: $(`.p-tt[data-id="${i.dataset.id}"]`).value.trim() }));
    if (edits.some(x => !x.name || !x.text)) return toast('Every template needs a name and a message.', 'bad');
    const nn = $('#t-n-new').value.trim(), nt = $('#t-t-new').value.trim();
    if (!!nn !== !!nt) return toast('A new template needs both a name and a message.', 'bad');
    edits.forEach(x => { const o = P.templates.find(t => t.id === x.id); if (o && (o.name !== x.name || o.text !== x.text)) L.push(['Edited template', x.name]); });
    if (nn) L.push(['New template', nn]);
    return polConfirm('Notification templates', L, 'The front desk sees the new wording in Notifications straight away. Messages already sent are not changed.', () => { edits.forEach(x => { const o = P.templates.find(t => t.id === x.id); o.name = x.name; o.text = x.text; }); if (nn) P.templates.push({ id: uid('T-'), name: nn, text: nt }); });
  }
  if (T === 'triggers') {
    const dec = polNum('#t-dec', 1, 90), ren = polNum('#t-ren', 1, 90), o = Object.assign({ declineDays: 14, renewalDays: 30 }, P.followTriggers);
    if (dec == null || ren == null) return toast('Enter a number of days from 1 to 90.', 'bad');
    if (dec !== o.declineDays) L.push(['Declining attendance', `${o.declineDays} to ${dec} days`]);
    if (ren !== o.renewalDays) L.push(['Renewal coming up', `${o.renewalDays} to ${ren} days`]);
    const n = MEMBERS.filter(m => m.st === 'Active' && bzSeen(m) >= dec).length;
    return polConfirm('Follow-up triggers', L, `With ${dec} days, ${plural(n, 'active member')} would be on the declining attendance list.`, () => { P.followTriggers = { declineDays: dec, renewalDays: ren }; });
  }
}

/* ---------- Staff ---------- */
const STAFF_ROLE = { business: 'Business Admin', frontdesk: 'Front desk', instructor: 'Instructor' };
const stfBAcount = () => DB.staff.filter(s => s.type === 'business' && s.status === 'active').length;
const stfSelf = s => !!ADMIN && ADMIN.id === s.id;
const stfLastBA = s => s.type === 'business' && s.status === 'active' && stfBAcount() <= 1;
function stfNextId(type) {
  const nums = re => DB.staff.map(s => s.id).filter(i => re.test(i)).map(i => +i.slice(4));
  if (type === 'instructor') return 'INS-' + String(Math.max(0, ...nums(/^INS-\d{4}$/)) + 1).padStart(4, '0');
  if (type === 'frontdesk') return 'ADM-' + String(Math.max(100, ...nums(/^ADM-1\d\d$/)) + 1);
  return 'ADM-' + String(Math.max(0, ...nums(/^ADM-0\d\d$/)) + 1).padStart(3, '0');
}
function stfRender() {
  $('#stfRows').innerHTML = DB.staff.map(s => `<tr><td><div class="who"><span class="av">${initials(s.name)}</span><div><b>${esc(s.name)}</b>${stfSelf(s) ? '<span class="num">You</span>' : ''}</div></div></td><td class="num">${esc(s.id)}</td><td>${STAFF_ROLE[s.type]}</td><td>${pill(s.status === 'active' ? 'ok' : 'bad', s.status === 'active' ? 'Active' : 'Deactivated')}</td><td>${s.last ? fmtDate(new Date(s.last)) : 'Never'}</td><td><button class="sbtn" data-stf="${esc(s.id)}">Manage</button></td></tr>`).join('');
}
function stfDrawer(id) {
  const s = DB.staff.find(x => x.id === id); if (!s) return;
  const adm = s.type !== 'instructor', lock = stfSelf(s) || stfLastBA(s);
  const body = `<div class="kv" style="margin:0;border-top:1px solid var(--line)"><div><span>ID</span><span>${esc(s.id)}</span></div><div><span>Role</span><span>${STAFF_ROLE[s.type]}</span></div><div><span>Status</span><span>${s.status === 'active' ? 'Active' : 'Deactivated'}</span></div><div><span>Last sign-in</span><span>${s.last ? fmtDate(new Date(s.last)) : 'Never'}</span></div></div>
    ${adm ? `<div class="fld" style="margin-top:16px"><span class="lbl">Role</span><div class="seg" id="stf-role"><input type="radio" name="stfr" id="sr1" value="frontdesk"${s.type === 'frontdesk' ? ' checked' : ''}${lock ? ' disabled' : ''}><label for="sr1">Front desk</label><input type="radio" name="stfr" id="sr2" value="business"${s.type === 'business' ? ' checked' : ''}${lock ? ' disabled' : ''}><label for="sr2">Business Admin</label></div>${lock ? `<span class="hint">${stfSelf(s) ? 'You cannot change your own role.' : 'The last Business Admin keeps this role.'}</span>` : ''}</div>` : '<p class="sub" style="margin-top:16px">Instructor accounts keep their role. Create a new account to give someone a different one.</p>'}
    <div class="acts" style="margin-top:16px;flex-wrap:wrap"><button class="sbtn" id="stf-reset">${icon('lock')}Reset password</button>${adm && !lock ? '<button class="sbtn" id="stf-saverole">Save role</button>' : ''}</div>
    ${s.status === 'active' ? `<div class="acts" style="margin-top:8px"><button class="sbtn red" id="stf-off"${stfSelf(s) || stfLastBA(s) ? ' disabled' : ''}>Deactivate account</button></div>${stfSelf(s) ? '<span class="hint">You cannot deactivate your own account.</span>' : stfLastBA(s) ? '<span class="hint">This is the last active Business Admin, so it cannot be deactivated.</span>' : ''}` : '<div class="acts" style="margin-top:8px"><button class="sbtn dark" id="stf-on">Reactivate account</button></div>'}`;
  openDrawer(s.name, body, '<button class="sbtn" data-drawer-close>Close</button>');
  const done = msg => { save(); stfRender(); closeDrawer(); toast(msg); };
  $('#stf-reset').addEventListener('click', () => toast(`Password reset link sent to ${s.name} (mock).`));
  const sr = $('#stf-saverole'); if (sr) sr.addEventListener('click', () => { const t = radio('stfr'); if (t && t !== s.type) { s.type = t; done(`${s.name} is now ${STAFF_ROLE[t]}.`); } else toast('The role is unchanged.', 'info'); });
  const off = $('#stf-off'); if (off) off.addEventListener('click', () => {
    if (stfSelf(s)) return toast('You cannot deactivate your own account.', 'bad');
    if (stfLastBA(s)) return toast('The last Business Admin cannot be deactivated.', 'bad');
    s.status = 'inactive'; done(`${s.name} was deactivated. They can no longer sign in.`);
  });
  const on = $('#stf-on'); if (on) on.addEventListener('click', () => { s.status = 'active'; done(`${s.name} was reactivated.`); });
}
function stfCreate() {
  openModal(`<h3 id="modalTitle">Create account</h3><p class="sub">The ID is made for you. The person signs in with it on the staff sign-in page.</p>
    <form id="stfForm" style="margin-top:16px" novalidate>
      <div class="fld"><label for="sc-name">Full name</label><input id="sc-name" maxlength="60" autocomplete="off" autofocus></div>
      <div class="fld" style="margin-top:12px"><span class="lbl">Role</span><div class="seg" id="sc-role"><input type="radio" name="scr" id="sc1" value="instructor" checked><label for="sc1">Instructor</label><input type="radio" name="scr" id="sc2" value="frontdesk"><label for="sc2">Front desk</label><input type="radio" name="scr" id="sc3" value="business"><label for="sc3">Business Admin</label></div></div>
      <p class="sub" style="margin-top:12px">ID: <b id="sc-id"></b></p>
      <div class="acts"><button class="sbtn dark" type="submit">${icon('check')}Create account</button><button class="sbtn" type="button" data-close>Cancel</button></div></form>`);
  const idv = () => { $('#sc-id').textContent = stfNextId(radio('scr')); };
  $('#sc-role').addEventListener('change', idv); idv();
  $('#stfForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('#sc-name').value.trim(); if (name.length < 2) return toast('Enter the full name.', 'bad');
    const type = radio('scr'), id = stfNextId(type);
    DB.staff.push({ id, name, type, status: 'active', last: null }); save(); stfRender();
    openModal(`<h3 id="modalTitle">Account created</h3><div class="kv" style="margin-top:14px"><div><span>Name</span><span>${esc(name)}</span></div><div><span>Role</span><span>${STAFF_ROLE[type]}</span></div><div><span>Sign-in ID</span><span id="newStaffId">${esc(id)}</span></div></div><p class="sub" style="margin-top:12px">They set their password the first time they sign in (mock).</p><div class="acts"><button class="sbtn dark" data-close>Done</button></div>`);
  });
}

/* ---------- Import issues ---------- */
const impUI = { f: 'open' };
function impCount() { const n = s => (DB.imports || []).filter(i => i.status === s).length; ['open', 'fixed', 'dismissed'].forEach(k => { const el = $('#n' + cap1(k)); if (el) el.textContent = n(k); }); if (typeof setCount === 'function') setCount('imports', n('open')); return n('open'); }
function impRender() {
  const open = impCount(), I = DB.imports || [];
  $('#impStats').innerHTML = bzStat('alert', 'Open', open, 'Waiting for a decision') + bzStat('', 'Fixed', I.filter(i => i.status === 'fixed').length, 'Matched to a member') + bzStat('', 'Dismissed', I.filter(i => i.status === 'dismissed').length, 'Left out of the roll');
  $$('#impTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.f === impUI.f));
  $('#impRows').innerHTML = I.filter(i => i.status === impUI.f).map(i => `<div class="row" data-imp="${esc(i.id)}"><span class="av navy">${icon('upload')}</span><div class="grow"><div class="t">${esc(i.issue)}${i.name ? ' · ' + esc(i.name) : ''}</div><div class="d">${esc(i.file)}, row ${i.row} · ${esc(i.detail)}${i.matchedNo ? ` · matched to ${esc(i.matchedNo)}` : ''}</div></div>${i.status === 'open' ? `<div class="acts-inline"><button class="sbtn dark" data-fix="${esc(i.id)}">Fix</button><button class="sbtn" data-dismiss="${esc(i.id)}">Dismiss</button></div>` : pill(i.status === 'fixed' ? 'ok' : 'plain', i.status === 'fixed' ? 'Fixed' : 'Dismissed')}</div>`).join('') || '<p style="color:var(--muted)">Nothing here.</p>';
}
function impFix(id) {
  const it = DB.imports.find(x => x.id === id); if (!it) return;
  openModal(`<h3 id="modalTitle">Match to a member</h3><p class="sub">${esc(it.issue)} · ${esc(it.name || 'No name')} · ${esc(it.file)}, row ${it.row}</p><div class="fld" style="margin-top:14px"><label for="im-q">Find the member</label><input id="im-q" type="search" autocomplete="off" value="${esc((it.name || '').split(/[\s.]+/)[0])}" autofocus></div><div class="rows" id="im-list"></div><div class="acts"><button class="sbtn dark" id="im-go" disabled>Match and mark fixed</button><button class="sbtn" data-close>Cancel</button></div>`);
  let pick = null;
  const draw = () => { $('#im-list').innerHTML = findMembers($('#im-q').value).map(memberBtn).join('') || '<p style="color:var(--muted)">No member found.</p>'; $$('#im-list .row-btn').forEach(b => b.classList.toggle('on', b.dataset.pick === pick)); };
  $('#im-q').addEventListener('input', draw); draw();
  $('#im-list').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (!b) return; pick = b.dataset.pick; $('#im-go').disabled = false; draw(); });
  $('#im-go').addEventListener('click', () => { it.status = 'fixed'; it.matchedNo = pick; save(); closeModal(); impRender(); toast('Row matched and marked fixed.'); });
}
function impInit() {
  impRender();
  $('#impTabs').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { impUI.f = b.dataset.f; impRender(); } });
  $('#impRows').addEventListener('click', e => {
    const f = e.target.closest('[data-fix]'); if (f) return impFix(f.dataset.fix);
    const d = e.target.closest('[data-dismiss]'); if (d) { const it = DB.imports.find(x => x.id === d.dataset.dismiss); if (it) { it.status = 'dismissed'; save(); impRender(); toast('Row dismissed.', 'info'); } }
  });
}

/* ---------- Reports ---------- */
const rpDay = v => new Date(v + 'T00:00:00');
function rpRange() {
  const from = $('#rp-from').value || iso(addMonths(TODAY, -6)), to = $('#rp-to').value || iso(TODAY);
  return { from, to, centre: $('#rp-centre').value };
}
const rpInRange = (d, r) => { const x = iso(d); return x >= r.from && x <= r.to; };
const rpCentre = (no, r) => r.centre === 'all' || (memberByNo(no) || {}).dojo === r.centre;
function rpRows(kind) {
  const r = rpRange();
  if (kind === 'attendance') {
    let end = rpDay(r.to); const start = rpDay(r.from) > addDays(end, -120) ? rpDay(r.from) : addDays(end, -120), out = [['Date', 'Class', 'Time', 'Centre', 'Instructor', 'Booked', 'Capacity', 'Present']];
    for (let d = start; d <= end; d = addDays(d, 1)) SESSIONS.filter(s => s.day === dayIdx(d) && (r.centre === 'all' || s.dojo === r.centre)).forEach(s => {
      if (s.dojo === HQ) { const R = getRoster(d, s); out.push([iso(d), s.type, s.time, dojoName(s.dojo), s.ins, R.rows.length, s.cap, R.submitted ? R.rows.filter(x => x.status === 'present').length : '']); }
      else out.push([iso(d), s.type, s.time, dojoName(s.dojo), s.ins, s.booked, s.cap, '']);
    });
    return out;
  }
  if (kind === 'progression') return [['Name', 'Member no.', 'Grade', 'Centre', 'Sessions', 'Needed', 'Status']].concat(STUDENTS.map(s => ({ s, m: MEMBERS.find(x => x.n === s.n) })).filter(x => r.centre === 'all' || (x.m && x.m.dojo === r.centre)).map(({ s, m }) => [s.n, m ? m.no : '', s.g, m ? dojoName(m.dojo) : '', s.s, s.need, s.st]));
  if (kind === 'payments') return [['Member', 'Member no.', 'Item', 'Date', 'Amount', 'Method', 'Status', 'Invoice']].concat((DB.ledger || []).filter(l => rpInRange(l.date, r) && rpCentre(l.no, r)).map(l => [l.name, l.no, l.item, iso(l.date), l.amt, l.method, l.st, l.inv]));
  return [['Member', 'Member no.', 'Kind', 'Date', 'Method', 'Outcome', 'Note', 'By']].concat((DB.followups || []).filter(f => rpCentre(f.no, r)).flatMap(f => (f.attempts || []).filter(a => rpInRange(a.at, r)).map(a => [f.name, f.no, f.kind, iso(a.at), a.method, a.outcome, a.note || '', a.by || ''])));
}
function rpInit() {
  $('#rp-from').value = iso(addMonths(TODAY, -6)); $('#rp-to').value = iso(TODAY);
  bzSetOpt($('#rp-centre'), [['all', 'All centres']].concat(DOJOS.map(d => [d.id, d.name])), 'all');
  const count = () => ['attendance', 'progression', 'payments', 'followups'].forEach(k => { $('#rpN-' + k).textContent = `${plural(rpRows(k).length - 1, 'row')} with the filters above`; });
  ['#rp-from', '#rp-to', '#rp-centre'].forEach(s => $(s).addEventListener('change', count)); count();
  $('#rpCards').addEventListener('click', e => {
    const b = e.target.closest('[data-export]'); if (!b) return;
    const rows = rpRows(b.dataset.export); downloadCSV(`${b.dataset.export}-${bzCsvStamp()}.csv`, rows);
    toast(`${plural(rows.length - 1, 'row')} exported.`);
  });
}

/* ---------- Notifications (both roles) ---------- */
const nfTpl = () => (DB.policies || {}).templates || [];
function nfTargets(a) {
  if (a === 'HQ class') { const o = []; for (let k = 0; k < 7; k++) { const d = addDays(TODAY, k); hqClassesOn(d).forEach(c => { if (!['Done', 'Cancelled'].includes(classState(d, c))) o.push(`<option value="${iso(d)}|${esc(c.code)}">${dayName(d)} ${fmtShort(d)} · ${timeLabel(c.time)} · ${esc(c.type)}</option>`); }); } return o.join('') || '<option value="">No class in the next 7 days</option>'; }
  if (a === 'One student') return MEMBERS.map(m => `<option value="${esc(m.no)}">${esc(m.n)} · ${esc(m.no)}</option>`).join('');
  if (a === 'One dojo') return DOJOS.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('');
  return BELTS.map(b => `<option>${esc(b.g)}</option>`).join('');
}
function nfAudience() {
  const a = radio('aud'), v = $('#n-target').value;
  if (a === 'All members') return { label: 'All members', n: MEMBERS.length };
  if (a === 'One student') { const m = memberByNo(v); return { label: m ? m.n : 'One student', n: m ? 1 : 0 }; }
  if (a === 'One dojo') return { label: dojoName(v), n: MEMBERS.filter(m => m.dojo === v).length };
  if (a === 'By grade') return { label: v, n: MEMBERS.filter(m => m.g === v).length };
  const [d, code] = String(v).split('|'), c = SESSIONS.find(s => s.code === code);
  return c ? { label: `${c.type} · ${fmtShort(rpDay(d))} ${timeLabel(c.time)}`, n: getRoster(rpDay(d), c).rows.length } : { label: 'HQ class', n: 0 };
}
function nfSent() {
  $('#sentRows').innerHTML = (DB.sentLog || []).slice(0, 8).map(x => `<div class="row"><span class="av navy">${icon('send')}</span><div class="grow"><div class="t">${esc(x.title)}</div><div class="d">${esc(x.aud)} · ${esc(x.by)} · ${fmtShort(new Date(x.at))}</div></div></div>`).join('') || '<p style="color:var(--muted)">Nothing sent yet.</p>';
}
function nfInit() {
  const ba = isBA();
  $('#nSub').textContent = ba ? 'Send an approved template or your own message to everyone, one dojo, a grade, an HQ class or one student.' : 'Send an approved template to an HQ class or one student.';
  $('#tplHint').textContent = ba ? 'Pick a template, or write your own message.' : 'Templates are approved by a Business Admin. You cannot edit the wording.';
  $('#n-tpl').innerHTML = '<option value="">Choose a template</option>' + (ba ? '<option value="own">Write my own message</option>' : '') + nfTpl().map(t => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('');
  const lock = on => { $('#n-title').readOnly = on; $('#n-body').readOnly = on; };
  const show = () => { $('#pvTitle').textContent = $('#n-title').value || 'Your title'; $('#pvBody').textContent = $('#n-body').value || 'Your message appears here.'; $('#nCount').textContent = $('#n-body').value.length; };
  const preview = () => { const a = nfAudience(); $('#audPreview').textContent = `${a.label} · ${plural(a.n, 'recipient')}`; };
  const syncAud = () => {
    const a = radio('aud'), extra = $('#audExtra');
    extra.hidden = a === 'All members';
    $('#audLabel').textContent = { 'HQ class': 'Class', 'One student': 'Student', 'One dojo': 'Dojo', 'By grade': 'Grade' }[a] || 'Target';
    $('#n-target').innerHTML = a === 'All members' ? '' : nfTargets(a);
    preview();
  };
  $('#audSeg').addEventListener('change', syncAud); $('#n-target').addEventListener('change', preview);
  $('#n-tpl').addEventListener('change', () => {
    const v = $('#n-tpl').value, t = nfTpl().find(x => x.id === v);
    if (t) { lock(true); $('#n-title').value = t.name; $('#n-body').value = t.text; }
    else if (v === 'own') { lock(false); $('#n-title').value = ''; $('#n-body').value = ''; $('#n-title').focus(); }
    else { lock(true); $('#n-title').value = ''; $('#n-body').value = ''; }
    show();
  });
  $('#n-title').addEventListener('input', show); $('#n-body').addEventListener('input', show);
  $('#notifyForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!$('#n-tpl').value) { toast(ba ? 'Choose a template or write your own message.' : 'Choose an approved template first.', 'bad'); return; }
    const t = $('#n-title'), b = $('#n-body');
    if (!t.value.trim() || !b.value.trim()) { toast('Add a title and a message first.', 'bad'); (t.value.trim() ? b : t).focus(); return; }
    const a = nfAudience(); if (!a.n) { toast('There is nobody to send this to.', 'bad'); return; }
    (DB.sentLog = DB.sentLog || []).unshift({ at: new Date(), by: who(), aud: a.label, title: t.value.trim() });
    save(); nfSent();
    toast(`Sent to ${a.label} · ${plural(a.n, 'recipient')}${$('#n-email').checked ? ' (push + email)' : ''}`);
    $('#n-tpl').value = ''; $('#n-tpl').dispatchEvent(new Event('change', { bubbles: true }));
  });
  syncAud(); nfSent(); show();
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
    bzOverview();
  },
  sessions() { clInit(); },
  insights() { insInit(); },
  revenue() { revInit(); },
  policies() {
    $('#polTabs').addEventListener('click', e => { const b = e.target.closest('[data-pt]'); if (b) { polUI.tab = b.dataset.pt; polRender(); } });
    polRender();
  },
  staff() {
    stfRender(); filterList('#stfSearch', '#stfRows');
    $('#stfNew').addEventListener('click', stfCreate);
    $('#stfRows').addEventListener('click', e => { const b = e.target.closest('[data-stf]'); if (b) stfDrawer(b.dataset.stf); });
  },
  imports() { impInit(); },
  reports() { rpInit(); },
  notify() { nfInit(); }
});
