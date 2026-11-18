'use strict';
/* Office desk routes: rosters, guests, follow-ups, notifications and the small counts for the sidebar. Controllers only pass validated input to a service. */
const { asyncHandler, badRequest } = require('../utils/errors');
const deskService = require('../services/deskService');
const followupService = require('../services/followupService');
const notificationService = require('../services/notificationService');
const summaryService = require('../services/summaryService');
const clock = require('../utils/clock');

const h = fn => asyncHandler(async (req, res) => res.json(await fn(req)));
const u = req => req.user;
const MAX_RANGE_DAYS = 14;

module.exports = {
  summary: h(req => summaryService.summary(u(req))),
  today: h(req => deskService.today(u(req))),
  rosters: h(req => {
    const q = req.valid.query, from = q.from || q.date, to = q.to || from;
    if (to < from || clock.diffDays(from, to) > MAX_RANGE_DAYS) throw badRequest(`Choose a range of at most ${MAX_RANGE_DAYS + 1} days.`, 'INVALID_RANGE');
    return deskService.listClasses(u(req), { from, to, dojo: q.dojo });
  }),
  roster: h(req => deskService.roster(u(req), req.valid.params.lessonId)),
  book: h(req => deskService.book(u(req), req.valid.params.lessonId, req.valid.body)),
  cancelBooking: h(req => deskService.cancelBooking(u(req), req.valid.params.lessonId, req.valid.params.userId, req.valid.body)),
  walkIn: h(req => deskService.walkIn(u(req), req.valid.params.lessonId, req.valid.body)),
  waitlistAdd: h(req => deskService.waitlistAdd(u(req), req.valid.params.lessonId, req.valid.body)),
  waitlistRemove: h(req => deskService.waitlistRemove(u(req), req.valid.params.lessonId, req.valid.params.userId)),
  waitlistOffer: h(req => deskService.waitlistOffer(u(req), req.valid.params.lessonId, req.valid.params.userId)),
  setAttendance: h(req => deskService.setAttendance(u(req), req.valid.params.lessonId, req.valid.params.userId, req.valid.body)),
  submit: h(req => deskService.submit(u(req), req.valid.params.lessonId, req.valid.body)),
  guests: h(async () => ({ guests: await deskService.listGuests() })),
  followups: h(() => followupService.overview()),
  followupCreate: h(req => followupService.create(u(req), req.valid.body)),
  followupUpdate: h(req => followupService.update(u(req), req.valid.params.id, req.valid.body)),
  followupAttempt: h(req => followupService.addAttempt(u(req), req.valid.params.id, req.valid.body)),
  notifications: h(req => notificationService.overview(u(req))),
  audience: h(req => notificationService.preview(u(req), { type: req.valid.query.type, target: req.valid.query.target })),
  notify: h(req => notificationService.send(u(req), req.valid.body))
};
