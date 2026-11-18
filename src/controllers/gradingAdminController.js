'use strict';
/* Business Admin: grading applications and promotions */
const { asyncHandler } = require('../utils/errors');
const gradingService = require('../services/gradingService');
const h = fn => asyncHandler(async (req, res) => res.json(await fn(req)));
module.exports = {
  overview: h(() => gradingService.adminOverview()),
  decideApplication: h(req => gradingService.decideApplication(req.user, req.valid.params.id, req.valid.body)),
  decidePromotion: h(req => gradingService.decidePromotion(req.user, req.valid.params.sessionId, req.valid.params.userId, req.valid.body))
};
