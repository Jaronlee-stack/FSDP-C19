/* =====================================================================
   AIKIDO SHINJU-KAI — core.js  (loaded first on every page)
   Helpers, shared layers (icons, toasts, modal, drawer, menu) and the
   reusable widgets: slide-to-pay, star rating, code slots, signature pad,
   custom select and date picker.
   ===================================================================== */
'use strict';

/* ---------- 1. HELPERS ---------- */
const $  = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const icon = (n, cls = 'ic') => `<svg class="${cls}"><use href="#i-${n}"/></svg>`;
const money = n => 'S$' + Number(n).toLocaleString('en-SG', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const initials = n => n.replace(/ (Sensei|Shihan)$/, '').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
const DAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = d => `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
const fmtShort = d => `${d.getDate()} ${MON[d.getMonth()]}`;
const dayName = d => DAY[d.getDay()].charAt(0) + DAY[d.getDay()].slice(1).toLowerCase();
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d, n) => { const x = new Date(d); x.setMonth(x.getMonth() + n); return x; };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const mondayOf = d => { const x = startOfDay(d); const k = (x.getDay() + 6) % 7; return addDays(x, -k); };
const daysBetween = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 864e5);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const TODAY = startOfDay(new Date());

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `<span class="ti">${icon(type === 'bad' ? 'x' : type === 'info' ? 'info' : 'check')}</span><span>${esc(msg)}</span>`;
  $('#toasts').appendChild(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 350); }, 3200);
}

function downloadCSV(name, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  toast(`${name} downloaded`);
}

function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* makePDF — builds a one-page A4 PDF with no library.
   items: { text, value?, vx?, size?, bold?, color?, gap? } or { rule: true, gap? } */
function makePDF(items) {
  const clean = s => String(s ?? '').replace(/[•·]/g, '*').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '').replace(/[\\()]/g, m => '\\' + m);
  let y = 800, body = '';
  items.forEach(it => {
    y -= it.gap ?? 18;
    if (it.rule) { body += `0.85 G 0.8 w 56 ${y} m 539 ${y} l S\n`; return; }
    const font = it.bold ? 'F2' : 'F1', sz = it.size || 11, col = it.color || '0.08 0.09 0.11 rg';
    body += `BT ${col} /${font} ${sz} Tf 56 ${y} Td (${clean(it.text)}) Tj ET\n`;
    if (it.value !== undefined) body += `BT ${col} /${font} ${sz} Tf ${it.vx || 220} ${y} Td (${clean(it.value)}) Tj ET\n`;
  });
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${body.length} >>\nstream\n${body}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}

/* tables turn into stacked cards on phones: each cell gets its column name */
function autoLabelTables() {
  $$('table.tbl').forEach(t => {
    const heads = $$('thead th', t).map(th => th.textContent.trim());
    const body = $('tbody', t);
    const label = () => $$('tr', body).forEach(tr => [...tr.children].forEach((td, i) => {
      if (heads[i]) td.dataset.label = heads[i]; else td.removeAttribute('data-label');
    }));
    label();
    new MutationObserver(label).observe(body, { childList: true });
  });
}


/* where this page sits: pages in sub-folders set data-root="../" so links still resolve */
const ROOT = document.body.dataset.root || '';
const url = p => ROOT + p;
const PAGE = document.body.dataset.page || '';
const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* shared layers: icon sprite, toasts, menu, modal, drawer — written once here instead of in every page */
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11h5v-6h4v6h5V9"/></symbol>
    <symbol id="i-cal" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></symbol>
    <symbol id="i-box" viewBox="0 0 24 24"><path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></symbol>
    <symbol id="i-award" viewBox="0 0 24 24"><circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/></symbol>
    <symbol id="i-card" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/></symbol>
    <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/></symbol>
    <symbol id="i-users" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.7-3.5 3.3-5.5 6.5-5.5s5.8 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.8c2 .7 3.2 2.5 3.5 5.2"/></symbol>
    <symbol id="i-bell" viewBox="0 0 24 24"><path d="M6 17v-6a6 6 0 1 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/></symbol>
    <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
    <symbol id="i-chart" viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></symbol>
    <symbol id="i-mega" viewBox="0 0 24 24"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12"/></symbol>
    <symbol id="i-doc" viewBox="0 0 24 24"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></symbol>
    <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6z"/></symbol>
    <symbol id="i-logout" viewBox="0 0 24 24"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l5-5-5-5M15 12H3"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5 10 17 19 7"/></symbol>
    <symbol id="i-x" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>
    <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
    <symbol id="i-back" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>
    <symbol id="i-ur" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></symbol>
    <symbol id="i-chev" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
    <symbol id="i-left" viewBox="0 0 24 24"><path d="m15 6-6 6 6 6"/></symbol>
    <symbol id="i-right" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
    <symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></symbol>
    <symbol id="i-phone" viewBox="0 0 24 24"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"/></symbol>
    <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></symbol>
    <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></symbol>
    <symbol id="i-info" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></symbol>
    <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></symbol>
    <symbol id="i-download" viewBox="0 0 24 24"><path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></symbol>
    <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m14 6 4 4"/></symbol>
    <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></symbol>
    <symbol id="i-map" viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/></symbol>
    <symbol id="i-nfc" viewBox="0 0 24 24"><path d="M6 8.5a5 5 0 0 1 0 7M9.5 6a9 9 0 0 1 0 12M13 4a13 13 0 0 1 0 16"/></symbol>
    <symbol id="i-send" viewBox="0 0 24 24"><path d="M4 12 20 4l-6 16-3-7z"/><path d="m11 13 9-9"/></symbol>
    <symbol id="i-receipt" viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></symbol>
    <symbol id="i-id" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.4 1.7-2 3-2s2.4.6 3 2M14 10h4M14 13h3"/></symbol>
    <symbol id="i-lock" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></symbol>
    <symbol id="i-sign" viewBox="0 0 24 24"><path d="M3 17c3 0 4-6 6-6s1 5 3 5 2-3 4-3 2 2 5 2"/><path d="M3 21h18"/></symbol>
    <symbol id="i-pen" viewBox="0 0 24 24"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></symbol>
    <symbol id="i-redo" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></symbol>
    <symbol id="i-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></symbol>
    <symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></symbol>
    <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5.5v13l10.5-6.5z"/></symbol>
    <symbol id="i-star" viewBox="0 0 24 24"><path fill="currentColor" stroke="none" d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></symbol>

    <!-- Ben fallback mascot (shows only if mascot-still.webp is missing) -->
    <symbol id="ben" viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="60" fill="#C1272D"/>
      <path d="M22 120c2-22 18-34 38-34s36 12 38 34z" fill="#fff"/>
      <path d="M48 89l12 20 12-20" fill="none" stroke="#16213B" stroke-width="3" stroke-linejoin="round"/>
      <rect x="30" y="110" width="60" height="10" fill="#16213B"/>
      <circle cx="60" cy="56" r="25" fill="#F6D2B0"/>
      <path d="M35 53c0-16 11-25 25-25s25 9 25 25c-5-7-13-10-25-10s-20 3-25 10z" fill="#1B1B22"/>
      <ellipse cx="60" cy="26" rx="8" ry="6" fill="#1B1B22"/>
      <path d="M35 49c8-4 16-6 25-6s17 2 25 6v6c-8-4-16-6-25-6s-17 2-25 6z" fill="#fff"/>
      <circle cx="60" cy="49" r="3.2" fill="#C1272D"/>
      <circle cx="51" cy="61" r="2.6" fill="#1B1B22"/><circle cx="69" cy="61" r="2.6" fill="#1B1B22"/>
      <path d="M53 69c4 4 10 4 14 0" fill="none" stroke="#1B1B22" stroke-width="2.4" stroke-linecap="round"/>
    </symbol>
  </defs>
</svg>`;
document.body.insertAdjacentHTML('afterbegin', SPRITE + '<div class="toasts" id="toasts" aria-live="polite"></div>');
document.body.insertAdjacentHTML('beforeend', `<div class="sm" id="sm" aria-hidden="true">
  <div class="sm-scrim" data-sm-close></div>
  <div class="sm-layer l1"></div><div class="sm-layer l2"></div>
  <aside class="sm-panel" aria-label="Menu">
    <div class="sm-head"><span class="brand"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt="">SHINJU-KAI</span><button class="icon-btn" data-sm-close aria-label="Close menu"><svg class="ic"><use href="#i-x"/></svg></button></div>
    <ul class="sm-list" id="smList"></ul>
    <div class="sm-foot" id="smFoot"><small>Shinju-Kai</small><div class="links"><a href="__ROOT__index.html">Website</a><a href="__ROOT__login.html">Member log in</a><a href="__ROOT__join.html">Join</a></div></div>
  </aside>
</div>
<div class="overlay" id="modal" aria-hidden="true">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <button class="icon-btn modal-x" data-close aria-label="Close"><svg class="ic"><use href="#i-x"/></svg></button>
    <div id="modalBody"></div>
  </div>
</div>
<div class="drawer-ov" id="drawerOv"></div>
<aside class="drawer" id="drawer" aria-hidden="true" role="dialog" aria-labelledby="drawerTitle">
  <div class="drawer-h"><h3 id="drawerTitle">Details</h3><button class="icon-btn" data-drawer-close aria-label="Close"><svg class="ic"><use href="#i-x"/></svg></button></div>
  <div class="drawer-b" id="drawerBody"></div>
  <div class="drawer-f" id="drawerFoot"></div>
</aside>`.replaceAll('__ROOT__', ROOT));

/* [data-go] buttons jump between pages */
const GO = { home: 'index.html', login: 'login.html', join: 'join.html', trial: 'trial.html', about: 'about.html' };
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]'); if (!b) return;
  e.preventDefault(); location.href = url(GO[b.dataset.go] || 'index.html');
});

