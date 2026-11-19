'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/services/venueRosterRules');

const student = { user_id: 'S-001', member_no: 'ASK-2025-1834', full_name: 'Lervyn Wong' };
const ok = { memberNo: 'ASK-2025-1834', name: 'Lervyn Wong', classCode: 'BEDOK-SAT10-8561' };
const run = (row, over = {}) => rules.classify(row, { student, classId: 'CT-24', ...over });

test('a matching member, name and venue class is enrolled', () => {
  assert.deepEqual(run(ok), { action: 'enrol' });
});

test('name is compared after case, accents, punctuation and spacing are ignored', () => {
  assert.equal(run({ ...ok, name: '  lervyn   WONG. ' }).action, 'enrol');
  assert.equal(run({ ...ok, name: 'Lérvyn Wong' }).action, 'enrol');
});

test('a near-miss name is flagged, not matched', () => {
  const r = run({ ...ok, name: 'Lervin Wong' });
  assert.equal(r.issueType, 'Name mismatch');
});

test('no member number on the row: Missing information', () => {
  assert.equal(run({ ...ok, memberNo: '' }).issueType, 'Missing information');
});

test('a member number that no student has: Unknown member', () => {
  assert.equal(run(ok, { student: null }).issueType, 'Unknown member');
});

test('no name on the row: Missing information, not a silent match', () => {
  assert.equal(run({ ...ok, name: '' }).issueType, 'Missing information');
});

test('no class on the row: Missing information', () => {
  assert.equal(run({ ...ok, classCode: '' }).issueType, 'Missing information');
});

test('a class that is not one of this venue’s weekly classes: Unknown class', () => {
  assert.equal(run(ok, { classId: null }).issueType, 'Unknown class');
});

test('columnIndex finds headers regardless of case and spacing', () => {
  assert.equal(rules.columnIndex(['Name', ' Member No. ', 'Class'], 'member no.'), 1);
  assert.equal(rules.columnIndex(['Name'], 'Class'), -1);
});
