'use strict';
/* CSRF mitigation together with the SameSite=Lax cookie: every mutating request must be application/json.
   A cross-site HTML form cannot send that content type, and a cross-site fetch with it triggers a CORS preflight that this API never grants. */
const { AppError } = require('../utils/errors');

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = function requireJson(req, res, next) {
  if (SAFE.has(req.method)) return next();
  if (!req.is('application/json')) return next(new AppError(415, 'JSON_REQUIRED', 'Send the request body as application/json.'));
  next();
};
