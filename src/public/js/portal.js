/* =====================================================================
   AIKIDO SHINJU-KAI — portal.js  (student, instructor and admin portals)
   Each portal page holds only its own <section>. This file adds the
   sidebar, top bar and phone tab bar around it, and turns away anyone
   not signed in to that portal.
   ===================================================================== */
'use strict';

/* ---------- office portal pages: [key, icon, label, group (Business Admin rail only), Business Admin only] ----------
   One table feeds the sidebar, phone tab bar, page guard and parent highlight, so they cannot drift apart.
   Prototype only: the real system must also check the role on the server. */
const ADMIN_PAGES = [
  ['dashboard', 'home', 'Today', 'Operations', false], ['sessions', 'cal', 'Classes', 'Operations', false], ['members', 'users', 'Members', 'Operations', false],
  ['payments', 'card', 'Payments', 'Operations', false], ['applications', 'inbox', 'Registrations', 'Operations', false], ['equipment', 'box', 'Equipment', 'Operations', false],
  ['followups', 'flag', 'Follow-ups', 'Operations', false], ['notify', 'mega', 'Notifications', 'Operations', false],
  ['insights', 'chart', 'Insights', 'Management', true], ['revenue', 'receipt', 'Revenue', 'Management', true], ['grading', 'award', 'Grading', 'Management', true], ['reports', 'doc', 'Reports', 'Management', true],
  ['policies', 'shield', 'Policies', 'Control', true], ['staff', 'id', 'Staff', 'Control', true], ['imports', 'upload', 'Import issues', 'Control', true]
];
/* pages with no menu item highlight their parent */
const ADMIN_PARENT = { roster: 'sessions', member: 'members', register: 'applications' };
function adminPortal() {
  const ba = isBA(), who = ADMIN ? ADMIN.name : 'Admin';
  const cnt = { applications: () => APPS.length + MC_REQS.filter(r => r.status === 'pending').length + (ba ? (DB.exceptions || []).filter(x => x.status === 'pending').length : 0), imports: () => (DB.imports || []).filter(i => i.status === 'open').length };
  return {
    label: ba ? 'Business Admin' : 'Front desk', dir: 'admin_portal/', login: 'admin_portal/signin.html?expired', parent: ADMIN_PARENT,
    me: [initials(who), who, ba ? 'Business Admin · HQ Dojo' : 'Front desk · HQ Dojo'],
    tabs: ba ? ['dashboard', 'insights', 'sessions', 'members'] : ['dashboard', 'sessions', 'members', 'payments'],
    pages: ADMIN_PAGES.filter(p => ba || !p[4]).map(p => [p[0], p[1], ba && p[0] === 'dashboard' ? 'Overview' : p[2], cnt[p[0]], ba ? p[3] : null])
  };
}

const PORTALS = {
  student: {
    label: 'Student', dir: 'student_portal/', login: 'student_portal/login.html', me: ['LW', 'Lervyn Wong', '4th Kyu · HQ Dojo'], ben: true,
    pages: [['home', 'home', 'Home'], ['book', 'cal', 'Book a class'], ['packages', 'box', 'Packages'], ['grading', 'award', 'Grading'], ['payments', 'card', 'Payments'], ['profile', 'user', 'Profile']]
  },
  instructor: {
    label: 'Instructor', dir: 'instructor_portal/', login: 'admin_portal/signin.html?denied', me: ['BT', 'Bob Tan Sensei', '6th Dan · HQ Dojo'],
    pages: [['today', 'home', 'Schedule'], ['grading', 'award', 'Grading'], ['profile', 'user', 'Profile']]
  },
  admin: adminPortal()
};
const PORTAL = document.body.dataset.portal, P = PORTALS[PORTAL];
/* the office portal needs a role as well as a sign-in; a session with no admin type is treated as expired */
const ALLOWED = AUTH.role === PORTAL && (PORTAL !== 'admin' || !!ADMIN);
const pageFile = key => url(P.dir + (key === P.pages[0][0] ? 'index' : key) + '.html');

