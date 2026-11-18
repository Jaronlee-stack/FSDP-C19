'use strict';
/* AIKIDO SHINJU-KAI — admin.js  (office portal, Business Admin: weekly timetable setup and grading approvals)
   Members, Registrations, Extensions, assisted registration and Follow-ups are in admin-members.js.
   Today, Classes > Rosters, Payments and Equipment are in admin-desk.js. Overview, Closures, Insights, Revenue, Policies,
   Staff, Import issues, Reports and Notifications are in admin-business.js. Data comes from admin-data-business.js (the API). */

/* ---------- Timetable: one Session is the weekly plan, one Class is a dated occurrence of it ---------- */
const MATS = ['Mat A', 'Mat B'];
const sesMins = t => +t.slice(0, 2) * 60 + +t.slice(3);
const TT = { rows: [] };
/* start times the form offers: every hour from 06:00 to 21:00, plus the class's own time if it is something else */
const ttTimes = cur => { const a = []; for (let h = 6; h <= 21; h++) a.push(String(h).padStart(2, '0') + ':00'); if (cur && !a.includes(cur)) a.push(cur); return a.sort(); };

function renderSessions() {
  if (!$('#sesRows')) return;
  $('#sesRows').innerHTML = TT.rows.map(s => `<tr><td><b>${esc(s.type)}</b></td><td>Every ${DSHORT[s.day].charAt(0) + DSHORT[s.day].slice(1).toLowerCase()} · ${timeLabel(s.time)} to ${timeLabel(s.end || s.time)}</td><td>${esc(s.dojoName)} · ${esc(s.mat || 'Mat A')}</td><td>${esc(s.ins)}</td><td class="num">${s.nextDate ? `${s.booked}/${s.cap}` : '—'}</td><td><span class="pill ${s.online ? 'ok' : 'plain'}">${s.online ? 'Yes' : 'No, HQ only'}</span></td><td><span class="pill navy plain num">${icon('nfc', 'ic')} ${esc(s.code)}</span></td><td><div class="acts" style="display:flex;gap:6px"><button class="sbtn ghost" data-edit="${esc(s.id)}" aria-label="Edit">${icon('edit')}</button><button class="sbtn ghost" data-del="${esc(s.id)}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`).join('');
}
async function loadSessions() {
  const r = await run(() => ASK.load.baTimetable());
  if (r) { TT.rows = r.templates; renderSessions(); }
}

/* id: a weekly class to edit, or undefined for a new one. preset: values for a new session, e.g. a pilot slot suggested by Insights.
   onSaved: what to do after a save (the timetable reloads when it is not given). The server refuses a clash with the same instructor, the same mat or a grading day. */
