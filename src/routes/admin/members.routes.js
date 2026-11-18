'use strict';
/* office members. The CSV export is Business Admin only; so are a belt, status or dojo change (checked in the service). */
const router = require('express').Router();
const ctrl = require('../../controllers/memberController');
const validate = require('../../middleware/validate');
const { requireAdminType } = require('../../middleware/roles');
const v = require('../../validators/admin');

router.get('/members', validate({ query: v.membersQuery }), ctrl.list);
router.get('/members/export.csv', requireAdminType('business'), ctrl.exportCsv);     // before /members/:memberNo
router.get('/members/:memberNo', validate({ params: v.memberParam }), ctrl.record);
router.patch('/members/:memberNo', validate({ params: v.memberParam, body: v.memberPatch }), ctrl.patch);
router.post('/members/:memberNo/messages', validate({ params: v.memberParam, body: v.message }), ctrl.message);
router.post('/members/:memberNo/contact-attempts', validate({ params: v.memberParam, body: v.contact }), ctrl.contact);
module.exports = router;
