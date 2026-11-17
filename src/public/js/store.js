/* =====================================================================
   AIKIDO SHINJU-KAI — store.js
   Who is signed in, plus the prototype's "database".
   Each page is its own file now, so anything that changes (bookings,
   credits, applications, approvals) is kept in localStorage and read
   back on the next page. In the real system these become API calls.
   ===================================================================== */
'use strict';

/* ---------- sign-in (one per browser tab) ---------- */
const AUTH = { role: null };
try { AUTH.role = sessionStorage.getItem('ask-role'); } catch (_) {}
const isStaff = r => r === 'instructor' || r === 'admin';
function signIn(role) {
  AUTH.role = role; try { sessionStorage.setItem('ask-role', role); if (role !== 'admin') sessionStorage.removeItem('ask-admin'); } catch (_) {}
  if (role !== 'admin') ADMIN = null;
}
/* which office account is signed in: { id, name, type } with type 'frontdesk' (shown as "Admin") or 'business' (Business Admin).
   Prototype only: this lives in the browser, so the real system must check the role on the server for every request. */
let ADMIN = null;
try { ADMIN = JSON.parse(sessionStorage.getItem('ask-admin') || 'null'); } catch (_) {}
const isBA = () => !!ADMIN && ADMIN.type === 'business';
function signInAdmin(acct) {
  signIn('admin');
  ADMIN = { id: acct.id, name: acct.name, type: acct.type };
  try { sessionStorage.setItem('ask-admin', JSON.stringify(ADMIN)); } catch (_) {}
}
function signOut() {
  const staff = isStaff(AUTH.role);
  AUTH.role = null; ADMIN = null;
  try { sessionStorage.removeItem('ask-role'); sessionStorage.removeItem('ask-admin'); } catch (_) {}
  save();
  location.href = url(staff ? 'admin_portal/signin.html' : 'landingpage/index.html');
}
document.addEventListener('click', e => { if (e.target.closest('[data-logout]')) { e.preventDefault(); closeSM(); signOut(); } });

/* ---------- prototype database ---------- */
const DB_KEY = 'ask-prototype-v3';   // v3: attendance + grading feedback; mcRequests added later (merged in from SEED)
const reviveDates = (k, v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(v) ? new Date(v) : v;
const DB = (() => {
  try { const raw = localStorage.getItem(DB_KEY); if (raw) return Object.assign(SEED(), JSON.parse(raw, reviveDates)); } catch (_) {}
  return SEED();
})();
if (DB.rmSeed !== 2) {   // databases saved before the sample remarks existed: add them once, skipping any already there
  SEED().remarks.forEach(r => { if (!DB.remarks.some(x => x.kind === r.kind && x.student === r.student && x.text === r.text)) DB.remarks.push(r); });
  DB.rmSeed = 2;
}
if (!DB.fbSeed) { SEED().feedback.forEach(f => DB.feedback.push(f)); DB.fbSeed = true; }   // saved before sample feedback existed
function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch (_) {} }
window.addEventListener('pagehide', save);   // every change is kept when you move to another page
function resetDemo() { try { localStorage.removeItem(DB_KEY); sessionStorage.clear(); } catch (_) {} location.href = url('landingpage/index.html'); }
document.addEventListener('click', e => { if (e.target.closest('[data-reset]')) { e.preventDefault(); resetDemo(); } });

/* short names used throughout the page scripts */
const MY_PASSES = DB.passes, STUDENTS = DB.students, APPS = DB.apps, MEMBERS = DB.members, SESSIONS = DB.sessions,
  GRAD_APPS = DB.gradApps, PROPOSALS = DB.proposals, CANDIDATES = DB.candidates, PAYS = DB.pays, GRADE = DB.grade,
  FEEDBACK = DB.feedback, BOOKINGS = DB.bookings, ATTENDANCE = DB.attendance, GRADE_FB = DB.gradingFeedback, MC_REQS = DB.mcRequests;

/* office-portal sample data for databases saved before it existed (new top-level keys such as DB.staff already merge in from SEED).
   Adds more members and gives each weekly class a mat and an end time. Existing fields are never changed. Runs once. */
