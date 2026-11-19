'use strict';
const { forbidden } = require('../utils/errors');

/* the signed-in account must have one of these roles (student, guest, instructor, admin) */
const requireRole = (...roles) => (req, res, next) =>
  req.user && roles.includes(req.user.role) ? next() : next(forbidden('This area is not available to your account.', 'WRONG_ROLE'));

/* office staff only: 'business' (Business Admin) or 'frontdesk'. Use after requireRole('admin'). */
const requireAdminType = (...types) => (req, res, next) =>
  req.user && req.user.role === 'admin' && types.includes(req.user.adminType)
    ? next()
    : next(forbidden('Only a Business Admin can do this.', 'BUSINESS_ADMIN_ONLY'));

module.exports = { requireRole, requireAdminType };
