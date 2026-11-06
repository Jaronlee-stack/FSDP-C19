'use strict';
/* AIKIDO SHINJU-KAI — student.js  (member portal pages) */


const stu = { week: 0, slots: [], agDay: null };

/* credits: lessons are taken from the active pack that expires first */
const activePasses = () => MY_PASSES.filter(p => p.left > 0 && p.expires >= TODAY).sort((a, b) => a.expires - b.expires);
const totalCredits = () => activePasses().reduce((a, p) => a + p.left, 0);
const unlimitedOn = (d = TODAY) => !!DB.unlimited && DB.unlimited.until >= startOfDay(d);
const activeCount = () => activePasses().length + (unlimitedOn() ? 1 : 0);
const passFor = date => activePasses().find(p => p.expires >= startOfDay(date));
const heldLots = p => p.lots.filter(l => l.status !== 'REJECTED');
const carriedOf = p => heldLots(p).reduce((a, l) => a + l.n, 0);

/* bookings are stored by date + start time, so they survive page changes */
const bookKey = (date, c) => `${isoDate(date)}|${c.time}`;
const isBooked = key => BOOKINGS.some(b => b.key === key);

function classDate(weekOffset, day) { return addDays(mondayOf(TODAY), weekOffset * 7 + day); }

function classStart(date, c) { const s = new Date(date); s.setHours(+c.time.slice(0, 2), 0, 0, 0); return s; }

function classEnd(date, c) { const s = classStart(date, c); s.setHours(s.getHours() + 1); return s; }

/* first visit: two classes already booked in the coming days */
function seedBookings() {
  if (DB.seeded) return;
  const pick = off => {
    for (let k = off; k < off + 4; k++) {
      const d = addDays(TODAY, k), day = (d.getDay() + 6) % 7;
      const c = CLASSES.find(x => x.day === day && x.type === 'Adults' && !whyNot(x)) || CLASSES.find(x => x.day === day && !whyNot(x));
      if (c && !isBooked(bookKey(d, c))) return { c, date: d, key: bookKey(d, c), passId: MY_PASSES[0] && MY_PASSES[0].id };
    }
    return null;
  };
  [pick(2), pick(5)].filter(Boolean).forEach(b => BOOKINGS.push(b));
  DB.seeded = true; save();
}

/* ---------- lesson packages + expiry ---------- */
function passRow(p, first) {
  const days = daysBetween(TODAY, p.expires), soon = days <= 30;
  const lots = heldLots(p), carried = carriedOf(p);
  const pct = Math.round(p.left / p.total * 100);
  return `<div class="passrow">
    <div class="pr-top"><div><b>${esc(p.name)}</b>${first ? ' <span class="pill navy plain" style="height:20px;font-size:11px">Used first</span>' : ''}<span class="d">Bought ${fmtDate(p.bought)}</span></div><div class="pr-left"><b class="num">${p.left}</b><span>of ${p.total} left</span></div></div>
    <div class="bar${soon ? ' red' : ''}"><i style="width:${pct}%"></i></div>
    <div class="pr-exp">${icon('clock')}<span><b>${p.left - carried}</b> ${p.left - carried === 1 ? 'lesson expires' : 'lessons expire'} on <b>${fmtDate(p.expires)}</b>${days >= 0 ? ` · ${plural(days, 'day')} left` : ''}</span>${soon ? '<span class="pill warn">Expiring soon</span>' : ''}</div>
    ${lots.map(l => `<div class="pr-exp lot">${icon('flag')}<span><b>${l.n}</b> carried forward to <b>${fmtDate(l.until)}</b> (MC)</span><span class="pill ${l.status === 'APPROVED' ? 'ok' : 'warn'}">${l.status === 'APPROVED' ? 'Approved' : 'Pending HQ'}</span></div>`).join('')}
  </div>`;
}

