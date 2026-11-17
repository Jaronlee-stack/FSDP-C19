'use strict';
/* AIKIDO SHINJU-KAI — admin-members.js  (office portal: Members, student record, Registrations, Extensions, Exceptions, assisted registration, Follow-ups)

   Loaded after admin-shell.js and admin-desk.js (it reuses iso, who, uid, pill, hash, findMembers, memberBtn, takePayment, receiptPDF, POL, DOGI_PRICE).
   Prototype only: every role rule here (what the front desk may edit or approve) must also be enforced by the server. */

/* ---------- what we know about a member ----------
   The first ten sample members have only the basic fields, so every value that may be missing falls back to a
   deterministic default made from the member number. The same member always gets the same defaults. */
const mbDate = v => v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00');
const mbJoinedDate = m => {
  if (m.joinedAt) return mbDate(m.joinedAt);
  const p = String(m.joined || '').split(' '), k = MON.indexOf(p[0]);
  return k > -1 && +p[1] ? new Date(+p[1], k, 1) : new Date(TODAY);
};
const mbSeen = m => m.seen != null ? m.seen : ((STUDENTS.find(s => s.n === m.n) || {}).seen || 0);
const mbSeenText = n => n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
const mbDigits = s => String(s || '').replace(/\D/g, '');
const mbOwed = m => Math.max(m.due || 0, ledgerSum(l => l.no === m.no && l.st === 'Outstanding'));
const EC_NAMES = ['Aisha Rahman', 'Daniel Lim', 'Mei Ling Tan', 'Rohan Nair', 'Sarah Goh', 'Kevin Ong'];
const EC_RELS = ['Spouse', 'Parent', 'Sibling', 'Friend'];

function mbInfoDefault(m) {
  const h = hash(m.no), child = m.kind === 'child', d = String(h).padStart(9, '0').slice(-7), e = String(hash(m.n + m.no)).padStart(9, '0').slice(-7);
  const slug = m.n.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^\.|\.$/g, '');
  const mcFrom = isoDate(addDays(TODAY, -(30 + h % 40)));
  return {
    phone: m.phone || `9${d.slice(0, 3)} ${d.slice(3)}`, email: m.email || `${slug}@email.com`,
    emergency: { name: EC_NAMES[h % EC_NAMES.length], rel: child ? 'Parent' : EC_RELS[h % EC_RELS.length], phone: `8${e.slice(0, 3)} ${e.slice(3)}` },
    guardian: m.guardian || (child ? `Parent of ${m.n.split(' ')[0]}` : ''),
    medical: h % 5 === 0 ? 'Mild asthma, carries an inhaler. Avoid long breath-hold drills.' : 'Nothing declared.',
    mcs: h % 4 === 0 ? [{ from: mcFrom, to: isoDate(addDays(mbDate(mcFrom), 2)), status: 'approved', file: 'mc-scan.pdf' }] : [],
    ns: m.nsf ? 'Verified' : null, cert: h % 7 === 0 ? 'On file' : null, rated: 3 + h % 22, log: []
  };
}
DB.memberInfo = DB.memberInfo || {};
const mbInfo = m => Object.assign(mbInfoDefault(m), DB.memberInfo[m.no] || {});
const mbSetInfo = (m, patch) => { DB.memberInfo[m.no] = Object.assign(mbInfo(m), patch); };
const mbPhone = m => m.phone || mbInfo(m).phone;

/* package state: { left, exp, unlimited, from, list } */
function mbPkg(m) {
  const unl = m.no === ME.no ? !!DB.unlimited : null;
  const last = (DB.ledger || []).filter(l => l.no === m.no && /unlimited/i.test(l.item) && ['Paid', 'Processing'].includes(l.st)).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (m.no === ME.no) {
    const live = MY_PASSES.filter(p => p.left > 0 && p.expires >= TODAY).sort((a, b) => a.expires - b.expires);
    if (unl) return { left: Infinity, exp: addDays(TODAY, 14), unlimited: true, from: TODAY, list: [] };
    return { left: live.reduce((s, p) => s + p.left, 0), exp: live[0] ? live[0].expires : null, unlimited: false, list: live };
  }
  if (last && daysBetween(new Date(last.date), TODAY) <= 14) return { left: Infinity, exp: addDays(new Date(last.date), 14), unlimited: true, from: new Date(last.date), list: [] };
  const h = hash(m.no);
  if (m.left != null || m.exp) return { left: m.left || 0, exp: m.exp ? mbDate(m.exp) : null, unlimited: false, list: [] };
  return m.st === 'Lapsed' ? { left: 0, exp: addDays(TODAY, -(20 + h % 60)), unlimited: false, list: [] }
    : { left: 4 + h % 14, exp: addDays(TODAY, 25 + h % 100), unlimited: false, list: [] };
}
function mbPkgText(m) {
  const p = mbPkg(m);
  if (p.unlimited) return `Unlimited · until ${fmtShort(p.exp)}`;
  if (p.left > 0 && (!p.exp || p.exp >= TODAY)) return `${plural(p.left, 'lesson')} left${p.exp ? ' · to ' + fmtShort(p.exp) : ''}`;
  return 'No active package';
}
const mbExpiring = m => { const p = mbPkg(m); return m.st === 'Active' && !!p.exp && (p.left > 0 || p.unlimited) && daysBetween(TODAY, p.exp) >= 0 && daysBetween(TODAY, p.exp) <= 14; };
function mbRereg(m) {
  if (m.st === 'Lapsed') {
    const e = mbPkg(m).exp, since = e && e < TODAY ? daysBetween(e, TODAY) : 0;
    return since >= 730 ? 'Lapsed over 2 years. Re-registers at S$60 plus S$48 annual dues' : `Lapsed${since ? ' ' + plural(since, 'day') : ''}. Pays S$${POL().annualDues || 48} annual dues to reactivate`;
  }
  return mbOwed(m) > 0 ? 'Active. Annual dues unpaid' : 'Active. Annual dues paid';
}
const mbStatusPill = m => pill(m.st === 'Active' ? 'ok' : 'bad', m.st);

