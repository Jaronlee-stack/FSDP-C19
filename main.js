/* =====================================================================
   AIKIDO SHINJU-KAI — main.js
   Vanilla JS. No build step. Sections:
   1  helpers            7  registration
   2  data               8  student portal
   3  router             9  instructor portal
   4  modal / drawer     10 admin portal
   5  react-bits ports   11 Ben chatbot
   6  public site        12 boot
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
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const mondayOf = d => { const x = startOfDay(d); const k = (x.getDay() + 6) % 7; return addDays(x, -k); };
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

/* ---------- 2. DATA ---------- */
const DOJOS = [
  { id: 'hq', name: 'ASK Headquarters Dojo', short: 'HQ', code: 'ASK HQ', region: 'Central', addr: 'Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630' },
  { id: 'bedok', name: 'ActiveSG Bedok Dojo', short: 'Bedok', code: 'BDAS', region: 'East', addr: 'Heartbeat@Bedok, 11 Bedok North Street 1, #01-02, Singapore 469662' },
  { id: 'tampines', name: 'Our Tampines Hub Dojo', short: 'Tampines', code: 'OTH', region: 'East', addr: '1 Tampines Walk, Singapore 528523' },
  { id: 'kovan', name: 'Paya Lebar Kovan Dojo', short: 'Kovan', code: 'PLKC', region: 'North East', addr: '207 Hougang Street 21, Singapore 530207' },
  { id: 'sengkang', name: 'ActiveSG Sengkang Dojo', short: 'Sengkang', code: 'SKAS', region: 'North East', addr: '57 Anchorvale Road, Singapore 544964' },
  { id: 'bishan', name: 'ActiveSG Bishan Dojo', short: 'Bishan', code: 'BSAS', region: 'Central', addr: '5 Bishan Street 14, Singapore 579783' },
  { id: 'toapayoh', name: 'SAFRA Toa Payoh Dojo', short: 'Toa Payoh', code: 'STPY', region: 'Central', addr: '293 Lorong 6 Toa Payoh, Singapore 319387' },
  { id: 'smu', name: 'SMU Dojo', short: 'SMU', code: 'SMUC', region: 'Central', addr: 'Singapore Management University, 81 Victoria Street, Singapore 188065' },
  { id: 'jurong', name: 'ActiveSG Jurong East Dojo', short: 'Jurong East', code: 'JEAS', region: 'West', addr: '21 Jurong East Street 31, Singapore 609517' },
  { id: 'westcoast', name: 'West Coast Dojo', short: 'West Coast', code: 'WCCC', region: 'West', addr: '2 Clementi West Street 2, Singapore 129605' },
  { id: 'woodlands', name: 'ActiveSG Woodlands Dojo', short: 'Woodlands', code: 'WDAS', region: 'North', addr: '2 Woodlands Street 12, Singapore 738599' },
  { id: 'chongpang', name: 'Chong Pang Dojo', short: 'Chong Pang', code: 'CPCC', region: 'North', addr: '109 Yishun Ring Road, Singapore 760109' },
  { id: 'tampineswest', name: 'Tampines West Dojo', short: 'Tampines W', code: 'TWCC', region: 'East', addr: '5 Tampines Avenue 3, Singapore 529705', status: 'Temporarily closed' }
];
const dojoName = id => (DOJOS.find(d => d.id === id) || {}).name || id;

const PKG = {
  adult: [
    { id: 'a10', t: '10 lessons', amt: 270, d: 'Good for 1 class a week', per: 'S$27 per lesson', lessons: 10 },
    { id: 'a25', t: '25 lessons', amt: 600, d: 'Most members start here', per: 'S$24 per lesson', lessons: 25, best: true },
    { id: 'a50', t: '50 lessons', amt: 980, d: 'For 2 or more classes a week', per: 'S$19.60 per lesson', lessons: 50 },
    { id: 'aun', t: 'Unlimited', amt: 96, unit: '/ 2 weeks', d: 'Book as many classes as you like', per: 'Billed every 2 weeks', lessons: Infinity }
  ],
  kids: [
    { id: 'k1', t: '1-month pass', amt: 150, d: 'Up to 4 sessions over 5 weeks', per: 'Try it out', lessons: 4 },
    { id: 'k6', t: '6-month pass', amt: 139, unit: '/ month', d: 'Up to 24 sessions', per: 'Billed monthly', lessons: 24, best: true },
    { id: 'k50', t: '50 lessons', amt: 1200, d: 'Valid 6 months', per: 'S$24 per lesson', lessons: 50 }
  ]
};

const DOGI_SIZES = ['000', '00', '0', '1', '2', '3', '4', '5', '6', '7'];

const INSTRUCTORS = [
  ['Philip Lee Shihan', '7th Dan', 'philip-lee.png', true], ['Chew Eng Lam Sensei', '6th Dan', 'chew-eng-lam.jpg'],
  ['James Moy Sensei', '6th Dan', 'james-moy.jpg'], ['Allan Lai Sensei', '6th Dan', 'allan-lai.jpg'],
  ['Bob Tan Sensei', '6th Dan', 'bob-tan.jpg'], ['Quah Yong Lok Sensei', '6th Dan', 'quah-yong-lok.jpg'],
  ['Annie Goh Sensei', '6th Dan', 'annie-goh.jpg'], ['Tan Kok Hiang Sensei', '6th Dan', 'tan-kok-hiang.jpg'],
  ['Ronald Tan Sensei', '5th Dan', 'ronald-tan.jpg'], ['Lim Cheen Cheen Sensei', '5th Dan', 'lim-cheen-cheen.jpg'],
  ['Aloyseus Lee Sensei', '5th Dan', 'aloyseus-lee.jpg'], ['Alexander Lee Sensei', '5th Dan', 'alexander-lee.jpg'],
  ['Tham Wai Yip Sensei', '5th Dan', 'tham-wai-yip.jpg'], ['Steven Goh Sensei', '5th Dan', 'steven-goh.jpg'],
  ['James Tan Sensei', '5th Dan', 'james-tan.jpg'], ['Billy Lim Sensei', '5th Dan', 'billy-lim.jpg'],
  ['Pang Kim Lock Sensei', '5th Dan', 'pang-kim-lock.jpg'], ['Robin Tan Sensei', '5th Dan', 'robin-tan.jpg']
];

/* weekly timetable template (day: 0 = Mon) */
const TIMES = ['09:00', '10:00', '11:00', '18:00', '19:00', '20:00'];
const timeLabel = t => { const h = +t.slice(0, 2); return (h % 12 || 12) + (h < 12 ? ' AM' : ' PM'); };
const CLASSES = [
  { day: 0, time: '19:00', type: 'Adults', dojo: 'hq', ins: 'Bob Tan Sensei', cap: 20, booked: 14 },
  { day: 0, time: '20:00', type: 'Mixed', dojo: 'kovan', ins: 'Robin Tan Sensei', cap: 15, booked: 8 },
  { day: 1, time: '18:00', type: 'Children Beginners', dojo: 'bishan', ins: 'Annie Goh Sensei', cap: 12, booked: 9, kids: true },
  { day: 1, time: '19:00', type: 'Adults', dojo: 'hq', ins: 'Bob Tan Sensei', cap: 20, booked: 17 },
  { day: 2, time: '19:00', type: 'Adults', dojo: 'hq', ins: 'James Tan Sensei', cap: 20, booked: 12 },
  { day: 2, time: '20:00', type: 'Intermediate', dojo: 'hq', ins: 'Bob Tan Sensei', cap: 16, booked: 11 },
  { day: 3, time: '18:00', type: 'Children Juniors', dojo: 'hq', ins: 'Lim Cheen Cheen Sensei', cap: 12, booked: 12, kids: true },
  { day: 3, time: '19:00', type: 'Adults', dojo: 'toapayoh', ins: 'Steven Goh Sensei', cap: 18, booked: 10 },
  { day: 4, time: '19:00', type: 'Adults', dojo: 'hq', ins: 'Bob Tan Sensei', cap: 20, booked: 15 },
  { day: 4, time: '20:00', type: 'Ladies', dojo: 'hq', ins: 'Annie Goh Sensei', cap: 14, booked: 6 },
  { day: 5, time: '09:00', type: 'Weapons', dojo: 'kovan', ins: 'Robin Tan Sensei', cap: 12, booked: 9 },
  { day: 5, time: '10:00', type: 'Children Beginners', dojo: 'hq', ins: 'Lim Cheen Cheen Sensei', cap: 14, booked: 10, kids: true },
  { day: 5, time: '11:00', type: 'Mixed', dojo: 'hq', ins: 'Bob Tan Sensei', cap: 20, booked: 13 },
  { day: 6, time: '09:00', type: 'Adults', dojo: 'hq', ins: 'Tan Kok Hiang Sensei', cap: 20, booked: 16 },
  { day: 6, time: '10:00', type: 'Children Juniors', dojo: 'westcoast', ins: 'Lim Cheen Cheen Sensei', cap: 12, booked: 7, kids: true }
];

const BELTS = [
  { g: '6th Kyu', c: '#FFFFFF' }, { g: '5th Kyu', c: '#E9C84A' }, { g: '4th Kyu', c: '#8B5A2B' },
  { g: '3rd Kyu', c: '#A0702F' }, { g: '2nd Kyu', c: '#6E4520' }, { g: '1st Kyu', c: '#4E3015' }, { g: '1st Dan', c: '#14161B' }
];
const beltOf = g => (BELTS.find(b => b.g === g) || { c: '#ccc' }).c;

const ME = { name: 'Lervyn Wong', no: 'ASK-2025-1834', grade: '4th Kyu', dojo: 'hq', credits: 18 };

const STUDENTS = [
  { n: 'Ahmad Karim', g: '4th Kyu', s: 29, need: 36, seen: 2, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Jamie Tan', g: '3rd Kyu', s: 38, need: 36, seen: 1, st: 'Qualified', dojo: 'hq', age: 'Adult' },
  { n: 'Ming Ng', g: '4th Kyu', s: 22, need: 36, seen: 4, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Priya Lee', g: '1st Kyu', s: 62, need: 60, seen: 3, st: 'Qualified', dojo: 'hq', age: 'Adult' },
  { n: 'David Koh', g: '5th Kyu', s: 14, need: 30, seen: 18, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Lervyn Wong', g: '4th Kyu', s: 29, need: 36, seen: 2, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Siti Rahman', g: '2nd Kyu', s: 44, need: 48, seen: 5, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Marcus Lim', g: '6th Kyu', s: 9, need: 24, seen: 21, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Hannah Teo', g: '5th Kyu', s: 31, need: 30, seen: 2, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Kenji Sato', g: '3rd Kyu', s: 20, need: 36, seen: 6, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Rachel Ong', g: '4th Kyu', s: 35, need: 36, seen: 1, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Arjun Nair', g: '6th Kyu', s: 4, need: 24, seen: 3, st: 'Studying', dojo: 'hq', age: 'Adult' },
  { n: 'Wei Jie Chua', g: '2nd Kyu', s: 50, need: 48, seen: 2, st: 'Qualified', dojo: 'hq', age: 'Adult' },
  { n: 'Grace Yeo', g: '5th Kyu', s: 18, need: 30, seen: 15, st: 'Studying', dojo: 'hq', age: 'Adult' }
];
const isDeclining = s => s.seen >= 14;

let APPS = [
  { n: 'Sarah Lee', dojo: 'hq', date: '1 Nov 2026', paid: 690, group: 'Adult', age: 27, gender: 'Female', nat: 'Singaporean', phone: '9001 2345', email: 'sarah.lee@email.com', ec: 'Daniel Lee (Spouse) · 9002 3456', exp: '—', prev: 'No', med: 'No', dogi: 'Cotton (Standard), size 3', pkg: '25 lessons' },
  { n: 'Raj Kumaran', dojo: 'kovan', date: '31 Oct 2026', paid: 375, group: 'Adult', age: 34, gender: 'Male', nat: 'Singapore PR', phone: '9123 9876', email: 'raj.k@email.com', ec: 'Meena Kumaran (Spouse) · 9765 4321', exp: 'Karate, 2 years · 7th Kyu', prev: 'No', med: 'Yes · Mild asthma, carries inhaler', dogi: 'Heavyweight Cotton, size 5', pkg: '10 lessons' },
  { n: 'Liu Wei', dojo: 'toapayoh', date: '30 Oct 2026', paid: 1100, group: 'Adult', age: 41, gender: 'Male', nat: 'Chinese', phone: '8234 5566', email: 'liu.wei@email.com', ec: 'Zhang Min (Spouse) · 8123 4455', exp: 'Aikido (Aikikai Beijing), 1st Kyu', prev: 'No', med: 'No', dogi: 'Competition Grade, size 4', pkg: '50 lessons' },
  { n: 'Emma Koh', dojo: 'bishan', date: '29 Oct 2026', paid: 240, group: 'Child', age: 9, gender: 'Female', nat: 'Singaporean', phone: '9345 6789', email: 'koh.family@email.com', ec: 'Jason Koh (Parent) · 9345 6789', exp: '—', prev: 'No', med: 'Yes · Peanut allergy', dogi: 'Cotton (Standard), size 0', pkg: '1-month pass' }
];

let MEMBERS = [
  { n: 'Lervyn Wong', no: 'ASK-2025-1834', g: '4th Kyu', dojo: 'hq', hrs: 61, st: 'Active', joined: 'Jun 2025' },
  { n: 'Jamie Tan', no: 'ASK-2024-0921', g: '3rd Kyu', dojo: 'hq', hrs: 112, st: 'Active', joined: 'Mar 2024' },
  { n: 'David Koh', no: 'ASK-2024-1440', g: '5th Kyu', dojo: 'hq', hrs: 28, st: 'Lapsed', joined: 'Aug 2024' },
  { n: 'Priya Lee', no: 'ASK-2021-0310', g: '1st Kyu', dojo: 'hq', hrs: 284, st: 'Active', joined: 'Jan 2021' },
  { n: 'Siti Rahman', no: 'ASK-2022-0788', g: '2nd Kyu', dojo: 'kovan', hrs: 176, st: 'Active', joined: 'May 2022' },
  { n: 'Marcus Lim', no: 'ASK-2026-0102', g: '6th Kyu', dojo: 'toapayoh', hrs: 9, st: 'Active', joined: 'Feb 2026' },
  { n: 'Grace Yeo', no: 'ASK-2023-1203', g: '5th Kyu', dojo: 'bishan', hrs: 41, st: 'Lapsed', joined: 'Dec 2023' },
  { n: 'Kenji Sato', no: 'ASK-2023-0456', g: '3rd Kyu', dojo: 'westcoast', hrs: 98, st: 'Active', joined: 'Apr 2023' },
  { n: 'Wei Jie Chua', no: 'ASK-2022-0090', g: '2nd Kyu', dojo: 'hq', hrs: 190, st: 'Active', joined: 'Jan 2022' },
  { n: 'Hannah Teo', no: 'ASK-2025-0612', g: '5th Kyu', dojo: 'tampines', hrs: 47, st: 'Active', joined: 'Jun 2025' }
];

let SESSIONS = CLASSES.map((c, i) => ({ ...c, code: `${DOJOS.find(d => d.id === c.dojo).short.toUpperCase().replace(/\s/g, '')}-${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][c.day]}${+c.time.slice(0, 2) % 12 || 12}-${(4821 + i * 137) % 9000 + 1000}` }));

let GRAD_APPS = [
  { n: 'Jamie Tan', from: '3rd Kyu', to: '2nd Kyu', dojo: 'hq', sub: '1 Nov', note: 'Weapons requirement met', sched: null },
  { n: 'Priya Lee', from: '1st Kyu', to: '1st Dan', dojo: 'hq', sub: '30 Oct', note: 'Yudansha points 2.5 / 2.0', sched: null },
  { n: 'Wei Jie Chua', from: '2nd Kyu', to: '1st Kyu', dojo: 'hq', sub: '28 Oct', note: 'Weapons requirement met', sched: null }
];
let PROPOSALS = [
  { n: 'Hannah Teo', from: '5th Kyu', to: '4th Kyu', by: 'Steven Goh Sensei', result: 'Pass', fb: 'Clean ukemi, good posture in ikkyo.' },
  { n: 'Siti Rahman', from: '2nd Kyu', to: '1st Kyu', by: 'Robin Tan Sensei', result: 'Pass with merit', fb: 'Excellent jo kata. Ready for yudansha track.' }
];
let CANDIDATES = [
  { n: 'Jamie Tan', from: '3rd Kyu', to: '2nd Kyu', done: false },
  { n: 'Priya Lee', from: '1st Kyu', to: '1st Dan', done: false },
  { n: 'Wei Jie Chua', from: '2nd Kyu', to: '1st Kyu', done: false }
];

/* ---------- 3. ROUTER ---------- */
const VIEWS = ['home', 'about', 'pass', 'join', 'login', 'student', 'instructor', 'admin'];
const inited = {};

function go(view, page) {
  const target = page ? `${view}-${page}` : view;
  if (location.hash.slice(1) === target) route(); else location.hash = target;
}

function route() {
  const raw = decodeURIComponent(location.hash.slice(1)) || 'home';
  let [view, page] = raw.split('-');
  let anchor = null;
  if (!VIEWS.includes(view)) { anchor = raw; view = 'home'; page = null; }
  if (view === 'about' && page) anchor = 'ab-' + page;
  document.body.dataset.view = view;

  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + view));
  $$('#demo button').forEach(b => b.classList.toggle('on', b.dataset.go === view));
  closeSM(); closeModal(); closeDrawer();

  if (!inited[view]) { inited[view] = true; (INIT[view] || (() => {}))(); }
  if (['student', 'instructor', 'admin'].includes(view)) showPage(view, page || defaultPage[view]);
  if (view === 'pass') passPreset(page);

  const scroller = () => {
    if (anchor) { const el = document.getElementById(anchor); if (el) { el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); } }
    else window.scrollTo(0, 0);
  };
  requestAnimationFrame(() => { scroller(); animateIn($('#v-' + view)); });
}

