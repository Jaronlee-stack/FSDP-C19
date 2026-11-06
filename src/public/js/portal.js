/* =====================================================================
   AIKIDO SHINJU-KAI — portal.js  (student, instructor and admin portals)
   Each portal page holds only its own <section>. This file adds the
   sidebar, top bar and phone tab bar around it, and turns away anyone
   not signed in to that portal.
   ===================================================================== */
'use strict';

const PORTALS = {
  student: {
    label: 'Student', dir: 'student/', login: 'login.html', search: 'Search classes', me: ['LW', 'Lervyn Wong', '4th Kyu · HQ Dojo'], ben: true,
    pages: [['home', 'home', 'Home'], ['book', 'cal', 'Book a class'], ['packages', 'box', 'Packages'], ['grading', 'award', 'Grading'], ['payments', 'card', 'Payments'], ['profile', 'user', 'Profile']]
  },
  instructor: {
    label: 'Instructor', dir: 'staff/instructor/', login: 'staff/index.html?denied', search: 'Search students', me: ['BT', 'Bob Tan Sensei', '6th Dan · HQ Dojo'],
    pages: [['today', 'home', 'Today'], ['students', 'users', 'Students'], ['timetable', 'cal', 'Timetable'], ['grading', 'award', 'Grading', () => CANDIDATES.filter(c => !c.done).length], ['profile', 'user', 'Profile']]
  },
  admin: {
    label: 'HQ Admin', dir: 'staff/admin/', login: 'staff/index.html?denied', search: 'Search members, sessions', me: ['HQ', 'HQ Office', 'Administrator'],
    pages: [['dashboard', 'home', 'Overview'], ['applications', 'inbox', 'Requests', () => APPS.length + MC_REQUESTS.filter(r => r.status === 'PENDING').length], ['members', 'users', 'Members'], ['sessions', 'cal', 'Sessions'],
      ['grading', 'award', 'Grading'], ['payments', 'card', 'Payments'], ['notify', 'mega', 'Notifications'], ['reports', 'chart', 'Reports']]
  }
};
const PORTAL = document.body.dataset.portal, P = PORTALS[PORTAL];
const ALLOWED = AUTH.role === PORTAL;
const pageFile = key => url(P.dir + (key === P.pages[0][0] ? 'index' : key) + '.html');

/* ---------- guard: wrong or no account → that portal's sign-in ---------- */
if (!ALLOWED) location.replace(url(P.login));
else document.body.classList.add('ok');

