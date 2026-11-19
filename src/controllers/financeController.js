'use strict';
/* Office money and registration routes: payments, refunds, equipment, registrations, extensions, exceptions. */
const { asyncHandler } = require('../utils/errors');
const paymentService = require('../services/paymentService');
const applicationService = require('../services/applicationService');
const mcService = require('../services/mcService');
const exceptionService = require('../services/exceptionService');

const h = fn => asyncHandler(async (req, res) => res.json(await fn(req)));
const u = req => req.user;

module.exports = {
  payments: h(req => paymentService.overview(u(req), req.valid.query)),
  takePayment: h(req => paymentService.takePayment(u(req), req.valid.body)),
  collect: h(req => paymentService.collect(u(req), req.valid.params.id)),
  voidPayment: h(req => paymentService.voidOrAdjust(u(req), req.valid.params.id, req.valid.body)),
  mistake: h(req => paymentService.reportMistake(u(req), req.valid.params.id, req.valid.body)),
  lockDay: h(req => paymentService.lockDay(u(req), req.valid.body)),
  unlockDay: h(req => paymentService.unlockDay(u(req), req.valid.params.date)),
  refundRequest: h(req => paymentService.requestRefund(u(req), req.valid.body)),
  refundDecision: h(req => paymentService.decideRefund(u(req), req.valid.params.id, req.valid.body)),
  equipment: h(req => paymentService.listEquipment(req.valid.query.q)),
  equipmentReady: h(req => paymentService.markReady(u(req), req.valid.params.id)),
  equipmentHandover: h(req => paymentService.handOver(u(req), req.valid.params.id, req.valid.body)),
  applications: h(req => applicationService.list(u(req))),
  application: h(req => applicationService.detail(req.valid.params.id)),
  checklist: h(req => applicationService.setChecklist(u(req), req.valid.params.id, req.valid.body)),
  activate: h(req => applicationService.activate(u(req), req.valid.params.id, req.valid.body)),
  reject: h(req => applicationService.reject(u(req), req.valid.params.id, req.valid.body)),
  requestInfo: h(req => applicationService.requestInfo(u(req), req.valid.params.id, req.valid.body)),
  register: asyncHandler(async (req, res) => res.status(201).json(await applicationService.registerAtDesk(u(req), req.valid.body))),
  mcDecision: h(req => mcService.decide(u(req), req.valid.params.id, req.valid.body)),
  exceptionCreate: asyncHandler(async (req, res) => res.status(201).json(await exceptionService.create(u(req), req.valid.body))),
  exceptionDecision: h(req => exceptionService.decide(u(req), req.valid.params.id, req.valid.body))
};
