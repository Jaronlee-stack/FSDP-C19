'use strict';
/* AIKIDO SHINJU-KAI — admin-members.js  (office portal: Members, student record, Registrations, Extensions, Exceptions, assisted registration, Follow-ups)

   Loaded after admin-shell.js, admin-data-desk.js and admin-desk.js (it reuses iso, who, pill, run, memberLegacy, memberSearch, takePayment, receiptPDF, refundRequestModal).
   Every page loads from the API and writes through it. The server decides what the front desk may edit or approve (belt, status and dojo changes, CSV export,
   exceptions and follow-up assignment are Business Admin only); the page hides those controls as a courtesy. */

const mbDate = v => v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00');
const mbSeenText = n => n === null || n === undefined ? 'Never' : n === 0 ? 'Today' : n === 1 ? 'Yesterday' : `${n} days ago`;
const mbDigits = s => String(s || '').replace(/\D/g, '');
const monthYear = ymd => `${MON[+ymd.slice(5, 7) - 1]} ${ymd.slice(0, 4)}`;
const mbStatusPill = st => pill(st === 'Active' ? 'ok' : 'bad', st);
function mbPkgText(m) {
  if (m.unl) return `Unlimited · until ${fmtShort(ASK.d(m.unl))}`;
  if (m.left > 0) return `${plural(m.left, 'lesson')} left${m.exp ? ' · to ' + fmtShort(ASK.d(m.exp)) : ''}`;
  return 'No active package';
}