const defaultPage = { student: 'home', instructor: 'today', admin: 'dashboard' };
const PAGE_NAMES = {
  student: { home: 'Home', book: 'Book a class', packages: 'Packages', grading: 'Grading', payments: 'Payments', profile: 'Profile' },
  instructor: { today: 'Today', students: 'My students', timetable: 'Timetable', grading: 'Grading', profile: 'Profile' },
  admin: { dashboard: 'Overview', applications: 'Applications', members: 'Members', sessions: 'Sessions', grading: 'Grading', payments: 'Payments', notify: 'Notifications', reports: 'Reports' }
};

function showPage(view, page) {
  const root = $('#v-' + view);
  if (!PAGE_NAMES[view][page]) page = defaultPage[view];
  $$('.page', root).forEach(p => p.classList.toggle('on', p.dataset.page === page));
  $$('.rail nav button', root).forEach(b => b.classList.toggle('on', b.dataset.page === page));
  $('[data-crumb]', root).textContent = PAGE_NAMES[view][page];
  const hook = PAGE_HOOK[`${view}-${page}`];
  if (hook) hook();
  requestAnimationFrame(() => animateIn($(`.page[data-page="${page}"]`, root)));
}
const PAGE_HOOK = {};

document.addEventListener('click', e => {
  const goBtn = e.target.closest('[data-go]');
  if (goBtn) { e.preventDefault(); go(goBtn.dataset.go); return; }
  const railBtn = e.target.closest('.rail nav button[data-page]');
  if (railBtn) { const v = railBtn.closest('.view').id.slice(2); go(v, railBtn.dataset.page); return; }
  const link = e.target.closest('[data-page-link]');
  if (link) { const v = link.closest('.view').id.slice(2); go(v, link.dataset.pageLink); }
});
window.addEventListener('hashchange', route);

/* ---------- 4. MODAL / DRAWER ---------- */
let lastFocus = null;
function openModal(html, wide = false) {
  lastFocus = document.activeElement;
  $('#modalBody').innerHTML = html;
  enhance($('#modalBody'));
  $('#modal .modal').classList.toggle('wide', wide);
  $('#modal').classList.add('open');
  $('#modal').setAttribute('aria-hidden', 'false');
  setTimeout(() => ($('#modalBody [autofocus]') || $('#modal .modal-x')).focus(), 50);
}
function closeModal() {
  if (!$('#modal').classList.contains('open')) return;
  $('#modal').classList.remove('open');
  $('#modal').setAttribute('aria-hidden', 'true');
  lastFocus && lastFocus.focus && lastFocus.focus();
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
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); closeDrawer(); closeSM(); closeBen(); } });

/* ---------- 5. REACT BITS PORTS ---------- */

/* AnimatedContent — slide + blur in on scroll, with optional stagger */
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
        // already on screen: quick staggered entrance from a visible state
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

/* CountUp — counts when scrolled into view */
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

/* ProfileCard — tilt, glare and holo foil that follow the pointer */
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
    const r = el.getBoundingClientRect();
    s.tx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    s.ty = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height) * 2 - 1));
    s.ta = 1; wake();
  };
  if (reduce) return;
  el.addEventListener('pointermove', aim);
  el.addEventListener('pointerenter', aim);
  el.addEventListener('pointerleave', () => { s.tx = 0; s.ty = 0; s.ta = 0; wake(); });
  // intro: catch the light once
  s.x = 0.62; s.y = -0.55; s.a = 1; write(); wake();
}

/* StaggeredMenu */
const SM_ITEMS = {
  home: [['About', '#about'], ['Classes', '#classes'], ['Fees', '#pricing'], ['Instructors', '#instructors'], ['Dojos', '#find'], ['Book a trial', '#pass-trial'], ['Join now', '#join'], ['Log in', '#login']]
};
function openSM() {
  const view = (location.hash.slice(1).split('-')[0]) || 'home';
  let items = SM_ITEMS.home;
  if (PAGE_NAMES[view]) items = Object.entries(PAGE_NAMES[view]).map(([k, v]) => [v, `#${view}-${k}`]).concat([['Log out', '#home']]);
  $('#smList').innerHTML = items.map(([l, h], i) => `<li><a href="${h}" style="--i:${i}">${esc(l)}</a></li>`).join('');
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

/* LogoLoop — dojo names, slows on hover, drag and fling */
function logoLoop(el, names) {
  const track = $('.loop-track', el);
  const one = names.map(n => `<span class="loop-item">${esc(n)}</span>`).join('');
  track.innerHTML = one + one + one;
  const SPEED = 38, HOVER = 8;
  let x = 0, v = SPEED, target = SPEED, last = performance.now(), drag = null;
  el.addEventListener('pointerenter', () => target = HOVER);
  el.addEventListener('pointerleave', () => { target = SPEED; });
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, start: x, t: performance.now(), lastX: e.clientX }; el.classList.add('drag'); el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!drag) return;
    const now = performance.now();
    v = -(e.clientX - drag.lastX) / Math.max(1, now - drag.t) * 1000;
    drag.t = now; drag.lastX = e.clientX;
    x = drag.start - (e.clientX - drag.x);
  });
  const end = () => { if (!drag) return; drag = null; el.classList.remove('drag'); v = Math.max(-3000, Math.min(3000, v)); };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  const tick = now => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!drag) { v += (target - v) * (1 - Math.exp(-dt / 0.45)); x += v * dt; }
    const third = track.scrollWidth / 3;
    if (third) { x = ((x % third) + third) % third; }
    track.style.transform = `translate3d(${-x}px,0,0)`;
    requestAnimationFrame(tick);
  };
  if (!reduce) requestAnimationFrame(tick);
}

/* PeekRating */
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
    if (hover !== null) {
      const slot = row.clientWidth / 5;
      tip.textContent = labels[hover];
      tip.style.transform = `translate(calc(${slot * (hover + 0.5)}px - 50%),0)`;
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

/* SlideCommit — drag to confirm a payment */
function slideCommit(el, onDone, canCommit) {
  const knob = $('.knob', el), fill = $('.fill', el), lbl = $('.lbl em', el);
  const original = lbl.textContent;
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
    el.classList.add('done'); lbl.textContent = 'Processing…'; lbl.style.opacity = 1;
    knob.innerHTML = '<svg class="ic"><use href="#i-check"/></svg>';
    setTimeout(() => { lbl.textContent = 'Paid'; onDone(); }, 900);
  };
  knob.addEventListener('pointerdown', e => { if (done) return; dragging = true; start = e.clientX - x; knob.setPointerCapture(e.pointerId); });
  knob.addEventListener('pointermove', e => { if (dragging) set(e.clientX - start); });
  const up = () => { if (!dragging) return; dragging = false; if (x / max() > 0.88) { if (canCommit && !canCommit()) set(0, true); else finish(); } else set(0, true); };
  knob.addEventListener('pointerup', up); knob.addEventListener('pointercancel', up);
  knob.addEventListener('keydown', e => { if (!done && (e.key === 'Enter' || e.key === 'ArrowRight' || e.key === ' ')) { e.preventDefault(); if (!canCommit || canCommit()) finish(); } });
  el.reset = () => { done = false; el.classList.remove('done'); lbl.textContent = original; knob.innerHTML = '<svg class="ic"><use href="#i-arrow"/></svg>'; set(0, false); };
  set(0, false);
  return el;
}

/* CodeSlots — 6-digit code with slot-machine digits */
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

/* endless instructor carousel (right → left, slows on hover) */
function marquee(root, track) {
  const B = 'https://aikidoshinjukai.com.sg/images/instructors/';
  const card = ([n, d, img, shihan]) => `<article class="ins${shihan ? ' shihan' : ''}"><div class="ph"><img src="${B + img}" alt="${esc(n)}" loading="lazy" onerror="this.remove()"><span class="ini" aria-hidden="true">${initials(n)}</span></div><div class="meta"><span class="nm">${esc(n)}</span><span class="dan">${d}</span></div></article>`;
  const html = INSTRUCTORS.map(card).join('');
  track.innerHTML = html + html;
  $$('.ins', track).forEach((el, i) => { if (i >= INSTRUCTORS.length) el.setAttribute('aria-hidden', 'true'); });
  const FAST = reduce ? 0 : 55, SLOW = reduce ? 0 : 12;
  let speed = FAST, target = FAST, x = 0, last = performance.now();
  root.addEventListener('mouseenter', () => target = SLOW);
  root.addEventListener('mouseleave', () => target = FAST);
  const tick = now => {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    speed += (target - speed) * Math.min(1, dt * 4);
    const half = track.scrollWidth / 2;
    x -= speed * dt; if (half && -x >= half) x += half;
    track.style.transform = `translate3d(${x}px,0,0)`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/* ---------- 6. PUBLIC SITE ---------- */
function initHome() {
  logoLoop($('#dojoLoop'), DOJOS.filter(d => !d.status).map(d => d.name).concat(['Shanghai', 'Johor Bahru', 'Batam']));
  marquee($('#marquee'), $('#mqTrack'));
  initDojos();
  $$('#v-home .qa button').forEach(b => b.addEventListener('click', () => {
    const open = b.parentElement.classList.toggle('open'); b.setAttribute('aria-expanded', open);
  }));
}

/* ---------- 7. REGISTRATION ---------- */
const reg = { step: 1, verified: false, age: null, group: 'adult' };
const val = id => ($('#' + id).value || '').trim();
const radio = name => { const r = $(`input[name="${name}"]:checked`); return r ? r.value : ''; };
const phoneOk = v => /^[689]\d{7}$/.test(v.replace(/\s/g, ''));
const emailOk = v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

function fldOf(el) { return el.closest('.fld'); }
function mark(el, bad) { const f = typeof el === 'string' ? $(el) : el; if (f) f.classList.toggle('invalid', bad); return !bad; }

function initJoin() {
  // dojo choices
  $('#dojoChoices').innerHTML = DOJOS.filter(d => !d.status).map(d => `<div class="choice"><input type="radio" name="dojo" id="dj-${d.id}" value="${d.id}"><label for="dj-${d.id}"><span class="top"><span class="t">${esc(d.name)}</span><span class="tick">${icon('check')}</span></span><span class="d">${esc(d.addr)}</span></label></div>`).join('');
  // dogi sizes
  $('#sizePick').innerHTML = DOGI_SIZES.map(s => `<div class="choice"><input type="radio" name="size" id="sz-${s}" value="${s}"><label for="sz-${s}">${s}</label></div>`).join('');

  // age from DOB → class options, packages, hints
  $('#r-dob').addEventListener('change', updateAge);
  $$('input[name="gender"]').forEach(r => r.addEventListener('change', updateClasses));

  // conditional fields
  const bindYN = (name, reveal) => $$(`input[name="${name}"]`).forEach(r => r.addEventListener('change', () => {
    $(reveal).classList.toggle('open', radio(name) === 'Yes');
    mark('#f-' + name, false);
  }));
  bindYN('prev', '#prevReveal'); bindYN('med', '#medReveal');

  // clear errors while typing
  $('#regForm').addEventListener('input', e => { const f = fldOf(e.target); if (f) f.classList.remove('invalid'); });
  $('#regForm').addEventListener('change', e => {
    if (e.target.dataset.iso) { const f = fldOf(e.target); f && f.classList.remove('invalid'); }
    if (e.target.name === 'dojo') mark('#f-dojo', false);
    if (e.target.name === 'dogi') mark('#f-dogi', false);
    if (e.target.name === 'size') mark(fldOf($('#sizePick')), false);
    if (e.target.name === 'pkg') mark('#f-pkg', false);
  });

  // email verification (CodeSlots)
  const send = $('#sendCode');
  $('#r-email').addEventListener('input', () => {
    if (reg.verified) { reg.verified = false; $('#emailOk').hidden = true; send.hidden = false; }
    $('#otpReveal').classList.remove('open');
  });
  send.addEventListener('click', () => {
    const v = val('r-email');
    if (!emailOk(v)) { mark(fldOf($('#r-email')), true); $('#emailErr').textContent = 'Enter a valid email address first.'; $('#r-email').focus(); return; }
    $('#otpTo').textContent = v;
    $('#otpReveal').classList.add('open');
    $('#slots').reset();
    send.textContent = 'Code sent';
    setTimeout(() => { send.textContent = 'Resend'; }, 2500);
    setTimeout(() => $('#otpInput').focus(), 250);
    toast(`Code sent to ${v}`, 'info');
  });
  $('#resend').addEventListener('click', () => { $('#slots').reset(); toast('New code sent', 'info'); $('#otpInput').focus(); });
  codeSlots($('#slots'), () => {
    reg.verified = true;
    $('#otpReveal').classList.remove('open');
    $('#emailOk').hidden = false; send.hidden = true;
    mark(fldOf($('#r-email')), false);
    toast('Email verified');
  });

  // step nav
  $$('#regForm [data-next]').forEach(b => b.addEventListener('click', () => { if (validateStep(reg.step)) setStep(reg.step + 1); }));
  $$('#regForm [data-prev]').forEach(b => b.addEventListener('click', () => setStep(reg.step - 1)));
  $('#regForm').addEventListener('submit', e => e.preventDefault());

  // T&C — must scroll to the end before the box unlocks
  const body = $('#tcBody');
  body.addEventListener('scroll', () => {
    const max = body.scrollHeight - body.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.round(body.scrollTop / max * 100)) : 100;
    $('#tcBar').style.width = pct + '%';
    $('#tcPct').textContent = pct + '% read';
    if (pct >= 98 && $('#tcAgree').disabled) {
      $('#tcAgree').disabled = false;
      $('#tcAgreeWrap').classList.remove('locked');
      $('#tcAgreeHint').textContent = 'Thanks for reading. You can agree now.';
      $('#tcFade').classList.add('read');
    }
  });
  ['tcAgree', 'pdpa'].forEach(id => $('#' + id).addEventListener('change', updatePayLock));

  slideCommit($('#regSlide'), completeRegistration);

  $('#mailTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-mail]'); if (!b) return;
    $$('#mailTabs .fpill').forEach(x => x.classList.toggle('on', x === b));
    renderMail(b.dataset.mail);
  });

  updateClasses(); renderPackages(); setStep(1);
}

function updateAge() {
  const v = $('#r-dob').dataset.iso;
  if (!v) { reg.age = null; $('#r-age').value = ''; updateClasses(); return; }
  const [yy, mm, dd] = v.split('-').map(Number);
  const d = new Date(yy, mm - 1, dd), now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  reg.age = age;
  $('#r-age').value = age >= 0 ? `${age} years old` : '';
  const kid = age < 13;
  reg.group = kid ? 'kids' : 'adult';
  $('#ageHint').textContent = age < 4 ? 'Members must be at least 4.' : kid ? 'Children\'s classes and fees apply (ages 4–12).' : age < 21 ? 'Adult class. Under 21: please go through the terms with a parent or guardian.' : 'Adult classes and fees apply.';
  mark(fldOf($('#r-dob')), age < 4);
  updateClasses(); renderPackages();
}