/* ---------- Members list (R50, R51) ---------- */
const memUI = { f: 'All', q: '' };
const MEM_FILTERS = ['All', 'Active', 'Lapsed', 'Expiring soon', 'Outstanding balance', 'New (90 days or less)', 'Guests'];
const memTests = {
  'All': () => true, 'Active': m => m.st === 'Active', 'Lapsed': m => m.st === 'Lapsed', 'Expiring soon': mbExpiring,
  'Outstanding balance': m => mbOwed(m) > 0, 'New (90 days or less)': m => daysBetween(mbJoinedDate(m), TODAY) <= 90
};
const memMatch = (m, q) => !q || [m.n, m.no, mbPhone(m), m.email || mbInfo(m).email, m.guardian || mbInfo(m).guardian].some(v => v && String(v).toLowerCase().includes(q));
const guestMatch = (g, q) => !q || [g.name, g.mobile, g.email].some(v => v && String(v).toLowerCase().includes(q));
function memRows() {
  const q = memUI.q.trim().toLowerCase();
  if (memUI.f === 'Guests') return { guests: (DB.guests || []).filter(g => guestMatch(g, q)) };
  return { members: MEMBERS.filter(m => memTests[memUI.f](m) && memMatch(m, q)) };
}
function drawMembers() {
  const counts_ = f => f === 'Guests' ? (DB.guests || []).length : MEMBERS.filter(memTests[f]).length;
  $('#memFilter').innerHTML = MEM_FILTERS.map(f => `<button class="fpill${f === memUI.f ? ' on' : ''}" data-f="${esc(f)}">${esc(f)}<span class="n">${counts_(f)}</span></button>`).join('');
  const r = memRows();
  if (r.guests) {
    $('#memRows').innerHTML = r.guests.map(g => `<tr><td><div class="who"><span class="av">${initials(g.name)}</span><div><b>${esc(g.name)}</b><span class="num">${esc(g.mobile)}</span></div></div></td><td>—</td><td>HQ Dojo</td><td>${esc(passLabel(g))}${g.until ? ` · to ${fmtShort(new Date(g.until))}` : g.pass === 'trial' ? (g.used ? ' · used' : ' · not used yet') : ''}</td><td>${pill('plain', 'Guest')}</td><td>—</td></tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted)">No guests match.</td></tr>';
    return;
  }
  $('#memRows').innerHTML = r.members.map(m => {
    const owed = mbOwed(m), s = mbSeen(m);
    return `<tr class="click" data-no="${esc(m.no)}"><td><div class="who"><span class="av">${initials(m.n)}</span><div><b><a href="member.html?no=${encodeURIComponent(m.no)}">${esc(m.n)}</a></b><span class="num">${esc(m.no)}</span></div></div></td>
      <td><span class="belt" style="--belt:${beltOf(m.g)}"><i></i>${esc(m.g)}</span></td><td>${esc(dojoName(m.dojo))}</td>
      <td>${esc(mbPkgText(m))}</td>
      <td>${mbStatusPill(m)}${m.source === 'External' ? ' ' + pill('plain', 'External') : ''}${owed > 0 ? ' ' + pill('warn', `Owes ${money(owed)}`) : ''}</td>
      <td>${esc(mbSeenText(s))}</td></tr>`;
  }).join('') || '<tr><td colspan="6" style="color:var(--muted)">No members match.</td></tr>';
}
function membersPage() {
  $('#memSub').textContent = `${MEMBERS.filter(m => m.st === 'Active').length} active of ${MEMBERS.length} members · ${plural((DB.guests || []).length, 'guest')}`;
  drawMembers();
  $('#memFilter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { memUI.f = b.dataset.f; drawMembers(); } });
  $('#memSearch').addEventListener('input', e => { memUI.q = e.target.value; drawMembers(); });
  $('#memRows').addEventListener('click', e => { const tr = e.target.closest('tr[data-no]'); if (tr && !e.target.closest('a')) location.href = `member.html?no=${encodeURIComponent(tr.dataset.no)}`; });
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-export="members"]') || !isBA()) return;
    const r = memRows(), stamp = `${MON[TODAY.getMonth()].toLowerCase()}-${TODAY.getFullYear()}`;
    downloadCSV(`members-${stamp}.csv`, [['Name', 'Member no.', 'Belt', 'Centre', 'Package', 'Membership', 'Last seen']].concat(r.guests
      ? r.guests.map(g => [g.name, g.id, '', 'HQ Dojo', passLabel(g), 'Guest', ''])
      : r.members.map(m => [m.n, m.no, m.g, dojoName(m.dojo), mbPkgText(m), m.st, mbSeenText(mbSeen(m))])));
  });
}

/* ---------- Log contact (used on the student record and on Follow-ups) ---------- */
function fuRecord(m, kind, create) {
  let f = (DB.followups || []).find(x => x.no === m.no && (!kind || x.kind === kind));
  if (!f && create) { f = { id: uid('F-'), no: m.no, name: m.n, kind: kind || 'declining', owner: ADMIN ? ADMIN.id : '', due: addDays(TODAY, 3), attempts: [] }; DB.followups.push(f); }
  return f;
}
function logContactDrawer(m, kind, after) {
  openDrawer(`Log contact · ${m.n}`, `<div class="grid2">
      <div class="fld"><label for="lc-method">How you got in touch</label><select id="lc-method"><option>Call</option><option>WhatsApp</option><option>Email</option><option>In person</option></select></div>
      <div class="fld"><label for="lc-outcome">Outcome</label><select id="lc-outcome"><option>Reached</option><option>No answer</option><option>Booked a class</option><option>Will return</option><option>Not returning</option></select></div>
      <div class="fld full" id="lc-whybox" hidden><label for="lc-why">Reason they are not returning<span class="req">*</span></label><textarea id="lc-why"></textarea><span class="err">Write the reason.</span></div>
      <div class="fld full"><label for="lc-note">Notes<span class="opt">Optional</span></label><textarea id="lc-note"></textarea></div>
      <div class="fld full"><label for="lc-next">Contact again on<span class="opt">Optional</span></label><input id="lc-next" type="date"></div></div>`,
    `<button class="sbtn" data-drawer-close>Cancel</button><button class="sbtn dark" id="lcSave">${icon('check')}Save contact</button>`);
  $('#lc-outcome').addEventListener('change', () => { $('#lc-whybox').hidden = $('#lc-outcome').value !== 'Not returning'; });
  $('#lcSave').addEventListener('click', () => {
    const outcome = $('#lc-outcome').value, why = $('#lc-why').value.trim();
    if (outcome === 'Not returning' && !why) { $('#lc-whybox').classList.add('invalid'); return toast('Write why they are not returning.', 'bad'); }
    const f = fuRecord(m, kind, true), next = $('#lc-next').value;
    f.attempts.push({ at: new Date(), method: $('#lc-method').value, outcome, note: [why, $('#lc-note').value.trim()].filter(Boolean).join('. '), by: who() });
    if (next) f.due = mbDate(next);
    save(); closeDrawer(); toast(`Contact with ${m.n} saved.`);
    if (after) after();
  });
}

/* ---------- Student record (R61-R65) ---------- */
const MB = { m: null, tab: 'overview' };
const MB_TABS = [['overview', 'Overview'], ['bookings', 'Bookings'], ['attendance', 'Attendance'], ['payments', 'Payments'], ['progress', 'Progress'], ['equipment', 'Equipment'], ['followups', 'Follow-ups'], ['contact', 'Contact']];
const STATUS_PILL = { present: ['ok', 'Present'], noshow: ['bad', 'No-show'], booked: ['plain', 'Booked'], pending: ['warn', 'Pending'] };

function mbHistory(m) {
  const out = [], seen = new Set();
  const typeAt = (d, t) => (SESSIONS.find(s => s.dojo === HQ && s.time === t && s.day === dayIdx(d)) || {}).type || 'Class';
  if (m.no === ME.no) {
    BOOKINGS.forEach(b => { const k = `${iso(b.date)}|${b.c.time}`; seen.add(k); out.push({ date: startOfDay(b.date), time: b.c.time, type: b.c.type, how: 'Online', status: 'booked' }); });
    ATTENDANCE.forEach(a => { const k = `${iso(a.date)}|${a.time}`; if (seen.has(k)) return; seen.add(k); out.push({ date: startOfDay(a.date), time: a.time, type: a.type, how: 'Online', status: a.status }); });
  }
  Object.entries(DB.rosters || {}).forEach(([k, r]) => {
    if (seen.has(k)) return;
    const x = r.rows.find(y => y.no === m.no); if (!x) return;
    const d = mbDate(k.slice(0, 10)); seen.add(k);
    out.push({ date: d, time: k.slice(11), type: typeAt(d, k.slice(11)), how: x.how, status: x.status });
  });
  return out.sort((a, b) => b.date - a.date);
}
const histTable = (list, empty) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Class</th><th>How booked</th><th>Status</th></tr></thead><tbody>${list.map(h => `<tr><td>${dayName(h.date)} ${fmtDate(h.date)}</td><td>${esc(h.type)} · ${timeLabel(h.time)}</td><td>${esc(h.how)}</td><td>${pill(...STATUS_PILL[h.status] || ['plain', h.status])}</td></tr>`).join('') || `<tr><td colspan="4" style="color:var(--muted)">${empty}</td></tr>`}</tbody></table></div>`;
const docRow = (label, state, key) => `<div class="row"><div class="grow"><div class="t">${label}</div></div>${state ? pill('ok', state) : pill('plain', 'Not provided')}${state ? `<button class="sbtn" data-doc="${key}" data-ba>Open</button>` : ''}</div>`;

function mbOverview(m) {
  const info = mbInfo(m), pk = mbPkg(m), owed = mbOwed(m);
  const pkgLines = pk.list.length ? pk.list.map(p => `${esc(p.name)}: ${p.left} left, expires ${fmtDate(p.expires)}`).join('<br>') : esc(mbPkgText(m));
  const mcs = m.no === ME.no ? MC_REQS.filter(r => r.no === m.no && r.kind === 'mc').map(r => ({ from: r.from, to: r.to, status: r.status, file: r.fileName || 'MC' })) : info.mcs;
  return `<div class="g-wide">
    <div class="card white"><div class="card-h"><h3>Membership</h3><button class="sbtn" id="mEdit" data-ba>Change status or dojo</button></div>
      <div class="kv" style="margin:0">
        <div><span>Member no.</span><span class="num">${esc(m.no)}</span></div>
        <div><span>Joined</span><span>${esc(m.joined)}</span></div>
        <div><span>Belt</span><span><span class="belt" style="--belt:${beltOf(m.g)}"><i></i>${esc(m.g)}</span><span class="sub-note">Changes through grading only</span></span></div>
        <div><span>Membership</span><span>${mbStatusPill(m)}</span></div>
        <div><span>Principal dojo</span><span>${esc(dojoName(m.dojo))}</span></div>
        <div><span>Member type</span><span>${m.source === 'External' ? 'External member' : 'ASK member'} · ${m.kind === 'child' ? 'Child' : 'Adult'}</span></div>
        <div><span>Package</span><span>${pkgLines}</span></div>
        <div><span>Unlimited plan</span><span>${pk.unlimited ? `${fmtShort(pk.from)} to ${fmtShort(pk.exp)}` : 'None'}</span></div>
        <div><span>2-year re-registration</span><span>${esc(mbRereg(m))}</span></div>
        <div><span>Outstanding</span><span>${owed > 0 ? money(owed) : 'Nothing owed'}</span></div>
        <div><span>Classes rated</span><span>${info.rated} in total</span></div>
      </div></div>
    <div class="card white"><div class="card-h"><h3>Medical and documents</h3></div>
      <div class="rec-sec">
        <div><h4>Medical note</h4><p style="margin-top:6px" id="mMedical">${esc(info.medical)}</p></div>
        <div><h4>Medical certificates</h4><div class="rows" id="mMcs">${mcs.map(c => `<div class="row"><div class="grow"><div class="t">${fmtShort(mbDate(c.from))} to ${fmtShort(mbDate(c.to))}</div><div class="d">${esc(c.file || 'MC')}</div></div>${pill(c.status === 'approved' ? 'ok' : c.status === 'rejected' ? 'bad' : 'warn', c.status === 'approved' ? 'Approved' : c.status === 'rejected' ? 'Not approved' : 'Waiting')}</div>`).join('') || '<p style="color:var(--muted)">No medical certificates.</p>'}</div></div>
        <div><h4>Documents</h4><div class="rows">${docRow('NS papers', info.ns, 'ns')}${docRow('Experience certificates', info.cert, 'cert')}</div></div>
      </div></div></div>`;
}
function mbPayments(m) {
  const L = (DB.ledger || []).filter(l => l.no === m.no && (isBA() || l.st !== 'Failed')).sort((a, b) => new Date(b.date) - new Date(a.date));
  const R = (DB.refunds || []).filter(r => r.no === m.no);
  return `<div class="card white"><div class="card-h"><div><h3>Payment history</h3><span class="sub">${mbOwed(m) > 0 ? `${money(mbOwed(m))} outstanding` : 'Nothing outstanding'}</span></div><div class="acts-inline"><button class="sbtn" id="mPayNow">Take payment</button>${isBA() ? '' : '<button class="sbtn" id="mRefund">Request a refund</button>'}</div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${L.map(l => `<tr><td>${fmtShort(new Date(l.date))}</td><td>${esc(l.item)}</td><td class="num">${money(l.amt)}</td><td>${stPill(l.st)}</td><td><div class="acts-inline">${l.st === 'Paid' ? `<button class="sbtn" data-rcpt="${esc(l.id)}">${icon('receipt')}Reprint receipt</button>` : ''}${l.st === 'Outstanding' ? `<button class="sbtn dark" data-collect="${esc(l.id)}">Collect</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No payments yet.</td></tr>'}</tbody></table></div></div>
    <div class="card white"><div class="card-h"><div><h3>Refund requests</h3><span class="sub">Policy is no refunds. A Business Admin decides exceptions.</span></div></div><div class="rows" id="mRefunds">${R.map(x => `<div class="row"><span class="av">${icon('receipt')}</span><div class="grow"><div class="t">${money(x.amt)} · ${esc(x.item)}</div><div class="d">${esc(x.reason)} · asked by ${esc(x.by)}, ${fmtShort(new Date(x.at))}</div></div>${x.status === 'pending' ? `<div class="acts">${isBA() ? `<button class="sbtn dark" data-ref-ok="${esc(x.id)}" data-ba>Approve</button><button class="sbtn" data-ref-no="${esc(x.id)}" data-ba>Decline</button>` : pill('warn', 'With a Business Admin')}</div>` : pill(x.status === 'approved' ? 'ok' : 'bad', cap1(x.status))}</div>`).join('') || '<p style="color:var(--muted)">No refund requests for this student.</p>'}</div></div>`;
}
function mbProgress(m) {
  const s = STUDENTS.find(x => x.n === m.n), i = BELTS.findIndex(b => b.g === m.g), next = BELTS[i + 1];
  return `<div class="card white"><div class="card-h"><h3>Progress</h3></div><div class="kv" style="margin:0">
    <div><span>Current belt</span><span><span class="belt" style="--belt:${beltOf(m.g)}"><i></i>${esc(m.g)}</span></span></div>
    <div><span>Next grade</span><span>${next ? esc(next.g) : 'Highest grade listed'}</span></div>
    <div><span>Sessions towards next grade</span><span>${s ? `${s.s} of ${s.need}` : 'Not tracked yet'}</span></div>
    <div><span>Standing</span><span>${s ? esc(s.st) : '—'}</span></div>
    <div><span>Training hours</span><span>${m.hrs}</span></div></div>
    <div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>Belts change through grading only. Nobody edits a belt on this page.</span></div></div>`;
}
function mbEquipment(m) {
  const E = (DB.equipment || []).filter(e => e.no === m.no);
  return `<div class="card white"><div class="card-h"><h3>Equipment</h3><a class="sbtn" href="equipment.html">Open Equipment</a></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Size</th><th>Payment</th><th>Status</th><th>Requested</th></tr></thead><tbody>${E.map(e => `<tr><td>${esc(e.item)}</td><td>${e.size ? esc(e.size) : '—'}</td><td>${pill(e.paid ? 'ok' : 'bad', e.paid ? 'Paid' : 'Unpaid')}</td><td>${pill(e.status === 'Handed over' ? 'navy plain' : e.status === 'Ready at HQ' ? 'ok' : 'warn', e.status)}</td><td>${fmtShort(new Date(e.at))}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No equipment orders.</td></tr>'}</tbody></table></div></div>`;
}
function mbFollowups(m) {
  const F = (DB.followups || []).filter(f => f.no === m.no);
  return `<div class="card white"><div class="card-h"><h3>Follow-ups</h3><button class="sbtn dark" id="mLog2">Log contact</button></div><div class="rows">${F.map(f => `<div class="row"><span class="av navy">${icon('flag')}</span><div class="grow"><div class="t">${esc(FU_KINDS[f.kind] || f.kind)} · ${plural(f.attempts.length, 'attempt')}</div><div class="d">Due ${fmtShort(new Date(f.due))}</div>${f.attempts.map(a => `<div class="d">${fmtShort(new Date(a.at))} · ${esc(a.method)} · ${esc(a.outcome)}${a.note ? ' · ' + esc(a.note) : ''}</div>`).join('')}</div></div>`).join('') || '<p style="color:var(--muted)">No follow-ups for this student.</p>'}</div></div>`;
}
function mbContact(m) {
  const info = mbInfo(m);
  return `<form class="card white" id="mContact" novalidate><div class="card-h"><div><h3>Contact details</h3><span class="sub">The front desk and Business Admins can update these. Belt, membership status and dojo are not edited here.</span></div></div>
    <div class="grid2">
      <div class="fld"><label for="c-phone">Mobile</label><input id="c-phone" value="${esc(mbPhone(m))}" inputmode="tel" autocomplete="off"><span class="err">Enter an 8-digit number.</span></div>
      <div class="fld"><label for="c-email">Email</label><input id="c-email" type="email" value="${esc(m.email || info.email)}" autocomplete="off"><span class="err">Enter a valid email.</span></div>
      <div class="fld"><label for="c-ecname">Emergency contact</label><input id="c-ecname" value="${esc(info.emergency.name)}" autocomplete="off"></div>
      <div class="fld"><label for="c-ecrel">Relationship</label><select id="c-ecrel">${['Parent', 'Spouse', 'Sibling', 'Friend', 'Other'].map(r => `<option${r === info.emergency.rel ? ' selected' : ''}>${r}</option>`).join('')}</select></div>
      <div class="fld"><label for="c-ecphone">Emergency mobile</label><input id="c-ecphone" value="${esc(info.emergency.phone)}" inputmode="tel" autocomplete="off"><span class="err">Enter an 8-digit number.</span></div>
      ${m.kind === 'child' ? `<div class="fld"><label for="c-guard">Parent or guardian</label><input id="c-guard" value="${esc(m.guardian || info.guardian)}" autocomplete="off"></div>` : ''}
    </div><div class="acts" style="margin-top:16px"><button class="sbtn dark" type="submit">${icon('check')}Save contact details</button></div></form>`;
}
const MB_RENDER = {
  overview: mbOverview,
  bookings: m => `<div class="card white"><div class="card-h"><div><h3>Upcoming bookings</h3><span class="sub">Booked classes that have not happened yet</span></div><a class="sbtn" href="sessions.html">Book a class</a></div>${histTable(mbHistory(m).filter(h => h.status === 'booked' && h.date >= TODAY), 'Nothing booked.')}</div>`,
  attendance: m => `<div class="card white"><div class="card-h"><h3>Attendance</h3></div>${histTable(mbHistory(m).filter(h => h.status !== 'booked' || h.date < TODAY), 'No attendance recorded yet.')}</div>`,
  payments: mbPayments, progress: mbProgress, equipment: mbEquipment, followups: mbFollowups, contact: mbContact
};
function renderMemberTab() {
  const m = MB.m;
  $$('#mTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.tab === MB.tab));
  $('#mBody').innerHTML = MB_RENDER[MB.tab](m);
  stripBA($('#mBody'));
}
function renderMemberHead() {
  const m = MB.m, info = mbInfo(m), owed = mbOwed(m);
  $('#mHead').innerHTML = `<h1>${esc(m.n)}</h1><p>${esc(m.no)} · ${esc(m.g)} · ${esc(dojoName(m.dojo))}</p>`;
  $('#mChips').innerHTML = mbStatusPill(m) + pill('navy plain', m.kind === 'child' ? 'Child' : 'Adult') + (m.kind === 'child' ? pill('plain', `Guardian: ${m.guardian || info.guardian}`) : '')
    + pill('plain', m.source === 'External' ? 'External member' : 'ASK member') + (owed > 0 ? pill('warn', `Owes ${money(owed)}`) : '') + (mbExpiring(m) ? pill('warn', 'Package expiring soon') : '');
}
function mbEditStatus(m) {
  openDrawer(`Change record · ${m.n}`, `<div class="note"><svg class="ic"><use href="#i-info"/></svg><span>Belt: <b>${esc(m.g)}</b>. A belt changes through grading only, so it cannot be edited here.</span></div>
    <div class="grid2" style="margin-top:14px">
      <div class="fld"><label for="ms-st">Membership status</label><select id="ms-st">${['Active', 'Lapsed'].map(s => `<option${s === m.st ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="fld"><label for="ms-dojo">Principal dojo</label><select id="ms-dojo">${DOJOS.map(d => `<option value="${d.id}"${d.id === m.dojo ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="fld full"><label for="ms-why">Reason<span class="req">*</span></label><textarea id="ms-why" placeholder="Why is this being changed?"></textarea><span class="err">A reason is required.</span></div></div>`,
    `<button class="sbtn" data-drawer-close>Cancel</button><button class="sbtn dark" id="msSave">${icon('check')}Save</button>`);
  $('#msSave').addEventListener('click', () => {
    if (!isBA()) return;
    const st = $('#ms-st').value, dojo = $('#ms-dojo').value, why = $('#ms-why').value.trim();
    if (!why) { $('#ms-why').closest('.fld').classList.add('invalid'); return toast('Add a reason first.', 'bad'); }
    if (st === m.st && dojo === m.dojo) return toast('Nothing was changed.', 'info');
    const log = (mbInfo(m).log || []).concat([{ at: new Date(), by: who(), text: `${st !== m.st ? `Status ${m.st} to ${st}. ` : ''}${dojo !== m.dojo ? `Dojo ${dojoName(m.dojo)} to ${dojoName(dojo)}.` : ''}`.trim(), reason: why }]);
    m.st = st; m.dojo = dojo; mbSetInfo(m, { log }); save(); closeDrawer(); renderMemberHead(); renderMemberTab(); toast('Record updated.');
  });
}
function refundForMember(m) {
  const paid = (DB.ledger || []).filter(l => l.no === m.no && l.st === 'Paid');
  if (!paid.length) return toast('This student has no paid payment to refund.', 'info');
  openModal(`<h3 id="modalTitle">Request a refund</h3><p class="sub">Policy is no refunds. A Business Admin decides exceptions.</p>
    <div class="fld" style="margin-top:14px"><label for="rq-pay">Payment</label><select id="rq-pay">${paid.map(l => `<option value="${esc(l.id)}">${esc(l.item)} · ${money(l.amt)} · ${fmtShort(new Date(l.date))}</option>`).join('')}</select></div>
    <div class="fld" style="margin-top:12px"><label for="rq-why">Reason</label><textarea id="rq-why"></textarea></div>
    <div class="acts"><button class="sbtn dark" id="rqGo">Send request</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#rqGo').addEventListener('click', () => {
    const l = paid.find(x => x.id === $('#rq-pay').value), why = $('#rq-why').value.trim();
    if (!l) return toast('Choose a payment.', 'bad'); if (!why) return toast('Add a reason.', 'bad');
    DB.refunds.unshift({ id: uid('R-'), no: l.no, name: l.name, item: l.item, amt: l.amt, reason: why, by: who(), at: new Date(), status: 'pending' });
    save(); closeModal(); renderMemberTab(); toast('Request sent to a Business Admin.');
  });
}
function messageModal(m) {
  openModal(`<h3 id="modalTitle">Send message to ${esc(m.n)}</h3><p class="sub">Shown in their portal notifications.</p>
    <div class="fld" style="margin-top:14px"><label for="sm-body">Message</label><textarea id="sm-body" maxlength="240" autofocus></textarea></div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="sm-email" checked><span>Also send by email</span></label>
    <div class="acts"><button class="sbtn dark" id="smGo">Send</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#smGo').addEventListener('click', () => {
    const body = $('#sm-body').value.trim(); if (!body) return toast('Write a message first.', 'bad');
    DB.sentLog.unshift({ at: new Date(), by: who(), aud: m.n, title: body.slice(0, 60) });
    save(); closeModal(); toast(`Message sent to ${m.n}${$('#sm-email') && $('#sm-email').checked ? ' (portal and email)' : ''}.`);
  });
}
function memberPage() {
  const root = $('#memberRoot'), no = new URLSearchParams(location.search).get('no') || '', m = memberByNo(no);
  if (!m) { root.innerHTML = '<div class="card"><h3>Student not found</h3><p style="margin:8px 0 14px;color:var(--muted)">No member has that number.</p><a class="sbtn dark" href="members.html">Back to Members</a></div>'; return; }
  MB.m = m; document.title = `${m.n} · Admin · Aikido Shinju-Kai`;
  const t = new URLSearchParams(location.search).get('tab'); if (MB_RENDER[t]) MB.tab = t;
  DB.memberInfo[m.no] = mbInfo(m); save();   // every member has a stored record once it is opened
  root.innerHTML = `<div class="page-h"><div id="mHead"></div><div class="acts wrap"><a class="sbtn" href="sessions.html" id="mBook">Book a class</a><button class="sbtn" id="mPay">Take payment</button><button class="sbtn" id="mLog">Log contact</button><button class="sbtn" id="mMsg">Send message</button></div></div>
    <div class="rec-chips" id="mChips"></div>
    <div class="list-bar"><div class="filters" id="mTabs">${MB_TABS.map(([k, l]) => `<button class="fpill" data-tab="${k}">${l}</button>`).join('')}</div></div>
    <div id="mBody" style="display:grid;gap:14px"></div>`;
  renderMemberHead(); renderMemberTab();
  root.addEventListener('click', e => {
    const tab = e.target.closest('#mTabs [data-tab]'); if (tab) { MB.tab = tab.dataset.tab; return renderMemberTab(); }
    if (e.target.closest('#mPay') || e.target.closest('#mPayNow')) return takePayment({ no: m.no });
    if (e.target.closest('#mLog') || e.target.closest('#mLog2')) return logContactDrawer(m, null, () => { renderMemberHead(); if (MB.tab === 'followups') renderMemberTab(); });
    if (e.target.closest('#mMsg')) return messageModal(m);
    if (e.target.closest('#mEdit') && isBA()) return mbEditStatus(m);
    if (e.target.closest('#mRefund')) return refundForMember(m);
    const rc = e.target.closest('[data-rcpt]'); if (rc) return receiptPDF((DB.ledger || []).find(l => l.id === rc.dataset.rcpt));
    const co = e.target.closest('[data-collect]'); if (co) return takePayment({ id: co.dataset.collect });
    const d = e.target.closest('[data-doc]');
    if (d && isBA()) return openModal(`<h3 id="modalTitle">${d.dataset.doc === 'ns' ? 'NS papers' : 'Experience certificates'} · ${esc(m.n)}</h3><p class="sub">Mock document. In the real system the file opens here, and only a Business Admin can open it.</p><div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-doc"/></svg><span>${d.dataset.doc === 'ns' ? 'NS papers' : 'Certificate'} checked and marked verified.</span></div>`);
    const ro = e.target.closest('[data-ref-ok]'), rn = e.target.closest('[data-ref-no]');
    if ((ro || rn) && isBA()) { const x = DB.refunds.find(y => y.id === (ro || rn).dataset[ro ? 'refOk' : 'refNo']); if (x) { x.status = ro ? 'approved' : 'declined'; save(); renderMemberTab(); toast(ro ? 'Refund approved as an exception.' : 'Refund declined.', ro ? 'ok' : 'info'); } }
  });
  root.addEventListener('submit', e => {
    if (e.target.id !== 'mContact') return;
    e.preventDefault();
    const ph = $('#c-phone').value.trim(), em = $('#c-email').value.trim(), ecp = $('#c-ecphone').value.trim();
    const bad = (sel, ok) => { $(sel).closest('.fld').classList.toggle('invalid', !ok); return ok; };
    const ok = [bad('#c-phone', mbDigits(ph).length >= 8), bad('#c-email', /^\S+@\S+\.\S+$/.test(em)), bad('#c-ecphone', !ecp || mbDigits(ecp).length >= 8)].every(Boolean);
    if (!ok) return toast('Check the highlighted fields.', 'bad');
    m.phone = ph; m.email = em; if ($('#c-guard')) m.guardian = $('#c-guard').value.trim();
    mbSetInfo(m, { phone: ph, email: em, guardian: m.guardian || '', emergency: { name: $('#c-ecname').value.trim(), rel: $('#c-ecrel').value, phone: ecp } });
    save(); renderMemberHead(); toast('Contact details saved.');
  });
}

/* ---------- Registrations (R55-R58) ---------- */
const MC_FD_LIMIT = 14;   // the front desk may approve a medical certificate of up to 14 days; longer goes to a Business Admin
const appCount = () => APPS.length + MC_REQS.filter(r => r.status === 'pending').length + (isBA() ? (DB.exceptions || []).filter(x => x.status === 'pending').length : 0);
const regRules = a => {
  const c = [{ id: 'details', t: 'Details complete', ok: !!(a.n && a.phone && a.email && a.ec) }, { id: 'consent', t: 'Consent signed', ok: !!a.signer },
    { id: 'paid', t: 'Registration paid', ok: a.paid >= (POL().registration || 60) }, { id: 'medical', t: 'Medical declared', ok: typeof a.med === 'string' && a.med !== '' }];
  if (a.group === 'Child') c.push({ id: 'guardian', t: 'Guardian consent', ok: /parent|guardian/i.test(a.signer || '') });
  return c;
};
const regReviews = a => {
  const r = [];
  if (a.prev === 'Yes') r.push('Returning member: check the 2-year rule');
  if (/aikido/i.test(a.exp || '')) r.push('Grade carry-over');
  if (a.flagged) r.push('Flagged for review');
  return r;
};
const regCarry = a => { const k = /(\d+\w*\s+(?:Kyu|Dan))/i.exec(a.exp || ''); return /aikido/i.test(a.exp || '') && k ? k[1].replace(/^(\d)/, '$1') : ''; };
const regStatus = a => regRules(a).some(c => !c.ok) ? ['bad', 'Missing info'] : regReviews(a).length ? ['warn', 'Needs review'] : ['ok', 'Ready to activate'];
/* Activate is allowed only when every switched-on auto-activation rule passes. Anything needing review waits for a Business Admin. */
function regBlock(a) {
  const checks = regRules(a), on = (POL().autoActivation || []).filter(r => r.on);
  const failed = on.filter(r => { const c = checks.find(x => x.id === r.id); return c && !c.ok; });
  if (failed.length) return `Not ready: ${failed.map(r => r.text.toLowerCase()).join(', ')}`;
  if (regReviews(a).length && !isBA()) return 'A Business Admin has to review this registration first';
  return '';
}
function mbNewNo(name) {
  let n = 3000 + hash(name) % 6000;
  while (MEMBERS.some(m => m.no === `ASK-${TODAY.getFullYear()}-${n}`)) n++;
  return `ASK-${TODAY.getFullYear()}-${n}`;
}
/* turns a registration into a member and queues dogi, handbook and belt for hand-over at HQ */
function activateApp(a, grade) {
  const child = a.group === 'Child', pk = [...PKG.adult, ...PKG.kids].find(p => p.t === a.pkg || p.name === a.pkg);
  let m = a.no && memberByNo(a.no);
  if (m) { m.source = 'ASK'; m.st = 'Active'; m.askSince = isoDate(TODAY); }
  else {
    m = { n: a.n, no: a.no || mbNewNo(a.n), g: grade || '6th Kyu', dojo: a.dojo || 'hq', hrs: 0, st: 'Active', joined: `${MON[TODAY.getMonth()]} ${TODAY.getFullYear()}`, joinedAt: isoDate(TODAY), source: 'ASK', kind: child ? 'child' : 'adult', phone: a.phone, email: a.email, seen: 0 };
    if (a.dob) m.dob = a.dob;
    if (child) m.guardian = String(a.signer || '').replace(/\s*\(.*\)\s*$/, '');
    MEMBERS.unshift(m);
  }
  if (pk && isFinite(pk.lessons)) { m.left = pk.lessons; m.exp = isoDate(expiryFor(pk)); }
  const size = a.dogiSize || ((/size\s+(\w+)/i.exec(a.dogi || '') || [])[1] || '');
  DB.equipment = DB.equipment || [];
  [['Dogi', size], ['Handbook', ''], ['Belt', '']].forEach(([item, sz], k) => DB.equipment.unshift({ id: uid('E-') + 'abc'[k], no: m.no, name: m.n, item, size: sz, paid: true, status: 'Requested', at: new Date(), by: '' }));
  return m;
}
function regChips(a) {
  const rules = regRules(a).map(c => pill(c.ok ? 'ok' : 'bad', c.ok ? c.t : `${c.t}: missing`));
  const rev = regReviews(a).map(t => pill('warn', t));
  return `<div class="chips">${rules.join('')}${rev.join('')}${/^Yes/.test(a.med || '') ? pill('warn', 'Medical note') : ''}${a.infoRequested ? pill('navy plain', 'Info requested') : ''}</div>`;
}
function renderRegs() {
  $('#appRows').innerHTML = APPS.length ? APPS.map((a, i) => { const s = regStatus(a), why = regBlock(a);
    return `<div class="row"><span class="av${a.isNew ? ' navy' : ''}">${initials(a.n)}</span><div class="grow"><div class="t">${esc(a.n)}${a.group === 'Child' ? ` <span class="pill plain" style="height:20px;font-size:11px">Age ${a.age}</span>` : ''} ${pill(s[0], s[1])}</div><div class="d">${esc(dojoName(a.dojo))} · ${esc(a.date)} · ${money(a.paid)} paid</div>${regChips(a)}</div>
      <div class="acts"><button class="sbtn" data-reg="${i}">View form</button><button class="sbtn dark" data-reg-go="${i}"${why ? ` disabled title="${esc(why)}"` : ''}>${icon('check')}Activate</button></div></div>`; }).join('')
    : '<p style="color:var(--muted)">All caught up. No registrations waiting.</p>';
}
function regOpen(i) {
  const a = APPS[i]; if (!a) return;
  const rows = [['Name', a.n], ['Gender', a.gender], ['Age', a.age], ['Nationality', a.nat], ['Mobile', a.phone], ['Email', a.email], ['Emergency contact', a.ec], ['Martial arts experience', a.exp], ['Previous ASK member', a.prev], ['Medical history', a.med], ['Principal dojo', dojoName(a.dojo)], ['Dogi', a.dogi], ['Lesson package', a.pkg], ['Paid', money(a.paid)], ['Submitted', a.date], ['Terms & PDPA', a.signer ? 'Agreed' : 'Not signed']];
  const carry = regCarry(a), why = regBlock(a);
  openDrawer(`Registration · ${a.n}`, `${regChips(a)}
    ${(a.med || '').startsWith('Yes') ? `<div class="note warn" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span><b>Medical note:</b> ${esc(a.med.slice(6))}. Share with the principal dojo instructor.</span></div>` : ''}
    ${a.infoRequested ? `<div class="note" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span><b>Info requested ${esc(a.infoRequested.at)}:</b> ${esc(a.infoRequested.text)}</span></div>` : ''}
    <div class="kv" style="margin:14px 0 0;border-top:1px solid var(--line)">${rows.map(([k, v]) => `<div><span>${k}</span><span>${esc(v)}</span></div>`).join('')}</div>
    ${(a.exps || []).length ? `<div class="app-exps"><h4>Experience and documents</h4>${a.exps.map((x, xi) => `<div class="app-exp"><b>${esc(x.art || 'Martial art')}</b>${x.grade ? `<span>${esc(x.grade)}</span>` : ''}
      ${x.files.length ? `<div class="app-docs">${x.files.map((f, fi) => f.thumb ? `<button type="button" class="app-doc" data-doc="${xi}:${fi}" aria-label="Open ${esc(f.name)}"><img src="${f.thumb}" alt=""></button>` : `<span class="app-doc pdf" title="${esc(f.name)}">${icon('doc')}<small>PDF</small></span>`).join('')}</div>` : '<small class="app-nodoc">No documents attached</small>'}</div>`).join('')}</div>` : ''}
    <div class="sig-view" style="margin-top:14px"><span>Signed by <b>${esc(a.signer || a.n)}</b>${a.sig ? ` · ${esc(a.date)}` : ''}</span>${a.sig ? `<img src="${a.sig}" alt="Signature of ${esc(a.signer || a.n)}">` : '<em>Signature on the scanned paper form</em>'}</div>
    <div class="fld" style="margin-top:14px"><label for="app-grade">Starting grade</label><select id="app-grade"${isBA() ? '' : ' disabled'}><option value="6th Kyu">6th Kyu (white belt)</option>${carry ? `<option value="${esc(carry)}"${isBA() ? ' selected' : ''}>Carry over ${esc(carry)}</option>` : ''}</select>${isBA() ? '' : '<span class="hint" id="appGradeNote">Confirmed by Business Admin</span>'}</div>
    ${why ? `<div class="note warn" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>${esc(why)}.</span></div>` : ''}`,
    `<button class="sbtn" id="regReject">Reject</button><button class="sbtn" id="regFlag">Flag for review</button><button class="sbtn" id="regInfo">Request missing info</button><button class="sbtn dark" id="regActivate"${why ? ' disabled' : ''}>${icon('check')}Activate</button>`);
  $('#drawer').querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', () => {
    const [xi, fi] = b.dataset.doc.split(':').map(Number), f = a.exps[xi].files[fi];
    openModal(`<h3 id="modalTitle">${esc(f.name)}</h3><p class="sub">${esc(a.n)} · ${esc(a.exps[xi].art)}</p><img class="doc-preview" src="${f.thumb}" alt="${esc(f.name)}">`);
  }));
  $('#regActivate').addEventListener('click', () => regActivate(a));
  $('#regInfo').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Request missing information</h3><p class="sub">${esc(a.n)} gets an email listing what to send.</p><div class="fld" style="margin-top:14px"><label for="ri-text">What is missing?</label><textarea id="ri-text" autofocus></textarea></div><div class="acts"><button class="sbtn dark" id="riGo">Send request</button><button class="sbtn" data-close>Cancel</button></div>`);
    $('#riGo').addEventListener('click', () => {
      const text = $('#ri-text').value.trim(); if (!text) return toast('Say what is missing.', 'bad');
      a.infoRequested = { at: fmtShort(new Date()), text }; save(); closeModal(); closeDrawer(); renderRegs(); toast(`Request sent to ${a.n}.`);
    });
  });
  $('#regFlag').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Flag for review</h3><p class="sub">A Business Admin will decide. Say what needs a decision.</p><div class="fld" style="margin-top:14px"><label for="rf-why">Reason</label><textarea id="rf-why" autofocus></textarea></div><div class="acts"><button class="sbtn dark" id="rfGo">Send to Business Admin</button><button class="sbtn" data-close>Cancel</button></div>`);
    $('#rfGo').addEventListener('click', () => {
      const why = $('#rf-why').value.trim(); if (!why) return toast('Add a reason first.', 'bad');
      a.flagged = why;
      DB.exceptions.unshift({ id: uid('X-'), kind: 'registration', who: a.n, text: why, by: who(), at: new Date(), status: 'pending' });
      save(); closeModal(); closeDrawer(); renderAll(); toast('Sent to a Business Admin to decide.');
    });
  });
  $('#regReject').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Reject ${esc(a.n)}?</h3><p class="sub">They get an email with the reason below. This does not change any payment.</p><div class="fld" style="margin-top:16px"><label for="rej-why">Reason (sent to the applicant)</label><textarea id="rej-why" autofocus></textarea></div><div class="acts"><button class="sbtn red" id="doReject">Reject</button><button class="sbtn" data-close>Back</button></div>`);
    $('#doReject').addEventListener('click', () => { const k = APPS.indexOf(a); if (k > -1) APPS.splice(k, 1); save(); renderAll(); closeModal(); closeDrawer(); toast('Registration rejected. The applicant has been emailed.', 'info'); });
  });
}
function regActivate(a) {
  const why = regBlock(a); if (why) return toast(why, 'bad');
  const sel = $('#app-grade'), grade = sel && isBA() ? sel.value : '6th Kyu';
  const k = APPS.indexOf(a); if (k < 0) return;
  APPS.splice(k, 1);
  const m = activateApp(a, grade);
  save(); closeDrawer(); renderAll();
  toast(`${m.n} activated. Dogi, handbook and belt are queued at HQ.`);
}

/* ---------- Extensions (R52-R54) ---------- */
const mcUnlimited = r => /unlimited/i.test(r.passName || '') || (!MY_PASSES.some(p => p.id === r.passId) && r.no === ME.no && !!DB.unlimited);
const mcWithin = r => r.days <= MC_FD_LIMIT && (r.kind !== 'mc' || !!r.fileName);
const mcWhen = r => r.kind === 'mc' ? `MC ${fmtShort(new Date(r.from))} – ${fmtShort(new Date(r.to))}` : 'Compassion Guaranteed (no MC needed)';
function renderMC() {
  const el = $('#mcRows'); if (!el) return;
  const pend = MC_REQS.filter(r => r.status === 'pending'), past = MC_REQS.filter(r => r.status !== 'pending').slice(0, 5);
  const chips = r => [mcUnlimited(r) ? pill('navy plain', 'Unlimited plan') : '', !mcWithin(r) ? pill('warn', r.days > MC_FD_LIMIT ? `Over ${MC_FD_LIMIT} days` : 'No MC attached') : '', r.referred ? pill('warn', 'With Business Admin') : ''].join('');
  el.innerHTML = (pend.length ? pend.map(r => `<div class="row"><span class="av navy">${icon(r.kind === 'mc' ? 'doc' : 'gift')}</span><div class="grow"><div class="t">${esc(r.n)} · +${plural(r.days, 'day')}</div><div class="d">${esc(r.passName)} · ${mcWhen(r)} · sent ${fmtShort(new Date(r.date))}</div><div class="chips">${chips(r)}</div></div><div class="acts"><button class="sbtn" data-mc-view="${esc(r.id)}">View</button></div></div>`).join('')
    : '<p style="color:var(--muted)">No extension requests waiting.</p>')
    + (past.length ? `<h4 class="mc-past-h">Recently handled</h4>${past.map(r => `<div class="row"><span class="av">${icon(r.kind === 'mc' ? 'doc' : 'gift')}</span><div class="grow"><div class="t">${esc(r.n)} · +${plural(r.days, 'day')}</div><div class="d">${esc(r.passName)} · ${mcWhen(r)}${r.excused ? ' · recorded as excused' : r.status === 'approved' ? ` · ${r.returnLesson ? 'lesson returned' : 'no lesson returned'}, ${r.extend ? 'expiry extended' : 'expiry unchanged'}` : ''}</div></div>${pill(r.status === 'approved' ? 'ok' : 'bad', r.status === 'approved' ? 'Approved' : 'Not approved')}</div>`).join('')}` : '');
}
function mcOpen(id) {
  const r = MC_REQS.find(x => x.id === id); if (!r) return;
  const pass = MY_PASSES.find(p => p.id === r.passId), cur = pass ? pass.expires : new Date(r.oldExp), unl = mcUnlimited(r), can = isBA() || mcWithin(r), comp = r.kind === 'compassion';
  const tick = (tid, label, hint, on, off) => `<label class="check${off ? ' off' : ''}"><input type="checkbox" id="${tid}"${on ? ' checked' : ''}${off ? ' disabled' : ''}><span>${label}<small>${hint}</small></span></label>`;
  openDrawer(`Extension · ${r.n}`, `<div class="kv" style="margin:0;border-top:1px solid var(--line)">
      <div><span>Member</span><span>${esc(r.n)} · ${esc(r.no)}</span></div>
      <div><span>Package</span><span>${esc(r.passName)}</span></div>
      <div><span>Type</span><span>${comp ? 'Compassion Guaranteed' : 'Medical certificate'}</span></div>
      ${comp ? '' : `<div><span>MC dates</span><span>${fmtDate(new Date(r.from))} – ${fmtDate(new Date(r.to))}</span></div><div><span>MC file</span><span>${esc(r.fileName || 'None attached')}</span></div>`}
      <div><span>Days covered</span><span>${plural(r.days, 'day')}</span></div>
      <div><span>Expires now</span><span>${fmtDate(new Date(cur))}</span></div>
      <div><span>Expires after approval</span><span id="mc-after">${unl ? 'No change' : fmtDate(addDays(new Date(cur), r.days))}</span></div>
      <div><span>Sent</span><span>${fmtDate(new Date(r.date))}</span></div></div>
    ${r.note ? `<div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span><b>Member's note:</b> ${esc(r.note)}</span></div>` : ''}
    ${unl ? '<div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span><b>Unlimited plan.</b> Billing carries on. The MC is kept on record and the absence is marked excused. There is no lesson to return and no expiry to extend.</span></div>' : ''}
    ${!can ? `<div class="note warn" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>${r.days > MC_FD_LIMIT ? `This MC covers more than ${MC_FD_LIMIT} days.` : 'There is no MC attached.'} A Business Admin has to decide.</span></div>` : ''}
    <div class="mc-ticks">${tick('mc-ret', 'Return lesson', comp ? 'Not used for Compassion Guaranteed' : 'Adds one lesson back for the class that was missed', !unl && !comp, unl || comp)}${tick('mc-ext', 'Extend expiry', `Moves the expiry date by ${plural(r.days, 'day')}`, !unl, unl)}</div>
    ${comp && can ? '<label class="check" style="margin-top:14px"><input type="checkbox" id="mc-comp"><span>I have checked this is a children\'s 1-month pass and the request is within 14 days<small>Compassion Guaranteed needs no MC</small></span></label>' : ''}
    ${can ? `<div class="fld" style="margin-top:16px"><label for="mc-why">Reason if not approved<span class="opt">Sent to the member</span></label><textarea id="mc-why" placeholder="e.g. MC dates don't match the missed classes"></textarea></div>` : ''}`,
    can ? `<button class="sbtn" id="mcReject">Not approved</button><button class="sbtn dark" id="mcApprove">${icon('check')}${unl ? 'Record as excused' : 'Approve'}</button>`
      : r.referred ? `<span class="pill warn">With Business Admin</span>` : '<button class="sbtn dark" id="mcRefer">Refer to Business Admin</button>');
  const upd = () => { const e = $('#mc-ext'); if ($('#mc-after') && e && !unl) $('#mc-after').textContent = e.checked ? fmtDate(addDays(new Date(cur), r.days)) : `${fmtDate(new Date(cur))} (unchanged)`; };
  if ($('#mc-ext')) $('#mc-ext').addEventListener('change', upd);
  if ($('#mcApprove')) $('#mcApprove').addEventListener('click', () => {
    if (comp && !$('#mc-comp').checked) return toast('Confirm the Compassion Guaranteed check first.', 'bad');
    const ret = $('#mc-ret').checked, ext = $('#mc-ext').checked;
    if (!unl && !ret && !ext) return toast('Tick Return lesson or Extend expiry, or choose Not approved.', 'bad');
    mcApprove(r, { ret, ext });
  });
  if ($('#mcReject')) $('#mcReject').addEventListener('click', () => {
    r.status = 'rejected'; r.reason = $('#mc-why').value.trim(); r.decidedBy = who(); save(); closeDrawer(); renderAll();
    toast(`Extension for ${r.n} not approved. Member notified.`, 'info');
  });
  if ($('#mcRefer')) $('#mcRefer').addEventListener('click', () => {
    r.referred = true;
    DB.exceptions.unshift({ id: uid('X-'), kind: 'extension', who: r.n, text: `${r.kind === 'mc' ? `MC ${fmtShort(new Date(r.from))} to ${fmtShort(new Date(r.to))}` : 'Compassion request'} for ${r.passName}: ${r.days > MC_FD_LIMIT ? `${plural(r.days, 'day')}, over the ${MC_FD_LIMIT} day limit` : 'no MC attached'}.`, by: who(), at: new Date(), status: 'pending', mcId: r.id });
    save(); closeDrawer(); renderAll(); toast('Sent to a Business Admin to decide.');
  });
}
function mcApprove(r, opt) {
  if (r.status !== 'pending') return;
  const pass = MY_PASSES.find(p => p.id === r.passId), m = memberByNo(r.no);
  r.status = 'approved'; r.decidedBy = who(); r.decidedAt = new Date();
  if (mcUnlimited(r)) { r.excused = true; r.returnLesson = false; r.extend = false; r.newExp = r.oldExp; }
  else {
    r.returnLesson = !!opt.ret; r.extend = !!opt.ext;
    if (opt.ext) { if (pass) pass.expires = addDays(pass.expires, r.days); else if (m && m.exp) m.exp = isoDate(addDays(mbDate(m.exp), r.days)); }
    if (opt.ret) { if (pass) pass.left = Math.min(pass.total || pass.left + 1, pass.left + 1); else if (m && typeof m.left === 'number') m.left++; }
    r.newExp = pass ? pass.expires : addDays(new Date(r.oldExp), opt.ext ? r.days : 0);
  }
  (DB.exceptions || []).filter(x => x.mcId === r.id && x.status === 'pending').forEach(x => { x.status = 'approved'; x.reason = 'Approved on the Extensions tab'; x.decidedBy = who(); });
  save(); closeDrawer(); renderAll();
  toast(r.excused ? `MC recorded for ${r.n}. Absence marked excused.` : `Approved for ${r.n}.${r.returnLesson ? ' Lesson returned.' : ''}${r.extend ? ` Expiry extended by ${plural(r.days, 'day')}.` : ''}`);
}

/* ---------- Exceptions (R57, Business Admin only) ---------- */
const EXC_KINDS = { registration: 'Registration', extension: 'Extension', access: 'Access request', mistake: 'Payment mistake', refund: 'Refund' };
function renderExc() {
  const el = $('#excRows'); if (!el) return;
  const X = DB.exceptions || [], pend = X.filter(x => x.status === 'pending'), past = X.filter(x => x.status !== 'pending').slice(0, 6);
  const line = x => `<div class="t">${esc(x.who)} · ${esc(EXC_KINDS[x.kind] || x.kind)}</div><div class="d">${esc(x.text)}</div><div class="d">Sent by ${esc(x.by)} · ${fmtShort(new Date(x.at))}</div>`;
  el.innerHTML = (pend.length ? pend.map(x => `<div class="row"><span class="av navy">${icon('shield')}</span><div class="grow">${line(x)}</div><div class="acts"><button class="sbtn dark" data-exc-ok="${esc(x.id)}">Approve</button><button class="sbtn" data-exc-no="${esc(x.id)}">Decline</button></div></div>`).join('')
    : '<p style="color:var(--muted)">Nothing waiting for a decision.</p>')
    + (past.length ? `<h4 class="mc-past-h">Recently decided</h4>${past.map(x => `<div class="row"><span class="av">${icon('shield')}</span><div class="grow">${line(x)}${x.reason ? `<div class="d">Reason: ${esc(x.reason)}</div>` : ''}</div>${pill(x.status === 'approved' ? 'ok' : 'bad', cap1(x.status))}</div>`).join('')}` : '');
}
function excDecide(id, ok) {
  const x = (DB.exceptions || []).find(y => y.id === id); if (!x || !isBA()) return;
  openModal(`<h3 id="modalTitle">${ok ? 'Approve' : 'Decline'}: ${esc(x.who)}</h3><p class="sub">${esc(x.text)}</p><div class="fld" style="margin-top:14px"><label for="ex-why">Reason<span class="req">*</span></label><textarea id="ex-why" autofocus></textarea></div><div class="acts"><button class="sbtn ${ok ? 'dark' : 'red'}" id="exGo">${ok ? 'Approve' : 'Decline'}</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#exGo').addEventListener('click', () => {
    const why = $('#ex-why').value.trim(); if (!why) return toast('A reason is needed.', 'bad');
    x.status = ok ? 'approved' : 'declined'; x.reason = why; x.decidedBy = who(); x.decidedAt = new Date();
    save(); closeModal(); renderAll(); toast(ok ? 'Approved.' : 'Declined.', ok ? 'ok' : 'info');
  });
}

