'use strict';
/* AIKIDO SHINJU-KAI — login.js  (member log in; students only) */

try { const last = sessionStorage.getItem('ask-last-id'); if (last) $('#l-id').value = last; } catch (_) {}
const toPortal = () => { location.href = url('student_portal/index.html'); };

$('#l-id').addEventListener('input', e => { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p, p); fldOf(e.target).classList.remove('invalid'); });
$('#loginForm').addEventListener('submit', e => {
  e.preventDefault();
  const idOk = /^ASK-\d{4}-\d{4}$/.test($('#l-id').value.trim()), pwOk = !!$('#l-pass').value;
  fldOf($('#l-id')).classList.toggle('invalid', !idOk); fldOf($('#l-pass')).classList.toggle('invalid', !pwOk);
  if (!idOk || !pwOk) { toast(!idOk ? 'Check your membership ID.' : 'Enter your password.', 'bad'); return; }
  signIn('student');
  toPortal();
});
$('#googleBtn').addEventListener('click', () => {
  const b = $('#googleBtn'); b.disabled = true; $('#googleLbl').textContent = 'Connecting to Google…';
  setTimeout(() => { signIn('student'); toPortal(); }, 900);
});
$('#forgot').addEventListener('click', () => {
  openModal(`<h3 id="modalTitle">Reset your password</h3><p class="sub">Enter your membership ID or email. We'll send a reset link to the email on your account.</p><form id="resetForm" style="display:grid;gap:14px;margin-top:18px" novalidate><div class="fld"><label for="rs-id">Membership ID or email</label><input id="rs-id" autofocus><span class="err">Enter your ID or email.</span></div><button class="sbtn dark" type="submit" style="justify-self:start">${icon('send')}Send reset link</button></form>`);
  $('#resetForm').addEventListener('submit', ev => { ev.preventDefault(); if (!$('#rs-id').value.trim()) { fldOf($('#rs-id')).classList.add('invalid'); return; } closeModal(); toast('Reset link sent. Check your email.'); });
});