if (DB.admSeed !== 1) {
  const ago = n => { const d = new Date(TODAY); d.setDate(d.getDate() - n); return d; }, inDays = n => isoDate(ago(-n));
  const joined = n => `${MON[ago(n).getMonth()]} ${ago(n).getFullYear()}`;
  const M = (n, no, g, dojo, hrs, st, joinedAgo, x) => ({ n, no, g, dojo, hrs, st, joined: joined(joinedAgo), joinedAt: isoDate(ago(joinedAgo)), source: 'ASK', kind: 'adult', ...x });
  [
    M('Aiden Tan', 'ASK-2026-3101', '6th Kyu', 'hq', 6, 'Active', 30, { kind: 'child', dob: '2017-05-14', guardian: 'Mei Tan', phone: '9111 2201', email: 'mei.tan@email.com', seen: 3, left: 3, exp: inDays(21) }),
    M('Chloe Lim', 'ASK-2025-2718', '5th Kyu', 'hq', 44, 'Active', 200, { kind: 'child', dob: '2013-09-02', guardian: 'Alvin Lim', phone: '9222 3302', email: 'alvin.lim@email.com', seen: 5, left: 12, exp: inDays(90) }),
    M('Ethan Goh', 'ASK-2026-3102', '6th Kyu', 'hq', 4, 'Active', 45, { kind: 'child', dob: '2019-01-20', guardian: 'Pei Goh', phone: '9333 4403', email: 'pei.goh@email.com', seen: 6, left: 2, exp: inDays(14) }),
    M('Sophia Wong', 'ASK-2024-2255', '5th Kyu', 'bishan', 61, 'Active', 400, { kind: 'child', dob: '2011-11-08', guardian: 'Kelvin Wong', phone: '9444 5504', email: 'kelvin.wong@email.com', seen: 9, left: 8, exp: inDays(60) }),
    M('Ryan Chua', 'ASK-2026-3103', '6th Kyu', 'hq', 5, 'Active', 20, { dob: '2003-03-30', nsf: true, phone: '9555 6605', email: 'ryan.chua@email.com', seen: 2, left: 9, exp: inDays(70) }),
    M('Tan Siew Eng', 'ASK-2023-1942', '4th Kyu', 'hq', 132, 'Active', 700, { dob: '1957-07-12', phone: '9666 7706', email: 'siew.eng@email.com', seen: 4, left: 14, exp: inDays(80) }),
    M('Ivan Teo', 'ASK-2022-1177', '3rd Kyu', 'hq', 150, 'Lapsed', 900, { dob: '1989-02-17', phone: '9777 8807', email: 'ivan.teo@email.com', seen: 120, left: 0, exp: isoDate(ago(60)) }),
    M('Natalie Ho', 'ASK-2024-2031', '5th Kyu', 'hq', 38, 'Lapsed', 450, { dob: '1995-12-05', phone: '9888 9908', email: 'natalie.ho@email.com', seen: 95, left: 0, exp: isoDate(ago(30)) }),
    M('Faisal Hamid', 'ASK-2025-2490', '4th Kyu', 'hq', 52, 'Active', 260, { dob: '1991-06-21', phone: '9999 0009', email: 'faisal.h@email.com', seen: 2, left: 3, exp: inDays(5) }),
    M('Olivia Sim', 'ASK-2025-2511', '5th Kyu', 'hq', 40, 'Active', 240, { dob: '1998-10-10', phone: '9010 1110', email: 'olivia.sim@email.com', seen: 1, left: 4, exp: inDays(9) }),
    M('Benjamin Ong', 'ASK-2024-2188', '3rd Kyu', 'hq', 88, 'Active', 500, { dob: '1986-04-03', phone: '9121 2211', email: 'ben.ong@email.com', seen: 7, left: 11, exp: inDays(45), due: 48 }),
    M('Lakshmi Pillai', 'ASK-2023-1650', '2nd Kyu', 'hq', 170, 'Active', 800, { dob: '1980-08-26', phone: '9232 3312', email: 'lakshmi.p@email.com', seen: 3, left: 6, exp: inDays(50), due: 96 }),
    M('Daniel Park', 'EXT-2026-0041', '6th Kyu', 'tampines', 8, 'Active', 60, { dob: '1994-01-09', source: 'External', phone: '9343 4413', email: 'daniel.park@email.com', seen: 10, left: 0, exp: inDays(30) }),
    M('Yuki Tanaka', 'EXT-2026-0042', '5th Kyu', 'bedok', 22, 'Active', 85, { dob: '1990-05-28', source: 'External', phone: '9454 5514', email: 'yuki.t@email.com', seen: 16, left: 0, exp: inDays(25) }),
    M('Joel Lee', 'ASK-2026-3104', '6th Kyu', 'hq', 7, 'Active', 75, { dob: '2000-09-15', phone: '9565 6615', email: 'joel.lee@email.com', seen: 18, left: 5, exp: inDays(40) })
  ].forEach(m => { if (!MEMBERS.some(x => x.no === m.no)) MEMBERS.push(m); });
  SESSIONS.forEach(s => {
    if (!s.mat) s.mat = 'Mat A';
    if (!s.start) s.start = s.time;
    if (!s.end) s.end = `${String(Math.min(23, +s.time.slice(0, 2) + 1)).padStart(2, '0')}:${s.time.slice(3)}`;
    if (s.online === undefined) s.online = s.dojo === HQ;
  });
  DB.admSeed = 1;
}

/* the signed-in student's own row in the instructor's student list */
const myStudent = () => STUDENTS.find(s => s.n === ME.name);

/* the instructor remarks a student can read: notes for classes they attended, plus remarks and grading notes written about them. Newest first. */
function remarksForStudent(name) {
  const keys = new Set(ATTENDANCE.filter(a => a.status === 'present').map(a => `${isoDate(new Date(a.date))}|${a.time}`));
  return DB.remarks.filter(r => r.student === name || (r.kind === 'class' && !r.student && keys.has(r.key))).sort((a, b) => new Date(b.at) - new Date(a.at));
}

/* attendance outcome for the signed-in student (called when an instructor ends a class).
   present → +1 session toward the next grade. noshow → lesson stays used, no +1, no refund. */
function recordMyAttendance(rec) {
  const key = `${isoDate(rec.date)}|${rec.time}`;
  const i = ATTENDANCE.findIndex(a => `${isoDate(a.date)}|${a.time}` === key);
  const already = i > -1 && ATTENDANCE[i].status === 'present';   // e.g. checked in by scan, then the instructor ends the class
  if (i > -1) ATTENDANCE.splice(i, 1);
  ATTENDANCE.unshift(rec);
  const b = BOOKINGS.findIndex(x => x.key === key); if (b > -1) BOOKINGS.splice(b, 1);   // the booking is now history
  if (rec.status === 'present' && !already) {
    GRADE.sessions++;
    const s = myStudent(); if (s) { s.s++; s.seen = 0; }
    DB.levelUps.push({ kind: 'session', date: rec.date, type: rec.type });
  }
}