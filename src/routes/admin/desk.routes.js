'use strict';
/* office desk: today, rosters, guests, follow-ups, notifications */
const router = require('express').Router();
const ctrl = require('../../controllers/deskController');
const validate = require('../../middleware/validate');
const { requireAdminType } = require('../../middleware/roles');
const v = require('../../validators/admin');
const ba = requireAdminType('business');

router.get('/summary', ctrl.summary);
router.get('/today', ctrl.today);
router.get('/rosters', validate({ query: v.rosterQuery }), ctrl.rosters);
router.get('/rosters/:lessonId', validate({ params: v.lessonParam }), ctrl.roster);
router.post('/rosters/:lessonId/bookings', validate({ params: v.lessonParam, body: v.book }), ctrl.book);
router.delete('/rosters/:lessonId/bookings/:userId', validate({ params: v.lessonUserParam, body: v.cancelBooking }), ctrl.cancelBooking);
router.post('/rosters/:lessonId/walk-ins', validate({ params: v.lessonParam, body: v.walkIn }), ctrl.walkIn);
router.post('/rosters/:lessonId/waitlist', validate({ params: v.lessonParam, body: v.waitlist }), ctrl.waitlistAdd);
router.delete('/rosters/:lessonId/waitlist/:userId', validate({ params: v.lessonUserParam }), ctrl.waitlistRemove);
router.post('/rosters/:lessonId/waitlist/:userId/offer', validate({ params: v.lessonUserParam }), ctrl.waitlistOffer);
router.put('/rosters/:lessonId/attendance/:userId', validate({ params: v.lessonUserParam, body: v.attendance }), ctrl.setAttendance);
router.post('/rosters/:lessonId/submit', validate({ params: v.lessonParam, body: v.submit }), ctrl.submit);
router.get('/guests', ctrl.guests);

router.get('/followups', ctrl.followups);
router.post('/followups', ba, validate({ body: v.followupCreate }), ctrl.followupCreate);
router.patch('/followups/:id', ba, validate({ params: v.idParam, body: v.followupPatch }), ctrl.followupUpdate);
router.post('/followups/:id/attempts', validate({ params: v.idParam, body: v.attempt }), ctrl.followupAttempt);

router.get('/notifications', ctrl.notifications);
router.get('/notifications/audience', validate({ query: v.audienceQuery }), ctrl.audience);
router.post('/notifications/send', validate({ body: v.notify }), ctrl.notify);
module.exports = router;