/* ---------- 4. MODAL / DRAWER ---------- */
let lastFocus = null;
function openModal(html, wide = false) {
  lastFocus = document.activeElement;
  $('#modalBody').innerHTML = html;
  enhance($('#modalBody'));
  $('#modal .modal').classList.toggle('wide', wide);
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => ($('#modalBody [autofocus]') || $('#modal .modal-x')).focus({ preventScroll: true }), 50);
}
function closeModal() {
  if (!$('#modal').classList.contains('open')) return;
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden', 'true');
  $$('#modalBody iframe').forEach(f => f.remove()); // stop any playing video
  lastFocus && lastFocus.focus && lastFocus.focus({ preventScroll: true });
}
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.closest('[data-close]')) closeModal(); });

function openDrawer(title, body, foot = '') {
  $('#drawerTitle').textContent = title;
  $('#drawerBody').innerHTML = body;
  $('#drawerFoot').innerHTML = foot;
  $('#drawerFoot').hidden = !foot;
  enhance($('#drawerBody'));
  $('#drawer').classList.add('open'); $('#drawerOv').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
}
function closeDrawer() {
  $('#drawer').classList.remove('open'); $('#drawerOv').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
}
$('#drawerOv').addEventListener('click', closeDrawer);
document.addEventListener('click', e => { if (e.target.closest('[data-drawer-close]')) closeDrawer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDrawer(); closeSM(); if (typeof closeBen === 'function') closeBen(); } });


