'use strict';
/* AIKIDO SHINJU-KAI — admin.js  (HQ admin portal pages) */

const adm = { memFilter: 'All', memQ: '', gradTab: 'apps' };

const pendingMC = () => MC_REQS.filter(r => r.status === 'pending');
const requestCount = () => APPS.length + pendingMC().length;

function renderApps() {
  if (!$('#appRows')) { setCount('applications', requestCount()); return; }
  $('#appRows').innerHTML = APPS.length ? APPS.map((a, i) => `<div class="row"><span class="av${a.isNew ? ' navy' : ''}">${initials(a.n)}</span><div class="grow"><div class="t">${esc(a.n)}${a.group === 'Child' ? ` <span class="pill plain" style="height:20px;font-size:11px">Age ${a.age}</span>` : ''}${a.isNew ? ' <span class="pill bad plain" style="height:20px;font-size:11px">New</span>' : ''}</div><div class="d">${esc(dojoName(a.dojo))} · ${esc(a.date)} · ${money(a.paid)} paid${a.med.startsWith('Yes') ? ' · <b style="color:var(--warn)">medical note</b>' : ''}</div></div><div class="acts"><button class="sbtn" data-app="${i}">View form</button><button class="sbtn dark" data-approve="${i}">${icon('check')}Approve</button></div></div>`).join('') : '<p style="color:var(--muted)">All caught up. No applications waiting.</p>';
  setCount('applications', requestCount());
}

/* ---------- package extension requests (student sends an MC, or uses Compassion Guaranteed) ---------- */
function renderMCReqs() {
  const el = $('#mcRows'); if (!el) return;
  const list = MC_REQS.map((r, i) => ({ r, i }));
  const pend = list.filter(x => x.r.status === 'pending'), past = list.filter(x => x.r.status !== 'pending').slice(0, 5);
  const when = r => r.kind === 'mc' ? `MC ${fmtShort(new Date(r.from))} – ${fmtShort(new Date(r.to))}` : 'Compassion Guaranteed (no MC needed)';
  el.innerHTML = (pend.length ? pend.map(({ r, i }) => `<div class="row"><span class="av navy">${icon(r.kind === 'mc' ? 'doc' : 'gift')}</span><div class="grow"><div class="t">${esc(r.n)} · +${plural(r.days, 'day')}</div><div class="d">${esc(r.passName)} · ${when(r)} · sent ${fmtShort(new Date(r.date))}</div></div><div class="acts"><button class="sbtn" data-mc-view="${i}">View</button><button class="sbtn dark" data-mc-ok="${i}">${icon('check')}Approve</button></div></div>`).join('')
    : '<p style="color:var(--muted)">No extension requests waiting.</p>')
    + (past.length ? `<h4 class="mc-past-h">Recently handled</h4>${past.map(({ r }) => `<div class="row"><span class="av">${icon(r.kind === 'mc' ? 'doc' : 'gift')}</span><div class="grow"><div class="t">${esc(r.n)} · +${plural(r.days, 'day')}</div><div class="d">${esc(r.passName)} · ${when(r)}</div></div><span class="pill ${r.status === 'approved' ? 'ok' : 'bad'}">${r.status === 'approved' ? 'Approved' : 'Not approved'}</span></div>`).join('')}` : '');
  setCount('applications', requestCount());
}

