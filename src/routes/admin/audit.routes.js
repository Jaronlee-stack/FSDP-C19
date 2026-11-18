'use strict';
/* Business Admin only: audit log */
const router = require('express').Router();
const ctrl = require('../../controllers/auditController');
const validate = require('../../middleware/validate');
const { requireAdminType } = require('../../middleware/roles');
const v = require('../../validators/admin');
const ba = requireAdminType('business');
router.get('/audit', ba, validate({ query: v.auditQuery }), ctrl.list);
router.get('/audit/export.csv', ba, validate({ query: v.auditExportQuery }), ctrl.exportCsv);
module.exports = router;