/* fills whichever lesson/expiry widgets exist on this page */
function renderPassViews() {
  const act = activePasses(), tot = totalCredits(), first = act[0], unl = unlimitedOn(), U = DB.unlimited;
  const set = (sel, fn) => { const el = $(sel); if (el) fn(el); };
  set('#helloLessons', el => el.textContent = unl ? '∞' : tot);
  set('#stLessons', el => el.textContent = unl ? '∞' : tot);
  set('#stLessonsH', el => el.textContent = unl ? `Unlimited until ${fmtShort(U.until)}` : first ? `Next expiry ${fmtDate(first.expires)}` : 'No active package');
  set('#homePasses', el => el.innerHTML = (unl ? `<div class="row"><span class="av navy">${icon('box')}</span><div class="grow"><div class="t">Unlimited</div><div class="d">Renews ${fmtDate(U.until)} · book as many classes as you like</div></div><span class="pill ok">Active</span></div>` : '') +
    (act.length ? act.map(p => { const d = daysBetween(TODAY, p.expires); return `<div class="row"><span class="av">${icon('box')}</span><div class="grow"><div class="t">${plural(p.left, 'lesson')} · ${esc(p.name)}</div><div class="d">Expire ${fmtDate(p.expires)}${carriedOf(p) ? ` · ${carriedOf(p)} carried to a later date` : ''}</div></div><span class="pill ${d <= 30 ? 'warn' : 'plain'}">${plural(d, 'day')}</span></div>`; }).join('')
      : (unl ? '' : '<p style="color:var(--muted);font-size:14px;padding:8px 0">No lessons left. Top up to keep booking.</p>')));

  const soon = first && daysBetween(TODAY, first.expires) <= 30;
  set('#creditBanner', el => el.innerHTML = unl
    ? `<div class="big num">∞<small>Unlimited</small></div><div><b>Unlimited until ${fmtDate(U.until)}</b><p style="color:var(--muted);font-size:14px;margin-top:4px">Renews every 2 weeks. While it runs, your ${plural(tot, 'lesson')} in packs ${tot === 1 ? 'is' : 'are'} not used.</p></div><span class="pill ok">Active</span>`
    : first
      ? `<div class="big num">${tot}<small>lessons left</small></div><div><b>Next expiry: ${fmtDate(first.expires)}</b><p style="color:var(--muted);font-size:14px;margin-top:4px">${plural(first.left, 'lesson')} in your ${esc(first.name)} ${first.left === 1 ? 'expires' : 'expire'} in ${plural(daysBetween(TODAY, first.expires), 'day')}. Lessons are always used from the pack that expires first.</p></div><span class="pill ${soon ? 'warn' : 'ok'}">${soon ? 'Expiring soon' : 'Active'}</span>`
      : `<div class="big num">0<small>lessons left</small></div><div><b>No active package</b><p style="color:var(--muted);font-size:14px;margin-top:4px">Buy a package below to start booking HQ classes.</p></div><span class="pill bad">Top up</span>`);
  set('#myPasses', el => el.innerHTML = (unl ? `<div class="passrow"><div class="pr-top"><div><b>Unlimited</b><span class="d">Started ${fmtDate(U.since)}</span></div><div class="pr-left"><b>∞</b><span>classes</span></div></div><div class="pr-exp">${icon('clock')}<span>Renews on <b>${fmtDate(U.until)}</b> · 3-month minimum</span><span class="pill ok">Active</span></div></div>` : '') +
    (act.map((p, i) => passRow(p, i === 0 && act.length > 1)).join('') || (unl ? '' : '<p style="color:var(--muted);font-size:14px">You have no active packages.</p>')));
  set('#passCapNote', el => el.textContent = `${activeCount()} of ${MAX_PACKAGES} packages held · you can hold up to ${MAX_PACKAGES} at a time`);
  set('#mc-pass', sel => {
    const cur = sel.value;
    sel.innerHTML = act.map(p => `<option value="${p.id}"${p.id === cur ? ' selected' : ''}>${esc(p.name)} · ${p.left} left · expires ${fmtShort(p.expires)}</option>`).join('');
    $('#mcCard').hidden = !act.length;
    if (sel.syncMC) sel.syncMC();
  });
}

function renderShop() {
  const list = PKG[ME.group];
  $('#pkgShopH').textContent = ME.group === 'kids' ? 'Children packages' : 'Adult packages';
  $('#pkgShop').innerHTML = list.map(p => `<article class="pkg${p.best ? ' best' : ''}"><span class="t">${p.t}</span><span class="amt">${money(p.amt)} <small>${p.unit || ''}</small></span><span class="d">${p.d}</span><span class="per">${p.per}</span><span class="d" style="font-size:12px">${p.lessons === Infinity ? p.valid : `${p.valid} · until ${fmtDate(expiryFor(p))}`}</span><button class="sbtn${p.best ? '' : ' dark'}" data-buy="${p.id}">${p.lessons === Infinity ? 'Subscribe' : 'Buy'}</button></article>`).join('');
}

function renderUpcoming() {
  const el = $('#upcoming'); if (!el) return;
  const list = BOOKINGS.slice().sort((a, b) => a.date - b.date);
  el.innerHTML = list.length ? list.map(u => {
    const p = MY_PASSES.find(x => x.id === u.passId);
    return `<div class="sess"><div class="date"><span>${DAY[u.date.getDay()]}</span><b>${u.date.getDate()}</b></div><div><div class="t">${u.c.type} · ${timeLabel(u.c.time)}</div><div class="d">HQ Dojo · ${u.c.ins}${p ? ` · 1 lesson from ${esc(p.name)}` : u.unlimited ? ' · Unlimited' : ''}</div></div><button class="sbtn" data-cancel="${u.key}">Cancel</button></div>`;
  }).join('') : '<p style="color:var(--muted);font-size:14px">No classes booked yet. <a href="book.html" style="color:var(--red);font-weight:600">Book one</a></p>';
}
document.addEventListener('click', e => { const b = e.target.closest('[data-cancel]'); if (b) confirmCancel(b.dataset.cancel); });

function confirmCancel(key) {
  const i = BOOKINGS.findIndex(b => b.key === key), u = BOOKINGS[i]; if (!u) return;
  const hrs = (classStart(u.date, u.c) - Date.now()) / 36e5, refund = hrs >= 4;
  openModal(`<h3 id="modalTitle">Cancel this class?</h3><p class="sub">${u.c.type} · ${dayName(u.date)} ${fmtDate(u.date)} · ${timeLabel(u.c.time)}</p><div class="note${refund ? '' : ' warn'}" style="margin-top:18px"><svg class="ic"><use href="#i-info"/></svg><span>${u.unlimited ? 'This class is on your Unlimited plan, so nothing is deducted.' : refund ? 'You\'re cancelling more than 4 hours before class, so the lesson goes back to its package with the same expiry date.' : 'This class starts in less than 4 hours, so the lesson won\'t be returned.'}</span></div><div class="acts"><button class="sbtn red" id="doCancel">Cancel class</button><button class="sbtn" data-close>Keep it</button></div>`);
  $('#doCancel').addEventListener('click', () => {
    BOOKINGS.splice(i, 1);
    const p = MY_PASSES.find(x => x.id === u.passId);
    if (p && refund) p.left++;
    save(); renderPassViews(); renderUpcoming(); renderBook(); closeModal();
    toast(refund && p ? 'Class cancelled. 1 lesson returned.' : 'Class cancelled.');
  });
}

function slotInfo(c, dt) {
  const key = bookKey(dt, c), booked = isBooked(key);
  const left = c.cap - c.booked, why = whyNot(c);
  const minDate = addDays(TODAY, 1), maxDate = addDays(TODAY, 30);
  const idx = stu.slots.push({ c, dt, key }) - 1;
  const cls = [];
  let sub;
  if (c.kids) cls.push('kids');
  if (booked) { cls.push('booked'); sub = 'Booked'; }
  else if (why) { cls.push('full', 'nope'); sub = why; }
  else if (dt < minDate) { cls.push('full'); sub = 'Closed for booking'; }
  else if (dt > maxDate) { cls.push('full'); sub = 'Opens later'; }
  else if (left <= 0) { cls.push('full'); sub = 'Full'; }
  else sub = `${left} spot${left > 1 ? 's' : ''} left`;
  return { idx, cls: cls.join(' '), sub, booked };
}

