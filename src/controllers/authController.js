'use strict';
const { asyncHandler } = require('../utils/errors');
const authService = require('../services/authService');
const { setAuthCookie, clearAuthCookie } = require('../middleware/auth');

const login = asyncHandler(async (req, res) => {
  const { session, token } = await authService.login(req.valid.body);
  setAuthCookie(res, token);
  res.json({ user: session });
});

const logout = (req, res) => { clearAuthCookie(res); res.json({ ok: true }); };

const me = (req, res) => res.json(req.user);

const changePassword = asyncHandler(async (req, res) => {
  const { session, token } = await authService.changePassword(req.user, req.valid.body);
  setAuthCookie(res, token);
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, user: session });
});

/* always 202 and never says whether the account exists. No email is sent in this project (mock). */
const forgotPassword = (req, res) => res.status(202).json({ ok: true });

module.exports = { login, logout, me, changePassword, forgotPassword };