/* ---------- examiner access ----------
   The Examiner role is added on top of the instructor role only while that instructor is on a scheduled grading
   panel, and only during the shift. Everyone else never sees Grading and is sent home if they open its address.
   Prototype only: this runs in the browser, so the real check must be repeated on the server. */
function examinerShift() {
  if (PORTAL !== 'instructor') return null;
  const at = (d, t) => { const x = startOfDay(d); x.setHours(+t.slice(0, 2), +t.slice(3), 0, 0); return x; }, now = new Date();
  // access opens 15 minutes before the start, as on the timetable
  return DB.panels.find(sh => sh.examiners.includes(P.me[1]) && (sh.demoOn || (now >= new Date(+at(sh.date, sh.from) - 15 * 60000) && now <= at(sh.date, sh.to)))) || null;
}
/* office portal: a Business Admin page opened by the front desk goes back to that person's home, with a message */
const ADM_BLOCKED = ALLOWED && PORTAL === 'admin' && !isBA() && ADMIN_PAGES.some(p => p[0] === PAGE && p[4]);
const GATED = (ALLOWED && PORTAL === 'instructor' && PAGE === 'grading' && !examinerShift()) || ADM_BLOCKED;

/* ---------- guard: wrong or no account → that portal's sign-in ---------- */
if (!ALLOWED) location.replace(url(PORTAL === 'admin' && AUTH.role && AUTH.role !== 'admin' ? 'admin_portal/signin.html?denied' : P.login));
else if (ADM_BLOCKED) location.replace(url(P.dir + 'index.html?baonly'));
else if (GATED) location.replace(url(P.dir + 'index.html?nograding'));
else document.body.classList.add('ok');

/* ---------- shell ---------- */
function buildSoloShell() {
  const shell = $('.shell'), main = $('.main', shell), onProfile = PAGE === 'profile';
  shell.classList.add('solo');
  document.title = `${onProfile ? 'Profile' : PAGE === 'grading' ? 'Grading' : 'Schedule'} · ${P.label} · Aikido Shinju-Kai`;
  main.insertAdjacentHTML('afterbegin', `<div class="topbar solo-bar">
    <a class="brand" href="${pageFile('today')}"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt=""><span class="t">SHINJU-KAI</span><span class="role-tag">${P.label}</span></a>
    <span class="sp"></span>
    ${examinerShift() ? '<span class="pill navy plain" title="You are on the grading panel for this shift">Examiner</span>' : ''}
    <button class="icon-btn" data-notif aria-label="Notifications">${icon('bell')}<span class="badge-dot"></span></button>
    <a class="prof-btn${onProfile ? ' on' : ''}" href="${pageFile('profile')}" aria-label="Profile"${onProfile ? ' aria-current="page"' : ''}><span class="av navy">${P.me[0]}</span></a>
  </div>`);
}

