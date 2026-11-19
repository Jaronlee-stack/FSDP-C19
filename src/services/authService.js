'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const clock = require('../utils/clock');
const password = require('../utils/password');
const { AppError, unauthorized } = require('../utils/errors');
const { withTx } = require('../config/db');
const userModel = require('../models/userModel');
const { toSession, deactivatedReason } = require('./accountService');
const auditService = require('./auditService');

const INVALID = () => new AppError(401, 'INVALID_CREDENTIALS', 'Those details do not match an account. Check them and try again.');

/* verifies the password for one portal and returns the session. Failures are always the same generic 401 until the password
   is proven right; only then can the account state (deactivated) be revealed. */
async function login({ portal, identifier, password: plain }) {
  /* a failed attempt is logged without the typed identifier (people paste passwords into the ID box); the log never changes the response */
  const failed = (entityId, reason) => auditService.recordSafe(undefined, null, { action: 'auth.login_failed', entityType: entityId ? 'user' : null, entityId, summary: 'Failed sign-in attempt', details: { portal, reason } });
  const cred = await userModel.findCredentials(portal, identifier);
  if (!cred) { await password.dummyCompare(plain); await failed(null, 'unknown_account'); throw INVALID(); }
  const ok = await password.compare(plain, cred.password_hash);
  if (!ok) { await failed(cred.id, 'wrong_password'); throw INVALID(); }
  const row = await userModel.findAccount(cred.id);
  const session = toSession(row);
  if (!session || session.role !== portal) { await failed(cred.id, 'unknown_account'); throw INVALID(); }
  const why = deactivatedReason(row);
  if (why) { await failed(cred.id, 'deactivated'); throw new AppError(403, 'ACCOUNT_DEACTIVATED', why); }
  await userModel.touchLastLogin(cred.id, clock.now());
  await auditService.record(undefined, session, { action: 'auth.login', entityType: 'user', entityId: session.id, summary: 'Signed in', details: { portal } });
  return { session, token: issueToken(session) };
}

/* Changes the signed-in user's own password. Returns a fresh session and a new token (the old cookie dies with the change). */
async function changePassword(user, { currentPassword, newPassword }) {
  try {
    return await withTx(async tx => {
      const cred = await userModel.findCredentialsById(user.id, tx, true);
      if (!cred) throw unauthorized();
      if (!(await password.compare(currentPassword, cred.password_hash))) throw new AppError(400, 'CURRENT_PASSWORD_INCORRECT', 'Current password is incorrect.');
      const weak = password.checkStrength(newPassword, { avoid: [cred.email, String(cred.email).split('@')[0], user.id, user.memberNo] });
      if (weak) throw new AppError(400, 'WEAK_PASSWORD', weak);
      if (await password.compare(newPassword, cred.password_hash)) throw new AppError(400, 'PASSWORD_REUSED', 'Choose a password different from your current one.');
      /* the real clock, not the pinned APP_FAKE_TODAY one: this is compared with the JWT iat */
      await userModel.setPassword(user.id, await password.hash(newPassword), { mustChange: false, at: new Date() }, tx);
      await auditService.record(tx, user, { action: 'auth.password_changed', entityType: 'user', entityId: user.id, summary: 'Changed own password', details: { forced: !!user.mustChangePassword } });
      const session = toSession(await userModel.findAccount(user.id, tx));
      return { session, token: issueToken(session) };
    });
  } catch (e) {
    if (e instanceof AppError && e.code === 'CURRENT_PASSWORD_INCORRECT') {
      await auditService.recordSafe(undefined, user, { action: 'auth.password_change_failed', entityType: 'user', entityId: user.id, summary: 'Wrong current password on a password change', details: {} });
    }
    throw e;
  }
}

const issueToken = session => jwt.sign({ sub: session.id, role: session.role }, config.jwt.secret, { algorithm: 'HS256', expiresIn: config.jwt.expiresIn });
const verifyToken = token => jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

/* cookie lifetime in ms for the configured JWT_EXPIRES_IN ('8h', '30m', '7d' or plain seconds) */
function cookieMaxAgeMs() {
  const m = /^(\d+)\s*([smhd]?)$/.exec(String(config.jwt.expiresIn).trim());
  if (!m) return 8 * 3600 * 1000;
  return Number(m[1]) * ({ '': 1, s: 1, m: 60, h: 3600, d: 86400 }[m[2]]) * 1000;
}

module.exports = { login, changePassword, issueToken, verifyToken, cookieMaxAgeMs };
