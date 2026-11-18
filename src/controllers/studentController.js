'use strict';
/* Student routes: every call uses req.user.id (set by the auth middleware); no student id is ever read from the request. */
const { asyncHandler } = require('../utils/errors');
const studentService = require('../services/studentService');
const packageService = require('../services/packageService');
const bookingService = require('../services/bookingService');
const gradingService = require('../services/gradingService');
const checkinService = require('../services/checkinService');

const h = fn => asyncHandler(async (req, res) => res.json(await fn(req)));
const created = fn => asyncHandler(async (req, res) => res.status(201).json(await fn(req)));
const u = req => req.user;

module.exports = {
  home: h(req => studentService.home(u(req))),
  profile: h(req => studentService.profile(u(req))),
  updateProfile: h(req => studentService.updateProfile(u(req), req.valid.body)),
  packages: h(req => packageService.overview(u(req))),
  buyPackage: created(req => packageService.buy(u(req), req.valid.body)),
  requestExtension: created(req => packageService.requestExtension(u(req), req.valid.params.id, req.valid.body)),
  withdrawExtension: h(req => packageService.withdrawExtension(u(req), req.valid.params.id)),
  timetable: h(req => bookingService.timetable(u(req), req.valid.query.weekStart)),
  book: created(req => bookingService.book(u(req), req.valid.body.lessonId)),
  cancel: h(req => bookingService.cancel(u(req), req.valid.params.lessonId)),
  bookings: h(req => studentService.upcoming(u(req))),
  checkIn: h(req => checkinService.scan(u(req), req.valid.body.qr)),
  attendance: h(req => studentService.attendance(u(req), req.valid.query.limit)),
  payments: h(req => studentService.payments(u(req))),
  payment: h(req => studentService.payment(u(req), req.valid.params.id)),
  grading: h(req => gradingService.overview(u(req))),
  applyGrading: created(req => gradingService.apply(u(req), req.valid.body)),
  withdrawGrading: h(req => gradingService.withdraw(u(req), req.valid.params.id)),
  feedback: created(req => studentService.rate(u(req), req.valid.body))
};
