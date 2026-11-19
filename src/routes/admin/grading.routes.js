'use strict';
/* Business Admin only: approve or reject grading applications, promote or decline a student the examiners passed */
const router = require('express').Router();
const ctrl = require('../../controllers/gradingAdminController');
const validate = require('../../middleware/validate');
const { requireAdminType } = require('../../middleware/roles');
const v = require('../../validators/admin');
const ba = requireAdminType('business');
router.get('/grading', ba, ctrl.overview);
router.post('/grading/applications/:id/decision', ba, validate({ params: v.idParam, body: v.gradingAppDecision }), ctrl.decideApplication);
router.post('/grading/candidates/:sessionId/:userId/promotion', ba, validate({ params: v.promotionParam, body: v.promotionBody }), ctrl.decidePromotion);
module.exports = router;