/* ---------- 5. REACT BITS PORTS ---------- */
let acObserver = null;

function animateIn(root) {
  if (!root || reduce || !('IntersectionObserver' in window)) { root && countUps(root); return; }
  document.documentElement.classList.add('js');
  acObserver = acObserver || new IntersectionObserver(entries => entries.forEach(en => {
    if (!en.isIntersecting) return;
    const el = en.target;
    setTimeout(() => el.classList.remove('pre'), (+el.dataset.acDelay || 0));
    acObserver.unobserve(el);
  }), { rootMargin: '0px 0px -6% 0px' });

  $$('.ac', root).forEach(el => {
    const targets = el.hasAttribute('data-stagger') ? [...el.children] : [el];
    targets.forEach((t, i) => {
      if (t.dataset.acDone) return;
      t.dataset.acDone = 1;
      t.classList.add('ac');
      const r = t.getBoundingClientRect();
      if (r.top < innerHeight * 0.96 && r.bottom > 0) {
        t.classList.add('pre');
        t.dataset.acDelay = i * 70;
        requestAnimationFrame(() => setTimeout(() => t.classList.remove('pre'), i * 70 + 30));
      } else {
        t.classList.add('pre');
        t.dataset.acDelay = i * 80;
        acObserver.observe(t);
      }
    });
  });
  countUps(root);
}

let cuObserver = null;

function countUps(root) {
  const run = el => {
    if (el.dataset.cuDone) return;
    el.dataset.cuDone = 1;
    const to = +el.dataset.count, suf = el.dataset.suffix || '';
    const sep = el.hasAttribute('data-sep') || to >= 10000;
    const fmt = v => (sep ? Math.round(v).toLocaleString('en-SG') : Math.round(v)) + suf;
    if (reduce) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 1400;
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur);
      el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  cuObserver = cuObserver || new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { run(en.target); cuObserver.unobserve(en.target); } }));
  $$('[data-count]', root).forEach(el => { if (!el.dataset.cuDone) cuObserver.observe(el); });
}

