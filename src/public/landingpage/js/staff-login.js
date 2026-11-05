'use strict';
/* AIKIDO SHINJU-KAI — staff-login.js  (instructors + HQ admin; this page is not linked from the public site) */

if (new URLSearchParams(location.search).has('denied')) toast('Sign in with the right staff account for that portal.', 'bad');

/* staff sign-in (instructors + HQ admin) — separate page, not linked publicly */
const STAFF_ID = {
  instructor: { label: 'Instructor ID', demo: 'INS-0042', hint: 'Issued by the HQ office, e.g. INS-0042', re: /^INS-\d{4}$/ },
  admin: { label: 'Admin ID', demo: 'ADM-001', hint: 'Issued by a system administrator, e.g. ADM-001', re: /^ADM-\d{3}$/ }
};
const staffRole = () => $('#roleTabs .on').dataset.role;
$('#roleTabs').addEventListener('click', e => {
  const b = e.target.closest('[data-role]'); if (!b) return;
  const tabs = $$('#roleTabs [data-role]'), i = tabs.indexOf(b);
  tabs.forEach(t => { t.classList.toggle('on', t === b); t.setAttribute('aria-selected', t === b); });
  $('#roleTabs .thumb').style.transform = `translateX(calc(${i * 100}% + ${i * 4}px))`;
  const r = STAFF_ID[b.dataset.role];
  $('#sIdLabel').textContent = r.label; $('#s-id').value = r.demo; $('#sIdHint').textContent = r.hint;
  fldOf($('#s-id')).classList.remove('invalid');
});
$('#s-id').addEventListener('input', e => { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p, p); fldOf(e.target).classList.remove('invalid'); });
$('#staffForm').addEventListener('submit', e => {
  e.preventDefault();
  const role = staffRole(), idOk = STAFF_ID[role].re.test($('#s-id').value.trim()), pwOk = !!$('#s-pass').value;
  fldOf($('#s-id')).classList.toggle('invalid', !idOk); fldOf($('#s-pass')).classList.toggle('invalid', !pwOk);
  if (!idOk || !pwOk) { toast(!idOk ? `Check your ${STAFF_ID[role].label.toLowerCase()}.` : 'Enter your password.', 'bad'); return; }
  signIn(role);
  location.href = url(`staff/${role}/index.html`);
});
