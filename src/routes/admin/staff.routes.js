'use strict';
/* Business Admin only: staff and instructor accounts */
const router = require('express').Router();
const ctrl = require('../../controllers/staffController');
const validate = require('../../middleware/validate');
const { requireAdminType } = require('../../middleware/roles');
const v = require('../../validators/admin');
const ba = requireAdminType('business');
router.get('/staff', ba, ctrl.list);
router.post('/staff', ba, validate({ body: v.staffCreate }), ctrl.create);
router.patch('/staff/:id', ba, validate({ params: v.idParam, body: v.staffPatch }), ctrl.update);
router.post('/staff/:id/reset-password', ba, validate({ params: v.idParam }), ctrl.resetPassword);
module.exports = router;