function openMCReq(i) {
  const r = MC_REQS[i]; if (!r) return;
  const pass = MY_PASSES.find(p => p.id === r.passId);
  const cur = pass ? pass.expires : new Date(r.oldExp);
  openDrawer(`Extension · ${r.n}`, `<div class="kv" style="margin:0;border-top:1px solid var(--line)">
      <div><span>Member</span><span>${esc(r.n)} · ${esc(r.no)}</span></div>
      <div><span>Package</span><span>${esc(r.passName)}</span></div>
      <div><span>Type</span><span>${r.kind === 'mc' ? 'Medical certificate' : 'Compassion Guaranteed'}</span></div>
      ${r.kind === 'mc' ? `<div><span>MC dates</span><span>${fmtDate(new Date(r.from))} – ${fmtDate(new Date(r.to))}</span></div><div><span>MC file</span><span>${esc(r.fileName || '—')}</span></div>` : ''}
      <div><span>Extend by</span><span>${plural(r.days, 'day')}</span></div>
      <div><span>Expires now</span><span>${fmtDate(new Date(cur))}</span></div>
      <div><span>After approval</span><span>${fmtDate(addDays(new Date(cur), r.days))}</span></div>
      <div><span>Sent</span><span>${fmtDate(new Date(r.date))}</span></div>
    </div>
    ${r.note ? `<div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span><b>Member's note:</b> ${esc(r.note)}</span></div>` : ''}
    ${r.kind === 'compassion' ? '<div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>Compassion Guaranteed covers up to 2 weeks on the children\'s 1-month pass, no questions asked.</span></div>' : '<div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>Check the MC is valid and covers the dates above before approving.</span></div>'}
    <div class="fld" style="margin-top:16px"><label for="mc-why">Reason if not approved<span class="opt">Sent to the member</span></label><textarea id="mc-why" placeholder="e.g. MC dates don't match the missed classes"></textarea></div>`,
    `<button class="sbtn" id="mcReject">Not approved</button><button class="sbtn dark" data-mc-ok="${i}">${icon('check')}Approve</button>`);
  $('#mcReject').addEventListener('click', () => {
    r.status = 'rejected'; r.reason = $('#mc-why').value.trim(); save(); renderMCReqs(); closeDrawer();
    toast(`Extension for ${r.n} not approved. Member notified.`, 'info');
  });
}
function approveMC(i) {
  const r = MC_REQS[i]; if (!r || r.status !== 'pending') return;
  const pass = MY_PASSES.find(p => p.id === r.passId);
  if (pass) pass.expires = addDays(pass.expires, r.days);
  r.status = 'approved'; r.newExp = pass ? pass.expires : addDays(new Date(r.oldExp), r.days);
  save(); renderMCReqs(); closeDrawer();
  toast(`${r.passName} extended by ${plural(r.days, 'day')} for ${r.n}.`);
}
document.addEventListener('click', e => {
  const v = e.target.closest('[data-mc-view]'); if (v) { openMCReq(+v.dataset.mcView); return; }
  const ok = e.target.closest('[data-mc-ok]'); if (ok) { e.stopPropagation(); approveMC(+ok.dataset.mcOk); }
});

function openApp(i) {
  const a = APPS[i];
  const rows = [['Name', a.n], ['Gender', a.gender], ['Age', a.age], ['Nationality', a.nat], ['Mobile', a.phone], ['Email', a.email], ['Emergency contact', a.ec], ['Martial arts experience', a.exp], ['Previous ASK member', a.prev], ['Medical history', a.med], ['Principal dojo', dojoName(a.dojo)], ['Dogi', a.dogi], ['Lesson package', a.pkg], ['Paid', money(a.paid)], ['Submitted', a.date], ['Terms & PDPA', 'Agreed']];
  openDrawer(`Application · ${a.n}`, `${a.med.startsWith('Yes') ? `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span><b>Medical note:</b> ${esc(a.med.slice(6))}. Share with the principal dojo instructor.</span></div>` : ''}
    <div class="kv" style="margin:0;border-top:1px solid var(--line)">${rows.map(([k, v]) => `<div><span>${k}</span><span>${esc(v)}</span></div>`).join('')}</div>
    ${(a.exps || []).length ? `<div class="app-exps"><h4>Experience and documents</h4>${a.exps.map((x, xi) => `<div class="app-exp"><b>${esc(x.art || 'Martial art')}</b>${x.grade ? `<span>${esc(x.grade)}</span>` : ''}
      ${x.files.length ? `<div class="app-docs">${x.files.map((f, fi) => f.thumb ? `<button type="button" class="app-doc" data-doc="${xi}:${fi}" aria-label="Open ${esc(f.name)}"><img src="${f.thumb}" alt=""></button>` : `<span class="app-doc pdf" title="${esc(f.name)}">${icon('doc')}<small>PDF</small></span>`).join('')}</div>` : '<small class="app-nodoc">No documents attached</small>'}</div>`).join('')}</div>` : ''}
    <div class="sig-view"><span>Signed by <b>${esc(a.signer || a.n)}</b>${a.sig ? ` · ${esc(a.date)}` : ''}</span>${a.sig ? `<img src="${a.sig}" alt="Signature of ${esc(a.signer || a.n)}">` : '<em>Signature on the scanned paper form</em>'}</div>
    <div class="fld"><label for="app-grade">Starting grade</label><select id="app-grade"><option>6th Kyu (white belt)</option>${a.exp.includes('Aikido') ? '<option>Carry over after record check</option>' : ''}</select></div>`,
    `<button class="sbtn" id="appReject">Reject</button><button class="sbtn dark" data-approve="${i}">${icon('check')}Approve &amp; activate</button>`);
  $('#drawer').querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', () => {
    const [xi, fi] = b.dataset.doc.split(':').map(Number), f = a.exps[xi].files[fi];
    openModal(`<h3 id="modalTitle">${esc(f.name)}</h3><p class="sub">${esc(a.n)} · ${esc(a.exps[xi].art)}</p><img class="doc-preview" src="${f.thumb}" alt="${esc(f.name)}">`);
  }));
  $('#appReject').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Reject ${esc(a.n)}?</h3><p class="sub">They'll get an email and a full refund of ${money(a.paid)}.</p><div class="fld" style="margin-top:16px"><label for="rej-why">Reason (sent to the applicant)</label><textarea id="rej-why" autofocus></textarea></div><div class="acts"><button class="sbtn red" id="doReject">Reject and refund</button><button class="sbtn" data-close>Back</button></div>`);
    $('#doReject').addEventListener('click', () => { APPS.splice(i, 1); save(); renderApps(); closeModal(); closeDrawer(); toast('Application rejected. Refund issued.', 'info'); });
  });
}
document.addEventListener('click', e => { const b = e.target.closest('#drawer [data-approve]'); if (b) { e.stopPropagation(); approveApp(+b.dataset.approve); } }, true);

