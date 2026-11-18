'use strict';
const { z } = require('zod');

/* PostgreSQL rejects NUL characters in text, so they are refused here instead of surfacing as a server error */
const noNul = s => !s.includes('\u0000');

const login = z.strictObject({
  portal: z.enum(['student', 'instructor', 'admin']),
  identifier: z.string().trim().min(1, 'Enter your ID or email.').max(255).refine(noNul, 'Invalid characters.'),
  password: z.string().min(1, 'Enter your password.').max(200)
});

const forgotPassword = z.strictObject({
  identifier: z.string().trim().min(1, 'Enter your ID or email.').max(255).refine(noNul, 'Invalid characters.')
});

const changePassword = z.strictObject({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: z.string().min(1, 'Choose a new password.').max(200),
  confirmPassword: z.string().max(200).optional()
}).refine(o => o.confirmPassword === undefined || o.confirmPassword === o.newPassword, { path: ['confirmPassword'], message: 'Passwords do not match.' });

module.exports = { login, forgotPassword, changePassword };
