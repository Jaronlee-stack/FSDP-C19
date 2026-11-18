/* =====================================================================
   AIKIDO SHINJU-KAI — account.js  (loaded by api.js on every signed-in portal page)
   ASK.openChangePassword({ forced }): the one change-password dialog for students, instructors and office staff.
   forced = the account must change its password before anything else (locked dialog, no close button, Escape or overlay).
   Nothing is stored in the browser; the typed passwords only live in the form until it closes.
   ===================================================================== */
'use strict';

(function () {
  const RULES = [
    ['len', 'At least 8 characters', v => v.length >= 8],
    ['let', 'A letter', v => /[A-Za-z]/.test(v)],
    ['num', 'A number', v => /\d/.test(v)]
  ];
  const tooLong = v => new TextEncoder().encode(v).length > 72;

  const field = (id, label, auto, extra = '') =>
    `<div class="fld"><label for="${id}">${esc(label)}</label><div class="pw-wrap"><input id="${id}" type="password" autocomplete="${auto}" maxlength="200" spellcheck="false"${extra}>${pwEye()}</div><span class="err"></span></div>`;

  function setErr(id, msg) {
    const f = fldOf($('#' + id));
    $('.err', f).textContent = msg || '';
    f.classList.toggle('invalid', !!msg);
  }

  async function leave() {
    const staff = ASK.me && (ASK.me.role === 'admin' || ASK.me.role === 'instructor');
    try { await ASK.post('/auth/logout', {}, { noRedirect: true }); } catch (_) { /* the cookie may already be gone */ }
    location.href = url(staff ? 'admin_portal/signin.html' : 'landingpage/index.html');
  }

  ASK.openChangePassword = function ({ forced = false } = {}) {
    openModal(`<h3 id="modalTitle">${forced ? 'Choose a new password' : 'Change password'}</h3>
      <p class="sub">${forced ? 'You must set your own password before you continue. Enter the password you were given, then choose a new one.' : 'Choose a password you do not use anywhere else.'}</p>
      <form id="cpForm" style="display:grid;gap:14px;margin-top:18px" novalidate>
        ${field('cp-cur', forced ? 'Password you were given' : 'Current password', 'current-password', ' autofocus')}
        ${field('cp-new', 'New password', 'new-password')}
        <div class="pw-rules" id="cpRules" aria-live="polite">${RULES.map(r => `<span data-r="${r[0]}">${esc(r[1])}</span>`).join('')}</div>
        ${field('cp-new2', 'Confirm new password', 'new-password')}
        <div class="form-err" id="cpErr" role="alert" hidden></div>
        <div class="acts" style="margin-top:4px"><button class="sbtn dark" type="submit" id="cpGo">Update password</button></div>
        ${forced ? '<button type="button" class="signout-link" id="cpOut">Sign out</button>' : ''}
      </form>`, false, { locked: forced });

    const form = $('#cpForm'), box = $('#cpErr'), go = $('#cpGo');
    const showErr = m => { box.textContent = m; box.hidden = !m; };
    const paintRules = () => {
      const v = $('#cp-new').value;
      RULES.forEach(r => $(`#cpRules [data-r="${r[0]}"]`).classList.toggle('ok', r[2](v)));
    };
    $('#cp-new').addEventListener('input', paintRules);
    if (forced) $('#cpOut').addEventListener('click', leave);

    form.addEventListener('submit', async e => {
      e.preventDefault();
      showErr('');
      const cur = $('#cp-cur').value, nw = $('#cp-new').value, nw2 = $('#cp-new2').value;
      setErr('cp-cur', cur ? '' : 'Enter your current password.');
      let bad = !cur;
      const strength = RULES.some(r => !r[2](nw)) ? 'Use at least 8 characters with a letter and a number.' : tooLong(nw) ? 'That password is too long.' : '';
      setErr('cp-new', strength); if (strength) bad = true;
      const mism = nw !== nw2 ? 'Passwords do not match.' : '';
      setErr('cp-new2', mism); if (mism) bad = true;
      if (bad) return;
      go.disabled = true;
      try {
        await ASK.post('/auth/change-password', { currentPassword: cur, newPassword: nw, confirmPassword: nw2 }, { noRedirect: true });
      } catch (err) {
        go.disabled = false;
        if (err.code === 'CURRENT_PASSWORD_INCORRECT') setErr('cp-cur', err.message || 'Current password is incorrect.');
        else if (err.code === 'WEAK_PASSWORD') setErr('cp-new', err.message || 'Choose a stronger password.');
        else if (err.code === 'PASSWORD_REUSED') setErr('cp-new', err.message || 'Choose a password you have not used before.');
        else if (err.status === 429) showErr('Too many attempts. Wait a few minutes and try again.');
        else showErr(err.message || 'Could not update the password. Please try again.');
        return;
      }
      ['cp-cur', 'cp-new', 'cp-new2'].forEach(id => { $('#' + id).value = ''; });
      toast('Password updated');
      if (forced) { setTimeout(() => location.reload(), 700); return; }
      closeModal();
    });
  };

  /* any [data-account] button (admin sidebar, phone menu, student and instructor profile pages) */
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-account]')) return;
    e.preventDefault(); closeSM(); ASK.openChangePassword();
  });
})();
