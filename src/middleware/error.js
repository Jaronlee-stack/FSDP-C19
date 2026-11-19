'use strict';
const config = require('../config');
const { AppError } = require('../utils/errors');

/* unknown /api/* route */
const apiNotFound = (req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such endpoint.' } });

const DB_MAP = {
  '23505': [409, 'CONFLICT', 'That record already exists.'],
  '23503': [409, 'REFERENCE', 'That record is linked to other data.'],
  '23514': [400, 'CONSTRAINT', 'The values do not satisfy a database rule.'],
  '23502': [400, 'CONSTRAINT', 'A required value is missing.'],
  '22P02': [400, 'BAD_REQUEST', 'A value has the wrong format.']
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = 500, code = 'INTERNAL', message = 'Something went wrong. Please try again.', details;

  if (err instanceof AppError) { status = err.status; code = err.code; message = err.message; details = err.details; }
  else if (err && err.type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'The request body is not valid JSON.'; }
  else if (err && err.type === 'entity.too.large') { status = 413; code = 'PAYLOAD_TOO_LARGE'; message = 'The request body is too large.'; }
  else if (err && DB_MAP[err.code]) { [status, code, message] = DB_MAP[err.code]; }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl.split('?')[0]}:`, config.isProd ? (err && err.message) : err);
  }
  const body = { error: { code, message } };
  if (details && status < 500) body.error.details = details;
  res.status(status).json(body);
}

module.exports = { apiNotFound, errorHandler };
