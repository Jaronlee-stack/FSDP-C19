'use strict';
/* AIKIDO SHINJU-KAI — join.js  (membership registration) */

/* ---------- 7. REGISTRATION ---------- */
const reg = { step: 1, verified: false, age: null, group: 'adult', sig: null };
const regMinor = () => reg.age !== null && reg.age < 21;


function initJoin() {
  $('#dojoChoices').innerHTML = DOJOS.filter(d => !d.status).map(d => `<div class="choice"><input type="radio" name="dojo" id="dj-${d.id}" value="${d.id}"><label for="dj-${d.id}"><span class="top"><span class="t">${esc(d.name)}</span><span class="tick">${icon('check')}</span></span><span class="d">${esc(d.addr)}</span></label></div>`).join('');
  $('#sizePick').innerHTML = DOGI_SIZES.map(s => `<div class="choice"><input type="radio" name="size" id="sz-${s}" value="${s}"><label for="sz-${s}">${s}</label></div>`).join('');

  $('#r-dob').addEventListener('change', updateAge);
  $$('input[name="gender"]').forEach(r => r.addEventListener('change', updateClasses));

  const bindYN = (name, reveal) => $$(`input[name="${name}"]`).forEach(r => r.addEventListener('change', () => {
    $(reveal).classList.toggle('open', radio(name) === 'Yes');
    mark('#f-' + name, false);
  }));
  bindYN('prev', '#prevReveal'); bindYN('med', '#medReveal');

  $('#regForm').addEventListener('input', e => { const f = fldOf(e.target); if (f) f.classList.remove('invalid'); });
  $('#regForm').addEventListener('change', e => {
    if (e.target.dataset.iso) { const f = fldOf(e.target); f && f.classList.remove('invalid'); }
    if (e.target.name === 'dojo') mark('#f-dojo', false);
    if (e.target.name === 'dogi') mark('#f-dogi', false);
    if (e.target.name === 'size') mark(fldOf($('#sizePick')), false);
    if (e.target.name === 'pkg') mark('#f-pkg', false);
  });

  // email verification (CodeSlots)
  const send = $('#sendCode');
  $('#r-email').addEventListener('input', () => {
    if (reg.verified) { reg.verified = false; $('#emailOk').hidden = true; send.hidden = false; }
    $('#otpReveal').classList.remove('open');
  });
  send.addEventListener('click', () => {
    const v = val('r-email');
    if (!emailOk(v)) { mark(fldOf($('#r-email')), true); $('#emailErr').textContent = 'Enter a valid email address first.'; $('#r-email').focus(); return; }
    $('#otpTo').textContent = v;
    $('#otpReveal').classList.add('open');
    $('#slots').reset();
    send.textContent = 'Code sent';
    setTimeout(() => { send.textContent = 'Resend'; }, 2500);
    setTimeout(() => $('#otpInput').focus(), 250);
    toast(`Code sent to ${v}`, 'info');
  });
  $('#resend').addEventListener('click', () => { $('#slots').reset(); toast('New code sent', 'info'); $('#otpInput').focus(); });
  codeSlots($('#slots'), () => {
    reg.verified = true;
    $('#otpReveal').classList.remove('open');
    $('#emailOk').hidden = false; send.hidden = true;
    mark(fldOf($('#r-email')), false);
    toast('Email verified');
  });

  $$('#regForm [data-next]').forEach(b => b.addEventListener('click', () => { if (validateStep(reg.step)) setStep(reg.step + 1); }));
  $$('#regForm [data-prev]').forEach(b => b.addEventListener('click', () => setStep(reg.step - 1)));
  $('#regForm').addEventListener('submit', e => e.preventDefault());

  // T&C — must scroll to the end before the box unlocks
  const body = $('#tcBody');
  body.addEventListener('scroll', () => {
    const max = body.scrollHeight - body.clientHeight;
    const pct = max > 0 ? Math.min(100, Math.round(body.scrollTop / max * 100)) : 100;
    $('#tcBar').style.width = pct + '%';
    $('#tcPct').textContent = pct + '% read';
    if (pct >= 98 && $('#tcAgree').disabled) {
      $('#tcAgree').disabled = false;
      $('#tcAgreeWrap').classList.remove('locked');
      $('#tcAgreeHint').textContent = 'Thanks for reading. You can agree now.';
      $('#tcFade').classList.add('read');
    }
  });
  ['tcAgree', 'pdpa'].forEach(id => $('#' + id).addEventListener('change', updatePayLock));

  // legally binding signature (applicant, or parent/guardian if under 21)
  reg.sig = signaturePad($('#regSig'), { onChange: () => { mark('#f-regsig', false); updatePayLock(); } });
  $('#r-gname').addEventListener('input', updatePayLock);

  slideCommit($('#regSlide'), completeRegistration);

  $('#mailTabs').addEventListener('click', e => {
    const b = e.target.closest('[data-mail]'); if (!b) return;
    $$('#mailTabs .fpill').forEach(x => x.classList.toggle('on', x === b));
    renderMail(b.dataset.mail);
  });

  updateClasses(); renderPackages(); setStep(1);
}

