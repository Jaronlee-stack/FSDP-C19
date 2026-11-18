// Browser run (headless Edge): the Business-Admin-only Audit log page at 1280 and 390 (rows, filters, search, pager, expand, CSV),
// the front desk redirect + toast, and the nav item. Screens: .be-tmp/screens/audit-1280.png, audit-390.png.
import path from 'node:path';
import { spawnApp, resetDb, suite, pgConnect } from './lib.mjs';
import { launch, newPage, settle, signInStaff, storageDump, SCREENS } from './browser-lib.mjs';

const t = suite('browser-audit');
await resetDb();
const pg = await pgConnect();
const q = async (sql, p = []) => (await pg.query(sql, p)).rows;
// enough rows for more than one page (25 per page), spread over October 2026, one with markup in the summary and one with a formula
await q(`insert into audit_log (occurred_at, actor_user_id, actor_name, actor_role, actor_admin_type, action, entity_type, entity_id, summary, details, ip)
  select timestamptz '2026-10-01 09:00+08' + (g || ' hours')::interval, 'ADM-101', 'Daniel Ong', 'admin', 'frontdesk', 'payment.collected', 'payment', 'L-90' || lpad(g::text, 2, '0'),
         'Collected payment L-90' || lpad(g::text, 2, '0'), jsonb_build_object('amount', g, 'method', 'PayNow'), '10.0.0.' || g
    from generate_series(1, 30) g`);
await q(`insert into audit_log (occurred_at, actor_user_id, actor_name, actor_role, actor_admin_type, action, entity_type, entity_id, summary, details)
  values ('2026-10-20 10:00+08', 'ADM-001', 'Grace Lim', 'admin', 'business', 'policy.updated', 'policy', 'x', '<img src=x onerror=alert(1)> policy note', '{"note":"<script>alert(2)</script>"}')`);
const app = await spawnApp();
const base = app.base;
const browser = await launch();
const clean = (label, problems) => t.check(`${label}: zero console errors / failed requests`, problems.length === 0, problems.join(' | '));
const rowsN = page => page.locator('#auRows tr.au-row').count();
const waitRows = page => page.waitForTimeout(900);

