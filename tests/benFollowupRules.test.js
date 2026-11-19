'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../src/services/benFollowupRules');

test('a plain yes closes the loop', () => {
  for (const t of ['YES', 'yes', 'Yes!', 'yeah I will be back', "I'll be back next week", 'I am coming back on Saturday', 'coming back soon']) {
    assert.equal(rules.isAffirmative(t), true, t);
  }
});

test('a yes with a negation or a reason to stay away is not a yes', () => {
  for (const t of ['yes but I am moving away', "no, I won't be back", 'not coming back', 'yes, I am not sure', "can't come", 'maybe later']) {
    assert.equal(rules.isAffirmative(t), false, t);
  }
});

test('stop and unsubscribe are opt-outs', () => {
  assert.equal(rules.isOptOut('STOP'), true);
  assert.equal(rules.isOptOut('please unsubscribe me'), true);
  assert.equal(rules.isOptOut('yes'), false);
});

test('the outreach message uses the first name only and matches the kind', () => {
  const newcomer = rules.outreachText('newcomer', 'Lervyn Wong');
  assert.match(newcomer, /^Hi Lervyn,/);
  assert.match(newcomer, /first classes/);
  const declining = rules.outreachText('declining', 'Jamie Tan');
  assert.match(declining, /^Hi Jamie,/);
  assert.match(declining, /missed you/);
  assert.equal(rules.outreachText('declining', '').startsWith('Hi there,'), true);
});