function renderBook() {
  if (!$('#bookGrid')) return;
  const mon = classDate(stu.week, 0), sun = addDays(mon, 6);
  $('#wkLabel').textContent = `${mon.getDate()} ${MON[mon.getMonth()]} – ${sun.getDate()} ${MON[sun.getMonth()]}`;
  $('#wkPrev').disabled = stu.week === 0; $('#wkNext').disabled = stu.week === 4;
  stu.slots = [];

  // desktop: week grid
  let html = '<div class="hd"></div>';
  for (let d = 0; d < 7; d++) { const dt = addDays(mon, d); html += `<div class="hd${+dt === +TODAY ? ' today' : ''}">${DAY[dt.getDay()]}<b>${dt.getDate()}</b></div>`; }
  TIMES.forEach(t => {
    html += `<div class="tm">${timeLabel(t)}</div>`;
    for (let d = 0; d < 7; d++) {
      const dt = addDays(mon, d);
      html += '<div class="cell">' + CLASSES.filter(c => c.day === d && c.time === t).map(c => {
        const s = slotInfo(c, dt);
        return `<button class="slotb ${s.cls}" data-i="${s.idx}"><b>${c.type}</b><span>${s.booked ? c.ins.replace(' Sensei', '') : s.sub}</span></button>`;
      }).join('') + '</div>';
    }
  });
  $('#bookGrid').innerHTML = html;

  // phones: day chips + list
  if (stu.agDay === null) {
    const tm = daysBetween(mon, addDays(TODAY, 1));
    stu.agDay = tm >= 0 && tm < 7 ? tm : 0;
  }
  const chips = [...Array(7)].map((_, d) => {
    const dt = addDays(mon, d);
    return `<button type="button" class="ag-day${d === stu.agDay ? ' on' : ''}${+dt === +TODAY ? ' today' : ''}" data-ag="${d}" aria-pressed="${d === stu.agDay}"><span>${DAY[dt.getDay()]}</span><b>${dt.getDate()}</b></button>`;
  }).join('');
  const dt = addDays(mon, stu.agDay);
  const items = CLASSES.filter(c => c.day === stu.agDay).sort((a, b) => a.time.localeCompare(b.time)).map(c => {
    const s = slotInfo(c, dt);
    return `<button type="button" class="ag-item ${s.cls}" data-i="${s.idx}"><span class="ag-time">${timeLabel(c.time)}<small>60 min</small></span><span class="ag-main"><b>${c.type}</b><span>${c.ins}</span></span><span class="ag-st">${s.sub}</span></button>`;
  }).join('');
  $('#bookAgenda').innerHTML = `<div class="ag-days">${chips}</div><div class="ag-head">${dayName(dt)} ${fmtDate(dt)} · HQ Dojo</div><div class="ag-list">${items || '<p class="ag-empty">No classes at HQ this day.</p>'}</div>`;
}

function openBooking(i) {
  const s = stu.slots[+i]; if (!s) return;
  const { c, dt, key } = s;
  if (isBooked(key)) { confirmCancel(key); return; }
  const why = whyNot(c);
  if (why) { toast(`${c.type} is for ${why.toLowerCase()}.`, 'info'); return; }
  const left = c.cap - c.booked;
  const unl = unlimitedOn(dt), pass = unl ? null : passFor(dt);
  const after = unl ? 'Unlimited' : pass ? `${pass.left - 1} left in ${esc(pass.name)}` : '—';
  openModal(`<h3 id="modalTitle">${c.type}</h3><p class="sub">${dayName(dt)} ${fmtDate(dt)} · ${timeLabel(c.time)} – ${timeLabel(String(+c.time.slice(0, 2) + 1).padStart(2, '0') + ':00')}</p>
    <div class="kv"><div><span>Dojo</span><span>HQ Dojo · Thomson V One</span></div><div><span>Instructor</span><span>${c.ins}</span></div><div><span>Spots left</span><span>${left} of ${c.cap}</span></div>
    <div><span>Paid with</span><span>${unl ? `Unlimited (until ${fmtShort(DB.unlimited.until)})` : pass ? `1 lesson · ${esc(pass.name)}` : 'No valid lessons'}</span></div>
    ${pass ? `<div><span>Lesson expires</span><span>${fmtDate(pass.expires)}</span></div>` : ''}
    <div><span>Balance after</span><span>${after}</span></div></div>
    ${!unl && !pass ? `<div class="note warn"><svg class="ic"><use href="#i-info"/></svg><span>${totalCredits() ? 'Your lessons expire before this date. Pick an earlier class or top up.' : 'You have no lessons left. Top up first.'}</span></div>` : ''}
    <p style="font-size:13px;color:var(--muted);margin-top:12px">Cancel at least 4 hours before class to get the lesson back. No-shows are not refunded.</p>
    <div class="acts">${!unl && !pass ? `<a class="btn btn-dark arrow" href="packages.html">Top up<span class="dot">${icon('arrow')}</span></a>` : `<button class="btn btn-dark arrow" id="doBook" autofocus>Confirm booking<span class="dot">${icon('arrow')}</span></button>`}</div>`);
  const btn = $('#doBook'); if (!btn) return;
  btn.addEventListener('click', () => {
    BOOKINGS.push({ c, date: dt, key, passId: pass ? pass.id : null, unlimited: unl });
    if (pass) pass.left--;
    save(); renderPassViews(); renderBook(); closeModal();
    toast('Booked. Confirmation sent to your email.');
  });
}