function updateAge() {
  const v = $('#r-dob').dataset.iso;
  if (!v) { reg.age = null; $('#r-age').value = ''; updateClasses(); return; }
  const [yy, mm, dd] = v.split('-').map(Number);
  const d = new Date(yy, mm - 1, dd), now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  reg.age = age;
  $('#r-age').value = age >= 0 ? `${age} years old` : '';
  const kid = age < 13;
  reg.group = kid ? 'kids' : 'adult';
  $('#ageHint').textContent = age < 4 ? 'Members must be at least 4.' : kid ? 'Children\'s classes and fees apply (ages 4–12). A parent or guardian signs the form.' : age < 21 ? 'Adult class. Under 21: a parent or guardian signs the form.' : 'Adult classes and fees apply.';
  mark(fldOf($('#r-dob')), age < 4);
  updateClasses(); renderPackages();
}

function updateClasses() {
  const age = reg.age, female = radio('gender') === 'Female';
  let opts;
  if (age !== null && age < 13) opts = [age <= 6 ? 'Children Juniors (ages 4–6)' : null, 'Children Beginners (ages 4–12)', 'Mixed (all ages)'].filter(Boolean);
  else opts = ['Adults (13 & above)', 'Mixed (all ages)'].concat(female ? ['Ladies'] : []);
  const cur = $('#r-class').value;
  $('#r-class').innerHTML = opts.map(o => `<option${o === cur ? ' selected' : ''}>${o}</option>`).join('');
  $('#classHint').textContent = age === null ? 'Enter your date of birth to see the right classes.' : 'Suggested from your age. You can switch later.';
}

function renderPackages() {
  const list = PKG[reg.group];
  $('#pkgGroupTitle').textContent = reg.group === 'kids' ? 'Children packages' : 'Adult packages';
  const cur = radio('pkg');
  $('#pkgChoices').innerHTML = list.map(p => `<div class="choice"><input type="radio" name="pkg" id="pk-${p.id}" value="${p.id}"${p.id === cur ? ' checked' : ''}><label for="pk-${p.id}"><span class="top"><span class="t">${p.t}${p.best ? ' <span class="pill navy plain" style="margin-left:6px;height:20px;font-size:11px">Popular</span>' : ''}</span><span class="tick">${icon('check')}</span></span><span class="d">${p.d}</span><span class="price num">${money(p.amt)}<small style="font-size:13px;font-weight:500;color:var(--muted)"> ${p.unit || ''}</small></span><span class="d">${p.per} · ${p.lessons === Infinity ? p.valid : 'expires ' + fmtDate(expiryFor(p))}</span></label></div>`).join('');
}

