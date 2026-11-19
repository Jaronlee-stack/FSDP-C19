'use strict';
/* Input schemas for the office (admin) API. Strict objects: a field that is not listed is refused. */
const { z } = require('zod');
const publicV = require('./public');
const { GROUPS } = require('../services/auditService');
const noNul = s => !s.includes('\u0000');
const text = (max, min = 1) => z.string().trim().min(min, 'This field is required.').max(max).refine(noNul, 'Invalid characters.');
const optText = max => z.string().trim().max(max).refine(noNul, 'Invalid characters.').transform(v => v || null);
const id = z.string().trim().min(1).max(100).refine(noNul, 'Invalid characters.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(s => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Not a real date.');
const phone = z.string().trim().min(6, 'Enter a valid phone number.').max(30).regex(/^[0-9 +()-]+$/, 'Enter a valid phone number.');
const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(255);
const atLeastOne = o => Object.values(o).some(v => v !== undefined);
const num = (min, max) => z.coerce.number().int().min(min).max(max);

/* ---------- desk ---------- */
const lessonParam = z.strictObject({ lessonId: id });
const lessonUserParam = z.strictObject({ lessonId: id, userId: id });
const rosterQuery = z.strictObject({ date: day.optional(), from: day.optional(), to: day.optional(), dojo: id.optional() })
  .refine(o => o.date || o.from, 'Choose a date.');
const book = z.strictObject({ memberNo: text(50), override: z.boolean().optional(), reason: text(300).optional() });
const cancelBooking = z.strictObject({ refund: z.boolean().optional(), reason: text(300).optional() });
const walkIn = z.union([
  z.strictObject({ guestId: id }),
  z.strictObject({ guest: z.strictObject({ name: text(120), mobile: phone, email: email.optional() }) })
]);
const waitlist = z.strictObject({ memberNo: text(50) });
const attendance = z.strictObject({ status: z.enum(['Attended', 'No-Show', 'Booked']), reason: text(300).optional() });
const submit = z.strictObject({ rows: z.array(z.strictObject({ userId: id, status: z.enum(['Attended', 'No-Show']) })).max(200).default([]) });

/* ---------- members ---------- */
const membersQuery = z.strictObject({
  q: z.string().trim().max(100).refine(noNul, 'Invalid characters.').optional(), status: z.enum(['Active', 'Inactive', 'Deactivated', 'Lapsed']).optional(),
  dojo: id.optional(), rank: id.optional(), source: z.enum(['ASK', 'External']).optional(),
  filter: z.enum(['all', 'active', 'lapsed', 'expiring', 'owing', 'new', 'guests']).optional(),
  sort: z.enum(['name', 'no', 'joined', 'rank', 'seen', 'hours']).optional(), page: num(1, 10000).optional(), pageSize: num(1, 200).optional()
});
const memberParam = z.strictObject({ memberNo: text(50) });
const memberPatch = z.strictObject({
  phone: phone.optional(), email: email.optional(), emergencyContact: optText(255).optional(), guardianName: optText(255).optional(), guardianContact: optText(50).optional(),
  medicalNotes: optText(2000).optional(), rankId: id.optional(), accountStatus: z.enum(['Active', 'Inactive', 'Deactivated', 'Lapsed']).optional(), dojoId: id.optional(), reason: text(300).optional()
}).refine(atLeastOne, 'Nothing to change.').refine(o => (o.accountStatus === undefined && o.dojoId === undefined) || !!o.reason, 'A reason is required for a status or dojo change.');
const message = z.strictObject({ body: text(240) });
const contact = z.strictObject({
  kind: z.enum(['newcomer', 'declining', 'renewal']).optional(), method: z.enum(['WhatsApp', 'Call', 'Email', 'SMS']), outcome: text(255),
  note: text(1000).optional(), nextDate: day.optional()
});

/* ---------- money ---------- */
const paymentsQuery = z.strictObject({
  q: z.string().trim().max(100).refine(noNul, 'Invalid characters.').optional(),
  status: z.enum(['Paid', 'Outstanding', 'Processing', 'Failed', 'Voided', 'Refunded']).optional(), from: day.optional(), to: day.optional()
});
const idParam = z.strictObject({ id });
const takePayment = z.strictObject({
  memberNo: text(50), item: z.string().trim().regex(/^(reg|dues|grading|dogi:[A-Za-z ()]{1,40}|pkg:[a-z0-9]{1,20})$/, 'Choose what the student is paying for.'),
  method: z.enum(['Stripe', 'PayNow', 'Visa']).optional(),
  amount: z.unknown().optional(), discount: z.unknown().optional(), kind: z.unknown().optional()   // accepted and ignored: the price is never read from the request
});
const voidPayment = z.strictObject({ reason: text(300), adjustTo: z.number().min(0).max(100000).optional() });
const reason = z.strictObject({ reason: text(500) });
const refundRequest = z.strictObject({ paymentId: id, reason: text(500) });
const decision = z.strictObject({ decision: z.enum(['approved', 'declined']) });
const lock = z.strictObject({ date: day.optional() });
const lockParam = z.strictObject({ date: day });
const equipmentQuery = z.strictObject({ q: z.string().trim().max(100).refine(noNul, 'Invalid characters.').optional() });
const handover = z.strictObject({ collectedBy: text(120) });