function approveApp(i) {
  const a = APPS[i]; if (!a) return;
  APPS.splice(i, 1);
  MEMBERS.unshift({ n: a.n, no: a.no || `ASK-2026-${3000 + Math.floor(Math.random() * 6000)}`, g: '6th Kyu', dojo: a.dojo, hrs: 0, st: 'Active', joined: `${MON[TODAY.getMonth()]} ${TODAY.getFullYear()}` });
  save(); renderApps(); renderMembers(); closeDrawer();
  toast(`${a.n} approved. Student card queued for ${dojoName(a.dojo)}.`);
}

function renderMembers() {
  if (!$('#memRows')) return;
  const list = MEMBERS.map((m, i) => ({ m, i })).filter(({ m }) => (adm.memFilter === 'All' || m.st === adm.memFilter) && (m.n.toLowerCase().includes(adm.memQ) || m.no.toLowerCase().includes(adm.memQ)));
  $('#memRows').innerHTML = list.map(({ m, i }) => `<tr class="click" data-m="${i}"><td><div class="who"><span class="av">${initials(m.n)}</span><div><b>${esc(m.n)}</b><span class="num">${m.no}</span></div></div></td><td><span class="belt" style="--belt:${beltOf(m.g)}"><i></i>${m.g}</span></td><td>${dojoName(m.dojo)}</td><td class="num">${m.hrs}</td><td><span class="pill ${m.st === 'Active' ? 'ok' : 'bad'}">${m.st}</span></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No members match.</td></tr>';
}

function openMember(i, after) {
  const m = MEMBERS[i];
  openDrawer(m.n, `<div class="kv" style="margin:0;border-top:1px solid var(--line)"><div><span>Member no.</span><span class="num">${m.no}</span></div><div><span>Joined</span><span>${m.joined}</span></div><div><span>Training hours</span><span>${m.hrs}</span></div></div>
    <div class="grid2"><div class="fld"><label for="m-grade">Grade</label><select id="m-grade">${BELTS.map(b => `<option${b.g === m.g ? ' selected' : ''}>${b.g}</option>`).join('')}</select></div>
    <div class="fld"><label for="m-st">Membership</label><select id="m-st">${['Active', 'Lapsed'].map(s => `<option${s === m.st ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="fld full"><label for="m-dojo">Principal dojo</label><select id="m-dojo">${DOJOS.map(d => `<option value="${d.id}"${d.id === m.dojo ? ' selected' : ''}>${d.name}</option>`).join('')}</select></div></div>
    ${m.st === 'Lapsed' ? '<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span>Annual dues unpaid. Lapsed under 2 years pays S$48 to reactivate; 2 years or more re-registers at S$60 + S$48.</span></div>' : ''}`,
    `<button class="sbtn" data-drawer-close>Cancel</button><button class="sbtn dark" id="memSave">${icon('check')}Save</button>`);
  $('#memSave').addEventListener('click', () => {
    m.g = $('#m-grade').value; m.st = $('#m-st').value; m.dojo = $('#m-dojo').value;
    save(); renderMembers(); after(); closeDrawer(); toast(`${m.n} updated`);
  });
}

function renderSessions() {
  $('#sesRows').innerHTML = SESSIONS.map((s, i) => `<tr><td><b>${s.type}</b></td><td>Every ${DSHORT[s.day].charAt(0) + DSHORT[s.day].slice(1).toLowerCase()} · ${timeLabel(s.time)}</td><td>${dojoName(s.dojo)}${s.dojo === HQ ? '' : ' <span class="pill plain" style="height:20px;font-size:11px">Not bookable</span>'}</td><td>${s.ins}</td><td class="num">${s.booked}/${s.cap}</td><td><span class="pill navy plain num">${icon('nfc', 'ic')} ${s.code}</span></td><td><div class="acts" style="display:flex;gap:6px"><button class="sbtn ghost" data-edit="${i}" aria-label="Edit">${icon('edit')}</button><button class="sbtn ghost" data-del="${i}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`).join('');
}

function openSessionForm(i) {
  const s = i !== undefined ? SESSIONS[i] : { type: 'Adults', day: 0, time: '19:00', dojo: 'hq', ins: 'Bob Tan Sensei', cap: 20 };
  const types = ['Adults', 'Children Beginners', 'Children Juniors', 'Mixed', 'Weapons', 'Intermediate', 'Advanced', 'Ladies', 'SG50'];
  const D = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  openModal(`<h3 id="modalTitle">${i !== undefined ? 'Edit session' : 'New session'}</h3><p class="sub">Repeats every week. A check-in code is generated for the dojo's NFC tag. Only HQ sessions appear in online booking.</p>
    <form id="sesForm" class="grid2" style="margin-top:18px" novalidate>
      <div class="fld full"><label for="s-type">Class type</label><select id="s-type">${types.map(t => `<option${t === s.type ? ' selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-day">Day</label><select id="s-day">${D.map((d, k) => `<option value="${k}"${k === s.day ? ' selected' : ''}>${d}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-time">Start time</label><select id="s-time">${TIMES.map(t => `<option value="${t}"${t === s.time ? ' selected' : ''}>${timeLabel(t)}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-dojo">Dojo</label><select id="s-dojo">${DOJOS.map(d => `<option value="${d.id}"${d.id === s.dojo ? ' selected' : ''}>${d.name}</option>`).join('')}</select></div>
      <div class="fld"><label for="s-cap">Capacity</label><input id="s-cap" type="number" min="4" max="40" value="${s.cap}"></div>
      <div class="fld full"><label for="s-ins">Instructor</label><select id="s-ins">${INSTRUCTORS.map(x => `<option${x[0] === s.ins ? ' selected' : ''}>${x[0]}</option>`).join('')}</select></div>
      <div class="fld full"><button class="sbtn dark" type="submit" style="justify-self:start">${icon('check')}${i !== undefined ? 'Save changes' : 'Create session'}</button></div>
    </form>`, true);
  $('#sesForm').addEventListener('submit', e => {
    e.preventDefault();
    const n = { type: $('#s-type').value, day: +$('#s-day').value, time: $('#s-time').value, dojo: $('#s-dojo').value, ins: $('#s-ins').value, cap: Math.max(4, +$('#s-cap').value || 20), booked: s.booked || 0, kids: /Children/.test($('#s-type').value) };
    n.code = s.code || sessionCode(n.dojo, n.day, n.time, 1000 + Math.floor(Math.random() * 9000));
    if (i !== undefined) SESSIONS[i] = n; else SESSIONS.unshift(n);
    save(); renderSessions(); closeModal(); toast(i !== undefined ? 'Session updated' : `Session created · code ${n.code}`);
  });
}

function renderGrading() {
  if (!$('#gradRows')) return;
  $('#gradTabs [data-g="apps"] .n').textContent = GRAD_APPS.filter(g => !g.sched).length;
  $('#gradTabs [data-g="props"] .n').textContent = PROPOSALS.length;
  if (adm.gradTab === 'apps') {
    $('#gradRows').innerHTML = GRAD_APPS.map((g, i) => `<div class="row"><span class="av">${initials(g.n)}</span><div class="grow"><div class="t">${g.n}</div><div class="d">${g.from} → ${g.to} · submitted ${g.sub} · ${g.note}</div></div><div class="acts">${g.sched ? `<span class="pill ok">${g.sched}</span>` : `<button class="sbtn dark" data-sched="${i}">${icon('cal')}Schedule</button>`}</div></div>`).join('');
  } else {
    $('#gradRows').innerHTML = PROPOSALS.length ? PROPOSALS.map((p, i) => `<div class="row"><span class="av">${initials(p.n)}</span><div class="grow"><div class="t">${p.n} · ${p.result}</div><div class="d">${p.from} → ${p.to} · signed by ${esc(p.by)}</div>${p.well || p.next ? `<dl class="fb-mini">${p.well ? `<dt>Went well</dt><dd>${esc(p.well)}</dd>` : ''}${p.next ? `<dt>Work on next</dt><dd>${esc(p.next)}</dd>` : ''}</dl>` : `<div class="d">“${esc(p.fb)}”</div>`}${p.sig ? `<img class="sig-thumb" src="${p.sig}" alt="Signature of ${esc(p.by)}">` : ''}</div><div class="acts">${/^Pass/.test(p.result) ? `<button class="sbtn dark" data-promote="${i}">${icon('award')}Approve promotion</button>` : `<span class="pill ${p.result === 'Fail' ? 'bad' : 'warn'}">${p.result === 'Fail' ? 'Re-qualify first' : 'Retake next grading'}</span><button class="sbtn" data-promote="${i}">${icon('check')}Confirm result</button>`}</div></div>`).join('') : '<p style="color:var(--muted)">No proposals waiting.</p>';
  }
}

function openSchedule(i) {
  const g = GRAD_APPS[i];
  openDrawer(`Schedule · ${g.n}`, `<div class="kv" style="margin:0;border-top:1px solid var(--line)"><div><span>Grading</span><span>${g.from} → ${g.to}</span></div><div><span>Documents</span><span>Membership book, fees paid</span></div><div><span>Check</span><span>${g.note}</span></div></div>
    <div class="grid2"><div class="fld"><label for="gs-loc">Location</label><select id="gs-loc"><option>HQ Dojo · Mat A</option><option>HQ Dojo · Mat B</option></select></div>
    <div class="fld"><label for="gs-time">Time slot</label><select id="gs-time"><option>13 Dec · 9:00 AM</option><option>13 Dec · 10:30 AM</option><option>13 Dec · 1:00 PM</option></select></div>
    <div class="fld"><label for="gs-type">Grading type</label><select id="gs-type"><option>${g.to.includes('Dan') ? 'Yudansha' : 'Adult Kyu'}</option></select></div>
    <div class="fld"><label for="gs-ex">Examiner</label><select id="gs-ex">${INSTRUCTORS.slice(0, 8).map(x => `<option>${x[0]}</option>`).join('')}</select></div></div>`,
    `<button class="sbtn" data-drawer-close>Cancel</button><button class="sbtn dark" id="gsSave">${icon('check')}Confirm slot</button>`);
  $('#gsSave').addEventListener('click', () => { g.sched = $('#gs-time').value; save(); renderGrading(); closeDrawer(); toast(`${g.n} scheduled · ${g.sched}. Email sent.`); });
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
  save(); renderGrading(); renderMembers();
  toast(`${p.n} promoted to ${p.to}`);
}

runPage({
  dashboard() {
  $('.page-h p').textContent = `All dojos · ${fmtDate(new Date())}`;
  const trend = CLASSES.map(c => ({ l: `${c.type} · ${DSHORT[c.day].charAt(0) + DSHORT[c.day].slice(1).toLowerCase()} ${timeLabel(c.time)}`, p: c.booked / c.cap })).sort((a, b) => b.p - a.p).slice(0, 6);
  $('#trendBars').innerHTML = trend.map(t => `<div><span class="bl" title="${t.l}">${t.l}</span><span class="bt"><i data-w="${Math.round(t.p * 100)}"></i></span><span class="bv">${Math.round(t.p * 100)}%</span></div>`).join('');
  setTimeout(() => $$('#trendBars i').forEach(i => i.style.width = i.dataset.w + '%'), 200);
  },
  applications() {
  renderApps(); renderMCReqs();
  $('#appRows').addEventListener('click', e => {
    const v = e.target.closest('[data-app]'); if (v) openApp(+v.dataset.app);
    const a = e.target.closest('[data-approve]'); if (a) approveApp(+a.dataset.approve);
  });
  },
  members() {
  const counts = () => ({ All: MEMBERS.length, Active: MEMBERS.filter(m => m.st === 'Active').length, Lapsed: MEMBERS.filter(m => m.st === 'Lapsed').length });
  const drawFilters = () => { $('#memFilter').innerHTML = Object.entries(counts()).map(([k, n]) => `<button class="fpill${k === adm.memFilter ? ' on' : ''}" data-f="${k}">${k}<span class="n">${n}</span></button>`).join(''); };
  drawFilters();
  $('#memFilter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; adm.memFilter = b.dataset.f; drawFilters(); renderMembers(); });
  $('#memSearch').addEventListener('input', e => { adm.memQ = e.target.value.toLowerCase(); renderMembers(); });
  $('#memRows').addEventListener('click', e => { const r = e.target.closest('tr[data-m]'); if (r) openMember(+r.dataset.m, drawFilters); });
  renderMembers();
  },
  sessions() {
  renderSessions();
  $('#newSession').addEventListener('click', () => openSessionForm());
  $('#sesRows').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'); if (ed) openSessionForm(+ed.dataset.edit);
    const del = e.target.closest('[data-del]');
    if (del) {
      const s = SESSIONS[+del.dataset.del];
      openModal(`<h3 id="modalTitle">Delete this session?</h3><p class="sub">${s.type} · ${DSHORT[s.day]} ${timeLabel(s.time)} · ${dojoName(s.dojo)}</p><div class="note warn" style="margin-top:16px"><svg class="ic"><use href="#i-info"/></svg><span>${s.booked} students are booked. They'll be notified and their lessons returned.</span></div><div class="acts"><button class="sbtn red" id="doDel">Delete session</button><button class="sbtn" data-close>Keep</button></div>`);
      $('#doDel').addEventListener('click', () => { SESSIONS.splice(+del.dataset.del, 1); save(); renderSessions(); closeModal(); toast('Session deleted. Booked students notified.'); });
    }
  });
  },
  grading() {
  $('#gradTabs').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; adm.gradTab = b.dataset.g; $$('#gradTabs .fpill').forEach(x => x.classList.toggle('on', x === b)); renderGrading(); });
  $('#gradRows').addEventListener('click', e => {
    const s = e.target.closest('[data-sched]'); if (s) openSchedule(+s.dataset.sched);
    const p = e.target.closest('[data-promote]'); if (p) promote(+p.dataset.promote);
  });
  renderGrading();
  },
  payments() {
  const pays = [['Sarah Lee', 'Registration, dogi, 25 lessons', '1 Nov', 690, 'Paid'], ['Raj Kumaran', 'Registration, dogi, 10 lessons', '31 Oct', 375, 'Paid'], ['Jamie Tan', 'Unlimited · 2 weeks', '30 Oct', 96, 'Processing'], ['David Koh', 'Annual dues 2026', '—', 48, 'Overdue'], ['Kenji Sato', '50 lessons', '28 Oct', 980, 'Paid'], ['Grace Yeo', 'Annual dues 2026', '—', 48, 'Overdue']];
  $('#adminPayRows').innerHTML = pays.map(p => `<tr><td><b>${p[0]}</b></td><td>${p[1]}</td><td>${p[2]}</td><td class="num">${money(p[3])}</td><td><span class="pill ${p[4] === 'Paid' ? 'ok' : p[4] === 'Overdue' ? 'bad' : 'warn'}">${p[4]}</span></td></tr>`).join('');
  },
  notify() {
  const syncAud = () => {
    const a = radio('aud'), extra = $('#audExtra');
    extra.hidden = a === 'All members';
    if (a === 'One dojo') { $('#audLabel').textContent = 'Dojo'; $('#n-target').innerHTML = DOJOS.map(d => `<option>${d.name}</option>`).join(''); }
    if (a === 'By grade') { $('#audLabel').textContent = 'Grade'; $('#n-target').innerHTML = BELTS.map(b => `<option>${b.g}</option>`).join(''); }
    if (a === 'One student') { $('#audLabel').textContent = 'Student'; $('#n-target').innerHTML = MEMBERS.map(m => `<option>${m.n} · ${m.no}</option>`).join(''); }
    const ph = $('#n-target-in'); if (ph) ph.placeholder = a === 'One student' ? 'Type a name or member no.' : `Search ${a === 'One dojo' ? 'dojos' : 'grades'}`;
    preview();
  };
  const preview = () => { const a = radio('aud'); $('#audPreview').textContent = a === 'All members' ? 'All members · 1,248' : `${a} · ${$('#n-target').value}`; };
  $('#audSeg').addEventListener('change', syncAud); $('#n-target').addEventListener('change', preview);
  $('#n-title').addEventListener('input', e => $('#pvTitle').textContent = e.target.value || 'Your title');
  $('#n-body').addEventListener('input', e => { $('#pvBody').textContent = e.target.value || 'Your message appears here.'; $('#nCount').textContent = e.target.value.length; });
  $('#notifyForm').addEventListener('submit', e => {
    e.preventDefault();
    const t = $('#n-title'), b = $('#n-body');
    if (!t.value.trim() || !b.value.trim()) { toast('Add a title and a message first.', 'bad'); (t.value.trim() ? b : t).focus(); return; }
    toast(`Sent to ${$('#audPreview').textContent}${$('#n-email').checked ? ' (push + email)' : ''}`);
    t.value = ''; b.value = ''; $('#pvTitle').textContent = 'Your title'; $('#pvBody').textContent = 'Your message appears here.'; $('#nCount').textContent = 0;
  });
  syncAud();
  },
  reports() {
  document.addEventListener('click', e => {
    const x = e.target.closest('[data-export]'); if (!x) return;
    const k = x.dataset.export, stamp = `${MON[TODAY.getMonth()].toLowerCase()}-${TODAY.getFullYear()}`;
    if (k === 'members') downloadCSV(`members-${stamp}.csv`, [['Name', 'Member no.', 'Grade', 'Dojo', 'Hours', 'Status', 'Joined']].concat(MEMBERS.map(m => [m.n, m.no, m.g, dojoName(m.dojo), m.hrs, m.st, m.joined])));
    if (k === 'attendance') downloadCSV(`attendance-${stamp}.csv`, [['Class', 'Day', 'Time', 'Dojo', 'Booked', 'Capacity']].concat(CLASSES.map(c => [c.type, DSHORT[c.day], c.time, dojoName(c.dojo), c.booked, c.cap])));
    if (k === 'progression') downloadCSV(`progression-${stamp}.csv`, [['Name', 'Grade', 'Sessions', 'Needed', 'Status']].concat(STUDENTS.map(s => [s.n, s.g, s.s, s.need, s.st])));
    if (k === 'payments') downloadCSV(`payments-${stamp}.csv`, [['Member', 'Status']].concat(MEMBERS.map(m => [m.n, m.st])));
  });
  }
});

// search boxes: each one filters only its own list
runPage({
  applications() { filterList('#appSearch', '#appRows'); filterList('#mcSearch', '#mcRows'); },
  sessions() { filterList('#sesSearch', '#sesRows'); },
  grading() { filterList('#gradSearch', '#gradRows'); },
  payments() { filterList('#paySearch', '#adminPayRows'); }
});