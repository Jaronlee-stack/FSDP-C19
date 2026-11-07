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
const DB_KEY = 'ask-prototype-v2';
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
  MC_REQUESTS = DB.mcRequests, FEEDBACK = DB.feedback, BOOKINGS = DB.bookings;

/* uploaded MC files only live for this page view (a real system would store them) */
const PREVIEWS = {};