function updateClasses() {
  const age = reg.age, female = radio('gender') === 'Female';
  let opts;
  if (age !== null && age < 13) opts = [age <= 6 ? 'Children Juniors (ages 4–6)' : null, 'Children Beginners (ages 4–12)', 'Mixed (all ages)'].filter(Boolean);
  else opts = ['Adults (13 & above)', 'Mixed (all ages)'].concat(female ? ['Ladies'] : []);
  const cur = $('#r-class').value;
  $('#r-class').innerHTML = opts.map(o => `<option${o === cur ? ' selected' : ''}>${o}</option>`).join('');
  $('#classHint').textContent = age === null ? 'Enter your date of birth to see the right classes.' : 'Suggested from your age. You can switch later.';
}

function renderPackages() {
  const list = PKG[reg.group];
  $('#pkgGroupTitle').textContent = reg.group === 'kids' ? 'Children packages' : 'Adult packages';
  const cur = radio('pkg');
  $('#pkgChoices').innerHTML = list.map(p => `<div class="choice"><input type="radio" name="pkg" id="pk-${p.id}" value="${p.id}"${p.id === cur ? ' checked' : ''}><label for="pk-${p.id}"><span class="top"><span class="t">${p.t}${p.best ? ' <span class="pill navy plain" style="margin-left:6px;height:20px;font-size:11px">Popular</span>' : ''}</span><span class="tick">${icon('check')}</span></span><span class="d">${p.d}</span><span class="price num">${money(p.amt)}<small style="font-size:13px;font-weight:500;color:var(--muted)"> ${p.unit || ''}</small></span><span class="d">${p.per}</span></label></div>`).join('');
}

function validateStep(n) {
  const bad = [];
  const need = (cond, el) => { mark(el, !cond); if (!cond) bad.push(el); };
  if (n === 1) {
    need(!!val('r-name'), fldOf($('#r-name')));
    need(!!radio('gender'), fldOf($('#g-m')));
    need(!!val('r-nat'), fldOf($('#r-nat')));
    need(reg.age !== null && reg.age >= 4, fldOf($('#r-dob')));
    need(phoneOk(val('r-phone')), fldOf($('#r-phone')));
    const ef = fldOf($('#r-email'));
    if (!emailOk(val('r-email'))) { $('#emailErr').textContent = 'Enter a valid email address.'; need(false, ef); }
    else if (!reg.verified) { $('#emailErr').textContent = 'Verify your email with the 6-digit code before continuing.'; need(false, ef); }
    else mark(ef, false);
    need(!!val('r-ecname'), fldOf($('#r-ecname')));
    need(!!val('r-ecrel'), fldOf($('#r-ecrel')));
    need(phoneOk(val('r-ecphone')), fldOf($('#r-ecphone')));
  }
  if (n === 2) {
    need(!!radio('prev'), $('#f-prev'));
    if (radio('prev') === 'Yes') need(!!$('#r-prevdate').dataset.iso, fldOf($('#r-prevdate')));
    need(!!radio('med'), $('#f-med'));
    if (radio('med') === 'Yes') need(!!val('r-med'), fldOf($('#r-med')));
  }
  if (n === 3) {
    need(!!radio('dojo'), $('#f-dojo'));
    need(!!$('#r-class').value, fldOf($('#r-class')));
    need(!!radio('dogi'), $('#f-dogi'));
    need(!!radio('size'), fldOf($('#sizePick')));
  }
  if (n === 4) need(!!radio('pkg'), $('#f-pkg'));
  if (bad.length) {
    const first = bad[0];
    first.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    const focusable = $('.cs-btn, input:not([type=radio]):not([type=checkbox]):not([readonly]):not(.cap), textarea', first);
    focusable && setTimeout(() => focusable.focus({ preventScroll: true }), 300);
    toast(bad.length === 1 ? 'One field needs your attention.' : `${bad.length} fields need your attention.`, 'bad');
    return false;
  }
  return true;
}

function setStep(n) {
  reg.step = Math.max(1, Math.min(6, n));
  $$('#regForm .rstep').forEach(s => s.classList.toggle('on', +s.dataset.step === reg.step));
  $$('#regSteps li').forEach(li => {
    const s = +li.dataset.s;
    li.classList.toggle('on', s === reg.step);
    li.classList.toggle('done', s < reg.step);
  });
  $('#regProg').style.width = Math.min(100, reg.step / 5 * 100) + '%';
  $('#regMobileStep').textContent = reg.step <= 5 ? `Step ${reg.step} of 5` : 'Complete';
  if (reg.step === 5) { buildReview(); updatePayLock(); }
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

function regData() {
  const pkg = PKG[reg.group].find(p => p.id === radio('pkg')) || PKG.adult[1];
  const dogiEl = $('input[name="dogi"]:checked');
  return {
    name: val('r-name'), gender: radio('gender'), nat: val('r-nat'), dob: val('r-dob'), age: reg.age,
    phone: val('r-phone'), email: val('r-email'), ec: `${val('r-ecname')} (${val('r-ecrel')}) · ${val('r-ecphone')}`,
    exp: [val('r-exp'), val('r-grade')].filter(Boolean).join(' · ') || 'None',
    prev: radio('prev') === 'Yes' ? `Yes · joined ${val('r-prevdate')}` : 'No',
    med: radio('med') === 'Yes' ? `Yes · ${val('r-med')}` : 'No',
    dojo: radio('dojo'), cls: $('#r-class').value,
    dogi: dogiEl ? dogiEl.value : '', dogiPrice: dogiEl ? +dogiEl.dataset.price : 0, size: radio('size'),
    pkg, mkt: $('#mkt').checked
  };
}
const FEE_REG = 12, FEE_DUES = 48;
function feeLines(d) {
  return [
    ['Registration', 'Student handbook and membership book', FEE_REG],
    ['Annual dues · Year 1', 'Renews 12 months from today', FEE_DUES],
    [`Dogi · ${d.dogi}`, `Size ${d.size}`, d.dogiPrice],
    [`Lessons · ${d.pkg.t}`, d.pkg.unit ? `First payment, then ${d.pkg.unit.replace('/', 'every').trim()}` : d.pkg.per, d.pkg.amt]
  ];
}

function buildReview() {
  const d = regData();
  const items = [['Name', d.name], ['Gender', d.gender], ['Date of birth', `${d.dob} (age ${d.age})`], ['Nationality', d.nat], ['Mobile', d.phone], ['Email', d.email + ' · verified'], ['Emergency contact', d.ec], ['Martial arts experience', d.exp], ['Previous ASK member', d.prev], ['Medical history', d.med], ['Principal dojo', dojoName(d.dojo)], ['Class', d.cls]];
  $('#review').innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  const lines = feeLines(d);
  const total = lines.reduce((a, l) => a + l[2], 0);
  reg.total = total;
  $('#fees').innerHTML = lines.map(([t, s, a]) => `<div><span>${esc(t)}<small>${esc(s)}</small></span><span>${money(a)}</span></div>`).join('') + `<div class="total"><span>Total due today</span><span>${money(total)}</span></div>`;
  $('#regSlideLbl').textContent = `Slide to pay ${money(total)}`;
}

function updatePayLock() {
  const ok = $('#tcAgree').checked && $('#pdpa').checked;
  $('#regSlide').classList.toggle('locked', !ok);
  $('#payHint').textContent = ok ? 'Payment unlocked. Drag the button to the right.' : 'Read the terms to the end, tick both required boxes, then slide to pay.';
}

function completeRegistration() {
  const d = regData();
  const no = `ASK-${new Date().getFullYear()}-${String(Math.floor(2000 + Math.random() * 7000))}`;
  const joined = fmtDate(new Date());
  reg.done = { ...d, no, joined, inv: 'INV-' + Date.now().toString().slice(-7) };
  $('#memNo').textContent = no;
  $('#joinedOn').textContent = joined;
  $('#doneEmail').textContent = d.email;
  $('#donePaid').textContent = money(reg.total);
  $('#doneDojo').textContent = dojoName(d.dojo);
  renderMail('welcome');
  // the new member appears in the admin queue
  APPS.unshift({ n: d.name, dojo: d.dojo, date: joined, paid: reg.total, group: reg.group === 'kids' ? 'Child' : 'Adult', age: d.age, gender: d.gender, nat: d.nat, phone: d.phone, email: d.email, ec: d.ec, exp: d.exp, prev: d.prev, med: d.med, dogi: `${d.dogi}, size ${d.size}`, pkg: d.pkg.t, isNew: true, no });
  setStep(6);
  toast('Payment received. Welcome to Shinju-Kai.');
}

function renderMail(kind) {
  const d = reg.done; if (!d) return;
  const first = d.name.split(' ')[0];
  if (kind === 'welcome') {
    $('#mailView').innerHTML = `<div class="mail-h"><b>Welcome to Aikido Shinju-Kai, ${esc(first)}</b><span>From: hq@aikidoshinjukai.com.sg · To: ${esc(d.email)}</span></div>
      <div class="mail-b">
        <p>Hi ${esc(first)},</p>
        <p>Thank you for joining Aikido Shinju-Kai. Your membership is active and your lessons are ready to book.</p>
        <div class="kv" style="margin:4px 0"><div><span>Membership no.</span><span class="num">${d.no}</span></div><div><span>Date joined</span><span>${d.joined}</span></div><div><span>Principal dojo</span><span>${esc(dojoName(d.dojo))}</span></div><div><span>Class</span><span>${esc(d.cls)}</span></div></div>
        <div class="note"><svg class="ic"><use href="#i-id"/></svg><span><b>Collect your student card</b> at ${esc(dojoName(d.dojo))} on your first lesson. Your dogi (size ${esc(d.size)}) will be ready there too.</span></div>
        <p>Log in to the student portal with this email to book your first class. Arrive 15 minutes early and bring water.</p>
        <p>See you on the mat,<br><b>HQ Office, Aikido Shinju-Kai</b></p>
      </div>`;
  } else {
    const lines = feeLines(d);
    $('#mailView').innerHTML = `<div class="mail-h"><b>Your receipt · ${d.inv}</b><span>From: payments@aikidoshinjukai.com.sg · To: ${esc(d.email)}</span></div>
      <div class="mail-b">
        <div class="receipt-head"><div><b style="font-size:16px">Aikido Shinju-Kai</b><p style="color:var(--muted);font-size:13px">Thomson V One, 9 Sin Ming Road #B1-02, Singapore 575630</p></div><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt=""></div>
        <div class="kv" style="margin:0"><div><span>Receipt no.</span><span class="num">${d.inv}</span></div><div><span>Date</span><span>${d.joined}</span></div><div><span>Member</span><span>${esc(d.name)} · ${d.no}</span></div><div><span>Paid by</span><span>Visa •••• 4242 (Stripe)</span></div></div>
        <div class="fees">${lines.map(([t, s, a]) => `<div><span>${esc(t)}<small>${esc(s)}</small></span><span>${money(a)}</span></div>`).join('')}<div class="total"><span>Total paid</span><span>${money(reg.total)}</span></div></div>
        <p style="font-size:12px;color:var(--muted)">Registration and membership fees are non-refundable.</p>
      </div>`;
  }
}

/* ---------- 8. STUDENT PORTAL ---------- */
const stu = { credits: ME.credits, week: 0, dojo: 'all', booked: new Set(), upcoming: [] };

function classDate(weekOffset, day) { return addDays(mondayOf(TODAY), weekOffset * 7 + day); }
function slotKey(weekOffset, c) { return `${weekOffset}|${c.day}|${c.time}|${c.dojo}`; }

function initStudent() {
  const h = new Date().getHours();
  $('#greet').textContent = `Good ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}, Lervyn.`;
  profileCard($('#studentCard'));

  // belt path (gamified) vs bar
  const nowIdx = BELTS.findIndex(b => b.g === ME.grade);
  $('#beltPath').innerHTML = BELTS.map((b, i) => `${i ? `<span class="link${i <= nowIdx ? ' done' : ''}"></span>` : ''}<div class="node${i < nowIdx ? ' done' : i === nowIdx ? ' now' : ''}" style="--belt:${b.c}"><i></i><span>${b.g}${i === nowIdx ? '<br>You' : ''}</span></div>`).join('');
  $('#progToggle').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    $$('#progToggle button').forEach(x => x.classList.toggle('on', x === b));
    const bar = b.dataset.v === 'bar';
    $('#progPath').hidden = bar; $('#progBar').hidden = !bar;
    if (bar) $$('#progBar .bar i').forEach(i => requestAnimationFrame(() => i.style.width = i.dataset.w + '%'));
  });

  peekRating($('#peek'), v => { $('#rateSend').disabled = !v; });
  $('#rateSend').addEventListener('click', () => { toast('Thanks. Your feedback went to Bob Tan Sensei.'); $('#rateSend').disabled = true; $('#rateSend').textContent = 'Feedback sent'; });

  // upcoming: two booked classes in the next days
  const pick = (offsetDays) => {
    const d = addDays(TODAY, offsetDays), day = (d.getDay() + 6) % 7;
    const c = CLASSES.find(x => x.day === day && x.dojo === 'hq' && !x.kids) || CLASSES.find(x => x.day === day && !x.kids);
    if (!c) return null;
    const wk = Math.floor((startOfDay(d) - mondayOf(TODAY)) / 864e5 / 7);
    stu.booked.add(slotKey(wk, c));
    return { c, date: d, key: slotKey(wk, c) };
  };
  stu.upcoming = [pick(2), pick(5)].filter(Boolean);
  renderUpcoming();

  // booking grid
  $('#dojoFilter').innerHTML = [['all', 'All dojos']].concat(DOJOS.filter(d => CLASSES.some(c => c.dojo === d.id)).map(d => [d.id, d.short])).map(([id, n]) => `<button class="fpill${id === 'all' ? ' on' : ''}" data-dojo="${id}">${n}</button>`).join('');
  $('#dojoFilter').addEventListener('click', e => { const b = e.target.closest('[data-dojo]'); if (!b) return; stu.dojo = b.dataset.dojo; $$('#dojoFilter .fpill').forEach(x => x.classList.toggle('on', x === b)); renderBook(); });
  $('#wkPrev').addEventListener('click', () => { stu.week = Math.max(0, stu.week - 1); renderBook(); });
  $('#wkNext').addEventListener('click', () => { stu.week = Math.min(4, stu.week + 1); renderBook(); });
  $('#bookGrid').addEventListener('click', e => { const b = e.target.closest('.slotb'); if (b) openBooking(b.dataset.i); });
  renderBook();

  // packages
  const pk = (p, kids) => `<article class="pkg${p.best ? ' best' : ''}"><span class="t">${p.t}</span><span class="amt">${money(p.amt)} <small>${p.unit || ''}</small></span><span class="d">${p.d}</span><span class="per">${p.per}</span><button class="sbtn${p.best ? '' : ' dark'}" data-buy="${p.id}">${p.lessons === Infinity ? 'Subscribe' : 'Buy'}</button></article>`;
  $('#pkgAdult').innerHTML = PKG.adult.map(p => pk(p)).join('');
  $('#pkgKids').innerHTML = PKG.kids.map(p => pk(p, true)).join('');
  $('#v-student').addEventListener('click', e => { const b = e.target.closest('[data-buy]'); if (b) openBuy(b.dataset.buy); });

  // payments
  const pays = [
    ['25 lessons', '15 Sep 2026', 'Visa •••• 4242', 600, 'Paid'],
    ['Annual dues 2026', '2 Jan 2026', 'Visa •••• 4242', 48, 'Paid'],
    ['10 lessons', '20 Nov 2025', 'PayNow', 270, 'Paid'],
    ['Registration, dogi and 10 lessons', '14 Jun 2025', 'Visa •••• 4242', 375, 'Paid']
  ];
  $('#payRows').innerHTML = pays.map((p, i) => `<tr><td><b>${p[0]}</b></td><td>${p[1]}</td><td>${p[2]}</td><td class="num">${money(p[3])}</td><td><span class="pill ok">${p[4]}</span></td><td><button class="sbtn" data-rcpt="${i}">${icon('receipt')}Receipt</button></td></tr>`).join('');
  $('#payRows').addEventListener('click', e => {
    const b = e.target.closest('[data-rcpt]'); if (!b) return;
    const p = pays[+b.dataset.rcpt];
    openModal(`<h3 id="modalTitle">Receipt</h3><p class="sub">${p[0]}</p><div class="kv"><div><span>Receipt no.</span><span class="num">INV-${2041870 + +b.dataset.rcpt * 311}</span></div><div><span>Date</span><span>${p[1]}</span></div><div><span>Member</span><span>${ME.name} · ${ME.no}</span></div><div><span>Paid by</span><span>${p[2]}</span></div><div><span>Amount</span><span>${money(p[3])}</span></div></div><div class="acts"><button class="sbtn dark" data-close>${icon('download')}Save PDF</button></div>`);
  });

  $('#profileForm').addEventListener('submit', e => { e.preventDefault(); toast('Profile saved'); });
  $('#pwBtn').addEventListener('click', () => openModal(`<h3 id="modalTitle">Change password</h3><p class="sub">Use at least 8 characters.</p><form id="pwForm" style="display:grid;gap:14px;margin-top:18px" novalidate><div class="fld"><label for="pw1">Current password</label><input id="pw1" type="password" autofocus></div><div class="fld"><label for="pw2">New password</label><input id="pw2" type="password"><span class="err">At least 8 characters.</span></div><button class="sbtn dark" type="submit" style="justify-self:start">Update password</button></form>`));
  document.addEventListener('submit', e => {
    if (e.target.id !== 'pwForm') return; e.preventDefault();
    if ($('#pw2').value.length < 8) { fldOf($('#pw2')).classList.add('invalid'); return; }
    closeModal(); toast('Password updated');
  });

  $('#v-student').addEventListener('click', e => { if (e.target.closest('[data-qr]')) openCheckIn(); });
  $('#gradeForm').addEventListener('submit', e => e.preventDefault());
}