function profileCard(el) {
  if (!el || el.dataset.pc) return;
  el.dataset.pc = 1;
  const s = { x: 0, y: 0, tx: 0, ty: 0, a: 0, ta: 0 };
  let raf = 0;
  const write = () => {
    el.style.setProperty('--rx', (s.y * 12).toFixed(2) + 'deg');
    el.style.setProperty('--ry', (-s.x * 14).toFixed(2) + 'deg');
    el.style.setProperty('--lx', ((s.x + 1) * 50).toFixed(1) + '%');
    el.style.setProperty('--ly', ((s.y + 1) * 50).toFixed(1) + '%');
    el.style.setProperty('--act', s.a.toFixed(3));
  };
  const frame = () => {
    s.x += (s.tx - s.x) * 0.12; s.y += (s.ty - s.y) * 0.12; s.a += (s.ta - s.a) * 0.1;
    write();
    if (Math.abs(s.tx - s.x) + Math.abs(s.ty - s.y) + Math.abs(s.ta - s.a) > 0.002) raf = requestAnimationFrame(frame); else raf = 0;
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const aim = e => {
    if (e.pointerType === 'touch') return; // no tilt while scrolling on phones
    const r = el.getBoundingClientRect();
    s.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    s.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    s.ta = 1; wake();
  };
  if (reduce) return;
  el.addEventListener('pointermove', aim);
  el.addEventListener('pointerenter', aim);
  el.addEventListener('pointerleave', () => { s.tx = 0; s.ty = 0; s.ta = 0; wake(); });
  s.x = 0.62; s.y = -0.55; s.a = 1; write(); wake();
}

/* StaggeredMenu — public menu, and the "More" sheet in portals.
   Each page type fills SM_LINKS with [label, href] pairs; a null href is the log-out button. */
let SM_LINKS = [];
function openSM() {
  $('#smList').innerHTML = SM_LINKS.map(([l, h], i) => h
    ? `<li><a href="${h}" style="--i:${i}">${esc(l)}</a></li>`
    : `<li><button type="button" data-logout style="--i:${i}">${esc(l)}</button></li>`).join('');
  $('#smFoot').hidden = !!document.body.dataset.portal;
  $('#sm').classList.add('open'); $('#sm').setAttribute('aria-hidden', 'false');
  $$('[data-sm-open]').forEach(b => b.setAttribute('aria-expanded', 'true'));
}
function closeSM() {
  $('#sm').classList.remove('open'); $('#sm').setAttribute('aria-hidden', 'true');
  $$('[data-sm-open]').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-sm-open]')) { $('#sm').classList.contains('open') ? closeSM() : openSM(); return; }
  if (e.target.closest('[data-sm-close]') || e.target.closest('#smList a')) closeSM();
});

function peekRating(root, onChange) {
  const labels = ['Poor', 'Fair', 'Good', 'Great', 'Superb'];
  root.innerHTML = `<div class="peek-row" role="radiogroup" aria-label="Rate this class"><span class="peek-tip" aria-hidden="true"></span>${labels.map((l, i) =>
    `<button type="button" class="peek-star" role="radio" aria-checked="false" aria-label="${i + 1} of 5, ${l}" tabindex="${i ? -1 : 0}"><span class="peek-lift"><span class="peek-glyph" data-lit="false"><svg viewBox="0 0 24 24"><use href="#i-star"/></svg></span></span></button>`).join('')}</div>`;
  const row = $('.peek-row', root), tip = $('.peek-tip', root), stars = $$('.peek-star', root);
  let value = 0, hover = null;
  const paint = () => {
    const shown = hover !== null ? hover + 1 : value;
    stars.forEach((s, i) => {
      $('.peek-lift', s).style.transform = hover !== null && i <= hover && !reduce ? `translateY(-7px) scale(${i === hover ? 1.15 : 1})` : '';
      $('.peek-glyph', s).dataset.lit = i < shown;
      s.setAttribute('aria-checked', value === i + 1);
      s.tabIndex = (value ? value - 1 : 0) === i ? 0 : -1;
    });
    const tipAt = hover !== null ? hover : (value ? value - 1 : null);
    if (tipAt !== null) {
      const slot = row.clientWidth / 5;
      tip.textContent = labels[tipAt];
      tip.style.transform = `translate(calc(${slot * (tipAt + 0.5)}px - 50%),0)`;
      tip.classList.add('show');
    } else tip.classList.remove('show');
  };
  const commit = n => {
    value = value === n ? 0 : n; hover = null; paint(); onChange(value);
    const g = stars[n - 1] && $('.peek-glyph', stars[n - 1]);
    if (g && value && g.animate && !reduce) g.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)', offset: .35 }, { transform: 'scale(1)' }], { duration: 300, easing: 'cubic-bezier(.23,1,.32,1)' });
  };
  const idx = e => { const r = row.getBoundingClientRect(); return Math.max(0, Math.min(4, Math.floor((e.clientX - r.left) / r.width * 5))); };
  row.addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { hover = idx(e); paint(); } });
  row.addEventListener('pointerleave', () => { hover = null; paint(); });
  stars.forEach((s, i) => s.addEventListener('click', () => commit(i + 1)));
  row.addEventListener('keydown', e => {
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (!(e.key in map)) return;
    e.preventDefault(); value = Math.max(1, Math.min(5, value + map[e.key])); paint(); onChange(value); stars[value - 1].focus();
  });
  paint();
}

