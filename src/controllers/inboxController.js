'use strict';
/* Admin inbox: questions Ben escalated. Both office roles may read and reply (the front desk answers the same questions). */
const { asyncHandler } = require('../utils/errors');
const adminInboxService = require('../services/adminInboxService');

module.exports = {
  list: asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ items: await adminInboxService.list(req.valid.query.status || null) });
  }),
  reply: asyncHandler(async (req, res) => {
    res.json(await adminInboxService.answer(req.user, req.valid.params.id, req.valid.body));
  })
};