function buildShell() {
  if (PORTAL === 'instructor') return buildSoloShell();
  const shell = $('.shell'), main = $('.main', shell);
  const cur = P.pages.find(p => p[0] === PAGE) || P.pages.find(p => p[0] === (P.parent || {})[PAGE]) || P.pages[0];
  document.title = `${cur[2]} · ${P.label} · Aikido Shinju-Kai`;
  const cnt = p => { const n = p[3] ? p[3]() : 0; return n ? `<span class="cnt" data-cnt="${p[0]}">${n}</span>` : `<span class="cnt" data-cnt="${p[0]}" hidden></span>`; };

  main.insertAdjacentHTML('beforebegin', `<aside class="rail">
    <div class="rail-top"><a class="brand" href="${pageFile(P.pages[0][0])}"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt=""><span class="t">SHINJU-KAI</span></a><button class="rail-toggle" data-rail-toggle aria-label="Collapse sidebar" aria-expanded="true">${icon('left')}</button></div>
    <div class="rail-role">${P.label}</div>
    <nav aria-label="${P.label} portal">${P.pages.map((p, i) => `${p[4] && p[4] !== (P.pages[i - 1] || [])[4] ? `<div class="grp">${p[4]}</div>` : ''}<a href="${pageFile(p[0])}" data-label="${p[2]}"${p[0] === cur[0] ? ' class="on" aria-current="page"' : ''}>${icon(p[1])}<span class="t">${p[2]}</span>${p[3] ? cnt(p) : ''}</a>`).join('')}</nav>
    <div class="rail-me"><span class="av">${P.me[0]}</span><div class="me-info"><b>${P.me[1]}</b><span>${P.me[2]}</span></div><button data-logout aria-label="Log out" title="Log out">${icon('logout')}</button></div>
  </aside>`);

  main.insertAdjacentHTML('afterbegin', `<div class="topbar">
    <button class="icon-btn m-only tb-menu" data-sm-open aria-expanded="false" aria-controls="sm" aria-label="Open menu">${icon('menu')}</button>
    <span class="crumb">${P.label} · <b>${cur[2]}</b></span>
    <span class="sp"></span>
    <button class="icon-btn" data-notif aria-label="Notifications">${icon('bell')}<span class="badge-dot"></span></button>
  </div>`);

  // phones: bottom tab bar (first 4 + "More" when there are more than 5)
  const many = P.pages.length > 5, shown = P.tabs ? P.tabs.map(k => P.pages.find(p => p[0] === k)).filter(Boolean) : many ? P.pages.slice(0, 4) : P.pages;
  const onMore = many && !shown.includes(cur);
  shell.insertAdjacentHTML('beforeend', `<nav class="tabbar" aria-label="${P.label} portal">${shown.map(p =>
    `<a href="${pageFile(p[0])}"${p === cur ? ' class="on" aria-current="page"' : ''}>${icon(p[1])}<span>${p[2].split(' ')[0] === 'Book' ? 'Book' : p[2]}</span>${p[3] && p[3]() ? `<i class="cnt" data-cnt="${p[0]}">${p[3]()}</i>` : ''}</a>`).join('')
    }${many ? `<button type="button" data-sm-open aria-expanded="false"${onMore ? ' class="on"' : ''}>${icon('more')}<span>More</span></button>` : ''}</nav>`);

  // phones: the menu button and "More" open the sidebar as an 80% sheet with the page dimmed behind it
  SM_LINKS = P.pages.map(p => [p[2], pageFile(p[0]), p[1], p === cur]).concat([[isStaff(PORTAL) ? 'Sign out' : 'Log out', null, 'logout']]);
  // the phone top bar is white, so the status bar should be too
  const tc = $('meta[name="theme-color"]'); if (tc && matchMedia('(max-width: 900px)').matches) tc.content = '#FFFFFF';

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
    MC_REQS.filter(r => r.no === ME.no && r.status !== 'pending').slice(0, 2).forEach(r => rows.push(r.status === 'approved'
      ? (r.excused ? row('check', 'Absence excused', `${esc(r.passName)} · medical certificate kept on record`) : r.extend === false ? row('check', 'Lesson returned', `${esc(r.passName)} · one lesson added back`) : row('check', 'Package extended', `${esc(r.passName)} +${plural(r.days, 'day')} · now expires ${fmtDate(new Date(r.newExp))}`))
      : row('info', 'Extension not approved', `${esc(r.passName)}${r.reason ? ' · ' + esc(r.reason) : ''}`)));
    const next = BOOKINGS.slice().sort((a, b) => a.date - b.date)[0];
    const last = ATTENDANCE.find(a => a.status !== 'pending');
    if (last) rows.push(last.status === 'present'
      ? row('check', 'Session counted · +1', `${esc(last.type)} · ${dayName(last.date)} ${fmtShort(last.date)} · ${GRADE.sessions} of ${GRADE.needSessions} sessions toward ${esc(GRADE.target)}`)
      : row('info', 'Missed class · lesson used', `${esc(last.type)} · ${dayName(last.date)} ${fmtShort(last.date)} · not counted toward grading, no refund`));
    const nr = remarksForStudent(ME.name).find(r => daysBetween(r.at, TODAY) <= 7);
    if (nr) rows.push(row('doc', `Note from ${esc(nr.by)}`, `${esc(nr.label)} · ${esc(nr.text.length > 70 ? nr.text.slice(0, 70) + '…' : nr.text)}`, `<a class="sbtn" href="${pageFile('home')}">Read</a>`));
    if (next) rows.push(row('cal', 'Booking confirmed', `${next.c.type} · ${dayName(next.date)} ${fmtShort(next.date)} · ${timeLabel(next.c.time)} · HQ Dojo`));
    const f = activePasses()[0]; if (f && daysBetween(TODAY, f.expires) <= 30) rows.push(row('clock', 'Lessons expiring soon', `${plural(f.left, 'lesson')} in your ${esc(f.name)} expire on ${fmtDate(f.expires)}`));
    rows.push(row('award', 'Grading applications close 29 Nov', 'Adult grading on 13 Dec at HQ Dojo'));
  } else if (PORTAL === 'instructor') {
    const sh = examinerShift();
    if (sh) rows.push(row('award', 'Grading shift is open', `${esc(sh.venue)} · ${fmtDate(sh.date)} · ${sh.from}–${sh.to}. You are on the examiner panel, ${CANDIDATES.filter(c => !c.done).length} candidates to score.`, `<a class="sbtn dark" href="${pageFile('grading')}">Open grading</a>`));
    rows.push(row('flag', 'Low attendance', `${STUDENTS.filter(isDeclining).length} students not seen in 14+ days`));
    const wk = FEEDBACK.filter(f => f.ins === P.me[1] && daysBetween(f.date, TODAY) <= 7);
    if (wk.length) rows.push(row('star', 'New class feedback', `${plural(wk.length, 'rating')} from students this week. See your profile.`));
  } else {
    /* office portal: every figure is counted from the data. Front desk and Business Admin see different lists. */
    const mcp = MC_REQS.filter(r => r.status === 'pending').length;
    if (!isBA()) {
      rows.push(row('inbox', 'Incomplete registrations', `${plural(APPS.length, 'registration')} waiting to be activated`, `<a class="sbtn" href="${pageFile('applications')}">Open</a>`));
      rows.push(row('box', 'Items to collect', `${plural((DB.equipment || []).filter(e => e.status !== 'Handed over').length, 'order')} not handed over yet`, `<a class="sbtn" href="${pageFile('equipment')}">Open</a>`));
      rows.push(row('flag', 'Follow-ups due', `${plural((DB.followups || []).filter(f => !f.attempts.length).length, 'student')} not contacted yet`, `<a class="sbtn" href="${pageFile('followups')}">Open</a>`));
      if (mcp) rows.push(row('doc', 'Extension requests', `${plural(mcp, 'request')} with a medical certificate or compassion extension`, `<a class="sbtn" href="${pageFile('applications')}">Open</a>`));
    } else {
      rows.push(row('shield', 'Exceptions', `${plural((DB.exceptions || []).filter(x => x.status === 'pending').length, 'item')} sent by the front desk`, `<a class="sbtn" href="${pageFile('applications')}">Open</a>`));
      rows.push(row('card', 'Payment failures', `${plural((DB.ledger || []).filter(l => l.st === 'Failed').length, 'failed payment')}`, `<a class="sbtn" href="${pageFile('revenue')}">Open</a>`));
      rows.push(row('upload', 'Import issues', `${plural((DB.imports || []).filter(i => i.status === 'open').length, 'row')} need fixing`, `<a class="sbtn" href="${pageFile('imports')}">Open</a>`));
      rows.push(row('award', 'Promotion results', `${PROPOSALS.length} signed by instructors`, `<a class="sbtn" href="${pageFile('grading')}">Open</a>`));
    }
  }
  try { sessionStorage.setItem(seenKey, '1'); } catch (_) {}
  syncNotifDot();
  openModal(`<h3 id="modalTitle">Notifications</h3><div class="rows notif">${rows.join('') || '<p style="color:var(--muted)">You\'re all caught up.</p>'}</div>`);
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-notif]')) { openNotifs(); return; }
  const r = e.target.closest('[data-rate]'); if (r && typeof openRating === 'function') openRating(+r.dataset.rate);
});

if (ALLOWED && !GATED) { buildShell(); syncNotifDot(); }

/* runs the current page's setup from the portal's own script */
function runPage(map) { if (ALLOWED && !GATED && map[PAGE]) map[PAGE](); }