'use strict';
/* office money, equipment, registrations, extensions and exceptions.
   Business Admin only: void or adjust a payment, decide a refund, decide an exception, unlock a day. */
const router = require('express').Router();
const ctrl = require('../../controllers/financeController');
const validate = require('../../middleware/validate');
const { requireAdminType } = require('../../middleware/roles');
const v = require('../../validators/admin');
const ba = requireAdminType('business');

router.get('/payments', validate({ query: v.paymentsQuery }), ctrl.payments);
router.post('/payments', validate({ body: v.takePayment }), ctrl.takePayment);
router.post('/payments/day/lock', validate({ body: v.lock }), ctrl.lockDay);
router.delete('/payments/day/lock/:date', ba, validate({ params: v.lockParam }), ctrl.unlockDay);
router.post('/payments/:id/collect', validate({ params: v.idParam }), ctrl.collect);
router.post('/payments/:id/void', ba, validate({ params: v.idParam, body: v.voidPayment }), ctrl.voidPayment);
router.post('/payments/:id/mistake', validate({ params: v.idParam, body: v.reason }), ctrl.mistake);
router.post('/refunds', validate({ body: v.refundRequest }), ctrl.refundRequest);
router.post('/refunds/:id/decision', ba, validate({ params: v.idParam, body: v.decision }), ctrl.refundDecision);

router.get('/equipment', validate({ query: v.equipmentQuery }), ctrl.equipment);
router.post('/equipment/:id/ready', validate({ params: v.idParam }), ctrl.equipmentReady);
router.post('/equipment/:id/handover', validate({ params: v.idParam, body: v.handover }), ctrl.equipmentHandover);

router.get('/applications', ctrl.applications);
router.get('/applications/:id', validate({ params: v.idParam }), ctrl.application);
router.patch('/applications/:id/checklist', validate({ params: v.idParam, body: v.checklist }), ctrl.checklist);
router.post('/applications/:id/activate', validate({ params: v.idParam, body: v.activate }), ctrl.activate);
router.post('/applications/:id/reject', validate({ params: v.idParam, body: v.reject }), ctrl.reject);
router.post('/applications/:id/request-info', validate({ params: v.idParam, body: v.requestInfo }), ctrl.requestInfo);
router.post('/registrations', validate({ body: v.deskRegistration }), ctrl.register);
router.post('/mc-requests/:id/decision', validate({ params: v.idParam, body: v.mcDecision }), ctrl.mcDecision);
router.post('/exceptions', validate({ body: v.exception }), ctrl.exceptionCreate);
router.post('/exceptions/:id/decision', ba, validate({ params: v.idParam, body: v.exceptionDecision }), ctrl.exceptionDecision);
module.exports = router;
