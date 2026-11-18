'use strict';
/* anonymous endpoints: reference data and the two public forms (rate limited) */
const router = require('express').Router();
const ctrl = require('../controllers/publicController');
const validate = require('../middleware/validate');
const { publicWriteLimiter } = require('../middleware/rateLimit');
const v = require('../validators/public');

router.get('/dojos', ctrl.dojos);
router.get('/classes', ctrl.classes);
router.get('/packages', ctrl.packages);
router.get('/sessions', validate({ query: v.sessionsQuery }), ctrl.sessions);
router.post('/trial-bookings', publicWriteLimiter, validate({ body: v.trialBooking }), ctrl.trialBooking);
router.post('/registrations', publicWriteLimiter, validate({ body: v.registration }), ctrl.register);
module.exports = router;