/* ---------- registrations, extensions, exceptions ---------- */
const checklist = z.strictObject({ ruleId: id, done: z.boolean() });
const activate = z.strictObject({ rankId: id.optional() });
const reject = z.strictObject({ note: text(500) });
const requestInfo = z.strictObject({ text: text(500) });
const deskRegistration = publicV.registrationBase.extend({ carryGrade: z.string().trim().regex(/^\d(st|nd|rd|th)\s(Kyu|Dan)$/i, 'Choose a grade.').optional() }).superRefine(publicV.passwordRules);
const mcDecision = z.strictObject({
  decision: z.enum(['approved', 'declined']), days: num(1, 365).optional(), returnLesson: z.boolean().optional(), extend: z.boolean().optional(), reason: text(300).optional()
});
const exception = z.strictObject({
  kind: z.enum(['registration', 'extension', 'access', 'mistake', 'refund']), subjectName: text(255).optional(), memberNo: text(50).optional(), detail: text(1000), mcId: id.optional()
}).refine(o => o.subjectName || o.memberNo || o.mcId, 'Say who this is about.');
const exceptionDecision = z.strictObject({ decision: z.enum(['approved', 'declined']), reason: text(300) });

/* ---------- follow-ups, notifications ---------- */
const followupCreate = z.strictObject({ memberNo: text(50).optional(), kind: z.enum(['newcomer', 'declining', 'renewal']), ownerId: id.nullable().optional(), dueDate: day });
const followupPatch = z.strictObject({ ownerId: id.nullable().optional(), dueDate: day.optional(), status: z.enum(['open', 'done']).optional() }).refine(atLeastOne, 'Nothing to change.');
const attempt = z.strictObject({ method: z.enum(['WhatsApp', 'Call', 'Email', 'SMS']), outcome: text(255), note: text(1000).optional(), nextDate: day.optional() });
const notify = z.strictObject({
  templateId: id.optional(), title: text(120).optional(), body: text(1000).optional(),
  audience: z.strictObject({ type: z.enum(['lesson', 'student', 'all', 'dojo', 'grade', 'lapsed', 'unpaid']), target: text(100).optional() })
});

/* ---------- Business Admin ---------- */
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM.');
const money = (min, max) => z.number().min(min).max(max).refine(v => Math.round(v * 100) / 100 === v, 'Use at most two decimals.');
const whole = (min, max) => z.number().int().min(min).max(max);
const CLASS_TYPES = ['Children Beginners', 'Children Juniors', 'Adults', 'Intermediate', 'Advanced', 'Ladies', 'Weapons', 'Mixed', 'SG50'];
const overviewQuery = z.strictObject({ period: z.enum(['month', '30', '90', '365']).default('month') });
const insightsQuery = z.strictObject({
  period: z.enum(['4w', '3m', '12m']).default('3m'), cmp: z.enum(['prev', 'year', 'none']).default('prev'), centre: id.default('all'), type: text(50).default('all'),
  slot: z.enum(['all', 'am', 'pm', 'eve']).default('all'), age: z.enum(['all', 'kids', 'adult']).default('all'), belt: z.enum(['all', 'beg', 'mid', 'adv']).default('all')
});
const revenueQuery = z.strictObject({ from: day.optional(), to: day.optional() });
const reportsQuery = z.strictObject({ from: day.optional(), to: day.optional(), centre: id.optional(), kind: z.enum(['attendance', 'progression', 'payments', 'followups']).optional() });
const reportParam = z.strictObject({ kind: z.enum(['attendance', 'progression', 'payments', 'followups']) });
const reportCsvQuery = z.strictObject({ from: day.optional(), to: day.optional(), centre: id.optional() });
const venueParam = z.strictObject({ dojoId: id });
const venueMappingBody = z.strictObject({ memberNoColumn: text(100), nameColumn: text(100), classColumn: text(100) });
const rosterImportBody = z.strictObject({ fileName: text(200), data: z.string().min(1).max(200000) });
const interventionBody = z.strictObject({ name: text(80), slot: text(40), before: whole(0, 9999), after: whole(0, 9999), decision: z.enum(['continue', 'adjust', 'stop']) });
const interventionPatch = z.strictObject({ decision: z.enum(['continue', 'adjust', 'stop']) });
const policiesQuery = z.strictObject({ declineDays: num(1, 90).optional() });
const policiesPatch = z.strictObject({
  registration_fee: money(0, 5000).optional(), annual_dues: money(0, 5000).optional(), grading_late_fee: money(0, 5000).optional(),
  discount_senior_age: whole(40, 100).optional(), discount_senior_pct: whole(0, 100).optional(), discount_student_from_age: whole(3, 60).optional(),
  discount_student_to_age: whole(3, 60).optional(), discount_student_pct: whole(0, 100).optional(),
  booking_ahead_months: whole(1, 6).optional(), booking_min_days: whole(0, 14).optional(), cancel_hours: whole(0, 72).optional(), max_packages: whole(1, 5).optional(),
  follow_decline_days: whole(1, 90).optional(), follow_renewal_days: whole(1, 90).optional(), compassion_days: whole(1, 60).optional()
}).refine(atLeastOne, 'Nothing to change.');
const packagePatch = z.strictObject({ price: money(0, 5000).optional(), isActive: z.boolean().optional() }).refine(atLeastOne, 'Nothing to change.');
const rulePatch = z.strictObject({ enabled: z.boolean() });
const templateBody = z.strictObject({ name: text(60), text: text(240) });
const templatePatch = z.strictObject({ name: text(60).optional(), text: text(240).optional() }).refine(atLeastOne, 'Nothing to change.');
const staffCreate = z.strictObject({ name: text(60, 2), type: z.enum(['business', 'frontdesk', 'instructor']), email, danGrade: whole(1, 9).optional() });
const staffPatch = z.strictObject({ type: z.enum(['business', 'frontdesk', 'instructor']).optional(), status: z.enum(['active', 'inactive']).optional() }).refine(atLeastOne, 'Nothing to change.');
const timetableQuery = z.strictObject({ dojo: id.optional() });
const timetableBody = z.strictObject({
  dojoId: id, weekday: whole(0, 6), start: hhmm, end: hhmm.optional(), mat: z.enum(['Mat A', 'Mat B']), type: z.enum(CLASS_TYPES), instructorId: id,
  capacity: whole(1, 200), onlineBookable: z.boolean().optional()
});
const closureBody = z.strictObject({ dojoId: id, from: day, to: day.optional(), note: text(200).optional() });
const closurePreviewQuery = z.strictObject({ dojoId: id.optional(), from: day.optional(), to: day.optional(), lessonId: id.optional() })
  .refine(o => o.lessonId || (o.dojoId && o.from), 'Choose a class, or a dojo and a first day.');
