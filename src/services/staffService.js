'use strict';
/* Staff accounts (Business Admin): create, change role, deactivate or reactivate, reset a password.
   A Business Admin cannot change or deactivate their own account (SELF_CHANGE_FORBIDDEN), and the last active Business Admin cannot be demoted or
   deactivated (LAST_BUSINESS_ADMIN). A temporary password is returned once, when it is made, and is never stored in plain text. */
const { withTx } = require('../config/db');
const clock = require('../utils/clock');
const { notFound, conflict, badRequest } = require('../utils/errors');
const staffModel = require('../models/staffModel');
const userModel = require('../models/userModel');
const password = require('../utils/password');
const auditService = require('./auditService');

const shape = (s, me) => ({ id: s.id, name: s.name, type: s.type, status: s.status, email: s.email, last: s.last_login_at || null, you: s.id === me });

async function list(user) {
  const rows = await staffModel.listAll();
  return { staff: rows.map(s => shape(s, user.id)), activeBusinessAdmins: rows.filter(s => s.type === 'business' && s.status === 'active').length };
}

async function create(user, { name, type, email, danGrade }) {
  return withTx(async tx => {
    if (await userModel.findByEmail(email, tx)) throw conflict('That email is already used by another account.', 'EMAIL_IN_USE');
    const id = await staffModel.nextId(type, tx);
    const temp = password.randomPassword();
    await userModel.insertUser({ id, role: type === 'instructor' ? 'instructor' : 'admin', email, passwordHash: await password.hash(temp), createdAt: clock.now(), mustChangePassword: true }, tx);
    if (type === 'instructor') await staffModel.insertInstructor({ id, name, dan: danGrade || 1 }, tx);
    else await staffModel.insertStaff({ id, name, type }, tx);
    await auditService.record(tx, user, { action: 'staff.created', entityType: 'staff', entityId: id, summary: `Created ${type} account ${id} for ${name}`, details: { type, danGrade: type === 'instructor' ? danGrade || 1 : null, emailSet: true } });
    return { staff: shape({ id, name, type, status: 'active', email, last_login_at: null }, user.id), tempPassword: temp };
  });
}

async function update(user, id, { type, status }) {
  return withTx(async tx => {
    await staffModel.lockAccount(id, tx);
    const active = await staffModel.lockActiveBusiness(tx);
    const target = await staffModel.getAny(id, tx);
    if (!target) throw notFound('That account does not exist.', 'STAFF_NOT_FOUND');
    const lastBusiness = target.type === 'business' && target.status === 'active' && active.length <= 1;
    if (id === user.id) {
      if (lastBusiness) throw conflict('You are the last active Business Admin, so your role and status cannot change.', 'LAST_BUSINESS_ADMIN');
      throw conflict('You cannot change your own role or deactivate your own account.', 'SELF_CHANGE_FORBIDDEN');
    }
    if (type !== undefined && type !== target.type) {
      if (target.type === 'instructor' || type === 'instructor') throw badRequest('An instructor account keeps its role. Create a new account for another role.', 'ROLE_FIXED');
      if (lastBusiness) throw conflict('This is the last active Business Admin, so the role cannot change.', 'LAST_BUSINESS_ADMIN');
      await staffModel.setType(id, type, tx);
      await auditService.record(tx, user, { action: 'staff.role_changed', entityType: 'staff', entityId: id, summary: `Changed ${target.name} (${id}) from ${target.type} to ${type}`, details: { before: target.type, after: type } });
    }
    if (status !== undefined && status !== target.status) {
      if (status === 'inactive' && lastBusiness) throw conflict('This is the last active Business Admin, so it cannot be deactivated.', 'LAST_BUSINESS_ADMIN');
      await staffModel.setStatus(id, target.type === 'instructor' ? 'instructor' : 'staff', status, tx);
      await auditService.record(tx, user, {
        action: status === 'inactive' ? 'staff.deactivated' : 'staff.reactivated', entityType: 'staff', entityId: id,
        summary: `${status === 'inactive' ? 'Deactivated' : 'Reactivated'} ${target.name} (${id})`, details: { before: target.status, after: status }
      });
    }
    const fresh = await staffModel.getAny(id, tx);
    return { staff: shape({ ...fresh, last_login_at: null }, user.id) };
  });
}

async function resetPassword(user, id) {
  return withTx(async tx => {
    const target = await staffModel.getAny(id, tx);
    if (!target) throw notFound('That account does not exist.', 'STAFF_NOT_FOUND');
    const temp = password.randomPassword();
    /* the real clock (not APP_FAKE_TODAY): password_changed_at is compared with the JWT iat, and it ends the target's current sessions */
    await userModel.setPassword(id, await password.hash(temp), { mustChange: true, at: new Date() }, tx);
    await auditService.record(tx, user, { action: 'staff.password_reset', entityType: 'staff', entityId: id, summary: `Reset the password of ${target.name} (${id})`, details: { mustChange: true } });
    return { id, tempPassword: temp };
  });
}
module.exports = { list, create, update, resetPassword };