function slideCommit(el, onDone, canCommit) {
  const knob = $('.knob', el), fill = $('.fill', el), lbl = $('.lbl em', el);
  let start = 0, x = 0, dragging = false, done = false;
  const max = () => el.clientWidth - knob.offsetWidth - 10;
  const set = (px, anim) => {
    x = Math.max(0, Math.min(px, max()));
    knob.style.transition = fill.style.transition = anim ? 'transform .35s cubic-bezier(.32,1.25,.52,1), width .35s cubic-bezier(.32,1.25,.52,1)' : 'none';
    knob.style.transform = `translateX(${x}px)`;
    fill.style.width = (x + 60) + 'px';
    lbl.style.opacity = done ? 1 : String(1 - x / max() * 1.4);
    knob.setAttribute('aria-valuenow', Math.round(x / max() * 100));
  };
  const finish = () => {
    done = true; set(max(), true);
    el.classList.add('done'); el.dataset.label = lbl.textContent; lbl.textContent = 'Processing…'; lbl.style.opacity = 1;
    knob.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
    setTimeout(() => { lbl.textContent = 'Paid'; onDone(); }, 900);
  };
  knob.addEventListener('pointerdown', e => { if (done) return; dragging = true; start = e.clientX - x; knob.setPointerCapture(e.pointerId); });
  knob.addEventListener('pointermove', e => { if (dragging) set(e.clientX - start); });
  const up = () => { if (!dragging) return; dragging = false; if (x / max() > 0.88) { if (canCommit && !canCommit()) set(0, true); else finish(); } else set(0, true); };
  knob.addEventListener('pointerup', up); knob.addEventListener('pointercancel', up);
  knob.addEventListener('keydown', e => { if (!done && (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ')) { e.preventDefault(); if (!canCommit || canCommit()) finish(); } });
  el.reset = () => { done = false; el.classList.remove('done'); if (el.dataset.label) lbl.textContent = el.dataset.label; knob.innerHTML = '<svg class="ic"><use href="#i-arrow"/></svg>'; set(0, false); };
  set(0, false);
  return el;
}

function codeSlots(root, onSuccess) {
  const input = $('input.cap', root), slots = $$('.slot', root);
  const paint = () => {
    const v = input.value;
    slots.forEach((s, i) => {
      const ch = v[i] || '';
      if (s.dataset.v !== ch) { s.dataset.v = ch; s.innerHTML = ch ? `<span>${ch}</span>` : ''; }
      s.classList.toggle('active', document.activeElement === input && i === Math.min(v.length, 5) && v.length < 6);
    });
  };
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    root.classList.remove('bad');
    paint();
    if (input.value.length === 6) {
      if (input.value === '123456') { root.classList.add('ok'); input.blur(); setTimeout(onSuccess, 500); }
      else { root.classList.add('bad'); toast('That code is wrong. Check your email and try again.', 'bad'); setTimeout(() => { input.value = ''; root.classList.remove('bad'); paint(); }, 700); }
    }
  });
  input.addEventListener('focus', paint); input.addEventListener('blur', paint);
  root.reset = () => { input.value = ''; root.classList.remove('ok', 'bad'); paint(); };
  paint();
}

/* ---------- 6. SIGNATURE PAD ----------
   Vanilla port of the DrawSignature component: idle → drawing → done,
   fluid strokes (coalesced pointer events + quadratic smoothing),
   custom pen cursor, clear / close / re-sign. Works with mouse, touch and stylus.
   Returns { value(): dataURL|null, reset() }. */
function signaturePad(root, opts = {}) {
  const o = Object.assign({ startLabel: 'Start signing', finishLabel: 'Finish signing', doneLabel: 'Signed' }, opts);
  let step = 'idle', data = null, ink = 0, cv = null, ctx = null, down = false, pts = [];
  root.classList.add('sig');
  const emit = () => o.onChange && o.onChange(data);
  const set = s => { step = s; render(); };

  function render() {
    root.dataset.step = step;
    root.classList.remove('inked');
    if (step === 'idle') {
      root.innerHTML = `<button type="button" class="sig-start" data-sig="start"><span class="sig-ico">${icon('pen')}</span><span>${esc(o.startLabel)}</span></button>`;
    } else if (step === 'drawing') {
      root.innerHTML = `<div class="sig-pad">
        <div class="sig-h"><button type="button" class="sig-ic" data-sig="clear" aria-label="Clear signature">${icon('redo')}</button><span>Sign</span><button type="button" class="sig-ic x" data-sig="close" aria-label="Close signature pad">${icon('x')}</button></div>
        <div class="sig-area"><canvas aria-label="Signature pad. Draw your signature with a finger, stylus or mouse."></canvas><span class="sig-base" aria-hidden="true"><i>×</i></span><span class="sig-ph" aria-hidden="true">Sign here</span></div>
        <button type="button" class="sig-finish" data-sig="finish">${icon('pen')}<span>${esc(o.finishLabel)}</span></button></div>`;
      setup();
    } else {
      root.innerHTML = `<div class="sig-done"><span class="sig-ok">${icon('check')}<span>${esc(o.doneLabel)}</span></span><img src="${data}" alt="Your signature"><button type="button" class="sig-ic" data-sig="edit" aria-label="Sign again">${icon('pen')}</button></div>`;
    }
  }

  function setup() {
    cv = $('canvas', root);
    const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.max(1, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14161B'; ctx.fillStyle = '#14161B'; ctx.lineWidth = 2.6;
    ink = 0;
    if (data) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = data; ink = 999; root.classList.add('inked');
    }
    // map pointer to canvas space (works even while the pad is mid-animation)
    const pos = e => { const b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) * (cv.clientWidth / b.width), y: (e.clientY - b.top) * (cv.clientHeight / b.height) }; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); down = true;
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      const p = pos(e); pts = [p];
      ctx.beginPath(); ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill();
      root.classList.add('inked');
    });
    cv.addEventListener('pointermove', e => {
      if (!down) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach(ev => {
        const p = pos(ev), l = pts[pts.length - 1];
        ink += Math.hypot(p.x - l.x, p.y - l.y);
        pts.push(p);
        if (pts.length < 3) { ctx.beginPath(); ctx.moveTo(l.x, l.y); ctx.lineTo(p.x, p.y); ctx.stroke(); return; }
        const a = pts[pts.length - 3];
        ctx.beginPath();
        ctx.moveTo((a.x + l.x) / 2, (a.y + l.y) / 2);
        ctx.quadraticCurveTo(l.x, l.y, (l.x + p.x) / 2, (l.y + p.y) / 2);
        ctx.stroke();
      });
    });
    const up = () => { down = false; pts = []; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }

  root.addEventListener('click', e => {
    const b = e.target.closest('[data-sig]'); if (!b || !root.contains(b)) return;
    const a = b.dataset.sig;
    if (a === 'start' || a === 'edit') set('drawing');
    else if (a === 'close') set(data ? 'done' : 'idle');
    else if (a === 'clear') {
      if (ctx) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.restore(); }
      ink = 0; root.classList.remove('inked');
      if (data) { data = null; emit(); }
    } else if (a === 'finish') {
      if (ink < 25) {
        const area = $('.sig-area', root);
        area.classList.remove('shake'); void area.offsetWidth; area.classList.add('shake');
        toast('Draw your signature first.', 'bad'); return;
      }
      data = cv.toDataURL('image/png');
      set('done'); emit();
    }
  });
  render();
  return { value: () => data, reset() { data = null; ink = 0; set('idle'); emit(); } };
}