function renderUpcoming() {
  $('#upcoming').innerHTML = stu.upcoming.length ? stu.upcoming.map((u, i) => `<div class="sess"><div class="date"><span>${DAY[u.date.getDay()]}</span><b>${u.date.getDate()}</b></div><div><div class="t">${u.c.type} · ${timeLabel(u.c.time)}</div><div class="d">${dojoName(u.c.dojo)} · ${u.c.ins}</div></div><button class="sbtn" data-cancel="${i}">Cancel</button></div>`).join('') : '<p style="color:var(--muted);font-size:14px">No classes booked yet.</p>';
  $$('#upcoming [data-cancel]').forEach(b => b.addEventListener('click', () => confirmCancel(+b.dataset.cancel)));
}

function confirmCancel(i) {
  const u = stu.upcoming[i];
  openModal(`<h3 id="modalTitle">Cancel this class?</h3><p class="sub">${u.c.type} · ${DAY[u.date.getDay()]} ${fmtDate(u.date)} · ${timeLabel(u.c.time)}</p><div class="note" style="margin-top:18px"><svg class="ic"><use href="#i-info"/></svg><span>You're cancelling more than 4 hours before class, so the lesson goes back to your balance.</span></div><div class="acts"><button class="sbtn red" id="doCancel">Cancel class</button><button class="sbtn" data-close>Keep it</button></div>`);
  $('#doCancel').addEventListener('click', () => {
    stu.booked.delete(u.key); stu.upcoming.splice(i, 1); stu.credits++;
    syncCredits(); renderUpcoming(); renderBook(); closeModal(); toast('Class cancelled. 1 lesson returned.');
  });
}

function syncCredits() {
  $('#creditBig').textContent = stu.credits === Infinity ? '∞' : stu.credits;
  $$('#v-student [data-count="18"]').forEach(el => { el.textContent = stu.credits === Infinity ? '∞' : stu.credits; });
}

function renderBook() {
  const mon = classDate(stu.week, 0), sun = addDays(mon, 6);
  $('#wkLabel').textContent = `${mon.getDate()} ${MON[mon.getMonth()]} – ${sun.getDate()} ${MON[sun.getMonth()]}`;
  $('#wkPrev').disabled = stu.week === 0; $('#wkNext').disabled = stu.week === 4;
  const minDate = addDays(TODAY, 1), maxDate = addDays(TODAY, 30);
  let html = '<div class="hd"></div>';
  for (let d = 0; d < 7; d++) { const dt = addDays(mon, d); html += `<div class="hd${+dt === +TODAY ? ' today' : ''}">${DAY[dt.getDay()]}<b>${dt.getDate()}</b></div>`; }
  stu.slots = [];
  TIMES.forEach(t => {
    html += `<div class="tm">${timeLabel(t)}</div>`;
    for (let d = 0; d < 7; d++) {
      const dt = addDays(mon, d);
      const cs = CLASSES.filter(c => c.day === d && c.time === t && (stu.dojo === 'all' || c.dojo === stu.dojo));
      html += '<div class="cell">' + cs.map(c => {
        const key = slotKey(stu.week, c), booked = stu.booked.has(key);
        const left = c.cap - c.booked - (booked ? 1 : 0);
        const tooSoon = dt < minDate || dt > maxDate;
        const idx = stu.slots.push({ c, dt, key }) - 1;
        const cls = ['slotb', c.kids ? 'kids' : '', booked ? 'booked' : '', (!booked && (left <= 0 || tooSoon)) ? 'full' : ''].join(' ');
        const sub = booked ? DOJOS.find(x => x.id === c.dojo).short : tooSoon ? (dt < minDate ? 'Closed for booking' : 'Opens later') : left <= 0 ? 'Full' : `${DOJOS.find(x => x.id === c.dojo).short} · ${left} left`;
        return `<button class="${cls}" data-i="${idx}"><b>${c.type}</b><span>${sub}</span></button>`;
      }).join('') + '</div>';
    }
  });
  $('#bookGrid').innerHTML = html;
}

function openBooking(i) {
  const { c, dt, key } = stu.slots[+i];
  if (stu.booked.has(key)) { const ui = stu.upcoming.findIndex(u => u.key === key); if (ui > -1) confirmCancel(ui); return; }
  const left = c.cap - c.booked;
  const after = stu.credits === Infinity ? 'Unlimited' : `${stu.credits - 1} lessons`;
  openModal(`<h3 id="modalTitle">${c.type}</h3><p class="sub">${DAY[dt.getDay()]} ${fmtDate(dt)} · ${timeLabel(c.time)} – ${timeLabel(String(+c.time.slice(0, 2) + 1).padStart(2, '0') + ':00')}</p>
    <div class="kv"><div><span>Dojo</span><span>${dojoName(c.dojo)}</span></div><div><span>Instructor</span><span>${c.ins}</span></div><div><span>Spots left</span><span>${left} of ${c.cap}</span></div><div><span>Cost</span><span>1 lesson</span></div><div><span>Balance after</span><span>${after}</span></div></div>
    <p style="font-size:13px;color:var(--muted)">Cancel at least 4 hours before class to get the lesson back. No-shows are not refunded.</p>
    <div class="acts"><button class="btn btn-dark arrow" id="doBook" autofocus>Confirm booking<span class="dot">${icon('arrow')}</span></button></div>`);
  $('#doBook').addEventListener('click', () => {
    if (stu.credits !== Infinity && stu.credits <= 0) { toast('No lessons left. Top up first.', 'bad'); return; }
    stu.booked.add(key);
    if (stu.credits !== Infinity) stu.credits--;
    stu.upcoming.push({ c, date: dt, key }); stu.upcoming.sort((a, b) => a.date - b.date);
    syncCredits(); renderBook(); renderUpcoming(); closeModal();
    toast(`Booked. Confirmation sent to ${ME.name.split(' ')[0]}'s email.`);
  });
}

function openBuy(id) {
  const p = PKG.adult.concat(PKG.kids).find(x => x.id === id);
  openModal(`<h3 id="modalTitle">${p.t}</h3><p class="sub">${p.d}</p>
    <div class="kv"><div><span>Package</span><span>${p.t}</span></div><div><span>Price</span><span>${money(p.amt)} ${p.unit || ''}</span></div><div><span>Pay with</span><span>Visa •••• 4242</span></div>${p.lessons === Infinity ? '<div><span>Note</span><span>Replaces your lesson balance while active</span></div>' : `<div><span>New balance</span><span>${stu.credits === Infinity ? '∞' : stu.credits + p.lessons} lessons</span></div>`}</div>
    <div class="slide" id="buySlide"><div class="fill"></div><div class="lbl"><em>Slide to pay ${money(p.amt)}</em></div><div class="knob" role="slider" tabindex="0" aria-label="Slide to pay" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${icon('arrow')}</div></div>`);
  slideCommit($('#buySlide'), () => {
    stu.credits = p.lessons === Infinity ? Infinity : (stu.credits === Infinity ? Infinity : stu.credits + p.lessons);
    syncCredits();
    setTimeout(() => { closeModal(); toast(`${p.t} added. Receipt sent by email.`); }, 500);
  });
}

function qrSVG(seed0 = 1834, size = 200) {
  // decorative check-in code (not a real QR)
  let cells = ''; let seed = seed0;
  for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) {
    seed = (seed * 9301 + 49297) % 233280;
    const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
    const on = finder ? (x % 6 === 0 || y % 6 === 0 || (x % 20 > 1 && x % 20 < 5 && y % 20 > 1 && y % 20 < 5) || (x > 15 && x < 19 && y > 1 && y < 5) || (x > 1 && x < 5 && y > 15 && y < 19)) : seed / 233280 > 0.52;
    if (on) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
  }
  return `<svg viewBox="-1 -1 23 23" width="${size}" height="${size}" style="background:#fff;border-radius:14px" fill="#16213B" aria-hidden="true">${cells}</svg>`;
}
function openCheckIn() {
  openModal(`<h3 id="modalTitle">Check in</h3><p class="sub">Tap your phone on the NFC tag at the dojo door, or show this code to your instructor.</p>
    <div style="display:grid;place-items:center;margin:22px 0">${qrSVG()}</div>
    <div class="kv"><div><span>Member</span><span>${ME.name}</span></div><div><span>Member no.</span><span class="num">${ME.no}</span></div></div>`);
}

PAGE_HOOK['student-packages'] = () => $$('#v-student [data-page="packages"] .bar i').forEach(i => requestAnimationFrame(() => i.style.width = i.dataset.w + '%'));

/* ---------- 9. INSTRUCTOR PORTAL ---------- */
const inst = { present: new Set(), filter: 'All', q: '' };

function initInstructor() {
  const d = new Date();
  $('#v-instructor .page[data-page="today"] h1').textContent = `Today · ${DAY[d.getDay()].charAt(0) + DAY[d.getDay()].slice(1).toLowerCase()} ${d.getDate()} ${MON[d.getMonth()]}`;
  $('#dayList').innerHTML = [
    ['6:00 PM', 'Children Beginners', 'HQ Dojo · 10 students', 'Finished', ''],
    ['7:00 PM', 'Adults', 'HQ Dojo · 14 students', 'Active', 'bad'],
    ['8:00 PM', 'Intermediate', 'HQ Dojo · 11 students', 'Upcoming', 'navy']
  ].map(r => `<div class="row"><span class="av${r[3] === 'Active' ? ' navy' : ''}" style="font-size:11px;width:54px;border-radius:12px">${r[0].replace(' ', '<br>')}</span><div class="grow"><div class="t">${r[1]}</div><div class="d">${r[2]}</div></div><span class="pill ${r[4]}">${r[3]}</span></div>`).join('');

  // roster
  const roster = STUDENTS.slice(0, 14);
  $('#roster').innerHTML = roster.map((s, i) => `<div class="row"><span class="av">${initials(s.n)}</span><div class="grow"><div class="t">${s.n}</div><div class="d"><span class="belt" style="--belt:${beltOf(s.g)}"><i></i>${s.g}</span> · ${s.s} sessions${isDeclining(s) ? ' · <b style="color:var(--bad)">not seen in ' + s.seen + ' days</b>' : ''}</div></div><div class="acts"><button class="mark" data-mark="${i}">${icon('check')}<span>Present</span></button></div></div>`).join('');
  const upd = () => { $('#presentCount').textContent = inst.present.size; $$('#roster [data-mark]').forEach(b => b.classList.toggle('on', inst.present.has(+b.dataset.mark))); };
  $('#roster').addEventListener('click', e => { const b = e.target.closest('[data-mark]'); if (!b) return; const i = +b.dataset.mark; inst.present.has(i) ? inst.present.delete(i) : inst.present.add(i); upd(); });
  $('#markAll').addEventListener('click', () => { roster.forEach((_, i) => inst.present.add(i)); upd(); toast('All 14 students marked present'); });
  // simulate NFC taps
  [0, 2, 5, 9].forEach((i, k) => setTimeout(() => { inst.present.add(i); upd(); }, 1200 + k * 900));
  $('[data-inst-tab="roster"]').addEventListener('click', () => $('#roster').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));

  // students
  const counts = { All: STUDENTS.length, Studying: STUDENTS.filter(s => s.st === 'Studying').length, Qualified: STUDENTS.filter(s => s.st === 'Qualified').length, 'Not attending': STUDENTS.filter(isDeclining).length };
  $('#stuFilter').innerHTML = Object.entries(counts).map(([k, n]) => `<button class="fpill${k === 'All' ? ' on' : ''}" data-f="${k}">${k}<span class="n">${n}</span></button>`).join('');
  $('#stuFilter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; inst.filter = b.dataset.f; $$('#stuFilter .fpill').forEach(x => x.classList.toggle('on', x === b)); renderStudents(); });
  $('#stuSearch').addEventListener('input', e => { inst.q = e.target.value.toLowerCase(); renderStudents(); });
  $('#stuRows').addEventListener('click', e => { const r = e.target.closest('tr[data-s]'); if (r) openStudent(+r.dataset.s); });
  renderStudents();

  // timetable
  let html = '<div class="hd"></div>';
  const mon = mondayOf(TODAY);
  for (let d = 0; d < 7; d++) { const dt = addDays(mon, d); html += `<div class="hd${+dt === +TODAY ? ' today' : ''}">${DAY[dt.getDay()]}<b>${dt.getDate()}</b></div>`; }
  const mine = CLASSES.filter(c => c.ins === 'Bob Tan Sensei');
  TIMES.forEach(t => {
    html += `<div class="tm">${timeLabel(t)}</div>`;
    for (let d = 0; d < 7; d++) {
      const c = mine.find(x => x.day === d && x.time === t);
      const live = c && +addDays(mon, d) === +TODAY && t === '19:00';
      html += `<div class="cell">${c ? `<button class="slotb${live ? ' live' : ''}" data-tt="${CLASSES.indexOf(c)}"><b>${c.type}</b><span>${live ? 'Active now · ' : ''}${c.booked} booked</span></button>` : ''}</div>`;
    }
  });
  $('#instGrid').innerHTML = html;
  $('#instGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-tt]'); if (!b) return;
    const c = CLASSES[+b.dataset.tt];
    openModal(`<h3 id="modalTitle">${c.type} · ${timeLabel(c.time)}</h3><p class="sub">${dojoName(c.dojo)} · ${c.booked} of ${c.cap} booked</p><div class="rows" style="margin-top:14px">${STUDENTS.slice(0, Math.min(6, c.booked)).map(s => `<div class="row"><span class="av">${initials(s.n)}</span><div class="grow"><div class="t">${s.n}</div><div class="d">${s.g}</div></div></div>`).join('')}</div><p style="font-size:13px;color:var(--muted);margin-top:8px">+ ${Math.max(0, c.booked - 6)} more. The full roster locks on the day.</p>`);
  });

  renderCandidates();
}

