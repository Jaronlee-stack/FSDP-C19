'use strict';
/* Cookie JWT authentication. The account and its role profile are re-read from the database on every request,
   so a deactivation or role change takes effect at once. The client never chooses its own role. */
const config = require('../config');
const { AppError, unauthorized } = require('../utils/errors');
const authService = require('../services/authService');
const userModel = require('../models/userModel');
const { toSession, deactivatedReason } = require('../services/accountService');

const COOKIE = 'ask_token';

const cookieOptions = () => ({ httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' });
const setAuthCookie = (res, token) => res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: authService.cookieMaxAgeMs() });
const clearAuthCookie = res => res.clearCookie(COOKIE, cookieOptions());

/* allowPasswordChange: true only for GET /auth/me and POST /auth/change-password. Everywhere else an account that still has to choose its own
   password (must_change_password) gets 403 PASSWORD_CHANGE_REQUIRED. */
function build({ allowPasswordChange }) {
  return async function authenticate(req, res, next) {
    try {
      const token = req.cookies && req.cookies[COOKIE];
      if (!token || typeof token !== 'string') throw unauthorized();
      let payload;
      try { payload = authService.verifyToken(token); } catch (_) { clearAuthCookie(res); throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED'); }
      const row = await userModel.findAccount(payload.sub);
      const session = toSession(row);
      if (!session) { clearAuthCookie(res); throw unauthorized(); }
      const why = deactivatedReason(row);
      if (why) { clearAuthCookie(res); throw new AppError(401, 'ACCOUNT_DEACTIVATED', why); }
      /* a token issued before the last password change or reset is dead */
      if (row.password_changed_at && payload.iat < Math.floor(new Date(row.password_changed_at).getTime() / 1000)) {
        clearAuthCookie(res);
        throw unauthorized('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
      }
      req.user = session;
      if (session.mustChangePassword && !allowPasswordChange) throw new AppError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must set a new password before you can continue.');
      next();
    } catch (e) { next(e); }
  };
}

const authenticate = build({ allowPasswordChange: false });
const authenticateAllowingPasswordChange = build({ allowPasswordChange: true });

module.exports = { authenticate, authenticateAllowingPasswordChange, setAuthCookie, clearAuthCookie, COOKIE };
