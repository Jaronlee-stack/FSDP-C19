'use strict';
/* Ben's knowledge: only the notes in the Ben Bot vault that are marked confirmed, needs-confirmation or approved, and are
   a knowledge type (not rules, not admin to-do lists, not the sample timetables). Nothing else can reach the model. */
const fs = require('node:fs');
const path = require('node:path');

const ANSWER_STATUSES = ['confirmed', 'needs-confirmation', 'approved'];
const ANSWER_TYPES = ['reference', 'process', 'policy', 'venue', 'faq'];

/* words that carry no meaning for matching */
const STOP = new Set(['the', 'and', 'for', 'you', 'are', 'can', 'what', 'when', 'how', 'does', 'with', 'this', 'that', 'have', 'from', 'your',
  'there', 'is', 'it', 'of', 'to', 'in', 'do', 'i', 'a', 'on', 'at', 'be', 'or', 'my', 'me', 'any', 'about', 'will', 'if', 'hi', 'please', 'want']);
/* different words people use for the same thing in the notes */
const SAME = { price: 'fee', prices: 'fee', cost: 'fee', costs: 'fee', fees: 'fee', pricing: 'fee', charge: 'fee', schedule: 'timetable',
  times: 'timetable', time: 'timetable', timetable: 'timetable', kyu: 'grading', dan: 'grading', belt: 'grading', belts: 'grading', grade: 'grading',
  grades: 'grading', grading: 'grading', classes: 'class', kids: 'children', kid: 'children', child: 'children', senior: 'discount', students: 'discount',
  student: 'discount', discounts: 'discount', parking: 'parking', park: 'parking' };

function tokens(text) {
  return (String(text).toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(t => t.length > 2 && !STOP.has(t))
    .map(t => SAME[t] || t);
}

/* reads the frontmatter (name, status, type, source) and the body of one note */
function parseNote(text, file) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const meta = {};
  let body = text;
  if (m) {
    body = m[2];
    for (const line of m[1].split(/\r?\n/)) {
      const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
      if (kv) meta[kv[1]] = kv[2].replace(/^"|"$/g, '').trim();
    }
  }
  return { name: path.basename(file, '.md'), status: meta.status || '', type: meta.type || '', body: body.trim() };
}

/* every note Ben may answer from. Re-read on each question so edits to the vault apply at once. */
function loadNotes(vaultPath) {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'Templates') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.md')) out.push(parseNote(fs.readFileSync(p, 'utf8'), p));
    }
  };
  if (fs.existsSync(vaultPath)) walk(vaultPath);
  return out.filter(n => ANSWER_STATUSES.includes(n.status) && ANSWER_TYPES.includes(n.type));
}

/* the notes that best match the question, by shared words (a title match counts more). Empty when nothing matches. */
function retrieve(question, notes, k = 4) {
  const q = [...new Set(tokens(question))];
  if (!q.length) return [];
  return notes
    .map(n => {
      const title = new Set(tokens(n.name));
      const body = new Set(tokens(n.body));
      const score = q.reduce((s, t) => s + (title.has(t) ? 3 : 0) + (body.has(t) ? 1 : 0), 0);
      return { note: n, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(x => x.note);
}

module.exports = { loadNotes, retrieve, parseNote, tokens, ANSWER_STATUSES, ANSWER_TYPES };
