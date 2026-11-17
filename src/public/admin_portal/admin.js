'use strict';
/* AIKIDO SHINJU-KAI — admin.js  (office portal: weekly timetable setup and read-only grading)
   Members, Registrations, Extensions, assisted registration and Follow-ups are in admin-members.js.
   Today, Classes > Rosters, Payments and Equipment are in admin-desk.js. Overview, Closures, Insights, Revenue, Policies,
   Staff, Import issues, Reports and Notifications are in admin-business.js. */

const adm = { memFilter: 'All', memQ: '', gradTab: 'apps' };

const pendingMC = () => MC_REQS.filter(r => r.status === 'pending');
const requestCount = () => APPS.length + pendingMC().length;

/* ---------- Timetable: one Session is the weekly plan, one Class is a dated occurrence of it ---------- */
const MATS = ['Mat A', 'Mat B'];
const sesDate = v => v ? new Date(String(v).slice(0, 10) + 'T00:00:00') : null;
const sesMins = t => +t.slice(0, 2) * 60 + +t.slice(3);
const sesEff = s => `${s.effFrom ? 'From ' + fmtShort(sesDate(s.effFrom)) : 'Ongoing'}${s.effTo ? ' to ' + fmtShort(sesDate(s.effTo)) : ''}`;

function renderSessions() {
  if (!$('#sesRows')) return;
  $('#sesRows').innerHTML = SESSIONS.map((s, i) => `<tr><td><b>${esc(s.type)}</b></td><td>Every ${DSHORT[s.day].charAt(0) + DSHORT[s.day].slice(1).toLowerCase()} · ${timeLabel(s.time)} to ${timeLabel(s.end || s.time)}</td><td>${esc(dojoName(s.dojo))} · ${esc(s.mat || 'Mat A')}</td><td>${esc(sesEff(s))}</td><td>${esc(s.ins)}</td><td class="num">${s.booked}/${s.cap}</td><td><span class="pill ${s.dojo === HQ ? 'ok' : 'plain'}">${s.dojo === HQ ? 'Yes' : 'No, HQ only'}</span></td><td><span class="pill navy plain num">${icon('nfc', 'ic')} ${esc(s.code)}</span></td><td><div class="acts" style="display:flex;gap:6px"><button class="sbtn ghost" data-edit="${i}" aria-label="Edit">${icon('edit')}</button><button class="sbtn ghost" data-del="${i}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`).join('');
}

/* why a weekly session cannot be saved: same instructor at the same time, same mat overlapping, or an HQ closure on its first day. '' = fine */
function sessionClash(n, self) {
  const range = s => [s.effFrom || '0000-01-01', s.effTo || '9999-12-31'];
  const meets = (a, b) => { const x = range(a), y = range(b); return x[0] <= y[1] && y[0] <= x[1]; };
  const other = SESSIONS.filter((x, k) => k !== self && x.day === n.day && Math.abs(sesMins(x.time) - sesMins(n.time)) < 60 && meets(x, n));
  const ins = other.find(x => x.ins === n.ins);
  if (ins) return `${n.ins} already teaches ${ins.type} at ${timeLabel(ins.time)} on that day.`;
  const mat = other.find(x => x.dojo === n.dojo && (x.mat || 'Mat A') === n.mat);
  if (mat) return `${n.mat} at ${dojoName(n.dojo)} is already used by ${mat.type} at ${timeLabel(mat.time)}.`;
  if (n.dojo === HQ && n.effFrom) {
    const c = (DB.closures || []).find(k => k.scope === 'HQ' && isoDate(new Date(k.from)) <= n.effFrom && n.effFrom <= isoDate(new Date(k.to)));
    if (c) return `HQ is closed on ${fmtShort(sesDate(n.effFrom))}${c.note ? ' (' + c.note + ')' : ''}. Pick another start date.`;
  }
  return '';
}

