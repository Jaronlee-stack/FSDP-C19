'use strict';
const { asyncHandler } = require('../utils/errors');
const referenceService = require('../services/referenceService');
const trialService = require('../services/trialService');
const registrationService = require('../services/registrationService');

const ref = fn => asyncHandler(async (req, res) => res.json(fn(await referenceService.reference(), req)));

module.exports = {
  dojos: ref(r => r.dojos),
  classes: ref((r, req) => (req.query.dojo ? [...r.timetable.hq, ...r.timetable.other].filter(t => t.dojo === String(req.query.dojo)) : [...r.timetable.hq, ...r.timetable.other])),
  packages: ref(r => ({ packages: r.packages, policies: r.policies })),
  sessions: asyncHandler(async (req, res) => res.json({ date: req.valid.query.date, sessions: await trialService.sessionsOn(req.valid.query.date) })),
  trialBooking: asyncHandler(async (req, res) => res.status(201).json(await trialService.book(req.valid.body))),
  register: asyncHandler(async (req, res) => res.status(201).json(await registrationService.register(req.valid.body)))
};
