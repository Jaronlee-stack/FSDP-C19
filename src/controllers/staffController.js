'use strict';
/* Business Admin: staff accounts. A temporary password is in the response of create and reset only, once. */
const { asyncHandler } = require('../utils/errors');
const staffService = require('../services/staffService');
const noStore = res => res.set('Cache-Control', 'no-store');
const h = fn => asyncHandler(async (req, res) => { noStore(res); res.json(await fn(req)); });
module.exports = {
  list: h(req => staffService.list(req.user)),
  create: asyncHandler(async (req, res) => { noStore(res); res.status(201).json(await staffService.create(req.user, req.valid.body)); }),
  update: h(req => staffService.update(req.user, req.valid.params.id, req.valid.body)),
  resetPassword: h(req => staffService.resetPassword(req.user, req.valid.params.id))
};
