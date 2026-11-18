// Browser run (headless Edge): the instructor portal against the real API + seed + fixtures around the current time.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect } from './lib.mjs';
import { launch, newPage, settle, signInStaff, storageDump, htmlPagesOf, SCREENS } from './browser-lib.mjs';
import { makeFixtures } from './instructor-fixtures.mjs';
const t = suite('browser-instructor');
await resetDb();
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
const fx = await makeFixtures(pg);
console.log(`fixtures: ${fx.usable ? 'live classes + grading panel created' : 'SKIPPED live parts (server clock too close to midnight)'}`);
const hoursOf = async u => Number((await q(`select total_accumulated_hours::text t from student_profile where user_id = $1`, [u]))[0].t);
const PAGES = htmlPagesOf('instructor_portal');
try {
  // the fixture panel starts closed (moved to a later day), so the grading page can be seen gated first
  if (fx.usable) await pg.query(`update grading_session set session_date = '2026-11-20' where id = $1`, [fx.gr]);

  // ---------- gating: no examiner window now
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStaff(page, base, 'instructor', 'INS-0042');
    await page.goto(base + '/instructor_portal/grading.html'); await settle(page); await page.waitForTimeout(800);
    t.check('grading page without an open window: sent back to the schedule (?nograding), not shown', /instructor_portal\/index\.html\?nograding/.test(page.url()), page.url());
    t.check('schedule: the Grading menu / examiner pill is not shown while there is no window', (await page.locator('.solo-bar .pill', { hasText: 'Examiner' }).count()) === 0);
    clean('gated grading page', problems);
    await ctx.close();
  }
  // ---------- every instructor page, 1280 and 390 (grading is open now)
  if (fx.usable) await pg.query(`update grading_session set session_date = '2026-11-06' where id = $1`, [fx.gr]);
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await signInStaff(page, base, 'instructor', 'INS-0042');
    for (const f of PAGES) {
      await page.goto(`${base}/instructor_portal/${f}`); await settle(page); await page.waitForTimeout(600);
      const shown = await page.evaluate(() => document.body.classList.contains('ok'));
      if (f === 'grading.html' && !fx.usable) t.check(`instructor ${f} @${width}: gated without a window`, /nograding/.test(page.url()));
      else t.check(`instructor ${f} @${width}: page shown (guard passed, body.ok)`, shown, page.url());
    }
    const s = await storageDump(page);
    t.check(`instructor @${width}: no ask-prototype / ask-role / ask-admin keys and no business data in storage`, ![...s.local, ...s.session].some(k => /ask-prototype|ask-role|ask-admin|ask-last-id/.test(k)) && !/Bob Tan|ASK-20|S-0\d\d|eyJ/.test(s.localValues + s.sessionValues), JSON.stringify(s));
    clean(`instructor pages @${width}`, problems);
    await ctx.close();
  }

  // ---------- schedule = the db for the fake day
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStaff(page, base, 'instructor', 'INS-0042');
    await page.goto(base + '/instructor_portal/index.html'); await settle(page); await page.waitForTimeout(600);
    const shown = await page.locator('#schedGrid .cls-slot').evaluateAll(els => els.map(e => e.dataset.slot).sort());
    const dbDay = (await q(`select lesson_id from class_session where instructor_id = 'INS-0042' and session_date = '2026-11-06' and status <> 'Cancelled' order by 1`)).map(r => r.lesson_id);
    t.check('schedule: Bob\'s slots for 6 Nov equal the class_session rows (seed + fixtures)', JSON.stringify(shown) === JSON.stringify(dbDay) && shown.includes('LS-20261106-1900-HQ-A'), `${shown} vs ${dbDay}`);
    t.check('schedule: the title says Today, the chips cover the week', /Today/.test(await page.locator('#dayTitle').innerText()) && (await page.locator('#dayChips .ag-day').count()) === 7);
    // week and month views draw from the same data
    await page.click('#schView [data-view="week"]'); await page.waitForTimeout(600);
    t.check('week view: seven days listed', (await page.locator('#weekList .wk-day').count()) === 7);
    await page.click('#schView [data-view="month"]'); await page.waitForTimeout(600);
    t.check('month view: calendar grid of 42 days with class dots', (await page.locator('#monthGrid .mc-day').count()) === 42 && (await page.locator('#monthGrid .dot-c').count()) > 5);
    await page.click('#schNext'); await page.waitForTimeout(600);
    t.check('month view: next month loads (December) and shows the grading dot on 13 Dec', /December/.test(await page.locator('#dayTitle').innerText()) && (await page.locator('#monthGrid .dot-g').count()) === 1);
    await page.click('#schToday'); await page.click('#schView [data-view="day"]'); await page.waitForTimeout(500);
    t.check('the grading panel of today is on the day grid only when the examiner is on it (fixture panel today)', fx.usable ? (await page.locator('#schedGrid .grade-slot').count()) === 1 : true);
    await page.screenshot({ path: path.join(SCREENS, 'instructor-schedule-1280.png') });

    if (fx.usable) {
      // ---------- roster, marking, remarks, End class
      await page.click(`#schedGrid [data-slot="${fx.live}"]`); await page.waitForTimeout(700);
      t.check('roster opens with the 3 booked students, none checked in', await page.locator('#roster .row').count() === 3 && (await page.locator('#roster .mark.on').count()) === 0 && !(await page.locator('#rosterCard').getAttribute('hidden')));
      t.check('roster: End class and Mark all are offered while the class is live', await page.locator('#endClass').isVisible() && await page.locator('#markAll').isVisible());
      const h0 = await hoursOf('S-001');
      await page.click('#roster [data-mark="S-001"]'); await page.waitForTimeout(600);
      t.check('tick: row shows checked and locked, SQL hours +1.0 exactly', (await page.locator('#roster [data-mark="S-001"]').getAttribute('disabled')) !== null && (await hoursOf('S-001')) - h0 === 1);
      t.check('tick: the sub line reads 1 of 3 checked in', /1 of 3 checked in/.test(await page.locator('#rosterSub').innerText()), await page.locator('#rosterSub').innerText());
      await page.reload(); await settle(page); await page.waitForTimeout(500);
      await page.click(`#schedGrid [data-slot="${fx.live}"]`); await page.waitForTimeout(700);
      t.check('after a reload the tick is still there (it is saved on the server)', (await page.locator('#roster .mark.on').count()) === 1 && (await hoursOf('S-001')) - h0 === 1);
      // class remark
      await page.click('#classRemarkBox summary'); await page.fill('#classRemarkText', 'Practised kokyu-ho and suwari-waza.'); await page.click('#saveClassRemark'); await page.waitForTimeout(600);
      t.check('class remark saved to the db', (await q(`select body from instructor_remark where kind = 'class' and lesson_id = $1`, [fx.live]))[0]?.body === 'Practised kokyu-ho and suwari-waza.');
      // student drawer: remark + grading note (S-002 has applied for grading)
      await page.click('#roster [data-s="S-002"]'); await page.waitForTimeout(700);
      t.check('student drawer: shows the student, a remark box and a grading-note box (applied for grading)', (await page.locator('#stuRemark').count()) === 1 && (await page.locator('#stuGradeNote').count()) === 1);
      await page.click('#drawer details:has(#stuRemark) summary'); await page.fill('#stuRemark', 'Calm ukemi today.');
      await page.click('#drawer details:has(#stuGradeNote) summary'); await page.fill('#stuGradeNote', 'Ready for the next grade.');
      await page.click('#saveStuRemark'); await page.waitForTimeout(800);
      const rem = await q(`select kind, body from instructor_remark where student_id = 'S-002' and lesson_id = $1 order by kind`, [fx.live]);
      t.check('student remark + grading note saved to the db', rem.length === 2 && rem[0].kind === 'grading' && rem[1].body === 'Calm ukemi today.', JSON.stringify(rem));
      t.check('roster shows the remark dot for that student', (await page.locator('#roster [data-s="S-002"] .rm-dot').count()) === 1);
      // mark all, End class
      await page.click('#markAll'); await page.waitForTimeout(900);
      t.check('Mark all: all three present; each credited one hour once (S-001 still +1 only)', (await page.locator('#roster .mark.on').count()) === 3 && (await hoursOf('S-001')) - h0 === 1);
      await page.screenshot({ path: path.join(SCREENS, 'instructor-roster-1280.png') });
      await page.click('#endClass'); await page.waitForTimeout(500);
      t.check('End class dialog counts 3 present, 0 no-shows', /3\s*students present/.test((await page.locator('#modal .end-sum .es.ok').innerText()).replace(/\n/g, ' ')), await page.locator('#modal .end-sum').innerText());
      await page.click('#doEnd'); await page.waitForTimeout(1000);
      t.check('after End class the roster is locked (pill + no tick buttons)', (await page.locator('#rosterLocked').isVisible()) && (await page.locator('#roster .mark').count()) === 0 && (await page.locator('#roster .pill.ok').count()) === 3);
      t.check('SQL: class ended, all Attended', (await q(`select status from class_session where lesson_id = $1`, [fx.live]))[0].status === 'Ended' && (await q(`select count(*)::int n from class_attendance where lesson_id = $1 and attendance_status = 'Attended'`, [fx.live]))[0].n === 3);
      // second class: leave two students un-ticked and end it => no-shows
      await page.click(`#schedGrid [data-slot="${fx.end}"]`); await page.waitForTimeout(700);
      await page.click('#roster [data-mark="S-001"]'); await page.waitForTimeout(500);
      await page.click('#endClass'); await page.waitForTimeout(400);
      t.check('End class dialog: 1 present, 2 no-shows', /1\s*student present/.test((await page.locator('#modal .end-sum .es.ok').innerText()).replace(/\n/g, ' ')) && /2\s*no-shows/.test((await page.locator('#modal .end-sum .es.warn').innerText()).replace(/\n/g, ' ')));
      await page.click('#doEnd'); await page.waitForTimeout(1000);
      t.check('SQL: leftover Booked became No-Show without hours', (await q(`select attendance_status s from class_attendance where lesson_id = $1 order by user_id`, [fx.end])).map(r => r.s).join() === 'Attended,No-Show,No-Show');
      await page.screenshot({ path: path.join(SCREENS, 'instructor-roster-ended-1280.png') });
    }
    clean('schedule flows', problems);
    await ctx.close();
  }

  // ---------- grading flow
  if (fx.usable) {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStaff(page, base, 'instructor', 'INS-0042');
    await page.goto(base + '/instructor_portal/grading.html'); await settle(page); await page.waitForTimeout(800);
    t.check('grading page opens inside the examiner window', /instructor_portal\/grading\.html/.test(page.url()) && (await page.evaluate(() => document.body.classList.contains('ok'))));
    t.check('examiner pill shown in the top bar', (await page.locator('.solo-bar .pill', { hasText: 'Examiner' }).count()) === 1);
    t.check('queue lists the 3 candidates, "3 to score"', (await page.locator('#candQueue .cand-row').count()) === 3 && /3 to score/.test(await page.locator('#examCount').innerText()));
    t.check('header names the panel date', /6 Nov 2026/.test(await page.locator('#examSub').innerText()), await page.locator('#examSub').innerText());
    const jamie = (await q(`select full_name from student_profile where user_id = 'S-002'`))[0].full_name;
    await page.click(`#candQueue .cand-row:has-text("${jamie}")`); await page.waitForTimeout(500);
    t.check('the grading note written on the roster is shown to the examiner', /Ready for the next grade\./.test(await page.locator('#examMain').innerText()));
    const submit = page.locator('#exSubmit');
    t.check('submit is disabled until everything is filled', await submit.isDisabled());
    for (const id of ['Omote', 'Ura'].flatMap(v => ['entry', 'control', 'posture'].map(c => `${v}-${c}`))) await page.click(`[data-band="${id}"][data-k="excellent"]`);
    t.check('all criteria scored: 18 of 18 marks, result Pass', (await page.locator('#exTotal').innerText()) === '18' && /Pass/.test(await page.locator('#exResult').innerText()));
    await page.fill('#exWell', 'Calm, clean ukemi.'); await page.fill('#exNext', 'Keep the hips lower.');
    await page.click('#exSig [data-sig="start"]'); await page.waitForTimeout(300);
    const cv = await page.locator('#exSig canvas').boundingBox();
    await page.mouse.move(cv.x + 20, cv.y + 30); await page.mouse.down(); await page.mouse.move(cv.x + 90, cv.y + 60, { steps: 6 }); await page.mouse.move(cv.x + 140, cv.y + 25, { steps: 6 }); await page.mouse.up();
    await page.click('#exSig [data-sig="finish"]'); await page.waitForTimeout(300);
    t.check('after signing, submit is enabled', await submit.isEnabled());
    await page.screenshot({ path: path.join(SCREENS, 'instructor-grading-1280.png') });
    await submit.click(); await page.waitForTimeout(1000);
    const cr = (await q(`select result, score::float s, promotion_status p, examiner_id e from grading_candidate where session_id = $1 and user_id = 'S-002'`, [fx.gr]))[0];
    t.check('SQL: result computed on the server: Pass, 100, Pending approval, examiner Bob', cr.result === 'Pass' && cr.s === 100 && cr.p === 'Pending approval' && cr.e === 'INS-0042', JSON.stringify(cr));
    t.check('rank unchanged until HQ approves', (await q(`select rank_id from student_profile where user_id = 'S-002'`))[0].rank_id === '3k');
    t.check('the queue shows the Pass pill and "2 to score"; the panel is read-only', (await page.locator('#candQueue .cand-row.on .pill.ok').count()) === 1 && /2 to score/.test(await page.locator('#examCount').innerText()) && (await page.locator('#exSubmit').count()) === 0);
    await page.reload(); await settle(page); await page.waitForTimeout(800);
    t.check('after a reload the sent result is still shown (Pass)', (await page.locator('#candQueue .pill.ok').count()) === 1);
    clean('grading flow', problems);
    await ctx.close();
  }

  // ---------- profile
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await signInStaff(page, base, 'instructor', 'INS-0042');
    await page.goto(base + '/instructor_portal/profile.html'); await settle(page); await page.waitForTimeout(800);
    const fb = (await q(`select count(*)::int n from class_feedback where instructor_id = 'INS-0042'`))[0].n;
    t.check(`profile @${width}: name, rank and id from the account`, /Bob Tan Sensei/.test(await page.locator('#insCard .pcard-name').innerText()) && /6th Dan/.test(await page.locator('#insCard .pcard-rank').innerText()) && /ASK-INS-0042/.test(await page.locator('#insCard').innerText()));
    t.check(`profile @${width}: rating count equals the db (${fb}) and 12 comments minus the empty ones are listed`, new RegExp(`\\b${fb}\\b`).test(await page.locator('#fbSummary .fb-avg').innerText()) && (await page.locator('#fbList .fb-item').count()) === (await q(`select count(*)::int n from class_feedback where instructor_id = 'INS-0042' and coalesce(note, '') <> ''`))[0].n);
    t.check(`profile @${width}: four stat tiles; the demo "grading panel" switch is gone`, (await page.locator('#insStats .stat').count()) === 4 && (await page.locator('#demoPanel').count()) === 0);
    t.check(`profile @${width}: no student names or ids on the page`, !/Lervyn|S-0\d\d|ASK-20\d\d-\d/.test(await page.locator('.ins-main').innerText()));
    if (width === 1280) await page.screenshot({ path: path.join(SCREENS, 'instructor-profile-1280.png') });
    clean(`profile @${width}`, problems);
    await ctx.close();
  }
  // ---------- the bell
  {
    const { ctx, page, problems } = await newPage(browser, base);
    await signInStaff(page, base, 'instructor', 'INS-0042');
    await page.goto(base + '/instructor_portal/index.html'); await settle(page); await page.waitForTimeout(800);
    await page.click('[data-notif]'); await page.waitForTimeout(500);
    const txt = await page.locator('#modal .notif').innerText();
    t.check('bell: low attendance line and feedback lines are built from the api data', /Low attendance/.test(txt) && (fx.usable ? /Grading shift is open/.test(txt) : true), txt);
    clean('bell', problems);
    await ctx.close();
  }
} catch (e) { console.error(e); t.check('suite ran without an exception', false, String(e && e.stack || e)); }
finally { await pg.end(); await browser.close(); await app.stop(); }
t.done();