/* ---------- Members list ---------- */
const memUI = { f: 'All', q: '', data: null };
const MEM_FILTERS = ['All', 'Active', 'Lapsed', 'Expiring soon', 'Outstanding balance', 'New (90 days or less)', 'Guests'];
const MEM_KEY = { 'All': 'all', 'Active': 'active', 'Lapsed': 'lapsed', 'Expiring soon': 'expiring', 'Outstanding balance': 'owing', 'New (90 days or less)': 'new', 'Guests': 'guests' };
let memSeq = 0;
async function loadMembers() {
  const n = ++memSeq, r = await run(() => ASK.load.deskMembers({ filter: MEM_KEY[memUI.f], q: memUI.q.trim(), pageSize: 200 }));
  if (!r || n !== memSeq) return;
  memUI.data = r; drawMembers();
}
function drawMembers() {
  const r = memUI.data; if (!r) return;
  $('#memFilter').innerHTML = MEM_FILTERS.map(f => `<button class="fpill${f === memUI.f ? ' on' : ''}" data-f="${esc(f)}">${esc(f)}<span class="n">${r.counts[MEM_KEY[f]]}</span></button>`).join('');
  $('#memSub').textContent = `${r.totals.active} active of ${r.totals.all} members · ${plural(r.totals.guests, 'guest')}`;
  if (memUI.f === 'Guests') {
    $('#memRows').innerHTML = r.guests.map(g => `<tr><td><div class="who"><span class="av">${initials(g.name)}</span><div><b>${esc(g.name)}</b><span class="num">${esc(g.mobile || '')}</span></div></div></td><td>—</td><td>HQ Dojo</td><td>${esc(passLabel(g))}${g.until ? ` · to ${fmtShort(ASK.d(g.until))}` : ['trial', 'single'].includes(g.pass) ? (g.used ? ' · used' : ' · not used yet') : ''}</td><td>${pill('plain', 'Guest')}</td><td>—</td></tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted)">No guests match.</td></tr>';
    return;
  }
  $('#memRows').innerHTML = r.rows.map(memberLegacy).map(m =>
    `<tr class="click" data-no="${esc(m.no)}"><td><div class="who"><span class="av">${initials(m.n)}</span><div><b><a href="member.html?no=${encodeURIComponent(m.no)}">${esc(m.n)}</a></b><span class="num">${esc(m.no)}</span></div></div></td>
      <td><span class="belt" style="--belt:${beltOf(m.g)}"><i></i>${esc(m.g)}</span></td><td>${esc(dojoName(m.dojo))}</td>
      <td>${esc(mbPkgText(m))}</td>
      <td>${mbStatusPill(m.st)}${m.source === 'External' ? ' ' + pill('plain', 'External') : ''}${m.owed > 0 ? ' ' + pill('warn', `Owes ${money(m.owed)}`) : ''}</td>
      <td>${esc(mbSeenText(m.seen))}</td></tr>`).join('') || '<tr><td colspan="6" style="color:var(--muted)">No members match.</td></tr>';
}
async function membersPage() {
  let t = null;
  $('#memFilter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { memUI.f = b.dataset.f; loadMembers(); } });
  $('#memSearch').addEventListener('input', e => { memUI.q = e.target.value; clearTimeout(t); t = setTimeout(loadMembers, 250); });
  $('#memRows').addEventListener('click', e => { const tr = e.target.closest('tr[data-no]'); if (tr && !e.target.closest('a')) location.href = `member.html?no=${encodeURIComponent(tr.dataset.no)}`; });
  document.addEventListener('click', async e => {
    if (!e.target.closest('[data-export="members"]') || !isBA()) return;
    try { await ASK.csv('/admin/members/export.csv', 'members.csv'); } catch (er) { ASK.errToast(er); }
  });
  await loadMembers();
}

/* ---------- Log contact (used on the student record and on Follow-ups) ---------- */
function logContactDrawer(m, kind, after, followup) {
  openDrawer(`Log contact · ${m.n}`, `<div class="grid2">
      <div class="fld"><label for="lc-method">How you got in touch</label><select id="lc-method"><option>Call</option><option>WhatsApp</option><option>Email</option><option>SMS</option></select></div>
      <div class="fld"><label for="lc-outcome">Outcome</label><select id="lc-outcome"><option>Reached</option><option>No answer</option><option>Booked a class</option><option>Will return</option><option>Not returning</option></select></div>
      <div class="fld full" id="lc-whybox" hidden><label for="lc-why">Reason they are not returning<span class="req">*</span></label><textarea id="lc-why"></textarea><span class="err">Write the reason.</span></div>
      <div class="fld full"><label for="lc-note">Notes<span class="opt">Optional</span></label><textarea id="lc-note"></textarea></div>
      <div class="fld full"><label for="lc-next">Contact again on<span class="opt">Optional</span></label><input id="lc-next" type="date"></div></div>`,
    `<button class="sbtn" data-drawer-close>Cancel</button><button class="sbtn dark" id="lcSave">${icon('check')}Save contact</button>`);
  $('#lc-outcome').addEventListener('change', () => { $('#lc-whybox').hidden = $('#lc-outcome').value !== 'Not returning'; });
  $('#lcSave').addEventListener('click', async () => {
    const outcome = $('#lc-outcome').value, why = $('#lc-why').value.trim();
    if (outcome === 'Not returning' && !why) { $('#lc-whybox').classList.add('invalid'); return toast('Write why they are not returning.', 'bad'); }
    const body = { method: $('#lc-method').value, outcome, note: [why, $('#lc-note').value.trim()].filter(Boolean).join('. ') || undefined, nextDate: $('#lc-next').value || undefined };
    if (!body.note) delete body.note; if (!body.nextDate) delete body.nextDate;
    const ok = await run(() => followup ? ASK.act.deskFollowupAttempt(followup, body) : ASK.act.deskLogContact(m.no, { ...body, ...(kind ? { kind } : {}) }));
    if (!ok) return;
    closeDrawer(); toast(`Contact with ${m.n} saved.`);
    if (after) await after();
  });
}

/* ---------- Student record ---------- */
const MB = { d: null, m: null, tab: 'overview' };
const MB_TABS = [['overview', 'Overview'], ['bookings', 'Bookings'], ['attendance', 'Attendance'], ['payments', 'Payments'], ['progress', 'Progress'], ['equipment', 'Equipment'], ['followups', 'Follow-ups'], ['contact', 'Contact']];
const STATUS_PILL = { present: ['ok', 'Present'], noshow: ['bad', 'No-show'], booked: ['plain', 'Booked'], pending: ['warn', 'Pending'] };
const FU_KINDS = { declining: 'Declining attendance', renewal: 'Renewal coming up', newcomer: 'Newcomer not returned' };

const histTable = (list, empty) => `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Class</th><th>How booked</th><th>Status</th></tr></thead><tbody>${list.map(h => `<tr><td>${dayName(ASK.d(h.date))} ${fmtDate(ASK.d(h.date))}</td><td>${esc(h.type)} · ${timeLabel(h.time)}</td><td>${esc(h.how)}</td><td>${pill(...STATUS_PILL[h.status] || ['plain', h.status])}</td></tr>`).join('') || `<tr><td colspan="4" style="color:var(--muted)">${empty}</td></tr>`}</tbody></table></div>`;
const payRow = (p, m) => ({ id: p.id, no: m.no, name: m.n, item: p.item, kind: p.kind, amt: p.amount, date: ASK.ts(p.date), day: p.day, st: p.status, by: p.channel, inv: p.invoice, note: p.note || undefined });

function mbOverview() {
  const d = MB.d, m = MB.m, mem = d.member, active = d.packages.filter(p => p.status === 'Active');
  const pkgLines = active.length ? active.map(p => p.unlimited ? `${esc(p.name)}: Unlimited, expires ${fmtDate(ASK.d(p.expires))}` : `${esc(p.name)}: ${p.left} left, expires ${fmtDate(ASK.d(p.expires))}`).join('<br>') : 'No active package';
  const unl = active.find(p => p.unlimited);
  const re = mem.status === 'Lapsed' ? `Lapsed. Pays ${money(ASK.ref.policies.annualDues)} annual dues to reactivate` : m.owed > 0 ? 'Active. Annual dues unpaid' : 'Active. Annual dues paid';
  const mcs = d.mcs.filter(c => c.kind === 'MC');
  return `<div class="g-wide">
    <div class="card white"><div class="card-h"><h3>Membership</h3><button class="sbtn" id="mEdit" data-ba>Change status or dojo</button></div>
      <div class="kv" style="margin:0">
        <div><span>Member no.</span><span class="num">${esc(m.no)}</span></div>
        <div><span>Joined</span><span>${esc(m.joined)}</span></div>
        <div><span>Belt</span><span><span class="belt" style="--belt:${beltOf(m.g)}"><i></i>${esc(m.g)}</span><span class="sub-note">Changes through grading only</span></span></div>
        <div><span>Membership</span><span>${mbStatusPill(m.st)}</span></div>
        <div><span>Principal dojo</span><span>${esc(dojoName(m.dojo))}</span></div>
        <div><span>Member type</span><span>${m.source === 'External' ? 'External member' : 'ASK member'} · ${m.kind === 'child' ? 'Child' : 'Adult'}</span></div>
        <div><span>Package</span><span>${pkgLines}</span></div>
        <div><span>Unlimited plan</span><span>${unl ? `until ${fmtShort(ASK.d(unl.expires))}` : 'None'}</span></div>
        <div><span>Membership runs to</span><span>${mem.membershipExpiry ? fmtDate(ASK.d(mem.membershipExpiry)) : '—'}</span></div>
        <div><span>Annual dues</span><span>${esc(re)}</span></div>
        <div><span>Outstanding</span><span>${m.owed > 0 ? money(m.owed) : 'Nothing owed'}</span></div>
      </div></div>
    <div class="card white"><div class="card-h"><h3>Medical and certificates</h3></div>
      <div class="rec-sec">
        <div><h4>Medical note</h4><p style="margin-top:6px" id="mMedical">${esc(mem.medical || 'Nothing declared.')}</p></div>
        <div><h4>Medical certificates</h4><div class="rows" id="mMcs">${mcs.map(c => `<div class="row"><div class="grow"><div class="t">${plural(c.days, 'day')} · sent ${fmtShort(ASK.ts(c.at))}</div><div class="d">${esc(c.file || 'MC')}</div></div>${pill(c.status === 'approved' ? 'ok' : c.status === 'rejected' ? 'bad' : 'warn', c.status === 'approved' ? 'Approved' : c.status === 'rejected' ? 'Not approved' : 'Waiting')}</div>`).join('') || '<p style="color:var(--muted)">No medical certificates.</p>'}</div></div>
      </div></div></div>`;
}
function mbPayments() {
  const d = MB.d, m = MB.m, L = DB.ledger, R = DB.refunds;
  return `<div class="card white"><div class="card-h"><div><h3>Payment history</h3><span class="sub">${m.owed > 0 ? `${money(m.owed)} outstanding` : 'Nothing outstanding'}</span></div><div class="acts-inline"><button class="sbtn" id="mPayNow">Take payment</button>${isBA() ? '' : '<button class="sbtn" id="mRefund">Request a refund</button>'}</div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Item</th><th>Amount</th><th>Status</th><th></th></tr></thead><tbody>${L.map(l => `<tr><td>${fmtShort(ASK.d(l.day))}</td><td>${esc(l.item)}${l.note ? `<span class="sub-note">${esc(l.note)}</span>` : ''}</td><td class="num">${money(l.amt)}</td><td>${stPill(l.st)}</td><td><div class="acts-inline">${l.st === 'Paid' ? `<button class="sbtn" data-rcpt="${esc(l.id)}">${icon('receipt')}Reprint receipt</button>` : ''}${l.st === 'Outstanding' ? `<button class="sbtn dark" data-collect="${esc(l.id)}">Collect</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No payments yet.</td></tr>'}</tbody></table></div></div>
    <div class="card white"><div class="card-h"><div><h3>Refund requests</h3><span class="sub">Policy is no refunds. A Business Admin decides exceptions.</span></div></div><div class="rows" id="mRefunds">${R.map(x => `<div class="row"><span class="av">${icon('receipt')}</span><div class="grow"><div class="t">${money(x.amt)} · ${esc(x.item)}</div><div class="d">${esc(x.reason)} · asked by ${esc(x.by)}, ${fmtShort(x.at)}</div></div>${x.status === 'pending' ? `<div class="acts">${isBA() ? `<button class="sbtn dark" data-ref-ok="${esc(x.id)}" data-ba>Approve</button><button class="sbtn" data-ref-no="${esc(x.id)}" data-ba>Decline</button>` : pill('warn', 'With a Business Admin')}</div>` : pill(x.status === 'approved' ? 'ok' : 'bad', cap1(x.status))}</div>`).join('') || '<p style="color:var(--muted)">No refund requests for this student.</p>'}</div></div>`;
}
function mbProgress() {
  const m = MB.m, p = MB.d.progress;
  return `<div class="card white"><div class="card-h"><h3>Progress</h3></div><div class="kv" style="margin:0">
    <div><span>Current belt</span><span><span class="belt" style="--belt:${beltOf(m.g)}"><i></i>${esc(m.g)}</span></span></div>
    <div><span>Next grade</span><span>${p.nextRank ? esc(p.nextRank) : 'Highest grade listed'}</span></div>
    <div><span>Sessions towards next grade</span><span>${p.needSessions ? `${p.sessions} of ${p.needSessions}` : 'Not tracked'}</span></div>
    <div><span>Training hours</span><span>${m.hrs}</span></div></div>
    <div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>Belts change through grading only. The front desk cannot edit a belt on this page.</span></div></div>`;
}
function mbEquipment() {
  const E = MB.d.equipment;
  return `<div class="card white"><div class="card-h"><h3>Equipment</h3><a class="sbtn" href="equipment.html">Open Equipment</a></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Size</th><th>Payment</th><th>Status</th><th>Requested</th></tr></thead><tbody>${E.map(e => `<tr><td>${esc(e.item)}</td><td>${e.size ? esc(e.size) : '—'}</td><td>${pill(e.paid ? 'ok' : 'bad', e.paid ? 'Paid' : 'Unpaid')}</td><td>${pill(e.status === 'Handed over' ? 'navy plain' : e.status === 'Ready at HQ' ? 'ok' : 'warn', e.status)}</td><td>${fmtShort(ASK.ts(e.at))}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No equipment orders.</td></tr>'}</tbody></table></div></div>`;
}
function mbFollowups() {
  const F = MB.d.followups;
  return `<div class="card white"><div class="card-h"><h3>Follow-ups</h3><button class="sbtn dark" id="mLog2">Log contact</button></div><div class="rows">${F.map(f => `<div class="row"><span class="av navy">${icon('flag')}</span><div class="grow"><div class="t">${esc(FU_KINDS[f.kind] || f.kind)} · ${plural(f.attempts.length, 'attempt')}</div><div class="d">Due ${fmtShort(ASK.d(f.due))}${f.ownerName ? ' · ' + esc(f.ownerName) : ''}</div>${f.attempts.map(a => `<div class="d">${fmtShort(ASK.ts(a.at))} · ${esc(a.method)} · ${esc(a.outcome)}${a.note ? ' · ' + esc(a.note) : ''}</div>`).join('')}</div></div>`).join('') || '<p style="color:var(--muted)">No follow-ups for this student.</p>'}</div></div>`;
}
function mbContact() {
  const m = MB.m, mem = MB.d.member;
  return `<form class="card white" id="mContact" novalidate><div class="card-h"><div><h3>Contact details</h3><span class="sub">The front desk and Business Admins can update these. Belt, membership status and dojo are not edited here.</span></div></div>
    <div class="grid2">
      <div class="fld"><label for="c-phone">Mobile</label><input id="c-phone" value="${esc(m.phone)}" inputmode="tel" autocomplete="off"><span class="err">Enter an 8-digit number.</span></div>
      <div class="fld"><label for="c-email">Email</label><input id="c-email" type="email" value="${esc(m.email)}" autocomplete="off"><span class="err">Enter a valid email.</span></div>
      <div class="fld full"><label for="c-ec">Emergency contact<span class="opt">Name, relationship and number</span></label><input id="c-ec" value="${esc(mem.emergencyContact || '')}" autocomplete="off"></div>
      ${m.kind === 'child' ? `<div class="fld"><label for="c-guard">Parent or guardian</label><input id="c-guard" value="${esc(m.guardian)}" autocomplete="off"></div>` : ''}
      <div class="fld full"><label for="c-med">Medical note<span class="opt">Shared with the instructor</span></label><textarea id="c-med">${esc(mem.medical || '')}</textarea></div>
    </div><div class="acts" style="margin-top:16px"><button class="sbtn dark" type="submit">${icon('check')}Save contact details</button></div></form>`;
}
const MB_RENDER = {
  overview: mbOverview,
  bookings: () => `<div class="card white"><div class="card-h"><div><h3>Upcoming bookings</h3><span class="sub">Booked classes that have not happened yet</span></div><a class="sbtn" href="sessions.html">Book a class</a></div>${histTable(MB.d.classes.filter(h => h.status === 'booked' && h.date >= iso(TODAY)), 'Nothing booked.')}</div>`,
  attendance: () => `<div class="card white"><div class="card-h"><h3>Attendance</h3></div>${histTable(MB.d.classes.filter(h => h.status !== 'booked' || h.date < iso(TODAY)), 'No attendance recorded yet.')}</div>`,
  payments: mbPayments, progress: mbProgress, equipment: mbEquipment, followups: mbFollowups, contact: mbContact
};
function renderMemberTab() {
  $$('#mTabs .fpill').forEach(b => b.classList.toggle('on', b.dataset.tab === MB.tab));
  $('#mBody').innerHTML = MB_RENDER[MB.tab]();
  stripBA($('#mBody'));
}
function renderMemberHead() {
  const m = MB.m;
  $('#mHead').innerHTML = `<h1>${esc(m.n)}</h1><p>${esc(m.no)} · ${esc(m.g)} · ${esc(dojoName(m.dojo))}</p>`;
  $('#mChips').innerHTML = mbStatusPill(m.st) + pill('navy plain', m.kind === 'child' ? 'Child' : 'Adult') + (m.kind === 'child' ? pill('plain', `Guardian: ${m.guardian || 'not recorded'}`) : '')
    + pill('plain', m.source === 'External' ? 'External member' : 'ASK member') + (m.owed > 0 ? pill('warn', `Owes ${money(m.owed)}`) : '') + (m.expiring ? pill('warn', 'Package expiring soon') : '');
}
/* load the record again and draw it (called after every change) */
async function memberReload() {
  const no = new URLSearchParams(location.search).get('no') || '';
  let d;
  try { if (!no) throw new Error('No member has that number.'); d = await ASK.load.deskMember(no); } catch (e) { $('#memberRoot').innerHTML = `<div class="card"><h3>Student not found</h3><p style="margin:8px 0 14px;color:var(--muted)">${esc(e.message)}</p><a class="sbtn dark" href="members.html">Back to Members</a></div>`; return false; }
  MB.d = d; MB.m = memberLegacy(d.member); MB.m.owed = d.member.owed;
  ASK.fill(DB.ledger, d.payments.map(p => payRow(p, MB.m)));
  ASK.fill(DB.refunds, d.refunds.map(r => ({ id: r.id, no: MB.m.no, name: MB.m.n, item: r.item, amt: r.amount, reason: r.reason, by: r.by, at: ASK.ts(r.at), status: r.status })));
  document.title = `${MB.m.n} · Admin · Aikido Shinju-Kai`;
  if ($('#mHead')) { renderMemberHead(); renderMemberTab(); }
  return true;
}
function mbEditStatus() {
  const m = MB.m;
  openDrawer(`Change record · ${m.n}`, `<div class="note"><svg class="ic"><use href="#i-info"/></svg><span>Belt: <b>${esc(m.g)}</b>. A belt changes through grading only, so it cannot be edited here.</span></div>
    <div class="grid2" style="margin-top:14px">
      <div class="fld"><label for="ms-st">Membership status</label><select id="ms-st">${['Active', 'Lapsed', 'Inactive', 'Deactivated'].map(s => `<option${s === m.st ? ' selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="fld"><label for="ms-dojo">Principal dojo</label><select id="ms-dojo">${DOJOS.map(d => `<option value="${d.id}"${d.id === m.dojo ? ' selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="fld full"><label for="ms-why">Reason<span class="req">*</span></label><textarea id="ms-why" placeholder="Why is this being changed?"></textarea><span class="err">A reason is required.</span></div></div>`,
    `<button class="sbtn" data-drawer-close>Cancel</button><button class="sbtn dark" id="msSave">${icon('check')}Save</button>`);
  $('#msSave').addEventListener('click', async () => {
    if (!isBA()) return;
    const st = $('#ms-st').value, dojo = $('#ms-dojo').value, why = $('#ms-why').value.trim();
    if (!why) { $('#ms-why').closest('.fld').classList.add('invalid'); return toast('Add a reason first.', 'bad'); }
    if (st === m.st && dojo === m.dojo) return toast('Nothing was changed.', 'info');
    const body = { reason: why }; if (st !== m.st) body.accountStatus = st; if (dojo !== m.dojo) body.dojoId = dojo;
    if (await run(() => ASK.act.deskPatchMember(m.no, body))) { closeDrawer(); await memberReload(); toast('Record updated.'); }
  });
}
function messageModal() {
  const m = MB.m;
  openModal(`<h3 id="modalTitle">Send message to ${esc(m.n)}</h3><p class="sub">Shown in their portal notifications.</p>
    <div class="fld" style="margin-top:14px"><label for="sm-body">Message</label><textarea id="sm-body" maxlength="240" autofocus></textarea></div>
    <div class="acts"><button class="sbtn dark" id="smGo">Send</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#smGo').addEventListener('click', async () => {
    const body = $('#sm-body').value.trim(); if (!body) return toast('Write a message first.', 'bad');
    if (await run(() => ASK.act.deskMessage(m.no, body))) { closeModal(); toast(`Message sent to ${m.n}.`); }
  });
}
async function memberPage() {
  const root = $('#memberRoot');
  root.innerHTML = `<div class="page-h"><div id="mHead"></div><div class="acts wrap"><a class="sbtn" href="sessions.html" id="mBook">Book a class</a><button class="sbtn" id="mPay">Take payment</button><button class="sbtn" id="mLog">Log contact</button><button class="sbtn" id="mMsg">Send message</button></div></div>
    <div class="rec-chips" id="mChips"></div>
    <div class="list-bar"><div class="filters" id="mTabs">${MB_TABS.map(([k, l]) => `<button class="fpill" data-tab="${k}">${l}</button>`).join('')}</div></div>
    <div id="mBody" style="display:grid;gap:14px"></div>`;
  const t = new URLSearchParams(location.search).get('tab'); if (MB_RENDER[t]) MB.tab = t;
  root.addEventListener('click', async e => {
    if (!MB.m) return;
    const m = MB.m, tab = e.target.closest('#mTabs [data-tab]'); if (tab) { MB.tab = tab.dataset.tab; return renderMemberTab(); }
    if (e.target.closest('#mPay') || e.target.closest('#mPayNow')) return takePayment({ member: m });
    if (e.target.closest('#mLog') || e.target.closest('#mLog2')) return logContactDrawer(m, null, memberReload);
    if (e.target.closest('#mMsg')) return messageModal();
    if (e.target.closest('#mEdit') && isBA()) return mbEditStatus();
    if (e.target.closest('#mRefund')) return refundRequestModal(m.no);
    const rc = e.target.closest('[data-rcpt]'); if (rc) return receiptPDF(DB.ledger.find(l => l.id === rc.dataset.rcpt));
    const co = e.target.closest('[data-collect]'); if (co) return takePayment({ id: co.dataset.collect });
    const ro = e.target.closest('[data-ref-ok]'), rn = e.target.closest('[data-ref-no]');
    if ((ro || rn) && isBA()) {
      const id = (ro || rn).dataset[ro ? 'refOk' : 'refNo'];
      if (await run(() => ASK.act.deskRefundDecision(id, ro ? 'approved' : 'declined'))) { await memberReload(); toast(ro ? 'Refund approved as an exception.' : 'Refund declined.', ro ? 'ok' : 'info'); }
    }
  });
  root.addEventListener('submit', async e => {
    if (e.target.id !== 'mContact') return;
    e.preventDefault();
    const ph = $('#c-phone').value.trim(), em = $('#c-email').value.trim();
    const bad = (sel, ok) => { $(sel).closest('.fld').classList.toggle('invalid', !ok); return ok; };
    if (![bad('#c-phone', mbDigits(ph).length >= 8), bad('#c-email', /^\S+@\S+\.\S+$/.test(em))].every(Boolean)) return toast('Check the highlighted fields.', 'bad');
    const body = { phone: ph, email: em, emergencyContact: $('#c-ec').value.trim(), medicalNotes: $('#c-med').value.trim() };
    if ($('#c-guard')) body.guardianName = $('#c-guard').value.trim();
    if (await run(() => ASK.act.deskPatchMember(MB.m.no, body))) { await memberReload(); toast('Contact details saved.'); }
  });
  await memberReload();
}

/* ---------- Registrations ---------- */
const AP = { apps: [], mc: [], exc: [] };
const MC_FD_LIMIT = 14;   // the front desk may approve a medical certificate of up to 14 days; longer goes to a Business Admin (the server checks)
const appCount = () => AP.apps.length + AP.mc.filter(r => r.status === 'pending').length + (isBA() ? AP.exc.filter(x => x.status === 'pending').length : 0);
const regRules = a => a.checklist.filter(c => c.enabled);
const regStatus = a => regRules(a).some(c => !c.done) ? ['bad', 'Missing info'] : a.reviews.length ? ['warn', 'Needs review'] : ['ok', 'Ready to activate'];
/* Activate is allowed only when every switched-on auto-activation rule passes. Anything needing review waits for a Business Admin. */
function regBlock(a) {
  const failed = regRules(a).filter(c => !c.done);
  if (failed.length) return `Not ready: ${failed.map(c => c.label.toLowerCase()).join(', ')}`;
  if (a.reviews.length && !isBA()) return 'A Business Admin has to review this registration first';
  return '';
}
function regChips(a) {
  const rules = regRules(a).map(c => pill(c.done ? 'ok' : 'bad', c.done ? c.label : `${c.label}: missing`));
  const rev = a.reviews.map(t => pill('warn', t));
  return `<div class="chips">${rules.join('')}${rev.join('')}${a.medical ? pill('warn', 'Medical note') : ''}${a.status === 'Needs info' ? pill('navy plain', 'Info requested') : ''}</div>`;
}
function renderRegs() {
  $('#appRows').innerHTML = AP.apps.length ? AP.apps.map(a => { const s = regStatus(a), why = regBlock(a);
    return `<div class="row"><span class="av">${initials(a.name)}</span><div class="grow"><div class="t">${esc(a.name)}${a.group === 'Child' ? ` <span class="pill plain" style="height:20px;font-size:11px">Age ${a.age}</span>` : ''} ${pill(s[0], s[1])}</div><div class="d">${esc(a.dojoName)} · ${fmtDate(ASK.ts(a.submittedAt))} · ${money(a.paid)} paid</div>${regChips(a)}</div>
      <div class="acts"><button class="sbtn" data-reg="${esc(a.id)}">View form</button><button class="sbtn dark" data-reg-go="${esc(a.id)}"${why ? ` disabled title="${esc(why)}"` : ''}>${icon('check')}Activate</button></div></div>`; }).join('')
    : '<p style="color:var(--muted)">All caught up. No registrations waiting.</p>';
}
async function loadApplications() {
  const r = await run(() => ASK.load.deskApplications()); if (!r) return;
  AP.apps = r.apps; AP.mc = r.mcRequests; AP.exc = r.exceptions || [];
  renderAll();
}
/* the student already chose a password at registration. Only an old application with none gets a temporary one, shown once to the staff member */
function activatedModal(name, out) {
  openModal(`<h3 id="modalTitle">${esc(name)} is now a member</h3><p class="sub">Dogi and equipment are queued at HQ.</p>
    <div class="kv" style="margin:14px 0 0"><div><span>Member no.</span><span class="num">${esc(out.memberNo)}</span></div>${out.tempPassword ? `<div><span>Temporary password</span><span class="num" id="tempPw">${esc(out.tempPassword)}</span></div>` : ''}</div>
    ${out.tempPassword
      ? '<div class="note warn" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>Give this password to the student now. It is shown once and cannot be read again. They must change it when they first sign in.</span></div>'
      : '<div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>The student signs in with their member number or email and the password they chose when registering.</span></div>'}
    <div class="acts"><a class="sbtn dark" href="member.html?no=${encodeURIComponent(out.memberNo)}">Open student record</a><button class="sbtn" data-close>Done</button></div>`);
}
function regOpen(id) {
  const a = AP.apps.find(x => x.id === id); if (!a) return;
  const rows = [['Name', a.name], ['Gender', a.gender], ['Age', a.age], ['Nationality', a.nationality], ['Mobile', a.phone], ['Email', a.email], ['Emergency contact', a.emergencyContact], ['Martial arts experience', a.experience || '—'], ['Previous ASK member', a.previousMember ? 'Yes' : 'No'], ['Medical history', a.medical || 'Nothing declared'], ['Principal dojo', a.dojoName], ['Dogi', a.dogi || '—'], ['Lesson package', a.packageName || '—'], ['Paid', money(a.paid)], ['Submitted', fmtDate(ASK.ts(a.submittedAt))], ['Terms & PDPA', a.signer ? 'Agreed' : 'Not signed']];
  const why = regBlock(a);
  const carry = a.carryGrade, carryId = carry && (BELTS.find(b => b.g.toLowerCase() === carry.toLowerCase()) || {}).id;
  openDrawer(`Registration · ${a.name}`, `${regChips(a)}
    ${a.medical ? `<div class="note warn" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span><b>Medical note:</b> ${esc(a.medical)}. Share with the principal dojo instructor.</span></div>` : ''}
    ${a.status === 'Needs info' && a.infoRequested ? `<div class="note" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span><b>Info requested ${a.infoRequested.at ? fmtShort(ASK.ts(a.infoRequested.at)) : ''}:</b> ${esc(a.infoRequested.text || '')}</span></div>` : ''}
    <div class="kv" style="margin:14px 0 0;border-top:1px solid var(--line)">${rows.map(([k, v]) => `<div><span>${k}</span><span>${esc(v)}</span></div>`).join('')}</div>
    <div class="sig-view" style="margin-top:14px"><span>Signed by <b>${esc(a.signer || a.name)}</b></span><em>Signature on the form</em></div>
    <h4 style="margin:16px 0 8px">Checks</h4>
    <div class="mc-ticks">${a.checklist.map(c => `<label class="check${c.enabled ? '' : ' off'}"><input type="checkbox" data-rule="${esc(c.id)}"${c.done ? ' checked' : ''}${c.enabled ? '' : ' disabled'}><span>${esc(c.label)}${c.enabled ? '' : '<small>Switched off in Policies</small>'}</span></label>`).join('')}</div>
    <div class="fld" style="margin-top:14px"><label for="app-grade">Starting grade</label><select id="app-grade"${isBA() ? '' : ' disabled'}><option value="6k">6th Kyu (white belt)</option>${carryId ? `<option value="${esc(carryId)}"${isBA() ? ' selected' : ''}>Carry over ${esc(carry)}</option>` : ''}</select>${isBA() ? '' : '<span class="hint" id="appGradeNote">Confirmed by Business Admin</span>'}</div>
    ${why ? `<div class="note warn" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>${esc(why)}.</span></div>` : ''}`,
    `<button class="sbtn" id="regReject">Reject</button><button class="sbtn" id="regFlag">Flag for review</button><button class="sbtn" id="regInfo">Request missing info</button><button class="sbtn dark" id="regActivate"${why ? ' disabled' : ''}>${icon('check')}Activate</button>`);
  $$('#drawer [data-rule]').forEach(b => b.addEventListener('change', async () => {
    if (await run(() => ASK.act.deskChecklist(a.id, b.dataset.rule, b.checked))) { await loadApplications(); regOpen(id); } else b.checked = !b.checked;
  }));
  $('#regActivate').addEventListener('click', () => regActivate(a.id));
  $('#regInfo').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Request missing information</h3><p class="sub">${esc(a.name)} gets an email listing what to send.</p><div class="fld" style="margin-top:14px"><label for="ri-text">What is missing?</label><textarea id="ri-text" autofocus></textarea></div><div class="acts"><button class="sbtn dark" id="riGo">Send request</button><button class="sbtn" data-close>Cancel</button></div>`);
    $('#riGo').addEventListener('click', async () => {
      const text = $('#ri-text').value.trim(); if (!text) return toast('Say what is missing.', 'bad');
      if (await run(() => ASK.act.deskRequestInfo(a.id, text))) { closeModal(); closeDrawer(); await loadApplications(); toast(`Request sent to ${a.name}.`); }
    });
  });
  $('#regFlag').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Flag for review</h3><p class="sub">A Business Admin will decide. Say what needs a decision.</p><div class="fld" style="margin-top:14px"><label for="rf-why">Reason</label><textarea id="rf-why" autofocus></textarea></div><div class="acts"><button class="sbtn dark" id="rfGo">Send to Business Admin</button><button class="sbtn" data-close>Cancel</button></div>`);
    $('#rfGo').addEventListener('click', async () => {
      const why2 = $('#rf-why').value.trim(); if (!why2) return toast('Add a reason first.', 'bad');
      if (await run(() => ASK.act.deskException({ kind: 'registration', subjectName: a.name, detail: why2 }))) { closeModal(); closeDrawer(); await loadApplications(); toast('Sent to a Business Admin to decide.'); }
    });
  });
  $('#regReject').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Reject ${esc(a.name)}?</h3><p class="sub">They get an email with the reason below. This does not change any payment.</p><div class="fld" style="margin-top:16px"><label for="rej-why">Reason (sent to the applicant)</label><textarea id="rej-why" autofocus></textarea></div><div class="acts"><button class="sbtn red" id="doReject">Reject</button><button class="sbtn" data-close>Back</button></div>`);
    $('#doReject').addEventListener('click', async () => {
      const note = $('#rej-why').value.trim(); if (!note) return toast('Add the reason first.', 'bad');
      if (await run(() => ASK.act.deskReject(a.id, note))) { closeModal(); closeDrawer(); await loadApplications(); toast('Registration rejected. The applicant has been emailed.', 'info'); }
    });
  });
}
async function regActivate(id) {
  const a = AP.apps.find(x => x.id === id); if (!a) return;
  const why = regBlock(a); if (why) return toast(why, 'bad');
  const sel = $('#app-grade'), rank = sel && isBA() && sel.value !== '6k' ? sel.value : undefined;
  const out = await run(() => ASK.act.deskActivate(id, rank));
  if (!out) return;
  closeDrawer(); await loadApplications(); activatedModal(a.name, out);
}

/* ---------- Extensions ---------- */
const mcWhen = r => r.kind === 'mc' ? `MC · ${esc(r.file || 'no certificate')}` : 'Compassion Guaranteed (no MC needed)';
function renderMC() {
  const el = $('#mcRows'); if (!el) return;
  const pend = AP.mc.filter(r => r.status === 'pending'), past = AP.mc.filter(r => r.status !== 'pending').slice(0, 5);
  const chips = r => [r.unlimited ? pill('navy plain', 'Unlimited plan') : '', !r.within ? pill('warn', r.days > MC_FD_LIMIT ? `Over ${MC_FD_LIMIT} days` : 'No MC attached') : '', r.referred ? pill('warn', 'With Business Admin') : ''].join('');
  el.innerHTML = (pend.length ? pend.map(r => `<div class="row"><span class="av navy">${icon(r.kind === 'mc' ? 'doc' : 'gift')}</span><div class="grow"><div class="t">${esc(r.name)} · +${plural(r.days, 'day')}</div><div class="d">${esc(r.passName)} · ${mcWhen(r)} · sent ${fmtShort(ASK.ts(r.date))}</div><div class="chips">${chips(r)}</div></div><div class="acts"><button class="sbtn" data-mc-view="${esc(r.id)}">View</button></div></div>`).join('')
    : '<p style="color:var(--muted)">No extension requests waiting.</p>')
    + (past.length ? `<h4 class="mc-past-h">Recently handled</h4>${past.map(r => `<div class="row"><span class="av">${icon(r.kind === 'mc' ? 'doc' : 'gift')}</span><div class="grow"><div class="t">${esc(r.name)} · +${plural(r.days, 'day')}</div><div class="d">${esc(r.passName)} · ${mcWhen(r)}${r.excused ? ' · recorded as excused' : r.status === 'approved' ? ` · ${r.extended ? 'expiry extended' : 'expiry unchanged'}` : r.reason ? ' · ' + esc(r.reason) : ''}</div></div>${pill(r.status === 'approved' ? 'ok' : 'bad', r.status === 'approved' ? 'Approved' : 'Not approved')}</div>`).join('')}` : '');
}
function mcOpen(id) {
  const r = AP.mc.find(x => x.id === id); if (!r) return;
  const unl = r.unlimited, can = isBA() || r.within, comp = r.kind === 'compassion', cur = ASK.d(r.expires);
  const tick = (tid, label, hint, on, off) => `<label class="check${off ? ' off' : ''}"><input type="checkbox" id="${tid}"${on ? ' checked' : ''}${off ? ' disabled' : ''}><span>${label}<small>${hint}</small></span></label>`;
  openDrawer(`Extension · ${r.name}`, `<div class="kv" style="margin:0;border-top:1px solid var(--line)">
      <div><span>Member</span><span>${esc(r.name)} · ${esc(r.memberNo)}</span></div>
      <div><span>Package</span><span>${esc(r.passName)}</span></div>
      <div><span>Type</span><span>${comp ? 'Compassion Guaranteed' : 'Medical certificate'}</span></div>
      ${comp ? '' : `<div><span>MC file</span><span>${esc(r.file || 'None attached')}</span></div>`}
      <div><span>Days covered</span><span>${plural(r.days, 'day')}</span></div>
      <div><span>Expires now</span><span>${fmtDate(cur)}</span></div>
      <div><span>Expires after approval</span><span id="mc-after">${unl ? 'No change' : fmtDate(addDays(cur, r.days))}</span></div>
      <div><span>Sent</span><span>${fmtDate(ASK.ts(r.date))}</span></div></div>
    ${unl ? '<div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span><b>Unlimited plan.</b> Billing carries on. The MC is kept on record and the absence is marked excused. There is no lesson to return and no expiry to extend.</span></div>' : ''}
    ${!can ? `<div class="note warn" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>${r.days > MC_FD_LIMIT ? `This MC covers more than ${MC_FD_LIMIT} days.` : 'There is no MC attached.'} A Business Admin has to decide.</span></div>` : ''}
    <div class="mc-ticks">${tick('mc-ret', 'Return lesson', comp ? 'Not used for Compassion Guaranteed' : 'Adds one lesson back for the class that was missed', !unl && !comp, unl || comp)}${tick('mc-ext', 'Extend expiry', `Moves the expiry date by ${plural(r.days, 'day')}`, !unl, unl)}</div>
    ${can ? `<div class="fld" style="margin-top:16px"><label for="mc-why">Reason if not approved<span class="opt">Sent to the member</span></label><textarea id="mc-why" placeholder="e.g. MC dates don't match the missed classes"></textarea></div>` : ''}`,
    can ? `<button class="sbtn" id="mcReject">Not approved</button><button class="sbtn dark" id="mcApprove">${icon('check')}${unl ? 'Record as excused' : 'Approve'}</button>`
      : r.referred ? '<span class="pill warn">With Business Admin</span>' : '<button class="sbtn dark" id="mcRefer">Refer to Business Admin</button>');
  const upd = () => { const e = $('#mc-ext'); if ($('#mc-after') && e && !unl) $('#mc-after').textContent = e.checked ? fmtDate(addDays(cur, r.days)) : `${fmtDate(cur)} (unchanged)`; };
  if ($('#mc-ext')) $('#mc-ext').addEventListener('change', upd);
  const done = async msg => { closeDrawer(); await loadApplications(); toast(msg); };
  if ($('#mcApprove')) $('#mcApprove').addEventListener('click', async () => {
    const ret = !unl && $('#mc-ret').checked, ext = !unl && $('#mc-ext').checked;
    if (!unl && !ret && !ext) return toast('Tick Return lesson or Extend expiry, or choose Not approved.', 'bad');
    const out = await run(() => ASK.act.deskMc(r.id, unl ? { decision: 'approved' } : { decision: 'approved', returnLesson: ret, extend: ext }));
    if (out) done(out.request.excused ? `MC recorded for ${r.name}. Absence marked excused.` : `Approved for ${r.name}.${ret ? ' Lesson returned.' : ''}${ext ? ` Expiry extended by ${plural(r.days, 'day')}.` : ''}`);
  });
  if ($('#mcReject')) $('#mcReject').addEventListener('click', async () => {
    const why = $('#mc-why').value.trim();
    if (await run(() => ASK.act.deskMc(r.id, { decision: 'declined', ...(why ? { reason: why } : {}) }))) done(`Extension for ${r.name} not approved. Member notified.`);
  });
  if ($('#mcRefer')) $('#mcRefer').addEventListener('click', async () => {
    const text = `${r.kind === 'mc' ? 'MC' : 'Compassion request'} for ${r.passName}: ${r.days > MC_FD_LIMIT ? `${plural(r.days, 'day')}, over the ${MC_FD_LIMIT} day limit` : 'no MC attached'}.`;
    if (await run(() => ASK.act.deskException({ kind: 'extension', mcId: r.id, memberNo: r.memberNo, subjectName: r.name, detail: text }))) done('Sent to a Business Admin to decide.');
  });
}

/* ---------- Exceptions (Business Admin only) ---------- */
const EXC_KINDS = { registration: 'Registration', extension: 'Extension', access: 'Access request', mistake: 'Payment mistake', refund: 'Refund' };
function renderExc() {
  const el = $('#excRows'); if (!el) return;
  const X = AP.exc, pend = X.filter(x => x.status === 'pending'), past = X.filter(x => x.status !== 'pending').slice(0, 6);
  const line = x => `<div class="t">${esc(x.who)} · ${esc(EXC_KINDS[x.kind] || x.kind)}</div><div class="d">${esc(x.text)}</div><div class="d">Sent by ${esc(x.by)} · ${fmtShort(ASK.ts(x.at))}</div>`;
  el.innerHTML = (pend.length ? pend.map(x => `<div class="row"><span class="av navy">${icon('shield')}</span><div class="grow">${line(x)}</div><div class="acts"><button class="sbtn dark" data-exc-ok="${esc(x.id)}">Approve</button><button class="sbtn" data-exc-no="${esc(x.id)}">Decline</button></div></div>`).join('')
    : '<p style="color:var(--muted)">Nothing waiting for a decision.</p>')
    + (past.length ? `<h4 class="mc-past-h">Recently decided</h4>${past.map(x => `<div class="row"><span class="av">${icon('shield')}</span><div class="grow">${line(x)}${x.reason ? `<div class="d">Reason: ${esc(x.reason)}</div>` : ''}</div>${pill(x.status === 'approved' ? 'ok' : 'bad', cap1(x.status))}</div>`).join('')}` : '');
}
function excDecide(id, ok) {
  const x = AP.exc.find(y => y.id === id); if (!x || !isBA()) return;
  openModal(`<h3 id="modalTitle">${ok ? 'Approve' : 'Decline'}: ${esc(x.who)}</h3><p class="sub">${esc(x.text)}</p><div class="fld" style="margin-top:14px"><label for="ex-why">Reason<span class="req">*</span></label><textarea id="ex-why" autofocus></textarea></div><div class="acts"><button class="sbtn ${ok ? 'dark' : 'red'}" id="exGo">${ok ? 'Approve' : 'Decline'}</button><button class="sbtn" data-close>Cancel</button></div>`);
  $('#exGo').addEventListener('click', async () => {
    const why = $('#ex-why').value.trim(); if (!why) return toast('A reason is needed.', 'bad');
    if (await run(() => ASK.act.deskExceptionDecision(id, ok ? 'approved' : 'declined', why))) { closeModal(); await loadApplications(); toast(ok ? 'Approved.' : 'Declined.', ok ? 'ok' : 'info'); }
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
  $('#nReg').textContent = AP.apps.length; $('#nExt').textContent = AP.mc.filter(r => r.status === 'pending').length;
  if ($('#nExc')) $('#nExc').textContent = AP.exc.filter(x => x.status === 'pending').length;
  setCount('applications', appCount());
}
async function applicationsPage() {
  regTab(new URLSearchParams(location.search).get('tab') || 'reg');
  $('#regTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) regTab(b.dataset.tab); });
  $('#appRows').addEventListener('click', e => {
    const v = e.target.closest('[data-reg]'); if (v) return regOpen(v.dataset.reg);
    const g = e.target.closest('[data-reg-go]'); if (g && !g.disabled) regActivate(g.dataset.regGo);
  });
  $('#mcRows').addEventListener('click', e => { const v = e.target.closest('[data-mc-view]'); if (v) mcOpen(v.dataset.mcView); });
  if ($('#excRows')) $('#excRows').addEventListener('click', e => {
    const ok = e.target.closest('[data-exc-ok]'), no = e.target.closest('[data-exc-no]');
    if (ok) excDecide(ok.dataset.excOk, true); else if (no) excDecide(no.dataset.excNo, false);
  });
  filterList('#appSearch', '#appRows'); filterList('#mcSearch', '#mcRows');
  if ($('#excSearch')) filterList('#excSearch', '#excRows');
  await loadApplications();
}

/* ---------- Assisted registration ---------- */
const RG = { sig: null };
const rgIso = () => $('#rg-dob').dataset.iso || '';
const rgAge = () => rgIso() ? ageOn(mbDate(rgIso())) : null;
const rgChild = age => age !== null && age <= 12;                 // the server's rule: 12 and under join the children's classes
const rgDogi = () => (DOGI_TYPES.find(([n]) => n === $('#rg-dogitype').value) || DOGI_TYPES[0])[1];
const pkgPrice = p => ((ASK.ref.policies.packages || []).find(x => x.id === p.id) || p).amt;
function rgPackages() {
  const age = rgAge(), list = rgChild(age) ? PKG.kids : PKG.adult, cur = $('#rg-pkg').value;
  $('#rg-pkg').innerHTML = '<option value="">Choose a package</option>' + list.map(p => `<option value="${p.id}">${esc(p.name)} · ${money(pkgPrice(p))}</option>`).join('');
  if (list.some(p => p.id === cur)) $('#rg-pkg').value = cur;
}
/* a preview of the bill. The server works the real figures out when the student is registered. */
function rgFees() {
  const age = rgAge(), dob = rgIso(), d = dob ? discountFor(mbDate(dob), false) : { pct: 0, label: '' };
  const pkg = [...PKG.adult, ...PKG.kids].find(p => p.id === $('#rg-pkg').value), pol = ASK.ref.policies;
  const lines = [['Registration', pol.registration, false], ['Annual dues', pol.annualDues, false]];
  lines.push(['Dogi', rgDogi(), false]);
  if (pkg) lines.push([pkg.name, pkgPrice(pkg), true]);
  const disc = lines.reduce((s, l) => s + (l[2] ? Math.round(l[1] * d.pct) / 100 : 0), 0), sub = lines.reduce((s, l) => s + l[1], 0);
  $('#rgDisc').textContent = d.pct ? `${d.label}. Applied to the package automatically, no proof needed.` : (age !== null ? 'No age discount applies.' : 'Sets the class group and fees.');
  $('#rgFees').innerHTML = lines.map(l => `<div><span>${esc(l[0])}</span><span>${money(l[1])}</span></div>`).join('')
    + (d.pct ? `<div><span id="rgDiscRow">Discount · ${esc(d.label)}</span><span>-${money(disc)}</span></div>` : '')
    + `<div><span>Total</span><span id="rgTotal">${money(sub - disc)}</span></div>`;
}
function rgDob() {
  const age = rgAge(); $('#rg-age').value = age === null ? '' : age;
  const bad = rgIso() && (age === null || age < 4);
  $('#rg-dob').closest('.fld').classList.toggle('invalid', !!bad);
  $('#rgGuardian').hidden = !(age !== null && age < 18);
  rgPackages(); rgFees();
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
  const pw = $('#rg-pw').value, pw2 = $('#rg-pw2').value;
  const pwBad = pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? 'Use at least 8 characters with a letter and a number.'
    : new TextEncoder().encode(pw).length > 72 ? 'That password is too long. Use 72 bytes or fewer.'
    : pw.toLowerCase() === val('#rg-email').toLowerCase() ? 'Choose a password that is different from the email.' : '';
  $('#rgPwErr').textContent = pwBad || 'Use at least 8 characters with a letter and a number.';
  need(!pwBad, f('#rg-pw'));
  $('#rgPw2Err').textContent = pw2 ? 'Passwords do not match.' : 'Confirm the password.';
  need(!!pw2 && pw2 === pw, f('#rg-pw2'));
  need(!!med, f('#rg-m1')); if (med === 'Yes') need(!!val('#rg-meddetail'), f('#rg-meddetail'));
  need(!!$('#rg-dogi').value, f('#rg-dogi')); need(!!$('#rg-pkg').value, f('#rg-pkg'));
  need($('#rg-terms').checked, $('#f-terms')); need($('#rg-pdpa').checked, $('#f-pdpa')); need(!!RG.sig.value(), $('#f-sig'));
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !first;
}
async function rgComplete() {
  const val = id => $(id).value.trim(), age = rgAge(), minor = age < 18, carry = $('#rg-carry').value;
  const body = {
    name: val('#rg-name'), dojoId: HQ, age, dob: rgIso(), gender: radio('rg-gender'), nationality: $('#rg-nat').value, phone: val('#rg-phone'), email: val('#rg-email'),
    emergencyContact: `${val('#rg-ecname')} (${$('#rg-ecrel').value}) · ${val('#rg-ecphone')}`, medical: radio('rg-med') === 'Yes' ? val('#rg-meddetail') : null,
    dogi: { type: $('#rg-dogitype').value, size: $('#rg-dogi').value }, packageId: $('#rg-pkg').value, signer: minor ? `${val('#rg-gname')} (parent/guardian)` : val('#rg-name'), signatureProvided: true,
    password: $('#rg-pw').value, confirmPassword: $('#rg-pw2').value
  };
  if (carry) body.carryGrade = carry;
  const btn = $('#rgPay');
  let out;
  try { out = await ASK.act.deskRegister(body); } catch (e) { btn.disabled = false; btn.textContent = 'Charge with Stripe and register'; ASK.errToast(e); return; }
  ['#rg-pw', '#rg-pw2'].forEach(id => { $(id).value = ''; $(id).type = 'password'; });
  $('#regForm').hidden = true;
  const done = $('#regDone'); done.hidden = false;
  const ok = out.activated;
  done.innerHTML = `<div class="card-h"><div><h3>${ok ? 'Registered' : 'Registration received'}</h3><span class="sub">${ok ? `${esc(body.name)} is now an ASK member.` : 'A Business Admin has to confirm the carried-over grade before this student is activated.'}</span></div></div>
    <div class="kv" style="margin:0"><div><span>Student</span><span>${esc(body.name)}</span></div><div><span>${ok ? 'Member no.' : 'Registration'}</span><span class="num">${esc(out.memberNo || out.applicationId)}</span></div><div><span>Paid by Stripe</span><span>${money(out.total)}</span></div>
    ${out.tempPassword ? `<div><span>Temporary password</span><span class="num" id="rgTemp">${esc(out.tempPassword)}</span></div>` : ''}
    <div><span>Equipment</span><span>${ok ? `Dogi size ${esc(body.dogi.size)} is queued at HQ` : 'Queued after activation'}</span></div></div>
    <div class="note" style="margin-top:14px"><svg class="ic"><use href="#i-info"/></svg><span>${out.tempPassword ? 'Give the temporary password to the student now. It is shown once and cannot be read again. They must change it when they first sign in.' : ok ? 'The student signs in with their member number or email and the password they just chose.' : 'Once a Business Admin confirms the grade, the student signs in with their member number or email and the password they just chose.'}</span></div>
    <div class="acts" style="margin-top:16px">${ok ? `<a class="sbtn dark" href="member.html?no=${encodeURIComponent(out.memberNo)}">Open student record</a>` : '<a class="sbtn dark" href="applications.html">Go to Registrations</a>'}<a class="sbtn" href="register.html">Register another student</a></div>`;
  toast(ok ? `${body.name} registered.` : `${body.name} waits for a Business Admin.`);
  done.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function registerPage() {
  $('#rg-dogi').insertAdjacentHTML('beforeend', DOGI_SIZES.map(s => `<option>${s}</option>`).join(''));
  $('#rg-dogitype').innerHTML = DOGI_TYPES.map(([n, a]) => `<option value="${esc(n)}">${esc(n)} · ${money(a)}</option>`).join('');
  $('#rg-carry').insertAdjacentHTML('beforeend', BELTS.slice(1).map(b => `<option>${b.g}</option>`).join(''));
  RG.sig = signaturePad($('#rgSig'), { startLabel: 'Sign here', onChange: () => $('#f-sig').classList.remove('invalid') });
  $('#rg-dob').addEventListener('change', rgDob);
  $('#rg-pkg').addEventListener('change', rgFees); $('#rg-dogitype').addEventListener('change', rgFees);
  $('#rgMedSeg').addEventListener('change', () => { $('#rgMedBox').hidden = radio('rg-med') !== 'Yes'; });
  /* an existing member is never registered twice: the desk opens their record instead */
  memberSearch('#rg-find', '#rgFound', m => {
    $('#rgExisting').innerHTML = `<div class="note warn" style="margin-top:12px"><svg class="ic"><use href="#i-info"/></svg><span><b>${esc(m.n)} is already a member (${esc(m.no)}).</b> <a href="member.html?no=${encodeURIComponent(m.no)}">Open their record</a> instead of registering again.</span></div>`;
  });
  $('#rgFound').innerHTML = '';
  $('#regForm').addEventListener('input', e => { const f = e.target.closest('.fld'); if (f) f.classList.remove('invalid'); });
  $('#regForm').addEventListener('change', e => { const f = e.target.closest('.fld'); if (f && e.target.id !== 'rg-dob') f.classList.remove('invalid'); });
  $('#regForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!rgValidate()) return toast('Check the highlighted fields.', 'bad');
    const btn = $('#rgPay'); btn.disabled = true; btn.textContent = 'Waiting for Stripe…';
    rgComplete();
  });
  rgFees();
}

/* ---------- Follow-ups ---------- */
const FU_TABS = [['newcomer', 'Newcomers not returned'], ['declining', 'Declining attendance'], ['renewal', 'Renewals coming up'], ['mine', 'Assigned to me']];
const fuUI = { tab: 'declining', d: null };
const fuItems = tab => !fuUI.d ? [] : tab === 'mine' ? fuUI.d.items.filter(i => i.followup && ADMIN && i.followup.ownerId === ADMIN.id) : fuUI.d.items.filter(i => i.kind === tab);
function renderFollowups() {
  const d = fuUI.d; if (!d) return;
  $('#fuTabs').innerHTML = FU_TABS.map(([k, l]) => `<button class="fpill${fuUI.tab === k ? ' on' : ''}" data-tab="${k}">${l}<span class="n">${fuItems(k).length}</span></button>`).join('');
  $('#fuRows').innerHTML = fuItems(fuUI.tab).map(i => {
    const f = i.followup, last = f && f.attempts[f.attempts.length - 1];
    return `<tr data-no="${esc(i.memberNo)}" data-kind="${esc(i.kind)}" data-fu="${f ? esc(f.id) : ''}"><td><div class="who"><span class="av">${initials(i.name)}</span><div><b><a href="member.html?no=${encodeURIComponent(i.memberNo)}">${esc(i.name)}</a></b><span class="num">${esc(i.memberNo)}</span></div></div></td>
      <td>${esc(i.reason)}${fuUI.tab === 'mine' ? `<span class="sub-note">${esc(FU_KINDS[i.kind] || i.kind)}</span>` : ''}</td><td>${esc(mbSeenText(i.seenDays))}</td><td>${esc(i.phone || '')}</td>
      <td class="num">${f ? f.attempts.length : 0}${last ? `<span class="sub-note">${esc(last.outcome)}</span>` : ''}</td><td>${f ? fmtShort(ASK.d(f.due)) : '—'}</td>
      <td><div class="acts-inline"><button class="sbtn dark" data-log="1">Log contact</button><select class="input" data-assign="1" data-ba aria-label="Assign ${esc(i.name)}"><option value="">Unassigned</option>${d.staff.map(s => `<option value="${esc(s.id)}"${f && f.ownerId === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div></td></tr>`;
  }).join('') || `<tr><td colspan="7" style="color:var(--muted)">${fuUI.tab === 'mine' ? 'Nothing is assigned to you.' : 'Nobody to contact in this list.'}</td></tr>`;
  stripBA($('#fuRows'));
  renderOutcomes();
}
function renderOutcomes() {
  const el = $('#fuOutcomes'); if (!el) return;
  el.innerHTML = fuUI.d.outcomes.map(o => `<div class="row"><span class="av navy">${initials(o.name)}</span><div class="grow"><div class="t">${esc(o.name)} · ${esc(o.last.outcome)}</div><div class="d">${esc(o.last.method)} · ${fmtShort(ASK.ts(o.last.at))}${o.last.note ? ' · ' + esc(o.last.note) : ''}</div></div>${pill('plain', plural(o.attempts, 'attempt'))}</div>`).join('') || '<p style="color:var(--muted)">No contact has been logged yet.</p>';
}
async function loadFollowups() { const r = await run(() => ASK.load.deskFollowups()); if (r) { fuUI.d = r; renderFollowups(); } return r; }
async function followupsPage() {
  const q = new URLSearchParams(location.search).get('tab'); if (FU_TABS.some(t => t[0] === q)) fuUI.tab = q;
  const r = await loadFollowups();
  const owner = $('#fu-owner');
  if (owner && r) {
    owner.innerHTML = r.staff.map(s => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    $('#fu-due').value = isoDate(addDays(TODAY, 3));
    $('#fuCreate').addEventListener('click', async () => {
      const kind = $('#fu-kind').value, due = $('#fu-due').value;
      if (!due) return toast('Choose a date to contact them by.', 'bad');
      const out = await run(() => ASK.act.deskFollowupCreate({ kind, ownerId: owner.value || null, dueDate: due }));
      if (out) { await loadFollowups(); toast(out.created ? `${plural(out.created, 'student')} added and assigned.` : 'Everyone on this list already has a follow-up.', out.created ? 'ok' : 'info'); }
    });
  }
  filterList('#fuSearch', '#fuRows');
  $('#fuTabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { fuUI.tab = b.dataset.tab; renderFollowups(); } });
  $('#fuRows').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-no]'); if (!tr) return;
    const item = fuUI.d.items.find(i => i.memberNo === tr.dataset.no && i.kind === tr.dataset.kind);
    if (e.target.closest('[data-log]')) logContactDrawer({ no: item.memberNo, n: item.name }, item.kind, loadFollowups, tr.dataset.fu || null);
  });
  $('#fuRows').addEventListener('change', async e => {
    const sel = e.target.closest('[data-assign]'); if (!sel || !isBA()) return;
    const tr = sel.closest('tr'), item = fuUI.d.items.find(i => i.memberNo === tr.dataset.no && i.kind === tr.dataset.kind);
    const out = await run(() => item.followup ? ASK.act.deskFollowupUpdate(item.followup.id, { ownerId: sel.value || null })
      : sel.value ? ASK.act.deskFollowupCreate({ memberNo: item.memberNo, kind: item.kind, ownerId: sel.value, dueDate: isoDate(addDays(TODAY, 3)) }) : Promise.resolve({}));
    if (out) { await loadFollowups(); toast(sel.value ? `${item.name} assigned.` : `${item.name} is unassigned.`, 'info'); }
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
