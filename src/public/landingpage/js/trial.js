'use strict';
/* AIKIDO SHINJU-KAI — trial.js  (trial + guest pass checkout, HQ only; #trial, #day, #week, #private preselect a pass) */

/* ---------- 16. TRIAL & GUEST PASS CHECKOUT (HQ only) ---------- */
const PASSES = {
  local: [
    { id: 'trial', t: 'Trial session', amt: 29, d: 'First-time visitors, once per person', inc: ['One beginner-friendly class', 'At the HQ Dojo', 'No uniform needed'], need: 'session' },
    { id: 'single', t: 'Single session', amt: 40, d: 'Drop in for one class', inc: ['One class of your choice', 'At the HQ Dojo'], need: 'session' },
    { id: 'day', t: '1-day unlimited', amt: 50, d: 'Every HQ class on one day', inc: ['Unlimited HQ classes on the day', 'Come and go between classes'], need: 'first' },
    { id: 'week', t: '1-week unlimited', amt: 150, d: 'Unlimited HQ classes for 7 days', inc: ['Unlimited HQ classes for 7 days', 'Starts on the date you pick'], need: 'first' },
    { id: 'private', t: 'Private class', amt: 120, unit: '/ hour', d: 'One-to-one with an instructor', inc: ['60 minutes one-to-one', 'At the HQ Dojo', 'Instructor confirms by email'], need: 'time' }
  ],
  overseas: [
    { id: 'trial', t: 'Trial session', amt: 29, d: 'First-time visitors, once per person', inc: ['One beginner-friendly class', 'At the HQ Dojo', 'No uniform needed'], need: 'session' },
    { id: 'oday', t: '1-day unlimited', amt: 40, d: 'Overseas guest rate', inc: ['Unlimited HQ classes on the day', 'Bring your home dojo record book'], need: 'first' },
    { id: 'oweek', t: '1-week unlimited', amt: 120, d: 'Overseas guest rate', inc: ['Unlimited HQ classes for 7 days', 'Bring your home dojo record book'], need: 'first' },
    { id: 'omonth', t: '1-month unlimited', amt: 350, d: 'Overseas guest rate', inc: ['Unlimited HQ classes for 30 days', 'Bring your home dojo record book'], need: 'first' },
    { id: 'private', t: 'Private class', amt: 120, unit: '/ hour', d: 'One-to-one with an instructor', inc: ['60 minutes one-to-one', 'At the HQ Dojo', 'Instructor confirms by email'], need: 'time' }
  ]
};
const PRIVATE_SLOTS = ['10:00', '14:00', '16:00', '18:00'];
const passState = { list: 'local', sig: null };
const passObj = () => PASSES[passState.list].find(p => p.id === radio('gpass'));
const passDate = () => { const v = $('#g-date').dataset.iso; if (!v) return null; const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };

function initPass() {
  const drawPasses = () => {
    const cur = radio('gpass');
    $('#passChoices').innerHTML = PASSES[passState.list].map(p => `<div class="choice"><input type="radio" name="gpass" id="gp-${p.id}" value="${p.id}"${p.id === cur ? ' checked' : ''}><label for="gp-${p.id}"><span class="top"><span class="t">${p.t}</span><span class="tick">${icon('check')}</span></span><span class="d">${p.d}</span><span class="price num">${money(p.amt)}<small style="font-size:13px;font-weight:500;color:var(--muted)"> ${p.unit || ''}</small></span></label></div>`).join('');
    if (!passObj()) { const first = $('input[name="gpass"]'); if (first) first.checked = true; }
  };
  passState.draw = drawPasses;
  drawPasses();
  $('#overseas').addEventListener('change', e => { passState.list = e.target.checked ? 'overseas' : 'local'; drawPasses(); refreshPass(); });

  const syncWho = () => {
    const child = radio('gwho') === 'Child';
    $('#f-guardian').hidden = !child;
    $('#waiverLbl').textContent = child ? "Parent or guardian's signature" : 'Your signature';
    $('#waiverHint').textContent = child ? 'A parent or guardian signs to accept the waiver on the child\'s behalf.' : 'By signing you accept the waiver above.';
  };
  $$('input[name="gwho"]').forEach(r => r.addEventListener('change', () => { syncWho(); refreshPass(); }));
  $$('input[name="gmed"]').forEach(r => r.addEventListener('change', () => { $('#gmedReveal').classList.toggle('open', radio('gmed') === 'Yes'); $('#f-gmed').classList.remove('invalid'); }));
  $('#passForm').addEventListener('input', e => { const f = fldOf(e.target); if (f) f.classList.remove('invalid'); });
  $('#passForm').addEventListener('change', e => {
    if (['gpass', 'gsess'].includes(e.target.name)) { const f = e.target.name === 'gpass' ? $('#f-pass') : fldOf($('#sessPick')); f.classList.remove('invalid'); }
    if (e.target.id === 'g-date' && e.target.dataset.iso) fldOf(e.target).classList.remove('invalid');
    if (e.target.name !== 'gsess') refreshPass();
    else refreshSummary();
  });
  $('#passForm').addEventListener('submit', e => e.preventDefault());
  $('#sessPick').addEventListener('click', e => {
    const b = e.target.closest('[data-jump]'); if (!b) return;
    const [y, m, d] = b.dataset.jump.split('-').map(Number);
    $('#g-date').dpSet(new Date(y, m - 1, d));
  });

  // waiver is a binding contract: signed, not just ticked
  passState.sig = signaturePad($('#passSig'), { startLabel: 'Sign the waiver', onChange: () => mark('#f-waiver', false) });

  slideCommit($('#passSlide'), completePass, validatePass);
  $('#passAgain').addEventListener('click', () => {
    $$('#v-pass [data-pstep]').forEach(s => s.classList.toggle('on', s.dataset.pstep === '1'));
    $('#passSlide').reset(); passState.sig.reset(); window.scrollTo(0, 0);
  });
  syncWho();
  refreshPass();
}

function passPreset(page) {
  if (!passState.draw) return;
  const map = { trial: 'trial', day: passState.list === 'overseas' ? 'oday' : 'day', week: passState.list === 'overseas' ? 'oweek' : 'week', private: 'private', single: 'single' };
  const id = map[page];
  if (id && $('#gp-' + id)) { $('#gp-' + id).checked = true; refreshPass(); }
}

function sessionsFor(date, p) {
  if (!date || !p) return [];
  const day = (date.getDay() + 6) % 7, child = radio('gwho') === 'Child';
  return CLASSES.filter(c => c.dojo === HQ && c.day === day && c.booked < c.cap)
    .filter(c => child ? (c.kids || c.type === 'Mixed') : !c.kids && c.type !== 'SG50')
    .filter(c => p.id !== 'trial' || !['Intermediate', 'Advanced', 'Weapons'].includes(c.type));
}

function refreshPass() {
  const p = passObj(); if (!p) return;
  const date = passDate();
  $('#sessLbl').innerHTML = (p.need === 'time' ? 'Preferred time' : p.need === 'first' ? 'First class' : 'Class') + '<span class="req">*</span>';
  const cur = radio('gsess');
  let html = '';
  if (!date) {
    html = '<p class="sess-empty">Pick a date to see HQ classes.</p>';
  } else if (p.need === 'time') {
    html = PRIVATE_SLOTS.map(t => `<div class="choice"><input type="radio" name="gsess" id="gs-${t}" value="${t}"${cur === t ? ' checked' : ''}><label for="gs-${t}"><span class="t">${timeLabel(t)}</span><span class="d">60 minutes · HQ Dojo</span></label></div>`).join('');
  } else {
    const list = sessionsFor(date, p);
    if (list.length) {
      html = list.map(c => { const v = `${c.time}|${c.type}`; return `<div class="choice"><input type="radio" name="gsess" id="gs-${c.time}-${c.day}" value="${v}"${cur === v ? ' checked' : ''}><label for="gs-${c.time}-${c.day}"><span class="t">${c.type}</span><span class="d">${timeLabel(c.time)} · ${c.ins.replace(' Sensei', '')} · ${c.cap - c.booked} spots</span></label></div>`; }).join('');
    } else {
      let next = null;
      for (let k = 1; k <= 30 && !next; k++) { const d = addDays(date, k); if (d <= addDays(TODAY, 30) && sessionsFor(d, p).length) next = d; }
      html = `<p class="sess-empty">No suitable HQ classes on ${dayName(date)}.${next ? ` <button type="button" class="sbtn" style="margin-left:6px" data-jump="${next.getFullYear()}-${next.getMonth() + 1}-${next.getDate()}">Try ${fmtDate(next)}</button>` : ''}</p>`;
    }
  }
  $('#sessPick').innerHTML = html;
  refreshSummary();
}

