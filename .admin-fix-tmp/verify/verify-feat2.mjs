// FEAT-002: front desk. Today, Classes > Rosters, roster, Payments, Equipment. Covers R20-R42.
import { launch, newPage, signInAs, shot, check, setFeat, finish, text } from './lib.mjs';
setFeat('FEAT-002');

const env = await launch();
const B = env.base;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('ask-prototype-v3') || 'null'));
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const num = s => parseFloat(String(s).replace(/[^0-9.]/g, ''));
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/* a future date (at least `min` days ahead) on which the given class type runs */
const dateFor = (page, type, min = 2) => page.evaluate(([type, min]) => {
  const s = SESSIONS.find(x => x.type === type && x.dojo === HQ); let d = addDays(TODAY, min);
  while (dayIdx(d) !== s.day) d = addDays(d, 1);
  return { code: s.code, date: iso(d) };
}, [type, min]);
const rosterUrl = ({ code, date }) => `${B}/admin_portal/roster.html?class=${encodeURIComponent(code)}&date=${date}`;
const booked = async page => (await page.textContent('#rosterRoot .g4 .stat:nth-child(1) .v')).trim();
const setSel = (page, sel, v) => page.evaluate(([sel, v]) => { const s = document.querySelector(sel); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const bookVia = async (page, name, no) => { await page.click('#rBook'); await page.fill('#bk-q', name); await page.click(`[data-pick="${no}"]`); };

try {
  /* ================= Admin (front desk) ================= */
  const { page, errors } = await newPage(env);
  await signInAs(page, B, 'fd');

  /* ---- Today (R20-R24) ---- */
  await page.waitForSelector('#fdStats .stat');
  const t0 = await text(page);
  check('R20-header', (await page.textContent('#fdHome h1')) === 'Today' && /HQ Dojo/.test(await page.textContent('#fdDate')) && (await page.textContent('#fdDate')).includes(String(new Date().getFullYear())), await page.textContent('#fdDate'));
  const btns = await page.evaluate(() => [...document.querySelectorAll('#fdHome .page-h .acts > *')].map(b => b.textContent.trim()));
  check('R20-four-buttons', ['New registration', 'Take payment', 'Find student', 'Walk-in guest'].every(b => btns.includes(b)), btns.join(' | '));
  check('R20-new-registration-link', await page.getAttribute('#fdHome .acts a', 'href') === 'register.html');
  check('R21-four-stat-cards', (await page.locator('#fdStats .stat').count()) === 4 && (await page.locator('#fdStats .stat.alert').count()) === 1);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#fdStats .stat .l')].map(x => x.textContent.trim()));
  check('R21-card-labels', JSON.stringify(labels) === JSON.stringify(['Sessions today', 'Attendance pending', 'Payments needing attention', 'Incomplete registrations']), labels.join('|'));
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('#fdStats a.stat')].map(a => a.getAttribute('href')));
  check('R21-cards-open-pages', hrefs.length === 4 && hrefs.every(h => /\.html$/.test(h)), hrefs.join(','));
  const expectApps = await page.evaluate(() => APPS.length);
  check('R21-registrations-count-from-data', num(await page.textContent('#fdStats .stat:nth-child(4) .v')) === expectApps);
  const todayN = await page.evaluate(() => hqClassesOn(TODAY).length);
  check('R22-timeline-rows', (await page.locator('#fdSessions .ag-item').count()) === todayN, `${todayN} classes today`);
  if (todayN) {
    const st = await page.evaluate(() => [...document.querySelectorAll('#fdSessions .ag-item .pill')].map(x => x.textContent.trim()));
    check('R22-statuses', st.every(s => ['Upcoming', 'Check-in open', 'Attendance pending', 'Done', 'Cancelled'].includes(s)), st.join(','));
    check('R22-open-roster-buttons', (await page.locator('#fdSessions a.sbtn', { hasText: 'Open roster' }).count()) === todayN);
    check('R22-booked-capacity', /\d+\/\d+ booked/.test(await page.textContent('#fdSessions .ag-main span')));
  } else check('R22-no-classes-message', /No HQ classes today/.test(t0));
  check('R23-waiting-on-you', (await page.locator('#fdWaiting .row').count()) >= 5);
  check('R24-no-charts', (await page.locator('#fdHome .bars, #fdHome .spark').count()) === 0);
  check('R10-fd-today-no-ba', (await page.locator('[data-ba]').count()) === 0 && (await page.locator('#baHome').count()) === 0);
  await page.click('#fdFind'); await page.fill('#fs-q', 'Ryan');
  check('R20-find-student', (await page.locator('#fs-list a[href^="member.html?no="]').count()) === 1);
  await page.keyboard.press('Escape');
  await page.click('#fdWalk');
  await page.waitForTimeout(300);
  check('R20-walk-in-button-works', (await page.locator('#modal.open').count()) === 1 || /No class left today/.test(await text(page)), 'opens a class picker or says no class is left');
  await page.keyboard.press('Escape');
  await shot(page, 'fd-today-1280');

  /* ---- Classes > Rosters (R25, R26, R34) ---- */
  await page.goto(`${B}/admin_portal/sessions.html`);
  await page.waitForSelector('#dayStrip .ag-day');
  check('R25-heading-classes', (await page.textContent('h1')) === 'Classes');
  check('R25-fd-no-timetable-tab', (await page.locator('#tabTimetable, [data-tab="timetable"], #sesRows').count()) === 0);
  check('R25-day-strip-7', (await page.locator('#dayStrip .ag-day').count()) === 7);
  const head0 = await page.textContent('#dayHead');
  await page.click('#dayStrip .ag-day:not(.on)');
  check('R25-day-strip-changes-date', (await page.textContent('#dayHead')) !== head0);
  const hqOnly = await page.evaluate(() => { const bad = []; for (let k = 0; k < 7; k++) hqClassesOn(addDays(mondayOf(TODAY), k)).forEach(c => { if (c.dojo !== HQ) bad.push(c.type); }); return bad.length === 0; });
  check('R26-hq-only', hqOnly);
  await page.click('#viewToggle [data-view="week"]');
  const weekRows = await page.locator('#wkRows tr').count();
  const spaces = await page.evaluate(() => [...document.querySelectorAll('#wkRows tr')].map(r => r.children[5] && r.children[5].textContent.trim()));
  check('R25-week-view-spaces-left', weekRows > 0 && spaces.every(s => /^\d+$/.test(s)), `${weekRows} rows`);
  await page.click('#viewToggle [data-view="day"]');
  await page.evaluate(() => { const i = document.querySelector('#dayPick'); i.value = iso(DB.closures[0].from); i.dispatchEvent(new Event('change', { bubbles: true })); });
  check('R25-closure-banner', /HQ is closed/.test(await page.textContent('#dayNote')));
  check('R25-closure-cancelled', (await page.locator('#dayList .pill', { hasText: 'Cancelled' }).count()) > 0);
  const src = await (await page.request.get(`${B}/admin_portal/sessions.html`)).text();
  check('R34-clock-debug-comment-classes', /DEBUG PANEL \(placeholder\)/.test(src));
  const rsrc = await (await page.request.get(`${B}/admin_portal/roster.html`)).text();
  check('R34-clock-debug-comment-roster', /DEBUG PANEL \(placeholder\)/.test(rsrc));
  await page.evaluate(() => { const i = document.querySelector('#dayPick'); i.value = iso(TODAY); i.dispatchEvent(new Event('change', { bubbles: true })); });
  await shot(page, 'fd-sessions-1280');

  /* ---- Roster (R27-R33) ---- */
  const adults = await dateFor(page, 'Adults', 2);
  await page.goto(rosterUrl(adults));
  await page.waitForSelector('#rRows');
  check('R27-header', /Adults/.test(await page.textContent('#rosterRoot h1')) && /Who can join/.test(await page.textContent('#rosterRoot .page-h p')));
  const strip = await page.evaluate(() => [...document.querySelectorAll('#rosterRoot .g4 .stat .l')].map(x => x.textContent.trim()));
  check('R27-strip', JSON.stringify(strip) === JSON.stringify(['Booked', 'Checked in', 'Walk-ins', 'Waitlist']));
  const heads = await page.evaluate(() => [...document.querySelectorAll('#rTbl thead th')].map(x => x.textContent.trim()));
  check('R27-columns', ['Student', 'Belt', 'Access check', 'How booked', 'Attendance'].every(h => heads.includes(h)), heads.join('|'));
  check('R27-access-check-text', /Eligible|Package expiring|Dues unpaid|Not eligible|Package expired/.test(await page.textContent('#rRows')));
  const b0 = num((await booked(page)).split('/')[0]);
  const free = await page.evaluate(({ code, date }) => { const cls = SESSIONS.find(s => s.code === code), d = new Date(date + 'T00:00:00'), r = getRoster(d, cls); const m = MEMBERS.find(m => m.no !== ME.no && m.kind !== 'child' && !r.rows.some(x => x.no === m.no) && canBook(m, d, cls).s !== 'bad'); return { n: m.n, no: m.no }; }, adults);
  await bookVia(page, free.n, free.no);
  check('R28-eligible-shows-book', (await page.locator('#bk-do').count()) === 1 && (await page.locator('#bk-refer, #bk-over').count()) === 0);
  await page.click('#bk-do');
  await page.waitForFunction(n => document.querySelector('#rosterRoot .g4 .stat .v').textContent.startsWith(String(n)), b0 + 1);
  check('R28-book-adds-one', num((await booked(page)).split('/')[0]) === b0 + 1, `${b0} to ${b0 + 1}`);
  check('R28-book-persisted', ((await db(page)).rosters[`${adults.date}|19:00`] || { rows: [] }).rows.some(r => r.no === free.no));
  check('R28-how-booked-desk', /Desk/.test(await page.textContent(`#rRows tr:has-text("${free.n}")`)));

  /* ineligible: Advanced class needs 1st Kyu, Faisal Hamid is 4th Kyu */
  const adv = await dateFor(page, 'Advanced', 2);
  await page.goto(rosterUrl(adv));
  await page.waitForSelector('#rRows');
  await bookVia(page, 'Faisal', 'ASK-2025-2490');
  check('R30-fd-refer', (await page.locator('#bk-refer').count()) === 1 && (await page.locator('#bk-over').count()) === 0 && /Not eligible/.test(await page.textContent('#bk-box')));
  const x0 = (await db(page)).exceptions.length;
  await page.click('#bk-refer');   // no reason yet
  check('R30-refer-needs-reason', (await page.locator('#bk-refer').count()) === 1 && (await db(page)).exceptions.length === x0);
  await page.fill('#bk-why', 'Instructor agreed he can try it');
  await page.click('#bk-refer');
  await page.waitForFunction(() => !document.querySelector('#modal.open'));
  const ex = (await db(page)).exceptions;
  check('R30-refer-creates-exception', ex.length === x0 + 1 && ex[0].kind === 'access' && ex[0].status === 'pending', JSON.stringify(ex[0]));
  check('R30-no-silent-booking', !((await db(page)).rosters[`${adv.date}|20:00`] || { rows: [] }).rows.some(r => r.no === 'ASK-2025-2490'));

  /* walk-ins (R31, R32) */
  await page.goto(rosterUrl(adults));
  await page.waitForSelector('#rRows');
  await page.click('#rWalk');
  const wl = await page.textContent('#wk-list');
  check('R31-walkin-lists-valid-guests-only', /Nur Aisyah/.test(wl) && !/Ravi Menon/.test(wl) && !/Tom Becker/.test(wl) && !/Ryan Chua|Lervyn|Jamie Tan/.test(wl), wl.replace(/\s+/g, ' ').slice(0, 160));
  await page.fill('#wk-n', 'Ravi Again'); await page.fill('#wk-m', '9876 2201');
  await page.click('#wk-new');
  check('R32-repeat-trial-warning', /already used a free trial/.test(await page.textContent('#wk-warn')));
  const w0 = (await db(page)).rosters[`${adults.date}|19:00`].rows.length;
  await page.click('[data-wk="G-01"]');
  await page.waitForFunction(() => !document.querySelector('#modal.open'));
  const d1 = await db(page);
  check('R31-walkin-added', d1.rosters[`${adults.date}|19:00`].rows.length === w0 + 1 && d1.rosters[`${adults.date}|19:00`].rows.some(r => r.guest === 'G-01' && r.how === 'Walk-in'));
  check('R32-trial-marked-used', d1.guests.find(g => g.id === 'G-01').used === true);
  await page.click('#rWalk');
  await page.fill('#wk-n', 'Walter Fresh'); await page.fill('#wk-m', '8555 1212');
  await page.click('#wk-new');
  await page.waitForFunction(() => !document.querySelector('#modal.open'));
  check('R32-new-guest-record', (await db(page)).guests.some(g => g.name === 'Walter Fresh' && g.mobile === '8555 1212' && g.used === true));
  check('R33-noshow-note', /no-show uses the lesson/.test(await text(page)));

  /* attendance, submit, correction (R29) */
  await page.click('#rAllPresent');
  await page.click('#rSubmit');
  await page.waitForFunction(() => /Done/.test(document.querySelector('#rosterRoot .page-h .pill').textContent));
  check('R28-submit-attendance', !!(await db(page)).rosters[`${adults.date}|19:00`].submitted && (await page.isDisabled('#rBook')));
  await page.click('#rRows tr:first-child [data-att="noshow"]');
  check('R29-correction-modal', /Correct attendance/.test(await page.textContent('#modalBody')));
  await page.click('#corGo');
  check('R29-reason-required', (await page.locator('#modal.open').count()) === 1 && ((await db(page)).rosters[`${adults.date}|19:00`].corrections || []).length === 0);
  await page.fill('#cor-why', 'Tapped the wrong button');
  await page.click('#corGo');
  await page.waitForFunction(() => !document.querySelector('#modal.open'));
  const cor = (await db(page)).rosters[`${adults.date}|19:00`].corrections;
  check('R29-correction-saved-with-reason', cor.length === 1 && cor[0].reason === 'Tapped the wrong button' && cor[0].to === 'noshow', JSON.stringify(cor));

  /* cancel booking returns the lesson (R28) */
  const adults2 = await dateFor(page, 'Adults', 9);
  await page.goto(rosterUrl(adults2));
  await page.waitForSelector('#rRows');
  const left0 = (await db(page)).passes[0].left;
  await bookVia(page, 'Lervyn', 'ASK-2025-1834');
  await page.click('#bk-do');
  await page.waitForFunction(() => !document.querySelector('#modal.open'));
  let d2 = await db(page);
  check('R28-booking-uses-lesson', d2.passes[0].left === left0 - 1 && d2.bookings.length === 1, `${left0} to ${d2.passes[0].left}`);
  await page.click('#rRows tr:has-text("Lervyn Wong") [data-cancel]');
  await page.click('#cbGo');
  await page.waitForFunction(() => !document.querySelector('#modal.open'));
  d2 = await db(page);
  check('R28-cancel-returns-lesson', d2.passes[0].left === left0 && d2.bookings.length === 0, `back to ${d2.passes[0].left}`);

  /* waitlist (R28): Saturday 9 AM Children Juniors is full */
  const kids = await dateFor(page, 'Children Juniors', 2);
  const sat = await page.evaluate(() => SESSIONS.find(s => s.type === 'Children Juniors' && s.day === 5));
  let satDate = await page.evaluate(() => { let d = addDays(TODAY, 2); while (dayIdx(d) !== 5) d = addDays(d, 1); return iso(d); });
  await page.goto(rosterUrl({ code: sat.code, date: satDate }));
  await page.waitForSelector('#rRows');
  check('R28-waitlist-shown', (await page.locator('[data-offer]').count()) > 0);
  await page.click('[data-offer]');
  check('R28-offer-needs-space', /No space yet/.test(await text(page)) || (await page.locator('.toast').count()) > 0);
  await shot(page, 'fd-roster-1280');

  /* ---- Payments (R35-R40) ---- */
  await page.goto(`${B}/admin_portal/payments.html`);
  await page.waitForSelector('#payStats .stat');
  const pl = await page.evaluate(() => [...document.querySelectorAll('#payStats .stat .l')].map(x => x.textContent.trim()));
  check('R36-cards', JSON.stringify(pl) === JSON.stringify(['Collected today', 'Outstanding', 'Processing']), pl.join('|'));
  const dbp = await db(page);
  const outSum = dbp.ledger.filter(l => l.st === 'Outstanding').reduce((s, l) => s + l.amt, 0);
  check('R36-outstanding-from-ledger', num(await page.textContent('#payStats .stat:nth-child(2) .v')) === outSum, String(outSum));
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#payTabs .fpill')].map(x => x.textContent.trim()));
  check('R36-tabs', ['Today', 'Outstanding', 'Daily summary', 'Refunds'].every(t => tabs.includes(t)) && !tabs.includes('Failed payments'), tabs.join('|'));
  check('R39-fd-no-failed-tab', (await page.locator('[data-pt="fail"]').count()) === 0);
  await page.click('[data-pt="month"]');
  const monthText = await page.textContent('#payRows');
  check('R39-fd-failed-rows-hidden', !/Failed/.test(monthText));
  check('R37-fd-no-void-in-dom', (await page.locator('[data-void], [data-ba]').count()) === 0 && (await page.locator('[data-mistake]').count()) > 0);
  check('R40-failed-stripe-comment', /DEBUG PANEL \(placeholder\)/.test(await (await page.request.get(`${B}/admin_portal/payments.html`)).text()));

  /* take payment */
  const L0 = (await db(page)).ledger.length;
  await page.click('#payTake');
  const methods = await page.evaluate(() => [...document.querySelector('#tp-method').options].map(o => o.textContent));
  check('R35-stripe-only', methods.length === 1 && /Stripe/.test(methods[0]), methods.join('|'));
  check('R35-no-qr-no-cash', !/cash|QR/i.test(await page.textContent('#modalBody')));
  await page.fill('#tp-q', 'Ryan'); await page.click('[data-pick="ASK-2026-3103"]');
  await setSel(page, '#tp-item', 'reg');
  check('R35-price-from-policies', (await page.textContent('#tp-base')).includes('60'), await page.textContent('#tp-base'));
  check('R35-age-discount', /50%/.test(await page.textContent('#tp-disc')) && num(await page.textContent('#tp-total')) === 30, `${await page.textContent('#tp-disc')} total ${await page.textContent('#tp-total')}`);
  await shot(page, 'fd-payments-takepay-1280');
  await page.click('#tp-go');
  await page.waitForSelector('#tp-pdf');
  const d3 = await db(page);
  check('R35-ledger-row-added', d3.ledger.length === L0 + 1 && d3.ledger[0].method === 'Stripe' && d3.ledger[0].by === 'desk' && d3.ledger[0].amt === 30 && d3.ledger[0].st === 'Paid', JSON.stringify(d3.ledger[0]));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#tp-pdf')]);
  check('R35-receipt-pdf', /^receipt-INV-.*\.pdf$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await page.keyboard.press('Escape');

  /* outstanding -> collect */
  await page.click('[data-pt="out"]');
  const nOut = await page.locator('#payRows [data-collect]').count();
  check('R36-outstanding-collect-buttons', nOut >= 2, String(nOut));
  await page.click('#payRows [data-collect]');
  check('R36-collect-fixed-amount', !(await page.locator('#tp-item').count()) && /48/.test(await page.textContent('#tp-total')));
  await page.click('#tp-go'); await page.waitForSelector('#tp-pdf'); await page.keyboard.press('Escape');
  check('R36-collect-marks-paid', (await db(page)).ledger.filter(l => l.st === 'Outstanding').length === nOut - 1);

  /* daily summary + lock */
  await page.click('[data-pt="sum"]');
  const deskRows = (await db(page)).ledger.filter(l => l.by === 'desk' && l.st === 'Paid' && new Date(l.date).toDateString() === new Date().toDateString());
  const expectTotal = deskRows.reduce((s, l) => s + l.amt, 0);
  check('R36-summary-total', num(await page.textContent('#sumTotal')) === expectTotal && (await page.locator('#sumRows .row').count()) === deskRows.length, `${expectTotal} from ${deskRows.length} rows`);
  const [pdf2] = await Promise.all([page.waitForEvent('download'), page.click('#sumPdf')]);
  check('R36-summary-pdf', /daily-summary-/.test(pdf2.suggestedFilename()));
  await page.click('#sumLock');
  check('R36-lock-disables', await page.isDisabled('#sumLock') && /Locked/.test(await page.textContent('#sumLock')));
  await page.reload(); await page.waitForSelector('#payTabs');
  await page.click('[data-pt="sum"]');
  check('R36-lock-persists', await page.isDisabled('#sumLock') && !!(await db(page)).dailyLocks[todayIso()]);

  /* refunds */
  await page.click('[data-pt="ref"]');
  check('R38-fd-sees-refunds-without-approve', (await page.locator('#refRows .row').count()) >= 2 && (await page.locator('[data-ref-ok], [data-ref-no]').count()) === 0);
  await page.click('#refNew');
  await page.fill('#rq-why', 'Duplicate charge at the desk');
  await page.click('#rqGo');
  await page.waitForFunction(() => !document.querySelector('#modal.open'));
  check('R38-fd-can-request-refund', (await db(page)).refunds[0].reason === 'Duplicate charge at the desk' && (await db(page)).refunds[0].status === 'pending');
  await page.click('[data-pt="month"]');
  await page.click('[data-mistake]');
  await page.fill('#ms-why', 'Wrong item charged');
  const x1 = (await db(page)).exceptions.length;
  await page.click('#msGo');
  check('R37-fd-report-mistake', (await db(page)).exceptions.length === x1 + 1 && (await db(page)).exceptions[0].kind === 'mistake');
  await shot(page, 'fd-payments-1280');

  /* ---- Equipment (R41) ---- */
  await page.goto(`${B}/admin_portal/equipment.html`);
  await page.waitForSelector('#eqRows tr');
  const el = await page.evaluate(() => [...document.querySelectorAll('#eqStats .stat .l')].map(x => x.textContent.trim()));
  check('R41-cards', JSON.stringify(el) === JSON.stringify(['To collect', 'Unpaid orders']), el.join('|'));
  const eqText = await text(page);
  check('R41-no-stock-ui', !/stock|shortage|low stock/i.test(eqText));
  const eh = await page.evaluate(() => [...document.querySelectorAll('.tbl thead th')].map(x => x.textContent.trim()));
  check('R41-columns', ['Member', 'Item', 'Size', 'Payment', 'Status'].every(h => eh.includes(h)), eh.join('|'));
  await page.click('[data-eq-ready="E-02"]');
  check('R41-requested-to-ready', (await db(page)).equipment.find(e => e.id === 'E-02').status === 'Ready at HQ');
  await page.click('[data-eq-out="E-02"]');
  await page.click('#eqGo');
  check('R41-collector-required', (await page.locator('#modal.open').count()) === 1 && (await db(page)).equipment.find(e => e.id === 'E-02').status === 'Ready at HQ');
  await page.fill('#eq-by', 'Hannah Teo');
  await page.click('#eqGo');
  await page.waitForFunction(() => !document.querySelector('#modal.open'));
  const e2 = (await db(page)).equipment.find(e => e.id === 'E-02');
  check('R41-ready-to-handed-over', e2.status === 'Handed over' && e2.by === 'Hannah Teo');
  await page.click('[data-eq-ready="E-03"]');
  await page.click('[data-eq-out="E-03"]');
  check('R41-unpaid-blocked', (await db(page)).equipment.find(e => e.id === 'E-03').status === 'Ready at HQ' && (await page.locator('#modal.open').count()) === 0);
  await shot(page, 'fd-equipment-1280');

  check('FD-no-console-errors', errors.length === 0, errors.join(' | '));
  await page.context().close();

  /* ---- phone layout (R101) ---- */
  {
    const m = await newPage(env, { mobile: true });
    await signInAs(m.page, B, 'fd');
    await m.page.waitForSelector('#fdStats .stat');
    const pages = [['index.html', 'fd-today-390'], ['sessions.html', 'fd-sessions-390'], [null, 'fd-roster-390'], ['payments.html', 'fd-payments-390'], ['equipment.html', 'fd-equipment-390']];
    for (const [file, name] of pages) {
      if (file) await m.page.goto(`${B}/admin_portal/${file}`);
      else { const a = await dateFor(m.page, 'Adults', 2); await m.page.goto(rosterUrl(a)); await m.page.waitForSelector('#rRows'); }
      await m.page.waitForTimeout(400);
      check(`R101-no-overflow-${name}`, !(await overflow(m.page)));
      if (name === 'fd-payments-390') { await m.page.click('#payTake'); await shot(m.page, 'fd-payments-takepay-390'); await m.page.keyboard.press('Escape'); }
      else await shot(m.page, name);
    }
    check('R101-phone-no-console-errors', m.errors.length === 0, m.errors.join(' | '));
    await m.ctx.close();
  }

  /* ================= Business Admin ================= */
  {
    const b = await newPage(env);
    await signInAs(b.page, B, 'ba');
    const p = b.page;
    await p.waitForSelector('#baHome');
    check('BA-home-keeps-overview', !(await p.isVisible('#fdHome')) && (await p.textContent('#baHome .page-h h1')) === 'Overview');   // FEAT-004: Today at HQ lives inside the Overview, hidden until switched
    await p.goto(`${B}/admin_portal/sessions.html`);
    await p.waitForSelector('#dayStrip .ag-day');
    check('R84-ba-timetable-tab-present', (await p.locator('[data-tab="timetable"]').count()) === 1);
    await p.click('[data-tab="timetable"]');
    const sessN = await p.evaluate(() => SESSIONS.length);
    check('R84-ba-timetable-works', (await p.locator('#sesRows tr').count()) === sessN && (await p.isVisible('#newSession')), `${sessN} sessions`);
    await p.click('#newSession');
    check('R84-new-session-form-still-opens', (await p.locator('#sesForm').count()) === 1);
    await p.keyboard.press('Escape');
    const adv = await dateFor(p, 'Advanced', 2);
    await p.goto(rosterUrl(adv));
    await p.waitForSelector('#rRows');
    await bookVia(p, 'Faisal', 'ASK-2025-2490');
    check('R30-ba-override', (await p.locator('#bk-over').count()) === 1 && (await p.locator('#bk-refer').count()) === 0);
    await p.click('#bk-over');
    check('R30-override-needs-reason', (await p.locator('#bk-over').count()) === 1);
    await p.fill('#bk-why', 'Grading panel approved');
    const n0 = num((await booked(p)).split('/')[0]);
    await p.click('#bk-over');
    await p.waitForFunction(() => !document.querySelector('#modal.open'));
    check('R30-override-books-with-reason', num((await booked(p)).split('/')[0]) === n0 + 1 && /Override: Grading panel approved/.test(await p.textContent('#rRows')));
    await p.goto(`${B}/admin_portal/payments.html`);
    await p.waitForSelector('#payTabs');
    check('R39-ba-failed-tab', (await p.locator('[data-pt="fail"]').count()) === 1);
    await p.click('[data-pt="fail"]');
    check('R39-ba-failed-rows', (await p.locator('#payRows tr td', { hasText: 'Failed' }).count()) >= 1);
    await p.click('[data-pt="month"]');
    check('R37-ba-void-adjust', (await p.locator('[data-void]').count()) > 0 && (await p.locator('[data-mistake]').count()) === 0);
    await p.click('[data-void]');
    await p.click('#vdGo');
    check('R37-void-needs-reason', (await p.locator('#vdGo').count()) === 1);
    await p.fill('#vd-why', 'Entered twice');
    await p.click('#vdGo');
    await p.waitForFunction(() => !document.querySelector('#modal.open'));
    check('R37-void-applied', (await db(p)).ledger.some(l => l.st === 'Voided' && /Entered twice/.test(l.note)));
    await p.click('[data-pt="ref"]');
    check('R38-ba-approve-decline', (await p.locator('[data-ref-ok]').count()) >= 1);
    await p.click('[data-ref-ok]');
    check('R38-ba-approve-works', (await db(p)).refunds.some(r => r.status === 'approved'));
    check('BA-no-console-errors', b.errors.length === 0, b.errors.join(' | '));
    await b.ctx.close();
  }
} catch (e) {
  check('verify-feat2-ran-to-completion', false, String(e && e.stack || e).slice(0, 400));
} finally {
  await env.close();
  finish();
}