/* ---------- shell ---------- */
function buildShell() {
  const shell = $('.shell'), main = $('.main', shell);
  const cur = P.pages.find(p => p[0] === PAGE) || P.pages[0];
  document.title = `${cur[2]} · ${P.label} · Aikido Shinju-Kai`;
  const cnt = p => { const n = p[3] ? p[3]() : 0; return n ? `<span class="cnt" data-cnt="${p[0]}">${n}</span>` : `<span class="cnt" data-cnt="${p[0]}" hidden></span>`; };

  main.insertAdjacentHTML('beforebegin', `<aside class="rail">
    <div class="rail-top"><a class="brand" href="${pageFile(P.pages[0][0])}"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt=""><span class="t">SHINJU-KAI</span></a><button class="rail-toggle" data-rail-toggle aria-label="Collapse sidebar" aria-expanded="true">${icon('left')}</button></div>
    <div class="rail-role">${P.label}</div>
    <nav aria-label="${P.label} portal">${P.pages.map(p => `<a href="${pageFile(p[0])}" data-label="${p[2]}"${p[0] === cur[0] ? ' class="on" aria-current="page"' : ''}>${icon(p[1])}<span class="t">${p[2]}</span>${p[3] ? cnt(p) : ''}</a>`).join('')}</nav>
    <div class="rail-me"><span class="av">${P.me[0]}</span><div class="me-info"><b>${P.me[1]}</b><span>${P.me[2]}</span></div><button data-logout aria-label="Log out" title="Log out">${icon('logout')}</button></div>
  </aside>`);

  main.insertAdjacentHTML('afterbegin', `<div class="topbar">
    <img class="tb-logo m-only" src="https://aikidoshinjukai.com.sg/images/logo.png" alt="">
    <span class="crumb">${P.label} · <b>${cur[2]}</b></span>
    <span class="sp"></span>
    <label class="search">${icon('search')}<input placeholder="${P.search}" aria-label="Search"></label>
    <button class="icon-btn" data-notif aria-label="Notifications">${icon('bell')}<span class="badge-dot"></span></button>
    <button class="icon-btn m-only" data-logout aria-label="Log out" title="Log out">${icon('logout')}</button>
  </div>`);

  // phones: bottom tab bar (first 4 + "More" when there are more than 5)
  const many = P.pages.length > 5, shown = many ? P.pages.slice(0, 4) : P.pages;
  const onMore = many && !shown.includes(cur);
  shell.insertAdjacentHTML('beforeend', `<nav class="tabbar" aria-label="${P.label} portal">${shown.map(p =>
    `<a href="${pageFile(p[0])}"${p === cur ? ' class="on" aria-current="page"' : ''}>${icon(p[1])}<span>${p[2].split(' ')[0] === 'Book' ? 'Book' : p[2]}</span>${p[3] && p[3]() ? `<i class="cnt" data-cnt="${p[0]}">${p[3]()}</i>` : ''}</a>`).join('')
    }${many ? `<button type="button" data-sm-open aria-expanded="false"${onMore ? ' class="on"' : ''}>${icon('more')}<span>More</span></button>` : ''}</nav>`);

  SM_LINKS = P.pages.map(p => [p[2], pageFile(p[0])]).concat([[isStaff(PORTAL) ? 'Sign out' : 'Log out', null]]);

  // collapsible sidebar, remembered between pages
  let col = false;
  try { col = localStorage.getItem('ask-rail') === '1'; } catch (_) {}
  const apply = () => {
    shell.classList.toggle('collapsed', col);
    const b = $('[data-rail-toggle]'); b.setAttribute('aria-expanded', String(!col)); b.setAttribute('aria-label', col ? 'Expand sidebar' : 'Collapse sidebar');
  };
  $('[data-rail-toggle]').addEventListener('click', () => { col = !col; try { localStorage.setItem('ask-rail', col ? '1' : '0'); } catch (_) {} apply(); });
  apply();
}

/* update a sidebar / tab bar badge after something changes */
function setCount(key, n) {
  $$(`[data-cnt="${key}"]`).forEach(c => { c.textContent = n; c.hidden = !n; });
}

/* buttons that jump to another page of the same portal */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-page-link]'); if (!b) return;
  e.preventDefault(); save(); location.href = pageFile(b.dataset.pageLink);
});

/* ---------- notifications (bell) ---------- */
const seenKey = 'ask-notif-' + PORTAL;
function syncNotifDot() {
  const dot = $('[data-notif] .badge-dot'); if (!dot) return;
  let seen = false; try { seen = sessionStorage.getItem(seenKey) === '1'; } catch (_) {}
  dot.hidden = PORTAL === 'student' ? (!DB.rateQueue.length && seen) : seen;
}
function openNotifs() {
  const row = (ic, t, d, act = '') => `<div class="row"><span class="av navy">${icon(ic)}</span><div class="grow"><div class="t">${t}</div><div class="d">${d}</div></div>${act}</div>`;
  let rows = [];
  if (PORTAL === 'student') {
    rows = DB.rateQueue.map((r, i) => row('star', `Rate your ${esc(r.c.type)} class`, `${dayName(r.date)} ${fmtShort(r.date)} · ${timeLabel(r.c.time)} · ${esc(r.c.ins)}`, `<button class="sbtn dark" data-rate="${i}">Rate</button>`));
    const next = BOOKINGS.slice().sort((a, b) => a.date - b.date)[0];
    if (next) rows.push(row('cal', 'Booking confirmed', `${next.c.type} · ${dayName(next.date)} ${fmtShort(next.date)} · ${timeLabel(next.c.time)} · HQ Dojo`));
    const f = activePasses()[0]; if (f && daysBetween(TODAY, f.expires) <= 30) rows.push(row('clock', 'Lessons expiring soon', `${plural(f.left, 'lesson')} in your ${esc(f.name)} expire on ${fmtDate(f.expires)}`));
    rows.push(row('award', 'Grading applications close 29 Nov', 'Adult grading on 13 Dec at HQ Dojo'));
  } else if (PORTAL === 'instructor') {
    rows.push(row('award', 'Grading on 13 Dec', `${CANDIDATES.filter(c => !c.done).length} candidates waiting for results`));
    rows.push(row('flag', 'Low attendance', `${STUDENTS.filter(isDeclining).length} students not seen in 14+ days`));
    if (FEEDBACK.length) rows.push(row('star', 'New class feedback', `${plural(FEEDBACK.length, 'rating')} from students this week`));
  } else {
    rows.push(row('inbox', 'Membership applications', `${APPS.length} paid and waiting for approval`));
    rows.push(row('doc', 'MC carry-forward requests', `${MC_REQUESTS.filter(r => r.status === 'PENDING').length} waiting for review`));
    rows.push(row('award', 'Promotion proposals', `${PROPOSALS.length} signed by instructors`));
  }
  try { sessionStorage.setItem(seenKey, '1'); } catch (_) {}
  syncNotifDot();
  openModal(`<h3 id="modalTitle">Notifications</h3><div class="rows notif">${rows.join('') || '<p style="color:var(--muted)">You\'re all caught up.</p>'}</div>`);
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-notif]')) { openNotifs(); return; }
  const r = e.target.closest('[data-rate]'); if (r && typeof openRating === 'function') openRating(+r.dataset.rate);
});