function renderStudents() {
  const list = STUDENTS.map((s, i) => ({ s, i })).filter(({ s }) =>
    (inst.filter === 'All' || (inst.filter === 'Not attending' ? isDeclining(s) : s.st === inst.filter)) && s.n.toLowerCase().includes(inst.q));
  $('#stuRows').innerHTML = list.map(({ s, i }) => `<tr class="click" data-s="${i}"><td><div class="who"><span class="av">${initials(s.n)}</span><div><b>${s.n}</b><span>${s.age} · ${dojoName(s.dojo)}</span></div></div></td><td><span class="belt" style="--belt:${beltOf(s.g)}"><i></i>${s.g}</span></td><td class="num">${s.s} / ${s.need}</td><td>${isDeclining(s) ? `<span style="color:var(--bad);font-weight:600">${s.seen} days ago</span>` : s.seen === 1 ? 'Yesterday' : s.seen + ' days ago'}</td><td><span class="pill ${s.st === 'Qualified' ? 'ok' : isDeclining(s) ? 'bad' : 'plain'}">${isDeclining(s) && s.st !== 'Qualified' ? 'Not attending' : s.st}</span></td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--muted)">No students match.</td></tr>';
}

function openStudent(i) {
  const s = STUDENTS[i];
  const weeks = Array.from({ length: 8 }, (_, k) => Math.max(0, Math.round((isDeclining(s) ? 3 - k * 0.4 : 2 + Math.sin(k + i) * 1.2))));
  const max = Math.max(...weeks, 3);
  const pts = weeks.map((w, k) => `${k * 40 + 10},${70 - w / max * 56}`).join(' ');
  const ready = s.s >= s.need;
  openDrawer(s.n, `
    <div class="pcard" id="drawerCard" style="max-width:none"><div class="pcard-body"><div class="pcard-tile"><span class="pcard-holo"></span>
      <div class="pcard-top"><span class="pcard-org"><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt="">SHINJU-KAI</span><span class="pcard-kanji">合気道</span></div>
      <div class="pcard-mid"><span class="pcard-av">${initials(s.n)}</span><div><div class="pcard-name">${s.n}</div><div class="pcard-rank" style="--belt:${beltOf(s.g)}"><i style="background:${beltOf(s.g)}"></i>${s.g}</div></div></div>
      <div class="pcard-bot"><span>SESSIONS AT GRADE<b>${s.s} / ${s.need}</b></span><span style="text-align:right">STATUS<b>${s.st.toUpperCase()}</b></span></div><span class="pcard-glare"></span></div>
      <div class="pcard-foot"><span class="st">${isDeclining(s) ? 'Last seen ' + s.seen + ' days ago' : 'Training regularly'}</span><button type="button" data-remind="${i}">${icon('mail')}Message</button></div></div></div>
    <div><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px"><b>Sessions toward next grade</b><span class="num">${Math.min(100, Math.round(s.s / s.need * 100))}%</span></div><div class="bar${ready ? '' : ' red'}"><i style="width:${Math.min(100, s.s / s.need * 100)}%"></i></div></div>
    <div><b style="font-size:13px">Classes per week · last 8 weeks</b><svg class="spark" viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="#16213B" stroke-width="2.5"/><circle cx="290" cy="${70 - weeks[7] / max * 56}" r="4" fill="#C1272D"/></svg></div>
    ${isDeclining(s) ? `<div class="note warn"><svg class="ic"><use href="#i-flag"/></svg><span>Not seen for ${s.seen} days. A friendly reminder often brings students back.</span></div>` : ''}
    ${s.st === 'Studying' && ready ? `<div class="note"><svg class="ic"><use href="#i-award"/></svg><span><b>Hours met.</b> Mark as Qualified so ${s.n.split(' ')[0]} can apply for grading.</span></div>` : ''}`,
    s.st === 'Studying'
      ? `<button class="sbtn" data-remind="${i}">${icon('send')}Send reminder</button><button class="sbtn dark" data-qualify="${i}" ${ready ? '' : 'title="Sessions not met yet"'}>${icon('award')}Mark as Qualified</button>`
      : `<button class="sbtn dark" data-remind="${i}">${icon('send')}Remind to apply for grading</button>`);
  profileCard($('#drawerCard'));
}
document.addEventListener('click', e => {
  const r = e.target.closest('[data-remind]');
  if (r) { toast(`Reminder sent to ${STUDENTS[+r.dataset.remind].n}`); return; }
  const q = e.target.closest('[data-qualify]');
  if (q) {
    const s = STUDENTS[+q.dataset.qualify];
    if (s.s < s.need) { toast(`${s.n} needs ${s.need - s.s} more sessions first.`, 'bad'); return; }
    s.st = 'Qualified'; closeDrawer(); renderStudents(); toast(`${s.n} is now Qualified for grading`);
  }
});

function renderCandidates() {
  $('#gradeList').innerHTML = CANDIDATES.map((c, i) => `<div class="row"><span class="av">${initials(c.n)}</span><div class="grow"><div class="t">${c.n}</div><div class="d">${c.from} → ${c.to} · HQ Dojo</div></div><div class="acts">${c.done ? `<span class="pill ok">Sent to HQ · ${c.result}</span>` : `<button class="sbtn dark" data-record="${i}">${icon('edit')}Record result</button>`}</div></div>`).join('');
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-record]'); if (!b) return;
  const i = +b.dataset.record, c = CANDIDATES[i];
  openDrawer(`Grading · ${c.n}`, `
    <div class="kv" style="margin:0;border-top:1px solid var(--line)"><div><span>Candidate</span><span>${c.n}</span></div><div><span>Grading for</span><span>${c.from} → ${c.to}</span></div><div><span>Session</span><span>13 Dec 2026 · HQ Dojo</span></div></div>
    <form id="recForm" style="display:grid;gap:16px" novalidate>
      <div class="fld"><span class="lbl">Result</span><div class="seg"><input type="radio" name="res" id="res1" value="Pass" checked><label for="res1">Pass</label><input type="radio" name="res" id="res2" value="Pass with merit"><label for="res2">Pass with merit</label><input type="radio" name="res" id="res3" value="Refer"><label for="res3">Refer</label></div></div>
      <div class="fld"><label for="rec-rank">Rank awarded</label><select id="rec-rank"><option>${c.to}</option><option>${c.from} (no change)</option></select></div>
      <div class="fld"><label for="rec-fb">Feedback for the student</label><textarea id="rec-fb" placeholder="Strengths, what to work on next"></textarea><span class="err">Add a short note for the student.</span></div>
      <div class="fld"><label for="rec-sign">Sign with your full name</label><input id="rec-sign" placeholder="Bob Tan"><span class="err">Type your name to sign.</span></div>
    </form>`,
    `<button class="sbtn" data-drawer-close>Cancel</button><button class="sbtn red" id="recSend">${icon('sign')}Sign &amp; send to HQ</button>`);
  $('#recSend').addEventListener('click', () => {
    const fb = $('#rec-fb').value.trim(), sg = $('#rec-sign').value.trim();
    fldOf($('#rec-fb')).classList.toggle('invalid', !fb); fldOf($('#rec-sign')).classList.toggle('invalid', !sg);
    if (!fb || !sg) return;
    c.done = true; c.result = radio('res');
    PROPOSALS.unshift({ n: c.n, from: c.from, to: $('#rec-rank').value, by: 'Bob Tan Sensei', result: c.result, fb });
    closeDrawer(); renderCandidates(); toast(`Proposal for ${c.n} sent to HQ`);
  });
});

/* ---------- 10. ADMIN PORTAL ---------- */
const adm = { memFilter: 'All', memQ: '', gradTab: 'apps' };

function initAdmin() {
  const d = new Date();
  $('#v-admin .page[data-page="dashboard"] p').textContent = `All dojos · ${fmtDate(d)}`;
  const trend = CLASSES.map(c => ({ l: `${c.type} · ${DAY[(c.day + 1) % 7].slice(0, 3)} ${timeLabel(c.time)}`, v: c.booked, p: c.booked / c.cap })).sort((a, b) => b.p - a.p).slice(0, 6);
  $('#trendBars').innerHTML = trend.map(t => `<div><span class="bl" title="${t.l}">${t.l}</span><span class="bt"><i data-w="${Math.round(t.p * 100)}"></i></span><span class="bv">${Math.round(t.p * 100)}%</span></div>`).join('');
  setTimeout(() => $$('#trendBars i').forEach(i => i.style.width = i.dataset.w + '%'), 200);

  renderApps();
  $('#appRows').addEventListener('click', e => {
    const v = e.target.closest('[data-app]'); if (v) openApp(+v.dataset.app);
    const a = e.target.closest('[data-approve]'); if (a) approveApp(+a.dataset.approve);
  });

  const counts = () => ({ All: MEMBERS.length, Active: MEMBERS.filter(m => m.st === 'Active').length, Lapsed: MEMBERS.filter(m => m.st === 'Lapsed').length });
  const drawFilters = () => { $('#memFilter').innerHTML = Object.entries(counts()).map(([k, n]) => `<button class="fpill${k === adm.memFilter ? ' on' : ''}" data-f="${k}">${k}<span class="n">${n}</span></button>`).join(''); };
  drawFilters();
  $('#memFilter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; adm.memFilter = b.dataset.f; drawFilters(); renderMembers(); });
  $('#memSearch').addEventListener('input', e => { adm.memQ = e.target.value.toLowerCase(); renderMembers(); });
  $('#memRows').addEventListener('click', e => { const r = e.target.closest('tr[data-m]'); if (r) openMember(+r.dataset.m, drawFilters); });
  renderMembers();

  renderSessions();
  $('#newSession').addEventListener('click', () => openSessionForm());
  $('#sesRows').addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'); if (ed) openSessionForm(+ed.dataset.edit);
    const del = e.target.closest('[data-del]');
    if (del) {
      const s = SESSIONS[+del.dataset.del];
      openModal(`<h3 id="modalTitle">Delete this session?</h3><p class="sub">${s.type} · ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][s.day]} ${timeLabel(s.time)} · ${dojoName(s.dojo)}</p><div class="note warn" style="margin-top:16px"><svg class="ic"><use href="#i-info"/></svg><span>${s.booked} students are booked. They'll be notified and their lessons returned.</span></div><div class="acts"><button class="sbtn red" id="doDel">Delete session</button><button class="sbtn" data-close>Keep</button></div>`);
      $('#doDel').addEventListener('click', () => { SESSIONS.splice(+del.dataset.del, 1); renderSessions(); closeModal(); toast('Session deleted. Booked students notified.'); });
    }
  });

  $('#gradTabs').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (!b) return; adm.gradTab = b.dataset.g; $$('#gradTabs .fpill').forEach(x => x.classList.toggle('on', x === b)); renderGrading(); });
  $('#gradRows').addEventListener('click', e => {
    const s = e.target.closest('[data-sched]'); if (s) openSchedule(+s.dataset.sched);
    const p = e.target.closest('[data-promote]'); if (p) promote(+p.dataset.promote);
  });
  renderGrading();

  const pays = [['Sarah Lee', 'Registration, dogi, 25 lessons', '1 Nov', 690, 'Paid'], ['Raj Kumaran', 'Registration, dogi, 10 lessons', '31 Oct', 375, 'Paid'], ['Jamie Tan', 'Unlimited · 2 weeks', '30 Oct', 96, 'Processing'], ['David Koh', 'Annual dues 2026', '—', 48, 'Overdue'], ['Kenji Sato', '50 lessons', '28 Oct', 980, 'Paid'], ['Grace Yeo', 'Annual dues 2026', '—', 48, 'Overdue']];
  $('#adminPayRows').innerHTML = pays.map(p => `<tr><td><b>${p[0]}</b></td><td>${p[1]}</td><td>${p[2]}</td><td class="num">${money(p[3])}</td><td><span class="pill ${p[4] === 'Paid' ? 'ok' : p[4] === 'Overdue' ? 'bad' : 'warn'}">${p[4]}</span></td></tr>`).join('');

  // notification composer
  const audCount = { 'All members': '1,248', 'One dojo': '', 'By grade': '', 'One student': '' };
  const syncAud = () => {
    const a = radio('aud'), extra = $('#audExtra');
    extra.hidden = a === 'All members';
    if (a === 'One dojo') { $('#audLabel').textContent = 'Dojo'; $('#n-target').innerHTML = DOJOS.map(d => `<option>${d.name}</option>`).join(''); }
    if (a === 'By grade') { $('#audLabel').textContent = 'Grade'; $('#n-target').innerHTML = BELTS.map(b => `<option>${b.g}</option>`).join(''); }
    if (a === 'One student') { $('#audLabel').textContent = 'Student'; $('#n-target').innerHTML = MEMBERS.map(m => `<option>${m.n} · ${m.no}</option>`).join(''); }
    $('#audPreview').textContent = a === 'All members' ? 'All members · 1,248' : `${a} · ${$('#n-target').value}`;
  };
  $('#audSeg').addEventListener('change', syncAud); $('#n-target').addEventListener('change', syncAud);
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

  document.addEventListener('click', e => {
    const x = e.target.closest('[data-export]'); if (!x) return;
    const k = x.dataset.export, stamp = `${MON[TODAY.getMonth()].toLowerCase()}-${TODAY.getFullYear()}`;
    if (k === 'members') downloadCSV(`members-${stamp}.csv`, [['Name', 'Member no.', 'Grade', 'Dojo', 'Hours', 'Status', 'Joined']].concat(MEMBERS.map(m => [m.n, m.no, m.g, dojoName(m.dojo), m.hrs, m.st, m.joined])));
    if (k === 'attendance') downloadCSV(`attendance-${stamp}.csv`, [['Class', 'Day', 'Time', 'Dojo', 'Booked', 'Capacity']].concat(CLASSES.map(c => [c.type, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][c.day], c.time, dojoName(c.dojo), c.booked, c.cap])));
    if (k === 'progression') downloadCSV(`progression-${stamp}.csv`, [['Name', 'Grade', 'Sessions', 'Needed', 'Status']].concat(STUDENTS.map(s => [s.n, s.g, s.s, s.need, s.st])));
    if (k === 'payments') downloadCSV(`payments-${stamp}.csv`, [['Member', 'Status']].concat(MEMBERS.map(m => [m.n, m.st])));
  });
}

function renderApps() {
  $('#appRows').innerHTML = APPS.length ? APPS.map((a, i) => `<div class="row"><span class="av${a.isNew ? ' navy' : ''}">${initials(a.n)}</span><div class="grow"><div class="t">${esc(a.n)}${a.group === 'Child' ? ` <span class="pill plain" style="height:20px;font-size:11px">Age ${a.age}</span>` : ''}${a.isNew ? ' <span class="pill bad plain" style="height:20px;font-size:11px">New</span>' : ''}</div><div class="d">${esc(dojoName(a.dojo))} · ${esc(a.date)} · ${money(a.paid)} paid${a.med.startsWith('Yes') ? ' · <b style="color:var(--warn)">medical note</b>' : ''}</div></div><div class="acts"><button class="sbtn" data-app="${i}">View form</button><button class="sbtn dark" data-approve="${i}">${icon('check')}Approve</button></div></div>`).join('') : '<p style="color:var(--muted)">All caught up. No applications waiting.</p>';
  const n = APPS.length;
  $('#appCount').textContent = n; $('#appCount').hidden = !n;
  const sp = $('#statPending'); if (sp && sp.dataset.cuDone) sp.textContent = n;
}

function openApp(i) {
  const a = APPS[i];
  const rows = [['Name', a.n], ['Gender', a.gender], ['Age', a.age], ['Nationality', a.nat], ['Mobile', a.phone], ['Email', a.email], ['Emergency contact', a.ec], ['Martial arts experience', a.exp], ['Previous ASK member', a.prev], ['Medical history', a.med], ['Principal dojo', dojoName(a.dojo)], ['Dogi', a.dogi], ['Lesson package', a.pkg], ['Paid', money(a.paid)], ['Submitted', a.date], ['Terms & PDPA', 'Agreed']];
  openDrawer(`Application · ${a.n}`, `${a.med.startsWith('Yes') ? `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span><b>Medical note:</b> ${esc(a.med.slice(6))}. Share with the principal dojo instructor.</span></div>` : ''}
    <div class="kv" style="margin:0;border-top:1px solid var(--line)">${rows.map(([k, v]) => `<div><span>${k}</span><span>${esc(v)}</span></div>`).join('')}</div>
    <div class="fld"><label for="app-grade">Starting grade</label><select id="app-grade"><option>6th Kyu (white belt)</option>${a.exp.includes('Aikido') ? '<option>Carry over after record check</option>' : ''}</select></div>`,
    `<button class="sbtn" id="appReject">Reject</button><button class="sbtn dark" data-approve="${i}">${icon('check')}Approve &amp; activate</button>`);
  $('#appReject').addEventListener('click', () => {
    openModal(`<h3 id="modalTitle">Reject ${esc(a.n)}?</h3><p class="sub">They'll get an email and a full refund of ${money(a.paid)}.</p><div class="fld" style="margin-top:16px"><label for="rej-why">Reason (sent to the applicant)</label><textarea id="rej-why" autofocus></textarea></div><div class="acts"><button class="sbtn red" id="doReject">Reject and refund</button><button class="sbtn" data-close>Back</button></div>`);
    $('#doReject').addEventListener('click', () => { APPS.splice(i, 1); renderApps(); closeModal(); closeDrawer(); toast('Application rejected. Refund issued.', 'info'); });
  });
}
document.addEventListener('click', e => { const b = e.target.closest('#drawer [data-approve]'); if (b) { e.stopPropagation(); approveApp(+b.dataset.approve); } }, true);

