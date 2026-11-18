'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide, WINDOW_MIN } = require('../src/services/checkinRules');

const at = (h, m) => new Date(2026, 10, 19, h, m);          // 19 Nov 2026, local time
const class7pm = { lessonId: 'LS-1900', start: at(19, 0), attended: false };
const scan = (over = {}) => decide({ dojoId: 'hq', studentDojoId: 'hq', now: at(19, 0), bookings: [class7pm], ...over });

test('the window is 15 minutes', () => assert.equal(WINDOW_MIN, 15));

test('home dojo matches, booked, on time: marked', () => {
  assert.deepEqual(scan(), { action: 'marked', lessonId: 'LS-1900' });
});

test('the window is inclusive at both ends: 15 minutes before and 15 minutes after', () => {
  assert.equal(scan({ now: at(18, 45) }).action, 'marked');
  assert.equal(scan({ now: at(19, 15) }).action, 'marked');
});

test('one minute outside the window: nothing is marked', () => {
  for (const now of [at(18, 44), at(19, 16)]) {
    const r = scan({ now });
    assert.equal(r.action, 'none');
    assert.equal(r.reason, 'OUTSIDE_WINDOW');
  }
});

test('a late arrival at 7.10 pm still counts', () => {
  assert.equal(scan({ now: at(19, 10) }).action, 'marked');
});

test('principal dojo is not the dojo on the code: never marked', () => {
  const r = scan({ studentDojoId: 'bedok' });
  assert.deepEqual(r, { action: 'none', reason: 'WRONG_DOJO' });
});

test('a student with no principal dojo is never marked', () => {
  assert.equal(scan({ studentDojoId: null }).reason, 'WRONG_DOJO');
  assert.equal(scan({ studentDojoId: undefined }).reason, 'WRONG_DOJO');
});

test('no class booked at that dojo today: nothing is marked', () => {
  assert.deepEqual(scan({ bookings: [] }), { action: 'none', reason: 'NO_BOOKING' });
});

test('already marked for that class: reported as already, not marked again', () => {
  const r = scan({ bookings: [{ ...class7pm, attended: true }] });
  assert.deepEqual(r, { action: 'already', lessonId: 'LS-1900' });
});

test('two classes today: the one closest to the scan is used', () => {
  const class8pm = { lessonId: 'LS-2000', start: at(20, 0), attended: false };
  assert.equal(scan({ bookings: [class7pm, class8pm], now: at(19, 50) }).lessonId, 'LS-2000');
  assert.equal(scan({ bookings: [class7pm, class8pm], now: at(19, 5) }).lessonId, 'LS-1900');
});

test('after the 7 pm class is already marked, a scan for the 8 pm class marks that one', () => {
  const done7 = { ...class7pm, attended: true };
  const class8pm = { lessonId: 'LS-2000', start: at(20, 0), attended: false };
  assert.deepEqual(scan({ bookings: [done7, class8pm], now: at(19, 58) }), { action: 'marked', lessonId: 'LS-2000' });
});

test('the wrong-dojo check comes first, even when the time and booking are right', () => {
  assert.equal(scan({ dojoId: 'bedok', studentDojoId: 'hq' }).reason, 'WRONG_DOJO');
});
