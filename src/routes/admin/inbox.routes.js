'use strict';
/* Admin inbox (office portal, both roles): questions Ben could not answer, and the staff reply. */
const router = require('express').Router();
const ctrl = require('../../controllers/inboxController');
const validate = require('../../middleware/validate');
const v = require('../../validators/admin');
router.get('/inbox', validate({ query: v.inboxQuery }), ctrl.list);
router.post('/inbox/:id/reply', validate({ params: v.idParam, body: v.inboxReply }), ctrl.reply);
module.exports = router;