function approveApp(i) {
  const a = APPS[i]; if (!a) return;
  APPS.splice(i, 1);
  MEMBERS.unshift({ n: a.n, no: a.no || `ASK-2026-${3000 + Math.floor(Math.random() * 6000)}`, g: '6th Kyu', dojo: a.dojo, hrs: 0, st: 'Active', joined: `${MON[TODAY.getMonth()]} ${TODAY.getFullYear()}` });
  renderApps(); renderMembers(); closeDrawer();
  toast(`${a.n} approved. Student card queued for ${dojoName(a.dojo)}.`);
}

function renderMembers() {
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
    renderMembers(); after(); closeDrawer(); toast(`${m.n} updated`);
  });
}

function renderSessions() {
  const D = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  $('#sesRows').innerHTML = SESSIONS.map((s, i) => `<tr><td><b>${s.type}</b></td><td>Every ${D[s.day]} · ${timeLabel(s.time)}</td><td>${dojoName(s.dojo)}</td><td>${s.ins}</td><td class="num">${s.booked}/${s.cap}</td><td><span class="pill navy plain num">${icon('nfc', 'ic')} ${s.code}</span></td><td><div class="acts" style="display:flex;gap:6px"><button class="sbtn ghost" data-edit="${i}" aria-label="Edit">${icon('edit')}</button><button class="sbtn ghost" data-del="${i}" aria-label="Delete">${icon('trash')}</button></div></td></tr>`).join('');
}

function openSessionForm(i) {
  const s = i !== undefined ? SESSIONS[i] : { type: 'Adults', day: 0, time: '19:00', dojo: 'hq', ins: 'Bob Tan Sensei', cap: 20 };
  const types = ['Adults', 'Children Beginners', 'Children Juniors', 'Mixed', 'Weapons', 'Intermediate', 'Advanced', 'Ladies', 'SG50'];
  const D = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  openModal(`<h3 id="modalTitle">${i !== undefined ? 'Edit session' : 'New session'}</h3><p class="sub">Repeats every week. A check-in code is generated for the dojo's NFC tag.</p>
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
    n.code = s.code || `${DOJOS.find(d => d.id === n.dojo).short.toUpperCase().replace(/\s/g, '')}-${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'][n.day]}${+n.time.slice(0, 2) % 12 || 12}-${1000 + Math.floor(Math.random() * 9000)}`;
    if (i !== undefined) SESSIONS[i] = n; else SESSIONS.unshift(n);
    renderSessions(); closeModal(); toast(i !== undefined ? 'Session updated' : `Session created · code ${n.code}`);
  });
}

function renderGrading() {
  $('#gradTabs [data-g="apps"] .n').textContent = GRAD_APPS.filter(g => !g.sched).length;
  $('#gradTabs [data-g="props"] .n').textContent = PROPOSALS.length;
  if (adm.gradTab === 'apps') {
    $('#gradRows').innerHTML = GRAD_APPS.map((g, i) => `<div class="row"><span class="av">${initials(g.n)}</span><div class="grow"><div class="t">${g.n}</div><div class="d">${g.from} → ${g.to} · submitted ${g.sub} · ${g.note}</div></div><div class="acts">${g.sched ? `<span class="pill ok">${g.sched}</span>` : `<button class="sbtn dark" data-sched="${i}">${icon('cal')}Schedule</button>`}</div></div>`).join('');
  } else {
    $('#gradRows').innerHTML = PROPOSALS.length ? PROPOSALS.map((p, i) => `<div class="row"><span class="av">${initials(p.n)}</span><div class="grow"><div class="t">${p.n} · ${p.result}</div><div class="d">${p.from} → ${p.to} · signed by ${p.by} · "${esc(p.fb)}"</div></div><div class="acts"><button class="sbtn dark" data-promote="${i}">${icon('award')}Approve promotion</button></div></div>`).join('') : '<p style="color:var(--muted)">No proposals waiting.</p>';
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
  $('#gsSave').addEventListener('click', () => { g.sched = $('#gs-time').value; renderGrading(); closeDrawer(); toast(`${g.n} scheduled · ${g.sched}. Email sent.`); });
}

function promote(i) {
  const p = PROPOSALS.splice(i, 1)[0];
  const m = MEMBERS.find(x => x.n === p.n); if (m) m.g = p.to;
  const s = STUDENTS.find(x => x.n === p.n); if (s) { s.g = p.to; s.s = 0; s.st = 'Studying'; }
  renderGrading(); renderMembers();
  toast(`${p.n} promoted to ${p.to}`);
}

/* ---------- 11. BEN CHATBOT ---------- */
const BEN = [
  [/trial|try|first class/i, 'A trial session is S$29 for first-time visitors, once per person. Any beginner class at any dojo. No uniform needed.'],
  [/join|register|sign ?up|member/i, 'Registration is S$60: registration, handbook, membership book and year-one dues. You pay for your dogi and a lesson package in the same checkout. Takes about 6 minutes.'],
  [/fee|price|cost|pay|package|lesson/i, 'Adult packs: 10 lessons S$270, 25 lessons S$600, 50 lessons S$980, or unlimited for S$96 every 2 weeks. Children: 1-month S$150, 6-month S$139/month, 50 lessons S$1,200.'],
  [/dogi|uniform|size/i, 'Dogi: Cotton S$30, Heavyweight S$45, Competition S$60. Sizes run 000 (about 100 cm tall) to 7 (190 cm and up).'],
  [/card/i, 'Your membership number arrives by email right after you register. Collect your physical student card at your principal dojo on your first lesson.'],
  [/grad|belt|kyu|dan|promot/i, 'To apply for grading you need 3+ months of membership, no outstanding fees, enough sessions at your grade, and your instructor marking you Qualified. Next grading: 13 Dec, applications close 29 Nov.'],
  [/where|dojo|location|address|hq/i, 'HQ Dojo is at Thomson V One, 9 Sin Ming Road #B1-02, near Bright Hill MRT. We train at 60+ dojos in Singapore and overseas.'],
  [/cancel|refund/i, 'Cancel at least 4 hours before class to get the lesson back. No-shows are not refunded.'],
  [/book|class|schedule|time/i, 'You can book up to 1 month ahead and at least 1 day before. Classes run daily; the student portal shows live spots.'],
  [/hour|open|contact|phone|email/i, 'Office: Mon–Fri 10 AM–9 PM, Sat–Sun 8 AM–6 PM. Call +65 6513 1588 or email hq@aikidoshinjukai.com.sg.'],
  [/^(hi|hello|hey|osu)/i, 'Osu! What would you like to know?']
];
function openBen() { $('#benPanel').classList.add('open'); $('#benFab').setAttribute('aria-expanded', 'true'); setTimeout(() => $('#benInput').focus(), 200); }
function closeBen() { $('#benPanel').classList.remove('open'); $('#benFab').setAttribute('aria-expanded', 'false'); }
function benSay(text, who) {
  const m = document.createElement('div'); m.className = 'msg ' + who; m.textContent = text;
  $('#benBody').appendChild(m); $('#benBody').scrollTop = $('#benBody').scrollHeight;
}
function benAsk(q) {
  if (!q.trim()) return;
  benSay(q, 'u');
  const t = document.createElement('div'); t.className = 'msg b typing'; t.innerHTML = '<i></i><i></i><i></i>';
  $('#benBody').appendChild(t); $('#benBody').scrollTop = $('#benBody').scrollHeight;
  const hit = BEN.find(([r]) => r.test(q));
  setTimeout(() => { t.remove(); benSay(hit ? hit[1] : "I don't know that one yet. The HQ office can help: +65 6513 1588 or hq@aikidoshinjukai.com.sg.", 'b'); }, 700 + Math.random() * 400);
}
function initBen() {
  benSay("Osu! I'm Ben. Ask me about trial classes, fees, dogi sizes, dojo locations or grading.", 'b');
  const q = document.createElement('div'); q.className = 'quick';
  q.innerHTML = ['Trial class', 'How to join', 'Lesson packages', 'Grading rules', 'Where is HQ?'].map(s => `<button type="button">${s}</button>`).join('');
  $('#benBody').appendChild(q);
  q.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') benAsk(e.target.textContent); });
  $('#benFab').addEventListener('click', () => $('#benPanel').classList.contains('open') ? closeBen() : openBen());
  $('#benClose').addEventListener('click', closeBen);
  document.addEventListener('click', e => { if (e.target.closest('[data-ben-open]')) openBen(); });
  $('#benForm').addEventListener('submit', e => { e.preventDefault(); benAsk($('#benInput').value); $('#benInput').value = ''; });
  // swap to the drawn Ben if ben.gif is missing
  $$('.ben-av img').forEach(img => {
    const fail = () => img.parentElement.classList.add('fallback');
    if (img.complete && !img.naturalWidth) fail();
    img.addEventListener('error', fail);
  });
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
    else if (ds.d) { const [y, m, d] = ds.d.split('-').map(Number); setDate(new Date(y, m - 1, d)); close(); input.focus(); }
    else if ('clear' in ds) { input.value = ''; prev = ''; setDate(null); mode = 'days'; render(); }
    else if ('today' in ds) { setDate(new Date(TODAY)); close(); }
  });
  input.dpSet = d => setDate(d);
}

/* ---------- 14. DEPTH CAROUSEL (React Bits port) ---------- */
function depthCarousel(root, items, { onChange } = {}) {
  const stage = $('.dc-stage', root), dots = $('.dc-dots', root);
  const cfg = { depth: 170, spread: 62, tilt: 22, visible: 4, falloff: 0.2, blur: 5, duration: 700, w: 250 };
  let cards = [], pos = 0, focus = 0, scale = 1, anim = 0, drag = null, movedAt = 0;
  const N = () => items.length;
  const wrapD = d => { const n = N(); if (n > 1) { d = ((d % n) + n) % n; if (d > n / 2) d -= n; } return d; };
  const layout = p => {
    cards.forEach((el, i) => {
      const d = wrapD(i - p), back = Math.max(0, d), shown = Math.abs(d) <= cfg.visible + 0.5;
      const tz = -cfg.depth * d, tx = cfg.spread * d, ry = cfg.tilt * Math.min(Math.max(d, 0), 1);
      let op = d < 0 ? Math.max(0, 1 + d) : 1; if (!shown) op = 0;
      const br = Math.max(0.15, 1 - back * cfg.falloff), bl = Math.min(cfg.blur, back / cfg.visible * cfg.blur);
      el.style.transform = `translate(-50%,-50%) scale(${scale}) translateX(${tx.toFixed(1)}px) translateZ(${tz.toFixed(1)}px) rotateY(${ry.toFixed(2)}deg)`;
      el.style.opacity = op.toFixed(3);
      el.style.filter = `brightness(${br.toFixed(3)}) blur(${bl.toFixed(2)}px)`;
      el.style.zIndex = String(Math.round(2000 - d * 20));
      el.style.pointerEvents = shown && op > 0.05 ? 'auto' : 'none';
      el.setAttribute('aria-hidden', i !== focus);
      $('.tint', el).style.opacity = Math.min(0.86, back * cfg.falloff * 1.25).toFixed(3);
    });
  };
  const tweenTo = (target, animate = true) => {
    cancelAnimationFrame(anim);
    const from = pos, t0 = performance.now(), dur = animate && !reduce ? cfg.duration : 0;
    const step = now => {
      const k = dur ? Math.min(1, (now - t0) / dur) : 1, e = 1 - Math.pow(1 - k, 3);
      pos = from + (target - from) * e; layout(pos);
      if (k < 1) anim = requestAnimationFrame(step);
      else { const n = N(); pos = ((pos % n) + n) % n; layout(pos); }
    };
    anim = requestAnimationFrame(step);
  };
  const paintDots = () => $$('.dc-dot', dots).forEach((d, i) => { d.classList.toggle('on', i === focus); d.setAttribute('aria-selected', i === focus); });
  const setFocus = (raw, animate = true, force = false) => {
    const n = N(); if (!n) return;
    const idx = ((raw % n) + n) % n;
    let delta = idx - pos; delta = ((delta % n) + n) % n; if (delta > n / 2) delta -= n;
    tweenTo(pos + delta, animate);
    const changed = idx !== focus || force;
    focus = idx; paintDots();
    if (changed && onChange) onChange(items[idx], idx);
  };
  const build = () => {
    stage.innerHTML = items.map((it, i) => `<div class="dc-card" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} of ${items.length}: ${esc(it.name)}"><img src="${it.img}" alt="" draggable="false" onerror="this.style.opacity=0"><span class="code">${esc(it.code)}</span>${it.status ? `<span class="closed">${esc(it.status)}</span>` : ''}<div class="cap"><b>${esc(it.name)}</b><span>${esc(it.region)} · ${esc(it.addr.split(',').slice(-1)[0].trim())}</span></div><span class="tint"></span></div>`).join('');
    cards = $$('.dc-card', stage);
    dots.innerHTML = items.map((it, i) => `<button type="button" class="dc-dot" role="tab" data-i="${i}" aria-label="${esc(it.name)}"></button>`).join('');
    cancelAnimationFrame(anim); pos = 0; focus = 0; layout(0); paintDots();
  };
  $('.dc-arrow.prev', root).addEventListener('click', () => setFocus(focus - 1));
  $('.dc-arrow.next', root).addEventListener('click', () => setFocus(focus + 1));
  dots.addEventListener('click', e => { const b = e.target.closest('.dc-dot'); if (b) setFocus(+b.dataset.i); });
  stage.addEventListener('click', e => { if (performance.now() - movedAt < 250) return; const c = e.target.closest('.dc-card'); if (c) setFocus(+c.dataset.i); });
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.dc-arrow, .dc-dots') || N() < 2) return;
    cancelAnimationFrame(anim);
    drag = { x: e.clientX, start: pos, lastX: e.clientX, lastT: performance.now(), v: 0, moved: false, id: e.pointerId };
  });
  root.addEventListener('pointermove', e => {
    if (!drag) return;
    const stepPx = Math.max(cfg.w * 0.55 * scale, 40), dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 4) { drag.moved = true; try { root.setPointerCapture(drag.id); } catch (_) {} }
    if (!drag.moved) return;
    const now = performance.now();
    drag.v = (e.clientX - drag.lastX) / Math.max(now - drag.lastT, 1); drag.lastX = e.clientX; drag.lastT = now;
    pos = drag.start - dx / stepPx; layout(pos);
  });
  const end = () => {
    if (!drag) return;
    const d = drag; drag = null;
    if (!d.moved) { setFocus(focus, true); return; }
    movedAt = performance.now();
    const stepPx = Math.max(cfg.w * 0.55 * scale, 40);
    setFocus(Math.round(pos - d.v * 180 / stepPx));
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  root.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setFocus(focus - 1); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setFocus(focus + 1); }
  });
  new ResizeObserver(en => {
    const w = en[0].contentRect.width;
    scale = Math.min(1, Math.max(0.55, w / (cfg.w + cfg.spread * 2 + 120)));
    layout(pos);
  }).observe(root);
  build();
  return {
    setItems(list) { items = list; build(); if (onChange && items[0]) onChange(items[0], 0); },
    setFocus
  };
}