function validateStep(n) {
  const bad = [];
  const need = (cond, el) => { mark(el, !cond); if (!cond) bad.push(el); };
  if (n === 1) {
    need(!!val('r-name'), fldOf($('#r-name')));
    need(!!radio('gender'), fldOf($('#g-m')));
    need(!!val('r-nat'), fldOf($('#r-nat')));
    need(reg.age !== null && reg.age >= 4, fldOf($('#r-dob')));
    need(phoneOk(val('r-phone')), fldOf($('#r-phone')));
    const ef = fldOf($('#r-email'));
    if (!emailOk(val('r-email'))) { $('#emailErr').textContent = 'Enter a valid email address.'; need(false, ef); }
    else if (!reg.verified) { $('#emailErr').textContent = 'Verify your email with the 6-digit code before continuing.'; need(false, ef); }
    else mark(ef, false);
    need(!!val('r-ecname'), fldOf($('#r-ecname')));
    need(!!val('r-ecrel'), fldOf($('#r-ecrel')));
    need(phoneOk(val('r-ecphone')), fldOf($('#r-ecphone')));
  }
  if (n === 2) {
    // a certificate on its own isn't enough: say which martial art it is for
    reg.exps.forEach(x => { if ((x.files.length || x.grade) && !x.art.trim()) need(false, fldOf($(`#exp-art-${x.id}`))); });
    need(!!radio('prev'), $('#f-prev'));
    if (radio('prev') === 'Yes') need(!!$('#r-prevdate').dataset.iso, fldOf($('#r-prevdate')));
    need(!!radio('med'), $('#f-med'));
    if (radio('med') === 'Yes') need(!!val('r-med'), fldOf($('#r-med')));
  }
  if (n === 3) {
    need(!!radio('dojo'), $('#f-dojo'));
    need(!!$('#r-class').value, fldOf($('#r-class')));
    need(!!radio('dogi'), $('#f-dogi'));
    need(!!radio('size'), fldOf($('#sizePick')));
  }
  if (n === 4) need(!!radio('pkg'), $('#f-pkg'));
  if (bad.length) {
    const first = bad[0];
    first.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    const focusable = $('.cs-btn, input:not([type=radio]):not([type=checkbox]):not([readonly]):not(.cap), textarea', first);
    focusable && setTimeout(() => focusable.focus({ preventScroll: true }), 300);
    toast(bad.length === 1 ? 'One field needs your attention.' : `${bad.length} fields need your attention.`, 'bad');
    return false;
  }
  return true;
}

