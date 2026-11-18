'use strict';
/* AIKIDO SHINJU-KAI — login.js  (member log in; students only). The server checks the password and sets the session cookie. */

const toPortal = () => { location.href = url('student_portal/index.html'); };
const ID_RE = /^(ASK|EXT)-\d{4}-\d{4}$/i, EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

$('#l-id').addEventListener('input', e => { const p = e.target.selectionStart; e.target.value = e.target.value.toUpperCase(); e.target.setSelectionRange(p, p); fldOf(e.target).classList.remove('invalid'); });
$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('#l-id').value.trim(), idOk = ID_RE.test(id) || EMAIL_RE.test(id), pwOk = !!$('#l-pass').value;
  fldOf($('#l-id')).classList.toggle('invalid', !idOk); fldOf($('#l-pass')).classList.toggle('invalid', !pwOk);
  if (!idOk || !pwOk) { toast(!idOk ? 'Check your membership ID.' : 'Enter your password.', 'bad'); return; }
  const btn = $('#loginForm button[type="submit"]'); if (btn) btn.disabled = true;
  try {
    await ASK.post('/auth/login', { portal: 'student', identifier: id, password: $('#l-pass').value }, { noRedirect: true });
    toPortal();
  } catch (err) {
    if (btn) btn.disabled = false;
    toast(err.status === 401 ? 'That membership ID and password do not match.' : err.message, 'bad');
  }
});
$('#googleBtn').addEventListener('click', () => toast('Google sign-in is not available yet. Use your membership ID.', 'info'));
$('#forgot').addEventListener('click', () => {
  openModal(`<h3 id="modalTitle">Reset your password</h3><p class="sub">Enter your membership ID or email. We'll send a reset link to the email on your account.</p><form id="resetForm" style="display:grid;gap:14px;margin-top:18px" novalidate><div class="fld"><label for="rs-id">Membership ID or email</label><input id="rs-id" autofocus><span class="err">Enter your ID or email.</span></div><button class="sbtn dark" type="submit" style="justify-self:start">${icon('send')}Send reset link</button></form>`);
  $('#resetForm').addEventListener('submit', async ev => {
    ev.preventDefault();
    const v = $('#rs-id').value.trim();
    if (!v) { fldOf($('#rs-id')).classList.add('invalid'); return; }
    try { await ASK.post('/auth/forgot-password', { identifier: v }, { noRedirect: true }); closeModal(); toast('Reset link sent. Check your email.'); }
    catch (err) { toast(err.message, 'bad'); }
  });
});