const CLASS_IMGS = ['adult/1.jpg', 'mixed/1.jpg', 'children/1.jpg', 'weapons/1.jpg', 'ladies/1.jpg', 'adult/2.jpg', 'seniors/1.jpg', 'weapons/2.jpg', 'ladies/2.jpg', 'private/1.jpg'];
function initDojos() {
  const B = 'https://aikidoshinjukai.com.sg/images/classes/';
  const regions = ['All'].concat([...new Set(DOJOS.map(d => d.region))]);
  $('#regionFilter').innerHTML = regions.map((r, i) => `<button type="button" class="fpill${i ? '' : ' on'}" data-r="${r}">${r}</button>`).join('');
  const toItem = (d, i) => ({ ...d, img: B + CLASS_IMGS[DOJOS.indexOf(d) % CLASS_IMGS.length] });
  const frame = $('#dojoMap'), panel = $('#mapPanel');
  let timer = null;
  const showMap = d => {
    $('#mapName').textContent = d.name;
    $('#mapAddr').textContent = d.addr;
    $('#mapTags').innerHTML = `<span class="pill ${d.status ? 'bad' : 'ok'}">${d.status || 'Open'}</span><span class="pill plain">${d.region}</span>${d.id === 'hq' ? '<span class="pill navy plain">Gradings held here</span>' : ''}`;
    const q = encodeURIComponent(d.addr);
    $('#mapOpen').href = `https://www.google.com/maps/search/?api=1&query=${q}`;
    $('#mapOpen').setAttribute('aria-label', `Open ${d.name} in Google Maps`);
    clearTimeout(timer);
    frame.classList.add('fade'); panel.classList.remove('ready');
    timer = setTimeout(() => { frame.src = `https://maps.google.com/maps?q=${q}&t=&z=16&ie=UTF8&iwloc=&output=embed`; }, 260);
  };
  frame.addEventListener('load', () => { if (frame.getAttribute('src')) { frame.classList.remove('fade'); panel.classList.add('ready'); } });
  const car = depthCarousel($('#dojoCarousel'), DOJOS.map(toItem), { onChange: showMap });
  showMap(DOJOS[0]);
  $('#regionFilter').addEventListener('click', e => {
    const b = e.target.closest('[data-r]'); if (!b) return;
    $$('#regionFilter .fpill').forEach(x => x.classList.toggle('on', x === b));
    car.setItems(DOJOS.filter(d => b.dataset.r === 'All' || d.region === b.dataset.r).map(toItem));
  });
}

/* ---------- 15. ABOUT ---------- */
const HISTORY = [
  [2024, 'Our own permanent HQ', 'After 36 years, Shinju-Kai opened its permanent Headquarters and Shinju Hub at Thomson V One on 18 May 2024.', true],
  [2022, 'Back to normal', 'After three years of COVID-19 restrictions, membership began to rebuild, slowly and steadily.'],
  [2019, 'Bracing for COVID-19', 'Strict safe-distancing rules hit dojos hard and many students paused training.'],
  [2018, '30th anniversary', 'Hombu Dojo-Cho Mitsuteru Ueshiba was Guest-of-Honour, with over 800 participants from 26 countries. A 200 m² dojo opened at Heartbeat@Bedok.', true],
  [2017, 'A base in China', 'A China headquarters opened in Shanghai to unify affiliated dojos there.'],
  [2016, 'Chingay Parade', 'Chosen to represent Aikido at the National Chingay Parade, watched by 180,000 spectators. The first Keiko Hajime, the year\'s opening class, became an annual tradition.'],
  [2015, 'SG50 seminar', 'The five founding fathers of Aikido in Singapore came together for the SG50 and 3rd All Shinju-Kai Demonstration and Seminar.'],
  [2014, 'An 800-year-old katana', 'Gifted a heritage katana by Masaki Tani of the Aikido World Headquarters\' International Affairs Department.'],
  [2013, '25 years, 78 dojos', '48 dojos in Singapore and 30 in China, Indonesia and Malaysia. Awarded Promising SME 500 and Industry Star.'],
  [2011, 'Giving back', 'Raised S$32,270 in one day for victims of the Tohoku earthquake and tsunami. Launched AikiForest for pre-schoolers from age 3.'],
  [2010, 'International Friendship Seminar', 'The first IFS, with Japan, the United Kingdom, Canada, Belgium and Singapore.'],
  [2008, '20th anniversary', 'Celebrated with Hiroshi Tada Shihan (9th Dan) and over 800 participants from 17 countries.'],
  [2006, 'Schools programme', 'Became the sole provider of Aikido in schools through the MOE Sports Education Programme.'],
  [2005, 'Going overseas', 'Dojos in Malaysia, China and Indonesia, plus 31 new local dojos.'],
  [2003, 'First permanent HQ', 'The first Aikido organisation in Singapore with a permanent HQ, at HomeTeamNS Balestier.', true],
  [2001, 'Hombu recognition', 'Officially recognised by the Aikido World Headquarters, Japan. First to bring Aikido to the Singapore Armed Forces.', true],
  [1999, 'Expansion', 'Eight new dojos in community clubs, and Aikido training for the Gurkha Contingent of the Singapore Police Force.'],
  [1995, 'Building foundations', 'Eight years of building discipline and culture before a second dojo opened at Cheng San CC.'],
  [1988, 'The beginning', 'Founded by Philip Lee Shihan at SAFRA Tampines. Pioneer instructors: John Lim, Kelly Tan, Alice Tan and Allan Lai.', true]
];
const MILESTONES = [
  [2024, 70, '<b>Opened the permanent Shinju-Kai HQ</b> with two training halls, a member lounge and a café.'],
  [2018, 64, 'Invited Dojo-Cho Mitsuteru Ueshiba to open the new training centre at Heartbeat@Bedok.'],
  [2017, 63, '<b>Awarded 7th Dan</b> by the third Doshu, Moriteru Ueshiba, at Kagami Biraki.'],
  [2014, 60, '<b>Conferred the title of Shihan</b> by the Aikido World Headquarters.'],
  [2010, 56, 'Started the International Friendship Seminar with Japan, the UK, Canada and Belgium.'],
  [2005, 51, 'Awarded 6th Dan. Opened the first dojos in Johor Bahru and Batam.'],
  [2003, 49, 'Left his construction business to teach Aikido full time. Opened the first permanent HQ.'],
  [2002, 48, 'Opened his first dojo in China, in Shanghai.'],
  [2001, 47, 'First to teach Aikido to the Singapore Armed Forces.'],
  [1999, 45, 'Awarded 5th Dan. First to teach Aikido to the Gurkha Contingent.'],
  [1988, 34, '<b>Founded Aikido Shinju-Kai</b> with his first dojo at SAFRA Tampines.'],
  [1981, 27, 'One of the first two Singaporeans to train as a live-in student (uchideshi) at Hombu Dojo, Japan.'],
  [1971, 17, 'Began Aikido with Sensei Harry Ng at the YMCA, Stevens Road.']
];
const DAN_GROUPS = [
  ['6th Dan', ['Chew Eng Lam Sensei', 'James Moy Sensei', 'Allan Lai Sensei', 'Bob Tan Sensei', 'Quah Yong Lok Sensei', 'Annie Goh Sensei', 'Tan Kok Hiang Sensei']],
  ['5th Dan', ['Ronald Tan Sensei', 'Lim Cheen Cheen Sensei', 'Aloyseus Lee Sensei', 'Alexander Lee Sensei', 'Tham Wai Yip Sensei', 'Steven Goh Sensei', 'James Tan Sensei', 'Tey Guan Kiat Sensei', 'Billy Lim Sensei', 'Pang Kim Lock Sensei', 'Robin Tan Sensei']],
  ['4th Dan', ['Chuan Huey Ferg Sensei', 'Lynn Tan Sensei', 'Chan Wai Soen Sensei', 'Alan Lim Sensei', 'Mark Lim Sensei', 'Sean Tan Sensei', 'Alvin Teo Sensei', 'Elaine Ong Sensei', 'Robert Choo Sensei', 'Lai Mun Kit Sensei', 'Alex Tan Sensei', 'Alister Fong Sensei', 'Clement Ang Sensei']],
  ['3rd Dan', ['Gavin Poh', 'Cheong Mun Hong', 'Ng Ngee Boon', 'Louwena Lau', 'Patrick Lim', 'Junex Calderon', 'Lisa Teo', 'Shibata Yukiyasu', 'Nicholas Lee', 'Dennis Tan', 'Charles Leong']],
  ['Assistant instructors · 2nd Dan', ['Gregorio Jury', 'Winnie Lim', 'Crix Lee', 'Yoong Yong Jian', 'Eric Ng', 'Toh Boon Yi']]
];
const OVERSEAS = {
  China: [['余立人老师', '上海合气会馆', '5th Dan'], ['卢剑文老师', '鸿胜合气道', '5th Dan'], ['林骏老师', '心勝道场', '5th Dan'], ['Fox Mok 老师', '心柔会上海道场', '4th Dan'], ['钟滢老师', '心柔会上海道场', '4th Dan'], ['王翊迪老师', '心柔会上海道场', '4th Dan']],
  Indonesia: [['Hendy Louis', 'Shinkenryukai', '3rd Dan'], ['Elvis Mardi', 'Seiki Kai Indonesia', '2nd Dan'], ['Handy Gunawan', 'Shinkenryukai', '2nd Dan'], ['Ronald Wibawa', 'Seiki Kai Indonesia', '1st Dan'], ['Bary Fardan Siregar', 'Seiki Kai Indonesia', '1st Dan']],
  Malaysia: [['Bryan Loi Sensei', 'Hibana Bushidoo', '5th Dan'], ['Chris Khor', 'Hibana Bushidoo', '3rd Dan'], ['Ng Kim San Francis', 'Hibana Bushidoo', '2nd Dan'], ['Ku Keng Leong', 'Hibana Bushidoo', '2nd Dan'], ['Khoo Kiat Siong', 'Hibana Bushidoo', '1st Dan'], ['Ng Yu Xuan Denise', 'Hibana Bushidoo', '1st Dan']]
};
const LIFE_FOUNDING = ['Philip Lee & Family', 'Allan Lai', 'Ronald Tan', 'Charlie Lim', 'Bob Tan', 'Denny Oetomo', 'Jennifer Goh', 'Annie Goh', 'Chew Eng Lam', 'Ahmad Bin Ibrahim', 'Kuah Chui Heong', 'Bernie Ho', 'Vaughan Michael Prentice', 'Lynn Tan', 'Shawn Wang', 'Lim Cheen Cheen', 'Alice Tan', 'James Moy', 'Stanley Ang', 'Quah Yong Lok', 'Trevor Ellis & Family', 'Tey Guan Kiat', 'Sam Yeo'];
const LIFE_YEARS = [[2005, 'Pang Kim Lock'], [2006, 'Chua Yu Zhan & Brothers, Ted Ngo'], [2007, 'Joanne Leong, Tan Kok Hiang'], [2008, 'Erik Heng & Family'], [2010, 'Magali Nicolas & Family, Teo Kok Meng & Family'], [2011, 'N. Y. Lee, Foo Choon Mei, James Tan & Family'], [2012, 'Ross Lee & Brothers'], [2016, 'Edmund Loh Kim Man, Marvin Tay Choon How, Chong Quey Lim & Family'], [2019, 'Kevin Kwok'], [2020, 'Nathaniel Abramowich, Denise Wong, Maëlys Desmartes'], [2024, 'Gregorio Jury, Billy Lim, Elaine Ong, Catherine Kang, Roman Tan & Family, Dan Mosley, Endean Tan']];

function initAbout() {
  const tl = (h, hidden) => `<div class="tl${h[3] ? ' key' : ''}"${hidden ? ' hidden data-old' : ''}><span class="y">${h[0]}</span><span class="dotc"></span><div><b>${esc(h[1])}</b><p>${esc(h[2])}</p></div></div>`;
  $('#timeline').innerHTML = HISTORY.map((h, i) => tl(h, i >= 9)).join('');
  $('#tlMore').addEventListener('click', e => {
    const show = $$('#timeline [data-old]').some(x => x.hidden);
    $$('#timeline [data-old]').forEach(x => x.hidden = !show);
    e.currentTarget.innerHTML = show ? `${icon('chev')}Show fewer years` : `${icon('chev')}Show earlier years`;
    $('.ic', e.currentTarget).style.transform = show ? 'rotate(180deg)' : '';
  });
  $('#miles').innerHTML = MILESTONES.map(m => `<div class="mile"><span class="y">${m[0]}</span><span class="a">Age ${m[1]}</span><p>${m[2]}</p></div>`).join('');

  const B = 'https://aikidoshinjukai.com.sg/images/instructors/';
  const slug = n => n.replace(/ Sensei$/, '').toLowerCase().replace(/[^a-z\s]/g, '').trim().replace(/\s+/g, '-');
  $('#insGroups').innerHTML = DAN_GROUPS.map(([g, names]) => `<div class="dan-group ac"><h3>${g} · ${names.length}</h3><div class="ins-grid">${names.map(n =>
    `<article class="ins"><div class="ph"><img src="${B + slug(n)}.jpg" alt="${esc(n)}" loading="lazy" onerror="this.remove()"><span class="ini" aria-hidden="true">${initials(n)}</span></div><div class="meta"><span class="nm">${esc(n)}</span><span class="dan">${g.includes('2nd') ? '2nd Dan' : g}</span></div></article>`).join('')}</div></div>`).join('');

  $('#countries').innerHTML = Object.entries(OVERSEAS).map(([c, list]) => `<article class="country"><h3>${c} <small>${list.length} instructors</small></h3><div class="rows">${list.map(p => `<div class="row"><span class="av">${esc(p[0].replace(/老师|Sensei/g, '').trim().slice(0, 2).toUpperCase())}</span><div class="grow"><div class="t">${esc(p[0])}</div><div class="d">${esc(p[1])}</div></div><span class="pill plain">${p[2]}</span></div>`).join('')}</div></article>`).join('');

  $('#lifeFounding').innerHTML = LIFE_FOUNDING.map(n => `<span>${esc(n)}</span>`).join('');
  $('#lifeYears').innerHTML = LIFE_YEARS.map(([y, n]) => `<div class="yr"><b>${y}</b><span>${esc(n)}</span></div>`).join('');

  // highlight the section in view
  const nav = $('#abNav');
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    const id = en.target.id.slice(3);
    $$('a', nav).forEach(a => a.classList.toggle('on', a.dataset.sec === id));
    const on = $('a.on', nav);
    if (on) nav.scrollTo({ left: on.offsetLeft - nav.clientWidth / 2 + on.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  }), { rootMargin: '-40% 0px -55% 0px' });
  $$('#v-about .ab-sec').forEach(s => io.observe(s));
}

/* ---------- 16. TRIAL & GUEST PASS CHECKOUT ---------- */
const PASSES = {
  local: [
    { id: 'trial', t: 'Trial session', amt: 29, d: 'First-time visitors, once per person', inc: ['One beginner-friendly class', 'Any dojo with classes', 'No uniform needed'], need: 'session' },
    { id: 'single', t: 'Single session', amt: 40, d: 'Drop in for one class', inc: ['One class of your choice', 'Any dojo with classes'], need: 'session' },
    { id: 'day', t: '1-day unlimited', amt: 50, d: 'Every class on one day', inc: ['Unlimited classes on the day', 'Move between dojos'], need: 'first' },
    { id: 'week', t: '1-week unlimited', amt: 150, d: 'Unlimited classes for 7 days', inc: ['Unlimited classes for 7 days', 'Starts on the date you pick'], need: 'first' },
    { id: 'private', t: 'Private class', amt: 120, unit: '/ hour', d: 'One-to-one with an instructor', inc: ['60 minutes one-to-one', 'At the HQ Dojo', 'Instructor confirms by email'], need: 'time' }
  ],
  overseas: [
    { id: 'trial', t: 'Trial session', amt: 29, d: 'First-time visitors, once per person', inc: ['One beginner-friendly class', 'Any dojo with classes', 'No uniform needed'], need: 'session' },
    { id: 'oday', t: '1-day unlimited', amt: 40, d: 'Overseas guest rate', inc: ['Unlimited classes on the day', 'Bring your home dojo record book'], need: 'first' },
    { id: 'oweek', t: '1-week unlimited', amt: 120, d: 'Overseas guest rate', inc: ['Unlimited classes for 7 days', 'Bring your home dojo record book'], need: 'first' },
    { id: 'omonth', t: '1-month unlimited', amt: 350, d: 'Overseas guest rate', inc: ['Unlimited classes for 30 days', 'Bring your home dojo record book'], need: 'first' },
    { id: 'private', t: 'Private class', amt: 120, unit: '/ hour', d: 'One-to-one with an instructor', inc: ['60 minutes one-to-one', 'At the HQ Dojo', 'Instructor confirms by email'], need: 'time' }
  ]
};
const PRIVATE_SLOTS = ['10:00', '14:00', '16:00', '18:00'];
const passState = { list: 'local', pass: null };
const passObj = () => PASSES[passState.list].find(p => p.id === radio('gpass'));