function openBuy(id) {
  const p = PKG.adult.concat(PKG.kids).find(x => x.id === id);
  if (activeCount() >= MAX_PACKAGES) {
    openModal(`<h3 id="modalTitle">You already hold ${MAX_PACKAGES} packages</h3><p class="sub">Members can hold up to ${MAX_PACKAGES} packages at a time. You can buy another once one runs out or expires.</p>
      <div class="kv">${unlimitedOn() ? `<div><span>Unlimited</span><span>until ${fmtShort(DB.unlimited.until)}</span></div>` : ''}${activePasses().map(a => `<div><span>${esc(a.name)}</span><span>${a.left} left · expires ${fmtShort(a.expires)}</span></div>`).join('')}</div>
      <div class="acts"><button class="sbtn dark" data-close>OK</button></div>`);
    return;
  }
  if (p.lessons === Infinity && unlimitedOn()) { toast('Your Unlimited plan is already active.', 'info'); return; }
  const exp = expiryFor(p);
  openModal(`<h3 id="modalTitle">${p.t}</h3><p class="sub">${p.d}</p>
    <div class="kv"><div><span>Package</span><span>${p.t}</span></div><div><span>Price</span><span>${money(p.amt)} ${p.unit || ''}</span></div>
    ${p.lessons === Infinity ? `<div><span>Renews</span><span>${fmtDate(exp)}, then every 2 weeks</span></div><div><span>Note</span><span>Lesson packs aren't used while it runs</span></div>`
      : `<div><span>Lessons expire</span><span>${fmtDate(exp)}</span></div><div><span>New balance</span><span>${totalCredits() + p.lessons} lessons</span></div>`}
    <div><span>Pay with</span><span>Visa •••• 4242</span></div></div>
    <div class="slide" id="buySlide"><div class="fill"></div><div class="lbl"><em>Slide to pay ${money(p.amt)}</em></div><div class="knob" role="slider" tabindex="0" aria-label="Slide to pay" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${icon('arrow')}</div></div>`);
  slideCommit($('#buySlide'), () => {
    if (p.lessons === Infinity) DB.unlimited = { since: new Date(TODAY), until: exp };
    else MY_PASSES.push({ id: 'P-' + String(Date.now()).slice(-6), name: p.name, total: p.lessons, left: p.lessons, bought: new Date(TODAY), expires: exp, lots: [] });
    PAYS.unshift({ item: p.lessons === Infinity ? 'Unlimited · 2 weeks' : p.t, date: fmtDate(new Date()), method: 'Visa •••• 4242', amt: p.amt, st: 'Paid', inv: newInv() });
    save(); renderPays(); renderPassViews(); renderBook();
    setTimeout(() => { closeModal(); toast(`${p.t} added. Receipt sent by email.`); }, 500);
  });
}

/* ---------- class rating: a pop-up once a class has ended ---------- */
const RATE_TAGS = ['Clear explanations', 'Good pace', 'Felt safe', 'Learned something new', 'Fun partner work'];
function agoText(end) {
  const m = Math.round((Date.now() - end) / 60000);
  if (m < 60) return `ended ${Math.max(1, m)} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `ended ${plural(h, 'hour')} ago`;
  return `ended ${plural(Math.round(h / 24), 'day')} ago`;
}
/* latest class the student could have attended that has already finished (stands in for attendance data) */
function lastEndedClass() {
  const now = new Date();
  for (let k = 0; k < 8; k++) {
    const d = addDays(TODAY, -k), day = (d.getDay() + 6) % 7;
    const list = CLASSES.filter(c => c.day === day && !whyNot(c)).sort((a, b) => b.time.localeCompare(a.time));
    for (const c of list) { const end = classEnd(d, c); if (end < now) return { c, date: d, end, key: `${isoDate(d)}|${c.time}` }; }
  }
  return null;
}

/* any booked class that has finished moves to the rating queue */
function checkEnded() {
  const now = new Date();
  for (let i = BOOKINGS.length - 1; i >= 0; i--) {
    const u = BOOKINGS[i];
    if (classEnd(u.date, u.c) < now) { BOOKINGS.splice(i, 1); queueRating({ c: u.c, date: u.date, end: classEnd(u.date, u.c), key: u.key }); }
  }
}
function queueRating(r) {
  if (!r || DB.rated.includes(r.key) || DB.rateQueue.some(x => x.key === r.key)) return;
  DB.rateQueue.push(r);
}
/* pop up the first rating the student hasn't been asked about yet */
function promptRating() {
  checkEnded(); save(); syncNotifDot(); renderUpcoming();
  const i = DB.rateQueue.findIndex(r => !DB.prompted.includes(r.key));
  if (i < 0 || $('#modal').classList.contains('open')) return;
  DB.prompted.push(DB.rateQueue[i].key); save();
  openRating(i);
}
function openRating(i) {
  const r = DB.rateQueue[i]; if (!r) return;
  openModal(`<div class="rate-sheet">
    <span class="eyebrow">Class ${agoText(r.end)}</span>
    <h3 id="modalTitle">How was ${esc(r.c.type)}?</h3>
    <p class="sub">${dayName(r.date)} ${fmtShort(r.date)} · ${timeLabel(r.c.time)} · ${esc(r.c.ins)}</p>
    <div class="peek" id="rsPeek"></div>
    <div class="rate-tags" id="rsTags" aria-label="What went well">${RATE_TAGS.map(t => `<button type="button" class="rtag" aria-pressed="false">${t}</button>`).join('')}</div>
    <div class="fld"><label for="rsNote">Anything to tell ${esc(r.c.ins)}?<span class="opt">Optional</span></label><textarea id="rsNote" placeholder="What worked, what to slow down on"></textarea></div>
    <div class="acts"><button type="button" class="sbtn dark" id="rsSend" disabled>Send feedback</button><button type="button" class="sbtn ghost" id="rsLater">Remind me later</button></div>
    <p class="fine-print">Only your instructor and the HQ office see ratings.</p></div>`);
  let rating = 0;
  peekRating($('#rsPeek'), v => { rating = v; $('#rsSend').disabled = !v; });
  $('#rsTags').addEventListener('click', e => { const b = e.target.closest('.rtag'); if (b) b.setAttribute('aria-pressed', b.classList.toggle('on')); });
  $('#rsSend').addEventListener('click', () => {
    FEEDBACK.push({ ins: r.c.ins, type: r.c.type, date: r.date, rating, tags: $$('#rsTags .rtag.on').map(b => b.textContent), note: $('#rsNote').value.trim() });
    DB.rated.push(r.key); DB.rateQueue.splice(i, 1); save(); syncNotifDot(); closeModal();
    toast(`Thanks. Your feedback went to ${r.c.ins}.`);
  });
  $('#rsLater').addEventListener('click', () => { closeModal(); toast('Saved for later. Find it under notifications.', 'info'); });
}