function setStep(n) {
  reg.step = Math.max(1, Math.min(6, n));
  $$('#regForm .rstep').forEach(s => s.classList.toggle('on', +s.dataset.step === reg.step));
  $$('#regSteps li').forEach(li => {
    const s = +li.dataset.s;
    li.classList.toggle('on', s === reg.step);
    li.classList.toggle('done', s < reg.step);
  });
  $('#regProg').style.width = Math.min(100, reg.step / 5 * 100) + '%';
  $('#regMobileStep').textContent = reg.step <= 5 ? `Step ${reg.step} of 5` : 'Complete';
  if (reg.step === 5) { buildReview(); syncSigner(); updatePayLock(); }
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

function syncSigner() {
  const minor = regMinor();
  $('#f-gname').hidden = !minor;
  $('#regSigLbl').textContent = minor ? "Parent or guardian's signature" : "Applicant's signature";
  $('#sigWho').textContent = minor
    ? `Applicants under 21 must have a parent or guardian sign. They accept the terms on ${val('r-name').split(' ')[0] || 'the applicant'}'s behalf.`
    : 'Sign with your finger, stylus or mouse. Your signature confirms the declaration above.';
  $('#regSigMeta').textContent = `Signed digitally on ${fmtDate(new Date())}. A copy is attached to the welcome email.`;
}

function regData() {
  const pkg = PKG[reg.group].find(p => p.id === radio('pkg')) || PKG.adult[1];
  const dogiEl = $('input[name="dogi"]:checked');
  return {
    name: val('r-name'), gender: radio('gender'), nat: val('r-nat'), dob: val('r-dob'), age: reg.age,
    phone: val('r-phone'), email: val('r-email'), ec: `${val('r-ecname')} (${val('r-ecrel')}) · ${val('r-ecphone')}`,
    exp: expSummary(), exps: expData(),
    prev: radio('prev') === 'Yes' ? `Yes · joined ${val('r-prevdate')}` : 'No',
    med: radio('med') === 'Yes' ? `Yes · ${val('r-med')}` : 'No',
    dojo: radio('dojo'), cls: $('#r-class').value,
    dogi: dogiEl ? dogiEl.value : '', dogiPrice: dogiEl ? +dogiEl.dataset.price : 0, size: radio('size'),
    pkg, mkt: $('#mkt').checked
  };
}
const FEE_REG = 12, FEE_DUES = 48;
function feeLines(d) {
  return [
    ['Registration', 'Student handbook and membership book', FEE_REG],
    ['Annual dues · Year 1', 'Renews 12 months from today', FEE_DUES],
    [`Dogi · ${d.dogi}`, `Size ${d.size}`, d.dogiPrice],
    [`Lessons · ${d.pkg.t}`, d.pkg.lessons === Infinity ? `First payment, then ${d.pkg.unit.replace('/', 'every').trim()}` : `${d.pkg.per} · expires ${fmtDate(expiryFor(d.pkg))}`, d.pkg.amt]
  ];
}

function buildReview() {
  const d = regData();
  const items = [['Name', d.name], ['Gender', d.gender], ['Date of birth', `${d.dob} (age ${d.age})`], ['Nationality', d.nat], ['Mobile', d.phone], ['Email', d.email + ' · verified'], ['Emergency contact', d.ec], ['Martial arts experience', d.exp], ['Previous ASK member', d.prev], ['Medical history', d.med], ['Principal dojo', dojoName(d.dojo)], ['Class', d.cls]];
  $('#review').innerHTML = items.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  const lines = feeLines(d);
  const total = lines.reduce((a, l) => a + l[2], 0);
  reg.total = total;
  $('#fees').innerHTML = lines.map(([t, s, a]) => `<div><span>${esc(t)}<small>${esc(s)}</small></span><span>${money(a)}</span></div>`).join('') + `<div class="total"><span>Total due today</span><span>${money(total)}</span></div>`;
  $('#regSlideLbl').textContent = `Slide to pay ${money(total)}`;
}

function updatePayLock() {
  const need = [];
  if (!$('#tcAgree').checked) need.push('agree to the terms');
  if (!$('#pdpa').checked) need.push('give PDPA consent');
  if (regMinor() && !val('r-gname')) need.push("add the parent or guardian's name");
  if (!reg.sig || !reg.sig.value()) need.push(regMinor() ? 'have a parent or guardian sign' : 'sign');
  const ok = !need.length;
  $('#regSlide').classList.toggle('locked', !ok);
  $('#payHint').textContent = ok ? 'All set. Drag the button to the right to pay.' : `To unlock payment: ${need.join(', ')}.`;
}

function completeRegistration() {
  const d = regData();
  const no = `ASK-${new Date().getFullYear()}-${String(Math.floor(2000 + Math.random() * 7000))}`;
  const joined = fmtDate(new Date());
  const signer = regMinor() ? `${val('r-gname')} (parent/guardian)` : d.name;
  reg.done = { ...d, no, joined, inv: 'INV-' + Date.now().toString().slice(-7), signer };
  $('#memNo').textContent = no;
  $('#joinedOn').textContent = joined;
  $('#doneEmail').textContent = d.email;
  $('#donePaid').textContent = money(reg.total);
  $('#doneDojo').textContent = dojoName(d.dojo);
  try { sessionStorage.setItem('ask-last-id', no); } catch (_) {} // ready for the first log-in
  renderMail('welcome');
  APPS.unshift({ n: d.name, dojo: d.dojo, date: joined, paid: reg.total, group: reg.group === 'kids' ? 'Child' : 'Adult', age: d.age, gender: d.gender, nat: d.nat, phone: d.phone, email: d.email, ec: d.ec, exp: d.exp, exps: d.exps, prev: d.prev, med: d.med, dogi: `${d.dogi}, size ${d.size}`, pkg: d.pkg.t, isNew: true, no, sig: reg.sig.value(), signer });
  save();
  setStep(6);
  toast('Payment received. Welcome to Shinju-Kai.');
}

function renderMail(kind) {
  const d = reg.done; if (!d) return;
  const first = d.name.split(' ')[0];
  if (kind === 'welcome') {
    $('#mailView').innerHTML = `<div class="mail-h"><b>Welcome to Aikido Shinju-Kai, ${esc(first)}</b><span>From: hq@aikidoshinjukai.com.sg · To: ${esc(d.email)}</span></div>
      <div class="mail-b">
        <p>Hi ${esc(first)},</p>
        <p>Thank you for joining Aikido Shinju-Kai. Your membership is active and your lessons are ready to book.</p>
        <div class="kv" style="margin:4px 0"><div><span>Membership no.</span><span class="num">${d.no}</span></div><div><span>Date joined</span><span>${d.joined}</span></div><div><span>Principal dojo</span><span>${esc(dojoName(d.dojo))}</span></div><div><span>Class</span><span>${esc(d.cls)}</span></div><div><span>Lessons</span><span>${esc(d.pkg.t)}${d.pkg.lessons === Infinity ? '' : ' · expire ' + fmtDate(expiryFor(d.pkg))}</span></div><div><span>Signed by</span><span>${esc(d.signer)}</span></div></div>
        <div class="note"><svg class="ic"><use href="#i-id"/></svg><span><b>Collect your student card</b> at ${esc(dojoName(d.dojo))} on your first lesson. Your dogi (size ${esc(d.size)}) will be ready there too.</span></div>
        <p>Log in to the member portal with your membership number to book HQ classes. Arrive 15 minutes early and bring water.</p>
        <p>See you on the mat,<br><b>HQ Office, Aikido Shinju-Kai</b></p>
      </div>`;
  } else {
    const lines = feeLines(d);
    $('#mailView').innerHTML = `<div class="mail-h"><b>Your receipt · ${d.inv}</b><span>From: payments@aikidoshinjukai.com.sg · To: ${esc(d.email)}</span></div>
      <div class="mail-b">
        <div class="receipt-head"><div><b style="font-size:16px">Aikido Shinju-Kai</b><p style="color:var(--muted);font-size:13px">Thomson V One, 9 Sin Ming Road #B1-02, Singapore 575630</p></div><img src="https://aikidoshinjukai.com.sg/images/logo.png" alt=""></div>
        <div class="kv" style="margin:0"><div><span>Receipt no.</span><span class="num">${d.inv}</span></div><div><span>Date</span><span>${d.joined}</span></div><div><span>Member</span><span>${esc(d.name)} · ${d.no}</span></div><div><span>Paid by</span><span>Visa •••• 4242 (Stripe)</span></div></div>
        <div class="fees">${lines.map(([t, s, a]) => `<div><span>${esc(t)}<small>${esc(s)}</small></span><span>${money(a)}</span></div>`).join('')}<div class="total"><span>Total paid</span><span>${money(reg.total)}</span></div></div>
        <p style="font-size:12px;color:var(--muted)">Registration and membership fees are non-refundable.</p>
      </div>`;
  }
}

/* ---------- martial arts experience: several entries, each with optional certificate / record book files ---------- */
const EXP_MAX = 6, FILE_MAX = 4, FILE_MB = 10;
reg.exps = [];
let expSeq = 0;
const newExp = () => ({ id: ++expSeq, art: '', grade: '', files: [] });

function expSummary() {
  const list = reg.exps.filter(x => x.art.trim() || x.grade.trim());
  if (!list.length) return 'None';
  return list.map(x => [x.art.trim(), x.grade.trim()].filter(Boolean).join(', ') + (x.files.length ? ` (${x.files.length} ${x.files.length === 1 ? 'file' : 'files'} attached)` : '')).join('; ');
}
/* what the HQ office sees: images are stored as small previews so they can be checked from the admin portal */
const expData = () => reg.exps.filter(x => x.art.trim() || x.grade.trim()).map(x => ({ art: x.art.trim(), grade: x.grade.trim(), files: x.files.map(f => ({ name: f.name, type: f.type, size: f.size, thumb: f.thumb || null })) }));

const fmtSize = b => b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`;

/* shrink a photo to a light preview (max 900px, JPEG) so it fits in browser storage */
function imagePreview(file) {
  return new Promise(res => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(u);
      try { res(c.toDataURL('image/jpeg', 0.62)); } catch (_) { res(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(u); res(null); };
    img.src = u;
  });
}

function expRowHTML(x, i) {
  const many = reg.exps.length > 1;
  return `<div class="exp-row" data-exp="${x.id}">
    <div class="exp-row-h"><b>${many ? `Martial art ${i + 1}` : 'Martial art'}</b>${many ? `<button type="button" class="exp-rm" data-exp-rm="${x.id}" aria-label="Remove martial art ${i + 1}">${icon('trash')}<span>Remove</span></button>` : ''}</div>
    <div class="grid2">
      <div class="fld"><label for="exp-art-${x.id}">Martial art and years<span class="opt">Optional</span></label><input id="exp-art-${x.id}" data-exp-f="art" value="${esc(x.art)}" placeholder="e.g. Judo, 3 years" autocomplete="off"><span class="err">Name the martial art these details are for.</span></div>
      <div class="fld"><label for="exp-grade-${x.id}">Grade or belt<span class="opt">Optional</span></label><input id="exp-grade-${x.id}" data-exp-f="grade" value="${esc(x.grade)}" placeholder="e.g. 2nd Kyu, green belt" autocomplete="off"></div>
    </div>
    <div class="exp-files-wrap">
      <span class="lbl">Certificate or record book<span class="opt">Optional</span></span>
      ${x.files.length ? `<ul class="exp-files">${x.files.map((f, k) => `<li class="exp-file">
        ${f.thumb ? `<button type="button" class="exp-thumb" data-exp-view="${x.id}:${k}" aria-label="Preview ${esc(f.name)}"><img src="${f.thumb}" alt=""></button>` : `<span class="exp-thumb doc">${icon('doc')}</span>`}
        <span class="exp-fmeta"><b title="${esc(f.name)}">${esc(f.name)}</b><small>${f.type === 'application/pdf' ? 'PDF' : 'Image'} · ${fmtSize(f.size)}</small></span>
        <button type="button" class="exp-frm" data-exp-frm="${x.id}:${k}" aria-label="Remove ${esc(f.name)}">${icon('x')}</button>
      </li>`).join('')}</ul>` : ''}
      ${x.files.length < FILE_MAX ? `<label class="file-drop" for="exp-file-${x.id}">
        <input type="file" id="exp-file-${x.id}" data-exp-file="${x.id}" accept="image/*,application/pdf" multiple>
        <span class="fd-ic">${icon('upload')}</span>
        <span class="fd-t"><b>${x.files.length ? 'Add more files' : 'Attach photos or a PDF'}</b><small>Certificate or record book pages · JPG, PNG or PDF, up to ${FILE_MB} MB each</small></span>
      </label>` : `<p class="fd-full">${FILE_MAX} files attached, the most for one martial art.</p>`}
    </div>
  </div>`;
}

function drawExp(focusId) {
  $('#expList').innerHTML = reg.exps.map(expRowHTML).join('');
  $('#expAdd').hidden = reg.exps.length >= EXP_MAX;
  if (focusId) { const f = $(`#exp-art-${focusId}`); if (f) f.focus(); }
}

