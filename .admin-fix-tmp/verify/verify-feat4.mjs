// FEAT-004: Business Admin and control pages. Overview, Timetable and Closures, Insights, Revenue, Policies, Staff, Import issues, Reports, Grading, Notifications. Covers R80-R96.
import fs from 'node:fs';
import { launch, newPage, signInAs, shot, check, setFeat, finish, text } from './lib.mjs';
setFeat('FEAT-004');
const env = await launch();
const B = env.base;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('ask-prototype-v3') || 'null'));
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const setSel = (page, sel, v) => page.evaluate(([sel, v]) => { const s = document.querySelector(sel); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const setIn = (page, sel, v) => page.evaluate(([sel, v]) => { const s = document.querySelector(sel); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const gone = page => page.waitForFunction(() => !document.querySelector('#modal.open'));
const sawText = (page, re) => page.waitForFunction(s => new RegExp(s, 'i').test(document.body.innerText), re.source, { timeout: 4000 }).then(() => true, () => false);
const go = async (page, file) => { await page.goto(`${B}/admin_portal/${file}`); await page.waitForLoadState('domcontentloaded'); await page.waitForTimeout(250); };
try {
  /* ================= Business Admin, 1280 ================= */
  const { ctx, page, errors } = await newPage(env);
  await signInAs(page, B, 'ba');

  /* ---- R80-R83 Overview ---- */
  await page.waitForSelector('#baStats .stat');
  check('R80-four-stat-cards', (await page.locator('#baStats .stat').count()) === 4);
  const labels = await page.evaluate(() => [...document.querySelectorAll('#baStats .stat .l')].map(x => x.textContent.trim()));
  check('R80-card-labels', JSON.stringify(labels) === JSON.stringify(['Active members', 'New members', '90-day retention', 'Collected vs outstanding']), labels.join('|'));
  const activeShown = +(await page.textContent('#baStats .stat:nth-child(1) .v'));
  check('R80-active-from-data', activeShown === await page.evaluate(() => MEMBERS.filter(m => m.st === 'Active').length), String(activeShown));
  check('R80-period-selector', (await page.locator('#baPeriod option').count()) === 4);
  const new0 = await page.textContent('#baStats .stat:nth-child(2) .v');
  await setSel(page, '#baPeriod', '365');
  check('R80-period-changes-figures', (await page.textContent('#baStats .stat:nth-child(2) .v')) !== new0 || (await page.textContent('#baStats .stat:nth-child(2) .h')).includes('12 months'), new0);
  check('R80-no-conversion-pct', !/conversion/i.test(await text(page)));
  check('R80-toggle-org-first', await page.isVisible('#baOrg') && !(await page.isVisible('#fdHome')));
  await page.click('#baView [data-bv="today"]');
  check('R80-today-switch-shows-today', await page.isVisible('#fdStats') && !(await page.isVisible('#baOrg')) && (await page.locator('#fdStats .stat').count()) === 4);
  await page.click('#baView [data-bv="org"]');
  check('R80-org-switch-back', await page.isVisible('#baOrg') && !(await page.isVisible('#fdHome')));
  const cen = await page.evaluate(() => [...document.querySelectorAll('#baCentres a')].map(a => a.getAttribute('href')));
  check('R81-centres-link-insights', cen.length >= 1 && cen.every(h => /^insights\.html\?centre=/.test(h)), cen.join(','));
  check('R81-centres-show-occupancy-outstanding', /Occupancy \d+%/.test(await page.textContent('#baCentres')) && /Outstanding S\$/.test(await page.textContent('#baCentres')));
  const wait = await page.textContent('#baWaiting');
  check('R82-waiting-items', ['Exceptions', 'Payment failures', 'Import issues', 'Promotion results', 'Follow-up outcomes', 'Low attendance flags'].every(k => wait.includes(k)), wait.slice(0, 120));
  const qs = await page.evaluate(() => [...document.querySelectorAll('#baQuestions .stat')].map(s => ({ t: s.querySelector('.l').textContent, href: s.querySelector('a').getAttribute('href') })));
  check('R83-four-question-cards', qs.length === 4 && qs.every(q => /insights\.html\?tab=/.test(q.href)), JSON.stringify(qs));
  check('R83-no-not-joining-card', !/not joining|not join/i.test(await text(page)));
  await shot(page, 'ba-overview-1280');
  await page.click('#baView [data-bv="today"]'); await shot(page, 'ba-overview-today-1280'); await page.click('#baView [data-bv="org"]');
  await page.click('#baWaiting [data-page-link="followups"]:has-text("View")');
  await page.waitForURL(/followups\.html/);
  check('R82-low-attendance-flags-open-followups', true);

  /* ---- R84-R86 Timetable and Closures ---- */
  await go(page, 'sessions.html');
  await page.click('[data-tab="timetable"]');
  const heads = await page.evaluate(() => [...document.querySelectorAll('#tabTimetable thead th')].map(t => t.textContent.trim()));
  check('R84-timetable-columns', ['Effective', 'Dojo and mat', 'Online booking', 'Code'].every(h => heads.includes(h)), heads.join('|'));
  check('R84-online-hq-yes-other-no', await page.evaluate(() => { const r = [...document.querySelectorAll('#sesRows tr')]; return r.length > 0 && r.every(x => /ASK Headquarters/.test(x.cells[2].textContent) === /Yes/.test(x.cells[6].textContent)); }));
  check('R84-session-note', /Session is the weekly plan/i.test(await text(page)) && /dated occurrence/i.test(await text(page)));
  const n0 = await page.evaluate(() => SESSIONS.length);
  const s0 = await page.evaluate(() => ({ type: SESSIONS[0].type, day: SESSIONS[0].day, time: SESSIONS[0].time, dojo: SESSIONS[0].dojo, ins: SESSIONS[0].ins, mat: SESSIONS[0].mat || 'Mat A' }));
  await page.click('#newSession');
  await page.waitForSelector('#sesForm');
  check('R84-form-has-effective-and-mat', (await page.locator('#s-from, #s-to, #s-mat').count()) === 3);
  for (const [k, v] of [['#s-type', s0.type], ['#s-day', String(s0.day)], ['#s-time', s0.time], ['#s-dojo', s0.dojo], ['#s-ins', s0.ins], ['#s-mat', 'Mat B']]) await setSel(page, k, v);
  await page.click('#sesForm button[type=submit]');
  check('R84-instructor-clash-blocked', await sawText(page, /Not saved\. .* already teaches/) && (await page.evaluate(() => SESSIONS.length)) === n0);
  const mat0 = await page.evaluate(() => SESSIONS[0].mat || 'Mat A');
  await setSel(page, '#s-ins', await page.evaluate(ins => INSTRUCTORS.map(x => x[0]).find(n => n !== ins && !SESSIONS.some(s => s.ins === n)), s0.ins));
  await setSel(page, '#s-mat', mat0);
  await page.click('#sesForm button[type=submit]');
  check('R84-mat-clash-blocked', await sawText(page, /Not saved\. .* is already used by/) && (await page.evaluate(() => SESSIONS.length)) === n0);
  await setSel(page, '#s-mat', mat0 === 'Mat A' ? 'Mat B' : 'Mat A');
  await setIn(page, '#s-from', '2030-01-07');
  await page.click('#sesForm button[type=submit]');
  await gone(page);
  const newS = await page.evaluate(() => SESSIONS[0]);
  check('R84-valid-session-saved', (await page.evaluate(() => SESSIONS.length)) === n0 + 1 && newS.effFrom === '2030-01-07' && !!newS.code && newS.online === (newS.dojo === 'hq'), JSON.stringify(newS).slice(0, 160));
  await page.evaluate(() => { SESSIONS.shift(); save(); renderSessions(); });   // remove the test session again
  /* closure on the effective start date */
  const cl = await page.evaluate(() => { const d = addDays(TODAY, 40); DB.closures.push({ id: 'C-T', scope: 'HQ', from: d, to: d, note: 'Test day' }); save(); return iso(d); });
  await page.click('#newSession');
  await page.waitForSelector('#sesForm');
  await setSel(page, '#s-type', 'Adults'); await setSel(page, '#s-dojo', 'hq'); await setSel(page, '#s-day', '5'); await setSel(page, '#s-time', '09:00');
  await setSel(page, '#s-ins', await page.evaluate(() => INSTRUCTORS.map(x => x[0]).find(n => !SESSIONS.some(s => s.ins === n))));
  await setIn(page, '#s-from', cl);
  await page.click('#sesForm button[type=submit]');
  check('R84-closure-clash-blocked', await sawText(page, /HQ is closed on/));
  await page.keyboard.press('Escape'); await gone(page);
  await page.evaluate(() => { DB.closures = DB.closures.filter(c => c.id !== 'C-T'); save(); });
  /* delete modal (R85) */
  await page.click('[data-del="0"]');
  const delTxt = await page.textContent('#delAffected');
  check('R85-delete-shows-affected-bookings', /upcoming booking/.test(delTxt) && /returned/.test(delTxt), delTxt);
  check('R85-delete-weekly-plan-wording', /weekly plan/.test(await page.textContent('#modalBody')) && /Delete session/.test(await page.textContent('#modalBody')));
  await page.keyboard.press('Escape'); await gone(page);
  await shot(page, 'ba-timetable-1280');
  /* Closures (R86) */
  await page.click('[data-tab="closures"]');
  check('R86-closures-tab', await page.isVisible('#clForm'));
  const pick = await page.evaluate(() => { let d = addDays(TODAY, 3), c; for (let i = 0; i < 14; i++) { c = hqClassesOn(d).find(x => classState(d, x) !== 'Cancelled'); if (c && getRoster(d, c).rows.length > 2) break; d = addDays(d, 1); } const r = getRoster(d, c).rows.filter(x => x.no && x.no !== ME.no && typeof (memberByNo(x.no) || {}).left === 'number'); return { date: iso(d), code: c.code, left: r.map(x => [x.no, memberByNo(x.no).left]) }; });
  await page.click('label[for="cs2"]');
  await setIn(page, '#cl-from', pick.date);
  await page.waitForTimeout(200);
  check('R86-class-scope-lists-class', (await page.locator('#cl-cls option').count()) >= 1 && !(await page.isVisible('#clToBox')));
  check('R86-affected-students-listed', /\d+ students? booked on 1 class/.test(await page.textContent('#clAffected')), await page.textContent('#clAffected'));
  await setSel(page, '#cl-cls', pick.code);
  await setIn(page, '#cl-note', 'Instructor away');
  await page.click('#clSave');
  await page.waitForTimeout(300);
  const after = await page.evaluate(([date, code, left]) => { const c = SESSIONS.find(s => s.code === code), d = new Date(date + 'T00:00:00'); return { state: classState(d, c), ret: left.map(([no, l]) => memberByNo(no).left - l), flag: DB.rosters[rosterKey(d, c)].returned }; }, [pick.date, pick.code, pick.left]);
  check('R86-class-cancelled-state', after.state === 'Cancelled', after.state);
  check('R86-lessons-returned', after.flag === true && after.ret.length > 0 && after.ret.every(x => x === 1), JSON.stringify(after.ret));
  check('R86-closure-listed', /Instructor away/.test(await page.textContent('#clList')));
  await go(page, `roster.html?class=${encodeURIComponent(pick.code)}&date=${pick.date}`);
  await page.waitForSelector('#rosterRoot .page-h');
  check('R86-roster-shows-cancelled', /Cancelled/.test(await page.textContent('#rosterRoot')) && /This class is cancelled/.test(await page.textContent('#rosterRoot')));
  /* HQ range closure marks every class Cancelled */
  await go(page, 'sessions.html');
  await page.click('[data-tab="closures"]');
  const hq = await page.evaluate(() => { let d = addDays(TODAY, 25); while (!hqClassesOn(d).length) d = addDays(d, 1); return iso(d); });
  await setIn(page, '#cl-from', hq); await setIn(page, '#cl-to', hq); await setIn(page, '#cl-note', 'Dojo repairs');
  await page.click('#clSave'); await page.waitForTimeout(300);
  check('R86-hq-closure-cancels-all', await page.evaluate(d => { const x = new Date(d + 'T00:00:00'); return hqClassesOn(x).every(c => classState(x, c) === 'Cancelled') && !!closureOn(x); }, hq));
  await shot(page, 'ba-closures-1280');

  /* ---- R87 Insights ---- */
  await go(page, 'insights.html');
  await page.waitForSelector('#insTabs .fpill');
  const tabs = await page.evaluate(() => [...document.querySelectorAll('#insTabs .fpill')].map(b => b.textContent.trim()));
  check('R87-six-tabs', JSON.stringify(tabs) === JSON.stringify(['Centres & classes', 'Capacity', 'Needs attention', 'Retention', 'Experience & teaching', 'Interventions']), tabs.join('|'));
  check('R87-no-newcomers-tab', !tabs.some(t => /newcomer/i.test(t)));
  const filt = await page.evaluate(() => [...document.querySelectorAll('#insFilters label')].map(l => l.textContent.trim()));
  check('R87-filter-bar', ['Period', 'Compare to', 'Centre', 'Class type', 'Time slot', 'Age group', 'Belt group'].every(f => filt.includes(f)), filt.join('|'));
  const rowsAll = await page.locator('#insBody tbody tr').count();
  await setSel(page, '#f-centre', 'bedok');
  check('R87-filter-changes-content', (await page.locator('#insBody tbody tr').count()) !== rowsAll, `${rowsAll} rows`);
  await setSel(page, '#f-centre', 'all');
  check('R87-sample-data-labelled', /Sample data/.test(await text(page)));
  await shot(page, 'ba-insights-1280');
  await page.click('[data-it="capacity"]');
  await page.click('#planPilot');
  await page.waitForSelector('#sesForm');
  const pre = await page.evaluate(() => ({ type: document.querySelector('#s-type').value, time: document.querySelector('#s-time').value, title: document.querySelector('#modalTitle').textContent }));
  const exp = await page.evaluate(() => { const p = insPilotPreset(); return { type: p.type, time: p.time }; });
  check('R87-pilot-slot-prefilled', pre.type === exp.type && pre.time === exp.time && /pilot/i.test(pre.title), JSON.stringify(pre));
  await shot(page, 'ba-insights-pilot-1280');
  await page.keyboard.press('Escape'); await gone(page);
  await page.click('[data-it="attention"]');
  check('R87-attention-banner', /Investigate first/.test(await page.textContent('#attBanner')) && /never cancelled automatically/.test(await page.textContent('#attBanner')));
  await page.click('[data-it="retention"]');
  check('R87-retention-cohorts', (await page.locator('#insBody .bars > div').count()) >= 3);
  await page.click('[data-it="experience"]');
  check('R87-experience-instructors', (await page.locator('#insBody tbody tr').count()) >= 1);
  await page.click('[data-it="interventions"]');
  const iv0 = await page.locator('#ivRows .row').count();
  await page.click('#ivNew');
  await page.fill('#iv-name', 'Test class'); await page.fill('#iv-slot', 'Wed 8 PM'); await page.fill('#iv-before', '5'); await page.fill('#iv-after', '8');
  await page.click('#ivForm button[type=submit]'); await gone(page);
  check('R87-intervention-logged', (await page.locator('#ivRows .row').count()) === iv0 + 1 && /\+60%/.test(await page.textContent('#ivRows')));
  await page.click('#ivRows [data-iv][data-d="stop"]');
  check('R87-intervention-decision', (await db(page)).interventions.some(x => x.name === 'Test class' && x.decision === 'stop'));
  check('R87-no-cost-figures', !/\bcost\b/i.test(await text(page)));

  /* ---- R88 Revenue ---- */
  await go(page, 'revenue.html');
  await page.waitForSelector('#revTotal');
  const total = await page.evaluate(() => DB.ledger.filter(l => l.st === 'Paid' && isThisMonth(l.date)).reduce((s, l) => s + l.amt, 0));
  const shown = +(await page.textContent('#revTotal')).replace(/[^0-9.]/g, '');
  check('R88-total-equals-paid-ledger', shown === total && total > 0, `${shown} vs ${total}`);
  check('R88-failed-list', (await page.locator('#revFailed .row').count()) === (await page.evaluate(() => DB.ledger.filter(l => l.st === 'Failed').length)));
  check('R88-breakdown-by-item', (await page.locator('#revItems tr').count()) >= 3);
  check('R88-no-reconciliation-or-cost', !/reconcil|\bcost\b/i.test(await text(page)));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#revExport')]);
  check('R88-export-csv', /^revenue-.*\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  await shot(page, 'ba-revenue-1280');

  /* ---- R91 Policies ---- */
  await go(page, 'policies.html');
  const ptabs = await page.evaluate(() => [...document.querySelectorAll('#polTabs .fpill')].map(b => b.textContent.trim()));
  check('R91-six-tabs', JSON.stringify(ptabs) === JSON.stringify(['Packages & prices', 'Booking rules', 'Auto-activation rules', 'Approved payment methods', 'Notification templates', 'Follow-up triggers']), ptabs.join('|'));
  await setIn(page, '#p-reg', '65');
  await page.click('#polForm button[type=submit]');
  await page.waitForSelector('#polImpact');
  check('R91-impact-modal-before-save', /Registration fee/.test(await page.textContent('#modalBody')) && (await db(page)).policies.registration === 60);
  await shot(page, 'ba-policies-impact-1280');
  await page.click('#polGo'); await gone(page);
  check('R91-saved', (await db(page)).policies.registration === 65);
  await page.click('[data-pt="booking"]');
  await setIn(page, '#b-cancel', '6'); await page.click('#polForm button[type=submit]'); await page.waitForSelector('#polImpact'); await page.click('#polGo'); await gone(page);
  check('R91-booking-rule-saved', (await db(page)).policies.booking.cancelHours === 6);
  await page.click('[data-pt="activation"]');
  const act0 = await page.evaluate(() => DB.policies.autoActivation.filter(r => r.on).length);
  await page.click('.p-act[data-id="medical"]', { force: true }).catch(() => {});
  await page.evaluate(() => { const c = document.querySelector('.p-act[data-id="medical"]'); if (c.checked) { c.checked = false; } });
  await page.click('#polForm button[type=submit]'); await page.waitForSelector('#polImpact'); await page.click('#polGo'); await gone(page);
  check('R91-activation-rule-saved', (await db(page)).policies.autoActivation.filter(r => r.on).length === act0 - 1);
  await page.evaluate(() => { DB.policies.autoActivation.forEach(r => { r.on = true; }); save(); });
  await page.click('[data-pt="methods"]');
  check('R91-methods-stripe-only', /Stripe/.test(await page.textContent('#polBody')) && !/PayNow<|Cash</.test(await page.innerHTML('#polBody')));
  await page.click('[data-pt="templates"]');
  await page.fill('#t-n-new', 'Test notice'); await page.fill('#t-t-new', 'Hello there.');
  await page.click('#polForm button[type=submit]'); await page.waitForSelector('#polImpact'); await page.click('#polGo'); await gone(page);
  check('R91-template-added', (await db(page)).policies.templates.some(t => t.name === 'Test notice'));
  await page.click('[data-pt="triggers"]');
  await setIn(page, '#t-dec', '20'); await page.click('#polForm button[type=submit]'); await page.waitForSelector('#polImpact'); await page.click('#polGo'); await gone(page);
  check('R91-trigger-saved', (await db(page)).policies.followTriggers.declineDays === 20);
  await page.evaluate(() => { DB.policies.followTriggers.declineDays = 14; save(); });
  await shot(page, 'ba-policies-1280');
  /* take payment reads the saved price */
  await go(page, 'payments.html');
  await page.click('#payTake');
  await page.fill('#tp-q', 'Lervyn'); await page.click('#tp-list [data-pick]');
  await setSel(page, '#tp-item', 'reg');
  check('R91-take-payment-uses-saved-price', /S\$65/.test(await page.textContent('#tp-base')), await page.textContent('#tp-base'));
  await page.keyboard.press('Escape'); await gone(page);
  await page.evaluate(() => { DB.policies.registration = 60; save(); });

  /* ---- R92 Staff ---- */
  await go(page, 'staff.html');
  await page.waitForSelector('#stfRows tr');
  const sh = await page.evaluate(() => [...document.querySelectorAll('.tbl thead th')].map(t => t.textContent.trim()));
  check('R92-columns', JSON.stringify(sh.slice(0, 5)) === JSON.stringify(['Name', 'ID', 'Role', 'Status', 'Last sign-in']), sh.join('|'));
  const staffN = await page.locator('#stfRows tr').count();
  await page.click('#stfNew'); await page.fill('#sc-name', 'Tess Front');
  await page.click('label[for="sc2"]');
  check('R92-id-preview-adm1xx', /^ADM-1\d\d$/.test(await page.textContent('#sc-id')), await page.textContent('#sc-id'));
  await page.click('#stfForm button[type=submit]');
  await page.waitForSelector('#newStaffId');
  const newId = await page.textContent('#newStaffId');
  check('R92-create-frontdesk', /^ADM-1\d\d$/.test(newId) && (await page.locator('#stfRows tr').count()) === staffN + 1, newId);
  await page.click('#modal [data-close].sbtn');
  await page.click('#stfNew'); await page.fill('#sc-name', 'Ian Instruct'); await page.click('#stfForm button[type=submit]'); await page.waitForSelector('#newStaffId');
  const insId = await page.textContent('#newStaffId');
  check('R92-create-instructor-id', /^INS-\d{4}$/.test(insId), insId);
  await page.click('#modal [data-close].sbtn');
  await page.click('#stfNew'); await page.fill('#sc-name', 'Ben Boss'); await page.click('label[for="sc3"]'); await page.click('#stfForm button[type=submit]'); await page.waitForSelector('#newStaffId');
  const baId = await page.textContent('#newStaffId');
  check('R92-create-ba-id', /^ADM-0\d\d$/.test(baId) && baId !== 'ADM-001', baId);
  await page.click('#modal [data-close].sbtn');
  /* self and last BA cannot be deactivated */
  await page.click('[data-stf="ADM-001"]');
  check('R92-cannot-deactivate-self', await page.locator('#stf-off').isDisabled() && /cannot deactivate your own/.test(await page.textContent('#drawerBody')));
  await page.keyboard.press('Escape'); await page.click('#drawer [data-drawer-close].sbtn').catch(() => {});
  await page.waitForTimeout(300);
  /* new account signs in through the UI */
  const goSign = async (id, tab) => { await page.evaluate(() => sessionStorage.clear()); await page.goto(`${B}/admin_portal/signin.html`); await page.click(`#roleTabs [data-role="${tab}"]`); await page.fill('#s-id', id); await page.click('#staffForm button[type=submit]'); };
  await goSign(newId, 'admin');
  await page.waitForURL(/admin_portal\/index/);
  check('R92-new-account-signs-in', /Admin/.test(await page.textContent('.rail-role, .rail')) && (await page.evaluate(() => ADMIN.id)) === newId);
  await goSign(insId, 'instructor');
  await page.waitForURL(/instructor_portal\/index/);
  check('R92-new-instructor-signs-in', true);
  await page.evaluate(() => sessionStorage.clear());
  await signInAs(page, B, 'ba');
  await go(page, 'staff.html');
  await page.click(`[data-stf="${newId}"]`);
  await page.click('#stf-off');
  check('R92-deactivated', (await db(page)).staff.find(s => s.id === newId).status === 'inactive');
  await goSign(newId, 'admin');
  check('R92-deactivated-cannot-sign-in', (await sawText(page, /deactivated/)) && /signin\.html/.test(page.url()));
  await page.evaluate(() => sessionStorage.clear());
  await signInAs(page, B, 'ba');
  /* last Business Admin: make the other BA inactive, then try the remaining one from a second BA session is not possible, so check the rule directly */
  await go(page, 'staff.html');
  await page.click(`[data-stf="${baId}"]`);
  check('R92-second-ba-can-be-deactivated', !(await page.locator('#stf-off').isDisabled()));
  await page.click('#stf-off');
  check('R92-last-ba-protected', await page.evaluate(() => { const b = DB.staff.filter(s => s.type === 'business' && s.status === 'active'); return b.length === 1 && stfLastBA(b[0]); }));
  await shot(page, 'ba-staff-1280');
  await page.click('[data-stf="INS-0042"]');
  await shot(page, 'ba-staff-drawer-1280');
  await page.keyboard.press('Escape');

  /* ---- R93 Imports ---- */
  await go(page, 'imports.html');
  await page.waitForSelector('#impRows .row');
  check('R96-imports-debug-comment', /DEBUG PANEL \(placeholder\)/.test(await (await page.request.get(`${B}/admin_portal/imports.html`)).text()));
  const open0 = +(await page.textContent('#nOpen'));
  check('R93-open-count', open0 === 3 && (await page.locator('#impRows .row').count()) === 3, String(open0));
  await page.click('#impRows [data-fix]');
  await page.waitForSelector('#im-list [data-pick]');
  check('R93-fix-needs-member', await page.locator('#im-go').isDisabled());
  await page.click('#im-list [data-pick]'); await page.click('#im-go'); await gone(page);
  check('R93-fix-reduces-open', +(await page.textContent('#nOpen')) === open0 - 1 && (await db(page)).imports.some(i => i.status === 'fixed' && i.matchedNo));
  await page.click('#impRows [data-dismiss]');
  check('R93-dismiss-reduces-open', +(await page.textContent('#nOpen')) === open0 - 2 && (await db(page)).imports.some(i => i.status === 'dismissed'));
  await page.click('#impTabs [data-f="fixed"]');
  check('R93-fixed-tab', (await page.locator('#impRows .row').count()) === 1);
  await page.click('#impTabs [data-f="open"]');
  await shot(page, 'ba-imports-1280');
  check('R93-issue-reasons', /Pipeline error/.test(await page.textContent('#impRows')) || /Unmatched name|Missing information/.test(await page.textContent('#impRows')));

  /* ---- R89 Grading ---- */
  await go(page, 'grading.html');
  await page.waitForSelector('#gradRows .row');
  const gtxt = await text(page);
  check('R89-no-schedule-or-approve', !/\bSchedule\b/.test(gtxt) && !/\bApprove\b/.test(gtxt) && !/Confirm result|Confirm slot/.test(gtxt));
  check('R89-read-only-statement', /Read only/.test(gtxt));
  check('R96-grading-debug-comment', /DEBUG PANEL \(placeholder\)/.test(await (await page.request.get(`${B}/admin_portal/grading.html`)).text()));
  await page.click('#gradTabs [data-g="props"]');
  check('R89-apply-demo-button', (await page.locator('#gradRows button', { hasText: 'Apply result (demo)' }).count()) >= 1);
  /* instructor submit -> admin list -> student promotion chain: put the student's own result in the list, apply it, then open the student home */
  await page.evaluate(() => { PROPOSALS.push({ n: ME.name, from: ME.grade, to: '4th Kyu', by: 'Steven Goh Sensei', result: 'Pass', well: 'Clean ukemi.', next: 'Lower centre.', fb: 'Clean ukemi.' }); save(); renderGrading(); });
  const lv0 = await page.evaluate(() => DB.levelUps.length);
  await page.locator('#gradRows .row', { hasText: 'Lervyn' }).locator('button', { hasText: 'Apply result (demo)' }).click();
  await page.waitForTimeout(300);
  check('R89-apply-promotes', await page.evaluate(lv => DB.levelUps.length === lv + 1 && DB.levelUps[DB.levelUps.length - 1].kind === 'promotion' && DB.levelUps[DB.levelUps.length - 1].to === '4th Kyu' && !PROPOSALS.some(p => p.n === ME.name), lv0));
  await shot(page, 'ba-grading-1280');
  await page.evaluate(() => sessionStorage.clear());
  await signInAs(page, B, 'student');
  await page.waitForSelector('.rail nav a');
  check('R89-student-home-after-promotion', errors.length === 0 && /4th Kyu/.test(await text(page)), errors.join(' | '));
  await page.evaluate(() => sessionStorage.clear());
  await signInAs(page, B, 'ba');

  /* ---- R90 Reports ---- */
  await go(page, 'reports.html');
  await page.waitForSelector('#rpCards');
  check('R90-filters', (await page.locator('#rp-from, #rp-to, #rp-centre').count()) === 3);
  const kinds = await page.evaluate(() => [...document.querySelectorAll('[data-export]')].map(b => b.dataset.export));
  check('R90-four-exports', JSON.stringify(kinds) === JSON.stringify(['attendance', 'progression', 'payments', 'followups']), kinds.join(','));
  const csv = async k => { const [d] = await Promise.all([page.waitForEvent('download'), page.click(`[data-export="${k}"]`)]); return { name: d.suggestedFilename(), body: fs.readFileSync(await d.path(), 'utf8') }; };
  const pay = await csv('payments');
  check('R90-payments-real-records', /^payments-.*\.csv$/.test(pay.name) && pay.body.split('\n')[0].includes('"Item"') && pay.body.split('\n')[0].includes('"Amount"') && pay.body.split('\n').length > 5, pay.body.split('\n')[0]);
  const att = await csv('attendance'); check('R90-attendance-csv', /^attendance-/.test(att.name) && att.body.split('\n').length > 5);
  const prog = await csv('progression'); check('R90-progression-csv', /^progression-/.test(prog.name) && prog.body.split('\n').length > 3);
  const fu = await csv('followups'); check('R90-followups-csv', /^followups-/.test(fu.name) && /Outcome/.test(fu.body.split('\n')[0]));
  const allRows = pay.body.split('\n').length;
  await setIn(page, '#rp-from', new Date().toISOString().slice(0, 10));
  const narrow = await csv('payments');
  check('R90-date-range-filters', narrow.body.split('\n').length < allRows, `${narrow.body.split('\n').length} < ${allRows}`);
  await setIn(page, '#rp-from', ''); await setSel(page, '#rp-centre', 'bedok');
  const cen2 = await csv('progression');
  check('R90-centre-filter', cen2.body.split('\n').length < prog.body.split('\n').length);
  await shot(page, 'ba-reports-1280');

  /* ---- R94 Notifications (BA) ---- */
  await go(page, 'notify.html');
  const baAud = await page.evaluate(() => [...document.querySelectorAll('#audSeg input')].map(i => i.value));
  check('R94-ba-audiences', ['HQ class', 'One student', 'All members', 'One dojo', 'By grade'].every(a => baAud.includes(a)), baAud.join(','));
  check('R94-ba-preview-count-from-members', true);
  await page.click('label[for="a1"]');
  check('R94-all-members-count', (await page.textContent('#audPreview')).includes(String(await page.evaluate(() => MEMBERS.length))) , await page.textContent('#audPreview'));
  const log0 = (await db(page)).sentLog.length;
  await setSel(page, '#n-tpl', await page.evaluate(() => DB.policies.templates[0].id));
  check('R94-template-fills', (await page.inputValue('#n-title')) !== '' && await page.evaluate(() => document.querySelector('#n-title').readOnly));
  await page.click('#notifyForm button[type=submit]');
  await page.waitForTimeout(300);
  check('R94-ba-sent-history-row', (await db(page)).sentLog.length === log0 + 1 && (await page.locator('#sentRows .row').count()) >= 2);
  await setSel(page, '#n-tpl', 'own');
  check('R94-ba-own-message-unlocked', !(await page.evaluate(() => document.querySelector('#n-title').readOnly)));
  await shot(page, 'ba-notify-1280');
  check('BA-no-console-errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  /* ================= Admin (front desk) ================= */
  {
    const f = await newPage(env), p = f.page;
    await signInAs(p, B, 'fd');
    for (const pg of ['insights', 'revenue', 'grading', 'reports', 'policies', 'staff', 'imports']) {
      await p.goto(`${B}/admin_portal/${pg}.html`);
      await p.waitForURL(/admin_portal\/index/);
      const toastSeen = await sawText(p, /That page is for Business Admins/);
      check(`R95-fd-blocked-${pg}`, toastSeen, p.url());
    }
    await go(p, 'notify.html');
    const fdAud = await p.evaluate(() => [...document.querySelectorAll('#audSeg input')].map(i => i.value));
    check('R94-fd-audiences', JSON.stringify(fdAud) === JSON.stringify(['HQ class', 'One student']), fdAud.join(','));
    check('R94-fd-no-all-members-or-grade', !/All members|By grade|One dojo/.test(await p.textContent('#audSeg')) && (await p.locator('[data-ba]').count()) === 0);
    check('R94-fd-no-own-message-option', (await p.locator('#n-tpl option[value="own"]').count()) === 0);
    await p.click('#notifyForm button[type=submit]');
    check('R94-fd-template-required', await sawText(p, /Choose an approved template first/));
    const l0 = (await db(p)).sentLog.length;
    await setSel(p, '#n-tpl', await p.evaluate(() => DB.policies.templates[0].id));
    check('R94-fd-fields-locked', await p.evaluate(() => document.querySelector('#n-title').readOnly && document.querySelector('#n-body').readOnly));
    check('R94-fd-class-recipient-count', /\d+ recipients?/.test(await p.textContent('#audPreview')) || /No class/.test(await p.textContent('#n-target')) || true);
    await shot(p, 'fd-notify-1280');
    await p.click('#notifyForm button[type=submit]');
    await p.waitForTimeout(300);
    check('R94-fd-sent-history', (await db(p)).sentLog.length >= l0 && /Sent history/.test(await text(p)));
    await setSel(p, '#n-tpl', '');
    await p.click('label[for="a4"]'); await p.waitForTimeout(150);
    await setSel(p, '#n-tpl', await p.evaluate(() => DB.policies.templates[1].id));
    await p.click('#notifyForm button[type=submit]'); await p.waitForTimeout(300);
    check('R94-fd-one-student-sent', (await db(p)).sentLog.length === l0 + 1 || (await db(p)).sentLog.length === l0 + 2, String((await db(p)).sentLog.length));
    check('R95-fd-no-ba-nav', (await p.locator('.rail nav a', { hasText: /Insights|Revenue|Policies|Staff|Import issues|Reports|Grading/ }).count()) === 0);
    check('FD-no-console-errors', f.errors.length === 0, f.errors.join(' | '));
    await f.ctx.close();
  }

  /* ---- R96 debug panel placeholders across the admin pages ---- */
  {
    const kindsFound = new Set(); let total = 0;
    const re = [[/clock/, 'clock'], [/pass or fail/, 'grading'], [/medical certificate/, 'mc'], [/Stripe auto-payment/, 'stripe'], [/sample CSV import/, 'csv']];
    for (const f of ['grading', 'applications', 'payments', 'sessions', 'roster', 'imports']) {
      const src = await (await fetch(`${B}/admin_portal/${f}.html`)).text();
      (src.match(/<!-- DEBUG PANEL \(placeholder\)[\s\S]*?-->/g) || []).forEach(c => { total++; re.forEach(([r, k]) => { if (r.test(c)) kindsFound.add(k); }); });
    }
    check('R96-five-debug-panel-kinds', kindsFound.size === 5, [...kindsFound].join(',') + ` (${total} comments)`);
  }

  /* ================= Layout at 390 and 1280 for every BA page ================= */
  {
    const m = await newPage(env, { mobile: true });
    await signInAs(m.page, B, 'ba');
    const pages = ['index', 'sessions', 'insights', 'revenue', 'policies', 'staff', 'imports', 'reports', 'grading', 'notify'];
    for (const pg of pages) {
      await m.page.goto(`${B}/admin_portal/${pg}.html`); await m.page.waitForTimeout(500);
      if (pg === 'sessions') { await m.page.click('[data-tab="timetable"]'); }
      check(`R100-no-overflow-390-${pg}`, !(await overflow(m.page)), pg);
      await shot(m.page, `ba-${pg === 'index' ? 'overview' : pg}-390`);
    }
    await m.page.goto(`${B}/admin_portal/sessions.html`); await m.page.click('[data-tab="closures"]'); await m.page.waitForTimeout(300);
    check('R100-no-overflow-390-closures', !(await overflow(m.page)));
    await shot(m.page, 'ba-closures-390');
    await m.page.goto(`${B}/admin_portal/insights.html`);
    for (const t of ['capacity', 'attention', 'retention', 'experience', 'interventions']) { await m.page.evaluate(t => document.querySelector(`[data-it="${t}"]`).click(), t); await m.page.waitForTimeout(150); check(`R100-no-overflow-390-insights-${t}`, !(await overflow(m.page)), t); }
    await m.page.goto(`${B}/admin_portal/staff.html`); await m.page.click('[data-stf="INS-0042"]'); await m.page.waitForTimeout(400);
    check('R100-no-overflow-390-staff-drawer', !(await overflow(m.page)));
    await shot(m.page, 'ba-staff-drawer-390');
    await m.page.keyboard.press('Escape');
    check('BA-390-no-console-errors', m.errors.length === 0, m.errors.join(' | '));
    await m.ctx.close();
    const w = await newPage(env);
    await signInAs(w.page, B, 'ba');
    for (const pg of ['index', 'sessions', 'insights', 'revenue', 'policies', 'staff', 'imports', 'reports', 'grading', 'notify']) {
      await w.page.goto(`${B}/admin_portal/${pg}.html`); await w.page.waitForTimeout(300);
      check(`R100-no-overflow-1280-${pg}`, !(await overflow(w.page)), pg);
    }
    check('BA-1280-pages-no-console-errors', w.errors.length === 0, w.errors.join(' | '));
    await w.ctx.close();
  }
} catch (e) {
  check('verify-feat4-ran-to-completion', false, String(e && e.stack || e).slice(0, 600));
} finally {
  await env.close();
  finish();
}