/* preset: values for a new session, e.g. a pilot slot suggested by Insights */
function openSessionForm(i, preset) {
  const s = i !== undefined ? SESSIONS[i] : Object.assign({ type: 'Adults', day: 0, time: '19:00', dojo: 'hq', ins: 'Bob Tan Sensei', cap: 20, mat: 'Mat A' }, preset || {});
  const types = ['Adults', 'Children Beginners', 'Children Juniors', 'Mixed', 'Weapons', 'Intermediate', 'Advanced', 'Ladies', 'SG50'];
  const D = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const pilot = i === undefined && preset && preset.pilot;
  openModal(`<h3 id="modalTitle">${i !== undefined ? 'Edit session' : pilot ? 'New pilot slot' : 'New session'}</h3><p class="sub">A session is the weekly plan. Each week it creates a dated class. A check-in code is written to the dojo's NFC tag. Only HQ classes can be booked online.</p>
    <form id="sesForm" class="grid2" style="margin-top:18px" novalidate>
      <div class="fld full"><label for="s-type">Class type</label><select id="s-type">${types.map(t => `<option${t === s.type ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-day">Day</label><select id="s-day">${D.map((d, k) => `<option value="${k}"${k === s.day ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-time">Start time</label><select id="s-time">${TIMES.map(t => `<option value="${t}"${t === s.time ? ' selected' : ''}>${timeLabel(t)}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-dojo">Dojo</label><select id="s-dojo">${DOJOS.map(d => `<option value="${d.id}"${d.id === s.dojo ? ' selected' : ''}>${d.name}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-mat">Mat</label><select id="s-mat">${MATS.map(m => `<option${m === (s.mat || 'Mat A') ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-cap">Capacity</label><input id="s-cap" type="number" min="4" max="40" value="${s.cap}"></div>
      <div class="fld"><label for="s-ins">Instructor</label><select id="s-ins">${INSTRUCTORS.map(x => `<option${x[0] === s.ins ? ' selected' : ''}>${x[0]}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-from">Effective from</label><input id="s-from" type="date" value="${esc(s.effFrom || '')}"></div>
      <div class="fld"><label for="s-to">Effective until (optional)</label><input id="s-to" type="date" value="${esc(s.effTo || '')}"></div>
      <div class="fld full"><span class="hint" id="s-online"></span></div>
      <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}${i !== undefined ? 'Save changes' : 'Create session'}</button></div>
    </form>`, true);
  const online = () => { $('#s-online').textContent = $('#s-dojo').value === HQ ? 'Bookable online: yes (HQ classes only). Check-in code: ' + (s.code || 'made when saved') : 'Bookable online: no. Only HQ classes can be booked online. Check-in code: ' + (s.code || 'made when saved'); };
  $('#s-dojo').addEventListener('change', online); online();
  $('#sesForm').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#s-time').value;
    const n = Object.assign({}, i !== undefined ? s : {}, { type: $('#s-type').value, day: +$('#s-day').value, time: t, end: `${String(Math.min(23, +t.slice(0, 2) + 1)).padStart(2, '0')}:${t.slice(3)}`, dojo: $('#s-dojo').value, mat: $('#s-mat').value, ins: $('#s-ins').value, cap: Math.max(4, +$('#s-cap').value || 20), booked: s.booked || 0, kids: /Children/.test($('#s-type').value), effFrom: $('#s-from').value || '', effTo: $('#s-to').value || '' });
    n.online = n.dojo === HQ;
    if (n.effFrom && n.effTo && n.effTo < n.effFrom) return toast('The end date is before the start date.', 'bad');
    const why = sessionClash(n, i); if (why) return toast(`Not saved. ${why}`, 'bad');
    n.code = s.code || sessionCode(n.dojo, n.day, n.time, 1000 + Math.floor(Math.random() * 9000));
    if (i !== undefined) SESSIONS[i] = n; else SESSIONS.unshift(n);
    save(); renderSessions(); closeModal(); toast(i !== undefined ? 'Session updated' : `Session created · code ${n.code}`);
  });
}

/* the demo student's own bookings on a weekly session (the sample seat counts cover everyone else) */
const sessionMine = s => BOOKINGS.filter(b => b.c && b.c.type === s.type && b.c.time === s.time && b.c.day === s.day);

/* ---------- Grading (Business Admin, read only) ----------
   Belts change only through grading. This page lists applications and the results instructors sent in. The one demo
   button applies a result so the student portal can show the promotion; the real system does this when the panel decides. */
function renderGrading() {
  if (!$('#gradRows')) return;
  $('#gradTabs [data-g="apps"] .n').textContent = GRAD_APPS.length;
  $('#gradTabs [data-g="props"] .n').textContent = PROPOSALS.length;
  if (adm.gradTab === 'apps') {
    $('#gradRows').innerHTML = GRAD_APPS.length ? GRAD_APPS.map(g => `<div class="row"><span class="av">${initials(g.n)}</span><div class="grow"><div class="t">${esc(g.n)}</div><div class="d">${esc(g.from)} to ${esc(g.to)} · submitted ${esc(g.sub)} · ${esc(g.note)}</div></div><div class="acts"><span class="pill ${g.sched ? 'ok' : 'plain'}">${g.sched ? esc(g.sched) : 'Waiting for the grading day'}</span></div></div>`).join('') : '<p style="color:var(--muted)">No applications.</p>';
  } else {
    $('#gradRows').innerHTML = PROPOSALS.length ? PROPOSALS.map((p, i) => `<div class="row"><span class="av">${initials(p.n)}</span><div class="grow"><div class="t">${esc(p.n)} · ${esc(p.result)}</div><div class="d">${esc(p.from)} to ${esc(p.to)} · signed by ${esc(p.by)}</div>${p.well || p.next ? `<dl class="fb-mini">${p.well ? `<dt>Went well</dt><dd>${esc(p.well)}</dd>` : ''}${p.next ? `<dt>Work on next</dt><dd>${esc(p.next)}</dd>` : ''}</dl>` : `<div class="d">“${esc(p.fb)}”</div>`}${p.sig ? `<img class="sig-thumb" src="${p.sig}" alt="Signature of ${esc(p.by)}">` : ''}</div><div class="acts"><span class="pill ${/^Pass/.test(p.result) ? 'ok' : p.result === 'Fail' ? 'bad' : 'warn'}">${esc(p.result)}</span><button class="sbtn" data-promote="${i}">${icon('check')}Apply result (demo)</button></div></div>`).join('') : '<p style="color:var(--muted)">No results waiting.</p>';
  }
}

function promote(i) {
  const p = PROPOSALS.splice(i, 1)[0];
  if (!/^Pass/.test(p.result)) {   // retake / fail: no rank change, the student just sees the result
    if (p.n === ME.name) { const f = GRADE_FB.find(x => x.result === p.result && x.status === 'Sent to HQ'); if (f) f.status = 'Confirmed'; }
    if (p.result === 'Fail') { const s = STUDENTS.find(x => x.n === p.n); if (s) { s.s = 0; s.st = ST_PROGRESS; } }
    save(); renderGrading();
    toast(`${p.result} result for ${p.n} confirmed. Student notified.`, 'info'); return;
  }
  const m = MEMBERS.find(x => x.n === p.n); if (m) m.g = p.to;
  const s = STUDENTS.find(x => x.n === p.n); if (s) { s.g = p.to; s.s = 0; s.st = ST_PROGRESS; }
  if (p.n === ME.name) {   // the student sees a promotion celebration on their home page
    DB.levelUps.push({ kind: 'promotion', to: p.to, date: new Date(TODAY) });
    const f = GRADE_FB.find(x => x.to === p.to && /^Pass/.test(x.result)); if (f) f.status = 'Promoted';
  }
  save(); renderGrading();
  toast(`${p.n} promoted to ${p.to}`);
}

runPage({
  sessions() {
  if (!$('#sesRows')) return;   // the Timetable tab only exists for Business Admins
  renderSessions();
  $('#newSession').addEventListener('click', () => openSessionForm());
  $('#sesRows').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'); if (ed) openSessionForm(+ed.dataset.edit);
    const del = e.target.closest('[data-del]');
    if (del) {
      const k = +del.dataset.del, s = SESSIONS[k], mine = sessionMine(s), n = Math.max(s.booked || 0, mine.length);
      openModal(`<h3 id="modalTitle">Delete this weekly session?</h3><p class="sub">${esc(s.type)} · ${DSHORT[s.day]} ${timeLabel(s.time)} · ${esc(dojoName(s.dojo))}. A session is the weekly plan, so every future class that comes from it is removed.</p><div class="note warn" style="margin-top:16px"><svg class="ic"><use href="#i-info"/></svg><span id="delAffected">${plural(n, 'upcoming booking')} will be affected. Students are notified and each lesson is returned to their package.</span></div><div class="acts"><button class="sbtn red" id="doDel">Delete session</button><button class="sbtn" data-close>Keep</button></div>`);
      $('#doDel').addEventListener('click', () => {
        mine.forEach(b => { const p = MY_PASSES.find(x => x.id === b.passId); BOOKINGS.splice(BOOKINGS.indexOf(b), 1); if (p) p.left++; });
        SESSIONS.splice(k, 1);
        (DB.sentLog = DB.sentLog || []).unshift({ at: new Date(), by: ADMIN ? ADMIN.name : 'Admin', aud: `${s.type} · ${DSHORT[s.day]} ${timeLabel(s.time)}`, title: 'Session removed. Lessons returned.' });
        save(); renderSessions(); closeModal(); toast(`Session deleted. ${plural(n, 'booking')} returned.`);
      });
    }
  });
  },
  grading() {
  $('#gradTabs').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; adm.gradTab = b.dataset.g; $$('#gradTabs .fpill').forEach(x => x.classList.toggle('on', x === b)); renderGrading(); });
  $('#gradRows').addEventListener('click', e => {
    const p = e.target.closest('[data-promote]'); if (p) promote(+p.dataset.promote);
  });
  renderGrading();
  }
});

// search boxes: each one filters only its own list
runPage({
  sessions() { if ($('#sesSearch')) filterList('#sesSearch', '#sesRows'); },
  grading() { filterList('#gradSearch', '#gradRows'); }
});
