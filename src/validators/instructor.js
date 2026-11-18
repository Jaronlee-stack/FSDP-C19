'use strict';
const { z } = require('zod');
const { EXAM_CRITERIA_KEYS } = require('../services/gradingRules');
const noNul = s => !s.includes('\u0000');
const text = (max, min = 0) => z.string().trim().min(min).max(max).refine(noNul, 'Invalid characters.');
const id = z.string().trim().min(1).max(100).refine(noNul, 'Invalid characters.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(s => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Not a real date.');

const lessonParam = z.strictObject({ lessonId: id });
const markParam = z.strictObject({ lessonId: id, userId: id });
const userParam = z.strictObject({ userId: id });
const sessionParam = z.strictObject({ id });
const candidateParam = z.strictObject({ id, userId: id });
const scheduleQuery = z.strictObject({ from: day, to: day });
const mark = z.strictObject({ status: z.enum(['Attended', 'No-Show', 'Booked']) });
const endClass = z.strictObject({ present: z.array(id).max(200).default([]), noShow: z.array(id).max(200).default([]) });
const remark = z.strictObject({ kind: z.enum(['class', 'student']), studentId: id.optional(), body: text(2000) });
const gradingNote = z.strictObject({ lessonId: id.optional(), body: text(2000) });
/* every criterion must be scored 0-3: { 'Omote-entry': 2, ... }. The server adds them up. */
const scores = z.strictObject(Object.fromEntries(EXAM_CRITERIA_KEYS.map(k => [k, z.number().int().min(0).max(3)])));
const result = z.strictObject({
  scores, well: text(1000, 1), toImprove: text(1000, 1),
  signature: z.union([z.literal(true), z.string().min(1).max(60000)])   // the examiner signed; the drawing itself is not stored
});
module.exports = { lessonParam, markParam, userParam, sessionParam, candidateParam, scheduleQuery, mark, endClass, remark, gradingNote, result };
