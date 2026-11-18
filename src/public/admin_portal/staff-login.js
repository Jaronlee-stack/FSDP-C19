'use strict';
/* AIKIDO SHINJU-KAI — staff-login.js  (instructors + office staff; this page is not linked from the public site) */

{
  const q = new URLSearchParams(location.search);
  if (q.has('denied')) toast('Sign in with the right staff account for that portal.', 'bad');
  else if (q.has('expired')) toast('Your session expired. Sign in again.', 'bad');
  else if (q.has('deactivated')) toast('This account was deactivated. Ask a Business Admin to reactivate it.', 'bad');
}

/* staff sign-in (instructors + office staff). The account's own type decides what an admin can open; nobody picks their access level.
   Prototype only: the real system checks the ID and password on the server. */
const STAFF_ID = {
  instructor: { label: 'Instructor ID', demo: 'INS-0042', hint: 'Issued by a Business Admin, e.g. INS-0042', re: /^INS-\d{4}$/, types: ['instructor'] },
  admin: { label: 'Admin ID', demo: 'ADM-101', hint: 'Demo: ADM-001 (Business Admin) or ADM-101 (Admin)', re: /^ADM-\d{3}$/, types: ['frontdesk', 'business'] }
};
const staffRole = () => $('#roleTabs .on').dataset.role;
/* the page cannot look accounts up (that would reveal which IDs exist): it only shows the format hint */
function showHint() { $('#sIdHint').textContent = STAFF_ID[staffRole()].hint; }
$('#roleTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-role]'); if (!b) return;
  const tabs = $$('#roleTabs [data-role]'), i = tabs.indexOf(b);
  tabs.forEach(t => { t.classList.toggle('on', t === b); t.setAttribute('aria-selected', t === b); });
  $('#roleTabs .thumb').style.transform = `translateX(calc(${i * 100}% + ${i * 4}px))`;
  const r = STAFF_ID[b.dataset.role];
  $('#sIdLabel').textContent = r.label; $('#s-id').value = r.demo; showHint();
  fldOf($('#s-id')).classList.remove('invalid');
});
$('#s-id').addEventListener('input', e => { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p, p); fldOf(e.target).classList.remove('invalid'); showHint(); });
$('#staffForm').addEventListener('submit', async e => {
  e.preventDefault();
  const role = staffRole(), id = $('#s-id').value.trim(), idOk = STAFF_ID[role].re.test(id), pwOk = !!$('#s-pass').value;
  fldOf($('#s-id')).classList.toggle('invalid', !idOk); fldOf($('#s-pass')).classList.toggle('invalid', !pwOk);
  if (!idOk || !pwOk) { toast(!idOk ? `Check your ${STAFF_ID[role].label.toLowerCase()}.` : 'Enter your password.', 'bad'); return; }
  const btn = $('#staffForm button[type="submit"]'); if (btn) btn.disabled = true;
  try {
    await ASK.post('/auth/login', { portal: role, identifier: id, password: $('#s-pass').value }, { noRedirect: true });
    location.href = url(`${role}_portal/index.html`);
  } catch (err) {
    if (btn) btn.disabled = false;
    toast(err.status === 401 ? `That ${STAFF_ID[role].label.toLowerCase()} and password do not match.` : err.message, 'bad');
  }
});
