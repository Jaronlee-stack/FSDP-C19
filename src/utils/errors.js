'use strict';

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const badRequest = (message, code = 'BAD_REQUEST', details) => new AppError(400, code, message, details);
const unauthorized = (message = 'Please sign in.', code = 'UNAUTHENTICATED') => new AppError(401, code, message);
const forbidden = (message = 'You are not allowed to do that.', code = 'FORBIDDEN') => new AppError(403, code, message);
const notFound = (message = 'Not found.', code = 'NOT_FOUND') => new AppError(404, code, message);
const conflict = (message, code = 'CONFLICT') => new AppError(409, code, message);

/* wraps an async handler so rejections reach the error middleware (also safe on Express 4) */
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, asyncHandler };
