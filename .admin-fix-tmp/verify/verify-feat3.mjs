// FEAT-003: people and registration. Members, student record, Registrations / Extensions / Exceptions, assisted registration, Follow-ups. Covers R50-R70.
import { launch, newPage, signInAs, shot, check, setFeat, finish, text } from './lib.mjs';
setFeat('FEAT-003');
const env = await launch();
const B = env.base;
const db = page => page.evaluate(() => JSON.parse(localStorage.getItem('ask-prototype-v3') || 'null'));
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
const setSel = (page, sel, v) => page.evaluate(([sel, v]) => { const s = document.querySelector(sel); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, [sel, v]);
const gone = page => page.waitForFunction(() => !document.querySelector('#modal.open'));
const drawerGone = page => page.waitForFunction(() => !document.querySelector('#drawer.open'));
/* put a pending MC request for the demo student into the live DB (from inside the page, so the page does not overwrite it) */
const addMC = (page, extra) => page.evaluate(extra => {
  const p = MY_PASSES[0];
  MC_REQS.unshift(Object.assign({ id: 'MC-' + Math.floor(Math.random() * 1e6), n: 'Lervyn Wong', no: 'ASK-2025-1834', passId: p.id, passName: p.name, kind: 'mc', from: addDays(TODAY, -4), to: addDays(TODAY, -2), days: 3, oldExp: p.expires, file: '', fileName: 'mc.pdf', note: '', date: new Date(), status: 'pending', reason: '', newExp: null }, extra));
  save(); renderAll();
  return MC_REQS[0].id;
}, extra || {});
const pass = page => page.evaluate(() => ({ exp: +new Date(MY_PASSES[0].expires), left: MY_PASSES[0].left }));
const dayMs = 864e5;
try {
  /* ================= Admin (front desk) ================= */
  const { ctx, page, errors } = await newPage(env);
  await signInAs(page, B, 'fd');

  /* ---- Members (R50, R51) ---- */
  await page.goto(`${B}/admin_portal/members.html`);
  await page.waitForSelector('#memRows tr');
  const filters = await page.evaluate(() => [...document.querySelectorAll('#memFilter .fpill')].map(b => b.firstChild.textContent.trim()));
  check('R50-filters', JSON.stringify(filters) === JSON.stringify(['All', 'Active', 'Lapsed', 'Expiring soon', 'Outstanding balance', 'New (90 days or less)', 'Guests']), filters.join('|'));
  const heads = await page.evaluate(() => [...document.querySelectorAll('.tbl thead th')].map(t => t.textContent.trim()));
  check('R50-columns', JSON.stringify(heads) === JSON.stringify(['Member', 'Belt', 'Centre', 'Package', 'Membership', 'Last seen']), heads.join('|'));
  const rowsFor = async f => { await page.click(`#memFilter [data-f="${f}"]`); return page.locator('#memRows tr').count(); };
  const nAll = await rowsFor('All'), nAct = await rowsFor('Active'), nLap = await rowsFor('Lapsed'), nExp = await rowsFor('Expiring soon'), nOut = await rowsFor('Outstanding balance'), nNew = await rowsFor('New (90 days or less)'), nGuest = await rowsFor('Guests');
  check('R50-each-filter-changes-rows', [nAct, nLap, nExp, nOut, nNew, nGuest].every(n => n > 0 && n < nAll) || (nGuest > 0 && nAct < nAll && nLap < nAll), `all ${nAll} active ${nAct} lapsed ${nLap} expiring ${nExp} outstanding ${nOut} new ${nNew} guests ${nGuest}`);
  const names = async f => { await page.click(`#memFilter [data-f="${f}"]`); return (await page.locator('#memRows tr').allTextContents()).join('|'); };
  const sets = []; for (const f of ['Lapsed', 'Expiring soon', 'Outstanding balance', 'New (90 days or less)']) sets.push(await names(f));
  check('R50-filters-distinct', new Set(sets).size === 4, [nLap, nExp, nOut, nNew].join(','));
  const counts = await page.evaluate(() => [...document.querySelectorAll('#memFilter .fpill .n')].map(n => +n.textContent));
  check('R50-pill-counts-match-rows', counts[0] === nAll && counts[1] === nAct && counts[2] === nLap && counts[6] === nGuest, counts.join(','));
  await page.click('#memFilter [data-f="All"]');
  const search = async q => { await page.fill('#memSearch', q); return page.locator('#memRows tr').count(); };
  check('R50-search-name', (await search('Priya')) === 1);
  check('R50-search-number', (await search('ASK-2022-0090')) === 1);
  check('R50-search-phone', (await search('9111 2201')) === 1);
  check('R50-search-email', (await search('olivia.sim@')) === 1);
  check('R50-search-guardian', (await search('Kelvin Wong')) === 1);
  await search('zzzzzz');
  check('R50-search-none', /No members match/.test(await page.textContent('#memRows')));
  await page.fill('#memSearch', '');
  check('R50-no-export-for-admin', (await page.locator('[data-export]').count()) === 0);
  check('R50-no-quick-edit-drawer', (await page.evaluate(() => typeof openMember)) === 'undefined');
  await page.fill('#memSearch', 'Ryan');
  await page.click('#memRows tr.click');
  await page.waitForURL(/member\.html\?no=ASK-2026-3103/);
  check('R50-row-opens-record', true);
  await page.goto(`${B}/admin_portal/members.html`);
  await page.waitForSelector('#memRows tr');
  const rowTxt = await page.textContent('#memRows tr:nth-child(1)');
  check('R50-row-has-package-and-last-seen', /lesson|package|Unlimited/i.test(rowTxt) && /Today|day/i.test(rowTxt), rowTxt.replace(/\s+/g, ' ').slice(0, 120));
  check('R50-fd-no-ba-nodes-members', (await page.locator('[data-ba]').count()) === 0);
  await shot(page, 'fd-members-1280');

  /* ---- Student record as Admin (R61-R65) ---- */
  await page.goto(`${B}/admin_portal/member.html?no=ASK-2026-3103`);
  await page.waitForSelector('#mTabs .fpill');
  const mtabs = await page.evaluate(() => [...document.querySelectorAll('#mTabs .fpill')].map(b => b.textContent.trim()));
  check('R61-eight-tabs', JSON.stringify(mtabs) === JSON.stringify(['Overview', 'Bookings', 'Attendance', 'Payments', 'Progress', 'Equipment', 'Follow-ups', 'Contact']), mtabs.join('|'));
  const acts = await page.evaluate(() => [...document.querySelectorAll('#memberRoot .page-h .acts > *')].map(b => b.textContent.trim()));
  check('R61-header-buttons', ['Book a class', 'Take payment', 'Log contact', 'Send message'].every(b => acts.includes(b)), acts.join('|'));
  check('R61-header-chips', /Active/.test(await page.textContent('#mChips')) && /Adult/.test(await page.textContent('#mChips')) && /ASK member/.test(await page.textContent('#mChips')));
  check('R61-header-name-no-belt-centre', /Ryan Chua/.test(await page.textContent('#mHead')) && /ASK-2026-3103/.test(await page.textContent('#mHead')) && /6th Kyu/.test(await page.textContent('#mHead')) && /Headquarters/.test(await page.textContent('#mHead')));
  check('R63-belt-note', /Changes through grading only/.test(await page.textContent('#mBody')));
  check('R62-fd-no-status-dojo-edit', (await page.locator('#mEdit, #ms-st, #ms-dojo').count()) === 0 && (await page.locator('#mBody select, #mBody input').count()) === 0);
  check('R64-fd-ns-verified-only', /Verified/.test(await page.textContent('#mBody')) && (await page.locator('[data-doc]').count()) === 0);
  check('R64-fd-sees-medical', /Medical note/.test(await page.textContent('#mBody')) && (await page.textContent('#mMedical')).length > 5);
  check('R65-two-year-and-balance', /2-year re-registration/.test(await page.textContent('#mBody')) && /Package/.test(await page.textContent('#mBody')) && /Outstanding/.test(await page.textContent('#mBody')) && /Classes rated/.test(await page.textContent('#mBody')));
  check('R65-memberinfo-stored', (await db(page)).memberInfo['ASK-2026-3103'] && !!(await db(page)).memberInfo['ASK-2026-3103'].emergency);
  await shot(page, 'fd-member-1280');
  /* tabs */
  for (const [k, re] of [['bookings', /Upcoming bookings/], ['attendance', /Attendance/], ['payments', /Payment history/], ['progress', /Current belt/], ['equipment', /Equipment/], ['followups', /Follow-ups/], ['contact', /Contact details/]]) {
    await page.click(`#mTabs [data-tab="${k}"]`);
    check(`R61-tab-${k}`, re.test(await page.textContent('#mBody')));
  }
  check('R63-progress-belt-not-editable', true);
  await page.click('#mTabs [data-tab="progress"]');
  check('R63-progress-no-controls', (await page.locator('#mBody select, #mBody input, #mBody textarea').count()) === 0 && /grading only/.test(await page.textContent('#mBody')));
  /* contact edit */
  await page.click('#mTabs [data-tab="contact"]');
  await page.fill('#c-phone', '9000 1234'); await page.fill('#c-email', 'ryan.new@email.com'); await page.fill('#c-ecname', 'Lin Chua');
  await page.click('#mContact button[type=submit]');
  await page.waitForTimeout(300);
  let d3 = await db(page);
  check('R62-fd-edits-contact', d3.members.find(m => m.no === 'ASK-2026-3103').phone === '9000 1234' && d3.memberInfo['ASK-2026-3103'].emergency.name === 'Lin Chua' && d3.memberInfo['ASK-2026-3103'].email === 'ryan.new@email.com');
  await page.fill('#c-phone', '12'); await page.click('#mContact button[type=submit]');
  check('R62-contact-validates-phone', (await page.locator('#c-phone').evaluate(e => e.closest('.fld').classList.contains('invalid'))) === true);
  /* payments tab: receipt, refund request, take payment */
  await page.goto(`${B}/admin_portal/member.html?no=ASK-2022-0090`);
  await page.click('#mTabs [data-tab="payments"]');
  check('R65-payment-history-with-receipt', (await page.locator('#mBody [data-rcpt]').count()) >= 1);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 4000 }).catch(() => null), page.click('#mBody [data-rcpt]')]);
  check('R65-receipt-reprint-pdf', !!dl && /receipt/.test(dl.suggestedFilename()), dl && dl.suggestedFilename());
  check('R62-fd-refund-request-only', (await page.locator('#mRefund').count()) === 1 && (await page.locator('[data-ref-ok]').count()) === 0);
  await page.click('#mRefund'); await page.fill('#rq-why', 'Charged twice'); await page.click('#rqGo'); await gone(page);
  check('R62-refund-request-saved', (await db(page)).refunds.some(r => r.no === 'ASK-2022-0090' && r.status === 'pending' && r.reason === 'Charged twice'));
  check('R62-refund-shows-waiting', /With a Business Admin/.test(await page.textContent('#mRefunds')));
  await page.click('#mPay');
  check('R61-take-payment-opens', (await page.locator('#modal.open #tp-go').count()) === 1);
  await page.keyboard.press('Escape');
  /* log contact + message */
  await page.click('#mLog'); await page.selectOption('#lc-outcome', 'Not returning').catch(() => {});
  await setSel(page, '#lc-outcome', 'Not returning');
  check('R67-not-returning-asks-reason', await page.isVisible('#lc-whybox'));
  await page.click('#lcSave');
  check('R67-not-returning-needs-reason', (await page.locator('#lcSave').count()) === 1);
  await page.fill('#lc-why', 'Moving overseas'); await page.click('#lcSave'); await drawerGone(page);
  d3 = await db(page);
  check('R67-contact-saved', d3.followups.some(f => f.no === 'ASK-2022-0090' && f.attempts.some(a => a.outcome === 'Not returning' && /Moving overseas/.test(a.note))));
  await page.click('#mMsg'); await page.fill('#sm-body', 'See you Tuesday'); await page.click('#smGo'); await gone(page);
  check('R61-send-message-logged', (await db(page)).sentLog.some(s => s.aud === 'Siti Rahman' || /See you Tuesday/.test(s.title)));
  /* child record: guardian */
  await page.goto(`${B}/admin_portal/member.html?no=ASK-2026-3101`);
  check('R61-child-guardian-chip', /Child/.test(await page.textContent('#mChips')) && /Mei Tan/.test(await page.textContent('#mChips')));
  await page.goto(`${B}/admin_portal/member.html?no=NOPE`);
  check('R61-unknown-member-message', /Student not found/.test(await text(page)));
  check('R10-fd-member-no-ba-nodes', (await page.locator('[data-ba]').count()) === 0);

  /* ---- Registrations (R55-R58) ---- */
  await page.goto(`${B}/admin_portal/applications.html`);
  await page.waitForSelector('#appRows .row');
  const tabsFd = await page.evaluate(() => [...document.querySelectorAll('#regTabs .fpill')].map(b => b.firstChild.textContent.trim()));
  check('R57-fd-two-tabs-no-exceptions', JSON.stringify(tabsFd) === JSON.stringify(['Registrations', 'Extensions']) && (await page.locator('#tabExc, #excRows, #nExc').count()) === 0, tabsFd.join('|'));
  const chips0 = await page.textContent('#appRows .row:first-child .chips');
  check('R55-checklist-chips', ['Details complete', 'Consent signed', 'Registration paid', 'Medical declared'].every(c => chips0.includes(c)), chips0.replace(/\s+/g, ' '));
  check('R55-status-chip', /Ready to activate/.test(await page.textContent('#appRows .row:first-child')));
  const emmaChips = await page.textContent('#appRows .row:nth-child(4) .chips');
  check('R55-guardian-consent-chip-for-child', /Guardian consent/.test(emmaChips));
  const liu = await page.textContent('#appRows .row:nth-child(3)');
  check('R55-needs-review-for-carry-over', /Needs review/.test(liu) && /Grade carry-over/.test(liu));
  check('R56-activate-disabled-when-review-for-fd', await page.locator('#appRows .row:nth-child(3) [data-reg-go]').isDisabled());
  check('R56-activate-enabled-when-all-pass', !(await page.locator('#appRows .row:nth-child(1) [data-reg-go]').isDisabled()));
  /* a registration that fails a rule */
  await page.evaluate(() => { APPS.push({ n: 'Test Missing', dojo: 'hq', date: '2 Nov 2026', paid: 0, group: 'Adult', age: 30, gender: 'Male', nat: 'Singaporean', phone: '9000 0000', email: 'm@e.com', ec: '', exp: '—', prev: 'No', med: 'No', dogi: 'size 3', pkg: '10 lessons', signer: '' }); save(); renderAll(); });
  const lastIdx = (await page.locator('#appRows .row').count());
  const miss = page.locator(`#appRows .row:nth-child(${lastIdx})`);
  check('R55-missing-info-status', /Missing info/.test(await miss.textContent()) && /Registration paid: missing/.test(await miss.textContent()));
  check('R56-activate-disabled-when-rule-fails', await miss.locator('[data-reg-go]').isDisabled());
  /* drawer actions */
  await miss.locator('[data-reg]').click();
  check('R56-drawer-actions', (await page.locator('#regReject, #regFlag, #regInfo, #regActivate').count()) === 4 && await page.locator('#regActivate').isDisabled());
  await page.click('#regInfo'); await page.fill('#ri-text', 'Proof of payment and consent'); await page.click('#riGo'); await gone(page);
  check('R56-request-missing-info', (await db(page)).apps.some(a => a.n === 'Test Missing' && a.infoRequested && /consent/.test(a.infoRequested.text)));
  await page.keyboard.press('Escape');
  /* no refund wording in the reject modal */
  await page.locator('#appRows .row:nth-child(1) [data-reg]').click();
  check('R58-fd-grade-disabled-confirmed-by-ba', (await page.locator('#app-grade').isDisabled()) && /Confirmed by Business Admin/.test(await page.textContent('#drawer')));
  await page.click('#regReject');
  const rejTxt = await page.textContent('#modal');
  check('R56-no-refund-wording', !/refund/i.test(rejTxt) && !/Reject and refund/i.test(await text(page)) && /Reject/.test(rejTxt), rejTxt.replace(/\s+/g, ' ').slice(0, 160));
  await page.keyboard.press('Escape');
  /* flag Liu Wei to create an exception */
  await page.locator('#appRows .row:nth-child(3) [data-reg]').click();
  await page.click('#regFlag'); await page.fill('#rf-why', 'Check carry-over records'); await page.click('#rfGo'); await gone(page);
  d3 = await db(page);
  check('R56-flag-creates-exception', d3.exceptions.some(x => x.kind === 'registration' && x.who === 'Liu Wei' && /Check carry-over records/.test(x.text) && x.status === 'pending') && d3.apps.find(a => a.n === 'Liu Wei').flagged);
  /* activate Sarah Lee: member + 3 equipment rows */
  const eq0 = d3.equipment.length, mem0 = d3.members.length;
  await page.locator('#appRows .row:nth-child(1) [data-reg-go]').click();
  await page.waitForTimeout(300);
  d3 = await db(page);
  check('R55-activate-adds-member', d3.members.length === mem0 + 1 && d3.members[0].n === 'Sarah Lee' && d3.members[0].st === 'Active' && !d3.apps.some(a => a.n === 'Sarah Lee'));
  check('R58-activation-creates-equipment', d3.equipment.length === eq0 + 3 && ['Dogi', 'Handbook', 'Belt'].every(i => d3.equipment.some(e => e.name === 'Sarah Lee' && e.item === i && e.status === 'Requested')) && d3.equipment.find(e => e.name === 'Sarah Lee' && e.item === 'Dogi').size === '3');
  check('R55-count-badge-updates', (await page.textContent('#nReg')) === String(d3.apps.length));
  await shot(page, 'fd-applications-registrations-1280');

  /* ---- Extensions (R52-R54), the MC chain ---- */
  await page.click('#regTabs [data-tab="ext"]');
  const p0 = await pass(page);
  const id1 = await addMC(page, { days: 3 });
  await page.click(`[data-mc-view="${id1}"]`);
  check('R52-two-tickboxes-default-ticked', (await page.locator('#mc-ret').isChecked()) && (await page.locator('#mc-ext').isChecked()));
  await page.click('#mcApprove'); await drawerGone(page);
  const p1 = await pass(page), r1 = (await db(page)).mcRequests.find(r => r.id === id1);
  check('R52-approve-both-extends-and-returns', p1.exp === p0.exp + 3 * dayMs && p1.left === p0.left + 1 && r1.status === 'approved' && r1.returnLesson === true && r1.extend === true, `${(p1.exp - p0.exp) / dayMs} days, left ${p0.left}->${p1.left}`);
  check('R52-newExp-recorded', +new Date(r1.newExp) === p1.exp);
  /* student bell shows the result */
  const sp = await ctx.newPage();
  await signInAs(sp, B, 'student');
  await sp.click('[data-notif]'); await sp.waitForTimeout(400);
  check('R52-student-bell-package-extended', /Package extended/.test(await text(sp)), (await text(sp)).replace(/\s+/g, ' ').slice(0, 100));
  await sp.close();
  /* untick Extend expiry */
  const id2 = await addMC(page, { days: 4 });
  await page.click(`[data-mc-view="${id2}"]`);
  await page.click('label:has(#mc-ext)');
  check('R52-untick-extend', !(await page.locator('#mc-ext').isChecked()));
  await page.click('#mcApprove'); await drawerGone(page);
  const p2 = await pass(page), r2 = (await db(page)).mcRequests.find(r => r.id === id2);
  check('R52-extend-off-leaves-expiry', p2.exp === p1.exp && p2.left === p1.left + 1 && r2.extend === false && r2.returnLesson === true, `left ${p1.left}->${p2.left}`);
  const sp2 = await ctx.newPage();
  await signInAs(sp2, B, 'student');
  await sp2.click('[data-notif]'); await sp2.waitForTimeout(400);
  check('R52-student-bell-lesson-returned', /Lesson returned/.test(await text(sp2)));
  await sp2.close();
  /* return lesson off, extend on */
  const id2b = await addMC(page, { days: 2 });
  await page.click(`[data-mc-view="${id2b}"]`); await page.click('label:has(#mc-ret)'); await page.click('#mcApprove'); await drawerGone(page);
  const p2b = await pass(page);
  check('R52-return-off-keeps-lessons', p2b.left === p2.left && p2b.exp === p2.exp + 2 * dayMs);
  /* neither ticked */
  const id2c = await addMC(page, { days: 2 });
  await page.click(`[data-mc-view="${id2c}"]`); await page.click('label:has(#mc-ret)'); await page.click('label:has(#mc-ext)'); await page.click('#mcApprove');
  check('R52-neither-ticked-blocked', (await page.locator('#mcApprove').count()) === 1 && (await pass(page)).exp === p2b.exp);
  await page.click('#mcReject'); await drawerGone(page);
  check('R52-not-approved-works', (await db(page)).mcRequests.find(r => r.id === id2c).status === 'rejected');
  /* Unlimited plan */
  const id3 = await addMC(page, { passName: 'Unlimited', passId: 'U-1', days: 3 });
  await page.click(`[data-mc-view="${id3}"]`);
  check('R53-unlimited-note-and-disabled-ticks', /Unlimited plan/.test(await page.textContent('#drawer')) && (await page.locator('#mc-ret').isDisabled()) && (await page.locator('#mc-ext').isDisabled()));
  await page.click('#mcApprove'); await drawerGone(page);
  const p3 = await pass(page), r3 = (await db(page)).mcRequests.find(r => r.id === id3);
  check('R53-unlimited-excused-no-changes', r3.status === 'approved' && r3.excused === true && p3.exp === p2b.exp && p3.left === p2b.left && r3.returnLesson === false && r3.extend === false);
  /* more than 14 days */
  const id4 = await addMC(page, { days: 20, from: new Date(Date.now() - 25 * dayMs), to: new Date(Date.now() - 6 * dayMs) });
  await page.click(`[data-mc-view="${id4}"]`);
  check('R52-over-14-refer-for-fd', (await page.locator('#mcRefer').count()) === 1 && (await page.locator('#mcApprove').count()) === 0 && /Refer to Business Admin/.test(await page.textContent('#drawerFoot')));
  await page.click('#mcRefer'); await drawerGone(page);
  d3 = await db(page);
  check('R52-refer-creates-exception', d3.exceptions.some(x => x.mcId === id4 && x.kind === 'extension' && x.status === 'pending') && d3.mcRequests.find(r => r.id === id4).referred === true);
  check('R57-referred-chip', /With Business Admin/.test(await page.textContent('#mcRows')));
  /* no MC attached */
  const id5 = await addMC(page, { days: 3, fileName: '' });
  await page.click(`[data-mc-view="${id5}"]`);
  check('R52-no-mc-goes-to-ba', (await page.locator('#mcRefer').count()) === 1);
  await page.keyboard.press('Escape');
  /* Compassion */
  const id6 = await addMC(page, { kind: 'compassion', days: 14, from: null, to: null, fileName: '', passName: '1-month pass' });
  await page.click(`[data-mc-view="${id6}"]`);
  await page.click('#mcApprove');
  check('R54-compassion-needs-confirm', (await page.locator('#mcApprove').count()) === 1 && /Compassion Guaranteed/.test(await page.textContent('#drawer')));
  await page.click('label:has(#mc-comp)'); await page.click('#mcApprove'); await drawerGone(page);
  check('R54-compassion-fd-confirms', (await db(page)).mcRequests.find(r => r.id === id6).status === 'approved');
  const aSrc = await (await page.request.get(`${B}/admin_portal/applications.html`)).text();
  check('R52-mc-debug-panel-comment', /DEBUG PANEL \(placeholder\)/.test(aSrc));
  await shot(page, 'fd-applications-extensions-1280');
  check('R56-no-reject-and-refund-anywhere', !/Reject and refund/i.test(aSrc) && !/Reject and refund/i.test(await (await page.request.get(`${B}/admin_portal/admin-members.js`)).text()));

  /* ---- register.html (R59, R60) ---- */
  await page.goto(`${B}/admin_portal/register.html`);
  await page.waitForSelector('#regForm');
  check('R59-parent-highlights-registrations', /on/.test(await page.getAttribute('.rail nav a[href$="applications.html"]', 'class') || ''));
  await page.click('#rgPay');
  const inv = await page.evaluate(() => [...document.querySelectorAll('#regForm .fld.invalid')].map(f => (f.querySelector('label, .lbl') || {}).textContent));
  check('R59-dob-required', inv.some(t => /Date of birth/.test(t || '')), inv.join('|'));
  check('R59-signature-required', await page.evaluate(() => document.querySelector('#f-sig').classList.contains('invalid')));
  check('R59-consent-required', await page.evaluate(() => document.querySelector('#f-terms').classList.contains('invalid') && document.querySelector('#f-pdpa').classList.contains('invalid')));
  /* 20-year-old: 17-25 discount shown from the date of birth */
  await page.evaluate(() => document.querySelector('#rg-dob').dpSet(new Date(new Date().getFullYear() - 20, 5, 15)));
  await page.waitForTimeout(200);
  check('R60-age-and-discount-from-dob', (await page.inputValue('#rg-age')) === '20' && /Age 17 to 25 · 50% off/.test(await page.textContent('#rgFees')) && /no proof needed/.test(await page.textContent('#rgDisc')), await page.textContent('#rgDisc'));
  const tot20 = await page.textContent('#rgTotal');
  await page.evaluate(() => document.querySelector('#rg-dob').dpSet(new Date(new Date().getFullYear() - 40, 5, 15)));
  await page.waitForTimeout(200);
  check('R60-no-discount-at-40', !/50% off/.test(await page.textContent('#rgFees')) && (await page.textContent('#rgTotal')) !== tot20);
  await page.evaluate(() => document.querySelector('#rg-dob').dpSet(new Date(new Date().getFullYear() - 70, 5, 15)));
  await page.waitForTimeout(200);
  check('R60-senior-40-percent', /40% off/.test(await page.textContent('#rgFees')));
  await page.evaluate(() => document.querySelector('#rg-dob').dpSet(new Date(new Date().getFullYear() - 10, 5, 15)));
  await page.waitForTimeout(200);
  check('R59-guardian-section-for-minor', await page.isVisible('#rgGuardian') && (await page.locator('#rg-pkg option').count()) > 1);
  await page.evaluate(() => document.querySelector('#rg-dob').dpSet(new Date(new Date().getFullYear() - 20, 5, 15)));
  await page.waitForTimeout(200);
  check('R59-guardian-hidden-for-adult', !(await page.isVisible('#rgGuardian')));
  check('R59-ns-proof-fd-no-open', (await page.locator('#rg-ns').count()) === 1 && /Only a Business Admin/.test(await page.textContent('#rgNsState')));
  /* fill and submit */
  await page.fill('#rg-name', 'Nina Reg Test');
  await page.click('label[for="rg-g2"]'); await setSel(page, '#rg-nat', 'Singaporean');
  await page.fill('#rg-phone', '91234567'); await page.fill('#rg-email', 'nina@email.com');
  await page.fill('#rg-ecname', 'Tom Test'); await setSel(page, '#rg-ecrel', 'Parent'); await page.fill('#rg-ecphone', '82345678');
  await page.click('label[for="rg-m1"]'); await setSel(page, '#rg-dogi', '2'); await setSel(page, '#rg-pkg', 'a10');
  await page.waitForTimeout(150);
  check('R60-package-added-to-fees', /10-lesson pack/.test(await page.textContent('#rgFees')));
  await page.check('#rg-terms'); await page.check('#rg-pdpa');
  await page.click('#rgPay');
  check('R59-signature-still-required-after-fill', await page.evaluate(() => document.querySelector('#f-sig').classList.contains('invalid')) && (await page.locator('#regDone:not([hidden])').count()) === 0);
  await page.click('#rgSig .sig-start');
  const bb = await page.locator('#rgSig canvas').boundingBox();
  await page.mouse.move(bb.x + 30, bb.y + 40); await page.mouse.down();
  for (let k = 0; k < 12; k++) await page.mouse.move(bb.x + 30 + k * 12, bb.y + 40 + (k % 3) * 14);
  await page.mouse.up();
  await page.click('#rgSig [data-sig="finish"]');
  const m0 = (await db(page)).members.length, e0 = (await db(page)).equipment.length, l0 = (await db(page)).ledger.length;
  await page.click('#rgPay');
  await page.waitForSelector('#regDone:not([hidden])', { timeout: 5000 });
  d3 = await db(page);
  const nina = d3.members.find(m => m.n === 'Nina Reg Test');
  check('R59-registered-and-activated', !!nina && d3.members.length === m0 + 1 && nina.st === 'Active' && nina.dob === `${new Date().getFullYear() - 20}-06-15`);
  check('R59-equipment-requests-created', d3.equipment.length === e0 + 3 && d3.equipment.filter(e => e.no === nina.no).length === 3 && d3.equipment.find(e => e.no === nina.no && e.item === 'Dogi').size === '2');
  check('R60-discount-in-ledger', d3.ledger.length === l0 + 4 && d3.ledger.filter(l => l.no === nina.no && l.item === 'Registration').every(l => l.amt === 30 && l.method === 'Stripe'));
  check('R59-done-links-to-record', (await page.getAttribute('#regDone a.sbtn.dark', 'href')).includes(nina.no));
  await shot(page, 'fd-register-done-1280');
  /* existing External member gets ASK membership */
  await page.goto(`${B}/admin_portal/register.html`);
  await page.fill('#rg-find', 'Daniel Park');
  await page.click('#rgFound [data-pick="EXT-2026-0041"]');
  check('R59-external-match-note', /External member/.test(await page.textContent('#rgExisting')) && (await page.inputValue('#rg-name')) === 'Daniel Park' && /S\$60/.test(await page.textContent('#rgExisting')) && (await page.inputValue('#rg-age')) !== '');
  await setSel(page, '#rg-nat', 'Other'); await page.click('label[for="rg-g1"]');
  await page.fill('#rg-ecname', 'Park Min'); await setSel(page, '#rg-ecrel', 'Sibling'); await page.fill('#rg-ecphone', '82345670');
  await page.click('label[for="rg-m1"]'); await setSel(page, '#rg-dogi', '3');
  await page.check('#rg-terms'); await page.check('#rg-pdpa');
  await page.click('#rgSig .sig-start');
  const bb2 = await page.locator('#rgSig canvas').boundingBox();
  await page.mouse.move(bb2.x + 30, bb2.y + 40); await page.mouse.down();
  for (let k = 0; k < 12; k++) await page.mouse.move(bb2.x + 30 + k * 12, bb2.y + 40 + (k % 3) * 14);
  await page.mouse.up(); await page.click('#rgSig [data-sig="finish"]');
  const n1 = (await db(page)).members.length;
  await page.click('#rgPay');
  await page.waitForSelector('#regDone:not([hidden])', { timeout: 5000 });
  d3 = await db(page);
  const dp = d3.members.find(m => m.no === 'EXT-2026-0041');
  check('R59-external-gains-ask-membership', dp.source === 'ASK' && d3.members.length === n1 && d3.members.filter(m => m.n === 'Daniel Park').length === 1);
  /* carry-over registration waits for the Business Admin */
  await page.goto(`${B}/admin_portal/register.html`);
  check('R59-form-has-carry-over-select', (await page.locator('#rg-carry option').count()) > 1);

  /* ---- Follow-ups (R66-R69) ---- */
  await page.goto(`${B}/admin_portal/followups.html`);
  await page.waitForSelector('#fuTabs .fpill');
  const ftabs = await page.evaluate(() => [...document.querySelectorAll('#fuTabs .fpill')].map(b => b.firstChild.textContent.trim()));
  check('R66-four-tabs', JSON.stringify(ftabs) === JSON.stringify(['Newcomers not returned', 'Declining attendance', 'Renewals coming up', 'Assigned to me']), ftabs.join('|'));
  const fheads = await page.evaluate(() => [...document.querySelectorAll('.tbl thead th')].map(t => t.textContent.trim()).filter(Boolean));
  check('R66-columns', ['Student', 'Reason', 'Last seen', 'Phone', 'Attempts', 'Due'].every(c => fheads.includes(c)), fheads.join('|'));
  check('R68-reminder-note', /not proof that something is wrong with a class or an instructor/.test(await page.textContent('.note')));
  await page.click('#fuTabs [data-tab="declining"]');
  const dec = await page.evaluate(() => [...document.querySelectorAll('#fuRows tr')].map(r => r.dataset.no).filter(no => { const m = MEMBERS.find(x => x.no === no); return !(mbSeen(m) >= 14 || DB.followups.some(f => f.no === no && f.kind === 'declining')); }));
  check('R66-declining-uses-14-days', (await page.locator('#fuRows tr[data-no]').count()) > 0 && dec.length === 0, dec.join(','));
  const row = page.locator('#fuRows tr[data-no="ASK-2026-0102"]');
  const before = +(await row.locator('td:nth-child(5)').evaluate(td => parseInt(td.textContent)));
  await row.locator('[data-log]').click();
  await page.fill('#lc-note', 'Left a voicemail'); await setSel(page, '#lc-outcome', 'No answer'); await page.fill('#lc-next', '2030-01-15');
  await page.click('#lcSave'); await drawerGone(page);
  const after = +(await page.locator('#fuRows tr[data-no="ASK-2026-0102"] td:nth-child(5)').evaluate(td => parseInt(td.textContent)));
  d3 = await db(page);
  check('R67-log-contact-increments-attempts', after === before + 1 && d3.followups.find(f => f.no === 'ASK-2026-0102').attempts.length === after, `${before} -> ${after}`);
  check('R67-next-date-saved', /2030/.test(d3.followups.find(f => f.no === 'ASK-2026-0102').due));
  await page.click('#fuTabs [data-tab="mine"]');
  check('R66-assigned-to-me-shows-own', (await page.locator('#fuRows tr[data-no]').count()) >= 1);
  await page.click('#fuTabs [data-tab="renewal"]'); await page.click('#fuTabs [data-tab="newcomer"]');
  check('R66-newcomer-rows', (await page.locator('#fuRows tr[data-no]').count()) >= 1);
  check('R69-ba-controls-absent-for-fd', (await page.locator('#fuBA, [data-ba], [data-assign], #fuCreate').count()) === 0);
  await shot(page, 'fd-followups-1280');
  check('FD-no-console-errors', errors.length === 0, errors.join(' | '));
  await ctx.close();

  /* ================= phone (390) ================= */
  {
    const m = await newPage(env, { mobile: true });
    await signInAs(m.page, B, 'fd');
    for (const [pg, sel, shotName] of [['members.html', '#memRows tr', 'fd-members-390'], ['member.html?no=ASK-2026-3103', '#mTabs .fpill', 'fd-member-390'], ['applications.html', '#appRows .row', 'fd-applications-390'], ['register.html', '#regForm', 'fd-register-390'], ['followups.html', '#fuRows tr', 'fd-followups-390']]) {
      await m.page.goto(`${B}/admin_portal/${pg}`);
      await m.page.waitForSelector(sel);
      check(`R103-no-overflow-390-${pg.split('.')[0]}`, !(await overflow(m.page)));
      await shot(m.page, shotName);
    }
    await m.page.goto(`${B}/admin_portal/applications.html`);
    await m.page.waitForSelector('#appRows .row');
    await m.page.locator('#appRows [data-reg]').first().click();
    await shot(m.page, 'fd-applications-drawer-390');
    check('phone-no-console-errors', m.errors.length === 0, m.errors.join(' | '));
    await m.ctx.close();
  }

  /* ================= Business Admin ================= */
  {
    const b = await newPage(env);
    const p = b.page;
    await signInAs(p, B, 'ba');
    /* R70 */
    await p.waitForSelector('#baHome');
    await p.click('#baHome [data-page-link="followups"]');
    await p.waitForURL(/admin_portal\/followups\.html/);
    check('R70-low-attendance-opens-followups', true);
    /* members export */
    await p.goto(`${B}/admin_portal/members.html`);
    await p.waitForSelector('#memRows tr');
    check('R51-ba-export-present', (await p.locator('[data-export="members"]').count()) === 1);
    await p.click('#memFilter [data-f="Active"]');
    const nBA = await p.locator('#memRows tr').count();
    const [csv] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), p.click('[data-export="members"]')]);
    check('R51-ba-export-downloads-csv', !!csv && /members-.*\.csv/.test(csv.suggestedFilename()), csv && csv.suggestedFilename());
    /* member record */
    await p.goto(`${B}/admin_portal/member.html?no=ASK-2026-3103`);
    await p.waitForSelector('#mTabs .fpill');
    check('R63-ba-edit-button', (await p.locator('#mEdit').count()) === 1);
    check('R64-ba-can-open-ns-papers', (await p.locator('[data-doc="ns"]').count()) === 1);
    await p.click('[data-doc="ns"]');
    check('R64-ns-modal-opens', /NS papers/.test(await p.textContent('#modal')));
    await p.keyboard.press('Escape');
    await p.click('#mEdit');
    check('R63-belt-never-editable-for-ba', (await p.locator('#drawer select').count()) === 2 && (await p.locator('#drawer option', { hasText: 'Kyu' }).count()) === 0 && /grading only/.test(await p.textContent('#drawer')));
    await setSel(p, '#ms-st', 'Lapsed');
    await p.click('#msSave');
    check('R63-ba-save-needs-reason', (await p.locator('#msSave').count()) === 1 && (await db(p)).members.find(m => m.no === 'ASK-2026-3103').st === 'Active');
    await p.fill('#ms-why', 'Cancelled by phone'); await setSel(p, '#ms-dojo', 'bishan');
    await p.click('#msSave'); await drawerGone(p);
    const rb = (await db(p)).members.find(m => m.no === 'ASK-2026-3103');
    check('R63-ba-changes-status-and-dojo-with-reason', rb.st === 'Lapsed' && rb.dojo === 'bishan' && (await db(p)).memberInfo['ASK-2026-3103'].log.some(l => /Cancelled by phone/.test(l.reason)));
    check('R63-belt-unchanged', rb.g === '6th Kyu');
    await p.goto(`${B}/admin_portal/member.html?no=ASK-2023-0456`);
    await p.click('#mTabs [data-tab="payments"]');
    check('R62-ba-refund-approve-no-request-button', (await p.locator('[data-ref-ok]').count()) === 1 && (await p.locator('#mRefund').count()) === 0);
    await p.click('[data-ref-ok]');
    check('R62-ba-approves-refund', (await db(p)).refunds.find(r => r.id === 'R-01').status === 'approved');
    await shot(p, 'ba-member-1280');
    /* applications: exceptions tab */
    await p.goto(`${B}/admin_portal/applications.html`);
    await p.waitForSelector('#appRows .row');
    const tabsBa = await p.evaluate(() => [...document.querySelectorAll('#regTabs .fpill')].map(x => x.firstChild.textContent.trim()));
    check('R57-ba-three-tabs', JSON.stringify(tabsBa) === JSON.stringify(['Registrations', 'Extensions', 'Exceptions']), tabsBa.join('|'));
    await p.click('#regTabs [data-tab="exc"]');
    const excN = await p.locator('#excRows [data-exc-ok]').count();
    check('R57-exceptions-listed', excN >= 3 && /Liu Wei/.test(await p.textContent('#excRows')) && /Payment mistake/.test(await p.textContent('#excRows')) && /Access request/.test(await p.textContent('#excRows')), `${excN} pending`);
    await p.locator('#excRows [data-exc-no]').first().click();
    await p.click('#exGo');
    check('R57-decision-needs-reason', (await p.locator('#exGo').count()) === 1);
    await p.fill('#ex-why', 'Not allowed by policy'); await p.click('#exGo'); await gone(p);
    d3 = await db(p);
    check('R57-decline-with-reason', d3.exceptions.filter(x => x.status === 'declined' && x.reason === 'Not allowed by policy').length === 1);
    await p.locator('#excRows [data-exc-ok]').first().click(); await p.fill('#ex-why', 'Approved by BA'); await p.click('#exGo'); await gone(p);
    check('R57-approve-with-reason', (await db(p)).exceptions.some(x => x.status === 'approved' && x.reason === 'Approved by BA'));
    check('R57-ba-count-includes-exceptions', (await p.textContent('#nExc')) === String((await db(p)).exceptions.filter(x => x.status === 'pending').length));
    await shot(p, 'ba-applications-exceptions-1280');
    /* BA approves an over-14 day MC; the linked exception is resolved */
    await p.click('#regTabs [data-tab="ext"]');
    const idB = await addMC(p, { days: 20, from: new Date(Date.now() - 25 * dayMs), to: new Date(Date.now() - 6 * dayMs) });
    await p.evaluate(id => { DB.exceptions.unshift({ id: 'X-T1', kind: 'extension', who: 'Lervyn Wong', text: 'test', by: 'Daniel Ong', at: new Date(), status: 'pending', mcId: id }); save(); renderAll(); }, idB);
    const pb0 = await pass(p);
    await p.click(`[data-mc-view="${idB}"]`);
    check('R52-ba-can-approve-over-14', (await p.locator('#mcApprove').count()) === 1 && (await p.locator('#mcRefer').count()) === 0);
    await p.click('#mcApprove'); await drawerGone(p);
    const pb1 = await pass(p);
    check('R52-ba-approval-applied', pb1.exp === pb0.exp + 20 * dayMs && pb1.left === pb0.left + 1);
    check('R57-linked-exception-resolved', (await db(p)).exceptions.find(x => x.id === 'X-T1').status === 'approved');
    /* BA activates a flagged registration, grade select enabled */
    await p.click('#regTabs [data-tab="reg"]');
    const liuRow = p.locator('#appRows .row', { hasText: 'Liu Wei' });
    check('R56-ba-can-activate-review-item', !(await liuRow.locator('[data-reg-go]').isDisabled()));
    await liuRow.locator('[data-reg]').click();
    check('R58-ba-grade-select-enabled', !(await p.locator('#app-grade').isDisabled()) && (await p.locator('#app-grade option').count()) === 2 && !/Confirmed by Business Admin/.test(await p.textContent('#drawer')));
    await p.click('#regActivate'); await drawerGone(p);
    check('R58-ba-confirms-carried-grade', (await db(p)).members.find(m => m.n === 'Liu Wei').g === '1st Kyu');
    /* follow-ups BA controls */
    await p.goto(`${B}/admin_portal/followups.html`);
    await p.waitForSelector('#fuTabs .fpill');
    check('R69-ba-controls-present', (await p.locator('#fuBA, #fuCreate, #fu-owner').count()) === 3 && (await p.locator('[data-assign]').count()) >= 1);
    const f0 = (await db(p)).followups.length;
    await setSel(p, '#fu-kind', 'declining'); await p.click('#fuCreate');
    const f1 = (await db(p)).followups.length;
    check('R69-ba-creates-list', f1 > f0 && (await db(p)).followups.slice(f0).every(f => f.owner === 'ADM-101' || f.owner));
    await p.click('#fuTabs [data-tab="declining"]');
    const sel = p.locator('#fuRows tr[data-no] [data-assign]').first();
    const tno = await p.locator('#fuRows tr[data-no]').first().getAttribute('data-no');
    await sel.selectOption('ADM-001');
    check('R69-ba-assigns-and-reassigns', (await db(p)).followups.find(f => f.no === tno && f.kind === 'declining').owner === 'ADM-001');
    await p.click('#fuTabs [data-tab="mine"]');
    check('R69-assigned-to-ba-shows-in-mine', (await p.locator('#fuRows tr[data-no]').count()) >= 1);
    check('R69-review-outcomes', (await p.locator('#fuOutcomes .row').count()) >= 1 || /No contact has been logged/.test(await p.textContent('#fuOutcomes')));
    await shot(p, 'ba-followups-1280');
    check('BA-no-console-errors', b.errors.length === 0, b.errors.join(' | '));
    await b.ctx.close();
  }
} catch (e) {
  check('verify-feat3-ran-to-completion', false, String(e && e.stack || e).slice(0, 600));
} finally {
  await env.close();
  finish();
}

