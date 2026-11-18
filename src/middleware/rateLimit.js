'use strict';
const { rateLimit } = require('express-rate-limit');
const config = require('../config');

const handler = (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' } });

/* sign-in attempts per IP (LOGIN_RATE_MAX per LOGIN_RATE_WINDOW_MS) */
const loginLimiter = rateLimit({ windowMs: config.loginRate.windowMs, limit: config.loginRate.max, standardHeaders: 'draft-7', legacyHeaders: false, handler });

/* anonymous public submissions (trial bookings, registrations) */
const publicWriteLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, handler });

/* change-password attempts per account (CHANGE_PW_RATE_MAX failures per CHANGE_PW_RATE_WINDOW_MS). Mounted after authentication so
   req.user is set; successful changes are not counted. */
const changePasswordLimiter = rateLimit({
  windowMs: config.changePwRate.windowMs, limit: config.changePwRate.max, standardHeaders: 'draft-7', legacyHeaders: false, skipSuccessfulRequests: true,
  keyGenerator: req => (req.user && req.user.id) || 'anonymous', validate: { keyGeneratorIpFallback: false }, handler
});

module.exports = { loginLimiter, publicWriteLimiter, changePasswordLimiter };