function openSessionForm(id, preset, onSaved) {
  const cur = id !== undefined ? TT.rows.find(x => x.id === id) : null;
  const s = cur ? { type: cur.type, day: cur.day, time: cur.time, dojoId: cur.dojoId, instructorId: cur.instructorId, cap: cur.cap, mat: cur.mat, code: cur.code }
    : Object.assign({ type: 'Adults', day: 0, time: '19:00', dojoId: 'hq', instructorId: (ASK.ref.instructors[0] || {}).id, cap: 20, mat: 'Mat A' }, preset || {});
  const types = ['Adults', 'Children Beginners', 'Children Juniors', 'Mixed', 'Weapons', 'Intermediate', 'Advanced', 'Ladies', 'SG50'];
  const D = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const pilot = !cur && preset && preset.pilot;
  openModal(`<h3 id="modalTitle">${cur ? 'Edit session' : pilot ? 'New pilot slot' : 'New session'}</h3><p class="sub">A session is the weekly plan. Each week it creates a dated class. Only HQ classes can be booked online. It cannot be saved when the same instructor or the same mat is used at that time, or when it clashes with a grading day.</p>
    <form id="sesForm" class="grid2" style="margin-top:18px" novalidate>
      <div class="fld full"><label for="s-type">Class type</label><select id="s-type">${types.map(t => `<option${t === s.type ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-day">Day</label><select id="s-day">${D.map((d, k) => `<option value="${k}"${k === s.day ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-time">Start time</label><select id="s-time">${ttTimes(s.time).map(t => `<option value="${t}"${t === s.time ? ' selected' : ''}>${timeLabel(t)}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-dojo">Dojo</label><select id="s-dojo">${DOJOS.map(d => `<option value="${d.id}"${d.id === s.dojoId ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-mat">Mat</label><select id="s-mat">${MATS.map(m => `<option${m === (s.mat || 'Mat A') ? ' selected' : ''}>${m}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-cap">Capacity</label><input id="s-cap" type="number" min="1" max="200" value="${s.cap}"></div>
      <div class="fld"><label for="s-ins">Instructor</label><select id="s-ins">${ASK.ref.instructors.map(x => `<option value="${esc(x.id)}"${x.id === s.instructorId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="fld full"><span class="hint" id="s-online"></span></div>
      <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}${cur ? 'Save changes' : 'Create session'}</button></div>
    </form>`, true);
  const online = () => { $('#s-online').textContent = ($('#s-dojo').value === HQ ? 'Bookable online: yes (HQ classes only).' : 'Bookable online: no. Only HQ classes can be booked online.') + ' The class code is made when saved.'; };
  $('#s-dojo').addEventListener('change', online); online();
  $('#sesForm').addEventListener('submit', async e => {
    e.preventDefault();
    const body = { dojoId: $('#s-dojo').value, weekday: +$('#s-day').value, start: $('#s-time').value, mat: $('#s-mat').value, type: $('#s-type').value, instructorId: $('#s-ins').value, capacity: Math.round(+$('#s-cap').value) };
    if (!(body.capacity >= 1 && body.capacity <= 200)) return toast('Capacity must be between 1 and 200.', 'bad');
    let r;
    try { r = await (cur ? ASK.act.baTimetableUpdate(cur.id, body) : ASK.act.baTimetableCreate(body)); } catch (err) { return toast(`Not saved. ${err.message}`, 'bad'); }
    closeModal();
    if (onSaved) return onSaved(r);
    await loadSessions(); if (typeof loadWeek === 'function') loadWeek();
    toast(cur ? 'Session updated' : `Session created · code ${r.template.code}`);
  });
}

/* ---------- Grading (Business Admin) ----------
   Belts change only through grading. HQ approves or rejects each application, and approves or declines the promotion of a student
   the examiners passed. The server sets the rank, the date of the passed grading and starts the hours toward the next grade again. */
const adm = { gradTab: 'apps', grad: { apps: [], proposals: [] } };
function renderGrading() {
  if (!$('#gradRows')) return;
  const G = adm.grad;
  $('#gradTabs [data-g="apps"] .n').textContent = G.apps.length;
  $('#gradTabs [data-g="props"] .n').textContent = G.proposals.length;
  if (adm.gradTab === 'apps') {
    $('#gradRows').innerHTML = G.apps.length ? G.apps.map(g => `<div class="row"><span class="av">${initials(g.name)}</span><div class="grow"><div class="t">${esc(g.name)}</div><div class="d">${esc(g.from)} to ${esc(g.to)} · submitted ${fmtShort(new Date(g.submittedAt))}${g.feePaid !== null ? ` · fee paid ${money(g.feePaid)}` : ''}${g.note ? ' · ' + esc(g.note) : ''}</div></div><div class="acts">${g.status === 'Submitted'
      ? `<button class="sbtn dark" data-approve="${esc(g.id)}">${icon('check')}Approve</button><button class="sbtn" data-reject="${esc(g.id)}">Reject</button>`
      : `<span class="pill ok">${esc(g.sessionLabel || 'Approved')}${g.sessionDate ? ' · ' + fmtShort(ASK.d(g.sessionDate)) : ''}</span>`}</div></div>`).join('') : '<p style="color:var(--muted)">No applications.</p>';
  } else {
    $('#gradRows').innerHTML = G.proposals.length ? G.proposals.map(p => `<div class="row"><span class="av">${initials(p.name)}</span><div class="grow"><div class="t">${esc(p.name)} · ${esc(p.result)}${p.score !== null && p.score !== undefined ? ` (${p.score}%)` : ''}</div><div class="d">${esc(p.from)} to ${esc(p.to)} · signed by ${esc(p.by || 'the examiners')} · ${esc(p.sessionLabel)}</div>${p.well || p.next ? `<dl class="fb-mini">${p.well ? `<dt>Went well</dt><dd>${esc(p.well)}</dd>` : ''}${p.next ? `<dt>Work on next</dt><dd>${esc(p.next)}</dd>` : ''}</dl>` : ''}</div><div class="acts"><span class="pill ok">${esc(p.result)}</span><button class="sbtn dark" data-promote="${esc(p.sessionId)}|${esc(p.userId)}">${icon('check')}Approve promotion</button><button class="sbtn" data-decline="${esc(p.sessionId)}|${esc(p.userId)}">Decline</button></div></div>`).join('') : '<p style="color:var(--muted)">No results waiting.</p>';
  }
}
async function loadGrading() {
  const r = await run(() => ASK.load.baGrading());
  if (r) { adm.grad = r; renderGrading(); }
}
function rejectApplication(id) {
  const g = adm.grad.apps.find(x => x.id === id); if (!g) return;
  openModal(`<h3 id="modalTitle">Reject this application?</h3><p class="sub">${esc(g.name)} · ${esc(g.from)} to ${esc(g.to)}</p><div class="fld" style="margin-top:14px"><label for="ga-note">Reason shown to the student</label><textarea id="ga-note" maxlength="300" placeholder="e.g. Needs more sessions in the current grade"></textarea></div><div class="acts"><button class="sbtn red" id="ga-go">Reject application</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#ga-go').addEventListener('click', async () => {
    const note = $('#ga-note').value.trim(); if (!note) return toast('Say why the application is rejected.', 'bad');
    if (!(await run(() => ASK.act.baGradingApp(id, { decision: 'rejected', note })))) return;
    closeModal(); await loadGrading(); toast(`Application from ${g.name} rejected.`, 'info');
  });
}

runPage({
  async sessions() {
    if (!$('#sesRows')) return;   // the Timetable tab only exists for Business Admins
    $('#newSession').addEventListener('click', () => openSessionForm());
    $('#sesRows').addEventListener('click', e => {
      const ed = e.target.closest('[data-edit]'); if (ed) openSessionForm(ed.dataset.edit);
      const del = e.target.closest('[data-del]');
      if (del) {
        const s = TT.rows.find(x => x.id === del.dataset.del); if (!s) return;
        openModal(`<h3 id="modalTitle">Delete this weekly session?</h3><p class="sub">${esc(s.type)} · ${DSHORT[s.day]} ${timeLabel(s.time)} · ${esc(s.dojoName)}. A session is the weekly plan, so every future class that comes from it is removed.</p><div class="note warn" style="margin-top:16px"><svg class="ic"><use href="#i-info"/></svg><span id="delAffected">Coming classes that have bookings are cancelled. Students are notified and each lesson is returned to their package.</span></div><div class="acts"><button class="sbtn red" id="doDel">Delete session</button><button class="sbtn" data-close>Keep</button></div>`);
        $('#doDel').addEventListener('click', async () => {
          const r = await run(() => ASK.act.baTimetableDelete(s.id)); if (!r) return;
          closeModal(); await loadSessions(); if (typeof loadWeek === 'function') loadWeek();
          toast(`Session deleted. ${plural(r.lessons, 'lesson')} returned to ${plural(r.students, 'student')}.`);
        });
      }
    });
    await loadSessions();
  },
  async grading() {
    $('#gradTabs').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; adm.gradTab = b.dataset.g; $$('#gradTabs .fpill').forEach(x => x.classList.toggle('on', x === b)); renderGrading(); });
    $('#gradRows').addEventListener('click', async e => {
      const ap = e.target.closest('[data-approve]');
      if (ap) { const g = adm.grad.apps.find(x => x.id === ap.dataset.approve); if (await run(() => ASK.act.baGradingApp(ap.dataset.approve, { decision: 'approved' }))) { await loadGrading(); toast(`Application from ${g ? g.name : 'the student'} approved. They are on the examiners' list.`); } return; }
      const rj = e.target.closest('[data-reject]'); if (rj) return rejectApplication(rj.dataset.reject);
      const pr = e.target.closest('[data-promote], [data-decline]');
      if (pr) {
        const promote = pr.hasAttribute('data-promote'), [sessionId, userId] = (pr.dataset.promote || pr.dataset.decline).split('|');
        const p = adm.grad.proposals.find(x => x.sessionId === sessionId && x.userId === userId);
        if (await run(() => ASK.act.baPromotion(sessionId, userId, promote ? 'promote' : 'decline'))) { await loadGrading(); toast(promote ? `${p ? p.name : 'The student'} promoted to ${p ? p.to : 'the next grade'}` : 'Promotion declined.', promote ? 'ok' : 'info'); }
      }
    });
    await loadGrading();
  }
});

// search boxes: each one filters only its own list
runPage({
  sessions() { if ($('#sesSearch')) filterList('#sesSearch', '#sesRows'); },
  grading() { filterList('#gradSearch', '#gradRows'); }
});
