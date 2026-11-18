'use strict';
/* Keeps the caller's IP and user agent for the length of one request (AsyncLocalStorage), so the audit log can record them
   without every service having to receive `req`. */
const { AsyncLocalStorage } = require('node:async_hooks');

const store = new AsyncLocalStorage();

function requestContext(req, res, next) {
  store.run({ ip: req.ip || null, userAgent: String(req.get('user-agent') || '').slice(0, 255) || null }, next);
}

/* { ip, userAgent } of the current request, or null outside one (scripts, tests) */
const current = () => store.getStore() || null;

module.exports = { requestContext, current };
