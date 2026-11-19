'use strict';
/* Ben's guardrails: only confirmed notes reach the model, every figure must be in the cited notes, personal questions are never
   answered, and anything Ben cannot back up goes to the admin inbox. Uses a fixture vault, a fake Ollama server and a stubbed
   inbox, so no database or Telegram is touched. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const config = require('../src/config');
const knowledge = require('../src/services/benKnowledgeService');
const adminInboxService = require('../src/services/adminInboxService');
const ben = require('../src/services/benService');

const note = (status, type, body) => `---\nname: x\nstatus: ${status}\ntype: ${type}\n---\n${body}\n`;
function makeVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ben-vault-'));
  const files = {
    'Trials and Guest Passes.md': note('confirmed', 'reference', 'Trial session: S$29. One class at HQ for first-time visitors.'),
    'Fees and Packages.md': note('confirmed', 'reference', '10-lesson pack: S$270. Unlimited: S$96 every 2 weeks. Concession 40%.'),
    'Grading.md': note('needs-confirmation', 'process', 'Sessions needed at 3rd Kyu: 36.'),
    'Old Timetable.md': note('sample', 'reference', 'Made-up Sunday class at 9 AM.'),
    'Draft FAQ.md': note('draft', 'faq', 'Draft answer about parking.'),
    'Ben Operating Rules.md': note('confirmed', 'rules', 'Internal rules about escalation.'),
    'Open Questions.md': note('confirmed', 'admin-todo', 'Internal conflict list.'),
    'Templates/Entry.md': note('confirmed', 'faq', 'Template text.')
  };
  for (const [f, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), text);
  }
  return dir;
}

/* a fake Ollama: replies with whatever the test sets, and records each request */
function fakeOllama() {
  const state = { reply: null, status: 200, requests: [] };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      state.requests.push(JSON.parse(body));
      res.writeHead(state.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { role: 'assistant', content: state.status === 200 ? JSON.stringify(state.reply) : 'error' } }));
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ state, server, url: `http://127.0.0.1:${server.address().port}` })));
}

test('only confirmed, needs-confirmation and approved knowledge notes are loaded', () => {
  const names = knowledge.loadNotes(makeVault()).map(n => n.name).sort();
  assert.deepEqual(names, ['Fees and Packages', 'Grading', 'Trials and Guest Passes']);
});

test('retrieve finds the matching note and ignores unrelated ones', () => {
  const notes = knowledge.loadNotes(makeVault());
  assert.equal(knowledge.retrieve('How much is the trial?', notes)[0].name, 'Trials and Guest Passes');
  assert.equal(knowledge.retrieve('Is there a Tuesday concert?', notes).length, 0);
});

test('synonyms match: price, cost and fees are the same word', () => {
  const notes = knowledge.loadNotes(makeVault());
  assert.equal(knowledge.retrieve('what is the price of packages', notes)[0].name, 'Fees and Packages');
});

test('personal, account, payment, ID and medical questions are blocked', () => {
  assert.ok(ben.blockedReason('Cancel my booking for Saturday'));
  assert.ok(ben.blockedReason('What is ASK-2025-1834 owing?'));
  assert.ok(ben.blockedReason('My card number is 4111 1111 1111 1111'));
  assert.ok(ben.blockedReason('I hurt my knee, can I still train?'));
  assert.equal(ben.blockedReason('How much is the trial class?'), null);
  assert.equal(ben.blockedReason('Do you have a changing room?'), null);
});

test('every figure in the answer must appear in the cited notes', () => {
  const cited = [{ body: '10-lesson pack: S$270. Valid 11 weeks. Unlimited: S$1,200.' }];
  assert.deepEqual(ben.ungrounded('It is S$270 for 10 lessons, valid 11 weeks.', cited), []);
  assert.deepEqual(ben.ungrounded('Unlimited is S$1200.', cited), []);
  assert.deepEqual(ben.ungrounded('It is S$300.', cited), ['300']);
});

test('checkAnswer rejects unanswerable, uncited, invented-source and invented-figure replies', () => {
  const retrieved = [{ name: 'Fees and Packages', body: '10-lesson pack: S$270.' }];
  assert.equal(ben.checkAnswer({ answerable: false, answer: '', sources: [] }, retrieved).ok, false);
  assert.equal(ben.checkAnswer({ answerable: true, answer: 'S$270.', sources: ['Made Up'] }, retrieved).ok, false);
  assert.equal(ben.checkAnswer({ answerable: true, answer: 'S$999.', sources: ['Fees and Packages'] }, retrieved).ok, false);
  assert.equal(ben.checkAnswer(null, retrieved).ok, false);
  const good = ben.checkAnswer({ answerable: true, answer: 'The 10-lesson pack is S$270.', sources: ['Fees and Packages'] }, retrieved);
  assert.equal(good.ok, true);
  assert.deepEqual(good.sources, ['Fees and Packages']);
});