/* ---------- payments ---------- */
function renderPays() {
  if (!$('#payRows')) return;
  $('#payRows').innerHTML = PAYS.map((p, i) => `<tr><td><b>${esc(p.item)}</b></td><td>${p.date}</td><td>${p.method}</td><td class="num">${money(p.amt)}</td><td><span class="pill ok">${p.st}</span></td><td><div style="display:flex;gap:6px;justify-content:flex-end"><button class="sbtn" data-rcpt="${i}">${icon('receipt')}Receipt</button><button class="sbtn ghost" data-pdf="${i}" aria-label="Download PDF receipt ${p.inv}">${icon('download')}</button></div></td></tr>`).join('');
}

function downloadReceipt(i) {
  const p = PAYS[i]; if (!p) return;
  const NAVY = '0.086 0.129 0.231 rg', RED = '0.757 0.153 0.176 rg', GREY = '0.365 0.376 0.412 rg';
  const blob = makePDF([
    { text: 'AIKIDO SHINJU-KAI', size: 18, bold: true, color: NAVY, gap: 0 },
    { text: 'Thomson V One, 9 Sin Ming Road, #B1-02, Singapore 575630', size: 9, color: GREY, gap: 18 },
    { text: 'hq@aikidoshinjukai.com.sg  |  +65 6513 1588', size: 9, color: GREY, gap: 13 },
    { text: 'RECEIPT', size: 12, bold: true, color: RED, gap: 42 },
    { rule: true, gap: 12 },
    { text: 'Receipt no.', value: p.inv, color: GREY, gap: 22 },
    { text: 'Date', value: p.date, color: GREY },
    { text: 'Member', value: `${ME.name} (${ME.no})`, color: GREY },
    { text: 'Paid by', value: `${p.method} (Stripe)`, color: GREY },
    { text: 'Status', value: p.st, color: GREY },
    { rule: true, gap: 16 },
    { text: 'Item', value: 'Amount', vx: 460, bold: true, size: 10, gap: 22 },
    { text: p.item, value: money(p.amt), vx: 460, gap: 20 },
    { rule: true, gap: 14 },
    { text: 'Total paid', value: money(p.amt), vx: 460, bold: true, size: 13, gap: 24 },
    { text: 'Registration and membership fees are non-refundable. Thank you for training with Shinju-Kai.', size: 9, color: GREY, gap: 48 }
  ]);
  saveBlob(`shinjukai-receipt-${p.inv}.pdf`, blob);
  toast(`Receipt ${p.inv} downloaded`);
}

/* ---------- grading (SSP-12 / SSP-13) ---------- */
const gradeChecks = () => [
  ['Member for at least 3 months', `${GRADE.memberMonths} months`, GRADE.memberMonths >= 3],
  [`${GRADE.needMonths} months at current grade`, `${GRADE.monthsInRank} months`, GRADE.monthsInRank >= GRADE.needMonths],
  [`${GRADE.needSessions} sessions at current grade`, `${GRADE.sessions} / ${GRADE.needSessions}`, GRADE.sessions >= GRADE.needSessions],
  ['No outstanding membership fees', GRADE.feesPaid ? 'Paid' : 'Overdue', GRADE.feesPaid],
  ['Instructor marks you Qualified', GRADE.qualified ? 'Qualified' : 'Pending', GRADE.qualified]
];

const gradeEligible = () => gradeChecks().every(c => c[2]);

function gradeFee() {
  const lines = [[`Grading fee · ${GRADE.target}`, `Adult grading · ${fmtDate(GRADE.date)}`, GRADING_FEE[GRADE.target] || 50]];
  if (TODAY > GRADE.close) lines.push(['Late submission charge', `Applications closed ${fmtDate(GRADE.close)}`, LATE_FEE]);
  return { lines, total: lines.reduce((a, l) => a + l[2], 0) };
}

const feeHTML = ({ lines, total }) => lines.map(([t, s, a]) => `<div><span>${esc(t)}<small>${esc(s)}</small></span><span>${money(a)}</span></div>`).join('') + `<div class="total"><span>Total due</span><span>${money(total)}</span></div>`;

function renderStuGrading() {
  const ok = gradeEligible(), sub = GRADE.submitted;
  $('#gaChecks').innerHTML = gradeChecks().map(([t, v, met]) => `<div><span class="cb${met ? '' : ' no'}">${icon(met ? 'check' : 'clock')}</span><span class="t">${t}</span><span class="v">${v}</span></div>`).join('');
  const st = $('#gaStatus');
  st.className = 'pill ' + (sub ? 'navy' : ok ? 'ok' : 'warn');
  st.textContent = sub ? 'Application submitted' : ok ? 'Eligible' : 'Not yet eligible';
  const lock = $('#gaLock');
  lock.className = 'pill ' + (ok || sub ? 'ok' : 'plain');
  lock.innerHTML = sub ? `Submitted · ${sub.ref}` : ok ? 'Open' : '<svg class="ic" style="width:13px;height:13px"><use href="#i-lock"/></svg>Locked';
  $('#gaSub').textContent = sub ? `Paid ${money(sub.total)} on ${sub.date}. HQ will email your grading slot.` : ok ? 'All requirements met. Upload your membership book and pay the grading fee.' : 'Unlocks when every item on the checklist is met';
  $('#ga-book').disabled = !ok || !!sub;
  $('#gaSubmit').disabled = !ok || !!sub;
  $('#gaFees').innerHTML = feeHTML(gradeFee());
  $('#gaDemoWrap').hidden = ok || !!sub;
}

