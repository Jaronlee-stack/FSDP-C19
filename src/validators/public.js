'use strict';
const { z } = require('zod');
const { checkStrength } = require('../utils/password');
const noNul = s => !s.includes('\u0000');
const text = (max, min = 1) => z.string().trim().min(min, 'This field is required.').max(max).refine(noNul, 'Invalid characters.');
const optText = max => z.string().trim().max(max).refine(noNul, 'Invalid characters.').nullish().transform(v => v || null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine(s => !Number.isNaN(Date.parse(s + 'T00:00:00Z')), 'Not a real date.');
const email = z.string().trim().toLowerCase().email('Enter a valid email address.').max(255);
const phone = z.string().trim().min(6, 'Enter a valid phone number.').max(30).regex(/^[0-9 +()-]+$/, 'Enter a valid phone number.');

const sessionsQuery = z.strictObject({ date: day });

const trialBooking = z.strictObject({
  name: text(120), mobile: phone, email,
  passId: z.enum(['trial', 'single', 'day', 'week', 'private', 'oday', 'oweek', 'omonth']),
  overseas: z.boolean().default(false), who: z.enum(['Adult', 'Child']).default('Adult'),
  date: day, lessonId: z.string().trim().max(100).optional(), time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  waiverSigner: text(160)
});

/* password rules shared by the public and desk registration schemas (a refinement, so it is applied after .extend()) */
const passwordRules = (o, ctx) => {
  const bad = checkStrength(o.password, { avoid: [o.email, String(o.email || '').split('@')[0]] });
  if (bad) ctx.addIssue({ code: 'custom', path: ['password'], message: bad });
  if (o.password !== o.confirmPassword) ctx.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Passwords do not match.' });
};

const registrationBase = z.strictObject({
  password: z.string().min(1, 'Choose a password.').max(200), confirmPassword: z.string().min(1, 'Confirm your password.').max(200),
  name: text(120), dojoId: text(60), age: z.number().int().min(3).max(110), dob: day.optional(), gender: z.enum(['Male', 'Female']),
  nationality: optText(100), phone, email, emergencyContact: text(255), priorExperience: optText(255), previousMember: z.boolean().default(false),
  medical: optText(500), dogi: z.strictObject({ type: z.enum(['Cotton (Standard)', 'Heavyweight Cotton', 'Competition Grade']), size: z.enum(['000', '00', '0', '1', '2', '3', '4', '5', '6', '7']) }),
  packageId: text(60), signer: text(160), signatureProvided: z.boolean()
});

const registration = registrationBase.superRefine(passwordRules);

module.exports = { sessionsQuery, trialBooking, registration, registrationBase, passwordRules };
