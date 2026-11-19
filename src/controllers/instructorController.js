'use strict';
/* Instructor routes: every call uses req.user.id (set by the auth middleware); no instructor id is ever read from the request. */
const { asyncHandler } = require('../utils/errors');
const instructorService = require('../services/instructorService');
const gradingService = require('../services/gradingService');

const h = fn => asyncHandler(async (req, res) => res.json(await fn(req)));
const u = req => req.user;
module.exports = {
  profile: h(req => instructorService.profile(u(req))),
  schedule: h(req => instructorService.schedule(u(req), req.valid.query)),
  roster: h(req => instructorService.roster(u(req), req.valid.params.lessonId)),
  mark: h(req => instructorService.mark(u(req), req.valid.params.lessonId, req.valid.params.userId, req.valid.body.status)),
  endClass: h(req => instructorService.endClass(u(req), req.valid.params.lessonId, req.valid.body)),
  remark: h(req => instructorService.remark(u(req), req.valid.params.lessonId, req.valid.body)),
  gradingNote: h(req => instructorService.gradingNote(u(req), req.valid.params.userId, req.valid.body)),
  students: h(req => instructorService.students(u(req))),
  grading: h(req => gradingService.myPanels(u(req))),
  candidates: h(req => gradingService.candidates(u(req), req.valid.params.id)),
  submitResult: h(req => gradingService.submitResult(u(req), req.valid.params.id, req.valid.params.userId, req.valid.body))
};
