'use strict';
/* The service with the database stood in for: proves what it records, and what it must not record, for each kind of scan. */
const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const at = (h, m) => new Date(2026, 10, 19, h, m);   // 19 Nov 2026, local time
const LESSON = { lesson_id: 'LS-1900', class_type: 'Adults', session_date: '2026-11-19', start_time: '19:00', end_time: '20:00', instructor_name: 'Bob Tan Sensei' };
const DOJOS = { 'TOKEN-HQ': { id: 'hq', name: 'ASK Headquarters Dojo' }, 'TOKEN-BEDOK': { id: 'bedok', name: 'ActiveSG Bedok Dojo' } };

/* load checkinService with every dependency replaced by a fake, and a log of what was written */
function setup({ now = at(19, 5), homeDojo = 'hq', rows = [{ lesson_id: 'LS-1900', attendance_status: 'Booked', session_date: '2026-11-19', start_time: '19:00' }] } = {}) {
  const log = { marks: [], checkIns: [], venueRows: [], madeUp: [] };
  const fakes = {
    '../config/db': { withTx: fn => fn({}) },
    '../utils/clock': { now: () => now, ymd: () => '2026-11-19', at: (day, time) => at(+time.slice(0, 2), +time.slice(3)) },
    '../models/ids': { nextId: async () => 'CI-12' },
    '../models/dojoModel': { findByQrToken: async t => DOJOS[t] || null },
    '../models/studentModel': { getProfile: async () => ({ dojo_id: homeDojo }) },
    '../models/sessionModel': { getById: async () => LESSON },
    '../models/checkinModel': { bookingsAtDojoOn: async () => rows, venueClassesOn: async () => rows, addVenueAttendance: async (u, l, via) => { log.venueRows.push({ lesson: l, via }); }, useMakeup: async id => { log.madeUp.push(id); }, insert: async c => { log.checkIns.push(c); } },
    './attendanceService': { mark: async (tx, m) => { log.marks.push(m); return { changed: true }; } },
  };
  const orig = Module._load;
  Module._load = function (request, parent, ...rest) {
    if (parent && /checkinService\.js$/.test(parent.filename || '') && fakes[request]) return fakes[request];
    return orig.call(this, request, parent, ...rest);
  };
  const path = require.resolve('../src/services/checkinService');
  delete require.cache[path];
  try { return { service: require(path), log }; } finally { Module._load = orig; }
}

const user = { id: 'S-001' };

test('a good scan marks the student present through attendanceService, once, and logs the check-in', async () => {
  const { service, log } = setup();
  const r = await service.scan(user, 'TOKEN-HQ');
  assert.equal(r.status, 'marked');
  assert.equal(log.marks.length, 1);
  assert.equal(log.marks[0].status, 'Attended');
  assert.equal(log.marks[0].userId, 'S-001');
  assert.equal(log.marks[0].actor.role, 'student');
  assert.equal(log.checkIns.length, 1);
  assert.equal(log.checkIns[0].dojoId, 'hq');
  assert.equal(log.checkIns[0].lessonId, 'LS-1900');
});

test('the reply carries the class details the page shows', async () => {
  const { service } = setup();
  const r = await service.scan(user, 'TOKEN-HQ');
  assert.deepEqual(r.lesson, { type: 'Adults', date: '2026-11-19', start: '19:00', end: '20:00', instructor: 'Bob Tan Sensei', venue: 'ASK Headquarters Dojo' });
  assert.equal(r.redirect, '/student_portal/checkin.html?lesson=LS-1900');
  assert.ok(r.at);
});

test('scanning a class that is already marked reports it and writes nothing', async () => {
  const { service, log } = setup({ rows: [{ lesson_id: 'LS-1900', attendance_status: 'Attended', session_date: '2026-11-19', start_time: '19:00' }] });
  const r = await service.scan(user, 'TOKEN-HQ');
  assert.equal(r.status, 'already');
  assert.equal(r.at, null);
  assert.equal(log.marks.length, 0);
  assert.equal(log.checkIns.length, 0);
});

test('an HQ code for a student whose principal dojo is elsewhere: nothing written, sent to the landing page', async () => {
  const { service, log } = setup({ homeDojo: 'bedok' });
  const r = await service.scan(user, 'TOKEN-HQ');
  assert.deepEqual([r.status, r.reason, r.redirect], ['none', 'WRONG_DOJO', '/student_portal/index.html']);
  assert.equal(log.marks.length + log.checkIns.length, 0);
});

test('outside the 15 minutes: nothing written, sent to the landing page', async () => {
  const { service, log } = setup({ now: at(19, 30) });
  const r = await service.scan(user, 'TOKEN-HQ');
  assert.deepEqual([r.status, r.reason, r.redirect], ['none', 'OUTSIDE_WINDOW', '/student_portal/index.html']);
  assert.equal(log.marks.length + log.checkIns.length, 0);
});

test('no booking at that dojo today: nothing written', async () => {
  const { service, log } = setup({ rows: [] });
  const r = await service.scan(user, 'TOKEN-HQ');
  assert.equal(r.reason, 'NO_BOOKING');
  assert.equal(log.marks.length + log.checkIns.length, 0);
});

test('an unknown or made-up code: nothing written', async () => {
  const { service, log } = setup();
  const r = await service.scan(user, 'ASK-QR-MADE-UP');
  assert.deepEqual([r.status, r.reason], ['none', 'INVALID_CODE']);
  assert.equal(log.marks.length + log.checkIns.length, 0);
});

const venueRow = { lesson_id: 'LS-1900', attendance_status: null, session_date: '2026-11-19', start_time: '19:00', via: 'roster', makeup_id: null };

test('a venue scan by an enrolled student: attendance row written as roster, then marked present', async () => {
  const { service, log } = setup({ homeDojo: 'bedok', rows: [venueRow] });
  const r = await service.scan(user, 'TOKEN-BEDOK');
  assert.equal(r.status, 'marked');
  assert.deepEqual(log.venueRows, [{ lesson: 'LS-1900', via: 'roster' }]);
  assert.deepEqual(log.madeUp, []);
  assert.equal(log.marks.length, 1);
});

test('a venue make-up scan: row written as make-up, make-up marked used, then present', async () => {
  const { service, log } = setup({ homeDojo: 'bedok', rows: [{ ...venueRow, via: 'make-up', makeup_id: 'MU-7' }] });
  const r = await service.scan(user, 'TOKEN-BEDOK');
  assert.equal(r.status, 'marked');
  assert.deepEqual(log.venueRows, [{ lesson: 'LS-1900', via: 'make-up' }]);
  assert.deepEqual(log.madeUp, ['MU-7']);
});

test('a venue scan by a student whose principal dojo is elsewhere: nothing written', async () => {
  const { service, log } = setup({ homeDojo: 'hq', rows: [venueRow] });
  const r = await service.scan(user, 'TOKEN-BEDOK');
  assert.equal(r.reason, 'WRONG_DOJO');
  assert.equal(log.marks.length + log.venueRows.length, 0);
});
