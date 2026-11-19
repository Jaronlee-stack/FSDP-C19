/* AIKIDO SHINJU-KAI — admin-audit.js  (office portal, Business Admin: Audit log)

   One page of audit events at a time, filtered and searched on the server (GET /api/v1/admin/audit), plus the CSV of the same filters.
   Loaded after admin-business.js (reuses run, pill, cap1). Nothing is kept in the browser. */

const AU = { page: 1, pageSize: 25, pages: 1, total: 0, seq: 0, facets: false, open: null, timer: 0, rows: [] };
const AU_TIME = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const auTime = s => (s ? AU_TIME.format(new Date(s)) : '');
const auRole = a => (a.role === 'admin' ? (a.adminType === 'business' ? 'Business Admin' : 'Front desk') : a.role === 'instructor' ? 'Instructor' : a.role === 'student' ? 'Student' : '');
const auWords = s => cap1(String(s || '').replace(/[._]/g, ' '));

/* the filters as the API takes them (empty ones are left out by the loader) */
function auFilters() {
  return { from: $('#au-from').value, to: $('#au-to').value, actorId: $('#au-actor').value, group: $('#au-group').value, entityType: $('#au-type').value, q: $('#au-q').value.trim() };
}

function auRow(r, i) {
  const who = r.actor && r.actor.name
    ? `<div class="who"><div><b>${esc(r.actor.name)}</b>${auRole(r.actor) ? `<span class="num">${esc(auRole(r.actor))}</span>` : ''}</div></div>`
    : '<span class="au-sys">System or signed out</span>';
  const rec = r.entityType ? `${esc(auWords(r.entityType))}${r.entityId ? `<span class="sub-note num">${esc(r.entityId)}</span>` : ''}` : '—';
  const open = AU.open === r.id;
  return `<tr class="au-row${open ? ' open' : ''}" data-i="${i}"><td class="num">${esc(auTime(r.at))}</td><td>${who}</td><td><span class="au-act">${esc(r.action)}</span></td><td>${rec}</td><td>${esc(r.summary)}</td><td><button class="sbtn ghost au-more" data-au="${i}" aria-expanded="${open}" aria-label="${open ? 'Hide' : 'Show'} details">${icon(open ? 'chev' : 'right')}</button></td></tr>${open ? auDetail(r) : ''}`;
}

function auDetail(r) {
  const d = r.details && typeof r.details === 'object' ? r.details : {};
  const val = v => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));
  const kv = Object.keys(d).map(k => `<div><span>${esc(auWords(k))}</span><span>${esc(val(d[k]))}</span></div>`);
  kv.push(`<div><span>Event</span><span class="num">#${esc(r.id)}</span></div>`);
  if (r.actor && r.actor.id) kv.push(`<div><span>Account</span><span class="num">${esc(r.actor.id)}</span></div>`);
  if (r.ip) kv.push(`<div><span>IP address</span><span class="num">${esc(r.ip)}</span></div>`);
  return `<tr class="au-detail"><td colspan="6"><div class="kv au-kv">${kv.join('')}</div></td></tr>`;
}

function auPaint() {
  $('#auRows').innerHTML = AU.rows.map(auRow).join('') || `<tr><td colspan="6" class="au-empty">No events match these filters.</td></tr>`;
  const pg = $('#auPager');
  pg.hidden = !AU.total;
  $('#auPageInfo').textContent = `Page ${AU.page} of ${AU.pages} · ${plural(AU.total, 'event')}`;
  $('#auPrev').disabled = AU.page <= 1;
  $('#auNext').disabled = AU.page >= AU.pages;
}

function auFacets(f) {
  if (AU.facets || !f) return;
  AU.facets = true;
  const fill = (id, first, list) => { const el = $(id), cur = el.value; el.innerHTML = [`<option value="">${esc(first)}</option>`].concat(list.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`)).join(''); el.value = cur; };
  fill('#au-actor', 'Everyone', (f.actors || []).map(a => [a.id, `${a.name} (${a.id})`]));
  fill('#au-group', 'All areas', (f.groups || []).map(g => [g, auWords(g)]));
  fill('#au-type', 'All records', (f.entityTypes || []).map(t => [t, auWords(t)]));
}

async function auLoad() {
  const n = ++AU.seq, f = auFilters();
  if (f.from && f.to && f.from > f.to) {
    AU.rows = []; AU.total = 0; AU.pages = 1; AU.open = null;
    $('#auRows').innerHTML = '<tr><td colspan="6" class="au-empty">The From date must be on or before the To date.</td></tr>';
    $('#auPager').hidden = true;
    return;
  }
  $('#auRows').innerHTML = '<tr><td colspan="6" class="au-empty">Loading…</td></tr>';
  let r;
  try { r = await ASK.load.baAudit(Object.assign({ page: AU.page, pageSize: AU.pageSize }, f)); }
  catch (e) {
    if (n !== AU.seq) return;
    $('#auPager').hidden = true;
    $('#auRows').innerHTML = `<tr><td colspan="6" class="au-empty">${esc(e.message || 'Could not load the audit log.')} <button class="sbtn" id="auRetry">Try again</button></td></tr>`;
    return;
  }
  if (n !== AU.seq) return;   // a newer filter was chosen while this one loaded
  AU.rows = r.rows; AU.total = r.total; AU.page = r.page; AU.pages = Math.max(1, r.pages); AU.open = null;
  auFacets(r.facets);
  auPaint();
}

/* a changed filter or search goes back to the first page */
const auRefilter = () => { AU.page = 1; return auLoad(); };

function auInit() {
  ['#au-from', '#au-to', '#au-actor', '#au-group', '#au-type'].forEach(s => $(s).addEventListener('change', auRefilter));
  $('#au-q').addEventListener('input', () => { clearTimeout(AU.timer); AU.timer = setTimeout(auRefilter, 250); });
  $('#au-q').addEventListener('keydown', e => { if (e.key === 'Escape' && $('#au-q').value) { $('#au-q').value = ''; auRefilter(); } });
  $('#auPrev').addEventListener('click', () => { if (AU.page > 1) { AU.page--; auLoad(); } });
  $('#auNext').addEventListener('click', () => { if (AU.page < AU.pages) { AU.page++; auLoad(); } });
  $('#auRows').addEventListener('click', e => {
    if (e.target.closest('#auRetry')) { auLoad(); return; }
    const tr = e.target.closest('tr.au-row'); if (!tr) return;
    const r = AU.rows[+tr.dataset.i]; if (!r) return;
    AU.open = AU.open === r.id ? null : r.id;
    auPaint();
  });
  const ex = $('#auExport');
  if (ex) ex.addEventListener('click', async () => {
    const f = auFilters();
    if (f.from && f.to && f.from > f.to) return toast('The From date must be on or before the To date.', 'bad');
    ex.disabled = true;
    await run(() => ASK.baAuditCsv(f));
    ex.disabled = false;
  });
  return auLoad();
}

runPage({ audit: auInit });
