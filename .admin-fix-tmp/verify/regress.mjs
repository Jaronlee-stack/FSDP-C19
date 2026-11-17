// Regression: instructor and student portals still load with no console errors after the admin changes.
import { launch, newPage, signInAs, check, setFeat, finish } from './lib.mjs';
setFeat('REGRESS');
const env = await launch(), B = env.base;
try {
  {
    const { page, errors } = await newPage(env);
    await signInAs(page, B, 'instructor');
    for (const p of ['index', 'profile']) {
      await page.goto(`${B}/instructor_portal/${p}.html`);
      await page.waitForSelector('.solo-bar');
      check(`instructor-${p}-loads`, page.url().includes(`/${p}.html`) && errors.length === 0, errors.join(' | '));
    }
    check('instructor-no-admin-session', (await page.evaluate(() => sessionStorage.getItem('ask-admin'))) === null);
    await page.goto(`${B}/instructor_portal/grading.html`);
    await page.waitForURL(/instructor_portal\/index\.html\?nograding/);
    check('instructor-grading-still-gated', true);
    // an instructor opening an admin page is turned away
    await page.goto(`${B}/admin_portal/index.html`);
    await page.waitForURL(/signin\.html\?denied/);
    check('instructor-cannot-open-admin', true);
    check('instructor-no-console-errors', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }
  {
    const { page, errors } = await newPage(env);
    await signInAs(page, B, 'student');
    for (const p of ['index', 'book', 'packages', 'grading', 'payments', 'profile']) {
      await page.goto(`${B}/student_portal/${p}.html`);
      await page.waitForSelector('.rail nav a');
      check(`student-${p}-loads`, page.url().includes(`/${p}.html`), page.url());
    }
    await page.click('.topbar [data-notif]'); await page.waitForSelector('.notif');
    check('student-bell-opens', true);
    check('student-no-console-errors', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }
  {
    // student bell wording for an approved MC where only a lesson was returned (D10), and the usual wording otherwise
    const { page, errors } = await newPage(env);
    await signInAs(page, B, 'student');
    // change the live database in the page itself (a page that is unloading would save over a change made from outside)
    await page.evaluate(() => { MC_REQS.push({ id: 'T1', n: 'Lervyn Wong', no: 'ASK-2025-1834', passName: '25-lesson pack', kind: 'mc', days: 5, status: 'approved', extend: false, newExp: new Date().toISOString(), date: new Date().toISOString() }); });
    await page.click('.topbar [data-notif]'); await page.waitForSelector('.notif');
    const t = await page.evaluate(() => document.querySelector('.notif').innerText);
    check('student-bell-lesson-returned', /Lesson returned/.test(t) && !/Package extended/.test(t), t.replace(/\n/g, ' | '));
    await page.keyboard.press('Escape');
    await page.evaluate(() => { delete MC_REQS[0].extend; closeModal(); });
    await page.click('.topbar [data-notif]'); await page.waitForSelector('.notif');
    const t2 = await page.evaluate(() => document.querySelector('.notif').innerText);
    check('student-bell-package-extended-default', /Package extended/.test(t2), t2.replace(/\n/g, ' | '));
    check('student-bell-no-console-errors', errors.length === 0, errors.join(' | '));
    await page.context().close();
  }
} catch (e) {
  check('regress-script-ran-to-end', false, String(e && e.stack || e));
} finally { await env.close(); }
finish();