function initPass() {
  const drawPasses = () => {
    const cur = radio('gpass');
    $('#passChoices').innerHTML = PASSES[passState.list].map(p => `<div class="choice"><input type="radio" name="gpass" id="gp-${p.id}" value="${p.id}"${p.id === cur ? ' checked' : ''}><label for="gp-${p.id}"><span class="top"><span class="t">${p.t}</span><span class="tick">${icon('check')}</span></span><span class="d">${p.d}</span><span class="price num">${money(p.amt)}<small style="font-size:13px;font-weight:500;color:var(--muted)"> ${p.unit || ''}</small></span></label></div>`).join('');
    if (!passObj()) { const first = $('input[name="gpass"]'); if (first) first.checked = true; }
  };
  passState.draw = drawPasses;
  drawPasses();
  $('#overseas').addEventListener('change', e => { passState.list = e.target.checked ? 'overseas' : 'local'; drawPasses(); refreshPass(); });

  const dojoIds = [...new Set(CLASSES.map(c => c.dojo))];
  $('#g-dojo').innerHTML = '<option value="">Choose a dojo</option>' + DOJOS.filter(d => dojoIds.includes(d.id)).map(d => `<option value="${d.id}">${esc(d.name)}</option>`).join('');

  $$('input[name="gwho"]').forEach(r => r.addEventListener('change', () => { $('#f-guardian').hidden = radio('gwho') !== 'Child'; refreshPass(); }));
  $$('input[name="gmed"]').forEach(r => r.addEventListener('change', () => { $('#gmedReveal').classList.toggle('open', radio('gmed') === 'Yes'); $('#f-gmed').classList.remove('invalid'); }));
  $('#passForm').addEventListener('input', e => { const f = fldOf(e.target); if (f) f.classList.remove('invalid'); });
  $('#passForm').addEventListener('change', e => {
    if (['gpass', 'gsess'].includes(e.target.name)) { const f = e.target.name === 'gpass' ? $('#f-pass') : fldOf($('#sessPick')); f.classList.remove('invalid'); }
    if (e.target.id === 'g-waiver') $('#f-waiver').classList.remove('invalid');
    if (e.target.id === 'g-date' && e.target.dataset.iso) fldOf(e.target).classList.remove('invalid');
    if (e.target.name !== 'gsess') refreshPass();
    else refreshSummary();
  });
  $('#passForm').addEventListener('submit', e => e.preventDefault());
  $('#sessPick').addEventListener('click', e => {
    const b = e.target.closest('[data-jump]'); if (!b) return;
    const [y, m, d] = b.dataset.jump.split('-').map(Number);
    $('#g-date').dpSet(new Date(y, m - 1, d));
  });
  slideCommit($('#passSlide'), completePass, validatePass);
  $('#passAgain').addEventListener('click', () => {
    $$('#v-pass [data-pstep]').forEach(s => s.classList.toggle('on', s.dataset.pstep === '1'));
    $('#passSlide').reset(); window.scrollTo(0, 0);
  });
  refreshPass();
}

function passPreset(page) {
  if (!passState.draw) return;
  const map = { trial: 'trial', day: passState.list === 'overseas' ? 'oday' : 'day', week: passState.list === 'overseas' ? 'oweek' : 'week', private: 'private', single: 'single' };
  const id = map[page];
  if (id && $('#gp-' + id)) { $('#gp-' + id).checked = true; refreshPass(); }
}

function sessionsFor(dojo, date, p) {
  if (!dojo || !date || !p) return [];
  const day = (date.getDay() + 6) % 7, child = radio('gwho') === 'Child';
  return CLASSES.filter(c => c.dojo === dojo && c.day === day && c.booked < c.cap)
    .filter(c => child ? (c.kids || c.type === 'Mixed') : !c.kids)
    .filter(c => p.id !== 'trial' || !['Intermediate', 'Advanced', 'Weapons'].includes(c.type));
}

function refreshPass() {
  const p = passObj(); if (!p) return;
  const isoD = $('#g-date').dataset.iso, date = isoD ? new Date(...isoD.split('-').map((v, i) => i === 1 ? v - 1 : +v)) : null;
  const dojoSel = $('#g-dojo');
  if (p.need === 'time') { dojoSel.value = 'hq'; dojoSel.dispatchEvent(new Event('change')); }
  dojoSel.closest('.cs') && (dojoSel.closest('.cs').style.pointerEvents = p.need === 'time' ? 'none' : '');
  dojoSel.closest('.cs') && (dojoSel.closest('.cs').style.opacity = p.need === 'time' ? '.6' : '');
  const dojo = dojoSel.value;
  $('#sessLbl').innerHTML = (p.need === 'time' ? 'Preferred time' : p.need === 'first' ? 'First class' : 'Class') + '<span class="req">*</span>';
  const cur = radio('gsess');
  let html = '';
  if (p.need === 'time') {
    html = date ? PRIVATE_SLOTS.map(t => `<div class="choice"><input type="radio" name="gsess" id="gs-${t}" value="${t}"${cur === t ? ' checked' : ''}><label for="gs-${t}"><span class="t">${timeLabel(t)}</span><span class="d">60 minutes · HQ Dojo</span></label></div>`).join('') : '<p class="sess-empty">Pick a date to see available times.</p>';
  } else if (!dojo || !date) {
    html = '<p class="sess-empty">Pick a dojo and a date to see classes.</p>';
  } else {
    const list = sessionsFor(dojo, date, p);
    if (list.length) {
      html = list.map(c => { const v = `${c.time}|${c.type}`; return `<div class="choice"><input type="radio" name="gsess" id="gs-${c.time}-${c.day}" value="${v}"${cur === v ? ' checked' : ''}><label for="gs-${c.time}-${c.day}"><span class="t">${c.type}</span><span class="d">${timeLabel(c.time)} · ${c.ins.replace(' Sensei', '')} · ${c.cap - c.booked} spots</span></label></div>`; }).join('');
    } else {
      let next = null;
      for (let k = 1; k <= 30 && !next; k++) { const d = addDays(date, k); if (d <= addDays(TODAY, 30) && sessionsFor(dojo, d, p).length) next = d; }
      html = `<p class="sess-empty">No suitable classes at ${esc(dojoName(dojo))} on ${DAY[date.getDay()].charAt(0) + DAY[date.getDay()].slice(1).toLowerCase()}.${next ? ` <button type="button" class="sbtn" style="margin-left:6px" data-jump="${next.getFullYear()}-${next.getMonth() + 1}-${next.getDate()}">Try ${fmtDate(next)}</button>` : ' Try another dojo.'}</p>`;
    }
  }
  $('#sessPick').innerHTML = html;
  refreshSummary();
}

function refreshSummary() {
  const p = passObj(); if (!p) return;
  $('#psName').textContent = p.t;
  $('#psPrice').innerHTML = `${money(p.amt)} <small>${p.unit || ''}</small>`;
  $('#psMobile').textContent = `${p.t} · ${money(p.amt)}`;
  $('#psList').innerHTML = p.inc.map(i => `<li>${icon('check')}${esc(i)}</li>`).join('');
  const isoD = $('#g-date').dataset.iso, dojo = $('#g-dojo').value, sess = radio('gsess');
  const when = [];
  if (dojo) when.push(`<b>${esc(dojoName(dojo))}</b>`);
  if (isoD) { const [y, m, d] = isoD.split('-').map(Number); const dt = new Date(y, m - 1, d); when.push(`${DAY[dt.getDay()].charAt(0) + DAY[dt.getDay()].slice(1).toLowerCase()} ${fmtDate(dt)}`); }
  if (sess) { const [t, type] = sess.split('|'); when.push(`${type ? type + ' · ' : ''}${timeLabel(t)}`); }
  $('#psWhen').innerHTML = when.length ? when.map(w => `<span>${w}</span>`).join('') : '<span>Pick a dojo and date to see classes.</span>';
  $('#gFees').innerHTML = `<div><span>${esc(p.t)}<small>${esc(p.d)}</small></span><span>${money(p.amt)}</span></div><div class="total"><span>Total due today</span><span>${money(p.amt)}</span></div>`;
  $('#passSlideLbl').textContent = `Slide to pay ${money(p.amt)}`;
}

function validatePass() {
  const bad = [];
  const need = (cond, el) => { mark(el, !cond); if (!cond) bad.push(el); };
  need(!!passObj(), $('#f-pass'));
  need(!!val('g-name'), fldOf($('#g-name')));
  need(emailOk(val('g-email')), fldOf($('#g-email')));
  need(phoneOk(val('g-phone')), fldOf($('#g-phone')));
  if (radio('gwho') === 'Child') need(!!val('g-guardian'), $('#f-guardian'));
  need(!!$('#g-dojo').value, fldOf($('#g-dojo')));
  need(!!$('#g-date').dataset.iso, fldOf($('#g-date')));
  need(!!radio('gsess'), fldOf($('#sessPick')));
  need(!!radio('gmed'), $('#f-gmed'));
  if (radio('gmed') === 'Yes') need(!!val('g-med'), fldOf($('#g-med')));
  need($('#g-waiver').checked, $('#f-waiver'));
  if (bad.length) {
    bad[0].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    toast(bad.length === 1 ? 'One field needs your attention.' : `${bad.length} fields need your attention.`, 'bad');
    return false;
  }
  return true;
}

function completePass() {
  const p = passObj(), [y, m, d] = $('#g-date').dataset.iso.split('-').map(Number), dt = new Date(y, m - 1, d);
  const [t, type] = radio('gsess').split('|');
  const ref = 'GST-' + String(Date.now()).slice(-6);
  const first = val('g-name').split(' ')[0];
  $('#gDoneTitle').textContent = `See you on the mat, ${first}`;
  $('#gDoneSub').textContent = `Booking and receipt sent to ${val('g-email')}.`;
  $('#ticket').innerHTML = `<div class="ticket-main"><span class="ref">Booking ${ref} · paid ${money(p.amt)}</span><h3>${esc(p.t)}</h3>
    <div class="kv" style="margin:0"><div><span>Name</span><span>${esc(val('g-name'))}</span></div><div><span>Dojo</span><span>${esc(dojoName($('#g-dojo').value))}</span></div><div><span>Date</span><span>${DAY[dt.getDay()].charAt(0) + DAY[dt.getDay()].slice(1).toLowerCase()} ${fmtDate(dt)}</span></div><div><span>${p.need === 'time' ? 'Preferred time' : 'Class'}</span><span>${type ? esc(type) + ' · ' : ''}${timeLabel(t)}</span></div></div></div>
    <div class="ticket-side">${qrSVG(+String(Date.now()).slice(-4), 150)}<small>Show this at the front desk</small></div>`;
  $$('#v-pass [data-pstep]').forEach(s => s.classList.toggle('on', s.dataset.pstep === '2'));
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  toast('Payment received. Booking confirmed.');
}

/* ---------- 17. COLLAPSIBLE SIDEBAR ---------- */
function initRails() {
  $$('.rail nav button').forEach(b => {
    b.dataset.label = b.textContent.replace(/\d+\s*$/, '').trim();
    [...b.childNodes].forEach(n => { if (n.nodeType === 3 && n.textContent.trim()) { const s = document.createElement('span'); s.className = 't'; s.textContent = n.textContent.trim(); n.replaceWith(s); } });
  });
  $$('.rail-me > div').forEach(d => d.classList.add('me-info'));
  let col = false;
  try { col = localStorage.getItem('ask-rail') === '1'; } catch (_) {}
  const apply = () => {
    $$('.shell').forEach(s => s.classList.toggle('collapsed', col));
    $$('[data-rail-toggle]').forEach(b => { b.setAttribute('aria-expanded', String(!col)); b.setAttribute('aria-label', col ? 'Expand sidebar' : 'Collapse sidebar'); });
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-rail-toggle]')) return;
    col = !col;
    try { localStorage.setItem('ask-rail', col ? '1' : '0'); } catch (_) {}
    apply();
  });
  apply();
}

/* ---------- 12. BOOT ---------- */
const INIT = { home: initHome, about: initAbout, pass: initPass, join: initJoin, student: initStudent, instructor: initInstructor, admin: initAdmin };

const ROLE_ID = {
  student: { label: 'Membership ID', demo: 'ASK-2025-1834', hint: 'On your student card and welcome email, e.g. ASK-2025-1834', re: /^ASK-\d{4}-\d{4}$/, note: 'Log in with your membership ID, or the Google account you registered with.' },
  instructor: { label: 'Instructor ID', demo: 'INS-0042', hint: 'Issued by the HQ office, e.g. INS-0042', re: /^INS-\d{4}$/, note: 'Instructor accounts are created by the HQ office. Use your instructor ID or Google.' },
  admin: { label: 'Admin ID', demo: 'ADM-001', hint: 'Issued by the HQ office, e.g. ADM-001', re: /^ADM-\d{3}$/, note: 'Admin accounts are created by a system administrator.' }
};
const curRole = () => $('#roleTabs .on').dataset.role;
$('#roleTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-role]'); if (!b) return;
  const tabs = $$('#roleTabs [data-role]'), i = tabs.indexOf(b);
  tabs.forEach(t => { t.classList.toggle('on', t === b); t.setAttribute('aria-selected', t === b); });
  $('#roleTabs .thumb').style.transform = `translateX(calc(${i * 100}% + ${i * 4}px))`;
  const r = ROLE_ID[b.dataset.role];
  $('#idLabel').textContent = r.label; $('#l-id').value = r.demo; $('#idHint').textContent = r.hint; $('#loginNote').textContent = r.note;
  fldOf($('#l-id')).classList.remove('invalid');
});
$('#l-id').addEventListener('input', e => { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p, p); fldOf(e.target).classList.remove('invalid'); });
$('#loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const role = curRole(), idOk = ROLE_ID[role].re.test($('#l-id').value.trim()), pwOk = !!$('#l-pass').value;
  fldOf($('#l-id')).classList.toggle('invalid', !idOk); fldOf($('#l-pass')).classList.toggle('invalid', !pwOk);
  if (!idOk || !pwOk) { toast(!idOk ? `Check your ${ROLE_ID[role].label.toLowerCase()}.` : 'Enter your password.', 'bad'); return; }
  toast(`Logged in as ${$('#l-id').value.trim()}`);
  go(role);
});
$('#googleBtn').addEventListener('click', () => {
  const b = $('#googleBtn'); b.disabled = true; $('#googleLbl').textContent = 'Connecting to Google…';
  setTimeout(() => { b.disabled = false; $('#googleLbl').textContent = 'Continue with Google'; toast('Signed in with Google'); go(curRole()); }, 900);
});
$('#forgot').addEventListener('click', () => {
  openModal(`<h3 id="modalTitle">Reset your password</h3><p class="sub">Enter your ${ROLE_ID[curRole()].label.toLowerCase()} or email. We'll send a reset link to the email on your account.</p><form id="resetForm" style="display:grid;gap:14px;margin-top:18px" novalidate><div class="fld"><label for="rs-id">${ROLE_ID[curRole()].label} or email</label><input id="rs-id" autofocus><span class="err">Enter your ID or email.</span></div><button class="sbtn dark" type="submit" style="justify-self:start">${icon('send')}Send reset link</button></form>`);
  $('#resetForm').addEventListener('submit', ev => { ev.preventDefault(); if (!$('#rs-id').value.trim()) { fldOf($('#rs-id')).classList.add('invalid'); return; } closeModal(); toast('Reset link sent. Check your email.'); });
});

initBen();
initRails();
// close the About menu after a choice (hover/focus would keep it open)
$$('.dd').forEach(dd => {
  $$('.dd-menu a', dd).forEach(a => a.addEventListener('click', () => { dd.classList.add('shut'); a.blur(); }));
  dd.addEventListener('mouseleave', () => dd.classList.remove('shut'));
});
enhance(document);
route();