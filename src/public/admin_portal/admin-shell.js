'use strict';
/* AIKIDO SHINJU-KAI — admin-shell.js  (office portal: role helpers and shared rules, loaded after portal.js on every admin page)

   SECURITY NOTE: the role checks in this file only tidy the page. The server checks who is signed in, whether the account
   is active, and whether its role (Admin = front desk, Business Admin) may do the action or read the record, on every request.
   Hiding or removing a button here is only a courtesy to the user, never the protection. */

/* ---------- role-based removal ----------
   Anything marked data-ba is for Business Admins only. For the front desk it is removed from the page (not just hidden),
   so it cannot be found by reading the page or switching a style back on. Call stripBA(box) again after drawing new HTML. */
function stripBA(root = document) {
  if (isBA()) return;
  $$('[data-ba]', root).forEach(el => el.remove());
}
if (PORTAL === 'admin' && ALLOWED && !GATED) stripBA();

/* message after the guard sends the front desk back from a Business Admin page */
function showFlash() {
  const q = new URLSearchParams(location.search);
  if (!q.has('baonly')) return;
  toast('That page is for Business Admins', 'info');
  try { q.delete('baonly'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); } catch (_) {}
}
if (PORTAL === 'admin' && ALLOWED && !GATED) showFlash();

/* ---------- dates and money ---------- */
const ageOn = (dob, on = TODAY) => {
  if (!dob) return null;
  const b = new Date(dob); let a = on.getFullYear() - b.getFullYear();
  if (on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate())) a--;
  return a;
};
/* ---------- who may join which class ----------
   Same rules as whyNot() in data.js, but for any person, not only the signed-in student.
   person: { g (grade), gender, age }. Returns '' when allowed, otherwise the reason. */
function whyNotFor(person, cls) {
  if (cls.kids) return person.age != null && person.age < 16 ? '' : 'Children only';
  if (cls.type === 'Ladies' && person.gender !== 'Female') return 'Ladies only';
  if (cls.type === 'SG50' && person.age != null && person.age < 50) return 'Ages 50 & above';
  const r = CLASS_RULES[cls.type];
  if (r && kyuOf(person.g) > r.maxKyu) return r.why;
  return '';
}

/* ---------- discounts ----------
   Read from Policies. Age comes from the date of birth, so no proof is needed for age discounts.
   NSF status is verified by a Business Admin from the papers, so it is passed in as a flag.
   Returns { pct, label } with pct 0 when none applies. */
function discountFor(dob, nsVerified = false) {
  const d = (DB.policies || {}).discounts || { senior: { age: 65, pct: 40 }, student: { from: 17, to: 25, pct: 50 } };
  const age = ageOn(dob);
  if (age != null && age >= d.senior.age) return { pct: d.senior.pct, label: `Age ${d.senior.age}+ · ${d.senior.pct}% off` };
  if (nsVerified) return { pct: d.student.pct, label: `NSF · ${d.student.pct}% off` };
  if (age != null && age >= d.student.from && age <= d.student.to) return { pct: d.student.pct, label: `Age ${d.student.from} to ${d.student.to} · ${d.student.pct}% off` };
  return { pct: 0, label: '' };
}
