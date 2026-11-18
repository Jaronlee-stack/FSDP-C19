/* =====================================================================
   AIKIDO SHINJU-KAI — api.js  (loaded right after core.js on every page)
   The API client and the boot loader.
   1. loads the public reference data (GET /reference) and, on portal pages, the signed-in account (GET /auth/me)
   2. loads data.js, then fills the fixed constants (DOJOS, PKG, CLASSES, ...) in place from the server
   3. loads the rest of the page's scripts (the data-then list on this script tag) in order
   Nothing is stored in the browser: no localStorage / sessionStorage for data or sign-in.
   ===================================================================== */
'use strict';

class ApiError extends Error {
  constructor(status, code, message, details) { super(message); this.name = 'ApiError'; this.status = status; this.code = code; this.details = details; }
}

const ASK = {
  API: '/api/v1',
  skewMs: 0,          // server clock minus browser clock, so NOW() follows the server
  me: null,           // GET /auth/me (null when signed out, or on a public page)
  ref: null,          // GET /reference
  panels: [],         // instructors: GET /instructor/grading -> panels (examiner windows), read by portal.js
  summary: null,      // office staff: GET /admin/summary -> the counts behind the sidebar badges and the bell (see admin-data-desk.js ASK.refreshSummary)
  load: {},           // per-portal data modules add ASK.load.<name>() (GET, then fill the DB slices in place)
  act: {}             // ... and ASK.act.<name>() (write, then reload the affected slice)
};

/* ---------- date helpers: the API sends ISO strings, the page code uses Date objects ---------- */
ASK.d = s => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };   // 'YYYY-MM-DD' -> local midnight
ASK.ts = s => (s ? new Date(s) : null);                                                                                                // ISO timestamp -> Date
ASK.iso = d => isoDate(new Date(d));                                                                                                    // Date -> 'YYYY-MM-DD'
ASK.fill = (target, items) => { target.length = 0; target.push(...items); return target; };                                          // replace the contents of an array IN PLACE (aliases keep working)
ASK.errToast = e => toast(e && e.message ? e.message : 'Something went wrong. Please try again.', 'bad');

/* ---------- fetch wrapper ---------- */
ASK.toLogin = () => {
  const p = document.body.dataset.portal;
  if (!p) return;
  location.replace(url(p === 'student' ? 'student_portal/login.html' : 'admin_portal/signin.html?expired'));
};

/* an account that must change its password gets 403 PASSWORD_CHANGE_REQUIRED from every other call: reload, and the boot below shows the locked dialog */
ASK.forcePassword = () => { if (document.body.dataset.portal && !ASK.forcing) { ASK.forcing = true; location.reload(); } };

ASK.api = async (method, path, body, opts = {}) => {
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (method !== 'GET' && method !== 'HEAD') { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(body === undefined ? {} : body); }
  let res;
  try { res = await fetch(ASK.API + path, init); } catch (_) { throw new ApiError(0, 'NETWORK', 'Cannot reach the server. Check your connection and try again.'); }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { /* not JSON */ }
  if (!res.ok) {
    const er = (data && data.error) || {};
    const err = new ApiError(res.status, er.code || 'ERROR', er.message || 'Something went wrong. Please try again.', er.details);
    if (res.status === 401 && !opts.noRedirect) ASK.toLogin();
    if (res.status === 403 && err.code === 'PASSWORD_CHANGE_REQUIRED') ASK.forcePassword();
    throw err;
  }
  return data;
};
ASK.get = (path, opts) => ASK.api('GET', path, undefined, opts);
ASK.post = (path, body, opts) => ASK.api('POST', path, body, opts);
ASK.put = (path, body, opts) => ASK.api('PUT', path, body, opts);
ASK.patch = (path, body, opts) => ASK.api('PATCH', path, body, opts);
ASK.del = (path, body, opts) => ASK.api('DELETE', path, body, opts);

/* download a file the API generates (e.g. CSV). The server decides the file name. */
ASK.csv = async (path, fallbackName = 'export.csv') => {
  const res = await fetch(ASK.API + path, { credentials: 'same-origin' });
  if (!res.ok) { let er = {}; try { er = (await res.json()).error || {}; } catch (_) { /* not JSON */ } throw new ApiError(res.status, er.code || 'ERROR', er.message || 'Could not download the file.'); }
  const name = (/filename="?([^";]+)"?/.exec(res.headers.get('Content-Disposition') || '') || [])[1] || fallbackName;
  saveBlob(name, await res.blob());
  toast(`${name} downloaded`);
};