function initGradingApp() {
  $('#ga-book').addEventListener('change', () => fldOf($('#ga-book')).classList.remove('invalid'));
  $('#gaDemo').addEventListener('click', () => {
    GRADE.sessions = GRADE.needSessions; GRADE.qualified = true;
    const s = STUDENTS.find(x => x.n === ME.name); if (s) { s.s = Math.max(s.s, s.need); s.st = 'Qualified'; }
    save();
    renderStuGrading();
    toast('Prototype: requirements marked as met', 'info');
  });
  $('#gradeForm').addEventListener('submit', e => {
    e.preventDefault();
    if (!gradeEligible() || GRADE.submitted) return;
    const f = $('#ga-book').files[0];
    const err = !f ? 'Upload a photo of your stamp pages.' : !/^image\//.test(f.type) ? 'Use a photo (JPG or PNG) of your membership book.' : f.size > 10 * 1024 * 1024 ? 'Photo is over 10 MB. Try a smaller one.' : '';
    $('#gaBookErr').textContent = err || 'Upload a photo of your stamp pages.';
    fldOf($('#ga-book')).classList.toggle('invalid', !!err);
    if (err) { toast(err, 'bad'); return; }
    const fee = gradeFee();
    openModal(`<h3 id="modalTitle">Pay grading fee</h3><p class="sub">${GRADE.targetLabel} · Adult grading · ${fmtDate(GRADE.date)}</p>
      <div class="kv"><div><span>Principal dojo</span><span>${esc(dojoName(ME.dojo))}</span></div><div><span>Membership book</span><span>${esc(f.name)}</span></div><div><span>Pay with</span><span>Visa •••• 4242</span></div></div>
      <div class="fees" style="margin-bottom:18px">${feeHTML(fee)}</div>
      <div class="slide" id="gaSlide"><div class="fill"></div><div class="lbl"><em>Slide to pay ${money(fee.total)}</em></div><div class="knob" role="slider" tabindex="0" aria-label="Slide to pay" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">${icon('arrow')}</div></div>`);
    slideCommit($('#gaSlide'), () => {
      const date = fmtDate(new Date());
      GRADE.submitted = { ref: 'GRD-' + String(Date.now()).slice(-6), total: fee.total, date, file: `grading-uploads/${ME.no}/${Date.now()}-${f.name.replace(/\s+/g, '-')}` };
      GRAD_APPS.unshift({ n: ME.name, from: ME.grade, to: GRADE.target, dojo: ME.dojo, sub: fmtShort(TODAY), note: 'Membership book uploaded · fee paid', sched: null });
      PAYS.unshift({ item: `Grading fee · ${GRADE.target}`, date, method: 'Visa •••• 4242', amt: fee.total, st: 'Paid', inv: newInv() });
      renderPays(); renderStuGrading();
      save();
      setTimeout(() => { closeModal(); toast('Grading application submitted. Confirmation sent by email.'); }, 500);
    });
  });
  renderStuGrading();
}

/* ---------- curriculum tree (SSP-03) ---------- */
function initCurriculum() {
  const count = n => Array.isArray(n) ? 1 : n.kids.reduce((a, k) => a + count(k), 0);
  const node = (n, path, depth) => {
    if (Array.isArray(n)) return `<button type="button" class="ct-leaf" data-ct="${path}"><span class="play">${icon('play')}</span><span class="nm">${esc(n[0])}</span>${n[1] ? '' : '<span class="soon">Video soon</span>'}</button>`;
    const open = depth === 0 && path === '0';
    return `<div class="ct-node${open ? ' open' : ''}"><button type="button" class="ct-h" aria-expanded="${open}"><span class="ct-chev">${icon('chev')}</span><span class="ct-tt"><b>${esc(n.t)}</b><small>${esc(n.s)}</small></span><span class="pill plain">${count(n)}</span></button><div class="ct-kids"><div>${n.kids.map((k, i) => node(k, `${path}.${i}`, depth + 1)).join('')}</div></div></div>`;
  };
  $('#ctree').innerHTML = CURRICULUM.groups.map((g, i) => node(g, String(i), 0)).join('');
  const sync = () => {
    $$('#ctree .ct-node').forEach(n => $('.ct-h', n).setAttribute('aria-expanded', n.classList.contains('open')));
    const all = $$('#ctree .ct-node').every(n => n.classList.contains('open'));
    $('#ctToggle').textContent = all ? 'Collapse all' : 'Expand all';
  };
  $('#ctree').addEventListener('click', e => {
    const h = e.target.closest('.ct-h');
    if (h) { h.parentElement.classList.toggle('open'); sync(); return; }
    const leaf = e.target.closest('.ct-leaf');
    if (leaf) openTechnique(leaf.dataset.ct);
  });
  $('#ctToggle').addEventListener('click', () => {
    const all = $$('#ctree .ct-node').every(n => n.classList.contains('open'));
    $$('#ctree .ct-node').forEach(n => n.classList.toggle('open', !all));
    sync();
  });
  sync();
}