function refreshSummary() {
  const p = passObj(); if (!p) return;
  $('#psName').textContent = p.t;
  $('#psPrice').innerHTML = `${money(p.amt)} <small>${p.unit || ''}</small>`;
  $('#psMobile').textContent = `${p.t} · ${money(p.amt)}`;
  $('#psList').innerHTML = p.inc.map(i => `<li>${icon('check')}${esc(i)}</li>`).join('');
  const dt = passDate(), sess = radio('gsess');
  const when = ['<b>ASK Headquarters Dojo</b>'];
  if (dt) when.push(`${dayName(dt)} ${fmtDate(dt)}`);
  if (sess) { const [t, type] = sess.split('|'); when.push(`${type ? type + ' · ' : ''}${timeLabel(t)}`); }
  $('#psWhen').innerHTML = when.map(w => `<span>${w}</span>`).join('') + (dt ? '' : '<span>Pick a date to see classes.</span>');
  $('#gFees').innerHTML = `<div><span>${esc(p.t)}<small>${esc(p.d)}</small></span><span>${money(p.amt)}</span></div><div class="total"><span>Total due today</span><span>${money(p.amt)}</span></div>`;
  $('#passSlideLbl').textContent = `Slide to pay ${money(p.amt)}`;
}

function validatePass() {
  const bad = [];
  const need = (cond, el) => { mark(el, !cond); if (!cond) bad.push(el); };
  need(!!passObj(), $('#f-pass'));
  need(!!val('g-name'), fldOf($('#g-name')));
  need(emailOk(val('g-email')), fldOf($('#g-email')));
  need(phoneOk(val('g-phone')), fldOf($('#g-phone')));
  if (radio('gwho') === 'Child') need(!!val('g-guardian'), $('#f-guardian'));
  need(!!passDate(), fldOf($('#g-date')));
  need(!!radio('gsess'), fldOf($('#sessPick')));
  need(!!radio('gmed'), $('#f-gmed'));
  if (radio('gmed') === 'Yes') need(!!val('g-med'), fldOf($('#g-med')));
  need(!!passState.sig.value(), $('#f-waiver'));
  if (bad.length) {
    bad[0].scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    toast(bad.length === 1 ? 'One field needs your attention.' : `${bad.length} fields need your attention.`, 'bad');
    return false;
  }
  return true;
}

function completePass() {
  const p = passObj(), dt = passDate();
  const [t, type] = radio('gsess').split('|');
  const ref = 'GST-' + String(Date.now()).slice(-6);
  const first = val('g-name').split(' ')[0];
  const signer = radio('gwho') === 'Child' ? `${val('g-guardian')} (parent/guardian)` : val('g-name');
  $('#gDoneTitle').textContent = `See you on the mat, ${first}`;
  $('#gDoneSub').textContent = `Booking, receipt and your signed waiver were sent to ${val('g-email')}.`;
  $('#ticket').innerHTML = `<div class="ticket-main"><span class="ref">Booking ${ref} · paid ${money(p.amt)}</span><h3>${esc(p.t)}</h3>
    <div class="kv" style="margin:0"><div><span>Name</span><span>${esc(val('g-name'))}</span></div><div><span>Dojo</span><span>${esc(dojoName(HQ))}</span></div><div><span>Date</span><span>${dayName(dt)} ${fmtDate(dt)}</span></div><div><span>${p.need === 'time' ? 'Preferred time' : 'Class'}</span><span>${type ? esc(type) + ' · ' : ''}${timeLabel(t)}</span></div><div><span>Waiver signed by</span><span>${esc(signer)}</span></div></div></div>
    <div class="ticket-side">${qrSVG(+String(Date.now()).slice(-4), 150)}<small>Show this at the front desk</small></div>`;
  $$('#v-pass [data-pstep]').forEach(s => s.classList.toggle('on', s.dataset.pstep === '2'));
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  toast('Payment received. Booking confirmed.');
}

initPass();
passPreset(location.hash.slice(1));
window.addEventListener('hashchange', () => passPreset(location.hash.slice(1)));