try {
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });
    await signInStaff(page, base, 'admin', 'ADM-001');
    const links = await page.evaluate(() => [...document.querySelectorAll('.rail nav a')].map(a => a.textContent.trim()));
    const iStaff = links.findIndex(l => l.startsWith('Staff'));
    t.check(`BA @${width}: "Audit log" nav item right after Staff (Control group)`, iStaff >= 0 && links[iStaff + 1] && links[iStaff + 1].startsWith('Audit log'), JSON.stringify(links));
    await page.goto(base + '/admin_portal/audit.html'); await settle(page);
    await page.waitForSelector('#auRows tr.au-row', { timeout: 8000 });
    t.check(`audit @${width}: page title and the Export CSV button`, /Audit log/.test(await page.locator('.page-h h1').innerText()) && await page.locator('#auExport').isVisible());
    const n0 = await rowsN(page);
    t.check(`audit @${width}: the first page shows 25 rows`, n0 === 25, String(n0));
    const info = await page.locator('#auPageInfo').innerText();
    const total = (await q(`select count(*)::int n from audit_log`))[0].n;   // includes the sign-ins of this run
    t.check(`audit @${width}: pager says "Page 1 of ${Math.ceil(total / 25)} · ${total} events"`, info.includes(`Page 1 of ${Math.ceil(total / 25)}`) && info.includes(`${total} event`), info);
    await page.screenshot({ path: path.join(SCREENS, `audit-${width}.png`) });
    // markup in a summary is shown as text
    await page.fill('#au-q', 'policy note'); await waitRows(page);
    t.check(`audit @${width}: search narrows to the matching row`, (await rowsN(page)) === 1, String(await rowsN(page)));
    t.check(`audit @${width}: markup in a summary is escaped (shown as text, no element, no alert)`, /<img src=x/.test(await page.locator('#auRows').innerText()) && (await page.locator('#auRows img').count()) === 0 && dialogs === 0);
    await page.locator('#auRows tr.au-row').first().click(); await page.waitForTimeout(300);
    t.check(`audit @${width}: clicking a row expands its details`, (await page.locator('#auRows tr.au-detail').count()) === 1 && /<script>alert\(2\)<\/script>/.test(await page.locator('#auRows tr.au-detail').innerText()) && (await page.locator('#auRows tr.au-detail script').count()) === 0);
    await page.locator('#auRows tr.au-row').first().click(); await page.waitForTimeout(300);
    t.check(`audit @${width}: clicking again collapses it`, (await page.locator('#auRows tr.au-detail').count()) === 0);
    await page.fill('#au-q', ''); await waitRows(page);
    t.check(`audit @${width}: clearing the search brings back 25 rows`, (await rowsN(page)) === 25);
    // expand a seeded row and see the IP
    await page.locator('#auRows tr.au-row').first().click(); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SCREENS, `audit-expanded-${width}.png`) });
    await page.locator('#auRows tr.au-row').first().click(); await page.waitForTimeout(200);
    // filters come from the facets
    const opts = await page.evaluate(() => ({ a: [...$('#au-actor').options].map(o => o.value), g: [...$('#au-group').options].map(o => o.value), e: [...$('#au-type').options].map(o => o.value) }));
    t.check(`audit @${width}: actor / group / entity type selects are filled from the server`, opts.a.includes('ADM-101') && opts.g.includes('payment') && opts.e.includes('payment'), JSON.stringify(opts).slice(0, 200));
    const setSel = (id, v) => page.evaluate(([i, x]) => { const s = document.getElementById(i); s.value = x; s.dispatchEvent(new Event('change', { bubbles: true })); }, [id, v]);
    await setSel('au-group', 'payment'); await waitRows(page);
    const payN = (await q(`select count(*)::int n from audit_log where action like 'payment.%'`))[0].n;
    t.check(`audit @${width}: group = payment filters the rows (count from the server)`, (await page.locator('#auPageInfo').innerText()).includes(`${payN} event`) && (await page.locator('#auRows').innerText()).includes('payment.'), await page.locator('#auPageInfo').innerText());
    await setSel('au-actor', 'ADM-101'); await waitRows(page);
    const comb = (await q(`select count(*)::int n from audit_log where action like 'payment.%' and actor_user_id = 'ADM-101'`))[0].n;
    t.check(`audit @${width}: actor + group combine`, (await page.locator('#auPageInfo').innerText()).includes(`${comb} event`), await page.locator('#auPageInfo').innerText());
    await setSel('au-actor', ''); await setSel('au-group', ''); await waitRows(page);
    await setSel('au-type', 'staff'); await waitRows(page);
    const stN = (await q(`select count(*)::int n from audit_log where entity_type = 'staff'`))[0].n;
    t.check(`audit @${width}: entity type filter`, (await page.locator('#auPageInfo').innerText()).includes(`${stN} event`), await page.locator('#auPageInfo').innerText());
    await setSel('au-type', ''); await waitRows(page);
    // dates
    await page.fill('#au-from', '2026-10-01'); await page.fill('#au-to', '2026-10-31'); await page.locator('#au-to').dispatchEvent('change'); await waitRows(page);
    const octN = (await q(`select count(*)::int n from audit_log where occurred_at >= '2026-10-01T00:00:00+08:00' and occurred_at < '2026-11-01T00:00:00+08:00'`))[0].n;
    t.check(`audit @${width}: from/to dates filter (October: ${octN})`, (await page.locator('#auPageInfo').innerText()).includes(`${octN} event`), await page.locator('#auPageInfo').innerText());
    await page.fill('#au-from', '2026-11-06'); await page.fill('#au-to', '2026-01-01'); await page.locator('#au-to').dispatchEvent('change'); await page.waitForTimeout(500);
    t.check(`audit @${width}: reversed dates show a message instead of a request`, /From date/.test(await page.locator('#auRows').innerText()));
    await page.fill('#au-from', ''); await page.fill('#au-to', ''); await page.locator('#au-to').dispatchEvent('change'); await waitRows(page);
    // pager
    const firstPage = await page.locator('#auRows tr.au-row').first().innerText();
    await page.click('#auNext'); await waitRows(page);
    const totalNow = (await q(`select count(*)::int n from audit_log`))[0].n;
    t.check(`audit @${width}: Next shows page 2 with different rows`, /Page 2 of/.test(await page.locator('#auPageInfo').innerText()) && (await rowsN(page)) === Math.min(25, totalNow - 25) && (await page.locator('#auRows tr.au-row').first().innerText()) !== firstPage, `${await rowsN(page)} vs ${totalNow}`);
    await page.click('#auPrev'); await waitRows(page);
    t.check(`audit @${width}: Prev goes back to page 1`, /Page 1 of/.test(await page.locator('#auPageInfo').innerText()) && (await page.locator('#auPrev').isDisabled()));
    // no results
    await page.fill('#au-q', 'zzzz-nothing-matches'); await waitRows(page);
    t.check(`audit @${width}: an empty result shows the empty state`, (await rowsN(page)) === 0 && (await page.locator('#auRows').innerText()).trim().length > 0);
    await page.fill('#au-q', ''); await waitRows(page);
    // CSV with the current filter
    await setSel('au-group', 'policy'); await waitRows(page);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#auExport')]);
    const file = await dl.path();
    const fs = await import('node:fs');
    const csv = fs.readFileSync(file, 'utf8');
    const polN = (await q(`select count(*)::int n from audit_log where action like 'policy.%'`))[0].n;
    t.check(`audit @${width}: Export CSV downloads audit-log-<date>.csv with the current filter`, /^audit-log-.*\.csv$/.test(dl.suggestedFilename()) && csv.startsWith('"Time (SGT)"') && csv.trim().split(/\r\n/).length - 1 === polN, `${dl.suggestedFilename()} ${csv.trim().split(/\r\n/).length - 1} vs ${polN}`);
    t.check(`audit @${width}: the export itself is logged (audit.exported)`, (await q(`select count(*)::int n from audit_log where action = 'audit.exported' and actor_user_id = 'ADM-001'`))[0].n >= 1);
    await setSel('au-group', ''); await waitRows(page);
    t.check(`audit @${width}: no horizontal overflow`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width === 390) t.check('audit @390: rows render as stacked cards (table header hidden)', await page.evaluate(() => { const th = document.querySelector('#auTable thead, .au-table thead, table thead'); return !th || getComputedStyle(th).display === 'none' || th.getBoundingClientRect().height === 0; }));
    const s = await storageDump(page);
    t.check(`audit @${width}: nothing from the log in browser storage`, ![...s.local, ...s.session].some(k => /audit|ask-prototype|token/i.test(k)) && !/Collected payment|eyJ/.test(s.localValues + s.sessionValues));
    clean(`audit @${width}`, problems);
    await ctx.close();
  }

  // front desk: no nav item, redirect home with the toast, and the API refuses it
  for (const width of [1280, 390]) {
    const { ctx, page, problems } = await newPage(browser, base, { width });
    await signInStaff(page, base, 'admin', 'ADM-101');
    const links = await page.evaluate(() => [...document.querySelectorAll('.rail nav a')].map(a => a.textContent.trim()));
    t.check(`front desk @${width}: no Audit log nav item`, !links.some(l => /Audit/.test(l)), JSON.stringify(links));
    await page.goto(base + '/admin_portal/audit.html'); await settle(page); await page.waitForTimeout(800);
    t.check(`front desk @${width}: audit.html sends you to the admin home with "That page is for Business Admins"`, /admin_portal\/index\.html/.test(page.url()) && (await page.locator('.toast', { hasText: 'That page is for Business Admins' }).count()) > 0, page.url());
    t.check(`front desk @${width}: the audit rows never reached the page`, !(await page.content()).includes('Collected payment L-90'));
    clean(`front desk @${width}`, problems);   // checked before the deliberate 403 below
    const api = await page.evaluate(() => fetch('/api/v1/admin/audit').then(r => r.status));
    t.check(`front desk @${width}: GET /admin/audit from the browser -> 403`, api === 403);
    await ctx.close();
  }
} catch (e) { t.check('suite crashed: ' + e.message, false, e.stack); }
await pg.end();
await browser.close();
await app.stop();
t.done();
