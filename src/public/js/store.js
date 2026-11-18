/* =====================================================================
   AIKIDO SHINJU-KAI — store.js
   Who is signed in (from the server) plus the in-memory data the pages render.
   Nothing is stored in the browser: the account comes from GET /auth/me (see api.js)
   and every page fills the slices of DB it needs from the API.
   ===================================================================== */
'use strict';

/* ---------- sign-in: decided by the server, read here for the UX gating in portal.js ---------- */
const AUTH = { role: ASK.me ? ASK.me.role : null };
const isStaff = r => r === 'instructor' || r === 'admin';
/* which office account is signed in: { id, name, type } with type 'frontdesk' (Front desk) or 'business' (Business Admin).
   The menu gating in portal.js is only a convenience: the server checks the role and admin type on every request. */
let ADMIN = ASK.me && ASK.me.role === 'admin' ? { id: ASK.me.id, name: ASK.me.name, type: ASK.me.adminType } : null;
const isBA = () => !!ADMIN && ADMIN.type === 'business';
async function signOut() {
  const staff = isStaff(AUTH.role);
  try { await ASK.post('/auth/logout', {}, { noRedirect: true }); } catch (_) { /* the cookie may already be gone */ }
  AUTH.role = null; ADMIN = null;
  location.href = url(staff ? 'admin_portal/signin.html' : 'landingpage/index.html');
}
document.addEventListener('click', e => { if (e.target.closest('[data-logout]')) { e.preventDefault(); closeSM(); signOut(); } });

/* ---------- in-memory database ----------
   DB has the same top-level keys the pages have always read. emptyDB() gives every key an empty value; the per-portal data
   modules fill them IN PLACE (arrays: ASK.fill) because MY_PASSES, STUDENTS, ... below hold references to them.
   Nothing in it comes from the browser's storage and nothing is saved: a reload starts empty and loads again. */
function emptyDB() {
  const lists = ['passes', 'students', 'apps', 'members', 'sessions', 'gradApps', 'proposals', 'candidates', 'pays', 'feedback', 'remarks',
    'panels', 'attendance', 'levelUps', 'gradingFeedback', 'mcRequests', 'bookings', 'rateQueue', 'rated', 'prompted', 'checkIns', 'staff', 'ledger',
    'refunds', 'exceptions', 'guests', 'equipment', 'followups', 'closures', 'imports', 'sentLog'];
  const out = { unlimited: null, grade: {}, classEnded: {}, rosters: {}, memberInfo: {}, policies: {} };
  lists.forEach(k => { out[k] = []; });
  return out;
}

const DB = emptyDB();
ASK.applyPolicies(DB.policies);   // prices and rules always come from the server

/* short names used throughout the page scripts */
const MY_PASSES = DB.passes, STUDENTS = DB.students, APPS = DB.apps, MEMBERS = DB.members, SESSIONS = DB.sessions,
  GRAD_APPS = DB.gradApps, PROPOSALS = DB.proposals, CANDIDATES = DB.candidates, PAYS = DB.pays, GRADE = DB.grade,
  FEEDBACK = DB.feedback, BOOKINGS = DB.bookings, ATTENDANCE = DB.attendance, GRADE_FB = DB.gradingFeedback, MC_REQS = DB.mcRequests;

/* the instructor remarks a student can read: notes for classes they attended, plus remarks and grading notes written about them. Newest first. */
function remarksForStudent(name) {
  const keys = new Set(ATTENDANCE.filter(a => a.status === 'present').map(a => `${isoDate(new Date(a.date))}|${a.time}`));
  return DB.remarks.filter(r => r.student === name || (r.kind === 'class' && !r.student && keys.has(r.key))).sort((a, b) => new Date(b.at) - new Date(a.at));
}

/* The check-in mock (student_portal/checkin.html and the scan sheet): the outcome of a scan for the signed-in student, in memory only.
   The check-in feature is not built on the server yet, so nothing is sent or stored. */
function recordMyAttendance(rec) {
  const key = `${isoDate(rec.date)}|${rec.time}`;
  const i = ATTENDANCE.findIndex(a => `${isoDate(a.date)}|${a.time}` === key);
  const already = i > -1 && ATTENDANCE[i].status === 'present';
  if (i > -1) ATTENDANCE.splice(i, 1);
  ATTENDANCE.unshift(rec);
  const b = BOOKINGS.findIndex(x => x.key === key); if (b > -1) BOOKINGS.splice(b, 1);   // the booking is now history
  if (rec.status === 'present' && !already) {
    if (GRADE && typeof GRADE.sessions === 'number') GRADE.sessions++;
    DB.levelUps.push({ kind: 'session', date: rec.date, type: rec.type });
  }
}
