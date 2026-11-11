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
function signIn(role) { AUTH.role = role; try { sessionStorage.setItem('ask-role', role); } catch (_) {} }
function signOut() {
  const staff = isStaff(AUTH.role);
  AUTH.role = null;
  try { sessionStorage.removeItem('ask-role'); } catch (_) {}
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
function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(DB)); } catch (_) {} }
window.addEventListener('pagehide', save);   // every change is kept when you move to another page
function resetDemo() { try { localStorage.removeItem(DB_KEY); sessionStorage.clear(); } catch (_) {} location.href = url('landingpage/index.html'); }
document.addEventListener('click', e => { if (e.target.closest('[data-reset]')) { e.preventDefault(); resetDemo(); } });

/* short names used throughout the page scripts */
const MY_PASSES = DB.passes, STUDENTS = DB.students, APPS = DB.apps, MEMBERS = DB.members, SESSIONS = DB.sessions,
  GRAD_APPS = DB.gradApps, PROPOSALS = DB.proposals, CANDIDATES = DB.candidates, PAYS = DB.pays, GRADE = DB.grade,
  FEEDBACK = DB.feedback, BOOKINGS = DB.bookings, ATTENDANCE = DB.attendance, GRADE_FB = DB.gradingFeedback, MC_REQS = DB.mcRequests;

/* the signed-in student's own row in the instructor's student list */
const myStudent = () => STUDENTS.find(s => s.n === ME.name);

/* attendance outcome for the signed-in student (called when an instructor ends a class).
   present → +1 session toward the next grade. noshow → lesson stays used, no +1, no refund. */
function recordMyAttendance(rec) {
  const key = `${isoDate(rec.date)}|${rec.time}`;
  const i = ATTENDANCE.findIndex(a => `${isoDate(a.date)}|${a.time}` === key);
  if (i > -1) ATTENDANCE.splice(i, 1);
  ATTENDANCE.unshift(rec);
  const b = BOOKINGS.findIndex(x => x.key === key); if (b > -1) BOOKINGS.splice(b, 1);   // the booking is now history
  if (rec.status === 'present') {
    GRADE.sessions++;
    const s = myStudent(); if (s) { s.s++; s.seen = 0; }
    DB.levelUps.push({ kind: 'session', date: rec.date, type: rec.type });
  }
}