test('answer() end to end with a fake model', async t => {
  const fake = await fakeOllama();
  const vault = makeVault();
  const escalated = [];
  const realEscalate = adminInboxService.escalate;
  const realVault = config.ben.vaultPath, realModel = config.ben.ollamaModel, realUrl = config.ben.ollamaUrl;
  const realKey = config.ben.groqApiKey;
  config.ben.groqApiKey = null; // these tests use the fake Ollama server, even when a Groq key is configured
  adminInboxService.escalate = async x => { escalated.push(x); return { id: 'INB-T' }; };
  config.ben.vaultPath = vault;
  config.ben.ollamaModel = 'test-model';
  config.ben.ollamaUrl = fake.url;
  t.after(() => {
    adminInboxService.escalate = realEscalate;
    config.ben.vaultPath = realVault; config.ben.ollamaModel = realModel; config.ben.ollamaUrl = realUrl;
    config.ben.groqApiKey = realKey;
    fake.server.close();
  });
  const reset = () => { escalated.length = 0; fake.state.requests.length = 0; };

  await t.test('a cited, grounded answer is sent', async () => {
    reset();
    fake.state.reply = { answerable: true, answer: 'The trial is S$29.', sources: ['Trials and Guest Passes'] };
    const r = await ben.answer({ question: 'How much is the trial?' });
    assert.equal(r.kind, 'answered');
    assert.match(r.text, /Source: Trials and Guest Passes/);
    assert.equal(escalated.length, 0);
    // the model saw only the retrieved confirmed note, never the sample or draft notes
    const sent = fake.state.requests[0];
    assert.equal(sent.format.type, 'object');
    assert.equal(sent.options.temperature, 0);
    assert.equal(sent.messages[0].role, 'system');
    const userMsg = sent.messages[1].content;
    assert.match(userMsg, /NOTE: Trials and Guest Passes/);
    assert.doesNotMatch(userMsg, /Made-up Sunday/);
    assert.doesNotMatch(userMsg, /Draft answer/);
  });

  await t.test('a figure not in the notes is escalated, not sent', async () => {
    reset();
    fake.state.reply = { answerable: true, answer: 'The trial is S$35.', sources: ['Trials and Guest Passes'] };
    const r = await ben.answer({ question: 'How much is the trial?' });
    assert.equal(r.kind, 'escalated');
    assert.equal(r.text, ben.HOLDING);
    assert.equal(escalated.length, 1);
    assert.match(escalated[0].reason, /Figure not in the cited notes: 35/);
    assert.deepEqual(escalated[0].checkedNotes, ['Trials and Guest Passes']);
  });

  await t.test('a question the notes do not answer is escalated', async () => {
    reset();
    fake.state.reply = { answerable: false, answer: '', sources: [] };
    const r = await ben.answer({ question: 'How much is the trial and do you have parking?' });
    assert.equal(r.kind, 'escalated');
    assert.equal(escalated.length, 1);
  });

  await t.test('a model failure is escalated', async () => {
    reset();
    fake.state.status = 500;
    const r = await ben.answer({ question: 'How much is the trial?' });
    fake.state.status = 200;
    assert.equal(r.kind, 'escalated');
    assert.match(escalated[0].reason, /did not respond/);
  });

  await t.test('a personal question never reaches the model', async () => {
    reset();
    const r = await ben.answer({ question: 'Cancel my booking for Saturday' });
    assert.equal(r.kind, 'escalated');
    assert.equal(fake.state.requests.length, 0);
    assert.match(escalated[0].reason, /personal account/);
  });

  await t.test('a note marked needs-confirmation adds the HQ caveat', async () => {
    reset();
    fake.state.reply = { answerable: true, answer: 'You need 36 sessions for 3rd Kyu.', sources: ['Grading'] };
    const r = await ben.answer({ question: 'How many sessions for 3rd Kyu grading?' });
    assert.equal(r.kind, 'answered');
    assert.match(r.text, /confirmed with HQ/);
  });

  await t.test('no model configured sends every question to the inbox', async () => {
    reset();
    config.ben.ollamaModel = null;
    const r = await ben.answer({ question: 'How much is the trial?' });
    config.ben.ollamaModel = 'test-model';
    assert.equal(r.kind, 'escalated');
    assert.equal(fake.state.requests.length, 0);
    assert.match(escalated[0].reason, /no language model/);
  });

  await t.test('empty or overlong questions are refused without escalation', async () => {
    reset();
    assert.equal((await ben.answer({ question: '   ' })).kind, 'invalid');
    assert.equal((await ben.answer({ question: 'x'.repeat(501) })).kind, 'invalid');
    assert.equal(escalated.length, 0);
  });
});