function openTechnique(path) {
  const idx = path.split('.').map(Number);
  const group = CURRICULUM.groups[idx[0]];
  const attack = idx.length === 3 ? group.kids[idx[1]] : null;
  const [name, vid] = attack ? attack.kids[idx[2]] : group.kids[idx[1]];
  const title = attack ? `${attack.t} ${name}` : name;
  const sub = `${group.t} · ${attack ? attack.s + ' · ' : ''}${CURRICULUM.rank}`;
  openModal(`<h3 id="modalTitle">${esc(title)}</h3><p class="sub">${esc(sub)}</p>
    <div class="ct-video">${vid
      ? `<iframe src="https://www.youtube-nocookie.com/embed/${vid}?rel=0" title="${esc(title)} demonstration" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`
      : `<div class="ct-novid">${icon('play')}<b>Demonstration coming soon</b><span>HQ is recording this technique for the syllabus library.</span></div>`}</div>
    ${vid ? '' : `<div class="acts"><a class="sbtn" href="https://www.youtube.com/results?search_query=${encodeURIComponent('aikido ' + title)}" target="_blank" rel="noopener">${icon('ur')}Find demonstrations</a></div>`}`, true);
}

/* ---------- MC carry-forward (SSP-11) ---------- */
function initMC() {
  const from = $('#mc-from'), to = $('#mc-to'), file = $('#mc-file'), nIn = $('#mc-n'), sel = $('#mc-pass');
  const dateOf = el => { const v = el.dataset.iso; if (!v) return null; const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); };
  const days = () => { const a = dateOf(from), b = dateOf(to); return a && b && b >= a ? Math.round((b - a) / 864e5) + 1 : 0; };
  const pass = () => MY_PASSES.find(p => p.id === sel.value);
  const maxN = () => { const p = pass(); return p ? Math.max(0, p.left - carriedOf(p)) : 0; };
  const clampN = () => { const m = maxN(); let n = parseInt(nIn.value, 10); if (!n || n < 1) n = 1; n = Math.min(n, Math.max(1, m)); nIn.value = n; nIn.max = Math.max(1, m); return n; };

  const sync = () => {
    const p = pass(); if (!p) { $('#mcDays').textContent = 'You need an active package to carry lessons forward.'; return; }
    const n = clampN(), d = days(), ext = Math.min(14, d), m = maxN();
    $('#mcNHint').textContent = `Count the classes you would have attended while on MC. Up to ${plural(m, 'lesson')} from this package.`;
    if (!d) { $('#mcDays').innerHTML = `Pick your MC dates to see the new expiry for these ${plural(n, 'lesson')}.`; return; }
    const until = addDays(p.expires, ext), rest = p.left - carriedOf(p) - n;
    $('#mcDays').innerHTML = `<span><b>${plural(n, 'lesson')}</b> will move to a new expiry of <b>${fmtDate(until)}</b> (+${plural(ext, 'day')}${d > 14 ? ', the maximum' : ', matching your MC'}). The other <b>${rest}</b> still ${rest === 1 ? 'expires' : 'expire'} on <b>${fmtDate(p.expires)}</b>.</span>`;
  };
  sel.syncMC = sync;

  $('#mcForm').addEventListener('click', e => {
    const b = e.target.closest('[data-st]'); if (!b) return;
    nIn.value = (parseInt(nIn.value, 10) || 1) + +b.dataset.st;
    mark('#mcForm .stepper', false); fldOf(nIn).classList.remove('invalid');
    sync();
  });
  $('#mcForm').addEventListener('change', e => { const f = fldOf(e.target); if (f && (e.target.dataset.iso || e.target === file || e.target === nIn)) f.classList.remove('invalid'); sync(); });
  $('#mcForm').addEventListener('input', e => { const f = fldOf(e.target); if (f) f.classList.remove('invalid'); if (e.target === nIn && nIn.value) sync(); });

  $('#mcForm').addEventListener('submit', e => {
    e.preventDefault();
    const p = pass(); if (!p) return;
    const a = dateOf(from), b = dateOf(to), f = file.files[0], n = clampN();
    let bad = 0;
    if (!mark(fldOf(from), !a)) bad++;
    $('#mcToErr').textContent = a && b && b < a ? 'End date must be on or after the start date.' : 'Enter the last day on your MC.';
    if (!mark(fldOf(to), !b || (a && b < a))) bad++;
    $('#mcNErr').textContent = maxN() ? `Choose between 1 and ${maxN()}.` : 'All lessons in this package are already being carried forward.';
    if (!mark(fldOf(nIn), !maxN() || n < 1 || n > maxN())) bad++;
    const ferr = !f ? 'Upload a photo or PDF of your MC.' : !/^image\/|^application\/pdf$/.test(f.type) ? 'Use a photo (JPG, PNG) or a PDF.' : f.size > 10 * 1024 * 1024 ? 'File is over 10 MB. Try a smaller one.' : '';
    $('#mcFileErr').textContent = ferr || 'Upload a photo or PDF of your MC.';
    if (!mark(fldOf(file), !!ferr)) bad++;
    if (bad) { toast(bad === 1 ? 'One field needs your attention.' : `${bad} fields need your attention.`, 'bad'); return; }

    const btn = $('#mcSubmit');
    btn.disabled = true; btn.innerHTML = `${icon('upload')}Uploading…`;
    setTimeout(() => {
      const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const ext = Math.min(14, days()), until = addDays(p.expires, ext), id = 'MC-' + String(Date.now()).slice(-6);
      MC_REQUESTS.unshift({
        id, student_id: ME.no, student_name: ME.name,
        pass_id: p.id, pass_label: p.name,
        mc_start: iso(a), mc_end: iso(b),
        credits: n, extend_days: ext, old_expiry: p.expires, new_expiry: until,
        file_url: `mc-uploads/${ME.no}/${Date.now()}-${f.name.replace(/\s+/g, '-')}`,
        mime: f.type,
        note: $('#mc-note').value.trim(),
        status: 'PENDING', created_at: new Date()
      });
      p.lots.push({ n, until, status: 'PENDING', req: id });
      PREVIEWS[id] = URL.createObjectURL(f);
      save();
      $('#mcForm').reset(); nIn.value = 1;
      [from, to].forEach(el => { el.value = ''; el.dpSet && el.dpSet(null); });
      renderPassViews(); renderMC();
      btn.disabled = false; btn.innerHTML = `${icon('upload')}Submit request`;
      toast(`MC uploaded. HQ will review moving ${plural(n, 'lesson')}.`);
    }, 700);
  });

  $('#mcRows').addEventListener('click', e => { const b = e.target.closest('[data-mc]'); if (b) openMCView(MC_REQUESTS.find(r => r.id === b.dataset.mc)); });
  renderMC();
  sync();
}

