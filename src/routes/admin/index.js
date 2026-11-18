'use strict';
/* office area (/api/v1/admin): sign-in and the admin role are required on every route.
   Business-Admin-only routes add requireAdminType('business') (403 BUSINESS_ADMIN_ONLY). The front desk and Business Admin split follows
   ADMIN_PAGES in src/public/js/portal.js. */
const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const { requireRole } = require('../../middleware/roles');
router.use(authenticate, requireRole('admin'));
router.use(require('./desk.routes'));
router.use(require('./members.routes'));
router.use(require('./finance.routes'));
router.use(require('./business.routes'));
router.use(require('./grading.routes'));
router.use(require('./staff.routes'));
router.use(require('./audit.routes'));
module.exports = router;