/* ---------- MC carry-forward helpers (used by the student and admin portals) ---------- */
const mcRange = r => { const [ys, ms, ds] = r.mc_start.split('-').map(Number), [ye, me, de] = r.mc_end.split('-').map(Number); return `${ds} ${MON[ms - 1]} – ${de} ${MON[me - 1]} ${ye}`; };

const mcPill = s => s === 'APPROVED' ? '<span class="pill ok">Approved</span>' : s === 'REJECTED' ? '<span class="pill bad">Not approved</span>' : '<span class="pill warn">Pending HQ review</span>';

function openMCView(r, admin) {
  if (!r) return;
  openModal(`<h3 id="modalTitle">Carry-forward ${r.id}</h3><p class="sub">${esc(r.student_name)} · ${esc(r.pass_label)}</p>
    <div class="kv"><div><span>Lessons to move</span><span>${r.credits}</span></div><div><span>Current expiry</span><span>${fmtDate(r.old_expiry)}</span></div><div><span>New expiry</span><span>${fmtDate(r.new_expiry)} (+${plural(r.extend_days, 'day')})</span></div><div><span>MC dates</span><span>${mcRange(r)}</span></div><div><span>Status</span><span>${r.status === 'PENDING' ? 'Pending HQ review' : r.status === 'APPROVED' ? 'Approved' : 'Not approved'}</span></div><div><span>Submitted</span><span>${fmtDate(r.created_at)}</span></div>${r.note ? `<div><span>Note</span><span>${esc(r.note)}</span></div>` : ''}<div><span>Stored as</span><span style="overflow-wrap:anywhere">${esc(r.file_url)}</span></div></div>
    <div class="mc-preview">${!PREVIEWS[r.id] ? `<div class="ct-novid" style="height:180px;background:var(--navy);border-radius:var(--r-md)">${icon('doc')}<b>MC on file</b><span>Open from the document store.</span></div>` : r.mime === 'application/pdf' ? `<iframe src="${PREVIEWS[r.id]}" title="Medical certificate"></iframe>` : `<img src="${PREVIEWS[r.id]}" alt="Uploaded medical certificate">`}</div>
    ${admin && r.status === 'PENDING' ? `<div class="acts"><button class="sbtn dark" data-mc-ok="${r.id}" data-close>${icon('check')}Approve</button><button class="sbtn" data-mc-no="${r.id}" data-close>Not approved</button></div>` : ''}`, true);
}

if (ALLOWED) { buildShell(); syncNotifDot(); }

/* runs the current page's setup from the portal's own script */
function runPage(map) { if (ALLOWED && map[PAGE]) map[PAGE](); }
