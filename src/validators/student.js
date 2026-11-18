'use strict';
const { z } = require('zod');
const noNul = s => !s.includes('\u0000');
const text = (max, min = 0) => z.string().trim().min(min).max(max).refine(noNul, 'Invalid characters.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(s => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Not a real date.');
const METHOD = z.enum(['Stripe', 'PayNow', 'Visa']);
const id = z.string().trim().min(1).max(100).refine(noNul, 'Invalid characters.');

const idParam = z.strictObject({ id });
const lessonParam = z.strictObject({ lessonId: id });
const timetableQuery = z.strictObject({ weekStart: day.optional() });
const attendanceQuery = z.strictObject({ limit: z.coerce.number().int().min(1).max(200).default(50) });

const profilePatch = z.strictObject({
  contactNo: text(50, 6).regex(/^[0-9 +()-]+$/, 'Enter a valid phone number.').optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(255).optional(),
  emergencyContact: text(255).optional(), medicalNotes: text(1000).optional(),
  guardianName: text(255).optional(), guardianContact: text(50).optional()
});

const buyPackage = z.strictObject({ packageId: id, method: METHOD.default('Visa') });
const extension = z.strictObject({
  kind: z.enum(['MC', 'Compassion']), days: z.number().int().min(1).max(120), documentRef: text(255).optional()
});
const book = z.strictObject({ lessonId: id });
/* the payload printed in a dojo's QR code or written on its NFC tag (dojo.qr_token) */
const checkIn = z.strictObject({ qr: text(100, 1) });
const applyGrading = z.strictObject({ sessionId: id, bookFile: text(255, 1), method: METHOD.default('Visa') });
const feedback = z.strictObject({
  lessonId: id, rating: z.number().int().min(1).max(5).default(3), tags: z.array(text(60, 1)).max(6).default([]), note: text(1000).optional(), skipped: z.boolean().default(false)
});

module.exports = { idParam, lessonParam, timetableQuery, attendanceQuery, profilePatch, buyPackage, extension, book, checkIn, applyGrading, feedback };