function regTab(tab) {
  const ids = { reg: '#tabReg', ext: '#tabExt', exc: '#tabExc' };
  if (!$(ids[tab])) tab = 'reg';
  Object.entries(ids).forEach(([k, s]) => { const e = $(s); if (e) e.hidden = k !== tab; });
  $$('#regTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}
function renderAll() {
  renderRegs(); renderMC(); renderExc();
  $('#nReg').textContent = APPS.length; $('#nExt').textContent = MC_REQS.filter(r => r.status === 'pending').length;
  if ($('#nExc')) $('#nExc').textContent = (DB.exceptions || []).filter(x => x.status === 'pending').length;
  setCount('applications', appCount());
}
function applicationsPage() {
  renderAll();
  regTab(new URLSearchParams(location.search).get('tab') || 'reg');
  $('#regTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) regTab(b.dataset.tab); });
  $('#appRows').addEventListener('click', e => {
    const v = e.target.closest('[data-reg]'); if (v) return regOpen(+v.dataset.reg);
    const g = e.target.closest('[data-reg-go]'); if (g && !g.disabled) regActivate(APPS[+g.dataset.regGo]);
  });
  $('#mcRows').addEventListener('click', e => { const v = e.target.closest('[data-mc-view]'); if (v) mcOpen(v.dataset.mcView); });
  if ($('#excRows')) $('#excRows').addEventListener('click', e => {
    const ok = e.target.closest('[data-exc-ok]'), no = e.target.closest('[data-exc-no]');
    if (ok) excDecide(ok.dataset.excOk, true); else if (no) excDecide(no.dataset.excNo, false);
  });
  filterList('#appSearch', '#appRows'); filterList('#mcSearch', '#mcRows');
  if ($('#excSearch')) filterList('#excSearch', '#excRows');
}

/* ---------- Assisted registration (R59, R60) ---------- */
const RG = { existing: null, sig: null };
const rgIso = () => $('#rg-dob').dataset.iso || '';
const rgAge = () => rgIso() ? ageOn(mbDate(rgIso())) : null;
const pkgPrice = p => ((POL().packages || []).find(x => x.id === p.id) || p).amt;
function rgPackages() {
  const age = rgAge(), list = age !== null && age < 16 ? PKG.kids : PKG.adult, cur = $('#rg-pkg').value;
  $('#rg-pkg').innerHTML = '<option value="">No package yet</option>' + list.map(p => `<option value="${p.id}">${esc(p.name)} · ${money(pkgPrice(p))}</option>`).join('');
  if (list.some(p => p.id === cur)) $('#rg-pkg').value = cur;
}
function rgFees() {
  const age = rgAge(), dob = rgIso(), d = dob ? discountFor(mbDate(dob), !!(RG.existing && RG.existing.nsf)) : { pct: 0, label: '' };
  const pkg = [...PKG.adult, ...PKG.kids].find(p => p.id === $('#rg-pkg').value);
  const lines = [['Registration', POL().registration || 60, true], ['Annual dues', POL().annualDues || 48, true]];
  if (pkg) lines.push([pkg.name, pkgPrice(pkg), true]);
  lines.push(['Dogi', DOGI_PRICE, false]);
  const disc = lines.reduce((s, l) => s + (l[2] ? Math.round(l[1] * d.pct) / 100 : 0), 0), sub = lines.reduce((s, l) => s + l[1], 0);
  $('#rgDisc').textContent = d.pct ? `${d.label}. Applied automatically, no proof needed.` : (age !== null ? 'No age discount applies.' : 'Sets the class group and fees.');
  $('#rgFees').innerHTML = lines.map(l => `<div><span>${esc(l[0])}</span><span>${money(l[1])}</span></div>`).join('')
    + (d.pct ? `<div><span id="rgDiscRow">Discount · ${esc(d.label)}</span><span>-${money(disc)}</span></div>` : '')
    + `<div><span>Total</span><span id="rgTotal">${money(sub - disc)}</span></div>`;
  return { lines, disc, total: sub - disc, d, pkg };
}
function rgDob() {
  const age = rgAge(); $('#rg-age').value = age === null ? '' : age;
  const bad = rgIso() && (age === null || age < 4);
  $('#rg-dob').closest('.fld').classList.toggle('invalid', !!bad);
  $('#rgGuardian').hidden = !(age !== null && age < 18);
  rgPackages(); rgFees();
}
function rgFound() {
  const q = $('#rg-find').value.trim().toLowerCase(), box = $('#rgFound');
  if (!q) { box.innerHTML = ''; return; }
  const list = MEMBERS.filter(m => memMatch(m, q)).slice(0, 5);
  box.innerHTML = list.map(memberBtn).join('') || '<p style="color:var(--muted)">No existing member found. Continue below to register a new student.</p>';
}
function rgPick(m) {
  $('#rg-find').value = ''; $('#rgFound').innerHTML = '';
  if (m.source !== 'External') {
    RG.existing = null;
    $('#rgExisting').innerHTML = `<div class="note warn" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span><b>${esc(m.n)} is already an ASK member (${esc(m.no)}).</b> <a href="member.html?no=${encodeURIComponent(m.no)}">Open their record</a> instead of registering again.</span></div>`;
    return rgFees();
  }
  RG.existing = m;
  $('#rg-name').value = m.n; $('#rg-phone').value = mbPhone(m); $('#rg-email').value = m.email || mbInfo(m).email;
  if (m.dob) $('#rg-dob').dpSet(mbDate(m.dob));
  $('#rgExisting').innerHTML = `<div class="note" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span><b>${esc(m.n)} is an External member (${esc(m.no)}).</b> This adds ASK membership to their record: ${money(POL().registration || 60)} registration and ${money(POL().annualDues || 48)} annual dues. <button type="button" class="sbtn ghost" id="rgClear">Clear</button></span></div>`;
  rgDob(); rgFees();
}
function rgValidate() {
  let first = null;
  const need = (ok, fld) => { fld.classList.toggle('invalid', !ok); if (!ok && !first) first = fld; };
  const f = id => $(id).closest('.fld'), val = id => $(id).value.trim();
  const age = rgAge(), minor = age !== null && age < 18, med = radio('rg-med');
  need(!!val('#rg-name'), f('#rg-name')); need(!!radio('rg-gender'), f('#rg-g1')); need(!!$('#rg-nat').value, f('#rg-nat'));
  need(age !== null && age >= 4, f('#rg-dob'));
  need(mbDigits(val('#rg-phone')).length === 8, f('#rg-phone')); need(/^\S+@\S+\.\S+$/.test(val('#rg-email')), f('#rg-email'));
  if (minor) { need(!!val('#rg-gname'), f('#rg-gname')); need(mbDigits(val('#rg-gphone')).length === 8, f('#rg-gphone')); }
  need(!!val('#rg-ecname'), f('#rg-ecname')); need(!!$('#rg-ecrel').value, f('#rg-ecrel')); need(mbDigits(val('#rg-ecphone')).length === 8, f('#rg-ecphone'));
  need(!!med, f('#rg-m1')); if (med === 'Yes') need(!!val('#rg-meddetail'), f('#rg-meddetail'));
  need(!!$('#rg-dogi').value, f('#rg-dogi'));
  need($('#rg-terms').checked, $('#f-terms')); need($('#rg-pdpa').checked, $('#f-pdpa')); need(!!RG.sig.value(), $('#f-sig'));
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !first;
}
function rgComplete() {
  const val = id => $(id).value.trim(), age = rgAge(), minor = age < 18, fees = rgFees(), ex = RG.existing, carry = $('#rg-carry').value;
  const no = ex ? ex.no : mbNewNo(val('#rg-name')), pkg = fees.pkg;
  const a = { n: val('#rg-name'), no, dojo: 'hq', date: `${TODAY.getDate()} ${MON[TODAY.getMonth()]} ${TODAY.getFullYear()}`, paid: fees.total, group: age < 16 ? 'Child' : 'Adult', age,
    gender: radio('rg-gender'), nat: $('#rg-nat').value, phone: val('#rg-phone'), email: val('#rg-email'), ec: `${val('#rg-ecname')} (${$('#rg-ecrel').value}) · ${val('#rg-ecphone')}`,
    exp: carry ? `Aikido, ${carry}` : '—', prev: 'No', med: radio('rg-med') === 'Yes' ? `Yes · ${val('#rg-meddetail')}` : 'No', dogi: `Dogi size ${$('#rg-dogi').value}`, dogiSize: $('#rg-dogi').value,
    pkg: pkg ? pkg.t : 'None', signer: minor ? `${val('#rg-gname')} (parent/guardian)` : val('#rg-name'), sig: RG.sig.value(), dob: rgIso(), assisted: true, nsProof: $('#rg-ns').files.length ? 'Uploaded, waiting for a Business Admin' : '' };
  const inv = newInv(), stamp = new Date();
  fees.lines.forEach(([item], k) => {
    const full = fees.lines[k][1], amt = fees.lines[k][2] ? Math.round(full * (100 - fees.d.pct)) / 100 : full;
    DB.ledger.unshift({ id: 'L-' + String(Date.now()).slice(-6) + k, no, name: a.n, item, amt, method: 'Stripe', date: stamp, st: 'Paid', by: 'desk', inv, note: fees.d.pct && fees.lines[k][2] ? fees.d.label : undefined });
  });
  const auto = !regBlock(a) && !(regReviews(a).length);
  let m = null;
  if (auto) m = activateApp(a, '6th Kyu'); else APPS.push(a);
  save();
  $('#regForm').hidden = true;
  const done = $('#regDone'); done.hidden = false;
  done.innerHTML = `<div class="card-h"><div><h3>${auto ? 'Registered' : 'Registration received'}</h3><span class="sub">${auto ? `${esc(a.n)} is now an ASK member.` : 'A Business Admin has to confirm the carried-over grade before this student is activated.'}</span></div></div>
    <div class="kv" style="margin:0"><div><span>Student</span><span>${esc(a.n)}</span></div><div><span>Member no.</span><span class="num">${esc(no)}</span></div><div><span>Paid by Stripe</span><span>${money(fees.total)}</span></div><div><span>Invoice</span><span>${esc(inv)}</span></div>
    <div><span>Equipment</span><span>${auto ? `Dogi size ${esc(a.dogiSize)}, handbook and belt are queued at HQ` : 'Queued after activation'}</span></div></div>
    <div class="acts" style="margin-top:16px">${auto ? `<a class="sbtn dark" href="member.html?no=${encodeURIComponent(no)}">Open student record</a>` : '<a class="sbtn dark" href="applications.html">Go to Registrations</a>'}<a class="sbtn" href="register.html">Register another student</a></div>`;
  toast(auto ? `${a.n} registered.` : `${a.n} waits for a Business Admin.`);
  done.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function registerPage() {
  $('#rg-dogi').insertAdjacentHTML('beforeend', DOGI_SIZES.map(s => `<option>${s}</option>`).join(''));
  $('#rg-carry').insertAdjacentHTML('beforeend', BELTS.slice(1).map(b => `<option>${b.g}</option>`).join(''));
  RG.sig = signaturePad($('#rgSig'), { startLabel: 'Sign here', onChange: () => $('#f-sig').classList.remove('invalid') });
  $('#rg-dob').addEventListener('change', rgDob);
  $('#rg-pkg').addEventListener('change', rgFees);
  $('#rgMedSeg').addEventListener('change', () => { $('#rgMedBox').hidden = radio('rg-med') !== 'Yes'; });
  $('#rg-ns').addEventListener('change', () => { const n = $('#rg-ns').files.length; $('#rgNsState').innerHTML = n ? `${pill('navy plain', 'Sent for verification')} A Business Admin checks the papers. The discount applies once they are verified.` : 'For National Servicemen. Only a Business Admin can open the papers.'; });
  $('#rg-find').addEventListener('input', rgFound);
  $('#rgFound').addEventListener('click', e => { const b = e.target.closest('[data-pick]'); if (b) rgPick(memberByNo(b.dataset.pick)); });
  $('#rgExisting').addEventListener('click', e => { if (e.target.closest('#rgClear')) { RG.existing = null; $('#rgExisting').innerHTML = ''; rgFees(); } });
  $('#regForm').addEventListener('input', e => { const f = e.target.closest('.fld'); if (f) f.classList.remove('invalid'); });
  $('#regForm').addEventListener('change', e => { const f = e.target.closest('.fld'); if (f && e.target.id !== 'rg-dob') f.classList.remove('invalid'); });
  $('#regForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!rgValidate()) return toast('Check the highlighted fields.', 'bad');
    const btn = $('#rgPay'); btn.disabled = true; btn.textContent = 'Waiting for Stripe…';
    setTimeout(rgComplete, 700);
  });
  const pre = new URLSearchParams(location.search).get('no'), m = pre && memberByNo(pre); if (m) rgPick(m);
  rgFees();
}

/* ---------- Follow-ups (R66-R69) ---------- */
const FU_KINDS = { declining: 'Declining attendance', renewal: 'Renewal coming up', newcomer: 'Newcomer not returned' };
const FU_TABS = [['newcomer', 'Newcomers not returned'], ['declining', 'Declining attendance'], ['renewal', 'Renewals coming up'], ['mine', 'Assigned to me']];
const fuUI = { tab: 'declining' };
const fuTrig = () => Object.assign({ declineDays: 14, renewalDays: 30 }, POL().followTriggers);
function fuCandidates(kind) {
  const t = fuTrig();
  if (kind === 'declining') return MEMBERS.filter(m => m.st === 'Active' && mbSeen(m) >= t.declineDays);
  if (kind === 'renewal') return MEMBERS.filter(m => { const e = mbPkg(m).exp; return m.st === 'Active' && ((e && daysBetween(TODAY, e) >= 0 && daysBetween(TODAY, e) <= t.renewalDays) || mbOwed(m) > 0); });
  if (kind === 'newcomer') return MEMBERS.filter(m => m.st === 'Active' && daysBetween(mbJoinedDate(m), TODAY) <= 90 && mbSeen(m) >= 7);
  return [];
}
function fuRows(tab) {
  if (tab === 'mine') return (DB.followups || []).filter(f => ADMIN && f.owner === ADMIN.id).map(f => ({ m: memberByNo(f.no), f, kind: f.kind })).filter(r => r.m);
  const rows = fuCandidates(tab).map(m => ({ m, f: (DB.followups || []).find(x => x.no === m.no && x.kind === tab), kind: tab }));
  (DB.followups || []).filter(f => f.kind === tab && !rows.some(r => r.m && r.m.no === f.no)).forEach(f => { const m = memberByNo(f.no); if (m) rows.push({ m, f, kind: tab }); });
  return rows;
}
function fuReason(m, kind) {
  if (kind === 'declining') return `No visit for ${plural(mbSeen(m), 'day')}`;
  if (kind === 'newcomer') return `Joined ${fmtShort(mbJoinedDate(m))}, not seen for ${plural(mbSeen(m), 'day')}`;
  const e = mbPkg(m).exp, owed = mbOwed(m);
  return owed > 0 ? `Dues ${money(owed)} unpaid` : e ? `Package ends ${fmtShort(e)}` : 'Renewal due';
}
function renderFollowups() {
  $('#fuTabs').innerHTML = FU_TABS.map(([k, l]) => `<button class="fpill${fuUI.tab === k ? ' on' : ''}" data-tab="${k}">${l}<span class="n">${fuRows(k).length}</span></button>`).join('');
  const staff = (DB.staff || []).filter(s => s.status === 'active' && s.type !== 'instructor');
  $('#fuRows').innerHTML = fuRows(fuUI.tab).map(({ m, f, kind }) => {
    const last = f && f.attempts[f.attempts.length - 1];
    return `<tr data-no="${esc(m.no)}" data-kind="${esc(kind)}"><td><div class="who"><span class="av">${initials(m.n)}</span><div><b><a href="member.html?no=${encodeURIComponent(m.no)}">${esc(m.n)}</a></b><span class="num">${esc(m.no)}</span></div></div></td>
      <td>${esc(fuReason(m, kind))}${fuUI.tab === 'mine' ? `<span class="sub-note">${esc(FU_KINDS[kind] || kind)}</span>` : ''}</td><td>${esc(mbSeenText(mbSeen(m)))}</td><td>${esc(mbPhone(m))}</td>
      <td class="num">${f ? f.attempts.length : 0}${last ? `<span class="sub-note">${esc(last.outcome)}</span>` : ''}</td><td>${f ? fmtShort(new Date(f.due)) : '—'}</td>
      <td><div class="acts-inline"><button class="sbtn dark" data-log="1">Log contact</button><select class="input" data-assign="1" data-ba aria-label="Assign ${esc(m.n)}"><option value="">Unassigned</option>${staff.map(s => `<option value="${esc(s.id)}"${f && f.owner === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></td></tr>`;
  }).join('') || `<tr><td colspan="7" style="color:var(--muted)">${fuUI.tab === 'mine' ? 'Nothing is assigned to you.' : 'Nobody to contact in this list.'}</td></tr>`;
  stripBA($('#fuRows'));
  renderOutcomes();
}
function renderOutcomes() {
  const el = $('#fuOutcomes'); if (!el) return;
  const list = (DB.followups || []).filter(f => f.attempts.length);
  el.innerHTML = list.map(f => { const a = f.attempts[f.attempts.length - 1]; return `<div class="row"><span class="av navy">${initials(f.name)}</span><div class="grow"><div class="t">${esc(f.name)} · ${esc(a.outcome)}</div><div class="d">${esc(a.method)} · ${esc(a.by || 'Staff')} · ${fmtShort(new Date(a.at))}${a.note ? ' · ' + esc(a.note) : ''}</div></div>${pill('plain', plural(f.attempts.length, 'attempt'))}</div>`; }).join('') || '<p style="color:var(--muted)">No contact has been logged yet.</p>';
}
function followupsPage() {
  const owner = $('#fu-owner');
  if (owner) {
    owner.innerHTML = (DB.staff || []).filter(s => s.status === 'active' && s.type !== 'instructor').map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    $('#fu-due').value = isoDate(addDays(TODAY, 3));
    $('#fuCreate').addEventListener('click', () => {
      const kind = $('#fu-kind').value, due = $('#fu-due').value;
      if (!due) return toast('Choose a date to contact them by.', 'bad');
      const fresh = fuCandidates(kind).filter(m => !(DB.followups || []).some(f => f.no === m.no && f.kind === kind));
      fresh.forEach(m => DB.followups.push({ id: uid('F-'), no: m.no, name: m.n, kind, owner: owner.value, due: mbDate(due), attempts: [] }));
      save(); renderFollowups(); toast(fresh.length ? `${plural(fresh.length, 'student')} added and assigned.` : 'Everyone on this list already has a follow-up.', fresh.length ? 'ok' : 'info');
    });
  }
  const q = new URLSearchParams(location.search).get('tab'); if (FU_TABS.some(t => t[0] === q)) fuUI.tab = q;
  renderFollowups();
  filterList('#fuSearch', '#fuRows');
  $('#fuTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { fuUI.tab = b.dataset.tab; renderFollowups(); } });
  $('#fuRows').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-no]'); if (!tr) return;
    const m = memberByNo(tr.dataset.no);
    if (e.target.closest('[data-log]')) logContactDrawer(m, tr.dataset.kind, renderFollowups);
  });
  $('#fuRows').addEventListener('change', e => {
    const sel = e.target.closest('[data-assign]'); if (!sel || !isBA()) return;
    const tr = sel.closest('tr'), m = memberByNo(tr.dataset.no), f = fuRecord(m, tr.dataset.kind, true);
    f.owner = sel.value; save(); renderFollowups(); toast(sel.value ? `${m.n} assigned.` : `${m.n} is unassigned.`, 'info');
  });
}

/* ---------- page setup ---------- */
runPage({
  members: membersPage,
  member: memberPage,
  applications: applicationsPage,
  register: registerPage,
  followups: followupsPage
});