function renderMC() {
  const mine = MC_REQUESTS.filter(r => r.student_id === ME.no);
  $('#mcRows').innerHTML = mine.map(r => `<div class="row"><span class="av">${icon('doc')}</span><div class="grow"><div class="t">${plural(r.credits, 'lesson')} → new expiry ${fmtDate(r.new_expiry)}</div><div class="d">${esc(r.pass_label)} · MC ${mcRange(r)} · uploaded ${fmtDate(r.created_at)}</div></div><div class="acts">${mcPill(r.status)}<button class="sbtn" data-mc="${r.id}">View</button></div></div>`).join('');
}

function openCheckIn() {
  openModal(`<h3 id="modalTitle">Check in</h3><p class="sub">Tap your phone on the NFC tag at the dojo door, or show this code to your instructor.</p>
    <div style="display:grid;place-items:center;margin:22px 0">${qrSVG()}</div>
    <div class="kv"><div><span>Member</span><span>${ME.name}</span></div><div><span>Member no.</span><span class="num">${ME.no}</span></div></div>`);
}

/* ---------- pages ---------- */
runPage({
  home() {
    const h = new Date().getHours();
    $('#greet').textContent = `Good ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}, Lervyn.`;
    profileCard($('#studentCard'));
    const nowIdx = BELTS.findIndex(b => b.g === ME.grade);
    $('#beltPath').innerHTML = BELTS.map((b, i) => `${i ? `<span class="link${i <= nowIdx ? ' done' : ''}"></span>` : ''}<div class="node${i < nowIdx ? ' done' : i === nowIdx ? ' now' : ''}" style="--belt:${b.c}"><i></i><span>${b.g}${i === nowIdx ? '<br>You' : ''}</span></div>`).join('');
    $('#progToggle').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('#progToggle button').forEach(x => x.classList.toggle('on', x === b));
      const bar = b.dataset.v === 'bar';
      $('#progPath').hidden = bar; $('#progBar').hidden = !bar;
      if (bar) $$('#progBar .bar i').forEach(i => requestAnimationFrame(() => i.style.width = i.dataset.w + '%'));
    });
    $('[data-qr]').addEventListener('click', openCheckIn);
    renderUpcoming();
  },
  book() {
    $('#wkPrev').addEventListener('click', () => { stu.week = Math.max(0, stu.week - 1); stu.agDay = null; renderBook(); });
    $('#wkNext').addEventListener('click', () => { stu.week = Math.min(4, stu.week + 1); stu.agDay = null; renderBook(); });
    $('.page').addEventListener('click', e => {
      const d = e.target.closest('[data-ag]'); if (d) { stu.agDay = +d.dataset.ag; renderBook(); return; }
      const b = e.target.closest('[data-i]'); if (b) openBooking(b.dataset.i);
    });
    renderBook();
  },
  packages() {
    document.addEventListener('click', e => { const b = e.target.closest('[data-buy]'); if (b) openBuy(b.dataset.buy); });
    renderShop();
    initMC();
  },
  grading() { initGradingApp(); initCurriculum(); },
  payments() {
    renderPays();
    $('#payRows').addEventListener('click', e => {
      const b = e.target.closest('[data-rcpt]'); if (!b) return;
      const i = +b.dataset.rcpt, p = PAYS[i];
      openModal(`<h3 id="modalTitle">Receipt</h3><p class="sub">${esc(p.item)}</p><div class="kv"><div><span>Receipt no.</span><span class="num">${p.inv}</span></div><div><span>Date</span><span>${p.date}</span></div><div><span>Member</span><span>${ME.name} · ${ME.no}</span></div><div><span>Paid by</span><span>${p.method}</span></div><div><span>Amount</span><span>${money(p.amt)}</span></div></div><div class="acts"><button class="sbtn dark" data-pdf="${i}" data-close>${icon('download')}Save PDF</button></div>`);
    });
    document.addEventListener('click', e => { const b = e.target.closest('[data-pdf]'); if (b) downloadReceipt(+b.dataset.pdf); });
  },
  profile() {
    $('#profileForm').addEventListener('submit', e => { e.preventDefault(); toast('Profile saved'); });
    $('#pwBtn').addEventListener('click', () => openModal(`<h3 id="modalTitle">Change password</h3><p class="sub">Use at least 8 characters.</p><form id="pwForm" style="display:grid;gap:14px;margin-top:18px" novalidate><div class="fld"><label for="pw1">Current password</label><input id="pw1" type="password" autofocus></div><div class="fld"><label for="pw2">New password</label><input id="pw2" type="password"><span class="err">At least 8 characters.</span></div><button class="sbtn dark" type="submit" style="justify-self:start">Update password</button></form>`));
    document.addEventListener('submit', e => {
      if (e.target.id !== 'pwForm') return; e.preventDefault();
      if ($('#pw2').value.length < 8) { fldOf($('#pw2')).classList.add('invalid'); return; }
      closeModal(); toast('Password updated');
    });
  }
});

/* on every student page: seed, refresh lesson widgets, and ask about any class that just ended */
if (ALLOWED) {
  seedBookings();
  queueRating(lastEndedClass());
  renderPassViews();
  setTimeout(promptRating, 1200);
  setInterval(promptRating, 60000);
}