/* ---------- reference data -> the constants in data.js (filled in place: other files hold references to these arrays/objects) ---------- */
ASK.applyReference = ref => {
  ASK.fill(DOJOS, ref.dojos.map(d => (d.status && d.status !== 'Open' ? { id: d.id, name: d.name, short: d.short, code: d.code, region: d.region, addr: d.addr, status: d.status } : { id: d.id, name: d.name, short: d.short, code: d.code, region: d.region, addr: d.addr })));

  const pack = p => { const o = { ...p }; Object.keys(o).forEach(k => { if (o[k] === null || o[k] === undefined) delete o[k]; }); o.lessons = p.lessons === null ? Infinity : p.lessons; return o; };
  ASK.fill(PKG.adult, ref.packages.adult.map(pack));
  ASK.fill(PKG.kids, ref.packages.kids.map(pack));

  /* weekly timetables. `booked` is not part of a template: keep the prototype figure for pages that still show it. */
  const keep = new Map([...CLASSES, ...OTHER_DOJO_CLASSES].map(c => [`${c.dojo}|${c.day}|${c.time}`, c.booked]));
  const row = t => ({ id: t.id, code: t.code, dojo: t.dojo, day: t.day, time: t.time, end: t.end, mat: t.mat, type: t.type, ins: t.ins, cap: t.cap, booked: keep.get(`${t.dojo}|${t.day}|${t.time}`) || 0, ...(t.kids ? { kids: true } : {}), online: t.online });
  ASK.fill(CLASSES, ref.timetable.hq.map(row));
  ASK.fill(OTHER_DOJO_CLASSES, ref.timetable.other.map(row));

  ASK.fill(INSTRUCTORS, ref.instructors.map(i => (i.chief ? [i.name, i.dan, i.photo, true] : [i.name, i.dan, i.photo])));
  ASK.fill(BELTS, ref.belts.map(b => ({ g: b.g, c: b.c, id: b.id, order: b.order, fee: b.fee })));
  Object.keys(GRADING_FEE).forEach(k => delete GRADING_FEE[k]);
  ref.belts.forEach(b => { GRADING_FEE[b.g] = b.fee; });
};

/* public policy values -> DB.policies (called by store.js once DB exists). Prices come from the server, never from this file. */
ASK.applyPolicies = pol => {
  const r = ASK.ref && ASK.ref.policies; if (!r || !pol) return;
  pol.registration = r.registration; pol.annualDues = r.annualDues; pol.discounts = r.discounts; pol.booking = { ...r.booking };
  pol.compassionDays = r.compassionDays; pol.lateFee = r.lateFee;
  pol.packages = [...PKG.adult, ...PKG.kids].map(p => ({ id: p.id, name: p.name, amt: p.amt }));
};

/* the signed-in student -> the ME constant the student pages read */
ASK.applyMe = me => {
  if (!me || me.role !== 'student') return;
  Object.assign(ME, { name: me.name, no: me.memberNo, grade: me.rank, dojo: me.dojoId, gender: me.gender, age: me.age, group: me.group });
};

/* ---------- boot ---------- */
(function () {
  const self = document.currentScript;
  const dir = self.src.slice(0, self.src.lastIndexOf('/') + 1);
  const then = (self.dataset.then || '').split(',').map(s => s.trim()).filter(Boolean);
  const loadScript = src => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = false;   // dynamically added scripts run in the order they were added
    s.onload = resolve; s.onerror = () => reject(new Error('Could not load ' + src));
    document.body.appendChild(s);
  });
  const bootFailed = e => {
    console.error('[boot]', e);
    document.body.classList.add('ok');
    const box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'padding:48px 24px;text-align:center;font:16px system-ui,sans-serif;color:#16213B';
    box.textContent = 'This page could not load its data. Please refresh, or try again in a moment.';
    document.body.prepend(box);
  };

  ASK.ready = (async () => {
    const portal = document.body.dataset.portal || null;
    const [ref, me] = await Promise.all([
      ASK.get('/reference', { noRedirect: true }),
      portal ? ASK.get('/auth/me', { noRedirect: true }).catch(e => { if (e.status === 401) return null; throw e; }) : null
    ]);
    ASK.ref = ref; ASK.me = me;
    TODAY = ASK.d(ref.today);
    ASK.skewMs = Date.parse(ref.now) - Date.now();
    /* forced change: only the locked password dialog, no data and no page scripts (the server refuses every other call anyway) */
    if (me && me.mustChangePassword) {
      await loadScript(dir + 'account.js');
      document.body.classList.add('ok', 'forced');
      ASK.openChangePassword({ forced: true });
      coreReady();
      return;
    }
    await loadScript(dir + 'data.js');
    ASK.applyReference(ref);
    ASK.applyMe(me);
    /* an instructor's grading panels (today and later) with their windows: portal.js needs them before the page runs, to show or hide Grading */
    if (me && me.role === 'instructor') ASK.panels = await ASK.get('/instructor/grading', { noRedirect: true }).then(r => r.panels).catch(() => []);
    /* office staff: the badge counts are read when portal.js builds the sidebar, so they are loaded first */
    if (me && me.role === 'admin') ASK.summary = await ASK.get('/admin/summary', { noRedirect: true }).catch(() => null);
    if (me) await loadScript(dir + 'account.js');   // the change-password dialog, for any signed-in portal page
    await Promise.all(then.map(loadScript));
    coreReady();
  })();
  ASK.ready.catch(bootFailed);
})();