const classCancel = z.strictObject({ note: text(200).optional() });
const importsQuery = z.strictObject({ status: z.enum(['open', 'fixed', 'dismissed']).optional() });
const importDecision = z.strictObject({ status: z.enum(['fixed', 'dismissed']), memberNo: text(50).optional() });
const gradingAppDecision = z.strictObject({ decision: z.enum(['approved', 'rejected']), sessionId: id.optional(), note: text(500).optional() })
  .refine(o => o.decision !== 'rejected' || !!o.note, 'Say why the application is rejected.');
const promotionParam = z.strictObject({ sessionId: id, userId: id });
const promotionBody = z.strictObject({ decision: z.enum(['promote', 'decline']) });
const audienceQuery = z.strictObject({ type: z.enum(['lesson', 'student', 'all', 'dojo', 'grade', 'lapsed', 'unpaid']), target: text(100).optional() });
/* audit log (Business Admin) */
const auditQuery = z.strictObject({
  from: day.optional(), to: day.optional(), actorId: id.optional(), group: z.enum(GROUPS).optional(), action: z.string().regex(/^[a-z_]+\.[a-z_]+$/, 'Use group.verb.').max(60).optional(),
  entityType: id.optional(), entityId: id.optional(), q: z.string().trim().max(100).refine(noNul, 'Invalid characters.').optional(), page: num(1, 100000).optional(), pageSize: num(1, 100).optional()
}).refine(o => !o.from || !o.to || o.from <= o.to, 'The start date must not be after the end date.');
const auditExportQuery = z.strictObject({
  from: day.optional(), to: day.optional(), actorId: id.optional(), group: z.enum(GROUPS).optional(), action: z.string().regex(/^[a-z_]+\.[a-z_]+$/, 'Use group.verb.').max(60).optional(),
  entityType: id.optional(), entityId: id.optional(), q: z.string().trim().max(100).refine(noNul, 'Invalid characters.').optional()
}).refine(o => !o.from || !o.to || o.from <= o.to, 'The start date must not be after the end date.');
module.exports = {
  auditQuery, auditExportQuery,
  overviewQuery, insightsQuery, revenueQuery, reportsQuery, reportParam, reportCsvQuery, venueParam, venueMappingBody, rosterImportBody, interventionBody, interventionPatch, policiesQuery, policiesPatch, packagePatch, rulePatch,
  templateBody, templatePatch, staffCreate, staffPatch, timetableQuery, timetableBody, closureBody, closurePreviewQuery, classCancel, importsQuery, importDecision,
  gradingAppDecision, promotionParam, promotionBody, audienceQuery,
  lessonParam, lessonUserParam, rosterQuery, book, cancelBooking, walkIn, waitlist, attendance, submit,
  membersQuery, memberParam, memberPatch, message, contact,
  paymentsQuery, idParam, takePayment, voidPayment, reason, refundRequest, decision, lock, lockParam, equipmentQuery, handover,
  checklist, activate, reject, requestInfo, deskRegistration, mcDecision, exception, exceptionDecision,
  followupCreate, followupPatch, attempt, notify
};