/* ---------- FORM HELPERS ---------- */
const val = id => ($('#' + id).value || '').trim();

const radio = name => { const r = $(`input[name="${name}"]:checked`); return r ? r.value : ''; };

const phoneOk = v => /^[689]\d{7}$/.test(v.replace(/\s/g, ''));

const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

function fldOf(el) { return el.closest('.fld'); }

function mark(el, bad) { const f = typeof el === 'string' ? $(el) : el; if (f) f.classList.toggle('invalid', bad); return !bad; }

function qrSVG(seed0 = 1834, size = 200) {
  // decorative check-in code (not a real QR)
  let cells = ''; let seed = seed0;
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    seed = (seed * 9301 + 49297) % 233280;
    const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    const on = finder ? (x % 6 === 0 || y % 6 === 0 || (x % 20 > 1 && x % 20 < 5 && y % 20 > 1 && y % 20 < 5) || (x > 15 && x < 19 && y > 1 && y < 5) || (x > 1 && x < 5 && y > 15 && y < 19)) : seed / 233280 > 0.52;
    if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg viewBox="-1 -1 23 23" width="${size}" height="${size}" style="background:#fff;border-radius:14px;max-width:100%" fill="#16213B" aria-hidden="true">${cells}</svg>`;
}

/* ---------- 13. CUSTOM SELECT + DATE PICKER ---------- */
function enhance(root = document) {
  $$('.fld select', root).forEach(customSelect);
  $$('input[data-dp]', root).forEach(el => { if (!el.dataset.dpReady) datePicker(el, dpPreset(el.dataset.dp)); });
}
function closeAllPop(except) {
  $$('.cs.open, .dp.open').forEach(w => {
    if (w === except) return;
    w.classList.remove('open');
    const b = $('.cs-btn, .dp-btn', w); b && b.setAttribute('aria-expanded', 'false');
  });
}
document.addEventListener('pointerdown', e => { if (!e.target.closest('.cs, .dp')) closeAllPop(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllPop(); });

/* Rounded dropdown that replaces the native select list but keeps the
   real <select> underneath, so form code keeps working. */
function customSelect(sel) {
  if (sel.dataset.cs) return;
  sel.dataset.cs = 1;
  const wrap = document.createElement('div'); wrap.className = 'cs';
  sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
  sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'cs-btn';
  btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<span class="v"></span>${icon('chev')}`;
  const list = document.createElement('div'); list.className = 'cs-list'; list.setAttribute('role', 'listbox');
  wrap.append(btn, list);
  if (sel.id) { const lab = $(`label[for="${sel.id}"]`); btn.id = sel.id + '-btn'; if (lab) lab.htmlFor = btn.id; }
  let hl = -1;
  const opts = () => [...sel.options];
  const sync = () => {
    const o = sel.options[sel.selectedIndex], v = $('.v', btn);
    v.textContent = o ? o.textContent : 'Select';
    v.classList.toggle('ph', !o || o.value === '');
  };
  const paintHl = () => {
    $$('.cs-opt', list).forEach((b, i) => b.classList.toggle('hl', i === hl));
    const h = $('.cs-opt.hl', list); if (h) list.scrollTop = Math.max(0, h.offsetTop - list.clientHeight / 2 + h.offsetHeight / 2);
  };
  const open = () => {
    closeAllPop(wrap);
    list.innerHTML = opts().map((o, i) => `<button type="button" class="cs-opt" role="option" data-i="${i}" aria-selected="${i === sel.selectedIndex}"${o.disabled ? ' disabled' : ''}>${esc(o.textContent)}</button>`).join('');
    const r = btn.getBoundingClientRect();
    wrap.classList.toggle('up', innerHeight - r.bottom < 300 && r.top > innerHeight - r.bottom);
    wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    hl = sel.selectedIndex; paintHl();
  };
  const close = () => { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  const choose = i => {
    if (sel.selectedIndex !== i) { sel.selectedIndex = i; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    sync(); close(); btn.focus();
  };
  btn.addEventListener('click', () => wrap.classList.contains('open') ? close() : open());
  list.addEventListener('click', e => { const b = e.target.closest('.cs-opt'); if (b) choose(+b.dataset.i); });
  btn.addEventListener('keydown', e => {
    const isOpen = wrap.classList.contains('open'), n = sel.options.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!isOpen) return open(); hl = (hl + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; paintHl(); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (isOpen && hl > -1) choose(hl); else open(); }
    else if (e.key === 'Escape' || e.key === 'Tab') close();
    else if (e.key.length === 1) {
      const k = e.key.toLowerCase(), all = opts();
      let i = all.findIndex((o, j) => j > hl && o.textContent.toLowerCase().startsWith(k));
      if (i < 0) i = all.findIndex(o => o.textContent.toLowerCase().startsWith(k));
      if (i > -1) { if (isOpen) { hl = i; paintHl(); } else choose(i); }
    }
  });
  sel.addEventListener('change', sync);
  new MutationObserver(sync).observe(sel, { childList: true, subtree: true, attributes: true });
  sync();
}

/* Typeable date field (DD / MM / YYYY) with a rounded calendar.
   Month and year open as grids, so a birth year is two taps away. */
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function dpPreset(kind) {
  if (kind === 'future') return { min: addDays(TODAY, 1), max: addDays(TODAY, 30), start: addDays(TODAY, 1), first: 'days' };
  if (kind === 'recent') return { min: addDays(TODAY, -60), max: TODAY, start: TODAY, first: 'days' };
  if (kind === 'past') return { min: new Date(1988, 0, 1), max: TODAY, start: TODAY, first: 'years' };
  return { min: new Date(1920, 0, 1), max: TODAY, start: new Date(TODAY.getFullYear() - 20, 0, 1), first: 'years' };
}
function datePicker(input, { min, max, start, first }) {
  input.dataset.dpReady = 1;
  input.maxLength = 14;
  const wrap = document.createElement('div'); wrap.className = 'dp';
  input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'dp-btn'; btn.setAttribute('aria-label', 'Open calendar'); btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = icon('cal');
  const pop = document.createElement('div'); pop.className = 'dp-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Choose a date');
  wrap.append(btn, pop);
  const lo = startOfDay(min), hi = startOfDay(max);
  let sel = null, vy = 0, vm = 0, mode = 'days', prev = '';
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmt = d => `${String(d.getDate()).padStart(2, '0')} / ${String(d.getMonth() + 1).padStart(2, '0')} / ${d.getFullYear()}`;
  const ok = d => d >= lo && d <= hi;
  const setDate = (d, typing) => {
    sel = d; input.dataset.iso = d ? iso(d) : '';
    if (d && !typing) { input.value = fmt(d); prev = input.value.replace(/\D/g, ''); }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if (!typing) input.dispatchEvent(new Event('input', { bubbles: true }));
  };
  input.addEventListener('input', e => {
    if (!e.isTrusted) return;
    let digits = input.value.replace(/\D/g, '').slice(0, 8);
    if (e.inputType === 'deleteContentBackward' && digits === prev) digits = digits.slice(0, -1);
    prev = digits;
    let out = digits.slice(0, 2);
    if (digits.length > 2) out += ' / ' + digits.slice(2, 4);
    if (digits.length > 4) out += ' / ' + digits.slice(4);
    input.value = out;
    if (digits.length === 8) {
      const dd = +digits.slice(0, 2), mm = +digits.slice(2, 4), yy = +digits.slice(4);
      const d = new Date(yy, mm - 1, dd);
      const valid = d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd && ok(d);
      setDate(valid ? d : null, true);
      if (valid) { vy = yy; vm = mm - 1; if (wrap.classList.contains('open')) { mode = 'days'; render(); } }
      else { const f = input.closest('.fld'); f && f.classList.add('invalid'); }
    } else if (input.dataset.iso) setDate(null, true);
  });
  const render = () => {
    const prevOff = new Date(vy, vm, 0) < lo, nextOff = new Date(vy, vm + 1, 1) > hi;
    let html = `<div class="dp-head"><button type="button" class="lbtn${mode === 'months' ? ' on' : ''}" data-mode="months">${MONTHS_FULL[vm]}${icon('chev')}</button><button type="button" class="lbtn${mode === 'years' ? ' on' : ''}" data-mode="years">${vy}${icon('chev')}</button><span class="sp"></span>`;
    if (mode === 'days') html += `<button type="button" class="dp-arrow" data-step="-1" aria-label="Previous month"${prevOff ? ' disabled' : ''}>${icon('left')}</button><button type="button" class="dp-arrow" data-step="1" aria-label="Next month"${nextOff ? ' disabled' : ''}>${icon('right')}</button>`;
    html += '</div>';
    if (mode === 'days') {
      const firstDay = new Date(vy, vm, 1), gs = addDays(firstDay, -((firstDay.getDay() + 6) % 7));
      html += '<div class="dp-dow">' + ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<span>${d}</span>`).join('') + '</div><div class="dp-days">';
      for (let i = 0; i < 42; i++) {
        const d = addDays(gs, i);
        const cls = ['dp-day', d.getMonth() !== vm ? 'out' : '', +d === +TODAY ? 'today' : '', sel && +d === +startOfDay(sel) ? 'sel' : ''].join(' ');
        html += `<button type="button" class="${cls}" data-d="${iso(d)}"${ok(d) ? '' : ' disabled'} aria-label="${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}">${d.getDate()}</button>`;
      }
      html += '</div>';
    } else if (mode === 'months') {
      html += '<div class="dp-grid">' + MON.map((m, i) => {
        const off = new Date(vy, i + 1, 0) < lo || new Date(vy, i, 1) > hi;
        return `<button type="button" data-m="${i}" class="${i === vm ? 'sel' : ''}"${off ? ' disabled' : ''}>${m}</button>`;
      }).join('') + '</div>';
    } else {
      html += '<div class="dp-grid years">';
      for (let y = hi.getFullYear(); y >= lo.getFullYear(); y--) html += `<button type="button" data-y="${y}" class="${y === vy ? 'sel' : ''}${y === TODAY.getFullYear() ? ' now' : ''}">${y}</button>`;
      html += '</div>';
    }
    html += `<div class="dp-foot"><button type="button" data-clear>Clear</button><button type="button" data-today${ok(TODAY) ? '' : ' disabled'}>Today</button></div>`;
    pop.innerHTML = html;
    if (mode === 'years') { const g = $('.dp-grid', pop), s = $('.sel', g); if (s) g.scrollTop = s.offsetTop - g.clientHeight / 2 + s.offsetHeight / 2; }
  };
  const open = () => {
    closeAllPop(wrap);
    const base = sel || start || TODAY;
    vy = base.getFullYear(); vm = base.getMonth(); mode = sel ? 'days' : (first || 'days');
    const r = wrap.getBoundingClientRect();
    wrap.classList.toggle('up', innerHeight - r.bottom < 420 && r.top > innerHeight - r.bottom);
    wrap.classList.add('open'); btn.setAttribute('aria-expanded', 'true');
    render();
  };
  const close = () => { wrap.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', () => wrap.classList.contains('open') ? close() : open());
  input.addEventListener('keydown', e => { if (e.key === 'ArrowDown' && e.altKey) { e.preventDefault(); open(); } });
  pop.addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    const ds = t.dataset;
    if (ds.mode) { mode = mode === ds.mode ? 'days' : ds.mode; render(); }
    else if (ds.step) { vm += +ds.step; if (vm < 0) { vm = 11; vy--; } if (vm > 11) { vm = 0; vy++; } render(); }
    else if (ds.m !== undefined) { vm = +ds.m; mode = 'days'; render(); }
    else if (ds.y !== undefined) { vy = +ds.y; mode = 'months'; render(); }
    else if (ds.d) { const [y, m, d] = ds.d.split('-').map(Number); setDate(new Date(y, m - 1, d)); close(); input.focus({ preventScroll: true }); }
    else if ('clear' in ds) { input.value = ''; prev = ''; setDate(null); mode = 'days'; render(); }
    else if ('today' in ds) { setDate(new Date(TODAY)); close(); }
  });
  input.dpSet = d => { if (!d) { input.value = ''; prev = ''; } setDate(d); };
}


/* after the page's own scripts have run: upgrade selects / dates, label tables, animate in */
document.addEventListener('DOMContentLoaded', () => {
  enhance(document);
  autoLabelTables();
  animateIn(document.body);
});