async function addFiles(x, list) {
  const files = [...list];
  let skipped = 0;
  for (const f of files) {
    if (x.files.length >= FILE_MAX) { skipped++; continue; }
    const okType = f.type.startsWith('image/') || f.type === 'application/pdf';
    if (!okType) { toast(`${f.name} isn't a photo or PDF.`, 'bad'); continue; }
    if (f.size > FILE_MB * 1048576) { toast(`${f.name} is over ${FILE_MB} MB. Try a smaller photo.`, 'bad'); continue; }
    x.files.push({ name: f.name, type: f.type, size: f.size, thumb: f.type.startsWith('image/') ? await imagePreview(f) : null });
  }
  if (skipped) toast(`Up to ${FILE_MAX} files for each martial art. ${skipped} not added.`, 'bad');
  drawExp();
}

function initExperience() {
  reg.exps = [newExp()];
  drawExp();
  $('#expAdd').addEventListener('click', () => { if (reg.exps.length >= EXP_MAX) return; const x = newExp(); reg.exps.push(x); drawExp(x.id); });
  const box = $('#expList');
  box.addEventListener('input', e => {
    const f = e.target.dataset.expF; if (!f) return;
    const x = reg.exps.find(r => r.id === +e.target.closest('[data-exp]').dataset.exp); x[f] = e.target.value;
    fldOf(e.target).classList.remove('invalid');
  });
  box.addEventListener('change', e => {
    const id = e.target.dataset.expFile; if (!id) return;
    addFiles(reg.exps.find(r => r.id === +id), e.target.files);
  });
  box.addEventListener('click', e => {
    const rm = e.target.closest('[data-exp-rm]');
    if (rm) { reg.exps = reg.exps.filter(r => r.id !== +rm.dataset.expRm); drawExp(); $('#expAdd').focus(); return; }
    const fr = e.target.closest('[data-exp-frm]');
    if (fr) { const [id, k] = fr.dataset.expFrm.split(':').map(Number); reg.exps.find(r => r.id === id).files.splice(k, 1); drawExp(); return; }
    const v = e.target.closest('[data-exp-view]');
    if (v) { const [id, k] = v.dataset.expView.split(':').map(Number); const f = reg.exps.find(r => r.id === id).files[k]; openModal(`<h3 id="modalTitle">${esc(f.name)}</h3><img class="doc-preview" src="${f.thumb}" alt="Preview of ${esc(f.name)}">`); }
  });
  // drag & drop onto a file area
  box.addEventListener('dragover', e => { const d = e.target.closest('.file-drop'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  box.addEventListener('dragleave', e => { const d = e.target.closest('.file-drop'); if (d) d.classList.remove('over'); });
  box.addEventListener('drop', e => {
    const d = e.target.closest('.file-drop'); if (!d) return;
    e.preventDefault(); d.classList.remove('over');
    addFiles(reg.exps.find(r => r.id === +d.querySelector('input').dataset.expFile), e.dataTransfer.files);
  });
}

initExperience();
initJoin();